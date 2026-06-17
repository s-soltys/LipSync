// ────────────────────────────────────────────────────────────
// Audio Pipeline Module — TypeScript port of LipsyncPlayer.as
//   + LipsyncSettings.as audio-extraction routines
//
// Extracts windows from raw PCM float32 arrays, decimates,
// computes energy (VAD), and provides the Voice Activity
// Detector for the phoneme recognition chain.
// ────────────────────────────────────────────────────────────

// ── Constants (matches ground-truth/audio-pipeline.json) ──

/** Input audio sample rate (Hz). */
export const SAMPLING_RATE = 44100;

/** Samples per millisecond: 44100 / 1000. */
export const SAMPLING_RATE_MS = 44.1;

/** Downsampling factor — keep every (samplingDecimate + 1)th sample. */
export const SAMPLING_DECIMATE = 6;

/** Decimation stride = samplingDecimate + 1 = 7. */
export const STRIDE = 7;

/** Analysis window duration (ms). */
export const WINDOW_LENGTH_MS = 18;

/** Raw PCM samples extracted per window: floor(18 × 44.1) = 794. */
export const SAMPLES_PER_WINDOW = 794;

/** Interval between phoneme recognition ticks (ms). */
export const PHONEME_DELAY_MS = 20;

/** Samples per phoneme step: 20 × 44.1 = 882. */
export const STEP_SAMPLES = 882;

/** Energy threshold for voice activity detection. */
export const ACTIVATION_ENERGY = 0.025;

// ── Types ──────────────────────────────────────────────────

/**
 * Result of decimating one PCM window and computing its energy.
 */
export interface LipsyncBufferItem {
  /** Decimated samples (≈114 elements after stride-7 decimation of 794). */
  samples: number[];
  /** Mean absolute energy E = sum(|s|) / N. */
  energy: number;
}

// ── Core functions ─────────────────────────────────────────

/**
 * Extract a window of PCM float32 samples starting at `position`.
 *
 * Extracts `SAMPLES_PER_WINDOW` (794) samples from the given
 * Float32Array. If the buffer is shorter than the window,
 * returns whatever is available (may be empty).
 *
 * @param audioBuffer - The full PCM float32 audio buffer.
 * @param position   - Sample index to start extraction at.
 * @returns A new Float32Array slice of length ≤ SAMPLES_PER_WINDOW.
 */
export function extractSound(
  audioBuffer: Float32Array,
  position: number,
): Float32Array {
  if (audioBuffer.length === 0) {
    return new Float32Array(0);
  }

  const end = Math.min(position + SAMPLES_PER_WINDOW, audioBuffer.length);
  return audioBuffer.slice(position, end);
}

/**
 * Decimate a raw PCM buffer and compute its mean absolute energy.
 *
 * Decimation: keep every `STRIDE`th sample (stride = 7, keep index 0, 7, 14, …).
 * Energy:     E = sum(|sample_i|) / N  where N = decimated sample count.
 *
 * Handles zero-length input gracefully (returns empty samples, energy = 0).
 *
 * @param rawBuffer - Raw PCM float32 samples (typically 794 floats).
 * @returns Object containing `samples` (decimated number[]) and `energy` (number).
 */
export function decimateAndComputeEnergy(
  rawBuffer: Float32Array,
): LipsyncBufferItem {
  const samples: number[] = [];
  let totalEnergy = 0;

  for (let i = 0; i < rawBuffer.length; i += STRIDE) {
    const sample = rawBuffer[i];
    samples.push(sample);
    totalEnergy += Math.abs(sample);
  }

  const energy = samples.length > 0 ? totalEnergy / samples.length : 0;

  return { samples, energy };
}

/**
 * Voice Activity Detector (VAD).
 *
 * Returns `true` if the window energy is at or above the activation threshold.
 *
 * @param energy - Mean absolute energy from `decimateAndComputeEnergy`.
 * @returns `true` if voice is detected (energy ≥ 0.025).
 */
export function isVoiceActive(energy: number): boolean {
  return energy >= ACTIVATION_ENERGY;
}

/**
 * Run the complete audio extraction pipeline for one window.
 *
 * Convenience function that chains `extractSound` → `decimateAndComputeEnergy`.
 *
 * @param audioBuffer - The full PCM float32 audio buffer.
 * @param position   - Sample index to start extraction at.
 * @returns A `LipsyncBufferItem` with decimated samples and computed energy.
 */
export function processAudioWindow(
  audioBuffer: Float32Array,
  position: number,
): LipsyncBufferItem {
  const rawBuffer = extractSound(audioBuffer, position);
  return decimateAndComputeEnergy(rawBuffer);
}
