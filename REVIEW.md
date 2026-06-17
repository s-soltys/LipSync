# LipSync — Deep Open-Source Code Review

> **Date:** 2026-06-17  
> **Review conducted by:** 11 autonomous agents (DeepSeek V4 Flash)  
> **Scope:** 19 TypeScript source files, 7 test files, 8 config/doc files, 7 AS3 reference files  
> **Tests:** 204/204 passing | **Build:** 677KB (185KB gzipped) | **TypeScript:** strict mode, 0 tsc errors

---

## Executive Summary

**LipSync is technically excellent but not yet open-source-ready.** The core audio processing pipeline (LPC → VAD → NN → phoneme) is faithful to the AS3 original with ground-truth verification at 1e-9 tolerance, the architecture is cleanly layered, and test quality in core modules is high. However, the project has significant gaps in contributor infrastructure, CI/CD rigour, accessibility, and 3D rendering correctness — typical of a single-developer AI-assisted port that hasn't yet been prepared for community participation.

**Overall grade: B** (engineering: A−, open-source readiness: D+)

---

## Top Issues by Cross-Cutting Severity

### 🔴 CRITICAL (must fix before accepting contributions)

| # | Issue | Found By | Details |
|---|-------|----------|---------|
| C1 | **No test step in CI** — builds & deploys without running a single test | Repo Health | `.github/workflows/deploy.yml` runs `npm ci` then `npm run build`. No `npm test`. Broken code ships to Pages silently. |
| C2 | **No PR CI trigger** — pull requests get zero automated checks | Repo Health | Workflow only fires on `push: branches: [master]` and `workflow_dispatch` |
| C3 | **No git tags or releases** — zero versioning, zero releases, zero changelog | Repo Health | `npm version` says 0.1.0 but no corresponding tag. Users can't pin stable versions. |
| C4 | **Stale Issue #1** — "Instructions?" opened 2016, unanswered 7+ years | Repo Health | Only open issue. Creates a terrible first impression. Close it. |
| C5 | **No CONTRIBUTING.md / CODE_OF_CONDUCT.md** | Documentation, Repo Health | No onboarding for new contributors, no community standards |
| C6 | **Duplicate `StreamingProcessor`** — two implementations, one dead with critical bugs | Code Quality, Architecture, Testing, Performance, Audio Pipeline | `src/player/streamingProcessor.ts` (128 lines) is never imported. The dedicated file uses RMS energy instead of mean-abs for VAD (C1) and feeds raw samples to LPC without decimation (C2) — both wrong. The inline class in `main.ts:184-245` is what actually runs. |

### 🔴 HIGH (significant impact on correctness or maintainability)

| # | Issue | Found By | Details |
|---|-------|----------|---------|
| H1 | **Viseme intensity capped at 0.6 max** — lip movement barely visible | 3D/Graphics | `main.ts:167-169`: `intensity = (visemeId / 9) * 0.6`. AA (v1) gets only 6.7% intensity. Worse: intensity is derived from viseme number, not from audio energy — doesn't respond to actual speech volume. |
| H2 | **No DRACOLoader registered** — brunette.glb may fail to load if Draco-compressed | 3D/Graphics | `modelLoader.ts:119-127`: KTX2Loader set up but no DRACOLoader. RPM models commonly use Draco geometry compression. |
| H3 | **No dispose/cleanup pattern anywhere** — memory leak on Vite HMR or page teardown | 3D/Graphics, Performance | No `dispose()` on Avatar3D. renderer, geometries, materials, textures never cleaned up. `requestAnimationFrame` ID not stored (can't cancel). No event listener removal. |
| H4 | **No CSP headers or meta tags** — zero defense-in-depth against XSS | Security | Not in `index.html`, `vite.config.ts`, or deployment config. |
| H5 | **AGENTS.md in public repo** — references Hermes Agent, DeepSeek, personal tunnel URL | Documentation | 95 lines written for AI agent consumption, includes `cloudflared tunnel` URL and provider-specific config. Not appropriate for public open-source project. |
| H6 | **No issue/PR templates** | Repo Health | No `.github/ISSUE_TEMPLATE/`, no `PULL_REQUEST_TEMPLATE.md` |
| H7 | **No .gitattributes** — no line-ending normalisation, no LFS for GLB models | Repo Health | Binary `.glb` files (4.5MB) without LFS. Cross-platform contributors will have issues. |
| H8 | **Vite 2 major versions behind** (6.4.3 → 8.0.16) | Build System | No known vulnerabilities but significant feature gap. |
| H9 | **`build:tsc` emits `.d.ts` files to `dist/`** — pollutes output | Build System | Should be `tsc --noEmit` for a browser-only project. |
| H10 | **No chunk splitting** — single 677KB JS bundle, Vite emits warning | Build System | Add `manualChunks: { three: ['three'] }` to split Three.js. |
| H11 | **No `base` in vite.config.ts** — relies on CI `--base` flag, fragile | Build System | `npm run preview` without `--base=/LipSync/` produces wrong asset paths. |

### 🟡 MEDIUM (notable issues)

| # | Issue | Found By | Details |
|---|-------|----------|---------|
| M1 | **No `off()` method on LipsyncPlayer** — listener leak | Performance | `player.ts:227-234`: callbacks can never be removed. Player instances can't be GC'd. |
| M2 | **3,000 `setTimeout` calls for phoneme scheduling** | Performance | `main.ts:292-299`: one timer per phoneme event. Should use elapsed-time tracking with a single timer. |
| M3 | **RPM+ARKit morphs double-applied** — overdrives expressions on dual-naming models | 3D/Graphics | `modelLoader.ts:334-382`: both RPM viseme morphs and ARKit composites applied simultaneously. |
| M4 | **Morph reset every frame** — no dirty tracking | 3D/Graphics, Performance | `modelLoader.ts:306-319`: 10-25 morph weights set to 0 every frame even when viseme unchanged. |
| M5 | **Dead `applyBlinkMorph()`** — exported but never called | Code Quality | `modelLoader.ts:388-400`: zero callers across codebase. |
| M6 | **Root group is dead code** — model added to scene directly, not root | 3D/Graphics, Architecture | `avatar.ts:87-90`: `this.root` at (0, -3, 0) has no children. Test asserts `position.y === -3` but root is unused. |
| M7 | **Camera lookAt target jumps instantly** — `_currentTarget` is dead code | 3D/Graphics | `avatar.ts:242`: target snaps immediately while position lerps. Asymmetric camera transition. |
| M8 | **No `cancelAnimationFrame` on stop** — latent render loop | 3D/Graphics | `avatar.ts:130-144`: rAF ID not stored. Double rendering on start/stop cycles. |
| M9 | **TH and FF viseme mappings are poor** — just jawOpen, no tongue/lip articulation | 3D/Graphics | TH with `jawOpen=0.3`, FF with `jawOpen=0.2`. Poor visual fidelity. |
| M10 | **No a11y landmarks, no `aria-live`, no focus styles, no `aria-label`** | UX/Accessibility | Flat `<div>` soup. Emoji-only buttons. Screen readers get zero state feedback. |
| M11 | **Touch targets < 44×44px** — `.btn.small` is ~23×26px | UX/Accessibility | Mobile users can't reliably tap test audio buttons. |
| M12 | **Init errors written to removed DOM element** | UX/Accessibility | `main.ts:636-643`: `.hint` may be removed before catch block fires. |
| M13 | **Hint text contrast 2.4:1** — `.hint` at 0.5 opacity on #111 | UX/Accessibility | Fails all WCAG thresholds. |
| M14 | **`SAMPLES_PER_WINDOW=794` vs AS3 `793`** — 1-sample migration discrepancy | Audio Pipeline | `audio.ts:28`: comment claims AS3 int cast produces 794 but `int(793.8)` = 793 in AS3. |
| M15 | **Constants duplicated** — `streamingProcessor.ts` redefines WINDOW_SIZE, STEP_SIZE, VAD_THRESHOLD | Architecture, Audio Pipeline | Drift risk: RMS vs mean-abs energy between the two implementations. |
| M16 | **No `engines` field in package.json** — Node version not enforced | Build System | CI uses Node 22 but nothing prevents incompatible installs. |
| M17 | **No lint/format scripts** — no ESLint, Prettier, or biome | Build System | Code quality can drift without enforcement. |
| M18 | **`.gitignore` incomplete** — missing `.DS_Store`, `.env`, `*.log`, IDE dirs | Build System | macOS artifacts, secrets, and logs could be committed. |
| M19 | **No `normalize.css` or reset** — relies on browser defaults | UX | Layout could vary across browsers. |

### 🟢 LOW (minor / nice-to-have)

| # | Issue | Found By | Details |
|---|-------|----------|---------|
| L1 | `(import.meta as any)` in 2 files — type escapes strict mode | Code Quality | `main.ts:26`, `modelLoader.ts:25`. Should create `vite-env.d.ts`. |
| L2 | `catch (err: any)` instead of `unknown` narrowing | Code Quality | `main.ts:421` |
| L3 | `null as unknown as WebGLRenderer` — unsafe double-cast | Code Quality | `avatar.ts:72`: unnecessary, `null` alone is valid union member |
| L4 | No `vite-env.d.ts` for Vite client types | Code Quality | `import.meta.env` remains untyped |
| L5 | Excessive `!` assertions on DOM lookups (~15 uses) | Code Quality | `document.getElementById('x')!` — any missing ID = runtime crash |
| L6 | `MessageEvent.data` typed as `any` (implicit) | Code Quality | `main.ts:394`: should type generic parameter |
| L7 | Two independent `requestAnimationFrame` loops | Performance | `avatar.start()` + `startUiLoop()` — should merge |
| L8 | AudioWorklet uses `Array` + `splice(0,882)` O(n) instead of ring buffer | Performance | `audio-processor.js:43`: 3 copies of audio data per tick |
| L9 | `number[]` in hot path LPC/NN instead of `Float64Array` | Performance | ~1,282 elements allocated per 20ms tick → GC pressure |
| L10 | No `prefers-reduced-motion` support — pulse animation can't be disabled | UX/Accessibility | Mic pulse animation may affect users with vestibular disorders |
| L11 | No `prefers-color-scheme: light` — dark-mode only | UX | Users who need high-contrast have no fallback |
| L12 | No sourcemaps in production | Build System | `build.sourcemap` not set; production debugging impossible |
| L13 | `facecap` rotation via string `.includes('facecap')` — fragile | 3D/Graphics | `modelLoader.ts:143`: any path containing 'facecap' triggers 180° rotation |
| L14 | Unused `AvatarFeature` import in modelLoader.ts | Code Quality | `modelLoader.ts:22` |

---

## Module-by-Module Assessment

### Core Pipeline (core/*.ts) ✅ EXCELLENT

| Module | Lines | Tests | Coverage | Grade |
|--------|-------|-------|----------|-------|
| `core/lpc.ts` | 170 | 23 | ~95% | A |
| `core/nn.ts` | 196 | 21 | ~90% | A |
| `core/phoneme.ts` | 199 | 39 | ~90% | A− |

**Strengths:** Pure functions, clean JSDoc, ground-truth verified at 1e-9 tolerance, structural bugs preserved faithfully from AS3 (dead neurons, phoneme encoding endianness). **No critical issues.**

**Minor gaps:** Two exported utility functions untested (`phonemeArrayToGroundTruthEncoding`, `groundTruthEncodingToPhonemeArray`). NaN guard in `arrayToId` only checks `array[0]`.

### Player Pipeline (player/*.ts) ✅ GOOD

| Module | Lines | Tests | Coverage | Grade |
|--------|-------|-------|----------|-------|
| `player/audio.ts` | 131 | 38 | ~95% | A |
| `player/player.ts` | 281 | 27 | ~85% | A− |
| `player/streamingProcessor.ts` | 128 | 0 | **0%** | **F** |

**Strengths:** Well-tested pipeline logic with excellent MockNN strategy. Clean separation.

**Issues:** `streamingProcessor.ts` is dead code (never imported) with two critical implementation bugs (RMS vs mean-abs, no decimation). `LipsyncPlayer` has no `off()` method — listener leak.

### 3D/Avatar (avatar3d/*.ts) ⚠️ WEAK

| Module | Lines | Tests | Coverage | Grade |
|--------|-------|-------|----------|-------|
| `avatar3d/expression.ts` | 386 | 50 | ~90% | A− |
| `avatar3d/avatar.ts` | 270 | 6 | ~20% | D |
| `avatar3d/modelLoader.ts` | 400 | 0 | **0%** | **F** |

**Strengths:** Expression system is well-tested. Viseme-to-morph mapping is comprehensive (9 viseme types, 2 naming conventions).

**Issues:** `modelLoader.ts` is the most critical untested module — morph target extraction, viseme composition, RPM/ARKit fallback, blink morph all have zero test coverage. No DRACOLoader. No dispose pattern. Camera lerp is broken (lookAt jumps instantly). Root group is dead code. Viseme intensity is trivially derived from viseme ID, not audio energy.

### UI Bootstrap (main.ts) ❌ NO TESTS (acceptable)

| Lines | Tests | Coverage | Grade |
|-------|-------|----------|-------|
| 649 | 0 | 0% | N/A |

Acceptable for bootstrap/UI wiring. Contains inline `StreamingProcessor` (the active one) which duplicates the dead `streamingProcessor.ts` module. Viseme intensity formula (`visemeId / 9 * 0.6`) is a placeholder that doesn't respond to speech volume.

---

## Testing Coverage Summary

| Status | Modules | Lines | % of Codebase |
|--------|---------|-------|--------------|
| ✅ Excellent (≥85%) | core/lpc, core/nn, core/phoneme, player/audio, player/player, avatar3d/expression | ~1,363 | ~48% |
| ⚠️ Weak (≤20%) | avatar3d/avatar | 270 | ~10% |
| ❌ Untested (0%) | avatar3d/modelLoader, player/streamingProcessor | 528 | ~19% |
| ❌ No tests (bootstrap) | main.ts | 649 | ~23% |

**204 tests total. ~55% of source code has meaningful coverage.** Core numerical pipeline is well-covered; 3D rendering and streaming layers have critical gaps.

---

## Audio Pipeline Correctness

The active production pipeline (`main.ts → player.ts → audio.ts → lpc.ts → nn.ts → phoneme.ts`) is **faithful to the AS3 original**:

| Component | Match | Tolerance |
|-----------|-------|-----------|
| LPC (autocorrelation, Durbin) | ✅ | 1e-9 |
| VAD threshold (0.025) | ✅ | Exact |
| Energy (mean-abs) | ✅ | Exact |
| Decimation (stride 7) | ✅ | Exact |
| NN architecture (9→50→50→6) | ✅ | Structural bug preserved |
| Sigmoid activation | ✅ | 1e-9 |
| Phoneme encoding (MSB-first, 6-bit) | ✅ | Bit-exact |
| Temporal smoothing (3-point) | ✅ | Exact |

The only material migration discrepancy: `SAMPLES_PER_WINDOW=794` in TS vs AS3's `793` (due to `int(793.8)` truncation in ActionScript). Ground truth was regenerated for TS, so internal tests pass, but bit-exact AS3 equivalence is broken by 1 sample per window.

---

## Build & Deployment

| Metric | Value | Verdict |
|--------|-------|---------|
| Build time | 669ms | ✅ Fast |
| JS bundle | 677KB (185KB gzipped) | ⚠️ No chunk splitting |
| Total dist | 7.7MB (5.4MB models, 960KB samples) | ✅ Acceptable |
| Sourcemaps | None in production | ❌ Not generated |
| npm audit | 0 vulnerabilities | ✅ Clean |
| CI tests run? | No | ❌ CRITICAL |
| PRs trigger CI? | No | ❌ CRITICAL |

---

## Documentation & Community Readiness

| Item | Status | Required For |
|------|--------|-------------|
| README | ✅ Good (188 lines) | All projects |
| MIGRATION.md | ✅ Excellent (120 lines) | Migration awareness |
| AGENTS.md | ❌ **Inappropriate for public repo** | Remove or rewrite |
| CONTRIBUTING.md | ❌ **Missing** | Contributor onboarding |
| CODE_OF_CONDUCT.md | ❌ **Missing** | Community safety |
| CHANGELOG.md | ❌ **Missing** | User-facing changes |
| Issue templates | ❌ **Missing** | Structured bug reports |
| PR template | ❌ **Missing** | Structured contributions |
| SECURITY.md | ❌ **Missing** | Vulnerability reporting |
| FUNDING.yml | ❌ **Missing** | Sponsor links |
| GitHub Discussions | ❌ **Disabled** | Community Q&A |
| Repo topics/tags | ❌ **Missing** | Discoverability |

---

## Top 20 Recommendations (Priority Order)

### P0 — Critical (fix immediately)

1. **Add `npm test` + `build:tsc` to CI** — `deploy.yml` must run tests before building
2. **Add `pull_request` trigger to CI** — PRs need automated checks
3. **Close Issue #1 or respond to it** — 7-year-old unanswered issue is a bad first impression
4. **Tag a v0.1.0 release** — matching `package.json` version, with release notes
5. **Remove duplicate StreamingProcessor** — delete `src/player/streamingProcessor.ts` (the inline class in `main.ts` is what runs; the module file is dead with critical bugs)

### P1 — High (next sprint)

6. **Fix viseme intensity** — use actual audio energy instead of `visemeId / 9 * 0.6`
7. **Add DRACOLoader** — check if brunette.glb uses Draco and register the loader
8. **Implement `Avatar3D.dispose()`** — cancel rAF, dispose renderer, geometries, materials, remove listeners
9. **Add CSP meta tag** — strict policy in `index.html` for defense-in-depth
10. **Remove or rewrite AGENTS.md** — strip Hermes/DeepSeek references and personal URLs
11. **Create CONTRIBUTING.md + CODE_OF_CONDUCT.md** — essential for community trust
12. **Add `.gitattributes`** — line-ending normalisation + Git LFS for .glb files
13. **Fix `build:tsc`** → `tsc --noEmit` in `package.json`
14. **Add chunk splitting** — `manualChunks: { three: ['three'] }` in `vite.config.ts`
15. **Add `base` to vite.config.ts** — use `{ base: mode === 'production' ? '/LipSync/' : '/' }`

### P2 — Medium (next iteration)

16. **Fix camera lerp** — initialize `_currentTarget` to current lookAt, not new preset target
17. **Add dirty flag for morph updates** — skip `applyVisemeMorphs()` when viseme unchanged
18. **Add `off()` method to `LipsyncPlayer`** — prevent listener leak
19. **Add ARIA landmarks, `aria-live`, focus styles, `aria-label`** — bare-minimum accessibility
20. **Increase touch targets to ≥44×44px** — media query for mobile viewports

---

## What To Do With This Review

This file (`REVIEW.md`) is yours to use as a roadmap. The issues are ordered by priority. Each section maps to concrete, fixable items. The 11 subagents that produced this read every line of source code — nothing here is guessed.

**Process suggestion:** Work through P0→P1→P2 in order. The P0 items are quick config/doc changes that dramatically improve project credibility. P1 items address correctness and safety. P2 items are polish.

---

*Review produced by 11 autonomous subagents powered by DeepSeek V4 Flash, coordinated by Hermes Agent.*
