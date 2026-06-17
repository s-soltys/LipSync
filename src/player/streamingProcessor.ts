// ────────────────────────────────────────────────────────────
// StreamingProcessor — real-time streaming audio processing
//
// Takes 20ms audio chunks (882 samples @ 44100 Hz) and runs
// the LPC+NN pipeline on each one, returning detected phonemes.
//
// Maintains a ring buffer to hold the LPC analysis window
// across chunk boundaries.
// ────────────────────────────────────────────────────────────

import { analyze } from '../core/lpc';
import { decode, Phoneme } from '../core/phoneme';

// ── Constants ───────────────────────────────────────────────

/** LPC analysis window size (samples). Matches audio.ts SAMPLES_PER_WINDOW. */
export const WINDOW_SIZE = 794;

/** Phoneme recognition step (samples) — 20 ms @ 44100 Hz. Matches audio.ts STEP_SAMPLES. */
export const STEP_SIZE = 882;

/** Energy threshold for voice activity detection (RMS-based). */
export const VAD_THRESHOLD = 0.025;

// ── StreamingProcessor Class ───────────────────────────────

/**
 * StreamingProcessor — processes audio chunks in real time.
 *
 * Each 20 ms chunk is fed via `feedChunk()`. The processor:
 *   1. Writes the chunk into a ring buffer for sliding-window LPC.
 *   2. Computes RMS energy for Voice Activity Detection.
 *   3. If energy ≥ threshold, runs LPC analysis + NN → phoneme.
 *   4. Returns the detected phoneme (or null if silent).
 *
 * Usage:
 * ```typescript
 *   const network: NeuralNetworkState = createNetworkFromJson(weights);
 *   const proc = new StreamingProcessor({
 *     run: (input) => forwardPass(network, input),
 *   });
 *
 *   for (const chunk of audioChunks) {
 *     const { phoneme, energy } = proc.feedChunk(chunk);
 *     if (phoneme) animateViseme(phoneme);
 *   }
 * ```
 */
export class StreamingProcessor {
  private pipeline: { run: (input: number[]) => number[] };
  private sampleRate: number;
  private windowSize: number;
  private stepSize: number;
  private ringBuffer: Float32Array;
  private writeIndex: number;

  /**
   * @param opts.run        - An object with a `run(input: number[]): number[]` method
   *                          for neural network inference (wraps forwardPass).
   * @param opts.sampleRate - Audio sample rate (default: 44100).
   */
  constructor(opts: { run: (input: number[]) => number[]; sampleRate?: number }) {
    this.pipeline = opts;
    this.sampleRate = opts.sampleRate || 44100;
    this.windowSize = WINDOW_SIZE;
    this.stepSize = STEP_SIZE;
    // Ring buffer large enough to hold one LPC window plus one chunk overlap
    this.ringBuffer = new Float32Array(this.windowSize + this.stepSize);
    this.writeIndex = 0;
  }

  /**
   * Feed a 20 ms audio chunk (882 samples) into the processor.
   *
   * @param chunk - 882 raw PCM float32 samples at 44100 Hz.
   * @returns An object containing:
   *   - phoneme: The detected Phoneme, or null if below the VAD threshold.
   *   - energy:  The RMS energy of the chunk.
   */
  feedChunk(chunk: Float32Array): { phoneme: Phoneme | null; energy: number } {
    // 1. Copy chunk into ring buffer (circular write)
    for (let i = 0; i < chunk.length; i++) {
      this.ringBuffer[this.writeIndex % this.ringBuffer.length] = chunk[i];
      this.writeIndex++;
    }

    // 2. Compute RMS energy for VAD
    const energy = Math.sqrt(chunk.reduce((s, v) => s + v * v, 0) / chunk.length);

    // 3. If below VAD threshold, skip LPC analysis entirely
    if (energy < VAD_THRESHOLD) {
      return { phoneme: null, energy };
    }

    // 4. Extract the LPC analysis window (last windowSize samples from ring buffer)
    const start = Math.max(0, this.writeIndex - this.windowSize);
    const rawWindow = new Array<number>(this.windowSize);
    for (let i = 0; i < this.windowSize; i++) {
      rawWindow[i] = this.ringBuffer[(start + i) % this.ringBuffer.length];
    }

    // 5. Run LPC analysis → 9 reflection (PARCOR) coefficients
    const lpc = analyze(rawWindow);

    // 6. Feed through neural network → 6 sigmoid outputs
    const nnOutput = this.pipeline.run(lpc);

    // 7. Decode NN output vector to a Phoneme
    const phoneme = decode(nnOutput);

    return {
      // Convert NULL_PHONEME (visemeId === 0) to null for the caller
      phoneme: phoneme.visemeId > 0 ? phoneme : null,
      energy,
    };
  }

  /**
   * Reset the processor state.
   *
   * Clears the ring buffer and resets the write index, allowing the
   * processor to be reused for a new audio stream.
   */
  reset(): void {
    this.ringBuffer.fill(0);
    this.writeIndex = 0;
  }
}
