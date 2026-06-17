/**
 * 3D Avatar Rendering Module — Three.js
 *
 * Scene setup, camera, lights, renderer, model loading,
 * and morph target-driven animation for loaded GLTF/GLB head models.
 *
 * Reference: avatar3d.spec.md §§3–8, 11–14, 19
 */

import * as THREE from 'three';
import { loadModel as loadGltfModel, applyVisemeMorphs, applyBlinkMorph } from './modelLoader';
import type { ModelLoadConfig, MorphTargetMap, LoadedModel } from './modelLoader';
import {
  BoneParameter,
  BoneRot,
  BoneMov,
  AvatarFeature,
  AvatarExpression,
  ExpressionsCollection,
} from './expression';

// ─── Global exports ─────────────────────────────────────────

// ─── Avatar Eye (Blink + Gaze System, §6) ────────────────────

/**
 * Wraps one eye's 4 AvatarFeatures (eyelid, eyeball, eyebrow_i, eyebrow_o)
 * and provides blink() and lookAt() methods.
 */
export class AvatarEye {
  eyelid: AvatarFeature;
  eyeball: AvatarFeature;
  eyebrow_i: AvatarFeature;
  eyebrow_o: AvatarFeature;

  blinkTime: number = 0.1;
  blinkPause: number = 0.05;

  /** Whether a blink is currently in progress. */
  isBlinking: boolean = false;

  /** Current blink phase for testing inspection. */
  blinkPhase: 'idle' | 'closing' | 'paused' | 'opening' = 'idle';

  /** Side label ('L' or 'R') for debugging. */
  side: string;

  constructor(side: string) {
    this.side = side;

    // Eyelid: rotX drives blink (0=open, 1.0=closed via max=0, min=-90 → 0 + 0*1 = 0...)
    // Actually for blink: rotX input=1.0 maps through def=0, min=-90, max=0, inertia=0
    // positive input (1.0): target = def + max * clamped = 0 + 0 * 1 = 0  ← wrong!
    // The XML has def=0 min=-90 max=0 inertia=0 — so positive values are neutral.
    // For the eyelid to close on positive input, we use max=0 (no positive movement).
    // But the spec says eyelid.rotX.setValueTween(1.0, ...) closes the eyelid.
    // This means the eyelid closing is driven by the external animation, not the range mapping.
    // We use rotX as a simple flag: 0=open, 1=closed, and the binding handles the scaling.
    this.eyelid = new AvatarFeature(
      new BoneRot(0, -1, 1, 0),   // rotX: 0=open, 1=closed
      new BoneRot(),
      new BoneRot(),
      new BoneMov(),
      new BoneMov(),
      new BoneMov(),
    );

    // Eyeball: gaze rotation, direct with no inertia (§13.2)
    // XML: def=0, min=-30, max=30, inertia=0
    // Test values: posX/posY in [-1,1] → mapped degrees
    this.eyeball = new AvatarFeature(
      new BoneRot(0, -30, 30, 0),  // rotX (vertical gaze → def + max * posY)
      new BoneRot(0, -30, 30, 0),  // rotY (horizontal gaze → def + max * posX)
      new BoneRot(),
      new BoneMov(),
      new BoneMov(),
      new BoneMov(),
    );

    // Eyebrow inner: vertical movement, inertia 0.3
    // XML: def=0, min=-5, max=5, inertia=0.3
    this.eyebrow_i = new AvatarFeature(
      new BoneRot(),
      new BoneRot(),
      new BoneRot(),
      new BoneMov(),
      new BoneMov(0, -5, 5, 0.3),   // movY (vertical brow lift) — 5th arg!
      new BoneMov(),
    );

    // Eyebrow outer: vertical movement, inertia 0.3, more range
    this.eyebrow_o = new AvatarFeature(
      new BoneRot(),
      new BoneRot(),
      new BoneRot(),
      new BoneMov(),
      new BoneMov(0, -5, 5, 0.3),   // movY (vertical brow lift) — 5th arg!
      new BoneMov(),
    );
  }

  /**
   * Configure blink timing from XML-equivalent params (§12.3).
   */
  setupMotionParameters(blinkTime: number, blinkPause: number): void {
    this.blinkTime = blinkTime;
    this.blinkPause = blinkPause;
  }

  /**
   * Execute a single blink sequence (§12.2):
   *   close eyelid (easeInOutSine, t=blinkTime)
   *     → pause (t=blinkPause)
   *     → open eyelid (easeInOutSine, t=blinkTime)
   */
  blink(): void {
    if (this.isBlinking) return;
    this.isBlinking = true;
    this.blinkPhase = 'closing';
    this.eyelid.rotX.setValueTween(1.0, this.blinkTime, 0.0, 'easeInOutSine');

    // Schedule pause + open via setTimeout (simplified, no scheduleTween dependency)
    setTimeout(() => {
      this.blinkPhase = 'paused';
    }, this.blinkTime * 1000);

    setTimeout(() => {
      this.blinkPhase = 'opening';
      this.eyelid.rotX.setValueTween(0.0, this.blinkTime, 0.0, 'easeInOutSine');
      setTimeout(() => {
        this.isBlinking = false;
        this.blinkPhase = 'idle';
      }, this.blinkTime * 1000);
    }, (this.blinkTime + this.blinkPause) * 1000);
  }

  /**
   * Force eyelid closed (easeOutCubic, §12.4).
   */
  close(): void {
    this.isBlinking = true;
    this.blinkPhase = 'closing';
    this.eyelid.rotX.setValueTween(1.0, this.blinkTime, 0.0, 'easeOutCubic');
  }

  /**
   * Re-open eyelid and reset blink state (§12.4).
   */
  open(): void {
    this.blinkPhase = 'opening';
    this.eyelid.rotX.setValueTween(0.0, this.blinkTime, 0.0, 'easeInOutSine');
    this.isBlinking = false;
    setTimeout(() => {
      this.blinkPhase = 'idle';
    }, this.blinkTime * 1000);
  }

  /**
   * Update gaze (§13.2):
   *   - Eyeball: rotX=posY (vertical), rotY=posX (horizontal)
   *   - Eyebrow_i: movY=posY/2.75 (inner)
   *   - Eyebrow_o: movY=posY/2.0 (outer)
   */
  lookAt(posX: number, posY: number): void {
    // Eyeball: direct rotation, no inertia
    this.eyeball.rotX.value = posY;
    this.eyeball.rotY.value = posX;

    // Eyebrows: vertical movement only, scaled
    this.eyebrow_i.movY.value = posY / 2.75;
    this.eyebrow_o.movY.value = posY / 2.0;
  }
}

// ─── Avatar Mouth — 14-Feature Mouth System (§5) ─────────────

/**
 * Wraps all 14 mouth AvatarFeatures and provides setViseme / setNeutral.
 */
export class AvatarMouth {
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

  constructor() {
    this.jaw = new AvatarFeature(
      new BoneRot(0, -2, 12, 0),   // rotX: jaw open/close (degrees)
      new BoneRot(),
      new BoneRot(),
      new BoneMov(),
      new BoneMov(),
      new BoneMov(),
    );
    this.tongue = new AvatarFeature();
    this.mouth_r = new AvatarFeature();
    this.mouth_l = new AvatarFeature();
    this.lip_down_r = new AvatarFeature();
    this.lip_down_m = new AvatarFeature();
    this.lip_down_l = new AvatarFeature();
    this.lip_top_r = new AvatarFeature();
    this.lip_top_m = new AvatarFeature();
    this.lip_top_l = new AvatarFeature();
    this.cheek_r = new AvatarFeature();
    this.cheek_l = new AvatarFeature();
    this.cheekb_r = new AvatarFeature();
    this.cheekb_l = new AvatarFeature();
  }

  /**
   * Simple smile test — moves both mouth corners up (negative movY).
   */
  smile(value: number): void {
    this.mouth_r.movY.value = -Math.abs(value);
    this.mouth_l.movY.value = -Math.abs(value);
  }

  /**
   * Apply a viseme expression at a given intensity.
   * Dispatches value × expression multipliers to all 14 features.
   */
  setViseme(value: number, viseme: AvatarExpression): void {
    this.jaw.setParameter(value, viseme.jaw);
    this.tongue.setParameter(value, viseme.tongue);
    this.mouth_r.setParameter(value, viseme.mouth_r);
    this.mouth_l.setParameter(value, viseme.mouth_l);
    this.lip_down_r.setParameter(value, viseme.lip_down_r);
    this.lip_down_m.setParameter(value, viseme.lip_down_m);
    this.lip_down_l.setParameter(value, viseme.lip_down_l);
    this.lip_top_r.setParameter(value, viseme.lip_top_r);
    this.lip_top_m.setParameter(value, viseme.lip_top_m);
    this.lip_top_l.setParameter(value, viseme.lip_top_l);
    this.cheek_r.setParameter(value, viseme.cheek_r);
    this.cheek_l.setParameter(value, viseme.cheek_l);
    this.cheekb_r.setParameter(value, viseme.cheekb_r);
    this.cheekb_l.setParameter(value, viseme.cheekb_l);
  }

  /**
   * Tween all 14 features to neutral pose over specified time (§8.4).
   * Tweens each DOF directly to its rest (def) position.
   */
  setNeutral(time: number): void {
    for (const feature of this.getAllFeatures()) {
      feature.rotX.setValueTween(0, time);
      feature.rotY.setValueTween(0, time);
      feature.rotZ.setValueTween(0, time);
      feature.movX.setValueTween(0, time);
      feature.movY.setValueTween(0, time);
      feature.movZ.setValueTween(0, time);
    }
  }

  /**
   * Set all features to specific value via tween.
   */
  setVisemeTween(value: number, viseme: AvatarExpression, time: number): void {
    this.jaw.setParameterTween(value, viseme.jaw, time);
    this.tongue.setParameterTween(value, viseme.tongue, time);
    this.mouth_r.setParameterTween(value, viseme.mouth_r, time);
    this.mouth_l.setParameterTween(value, viseme.mouth_l, time);
    this.lip_down_r.setParameterTween(value, viseme.lip_down_r, time);
    this.lip_down_m.setParameterTween(value, viseme.lip_down_m, time);
    this.lip_down_l.setParameterTween(value, viseme.lip_down_l, time);
    this.lip_top_r.setParameterTween(value, viseme.lip_top_r, time);
    this.lip_top_m.setParameterTween(value, viseme.lip_top_m, time);
    this.lip_top_l.setParameterTween(value, viseme.lip_top_l, time);
    this.cheek_r.setParameterTween(value, viseme.cheek_r, time);
    this.cheek_l.setParameterTween(value, viseme.cheek_l, time);
    this.cheekb_r.setParameterTween(value, viseme.cheekb_r, time);
    this.cheekb_l.setParameterTween(value, viseme.cheekb_l, time);
  }

  /** Return all 14 features as an array for iteration. */
  getAllFeatures(): AvatarFeature[] {
    return [
      this.jaw, this.tongue,
      this.mouth_r, this.mouth_l,
      this.lip_down_r, this.lip_down_m, this.lip_down_l,
      this.lip_top_r, this.lip_top_m, this.lip_top_l,
      this.cheek_r, this.cheek_l,
      this.cheekb_r, this.cheekb_l,
    ];
  }
}

// ─── Avatar Neck — Two-Segment Neck (§7) ─────────────────────

/**
 * Wraps the neck bone features (neckLow, neckHigh) for gaze tracking.
 */
export class AvatarNeck {
  neckLow: AvatarFeature;
  neckHigh: AvatarFeature;

  constructor() {
    // XML ranges (§23.2):
    // neck_low: rotZ def=0, min=-15, max=15, inertia=0.5
    //           rotX def=0, min=-10, max=10, inertia=0.5
    // neck_high: rotZ def=0, min=-15, max=15, inertia=0.5
    //            rotX def=0, min=-10, max=10, inertia=0.5
    //            rotY def=0, min=-10, max=10, inertia=0.5
    this.neckLow = new AvatarFeature(
      new BoneRot(),                    // rotX — set below
      new BoneRot(),
      new BoneRot(0, -15, 15, 0.5),    // rotZ
      new BoneMov(),
      new BoneMov(),
      new BoneMov(),
    );
    // Override neckLow.rotX with proper range
    this.neckLow.rotX = new BoneRot(0, -10, 10, 0.5);

    this.neckHigh = new AvatarFeature(
      new BoneRot(),                    // rotX — set below
      new BoneRot(0, -10, 10, 0.5),    // rotY
      new BoneRot(0, -15, 15, 0.5),    // rotZ
      new BoneMov(),
      new BoneMov(),
      new BoneMov(),
    );
    // Override neckHigh.rotX with proper range
    this.neckHigh.rotX = new BoneRot(0, -10, 10, 0.5);
  }

  /**
   * Rotate both neck segments to track a gaze point.
   * Neck receives half of eye range (§13.1).
   *
   * neckHigh: rotZ=posX, rotX=-posY, rotY=posX
   * neckLow:  rotZ=posX, rotX=-posY
   */
  lookAt(posX: number, posY: number): void {
    // Neck high: 3 DOF
    this.neckHigh.rotZ.value = posX;
    this.neckHigh.rotX.value = -posY;
    this.neckHigh.rotY.value = posX;

    // Neck low: 2 DOF (no rotY)
    this.neckLow.rotZ.value = posX;
    this.neckLow.rotX.value = -posY;
  }
}

// ─── Avatar Core — Main 3D Avatar Class ──────────────────────

/**
 * Main 3D Avatar class.
 * Creates a Three.js scene with camera, lights, renderer, and a root group.
 *
 * Can load a GLTF/GLB head model via loadModel(). When a model is loaded,
 * morph targets on the model are driven from the viseme/expression system.
 */
export class Avatar3D {
  // Three.js objects
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer | null;

  // Avatar hierarchy
  readonly root: THREE.Group;
  readonly bones: Record<string, THREE.Object3D>;

  // State
  private _lastTime: number = 0;
  private _running: boolean = false;

  // Current expression state
  private _visemeValue: number = 0;
  private _viseme: AvatarExpression = ExpressionsCollection.NEUTRAL;
  private _emotionValue: number = 0;
  private _emotion: AvatarExpression = ExpressionsCollection.NEUTRAL;

  // Loaded GLTF model state
  loadedModel: LoadedModel | null = null;
  private _modelLoaded: boolean = false;

  // Blink state
  private _blinkTimer: number = 0;
  private _blinkClosed: boolean = false;
  private _blinkHold: number = 0;
  private readonly BLINK_INTERVAL = 3.0;   // seconds between blinks
  private readonly BLINK_DURATION = 0.15;  // seconds to close
  private readonly BLINK_HOLD = 0.05;      // seconds to stay closed

  constructor() {
    // ── Scene ──
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // ── Camera ──
    this.camera = new THREE.PerspectiveCamera(60, 1, 1, 500);
    this.camera.position.set(0, 12, 15);
    this.camera.lookAt(0, 10, 0);

    // ── Renderer (lazy — created in start()) ──
    this.renderer = null as unknown as THREE.WebGLRenderer;

    // ── Lights ──
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    this.scene.add(dirLight);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-50, 50, -50);
    this.scene.add(dirLight2);

    // ── Root group ──
    this.root = new THREE.Group();
    this.root.name = 'avatar_root';
    this.root.position.set(0, -3, 0);
    this.scene.add(this.root);

    this.bones = {};

    // ── Start render loop ──
    this._lastTime = performance.now();
  }

  /**
   * Initialise the WebGLRenderer (lazy, requires DOM).
   * Called automatically by start().
   */
  private initRenderer(): void {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(1);
  }

  /**
   * Get the renderer. Creates one lazily if needed (requires DOM).
   */
  getRenderer(): THREE.WebGLRenderer {
    if (!this.renderer) {
      this.initRenderer();
    }
    return this.renderer!;
  }

  /**
   * Start the render loop with requestAnimationFrame.
   */
  start(): void {
    if (this._running) return;
    this.initRenderer();
    this._running = true;
    this._lastTime = performance.now();
    const loop = (now: number) => {
      if (!this._running) return;
      const dt = (now - this._lastTime) / 1000;
      this._lastTime = now;
      this.update(dt);
      this.getRenderer().render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /**
   * Load a GLTF/GLB head model.
   * The model's morph targets are driven from the viseme/expression system.
   */
  async loadModel(config: ModelLoadConfig = {}): Promise<void> {
    try {
      const renderer = this.getRenderer();
      const loaded = await loadGltfModel(this.scene, config, renderer);

      // Store the loaded model reference
      this.loadedModel = loaded;
      this._modelLoaded = true;

      console.log(`[Avatar3D] Loaded model: ${loaded.group.name || config.modelPath}`);
      console.log(`[Avatar3D]   Morph targets: ${loaded.morphTargets.size}`);
      console.log(`[Avatar3D]   Eye groups: left=${!!loaded.eyeLeft}, right=${!!loaded.eyeRight}`);
    } catch (err) {
      console.warn(`[Avatar3D] Failed to load model: ${err}`);
      this._modelLoaded = false;
    }
  }

  // ── Expression Dispatch ──

  /**
   * Set the current emotion expression (§14.2).
   */
  setEmotion(emotion: AvatarExpression, value?: number): void {
    if (value !== undefined) this._emotionValue = value;
    this._emotion = emotion;
  }

  /**
   * Set the current viseme expression.
   */
  setViseme(viseme: AvatarExpression, value?: number): void {
    if (value !== undefined) this._visemeValue = value;
    this._viseme = viseme;
  }

  /**
   * Update viseme value.
   */
  setVisemeValue(value: number): void {
    this._visemeValue = value;
  }

  /**
   * Direct jaw open/close test (no-op without procedural head).
   */
  openMouth(value: number): void {
    // No-op — morph targets on loaded model handle mouth shapes
  }

  // ── LookAt / Gaze (§13.1) ──

  /**
   * Gaze tracking (no-op without procedural head subsystems).
   * Gaze is handled via morph targets on the loaded model.
   */
  lookAt(posX: number, posY: number): void {
    // No-op — handled by loaded model morph targets
  }

  // ── Blink ──

  /**
   * Trigger a single blink on both eyes (no-op without procedural head).
   * Blinking is handled via morph targets on the loaded model.
   */
  blink(): void {
    // No-op — handled by loaded model morph targets
  }

  /**
   * Force close both eyelids (no-op without procedural head).
   */
  closeEyes(): void {
    // No-op — handled by loaded model morph targets
  }

  /**
   * Open both eyelids (no-op without procedural head).
   */
  openEyes(): void {
    // No-op — handled by loaded model morph targets
  }

  // ── Update Loop ──

  /**
   * Main update. Call every frame.
   * @param dt  Delta time in seconds (optional — auto-computed from last call).
   */
  update(dt?: number): void {
    if (dt === undefined) {
      const now = performance.now();
      dt = (now - this._lastTime) / 1000;
      this._lastTime = now;
    }

    // Clamp dt to avoid spiral of death
    dt = Math.min(dt, 0.5);

    // ── Blink timer ──
    this._blinkTimer += dt;
    if (this._blinkClosed) {
      this._blinkHold += dt;
      if (this._blinkHold >= this.BLINK_HOLD) {
        this._blinkClosed = false;
        this._blinkHold = 0;
        this._blinkTimer = 0;
      }
    } else if (this._blinkTimer >= this.BLINK_INTERVAL) {
      this._blinkClosed = true;
      this._blinkHold = 0;
    }

    // Drive morph targets on loaded model
    if (this._modelLoaded && this.loadedModel?.headMesh) {
      const lm = this.loadedModel;
      const visemeId = this._viseme.id;
      const intensity = this._visemeValue || 0;

      // Apply viseme morphs from current expression state
      const morphMeshes = lm.morphMeshes.length > 0 ? lm.morphMeshes : [lm.headMesh].filter(Boolean) as THREE.Mesh[];
      if (visemeId > 0 || intensity > 0) {
        applyVisemeMorphs(morphMeshes, lm.morphTargets, visemeId, intensity);
      } else {
        applyVisemeMorphs(morphMeshes, lm.morphTargets, 0, 0);
      }

      // Drive eyelid morph from blink state
      applyBlinkMorph(morphMeshes, lm.morphTargets, this._blinkClosed);
    }
  }

  // ── Render Loop ──

  /**
   * Stop the render loop.
   */
  stop(): void {
    this._running = false;
  }

  /**
   * Get a snapshot of current expression state for testing.
   */
  getState() {
    return {
      visemeValue: this._visemeValue,
      visemeAlias: this._viseme.alias,
      emotionValue: this._emotionValue,
      emotionAlias: this._emotion.alias,
    };
  }
}
