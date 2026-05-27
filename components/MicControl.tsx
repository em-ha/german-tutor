"use client";

import type { PartnerStatus } from "./TranscriptDisplay";

type Props = {
  status: PartnerStatus;
  micSupported: boolean;
  onMicPress: () => void;
  mode: "conversation" | "shadowing";
  onModeToggle: () => void;
  onClose: () => void;
};

export function MicControl({ status, micSupported, onMicPress, mode, onModeToggle, onClose }: Props) {
  const isListening = status === "listening";
  const micDisabled = !micSupported || status === "thinking" || status === "speaking";

  return (
    <div className="shrink-0 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
      <div className="flex flex-col items-center gap-3">
        {/* Three-pill row */}
        <div className="flex items-center gap-3">
          {/* Close button — 48×48 */}
          <button
            type="button"
            onClick={onClose}
            aria-label="End session"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[24px] bg-[#161d2f] transition-colors hover:bg-[#1e2740] active:bg-[#0e1320]"
          >
            <XIcon className="h-6 w-6 text-white" />
          </button>

          {/* Mode pill — 117×48 */}
          <button
            type="button"
            onClick={onModeToggle}
            aria-label={`Switch to ${mode === "conversation" ? "Echo" : "Chat"} mode`}
            className="relative h-12 shrink-0 rounded-[37px] bg-[#161d2f] transition-colors hover:bg-[#1e2740] active:bg-[#0e1320]"
            style={{ width: 117 }}
          >
            {/* Sliding blue circle */}
            <span
              className="absolute top-[3px] flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[#90ddfc] transition-all duration-300"
              style={{ left: mode === "shadowing" ? 3 : 117 - 3 - 42 }}
            >
              {mode === "shadowing" ? (
                <EchoIcon className="h-6 w-6 text-[#161d2f]" />
              ) : (
                <ChatIcon className="h-6 w-6 text-[#161d2f]" />
              )}
            </span>
            {/* Label — padded away from the circle */}
            <span
              className="absolute inset-0 flex items-center justify-center text-[16px] text-white transition-all duration-300"
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 400,
                paddingLeft: mode === "shadowing" ? 48 : 8,
                paddingRight: mode === "shadowing" ? 8 : 48,
              }}
            >
              {mode === "shadowing" ? "Echo" : "Chat"}
            </span>
          </button>

          {/* Mic button — 82×48 */}
          <button
            type="button"
            onClick={onMicPress}
            disabled={micDisabled}
            aria-label={isListening ? "Stop recording" : "Start speaking"}
            className={`relative flex h-12 shrink-0 items-center justify-center rounded-[24px] transition-all ${
              isListening
                ? "bg-[#90ddfc] text-[#161d2f] ring-2 ring-[#90ddfc]/40"
                : "bg-[#161d2f] text-white hover:bg-[#1e2740] disabled:cursor-not-allowed disabled:opacity-50"
            }`}
            style={{ width: 82 }}
          >
            {isListening && (
              <span
                className="absolute inset-0 animate-ping rounded-[24px] bg-[#90ddfc] opacity-30"
                aria-hidden
              />
            )}
            {isListening ? (
              <PauseIcon className="relative h-6 w-6 text-white" />
            ) : (
              <MicIcon className={`relative h-6 w-6 ${micDisabled ? "opacity-40" : ""}`} />
            )}
          </button>
        </div>

        <p className="text-xs text-[#161d2f]/50">
          AI can make mistakes.
        </p>
      </div>
    </div>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function EchoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}
