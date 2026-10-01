/**
 * PART: neck — segmented mechanical neck between the jaw and the collar.
 * Authoring space: BODY (see anatomy.js). Most geometry rides the `neck`
 * joint; a few pieces are attached elsewhere so nothing tears when the rig
 * moves:
 *   - neck.base          dark bellows gasket on the CHEST joint (hides the
 *                        neck/collar seam while the neck turns)
 *   - piston top anchors on the HEAD joint: every frame the telescoping
 *                        pistons re-aim between the neck and the head, so they
 *                        stretch / tilt when the head turns.
 *
 * Sub-meshes (L = model's left, +X):
 *   neck.core                    dark inner body
 *   neck.column.<i>              central front column (trachea / spine), stacked
 *   neck.column.<i>.keel         raised centre strip on each column segment
 *   neck.column.tip              spike pointing into the sternal notch
 *   neck.chevron                 V plate tucked under the chin
 *   neck.rib.<i>                 trachea rings visible in the gaps beside the column
 *   neck.pillar.<L|R>.<i>        big side columns (sternocleidomastoid) of stacked
 *                                armour segments, from behind the cheek discs down
 *                                into the collar; .panel / .washer details
 *   neck.pillar.<L|R>.core       inner cylinder seen through the pillar gaps
 *   neck.piston.<L|R>.<i>        telescoping pistons (.barrel / .rod / .gland)
 *   neck.cable.<L|R>.<i>         cable bundles at the back-sides
 *   neck.nape.<i>.<L|C|R>        back plates; neck.spine.<i> vertebrae
 *
 * Params
 *   breathe  0..1   plates / rings swell outward (breathing, idle-modulated)
 *   pistons  0..1   piston extension (barrels retract, more chrome rod shows)
 *   tension  0..1   pillars bulge + tighten (strain / effort)
 *   idle     0..1   amount of built-in breathing motion in update()
 */
export const meta = {
  id: 'neck',
  explode: [0, 0.1, 0.6],
};

const TAU = Math.PI * 2;
const sgnPow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

// ---------------------------------------------------------------------------
// Local geometry helpers (candidates for promotion into src/ultron/geometry.js)
// ---------------------------------------------------------------------------

/** Superellipse loop in the XZ plane with outward normals. a=0 -> +Z. */
function seLoop(w, d, n, count) {
  const e = 2 / n;
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    pts.push([w * sgnPow(Math.sin(a), e), d * sgnPow(Math.cos(a), e)]);
  }
  const nrm = pts.map((p, i) => {
    const a = pts[(i + count - 1) % count];
    const b = pts[(i + 1) % count];
    const tx = b[0] - a[0];
    const tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    return [-tz / l, tx / l];
  });
  return { pts, nrm };
}

/**
 * Rounded-rectangle loop (half sizes w, d, corner radius r) in the XZ plane,
 * sampled with flat faces + round corners. Same orientation as seLoop.
 */
function rrLoop(w, d, r, cornerSeg = 5, edgeSeg = 2) {
  r = Math.min(r, w * 0.999, d * 0.999);
  const pts = [];
  const nrm = [];
  const edge = (x0, z0, x1, z1, nx, nz, from0) => {
    for (let i = from0 ? 0 : 1; i <= edgeSeg; i++) {
      const t = i / edgeSeg;
      pts.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
      nrm.push([nx, nz]);
    }
  };
  const corner = (cx, cz, a0, a1) => {
    for (let i = 1; i < cornerSeg; i++) {
      const a = a0 + ((a1 - a0) * i) / cornerSeg;
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
      nrm.push([Math.cos(a), Math.sin(a)]);
    }
  };
  const H = Math.PI / 2;
  edge(0, d, w - r, d, 0, 1, true);
  corner(w - r, d - r, H, 0);
  edge(w, d - r, w, -d + r, 1, 0, true);
  corner(w - r, -d + r, 0, -H);
  edge(w - r, -d, -w + r, -d, 0, -1, true);
  corner(-w + r, -d + r, -H, -2 * H);
  edge(-w, -d + r, -w, d - r, -1, 0, true);
  corner(-w + r, d - r, Math.PI, H);
  edge(-w + r, d, 0, d, 0, 1, true);
  pts.pop();
  nrm.pop();
  return { pts, nrm };
}

/**
 * "Superellipse lathe": revolve a profile around a superellipse loop.
 * profile: [[k, off, y], ...] -> point = centre + loop * k + loopNormal * off, at height y.
 * k = 0 collapses to the centre (caps). UVs are ~world units.
 */
function puck(THREE, geo, loop, profile, cx = 0, cz = 0, crease = 38) {
  const { pts, nrm } = loop;
  const nL = pts.length;
  const nP = profile.length;
  const arc = [0];
  for (let i = 1; i <= nL; i++) {
    const a = pts[i - 1];
    const b = pts[i % nL];
    arc.push(arc[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const parc = [0];
  for (let j = 1; j < nP; j++) {
    const a = profile[j - 1];
    const b = profile[j];
    parc.push(parc[j - 1] + Math.hypot((b[0] - a[0]) * 0.1 + (b[1] - a[1]), b[2] - a[2]));
  }
  const pos = [];
  const uv = [];
  for (let j = 0; j < nP; j++) {
    const [k, off, y] = profile[j];
    for (let i = 0; i <= nL; i++) {
      const p = pts[i % nL];
      const n = nrm[i % nL];
      pos.push(cx + p[0] * k + n[0] * off, y, cz + p[1] * k + n[1] * off);
      uv.push(arc[i] * Math.max(k, 0.05), parc[j]);
    }
  }
  const W = nL + 1;
  const index = [];
  for (let j = 0; j < nP - 1; j++) {
    for (let i = 0; i < nL; i++) {
      const a = j * W + i, b = a + 1, c = a + W + 1, d = a + W;
      index.push(a, b, c, a, c, d);
    }
  }
  // orient outward (signed volume about the centre)
  let ymid = 0;
  for (const p of profile) ymid += p[2];
  ymid /= nP;
  let vol = 0;
  for (let t = 0; t < index.length; t += 3) {
    const ia = index[t] * 3, ib = index[t + 1] * 3, ic = index[t + 2] * 3;
    const ax = pos[ia] - cx, ay = pos[ia + 1] - ymid, az = pos[ia + 2] - cz;
    const bx = pos[ib] - cx, by = pos[ib + 1] - ymid, bz = pos[ib + 2] - cz;
    const qx = pos[ic] - cx, qy = pos[ic + 1] - ymid, qz = pos[ic + 2] - cz;
    vol += ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx);
  }
  if (vol < 0) for (let t = 0; t < index.length; t += 3) { const s = index[t + 1]; index[t + 1] = index[t + 2]; index[t + 2] = s; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  const out = geo.toCreasedNormals(g.toNonIndexed(), THREE.MathUtils.degToRad(crease));
  g.dispose();
  out.computeBoundingSphere();
  return out;
}

/** Closed segment profile with rounded top/bottom edges (bevel radius b). */
function segProfile(y0, y1, b, { bulge = 0, capInset = 1 } = {}) {
  const p = [[0, -b * capInset, y0], [1, -b, y0]];
  for (let i = 1; i < 4; i++) {
    const t = (i / 4) * Math.PI * 0.5;
    p.push([1, -b + b * Math.sin(t), y0 + b - b * Math.cos(t)]);
  }
  p.push([1, 0, y0 + b]);
  if (bulge) p.push([1, bulge, (y0 + y1) / 2]);
  p.push([1, 0, y1 - b]);
  for (let i = 1; i < 4; i++) {
    const t = (i / 4) * Math.PI * 0.5;
    p.push([1, -b + b * Math.cos(t), y1 - b + b * Math.sin(t)]);
  }
  p.push([1, -b, y1], [0, -b * capInset, y1]);
  return p;
}

/** Straight bevelled cylinder / box along +Y from 0 to len (for pistons). */
function rodProfile(len, b) {
  return segProfile(0, len, b);
}

// ---------------------------------------------------------------------------

export function build(ctx) {
  const { THREE, geo, rig, materials: M } = ctx;
  const root = ctx.space('neck', 'body');
  const chestRoot = ctx.space('chest', 'body');
  const headRoot = ctx.space('head', 'body');

  // materials
  const coreMat = M.get('darkMetal');
  const cavity = M.get('cavity');
  const columnMat = M.get('chrome', { panel: 3.5, seed: 91, lineWidth: 0.004 });
  const bright = M.get('chrome', { roughness: 0.17 });
  const pillarMat = M.get('chrome', { panel: 4.2, seed: 93, lineWidth: 0.0045, roughness: 0.24 });
  const pillarAlt = M.get('gunmetal', { panel: 4.2, seed: 95, lineWidth: 0.0045 });
  const ribMat = M.get('darkMetal', { roughness: 0.36 });
  const pistonMat = M.get('gunmetal', { roughness: 0.4 });
  const cableMat = M.get('cable');
  const napeMat = M.get('gunmetal', { panel: 3.2, seed: 97, lineWidth: 0.005 });

  // ------------------------------------------------------------------ core
  const coreSurf = geo.profileSurface([
    { y: -0.08, w: 0.46, zf: 0.34, zb: 0.42, n: 2.4, zc: -0.04 },
    { y: 0.35, w: 0.4, zf: 0.3, zb: 0.39, n: 2.3, zc: -0.05 },
    { y: 0.9, w: 0.37, zf: 0.28, zb: 0.37, n: 2.3, zc: -0.06 },
    { y: 1.35, w: 0.39, zf: 0.27, zb: 0.38, n: 2.3, zc: -0.08 },
    { y: 1.8, w: 0.4, zf: 0.26, zb: 0.38, n: 2.3, zc: -0.1 },
  ]);
  const CS = { surface: coreSurf.surface, normal: coreSurf.normal };
  root.add(ctx.mesh(geo.surfaceSheet({ ...CS, u0: -Math.PI, u1: Math.PI, y0: -0.05, y1: 1.78, segU: 64, segV: 36 }), coreMat, 'neck.core'));

  // animated pieces: { obj, base: Vector3 position, dir: Vector3 outward, amp }
  const swell = [];
  const addSwell = (obj, dir, amp) => {
    swell.push({ obj, base: obj.position.clone(), dir: dir.clone().normalize(), amp });
  };

  // ---------------------------------------------------------- front column
  const COL_Z = 0.33;
  const colCore = puck(THREE, geo, rrLoop(0.075, 0.06, 0.03), segProfile(0.04, 1.02, 0.01), 0, COL_Z - 0.015);
  root.add(ctx.mesh(colCore, cavity, 'neck.column.core'));
  const colSegs = [
    // [y0, y1, halfWidth, halfDepth]
    [0.12, 0.3, 0.098, 0.078],
    [0.325, 0.51, 0.108, 0.082],
    [0.535, 0.72, 0.112, 0.084],
    [0.745, 0.9, 0.106, 0.08],
  ];
  colSegs.forEach(([y0, y1, w, d], i) => {
    const g = new THREE.Group();
    g.name = `neck.column.${i}`;
    const seg = puck(THREE, geo, rrLoop(w, d, 0.034, 5, 3), segProfile(y0, y1, 0.014), 0, COL_Z);
    g.add(ctx.mesh(seg, columnMat, `neck.column.${i}.plate`));
    // stepped front plate with a centre keel
    const face = puck(THREE, geo, rrLoop(w * 0.8, 0.02, 0.012, 3, 2), segProfile(y0 + 0.02, y1 - 0.016, 0.007), 0, COL_Z + d - 0.012);
    g.add(ctx.mesh(face, pillarAlt, `neck.column.${i}.face`));
    const keel = puck(THREE, geo, rrLoop(0.018, 0.02, 0.008, 3, 1), segProfile(y0 + 0.012, y1 - 0.008, 0.006), 0, COL_Z + d + 0.006);
    g.add(ctx.mesh(keel, bright, `neck.column.${i}.keel`));
    root.add(g);
    addSwell(g, new THREE.Vector3(0, 0, 1), 0.012);
  });
  // tip pointing down into the sternal notch
  {
    const tipLoop = rrLoop(0.07, 0.055, 0.025, 4, 2);
    const prof = [[0, 0, -0.02], [0.12, 0, -0.01], [0.5, 0, 0.04], [1, -0.004, 0.085], [1, -0.012, 0.1], [0, -0.012, 0.1]];
    const tip = puck(THREE, geo, tipLoop, prof, 0, COL_Z + 0.03, 30);
    root.add(ctx.mesh(tip, bright, 'neck.column.tip'));
  }

  // --------------------------------------------------------------- chevron
  {
    const s = new THREE.Shape();
    s.moveTo(-0.2, 0.09);
    s.lineTo(0.2, 0.09);
    s.lineTo(0.17, 0.01);
    s.lineTo(0.05, -0.08);
    s.lineTo(0.0, -0.1);
    s.lineTo(-0.05, -0.08);
    s.lineTo(-0.17, 0.01);
    s.closePath();
    const eg = new THREE.ExtrudeGeometry(s, {
      depth: 0.05, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.014, bevelOffset: -0.014, bevelSegments: 3, curveSegments: 4,
    });
    eg.rotateX(-0.3);
    eg.translate(0, 0.985, 0.33);
    const chev = ctx.mesh(eg, pillarAlt, 'neck.chevron');
    root.add(chev);
    // dark throat behind the chevron
    const throat = puck(THREE, geo, seLoop(0.2, 0.1, 2.4, 32), segProfile(0.86, 1.14, 0.02), 0, 0.26);
    root.add(ctx.mesh(throat, coreMat, 'neck.throat'));
  }

  // ------------------------------------------------------------ trachea rings
  const ribYs = [0.22, 0.36, 0.5, 0.64, 0.78];
  ribYs.forEach((y, i) => {
    const pts = [];
    for (let k = 0; k <= 16; k++) {
      const u = -1.1 + (2.2 * k) / 16;
      const p = coreSurf.surface(u, y, new THREE.Vector3());
      const n = coreSurf.normal(u, y, new THREE.Vector3());
      pts.push(p.addScaledVector(n, 0.004));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = geo.sweptSection(curve, geo.roundedSection(0.02, 0.018, 2.2, 12), { steps: 40, up: new THREE.Vector3(0, 1, 0) });
    const m = ctx.mesh(g, ribMat, `neck.rib.${i}`);
    root.add(m);
    addSwell(m, new THREE.Vector3(0, 0, 1), 0.01);
  });

  // ----------------------------------------------------------------- pillars
  const PIL = { x: 0.39, z: 0.05, w: 0.12, d: 0.155, r: 0.05 };
  // two long vertical plates per side (not stacked blocks)
  const pillarSegs = [
    [-0.02, 0.76], [0.79, 1.5],
  ];
  const pillars = { L: [], R: [] };
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const cx = PIL.x * side;
    const pg = new THREE.Group();
    pg.name = `neck.pillar.${key}`;
    root.add(pg);
    const coreG = puck(THREE, geo, seLoop(PIL.w * 0.7, PIL.d * 0.72, 2.4, 32), segProfile(0.0, 1.55, 0.02), cx, PIL.z);
    pg.add(ctx.mesh(coreG, coreMat, `neck.pillar.${key}.core`));
    pillarSegs.forEach(([y0, y1], i) => {
      const sg = new THREE.Group();
      sg.name = `neck.pillar.${key}.${i}`;
      // pivot at the segment centre so scale (tension) bulges in place
      const yc = (y0 + y1) / 2;
      sg.position.set(cx, yc, PIL.z);
      const top = i === pillarSegs.length - 1;
      const w = PIL.w * (top ? 0.9 : 1);
      const d = PIL.d * (top ? 0.88 : 1);
      const seg = puck(THREE, geo, rrLoop(w, d, PIL.r, 6, 3), segProfile(y0 - yc, y1 - yc, 0.016), 0, 0);
      sg.add(ctx.mesh(seg, pillarAlt, `neck.pillar.${key}.${i}.plate`));
      // long vertical armour: two front strips separated by a groove, an
      // outer side strip and a thin bright band near the top of the segment
      const hh = (y1 - y0) / 2;
      const fw = w * 0.78;
      const sw = fw / 2 - 0.012;
      for (let k = 0; k < 2; k++) {
        const ox = (k ? 1 : -1) * (fw / 2) + 0.008 * side;
        const top = hh - 0.02 - (k === (side > 0 ? 1 : 0) ? 0.05 : 0);
        const strip = puck(THREE, geo, rrLoop(sw, 0.022, 0.012, 3, 2), segProfile(-hh + 0.022, top, 0.008), ox, d - 0.012);
        sg.add(ctx.mesh(strip, k ? pillarMat : columnMat, `neck.pillar.${key}.${i}.panel.${k}`));
      }
      const sidePlate = puck(THREE, geo, rrLoop(0.022, d * 0.72, 0.012, 3, 2), segProfile(-hh + 0.03, hh - 0.03, 0.007), (w - 0.012) * side, -0.012);
      sg.add(ctx.mesh(sidePlate, pillarMat, `neck.pillar.${key}.${i}.side`));
      const bandG = puck(THREE, geo, rrLoop(w + 0.008, d + 0.008, PIL.r, 6, 3), segProfile(hh - 0.11, hh - 0.08, 0.006), 0, 0);
      sg.add(ctx.mesh(bandG, bright, `neck.pillar.${key}.${i}.band`));
      // washer ring in the gap below the segment
      if (i > 0) {
        const wsh = puck(THREE, geo, rrLoop(w * 0.84, d * 0.84, PIL.r * 0.8, 4, 2), segProfile(y0 - yc - 0.02, y0 - yc - 0.007, 0.004), 0, 0);
        sg.add(ctx.mesh(wsh, bright, `neck.pillar.${key}.${i}.washer`));
      }
      pg.add(sg);
      sg.userData.base = sg.position.clone();
      pillars[key].push(sg);
    });
  }

  // ----------------------------------------------------------------- pistons
  // barrels ride the neck joint, rods are aimed at anchors inside the head.
  const pistons = [];
  const makePiston = (side, i, bottom, top, rBarrel, barrelLen, rodLen) => {
    const key = side > 0 ? 'L' : 'R';
    const g = new THREE.Group();
    g.name = `neck.piston.${key}.${i}`;
    root.add(g);
    const barrelPivot = new THREE.Group();
    const barrel = puck(THREE, geo, seLoop(rBarrel, rBarrel, 2, 24), rodProfile(barrelLen, 0.008), 0, 0);
    const bm = ctx.mesh(barrel, pistonMat, `neck.piston.${key}.${i}.barrel`);
    barrelPivot.add(bm);
    const gland = puck(THREE, geo, seLoop(rBarrel * 1.18, rBarrel * 1.18, 2, 24), segProfile(-0.03, 0.0, 0.006), 0, 0);
    const gm = ctx.mesh(gland, bright, `neck.piston.${key}.${i}.gland`);
    barrelPivot.add(gm);
    const foot = puck(THREE, geo, seLoop(rBarrel * 1.3, rBarrel * 1.3, 2, 24), segProfile(-0.02, 0.05, 0.008), 0, 0);
    barrelPivot.add(ctx.mesh(foot, bright, `neck.piston.${key}.${i}.foot`));
    g.add(barrelPivot);
    const rodPivot = new THREE.Group();
    const rod = puck(THREE, geo, seLoop(rBarrel * 0.52, rBarrel * 0.52, 2, 20), segProfile(-rodLen, 0.02, 0.006), 0, 0);
    rodPivot.add(ctx.mesh(rod, bright, `neck.piston.${key}.${i}.rod`));
    g.add(rodPivot);
    const topAnchor = new THREE.Object3D();
    topAnchor.position.fromArray(top);
    headRoot.add(topAnchor);
    pistons.push({ bottom: new THREE.Vector3().fromArray(bottom), topAnchor, barrelPivot, rodPivot, barrelMesh: bm, glandMesh: gm, barrelLen });
  };
  for (const side of [1, -1]) {
    // front pair: in the dark gap between the column and the pillar
    makePiston(side, 0, [0.205 * side, 0.1, 0.25], [0.2 * side, 1.12, 0.25], 0.03, 0.5, 0.72);
    // back pair: behind the pillars, from the collar up behind the cheek discs
    makePiston(side, 1, [0.33 * side, 0.5, -0.29], [0.3 * side, 1.62, -0.25], 0.042, 0.55, 0.8);
  }

  // ------------------------------------------------------------------ cables
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    for (let c = 0; c < 3; c++) {
      const dz = -0.06 * c;
      const pts = [
        [0.4 * side, 1.62, -0.1 + dz],
        [0.49 * side, 1.25, -0.13 + dz],
        [0.51 * side, 0.9, -0.16 + dz],
        [0.47 * side, 0.45, -0.2 + dz],
      ].map((p) => new THREE.Vector3(...p));
      const g = geo.sweptSection(new THREE.CatmullRomCurve3(pts), geo.roundedSection(0.024, 0.024, 2.2, 12), { steps: 40 });
      root.add(ctx.mesh(g, c === 1 ? pistonMat : cableMat, `neck.cable.${key}.${c}`));
    }
  }

  // -------------------------------------------------------------- nape plates
  const napeRows = [[0.55, 0.78], [0.8, 1.03], [1.05, 1.28], [1.3, 1.53], [1.55, 1.76]];
  napeRows.forEach(([y0, y1], r) => {
    const spans = [['L', 1.55, 2.45], ['C', 2.45, TAU - 2.45], ['R', -2.45, -1.55]];
    for (const [tag, u0, u1] of spans) {
      const g = geo.shellPatch({
        ...CS, u0, u1, y0, y1, offset: 0.028 + (r % 2) * 0.006, thickness: 0.05, bevel: 0.014, gap: 0.012, segU: 16, segV: 8,
      });
      const m = ctx.mesh(g, tag === 'C' ? napeMat : pillarAlt, `neck.nape.${r}.${tag}`);
      root.add(m);
      const um = (u0 + u1) / 2;
      addSwell(m, new THREE.Vector3(Math.sin(um), 0, Math.cos(um)), 0.012);
    }
  });
  // vertebrae along the back centre
  for (let i = 0; i < 6; i++) {
    const y0 = 0.62 + i * 0.19;
    const p = coreSurf.surface(Math.PI, y0 + 0.08, new THREE.Vector3());
    const v = puck(THREE, geo, seLoop(0.06, 0.05, 3, 24), segProfile(y0, y0 + 0.15, 0.015), 0, p.z - 0.07);
    root.add(ctx.mesh(v, bright, `neck.spine.${i}`));
  }

  // ------------------------------------------------ base gasket (chest joint)
  {
    // smooth dark sleeve with two thin retaining rings
    const prof = [
      [0.85, 0, -0.04], [1, 0, -0.03], [1, 0, 0.1], [1, 0.012, 0.11], [1, 0.012, 0.13], [1, 0, 0.14],
      [1, 0, 0.24], [1, 0.01, 0.25], [1, 0.01, 0.265], [1, 0, 0.275], [1, -0.01, 0.36], [0.85, -0.01, 0.37],
    ];
    const base = puck(THREE, geo, seLoop(0.47, 0.37, 2.5, 64), prof, 0, -0.045, 50);
    chestRoot.add(ctx.mesh(base, coreMat, 'neck.base'));
  }

  // ------------------------------------------------------------------- bulk
  // Muscular neck: widen everything radially about the neck axis, most at the
  // base where it flares into the trapezius, a little less under the jaw.
  // Applied to the finished geometry (BODY space), so every plate above keeps
  // its layout. Pistons are re-aimed live, so their anchors move instead.
  const AXZ = -0.05;
  const bulk = (y) => {
    const t = THREE.MathUtils.smoothstep(y, 0.05, 1.45);
    return { sx: THREE.MathUtils.lerp(1.62, 1.3, t), sz: THREE.MathUtils.lerp(1.34, 1.16, t) };
  };
  const bulkPoint = (v) => {
    const { sx, sz } = bulk(v.y);
    return v.set(v.x * sx, v.y, AXZ + (v.z - AXZ) * sz);
  };
  {
    const isPiston = (o) => { for (let q = o; q; q = q.parent) if (q.name && q.name.startsWith('neck.piston')) return true; return false; };
    const P = new THREE.Vector3(), N = new THREE.Vector3(), Q = new THREE.Vector3();
    const done = new Set();
    for (const space of [root, chestRoot]) {
      space.updateWorldMatrix(true, true);
      const inv = space.matrixWorld.clone().invert();
      space.traverse((o) => {
        if (!o.isMesh || done.has(o.geometry) || isPiston(o)) return;
        done.add(o.geometry);
        const toS = inv.clone().multiply(o.matrixWorld);
        const fromS = toS.clone().invert();
        const nIn = new THREE.Matrix3().getNormalMatrix(toS);
        const nOut = new THREE.Matrix3().getNormalMatrix(fromS);
        const pos = o.geometry.attributes.position;
        const nrm = o.geometry.attributes.normal;
        for (let i = 0; i < pos.count; i++) {
          P.fromBufferAttribute(pos, i).applyMatrix4(toS);
          if (nrm) {
            const { sx, sz } = bulk(P.y);
            N.fromBufferAttribute(nrm, i).applyMatrix3(nIn);
            N.set(N.x / sx, N.y, N.z / sz).applyMatrix3(nOut).normalize();
            nrm.setXYZ(i, N.x, N.y, N.z);
          }
          bulkPoint(P).applyMatrix4(fromS);
          pos.setXYZ(i, P.x, P.y, P.z);
        }
        pos.needsUpdate = true;
        if (nrm) nrm.needsUpdate = true;
        o.geometry.computeBoundingSphere();
      });
    }
    for (const ps of pistons) {
      bulkPoint(ps.bottom);
      bulkPoint(Q.copy(ps.topAnchor.position));
      ps.topAnchor.position.copy(Q);
    }
  }

  // ----------------------------------------------------- muscle bundles (SCM)
  // Thick armoured "sternocleidomastoid" bands: from behind the jaw hinge,
  // diagonally down and forward to the sternal notch, three strands each,
  // thickest in the middle (muscle belly). Authored in the bulked space.
  const muscleMat = M.get('gunmetal', { panel: 5.5, seed: 99, lineWidth: 0.004, angle: 1.4 });
  const muscleTop = M.get('chrome', { roughness: 0.22, panel: 6, seed: 101, lineWidth: 0.0035, angle: 1.4 });
  const muscles = [];
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const grp = new THREE.Group();
    grp.name = `neck.muscle.${key}`;
    root.add(grp);
    const strands = [
      // [offset across (toward outside), offset out, half width, half thickness, material]
      [0.0, 0.0, 0.085, 0.06, muscleTop],
      [0.11, -0.03, 0.07, 0.05, muscleMat],
      [-0.1, -0.04, 0.055, 0.045, muscleMat],
    ];
    strands.forEach(([dx, dn, hw, ht, mat], k) => {
      const pts = [
        [0.54 * side + dx * side * 0.6, 1.52, -0.08 + dn],
        [0.56 * side + dx * side, 1.12, 0.1 + dn],
        [0.44 * side + dx * side * 0.8, 0.66, 0.3 + dn],
        [0.24 * side + dx * side * 0.5, 0.3, 0.44 + dn],
        [0.1 * side + dx * side * 0.3, 0.12, 0.5 + dn],
      ].map((q) => new THREE.Vector3(...q));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const g = geo.sweptSection(curve, geo.roundedSection(hw, ht, 3.2, 26), {
        steps: 64,
        // flat side faces outward from the neck axis
        up: (t) => {
          const q = curve.getPointAt(t);
          return new THREE.Vector3(q.x, 0, q.z - AXZ).normalize();
        },
        scale: (t) => {
          const belly = 0.55 + 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.15));
          return [belly, 0.7 + 0.45 * Math.sin(Math.PI * t)];
        },
      });
      grp.add(ctx.mesh(g, mat, `neck.muscle.${key}.${k}`));
    });
    muscles.push(grp);
  }

  // ------------------------------------------------------------------- params
  const params = { breathe: 0, pistons: 0.3, tension: 0, idle: 1 };
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const D = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  const aimPistons = (p) => {
    headRoot.updateWorldMatrix(true, false);
    root.updateWorldMatrix(true, false);
    const ext = THREE.MathUtils.clamp(p.pistons, 0, 1);
    for (const ps of pistons) {
      A.copy(ps.bottom);
      ps.topAnchor.updateMatrixWorld();
      ps.topAnchor.getWorldPosition(B);
      root.worldToLocal(B);
      D.subVectors(B, A);
      const len = D.length();
      if (len < 1e-5) continue;
      D.multiplyScalar(1 / len);
      ps.barrelPivot.position.copy(A);
      ps.barrelPivot.quaternion.setFromUnitVectors(UP, D);
      ps.rodPivot.position.copy(B);
      ps.rodPivot.quaternion.setFromUnitVectors(UP, D);
      // extension: barrel retracts (shorter), gland follows its top
      const k = 1 - 0.35 * ext;
      ps.barrelMesh.scale.set(1, k, 1);
      ps.glandMesh.position.y = ps.barrelLen * k;
    }
  };

  const pose = (p, breath) => {
    const b = THREE.MathUtils.clamp(p.breathe + breath, -0.5, 1.5);
    for (const s of swell) s.obj.position.copy(s.base).addScaledVector(s.dir, s.amp * b);
    const t = THREE.MathUtils.clamp(p.tension, 0, 1);
    for (const key of ['L', 'R']) {
      const side = key === 'L' ? 1 : -1;
      pillars[key].forEach((sg, i) => {
        const bulge = 1 + t * 0.07 * Math.sin(((i + 0.5) / pillarSegs.length) * Math.PI) + b * 0.012;
        sg.scale.set(bulge, 1 - t * 0.04, bulge);
        sg.position.copy(sg.userData.base);
        sg.position.x -= side * t * 0.018;
        sg.position.y = sg.userData.base.y * (1 - t * 0.04);
      });
    }
    // muscles flex with tension / breathing
    for (const m of muscles) {
      const k = 1 + t * 0.08 + b * 0.015;
      m.scale.set(k, 1, k);
    }
    aimPistons(p);
  };

  return {
    params,
    paramSpec: {
      breathe: { min: 0, max: 1, step: 0.01 },
      pistons: { min: 0, max: 1, step: 0.01 },
      tension: { min: 0, max: 1, step: 0.01 },
      idle: { min: 0, max: 1, step: 0.01 },
    },
    apply(p) {
      pose(p, 0);
    },
    update(time, dt, p) {
      pose(p, p.idle * 0.3 * Math.sin(time * 0.9));
    },
  };
}
