"use client";

import { useCallback, useRef } from "react";
import {
  GEMINI_OUTPUT_RATE,
  base64ToBytes,
  bytesToInt16,
  int16ToFloat32,
  normaliseLevel,
  resample,
} from "./pcm";

/**
 * Owns the entire browser audio graph for a Gemini Live conversation:
 * exactly ONE AudioContext and ONE getUserMedia stream.
 *
 * The "exactly one" part is not incidental. lib/useMicLevel.ts documents (and
 * this replaces) the reason: a second concurrent getUserMedia stream breaks
 * audio on Android Chrome and iOS Safari. So the capture worklet is the single
 * consumer of the mic, and it hands out its RMS to whoever needs it — which is
 * how getInputVolume() survives the move off ElevenLabs.
 *
 * Levels are exposed as refs, not state, so the existing requestAnimationFrame
 * loops in SpeakingPartner.tsx can poll them without triggering React renders.
 */

const MIC_WORKLET_URL = "/worklets/mic-capture.worklet.js";
const PLAYER_WORKLET_URL = "/worklets/pcm-player.worklet.js";

export interface AudioIOCallbacks {
  /** Fires per ~30 ms chunk of 16 kHz mono PCM, ready to send to Gemini. */
  onAudioChunk?: (pcm: Int16Array) => void;
  /** Fires when playback starts or fully drains — drives speaking/listening. */
  onSpeakingChange?: (speaking: boolean) => void;
}

export function useAudioIO(callbacks: AudioIOCallbacks = {}) {
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micNodeRef = useRef<AudioWorkletNode | null>(null);
  const playerNodeRef = useRef<AudioWorkletNode | null>(null);
  const sinkRef = useRef<GainNode | null>(null);

  const micLevelRef = useRef(0);
  const outputLevelRef = useRef(0);
  const isPlayingRef = useRef(false);

  // Keep callbacks in a ref so the worklet handlers never go stale and we don't
  // have to tear down the audio graph just because a callback identity changed.
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  const start = useCallback(async () => {
    if (ctxRef.current) return; // already running

    // Must be created inside the user gesture or iOS leaves it suspended.
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    await Promise.all([
      ctx.audioWorklet.addModule(MIC_WORKLET_URL),
      ctx.audioWorklet.addModule(PLAYER_WORKLET_URL),
    ]);

    // These three flags are the only defence against Quatschi hearing herself
    // through the speaker. ElevenLabs' WebRTC stack handled this for us; with
    // raw Web Audio it is on us, and browser AEC is inconsistent with
    // AudioContext output (especially iOS Safari). If echo still leaks through,
    // the fallback is half-duplex gating — at the cost of barge-in.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    streamRef.current = stream;

    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;

    const micNode = new AudioWorkletNode(ctx, "mic-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
    });
    micNode.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;
      if (data.type === "audio") {
        micLevelRef.current = normaliseLevel(data.level);
        cbRef.current.onAudioChunk?.(data.pcm as Int16Array);
      } else if (data.type === "level") {
        micLevelRef.current = normaliseLevel(data.level);
      }
    };
    micNodeRef.current = micNode;

    const playerNode = new AudioWorkletNode(ctx, "pcm-player", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    playerNode.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;
      if (data.type === "level") {
        outputLevelRef.current = normaliseLevel(data.level);
      } else if (data.type === "started") {
        isPlayingRef.current = true;
        cbRef.current.onSpeakingChange?.(true);
      } else if (data.type === "drained") {
        isPlayingRef.current = false;
        outputLevelRef.current = 0;
        cbRef.current.onSpeakingChange?.(false);
      }
    };
    playerNodeRef.current = playerNode;

    // The capture worklet never writes to its output, so it emits silence —
    // but routing it through a muted gain node into the destination guarantees
    // the graph actually pulls it, across browsers, with zero risk of feedback.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    sinkRef.current = sink;

    source.connect(micNode);
    micNode.connect(sink);
    sink.connect(ctx.destination);

    playerNode.connect(ctx.destination);
  }, []);

  const stop = useCallback(() => {
    micNodeRef.current?.port.close();
    playerNodeRef.current?.port.close();
    sourceRef.current?.disconnect();
    micNodeRef.current?.disconnect();
    playerNodeRef.current?.disconnect();
    sinkRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    const ctx = ctxRef.current;
    if (ctx && ctx.state !== "closed") void ctx.close();

    ctxRef.current = null;
    streamRef.current = null;
    sourceRef.current = null;
    micNodeRef.current = null;
    playerNodeRef.current = null;
    sinkRef.current = null;

    micLevelRef.current = 0;
    outputLevelRef.current = 0;
    isPlayingRef.current = false;
  }, []);

  /**
   * Queue PCM for playback, resampled to the context rate.
   *
   * `sourceRate` defaults to Gemini's 24 kHz output. It is overridable so the
   * same path can play back 16 kHz mic capture during loopback testing.
   */
  const enqueue = useCallback(
    (audio: string | Uint8Array | Int16Array, sourceRate = GEMINI_OUTPUT_RATE) => {
      const ctx = ctxRef.current;
      const node = playerNodeRef.current;
      if (!ctx || !node) return;

      let pcm: Int16Array;
      if (typeof audio === "string") pcm = bytesToInt16(base64ToBytes(audio));
      else if (audio instanceof Int16Array) pcm = audio;
      else pcm = bytesToInt16(audio);

      const samples = resample(int16ToFloat32(pcm), sourceRate, ctx.sampleRate);
      node.port.postMessage({ type: "push", samples }, [samples.buffer]);
    },
    []
  );

  /** Flush queued audio immediately — the barge-in path. */
  const clearPlayback = useCallback(() => {
    playerNodeRef.current?.port.postMessage({ type: "clear" });
    outputLevelRef.current = 0;
    isPlayingRef.current = false;
  }, []);

  /** Stop sending mic audio without tearing the session down (sleep timer). */
  const setMicMuted = useCallback((muted: boolean) => {
    micNodeRef.current?.port.postMessage({ type: "mute", value: muted });
    if (muted) micLevelRef.current = 0;
  }, []);

  /** Drop-in replacement for ElevenLabs' conversation.getInputVolume(). */
  const getInputVolume = useCallback(() => micLevelRef.current, []);
  const getOutputVolume = useCallback(() => outputLevelRef.current, []);

  return {
    start,
    stop,
    enqueue,
    clearPlayback,
    setMicMuted,
    getInputVolume,
    getOutputVolume,
    micLevelRef,
    outputLevelRef,
    isPlayingRef,
    isRunning: () => ctxRef.current !== null,
  };
}
