"use client";

import { ClickableTranscript } from "./ClickableTranscript";
import { CharacterAvatar, type Emotion } from "./CharacterAvatar";
import type { GermanLevel } from "@/lib/mockSpeakingPartner";

export type PartnerStatus = "idle" | "listening" | "thinking" | "speaking";

type Props = {
  text: string;
  status: PartnerStatus;
  isStreaming: boolean;
  onPronounceWord: (word: string) => void;
  mouthOpenness: number;
  emotion: Emotion;
  // Action bar
  onReplay: () => void;
  canReplay: boolean;
  onCopy: () => void;
  copied: boolean;
  onTranslate: () => void;
  isTranslating: boolean;
  translation: string | null;
  showTranslation: boolean;
  level: GermanLevel;
  onLevelChange: (level: GermanLevel) => void;
};

const LEVELS: GermanLevel[] = ["A1", "A2", "B1"];

export function TranscriptDisplay({
  text,
  status,
  isStreaming,
  onPronounceWord,
  mouthOpenness,
  emotion,
  onReplay,
  canReplay,
  onCopy,
  copied,
  onTranslate,
  isTranslating,
  translation,
  showTranslation,
  level,
  onLevelChange,
}: Props) {
  const isListening = status === "listening";
  const hasText = text.length > 0;

  // Cycle level: A1 → A2 → B1 → A1
  const handleLevelCycle = () => {
    const idx = LEVELS.indexOf(level);
    onLevelChange(LEVELS[(idx + 1) % LEVELS.length]);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Character area — fills available vertical space */}
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        <CharacterAvatar mouthOpenness={mouthOpenness} emotion={emotion} />
      </div>

      {/* Text + action area */}
      <div className="shrink-0 px-6 pb-3 text-center">
        {/* Status indicator */}
        <p
          className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400"
          role="status"
          aria-live="polite"
        >
          {isListening
            ? "Listening…"
            : status === "thinking"
            ? "Thinking…"
            : status === "speaking"
            ? "Speaking…"
            : " "}
        </p>

        {/* Main content: waveform, text, or empty state */}
        <div className="min-h-[3.5rem]">
          {isListening ? (
            <div
              className="flex items-center justify-center gap-1.5"
              style={{ height: 56 }}
              aria-hidden
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400"
                  style={{
                    height: 48,
                    transformOrigin: "center",
                    animation: "waveform 0.9s ease-in-out infinite",
                    animationDelay: `${i * 0.12}s`,
                  }}
                />
              ))}
            </div>
          ) : hasText ? (
            <div className="relative">
              <ClickableTranscript
                text={text}
                isStreaming={isStreaming}
                onPronounce={onPronounceWord}
              />
              {isStreaming && (
                <span
                  className="ml-0.5 inline-block h-7 w-0.5 animate-pulse bg-emerald-600 align-middle dark:bg-emerald-400"
                  aria-hidden
                />
              )}
            </div>
          ) : (
            <p className="text-base text-zinc-400 dark:text-zinc-500">
              Tap the mic and speak in German
            </p>
          )}
        </div>

        {/* Translation */}
        {showTranslation && translation && (
          <p
            className="mt-3 text-base italic text-zinc-500 transition-all duration-300 dark:text-zinc-400"
            style={{
              opacity: showTranslation ? 1 : 0,
              transform: showTranslation ? "translateY(0)" : "translateY(4px)",
            }}
          >
            {translation}
          </p>
        )}

        {/* Action bar */}
        {hasText && !isStreaming && (
          <div className="mt-4 flex items-center justify-center gap-5">
            {/* Replay */}
            <ActionButton
              onClick={onReplay}
              disabled={!canReplay || status === "speaking"}
              label="Replay"
            >
              <ReplayIcon />
            </ActionButton>

            {/* Level — cycles on tap */}
            <button
              type="button"
              onClick={handleLevelCycle}
              className="flex h-10 min-w-[3rem] items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm font-bold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label={`German level: ${level}. Tap to change.`}
            >
              {level}
            </button>

            {/* Copy */}
            <ActionButton onClick={onCopy} label="Copy text">
              {copied ? <CheckIcon /> : <CopyIcon />}
            </ActionButton>

            {/* Translate */}
            <ActionButton
              onClick={onTranslate}
              disabled={isTranslating}
              label={showTranslation ? "Hide translation" : "Translate"}
              active={showTranslation}
            >
              {isTranslating ? <SpinnerIcon /> : <GlobeIcon />}
            </ActionButton>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  label,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
          : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ReplayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      style={{ animation: "spin 0.8s linear infinite" }}
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
