"use client";

import { useEffect, useRef, useState } from "react";
import { CharacterAvatar } from "./CharacterAvatar";
import { MicControl } from "./MicControl";
import { useMouthAnimation } from "@/lib/useMouthAnimation";
import { apiHeaders } from "@/lib/apiAuth";

// ── Script ────────────────────────────────────────────────────────────────────
// text: the line to speak
// pause: optional ms to wait AFTER this line before the next (overrides default)
const DEMO_SCRIPT: { text: string; pause?: number }[] = [
  { text: "Speaking another language out loud can feel terrifying.", pause: 600 },
  { text: "You open your mouth, your brain disappears, and suddenly all you can say is:" },
  { text: "Ich bin ein Apfel.", pause: 600 },
  { text: "Not quite lunch-ordering material.", pause: 600 },
  { text: "Hallo. I'm Quatschi." },
  { text: "I'm a voice-first language practice buddy for German, English, and Spanish — here to help you speak before you feel ready.", pause: 600 },
  { text: "I listen and reply in real time using ElevenLabs Speech Engine.", pause: 400 },
  { text: "We can chat in two modes.", pause: 300 },
  { text: "Chat mode, for free conversation on any topic. Your day, your hobbies, your very brave relationship with grammar." },
  { text: "Echo mode, for shadowing. I say one sentence, you repeat it back, and we practice pronunciation together.", pause: 400 },
  { text: "If you make a mistake, I model the natural version and keep the conversation moving.", pause: 400 },
  { text: "Just tap the mic. Say the sentence. Make the mistake.", pause: 300 },
  { text: "No judgment.", pause: 200 },
  { text: "Just me." },
  { text: "Quatschi!" },
];

const PAUSE_BETWEEN_MS = 0; // default gap between lines (override per-line with pause:)

// ── Helpers ───────────────────────────────────────────────────────────────────
function base64ToBlob(b64: string, mime = "audio/mpeg"): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ── Component ─────────────────────────────────────────────────────────────────
export function DemoMode() {
  const [started, setStarted] = useState(false);
  const [lineIndex, setLineIndex] = useState(-1);
  const [text, setText] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [excitement, setExcitement] = useState(0);

  const { mouthOpenness, onBoundary, reset: resetMouth } = useMouthAnimation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Pre-fetched audio cache: index → { audioBase64, wordTimings }
  const prefetchCache = useRef<Map<number, { audioBase64: string; wordTimings: { word: string; startMs: number }[] }>>(new Map());

  async function prefetchLine(index: number) {
    if (index >= DEMO_SCRIPT.length) return;
    if (prefetchCache.current.has(index)) return;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ text: DEMO_SCRIPT[index].text, lang: "de" }),
      });
      if (!res.ok) return;
      const data = await res.json() as { audioBase64: string; wordTimings: { word: string; startMs: number }[] };
      prefetchCache.current.set(index, data);
    } catch { /* silent */ }
  }

  // Clear all pending timers
  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  // Play one line
  async function playLine(index: number) {
    if (index >= DEMO_SCRIPT.length || !DEMO_SCRIPT[index]) {
      // Finished — reset to idle
      setText("");
      setIsSpeaking(false);
      setExcitement(0);
      resetMouth();
      return;
    }

    const { text: line, pause } = DEMO_SCRIPT[index];
    setText(line);
    setIsSpeaking(true);
    setExcitement(0.6);

    try {
      // Use prefetched audio if available, otherwise fetch now
      let cached = prefetchCache.current.get(index);
      if (!cached) {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: apiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ text: line, lang: "de" }),
        });
        if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
        cached = await res.json() as { audioBase64: string; wordTimings: { word: string; startMs: number }[] };
      }
      const { audioBase64, wordTimings } = cached;

      // Pre-fetch next two lines in the background
      void prefetchLine(index + 1);
      void prefetchLine(index + 2);

      const blob = base64ToBlob(audioBase64);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      // Schedule word boundary callbacks for mouth animation
      audio.addEventListener("play", () => {
        clearTimers();
        for (const { word, startMs } of wordTimings) {
          const t = setTimeout(() => onBoundary(word), startMs);
          timersRef.current.push(t);
        }
      });

      audio.onended = () => {
        URL.revokeObjectURL(url);
        resetMouth();
        setExcitement(0);
        const t = setTimeout(() => setLineIndex(index + 1), pause ?? PAUSE_BETWEEN_MS);
        timersRef.current.push(t);
      };

      await audio.play();
    } catch (err) {
      console.error("[DemoMode] TTS error:", err);
      // Skip to next line on error
      const t = setTimeout(() => setLineIndex(index + 1), 1000);
      timersRef.current.push(t);
    }
  }

  // Advance when lineIndex changes
  useEffect(() => {
    if (lineIndex < 0) return;
    void playLine(lineIndex);
    return () => {
      clearTimers();
      audioRef.current?.pause();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineIndex]);

  function handleStart() {
    setStarted(true);
    // Pre-fetch first two lines immediately on start
    void prefetchLine(0);
    void prefetchLine(1);
    setLineIndex(0);
  }

  const emotion = isSpeaking ? "happy" : "happy";

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#161d2f]">
      {/* Blob character — full screen */}
      <CharacterAvatar
        variant="dome"
        mouthOpenness={mouthOpenness}
        emotion={emotion}
        excitement={excitement}
      />

      {/* Text + controls overlay */}
      <div className="relative z-10 flex h-dvh flex-col">
        {/* Text area */}
        <div className="flex flex-1 flex-col items-center justify-start overflow-y-auto pt-[35dvh] pb-4 px-6 text-center">
          {text && (
            <p className="max-w-sm text-[32px] leading-snug text-zinc-900 font-[family-name:var(--font-special-gothic)]">
              {text}
            </p>
          )}
        </div>

        {/* Controls */}
        <MicControl
          status={isSpeaking ? "speaking" : "idle"}
          micSupported={true}
          onMicPress={() => {}}
          mode="conversation"
          onModeToggle={() => {}}
          onClose={() => {}}
        />
      </div>

      {/* Start button — shown before demo begins */}
      {!started && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <button
            type="button"
            onClick={handleStart}
            className="rounded-[27px] bg-[#161d2f] px-8 py-4 text-[20px] text-white hover:bg-[#1e2740] active:bg-[#0e1320] transition-colors"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Start Demo
          </button>
        </div>
      )}
    </div>
  );
}
