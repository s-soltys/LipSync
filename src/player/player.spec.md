# Audio Pipeline — Algorithm Specification

> Based on `LipsyncPlayer.as`, `LipsyncSettings.as`, `LipsyncEvent.as`, `LipsyncBufferItem.as` (ActionScript 3, LipSync project)
> Port target: TypeScript

---

## 1. Overview

The audio pipeline extracts windows of audio from a PCM stream, performs LPC analysis, runs the result through a neural network, and dispatches phoneme events in near-real-time synchronisation with playback.

**Processing chain:**

1. **Sound extraction** — read `windowLength` ms of 32-bit float PCM samples
2. **Decimation** — keep every 7th sample (stride = `samplingDecimate + 1`)
3. **Energy computation** — $\frac{1}{N}\sum |sample|$ (Voice Activity Detection)
4. **LPC analysis** — 9 reflection coefficients (see `lpc.spec.md`)
5. **Neural network inference** — 9-input MLP → 6-output binary vector
6. **Binary decoding** — threshold at ≥ 0.5, map to phoneme ID
7. **Pre-buffering** — entire phoneme timeline computed before playback starts
8. **Temporal smoothing** — 3-point outlier filter on phoneme sequence
9. **Event dispatch** — `AMPLITUDE_SAMPLE`, `PHONEME`, `PLAYING_START`, `PLAYING_COMPLETE`

---

## 2. Settings (from `LipsyncSettings.as`)

| Constant | Value | Meaning |
|----------|-------|---------|
| `samplingRate` | 44100 | Input audio sample rate (Hz) |
| `samplingRateMS` | 44.1 | Samples per millisecond |
| `samplingDecimate` | 6 | Downsampling factor — keep every `stride = 7`th sample |
| `windowLength` | 18 | Analysis window duration (ms) |
| `recognizePhonemeDelay` | 20 | Interval between phoneme recognitions (ms) |
| `activationEnergy` | 0.025 | Energy threshold for voice activity detection |
| `outputCount` | 6 | NN output count (binary viseme encoding width) |

---

## 3. TypeScript Type Signatures

```typescript
// ── Settings ───────────────────────────────────────────────────────
interface LipsyncSettings {
  readonly outputCount: number;          // = 6
  readonly samplingDecimate: number;     // = 6
  readonly samplingRate: number;         // = 44100
  readonly samplingRateMS: number;       // = 44.1
  readonly windowLength: number;         // = 18
  readonly recognizePhonemeDelay: number; // = 20
  readonly activationEnergy: number;     // = 0.025
}

// ── Phoneme model (from Phoneme.as + PhonemeCollection.as) ────────
interface Phoneme {
  readonly symbol: string;   // e.g. "v1a", "v1b", …, "v9b"
  readonly id: number;       // numerical ID: 2, 3, 6, 7, …, 62, 63
  readonly visemeId: number; // viseme group [1..9]
}

// NULL phoneme: { symbol: "", id: 0, visemeId: 0 }
const PHONEME_NULL: Phoneme;

// ── Buffer item ────────────────────────────────────────────────────
interface LipsyncBufferItem {
  phoneme: Phoneme;     // recognised phoneme (default: NULL)
  position: number;     // sample position in the audio
  energy: number;       // computed energy (VAD)
  samples: number[];    // decimated samples for this window
}

// ── Events ─────────────────────────────────────────────────────────
type LipsyncEventType =
  | 'AMPLITUDE_SAMPLE'   // periodic amplitude dispatch
  | 'PHONEME'            // phoneme recognised
  | 'PLAYING_START'      // playback started
  | 'PLAYING_COMPLETE'   // all sounds finished
  | 'PLAYING_ERROR';     // sound load/play error

interface LipsyncEvent {
  readonly type: LipsyncEventType;
  readonly phoneme: Phoneme;   // for PHONEME events
  readonly amplitude: number;  // for AMPLITUDE_SAMPLE and PHONEME events
}

// ── Player class ───────────────────────────────────────────────────
interface LipsyncPlayer {
  // Volume
  setSoundVolume(volume: number): void;
  getSoundVolume(): number;
  isSoundEnabled(): boolean;
  isSoundPlaying(): boolean;

  // Playback
  playSounds(urls: string[]): void;
  playSound(url: string): void;
  stopPlaying(): void;

  // Events (subscribe)
  on(event: LipsyncEventType, callback: (e: LipsyncEvent) => void): void;

  // Neural network (must be set up before play)
  setupNeuralNetwork(network: NeuralNetwork): void;
}

// ── Neural network interface ───────────────────────────────────────
interface NeuralNetwork {
  run(input: number[]): number[];
}
```

---

## 4. Algorithm — Step by Step

### 4.1 Audio Extraction (`extractSound`)

**Input:** Current playback position (sample index)

```typescript
function extractSound(position: number): LipsyncBufferItem {
  const SAMPLES_TO_EXTRACT =
    Math.floor(LipsyncSettings.windowLength * LipsyncSettings.samplingRateMS);
  // = 18 × 44.1 = 793.8 → 794 samples (AS3 truncates via int cast)

  // Extract 794 32-bit float PCM samples starting at `position`
  const rawBuffer: Float32Array = extractPCM(position, SAMPLES_TO_EXTRACT);
  // In AS3: sound.extract(buffer, 794, position)

  return decimateAndComputeEnergy(rawBuffer);
}
```

### 4.2 Decimation (`extractSound`, continued)

$$\text{stride} = \text{samplingDecimate} + 1 = 7$$

```typescript
function decimateAndComputeEnergy(rawBuffer: Float32Array): {
  samples: number[];
  energy: number;
} {
  const stride = LipsyncSettings.samplingDecimate + 1; // = 7
  const samples: number[] = [];
  let energy = 0;

  // In AS3: offset = 4 * (samplingDecimate + 1) = 28 bytes
  // The raw buffer is read as sequential 32-bit floats;
  // offset = 28 bytes skips 7 floats (keep 1, skip 6)
  for (let i = 0; i < rawBuffer.length; i += stride) {
    const sample = rawBuffer[i];
    samples.push(sample);
    energy += Math.abs(sample);
  }

  energy /= samples.length; // mean absolute value

  return { samples, energy };
}
```

**Result:** $N_{\text{samples}} \approx \lceil 794 / 7 \rceil = 114$ samples per window
(actual: `Math.ceil(793.8 / 7) ≈ 114`).

### 4.3 Energy (Voice Activity Detection)

$$E = \frac{1}{N} \sum_{i=0}^{N-1} |s_i|$$

**Threshold:** $\text{activationEnergy} = 0.025$

If $E \ge 0.025$, the LPC analysis and NN inference are performed. Otherwise, the phoneme remains `NULL`.

### 4.4 Phoneme Recognition (`recognizePhoneme`)

```typescript
function recognizePhoneme(position: number): LipsyncBufferItem {
  const item = extractSound(position);

  if (item.energy >= LipsyncSettings.activationEnergy) {
    const K = LP.analyze(item.samples);              // 9 reflection coefficients
    const result = neuralNetwork.run(K);             // 6 NN outputs (sigmoid activations)
    item.phoneme = PhonemeCollection.arrayToPhoneme(result); // binary decode
  }
  // else: item.phoneme stays PHONEME_NULL

  return item;
}
```

### 4.5 Binary Decoding (`PhonemeCollection.arrayToPhoneme`)

The 6-element NN output vector is decoded as a big-endian binary number:

```typescript
function arrayToPhoneme(array: number[]): Phoneme {
  if (isNaN(array[0])) return PHONEME_NULL;

  let id = 0;
  let mult = 1;

  for (let i = array.length - 1; i >= 0; i--) {
    if (array[i] >= 0.5) {   // threshold
      id += mult;
    }
    mult *= 2;
  }

  return PhonemeCollection.getById(id);
}
```

**Encoding scheme (LSB-first iteration, MSB-first accumulation):**

| Array index | Bit weight |
|-------------|------------|
| `array[5]` (last) | $2^0 = 1$ |
| `array[4]` | $2^1 = 2$ |
| `array[3]` | $2^2 = 4$ |
| `array[2]` | $2^3 = 8$ |
| `array[1]` | $2^4 = 16$ |
| `array[0]` (first) | $2^5 = 32$ |

This maps directly to the phoneme IDs in `phoneme-model.json`:
- NULL = 0 (`000000`)
- v1a = 2  (`000010` → `010000` in the encoding... let me double check)

Wait, let me re-derive. The AS3 code:

```as3
result = new Vector.<Number>();
for (i = 0; i <= digits - 1; i++) result[i] = 0;
for (i = digits - 1; i >= 0; i--) {
    if ((id - Math.pow(2, i)) >= 0) {
        result[digits - 1 - i] = 1;
        id -= Math.pow(2,i);
    }
}
```

For `phonemeToArray`: it iterates `i` from `digits-1` (5) down to 0, setting `result[digits-1-i]`.

- If `id >= 2⁵=32`, set `result[0] = 1` and subtract 32
- If `id >= 2⁴=16` (after any subtraction), set `result[1] = 1` and subtract 16
- etc.

So `result[0]` is the MSB (bit 5, weight 32), `result[5]` is the LSB (bit 0, weight 1).

For `arrayToPhoneme`: it iterates from index `array.length-1` (5) down to 0:
- Start: `result = 0, mult = 1`
- `i=5`: if `array[5] >= 0.5`, `result += 1`; `mult = 2`
- `i=4`: if `array[4] >= 0.5`, `result += 2`; `mult = 4`
- `i=3`: if `array[3] >= 0.5`, `result += 4`; `mult = 8`
- `i=2`: if `array[2] >= 0.5`, `result += 8`; `mult = 16`
- `i=1`: if `array[1] >= 0.5`, `result += 16`; `mult = 32`
- `i=0`: if `array[0] >= 0.5`, `result += 32`

This is consistent: `array[0]` = MSB (32), `array[5]` = LSB (1).

Now check v1a (id = 2):
- binary of 2 = `000010` (6 bits)
- In `arrayToPhoneme` ordering: `[0, 0, 0, 0, 1, 0]`
- So `array[0]=0, array[1]=0, array[2]=0, array[3]=0, array[4]=1, array[5]=0`

Wait, the phoneme-model.json shows `"binary_encoding": [0, 1, 0, 0, 0, 0]` for v1a.

Let me check: 2 = 0×32 + 0×16 + 0×8 + 0×4 + 1×2 + 0×1... no that's 2.
2 = 0×32 + 0×16 + 0×8 + 0×4 + 1×2 + 0×1
So bits: [0, 0, 0, 0, 1, 0]

But the JSON says [0, 1, 0, 0, 0, 0]...

Let me re-check. From `phonemeToArray`:

```as3
for (i = digits - 1; i >= 0; i--) {
    if ((id - Math.pow(2, i)) >= 0) {
        result[digits - 1 - i] = 1;
        id -= Math.pow(2,i);
    }
}
```

For id=2, digits=6:
- i=5: 2-32<0 → result[0]=0
- i=4: 2-16<0 → result[1]=0
- i=3: 2-8<0 → result[2]=0
- i=2: 2-4<0 → result[3]=0
- i=1: 2-2≥0 → result[4]=1, id=0
- i=0: 0-1<0 → result[5]=0

So result = [0, 0, 0, 0, 1, 0]... hmm, but phoneme-model.json says [0, 1, 0, 0, 0, 0].

Wait, that's interesting. Let me re-read phoneme-model.json more carefully:

```json
{
    "constant": "v1a",
    "id": 2,
    "binary_encoding": [0, 1, 0, 0, 0, 0]
}
```

And `"binary_string": "010000"`.

But from my computation: `result = [0, 0, 0, 0, 1, 0]` with binary string "000010".

There might be a discrepancy in how the JSON was generated vs. the actual code. Let me check if the `phonemeToArray` function in the source matches what I computed...

Actually, looking more carefully: `binary_string` in the JSON is "010000" for v1a (id=2). That means `[0, 1, 0, 0, 0, 0]` which in the encoding scheme `result[0..5]` would give: `result[0]=0, result[1]=1, result[2]=0, result[3]=0, result[4]=0, result[5]=0`.

For `arrayToPhoneme`:
- `array[5]=0` → mult=1, result+=0
- `array[4]=0` → mult=2, result+=0
- `array[3]=0` → mult=4, result+=0
- `array[2]=0` → mult=8, result+=0
- `array[1]=1` → mult=16, result+=16
- `array[0]=0` → mult=32, result+=0

Result = 16, not 2. That doesn't match!

Hmm, wait. Let me re-read the `arrayToPhoneme`:

```as3
public static function arrayToPhoneme(array:Vector.<Number>):Phoneme {
    if (isNaN(array[0])) return Phoneme.NULL;
    
    var result:int = 0;
    var mult:int = 1;
    for (var i:int = array.length - 1; i >= 0; i--) {
        var value:Number = array[i];
        
        if (array[i] >= 0.5) {
            result += mult;
        }
        mult *= 2;
    }
    return PhonemeCollection.getById(result);
}
```

Starting from end:
- i=5 (last element): if array[5] >= 0.5 → result += 1 (2^0); mult = 2
- i=4: if array[4] >= 0.5 → result += 2 (2^1); mult = 4
- i=3: if array[3] >= 0.5 → result += 4 (2^2); mult = 8
- i=2: if array[2] >= 0.5 → result += 8 (2^3); mult = 16
- i=1: if array[1] >= 0.5 → result += 16 (2^4); mult = 32
- i=0: if array[0] >= 0.5 → result += 32 (2^5); mult = 64

So array[5]=LSB, array[0]=MSB.

For binary_encoding [0, 1, 0, 0, 0, 0]:
- array[5]=0, array[4]=0, array[3]=0, array[2]=0, array[1]=1, array[0]=0
- result = 0 + 0 + 0 + 0 + 16 + 0 = 16

But v1a has id=2, not 16!

Hmm, this means either:
1. The JSON ground truth is generated differently (maybe the binary encoding was transposed), or
2. The `phonemeToArray` function produces a different ordering than what `arrayToPhoneme` expects

Let me check with `phonemeToArray`:

```as3
public static function phonemeToArray(phoneme:Phoneme):Vector.<Number> {
    var id:int = phoneme.id;
    var digits:int = LipsyncSettings.outputCount;
    
    var result:Vector.<Number> = new Vector.<Number>();
    for (var i:Number = 0; i <= digits - 1; i++) result[i] = 0;
    for (i = digits - 1; i >= 0; i--) {
        if ((id - Math.pow(2, i)) >= 0) {
            result[digits - 1 - i] = 1;
            id -= Math.pow(2,i);
        }
    }
    return result;
}
```

For id=2, digits=6:
- i=5: 2-32<0 → result[0]=0
- i=4: 2-16<0 → result[1]=0
- i=3: 2-8<0 → result[2]=0
- i=2: 2-4<0 → result[3]=0
- i=1: 2-2>=0 → result[4]=1, id=0
- i=0: 0-1<0 → result[5]=0

So `phonemeToArray(Phoneme.v1a)` = [0, 0, 0, 0, 1, 0]

And `arrayToPhoneme([0, 0, 0, 0, 1, 0])`:
- array[5]=0 → 0
- array[4]=0 → 0
- array[3]=0 → 0
- array[2]=1 → 8
- array[1]=0 → 0
- array[0]=0 → 0
- result = 8

Wait, that gives 8 not 2 either!

Hmm, let me re-read more carefully. result = [0, 0, 0, 0, 1, 0] from phonemeToArray for id=2.

So array = [0, 0, 0, 0, 1, 0] where array[0]=0, array[1]=0, array[2]=0, array[3]=0, array[4]=1, array[5]=0.

`arrayToPhoneme([0, 0, 0, 0, 1, 0])`:
- i=5: array[5]=0 < 0.5 → skip; mult=2
- i=4: array[4]=1 >= 0.5 → result=0+2=2; mult=4
- i=3: array[3]=0 < 0.5 → skip; mult=8
- i=2: array[2]=0 < 0.5 → skip; mult=16
- i=1: array[1]=0 < 0.5 → skip; mult=32
- i=0: array[0]=0 < 0.5 → skip; mult=64

result = 2. That's correct!

Wait, I got confused earlier. Let me recheck: array[4]=1, mult at that point is 2, so result += 2 → result = 2. 

And for the phoneme-model.json which says encoding [0, 1, 0, 0, 0, 0]:
- array[5]=0, mult=1
- array[4]=0, mult=2
- array[3]=0, mult=4
- array[2]=0, mult=8
- array[1]=1, mult=16 → result += 16
- array[0]=0, mult=32

result = 16. That doesn't match.

So either the JSON has a different encoding convention, or it's wrong. Let me check a few more:

v1b (id=3): phonemeToArray(3):
- i=5: 3-32<0 → result[0]=0
- i=4: 3-16<0 → result[1]=0
- i=3: 3-8<0 → result[2]=0
- i=2: 3-4<0 → result[3]=0
- i=1: 3-2>=0 → result[4]=1, id=1
- i=0: 1-1>=0 → result[5]=1, id=0

result = [0, 0, 0, 0, 1, 1]

But JSON says: [1, 1, 0, 0, 0, 0], binary_string "110000".

These are clearly different. The JSON seems to be using MSB-first array order (array[0]=MSB), while the code also uses array[0]=MSB... 

Wait, let me re-examine. The phoneme-model.json for NULL (id=0): [0,0,0,0,0,0], binary_string "000000" — that's fine.

For v1a (id=2): JSON says [0,1,0,0,0,0], binary_string "010000". 
So binary_string "010000" → array[0]=0, array[1]=1, array[2]=0, array[3]=0, array[4]=0, array[5]=0.
If this is MSB-first (array[0]=32, array[5]=1):
result = 0×32 + 1×16 + 0×8 + 0×4 + 0×2 + 0×1 = 16

But v1a has id=2, not 16. If it's LSB-first (array[0]=1, array[5]=32):
result = 0×1 + 1×2 + 0×4 + 0×8 + 0×16 + 0×32 = 2 ✓

So the JSON binary_string "010000" is **LSB-first** (array[0]=LSB=1, array[5]=MSB=32).

But the code's `arrayToPhoneme` processes from i=array.length-1 (5) to 0, with mult starting at 1:
- i=5 → array[5] weight 1 (LSB)
- i=4 → array[4] weight 2
- ...
- i=0 → array[0] weight 32 (MSB)

So the code's array convention is: **array[0]=MSB, array[5]=LSB** — which is standard MSB-first.

The JSON binary_string "010000": if array[0]=0 (MSB=0), array[1]=1 (weight 16), array[2]=0 (weight 8), etc.
Then result = 0×32 + 1×16 + 0×8 + ... = 16. But we expect 2.

Hmm, but if binary_string "010000" is read as: array[0]=MSB=0, array[1]=1 (32÷2=16)... then it gives 16, not 2.

Let me try LSB-first: if binary_string "010000" means array[0]=LSB=0, array[1]=1 (weight 2), array[2]=0 (weight 4), etc.
Then result = 0×1 + 1×2 + 0×4 + ... = 2. That works!

So the JSON's binary_string is LSB-first (or the binary representation is reversed from the code's).

But wait, for v9b (id=63): binary_string "111111".
LSB-first: 1+2+4+8+16+32 = 63 ✓
MSB-first: 32+16+8+4+2+1 = 63... also works since all 1s.

For v3a (id=10): binary_string "010100".
LSB-first: 0×1 + 1×2 + 0×4 + 1×8 + 0×16 + 0×32 = 2+8 = 10 ✓

So yes, the JSON's binary_string is LSB-first. But when stored as binary_encoding array, looking at the JSON:
```json
"binary_encoding": [0, 1, 0, 0, 0, 0],
"binary_string": "010000"
```
The binary_encoding matches the binary_string left-to-right. But the code's array convention is MSB-first. So there's a discrepancy between the ground truth and the code...

Actually, wait. Let me check the code more carefully.

For `arrayToPhoneme`, the enumeration goes:
```
for (i = array.length - 1; i >= 0; i--)
```
So i=5 is the LAST element (highest index), i=0 is the FIRST element.

When mult=1 at i=5 (last element), the LAST element has weight 1 (LSB).
When mult=32 at i=0 (first element), the FIRST element has weight 32 (MSB).

So in the code: **array[0] = MSB** (weight 32), **array[5] = LSB** (weight 1).

Now the JSON: `[0, 1, 0, 0, 0, 0]` → if this is [MSB, ..., LSB]:
- array[0]=0 → weight 32
- array[1]=1 → weight 16  
- result = 16

If this is [LSB, ..., MSB]:
- array[0]=0 → weight 1
- array[1]=1 → weight 2
- result = 2 ← correct!

So the JSON array is LSB-first (index 0 = LSB). But the code array is MSB-first (index 0 = MSB).

This means either:
1. The JSON ground truth was generated by a different version of the encoding function
2. The JSON uses a reversed convention

In any case, this is a discrepancy that the spec should note. The TS port must follow the AS3 code's convention exactly.

Actually, wait. Let me re-examine `phonemeToArray` more carefully:

```as3
for (i = digits - 1; i >= 0; i--) {
    if ((id - Math.pow(2, i)) >= 0) {
        result[digits - 1 - i] = 1;
        id -= Math.pow(2,i);
    }
}
```

Here: when i=5 (2^5=32), result[5-1-5]=result[0] gets set. So the FIRST element (index 0) corresponds to the HIGHEST power (2^5=32). So array[0]=MSB.

But when i=0 (2^0=1), result[5-1-0]=result[4] gets set. Hmm wait: digits=6, so digits-1-i = 5-i.

i=5 → result[0] = 1 if id >= 32 (weight 32)
i=4 → result[1] = 1 if id >= 16 (weight 16)
i=3 → result[2] = 1 if id >= 8 (weight 8)
i=2 → result[3] = 1 if id >= 4 (weight 4)
i=1 → result[4] = 1 if id >= 2 (weight 2)
i=0 → result[5] = 1 if id >= 1 (weight 1)

So `phonemeToArray` produces: result[0]=MSB(32), result[5]=LSB(1).

And `arrayToPhoneme` expects: array[0]=MSB(32), array[5]=LSB(1). Good, they're consistent.

But the JSON `binary_encoding` is `[0, 1, 0, 0, 0, 0]` for id=2.
Code would produce: `[0, 0, 0, 0, 1, 0]` for id=2.

So the JSON and the code differ in ordering! The JSON is LSB-first, the code is MSB-first. This is important to note in the spec as a migration consideration.

Hmm, actually looking at the binary_string "010000" for id=2:
- This is 6-bit binary representation of 2: 0¹⁰²⁴... no, 2 in 6 bits is 000010.
- "010000" reversed is "000010" which is correct for 2.
- So binary_string is MSB-first (the natural binary representation), but binary_encoding is... hmm

Actually wait. Let me think about this differently.

2 in binary (6 bits) = 0 0 0 0 1 0 // MSB on the left

The JSON says binary_string = "010000". That doesn't spell 2. Unless:

"010000" interpreted as LSB-first → 0×2⁰ + 1×2¹ + 0×2² + 0×2³ + 0×2⁴ + 0×2⁵ = 2. That works!

So binary_string is LSB-first (leftmost bit is LSB). And binary_encoding matches that:
binary_encoding[0] = first char of binary_string = 0 = LSB

So the JSON convention is: array[0]=LSB, array[5]=MSB.

But the code convention is: array[0]=MSB, array[5]=LSB.

This means they're reversed. The TS port needs to be aware of this and choose the correct convention.

This is worth documenting in the spec. I'll note it as a migration consideration.

OK, let me now write the player spec, being thorough about all these details.

Now, for the buffer preparation:

```typescript
function preparePhonemeBuffer(soundLengthSamples: number): LipsyncBufferItem[] {
  const step = LipsyncSettings.recognizePhonemeDelay * LipsyncSettings.samplingRateMS;
  // = 20 × 44.1 = 882 samples

  const buffer: LipsyncBufferItem[] = [];

  for (let position = step; position < soundLengthSamples; position += step) {
    buffer.push(recognizePhoneme(position));
  }

  // Apply temporal smoothing
  temporalSmoothing(buffer);

  return buffer;
}
```

Wait, in the AS3 code:
```as3
phonemePositionStep = LipsyncSettings.recognizePhonemeDelay * LipsyncSettings.samplingRateMS;
// = 882

for (var position:int = phonemePositionStep; position < (sound.length * LipsyncSettings.samplingRateMS); position+=phonemePositionStep)
```

`sound.length` is in milliseconds (that's how Flash Sound.length works — returns duration in ms). So `sound.length * samplingRateMS` converts to samples.

But `position` starts at `phonemePositionStep` (882), not 0. This means the first phoneme analysis happens at sample 882 (20ms into the audio).

For temporal smoothing (setupBuffer):

```typescript
function temporalSmoothing(buffer: LipsyncBufferItem[]): void {
  for (let i = 1; i < buffer.length - 1; i++) {
    const prev = buffer[i - 1];
    const curr = buffer[i];
    const next = buffer[i + 1];

    // If current phoneme differs from both neighbors
    if (curr.phoneme !== prev.phoneme && curr.phoneme !== next.phoneme) {
      // Replace with the non-NULL neighbor, preferring next
      if (next.phoneme !== PHONEME_NULL) {
        curr.phoneme = next.phoneme;
      } else if (prev.phoneme !== PHONEME_NULL) {
        curr.phoneme = prev.phoneme;
      }
    }
  }
}
```

For runtime dispatch (recognizeLipsyncEvent):

```typescript
function recognizeLipsyncEvent(currentPosition: number): LipsyncBufferItem {
  const step = LipsyncSettings.recognizePhonemeDelay * LipsyncSettings.samplingRateMS;

  let item: LipsyncBufferItem | null = null;

  // Drain buffer items that are behind current position
  do {
    item = phonemeBufferArray.shift() ?? new LipsyncBufferItem();
  } while ((item.position + step) < currentPosition);

  return item;
}
```

Now let me write the full player spec.<｜end▁of▁thinking｜>

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="write_file">
<｜｜DSML｜｜parameter name="content" string="true"># Audio Pipeline — Algorithm Specification

> Based on `LipsyncPlayer.as`, `LipsyncSettings.as`, `LipsyncEvent.as`, `LipsyncBufferItem.as` (ActionScript 3, LipSync project)
> Port target: TypeScript

---

## 1. Overview

The audio pipeline extracts windows of audio from a PCM stream, decimates, computes energy (VAD), runs LPC analysis + neural network inference, and dispatches phoneme events synchronised with playback.

**Processing chain:**

1. **PCM extraction** — read `windowLength` ms (794 samples) of 32-bit float PCM
2. **Decimation** — keep every 7th sample (stride = `samplingDecimate + 1`)
3. **Energy (VAD)** — $\frac{1}{N}\sum_{i}|s_i|$, threshold 0.025
4. **LPC analysis** — 9 reflection coefficients (see `lpc.spec.md`)
5. **NN inference** — 9-input MLP → 6-output sigmoid vector
6. **Binary decoding** — threshold ≥ 0.5 per bit → phoneme ID
7. **Pre-buffering** — entire phoneme timeline computed before playback
8. **Temporal smoothing** — 3-point outlier filter
9. **Event dispatch** — amplitude (every `dispatchDelay` ms) + phoneme (every 20 ms)

---

## 2. Settings

| Constant | Value | Derivation |
|----------|-------|------------|
| `samplingRate` | 44100 Hz | Standard audio CD rate |
| `samplingRateMS` | 44.1 samples/ms | `44100 / 1000` |
| `samplingDecimate` | 6 | Downsample factor |
| `stride` | 7 | `samplingDecimate + 1` — keep every 7th sample |
| `windowLength` | 18 ms | Analysis window duration |
| `samplesPerWindow` | $794 \approx 18 \times 44.1$ | Raw PCM samples extracted per window |
| `decimatedSamples` | $\lceil 794 / 7 \rceil \approx 114$ | Samples after decimation |
| `recognizePhonemeDelay` | 20 ms | Interval between phoneme ticks |
| `stepSamples` | $882 = 20 \times 44.1$ | Samples per phoneme step |
| `activationEnergy` | 0.025 | VAD threshold (mean absolute amplitude) |
| `outputCount` | 6 | NN output count / binary encoding width |

---

## 3. TypeScript Type Signatures

```typescript
// ── Settings ───────────────────────────────────────────────────────
const SAMPLING_RATE = 44100;
const SAMPLING_RATE_MS = 44.1;
const SAMPLING_DECIMATE = 6;
const STRIDE = 7;                        // samplingDecimate + 1
const WINDOW_LENGTH_MS = 18;
const SAMPLES_PER_WINDOW = 794;          // floor(18 * 44.1)
const PHONEME_DELAY_MS = 20;
const STEP_SAMPLES = 882;               // 20 * 44.1
const ACTIVATION_ENERGY = 0.025;
const OUTPUT_COUNT = 6;

// ── Phoneme (from Phoneme.as) ──────────────────────────────────────
interface Phoneme {
  readonly symbol: string;   // e.g. "v1a", "v1b", …, "v9b", "" (NULL)
  readonly id: number;       // 0 (NULL), 2, 3, 6, 7, 10, 11, …, 62, 63
  readonly visemeId: number; // 0 (NULL), [1..9]
}

// Singleton NULL phoneme
declare const PHONEME_NULL: Phoneme;

// ── Buffer Item ────────────────────────────────────────────────────
interface LipsyncBufferItem {
  phoneme: Phoneme;     // Recognised phoneme (default: PHONEME_NULL)
  position: number;     // Sample position within audio
  energy: number;       // Mean absolute energy (VAD)
  samples: number[];    // Decimated samples (≈114 elements)
}

// ── Event Types ────────────────────────────────────────────────────
type LipsyncEventType =
  | 'AMPLITUDE_SAMPLE'   // Periodic (every dispatchDelay ms)
  | 'PHONEME'            // Every recognizePhonemeDelay ms (20ms)
  | 'PLAYING_START'      // First sound starts
  | 'PLAYING_COMPLETE'   // All sounds in queue finished
  | 'PLAYING_ERROR';     // Sound load/play error

interface LipsyncEvent {
  type: LipsyncEventType;
  phoneme: Phoneme;       // For PHONEME events
  amplitude: number;      // For AMPLITUDE_SAMPLE and PHONEME events
}

// ── Player ─────────────────────────────────────────────────────────
interface LipsyncPlayer {
  /** Set volume [0..1]. Volume=0 disables sound (mutes). */
  setSoundVolume(volume: number): void;
  getSoundVolume(): number;
  isSoundEnabled(): boolean;
  isSoundPlaying(): boolean;

  /** Play one or more audio URLs sequentially. */
  playSounds(urls: string[]): void;
  playSound(url: string): void;

  /** Stop all playback immediately. */
  stopPlaying(): void;

  /** Register event callback. */
  on(type: LipsyncEventType, cb: (event: LipsyncEvent) => void): void;

  /** Attach the trained neural network. Must be called before playSounds(). */
  setupNeuralNetwork(network: NeuralNetwork): void;
}

// ── Neural Network (provided externally) ──────────────────────────
interface NeuralNetwork {
  run(input: number[]): number[];
}

// ── LP analysis (see lpc.spec.md) ─────────────────────────────────
interface LP {
  readonly order: number; // = 9
  analyze(samples: number[]): number[]; // → 9 reflection coefficients
}

// ── PhonemeCollection (static helpers) ─────────────────────────────
interface PhonemeCollection {
  /** Look up phoneme by numeric ID. Returns PHONEME_NULL if not found. */
  getById(id: number): Phoneme;

  /** Encode phoneme ID → 6-element binary array. array[0]=MSB(32), array[5]=LSB(1). */
  phonemeToArray(phoneme: Phoneme): number[];

  /** Decode 6-element NN output → Phoneme. Threshold ≥ 0.5 per bit. Returns PHONEME_NULL on NaN in first element. */
  arrayToPhoneme(array: number[]): Phoneme;
}
```

---

## 4. Algorithm — Step by Step

### 4.1 PCM Extraction (`extractSound`)

**Input:** `position` — sample index in the audio stream

**Constants derived from settings:**
$$\text{SAMPLES\_TO\_EXTRACT} = \lfloor \text{windowLength} \times \text{samplingRateMS} \rfloor = \lfloor 18 \times 44.1 \rfloor = 794$$

**Pseudo-code:**
```typescript
function extractSound(position: number): LipsyncBufferItem {
  // Extract 794 32-bit float PCM samples starting at given position
  const rawBuffer: Float32Array = extractPCM(position, SAMPLES_PER_WINDOW);
  // In the original AS3: sound.extract(buffer, 794, position_ms)
  // where position_ms = position (samples → samples, same unit)

  return decimateAndComputeEnergy(rawBuffer);
}
```

### 4.2 Decimation

$$\text{stride} = \text{samplingDecimate} + 1 = 7$$

```typescript
function decimateAndComputeEnergy(rawBuffer: Float32Array): {
  samples: number[];
  energy: number;
} {
  const samples: number[] = [];
  let energy = 0;

  // Keep every 7th sample (indices 0, 7, 14, 21, …)
  // In AS3: buffer.position += 4 * (samplingDecimate + 1) = 28 bytes
  // (4 bytes per float32, skip 7 floats, keep 1)
  for (let i = 0; i < rawBuffer.length; i += STRIDE) {
    const sample = rawBuffer[i];
    samples.push(sample);
    energy += Math.abs(sample);
  }

  energy /= samples.length; // mean absolute value

  return { samples, energy };
}
```

**Result:** `samples.length = ⌈794 / 7⌉ ≈ 114` decimated samples per window.

### 4.3 Energy (Voice Activity Detection)

$$E = \frac{1}{N} \sum_{i=0}^{N-1} |s_i|$$

**Threshold:** $\text{activationEnergy} = 0.025$

If $E < 0.025$, the window is classified as silence and LPC/NN analysis is skipped.

### 4.4 Phoneme Recognition

```typescript
function recognizePhoneme(position: number): LipsyncBufferItem {
  const item = extractSound(position);

  if (item.energy >= ACTIVATION_ENERGY) {
    // 9 reflection coefficients from LPC analysis (see lpc.spec.md)
    const K = LP.analyze(item.samples);

    // 6-element output vector from neural network
    const nnOutput = neuralNetwork.run(K);

    // Decode binary vector → phoneme
    item.phoneme = PhonemeCollection.arrayToPhoneme(nnOutput);
  }
  // else: item.phoneme stays PHONEME_NULL (silence)

  return item;
}
```

### 4.5 Binary Decoding (`PhonemeCollection.arrayToPhoneme`)

The 6-element NN output vector is decoded as a **big-endian binary number** where the **first array element (index 0) is the MSB** (weight 32) and the **last element (index 5) is the LSB** (weight 1):

```typescript
function arrayToPhoneme(array: number[]): Phoneme {
  // Guard: NaN in first element → NULL
  if (isNaN(array[0])) return PHONEME_NULL;

  let id = 0;
  let multiplier = 1;  // 2^0

  // Iterate from last index to first (LSB → MSB)
  for (let i = array.length - 1; i >= 0; i--) {
    if (array[i] >= 0.5) {
      id += multiplier;
    }
    multiplier *= 2;   // 1 → 2 → 4 → 8 → 16 → 32
  }

  return PhonemeCollection.getById(id);
}
```

**Bit weights:**

| Array index | Weight | Description |
|-------------|--------|-------------|
| `array[0]` | 32 | MSB ($2^5$) |
| `array[1]` | 16 | ($2^4$) |
| `array[2]` | 8 | ($2^3$) |
| `array[3]` | 4 | ($2^2$) |
| `array[4]` | 2 | ($2^1$) |
| `array[5]` | 1 | LSB ($2^0$) |

**Example:** v1a (id=2) → NN output `[0, 0, 0, 0, 1, 0]` → `array[4]=1` at multiplier=2 → `id = 2`.

**Phoneme ID → binary encoding (inverse, `phonemeToArray`):**

```typescript
function phonemeToArray(phoneme: Phoneme): number[] {
  let id = phoneme.id;
  const result = new Array<number>(OUTPUT_COUNT).fill(0);

  for (let i = OUTPUT_COUNT - 1; i >= 0; i--) {
    const weight = Math.pow(2, i);  // 32, 16, 8, 4, 2, 1
    if (id >= weight) {
      result[OUTPUT_COUNT - 1 - i] = 1;  // MSB → index 0
      id -= weight;
    }
  }

  return result;
}
```

> **⚠️ Migration note:** The ground truth `phoneme-model.json` uses **LSB-first ordering** for its `binary_encoding` field (index 0 = LSB), which is the **reverse** of the AS3 code's convention (index 0 = MSB). When writing tests, either transpose or be explicit about which convention you follow. Follow the AS3 code convention for correctness.

### 4.6 Pre-Buffering (`preparePhonemeBuffer`)

Before playback starts, the **entire phoneme timeline** is pre-computed:

$$ \text{step} = \text{recognizePhonemeDelay} \times \text{samplingRateMS} = 20 \times 44.1 = 882 \text{ samples} $$

```typescript
function preparePhonemeBuffer(audioDurationSamples: number): LipsyncBufferItem[] {
  const step = PHONEME_DELAY_MS * SAMPLING_RATE_MS; // = 882
  const buffer: LipsyncBufferItem[] = [];

  // Start at step (not 0) — first analysis at 20ms
  // End at audioDurationSamples (sound.length * samplingRateMS)
  for (let position = step; position < audioDurationSamples; position += step) {
    buffer.push(recognizePhoneme(position));
  }

  // Apply temporal smoothing
  temporalSmoothing(buffer);

  return buffer;
}
```

**Buffer size:** $\lfloor (\text{audioDurationSamples} - \text{step}) / \text{step} \rfloor$ items.

### 4.7 Temporal Smoothing (`setupBuffer`)

3-point outlier filter that removes isolated single-frame phoneme flickers:

```typescript
function temporalSmoothing(buffer: LipsyncBufferItem[]): void {
  for (let i = 1; i < buffer.length - 1; i++) {
    const prev = buffer[i - 1];
    const curr = buffer[i];
    const next = buffer[i + 1];

    // If current phoneme differs from BOTH neighbors
    if (curr.phoneme !== prev.phoneme && curr.phoneme !== next.phoneme) {
      // Replace with the non-NULL neighbor, preferring next
      if (next.phoneme !== PHONEME_NULL) {
        curr.phoneme = next.phoneme;
      } else if (prev.phoneme !== PHONEME_NULL) {
        curr.phoneme = prev.phoneme;
      }
    }
  }
}
```

**Behaviour:**
- If the current frame is an outlier (different from both sides), it's replaced
- The **next** frame is preferred over the previous
- NULL frames are not used as replacement values
- The first and last buffer items are never modified

### 4.8 Runtime Event Dispatch

**Amplitude sampling** (every `dispatchDelay` ms, typically 100ms):

```typescript
function dispatchAmplitude(): LipsyncEvent {
  // Average of left and right channel peak levels
  const amplitude = 0.5 * (leftPeak + rightPeak);
  return { type: 'AMPLITUDE_SAMPLE', amplitude, phoneme: PHONEME_NULL };
}
```

**Phoneme dispatch** (every 20ms, synchronised with playback):

```typescript
function dispatchPhoneme(playbackPositionSamples: number): LipsyncEvent {
  const step = PHONEME_DELAY_MS * SAMPLING_RATE_MS; // = 882

  let item: LipsyncBufferItem | null = null;

  // Drain buffer items that are behind current position
  do {
    item = phonemeBuffer.shift() ?? new LipsyncBufferItem();
  } while ((item.position + step) < playbackPositionSamples);

  return {
    type: 'PHONEME',
    phoneme: item.phoneme,
    amplitude: item.energy,
  };
}
```

**Key point:** The buffer works as a **lookahead**. Items are pre-computed before playback starts (step 4.6) and consumed during playback by draining items whose positions fall behind the current playback head.

### 4.9 Playback Queue

Multiple audio URLs can be queued via `playSounds(urls: string[])`. They play sequentially:

```
playSounds([url1, url2, url3])
  → load url1
  → pre-compute phoneme buffer for url1
  → play url1, dispatch events
  → on SOUND_COMPLETE:
      if more URLs: load next URL
      else: dispatch PLAYING_COMPLETE
```

`stopPlaying()` clears the queue and stops the current sound immediately.

---

## 5. Math Notation Summary

| Step | Formula | Notes |
|------|---------|-------|
| Samples extracted | $S = \lfloor W \cdot R_{ms} \rfloor$ | $W=18\text{ms},\; R_{ms}=44.1$ → $S=794$ |
| Decimation | $s'_i = s_{i \cdot D},\; D = 7$ | Keep every 7th sample |
| Energy (VAD) | $E = \frac{1}{N}\sum\|s'_i\|$ | Threshold $\theta = 0.025$ |
| Phoneme step | $P = T \cdot R_{ms}$ | $T=20\text{ms}$ → $P=882$ |
| LPC → NN | $\mathbf{k} = \text{LP}(s'),\; \mathbf{y} = \text{NN}(\mathbf{k})$ | $\mathbf{k} \in \mathbb{R}^9,\; \mathbf{y} \in \mathbb{R}^6$ |
| Binary decode | $id = \sum_{i=0}^{5} \mathbb{1}[y_i \ge 0.5] \cdot 2^{5-i}$ | MSB at index 0 |
| Amplitude | $A = \frac{1}{2}(L_{\text{peak}} + R_{\text{peak}})$ | Mean of stereo peaks |

---

## 6. Edge Cases

| # | Edge Case | Behaviour | Mitigation |
|---|-----------|-----------|------------|
| 1 | **Silence / below energy threshold** | `energy < 0.025` → phoneme stays `NULL` (silence). LPC+NN skipped. | Energy threshold prevents classification of noise. |
| 2 | **Zero energy** (all samples = 0) | `energy = 0` → `NULL` phoneme. LPC would produce all-zero coefficients (guarded). | Edge case of silence. |
| 3 | **NaN in NN output (first element)** | `arrayToPhoneme` returns `PHONEME_NULL` immediately if `array[0]` is NaN. | Explicit NaN guard; other NaN elements are not checked individually. |
| 4 | **Audio shorter than one step** | `preparePhonemeBuffer` loop condition `position < durationSamples` → empty buffer. | No phoneme events will fire; only amplitude events occur. |
| 5 | **Single buffer item** | `temporalSmoothing` loop runs `[1, length-1)` → no items processed (needs 3 items). | No smoothing applied. Safe. |
| 6 | **Phoneme flicker** (one-frame outlier) | 3-point outlier filter replaces it with a neighbor's value. | Smoothing prevents visual jitter. |
| 7 | **Volume = 0** | `soundEnabled = false`, volume set to 0. Audio still plays silently. Phoneme recognition still runs. | VAD still works on silent audio (may be imprecise). |
| 8 | **Sound load error** | Error handler calls `playNextSound()` to skip to next URL. | Queue continues with remaining URLs. |
| 9 | **All sounds fail to load** | Queue empties → `PLAYING_COMPLETE` fires with `soundIsPlaying = false`. | Graceful degradation. |
| 10 | **Null/invalid position in buffer** | `phonemeBuffer.shift()` returns undefined → `new LipsyncBufferItem()` with defaults (NULL, 0, 0). | Defensive fallback. |
| 11 | **Buffer drain with gap** | Drain loop skips items that are `position + step < currentPosition` — handles cases where audio position has advanced unusually far. | No guarantees on phoneme granularity during seeking. |
| 12 | **LSB/MSB encoding mismatch** | The ground truth JSON (`phoneme-model.json`) stores arrays LSB-first; the AS3 code uses MSB-first. | TS port must decide which convention to follow and document it clearly. |

---

## 7. Ground-Truth Verification Files

| File | Path | What It Verifies |
|------|------|------------------|
| **Audio pipeline config** | `ground-truth/audio-pipeline.json` | Confirms all constants, formulae, and derived values (stride, samples per window, step samples, energy formula, activation threshold). |
| **LPC test vectors** | `ground-truth/lpc-test-vectors.json` | End-to-end: decimate → LP.analyze() → verify 9 coefficients. |
| **NN weights** | `ground-truth/nn-weights.json` | End-to-end: decimate → LP.analyze() → NN.run() → verify 6 output values. Contains trained weights for all layers (9→N→6). **Note:** many neurons have NaN weights — these are unused neurons from the `neuronsPerLayer` allocation; the TS port should handle NaN inputs by producing NaN outputs (which `arrayToPhoneme` guards against). |
| **Phoneme model** | `ground-truth/phoneme-model.json` | All 18 phonemes + NULL with IDs, viseme groups, and binary encodings. Use to verify `arrayToPhoneme()` and `phonemeToArray()`. |

### Recommended Verification Strategy

```
Test 1: Audio pipeline constants
  - Verify derived constants match audio-pipeline.json:
    stride = 7, samplesPerWindow = 794, stepSamples = 882

Test 2: Energy computation
  - Feed known audio window → verify energy = Σ|s|/N
  - Feed silence → energy ≈ 0 < 0.025 → NULL phoneme

Test 3: LPC → NN → Phoneme (end-to-end)
  - Extract window at known position
  - Decimate (stride = 7)
  - Run LP.analyze() → 9 coefficients
  - Feed into NN with weights from nn-weights.json
  - Feed NN output into arrayToPhoneme()
  - Compare phoneme against expected (from training data)

Test 4: Binary encoding round-trip
  - For each phoneme in phoneme-model.json:
    encoding ← phonemeToArray(phoneme)
    decoded ← arrayToPhoneme(encoding)
    assert decoded.id === phoneme.id

Test 5: Temporal smoothing
  - Buffer: [v1a, v2a, v3a] → middle differs from both → replaced with next (v3a)
  - Buffer: [v1a, v2a, v1a] → middle differs from both → replaced with next (v1a)
  - Buffer: [v1a, v5a, NULL] → middle differs, next is NULL → replaced with prev (v1a)
  - Buffer: [v1a, v5a, v5b] → middle matches neither → replaced with next (v5b)

Test 6: Buffer pre-computation
  - Audio duration 100ms → step 882 samples → buffer length = 1
  - Audio duration 1000ms → buffer length = floor((44100 - 882) / 882) = 49
```

---

## 8. Implementation Notes for TypeScript Port

### PCM Extraction in Node.js/Browser

The original AS3 used Flash's `Sound.extract(buffer, count, position)` which reads raw 32-bit float PCM from a decoded sound. In TypeScript the equivalent is:

```typescript
// Browser: AudioContext + decodeAudioData → AudioBuffer
// AudioBuffer.getChannelData(0) provides Float32Array
function extractPCM(
  audioBuffer: AudioBuffer,
  position: number,      // sample offset
  count: number          // samples to extract
): Float32Array {
  const channelData = audioBuffer.getChannelData(0); // mono
  const end = Math.min(position + count, channelData.length);
  return channelData.slice(position, end);
}
```

### Numerical Precautions

1. **Energy threshold**: Use `>= 0.025` (AS3 uses `>=` for the check)
2. **NaN guard**: `arrayToPhoneme` only checks `array[0]` for NaN — other NaN elements produce undefined behaviour in the bit accumulation. Consider hardening.
3. **Buffer position type**: AS3 `int` truncates — TS `number` (always 64-bit float) is fine but `Math.floor` may be needed for positions to match exactly.
4. **Float extraction precision**: `readFloat()` in AS3 is 32-bit; `Float32Array` in TS is also 32-bit — should match exactly.

### Architecture Diagram

```
Audio source → [Extract 794 samples] → [Decimate ×7] → [Energy VAD]
                                                              |
                                              energy < 0.025 ─┼─→ NULL phoneme
                                                              |
                                              energy ≥ 0.025  ↓
                                                     [LP.analyze()] → 9 coefficients
                                                              |
                                                     [NN.run()] → 6 outputs
                                                              |
                                                     [arrayToPhoneme()] → Phoneme
                                                              |
                                              ┌────────────────┴──────────────┐
                                              │  Pre-buffer entire timeline  │
                                              │  Temporal smoothing (3-point)│
                                              │  Dispatch on 20ms timer      │
                                              └───────────────────────────────┘
```
