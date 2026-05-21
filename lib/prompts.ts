export const OPENING_LINE =
  "Hallo! Sprich mit mir — auf Deutsch. Ich höre zu und antworte dir.";

export const SPEAKING_REPLIES = [
  "Sehr gut! Erzähl mir mehr — auf Deutsch.",
  "Interessant! Was denkst du darüber?",
  "Super! Kannst du das noch einmal anders sagen?",
  "Gut gemacht! Hast du noch etwas hinzuzufügen?",
  "Prima! Stell mir eine Frage auf Deutsch.",
  "Ah, verstehe. Und wie war dein Tag?",
];

export const EMPTY_INPUT_REPLY =
  "Kannst du das bitte wiederholen? Ich habe dich nicht verstanden.";

export const KEYWORD_REPLIES: Record<string, string> = {
  hallo: "Hallo! Wie geht es dir heute?",
  hello: "Hallo! Lass uns auf Deutsch sprechen.",
  danke: "Gern geschehen! Was möchtest du als Nächstes üben?",
  tschüss: "Auf Wiedersehen! Bis bald.",
  wie: "Gut gefragt! Versuch es in einem ganzen Satz.",
  was: "Hmm, was meinst du genau? Sag es noch einmal.",
};

export const LEVEL_HINTS: Record<string, string> = {
  A1: "Kurz und einfach — du schaffst das!",
  A2: "Gut! Versuch etwas längere Sätze.",
  B1: "Sehr gut — erzähl mir mehr Details.",
};
