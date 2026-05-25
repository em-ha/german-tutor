/**
 * ElevenLabs Speech Engine WebSocket server.
 *
 * ElevenLabs dials into this server when a user starts a conversation,
 * sends user transcripts via WebSocket, and we respond with Groq LLM text.
 * ElevenLabs handles STT, turn-taking, TTS, and audio delivery to the browser.
 *
 * Deploy to Railway. Required env vars:
 *   ELEVENLABS_API_KEY   — your ElevenLabs API key
 *   GROQ_API_KEY         — your Groq API key
 *   SPEECH_ENGINE_ID     — the Speech Engine ID (seng_...)
 *
 * After deploy, register the Railway public URL as the ws_url in the
 * ElevenLabs dashboard (Conversational AI → Speech Engines → your engine).
 */

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createServer } from "node:http";
import Groq from "groq-sdk";
import "dotenv/config";

const SPEECH_ENGINE_ID = process.env.SPEECH_ENGINE_ID;
if (!SPEECH_ENGINE_ID) throw new Error("SPEECH_ENGINE_ID env var is required");
if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY env var is required");
if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY env var is required");

const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are a friendly German conversation partner helping someone practise spoken German.

Your job:
- Respond naturally in German to what the user says
- Keep responses SHORT — 1 to 3 sentences maximum, since they will be spoken aloud
- Gently correct mistakes by modelling the correct form naturally in your reply (don't lecture)
- Ask a follow-up question to keep the conversation going
- Stay warm, encouraging and patient
- Adapt to the user's level: use simpler language if they struggle, more natural speech if they're fluent

Important: Always reply in German. If the user writes in English, gently remind them to try in German.`;

const httpServer = createServer();

// Fetch the Speech Engine resource from ElevenLabs API, then attach to our HTTP server.
const engine = await elevenlabs.speechEngine.get(SPEECH_ENGINE_ID);

engine.attach(httpServer, "/ws", {
  debug: true,

  onInit(conversationId, _session) {
    console.log("[Speech Engine] Session started:", conversationId);
  },

  async onTranscript(transcript, signal, session) {
    console.log("[Speech Engine] Transcript received, turns:", transcript.length);

    // Groq's streaming API is OpenAI-compatible; SpeechEngineSession.sendResponse
    // natively parses choices[0].delta.content from the stream.
    const stream = await groq.chat.completions.create(
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...transcript.map((m) => ({
            role: m.role === "agent" ? ("assistant" as const) : ("user" as const),
            content: m.content,
          })),
        ],
        max_tokens: 150,
        temperature: 0.8,
        stream: true,
      },
      { signal }
    );

    session.sendResponse(stream);
  },

  onClose(_session) {
    console.log("[Speech Engine] Session closed cleanly");
  },

  onDisconnect(_session) {
    console.log("[Speech Engine] Session disconnected");
  },

  onError(err, _session) {
    console.error("[Speech Engine] Error:", err);
  },
});

const port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, () => {
  console.log(`[Speech Engine] Listening on port ${port}`);
  console.log(`[Speech Engine] Register this as: wss://<your-railway-url>/ws`);
});
