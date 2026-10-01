/**
 * PART: cranium — skull dome, central crest, flowing armour bands, layered
 * temple fin mounts, jaw-hinge caps, back of the head, and the dark
 * under-shell that shows through every panel gap.
 * Joint: head. Authoring space: HEAD.
 *
 * Layout: the dome is described in a spherical "dome chart" (phi, theta)
 * whose axis runs through both jaw hinges. theta sweeps brow (~40deg) -> crown
 * (~100deg) -> back of the head (180deg+); phi is the lateral angle away from
 * the mid-plane. Seams are curves phi_i(theta): seen from the side they are
 * long arcs sweeping from the brow back over the skull and down the sides;
 * seen from the front the forehead lobes taper into the crest (tulip shape).
 *
 * Sub-meshes: cranium.core, cranium.crest, cranium.crest.tab,
 * cranium.band{1..4}.{k}.{L,R}, cranium.hinge.{L,R},
 * cranium.temple.{L,R} (group) -> cranium.temple.ring{0..2}.{L,R}, cranium.temple.boss.{L,R}
 *
 * Params: panelLift (armour "breathes" outward), crestRaise, templeOpen
 * (temple layers fan out along the fin axis), templeSpin (temple mount twist).
 */
export const meta = {
  id: 'cranium',
  explode: [0, 0.9, -0.5],
};

const DEG = Math.PI / 180;

export function build(ctx) {
  const { THREE, geo, anatomy, materials: M } = ctx;
  const root = ctx.space('head', 'head');

  // ------------------------------------------------------------ materials
  const core = M.get('darkMetal');
  const chromeA = M.get('chrome', { panel: 2.6, seed: 11, lineWidth: 0.0035, lineDepth: 0.75 });
  const chromeB = M.get('chrome', { panel: 3.4, seed: 17, lineWidth: 0.0035, lineDepth: 0.8, roughness: 0.22 });
  const gunA = M.get('gunmetal', { panel: 3.0, seed: 23, lineWidth: 0.0035, lineDepth: 0.8 });
  const crestMat = M.get('chrome', { roughness: 0.3, panel: 1.6, seed: 3, lineWidth: 0.003, lineDepth: 0.6 });
  const trimMat = M.get('chrome', { roughness: 0.12 });
  const gunB = M.get('gunmetal', { panel: 5.0, seed: 29, lineWidth: 0.003, lineDepth: 0.85, roughness: 0.3 });
  // below the bloom threshold: reads as thin glowing seam light, not a bloom source
  const seamGlow = M.get('redAccent', { intensity: 1.9 });

  // ------------------------------------------------------------ charts
  const field = makeHeadField(THREE, anatomy);
  const hinge = anatomy.JOINTS.jaw.pos;
  const dome = makeDomeChart(THREE, field, new THREE.Vector3(0, hinge[1] + 0.02, hinge[2] - 0.02));
  const finRoot = anatomy.JOINTS.finL.pos;
  const finChart = makeDomeChart(THREE, field, new THREE.Vector3(0, finRoot[1], finRoot[2] - 0.02));

  // ------------------------------------------------------------ 1. dark under-shell
  const under = geo.surfaceSheet({
    surface: field.surfaceFn, normal: field.normalFn,
    u0: -Math.PI, u1: Math.PI, y0: -0.28, y1: 1.995, segU: 160, segV: 110, offset: -0.028,
    // keep clear of the eye sockets and cheek discs so they stay visible
    keep: (p) => !anatomy.insideCutout(p, ['eyeL', 'eyeR', 'cheekL', 'cheekR'], -0.01),
  });
  root.add(ctx.mesh(under, core, 'cranium.core'));

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
  // crest half width (world units): narrow tip on the forehead, broad over the crown
  const crestW = (th) => {
    const d = th / DEG;
    const front = THREE.MathUtils.smoothstep(d, 50, 92);
    const back = 1 - 0.4 * THREE.MathUtils.smoothstep(d, 150, 210);
    return (0.062 + 0.05 * front) * back;
  };
  const S0 = (th) => Math.asin(Math.min(0.95, crestW(th) / rMid(th)));
  //                  -30  0   30  60  90 120 150 180 210 240 270 300 330
  const S1 = keyed([30, 30, 29, 17, 6.5, 8, 12, 15, 17, 19, 21, 23, 25]);
  const S2 = keyed([55, 55, 51, 37, 23, 20, 23, 28, 32, 36, 40, 44, 48]);
  const S3 = keyed([72, 72, 68, 55, 41, 37, 40, 45, 50, 55, 59, 63, 67]);
  const S3b = keyed([78, 78, 76, 67, 57, 54, 56, 60, 64, 68, 71, 74, 77]);
  const S4 = keyed([84, 84, 83, 79, 74, 72, 73, 75, 78, 80, 82, 83, 84]);

  // ------------------------------------------------------------ 3. crest
  const crestT0 = 50 * DEG, crestT1 = 212 * DEG;
  const crestTh = (t) => crestT0 + (crestT1 - crestT0) * t;
  const crestGeo = ribbonPlate(THREE, geo, {
    chart: dome.chart,
    railA: (t) => [-S0(crestTh(t)), crestTh(t)],
    railB: (t) => [S0(crestTh(t)), crestTh(t)],
    segS: 18, segT: 90, offset: 0.016, thickness: 0.07, bevel: 0.014, gap: 0.0, gap0: 0.0, gap1: 0.0,
    lift: (s, t) => {
      const e = Math.abs(2 * s - 1);
      const plateau = 1 - THREE.MathUtils.smoothstep(e, 0.42, 0.95);
      const channel = Math.exp(-Math.pow((2 * s - 1) / 0.09, 2));
      const nose = THREE.MathUtils.smoothstep(t, 0.0, 0.1);
      return (0.012 + 0.03 * plateau - 0.008 * channel * plateau) * (0.8 + 0.2 * nose);
    },
  });
  addPlate(crestGeo, crestMat, 'cranium.crest', 'crest');

  // keystone tab where the crest lands on the forehead
  const tab = ribbonPlate(THREE, geo, {
    chart: dome.chart,
    railA: (t) => { const th = (60 + 14 * t) * DEG; return [-S0(th) * 0.6, th]; },
    railB: (t) => { const th = (60 + 14 * t) * DEG; return [S0(th) * 0.6, th]; },
    segS: 10, segT: 14, offset: 0.052, thickness: 0.05, bevel: 0.008, gap: 0.0, gap0: 0.0, gap1: 0.0,
    lift: (s) => 0.006 * (1 - Math.pow(Math.abs(2 * s - 1), 4)),
  });
  addPlate(tab, trimMat, 'cranium.crest.tab', 'crest');

  // ------------------------------------------------------------ 4. flowing bands
  // band: between seams lo/hi, split into segments at theta keys. Each split can
  // be slanted (different theta on the inner and outer rail) and plates can
  // overlap (negative gap) to read as layered armour. `inset(k)` may return a
  // secondary plate [s0, s1, t0, t1] riding on segment k (plates on plates).
  const band = (id, lo, hi, cuts, o) => {
    for (let k = 0; k < cuts.length - 1; k++) {
      const [a0, b0] = Array.isArray(cuts[k]) ? cuts[k] : [cuts[k], cuts[k]];
      const [a1, b1] = Array.isArray(cuts[k + 1]) ? cuts[k + 1] : [cuts[k + 1], cuts[k + 1]];
      const A = (t) => { const th = (a0 + (a1 - a0) * t) * DEG; return [lo(th), th]; };
      const B = (t) => { const th = (b0 + (b1 - b0) * t) * DEG; return [hi(th), th]; };
      const odd = k % 2 === 1;
      const lenDeg = Math.max(a1 - a0, b1 - b0);
      const off = (o.offset ?? 0) + (odd ? o.stagger ?? 0.006 : 0);
      const lift = o.lift || (() => 0);
      const g = ribbonPlate(THREE, geo, {
        chart: dome.chart, railA: A, railB: B,
        segS: o.segS ?? 8,
        segT: Math.max(8, Math.round(lenDeg * 0.45)),
        offset: off, thickness: 0.06, bevel: o.bevel ?? 0.006,
        gapA: o.gapA ?? 0.007, gapB: o.gapB ?? 0.007,
        gap0: k === 0 ? o.gapFront ?? 0.006 : o.gapCut ?? 0.006,
        gap1: k === cuts.length - 2 ? o.gapBack ?? 0.006 : o.gapCut ?? 0.006,
        lift: (s, t) => lift(s, t, k),
      });
      const mat = typeof o.mat === 'function' ? o.mat(k) : o.mat;
      const pair = addPair(g, mat, `cranium.${id}.${k}`, 'band');
      if (o.rivets && rnd(k, o.rivets) < 0.75) {
        // pair of small bosses near the leading cut (rivet / notch detail)
        const rg = rivetStrip(THREE, geo, dome.chart, A, B, off + lift(0.5, 0.06, k), rnd(k, o.rivets + 9) < 0.5 ? [0.3, 0.7] : [0.25, 0.5, 0.75]);
        pair.l.add(ctx.mesh(rg, trimMat, `cranium.${id}.${k}.rivets.L`));
        pair.r.add(ctx.mesh(geo.mirrorGeometryX(rg), trimMat, `cranium.${id}.${k}.rivets.R`));
      }
      const insList = o.inset ? [].concat(o.inset(k) && Array.isArray(o.inset(k)[0]) ? o.inset(k) : [o.inset(k)]) : [];
      for (const ins of insList) {
        if (!ins) continue;
        const [s0, s1, t0, t1] = ins;
        const mix = (p, q, s) => [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s];
        const sub = ribbonPlate(THREE, geo, {
          chart: dome.chart,
          railA: (t) => { const tt = t0 + (t1 - t0) * t; return mix(A(tt), B(tt), s0); },
          railB: (t) => { const tt = t0 + (t1 - t0) * t; return mix(A(tt), B(tt), s1); },
          segS: 4, segT: Math.max(6, Math.round(lenDeg * 0.3 * (t1 - t0))),
          offset: off, thickness: 0.03, bevel: 0.004, gap: 0.0, gap0: 0.0, gap1: 0.0,
          lift: (s, t) => lift(s0 + (s1 - s0) * s, t0 + (t1 - t0) * t, k) + 0.009,
        });
        const subMat = mat === gunA || mat === gunB ? chromeB : (rnd(k, s0 * 7) < 0.5 ? gunB : gunA);
        const l = ctx.mesh(sub, subMat, `cranium.${id}.${k}.inset.L`);
        const r = ctx.mesh(geo.mirrorGeometryX(sub), subMat, `cranium.${id}.${k}.inset.R`);
        pair.l.add(l); pair.r.add(r);
      }
    }
  };
  // subtle crowned cross-section so plates catch light like pressed metal
  const crown = (amp) => (s) => amp * Math.sin(Math.PI * THREE.MathUtils.clamp(s, 0, 1));
  // deterministic pseudo-random for inset placement
  const rnd = (k, salt) => { const x = Math.sin(k * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); };
  // insets are long strips that follow the band flow (or short end tabs)
  const insetEvery = (salt, prob = 0.6) => (k) => {
    if (rnd(k, salt) > prob) return null;
    if (rnd(k, salt + 11) < 0.35) {
      // two short tabs, front and back (stepped panel pair)
      return [[0.2, 0.62, 0.08, 0.38], [0.38, 0.8, 0.55, 0.9]];
    }
    const r = rnd(k, salt + 1);
    if (r < 0.6) {
      const a = 0.24 + 0.14 * rnd(k, salt + 2);
      return [a, a + 0.24 + 0.12 * rnd(k, salt + 3), 0.08 + 0.1 * rnd(k, salt + 4), 0.8 + 0.1 * rnd(k, salt + 5)];
    }
    const front = rnd(k, salt + 6) < 0.5;
    return front ? [0.22, 0.78, 0.07, 0.3 + 0.1 * rnd(k, salt + 7)] : [0.22, 0.78, 0.6 + 0.1 * rnd(k, salt + 7), 0.93];
  };

  // band 1 — forehead lobes: from under the brow, tapering into the crown, down the back
  band('band1', S0, S1,
    [[44, 44], [84, 78], [122, 128], [160, 164], [190, 194], [216, 214]],
    { mat: (k) => (k === 1 ? gunB : k % 2 ? chromeB : chromeA), offset: 0.022, stagger: 0.01, gapA: 0.02, gapB: 0.009, lift: (s) => crown(0.012)(s), rivets: 41,
      inset: (k) => (k === 0 ? [[0.42, 0.82, 0.3, 0.62], [0.3, 0.7, 0.7, 0.92]] : k === 1 ? [[0.3, 0.75, 0.1, 0.4], [0.3, 0.75, 0.55, 0.88]] : k === 2 || k === 4 ? [0.3, 0.8, 0.15, 0.7] : k === 3 ? [0.25, 0.7, 0.2, 0.8] : null) });
  // band 2 — long sweep from the brow corner back over the skull
  band('band2', S1, S2,
    [[42, 50], [70, 76], [100, 96], [130, 126], [160, 156], [192, 194], [226, 230]],
    { mat: (k) => (k % 2 ? gunA : chromeA), offset: 0.0, stagger: 0.012, gapB: 0.009, lift: (s) => crown(0.011)(s), inset: insetEvery(2, 0.85), rivets: 42 });
  // band 3 — arcs over the ear from the temple to the back of the head
  band('band3', S2, S3,
    [[58, 62], [86, 80], [114, 110], [142, 138], [172, 170], [204, 206], [232, 236], [256, 260]],
    { mat: (k) => (k % 2 ? chromeB : k % 4 === 0 ? gunB : gunA), offset: 0.014, stagger: -0.01, gapB: 0.009, lift: (s) => crown(0.01)(s), inset: insetEvery(3, 0.85), rivets: 43 });
  // band 4 — lower arc behind the cheek, shingled over band 3
  band('band4', S3, S3b,
    [[62, 60], [96, 94], [130, 132], [166, 168], [204, 208], [240, 244], [272, 276]],
    { mat: (k) => (k % 2 ? gunA : chromeA), offset: 0.03, stagger: 0.01, gapA: -0.014, gapB: 0.008, lift: (s) => crown(0.008)(s), inset: insetEvery(4, 0.8) });
  // band 5 — innermost arc around the jaw hinge
  band('band5', S3b, S4,
    [[40, 40], [90, 86], [140, 140], [196, 200], [250, 254], [300, 300]],
    { mat: (k) => (k % 2 ? chromeB : gunB), offset: 0.006, stagger: 0.008, gapB: 0.008, segS: 8, lift: (s) => crown(0.007)(s), inset: insetEvery(5, 0.6) });

  // ------------------------------------------------------------ 4b. red glowing seam inlays
  // a few deliberate lit seams (poster ref): crest flanks over the forehead,
  // the forehead-lobe seam above the brows, and a short temple seam.
  {
    const strip = (phiFn, th0, th1, dPhi, name, steps = 40) => {
      const P = new THREE.Vector3(), N = new THREE.Vector3();
      const pts = [], nrm = [];
      for (let i = 0; i <= 24; i++) {
        const th = (th0 + (th1 - th0) * (i / 24)) * DEG;
        const r = rMid(th);
        dome.chart(phiFn(th) + dPhi / r, th, P, N);
        pts.push(P.clone().addScaledVector(N, 0.004));
        nrm.push(N.clone());
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const g = geo.sweptSection(curve, geo.roundedSection(0.0034, 0.006, 2, 8), {
        steps, up: (t) => nrm[Math.round(t * 24)], scale: (t) => [1, Math.min(1, t * 10, (1 - t) * 10)],
      });
      root.add(ctx.mesh(g, seamGlow, `${name}.L`));
      root.add(ctx.mesh(geo.mirrorGeometryX(g), seamGlow, `${name}.R`));
    };
    strip(S0, 62, 128, 0.01, 'cranium.glow.crest');
    strip(S1, 46, 96, 0.0, 'cranium.glow.forehead');
    strip(S2, 46, 92, 0.0, 'cranium.glow.temple');
  }

  // ------------------------------------------------------------ 5. jaw-hinge caps (chart pole)
  {
    const g = ribbonPlate(THREE, geo, {
      chart: dome.chart,
      railA: (t) => [S4((-40 + 380 * t) * DEG) + 0.5 * DEG, (-40 + 380 * t) * DEG],
      railB: (t) => [89.2 * DEG, (-40 + 380 * t) * DEG],
      segS: 8, segT: 72, offset: 0.016, thickness: 0.05, bevel: 0.01, gap: 0.004, gap0: 0, gap1: 0,
      lift: (s) => 0.01 * THREE.MathUtils.smoothstep(s, 0.3, 0.6),
    });
    const pair = addPair(g, chromeB, 'cranium.hinge', 'band');
    const hp = new THREE.Vector3(), hn = new THREE.Vector3();
    dome.chart(89.9 * DEG, 90 * DEG, hp, hn);
    const b = geo.ringStack([[0, 0.05], [0.03, 0.05], [0.036, 0.04], [0.058, 0.036], [0.066, 0.02], [0.074, 0.0]], 36);
    for (const [side, parent] of [[1, pair.l], [-1, pair.r]]) {
      const m = ctx.mesh(b, trimMat, `cranium.hinge.boss.${side > 0 ? 'L' : 'R'}`);
      const n = new THREE.Vector3(hn.x * side, hn.y, hn.z);
      m.position.set(hp.x * side, hp.y, hp.z).addScaledVector(n, 0.012);
      geo.faceDirection(m, n);
      parent.add(m);
    }
  }

  // ------------------------------------------------------------ 6. temple fin mounts
  // layered, overlapping plates around the fin root with depth steps
  const temple = { L: new THREE.Group(), R: new THREE.Group() };
  temple.L.name = 'cranium.temple.L';
  temple.R.name = 'cranium.temple.R';
  root.add(temple.L, temple.R);
  const pole = new THREE.Vector3(), poleN = new THREE.Vector3();
  finChart.chart(89.5 * DEG, 90 * DEG, pole, poleN);
  const rings = [
    // [phi0, phi1, theta0, theta1, offset, material, name]
    [78, 89.4, -130, 230, 0.03, gunA, 'ring0'],        // socket plate (full ring, ribbed)
    [81.5, 89.6, 10, 200, 0.056, chromeA, 'ring1'],    // upper crescent
    [85, 89.7, 40, 150, 0.078, chromeB, 'ring2'],      // top feather
  ];
  for (const [p0, p1, t0, t1, off, mat, nm] of rings) {
    const full = t1 - t0 >= 359;
    const g = ribbonPlate(THREE, geo, {
      chart: finChart.chart,
      railA: (t) => [p0 * DEG, (t0 + (t1 - t0) * t) * DEG],
      railB: (t) => [p1 * DEG, (t0 + (t1 - t0) * t) * DEG],
      segS: 6, segT: full ? 72 : 36, offset: off, thickness: 0.05, bevel: 0.009, gap: 0.003,
      gap0: full ? 0 : 0.01, gap1: full ? 0 : 0.01,
      lift: (s, t) => {
        if (nm !== 'ring0') return 0.004 * Math.sin(Math.PI * s);
        // ribbed vents on the socket plate (the reference's grilled temples)
        const rib = Math.pow(Math.abs(Math.sin(t * Math.PI * 22)), 6);
        return 0.003 * Math.sin(Math.PI * s) - 0.006 * rib * THREE.MathUtils.smoothstep(s, 0.1, 0.35) * (1 - THREE.MathUtils.smoothstep(s, 0.65, 0.9));
      },
    });
    addPair(g, mat, `cranium.temple.${nm}`, 'temple', temple);
  }
  // central boss under the fin socket
  {
    const b = geo.ringStack([[0, 0.045], [0.04, 0.045], [0.048, 0.035], [0.07, 0.032], [0.08, 0.016], [0.09, 0.0]], 36);
    for (const side of [1, -1]) {
      const m = ctx.mesh(b, trimMat, `cranium.temple.boss.${side > 0 ? 'L' : 'R'}`);
      const n = new THREE.Vector3(poleN.x * side, poleN.y, poleN.z);
      m.position.set(pole.x * side, pole.y, pole.z).addScaledVector(n, 0.03);
      geo.faceDirection(m, n);
      (side > 0 ? temple.L : temple.R).add(m);
      plates.push({ mesh: m, kind: 'temple' });
    }
  }

  // ------------------------------------------------------------ params
  const center = new THREE.Vector3(0, 1.05, -0.05);
  for (const p of plates) {
    p.mesh.geometry.computeBoundingSphere();
    p.dir = p.mesh.geometry.boundingSphere.center.clone().sub(center).normalize();
  }
  const templeAxis = { L: poleN.clone(), R: new THREE.Vector3(-poleN.x, poleN.y, poleN.z) };
  const templePivot = { L: pole.clone(), R: new THREE.Vector3(-pole.x, pole.y, pole.z) };
  const layerOf = (name) => (name.includes('ring1') ? 1 : name.includes('ring2') ? 2 : name.includes('boss') ? 3 : 0);
  for (const key of ['L', 'R']) for (const ch of temple[key].children) {
    ch.userData.rest = ch.position.clone();
    ch.userData.layer = layerOf(ch.name);
  }
  const _q = new THREE.Quaternion();
  const params = { panelLift: 0, crestRaise: 0, templeOpen: 0, templeSpin: 0 };
  return {
    params,
    paramSpec: {
      panelLift: { min: 0, max: 0.08, step: 0.001 },
      crestRaise: { min: 0, max: 0.06, step: 0.001 },
      templeOpen: { min: 0, max: 1, step: 0.01 },
      templeSpin: { min: -0.6, max: 0.6, step: 0.01 },
    },
    apply(p) {
      // absolute: every call derives transforms from params only (idempotent)
      for (const pl of plates) {
        if (pl.kind === 'band') pl.mesh.position.copy(pl.dir).multiplyScalar(p.panelLift);
        else if (pl.kind === 'crest') pl.mesh.position.copy(pl.dir).multiplyScalar(p.panelLift * 0.5 + p.crestRaise);
      }
      for (const key of ['L', 'R']) {
        const g = temple[key];
        const ax = templeAxis[key];
        const piv = templePivot[key];
        // spin the rosette about the fin axis (through the pole) ...
        g.quaternion.copy(_q.setFromAxisAngle(ax, p.templeSpin * (key === 'L' ? 1 : -1)));
        g.position.copy(piv).sub(piv.clone().applyQuaternion(g.quaternion)).addScaledVector(ax, p.panelLift * 0.6);
        // ... and fan its layers outward (each layer steps further)
        for (const ch of g.children) {
          ch.position.copy(ch.userData.rest).addScaledVector(ax, p.templeOpen * 0.022 * ch.userData.layer);
        }
      }
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
  let dx = 0, dy = 0, dz = 0;
  const f = (r) => F(C.x + dx * r, C.y + dy * r, C.z + dz * r);
  const radius = (phi, th) => {
    const cp = Math.cos(phi);
    dx = Math.sin(phi); dy = cp * Math.sin(th); dz = cp * Math.cos(th);
    let a = 0.05, b = 0.2;
    let fa = f(a), fb = f(b);
    while (fb < 0 && b < 3) { a = b; fa = fb; b += 0.15; fb = f(b); }
    // Illinois false position (bracketed, robust to the clamped implicit)
    let side = 0;
    for (let i = 0; i < 40; i++) {
      const c = (a * fb - b * fa) / (fb - fa);
      const fc = f(c);
      if (Math.abs(fc) < 1e-9 || b - a < 1e-7) return c;
      if (fc > 0) { b = c; fb = fc; if (side === -1) fa *= 0.5; side = -1; }
      else { a = c; fa = fc; if (side === 1) fb *= 0.5; side = 1; }
    }
    return 0.5 * (a + b);
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
