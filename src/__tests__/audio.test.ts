// ────────────────────────────────────────────────────────────
// Audio Pipeline — Unit Tests
// ────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  SAMPLING_RATE,
  SAMPLING_RATE_MS,
  SAMPLING_DECIMATE,
  STRIDE,
  WINDOW_LENGTH_MS,
  SAMPLES_PER_WINDOW,
  PHONEME_DELAY_MS,
  STEP_SAMPLES,
  ACTIVATION_ENERGY,
  extractSound,
  decimateAndComputeEnergy,
  isVoiceActive,
  processAudioWindow,
  type LipsyncBufferItem,
} from '../player/audio';

// ── Ground truth loader ───────────────────────────────────

interface AudioPipelineGroundTruth {
  sampling_rate: number;
  decimation_factor: number;
  stride: number;
  decimation_formula: string;
  energy_formula: string;
  activation_threshold: number;
  window_length_ms: number;
  samples_per_window: number;
  phoneme_recognition_delay_ms: number;
  samples_per_step: number;
}

function loadGroundTruth(): AudioPipelineGroundTruth {
  const raw = fs.readFileSync(
    path.resolve(process.cwd(), 'ground-truth/audio-pipeline.json'),
    'utf-8',
  );
  return JSON.parse(raw) as AudioPipelineGroundTruth;
}

// ── Constants ─────────────────────────────────────────────

describe('Audio Pipeline Constants', () => {
  const gt = loadGroundTruth();

  it('SAMPLING_RATE should match ground truth', () => {
    expect(SAMPLING_RATE).toBe(gt.sampling_rate);
  });

  it('SAMPLING_RATE_MS should be 44.1', () => {
    expect(SAMPLING_RATE_MS).toBe(44.1);
  });

  it('SAMPLING_DECIMATE should match ground truth', () => {
    expect(SAMPLING_DECIMATE).toBe(gt.decimation_factor);
  });

  it('STRIDE should be samplingDecimate + 1 = 7', () => {
    expect(STRIDE).toBe(SAMPLING_DECIMATE + 1);
    expect(STRIDE).toBe(gt.stride);
  });

  it('WINDOW_LENGTH_MS should match ground truth', () => {
    expect(WINDOW_LENGTH_MS).toBe(gt.window_length_ms);
  });

  it('SAMPLES_PER_WINDOW should be 794 (matches ground truth)', () => {
    expect(SAMPLES_PER_WINDOW).toBe(gt.samples_per_window);
    // NOTE: 18 × 44.1 = 793.8 in float math but the ground truth stores 794.
    // The AS3 int cast / manual rounding produces 794.
  });

  it('PHONEME_DELAY_MS should match ground truth', () => {
    expect(PHONEME_DELAY_MS).toBe(gt.phoneme_recognition_delay_ms);
  });

  it('STEP_SAMPLES should be 20 × 44.1 = 882', () => {
    expect(STEP_SAMPLES).toBe(gt.samples_per_step);
    expect(STEP_SAMPLES).toBe(Math.floor(PHONEME_DELAY_MS * SAMPLING_RATE_MS));
  });

  it('ACTIVATION_ENERGY should match ground truth', () => {
    expect(ACTIVATION_ENERGY).toBe(gt.activation_threshold);
  });

  it('decimation_formula should say "keep every 7th sample"', () => {
    expect(gt.decimation_formula).toBe('keep every 7th sample');
  });

  it('energy_formula should be "sum(|sample|)/N"', () => {
    expect(gt.energy_formula).toBe('sum(|sample|)/N');
  });
});

// ── extractSound ──────────────────────────────────────────

describe('extractSound', () => {
  it('should extract SAMPLES_PER_WINDOW (794) samples from position 0', () => {
    const buffer = new Float32Array(SAMPLES_PER_WINDOW + 100);
    buffer.fill(0.5);
    const extracted = extractSound(buffer, 0);
    expect(extracted).toHaveLength(SAMPLES_PER_WINDOW);
  });

  it('should start extraction at the given position', () => {
    const buffer = new Float32Array(1000);
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = i;
    }
    const extracted = extractSound(buffer, 100);
    expect(extracted).toHaveLength(SAMPLES_PER_WINDOW);
    expect(extracted[0]).toBe(100);
    expect(extracted[1]).toBe(101);
  });

  it('should gracefully handle near-end positions (shorter window)', () => {
    const buffer = new Float32Array(800);
    buffer.fill(1.0);
    // position 100 → would need 894 samples but only 800 available
    const extracted = extractSound(buffer, 100);
    expect(extracted.length).toBeLessThanOrEqual(SAMPLES_PER_WINDOW);
    expect(extracted.length).toBe(700); // 800 - 100 = 700
  });

  it('should return empty Float32Array for position at or past end', () => {
    const buffer = new Float32Array(500);
    buffer.fill(1.0);
    const extracted = extractSound(buffer, 500);
    expect(extracted).toHaveLength(0);
  });

  it('should return empty Float32Array for zero-length input', () => {
    const buffer = new Float32Array(0);
    const extracted = extractSound(buffer, 0);
    expect(extracted).toHaveLength(0);
  });

  it('should not mutate the original buffer', () => {
    const buffer = new Float32Array(SAMPLES_PER_WINDOW);
    buffer.fill(0.42);
    const extracted = extractSound(buffer, 0);
    extracted[0] = 999;
    expect(buffer[0]).toBeCloseTo(0.42, 6);
  });
});

// ── decimateAndComputeEnergy ──────────────────────────────

describe('decimateAndComputeEnergy', () => {
  it('should decimate with stride=7, keeping every 7th sample', () => {
    // Create a buffer with values [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, ...]
    const buffer = new Float32Array(100);
    for (let i = 0; i < 100; i++) {
      buffer[i] = i;
    }
    const result = decimateAndComputeEnergy(buffer);
    // Expected samples: indices 0, 7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77, 84, 91, 98
    // That's 15 samples (floor(100/7) = 14, plus i=0 gives 15)
    const expectedSamples = [0, 7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77, 84, 91, 98];
    expect(result.samples).toEqual(expectedSamples);
  });

  it('should compute energy as sum(|sample|) / count', () => {
    const buffer = new Float32Array(100);
    for (let i = 0; i < 100; i++) {
      buffer[i] = i - 50; // mixed positive and negative values
    }
    const result = decimateAndComputeEnergy(buffer);
    // Decimated: i=0→-50, i=7→-43, i=14→-36, ..., i=98→48
    const expectedEnergy =
      result.samples.reduce((sum, s) => sum + Math.abs(s), 0) / result.samples.length;
    expect(result.energy).toBeCloseTo(expectedEnergy, 12);
  });

  it('should produce approximately 114 samples for a 794-sample window', () => {
    const buffer = new Float32Array(SAMPLES_PER_WINDOW);
    buffer.fill(0.5);
    const result = decimateAndComputeEnergy(buffer);
    // 794 / 7 ≈ 113.43 → ceil = 114
    expect(result.samples.length).toBe(114);
  });

  it('should return energy=0 and empty array for empty input', () => {
    const buffer = new Float32Array(0);
    const result = decimateAndComputeEnergy(buffer);
    expect(result.samples).toEqual([]);
    expect(result.energy).toBe(0);
  });

  it('should handle single-sample input (below stride)', () => {
    const buffer = new Float32Array([0.5]);
    const result = decimateAndComputeEnergy(buffer);
    expect(result.samples).toEqual([0.5]);
    expect(result.energy).toBe(0.5);
  });

  it('should handle input shorter than stride', () => {
    const buffer = new Float32Array([0.1, -0.2, 0.3]);
    const result = decimateAndComputeEnergy(buffer);
    expect(result.samples).toHaveLength(1);
    expect(result.samples[0]).toBeCloseTo(0.1, 6);
    expect(result.energy).toBeCloseTo(0.1, 6);
  });

  it('should produce energy = mean of absolute values', () => {
    const buffer = new Float32Array([1.0, -1.0, 1.0, -1.0, 1.0, -1.0, 1.0]);
    const result = decimateAndComputeEnergy(buffer);
    // Decimated: [1.0] (only index 0)
    expect(result.samples).toEqual([1.0]);
    expect(result.energy).toBe(1.0);
  });
});

// ── isVoiceActive ─────────────────────────────────────────

describe('isVoiceActive (VAD)', () => {
  it('should return true when energy >= 0.025', () => {
    expect(isVoiceActive(0.025)).toBe(true);
    expect(isVoiceActive(0.1)).toBe(true);
    expect(isVoiceActive(1.0)).toBe(true);
  });

  it('should return false when energy < 0.025', () => {
    expect(isVoiceActive(0)).toBe(false);
    expect(isVoiceActive(0.024999)).toBe(false);
    expect(isVoiceActive(-0.1)).toBe(false);
  });

  it('should have correct threshold constant', () => {
    expect(ACTIVATION_ENERGY).toBe(0.025);
  });
});

// ── processAudioWindow (full pipeline) ────────────────────

describe('processAudioWindow', () => {
  it('should chain extractSound + decimateAndComputeEnergy', () => {
    const buffer = new Float32Array(1000);
    buffer.fill(0.5);
    const result = processAudioWindow(buffer, 100);
    expect(result).toHaveProperty('samples');
    expect(result).toHaveProperty('energy');
    expect(result.samples.length).toBeGreaterThan(0);
  });

  it('should correctly decimate at a given position', () => {
    // Fill buffer with index values
    const buffer = new Float32Array(SAMPLES_PER_WINDOW + 200);
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = i;
    }
    const result = processAudioWindow(buffer, 50);
    // First extracted sample is at index 50
    // Decimated: indices 50, 57, 64, 71, ...
    expect(result.samples[0]).toBe(50);
    expect(result.samples[1]).toBe(57);
    expect(result.samples[10]).toBe(50 + 10 * 7);
  });

  it('should return energy=0 and empty samples for empty audio buffer', () => {
    const buffer = new Float32Array(0);
    const result = processAudioWindow(buffer, 0);
    expect(result.samples).toEqual([]);
    expect(result.energy).toBe(0);
  });

  it('should produce valid energy value for constant non-zero input', () => {
    const buffer = new Float32Array(SAMPLES_PER_WINDOW);
    buffer.fill(0.5);
    const result = processAudioWindow(buffer, 0);
    // All decimated samples are 0.5, energy = |0.5| = 0.5
    expect(result.energy).toBeCloseTo(0.5, 12);
    // Voice is active
    expect(isVoiceActive(result.energy)).toBe(true);
  });

  it('should produce energy=0 for silence (all zeros)', () => {
    const buffer = new Float32Array(SAMPLES_PER_WINDOW);
    buffer.fill(0);
    const result = processAudioWindow(buffer, 0);
    expect(result.energy).toBe(0);
    expect(isVoiceActive(result.energy)).toBe(false);
  });

  it('should produce voice-inactive for low-energy input', () => {
    const buffer = new Float32Array(SAMPLES_PER_WINDOW);
    buffer.fill(0.01); // all samples at 0.01 → energy = 0.01 < 0.025
    const result = processAudioWindow(buffer, 0);
    expect(result.energy).toBeCloseTo(0.01, 5);
    expect(isVoiceActive(result.energy)).toBe(false);
  });

  it('should produce voice-active for high-energy input', () => {
    const buffer = new Float32Array(SAMPLES_PER_WINDOW);
    buffer.fill(0.1); // energy = 0.1 ≥ 0.025
    const result = processAudioWindow(buffer, 0);
    expect(result.energy).toBeCloseTo(0.1, 5);
    expect(isVoiceActive(result.energy)).toBe(true);
  });
});

// ── Synthetic test ────────────────────────────────────────

describe('synthetic test — known PCM buffer', () => {
  /**
   * Build a known PCM buffer that, after decimation, produces
   * a predictable sample vector and energy value.
   *
   * Create 794 samples where sample[i] = sin(2π·440·i/44100).
   * This is a 440 Hz sine wave at unity amplitude.
   */
  function buildSine440Buffer(length: number = SAMPLES_PER_WINDOW): Float32Array {
    const buf = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      buf[i] = Math.sin((2 * Math.PI * 440 * i) / SAMPLING_RATE);
    }
    return buf;
  }

  it('decimates 440 Hz sine correctly (stride=7, ~114 samples)', () => {
    const buffer = buildSine440Buffer();
    const result = decimateAndComputeEnergy(buffer);

    // Should produce ~114 decimated samples
    expect(result.samples.length).toBe(114);

    // Verify decimated sample values manually for first few
    const expectedFirstFour = [
      Math.sin((2 * Math.PI * 440 * 0) / SAMPLING_RATE),   // i=0
      Math.sin((2 * Math.PI * 440 * 7) / SAMPLING_RATE),   // i=7
      Math.sin((2 * Math.PI * 440 * 14) / SAMPLING_RATE),  // i=14
      Math.sin((2 * Math.PI * 440 * 21) / SAMPLING_RATE),  // i=21
    ];
    expect(result.samples[0]).toBeCloseTo(expectedFirstFour[0], 6);
    expect(result.samples[1]).toBeCloseTo(expectedFirstFour[1], 6);
    expect(result.samples[2]).toBeCloseTo(expectedFirstFour[2], 6);
    expect(result.samples[3]).toBeCloseTo(expectedFirstFour[3], 6);

    // Energy should be the mean of absolute sine values
    const expectedEnergy =
      result.samples.reduce((sum, s) => sum + Math.abs(s), 0) / result.samples.length;
    expect(result.energy).toBeCloseTo(expectedEnergy, 12);

    // 440 Hz sine at amplitude 1.0 should have energy > 0.025
    expect(isVoiceActive(result.energy)).toBe(true);
  });

  it('processAudioWindow matches decimateAndComputeEnergy on same slice', () => {
    const buffer = buildSine440Buffer(1000);
    const position = 50;

    const pipelineResult = processAudioWindow(buffer, position);
    const manualSlice = extractSound(buffer, position);
    const manualResult = decimateAndComputeEnergy(manualSlice);

    expect(pipelineResult.samples).toEqual(manualResult.samples);
    expect(pipelineResult.energy).toBe(manualResult.energy);
  });

  it('handles edge case: window at the very end of audio', () => {
    // Only 10 samples left
    const buffer = new Float32Array(10);
    buffer.fill(0.5);
    const result = processAudioWindow(buffer, 0);
    // 10 / 7 = 2 samples (indices 0, 7)
    expect(result.samples).toHaveLength(2);
    expect(result.samples[0]).toBeCloseTo(0.5, 6);
    expect(result.samples[1]).toBeCloseTo(0.5, 6);
    expect(result.energy).toBeCloseTo(0.5, 6);
  });

  it('synthetic silence yields zero energy and no voice activity', () => {
    const buffer = new Float32Array(SAMPLES_PER_WINDOW);
    // All zeros
    const result = processAudioWindow(buffer, 0);
    expect(result.energy).toBe(0);
    expect(result.samples).toHaveLength(114);
    expect(result.samples.every((s) => s === 0)).toBe(true);
    expect(isVoiceActive(result.energy)).toBe(false);
  });
});
