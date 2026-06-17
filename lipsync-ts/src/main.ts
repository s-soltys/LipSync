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
import { LipsyncPlayer, preparePhonemeBuffer, STEP_SAMPLES } from './player/player';
import type { Phoneme } from './player/player';

// ──────────────────────────────────────────────────────────
//  Configuration
// ──────────────────────────────────────────────────────────

/** Set to true to use the Face Cap GLTF model instead of procedural head. */
const USE_GLTF_MODEL = true;
/** Path to the GLTF model (relative to public/) */
const GLTF_MODEL_PATH = '/models/brunette.glb';

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
let gazeActive = false;
let gazeTime = 0;

let audioCtx: AudioContext;

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const container = document.getElementById('canvas-container')!;

// ──────────────────────────────────────────────────────────
//  Real speech sample URLs (preloaded from /samples/)
// ──────────────────────────────────────────────────────────

const SAMPLE_MAP: Record<string, string> = {
  aeiou:   '/samples/aeiou.wav',
  count:   '/samples/count.wav',
  example: '/samples/example.wav',
  lipsync: '/samples/lipsync.wav',
  speech:  '/samples/speech.wav',
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

function setViseme(phoneme: Phoneme): void {
  const visemeId = phoneme.visemeId;
  document.getElementById('viseme-display')!.textContent = phoneme.alias;

  if (visemeId === 0) {
    avatar.setViseme(ExpressionsCollection.NEUTRAL, 0);
    return;
  }

  // Map viseme ID to expression and intensity for morph target driving
  const intensity = visemeId / 9;
  const visemeExpr = ExpressionsCollection.getVisemeById(visemeId);
  avatar.setViseme(visemeExpr, intensity * 0.6);
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
      setViseme(item.phoneme);
    }, (i + 1) * stepMs);
  }

  // ── Cleanup after audio finishes ────────────────────────
  const audioDurationMs = (audio.length / sampleRate) * 1000;
  setTimeout(() => {
    isPlaying = false;
    indicator.textContent = '● READY';
    indicator.style.color = '#53d769';
    avatar.setViseme(ExpressionsCollection.NEUTRAL, 0);
  }, audioDurationMs + 50);
}

// ──────────────────────────────────────────────────────────
//  Gaze demo
// ──────────────────────────────────────────────────────────

function toggleGazeDemo(): void {
  gazeActive = !gazeActive;
  gazeTime = 0;
  document.getElementById('btn-demo-gaze')!.classList.toggle('active', gazeActive);
}

function forceBlink(): void {
  avatar.blink();
}

function resetAvatar(): void {
  avatar.setViseme(ExpressionsCollection.NEUTRAL, 0);
  avatar.lookAt(0, 0);
  gazeActive = false;
  document.getElementById('btn-demo-gaze')!.classList.remove('active');
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

    // Gaze demo animation
    if (gazeActive) {
      gazeTime += 0.016;
      const x = 0.5 * Math.sin(gazeTime * 0.7);
      const y = 0.3 * Math.sin(gazeTime * 0.5 + 1.0);
      avatar.lookAt(x, y);
    }

    // Blink status (morph-driven, no longer tracked directly)
    document.getElementById('blink-display')!.textContent = '-';

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

  // Gaze demo
  document.getElementById('btn-demo-gaze')!.addEventListener('click', toggleGazeDemo);

  // Blink
  document.getElementById('btn-blink')!.addEventListener('click', forceBlink);

  // Reset
  document.getElementById('btn-reset')!.addEventListener('click', resetAvatar);

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

    const resp = await fetch('/ground-truth/nn-weights.json');
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
