import { NextRequest, NextResponse } from "next/server";
import { checkApiSecret } from "@/lib/apiAuth";

export async function POST(req: NextRequest) {
  const authError = checkApiSecret(req);
  if (authError) return authError;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY not set" }, { status: 503 });
  }

  const body = await req.json() as { text?: string; sourceLang?: string };
  const { text, sourceLang = "de" } = body;

  if (!text?.trim()) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  const langNames: Record<string, string> = {
    en: "English",
    de: "German",
    es: "Spanish",
  };
  const langName = langNames[sourceLang] ?? "the given language";

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are a translator. Translate the following ${langName} text into natural, fluent English. Return only the translation — no explanations, no extra text.`,
        },
        {
          role: "user",
          content: text.trim(),
        },
      ],
      max_tokens: 200,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[Translate] Groq error", response.status, errText);
    return NextResponse.json({ error: "Translation failed" }, { status: response.status });
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const translation = data.choices?.[0]?.message?.content?.trim();
  if (!translation) {
    return NextResponse.json({ error: "No translation returned" }, { status: 500 });
  }

  return NextResponse.json({ translation });
}
