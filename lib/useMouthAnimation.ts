"use client";

import { useCallback, useRef, useState } from "react";

/** Rough German syllable count — count vowel groups */
function countSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-zäöüy]/g, "");
  const groups = cleaned.match(/[aeiouäöüy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

export function useMouthAnimation() {
  const [mouthOpenness, setMouthOpenness] = useState(0);
  const currentRef = useRef(0);
  const targetRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tick = useCallback(() => {
    const current = currentRef.current;
    const target = targetRef.current;
    const diff = target - current;

    if (Math.abs(diff) < 0.004) {
      currentRef.current = target;
      setMouthOpenness(target);
      return;
    }

    // Open faster than close for a snappy, natural feel
    const speed = target > current ? 0.4 : 0.18;
    const next = current + diff * speed;
    currentRef.current = next;
    setMouthOpenness(next);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startRaf = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const onBoundary = useCallback(
    (word: string) => {
      const syllables = countSyllables(word);
      // More syllables = wider mouth; clamp between 0.45 and 0.92
      const openAmount = Math.min(0.92, 0.45 + syllables * 0.16);
      // Hold the mouth open for roughly the word's spoken duration
      const holdMs = syllables * 210;

      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);

      targetRef.current = openAmount;
      startRaf();

      closeTimerRef.current = setTimeout(() => {
        targetRef.current = 0.05;
        startRaf();
      }, holdMs);
    },
    [startRaf]
  );

  const reset = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    targetRef.current = 0;
    currentRef.current = 0;
    setMouthOpenness(0);
  }, []);

  return { mouthOpenness, onBoundary, reset };
}
