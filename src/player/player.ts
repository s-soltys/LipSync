// ────────────────────────────────────────────────────────────
// LipsyncPlayer Module — TypeScript port of LipsyncPlayer.as
//
// Wires together: Audio (extractSound, decimateAndComputeEnergy),
// LPC (analyze → 9 reflection coefficients), NN (forwardPass →
// 6 sigmoid outputs), Phoneme (decode → Phoneme).
//
// Key features:
//   • Pre-buffering — entire phoneme timeline computed before dispatch
//   • Voice Activity Detection — skip phoneme recognition when
//     energy < 0.025 (returns NULL / silence)
//   • 3-point temporal smoothing — removes isolated single-frame
//     phoneme flickers
//   • Sequential event dispatch via callbacks
// ────────────────────────────────────────────────────────────

import {
  STRIDE,
  SAMPLES_PER_WINDOW,
  STEP_SAMPLES,
  ACTIVATION_ENERGY,
  extractSound,
  decimateAndComputeEnergy,
} from './audio';
import { analyze } from '../core/lpc';
import { decode, Phoneme, NULL_PHONEME } from '../core/phoneme';

// ── Re-export for convenience ──────────────────────────────

export type { Phoneme } from '../core/phoneme';
export { NULL_PHONEME } from '../core/phoneme';
export { STEP_SAMPLES, ACTIVATION_ENERGY } from './audio';

// ── Types ──────────────────────────────────────────────────

/**
 * A single item in the pre-computed phoneme buffer.
 *
 * Mirrors the AS3 `LipsyncBufferItem` class:
 *   - position: sample offset within the audio
 *   - energy:   mean absolute energy (VAD threshold)
 *   - samples:  decimated PCM samples for this window
 *   - phoneme:  the recognised Phoneme (NULL for silence / low energy)
 */
export interface PlayerBufferItem {
  phoneme: Phoneme;
  position: number;
  energy: number;
  samples: number[];
}

/** Event type literals matching the AS3 LipsyncEvent class. */
export type LipsyncEventType =
  | 'AMPLITUDE_SAMPLE'
  | 'PHONEME'
  | 'PLAYING_START'
  | 'PLAYING_COMPLETE';

/** Event object payload dispatched to registered callbacks. */
export interface LipsyncEvent {
  readonly type: LipsyncEventType;
  readonly phoneme: Phoneme;
  readonly amplitude: number;
}

/** Callback signature for LipsyncPlayer event listeners. */
export type LipsyncCallback = (event: LipsyncEvent) => void;

// ── Phoneme Recognition ────────────────────────────────────

/**
 * Recognise a phoneme at a given sample position in the audio buffer.
 *
 * Processing chain:
 *   1. Extract a window of `SAMPLES_PER_WINDOW` (794) PCM samples at `position`.
 *   2. Decimate (keep every `STRIDE=7`th sample) and compute mean-absolute energy.
 *   3. Voice Activity Detection:
 *        - If energy < `ACTIVATION_ENERGY` (0.025): phoneme stays NULL (silence).
 *        - If energy ≥ 0.025:
 *            a. Run LPC analysis → 9 reflection coefficients.
 *            b. Run neural network forward pass → 6 sigmoid outputs.
 *            c. Decode binary vector → Phoneme (threshold ≥ 0.5 per bit).
 *
 * @param audioBuffer - Full PCM float32 audio buffer.
 * @param position    - Sample index to start extraction at.
 * @param network     - An object with a `run(input: number[]): number[]` method.
 * @returns A fully populated `PlayerBufferItem`.
 */
export function recognizePhoneme(
  audioBuffer: Float32Array,
  position: number,
  network: { run(input: number[]): number[] },
): PlayerBufferItem {
  const rawBuffer = extractSound(audioBuffer, position);
  const { samples, energy } = decimateAndComputeEnergy(rawBuffer);

  const item: PlayerBufferItem = {
    phoneme: NULL_PHONEME,
    position,
    energy,
    samples,
  };

  if (energy >= ACTIVATION_ENERGY) {
    const K = analyze(samples);            // 9 reflection coefficients
    const nnOutput = network.run(K);       // 6 sigmoid outputs
    item.phoneme = decode(nnOutput);       // binary decode → Phoneme
  }

  return item;
}

// ── Temporal Smoothing ─────────────────────────────────────

/**
 * Apply 3-point temporal smoothing to a phoneme buffer in-place.
 *
 * For each interior item (index 1 .. length-2):
 *   If `curr.phoneme` differs from BOTH `prev.phoneme` AND `next.phoneme`,
 *   it is considered an isolated single-frame outlier and is replaced:
 *     - Prefer `next.phoneme` if it is not the NULL phoneme.
 *     - Fall back to `prev.phoneme` if it is not the NULL phoneme.
 *     - If both neighbours are NULL, the outlier is left unchanged.
 *
 * The first and last items are never modified (they have only one neighbour).
 *
 * @param buffer - The phoneme buffer to smooth in-place.
 */
export function temporalSmoothing(buffer: PlayerBufferItem[]): void {
  for (let i = 1; i < buffer.length - 1; i++) {
    const prev = buffer[i - 1];
    const curr = buffer[i];
    const next = buffer[i + 1];

    // Current differs from both neighbours ⇒ outlier
    if (curr.phoneme !== prev.phoneme && curr.phoneme !== next.phoneme) {
      if (next.phoneme !== NULL_PHONEME) {
        curr.phoneme = next.phoneme;       // prefer next
      } else if (prev.phoneme !== NULL_PHONEME) {
        curr.phoneme = prev.phoneme;       // fall back to prev
      }
      // else: both neighbours NULL — leave current unchanged
    }
  }
}

// ── Pre-Buffering ──────────────────────────────────────────

/**
 * Pre-compute the full phoneme timeline for an audio buffer.
 *
 * Phoneme recognition runs every `STEP_SAMPLES` (882 samples ≈ 20 ms),
 * starting at `STEP_SAMPLES` (not sample 0 — alignment with the AS3
 * loop that began at `recognizePhonemeDelay * samplingRateMS`).
 *
 * After all positions are computed, `temporalSmoothing` is applied
 * across the entire buffer.
 *
 * @param audioBuffer - Full PCM float32 audio buffer.
 * @param network     - An object with a `run(input: number[]): number[]` method.
 * @returns An ordered array of `PlayerBufferItem`, one per phoneme tick.
 */
export function preparePhonemeBuffer(
  audioBuffer: Float32Array,
  network: { run(input: number[]): number[] },
): PlayerBufferItem[] {
  const buffer: PlayerBufferItem[] = [];
  const step = STEP_SAMPLES;   // 882
  const durationSamples = audioBuffer.length;

  for (let position = step; position < durationSamples; position += step) {
    buffer.push(recognizePhoneme(audioBuffer, position, network));
  }

  // Remove isolated single-frame outliers
  temporalSmoothing(buffer);

  return buffer;
}

// ── LipsyncPlayer Class ────────────────────────────────────

/**
 * LipsyncPlayer — orchestrates the full audio → phoneme pipeline.
 *
 * Usage:
 * ```typescript
 *   const network = { run: (input) => forwardPass(netState, input) };
 *   const player = new LipsyncPlayer(network);
 *
 *   player.on('PLAYING_START',  ()        => console.log('start'));
 *   player.on('PHONEME',        (e)       => animateViseme(e.phoneme));
 *   player.on('PLAYING_COMPLETE', ()      => console.log('done'));
 *
 *   player.process(audioBuffer);
 * ```
 *
 * The pipeline:
 *   1. Dispatches `PLAYING_START`.
 *   2. Pre-computes the phoneme buffer for the full audio (VAD + smoothing).
 *   3. Dispatches `PHONEME` events sequentially, one per 20 ms tick.
 *   4. Dispatches `PLAYING_COMPLETE`.
 */
export class LipsyncPlayer {
  private network: { run(input: number[]): number[] };
  private callbacks: Map<LipsyncEventType, LipsyncCallback[]>;

  /**
   * @param network - An object that provides `run(input: number[]): number[]`
   *   for neural network inference. Typically wrapping `forwardPass`.
   */
  constructor(network: { run(input: number[]): number[] }) {
    this.network = network;
    this.callbacks = new Map();
  }

  /**
   * Register a callback for a given event type.
   *
   * Multiple callbacks per event type are supported and are called
   * in registration order.
   *
   * @param type     - One of `'PLAYING_START'`, `'PHONEME'`,
   *                   `'PLAYING_COMPLETE'`, `'AMPLITUDE_SAMPLE'`.
   * @param callback - Function to invoke when the event fires.
   */
  on(type: LipsyncEventType, callback: LipsyncCallback): void {
    const existing = this.callbacks.get(type);
    if (existing) {
      existing.push(callback);
    } else {
      this.callbacks.set(type, [callback]);
    }
  }

  /**
   * Unregister a previously registered callback.
   *
   * If the callback was not registered or the event type has no listeners,
   * this is a no-op.
   *
   * @param type     - Event type the callback was registered for.
   * @param callback - The exact function reference to remove.
   */
  off(type: LipsyncEventType, callback: LipsyncCallback): void {
    const existing = this.callbacks.get(type);
    if (existing) {
      const idx = existing.indexOf(callback);
      if (idx !== -1) existing.splice(idx, 1);
    }
  }

  /**
   * Emit an event to all registered callbacks.
   *
   * @param type      - Event type.
   * @param phoneme   - Phoneme payload (default: NULL_PHONEME).
   * @param amplitude - Amplitude / energy payload (default: 0).
   */
  private emit(
    type: LipsyncEventType,
    phoneme: Phoneme = NULL_PHONEME,
    amplitude: number = 0,
  ): void {
    const event: LipsyncEvent = { type, phoneme, amplitude };
    const cbs = this.callbacks.get(type);
    if (cbs) {
      for (const cb of cbs) {
        cb(event);
      }
    }
  }

  /**
   * Run the full audio-to-phoneme pipeline on the given audio buffer.
   *
   * Events are dispatched synchronously in this order:
   *   1. `PLAYING_START`
   *   2. `PHONEME` × N (one per 20 ms tick)
   *   3. `PLAYING_COMPLETE`
   *
   * @param audioBuffer - Full PCM float32 audio buffer.
   * @throws {Error} If the neural network has not been provided.
   */
  process(audioBuffer: Float32Array): void {
    this.emit('PLAYING_START');

    // Pre-compute the entire phoneme buffer
    const buffer = preparePhonemeBuffer(audioBuffer, this.network);

    // Dispatch phoneme events in sequence
    for (const item of buffer) {
      this.emit('PHONEME', item.phoneme, item.energy);
    }

    this.emit('PLAYING_COMPLETE');
  }
}
