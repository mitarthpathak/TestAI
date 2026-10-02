/**
 * PART: fins — the two stand-off horn blades that frame the face like ( ).
 *
 * Each blade (round 8): a short free tapering tip just above the brow, a
 * contact zone where the blade's inner edge sinks flush into the skull side
 * (no strut / bracket bar anywhere), then the broad bevelled C bows out
 * (outer edge x ~1.035 at y ~0.76) round the back of the cheek turbine and
 * ends in a hook that curls in toward the mouth corner (y ~0.18). A thinner
 * inner blade runs parallel behind the upper half ("double blade").
 *
 * Authoring: LEFT side in HEAD space, converted to the joint's local space
 * (origin = joint finL). Right side = X mirror. The flare / sweep pivot sits
 * at the skull contact point.
 *
 * Meshes (K = L | R):
 *   fins.socket.K           low seat ring on the skull under the contact (collar + bolts)
 *   fins.pivot.K            Group at the contact; flare / sweep rotate it
 *     fins.knuckle.K        flush seat ring (moves with the blade)
 *     fins.blade.K          main lens-section blade with bevels
 *     fins.ridge.K          raised spine on the blade face
 *     fins.groove.K         dark panel groove down the face
 *     fins.edge.K           polished outer bevel strip
 *     fins.innerPivot.K -> fins.inner.K   thinner inner blade (split opens it)
 *
 * Params: flare (outward swing, rad), sweep (fore/aft swing, rad),
 * split (inner blade opens), idle (amplitude of a slow breathing flare).
 */
export const meta = {
  id: 'fins',
  explode: [0, 0.2, 0.2],
};

export function build(ctx) {
  const { THREE, geo, anatomy, materials: M } = ctx;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const S = THREE.MathUtils.smoothstep;
  const deg = THREE.MathUtils.degToRad;

  const bladeMat = M.get('chrome', { roughness: 0.17, color: 0xadb3ba, panel: 3.2, seed: 61, lineWidth: 0.0028 });
  const innerMat = M.get('gunmetal', { roughness: 0.3, color: 0x60676f, panel: 4, seed: 63, lineWidth: 0.003 });
  const ridgeMat = M.get('chrome', { roughness: 0.14, color: 0xb0b6bc });
  const edgeMat = M.get('chrome', { roughness: 0.08, color: 0xc4c9ce });
  const knuckleMat = M.get('chrome', { roughness: 0.2, color: 0x7d838a });
  const socketMat = M.get('gunmetal', { roughness: 0.32 });
  const darkMat = M.get('darkMetal');

  const J = V(...anatomy.JOINTS.finL.pos);
  const toLocal = (p) => p.clone().sub(J);
  const FC = anatomy.LANDMARKS.finCurveL.map((p) => V(...p));

  // ------------------------------------------------------------ centre line
  // free spike above the bracket -> landmark curve -> tusk tip curling inward
  // film / ILM concept: the free top spike sits only ~0.3 above the eyes,
  // just outside the cheek bands; the root reaches the cranium via the
  // inner connector blade (see below).
  // round 8: the blade's TOP END is its root — it dives flush into the skull
  // side high on the temple (front still: the ( ) frame touches the head at
  // ~brow height; no strut at eye level). ROOT_* = where it enters the shell.
  // contact zone: the upper blade's inner edge sinks into the skull side
  // (front still: the top of the ( touches the head silhouette); above it a
  // free tapering tip. ROOT_* = skull point under the contact (pivot).
  // contact zone: the upper blade's inner edge sinks into the skull side
  // (front still: the top of the ( touches the head silhouette); above it a
  // free tapering tip. ROOT_* = skull point under the contact (pivot).
  // round 8: mid / lower blade moved forward (3/4 + film front: the C hugs
  // the outside of the turbine rim; front ( ) outline unchanged).
  // contact zone: the upper blade's inner edge sinks into the skull side
  // just above the brow band (front still: the top of the ( touches the head
  // silhouette; film + sculpt: the blade starts at ~brow height), above it a
  // short free tapering tip. ROOT_* = skull point under the contact (pivot).
  // Lower half runs round the BACK of the turbine rim (sculpt), the hook
  // comes forward under it and curls in at mouth level.
  // contact zone: the upper blade's inner edge sinks into the skull side
  // just above the brow band (front still: the top of the ( touches the head
  // silhouette; film + sculpt: the blade starts at ~brow height), above it a
  // short free tapering tip. ROOT_* = skull point under the contact (pivot).
  // Lower half runs round the BACK of the turbine rim (sculpt), the hook
  // comes forward under it and curls in at mouth level.
  const ROOT_U = 1.66, ROOT_Y = 1.24;
  const skullP = anatomy.headSurface(ROOT_U, ROOT_Y, V(0, 0, 0));
  const skullN = anatomy.headNormal(ROOT_U, ROOT_Y, V(0, 0, 0));
  const mainPts = [
    V(0.755, 1.34, -0.13),
    V(0.785, 1.25, -0.085),
    V(0.86, 1.15, -0.02),
    V(0.945, 1.04, 0.04),
    V(1.01, 0.9, 0.095),
    V(1.035, 0.76, 0.135),
    V(1.025, 0.6, 0.175),
    V(0.98, 0.45, 0.22),
    V(0.905, 0.33, 0.295),
    V(0.82, 0.25, 0.39),
    V(0.735, 0.2, 0.475),
    V(0.665, 0.18, 0.545),
].map(toLocal);
  const mainCurve = new THREE.CatmullRomCurve3(mainPts, false, 'centripetal');

  // the head axis (for "outward") at the blade's height
  const axisAt = (p) => {
    const y = p.y + J.y;
    const s = anatomy.headSection(y);
    return V(-J.x, p.y, s.zc - J.z);
  };
  /** blade face normal: outward from the head, turned forward */
  const faceUp = (curve, fwdK = 0.9) => (t) => {
    const p = curve.getPointAt(t);
    const a = axisAt(p);
    const out = V(p.x - a.x, 0, p.z - a.z).normalize();
    const fwd = V(0, 0, 1);
    return out.multiplyScalar(1).addScaledVector(fwd, fwdK).normalize();
  };

  const keys = (k) => (t) => {
    for (let i = 1; i < k.length; i++) {
      if (t <= k[i][0]) {
        const [t0, v0] = k[i - 1];
        const [t1, v1] = k[i];
        return v0 + (v1 - v0) * S(t, t0, t1);
      }
    }
    return k[k.length - 1][1];
  };
  // half width across the face / half thickness
  // concept art: thick, broad BLADES (not wires) with a heavy bevel
  const mainW = keys([[0, 0.008], [0.06, 0.045], [0.15, 0.07], [0.25, 0.09], [0.46, 0.116], [0.66, 0.11], [0.84, 0.08], [0.95, 0.04], [1, 0.004]]);
  const mainH = keys([[0, 0.006], [0.05, 0.02], [0.18, 0.028], [0.32, 0.036], [0.72, 0.034], [0.91, 0.024], [1, 0.005]]);

  /** Lens / blade section with chamfered bevels (CCW, x across, y face). */
  const lens = (Wf, Hf) => (t) => {
    const W = Wf(t), H = Hf(t);
    const b = Math.min(0.026, W * 0.35);
    return [
      [W, 0], [W - 0.35 * b, 0.45 * H], [W - b, 0.85 * H], [W - 2.2 * b, H],
      [-W + 2.2 * b, H], [-W + b, 0.85 * H], [-W + 0.35 * b, 0.45 * H], [-W, 0],
      [-W + 0.35 * b, -0.45 * H], [-W + b, -0.85 * H], [-W + 2.2 * b, -H],
      [W - 2.2 * b, -H], [W - b, -0.85 * H], [W - 0.35 * b, -0.45 * H],
    ];
  };
  const mainUp = faceUp(mainCurve);
  const bladeGeo = geo.sweptSection(mainCurve, lens(mainW, mainH), {
    steps: 150, up: mainUp, creaseAngle: deg(24),
  });

  /** frame of the main blade at t: { P, T, B (across), Nf (face) } */
  const frameAt = (curve, upFn, t) => {
    const P = curve.getPointAt(t);
    const T = curve.getTangentAt(t).normalize();
    const B = V(0, 0, 0).crossVectors(T, upFn(t)).normalize();
    const Nf = V(0, 0, 0).crossVectors(B, T).normalize();
    return { P, T, B, Nf };
  };
  const inwardSign = (t) => {
    const f = frameAt(mainCurve, mainUp, t);
    const a = axisAt(f.P);
    const toAxis = V(a.x - f.P.x, 0, a.z - f.P.z);
    return f.B.dot(toAxis) > 0 ? 1 : -1;
  };

  /** strip that rides on the blade at across-offset u (fraction of W) */
  const rideStrip = (t0, t1, uFrac, lift, section, steps, scaleFn) => {
    const pts = [];
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      const f = frameAt(mainCurve, mainUp, t);
      const sgn = inwardSign(t);
      pts.push(f.P.clone().addScaledVector(f.B, -sgn * uFrac * mainW(t)).addScaledVector(f.Nf, mainH(t) * lift));
    }
    const c = new THREE.CatmullRomCurve3(pts);
    return geo.sweptSection(c, section, {
      steps, up: (s) => mainUp(t0 + (t1 - t0) * s), scale: scaleFn, creaseAngle: deg(30),
    });
  };
  // raised spine along the face (slightly toward the inner edge)
  const ridgeGeo = rideStrip(0.1, 0.9, -0.3, 0.97, geo.roundedSection(0.011, 0.006, 3, 12), 90, (s) => [0.4 + 0.6 * Math.sin(Math.PI * s), 1]);
  // dark panel line running down the blade face
  const grooveGeo = rideStrip(0.08, 0.92, 0.22, 0.99, geo.roundedSection(0.0045, 0.0035, 2, 8), 90, (s) => [0.5 + 0.5 * Math.sin(Math.PI * s), 1]);
  // polished outer bevel strip
  const edgeGeo = rideStrip(0.06, 0.93, 0.8, 0.55, geo.roundedSection(0.005, 0.004, 2, 8), 90, (s) => 0.5 + 0.5 * Math.sin(Math.PI * s));

  // ------------------------------------------------- root (flush skull mount)
  // round 8: no strut. The blade's top end dives into the skull; the pivot
  // (flare / sweep hinge) sits where it enters the shell.
  const skullLocal = toLocal(skullP);
  const knuckleC = skullLocal.clone();

  // ------------------------------------------------------- inner blade
  // concept art "double blade": a thinner blade running parallel just inside
  // and BEHIND the main blade's upper half (hidden behind it from the front),
  // rooted next to the main root and merging into the blade at T_MERGE.
  const T_IN0 = 0.1, T_MERGE = 0.45;
  const innerPts = [];
  for (let i = 0; i <= 12; i++) {
    const t = T_IN0 + ((T_MERGE - T_IN0) * i) / 12;
    const f = frameAt(mainCurve, mainUp, t);
    const k = i / 12;
    const off = (1 - S(k, 0.55, 1)) * (mainW(t) * 0.55 + 0.02);
    const back = 0.03 + 0.03 * Math.sin(Math.PI * Math.min(1, k * 1.2));
    innerPts.push(f.P.clone().addScaledVector(f.B, inwardSign(t) * off).addScaledVector(f.Nf, -back * (1 - S(k, 0.7, 1) * 0.6)));
  }
  const innerCurve = new THREE.CatmullRomCurve3(innerPts, false, 'centripetal');
  const innerW = keys([[0, 0.05], [0.25, 0.05], [0.7, 0.04], [1, 0.02]]);
  const innerH = keys([[0, 0.02], [0.6, 0.018], [1, 0.01]]);
  const innerGeo = geo.sweptSection(innerCurve, lens(innerW, innerH), {
    steps: 50, up: (t) => mainUp(T_IN0 + (T_MERGE - T_IN0) * t), creaseAngle: deg(24),
  });
  const innerRoot = innerPts[0].clone();


  // low seat ring where the blade enters the skull (flush, not a ball)
  const knuckleGeo = geo.ringStack([
    [0.03, -0.01], [0.06, 0.008], [0.07, 0.004], [0.074, -0.03],
  ], 40);
  const collarGeo = geo.ringStack([
    [0.075, -0.03], [0.075, 0.0], [0.082, 0.006], [0.1, 0.007], [0.112, 0.002], [0.116, -0.03],
  ], 48);
  const boltParts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const bg = new THREE.CylinderGeometry(0.0065, 0.0065, 0.01, 10);
    bg.rotateX(Math.PI / 2);
    bg.translate(Math.cos(a) * 0.095, Math.sin(a) * 0.095, 0.006);
    boltParts.push(bg.toNonIndexed());
    bg.dispose();
  }
  const boltGeo = geo.mergeGeometries(boltParts, false);
  boltParts.forEach((g) => g.dispose());

  // --------------------------------------------------------------- assemble
  const mirror = (g) => geo.mirrorGeometryX(g);
  const fins = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const Gm = side > 0 ? (g) => g : mirror;
    const sx = (v) => V(v.x * side, v.y, v.z);
    const space = ctx.space(`fin${key}`, 'local');

    const socket = new THREE.Group();
    socket.name = `fins.socket.${key}`;
    socket.position.copy(sx(skullLocal));
    geo.faceDirection(socket, sx(skullN));
    socket.add(ctx.mesh(collarGeo, socketMat, `fins.collar.${key}`));
    socket.add(ctx.mesh(boltGeo, darkMat, `fins.bolts.${key}`));
    space.add(socket);

    // pivot sits at the new root knuckle; the blade body is offset back so it
    // is authored in joint-local space (flare / sweep hinge on the bracket)
    const pivot = new THREE.Group();
    pivot.name = `fins.pivot.${key}`;
    pivot.position.copy(sx(knuckleC));
    space.add(pivot);
    const body = new THREE.Group();
    body.name = `fins.body.${key}`;
    body.position.copy(sx(knuckleC)).negate();
    pivot.add(body);
    const seat = ctx.mesh(Gm(knuckleGeo), knuckleMat, `fins.knuckle.${key}`);
    seat.position.copy(sx(knuckleC));
    geo.faceDirection(seat, sx(skullN));
    body.add(seat);
    body.add(ctx.mesh(Gm(bladeGeo), bladeMat, `fins.blade.${key}`));
    body.add(ctx.mesh(Gm(ridgeGeo), ridgeMat, `fins.ridge.${key}`));
    body.add(ctx.mesh(Gm(edgeGeo), edgeMat, `fins.edge.${key}`));
    body.add(ctx.mesh(Gm(grooveGeo), darkMat, `fins.groove.${key}`));

    const innerPivot = new THREE.Group();
    innerPivot.name = `fins.innerPivot.${key}`;
    innerPivot.position.copy(sx(innerRoot));
    body.add(innerPivot);
    const inner = ctx.mesh(Gm(innerGeo), innerMat, `fins.inner.${key}`);
    inner.position.copy(sx(innerRoot)).negate();
    innerPivot.add(inner);
    // split axis: horizontal, perpendicular to the head's front-back axis
    fins[key] = { side, pivot, innerPivot };
  }

  const params = { flare: 0, sweep: 0, split: 0, idle: 0 };
  const pose = (p, extra = 0) => {
    for (const f of Object.values(fins)) {
      f.pivot.rotation.set(p.sweep, 0, f.side * (p.flare + extra));
      f.innerPivot.rotation.set(0, 0, -f.side * p.split * 0.08);
    }
  };
  return {
    params,
    paramSpec: {
      flare: { min: -0.4, max: 0.6, step: 0.01 },
      sweep: { min: -0.5, max: 0.5, step: 0.01 },
      split: { min: -0.3, max: 1, step: 0.01 },
      idle: { min: 0, max: 0.1, step: 0.005 },
    },
    apply(p) { pose(p); },
    update(t, dt, p) {
      if (!p.idle) return;
      pose(p, p.idle * Math.sin(t * 0.7));
    },
  };
}
