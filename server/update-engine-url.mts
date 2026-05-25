/**
 * Update the ws_url of an existing Speech Engine.
 * Use this when moving from ngrok (local) to Railway (production).
 *
 * Usage:
 *   npx tsx server/update-engine-url.mts <new_ws_url>
 *
 * Example:
 *   npx tsx server/update-engine-url.mts wss://your-app.up.railway.app/ws
 *
 * SPEECH_ENGINE_ID must already be set in .env.local
 */

import "dotenv/config";

const wsUrl = process.argv[2];
if (!wsUrl) {
  console.error("Usage: npx tsx server/update-engine-url.mts <new_ws_url>");
  process.exit(1);
}

const apiKey = process.env.ELEVENLABS_API_KEY;
const engineId = process.env.SPEECH_ENGINE_ID;

if (!apiKey || !engineId) {
  console.error("ELEVENLABS_API_KEY and SPEECH_ENGINE_ID must be set in .env.local");
  process.exit(1);
}

const res = await fetch(`https://api.elevenlabs.io/v1/speech-engine/${engineId}`, {
  method: "PATCH",
  headers: {
    "xi-api-key": apiKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    speech_engine: { ws_url: wsUrl },
  }),
});

if (!res.ok) {
  const err = await res.text();
  console.error("Failed to update Speech Engine:", res.status, err);
  process.exit(1);
}

console.log(`\n✅ Speech Engine ${engineId} updated`);
console.log(`   ws_url → ${wsUrl}\n`);
