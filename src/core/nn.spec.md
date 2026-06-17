# Neural Network — TypeScript Algorithm Spec

> **Source files:** `NeuralNetwork.as`, `Neuron.as`, `TrainingPattern.as`, `TrainingPatternGenerator.as`, `SampleProvider.as`, `ProviderEvent.as`, `LipsyncTrainer.as`  
> **Config:** `LipsyncSettings.as`, `LP.as`  
> **Ground truth:** `~/LipSync-ts/ground-truth/nn-weights.json` (3-layer MLP weights + 10 test vectors)  
> **Verification:** Every forward pass on the 10 test vectors must produce `expected_output` values within ±1e-8.

---

## 1. Architecture Overview

```
Input: 9 LPC reflection coefficients
  → Hidden Layer 0 (H0): N neurons, each with 9 weights (+ bias)
  → Hidden Layer 1 (H1): N neurons, each with 9 weights (+ bias)  ← BUG: uses 9 not N
  → Output Layer (O): 6 neurons, each with N weights (+ bias)
  → 6 sigmoid values (binary-encoded viseme)
```

### 1.1 Key Constants (from `LipsyncSettings.as`)

| Constant | Value | Description |
|---|---|---|
| `LPC_ORDER` | 9 | Input dimension (LP.order) |
| `OUTPUT_COUNT` | 6 | Output dimension (LipsyncSettings.outputCount) |
| `HIDDEN_LAYERS` | 2 | Fixed at 2 |
| `MOMENTUM` | 0.5 | Global momentum factor |
| `NEURONAL_BIAS` | 1.0 | Bias initialization value |
| `INITIAL_WEIGHT_RANGE` | 1.0 | Weights initialized in Uniform[-1, 1] |
| `SAMPLING_DECIMATE` | 6 | Downsample factor |
| `WINDOW_LENGTH` | 18ms | Analysis window |
| `SAMPLING_RATE` | 44100 Hz | Input audio rate |
| `SAMPLING_RATE_MS` | 44.1 | Samples/ms |
| `ACTIVATION_ENERGY` | 0.025 | VAD threshold |

### 1.2 TypeScript Type Signatures

```typescript
/** Single neuron state (mirrors Neuron.as) */
interface NeuronState {
  value: number;       // Cached output after last forward pass
  bias: number;        // Bias weight (initialized to +1.0)
  momentum: number;    // Bias momentum accumulator (initialized 0)
  size: number;        // Number of input connections
  inputs: number[];    // Input buffer from last forward pass (size = size)
  weights: number[];   // Synaptic weights, initialized Uniform[-1, 1]
  momentums: number[]; // Per-weight momentum accumulators (initialized 0)
}

/** Full network state (mirrors NeuralNetwork.as) */
interface NeuralNetworkState {
  momentum: number;            // Global momentum μ = 0.5
  neuronalBias: number;        // Bias init value = 1.0
  initialWeightRange: number;  // Range = 1.0
  realLearningRate: number;    // Adaptive LR, set after first train() call
  hiddenLayers: number;        // Fixed at 2
  layers: NeuronState[][];     // Array of layers (length = 3)
}

/** Training pattern (mirrors TrainingPattern.as) */
interface TrainingPattern {
  input: number[];   // 9 LPC reflection coefficients
  output: number[];  // 6 binary-encoded target values
}

/** Serialized network header + weights */
interface SerializedNetwork {
  config: {
    lpOrder: number;
    outputCount: number;
    samplingDecimate: number;
    windowLength: number;
    momentum: number;
    learningRate: number;
  };
  layers: LayerData[];
}
interface LayerData {
  neurons: { bias: number; weights: number[] }[];
}
```

### 1.3 Layer Construction (`Neuron.createNeuron`)

```typescript
function createNeuron(inputsCount: number, bias: number, weightRange: number = 1): NeuronState {
  const n: NeuronState = {
    value: 0,          // Not set until first forward pass
    bias,
    momentum: 0,
    size: inputsCount,
    inputs: new Array(inputsCount).fill(NaN),   // NaN ≡ unset
    weights: new Array(inputsCount).map(() => Math.random() * 2 * weightRange - weightRange), // Uniform[-1, 1]
    momentums: new Array(inputsCount).fill(0),
  };
  return n;
}
```

### 1.4 Network Construction (`NeuralNetwork.createNetwork`)

```typescript
function createNetwork(
  inputs: number,          // 9 (LP.order)
  outputs: number,         // 6 (LipsyncSettings.outputCount)
  neuronsPerLayer: number, // User-configurable (e.g., 50)
  bias: number = 1.0,
  weightRange: number = 1.0
): NeuronState[][] {
  const layers: NeuronState[][] = [];

  // Layer H0: neuronsPerLayer neurons, each with `inputs` (9) connections
  layers[0] = Array.from({ length: neuronsPerLayer },
    () => createNeuron(inputs, bias, weightRange));

  // Layer H1: neuronsPerLayer neurons, each with `inputs` (9) connections ← THE BUG
  // Intended: each H1 neuron should have `neuronsPerLayer` connections (from H0 outputs)
  // Actual:   each H1 neuron has `inputs` (9) connections — only reads first 9 of H0's N outputs
  layers[1] = Array.from({ length: neuronsPerLayer },
    () => createNeuron(inputs, bias, weightRange));

  // Layer O: outputs neurons, each with `neuronsPerLayer` connections (from H1)
  layers[2] = Array.from({ length: outputs },
    () => createNeuron(neuronsPerLayer, bias, weightRange));

  return layers;
}
```

> ⚠️ **STRUCTURAL BUG:** Both hidden layers H0 and H1 are created with `inputs = LP.order = 9` instead of H1 receiving `neuronsPerLayer` as its input dimension. At runtime, `run()` feeds each layer sequentially, so H1 receives `neuronsPerLayer` values from H0 but only reads the first 9. H0 neurons beyond index 8 are functionally dead in the forward pass (their outputs are computed but never consumed). The output layer O correctly has `neuronsPerLayer` connections per neuron.

---

## 2. Forward Propagation (`NeuralNetwork.run` + `Neuron.calculateValue`)

### 2.1 Algorithm

```typescript
/**
 * Feed-forward: computes network output for a given input.
 * @param input 9-element LPC reflection coefficient vector
 * @returns 6-element sigmoid output vector
 */
function forwardPass(net: NeuralNetworkState, input: number[]): number[] {
  let currentInput = input;

  for (let l = 0; l < net.layers.length; l++) {
    const layer = net.layers[l];
    const outputs = new Array<number>(layer.length);

    for (let n = 0; n < layer.length; n++) {
      outputs[n] = neuronCalculateValue(layer[n], currentInput);
    }

    currentInput = outputs;
  }

  return currentInput; // Final layer output
}
```

### 2.2 Neuron Activation Function

```typescript
/**
 * Logistic sigmoid activation: σ(z) = 1 / (1 + e^(-z))
 * Computes: value = σ(Σ(w_i * x_i) + bias)
 * Side effect: stores `inputs` buffer and `value` on the neuron for backprop.
 */
function neuronCalculateValue(neuron: NeuronState, inputsArray: number[]): number {
  let sum = 0;

  for (let i = 0; i < neuron.size; i++) {
    neuron.inputs[i] = inputsArray[i];  // Cache for backprop
    sum += neuron.weights[i] * neuron.inputs[i];
  }

  const z = sum + neuron.bias;
  neuron.value = 1 / (1 + Math.exp(-z));  // Sigmoid
  return neuron.value;
}
```

### 2.3 Exact Formula

```
For neuron j in layer l:

  z_j^(l) = Σ_i (w_ji^(l) * x_i^(l)) + b_j^(l)

  a_j^(l) = σ(z_j^(l)) = 1 / (1 + e^(-z_j^(l)))

  σ'(z) = σ(z) * (1 - σ(z)) = a * (1 - a)

Where:
  x_i^(l) = output of neuron i in previous layer (or network input for l=0)
  w_ji^(l) = weight from neuron i in layer (l-1) to neuron j in layer (l)
  b_j^(l) = bias of neuron j in layer (l)
  a_j^(l) = activation (output) of neuron j in layer (l)
```

### 2.4 Dimension Flow

| Step | Operation | Input dim | Output dim | Notes |
|---|---|---|---|---|
| Input | raw samples | — | 9 | LPC reflection coefficients |
| H0 | σ(W₀·input + b₀) | 9 → N | N | N = neuronsPerLayer |
| H1 ⚠️ | σ(W₁·h0[0..8] + b₁) | 9 → N | N | Only 1st 9 of H0 used; rest of H0 ignored |
| O | σ(W₂·h1 + b₂) | N → 6 | 6 | N = neuronsPerLayer from H1 |

---

## 3. Backpropagation (`NeuralNetwork.adjust` + `Neuron.adjustWeights`)

### 3.1 Mean Squared Error

```
For output neuron j and target t_j:

  δ_j^(out) = (t_j - a_j) * σ'(z_j) = (t_j - a_j) * a_j * (1 - a_j)

  MSE_sum = Σ_j (t_j - a_j)²

  LayerMSE = MSE_sum / outputLayerSize
```

### 3.2 Backward Pass Algorithm

```typescript
/**
 * Backpropagate error and update weights.
 * @param outputArray 6-element target vector
 * @param learningRate Current adaptive learning rate
 * @returns MSE per output neuron = Σ(t - a)² / outputLayerSize
 */
function backwardPass(
  net: NeuralNetworkState,
  outputArray: number[],
  learningRate: number
): number {
  const layerCount = net.layers.length - 1;  // = 2 (index of output layer)
  const error: number[][] = [];              // error[l][i] for layer l, neuron i

  let mseSum = 0;

  // Iterate layers in REVERSE: out (2) → H1 (1) → H0 (0)
  for (let l = layerCount; l >= 0; l--) {
    const layer = net.layers[l];
    error[l] = new Array(layer[0].size).fill(0);  // error buffer for this layer

    for (let n = 0; n < layer.length; n++) {
      const neuron = layer[n];

      // Compute node error nError
      let nError: number;
      if (l === layerCount) {
        // Output layer: nError = target - actual
        nError = outputArray[n] - neuron.value;
        mseSum += nError * nError;
      } else {
        // Hidden layer: nError from the NEXT layer's error buffer at position n
        nError = error[l + 1][n];
      }

      // Update weights of this neuron
      adjustWeights(neuron, nError, learningRate, net.momentum, error[l]);
    }
  }

  return mseSum / net.layers[layerCount].length;
}
```

### 3.3 Weight Update (`Neuron.adjustWeights`)

```typescript
/**
 * Update weights for a single neuron using delta rule with momentum.
 * 
 * @param nError Node error δ (for output: t-a; for hidden: backpropagated error)
 * @param learningRate Current learning rate η
 * @param globalMomentum Momentum coefficient μ
 * @param error Error buffer for THIS layer (accumulates backpropagated error for prev layer)
 */
function adjustWeights(
  neuron: NeuronState,
  nError: number,
  learningRate: number,
  globalMomentum: number,
  error: number[]
): void {
  // Local gradient: δ = nError * σ'(z) = nError * a * (1 - a)
  const delta = nError * neuron.value * (1 - neuron.value);

  for (let i = 0; i < neuron.size; i++) {
    // Weight change = δ * x_i * η + m_i^(t-1) * μ
    const weightChange = delta * neuron.inputs[i] * learningRate
                       + neuron.momentums[i] * globalMomentum;

    // Store momentum for next iteration
    neuron.momentums[i] = weightChange;

    // Apply weight update
    neuron.weights[i] += weightChange;

    // Accumulate backpropagated error for the previous layer:
    // error_prev[i] += δ * w_i
    error[i] += delta * neuron.weights[i];
  }

  // Bias update (same delta rule, input = +1 implicitly)
  const biasChange = delta * learningRate + neuron.momentum * globalMomentum;
  neuron.momentum = biasChange;
  neuron.bias += biasChange;
}
```

### 3.4 Exact Update Formulas

```
For each neuron j in layer l:

  δ_j^(l) = nError_j * a_j * (1 - a_j)

  Where nError_j:
    - Output layer (l = L-1): nError_j = t_j - a_j
    - Hidden layer (l < L-1):  nError_j = error[l+1][j]
                                 (error accumulated by next layer's neurons)

Weight update:
  Δw_ji^(l)(t) = δ_j * x_i * η + μ * Δw_ji^(l)(t-1)
  w_ji^(l)(t+1) = w_ji^(l)(t) + Δw_ji^(l)(t)

Bias update:
  Δb_j^(l)(t) = δ_j * η + μ * Δb_j^(l)(t-1)
  b_j^(l)(t+1) = b_j^(l)(t) + Δb_j^(l)(t)

Error backpropagation (accumulated in error[l][i]):
  error[l][i] += δ_j * w_ji^(l)

  This error[l][i] becomes nError for neuron i in layer (l-1).
```

> ⚠️ **IMPLEMENTATION NOTE:** The `error[l]` buffer is indexed by `neuron.size` (the input dimension of neurons in layer `l`). For H0 and H1, `neuron.size = 9`; for O, `neuron.size = neuronsPerLayer`. However, `error[l][n]` is read as `nError` for neuron `n` in the previous layer. Since H1 has 50 neurons and H0 has 50 neurons, `error[1][n]` for n=0..49 carries the backpropagated error from O → H1. Then `error[0]` has size 9 (created from `layer[0].size = 9`), so backprop error is only propagated to the first 9 neurons of H0 — matching the forward-pass bug.

---

## 4. Training Loop (`NeuralNetwork.train`)

### 4.1 Algorithm

```typescript
/**
 * Train the network using stochastic gradient descent with momentum.
 *
 * @param patterns Training set
 * @param epochs Max epochs
 * @param learningRate Initial user-set learning rate η₀
 * @param targetMSE Stopping criterion (default 0.02)
 * @returns Final MSE
 */
function train(
  net: NeuralNetworkState,
  patterns: TrainingPattern[],
  epochs: number,
  learningRate: number,
  targetMSE: number = 0.02
): number {
  // Set adaptive LR on first call
  if (net.realLearningRate === undefined || isNaN(net.realLearningRate)) {
    net.realLearningRate = learningRate;
  }

  let mse = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    patterns = shufflePatterns(patterns);  // Fisher-Yates shuffle each epoch
    mse = 0;

    for (const pattern of patterns) {
      forwardPass(net, pattern.input);  // Forward (stores neuron.values)
      mse += backwardPass(net, pattern.output, net.realLearningRate);
    }

    // Average MSE over all patterns
    mse = mse / patterns.length;

    // Adaptive learning rate: η_epoch = η₀ × MSE
    net.realLearningRate = learningRate * mse;

    // Early stopping
    if (mse <= targetMSE) {
      break;
    }
  }

  return mse;
}
```

### 4.2 Shuffle (`Fisher-Yates`)

```typescript
function shufflePatterns(patterns: TrainingPattern[]): TrainingPattern[] {
  for (let i = 0; i < patterns.length; i++) {
    const j = Math.floor(Math.random() * patterns.length);
    [patterns[i], patterns[j]] = [patterns[j], patterns[i]];
  }
  return patterns;
}
```

### 4.3 Adaptive Learning Rate

```
η_epoch = η₀ × MSE_epoch
```

The learning rate is scaled by the current epoch's MSE. As MSE decreases, the learning rate shrinks, providing automatic annealing.

---

## 5. Training Data Generation

### 5.1 `SampleProvider` — Audio Feature Extraction

#### 5.1.1 `extractSound(position)`

```typescript
/**
 * Extract a 32-bit float audio window from the loaded MP3.
 *
 * @param position Start position in milliseconds
 * @returns Decimated audio samples
 */
function extractSound(soundBuffer: Float32Array, position: number): number[] {
  // Read LipsyncSettings.windowLength * LipsyncSettings.samplingRateMS samples
  // = 18ms × 44.1 samples/ms = 794 samples
  const windowSamples = windowLength * samplingRateMS;  // 794

  // Decimate: keep every (samplingDecimate + 1)-th sample
  // samplingDecimate = 6 → keep every 7th sample
  const decimationStep = samplingDecimate + 1;  // 7

  const result: number[] = [];
  let bufferIndex = position * samplingRateMS;  // Convert ms to sample index

  for (let i = 0; i < windowSamples; i += decimationStep) {
    // Read as float32
    const sample = soundBuffer[bufferIndex + i];
    result.push(sample);
  }

  // Result length: ceil(794 / 7) ≈ 113 samples
  return result;
}
```

#### 5.1.2 `getPhonemes(position)` → LPC Features

```typescript
/**
 * Extract audio at position → compute LPC reflection coefficients.
 *
 * @param position Start position in milliseconds
 * @returns 9-value LPC reflection coefficient vector
 */
function getPhonemes(soundBuffer: Float32Array, position: number): number[] {
  const samples = extractSound(soundBuffer, position);
  const lpcParams = LP_analyze(samples);  // See lpc.spec.md
  // LP.analyze: computeAutocorrelation → computeCoef (Durbin-Levinson) → pop last → return 9
  return lpcParams;
}
```

#### 5.1.3 `readTrainingSequence` — Orchestration

```typescript
/**
 * For each sample position in phonemeList, extract LPC features
 * and pair with the target phoneme. Dispatches event with array of
 * { input: number[], phoneme: Phoneme } pairs.
 */
function readTrainingSequence(
  soundBuffer: Float32Array,
  phoneme: Phoneme,
  phonemeList: number[]  // Sample positions in ms
): { input: number[]; phoneme: Phoneme }[] {
  return phonemeList.map(pos => ({
    input: getPhonemes(soundBuffer, pos),
    phoneme,
  }));
}
```

### 5.2 `TrainingPatternGenerator` — Pattern Assembly

#### 5.2.1 Timestamp Jitter (`generateArray`)

```typescript
/**
 * Generate jittered timestamps within [start, stop) ms.
 * Steps are uniformly spaced with ±10% random jitter.
 *
 * @param start Start ms
 * @param stop  End ms
 * @param steps Number of samples (default 30, user sets 40 in LipsyncTrainer)
 * @returns Array of sample positions in ms
 */
function generateArray(start: number, stop: number, steps: number): number[] {
  const dist = (stop - start) / steps;
  const positions: number[] = [];

  const SAMPLE_OFFSET_FACTOR = 0.2;  // 20% jitter factor (multiplied by dist)

  for (let t = start; t < stop; ) {
    positions.push(t);
    t += dist + SAMPLE_OFFSET_FACTOR * dist * (0.5 - Math.random());
    // t += dist * (1 + 0.2 * random(-0.5, 0.5))
    // = dist * (0.9 + 0.2 * Math.random())
    // ≈ dist * [0.9, 1.1]  → ±10% jitter
  }

  return positions;
}
```

#### 5.2.2 Pattern Pipeline

```typescript
function generatePatterns(
  samples: { input: number[]; phoneme: Phoneme }[],
  phoneme: Phoneme
): TrainingPattern[] {
  return samples.map(s => ({
    input: s.input,
    output: phonemeToArray(phoneme),  // See phoneme.spec.md
  }));
}
```

### 5.3 LipsyncTrainer Configuration (from `LipsyncTrainer.as`)

#### 5.3.1 Training File Layout (Male Voice)

| File | Phoneme | Time Range (s) | Samples |
|---|---|---|---|
| `aeiou.mp3` | v3a | 9–15 | 40 |
| `aeiou.mp3` | v3b | 15–24 | 40 |
| `aeiou.mp3` | v7a | 50–55 | 40 |
| `aeiou.mp3` | v7b | 55–62 | 40 |
| `aeiou.mp3` | v1a | 87–95 | 40 |
| `aeiou.mp3` | v1b | 95–102 | 40 |
| `aeiou.mp3` | v6a | 127–135 | 40 |
| `aeiou.mp3` | v6b | 135–144 | 40 |
| `aeiou.mp3` | v5a | 167–175 | 40 |
| `aeiou.mp3` | v5b | 175–187 | 40 |
| `example.mp3` | v2a | 48–53 | 40 |
| `example.mp3` | v2b | 53–59 | 40 |
| `example.mp3` | v4a | 211–218 | 40 |
| `example.mp3` | v4b | 218–224 | 40 |

**Total training patterns:** 14 phonemes × 40 samples = **560 patterns**

#### 5.3.2 Training Hyperparameters

| Parameter | Field / Source | Default |
|---|---|---|
| `hiddenNeuronsPerLayer` | UI text field (user-set) | ~50 |
| `epochsToRun` | UI text field | — |
| `learningRate` (η₀) | UI text field | — |
| `targetMSE` | UI text field | 0.02 |

#### 5.3.3 Training Flow

```
1. loadSamples()
   → TrainingPatternGenerator.addSequence(file, phoneme, start_s, stop_s, 40)
   → TrainingPatternGenerator.start() → SampleProvider processes each file
   → onTrainingSequence → TrainingPattern[] collected

2. trainNetwork() / completeTraining()
   → network.train(patterns, epochs, learningRate, targetMSE)
   → Returns final MSE

3. saveNetwork()
   → Serialize to zlib-compressed binary (see §6)

4. loadNetwork()
   → Deserialize from binary → restore all weights/biases/momentums
```

---

## 6. Serialization Format (`NeuralNetwork.save` / `NeuralNetwork.load`)

### 6.1 Binary Layout

All multi-byte values are big-endian.

```
┌─────────────────────────────────────────┐
│ Header (4 × int32)                       │
│   LP.order, outputCount,                 │
│   samplingDecimate, windowLength         │
├─────────────────────────────────────────┤
│ Training state (2 × float64)             │
│   momentum, realLearningRate             │
├─────────────────────────────────────────┤
│ Layer count (1 × int32) = 3             │
├─────────────────────────────────────────┤
│ ┌─ Per Layer ────────────────────────┐  │
│ │ Layer neuron count (1 × int32)     │  │
│ │ ┌─ Per Neuron ──────────────────┐  │  │
│ │ │ value  (float64)              │  │  │
│ │ │ bias   (float64)              │  │  │
│ │ │ momentum (float64)            │  │  │
│ │ │ size   (int32)                │  │  │
│ │ │ ┌─ Per Input ──────────────┐  │  │  │
│ │ │ │ input_i    (float64)     │  │  │  │
│ │ │ │ weight_i   (float64)     │  │  │  │
│ │ │ │ momentum_i (float64)     │  │  │  │
│ │ │ └──────────────────────────┘  │  │  │
│ │ └──────────────────────────────┘  │  │
│ └───────────────────────────────────┘  │
├─────────────────────────────────────────┤
│ zlib compression applied to entire blob │
└─────────────────────────────────────────┘
```

### 6.2 Total Size Example

For neuronsPerLayer=50:
```
Header:   4 × 4 = 16 bytes
State:    2 × 8 = 16 bytes
Layers:   1 × 4 = 4 bytes
Layer 0:  1 × 4 + 50 × (3×8 + 4 + 9×3×8) = 4 + 50 × (28 + 216) = 4 + 50 × 244 = 12,204 bytes
Layer 1:  same as Layer 0 = 12,204 bytes
Layer 2:  1 × 4 + 6 × (3×8 + 4 + 50×3×8) = 4 + 6 × (28 + 1200) = 4 + 6 × 1228 = 7,372 bytes

Raw total: 16 + 16 + 4 + 12,204 + 12,204 + 7,372 = 31,816 bytes
After zlib: ~16,137 bytes (matches lib/network_image)
```

### 6.3 TypeScript Deserializer

```typescript
function loadNetwork(buffer: ArrayBuffer, net: NeuralNetworkState): void {
  // Decompress zlib
  const raw = pako.inflate(new Uint8Array(buffer));
  const dv = new DataView(raw.buffer);
  let offset = 0;

  // Header
  const lpOrder = dv.getInt32(offset, false); offset += 4;
  const outputCount = dv.getInt32(offset, false); offset += 4;
  const samplingDecimate = dv.getInt32(offset, false); offset += 4;
  const windowLength = dv.getInt32(offset, false); offset += 4;

  // State
  net.momentum = dv.getFloat64(offset, false); offset += 8;
  net.realLearningRate = dv.getFloat64(offset, false); offset += 8;

  const layersLength = dv.getInt32(offset, false); offset += 4;
  net.layers = [];

  for (let l = 0; l < layersLength; l++) {
    const layerLength = dv.getInt32(offset, false); offset += 4;
    const layer: NeuronState[] = [];

    for (let n = 0; n < layerLength; n++) {
      const neuron: NeuronState = {
        value: dv.getFloat64(offset, false); offset += 8,
        bias: dv.getFloat64(offset, false); offset += 8,
        momentum: dv.getFloat64(offset, false); offset += 8,
        size: dv.getInt32(offset, false); offset += 4,
        inputs: [],
        weights: [],
        momentums: [],
      };

      for (let s = 0; s < neuron.size; s++) {
        // inputs[i] is only used at forward-pass time; load but can ignore
        dv.getFloat64(offset, false); offset += 8;  // input_i (skip)
        neuron.weights.push(dv.getFloat64(offset, false); offset += 8);
        neuron.momentums.push(dv.getFloat64(offset, false); offset += 8);
      }

      layer.push(neuron);
    }
    net.layers.push(layer);
  }
}
```

---

## 7. Ground Truth Verification

### 7.1 Test Vectors

File: `~/LipSync-ts/ground-truth/nn-weights.json`

The `test_vectors` array contains 10 input/output pairs. Each test vector uses the full 3-layer network with the extracted weights.

**Verification procedure:**

```typescript
function verifyForwardPass(weightsFile: string, tolerance: number = 1e-8): boolean {
  const { config, layers, test_vectors } = JSON.parse(fs.readFileSync(weightsFile, 'utf8'));

  const net: NeuralNetworkState = buildNetworkFromWeights(layers);
  // net.layers[0]: config structure with biases + weights
  // net.layers[1]: same
  // net.layers[2]: same

  for (const [i, vec] of test_vectors.entries()) {
    const output = forwardPass(net, vec.input);

    for (let j = 0; j < 6; j++) {
      const diff = Math.abs(output[j] - vec.expected_output[j]);
      if (diff > tolerance) {
        console.error(`Test vector ${i}, output ${j}: got ${output[j]}, expected ${vec.expected_output[j]}, diff ${diff}`);
        return false;
      }
    }
  }
  return true;
}
```

### 7.2 Weight Matrix Structure

From `nn-weights.json` `layers` array:

| Index | Layer | Neuron count | Weights per neuron | Total weights |
|---|---|---|---|---|
| 0 | H0 (hidden) | 50* | 9 | 450* |
| 1 | H1 (hidden) | 50 | 9 | 450 |
| 2 | O (output) | 6 | 50 | 300 |

\* Only first ~9 neurons of H0 have non-NaN values; remaining 41 are NaN extraction artifacts. The forward-pass bug (§1.4) means H1 only reads H0[0..8], so the NaN entries are never reached. **Implementation must verify against the non-NaN portion only.**

### 7.3 First 5 Test Vectors (Spot Check)

| # | Input (first 3 dims) | Output[0] | Output[1] | Output[2] | Output[3] | Output[4] | Output[5] |
|---|---|---|---|---|---|---|---|
| 1 | [0.1, 0.15, 0.2, …] | 0.06519747 | 0.97806865 | 0.02320911 | 0.99008496 | 0.00483052 | 0.08468983 |
| 2 | [0.2, 0.25, 0.3, …] | 0.03157902 | 0.98744363 | 0.00722711 | 0.99609452 | 0.00202699 | 0.03686122 |
| 3 | [0.3, 0.35, 0.4, …] | 0.01652951 | 0.99231746 | 0.00288109 | 0.99820809 | 0.00102133 | 0.02172390 |
| 4 | [0.4, 0.45, 0.5, …] | 0.00949592 | 0.99500075 | 0.00137426 | 0.99906094 | 0.00055345 | 0.01567414 |
| 5 | [0.5, 0.55, 0.6, …] | 0.00590142 | 0.99660986 | 0.00074394 | 0.99945871 | 0.00030423 | 0.01300103 |

---

## 8. Edge Cases

### 8.1 Forward Pass

| Edge Case | Expected Behaviour |
|---|---|
| All-zero input `[0, 0, 0, 0, 0, 0, 0, 0, 0]` | All neurons compute σ(bias); output depends on trained biases |
| All-NaN or undefined input | `NaN * weight = NaN` → `σ(NaN) = NaN` → entire network outputs NaN |
| Empty layer array | Cyclic `for (l = 0; l < layers.length; l++)` produces no output; returns `currentInput` = input unchanged |
| Single-element pattern set | MSE averages over 1 pattern; learning rate = η₀ × MSE |
| `targetMSE = 0` | Training runs all epochs unless MSE exactly 0 |

### 8.2 Backpropagation

| Edge Case | Expected Behaviour |
|---|---|
| Perfect output `(t == a)` | `nError = 0` → `delta = 0` → weight changes = momentum only |
| Saturated neuron `(a ≈ 0 or a ≈ 1)` | `a * (1 - a) ≈ 0` → `delta ≈ 0` → vanishing gradient |
| `learningRate = 0` | No weight updates from error term; only momentum changes apply |
| Output layer with 1 neuron | `MSE = (t - a)² / 1` = squared error |

### 8.3 Training Data

| Edge Case | Expected Behaviour |
|---|---|
| Empty phoneme list | `getTrainingSeq` returns 0 patterns for that phoneme |
| `start >= stop` | `generateArray` produces empty array → 0 samples |
| `steps = 0` | Division by zero in `generateArray` → NaN/inf in step computation |
| Audio shorter than requested position | `sound.extract` returns fewer samples → shorter vector → LPC analysis on truncated data |
| `samplingDecimate < 0` | Negative decimation → no samples extracted |

### 8.4 Serialization

| Edge Case | Expected Behaviour |
|---|---|
| Corrupted zlib stream | Decompression throws; `load()` fails |
| Mismatched layer count | Misaligned `DataView` reads produce garbage values |
| Untrained network (NaN weights) | `σ(NaN) = NaN` cascade; `MSE = NaN` |

---

## 9. Files to Verify Against

| File | Path | What it verifies |
|---|---|---|
| nn-weights.json | `~/LipSync-ts/ground-truth/nn-weights.json` | Forward pass correctness (10 test vectors), weight/bias extraction, layer structure |
| phoneme-model.json | `~/LipSync-ts/ground-truth/phoneme-model.json` | Phoneme binary encodings (used by training output targets) |
| lpc-test-vectors.json | `~/LipSync-ts/ground-truth/lpc-test-vectors.json` | LPC analysis → NN input consistency |
| audio-pipeline.json | `~/LipSync-ts/ground-truth/audio-pipeline.json` | End-to-end audio → feature → NN output |

---

## 10. Implementation Checklist

- [ ] `NeuronState` interface / `createNeuron()`
- [ ] `NeuralNetworkState` interface / `createNetwork()` with documented H1 bug
- [ ] `neuronCalculateValue()` — sigmoid activation
- [ ] `forwardPass()` — sequential layer evaluation
- [ ] `adjustWeights()` — delta rule with momentum accumulator
- [ ] `backwardPass()` — reverse iteration, MSE computation
- [ ] `train()` — epoch loop with Fisher-Yates shuffle and adaptive LR
- [ ] `loadNetwork()` — zlib-decompress + binary deserialize
- [ ] `saveNetwork()` — binary serialize + zlib-compress
- [ ] Verify all 10 test vectors from `nn-weights.json` match ±1e-8
- [ ] Verify phoneme encodings match `phoneme-model.json`
