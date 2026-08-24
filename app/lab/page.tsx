"use client";

/**
 * THROWAWAY spike harness — delete before shipping (Stage 9).
 *
 * Stage 2 verification: exercises the browser audio layer end to end with no
 * Gemini involved, so capture/resampling/playback bugs are isolated from
 * session-protocol bugs.
 *
 * Records rather than live-looping on purpose: piping the mic straight to the
 * speaker would just measure acoustic feedback, which is a different (and
 * later) question than "does capture work".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioIO } from "@/lib/gemini/useAudioIO";
import { GEMINI_INPUT_RATE } from "@/lib/gemini/pcm";

const RECORD_MS = 3000;

export default function LabPage() {
  const [running, setRunning] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [outLevel, setOutLevel] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);
  const [recordedMs, setRecordedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recordingRef = useRef(false);
  const capturedRef = useRef<Int16Array[]>([]);
  const rafRef = useRef<number | null>(null);

  const audio = useAudioIO({
    onAudioChunk: (pcm) => {
      if (!recordingRef.current) return;
      // The worklet transfers its buffer, so this is already ours to keep.
      capturedRef.current.push(pcm);
    },
    onSpeakingChange: setSpeaking,
  });

  // Poll the level refs at animation rate, exactly as SpeakingPartner does.
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      setMicLevel(audio.micLevelRef.current);
      setOutLevel(audio.outputLevelRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, audio.micLevelRef, audio.outputLevelRef]);

  const handleStart = useCallback(async () => {
    setError(null);
    try {
      await audio.start();
      setRunning(true);
    } catch (err) {
      setError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    }
  }, [audio]);

  const handleStop = useCallback(() => {
    audio.stop();
    setRunning(false);
    setSpeaking(false);
    setMicLevel(0);
    setOutLevel(0);
  }, [audio]);

  const handleRecord = useCallback(() => {
    capturedRef.current = [];
    setChunkCount(0);
    setRecordedMs(0);
    recordingRef.current = true;
    setRecording(true);
    setTimeout(() => {
      recordingRef.current = false;
      setRecording(false);
      const chunks = capturedRef.current;
      const samples = chunks.reduce((n, c) => n + c.length, 0);
      setChunkCount(chunks.length);
      setRecordedMs(Math.round((samples / GEMINI_INPUT_RATE) * 1000));
    }, RECORD_MS);
  }, []);

  const handlePlayback = useCallback(() => {
    const chunks = capturedRef.current;
    if (chunks.length === 0) return;
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Int16Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    // Mic capture is 16 kHz, not Gemini's 24 kHz output rate.
    audio.enqueue(merged, GEMINI_INPUT_RATE);
  }, [audio]);

  return (
    <main className="mx-auto max-w-xl space-y-6 p-8 font-mono text-sm">
      <div>
        <h1 className="text-lg font-bold">Audio layer loopback</h1>
        <p className="text-neutral-500">Stage 2 spike — no Gemini involved.</p>
      </div>

      {error && (
        <p className="rounded bg-red-100 p-3 text-red-900" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={running ? handleStop : handleStart}
          className="rounded bg-neutral-900 px-4 py-2 text-white"
        >
          {running ? "Stop audio" : "Start audio"}
        </button>
        <button
          onClick={handleRecord}
          disabled={!running || recording}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-40"
        >
          {recording ? "Recording…" : `Record ${RECORD_MS / 1000}s`}
        </button>
        <button
          onClick={handlePlayback}
          disabled={!running || recording || chunkCount === 0}
          className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-40"
        >
          Play back
        </button>
        <button
          onClick={audio.clearPlayback}
          disabled={!running}
          className="rounded bg-amber-600 px-4 py-2 text-white disabled:opacity-40"
        >
          Clear (barge-in)
        </button>
      </div>

      <Meter label="mic level" value={micLevel} colour="bg-blue-500" />
      <Meter label="output level" value={outLevel} colour="bg-green-500" />

      <dl className="space-y-1 text-neutral-700">
        <Row k="running" v={String(running)} />
        <Row k="speaking (from drained event)" v={String(speaking)} />
        <Row k="captured chunks" v={String(chunkCount)} />
        <Row k="captured duration" v={`${recordedMs} ms (expect ~${RECORD_MS})`} />
      </dl>

      <details className="text-neutral-600">
        <summary className="cursor-pointer">What to check</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Mic level responds when you speak, sits near zero when silent.</li>
          <li>Captured duration is close to {RECORD_MS} ms — if far off, the
            resampler ratio is wrong.</li>
          <li>Playback sounds like you, not chipmunked or slowed — that would
            mean a sample-rate mismatch.</li>
          <li>No clicks between chunks — that would mean the resampler is
            losing continuity across process() blocks.</li>
          <li>Output level tracks the playback, then &ldquo;speaking&rdquo; flips false
            shortly after audio ends.</li>
          <li>Clear stops playback instantly and flips speaking false.</li>
        </ul>
      </details>
    </main>
  );
}

function Meter({ label, value, colour }: { label: string; value: number; colour: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-neutral-600">
        <span>{label}</span>
        <span>{value.toFixed(3)}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded bg-neutral-200">
        <div
          className={`h-full ${colour} transition-[width] duration-75`}
          style={{ width: `${Math.min(100, value * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt>{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}
