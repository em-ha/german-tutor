import { normalizeWord } from "@/lib/wordLookup/normalize";
import type { WordLookupResult } from "@/lib/wordLookup/types";
import {
  PRACTICE_LIST_STORAGE_KEY,
  type PracticeWord,
} from "./types";

export function readPracticeList(): PracticeWord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PRACTICE_LIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PracticeWord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePracticeList(words: PracticeWord[]) {
  localStorage.setItem(PRACTICE_LIST_STORAGE_KEY, JSON.stringify(words));
}

export function practiceWordId(raw: string, lemma?: string): string {
  return normalizeWord(lemma ?? raw);
}

export function isWordInPracticeList(id: string): boolean {
  return readPracticeList().some((w) => w.id === id);
}

export function addPracticeWord(
  display: string,
  info: WordLookupResult
): PracticeWord[] {
  const id = practiceWordId(display, info.lemma);
  const existing = readPracticeList();
  if (existing.some((w) => w.id === id)) return existing;

  const entry: PracticeWord = {
    id,
    display,
    lemma: info.lemma,
    translation: info.translation,
    gender: info.gender,
    plural: info.plural,
    partOfSpeech: info.partOfSpeech,
    savedAt: Date.now(),
  };

  const next = [entry, ...existing];
  writePracticeList(next);
  return next;
}

export function removePracticeWord(id: string): PracticeWord[] {
  const next = readPracticeList().filter((w) => w.id !== id);
  writePracticeList(next);
  return next;
}

export const PRACTICE_LIST_EVENT = "practice-list-updated";

export function notifyPracticeListChanged() {
  window.dispatchEvent(new Event(PRACTICE_LIST_EVENT));
}
