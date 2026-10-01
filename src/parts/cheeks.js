/**
 * PART: cheeks — the recessed cheek turbines and the thick C-shaped "jowl"
 * bands that wrap them (film Ultron, Age of Ultron).
 *
 * Joints: cheekL / cheekR (= turbine hub). Everything is authored in the DISC
 * FRAME of the LEFT cheek and mirrored for the right:
 *   origin = hub joint, +Z = LANDMARKS.cheekDiscNormalL (outward, mostly
 *   sideways), +X = back / ear side, +Y ~ up. Polar angle theta: 0 = back,
 *   90deg = up (under the outer eye corner), 180deg = toward the nose,
 *   -90deg = down, ~-150deg = mouth corner.
 *
 * Meshes (K = L | R):
 *   cheeks.frame.K            disc frame group (static)
 *     cheeks.rim.K            full bold ring around the cavity (polished)
 *     cheeks.band1.K/band2.K  nested C bands (open toward the nose)
 *     cheeks.jowl.K           lowest C segment under the disc toward the mouth corner
 *     cheeks.vent.K + ventRibs.K  red-lit slot behind the outer band (concept art)
 *     cheeks.wall.K           dark cavity wall
 *     cheeks.steps.K          stepped concentric rings descending into the cavity
 *     cheeks.rotor.K          spinning group (spin / spinSpeed)
 *       cheeks.floor.K        dark turbine floor
 *       cheeks.vanes.K        radial turbine vanes (InstancedMesh, iris = pitch)
 *       cheeks.plate.K        flat inner disc with radial spoke grooves
 *       cheeks.spokes.K
 *     cheeks.hub.K            hub group (pulse pushes it out)
 *       cheeks.hubCollar.K, cheeks.hubCap.K, cheeks.hubCore.K, cheeks.hubGlow.K
 *
 * Params: spin (abs angle), spinSpeed (idle rad/s), iris (vane pitch: 0 closed
 * .. 1 open), pulse (hub push-out + core glow), recess (inner stack in/out).
 */
export const meta = {
  id: 'cheeks',
  explode: [0, -0.1, 0.9],
};

export function build(ctx) {
  const { THREE, geo, anatomy, materials: M } = ctx;
  const LM = anatomy.LANDMARKS;
  const deg = THREE.MathUtils.degToRad;
  const SS = THREE.MathUtils.smoothstep;
  const R0 = LM.cheekDiscRadius; // 0.26

  // ------------------------------------------------------------------ frame
  // LOCAL hub / normal override (face close-up: turbine lower + further out,
  // seen nearly edge-on from the front). Requested core values:
  //   JOINTS.cheekL.pos = HUB, LANDMARKS.cheekDiscNormalL = NRM (CUTOUTS follow).
  const HUB = [0.48, 0.38, 0.52];
  const NRM = [0.92, -0.05, 0.39];
  const JNT = new THREE.Vector3().fromArray(LM.cheekDiscL);
  const C = new THREE.Vector3().fromArray(HUB);
  const N = new THREE.Vector3().fromArray(NRM).normalize();
  const HUB_OFF = C.clone().sub(JNT); // frame offset from the rig joint (mirrored X on R)
  const EX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), N).normalize();
  const EY = new THREE.Vector3().crossVectors(N, EX).normalize();

  // -------------------------------------------- skull height in the disc frame
  const [yMin, yMax] = anatomy.HEAD_Y_RANGE;
  const shellF = (x, y, z) => {
    if (y <= yMin || y >= yMax) return 1;
    const s = anatomy.headSection(y);
    const dz = z - s.zc;
    const d = dz >= 0 ? s.zf : s.zb;
    if (s.w < 1e-4 || d < 1e-4) return 1;
    return Math.pow(Math.abs(x) / s.w, s.n) + Math.pow(Math.abs(dz) / d, s.n) - 1;
  };
  const _b = new THREE.Vector3();
  const G = (t) => shellF(_b.x + N.x * t, _b.y + N.y * t, _b.z + N.z * t);
  /** height (along N) of the skull surface at polar (theta, r); -0.6 if missed */
  function skull(theta, r) {
    _b.copy(C).addScaledVector(EX, r * Math.cos(theta)).addScaledVector(EY, r * Math.sin(theta));
    let a = -0.6, b = 0.5;
    let fa = G(a), fb = G(b);
    if (fa >= 0) return a;
    if (fb <= 0) return b;
    let side = 0;
    for (let i = 0; i < 40; i++) {
      const c = (a * fb - b * fa) / (fb - fa);
      const fc = G(c);
      if (Math.abs(fc) < 1e-7 || b - a < 1e-6) return c;
      if (fc > 0) { b = c; fb = fc; if (side === -1) fa *= 0.5; side = -1; }
      else { a = c; fa = fc; if (side === 1) fb *= 0.5; side = 1; }
    }
    return (a + b) / 2;
  }
  const smax = (a, b, k) => {
    const h = THREE.MathUtils.clamp(0.5 + (0.5 * (a - b)) / k, 0, 1);
    return b + (a - b) * h + k * h * (1 - h);
  };

  // ---------------------------------------------------------------- helpers
  /**
   * Thick rounded band swept around the disc axis (polar sweep).
   * The top follows top(theta, r); the skirt drops to bottom(theta, r) so the
   * band always meets the skull with no gap.
   */
  function polarSweep({ th0, th1, closed = false, rc, hw, top, bottom, corner = 0.02, crown = 0.006, segs = 160, ends = 0, skirt = 0.12 }) {
    // cross-section: [u (-1 inner .. 1 outer, x hw), v (offset from top), isBottom]
    const prof = [];
    const rcN = Math.min(corner, hw * 0.8);
    prof.push([-1, 0, 1]);
    const arc = (cx, a0, a1, n) => {
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        prof.push([(cx + rcN * Math.cos(a)) / hw, -rcN + rcN * Math.sin(a), 0]);
      }
    };
    prof.push([-1, -rcN - 0.02, 0]);
    arc(-hw + rcN, Math.PI, Math.PI / 2, 6);
    for (let i = 1; i < 6; i++) { const u = -1 + (2 * i) / 6; prof.push([u * (1 - rcN / hw), 0, 0]); }
    arc(hw - rcN, Math.PI / 2, 0, 6);
    prof.push([1, -rcN - 0.02, 0]);
    prof.push([1, 0, 1]);
    const P = prof.length;
    const rows = closed ? segs : segs + 1;
    const rc0 = typeof rc === 'function' ? rc(th0) : rc;
    const pos = [], uv = [], idx = [];
    let per = [0];
    for (let k = 1; k < P; k++) per.push(per[k - 1] + Math.hypot((prof[k][0] - prof[k - 1][0]) * hw, prof[k][1] - prof[k - 1][1]) + (prof[k][2] !== prof[k - 1][2] ? 0.05 : 0));
    for (let i = 0; i < rows; i++) {
      const s = i / segs;
      const th = th0 + (th1 - th0) * s;
      const c = Math.cos(th), sn = Math.sin(th);
      const rcAt = typeof rc === 'function' ? rc(th) : rc;
      const skirtAt = typeof skirt === 'function' ? skirt(th) : skirt;
      // ends: taper width and dive into the skull
      let endK = 1;
      const [eLo, eHi] = Array.isArray(ends) ? ends : [ends, ends];
      if (!closed) endK = (eLo > 0 ? SS(s, 0, eLo) : 1) * (eHi > 0 ? SS(1 - s, 0, eHi) : 1);
      const w = hw * (0.35 + 0.65 * endK);
      for (let k = 0; k < P; k++) {
        const [u, v, isB] = prof[k];
        const r = rcAt + u * w;
        const sk = skull(th, r);
        let tz = top(th, r);
        tz = THREE.MathUtils.lerp(Math.max(Math.min(tz, sk + 0.004), tz - 0.09), tz, endK);
        const crownV = crown * (1 - u * u) * endK;
        const z = isB ? THREE.MathUtils.clamp(bottom(th, r), tz - skirtAt, tz - 0.03) : tz + (v === 0 ? crownV : v * (0.6 + 0.4 * endK));
        pos.push(r * c, r * sn, z);
        uv.push(th * rc0, per[k]);
      }
    }
    const next = (i) => (closed ? (i + 1) % rows : i + 1);
    const last = closed ? rows : rows - 1;
    for (let i = 0; i < last; i++) {
      const i2 = next(i);
      for (let k = 0; k < P; k++) {
        const k2 = (k + 1) % P;
        const a = i * P + k, b = i * P + k2, cc = i2 * P + k2, d = i2 * P + k;
        idx.push(a, b, d, b, cc, d);
      }
    }
    if (!closed) {
      for (const i of [0, rows - 1]) {
        const base = pos.length / 3;
        let cx = 0, cy = 0, cz = 0;
        for (let k = 0; k < P; k++) { cx += pos[(i * P + k) * 3]; cy += pos[(i * P + k) * 3 + 1]; cz += pos[(i * P + k) * 3 + 2]; }
        pos.push(cx / P, cy / P, cz / P); uv.push(0, 0);
        for (let k = 0; k < P; k++) {
          const a = i * P + k, b = i * P + ((k + 1) % P);
          if (i === 0) idx.push(base, b, a); else idx.push(base, a, b);
        }
      }
    }
    return finish(pos, uv, idx, 36);
  }

  /** Signed volume of an indexed (closed) mesh: > 0 when it faces outward. */
  function signedVolume(g) {
    const p = g.attributes.position.array, ix = g.index.array;
    let v = 0;
    for (let i = 0; i < ix.length; i += 3) {
      const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
      v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
         - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
         + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
    }
    return v;
  }
  /** Flip an open indexed mesh so its normals agree with dir(centroid). */
  function orient(g, dir) {
    const p = g.attributes.position.array, ix = g.index.array;
    const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
    let score = 0;
    for (let i = 0; i < ix.length; i += 3) {
      A.fromArray(p, ix[i] * 3); B.fromArray(p, ix[i + 1] * 3); Cc.fromArray(p, ix[i + 2] * 3);
      m.copy(A).add(B).add(Cc).multiplyScalar(1 / 3);
      n.crossVectors(B.clone().sub(A), Cc.clone().sub(A));
      score += n.dot(dir(m));
    }
    if (score < 0) geo.flipWinding(g);
  }
  const UPZ = new THREE.Vector3(0, 0, 1);
  const upDir = () => UPZ;
  const inDir = (m) => new THREE.Vector3(-m.x, -m.y, 0).normalize();

  /** Build an indexed geometry, orient it outward (+Z on average), crease normals. */
  function finish(pos, uv, idx, crease = 38) {
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    if (signedVolume(g) < 0) geo.flipWinding(g);
    const out = geo.toCreasedNormals(g, deg(crease));
    g.dispose();
    out.computeBoundingSphere();
    return out;
  }

  /**
   * Lathe around the disc axis. profile: [{ r, z } | { r, f(theta, r) }].
   * Faces +Z (outward) where it can.
   */
  function polarLathe(profile, segs = 96, dir = upDir) {
    const P = profile.length;
    const pos = [], uv = [], idx = [];
    const acc = [0];
    for (let j = 1; j < P; j++) acc.push(acc[j - 1] + Math.abs(profile[j].r - profile[j - 1].r) + Math.abs((profile[j].z ?? 0) - (profile[j - 1].z ?? 0)) + 1e-3);
    for (let i = 0; i < segs; i++) {
      const th = (i / segs) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      for (let j = 0; j < P; j++) {
        const p = profile[j];
        const z = p.f ? p.f(th, p.r) : p.z;
        pos.push(p.r * c, p.r * s, z);
        uv.push(th * Math.max(p.r, 0.03), acc[j]);
      }
    }
    for (let i = 0; i < segs; i++) {
      const i2 = (i + 1) % segs;
      for (let j = 0; j < P - 1; j++) {
        const a = i * P + j, b = i * P + j + 1, c = i2 * P + j, d = i2 * P + j + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    // a lathe whose profile runs outward faces +Z with (a, c, b); check the
    // first segment's orientation instead of the whole (walls cancel out)
    orient(g, dir);
    const out = geo.toCreasedNormals(g, deg(40));
    g.dispose();
    out.computeBoundingSphere();
    return out;
  }

  // -------------------------------------------------------------- materials
  const rimMat = M.get('chrome', { roughness: 0.22, color: 0xc4cad0, panel: 7, seed: 41, lineWidth: 0.003 });
  const band1Mat = M.get('chrome', { roughness: 0.24, color: 0xcdd2d7, panel: 6, seed: 43, lineWidth: 0.0035 });
  const band2Mat = M.get('chrome', { roughness: 0.27, color: 0xa9b0b7, panel: 5, seed: 47, lineWidth: 0.0035 });
  const jowlMat = M.get('chrome', { roughness: 0.26, color: 0xb2b8bf, panel: 6.5, seed: 49, lineWidth: 0.0035 });
  const stepMat = M.get('gunmetal', { roughness: 0.34, color: 0x5a6068, panel: 14, seed: 53, lineWidth: 0.004 });
  const ringMat = M.get('darkMetal', { roughness: 0.62, color: 0x2a2e33, panel: 14, seed: 54, lineWidth: 0.004 });
  const plateMat = M.get('darkMetal', { roughness: 0.4, color: 0x34383d, panel: 18, seed: 57, lineWidth: 0.0025 });
  const vaneMat = M.get('gunmetal', { roughness: 0.32, color: 0x5c626a });
  const darkMat = M.get('darkMetal');
  const cavityMat = M.get('cavity');
  const capMat = M.get('darkMetal', { roughness: 0.38, color: 0x3a3f45 });
  const glowMat = M.get('redAccent', { intensity: 0.55 });
  // close-up: lighter polished steel on the outer plates
  for (const m of [rimMat, band1Mat, band2Mat, jowlMat]) m.envMapIntensity = 1.8;
  jowlMat.roughness = 0.42; band1Mat.roughness = 0.4; band2Mat.roughness = 0.42;
  // lower-face plates: broader highlights so they read as lit steel against the black stage
  for (const m of [band1Mat, band2Mat, jowlMat]) m.envMapIntensity = 2.4;
  const ventMat = M.get('redAccent', { intensity: 0.7 });

  // ------------------------------------------------------- band heights
  // A shallow dish: rings sit on a cone parallel-ish to the disc face but are
  // never lower than the skull (+ clearance), so they stand proud on the
  // upper side and form a solid lip where the head falls away.
  // Lower tails: below the disc the bands leave the disc plane's circle and
  // spiral outward / down so they run DOWN the outside of the muzzle and
  // converge on the chin (front view reads as a long U, not a moustache).
  const wrapA = (th) => THREE.MathUtils.euclideanModulo(th + Math.PI, Math.PI * 2) - Math.PI; // -PI..PI
  const tailK = (th) => SS(-wrapA(th), deg(72), deg(108));
  const spiral = (r0, r1, thA, thE, pw = 1.6) => (th) => r0 + (r1 - r0) * Math.pow(SS(-wrapA(th), -thA, -thE), pw);
  // inner side (toward the nose) sinks so the faceplate cheekbone overlaps it
  const innerDrop = (th) => 0.05 * SS(-Math.cos(th), 0.25, 0.95);
  const topFn = (base, slope, clr, drop = 0, tail = 0.3) => (th, r) =>
    smax(skull(th, r) + clr, base - slope * (r - 0.29) - tail * tailK(th) - drop * innerDrop(th), 0.03);
  const bottomFn = (th, r) => Math.max(skull(th, r) - 0.06, -0.45);
  // deeper skirts in the lower-front quadrant (toward the mouth corner) so the
  // jowl reads as a solid mass down to the jaw instead of floating tabs
  const deepFront = () => 0.07; // shallow: deep skirts showed as walls inside the cavity in front view

  const RIM_RC = 0.292, RIM_HW = 0.036;
  const rimTop0 = topFn(0.045, 0.1, 0.018, 1, 0);
  const rimLow = (th) => { const a = wrapA(th); return SS(-a, deg(45), deg(75)) * SS(a + Math.PI, deg(5), deg(30)); };
  const rimTop = (th, r) => rimTop0(th, r) - 0.03 * rimLow(th);
  // open at the lower front: there band1 + the tile fan form the cavity lip (close-up)
  const rimGeo = polarSweep({ th0: deg(-78), th1: deg(208), ends: [0.06, 0.06], rc: RIM_RC, hw: RIM_HW, top: rimTop, bottom: bottomFn, corner: 0.013, crown: 0.004, segs: 128 });

  // band1: inner C, curls under the disc and in to just outside the mouth corner
  const B1_HW = 0.046;
  // band1 hugs the turbine all the way under it (fills between rim and U plates)
  const B1_RC = spiral(0.373, 0.36, deg(-80), deg(-110));
  const b1Top = topFn(0.06, 0.08, 0.02, 1);
  const band1Geo = polarSweep({ th0: deg(-128), th1: deg(116), rc: B1_RC, hw: B1_HW, top: b1Top, bottom: bottomFn, corner: 0.013, crown: 0.004, segs: 110, ends: [0.08, 0.12], skirt: deepFront });

  // band2 + jowl: wrap the back / bottom of the disc, then hand over to a
  // TAIL (swept on the face surface) that runs down and in to the chin.
  const B2_HW = 0.046, B2_END = deg(-82);
  const B2_RC = spiral(0.462, 0.49, deg(-60), B2_END);
  const b2Top = topFn(0.055, 0.08, 0.016);
  const band2Geo = polarSweep({ th0: B2_END, th1: deg(104), rc: B2_RC, hw: B2_HW, top: b2Top, bottom: bottomFn, corner: 0.013, crown: 0.004, segs: 110, ends: [0, 0.12], skirt: deepFront });


  // ------------------------------------------------------------ lower face (HEAD space, left side)
  // Face close-up: under the turbine a thick rounded U band wraps from the
  // outer face edge down under the disc and back UP to the mouth corner, and
  // the space between it and the turbine rim is filled with concentric rows
  // of segmented "scale" tiles (overlapping, stepping outward).
  // Surface: the skull front blended with a wider jowl ellipsoid, so the
  // lower face is broad in front view (close-up ref) and wraps back at the sides.
  const JW = 0.67, JZC = 0.12, JZF = 0.7;
  const jowlZ = (x, y) => {
    const q = Math.min(0.995, Math.abs(x) / (JW - 0.06 * SS(0.3 - y, 0, 0.5)));
    return JZC + JZF * Math.sqrt(1 - q * q) - 0.06 * SS(0.1 - y, 0, 0.35);
  };
  const lowZ = (x, y) => {
    const hz = anatomy.headFrontZ(x, y);
    const jz = jowlZ(x, y);
    return hz == null ? jz : smax(hz, jz, 0.06);
  };
  const lowN = (x, y, t = new THREE.Vector3()) => {
    const h = 1e-3;
    return t.set(-(lowZ(x + h, y) - lowZ(x - h, y)) / (2 * h), -(lowZ(x, y + h) - lowZ(x, y - h)) / (2 * h), 1).normalize();
  };
  const lowPt = (x, y, lift, t = new THREE.Vector3()) => {
    const n = lowN(x, y);
    return t.set(x, y, lowZ(x, y)).addScaledVector(n, lift);
  };
  /** thick bevelled plate on a (a, b) parametrisation of the low surface */
  function lowPlate(S, { a0 = 0, a1 = 1, b0 = 0, b1 = 1, thickness = 0.05, bevel = 0.01, gap = 0, segU = 16, segV = 6 } = {}) {
    let flip = false;
    const map = (a) => (flip ? a0 + a1 - a : a);
    const h = 1e-3, pa = new THREE.Vector3(), pb = new THREE.Vector3(), tmp = new THREE.Vector3();
    const P = (a, b, t) => S(map(a), b, t);
    const outAt = (a, b) => { const p = S(map(a), b, new THREE.Vector3()); return lowN(p.x, p.y); };
    const Nf = (a, b, t) => {
      P(a + h, b, pa); P(a - h, b, tmp); pa.sub(tmp);
      P(a, b + h, pb); P(a, b - h, tmp); pb.sub(tmp);
      t.crossVectors(pa, pb);
      const ref = outAt(a, b);
      if (t.lengthSq() < 1e-16) return t.copy(ref);
      t.normalize();
      if (t.dot(ref) < 0) t.negate();
      return t;
    };
    const am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
    P(am + h, bm, pa); P(am - h, bm, tmp); pa.sub(tmp);
    P(am, bm + h, pb); P(am, bm - h, tmp); pb.sub(tmp);
    if (pa.cross(pb).dot(outAt(am, bm)) < 0) flip = true;
    return geo.shellPatch({ u0: a0, u1: a1, y0: b0, y1: b1, surface: P, normal: Nf, offset: 0, thickness, bevel, gap, segU, segV });
  }
  const tailSection = (hw, cr, skirt) => {
    const pts = [[hw, -skirt], [hw, -cr]];
    for (let i = 1; i < 6; i++) { const a = (i / 6) * (Math.PI / 2); pts.push([hw - cr + cr * Math.cos(a), -cr + cr * Math.sin(a)]); }
    for (let i = 1; i < 5; i++) { const u = 1 - (2 * i) / 5; pts.push([u * (hw - cr), 0.006 * (1 - u * u)]); }
    for (let i = 0; i < 6; i++) { const a = Math.PI / 2 + (i / 6) * (Math.PI / 2); pts.push([-hw + cr + cr * Math.cos(a), -cr + cr * Math.sin(a)]); }
    pts.push([-hw, -cr], [-hw, -skirt]);
    return pts;
  };
  const lowBand = (pts, hw, lift, { cr = 0.026, skirt = 0.14, steps = 90, scale = null } = {}) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, l]) => lowPt(x, y, l ?? lift)), false, 'centripetal');
    const skirtAt = typeof skirt === 'function' ? skirt : () => skirt;
    return geo.sweptSection(curve, (t) => tailSection(hw, cr, skirtAt(t)), {
      steps, creaseAngle: deg(38),
      up: (t) => { const q = curve.getPointAt(t); return lowN(q.x, q.y); },
      scale: scale || ((t) => [1 - 0.35 * SS(t, 0.85, 1) - 0.25 * SS(0.12 - t, 0, 0.12), 1]),
    });
  };
  // the big U: broad, flattish LAYERED PLATES (not tubes) that wrap from the
  // outer face edge under the turbine and sweep forward / up to the mouth
  // corner. Built as ribbons offset outward from one base curve (the outer
  // edge of the scale-tile fan), each band a step lower than the one inside it.
  const U_BASE = new THREE.SplineCurve([
    // outer arm stays OUTSIDE the turbine rim (disc-frame r ~0.38-0.46)
    [0.66, 0.22], [0.64, 0.13], [0.58, 0.03], [0.5, -0.015], [0.4, 0.015], [0.31, 0.055],
    [0.245, 0.115], [0.205, 0.19], [0.19, 0.262],
  ].map(([x, y]) => new THREE.Vector2(x, y)));
  const _ut = new THREE.Vector2();
  const uFrame = (a) => {
    const p = U_BASE.getPointAt(THREE.MathUtils.clamp(a, 0, 1));
    U_BASE.getTangentAt(THREE.MathUtils.clamp(a, 0, 1), _ut);
    let nx = -_ut.y, ny = _ut.x;
    if (nx * (p.x - 0.4) + ny * (p.y - 0.215) < 0) { nx = -nx; ny = -ny; }
    return { x: p.x, y: p.y, nx, ny };
  };
  // band width shrinks toward the mouth end (bands converge beside the chin)
  // ...and at the outer arm, where they tuck behind the turbine instead of stepping out past the face edge
  const uWid = (a) => 1 - 0.5 * SS(a, 0.62, 1) - 0.62 * SS(0.3 - a, 0, 0.3);
  const uRibbon = (d0, d1, lift, { a0 = 0, a1 = 1, crown = 0.008, sink = 0.035, tilt = 0.045 } = {}) => (a, b, t) => {
    const f = uFrame(a);
    const w = uWid(a);
    const d = THREE.MathUtils.lerp(d0, d1, b) * w;
    // ends dive into the face so the plates read as tucked, not hanging
    const endK = SS(a, a0, a0 + 0.07) * SS(a1 - a, 0, 0.07);
    // outer edge stands proud (overlapping scales) so each plate tilts up into the key light
    const l = lift + crown * Math.sin(Math.PI * b) + tilt * b * endK - sink * (1 - endK);
    return lowPt(f.x + f.nx * d, f.y + f.ny * d, l, t);
  };
  const U_BANDS = [
    { d0: 0.0, d1: 0.068, lift: 0.038, a0: 0, a1: 1 },
    { d0: 0.073, d1: 0.128, lift: 0.03, a0: 0.07, a1: 0.95 },
    { d0: 0.133, d1: 0.178, lift: 0.022, a0: 0.15, a1: 0.9 },
  ];
  const uPlateGeos = U_BANDS.map((B) => lowPlate(uRibbon(B.d0, B.d1, B.lift, B), {
    a0: B.a0, a1: B.a1, b0: 0, b1: 1, thickness: 0.07, bevel: 0.012, gap: 0.0025, segU: 44, segV: 5,
  }));
  // fine stepped lip along the inner edge of each band (polished)
  const uLipGeos = U_BANDS.slice(0, 2).map((B) => lowPlate(uRibbon(B.d0 - 0.002, B.d0 + 0.012, B.lift + 0.012, { a0: B.a0 + 0.02, a1: B.a1 - 0.03, crown: 0.003, tilt: 0 }), {
    a0: B.a0 + 0.02, a1: B.a1 - 0.03, b0: 0, b1: 1, thickness: 0.02, bevel: 0.004, segU: 50, segV: 2,
  }));
  // dark backing slab under all three bands: no gap to the skull / jaw
  const uBackGeo = lowPlate(uRibbon(-0.01, 0.185, 0.0, { a0: 0, a1: 1, crown: 0, sink: 0.02, tilt: 0.03 }), {
    a0: 0, a1: 1, b0: 0, b1: 1, thickness: 0.09, bevel: 0.004, segU: 50, segV: 6,
  });

  // diagonal side band: follows the faceplate cheek-plate outer edge
  // ((0.525, 0.9) beside the outer eye -> mouth corner (0.158, 0.29)) on its
  // outer side, so the bright band of the close-up sits between the cheek
  // plate and the turbine (covers the inner rim of the disc).
  const EDGE0 = [0.525, 0.9], EDGE1 = [0.158, 0.29];
  const edgeX = (y) => EDGE1[0] + ((EDGE0[0] - EDGE1[0]) * (y - EDGE1[1])) / (EDGE0[1] - EDGE1[1]);
  // outer edge of the bright band (measured on the close-up): x at y
  const OUTER = new THREE.SplineCurve([[0.37, 0.24], [0.4, 0.36], [0.46, 0.6], [0.53, 0.78], [0.6, 0.92]].map(([x, y]) => new THREE.Vector2(x, y)));
  const outerPts = OUTER.getSpacedPoints(60);
  const outerX = (y) => {
    for (let i = 1; i < outerPts.length; i++) if (outerPts[i].y >= y) { const p0 = outerPts[i - 1], p1 = outerPts[i]; return p0.x + ((p1.x - p0.x) * (y - p0.y)) / (p1.y - p0.y || 1); }
    return outerPts[outerPts.length - 1].x;
  };
  const SB_Y0 = 0.25, SB_Y1 = 0.9;
  const sbS = (a, b, t) => {
    const y = THREE.MathUtils.lerp(SB_Y0, SB_Y1, b);
    const xi = Math.max(edgeX(y), 0.17) - 0.004, xo = outerX(y);
    const x = THREE.MathUtils.lerp(xi, xo, a);
    // rounded crown across the band
    return lowPt(x, y, 0.03 + 0.016 * Math.sin(Math.PI * a), t);
  };
  const sideBandGeo = lowPlate(sbS, { thickness: 0.07, bevel: 0.016, segU: 14, segV: 40 });
  // polished rail along its outer edge (borders the turbine)
  const railPts = [];
  for (let i = 0; i <= 10; i++) { const y = THREE.MathUtils.lerp(SB_Y0 + 0.03, SB_Y1 - 0.02, i / 10); railPts.push([outerX(y) + 0.012, y, 0.055]); }
  const sideRailGeo = lowBand(railPts, 0.016, 0.055, { cr: 0.012, skirt: 0.07, steps: 60 });

  // scale tiles: rows around FC (front-plane centre), phi from the inner
  // side (toward the mouth) round to straight down
  // close-up: a compact fan right beside the mouth corner, above the U plates
  const FC = [0.335, 0.262];
  const FC_J = [0.4, 0.215]; // jowl web centre (under the turbine)
  const ROWS = [
    { r0: 0.05, r1: 0.086, n: 4, lift: 0.014, ph0: 172, ph1: 272 },
    { r0: 0.082, r1: 0.117, n: 5, lift: 0.021, ph0: 170, ph1: 278 },
    { r0: 0.113, r1: 0.147, n: 6, lift: 0.028, ph0: 168, ph1: 284 },
    { r0: 0.143, r1: 0.178, n: 7, lift: 0.034, ph0: 166, ph1: 292 },
  ];
  const tileParts = [], tileDark = [];
  for (const R of ROWS) {
    for (let k = 0; k < R.n; k++) {
      const p0 = deg(R.ph0 + ((R.ph1 - R.ph0) * k) / R.n), p1 = deg(R.ph0 + ((R.ph1 - R.ph0) * (k + 1)) / R.n);
      const S = (a, b, t) => {
        const ph = THREE.MathUtils.lerp(p0, p1, a);
        const r = THREE.MathUtils.lerp(R.r0, R.r1, b);
        // each tile tilts: its outer edge stands proud (overlapping scales)
        // tilt each tile up (outer edge proud) so it catches the top light like the film scales
        return lowPt(FC[0] + r * Math.cos(ph), FC[1] + r * Math.sin(ph), R.lift + 0.012 * b * Math.max(0, -Math.sin(ph)), t);
      };
      tileParts.push(lowPlate(S, { thickness: 0.022, bevel: 0.006, gap: 0.0015, segU: 6, segV: 4 }));
      // small dark square socket on the tile (close-up detail)
      if (k % 3 === 1 && R === ROWS[1]) {
        const c = S(0.5, 0.5, new THREE.Vector3());
        const n = lowN(c.x, c.y);
        const bx = new THREE.BoxGeometry(0.01, 0.01, 0.01);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        bx.applyQuaternion(q);
        bx.translate(c.x + n.x * 0.006, c.y + n.y * 0.006, c.z + n.z * 0.006);
        tileDark.push(bx.toNonIndexed());
        bx.dispose();
      }
    }
  }
  const tileGeo = geo.mergeGeometries(tileParts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  const tileDarkGeo = geo.mergeGeometries(tileDark, false);
  // backing sheet under the tiles + bands so no gap shows to the jaw
  const backGeo = lowPlate((a, b, t) => {
    const ph = deg(THREE.MathUtils.lerp(165, 288, a));
    const r = THREE.MathUtils.lerp(0.04, 0.2, b);
    return lowPt(FC[0] + r * Math.cos(ph) * 1.02, FC[1] + r * Math.sin(ph), 0.004, t);
  }, { thickness: 0.06, bevel: 0.004, segU: 28, segV: 10 });
  // outer jowl web under / behind the turbine: closes the gaps between the
  // U bands (3/4 view) without covering the cavity
  const jowlBackGeo = lowPlate((a, b, t) => {
    const ph = deg(THREE.MathUtils.lerp(262, 372, a));
    const r = THREE.MathUtils.lerp(0.2, 0.37, b);
    return lowPt(FC_J[0] + r * Math.cos(ph), FC_J[1] + r * Math.sin(ph), 0.012, t);
  }, { thickness: 0.08, bevel: 0.006, segU: 30, segV: 8 });

  // red vent slot (concept art) between band2 and the fin, on the back side
  const V0 = deg(-22), V1 = deg(34);
  const ventTop = (th, r) => b2Top(th, r) - 0.03;
  const ventGeo = polarSweep({ th0: V0, th1: V1, rc: 0.528, hw: 0.012, top: ventTop, bottom: bottomFn, corner: 0.004, crown: 0, segs: 40, ends: 0 });
  const ribParts = [];
  for (let k = 0; k < 18; k++) {
    const u = V0 + ((k + 0.5) / 18) * (V1 - V0);
    ribParts.push(polarSweep({ th0: u - 0.012, th1: u + 0.012, rc: 0.528, hw: 0.015, top: (th, r) => ventTop(th, r) + 0.012, bottom: bottomFn, corner: 0.003, crown: 0, segs: 2 }));
  }
  ribParts.push(polarSweep({ th0: V0 - 0.04, th1: V1 + 0.04, rc: 0.546, hw: 0.007, top: (th, r) => b2Top(th, r) - 0.008, bottom: bottomFn, corner: 0.004, crown: 0, segs: 40 }));
  const ventRibGeo = geo.mergeGeometries(ribParts, false);
  ribParts.forEach((g) => g.dispose());

  // ---------------------------------------------------------- cavity (static)
  const RW = RIM_RC - RIM_HW + 0.003; // cavity wall radius (inside the rim)
  const Z = { s1: 0.0, s2: -0.022, s3: -0.044, floor: -0.1, plate: -0.058, vane: -0.07 };
  const wallGeo = polarLathe([
    { r: RW, z: Z.s1 - 0.004 },
    { r: RW, f: (th, r) => rimTop(th, r) - 0.012 },
  ], 128, inDir);
  const stepsGeo = polarLathe([
    { r: 0.2, z: Z.floor - 0.01 },
    { r: 0.2, z: Z.s3 - 0.004 }, { r: 0.204, z: Z.s3 },
    { r: 0.222, z: Z.s3 }, { r: 0.222, z: Z.s2 - 0.004 }, { r: 0.226, z: Z.s2 },
    { r: 0.24, z: Z.s2 }, { r: 0.24, z: Z.s1 - 0.004 }, { r: 0.244, z: Z.s1 },
    { r: RW + 0.002, z: Z.s1 },
  ].reverse(), 128);

  // ------------------------------------------------------------ rotor
  const floorGeo = polarLathe([{ r: 0.205, z: Z.floor }, { r: 0.0, z: Z.floor }], 64);
  // small dark hub disc (the swirl vanes fill the rest of the cavity)
  const plateGeo = polarLathe([
    { r: 0.082, z: Z.floor }, { r: 0.082, z: Z.plate - 0.012 }, { r: 0.078, z: Z.plate - 0.004 },
    { r: 0.072, z: Z.plate }, { r: 0.05, z: Z.plate + 0.002 }, { r: 0.046, z: Z.plate - 0.004 },
  ], 72);
  // radial spoke grooves on the inner plate
  const spokeParts = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const b = new THREE.BoxGeometry(0.022, 0.004, 0.004);
    b.translate(0.061, 0, Z.plate + 0.0012);
    b.rotateZ(a);
    spokeParts.push(b.toNonIndexed());
    b.dispose();
  }
  // short radial ticks on the outer step (film: fine notches)
  const spokesGeo = geo.mergeGeometries(spokeParts, false);
  spokeParts.forEach((g) => g.dispose());

  // turbine vane: thin, slightly swept blade built in its own frame so the
  // iris param can pitch it about its radial axis.
  const VANES = 30;
  const vR0 = 0.07, vR1 = 0.205, vSweep = 0.95, vH = 0.05;
  const vanePts = [];
  for (let i = 0; i <= 8; i++) {
    const s = i / 8;
    const r = vR0 + (vR1 - vR0) * s;
    const a = vSweep * Math.pow(s, 1.3);
    vanePts.push(new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), 0));
  }
  const vaneGeo = geo.sweptSection(new THREE.CatmullRomCurve3(vanePts), [
    [-0.003, -vH / 2], [0.003, -vH / 2], [0.003, vH / 2 - 0.006], [0, vH / 2], [-0.003, vH / 2 - 0.006],
  ], { steps: 10, up: new THREE.Vector3(0, 0, 1) });

  // ------------------------------------------------------------- hub
  const collarGeo = polarLathe([
    { r: 0.046, z: Z.plate - 0.004 }, { r: 0.046, z: -0.03 }, { r: 0.042, z: -0.024 },
    { r: 0.033, z: -0.024 }, { r: 0.031, z: -0.03 },
  ], 48);
  const capGeo = polarLathe([
    { r: 0.031, z: -0.032 }, { r: 0.03, z: -0.024 }, { r: 0.025, z: -0.017 }, { r: 0.016, z: -0.014 },
    { r: 0.01, z: -0.014 }, { r: 0.01, z: -0.018 },
  ], 48);
  // dark hex socket in the middle of the cap
  const coreGeo = new THREE.CylinderGeometry(0.0095, 0.0095, 0.01, 6, 1);
  coreGeo.rotateX(Math.PI / 2);
  coreGeo.translate(0, 0, -0.019);
  const glowGeo = polarLathe([{ r: 0.004, z: -0.0135 }, { r: 0.0, z: -0.0135 }], 16);

  // --------------------------------------------------------------- assemble
  const mirror = (g) => geo.mirrorGeometryX(g);
  const vaneGeoR = mirror(vaneGeo);
  const sides = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const Gm = side > 0 ? (g) => g : mirror;
    const joint = ctx.space(`cheek${key}`, 'local');
    const frame = new THREE.Group();
    frame.name = `cheeks.frame.${key}`;
    // mirrored frame: authoring is L-frame geometry mirrored in X; place it
    // with the L basis mirrored across the head's YZ plane.
    const basis = new THREE.Matrix4().makeBasis(EX, EY, N);
    if (side < 0) basis.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1)).multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
    frame.quaternion.setFromRotationMatrix(basis);
    frame.position.set(HUB_OFF.x * side, HUB_OFF.y, HUB_OFF.z);
    joint.add(frame);

    const add = (parent, g, mat, name) => {
      const m = ctx.mesh(Gm(g), mat, name);
      parent.add(m);
      return m;
    };
    add(frame, rimGeo, rimMat, `cheeks.rim.${key}`);
    add(frame, band1Geo, band1Mat, `cheeks.band1.${key}`);
    add(frame, band2Geo, band2Mat, `cheeks.band2.${key}`);
    const headSp = ctx.space(`cheek${key}`, 'head');
    add(headSp, uPlateGeos[0], band1Mat, `cheeks.uband1.${key}`);
    add(headSp, uLipGeos[0], rimMat, `cheeks.uband1.lip.${key}`);
    add(headSp, uBackGeo, stepMat, `cheeks.ubandBack.${key}`);
    add(headSp, sideBandGeo, rimMat, `cheeks.sideBand.${key}`);
    add(headSp, sideRailGeo, band2Mat, `cheeks.sideRail.${key}`);
    add(headSp, uPlateGeos[1], band2Mat, `cheeks.uband2.${key}`);
    add(headSp, uLipGeos[1], rimMat, `cheeks.uband2.lip.${key}`);
    add(ctx.space('jaw', 'head'), uPlateGeos[2], jowlMat, `cheeks.uband3.${key}`); // rides the jaw
    add(headSp, backGeo, stepMat, `cheeks.scaleBack.${key}`);
    add(headSp, jowlBackGeo, band2Mat, `cheeks.jowlBack.${key}`);
    add(headSp, tileGeo, jowlMat, `cheeks.scales.${key}`);
    add(headSp, tileDarkGeo, cavityMat, `cheeks.scaleSockets.${key}`);
    add(frame, ventGeo, ventMat, `cheeks.vent.${key}`);
    add(frame, ventRibGeo, darkMat, `cheeks.ventRibs.${key}`);
    add(frame, wallGeo, cavityMat, `cheeks.wall.${key}`);

    const stack = new THREE.Group();
    stack.name = `cheeks.stack.${key}`;
    frame.add(stack);
    add(stack, stepsGeo, ringMat, `cheeks.steps.${key}`);
    const rotor = new THREE.Group();
    rotor.name = `cheeks.rotor.${key}`;
    stack.add(rotor);
    add(rotor, floorGeo, cavityMat, `cheeks.floor.${key}`);
    add(rotor, plateGeo, plateMat, `cheeks.plate.${key}`);
    add(rotor, spokesGeo, darkMat, `cheeks.spokes.${key}`);
    const vanes = new THREE.InstancedMesh(side > 0 ? vaneGeo : vaneGeoR, vaneMat, VANES);
    vanes.name = `cheeks.vanes.${key}`;
    vanes.userData.part = 'cheeks';
    rotor.add(vanes);
    const hub = new THREE.Group();
    hub.name = `cheeks.hub.${key}`;
    stack.add(hub);
    add(hub, collarGeo, plateMat, `cheeks.hubCollar.${key}`);
    add(hub, capGeo, capMat, `cheeks.hubCap.${key}`);
    add(hub, coreGeo, cavityMat, `cheeks.hubCore.${key}`);
    add(hub, glowGeo, glowMat, `cheeks.hubGlow.${key}`);
    sides[key] = { side, stack, rotor, hub, vanes };
  }

  let phase = 0;
  const params = { spin: 0, spinSpeed: 0.15, iris: 0.5, pulse: 0, recess: 0 };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _ax = new THREE.Vector3();
  const writeVanes = (s, pitch) => {
    for (let i = 0; i < VANES; i++) {
      const phi = (i / VANES) * Math.PI * 2;
      // pitch about the vane's radial axis, then place it around the axis
      _ax.set(1, 0, 0);
      _q2.setFromAxisAngle(_ax, pitch);
      _q.setFromAxisAngle(UPZ, s.side * phi).multiply(_q2);
      _p.set(0, 0, Z.floor + vH / 2);
      _m.compose(_p, _q, _s);
      s.vanes.setMatrixAt(i, _m);
    }
    s.vanes.instanceMatrix.needsUpdate = true;
    s.vanes.computeBoundingSphere();
  };
  const apply = (p) => {
    for (const s of Object.values(sides)) {
      s.rotor.rotation.z = s.side * (p.spin + phase);
      writeVanes(s, THREE.MathUtils.lerp(1.1, 0.0, THREE.MathUtils.clamp(p.iris, 0, 1)));
      s.hub.position.z = -0.04 + p.pulse * 0.04;
      s.stack.position.z = -p.recess * 0.05;
    }
    glowMat.emissiveIntensity = 0.55 + 1.6 * THREE.MathUtils.clamp(p.pulse, 0, 1);
  };
  return {
    params,
    paramSpec: {
      spin: { min: -Math.PI, max: Math.PI, step: 0.01 },
      spinSpeed: { min: -3, max: 3, step: 0.01 },
      iris: { min: 0, max: 1, step: 0.01 },
      pulse: { min: 0, max: 1, step: 0.01 },
      recess: { min: -0.5, max: 1, step: 0.01 },
    },
    apply,
    update(t, dt, p) {
      if (!dt || !p.spinSpeed) return;
      phase = (phase + p.spinSpeed * dt) % (Math.PI * 2);
      for (const s of Object.values(sides)) s.rotor.rotation.z = s.side * (p.spin + phase);
    },
  };
}
