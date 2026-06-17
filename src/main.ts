/**
 * LipSync-ts — Main Entry Point
 *
 * Three.js avatar viewer with AS3-editor-style UI:
 *   - 3D viewport with morph-target-driven avatar (blink, gaze, viseme)
 *   - Test audio buttons that generate synthetic audio and run
 *     it through the full LPC → NN → phoneme pipeline
 *   - Status bar (FPS, viseme)
 *
 * NN weights loaded via fetch from ground-truth/nn-weights.json.
 */

import { Avatar3D } from './avatar3d/avatar';
import { AvatarExpression, ExpressionsCollection } from './avatar3d/expression';
import { forwardPass, createNetworkFromJson, parseNetworkJson } from './core/nn';
import type { SerializedNetwork, NeuralNetworkState } from './core/nn';
import { LipsyncPlayer, preparePhonemeBuffer, STEP_SAMPLES, recognizePhoneme } from './player/player';
import { SAMPLES_PER_WINDOW } from './player/audio';
import type { Phoneme } from './player/player';

// ──────────────────────────────────────────────────────────
//  Configuration
// ──────────────────────────────────────────────────────────

/** Vite base path — resolves to '/' in dev, '/LipSync/' on GitHub Pages. */
const BASE: string = (import.meta as any).env?.BASE_URL ?? '/';

/** Set to true to use the Face Cap GLTF model instead of procedural head. */
const USE_GLTF_MODEL = true;
/** Path to the GLTF model (relative to public/) */
const GLTF_MODEL_PATH = `${BASE}models/brunette.glb`;

// ──────────────────────────────────────────────────────────
//  State
// ──────────────────────────────────────────────────────────

let avatar: Avatar3D;
let player: LipsyncPlayer | null = null;
let networkRun: ((input: number[]) => number[]) | null = null;
let animFrameId = 0;
let fpsCounter = 0;
let fpsLastTime = 0;
let isPlaying = false;

// Camera preset display
const camDisplay = document.getElementById('cam-display')!;

// Mic / streaming state
let micStream: MediaStream | null = null;
let micWorkletNode: AudioWorkletNode | null = null;
let micAudioCtx: AudioContext | null = null;
let streamingProcessor: StreamingProcessor | null = null;
let micActive = false;

let audioCtx: AudioContext;

const container = document.getElementById('canvas-container')!;

// ──────────────────────────────────────────────────────────
//  Real speech sample URLs (preloaded from /samples/)
// ──────────────────────────────────────────────────────────

const SAMPLE_MAP: Record<string, string> = {
  aeiou:   `${BASE}samples/aeiou.wav`,
  count:   `${BASE}samples/count.wav`,
  example: `${BASE}samples/example.wav`,
  lipsync: `${BASE}samples/lipsync.wav`,
  speech:  `${BASE}samples/speech.wav`,
};

/** Cache of decoded AudioBuffers, keyed by type. */
const sampleCache = new Map<string, AudioBuffer>();

/**
 * Pre-load all speech samples from disk so they are ready instantly
 * when a test button is clicked. Falls back to synthetic audio if a
 * sample fails to load.
 */
async function initSampleCache(audioCtx: AudioContext): Promise<void> {
  const entries = Object.entries(SAMPLE_MAP);
  const results = await Promise.allSettled(
    entries.map(async ([type, url]) => {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
      const arrayBuffer = await resp.arrayBuffer();
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      sampleCache.set(type, decoded);
      console.log(`[samples] Loaded "${type}" from ${url}`);
    }),
  );
  for (const r of results) {
    if (r.status === 'rejected') {
      console.warn('[samples] Failed to load sample:', r.reason);
    }
  }
}

// ──────────────────────────────────────────────────────────
//  Synthetic audio generator (fallback when no sample is loaded)
// ──────────────────────────────────────────────────────────

function generateTestAudio(type: string, duration = 1.5): Float32Array {
  const sr = 44100;
  const len = sr * duration;
  const buf = new Float32Array(len);

  switch (type) {
    case 'aeiou': {
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const f = 200 + 300 * Math.sin(2 * Math.PI * 0.5 * t);
        buf[i] = 0.4 * Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(2 * Math.PI * f * 2 * t);
      }
      break;
    }
    case 'count': {
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * t);
        buf[i] = env * 0.4 * Math.sin(2 * Math.PI * 350 * t);
      }
      break;
    }
    case 'lipsync': {
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const f = 150 + 600 * (t / duration);
        buf[i] = 0.3 * Math.sin(2 * Math.PI * f * t);
      }
      break;
    }
    case 'speech': {
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        buf[i] = 0.3 * Math.sin(2 * Math.PI * 250 * t)
               + 0.15 * Math.sin(2 * Math.PI * 1500 * t)
               + 0.1 * Math.sin(2 * Math.PI * 2500 * t);
      }
      break;
    }
    case 'example':
    default: {
      for (let i = 0; i < len; i++) {
        buf[i] = 0.4 * Math.sin(2 * Math.PI * 440 * i / sr);
      }
      break;
    }
  }

  return buf;
}

// ──────────────────────────────────────────────────────────
//  Viseme dispatch
// ──────────────────────────────────────────────────────────

function setViseme(phoneme: Phoneme, amplitude?: number): void {
  const visemeId = phoneme.visemeId;
  document.getElementById('viseme-display')!.textContent = phoneme.alias;

  if (visemeId === 0) {
    avatar.setViseme(ExpressionsCollection.NEUTRAL, 0);
    return;
  }

  // Map viseme ID to expression and intensity for morph target driving.
  // Use audio amplitude/energy when available for dynamic intensity,
  // fall back to a viseme-based formula.
  let intensity: number;
  if (amplitude !== undefined) {
    // Scale amplitude to a reasonable morph target range, cap at 1.0
    intensity = Math.min(amplitude * 2.5, 1.0);
  } else {
    // Fallback: linearly map visemeId (1-9) to 0.15-1.0
    intensity = 0.15 + (visemeId / 9) * 0.85;
  }
  const visemeExpr = ExpressionsCollection.getVisemeById(visemeId);
  avatar.setViseme(visemeExpr, intensity);
}

// ──────────────────────────────────────────────────────────
//  Streaming Processor — mic → LPC → NN → phoneme pipeline
// ──────────────────────────────────────────────────────────

/**
 * Accumulates incoming mic audio chunks and runs the phoneme
 * recognition pipeline every STEP_SAMPLES (882) samples.
 *
 * Uses a ring buffer (fixed-size Float32Array with modular write
 * pointer) instead of a rolling buffer with slice trimming.
 * Ring buffer size = SAMPLES_PER_WINDOW + STEP_SAMPLES (1676).
 */
class StreamingProcessor {
  private ringBuffer: Float32Array;
  private bufferSize: number;
  private writePos: number = 0;
  private totalWritten: number = 0;
  private nextPosition: number = STEP_SAMPLES;
  private network: { run(input: number[]): number[] };
  private onPhoneme: (phoneme: Phoneme) => void;
  private onEnergy: (energy: number) => void;

  constructor(opts: {
    network: { run(input: number[]): number[] };
    onPhoneme: (phoneme: Phoneme) => void;
    onEnergy: (energy: number) => void;
  }) {
    this.network = opts.network;
    this.onPhoneme = opts.onPhoneme;
    this.onEnergy = opts.onEnergy;
    this.bufferSize = SAMPLES_PER_WINDOW + STEP_SAMPLES; // 794 + 882 = 1676
    this.ringBuffer = new Float32Array(this.bufferSize);
  }

  /**
   * Feed a new PCM chunk (from AudioWorklet) into the processor.
   * Writes samples into the ring buffer with a modular write pointer
   * and runs recognition on all complete windows that can be formed.
   */
  feed(chunk: Float32Array): void {
    // Write chunk into ring buffer with modular pointer
    for (let i = 0; i < chunk.length; i++) {
      this.ringBuffer[this.writePos] = chunk[i];
      this.writePos = (this.writePos + 1) % this.bufferSize;
    }
    this.totalWritten += chunk.length;

    // Process every complete window we have data for
    while (this.nextPosition + SAMPLES_PER_WINDOW <= this.totalWritten) {
      // Extract contiguous window from ring buffer (handle wraparound)
      const start = this.nextPosition % this.bufferSize;
      const window = new Float32Array(SAMPLES_PER_WINDOW);
      if (start + SAMPLES_PER_WINDOW <= this.bufferSize) {
        window.set(this.ringBuffer.subarray(start, start + SAMPLES_PER_WINDOW));
      } else {
        const firstPart = this.bufferSize - start;
        window.set(this.ringBuffer.subarray(start));
        window.set(this.ringBuffer.subarray(0, SAMPLES_PER_WINDOW - firstPart), firstPart);
      }

      const item = recognizePhoneme(window, 0, this.network);
      this.onEnergy(item.energy);
      this.onPhoneme(item.phoneme);
      this.nextPosition += STEP_SAMPLES;
    }
  }

  /** Reset internal state (e.g. on mic stop). */
  reset(): void {
    this.writePos = 0;
    this.totalWritten = 0;
    this.nextPosition = STEP_SAMPLES;
  }
}

// ──────────────────────────────────────────────────────────
//  Audio playback
// ──────────────────────────────────────────────────────────

async function playTestAudio(type: string): Promise<void> {
  if (!player || !networkRun || isPlaying) return;
  isPlaying = true;

  const indicator = document.getElementById('status-indicator')!;
  indicator.textContent = '● PLAYING';
  indicator.style.color = '#e74c3c';

  try {
    // ── Try to use a real speech sample from cache ──────────
    let audio: Float32Array;
    let sampleRate = 44100;

    const cached = sampleCache.get(type);
    if (cached) {
      // Use real speech sample
      audio = new Float32Array(cached.getChannelData(0));
      sampleRate = cached.sampleRate;
    } else {
      // Fall back to synthetic audio
      audio = generateTestAudio(type, 1.5);
    }

    // Reset viseme
    avatar.setViseme(ExpressionsCollection.NEUTRAL, 0);

    // Pre-compute the phoneme timeline for the full audio buffer
    const phonemeBuffer = preparePhonemeBuffer(audio, { run: networkRun });

    // ── Audio playback ──────────────────────────────────────
    const audioBuf = audioCtx.createBuffer(1, audio.length, sampleRate);
    audioBuf.getChannelData(0).set(audio);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuf;
    source.connect(audioCtx.destination);
    source.start();

    // ── Schedule phoneme dispatch ───────────────────────────
    // Each phoneme tick is STEP_SAMPLES ≈ 20 ms (882 / 44100)
    const stepMs = (STEP_SAMPLES / 44100) * 1000;
    for (let i = 0; i < phonemeBuffer.length; i++) {
      const item = phonemeBuffer[i];
      // First phoneme fires at ~20 ms (position STEP_SAMPLES),
      // second at ~40 ms, etc.
      setTimeout(() => {
        setViseme(item.phoneme, item.energy);
      }, (i + 1) * stepMs);
    }

    // ── Schedule viseme reset after audio finishes ──────────
    const audioDurationMs = (audio.length / sampleRate) * 1000;
    setTimeout(() => {
      avatar.setViseme(ExpressionsCollection.NEUTRAL, 0);
    }, audioDurationMs + 50);
  } catch (err) {
    console.error('[playTestAudio] Error:', err);
  } finally {
    isPlaying = false;
    indicator.textContent = '● READY';
    indicator.style.color = '#53d769';
    avatar.setViseme(ExpressionsCollection.NEUTRAL, 0);
  }
}

// ──────────────────────────────────────────────────────────
//  Camera cycling
// ──────────────────────────────────────────────────────────

function cycleCamera(): void {
  const label = avatar.cycleCameraPreset();
  document.getElementById('cam-display')!.textContent = label;
}

// ──────────────────────────────────────────────────────────
//  Microphone capture
// ──────────────────────────────────────────────────────────

function showMicError(msg: string): void {
  const display = document.getElementById('mic-energy')!;
  display.textContent = 'ERR';
  display.style.color = '#e74c3c';
  console.warn('[mic]', msg);
}

async function startMic(): Promise<void> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showMicError('getUserMedia not available');
    return;
  }

  if (!networkRun) {
    showMicError('NN not loaded yet');
    return;
  }

  try {
    // 1. Get mic stream (mono) with 5-second timeout
    const TIMEOUT_MS = 5_000;
    const stream = await Promise.race([
      navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1 },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`getUserMedia timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
      ),
    ]);
    micStream = stream;

    // 2. Create dedicated AudioContext for mic pipeline
    const ctx = new AudioContext();
    micAudioCtx = ctx;

    // Resume AudioContext (browsers may suspend due to autoplay policy)
    await ctx.resume();

    // 3. Load the AudioWorklet processor
    await ctx.audioWorklet.addModule(`${BASE}audio-processor.js`);

    // 4. Create source + worklet node
    const source = ctx.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(ctx, 'mic-pipeline-processor');
    micWorkletNode = workletNode;

    // 5. Create streaming processor for phoneme recognition
    let lastMicEnergy = 0;
    streamingProcessor = new StreamingProcessor({
      network: { run: networkRun },
      onPhoneme(phoneme: Phoneme): void {
        setViseme(phoneme, lastMicEnergy);
      },
      onEnergy(energy: number): void {
        lastMicEnergy = energy;
        const display = document.getElementById('mic-energy');
        if (!display) return;
        // Show energy value with VAD-based colouring
        display.textContent = energy.toFixed(4);
        display.style.color = energy >= 0.025 ? '#53d769' : '#888';
      },
    });

    // 6. Listen for audio_chunk messages from the worklet
    workletNode.port.onmessage = (event: MessageEvent) => {
      if (!streamingProcessor) return;
      const msg = event.data;
      if (msg && msg.type === 'audio_chunk') {
        const chunk = new Float32Array(msg.samples);
        streamingProcessor.feed(chunk);
      }
    };

    // 7. Connect audio graph
    source.connect(workletNode);
    // No need to connect to destination — we only need the data stream

    // 8. Update UI
    micActive = true;
    const micBtn = document.getElementById('btn-mic')!;
    micBtn.classList.add('active');
    micBtn.textContent = '🎤 ●';

    const indicator = document.getElementById('status-indicator')!;
    indicator.textContent = '● MIC ON';
    indicator.style.color = '#e74c3c';

    // Disable audio test buttons while mic is active
    document.querySelectorAll('[data-audio]').forEach((btn) => {
      (btn as HTMLButtonElement).disabled = true;
      btn.classList.add('muted');
    });

    console.log('[mic] Started successfully');
  } catch (err: any) {
    showMicError(String(err?.message ?? err));
    // Clean up partial state
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
    if (micAudioCtx) {
      micAudioCtx.close();
      micAudioCtx = null;
    }
    micWorkletNode = null;
    streamingProcessor = null;
    micActive = false;
  }
}

function stopMic(): void {
  // Stop the media stream
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }

  // Disconnect worklet and clear its port message handler
  if (micWorkletNode) {
    micWorkletNode.port.onmessage = null;
    micWorkletNode.disconnect();
    micWorkletNode = null;
  }

  // Close the mic AudioContext
  if (micAudioCtx) {
    micAudioCtx.close();
    micAudioCtx = null;
  }

  // Reset streaming processor
  if (streamingProcessor) {
    streamingProcessor.reset();
    streamingProcessor = null;
  }

  micActive = false;

  // Reset UI
  const micBtn = document.getElementById('btn-mic');
  if (micBtn) {
    micBtn.classList.remove('active');
    micBtn.textContent = '🎤';
  }

  const display = document.getElementById('mic-energy');
  if (display) {
    display.textContent = '-';
    display.style.color = '';
  }

  // Re-enable audio test buttons
  document.querySelectorAll('[data-audio]').forEach((btn) => {
    (btn as HTMLButtonElement).disabled = false;
    btn.classList.remove('muted');
  });

  // Restore status indicator if not playing test audio
  if (!isPlaying) {
    const indicator = document.getElementById('status-indicator')!;
    indicator.textContent = '● READY';
    indicator.style.color = '#53d769';
  }

  console.log('[mic] Stopped');
}

// ──────────────────────────────────────────────────────────
//  FPS counter & UI tick
// ──────────────────────────────────────────────────────────

function startUiLoop(): void {
  fpsLastTime = performance.now();

  function tick(): void {
    fpsCounter++;
    const now = performance.now();
    if (now - fpsLastTime >= 1000) {
      document.getElementById('fps-display')!.textContent = String(fpsCounter);
      fpsCounter = 0;
      fpsLastTime = now;
    }

    // Update viseme display
    const visemeDisplay = document.getElementById('viseme-display');
    if (visemeDisplay) {
      // viseme-display stays as-is (updated by setViseme)
    }

    animFrameId = requestAnimationFrame(tick);
  }

  animFrameId = requestAnimationFrame(tick);
}

// ──────────────────────────────────────────────────────────
//  Window resize
// ──────────────────────────────────────────────────────────

function handleResize(): void {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (avatar) {
    avatar.camera.aspect = w / h;
    avatar.camera.updateProjectionMatrix();
    avatar.getRenderer().setSize(w, h);
  }
}

// ──────────────────────────────────────────────────────────
//  UI wiring
// ──────────────────────────────────────────────────────────

function setupUI(): void {
  // Audio test buttons
  document.querySelectorAll('[data-audio]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = (btn as HTMLElement).dataset.audio!;
      playTestAudio(type);
    });
  });

  // Camera toggle
  document.getElementById('btn-cam')!.addEventListener('click', cycleCamera);

  // Mic toggle
  document.getElementById('btn-mic')!.addEventListener('click', () => {
    if (micActive) {
      stopMic();
    } else {
      startMic();
    }
  });

  // Resize
  window.addEventListener('resize', handleResize);
}

// ──────────────────────────────────────────────────────────
//  Bootstrap
// ──────────────────────────────────────────────────────────

async function init(): Promise<void> {
  try {
    // 0. Register runtime viseme collection (required before any viseme lookups)
    ExpressionsCollection.initRuntimeCollection();

    // 1. Create avatar scene
    avatar = new Avatar3D();

    // 2. Try loading GLTF model (falls back to procedural head on failure)
    if (USE_GLTF_MODEL) {
      avatar.loadModel({ modelPath: GLTF_MODEL_PATH }).then(() => {
        console.log('[main] GLTF model loading complete');
        // Update status indicator
        const indicator = document.getElementById('status-indicator');
        if (indicator) {
          indicator.textContent = '● MODEL LOADED';
          indicator.style.color = '#53d769';
        }
      });
    }

    // 2. Set up renderer in the container
    const renderer = avatar.getRenderer();
    const w = container.clientWidth || 700;
    const h = container.clientHeight || 400;
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Remove placeholder hint
    const hint = container.querySelector('.hint');
    if (hint) hint.remove();

    // 3. Fix camera aspect
    avatar.camera.aspect = w / h;
    avatar.camera.updateProjectionMatrix();

    // 4. Load NN weights
    const indicator = document.getElementById('status-indicator')!;
    indicator.textContent = '● LOADING';
    indicator.style.color = '#f39c12';

    const resp = await fetch(`${BASE}ground-truth/nn-weights.json`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    const raw = await resp.text();
    const serialized: SerializedNetwork = parseNetworkJson(raw);
    const net: NeuralNetworkState = createNetworkFromJson(serialized);

    // 6. Create LipsyncPlayer
    networkRun = (input) => forwardPass(net, input);
    player = new LipsyncPlayer({ run: networkRun });

    // 7. Create AudioContext and pre-load speech samples in background
    audioCtx = new AudioContext();
    initSampleCache(audioCtx);

    // 8. Start the avatar render loop
    avatar.start();

    // 9. Start UI update loop
    startUiLoop();

    // 10. Wire UI
    setupUI();

    indicator.textContent = '● READY';
    indicator.style.color = '#53d769';
  } catch (err) {
    console.error('Initialization failed:', err);
    const indicator = document.getElementById('status-indicator')!;
    indicator.textContent = '● ERROR';
    indicator.style.color = '#e74c3c';

    const hint = container.querySelector('.hint');
    if (hint) hint.textContent = `Failed to initialize: ${err}`;
  }
}

// ─── Boot ─────────────────────────────────────────────────

init();
