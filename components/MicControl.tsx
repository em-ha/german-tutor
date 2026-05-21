"use client";

import type { GermanLevel } from "@/lib/mockSpeakingPartner";
import type { PartnerStatus } from "./TranscriptDisplay";

type Props = {
  status: PartnerStatus;
  micSupported: boolean;
  ttsSupported: boolean;
  autoSpeak: boolean;
  onAutoSpeakChange: (value: boolean) => void;
  onMicPress: () => void;
  onReplay: () => void;
  canReplay: boolean;
  onRandomTopic: () => void;
  canStartTopic: boolean;
  level: GermanLevel;
  onLevelChange: (level: GermanLevel) => void;
};

export function MicControl({
  status,
  micSupported,
  ttsSupported,
  autoSpeak,
  onAutoSpeakChange,
  onMicPress,
  onReplay,
  canReplay,
  onRandomTopic,
  canStartTopic,
  level,
  onLevelChange,
}: Props) {
  const isListening = status === "listening";
  const micDisabled =
    !micSupported || status === "thinking" || status === "speaking";

  return (
    <div className="shrink-0 border-t border-zinc-200 bg-white px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] dark:border-zinc-800 dark:bg-zinc-950 sm:px-6">
      <div className="mx-auto flex max-w-md flex-col items-center gap-5">
        <button
          type="button"
          onClick={onRandomTopic}
          disabled={!canStartTopic}
          className="flex w-full max-w-sm items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          aria-label="Zufälliges Smalltalk-Thema starten"
        >
          <DiceIcon />
          Neues Smalltalk-Thema
        </button>

        <button
          type="button"
          onClick={onMicPress}
          disabled={micDisabled}
          aria-label={
            isListening ? "Aufnahme stoppen" : "Mikrofon — auf Deutsch sprechen"
          }
          className={`relative flex h-24 w-24 items-center justify-center rounded-full transition-all ${
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
          <MicIcon className="relative h-10 w-10" />
        </button>

        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          {isListening
            ? "Sprich jetzt — tippe erneut zum Stoppen"
            : micSupported
              ? "Tippe zum Sprechen"
              : "Mikrofon in diesem Browser nicht verfügbar"}
        </p>

        <div className="flex w-full flex-wrap items-center justify-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Niveau</span>
            <div
              className="flex overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
              role="group"
              aria-label="Deutsch-Niveau"
            >
              {(["A1", "A2", "B1"] as GermanLevel[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => onLevelChange(l)}
                  aria-pressed={level === l}
                  className={`px-3 py-1 text-sm font-medium transition-colors ${
                    level === l
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {ttsSupported && (
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={autoSpeak}
                onChange={(e) => onAutoSpeakChange(e.target.checked)}
                className="rounded"
              />
              Vorlesen
            </label>
          )}

          {ttsSupported && (
            <button
              type="button"
              onClick={onReplay}
              disabled={!canReplay || status === "speaking"}
              className="underline hover:text-zinc-900 disabled:opacity-40 dark:hover:text-zinc-200"
            >
              Nochmal hören
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function DiceIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
