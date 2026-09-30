/**
 * PART: collar — trapezius / shoulder armour, clavicles, sternum and the top of
 * the chest. The bust is cut just below the collarbones (body y ~ -0.62).
 * Joint: chest. Authoring space: BODY.
 *
 * Sub-meshes (L = model's left, +X):
 *   collar.core                 dark under-body (open in front of the neck)
 *   collar.base                 flat cap closing the bottom cut
 *   collar.trapezius.<L|R>.<i>  layered trapezius lames sweeping from the neck
 *                               out and down to the shoulders; .lip = thick
 *                               rolled front edge
 *   collar.recess.<L|R>         dark supraclavicular recess between neck,
 *                               trapezius and clavicle
 *   collar.actuator.<L|R>.<i>   big horizontal ribbed cylinders inside the recess
 *                               (.bellows / .rod / .cap)
 *   collar.clavicle.<L|R>       collarbone bars
 *   collar.pec.<L|R>.<i>        upper chest plates (end cleanly at the cut)
 *   collar.deltoid.<L|R>.<i>    layered shoulder caps
 *   collar.back.<L|R>.<i>       upper back plates
 *   collar.sternum              centre plate with the sternal notch
 *
 * Params
 *   breathe  0..1   chest plates lift / spread (breathing; idle-modulated)
 *   shrug    -1..1  trapezius + deltoid lames rise / drop
 *   actuate  0..1   recess actuators extend (rods slide, bellows stretch)
 *   idle     0..1   amount of built-in breathing motion in update()
 */
export const meta = {
  id: 'collar',
  explode: [0, -0.8, 0.2],
};

const TAU = Math.PI * 2;
const sgnPow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Local helpers (candidates for src/ultron/geometry.js)
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

/** Revolve a profile [[k, off, y], ...] around a superellipse loop (see neck.js). */
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

function segProfile(y0, y1, b) {
  const p = [[0, -b, y0], [1, -b, y0]];
  for (let i = 1; i < 4; i++) {
    const t = (i / 4) * Math.PI * 0.5;
    p.push([1, -b + b * Math.sin(t), y0 + b - b * Math.cos(t)]);
  }
  p.push([1, 0, y0 + b], [1, 0, y1 - b]);
  for (let i = 1; i < 4; i++) {
    const t = (i / 4) * Math.PI * 0.5;
    p.push([1, -b + b * Math.cos(t), y1 - b + b * Math.sin(t)]);
  }
  p.push([1, -b, y1], [0, -b, y1]);
  return p;
}

/** Single-sided grid sheet over (s, t) in [0,1]^2 with an optional keep(s,t) mask. */
function sheet(THREE, surface, segS, segT, keep = null, facing = null) {
  const pos = [];
  const uv = [];
  const P = new THREE.Vector3();
  for (let j = 0; j <= segT; j++) {
    for (let i = 0; i <= segS; i++) {
      surface(i / segS, j / segT, P);
      pos.push(P.x, P.y, P.z);
      uv.push(P.x, P.y);
    }
  }
  const W = segS + 1;
  const index = [];
  for (let j = 0; j < segT; j++) {
    for (let i = 0; i < segS; i++) {
      if (keep && !keep((i + 0.5) / segS, (j + 0.5) / segT)) continue;
      const a = j * W + i, b = a + 1, c = a + W + 1, d = a + W;
      index.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  if (facing) {
    // flip if the average normal disagrees with facing(point) -> expected outward dir
    let score = 0;
    const n = g.attributes.normal;
    const p = g.attributes.position;
    const Q = new THREE.Vector3();
    const Nv = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 7) {
      Q.fromBufferAttribute(p, i);
      Nv.fromBufferAttribute(n, i);
      score += Nv.dot(facing(Q));
    }
    if (score < 0) {
      for (let t = 0; t < index.length; t += 3) { const s = index[t + 1]; index[t + 1] = index[t + 2]; index[t + 2] = s; }
      g.setIndex(index);
      g.computeVertexNormals();
    }
  }
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------

export function build(ctx) {
  const { THREE, geo, materials: M } = ctx;
  const root = ctx.space('chest', 'body');

  // Torso: superellipse stack. The reference is very hunched: the shoulders
  // form a broad plateau at y ~ 1.05 whose thick front edge (the "band")
  // frames a deep trough above each clavicle; the neck rises out of the top.
  const torso = geo.profileSurface([
    { y: -0.7, w: 1.66, zf: 0.56, zb: 0.5, n: 3.0, zc: 0.02 },
    { y: -0.35, w: 1.76, zf: 0.6, zb: 0.53, n: 3.2, zc: 0.02 },
    { y: 0.0, w: 1.82, zf: 0.61, zb: 0.55, n: 3.3, zc: 0.01 },
    { y: 0.35, w: 1.84, zf: 0.6, zb: 0.56, n: 3.3, zc: 0.0 },
    { y: 0.62, w: 1.83, zf: 0.57, zb: 0.56, n: 3.2, zc: 0.0 },
    { y: 0.84, w: 1.78, zf: 0.55, zb: 0.55, n: 3.1, zc: -0.01 },
    { y: 0.97, w: 1.66, zf: 0.52, zb: 0.54, n: 3.0, zc: -0.02 },
    { y: 1.05, w: 1.44, zf: 0.46, zb: 0.52, n: 2.8, zc: -0.04 },
    { y: 1.1, w: 1.1, zf: 0.38, zb: 0.5, n: 2.6, zc: -0.07 },
    { y: 1.14, w: 0.86, zf: 0.3, zb: 0.48, n: 2.4, zc: -0.1 },
    { y: 1.18, w: 0.74, zf: 0.24, zb: 0.46, n: 2.2, zc: -0.12 },
  ]);
  const Y_BOT = -0.62;
  const Y_TOP = 1.18;

  const frontZ = (x, y) => {
    const s = torso.section(y);
    const r = Math.min(0.999, Math.abs(x) / s.w);
    return s.zc + s.zf * Math.pow(1 - Math.pow(r, s.n), 1 / s.n);
  };
  /** superellipse angle u (front half) for a given x at height y */
  const uAtX = (x, y) => {
    const s = torso.section(y);
    const r = Math.min(1, Math.abs(x) / s.w);
    return Math.sign(x) * Math.asin(Math.pow(r, s.n / 2));
  };
  const clavY = (x) => {
    const a = Math.abs(x);
    return 0.14 + 0.34 * smooth(0.12, 0.8, a) + 0.1 * smooth(0.8, 1.55, a);
  };
  // The band: front edge of the shoulder plateau, as a front-view (x, y)
  // path from the neck pillar out and down to the clavicle (LEFT side).
  const bandPath = new THREE.SplineCurve([
    [0.62, 1.15], [0.95, 1.105], [1.22, 1.05], [1.42, 0.96], [1.53, 0.82], [1.57, 0.66], [1.58, 0.56],
  ].map(([x, y]) => new THREE.Vector2(x, y)));
  const BAND = bandPath.getSpacedPoints(80);
  /** band x at height y (y decreases along the path) */
  const xBand = (y) => {
    if (y >= BAND[0].y) return BAND[0].x;
    for (let i = 1; i < BAND.length; i++) {
      if (y >= BAND[i].y) return lerp(BAND[i - 1].x, BAND[i].x, (y - BAND[i - 1].y) / (BAND[i].y - BAND[i - 1].y || 1));
    }
    return BAND[BAND.length - 1].x;
  };
  // trapezius front edge as a torso angle (left side, positive)
  const uF = (y) => Math.abs(uAtX(xBand(Math.min(y, Y_TOP)), y));
  // top of the armour ring: highest at the neck sides, dipping toward the back
  const yTop = (u) => Y_TOP - 0.3 * smooth(1.45, Math.PI, Math.abs(u));

  // materials
  const coreMat = M.get('darkMetal');
  const cavity = M.get('cavity');
  const trapMat = M.get('chrome', { panel: 2.6, seed: 81, lineWidth: 0.005, roughness: 0.27 });
  const trapAlt = M.get('gunmetal', { panel: 2.6, seed: 82, lineWidth: 0.005 });
  const pecMat = M.get('gunmetal', { panel: 1.5, seed: 83, lineWidth: 0.004, lineDepth: 0.7 });
  const pecAlt = M.get('chrome', { panel: 1.7, seed: 84, lineWidth: 0.004, lineDepth: 0.7, roughness: 0.3 });
  const bright = M.get('chrome', { roughness: 0.18 });
  const mechMat = M.get('gunmetal', { roughness: 0.42 });
  const deepMat = M.get('darkMetal', { roughness: 0.55, color: 0x1c1d20 });

  // animated pieces
  const lifts = []; // { obj, base, dir, amp, kind }
  const addLift = (obj, dir, amp, kind) => {
    lifts.push({ obj, base: obj.position.clone(), dir: dir.clone().normalize(), amp, kind });
  };
  // remapped patch over (s, t) in [0,1]^2 -> torso (u, y)
  const remap = (fn) => ({
    surface: (s, t, target) => { const [u, y] = fn(s, t); return torso.surface(u, y, target); },
    normal: (s, t, target) => { const [u, y] = fn(s, t); return torso.normal(u, y, target); },
  });
  const plate = (fn, name, mat, o = {}) => {
    const g = geo.shellPatch({
      ...remap(fn), u0: 0, u1: 1, y0: 0, y1: 1,
      offset: 0, thickness: 0.06, bevel: 0.02, gap: 0.012, segU: 24, segV: 14, ...o,
    });
    const m = ctx.mesh(g, mat, name);
    root.add(m);
    return m;
  };
  const avgDir = (fn) => {
    const [u, y] = fn(0.5, 0.5);
    return torso.normal(u, y, new THREE.Vector3());
  };

  // ------------------------------------------------------------------ core
  // The front zone (in front of the neck, above the clavicles, ahead of the
  // trapezius edge) stays open: the neck and the recesses live there.
  {
    const P = new THREE.Vector3();
    const N = new THREE.Vector3();
    const map = (s, t) => {
      const u = lerp(-Math.PI, Math.PI, s);
      return [u, lerp(Y_BOT - 0.03, yTop(u) - 0.02, t)];
    };
    const coreSurf = (s, t, target) => {
      const [u, y] = map(s, t);
      torso.surface(u, y, target);
      return target.addScaledVector(torso.normal(u, y, N), -0.03);
    };
    const keep = (s, t) => {
      const [u, y] = map(s, t);
      const x = torso.surface(u, y, P).x;
      const inFront = Math.abs(u) < uF(y) - 0.04;
      return !(inFront && y > clavY(x) - 0.03);
    };
    const g = sheet(THREE, coreSurf, 144, 48, keep, (q) => new THREE.Vector3(q.x, 0, q.z));
    root.add(ctx.mesh(g, coreMat, 'collar.core'));

    // flat bottom cap closing the cut
    const sec = torso.section(Y_BOT - 0.03);
    const shape = new THREE.Shape();
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * TAU;
      const e = 2 / sec.n;
      const x = sec.w * sgnPow(Math.sin(a), e);
      const z = sec.zc + (Math.cos(a) >= 0 ? sec.zf : sec.zb) * sgnPow(Math.cos(a), e);
      if (i === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z);
    }
    const cap = new THREE.ShapeGeometry(shape, 1);
    cap.rotateX(Math.PI / 2); // (x, -z) in XY -> XZ plane facing -Y
    cap.translate(0, Y_BOT - 0.03, 0);
    root.add(ctx.mesh(cap, cavity, 'collar.base'));
  }

  // -------------------------------------------------------------- trapezius
  const bandCurves = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const U = (u) => u * side;
    // lames: lower one wraps round to the back, upper one caps the neck side;
    // both tops follow yTop(u) so the plateau slopes down toward the spine.
    const lames = [
      { y0: 0.8, y1: 1.07, b: 2.5, off: 0.045, mat: trapAlt, inset: 0.1 },
      { y0: 1.0, y1: Y_TOP, b: 2.05, off: 0.068, mat: trapMat, inset: 0.0 },
    ];
    lames.forEach((l, i) => {
      const fn = (s, t) => {
        const ss = side > 0 ? s : 1 - s;
        const uApprox = lerp(uF(l.y0), l.b, ss);
        const top = Math.min(l.y1, yTop(uApprox) - l.inset);
        const bot = Math.min(l.y0, top - 0.12);
        const y = lerp(bot, top, t);
        return [U(lerp(uF(y) + 0.01, l.b, ss)), y];
      };
      const m = plate(fn, `collar.trapezius.${key}.${i}`, l.mat, { offset: l.off, thickness: 0.07, bevel: 0.024, segU: 30, segV: 12 });
      addLift(m, new THREE.Vector3(0.25 * side, 1, -0.1), 0.03 + 0.02 * i, 'shrug');
      addLift(m, avgDir(fn), 0.012, 'breathe');
    });
    // back lame: its top dips toward the spine so the nape shows
    {
      const fn = (s, t) => {
        const u = lerp(2.2, Math.PI - 0.035, side > 0 ? s : 1 - s);
        return [U(u), lerp(0.46, yTop(u) - 0.02, t)];
      };
      const m = plate(fn, `collar.trapezius.${key}.2`, trapMat, { offset: 0.03, thickness: 0.07, bevel: 0.024, segU: 22, segV: 14 });
      addLift(m, new THREE.Vector3(0.1 * side, 1, -0.2), 0.02, 'shrug');
      addLift(m, avgDir(fn), 0.012, 'breathe');
    }

    // The band: thick rolled front edge of the shoulder plateau, facing
    // forward (the big lit shoulder plate of the reference).
    const pts = [];
    const P = new THREE.Vector3();
    const N = new THREE.Vector3();
    for (let k = 0; k < BAND.length; k += 4) {
      const { x, y } = BAND[k];
      const u = uAtX(x, y) * side;
      torso.surface(u, y, P);
      torso.normal(u, y, N);
      pts.push(P.clone().addScaledVector(N, 0.05).add(new THREE.Vector3(0, -0.045, 0.035)));
    }
    const bandCurve = new THREE.CatmullRomCurve3(pts);
    bandCurves[key] = bandCurve;
    const lip = geo.sweptSection(bandCurve, geo.roundedSection(0.105, 0.034, 5, 32), {
      steps: 90,
      up: new THREE.Vector3(0, 0.3, 1).normalize(),
      scale: (t) => [0.6 + 0.5 * Math.sin(Math.PI * Math.min(1, 0.08 + t * 1.02)), 1 - 0.2 * t],
    });
    const lm = ctx.mesh(lip, trapMat, `collar.trapezius.${key}.band`);
    root.add(lm);
    addLift(lm, new THREE.Vector3(0.25 * side, 1, -0.1), 0.05, 'shrug');
  }

  // ---------------------------------------------------------- clavicle line
  const clavPts = (side) => {
    const out = [];
    for (let k = 0; k <= 12; k++) {
      const x = lerp(0.15, 1.68, k / 12);
      const y = clavY(x);
      out.push(new THREE.Vector3(x * side, y, frontZ(x, y) + 0.03 - 0.1 * smooth(1.4, 1.7, x)));
    }
    return out;
  };

  // ------------------------------------------------ recess (supraclavicular)
  const recess = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const clav = new THREE.CatmullRomCurve3(clavPts(side));
    const band = bandCurves[key];
    const Uedge = (s, target) => {
      band.getPointAt(lerp(0.02, 0.97, s), target);
      target.z -= 0.09;
      target.y -= 0.04;
      return target;
    };
    const Ledge = (s, target) => {
      const x = lerp(0.54, 1.56, s);
      clav.getPointAt(clamp01((x - 0.15) / 1.53), target);
      target.z -= 0.06;
      target.y += 0.03;
      return target;
    };
    const A = new THREE.Vector3();
    const B = new THREE.Vector3();
    const floor = (s, t, target) => {
      Uedge(s, A);
      Ledge(s, B);
      target.lerpVectors(A, B, t);
      const depth = 0.32 * Math.sin(Math.PI * t) * Math.pow(Math.sin(Math.PI * (0.06 + s * 0.9)), 0.5);
      target.x -= side * depth * 0.25;
      target.z -= depth;
      return target;
    };
    const g = sheet(THREE, floor, 30, 18, null, () => new THREE.Vector3(0.3 * side, 0.3, 1));
    root.add(ctx.mesh(g, deepMat, `collar.recess.${key}`));
    recess[key] = { floor };
  }

  // ------------------------------------------------------------ actuators
  const actuators = [];
  {
    const Q = new THREE.Vector3();
    const R = new THREE.Vector3();
    const n0 = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    for (const side of [1, -1]) {
      const key = side > 0 ? 'L' : 'R';
      const { floor } = recess[key];
      // struts spanning the whole trough: barrel mounted next to the neck
      // pillar, rod mounted under the band's outer end.
      const specs = [
        { t: 0.32, r: 0.058, back: 0.05 },
        { t: 0.62, r: 0.05, back: 0.07 },
      ];
      specs.forEach((sp, i) => {
        const a = floor(0.0, sp.t, new THREE.Vector3());
        const b = floor(1.0, sp.t, new THREE.Vector3());
        floor(0.5, sp.t, Q);
        const ds = floor(0.52, sp.t, R).clone().sub(Q);
        const dt = floor(0.5, sp.t + 0.02, R).clone().sub(Q);
        n0.crossVectors(ds, dt).normalize();
        if (n0.z < 0) n0.negate();
        a.z -= sp.back;
        b.z -= sp.back * 0.6;
        const dir = b.clone().sub(a);
        const len = dir.length();
        dir.normalize();
        const g = new THREE.Group();
        g.name = `collar.actuator.${key}.${i}`;
        g.position.copy(a);
        g.quaternion.setFromUnitVectors(Y, dir);
        root.add(g);
        // barrel with a few low bands, local +Y along the strut
        const bl = len * 0.58;
        const prof = [[0, -0.01, 0.0], [1, -0.012, 0.0], [1, 0, 0.012]];
        const bands = 4;
        for (let k = 1; k <= bands; k++) {
          const yb = bl * (0.15 + (0.8 * k) / (bands + 1));
          prof.push([1, 0, yb - 0.02], [1, 0.007, yb - 0.012], [1, 0.007, yb + 0.012], [1, 0, yb + 0.02]);
        }
        prof.push([1, 0, bl - 0.012], [1, -0.012, bl], [0, -0.012, bl]);
        const barrel = puck(THREE, geo, seLoop(sp.r, sp.r, 2, 28), prof, 0, 0, 50);
        const bm = ctx.mesh(barrel, deepMat, `collar.actuator.${key}.${i}.barrel`);
        g.add(bm);
        const cap0 = puck(THREE, geo, seLoop(sp.r * 1.25, sp.r * 1.25, 2, 28), segProfile(-0.05, 0.05, 0.014), 0, 0);
        g.add(ctx.mesh(cap0, mechMat, `collar.actuator.${key}.${i}.mount`));
        // rod: fixed to the outer mount, slides inside the barrel
        const rodLen = len * 0.62;
        const rod = puck(THREE, geo, seLoop(sp.r * 0.46, sp.r * 0.46, 2, 20), segProfile(len - rodLen, len, 0.008), 0, 0);
        g.add(ctx.mesh(rod, mechMat, `collar.actuator.${key}.${i}.rod`));
        const cap1 = puck(THREE, geo, seLoop(sp.r * 1.1, sp.r * 1.1, 2, 28), segProfile(len - 0.07, len + 0.05, 0.016), 0, 0);
        g.add(ctx.mesh(cap1, mechMat, `collar.actuator.${key}.${i}.end`));
        // gland ring riding on the barrel mouth
        const gland = puck(THREE, geo, seLoop(sp.r * 1.08, sp.r * 1.08, 2, 28), segProfile(-0.035, 0.0, 0.008), 0, 0);
        const glm = ctx.mesh(gland, bright, `collar.actuator.${key}.${i}.gland`);
        g.add(glm);
        actuators.push({ barrel: bm, gland: glm, bl });
      });
      // ribs across the trough floor
      const P = new THREE.Vector3();
      const N2 = new THREE.Vector3();
      for (let k = 0; k < 6; k++) {
        const sk = 0.12 + k * 0.15;
        const pts = [];
        for (let j = 0; j <= 10; j++) {
          const tj = lerp(0.06, 0.94, j / 10);
          floor(sk, tj, P);
          const pa = floor(sk + 0.01, tj, new THREE.Vector3()).sub(P);
          const pb = floor(sk, tj + 0.01, new THREE.Vector3()).sub(P);
          N2.crossVectors(pa, pb).normalize();
          if (N2.z < 0) N2.negate();
          pts.push(P.clone().addScaledVector(N2, 0.012));
        }
        const rib = geo.sweptSection(new THREE.CatmullRomCurve3(pts), geo.roundedSection(0.011, 0.016, 3, 10), { steps: 24 });
        root.add(ctx.mesh(rib, deepMat, `collar.recess.${key}.rib.${k}`));
      }
    }
  }

  // ------------------------------------------------------- clavicle bars
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const curve = new THREE.CatmullRomCurve3(clavPts(side));
    const bar = geo.sweptSection(curve, geo.roundedSection(0.075, 0.036, 4, 24), {
      steps: 70,
      up: new THREE.Vector3(0, 1, 0.3).normalize(),
      scale: (t) => [0.8 + 0.3 * Math.sin(Math.PI * t), 1 - 0.2 * t],
    });
    const m = ctx.mesh(bar, pecAlt, `collar.clavicle.${key}`);
    root.add(m);
    addLift(m, new THREE.Vector3(0, 0.3, 1), 0.02, 'breathe');
  }

  // -------------------------------------------------------- chest plates
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    // pec lames: horizontal bands that follow the clavicle V (chevrons
    // pointing at the sternum), upper lames overlapping the lower ones.
    const pecs = [
      { x0: 0.13, x1: 0.72, a: 0.05, b: 0.3, off: 0.032, mat: pecAlt },
      { x0: 0.72, x1: 1.36, a: 0.05, b: 0.3, off: 0.032, mat: pecAlt },
      { x0: 0.13, x1: 0.52, a: 0.26, b: 0.56, off: 0.016, mat: pecMat },
      { x0: 0.52, x1: 0.98, a: 0.26, b: 0.56, off: 0.016, mat: pecMat },
      { x0: 0.98, x1: 1.38, a: 0.26, b: 0.56, off: 0.016, mat: pecMat },
      { x0: 0.13, x1: 0.8, a: 0.52, b: null, off: 0.0, mat: pecMat },
      { x0: 0.8, x1: 1.38, a: 0.52, b: null, off: 0.0, mat: pecAlt },
    ];
    pecs.forEach((pc, i) => {
      const fn = (s, t) => {
        const x = lerp(pc.x0, pc.x1, side > 0 ? s : 1 - s) * side;
        const c = clavY(x);
        const hi = c - pc.a;
        const lo = pc.b === null ? Y_BOT : Math.max(Y_BOT, c - pc.b);
        const y = lerp(lo, hi, t);
        return [uAtX(x, y), y];
      };
      const m = plate(fn, `collar.pec.${key}.${i}`, pc.mat, { offset: pc.off, segU: 22, segV: 10 });
      addLift(m, avgDir(fn), 0.02 - 0.004 * Math.floor(i / 2), 'breathe');
    });
    // deltoid lames: upper overlaps lower
    const delts = [
      { y0: Y_BOT, y1: -0.14, off: 0.0, mat: pecMat },
      { y0: -0.2, y1: 0.4, off: 0.015, mat: pecAlt },
      { y0: 0.34, y1: 0.9, off: 0.03, mat: trapMat },
    ];
    delts.forEach((d, i) => {
      const fn = (s, t) => {
        const y = lerp(d.y0, d.y1, t);
        const x0 = lerp(1.32, xBand(y) + 0.02, smooth(0.5, 0.72, y));
        const ua = Math.abs(uAtX(x0, y));
        return [lerp(ua, 2.1, side > 0 ? s : 1 - s) * side, y];
      };
      const m = plate(fn, `collar.deltoid.${key}.${i}`, d.mat, { offset: d.off, thickness: 0.07, segU: 26, segV: 12 });
      addLift(m, avgDir(fn), 0.015, 'breathe');
      addLift(m, new THREE.Vector3(0.2 * side, 1, 0), 0.015 * i, 'shrug');
    });
    // upper back
    const backs = [
      { y0: Y_BOT, y1: -0.06, off: 0.0, mat: pecMat },
      { y0: -0.1, y1: 0.48, off: 0.018, mat: trapAlt },
    ];
    backs.forEach((b, i) => {
      const fn = (s, t) => [lerp(2.1, Math.PI - 0.03, side > 0 ? s : 1 - s) * side, lerp(b.y0, b.y1, t)];
      const m = plate(fn, `collar.back.${key}.${i}`, b.mat, { offset: b.off, segU: 20, segV: 12 });
      addLift(m, avgDir(fn), 0.012, 'breathe');
    });
  }

  // ------------------------------------------------------------ sternum
  {
    const fn = (s, t) => {
      const x = lerp(-0.13, 0.13, s);
      const top = 0.02 + 0.9 * Math.abs(x);
      const y = lerp(Y_BOT, top, t);
      return [uAtX(x, y), y];
    };
    const m = plate(fn, 'collar.sternum', bright, { offset: 0.05, thickness: 0.08, segU: 10, segV: 20 });
    addLift(m, new THREE.Vector3(0, 0, 1), 0.02, 'breathe');
  }

  // --------------------------------------------------------------- params
  // objects that got several lifts share one rest position
  const seen = new Map();
  for (const l of lifts) {
    if (seen.has(l.obj)) l.base = seen.get(l.obj);
    else seen.set(l.obj, l.base);
  }
  const params = { breathe: 0, shrug: 0, actuate: 0.3, idle: 1 };
  const pose = (p, breath) => {
    const b = p.breathe + breath;
    for (const l of lifts) l.obj.position.copy(l.base);
    for (const l of lifts) l.obj.position.addScaledVector(l.dir, l.amp * (l.kind === 'breathe' ? b : p.shrug));
    const a = clamp01(p.actuate);
    for (const ac of actuators) {
      const s = 0.85 + 0.25 * a;
      ac.barrel.scale.set(1, s, 1);
      ac.gland.position.y = ac.bl * s;
    }
  };

  return {
    params,
    paramSpec: {
      breathe: { min: 0, max: 1, step: 0.01 },
      shrug: { min: -1, max: 1, step: 0.01 },
      actuate: { min: 0, max: 1, step: 0.01 },
      idle: { min: 0, max: 1, step: 0.01 },
    },
    apply(p) {
      pose(p, 0);
    },
    update(time, dt, p) {
      pose(p, p.idle * 0.5 * Math.sin(time * 0.9));
    },
  };
}
