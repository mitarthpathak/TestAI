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
  const C = new THREE.Vector3().fromArray(LM.cheekDiscL);
  const N = new THREE.Vector3().fromArray(LM.cheekDiscNormalL).normalize();
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
  const rimMat = M.get('chrome', { roughness: 0.17, color: 0xa4abb3, panel: 7, seed: 41, lineWidth: 0.003 });
  const band1Mat = M.get('chrome', { roughness: 0.22, color: 0x959ca4, panel: 6, seed: 43, lineWidth: 0.0035 });
  const band2Mat = M.get('gunmetal', { roughness: 0.26, color: 0x7d858e, panel: 5, seed: 47, lineWidth: 0.0035 });
  const jowlMat = M.get('gunmetal', { roughness: 0.28, color: 0x737a83, panel: 6.5, seed: 49, lineWidth: 0.0035 });
  const stepMat = M.get('gunmetal', { roughness: 0.3, panel: 14, seed: 53, lineWidth: 0.004 });
  const plateMat = M.get('chrome', { roughness: 0.2, color: 0xa8aeb5, panel: 18, seed: 57, lineWidth: 0.0025 });
  const vaneMat = M.get('darkMetal', { roughness: 0.34, color: 0x50555c });
  const darkMat = M.get('darkMetal');
  const cavityMat = M.get('cavity');
  const capMat = M.get('chrome', { roughness: 0.08, color: 0xc2c8ce });
  const glowMat = M.get('redAccent', { intensity: 0.55 });
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
  const deepFront = (th) => 0.12 + 0.22 * SS(-wrapA(th), 1.6, 2.4);

  const RIM_RC = 0.29, RIM_HW = 0.032;
  const rimTop = topFn(0.1, 0.1, 0.045, 1, 0);
  const rimGeo = polarSweep({ th0: 0, th1: Math.PI * 2, closed: true, rc: RIM_RC, hw: RIM_HW, top: rimTop, bottom: bottomFn, corner: 0.022, crown: 0.008, segs: 128 });

  // band1: inner C, curls under the disc and in to just outside the mouth corner
  const B1_HW = 0.036;
  const B1_RC = spiral(0.36, 0.42, deg(-90), deg(-128));
  const b1Top = topFn(0.1, 0.08, 0.04, 1);
  const band1Geo = polarSweep({ th0: deg(-128), th1: deg(116), rc: B1_RC, hw: B1_HW, top: b1Top, bottom: bottomFn, corner: 0.024, crown: 0.008, segs: 140, ends: [0.08, 0.12], skirt: deepFront });

  // band2 + jowl: wrap the back / bottom of the disc, then hand over to a
  // TAIL (swept on the face surface) that runs down and in to the chin.
  const B2_HW = 0.038, B2_END = deg(-94);
  const B2_RC = spiral(0.435, 0.47, deg(-60), B2_END);
  const b2Top = topFn(0.1, 0.08, 0.034);
  const band2Geo = polarSweep({ th0: B2_END, th1: deg(104), rc: B2_RC, hw: B2_HW, top: b2Top, bottom: bottomFn, corner: 0.024, crown: 0.008, segs: 140, ends: [0, 0.12], skirt: deepFront });

  const J_HW = 0.036, J_END = deg(-88);
  const J_RC = spiral(0.505, 0.53, deg(-50), J_END);
  const jTop = topFn(0.085, 0.08, 0.028);
  const jowlGeo = polarSweep({ th0: J_END, th1: deg(-22), rc: J_RC, hw: J_HW, top: jTop, bottom: bottomFn, corner: 0.02, crown: 0.006, segs: 80, ends: [0, 0.14], skirt: deepFront });

  // ------------------------------------------------------------ tails (HEAD space, left side)
  const FRAME = new THREE.Matrix4().makeBasis(EX, EY, N).setPosition(C);
  const polarPt = (th, rcF, topF) => {
    const r = typeof rcF === 'function' ? rcF(th) : rcF;
    return new THREE.Vector3(r * Math.cos(th), r * Math.sin(th), topF(th, r)).applyMatrix4(FRAME);
  };
  const surfPt = (x, y, lift) => {
    const z = anatomy.headFrontZ(x, y) ?? anatomy.headSection(y).zc;
    const n = anatomy.headNormal(anatomy.headAngleForX(x, y), y, new THREE.Vector3());
    return new THREE.Vector3(x, y, z).addScaledVector(n, lift);
  };
  const tailSection = (hw, cr, skirt) => {
    const pts = [[hw, -skirt], [hw, -cr]];
    for (let i = 1; i < 6; i++) { const a = (i / 6) * (Math.PI / 2); pts.push([hw - cr + cr * Math.cos(a), -cr + cr * Math.sin(a)]); }
    for (let i = 1; i < 5; i++) { const u = 1 - (2 * i) / 5; pts.push([u * (hw - cr), 0.004 * (1 - u * u)]); }
    for (let i = 0; i < 6; i++) { const a = Math.PI / 2 + (i / 6) * (Math.PI / 2); pts.push([-hw + cr + cr * Math.cos(a), -cr + cr * Math.sin(a)]); }
    pts.push([-hw, -cr], [-hw, -skirt]);
    return pts;
  };
  /** band continuation: starts inside the polar band end, then rides the face to the chin */
  function tail({ thEnd, rcF, topF, hw, pts, lift, endScale = 0.55, skirt = 0.06 }) {
    const P = [polarPt(thEnd + deg(14), rcF, topF), polarPt(thEnd + deg(7), rcF, topF), polarPt(thEnd, rcF, topF)];
    for (const [x, y, l] of pts) P.push(surfPt(x, y, l ?? lift));
    const curve = new THREE.CatmullRomCurve3(P, false, 'centripetal');
    const Nhead = N.clone();
    const up = (t) => {
      const q = curve.getPointAt(t);
      const hn = anatomy.headNormal(anatomy.headAngleForX(q.x, q.y), q.y, new THREE.Vector3());
      return Nhead.clone().lerp(hn, SS(t, 0.02, 0.3)).normalize();
    };
    const scaleAt = (t) => [1 - (1 - endScale) * SS(t, 0.4, 1), 1 - 0.35 * SS(t, 0.75, 1)];
    // two overlapping segments: the upper one is fixed to the head, the lower
    // one rides the jaw and slides out from under it when the mouth opens
    const piece = (t0, t1, k, dy) => {
      const sub = [];
      for (let i = 0; i <= 24; i++) sub.push(curve.getPointAt(t0 + ((t1 - t0) * i) / 24));
      const c = new THREE.CatmullRomCurve3(sub, false, 'centripetal');
      const sec = tailSection(hw * k, Math.min(0.022, hw * 0.7) * k, skirt).map(([x, y]) => [x, y + dy]);
      return geo.sweptSection(c, sec, {
        steps: Math.round(90 * (t1 - t0)) + 4, up: (s) => up(t0 + (t1 - t0) * s), creaseAngle: deg(38),
        scale: (s) => scaleAt(t0 + (t1 - t0) * s),
      });
    };
    return { curve, up, upper: piece(0, 0.6, 1, 0), lower: piece(0.48, 1, 0.9, -0.008) };
  }
  const tail2Geo = tail({ thEnd: B2_END, rcF: B2_RC, topF: b2Top, hw: B2_HW, lift: 0.035,
    pts: [[0.36, -0.05, 0.04], [0.29, -0.1, 0.045], [0.2, -0.13, 0.06], [0.12, -0.13, 0.08]] });
  const tailJGeo = tail({ thEnd: J_END, rcF: J_RC, topF: jTop, hw: J_HW, lift: 0.03,
    pts: [[0.36, -0.12, 0.035], [0.28, -0.19, 0.045], [0.19, -0.23, 0.06], [0.11, -0.24, 0.075]] });

  // ------------------------------------------------------------ fan (HEAD space)
  // ribbed web under the disc between band1 (ends at the mouth corner) and
  // the band2 tail, so the lower bands read as one dense concentric fan that
  // sweeps forward to the chin (film frames), with no dark gaps.
  const FAN_T1 = 0.56;
  const fanIn = (b, t = new THREE.Vector3()) => t.copy(polarPt(THREE.MathUtils.lerp(deg(-86), deg(-124), b), B1_RC, b1Top));
  const fanOut = (b) => tail2Geo.curve.getPointAt(THREE.MathUtils.lerp(0.02, FAN_T1, b));
  const fanUp = (b) => tail2Geo.up(THREE.MathUtils.lerp(0.02, FAN_T1, b));
  let fanFlip = false;
  const fanS0 = (a, b, t = new THREE.Vector3()) => {
    fanIn(b, t).lerp(fanOut(b), a);
    return t.addScaledVector(fanUp(b), -0.016 - 0.012 * Math.sin(Math.PI * a));
  };
  {
    const da = fanS0(0.51, 0.5).sub(fanS0(0.49, 0.5)), db = fanS0(0.5, 0.51).sub(fanS0(0.5, 0.49));
    fanFlip = da.cross(db).dot(fanUp(0.5)) < 0;
  }
  const fanS = (a, b, t = new THREE.Vector3()) => {
    if (fanFlip) a = 1 - a;
    fanIn(b, t).lerp(fanOut(b), a);
    // sink below the band tops, with a gentle concave dish between them
    return t.addScaledVector(fanUp(b), -0.016 - 0.012 * Math.sin(Math.PI * a));
  };
  const fanGeo = (() => {
    const h = 1e-3, pa = new THREE.Vector3(), pb = new THREE.Vector3(), tmp = new THREE.Vector3();
    const nrm = (a, b, t) => {
      fanS(a + h, b, pa); fanS(a - h, b, tmp); pa.sub(tmp);
      fanS(a, b + h, pb); fanS(a, b - h, tmp); pb.sub(tmp);
      t.crossVectors(pa, pb).normalize();
      if (t.dot(fanUp(b)) < 0) t.negate();
      return t;
    };
    return geo.shellPatch({ u0: 0, u1: 1, y0: 0, y1: 1, surface: fanS, normal: nrm, offset: 0, thickness: 0.05, bevel: 0.006, segU: 14, segV: 40 });
  })();
  // concentric ribs on the fan (continue the band rhythm down to the chin)
  const fanRibParts = [];
  for (const a of [0.22, 0.42, 0.62, 0.82]) {
    const pts = [];
    for (let i = 0; i <= 30; i++) {
      const b = 0.02 + 0.96 * (i / 30);
      pts.push(fanS(a, b).addScaledVector(fanUp(b), 0.006));
    }
    fanRibParts.push(geo.sweptSection(new THREE.CatmullRomCurve3(pts), geo.roundedSection(0.011, 0.007, 3, 10), {
      steps: 48, up: (t) => fanUp(0.02 + 0.96 * t), scale: (t) => [0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, 0.1 + t)), 1], creaseAngle: deg(40),
    }));
  }
  const fanRibGeo = geo.mergeGeometries(fanRibParts.map((g) => (g.index ? g.toNonIndexed() : g)), false);

  // red vent slot (concept art) between band2 and the fin, on the back side
  const V0 = deg(-22), V1 = deg(34);
  const ventTop = (th, r) => b2Top(th, r) - 0.03;
  const ventGeo = polarSweep({ th0: V0, th1: V1, rc: 0.483, hw: 0.012, top: ventTop, bottom: bottomFn, corner: 0.004, crown: 0, segs: 40, ends: 0 });
  const ribParts = [];
  for (let k = 0; k < 18; k++) {
    const u = V0 + ((k + 0.5) / 18) * (V1 - V0);
    ribParts.push(polarSweep({ th0: u - 0.012, th1: u + 0.012, rc: 0.483, hw: 0.015, top: (th, r) => ventTop(th, r) + 0.012, bottom: bottomFn, corner: 0.003, crown: 0, segs: 2 }));
  }
  ribParts.push(polarSweep({ th0: V0 - 0.04, th1: V1 + 0.04, rc: 0.501, hw: 0.007, top: (th, r) => b2Top(th, r) - 0.008, bottom: bottomFn, corner: 0.004, crown: 0, segs: 40 }));
  const ventRibGeo = geo.mergeGeometries(ribParts, false);
  ribParts.forEach((g) => g.dispose());

  // ---------------------------------------------------------- cavity (static)
  const RW = RIM_RC - RIM_HW + 0.003; // cavity wall radius (inside the rim)
  const Z = { s1: 0.0, s2: -0.03, s3: -0.06, floor: -0.13, plate: -0.07, vane: -0.085 };
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
  const plateGeo = polarLathe([
    { r: 0.152, z: Z.floor }, { r: 0.152, z: Z.plate - 0.01 }, { r: 0.148, z: Z.plate - 0.003 },
    { r: 0.141, z: Z.plate }, { r: 0.066, z: Z.plate + 0.002 }, { r: 0.062, z: Z.plate - 0.004 },
  ], 96);
  // radial spoke grooves on the inner plate
  const spokeParts = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const b = new THREE.BoxGeometry(0.07, 0.005, 0.004);
    b.translate(0.104, 0, Z.plate + 0.0012);
    b.rotateZ(a);
    spokeParts.push(b.toNonIndexed());
    b.dispose();
  }
  // short radial ticks on the outer step (film: fine notches)
  const spokesGeo = geo.mergeGeometries(spokeParts, false);
  spokeParts.forEach((g) => g.dispose());

  // turbine vane: thin, slightly swept blade built in its own frame so the
  // iris param can pitch it about its radial axis.
  const VANES = 40;
  const vR0 = 0.15, vR1 = 0.202, vSweep = 0.22, vH = 0.05;
  const vanePts = [];
  for (let i = 0; i <= 8; i++) {
    const s = i / 8;
    const r = vR0 + (vR1 - vR0) * s;
    const a = vSweep * s * s;
    vanePts.push(new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), 0));
  }
  const vaneGeo = geo.sweptSection(new THREE.CatmullRomCurve3(vanePts), [
    [-0.003, -vH / 2], [0.003, -vH / 2], [0.003, vH / 2 - 0.006], [0, vH / 2], [-0.003, vH / 2 - 0.006],
  ], { steps: 10, up: new THREE.Vector3(0, 0, 1) });

  // ------------------------------------------------------------- hub
  const collarGeo = polarLathe([
    { r: 0.068, z: Z.plate - 0.004 }, { r: 0.068, z: -0.002 }, { r: 0.063, z: 0.005 },
    { r: 0.05, z: 0.005 }, { r: 0.047, z: -0.002 },
  ], 64);
  const capGeo = polarLathe([
    { r: 0.047, z: -0.004 }, { r: 0.045, z: 0.01 }, { r: 0.038, z: 0.02 }, { r: 0.026, z: 0.025 },
    { r: 0.017, z: 0.026 }, { r: 0.017, z: 0.02 },
  ], 64);
  // dark hex socket in the middle of the cap
  const coreGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.012, 6, 1);
  coreGeo.rotateX(Math.PI / 2);
  coreGeo.translate(0, 0, 0.018);
  const glowGeo = polarLathe([{ r: 0.0075, z: 0.0245 }, { r: 0.0, z: 0.0245 }], 24);

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
    joint.add(frame);

    const add = (parent, g, mat, name) => {
      const m = ctx.mesh(Gm(g), mat, name);
      parent.add(m);
      return m;
    };
    add(frame, rimGeo, rimMat, `cheeks.rim.${key}`);
    add(frame, band1Geo, band1Mat, `cheeks.band1.${key}`);
    add(frame, band2Geo, band2Mat, `cheeks.band2.${key}`);
    add(frame, jowlGeo, jowlMat, `cheeks.jowl.${key}`);
    const headSp = ctx.space(`cheek${key}`, 'head');
    add(headSp, tail2Geo.upper, band2Mat, `cheeks.tail2.${key}`);
    add(headSp, tailJGeo.upper, jowlMat, `cheeks.tailJ.${key}`);
    add(headSp, fanGeo, stepMat, `cheeks.fan.${key}`);
    add(headSp, fanRibGeo, band2Mat, `cheeks.fanRibs.${key}`);
    // lower tail segments ride the jaw joint (they slide out when the mouth opens)
    const jawSp = ctx.space('jaw', 'head');
    add(jawSp, tail2Geo.lower, band2Mat, `cheeks.tail2Low.${key}`);
    add(jawSp, tailJGeo.lower, jowlMat, `cheeks.tailJLow.${key}`);
    add(frame, ventGeo, ventMat, `cheeks.vent.${key}`);
    add(frame, ventRibGeo, darkMat, `cheeks.ventRibs.${key}`);
    add(frame, wallGeo, cavityMat, `cheeks.wall.${key}`);

    const stack = new THREE.Group();
    stack.name = `cheeks.stack.${key}`;
    frame.add(stack);
    add(stack, stepsGeo, stepMat, `cheeks.steps.${key}`);
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
