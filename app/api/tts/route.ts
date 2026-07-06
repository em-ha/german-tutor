import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    return NextResponse.json(
      { error: "ElevenLabs is not configured." },
      { status: 503 }
    );
  }

  const body = await req.json() as { text?: string };
  const text = body.text?.trim();

  if (!text) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  // Use with-timestamps endpoint for precise word sync
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        language_code: "de", // forces German prosody + question uptalk
        voice_settings: {
          stability: 0.50,        // was 0.25 — more consistent, natural delivery
          similarity_boost: 0.75,
          style: 0.30,            // was 0.65 — less theatrical, more conversational
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("ElevenLabs error:", response.status, errorText);
    return NextResponse.json(
      { error: "ElevenLabs request failed" },
      { status: response.status }
    );
  }

  // Response is JSON with audio_base64 + character alignment
  const data = await response.json() as {
    audio_base64: string;
    alignment: {
      characters: string[];
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    };
  };

  // Convert character alignment to word-level timing
  const { characters, character_start_times_seconds } = data.alignment;
  const wordTimings: { word: string; startMs: number }[] = [];

  let currentWord = "";
  let wordStart = 0;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    if (char === " " || i === characters.length - 1) {
      if (char !== " ") currentWord += char;
      if (currentWord.trim()) {
        wordTimings.push({
          word: currentWord.trim(),
          startMs: Math.round(wordStart * 1000),
        });
      }
      currentWord = "";
      wordStart = character_start_times_seconds[i + 1] ?? 0;
    } else {
      if (currentWord === "") wordStart = character_start_times_seconds[i];
      currentWord += char;
    }
  }

  return NextResponse.json({
    audioBase64: data.audio_base64,
    wordTimings,
  });
}
