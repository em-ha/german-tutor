/**
 * Mic capture worklet — downsamples to Gemini Live's 16 kHz input rate and
 * emits little-endian Int16 PCM chunks.
 *
 * Lives in public/ because AudioWorklet.addModule() needs a real URL, and
 * Next 16 has no first-class worklet-asset pipeline. Plain JS, not type-checked
 * — so keep it small and keep the interesting logic in lib/gemini/pcm.ts.
 *
 * Resampling happens here rather than on the main thread purely to cut
 * postMessage traffic: at a 48 kHz context that is 3x fewer bytes crossing the
 * boundary, on the hot path, every block.
 *
 * Messages out:  { type: 'audio', pcm: Int16Array, level: number }
 *                { type: 'level', level: number }        (on mute only)
 * Messages in:   { type: 'mute', value: boolean }
 */

const DEFAULT_TARGET_RATE = 16000;
// 30 ms at 16 kHz. Google recommends 20–40 ms chunks for the Live API.
const DEFAULT_CHUNK_SIZE = 480;

class MicCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.targetRate = opts.targetRate || DEFAULT_TARGET_RATE;
    this.chunkSize = opts.chunkSize || DEFAULT_CHUNK_SIZE;

    // `sampleRate` is a global in AudioWorkletGlobalScope.
    this.ratio = sampleRate / this.targetRate;

    this.out = new Float32Array(this.chunkSize);
    this.outLen = 0;

    // Resampling state carried across process() calls. Without this, every
    // 128-frame block would restart interpolation and inject a click.
    this.carry = new Float32Array(0);
    this.pos = 0;

    this.muted = false;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;
      if (data.type === "mute") {
        const next = !!data.value;
        if (next !== this.muted) {
          this.muted = next;
          // Reset partial state so unmuting starts clean.
          this.outLen = 0;
          this.carry = new Float32Array(0);
          this.pos = 0;
          if (next) this.port.postMessage({ type: "level", level: 0 });
        }
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    // Muted means the sleep timer fired or the session is idle. Under Gemini's
    // per-turn context billing an open, chattering socket is not free, so we
    // stop sending entirely rather than streaming silence.
    if (this.muted) return true;

    let sum = 0;
    for (let i = 0; i < channel.length; i++) sum += channel[i] * channel[i];
    const level = Math.sqrt(sum / channel.length);

    // Prepend anything left over from the previous block.
    let src;
    if (this.carry.length > 0) {
      src = new Float32Array(this.carry.length + channel.length);
      src.set(this.carry);
      src.set(channel, this.carry.length);
    } else {
      src = channel;
    }

    let pos = this.pos;
    while (pos + 1 < src.length) {
      const idx = pos | 0;
      const frac = pos - idx;
      this.out[this.outLen++] = src[idx] + (src[idx + 1] - src[idx]) * frac;

      if (this.outLen >= this.chunkSize) {
        const pcm = new Int16Array(this.chunkSize);
        for (let k = 0; k < this.chunkSize; k++) {
          const s = this.out[k] < -1 ? -1 : this.out[k] > 1 ? 1 : this.out[k];
          pcm[k] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        // Transfer the buffer so this is zero-copy.
        this.port.postMessage({ type: "audio", pcm: pcm, level: level }, [pcm.buffer]);
        this.outLen = 0;
      }
      pos += this.ratio;
    }

    const consumed = pos | 0;
    this.carry = src.slice(consumed);
    this.pos = pos - consumed;

    return true;
  }
}

registerProcessor("mic-capture", MicCaptureProcessor);
