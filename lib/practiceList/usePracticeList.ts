"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  PRACTICE_LIST_EVENT,
  addPracticeWord,
  notifyPracticeListChanged,
  readPracticeList,
  removePracticeWord,
} from "./storage";
import type { PracticeWord } from "./types";
import type { WordLookupResult } from "@/lib/wordLookup/types";

/** Stable empty snapshot for SSR — must be the same reference every time. */
const SERVER_SNAPSHOT: PracticeWord[] = [];

let clientSnapshot: PracticeWord[] = SERVER_SNAPSHOT;

function snapshotsEqual(a: PracticeWord[], b: PracticeWord[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((word, index) => word.id === b[index]?.id);
}

function getClientSnapshot(): PracticeWord[] {
  const next = readPracticeList();
  if (!snapshotsEqual(clientSnapshot, next)) {
    clientSnapshot = next;
  }
  return clientSnapshot;
}

function subscribe(onStoreChange: () => void) {
  const handleChange = () => {
    getClientSnapshot();
    onStoreChange();
  };
  window.addEventListener(PRACTICE_LIST_EVENT, handleChange);
  window.addEventListener("storage", handleChange);
  return () => {
    window.removeEventListener(PRACTICE_LIST_EVENT, handleChange);
    window.removeEventListener("storage", handleChange);
  };
}

export function usePracticeList() {
  const words = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    () => SERVER_SNAPSHOT
  );

  const add = useCallback((display: string, info: WordLookupResult) => {
    addPracticeWord(display, info);
    notifyPracticeListChanged();
  }, []);

  const remove = useCallback((id: string) => {
    removePracticeWord(id);
    notifyPracticeListChanged();
  }, []);

  return { words, add, remove };
}
