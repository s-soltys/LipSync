/**
 * 3D Model Loader — GLTF/GLB head model integration
 *
 * Loads a 3D head model (facecap.glb or brunette.glb) and integrates it
 * with the Avatar3D system. Supports morph target-based facial animation
 * for visemes and bone-driven eye rotation.
 *
 * The facecap.glb model (from three.js examples, by Face Cap, CC license):
 *   - Head mesh with 52 morph targets (jawOpen, mouthSmile_L, browInnerUp, etc.)
 *   - Eye groups (grp_eyeLeft, grp_eyeRight) for gaze rotation
 *   - Teeth mesh
 *
 * The brunette.glb model (Ready Player Me avatar, CC BY-NC 4.0):
 *   - Full body with 72 morph targets including viseme shapes
 *   - Complete bone rig with Neck, Head, eye bones
 *   - Textured realistic avatar
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { AvatarFeature } from './expression';

/**
 * Configuration for model loading.
 */
export interface ModelLoadConfig {
  /** Path to the GLB file (relative to public/) */
  modelPath?: string;
  /** Scale factor for the model */
  scale?: number;
  /** Y-offset for positioning the model */
  positionY?: number;
}

const DEFAULT_CONFIG: Required<ModelLoadConfig> = {
  modelPath: '/models/facecap.glb',
  scale: 10,
  positionY: -3,
};

/**
 * Morph target name map for facecap.glb — maps viseme types to morph target indices.
 * The facecap model uses ARKit-style morph target names.
 */
export type MorphTargetMap = Map<string, number>;

/**
 * Extract morph target names and indices from a skinned mesh or morph-target mesh.
 * Returns a map of morph target name → index.
 */
function extractMorphTargets(mesh: THREE.Mesh): MorphTargetMap {
  const map: MorphTargetMap = new Map();
  const geometry = mesh.geometry;
  if (!(geometry instanceof THREE.BufferGeometry)) return map;
  const morphAttrs = geometry.morphAttributes;
  if (!morphAttrs || !morphAttrs.position) return map;

  // Three.js r150+ GLTFLoader stores names in mesh.morphTargetDictionary
  const dict = (mesh as any).morphTargetDictionary as Record<string, number> | undefined;
  if (dict && Object.keys(dict).length > 0) {
    for (const [name, index] of Object.entries(dict)) {
      map.set(name, index);
    }
    return map;
  }

  // Try getting names from the userData (set by some loaders)
  const names = mesh.userData?.targetNames as string[] | undefined;
  if (names) {
    for (let i = 0; i < names.length; i++) {
      map.set(names[i], i);
    }
    return map;
  }

  // Fallback: use indices only
  for (let i = 0; i < morphAttrs.position.length; i++) {
    map.set(String(i), i);
  }
  return map;
}

/**
 * Result of loading a model into the scene.
 */
export interface LoadedModel {
  /** The root group of the loaded model */
  group: THREE.Group;
  /** Scene to which the model was added */
  scene: THREE.Scene;
  /** Map of morph target name → index for the head mesh */
  morphTargets: MorphTargetMap;
  /** The primary head mesh (with morph targets) — first mesh named 'Wolf3D_Head' or first morph mesh */
  headMesh: THREE.Mesh | null;
  /** All meshes with morph targets (for models with multiple morph meshes like brunette.glb) */
  morphMeshes: THREE.Mesh[];
  /** Eye left group (for rotation) */
  eyeLeft: THREE.Object3D | null;
  /** Eye right group (for rotation) */
  eyeRight: THREE.Object3D | null;
  /** Head group for positioning */
  headGroup: THREE.Object3D | null;
}

/**
 * Load a GLTF/GLB model and integrate it with the scene.
 * Finds the head mesh, eye groups, and morph targets.
 */
export function loadModel(
  scene: THREE.Scene,
  config: ModelLoadConfig = {},
  renderer?: THREE.WebGLRenderer,
): Promise<LoadedModel> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const loader = new GLTFLoader();

  // Set up KTX2 texture loader if renderer is available
  if (renderer) {
    const ktx2Loader = new KTX2Loader()
      .setTranscoderPath('/basis/')
      .detectSupport(renderer);
    loader.setKTX2Loader(ktx2Loader);
  }

  return new Promise((resolve, reject) => {
    loader.load(
      cfg.modelPath,
      (gltf) => {
        const model = gltf.scene;
        model.name = 'loaded_avatar_model';

        // Apply scale and position
        model.scale.set(cfg.scale, cfg.scale, cfg.scale);
        model.position.y = cfg.positionY;

        // Rotate to face camera if needed (models often face -Z)
        // facecap.glb faces -Z, camera is at +Z, so already facing camera
        // brunette.glb (Ready Player Me) uses glTF +Z convention, already faces camera
        if (cfg.modelPath.includes('facecap')) {
          model.rotation.y = Math.PI; // rotate 180° to face camera (facecap faces -Z)
        }

        scene.add(model);

        // Find head mesh, eye groups, and extract morph targets
        let headMesh: THREE.Mesh | null = null;
        let eyeLeft: THREE.Object3D | null = null;
        let eyeRight: THREE.Object3D | null = null;
        let headGroup: THREE.Object3D | null = null;
        const morphMeshes: THREE.Mesh[] = [];
        const morphTargetNames: MorphTargetMap = new Map();

        model.traverse((child) => {
          const name = child.name.toLowerCase();

          // Find head mesh with morph targets
          if (child instanceof THREE.Mesh) {
            const geo = child.geometry as THREE.BufferGeometry;
            if (geo.morphAttributes?.position && geo.morphAttributes.position.length > 0) {
              morphMeshes.push(child);
              const names = extractMorphTargets(child);
              names.forEach((v, k) => morphTargetNames.set(k, v));
            }
          }

          // Find eye rotator groups (facecap.glb)
          if (name === 'grp_eyeleft' || name === 'lefteye') {
            eyeLeft = child.parent ?? child;
          }
          if (name === 'grp_eyeright' || name === 'righteye') {
            eyeRight = child.parent ?? child;
          }

          // Find eye bones by name (brunette.glb)
          if (name === 'lefteye' && child.parent) {
            eyeLeft = child.parent;
          }
          if (name === 'righteye' && child.parent) {
            eyeRight = child.parent;
          }

          // Head/neck bone for overall head rotation
          if (name === 'head' || name === 'neck') {
            headGroup = child;
          }
        });

        // Set headMesh to the first mesh named 'Wolf3D_Head' (case-insensitive),
        // falling back to the first morph mesh. This ensures the primary face
        // mesh is correctly identified for backward compatibility.
        headMesh =
          morphMeshes.find((m) => m.name.toLowerCase() === 'wolf3d_head') ?? morphMeshes[0] ?? null;

        resolve({
          group: model,
          scene,
          morphTargets: morphTargetNames,
          headMesh,
          morphMeshes,
          eyeLeft,
          eyeRight,
          headGroup,
        });
      },
      undefined,
      (error) => {
        reject(error);
      },
    );
  });
}

/**
 * Alternative name variants for RPM vs ARKit naming convention.
 * RPM uses 'mouthSmileLeft' / 'mouthSmileRight' (full word suffixes)
 * ARKit uses 'mouthSmile_L' / 'mouthSmile_R' (underscore+letter suffixes)
 */
function alternateMorphName(name: string): string | null {
  if (name.endsWith('_L')) return name.slice(0, -2) + 'Left';
  if (name.endsWith('_R')) return name.slice(0, -2) + 'Right';
  if (name.endsWith('Left')) return name.slice(0, -4) + '_L';
  if (name.endsWith('Right')) return name.slice(0, -5) + '_R';
  return null;
}

/**
 * Apply a morph target weight to the head mesh.
 * Tries the given name first, then falls back to the alternative naming convention (RPM vs ARKit).
 */
export function setMorphWeight(
  headMesh: THREE.Mesh | null,
  morphTargets: MorphTargetMap,
  name: string,
  weight: number,
): void {
  if (!headMesh) return;
  let idx = morphTargets.get(name);
  if (idx === undefined) {
    // Try alternative naming convention (e.g. mouthSmile_L ↔ mouthSmileLeft)
    const alt = alternateMorphName(name);
    if (alt !== null) {
      idx = morphTargets.get(alt);
    }
  }
  if (idx === undefined) return;
  if (!headMesh.morphTargetInfluences) return;
  headMesh.morphTargetInfluences[idx] = weight;
}

/**
 * RPM viseme morph names (Ready Player Me naming convention).
 * These provide direct viseme shapes rather than composing from ARKit blendshapes.
 */
const RPM_VISEME_MORPHS = [
  'viseme_sil', 'viseme_PP', 'viseme_FF', 'viseme_TH', 'viseme_DD',
  'viseme_kk', 'viseme_CH', 'viseme_SS', 'viseme_nn', 'viseme_RR',
  'viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U',
];

/**
 * Map our viseme ID (0-9) to the RPM viseme morph name.
 * RPM uses a different viseme scheme with more categories (15 vs 10).
 */
function rpmVisemeName(visemeId: number): string | null {
  const map: Record<number, string> = {
    0: 'viseme_sil',
    1: 'viseme_aa',   // AA → viseme_aa
    2: 'viseme_I',    // IH → viseme_I
    3: 'viseme_U',    // OU → viseme_U
    4: 'viseme_O',    // OH → viseme_O
    5: 'viseme_RR',   // RR → viseme_RR
    6: 'viseme_SS',   // SS → viseme_SS
    7: 'viseme_CH',   // CH → viseme_CH
    8: 'viseme_DD',   // TH → viseme_DD (tongue out approximation)
    9: 'viseme_FF',   // FF → viseme_FF
  };
  return map[visemeId] ?? null;
}

/**
 * Map viseme ID (0-9) to morph target weights for the facecap.glb model.
 * Also applies RPM viseme morphs if the model has them.
 * Iterates over all provided meshes (for models with multiple morph meshes like brunette.glb).
 */
export function applyVisemeMorphs(
  meshes: THREE.Mesh[],
  morphTargets: MorphTargetMap,
  visemeId: number,
  intensity: number,
): void {
  if (!meshes || meshes.length === 0) return;

  // Helper: apply morph weight to all meshes
  const applyAll = (name: string, weight: number) => {
    for (const mesh of meshes) {
      if (!mesh) continue;
      setMorphWeight(mesh, morphTargets, name, weight);
    }
  };

  // Reset all mouth-related morphs (ARKit names)
  const mouthMorphs = [
    'jawOpen', 'mouthOpen', 'mouthFunnel', 'mouthPucker', 'mouthSmile_L', 'mouthSmile_R',
    'mouthFrown_L', 'mouthFrown_R', 'mouthDimple_L', 'mouthDimple_R',
  ];
  for (const name of mouthMorphs) {
    applyAll(name, 0);
  }

  // Reset all RPM viseme morphs
  for (const rpmName of RPM_VISEME_MORPHS) {
    if (morphTargets.has(rpmName)) {
      applyAll(rpmName, 0);
    }
  }

  if (visemeId === 0 || intensity === 0) {
    applyAll('jawOpen', 0.05);
    // Set RPM silence morph
    const silName = rpmVisemeName(0);
    if (silName && morphTargets.has(silName)) {
      applyAll(silName, 1.0);
    }
    return;
  }

  const v = Math.min(intensity, 1.0);

  // Apply RPM viseme morph directly if available (more accurate for RPM models)
  const rpmViseme = rpmVisemeName(visemeId);
  if (rpmViseme && morphTargets.has(rpmViseme)) {
    applyAll(rpmViseme, v);
  }

  // Also apply ARKit-style morphs for compatibility with facecap.glb
  switch (visemeId) {
    case 1: // AA — mouth open wide
      applyAll('jawOpen', v);
      applyAll('mouthOpen', v);
      break;
    case 2: // IH — slight mouth opening
      applyAll('jawOpen', v * 0.4);
      applyAll('mouthFunnel', v * 0.3);
      break;
    case 3: // OU — rounded mouth
      applyAll('jawOpen', v * 0.3);
      applyAll('mouthFunnel', v * 0.7);
      applyAll('mouthPucker', v * 0.3);
      break;
    case 4: // OH — open rounded
      applyAll('jawOpen', v * 0.5);
      applyAll('mouthOpen', v * 0.5);
      applyAll('mouthFunnel', v * 0.5);
      break;
    case 5: // RR — slight smile
      applyAll('jawOpen', v * 0.2);
      applyAll('mouthSmile_L', v * 0.4);
      applyAll('mouthSmile_R', v * 0.4);
      break;
    case 6: // SS — teeth together
      applyAll('jawOpen', v * 0.1);
      break;
    case 7: // CH — open mouth smile
      applyAll('jawOpen', v * 0.5);
      applyAll('mouthOpen', v * 0.5);
      applyAll('mouthSmile_L', v * 0.3);
      applyAll('mouthSmile_R', v * 0.3);
      break;
    case 8: // TH — tongue out
      applyAll('jawOpen', v * 0.3);
      break;
    case 9: // FF — lower lip up
      applyAll('jawOpen', v * 0.2);
      break;
    default:
      applyAll('jawOpen', v * 0.3);
      break;
  }
}

/**
 * Apply blink morph to all meshes with morph targets.
 */
export function applyBlinkMorph(
  meshes: THREE.Mesh[],
  morphTargets: MorphTargetMap,
  closed: boolean,
): void {
  if (!meshes || meshes.length === 0) return;
  const w = closed ? 1.0 : 0.0;
  for (const mesh of meshes) {
    if (!mesh) continue;
    setMorphWeight(mesh, morphTargets, 'eyeBlinkLeft', w);
    setMorphWeight(mesh, morphTargets, 'eyeBlinkRight', w);
  }
}
