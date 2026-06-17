/**
 * Neural Network forward-pass module
 *
 * Mirrors the AS3 implementation in NeuralNetwork.as + Neuron.as.
 *
 * ⚠️ STRUCTURAL BUG (preserved for compatibility):
 * Hidden layers H0 and H1 are both created with `inputs = LP.order = 9`
 * instead of H1 receiving `neuronsPerLayer`. At runtime, forwardPass()
 * feeds each layer sequentially, so H1 receives `neuronsPerLayer` values
 * from H0 but only reads the first 9. H0 neurons beyond index 8 are
 * functionally dead in the forward pass (their outputs are computed but
 * never consumed).
 */

// ============================================================
// Types
// ============================================================

/** Single neuron state (mirrors Neuron.as) */
export interface NeuronState {
  value: number;       // Cached output after last forward pass
  bias: number;        // Bias weight
  momentum: number;    // Bias momentum accumulator
  size: number;        // Number of input connections
  inputs: number[];    // Input buffer from last forward pass
  weights: number[];   // Synaptic weights
  momentums: number[]; // Per-weight momentum accumulators
}

/** Full network state (mirrors NeuralNetwork.as) */
export interface NeuralNetworkState {
  momentum: number;
  neuronalBias: number;
  initialWeightRange: number;
  realLearningRate: number;
  hiddenLayers: number;
  layers: NeuronState[][];
}

/** Serialized neuron data from JSON weight file */
export interface NeuronData {
  bias: number | null;
  weights: (number | null)[];
}

/** Serialized network header + weights from JSON */
export interface SerializedNetwork {
  config: {
    lp_order: number;
    output_count: number;
    sampling_decimate: number;
    window_length: number;
    momentum: number;
    learning_rate: number;
  };
  layers: NeuronData[][];
}

/** Test vector from ground truth */
export interface TestVector {
  input: number[];
  expected_output: number[];
}

// ============================================================
// Activation
// ============================================================

/**
 * Logistic sigmoid activation: σ(z) = 1 / (1 + e^(-z))
 */
export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

// ============================================================
// Neuron forward pass
// ============================================================

/**
 * Compute the output value for a single neuron.
 *
 * Reads exactly `neuron.size` values from `inputsArray`.
 * Stores the `inputs` buffer and `value` on the neuron for backprop.
 *
 * @param neuron The neuron to evaluate
 * @param inputsArray Input values from the previous layer (or network input)
 * @returns The sigmoid activation value
 */
export function neuronCalculateValue(
  neuron: NeuronState,
  inputsArray: number[],
): number {
  let sum = 0;

  for (let i = 0; i < neuron.size; i++) {
    neuron.inputs[i] = inputsArray[i]; // Cache for backprop
    sum += neuron.weights[i] * neuron.inputs[i];
  }

  const z = sum + neuron.bias;
  neuron.value = sigmoid(z);
  return neuron.value;
}

// ============================================================
// Forward pass
// ============================================================

/**
 * Feed-forward: computes network output for a given input.
 *
 * Each layer uses the previous layer's full output as input.
 * However, each neuron reads only its `size` first values from
 * the input array (see structural bug notes above).
 *
 * @param net The network state
 * @param input 9-element LPC reflection coefficient vector
 * @returns 6-element sigmoid output vector
 */
export function forwardPass(
  net: NeuralNetworkState,
  input: number[],
): number[] {
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
}

// ============================================================
// Factory: create network state from serialized JSON
// ============================================================

/**
 * Parse a JSON string that may contain NaN literals (which are
 * not valid JSON). Replaces NaN with null before parsing.
 *
 * @param jsonString Raw JSON text (possibly with NaN)
 * @returns Parsed SerializedNetwork
 */
export function parseNetworkJson(jsonString: string): SerializedNetwork {
  // Replace bare NaN (not in strings) with null so JSON.parse works
  const sanitized = jsonString.replace(/\bNaN\b/g, 'null');
  return JSON.parse(sanitized) as SerializedNetwork;
}

/**
 * Build a NeuralNetworkState from parsed serialized data.
 *
 * Handles null placeholder values (from NaN literals in the JSON)
 * by converting them to JavaScript NaN for unused/dead neurons.
 *
 * @param serialized Parsed serialized network data
 * @returns A NeuralNetworkState ready for forwardPass()
 */
export function createNetworkFromJson(
  serialized: SerializedNetwork,
): NeuralNetworkState {
  const layers: NeuronState[][] = serialized.layers.map(
    (layerData: NeuronData[]) =>
      layerData.map((neuronData: NeuronData) => {
        const size = neuronData.weights.length;
        const bias = neuronData.bias ?? NaN;
        const weights = neuronData.weights.map((w) => w ?? NaN);
        return {
          value: 0,
          bias,
          momentum: 0,
          size,
          inputs: new Array(size).fill(NaN),
          weights,
          momentums: new Array(size).fill(0),
        } as NeuronState;
      }),
  );

  return {
    momentum: serialized.config.momentum,
    neuronalBias: 1.0,
    initialWeightRange: 1.0,
    realLearningRate: serialized.config.learning_rate,
    hiddenLayers: 2,
    layers,
  };
}
