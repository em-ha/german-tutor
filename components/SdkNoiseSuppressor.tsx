"use client";

import { useEffect } from "react";

/**
 * Suppresses known-benign console.error messages from the ElevenLabs WebRTC SDK.
 * These fire during normal session teardown (data-channel close events) and are
 * harmless — but Next.js dev mode surfaces all console.error calls in the overlay.
 * In production this component is a no-op (the overlay doesn't exist there).
 */
const SUPPRESSED_PATTERNS = [
  "Unknown DataChannel error on lossy",
  "Unknown DataChannel error on reliable",
  "[ElevenLabs SDK] received error event with no error_event payload",
  "[Token] attempt failed",   // retry backoff noise — handled gracefully
];

export function SdkNoiseSuppressor() {
  useEffect(() => {
    const original = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      const msg = args[0];
      if (
        typeof msg === "string" &&
        SUPPRESSED_PATTERNS.some((p) => msg.includes(p))
      ) {
        return; // swallow — these are SDK teardown noise, not real errors
      }
      original(...args);
    };
    return () => { console.error = original; };
  }, []);

  return null;
}
