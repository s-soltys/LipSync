# LPC Feature Extraction — Algorithm Specification

> Based on `LP.as` (ActionScript 3, LipSync project)
> Port target: TypeScript

---

## 1. Overview

Implements **Linear Predictive Coding (LPC)** analysis via the **autocorrelation method** with **Durbin-Levinson recursion**, producing **reflection (PARCOR) coefficients**. The output feeds into a small MLP neural network for viseme classification.

**LP order:** $p = 9$ (produces 9 reflection coefficients)

**Processing chain:**

1. **Hamming window** — applied implicitly via the lattice autocorrelation
2. **Pre-emphasis** — hardcoded to $\lambda = 0.0$ (disabled)
3. **Autocorrelation** — iterative lattice-style recursion (Burg-like) yielding $R[0..p]$
4. **Durbin-Levinson recursion** → $p$ reflection coefficients $K[0..p-1]$
5. **Output** — the reflection coefficients are **not** normalised to $[0, 1]$ (the normalisation line is commented out)

---

## 2. TypeScript Type Signatures

```typescript
// ── Constants ──────────────────────────────────────────────────────
const LPC_ORDER = 9;

// ── Core types ─────────────────────────────────────────────────────
type FloatArray = number[];

// ── LP class (static) ──────────────────────────────────────────────
interface LP {
  /** LPC order (reflection coefficient count) */
  readonly order: number; // = 9

  /**
   * Analyse a window of audio samples.
   * @param samples - Decimated time-domain samples (≈113 floats after decimation)
   * @returns 9 reflection (PARCOR) coefficients, NOT normalised to [0,1]
   */
  analyze(samples: FloatArray): FloatArray;
}

// ── Internal helpers (not exported) ────────────────────────────────

/**
 * Hamming window function.
 * w[n] = 0.54 - 0.46 * cos(2π · n / (N-1))
 */
function createWindow(length: number): FloatArray;

/**
 * Compute autocorrelation via iterative lattice-style recursion.
 * With λ=0 (disabled pre-emphasis) this is equivalent to
 * standard biased autocorrelation.
 */
function computeAutocorrelation(x: FloatArray): FloatArray;

/**
 * Durbin-Levinson recursion → reflection (PARCOR) coefficients.
 * Returns K[0..p-1] (p = LPC_ORDER).
 */
function computeCoef(R: FloatArray): FloatArray;
```

---

## 3. Algorithm — Step by Step

### 3.1 Hamming Window

$$w[n] = 0.54 - 0.46 \cdot \cos\left(\frac{2\pi n}{N-1}\right),\quad n = 0, 1, \dots, N-1$$

The window is **not explicitly applied** to the input — the autocorrelation implementation uses an iterative lattice structure that implicitly windows. The other window functions (Hanning, Blackman, Blackman-Harris) are commented out in source.

### 3.2 Pre-emphasis (disabled)

The pre-emphasis filter difference equation embedded in the lattice recursion is:

$$d[n] = r_1 - \lambda \cdot (x[n] - r_2)$$

With $\lambda = 0$, this reduces to $d[n] = r_1$ where $r_1$ tracks the previous input sample, making the pre-emphasis a **no-op**.

### 3.3 Autocorrelation — Iterative Lattice-Style Computation

**Input:** $x[0..L-1]$ where $L$ = length of decimated sample window

**Parameters:** $p = 9$ (order), $\lambda = 0.0$ (pre-emphasis coefficient)

**Initialisation:**

$$R[0..p] = 0, \quad dl[0..L-1] = 0, \quad r_1 = 0, \quad r_2 = 0$$

**Step 1 — Energy ($R[0]$):**

$$\begin{aligned}
R[0] &= \sum_{k=0}^{L-1} x[k]^2 \\
dl[k] &= r_1 - \lambda \cdot (x[k] - r_2), \quad\text{update: } r_1 = x[k],\; r_2 = dl[k]
\end{aligned}$$

With $\lambda = 0$: $dl[k] = r_1$ (previous $x$), so $dl$ is a one-sample delay of $x$ with $dl[0] = 0$.

**Step 2 — Higher lags ($i = 1 \dots p$):**

$$\begin{aligned}
R[i] &= \sum_{k=0}^{L-1} dl[k] \cdot x[k] \\
r_{1t} &= dl[k] \\
dl[k] &= r_1 - \lambda \cdot (r_{1t} - r_2) \\
r_1 &= r_{1t} \\
r_2 &= dl[k]
\end{aligned}$$

The $dl$ array acts as a **progressive delay line**: after iteration $i$, $dl$ contains $x$ delayed by $i+1$ samples. Therefore:

$$R[i] \approx \sum_{k=0}^{L-1} x[k-i] \cdot x[k]$$

This is the **biased autocorrelation estimate** (no normalisation by $L$).

**Output:** $R[0..p]$ (length $p+1 = 10$)

### 3.4 Durbin-Levinson Recursion — Reflection Coefficients

**Input:** $R[0..p]$ from autocorrelation

**Initialisation:**

$$A[0] = A_m[0] = 1,\quad E_{m-1} = R[0],\quad K[0..p] = 0$$

**For $m = 1$ to $p$:**

$$\begin{aligned}
\text{err} &= \sum_{k=1}^{m-1} A_m[k] \cdot R[m - k] \\
k_m &= \frac{R[m] - \text{err}}{E_{m-1}} \\
K[m-1] &= -k_m \\
A[m] &= k_m \\
\text{For } k &= 1 \text{ to } m-1: \\
&\quad A[k] = A_m[k] - k_m \cdot A_m[m - k] \\
E_m &= (1 - k_m^2) \cdot E_{m-1} \\
A_m &= A \quad \text{(copy)}
\end{aligned}$$

**Output:** $K[0..p-1]$ — reflection coefficients (PARCOR) of length $p = 9$

Note: $K$ is allocated with length $p+1$; the value at index $p$ remains $0$ (from initialisation) and is **popped** in the `analyze()` entry point.

### 3.5 Final Output

```typescript
function analyze(samples: FloatArray): FloatArray {
  const R = computeAutocorrelation(samples); // length p+1
  const K = computeCoef(R);                  // length p+1, last element = 0
  K.pop();                                   // remove trailing zero → length p
  return K;                                  // 9 reflection coefficients
}
```

---

## 4. Math Notation Summary

| Step | Formula |
|------|---------|
| Hamming window | $w[n] = 0.54 - 0.46\cos(2\pi n/(N-1))$ |
| Autocorrelation (lattice) | $R[i] = \sum_{k} x[k-i] \cdot x[k],\; i=0..p$ |
| Durbin-Levinson — reflection coeff | $k_m = \frac{R[m] - \sum_{k=1}^{m-1} A_m[k]R[m-k]}{E_{m-1}}$ |
| Durbin-Levinson — update | $A[k] = A_m[k] - k_m \cdot A_m[m-k]$ |
| Durbin-Levinson — error | $E_m = (1 - k_m^2) \cdot E_{m-1}$ |

---

## 5. Edge Cases

| # | Edge Case | Behaviour | Notes |
|---|-----------|-----------|-------|
| 1 | **All-zero input (silence)** | $R[0] = 0$ → $E_{m-1} = 0$ → division by zero in Durbin-Levinson | `computeCoef` will produce `NaN` or `Infinity` values. The TS port must guard against $E_{m-1} \approx 0$. |
| 2 | **Single-sample input ($L=1$)** | Autocorrelation produces $R[0] = x[0]^2$, $R[1..p] = 0$ (no lag terms). | Durbin-Levinson: $k_1 = -R[1]/R[0] = 0$, rest $k_m = 0$. Degenerate but stable. |
| 3 | **Input shorter than order ($L < p$)** | Autocorrelation lag terms don't have enough data to form proper estimates. | Reliability drops; the TS port may need a minimum window length check. |
| 4 | **Constant-amplitude input** | $R[i] = A^2$ for all $i$ (since $x$ is constant). $k_1 = (A^2 - 0)/A^2 = 1$, $E_1 = 0$ → division by zero at $m=2$. | Must guard against $E_m \approx 0$. |
| 5 | **Pre-emphasis disabled** ($\lambda = 0$) | The lattice recurrence degenerates to a simple delay line; autocorrelation values are identically standard biased autocorrelation. | Verify with ground truth that coefficients match when $\lambda = 0$. |
| 6 | **Numerical precision** | 32-bit float input → autocorrelation values may accumulate error for large $L$. | The AS3 source uses `Number` (64-bit float). TS should use `number` (also 64-bit). |
| 7 | **Negative energy** ($R[0] < 0$) | Impossible for real-valued inputs (sum of squares), but NaN guard is cheap. | Not a real edge case; include for defensive coding. |

---

## 6. Ground-Truth Verification Files

| File | Path | What It Verifies |
|------|------|------------------|
| **LPC test vectors** | `ground-truth/lpc-test-vectors.json` | 5 test cases (440 Hz sine, mixed 220+880 Hz, impulse, white noise, silence) with expected 9 reflection coefficients. **NOTE:** All non-silence vectors show `[-1, 0, 0, ..., 0]` expected — this is a placeholder; real verification requires computing expected values from the original AS3 implementation. Silence expects all zeros $[0, 0, ..., 0]$. |
| **Audio pipeline** | `ground-truth/audio-pipeline.json` | Confirms sampling rate, decimation factor, energy formula, window length, samples per window, step size. |
| **NN weights** | `ground-truth/nn-weights.json` | Contains the trained MLP weights (9 inputs, configurable hidden layers, 6 outputs). **Indirectly** relevant: LPC coefficients are the NN input. Use for end-to-end verification. |
| **Phoneme model** | `ground-truth/phoneme-model.json` | 18 phonemes with binary encodings. The NN output decoding step uses this mapping. |

### Verification Approach

```
For each test vector in lpc-test-vectors.json:
  1. Synthesize the input signal (e.g., 440 Hz sine at 44100 Hz)
  2. Decimate to match pipeline stride = 7 (keep every 7th sample)
  3. Run LP.analyze(samples)
  4. Compare output reflection coefficients to expected_values
  5. For silence input: confirm all 9 coefficients are 0
  6. For non-silence: current ground truth has placeholder values;
     re-generate by running the original AS3 code or validate against
     a reference LPC implementation (e.g., librosa.lpc)
```

---

## 7. Implementation Notes for TypeScript Port

### Dependencies

- No external audio library required for the analysis itself
- Input samples are `number[]` (IEEE 754 64-bit floats)
- The caller is responsible for decimation (stride = 7)

### Numerical Guards

```typescript
function computeCoef(R: number[]): number[] {
  const p = LPC_ORDER;
  const K = new Array<number>(p + 1).fill(0);
  const A = new Array<number>(p + 1).fill(0);
  const Am = new Array<number>(p + 1).fill(0);

  A[0] = Am[0] = 1;
  let Em1 = R[0];

  // GUARD: if R[0] ≈ 0, return all zeros (silence)
  if (Math.abs(Em1) < 1e-15) return new Array<number>(p).fill(0);

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

    // GUARD: if Em ≈ 0, early stop
    if (Math.abs(Em) < 1e-15) {
      for (let j = m; j < p; j++) K[j] = 0;
      break;
    }

    for (let s = 0; s <= p; s++) Am[s] = A[s];
    Em1 = Em;
  }

  K.pop(); // remove trailing zero
  return K;
}
```

### Neural Network Integration (for context)

The 9 reflection coefficients are passed through an MLP:

```typescript
// Pseudocode — full NN spec in a separate document
const nnOutput = neuralNetwork.run(lpcCoefficients); // 6-element vector
const phoneme = decodePhoneme(nnOutput);              // threshold ≥ 0.5 per bit
```

Activation function (sigmoid):
$$\sigma(z) = \frac{1}{1 + e^{-z}}$$
