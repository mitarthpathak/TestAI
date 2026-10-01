/**
 * PART: faceplate — the front of the face between the brow and the upper lip.
 * Joints: head (nose, sockets, cheekbones, muzzle), browL / browR (brows).
 * Authoring space: HEAD.
 *
 *  - faceplate.nose            long, broad, nearly flush board (y 1.12 -> 0.5),
 *                              chamfered, fine engraved centre line; its top
 *                              tucks under the cranium crest
 *    .panel / .tip             raised lower panel ("W" step), stepped nostril block
 *  - faceplate.brow.{L,R}      heavy overhanging angry brow wedge (on browL/R)
 *    faceplate.browCap.{L,R}   stepped upper layer of the brow
 *  - faceplate.socket.{L,R}    squarish-almond socket frames with stepped bevels
 *  - faceplate.cheekbone.sheet.{L,R}  one smooth curved under-eye sheet from the
 *                              nose edge to the inner/top edge of the cheek ring,
 *                              fine engraved seams radiating outward
 *  - faceplate.muzzle / .philtrum      stepped muzzle top above the upper lip
 *
 * Params: browRaise (+ up), browAngle (+ angry: inner ends drop),
 *         noseFlex (scrunch), cheekFlex (sneer / cheekbones lift).
 */
export const meta = {
  id: 'faceplate',
  explode: [0, 0.2, 1.0],
};

// Eye-socket opening (shared with eyes.js — keep in sync): superellipse around
// the eye centre, rolled by LANDMARKS.socketTilt (outer corner raised).
export const SOCKET = { a: 0.17, bTop: 0.078, bBot: 0.09, n: 2.6 };
export function socketPoint(anatomy, side, t, k = 1) {
  const L = anatomy.LANDMARKS;
  const c = Math.cos(t), s = Math.sin(t);
  const e = 2 / SOCKET.n;
  const lx = SOCKET.a * k * Math.sign(c) * Math.pow(Math.abs(c), e);
  const ly = (s >= 0 ? SOCKET.bTop : SOCKET.bBot) * k * Math.sign(s) * Math.pow(Math.abs(s), e);
  const th = side * L.socketTilt;
  const ex = L.eyeL[0] * side, ey = L.eyeL[1];
  return [ex + lx * Math.cos(th) - ly * Math.sin(th), ey + lx * Math.sin(th) + ly * Math.cos(th)];
}

export function build(ctx) {
  const { THREE, geo, anatomy, materials: M } = ctx;
  const head = ctx.space('head', 'head');
  const field = makeHeadField(THREE, anatomy);
  const chart = field.chart;
  const sm = THREE.MathUtils.smoothstep;
  const lerp = THREE.MathUtils.lerp;

  const plate = M.get('chrome', { panel: 7, seed: 5, lineWidth: 0.0028, lineDepth: 0.75 });
  const bright = M.get('chrome', { roughness: 0.18, panel: 5.5, seed: 9, lineWidth: 0.0026, lineDepth: 0.7 });
  const cheekMat = M.get('chrome', { roughness: 0.24, panel: 3.2, seed: 31, lineWidth: 0.0024, lineDepth: 0.6 });
  const gun = M.get('gunmetal', { panel: 8, seed: 13, lineWidth: 0.0028, lineDepth: 0.8 });
  const noseMat = M.get('chrome', { panel: 7, seed: 6, lineWidth: 0.0028, lineDepth: 0.75, roughness: 0.36 });
  const gunDS = M.get('gunmetal', { panel: 9, seed: 17, lineWidth: 0.0025, lineDepth: 0.7, side: THREE.DoubleSide });
  const dark = M.get('darkMetal', { panel: 10, seed: 21, lineWidth: 0.0025, side: THREE.DoubleSide });

  // rails: [x, y] front-view points converted to chart (u, y)
  const rail = (pts, mirror = 1) => {
    const c = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(anatomy.headAngleForX(x, y) * mirror, y)));
    c.arcLengthDivisions = 300;
    const v = new THREE.Vector2();
    return (t) => { c.getPointAt(THREE.MathUtils.clamp(t, 0, 1), v); return [v.x, v.y]; };
  };
  const fnRail = (fn, mirror = 1) => (t) => { const [x, y] = fn(t); return [anatomy.headAngleForX(x * mirror, y), y]; };
  const sub = (r, t0, t1) => (t) => r(t0 + (t1 - t0) * t);
  const mixRail = (rA, rB, s) => (t) => { const a = rA(t), b = rB(t); return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]; };
  const surfZ = (x, y) => anatomy.headFrontZ(x, y);

  // pivot helper: Group at `hinge` (head space) on `parent`; children authored in head space
  const pivots = {};
  const pivot = (name, hinge, parent = head) => {
    const g = new THREE.Group();
    g.name = `${name}.pivot`;
    g.position.copy(hinge);
    g.userData.rest = hinge.clone();
    const inner = new THREE.Group();
    inner.position.copy(hinge).negate();
    g.add(inner);
    parent.add(g);
    pivots[name] = g;
    return inner;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ------------------------------------------------------------ nose plate
  // flat board: its front face is a straight line in side view from the brow
  // junction (y 1.12, z ~0.79) down to the nose tip (0, 0.5, 0.9)
  const tip = anatomy.LANDMARKS.noseTip;
  const noseFrontZ = (y) => lerp(0.73, tip[2] - 0.012, THREE.MathUtils.clamp((1.13 - y) / (1.13 - tip[1]), 0, 1.1));
  const noseEdge = [[0.074, 1.12], [0.082, 1.09], [0.094, 1.02], [0.108, 0.93], [0.124, 0.84], [0.142, 0.75], [0.16, 0.66], [0.176, 0.58], [0.185, 0.53], [0.188, 0.5]];
  const noseY = (t) => lerp(1.16, 0.5, t);
  const boardLift = (dz) => (s, t, P, N) => (noseFrontZ(P.y) + dz - P.z) / Math.max(0.5, N.z);
  {
    const inner = pivot('faceplate.nose', V(0, 1.08, 0.79));
    const base = boardLift(0);
    const g = ribbonPlate(THREE, geo, {
      chart, railA: rail(noseEdge, -1), railB: rail(noseEdge, 1),
      segS: 56, segT: 60, offset: 0, thickness: 0.12, bevel: 0.007, gap: 0.004, gap0: 0, gap1: 0.002,
      lift: (s, t, P, N) => {
        const e = Math.abs(2 * s - 1);
        // flat front, sharp 45deg chamfers on the sides, top rolls back into the crest
        // fine engraved centre line down the upper board (film / concept)
        const line = Math.exp(-Math.pow(e / 0.035, 2)) * sm(t, 0.04, 0.1) * (1 - sm(t, 0.4, 0.5));
        return base(s, t, P, N) - 0.006 * e * e - 0.022 * sm(e, 0.7, 1.0) - 0.012 * sm(t, 0.08, 0.0) - 0.003 * line;
      },
    });
    inner.add(ctx.mesh(g, noseMat, 'faceplate.nose'));


    // raised lower panel (the "W" step): inset trapezoid on the lower board
    const panelEdge = [[0.08, 0.82], [0.1, 0.74], [0.118, 0.67], [0.132, 0.6]];
    const pg = ribbonPlate(THREE, geo, {
      chart, railA: rail(panelEdge, -1), railB: rail(panelEdge, 1),
      segS: 16, segT: 24, offset: 0, thickness: 0.05, bevel: 0.005, gap: 0.0,
      lift: (s, t, P, N) => {
        const e = Math.abs(2 * s - 1);
        // two vertical grooves split the panel into a W-like triple
        const groove = Math.exp(-Math.pow((e - 0.42) / 0.06, 2));
        return base(s, t, P, N) + 0.005 - 0.005 * groove;
      },
    });
    inner.add(ctx.mesh(pg, plate, 'faceplate.nose.panel'));

    // stepped "nostril" block at the bottom of the nose
    const tipEdge = [[0.09, 0.59], [0.098, 0.55], [0.104, 0.51]];
    const tg = ribbonPlate(THREE, geo, {
      chart, railA: rail(tipEdge, -1), railB: rail(tipEdge, 1),
      segS: 14, segT: 14, offset: 0, thickness: 0.07, bevel: 0.006, gap: 0.0,
      lift: (s, t, P, N) => base(s, t, P, N) + 0.005 + 0.006 * sm(t, 0.4, 0.5),
    });
    inner.add(ctx.mesh(tg, gun, 'faceplate.nose.tip'));

    // (the crest join above the nose is now the cranium's continuous crest)
  }

  // ------------------------------------------------------------ muzzle top (nose -> upper lip)
  {
    const inner = pivot('faceplate.muzzle', V(0, 0.42, 0.86));
    const edge = [[0.2, 0.52], [0.22, 0.47], [0.232, 0.41], [0.246, 0.35], [0.25, 0.3]];
    const mg = ribbonPlate(THREE, geo, {
      chart, railA: rail(edge, -1), railB: rail(edge, 1),
      segS: 30, segT: 26, offset: 0, thickness: 0.07, bevel: 0.008, gap: 0.006, gap0: 0.004, gap1: 0.0,
      lift: (s, t) => {
        const e = Math.abs(2 * s - 1);
        // two stepped bands; the lower band juts toward the lips
        const step = sm(t, 0.42, 0.5);
        return 0.024 + 0.012 * step * (1 - e * e) - 0.012 * sm(e, 0.8, 1.0);
      },
    });
    inner.add(ctx.mesh(mg, plate, 'faceplate.muzzle'));
    // philtrum: small V-bottomed block under the nostril
    const pe = [[0.05, 0.5], [0.045, 0.44], [0.03, 0.385], [0.012, 0.36]];
    const pg = ribbonPlate(THREE, geo, {
      chart, railA: rail(pe, -1), railB: rail(pe, 1),
      segS: 12, segT: 16, offset: 0, thickness: 0.06, bevel: 0.005, gap: 0.0,
      lift: (s, t) => 0.046 - 0.01 * t,
    });
    inner.add(ctx.mesh(pg, plate, 'faceplate.philtrum'));
  }

  // ------------------------------------------------------------ glabella under-plate
  // recessed layer behind the inner brow ends / nose top so no shell shows
  // through when the brows animate
  {
    const gl = [[0.36, 1.12], [0.3, 1.1], [0.2, 1.07], [0.12, 1.04], [0.1, 1.0], [0.12, 0.93]];
    const glA = rail(gl, -1), glB = rail(gl, 1);
    const g = ribbonPlate(THREE, geo, {
      chart, railA: glA, railB: glB, segS: 30, segT: 20, offset: 0, thickness: 0.08, bevel: 0.006, gap: 0.0,
      lift: () => 0.034,
    });
    head.add(ctx.mesh(g, gun, 'faceplate.glabella'));
  }

  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';

    // ---------------------------------------------------------- socket frame
    // stepped bevelled funnel around the eye opening (loft of socket outlines)
    {
      const NS = 120;
      const loops = [
        [1.36, 0.004], [1.3, 0.024], [1.2, 0.03], [1.1, 0.03], [1.06, 0.022],
        [1.035, 0.004], [1.0, -0.006], [0.985, -0.024], [0.97, -0.05],
      ].map(([k, dz]) => {
        const pts = [];
        for (let i = 0; i < NS; i++) {
          const t = (i / NS) * Math.PI * 2;
          const [x, y] = socketPoint(anatomy, side, t, k);
          pts.push(V(x, y, (surfZ(x, y) ?? 0.5) + dz));
        }
        return pts;
      });
      const g = loftRings(THREE, geo, loops);
      head.add(ctx.mesh(g, gunDS, `faceplate.socket.${key}`));
    }

    // ---------------------------------------------------------- brow (browL / browR joint)
    const browSpace = ctx.space(`brow${key}`, 'head');
    const bj = anatomy.JOINTS[`brow${key}`].pos;
    const browIn = pivot(`faceplate.brow.${key}`, V(bj[0], bj[1], bj[2]), browSpace);
    // lower edge = slanted upper lid line (inner low, outer high), hooding the socket top
    const browLowPts = [[0.1, 0.95], [0.15, 0.915], [0.21, 0.93], [0.28, 0.963], [0.35, 0.993], [0.42, 1.018], [0.49, 1.04], [0.55, 1.075], [0.6, 1.125]];
    const browTopPts = [[0.085, 1.075], [0.16, 1.06], [0.25, 1.08], [0.34, 1.11], [0.43, 1.14], [0.51, 1.165], [0.57, 1.19], [0.62, 1.2]];
    const bLow = rail(browLowPts, side), bTop = rail(browTopPts, side);
    const bMid = mixRail(bLow, bTop, 0.58);
    // overhang height above the shell: thick wedge along the lower edge,
    // easing in at the nose (inner end tucks against the nose board) and
    // thinning toward the temple; rolls smoothly back up into the forehead.
    const browH = (s, t) => {
      const hl = lerp(0.058, 0.094, sm(t, 0.0, 0.22)) - 0.07 * sm(t, 0.45, 1.0);
      const top = 0.02 - 0.008 * sm(t, 0.6, 1.0);
      return top + (hl - top) * Math.pow(1 - s, 1.25);
    };
    const brow = ribbonPlate(THREE, geo, {
      chart, railA: bLow, railB: bMid, segS: 20, segT: 60, offset: 0, thickness: 0.17, bevel: 0.009,
      gapA: 0, gapB: 0.003, gap0: 0.004, gap1: 0.006,
      lift: (s, t) => browH(s * 0.58, t),
    });
    browIn.add(ctx.mesh(brow, bright, `faceplate.brow.${key}`));
    const cap = ribbonPlate(THREE, geo, {
      chart, railA: bMid, railB: bTop, segS: 10, segT: 48, offset: 0, thickness: 0.1, bevel: 0.006,
      gapA: 0.003, gapB: 0.0, gap0: 0.008, gap1: 0.008,
      lift: (s, t) => browH(0.58 + 0.42 * s, t) - 0.003,
    });
    browIn.add(ctx.mesh(cap, plate, `faceplate.browCap.${key}`));

    // ---------------------------------------------------------- cheekbone sheet
    // ONE smooth curved sheet from the nose edge (inner rail) to the inner /
    // top edge of the cheek ring (outer rail). Fine engraved seams radiate
    // from the nose edge down / outward (concept 3/4): the outer rail is
    // re-timed so each seam is a straight t = const line on the sheet.
    const cheekIn = [[0.128, 0.86], [0.146, 0.78], [0.164, 0.7], [0.18, 0.62], [0.19, 0.55], [0.194, 0.5]];
    const cheekOut = [[0.43, 0.85], [0.37, 0.8], [0.318, 0.725], [0.282, 0.64], [0.262, 0.56], [0.252, 0.49]];
    const rIn = rail(cheekIn, side), rOutRaw = rail(cheekOut, side);
    // seams start high on the nose edge and land lower on the ring
    const warpT = (t) => (t < 0.3 ? t * (0.46 / 0.3) : t < 0.62 ? 0.46 + ((t - 0.3) * 0.34) / 0.32 : 0.8 + ((t - 0.62) * 0.2) / 0.38);
    const rOut = (t) => rOutRaw(warpT(t));
    const hingeP = V(0.2 * side, 0.7, surfZ(0.2, 0.7));
    const cheekG = pivot(`faceplate.cheekbone.${key}`, hingeP);
    const seams = [0.3, 0.62];
    const g = ribbonPlate(THREE, geo, {
      chart, railA: rIn, railB: rOut, segS: 24, segT: 170, offset: 0, thickness: 0.09,
      bevel: 0.008, gapA: 0.005, gapB: 0.004, gap0: 0.0, gap1: 0.0,
      lift: (s, t) => {
        // flush with the nose board at the inner edge, rolling over the cheekbone
        let h = 0.044 - 0.012 * s * s + 0.012 * Math.sin(Math.PI * Math.min(1, s * 1.1)) * (1 - 0.5 * t) - 0.01 * t * s;
        for (const c of seams) {
          const w = 0.006;
          h -= 0.004 * Math.exp(-Math.pow((t - c) / w, 2)) * sm(s, 0.02, 0.12);
        }
        return h;
      },
    });
    cheekG.add(ctx.mesh(g, cheekMat, `faceplate.cheekbone.sheet.${key}`));
  }

  // ------------------------------------------------------------ params
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const set = (name, rx, ry, rz, dx, dy, dz) => {
    const g = pivots[name];
    g.quaternion.copy(_q.setFromEuler(_e.set(rx, ry, rz)));
    g.position.copy(g.userData.rest).add(new THREE.Vector3(dx, dy, dz));
  };
  const params = { browRaise: 0, browAngle: 0, noseFlex: 0, cheekFlex: 0 };
  return {
    params,
    paramSpec: {
      browRaise: { min: -1, max: 1, step: 0.01 },
      browAngle: { min: -1, max: 1, step: 0.01 },
      noseFlex: { min: -1, max: 1, step: 0.01 },
      cheekFlex: { min: -1, max: 1, step: 0.01 },
    },
    apply(p) {
      set('faceplate.nose', -p.noseFlex * 0.04, 0, 0, 0, p.noseFlex * 0.01, 0);
      set('faceplate.muzzle', 0, 0, 0, 0, p.noseFlex * 0.006, 0);
      for (const key of ['L', 'R']) {
        const sd = key === 'L' ? 1 : -1;
        // browAngle +: inner end drops (anger); browRaise +: lifts and tips forward
        set(`faceplate.brow.${key}`, -p.browRaise * 0.05, 0, sd * p.browAngle * 0.12, 0, p.browRaise * 0.025, p.browRaise * 0.006);
        set(`faceplate.cheekbone.${key}`, -p.cheekFlex * 0.03, 0, -sd * p.cheekFlex * 0.04, 0, p.cheekFlex * 0.014, p.cheekFlex * 0.004);
      }
    },
  };
}

/** Indexed loft through closed loops (rows[k][i]); creased normals, world-ish UVs. */
function loftRings(THREE, geo, rows) {
  const n = rows[0].length;
  const pos = [], uv = [], index = [];
  let v = 0;
  for (let k = 0; k < rows.length; k++) {
    if (k > 0) v += rows[k][0].distanceTo(rows[k - 1][0]);
    let u = 0;
    for (let i = 0; i <= n; i++) {
      const p = rows[k][i % n];
      if (i > 0) u += p.distanceTo(rows[k][i - 1]);
      pos.push(p.x, p.y, p.z);
      uv.push(u, v);
    }
  }
  const w = n + 1;
  for (let k = 0; k < rows.length - 1; k++) for (let i = 0; i < n; i++) {
    const a = k * w + i, b = a + 1, c = a + w + 1, d = a + w;
    index.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  if (geo.facingScore(g, new THREE.Vector3(0, 0, 1)) < 0) geo.flipWinding(g);
  const out = geo.toCreasedNormals(g.toNonIndexed(), THREE.MathUtils.degToRad(32));
  g.dispose();
  out.computeBoundingSphere();
  return out;
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
      const h = offset + (lift ? lift(s, t, P, N) : 0) + bv;
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
