"use client";

import { useCallback, useRef, useState } from "react";
import { useRecognitionSupported } from "./clientCapabilities";

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const supported = useRecognitionSupported();
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const start = useCallback(
    (onFinal?: (text: string) => void) => {
      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        setError("Spracherkennung wird in diesem Browser nicht unterstützt.");
        return;
      }

      setError(null);
      setTranscript("");

      const recognition = new Ctor();
      recognition.lang = "de-DE";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognitionRef.current = recognition;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let finalText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalText += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
        setTranscript(finalText || interim);
        if (finalText.trim() && onFinal) {
          onFinal(finalText.trim());
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error !== "aborted") {
          setError(
            event.error === "not-allowed"
              ? "Mikrofon-Zugriff verweigert."
              : `Spracherkennung: ${event.error}`
          );
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      try {
        recognition.start();
        setIsListening(true);
      } catch {
        setError("Mikrofon konnte nicht gestartet werden.");
      }
    },
    []
  );

  const toggle = useCallback(
    (onFinal?: (text: string) => void) => {
      if (isListening) {
        stop();
      } else {
        start(onFinal);
      }
    },
    [isListening, start, stop]
  );

  return {
    isListening,
    transcript,
    error,
    supported,
    start,
    stop,
    toggle,
    clearError: () => setError(null),
  };
}
