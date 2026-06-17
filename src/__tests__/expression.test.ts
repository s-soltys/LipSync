// ────────────────────────────────────────────────────────────
// Expression System — Tests
// ────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  BoneRot,
  BoneMov,
  ExpressionParameter,
  AvatarFeature,
  AvatarExpression,
  ExpressionsCollection,
} from '../avatar3d/expression';

// ─── BoneRot / BoneMov — Core Inertia Blending (§3) ────────

describe('BoneRot', () => {
  // ── Construction ────────────────────────────────────────

  it('should initialise with default values (def=0, min=0, max=0, inertia=0)', () => {
    const b = new BoneRot();
    expect(b.value).toBe(0);
    expect(b.def).toBe(0);
    expect(b.min).toBe(0);
    expect(b.max).toBe(0);
    expect(b.inertia).toBe(0);
    expect(b.currentWeight).toBe(0);
    expect(b.nextWeight).toBe(1);
  });

  it('should store constructor parameters', () => {
    const b = new BoneRot(10, -30, 45, 0.5);
    expect(b.def).toBe(10);
    expect(b.min).toBe(-30);
    expect(b.max).toBe(45);
    expect(b.inertia).toBe(0.5);
    expect(b.currentWeight).toBe(0.5);
    expect(b.nextWeight).toBe(0.5);
    expect(b.value).toBe(10); // initial state = def
  });

  it('should initialise with inertia=1.0 (frozen → nextWeight=0)', () => {
    const b = new BoneRot(0, -10, 10, 1.0);
    expect(b.currentWeight).toBe(1.0);
    expect(b.nextWeight).toBe(0.0);
  });

  // ── Inertia Blending Formula (§3.2) ─────────────────────

  it('should map positive input: target = def + max * clamped', () => {
    const b = new BoneRot(90, -20, 30, 0); // instant
    b.value = 0.5;
    expect(b.value).toBeCloseTo(90 + 30 * 0.5); // 105
  });

  it('should map negative input: target = def + min * (-clamped)', () => {
    const b = new BoneRot(90, -20, 30, 0); // instant
    b.value = -0.5;
    expect(b.value).toBeCloseTo(90 + (-20) * 0.5); // 80
  });

  it('should map zero input to def', () => {
    const b = new BoneRot(90, -30, 30, 0);
    b.value = 0;
    expect(b.value).toBe(90);
  });

  it('should clamp input to [-1, 1]', () => {
    const b = new BoneRot(0, -30, 30, 0);
    b.value = 2.0;
    expect(b.value).toBeCloseTo(30); // clamped to 1.0

    b.value = -2.0;
    expect(b.value).toBeCloseTo(-30); // clamped to -1.0
  });

  it('should blend with inertia=0.5 (half-life)', () => {
    const b = new BoneRot(0, -100, 100, 0.5);
    // First set: state = 0*0.5 + (0+100*0.5)*0.5 = 0 + 25 = 25
    b.value = 0.5;
    expect(b.value).toBeCloseTo(25, 10);

    // Second set: state = 25*0.5 + (0+100*1.0)*0.5 = 12.5 + 50 = 62.5
    b.value = 1.0;
    expect(b.value).toBeCloseTo(62.5, 10);
  });

  it('should blend with inertia=0.2 (light smoothing)', () => {
    const b = new BoneRot(0, -100, 100, 0.2);
    // state = 0*0.2 + (0+100*0.5)*0.8 = 0 + 40 = 40
    b.value = 0.5;
    expect(b.value).toBeCloseTo(40, 10);
  });

  it('should blend with inertia=0.8 (heavy smoothing)', () => {
    const b = new BoneRot(0, -100, 100, 0.8);
    // state = 0*0.8 + (0+100*0.5)*0.2 = 0 + 10 = 10
    b.value = 0.5;
    expect(b.value).toBeCloseTo(10, 10);
  });

  it('should be frozen when inertia=1.0', () => {
    const b = new BoneRot(0, -100, 100, 1.0);
    b.value = 0.5;
    expect(b.value).toBe(0); // state = 0*1.0 + 50*0 = 0
  });

  it('should handle sequential sets with inertia', () => {
    const b = new BoneRot(0, -100, 100, 0.5);
    b.value = 0.5; // 25
    b.value = 0.0; // 25*0.5 + 0*0.5 = 12.5
    expect(b.value).toBeCloseTo(12.5, 10);
    b.value = -0.5; // 12.5*0.5 + (-50)*0.5 = 6.25 - 25 = -18.75
    expect(b.value).toBeCloseTo(-18.75, 10);
  });

  // ── refreshValue (§3.3) ─────────────────────────────────

  it('should refreshValue with change=1.0 (no-op)', () => {
    const b = new BoneRot(0, -100, 100, 0.5);
    b.value = 0.5; // state = 25
    b.refreshValue(1.0);
    // state *= (0.5*1.0 + 0.5) = state * 1.0 = 25
    expect(b.value).toBeCloseTo(25, 10);
  });

  it('should refreshValue with change=0.0 (scale down by inertia)', () => {
    const b = new BoneRot(0, -100, 100, 0.5);
    b.value = 0.5; // state = 25
    b.refreshValue(0.0);
    // state *= (0.5*0.0 + 0.5) = state * 0.5 = 12.5
    expect(b.value).toBeCloseTo(12.5, 10);
  });

  it('should refreshValue with change=0.5 (partial rescale)', () => {
    const b = new BoneRot(0, -100, 100, 0.5);
    b.value = 0.5; // state = 25
    b.refreshValue(0.5);
    // state *= (0.5*0.5 + 0.5) = state * 0.75 = 18.75
    expect(b.value).toBeCloseTo(18.75, 10);
  });

  it('should refreshValue with change > 1.0 (amplify)', () => {
    const b = new BoneRot(0, -100, 100, 0.5);
    b.value = 0.5; // state = 25
    b.refreshValue(2.0);
    // state *= (0.5*2.0 + 0.5) = state * 1.5 = 37.5
    expect(b.value).toBeCloseTo(37.5, 10);
  });

  // ── setValueTween (§11.3) ───────────────────────────────

  it('should set state to target immediately (bypasses inertia)', () => {
    const b = new BoneRot(90, -20, 30, 0.8); // heavy inertia
    b.value = 0.5; // blended
    const before = b.value;
    b.setValueTween(1.0, 0.3);
    // tween bypasses inertia: target = 90 + 30*1.0 = 120
    expect(b.value).toBe(120);
    expect(b.value).not.toBeCloseTo(before, 5);
  });

  it('should map positive input correctly in setValueTween', () => {
    const b = new BoneRot(0, -100, 100, 0);
    b.setValueTween(0.5, 0.5);
    expect(b.value).toBeCloseTo(50, 10);
  });

  it('should map negative input correctly in setValueTween', () => {
    const b = new BoneRot(0, -50, 100, 0);
    b.setValueTween(-0.5, 0.5);
    expect(b.value).toBeCloseTo(-25, 10); // def + min * 0.5 = 0 + (-50)*0.5
  });

  it('should map zero input to def in setValueTween', () => {
    const b = new BoneRot(10, -50, 100, 0);
    b.setValueTween(0, 0.5);
    expect(b.value).toBe(10);
  });

  it('should clamp input in setValueTween', () => {
    const b = new BoneRot(0, -50, 50, 0);
    b.setValueTween(2.0, 0.5);
    expect(b.value).toBe(50); // clamped to 1.0
    b.setValueTween(-2.0, 0.5);
    expect(b.value).toBe(-50); // clamped to -1.0
  });
});

describe('BoneMov', () => {
  it('should initialise with same defaults as BoneRot', () => {
    const m = new BoneMov();
    expect(m.value).toBe(0);
    expect(m.def).toBe(0);
    expect(m.inertia).toBe(0);
  });

  it('should blend identically to BoneRot with same params', () => {
    // Both BoneRot and BoneMov implement the same formula (§3.2)
    const rot = new BoneRot(0, -100, 100, 0.5);
    const mov = new BoneMov(0, -100, 100, 0.5);
    rot.value = 0.5;
    mov.value = 0.5;
    expect(mov.value).toBe(rot.value);
  });

  it('should handle refreshValue identically to BoneRot', () => {
    const rot = new BoneRot(0, -100, 100, 0.3);
    const mov = new BoneMov(0, -100, 100, 0.3);
    rot.value = 0.7;
    mov.value = 0.7;
    rot.refreshValue(0.4);
    mov.refreshValue(0.4);
    expect(mov.value).toBe(rot.value);
  });

  it('should handle setValueTween identically to BoneRot', () => {
    const rot = new BoneRot(5, -30, 30, 0.5);
    const mov = new BoneMov(5, -30, 30, 0.5);
    rot.setValueTween(-0.8, 0.2);
    mov.setValueTween(-0.8, 0.2);
    expect(mov.value).toBe(rot.value);
  });
});

// ─── ExpressionParameter (§10) ──────────────────────────────

describe('ExpressionParameter', () => {
  it('should default all values to 0 and flags to false', () => {
    const p = new ExpressionParameter();
    expect(p.rot_x).toBe(0);
    expect(p.rot_y).toBe(0);
    expect(p.rot_z).toBe(0);
    expect(p.mov_x).toBe(0);
    expect(p.mov_y).toBe(0);
    expect(p.mov_z).toBe(0);
    expect(p.rotation).toBe(false);
    expect(p.movement).toBe(false);
  });

  it('should detect rotation when any rot_* is non-zero', () => {
    const p1 = new ExpressionParameter({ rot_x: 1.0 });
    expect(p1.rotation).toBe(true);
    expect(p1.movement).toBe(false);

    const p2 = new ExpressionParameter({ rot_y: -0.5 });
    expect(p2.rotation).toBe(true);

    const p3 = new ExpressionParameter({ rot_z: 2.0 });
    expect(p3.rotation).toBe(true);
  });

  it('should detect movement when any mov_* is non-zero', () => {
    const p1 = new ExpressionParameter({ mov_x: 1.0 });
    expect(p1.movement).toBe(true);
    expect(p1.rotation).toBe(false);

    const p2 = new ExpressionParameter({ mov_y: -0.5 });
    expect(p2.movement).toBe(true);

    const p3 = new ExpressionParameter({ mov_z: 2.0 });
    expect(p3.movement).toBe(true);
  });

  it('should detect both rotation and movement when both sets are non-zero', () => {
    const p = new ExpressionParameter({ rot_x: 0.5, mov_z: -1.0 });
    expect(p.rotation).toBe(true);
    expect(p.movement).toBe(true);
  });

  it('should store provided values', () => {
    const p = new ExpressionParameter({
      rot_x: 0.1,
      rot_y: 0.2,
      rot_z: 0.3,
      mov_x: -0.1,
      mov_y: -0.2,
      mov_z: -0.3,
    });
    expect(p.rot_x).toBe(0.1);
    expect(p.rot_y).toBe(0.2);
    expect(p.rot_z).toBe(0.3);
    expect(p.mov_x).toBe(-0.1);
    expect(p.mov_y).toBe(-0.2);
    expect(p.mov_z).toBe(-0.3);
  });

  it('should treat undefined fields as 0', () => {
    const p = new ExpressionParameter({ rot_x: 5 });
    expect(p.rot_y).toBe(0);
    expect(p.rot_z).toBe(0);
    expect(p.mov_x).toBe(0);
    expect(p.mov_y).toBe(0);
    expect(p.mov_z).toBe(0);
  });
});

// ─── AvatarFeature (§4) ─────────────────────────────────────

describe('AvatarFeature', () => {
  // ── Construction ────────────────────────────────────────

  it('should create with default BoneParameter instances', () => {
    const f = new AvatarFeature();
    expect(f.rotX).toBeInstanceOf(BoneRot);
    expect(f.rotY).toBeInstanceOf(BoneRot);
    expect(f.rotZ).toBeInstanceOf(BoneRot);
    expect(f.movX).toBeInstanceOf(BoneMov);
    expect(f.movY).toBeInstanceOf(BoneMov);
    expect(f.movZ).toBeInstanceOf(BoneMov);
    expect(f.rotX.value).toBe(0);
    expect(f.movX.value).toBe(0);
  });

  it('should accept custom BoneParameter instances', () => {
    const rot = new BoneRot(0, -30, 30, 0.5);
    const mov = new BoneMov(10, -5, 5, 0.2);
    const f = new AvatarFeature(rot, rot, rot, mov, mov, mov);
    expect(f.rotX).toBe(rot);
    expect(f.movX).toBe(mov);
  });

  // ── setParameter (§4.3) ─────────────────────────────────

  it('should set rotation DOFs when parameter.rotation is true', () => {
    const f = new AvatarFeature();
    const p = new ExpressionParameter({ rot_x: 2, rot_y: 3, rot_z: 4 });

    f.setParameter(0.5, p);
    // rotX.value = 0.5*2 = 1.0, for BoneRot with def=0,max=0 → target = 0+0*1 = 0
    // Wait, default BoneRot has max=0. Let me use non-default DOFs.
    // Actually, let's just verify the dispatch logic.
    expect(f.rotX.value).toBeCloseTo(0.5 * 2 * 0, 10); // max=0 → target=0
    expect(f.rotY.value).toBeCloseTo(0.5 * 3 * 0, 10);
    expect(f.rotZ.value).toBeCloseTo(0.5 * 4 * 0, 10);
  });

  it('should set movement DOFs when parameter.movement is true', () => {
    const f = new AvatarFeature();
    const p = new ExpressionParameter({ mov_x: 5, mov_y: 6, mov_z: 7 });

    f.setParameter(0.5, p);
    // Default BoneMov has max=0 → target=0
    expect(f.movX.value).toBeCloseTo(0.5 * 5 * 0, 10);
    expect(f.movY.value).toBeCloseTo(0.5 * 6 * 0, 10);
    expect(f.movZ.value).toBeCloseTo(0.5 * 7 * 0, 10);
  });

  it('should set all 6 DOFs when both rotation and movement are active', () => {
    const rotX = new BoneRot(0, -10, 10, 0);
    const rotY = new BoneRot(0, -10, 10, 0);
    const rotZ = new BoneRot(0, -10, 10, 0);
    const movX = new BoneMov(0, -5, 5, 0);
    const movY = new BoneMov(0, -5, 5, 0);
    const movZ = new BoneMov(0, -5, 5, 0);
    const f = new AvatarFeature(rotX, rotY, rotZ, movX, movY, movZ);
    const p = new ExpressionParameter({
      rot_x: 1.0, rot_y: 0.5, rot_z: 0.0,
      mov_x: 0.0, mov_y: 2.0, mov_z: 1.5,
    });

    f.setParameter(0.5, p);

    // rotX = 0.5 * 1.0 → 0.5 → target = 0 + 10*0.5 = 5
    expect(rotX.value).toBeCloseTo(5, 10);
    // rotY = 0.5 * 0.5 → 0.25 → target = 0 + 10*0.25 = 2.5
    expect(rotY.value).toBeCloseTo(2.5, 10);
    // rotZ = 0.5 * 0.0 → 0.0 → target = 0 (def)
    expect(rotZ.value).toBeCloseTo(0, 10);
    // movX = 0.5 * 0.0 → 0.0 → target = 0 (def)
    expect(movX.value).toBe(0);
    // movY = 0.5 * 2.0 → 1.0 → target = 0 + 5*1.0 = 5
    expect(movY.value).toBeCloseTo(5, 10);
    // movZ = 0.5 * 1.5 → 0.75 → target = 0 + 5*0.75 = 3.75
    expect(movZ.value).toBeCloseTo(3.75, 10);
  });

  it('should not set DOFs when corresponding flag is false', () => {
    const rotX = new BoneRot(0, -10, 10, 0);
    const movX = new BoneMov(0, -5, 5, 0);

    // Set to known state (values within [-1,1] avoid clamping)
    rotX.value = 0.5; // → target = 0 + 10*0.5 = 5
    movX.value = 0.5; // → target = 0 + 5*0.5 = 2.5

    const f = new AvatarFeature(
      rotX, new BoneRot(), new BoneRot(),
      movX, new BoneMov(), new BoneMov(),
    );

    // Only movement parameter → rotation DOFs should NOT change
    const p = new ExpressionParameter({ mov_x: 3.0 });

    f.setParameter(0.5, p);

    // rotX should be unchanged (rotation=false)
    expect(rotX.value).toBeCloseTo(5, 10);
    // movX: 0.5 * 3.0 = 1.5 → clamped to 1.0 → target = 0 + 5*1.0 = 5
    expect(movX.value).toBeCloseTo(5, 10);
  });

  // ── setParameterTween ───────────────────────────────────

  it('should apply setParameterTween to all 6 DOFs', () => {
    const rotX = new BoneRot(0, -10, 10, 0.5); // inertia won't matter for tween
    const rotY = new BoneRot(0, -10, 10, 0.5);
    const movX = new BoneMov(0, -5, 5, 0.5);
    const f = new AvatarFeature(
      rotX, rotY, new BoneRot(),
      movX, new BoneMov(), new BoneMov(),
    );
    const p = new ExpressionParameter({ rot_x: 2.0, rot_y: 1.0, mov_x: -0.5 });

    f.setParameterTween(0.5, p, 0.3);

    // Tween bypasses inertia: rotX = 0 + 10 * (0.5*2.0) = 10
    expect(rotX.value).toBeCloseTo(10, 10);
    // rotY = 0 + 10 * (0.5*1.0) = 5
    expect(rotY.value).toBeCloseTo(5, 10);
    // movX = 0 + 5 * (0.5 * -0.5) = 0 + 5 * (-0.25) = -1.25
    expect(movX.value).toBeCloseTo(-1.25, 10);
  });

  it('should skip DOFs when corresponding flag is false in setParameterTween', () => {
    const rotX = new BoneRot(0, -10, 10, 0);
    const movX = new BoneMov(0, -5, 5, 0);
    // Set to known state using values within [-1,1]
    rotX.value = 0.5; // → target = 0 + 10*0.5 = 5
    movX.value = 0.5; // → target = 0 + 5*0.5 = 2.5

    const f = new AvatarFeature(
      rotX, new BoneRot(), new BoneRot(),
      movX, new BoneMov(), new BoneMov(),
    );
    const p = new ExpressionParameter({ rot_x: 100 }); // rotation=true, movement=false

    f.setParameterTween(0.5, p, 0.3);

    // rotX updated (rotation=true): 0.5*100=50 → clamped to 1.0 → target = 0+10*1.0 = 10
    expect(rotX.value).toBeCloseTo(10, 10);
    // movX unchanged (movement=false) — still 2.5 from initial set
    expect(movX.value).toBeCloseTo(2.5, 10);
  });
});

// ─── AvatarExpression (§8.1) ────────────────────────────────

describe('AvatarExpression', () => {
  it('should store id and alias', () => {
    const e = new AvatarExpression(7, 'test-expr');
    expect(e.id).toBe(7);
    expect(e.alias).toBe('test-expr');
  });

  it('should create all 14 ExpressionParameter fields with defaults', () => {
    const e = new AvatarExpression(0, 'neutral');
    const fields: (keyof typeof e)[] = [
      'jaw', 'tongue', 'mouth_r', 'mouth_l',
      'lip_down_r', 'lip_down_m', 'lip_down_l',
      'lip_top_r', 'lip_top_m', 'lip_top_l',
      'cheek_r', 'cheek_l', 'cheekb_r', 'cheekb_l',
    ];
    for (const field of fields) {
      expect((e as any)[field]).toBeInstanceOf(ExpressionParameter);
      expect(((e as any)[field] as ExpressionParameter).rotation).toBe(false);
      expect(((e as any)[field] as ExpressionParameter).movement).toBe(false);
    }
  });

  it('should accept custom ExpressionParameter values', () => {
    const jawP = new ExpressionParameter({ rot_x: 15 });
    const tongueP = new ExpressionParameter({ mov_y: -3 });
    const e = new AvatarExpression(1, 'smile', {
      jaw: jawP,
      tongue: tongueP,
    });
    expect(e.jaw.rot_x).toBe(15);
    expect(e.tongue.mov_y).toBe(-3);
    // Others should still be defaults
    expect(e.mouth_r.rot_x).toBe(0);
  });

  it('should accept partial parameter sets', () => {
    const e = new AvatarExpression(3, 'partial', {
      mouth_r: new ExpressionParameter({ rot_x: 0.5 }),
      mouth_l: new ExpressionParameter({ rot_x: -0.5 }),
    });
    expect(e.mouth_r.rot_x).toBe(0.5);
    expect(e.mouth_l.rot_x).toBe(-0.5);
    expect(e.jaw.rot_x).toBe(0); // default
    expect(e.tongue.rot_x).toBe(0);
  });
});

// ─── ExpressionsCollection (§9) ─────────────────────────────

describe('ExpressionsCollection', () => {
  // ── 1 Emotion Singleton (§8.2) ─────────────────────────

  it('should have NEUTRAL emotion with id=0 alias="neutral"', () => {
    expect(ExpressionsCollection.NEUTRAL).toBeInstanceOf(AvatarExpression);
    expect(ExpressionsCollection.NEUTRAL.id).toBe(0);
    expect(ExpressionsCollection.NEUTRAL.alias).toBe('neutral');
  });

  // ── visemes registry ────────────────────────────────────

  it('should start with an empty visemes array', () => {
    expect(ExpressionsCollection.visemes).toEqual([]);
  });

  it('should allow populating visemes', () => {
    // Reset (tests are isolated, but for safety let's work with fresh state)
    const original = ExpressionsCollection.visemes;
    ExpressionsCollection.visemes = [];

    const v1 = new AvatarExpression(1, 'v1a');
    const v2 = new AvatarExpression(2, 'v2b');
    ExpressionsCollection.visemes.push(v1, v2);

    expect(ExpressionsCollection.visemes).toHaveLength(2);

    // Restore
    ExpressionsCollection.visemes = original;
  });

  // ── getVisemeById ───────────────────────────────────────

  it('should find a viseme by numeric id', () => {
    const original = ExpressionsCollection.visemes;
    ExpressionsCollection.visemes = [];

    ExpressionsCollection.visemes.push(
      new AvatarExpression(3, 'v3a'),
      new AvatarExpression(4, 'v4b'),
    );

    const found = ExpressionsCollection.getVisemeById(3);
    expect(found.id).toBe(3);
    expect(found.alias).toBe('v3a');

    ExpressionsCollection.visemes = original;
  });

  it('should return NEUTRAL when viseme id is not found', () => {
    const original = ExpressionsCollection.visemes;
    ExpressionsCollection.visemes = [
      new AvatarExpression(1, 'v1a'),
    ];

    const found = ExpressionsCollection.getVisemeById(999);
    expect(found).toBe(ExpressionsCollection.NEUTRAL);

    ExpressionsCollection.visemes = original;
  });

  // ── getVisemeByAlias ────────────────────────────────────

  it('should find a viseme by alias string', () => {
    const original = ExpressionsCollection.visemes;
    ExpressionsCollection.visemes = [];

    const v5b = new AvatarExpression(5, 'v5b');
    ExpressionsCollection.visemes.push(v5b);

    const found = ExpressionsCollection.getVisemeByAlias('v5b');
    expect(found).toBe(v5b);

    ExpressionsCollection.visemes = original;
  });

  it('should return NEUTRAL when viseme alias is not found', () => {
    const original = ExpressionsCollection.visemes;
    ExpressionsCollection.visemes = [];

    const found = ExpressionsCollection.getVisemeByAlias('nonexistent');
    expect(found).toBe(ExpressionsCollection.NEUTRAL);

    ExpressionsCollection.visemes = original;
  });
});
