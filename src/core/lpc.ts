// ────────────────────────────────────────────────────────────
// LPC Module — TypeScript port of ActionScript LP.as
//
// Implements Linear Predictive Coding (LPC) analysis via the
// autocorrelation method with Durbin-Levinson recursion,
// producing reflection (PARCOR) coefficients.
// ────────────────────────────────────────────────────────────

// ── Constants ───────────────────────────────────────────────

export const LPC_ORDER = 9;

// ── Hamming window ─────────────────────────────────────────

/**
 * Hamming window function.
 * w[n] = 0.54 - 0.46 * cos(2π · n / (N-1))
 *
 * NOTE: The autocorrelation lattice structure implicitly applies
 * windowing; this function is provided for completeness and
 * matches the AS3 createWindow().
 */
export function createWindow(length: number): number[] {
  const w: number[] = new Array(length);
  for (let n = 0; n < length; n++) {
    const arg = (2 * Math.PI * n) / (length - 1);
    w[n] = 0.54 - 0.46 * Math.cos(arg);
  }
  return w;
}

// ── Autocorrelation (Burg-like iterative lattice) ──────────

/**
 * Compute autocorrelation via iterative lattice-style recursion.
 *
 * With λ=0 (disabled pre-emphasis) the lattice degenerates to a
 * simple delay line, equivalent to standard biased autocorrelation.
 *
 * The `dl` array acts as a progressive delay line: after iteration i,
 * dl contains x delayed by i+1 samples.
 *
 * @param x - Input time-domain samples
 * @returns R[0..p] biased autocorrelation (length p+1, where p = LPC_ORDER)
 */
export function computeAutocorrelation(x: number[]): number[] {
  const L = x.length;
  const P = LPC_ORDER;
  const lambda = 0.0;

  // Initialise delay line and temp store
  const dl: number[] = new Array(L).fill(0);
  const Rt: number[] = new Array(L).fill(0);

  let r1 = 0;
  let r2 = 0;
  let r1t = 0;

  // Step 1 — Energy R[0] and initialise dl as 1-sample delay
  Rt[0] = 0;
  for (let k = 0; k < L; k++) {
    Rt[0] += x[k] * x[k];
    dl[k] = r1 - lambda * (x[k] - r2);
    r1 = x[k];
    r2 = dl[k];
  }

  // Step 2 — Higher lags i = 1 .. P
  for (let i = 1; i <= P; i++) {
    Rt[i] = 0;
    r1 = 0;
    r2 = 0;
    for (let k = 0; k < L; k++) {
      Rt[i] += dl[k] * x[k];
      r1t = dl[k];
      dl[k] = r1 - lambda * (r1t - r2);
      r1 = r1t;
      r2 = dl[k];
    }
  }

  // Copy results into output R[0..P]
  const R: number[] = new Array(P + 1);
  for (let i = 0; i <= P; i++) {
    R[i] = Rt[i];
  }

  return R;
}

// ── Durbin-Levinson recursion → reflection coefficients ────

/**
 * Durbin-Levinson recursion to compute reflection (PARCOR) coefficients.
 *
 * Input:  R[0..p] biased autocorrelation (length p+1)
 * Output: K[0..p-1] reflection coefficients (length p)
 *
 * Guards:
 *  - If R[0] ≈ 0 (silence / zero energy), returns all zeros.
 *  - If intermediate error E_m ≈ 0 (e.g. constant input), early-stops
 *    and pads remaining coefficients with zero.
 */
export function computeCoef(R: number[]): number[] {
  const p = LPC_ORDER;
  const K: number[] = new Array(p + 1).fill(0);
  const A: number[] = new Array(p + 1).fill(0);
  const Am: number[] = new Array(p + 1).fill(0);

  A[0] = 1;
  Am[0] = 1;

  // ── Guard: zero energy → silence ──────────────────────────
  if (Math.abs(R[0]) < 1e-15) {
    return new Array(p).fill(0);
  }

  let Em1 = R[0];

  for (let m = 1; m <= p; m++) {
    let err = 0;
    for (let k = 1; k <= m - 1; k++) {
      err += Am[k] * R[m - k];
    }

    const km = (R[m] - err) / Em1;
    K[m - 1] = -km;
    A[m] = km;

    for (let k = 1; k <= m - 1; k++) {
      A[k] = Am[k] - km * Am[m - k];
    }

    const Em = (1 - km * km) * Em1;

    // ── Guard: vanishing error → early stop ─────────────────
    if (Math.abs(Em) < 1e-15) {
      for (let j = m; j < p; j++) {
        K[j] = 0;
      }
      break;
    }

    // Copy A → Am for next iteration
    for (let s = 0; s <= p; s++) {
      Am[s] = A[s];
    }

    Em1 = Em;
  }

  // Remove trailing zero at index p
  K.pop();

  return K;
}

// ── Public API ─────────────────────────────────────────────

/**
 * Analyse a window of audio samples, producing reflection (PARCOR) coefficients.
 *
 * @param samples - Decimated time-domain samples (typically ~114 floats)
 * @returns 9 reflection coefficients (NOT normalised to [0,1])
 */
export function analyze(samples: number[]): number[] {
  const R = computeAutocorrelation(samples);
  const K = computeCoef(R);
  return K;
}
