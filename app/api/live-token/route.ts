import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Modality } from "@google/genai";
import {
  buildSystemPrompt,
  buildShadowingPrompt,
  LEVEL_CONFIG,
} from "@/lib/prompts/quatschi";

/**
 * Mints a short-lived ephemeral token for a Gemini Live session, mirroring
 * the previous ElevenLabs /api/token route: the browser connects DIRECTLY to
 * Gemini using this token (Google's own recommended production pattern) — this
 * server never sits in the audio path.
 *
 * Confirmed via the S0.1 spike (server/_spike-s01-connect.mts, deleted after
 * use): the SDK requires `apiVersion: 'v1alpha'` on the CLIENT that connects
 * with the resulting token, not on this minting call. That belongs in
 * useGeminiLive (Stage 3) / the lab harness, not here.
 *
 * Mode-aware because the token can lock `liveConnectConstraints.config`,
 * including `systemInstruction` — so the B1 prompt is baked server-side into
 * the token rather than shipped to the browser on every connect.
 */

export const runtime = "nodejs";

const MODEL = "gemini-3.1-flash-live-preview"; // chosen via the S0.2 spike

export async function GET(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") === "shadowing" ? "shadowing" : "conversation";
  const level = LEVEL_CONFIG.available.includes(searchParams.get("level") ?? "")
    ? (searchParams.get("level") as string)
    : LEVEL_CONFIG.default;

  const systemInstruction =
    mode === "shadowing"
      ? buildShadowingPrompt("German", level)
      : buildSystemPrompt("German", level, [], []);

  const ai = new GoogleGenAI({ apiKey });

  try {
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model: MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction,
            outputAudioTranscription: {},
            inputAudioTranscription: {},
            sessionResumption: {},
            contextWindowCompression: { slidingWindow: {} },
          },
        },
      },
    });

    if (!token.name) {
      throw new Error("Token creation returned no name");
    }

    // Gemini tokens are opaque strings, not JWTs — there is no `exp` claim to
    // decode client-side. Return the expiry explicitly instead (this is the
    // fix for the isTokenFresh bug flagged for Stage 4).
    return NextResponse.json({
      token: token.name,
      model: MODEL,
      mode,
      level,
      newSessionExpiresAt: newSessionExpireTime,
    });
  } catch (err) {
    console.error("[live-token] failed to mint token:", err);
    return NextResponse.json(
      { error: "Failed to generate Live API token" },
      { status: 500 }
    );
  }
}
