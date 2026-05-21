"use client";

import type { PracticeWord } from "@/lib/practiceList/types";

type Props = {
  open: boolean;
  words: PracticeWord[];
  onClose: () => void;
  onRemove: (id: string) => void;
  onPronounce: (word: string) => void;
};

export function PracticeListSheet({
  open,
  words,
  onClose,
  onRemove,
  onPronounce,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Schließen"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Übungsliste"
        className="relative max-h-[70dvh] overflow-hidden rounded-t-2xl border-t border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Übungsliste
            <span className="ml-2 text-sm font-normal text-zinc-500">
              ({words.length})
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Schließen
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {words.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              Noch keine Wörter gespeichert. Tippe auf ein Wort in der Antwort
              und wähle „Zur Übungsliste“.
            </p>
          ) : (
            <ul className="space-y-2">
              {words.map((w) => (
                <li
                  key={w.id}
                  className="flex items-start gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">
                      {w.lemma}
                      {w.gender && (
                        <span className="ml-2 text-xs font-normal text-zinc-500">
                          {w.gender}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-emerald-700 dark:text-emerald-400">
                      {w.translation}
                    </p>
                    {w.plural && w.plural !== "—" && (
                      <p className="text-xs text-zinc-500">
                        Plural: {w.plural}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => onPronounce(w.lemma)}
                      className="rounded-lg px-2 py-1 text-xs text-emerald-700 underline dark:text-emerald-400"
                    >
                      Hören
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(w.id)}
                      className="rounded-lg px-2 py-1 text-xs text-zinc-500 underline hover:text-red-600"
                    >
                      Entfernen
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
