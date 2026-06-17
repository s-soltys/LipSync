/**
 * MicPipelineProcessor — AudioWorkletProcessor
 *
 * Accumulates incoming microphone PCM samples (mono, Float32)
 * and sends periodic audio_chunk messages every STEP_SAMPLES
 * (882 samples ≈ 20 ms at 44.1 kHz) to the main thread.
 *
 * Each message includes:
 *   - type:       'audio_chunk'
 *   - samples:    Array<number> — raw PCM samples (882 floats)
 *   - rms:        number        — root-mean-square energy of the chunk
 *   - sampleRate: number        — 44100
 */

const STEP_SAMPLES = 882;

class MicPipelineProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    /** Internal ring buffer of raw PCM samples. */
    this._buffer = [];
  }

  /**
   * Called by the audio engine for each render quantum (128 frames).
   * Accumulates samples and flushes complete STEP_SAMPLES-sized chunks.
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input.length || !input[0] || !input[0].length) {
      return true;
    }

    const channelData = input[0]; // mono channel

    // Append incoming samples to the buffer
    for (let i = 0; i < channelData.length; i++) {
      this._buffer.push(channelData[i]);
    }

    // Flush complete chunks of exactly STEP_SAMPLES
    while (this._buffer.length >= STEP_SAMPLES) {
      const chunk = this._buffer.splice(0, STEP_SAMPLES);

      // Compute RMS energy
      let sumSq = 0;
      for (let i = 0; i < chunk.length; i++) {
        sumSq += chunk[i] * chunk[i];
      }
      const rms = Math.sqrt(sumSq / chunk.length);

      this.port.postMessage({
        type: 'audio_chunk',
        samples: chunk,
        rms: rms,
        sampleRate: 44100,
      });
    }

    return true; // keep the processor alive
  }
}

registerProcessor('mic-pipeline-processor', MicPipelineProcessor);
