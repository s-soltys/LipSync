# LipSync — Architecture Reference

## Overview

LipSync is a real-time 3D facial animation system driven by speech audio. The repo is a **TypeScript rewrite** (primary) of an original **ActionScript 3** application. It performs LPC analysis → NN classification → viseme morph targets on a Three.js 3D avatar.

## Source Layout

- **TypeScript source**: `/src/`
- **Build output**: `/dist/` (gitignored)
- **Static assets**: `/public/`
- **Test vectors**: `/ground-truth/`
- **Original AS3 reference**: `/reference/as3/`
- **Historical docs**: `/reference/docs/`

## Build & Test

```bash
npm install          # Install dependencies
npm run build        # Vite production build → dist/
npm run build:tsc    # TypeScript type check (tsc --noEmit)
npm run dev          # Vite dev server
npm test             # Run all 204 tests (Vitest)
npm run test:watch   # Watch mode
npx serve dist -l 30925   # Serve built app
```

## Key Constraints

| Package | Version |
|---------|---------|
| `three` | ^0.184.0 |
| `@types/three` | ^0.184.1 |
| `vite` | ^6.0.0 |
| `vitest` | ^3.0.0 |
| `typescript` | ^5.9.0 |

- **Module system**: ES2022 modules, bundler module resolution
- **Target**: ES2022 (modern browsers)
- **Config files**: `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`

## Structural Bug (Preserved from AS3)

In `/src/core/nn.ts`, both hidden layers H0 and H1 are created with `size = LP.order = 9` (the number of LPC coefficients) instead of H1 receiving `neuronsPerLayer` (50). This means:

- H0 outputs 50 values (one per neuron)
- H1 reads only the first 9 values as inputs (since each neuron has `size = 9`)
- H0 neurons beyond index 8 are **functionally dead** in the forward pass — their outputs are computed but never consumed

This bug is **intentionally preserved** to maintain bit-exact backward compatibility with the original AS3 implementation. See the JSDoc in `nn.ts` for full details.

## Camera System

Two camera presets with smooth lerp transitions:

| Preset | Position | Target | FOV |
|--------|----------|--------|-----|
| Standard | (0, 12, 15) | (0, 10, 0) | 60° |
| Face | (0, 13, 4.5) | (0, 13, 0) | 45° |

Cycle with `avatar.cycleCameraPreset()`. Transition duration ~3 seconds with exponential easing.

## Morph Targets

- **brunette.glb** (Ready Player Me): 72 morph targets including RPM viseme shapes (`viseme_sil`, `viseme_aa`, `viseme_PP`, etc.) and ARKit blendshapes
- **facecap.glb**: 52 ARKit-style morph targets (`jawOpen`, `mouthSmile_L`, etc.)

The system supports both **RPM naming** (e.g., `mouthSmileLeft`) and **ARKit naming** (e.g., `mouthSmile_L`) with automatic fallback via `alternateMorphName()`.

## Microphone Pipeline

- **AudioWorklet** (`/public/audio-processor.js`) captures mic input
- **Ring buffer** (1676 samples = 794 window + 882 step) handles chunk boundaries
- **VAD threshold**: 0.025 (energy-based)
- The pipeline bypasses `LipsyncPlayer` — direct processing via the inline `StreamingProcessor` in `src/main.ts`
- Each 20ms chunk runs LPC+NN through `recognizePhoneme()` which handles VAD and decimation correctly

## Deployment

The app is automatically deployed to **GitHub Pages** on pushes to `master` via GitHub Actions:

**https://s-soltys.github.io/LipSync/**

```bash
npm run build
npx serve dist -l 30925
```

The Vite config sets `base` to `/LipSync/` for the production build.

## Reference Files

- `/reference/docs/as3-architecture.md` — Original architecture
- `/reference/docs/RESEARCH.md` — Background research
- `/reference/docs/NN_FORWARD_PASS_AUDIT.md` — NN audit
- `/reference/docs/REALTIME_ANALYSIS.md` — Pipeline analysis
- `/reference/as3/` — Full AS3 source (2011, Away3D + Flex)
