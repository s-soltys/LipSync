// ────────────────────────────────────────────────────────────
// 3D Avatar Rendering Module — Tests
// ────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  Avatar3D,
} from '../avatar3d/avatar';
import {
  BoneRot,
  BoneMov,
  AvatarExpression,
  ExpressionParameter,
} from '../avatar3d/expression';

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
  });

  it('should set viseme expression', () => {
    const testExpr = new AvatarExpression(5, 'test-v', {
      jaw: new ExpressionParameter({ rot_x: 1.0 }),
    });
    avatar.setViseme(testExpr, 0.7);

    const state = avatar.getState();
    expect(state.visemeAlias).toBe('test-v');
    expect(state.visemeValue).toBe(0.7);
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
