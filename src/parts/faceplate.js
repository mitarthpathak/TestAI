/**
 * PART: faceplate — widow's-peak forehead plate, long keeled nose plate, heavy
 * brow mass over the eyes, angular cheekbone plates sweeping back to the fins,
 * and the maxilla plates that close the face down to the upper-lip line.
 * Joint: head. Authoring space: HEAD.
 *
 * Owns the face from the forehead down to just above the mouth (y ~ 0.24).
 * Every plate is a thick bevelled "ribbon" whose rails follow the eye-socket
 * and cheek-disc outlines (anatomy.CUTOUTS), so the openings stay clear
 * without CSG and every seam is a clean dark gap onto the cranium core.
 *
 * Sub-meshes (each on its own pivot group for animation):
 *   faceplate.forehead, faceplate.nose, faceplate.nose.bridge,
 *   faceplate.brow.{L,R}, faceplate.cheekbone.{L,R}, faceplate.maxilla.{L,R}
 * Params: noseFlex (scrunch), cheekFlex (cheekbones lift / sneer),
 *         browFurrow (+ angry, - surprised).
 */
export const meta = {
  id: 'faceplate',
  explode: [0, 0.2, 1.0],
};

export function build(ctx) {
  const { THREE, geo, anatomy, materials: M } = ctx;
  const root = ctx.space('head', 'head');
  const field = makeHeadField(THREE, anatomy);
  const chart = field.chart;

  const plateMat = M.get('chrome', { panel: 3.4, seed: 5, lineWidth: 0.0035, lineDepth: 0.8 });
  const bright = M.get('chrome', { roughness: 0.15, panel: 2.2, seed: 9, lineWidth: 0.003, lineDepth: 0.7 });
  const gun = M.get('gunmetal', { panel: 4.2, seed: 13, lineWidth: 0.0035, lineDepth: 0.8 });
  // below the bloom threshold: a warm red seam light, not a glow source
  const glowSeam = M.get('redAccent', { intensity: 1.2 });

  // rails through control points: [x, y] = front-view x (converted to the
  // head angle u), or { u, y } for points that wrap round the side.
  const toUY = (p) => (Array.isArray(p) ? [anatomy.headAngleForX(p[0], p[1]), p[1]] : [p.u, p.y]);
  const rail = (pts, mirror = 1) => {
    const c = new THREE.SplineCurve(pts.map((p) => { const [u, y] = toUY(p); return new THREE.Vector2(u * mirror, y); }));
    c.arcLengthDivisions = 400;
    const v = new THREE.Vector2();
    return (t) => { c.getPointAt(THREE.MathUtils.clamp(t, 0, 1), v); return [v.x, v.y]; };
  };
  const sm = THREE.MathUtils.smoothstep;
  const lerp = THREE.MathUtils.lerp;
  const surf = (x, y) => { const P = new THREE.Vector3(), N = new THREE.Vector3(); chart(anatomy.headAngleForX(x, y), y, P, N); return P; };

  // pivot helper: a Group at `hinge` (head space) holding meshes authored in head space
  const pivots = {};
  const pivot = (name, hinge) => {
    const g = new THREE.Group();
    g.name = `${name}.pivot`;
    g.position.copy(hinge);
    g.userData.rest = hinge.clone();
    const inner = new THREE.Group();
    inner.position.copy(hinge).negate();
    g.add(inner);
    root.add(g);
    pivots[name] = g;
    return inner;
  };

  // ------------------------------------------------------------ nose plate
  // left edge of the nose (x > 0), top -> bottom: narrow bridge between the
  // eyes, widening into a blocky lower nose that stops above the upper lip
  const noseEdge = [
    [0.024, 1.1], [0.056, 1.03], [0.07, 0.95], [0.08, 0.86], [0.097, 0.76],
    [0.122, 0.64], [0.147, 0.52], [0.163, 0.42], [0.168, 0.34], [0.162, 0.278],
  ];
  const noseY = (t) => lerp(1.1, 0.278, t);
  // projection of the nose ridge above the skin (shared by the bridge strip)
  const noseH = (y) => 0.022 + 0.058 * sm(y, 1.06, 0.66) + 0.036 * sm(y, 0.74, 0.46) - 0.026 * sm(y, 0.4, 0.28);
  {
    const inner = pivot('faceplate.nose', surf(0, 1.08));
    const g = ribbonPlate(THREE, geo, {
      chart, railA: rail(noseEdge, -1), railB: rail(noseEdge, 1),
      segS: 30, segT: 64, offset: 0.006, thickness: 0.06, bevel: 0.01, gap: 0.006, gap0: 0, gap1: 0.004,
      lift: (s, t) => {
        const y = noseY(t);
        const e = Math.abs(2 * s - 1);
        // two planar facets meeting at the central keel; flatter (blockier) low down
        const k = lerp(0.62, 0.34, sm(y, 0.9, 0.5));
        return noseH(y) * (1 - k * e);
      },
    });
    inner.add(ctx.mesh(g, bright, 'faceplate.nose'));

    // raised keel strip running down the centre of the nose, with a notch at the tip
    const keelEdge = [[0.012, 1.0], [0.018, 0.9], [0.024, 0.75], [0.032, 0.6], [0.04, 0.47], [0.044, 0.39]];
    const keelY = (t) => lerp(1.0, 0.39, t);
    const kg = ribbonPlate(THREE, geo, {
      chart, railA: rail(keelEdge, -1), railB: rail(keelEdge, 1),
      segS: 10, segT: 40, offset: 0.006, thickness: 0.05, bevel: 0.006, gap: 0.0, gap0: 0.0, gap1: 0.0,
      lift: (s, t) => {
        const e = Math.abs(2 * s - 1);
        return noseH(keelY(t)) + 0.012 + 0.006 * (1 - e * e) - 0.006 * sm(t, 0.82, 1.0);
      },
    });
    inner.add(ctx.mesh(kg, M.get('chrome', { roughness: 0.2 }), 'faceplate.nose.bridge'));
  }

  // ------------------------------------------------------------ forehead widow's peak
  // chevron between the brows: broad under the crest, pointing down into the nose
  {
    const inner = pivot('faceplate.forehead', surf(0, 1.3));
    const edge = [[0.112, 1.37], [0.112, 1.3], [0.094, 1.21], [0.064, 1.12], [0.032, 1.045], [0.008, 0.99]];
    const g = ribbonPlate(THREE, geo, {
      chart, railA: rail(edge, -1), railB: rail(edge, 1),
      segS: 20, segT: 36, offset: 0.02, thickness: 0.07, bevel: 0.009, gap: 0.004, gap0: 0, gap1: 0,
      lift: (s, t) => {
        const e = Math.abs(2 * s - 1);
        // central ridge continuing the nose keel, facets falling to the edges;
        // the upper end stays low so the crest's tip laps over it
        return 0.006 + 0.012 * Math.max(0, 1 - e / 0.24) - 0.006 * e + 0.014 * sm(t, 0.35, 1.0);
      },
    });
    inner.add(ctx.mesh(g, plateMat, 'faceplate.forehead'));
  }

  // ------------------------------------------------------------ brow mass, cheekbones, maxilla
  // seam K: from the eye's outer corner back along the temple (shared by brow + cheekbone)
  const K = [[0.542, 0.972], [0.6, 0.998], [0.66, 1.03], { u: 1.2, y: 1.07 }];
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';

    // brow: lower rail frames the socket top; the plate is a wedge whose thick,
    // crisp lower edge overhangs the eye (the angry brow mass)
    const browLow = [[0.112, 0.89], [0.136, 0.956], [0.176, 1.004], [0.24, 1.04], [0.32, 1.066], [0.4, 1.074], [0.466, 1.064], [0.515, 1.026], ...K];
    const browTop = [[0.06, 1.1], [0.13, 1.17], [0.24, 1.214], [0.36, 1.244], [0.47, 1.262], [0.56, 1.272], [0.64, 1.274], { u: 1.2, y: 1.268 }];
    const browIn = pivot(`faceplate.brow.${key}`, surf(0.62 * side, 1.1));
    const brow = ribbonPlate(THREE, geo, {
      chart, railA: rail(browLow, side), railB: rail(browTop, side),
      segS: 12, segT: 56, offset: 0.03, thickness: 0.07, bevel: 0.008, gapA: 0.006, gapB: 0.006, gap0: 0.006, gap1: 0.006,
      lift: (s, t) => {
        const amp = (0.55 + 0.45 * sm(t, 0.0, 0.22)) * (1 - 0.7 * sm(t, 0.6, 1.0));
        return 0.004 + 0.044 * (1 - s) * amp;
      },
    });
    browIn.add(ctx.mesh(brow, plateMat, `faceplate.brow.${key}`));

    // cheekbone: upper rail frames the socket bottom then seam K, lower rail rides
    // over the cheek disc. Low at the eye, a sharp crease further out.
    const cheekUp = [[0.126, 0.862], [0.16, 0.815], [0.23, 0.795], [0.31, 0.795], [0.38, 0.823], [0.44, 0.852], [0.492, 0.902], ...K, { u: 1.46, y: 1.1 }];
    const cheekLow = [[0.146, 0.66], [0.22, 0.652], [0.33, 0.645], [0.42, 0.668], [0.5, 0.7], [0.58, 0.72], [0.65, 0.724], { u: 1.22, y: 0.75 }, { u: 1.46, y: 0.95 }];
    const cheekHinge = new THREE.Vector3(); chart(1.4 * side, 0.88, cheekHinge, new THREE.Vector3());
    const cheekIn = pivot(`faceplate.cheekbone.${key}`, cheekHinge);
    const cheek = ribbonPlate(THREE, geo, {
      chart, railA: rail(cheekUp, side), railB: rail(cheekLow, side),
      segS: 16, segT: 64, offset: 0.012, thickness: 0.06, bevel: 0.009, gapA: 0.007, gapB: 0.007, gap0: 0.006, gap1: 0.006,
      lift: (s, t) => {
        // crease line runs from under the inner eye back toward the fin root
        const c = 0.5 + 0.08 * t;
        const tent = s < c ? Math.pow(s / c, 0.85) : (1 - s) / (1 - c);
        const taper = 1 - 0.5 * sm(t, 0.6, 1.0);
        return 0.006 + 0.036 * tent * taper - 0.014 * Math.pow(1 - s, 3);
      },
    });
    cheekIn.add(ctx.mesh(cheek, bright, `faceplate.cheekbone.${key}`));

    // maxilla: between the nose and the cheek disc, down to the upper lip line
    const maxIn = [[0.128, 0.652], [0.15, 0.52], [0.165, 0.42], [0.17, 0.34], [0.166, 0.25]];
    const maxOut = [[0.39, 0.652], [0.36, 0.6], [0.335, 0.56], [0.296, 0.5], [0.268, 0.44], [0.26, 0.39], [0.268, 0.33], [0.288, 0.275], [0.305, 0.245]];
    const maxInner = pivot(`faceplate.maxilla.${key}`, surf(0.25 * side, 0.62));
    const maxilla = ribbonPlate(THREE, geo, {
      chart, railA: rail(maxIn, side), railB: rail(maxOut, side),
      segS: 12, segT: 36, offset: 0.006, thickness: 0.06, bevel: 0.009, gapA: 0.007, gapB: 0.006, gap0: 0.006, gap1: 0.004,
      lift: (s, t) => (0.006 + 0.014 * Math.sin(Math.PI * s) * (1 - 0.3 * t) + 0.01 * (1 - s) * sm(t, 0.0, 0.5)) * sm(t, 0.0, 0.14),
    });
    maxInner.add(ctx.mesh(maxilla, gun, `faceplate.maxilla.${key}`));

    // red-lit strip deep inside seam K (the reference's glowing seams behind the eye)
    {
      const r = rail(K, side);
      const P = new THREE.Vector3(), N = new THREE.Vector3();
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const [u, y] = r(0.04 + 0.9 * (i / 24));
        chart(u, y, P, N);
        pts.push(P.clone().addScaledVector(N, -0.004));
      }
      const g = geo.sweptSection(new THREE.CatmullRomCurve3(pts), geo.roundedSection(0.006, 0.0038, 2, 8), {
        steps: 40, scale: (t) => [1, Math.min(1, t * 8, (1 - t) * 8)],
      });
      root.add(ctx.mesh(g, glowSeam, `faceplate.seamGlow.${key}`));
    }
  }

  // ------------------------------------------------------------ params
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const set = (name, rx, ry, rz, dx, dy, dz) => {
    const g = pivots[name];
    g.quaternion.copy(_q.setFromEuler(_e.set(rx, ry, rz)));
    g.position.copy(g.userData.rest).add(new THREE.Vector3(dx, dy, dz));
  };
  const params = { noseFlex: 0, cheekFlex: 0, browFurrow: 0 };
  return {
    params,
    paramSpec: {
      noseFlex: { min: -1, max: 1, step: 0.01 },
      cheekFlex: { min: -1, max: 1, step: 0.01 },
      browFurrow: { min: -1, max: 1, step: 0.01 },
    },
    apply(p) {
      // absolute transforms from params only (idempotent)
      set('faceplate.nose', -p.noseFlex * 0.05, 0, 0, 0, p.noseFlex * 0.012, 0);
      set('faceplate.forehead', 0, 0, 0, 0, -p.browFurrow * 0.008, p.browFurrow * 0.004);
      for (const key of ['L', 'R']) {
        const sd = key === 'L' ? 1 : -1;
        // brow rotates about its temple end: + drops the inner end (angry)
        set(`faceplate.brow.${key}`, p.browFurrow * 0.05, 0, sd * p.browFurrow * 0.07, 0, -p.browFurrow * 0.006, p.browFurrow * 0.006);
        // cheekbone lifts and rolls up toward the eye (sneer)
        set(`faceplate.cheekbone.${key}`, -p.cheekFlex * 0.03, 0, -sd * p.cheekFlex * 0.05, 0, p.cheekFlex * 0.014, p.cheekFlex * 0.004);
        set(`faceplate.maxilla.${key}`, 0, 0, 0, 0, p.cheekFlex * 0.008 + p.noseFlex * 0.004, 0);
      }
    },
  };
}

// ===========================================================================
// Local geometry helpers (duplicated in cranium.js; candidates for geometry.js)
// ===========================================================================

/**
 * Fast, allocation-free sampler of the shared head shell: anatomy.headSection
 * tabulated at 1 mm steps. F(x,y,z) is the superellipse implicit (<0 inside),
 * normals come from its gradient.
 */
function makeHeadField(THREE, anatomy) {
  const [Y0, Y1] = anatomy.HEAD_Y_RANGE;
  const n = 2300, h = (Y1 - Y0) / n;
  const T = { w: new Float64Array(n + 1), zf: new Float64Array(n + 1), zb: new Float64Array(n + 1), e: new Float64Array(n + 1), zc: new Float64Array(n + 1) };
  for (let i = 0; i <= n; i++) {
    const s = anatomy.headSection(Y0 + i * h);
    T.w[i] = s.w; T.zf[i] = s.zf; T.zb[i] = s.zb; T.e[i] = s.n; T.zc[i] = s.zc;
  }
  const S = { w: 0, zf: 0, zb: 0, n: 2, zc: 0 };
  const section = (y) => {
    let f = (y - Y0) / h;
    f = f < 0 ? 0 : f > n ? n : f;
    const i = Math.min(n - 1, f | 0), t = f - i;
    S.w = T.w[i] + (T.w[i + 1] - T.w[i]) * t;
    S.zf = T.zf[i] + (T.zf[i + 1] - T.zf[i]) * t;
    S.zb = T.zb[i] + (T.zb[i + 1] - T.zb[i]) * t;
    S.n = T.e[i] + (T.e[i + 1] - T.e[i]) * t;
    S.zc = T.zc[i] + (T.zc[i + 1] - T.zc[i]) * t;
    return S;
  };
  const F = (x, y, z) => {
    if (y <= Y0 + 1e-4 || y >= Y1 - 1e-4) return 1;
    const s = section(y);
    if (s.w < 1e-5) return 1;
    const d = z >= s.zc ? s.zf : s.zb;
    return Math.pow(Math.abs(x) / s.w, s.n) + Math.pow(Math.abs(z - s.zc) / d, s.n) - 1;
  };
  const normalAt = (P, N) => {
    const s = section(P.y);
    const w = Math.max(1e-5, s.w), ne = s.n, dz = P.z - s.zc, d = dz >= 0 ? s.zf : s.zb;
    const gx = (ne * Math.pow(Math.abs(P.x) / w, ne - 1) / w) * Math.sign(P.x);
    const gz = (ne * Math.pow(Math.abs(dz) / d, ne - 1) / d) * Math.sign(dz);
    const e = 2e-4;
    const gy = (F(P.x, Math.min(Y1 - 2e-4, P.y + e), P.z) - F(P.x, P.y - e, P.z)) / (2 * e);
    N.set(gx, gy, gz);
    if (N.lengthSq() < 1e-12) N.set(0, 1, 0);
    return N.normalize();
  };
  const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  const surface = (u, y, P) => {
    const s = section(y);
    const e = 2 / s.n, cu = Math.cos(u);
    return P.set(s.w * sp(Math.sin(u), e), y, s.zc + (cu >= 0 ? s.zf : s.zb) * sp(cu, e));
  };
  /** (u, y) chart: same parametrisation as anatomy.headSurface */
  const chart = (u, y, P, N) => { surface(u, y, P); normalAt(P, N); };
  return { section, F, normalAt, surface, chart };
}

function edgeDense(count, edgeFrac) {
  const out = new Set([0, 1]);
  const e = Math.min(0.45, Math.max(0, edgeFrac));
  if (e > 0) for (const f of [0.15, 0.4, 0.7, 1.0]) { out.add(e * f); out.add(1 - e * f); }
  for (let i = 1; i < count; i++) out.add(i / count);
  return [...out].sort((a, b) => a - b);
}

/**
 * Thick bevelled plate between two rails on a surface chart.
 *  chart(a, b, P, N)  -> surface point + outward unit normal for chart coords
 *  railA(t), railB(t) -> [a, b] chart coords for t in [0, 1]
 * Gaps are in world units (per edge), so seams keep a constant width even
 * where the chart is stretched. lift(s, t) sculpts the outer surface.
 * UVs are world-unit (along, across) so panel lines follow the plate flow.
 */
function ribbonPlate(THREE, geo, o) {
  const chart = o.chart, A = o.railA, B = o.railB;
  const segS = o.segS ?? 10, segT = o.segT ?? 30;
  const offset = o.offset ?? 0, thickness = o.thickness ?? 0.045, bevel = o.bevel ?? 0.012;
  const gap = o.gap ?? 0.007;
  const gapA = o.gapA ?? gap, gapB = o.gapB ?? gap, gap0 = o.gap0 ?? gap, gap1 = o.gap1 ?? gap;
  const lift = o.lift || null;
  const P = new THREE.Vector3(), N = new THREE.Vector3(), Q = new THREE.Vector3(), Mv = new THREE.Vector3(), Pr = new THREE.Vector3();
  const mix = (a, b, s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];

  // arc length of the midline + rail-to-rail width along t
  const K = 64;
  const cum = new Float64Array(K + 1);
  for (let k = 0; k <= K; k++) {
    const t = k / K;
    const m = mix(A(t), B(t), 0.5);
    chart(m[0], m[1], Mv, N);
    cum[k] = k ? cum[k - 1] + Mv.distanceTo(Pr) : 0;
    Pr.copy(Mv);
  }
  const total = cum[K];
  const tAt = (L) => {
    if (L <= 0) return 0;
    if (L >= total) return 1;
    let lo = 0, hi = K;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < L) lo = mid; else hi = mid; }
    return (lo + (L - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo])) / K;
  };
  const L0 = Math.min(Math.max(0, gap0), total * 0.45);
  const L1 = total - Math.min(Math.max(0, gap1), total * 0.45);
  const Leff = Math.max(1e-4, L1 - L0);
  const widthAt = (t) => {
    const a = A(t), b = B(t);
    chart(a[0], a[1], P, N); chart(b[0], b[1], Q, N);
    return P.distanceTo(Q);
  };

  // orientation: (dS x dT) must point along the surface normal
  const Lm = 0.5 * (L0 + L1);
  const tm = tAt(Lm), t2 = tAt(Math.min(total, Lm + 0.01)), t1 = tAt(Math.max(0, Lm - 0.01));
  const am = A(tm), bm = B(tm);
  const c0 = mix(am, bm, 0.4), c1 = mix(am, bm, 0.6), cm = mix(am, bm, 0.5);
  chart(c1[0], c1[1], P, N); chart(c0[0], c0[1], Q, N);
  const dS = P.clone().sub(Q);
  const m2 = mix(A(t2), B(t2), 0.5), m1 = mix(A(t1), B(t1), 0.5);
  chart(m2[0], m2[1], P, N); chart(m1[0], m1[1], Q, N);
  const dT = P.clone().sub(Q);
  chart(cm[0], cm[1], P, N);
  const flip = dS.cross(dT).dot(N) < 0;

  const wMid = widthAt(tm);
  const sig = edgeDense(segS, bevel / Math.max(1e-3, wMid));
  const tau = edgeDense(segT, bevel / Leff);
  const nu = sig.length, nv = tau.length;
  const outerPos = new Float32Array(nu * nv * 3);
  const innerPos = new Float32Array(nu * nv * 3);
  const uvs = new Float32Array(nu * nv * 2);
  for (let j = 0; j < nv; j++) {
    const L = L0 + Leff * tau[j];
    const t = tAt(L);
    const a = A(t), b = B(t);
    const w = widthAt(t);
    let s0 = w > 1e-5 ? gapA / w : 0.5;
    let s1 = w > 1e-5 ? 1 - gapB / w : 0.5;
    if (s1 - s0 < 0.02) { const mid = THREE.MathUtils.clamp(0.5 * (s0 + s1), 0, 1); s0 = mid - 0.01; s1 = mid + 0.01; }
    const wEff = w * (s1 - s0);
    for (let i = 0; i < nu; i++) {
      const s = s0 + (s1 - s0) * sig[i];
      const c = mix(a, b, s);
      chart(c[0], c[1], P, N);
      const d = Math.min(sig[i] * wEff, (1 - sig[i]) * wEff, tau[j] * Leff, (1 - tau[j]) * Leff);
      let bv = 0;
      if (bevel > 0 && d < bevel) { const k = bevel - d; bv = -(bevel - Math.sqrt(Math.max(0, bevel * bevel - k * k))); }
      const h = offset + (lift ? lift(s, t) : 0) + bv;
      const id = j * nu + i;
      outerPos[id * 3] = P.x + N.x * h; outerPos[id * 3 + 1] = P.y + N.y * h; outerPos[id * 3 + 2] = P.z + N.z * h;
      const hi = offset - thickness;
      innerPos[id * 3] = P.x + N.x * hi; innerPos[id * 3 + 1] = P.y + N.y * hi; innerPos[id * 3 + 2] = P.z + N.z * hi;
      uvs[id * 2] = L - L0; uvs[id * 2 + 1] = sig[i] * wEff;
    }
  }
  const idx = (i, j) => j * nu + i;
  const oi = [], ii = [];
  for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
    const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
    if (!flip) { oi.push(a, b, d, b, c, d); ii.push(a, d, b, b, d, c); }
    else { oi.push(a, d, b, b, d, c); ii.push(a, b, d, b, c, d); }
  }
  const mk = (pos, uv, index) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  };
  const outer = mk(outerPos, uvs, oi);
  const inner = mk(innerPos, uvs.slice(), ii);
  // side walls around the border loop
  const loop = [];
  for (let i = 0; i < nu; i++) loop.push(idx(i, 0));
  for (let j = 1; j < nv; j++) loop.push(idx(nu - 1, j));
  for (let i = nu - 2; i >= 0; i--) loop.push(idx(i, nv - 1));
  for (let j = nv - 2; j > 0; j--) loop.push(idx(0, j));
  const wp = new Float32Array((loop.length + 1) * 6);
  const wu = new Float32Array((loop.length + 1) * 4);
  const wi = [];
  let acc = 0;
  for (let k = 0; k <= loop.length; k++) {
    const id = loop[k % loop.length];
    if (k > 0) {
      const pv = loop[k - 1];
      acc += Math.hypot(outerPos[id * 3] - outerPos[pv * 3], outerPos[id * 3 + 1] - outerPos[pv * 3 + 1], outerPos[id * 3 + 2] - outerPos[pv * 3 + 2]);
    }
    wp.set([outerPos[id * 3], outerPos[id * 3 + 1], outerPos[id * 3 + 2], innerPos[id * 3], innerPos[id * 3 + 1], innerPos[id * 3 + 2]], k * 6);
    wu.set([acc, 0, acc, thickness], k * 4);
    if (k > 0) {
      const q = (k - 1) * 2;
      if (!flip) wi.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      else wi.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
    }
  }
  const walls = mk(wp, wu, wi);
  const merged = geo.mergeGeometries([outer, inner, walls], false);
  outer.dispose(); inner.dispose(); walls.dispose();
  merged.computeBoundingSphere();
  return merged;
}
