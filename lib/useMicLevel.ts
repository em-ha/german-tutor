"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Measures live microphone loudness as a smoothed 0–1 value.
 *
 * SpeechRecognition does not expose audio amplitude, so we open our own
 * getUserMedia stream and read RMS off an AnalyserNode. Fast attack / slow
 * decay gives a natural "excitement" envelope: it peaks when lots is being
 * said and eases back down (not instantly) during pauses.
 *
 * The AudioContext is created once and reused across start/stop (recreating it
 * outside a user gesture can leave it suspended), and is only closed on unmount.
 */
export function useMicLevel() {
  const [level, setLevel] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedRef = useRef(0);
  const lastSetRef = useRef(0);

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    smoothedRef.current = 0;
    lastSetRef.current = 0;
    setLevel(0);
    // Keep ctxRef alive for reuse — only closed on unmount.
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current || rafRef.current) return; // already running
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        const Ctor =
          window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) {
          stop();
          return;
        }
        ctx = new Ctor();
        ctxRef.current = ctx;
      }
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          /* best effort */
        }
      }

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.fftSize);

      const tick = () => {
        const a = analyserRef.current;
        if (!a) return;
        a.getByteTimeDomainData(data);

        // RMS around the 128 midpoint → ~0..1
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);

        // Subtract a small noise floor, then scale: speech RMS is roughly 0.05–0.3
        const norm = Math.min(1, Math.max(0, (rms - 0.01) * 5));

        // Fast attack, slow decay
        const prev = smoothedRef.current;
        const next = norm > prev ? prev + (norm - prev) * 0.5 : prev + (norm - prev) * 0.08;
        smoothedRef.current = next;

        // Only re-render on meaningful change to cut React churn
        if (Math.abs(next - lastSetRef.current) > 0.015) {
          lastSetRef.current = next;
          setLevel(next);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // Mic unavailable / denied — leave level at 0
      streamRef.current = null;
    }
  }, [stop]);

  useEffect(() => {
    return () => {
      stop();
      if (ctxRef.current && ctxRef.current.state !== "closed") {
        void ctxRef.current.close();
      }
      ctxRef.current = null;
    };
  }, [stop]);

  return { level, start, stop };
}
