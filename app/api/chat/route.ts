import { NextRequest, NextResponse } from "next/server";
import { checkApiSecret } from "@/lib/apiAuth";

const SYSTEM_PROMPT = `You are a friendly German conversation partner helping someone practise spoken German.

Your job:
- Respond naturally in German to what the user says
- Keep responses SHORT — 1 to 3 sentences maximum, since they will be spoken aloud
- Gently correct mistakes by modelling the correct form naturally in your reply (don't lecture)
- Ask a follow-up question to keep the conversation going
- Stay warm, encouraging and patient

Important: Always reply in German. If the user writes in English, gently remind them to try in German.`;

type ChatRequest = {
  userText: string;
  turnCount: number;
  lastAssistantText: string | null;
  topicContext?: string | null;
};

export async function POST(req: NextRequest) {
  const authError = checkApiSecret(req);
  if (authError) return authError;

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not set in .env.local" },
      { status: 503 }
    );
  }

  const body = await req.json() as ChatRequest;
  const { userText, turnCount, lastAssistantText, topicContext } = body;

  if (!userText?.trim()) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  const contextNote = topicContext ? `\nThe current conversation topic is: ${topicContext}` : "";
  const history = lastAssistantText
    ? `\nYour last message was: "${lastAssistantText}"\nThis is turn ${turnCount + 1} of the conversation.`
    : `\nThis is the start of the conversation (turn ${turnCount + 1}).`;

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
          content: SYSTEM_PROMPT + contextNote + history,
        },
        {
          role: "user",
          content: userText.trim(),
        },
      ],
      max_tokens: 150,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[Groq] API error", response.status, errText);
    return NextResponse.json({ error: "Groq request failed" }, { status: response.status });
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const replyText = data.choices?.[0]?.message?.content?.trim();

  if (!replyText) {
    return NextResponse.json({ error: "No response from Groq" }, { status: 500 });
  }

  return NextResponse.json({ reply: replyText });
}
