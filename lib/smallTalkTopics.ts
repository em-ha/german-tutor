import type { GermanLevel } from "@/lib/mockSpeakingPartner";

export type SmallTalkTopic = {
  id: string;
  /** Short label shown in the UI (German) */
  label: string;
  prompts: Record<GermanLevel, string>;
};

export const SMALL_TALK_TOPICS: SmallTalkTopic[] = [
  {
    id: "greeting",
    label: "Begrüßung",
    prompts: {
      A1: "Hallo! Wie geht es dir heute?",
      A2: "Hallo! Wie geht es dir — und wie war dein Morgen?",
      B1: "Hallo! Schön, mit dir zu sprechen. Wie läuft dein Tag bisher?",
    },
  },
  {
    id: "weekend",
    label: "Wochenende",
    prompts: {
      A1: "Was machst du am Wochenende gern?",
      A2: "Was hast du am letzten Wochenende gemacht?",
      B1: "Erzähl mir — was war das Beste an deinem letzten Wochenende?",
    },
  },
  {
    id: "food",
    label: "Essen",
    prompts: {
      A1: "Was isst du gern?",
      A2: "Was isst du am liebsten — und kochst du selbst?",
      B1: "Gibt es ein Gericht, das du besonders magst? Warum?",
    },
  },
  {
    id: "weather",
    label: "Wetter",
    prompts: {
      A1: "Wie ist das Wetter bei dir?",
      A2: "Magst du warmes oder kaltes Wetter — und warum?",
      B1: "Wie beeinflusst das Wetter deine Stimmung oder deine Pläne?",
    },
  },
  {
    id: "hobbies",
    label: "Hobbys",
    prompts: {
      A1: "Was machst du gern in deiner Freizeit?",
      A2: "Welches Hobby hast du — oder welches möchtest du beginnen?",
      B1: "Welches Hobby entspannt dich am meisten, und seit wann machst du es?",
    },
  },
  {
    id: "work",
    label: "Arbeit & Schule",
    prompts: {
      A1: "Was machst du — Schule oder Arbeit?",
      A2: "Erzähl mir kurz von deinem Job oder deinem Studium.",
      B1: "Was gefällt dir an deiner Arbeit oder deinem Studium am meisten?",
    },
  },
  {
    id: "travel",
    label: "Reisen",
    prompts: {
      A1: "Wo wohnst du?",
      A2: "Reist du gern? Wohin möchtest du fahren?",
      B1: "Was war deine schönste Reise — oder wohin würdest du als Nächstes gehen?",
    },
  },
  {
    id: "family",
    label: "Familie",
    prompts: {
      A1: "Hast du eine große Familie?",
      A2: "Erzähl mir von deiner Familie oder deinen Freunden.",
      B1: "Wie verbringst du gern Zeit mit deiner Familie oder deinen Freunden?",
    },
  },
  {
    id: "music",
    label: "Musik & Filme",
    prompts: {
      A1: "Welche Musik hörst du gern?",
      A2: "Welchen Film oder welche Serie magst du?",
      B1: "Gibt es einen Film oder ein Lied, das du in letzter Zeit oft empfohlen hast?",
    },
  },
  {
    id: "plans",
    label: "Pläne",
    prompts: {
      A1: "Was machst du heute Abend?",
      A2: "Was sind deine Pläne für diese Woche?",
      B1: "Wenn du nächstes Jahr etwas Neues machen könntest — was wäre das?",
    },
  },
];

export type SmallTalkPick = {
  topicId: string;
  label: string;
  text: string;
};

export function getRandomSmallTalkTopic(
  level: GermanLevel,
  excludeTopicId?: string | null
): SmallTalkPick {
  const pool =
    excludeTopicId && SMALL_TALK_TOPICS.length > 1
      ? SMALL_TALK_TOPICS.filter((t) => t.id !== excludeTopicId)
      : SMALL_TALK_TOPICS;

  const topic = pool[Math.floor(Math.random() * pool.length)];
  return {
    topicId: topic.id,
    label: topic.label,
    text: topic.prompts[level],
  };
}
