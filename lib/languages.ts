export type LanguageCode = "en" | "de" | "es";

export interface Language {
  code: LanguageCode;
  name: string;
  flag: string;
  openingLine: string;
  shadowingOpeningLine: string;
}

export const LANGUAGES: Language[] = [
  {
    code: "en",
    name: "English",
    flag: "🇬🇧",
    openingLine: "Hello! Talk to me — in English. I'm listening and I'll reply to you.",
    shadowingOpeningLine: "You want to echo me — I say a sentence and you repeat it back. Shall we begin?",
  },
  {
    code: "de",
    name: "Deutsch",
    flag: "🇩🇪",
    openingLine: "Hallo! Sprich mit mir — auf Deutsch. Ich höre zu und antworte dir.",
    shadowingOpeningLine: "Du willst mich echoen — ich spreche einen Satz und du wiederholst ihn. Bereit? Los geht's!",
  },
  {
    code: "es",
    name: "Español",
    flag: "🇪🇸",
    openingLine: "¡Hola! Háblame — en español. Te escucho y te respondo.",
    shadowingOpeningLine: "Quieres imitarme — yo digo una frase y tú la repites. ¿Listo? ¡Empecemos!",
  },
];

/** Returns the picker heading in the user's browser language (en/de/es), falling back to English. */
export function getPickerHeading(): string {
  const headings: Record<string, string> = {
    en: "Which language do you want to practice today?",
    de: "Welche Sprache möchtest du heute üben?",
    es: "¿Qué idioma quieres practicar hoy?",
  };
  const lang =
    typeof navigator !== "undefined"
      ? navigator.language.slice(0, 2).toLowerCase()
      : "en";
  return headings[lang] ?? headings.en;
}
