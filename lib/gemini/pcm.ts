/**
 * PCM conversion helpers for the Gemini Live audio path.
 *
 * Gemini Live speaks raw little-endian 16-bit PCM in both directions:
 *   input  → 16 kHz  (what we send from the mic)
 *   output → 24 kHz  (what we receive and play back)
 *
 * Neither rate matches a browser AudioContext, which typically runs at 44.1 or
 * 48 kHz, so resampling is unavoidable. It lives here — in typed, testable
 * code — rather than inside the worklets, which stay as dumb as possible.
 */

export const GEMINI_INPUT_RATE = 16000;
export const GEMINI_OUTPUT_RATE = 24000;

/** Signed 16-bit PCM → normalised float samples in [-1, 1]. */
export function int16ToFloat32(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    // Asymmetric on purpose: int16 range is -32768..32767.
    out[i] = input[i] < 0 ? input[i] / 0x8000 : input[i] / 0x7fff;
  }
  return out;
}

/** Normalised float samples → signed 16-bit PCM, with clipping. */
export function float32ToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * Linear-interpolation resampler.
 *
 * Good enough for speech and cheap enough to run per audio block. It is not a
 * windowed-sinc resampler — if aliasing artefacts ever show up on downsampling,
 * that is the upgrade path.
 */
export function resample(
  input: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;

  const ratio = fromRate / toRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx];
    // Clamp at the tail rather than reading past the end.
    const b = idx + 1 < input.length ? input[idx + 1] : a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/** Root-mean-square level of a block, for amplitude-reactive UI. */
export function rms(input: Float32Array): number {
  if (input.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
  return Math.sqrt(sum / input.length);
}

/**
 * Map a raw RMS reading onto the 0–1 curve the avatar animation expects.
 *
 * This constant is inherited from the ElevenLabs implementation (its SDK
 * returned a pre-normalised value, and lib/useMicLevel.ts had reverse-engineered
 * the matching curve). Keeping it means the existing excitement RAF loop in
 * SpeakingPartner.tsx behaves identically against a different audio source.
 */
export function normaliseLevel(raw: number): number {
  return Math.min(1, Math.max(0, (raw - 0.01) * 5));
}

/** base64 → bytes. Gemini delivers audio as base64 over the wire. */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** bytes → base64, chunked to avoid blowing the argument limit on big buffers. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Reinterpret a byte buffer as little-endian Int16 samples.
 *
 * Uint8Array views are not guaranteed to be 2-byte aligned, and Int16Array
 * demands alignment — so copy when we have to rather than throwing.
 */
export function bytesToInt16(bytes: Uint8Array): Int16Array {
  if (bytes.byteOffset % 2 === 0 && bytes.byteLength % 2 === 0) {
    return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  }
  const copy = new Uint8Array(bytes.byteLength - (bytes.byteLength % 2));
  copy.set(bytes.subarray(0, copy.length));
  return new Int16Array(copy.buffer);
}

/** Decode a base64 PCM payload straight into playable float samples. */
export function decodePcmBase64(b64: string): Float32Array {
  return int16ToFloat32(bytesToInt16(base64ToBytes(b64)));
}
