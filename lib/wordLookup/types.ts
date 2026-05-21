export type WordGender = "der" | "die" | "das";

export type WordInfo = {
  lemma: string;
  translation: string;
  gender?: WordGender;
  plural?: string;
  partOfSpeech?: "noun" | "verb" | "adjective" | "adverb" | "pronoun" | "other";
};

export type WordLookupResult = WordInfo & {
  foundInDictionary: boolean;
};
