/**
 * PART: jaw — the forward muzzle below the upper lip.
 *
 * Authored directly on the final head shell (FACE_WARP off), HEAD space.
 * Joint: jaw (hinge (0, 0.4, 0.04), rotation about X). Everything here rides
 * the jaw except the mouth interior back wall (static on the head).
 *
 * Sub-objects
 *   jaw.carrier            horizontal lower-lip carrier plate under the lips
 *   jaw.column             central vertical plate from the carrier to the chin
 *   jaw.column.rib.L/R     bright vertical ribs on the column (grille look)
 *   jaw.column.seam        dark groove between carrier / column / chin
 *   jaw.muzzle.L/R         flanking muzzle plates beside the column (mouth corner -> chin)
 *   jaw.chin               long rounded chin cup, curls under the head
 *   jaw.chin.step          darker, wider step plate behind the chin cup
 *   jaw.button.*           chin button: seat, stepped ring, domed face, slot, on jaw.button.pivot
 *   jaw.side.{A,B,C}.L/R   layered horizontal jaw bands back under the cheek rings
 *   jaw.line.L/R           bright rail along the jaw line
 *   jaw.under.L/R          under-jaw plates sloping in toward the neck
 *   jaw.mouth.back         dark mouth cavity (on the head)
 *   jaw.mouth.floor        dark floor of the mouth (on the jaw)
 *   flex pivots jaw.flex.{A,B} follow a fraction of the hinge so the upper
 *   bands (next to the static cheeks) move less than the chin.
 *
 * Params: open (hinge), shift (sideways), clench, button (button spin).
 */
export const meta = {
  id: 'jaw',
  explode: [0, -0.9, 0.5],
};

export function build(ctx) {
  const { THREE, geo, anatomy: A, rig, materials: M } = ctx;
  const V3 = THREE.Vector3;
  const { lerp, smoothstep: sstep, clamp } = THREE.MathUtils;
  const L = A.LANDMARKS;
  const { headSection, headSurface, headNormal, headFrontZ } = A;

  const root = ctx.space('jaw', 'head');
  const headRoot = ctx.space('head', 'head');
  headRoot.name = 'jaw@head';

  // ------------------------------------------------------------ materials
  const mat = {
    column: M.get('chrome', { color: 0xc2c8ce, roughness: 0.22, panel: 7, seed: 61, lineWidth: 0.003, lineDepth: 0.7 }),
    carrier: M.get('chrome', { color: 0xa8aeb5, roughness: 0.22, panel: 8, seed: 69, lineWidth: 0.003, lineDepth: 0.6 }),
    chin: M.get('chrome', { color: 0xb4bac1, roughness: 0.24, panel: 5, seed: 67, lineWidth: 0.0035, lineDepth: 0.7 }),
    muzzle: M.get('chrome', { color: 0xb8bec5, roughness: 0.26, panel: 6.5, seed: 62, lineWidth: 0.0035 }),
    sideA: M.get('chrome', { color: 0xadb4bb, roughness: 0.3, panel: 6, seed: 63, lineWidth: 0.0035 }),
    sideB: M.get('chrome', { roughness: 0.42, color: 0x868d95, panel: 5.5, seed: 64, lineWidth: 0.0035 }),
    sideC: M.get('chrome', { color: 0xa4abb2, roughness: 0.32, panel: 5, seed: 65, lineWidth: 0.0035 }),
    under: M.get('gunmetal', { roughness: 0.42, panel: 4, seed: 66, lineWidth: 0.004 }),
    step: M.get('gunmetal', { roughness: 0.36 }),
    base: M.get('chrome', { roughness: 0.3, color: 0x8d949c, panel: 3.5, seed: 70, lineWidth: 0.003 }),
    bright: M.get('chrome', { roughness: 0.12 }),
    buttonFace: M.get('chrome', { roughness: 0.34, color: 0xa7aeb5 }), // round 5: brushed, not a black mirror dome
    dark: M.get('darkMetal'),
    cavity: M.get('cavity'),
  };
  // close-up reference: light polished steel on the lower face
  for (const k of ['column', 'carrier', 'chin', 'muzzle', 'sideA', 'sideB', 'sideC', 'base']) { mat[k].envMapIntensity = 1.8; mat[k].roughness = Math.max(mat[k].roughness, 0.34); }

  // ------------------------------------------------------------ shared helpers
  const _t = new V3();
  /** Thick bevelled plate over an arbitrary parametric patch S(a, b, target). */
  function plate(o) {
    const { a0, a1, b0, b1 } = o;
    let flip = false;
    const map = (a) => (flip ? a0 + a1 - a : a);
    const S = (a, b, t) => o.S(map(a), b, t);
    const h = 1e-3;
    const pa = new V3(), pb = new V3(), tmp = new V3();
    const N = (a, b, t) => {
      S(a + h, b, pa); S(a - h, b, tmp); pa.sub(tmp);
      S(a, b + h, pb); S(a, b - h, tmp); pb.sub(tmp);
      t.crossVectors(pa, pb);
      const ref = o.out(map(a), b);
      if (t.lengthSq() < 1e-16) return t.copy(ref).normalize();
      t.normalize();
      if (t.dot(ref) < 0) t.negate();
      return t;
    };
    const am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
    S(am + h, bm, pa); S(am - h, bm, tmp); pa.sub(tmp);
    S(am, bm + h, pb); S(am, bm - h, tmp); pb.sub(tmp);
    if (pa.cross(pb).dot(o.out(am, bm)) < 0) flip = true;
    return geo.shellPatch({
      u0: a0, u1: a1, y0: b0, y1: b1, surface: S, normal: N,
      offset: 0, thickness: o.thickness ?? 0.04, bevel: o.bevel ?? 0.01, gap: o.gap ?? 0,
      segU: o.segU ?? 24, segV: o.segV ?? 16,
    });
  }
  const pair = (g, material, name, parent) => {
    const l = ctx.mesh(g, material, `${name}.L`);
    const r = ctx.mesh(geo.mirrorGeometryX(g), material, `${name}.R`);
    parent.add(l, r);
    return [l, r];
  };
  const tube = (pts, w, h, material, name, parent, up = new V3(0, 0, 1), steps) => {
    const g = geo.sweptSection(new THREE.CatmullRomCurve3(pts), geo.roundedSection(w, h, 3, 10), {
      steps: steps ?? Math.max(10, pts.length * 3), up: typeof up === 'function' ? up : () => up,
    });
    const m = ctx.mesh(g, material, name);
    parent.add(m);
    return m;
  };

  // ------------------------------------------------------------ muzzle front surface
  // The lower face projects forward like a muzzle: the shell front plus a
  // bulge that is strongest on the centre line between mouth and chin.
  const MOUTH_Y = L.mouthCenter[1];
  const bulge = (x, y) => {
    const fx = Math.exp(-Math.pow(Math.abs(x) / 0.27, 3));
    const fy = sstep(y, -0.3, -0.12) * (1 - 0.35 * sstep(y, 0.2, 0.32));
    return 0.032 * fx * fy;
  };
  /** front-projected point on the muzzle at (x, y) with extra offset n along +Z-ish normal */
  // round 5: the chin recedes below the lip carrier (3/4 concept: chin button
  // sits well behind the mouth, LANDMARKS.chinButton z 0.7). Same term in cheeks.js.
  const chinPull = (x, y) => 0.04 * sstep(0.12 - y, 0, 0.3) * (0.55 + 0.45 * Math.exp(-Math.pow(x / 0.3, 2)));
  const muzZ = (x, y) => {
    const z = headFrontZ(x, y);
    if (z == null) {
      const s = headSection(y);
      return s.zc;
    }
    return z + bulge(x, y) - chinPull(x, y);
  };
  /** head shell point with the receding chin applied (fades out round the sides) */
  const shellAt = (u, y, t) => {
    headSurface(u, y, t);
    const sc = headSection(y);
    const fz = sstep((t.z - sc.zc) / (sc.zf || 1), 0.1, 0.85);
    t.z -= chinPull(t.x, y) * fz;
    return t;
  };
  const frontOut = (x, y) => {
    const h = 1e-3;
    const dzx = (muzZ(x + h, y) - muzZ(x - h, y)) / (2 * h);
    const dzy = (muzZ(x, y + h) - muzZ(x, y - h)) / (2 * h);
    return new V3(-dzx, -dzy, 1).normalize();
  };
  const frontPt = (x, y, n, t = new V3()) => {
    const o = frontOut(x, y);
    return t.set(x, y, muzZ(x, y)).addScaledVector(o, n);
  };

  // ------------------------------------------------------------ lower-lip carrier
  // wide horizontal plate directly under the lower lip (the lips sit on it)
  const CARRIER_TOP = MOUTH_Y - 0.02;
  const CARRIER_BOT = MOUTH_Y - 0.1;
  {
    const xHalf = (y) => lerp(0.12, 0.15, sstep(y, CARRIER_BOT, CARRIER_TOP));
    const S = (a, b, t) => {
      const y = lerp(CARRIER_BOT, CARRIER_TOP, b);
      const x = a * xHalf(y);
      const roll = Math.pow(Math.abs(a), 4) * 0.02; // ends roll back into the face
      return frontPt(x, y, -0.008 - roll, t);
    };
    const out = (a, b) => frontOut(a * 0.25, lerp(CARRIER_BOT, CARRIER_TOP, b));
    root.add(ctx.mesh(plate({ a0: -1, a1: 1, b0: 0, b1: 1, S, out, thickness: 0.04, bevel: 0.012, segU: 40, segV: 10 }), mat.carrier, 'jaw.carrier'));
  }

  // ------------------------------------------------------------ central column
  const COL_TOP = MOUTH_Y - 0.078;
  const COL_BOT = -0.085; // the column ends on the chin button
  // vase-shaped column (close-up): waisted in the middle, flares into the button ring
  const colW = (y) => 0.07 - 0.012 * Math.exp(-Math.pow((y - 0.03) / 0.09, 2)) + 0.03 * sstep(-y, 0.0, -COL_BOT + 0.01);
  {
    const S = (a, b, t) => {
      const y = lerp(COL_BOT, COL_TOP, b);
      const x = a * colW(y);
      return frontPt(x, y, 0.034 - 0.014 * Math.pow(Math.abs(a), 3) - 0.02 * sstep(-y, 0.12, 0.27), t);
    };
    const out = (a, b) => frontOut(a * 0.07, lerp(COL_BOT, COL_TOP, b));
    root.add(ctx.mesh(plate({ a0: -1, a1: 1, b0: 0, b1: 1, S, out, thickness: 0.045, bevel: 0.012, segU: 20, segV: 16 }), mat.column, 'jaw.column'));
    // fine horizontal step seams across the column (close-up)
    for (const [k, yy] of [[0, 0.07], [1, -0.03]]) {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const x = lerp(-0.9, 0.9, i / 8) * colW(yy);
        pts.push(frontPt(x, yy + 0.008 * Math.abs(x / colW(yy)) ** 2, 0.035 - 0.014 * Math.abs(x / colW(yy)) ** 3 - 0.02 * sstep(-yy, 0.12, 0.27)));
      }
      tube(pts, 0.004, 0.004, mat.dark, `jaw.column.seam${k}`, root, new V3(0, 0, 1), 16);
    }
    // dark seam groove around the column top
    const sp = [];
    for (let i = 0; i <= 12; i++) {
      const x = lerp(-0.2, 0.2, i / 12);
      sp.push(frontPt(x * 0.6, COL_TOP + 0.004, 0.012));
    }
    tube(sp, 0.007, 0.006, mat.dark, 'jaw.column.seam', root);
  }

  // ------------------------------------------------------------ flanking muzzle plates (mouth corner -> chin)
  {
    const yb = -0.24, yt = CARRIER_BOT + 0.03;
    const xIn = (y) => colW(y) + 0.004;
    const xOut = (y) => lerp(0.13, 0.215, sstep(y, yb - 0.04, yt));
    const mk = (lift) => (a, b, t) => {
      const y = lerp(yb, yt, b);
      const x = lerp(xIn(y), xOut(y), a);
      // rounded: falls back toward the shell at the outer edge
      return frontPt(x, y, lift - 0.012 * Math.pow(a, 2.5), t);
    };
    const out = (a, b) => frontOut(lerp(0.12, 0.25, a), lerp(yb, yt, b));
    // layered: the upper plate overlaps the lower one (scale-like steps)
    // one smooth sculpted muzzle plate per side (no grille steps)
    pair(plate({ a0: 0, a1: 1, b0: 0, b1: 1, S: mk(0.02), out, thickness: 0.045, bevel: 0.012, gap: 0.003, segU: 16, segV: 20 }), mat.muzzle, 'jaw.muzzle', root);
    // bright seam rail along the outer edge of the muzzle plates
    for (const side of []) {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const y = lerp(yb + 0.02, yt, i / 12);
        pts.push(frontPt(side * (xOut(y) - 0.012), y, 0.004));
      }
      tube(pts, 0.007, 0.007, mat.bright, `jaw.muzzle.rail.${side > 0 ? 'L' : 'R'}`, root, new V3(side * 0.7, 0, 0.7).normalize());
    }
  }

  // ------------------------------------------------------------ chin cup (long rounded chin that curls under)
  // spine in the (y, z) plane: from just below the column down and under the head
  // the front follows the muzzle surface (flush with the column), then curls under
  const spinePts = [];
  for (const y of [-0.03, -0.09, -0.15, -0.21]) spinePts.push([y, muzZ(0, y) + 0.016]);
  spinePts.push([-0.265, 0.615], [-0.31, 0.565], [-0.342, 0.5], [-0.36, 0.43], [-0.368, 0.36]);
  spinePts.reverse();
  const spine = new THREE.SplineCurve(spinePts.map(([y, z]) => new THREE.Vector2(z, y)));
  const _sp = new THREE.Vector2(), _tg = new THREE.Vector2();
  const spineFrame = (b) => {
    spine.getPointAt(clamp(b, 0, 1), _sp);
    spine.getTangentAt(clamp(b, 0, 1), _tg);
    return { z: _sp.x, y: _sp.y, nz: _tg.y, ny: -_tg.x };
  };
  // round 6 (sculpt): a fuller, rounder chin mass
  const chinW = (b) => lerp(0.12, 0.21, sstep(b, 0.05, 0.7)) + 0.03 * sstep(b, 0.7, 1);
  const makeChin = (wScale, sink) => (a, b, t) => {
    const f = spineFrame(b);
    const w = chinW(b) * wScale;
    const x = a * w;
    // rounded cross-section: the sides fall back
    // round 6 (sculpt): a ROUND chin mass — the sides wrap back like a cylinder
    const drop = (1 - Math.sqrt(Math.max(0, 1 - a * a * 0.95))) * (0.03 + 0.42 * w);
    return t.set(x, f.y - f.ny * (drop + sink), f.z - f.nz * (drop + sink));
  };
  const chinOut = (a, b) => { const f = spineFrame(b); return new V3(a * 0.6, f.ny, f.nz).normalize(); };
  const chinS = makeChin(1, 0);
  root.add(ctx.mesh(plate({ a0: -1, a1: 1, b0: 0, b1: 1, S: chinS, out: chinOut, thickness: 0.05, bevel: 0.014, segU: 34, segV: 36 }), mat.chin, 'jaw.chin'));
  root.add(ctx.mesh(plate({ a0: -1, a1: 1, b0: 0.0, b1: 0.97, S: makeChin(1.1, 0.016), out: chinOut, thickness: 0.04, bevel: 0.01, segU: 34, segV: 28 }), mat.step, 'jaw.chin.step'));
  // dark seam where the chin meets the column / muzzle plates
  {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const a = lerp(-1, 1, i / 16);
      const p = chinS(a * 0.98, 1, new V3());
      pts.push(p.add(new V3(0, 0.004, 0.004)));
    }
    tube(pts, 0.007, 0.006, mat.dark, 'jaw.chin.seam', root);
  }

  // ------------------------------------------------------------ chin button
  const btnPivot = new THREE.Group();
  btnPivot.name = 'jaw.button.pivot';
  const btnSpin = new THREE.Group();
  btnSpin.name = 'jaw.button.spin';
  {
    let bb = 0.6;
    const BTN_Y = -0.175; // concept 3/4: big round button on the front-bottom of the chin
    for (let i = 0; i < 40; i++) { const f = spineFrame(bb); bb = clamp(bb + (BTN_Y - f.y) * 1.2, 0, 1); }
    const f = spineFrame(bb);
    const p = chinS(0, bb, new V3());
    btnPivot.position.copy(p).add(new V3(0, f.ny, f.nz).multiplyScalar(0.004));
    geo.faceDirection(btnPivot, new V3(0, f.ny, f.nz).normalize());
    const R = 0.068;
    const seat = ctx.mesh(geo.ringStack([[R * 1.62, 0.004], [R * 1.55, 0.0], [R * 1.48, -0.012], [0, -0.012]], 64), mat.step, 'jaw.button.seat');
    const ring = ctx.mesh(geo.ringStack([
      [R * 1.02, 0.008], [R * 1.06, 0.022], [R * 1.12, 0.028], [R * 1.2, 0.026], [R * 1.25, 0.016], [R * 1.32, 0.013], [R * 1.4, 0.012], [R * 1.45, 0.002], [R * 1.47, -0.01],
    ], 72), mat.bright, 'jaw.button.ring');
    const face = ctx.mesh(geo.ringStack([
      [0, 0.016], [R * 0.4, 0.016], [R * 0.7, 0.015], [R * 0.9, 0.013], [R * 0.98, 0.008], [R, 0.0],
    ], 56), mat.buttonFace, 'jaw.button');
    // slot detail on the face
    const archPts = [];
    for (let i = 0; i <= 16; i++) {
      const a = lerp(Math.PI * 0.15, Math.PI * 0.85, i / 16);
      archPts.push(new V3(Math.cos(a) * R * 0.45, -R * 0.25 + Math.sin(a) * R * 0.3, 0.0145 - 0.002 * Math.abs(Math.cos(a))));
    }
    const arch = ctx.mesh(geo.sweptSection(new THREE.CatmullRomCurve3(archPts), geo.roundedSection(0.006, 0.005, 2, 8), { steps: 24, up: () => new V3(0, 0, 1) }), mat.dark, 'jaw.button.slot');
    btnSpin.add(face, arch);
    btnPivot.add(seat, ring, btnSpin);
  }
  root.add(btnPivot);

  // ------------------------------------------------------------ flex pivots (for the side bands)
  const hinge = new V3().fromArray(A.JOINTS.jaw.pos);
  const flexGroups = [];
  const flex = (name, k) => {
    const g = new THREE.Group();
    g.name = name;
    g.userData.k = k;
    root.add(g);
    flexGroups.push(g);
    return g;
  };
  const fxA = flex('jaw.flex.A', 0.35);
  const fxB = flex('jaw.flex.B', 0.7);

  // ------------------------------------------------------------ jaw sides: layered horizontal bands
  // (u, y) on the head shell. jaw line = lower edge, top = under the cheek rings.
  const U0 = 0.55, U1 = 1.9;
  const tabY = (pts) => {
    const c = new THREE.SplineCurve(pts.map(([u, y]) => new THREE.Vector2(u, y))).getSpacedPoints(120);
    return (u) => {
      if (u <= c[0].x) return c[0].y;
      for (let i = 1; i < c.length; i++) if (c[i].x >= u) { const a = c[i - 1], b = c[i]; return lerp(a.y, b.y, (u - a.x) / (b.x - a.x || 1)); }
      return c[c.length - 1].y;
    };
  };
  const jawLineY = tabY([[0.3, -0.29], [0.6, -0.26], [1.0, -0.21], [1.4, -0.15], [1.8, -0.09], [2.15, -0.03]]);
  const sideTopY = tabY([[0.3, 0.27], [0.6, 0.2], [1.0, 0.07], [1.4, 0.06], [1.8, 0.14], [2.15, 0.24]]);
  const bandTopY = tabY([[0.3, 0.12], [0.6, 0.1], [1.0, 0.05], [1.4, 0.06], [1.8, 0.14], [2.15, 0.24]]);
  // continuous base mandible shell under every plate (closes the lower head)
  {
    const UB = 2.15;
    const S = (u, b, t) => {
      const au = Math.abs(u);
      const y = lerp(jawLineY(au) - 0.01, sideTopY(au) + 0.02, b);
      shellAt(u, y, t);
      headNormal(u, y, _t);
      return t.addScaledVector(_t, -0.012 + bulge(t.x, y) * 0.6);
    };
    const out = (u, b) => headNormal(u, lerp(jawLineY(Math.abs(u)), sideTopY(Math.abs(u)), b), new V3());
    root.add(ctx.mesh(plate({ a0: -UB, a1: UB, b0: 0, b1: 1, S, out, thickness: 0.03, bevel: 0.006, segU: 72, segV: 14 }), mat.base, 'jaw.base'));
  }
  const BANDS = [
    { key: 'A', b0: 0.66, b1: 1.0, off: 0.012, grp: fxA, m: mat.sideA },
    { key: 'B', b0: 0.33, b1: 0.66, off: 0.006, grp: fxB, m: mat.sideB },
    { key: 'C', b0: 0.0, b1: 0.33, off: 0.0, grp: root, m: mat.sideC },
  ];
  for (const B of BANDS) {
    const S = (u, b, t) => {
      const y = lerp(jawLineY(u), bandTopY(u), b);
      shellAt(u, y, t);
      headNormal(u, y, _t);
      const local = (b - B.b0) / (B.b1 - B.b0);
      return t.addScaledVector(_t, B.off + 0.004 * Math.sin(Math.PI * clamp(local, 0, 1)));
    };
    const out = (u, b) => headNormal(u, lerp(jawLineY(u), bandTopY(u), b), new V3());
    pair(plate({ a0: U0, a1: U1, b0: B.b0, b1: B.b1, S, out, thickness: 0.035, bevel: 0.008, gap: 0.004, segU: 40, segV: 6 }), B.m, `jaw.side.${B.key}`, B.grp);
  }

  // ------------------------------------------------------------ jaw line rail
  for (const side of [1, -1]) {
    const pts = [];
    const N = new V3();
    const ua = 0.5, ub = 2.08;
    for (let i = 0; i <= 32; i++) {
      const u = lerp(ua, ub, i / 32);
      const y = jawLineY(u) + 0.006;
      const p = shellAt(u * side, y, new V3());
      headNormal(u * side, y, N);
      pts.push(p.addScaledVector(N, 0.012));
    }
    const line = geo.sweptSection(new THREE.CatmullRomCurve3(pts), geo.roundedSection(0.02, 0.011, 3, 14), {
      steps: 64,
      up: (t) => { const u = lerp(ua, ub, t); return headNormal(u * side, jawLineY(u), new V3()); },
      scale: (t) => [0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, 0.06 + t * 1.05)), 1],
    });
    root.add(ctx.mesh(line, mat.bright, `jaw.line.${side > 0 ? 'L' : 'R'}`));
  }

  // ------------------------------------------------------------ under-jaw plates + floor
  {
    // from the jaw line, sloping down / in toward the neck
    const inner = (u, t) => {
      const p = shellAt(u, jawLineY(u), new V3());
      return t.set(p.x * 0.4, Math.max(-0.35, jawLineY(u) - 0.04), lerp(p.z, 0.3, 0.5));
    };
    const _o = new V3();
    const S = (u, b, t) => {
      shellAt(u, jawLineY(u) + 0.004, t);
      headNormal(u, jawLineY(u), _t);
      t.addScaledVector(_t, -0.006);
      inner(u, _o);
      return t.lerp(_o, b);
    };
    const out = (u, b) => {
      const n = headNormal(u, jawLineY(u), new V3());
      return n.lerp(new V3(0, -1, 0), 0.4 + 0.5 * b).normalize();
    };
    pair(plate({ a0: 0.5, a1: U1, b0: 0, b1: 1, S, out, thickness: 0.03, bevel: 0.008, segU: 32, segV: 6 }), mat.under, 'jaw.under', root);

    // (no flat floor: the neck socket rises into the head underside here)
  }

  // ------------------------------------------------------------ mouth interior
  {
    // back wall on the head: a dark curved sheet behind the slit
    const pts = [];
    const segX = 20, segY = 8;
    const P = new V3();
    for (let j = 0; j <= segY; j++) {
      const y = lerp(MOUTH_Y - 0.11, MOUTH_Y + 0.05, j / segY);
      for (let i = 0; i <= segX; i++) {
        const x = lerp(-0.2, 0.2, i / segX);
        frontPt(x, y, -0.03, P);
        pts.push(P.x, P.y, P.z);
      }
    }
    const idx = [];
    for (let j = 0; j < segY; j++) for (let i = 0; i < segX; i++) {
      const a = j * (segX + 1) + i, b = a + 1, c = a + segX + 2, d = a + segX + 1;
      idx.push(a, b, d, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pts.length / 3) * 2), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (g.attributes.normal.getZ(segX / 2) < 0) geo.flipWinding(g);
    headRoot.add(ctx.mesh(g, mat.cavity, 'jaw.mouth.back'));
    // floor: a dark box riding the jaw behind the lower lip
    const floor = new THREE.BoxGeometry(0.34, 0.012, 0.12);
    floor.translate(0, MOUTH_Y - 0.035, muzZ(0, MOUTH_Y) - 0.08);
    root.add(ctx.mesh(floor, mat.cavity, 'jaw.mouth.floor'));
  }

  // ------------------------------------------------------------ rig
  const _mJ = new THREE.Matrix4(), _mK = new THREE.Matrix4();
  const _mT = new THREE.Matrix4().makeTranslation(hinge.x, hinge.y, hinge.z);
  const _mTi = new THREE.Matrix4().makeTranslation(-hinge.x, -hinge.y, -hinge.z);
  const _qK = new THREE.Quaternion(), _pK = new V3(), _dp = new V3(), _one = new V3(1, 1, 1);
  const _G = new THREE.Matrix4();
  function syncFlex() {
    const j = rig.joints.jaw;
    const rest = j.userData.restPosition || hinge;
    _dp.copy(j.position).sub(rest);
    _mJ.compose(j.position, j.quaternion, _one).invert();
    for (const g of flexGroups) {
      const k = g.userData.k;
      _qK.identity().slerp(j.quaternion, k);
      _pK.copy(rest).addScaledVector(_dp, k);
      _mK.compose(_pK, _qK, _one);
      _G.copy(_mT).multiply(_mJ).multiply(_mK).multiply(_mTi);
      _G.decompose(g.position, g.quaternion, g.scale);
    }
  }

  const OPEN_ROT = 0.26;
  const params = { open: 0, shift: 0, clench: 0, button: 0 };
  return {
    params,
    paramSpec: {
      open: { min: 0, max: 1, step: 0.01 },
      shift: { min: -1, max: 1, step: 0.01 },
      clench: { min: 0, max: 1, step: 0.01 },
      button: { min: -1, max: 1, step: 0.01 },
    },
    apply(p) {
      const j = rig.joints.jaw;
      const o = clamp(p.open, 0, 1.2);
      const rest = j.userData.restPosition;
      j.rotation.set(o * OPEN_ROT - p.clench * 0.012, p.shift * 0.05, 0);
      j.position.set(
        rest.x + p.shift * 0.018,
        rest.y - o * 0.03 + p.clench * 0.004,
        rest.z + o * 0.045 - p.clench * 0.006,
      );
      btnSpin.rotation.z = p.button * Math.PI;
      syncFlex();
    },
    update() {
      syncFlex();
    },
  };
}
