"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSynthesisSupported } from "./clientCapabilities";

const LANG = "de-DE";

/** Rough syllable count for German words — used to time mouth animation */
function countSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-zäöüy]/g, "");
  const groups = cleaned.match(/[aeiouäöüy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

/**
 * Schedule synthetic onBoundary events timed to approximate word durations.
 * Used with ElevenLabs since it doesn't provide word boundary events.
 */
function scheduleWordBoundaries(
  text: string,
  onBoundary: (word: string) => void,
  totalDurationMs: number
): ReturnType<typeof setTimeout>[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  // Estimate each word's proportion of total speech time by syllable count
  const syllables = words.map(countSyllables);
  const totalSyllables = syllables.reduce((a, b) => a + b, 0);

  const timers: ReturnType<typeof setTimeout>[] = [];
  let elapsed = 0;

  words.forEach((word, i) => {
    const wordDuration = (syllables[i] / totalSyllables) * totalDurationMs;
    const delay = elapsed;
    timers.push(
      setTimeout(() => onBoundary(word), delay)
    );
    elapsed += wordDuration;
  });

  return timers;
}

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [playbackLevel, setPlaybackLevel] = useState(0);
  const supported = useSynthesisSupported();
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const boundaryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playbackRafRef = useRef<number | null>(null);

  const cancelBoundaryTimers = useCallback(() => {
    boundaryTimersRef.current.forEach(clearTimeout);
    boundaryTimersRef.current = [];
  }, []);

  const stopPlaybackAnalyser = useCallback(() => {
    if (playbackRafRef.current) {
      cancelAnimationFrame(playbackRafRef.current);
      playbackRafRef.current = null;
    }
    setPlaybackLevel(0);
  }, []);

  const cancelAudio = useCallback(() => {
    cancelBoundaryTimers();
    stopPlaybackAnalyser();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, [cancelBoundaryTimers, stopPlaybackAnalyser]);

  const cancel = useCallback(() => {
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    cancelAudio();
    setIsSpeaking(false);
  }, [cancelAudio]);

  /** Speak via ElevenLabs API route. Returns false if it fails (caller should fallback). */
  const speakElevenLabs = useCallback(
    async (
      text: string,
      onEnd?: () => void,
      onBoundary?: (word: string) => void
    ): Promise<boolean> => {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!res.ok) {
          const errBody = await res.text();
          console.error("[ElevenLabs] API error", res.status, errBody);
          return false;
        }

        const data = await res.json() as {
          audioBase64?: string;
          wordTimings?: { word: string; startMs: number }[];
        };

        if (!data.audioBase64) return false;

        // Decode base64 audio to a blob URL
        const binary = atob(data.audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;

        const finish = () => {
          cancelBoundaryTimers();
          setIsSpeaking(false);
          cancelAudio();
          onEnd?.();
        };

        audio.onended = finish;
        audio.onerror = finish;

        // Schedule precise word boundaries from ElevenLabs alignment data
        if (onBoundary && data.wordTimings?.length) {
          const timers = data.wordTimings.map(({ word, startMs }) =>
            setTimeout(() => onBoundary(word), startMs)
          );
          boundaryTimersRef.current = timers;
        }

        // Connect audio element to Web Audio analyser for amplitude-reactive excitement.
        // createMediaElementSource taps the output pipeline — no getUserMedia, no mic conflict.
        try {
          let ctx = audioCtxRef.current;
          if (!ctx || ctx.state === "closed") {
            ctx = new AudioContext();
            audioCtxRef.current = ctx;
          }
          if (ctx.state === "suspended") await ctx.resume().catch(() => {});

          const source = ctx.createMediaElementSource(audio);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.5;
          source.connect(analyser);
          source.connect(ctx.destination); // must route to speakers

          const data = new Uint8Array(analyser.fftSize);
          let smoothed = 0;
          const tick = () => {
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) {
              const v = (data[i] - 128) / 128;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / data.length);
            const norm = Math.min(1, Math.max(0, (rms - 0.01) * 5));
            smoothed = norm > smoothed
              ? smoothed + (norm - smoothed) * 0.5
              : smoothed + (norm - smoothed) * 0.1;
            setPlaybackLevel(smoothed);
            playbackRafRef.current = requestAnimationFrame(tick);
          };
          playbackRafRef.current = requestAnimationFrame(tick);
        } catch {
          // Web Audio not available — excitement stays at 0, audio still plays fine
        }

        setIsSpeaking(true);
        try {
          await audio.play();
        } catch (err) {
          // NotAllowedError = autoplay blocked (no user gesture yet).
          // Clean up the audio but return true so the caller doesn't fall
          // through to speakBrowser — the text is already fully streamed,
          // the user can tap the mic manually as their first interaction.
          if (err instanceof DOMException && err.name === "NotAllowedError") {
            cancelAudio();
            setIsSpeaking(false);
            return true; // handled — don't trigger speakBrowser or onEnd
          }
          throw err; // re-throw unexpected errors
        }
        return true;
      } catch (err) {
        console.error("[ElevenLabs] Unexpected error:", err);
        return false;
      }
    },
    [cancelAudio, cancelBoundaryTimers]
  );

  /** Speak via browser built-in TTS (fallback) */
  const speakBrowser = useCallback(
    (text: string, onEnd?: () => void, onBoundary?: (word: string) => void) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        onEnd?.();
        return;
      }

      window.speechSynthesis.cancel();
      utteranceRef.current = null;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = LANG;
      utterance.rate = 0.95;

      const voices = window.speechSynthesis.getVoices();
      const germanVoice = voices.find(
        (v) => v.lang.startsWith("de") && !v.name.includes("English")
      );
      if (germanVoice) utterance.voice = germanVoice;

      const finish = () => {
        setIsSpeaking(false);
        utteranceRef.current = null;
        onEnd?.();
      };

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = finish;
      utterance.onerror = (event) => {
        // "not-allowed" means autoplay was blocked (no user gesture yet).
        // Don't call onEnd — leave status in "speaking" so the text stays
        // visible and the user can tap the mic manually as their first gesture.
        if ((event as SpeechSynthesisErrorEvent).error === "not-allowed") {
          setIsSpeaking(false);
          return;
        }
        finish();
      };

      if (onBoundary) {
        utterance.onboundary = (event) => {
          if (event.name === "word") {
            const word = text.slice(event.charIndex, event.charIndex + (event.charLength ?? 1));
            if (word.trim()) onBoundary(word.trim());
          }
        };
      }

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    []
  );

  const speak = useCallback(
    (text: string, onEnd?: () => void, onBoundary?: (word: string) => void) => {
      if (!text.trim()) {
        onEnd?.();
        return;
      }
      cancel();

      // Try ElevenLabs first; fall back to browser TTS if it fails
      speakElevenLabs(text, onEnd, onBoundary).then((ok) => {
        if (!ok) {
          speakBrowser(text, onEnd, onBoundary);
        }
      });
    },
    [cancel, speakElevenLabs, speakBrowser]
  );

  useEffect(() => {
    if (!supported) return;
    const loadVoices = () => window.speechSynthesis.getVoices();
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [supported]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cancel();
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.close();
      }
      audioCtxRef.current = null;
    };
  }, [cancel]);

  return {
    isSpeaking,
    autoSpeak,
    setAutoSpeak,
    supported,
    playbackLevel,
    speak,
    cancel,
  };
}
