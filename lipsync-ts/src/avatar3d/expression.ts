/**
 * Expression System Data Model
 *
 * Pure data/logic types for the 3D avatar expression system:
 *   - BoneParameter interface & BoneRot/BoneMov (inertia blending, §3)
 *   - AvatarFeature — 6-DOF bone wrapper (§4)
 *   - ExpressionParameter — per-bone multiplier (§10)
 *   - AvatarExpression — 14‑parameter expression container (§8)
 *   - ExpressionsCollection — static emotion + viseme registry (§9)
 *
 * No rendering, no Three.js dependency.
 *
 * Reference: avatar3d.spec.md §§3–4, 8–10
 */

// ─── BoneParameter Interface (§3.1) ─────────────────────────

export interface BoneParameter {
  /** Get/set the current value (immediate, with inertia blending). */
  value: number;

  /**
   * Refresh the current value using a change multiplier.
   * Used for proportional rescaling.
   *   bone.state *= (nextWeight * change + currentWeight)
   */
  refreshValue(change: number): void;

  /**
   * Animate the bone to a target value using a Tweener transition.
   *
   * @param value       Normalized input [-1, 1] → mapped to [min, max] via def
   * @param time        Duration in seconds
   * @param delay       Delay before start (default 0)
   * @param transition  Easing function name (default "linear")
   */
  setValueTween(
    value: number,
    time: number,
    delay?: number,
    transition?: string,
  ): void;
}

// ─── Inertia Blending Base (§3.2–3.3) ───────────────────────

interface BoneParameterConfig {
  def: number;
  min: number;
  max: number;
  inertia: number;
}

/**
 * Shared inertia-blending logic for BoneRot and BoneMov.
 *
 * Formula (§3.2):
 *   stateₜ = stateₜ₋₁ × I + target × (1 − I)
 *
 *   where I = inertia weight (0.0 = instant, 0.5 = half-life, 1.0 = frozen)
 */
abstract class BaseBoneParameter implements BoneParameter {
  protected _state: number;

  readonly def: number;
  readonly min: number;
  readonly max: number;
  readonly inertia: number;
  readonly currentWeight: number;
  readonly nextWeight: number;

  constructor(config: BoneParameterConfig) {
    this.def = config.def;
    this.min = config.min;
    this.max = config.max;
    this.inertia = config.inertia;
    this.currentWeight = config.inertia;
    this.nextWeight = 1.0 - config.inertia;
    this._state = config.def;
  }

  /** Read the current blended state. */
  get value(): number {
    return this._state;
  }

  /**
   * Set a new value with inertia blending.
   *
   * 1. Retain current state × inertia weight
   * 2. Clamp input to [-1, 1] and map to [min, max] range via def
   * 3. Blend: new = (old × inertia) + (target × (1 − inertia))
   */
  set value(input: number) {
    this._state *= this.currentWeight;

    const clamped = Math.max(-1, Math.min(1, input));

    let target: number;
    if (clamped > 0) {
      target = this.def + this.max * clamped;
    } else if (clamped < 0) {
      target = this.def + this.min * -clamped;
    } else {
      target = this.def;
    }

    this._state += this.nextWeight * target;
  }

  /** Proportional rescaling (§3.3). */
  refreshValue(change: number): void {
    this._state *= this.nextWeight * change + this.currentWeight;
  }

  /**
   * Compute the target and set the state directly.
   * In a rendering environment this would schedule a Tween animation
   * over `time` seconds; here we apply the final value immediately
   * (bypassing inertia blending, consistent with the Tweener pattern).
   */
  setValueTween(
    input: number,
    _time: number,
    _delay?: number,
    _transition?: string,
  ): void {
    const clamped = Math.max(-1, Math.min(1, input));

    let target: number;
    if (clamped > 0) {
      target = this.def + this.max * clamped;
    } else if (clamped < 0) {
      target = this.def + this.min * -clamped;
    } else {
      target = this.def;
    }

    this._state = target;
  }
}

// ─── BoneRot (§3) ───────────────────────────────────────────

/** Rotation degree-of-freedom with inertia blending. */
export class BoneRot extends BaseBoneParameter {
  constructor(def = 0, min = 0, max = 0, inertia = 0) {
    super({ def, min, max, inertia });
  }
}

// ─── BoneMov (§3) ───────────────────────────────────────────

/** Translation (movement) degree-of-freedom with inertia blending. */
export class BoneMov extends BaseBoneParameter {
  constructor(def = 0, min = 0, max = 0, inertia = 0) {
    super({ def, min, max, inertia });
  }
}

// ─── ExpressionParameter (§10) ──────────────────────────────

/** Config object for constructing an ExpressionParameter. */
export interface ExpressionParameterConfig {
  rot_x?: number;
  rot_y?: number;
  rot_z?: number;
  mov_x?: number;
  mov_y?: number;
  mov_z?: number;
}

/**
 * Per-bone multiplier values for one expression.
 * Each value multiplies the normalized [-1, 1] input to produce the
 * final bone position offset.
 */
export class ExpressionParameter {
  readonly rotation: boolean;
  readonly rot_x: number;
  readonly rot_y: number;
  readonly rot_z: number;

  readonly movement: boolean;
  readonly mov_x: number;
  readonly mov_y: number;
  readonly mov_z: number;

  constructor(config: ExpressionParameterConfig = {}) {
    this.rot_x = config.rot_x ?? 0;
    this.rot_y = config.rot_y ?? 0;
    this.rot_z = config.rot_z ?? 0;
    this.mov_x = config.mov_x ?? 0;
    this.mov_y = config.mov_y ?? 0;
    this.mov_z = config.mov_z ?? 0;

    this.rotation = this.rot_x !== 0 || this.rot_y !== 0 || this.rot_z !== 0;
    this.movement = this.mov_x !== 0 || this.mov_y !== 0 || this.mov_z !== 0;
  }
}

// ─── AvatarFeature (§4) ─────────────────────────────────────

/**
 * Wraps a single bone with 6 degrees of freedom.
 * Each DOF (rotX/Y/Z, movX/Y/Z) is a BoneParameter (BoneRot or BoneMov).
 */
export class AvatarFeature {
  rotX: BoneParameter;
  rotY: BoneParameter;
  rotZ: BoneParameter;
  movX: BoneParameter;
  movY: BoneParameter;
  movZ: BoneParameter;

  constructor(
    rotX: BoneParameter = new BoneRot(),
    rotY: BoneParameter = new BoneRot(),
    rotZ: BoneParameter = new BoneRot(),
    movX: BoneParameter = new BoneMov(),
    movY: BoneParameter = new BoneMov(),
    movZ: BoneParameter = new BoneMov(),
  ) {
    this.rotX = rotX;
    this.rotY = rotY;
    this.rotZ = rotZ;
    this.movX = movX;
    this.movY = movY;
    this.movZ = movZ;
  }

  /**
   * Set all DOF values immediately from an ExpressionParameter multiplier.
   *   value * parameter.rot_x → rotX.value, etc.
   */
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

  /**
   * Set all DOF values via Tweener transitions.
   * Dispatches to each DOF's setValueTween.
   */
  setParameterTween(
    value: number,
    parameter: ExpressionParameter,
    time: number,
  ): void {
    if (parameter.rotation) {
      this.rotX.setValueTween(value * parameter.rot_x, time);
      this.rotY.setValueTween(value * parameter.rot_y, time);
      this.rotZ.setValueTween(value * parameter.rot_z, time);
    }
    if (parameter.movement) {
      this.movX.setValueTween(value * parameter.mov_x, time);
      this.movY.setValueTween(value * parameter.mov_y, time);
      this.movZ.setValueTween(value * parameter.mov_z, time);
    }
  }
}

// ─── AvatarExpression (§8.1) ────────────────────────────────

/** Config object for constructing an AvatarExpression (14 optional params). */
export interface AvatarExpressionParams {
  jaw?: ExpressionParameter;
  tongue?: ExpressionParameter;
  mouth_r?: ExpressionParameter;
  mouth_l?: ExpressionParameter;
  lip_down_r?: ExpressionParameter;
  lip_down_m?: ExpressionParameter;
  lip_down_l?: ExpressionParameter;
  lip_top_r?: ExpressionParameter;
  lip_top_m?: ExpressionParameter;
  lip_top_l?: ExpressionParameter;
  cheek_r?: ExpressionParameter;
  cheek_l?: ExpressionParameter;
  cheekb_r?: ExpressionParameter;
  cheekb_l?: ExpressionParameter;
}

/**
 * Holds 14 ExpressionParameter multipliers for a single expression
 * (emotion or viseme).
 */
export class AvatarExpression {
  id: number;
  alias: string;

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

  constructor(
    id: number,
    alias: string,
    params: AvatarExpressionParams = {},
  ) {
    this.id = id;
    this.alias = alias;

    this.jaw = params.jaw ?? new ExpressionParameter();
    this.tongue = params.tongue ?? new ExpressionParameter();
    this.mouth_r = params.mouth_r ?? new ExpressionParameter();
    this.mouth_l = params.mouth_l ?? new ExpressionParameter();
    this.lip_down_r = params.lip_down_r ?? new ExpressionParameter();
    this.lip_down_m = params.lip_down_m ?? new ExpressionParameter();
    this.lip_down_l = params.lip_down_l ?? new ExpressionParameter();
    this.lip_top_r = params.lip_top_r ?? new ExpressionParameter();
    this.lip_top_m = params.lip_top_m ?? new ExpressionParameter();
    this.lip_top_l = params.lip_top_l ?? new ExpressionParameter();
    this.cheek_r = params.cheek_r ?? new ExpressionParameter();
    this.cheek_l = params.cheek_l ?? new ExpressionParameter();
    this.cheekb_r = params.cheekb_r ?? new ExpressionParameter();
    this.cheekb_l = params.cheekb_l ?? new ExpressionParameter();
  }
}

// ─── ExpressionsCollection (§9) ─────────────────────────────

/**
 * Global registry of all expressions, initialized from XML at startup.
 * Provides static lookup methods and 7 emotion singletons.
 */
export class ExpressionsCollection {
  /** Registered visemes (populated by initCollection). */
  static visemes: AvatarExpression[] = [];

  // 7 emotion singletons (§8.2)
  static NEUTRAL: AvatarExpression = new AvatarExpression(0, 'neutral');
  static JOY: AvatarExpression = new AvatarExpression(1, 'joy');
  static SADNESS: AvatarExpression = new AvatarExpression(2, 'sadness');
  static ANGER: AvatarExpression = new AvatarExpression(3, 'anger');
  static FEAR: AvatarExpression = new AvatarExpression(4, 'fear');
  static DISGUST: AvatarExpression = new AvatarExpression(5, 'disgust');
  static SURPRISE: AvatarExpression = new AvatarExpression(6, 'surprise');

  /**
   * Find a viseme by its alias string (e.g., "v1", "U").
   * Returns NEUTRAL if not found.
   */
  static getVisemeByAlias(alias: string): AvatarExpression {
    return this.visemes.find(v => v.alias === alias) ?? this.NEUTRAL;
  }

  /**
   * Find a viseme by its numeric ID.
   * Returns NEUTRAL if not found.
   */
  static getVisemeById(id: number): AvatarExpression {
    return this.visemes.find(v => v.id === id) ?? this.NEUTRAL;
  }

  /**
   * [NOT IMPLEMENTED] Combine a viseme and emotion into a blended expression.
   * Stub in source — returns null per §9.1.
   */
  static combine(
    _viseme: AvatarExpression,
    _emotion: AvatarExpression,
  ): AvatarExpression | null {
    return null;
  }

  /**
   * Register the runtime viseme collection (IDs 0-9 matching the AS3 phoneme→viseme mapping).
   * Must be called once at startup before any viseme lookups.
   */
  static initRuntimeCollection(): void {
    this.visemes = [
      new AvatarExpression(0, 'silence'),
      new AvatarExpression(1, 'v1'),
      new AvatarExpression(2, 'v2'),
      new AvatarExpression(3, 'v3'),
      new AvatarExpression(4, 'v4'),
      new AvatarExpression(5, 'v5'),
      new AvatarExpression(6, 'v6'),
      new AvatarExpression(7, 'v7'),
      new AvatarExpression(8, 'v8'),
      new AvatarExpression(9, 'v9'),
    ];
  }
}
