# Neural Network Forward Pass Fidelity Audit

**Date:** 2026-06-17  
**Scope:** `nn.ts` (TypeScript) ↔ `NeuralNetwork.as` + `Neuron.as` (ActionScript 3)  
**Ground Truth:** `ground-truth/nn-weights.json` (3 layers, 10 test vectors)  
**Tests:** `src/__tests__/nn.test.ts` — **21/21 passed** ✅

---

## Summary

| Check | Status | Details |
|---|---|---|
| **Sigmoid activation** | ✅ IDENTICAL | σ(z) = 1 / (1 + e^(−z)) — same formula, same precision |
| **Weighted sum** | ✅ IDENTICAL | Σ(wᵢ · xᵢ) + bias, over `neuron.size` elements |
| **Forward pass logic** | ✅ IDENTICAL | Sequential layer evaluation, output feeds next layer's input |
| **Structural bug (H1 size=9)** | ✅ PRESERVED + DOCUMENTED | H1 neurons have 9 weights instead of 50 — documented at top of nn.ts lines 6–13 |
| **NaN handling in parsing** | ✅ CORRECT | `NaN` literals → `null` → `NaN`, dead neurons produce NaN but never consumed |
| **Ground truth test vector match** | ✅ PASSES (1e-9) | All 10 vectors match within 1e-9 tolerance |
| **Dead neuron handling** | ✅ PRESERVED | H0 neurons 9–49 have NaN weights/bias; H1 reads only first 9 so NaN never propagates |

---

## Detailed Analysis

### 1. Sigmoid Activation

**AS3 (`Neuron.as:64`):**
```
value = 1 / (1 + Math.exp( -1 * (sum + this.bias)));
```

**TS (`nn.ts:73`, used at `nn.ts:101-102`):**
```ts
function sigmoid(z: number): number {
    return 1 / (1 + Math.exp(-z));
}
const z = sum + neuron.bias;
neuron.value = sigmoid(z);
```

**Verdict:** Identical. Both compute `σ(z) = 1 / (1 + e^(−z))` where `z = Σ(wᵢ·xᵢ) + b`. The TS version factors the formula into a named function (benign refactor).

---

### 2. Weighted Sum / Neuron Forward Pass

**AS3 (`Neuron.calculateValue` lines 56–65):**
```as3
var sum:Number = 0;
for (var i:int = 0; i < size; i++) {
    inputs[i] = inputsArray[i];
    sum += weights[i] * inputs[i];
}
value = 1 / (1 + Math.exp( -1 * (sum + this.bias)));
```

**TS (`neuronCalculateValue` lines 90–104):**
```ts
let sum = 0;
for (let i = 0; i < neuron.size; i++) {
    neuron.inputs[i] = inputsArray[i];  // cache for backprop
    sum += neuron.weights[i] * neuron.inputs[i];
}
const z = sum + neuron.bias;
neuron.value = sigmoid(z);
```

**Verdict:** Identical semantics:
- Iterates exactly `neuron.size` times
- Caches `inputs[i] = inputsArray[i]` (preserves for backprop)
- Accumulates `sum += weights[i] * inputs[i]`
- Computes `σ(sum + bias)`
- Stores result on `neuron.value`

---

### 3. Forward Pass (Layer Sequencing)

**AS3 (`NeuralNetwork.run` lines 41–59):**
```as3
var inputs:Vector.<Number> = inputArray;
for (l = 0; l < layers.length; l++) {
    var output:Vector.<Number> = layerOutputs[l + 1];
    for each (var neuron:Neuron in layers[l]) {
        output.push(neuron.calculateValue(inputs));
    }
    inputs = output;
}
return layerOutputs[layerOutputs.length - 1];
```

**TS (`forwardPass` lines 121–139):**
```ts
let currentInput = input;
for (let l = 0; l < net.layers.length; l++) {
    const layer = net.layers[l];
    const outputs = new Array<number>(layer.length);
    for (let n = 0; n < layer.length; n++) {
        outputs[n] = neuronCalculateValue(layer[n], currentInput);
    }
    currentInput = outputs;
}
return currentInput;
```

**Verdict:** Identical logic:
- Iterates layers sequentially (H0 → H1 → O)
- Each layer computes outputs by evaluating every neuron against `currentInput`
- Layer output becomes `currentInput` for next layer
- Returns final layer output

**Minor difference:** AS3 pre-allocates all layer output arrays upfront; TS allocates one array per layer on-demand. Semantically equivalent.

---

### 4. Structural Bug: H1 Layer Size=9 (Should Be 50)

**AS3 (`NeuralNetwork.createNetwork` lines 19–27):**
```as3
this.layers[0] = createLayer(neuronsPerLayer, inputs, ...);            // H0: 50 neurons, 9 inputs each
for (var i:int = 1; i < hiddenLayers; i++) {                           // runs once (i=1)
    this.layers[i] = createLayer(neuronsPerLayer, inputs, ...);        // H1: 50 neurons, 9 inputs each ← BUG
}
this.layers[hiddenLayers] = createLayer(outputs, neuronsPerLayer, ...); // O:   6 neurons, 50 inputs each
```

**Bug confirmed in AS3:** The `for` loop at line 23–24 uses `inputs` (LP.order = 9) instead of `neuronsPerLayer` for H1. The intended code should be:
```
layers[i] = createLayer(neuronsPerLayer, neuronsPerLayer, ...);
```

**TS preserves the bug faithfully** because it reads the serialized JSON, which was saved by the AS3 code and contains weights reflecting the bugged architecture.

From `nn-weights.json`:
- **Layer 0 (H0):** 50 neurons, each with **9 weights** (first 9 valid, remaining 41 are NaN/dead)
- **Layer 1 (H1):** 50 neurons, each with **9 weights** (all 50 valid)
- **Layer 2 (O):** 6 neurons, each with **50 weights** (all 6 valid)

**Runtime consequence:** When input (9 values) passes through H0, all 50 H0 outputs are computed, but neurons 9–49 produce `NaN`. H1 only reads `neuron.size = 9` values from H0's 50 outputs (indices 0–8), so the `NaN`s are never consumed. The network works correctly by accident, but ~80% of H0's compute is wasted.

**The TS source at lines 6–13 explicitly documents this bug** — excellent provenance tracking.

---

### 5. NaN Handling in Weight/Bias Parsing

**Ground truth file:** Contains `NaN` literals (invalid JSON) for dead neurons in layer 0.

**Parsing pipeline (TS `nn.ts` lines 152–195):**

| Step | Code | Effect |
|---|---|---|
| 1. `parseNetworkJson` | `jsonString.replace(/\bNaN\b/g, 'null')` | Converts invalid `NaN` to valid `null` |
| 2. `JSON.parse(sanitized)` | Standard JSON parse | Accepts `null` values |
| 3. `createNetworkFromJson` | `neuronData.bias ?? NaN` | `null` → JavaScript `NaN` |
| 4. `createNetworkFromJson` | `neuronData.weights.map(w => w ?? NaN)` | `null` per weight → JavaScript `NaN` |

**Verdict:** Correct. The round-trip `NaN` → `null` → `NaN` preserves AS3 semantics where dead neurons have `NaN` weights/bias. When `neuronCalculateValue` computes `sum += NaN * NaN = NaN`, the result is `sigmoid(NaN) = NaN` — but since H1 never reads H0 outputs beyond index 8, these `NaN`s are never used downstream.

---

### 6. Ground Truth Test Vector Matching

**Test data:** 10 test vectors in `ground-truth/nn-weights.json` (lines 1748–1959).

| Vector | Input (9 values) | Expected output (6 values) |
|---|---|---|
| 1 | `[0.10, 0.15, … , 0.50]` | `[0.0652, 0.9781, 0.0232, 0.9901, 0.0048, 0.0847]` |
| 2 | `[0.20, 0.25, … , 0.60]` | `[0.0316, 0.9874, 0.0072, 0.9961, 0.0020, 0.0369]` |
| 3 | `[0.30, 0.35, … , 0.70]` | `[0.0165, 0.9923, 0.0029, 0.9982, 0.0010, 0.0217]` |
| 4 | `[0.40, 0.45, … , 0.80]` | `[0.0095, 0.9950, 0.0014, 0.9991, 0.0006, 0.0157]` |
| 5 | `[0.50, 0.55, … , 0.90]` | `[0.0059, 0.9966, 0.0007, 0.9995, 0.0003, 0.0130]` |
| 6 | `[0.60, 0.65, … , 1.00]` | `[0.0039, 0.9977, 0.0004, 0.9997, 0.0002, 0.0122]` |
| 7 | `[0.70, 0.75, … , 1.10]` | `[0.0026, 0.9984, 0.0003, 0.9998, 0.0001, 0.0130]` |
| 8 | `[0.80, 0.85, … , 1.20]` | `[0.0018, 0.9990, 0.0002, 0.9999, 0.0000, 0.0160]` |
| 9 | `[0.90, 0.95, … , 1.30]` | `[0.0012, 0.9994, 0.0001, 0.9999, 0.0000, 0.0220]` |
| 10 | `[1.00, 1.05, … , 1.40]` | `[0.0008, 0.9996, 0.0001, 1.0000, 0.0000, 0.0308]` |

**Test harness** (`nn.test.ts` line 217): `expect(result[i]).toBeCloseTo(tv.expected_output[i], 9)` — tolerance of 1e-9.

**All 10 test vectors pass.** The test file also includes a bulk check (line 222) using absolute error ≤ 1e-9 which also passes.

---

### 7. Test Coverage Summary

**`src/__tests__/nn.test.ts` — 21 tests:**

| Describe block | Tests | What it verifies |
|---|---|---|
| `sigmoid` | 3 | σ(0)=0.5, σ(-100)→0, σ(100)→1 |
| `neuronCalculateValue` | 2 | Weighted sum + bias, size clamping |
| `createNetworkFromJson` | 1 | Layer dimensions (50, 50, 6), size per layer (9, 9, 50), NaN dead neurons |
| `forwardPass — structural bug quirk` | 2 | Layer 1 reads only first 9 outputs; dead neurons produce NaN but don't affect output |
| `forwardPass — ground truth test vectors` | 12 | 10 individual vector matches + 1 bulk check + 1 count check |
| `exports` | 1 | Type accessibility |

---

## Final Verdict

The TypeScript `nn.ts` is a **faithful, bug-compatible port** of the AS3 `NeuralNetwork.as` + `Neuron.as`. Every behavior—sigmoid, weighted sum, forward pass sequencing, the H1 structural bug, NaN dead neuron handling, and all 10 ground-truth test vectors—is preserved with 1e-9 precision.

**21/21 tests pass.** ✅
