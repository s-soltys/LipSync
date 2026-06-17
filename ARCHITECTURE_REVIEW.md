# LipSync-ts — Architecture & Design Review

**Review date:** 2026-06-17  
**Scope:** All TypeScript source under `/src/`, plus `public/audio-processor.js`  
**Method:** Static analysis of module imports, class hierarchies, SRP violation detection, dependency direction mapping

---

## 1. Overall Assessment

**Grade: B+** — The architecture is cleanly layered with proper dependency direction and no circular dependencies. The core signal-processing modules (LPC, NN, phoneme data model) are well-isolated pure functions. The 3D avatar module has good separation of concerns. **However**, the migration left behind **one critical dead-code/duplication issue**, **one loose coupling violation**, and several **minor modularity regressions** from the original AS3 structure.

---

## 2. Dependency Graph (Simplified)

```
main.ts ───────────────────────────────────────────────────┐
  │                                                         │
  ├── avatar3d/ ──── avatar.ts ──── modelLoader.ts ──┐     │
  │                    │             (loads GLTF)     │     │
  │                    └── expression.ts ─────────────┘     │
  │                      (pure data types, no Three.js)     │
  │                                                         │
  ├── player/ ─────── player.ts ──── audio.ts               │
  │                    │            (constants + VAD)       │
  │                    ├── core/lpc.ts                      │
  │                    └── core/phoneme.ts                  │
  │                                                         │
  └── core/ ────────── nn.ts ──── (no internal deps)        │
                       lpc.ts ── (no internal deps)         │
                       phoneme.ts (no internal deps)        │
```

**Direction is strictly one-way:** `core/` → `player/` → `main.ts` and `core/` ⊥ `avatar3d/`.  
Core modules have **zero** imports from player/ or avatar3d/. ✅

---

## 3. Critical Findings

### 🔴 CRITICAL: Duplicate StreamingProcessor — Dead Code + Code Duplication

| File | Lines | Issue |
|------|-------|-------|
| `src/main.ts` | 184–245 | Inline `StreamingProcessor` class (used by mic pipeline) |
| `src/player/streamingProcessor.ts` | 1–128 | Modular `StreamingProcessor` class (NEVER imported anywhere) |

**There are two independent `StreamingProcessor` implementations doing essentially the same thing:**

- **`src/main.ts` (inline):** Uses `feed(chunk)` API, ring buffer of `SAMPLES_PER_WINDOW + STEP_SAMPLES` (1676), delegates to `recognizePhoneme()` for window processing.
- **`src/player/streamingProcessor.ts` (module):** Uses `feedChunk(chunk)` API, ring buffer of `WINDOW_SIZE + STEP_SIZE` (also 1676), has its own inline LPC+NN pipeline via `analyze()`, `decode()`.

The modular version in `src/player/streamingProcessor.ts` is **dead code** — it is never imported by `main.ts` or any other file. The import declaration at the top of `main.ts` (`import { StreamingProcessor } from './player/streamingProcessor'`) does **not exist**. Instead, main.ts defines a separate class in the same file at line 184.

**Severity:** CRITICAL — The module exists but is unused. Any developer maintaining one will forget the other exists. Bug fixes or improvements to one won't propagate.

---

### 🔴 HIGH: Constants Duplication — Fragile Isolation

| File | Lines | Issue |
|------|-------|-------|
| `src/player/streamingProcessor.ts` | 17, 20, 23 | Redefines `WINDOW_SIZE = 794`, `STEP_SIZE = 882`, `VAD_THRESHOLD = 0.025` |
| `src/player/audio.ts` | 28, 34, 37 | Defines `SAMPLES_PER_WINDOW = 794`, `STEP_SAMPLES = 882`, `ACTIVATION_ENERGY = 0.025` |

These are the same constants with **different names** but identical values. If either changes independently, the pipeline produces wrong results. The dead-code `streamingProcessor.ts` should import from `audio.ts` (or a shared constants module).

**Severity:** HIGH — Silent numerical drift risk.

---

### 🟡 MEDIUM: Phoneme Interface Re-export Creates Unnecessary Coupling

| File | Line | Issue |
|------|------|-------|
| `src/player/player.ts` | 30 | `export type { Phoneme } from '../core/phoneme'` |
| `src/main.ts` | 19 | `import type { Phoneme } from './player/player'` |

`main.ts` imports `Phoneme` through `player.ts` instead of directly from `core/phoneme.ts`. This creates a transitive dependency where the audio pipeline module re-exports a core data model type, and the entry point accesses it through the pipeline rather than the data model directly. Prefer direct imports from `core/phoneme`.

---

### 🟡 MEDIUM: LipsyncPlayer.process() Is Synchronous — Blocks Main Thread

| File | Lines | Issue |
|------|-------|-------|
| `src/player/player.ts` | 268–280 | `process()` iterates all phoneme ticks synchronously |

For a 10-second audio file at 20ms steps, this calls `recognizePhoneme()` ~500 times in a single synchronous loop, running full LPC+NN inference each time. While the NN is tiny (3,250 weights), this could cause frame drops if the audio is long. The `playTestAudio()` in main.ts mitigates this via `setTimeout` scheduling, but the computation itself is unbounded synchronous work.

**Severity:** MEDIUM for the use case, but architecturally notable.

---

### 🟡 MEDIUM: Missing Shared Constants Module

| File | Lines | Issue |
|------|-------|-------|
| `src/player/audio.ts` | 10–37 | Audio pipeline constants (SR, window size, step, decimation) |
| `src/core/nn.ts` | — | No constants; depends on caller passing values |
| `src/player/streamingProcessor.ts` | 14–23 | Repeats same constants |
| `src/main.ts` | 202 | Inline StreamingProcessor uses `SAMPLES_PER_WINDOW` (imported) but redefines buffer size logic |

The original AS3 had `LipsyncSettings.as` as a centralized configuration singleton. The TypeScript migration scattered these constants across `audio.ts` and `streamingProcessor.ts`. A dedicated `core/config.ts` or `settings.ts` would restore the original's clean separation.

---

## 4. Module-by-Module Analysis

### `src/core/phoneme.ts` — ✅ Excellent

- **SRP:** ✅ Single responsibility — phoneme data model + binary encoding/decoding
- **Cohesion:** High — all functions operate on the Phoneme type
- **Coupling:** None — zero imports from other modules
- **Exports:** Clean interface, named constants, pure functions
- **Notes:** 199 lines, well-documented, ground-truth compatibility functions are a nice touch

### `src/core/lpc.ts` — ✅ Excellent

- **SRP:** ✅ Single responsibility — LPC analysis via autocorrelation + Durbin-Levinson
- **Cohesion:** High — all functions are part of the same analysis pipeline
- **Coupling:** None — zero imports from other modules
- **Exports:** Single public `analyze()` function, internal functions `computeAutocorrelation` and `computeCoef`
- **Notes:** 170 lines, clear separation between public API and internal implementation. Proper guard clauses for edge cases (zero energy, vanishing error).

### `src/core/nn.ts` — ⚠️ Good (with preserved bug)

- **SRP:** ✅ Single responsibility — neuron forward pass + network state factory
- **Cohesion:** High — all types and functions relate to NN inference
- **Coupling:** None — zero imports from other modules
- **Notes:** The structural bug (H1 reading only 9 of 50 inputs from H0) is **documented and intentional** for backward compatibility. This is a legitmate preservation choice. 196 lines.

### `src/player/audio.ts` — ✅ Good

- **SRP:** ✅ Single purpose — audio window extraction, decimation, energy computation
- **Cohesion:** High — constants + extraction + decimation + VAD
- **Coupling:** Low — no imports from core/ or other player/ modules
- **Notes:** 131 lines. Clean, well-typed. However, the interface name `LipsyncBufferItem` (line 44) conflicts conceptually with `PlayerBufferItem` in `player.ts` (these are different types).

### `src/player/player.ts` — ⚠️ Overloaded

- **SRP:** ⚠️ **Violated** — this file contains FOUR distinct responsibilities:
  1. `LipsyncPlayer` class (event dispatching orchestrator)
  2. `recognizePhoneme()` function (single-window pipeline)
  3. `temporalSmoothing()` function (post-processing)
  4. `preparePhonemeBuffer()` function (pre-computation loop)
  - Plus re-exports from other modules (lines 30–32)
- **Cohesion:** Medium — they're all part of the general "phoneme recognition pipeline" but separable
- **Coupling:** Moderate — depends on `./audio`, `core/lpc`, `core/phoneme`
- **Suggestion:** Extract `recognizePhoneme` + `preparePhonemeBuffer` + `temporalSmoothing` into a separate `pipeline.ts` file. Keep `LipsyncPlayer` as pure event-dispatch orchestration.

### `src/player/streamingProcessor.ts` — 🔴 Dead Code

- See Critical Finding #1. Not imported anywhere.
- **SRP:** ✅ in isolation — single-purpose real-time processing
- **But:** Completely unused. The `WINDOW_SIZE`/`STEP_SIZE`/`VAD_THRESHOLD` constants duplicate `audio.ts`.

### `src/avatar3d/expression.ts` — ✅ Excellent

- **SRP:** ✅ Single responsibility — expression data model (bone parameters, features, expressions, collection)
- **Cohesion:** High — all classes are part of the expression system
- **Coupling:** None — zero imports from other modules. No Three.js dependency.
- **Notes:** 386 lines, but logically divided into: BoneParameter (89 lines), ExpressionParameter (38 lines), AvatarFeature (68 lines), AvatarExpression (75 lines), ExpressionsCollection (37 lines). Each class has clear purpose. The abstract `BaseBoneParameter` avoids code duplication between `BoneRot` and `BoneMov`. A model of clean data modeling.

### `src/avatar3d/modelLoader.ts` — ⚠️ Overloaded

- **SRP:** ⚠️ **Violated** — this file handles:
  1. GLTF/GLB file loading + KTX2 texture support (lines 113–215)
  2. Morph target name extraction (lines 55–85)
  3. Viseme morph weight application with ARKit + RPM naming fallback (lines 289–383)
  4. Blink morph application (lines 388–400)
  5. Naming convention conversion (lines 222–228, 268–282)
- **Cohesion:** Medium — all relate to 3D model management, but morph application is a distinct runtime concern from loading
- **Coupling:** Low — imports only `./expression` (type) and `three`
- **Suggestion:** Split into `modelLoader.ts` (loading + extraction) and `morphApplier.ts` (runtime morph weight logic)
- **Notes:** 400 lines — the largest non-main module. The `applyVisemeMorphs` function alone is ~95 lines with a 9-case switch.

### `src/avatar3d/avatar.ts` — ✅ Good

- **SRP:** ✅ Single responsibility — manages Three.js scene lifecycle (camera, lights, renderer, animation loop, model reference)
- **Cohesion:** High — all methods relate to the 3D scene
- **Coupling:** Moderate — depends on `./modelLoader` and `./expression`. Does NOT depend on `core/` or `player/`
- **Notes:** 270 lines. Clean delegation: `loadModel()` delegates to `modelLoader`, `setViseme()` stores state for `update()` to apply. Camera preset cycling with lerp is nicely self-contained.

### `src/main.ts` — ⚠️ Large Entry Point (God Controller Pattern)

- **SRP:** N/A for entry point — but it's doing too much:
  1. Application bootstrap (lines 569–649)
  2. Audio playback orchestration (lines 251–314)
  3. Microphone capture + AudioWorklet management (lines 336–492)
  4. StreamingProcessor inline class (lines 184–245)
  5. Synthetic audio generator (lines 102–151)
  6. UI wiring and event handlers (lines 540–563)
  7. FPS counter / UI tick (lines 498–520)
  8. Sample pre-loading (lines 79–96)
  9. Viseme dispatch (lines 157–170)
  10. Camera cycling (lines 320–323)
- **Coupling:** High — imports from every module except `modelLoader`
- **Size:** 649 lines
- **Suggestion:** Consider extracting microphone management → `micController.ts` and audio playback → `playbackController.ts`

---

## 5. AS3 Migration Assessment

| Concern | AS3 Original | TypeScript Migration | Assessment |
|---------|-------------|---------------------|------------|
| Total class count | ~35 files | 10 files + 1 entry | ✅ Good simplification |
| Expression model | AvatarExpression + ExpressionParameter in separate files | Merged into `expression.ts` | ⚠️ Acceptable, 386 lines |
| Settings singleton | `LipsyncSettings.as` | Scattered across `audio.ts`, `streamingProcessor.ts` | 🔴 Regressed — no centralized config |
| Event types | `LipsyncEvent.as` | Inline types in `player.ts` | 🟡 Minor regression |
| Buffer item | `LipsyncBufferItem.as` | Interface in `audio.ts` + inline in test | 🟡 Acceptable |
| Training pipeline | Full training classes + generators | Removed entirely | ✅ Correct (runtime only) |
| Scene/UI classes | `AvatarScene.as`, editor, test scenes | Replaced by direct Three.js + inline HTML | ✅ Correct |
| Util classes | 6 utility classes | Replaced by fetch + typed JSON | ✅ Correct |
| Avatar class hierarchy | AvatarCore → AvatarAnimator → AvatarBuilder | Single Avatar3D class | ✅ Good simplification |
| Bone hierarchy | Separate files for BoneRot, BoneMov, BoneParameter | Single `expression.ts` | ✅ Good |

**Key Regression:** The original `LipsyncSettings.as` served as a single source of truth for all pipeline constants. The TS migration scattered these constants, creating the duplication risk identified above.

---

## 6. Cohesion & Coupling Summary

| Module | Cohesion | Coupling (outbound) | Coupling (inbound) | Grade |
|--------|----------|-------------------|-------------------|-------|
| core/phoneme.ts | High | None (0 deps) | player.ts, main.ts | ✅ A |
| core/lpc.ts | High | None (0 deps) | player.ts, streamingProcessor.ts | ✅ A |
| core/nn.ts | High | None (0 deps) | main.ts | ✅ A |
| player/audio.ts | High | None (0 deps) | player.ts, main.ts | ✅ A- |
| player/player.ts | Medium | 3 deps (audio, lpc, phoneme) | main.ts | ⚠️ B- |
| player/streamingProcessor.ts | High | 2 deps (lpc, phoneme) | **NONE** (dead code) | 🔴 F |
| avatar3d/expression.ts | High | None (0 deps) | avatar.ts, modelLoader.ts | ✅ A |
| avatar3d/modelLoader.ts | Medium | 2 deps (expression, three) | avatar.ts | ⚠️ B |
| avatar3d/avatar.ts | High | 3 deps (modelLoader, expression, three) | main.ts | ✅ B+ |
| main.ts | Low (by nature) | 7+ deps | **NONE** (entry point) | ⚠️ B- |

---

## 7. Circular Dependency Check

**Result: NONE — No circular dependencies found.** ✅

The import graph is a directed acyclic graph (DAG):
- `core/*` → nothing
- `player/*` → `core/*` only
- `avatar3d/*` → only within avatar3d/
- `main.ts` → everything (sink node)

---

## 8. God Object / God Function Check

| Candidate | File:Line | Severity | Rationale |
|-----------|-----------|----------|-----------|
| `main.ts` (entire file) | `src/main.ts:1–649` | 🟡 Medium | Entry point, but 649 lines with 10 responsibilities is too many |
| `modelLoader.ts:applyVisemeMorphs` | `src/modelLoader.ts:289–383` | 🟡 Low | Large function but tightly scoped to morph application |
| `modelLoader.ts:loadModel` | `src/modelLoader.ts:113–215` | 🟡 Low | Complex but justified for model loading |
| `main.ts:startMic` | `src/main.ts:336–436` | 🟡 Medium | ~100 lines with 7 sequential steps — could be a `MicController` class |

No true "god objects" (classes that know everything about the system). The `Avatar3D` class and `main.ts` are the closest candidates, but both are appropriately scoped for their role.

---

## 9. Leaky Abstractions

| Issue | File:Line | Severity |
|-------|-----------|----------|
| `modelLoader.ts` accesses `(mesh as any).morphTargetDictionary` | `modelLoader.ts:63` | 🟡 Low — Three.js type quirk, not a design leak |
| `main.ts` accesses `(import.meta as any).env?.BASE_URL` | multiple | 🟡 Low — Vite typing workaround |
| `audio.ts:LipsyncBufferItem` is NOT the same as `player.ts:PlayerBufferItem` despite similar name | `audio.ts:44, player.ts:45` | 🟡 Medium — naming collision between two different types |

---

## 10. Summary of File:Line Findings

| # | Severity | File | Line(s) | Description |
|---|----------|------|---------|-------------|
| 1 | 🔴 CRITICAL | `src/main.ts` + `src/player/streamingProcessor.ts` | 184–245, 1–128 | **Duplicate StreamingProcessor** — modular version is dead code, inline version used instead |
| 2 | 🔴 HIGH | `src/player/streamingProcessor.ts` | 17–23 | **Constants duplication** — WINDOW_SIZE, STEP_SIZE, VAD_THRESHOLD repeat audio.ts values with different names |
| 3 | 🟡 MEDIUM | `src/player/player.ts` | 30 | **Transitive type re-export** — Phoneme re-exported from core instead of main.ts importing directly |
| 4 | 🟡 MEDIUM | `src/player/player.ts` | 89–179 | **Overloaded file** — recognizer, pre-buffer, smoothing all in same file as LipsyncPlayer class |
| 5 | 🟡 MEDIUM | `src/player/player.ts` | 268–280 | **Synchronous pipeline** — process() blocks for full audio length (500+ NN inferences) |
| 6 | 🟡 MEDIUM | `src/avatar3d/modelLoader.ts` | 289–383 | **Overloaded module** — morph application (runtime) mixed with model loading (bootstrap) |
| 7 | 🟡 MEDIUM | `src/audio.ts:44` vs `src/player.ts:45` | Naming collision | `LipsyncBufferItem` (audio.ts, samples+energy) vs `PlayerBufferItem` (player.ts, phoneme+position+energy+samples) |
| 8 | 🟡 MEDIUM | `src/main.ts` | 1–649 | **Monolithic entry point** — 10 distinct responsibilities, 649 lines |
| 9 | 🟡 MEDIUM | Missing | N/A | **No shared config module** — constants scattered across audio.ts, streamingProcessor.ts, main.ts |
| 10 | 🟢 LOW | `src/main.ts` | 102–151 | **Synthetic audio generator** in entry point — belongs in a utility module |
| 11 | 🟢 LOW | `src/main.ts` | 184–245 | **StreamingProcessor defined inline** — should import from existing module instead |
| 12 | 🟢 LOW | `src/main.ts` | 336–492 | **Mic management** (~157 lines) in entry point — extract to dedicated controller |
| 13 | 🟢 LOW | `src/avatar3d/modelLoader.ts` | 222–228 | **Naming conversion utility** (`alternateMorphName`) could be extracted |
| 14 | 🟢 LOW | `src/core/nn.ts` | 6–12 | **Preserved structural bug** — H1 reads only 9 of 50 H0 outputs. Documented as intentional. |

---

## 11. Recommendations (Priority Order)

1. **🔴 IMMEDIATE:** Wire `src/player/streamingProcessor.ts` into `main.ts` and delete the inline class. This resolves the duplication issue.
2. **🔴 IMMEDIATE:** Import constants from `audio.ts` into `streamingProcessor.ts` instead of redefining them. Or create `core/config.ts`.
3. **🟡 SOON:** Extract `recognizePhoneme`, `preparePhonemeBuffer`, `temporalSmoothing` from `player.ts` into a `player/pipeline.ts` module.
4. **🟡 SOON:** Split `modelLoader.ts`: keep loading in `modelLoader.ts`, extract morph application into `morphApplier.ts`.
5. **🟡 SOON:** Create `core/config.ts` with all pipeline constants (SR, window, step, decimation, VAD threshold) — single source of truth.
6. **🟡 NEXT:** Extract mic management from `main.ts` into `player/micController.ts`.
7. **🟢 NICE-TO-HAVE:** Change `main.ts` import of `Phoneme` to direct import from `core/phoneme.ts`.
8. **🟢 NICE-TO-HAVE:** Extract synthetic audio generator to `player/syntheticAudio.ts`.
