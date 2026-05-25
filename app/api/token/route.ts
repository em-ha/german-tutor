import { NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.SPEECH_ENGINE_ID;

  if (!apiKey || !agentId) {
    return NextResponse.json(
      { error: "ElevenLabs Speech Engine is not configured." },
      { status: 503 }
    );
  }

  try {
    const elevenlabs = new ElevenLabsClient({ apiKey });
    const { token } =
      await elevenlabs.conversationalAi.conversations.getWebrtcToken({
        agentId,
      });
    return NextResponse.json({ token });
  } catch (err) {
    console.error("[Token] ElevenLabs error:", err);
    return NextResponse.json(
      { error: "Failed to generate conversation token" },
      { status: 500 }
    );
  }
}
