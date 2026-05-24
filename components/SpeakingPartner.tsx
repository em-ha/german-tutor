"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GermanLevel } from "@/lib/mockSpeakingPartner";
import type { Emotion } from "./CharacterAvatar";
import { OPENING_LINE } from "@/lib/prompts";
import { useSpeechRecognition } from "@/lib/speech/useSpeechRecognition";
import { useSpeechSynthesis } from "@/lib/speech/useSpeechSynthesis";
import { getRandomSmallTalkTopic } from "@/lib/smallTalkTopics";
import { streamText } from "@/lib/streamText";
import { useMouthAnimation } from "@/lib/useMouthAnimation";
import { MicControl } from "./MicControl";
import { TranscriptDisplay, type PartnerStatus } from "./TranscriptDisplay";

export function SpeakingPartner() {
  const [status, setStatus] = useState<PartnerStatus>("idle");
  const [lastAssistantText, setLastAssistantText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [level, setLevel] = useState<GermanLevel>("A2");
  const [localError, setLocalError] = useState<string | null>(null);
  const [topicLabel, setTopicLabel] = useState<string | null>(null);

  // Translate feature
  const [translation, setTranslation] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  // Copy feature
  const [copied, setCopied] = useState(false);

  // Derive emotion from app status
  const emotion: Emotion = localError
    ? "embarrassed"
    : status === "listening"
    ? "excited"
    : status === "thinking"
    ? "thinking"
    : status === "speaking"
    ? "happy"
    : "happy";

  const turnCountRef = useRef(0);
  const lastAssistantRef = useRef<string | null>(null);
  const lastTopicIdRef = useRef<string | null>(null);
  const greetedRef = useRef(false);
  const processingRef = useRef(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  // Auto-listen: start mic automatically after speaking
  const pendingAutoListenRef = useRef(false);
  const manualStopRef = useRef(false);
  // Stable ref to handleUserSpeech to avoid circular dep in deliverReply
  const handleUserSpeechRef = useRef<((text: string) => void) | null>(null);

  const speech = useSpeechRecognition();
  const tts = useSpeechSynthesis();
  const { mouthOpenness, onBoundary, reset: resetMouth } = useMouthAnimation();

  // Reset translation when a new message arrives
  const resetTranslation = useCallback(() => {
    setTranslation(null);
    setShowTranslation(false);
  }, []);

  const deliverReply = useCallback(
    async (replyText: string, countTurn: boolean) => {
      streamAbortRef.current?.abort();

      setStatus("speaking");
      setIsStreaming(false);
      setLastAssistantText("");
      resetTranslation();

      lastAssistantRef.current = replyText;
      if (countTurn) turnCountRef.current += 1;

      if (tts.autoSpeak && tts.supported) {
        // Reveal words in sync with audio as each word is spoken
        const words = replyText.trim().split(/\s+/);
        let revealedCount = 0;

        const syncedBoundary = (word: string) => {
          onBoundary(word); // mouth animation
          revealedCount = Math.min(revealedCount + 1, words.length);
          setLastAssistantText(words.slice(0, revealedCount).join(" "));
        };

        tts.speak(
          replyText,
          () => {
            setLastAssistantText(replyText); // ensure full text shown at end
            resetMouth();
            pendingAutoListenRef.current = true;
            setStatus("idle");
          },
          syncedBoundary
        );
      } else {
        // No TTS — stream text character by character
        const controller = new AbortController();
        streamAbortRef.current = controller;
        setIsStreaming(true);
        try {
          await streamText(replyText, (partial) => setLastAssistantText(partial), controller.signal);
        } catch (e) {
          if (!(e instanceof DOMException && e.name === "AbortError")) {
            setLastAssistantText(replyText);
          }
        }
        setIsStreaming(false);
        setStatus("idle");
      }
    },
    [tts, onBoundary, resetMouth, resetTranslation]
  );

  const handleUserSpeech = useCallback(
    async (userText: string) => {
      if (processingRef.current) return;
      processingRef.current = true;
      speech.stop();

      setStatus("thinking");

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userText,
            level,
            turnCount: turnCountRef.current,
            lastAssistantText: lastAssistantRef.current,
            topicContext: topicLabel,
          }),
        });

        if (!res.ok) throw new Error(`Chat API error ${res.status}`);
        const data = await res.json() as { reply?: string; error?: string };
        const reply = data.reply ?? "Entschuldigung, ich habe dich nicht verstanden.";
        await deliverReply(reply, true);
      } catch (err) {
        console.error("[Chat]", err);
        setLocalError("Connection error — please try again.");
        setStatus("idle");
      }

      processingRef.current = false;
    },
    [level, topicLabel, deliverReply, speech]
  );

  // Keep handleUserSpeechRef in sync to avoid circular dep in deliverReply
  useEffect(() => {
    handleUserSpeechRef.current = (text: string) => { void handleUserSpeech(text); };
  }, [handleUserSpeech]);

  // Auto-start listening after speaking ends
  useEffect(() => {
    if (status !== "idle") return;
    if (!pendingAutoListenRef.current) return;
    pendingAutoListenRef.current = false;
    if (manualStopRef.current) return;
    const timer = setTimeout(() => {
      if (processingRef.current) return;
      processingRef.current = false;
      setStatus("listening");
      speech.start((finalText) => {
        handleUserSpeechRef.current?.(finalText);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [status, speech]);

  // Auto-restart listening after silence (recognition ended with no speech)
  useEffect(() => {
    if (speech.isListening) return;
    if (status !== "listening") return;
    if (processingRef.current) return;
    // Recognition ended silently — restart unless user manually stopped
    pendingAutoListenRef.current = !manualStopRef.current;
    setStatus("idle");
  }, [speech.isListening, status]);

  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    void deliverReply(OPENING_LINE, false);
  }, [deliverReply]);

  // ── Random topic (kept for future use, button not shown) ──────────────────
  const handleRandomTopic = useCallback(() => {
    if (status !== "idle" || isStreaming) return;
    setLocalError(null);
    speech.clearError();
    speech.stop();
    manualStopRef.current = false;

    const pick = getRandomSmallTalkTopic(level, lastTopicIdRef.current);
    lastTopicIdRef.current = pick.topicId;
    setTopicLabel(pick.label);
    turnCountRef.current = 0;
    lastAssistantRef.current = null;

    void deliverReply(pick.text, false);
  }, [status, isStreaming, level, speech, deliverReply]);
  // Suppress unused warning — kept for future use
  void handleRandomTopic;

  // ── Translate ─────────────────────────────────────────────────────────────
  const handleTranslate = useCallback(async () => {
    if (!lastAssistantText) return;

    // Toggle off if already showing
    if (showTranslation) {
      setShowTranslation(false);
      return;
    }

    // Show cached translation immediately if available
    if (translation) {
      setShowTranslation(true);
      return;
    }

    setIsTranslating(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: lastAssistantText }),
      });
      if (!res.ok) throw new Error(`Translate API error ${res.status}`);
      const data = await res.json() as { translation?: string };
      setTranslation(data.translation ?? null);
      setShowTranslation(true);
    } catch (err) {
      console.error("[Translate]", err);
    }
    setIsTranslating(false);
  }, [lastAssistantText, showTranslation, translation]);

  // ── Copy ──────────────────────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    if (!lastAssistantText) return;
    try {
      await navigator.clipboard.writeText(lastAssistantText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard not available
    }
  }, [lastAssistantText]);

  // ── Replay ────────────────────────────────────────────────────────────────
  const handleReplay = useCallback(() => {
    if (!lastAssistantText || status === "speaking") return;
    setStatus("speaking");
    tts.speak(lastAssistantText, () => { setStatus("idle"); resetMouth(); }, onBoundary);
  }, [lastAssistantText, status, tts, onBoundary, resetMouth]);

  // ── Mic ───────────────────────────────────────────────────────────────────
  const handleMicPress = useCallback(() => {
    setLocalError(null);
    speech.clearError();

    if (status === "listening") {
      manualStopRef.current = true;
      pendingAutoListenRef.current = false;
      speech.stop();
      if (!processingRef.current) setStatus("idle");
      return;
    }

    if (status !== "idle") return;

    manualStopRef.current = false;
    processingRef.current = false;
    setStatus("listening");
    speech.start((finalText) => {
      void handleUserSpeech(finalText);
    });
  }, [status, speech, handleUserSpeech]);

  const displayError = localError ?? speech.error;

  return (
    <div className="flex h-dvh flex-col bg-white dark:bg-zinc-950">
      {/* Top bar */}
      <header className="shrink-0 flex items-center justify-end px-4 py-3 sm:px-6">
        <button
          type="button"
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
          aria-label="Send feedback"
        >
          Feedback
        </button>
      </header>

      {/* Error banner */}
      {displayError && (
        <div
          role="alert"
          className="mx-4 mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200 sm:mx-6"
        >
          {displayError}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => {
              setLocalError(null);
              speech.clearError();
            }}
          >
            OK
          </button>
        </div>
      )}

      {/* Main area: character + text + action bar */}
      <TranscriptDisplay
        text={lastAssistantText}
        status={status}
        isStreaming={isStreaming}
        onPronounceWord={(word) => tts.speak(word)}
        mouthOpenness={mouthOpenness}
        emotion={emotion}
        onReplay={handleReplay}
        canReplay={lastAssistantText.length > 0}
        onCopy={handleCopy}
        copied={copied}
        onTranslate={() => { void handleTranslate(); }}
        isTranslating={isTranslating}
        translation={translation}
        showTranslation={showTranslation}
        level={level}
        onLevelChange={setLevel}
      />

      {/* Mic button + disclaimer */}
      <MicControl
        status={status}
        micSupported={speech.supported}
        onMicPress={handleMicPress}
      />
    </div>
  );
}
