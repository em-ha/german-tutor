"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { OPENING_LINE } from "@/lib/prompts";
import { useMouthAnimation } from "@/lib/useMouthAnimation";
import type { Emotion } from "./CharacterAvatar";
import { CharacterAvatar } from "./CharacterAvatar";
import { MicControl } from "./MicControl";
import { TranscriptDisplay, type PartnerStatus } from "./TranscriptDisplay";

// ── Inner component (must be inside ConversationProvider) ────────────────────
function SpeakingPartnerContent() {
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastAssistantText, setLastAssistantText] = useState("");

  // Translate feature
  const [translation, setTranslation] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  // Copy feature
  const [copied, setCopied] = useState(false);

  const { mouthOpenness, onBoundary, reset: resetMouth } = useMouthAnimation();

  // ── ElevenLabs Speech Engine conversation ───────────────────────────────────
  const conversation = useConversation({
    onConnect: () => {
      setLocalError(null);
    },
    onDisconnect: () => {
      resetMouth();
      setExcitement(0);
      smoothedExcitementRef.current = 0;
    },
    onError: (message) => {
      setLocalError(typeof message === "string" ? message : "Connection error");
    },
    onMessage: ({ message, source }) => {
      // Capture the latest agent utterance for translate/copy
      if (source === "ai") {
        setLastAssistantText(message);
        resetTranslation();
      }
    },
    onModeChange: ({ mode }) => {
      if (mode === "speaking") {
        resetMouth();
        resetTranslation();
        setLastAssistantText(""); // will be set by onMessage as it streams in
      } else {
        resetMouth();
      }
    },
  });

  // Derive a PartnerStatus from the ElevenLabs conversation state
  const status: PartnerStatus =
    conversation.status === "disconnected" || conversation.status === "error"
      ? "idle"
      : conversation.status === "connecting"
      ? "thinking"
      : conversation.mode === "speaking"
      ? "speaking"
      : "listening";

  const isActive = lastAssistantText.length > 0 || status !== "idle";

  // ── Mouth animation while agent is speaking ─────────────────────────────────
  // Simulate word boundaries at speech rhythm since ElevenLabs Speech Engine
  // doesn't expose per-word TTS timestamps in this integration.
  const mouthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (conversation.isSpeaking) {
      let i = 0;
      const words = ["und", "ich", "ein", "das", "ist", "du"];
      mouthTimerRef.current = setInterval(() => {
        onBoundary(words[i % words.length]);
        i++;
      }, 280);
    } else {
      if (mouthTimerRef.current) {
        clearInterval(mouthTimerRef.current);
        mouthTimerRef.current = null;
      }
      resetMouth();
    }
    return () => {
      if (mouthTimerRef.current) clearInterval(mouthTimerRef.current);
    };
  }, [conversation.isSpeaking, onBoundary, resetMouth]);

  // ── RAF-driven excitement — reads real mic amplitude from ElevenLabs SDK ────
  // getInputVolume() taps the same audio pipeline ElevenLabs already owns;
  // no separate getUserMedia needed → no mobile mic conflict.
  const [excitement, setExcitement] = useState(0);
  const smoothedExcitementRef = useRef(0);
  const excitementRafRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const isListening = status === "listening";

      // Read real mic amplitude when listening (0–1 normalised by ElevenLabs SDK)
      const inputVol = isListening ? conversation.getInputVolume() : 0;
      const floor = isListening ? 0.2 : 0;

      // Base at midpoint when voice detected so oscillation gives visible 0.3–0.7 range
      const isSpeaking = inputVol > 0.05;
      const baseTarget = isSpeaking ? 0.5 : floor;
      const pulse = isSpeaking ? Math.sin(Date.now() * 0.019) * 0.2 : 0;
      const target = Math.min(0.7, Math.max(0, baseTarget + pulse));

      const prev = smoothedExcitementRef.current;
      // Fast attack (0.4), slow decay (0.06)
      const next =
        target > prev ? prev + (target - prev) * 0.4 : prev + (target - prev) * 0.06;
      smoothedExcitementRef.current = next;
      if (Math.abs(next - prev) > 0.004) setExcitement(next);

      excitementRafRef.current = requestAnimationFrame(tick);
    };
    excitementRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (excitementRafRef.current) cancelAnimationFrame(excitementRafRef.current);
    };
  }, [status, conversation]);

  // ── Derive emotion ──────────────────────────────────────────────────────────
  const emotion: Emotion = localError
    ? "embarrassed"
    : status === "thinking"
    ? "thinking"
    : "happy";

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const resetTranslation = useCallback(() => {
    setTranslation(null);
    setShowTranslation(false);
  }, []);

  // ── Mic press ───────────────────────────────────────────────────────────────
  const handleMicPress = useCallback(async () => {
    setLocalError(null);

    if (conversation.status === "connected" || conversation.status === "connecting") {
      void conversation.endSession();
      return;
    }

    try {
      const res = await fetch("/api/token");
      if (!res.ok) throw new Error(`Token error ${res.status}`);
      const { token } = (await res.json()) as { token: string };

      setLastAssistantText("");
      resetTranslation();

      conversation.startSession({
        conversationToken: token,
        overrides: {
          agent: { firstMessage: OPENING_LINE },
        },
      });
    } catch (err) {
      console.error("[SpeakingPartner] Connection error:", err);
      setLocalError("Could not connect — please try again.");
    }
  }, [conversation, resetTranslation]);

  // ── Translate ───────────────────────────────────────────────────────────────
  const handleTranslate = useCallback(async () => {
    if (!lastAssistantText) return;
    if (showTranslation) {
      setShowTranslation(false);
      return;
    }
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
      const data = (await res.json()) as { translation?: string };
      setTranslation(data.translation ?? null);
      setShowTranslation(true);
    } catch (err) {
      console.error("[Translate]", err);
    }
    setIsTranslating(false);
  }, [lastAssistantText, showTranslation, translation]);

  // ── Copy ────────────────────────────────────────────────────────────────────
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

  // ── Replay ──────────────────────────────────────────────────────────────────
  const handleReplay = useCallback(() => {
    if (!lastAssistantText || status === "speaking") return;
    // Ask the agent to repeat (it will re-speak via ElevenLabs TTS)
    conversation.sendUserMessage("Kannst du das bitte wiederholen?");
  }, [lastAssistantText, status, conversation]);

  // ── Render ──────────────────────────────────────────────────────────────────
  const displayError = localError;

  return (
    <div
      className={`relative h-dvh overflow-hidden ${
        isActive ? "bg-zinc-900" : "bg-white dark:bg-zinc-950"
      }`}
    >
      {/* Fullscreen dome blob — behind all UI */}
      {isActive && (
        <CharacterAvatar
          variant="dome"
          mouthOpenness={mouthOpenness}
          emotion={emotion}
          excitement={excitement}
        />
      )}

      {/* All UI — on top of blob */}
      <div className="relative z-10 flex h-dvh flex-col">
        {/* Top bar */}
        <header className="shrink-0 flex items-center justify-end px-4 py-3 sm:px-6">
          <button
            type="button"
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              isActive
                ? "border-white/20 text-white/70 hover:bg-white/10"
                : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
            }`}
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
              onClick={() => setLocalError(null)}
            >
              OK
            </button>
          </div>
        )}

        {/* Main area: character + text + action bar */}
        <TranscriptDisplay
          text={lastAssistantText}
          status={status}
          isStreaming={false}
          onPronounceWord={(word) => {
            // Re-use the conversation to ask for pronunciation? Or just skip.
            void word;
          }}
          mouthOpenness={mouthOpenness}
          emotion={emotion}
          onReplay={handleReplay}
          canReplay={lastAssistantText.length > 0}
          onCopy={handleCopy}
          copied={copied}
          onTranslate={() => {
            void handleTranslate();
          }}
          isTranslating={isTranslating}
          translation={translation}
          showTranslation={showTranslation}
        />

        {/* Mic button + disclaimer */}
        <MicControl
          status={status}
          micSupported={true}
          onMicPress={() => {
            void handleMicPress();
          }}
        />
      </div>
    </div>
  );
}

// ── Public export (wraps in ConversationProvider) ────────────────────────────
export function SpeakingPartner() {
  return (
    <ConversationProvider>
      <SpeakingPartnerContent />
    </ConversationProvider>
  );
}
