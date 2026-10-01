/**
 * PART: lips — thin sculpted metal lips integrated into the lower face.
 *
 *  - lips.upper   : upper lip (joint lipUpper, child of head). Its top edge
 *                   melts into the face at the upper-lip line, its lower edge
 *                   is a crisp rounded overhang above the mouth slit.
 *  - lips.lower   : lower lip (joint lipLower, child of jaw -> follows `open`),
 *                   sits on top of the chin column.
 *  - lips.philtrum: small raised block in the middle of the upper lip.
 *  - lips.slit    : dark seam strip behind the lip line (rides the lower lip).
 *  - lips.corner.L/R on pivots lips.cornerPivot.L/R at the mouth corners; the
 *                   pivots track the midpoint between both lips every frame so
 *                   the corners stretch when the jaw opens.
 *
 * Expressions are morph targets on the lip meshes (smile, frown, sneer,
 * pucker, press) plus joint offsets (part). All authored in HEAD space.
 */
export const meta = {
  id: 'lips',
  explode: [0, -0.3, 1.1],
};

export function build(ctx) {
  const { THREE, geo, anatomy: A, rig, materials: M } = ctx;
  const V3 = THREE.Vector3;
  const { lerp, clamp } = THREE.MathUtils;
  const { headSurface, headNormal, headAngleForX } = A;

  const upperRoot = ctx.space('lipUpper', 'head');
  const lowerRoot = ctx.space('lipLower', 'head');

  const lipMat = M.get('chrome', { roughness: 0.15, clearcoat: 0.5, clearcoatRoughness: 0.18 });
  const lowerMat = M.get('chrome', { roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.2 });
  const blockMat = M.get('chrome', { roughness: 0.2, panel: 9, seed: 83, lineWidth: 0.0025, lineDepth: 0.6 });
  const cornerMat = M.get('gunmetal', { roughness: 0.26 });
  const slitMat = M.get('cavity');

  // ------------------------------------------------------------ layout
  const W = 0.205;                                 // half width of the mouth
  // mouth line: nearly flat in the middle, corners turned down (stern)
  const slitY = (x) => { const s = x / W; return 0.162 - 0.006 * s * s - 0.02 * s ** 4; };
  // forward push of the muzzle (the mouth sits on a projecting snout)
  const bulge = (x) => 0.034 * Math.max(0, 1 - (x / 0.34) ** 2);
  const GAP = 0.0028;                               // half height of the dark seam
  const upperH = (s) => 0.062 - 0.022 * s * s;      // upper lip height above the seam
  const lowerH = (s) => 0.064 - 0.02 * s * s;        // lower lip height below the seam
  const taper = (s) => Math.max(0.3, 1 - 0.62 * Math.pow(Math.abs(s), 2.6));

  /** point on the face: front-projected (x, y) + offset n along the shell normal */
  const _N = new V3();
  const facePoint = (x, y, n, target) => {
    const u = headAngleForX(x, y);
    headSurface(u, y, target);
    headNormal(u, y, _N);
    return target.addScaledVector(_N, n + bulge(x));
  };

  // closed cross-section profiles: [v (0 = seam, normalised by height), n (outward offset)]
  const UPPER = [
    [1.0, -0.006], [1.02, 0.003], [0.8, 0.009], [0.5, 0.015], [0.22, 0.02], [0.07, 0.023],
    [0.012, 0.02], [0.0, 0.012], [0.03, 0.002], [0.12, -0.006],
  ];
  const LOWER = [
    [0.08, -0.006], [0.0, 0.004], [-0.012, 0.016], [-0.06, 0.021], [-0.3, 0.022], [-0.65, 0.021],
    [-0.92, 0.02], [-1.0, 0.015], [-1.02, 0.004], [-0.94, -0.006],
  ];
  const sampleProfile = (pts, count) => {
    const c = new THREE.CatmullRomCurve3(pts.map(([v, n]) => new V3(v, n * 10, 0)), true, 'centripetal', 0.5);
    return c.getSpacedPoints(count).slice(0, count).map((p) => [p.x, p.y / 10]);
  };
  const PROF_N = 30;
  const profU = sampleProfile(UPPER, PROF_N);
  const profL = sampleProfile(LOWER, PROF_N);

  // expression deformations: (s, v, which) -> { dx, dy, dn, sn (n scale) }
  const MORPHS = ['smile', 'frown', 'sneer', 'pucker', 'press'];
  const deform = (name, s, which) => {
    const s2 = s * s;
    const d = { dx: 0, dy: 0, dn: 0, sn: 1, sv: 1 };
    if (name === 'smile') { d.dy = 0.024 * s2; d.dx = 0.012 * s * Math.abs(s); d.dn = -0.008 * s2; }
    else if (name === 'frown') { d.dy = -0.02 * s2; d.dx = -0.004 * s * Math.abs(s); d.dn = -0.002 * s2; }
    else if (name === 'sneer') {
      if (which === 'upper') { d.dy = 0.016 * (1 - 0.7 * s2); d.dn = 0.008 * (1 - s2); d.sv = 1.1; }
      else { d.dn = 0.003 * (1 - s2); }
    } else if (name === 'pucker') {
      d.dx = -0.3 * s * W * (0.4 + 0.6 * Math.abs(s));
      d.dn = 0.02 * (1 - 0.6 * s2);
      d.sn = 1.2;
      d.dy = which === 'upper' ? -0.003 : 0.003;
    } else if (name === 'press') { d.sn = 0.5; d.sv = 0.82; d.dn = -0.004; }
    return d;
  };
  const cornerShift = (name) => {
    const d = deform(name, 1, 'upper');
    return new V3(d.dx, name === 'sneer' ? d.dy * 0.5 : d.dy, d.dn);
  };

  /** lofted lip solid; `morph` = name of a morph target or null for the rest shape */
  function lipPositions(which, morph) {
    const prof = which === 'upper' ? profU : profL;
    const NX = 44;
    const pos = [];
    const P = new V3();
    for (let i = 0; i <= NX; i++) {
      // denser sampling towards the corners
      const t = i / NX;
      const s = Math.sin((t - 0.5) * Math.PI) * 0.995;
      const d = morph ? deform(morph, s, which) : { dx: 0, dy: 0, dn: 0, sn: 1, sv: 1 };
      const x0 = s * W;
      const h = (which === 'upper' ? upperH(s) : lowerH(s)) * d.sv;
      const k = taper(s) * d.sn;
      for (const [v, nn] of prof) {
        const x = x0 + d.dx;
        const y = slitY(x0) + (which === 'upper' ? GAP : -GAP) + v * h + d.dy;
        facePoint(x, y, nn * k + d.dn * Math.min(1, Math.abs(v) * 4 + 0.2), P);
        pos.push(P.x, P.y, P.z);
      }
    }
    return { pos, NX, NP: prof.length };
  }

  function buildLip(which) {
    const base = lipPositions(which, null);
    const { NX, NP } = base;
    const index = [];
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NP; j++) {
        const a = i * NP + j, b = i * NP + ((j + 1) % NP), c = (i + 1) * NP + ((j + 1) % NP), d = (i + 1) * NP + j;
        index.push(a, b, d, b, c, d);
      }
    }
    // end caps (fan around the ring centroid)
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
    const flipIt = g.attributes.normal.getZ(best) < 0;
    if (flipIt) geo.flipWinding(g);
    // morph targets (absolute positions + normals)
    const mp = [], mn = [];
    for (const name of MORPHS) {
      const t = new THREE.BufferGeometry();
      t.setAttribute('position', new THREE.Float32BufferAttribute(addCaps(lipPositions(which, name).pos), 3));
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

  const upper = ctx.mesh(buildLip('upper'), lipMat, 'lips.upper');
  const lower = ctx.mesh(buildLip('lower'), lowerMat, 'lips.lower');
  upperRoot.add(upper);
  lowerRoot.add(lower);
  for (const m of [upper, lower]) m.updateMorphTargets();

  // ------------------------------------------------------------ philtrum block (upper lip centre)
  {
    const s = new THREE.Shape();
    const y0 = slitY(0) + GAP + upperH(0) * 0.42;
    const y1 = slitY(0) + GAP + upperH(0) * 1.02;
    s.moveTo(-0.026, y1);
    s.lineTo(0.026, y1);
    s.lineTo(0.022, y0);
    s.lineTo(-0.022, y0);
    s.closePath();
    const g = geo.conformPlate(s, {
      depth: 0.008, offset: 0.004 + bulge(0), bevel: 0.005, maxEdge: 0.012,
      // ride on top of the lip bulge
      lift: (u, y) => 0.02 * clamp((y1 - y) / (y1 - y0), 0, 1) ** 0.7,
    });
    upperRoot.add(ctx.mesh(g, blockMat, 'lips.philtrum'));
  }

  // ------------------------------------------------------------ dark seam strip (behind the lip line)
  {
    const segs = 24;
    const pos = [];
    const P = new V3();
    for (let i = 0; i <= segs; i++) {
      const x = lerp(-W * 1.02, W * 1.02, i / segs);
      for (const [dy, n] of [[-0.014, 0.004], [0.006, 0.004]]) {
        facePoint(x, slitY(x) + dy, n, P);
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
    lowerRoot.add(ctx.mesh(g, slitMat, 'lips.slit'));
  }

  // ------------------------------------------------------------ mouth corners
  const corners = {};
  const cornerGeo = (() => {
    // small vertical "bracket" that caps the ends of both lips
    const g = geo.sweptSection(
      new THREE.CatmullRomCurve3([new V3(0, -0.03, -0.004), new V3(0.004, 0, 0.004), new V3(0, 0.03, -0.004)]),
      geo.roundedSection(0.0065, 0.009, 3, 14),
      { steps: 16, up: new V3(0, 0, 1), scale: (t) => [0.7 + 0.3 * Math.sin(Math.PI * t), 0.55 + 0.45 * Math.sin(Math.PI * t)] },
    );
    return g;
  })();
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const pivot = new THREE.Group();
    pivot.name = `lips.cornerPivot.${key}`;
    const x = W * side * 0.995;
    const rest = facePoint(x, slitY(x), 0.012, new V3());
    pivot.position.copy(rest);
    const n = headNormal(headAngleForX(x, slitY(x)), slitY(x), new V3());
    // orient: local +z = face normal
    geo.faceDirection(pivot, n);
    const piece = ctx.mesh(side > 0 ? cornerGeo : geo.mirrorGeometryX(cornerGeo), cornerMat, `lips.corner.${key}`);
    const stretch = new THREE.Group();
    stretch.name = `lips.cornerStretch.${key}`;
    stretch.add(piece);
    pivot.add(stretch);
    upperRoot.add(pivot);
    // anchor on the lower lip, used to find the current lower-lip corner position
    const anchor = new THREE.Object3D();
    anchor.name = `lips.cornerAnchor.${key}`;
    anchor.position.copy(rest);
    lowerRoot.add(anchor);
    corners[key] = { pivot, stretch, rest, anchor, side, quat: pivot.quaternion.clone() };
  }

  // ------------------------------------------------------------ naso-labial grooves (vertical, beside the mouth)
  // dark groove + bright ridge just outside it; the upper half rides the head,
  // the lower half rides the jaw so they separate cleanly when the mouth opens.
  {
    const darkMat = M.get('darkMetal');
    const sec = geo.roundedSection(0.008, 0.007, 3, 10);
    const ridgeSec = geo.roundedSection(0.007, 0.009, 3, 10);
    for (const side of [1, -1]) {
      const key = side > 0 ? 'L' : 'R';
      const yC = slitY(W);
      for (const [which, y0, y1, parent] of [['upper', yC + 0.004, 0.265, upperRoot], ['lower', 0.045, yC - 0.004, lowerRoot]]) {
        const mk = (dx, n) => {
          const pts = [];
          for (let i = 0; i <= 10; i++) {
            const y = lerp(y0, y1, i / 10);
            const t = (y - 0.045) / (0.265 - 0.045);
            const x = side * (W + 0.028 + dx + 0.016 * Math.sin(Math.PI * t) - 0.01 * t);
            pts.push(facePoint(x, y, n, new V3()));
          }
          return new THREE.CatmullRomCurve3(pts);
        };
        parent.add(ctx.mesh(geo.sweptSection(mk(0, 0.004), sec, { steps: 20, up: new V3(side * 0.6, 0, 1).normalize() }), darkMat, `lips.groove.${which}.${key}`));
        parent.add(ctx.mesh(geo.sweptSection(mk(0.016, 0.006), ridgeSec, { steps: 20, up: new V3(side * 0.6, 0, 1).normalize() }), lipMat, `lips.ridge.${which}.${key}`));
      }
    }
  }

  // ------------------------------------------------------------ rig
  const _w = new V3(), _l = new V3();
  const shift = {};
  for (const name of MORPHS) shift[name] = cornerShift(name);
  const params = { part: 0, smile: 0, sneer: 0, pucker: 0, press: 0 };
  let cur = { ...params };

  function placeCorners(p) {
    const smile = Math.max(0, p.smile), frown = Math.max(0, -p.smile);
    for (const c of Object.values(corners)) {
      // expression offset (mirrored in x for the right corner)
      const off = new V3()
        .addScaledVector(shift.smile, smile)
        .addScaledVector(shift.frown, frown)
        .addScaledVector(shift.sneer, p.sneer)
        .addScaledVector(shift.pucker, p.pucker);
      off.x *= c.side;
      // current lower-lip corner in upper-lip space -> midpoint between the lips
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
      c.stretch.scale.set(1 - 0.25 * p.press, 1 + gap / 0.06, 1 + 0.3 * p.pucker);
      c.pivot.quaternion.copy(c.quat);
      c.pivot.rotateZ(c.side * (0.5 * smile - 0.35 * frown));
    }
  }

  return {
    params,
    paramSpec: {
      part: { min: 0, max: 1, step: 0.01 },
      smile: { min: -1, max: 1, step: 0.01 },
      sneer: { min: 0, max: 1, step: 0.01 },
      pucker: { min: 0, max: 1, step: 0.01 },
      press: { min: 0, max: 1, step: 0.01 },
    },
    apply(p) {
      cur = p;
      const ju = rig.joints.lipUpper, jl = rig.joints.lipLower;
      ju.position.y = ju.userData.restPosition.y + p.part * 0.012;
      jl.position.y = jl.userData.restPosition.y - p.part * 0.024;
      const smile = Math.max(0, p.smile), frown = Math.max(0, -p.smile);
      const w = [smile, frown, p.sneer, p.pucker, p.press];
      for (const m of [upper, lower]) {
        for (let i = 0; i < w.length; i++) m.morphTargetInfluences[i] = w[i];
      }
      placeCorners(p);
    },
    update() {
      placeCorners(cur);
    },
  };
}
