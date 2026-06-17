# LipSync: ActionScript 3 → TypeScript Migration

**Status:** Complete  
**Date:** June 2026  
**Toolchain:** 100% AI-assisted via DeepSeek V4 Flash (Hermes Agent)

---

## Overview

LipSync was originally authored in 2011 as an ActionScript 3 / Away3D / Flex application. This migration rewrites the entire codebase in TypeScript using Three.js and Vite, preserving the original signal-processing pipeline while modernising the architecture for browser-based deployment.

---

## Migration Scope

| Dimension | Original (AS3) | Port (TypeScript) |
|---|---|---|
| Language | ActionScript 3 | TypeScript 5.9 (`strict: true`) |
| 3D Engine | Away3D | Three.js r184 |
| Build System | FlashDevelop / Flex SDK | Vite 6 |
| Testing | Manual | Vitest 3 (204 tests) |
| Runtime | Flash Player / AIR | Browser (WebGL, AudioContext, AudioWorklet) |
| Avatar | Procedural bones (Away3D) | Morph targets (GLTF/GLB) |
| Deployment | SWF file | GitHub Pages / static serve |

---

## Pipeline Fidelity

The core audio-to-phoneme pipeline was ported with verified numerical equivalence:

1. **Audio extraction** — 44.1 kHz PCM, 18 ms windows (794 samples), stride-7 decimation
2. **LPC analysis** — Autocorrelation method (Burg-like lattice) + Durbin-Levinson recursion → 9 reflection coefficients. Verified against ground-truth test vectors at 1e-9 tolerance.
3. **Neural network** — 9→50→50→6 feed-forward with sigmoid activation. The original structural bug (hidden layer H1 reads only 9 inputs instead of 50) is preserved for compatibility. All 10 ground-truth test vectors pass at 1e-9.
4. **Phoneme decode** — 6-bit MSB-first binary encoding, threshold ≥ 0.5. Round-trip verified for all 64 values. 19 phoneme symbols (v1a–v9b + silence).
5. **Temporal smoothing** — 3-point isolated-frame outlier filter.

All pipeline constants (sample rate, window size, step interval, VAD threshold, decimation factor) are cross-validated against the AS3 `LipsyncSettings` and ground-truth JSON fixtures.

---

## Key Architectural Decisions

### 3D Rendering

- **GLTF/GLB models** replace the procedural bone system. Primary model: Ready Player Me `brunette.glb` (72 morph targets). Fallback: `facecap.glb` (52 ARKit morphs).
- Morph targets support both Ready Player Me naming (`viseme_aa`, `viseme_PP`, ...) and ARKit naming (`jawOpen`, `mouthSmile_L`, ...) for cross-model compatibility.
- KTX2 texture compression (Basis Universal) supported via `KTX2Loader` with transcoder.
- Two camera presets (standard + face close-up) with smooth exponential lerp transitions.

### Expression System

- The AS3 14-parameter per-bone expression system (`BoneRot`/`BoneMov` with inertia blending) was ported as a pure data model. In practice, morph targets on the GLTF model drive facial animation directly, bypassing the procedural bone system.
- Emotion singletons (joy, sadness, anger, etc.) and the `combine()` stub were removed as they were never wired to the UI.

### Real-Time Mic Pipeline

- **AudioWorklet** captures microphone PCM at 44.1 kHz, sends 882-sample chunks (~20 ms) to the main thread.
- **Ring buffer** (1676 samples = window + step) replaces the original rolling `Float32Array` to avoid O(n) reallocation per tick.
- Voice Activity Detection at 0.025 energy threshold gates the LPC→NN→decode chain.
- `getUserMedia` timeout (5 s) and `AudioContext.resume()` guard against browser autoplay policy.

### Dead Code Removed

- `AvatarEye`, `AvatarMouth`, `AvatarNeck` classes (312 lines) — the procedural bone system was entirely bypassed by the morph-target GLTF path.
- Five no-op stubs: `blink()`, `gaze()`, `reset()`, `openMouth()`, `closeEyes()`, `openEyes()`.
- Blink timer and emotion dead state removed from the update loop.
- Orphaned `streamingProcessor.ts` module (128 lines) — a duplicate of the inline ring-buffer processor in `main.ts`.

---

## Repository Restructure

The repository was reorganised to make TypeScript the primary codebase:

```
LipSync/                          ← Repo root (TypeScript)
├── src/                          ← TypeScript source
├── public/                       ← Static assets (models, samples, basis)
├── ground-truth/                 ← Test vectors (4 JSON files)
├── reference/
│   ├── as3/                      ← Original AS3 code archived
│   └── docs/                     ← Historical docs, audits
├── package.json, tsconfig.json, vite.config.ts, vitest.config.ts
├── index.html
├── README.md, AGENTS.md, MIGRATION.md
└── LICENSE (Unlicense)
```

The original AS3 source, build configs, and runtime assets (MP3 samples, trained neural network) are preserved under `reference/as3/` for documentation.

---

## Testing

| Suite | Tests | Coverage |
|---|---|---|
| Core pipeline (LPC, NN, Phoneme, Audio) | 108 | Ground-truth validated at 1e-9 |
| Player integration | 27 | Temporal smoothing, pre-buffering, event dispatch |
| Expression system (TS port) | 50 | Inertia blending, range mapping, all edge cases |
| 3D avatar | 6 | Scene construction, state management |
| **Total** | **204** | 7 test files, all passing |

All four ground-truth JSON fixtures (LPC test vectors, NN weights, phoneme model, audio pipeline constants) are verified as part of the test suite.

---

## Deployment

The app is built with Vite and deployed to GitHub Pages via GitHub Actions on every push to `master`. The CI workflow builds with `--base=/LipSync/` for correct subdirectory asset resolution. The production build can also be served locally via `npx serve dist -l 30925`.

---

## Preservation Notes

- The AS3's original structural H1 neural network bug is preserved and documented in `src/core/nn.ts`.
- The LPC implementation includes two safety improvements over the AS3 original: zero-energy guard and vanishing-error early-stop, which prevent division-by-zero on silence and constant-input edge cases.
- The viseme encoding (MSB-first, 6-bit, threshold ≥ 0.5) matches the AS3 `PhonemeCollection.arrayToPhoneme`.
- Temporal smoothing logic (3-point outlier filter, prefer-next-fallback-prev semantics) matches the AS3 `setupBuffer`.
