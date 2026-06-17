// ────────────────────────────────────────────────────────────
// LipsyncPlayer — Integration Tests
//
// Tests cover:
//   1. recognizePhoneme — VAD (silence → NULL, audio → phoneme)
//   2. temporalSmoothing — 3-point outlier filter
//   3. preparePhonemeBuffer — pre-computation sizing + VAD
//   4. LipsyncPlayer.process — sequential event dispatch
//   5. Synthetic audio buffer pipeline integration
// ────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  LipsyncPlayer,
  preparePhonemeBuffer,
  temporalSmoothing,
  recognizePhoneme,
  PlayerBufferItem,
  LipsyncEvent,
  LipsyncEventType,
  NULL_PHONEME,
  STEP_SAMPLES,
  ACTIVATION_ENERGY,
} from '../player/player';
import {
  v1a,
  v1b,
  v2a,
  v3a,
  v5a,
  v9b,
  Phoneme,
  encode,
} from '../core/phoneme';

// ════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════

// ── Mock Neural Network ────────────────────────────────────

/**
 * A mock NN that returns pre-determined output vectors in sequence.
 *
 * Each call to `run()` returns the next output from the cycle.
 * If the cycle is shorter than the number of calls, it wraps around.
 */
class MockNN {
  private idx = 0;

  /**
   * @param outputs - Array of 6-element NN output vectors (sigmoid values).
   *                  Pass a single-element array when all positions should
   *                  return the same output.
   */
  constructor(private readonly outputs: number[][]) {}

  run(_input: number[]): number[] {
    const result = this.outputs[this.idx % this.outputs.length];
    this.idx++;
    return result;
  }
}

// ── Synthetic Audio Buffer ─────────────────────────────────

/**
 * Create a synthetic Float32Array audio buffer.
 *
 * When `highEnergy` is true the buffer is filled with a 440 Hz sine wave
 * at amplitude 0.5 — this produces energy well above 0.025 after
 * decimation.
 *
 * When `highEnergy` is false the buffer is all zeros (silence).
 *
 * @param lengthSamples - Total number of samples.
 * @param highEnergy    - If true, fill with non-silent audio.
 * @returns A PCM float32 buffer.
 */
function createSyntheticAudio(
  lengthSamples: number,
  highEnergy: boolean = true,
): Float32Array {
  const buf = new Float32Array(lengthSamples);
  if (highEnergy) {
    for (let i = 0; i < lengthSamples; i++) {
      // 440 Hz sine, amplitude 0.5 → high enough energy for VAD
      buf[i] = Math.sin((2 * Math.PI * 440 * i) / 44100) * 0.5;
    }
  }
  // else: all zeros (silence)
  return buf;
}

/**
 * Create a synthetic buffer with a known energy pattern.
 *
 * The first `silenceSamples` samples are zeros; the rest are
 * high-energy sine wave. This produces a predictable VAD boundary.
 */
function createSplitAudio(
  totalSamples: number,
  silenceSamples: number,
): Float32Array {
  const buf = createSyntheticAudio(totalSamples, false);
  for (let i = silenceSamples; i < totalSamples; i++) {
    buf[i] = Math.sin((2 * Math.PI * 440 * i) / 44100) * 0.5;
  }
  return buf;
}

/**
 * Helper to count phoneme ticks in a given duration.
 *
 * Matches the AS3 loop:
 *   for position = step; position < durationSamples; position += step
 */
function expectedBufferLength(durationSamples: number): number {
  return Math.max(0, Math.floor((durationSamples - 1) / STEP_SAMPLES));
}

/**
 * Build a minimal PlayerBufferItem quickly for smoothing tests.
 */
function makeItem(phoneme: Phoneme, position: number = 0): PlayerBufferItem {
  return { phoneme, position, energy: 0.1, samples: [] };
}

// ════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════

describe('LipsyncPlayer — Unit', () => {
  // ── 1. recognizePhoneme ──────────────────────────────────
  describe('recognizePhoneme', () => {
    it('should return NULL phoneme for silence (energy < 0.025)', () => {
      // One window of silence → energy = 0 < 0.025
      const audio = new Float32Array(794);
      const mockNN = new MockNN([[0.99, 0.99, 0.99, 0.99, 0.99, 0.99]]);

      const item = recognizePhoneme(audio, 0, mockNN);

      expect(item.phoneme).toBe(NULL_PHONEME);
      expect(item.energy).toBe(0);
      expect(item.position).toBe(0);
    });

    it('should decode a phoneme for high-energy audio', () => {
      // v5a = id=20, binary MSB-first [0, 1, 0, 1, 0, 0]
      // Buffer must be at least SAMPLES_PER_WINDOW (794) plus position.
      const bufLen = 882 + 794; // position + window
      const audio = createSyntheticAudio(bufLen, true);
      const mockNN = new MockNN([[0, 1, 0, 1, 0, 0]]);

      const item = recognizePhoneme(audio, 882, mockNN);

      expect(item.energy).toBeGreaterThanOrEqual(ACTIVATION_ENERGY);
      expect(item.phoneme).not.toBe(NULL_PHONEME);
    });

    it('should set the position on the returned item', () => {
      const audio = createSyntheticAudio(794, true);
      const mockNN = new MockNN([[0, 0, 0, 0, 1, 0]]);

      const item = recognizePhoneme(audio, 1764, mockNN);
      expect(item.position).toBe(1764);
    });
  });

  // ── 2. temporalSmoothing ─────────────────────────────────
  describe('temporalSmoothing', () => {
    it('should not modify a buffer with fewer than 3 items', () => {
      const buffer = [makeItem(v1a), makeItem(v2a)];
      const before = buffer[0].phoneme;
      temporalSmoothing(buffer);
      expect(buffer[0].phoneme).toBe(before);
      expect(buffer[1].phoneme).toBe(buffer[1].phoneme);
    });

    it('should replace an outlier with the next phoneme', () => {
      // f=v1a, c=v5a (outlier), s=v1a
      const buffer = [makeItem(v1a), makeItem(v5a), makeItem(v1a)];
      temporalSmoothing(buffer);
      // c differs from both → replaced by next (v1a)
      expect(buffer[1].phoneme).toBe(v1a);
    });

    it('should prefer next over prev when both are non-NULL', () => {
      // f=v1a, c=v5a (outlier), s=v3a → both non-NULL, prefer next
      const buffer = [makeItem(v1a), makeItem(v5a), makeItem(v3a)];
      temporalSmoothing(buffer);
      expect(buffer[1].phoneme).toBe(v3a); // next
    });

    it('should fall back to prev when next is NULL', () => {
      const buffer = [makeItem(v1a), makeItem(v5a), makeItem(NULL_PHONEME)];
      temporalSmoothing(buffer);
      expect(buffer[1].phoneme).toBe(v1a); // prev
    });

    it('should leave outlier unchanged when both neighbours are NULL', () => {
      const buffer = [
        makeItem(NULL_PHONEME),
        makeItem(v5a),
        makeItem(NULL_PHONEME),
      ];
      temporalSmoothing(buffer);
      expect(buffer[1].phoneme).toBe(v5a); // unchanged
    });

    it('should not modify an item that matches its predecessor', () => {
      const buffer = [makeItem(v1a), makeItem(v1a), makeItem(v2a)];
      temporalSmoothing(buffer);
      expect(buffer[1].phoneme).toBe(v1a); // unchanged (matches prev)
    });

    it('should not modify an item that matches its successor', () => {
      const buffer = [makeItem(v2a), makeItem(v1a), makeItem(v1a)];
      temporalSmoothing(buffer);
      expect(buffer[1].phoneme).toBe(v1a); // unchanged (matches next)
    });

    it('should never modify the first or last buffer item', () => {
      const buffer = [makeItem(v1a), makeItem(v5a), makeItem(v2a)];
      temporalSmoothing(buffer);
      expect(buffer[0].phoneme).toBe(v1a);
      expect(buffer[2].phoneme).toBe(v2a);
    });

    it('should filter multiple outliers across a longer buffer', () => {
      // Pattern: v1a, v1a, v5a( outlier ), v1a, v9b( outlier ), v1a, v1a
      const buffer = [
        makeItem(v1a),
        makeItem(v1a),
        makeItem(v5a),  // outlier — differs from v1a and v1a
        makeItem(v1a),
        makeItem(v9b),  // outlier — differs from v1a and v1a
        makeItem(v1a),
        makeItem(v1a),
      ];
      temporalSmoothing(buffer);

      // Index 2 (v5a) → replaced by v1a (matches both neighbours)
      expect(buffer[2].phoneme).toBe(v1a);
      // Index 4 (v9b) → replaced by v1a
      expect(buffer[4].phoneme).toBe(v1a);
    });
  });

  // ── 3. preparePhonemeBuffer ──────────────────────────────
  describe('preparePhonemeBuffer', () => {
    it('should produce the correct number of buffer items for 1s audio', () => {
      // 1 second at 44100 Hz
      const audio = createSyntheticAudio(44100, true);
      const mockNN = new MockNN([[0, 0, 0, 0, 1, 0]]); // v1a

      const buffer = preparePhonemeBuffer(audio, mockNN);

      // AS3 loop: position=882; position < 44100; position+=882
      // items = floor((44100 - 1) / 882) but AS3 uses int comparison
      // position < 44100 means max position = 44100 - 882 = 43218
      // items = 43218 / 882 = 49
      expect(buffer).toHaveLength(49);
    });

    it('should return empty buffer for audio shorter than one step', () => {
      const audio = new Float32Array(800); // < 882
      const mockNN = new MockNN([[0, 0, 0, 0, 1, 0]]);

      const buffer = preparePhonemeBuffer(audio, mockNN);
      expect(buffer).toHaveLength(0);
    });

    it('should return exactly 1 item for audio just over one step', () => {
      const audio = new Float32Array(900); // 882 < 900
      const mockNN = new MockNN([[0, 0, 0, 0, 1, 0]]);

      const buffer = preparePhonemeBuffer(audio, mockNN);
      expect(buffer).toHaveLength(1);
      expect(buffer[0].position).toBe(882);
    });

    it('should have all NULL phonemes for silence (VAD active)', () => {
      const audio = new Float32Array(44100); // 1 second silence
      const mockNN = new MockNN([[0.99, 0.99, 0.99, 0.99, 0.99, 0.99]]);

      const buffer = preparePhonemeBuffer(audio, mockNN);

      expect(buffer.length).toBeGreaterThan(0);
      for (const item of buffer) {
        expect(item.phoneme).toBe(NULL_PHONEME);
        expect(item.energy).toBe(0);
      }
    });

    it('should apply temporal smoothing after pre-computation', () => {
      // Create audio that's mostly silent with short non-silent segments.
      // Use a mock NN that alternates outputs, then verify smoothing.
      // This is a structural test: the smoothing step runs after the loop.
      const audio = createSyntheticAudio(44100, true);
      // Cycle through: v1a, v1a, v5a, v1a (v5a at index 2 would be an outlier)
      // but the NN outputs are deterministic per position.
      // Since energy≥0.025 consistently, phonemes cycle deterministically.
      const mockNN = new MockNN([
        encode(2),   // v1a
        encode(2),   // v1a
        encode(20),  // v5a (potential outlier if neighbors are v1a)
        encode(2),   // v1a
        encode(2),   // v1a
      ]);

      const buffer = preparePhonemeBuffer(audio, mockNN);

      // Due to smoothing, no item should be an outlier.
      for (let i = 1; i < buffer.length - 1; i++) {
        const prev = buffer[i - 1].phoneme;
        const curr = buffer[i].phoneme;
        const next = buffer[i + 1].phoneme;
        // If curr differs from both, it should have been smoothed
        if (curr !== prev && curr !== next) {
          // This should not happen after smoothing
          expect(false).toBe(true);
        }
      }
    });

    it('should correctly handle split audio (silence then signal)', () => {
      // 1 second = 44100 samples, first 8820 samples (200ms) are silence
      const audio = createSplitAudio(44100, 8820);
      const mockNN = new MockNN([[0, 0, 0, 0, 1, 0]]); // v1a

      const buffer = preparePhonemeBuffer(audio, mockNN);

      // Items before the energy threshold: position < ~8820
      // At step 882, positions are: 882, 1764, 2646, 3528, 4410, 5292,
      // 6174, 7056, 7938, 8820, ...
      // Silence region ends at sample 8820.
      // The window at position 8820 starts at sample 8820, extracts 794
      // samples (8820..9613). This includes some high-energy audio
      // starting at sample 8820, so energy may be > 0.
      // Items at positions 882..7938 are purely silence → NULL.
      for (const item of buffer) {
        if (item.position < 8820) {
          // All items before the signal should be silence
          expect(item.energy).toBeLessThan(ACTIVATION_ENERGY);
          expect(item.phoneme).toBe(NULL_PHONEME);
        }
        // Items at or after position 8820 may have mixed energy
        // depending on window alignment.
      }
    });
  });
});

// ════════════════════════════════════════════════════════════
// Integration: LipsyncPlayer class — event dispatch
// ════════════════════════════════════════════════════════════

describe('LipsyncPlayer — Integration', () => {
  describe('process', () => {
    it('should dispatch events in order: PLAYING_START → PHONEME* → PLAYING_COMPLETE', () => {
      const audio = createSyntheticAudio(44100, true);
      const mockNN = new MockNN([[0, 0, 0, 0, 1, 0]]); // v1a
      const player = new LipsyncPlayer(mockNN);

      const events: LipsyncEvent[] = [];
      player.on('PLAYING_START', (e) => events.push(e));
      player.on('PHONEME', (e) => events.push(e));
      player.on('PLAYING_COMPLETE', (e) => events.push(e));

      player.process(audio);

      // First → PLAYING_START, last → PLAYING_COMPLETE
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events[0].type).toBe('PLAYING_START');
      expect(events[events.length - 1].type).toBe('PLAYING_COMPLETE');

      // Middle events are all PHONEME
      for (let i = 1; i < events.length - 1; i++) {
        expect(events[i].type).toBe('PHONEME');
      }
    });

    it('should dispatch exactly (buffer length) PHONEME events', () => {
      const audio = createSyntheticAudio(44100, true);
      const mockNN = new MockNN([[0, 0, 0, 0, 1, 0]]);
      const player = new LipsyncPlayer(mockNN);

      const phonemeEvents: LipsyncEvent[] = [];
      player.on('PHONEME', (e) => phonemeEvents.push(e));
      player.on('PLAYING_START', () => {});   // suppress unused-callback
      player.on('PLAYING_COMPLETE', () => {});

      player.process(audio);

      // 1 second → 49 phoneme ticks
      expect(phonemeEvents).toHaveLength(49);
    });

    it('should set phoneme and amplitude on each PHONEME event', () => {
      const audio = createSyntheticAudio(44100, true);
      const mockNN = new MockNN([[0, 0, 0, 0, 1, 0]]); // v1a
      const player = new LipsyncPlayer(mockNN);

      const phonemeEvents: LipsyncEvent[] = [];
      player.on('PHONEME', (e) => phonemeEvents.push(e));
      player.on('PLAYING_START', () => {});
      player.on('PLAYING_COMPLETE', () => {});

      player.process(audio);

      for (const evt of phonemeEvents) {
        expect(evt.phoneme).toBeDefined();
        expect(typeof evt.amplitude).toBe('number');
      }
    });

    it('should call callbacks in registration order', () => {
      const audio = createSyntheticAudio(8820, true); // ~200ms
      const mockNN = new MockNN([[0, 0, 0, 0, 1, 0]]);
      const player = new LipsyncPlayer(mockNN);

      const order: number[] = [];
      player.on('PHONEME', () => order.push(1));
      player.on('PHONEME', () => order.push(2));
      player.on('PLAYING_START', () => order.push(0));
      player.on('PLAYING_COMPLETE', () => order.push(9));

      player.process(audio);

      // PLAYING_START (0) should come first
      expect(order[0]).toBe(0);
      // PLAYING_COMPLETE (9) should come last
      expect(order[order.length - 1]).toBe(9);
      // For each PHONEME, callbacks fire in registration order
      const phonemePairs = order.slice(1, -1); // remove start and complete
      for (let i = 0; i < phonemePairs.length; i += 2) {
        expect(phonemePairs[i]).toBe(1);
        expect(phonemePairs[i + 1]).toBe(2);
      }
    });
  });
});

// ════════════════════════════════════════════════════════════
// Full Pipeline: Synthetic audio → LPC → NN → Phoneme
// ════════════════════════════════════════════════════════════

describe('LipsyncPlayer — Full Pipeline Integration', () => {
  it('should process a synthetic buffer end-to-end without throwing', () => {
    // 100 ms buffer (4410 samples) → enough for a few phoneme ticks
    const audio = createSyntheticAudio(4410, true);
    const mockNN = new MockNN([[0, 0, 0, 0, 1, 0]]);
    const player = new LipsyncPlayer(mockNN);

    expect(() => {
      player.process(audio);
    }).not.toThrow();
  });

  it('should emit PLAYING_COMPLETE even for empty buffer (very short audio)', () => {
    const audio = new Float32Array(800); // < 882 → no phoneme ticks
    const mockNN = new MockNN([[0, 0, 0, 0, 1, 0]]);
    const player = new LipsyncPlayer(mockNN);

    const events: LipsyncEvent[] = [];
    player.on('PLAYING_START', (e) => events.push(e));
    player.on('PHONEME', (e) => events.push(e));
    player.on('PLAYING_COMPLETE', (e) => events.push(e));

    player.process(audio);

    // Should still emit PLAYING_START and PLAYING_COMPLETE
    expect(events.length).toBe(2); // no PHONEME events
    expect(events[0].type).toBe('PLAYING_START');
    expect(events[1].type).toBe('PLAYING_COMPLETE');
  });

  it('should respect VAD in the full pipeline (silence → all NULL)', () => {
    const audio = new Float32Array(44100); // 1 second silence
    const mockNN = new MockNN([[0.99, 0.99, 0.99, 0.99, 0.99, 0.99]]);

    const buffer = preparePhonemeBuffer(audio, mockNN);

    // All items should be NULL because energy < 0.025
    for (const item of buffer) {
      expect(item.phoneme).toBe(NULL_PHONEME);
    }
  });

  it('should handle the real NN with known weights via mock simulation', () => {
    // This tests the pipeline with a mock NN that simulates what the
    // real ground-truth network would produce for known phonemes.
    // v9b = id=63 = [1,1,1,1,1,1] — all sigmoids above 0.5
    const audio = createSyntheticAudio(8820, true); // ~200 ms
    const mockNN = new MockNN([[1, 1, 1, 1, 1, 1]]); // v9b
    const player = new LipsyncPlayer(mockNN);

    const phonemeEvents: LipsyncEvent[] = [];
    player.on('PHONEME', (e) => phonemeEvents.push(e));
    player.on('PLAYING_START', () => {});
    player.on('PLAYING_COMPLETE', () => {});

    player.process(audio);

    // All phoneme events should decode to v9b (id=63)
    for (const evt of phonemeEvents) {
      expect(evt.phoneme.id).toBe(63);
      expect(evt.phoneme.alias).toBe('v9b');
    }
  });

  it('should produce correct event count for varying audio durations', () => {
    const durations = [
      { samples: 4410, expected: 4 },   // 100ms
      { samples: 22050, expected: 24 },  // 500ms
      { samples: 44100, expected: 49 },  // 1s
      { samples: 88200, expected: 99 },  // 2s
    ];

    for (const { samples, expected } of durations) {
      const audio = createSyntheticAudio(samples, true);
      const mockNN = new MockNN([[0, 0, 0, 0, 1, 0]]);
      const player = new LipsyncPlayer(mockNN);

      const phonemeEvents: LipsyncEvent[] = [];
      player.on('PHONEME', (e) => phonemeEvents.push(e));
      player.on('PLAYING_START', () => {});
      player.on('PLAYING_COMPLETE', () => {});

      player.process(audio);

      expect(phonemeEvents).toHaveLength(expected);
    }
  });
});
