import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseNetworkJson,
  createNetworkFromJson,
  forwardPass,
  sigmoid,
  neuronCalculateValue,
  type NeuralNetworkState,
  type SerializedNetwork,
  type TestVector,
} from '../core/nn';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Load the ground-truth weights JSON, handling NaN literals. */
function loadGroundTruth(): {
  config: SerializedNetwork['config'];
  layers: SerializedNetwork['layers'];
  testVectors: TestVector[];
} {
  const filePath = path.resolve(
    __dirname,
    '../../ground-truth/nn-weights.json',
  );
  const raw = fs.readFileSync(filePath, 'utf-8');
  const serialized = parseNetworkJson(raw);
  // Extract test vectors directly from the raw data (they are at the end)
  // We parse them out of the sanitized JSON
  const data = JSON.parse(raw.replace(/\bNaN\b/g, 'null'));
  return {
    config: serialized.config,
    layers: serialized.layers,
    testVectors: data.test_vectors as TestVector[],
  };
}

/** Build a network state from the ground-truth JSON. */
function buildNetwork(): NeuralNetworkState {
  const { serialized } = loadRaw();
  return createNetworkFromJson(serialized);
}

/** Load and parse in one step, returning both raw and parsed data. */
function loadRaw(): { serialized: SerializedNetwork; testVectors: TestVector[] } {
  const filePath = path.resolve(
    __dirname,
    '../../ground-truth/nn-weights.json',
  );
  const raw = fs.readFileSync(filePath, 'utf-8');
  const serialized = parseNetworkJson(raw);
  const data = JSON.parse(raw.replace(/\bNaN\b/g, 'null'));
  return {
    serialized,
    testVectors: data.test_vectors as TestVector[],
  };
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('sigmoid', () => {
  it('returns 0.5 for z=0', () => {
    expect(sigmoid(0)).toBeCloseTo(0.5, 5);
  });

  it('approaches 0 for large negative', () => {
    expect(sigmoid(-100)).toBeCloseTo(0, 10);
  });

  it('approaches 1 for large positive', () => {
    expect(sigmoid(100)).toBeCloseTo(1, 10);
  });
});

describe('neuronCalculateValue', () => {
  it('computes sigmoid of weighted sum + bias', () => {
    const neuron = {
      value: 0,
      bias: 0.5,
      momentum: 0,
      size: 2,
      inputs: [NaN, NaN],
      weights: [1.0, 2.0],
      momentums: [0, 0],
    };
    const result = neuronCalculateValue(neuron, [0.5, -0.5]);
    // z = 1*0.5 + 2*(-0.5) + 0.5 = 0.5 -1 + 0.5 = 0
    // sigmoid(0) = 0.5
    expect(result).toBeCloseTo(0.5, 10);
    expect(neuron.value).toBeCloseTo(0.5, 10);
    expect(neuron.inputs[0]).toBe(0.5);
    expect(neuron.inputs[1]).toBe(-0.5);
  });

  it('reads only neuron.size inputs', () => {
    const neuron = {
      value: 0,
      bias: 0,
      momentum: 0,
      size: 1,
      inputs: [NaN],
      weights: [1.0],
      momentums: [0],
    };
    const result = neuronCalculateValue(neuron, [2.0, 999, 999]);
    // z = 1*2 + 0 = 2
    // sigmoid(2) ≈ 0.880797
    expect(result).toBeCloseTo(0.880797, 5);
    expect(neuron.inputs[0]).toBe(2.0);
  });
});

describe('createNetworkFromJson', () => {
  it('builds a valid network with correct layer dimensions', () => {
    const { serialized } = loadRaw();
    const net = createNetworkFromJson(serialized);

    expect(net.layers).toHaveLength(3);

    // Layer 0: 50 neurons, 9 weights each
    expect(net.layers[0]).toHaveLength(50);
    expect(net.layers[0][0].size).toBe(9);
    // First 9 neurons have valid weights; remaining 41 have NaN
    expect(net.layers[0][0].bias).not.toBeNaN();
    expect(net.layers[0][0].weights).toHaveLength(9);
    expect(net.layers[0][0].weights.every((w) => !isNaN(w))).toBe(true);
    // Dead neurons (index >= 9) have NaN bias and weights
    expect(net.layers[0][9].bias).toBeNaN();

    // Layer 1: 50 neurons, 9 weights each
    expect(net.layers[1]).toHaveLength(50);
    expect(net.layers[1][0].size).toBe(9);
    expect(net.layers[1][0].bias).not.toBeNaN();

    // Layer 2: 6 neurons, 50 weights each
    expect(net.layers[2]).toHaveLength(6);
    expect(net.layers[2][0].size).toBe(50);
    expect(net.layers[2][0].bias).not.toBeNaN();

    // Config values
    expect(net.momentum).toBe(0.5);
    expect(net.hiddenLayers).toBe(2);
  });
});

describe('forwardPass — structural bug quirk', () => {
  it('layer 1 reads only first 9 of layer 0\'s 50 outputs', () => {
    const { serialized } = loadRaw();
    const net = createNetworkFromJson(serialized);

    // Run a forward pass with known input
    const input = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];
    const result = forwardPass(net, input);

    // Result should be a 6-element array
    expect(result).toHaveLength(6);
    // All values should be between 0 and 1 (sigmoid)
    result.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });

  it('dead neurons (index >= 9) in layer 0 produce NaN but never affect output', () => {
    const { serialized } = loadRaw();
    const net = createNetworkFromJson(serialized);

    // Manually compute layer 0 outputs to verify dead neurons produce NaN
    const input = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];

    // Compute just layer 0
    const layer0 = net.layers[0];
    const layer0Outputs = layer0.map((n) =>
      neuronCalculateValue(n, input),
    );

    // First 9 neurons produce valid outputs
    for (let i = 0; i < 9; i++) {
      expect(layer0Outputs[i]).not.toBeNaN();
    }
    // Neurons 9..49 produce NaN (dead)
    for (let i = 9; i < 50; i++) {
      expect(layer0Outputs[i]).toBeNaN();
    }

    // But the full forward pass still works because layer 1 only reads first 9
    const result = forwardPass(net, input);
    expect(result).toHaveLength(6);
    result.forEach((v) => {
      expect(v).not.toBeNaN();
    });
  });
});

describe('forwardPass — ground truth test vectors', () => {
  const { testVectors } = loadGroundTruth();

  it('has exactly 10 test vectors', () => {
    expect(testVectors).toHaveLength(10);
  });

  testVectors.forEach((tv, idx) => {
    it(`produces expected output for test vector ${idx + 1}`, () => {
      const { serialized } = loadRaw();
      const net = createNetworkFromJson(serialized);
      const result = forwardPass(net, tv.input);

      expect(result).toHaveLength(6);
      expect(result).toHaveLength(tv.expected_output.length);

      for (let i = 0; i < 6; i++) {
        expect(result[i]).toBeCloseTo(tv.expected_output[i], 9);
      }
    });
  });

  it('passes all 10 test vectors within 1e-9 tolerance', () => {
    const { serialized } = loadRaw();
    const net = createNetworkFromJson(serialized);

    for (let t = 0; t < testVectors.length; t++) {
      const tv = testVectors[t];
      const result = forwardPass(net, tv.input);
      for (let i = 0; i < 6; i++) {
        const absErr = Math.abs(result[i] - tv.expected_output[i]);
        expect(absErr).toBeLessThanOrEqual(1e-9);
      }
    }
  });
});

describe('exports', () => {
  it('exports a network type and factory', () => {
    // Just verifying the types are accessible
    const net: NeuralNetworkState = {
      momentum: 0.5,
      neuronalBias: 1,
      initialWeightRange: 1,
      realLearningRate: 0.01,
      hiddenLayers: 2,
      layers: [],
    };
    expect(net.momentum).toBe(0.5);
  });
});
