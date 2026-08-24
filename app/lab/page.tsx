"use client";

/**
 * THROWAWAY spike harness — delete before shipping (Stage 9).
 *
 * Stage 0 spikes S0.3 (echo mode + pronunciation) and S0.5 (audio loop + echo
 * cancellation) — the two that need a human ear and real hardware, so they
 * could not be scripted like S0.1/S0.2/S0.4/S0.6/S0.7.
 *
 * Connects for real to gemini-3.1-flash-live-preview (chosen via S0.2) through
 * /api/live-token, streams the mic in, plays Quatschi back, and surfaces both
 * transcripts live so pronunciation/STT fidelity can be judged by ear against
 * what was actually said. This is intentionally NOT the production
 * useGeminiLive hook (Stage 3) — no sleep timer, no reconnect classification,
 * no mirrored useConversation surface. Just enough to answer the two open
 * questions.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import { useAudioIO } from "@/lib/gemini/useAudioIO";
import { GEMINI_INPUT_RATE, bytesToBase64 } from "@/lib/gemini/pcm";

type Mode = "conversation" | "shadowing";
type Turn = { role: "user" | "model"; text: string };

export default function LabPage() {
  const [mode, setMode] = useState<Mode>("conversation");
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [speaking, setSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [outLevel, setOutLevel] = useState(0);
  const [interruptedCount, setInterruptedCount] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const userBufRef = useRef("");
  const modelBufRef = useRef("");
  const rafRef = useRef<number | null>(null);

  const audio = useAudioIO({
    onAudioChunk: (pcm) => {
      const session = sessionRef.current;
      if (!session) return;
      const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      session.sendRealtimeInput({
        audio: { data: bytesToBase64(bytes), mimeType: `audio/pcm;rate=${GEMINI_INPUT_RATE}` },
      });
    },
    onSpeakingChange: setSpeaking,
  });

  useEffect(() => {
    if (status !== "connected") return;
    const tick = () => {
      setMicLevel(audio.micLevelRef.current);
      setOutLevel(audio.outputLevelRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [status, audio.micLevelRef, audio.outputLevelRef]);

  const flushUser = useCallback(() => {
    if (userBufRef.current.trim()) {
      setTurns((t) => [...t, { role: "user", text: userBufRef.current.trim() }]);
    }
    userBufRef.current = "";
  }, []);

  const flushModel = useCallback(() => {
    if (modelBufRef.current.trim()) {
      setTurns((t) => [...t, { role: "model", text: modelBufRef.current.trim() }]);
    }
    modelBufRef.current = "";
  }, []);

  const handleMessage = useCallback(
    (msg: LiveServerMessage) => {
      if (msg.serverContent?.interrupted) {
        audio.clearPlayback();
        setInterruptedCount((n) => n + 1);
        modelBufRef.current = "";
      }

      const audioData = msg.data; // concatenated inline-data parts, base64 PCM
      if (audioData) audio.enqueue(audioData);

      const inputText = msg.serverContent?.inputTranscription?.text;
      if (inputText) userBufRef.current += inputText;

      const outputText = msg.serverContent?.outputTranscription?.text;
      if (outputText) modelBufRef.current += outputText;

      if (msg.serverContent?.turnComplete) {
        flushUser();
        flushModel();
      }
    },
    [audio, flushUser, flushModel]
  );

  const connect = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    setTurns([]);
    setInterruptedCount(0);
    try {
      await audio.start();

      const res = await fetch(`/api/live-token?mode=${mode}&level=B1`);
      if (!res.ok) throw new Error(`token route returned ${res.status}`);
      const { token, model } = (await res.json()) as { token: string; model: string };

      // Required for ephemeral-token auth — confirmed via the S0.1 spike, not
      // documented in the guides.
      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } });

      const session = await ai.live.connect({
        model,
        config: { responseModalities: [Modality.AUDIO] }, // rest is locked into the token
        callbacks: {
          onopen: () => {
            setStatus("connected");
            audio.setMicMuted(false);
            // Echo mode needs a kickoff — Quatschi speaks first and there is
            // no scripted opening line here (that's a Stage 3 concern).
            if (mode === "shadowing") {
              session.sendClientContent({ turns: "Fang an.", turnComplete: true });
            }
          },
          onmessage: handleMessage,
          onerror: (e) => {
            setError(e.message || "connection error");
            setStatus("error");
          },
          onclose: (e) => {
            setStatus("idle");
            audio.setMicMuted(true);
            if (e.code !== 1000) setError(`closed unexpectedly: ${e.code} ${e.reason}`);
          },
        },
      });
      sessionRef.current = session;
    } catch (err) {
      setError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      setStatus("error");
      audio.stop();
    }
  }, [audio, mode, handleMessage]);

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    audio.stop();
    setStatus("idle");
    setSpeaking(false);
  }, [audio]);

  useEffect(() => () => disconnect(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8 font-mono text-sm">
      <div>
        <h1 className="text-lg font-bold">Gemini Live spike — S0.3 / S0.5</h1>
        <p className="text-neutral-500">
          Real connection to gemini-3.1-flash-live-preview. Wear headphones for
          the first pass to isolate pronunciation grading from acoustic echo.
        </p>
      </div>

      {error && (
        <p className="rounded bg-red-100 p-3 text-red-900" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span>mode:</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            disabled={status !== "idle"}
            className="rounded border border-neutral-300 px-2 py-1"
          >
            <option value="conversation">conversation</option>
            <option value="shadowing">echo (shadowing)</option>
          </select>
        </label>
        <button
          onClick={status === "connected" || status === "connecting" ? disconnect : connect}
          disabled={status === "connecting"}
          className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-40"
        >
          {status === "connected" ? "Disconnect" : status === "connecting" ? "Connecting…" : "Connect"}
        </button>
        {mode === "shadowing" && status === "connected" && (
          <button
            onClick={() =>
              sessionRef.current?.sendClientContent({ turns: "Nächster Satz, bitte.", turnComplete: true })
            }
            className="rounded bg-purple-700 px-4 py-2 text-white"
          >
            Next sentence
          </button>
        )}
      </div>

      <Meter label="mic level" value={micLevel} colour="bg-blue-500" />
      <Meter label="output level" value={outLevel} colour="bg-green-500" />

      <dl className="space-y-1 text-neutral-700">
        <Row k="status" v={status} />
        <Row k="speaking" v={String(speaking)} />
        <Row k="interruptions" v={String(interruptedCount)} />
      </dl>

      <div>
        <h2 className="mb-2 font-semibold">Live transcript (input vs output)</h2>
        <div className="max-h-96 space-y-2 overflow-y-auto rounded border border-neutral-200 p-3">
          {turns.length === 0 && <p className="text-neutral-400">No turns yet.</p>}
          {turns.map((t, i) => (
            <p key={i} className={t.role === "user" ? "text-blue-700" : "text-green-800"}>
              <span className="font-semibold">{t.role === "user" ? "You (STT): " : "Quatschi: "}</span>
              {t.text}
            </p>
          ))}
        </div>
      </div>

      <details className="text-neutral-600">
        <summary className="cursor-pointer">S0.3 — what to check (echo mode)</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Switch mode to &ldquo;echo&rdquo; and connect. Quatschi should say one short
            sentence, then wait.</li>
          <li>Repeat it back deliberately mispronouncing one word. Does the
            &ldquo;You (STT):&rdquo; line show what you actually said, or does it look
            silently corrected to the target sentence?</li>
          <li>Does Quatschi&apos;s reaction suggest it graded your *pronunciation*, or
            just whether the transcribed text was close enough (today&apos;s
            weaker mechanism)?</li>
          <li>Repeat a sentence slowly with a mid-sentence pause. Does it cut you
            off and respond before you finish?</li>
        </ul>
      </details>

      <details className="text-neutral-600">
        <summary className="cursor-pointer">S0.5 — what to check (echo cancellation)</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Switch mode to &ldquo;conversation&rdquo;, connect on a real phone, speakers on
            (not headphones) — this is the actual failure condition.</li>
          <li>Let Quatschi speak a full sentence without touching the mic. Does
            the &ldquo;interruptions&rdquo; counter increase on its own? If so, Quatschi is
            hearing herself.</li>
          <li>Try interrupting her deliberately mid-sentence — barge-in should
            feel instant, and output level should drop to zero immediately.</li>
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
