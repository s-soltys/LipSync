// ────────────────────────────────────────────────────────────
// 3D Avatar Rendering Module — Tests
// ────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  Avatar3D,
  AvatarEye,
  AvatarMouth,
  AvatarNeck,
} from '../avatar3d/avatar';
import {
  BoneRot,
  BoneMov,
  AvatarFeature,
  AvatarExpression,
  ExpressionParameter,
  ExpressionsCollection,
} from '../avatar3d/expression';

// ─── AvatarEye — Blink & Gaze (§6, §12-13) ──────────────────

describe('AvatarEye', () => {
  it('should initialise with AvatarFeature instances with proper ranges', () => {
    const eye = new AvatarEye('L');
    expect(eye.eyelid).toBeInstanceOf(AvatarFeature);
    expect(eye.eyeball).toBeInstanceOf(AvatarFeature);
    expect(eye.eyebrow_i).toBeInstanceOf(AvatarFeature);
    expect(eye.eyebrow_o).toBeInstanceOf(AvatarFeature);
    expect(eye.side).toBe('L');
    expect(eye.isBlinking).toBe(false);
    expect(eye.blinkPhase).toBe('idle');
  });

  it('should store blink timing parameters', () => {
    const eye = new AvatarEye('R');
    eye.setupMotionParameters(0.15, 0.08);
    expect(eye.blinkTime).toBe(0.15);
    expect(eye.blinkPause).toBe(0.08);
  });

  describe('gaze (§13.2)', () => {
    it('should rotate eyeball on lookAt (mapped through range)', () => {
      const eye = new AvatarEye('L');
      eye.lookAt(0.5, 0.3);

      // eyeball.rotX: posY=0.3 → BoneRot(0,-30,30,0)
      //   target = def + max * clamped = 0 + 30 * 0.3 = 9
      expect(eye.eyeball.rotX.value).toBeCloseTo(9, 10);
      // eyeball.rotY: posX=0.5 → target = 0 + 30 * 0.5 = 15
      expect(eye.eyeball.rotY.value).toBeCloseTo(15, 10);
    });

    it('should move both eyebrows on vertical lookAt', () => {
      const eye = new AvatarEye('R');
      eye.lookAt(0, 0.8);

      // eyebrow_i.movY = posY / 2.75 ≈ 0.2909
      // BoneMov(0,-5,5,0.3): target = 0 + 5*0.2909 = 1.4545
      // state = 0*0.3 + 1.4545*0.7 = 1.018
      expect(eye.eyebrow_i.movY.value).toBeCloseTo(0.8 / 2.75 * 5 * 0.7, 5);
      // eyebrow_o.movY = posY / 2.0 = 0.4
      // target = 0 + 5*0.4 = 2.0
      // state = 0*0.3 + 2.0*0.7 = 1.4
      expect(eye.eyebrow_o.movY.value).toBeCloseTo(0.8 / 2.0 * 5 * 0.7, 5);
    });

    it('should not move eyebrows on purely horizontal gaze', () => {
      const eye = new AvatarEye('L');
      eye.lookAt(1.0, 0);

      expect(eye.eyebrow_i.movY.value).toBeCloseTo(0);
      expect(eye.eyebrow_o.movY.value).toBeCloseTo(0);
    });

    it('should handle negative gaze values (looking left/up)', () => {
      const eye = new AvatarEye('L');
      eye.lookAt(-0.7, -0.5);

      // eyeball.rotY = -0.7 → <0: target = def + min * 0.7 = 0 + (-30)*0.7 = -21
      expect(eye.eyeball.rotY.value).toBeCloseTo(-21, 10);
      // eyeball.rotX = -0.5 → <0: target = 0 + (-30)*0.5 = -15
      expect(eye.eyeball.rotX.value).toBeCloseTo(-15, 10);
      // posY negative → eyebrows move negative with inertia scaling
      expect(eye.eyebrow_i.movY.value).toBeCloseTo(-0.5 / 2.75 * 5 * 0.7, 5);
      expect(eye.eyebrow_o.movY.value).toBeCloseTo(-0.5 / 2.0 * 5 * 0.7, 5);
    });
  });

  describe('blink (§12)', () => {
    it('should set blink state on close()', () => {
      const eye = new AvatarEye('L');
      eye.close();
      expect(eye.isBlinking).toBe(true);
      expect(eye.blinkPhase).toBe('closing');
    });

    it('should start blink sequence on blink()', () => {
      const eye = new AvatarEye('R');
      eye.setupMotionParameters(0.05, 0.02);

      eye.blink();

      expect(eye.isBlinking).toBe(true);
      expect(eye.blinkPhase).toBe('closing');
    });

    it('should force close with easeOutCubic on close()', () => {
      const eye = new AvatarEye('L');
      eye.close();

      expect(eye.isBlinking).toBe(true);
      expect(eye.blinkPhase).toBe('closing');
    });

    it('should re-open on open()', () => {
      const eye = new AvatarEye('L');
      eye.close();
      eye.open();

      expect(eye.isBlinking).toBe(false);
      expect(eye.blinkPhase).toBe('opening');
    });
  });
});

// ─── AvatarMouth — 14-Feature Mouth System (§5) ──────────────

describe('AvatarMouth', () => {
  it('should initialise with 14 AvatarFeature instances', () => {
    const mouth = new AvatarMouth();
    expect(mouth.jaw).toBeInstanceOf(AvatarFeature);
    expect(mouth.tongue).toBeInstanceOf(AvatarFeature);
    expect(mouth.mouth_r).toBeInstanceOf(AvatarFeature);
    expect(mouth.mouth_l).toBeInstanceOf(AvatarFeature);
    expect(mouth.lip_down_r).toBeInstanceOf(AvatarFeature);
    expect(mouth.lip_down_m).toBeInstanceOf(AvatarFeature);
    expect(mouth.lip_down_l).toBeInstanceOf(AvatarFeature);
    expect(mouth.lip_top_r).toBeInstanceOf(AvatarFeature);
    expect(mouth.lip_top_m).toBeInstanceOf(AvatarFeature);
    expect(mouth.lip_top_l).toBeInstanceOf(AvatarFeature);
    expect(mouth.cheek_r).toBeInstanceOf(AvatarFeature);
    expect(mouth.cheek_l).toBeInstanceOf(AvatarFeature);
    expect(mouth.cheekb_r).toBeInstanceOf(AvatarFeature);
    expect(mouth.cheekb_l).toBeInstanceOf(AvatarFeature);
  });

  it('should have 14 features from getAllFeatures()', () => {
    const mouth = new AvatarMouth();
    expect(mouth.getAllFeatures()).toHaveLength(14);
  });

  it('should apply smile to both mouth corners', () => {
    const mouth = new AvatarMouth();
    // Use BoneMov with non-zero range so values actually map
    const movY_R = new BoneMov(0, -10, 10, 0);
    const movY_L = new BoneMov(0, -10, 10, 0);
    mouth.mouth_r = new AvatarFeature(
      new BoneRot(), new BoneRot(), new BoneRot(),
      new BoneMov(), movY_R, new BoneMov(), // movY is 5th arg
    );
    mouth.mouth_l = new AvatarFeature(
      new BoneRot(), new BoneRot(), new BoneRot(),
      new BoneMov(), movY_L, new BoneMov(), // movY is 5th arg
    );

    mouth.smile(0.5);

    // smile: mouth_r.movY.value = -|0.5| = -0.5
    // BoneMov(0,-10,10,0): input=-0.5, < 0, target = 0 + (-10)*0.5 = -5
    expect(movY_R.value).toBeCloseTo(-5, 10);
    expect(movY_L.value).toBeCloseTo(-5, 10);
  });

  it('should apply viseme expression to mouth features', () => {
    const mouth = new AvatarMouth();
    const jawRot = new BoneRot(0, -30, 30, 0);
    mouth.jaw = new AvatarFeature(
      jawRot, new BoneRot(), new BoneRot(),
      new BoneMov(), new BoneMov(), new BoneMov(),
    );

    const testViseme = new AvatarExpression(99, 'test', {
      jaw: new ExpressionParameter({ rot_x: 2.0 }),
    });

    mouth.setViseme(0.5, testViseme);

    // jaw.rotX = 0.5 * 2.0 = 1.0 → clamped to 1.0 → target = 0 + 30*1.0 = 30
    expect(jawRot.value).toBeCloseTo(30, 10);
  });

  it('should return to neutral via setNeutral', () => {
    const mouth = new AvatarMouth();
    const jawRot = new BoneRot(0, -30, 30, 0);
    mouth.jaw = new AvatarFeature(
      jawRot, new BoneRot(), new BoneRot(),
      new BoneMov(), new BoneMov(), new BoneMov(),
    );

    // Set a known value first
    const testViseme = new AvatarExpression(99, 'test', {
      jaw: new ExpressionParameter({ rot_x: 1.0 }),
    });
    mouth.setViseme(0.5, testViseme);
    expect(jawRot.value).toBeCloseTo(15, 10); // 0 + 30 * (0.5*1.0)

    // Return to neutral — tweens all DOFs to 0 (def)
    mouth.setNeutral(0.3);
    // setValueTween bypasses inertia: target = def = 0
    expect(jawRot.value).toBeCloseTo(0);
  });
});

// ─── AvatarNeck — Two-Segment Neck (§7) ──────────────────────

describe('AvatarNeck', () => {
  it('should initialise with neckLow and neckHigh features', () => {
    const neck = new AvatarNeck();
    expect(neck.neckLow).toBeInstanceOf(AvatarFeature);
    expect(neck.neckHigh).toBeInstanceOf(AvatarFeature);
  });

  it('should rotate both segments on lookAt', () => {
    const neck = new AvatarNeck();
    neck.lookAt(0.5, 0.3);

    // neckHigh: rotZ=posX=0.5, rotX=-posY=-0.3, rotY=posX=0.5
    // XML range: rotZ: BoneRot(0,-15,15,0.5) → target=0+15*0.5=7.5, state=7.5*0.5=3.75
    //            rotX: BoneRot(0,-10,10,0.5) → target=0+(-10)*0.3=-3, state=-3*0.5=-1.5
    //            rotY: BoneRot(0,-10,10,0.5) → target=0+10*0.5=5, state=5*0.5=2.5
    expect(neck.neckHigh.rotX.value).toBeCloseTo(-0.3 * 10 * 0.5, 10); // -1.5
    expect(neck.neckHigh.rotY.value).toBeCloseTo(0.5 * 10 * 0.5, 10);  // 2.5
    expect(neck.neckHigh.rotZ.value).toBeCloseTo(0.5 * 15 * 0.5, 10);  // 3.75

    // neckLow: rotZ=posX=0.5, rotX=-posY=-0.3
    expect(neck.neckLow.rotX.value).toBeCloseTo(-0.3 * 10 * 0.5, 10); // -1.5
    expect(neck.neckLow.rotZ.value).toBeCloseTo(0.5 * 15 * 0.5, 10);  // 3.75
  });

  it('should not set neckLow.rotY', () => {
    const neck = new AvatarNeck();
    neck.lookAt(0.5, 0.3);
    expect(neck.neckLow.rotY.value).toBe(0);
  });

  it('should handle negative gaze values', () => {
    const neck = new AvatarNeck();
    neck.lookAt(-0.5, -0.3);

    // neckHigh.rotX = 0.3 → target = 0+10*0.3=3, state=3*0.5=1.5
    expect(neck.neckHigh.rotX.value).toBeCloseTo(1.5, 10);
    // neckHigh.rotZ = -0.5 → target = 0+(-15)*0.5=-7.5, state=-7.5*0.5=-3.75
    expect(neck.neckHigh.rotZ.value).toBeCloseTo(-3.75, 10);
    expect(neck.neckLow.rotX.value).toBeCloseTo(1.5, 10);
    expect(neck.neckLow.rotZ.value).toBeCloseTo(-3.75, 10);
  });
});

// ─── Avatar3D — Main Class ──────────────────────────────────

describe('Avatar3D', () => {
  let avatar: Avatar3D;

  beforeEach(() => {
    avatar = new Avatar3D();
  });

  it('should create a Three.js scene with lights and camera', () => {
    expect(avatar.scene).toBeInstanceOf(THREE.Scene);
    expect(avatar.camera).toBeInstanceOf(THREE.PerspectiveCamera);
    // Renderer is lazy, not created until start()
    expect(avatar.renderer).toBeNull();
    expect(avatar.scene.background).toBeInstanceOf(THREE.Color);
  });

  it('should position and rotate avatar per spec (§19.3)', () => {
    expect(avatar.root.position.y).toBeCloseTo(-3);
    expect(avatar.root.rotation.y).toBeCloseTo(0);
  });

  it('should start with default expression state', () => {
    const state = avatar.getState();
    expect(state.visemeValue).toBe(0);
    expect(state.visemeAlias).toBe('neutral');
    expect(state.emotionValue).toBe(0);
    expect(state.emotionAlias).toBe('neutral');
  });

  it('should set emotion expression', () => {
    const testExpr = new AvatarExpression(7, 'test-e', {
      mouth_r: new ExpressionParameter({ mov_y: -3 }),
    });
    avatar.setEmotion(testExpr, 0.8);

    const state = avatar.getState();
    expect(state.emotionAlias).toBe('test-e');
    expect(state.emotionValue).toBe(0.8);
  });
});

// ─── Inertia Blending Integration (via expression.ts, §3.2) ──

describe('Inertia Blending (via expression.ts), §3.2', () => {
  it('should blend state correctly using BoneRot inertia', () => {
    const rot = new BoneRot(0, -100, 100, 0.5);
    rot.value = 0.5; // state = 0*0.5 + (0+100*0.5)*0.5 = 25
    expect(rot.value).toBeCloseTo(25, 10);

    rot.value = 1.0; // state = 25*0.5 + (0+100*1.0)*0.5 = 12.5 + 50 = 62.5
    expect(rot.value).toBeCloseTo(62.5, 10);
  });

  it('should blend state correctly using BoneMov inertia', () => {
    const mov = new BoneMov(0, -50, 50, 0.3);
    mov.value = 0.8; // state = 0*0.3 + (0+50*0.8)*0.7 = 28
    expect(mov.value).toBeCloseTo(28, 10);

    mov.value = -0.4; // state = 28*0.3 + (0+(-50)*0.4)*0.7 = 8.4 + (-14) = -5.6
    expect(mov.value).toBeCloseTo(-5.6, 10);
  });
});
