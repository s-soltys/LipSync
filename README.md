# LipSync — Real-Time 3D Facial Animation from Audio

![build](https://img.shields.io/badge/build-passing-brightgreen)
![license](https://img.shields.io/badge/license-Unlicense-blue)

LipSync generates real-time 3D facial animations from speech audio. It performs **LPC (Linear Predictive Coding) analysis** on 44.1 kHz audio, classifies the resulting feature vectors through a **neural network** into viseme categories, and drives **morph targets** on a 3D avatar.

Originally authored in 2011 as an **ActionScript 3 / Away3D / Flex** application, this repository is the **modern TypeScript rewrite** using **Three.js** and **Vite**.

---

## How It Works

```
Audio (44.1 kHz PCM)
  └─► 20 ms windows (794 samples)
        └─► LPC analysis → 9 reflection coefficients
              └─► Neural Network (50→50→6) → 6-bit binary vector
                    └─► Decode → Phoneme (v1–v9, silence)
                          └─► 10 viseme morph targets → 3D avatar
```

### Audio Pipeline

| Component | Detail |
|-----------|--------|
| Sample rate | 44.1 kHz |
| Window size | 18 ms (794 samples) |
| Step interval | 20 ms (882 samples, `STEP_SAMPLES`) |
| Decimation | Stride-7 downsampling (keep every 7th sample) |
| LPC order | 9 reflection coefficients (PARCOR) |
| VAD threshold | Energy ≥ 0.025 activates recognition |
| NN architecture | 2 hidden layers × 50 neurons, 6 output bits |
| Viseme classes | 10 (v1–v9 + silence) |

### 3D Rendering

- **Three.js** (r184) with WebGL renderer
- **GLTF/GLB** model loading via `GLTFLoader` + KTX2 texture support
- Primary model: **Ready Player Me brunette.glb** (72 morph targets)
- Fallback model: **facecap.glb** (52 ARKit-style morph targets)
- Morph targets support both **RPM naming** (`viseme_aa`, `viseme_PP`, ...) and **ARKit naming** (`jawOpen`, `mouthSmile_L`, ...)
- 2 camera presets with smooth lerp transitions
- Eye bone rotation + blink morph animation

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run all tests
npm test

# TypeScript type check
npm run build:tsc

# Preview production build
npx serve dist -l 30925
```

---

## Project Structure

```
LipSync/
├── src/                          # TypeScript source
│   ├── main.ts                   # Entry point — UI, scene setup, mic pipeline
│   ├── core/
│   │   ├── lpc.ts                # LPC analysis (Durbin-Levinson recursion)
│   │   ├── nn.ts                 # Neural network (forward pass, sigmoid activation)
│   │   └── phoneme.ts            # Phoneme data model, encoding/decoding
│   ├── player/
│   │   ├── player.ts             # LipsyncPlayer — pipeline orchestrator
│   │   ├── audio.ts              # Audio extraction, decimation, VAD
│   │   └── streamingProcessor.ts # Real-time ring-buffer streaming processor
│   ├── avatar3d/
│   │   ├── avatar.ts             # Avatar3D — scene, camera, render loop
│   │   ├── modelLoader.ts        # GLTF/GLB loader, morph target binding
│   │   └── expression.ts         # Expression data model (14-parameter system)
│   └── __tests__/                # Vitest unit & integration tests
│       ├── lpc.test.ts           # LPC analysis (19 tests)
│       ├── nn.test.ts            # NN forward pass (12 tests)
│       ├── phoneme.test.ts       # Phoneme encoding/decoding (39 tests)
│       ├── audio.test.ts         # Audio pipeline (38 tests)
│       ├── player.test.ts        # Player integration (27 tests)
│       ├── expression.test.ts    # Expression system (50 tests)
│       └── avatar3d-avatar.test.ts # 3D avatar tests (6 tests)
├── public/                       # Static assets
│   ├── models/
│   │   ├── brunette.glb          # Ready Player Me avatar (72 morph targets)
│   │   └── facecap.glb           # Face Cap model (52 morph targets)
│   ├── samples/                  # Test speech audio files
│   ├── basis/                    # KTX2 transcoder (WASM)
│   └── audio-processor.js        # AudioWorklet processor (mic capture)
├── ground-truth/                 # JSON test vectors (verified at 1e-9 tolerance)
│   ├── audio-pipeline.json
│   ├── lpc-test-vectors.json
│   ├── nn-weights.json
│   └── phoneme-model.json
├── reference/
│   ├── as3/                      # Original AS3 source (Away3D, Flex)
│   │   ├── src/
│   │   ├── lib/
│   │   └── obj/
│   └── docs/                     # Historical documentation
│       ├── as3-architecture.md
│       ├── RESEARCH.md
│       ├── NN_FORWARD_PASS_AUDIT.md
│       └── REALTIME_ANALYSIS.md
├── package.json                  # Dependencies & scripts
├── tsconfig.json                 # TypeScript config
├── vite.config.ts                # Vite build config
├── vitest.config.ts              # Vitest test config
├── index.html                    # App shell
└── LICENSE                       # Unlicense (Public Domain)
```

---

## Tests

**204 tests** — all passing across 7 test files using **Vitest 3**.

- LPC analysis verified against 4 ground-truth JSON files
- Neural network forward pass validated at 1e-9 floating-point tolerance
- Phoneme encoding/decoding covers all 19 phoneme symbols
- Audio pipeline tests cover VAD, decimation, energy computation
- Player integration tests cover temporal smoothing, pre-buffering, event dispatch

```bash
npm test          # Run all tests
npm run test:watch  # Watch mode
```

---

## Deployment

The production build is deployed at:

**[https://lipsync-app.szymon-ai.cc](https://lipsync-app.szymon-ai.cc)**

Deployment process:
```bash
npm run build
npx serve dist -l 30925
```

The Vite config includes `allowedHosts` for `lipsync-app.szymon-ai.cc` and copies `ground-truth/` into the build output via a custom plugin.

---

## Reference

- **[`/reference/docs/`](reference/docs/)** — Architecture documents, research notes, audit reports
- **[`/reference/as3/`](reference/as3/)** — Original ActionScript 3 source code (2011, Away3D + Flex)

Key reference documents:
- [`as3-architecture.md`](reference/docs/as3-architecture.md) — Original architecture walkthrough
- [`NN_FORWARD_PASS_AUDIT.md`](reference/docs/NN_FORWARD_PASS_AUDIT.md) — Neural network pass audit
- [`REALTIME_ANALYSIS.md`](reference/docs/REALTIME_ANALYSIS.md) — Real-time pipeline analysis
- [`RESEARCH.md`](reference/docs/RESEARCH.md) — Background research notes

---

## License

This project is **public domain** under the [Unlicense](LICENSE).

```
This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any means.
```

See the [`LICENSE`](LICENSE) file for the full text.
