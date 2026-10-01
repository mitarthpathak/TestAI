/**
 * PART: lips — thick, rounded, stern lip plates around the mouth slit.
 *
 * Authored on the final head shell (FACE_WARP off), HEAD space, on the same
 * forward "muzzle" surface as the jaw (shell front + centre bulge).
 *
 *  - lips.upper.L/R : upper lip halves (joint lipUpper, rides the head). The
 *                     halves stop short of the centre line, leaving the small
 *                     central notch of the concept sheet.
 *  - lips.lower.L/R : lower lip halves (joint lipLower, child of jaw -> follow `open`).
 *  - lips.slit      : dark seam strip behind the lip line (head).
 *  - lips.notch     : dark recess behind the central notch (head).
 *  - lips.corner.L/R on pivots lips.cornerPivot.L/R (+ lips.cornerStretch.*):
 *                     rounded end caps that track the midpoint between both
 *                     lips every frame, so they stretch when the mouth opens.
 *
 * Expressions are morph targets on every lip half (smile, frown, sneer, press)
 * plus joint offsets (part). Per-side weights allow asymmetric expressions.
 * Params: part, smile (-1 frown .. +1 smile), asym (-1..1, shifts smile to one
 * side), sneer, press.
 */
export const meta = {
  id: 'lips',
  explode: [0, -0.3, 1.1],
};

export function build(ctx) {
  const { THREE, geo, anatomy: A, rig, materials: M } = ctx;
  const V3 = THREE.Vector3;
  const { lerp, clamp, smoothstep: sstep } = THREE.MathUtils;
  const { headSection, headFrontZ } = A;
  const LM = A.LANDMARKS;

  const upperRoot = ctx.space('lipUpper', 'head');
  const lowerRoot = ctx.space('lipLower', 'head');
  const headRoot = ctx.space('head', 'head');
  headRoot.name = 'lips@head';

  const upperMat = M.get('chrome', { roughness: 0.16, clearcoat: 0.4, clearcoatRoughness: 0.2, panel: 9, seed: 83, lineWidth: 0.0022, lineDepth: 0.45 });
  const lowerMat = M.get('chrome', { roughness: 0.2, clearcoat: 0.35, clearcoatRoughness: 0.22, panel: 9, seed: 84, lineWidth: 0.0022, lineDepth: 0.45 });
  const cornerMat = M.get('gunmetal', { roughness: 0.24 });
  const slitMat = M.get('cavity');

  // ------------------------------------------------------------ muzzle surface (same as jaw.js)
  const bulge = (x, y) => {
    const fx = Math.exp(-Math.pow(Math.abs(x) / 0.27, 3));
    const fy = sstep(y, -0.3, -0.12) * (1 - 0.35 * sstep(y, 0.2, 0.32));
    return 0.032 * fx * fy;
  };
  const muzZ = (x, y) => {
    const z = headFrontZ(x, y);
    return z == null ? headSection(y).zc : z + bulge(x, y);
  };
  const frontOut = (x, y, t = new V3()) => {
    const h = 1e-3;
    const dzx = (muzZ(x + h, y) - muzZ(x - h, y)) / (2 * h);
    const dzy = (muzZ(x, y + h) - muzZ(x, y - h)) / (2 * h);
    return t.set(-dzx, -dzy, 1).normalize();
  };
  const _N = new V3();
  const facePoint = (x, y, n, t = new V3()) => {
    frontOut(x, y, _N);
    return t.set(x, y, muzZ(x, y)).addScaledVector(_N, n);
  };

  // ------------------------------------------------------------ layout
  const MOUTH_Y = LM.mouthCenter[1];
  const W = LM.mouthHalfWidth - 0.012;   // lip ends; the corner caps reach mouthHalfWidth
  const NOTCH = 0.012;                   // half width of the central notch in the upper lip
  // stern mouth line: flat in the middle, corners turned down
  const slitY = (x) => { const s = Math.abs(x) / W; return MOUTH_Y - 0.004 * s * s - 0.018 * s ** 4; };
  const GAP = 0.008;                                   // half height of the dark seam
  const upperH = (s) => 0.054 - 0.018 * s * s;
  const lowerH = (s) => 0.056 - 0.016 * s * s;
  const taper = (s) => Math.max(0.35, 1 - 0.55 * Math.pow(Math.abs(s), 3));

  // closed cross-sections: [v (0 = seam side, 1 = outer edge, normalised by height), n (forward offset)]
  const UPPER = [
    [1.0, -0.012], [1.05, 0.004], [0.95, 0.018], [0.75, 0.028], [0.45, 0.035], [0.2, 0.036],
    [0.05, 0.03], [-0.02, 0.016], [0.0, 0.002], [0.12, -0.012],
  ];
  const LOWER = UPPER.map(([v, n]) => [-v, n]).reverse();
  const sampleProfile = (pts, count) => {
    const c = new THREE.CatmullRomCurve3(pts.map(([v, n]) => new V3(v, n * 12, 0)), true, 'centripetal', 0.5);
    return c.getSpacedPoints(count).slice(0, count).map((p) => [p.x, p.y / 12]);
  };
  const PROF_N = 28;
  const profU = sampleProfile(UPPER, PROF_N);
  const profL = sampleProfile(LOWER, PROF_N);

  // expression deformations at normalised position s (0 centre .. 1 corner)
  const MORPHS = ['smile', 'frown', 'sneer', 'press'];
  const deform = (name, s, which) => {
    const s2 = s * s;
    const d = { dx: 0, dy: 0, dn: 0, sn: 1, sv: 1 };
    if (name === 'smile') { d.dy = 0.03 * s2 * s; d.dx = 0.012 * s2; d.dn = -0.01 * s2; }
    else if (name === 'frown') { d.dy = -0.026 * s2 * s; d.dx = -0.004 * s2; d.dn = 0.004 * s2; }
    else if (name === 'sneer') {
      if (which === 'upper') { d.dy = 0.018 * (1 - 0.7 * s2); d.dn = 0.008 * (1 - s2); d.sv = 1.12; }
      else { d.dn = 0.004 * (1 - s2); d.dy = -0.004 * (1 - s2); }
    } else if (name === 'press') { d.sn = 0.55; d.sv = 0.8; d.dn = -0.004; }
    return d;
  };

  /** lofted half-lip (side = +1 left / -1 right) */
  function lipPositions(which, side, morph) {
    const prof = which === 'upper' ? profU : profL;
    const NX = 26;
    const x0 = which === 'upper' ? NOTCH : 0;
    const pos = [];
    const P = new V3();
    for (let i = 0; i <= NX; i++) {
      const t = i / NX;
      const ax = lerp(x0, W, Math.sin(t * Math.PI / 2)); // denser toward the corner
      const s = ax / W;
      const d = morph ? deform(morph, s, which) : { dx: 0, dy: 0, dn: 0, sn: 1, sv: 1 };
      const h = (which === 'upper' ? upperH(s) : lowerH(s)) * d.sv;
      const k = taper(s) * d.sn * (which === 'upper' ? 1 : 0.86);
      // at the notch the upper lip rounds off (cap)
      const notchRound = which === 'upper' ? 1 - 0.35 * Math.exp(-Math.pow((ax - x0) / 0.008, 2)) : 1;
      for (const [v, nn] of prof) {
        const x = side * (ax + d.dx);
        const y = slitY(ax) + (which === 'upper' ? GAP : -GAP) + v * h + d.dy;
        facePoint(x, y, nn * k * notchRound + d.dn * Math.min(1, Math.abs(v) * 4 + 0.2), P);
        pos.push(P.x, P.y, P.z);
      }
    }
    return { pos, NX, NP: prof.length };
  }

  function buildLip(which, side) {
    const base = lipPositions(which, side, null);
    const { NX, NP } = base;
    const index = [];
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NP; j++) {
        const a = i * NP + j, b = i * NP + ((j + 1) % NP), c = (i + 1) * NP + ((j + 1) % NP), d = (i + 1) * NP + j;
        index.push(a, b, d, b, c, d);
      }
    }
    const capStart = (NX + 1) * NP;
    const addCaps = (pos) => {
      for (const i of [0, NX]) {
        let cx = 0, cy = 0, cz = 0;
        for (let j = 0; j < NP; j++) { cx += pos[(i * NP + j) * 3]; cy += pos[(i * NP + j) * 3 + 1]; cz += pos[(i * NP + j) * 3 + 2]; }
        pos.push(cx / NP, cy / NP, cz / NP);
      }
      return pos;
    };
    for (const [k, i] of [[0, 0], [1, NX]]) {
      for (let j = 0; j < NP; j++) {
        const a = i * NP + j, b = i * NP + ((j + 1) % NP);
        if (k === 0) index.push(capStart + k, b, a); else index.push(capStart + k, a, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(addCaps(base.pos), 3));
    const uv = [];
    for (let i = 0; i < g.attributes.position.count; i++) uv.push(g.attributes.position.getX(i), g.attributes.position.getY(i));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    // orient outward: the most forward vertex must face +z
    let best = 0;
    for (let i = 0; i < g.attributes.position.count; i++) if (g.attributes.position.getZ(i) > g.attributes.position.getZ(best)) best = i;
    if (g.attributes.normal.getZ(best) < 0) geo.flipWinding(g);
    const mp = [], mn = [];
    for (const name of MORPHS) {
      const t = new THREE.BufferGeometry();
      t.setAttribute('position', new THREE.Float32BufferAttribute(addCaps(lipPositions(which, side, name).pos), 3));
      t.setIndex(g.index.clone());
      t.computeVertexNormals();
      mp.push(t.attributes.position);
      mn.push(t.attributes.normal);
    }
    g.morphAttributes.position = mp;
    g.morphAttributes.normal = mn;
    g.computeBoundingSphere();
    g.boundingSphere.radius += 0.05;
    return g;
  }

  const halves = [];
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const up = ctx.mesh(buildLip('upper', side), upperMat, `lips.upper.${key}`);
    const lo = ctx.mesh(buildLip('lower', side), lowerMat, `lips.lower.${key}`);
    upperRoot.add(up);
    lowerRoot.add(lo);
    up.updateMorphTargets();
    lo.updateMorphTargets();
    halves.push({ mesh: up, side }, { mesh: lo, side });
  }

  // ------------------------------------------------------------ dark seam strip + notch recess (head)
  {
    const segs = 24;
    const pos = [];
    const P = new V3();
    for (let i = 0; i <= segs; i++) {
      const x = lerp(-W * 1.04, W * 1.04, i / segs);
      for (const [dy, n] of [[-0.03, 0.0], [0.035, 0.0]]) {
        facePoint(x, slitY(Math.abs(x)) + dy, n, P);
        pos.push(P.x, P.y, P.z);
      }
    }
    const index = [];
    for (let i = 0; i < segs; i++) {
      const a = i * 2, b = a + 1, c = a + 3, d = a + 2;
      index.push(a, d, b, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    g.setIndex(index);
    g.computeVertexNormals();
    if (g.attributes.normal.getZ(0) < 0) geo.flipWinding(g);
    headRoot.add(ctx.mesh(g, slitMat, 'lips.slit'));
    // notch recess: small dark block filling the central notch
    const nb = new THREE.BoxGeometry(NOTCH * 2.2, upperH(0) * 0.9, 0.03);
    const c = facePoint(0, slitY(0) + GAP + upperH(0) * 0.45, 0.012);
    nb.translate(c.x, c.y, c.z);
    upperRoot.add(ctx.mesh(nb, slitMat, 'lips.notch'));
  }

  // ------------------------------------------------------------ mouth corners
  const corners = {};
  const cornerGeo = geo.sweptSection(
    new THREE.CatmullRomCurve3([new V3(0, -0.034, -0.006), new V3(0.006, 0, 0.006), new V3(0, 0.032, -0.006)]),
    geo.roundedSection(0.009, 0.012, 3, 14),
    { steps: 16, up: () => new V3(0, 0, 1), scale: (t) => [0.7 + 0.3 * Math.sin(Math.PI * t), 0.55 + 0.45 * Math.sin(Math.PI * t)] },
  );
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const pivot = new THREE.Group();
    pivot.name = `lips.cornerPivot.${key}`;
    const x = W * side;
    const rest = facePoint(x, slitY(W), 0.008);
    pivot.position.copy(rest);
    geo.faceDirection(pivot, frontOut(x, slitY(W)).add(new V3(side * 0.35, 0, 0)).normalize());
    const piece = ctx.mesh(side > 0 ? cornerGeo : geo.mirrorGeometryX(cornerGeo), cornerMat, `lips.corner.${key}`);
    const stretch = new THREE.Group();
    stretch.name = `lips.cornerStretch.${key}`;
    stretch.add(piece);
    pivot.add(stretch);
    upperRoot.add(pivot);
    const anchor = new THREE.Object3D();
    anchor.name = `lips.cornerAnchor.${key}`;
    anchor.position.copy(rest);
    lowerRoot.add(anchor);
    corners[key] = { pivot, stretch, rest, anchor, side, quat: pivot.quaternion.clone() };
  }

  // ------------------------------------------------------------ rig
  const cornerShift = (name) => {
    const d = deform(name, 1, 'upper');
    return new V3(d.dx, name === 'sneer' ? d.dy * 0.5 : d.dy, d.dn);
  };
  const shift = {};
  for (const name of MORPHS) shift[name] = cornerShift(name);
  const params = { part: 0, smile: 0, asym: 0, sneer: 0, press: 0 };
  let cur = { ...params };
  const sideSmile = (p, side) => clamp(p.smile + p.asym * side * 0.6, -1, 1);
  const _w = new V3(), _l = new V3();

  function placeCorners(p) {
    for (const c of Object.values(corners)) {
      const sm = sideSmile(p, c.side);
      const smile = Math.max(0, sm), frown = Math.max(0, -sm);
      const off = new V3()
        .addScaledVector(shift.smile, smile)
        .addScaledVector(shift.frown, frown)
        .addScaledVector(shift.sneer, p.sneer);
      off.x *= c.side;
      c.anchor.updateWorldMatrix(true, false);
      upperRoot.updateWorldMatrix(true, false);
      _w.setFromMatrixPosition(c.anchor.matrixWorld);
      upperRoot.worldToLocal(_l.copy(_w));
      const gap = Math.max(0, c.rest.y - _l.y);
      c.pivot.position.set(
        (c.rest.x + _l.x) / 2 + off.x,
        (c.rest.y + _l.y) / 2 + off.y,
        (c.rest.z + _l.z) / 2 + off.z,
      );
      const st = Math.min(gap, 0.035) / 0.066;
      c.stretch.scale.set((1 - 0.25 * p.press) * (1 + 0.4 * st), 1 + st, 1 + 0.3 * st);
      c.pivot.quaternion.copy(c.quat);
      c.pivot.rotateZ(c.side * (0.5 * smile - 0.35 * frown));
    }
  }

  return {
    params,
    paramSpec: {
      part: { min: 0, max: 1, step: 0.01 },
      smile: { min: -1, max: 1, step: 0.01 },
      asym: { min: -1, max: 1, step: 0.01 },
      sneer: { min: 0, max: 1, step: 0.01 },
      press: { min: 0, max: 1, step: 0.01 },
    },
    apply(p) {
      cur = p;
      const ju = rig.joints.lipUpper, jl = rig.joints.lipLower;
      ju.position.y = ju.userData.restPosition.y + p.part * 0.014;
      jl.position.y = jl.userData.restPosition.y - p.part * 0.03;
      for (const h of halves) {
        const sm = sideSmile(p, h.side);
        const w = [Math.max(0, sm), Math.max(0, -sm), p.sneer, p.press];
        for (let i = 0; i < w.length; i++) h.mesh.morphTargetInfluences[i] = w[i];
      }
      placeCorners(p);
    },
    update() {
      placeCorners(cur);
    },
  };
}
