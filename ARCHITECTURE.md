# LipSync Architecture Overview

## Project Summary

LipSync is a real-time lip-syncing application for 3D avatars, written in ActionScript 3 (Flash/AIR). It analyzes audio input using Linear Predictive Coding (LPC), classifies phonemes into visemes via a neural network, and drives a 3D avatar's facial animations — mouth, eyes, and expressions — in response to speech.

**Author:** Szymon (s-soltys)  
**Repository:** `git@github.com:s-soltys/LipSync.git`  
**License:** Unlicense (Public Domain)  
**Language:** ActionScript 3 (Flash/AIR, target Flash Player 10)  
**3D Engine:** Away3D  
**Tweening:** caurina.transitions.Tweener  

---

## Directory Tree

```
~/LipSync/
├── .git/
├── .gitignore
├── LICENSE                          Unlicense (Public Domain)
├── README.md                        Project description
├── Lipsync.as3proj                  FlashDevelop project file
├── Lipsync.lxml                     SWC library project metadata
├── ARCHITECTURE.md                  ← this file
│
├── lib/                             Runtime resources
│   ├── network_image                Trained neural network (zlib-compressed, 16 KB)
│   ├── male/
│   │   ├── aeiou.mp3     (35 KB)    Male speech sample — vowel sounds
│   │   ├── count.mp3     (20 KB)    Male speech sample — counting
│   │   ├── example.mp3   (48 KB)    Male speech sample — example phrases
│   │   ├── lipsync.mp3   (50 KB)    Male speech sample — dedicated lip-sync
│   │   └── speech.mp3    (59 KB)    Male speech sample — general speech
│   └── female/
│       ├── aeiou.mp3     (29 KB)    Female speech sample — vowel sounds
│       ├── count.mp3     (18 KB)    Female speech sample — counting
│       ├── example.mp3   (44 KB)    Female speech sample — example phrases
│       ├── lipsync.mp3   (45 KB)    Female speech sample — dedicated lip-sync
│       └── speech.mp3    (59 KB)    Female speech sample — general speech
│
├── obj/                             Build artifacts / compiler configs
│   ├── Lipsync.flex.compc.xml       Flex compiler config (release build, 1.7 KB)
│   ├── LipsyncConfig.xml            Flex compiler config (SWC output, 1.1 KB)
│   └── LipsyncConfig.old            Previous version of config (identical, 1.1 KB)
│
└── src/                             ActionScript 3 source (3,008 lines total)
    ├── avatar3D/                    3D avatar system — bones, expressions, rendering
    ├── editor/                      Standalone editor application
    ├── generic3D/                   Away3D scene/wrapper + Collada loader
    ├── lipsync/                     Core lip-sync engine (LPC, NN, training, player)
    ├── scenes/                      Test/debug scenes
    └── util/                        Utility classes
```

---

## `lib/` — Library / Runtime Assets

The `lib/` directory is **not** a source-code library directory. It contains **runtime data assets** consumed by the application at runtime (loaded via URL or embedded via `[Embed]`) or during training.

### Files Present

| File | Size | Type | Description |
|---|---|---|---|
| `lib/network_image` | 16,137 B | zlib-compressed binary | Serialized trained neural network (weights, biases, settings). Decompresses to ~31 KB. Contains IEEE 754 doubles — network topology, per-neuron weights/momentums, and LPC/sampling settings. |
| `lib/male/aeiou.mp3` | 35,192 B | MP3 | Male "aeiou" vowel-sequence audio sample |
| `lib/male/example.mp3` | 48,900 B | MP3 | Male example sentence audio |
| `lib/male/lipsync.mp3` | 50,616 B | MP3 | Male dedicated lip-sync test audio |
| `lib/male/count.mp3` | 20,270 B | MP3 | Male counting audio |
| `lib/male/speech.mp3` | 60,603 B | MP3 | Male general speech audio |
| `lib/female/aeiou.mp3` | 30,092 B | MP3 | Female "aeiou" vowel-sequence audio sample |
| `lib/female/example.mp3` | 44,720 B | MP3 | Female example sentence audio |
| `lib/female/lipsync.mp3` | 46,392 B | MP3 | Female dedicated lip-sync test audio |
| `lib/female/count.mp3` | 18,807 B | MP3 | Female counting audio |
| `lib/female/speech.mp3` | 59,976 B | MP3 | Female general speech audio |

### Referenced But Missing Resources

The source code embeds or loads several resources from paths under `lib/` that **do not exist** in the current checkout:

| Source File | Referenced Path | Expected Content |
|---|---|---|
| `util/AvatarXMLProvider.as` | `lib/xml/avatar_default.xml` | Avatar bone hierarchy, expression definitions, viseme configuration |
| `util/NeuralNetworkProvider.as` | `lib/lipsync/network_image_m` | Male-specific trained neural network (separate from combined `network_image`) |
| `util/NeuralNetworkProvider.as` | `lib/lipsync/network_image_f` | Female-specific trained neural network |
| `generic3D/collada/AvatarModelProvider.as` | `lib/model/model.dae` | Female 3D avatar model (Collada DAE) |
| `generic3D/collada/AvatarModelProvider.as` | `lib/model/model_man.dae` | Male 3D avatar model (Collada DAE) |
| `generic3D/collada/AvatarModelProvider.as` | `lib/model/eye.jpg` | Eye texture |
| `generic3D/collada/AvatarModelProvider.as` | `lib/model/teeth.jpg` | Teeth texture |
| `generic3D/collada/AvatarModelProvider.as` | `lib/model/texture.jpg` | Female body texture |
| `generic3D/collada/AvatarModelProvider.as` | `lib/model/texture_m.jpg` | Male body texture |
| `util/DAECompressor.as` | `lib/model/model.dae` | Same female model for compression utility |

These files existed during original development but were not committed to the Git repository (possibly due to size, licensing of model assets, or oversight).

---

## `obj/` — Build Configuration

Three XML files used by the Flex/Flash compiler:

| File | Size | Role |
|---|---|---|
| `obj/Lipsync.flex.compc.xml` | 1,702 B | **Generated release compiler config** — defines target player 10.0.0, debug/release conditional defines, timestamp `2011-08-24`, source paths (including FlashDevelop's AS3 class library), and sets `LipsyncCreator.mxml` as the main entry point. |
| `obj/LipsyncConfig.xml` | 1,125 B | **SWC library config** — produces `bin/Lipsync.swc`. Lists the exact classes to include (core LPC, neural network, phoneme, player, training classes) for library distribution. |
| `obj/LipsyncConfig.old` | 1,125 B | Identical to `LipsyncConfig.xml` — a backup prior to modification. |

---

## Source Architecture: Structural Relationships

### Layer 1 — LipSync Core (`src/lipsync/`)

This is the core pipeline: **Audio → LPC analysis → Neural network classification → Viseme/Phoneme output**

```
                  ┌──────────────────────────────────────┐
                  │      LipsyncCreator.mxml (MXML)       │
                  │  Main Flex Application (850×550 px)   │
                  │   UI: sliders, buttons, log/output    │
                  └──────────────┬───────────────────────┘
                                 │ imports / uses
                  ┌──────────────▼───────────────────────┐
                  │      LipsyncTrainer.as                │
                  │   Orchestrates training + playback:   │
                  │   - Creates NeuralNetwork             │
                  │   - Loads samples via TrainingPattern │
                  │   - Trains network                    │
                  │   - Saves/loads network_image         │
                  │   - Runs playback via LipsyncPlayer   │
                  └──┬────────────┬──────────────┬───────┘
                     │            │              │
         ┌───────────▼──┐  ┌─────▼──────┐  ┌────▼──────────┐
         │ NeuralNetwork│  │TrainingPat.│  │LipsyncPlayer  │
         │ (network/)   │  │Generator   │  │ (player/)     │
         └──────────────┘  └────────────┘  └───────────────┘
```

**Core classes (in order of the audio processing pipeline):**

1. **`lipsync.core.LipsyncSettings`** — Global configuration singleton. Parameters: `outputCount` (6), `samplingDecimate` (6), `samplingRate` (44100 Hz), `windowLength` (18 ms), `recognizePhonemeDelay` (20 ms), `activationEnergy` (0.025).

2. **`lipsync.core.lpc.LP`** — Linear Predictive Coding analysis.
   - `order` (default 9): LPC order (number of coefficients)
   - Static method `analyze(samples)` → returns LPC coefficients
   - Internal: Hamming window → `computeAutocorrelation` (Burg-like method with lambda pre-emphasis) → `computeCoef` (Durbin-Levinson recursion) → Reflection coefficients (K-parameters)
   - The last coefficient is popped (output length = order-1)

3. **`lipsync.core.network.Neuron`** — Single neuron.
   - Sigmoid activation: `1 / (1 + exp(-(sum(weights*inputs) + bias)))`
   - Backpropagation with momentum weight updates
   - Per-neuron: inputs, weights, momentums vectors + bias tracking

4. **`lipsync.core.network.NeuralNetwork`** — Multi-layer perceptron.
   - Architecture: Input → (2 hidden layers × n neurons) → Output
   - Default: 2 hidden layers, neurons per layer configurable (default 50)
   - `run(inputVector)` → forward pass through all layers
   - `train(patterns, epochs, learningRate, targetMSE)` → batch backprop with shuffle, adaptive learning rate (rate * MSE)
   - `save()` / `load()` → serializes entire network + all settings to/from zlib-compressed ByteArray

5. **`lipsync.core.phoneme.Phoneme`** — Phoneme/viseme definitions.
   - 18 predefined visemes (v1a-v9b), each with a `symbol` (v1-v9), unique `id`, and `visemeId` (1-9 grouping)
   - 9 distinct viseme groups, each with 'a' and 'b' variants
   - `Phoneme.NULL` as empty/default

6. **`lipsync.core.phoneme.PhonemeCollection`** — Registry/conversion.
   - `phonemeToArray(phoneme)` → encodes phoneme.id as `outputCount`-bit binary array
   - `arrayToPhoneme(array)` → decodes neural network output back to phoneme (threshold ≥ 0.5)
   - `getById(id)` → lookup

7. **`lipsync.player.LipsyncPlayer`** — Real-time audio playback + phoneme recognition.
   - Loads MP3 via Sound/URLRequest
   - On sound loaded: pre-computes full phoneme buffer by stepping through audio at `recognizePhonemeDelay` intervals
   - For each step: extracts sample window → LPC analysis → NN forward pass → phoneme decoding
   - Post-processing: `setupBuffer()` removes transient single-frame phoneme outliers
   - Two timers during playback: (a) dispatch amplitude samples, (b) read from pre-computed phoneme buffer in sync with playback position
   - Dispatches `LipsyncEvent.PHONEME` with phoneme + amplitude

8. **`lipsync.player.LipsyncEvent`** — Event types: `AMPLITUDE_SAMPLE`, `PHONEME`, `PLAYING_COMPLETE`, `PLAYING_ERROR`, `PLAYING_START`

9. **`lipsync.player.LipsyncBufferItem`** — Buffer element: phoneme, position (ms), energy level, raw samples

10. **`lipsync.training.TrainingPattern`** — Simple I/O pair (input: LPC coefficients vector, output: binary phoneme encoding vector)

11. **`lipsync.training.generator.TrainingPatternGenerator`** — Orchestrates sample loading.
    - Accepts ordered sequence of (file, phoneme, time-ranges) via `addSequence()`
    - Uses `SampleProvider` to extract/generate patterns
    - Applies jittered time sampling for robustness

12. **`lipsync.training.generator.SampleProvider`** — Audio → LPC feature extraction.
    - Loads MP3, extracts raw float samples with decimation (step = 4 × (decimate+1) bytes)
    - Passes extracted window through `LP.analyze()`
    - Returns LPC coefficient vectors

13. **`lipsync.training.generator.ProviderEvent`** — Custom event carrying sample arrays + phoneme metadata

### Layer 2 — 3D Avatar System (`src/avatar3D/`)

```
                  ┌──────────────────────────────────────┐
                  │            AvatarAnimator              │
                  │     Extends AvatarCore                 │
                  │  - Wraps LipsyncPlayer                 │
                  │  - Listens for PHONEME events          │
                  │  - Drives facial expressions           │
                  └──────────┬────────────────────────────┘
                             │
                  ┌──────────▼────────────────────────────┐
                  │            AvatarBuilder                │
                  │  - Receives parsed Collada model       │
                  │  - Loads avatar_default.xml config     │
                  │  - Constructs eyes, mouth, neck        │
                  │  - Returns fully-wired AvatarAnimator  │
                  └──┬────────────┬──────────────┬────────┘
                     │            │              │
           ┌─────────▼──┐  ┌─────▼──────┐  ┌───▼─────────┐
           │  AvatarEye │  │AvatarMouth │  │ AvatarNeck  │
           │ (face/eyes)│  │(face/mouth)│  │(face/neck)  │
           └────────────┘  └────────────┘  └──────────────┘
```

**Core classes:**

1. **`AvatarCore`** — Base class. Manages avatar `ObjectContainer3D`, facial features (eyes, mouth, neck), blinking timer, look-at mouse tracking, viseme/emotion setters.

2. **`AvatarAnimator`** (extends `AvatarCore`) — Entry point for animated avatar. Wraps `LipsyncPlayer` with a default neural network. Methods: `saySentence()`, `saySentencesUsingNetwork()`. Listens for `LipsyncEvent.PHONEME` and maps phoneme.visemeId → `ExpressionsCollection` viseme → `setViseme(expression, amplitude)`.

3. **`AvatarBuilder`** — Factory. Takes a parsed Collada `ObjectContainer3D`, reads `AvatarXMLProvider.xml` (avatar bone topology), constructs `AvatarEye`, `AvatarMouth`, `AvatarNeck`, initializes expressions, and returns a wired-up `AvatarAnimator`.

4. **`avatar3D.face.mouth.AvatarMouth`** — 14 `AvatarFeature` bones: jaw, tongue, mouth_l/r, lip_down_l/m/r, lip_top_l/m/r, cheek_l/r, cheekb_l/r. `setViseme(value, expression)` applies parameter transformations.

5. **`avatar3D.face.eyes.AvatarEye`** — eyelid, eyeball, eyebrow_i, eyebrow_o features. Methods: `blink()`, `lookAt()`, `close()`.

6. **`avatar3D.face.neck.AvatarNeck`** — neck_low, neck_high bones for head rotation.

7. **`avatar3D.core.AvatarFeature`** — Wraps a single bone with `BoneParameter` instances for rotX/Y/Z and movX/Y/Z.

8. **`avatar3D.core.BoneParameter`** (interface) — `value` getter/setter, `refreshValue()`, `setValueTween()`.

9. **`avatar3D.core.bone.BoneRot`** / **`BoneMov`** — Implement `BoneParameter`. Translate normalized parameter values (0–1) to actual bone transformations based on min/def/max ranges with inertia smoothing. Uses `caurina.transitions.Tweener` for tweened transitions.

10. **`avatar3D.expression.AvatarExpression`** — Defines a viseme/emotion by 14 facial parameters (jaw, tongue, mouth, lips, cheeks — each with rotation/movement values).

11. **`avatar3D.expression.ExpressionsCollection`** — Static registry: 7 emotions (neutral, joy, sadness, anger, fear, disgust, surprise) + viseme array. Lookup by alias or id.

12. **`avatar3D.expression.setting.ExpressionParameter`** — Parses XML to extract rotation/movement parameters for a single facial component.

### Layer 3 — 3D Scene / Rendering (`src/generic3D/`)

1. **`generic3D.AvatarScene`** (extends Away3D `View3D`) — Scene container. Methods: `addAvatar()`, `removeAvatar()`. Renders on `ENTER_FRAME`.

2. **`generic3D.collada.AvatarModelProvider`** — Loads Collada (.dae) models via Away3D's `Collada` parser. Applies embedded textures (eye, teeth, body). Initializes bone hierarchy. Supports male/female model variants.

### Layer 4 — Application / Editor (`src/editor/`)

1. **`editor.LipsyncEditorWindow`** — Standalone editor SWF (500×700). Loads both male and female avatars. UI: clickable labels to play test sentences through the avatar. Includes a magnified viewport. Switches between male/female models and their corresponding neural networks.

### Layer 5 — Test Scenes (`src/scenes/`)

1. **`scenes.LipsyncTestScene`** — Minimal test: plays audio through `LipsyncPlayer` with the neural network, traces viseme IDs.
2. **`scenes.SetupVisemeScene`** — Interactive test: loads avatar model, displays it, live-reloads expression XML, cycles through visemes.
3. **`scenes.ColladaTestScene`** — Loads avatar model, plays audio through it with lip-sync, mouse look-at tracking.

### Layer 6 — Utilities (`src/util/`)

| Class | Role |
|---|---|
| `AvatarXMLProvider` | Embeds `lib/xml/avatar_default.xml` — the avatar bone/expression configuration file |
| `AvatarDebugger` | Static trace-based debug logger |
| `NeuralNetworkProvider` | Embeds `lib/lipsync/network_image_m` and `network_image_f` — loads them into `NeuralNetwork` instances |
| `Label` | Custom clickable text label UI component |
| `DAECompressor` | Utility to deflate-compress Collada model files |
| `LookAtPoint` | Smoothed 2D position tracker with inertia |

---

## External Frameworks / Libraries

| Library | Role | Evidence |
|---|---|---|
| **Adobe Flex SDK** (MX) | UI framework (MXML components) | `mx:Application`, `mx:Panel`, `mx:Button`, `mx:TextArea`, etc. + `FlexBinPath` in project config |
| **Away3D** (v3.x?) | 3D rendering engine | `away3d.cameras.Camera3D`, `away3d.containers.Scene3D/View3D/ObjectContainer3D/Bone`, `away3d.loaders.Collada`, `away3d.materials.BitmapMaterial` |
| **caurina.transitions.Tweener** | Tweening engine | `caurina.transitions.Tweener.addTween()` in `BoneRot.as` and `BoneMov.as` |
| **FlashDevelop Library** | AS3 standard library classes | Source path `D:\\Program Files (x86)\\FlashDevelop\\Library\\AS3\\classes` in compiler config |
| **Flash Player 10 API** | Sound, ByteArray, Timers, networking | Standard AS3 `flash.media.Sound`, `flash.utils.ByteArray`, `flash.net.*` |

### External Framework Details

**Away3D** provides the entire 3D rendering pipeline: scene graph (`Scene3D`), camera (`Camera3D`), viewport (`View3D`), hierarchical bone system (`Bone`, `ObjectContainer3D`), and Collada file parser (`Collada`). The project does not directly instantiate Away3D's `Debug` utility but uses it in test scenes.

**caurina.transitions.Tweener** provides easing/tweening for smooth bone animation transitions. Used specifically in `BoneRot.setValueTween()` and `BoneMov.setValueTween()`.

**Adobe Flex MX** is used only in the training application (`LipsyncCreator.mxml`). The editor and test scenes use raw `Sprite`-based display.

---

## Data Flow Diagram

```
┌──────────┐    ┌──────────────┐    ┌────────────┐    ┌───────────────┐
│  MP3 File │───▶│ SamplePro-  │───▶│  LP.analyze│───▶│ NeuralNetwork │
│ (lib/*/)  │    │ vider.ext-  │    │  (LPC coeff│    │ .run()        │
│           │    │ ractSound() │    │   +Hamming │    │  (forward     │
│           │    │ +decimate   │    │   window)   │    │   pass)       │
└──────────┘    └──────────────┘    └────────────┘    └──────┬────────┘
                                                             │
                    ┌────────────────────────────────────────┘
                    ▼
          ┌────────────────────┐
          │ PhonemeCollection  │
          │ .arrayToPhoneme()  │
          │  (threshold ≥ 0.5) │
          └────────┬───────────┘
                   │ phoneme.visemeId
          ┌────────▼───────────┐
          │ ExpressionsColl.   │
          │ .getVisemeById()   │
          └────────┬───────────┘
                   │ AvatarExpression
          ┌────────▼───────────┐
          │  AvatarCore        │
          │  .setViseme(expr,  │
          │   amplitude*13.5)  │
          └────────┬───────────┘
                   │
          ┌────────▼───────────┐
          │  AvatarMouth       │
          │  .setViseme(v, e)  │
          └────────┬───────────┘
                   │
          ┌────────▼───────────┐
          │  14x AvatarFeature │
          │  (bones: jaw, lips,│
          │   cheeks, tongue)  │
          │  → BoneRot/Mov     │
          │  → Away3D Bone     │
          └────────────────────┘
```

---

## Key Architectural Observations

1. **Pre-computation strategy:** `LipsyncPlayer` pre-computes the entire phoneme buffer when a sound is loaded — it runs the full LPC + NN pipeline on every window across the audio before playback starts. Run-time playback just reads from the pre-computed buffer in sync with the audio position. This avoids real-time processing constraints.

2. **Neural network is tiny:** The network serializes to only 16 KB compressed (~31 KB decompressed). With 9 input features (LPC order), 6 output classes (binary encoded), 2 hidden layers of ~50 neurons, this implies roughly (9×50 + 50×50 + 50×6) = ~3,250 weights/bias terms.

3. **Viseme encoding is binary:** 6-bit binary encoding of 18 phoneme IDs (2^6 = 64, enough room). Output layer uses sigmoid with threshold ≥ 0.5.

4. **Missing training data pipeline:** The git repo lacks the full training infrastructure (the `lib/model/*`, `lib/xml/`, `lib/lipsync/*` embedded assets). The only trained network present is `lib/network_image`, which uses a default LPC order of 9, output count of 6, sampling decimate of 6, and window length of 18.

5. **Dual sex support:** The architecture supports both male and female voices/models. Separate neural networks (`network_image_m`/`network_image_f`) are defined but only a combined `network_image` is present in the repo. The editor can switch between male and female avatars and neural networks.

6. **No git submodules:** The project has no `.gitmodules`. All external libraries (Away3D, Tweener, Flex SDK) are expected to be available on the system build path (e.g., FlashDevelop's library directory).

7. **Build system:** FlashDevelop project (`.as3proj`) with MXML main entry point (`LipsyncCreator.mxml`). Flex compiler configs in `obj/` with timestamp `2011-08-24`. Output: `bin/Lipsync.swf` (application) and `bin/Lipsync.swc` (library).
