import {
  EMPTY_INPUT_REPLY,
  KEYWORD_REPLIES,
  LEVEL_HINTS,
  SPEAKING_REPLIES,
} from "./prompts";

export type GermanLevel = "A1" | "A2" | "B1";

export type SpeakingReplyInput = {
  userText: string;
  level: GermanLevel;
  turnCount: number;
  lastAssistantText: string | null;
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function matchKeyword(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [key, reply] of Object.entries(KEYWORD_REPLIES)) {
    if (lower.includes(key)) return reply;
  }
  return null;
}

export function getSpeakingReply({
  userText,
  level,
  turnCount,
  lastAssistantText,
}: SpeakingReplyInput): string {
  const trimmed = userText.trim();

  if (!trimmed) {
    return EMPTY_INPUT_REPLY;
  }

  const keyword = matchKeyword(trimmed);
  if (keyword) return keyword;

  if (lastAssistantText?.includes("?") && turnCount > 1) {
    return "Gute Antwort! Erzähl weiter — auf Deutsch.";
  }

  if (turnCount % 4 === 0 && LEVEL_HINTS[level]) {
    return `${pick(SPEAKING_REPLIES)} ${LEVEL_HINTS[level]}`;
  }

  return pick(SPEAKING_REPLIES);
}
