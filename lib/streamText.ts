const CHAR_DELAY_MS = 16;

export async function streamText(
  fullText: string,
  onChunk: (partial: string) => void,
  signal: AbortSignal
): Promise<void> {
  let accumulated = "";
  for (const char of fullText) {
    if (signal.aborted) return;
    accumulated += char;
    onChunk(accumulated);
    await delay(CHAR_DELAY_MS, signal);
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort);
  });
}
