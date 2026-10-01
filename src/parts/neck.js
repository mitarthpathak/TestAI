/**
 * PART: neck — the film Ultron's massive organic-mechanical neck.
 * Authoring space: BODY (see anatomy.js). Pieces are split between joints so
 * nothing tears when the rig moves:
 *   NECK joint  lower throat plates, lower pillar segments, nape, pistons' barrels
 *   HEAD joint  upper throat plates + under-chin chevron, pillar top sleeves,
 *               upper nape, the dark socket that rises into the skull, and the
 *               piston top anchors (pistons re-aim live between the two)
 *   CHEST joint base gasket that hides the neck/collar seam
 *
 * Sub-meshes (L = model's left, +X):
 *   neck.core / neck.socket        dark inner body (neck joint / head joint)
 *   neck.throat.<i>                central segmented throat column (trachea
 *                                  rings): .plate .face .keel .ring
 *   neck.throat.tip                spike pointing into the sternal notch
 *   neck.chevron.<L|R>             under-chin plates wrapped on the socket (head joint)
 *   neck.wrap.<L|R>.<i>            long side plates between throat and pillars
 *   neck.pillar.<L|R>.<i>          thick SCM-like side pillars (stacked long
 *                                  armour segments, ribbed, dark gaps):
 *                                  .plate .strip.<k> .rib.<k> .band .collar
 *   neck.pillar.<L|R>.top          upper sleeve on the head joint (telescopes)
 *   neck.piston.<L|R>.<i>          telescoping pistons (.barrel .rod .gland .foot)
 *   neck.cable.<L|R>.<i>           cable bundles behind the pillars
 *   neck.nape.<i>.<L|C|R>          back-of-neck plates, neck.spine.<i> vertebrae
 *   neck.base                      chest-joint gasket
 *
 * Params
 *   breathe  0..1   plates swell outward
 *   pistons  0..1   piston extension
 *   tension  0..1   pillars bulge / strain, throat tightens
 *   swallow  0..1   throat rings ripple upward
 *   idle     0..1   built-in breathing amount
 */
export const meta = {
  id: 'neck',
  explode: [0, 0.1, 0.6],
};

const TAU = Math.PI * 2;
const sgnPow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Local geometry helpers (candidates for src/ultron/geometry.js)
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

/** Rounded-rectangle loop (half sizes w, d, corner radius r) in XZ. */
function rrLoop(w, d, r, cornerSeg = 5, edgeSeg = 2) {
  r = Math.min(r, w * 0.999, d * 0.999);
  const pts = [];
  const nrm = [];
  const edge = (x0, z0, x1, z1, nx, nz) => {
    for (let i = 0; i <= edgeSeg; i++) {
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
  edge(0, d, w - r, d, 0, 1);
  corner(w - r, d - r, H, 0);
  edge(w, d - r, w, -d + r, 1, 0);
  corner(w - r, -d + r, 0, -H);
  edge(w - r, -d, -w + r, -d, 0, -1);
  corner(-w + r, -d + r, -H, -2 * H);
  edge(-w, -d + r, -w, d - r, -1, 0);
  corner(-w + r, d - r, Math.PI, H);
  edge(-w + r, d, 0, d, 0, 1);
  pts.pop();
  nrm.pop();
  return { pts, nrm };
}

/** Revolve a profile [[k, off, y], ...] around a loop (k scales the loop, off pushes along its normal). */
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
function segProfile(y0, y1, b, bulge = 0) {
  const p = [[0, -b, y0], [1, -b, y0]];
  for (let i = 1; i < 4; i++) {
    const t = (i / 4) * Math.PI * 0.5;
    p.push([1, -b + b * Math.sin(t), y0 + b - b * Math.cos(t)]);
  }
  p.push([1, 0, y0 + b]);
  if (bulge) {
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      p.push([1, bulge * Math.sin(Math.PI * t), lerp(y0 + b, y1 - b, t)]);
    }
  }
  p.push([1, 0, y1 - b]);
  for (let i = 1; i < 4; i++) {
    const t = (i / 4) * Math.PI * 0.5;
    p.push([1, -b + b * Math.cos(t), y1 - b + b * Math.sin(t)]);
  }
  p.push([1, -b, y1], [0, -b, y1]);
  return p;
}

/**
 * Thick bevelled plate over an arbitrary parametric surface F(s, t) on
 * [0,1]^2. `out(p)` gives the expected outward direction (orients normals).
 */
function patch(THREE, geo, F, out, o = {}) {
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3();
  const h = 1e-3;
  const normal = (s, t, target) => {
    F(s + h, t, A); F(s - h, t, B); F(s, t + h, C); F(s, t - h, D);
    target.crossVectors(A.sub(B), C.sub(D)).normalize();
    F(s, t, A);
    if (target.dot(out(A)) < 0) target.negate();
    return target;
  };
  return geo.shellPatch({
    surface: F, normal, u0: 0, u1: 1, y0: 0, y1: 1,
    thickness: 0.05, bevel: 0.016, gap: 0.01, segU: 16, segV: 12, ...o,
  });
}

// ---------------------------------------------------------------------------

export function build(ctx) {
  const { THREE, geo, materials: M } = ctx;
  const root = ctx.space('neck', 'body');
  const headRoot = ctx.space('head', 'body');
  const chestRoot = ctx.space('chest', 'body');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // materials
  const coreMat = M.get('darkMetal');
  const deep = M.get('darkMetal', { roughness: 0.55, color: 0x1e2024 });
  const cavity = M.get('cavity');
  const plateMat = M.get('chrome', { panel: 2.4, seed: 91, lineWidth: 0.0035, roughness: 0.22 });
  const plateAlt = M.get('chrome', { panel: 2.4, seed: 92, lineWidth: 0.0035, roughness: 0.27 });
  const bright = M.get('chrome', { roughness: 0.16 });
  const pillarMat = M.get('chrome', { panel: 2.2, seed: 93, lineWidth: 0.0035, roughness: 0.2, angle: 1.5708 });
  const pillarAlt = M.get('chrome', { panel: 2.2, seed: 95, lineWidth: 0.0035, roughness: 0.26, angle: 1.5708 });
  const pistonMat = M.get('gunmetal', { roughness: 0.38 });
  const cableMat = M.get('cable');
  const napeMat = M.get('gunmetal', { panel: 3.6, seed: 97, lineWidth: 0.005 });

  const swell = []; // { obj, base, dir, amp }
  const addSwell = (obj, dir, amp) => swell.push({ obj, base: obj.position.clone(), dir: dir.clone().normalize(), amp });

  // ------------------------------------------------------------- dark core
  // neck joint: from the collar up to just under the jaw
  const coreSurf = geo.profileSurface([
    { y: 0.1, w: 0.56, zf: 0.34, zb: 0.5, n: 2.6, zc: -0.06 },
    { y: 0.5, w: 0.5, zf: 0.3, zb: 0.47, n: 2.5, zc: -0.07 },
    { y: 0.95, w: 0.47, zf: 0.3, zb: 0.45, n: 2.5, zc: -0.06 },
    { y: 1.35, w: 0.46, zf: 0.3, zb: 0.44, n: 2.5, zc: -0.06 },
  ]);
  root.add(ctx.mesh(geo.surfaceSheet({ ...coreSurf, u0: -Math.PI, u1: Math.PI, y0: 0.1, y1: 1.32, segU: 64, segV: 24 }), coreMat, 'neck.core'));
  // head joint: socket rising into the underside of the skull (overlaps the core)
  const sockSurf = geo.profileSurface([
    { y: 0.95, w: 0.43, zf: 0.28, zb: 0.42, n: 2.5, zc: -0.06 },
    { y: 1.3, w: 0.45, zf: 0.32, zb: 0.44, n: 2.5, zc: -0.08 },
    { y: 1.65, w: 0.42, zf: 0.3, zb: 0.42, n: 2.4, zc: -0.12 },
    { y: 1.9, w: 0.36, zf: 0.26, zb: 0.36, n: 2.3, zc: -0.14 },
  ]);
  headRoot.add(ctx.mesh(geo.surfaceSheet({ ...sockSurf, u0: -Math.PI, u1: Math.PI, y0: 0.95, y1: 1.88, segU: 64, segV: 18 }), coreMat, 'neck.socket'));

  // ------------------------------------------------------- throat column
  // centre line of the column: leans forward toward the chin
  const colZ = (y) => lerp(0.24, 0.43, THREE.MathUtils.smoothstep(y, 0.3, 1.08));
  const throat = [];
  const throatSegs = [
    // [y0, y1, halfWidth, halfDepth, onHead] — few long, calm plates
    [0.22, 0.62, 0.145, 0.092, false],
    [0.64, 0.86, 0.155, 0.098, false],
    [0.87, 1.05, 0.155, 0.096, true],
    [1.07, 1.16, 0.15, 0.09, true],
  ];
  // recessed dark trachea tube behind the plates
  root.add(ctx.mesh(puck(THREE, geo, seLoop(0.1, 0.075, 2.4, 28), segProfile(0.2, 1.0, 0.02), 0, 0.22), cavity, 'neck.throat.core'));
  headRoot.add(ctx.mesh(puck(THREE, geo, seLoop(0.1, 0.075, 2.4, 28), segProfile(0.85, 1.2, 0.02), 0, 0.36), cavity, 'neck.throat.coreTop'));
  throatSegs.forEach(([y0, y1, w, d, onHead], i) => {
    const yc = (y0 + y1) / 2;
    const g = new THREE.Group();
    g.name = `neck.throat.${i}`;
    g.position.set(0, yc, colZ(yc));
    g.rotation.x = 0.2; // follow the forward lean (top toward +Z)
    const hh = (y1 - y0) / 2;
    // main rounded ring plate (wraps round the sides, slightly crowned front)
    g.add(ctx.mesh(puck(THREE, geo, rrLoop(w, d, 0.05, 5, 3), segProfile(-hh, hh, 0.018, 0.006), 0, 0), plateMat, `neck.throat.${i}.plate`));
    // stepped front face + bright centre keel (the vertical centre line)
    g.add(ctx.mesh(puck(THREE, geo, rrLoop(w * 0.72, 0.022, 0.012, 3, 2), segProfile(-hh + 0.018, hh - 0.012, 0.008), 0, d - 0.008), plateMat, `neck.throat.${i}.face`));
    g.add(ctx.mesh(puck(THREE, geo, rrLoop(0.014, 0.018, 0.007, 3, 1), segProfile(-hh + 0.01, hh - 0.004, 0.005), 0, d + 0.016), bright, `neck.throat.${i}.keel`));
    // thin dark ring in the gap below
    g.add(ctx.mesh(puck(THREE, geo, rrLoop(w * 0.9, d * 0.88, 0.04, 4, 2), segProfile(-hh - 0.022, -hh + 0.004, 0.006), 0, -0.005), deep, `neck.throat.${i}.ring`));
    (onHead ? headRoot : root).add(g);
    throat.push({ g, base: g.position.clone(), i });
    addSwell(g, V(0, 0, 1), 0.01);
  });
  // tip: spike pointing down into the sternal notch
  {
    const prof = [[0, 0, 0.12], [0.15, 0, 0.13], [0.55, 0, 0.18], [1, -0.004, 0.25], [1, -0.012, 0.29], [0, -0.012, 0.29]];
    root.add(ctx.mesh(puck(THREE, geo, rrLoop(0.085, 0.06, 0.03, 4, 2), prof, 0, 0.27, 30), bright, 'neck.throat.tip'));
  }

  // ------------------------------------------- chevron + diagonal V lames
  // Flat lames in a plane tilted to the front of the neck. q(x, y) -> point.
  const frontPlaneZ = (x, y, base) => base + 0.02 - 0.22 * Math.pow(Math.abs(x) / 0.5, 2) + (y - 0.6) * 0.06;
  const vLame = (side, xa, ya, xb, yb, wid, base, name, mat, parent, thick = 0.05) => {
    // quad strip from inner-bottom (xa, ya) to outer-top (xb, yb), width `wid` (vertical)
    const F = (s, t, target) => {
      const x = lerp(xa, xb, s) * side;
      const y = lerp(ya, yb, s) + (t - 0.5) * wid;
      return target.set(x, y, frontPlaneZ(x, y, base));
    };
    const m = ctx.mesh(patch(THREE, geo, F, () => V(0, 0.2, 1), { thickness: thick, bevel: 0.014, segU: 14, segV: 5 }), mat, name);
    parent.add(m);
    addSwell(m, V(0.3 * side, 0, 1), 0.008);
    return m;
  };
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    // long vertical side plates between the throat column and the pillars;
    // the outer ends ride a little higher (soft V of the front ref)
    // under-chin: plates wrapped on the socket so they tuck in behind the
    // throat column and up under the jaw (no flat edge standing out)
    {
      const u0 = side > 0 ? 0.22 : -1.05, u1 = side > 0 ? 1.05 : -0.22;
      const g = geo.shellPatch({
        surface: sockSurf.surface, normal: sockSurf.normal, u0, u1, y0: 0.88, y1: 1.26,
        offset: 0.05, thickness: 0.055, bevel: 0.02, gap: 0.012, segU: 16, segV: 10,
      });
      const m = ctx.mesh(g, plateMat, `neck.chevron.${key}`);
      headRoot.add(m);
      addSwell(m, V(0.6 * side, 0, 0.8), 0.008);
    }
  }

  // ------------------------------------------- wrap plates (core sides)
  // layered plates on the dark core between the throat and the pillars
  [[0.26, 0.78], [0.8, 0.98]].forEach(([y0, y1], r) => {
    for (const side of [1, -1]) {
      const key = side > 0 ? 'L' : 'R';
      const u0 = side > 0 ? 0.24 : -1.15, u1 = side > 0 ? 1.15 : -0.24;
      const g = geo.shellPatch({
        surface: coreSurf.surface, normal: coreSurf.normal, u0, u1, y0, y1,
        offset: 0.04 + (r % 2) * 0.012, thickness: 0.05, bevel: 0.018, gap: 0.014, segU: 16, segV: 10,
      });
      const m = ctx.mesh(g, r % 2 ? pillarMat : plateMat, `neck.wrap.${key}.${r}`);
      root.add(m);
      addSwell(m, V(0.7 * side, 0, 0.7), 0.01);
    }
  });

  // --------------------------------------------------------- side pillars
  // Thick SCM-like pillars: from under the cheek rings (head y ~0.05,
  // x ~ +-0.6) down and slightly forward to the clavicles.
  const PIL = { top: [0.6, 1.36, 0.02], bot: [0.56, 0.1, 0.14], w: 0.19, d: 0.19 };
  const pillarGroups = { L: [], R: [] };
  const UP = V(0, 1, 0);
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const bot = V(PIL.bot[0] * side, PIL.bot[1], PIL.bot[2]);
    const top = V(PIL.top[0] * side, PIL.top[1], PIL.top[2]);
    const axis = top.clone().sub(bot);
    const L = axis.length();
    axis.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, axis);
    // [s0, s1] along the axis (0 = bottom), onHead
    const segs = [[0.0, 0.28, false], [0.3, 0.9, false], [0.87, 1.02, true]];
    // dark inner tube visible in the gaps
    const tube = new THREE.Group();
    tube.position.copy(bot);
    tube.quaternion.copy(q);
    tube.add(ctx.mesh(puck(THREE, geo, seLoop(PIL.w * 0.78, PIL.d * 0.78, 2.6, 32), segProfile(0, L * 0.92, 0.02), 0, 0), deep, `neck.pillar.${key}.core`));
    root.add(tube);
    segs.forEach(([s0, s1, onHead], i) => {
      const y0 = s0 * L, y1 = s1 * L, yc = (y0 + y1) / 2, hh = (y1 - y0) / 2;
      const name = onHead ? `neck.pillar.${key}.top` : `neck.pillar.${key}.${i}`;
      const holder = new THREE.Group();
      holder.position.copy(bot);
      holder.quaternion.copy(q);
      const sg = new THREE.Group();
      sg.name = name;
      sg.position.set(0, yc, 0);
      holder.add(sg);
      const taper = onHead ? 0.86 : 1 - i * 0.02;
      const w = PIL.w * taper, d = PIL.d * taper;
      sg.add(ctx.mesh(puck(THREE, geo, seLoop(w, d, 4, 44), segProfile(-hh, hh, onHead ? 0.07 : 0.026, onHead ? 0 : 0.014), 0, 0), i % 2 ? pillarMat : pillarAlt, `${name}.plate`));
      // vertical ribbing: two long front strips split by a dark groove, one on the outside
      const strips = [[-0.07, 0.062], [0.07, 0.062]];
      strips.forEach(([ox, sw], k) => {
        const lo = -hh + 0.03;
        sg.add(ctx.mesh(puck(THREE, geo, rrLoop(sw, 0.02, 0.012, 3, 2), segProfile(lo, hh - 0.03, 0.008), ox, d - 0.016), k ? pillarMat : bright, `${name}.strip.${k}`));
      });
      sg.add(ctx.mesh(puck(THREE, geo, rrLoop(0.022, d * 0.7, 0.012, 3, 2), segProfile(-hh + 0.04, hh - 0.04, 0.008), (w - 0.014) * side, -0.01), pillarMat, `${name}.rib.0`));
      // bright band near the top of the segment
      if (onHead) sg.add(ctx.mesh(puck(THREE, geo, seLoop(w + 0.008, d + 0.008, 2.7, 40), segProfile(-hh + 0.02, -hh + 0.05, 0.006), 0, 0), bright, `${name}.band`));
      // collar ring in the gap below the segment
      if (i > 0) sg.add(ctx.mesh(puck(THREE, geo, seLoop(w * 0.92, d * 0.92, 2.7, 32), segProfile(-hh - 0.03, -hh + 0.005, 0.006), 0, 0), plateMat, `${name}.collar`));
      (onHead ? headRoot : root).add(holder);
      sg.userData.base = sg.position.clone();
      sg.userData.i = i;
      pillarGroups[key].push(sg);
    });
  }

  // -------------------------------------------------------------- pistons
  const pistons = [];
  const makePiston = (side, i, bottom, top, r, barrelLen, rodLen) => {
    const key = side > 0 ? 'L' : 'R';
    const g = new THREE.Group();
    g.name = `neck.piston.${key}.${i}`;
    root.add(g);
    const barrelPivot = new THREE.Group();
    const bm = ctx.mesh(puck(THREE, geo, seLoop(r, r, 2, 20), segProfile(0, barrelLen, 0.008), 0, 0), pistonMat, `neck.piston.${key}.${i}.barrel`);
    barrelPivot.add(bm);
    const gm = ctx.mesh(puck(THREE, geo, seLoop(r * 1.2, r * 1.2, 2, 20), segProfile(-0.03, 0, 0.006), 0, 0), bright, `neck.piston.${key}.${i}.gland`);
    barrelPivot.add(gm);
    barrelPivot.add(ctx.mesh(puck(THREE, geo, seLoop(r * 1.35, r * 1.35, 2, 20), segProfile(-0.02, 0.05, 0.008), 0, 0), bright, `neck.piston.${key}.${i}.foot`));
    g.add(barrelPivot);
    const rodPivot = new THREE.Group();
    rodPivot.add(ctx.mesh(puck(THREE, geo, seLoop(r * 0.5, r * 0.5, 2, 16), segProfile(-rodLen, 0.02, 0.006), 0, 0), bright, `neck.piston.${key}.${i}.rod`));
    g.add(rodPivot);
    const topAnchor = new THREE.Object3D();
    topAnchor.position.fromArray(top);
    headRoot.add(topAnchor);
    pistons.push({ bottom: V(...bottom), topAnchor, barrelPivot, rodPivot, barrelMesh: bm, glandMesh: gm, barrelLen });
  };
  for (const side of [1, -1]) {
    // (front piston removed: the side plates now close the throat)
    makePiston(side, 1, [0.42 * side, 0.3, -0.36], [0.4 * side, 1.5, -0.32], 0.04, 0.55, 0.75);
  }

  // --------------------------------------------------------------- cables
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    for (let c = 0; c < 3; c++) {
      const dz = -0.07 * c;
      const pts = [
        [0.36 * side, 1.5, -0.16 + dz],
        [0.5 * side, 1.15, -0.16 + dz],
        [0.6 * side, 0.75, -0.16 + dz],
        [0.6 * side, 0.3, -0.18 + dz],
      ].map((p) => V(...p));
      const g = geo.sweptSection(new THREE.CatmullRomCurve3(pts), geo.roundedSection(0.026, 0.026, 2.2, 10), { steps: 30 });
      root.add(ctx.mesh(g, c === 1 ? pistonMat : cableMat, `neck.cable.${key}.${c}`));
    }
  }

  // ---------------------------------------------------------------- nape
  const napeRows = [[0.3, 0.52], [0.54, 0.76], [0.78, 1.0], [1.02, 1.24], [1.26, 1.48], [1.5, 1.72]];
  napeRows.forEach(([y0, y1], r) => {
    const onHead = y0 > 1.0;
    const surf = onHead ? sockSurf : coreSurf;
    const spans = [['L', 1.75, 2.55], ['C', 2.55, TAU - 2.55], ['R', -2.55, -1.75]];
    for (const [tag, u0, u1] of spans) {
      const g = geo.shellPatch({
        surface: surf.surface, normal: surf.normal, u0, u1, y0, y1,
        offset: 0.035 + (r % 2) * 0.008, thickness: 0.05, bevel: 0.016, gap: 0.014, segU: 12, segV: 8,
      });
      const m = ctx.mesh(g, tag === 'C' ? napeMat : plateAlt, `neck.nape.${r}.${tag}`);
      (onHead ? headRoot : root).add(m);
      const um = (u0 + u1) / 2;
      addSwell(m, V(Math.sin(um), 0, Math.cos(um)), 0.01);
    }
    // vertebra knuckle on the spine
    const p = surf.surface(Math.PI, (y0 + y1) / 2, new THREE.Vector3());
    const vtb = puck(THREE, geo, seLoop(0.065, 0.05, 3, 20), segProfile(y0 + 0.02, y1 - 0.02, 0.016, 0.01), 0, p.z - 0.07);
    (onHead ? headRoot : root).add(ctx.mesh(vtb, bright, `neck.spine.${r}`));
  });

  // ------------------------------------------------- base gasket (chest)
  {
    const prof = [
      [0.85, 0, -0.1], [1, 0, -0.09], [1, 0, 0.06], [1, 0.014, 0.07], [1, 0.014, 0.09], [1, 0, 0.1],
      [1, 0, 0.2], [1, -0.01, 0.3], [0.85, -0.01, 0.31],
    ];
    chestRoot.add(ctx.mesh(puck(THREE, geo, seLoop(0.6, 0.46, 2.6, 56), prof, 0, -0.06, 50), coreMat, 'neck.base'));
  }

  // --------------------------------------------------------------- params
  const params = { breathe: 0, pistons: 0.3, tension: 0, swallow: 0, idle: 1 };
  const A = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3();
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
      const k = 1 - 0.35 * ext;
      ps.barrelMesh.scale.set(1, k, 1);
      ps.glandMesh.position.y = ps.barrelLen * k;
    }
  };
  const pose = (p, breath, time = 0) => {
    const b = THREE.MathUtils.clamp(p.breathe + breath, -0.5, 1.5);
    for (const s of swell) s.obj.position.copy(s.base).addScaledVector(s.dir, s.amp * b);
    const t = THREE.MathUtils.clamp(p.tension, 0, 1);
    for (const key of ['L', 'R']) {
      for (const sg of pillarGroups[key]) {
        const bulge = 1 + t * 0.08 + b * 0.012;
        sg.scale.set(bulge, 1 - t * 0.03, bulge);
      }
    }
    // swallow: a ripple travelling up the throat
    const sw = THREE.MathUtils.clamp(p.swallow, 0, 1);
    for (const th of throat) {
      const wave = Math.max(0, Math.sin(Math.PI * (sw * 1.6 - th.i / throat.length * 0.6)));
      th.g.position.y += 0.025 * wave * sw;
      th.g.position.z += 0.012 * wave * sw;
      const sq = 1 - t * 0.05;
      th.g.scale.set(sq, 1, sq);
    }
    aimPistons(p);
  };

  return {
    params,
    paramSpec: {
      breathe: { min: 0, max: 1, step: 0.01 },
      pistons: { min: 0, max: 1, step: 0.01 },
      tension: { min: 0, max: 1, step: 0.01 },
      swallow: { min: 0, max: 1, step: 0.01 },
      idle: { min: 0, max: 1, step: 0.01 },
    },
    apply(p) {
      pose(p, 0);
    },
    update(time, dt, p) {
      pose(p, p.idle * 0.3 * Math.sin(time * 0.9), time);
    },
  };
}
