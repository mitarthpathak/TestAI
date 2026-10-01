/**
 * PART: jaw — forward-projecting muzzle (broad V chin plate + step plate,
 * grooves) + round chin button, layered mandible bands that wrap the
 * cheek discs, the ramus plates running back to the hinge, the V jaw line,
 * the under-jaw closure and the mouth interior (dark cavity + metal teeth).
 *
 * Joint: jaw (hinge at head-space (0, 0.46, 0.02), rotation about X).
 * Authoring space: HEAD for everything.
 *
 * Rig notes
 *  - `open` rotates the jaw joint and glides it slightly down / forward (like a
 *    real TMJ), so the chin drops instead of sinking into the neck.
 *  - The mandible plates are concentric bands around the cheek disc. Each band
 *    sits on its own "flex" pivot that follows only a fraction `k` of the jaw
 *    joint's motion (bands next to the static cheek disc move least). Bands are
 *    layered (inner band on top, outer bands tucked underneath) so opening the
 *    mouth slides plates over each other instead of tearing holes.
 *  - The upper teeth + the mouth back wall live on the HEAD (static); the lower
 *    teeth ride the jaw.
 *
 * Sub-objects: jaw.chin, jaw.chin.step, jaw.chin.{groove,ridge,vgroove}.L/R,
 * jaw.chin.groove.top, jaw.button(.rim/.arch/.seat/.pivot), jaw.detail.groove*.L/R,
 * jaw.band.{A,B,C,D}.L/R (= mandible layers), jaw.ramus.L/R, jaw.hinge.L/R,
 * jaw.line.L/R, jaw.under.L/R, jaw.underCap, jaw.mouth.back,
 * jaw.teeth.upper / jaw.teeth.lower, flex pivots jaw.flex.*
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
  const { headSection, headSurface, headNormal } = A;

  const root = ctx.space('jaw', 'head');      // moves with the jaw joint
  const headRoot = ctx.space('head', 'head'); // static mouth interior
  headRoot.name = 'jaw@head';

  // ------------------------------------------------------------ materials
  const mat = {
    column: M.get('chrome', { roughness: 0.2, panel: 7, seed: 61, lineWidth: 0.003, lineDepth: 0.6 }),
    bandA: M.get('chrome', { roughness: 0.22, panel: 6, seed: 62, lineWidth: 0.0035 }),
    bandB: M.get('gunmetal', { roughness: 0.3, panel: 5.5, seed: 63, lineWidth: 0.0035 }),
    bandC: M.get('chrome', { roughness: 0.25, panel: 5.2, seed: 64, lineWidth: 0.0035 }),
    bandD: M.get('gunmetal', { roughness: 0.32, panel: 4.6, seed: 65, lineWidth: 0.0035 }),
    ramus: M.get('gunmetal', { roughness: 0.34, panel: 4.4, seed: 68, lineWidth: 0.004 }),
    under: M.get('gunmetal', { roughness: 0.42, panel: 4, seed: 66, lineWidth: 0.004 }),
    bright: M.get('chrome', { roughness: 0.14 }),
    buttonFace: M.get('chrome', { roughness: 0.24 }),
    gun: M.get('gunmetal', { roughness: 0.3 }),
    dark: M.get('darkMetal'),
    cavity: M.get('cavity'),
  };

  // ------------------------------------------------------------ head-surface maths
  /** inverse of headSurface: angle u of a point near the shell */
  const uOf = (x, y, z) => {
    const s = headSection(y);
    const d = z >= s.zc ? s.zf : s.zb;
    const su = Math.sign(x) * Math.pow(Math.abs(x) / s.w, s.n / 2);
    const cu = Math.sign(z - s.zc) * Math.pow(Math.abs(z - s.zc) / d, s.n / 2);
    return Math.atan2(su, cu);
  };
  const _t = new V3();

  // ------------------------------------------------------------ cheek-disc polar frame (LEFT side)
  // (phi, rho) = angle / radial distance around the cheek-disc AXIS. A point
  // is found by walking along a line parallel to the axis until it meets the
  // shell, so rings of constant rho are exactly concentric with the disc and
  // its guard band from any view.
  const C = new V3().fromArray(L.cheekDiscL);
  const dn = new V3().fromArray(L.cheekDiscNormalL).normalize();
  const e1 = new V3(0, 1, 0).cross(dn).normalize(); // outward / back
  const e2 = new V3().crossVectors(dn, e1).normalize(); // up
  const levelAt = (x, y, z) => {
    const s = headSection(y);
    const d = z >= s.zc ? s.zf : s.zb;
    return Math.pow(Math.abs(x) / s.w, s.n) + Math.pow(Math.abs(z - s.zc) / d, s.n) - 1;
  };
  const _q = new V3();
  const F = (t) => levelAt(_q.x + dn.x * t, _q.y + dn.y * t, _q.z + dn.z * t);
  let tWarm = 0;
  /** (phi, rho) around the disc -> [u, y] on the head shell; returns null when the line misses */
  const discUY = (phi, r, out) => {
    _q.copy(C).addScaledVector(e1, r * Math.cos(phi)).addScaledVector(e2, r * Math.sin(phi));
    let t = tWarm, ok = false;
    for (let i = 0; i < 12; i++) {
      const f = F(t);
      if (Math.abs(f) < 1e-6) { ok = true; break; }
      const df = (F(t + 1e-4) - f) / 1e-4;
      if (Math.abs(df) < 1e-5) break;
      t -= clamp(f / df, -0.08, 0.08);
      if (Math.abs(t) > 0.45) break;
    }
    if (!ok && Math.abs(F(t)) < 1e-4) ok = true;
    if (!ok) {
      // bracket search for the nearest crossing
      const s0 = Math.sign(F(0));
      let lo = 0, hi = 0, found = false;
      for (let k = 1; k <= 36 && !found; k++) {
        for (const sg of [1, -1]) {
          const tt = sg * k * 0.012;
          if (Math.sign(F(tt)) !== s0) { lo = sg * (k - 1) * 0.012; hi = tt; found = true; break; }
        }
      }
      if (!found) return null;
      for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (Math.sign(F(m)) === s0) lo = m; else hi = m; }
      t = (lo + hi) / 2;
    }
    tWarm = t;
    const x = _q.x + dn.x * t, y = _q.y + dn.y * t, z = _q.z + dn.z * t;
    out[0] = uOf(x, y, z);
    out[1] = y;
    return out;
  };

  // ------------------------------------------------------------ layout curves (LEFT side, u >= 0)
  const GROOVE_X = 0.104;   // chin column half width + seam
  const U_BAND = 1.78;      // bands stop here, the ramus continues to the back
  const U_BACK = 2.3;
  // jaw line: lower edge of the mandible plates, from the chin corner back to the neck
  const jawPts = [[0.22, -0.262], [0.5, -0.232], [0.85, -0.168], [1.2, -0.085], [1.55, -0.005], [1.9, 0.07], [2.32, 0.135]];
  const jawTable = new THREE.SplineCurve(jawPts.map(([u, y]) => new THREE.Vector2(u, y))).getSpacedPoints(160);
  const jawLineY = (u) => {
    if (u <= jawTable[0].x) return jawTable[0].y;
    for (let i = 1; i < jawTable.length; i++) {
      if (jawTable[i].x >= u) {
        const a = jawTable[i - 1], b = jawTable[i];
        return lerp(a.y, b.y, (u - a.x) / (b.x - a.x || 1));
      }
    }
    return jawTable[jawTable.length - 1].y;
  };
  // top limit: under the lower lip in front of the mouth, lips band beside it, cranium plates behind
  const topY = (x, u) => {
    const mouth = lerp(0.1, 0.232, sstep(x, 0.2, 0.25));
    return lerp(mouth, 0.352, sstep(u, 1.05, 1.3));
  };
  const _P = new V3();
  const allowedUY = (u, y) => {
    if (u > U_BAND || u < 0) return false;
    headSurface(u, y, _P);
    if (_P.x < GROOVE_X) return false;
    if (y < jawLineY(u)) return false;
    if (y > topY(_P.x, u)) return false;
    return true;
  };
  const _uy = [0, 0];
  const allowedDisc = (phi, r) => discUY(phi, r, _uy) !== null && allowedUY(_uy[0], _uy[1]);

  // ------------------------------------------------------------ generic custom-surface plate
  /**
   * Thick bevelled plate over an arbitrary parametric patch S(a, b) (outer
   * surface). `out(a, b)` gives a rough outward direction used to orient the
   * normals and the winding.
   */
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
      offset: 0, thickness: o.thickness ?? 0.045, bevel: o.bevel ?? 0.012, gap: o.gap ?? 0,
      segU: o.segU ?? 32, segV: o.segV ?? 12,
    });
  }
  const pair = (g, material, name, parent) => {
    const l = ctx.mesh(g, material, `${name}.L`);
    const r = ctx.mesh(geo.mirrorGeometryX(g), material, `${name}.R`);
    parent.add(l, r);
    return [l, r];
  };

  // ------------------------------------------------------------ flex pivots
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
  const fxRamus = flex('jaw.flex.ramus', 0.2);
  const fxA = flex('jaw.flex.A', 0.3);
  const fxB = flex('jaw.flex.B', 0.55);
  const fxC = flex('jaw.flex.C', 0.8);

  // ------------------------------------------------------------ mandible bands (concentric around the disc)
  const BANDS = [
    { key: 'A', r0: 0.3, r1: 0.415, off: 0.018, grp: fxA, m: mat.bandA, phiMax: -0.85 },
    { key: 'B', r0: 0.39, r1: 0.515, off: 0.012, grp: fxB, m: mat.bandB, phiMax: -0.85 },
    { key: 'C', r0: 0.49, r1: 0.615, off: 0.006, grp: fxC, m: mat.bandC, phiMax: -0.85 },
    { key: 'D', r0: 0.59, r1: 1.1, off: 0.0, grp: root, m: mat.bandD, phiMax: -0.85 },
  ];
  for (const B of BANDS) {
    // outer radius per phi, clipped by the layout boundary
    const NS = 72;
    const table = [];
    for (let i = 0; i <= NS; i++) {
      const phi = lerp(-3.1, B.phiMax, i / NS);
      let rOut = B.r0;
      if (allowedDisc(phi, B.r0 + 0.004)) {
        let r = B.r0;
        const step = 0.01;
        while (r + step <= B.r1 && allowedDisc(phi, r + step)) r += step;
        let lo = r, hi = Math.min(B.r1, r + step);
        if (hi > lo && !allowedDisc(phi, hi)) {
          for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (allowedDisc(phi, m)) lo = m; else hi = m; }
          r = lo;
        } else r = hi;
        rOut = r;
      }
      table.push([phi, rOut]);
    }
    // every contiguous run with a usable width becomes one plate
    const minW = 0.028;
    const runs = [];
    let cur = -1;
    for (let i = 0; i <= NS + 1; i++) {
      const ok = i <= NS && table[i][1] - B.r0 >= minW;
      if (ok && cur < 0) cur = i;
      if (!ok && cur >= 0) { if (i - 1 - cur >= 2) runs.push(table.slice(cur, i)); cur = -1; }
    }
    runs.forEach((tb, ri) => {
      const phiA = tb[0][0], phiB = tb[tb.length - 1][0];
      const rOutAt = (phi) => {
        const f = clamp((phi - phiA) / (phiB - phiA), 0, 1) * (tb.length - 1);
        const i = Math.min(tb.length - 2, Math.floor(f));
        return lerp(tb[i][1], tb[i + 1][1], f - i);
      };
      const S = (phi, b, t) => {
        discUY(phi, lerp(B.r0, rOutAt(phi), b), _uy);
        headSurface(_uy[0], _uy[1], t);
        headNormal(_uy[0], _uy[1], _t);
        const crown = 0.003 * Math.sin(Math.PI * clamp(b, 0, 1)); // gentle pillow across the band
        return t.addScaledVector(_t, B.off + crown);
      };
      const out = (phi, b) => {
        discUY(phi, lerp(B.r0, rOutAt(phi), b), _uy);
        return headNormal(_uy[0], _uy[1], new V3());
      };
      const segU = Math.max(8, Math.round(56 * (phiB - phiA) / 2.4));
      const g = plate({ a0: phiA, a1: phiB, b0: 0, b1: 1, S, out, thickness: 0.032, bevel: 0.006, gap: 0.002, segU, segV: 8 });
      pair(g, B.m, `jaw.band.${B.key}${ri ? ri : ''}`, B.grp);
    });
  }

  // ------------------------------------------------------------ ramus: rear mandible plate back to the hinge
  {
    const yTop = 0.352;
    const S = (u, b, t) => {
      const y = lerp(jawLineY(u) - 0.004, yTop, b);
      headSurface(u, y, t);
      headNormal(u, y, _t);
      return t.addScaledVector(_t, -0.008 + 0.005 * Math.sin(Math.PI * b));
    };
    const out = (u, b) => headNormal(u, lerp(jawLineY(u), yTop, b), new V3());
    pair(plate({ a0: 1.3, a1: U_BACK, b0: 0, b1: 1, S, out, thickness: 0.04, bevel: 0.012, gap: 0.004, segU: 30, segV: 14 }),
      mat.ramus, 'jaw.ramus', fxRamus);
    // hinge boss, just below the cranium plates
    for (const side of [1, -1]) {
      const hu = 1.98 * side, hy = 0.265;
      const hp = headSurface(hu, hy, new V3());
      const hn = headNormal(hu, hy, new V3());
      const boss = ctx.mesh(geo.ringStack([[0, 0.008], [0.014, 0.008], [0.017, 0.012], [0.028, 0.012], [0.034, 0.007], [0.038, 0.0], [0.041, -0.02]], 40), mat.bright, `jaw.hinge.${side > 0 ? 'L' : 'R'}`);
      boss.position.copy(hp).addScaledVector(hn, 0.002);
      geo.faceDirection(boss, hn);
      fxRamus.add(boss);
    }
  }

  // ------------------------------------------------------------ muzzle (broad forward-projecting chin plate)
  // Spine in the (y, z) plane from under the chin (b = 0, curls under) up to
  // just below the lower lip (b = 1). The muzzle is a wide rounded shield,
  // V-shaped toward the bottom, whose sides fall back onto the head shell /
  // mandible bands. A darker, slightly wider "step" plate sits behind it so
  // the edge reads as a layered depth step.
  const spinePts = [
    [-0.33, 0.5], [-0.322, 0.58], [-0.295, 0.645], [-0.24, 0.697], [-0.16, 0.728], [-0.07, 0.738], [0.02, 0.733], [0.1, 0.72],
  ];
  const spine = new THREE.SplineCurve(spinePts.map(([y, z]) => new THREE.Vector2(z, y)));
  const _sp = new THREE.Vector2();
  const _tg = new THREE.Vector2();
  const spineFrame = (b) => {
    spine.getPointAt(clamp(b, 0, 1), _sp);
    spine.getTangentAt(clamp(b, 0, 1), _tg); // (dz, dy), pointing up the chin
    return { z: _sp.x, y: _sp.y, nz: _tg.y, ny: -_tg.x }; // outward normal in the yz plane
  };
  // half width: V toward the bottom, broad under the mouth
  const muzW = (b) => lerp(0.08, 0.15, sstep(b, 0.0, 0.2)) + 0.11 * sstep(b, 0.15, 0.8);
  const makeMuzzle = (wScale, sink, edgeLift) => (a, b, t) => {
    const f = spineFrame(b);
    const w = muzW(b) * wScale;
    const x = a * w;
    const sz = A.headFrontZ(x, f.y);
    const zEdge = (sz == null ? f.z - 0.06 : sz) + edgeLift;
    const drop = clamp((f.z - zEdge) * Math.pow(Math.abs(a), 1.5), 0, 0.09);
    return t.set(x, f.y - f.ny * (drop + sink), f.z - f.nz * (drop + sink));
  };
  const muzOut = (a, b) => { const f = spineFrame(b); return new V3(a * 0.5, f.ny, f.nz).normalize(); };
  const muzS = makeMuzzle(1, 0, 0.016);
  root.add(ctx.mesh(plate({ a0: -1, a1: 1, b0: 0, b1: 1, S: muzS, out: muzOut, thickness: 0.05, bevel: 0.014, segU: 34, segV: 40 }), mat.column, 'jaw.chin'));
  // step plate behind the muzzle (wider, darker, sunk)
  root.add(ctx.mesh(plate({ a0: -1, a1: 1, b0: 0.02, b1: 0.97, S: makeMuzzle(1.17, 0.022, 0.006), out: muzOut, thickness: 0.04, bevel: 0.01, segU: 34, segV: 30 }), mat.bandB, 'jaw.chin.step'));

  // grooves on the muzzle: vertical pairs flanking the centre + a lip-line groove
  const muzPt = (a, b, lift) => {
    const p = muzS(a, b, new V3());
    const f = spineFrame(b);
    return p.add(new V3(a * 0.15 * lift, f.ny * lift, f.nz * lift));
  };
  const groove = (pts, name, m = mat.dark, w = 0.0075, h = 0.006) => {
    const g = geo.sweptSection(new THREE.CatmullRomCurve3(pts), geo.roundedSection(w, h, 3, 10), { steps: Math.max(8, pts.length * 2), up: () => muzOut(0, 0.5) });
    root.add(ctx.mesh(g, m, name));
  };
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const vp = [], rp = [], cp = [];
    for (let i = 0; i <= 14; i++) {
      const b = lerp(0.4, 0.95, i / 14);
      vp.push(muzPt(side * lerp(0.5, 0.6, i / 14), b, 0.0025));
      rp.push(muzPt(side * lerp(0.6, 0.7, i / 14), b, 0.004));
    }
    for (let i = 0; i <= 12; i++) {
      const b = lerp(0.22, 0.6, i / 12);
      cp.push(muzPt(side * lerp(0.86, 0.66, i / 12), b, 0.002));
    }
    groove(vp, `jaw.chin.groove.${key}`);
    groove(rp, `jaw.chin.ridge.${key}`, mat.bright, 0.006, 0.006);
    groove(cp, `jaw.chin.vgroove.${key}`, mat.dark, 0.006, 0.005);
  }
  {
    const hp = [];
    for (let i = 0; i <= 20; i++) hp.push(muzPt(lerp(-0.62, 0.62, i / 20), 0.88 - 0.03 * Math.cos(Math.PI * (i / 20 - 0.5)) ** 2, 0.0025));
    groove(hp, 'jaw.chin.groove.top');
  }

  // ------------------------------------------------------------ chin button (round disc set into the lower front)
  const btnPivot = new THREE.Group();
  btnPivot.name = 'jaw.button.pivot';
  {
    let bb = 0.3;
    for (let i = 0; i < 30; i++) { const f = spineFrame(bb); bb = clamp(bb + (-0.185 - f.y) * 1.5, 0, 1); }
    const f = spineFrame(bb);
    btnPivot.position.set(0, f.y, f.z);
    geo.faceDirection(btnPivot, new V3(0, f.ny * 0.7, f.nz).normalize());
    const R = 0.064;
    const seat = ctx.mesh(geo.ringStack([[R * 1.32, 0.012], [R * 1.22, 0.006], [R * 1.14, -0.006], [0, -0.006]], 56), mat.dark, 'jaw.button.seat');
    const rim = ctx.mesh(geo.ringStack([
      [R * 0.8, 0.012], [R * 0.86, 0.022], [R * 0.95, 0.026], [R * 1.03, 0.02], [R * 1.08, 0.008], [R * 1.1, -0.006],
    ], 64), mat.bright, 'jaw.button.rim');
    const face = ctx.mesh(geo.ringStack([
      [0, 0.024], [R * 0.35, 0.023], [R * 0.6, 0.02], [R * 0.78, 0.014], [R * 0.82, 0.008],
    ], 48), mat.buttonFace, 'jaw.button');
    // arch / slot detail on the button face (seen in the reference)
    const archPts = [];
    for (let i = 0; i <= 16; i++) {
      const a = lerp(Math.PI * 0.12, Math.PI * 0.88, i / 16);
      archPts.push(new V3(Math.cos(a) * R * 0.42, -R * 0.2 + Math.sin(a) * R * 0.28, 0.023));
    }
    const arch = ctx.mesh(geo.sweptSection(new THREE.CatmullRomCurve3(archPts), geo.roundedSection(0.006, 0.005, 2, 8), { steps: 24, up: new V3(0, 0, 1) }), mat.dark, 'jaw.button.arch');
    const oval = new THREE.Group();
    oval.name = 'jaw.button.oval';
    oval.add(seat, rim, face, arch);
    btnPivot.add(oval);
  }
  root.add(btnPivot);

  // ------------------------------------------------------------ secondary detail grooves on the mandible plates
  {
    const N = new V3();
    const rings = [[0.66, -3.0, -1.0], [0.78, -2.9, -1.2], [0.9, -2.7, -1.3]];
    rings.forEach(([r, pA, pB], ri) => {
      const pts = [];
      const segs = [];
      for (let i = 0; i <= 40; i++) {
        const phi = lerp(pA, pB, i / 40);
        const ok = discUY(phi, r, _uy) && allowedUY(_uy[0], _uy[1]) && headSurface(_uy[0], _uy[1], new V3()).x > 0.29;
        if (ok) {
          const p = headSurface(_uy[0], _uy[1], new V3());
          headNormal(_uy[0], _uy[1], N);
          pts.push(p.addScaledVector(N, 0.0055));
        } else if (pts.length) { segs.push(pts.splice(0)); }
      }
      if (pts.length) segs.push(pts);
      segs.filter((s) => s.length >= 4).forEach((s, si) => {
        const g = geo.sweptSection(new THREE.CatmullRomCurve3(s), geo.roundedSection(0.006, 0.005, 3, 10), {
          steps: s.length * 2,
          up: (t) => s[Math.min(s.length - 1, Math.round(t * (s.length - 1)))].clone().setY(0).normalize(),
        });
        pair(g, mat.dark, `jaw.detail.groove${ri}${si ? si : ''}`, root);
      });
    });
  }

  // ------------------------------------------------------------ jaw line (bright layered edge)
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const u0 = 0.6, u1 = 2.28;
    const pts = [];
    const N = new V3();
    for (let i = 0; i <= 48; i++) {
      const u = lerp(u0, u1, i / 48);
      const y = jawLineY(u) + 0.004;
      const p = headSurface(u * side, y, new V3());
      headNormal(u * side, y, N);
      pts.push(p.addScaledVector(N, 0.012));
    }
    const line = geo.sweptSection(new THREE.CatmullRomCurve3(pts), geo.roundedSection(0.024, 0.012, 3, 16), {
      steps: 90,
      up: (t) => { const u = lerp(u0, u1, t); return headNormal(u * side, jawLineY(u), new V3()); },
      scale: (t) => [0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, 0.08 + t * 1.1)), 1],
    });
    root.add(ctx.mesh(line, mat.bright, `jaw.line.${key}`));
  }

  // ------------------------------------------------------------ under-jaw plates + bottom cap
  {
    const S = (u, b, t) => {
      const y = lerp(-0.3, jawLineY(u) + 0.03, b);
      headSurface(u, y, t);
      headNormal(u, y, _t);
      return t.addScaledVector(_t, -0.008);
    };
    const out = (u, b) => headNormal(u, lerp(-0.3, jawLineY(u) + 0.03, b), new V3());
    pair(plate({ a0: 0.04, a1: U_BACK, b0: 0, b1: 1, S, out, thickness: 0.035, bevel: 0.01, segU: 44, segV: 8 }), mat.under, 'jaw.under', root);

    // flat cap closing the bottom of the head shell in front of the neck
    const s = headSection(-0.3);
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, s.w * 0.98, ((s.zf + s.zb) / 2) * 0.98, 0, Math.PI * 2, false, 0);
    const cap = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 32 });
    cap.rotateX(Math.PI / 2);
    cap.translate(0, -0.298, s.zc + (s.zf - s.zb) / 2);
    root.add(ctx.mesh(cap, mat.dark, 'jaw.underCap'));
  }

  // ------------------------------------------------------------ mouth interior
  // back wall (static, on the head) — sits just in front of the cranium under-shell
  {
    const u1 = A.headAngleForX(0.23, 0.1);
    const back = geo.surfaceSheet({
      surface: headSurface, normal: headNormal, u0: -u1, u1, y0: -0.12, y1: 0.215, segU: 28, segV: 20, offset: -0.021,
    });
    headRoot.add(ctx.mesh(back, mat.cavity, 'jaw.mouth.back'));
  }
  // teeth-like vertical ribs
  const ribs = (y0, y1, off, count, halfW, sec) => {
    const list = [];
    const N = new V3();
    for (let i = 0; i < count; i++) {
      const x = lerp(-halfW, halfW, count === 1 ? 0.5 : i / (count - 1));
      const pts = [];
      for (let k = 0; k <= 4; k++) {
        const y = lerp(y0, y1, k / 4);
        const u = A.headAngleForX(x, y);
        const p = headSurface(u, y, new V3());
        headNormal(u, y, N);
        pts.push(p.addScaledVector(N, off));
      }
      list.push(geo.sweptSection(new THREE.CatmullRomCurve3(pts), sec, { steps: 6, up: new V3(0, 0, 1) }));
    }
    return geo.mergeGeometries(list, false);
  };
  headRoot.add(ctx.mesh(ribs(0.1, 0.19, -0.004, 11, 0.15, geo.roundedSection(0.0075, 0.007, 3, 12)), mat.gun, 'jaw.teeth.upper'));
  root.add(ctx.mesh(ribs(0.02, 0.205, -0.015, 10, 0.135, geo.roundedSection(0.0075, 0.006, 3, 12)), mat.dark, 'jaw.teeth.lower'));

  // ------------------------------------------------------------ rig
  const _mJ = new THREE.Matrix4(), _mK = new THREE.Matrix4();
  const _mT = new THREE.Matrix4().makeTranslation(hinge.x, hinge.y, hinge.z);
  const _mTi = new THREE.Matrix4().makeTranslation(-hinge.x, -hinge.y, -hinge.z);
  const _qK = new THREE.Quaternion(), _pK = new V3(), _dp = new V3(), _one = new V3(1, 1, 1);
  const _G = new THREE.Matrix4();
  /** give every flex pivot a fraction k of the jaw joint's current motion */
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

  const OPEN_ROT = 0.22;
  const params = { open: 0, shift: 0, clench: 0 };
  return {
    params,
    paramSpec: {
      open: { min: 0, max: 1, step: 0.01 },
      shift: { min: -1, max: 1, step: 0.01 },
      clench: { min: 0, max: 1, step: 0.01 },
    },
    apply(p) {
      const j = rig.joints.jaw;
      const o = clamp(p.open, 0, 1.2);
      const rest = j.userData.restPosition;
      j.rotation.set(o * OPEN_ROT - p.clench * 0.012, p.shift * 0.05, 0);
      j.position.set(
        rest.x + p.shift * 0.018,
        rest.y - o * 0.035 + p.clench * 0.004,
        rest.z + o * 0.055 - p.clench * 0.006,
      );
      syncFlex();
    },
    update() {
      syncFlex();
    },
  };
}
