/**
 * PART: collar — the film Ultron's high, massive trapezius, rounded shoulder
 * armour, clavicle bars and the top of the chest. Joint: chest. Space: BODY.
 *
 * Measured from reference/ultron-front.png + the film frames: the trapezius
 * rises to about chin height beside the neck (body y ~1.1), slopes down and
 * out to big rounded shoulder caps (half-span ~1.9 = LANDMARKS.collarWidth),
 * with a deep dark ribbed recess in front of it above the clavicles.
 *
 * Sub-meshes (L = model's left, +X):
 *   collar.core                    dark under-body (open in front of the neck)
 *   collar.trapezius.<L|R>.<i>     long layered lames along the slope (0 back .. 2 front)
 *   collar.trapezius.<L|R>.under   dark under-body seen in the lame seams
 *   collar.trapezius.<L|R>.band    bright rolled front edge (the sloped line in front view)
 *   collar.shoulder.<L|R>.<i>      layered rounded shoulder armour (pivot group
 *                                  at the shoulder centre: collar.shoulderPivot.<L|R>)
 *   collar.recess.<L|R>            dark supraclavicular recess, .lame.<i> stepped front lames
 *   collar.clavicle.<L|R>          collarbone bars (outside the neck pillars)
 *   collar.pec.<L|R>.<i>           big pectoral plates (0 inner, 1 outer, 2/3 lower, darker)
 *   collar.back.<L|R>.<i>          upper back plates
 *   collar.sternum / collar.notch  centre plate with the sternal notch + centre line
 *
 * Params
 *   breathe  0..1   chest plates lift / spread
 *   shrug   -1..1   trapezius + shoulders rise / drop
 *   idle     0..1   built-in breathing amount
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

/** Thick bevelled plate over any parametric surface F(s, t), s,t in [0,1]. */
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
    thickness: 0.06, bevel: 0.02, gap: 0.012, segU: 24, segV: 12, ...o,
  });
}

/** Single-sided grid sheet over F(s,t) with outward orientation. */
function sheet(THREE, F, segS, segT, out, keep = null) {
  const pos = [];
  const uv = [];
  const P = new THREE.Vector3();
  for (let j = 0; j <= segT; j++) {
    for (let i = 0; i <= segS; i++) {
      F(i / segS, j / segT, P);
      pos.push(P.x, P.y, P.z);
      uv.push(P.x + P.z, P.y);
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
  let score = 0;
  const n = g.attributes.normal;
  const Q = new THREE.Vector3(), Nv = new THREE.Vector3();
  for (let i = 0; i < n.count; i += 5) {
    Q.fromBufferAttribute(g.attributes.position, i);
    Nv.fromBufferAttribute(n, i);
    score += Nv.dot(out(Q));
  }
  if (score < 0) {
    for (let t = 0; t < index.length; t += 3) { const s = index[t + 1]; index[t + 1] = index[t + 2]; index[t + 2] = s; }
    g.setIndex(index);
    g.computeVertexNormals();
  }
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

export function build(ctx) {
  const { THREE, geo, materials: M } = ctx;
  const root = ctx.space('chest', 'body');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const Y_BOT = -0.62;

  // materials
  const coreMat = M.get('darkMetal');
  const deepMat = M.get('darkMetal', { roughness: 0.55, color: 0x1c1d20 });
  const trapMat = M.get('chrome', { panel: 3.2, seed: 81, lineWidth: 0.0045, roughness: 0.24 });
  const trapAlt = M.get('gunmetal', { panel: 3.2, seed: 82, lineWidth: 0.0045 });
  const pecMat = M.get('gunmetal', { panel: 2.4, seed: 83, lineWidth: 0.004, lineDepth: 0.8 });
  const pecAlt = M.get('chrome', { panel: 2.6, seed: 84, lineWidth: 0.004, lineDepth: 0.8, roughness: 0.28 });
  const lowMat = M.get('gunmetal', { panel: 2.4, seed: 85, lineWidth: 0.004, lineDepth: 0.8, color: 0x3a3f45, roughness: 0.4 });
  const bright = M.get('chrome', { roughness: 0.17 });

  // ---------------------------------------------------------- torso body
  const torso = geo.profileSurface([
    { y: -0.7, w: 1.68, zf: 0.6, zb: 0.56, n: 3.0, zc: -0.05 },
    { y: -0.25, w: 1.76, zf: 0.62, zb: 0.58, n: 3.1, zc: -0.05 },
    { y: 0.12, w: 1.8, zf: 0.6, zb: 0.58, n: 3.1, zc: -0.05 },
    { y: 0.4, w: 1.62, zf: 0.52, zb: 0.6, n: 2.9, zc: -0.05 },
    { y: 0.62, w: 1.25, zf: 0.4, zb: 0.6, n: 2.7, zc: -0.06 },
    { y: 0.84, w: 0.8, zf: 0.3, zb: 0.56, n: 2.5, zc: -0.07 },
    { y: 1.0, w: 0.5, zf: 0.26, zb: 0.5, n: 2.4, zc: -0.07 },
  ]);
  const frontZ = (x, y) => {
    const s = torso.section(y);
    const r = Math.min(0.999, Math.abs(x) / s.w);
    return s.zc + s.zf * Math.pow(1 - Math.pow(r, s.n), 1 / s.n);
  };
  const uAtX = (x, y) => {
    const s = torso.section(y);
    const r = Math.min(1, Math.abs(x) / s.w);
    return Math.sign(x) * Math.asin(Math.pow(r, s.n / 2));
  };
  const radial = (p) => V(p.x, 0, p.z + 0.05);
  // collarbone height: low between the neck pillars (they plunge into the
  // chest behind the pecs), rising outside them toward the shoulder
  const clavY = (x) => {
    const a = Math.abs(x);
    return 0.1 + 0.27 * smooth(0.3, 1.0, a) + 0.07 * smooth(0.95, 1.45, a);
  };

  // ------------------------------------------------------ trapezius frame
  // Crest slopes from high beside the neck (body y ~1.4, behind the pillars)
  // down and out to the shoulder caps. t runs back (0) -> crest (TC) -> front (1).
  const TX0 = 0.42, TX1 = 1.64, TC = 0.68;
  const tu = (x) => clamp01((Math.abs(x) - TX0) / (TX1 - TX0));
  const topY = (x) => Math.min(1.36, 1.0 + 0.5 * Math.pow(1 - tu(x), 1.5));
  const zFront = (x) => -0.12 + 0.32 * tu(x);
  const zBack = () => -0.62;
  const trapPoint = (side, s, t, target, lift = 0) => {
    const x = lerp(TX0, TX1, s);
    let y, nz;
    if (t < TC) {
      const c = 1 - t / TC;
      y = topY(x) - 0.42 * c * c;
      nz = -0.6 * c;
    } else {
      const c = (t - TC) / (1 - TC);
      y = topY(x) - 0.14 * c * c;
      nz = 0.8 * c;
    }
    return target.set(x * side, y + lift, lerp(zBack(x), zFront(x), t) + lift * nz);
  };
  const trapOut = (p) => V(p.x * 0.15, 1, (p.z + 0.2) * 1.2).normalize();

  const lifts = [];
  const addLift = (obj, dir, amp, kind) => lifts.push({ obj, base: obj.position.clone(), dir: dir.clone().normalize(), amp, kind });

  // ---------------------------------------------------------------- core
  {
    const map = (s, t) => [lerp(-Math.PI, Math.PI, s), lerp(Y_BOT - 0.03, 0.98, t)];
    const P = new THREE.Vector3(), N = new THREE.Vector3();
    const F = (s, t, target) => {
      const [u, y] = map(s, t);
      torso.surface(u, y, target);
      return target.addScaledVector(torso.normal(u, y, N), -0.05);
    };
    const keep = (s, t) => {
      const [u, y] = map(s, t);
      torso.surface(u, y, P);
      return !(Math.abs(u) < 1.0 && y > clavY(P.x) - 0.04);
    };
    root.add(ctx.mesh(sheet(THREE, F, 128, 40, radial, keep), coreMat, 'collar.core'));
    const sec = torso.section(Y_BOT - 0.03);
    const shape = new THREE.Shape();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * TAU;
      const e = 2 / sec.n;
      const x = sec.w * sgnPow(Math.sin(a), e);
      const z = sec.zc + (Math.cos(a) >= 0 ? sec.zf : sec.zb) * sgnPow(Math.cos(a), e);
      if (i === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z);
    }
    const cap = new THREE.ShapeGeometry(shape, 1);
    cap.rotateX(Math.PI / 2);
    cap.translate(0, Y_BOT - 0.03, 0);
    root.add(ctx.mesh(cap, M.get('cavity'), 'collar.base'));
  }

  // ------------------------------------------------------------ trapezius
  const shoulderPivots = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const shrugDir = V(0.2 * side, 1, -0.05);
    // dark under-body of the trapezius (shows in the seams between lames)
    {
      const F = (s, t, target) => trapPoint(side, side > 0 ? s : 1 - s, t, target, -0.04);
      root.add(ctx.mesh(sheet(THREE, F, 30, 16, trapOut), deepMat, `collar.trapezius.${key}.under`));
    }
    // long layered lames running the length of the slope; the front lame
    // lies on top, like shingles overlapping toward the back
    const lames = [
      { t0: 0.0, t1: 0.42, off: 0.0, mat: trapAlt },
      { t0: 0.37, t1: 0.74, off: 0.03, mat: trapMat },
      { t0: 0.69, t1: 1.0, off: 0.06, mat: trapMat },
    ];
    lames.forEach((l, i) => {
      const F = (s, t, target) => trapPoint(side, side > 0 ? s : 1 - s, lerp(l.t0, l.t1, t), target, l.off);
      const m = ctx.mesh(patch(THREE, geo, F, trapOut, { thickness: 0.07, bevel: 0.026, gap: 0.016, segU: 30, segV: 10 }), l.mat, `collar.trapezius.${key}.${i}`);
      root.add(m);
      addLift(m, shrugDir, 0.03 + 0.012 * i, 'shrug');
    });
    // thick rolled bright front edge (the sloped diagonal line in front view)
    {
      const pts = [];
      for (let j = 0; j <= 16; j++) {
        const s = lerp(0.12, 0.97, j / 16);
        const p = trapPoint(side, s, 1.0, new THREE.Vector3(), 0.04);
        p.y -= 0.035;
        pts.push(p);
      }
      const g = geo.sweptSection(new THREE.CatmullRomCurve3(pts), geo.roundedSection(0.06, 0.042, 4, 24), {
        steps: 60, up: V(0, 0.5, 1).normalize(),
        scale: (t) => [0.85 + 0.25 * Math.sin(Math.PI * t), 1],
      });
      const m = ctx.mesh(g, bright, `collar.trapezius.${key}.band`);
      root.add(m);
      addLift(m, shrugDir, 0.05, 'shrug');
    }

    // ---------------------------------------------------- shoulder armour
    const pivot = new THREE.Group();
    pivot.name = `collar.shoulderPivot.${key}`;
    const C = V(1.62 * side, 0.42, -0.1);
    pivot.position.copy(C);
    root.add(pivot);
    shoulderPivots[key] = pivot;
    const R = [0.5, 0.54, 0.62];
    const coreG = new THREE.SphereGeometry(1, 40, 20);
    coreG.scale(R[0] * 0.98, R[1] * 0.98, R[2] * 0.98);
    pivot.add(ctx.mesh(coreG, deepMat, `collar.shoulder.${key}.core`));
    const shells = [
      { th0: 0.0, th1: 0.66, off: 0.09, mat: trapMat },
      { th0: 0.58, th1: 1.12, off: 0.06, mat: pecAlt },
      { th0: 1.04, th1: 1.6, off: 0.035, mat: trapAlt },
      { th0: 1.52, th1: 2.1, off: 0.01, mat: lowMat },
    ];
    shells.forEach((sh, i) => {
      const F = (s, t, target) => {
        const ph = lerp(-0.7, 3.4, side > 0 ? s : 1 - s); // 0 = front, PI/2 = outward, PI = back
        const th = lerp(sh.th0, sh.th1, t) + 1e-3;
        return target.set(R[0] * Math.sin(th) * Math.sin(ph) * side, R[1] * Math.cos(th), R[2] * Math.sin(th) * Math.cos(ph));
      };
      const out = (p) => p.clone();
      const g = patch(THREE, geo, F, out, { offset: sh.off, thickness: 0.07, bevel: 0.026, gap: 0.018, segU: 36, segV: 10 });
      pivot.add(ctx.mesh(g, sh.mat, `collar.shoulder.${key}.${i}`));
    });
  }

  // --------------------------------------------------------- clavicles
  const clavCurve = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const x = lerp(0.78, 1.5, k / 12);
      const y = clavY(x);
      pts.push(V(x * side, y, frontZ(x, y) + 0.04 - 0.08 * smooth(1.2, 1.5, x)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    clavCurve[key] = curve;
    const bar = geo.sweptSection(curve, geo.roundedSection(0.08, 0.034, 5, 28), {
      steps: 50, up: V(0, 1, 0.4).normalize(),
      scale: (t) => [0.85 + 0.25 * Math.sin(Math.PI * t), 1 - 0.2 * t],
    });
    const m = ctx.mesh(bar, pecAlt, `collar.clavicle.${key}`);
    root.add(m);
    addLift(m, V(0, 0.3, 1), 0.02, 'breathe');
  }

  // ------------------------------------------- supraclavicular recess
  // deep dark cave between the trapezius front edge and the clavicle,
  // with fine horizontal ribs (film / front ref)
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const A = new THREE.Vector3(), B = new THREE.Vector3();
    const floor = (s, t, target) => {
      const x = lerp(0.62, 1.5, s);
      trapPoint(side, (x - TX0) / (TX1 - TX0), 1.0, A, 0.0);
      A.y -= 0.06;
      clavCurve[key].getPointAt(clamp01((x - 0.78) / 0.72), B);
      B.z -= 0.06;
      target.lerpVectors(A, B, t);
      target.z -= 0.24 * Math.sin(Math.PI * t) * Math.pow(Math.sin(Math.PI * clamp01(s * 1.05)), 0.4);
      return target;
    };
    root.add(ctx.mesh(sheet(THREE, floor, 28, 14, () => V(0, 0.4, 1)), deepMat, `collar.recess.${key}`));
    // stepped front lames over the recess: broad bands following the slope,
    // each upper band overlapping the one below it (dark gaps between)
    const face = (s, t, target) => {
      const x = lerp(0.66, 1.5, s);
      trapPoint(side, (x - TX0) / (TX1 - TX0), 1.0, A, 0.0);
      A.y -= 0.07;
      clavCurve[key].getPointAt(clamp01((x - 0.78) / 0.72), B);
      B.z -= 0.02;
      B.y += 0.03;
      target.lerpVectors(A, B, t);
      target.z -= 0.16 * Math.sin(Math.PI * t) * Math.pow(Math.sin(Math.PI * clamp01(s * 1.05)), 0.4);
      return target;
    };
    const bands = [
      { t0: 0.0, t1: 0.4, off: 0.06, mat: trapAlt },
      { t0: 0.36, t1: 0.72, off: 0.04, mat: pecMat },
      { t0: 0.68, t1: 1.0, off: 0.02, mat: lowMat },
    ];
    bands.forEach((b, i) => {
      const F = (s, t, target) => face(side > 0 ? s : 1 - s, lerp(b.t1, b.t0, t), target);
      const m = ctx.mesh(patch(THREE, geo, F, () => V(0, 0.35, 1), { offset: b.off, thickness: 0.06, bevel: 0.022, gap: 0.03, segU: 24, segV: 6 }), b.mat, `collar.recess.${key}.lame.${i}`);
      root.add(m);
      addLift(m, V(0.1 * side, 0.6, 0.6), 0.015 * (3 - i), 'breathe');
    });
  }

  // ---------------------------------------------------------- chest plates
  const onTorso = (fn) => (s, t, target) => {
    const [u, y] = fn(s, t);
    return torso.surface(u, y, target);
  };
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    // few, large pectoral plates; the lower chest goes darker (frame fade)
    const pecs = [
      { x0: 0.15, x1: 1.0, a: 0.04, lo: -0.2, off: 0.075, th: 0.09, mat: pecAlt },
      { x0: 0.96, x1: 1.5, a: 0.08, lo: -0.12, off: 0.045, th: 0.07, mat: pecMat },
      { x0: 0.15, x1: 0.9, a: null, hi: -0.17, lo: Y_BOT, off: 0.05, th: 0.07, mat: lowMat },
      { x0: 0.86, x1: 1.5, a: null, hi: -0.09, lo: Y_BOT, off: 0.025, th: 0.06, mat: lowMat },
    ];
    pecs.forEach((pc, i) => {
      const fn = (s, t) => {
        const x = lerp(pc.x0, pc.x1, side > 0 ? s : 1 - s) * side;
        const ax = Math.abs(x);
        // lower edge sweeps up toward the armpit (big curved pec shape)
        const lo = pc.a === null ? pc.lo : pc.lo + 0.12 * smooth(0.5, 1.3, ax);
        const hi = pc.a === null ? pc.hi + 0.12 * smooth(0.5, 1.3, ax) : clavY(x) - pc.a;
        const y = lerp(lo, hi, t);
        return [uAtX(x, y), y];
      };
      const m = ctx.mesh(patch(THREE, geo, onTorso(fn), radial, { offset: pc.off, thickness: pc.th, bevel: 0.028, gap: 0.02, segU: 22, segV: 12 }), pc.mat, `collar.pec.${key}.${i}`);
      root.add(m);
      const [u, y] = fn(0.5, 0.5);
      addLift(m, torso.normal(u, y, new THREE.Vector3()), 0.02, 'breathe');
    });
    const backs = [
      { u0: 1.25, u1: 2.2, y0: Y_BOT, y1: 0.45, off: 0.03, mat: pecMat },
      { u0: 2.1, u1: Math.PI - 0.03, y0: Y_BOT, y1: 0.62, off: 0.03, mat: trapAlt },
    ];
    backs.forEach((b, i) => {
      const fn = (s, t) => [lerp(b.u0, b.u1, side > 0 ? s : 1 - s) * side, lerp(b.y0, b.y1, t)];
      const m = ctx.mesh(patch(THREE, geo, onTorso(fn), radial, { offset: b.off, segU: 18, segV: 12 }), b.mat, `collar.back.${key}.${i}`);
      root.add(m);
    });
  }

  // ------------------------------------------------------------- sternum
  {
    const fn = (s, t) => {
      const x = lerp(-0.13, 0.13, s);
      const top = clavY(0) - 0.02 + 0.6 * Math.abs(x);
      const y = lerp(Y_BOT, top, t);
      return [uAtX(x, y), y];
    };
    const m = ctx.mesh(patch(THREE, geo, onTorso(fn), radial, { offset: 0.085, thickness: 0.08, segU: 10, segV: 18 }), pecMat, 'collar.sternum');
    root.add(m);
    addLift(m, V(0, 0, 1), 0.02, 'breathe');
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const y = lerp(Y_BOT + 0.02, clavY(0) - 0.06, k / 8);
      pts.push(V(0, y, frontZ(0, y) + 0.1));
    }
    const line = ctx.mesh(geo.sweptSection(new THREE.CatmullRomCurve3(pts), geo.roundedSection(0.014, 0.012, 3, 10), { steps: 20 }), bright, 'collar.notch.line');
    root.add(line);
    addLift(line, V(0, 0, 1), 0.02, 'breathe');
    const ny = clavY(0) + 0.02;
    const notch = puck(THREE, geo, seLoop(0.2, 0.1, 2.6, 32), segProfile(ny - 0.07, ny, 0.02), 0, frontZ(0, ny) - 0.08);
    root.add(ctx.mesh(notch, pecMat, 'collar.notch'));
  }

  // --------------------------------------------------------------- params
  const seen = new Map();
  for (const l of lifts) {
    if (seen.has(l.obj)) l.base = seen.get(l.obj);
    else seen.set(l.obj, l.base);
  }
  const pivotBase = Object.fromEntries(Object.entries(shoulderPivots).map(([k, p]) => [k, p.position.clone()]));
  const params = { breathe: 0, shrug: 0, idle: 1 };
  const pose = (p, breath) => {
    const b = p.breathe + breath;
    for (const l of lifts) l.obj.position.copy(l.base);
    for (const l of lifts) l.obj.position.addScaledVector(l.dir, l.amp * (l.kind === 'breathe' ? b : p.shrug));
    for (const [k, pv] of Object.entries(shoulderPivots)) {
      const side = k === 'L' ? 1 : -1;
      pv.position.copy(pivotBase[k]).add(V(0.02 * side * p.shrug, 0.05 * p.shrug, 0));
      pv.rotation.z = -side * 0.08 * p.shrug;
    }
  };

  return {
    params,
    paramSpec: {
      breathe: { min: 0, max: 1, step: 0.01 },
      shrug: { min: -1, max: 1, step: 0.01 },
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
