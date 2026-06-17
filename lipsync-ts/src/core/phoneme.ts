// ────────────────────────────────────────────────────────────
// Phoneme Module — TypeScript port of ActionScript Phoneme.as
//                 + PhonemeCollection.as
// ────────────────────────────────────────────────────────────

/**
 * Phoneme data model.
 *
 * Each phoneme represents a viseme (mouth shape) with a symbol,
 * unique integer ID, viseme group ID, and human-readable alias.
 */
export interface Phoneme {
  readonly symbol: string;   // Viseme group: "v1"–"v9" or "" (NULL)
  readonly id: number;       // Unique integer identifier 0–63
  readonly visemeId: number; // Viseme group 1–9 (0 for NULL/silence)
  readonly alias: string;    // e.g. "v1a", "v1b", …, "silence"
}

// ── Phoneme constants ──────────────────────────────────────

export const NULL_PHONEME:  Phoneme = { symbol: "",  id: 0,  visemeId: 0,  alias: "silence" };
export const v1a:          Phoneme = { symbol: "v1", id: 2,  visemeId: 1,  alias: "v1a" };
export const v1b:          Phoneme = { symbol: "v1", id: 3,  visemeId: 1,  alias: "v1b" };
export const v2a:          Phoneme = { symbol: "v2", id: 6,  visemeId: 2,  alias: "v2a" };
export const v2b:          Phoneme = { symbol: "v2", id: 7,  visemeId: 2,  alias: "v2b" };
export const v3a:          Phoneme = { symbol: "v3", id: 10, visemeId: 3,  alias: "v3a" };
export const v3b:          Phoneme = { symbol: "v3", id: 11, visemeId: 3,  alias: "v3b" };
export const v4a:          Phoneme = { symbol: "v4", id: 14, visemeId: 4,  alias: "v4a" };
export const v4b:          Phoneme = { symbol: "v4", id: 15, visemeId: 4,  alias: "v4b" };
export const v5a:          Phoneme = { symbol: "v5", id: 20, visemeId: 5,  alias: "v5a" };
export const v5b:          Phoneme = { symbol: "v5", id: 21, visemeId: 5,  alias: "v5b" };
export const v6a:          Phoneme = { symbol: "v6", id: 30, visemeId: 6,  alias: "v6a" };
export const v6b:          Phoneme = { symbol: "v6", id: 31, visemeId: 6,  alias: "v6b" };
export const v7a:          Phoneme = { symbol: "v7", id: 40, visemeId: 7,  alias: "v7a" };
export const v7b:          Phoneme = { symbol: "v7", id: 41, visemeId: 7,  alias: "v7b" };
export const v8a:          Phoneme = { symbol: "v8", id: 52, visemeId: 8,  alias: "v8a" };
export const v8b:          Phoneme = { symbol: "v8", id: 53, visemeId: 8,  alias: "v8b" };
export const v9a:          Phoneme = { symbol: "v9", id: 62, visemeId: 9,  alias: "v9a" };
export const v9b:          Phoneme = { symbol: "v9", id: 63, visemeId: 9,  alias: "v9b" };

// ── Registry ───────────────────────────────────────────────

/** All 19 phonemes in canonical order (NULL first, then v1–v9 a/b pairs). */
export const PHONEMES: Phoneme[] = [
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

/** Lookup table: phoneme id → Phoneme. Built once at module load. */
export const PHONEME_MAP: Map<number, Phoneme> = new Map(
  PHONEMES.map(p => [p.id, p])
);

/** Lookup table: alias string → Phoneme. Built once at module load. */
export const PHONEME_ALIAS_MAP: Map<string, Phoneme> = new Map(
  PHONEMES.map(p => [p.alias, p])
);

// ── Lookup ─────────────────────────────────────────────────

/**
 * Find a phoneme by its integer ID.
 * Returns the NULL phoneme (id=0) if not found — no error thrown.
 */
export function getById(id: number): Phoneme {
  return PHONEME_MAP.get(id) ?? NULL_PHONEME;
}

/**
 * Find a phoneme by its alias string (e.g. "v1a", "silence").
 * Returns the NULL phoneme if not found — no error thrown.
 */
export function getByAlias(alias: string): Phoneme {
  return PHONEME_ALIAS_MAP.get(alias) ?? NULL_PHONEME;
}

// ── Encoding ───────────────────────────────────────────────

/**
 * Convert a phoneme ID to a binary output vector (big-endian / MSB-first).
 *
 * Convention: `result[0]` = most significant bit (2^(digits-1)),
 *             `result[digits-1]` = least significant bit (2^0).
 *
 * Matches the original AS3 `phonemeToArray` (PhonemeCollection.as).
 *
 * @param id     Phoneme integer ID (0–63)
 * @param digits Number of output bits (default: 6, matches LipsyncSettings.outputCount)
 * @returns Binary vector of length `digits`, each element 0 or 1
 */
export function phonemeToArrayFromId(id: number, digits: number = 6): number[] {
  const result = new Array<number>(digits).fill(0);

  // Iterate from MSB power (2^(digits-1)) down to LSB (2^0)
  for (let i = digits - 1; i >= 0; i--) {
    const power = 1 << i; // Math.pow(2, i) as integer bit-shift
    if ((id & power) !== 0) {
      result[digits - 1 - i] = 1;
    }
  }

  return result;
}

/**
 * Convert a Phoneme object to a binary output vector.
 *
 * @param phoneme Phoneme object
 * @param digits  Number of output bits (default: 6)
 * @returns Binary vector of length `digits`, each element 0 or 1
 */
export function phonemeToArray(phoneme: Phoneme, digits: number = 6): number[] {
  return phonemeToArrayFromId(phoneme.id, digits);
}

/**
 * Alias: encode(phonemeId, bits=6) → big-endian binary array.
 * Matches the naming convention used in the task description.
 */
export function encode(id: number, bits: number = 6): number[] {
  return phonemeToArrayFromId(id, bits);
}

// ── Decoding ──────────────────────────────────────────────

/**
 * Decode a binary vector to a numeric ID.
 *
 * Reads the array as MSB-first (index 0 = MSB).
 * Uses a ≥0.5 threshold to binarise continuous values (NN output).
 *
 * Matches the original AS3 `arrayToPhoneme` inner logic.
 *
 * @param array Binary vector (6 elements, values 0–1)
 * @returns Reconstructed integer ID (0–63)
 */
export function arrayToId(array: number[]): number {
  if (array.length === 0 || isNaN(array[0])) {
    return 0;
  }

  // Iterate from the END of the array (= LSB, 2^0) backwards
  let result = 0;
  let mult = 1; // 2^0

  for (let i = array.length - 1; i >= 0; i--) {
    if (array[i] >= 0.5) {
      result += mult;
    }
    mult *= 2;
  }

  return result;
}

/**
 * Decode a binary vector to a Phoneme.
 *
 * @param array Binary vector from NN output (6 elements, values 0–1)
 * @returns Resolved Phoneme, or NULL phoneme if unrecognised or all-NaN
 */
export function arrayToPhoneme(array: number[]): Phoneme {
  const id = arrayToId(array);
  return getById(id);
}

/**
 * Alias: decode(array) → phoneme.
 * Matches the naming convention used in the task description.
 */
export function decode(array: number[]): Phoneme {
  return arrayToPhoneme(array);
}

// ── Ground truth compatibility ────────────────────────────

/**
 * Convert an MSB-first array (from phonemeToArray) to LSB-first format
 * as stored in ground-truth/phoneme-model.json.
 */
export function phonemeArrayToGroundTruthEncoding(msbFirst: number[]): number[] {
  return [...msbFirst].reverse();
}

/**
 * Convert an LSB-first array from ground truth to MSB-first format
 * as produced by phonemeToArray.
 */
export function groundTruthEncodingToPhonemeArray(lsbFirst: number[]): number[] {
  return [...lsbFirst].reverse();
}
