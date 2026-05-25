"use client";

import type { PartnerStatus } from "./TranscriptDisplay";

type Props = {
  status: PartnerStatus;
  micSupported: boolean;
  onMicPress: () => void;
};

const STATUS_LABELS: Record<PartnerStatus, string> = {
  idle: "Tap mic to start",
  listening: "Listening...",
  thinking: "Thinking...",
  speaking: "Playing...",
};

export function MicControl({ status, micSupported, onMicPress }: Props) {
  const isListening = status === "listening";
  const micDisabled = !micSupported || status === "thinking" || status === "speaking";

  return (
    <div className="shrink-0 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
      <div className="flex flex-col items-center gap-3">
        <p className="text-[16px] font-medium text-zinc-800">
          {STATUS_LABELS[status]}
        </p>

        <button
          type="button"
          onClick={onMicPress}
          disabled={micDisabled}
          aria-label={isListening ? "Stop recording" : "Start speaking in German"}
          className={`relative flex h-20 w-20 items-center justify-center rounded-full transition-all ${
            isListening
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-4 ring-emerald-200 dark:ring-emerald-900"
              : "bg-emerald-600 text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:shadow-none dark:disabled:bg-zinc-700"
          }`}
        >
          {isListening && (
            <span
              className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-30"
              aria-hidden
            />
          )}
          {isListening ? (
            <PauseIcon className="relative h-8 w-8" />
          ) : (
            <MicIcon className="relative h-8 w-8" />
          )}
        </button>

        <p className="text-xs text-zinc-500">
          AI can make mistakes.
        </p>
      </div>
    </div>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}
