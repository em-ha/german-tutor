/**
 * One-time script to create the ElevenLabs Speech Engine via the SDK.
 * Run this once after you have a public WebSocket URL (ngrok or Railway).
 *
 * Usage:
 *   npm run engine:create -- wss://abc123.ngrok.io/ws
 *
 * Paste the returned SPEECH_ENGINE_ID into:
 *   - .env.local
 *   - Netlify environment variables
 *   - Railway environment variables
 */

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import "dotenv/config";

const wsUrl = process.argv[2];
if (!wsUrl) {
  console.error("Usage: npm run engine:create -- wss://<your-ngrok-or-railway-url>/ws");
  process.exit(1);
}

if (!process.env.ELEVENLABS_API_KEY) {
  console.error("ELEVENLABS_API_KEY is not set in .env.local");
  process.exit(1);
}

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

const engine = await elevenlabs.speechEngine.create({
  name: "Deutsch Partner",
  speechEngine: {
    wsUrl,
  },
});

console.log("\n✅ Speech Engine created!");
console.log(`   ID: ${engine.engineId}\n`);
console.log("Add this to .env.local:");
console.log(`   SPEECH_ENGINE_ID=${engine.engineId}\n`);
console.log("Also add SPEECH_ENGINE_ID to your Netlify + Railway environment variables.");
