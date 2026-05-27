/**
 * One-time script to configure the Speech Engine with a voice, language, and ws_url.
 * Run this whenever the ws_url changes (e.g. new ngrok session after a reboot).
 *
 * Usage:
 *   npm run engine:configure
 *
 * Requires ELEVENLABS_API_KEY, SPEECH_ENGINE_ID, ELEVENLABS_VOICE_ID, and WS_URL in .env.local
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const apiKey = process.env.ELEVENLABS_API_KEY;
const engineId = process.env.SPEECH_ENGINE_ID;
const voiceId = process.env.ELEVENLABS_VOICE_ID;
const wsUrl = process.env.WS_URL;

if (!apiKey || !engineId || !voiceId) {
  console.error(
    "ELEVENLABS_API_KEY, SPEECH_ENGINE_ID, and ELEVENLABS_VOICE_ID must all be set in .env.local"
  );
  process.exit(1);
}

if (!wsUrl) {
  console.error("WS_URL must be set in .env.local (e.g. wss://your-ngrok-url.ngrok-free.dev/ws)");
  process.exit(1);
}

const elevenlabs = new ElevenLabsClient({ apiKey });

await elevenlabs.speechEngine.update(engineId, {
  tts: {
    voiceId,
    modelId: "eleven_flash_v2_5", // low-latency conversational model
    stability: 0.65,
    similarityBoost: 0.75,
  },
  // language omitted — eleven_flash_v2_5 is multilingual and auto-detects
  // English, German, and Spanish from the user's speech.
  // Allow the browser client to set the opening greeting directly,
  // so ElevenLabs speaks it without a round-trip to our WebSocket server.
  overrides: { firstMessage: true },
  wsUrl,
});

console.log(`\n✅ Speech Engine ${engineId} configured`);
console.log(`   voice      → ${voiceId}`);
console.log(`   model      → eleven_flash_v2_5`);
console.log(`   lang       → auto-detect (multilingual)`);
console.log(`   firstMsg   → client override allowed`);
console.log(`   ws_url     → ${wsUrl}\n`);
