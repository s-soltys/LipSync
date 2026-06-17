// ────────────────────────────────────────────────────────────
// Phoneme Module — Tests
// ────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  NULL_PHONEME,
  v1a, v1b, v2a, v2b, v3a, v3b,
  v4a, v4b, v5a, v5b, v6a, v6b,
  v7a, v7b, v8a, v8b, v9a, v9b,
  Phoneme,
  PHONEMES,
  getById,
  getByAlias,
  phonemeToArray,
  phonemeToArrayFromId,
  arrayToPhoneme,
  arrayToId,
  encode,
  decode,
} from '../core/phoneme';
import * as fs from 'fs';
import * as path from 'path';

// ── Ground truth ───────────────────────────────────────────

interface GroundTruthEntry {
  constant: string;
  id: number;
  viseme_id: number;
  alias: string;
  binary_encoding: number[];
  binary_string: string;
}

function loadGroundTruth(): GroundTruthEntry[] {
  // Project root is cwd when running tests from project root
  const gtPath = path.resolve(process.cwd(), 'ground-truth/phoneme-model.json');
  return JSON.parse(fs.readFileSync(gtPath, 'utf-8'));
}

// ── Helpers ────────────────────────────────────────────────

/** All 19 phoneme objects in the same order as the ground truth. */
const ALL_PHONEMES: Phoneme[] = [
  NULL_PHONEME,
  v1a, v1b,
  v2a, v2b,
  v3a, v3b,
  v4a, v4b,
  v5a, v5b,
  v6a, v6b,
  v7a, v7b,
  v8a, v8b,
  v9a, v9b,
];

// The IDs that should exist
const EXPECTED_IDS = [0, 2, 3, 6, 7, 10, 11, 14, 15, 20, 21, 30, 31, 40, 41, 52, 53, 62, 63];

// ── Tests ──────────────────────────────────────────────────

describe('Phoneme module', () => {

  // ── 1. Registry completeness ───────────────────────────
  describe('registry', () => {
    it('should have exactly 19 phonemes', () => {
      expect(PHONEMES).toHaveLength(19);
      expect(ALL_PHONEMES).toHaveLength(19);
    });

    it('should include the NULL phoneme as first entry', () => {
      expect(NULL_PHONEME.id).toBe(0);
      expect(NULL_PHONEME.symbol).toBe('');
      expect(NULL_PHONEME.visemeId).toBe(0);
      expect(NULL_PHONEME.alias).toBe('silence');
    });

    it('should have all expected IDs', () => {
      const ids = PHONEMES.map(p => p.id).sort((a, b) => a - b);
      expect(ids).toEqual(EXPECTED_IDS);
    });

    it('should cover all 9 viseme groups', () => {
      const visemeIds = [...new Set(PHONEMES.filter(p => p.id !== 0).map(p => p.visemeId))].sort((a, b) => a - b);
      expect(visemeIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should have a/b variant pairs for each viseme (difference of 1)', () => {
      for (let v = 1; v <= 9; v++) {
        const group = PHONEMES.filter(p => p.visemeId === v);
        expect(group).toHaveLength(2);
        expect(Math.abs(group[0].id - group[1].id)).toBe(1);
      }
    });
  });

  // ── 2. Lookup by ID ────────────────────────────────────
  describe('getById', () => {
    it('should return the correct phoneme for each valid ID', () => {
      for (const p of ALL_PHONEMES) {
        const found = getById(p.id);
        expect(found.id).toBe(p.id);
        expect(found.symbol).toBe(p.symbol);
        expect(found.visemeId).toBe(p.visemeId);
      }
    });

    it('should return NULL phoneme for unmapped IDs', () => {
      const unmapped = [1, 4, 5, 8, 9, 12, 13, 16, 17, 18, 19, 22, 23, 64, 100, -1];
      for (const id of unmapped) {
        const found = getById(id);
        expect(found.id).toBe(0);
        expect(found.symbol).toBe('');
      }
    });

    it('should return NULL phoneme for id=0', () => {
      const found = getById(0);
      expect(found.id).toBe(0);
      expect(found.alias).toBe('silence');
    });
  });

  // ── 3. Lookup by alias ─────────────────────────────────
  describe('getByAlias', () => {
    it('should return the correct phoneme for each valid alias', () => {
      const aliases = ['silence', 'v1a', 'v1b', 'v2a', 'v2b', 'v3a', 'v3b',
        'v4a', 'v4b', 'v5a', 'v5b', 'v6a', 'v6b',
        'v7a', 'v7b', 'v8a', 'v8b', 'v9a', 'v9b'];
      for (const alias of aliases) {
        const found = getByAlias(alias);
        expect(found.alias).toBe(alias);
      }
    });

    it('should return NULL phoneme for unknown alias', () => {
      const found = getByAlias('nonexistent');
      expect(found.id).toBe(0);
    });
  });

  // ── 4. Encoding (phonemeToArray / encode) ──────────────
  describe('encode (phonemeToArray)', () => {
    it('should encode ID 0 as all zeros', () => {
      expect(phonemeToArrayFromId(0)).toEqual([0, 0, 0, 0, 0, 0]);
      expect(encode(0)).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it('should encode ID 63 as all ones', () => {
      expect(phonemeToArrayFromId(63)).toEqual([1, 1, 1, 1, 1, 1]);
      expect(encode(63)).toEqual([1, 1, 1, 1, 1, 1]);
    });

    it('should encode ID 2 (v1a) as [0,0,0,0,1,0] (MSB-first)', () => {
      // 2 decimal = 000010 binary → MSB-first array
      expect(phonemeToArrayFromId(2)).toEqual([0, 0, 0, 0, 1, 0]);
    });

    it('should encode ID 3 (v1b) as [0,0,0,0,1,1]', () => {
      expect(phonemeToArrayFromId(3)).toEqual([0, 0, 0, 0, 1, 1]);
    });

    it('should encode ID 10 (v3a) as [0,0,1,0,1,0]', () => {
      // 10 decimal = 001010 binary
      expect(phonemeToArrayFromId(10)).toEqual([0, 0, 1, 0, 1, 0]);
    });

    it('should encode ID 40 (v7a) as [1,0,1,0,0,0]', () => {
      // 40 decimal = 101000 binary
      expect(phonemeToArrayFromId(40)).toEqual([1, 0, 1, 0, 0, 0]);
    });

    it('should encode ID 52 (v8a) as [1,1,0,1,0,0]', () => {
      expect(phonemeToArrayFromId(52)).toEqual([1, 1, 0, 1, 0, 0]);
    });

    it('should encode all 19 phonemes correctly (MSB-first)', () => {
      // Verify against the spec table from phoneme.spec.md §3.3
      const expected: Record<number, number[]> = {
        0:  [0, 0, 0, 0, 0, 0],
        2:  [0, 0, 0, 0, 1, 0],
        3:  [0, 0, 0, 0, 1, 1],
        6:  [0, 0, 0, 1, 1, 0],
        7:  [0, 0, 0, 1, 1, 1],
        10: [0, 0, 1, 0, 1, 0],
        11: [0, 0, 1, 0, 1, 1],
        14: [0, 0, 1, 1, 1, 0],
        15: [0, 0, 1, 1, 1, 1],
        20: [0, 1, 0, 1, 0, 0],
        21: [0, 1, 0, 1, 0, 1],
        30: [0, 1, 1, 1, 1, 0],
        31: [0, 1, 1, 1, 1, 1],
        40: [1, 0, 1, 0, 0, 0],
        41: [1, 0, 1, 0, 0, 1],
        52: [1, 1, 0, 1, 0, 0],
        53: [1, 1, 0, 1, 0, 1],
        62: [1, 1, 1, 1, 1, 0],
        63: [1, 1, 1, 1, 1, 1],
      };
      for (const [id, bits] of Object.entries(expected)) {
        const encoded = phonemeToArrayFromId(Number(id));
        expect(encoded).toEqual(bits);
      }
    });

    it('should produce MSB-first: index 0 = highest power (2^(digits-1))', () => {
      // ID=32 should set only index 0 (bit value 32)
      expect(phonemeToArrayFromId(32)).toEqual([1, 0, 0, 0, 0, 0]);
      // ID=16 should set only index 1
      expect(phonemeToArrayFromId(16)).toEqual([0, 1, 0, 0, 0, 0]);
      // ID=8 should set only index 2
      expect(phonemeToArrayFromId(8)).toEqual([0, 0, 1, 0, 0, 0]);
      // ID=4 should set only index 3
      expect(phonemeToArrayFromId(4)).toEqual([0, 0, 0, 1, 0, 0]);
      // ID=2 should set only index 4
      expect(phonemeToArrayFromId(2)).toEqual([0, 0, 0, 0, 1, 0]);
      // ID=1 should set only index 5
      expect(phonemeToArrayFromId(1)).toEqual([0, 0, 0, 0, 0, 1]);
    });

    it('should accept custom digit count', () => {
      expect(phonemeToArrayFromId(5, 3)).toEqual([1, 0, 1]); // 5 = 101 in 3-bit
      expect(phonemeToArrayFromId(7, 4)).toEqual([0, 1, 1, 1]); // 7 = 0111 in 4-bit
    });

    it('should handle ID > max bit range by using only lower bits', () => {
      // 64 = 1000000 in 7-bit; only lower 6 bits (0) extracted
      expect(phonemeToArrayFromId(64)).toEqual([0, 0, 0, 0, 0, 0]);
      // 65 = 1000001 → lower 6 bits = 1
      expect(phonemeToArrayFromId(65)).toEqual([0, 0, 0, 0, 0, 1]);
    });
  });

  // ── 5. Decoding (arrayToPhoneme / decode) ──────────────
  describe('decode (arrayToPhoneme)', () => {
    it('should decode all-zero array to NULL phoneme', () => {
      const p = arrayToPhoneme([0, 0, 0, 0, 0, 0]);
      expect(p.id).toBe(0);
    });

    it('should decode [0,0,0,0,1,0] to v1a (ID=2)', () => {
      const p = arrayToPhoneme([0, 0, 0, 0, 1, 0]);
      expect(p.id).toBe(2);
      expect(p.alias).toBe('v1a');
    });

    it('should decode [1,1,1,1,1,1] to v9b (ID=63)', () => {
      const p = arrayToPhoneme([1, 1, 1, 1, 1, 1]);
      expect(p.id).toBe(63);
      expect(p.alias).toBe('v9b');
    });

    it('should use threshold ≥0.5', () => {
      // Just below threshold → bit 0
      expect(arrayToId([0.4999, 0, 0, 0, 0, 0])).toBe(0);
      // Exactly at threshold → bit 1
      expect(arrayToId([0.5, 0, 0, 0, 0, 0])).toBe(32);
      // Just above threshold → bit 1
      expect(arrayToId([0.5001, 0, 0, 0, 0, 0])).toBe(32);
    });

    it('should handle continuous values between 0 and 1', () => {
      // [0.99, 0.01, 0.01, 0.01, 0.01, 0.01] → only MSB set → ID=32
      expect(arrayToId([0.99, 0.01, 0.01, 0.01, 0.01, 0.01])).toBe(32);
      // [0.01, 0.01, 0.01, 0.01, 0.01, 0.99] → only LSB set → ID=1
      expect(arrayToId([0.01, 0.01, 0.01, 0.01, 0.01, 0.99])).toBe(1);
    });

    it('should return NULL phoneme for NaN input', () => {
      const p = arrayToPhoneme([NaN, NaN, NaN, NaN, NaN, NaN]);
      expect(p.id).toBe(0);
    });

    it('should return NULL phoneme for empty array', () => {
      const p = arrayToPhoneme([]);
      expect(p.id).toBe(0);
    });

    it('should return NULL phoneme for array starting with NaN', () => {
      const p = arrayToPhoneme([NaN, 1, 0, 0, 0, 0]);
      expect(p.id).toBe(0);
    });

    it('should decode unmapped IDs to NULL phoneme (no error)', () => {
      // [0,0,0,0,0,1] = ID=1, which is unmapped
      expect(arrayToId([0, 0, 0, 0, 0, 1])).toBe(1); // raw ID is 1
      const p = arrayToPhoneme([0, 0, 0, 0, 0, 1]);
      expect(p.id).toBe(0); // returns NULL phoneme
      expect(p.alias).toBe('silence');
    });
  });

  // ── 6. Round-trip (encode → decode == identity) ────────
  describe('round-trip encode→decode', () => {
    it('should round-trip all 19 phoneme IDs', () => {
      for (const p of ALL_PHONEMES) {
        const encoded = encode(p.id);
        const decoded = decode(encoded);
        expect(decoded.id).toBe(p.id);
        expect(decoded.alias).toBe(p.alias);
      }
    });

    it('should round-trip via phonemeToArray → arrayToPhoneme', () => {
      for (const p of ALL_PHONEMES) {
        const encoded = phonemeToArray(p);
        const decoded = arrayToPhoneme(encoded);
        expect(decoded.id).toBe(p.id);
      }
    });

    it('should round-trip all 64 possible 6-bit values', () => {
      for (let id = 0; id < 64; id++) {
        const encoded = encode(id);
        const decodedId = arrayToId(encoded);
        expect(decodedId).toBe(id);
      }
    });
  });

  // ── 7. Consistency with ground truth ───────────────────
  describe('ground truth consistency', () => {
    const gt = loadGroundTruth();

    it('should have 19 entries in ground truth', () => {
      expect(gt).toHaveLength(19);
    });

    it('should match all ground truth IDs', () => {
      for (let i = 0; i < gt.length; i++) {
        expect(gt[i].id).toBe(ALL_PHONEMES[i].id);
      }
    });

    it('should match all ground truth viseme IDs', () => {
      for (let i = 0; i < gt.length; i++) {
        expect(gt[i].viseme_id).toBe(ALL_PHONEMES[i].visemeId);
      }
    });

    it('should match all ground truth aliases', () => {
      for (let i = 0; i < gt.length; i++) {
        expect(gt[i].alias).toBe(ALL_PHONEMES[i].alias);
      }
    });

    it('should match ground truth binary_encoding (LSB-first) when reversed', () => {
      for (const entry of gt) {
        const msbFirst = encode(entry.id);
        // phonemeToArray produces MSB-first; ground truth stores LSB-first.
        // So reversed(encode(id)) should equal ground truth binary_encoding.
        const reversed = [...msbFirst].reverse();
        expect(reversed).toEqual(entry.binary_encoding);
      }
    });

    it('should match ground truth binary_string (LSB-first string)', () => {
      for (const entry of gt) {
        const msbFirst = encode(entry.id);
        const reversed = [...msbFirst].reverse();
        const stringFromCode = reversed.join('');
        expect(stringFromCode).toBe(entry.binary_string);
      }
    });
  });
});
