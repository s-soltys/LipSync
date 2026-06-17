/**
 * 3D Avatar Rendering Module — Three.js
 *
 * Scene setup, camera, lights, renderer, model loading,
 * and morph target-driven animation for loaded GLTF/GLB head models.
 *
 * Reference: avatar3d.spec.md §§3–8, 11–14, 19
 */

import * as THREE from 'three';
import { loadModel as loadGltfModel, applyVisemeMorphs } from './modelLoader';
import type { ModelLoadConfig, MorphTargetMap, LoadedModel } from './modelLoader';
import {
  AvatarExpression,
  ExpressionsCollection,
} from './expression';

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

  // State
  private _lastTime: number = 0;
  private _running: boolean = false;

  // Current expression state
  private _visemeValue: number = 0;
  private _viseme: AvatarExpression = ExpressionsCollection.NEUTRAL;

  // Loaded GLTF model state
  loadedModel: LoadedModel | null = null;
  private _modelLoaded: boolean = false;

  // Dirty tracking for morph updates
  private _lastVisemeId: number = -1;
  private _lastIntensity: number = -1;

  // rAF handle for dispose
  private _rafId: number = 0;

  // Camera preset cycling
  private cameraPresets: Array<{pos: [number,number,number]; target: [number,number,number]; fov: number; label: string}> = [
    { pos: [0, 12, 15], target: [0, 10, 0], fov: 60, label: 'Standard' },
    { pos: [0, 13, 4.5], target: [0, 13, 0], fov: 45, label: 'Face' },
  ];
  private _currentPreset: number = 0; // start at 'Standard'
  private _targetPos: THREE.Vector3 = new THREE.Vector3(0, 12, 15);
  private _targetTarget: THREE.Vector3 = new THREE.Vector3(0, 10, 0);
  private _currentTarget: THREE.Vector3 = new THREE.Vector3(0, 10, 0);
  private _targetFov: number = 60;
  private _cameraLerping: boolean = false;
  private _cameraLerpSpeed: number = 3.0; // seconds for full transition

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
   * Handle window resize. Updates camera aspect ratio and renderer size.
   */
  handleResize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.renderer) {
      this.renderer.setSize(w, h);
    }
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
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
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

    // ── Camera lerp ──
    if (this._cameraLerping) {
      const lerpFactor = 1 - Math.exp(-dt * this._cameraLerpSpeed);
      this.camera.position.lerp(this._targetPos, lerpFactor);
      this.camera.fov += (this._targetFov - this.camera.fov) * lerpFactor;
      this.camera.updateProjectionMatrix();
      this._currentTarget.lerp(this._targetTarget, lerpFactor);
      this.camera.lookAt(this._currentTarget);

      // Snap when close enough
      if (this.camera.position.distanceTo(this._targetPos) < 0.01) {
        this.camera.position.copy(this._targetPos);
        this.camera.fov = this._targetFov;
        this.camera.updateProjectionMatrix();
        this._currentTarget.copy(this._targetTarget);
        this.camera.lookAt(this._targetTarget);
        this._cameraLerping = false;
      }
    }

    // Drive morph targets on loaded model
    if (this._modelLoaded && this.loadedModel?.headMesh) {
      const lm = this.loadedModel;
      const visemeId = this._viseme.id;
      const intensity = this._visemeValue || 0;

      // Dirty tracking — skip if viseme and intensity haven't changed
      if (visemeId === this._lastVisemeId && intensity === this._lastIntensity) {
        // Skip morph updates this frame
      } else {
        this._lastVisemeId = visemeId;
        this._lastIntensity = intensity;

        // Apply viseme morphs from current expression state
        const morphMeshes = lm.morphMeshes.length > 0 ? lm.morphMeshes : [lm.headMesh].filter(Boolean) as THREE.Mesh[];
        if (visemeId > 0 || intensity > 0) {
          applyVisemeMorphs(morphMeshes, lm.morphTargets, visemeId, intensity);
        } else {
          applyVisemeMorphs(morphMeshes, lm.morphTargets, 0, 0);
        }
      }
    }
  }

  cycleCameraPreset(): string {
    this._currentPreset = (this._currentPreset + 1) % this.cameraPresets.length;
    const preset = this.cameraPresets[this._currentPreset];
    this._targetPos.set(preset.pos[0], preset.pos[1], preset.pos[2]);
    this._targetTarget.set(preset.target[0], preset.target[1], preset.target[2]);
    // Start look-at transition from current camera direction, not new target
    const dist = this.camera.position.distanceTo(this._targetTarget);
    this._currentTarget.copy(this.camera.position).add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(dist));
    this._targetFov = preset.fov;
    this._cameraLerping = true;
    return preset.label;
  }
  
  getCurrentPresetLabel(): string {
    return this.cameraPresets[this._currentPreset].label;
  }

  // ── Render Loop ──

  /**
   * Stop the render loop.
   */
  stop(): void {
    this._running = false;
  }

  /**
   * Dispose of all Three.js resources. Cancels the rAF loop,
   * disposes the renderer, and removes the canvas from the DOM.
   * Call this on HMR or component unmount to prevent memory leaks.
   */
  dispose(): void {
    this._running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
      this.renderer = null as unknown as THREE.WebGLRenderer;
    }
    // Remove loaded model from scene
    if (this.loadedModel) {
      this.scene.remove(this.loadedModel.group);
    }
  }

  /**
   * Get a snapshot of current expression state for testing.
   */
  getState() {
    return {
      visemeValue: this._visemeValue,
      visemeAlias: this._viseme.alias,
    };
  }
}
