"use client";

import { ClickableTranscript } from "./ClickableTranscript";

export type PartnerStatus = "idle" | "listening" | "thinking" | "speaking";

const STATUS_LABELS: Record<PartnerStatus, string> = {
  idle: "Bereit",
  listening: "Höre zu…",
  thinking: "Denke nach…",
  speaking: "Spricht…",
};

type Props = {
  text: string;
  status: PartnerStatus;
  isStreaming: boolean;
  topicLabel: string | null;
  onPronounceWord: (word: string) => void;
};

export function TranscriptDisplay({
  text,
  status,
  isStreaming,
  topicLabel,
  onPronounceWord,
}: Props) {
  const isListening = status === "listening";

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
      <p
        className="mb-2 text-sm font-medium tracking-wide text-emerald-600 uppercase dark:text-emerald-400"
        role="status"
        aria-live="polite"
      >
        {STATUS_LABELS[status]}
      </p>
      {topicLabel && (
        <p className="mb-6 text-xs text-zinc-500 dark:text-zinc-400">
          Smalltalk: {topicLabel}
        </p>
      )}
      {!topicLabel && <div className="mb-8" />}

      <div className="max-w-lg">
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
        ) : text ? (
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
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40">
              <MicOutlineIcon />
            </div>
            <p className="text-base font-medium text-zinc-700 dark:text-zinc-300">
              Bereit zum Üben
            </p>
            <p className="text-sm text-zinc-400 dark:text-zinc-500">
              Tippe auf das Mikrofon und sprich auf Deutsch
            </p>
          </div>
        )}
        {text && !isStreaming && (
          <p className="mt-6 text-xs text-zinc-400 dark:text-zinc-500">
            Tippe auf ein Wort für Übersetzung, Aussprache und Übungsliste
          </p>
        )}
      </div>
    </div>
  );
}

function MicOutlineIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="text-emerald-600 dark:text-emerald-400"
      aria-hidden
    >
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
