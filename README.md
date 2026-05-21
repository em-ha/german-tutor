# Deutsch Partner — Sprechen üben

Voice-first German **speaking** practice. The app hears you, replies in spoken German, and shows **only the latest partner line** on screen (no chat history).

**Iteration 1** uses the browser microphone and speech APIs plus mock replies — no API keys.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in **Chrome** (recommended).

## How to use

1. On load you hear a German greeting; that line appears in the center.
2. Tap the **large mic** → speak in German → tap again to stop, or finish speaking and wait.
3. The partner replies (spoken + shown); the screen shows **only the new line** (the previous one is replaced).
4. Tap **Neues Smalltalk-Thema** for a random conversation starter matched to your level (A1/A2/B1).
5. Use **Niveau** (A1/A2/B1), **Vorlesen**, and **Nochmal hören** as needed.
6. **Tap any word** in the partner’s line for gender, plural, translation, pronunciation, and **add to your practice list**.
7. Open **Üben** (top right) to review saved words — stored in your browser on this device.

## Tips

- **Desktop:** `localhost` is enough for the microphone.
- **Phone:** deploy with HTTPS (e.g. [Vercel](https://vercel.com)) so the mic works.
- Edit partner phrases in [`lib/prompts.ts`](lib/prompts.ts) and logic in [`lib/mockSpeakingPartner.ts`](lib/mockSpeakingPartner.ts).

## Iteration 2 (real AI, for web release)

When you want natural conversation and better audio:

1. Add `OPENAI_API_KEY` in `.env.local`.
2. Add `/api/transcribe`, `/api/chat`, `/api/speak`.
3. Swap the mock call in [`components/SpeakingPartner.tsx`](components/SpeakingPartner.tsx) for API fetch — the minimal UI stays the same.

## Scripts

| Command         | Description        |
|-----------------|--------------------|
| `npm run dev`   | Development server |
| `npm run build` | Production build   |
| `npm start`     | Run production     |
