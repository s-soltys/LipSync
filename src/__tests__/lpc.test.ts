// ────────────────────────────────────────────────────────────
// LPC Module — Unit Tests
// ────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  LPC_ORDER,
  createWindow,
  computeAutocorrelation,
  computeCoef,
  analyze,
} from '../core/lpc';
import * as fs from 'fs';
import * as path from 'path';

// ── Ground truth loader ───────────────────────────────────

interface LpcTestVector {
  name: string;
  expected_coefficients: number[];
}

interface LpcTestVectors {
  order: number;
  window_type: string;
  window_formula: string;
  pre_emphasis_lambda: number;
  output_type: string;
  test_vectors: LpcTestVector[];
}

function loadTestVectors(): LpcTestVectors {
  const raw = fs.readFileSync(
    path.resolve(__dirname, '../../ground-truth/lpc-test-vectors.json'),
    'utf-8',
  );
  return JSON.parse(raw) as LpcTestVectors;
}

// ── Signal synthesis (must match compute-ground-truth.ts) ─

const SAMPLE_RATE = 44100;
const STRIDE = 7;
const WINDOW_LENGTH = 794;

/** Deterministic seeded PRNG (LCG) for reproducible white noise */
class SeededRandom {
  private s: number;
  constructor(seed: number) {
    this.s = seed;
  }
  next(): number {
    this.s = (this.s * 1664525 + 1013904223) | 0;
    return (this.s >>> 0) / 0x100000000;
  }
}

function synthesize(generator: (t: number) => number): number[] {
  const samples: number[] = [];
  for (let i = 0; i < WINDOW_LENGTH; i += STRIDE) {
    samples.push(generator(i / SAMPLE_RATE));
  }
  return samples;
}

// ── Tests ──────────────────────────────────────────────────

describe('LPC Module', () => {
  // ── Constants ────────────────────────────────────────────

  it('should export LPC_ORDER = 9', () => {
    expect(LPC_ORDER).toBe(9);
  });

  // ── Hamming window ──────────────────────────────────────

  describe('createWindow', () => {
    it('should produce correct length', () => {
      const w = createWindow(113);
      expect(w).toHaveLength(113);
    });

    it('should produce symmetric window', () => {
      const N = 113;
      const w = createWindow(N);
      for (let n = 0; n < N; n++) {
        expect(w[n]).toBeCloseTo(w[N - 1 - n], 12);
      }
    });

    it('should have endpoints close to 0.08', () => {
      const N = 113;
      const w = createWindow(N);
      // Hamming: w[0] = 0.54 - 0.46 = 0.08
      expect(w[0]).toBeCloseTo(0.08, 12);
      expect(w[N - 1]).toBeCloseTo(0.08, 12);
    });

    it('should have middle close to 1.0', () => {
      const N = 113;
      const w = createWindow(N);
      const mid = Math.floor((N - 1) / 2);
      // Hamming: w[mid] = 0.54 + 0.46 = 1.0 when cos(π) = -1
      expect(w[mid]).toBeCloseTo(1.0, 12);
    });

    it('should match formula exactly', () => {
      const N = 10;
      const w = createWindow(N);
      for (let n = 0; n < N; n++) {
        const expected = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1));
        expect(w[n]).toBe(expected);
      }
    });
  });

  // ── Autocorrelation ─────────────────────────────────────

  describe('computeAutocorrelation', () => {
    it('should return 10 values (0..LPC_ORDER inclusive)', () => {
      const R = computeAutocorrelation([1, 2, 3]);
      expect(R).toHaveLength(LPC_ORDER + 1); // p+1 = 10
    });

    it('should have R[0] = sum of squares', () => {
      const x = [1, 2, 3, 4, 5];
      const R = computeAutocorrelation(x);
      expect(R[0]).toBe(1 + 4 + 9 + 16 + 25);
    });

    it('should produce zeros for silence input', () => {
      const x = [0, 0, 0, 0, 0];
      const R = computeAutocorrelation(x);
      for (let i = 0; i <= LPC_ORDER; i++) {
        expect(R[i]).toBe(0);
      }
    });

    it('should match biased autocorrelation formula (λ=0)', () => {
      const x = [1, -2, 3, -4, 5, -6, 7, -8, 9, -10, 11, -12, 13, -14, 15];
      const R = computeAutocorrelation(x);
      // With λ=0, R[i] = sum_{k=i}^{L-1} x[k-i] * x[k] (biased estimate)
      for (let i = 0; i <= LPC_ORDER; i++) {
        let expected = 0;
        for (let k = i; k < x.length; k++) {
          expected += x[k - i] * x[k];
        }
        expect(R[i]).toBeCloseTo(expected, 10);
      }
    });
  });

  // ── Durbin-Levinson ─────────────────────────────────────

  describe('computeCoef', () => {
    it('should return 9 coefficients', () => {
      const R = [100, 50, 25, 12.5, 6.25, 3.125, 1.5625, 0.78125, 0.390625, 0.1953125];
      const K = computeCoef(R);
      expect(K).toHaveLength(LPC_ORDER); // 9
    });

    it('should return all zeros for zero energy', () => {
      const R = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const K = computeCoef(R);
      expect(K).toHaveLength(9);
      for (const k of K) {
        expect(k).toBe(0);
      }
    });

    it('should have all coefficients in [-1, 1]', () => {
      const testCases: number[][] = [
        [100, 50, 25, 12.5, 6.25, 3.125, 1.5625, 0.78125, 0.390625, 0.1953125],
        [100, 90, 81, 72.9, 65.61, 59.049, 53.1441, 47.82969, 43.046721, 38.7420489],
        [100, -50, 25, -12.5, 6.25, -3.125, 1.5625, -0.78125, 0.390625, -0.1953125],
        [1, 0.5, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ];
      for (const R of testCases) {
        const K = computeCoef(R);
        for (const k of K) {
          expect(k).toBeGreaterThanOrEqual(-1);
          expect(k).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should produce K[0] = -R[1]/R[0] for first step', () => {
      // For m=1: err=0, km = R[1]/R[0], K[0] = -km = -R[1]/R[0]
      const R = [10, 3, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005];
      const K = computeCoef(R);
      expect(K[0]).toBeCloseTo(-R[1] / R[0], 12);
    });
  });

  // ── Full pipeline: analyze ───────────────────────────────

  describe('analyze', () => {
    it('should return 9 coefficients', () => {
      const K = analyze([1, 2, 3, 4, 5]);
      expect(K).toHaveLength(9);
    });

    it('should handle silence input, returning all zeros', () => {
      const K = analyze([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(K).toHaveLength(9);
      for (const k of K) {
        expect(k).toBe(0);
      }
    });

    it('should produce coefficients in [-1, 1] for any input', () => {
      const inputs = [
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        [-1, 1, -1, 1, -1, 1, -1, 1, -1, 1],
        [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
        [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      ];
      for (const x of inputs) {
        const K = analyze(x);
        for (const k of K) {
          expect(k).toBeGreaterThanOrEqual(-1);
          expect(k).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  // ── Ground truth verification ───────────────────────────

  describe('ground truth verification', () => {
    const testVectors = loadTestVectors();

    // Build deterministic signal generators
    const rng = new SeededRandom(42);

    function getSignal(name: string): number[] {
      switch (name) {
        case '440Hz sine':
          return synthesize((t) => Math.sin(2 * Math.PI * 440 * t));
        case 'mixed 220+880Hz':
          return synthesize(
            (t) =>
              0.5 * Math.sin(2 * Math.PI * 220 * t) +
              0.5 * Math.sin(2 * Math.PI * 880 * t),
          );
        case 'impulse':
          return synthesize((t) => (t === 0 ? 1 : 0));
        case 'white noise':
          return synthesize(() => rng.next() * 2 - 1);
        case 'silence':
          return synthesize(() => 0);
        default:
          throw new Error(`Unknown signal: ${name}`);
      }
    }

    for (const vec of testVectors.test_vectors) {
      it(`should match ground truth for "${vec.name}" (tolerance 1e-9)`, () => {
        const signal = getSignal(vec.name);
        const K = analyze(signal);
        expect(K).toHaveLength(9);

        const expected = vec.expected_coefficients;
        expect(expected).toHaveLength(9);

        for (let i = 0; i < 9; i++) {
          expect(K[i]).toBeCloseTo(expected[i], 9); // 1e-9 tolerance
        }
      });
    }

    it('should have all reflection coefficients in [-1, 1] for all test vectors', () => {
      for (const vec of testVectors.test_vectors) {
        const signal = getSignal(vec.name);
        const K = analyze(signal);
        for (let i = 0; i < 9; i++) {
          expect(K[i]).toBeGreaterThanOrEqual(-1);
          expect(K[i]).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});
