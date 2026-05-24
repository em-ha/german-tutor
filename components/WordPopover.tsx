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
  onClose: () => void;
  onPronounce: (word: string) => void;
};

export function WordPopover({
  word,
  info,
  loading,
  anchor,
  onClose,
  onPronounce,
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
  const baseForm = info?.lemma ?? word;
  const speakWord = info?.lemma ?? word;

  const cardContent = (
    <>
      {/* Base / dictionary form — prominent */}
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        {baseForm}
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      ) : info ? (
        <>
          {/* English translation */}
          <p className="mt-1 text-base text-emerald-700 dark:text-emerald-400">
            {info.translation}
          </p>

          {/* Gender + Plural — nouns only */}
          {isNoun && (info.gender || info.plural) && (
            <div className="mt-2 flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
              {info.gender && (
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {info.gender}
                </span>
              )}
              {info.plural && (
                <span>
                  Pl: <span className="font-medium text-zinc-700 dark:text-zinc-300">{info.plural}</span>
                </span>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">—</p>
      )}

      {/* Pronounce button */}
      <button
        type="button"
        onClick={() => onPronounce(speakWord)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 active:bg-emerald-700"
      >
        <SpeakerIcon />
        Pronounce
      </button>
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
            aria-label={`Word info: ${word}`}
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
          aria-label={`Word info: ${word}`}
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
