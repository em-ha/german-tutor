/**
 * One-time script to create the ElevenLabs Speech Engine.
 * Run this once after you have a public WebSocket URL (ngrok or Railway).
 *
 * Usage:
 *   npx tsx server/create-engine.mts <ws_url>
 *
 * Example:
 *   npx tsx server/create-engine.mts wss://abc123.ngrok.io/ws
 *
 * Paste the returned speech_engine_id into .env.local as SPEECH_ENGINE_ID
 * and into your Netlify / Railway environment variables.
 */

import "dotenv/config";

const wsUrl = process.argv[2];
if (!wsUrl) {
  console.error("Usage: npx tsx server/create-engine.mts <ws_url>");
  console.error("Example: npx tsx server/create-engine.mts wss://abc123.ngrok.io/ws");
  process.exit(1);
}

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error("ELEVENLABS_API_KEY is not set in .env.local");
  process.exit(1);
}

const res = await fetch("https://api.elevenlabs.io/v1/speech-engine", {
  method: "POST",
  headers: {
    "xi-api-key": apiKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "Deutsch Partner",
    speech_engine: { ws_url: wsUrl },
    asr: { language: "de" },           // German speech recognition
  }),
});

if (!res.ok) {
  const err = await res.text();
  console.error("Failed to create Speech Engine:", res.status, err);
  process.exit(1);
}

const data = await res.json() as { speech_engine_id: string; name: string };

console.log("\n✅ Speech Engine created!");
console.log(`   Name: ${data.name}`);
console.log(`   ID:   ${data.speech_engine_id}\n`);
console.log("Add this to .env.local:");
console.log(`   SPEECH_ENGINE_ID=${data.speech_engine_id}\n`);
console.log("And add it to your Netlify + Railway environment variables.");
