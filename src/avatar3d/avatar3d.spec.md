# 3D Avatar System — TypeScript Specification

> **Source:** Reverse-engineered from `~/LipSync/src/avatar3D/`, `~/LipSync/src/editor/`, `~/LipSync/src/scenes/`, `~/LipSync/src/generic3D/`, and `~/LipSync/src/util/` (ActionScript 3 / Adobe AIR, Away3D + caurina Tweener).
>
> **References:** [LipSync/RESEARCH.md §5–6, §9](./RESEARCH.md)
>
> **Target platform:** TypeScript 5.x + Three.js (or equivalent WebGL engine)
>
> **Last updated:** 2026-06-16

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Bone Hierarchy](#2-bone-hierarchy)
3. [BoneParameter Interface & Inertia Blending](#3-boneparameter-interface--inertia-blending)
4. [AvatarFeature — 6-DOF Bone Wrapper](#4-avatarfeature--6-dof-bone-wrapper)
5. [AvatarMouth — 14-Feature Mouth System](#5-avatarmouth--14-feature-mouth-system)
6. [AvatarEye — Blink & Gaze System](#6-avatareye--blink--gaze-system)
7. [AvatarNeck — Two-Segment Neck](#7-avatarneck--two-segment-neck)
8. [Expression System (7 Emotions + N Visemes)](#8-expression-system-7-emotions--n-visemes)
9. [ExpressionsCollection — Static Registry](#9-expressionscollection--static-registry)
10. [ExpressionParameter — XML-Driven Param Multiplier](#10-expressionparameter--xml-driven-param-multiplier)
11. [Tweener Transition System](#11-tweener-transition-system)
12. [Blink Algorithm](#12-blink-algorithm)
13. [Gaze Algorithm](#13-gaze-algorithm)
14. [AvatarCore — Base Class](#14-avatarcore--base-class)
15. [AvatarAnimator — Lip-Sync Controller](#15-avataranimator--lip-sync-controller)
16. [AvatarBuilder — Factory from XML Config](#16-avatarbuilder--factory-from-xml-config)
17. [AvatarModelProvider — Collada DAE Import](#17-avatarmodelprovider--collada-dae-import)
18. [AvatarScene — View3D Wrapper](#18-avatarscene--view3d-wrapper)
19. [LipsyncEditorWindow — Main Editor Layout](#19-lipsynceditorwindow--main-editor-layout)
20. [Test Scenes](#20-test-scenes)
21. [Utility Classes](#21-utility-classes)
22. [Data Flow Summary](#22-data-flow-summary)
23. [XML Config Schema (avatar_default.xml)](#23-xml-config-schema-avatardefaultxml)
24. [Migration Notes](#24-migration-notes)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    LipsyncEditorWindow (SWF)                      │
│  500×700, 18fps, LOW quality, white #FFFFFF background           │
│                                                                   │
│  ┌──────────────────────┐  ┌──────────────────┐                  │
│  │    AvatarScene        │  │  Foreground UI    │  magnify bitmap │
│  │  (View3D, scale 1.2) │  │  (Labels, sex      │  (420×260, 3.5×│
│  │  camera(-50,50,-50)  │  │   toggle, 5 audio  │   zoom, blur+  │
│  │  avatar(0,-25,0)     │  │   buttons)         │   glow filter) │
│  └──────────┬───────────┘  └──────────────────┘                  │
└─────────────┼────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│               AvatarCore (abstract base)              │
│  - blinkTimer (fixed-interval, XML blink_delay × 1s) │
│  - lookAt(mouseX, mouseY) → posX/posY ∈ [-1, 1]      │
│  - setEmotion(expression, value)                      │
│  - setViseme(expression, value)                       │
│  - owns: left_eye, right_eye, mouth, neck             │
└─────────────────────────┬───────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────┐
│               AvatarAnimator (extends AvatarCore)      │
│  - owns LipsyncPlayer (100ms amp interval, vol 1.0)   │
│  - NN setup (NeuralNetworkProvider.getNetwork())       │
│  - recognizePhonemeDelay = 50ms                        │
│  - onLipsyncEvent → setViseme(expression, amp × 13.5) │
│  - onLipsyncComplete → mouth.setNeutral(0.5)           │
└───────────────────────┬──────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
    ┌──────────┐ ┌───────────┐ ┌──────────┐
    │AvatarMouth│ │ AvatarEye │ │AvatarNeck│
    │ 14 bones  │ │ (×2)      │ │ 2 segs   │
    └──────────┘ └───────────┘ └──────────┘
          │             │             │
          └─────────────┼─────────────┘
                        ▼
              ┌──────────────────┐
              │  AvatarFeature   │  ← 6 DOF per bone
              │ (rotX/Y/Z,       │
              │  movX/Y/Z)       │
              └────────┬─────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
    ┌──────────┐             ┌──────────┐
    │ BoneRot  │             │ BoneMov  │
    │ (rotation│             │(translatn│
    │  DOF)    │             │  DOF)    │
    └──────────┘             └──────────┘
         Both implement BoneParameter:
         - inertia blending formula
         - setValueTween (Tweener)
```

---

## 2. Bone Hierarchy

### 2.1 Mouth Bones (14 features in `AvatarMouth`)

The mouth system uses **14 named bones** from the Collada (`.dae`) model. Each bone corresponds to one `AvatarFeature` providing 6 DOF (3 rotation + 3 translation axes).

| #  | Property      | Bone Name (XML) | Description                |
|----|---------------|-----------------|----------------------------|
| 1  | `jaw`         | `jaw`           | Jaw rotation               |
| 2  | `tongue`      | `tongue`        | Tongue movement            |
| 3  | `mouth_r`     | `mouth_r`       | Right mouth corner         |
| 4  | `mouth_l`     | `mouth_l`       | Left mouth corner          |
| 5  | `lip_down_r`  | `lip_down_r`    | Lower lip, right segment   |
| 6  | `lip_down_m`  | `lip_down_m`    | Lower lip, middle segment  |
| 7  | `lip_down_l`  | `lip_down_l`    | Lower lip, left segment    |
| 8  | `lip_top_r`   | `lip_top_r`     | Upper lip, right segment   |
| 9  | `lip_top_m`   | `lip_top_m`     | Upper lip, middle segment  |
| 10 | `lip_top_l`   | `lip_top_l`     | Upper lip, left segment    |
| 11 | `cheek_r`     | `cheek_r`       | Right cheek                |
| 12 | `cheek_l`     | `cheek_l`       | Left cheek                 |
| 13 | `cheekb_r`    | `cheekb_r`      | Right cheekbone (zygomatic)|
| 14 | `cheekb_l`    | `cheekb_l`      | Left cheekbone (zygomatic) |

### 2.2 Eye Features (per eye, ~8 total for both eyes)

Each eye (`AvatarEye`) wraps **4 AvatarFeatures**:

| Feature     | Bone Name (XML) | Description                  |
|-------------|-----------------|------------------------------|
| `eyelid`    | `eyelid`        | Eyelid rotation (blink)      |
| `eyeball`   | `eyeball`       | Eyeball rotation (gaze)      |
| `eyebrow_i` | `eyebrow_i`     | Inner eyebrow segment        |
| `eyebrow_o` | `eyebrow_o`     | Outer eyebrow segment        |

Note: The ActionScript code also has an unused `eyebrow: AvatarFeature` field (line 24 of AvatarEye.as) that is never initialized — likely a legacy artifact.

### 2.3 Neck Segments (2 features)

| Property   | Bone Name (XML) | DOF Used              |
|------------|-----------------|-----------------------|
| `neckLow`  | `neck_low`      | rotZ, rotX            |
| `neckHigh` | `neck_high`     | rotZ, rotX, rotY      |

### 2.4 Total Bone Count

```
Mouth:       14 bones
Eyes × 2:    8 features  (4 per eye)
Neck:         2 features
─────────────────
Total:       24 AvatarFeature wrappers
             24 bones in the Collada skeleton
```

---

## 3. BoneParameter Interface & Inertia Blending

### 3.1 Interface Definition

```typescript
/**
 * Interface for a single degree-of-freedom (DOF) on a bone.
 * Each DOF either rotates or translates along one axis.
 */
interface BoneParameter {
  /** Get/set the current value (immediate, with inertia blending) */
  value: number;

  /**
   * Refresh the current value using a change multiplier.
   * Used for proportional rescaling.
   * bone.state *= (nextWeight * change + currentWeight)
   */
  refreshValue(change: number): void;

  /**
   * Animate the bone to a target value using a Tweener transition.
   * @param value    Normalized input [-1, 1] → mapped to [min, max] range via def
   * @param time     Duration in seconds
   * @param delay    Delay before start (default 0)
   * @param transition  Easing function name (default "linear")
   */
  setValueTween(
    value: number,
    time: number,
    delay?: number,
    transition?: string
  ): void;
}
```

### 3.2 Inertia Blending Formula

Both `BoneRot` and `BoneMov` implement the same inertia smoothing logic, controlled per-axis via the XML `@inertia` attribute.

**Weight computation (constructor):**

```typescript
currentWeight = parseFloat(xml.@inertia);    // e.g. 0.0, 0.5, 0.9
nextWeight = 1.0 - currentWeight;             // complementary weight
```

**Value setter (immediate mode):**

```typescript
set value(input: number): void {
  // Retain current state × inertia weight
  bone.state *= currentWeight;

  // Clamp input to [-1, 1]
  const clamped = Math.max(-1, Math.min(1, input));

  // Map input → target position
  let target: number;
  if (clamped > 0) {
    target = def + max * clamped;
  } else if (clamped < 0) {
    target = def + min * (-clamped);   // negate for positive min range
  } else {
    target = def;                      // neutral
  }

  // Blend: new = (old × inertia) + (target × (1 - inertia))
  bone.state += nextWeight * target;
}
```

**Simplified mathematically:**

```
stateₜ = stateₜ₋₁ × I + target × (1 − I)

where:
  I  = inertia weight (0.0 = instant, 0.5 = half-life blend, 1.0 = frozen)
  target = def + range × clamp(input, -1, 1)
```

**Inertia semantics:**

| `@inertia` | Behavior                             |
|------------|--------------------------------------|
| `0.0`      | **Instant** — no smoothing           |
| `0.5`      | **Half-life** — each frame moves 50% toward target |
| `0.8`      | **Heavy smoothing** — slow response  |
| `1.0`      | **Frozen** — bone never moves        |
| absent     | Defaults to `0.0` (instant)          |

### 3.3 refreshValue Formula

```typescript
refreshValue(change: number): void {
  // Proportional rescaling
  bone.state *= nextWeight * change + currentWeight;
}
```

Used to proportionally rescale the current bone state when the viseme amplitude changes (e.g., from `setVisemeValue` / `setEmotionValue`).

---

## 4. AvatarFeature — 6-DOF Bone Wrapper

### 4.1 TypeScript Interface

```typescript
/**
 * Wraps a single bone from the Collada model with 6 degrees of freedom.
 * Each DOF (rotX/Y/Z, movX/Y/Z) is a BoneParameter (BoneRot or BoneMov).
 */
class AvatarFeature {
  rotX: BoneParameter;
  rotY: BoneParameter;
  rotZ: BoneParameter;
  movX: BoneParameter;
  movY: BoneParameter;
  movZ: BoneParameter;

  /**
   * Construct from XML config.
   * @param avatar    The loaded Collada model (ObjectContainer3D)
   * @param parameter  XML fragment: <feature name="jaw" rot_X:... mov_X:...>
   */
  constructor(avatar: ObjectContainer3D, parameter: XMLList);

  /**
   * Set all DOF values immediately from an ExpressionParameter multiplier.
   * value * parameter.rot_x → rotX.value, etc.
   */
  setParameter(value: number, parameter: ExpressionParameter): void;

  /**
   * Set all DOF values via Tweener transitions.
   */
  setParameterTween(
    value: number,
    parameter: ExpressionParameter,
    time: number
  ): void;
}
```

### 4.2 Constructor Behavior

1. Reads `parameter.@name` to get the bone name string
2. Calls `avatar.getBoneByName(boneName)` to find the Away3D Bone
3. If bone found: creates 6 DOF axes (3× BoneRot, 3× BoneMov) from XML sub-elements
4. If bone NOT found: logs `[ERROR]: avatar bone <name> not present` via AvatarDebugger

### 4.3 setParameter Logic

```typescript
setParameter(value: number, parameter: ExpressionParameter): void {
  if (parameter.rotation) {
    this.rotX.value = value * parameter.rot_x;
    this.rotY.value = value * parameter.rot_y;
    this.rotZ.value = value * parameter.rot_z;
  }
  if (parameter.movement) {
    this.movX.value = value * parameter.mov_x;
    this.movY.value = value * parameter.mov_y;
    this.movZ.value = value * parameter.mov_z;
  }
}
```

---

## 5. AvatarMouth — 14-Feature Mouth System

### 5.1 TypeScript Interface

```typescript
class AvatarMouth {
  // 14 public AvatarFeature references:
  jaw: AvatarFeature;
  tongue: AvatarFeature;
  mouth_r: AvatarFeature;
  mouth_l: AvatarFeature;
  lip_down_r: AvatarFeature;
  lip_down_m: AvatarFeature;
  lip_down_l: AvatarFeature;
  lip_top_r: AvatarFeature;
  lip_top_m: AvatarFeature;
  lip_top_l: AvatarFeature;
  cheek_r: AvatarFeature;
  cheek_l: AvatarFeature;
  cheekb_r: AvatarFeature;
  cheekb_l: AvatarFeature;

  constructor(avatar: ObjectContainer3D, xml: XMLList);

  /**
   * Simple smile test — moves both mouth corners up (negative movY).
   */
  smile(value: number): void;

  /**
   * Apply a viseme expression at a given intensity.
   * Dispatches value × expression multipliers to all 14 features.
   */
  setViseme(value: number, viseme: AvatarExpression): void;

  /**
   * Tween all 14 features to neutral pose over specified time.
   * Uses ExpressionsCollection.NEUTRAL as reference.
   * @param time  Tween duration in seconds (typically 0.5)
   */
  setNeutral(time: number): void;
}
```

### 5.2 setViseme Flow

```
AvatarAnimator.onLipsyncEvent
  → AvatarCore.setViseme(expression, amplitude × 13.5)
    → AvatarMouth.setViseme(value, expression)
      → For each of 14 features:
          AvatarFeature.setParameter(value, expression.<part>)
            → 6× BoneParameter.value setter (inertia blended or tweened)
```

---

## 6. AvatarEye — Blink & Gaze System

### 6.1 TypeScript Interface

```typescript
class AvatarEye {
  private eyelid: AvatarFeature;
  private eyeball: AvatarFeature;
  private eyebrow_i: AvatarFeature;  // inner eyebrow
  private eyebrow_o: AvatarFeature;  // outer eyebrow

  private blinkTime: number;   // duration of blink close/open (seconds)
  private blinkPause: number;  // pause between close and open (seconds)

  constructor(avatar: ObjectContainer3D, xml: XMLList);

  /**
   * Configure blink timing from XML.
   * Called by AvatarBuilder.setupAvatarEyes().
   */
  setupMotionParameters(blinkTime: number, blinkPause: number): void;

  /**
   * Execute a single blink sequence:
   *   close eyelid (easeInOutSine, t=blinkTime)
   *     → pause (t=blinkPause)
   *     → open eyelid (easeInOutSine, t=blinkTime)
   */
  blink(): void;

  /**
   * Force eyelid closed (easeOutCubic).
   * Stops the blink timer.
   */
  close(): void;

  /**
   * Re-open eyelid and restart blink timer.
   */
  open(): void;

  /**
   * Update gaze: rotates eyeball, moves eyebrows.
   * @param posX  Horizontal gaze [-1, 1]  (negative = look left)
   * @param posY  Vertical gaze   [-1, 1]  (negative = look up)
   */
  lookAt(posX: number, posY: number): void;
}
```

### 6.2 Eye Gaze Formula

```typescript
lookAt(posX: number, posY: number): void {
  // Eyeball: direct rotation, no inertia
  this.eyeball.rotX.value = posY;   // vertical
  this.eyeball.rotY.value = posX;   // horizontal

  // Eyebrows: vertical movement only, scaled down
  this.eyebrow_i.movY.value = posY / 2.75;  // inner brow, less movement
  this.eyebrow_o.movY.value = posY / 2.0;   // outer brow, more movement
}
```

---

## 7. AvatarNeck — Two-Segment Neck

### 7.1 TypeScript Interface

```typescript
class AvatarNeck {
  private neckLow: AvatarFeature;   // neck_low bone
  private neckHigh: AvatarFeature;  // neck_high bone

  constructor(avatar: ObjectContainer3D, xml: XMLList);

  /**
   * Rotate both neck segments to track a gaze point.
   * @param posX  Horizontal [-1, 1] (half of eye range)
   * @param posY  Vertical   [-1, 1] (half of eye range)
   */
  lookAt(posX: number, posY: number): void;
}
```

### 7.2 Neck Gaze Formula

```typescript
lookAt(posX: number, posY: number): void {
  // Neck high: 3 DOF
  this.neckHigh.rotZ.value = posX;
  this.neckHigh.rotX.value = -posY;  // negated for natural up/down
  this.neckHigh.rotY.value = posX;

  // Neck low: 2 DOF (no rotY)
  this.neckLow.rotZ.value = posX;
  this.neckLow.rotX.value = -posY;
}
```

Note: The neck receives `posX/2, posY/2` from `AvatarCore.lookAt()` — half the range of the eyes.

---

## 8. Expression System (7 Emotions + N Visemes)

### 8.1 AvatarExpression — Data Container

```typescript
/**
 * Holds 14 ExpressionParameter multipliers for a single expression (emotion or viseme).
 * Parsed from XML <expression> node.
 */
class AvatarExpression {
  alias: string;  // e.g. "neutral", "joy", "v1", "U"
  id: number;      // emotion or viseme ID

  // 14 ExpressionParameter multipliers, one per mouth feature:
  jaw: ExpressionParameter;
  tongue: ExpressionParameter;
  mouth_r: ExpressionParameter;
  mouth_l: ExpressionParameter;
  lip_down_r: ExpressionParameter;
  lip_down_m: ExpressionParameter;
  lip_down_l: ExpressionParameter;
  lip_top_r: ExpressionParameter;
  lip_top_m: ExpressionParameter;
  lip_top_l: ExpressionParameter;
  cheek_r: ExpressionParameter;
  cheek_l: ExpressionParameter;
  cheekb_r: ExpressionParameter;
  cheekb_l: ExpressionParameter;

  constructor(xml: XMLNode);
}
```

### 8.2 7 Emotions

Loaded from `xml.expressions.emotions.*`:

| Static Constant    | XML Tag     | Description                  |
|--------------------|-------------|------------------------------|
| `NEUTRAL`          | `neutral`   | Resting face (id=0?)         |
| `JOY`              | `joy`       | Happiness / smile            |
| `SADNESS`          | `sadness`   | Sad / frown                  |
| `ANGER`            | `anger`     | Anger / tense                |
| `FEAR`             | `fear`      | Fear / wide eyes             |
| `DISGUST`          | `disgust`   | Disgust / wrinkled nose      |
| `SURPRISE`         | `surprise`  | Surprise / raised brows      |

### 8.3 N Visemes (9 viseme groups)

Loaded from `xml.expressions.visemes.*`. The number is dynamic (N visemes parsed from XML children). The original AS3 code uses **9 viseme groups** (v1–v9) mapped from the phoneme system (18 phonemes, 2 per viseme).

| Viseme ID | Aliases (a, b) | Phoneme Examples      |
|-----------|----------------|-----------------------|
| 1         | v1a, v1b       | -                     |
| 2         | v2a, v2b       | -                     |
| 3         | v3a, v3b       | /i:/, /I/ (aeiou)    |
| 4         | v4a, v4b       | -                     |
| 5         | v5a, v5b       | /u:/, /U/ (aeiou)    |
| 6         | v6a, v6b       | /o:/, /ɔ/ (aeiou)    |
| 7         | v7a, v7b       | /a:/, /æ/ (aeiou)    |
| 8         | v8a, v8b       | -                     |
| 9         | v9a, v9b       | -                     |

Each viseme has 14 `ExpressionParameter` entries defining how each of the 14 mouth bones should move.

### 8.4 Expression/Neutral Return

After speech completes:

```
onLipsyncComplete → mouth.setNeutral(0.5)
```

This tweens **all 14 features** to their NEUTRAL expression over 0.5 seconds using `setParameterTween` (Tweener, default `"linear"` transition).

---

## 9. ExpressionsCollection — Static Registry

### 9.1 TypeScript Interface

```typescript
/**
 * Global registry of all expressions, initialized from XML at startup.
 */
class ExpressionsCollection {
  static visemes: AvatarExpression[];

  // 7 emotion singletons:
  static NEUTRAL: AvatarExpression;
  static JOY: AvatarExpression;
  static SADNESS: AvatarExpression;
  static ANGER: AvatarExpression;
  static FEAR: AvatarExpression;
  static DISGUST: AvatarExpression;
  static SURPRISE: AvatarExpression;

  /**
   * Parse XML and populate all static fields.
   * Called once by AvatarBuilder.initExpressions().
   */
  static initCollection(xml: XMLList): void;

  /**
   * Find a viseme by its alias string (e.g., "v1", "U").
   * Returns NEUTRAL if not found.
   */
  static getVisemeByAlias(alias: string): AvatarExpression;

  /**
   * Find a viseme by its numeric ID.
   * Returns NEUTRAL if not found.
   */
  static getVisemeById(id: number): AvatarExpression;

  /**
   * [NOT IMPLEMENTED] Combine a viseme and emotion into a blended expression.
   * Stub in source — returns null.
   */
  static combine(
    viseme: AvatarExpression,
    emotion: AvatarExpression
  ): AvatarExpression | null;
}
```

### 9.2 XML Initialization Flow

```typescript
// In AvatarBuilder:
ExpressionsCollection.initCollection(avatarXML.expressions);

// XML shape expected:
// <expressions>
//   <emotions>
//     <neutral id="0" alias="neutral">...</neutral>
//     <joy id="1" alias="joy">...</joy>
//     ...
//   </emotions>
//   <visemes>
//     <viseme id="1" alias="v1">...</viseme>
//     <viseme id="2" alias="v2">...</viseme>
//     ...
//   </visemes>
// </expressions>
```

---

## 10. ExpressionParameter — XML-Driven Param Multiplier

### 10.1 TypeScript Interface

```typescript
/**
 * Per-bone multiplier values for one expression.
 * Each value multiplies the normalized [-1, 1] input to produce the
 * final bone position offset.
 */
class ExpressionParameter {
  rotation: boolean;   // true if any rot_* attributes exist
  rot_x: number;       // rotation X multiplier (default 0)
  rot_y: number;       // rotation Y multiplier (default 0)
  rot_z: number;       // rotation Z multiplier (default 0)

  movement: boolean;   // true if any mov_* attributes exist
  mov_x: number;       // translation X multiplier (default 0)
  mov_y: number;       // translation Y multiplier (default 0)
  mov_z: number;       // translation Z multiplier (default 0)

  constructor(xml: XMLList);
}
```

### 10.2 XML parsing logic

```typescript
constructor(xml: XMLList) {
  // Detect rotation by presence of any rot_* attribute
  if (xml.attribute("rot_x").length + xml.attribute("rot_y").length + xml.attribute("rot_z").length > 0) {
    this.rotation = true;
  }

  this.rot_x = xml.@rot_x;  // defaults to 0 if absent
  this.rot_y = xml.@rot_y;
  this.rot_z = xml.@rot_z;

  // Detect movement by presence of any mov_* attribute
  if (xml.attribute("mov_x").length + xml.attribute("mov_y").length + xml.attribute("mov_z").length > 0) {
    this.movement = true;
  }

  this.mov_x = xml.@mov_x;
  this.mov_y = xml.@mov_y;
  this.mov_z = xml.@mov_z;
}
```

### 10.3 XML Shape

```xml
<!-- Per bone in each expression: -->
<expression_part rot_x="0.0" rot_y="0.0" rot_z="0.0"
                 mov_x="0.0" mov_y="0.0" mov_z="0.0"/>
```

---

## 11. Tweener Transition System

### 11.1 Usage

The original code uses **caurina.transitions.Tweener** (ActionScript tweening library). The TypeScript equivalent uses the transitions recorded below for each operation.

| Operation               | Transition        | Duration      | Bone DOF |
|-------------------------|-------------------|---------------|----------|
| Blink close             | `easeInOutSine`   | `blinkTime`   | eyelid.rotX |
| Blink open              | `easeInOutSine`   | `blinkTime`   | eyelid.rotX |
| Eyelid forced close     | `easeOutCubic`    | `blinkTime`   | eyelid.rotX |
| Return to neutral       | `linear`          | 0.5s          | All 14 mouth features |
| General bone tweens     | `linear`          | per caller    | Any DOF |

### 11.2 Tweener Easing Equivalents (TypeScript)

```typescript
// caurina.transitions.Tweener → Three.js / GSAP / anime.js equivalences:

type EasingFunction = (t: number) => number;

const EASING_MAP: Record<string, EasingFunction> = {
  "linear":         (t: number) => t,
  "easeInOutSine":  (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  "easeOutCubic":   (t: number) => 1 - Math.pow(1 - t, 3),
};
```

### 11.3 setValueTween Logic

```typescript
setValueTween(
  input: number,
  time: number,
  delay: number = 0,
  transition: string = "linear"
): void {
  const clamped = Math.max(-1, Math.min(1, input));
  let target: number;

  if (clamped > 0) {
    target = this.def + this.max * clamped;
  } else if (clamped < 0) {
    target = this.def + this.min * (-clamped);
  } else {
    target = this.def;
  }

  // Equivalent to: Tweener.addTween(bone, { axis: target, time, delay, transition })
  // In Three.js:
  //   new TWEEN.Tween(bone)
  //     .to({ [axis]: target }, time * 1000)
  //     .delay(delay * 1000)
  //     .easing(EASING_MAP[transition])
  //     .start();
}
```

---

## 12. Blink Algorithm

### 12.1 Trigger

- **Fixed-interval Timer** — no random jitter
- Interval = `XML @blink_delay × 1000` ms (read from `eyesXML.@blink_delay`)
- Timer type: `flash.utils.Timer` (not `setInterval`)
- Both eyes blink **simultaneously**

### 12.2 Blink Sequence

```
Timer fires
  → left_eye.blink()
  → right_eye.blink()

blink() implementation:
  1. eyelid.rotX.setValueTween(1.0, blinkTime, 0.0, "easeInOutSine")
     → Close eyelid (rotX = 1.0) over blinkTime seconds
  2. eyelid.rotX.setValueTween(0.0, blinkTime, blinkPause, "easeInOutSine")
     → After blinkPause seconds delay, open eyelid (rotX = 0.0) over blinkTime seconds
```

### 12.3 Timing Parameters

| Parameter       | XML Attribute   | Description                         |
|-----------------|-----------------|-------------------------------------|
| `blinkDelay`    | `blink_delay`   | Interval between blinks (seconds × 1000 = ms) |
| `blinkTime`     | `blink_time`    | Duration of close/open transition (seconds)    |
| `blinkPause`    | `blink_pause`   | Pause between close and open (seconds)         |

### 12.4 Forced Close/Open

```typescript
close(): void {
  blinkTimer.stop();
  eyelid.rotX.setValueTween(1.0, blinkTime, 0.0, "easeOutCubic");
  // Uses easeOutCubic instead of easeInOutSine for a snappier close
}

open(): void {
  blinkTimer.reset();
  blinkTimer.start();
  // Restarts the blink cycle
}
```

---

## 13. Gaze Algorithm

### 13.1 Input Normalization (in AvatarCore)

```typescript
lookAt(mouseX: number, mouseY: number): void {
  const posX = (400 - mouseX) / 400;   // → [-1, 1]
  const posY = (400 - mouseY) / 400;   // → [-1, 1]

  // Neck receives HALF the eye range
  this.neck.lookAt(posX / 2, posY / 2);

  // Eyes receive full range
  this.left_eye.lookAt(posX, posY);
  this.right_eye.lookAt(posX, posY);
}
```

Note: In LipsyncEditorWindow, the mouse coordinates are recentered:

```typescript
currentAvatar.lookAt(
  this.mouseX * 0.5 + 250,
  this.mouseY * 0.5 + 250
);
```

### 13.2 Full Gaze Response Table

| Bone                | Axis  | Formula              | Notes                         |
|---------------------|-------|----------------------|-------------------------------|
| **eyeball** (×2)    | rotX  | `posY`               | Direct rotation, no inertia   |
|                     | rotY  | `posX`               | Direct rotation, no inertia   |
| **eyebrow_i** (×2)  | movY  | `posY / 2.75`        | Inner brow, less movement     |
| **eyebrow_o** (×2)  | movY  | `posY / 2.0`         | Outer brow, more movement     |
| **neck_low**        | rotZ  | `posX`               | Side-to-side                  |
|                     | rotX  | `-posY`              | Nod (negated)                 |
| **neck_high**       | rotZ  | `posX`               | Side-to-side                  |
|                     | rotX  | `-posY`              | Nod (negated)                 |
|                     | rotY  | `posX`               | Additional tilt               |

### 13.3 LookAtPoint — EMA Gaze Smoother (utility)

```typescript
/**
 * Exponential Moving Average (EMA) gaze point smoother.
 * Not directly used in the current codebase (created but not integrated).
 */
class LookAtPoint {
  x: number;
  y: number;
  private nextWeight: number;
  private currentWeight: number;

  /**
   * @param inertia  Smoothing factor (0.0 = instant, 0.9 = heavy smoothing)
   */
  constructor(inertia: number);

  lookAt(x: number, y: number): void {
    this.x = this.x * this.currentWeight + x * this.nextWeight;
    this.y = this.y * this.currentWeight + y * this.nextWeight;
  }
}
```

Uses the same `currentWeight / nextWeight` pattern as BoneRot/BoneMov.

---

## 14. AvatarCore — Base Class

### 14.1 TypeScript Interface

```typescript
/**
 * Base avatar class. Manages the 3D container, blink timer, and high-level
 * expression/viseme dispatch.
 */
class AvatarCore {
  // Protected 3D container
  protected avatar: ObjectContainer3D;

  // Internal subsystems (assigned by AvatarBuilder)
  left_eye: AvatarEye;
  right_eye: AvatarEye;
  mouth: AvatarMouth;
  neck: AvatarNeck;

  // Blink timing (set from XML by AvatarBuilder)
  blinkDelay: number;

  // Internal state
  private blinkTimer: Timer;          // fixed-interval timer
  private visemeValue: number;        // current viseme intensity
  private viseme: AvatarExpression;   // current viseme expression
  private emotionValue: number;       // current emotion intensity
  private emotion: AvatarExpression;  // current emotion expression

  constructor();

  /**
   * Initialize sub-systems. Call after subsystems are assigned.
   * Starts the blink timer.
   */
  protected initAvatarCore(): void;

  /** Set/get the 3D container (ObjectContainer3D from Collada). */
  setAvatarObject3D(avatar: ObjectContainer3D): void;
  getAvatarObject3D(): ObjectContainer3D;

  /**
   * Set the current emotion expression.
   * @param emotion  The expression data
   * @param value    Intensity [0..1] (optional; uses cached value if omitted)
   */
  setEmotion(emotion: AvatarExpression, value?: number): void;

  /**
   * Set the current viseme expression.
   * @param viseme   The expression data
   * @param value    Intensity [0..1] (optional; uses cached value if omitted)
   */
  setViseme(viseme: AvatarExpression, value?: number): void;

  /**
   * Update viseme value and proportionally rescale current state.
   * @deprecated Partially disabled in original code.
   */
  setVisemeValue(value: number): void;

  /**
   * Update emotion value and refresh mouth state.
   * @deprecated Partially disabled in original code.
   */
  setEmotionValue(value: number): void;

  /** Blink timer callback — triggers both eyes simultaneously. */
  private onBlinkTimer(): void;

  /**
   * Gaze tracking from mouse position.
   * @param mouseX  Screen X coordinate
   * @param mouseY  Screen Y coordinate
   */
  lookAt(mouseX: number, mouseY: number): void;

  /** Stub for gaze tweening — not implemented. */
  lookAtTween(): void;

  /**
   * Direct jaw open/close test.
   * @param value  Jaw rotation value
   */
  openMouth(value: number): void;
}
```

### 14.2 Key State Variables

| Variable        | Type              | Purpose                              |
|-----------------|-------------------|--------------------------------------|
| `visemeValue`   | `number`          | Cached viseme intensity multiplier   |
| `viseme`        | `AvatarExpression`| Active viseme expression             |
| `emotionValue`  | `number`          | Cached emotion intensity multiplier  |
| `emotion`       | `AvatarExpression`| Active emotion expression            |

---

## 15. AvatarAnimator — Lip-Sync Controller

### 15.1 TypeScript Interface

```typescript
/**
 * Extends AvatarCore with LipsyncPlayer integration.
 * This is the main runtime controller used by the editor and test scenes.
 */
class AvatarAnimator extends AvatarCore {
  private lipsync: LipsyncPlayer;

  constructor();

  /** Initialize blink timer (calls parent initAvatarCore). */
  initAvatar(): void;

  /**
   * Play a single audio file with lip-sync.
   * @param soundFile  Path to MP3 file
   */
  saySentence(soundFile: string): void;

  /**
   * Play a queue of audio files sequentially.
   * @param soundFiles  Array of MP3 file paths
   */
  saySentences(soundFiles: string[]): void;

  /** Check if audio is currently playing. */
  isSpeaking(): boolean;

  /**
   * Play audio files using a specific neural network.
   * @param soundFiles  Array of MP3 file paths
   * @param network     NeuralNetwork instance (sex-specific weights)
   */
  saySentencesUsingNetwork(
    soundFiles: string[],
    network: NeuralNetwork
  ): void;

  /** Handle PHONEME event from LipsyncPlayer. */
  private onLipsyncEvent(event: LipsyncEvent): void;

  /** Handle PLAYING_COMPLETE event — return to neutral. */
  private onLipsyncComplete(event: Event): void;
}
```

### 15.2 Constructor Setup

```typescript
constructor() {
  super();
  // LipsyncPlayer(amplitudeInterval=100ms, initialVolume=1.0)
  this.lipsync = new LipsyncPlayer(100, 1.0);

  // Load default neural network (male weights as fallback)
  this.lipsync.setupNeuralNetwork(NeuralNetworkProvider.getNetwork());

  // Override phoneme recognition rate: 50ms (not default 20ms)
  LipsyncSettings.recognizePhonemeDelay = 50;

  // Wire events
  this.lipsync.addEventListener(LipsyncEvent.PHONEME, this.onLipsyncEvent);
  this.lipsync.addEventListener(LipsyncEvent.PLAYING_COMPLETE, this.onLipsyncComplete);
}
```

### 15.3 Lip-Sync Event Handler

```typescript
onLipsyncEvent(event: LipsyncEvent): void {
  // Decode phoneme → viseme expression
  const expression = ExpressionsCollection.getVisemeById(event.phoneme.visemeId);

  // Apply with amplitude scaling (×13.5)
  this.setViseme(expression, event.amplitude * 13.5);
}
```

### 15.4 Speech Complete Handler

```typescript
onLipsyncComplete(event: Event): void {
  // Tween back to neutral over 0.5 seconds
  this.mouth.setNeutral(0.5);
}
```

---

## 16. AvatarBuilder — Factory from XML Config

### 16.1 TypeScript Interface

```typescript
/**
 * Constructs a fully-configured AvatarAnimator from:
 * - The loaded Collada model (ObjectContainer3D)
 * - The embedded avatar_default.xml config
 */
class AvatarBuilder {
  private avatarObject: ObjectContainer3D;
  private avatarXML: XML;
  private avatar: AvatarAnimator;

  constructor(avatarObject: ObjectContainer3D);

  /** Build and return a fully-initialized AvatarAnimator. */
  buildAvatar(): AvatarAnimator;

  /** Parse XML expressions into ExpressionsCollection. */
  private initExpressions(): void;

  /** Build eye subsystem from XML <eyes> node. */
  private setupAvatarEyes(): void;

  /** Build neck subsystem from XML <neck> node. */
  private setupAvatarNeck(): void;

  /** Build mouth subsystem from XML <mouth> node. */
  private setupAvatarMouth(): void;
}
```

### 16.2 Build Flow

```
new AvatarBuilder(modelObject)
  1. Create AvatarAnimator
  2. Set avatar 3D object
  3. Load & parse avatar_default.xml via AvatarXMLProvider
  4. initExpressions() → ExpressionsCollection.initCollection(xml.expressions)
  5. buildAvatar()
     a. setupAvatarEyes()
        - Read blinkDelay, blinkTime, blinkPause from XML
        - Create left_eye and right_eye from XML
        - Set motion parameters on both eyes
     b. setupAvatarNeck()
        - Create neck from XML
     c. setupAvatarMouth()
        - Create mouth from XML
     d. avatar.initAvatar() → starts blink timer
     e. Return AvatarAnimator
```

### 16.3 XML Paths Used

| Data               | XPath                                              |
|--------------------|----------------------------------------------------|
| Blink timing       | `avatar.face_features.eyes`                        |
| Eye left config    | `avatar.face_features.eyes.left_eye`               |
| Eye right config   | `avatar.face_features.eyes.right_eye`              |
| Neck config        | `avatar.face_features.neck` (contains `neck_low`, `neck_high`) |
| Mouth config       | `avatar.face_features.mouth` (contains 14 bone entries) |
| Expressions        | `expressions` → `expressions.emotions.*`, `expressions.visemes.*` |

---

## 17. AvatarModelProvider — Collada DAE Import

### 17.1 TypeScript Interface

```typescript
/**
 * Manages loading of Collada (.dae) models with sex-specific assets.
 * Dispatches Event.COMPLETE when the model is fully parsed and textured.
 */
class AvatarModelProvider extends EventDispatcher {
  static readonly MALE = "MALE";
  static readonly FEMALE = "FEMALE";

  sex: string;  // Default: FEMALE

  constructor(sex?: string);  // default FEMALE

  /** Parse the embedded .dae binary into an ObjectContainer3D. */
  readModel(): void;

  /** Get the loaded 3D model. */
  getModel(): ObjectContainer3D;

  /**
   * Post-processing to force bone rotation initialization.
   * Reads each rotation property to ensure Away3D creates backing fields.
   */
  private setupObjectBones(model: any): void;

  /** On parse success: assign textures, init bones, dispatch COMPLETE. */
  private onParseCollada(event: ParserEvent): void;
}
```

### 17.2 Embedded Assets

| Embed Name       | File Path                        | Usage                        |
|------------------|----------------------------------|------------------------------|
| `model_f`        | `lib/model/model.dae`            | Female Collada skeleton      |
| `model_m`        | `lib/model/model_man.dae`        | Male Collada skeleton        |
| `model_texture_f`| `lib/model/texture.jpg`          | Female body texture          |
| `model_texture_m`| `lib/model/texture_m.jpg`        | Male body texture            |
| `eye_texture`    | `lib/model/eye.jpg`              | Eye texture (both sexes)     |
| `teeth_texture`  | `lib/model/teeth.jpg`            | Teeth texture (both sexes)   |

### 17.3 Material Mapping

| DAE Internal Name   | Texture Source         |
|---------------------|------------------------|
| `texture_jpg`       | Sex-specific body tex  |
| `eye_jpg`           | `eye.jpg`              |
| `teeth_jpg_001`     | `teeth.jpg`            |

### 17.4 Collada Parsing

- **Scale factor:** 10.5
- **Parser:** `away3d.loaders.Collada` (Away3D-specific)
- **Freeze rotations:** `setupObjectBones()` reads each child's `rotationX` property to force Away3D's lazy init

### 17.5 Sex Constants

| Constant | Value   |
|----------|---------|
| `MALE`   | `"MALE"` |
| `FEMALE` | `"FEMALE"` |

Default in editor: `FEMALE`. Default in `AvatarModelProvider` constructor: `FEMALE`.

---

## 18. AvatarScene — View3D Wrapper

### 18.1 TypeScript Interface

```typescript
/**
 * Wraps the 3D View (Away3D's View3D → Three.js WebGLRenderer).
 * Auto-renders every frame via requestAnimationFrame.
 */
class AvatarScene extends View3D {
  constructor();

  /** Add an avatar's 3D container to the scene. */
  addAvatar(avatar: AvatarAnimator): void;

  /** Remove an avatar's 3D container from the scene. */
  removeAvatar(avatar: AvatarAnimator): void;

  /** ENTER_FRAME handler — calls render(). */
  private onEnterFrame(): void;
}
```

### 18.2 Implementation Notes

- **No lights** configured in the base class — lighting must be added externally
- Uses `Event.ENTER_FRAME` for the render loop (→ `requestAnimationFrame` in TS)
- The scene and camera are created in the constructor:

```typescript
constructor() {
  super();
  this.camera = new Camera3D();
  this.scene = new Scene3D();
  this.addEventListener(Event.ENTER_FRAME, this.onEnterFrame);
}
```

---

## 19. LipsyncEditorWindow — Main Editor Layout

### 19.1 SWF Metadata

```typescript
@SWF metadata (ActionScript):
  backgroundColor = "#ffffff"  // white
  frameRate       = 18
  quality         = "LOW"
  width           = 500
  height          = 700
```

### 19.2 TypeScript Equivalent

```typescript
/**
 * Main editor application. 500×700 viewport.
 * Loads two avatars (female then male) on startup.
 * Supports sex toggle, audio playback, and magnified face view.
 *
 * [SWF(backgroundColor="#ffffff", frameRate=18, quality="LOW", width=500, height=700)]
 */
class LipsyncEditorWindow {
  private avatarScene: AvatarScene;
  private modelProvider: AvatarModelProvider;

  private currentAvatar: AvatarAnimator;
  private avatarMale: AvatarAnimator;
  private avatarFemale: AvatarAnimator;

  private magnify: Bitmap;    // 420×260 magnified face bitmap
  private sex: string;        // "MALE" | "FEMALE"
  private voiceNN: NeuralNetwork;
  private voiceUrl: string;   // "../lib/final/female/" | "../lib/final/male/"

  constructor();
  private onCompleteFemale(e: Event): void;   // Load female avatar → start male
  private onCompleteMale(e: Event): void;     // Load male avatar, set default
  changeSex(): void;                          // Toggle female/male
  private onEnterFrame(event: Event): void;   // Render loop + gaze
  private createForeground(): void;           // White panel overlay
  private drawMagnify(): void;                // 3.5× magnified face
  private createLinks(): void;                // Audio buttons
  private createLink(text, url): Label;       // Audio label factory
  private createLinkAction(file): Function;   // Click handler factory
  private createChangeSex(text): Label;       // Sex toggle label
}
```

### 19.3 Layout Specification

```
┌─────────────────────────────────────────────┐
│  LipsyncEditorWindow (500 × 700)            │
│  White background (#FFFFFF), 18 fps         │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  AvatarScene (View3D)               │    │
│  │  scaleX = scaleY = 1.2              │    │
│  │  x = -70, y = -80                   │    │
│  │  camera = moveTo(-50, 50, -50)      │    │
│  │  avatar = moveTo(0, -25, 0)         │    │
│  │         rotY += 15, rotX -= 5,      │    │
│  │         rotZ += 5                   │    │
│  │                                      │    │
│  │  "AWATAR" (y=20, sex toggle)        │    │
│  │  "aeiou"   (y=80)                   │    │
│  │  "count"   (y=110)                  │    │
│  │  "example" (y=140)                  │    │
│  │  "lipsync" (y=170)                  │    │
│  │  "speech"  (y=200)                  │    │
│  │  All labels: Lucida Console 20pt,   │    │
│  │  color #555555, bold, x=30          │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─ Foreground panel ───────────────────┐   │
│  │  White rect 500×300 at (80, 350)     │   │
│  │                                      │   │
│  │  ┌─ Magnified Face ──────────────┐   │   │
│  │  │  Bitmap (420 × 260) at (50,380)│   │   │
│  │  │  3.5× zoom from face center    │   │   │
│  │  │  (245, 230)                    │   │   │
│  │  │  Filters: Blur(3,3) +          │   │   │
│  │  │  Glow(0x000000, 0.5, 20, 20)  │   │   │
│  │  │  Updated every frame           │   │   │
│  │  └────────────────────────────────┘   │   │
│  └───────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 19.4 UI Controls

| Label    | Y Position | Action                               |
|----------|------------|--------------------------------------|
| `AWATAR` | 20         | Toggle sex (female ↔ male)           |
| `aeiou`  | 80         | Play `aeiou.mp3` with current voice  |
| `count`  | 110        | Play `count.mp3`                     |
| `example`| 140        | Play `example.mp3`                   |
| `lipsync`| 170        | Play `lipsync.mp3`                   |
| `speech` | 200        | Play `speech.mp3`                    |

### 19.5 Sex Toggle Mechanism

```typescript
changeSex(): void {
  if (currentAvatar === avatarFemale) {
    // Switch to male
    sex = MALE;
    voiceNN = NeuralNetworkProvider.build(NeuralNetworkProvider.networkImageMale);
    voiceUrl = "../lib/final/male/";
    currentAvatar = avatarMale;
    avatarScene.addAvatar(avatarMale);
    avatarScene.removeAvatar(avatarFemale);
  } else {
    // Switch to female
    sex = FEMALE;
    voiceNN = NeuralNetworkProvider.build(NeuralNetworkProvider.networkImageFemale);
    voiceUrl = "../lib/final/female/";
    currentAvatar = avatarFemale;
    avatarScene.addAvatar(avatarFemale);
    avatarScene.removeAvatar(avatarMale);
  }
}
```

### 19.6 Magnified Face View

- **Bitmap dimensions:** 420 × 260
- **Position:** (50, 380) in the foreground panel
- **Zoom:** 3.5×
- **Source region:** Face center at (245, 230) from stage coordinates
- **Filters:** `BlurFilter(3, 3)` + `GlowFilter(0x000000, 0.5, 20, 20)`
- **Update:** Every frame (`onEnterFrame`)

```typescript
drawMagnify(): void {
  const matrix = new Matrix();
  matrix.translate(-245, -230);   // Center on face
  matrix.scale(3.5, 3.5);         // 3.5× zoom
  magnify.bitmapData.draw(this, matrix, null, null, new Rectangle(0, 0, 420, 260));
}
```

### 19.7 Audio Path Resolution

| Sex    | Audio URL Pattern                              |
|--------|-------------------------------------------------|
| Female | `"../lib/final/female/"` + filename            |
| Male   | `"../lib/final/male/"` + filename              |

Note: This differs from the `lib/male/` and `lib/female/` directories that exist in the repo. The editor uses `lib/final/` paths.

### 19.8 Click Actions

```typescript
// Each audio button click:
currentAvatar.saySentencesUsingNetwork([voiceUrl + filename], voiceNN);
currentAvatar.lookAt(360, 180);  // Center gaze after starting playback
```

---

## 20. Test Scenes

### 20.1 ColladaTestScene

| Attribute         | Value                              |
|-------------------|------------------------------------|
| SWF Size          | 800 × 800                          |
| Background        | #000000 (black)                    |
| Frame Rate        | 20 fps                             |
| Audio             | `"../lib/amy_aeiou.mp3"` (hardcoded) |
| Purpose           | Full avatar + audio + viseme test  |

- Loads model via `AvatarModelProvider()` (default sex: FEMALE)
- Builds avatar with `AvatarBuilder`
- Positions: `avatar.moveTo(0, -25, 0)`, `camera.moveTo(-50, 50, -50)`
- Rotation: `avatar.rotationY += 15`
- Plays `saySentences(["../lib/amy_aeiou.mp3"])`
- Tests viseme `getVisemeByAlias("U")` at full intensity after XML load
- Mouse gaze tracking on ENTER_FRAME
- Refreshes `avatar_default.xml` every 1 second (Timer)

### 20.2 LipsyncTestScene

| Attribute         | Value                             |
|-------------------|-----------------------------------|
| SWF Size          | Stage defaults                    |
| Purpose           | Console-only NN lip-sync test     |

- No 3D avatar, no AvatarBuilder/AvatarScene
- Creates `LipsyncPlayer` directly with `NeuralNetworkProvider.getNetwork()`
- Traces `event.phoneme.visemeId` for non-null phonemes
- Tests with `"../lib/final/female/aeiou.mp3"`

### 20.3 SetupVisemeScene

| Attribute         | Value                              |
|-------------------|------------------------------------|
| SWF Size          | 800 × 800                          |
| Background        | #000000 (black)                    |
| Frame Rate        | 20 fps                             |
| Purpose           | Viseme fine-tuning with avatar     |

- Same 3D setup as ColladaTestScene (model loading, avatar building, camera)
- Tests viseme `getVisemeByAlias("v7")` at full intensity
- Refreshes `avatar_default.xml` every 1 second
- Mouse gaze tracking on ENTER_FRAME

---

## 21. Utility Classes

### 21.1 NeuralNetworkProvider

```typescript
/**
 * Provides deserialized NeuralNetwork instances from embedded binary files.
 */
class NeuralNetworkProvider {
  // Embedded sex-specific NN binaries (zlib-compressed ByteArrays)
  static networkImageMale: Class;    // ../../lib/lipsync/network_image_m
  static networkImageFemale: Class;  // ../../lib/lipsync/network_image_f

  /** Get default network (currently returns male weights). */
  static getNetwork(): NeuralNetwork;

  /** Build NN from a specific embedded image class. */
  static build(imageClass: Class): NeuralNetwork;
}
```

### 21.2 AvatarXMLProvider

```typescript
/**
 * Embeds and parses avatar_default.xml at compile time.
 */
class AvatarXMLProvider {
  private defaultXMLFile: Class;  // ../../lib/xml/avatar_default.xml

  /** Parsed XML document, available after construction. */
  xml: XML;

  constructor();
}
```

### 21.3 AvatarDebugger

```typescript
/**
 * Static logging utility with severity prefixes.
 */
class AvatarDebugger {
  static log(message: string): void;     // [LOG]: <message>
  static debug(message: string): void;   // [DEBUG]: <message>
  static error(message: string): void;   // [ERROR]: <message>
}
```

### 21.4 Label

```typescript
/**
 * Clickable text label component.
 * Lucida Console 20pt, color #555555 (gray), bold.
 */
class Label extends MovieClip {
  constructor(text: string);

  /** Register click handler. */
  onMouseClick(handler: Function): void;
}
```

### 21.5 DAECompressor

```typescript
/**
 * Compile-time utility to deflate the Collada model for smaller SWF size.
 * Prompts download of the compressed file via FileReference.
 * Not used at runtime.
 */
class DAECompressor extends Sprite {
  [Embed("../../lib/model/model.dae")]
  private model: Class;

  constructor() {
    const byteArray = new model();
    byteArray.deflate();  // zlib compression
    new FileReference().save(byteArray, "model");
  }
}
```

### 21.6 LookAtPoint

```typescript
/**
 * 2D Exponential Moving Average (EMA) smoother for gaze point.
 * Same inertia formula as BoneParameter.
 */
class LookAtPoint {
  x: number;
  y: number;

  constructor(inertia: number);

  lookAt(x: number, y: number): void;
  // Updates: this.x = this.x * inertia + x * (1 - inertia)
  //          this.y = this.y * inertia + y * (1 - inertia)
}
```

---

## 22. Data Flow Summary

```
Audio file (MP3)
  │
  ▼
Sound.extract() + decimate (factor 7)
  │
  ▼
Hamming window → LP.analyze() → 9 reflection coefficients
  │
  ▼
NeuralNetwork.run() → 6 sigmoid outputs
  │
  ▼
Binary decode (≥0.5 threshold) → Phoneme
  │
  ▼
3-point temporal smoothing filter
  │
  ▼
LipsyncEvent.PHONEME { phoneme, amplitude }
  │
  ▼
ExpressionsCollection.getVisemeById(phoneme.visemeId)
  │
  ▼
AvatarCore.setViseme(expression, amplitude × 13.5)
  │
  ▼
AvatarMouth.setViseme(value, expression)
  │
  ├─→ jaw.setParameter(value, viseme.jaw)
  ├─→ tongue.setParameter(value, viseme.tongue)
  ├─→ mouth_r.setParameter(...)
  ├─→ mouth_l.setParameter(...)
  ├─→ lip_down_r.setParameter(...)
  ├─→ lip_down_m.setParameter(...)
  ├─→ lip_down_l.setParameter(...)
  ├─→ lip_top_r.setParameter(...)
  ├─→ lip_top_m.setParameter(...)
  ├─→ lip_top_l.setParameter(...)
  ├─→ cheek_r.setParameter(...)
  ├─→ cheek_l.setParameter(...)
  ├─→ cheekb_r.setParameter(...)
  └─→ cheekb_l.setParameter(...)
       │
       ▼
  14× AvatarFeature.setParameter(value, expressionPart)
       │
       ▼
  6× BoneParameter.value setter (per feature)
       │
       ├─ If rotation → 3× BoneRot.value
       │    bone.rotation? *= currentWeight
       │    bone.rotation? += nextWeight × (def + range × clampedInput)
       │
       └─ If movement → 3× BoneMov.value
            bone.x? *= currentWeight
            bone.x? += nextWeight × (def + range × clampedInput)
       │
       ▼
  Away3D Bone updates → render
```

---

## 23. XML Config Schema (avatar_default.xml)

> **Note:** The `avatar_default.xml` file is **missing from the repository** but its schema can be fully reconstructed from the code that consumes it.

### 23.1 Top-Level Structure

```xml
<avatar>
  <face_features>
    <eyes blink_delay="3" blink_time="0.1" blink_pause="0.05">
      <left_eye>
        <eyelid name="eyelid_L">
          <rot_X def="0" min="-90" max="0" inertia="0"/>
          <rot_Y .../>
          <rot_Z .../>
          <mov_X .../>
          <mov_Y .../>
          <mov_Z .../>
        </eyelid>
        <eyeball name="eyeball_L">
          <rot_X def="0" min="-30" max="30" inertia="0"/>
          <rot_Y def="0" min="-30" max="30" inertia="0"/>
        </eyeball>
        <eyebrow_i name="eyebrow_i_L">
          <mov_Y def="0" min="-5" max="5" inertia="0.3"/>
        </eyebrow_i>
        <eyebrow_o name="eyebrow_o_L">
          <mov_Y def="0" min="-5" max="5" inertia="0.3"/>
        </eyebrow_o>
      </left_eye>
      <right_eye>
        <!-- mirror of left_eye with _R suffix -->
      </right_eye>
    </eyes>

    <neck>
      <neck_low name="neck_low">
        <rot_Z def="0" min="-15" max="15" inertia="0.5"/>
        <rot_X def="0" min="-10" max="10" inertia="0.5"/>
      </neck_low>
      <neck_high name="neck_high">
        <rot_Z def="0" min="-15" max="15" inertia="0.5"/>
        <rot_X def="0" min="-10" max="10" inertia="0.5"/>
        <rot_Y def="0" min="-10" max="10" inertia="0.5"/>
      </neck_high>
    </neck>

    <mouth>
      <jaw name="jaw">
        <rot_X def="0" min="0" max="45" inertia="0.2"/>
        <!-- mov_X/Y/Z as needed -->
      </jaw>
      <tongue name="tongue">
        <mov_Y def="0" min="-10" max="10" inertia="0.3"/>
      </tongue>
      <mouth_r name="mouth_r">
        <mov_Y def="0" min="-5" max="5" inertia="0.3"/>
        <rot_Z .../>
      </mouth_r>
      <mouth_l name="mouth_l">
        <mov_Y def="0" min="-5" max="5" inertia="0.3"/>
        <rot_Z .../>
      </mouth_l>
      <!-- lip_down_r, lip_down_m, lip_down_l,
           lip_top_r, lip_top_m, lip_top_l,
           cheek_r, cheek_l,
           cheekb_r, cheekb_l -->
    </mouth>
  </face_features>

  <expressions>
    <emotions>
      <neutral id="0" alias="neutral">
        <jaw rot_x="0" rot_y="0" rot_z="0" mov_x="0" mov_y="0" mov_z="0"/>
        <tongue .../>
        <!-- 14 parts total -->
      </neutral>
      <joy id="1" alias="joy">
        <mouth_r mov_y="-5" mov_x="3"/>
        <mouth_l mov_y="-5" mov_x="-3"/>
        <cheek_r .../>
        <cheek_l .../>
        <!-- 14 parts -->
      </joy>
      <sadness id="2" alias="sadness">...</sadness>
      <anger id="3" alias="anger">...</anger>
      <fear id="4" alias="fear">...</fear>
      <disgust id="5" alias="disgust">...</disgust>
      <surprise id="6" alias="surprise">...</surprise>
    </emotions>
    <visemes>
      <viseme id="1" alias="v1">
        <jaw rot_x="0.5" .../>
        <!-- 14 parts, each with multiplier values for that viseme -->
      </viseme>
      <!-- ... up to viseme id="9" -->
    </visemes>
  </expressions>
</avatar>
```

### 23.2 Bone Entry Schema (per axis)

```xml
<rot_X def="0.0" min="-45.0" max="45.0" inertia="0.0"/>
```

| Attribute | Type   | Default | Description                                  |
|-----------|--------|---------|----------------------------------------------|
| `def`     | number | bone's current value | Neutral/rest position                      |
| `min`     | number | bone's current value | Maximum displacement in negative direction |
| `max`     | number | bone's current value | Maximum displacement in positive direction |
| `inertia` | number | 0.0      | Smoothing weight [0.0=instant, 1.0=frozen]  |

### 23.3 Expression Entry Schema (per bone)

```xml
<mouth_r rot_x="0.0" rot_y="0.0" rot_z="1.0"
         mov_x="0.0" mov_y="-5.0" mov_z="0.0"/>
```

| Attribute | Type   | Default | Description                              |
|-----------|--------|---------|------------------------------------------|
| `rot_x`   | number | 0       | Rotation X multiplier for this expression |
| `rot_y`   | number | 0       | Rotation Y multiplier                    |
| `rot_z`   | number | 0       | Rotation Z multiplier                    |
| `mov_x`   | number | 0       | Translation X multiplier                 |
| `mov_y`   | number | 0       | Translation Y multiplier                 |
| `mov_z`   | number | 0       | Translation Z multiplier                 |

---

## 24. Migration Notes

### 24.1 Platform Replacements

| ActionScript (Away3D)      | TypeScript (Three.js)          |
|----------------------------|--------------------------------|
| `away3d.containers.Bone`   | `THREE.Bone`                   |
| `away3d.containers.ObjectContainer3D` | `THREE.Group` or `THREE.Object3D` |
| `away3d.loaders.Collada`   | `THREE.ColladaLoader` or `GLTFLoader` |
| `away3d.containers.View3D` | `THREE.WebGLRenderer` + `THREE.Scene` + `THREE.Camera` |
| `away3d.core.base.Object3D`| `THREE.Object3D`               |
| `caurina.transitions.Tweener` | `@tweenjs/tween.js` or GSAP   |
| `flash.utils.Timer`        | `setInterval` / `setTimeout`   |
| `flash.events.Event`       | Custom event emitter           |
| `flash.display.BitmapData` | `HTMLCanvasElement` + `CanvasRenderingContext2D` |
| `flash.filters.BlurFilter` | Canvas `filter` or CSS `filter: blur()` |
| `flash.filters.GlowFilter` | Canvas `shadowBlur` / CSS `filter: drop-shadow()` |

### 24.2 Config Approach

- **ActionScript:** XML embedded at compile-time via `[Embed]` metadata
- **TypeScript:** JSON or XML loaded at runtime via `fetch()`, or bundled as a static import

### 24.3 Tweening Library

The original uses `caurina.transitions.Tweener`. Recommended TypeScript equivalents:

| Library       | Package                     |
|---------------|-----------------------------|
| Tween.js      | `@tweenjs/tween.js`         |
| GSAP          | `gsap`                      |
| anime.js      | `animejs`                   |
| Three.js addon| `three/addons/libs/tween.module.js` |

### 24.4 Hardcoded Constants

| Constant               | Value | Source File            |
|------------------------|-------|------------------------|
| Amplitude → viseme     | ×13.5 | `AvatarAnimator.as`    |
| Neutral return tween   | 0.5s  | `AvatarMouth.as`       |
| LookAt center constant | 400   | `AvatarCore.as`        |
| Lipsync amp interval   | 100ms | `AvatarAnimator.as`    |
| Lipsync init volume    | 1.0   | `AvatarAnimator.as`    |
| Phoneme delay override | 50ms  | `AvatarAnimator.as`    |
| Collada scale factor   | 10.5  | `AvatarModelProvider.as`|
| Magnify zoom           | 3.5×  | `LipsyncEditorWindow.as`|
| Magnify size           | 420×260 | `LipsyncEditorWindow.as`|
| Blur filter            | (3,3) | `LipsyncEditorWindow.as`|
| Glow filter            | (0x0, 0.5, 20, 20) | `LipsyncEditorWindow.as`|

### 24.5 Missing Source Assets

These files are referenced by `[Embed]` annotations but **absent from the repository**:

| Expected Path                | Used By                  |
|------------------------------|--------------------------|
| `lib/model/model.dae`        | AvatarModelProvider      |
| `lib/model/model_man.dae`    | AvatarModelProvider      |
| `lib/model/texture.jpg`      | AvatarModelProvider      |
| `lib/model/texture_m.jpg`    | AvatarModelProvider      |
| `lib/model/eye.jpg`          | AvatarModelProvider      |
| `lib/model/teeth.jpg`        | AvatarModelProvider      |
| `lib/lipsync/network_image_m`| NeuralNetworkProvider    |
| `lib/lipsync/network_image_f`| NeuralNetworkProvider    |
| `lib/xml/avatar_default.xml` | AvatarXMLProvider        |

### 24.6 Unimplemented Stubs

| Method                | Status                |
|-----------------------|-----------------------|
| `AvatarCore.lookAtTween()` | Empty stub          |
| `ExpressionsCollection.combine()` | Returns null    |
| `AvatarCore.setVisemeValue()` | Partially disabled (mouth lines commented out) |
| `AvatarCore.setEmotionValue()` | Partially disabled |
| `AvatarFeature.eyebrow` (AvatarEye) | Declared but never initialized |

---

*End of specification. All behavior documented here is sourced from the ActionScript 3 source code at `~/LipSync/src/`. The XML config schema is inferred from parser consumers and represents the expected shape of the missing `avatar_default.xml` file.*
