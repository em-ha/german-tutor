"use client";

import { Component, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { LANGUAGES, type Language } from "@/lib/languages";
import { useMouthAnimation } from "@/lib/useMouthAnimation";
import type { Emotion } from "./CharacterAvatar";
import { CharacterAvatar } from "./CharacterAvatar";
import { MicControl } from "./MicControl";
import { TranscriptDisplay, type PartnerStatus } from "./TranscriptDisplay";

// ── Error boundary — catches SDK crashes (e.g. malformed ElevenLabs error events) ──
class SdkErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  componentDidCatch(err: unknown) {
    console.error("[SpeakingPartner] SDK error caught by boundary:", err);
  }
  render() {
    if (this.state.crashed) {
      return (
        <div className="relative h-dvh overflow-hidden bg-[#161d2f] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            <p className="text-white/70 text-sm">Something went wrong. Please refresh to continue.</p>
            <button
              type="button"
              className="rounded-xl bg-white/10 px-5 py-2.5 text-sm text-white hover:bg-white/20"
              onClick={() => { this.setState({ crashed: false }); window.location.reload(); }}
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const GERMAN = LANGUAGES.find((l) => l.code === "de")!;

// ── Inner component (must be inside ConversationProvider) ────────────────────
function SpeakingPartnerContent() {
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastAssistantText, setLastAssistantText] = useState("");

  // null = picker shown; non-null = session started with that language
  const [selectedLanguage, setSelectedLanguage] = useState<Language | null>(null);

// Mode selection
  const [mode, setMode] = useState<"conversation" | "shadowing">("conversation");

  // Ref used to restart the session in a new mode after endSession() resolves
  const pendingModeRestartRef = useRef<{ newMode: "conversation" | "shadowing" } | null>(null);

  // Translate feature
  const [translation, setTranslation] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  // Copy feature
  const [copied, setCopied] = useState(false);

  // Sleep feature
  const SLEEP_AFTER_MS = 45_000;
  const [isAsleep, setIsAsleep] = useState(false);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set to true when the user deliberately ends the session (X button / language switch).
  // onDisconnect uses this to distinguish user-initiated ends from ElevenLabs timeouts.
  const userEndedSessionRef = useRef(false);
  // True while a startSession call is in-flight (before onConnect fires).
  // Prevents onDisconnect from triggering sleep when a NEW session fails to start.
  const isStartingSessionRef = useRef(false);
  // True only when our own 45s timer fires — so onDisconnect knows sleep was intentional.
  const sleepInitiatedRef = useRef(false);
  // Counts auto-reconnect attempts after an unexpected ElevenLabs drop; resets on successful connect.
  const reconnectAttemptsRef = useRef(0);

  const { mouthOpenness, onBoundary, reset: resetMouth } = useMouthAnimation();

  // ── Sleep timer helpers ─────────────────────────────────────────────────────
  const clearSleepTimer = useCallback(() => {
    if (sleepTimerRef.current) { clearTimeout(sleepTimerRef.current); sleepTimerRef.current = null; }
  }, []);

  // ── ElevenLabs Speech Engine conversation ───────────────────────────────────
  // scheduleSleep is defined after conversation to avoid forward-ref; we use a ref for the callback.
  const scheduleSleepRef = useRef<() => void>(() => {});
  // Ref to selectedLanguage so onDisconnect can read current value without stale closure.
  const selectedLanguageRef = useRef<Language | null>(null);
  useEffect(() => { selectedLanguageRef.current = selectedLanguage; }, [selectedLanguage]);

  const conversation = useConversation({
    onConnect: () => {
      setLocalError(null);
      setIsAsleep(false);
      userEndedSessionRef.current = false;
      isStartingSessionRef.current = false;
      sleepInitiatedRef.current = false;
      reconnectAttemptsRef.current = 0;
      scheduleSleepRef.current();
    },
    onDisconnect: () => {
      const wasStarting = isStartingSessionRef.current;
      isStartingSessionRef.current = false;
      clearSleepTimer();
      resetMouth();
      setExcitement(0);
      smoothedExcitementRef.current = 0;

      // Session failed before fully connecting — go back to picker.
      if (wasStarting) {
        setSelectedLanguage(null);
        return;
      }

      // Our 45s timer fired and ended the session — confirm sleep state.
      if (sleepInitiatedRef.current) {
        sleepInitiatedRef.current = false;
        setIsAsleep(true); // already set by timer, but idempotent
        return;
      }

      // Unexpected ElevenLabs disconnect (network glitch, VAD timeout, etc.)
      // → auto-reconnect up to 2 times before giving up and going back to picker.
      if (!userEndedSessionRef.current && selectedLanguageRef.current && !pendingModeRestartRef.current) {
        if (reconnectAttemptsRef.current < 2) {
          reconnectAttemptsRef.current += 1;
          setTimeout(() => { void reconnectRef.current(); }, 1000);
        } else {
          reconnectAttemptsRef.current = 0;
          setSelectedLanguage(null);
        }
        return;
      }
    },
    onError: (message) => {
      setLocalError(typeof message === "string" ? message : "Connection error");
    },
    onMessage: ({ message, source }) => {
      // Capture the latest agent utterance for translate/copy
      if (source === "ai") {
        setLastAssistantText(message);
        resetTranslation();
      }
      // Reset inactivity timer on every user turn
      if (source === "user") scheduleSleepRef.current();
    },
    onModeChange: ({ mode }) => {
      resetMouth();
      if (mode === "speaking") {
        resetTranslation();
      }
      // Agent finished speaking — user's turn begins, restart the inactivity clock
      if (mode === "listening") scheduleSleepRef.current();
    },
  });

  // ── Define scheduleSleep now that conversation is available ─────────────────
  const scheduleSleep = useCallback(() => {
    clearSleepTimer();
    sleepTimerRef.current = setTimeout(() => {
      setIsAsleep(true);
      sleepInitiatedRef.current = true; // tell onDisconnect this was intentional
      void conversation.endSession();
    }, SLEEP_AFTER_MS);
  }, [clearSleepTimer, conversation]);

  // Keep the ref in sync so the callbacks above always call the latest version
  useEffect(() => { scheduleSleepRef.current = scheduleSleep; }, [scheduleSleep]);

  // Derive a PartnerStatus from the ElevenLabs conversation state
  const status: PartnerStatus =
    conversation.status === "disconnected" || conversation.status === "error"
      ? "idle"
      : conversation.status === "connecting"
      ? "thinking"
      : conversation.mode === "speaking"
      ? "speaking"
      : "listening";

  // ── Mouth animation while agent is speaking ─────────────────────────────────
  // Simulate word boundaries at speech rhythm since ElevenLabs Speech Engine
  // doesn't expose per-word TTS timestamps in this integration.
  const mouthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (conversation.isSpeaking) {
      let i = 0;
      const words = ["und", "ich", "ein", "das", "ist", "du"];
      mouthTimerRef.current = setInterval(() => {
        onBoundary(words[i % words.length]);
        i++;
      }, 280);
    } else {
      if (mouthTimerRef.current) {
        clearInterval(mouthTimerRef.current);
        mouthTimerRef.current = null;
      }
      resetMouth();
    }
    return () => {
      if (mouthTimerRef.current) clearInterval(mouthTimerRef.current);
    };
  }, [conversation.isSpeaking, onBoundary, resetMouth]);

  // ── RAF-driven excitement — reads real mic amplitude from ElevenLabs SDK ────
  // getInputVolume() taps the same audio pipeline ElevenLabs already owns;
  // no separate getUserMedia needed → no mobile mic conflict.
  const [excitement, setExcitement] = useState(0);
  const smoothedExcitementRef = useRef(0);
  const excitementRafRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const isListening = status === "listening";

      // Read real mic amplitude when listening (0–1 normalised by ElevenLabs SDK)
      const inputVol = isListening ? conversation.getInputVolume() : 0;
      const floor = isListening ? 0.2 : 0;

      // Base at midpoint when voice detected so oscillation gives visible 0.3–0.7 range
      const isSpeaking = inputVol > 0.05;
      const baseTarget = isSpeaking ? 0.6 : floor;
      const pulse = isSpeaking ? Math.sin(Date.now() * 0.019) * 0.3 : 0;
      const target = Math.min(0.9, Math.max(0, baseTarget + pulse));

      const prev = smoothedExcitementRef.current;
      // Fast attack (0.4), slow decay (0.06)
      const next =
        target > prev ? prev + (target - prev) * 0.4 : prev + (target - prev) * 0.06;
      smoothedExcitementRef.current = next;
      if (Math.abs(next - prev) > 0.004) setExcitement(next);

      excitementRafRef.current = requestAnimationFrame(tick);
    };
    excitementRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (excitementRafRef.current) cancelAnimationFrame(excitementRafRef.current);
    };
  }, [status, conversation]);

  // ── Derive emotion ──────────────────────────────────────────────────────────
  const emotion: Emotion = isAsleep
    ? "asleep"
    : localError
    ? "embarrassed"
    : status === "thinking"
    ? "thinking"
    : "happy";

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const resetTranslation = useCallback(() => {
    setTranslation(null);
    setShowTranslation(false);
  }, []);


  // ── Pre-fetch token on mount so mic press is instant ───────────────────────
  // Returns true if the JWT still has at least 60 seconds before expiry.
  const isTokenFresh = (token: string): boolean => {
    try {
      const payload = JSON.parse(atob(token.split(".")[1])) as { exp: number };
      return payload.exp * 1000 > Date.now() + 60_000;
    } catch {
      return false;
    }
  };

  const prefetchedTokenRef = useRef<string | null>(null);
  useEffect(() => {
    const prefetch = async () => {
      try {
        const res = await fetch("/api/token");
        if (res.ok) {
          const { token } = (await res.json()) as { token: string };
          prefetchedTokenRef.current = token;
        }
      } catch {
        // Silently ignore — we'll fetch on demand if this fails
      }
    };
    void prefetch();
  }, []);

  // ── Token fetch with retry ─────────────────────────────────────────────────
  // ElevenLabs returns 500 for ~2s after a session ends. Retry with backoff.
  const fetchTokenWithRetry = useCallback(async (): Promise<string> => {
    const cached = prefetchedTokenRef.current;
    prefetchedTokenRef.current = null;
    if (cached && isTokenFresh(cached)) return cached;

    const delays = [0, 1500, 3000, 5000];
    for (const delay of delays) {
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      const res = await fetch("/api/token");
      if (res.ok) {
        const { token } = (await res.json()) as { token: string };
        return token;
      }
      console.warn(`[Token] attempt failed (delay=${delay}ms) status=${res.status}`);
    }
    throw new Error("Could not get a session token — please try again.");
  }, []);

  // ── Reconnect ref — allows onDisconnect (stale closure) to call the latest startSession ──
  const reconnectRef = useRef<() => Promise<void>>(async () => {});

  // ── Start session ──────────────────────────────────────────────────────────
  const startSession = useCallback(async (lang: Language) => {
    setLocalError(null);

    try {
      // Request mic access explicitly — required on Android Chrome before WebRTC starts
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const token = await fetchTokenWithRetry();
      setSelectedLanguage(lang);
      setLastAssistantText("");
      resetTranslation();
      const openingLine = mode === "shadowing" ? lang.shadowingOpeningLine : lang.openingLine;
      isStartingSessionRef.current = true;
      conversation.startSession({
        conversationToken: token,
        overrides: { agent: { firstMessage: openingLine } },
      });
      // Pre-fetch next token in the background for subsequent sessions
      fetch("/api/token")
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { token: string } | null) => {
          if (data?.token) prefetchedTokenRef.current = data.token;
        })
        .catch(() => {});
    } catch (err) {
      console.error("[SpeakingPartner] Connection error:", err);
      setSelectedLanguage(null);
      setLocalError("Could not connect — please try again.");
    }
  }, [conversation, resetTranslation, mode, fetchTokenWithRetry]);

  // Keep reconnectRef pointing to the latest startSession (uses last selectedLanguage)
  useEffect(() => {
    reconnectRef.current = () => {
      const lang = selectedLanguageRef.current ?? GERMAN;
      return startSession(lang);
    };
  }, [startSession]);

  // ── Mic press ───────────────────────────────────────────────────────────────
  const handleMicPress = useCallback(async () => {
    if (conversation.status === "connected" || conversation.status === "connecting") {
      userEndedSessionRef.current = true;
      void conversation.endSession();
      return;
    }
    await startSession(selectedLanguage ?? GERMAN);
  }, [conversation, startSession, selectedLanguage]);

  // ── Translate ───────────────────────────────────────────────────────────────
  const handleTranslate = useCallback(async () => {
    if (!lastAssistantText) return;
    if (showTranslation) {
      setShowTranslation(false);
      return;
    }
    if (translation) {
      setShowTranslation(true);
      return;
    }
    setIsTranslating(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: lastAssistantText, sourceLang: "de" }),
      });
      if (!res.ok) throw new Error(`Translate API error ${res.status}`);
      const data = (await res.json()) as { translation?: string };
      setTranslation(data.translation ?? null);
      setShowTranslation(true);
    } catch (err) {
      console.error("[Translate]", err);
    }
    setIsTranslating(false);
  }, [lastAssistantText, showTranslation, translation]);

  // ── Copy ────────────────────────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    if (!lastAssistantText) return;
    try {
      await navigator.clipboard.writeText(lastAssistantText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard not available
    }
  }, [lastAssistantText]);

  // ── Replay ──────────────────────────────────────────────────────────────────
  // sendUserMessage is not supported by ElevenLabs Speech Engine — replay is a no-op for now.
  const handleReplay = useCallback(() => {
    void lastAssistantText;
    void status;
  }, [lastAssistantText, status]);

  // ── Handle session disconnect — mode switch restart OR reveal screen ─────────
  useEffect(() => {
    if (conversation.status !== "disconnected") return;

    // Mode switch: restart in the new mode immediately
    const pendingMode = pendingModeRestartRef.current;
    if (pendingMode) {
      pendingModeRestartRef.current = null;
      void (async () => {
        try {
          let token = prefetchedTokenRef.current && isTokenFresh(prefetchedTokenRef.current)
            ? prefetchedTokenRef.current : null;
          prefetchedTokenRef.current = null;
          if (!token) {
            const res = await fetch("/api/token");
            if (!res.ok) throw new Error(`Token error ${res.status}`);
            ({ token } = (await res.json()) as { token: string });
          }
          setLastAssistantText("");
          resetTranslation();
          const openingLine = pendingMode.newMode === "shadowing"
            ? GERMAN.shadowingOpeningLine
            : GERMAN.openingLine;
          isStartingSessionRef.current = true;
          conversation.startSession({
            conversationToken: token,
            overrides: { agent: { firstMessage: openingLine } },
          });
        } catch (err) {
          console.error("[Mode switch restart]", err);
          setLocalError("Could not switch mode — please try again.");
        }
      })();
      return;
    }
  }, [conversation.status, conversation, resetTranslation]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="relative h-dvh overflow-hidden bg-[#161d2f]">
      {/* Fullscreen dome blob — always behind all UI */}
      <CharacterAvatar
        variant="dome"
        mouthOpenness={mouthOpenness}
        emotion={emotion}
        excitement={excitement}
      />

      {isAsleep ? (
        // ── Sleeping UI ───────────────────────────────────────────────────────
        <div className="relative z-10 flex h-dvh flex-col">
          <div className="flex-1 flex items-end justify-center pb-4">
            <p className="text-white/40 text-sm tracking-wide animate-pulse">Tap to wake up</p>
          </div>
          <MicControl
            status={status}
            micSupported={true}
            onMicPress={() => {
              setIsAsleep(false);
              setSelectedLanguage(null);
            }}
            mode={mode}
            onModeToggle={() => {
              setIsAsleep(false);
              setSelectedLanguage(null);
              const newMode = mode === "conversation" ? "shadowing" : "conversation";
              setMode(newMode);
            }}
            onClose={() => {
              setIsAsleep(false);
              setSelectedLanguage(null);
            }}
          />
        </div>
      ) : !selectedLanguage ? (
        // ── Language picker (German only) ──────────────────────────────────────
        <div className="relative z-10 flex h-dvh flex-col items-center justify-center gap-4 px-6">
          {localError && (
            <div role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {localError}
              <button type="button" className="ml-2 underline" onClick={() => setLocalError(null)}>
                OK
              </button>
            </div>
          )}
          <p className="max-w-[329px] text-center text-[32px] leading-snug text-[#161d2f] font-[family-name:var(--font-special-gothic)] md:max-w-[516px]">Which language do you want to practice today?</p>
          <div className="flex w-full max-w-[329px] flex-col gap-4 md:w-auto md:max-w-none md:flex-row">
            <button
              type="button"
              onClick={() => void startSession(GERMAN)}
              className="flex h-[60px] w-full items-center justify-center gap-2 rounded-[27px] bg-[#161d2f] px-5 text-white transition-colors hover:bg-[#1e2740] active:bg-[#0e1320] md:h-[44px] md:w-auto"
            >
              <span className="text-2xl">{GERMAN.flag}</span>
              <span className="text-[20px] md:text-[16px]" style={{ fontFamily: "Inter, sans-serif", fontWeight: 400 }}>{GERMAN.name}</span>
            </button>
          </div>
        </div>
      ) : (
        // ── Conversation UI ────────────────────────────────────────────────────
        <div className="relative z-10 flex h-dvh flex-col">
{/* Error banner */}
          {localError && (
            <div
              role="alert"
              className="mx-4 mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200 sm:mx-6"
            >
              {localError}
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => setLocalError(null)}
              >
                OK
              </button>
            </div>
          )}

          {/* Main area: text + action bar */}
          <TranscriptDisplay
            text={lastAssistantText}
            status={status}
            isStreaming={false}
            onPronounceWord={(word) => {
              void (async () => {
                try {
                  const res = await fetch("/api/tts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: word }),
                  });
                  if (!res.ok) return;
                  const { audioBase64 } = await res.json() as { audioBase64: string };
                  const binary = atob(audioBase64);
                  const bytes = new Uint8Array(binary.length);
                  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                  const blob = new Blob([bytes], { type: "audio/mpeg" });
                  const url = URL.createObjectURL(blob);
                  const audio = new Audio(url);
                  audio.onended = () => URL.revokeObjectURL(url);
                  void audio.play();
                } catch { /* silent fail */ }
              })();
            }}
            mouthOpenness={mouthOpenness}
            emotion={emotion}
            onReplay={handleReplay}
            canReplay={lastAssistantText.length > 0}
            onCopy={handleCopy}
            copied={copied}
            onTranslate={() => {
              void handleTranslate();
            }}
            isTranslating={isTranslating}
            translation={translation}
            showTranslation={showTranslation}
          />

          {/* Mic + mode toggle + close */}
          <MicControl
            status={status}
            micSupported={true}
            onMicPress={() => { void handleMicPress(); }}
            mode={mode}
            onModeToggle={() => {
              const newMode = mode === "conversation" ? "shadowing" : "conversation";
              setMode(newMode);
              if (conversation.status === "connected") {
                userEndedSessionRef.current = true;
                pendingModeRestartRef.current = { newMode };
                void conversation.endSession();
              }
            }}
            onClose={() => {
              userEndedSessionRef.current = true;
              void conversation.endSession();
              setSelectedLanguage(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Public export (wraps in ConversationProvider + error boundary) ───────────
export function SpeakingPartner() {
  return (
    <SdkErrorBoundary>
      <ConversationProvider>
        <SpeakingPartnerContent />
      </ConversationProvider>
    </SdkErrorBoundary>
  );
}
