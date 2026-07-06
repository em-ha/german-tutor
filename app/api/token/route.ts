import { NextRequest, NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { checkApiSecret } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const authError = checkApiSecret(req);
  if (authError) return authError;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.SPEECH_ENGINE_ID;

  if (!apiKey || !agentId) {
    return NextResponse.json(
      { error: "ElevenLabs Speech Engine is not configured." },
      { status: 503 }
    );
  }

  const elevenlabs = new ElevenLabsClient({ apiKey });
  const delays = [0, 1000, 2500]; // retry up to 3 times with backoff (ms)

  let lastErr: unknown;
  for (const delay of delays) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      const { token } =
        await elevenlabs.conversationalAi.conversations.getWebrtcToken({
          agentId,
        });
      return NextResponse.json({ token });
    } catch (err) {
      lastErr = err;
      console.warn(`[Token] attempt failed (delay=${delay}ms):`, err);
    }
  }

  console.error("[Token] all retries exhausted:", lastErr);
  return NextResponse.json(
    { error: "Failed to generate conversation token" },
    { status: 500 }
  );
}
