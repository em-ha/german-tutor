"use client";

import { ClickableTranscript } from "./ClickableTranscript";
import type { Emotion } from "./CharacterAvatar";

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
};

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
}: Props) {
  const hasText = text.length > 0;
  const isIdle = text.length === 0 && status === "idle";

  // Character (dome blob) is always rendered in SpeakingPartner behind this layer.
  // pt-[35dvh] pins the text to start below the face (which occupies the top ~30dvh).
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto pt-[35dvh] pb-4 px-6 text-center">
      {isIdle ? null : hasText ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-2">
          {/* German text */}
          <ClickableTranscript
            text={text}
            isStreaming={isStreaming}
            onPronounce={onPronounceWord}
            className="text-[32px] leading-snug text-zinc-900 font-[family-name:var(--font-special-gothic)]"
          />

          {/* Translation */}
          {showTranslation && translation && (
            <p className="text-[20px] font-semibold leading-snug text-zinc-700 transition-opacity duration-300">
              {translation}
            </p>
          )}

          {/* Action bar — 3 icons */}
          {!isStreaming && (
            <div className="mt-1 flex items-center gap-2">
              <ActionButton onClick={onCopy} label="Copy text">
                {copied ? <CheckIcon /> : <CopyIcon />}
              </ActionButton>

<ActionButton
                onClick={onTranslate}
                disabled={isTranslating}
                label={showTranslation ? "Hide translation" : "Translate"}
                active={showTranslation}
              >
                {isTranslating ? <SpinnerIcon /> : <TranslateIcon />}
              </ActionButton>
            </div>
          )}
        </div>
      ) : (
        // Thinking/connecting — no text yet
        <p className="text-base text-zinc-700">…</p>
      )}
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
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-black/20 text-zinc-900"
          : "text-zinc-800 hover:bg-black/10"
      }`}
    >
      {children}
    </button>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

function CopyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 010 7.07" />
    </svg>
  );
}

function TranslateIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M5 8l6 6" />
      <path d="M4 14l6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="M22 22l-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="22"
      height="22"
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
