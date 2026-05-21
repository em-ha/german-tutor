"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSpeakingReply,
  type GermanLevel,
} from "@/lib/mockSpeakingPartner";
import { OPENING_LINE } from "@/lib/prompts";
import { useSpeechRecognition } from "@/lib/speech/useSpeechRecognition";
import { useSpeechSynthesis } from "@/lib/speech/useSpeechSynthesis";
import { getRandomSmallTalkTopic } from "@/lib/smallTalkTopics";
import { usePracticeList } from "@/lib/practiceList/usePracticeList";
import { streamText } from "@/lib/streamText";
import { MicControl } from "./MicControl";
import { PracticeListSheet } from "./PracticeListSheet";
import { TranscriptDisplay, type PartnerStatus } from "./TranscriptDisplay";

export function SpeakingPartner() {
  const [status, setStatus] = useState<PartnerStatus>("idle");
  const [lastAssistantText, setLastAssistantText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [level, setLevel] = useState<GermanLevel>("A2");
  const [localError, setLocalError] = useState<string | null>(null);
  const [topicLabel, setTopicLabel] = useState<string | null>(null);

  const turnCountRef = useRef(0);
  const lastAssistantRef = useRef<string | null>(null);
  const lastTopicIdRef = useRef<string | null>(null);
  const greetedRef = useRef(false);
  const processingRef = useRef(false);
  const streamAbortRef = useRef<AbortController | null>(null);

  const speech = useSpeechRecognition();
  const tts = useSpeechSynthesis();
  const { words: practiceWords, remove: removePracticeWord } = usePracticeList();
  const [practiceListOpen, setPracticeListOpen] = useState(false);

  const deliverReply = useCallback(
    async (replyText: string, countTurn: boolean) => {
      streamAbortRef.current?.abort();
      const controller = new AbortController();
      streamAbortRef.current = controller;

      setStatus("thinking");
      setIsStreaming(true);
      setLastAssistantText("");

      try {
        await streamText(
          replyText,
          (partial) => setLastAssistantText(partial),
          controller.signal
        );
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setLastAssistantText(replyText);
        }
      }

      setIsStreaming(false);
      lastAssistantRef.current = replyText;
      if (countTurn) turnCountRef.current += 1;

      if (tts.autoSpeak && tts.supported) {
        setStatus("speaking");
        tts.speak(replyText, () => setStatus("idle"));
      } else {
        setStatus("idle");
      }
    },
    [tts]
  );

  const handleUserSpeech = useCallback(
    async (userText: string) => {
      if (processingRef.current) return;
      processingRef.current = true;
      speech.stop();

      const reply = getSpeakingReply({
        userText,
        level,
        turnCount: turnCountRef.current,
        lastAssistantText: lastAssistantRef.current,
      });

      await deliverReply(reply, true);
      processingRef.current = false;
    },
    [level, deliverReply, speech]
  );

  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    void deliverReply(OPENING_LINE, false);
  }, [deliverReply]);

  const displayError = localError ?? speech.error;

  const handleMicPress = useCallback(() => {
    setLocalError(null);
    speech.clearError();

    if (status === "listening") {
      speech.stop();
      if (!processingRef.current) {
        setStatus("idle");
      }
      return;
    }

    if (status !== "idle") return;

    processingRef.current = false;
    setStatus("listening");
    speech.start((finalText) => {
      void handleUserSpeech(finalText);
    });
  }, [status, speech, handleUserSpeech]);

  const handleReplay = useCallback(() => {
    if (!lastAssistantText || status === "speaking") return;
    setStatus("speaking");
    tts.speak(lastAssistantText, () => setStatus("idle"));
  }, [lastAssistantText, status, tts]);

  const handleRandomTopic = useCallback(() => {
    if (status !== "idle" || isStreaming) return;
    setLocalError(null);
    speech.clearError();
    speech.stop();

    const pick = getRandomSmallTalkTopic(level, lastTopicIdRef.current);
    lastTopicIdRef.current = pick.topicId;
    setTopicLabel(pick.label);
    turnCountRef.current = 0;
    lastAssistantRef.current = null;

    void deliverReply(pick.text, false);
  }, [status, isStreaming, level, speech, deliverReply]);

  const canStartTopic = status === "idle" && !isStreaming;

  return (
    <div className="flex h-dvh flex-col bg-white dark:bg-zinc-950 lg:h-full">
      <header className="shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="lg:hidden">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Deutsch Partner
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Sprich — höre — übe
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPracticeListOpen(true)}
            className="relative flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            aria-label={`Übungsliste, ${practiceWords.length} Wörter`}
          >
            <BookmarkIcon />
            Üben
            {practiceWords.length > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-xs font-medium text-white">
                {practiceWords.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {displayError && (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200 sm:mx-6"
        >
          {displayError}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => {
              setLocalError(null);
              speech.clearError();
            }}
          >
            OK
          </button>
        </div>
      )}

      <TranscriptDisplay
        text={lastAssistantText}
        status={status}
        isStreaming={isStreaming}
        topicLabel={topicLabel}
        onPronounceWord={(word) => tts.speak(word)}
      />

      <MicControl
        status={status}
        micSupported={speech.supported}
        ttsSupported={tts.supported}
        autoSpeak={tts.autoSpeak}
        onAutoSpeakChange={tts.setAutoSpeak}
        onMicPress={handleMicPress}
        onReplay={handleReplay}
        canReplay={lastAssistantText.length > 0}
        onRandomTopic={handleRandomTopic}
        canStartTopic={canStartTopic}
        level={level}
        onLevelChange={setLevel}
      />

      <PracticeListSheet
        open={practiceListOpen}
        words={practiceWords}
        onClose={() => setPracticeListOpen(false)}
        onRemove={removePracticeWord}
        onPronounce={(word) => tts.speak(word)}
      />
    </div>
  );
}

function BookmarkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  );
}
