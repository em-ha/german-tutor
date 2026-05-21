"use client";

import { useEffect, useRef } from "react";
import type { WordLookupResult } from "@/lib/wordLookup/types";

type Anchor = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type Props = {
  word: string;
  info: WordLookupResult | null;
  loading: boolean;
  anchor: Anchor;
  inPracticeList: boolean;
  onClose: () => void;
  onPronounce: (word: string) => void;
  onAddToPractice: () => void;
  onRemoveFromPractice: () => void;
};

export function WordPopover({
  word,
  info,
  loading,
  anchor,
  inPracticeList,
  onClose,
  onPronounce,
  onAddToPractice,
  onRemoveFromPractice,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      const insidePopover = popoverRef.current?.contains(target);
      const insideSheet = sheetRef.current?.contains(target);
      if (!insidePopover && !insideSheet) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [onClose]);

  // Popover position (desktop only)
  const centerX = anchor.left + anchor.width / 2;
  const belowY = anchor.top + anchor.height + 8;
  const cardWidth = 260;
  let left = centerX - cardWidth / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - cardWidth - 12));
  const top = Math.min(belowY, window.innerHeight - 260);

  const isNoun = info?.partOfSpeech === "noun";
  const genderLabel = info?.gender ?? (isNoun ? "—" : "n./a.");
  const pluralLabel = info?.plural ?? (isNoun ? "—" : "n./a.");
  const speakWord = info?.lemma ?? word;

  const cardContent = (
    <>
      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {word}
      </p>
      {info?.lemma && info.lemma !== word.toLowerCase() && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{info.lemma}</p>
      )}

      {loading ? (
        <p className="mt-3 text-sm text-zinc-500">Lädt…</p>
      ) : (
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500 dark:text-zinc-400">Geschlecht</dt>
            <dd className="font-medium text-zinc-900 dark:text-zinc-100">
              {genderLabel}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500 dark:text-zinc-400">Plural</dt>
            <dd className="font-medium text-zinc-900 dark:text-zinc-100">
              {pluralLabel}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500 dark:text-zinc-400">Übersetzung</dt>
            <dd className="text-right font-medium text-emerald-700 dark:text-emerald-400">
              {info?.translation ?? "—"}
            </dd>
          </div>
        </dl>
      )}

      <div className="mt-4 space-y-2">
        <button
          type="button"
          onClick={() => onPronounce(speakWord)}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          <SpeakerIcon />
          Aussprechen
        </button>

        {!loading && info && (
          inPracticeList ? (
            <button
              type="button"
              onClick={onRemoveFromPractice}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-2.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
            >
              <BookmarkIcon filled />
              In Übungsliste — entfernen
            </button>
          ) : (
            <button
              type="button"
              onClick={onAddToPractice}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <BookmarkIcon filled={false} />
              Zur Übungsliste
            </button>
          )
        )}
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      {isMobile ? (
        /* Mobile: bottom sheet */
        <>
          <div className="absolute inset-0 bg-black/40" aria-hidden onClick={onClose} />
          <div
            ref={sheetRef}
            role="dialog"
            aria-label={`Wortinfo: ${word}`}
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-zinc-200 bg-white p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
            {cardContent}
          </div>
        </>
      ) : (
        /* Desktop: floating popover */
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={`Wortinfo: ${word}`}
          className="absolute rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          style={{ top, left, width: cardWidth }}
        >
          {cardContent}
        </div>
      )}
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
    </svg>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  );
}
