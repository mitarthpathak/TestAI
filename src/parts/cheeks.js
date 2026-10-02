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
  const HUB = [0.5, 0.4, 0.47]; // round 6: back + up (3D sculpt side view)
  const NRM = [0.93, -0.05, 0.36];
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
  const ringMat = M.get('gunmetal', { roughness: 0.34, color: 0x737a82, panel: 14, seed: 54, lineWidth: 0.004 });
  // round 6: the stepped rings read as lit metal treads (sculpt), not a black tunnel
  const treadMat = M.get('chrome', { roughness: 0.38, metalness: 0.75, color: 0xb3bac1, panel: 12, seed: 55, lineWidth: 0.0035 });
  treadMat.envMapIntensity = 2.4; // round 5: bold metal rings, not a dark tunnel
  const plateMat = M.get('gunmetal', { roughness: 0.34, color: 0x7d848c, panel: 18, seed: 57, lineWidth: 0.0025 });
  const vaneMat = M.get('chrome', { roughness: 0.32, metalness: 0.7, color: 0xa4abb2, seed: 59 });
  // round 7 (concept 3/4): the turbine face is a FLAT LIT disc, not a dark hole
  const floorMat = M.get('chrome', { roughness: 0.36, metalness: 0.6, color: 0xaeb5bc, panel: 16, seed: 58, lineWidth: 0.003 });
  floorMat.envMapIntensity = 2.7; floorMat.roughness = 0.4; // round 8: lit flat face
  const darkMat = M.get('darkMetal');
  const cavityMat = M.get('cavity');
  const capMat = M.get('gunmetal', { roughness: 0.34, color: 0x737a82 });
  const glowMat = M.get('redAccent', { intensity: 0.55 });
  // tone balance (concept = darker gunmetal flats, bright polished bevels;
  // the close-up = lighter silver): mid-dark flats with a tighter lobe so the
  // rounded crowns / bevels (shader curvature boost) carry the brightness.
  for (const m of [rimMat, band1Mat, band2Mat, jowlMat]) m.envMapIntensity = 1.75;
  rimMat.roughness = 0.2; band1Mat.roughness = 0.3; band2Mat.roughness = 0.32; jowlMat.roughness = 0.32;
  band1Mat.color.set(0xadb4bb); band2Mat.color.set(0x9aa1a9); jowlMat.color.set(0xa6adb4); // round 7: lit steel lower face rimMat.color.set(0xc0c6cc);
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
  const rimGeo = polarSweep({ th0: deg(-78), th1: deg(208), ends: [0.06, 0.06], rc: RIM_RC, hw: RIM_HW, top: rimTop, bottom: bottomFn, corner: 0.013, crown: 0.004, segs: 84 });

  // band1: inner C, curls under the disc and in to just outside the mouth corner
  const B1_HW = 0.046;
  // band1 hugs the turbine all the way under it (fills between rim and U plates)
  const B1_RC = spiral(0.373, 0.36, deg(-80), deg(-110));
  const b1Top = topFn(0.06, 0.08, 0.02, 1);
  const band1Geo = polarSweep({ th0: deg(-128), th1: deg(116), rc: B1_RC, hw: B1_HW, top: b1Top, bottom: bottomFn, corner: 0.013, crown: 0.004, segs: 76, ends: [0.08, 0.12], skirt: deepFront });

  // band2 + jowl: wrap the back / bottom of the disc, then hand over to a
  // TAIL (swept on the face surface) that runs down and in to the chin.
  const B2_HW = 0.046, B2_END = deg(-74);
  const B2_RC = spiral(0.462, 0.405, deg(-5), B2_END, 1.2); // round 8: tucks in below the disc (front width)
  const b2Top0 = topFn(0.055, 0.08, 0.016);
  // round 8 (front film still): below the hub band2 sinks toward the disc plane so
  // the lower face narrows into the U instead of bulging out sideways
  const b2Sink = (th) => 0.055 * SS(-wrapA(th), deg(15), deg(70));
  const b2Top = (th, r) => b2Top0(th, r) - b2Sink(th);
  const band2Geo = polarSweep({ th0: B2_END, th1: deg(104), rc: B2_RC, hw: B2_HW, top: b2Top, bottom: bottomFn, corner: 0.013, crown: 0.004, segs: 76, ends: [0, 0.12], skirt: deepFront });


  // ------------------------------------------------------------ lower face (HEAD space, left side)
  // Face close-up: under the turbine a thick rounded U band wraps from the
  // outer face edge down under the disc and back UP to the mouth corner, and
  // the space between it and the turbine rim is filled with concentric rows
  // of segmented "scale" tiles (overlapping, stepping outward).
  // Surface: the skull front blended with a wider jowl ellipsoid, so the
  // lower face is broad in front view (close-up ref) and wraps back at the sides.
  // round 5: jowl pulled back (3/4 concept: the lower face sits further back),
  // and the ellipse continues LINEARLY past q = 0.9 so the outer U-arm ends
  // keep a finite slope (no sawtooth where the surface went vertical).
  const JW = 0.67, JZC = 0.12, JZF = 0.64, QK = 0.9;
  const ellZ = (q) => {
    if (q <= QK) return Math.sqrt(1 - q * q);
    const s0 = Math.sqrt(1 - QK * QK);
    return s0 - (QK / s0) * (q - QK);
  };
  // chin recedes below the lip carrier (matches jaw.js chinPull)
  const chinPull = (x, y) => 0.04 * SS(0.12 - y, 0, 0.3) * (0.55 + 0.45 * Math.exp(-Math.pow(x / 0.3, 2)));
  const jowlZ = (x, y) => {
    const q = Math.abs(x) / (JW - 0.06 * SS(0.3 - y, 0, 0.5) - 0.06 * SS(0.34 - y, 0, 0.35)); // round 8: narrower below the discs
    return JZC + JZF * ellZ(q) - 0.06 * SS(0.1 - y, 0, 0.35);
  };
  const CHIN_BALL = [0, -0.1, 0.42, 0.37]; // x, y, z, radius (HEAD space)
  const lowZ = (x, y) => {
    const hz = anatomy.headFrontZ(x, y);
    const jz = jowlZ(x, y);
    const z0 = (hz == null ? jz : smax(hz, jz, 0.06)) - chinPull(x, y);
    // round 7 (sculpt side view): below the fan the lower face rounds into ONE
    // big chin ball (same ball as jaw.js CHIN_BALL) so the U-band ends and the
    // chin read as a single projecting mass
    const k = SS(0.14 - y, 0, 0.2);
    if (k <= 0) return z0;
    const dx = x, dy = y - CHIN_BALL[1];
    const q = CHIN_BALL[3] * CHIN_BALL[3] - dx * dx - dy * dy;
    const bz = q > 0 ? CHIN_BALL[2] + Math.sqrt(q) : CHIN_BALL[2];
    return THREE.MathUtils.lerp(z0, Math.max(bz, z0 - 0.12), k);
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
    // round 5: U raised (close-up: its bottom sits just under the scale fan)
    // round 7 (close-up + sculpt): the U sits LOW and its inner arm runs down
    // beside the chin to end at the chin button, not up at the mouth corner
    // round 8 (front film still): the U closes in under the turbine (C shape),
    // so the lower face narrows below the discs into the long muzzle / chin
    [0.545, 0.215], [0.5, 0.16], [0.435, 0.115], [0.36, 0.08], [0.29, 0.045], [0.235, 0.015],
    [0.19, -0.012], [0.157, -0.03], [0.135, -0.035],
  ].map(([x, y]) => new THREE.Vector2(x, y)));
  const _ut = new THREE.Vector2();
  const _ubs = U_BASE.getSpacedPoints(80);
  /** y of the U base curve at x (lower branch); used to clip the scale fan */
  const uBaseY = (x) => {
    let best = -1, by = -0.2;
    for (const q of _ubs) { const d = Math.abs(q.x - x); if (best < 0 || d < best) { best = d; by = q.y; } }
    return by;
  };
  const uFrame = (a) => {
    const p = U_BASE.getPointAt(THREE.MathUtils.clamp(a, 0, 1));
    U_BASE.getTangentAt(THREE.MathUtils.clamp(a, 0, 1), _ut);
    let nx = -_ut.y, ny = _ut.x;
    if (nx * (p.x - 0.3) + ny * (p.y - 0.3) < 0) { nx = -nx; ny = -ny; }
    return { x: p.x, y: p.y, nx, ny };
  };
  // band width shrinks toward the mouth end (bands converge beside the chin)
  // ...and at the outer arm, where they tuck behind the turbine instead of stepping out past the face edge
  const U_DW = 0.84; // round 8: slimmer U stack (front width)
  const uWid = (a) => 1 - 0.5 * SS(a, 0.62, 1) - 0.62 * SS(0.3 - a, 0, 0.3);
  const uRibbon = (d0, d1, lift, { a0 = 0, a1 = 1, crown = 0.014, sink = 0.035, tilt = 0.0 } = {}) => (a, b, t) => {
    const f = uFrame(a);
    const w = uWid(a);
    // clean tapered tips: both edges converge on the band centre line at the ends
    const tip = 0.12 + 0.88 * SS(a, a0, a0 + 0.13) * (0.6 + 0.4 * SS(a1 - a, 0, 0.1)); // round 7: blunt ends against the chin
    const dm = (d0 + d1) / 2;
    const d = (dm + (THREE.MathUtils.lerp(d0, d1, b) - dm) * tip) * w * U_DW;
    // ends dive into the face so the plates read as tucked, not hanging
    const endK = SS(a, a0, a0 + 0.1) * SS(a1 - a, 0, 0.08);
    // outer edge stands proud (overlapping scales) so each plate tilts up into the key light
    const px = f.x + f.nx * d, py = f.y + f.ny * d;
    // round 7: the lower arms recede beside the chin so the chin mass projects (sculpt side view)
    const l = lift + crown * Math.sin(Math.PI * b) + tilt * b * endK - sink * (1 - endK);
    return lowPt(px, py, l, t);
  };
  const U_BANDS = [
    { d0: 0.0, d1: 0.08, lift: 0.038, a0: 0, a1: 1 },
    { d0: 0.083, d1: 0.136, lift: 0.03, a0: 0.07, a1: 0.95 },
    { d0: 0.139, d1: 0.18, lift: 0.022, a0: 0.15, a1: 0.9 },
  ];
  // band3 rides a partial jaw flex; its hidden inner skirt tucks UNDER band2 so
  // the open pose reveals a layered plate instead of a gap
  const U3_HIDDEN = { d0: 0.1, d1: 0.145, lift: 0.004, a0: 0.17, a1: 0.88, crown: 0, tilt: 0 };
  const uPlateGeos = U_BANDS.map((B) => lowPlate(uRibbon(B.d0, B.d1, B.lift, B), {
    a0: B.a0, a1: B.a1, b0: 0, b1: 1, thickness: 0.07, bevel: 0.012, gap: 0.0025, segU: 44, segV: 5,
  }));
  const u3HiddenGeo = lowPlate(uRibbon(U3_HIDDEN.d0, U3_HIDDEN.d1, U3_HIDDEN.lift, U3_HIDDEN), {
    a0: U3_HIDDEN.a0, a1: U3_HIDDEN.a1, b0: 0, b1: 1, thickness: 0.05, bevel: 0.004, segU: 36, segV: 3,
  });
  // fine stepped lip along the inner edge of each band (polished)
  const uLipGeos = U_BANDS.slice(0, 2).map((B) => lowPlate(uRibbon(B.d0 - 0.002, B.d0 + 0.012, B.lift + 0.012, { a0: B.a0 + 0.02, a1: B.a1 - 0.03, crown: 0.003, tilt: 0 }), {
    a0: B.a0 + 0.02, a1: B.a1 - 0.03, b0: 0, b1: 1, thickness: 0.02, bevel: 0.004, segU: 40, segV: 2,
  }));
  // dark backing slab under all three bands: no gap to the skull / jaw
  const uBackGeo = lowPlate(uRibbon(-0.01, 0.185, 0.0, { a0: 0, a1: 1, crown: 0, sink: 0.02, tilt: 0.03 }), {
    a0: 0, a1: 1, b0: 0, b1: 1, thickness: 0.09, bevel: 0.004, segU: 36, segV: 3,
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
  const sideBandGeo = lowPlate(sbS, { thickness: 0.07, bevel: 0.016, segU: 10, segV: 22 });
  // polished rail along its outer edge (borders the turbine)
  const railPts = [];
  for (let i = 0; i <= 10; i++) { const y = THREE.MathUtils.lerp(SB_Y0 + 0.03, SB_Y1 - 0.02, i / 10); railPts.push([outerX(y) + 0.012, y, 0.055]); }
  const sideRailGeo = lowBand(railPts, 0.016, 0.055, { cr: 0.012, skirt: 0.07, steps: 60 });

  // scale tiles: rows around FC (front-plane centre), phi from the inner
  // side (toward the mouth) round to straight down
  // close-up: a compact fan right beside the mouth corner, above the U plates
  const FC = [0.36, 0.235]; // round 7: big fan centred under the turbine, reaching to the muzzle + U
  const FC_J = [0.36, 0.235]; // round 8: pulled in with the U // jowl web centre (under the turbine)
  const ROWS = [
    { r0: 0.045, r1: 0.08, n: 4, lift: 0.012, ph0: 176, ph1: 296 },
    { r0: 0.077, r1: 0.112, n: 5, lift: 0.017, ph0: 176, ph1: 296 },
    { r0: 0.109, r1: 0.144, n: 6, lift: 0.022, ph0: 176, ph1: 296 },
    { r0: 0.141, r1: 0.176, n: 7, lift: 0.027, ph0: 176, ph1: 296 },
    { r0: 0.173, r1: 0.208, n: 8, lift: 0.032, ph0: 178, ph1: 296 },
    { r0: 0.205, r1: 0.24, n: 9, lift: 0.036, ph0: 182, ph1: 296 },
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
      // clip the fan: stays outside the muzzle plates and above the U bands
      {
        const phm = (p0 + p1) / 2, rm = (R.r0 + R.r1) / 2;
        const cx = FC[0] + rm * Math.cos(phm), cy = FC[1] + rm * Math.sin(phm);
        if (cx < 0.2 || cy < uBaseY(cx) + 0.012) continue;
      }
      tileParts.push(lowPlate(S, { thickness: 0.022, bevel: 0.006, gap: 0.0015, segU: 2, segV: 1 }));
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
    const ph = deg(THREE.MathUtils.lerp(172, 298, a));
    const r = THREE.MathUtils.lerp(0.035, 0.25, b);
    return lowPt(FC[0] + r * Math.cos(ph) * 1.02, FC[1] + r * Math.sin(ph), 0.004, t);
  }, { thickness: 0.06, bevel: 0.004, segU: 22, segV: 8 });
  // outer jowl web under / behind the turbine: closes the gaps between the
  // U bands (3/4 view) without covering the cavity
  const jowlBackGeo = lowPlate((a, b, t) => {
    const ph = deg(THREE.MathUtils.lerp(255, 328, a)); // round 8: stays under the disc (no block across the cavity)
    const r = THREE.MathUtils.lerp(0.15, 0.275, b);
    return lowPt(FC_J[0] + r * Math.cos(ph), FC_J[1] + r * Math.sin(ph), -0.004, t);
  }, { thickness: 0.08, bevel: 0.006, segU: 22, segV: 7 });

  // red vent slot (concept art) between band2 and the fin, on the back side
  const V0 = deg(-22), V1 = deg(34);
  const ventTop = (th, r) => b2Top(th, r) - 0.03;
  const ventGeo = polarSweep({ th0: V0, th1: V1, rc: 0.528, hw: 0.012, top: ventTop, bottom: bottomFn, corner: 0.004, crown: 0, segs: 40, ends: 0 });
  const ribParts = [];
  for (let k = 0; k < 12; k++) {
    const u = V0 + ((k + 0.5) / 12) * (V1 - V0);
    ribParts.push(polarSweep({ th0: u - 0.012, th1: u + 0.012, rc: 0.528, hw: 0.015, top: (th, r) => ventTop(th, r) + 0.012, bottom: bottomFn, corner: 0.003, crown: 0, segs: 2 }));
  }
  ribParts.push(polarSweep({ th0: V0 - 0.04, th1: V1 + 0.04, rc: 0.546, hw: 0.007, top: (th, r) => b2Top(th, r) - 0.008, bottom: bottomFn, corner: 0.004, crown: 0, segs: 40 }));
  const ventRibGeo = geo.mergeGeometries(ribParts, false);
  ribParts.forEach((g) => g.dispose());

  // round 6 (3D sculpt): densely ribbed strip along the TOP edge of the outer
  // C band, from behind the disc over the top to under the outer eye corner.
  const RB0 = deg(36), RB1 = deg(124), RB_HW = 0.024;
  // runs diagonally in the sculpt: high at the back, dropping toward the eye corner
  const RB_RC = (th) => 0.535 - 0.05 * SS(th, deg(70), RB1);
  const ribTop = (th, r) => b2Top(th, r) - 0.012;
  const ribBaseGeo = polarSweep({ th0: RB0, th1: RB1, rc: RB_RC, hw: RB_HW, top: ribTop, bottom: bottomFn, corner: 0.006, crown: 0.002, segs: 50, ends: [0.05, 0.05] });
  const fineParts = [];
  const RIBS = 34;
  for (let k = 0; k < RIBS; k++) {
    const u = RB0 + ((k + 0.5) / RIBS) * (RB1 - RB0);
    const e = Math.min(1, (k + 0.5) / 4, (RIBS - k - 0.5) / 4);
    fineParts.push(polarSweep({ th0: u - 0.0055, th1: u + 0.0055, rc: RB_RC, hw: RB_HW * (0.6 + 0.3 * e), top: (th, r) => ribTop(th, r) + 0.009, bottom: (th, r) => ribTop(th, r) - 0.004, corner: 0.002, crown: 0.002, segs: 1, skirt: 0.02 }));
  }
  const fineRibGeo = geo.mergeGeometries(fineParts, false);
  fineParts.forEach((g) => g.dispose());

  // round 6 (sculpt): under the disc the inner band reads as two rows of
  // segmented tiles — dark radial + one circumferential seam cut into band1.
  const segParts = [];
  const SEG0 = deg(-126), SEG1 = deg(-28);
  for (let k = 0; k <= 11; k++) {
    const u = SEG0 + ((SEG1 - SEG0) * k) / 11;
    segParts.push(polarSweep({ th0: u - 0.006, th1: u + 0.006, rc: B1_RC, hw: B1_HW * 0.92, top: (th, r) => b1Top(th, r) + 0.003, bottom: (th, r) => b1Top(th, r) - 0.01, corner: 0.002, crown: 0, segs: 1, skirt: 0.02 }));
  }
  segParts.push(polarSweep({ th0: SEG0, th1: SEG1, rc: (th) => B1_RC(th) + 0.004, hw: 0.0035, top: (th, r) => b1Top(th, r) + 0.003, bottom: (th, r) => b1Top(th, r) - 0.01, corner: 0.0015, crown: 0, segs: 40, skirt: 0.02 }));
  const tileSeamGeo = geo.mergeGeometries(segParts, false);
  segParts.forEach((g) => g.dispose());

  // ---------------------------------------------------------- cavity (static)
  const RW = RIM_RC - RIM_HW + 0.003; // cavity wall radius (inside the rim)
  // round 6 (3D sculpt, side view): a DEEP recessed disc — six concentric
  // stepped rings descend from the rim to a small flat turbine face + hub.
  // round 8 (concept 3/4): SHALLOW — the rings step down only a little to a
  // flat lit turbine face close to the rim plane
  const Z = { s1: 0.018, floor: -0.048, plate: -0.03, vane: -0.04 };
  const STEP_N = 5, STEP_R1 = 0.158, STEP_DZ = (Z.s1 - (Z.floor + 0.012)) / STEP_N;
  const wallGeo = polarLathe([
    { r: RW, z: Z.s1 - 0.03 },
    { r: RW, f: (th, r) => rimTop(th, r) - 0.012 },
  ], 128, inDir);
  const stepProf = [{ r: RW + 0.002, z: Z.s1 }];
  for (let i = 0; i < STEP_N; i++) {
    const rOut = RW - ((RW - STEP_R1) * i) / STEP_N;
    const rIn = RW - ((RW - STEP_R1) * (i + 1)) / STEP_N;
    const z = Z.s1 - STEP_DZ * i;
    // flat tread with a rounded nose, then a vertical riser down to the next tread
    stepProf.push({ r: rIn + 0.006, z }, { r: rIn + 0.0015, z: z - 0.002 }, { r: rIn, z: z - 0.006 }, { r: rIn, z: z - STEP_DZ });
  }
  stepProf.push({ r: STEP_R1 - 0.004, z: Z.floor - 0.006 });
  const stepsGeo = polarLathe(stepProf, 80);

  // ------------------------------------------------------------ rotor
  // flat turbine face with concentric stepped grooves (concept: speaker-like rings)
  const floorGeo = polarLathe([
    { r: STEP_R1, z: Z.floor }, { r: 0.136, z: Z.floor }, { r: 0.132, z: Z.floor + 0.004 }, { r: 0.112, z: Z.floor + 0.004 }, { r: 0.108, z: Z.floor + 0.007 }, { r: 0.09, z: Z.floor + 0.007 },
    { r: 0.086, z: Z.floor + 0.01 }, { r: 0.0, z: Z.floor + 0.01 },
  ], 96);
  // small dark hub disc (the swirl vanes fill the rest of the cavity)
  const plateGeo = polarLathe([
    { r: 0.064, z: Z.floor }, { r: 0.064, z: Z.plate - 0.01 }, { r: 0.06, z: Z.plate - 0.003 },
    { r: 0.055, z: Z.plate }, { r: 0.04, z: Z.plate + 0.002 }, { r: 0.037, z: Z.plate - 0.004 },
  ], 72);
  // radial spoke grooves on the inner plate
  const spokeParts = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const b = new THREE.BoxGeometry(0.022, 0.004, 0.004);
    b.translate(0.048, 0, Z.plate + 0.0012);
    b.rotateZ(a);
    spokeParts.push(b.toNonIndexed());
    b.dispose();
  }
  // short radial ticks on the outer step (film: fine notches)
  const spokesGeo = geo.mergeGeometries(spokeParts, false);
  spokeParts.forEach((g) => g.dispose());

  // turbine vane: thin, slightly swept blade built in its own frame so the
  // iris param can pitch it about its radial axis.
  const VANES = 14;
  const vR0 = 0.07, vR1 = 0.15, vSweep = 0.12, vH = 0.01;
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
    { r: 0.046, z: -0.05 }, { r: 0.046, z: -0.03 }, { r: 0.042, z: -0.024 },
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
  const flexGroups = [];
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
    // band3 rides HALF the jaw motion (own flex pivot inside jaw space)
    const u3Flex = new THREE.Group();
    u3Flex.name = `cheeks.uband3Flex.${key}`;
    ctx.space('jaw', 'head').add(u3Flex);
    flexGroups.push(u3Flex);
    add(u3Flex, uPlateGeos[2], jowlMat, `cheeks.uband3.${key}`);
    add(u3Flex, u3HiddenGeo, stepMat, `cheeks.uband3.under.${key}`);
    add(headSp, backGeo, stepMat, `cheeks.scaleBack.${key}`);
    add(headSp, jowlBackGeo, band2Mat, `cheeks.jowlBack.${key}`);
    add(headSp, tileGeo, jowlMat, `cheeks.scales.${key}`);
    add(headSp, tileDarkGeo, cavityMat, `cheeks.scaleSockets.${key}`);
    add(frame, ventGeo, ventMat, `cheeks.vent.${key}`);
    add(frame, ventRibGeo, darkMat, `cheeks.ventRibs.${key}`);
    add(frame, ribBaseGeo, band2Mat, `cheeks.ribBand.${key}`);
    add(frame, fineRibGeo, rimMat, `cheeks.ribs.${key}`);
    add(frame, tileSeamGeo, darkMat, `cheeks.band1.seams.${key}`);
    add(frame, wallGeo, ringMat, `cheeks.wall.${key}`);

    const stack = new THREE.Group();
    stack.name = `cheeks.stack.${key}`;
    frame.add(stack);
    // tilt the dish toward the skull's high (upper-back) side so the turbine
    // face sits near-flush all round instead of reading as a deep tunnel
    {
      const phi = deg(72), tilt = deg(9);
      stack.quaternion.setFromAxisAngle(new THREE.Vector3(-Math.sin(phi), Math.cos(phi), 0), -tilt);
    }
    add(stack, stepsGeo, treadMat, `cheeks.steps.${key}`);
    const rotor = new THREE.Group();
    rotor.name = `cheeks.rotor.${key}`;
    stack.add(rotor);
    add(rotor, floorGeo, floorMat, `cheeks.floor.${key}`);
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

  const HUB_Z = Z.plate + 0.03; // hub collar/cap authored around z -0.02 -> stands proud of the plate
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
  // partial jaw follow (same maths as jaw.js syncFlex): G = T(h) J^-1 K T(-h)
  const FLEX_K = 0.5;
  const hinge = new THREE.Vector3().fromArray(anatomy.JOINTS.jaw.pos);
  const _mJ = new THREE.Matrix4(), _mK = new THREE.Matrix4(), _G = new THREE.Matrix4();
  const _mT = new THREE.Matrix4().makeTranslation(hinge.x, hinge.y, hinge.z);
  const _mTi = new THREE.Matrix4().makeTranslation(-hinge.x, -hinge.y, -hinge.z);
  const _qK = new THREE.Quaternion(), _pK = new THREE.Vector3(), _dp = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
  const syncFlex = () => {
    const j = ctx.rig.joints.jaw;
    const rest = j.userData.restPosition || hinge;
    _dp.copy(j.position).sub(rest);
    _mJ.compose(j.position, j.quaternion, _one).invert();
    _qK.identity().slerp(j.quaternion, FLEX_K);
    _pK.copy(rest).addScaledVector(_dp, FLEX_K);
    _mK.compose(_pK, _qK, _one);
    _G.copy(_mT).multiply(_mJ).multiply(_mK).multiply(_mTi);
    for (const g of flexGroups) _G.decompose(g.position, g.quaternion, g.scale);
  };
  const apply = (p) => {
    syncFlex();
    for (const s of Object.values(sides)) {
      s.rotor.rotation.z = s.side * (p.spin + phase);
      writeVanes(s, THREE.MathUtils.lerp(1.1, 0.0, THREE.MathUtils.clamp(p.iris, 0, 1)));
      s.hub.position.z = HUB_Z + p.pulse * 0.04;
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
      syncFlex();
      if (!dt || !p.spinSpeed) return;
      phase = (phase + p.spinSpeed * dt) % (Math.PI * 2);
      for (const s of Object.values(sides)) s.rotor.rotation.z = s.side * (p.spin + phase);
    },
  };
}
