/**
 * Quatschi Speech Engine WebSocket server.
 *
 * ElevenLabs dials into this server when a user starts a conversation,
 * sends user transcripts via WebSocket, and we respond with Groq LLM text.
 * ElevenLabs handles STT, turn-taking, TTS, and audio delivery to the browser.
 *
 * Deploy to Railway. Required env vars:
 *   ELEVENLABS_API_KEY   — your ElevenLabs API key
 *   GROQ_API_KEY         — your Groq API key
 *   SPEECH_ENGINE_ID     — the Speech Engine ID (seng_...)
 */

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createServer } from "node:http";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import Groq from "groq-sdk";
import OpenAI from "openai";
import { config } from "dotenv";
config({ path: ".env.local" });

const TRANSCRIPT_DIR = "/Users/emmahartwig/Documents/claude-emma-gdrive/quatschi-local-transcripts";
mkdirSync(TRANSCRIPT_DIR, { recursive: true });

const SPEECH_ENGINE_ID = process.env.SPEECH_ENGINE_ID;
if (!SPEECH_ENGINE_ID) throw new Error("SPEECH_ENGINE_ID env var is required");
if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY env var is required");
if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY env var is required");

const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

// ── LLM provider — swap PROVIDER to switch between Groq and Gemini ────────────
// To revert to Groq: change PROVIDER back to "groq"
const PROVIDER = "gemini"; // "groq" | "gemini"

// Groq client — used when PROVIDER === "groq"
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });

// OpenAI-compatible client pointing at Gemini — used when PROVIDER === "gemini"
const gemini = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY ?? "",
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

// The active client and model names, chosen by PROVIDER
const llm: OpenAI | Groq   = PROVIDER === "gemini" ? gemini : groq;
const GROQ_PRIMARY   = PROVIDER === "gemini" ? "gemini-2.5-flash"       : "llama-3.3-70b-versatile";
const GROQ_FALLBACK  = PROVIDER === "gemini" ? "gemini-2.5-flash"       : "llama-3.1-8b-instant";

// ── Language detection ────────────────────────────────────────────────────────

// Maps opening line prefixes to language names.
// Order matters: longer/more-specific prefixes first to avoid partial matches.
const OPENING_PREFIXES: [string, string][] = [
  ["¡Hola",    "Spanish"],
  ["Hola",     "Spanish"],
  ["Quieres",  "Spanish"],  // Echo opening: "Quieres imitarme…"
  ["Hello",    "English"],
  ["Hi ",      "English"],
  ["You ",     "English"],  // Echo opening: "You want to echo me…"
  ["Hallo",    "German"],
  ["Du ",      "German"],   // Echo opening: "Du willst mich echoen…"
];

/** Detect the target language from the conversation transcript.
 *  First tries prefix-matching the first agent turn (fastest, most reliable).
 *  Falls back to scanning all turns for language-specific function words. */
function detectTargetLanguage(transcript: Array<{ role: string; content: string }>): string {
  // 1. Prefix match on first agent turn
  const firstAgent = transcript.find((m) => m.role === "agent");
  if (firstAgent) {
    for (const [prefix, lang] of OPENING_PREFIXES) {
      if (firstAgent.content.startsWith(prefix)) return lang;
    }
  }

  // 2. Fallback: scan all text for high-frequency language-specific words
  const allText = transcript.map((m) => m.content).join(" ").toLowerCase();
  const deScore = (allText.match(/\b(ich|das|die|der|und|ist|du|mir|wir|nicht|aber|auf|ein|eine)\b/g) ?? []).length;
  const esScore = (allText.match(/\b(yo|tú|él|la|los|las|una|está|son|pero|porque|muy|bien|gracias)\b/g) ?? []).length;
  const enScore = (allText.match(/\b(the|and|you|are|this|that|with|have|for|can|your|not|yes|okay)\b/g) ?? []).length;

  const max = Math.max(deScore, esScore, enScore);
  if (max === 0) return "German"; // nothing matched, keep default
  if (enScore === max) return "English";
  if (esScore === max) return "Spanish";
  return "German";
}

/** Detect whether the session is in shadowing mode from the first agent turn.
 *  All Echo/shadowing opening lines start with "Ah," (in all three languages).
 *  Normal conversation opening lines start with Hello/Hallo/¡Hola. */
function detectMode(transcript: Array<{ role: string; content: string }>): "conversation" | "shadowing" {
  const firstAgent = transcript.find((m) => m.role === "agent");
  if (!firstAgent) return "conversation";
  const text = firstAgent.content;
  // Echo openings start with "You " / "Du " / "Quieres" — none of the chat openings do
  if (text.startsWith("You ") || text.startsWith("Du ") || text.startsWith("Quieres")) return "shadowing";
  return "conversation";
}

// ── Session state ─────────────────────────────────────────────────────────────

interface Correction { said: string; correct: string; }

interface SessionData {
  language: string;       // "German" | "English" | "Spanish"
  level: string;          // "A1" | "A2" | "B1" | "B2"
  transcripts: string[];  // user turn texts, accumulated for echo chamber detection
  fullTranscript: Array<{ role: string; content: string }>; // full conversation for saving
  corrections: Correction[];
  turnCount: number;
  mode: "conversation" | "shadowing";
  startedAt: Date;
}

const sessions = new Map<string, SessionData>();

// ── Active level config — update here to change or expand available levels ───

const LEVEL_CONFIG = {
  available: ["B1"] as string[],
  default: "B1",
};

// ── Level → TTS stability mapping ────────────────────────────────────────────

const STABILITY_MAP: Record<string, number> = { A1: 0.9, A2: 0.8, B1: 0.6, B2: 0.4 };

// ── Level rules — add entries here when new levels are enabled ────────────────

const LEVEL_RULES: Record<string, string> = {
  A1: `Speak at A1 level: very short sentences (3–5 words), basic present tense only, core vocabulary (numbers, colours, greetings, family). Use one short English support phrase if the user is completely stuck.`,
  A2: `Speak at A2 level: short sentences (5–8 words), present and simple past tense, everyday vocabulary (shopping, weather, daily routines). Minimal English support only if needed.`,
  B1: `Speak at B1 level — natural, clear, spoken German. The B1 standard is not perfect German. It is clear, functional, communicative German.

GRAMMAR — use freely:
- Tenses: Präsens for present facts and future plans; Perfekt for all spoken past events (ich habe... / ich bin...); Präteritum only for: war, hatte, wollte, konnte, musste, durfte, sollte; werden only for predictions.
- Modals in Präsens: können, müssen, dürfen, wollen, sollen, möchten. Modals in Präteritum: konnte, musste, durfte, wollte, sollte.
- Sentence structure: V2 rule in main clauses; inversion after fronted adverbials (Morgen fahre ich nach Berlin); short linked clauses preferred over complex embedding.
- Subordinate clauses — maximum ONE per sentence, never stacked: weil (reason), dass (content), wenn (condition), als (single past event), ob (indirect question), obwohl (concession), bevor / nachdem (time sequence). Verb-final rule applied.
- Separable verbs: anrufen, aufstehen, aufhören, mitkommen, einkaufen — correct separation automatic.
- Reflexive verbs: sich freuen, sich fühlen, sich interessieren für, sich treffen mit — correct pronoun placement.
- Prepositions: Akkusativ (für, durch, ohne, um, gegen); Dativ (mit, bei, nach, seit, von, zu, aus); two-way prepositions — location uses Dativ (Ich bin im Park), direction uses Akkusativ (Ich gehe in den Park).
- Genitiv — always avoided in speech; use von + Dativ instead: "das Auto von meinem Vater" not "das Auto meines Vaters".
- Konjunktiv II — essential for natural spoken B1: würde + Infinitiv (hypothetical/polite), wäre, hätte, könnte (polite requests: "Könntest du mir helfen?"), sollte (mild suggestions: "Du solltest mal probieren..."). Use at least one Konjunktiv II form every 3–4 turns in questions, suggestions, or hypotheticals.
- Adjectives: predicative fully accurate (Das ist schön); attributive minor errors tolerated; comparatives fine (schneller, besser, größer, am liebsten).
- Spoken markers — use naturally: Also... / Ähm... / Außerdem... / Zum Beispiel... / doch / mal / ja / eigentlich / halt.
- Negation: nicht and kein automatic and accurate. No double negation.

GRAMMAR — never use:
- Passive voice → use man instead: "Man macht das" not "Das wird gemacht"
- Konjunktiv I (reported speech)
- Plusquamperfekt in production
- Genitiv case
- Extended participial phrases
- Stacked subordinate clauses (more than one per sentence)

VOCABULARY — talk about:
Daily routine, work and study, travel and transport, food and shopping, health and body, hobbies and free time, weather, feelings and relationships, simple opinions and preferences.

VOCABULARY — never use:
Abstract or political topics, technical jargon, idioms and fixed expressions, regional slang, low-frequency or literary vocabulary.`,
  B2: `Speak at B2 level: varied sentence structures, Konjunktiv II for hypotheticals, passive voice, idiomatic expressions, abstract topics. No English support.`,
};

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(language: string, level: string, recentTranscripts: string[], frequentWords: string[] = []): string {
  const recentContext = recentTranscripts.length > 0
    ? `\nThe user's last ${recentTranscripts.length} message(s) for context:\n${recentTranscripts.map((t, i) => `[Turn ${i + 1}]: ${t}`).join("\n")}`
    : "";

  const echoChamberNote = frequentWords.length > 0
    ? `\nThe user keeps reaching for the same words: ${frequentWords.join(", ")}. Weave richer alternatives naturally into your reply — never point this out directly.`
    : "";

  return `You are Quatschi, a warm, playful conversation partner helping the user build confidence speaking ${language}. You are not a teacher.

CORE PROMISE:
- Speak natural ${language} consistently at the active level
- Never point out mistakes — ever
- Model correct forms naturally in your replies
- Keep the learner talking and feeling confident
- Ask one clear, concrete question at a time

VOICE RULES — this is a spoken app, not text:
- Sentences are 8–15 words — count before you output; split any sentence over 15 words into two
- One idea per sentence
- Subordinate clauses count toward the word total of the sentence they belong to
- Maximum one subordinate clause per sentence — never stacked
- Questions are concrete and direct: "Wo arbeitest du?" not "Inwiefern beeinflusst deine Arbeit deinen Alltag?"
- No bureaucratic or written-style German
- Common connectors: und, aber, oder, weil, dass, wenn, also, trotzdem, deshalb
- Use discourse markers to open sentences naturally: 'Also, ...' (to continue a thought), 'Zum Beispiel, ...' (to illustrate), 'Außerdem ...' (to add a point). Aim for at least one of these every 4–5 turns.
- Never use English unless the user is completely stuck — one sentence only, then return to ${language} immediately

ACKNOWLEDGMENT OPENERS — vary these across turns; never use the same opener twice in a row and avoid using any single opener more than once every 4 turns:
- Surprise / delight: 'Oh schön!', 'Oh interessant!', 'Oh wirklich?'
- Agreement: 'Ja, genau!', 'Stimmt!', 'Das stimmt.'
- Continuation: 'Also, ...', 'Und dann?', 'Erzähl mal!'
- Empathy: 'Das klingt toll.', 'Das verstehe ich.', 'Das kann ich mir vorstellen.'
- Minimal: 'Gut!', 'Super!', 'Cool!'
Reserve 'Ah' variants ('Ah, ich verstehe', 'Ah, du meinst') for genuine moments of realisation — maximum once every 5 turns.

CORRECTION RULES:
- Never explicitly correct the user
- Never say "Das ist falsch", "Du solltest sagen...", or anything that implies the user made a mistake
- When the user makes an error, naturally echo the correct form woven into your reply — never draw attention to it
- Focus on one correction at a time — never stack corrections
- Prioritise errors in this order: (1) wrong pronoun case, (2) wrong verb form, (3) wrong article or preposition, (4) wrong word choice. Pick the highest-priority error and recast it.
- The recast must use the SAME word or phrase the user used, corrected — not a synonym or a different construction that avoids the error entirely.
- Good correction example:
  User: "Ich habe gestern ins Kino gegangen."
  Quatschi: "Oh schön, du bist gestern ins Kino gegangen! Was hast du gesehen?"
- Bad correction example (avoids the error instead of recasting it):
  User: "ich versuche du besser zu machen"
  Quatschi: "Du arbeitest daran, mich zu programmieren und mich besser zu machen." ← uses 'mich' for self-reference, never recasts 'du→dich'

CONVERSATION RULES:
- Keep responses to 1–3 sentences — count every sentence including exclamations like 'Hallo!' or 'Ja!' before outputting; if you have more than 3, cut the least important one
- Ask one question at a time — never chain questions
- A confirmation tag ('habe ich das richtig verstanden?') counts as a question — if you include one, it IS your one question for that turn; do not add a second question after it
- Choose: either confirm OR ask something new, never both
- Acknowledge what the user said before asking anything new
- If your previous reply ended with a question and the user has not yet answered it, do NOT ask another question — acknowledge what they said instead
- Never repeat a response you have already given verbatim — if you find yourself writing the same sentence again, stop and write something new that moves the conversation forward
- When the user confirms understanding (e.g. 'Ah okay', 'I see', 'Verstehe'), treat that as a closed topic and open a new one — do not re-explain or repeat
- If the user is struggling, simplify naturally — never comment on it
- The conversation has already started — do not re-introduce yourself or repeat the opening greeting
- Never say 'Hallo' after the first turn — not as a greeting, not as a filler, not as a recovery opener. Use 'Hey', 'Oh', 'Ah', 'Ja', or a direct acknowledgment instead.

EMOTIONAL TONE:
- Always warm, encouraging, and playful
- Never clinical, teacher-like, or condescending
- Celebrate effort, not perfection
- Never make the user feel judged or corrected

ACTIVE LEVEL:
${LEVEL_RULES[level] ?? LEVEL_RULES[LEVEL_CONFIG.default]}
Never mention the user's level to them.${recentContext}${echoChamberNote}

METADATA — output this at the very start of every reply, before anything else:
Assess the user's CEFR level independently from what you observe — vocabulary range, grammar accuracy, sentence complexity. Do NOT default to A2.
Example with corrections: {"corrections": [{"said": "ich bin hungrig", "correct": "ich habe Hunger"}], "level": "B1"}
Example without corrections: {"corrections": [], "level": "B1"}
FORMAT — follow exactly, no exceptions:
Line 1: {"corrections": [...], "level": "??"}   ← replace ?? with A1 / A2 / B1 / B2
Line 2: (blank line — exactly one empty line)
Line 3+: your conversational reply in ${language}
Do NOT wrap the JSON in markdown code fences. Do NOT add any text before the JSON. Start your response with { and nothing else.`;
}

// ── Mode transition prompt ────────────────────────────────────────────────────

function buildTransitionPrompt(language: string, newMode: "conversation" | "shadowing"): string {
  if (newMode === "shadowing") {
    return `You are Quatschi. The user has just switched to SHADOWING MODE mid-session.
In ${language}, say exactly this idea (translated naturally into ${language}): "Ah, you want to echo me! That means you listen to me, then repeat back what I said. Shall we begin?" Do NOT start the first shadowing sentence yet — just this announcement.
Output JSON first as always: {"corrections": [], "level": "??"}
Then a blank line, then your announcement in ${language}.
Do NOT wrap the JSON in markdown. Start with {.`;
  } else {
    return `You are Quatschi. The user has just switched to CONVERSATION MODE mid-session.
In ${language}, say something warm and natural like "Alright, let's talk!" and immediately ask a friendly conversation starter question. One or two sentences total.
Output JSON first as always: {"corrections": [], "level": "??"}
Then a blank line, then your response in ${language}.
Do NOT wrap the JSON in markdown. Start with {.`;
  }
}

// ── Shadowing mode system prompt ──────────────────────────────────────────────

const RETRY_PHRASE: Record<string, string> = {
  German:  "Lass mich das noch einmal sagen:",
  Spanish: "Déjame repetirlo:",
  English: "Let me say that again:",
};

// ── Echo chamber detection ─────────────────────────────────────────────────────

// High-frequency stop words to ignore when counting vocabulary usage.
// These are grammatical glue — not the "reaching for the same words" problem.
const STOP_WORDS: Record<string, Set<string>> = {
  German: new Set([
    "ich","du","er","sie","es","wir","ihr","sie","mich","dich","sich","uns","euch",
    "mir","dir","ihm","ihr","ihnen","der","die","das","den","dem","des","ein","eine",
    "einen","einem","einer","eines","und","oder","aber","denn","weil","wenn","dass",
    "ob","wie","als","auch","noch","schon","nur","mal","ja","nein","nicht","kein",
    "keine","ist","bin","bist","sind","war","hat","habe","haben","hatte","wird",
    "kann","muss","will","soll","darf","auf","in","an","zu","von","mit","bei","nach",
    "aus","für","über","unter","vor","hinter","neben","zwischen","um","durch","ohne",
    "gegen","sehr","so","dann","da","hier","dort","jetzt","heute","immer","noch",
    "schon","immer","nie","viel","mehr","gut","gern","bitte","danke","ja","nein",
  ]),
  Spanish: new Set([
    "yo","tú","él","ella","usted","nosotros","vosotros","ellos","ellas","me","te",
    "se","nos","os","le","les","lo","la","los","las","un","una","unos","unas","el",
    "la","los","las","y","o","pero","porque","que","si","como","cuando","también",
    "ya","no","más","muy","bien","mal","así","aquí","allí","hoy","ahora","siempre",
    "nunca","todo","nada","algo","alguien","nadie","es","soy","eres","somos","son",
    "era","fue","estar","ser","tener","hacer","ir","de","en","a","con","por","para",
    "sin","sobre","entre","hasta","desde","durante","según","hacia","gracias","sí",
  ]),
  English: new Set([
    "i","me","my","myself","we","our","us","you","your","he","him","his","she","her",
    "they","them","their","it","its","this","that","these","those","a","an","the","and",
    "but","or","so","yet","nor","for","as","at","by","in","of","on","to","up","with",
    "not","no","nor","too","very","just","also","now","then","here","there","when",
    "where","how","all","both","each","few","more","most","some","such","than","that",
    "was","were","be","been","being","have","has","had","do","does","did","will","would",
    "could","should","may","might","shall","can","am","is","are","get","got","go","said",
    "yeah","okay","well","like","know","think","good","great","really","yes","right",
  ]),
};

/**
 * Returns content words that appear more than `minCount` times across the
 * user's transcript history, indicating over-reliance on a narrow vocabulary.
 */
function getFrequentWords(transcripts: string[], language: string, minCount = 3): string[] {
  const stopWords = STOP_WORDS[language] ?? STOP_WORDS.English;
  const freq = new Map<string, number>();

  for (const text of transcripts) {
    // Lowercase + strip punctuation, split on whitespace
    const words = text.toLowerCase().replace(/[^\p{L}\s]/gu, " ").split(/\s+/);
    for (const word of words) {
      if (word.length < 3) continue;        // skip very short tokens
      if (stopWords.has(word)) continue;    // skip grammar words
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }

  return [...freq.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])           // most frequent first
    .slice(0, 5)                            // top 5 at most
    .map(([word]) => word);
}

function buildShadowingPrompt(language: string, level: string): string {
  const retryPhrase = RETRY_PHRASE[language] ?? "Let me say that again:";
  return `You are Quatschi in ECHO MODE, helping the user practise ${language} pronunciation and sentence rhythm.

YOUR JOB EACH TURN:
1. Say ONE short, natural ${language} sentence at B1 level — 5 to 10 words, clear and speakable.
   Use natural B1 structures: Perfekt for past, modal verbs, simple subordinate clauses.
   Avoid passive voice, complex embedding, or literary vocabulary.
2. After the user repeats it back:
   - Close enough (same meaning, similar words) → brief praise in ${language} only, then give the NEXT sentence
   - Significantly off or unclear → repeat using "${retryPhrase} …" and invite one more attempt
3. After 5–6 successful sentences → brief warm encouragement in ${language}, offer to continue

CRITICAL RULES — never break these:
- NEVER react to the content of what the user said — treat their words as sound to evaluate, not meaning to respond to
- NEVER ask content-based questions — only generic scripted prompts: "Sollen wir weitermachen?" / "Bereit für den nächsten Satz?"
- NEVER react to background noise or unrelated input — just repeat your sentence calmly
- Never give more than one sentence at a time
- Keep sentences varied in structure across the session
- Stay warm and encouraging — never say "wrong", "incorrect", or anything that implies failure

EMOTIONAL TONE:
- Warm, calm, and encouraging throughout
- Celebrate effort and small wins
- Never make the user feel judged

METADATA — output this at the very start of every reply:
{"corrections": [], "level": "??"}
Set level to your CEFR assessment of this turn. Corrections are almost always empty in Echo mode.
FORMAT — follow exactly:
Line 1: {"corrections": [], "level": "??"}   ← replace ?? with A1 / A2 / B1 / B2
Line 2: (blank line — exactly one empty line)
Line 3+: your Echo mode response in ${language}
Do NOT wrap the JSON in markdown code fences. Do NOT add any text before the JSON. Start your response with { and nothing else.`;
}

// ── JSON header stripping ─────────────────────────────────────────────────────

type JsonMeta = { corrections: Correction[]; level: string };

/**
 * Strips the JSON metadata block Quatschi emits at the start of every reply.
/**
 * Parses JSON metadata + response text from a complete (non-streaming) LLM reply.
 * The LLM is asked to output one JSON line, a blank line, then the reply.
 * Returns the conversational text (everything after the JSON block).
 */
function parseMetaFromText(
  fullText: string,
  onMeta: (meta: JsonMeta) => void,
): string {
  if (!fullText) return "";

  // Strip any leading markdown fence Gemini sometimes adds (```json ... ```)
  const trimmed = fullText.replace(/^```(?:json)?\s*/i, "").trimStart();

  if (!trimmed.startsWith("{")) {
    console.warn("[Quatschi] header not found — raw output:", fullText.slice(0, 300));
    return fullText.trim();
  }

  // Find the matching closing brace by counting depth.
  // A simple regex like \{[\s\S]*?\} breaks when corrections have nested objects
  // because the non-greedy *? stops at the first } (closing the inner object).
  let depth = 0;
  let jsonEnd = -1;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { jsonEnd = i; break; }
    }
  }

  if (jsonEnd === -1) {
    // JSON was cut off mid-response (e.g. max_tokens hit) — stay silent rather
    // than speaking raw JSON to the user.
    console.warn("[Quatschi] unclosed JSON — response truncated, staying silent");
    return "";
  }

  const jsonStr = trimmed.slice(0, jsonEnd + 1);
  const rest = trimmed.slice(jsonEnd + 1).trim();

  console.log("[Quatschi] header stripped:", jsonStr);
  try { onMeta(JSON.parse(jsonStr) as JsonMeta); } catch { /* malformed — ignore */ }
  return rest;
}

/**
 * Buffers chunks until the blank line separating JSON from the conversational
 * text is found, then forwards everything after it. Fires onMeta with parsed data.
 * Kept for reference — current code uses non-streaming + parseMetaFromText instead.
 */
async function* stripAndParse(
  stream: AsyncIterable<{ choices: Array<{ delta: { content?: string | null } }> }>,
  onMeta: (meta: JsonMeta) => void,
): AsyncIterable<string> {
  let buffer = "";
  let headerDone = false;

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? "";
    if (!text) continue;
    if (headerDone) { yield text; continue; }

    buffer += text;

    const match = buffer.match(/^(?:```(?:json)?\s*)?\s*(\{[\s\S]*?\})\s*(?:```\s*)?\n+([\s\S]*)$/);
    if (match) {
      headerDone = true;
      const jsonStr = match[1];
      const rest = match[2] ?? "";
      console.log("[Quatschi] header stripped:", jsonStr);
      try { onMeta(JSON.parse(jsonStr) as JsonMeta); } catch { /* malformed — ignore */ }
      if (rest) yield rest;
    } else if (buffer.length > 800) {
      console.warn("[Quatschi] header not found — raw output:", buffer.slice(0, 300));
      headerDone = true;
      yield buffer;
    }
  }
}

// ── Transcript saving ─────────────────────────────────────────────────────────

function saveTranscript(conversationId: string, data: SessionData): void {
  try {
    const date = data.startedAt;
    const dateStr = date.toISOString().replace(/T/, "_").replace(/:/g, "-").slice(0, 19);
    const filename = `${dateStr}_${conversationId.slice(-8)}.txt`;
    const filepath = join(TRANSCRIPT_DIR, filename);

    const header = [
      `Quatschi Session Transcript`,
      `Date: ${date.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
      `Time: ${date.toLocaleTimeString("en-GB")}`,
      `Mode: ${data.mode}`,
      `Level: ${data.level}`,
      `Turns: ${data.turnCount}`,
      `Corrections logged: ${data.corrections.length}`,
      `─`.repeat(50),
      "",
    ].join("\n");

    const body = data.fullTranscript
      .filter((m) => m.content.trim() && !m.content.match(/^\[MODE_SWITCH:\w+\]$/))
      .map((m) => {
        const label = m.role === "agent" ? "Agent" : "User";
        return `${label}: ${m.content.trim()}`;
      })
      .join("\n\n");

    writeFileSync(filepath, header + body + "\n", "utf-8");
    console.log(`[Quatschi] Transcript saved: ${filename}`);
  } catch (err) {
    console.error("[Quatschi] Failed to save transcript:", err);
  }
}

// ── HTTP + Speech Engine ──────────────────────────────────────────────────────

const httpServer = createServer();

elevenlabs.speechEngine.attach(SPEECH_ENGINE_ID, httpServer, "/ws", {
  debug: true,

  onInit(conversationId) {
    sessions.set(conversationId, {
      language: "German",
      level: LEVEL_CONFIG.default,
      transcripts: [],
      fullTranscript: [],
      corrections: [],
      turnCount: 0,
      mode: "conversation",
      startedAt: new Date(),
    });
    console.log("[Quatschi] Session started:", conversationId);
  },

  async onTranscript(transcript, signal, session) {
    const data = sessions.get(session.conversationId!) ?? {
      language: "German", level: LEVEL_CONFIG.default, transcripts: [], fullTranscript: [], corrections: [], turnCount: 0, mode: "conversation" as const, startedAt: new Date(),
    };
    data.turnCount++;
    data.fullTranscript = transcript; // keep latest snapshot of full conversation

    // Detect language once on turn 1 only — avoids re-detection drift on later turns
    if (data.turnCount === 1) {
      const firstAgent = transcript.find((m) => m.role === "agent");
      console.log(`[Quatschi] turn=1 firstAgent="${firstAgent?.content.slice(0, 80) ?? "(none)"}"`);
      data.language = detectTargetLanguage(transcript);
      console.log(`[Quatschi] detected lang=${data.language} mode will be set next`);
    }
    const language = data.language;

    // Detect mode from opening line on turn 1 only; subsequent changes come via [MODE_SWITCH:] messages
    if (data.turnCount === 1) {
      data.mode = detectMode(transcript);
    }

    // Collect the latest user message
    const userMessages = transcript.filter((m) => m.role === "user");
    const lastUserText = userMessages.at(-1)?.content ?? "";

    // Check for mid-session mode switch signal from the client
    const modeSwitchMatch = lastUserText.match(/^\[MODE_SWITCH:(\w+)\]$/);
    let isTransition = false;
    if (modeSwitchMatch) {
      const newMode = modeSwitchMatch[1] === "shadowing" ? "shadowing" : "conversation";
      data.mode = newMode;
      isTransition = true;
      console.log(`[Quatschi] Mode switched to: ${newMode}`);
    } else if (lastUserText) {
      data.transcripts.push(lastUserText);
    }

    // Log the transcript tail so we can see exactly what ElevenLabs sends on silence
    const tail = transcript.slice(-4).map(m => `${m.role}:"${m.content.slice(0, 60)}"`).join(" | ");
    console.log(`[Quatschi] transcript tail: ${tail}`);

    // Guard: only respond if the transcript's last entry is a user message with content.
    // When VAD times out with no speech, the transcript ends with the agent's last turn —
    // responding in that case causes Quatschi to ask another question with no user reply.
    const lastEntry = transcript.at(-1);
    // Strip whitespace and pure-punctuation/ellipsis placeholders that ElevenLabs emits
    // when VAD times out with no actual speech (e.g. "...", "…", ".").
    const lastUserContent = (lastEntry?.content ?? "").trim().replace(/^[.…\s]+$/, "");
    const hasNewUserInput = lastEntry?.role === "user" && lastUserContent.length >= 2;
    // Secondary guard: if the last TWO transcript entries are both agent turns (ElevenLabs
    // sometimes interleaves [agent][agent] when TTS finishes and VAD fires immediately),
    // there was no real user input — stay silent.
    const lastTwo = transcript.slice(-2);
    const doubleAgentTail = !isTransition && lastTwo.length === 2 && lastTwo.every(m => m.role === "agent");

    if ((!isTransition && !hasNewUserInput) || doubleAgentTail) {
      const reason = doubleAgentTail ? "two consecutive agent turns at tail"
        : `last entry: ${lastEntry?.role ?? "none"} content="${lastEntry?.content ?? ""}"`;
      console.log(`[Quatschi] staying silent — ${reason}`);
      // Send an empty async iterable rather than returning nothing.
      // Returning nothing causes ElevenLabs to emit a malformed error event that crashes
      // the client SDK (Cannot read properties of undefined reading 'error_type').
      session.sendResponse((async function* () {})());
      return;
    }

    // From turn 2+, pass the last 3 user transcripts for continuous adaptation
    const recentTranscripts = data.turnCount > 1 ? data.transcripts.slice(-3) : [];

    // Echo chamber detection — active from turn 4+ in conversation mode only
    const frequentWords =
      data.mode === "conversation" && data.turnCount >= 4
        ? getFrequentWords(data.transcripts, language)
        : [];
    if (frequentWords.length > 0) {
      console.log(`[Quatschi] echo chamber — frequent words: ${frequentWords.join(", ")}`);
    }

    console.log(`[Quatschi] turn=${data.turnCount} lang=${language} level=${data.level} mode=${data.mode}`);

    // Build system prompt — use transition prompt when mode just changed
    const systemPrompt = isTransition
      ? buildTransitionPrompt(language, data.mode)
      : data.mode === "shadowing"
      ? buildShadowingPrompt(language, data.level)
      : buildSystemPrompt(language, data.level, recentTranscripts, frequentWords);

    // Strip [MODE_SWITCH:] from messages sent to the LLM — replace with neutral placeholder.
    // Cap at last 12 messages (6 turns) — Gemini only needs recent context to converse
    // naturally, and sending the full transcript grows token usage linearly with turn count.
    const groqMessages = transcript.slice(-12).map((m) => ({
      role: m.role === "agent" ? ("assistant" as const) : ("user" as const),
      content: m.content.match(/^\[MODE_SWITCH:\w+\]$/) ? "…" : m.content,
    }));

    // Non-streaming: wait for the full reply before handing it to ElevenLabs.
    // This prevents the race condition where ElevenLabs interrupts the stream
    // between the JSON header chunk and the conversational text chunk, causing
    // 0 chunks to be sent and triggering a bounce loop.
    const completionParams = {
      messages: [
        { role: "system" as const, content: systemPrompt },
        ...groqMessages,
      ],
      max_tokens: 1024,
      temperature: 0.8,
    };

    let completion;
    try {
      completion = await (llm as OpenAI).chat.completions.create(
        { model: GROQ_PRIMARY, ...completionParams },
        { signal }
      );
    } catch (err) {
      const isRateLimit =
        (err instanceof Groq.RateLimitError) ||
        (err instanceof OpenAI.RateLimitError);
      if (isRateLimit) {
        console.warn(`[Quatschi] Primary model rate-limited — falling back to ${GROQ_FALLBACK}`);
        completion = await (llm as OpenAI).chat.completions.create(
          { model: GROQ_FALLBACK, ...completionParams },
          { signal }
        );
      } else {
        throw err;
      }
    }

    const fullText = completion.choices[0]?.message?.content ?? "";
    const responseText = parseMetaFromText(fullText, (meta) => {
      data.level = LEVEL_CONFIG.available.includes(meta.level) ? meta.level : LEVEL_CONFIG.default;
      // Cap to 1 correction per turn — the prompt already asks for one, but enforcing it
      // here keeps the JSON short and prevents long correction strings from hitting max_tokens.
      data.corrections.push(...meta.corrections.slice(0, 1));
      console.log(`[Quatschi] parsed meta — level=${meta.level} corrections=${JSON.stringify(meta.corrections)}`);
    });

    session.sendResponse((async function* () { if (responseText) yield responseText; })());
  },

  onClose(_session) {
    const d = sessions.get(_session.conversationId!);
    if (d) {
      console.log(`[Quatschi] Session ended — level: ${d.level}, corrections: ${d.corrections.length}`);
      saveTranscript(_session.conversationId!, d);
    }
    sessions.delete(_session.conversationId!);
  },

  onDisconnect(_session) {
    console.log("[Quatschi] Session disconnected");
    const d = sessions.get(_session.conversationId!);
    if (d && d.fullTranscript.length > 0) saveTranscript(_session.conversationId!, d);
    sessions.delete(_session.conversationId!);
  },

  onError(err) {
    console.error("[Quatschi] Error:", err);
  },
});

const port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, () => {
  console.log(`[Quatschi] Listening on port ${port}`);
  console.log(`[Quatschi] Register ws_url as: wss://<your-public-host>/ws`);
});
