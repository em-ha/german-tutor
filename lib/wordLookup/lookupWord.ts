import { GERMAN_DICTIONARY } from "./dictionary";
import { normalizeWord } from "./normalize";
import type { WordLookupResult } from "./types";

export function lookupWordLocal(raw: string): WordLookupResult | null {
  const key = normalizeWord(raw);
  if (!key) return null;

  const entry = GERMAN_DICTIONARY[key];
  if (entry) {
    return { ...entry, foundInDictionary: true };
  }

  return null;
}

/** Free translation fallback when word is not in the local dictionary. */
export async function fetchTranslationEn(word: string): Promise<string | null> {
  const key = normalizeWord(word);
  if (!key) return null;

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(key)}&langpair=de|en`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      responseData?: { translatedText?: string };
    };
    const text = data.responseData?.translatedText?.trim();
    if (!text || text.toUpperCase() === key.toUpperCase()) return null;
    return text;
  } catch {
    return null;
  }
}

export async function lookupWord(raw: string): Promise<WordLookupResult> {
  const key = normalizeWord(raw);
  const local = lookupWordLocal(raw);
  if (local) return local;

  const translation = await fetchTranslationEn(raw);
  return {
    lemma: key || raw,
    translation: translation ?? "—",
    foundInDictionary: false,
  };
}
