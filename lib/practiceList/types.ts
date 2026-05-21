import type { WordGender } from "@/lib/wordLookup/types";

export type PracticeWord = {
  id: string;
  display: string;
  lemma: string;
  translation: string;
  gender?: WordGender;
  plural?: string;
  partOfSpeech?: string;
  savedAt: number;
};

export const PRACTICE_LIST_STORAGE_KEY = "deutsch-partner-practice-words";
