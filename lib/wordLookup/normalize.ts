/** Strip leading/trailing punctuation and lowercase for lookup. */
export function normalizeWord(raw: string): string {
  return raw
    .replace(/^[^\p{L}\p{M}'-]+|[^\p{L}\p{M}'-]+$/gu, "")
    .toLowerCase();
}

export function isLookupable(raw: string): boolean {
  const n = normalizeWord(raw);
  return n.length >= 2 && /\p{L}/u.test(n);
}

/** Split transcript into alternating whitespace and word tokens. */
export function tokenizeTranscript(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}
