/**
 * PART: cranium — egg-shaped skull armour above the brow line plus the
 * top / back / sides of the head down to the neck (SPEC.md region):
 * broad continuous central crest (from the nose board over the crown), a
 * few BROAD forehead / parietal / temple plates whose seams are long sweeping
 * curves ("( )" lobes in front view), temple plates beside the outer brow,
 * fin-root seats, side-of-head plates
 * behind the cheek rings (z < 0.15), occiput plates meeting the neck, the
 * jaw-hinge caps and a dark under-shell that shows through every seam.
 * Joint: head. Authoring space: HEAD.
 *
 * Layout: plates live in a spherical "dome chart" (phi, theta) centred on
 * the jaw-hinge axis. theta sweeps brow (~45deg) -> crown (~95deg) -> back
 * of the head (180deg+); phi is the lateral angle from the mid-plane. Seams
 * are curves phi_i(theta): from the side they are long arcs sweeping from
 * the brow back over the skull and down the sides; from the front the
 * forehead lobes bow outward like "( )" and taper into the crest.
 * Every plate is clamped to the cranium region (inRegion) so it never
 * covers the brow ridge, eye sockets or cheek turbines.
 *
 * Behind z = -0.18 the cranium geometry is pulled forward (backWarp) so the
 * occiput is shorter than the shared shell, matching the film silhouettes.
 *
 * Sub-meshes: cranium.core, cranium.core.sides, cranium.crest (group) ->
 * cranium.crest.base{0..2}, cranium.band{1..5}.{k}.{L,R},
 * cranium.hinge.{L,R} (+ boss), cranium.temple.{L,R} (pivot
 * group on the fin root, axis = shell normal) -> cranium.temple.ring{0,1}.{L,R}
 * (seat around the fin root; the root itself is left clear for the fins' collar)
 *
 * Params: panelLift (armour plates step outward), crestRaise, templeOpen
 * (socket layers fan out along the fin axis), templeSpin (socket twist),
 * breathe (idle: plates gently expand / contract).
 */
export const meta = {
  id: 'cranium',
  explode: [0, 0.9, -0.5],
};

const DEG = Math.PI / 180;

// Region contract (reference/SPEC.md): everything above the brow line, and
// behind the cheek rings below it, down to where the neck enters.
const BROW_Y = 1.07;
const SIDE_Z = 0.15;
const LOW_Y = 0.26;
// brow line: low at the nose (crest root), rising toward the temples (angry slant)
const browY = (x) => {
  const t = Math.min(1, Math.max(0, (Math.abs(x) - 0.1) / 0.5));
  return BROW_Y - 0.02 + 0.07 * t * t * (3 - 2 * t);
};
// Forehead front zone (front view, model left; mirrored): built from explicit
// angular plates (section 4b) instead of the flowing bands.
const FORE_POLY = [[0, 0.98], [0.62, 0.98], [0.62, 1.12], [0.585, 1.22], [0.53, 1.32], [0.43, 1.425], [0.3, 1.51], [0.16, 1.56], [0, 1.57]];
function inFore(P) {
  if (P.z < 0.2) return false;
  const x = Math.abs(P.x), y = P.y, L = FORE_POLY;
  let inside = false;
  for (let i = 0, j = L.length - 1; i < L.length; j = i++) {
    const [xi, yi] = L[i], [xj, yj] = L[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inRegion(P, m = 0) {
  if (P.y < LOW_Y - m) return false;
  if (P.y >= browY(P.x) - m || P.z <= SIDE_Z + m) return true;
  // temple front beside the outer brow / eye corner, above the cheek band
  return Math.abs(P.x) > 0.6 - m && P.y > 1.06 - m;
}

// Back-of-skull pull-in: the film skull is shorter behind the fin roots than
// the shared shell. Everything behind z = BACK_Z is compressed toward it
// (smoothly, fading out low down where the neck enters).
const BACK_Z = -0.18;
const BACK_K = 0.72;
function backWarp(THREE, g) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), y = p.getY(i);
    const d = BACK_Z - z;
    if (d <= 0) continue;
    const ramp = THREE.MathUtils.smoothstep(d, 0, 0.3);
    const fy = THREE.MathUtils.smoothstep(y, 0.35, 0.95);
    p.setZ(i, z + (1 - BACK_K) * d * ramp * fy);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
}

export function build(ctx) {
  const { THREE, geo, anatomy, materials: M } = ctx;
  const root = ctx.space('head', 'head');

  // ------------------------------------------------------------ materials
  const core = M.get('darkMetal', { side: THREE.DoubleSide, color: 0x2b2e33 });
  const chromeA = M.get('chrome', { panel: 2.6, seed: 11, lineWidth: 0.0035, lineDepth: 0.75 });
  const chromeB = M.get('chrome', { panel: 3.4, seed: 17, lineWidth: 0.0035, lineDepth: 0.8, roughness: 0.22 });
  const gunA = M.get('gunmetal', { panel: 3.0, seed: 23, lineWidth: 0.0035, lineDepth: 0.8 });
  const gunB = M.get('gunmetal', { panel: 5.0, seed: 29, lineWidth: 0.003, lineDepth: 0.85, roughness: 0.3 });
  const crestMat = M.get('chrome', { roughness: 0.24, panel: 2.2, seed: 3, lineWidth: 0.003, lineDepth: 0.6 });
  const trimMat = M.get('chrome', { roughness: 0.14 });
  const seamGlow = M.get('redAccent', { intensity: 0.9 });

  // ------------------------------------------------------------ charts
  const field = makeHeadField(THREE, anatomy);
  const hinge = anatomy.JOINTS.jaw.pos;
  const dome = makeDomeChart(THREE, field, new THREE.Vector3(0, hinge[1] + 0.02, hinge[2] - 0.02));
  const finRoot = anatomy.JOINTS.finL.pos;
  const finChart = makeDomeChart(THREE, field, new THREE.Vector3(0, finRoot[1], finRoot[2] - 0.02));

  const _P = new THREE.Vector3(), _N = new THREE.Vector3();
  const okAt = (phi, th, m = 0, excl = false) => { dome.chart(phi, th, _P, _N); return inRegion(_P, m) && !(excl && inFore(_P)); };
  /** [first, last] theta (deg) inside the region along rail phiFn, searched in [t0, t1]. */
  const railRange = (phiFn, t0, t1, excl = false) => {
    const ok = (d) => okAt(phiFn(d * DEG), d * DEG, 0, excl);
    let a = t0;
    while (a < t1 && !ok(a)) a += 1;
    if (a > t0) { let lo = a - 1, hi = a; for (let i = 0; i < 12; i++) { const m = 0.5 * (lo + hi); if (ok(m)) hi = m; else lo = m; } a = hi; }
    let b = t1;
    while (b > a && !ok(b)) b -= 1;
    if (b < t1) { let lo = b, hi = b + 1; for (let i = 0; i < 12; i++) { const m = 0.5 * (lo + hi); if (ok(m)) lo = m; else hi = m; } b = lo; }
    return [a, b];
  };

  // ------------------------------------------------------------ 1. dark under-shell
  // Two clean-edged sheets (no saw-tooth culling): a cap above the brow line
  // and a horseshoe around the sides / back whose front edge follows z = SIDE_Z.
  {
    const m = 0.05;
    const cap = geo.surfaceSheet({
      surface: field.surfaceFn, normal: field.normalFn,
      u0: -Math.PI, u1: Math.PI, y0: 1.06, y1: 1.95, segU: 160, segV: 48, offset: -0.07,
    });
    root.add(ctx.mesh(cap, core, 'cranium.core'));
    // u at which the shell crosses z = zEdge at height y (front half -> back)
    const uEdge = (y, zEdge) => {
      let lo = 0, hi = Math.PI;
      for (let i = 0; i < 30; i++) {
        const mid = 0.5 * (lo + hi);
        if (field.surface(mid, y, _P).z > zEdge) lo = mid; else hi = mid;
      }
      return 0.5 * (lo + hi);
    };
    const horseSurf = (s, y, P = new THREE.Vector3()) => {
      const ue = uEdge(y, SIDE_Z + m);
      const u = Math.sign(s || 1) * (Math.PI - Math.abs(s) * (Math.PI - ue));
      return field.surface(u, y, P);
    };
    const horseNorm = (s, y, N = new THREE.Vector3()) => field.normalAt(horseSurf(s, y, new THREE.Vector3()), N);
    const sideSheet = geo.surfaceSheet({
      surface: horseSurf, normal: horseNorm,
      u0: -1, u1: 1, y0: LOW_Y - m, y1: BROW_Y - m + 0.01, segU: 120, segV: 60, offset: -0.07,
    });
    root.add(ctx.mesh(sideSheet, core, 'cranium.core.sides'));
  }

  // helpers --------------------------------------------------------------
  const plates = []; // { mesh, kind, dir }
  const addPlate = (g, mat, name, kind, parent = root) => {
    const m = ctx.mesh(g, mat, name);
    parent.add(m);
    plates.push({ mesh: m, kind });
    return m;
  };
  const addPair = (g, mat, name, kind, parents = null) => {
    const l = addPlate(g, mat, `${name}.L`, kind, parents ? parents.L : root);
    const r = addPlate(geo.mirrorGeometryX(g), mat, `${name}.R`, kind, parents ? parents.R : root);
    return { l, r };
  };
  // phi_i(theta) keyed every 30deg from -30 to 330 (degrees), Catmull-Rom between keys
  const keyed = (vals) => (thRad) => {
    const f = THREE.MathUtils.clamp((thRad / DEG + 30) / 30, 0, vals.length - 1.0001);
    const i = Math.floor(f), t = f - i;
    const v = (k) => vals[THREE.MathUtils.clamp(k, 0, vals.length - 1)];
    return catmull(v(i - 1), v(i), v(i + 1), v(i + 2), t) * DEG;
  };
  const rMid = (th) => dome.radius(0, th);

  // ------------------------------------------------------------ 2. seams (left side)
  // crest half width (world units): narrow where it leaves the nose plate,
  // broadening over the crown, narrowing again down the back of the skull.
  const crestW = (th) => {
    const d = th / DEG;
    const up = THREE.MathUtils.smoothstep(d, 46, 96);
    const back = THREE.MathUtils.smoothstep(d, 120, 200);
    return 0.075 + 0.12 * up - 0.08 * back;
  };
  const S0 = (th) => Math.asin(Math.min(0.95, crestW(th) / rMid(th)));
  //                  -30  0   30  60  90 120 150 180 210 240 270 300 330
  const S1 = keyed([31, 31, 31, 29, 17, 16, 17, 19, 21, 22, 23, 24, 25]);
  const S2 = keyed([55, 55, 52, 45, 31, 28, 29, 31, 34, 38, 41, 44, 48]);
  const S3 = keyed([72, 72, 67, 54, 41, 37, 40, 45, 50, 55, 59, 63, 67]);
  const S3b = keyed([78, 78, 76, 67, 57, 54, 56, 60, 64, 68, 71, 74, 77]);
  const S4 = keyed([84, 84, 83, 79, 74, 72, 73, 75, 78, 80, 82, 83, 84]);

  // ------------------------------------------------------------ 3. crest
  // two tiers: a broad base plate with stepped flanks, and two raised spine
  // rails either side of a central groove; a keystone where it meets the nose.
  const [cr0, cr1] = railRange(() => 0, 30, 240);
  const crestTh = (t) => (cr0 + (cr1 - cr0) * t) * DEG;
  const crestGroup = new THREE.Group();
  crestGroup.name = 'cranium.crest';
  root.add(crestGroup);
  // One broad, continuous central crest from the top of the nose board up
  // over the crown (ultron-front.png), split only where the skull turns
  // (forehead / crown / occiput). The nose board's top tucks under its front.
  const crestLift = (s) => {
    const e = Math.abs(2 * s - 1);
    // stepped flank: outer 22% sits one step lower; shallow central groove
    const step = 1 - THREE.MathUtils.smoothstep(e, 0.72, 0.78);
    const groove = Math.exp(-Math.pow((2 * s - 1) / 0.06, 2));
    return 0.002 + 0.01 * step - 0.005 * groove;
  };
  const crestSegs = [[0, 0.34], [0.34, 0.66], [0.66, 1]];
  crestSegs.forEach(([c0, c1], i) => {
    const g = ribbonPlate(THREE, geo, {
      chart: dome.chart,
      railA: (t) => { const th = crestTh(c0 + (c1 - c0) * t); return [-S0(th), th]; },
      railB: (t) => { const th = crestTh(c0 + (c1 - c0) * t); return [S0(th), th]; },
      segS: 16, segT: Math.round(120 * (c1 - c0)) + 6, offset: 0.024 - 0.004 * (i % 2), thickness: 0.06, bevel: 0.01,
      gapA: 0, gapB: 0, gap0: i ? 0.005 : 0, gap1: i < 2 ? 0.005 : 0,
      // the forehead segment rises at its front to meet the nose board
      lift: (s, t) => crestLift(s) + (i === 0 ? 0.004 * (1 - THREE.MathUtils.smoothstep(t, 0, 0.35)) : 0),
    });
    addPlate(g, i === 1 ? chromeB : crestMat, `cranium.crest.base${i}`, 'crest', crestGroup);
  });

  // ------------------------------------------------------------ 4. flowing bands
  // band between seams lo/hi. `keys` are theta cuts (deg); the first / last
  // are only search limits — the real ends are clamped to the region per
  // rail, so fronts follow the brow line / the z = 0.15 cheek boundary and
  // backs stop where the neck enters. A key may be [a, b] (slanted cut).
  const crown = (amp) => (s) => amp * Math.sin(Math.PI * THREE.MathUtils.clamp(s, 0, 1));
  const rnd = (k, salt) => { const x = Math.sin(k * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); };
  const band = (id, lo, hi, keys, o) => {
    const first = Array.isArray(keys[0]) ? keys[0][0] : keys[0];
    const lastK = keys[keys.length - 1];
    const last = Array.isArray(lastK) ? lastK[0] : lastK;
    let [a0, a1] = railRange(lo, first, last, true);
    let [b0, b1] = railRange(hi, first, last, true);
    if (o.maxLen) { a1 = Math.min(a1, a0 + o.maxLen); b1 = Math.min(b1, b0 + o.maxLen); }
    const cuts = [[a0, b0]];
    for (let k = 1; k < keys.length - 1; k++) {
      const [ka, kb] = Array.isArray(keys[k]) ? keys[k] : [keys[k], keys[k]];
      if (ka - a0 < 9 || kb - b0 < 9 || a1 - ka < 9 || b1 - kb < 9) continue;
      cuts.push([ka, kb]);
    }
    cuts.push([a1, b1]);
    for (let k = 0; k < cuts.length - 1; k++) {
      const [ca0, cb0] = cuts[k];
      const [ca1, cb1] = cuts[k + 1];
      const A = (t) => { const th = (ca0 + (ca1 - ca0) * t) * DEG; return [lo(th), th]; };
      const B = (t) => { const th = (cb0 + (cb1 - cb0) * t) * DEG; return [hi(th), th]; };
      const odd = k % 2 === 1;
      const lenDeg = Math.max(ca1 - ca0, cb1 - cb0);
      const off = (o.offset ?? 0) + (odd ? o.stagger ?? 0.006 : 0);
      const lift = o.lift || (() => 0);
      const g = ribbonPlate(THREE, geo, {
        chart: dome.chart, railA: A, railB: B,
        segS: o.segS ?? 8,
        segT: Math.max(8, Math.round(lenDeg * 0.45)),
        offset: off, thickness: o.thickness ?? 0.05, bevel: o.bevel ?? 0.006,
        gapA: o.gapA ?? 0.007, gapB: o.gapB ?? 0.007,
        gap0: k === 0 ? o.gapFront ?? 0.004 : o.gapCut ?? 0.006,
        gap1: k === cuts.length - 2 ? o.gapBack ?? 0.004 : o.gapCut ?? 0.006,
        lift: (s, t) => lift(s, t, k) - (k === 0 && o.tuck ? o.tuck * (1 - THREE.MathUtils.smoothstep(t, 0, 0.18)) : 0),
      });
      const mat = typeof o.mat === 'function' ? o.mat(k) : o.mat;
      const pair = addPair(g, mat, `cranium.${id}.${k}`, 'band');
      if (o.rivets && rnd(k, o.rivets) < 0.6) {
        const rg = rivetStrip(THREE, geo, dome.chart, A, B, off + lift(0.5, 0.06, k), rnd(k, o.rivets + 9) < 0.5 ? [0.3, 0.7] : [0.25, 0.5, 0.75]);
        pair.l.add(ctx.mesh(rg, trimMat, `cranium.${id}.${k}.rivets.L`));
        pair.r.add(ctx.mesh(geo.mirrorGeometryX(rg), trimMat, `cranium.${id}.${k}.rivets.R`));
      }
      const insRaw = o.inset ? o.inset(k, lenDeg) : null;
      const insList = !insRaw ? [] : Array.isArray(insRaw[0]) ? insRaw : [insRaw];
      for (const ins of insList) {
        const [s0, s1, t0, t1] = ins;
        const mix = (p, q, s) => [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s];
        const sub = ribbonPlate(THREE, geo, {
          chart: dome.chart,
          railA: (t) => { const tt = t0 + (t1 - t0) * t; return mix(A(tt), B(tt), s0); },
          railB: (t) => { const tt = t0 + (t1 - t0) * t; return mix(A(tt), B(tt), s1); },
          segS: 4, segT: Math.max(6, Math.round(lenDeg * 0.3 * (t1 - t0))),
          offset: off, thickness: 0.03, bevel: 0.004, gap: 0.0, gap0: 0.0, gap1: 0.0,
          lift: (s, t) => lift(s0 + (s1 - s0) * s, t0 + (t1 - t0) * t, k) + 0.008,
        });
        const subMat = mat === gunA || mat === gunB ? gunA : chromeA;
        const l = ctx.mesh(sub, subMat, `cranium.${id}.${k}.inset.L`);
        const r = ctx.mesh(geo.mirrorGeometryX(sub), subMat, `cranium.${id}.${k}.inset.R`);
        pair.l.add(l); pair.r.add(r);
      }
    }
  };
  // Few BROAD plates with long sweeping seams (film / ultron-front.png):
  // a big forehead lobe either side of the crest whose outer seam arcs from
  // the brow's outer corner up and back over the crown, then one parietal
  // sweep, one temple arc and the side plates around the jaw hinge. Each band
  // is cut only where the skull turns (crown -> back), never in narrow strips.
  // Plates sit lower toward the back of the skull so they add no bulk there.
  // band 1 — forehead lobes: from the brow line over the crown
  band('band1', S0, S1, [30, [150, 146], 240],
    { mat: chromeA, offset: 0.018, stagger: -0.008, gapA: 0.006, gapB: 0.007, tuck: 0, lift: (s) => crown(0.012)(s) });
  // band 2 — parietal sweep from the brow corner back over the skull
  band('band2', S1, S2, [30, [128, 122], 250],
    { mat: chromeB, offset: 0.008, stagger: -0.006, tuck: 0, gapB: 0.007, lift: (s) => crown(0.012)(s) });
  // band 3 — temple: arcs over the ear from the temple to the back of the head
  band('band3', S2, S3, [20, [118, 112], [214, 218], 280],
    { mat: (k) => (k === 1 ? gunA : chromeA), offset: 0.014, stagger: -0.008, gapB: 0.01, lift: (s) => crown(0.01)(s) });
  // band 4 — side of the head behind the cheek ring
  band('band4', S3, S3b, [0, [140, 142], [236, 240], 300],
    { mat: (k) => (k % 2 ? gunA : chromeB), offset: 0.02, stagger: -0.006, gapA: 0.004, gapB: 0.01, lift: (s) => crown(0.008)(s) });
  // band 5 — innermost arc around the jaw hinge
  band('band5', S3b, S4, [-20, [160, 166], 320],
    { mat: (k) => (k % 2 ? chromeB : gunB), offset: 0.006, stagger: 0.006, gapB: 0.008, segS: 8, lift: (s) => crown(0.007)(s) });

  // ------------------------------------------------------------ 4b. forehead front plates
  // Face close-up / ILM concept: angular layered plates either side of the
  // crest. A slim inner plate beside the crest, a dark diagonal slot sweeping
  // from the nose-shield corner up and out, and a broad lobe split by a
  // diagonal seam into angular sub-plates with small insets. Bottoms tuck
  // under the brow (faceplate); the bands start above FORE_POLY.
  {
    const rail = (pts) => {
      const c = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(anatomy.headAngleForX(x, y), y)));
      c.arcLengthDivisions = 200;
      const v = new THREE.Vector2();
      return (t) => { c.getPointAt(THREE.MathUtils.clamp(t, 0, 1), v); return [v.x, v.y]; };
    };
    const sub = (r, t0, t1) => (t) => r(t0 + (t1 - t0) * t);
    const mixR = (a, b, k) => (t) => { const p = a(t), q = b(t); return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]; };
    const crestE = rail([[0.083, 1.035], [0.085, 1.2], [0.09, 1.4], [0.1, 1.56]]);
    const slotI = rail([[0.15, 1.035], [0.178, 1.16], [0.212, 1.31], [0.232, 1.42], [0.24, 1.52]]);
    const slotO = rail([[0.182, 1.03], [0.208, 1.15], [0.242, 1.3], [0.262, 1.4], [0.272, 1.49]]);
    const outer = rail([[0.61, 1.03], [0.6, 1.14], [0.57, 1.235], [0.51, 1.335], [0.405, 1.44]]);
    const midS = mixR(slotO, outer, 0.42);
    // plate lift: low at the bottom (under the brow), rising to the panel height
    const lf = (h) => (s, t) => h * THREE.MathUtils.smoothstep(t, 0.03, 0.2) + 0.006 + 0.004 * Math.sin(Math.PI * s);
    const P = (A, B, o) => ribbonPlate(THREE, geo, {
      chart: field.chart, railA: A, railB: B, segS: o.segS ?? 8, segT: o.segT ?? 30,
      offset: 0, thickness: 0.06, bevel: 0.006,
      gapA: o.gapA ?? 0.006, gapB: o.gapB ?? 0.006, gap0: o.gap0 ?? 0, gap1: o.gap1 ?? 0.006,
      lift: o.lift,
    });
    const defs = [
      // [name, railA, railB, opts, material]
      ['fore.inner0', sub(crestE, 0, 0.5), sub(slotI, 0, 0.5), { lift: lf(0.024), gap1: 0.004 }, chromeB],
      ['fore.inner1', sub(crestE, 0.5, 1), sub(slotI, 0.5, 1), { lift: (s, t) => 0.03 + 0.003 * Math.sin(Math.PI * s), gap0: 0.004 }, chromeA],
      ['fore.lobeIn0', sub(slotO, 0, 0.55), sub(midS, 0, 0.55), { lift: lf(0.02), gap1: 0.004 }, chromeA],
      ['fore.lobeIn1', sub(slotO, 0.55, 1), sub(midS, 0.55, 1), { lift: (s, t) => 0.026 + 0.004 * Math.sin(Math.PI * s), gap0: 0.004 }, chromeB],
      ['fore.lobeOut0', sub(midS, 0, 0.42), sub(outer, 0, 0.42), { lift: lf(0.026), gap1: 0.004 }, chromeB],
      ['fore.lobeOut1', sub(midS, 0.42, 1), sub(outer, 0.42, 1), { lift: (s, t) => 0.022 + 0.004 * Math.sin(Math.PI * s), gap0: 0.004 }, gunA],
    ];
    for (const [nm, A, B, o, mat] of defs) addPair(P(A, B, o), mat, `cranium.${nm}`, 'band');
    // slot floor: dark recessed strip in the diagonal groove
    addPair(P(slotI, slotO, { gapA: -0.002, gapB: -0.002, gap1: 0.0, lift: () => -0.01, segS: 3 }), gunB, 'cranium.fore.slot', 'band');
    // small angular insets (raised tabs) on the lobe plates
    // slim slanted slivers along the plate flow (angular seams, not windows)
    const insets = [
      [sub(mixR(slotO, midS, 0.3), 0.16, 0.48), sub(mixR(slotO, midS, 0.42), 0.2, 0.52), 0.03],
      [sub(mixR(midS, outer, 0.22), 0.08, 0.36), sub(mixR(midS, outer, 0.34), 0.12, 0.4), 0.036],
      [sub(mixR(midS, outer, 0.56), 0.5, 0.84), sub(mixR(midS, outer, 0.68), 0.46, 0.8), 0.032],
      [sub(mixR(crestE, slotI, 0.4), 0.6, 0.92), sub(mixR(crestE, slotI, 0.62), 0.64, 0.92), 0.04],
      [sub(mixR(slotO, midS, 0.62), 0.62, 0.9), sub(mixR(slotO, midS, 0.74), 0.66, 0.94), 0.034],
    ];
    insets.forEach(([A, B, h], i) => addPair(P(A, B, { gapA: 0, gapB: 0, gap1: 0, lift: () => h, segS: 3, segT: 10 }), trimMat, `cranium.fore.inset${i}`, 'band'));
  }

  // ------------------------------------------------------------ 5. jaw-hinge caps (chart pole)
  {
    const g = ribbonPlate(THREE, geo, {
      chart: dome.chart,
      railA: (t) => [S4((-40 + 380 * t) * DEG) + 0.5 * DEG, (-40 + 380 * t) * DEG],
      railB: (t) => [89.2 * DEG, (-40 + 380 * t) * DEG],
      segS: 8, segT: 72, offset: 0.014, thickness: 0.045, bevel: 0.008, gap: 0.004, gap0: 0, gap1: 0,
      lift: (s) => 0.008 * THREE.MathUtils.smoothstep(s, 0.3, 0.6),
    });
    const pair = addPair(g, chromeB, 'cranium.hinge', 'band');
    const hp = new THREE.Vector3(), hn = new THREE.Vector3();
    dome.chart(89.9 * DEG, 90 * DEG, hp, hn);
    const b = geo.ringStack([[0, 0.04], [0.026, 0.04], [0.032, 0.032], [0.05, 0.028], [0.056, 0.014], [0.062, 0.0]], 32);
    for (const [side, parent] of [[1, pair.l], [-1, pair.r]]) {
      const m = ctx.mesh(b, trimMat, `cranium.hinge.boss.${side > 0 ? 'L' : 'R'}`);
      const n = new THREE.Vector3(hn.x * side, hn.y, hn.z);
      m.position.set(hp.x * side, hp.y, hp.z).addScaledVector(n, 0.01);
      geo.faceDirection(m, n);
      parent.add(m);
    }
  }

  // ------------------------------------------------------------ 6. fin-root sockets (temple)
  // flush, layered seat AROUND the fin root (the fins part owns the socket
  // collar at the root itself). Kept LOW (<= ~0.05 proud) so the dome stays an egg.
  const temple = { L: new THREE.Group(), R: new THREE.Group() };
  temple.L.name = 'cranium.temple.L';
  temple.R.name = 'cranium.temple.R';
  root.add(temple.L, temple.R);
  const pole = new THREE.Vector3(), poleN = new THREE.Vector3();
  finChart.chart(89.5 * DEG, 90 * DEG, pole, poleN);
  const rings = [
    // [phi0, phi1, theta0, theta1, offset, thickness, material, name]
    // the centre (phi > ~81deg, r < ~0.09) is left clear for the fins' own socket collar
    [72, 80.5, -130, 230, 0.026, 0.04, gunA, 'ring0'],      // ribbed seat ring around the fin root
    [74.5, 80.5, 25, 165, 0.04, 0.025, chromeA, 'ring1'],   // upper crescent
  ];
  for (const [p0, p1, t0, t1, off, thick, mat, nm] of rings) {
    const full = t1 - t0 >= 359;
    const g = ribbonPlate(THREE, geo, {
      chart: finChart.chart,
      railA: (t) => [p0 * DEG, (t0 + (t1 - t0) * t) * DEG],
      railB: (t) => [p1 * DEG, (t0 + (t1 - t0) * t) * DEG],
      segS: 6, segT: full ? 72 : 36, offset: off, thickness: thick, bevel: 0.007, gap: 0.003,
      gap0: full ? 0 : 0.01, gap1: full ? 0 : 0.01,
      lift: (s, t) => {
        if (nm !== 'ring0') return 0.003 * Math.sin(Math.PI * s);
        const rib = Math.pow(Math.abs(Math.sin(t * Math.PI * 22)), 6);
        return 0.002 * Math.sin(Math.PI * s) - 0.005 * rib * THREE.MathUtils.smoothstep(s, 0.1, 0.35) * (1 - THREE.MathUtils.smoothstep(s, 0.65, 0.9));
      },
    });
    addPair(g, mat, `cranium.temple.${nm}`, 'temple', temple);
  }

  // ------------------------------------------------------------ back pull-in
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isMesh && o.parent === root) backWarp(THREE, o.geometry); });
  crestGroup.traverse((o) => { if (o.isMesh) backWarp(THREE, o.geometry); });

  // ------------------------------------------------------------ params
  const center = new THREE.Vector3(0, 1.05, -0.05);
  for (const p of plates) {
    p.mesh.geometry.computeBoundingSphere();
    p.dir = p.mesh.geometry.boundingSphere.center.clone().sub(center).normalize();
  }
  const templeAxis = { L: poleN.clone(), R: new THREE.Vector3(-poleN.x, poleN.y, poleN.z) };
  const templePivot = { L: pole.clone(), R: new THREE.Vector3(-pole.x, pole.y, pole.z) };
  const layerOf = (name) => (name.includes('ring1') ? 1 : 0);
  for (const key of ['L', 'R']) for (const ch of temple[key].children) {
    ch.userData.rest = ch.position.clone();
    ch.userData.layer = layerOf(ch.name);
  }
  const _q = new THREE.Quaternion();
  let breath = 0;
  const params = { panelLift: 0, crestRaise: 0, templeOpen: 0, templeSpin: 0, breathe: 0 };
  const apply = (p) => {
    // absolute: every call derives transforms from params only (idempotent)
    const lift = p.panelLift + breath;
    for (const pl of plates) {
      if (pl.kind === 'band') pl.mesh.position.copy(pl.dir).multiplyScalar(lift);
    }
    crestGroup.position.set(0, 0, 0);
    const cd = new THREE.Vector3(0, 0.8, -0.6).normalize();
    crestGroup.position.copy(cd).multiplyScalar(lift * 0.5 + p.crestRaise);
    for (const key of ['L', 'R']) {
      const g = temple[key];
      const ax = templeAxis[key];
      const piv = templePivot[key];
      g.quaternion.copy(_q.setFromAxisAngle(ax, p.templeSpin * (key === 'L' ? 1 : -1)));
      g.position.copy(piv).sub(piv.clone().applyQuaternion(g.quaternion)).addScaledVector(ax, lift * 0.6);
      for (const ch of g.children) {
        ch.position.copy(ch.userData.rest).addScaledVector(ax, p.templeOpen * 0.022 * ch.userData.layer);
      }
    }
  };
  return {
    params,
    paramSpec: {
      panelLift: { min: 0, max: 0.08, step: 0.001 },
      crestRaise: { min: 0, max: 0.06, step: 0.001 },
      templeOpen: { min: 0, max: 1, step: 0.01 },
      templeSpin: { min: -0.6, max: 0.6, step: 0.01 },
      breathe: { min: 0, max: 1, step: 0.01 },
    },
    apply,
    update(time, dt, p) {
      const b = p.breathe > 0 ? p.breathe * 0.006 * (0.5 + 0.5 * Math.sin(time * 1.3)) : 0;
      if (b !== breath) { breath = b; apply(p); }
    },
  };
}

// ===========================================================================
// Local geometry helpers (candidates for src/ultron/geometry.js)
// ===========================================================================
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/**
 * Fast, allocation-free sampler of the shared head shell: anatomy.headSection
 * tabulated at 1 mm steps. F(x,y,z) is the superellipse implicit (<0 inside),
 * normals come from its gradient (well defined right up to the crown).
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
  return { section, F, normalAt, surface, chart, surfaceFn: (u, y, P = new THREE.Vector3()) => surface(u, y, P), normalFn: (u, y, N = new THREE.Vector3()) => normalAt(surface(u, y, new THREE.Vector3()), N) };
}

/**
 * Spherical chart on the head shell, centred at C. phi = lateral angle
 * (+X = model's left), theta = angle in the sagittal plane (0 front, 90deg up).
 * Points are found by ray casting the superellipse head shell.
 */
function makeDomeChart(THREE, field, C) {
  const { F, normalAt } = field;
  let dx = 0, dy = 0, dz = 0, last = 0;
  const f = (r) => F(C.x + dx * r, C.y + dy * r, C.z + dz * r);
  const radius = (phi, th) => {
    const cp = Math.cos(phi);
    dx = Math.sin(phi); dy = cp * Math.sin(th); dz = cp * Math.cos(th);
    // warm start from the previous ray (neighbouring vertices are close)
    let a = 0.05, b = 0.2, fa, fb;
    const ga = last * 0.94, gb = last * 1.06;
    const fga = last > 0.1 ? f(ga) : 1;
    const fgb = fga < 0 ? f(gb) : -1;
    if (fga < 0 && fgb > 0) { a = ga; fa = fga; b = gb; fb = fgb; }
    else {
      fa = f(a); fb = f(b);
      while (fb < 0 && b < 3) { a = b; fa = fb; b += 0.15; fb = f(b); }
    }
    // Illinois false position (bracketed, robust to the clamped implicit)
    let side = 0;
    for (let i = 0; i < 40; i++) {
      const c = (a * fb - b * fa) / (fb - fa);
      const fc = f(c);
      if (Math.abs(fc) < 1e-7 || b - a < 2e-6) return (last = c);
      if (fc > 0) { b = c; fb = fc; if (side === -1) fa *= 0.5; side = -1; }
      else { a = c; fa = fc; if (side === 1) fb *= 0.5; side = 1; }
    }
    return (last = 0.5 * (a + b));
  };
  const point = (phi, th, P) => {
    const r = radius(phi, th);
    return P.set(C.x + dx * r, C.y + dy * r, C.z + dz * r);
  };
  const chart = (phi, th, P, N) => { point(phi, th, P); normalAt(P, N); };
  return { chart, radius, point };
}

/** Merged row of small rivet bosses across a band segment near its front cut. */
function rivetStrip(THREE, geo, chart, A, B, h, ss) {
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  const parts = [];
  for (const s of ss) {
    const a = A(0.06), b = B(0.06);
    chart(a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, P, N);
    const g = geo.ringStack([[0, 0.014], [0.008, 0.014], [0.011, 0.009], [0.012, -0.01]], 12);
    const o = new THREE.Object3D();
    o.position.copy(P).addScaledVector(N, h);
    geo.faceDirection(o, N);
    o.updateMatrix();
    g.applyMatrix4(o.matrix);
    parts.push(g);
  }
  const m = geo.mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  m.computeBoundingSphere();
  return m;
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
  const tm = tAt(0.5 * (L0 + L1));
  const am = A(tm), bm = B(tm);
  const c0 = mix(am, bm, 0.4), c1 = mix(am, bm, 0.6);
  const cm = mix(am, bm, 0.5);
  const t2 = tAt(Math.min(total, 0.5 * (L0 + L1) + 0.01));
  const t1 = tAt(Math.max(0, 0.5 * (L0 + L1) - 0.01));
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
