# LipSync ActionScript Source Code Map

**Generated:** Comprehensive analysis of all 39 `.as` files  
**Project:** Real-time lip-sync animation (Flash/ActionScript 3 + Away3D)  
**Directory:** `~/LipSync/src/`

---

## 1. PACKAGE HIERARCHY

```
lipsync/
├── core/
│   ├── LipsyncSettings.as
│   ├── lpc/
│   │   └── LP.as
│   ├── network/
│   │   ├── NeuralNetwork.as
│   │   └── Neuron.as
│   └── phoneme/
│       ├── Phoneme.as
│       └── PhonemeCollection.as
├── training/
│   ├── TrainingPattern.as
│   ├── LipsyncTrainer.as          [no package — global code]
│   └── generator/
│       ├── TrainingPatternGenerator.as
│       ├── SampleProvider.as
│       └── ProviderEvent.as
└── player/
    ├── LipsyncPlayer.as
    ├── LipsyncEvent.as
    └── LipsyncBufferItem.as

avatar3D/
├── AvatarCore.as
├── AvatarBuilder.as
├── AvatarAnimator.as
├── core/
│   ├── AvatarFeature.as
│   ├── BoneParameter.as            [interface]
│   └── bone/
│       ├── BoneRot.as
│       └── BoneMov.as
├── expression/
│   ├── AvatarExpression.as
│   ├── ExpressionsCollection.as
│   └── setting/
│       └── ExpressionParameter.as
└── face/
    ├── mouth/AvatarMouth.as
    ├── eyes/AvatarEye.as
    └── neck/AvatarNeck.as

generic3D/
├── AvatarScene.as
└── collada/
    └── AvatarModelProvider.as

editor/
└── LipsyncEditorWindow.as

scenes/
├── SetupVisemeScene.as
├── LipsyncTestScene.as
└── ColladaTestScene.as

util/
├── NeuralNetworkProvider.as
├── LookAtPoint.as
├── Label.as
├── DAECompressor.as
├── AvatarXMLProvider.as
└── AvatarDebugger.as
```

---

## 2. CLASS HIERARCHY (Inheritance)

```
EventDispatcher (flash)
├── TrainingPatternGenerator (lipsync.training.generator)
├── SampleProvider (lipsync.training.generator)
├── LipsyncPlayer (lipsync.player)
└── AvatarModelProvider (generic3D.collada)

Event (flash)
├── ProviderEvent (lipsync.training.generator)
└── LipsyncEvent (lipsync.player)

Sprite (flash.display)
├── DAECompressor (util)
├── SetupVisemeScene (scenes)
├── LipsyncTestScene (scenes)
├── ColladaTestScene (scenes)
└── LipsyncEditorWindow (editor)

MovieClip (flash.display)
└── Label (util)

View3D (away3d.containers)
└── AvatarScene (generic3D)

AvatarCore (avatar3D)
└── AvatarAnimator (avatar3D)

BoneParameter (interface — avatar3D.core)
├── BoneRot (avatar3D.core.bone)
└── BoneMov (avatar3D.core.bone)
```

---

## 3. CLASS-BY-CLASS DOCUMENTATION

### 3.1 lipsync.core.phoneme.Phoneme
**File:** `lipsync/core/phoneme/Phoneme.as`  
**Imports:** none  
**Description:** Data class mapping phoneme symbols to IDs and viseme IDs. 18 phoneme constants + NULL sentinel.

**Constants (static public):**
| Constant | Symbol | id | visemeId |
|---|---|---|---|
| `NULL` | "" | 0 | 0 |
| `v1a` | "v1" | 2 | 1 |
| `v1b` | "v1" | 3 | 1 |
| `v2a` | "v2" | 6 | 2 |
| `v2b` | "v2" | 7 | 2 |
| `v3a` | "v3" | 10 | 3 |
| `v3b` | "v3" | 11 | 3 |
| `v4a` | "v4" | 14 | 4 |
| `v4b` | "v4" | 15 | 4 |
| `v5a` | "v5" | 20 | 5 |
| `v5b` | "v5" | 21 | 5 |
| `v6a` | "v6" | 30 | 6 |
| `v6b` | "v6" | 31 | 6 |
| `v7a` | "v7" | 40 | 7 |
| `v7b` | "v7" | 41 | 7 |
| `v8a` | "v8" | 52 | 8 |
| `v8b` | "v8" | 53 | 8 |
| `v9a` | "v9" | 62 | 9 |
| `v9b` | "v9" | 63 | 9 |

**Properties (public):** `id:int`, `symbol:String`, `visemeId:int`

**Constructor:** `Phoneme(symbol:String, id:int, visemeId:int)`

---

### 3.2 lipsync.core.phoneme.PhonemeCollection
**File:** `lipsync/core/phoneme/PhonemeCollection.as`  
**Imports:** `lipsync.core.LipsyncSettings`  
**Description:** Registry of all 18 phonemes + binary encoding/decoding.

**Properties (static public):** `phonemes:Vector.<Phoneme>`

**Methods (static public):**
- `getById(id:int):Phoneme` — Linear search by ID, returns `Phoneme.NULL` if not found
- `phonemeToArray(phoneme:Phoneme):Vector.<Number>` — Encodes phoneme ID to binary array of length `LipsyncSettings.outputCount` (bitwise encoding, MSB first)
- `arrayToPhoneme(array:Vector.<Number>):Phoneme` — Decodes binary array back to phoneme (threshold >= 0.5), returns NULL if first element is NaN

**Algorithm:** Binary encoding/decoding. `outputCount` bits encode the phoneme ID. `phonemeToArray` uses successive subtraction by powers of 2 from high to low. `arrayToPhoneme` reconstructs by summing bits with threshold 0.5.

---

### 3.3 lipsync.core.LipsyncSettings
**File:** `lipsync/core/LipsyncSettings.as`  
**Imports:** none  
**Description:** Global configuration singleton for lip-sync parameters.

**Constants (static public):**
- `samplingRate:int = 44100` (Hz)
- `samplingRateMS:Number = 44.1` (samples per millisecond)

**Variables (static public):**
- `outputCount:int = 6` — Number of output neurons / binary encoding bits
- `samplingDecimate:int = 6` — Decimation factor when reading audio samples
- `windowLength:int = 18` — Analysis window length (ms)
- `recognizePhonemeDelay:int = 20` — Timer interval for phoneme recognition (ms)
- `activationEnergy:Number = 0.025` — Minimum energy threshold for phoneme classification

---

### 3.4 lipsync.core.lpc.LP (Linear Prediction)
**File:** `lipsync/core/lpc/LP.as`  
**Imports:** none  
**Description:** Linear Predictive Coding (LPC) analysis — feature extraction from audio samples.

**Properties (static public):** `order:int = 9` — LPC order (number of coefficients)

**Methods (static public):**
- `analyze(samples:Vector.<Number>):Vector.<Number>` — Main entry: autocorrelation → LPC coefficients → pops last element, returns `order` coefficients

**Private algorithms:**

1. `createWindow(length:int):Vector.<Number>` — **Hamming window** function: `w[n] = 0.54 - 0.46*cos(2πn/(L-1))`. Hanning, Blackman, and Blackman-Harris commented out.

2. `computeAutocorrelation(x:Vector.<Number>):Vector.<Number>` — **Burg-method autocorrelation** with a pre-emphasis / lattice filter structure. Uses a lambda parameter (default 0.0) and a recursive difference equation `dl[k] = r1 - λ·(x[k] - r2)`. Computes R[0]..R[P] where P = order.

3. `computeCoef(R:Vector.<Number>):Vector.<Number>` — **Durbin-Levinson recursion** for solving the Yule-Walker equations. Computes reflection coefficients K[0..order-1]. Algorithm:
   - Initialize E₀ = R[0], A₀ = 1
   - For m = 1 to order: compute error, K[m-1] = -(R[m] - err)/Eₘ₋₁, update A coefficients, update Eₘ = (1 - K²)·Eₘ₋₁
   - Returns K vector (reflection/partial correlation coefficients)

**Output:** `order` LPC coefficients (reflection coefficients, not predictor coefficients)

---

### 3.5 lipsync.core.network.Neuron
**File:** `lipsync/core/network/Neuron.as`  
**Imports:** none  
**Description:** Single neuron in the neural network — sigmoid activation, weight adjustment via backpropagation with momentum.

**Properties (internal):**
- `value:Number` — Current activation output
- `bias:Number` — Bias weight
- `momentum:Number` — Bias momentum
- `size:int` — Number of inputs
- `inputs:Vector.<Number>` — Stored input values (used in backprop)
- `weights:Vector.<Number>` — Connection weights
- `momentums:Vector.<Number>` — Per-weight momentum values

**Methods (internal):**
- `createNeuron(inputsCount:int, bias:Number, weightRange:Number = 1):void` — Initialize weights randomly in [-weightRange, +weightRange], zero momentums
- `calculateValue(inputsArray:Vector.<Number>):Number` — **Forward pass**: weighted sum + bias → logistic sigmoid: `σ(z) = 1/(1+exp(-z))`. Stores inputs internally.
- `adjustWeights(nError:Number, learningRate:Number, globalMomentum:Number, error:Array):void` — **Backpropagation**: computes `δ = nError · value · (1 - value)`, updates weights with `Δw = δ·input·η + momentum·α`, propagates error backward.

**Algorithm:** Standard backpropagation with momentum. Sigmoid derivative: `value · (1 - value)`.

---

### 3.6 lipsync.core.network.NeuralNetwork
**File:** `lipsync/core/network/NeuralNetwork.as`  
**Imports:** `flash.utils.ByteArray`, `lipsync.core.LipsyncSettings`, `lipsync.core.lpc.LP`, `lipsync.training.TrainingPattern`  
**Description:** Multi-layer feed-forward neural network with backpropagation training.

**Properties (private):**
- `layers:Array` — Array of `Vector.<Neuron>` layers
- `momentum:Number = 0.5` — Global momentum factor
- `neuronalBias:Number = 1` — Bias value for all neurons
- `initialWeightRange:Number = 1` — Weight initialization range
- `realLearningRate:Number = NaN` — Adaptive learning rate (decays with MSE)
- `hiddenLayers:int = 2` — Number of hidden layers (constant)

**Methods (public):**
- `createNetwork(inputs:int, outputs:int, neuronsPerLayer:int):void` — Builds `hiddenLayers` hidden layers + 1 output layer
- `run(inputArray:Vector.<Number>):Vector.<Number>` — Feed-forward: iterates through layers, each neuron's output feeds the next layer's input. Returns final layer outputs.
- `train(patterns:Vector.<TrainingPattern>, epochs:int, learningRate:Number, targetMSE:Number = 0.02):Number` — Training loop: shuffles, forward pass, backprop (via `adjust`), adaptive LR = η·MSE, early exit if MSE ≤ target. Returns final MSE.
- `save():ByteArray` — Serializes network to compressed ByteArray: LP.order, outputCount, samplingDecimate, windowLength, momentum, learningRate, layer topology, all neuron weights/biases/momentums
- `load(input:ByteArray):void` — Deserializes from saved ByteArray (uncompresses, restores all state including LipsyncSettings/LP globals)
- `shufflePatterns(array:Vector.<TrainingPattern>):Vector.<TrainingPattern>` (static public) — Fisher-Yates shuffle

**Algorithm:** Multi-layer perceptron with:
- Architecture: `[input] → [neuronsPerLayer] × hiddenLayers → [output]`
- Activation: Logistic sigmoid (all neurons)
- Learning: Backpropagation with momentum, adaptive learning rate
- Training: Batched over all patterns each epoch, patterns shuffled per epoch
- Early stopping by MSE threshold (default 0.02)

---

### 3.7 lipsync.training.TrainingPattern
**File:** `lipsync/training/TrainingPattern.as`  
**Imports:** `flash.geom.Vector3D` (unused)  
**Description:** Data class pairing input features with expected output.

**Properties (public):** `input:Vector.<Number>`, `output:Vector.<Number>`

**Constructor:** `TrainingPattern(inputPattern:Vector.<Number> = null, outputPattern:Vector.<Number> = null)`

---

### 3.8 lipsync.training.generator.TrainingPatternGenerator
**File:** `lipsync/training/generator/TrainingPatternGenerator.as`  
**Imports:** `flash.events.Event`, `flash.events.EventDispatcher`, `lipsync.core.phoneme.*`  
**Description:** Generates training patterns from labeled audio files. Queues audio samples at specific time positions and converts them to LPC features.

**Properties (private):**
- `soundTrainer:SampleProvider`
- `samplingQueue:Array` — Pending sample jobs (filename, phoneme, position list)
- `filesDirectory:String` — Base directory for audio files
- `sampleOffset:Number = 0.2` — Jitter factor for sample positions
- `patternArray:Vector.<TrainingPattern>` — Accumulated patterns

**Methods (public):**
- `TrainingPatternGenerator(dir:String)` — Constructor, sets up SampleProvider listener
- `addSequence(fileName:String, phoneme:Phoneme, start:Number, stop:Number, count:Number = 30):void` — Queue samples from `start`..`stop` seconds with `count` samples, jittered positions
- `getSamples():Vector.<TrainingPattern>` — Returns accumulated patterns
- `start():void` — Begins processing the queue

**Methods (private):**
- `readNext():void` — Pops next job from queue, dispatches COMPLETE when empty
- `getTrainingSeq(event:ProviderEvent):void` — Receives samples from SampleProvider, creates TrainingPattern (input = LPC features, output = binary-encoded phoneme)
- `generateArray(start:int, stop:int, steps:int):Array` — Generates jittered sample positions: uniform distribution with ±sampleOffset random jitter

**Algorithm:** Stratified sampling with jitter — divides duration into `count` steps, adds random offset to each position.

---

### 3.9 lipsync.training.generator.SampleProvider
**File:** `lipsync/training/generator/SampleProvider.as`  
**Imports:** `flash.events.*`, `flash.media.Sound`, `flash.net.URLRequest`, `flash.utils.ByteArray`, `lipsync.core.*`  
**Description:** Loads audio files and extracts LPC features at specified positions.

**Properties (private):** `sound:Sound`, `phoneme:Phoneme`, `phonemeList:Array`

**Methods (internal):**
- `readTrainingSequence(fileName:String, phoneme:Phoneme, phonemeList:Array):void` — Loads audio file, stores target phoneme and sample positions
- `getPhonemes(position:int):Vector.<Number>` — Extracts audio at position, runs LP.analyze(), returns LPC coefficients as feature vector

**Methods (private):**
- `fileLoaded(e:Event):void` — Triggered when sound is loaded; iterates positions, dispatches `ProviderEvent.TRAINING_SEQ`
- `extractSound(position:int):Vector.<Number>` — Extracts `windowLength * samplingRateMS` samples from audio at given position, decimates by `4*(samplingDecimate+1)` bytes (skip stereo channels)

**Algorithm:** Audio sample extraction with decimation. From a ByteArray of floats, reads every Nth float where `N = 4 * (decimate + 1)` (skipping channels/bytes).

---

### 3.10 lipsync.training.generator.ProviderEvent
**File:** `lipsync/training/generator/ProviderEvent.as`  
**Imports:** `flash.events.Event`, `lipsync.core.phoneme.Phoneme`  
**Description:** Custom event carrying training sample data.

**Constants (internal static):** `TRAINING_SEQ:String = "training_seq"`

**Properties (internal):** `phoneme:Phoneme`, `sampleArraySet:Array`

**Constructor:** `ProviderEvent(type:String, bubbles:Boolean = false, cancelable:Boolean = false)`

---

### 3.11 lipsync.player.LipsyncPlayer
**File:** `lipsync/player/LipsyncPlayer.as`  
**Imports:** `flash.events.*`, `flash.media.*`, `flash.net.URLRequest`, `flash.utils.ByteArray`, `flash.utils.Timer`, `lipsync.core.*`  
**Description:** Core audio playback + real-time phoneme recognition engine.

**Properties (private):**
- `network:NeuralNetwork` — Trained neural network
- `phonemePositionStep:int` — Step between phoneme recognition positions
- `phonemeBufferArray:Array` — Pre-computed array of `LipsyncBufferItem`
- `soundVolume:Number`, `soundEnabled:Boolean`, `soundIsPlaying:Boolean`
- `soundsArray:Array`, `sound:Sound`, `soundChannel:SoundChannel`
- `dispatchEventTimer:Timer` — Timer for amplitude dispatch
- `recognizePhonemeTimer:Timer` — Timer for playback-synced phoneme dispatch
- `dispatchEventDelay:int`

**Methods (public):**
- `LipsyncPlayer(dispatchDelay:int, init_volume:Number = 1.0)` — Constructor
- `setupNeuralNetwork(network:NeuralNetwork):void`
- `isSoundEnabled():Boolean`, `isSoundPlaying():Boolean`
- `setSoundVolume(volume:Number):void`, `getSoundVolume():Number`
- `playSounds(soundsArray:Array):void` — Play a list of audio files sequentially
- `playSound(url:String):void` — Play a single audio file
- `stopPlaying():void`

**Methods (private):**
- `playNextSound():void` — Loads and plays next audio file
- `soundLoaded(event:Event):void` — Starts playback, starts timers, pre-computes phoneme buffer
- `soundLoadError(event:Event):void` — Skips to next file on error
- `soundPlayComplete(event:Event = null):void` — Cleans up, plays next or dispatches PLAYING_COMPLETE
- `dispatchSoundEvent(event:Event):void` — Dispatches AMPLITUDE_SAMPLE with average of left/right peak
- `preparePhonemeBuffer():void` — Pre-computes phoneme classifications for entire audio
- `setupBuffer():void` — **Spike-noise filter**: smooths isolated phoneme mismatches (if center differs from both neighbors, replace center with neighbor)
- `recognizeLipsyncEvent(event:Event):void` — Called by timer; reads from pre-computed buffer based on playback position, dispatches PHONEME event
- `recognizePhoneme(position:int):LipsyncBufferItem` — Extracts audio, runs LP.analyze() + network.run(), converts to phoneme. Only runs if energy ≥ activationEnergy
- `extractSound(position:int):LipsyncBufferItem` — Extracts decimated audio samples, computes energy (sum of absolute values / length)

**Key algorithms:**
1. **Phoneme pre-buffering:** On sound load, pre-computes phoneme for every `recognizePhonemeDelay * samplingRateMS` position across the entire audio
2. **Spike noise filter (`setupBuffer`):** Smooths isolated frames — if frame differs from both adjacent frames, replace it with the majority neighbor
3. **Playback-synced dispatch (`recognizeLipsyncEvent`):** Uses `Timer` at `LipsyncSettings.recognizePhonemeDelay` ms; shifts from pre-computed buffer, does NOT re-analyze during playback
4. **Energy-based gating:** Only classifies frames with `energy ≥ activationEnergy`; otherwise returns `Phoneme.NULL`

**Events dispatched (via LipsyncEvent):**
- `AMPLITUDE_SAMPLE` — On timer, carries `amplitude` (mean of left/right peak)
- `PHONEME` — On timer, carries `phoneme` and `amplitude` (energy)
- `PLAYING_START` — When sound begins playing
- `PLAYING_COMPLETE` — When all sounds finish

---

### 3.12 lipsync.player.LipsyncEvent
**File:** `lipsync/player/LipsyncEvent.as`  
**Imports:** `flash.events.Event`, `flash.utils.ByteArray`, `lipsync.core.phoneme.Phoneme`  
**Description:** Custom event for lipsync system.

**Constants (static public):**
- `AMPLITUDE_SAMPLE:String = "soundev_amplitude_sample"`
- `PHONEME:String = "soundev_phoneme"`
- `PLAYING_COMPLETE:String = "soundev_complete"`
- `PLAYING_ERROR:String = "soundev_error"`
- `PLAYING_START:String = "soundev_start"`

**Properties (public):**
- `amplitude:Number`
- `phoneme:Phoneme = Phoneme.NULL`

**Constructor:** `LipsyncEvent(type:String, bubbles:Boolean = false, cancelable:Boolean = false)`

---

### 3.13 lipsync.player.LipsyncBufferItem
**File:** `lipsync/player/LipsyncBufferItem.as`  
**Imports:** `lipsync.core.phoneme.Phoneme`  
**Description:** Data class for a single phoneme recognition frame.

**Properties (public):** `phoneme:Phoneme`, `position:int`, `energy:Number`, `samples:Vector.<Number>`

**Constructor:** `LipsyncBufferItem()` — Initializes phoneme to NULL, energy to 0

---

### 3.14 lipsync.training.LipsyncTrainer (file-level, not in a package)
**File:** `lipsync/training/LipsyncTrainer.as`  
**Imports:** Flash UI classes, `lipsync.core.*`, `lipsync.player.*`, `lipsync.training.*`  
**Description:** Module-level (no class) training UI logic. All functions and variables are `internal`. This is not a class file — it's ActionScript file-level code meant to be included in an FLA's frame.

**Internal variables:**
- `targetMSE:Number`, `epochsToRun:int`, `learningRate:Number`
- `hiddenLayers:int`, `hiddenNeuronsPerLayer:int`
- `network:NeuralNetwork`, `trainer:TrainingPatternGenerator`
- `trainingSequence:Vector.<TrainingPattern>`
- `soundPlayer:LipsyncPlayer`
- `totalTraining:Boolean = false`

**Internal functions:**
- `init():void` — Creates NeuralNetwork, creates LipsyncPlayer with network, wires up PHONEME listener
- `setVariablesFunction():void` — Reads all settings from UI text fields, sets `LipsyncSettings.*` and `LP.order`
- `loadSamples():void` — Creates TrainingPatternGenerator for `../lib/male/`, adds sequences with specific phoneme time ranges, calls `start()`
- `onTrainingSequence(evt:Event):void` — Receives generated patterns, calls `partialTraining()` if `totalTraining`
- `runNetwork(file:String = ""):void` — Plays `../lib/`+file through the network
- `trainNetwork():void` — Calls `network.train()` with training sequence
- `completeTraining():void` — Full training cycle: init → loadSamples → partial training loop
- `partialTraining():void` — Single training iteration; recurses via `loadSamples()` until MSE ≤ targetMSE
- `saveNetwork():void` — Saves network as `network_image` via FileReference
- `loadNetwork():void` — Loads `../lib/network_image` via URLLoader, restores UI fields
- `clearNetwork():void` — Reinitializes network
- `onGetPhoneme(event:LipsyncEvent):void` — Writes phoneme.symbol to output
- `writeTo(obj:TextArea, text:String, date:Boolean = false, ln:Boolean = true):void` — Logging helper

**Training data mapping (from comments):** Labels time ranges (in seconds) within audio files to specific phonemes. Uses both "aeiou.mp3" and "example.mp3". Male voice training defined; female voice training commented out.

---

### 3.15 avatar3D.AvatarCore
**File:** `avatar3D/AvatarCore.as`  
**Imports:** `avatar3D.*`, `away3d.containers.ObjectContainer3D`, `flash.events.*`, `flash.utils.Timer`  
**Description:** Base class for 3D avatar management. Manages face features, blinking, viseme/emotion control, and look-at behavior.

**Properties (protected):** `avatar:ObjectContainer3D`

**Properties (internal):**
- `left_eye:AvatarEye`, `right_eye:AvatarEye`
- `mouth:AvatarMouth`, `neck:AvatarNeck`
- `blinkDelay:Number`

**Properties (private):**
- `blinkTimer:Timer`
- `visemeValue:Number`, `emotionValue:Number`
- `viseme:AvatarExpression`, `emotion:AvatarExpression`

**Methods (public):**
- `AvatarCore()` — Empty constructor
- `setAvatarObject3D(avatar:ObjectContainer3D):void`
- `getAvatarObject3D():ObjectContainer3D`
- `setEmotion(emotion:AvatarExpression, value:Number = NaN):void` — Sets emotion and applies to mouth via `mouth.setViseme()`
- `setViseme(viseme:AvatarExpression, value:Number = NaN):void` — Sets viseme and applies to mouth
- `setVisemeValue(value:Number):void` — Updates viseme value only (no mouth update — commented out)
- `setEmotionValue(value:Number):void` — Updates emotion value with mouth viseme
- `lookAt(mouseX:Number, mouseY:Number):void` — Transforms mouse coords to look direction, delegates to neck and eyes
- `openMouth(value:Number):void` — Direct jaw rotation control

**Methods (protected):**
- `initAvatarCore():void` — Starts blink timer

**Methods (private):**
- `onBlinkTimer(event:Event):void` — Triggers both eyes to blink

---

### 3.16 avatar3D.AvatarBuilder
**File:** `avatar3D/AvatarBuilder.as`  
**Imports:** `avatar3D.*`, `util.AvatarXMLProvider`, `away3d.containers.ObjectContainer3D`  
**Description:** Assembles an avatar from XML configuration and 3D model.

**Properties (private):** `avatarObject:ObjectContainer3D`, `avatarXML:XML`, `avatar:AvatarAnimator`

**Methods (public):**
- `AvatarBuilder(avatarObject:ObjectContainer3D)` — Constructor; creates AvatarAnimator, loads XML, initializes expressions
- `buildAvatar():AvatarAnimator` — Full avatar assembly: eyes, neck, mouth → `initAvatar()`

**Methods (private):**
- `initExpressions():void` — Calls `ExpressionsCollection.initCollection()` with XML expressions
- `setupAvatarEyes():void` — Reads blink_delay, blink_time, blink_pause from XML; creates left/right AvatarEye
- `setupAvatarMouth():void` — Creates AvatarMouth from XML
- `setupAvatarNeck():void` — Creates AvatarNeck from XML

---

### 3.17 avatar3D.AvatarAnimator
**File:** `avatar3D/AvatarAnimator.as`  
**Extends:** `AvatarCore`  
**Imports:** `avatar3D.expression.*`, `flash.events.*`, `lipsync.core.*`, `lipsync.player.*`, `util.NeuralNetworkProvider`  
**Description:** Extends AvatarCore with complete lipsync-driven animation.

**Properties (private):** `lipsync:LipsyncPlayer`, `i:int`

**Methods (public):**
- `AvatarAnimator()` — Creates LipsyncPlayer, loads NeuralNetwork via NeuralNetworkProvider, sets recognizePhonemeDelay=50, wires PHONEME and PLAYING_COMPLETE listeners
- `initAvatar():void` — Calls parent `initAvatarCore()`
- `saySentence(soundFile:String):void` — Plays a single audio file
- `saySentences(soundFiles:Array):void` — Plays a list of audio files
- `isSpeaking():Boolean` — Queries LipsyncPlayer
- `saySentencesUsingNetwork(soundFiles:Array, nnetowrk:NeuralNetwork):void` — Plays with a different network

**Methods (private):**
- `onLipsyncEvent(event:LipsyncEvent):void` — **Core viseme driver**: looks up viseme by `event.phoneme.visemeId` in ExpressionsCollection, calls `setViseme(expression, amplitude * 13.5)`
- `onLipsyncComplete(event:Event):void` — Returns mouth to neutral with tween over 0.5s

---

### 3.18 avatar3D.core.BoneParameter (Interface)
**File:** `avatar3D/core/BoneParameter.as`  
**Description:** Interface for bone parameter control.

**Methods:**
- `set value(value:Number):void`
- `get value():Number`
- `refreshValue(change:Number):void`
- `setValueTween(value:Number, time:Number, delay:Number = 0.0, transition:String = "linear"):void`

---

### 3.19 avatar3D.core.bone.BoneRot
**File:** `avatar3D/core/bone/BoneRot.as`  
**Implements:** `BoneParameter`  
**Imports:** `away3d.containers.Bone`, `caurina.transitions.Tweener`  
**Description:** Controls bone rotation with inertia and tweening via the Tweener library.

**Properties (private):** `bone:Bone`, `min:Number`, `def:Number`, `max:Number`, `currentWeight:Number`, `nextWeight:Number`

**Constructor:** `BoneRot(bone:Bone, xml:XMLList)` — Reads def/min/max/inertia from XML, initializes bone rotation to default

**Methods (public — from interface):**
- `set value(value:Number):void` — **Inertia blending**: `bone.rotationX = bone.rotationX * currentWeight + nextWeight * (def + max/min * value)`. Positive values use `max`, negative use `min`.
- `get value():Number` — Returns `bone.rotationX`
- `refreshValue(change:Number):void` — `bone.rotationX *= (nextWeight * change + currentWeight)`
- `setValueTween(value:Number, time:Number, delay:Number = 0.0, transition:String = "linear"):void` — Uses `caurina.transitions.Tweener` for smooth transitions

**Algorithm:** Inertia-weighted blending between current position and target. The inertia from XML configures how much the previous frame's value persists (smoothing).

---

### 3.20 avatar3D.core.bone.BoneMov
**File:** `avatar3D/core/bone/BoneMov.as`  
**Implements:** `BoneParameter`  
**Imports:** `away3d.containers.Bone`, `caurina.transitions.Tweener`  
**Description:** Controls bone position (x-axis translation) with inertia and tweening. Identical algorithm to BoneRot but on `bone.x`.

**Properties (private):** `bone:Bone`, `min:Number`, `def:Number`, `max:Number`, `currentWeight:Number`, `nextWeight:Number`

**Constructor:** `BoneMov(bone:Bone, xml:XMLList)` — `def = bone.x + xml.@def` (relative offset from current position)

**Methods:** Same interface as BoneRot but on `bone.x`

---

### 3.21 avatar3D.core.AvatarFeature
**File:** `avatar3D/core/AvatarFeature.as`  
**Imports:** `avatar3D.core.*`, `avatar3D.expression.*`, `away3d.containers.*`, `util.AvatarDebugger`  
**Description:** Represents a single avatar bone/feature with 3 rotation + 3 movement parameters.

**Properties (public):**
- `rotX:BoneParameter`, `rotY:BoneParameter`, `rotZ:BoneParameter`
- `movX:BoneParameter`, `movY:BoneParameter`, `movZ:BoneParameter`

**Constructor:** `AvatarFeature(avatar:ObjectContainer3D, parameter:XMLList)` — Looks up bone by name, creates BoneRot/BoneMov for each axis from XML config

**Methods (public):**
- `setParameter(value:Number, parameter:ExpressionParameter):void` — Applies value × ExpressionParameter coefficients to rotation and/or movement BoneParameters
- `setParameterTween(value:Number, parameter:ExpressionParameter, time:Number):void` — Same with Tweener

**Algorithm:** Each avatar bone has up to 6 degrees of freedom (rotX/Y/Z, movX/Y/Z). `ExpressionParameter` defines per-axis coefficients and whether rotation/movement is active.

---

### 3.22 avatar3D.expression.AvatarExpression
**File:** `avatar3D/expression/AvatarExpression.as`  
**Imports:** `avatar3D.expression.setting.ExpressionParameter`  
**Description:** Data class defining a facial expression or viseme via parameterized face features.

**Properties (public):**
- `alias:String`, `id:int`
- `jaw:ExpressionParameter`, `tongue:ExpressionParameter`
- `mouth_r:ExpressionParameter`, `mouth_l:ExpressionParameter`
- `lip_down_r/m/l:ExpressionParameter` (right, middle, left)
- `lip_top_r/m/l:ExpressionParameter` (right, middle, left)
- `cheek_r:ExpressionParameter`, `cheek_l:ExpressionParameter`
- `cheekb_r:ExpressionParameter`, `cheekb_l:ExpressionParameter` (cheekbones)

**Constructor:** `AvatarExpression(xml:Object)` — Parses all 14 facial feature parameters from XML

---

### 3.23 avatar3D.expression.ExpressionsCollection
**File:** `avatar3D/expression/ExpressionsCollection.as`  
**Imports:** none (uses AvatarExpression defined in same package)  
**Description:** Singleton registry of all expressions (7 emotions + N visemes).

**Properties (static public):**
- `visemes:Array` — Array of AvatarExpression (viseme shapes)
- `NEUTRAL:AvatarExpression`
- `JOY:AvatarExpression`
- `SADNESS:AvatarExpression`
- `ANGER:AvatarExpression`
- `FEAR:AvatarExpression`
- `DISGUST:AvatarExpression`
- `SURPRISE:AvatarExpression`

**Methods (static public):**
- `initCollection(xml:XMLList):void` — Initializes all 7 emotions and iterates XML's `<visemes>` children to populate viseme array
- `combine(viseme:AvatarExpression, expression:AvatarExpression):AvatarExpression` — Stub, returns null (not implemented)
- `getVisemeByAlias(alias:String):AvatarExpression` — Linear search by alias, returns NEUTRAL as fallback
- `getVisemeById(id:int):AvatarExpression` — Linear search by id, returns NEUTRAL as fallback

---

### 3.24 avatar3D.expression.setting.ExpressionParameter
**File:** `avatar3D/expression/setting/ExpressionParameter.as`  
**Description:** Configuration data for one facial feature's movement/rotation coefficients.

**Properties (public):**
- `rotation:Boolean` — Whether rotation is active
- `rot_x:Number = 0.0`, `rot_y:Number = 0.0`, `rot_z:Number = 0.0`
- `movement:Boolean` — Whether movement is active
- `mov_x:Number = 0.0`, `mov_y:Number = 0.0`, `mov_z:Number = 0.0`

**Constructor:** `ExpressionParameter(xml:XMLList)` — Parses XML attributes; detects rotation/movement active if any axis attribute is present

---

### 3.25 avatar3D.face.mouth.AvatarMouth
**File:** `avatar3D/face/mouth/AvatarMouth.as`  
**Imports:** `avatar3D.core.AvatarFeature`, `avatar3D.expression.*`, `away3d.containers.ObjectContainer3D`  
**Description:** Mouth assembly — 14 AvatarFeature instances mapping to facial bones.

**Properties (public):** `jaw`, `tongue`, `mouth_r/l`, `lip_down_r/m/l`, `lip_top_r/m/l`, `cheek_r/l`, `cheekb_r/l` — all `AvatarFeature`

**Methods (public):**
- `AvatarMouth(avatar:ObjectContainer3D, xml:XMLList)` — Creates all 14 features from XML
- `smile(value:Number):void` — Raises mouth corners
- `setViseme(value:Number, viseme:AvatarExpression):void` — Applies viseme to all 14 features via `setParameter()`
- `setNeutral(time:Number):void` — Tweens all features to neutral position over `time` seconds

---

### 3.26 avatar3D.face.eyes.AvatarEye
**File:** `avatar3D/face/eyes/AvatarEye.as`  
**Imports:** `avatar3D.core.AvatarFeature`, `away3d.containers.ObjectContainer3D`, `flash.events.*`, `flash.utils.Timer`  
**Description:** Eye assembly with blinking and gaze control.

**Properties (private):** `blinkTime:Number`, `blinkPause:Number`, `blinkTimer:Timer`, `eyeball:AvatarFeature`, `eyelid:AvatarFeature`, `eyebrow_i:AvatarFeature`, `eyebrow_o:AvatarFeature`

**Methods (public):**
- `AvatarEye(avatar:ObjectContainer3D, xml:XMLList)` — Creates eyelid, eyeball, inner/outer eyebrow features
- `setupMotionParameters(blinkTime:Number, blinkPause:Number):void`
- `blink():void` — Two tweens: close (easeInOutSine) → pause → open (easeInOutSine)
- `close():void` — Close eyelid with easeOutCubic
- `open():void` — Restart blink timer
- `lookAt(posX:Number, posY:Number):void` — Rotates eyeball, raises/lowers eyebrows proportionally

---

### 3.27 avatar3D.face.neck.AvatarNeck
**File:** `avatar3D/face/neck/AvatarNeck.as`  
**Imports:** `avatar3D.core.AvatarFeature`, `away3d.containers.ObjectContainer3D`  
**Description:** Neck with two segments for head movement.

**Properties (private):** `neckLow:AvatarFeature`, `neckHigh:AvatarFeature`

**Methods (public):**
- `AvatarNeck(avatar:ObjectContainer3D, xml:XMLList)` — Creates low and high neck features
- `lookAt(posX:Number, posY:Number):void` — Rotates both neck segments; upper neck also gets Y rotation (sway)

---

### 3.28 generic3D.AvatarScene
**File:** `generic3D/AvatarScene.as`  
**Extends:** `away3d.containers.View3D`  
**Imports:** `avatar3D.AvatarAnimator`, `away3d.*`  
**Description:** Away3D viewport with avatar rendering.

**Methods (public):**
- `AvatarScene()` — Sets up Camera3D and Scene3D, enters ENTER_FRAME render loop
- `addAvatar(avatar:AvatarAnimator):void` — Adds avatar to 3D scene
- `removeAvatar(avatar:AvatarAnimator):void` — Removes avatar from 3D scene

**Methods (private):**
- `onEnterFrame(event:Event):void` — Calls `this.render()`

---

### 3.29 generic3D.collada.AvatarModelProvider
**File:** `generic3D/collada/AvatarModelProvider.as`  
**Extends:** `EventDispatcher`  
**Imports:** `away3d.*`, `flash.events.*`, `flash.utils.ByteArray`  
**Description:** Loads Collada (.dae) avatar models with embedded textures.

**Embedded assets:**
- `eye.jpg`, `teeth.jpg` (textures)
- `texture_m.jpg` (male skin), `texture.jpg` (female skin)
- `model.dae` (female mesh), `model_man.dae` (male mesh)

**Constants (static public):** `MALE:String = "MALE"`, `FEMALE:String = "FEMALE"`

**Properties (public):** `sex:String = MALE`

**Properties (private):** `modelMaterial:BitmapMaterial`, `eyeMaterial:BitmapMaterial`, `teethMaterial:BitmapMaterial`, `colladaParser:Collada`, `avatarModel:ObjectContainer3D`

**Methods (public):**
- `AvatarModelProvider(sex:String = FEMALE)`
- `readModel():void` — Creates materials, parses Collada geometry with scale 10.5
- `getModel():ObjectContainer3D` — Returns parsed model

**Methods (private):**
- `onParseCollada(event:ParserEvent):void` — Assigns materials (texture_jpg, eye_jpg, teeth_jpg_001), freezes bone rotations
- `setupObjectBones(model:Object):void` — Recursively touches `rotationX` on all children to freeze initial transforms

---

### 3.30 editor.LipsyncEditorWindow
**File:** `editor/LipsyncEditorWindow.as`  
**Extends:** `Sprite`  
**Imports:** `avatar3D.*`, `flash.display.*`, `flash.events.*`, `flash.filters.*`, `flash.geom.*`, `generic3D.*`, `util.*`, `lipsync.core.network.NeuralNetwork`  
**Description:** Main editor SWF window — avatar display with voice playback controls.

**Constants (static public):** `MALE:String`, `FEMALE:String`

**Properties (public):** `sex:String = FEMALE`

**Properties (private):**
- `avatarScene:AvatarScene`
- `modelProvider:AvatarModelProvider`
- `currentAvatar:AvatarAnimator`, `avatarMale:AvatarAnimator`, `avatarFemale:AvatarAnimator`
- `magnify:Bitmap` — Magnified face view
- `voiceNN:NeuralNetwork`, `voiceUrl:String`

**SWF Metadata:** `[SWF(backgroundColor="#ffffff", frameRate="18", quality="LOW", width="500", height="700")]`

**Methods (public):**
- `LipsyncEditorWindow()` — Full constructor: creates AvatarScene, loads female model first, sets up foreground UI, magnifying glass, camera position
- `changeSex():void` — Switches between male/female avatar and voice network

**Methods (private):**
- `onCompleteFemale(e:Event):void` — Builds female avatar, adds to scene, starts loading male model
- `onCompleteMale(e:Event):void` — Builds male avatar, selects current sex, loads appropriate neural network
- `onEnterFrame(event:Event):void` — Draws magnified view, updates lookAt with mouse position
- `createForeground():void` — White rectangle overlay for UI
- `drawMagnify():void` — Magnified face view (3.5x zoom, blur + glow filters) drawn from stage area
- `createLinks():void` — Creates 5 clickable voice sample labels (aeiou, count, example, lipsync, speech) + sex toggle
- `createLink(text:String, url:String):Label`
- `createLinkAction(file:String):Function` — Closure for playing voice files
- `createChangeSex(text:String):Label`

**Data flow:** Audio files served from `../lib/final/female/` or `../lib/final/male/`

---

### 3.31 scenes.SetupVisemeScene
**File:** `scenes/SetupVisemeScene.as`  
**Extends:** `Sprite`  
**Imports:** `avatar3D.*`, `away3d.*`, `flash.*`, `generic3D.*`  
**Description:** Viseme setup/test scene — loads avatar and cycles viseme v7.

**SWF Metadata:** `[SWF(backgroundColor="#000000", frameRate="20", quality="LOW", width="800", height="800")]`

**Methods (public):**
- `SetupVisemeScene()` — Creates AvatarScene, loads model

**Methods (private):**
- `onComplete(e:Event):void` — Builds avatar, adds to scene, loads XML, starts refresh timer
- `onEnterFrame(event:Event):void` — Mouse-driven lookAt
- `addRefresh():void` — 1-second timer to reload expression XML
- `reloadExpressions(e:Event):void` — Loads `../lib/xml/avatar_default.xml`
- `onLoadXML(e:Event):void` — Re-initializes expressions, sets viseme v7 at full intensity 10 times

---

### 3.32 scenes.LipsyncTestScene
**File:** `scenes/LipsyncTestScene.as`  
**Extends:** `Sprite`  
**Imports:** `flash.display.Sprite`, `lipsync.core.*`, `lipsync.player.*`, `util.NeuralNetworkProvider`  
**Description:** Minimal lipsync test — plays audio and traces viseme IDs.

**Methods (public):**
- `LipsyncTestScene()` — Creates LipsyncPlayer with network, plays `aeiou.mp3`
- `onGetPhoneme(event:LipsyncEvent):void` — Traces `phoneme.visemeId` if non-zero

---

### 3.33 scenes.ColladaTestScene
**File:** `scenes/ColladaTestScene.as`  
**Extends:** `Sprite`  
**Imports:** Same as SetupVisemeScene  
**Description:** Collada model test — loads avatar and plays a sentence.

**SWF Metadata:** Same as SetupVisemeScene

**Methods (public):**
- `ColladaTestScene()` — Same structure as SetupVisemeScene

**Methods (private):**
- `onComplete(e:Event):void` — Builds avatar, adds to scene, calls `saySentences(["../lib/amy_aeiou.mp3"])`, loads XML with viseme "U"
- `onEnterFrame`: Same mouse lookAt
- `addRefresh`, `reloadExpressions`, `onLoadXML`: Same as SetupVisemeScene

---

### 3.34 util.NeuralNetworkProvider
**File:** `util/NeuralNetworkProvider.as`  
**Imports:** `flash.utils.ByteArray`, `lipsync.core.network.NeuralNetwork`  
**Description:** Provides pre-trained neural networks from embedded binary assets.

**Embedded assets (static public):**
- `networkImageMale:Class` — `../../lib/lipsync/network_image_m`
- `networkImageFemale:Class` — `../../lib/lipsync/network_image_f`

**Methods (static public):**
- `getNetwork():NeuralNetwork` — Loads male network, returns NeuralNetwork
- `build(imageClass:Class):NeuralNetwork` — Loads network from arbitrary embedded class

---

### 3.35 util.LookAtPoint
**File:** `util/LookAtPoint.as`  
**Description:** Smoothing filter for look-at coordinates.

**Properties (public):** `x:Number`, `y:Number`
**Properties (private):** `nextWeight:Number`, `currentWeight:Number`

**Constructor:** `LookAtPoint(inertia:Number)` — Sets smoothing weights: `currentWeight = inertia`, `nextWeight = 1 - inertia`

**Methods (public):**
- `lookAt(x:Number, y:Number):void` — `this.x = this.x * currentWeight + x * nextWeight` (exponential smoothing)

---

### 3.36 util.Label
**File:** `util/Label.as`  
**Extends:** `MovieClip`  
**Imports:** `flash.display.MovieClip`, `flash.events.*`, `flash.text.*`  
**Description:** Clickable text label for UI buttons.

**Methods (public):**
- `Label(text:String)` — Creates TextField with Lucida Console 20px font
- `onMouseClick(onMouseClick:Function):void` — Registers MouseEvent.CLICK listener

---

### 3.37 util.DAECompressor
**File:** `util/DAECompressor.as`  
**Extends:** `Sprite`  
**Imports:** `flash.display.Sprite`, `flash.net.FileReference`, `flash.utils.ByteArray`  
**Description:** Utility to deflate-compress the Collada model file and save it.

**Embedded asset:** `model.dae`

**Constructor:** `DAECompressor()` — Deflates and saves as "model"

---

### 3.38 util.AvatarXMLProvider
**File:** `util/AvatarXMLProvider.as`  
**Imports:** `flash.utils.ByteArray`  
**Description:** Provides avatar configuration XML from embedded asset.

**Embedded asset:** `../../lib/xml/avatar_default.xml`

**Properties (public):** `xml:XML`

**Constructor:** `AvatarXMLProvider()` — Loads and parses embedded XML

---

### 3.39 util.AvatarDebugger
**File:** `util/AvatarDebugger.as`  
**Description:** Static logging utility.

**Methods (static public):**
- `log(log:String):void` — `[LOG]:`
- `debug(debug:String):void` — `[DEBUG]:`
- `error(error:String):void` — `[ERROR]:`

---

## 4. DEPENDENCY GRAPH (file-level imports)

### 4.1 Layer 0 — No internal dependencies (leaf nodes)
| File | Depends On |
|---|---|
| `Phoneme.as` | — |
| `LipsyncSettings.as` | — |
| `LP.as` | — |
| `Neuron.as` | — |
| `TrainingPattern.as` | — (imports Vector3D unused) |
| `BoneParameter.as` | — (interface) |
| `ExpressionParameter.as` | — |
| `AvatarDebugger.as` | — |
| `LookAtPoint.as` | — |
| `Label.as` | — |
| `DAECompressor.as` | — |
| `LipsyncBufferItem.as` | `Phoneme` |
| `ProviderEvent.as` | `Phoneme` |
| `LipsyncEvent.as` | `Phoneme` |

### 4.2 Layer 1
| File | Depends On |
|---|---|
| `PhonemeCollection.as` | `LipsyncSettings` |
| `SampleProvider.as` | `LipsyncSettings`, `LP`, `Phoneme`, `ProviderEvent` |
| `TrainingPatternGenerator.as` | `Phoneme`, `PhonemeCollection`, `TrainingPattern`, `SampleProvider`, `ProviderEvent` |
| `LipsyncPlayer.as` | `LipsyncSettings`, `LP`, `NeuralNetwork`, `Phoneme`, `PhonemeCollection`, `LipsyncEvent`, `LipsyncBufferItem` |
| `NeuralNetwork.as` | `LipsyncSettings`, `LP`, `TrainingPattern` |
| `LipsyncTrainer.as` (file-level) | `LipsyncSettings`, `LP`, `NeuralNetwork`, `Phoneme`, `PhonemeCollection`, `LipsyncPlayer`, `LipsyncEvent`, `TrainingPatternGenerator`, `TrainingPattern` |
| `BoneRot.as` | `BoneParameter` |
| `BoneMov.as` | `BoneParameter` |
| `AvatarExpression.as` | `ExpressionParameter` |
| `AvatarFeature.as` | `BoneRot`, `BoneMov`, `BoneParameter`, `ExpressionParameter`, `AvatarDebugger` |
| `AvatarMouth.as` | `AvatarFeature`, `AvatarExpression`, `ExpressionsCollection` |
| `AvatarEye.as` | `AvatarFeature` |
| `AvatarNeck.as` | `AvatarFeature` |
| `AvatarXMLProvider.as` | — (flash only) |
| `NeuralNetworkProvider.as` | `NeuralNetwork` |
| `AvatarModelProvider.as` | — (away3d + flash only) |

### 4.3 Layer 2
| File | Depends On |
|---|---|
| `ExpressionsCollection.as` | `AvatarExpression` |
| `AvatarCore.as` | `AvatarExpression`, `ExpressionsCollection`, `AvatarNeck`, `AvatarEye`, `AvatarMouth` |
| `AvatarAnimator.as` | `ExpressionsCollection`, `LipsyncSettings`, `NeuralNetwork`, `LipsyncEvent`, `LipsyncPlayer`, `NeuralNetworkProvider` |
| `AvatarBuilder.as` | `ExpressionsCollection`, `AvatarMouth`, `AvatarXMLProvider`, `AvatarEye`, `AvatarNeck`, `AvatarAnimator` |

### 4.4 Layer 3 — Application entry points
| File | Depends On |
|---|---|
| `AvatarScene.as` | `AvatarAnimator` |
| `SetupVisemeScene.as` | `AvatarAnimator`, `AvatarBuilder`, `ExpressionsCollection`, `AvatarScene`, `AvatarModelProvider` |
| `ColladaTestScene.as` | `AvatarAnimator`, `AvatarBuilder`, `ExpressionsCollection`, `AvatarScene`, `AvatarModelProvider` |
| `LipsyncTestScene.as` | `LipsyncSettings`, `LipsyncEvent`, `LipsyncPlayer`, `NeuralNetworkProvider` |
| `LipsyncEditorWindow.as` | `AvatarAnimator`, `AvatarBuilder`, `AvatarScene`, `AvatarModelProvider`, `Label`, `NeuralNetwork`, `NeuralNetworkProvider` |

---

## 5. DATA FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TRAINING PIPELINE                            │
│                                                                     │
│  Audio files (MP3)                                                  │
│       │                                                             │
│       ▼                                                             │
│  TrainingPatternGenerator.addSequence()                             │
│    └─ queues: (filename, phoneme, [samplePositions])                │
│       │                                                             │
│       ▼                                                             │
│  SampleProvider.readTrainingSequence()                              │
│    └─ loads Sound via URLRequest                                    │
│       │                                                             │
│       ▼                                                             │
│  SampleProvider.extractSound(position)                              │
│    └─ Sound.extract() → ByteArray                                   │
│    └─ Decimate (skip channels)                                      │
│    └─ Returns Vector.<Number> (raw PCM samples)                     │
│       │                                                             │
│       ▼                                                             │
│  LP.analyze(samples)                                                │
│    └─ createWindow() → Hamming window                               │
│    └─ computeAutocorrelation() → Burg method                        │
│    └─ computeCoef() → Durbin-Levinson recursion                     │
│    └─ Returns LPC reflection coefficients (order=9)                 │
│       │                                                             │
│       ▼                                                             │
│  TrainingPatternGenerator.getTrainingSeq()                          │
│    └─ input = LPC coefficients                                      │
│    └─ output = PhonemeCollection.phonemeToArray(phoneme)            │
│    └─ Creates TrainingPattern                                       │
│       │                                                             │
│       ▼                                                             │
│  NeuralNetwork.train(patterns, epochs, rate)                        │
│    └─ Forward pass: run(input) via sigmoid neurons                  │
│    └─ Backprop: adjust() with momentum                              │
│    └─ Returns MSE                                                   │
│       │                                                             │
│       ▼                                                             │
│  NeuralNetwork.save() → ByteArray (compressed)                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    INFERENCE / PLAYBACK PIPELINE                     │
│                                                                     │
│  LipsyncPlayer.playSound(url)                                       │
│    └─ Loads Sound, starts playback + timers                         │
│       │                                                             │
│       ▼                                                             │
│  preparePhonemeBuffer()                                             │
│    └─ For each position across sound duration:                      │
│    └─ extractSound(position)                                        │
│    └─ Compute energy (mean abs value)                               │
│       │                                                             │
│       ▼  (if energy >= activationEnergy)                            │
│    └─ LP.analyze(samples) → LPC coefficients                       │
│    └─ NeuralNetwork.run(LPC) → output vector                       │
│    └─ PhonemeCollection.arrayToPhoneme(output) → Phoneme           │
│    └─ Store in LipsyncBufferItem[]                                  │
│       │                                                             │
│       ▼                                                             │
│  setupBuffer() — Spike noise filter                                 │
│       │                                                             │
│       ▼  (on timer tick)                                            │
│  recognizeLipsyncEvent()                                            │
│    └─ Read pre-computed item from buffer                            │
│    └─ Dispatch LipsyncEvent.PHONEME                                 │
│       │                                                             │
│       ▼                                                             │
│  AvatarAnimator.onLipsyncEvent()                                    │
│    └─ ExpressionsCollection.getVisemeById(visemeId)                 │
│    └─ AvatarCore.setViseme(expression, amplitude * 13.5)           │
│       │                                                             │
│       ▼                                                             │
│  AvatarMouth.setViseme(value, expression)                           │
│    └─ For each of 14 facial features:                               │
│    └─ AvatarFeature.setParameter(value, parameter)                  │
│       │                                                             │
│       ▼                                                             │
│  BoneRot.value = value * coefficient  (for rotation axes)           │
│  BoneMov.value = value * coefficient  (for movement axes)           │
│    └─ Inertia-weighted blending                                     │
│    └─ Modifies bone.rotationX / bone.x directly                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       ANIMATION LOOP                                 │
│                                                                     │
│  AvatarScene (ENTER_FRAME) → render()                               │
│  LipsyncEditorWindow (ENTER_FRAME) →                                │
│    └─ drawMagnify()                                                 │
│    └─ currentAvatar.lookAt(mouseX, mouseY)                          │
│       │                                                             │
│       ▼                                                             │
│  AvatarCore.lookAt(x, y)                                            │
│    ├─ neck.lookAt(x/2, y/2)                                         │
│    ├─ left_eye.lookAt(x, y)                                         │
│    └─ right_eye.lookAt(x, y)                                        │
│       │                                                             │
│       ▼                                                             │
│  AvatarNeck.lookAt → neckHigh.rotZ/X/Y, neckLow.rotZ/X             │
│  AvatarEye.lookAt → eyeball.rotX/Y, eyebrow.movY                   │
│                                                                     │
│  Blink Timer (every blinkDelay ms):                                 │
│    └─ AvatarCore.onBlinkTimer()                                     │
│       ├─ left_eye.blink()                                           │
│       └─ right_eye.blink()                                          │
│          └─ eyelid.rotX tween: close → pause → open                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. ALGORITHM SUMMARY

| Algorithm | Location | Description |
|---|---|---|
| **Hamming window** | `LP.createWindow()` | `w[n] = 0.54 - 0.46·cos(2πn/(L-1))` |
| **Burg-method autocorrelation** | `LP.computeAutocorrelation()` | Lattice filter with pre-emphasis, computes R[0..order] |
| **Durbin-Levinson recursion** | `LP.computeCoef()` | Solves Yule-Walker equations for LPC reflection coefficients |
| **LPC analysis** | `LP.analyze()` | Window → Autocorrelation → Durbin-Levinson → `order` coefficients |
| **Logistic sigmoid** | `Neuron.calculateValue()` | `σ(z) = 1/(1+exp(-z))` |
| **Backpropagation (with momentum)** | `Neuron.adjustWeights()` | `δ = error·σ·(1-σ)`, `Δw = δ·input·η + momentum·α` |
| **Multi-layer feed-forward** | `NeuralNetwork.run()` | Layer-by-layer forward propagation |
| **Adaptive learning rate** | `NeuralNetwork.train()` | `η = η_initial · MSE` |
| **Early stopping** | `NeuralNetwork.train()` | Halts when MSE ≤ targetMSE (default 0.02) |
| **Fisher-Yates shuffle** | `NeuralNetwork.shufflePatterns()` | Random pattern permutation per epoch |
| **Binary phoneme encoding** | `PhonemeCollection.phonemeToArray()` | `outputCount`-bit binary encoding |
| **Binary phoneme decoding** | `PhonemeCollection.arrayToPhoneme()` | Threshold 0.5 per bit |
| **Decimated audio extraction** | `SampleProvider.extractSound()`, `LipsyncPlayer.extractSound()` | Reads 1 sample per `4*(decimate+1)` bytes |
| **Energy computation** | `LipsyncPlayer.extractSound()` | `Σ|sample| / length` |
| **Energy gating** | `LipsyncPlayer.recognizePhoneme()` | Skip classification if energy < 0.025 |
| **Spike noise filter** | `LipsyncPlayer.setupBuffer()` | Replace isolated phoneme mismatches with neighbor |
| **Pre-buffered playback** | `LipsyncPlayer` | Pre-computes entire phoneme sequence, dispatches from buffer in sync |
| **Inertia-weighted blending** | `BoneRot.value`, `BoneMov.value` | `new = old·inertia + target·(1-inertia)` |
| **Tweener animation** | `BoneRot.setValueTween()`, `BoneMov.setValueTween()` | `caurina.transitions.Tweener` for smooth transitions |
| **Look-at smoothing** | `LookAtPoint.lookAt()` | Exponential moving average |
| **Viseme → bone mapping** | `AvatarFeature.setParameter()` | `value × ExpressionParameter.coefficients` applied to 6 DOF |

---

## 7. CONSTANTS AND ENUMS

### 7.1 Event Types (String Constants)

| Constant | Value | File |
|---|---|---|
| `ProviderEvent.TRAINING_SEQ` | `"training_seq"` | ProviderEvent.as |
| `LipsyncEvent.AMPLITUDE_SAMPLE` | `"soundev_amplitude_sample"` | LipsyncEvent.as |
| `LipsyncEvent.PHONEME` | `"soundev_phoneme"` | LipsyncEvent.as |
| `LipsyncEvent.PLAYING_COMPLETE` | `"soundev_complete"` | LipsyncEvent.as |
| `LipsyncEvent.PLAYING_ERROR` | `"soundev_error"` | LipsyncEvent.as |
| `LipsyncEvent.PLAYING_START` | `"soundev_start"` | LipsyncEvent.as |

### 7.2 Sex Constants

| Constant | Value | File |
|---|---|---|
| `AvatarModelProvider.MALE` | `"MALE"` | AvatarModelProvider.as |
| `AvatarModelProvider.FEMALE` | `"FEMALE"` | AvatarModelProvider.as |
| `LipsyncEditorWindow.MALE` | `"MALE"` | LipsyncEditorWindow.as |
| `LipsyncEditorWindow.FEMALE` | `"FEMALE"` | LipsyncEditorWindow.as |

### 7.3 Emotion Constants (ExpressionsCollection)

| Property | Type |
|---|---|
| `ExpressionsCollection.NEUTRAL` | `AvatarExpression` |
| `ExpressionsCollection.JOY` | `AvatarExpression` |
| `ExpressionsCollection.SADNESS` | `AvatarExpression` |
| `ExpressionsCollection.ANGER` | `AvatarExpression` |
| `ExpressionsCollection.FEAR` | `AvatarExpression` |
| `ExpressionsCollection.DISGUST` | `AvatarExpression` |
| `ExpressionsCollection.SURPRISE` | `AvatarExpression` |

---

## 8. EXTERNAL LIBRARIES

| Library | Usage | Files |
|---|---|---|
| **Away3D** (away3d.*) | 3D rendering, bones, Collada parser, materials, cameras | AvatarScene, AvatarCore, AvatarFeature, BoneRot, BoneMov, AvatarMouth, AvatarEye, AvatarNeck, AvatarModelProvider, SetupVisemeScene, ColladaTestScene, LipsyncEditorWindow |
| **caurina.transitions.Tweener** | Smooth tweening of bone properties | BoneRot, BoneMov |
| **Flex/Flash** (mx.*) | TextArea, Alert components | LipsyncTrainer |

---

## 9. FILE SIZES & COMPLEXITY

| File | Lines | Est. Complexity |
|---|---|---|
| `LipsyncPlayer.as` | 297 | Highest — audio engine + recognition pipeline |
| `LipsyncTrainer.as` (file-level) | 247 | High — training UI logic |
| `NeuralNetwork.as` | 217 | High — serialization, training, backprop |
| `LipsyncEditorWindow.as` | 194 | High — full editor UI |
| `LP.as` | 128 | Medium — LPC algorithm |
| `AvatarCore.as` | 123 | Medium — facial animation control |
| `TrainingPatternGenerator.as` | 92 | Medium — sample generation |
| `BoneRot.as` | 86 | Medium — inertia/tween |
| `BoneMov.as` | 87 | Medium — inertia/tween |
| `AvatarMouth.as` | 87 | Medium — 14-feature viseme mapping |
| `AvatarBuilder.as` | 76 | Medium — avatar assembly |
| `AvatarFeature.as` | 75 | Medium — bone parameterization |
| `Neuron.as` | 68 | Medium — backprop neuron |
| `AvatarEye.as` | 62 | Medium — blink/gaze |
| `ExpressionsCollection.as` | 57 | Small — expression registry |
| `AvatarExpression.as` | 49 | Small — expression data |
| `Phoneme.as` | 39 | Small — phoneme constants |
| `SampleProvider.as` | 77 | Medium — audio feature extraction |
| `AvatarScene.as` | 35 | Small — 3D viewport |
| `NeuralNetworkProvider.as` | 32 | Small — embedded network loader |
| `Label.as` | 32 | Small — UI label |
| `AvatarNeck.as` | 29 | Small — neck control |
| `AvatarDebugger.as` | 26 | Small — trace logging |
| `LookAtPoint.as` | 25 | Small — smoothing filter |
| `LipsyncEvent.as` | 24 | Small — event class |
| `DAECompressor.as` | 24 | Small — deflate utility |
| `LipsyncSettings.as` | 21 | Small — global config |
| `ProviderEvent.as` | 21 | Small — event class |
| `LipsyncBufferItem.as` | 21 | Small — buffer data |
| `LipsyncTestScene.as` | 29 | Small — test scene |
| `SetupVisemeScene.as` | 94 | Medium — viseme test |
| `ColladaTestScene.as` | 97 | Medium — collada test |
| `ExpressionParameter.as` | 37 | Small — config data |
| `AvatarXMLProvider.as` | 21 | Small — XML loader |
| `BoneParameter.as` | 17 | Small — interface |
| `TrainingPattern.as` | 13 | Small — data class |

**Total: 39 files, ~2,700 lines of ActionScript 3**
