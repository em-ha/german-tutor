"use client";

import { useCallback, useState } from "react";
import { lookupWord, lookupWordLocal } from "@/lib/wordLookup/lookupWord";
import { isLookupable, tokenizeTranscript } from "@/lib/wordLookup/normalize";
import type { WordLookupResult } from "@/lib/wordLookup/types";
import { WordPopover } from "./WordPopover";

type Anchor = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type Props = {
  text: string;
  isStreaming: boolean;
  onPronounce: (word: string) => void;
};

export function ClickableTranscript({
  text,
  isStreaming,
  onPronounce,
}: Props) {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [info, setInfo] = useState<WordLookupResult | null>(null);
  const [loading, setLoading] = useState(false);

  const closePopover = useCallback(() => {
    setSelectedWord(null);
    setAnchor(null);
    setInfo(null);
    setLoading(false);
  }, []);

  const handleWordClick = useCallback(
    async (raw: string, el: HTMLElement) => {
      if (isStreaming || !isLookupable(raw)) return;

      const rect = el.getBoundingClientRect();
      setSelectedWord(raw);
      setAnchor({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });

      const local = lookupWordLocal(raw);
      if (local) {
        setInfo(local);
        setLoading(false);
        return;
      }

      setInfo(null);
      setLoading(true);
      const result = await lookupWord(raw);
      setInfo(result);
      setLoading(false);
    },
    [isStreaming]
  );

  const tokens = tokenizeTranscript(text);

  return (
    <>
      <p className="text-2xl leading-relaxed font-medium text-zinc-900 sm:text-3xl dark:text-zinc-50">
        {tokens.map((token, i) => {
          const isSpace = /^\s+$/.test(token);
          if (isSpace) {
            return <span key={i}>{token}</span>;
          }

          const lookupable = isLookupable(token) && !isStreaming;

          if (!lookupable) {
            return <span key={i}>{token}</span>;
          }

          return (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleWordClick(token, e.currentTarget);
              }}
              className="cursor-pointer rounded px-0.5 underline decoration-emerald-400/50 decoration-dotted underline-offset-4 transition-colors hover:bg-emerald-50 hover:decoration-emerald-600 dark:hover:bg-emerald-950/40"
              aria-label={`Word info for ${token}`}
            >
              {token}
            </button>
          );
        })}
      </p>

      {selectedWord && anchor && (
        <WordPopover
          word={selectedWord}
          info={info}
          loading={loading}
          anchor={anchor}
          onClose={closePopover}
          onPronounce={onPronounce}
        />
      )}
    </>
  );
}
