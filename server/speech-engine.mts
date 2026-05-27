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
import Groq from "groq-sdk";
import { config } from "dotenv";
config({ path: ".env.local" });

const SPEECH_ENGINE_ID = process.env.SPEECH_ENGINE_ID;
if (!SPEECH_ENGINE_ID) throw new Error("SPEECH_ENGINE_ID env var is required");
if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY env var is required");
if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY env var is required");

const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const GROQ_PRIMARY = "llama-3.3-70b-versatile";
const GROQ_FALLBACK = "llama-3.1-8b-instant";

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
  transcripts: string[];  // user turn texts, accumulated for level calibration
  corrections: Correction[];
  turnCount: number;
  mode: "conversation" | "shadowing";
}

const sessions = new Map<string, SessionData>();

// ── Level → TTS stability mapping ────────────────────────────────────────────

const STABILITY_MAP: Record<string, number> = { A1: 0.9, A2: 0.8, B1: 0.6, B2: 0.4 };

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(language: string, level: string, recentTranscripts: string[], frequentWords: string[] = []): string {
  const recentContext = recentTranscripts.length > 0
    ? `\nThe user's last ${recentTranscripts.length} message(s) for level calibration:\n${recentTranscripts.map((t, i) => `[Turn ${i + 1}]: ${t}`).join("\n")}`
    : "";

  const echoChamberNote = frequentWords.length > 0
    ? `\nThe user keeps reaching for the same words: ${frequentWords.join(", ")}. Weave richer alternatives naturally into your reply — never point this out directly.`
    : "";

  return `You are Quatschi, a friendly spoken language practice partner helping the user build confidence speaking ${language}.

You are not a teacher. You are warm, playful, encouraging. Keep responses short — 1 to 3 sentences (spoken aloud). Ask one question at a time.
ALWAYS respond in ${language}. If the user is completely stuck, use their stronger language for one sentence only, then return immediately.

CRITICAL — never ask a chained question: if your previous reply already ended with a question and the user has not yet answered it, do NOT ask another question. Acknowledge what they said (or gently wait) instead. Only ask a new question once the user has actually responded to the last one.

Calibrate your vocabulary and sentence complexity to the user's actual observed level. If they handle complex grammar confidently, use richer language. If they struggle, simplify. Never mention their level to the user.${recentContext}${echoChamberNote}

Never explicitly correct the user. When they make a grammar or vocabulary error, naturally echo the correct form woven into your reply without drawing attention to it.

At the very start of every reply, output a JSON block. You MUST independently assess the user's CEFR level from what you observe — look at their vocabulary range, grammar accuracy, and sentence complexity. Do NOT default to A2.
Example with corrections: {"corrections": [{"said": "ich bin hungrig", "correct": "ich habe Hunger"}], "level": "B1"}
Example without corrections: {"corrections": [], "level": "B2"}
Replace the level with YOUR assessment: A1 (very basic), A2 (elementary), B1 (intermediate), B2 (upper-intermediate).
Follow the JSON block with a blank line, then your conversational response.
METADATA FORMAT — follow exactly, no exceptions:
Line 1: {"corrections": [...], "level": "??"}   ← replace ?? with your actual assessment
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
  return `You are Quatschi in ECHO MODE, helping the user practise ${language} pronunciation and fluency.

Your job each turn:
1. Say ONE short, natural sentence in ${language} appropriate for ${level} level (5–10 words).
2. After the user repeats it back, check their response against what you said:
   - Close enough (same meaning, similar words): praise them briefly in ${language} only (NEVER in German unless this IS a German session), then give the NEXT sentence.
   - Significantly off or unclear: say the sentence again naturally using "${retryPhrase} …" and invite one more attempt.
3. After 5–6 successful sentences, give brief encouraging feedback and offer to continue.

CRITICAL RULES — never break these:
- NEVER ask questions about or react to the content of what the user said. Their words are only a repetition attempt — treat them as sounds to evaluate, not as meaning to respond to.
- NEVER react to background noise, random words, or anything that is not a clear repetition attempt. If the input seems like noise or is unrelated to your sentence — just repeat your sentence again.
- Any questions you ask must be generic and scripted (e.g. "Shall we continue?", "Ready for the next one?") — never based on what you heard.
- Never give more than one sentence at a time.
- Keep sentences clear and progressively more varied in structure.
- Stay warm and encouraging. Never say "wrong" or "incorrect."
- Match sentence complexity to ${level} level.

At the very start of every reply output a JSON block, then your response:
{"corrections": [], "level": "??"}
Set level to your CEFR assessment of this turn. Corrections are usually empty in shadowing mode.
METADATA FORMAT — follow exactly, no exceptions:
Line 1: {"corrections": [], "level": "??"}   ← replace ?? with A1/A2/B1/B2
Line 2: (blank line — exactly one empty line)
Line 3+: your shadowing response in ${language}

Do NOT wrap the JSON in markdown code fences. Do NOT add any text before the JSON. Start your response with { and nothing else.`;
}

// ── JSON header stripping ─────────────────────────────────────────────────────

type JsonMeta = { corrections: Correction[]; level: string };

/**
 * Strips the JSON metadata block Quatschi emits at the start of every reply.
 * Buffers chunks until the blank line separating JSON from the conversational
 * text is found, then forwards everything after it. Fires onMeta with parsed data.
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

// ── HTTP + Speech Engine ──────────────────────────────────────────────────────

const httpServer = createServer();

elevenlabs.speechEngine.attach(SPEECH_ENGINE_ID, httpServer, "/ws", {
  debug: true,

  onInit(conversationId) {
    sessions.set(conversationId, {
      language: "German",
      level: "A2",
      transcripts: [],
      corrections: [],
      turnCount: 0,
      mode: "conversation",
    });
    console.log("[Quatschi] Session started:", conversationId);
  },

  async onTranscript(transcript, signal, session) {
    const data = sessions.get(session.conversationId!) ?? {
      language: "German", level: "A2", transcripts: [], corrections: [], turnCount: 0, mode: "conversation" as const,
    };
    data.turnCount++;

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

    // Strip [MODE_SWITCH:] from messages sent to the LLM — replace with neutral placeholder
    const groqMessages = transcript.map((m) => ({
      role: m.role === "agent" ? ("assistant" as const) : ("user" as const),
      content: m.content.match(/^\[MODE_SWITCH:\w+\]$/) ? "…" : m.content,
    }));

    const groqParams = {
      messages: [
        { role: "system" as const, content: systemPrompt },
        ...groqMessages,
      ],
      max_tokens: 150,
      temperature: 0.8,
      stream: true as const,
    };

    let stream;
    try {
      stream = await groq.chat.completions.create(
        { model: GROQ_PRIMARY, ...groqParams },
        { signal }
      );
    } catch (err) {
      if (err instanceof Groq.RateLimitError) {
        console.warn(`[Quatschi] Primary model rate-limited — falling back to ${GROQ_FALLBACK}`);
        stream = await groq.chat.completions.create(
          { model: GROQ_FALLBACK, ...groqParams },
          { signal }
        );
      } else {
        throw err;
      }
    }

    session.sendResponse(
      stripAndParse(stream, (meta) => {
        data.level = meta.level;
        data.corrections.push(...meta.corrections);
        console.log(`[Quatschi] parsed meta — level=${meta.level} corrections=${JSON.stringify(meta.corrections)}`);
      })
    );
  },

  onClose(_session) {
    const d = sessions.get(_session.conversationId!);
    if (d) {
      console.log(`[Quatschi] Session ended — level: ${d.level}, corrections: ${d.corrections.length}`);
    }
    sessions.delete(_session.conversationId!);
  },

  onDisconnect(_session) {
    console.log("[Quatschi] Session disconnected");
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
