/**
 * PCM playback worklet — a ring buffer rendering Quatschi's voice.
 *
 * Deliberately dumb: samples arrive already resampled to the context rate by
 * lib/gemini/pcm.ts, so this file does no rate conversion. It only buffers,
 * renders, reports level, and supports an instant flush for barge-in.
 *
 * The reported level is what drives mouth animation. Reading it here — rather
 * than from an AnalyserNode on ctx.destination — means it reflects only
 * Quatschi's voice and drops to zero the instant the queue is cleared.
 *
 * Messages in:   { type: 'push', samples: Float32Array }
 *                { type: 'clear' }                       (barge-in)
 * Messages out:  { type: 'level', level: number }
 *                { type: 'started' } | { type: 'drained' }
 */

// Only declare the turn finished after the buffer has been empty this long.
// Gemini streams audio in chunks; a brief gap between them is normal and must
// not be mistaken for end-of-turn, or the UI flips to "listening" mid-sentence.
const DRAIN_GRACE_BLOCKS = 40; // ~107 ms at 48 kHz

// Level messages are only useful at animation rate, not audio rate.
const LEVEL_EVERY_N_BLOCKS = 4; // ~10.7 ms at 48 kHz

class PcmPlayerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.capacity = opts.capacity || Math.floor(sampleRate * 10);

    this.ring = new Float32Array(this.capacity);
    this.readIdx = 0;
    this.writeIdx = 0;
    this.available = 0;

    this.speaking = false;
    this.emptyBlocks = 0;
    this.levelCounter = 0;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === "push" && data.samples) {
        this.write(data.samples);
      } else if (data.type === "clear") {
        this.readIdx = 0;
        this.writeIdx = 0;
        this.available = 0;
        this.emptyBlocks = 0;
        if (this.speaking) {
          this.speaking = false;
          this.port.postMessage({ type: "level", level: 0 });
          this.port.postMessage({ type: "drained" });
        }
      }
    };
  }

  write(samples) {
    for (let i = 0; i < samples.length; i++) {
      if (this.available >= this.capacity) break; // overflow — drop the tail
      this.ring[this.writeIdx] = samples[i];
      this.writeIdx = this.writeIdx + 1 === this.capacity ? 0 : this.writeIdx + 1;
      this.available++;
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const channel = output[0];

    let sum = 0;
    for (let i = 0; i < channel.length; i++) {
      if (this.available > 0) {
        const s = this.ring[this.readIdx];
        this.readIdx = this.readIdx + 1 === this.capacity ? 0 : this.readIdx + 1;
        this.available--;
        channel[i] = s;
        sum += s * s;
      } else {
        channel[i] = 0;
      }
    }

    // Mono source — mirror to any remaining channels.
    for (let c = 1; c < output.length; c++) output[c].set(channel);

    if (this.available > 0) {
      this.emptyBlocks = 0;
      if (!this.speaking) {
        this.speaking = true;
        this.port.postMessage({ type: "started" });
      }
    } else if (this.speaking) {
      this.emptyBlocks++;
      if (this.emptyBlocks >= DRAIN_GRACE_BLOCKS) {
        this.speaking = false;
        this.emptyBlocks = 0;
        this.port.postMessage({ type: "level", level: 0 });
        this.port.postMessage({ type: "drained" });
      }
    }

    if (++this.levelCounter >= LEVEL_EVERY_N_BLOCKS) {
      this.levelCounter = 0;
      if (this.speaking) {
        this.port.postMessage({ type: "level", level: Math.sqrt(sum / channel.length) });
      }
    }

    return true;
  }
}

registerProcessor("pcm-player", PcmPlayerProcessor);
