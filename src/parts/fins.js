/**
 * PART: fins — the two stand-off horn blades that frame the face like ( ).
 *
 * Each blade follows LANDMARKS.finCurveL (mirrored for the right): rooted in a
 * bracket on the upper cranium side (joint finL / finR), a short free spike
 * rises above the bracket, the blade bows out around the cheek turbine
 * (outer edge x ~1.08 at y ~0.72) and ends in a forward tusk that curls in
 * toward the mouth corner. A thinner inner blade runs parallel inside the
 * upper half (concept art "double blade") and merges into the main blade.
 *
 * Authoring: LEFT side in HEAD space, converted to the joint's local space
 * (origin = joint) so the pivot sits at the root. Right side = X mirror.
 *
 * Meshes (K = L | R):
 *   fins.socket.K           static socket on the skull (collar + bolts)
 *   fins.pivot.K            Group at the joint; flare / sweep rotate it
 *     fins.knuckle.K        ball in the socket
 *     fins.bracket.K        arm from the ball to the blade
 *     fins.blade.K          main lens-section blade with bevels
 *     fins.ridge.K          raised centre spine on the blade face
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
  const innerMat = M.get('gunmetal', { roughness: 0.24, color: 0x858c94, panel: 4, seed: 63, lineWidth: 0.003 });
  const ridgeMat = M.get('chrome', { roughness: 0.14, color: 0xb0b6bc });
  const edgeMat = M.get('chrome', { roughness: 0.08, color: 0xc4c9ce });
  const bracketMat = M.get('chrome', { roughness: 0.22, color: 0x80878f });
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
  const mainPts = [
    // round 5: the whole C leans FORWARD (concept 3/4 + film front: a thick
    // blade hugging the outside of the turbine, hook reaching toward the
    // mouth); x (front ( ) outline) unchanged. Top = free spike.
    V(0.79, 1.52, -0.02),
    V(0.94, 1.32, 0.1),
    V(1.04, 1.07, 0.24),
    V(1.09, 0.8, 0.36),
    V(1.06, 0.55, 0.46),
    V(0.99, 0.34, 0.52),
    V(0.9, 0.19, 0.58),
    V(0.79, 0.1, 0.63),
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
  const mainW = keys([[0, 0.006], [0.06, 0.055], [0.16, 0.095], [0.38, 0.118], [0.62, 0.11], [0.82, 0.08], [0.94, 0.04], [1, 0.004]]);
  const mainH = keys([[0, 0.008], [0.08, 0.028], [0.3, 0.036], [0.7, 0.034], [0.9, 0.024], [1, 0.005]]);

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

  // ------------------------------------------------- root socket / knuckle
  const uJ = anatomy.headAngleForX(J.x, J.y);
  const skullP = anatomy.headSurface(uJ, J.y, V(0, 0, 0));
  const skullN = anatomy.headNormal(uJ, J.y, V(0, 0, 0));
  const skullLocal = toLocal(skullP);
  const knuckleC = skullLocal.clone().addScaledVector(skullN, 0.035);

  // ------------------------------------------------------- inner blade
  // connector from the root knuckle on the cranium side, standing off the
  // skull, down and out to merge into the inner edge of the main blade.
  const T_MERGE = 0.24;
  const mf = frameAt(mainCurve, mainUp, T_MERGE);
  const mergeP = mf.P.clone().addScaledVector(mf.B, inwardSign(T_MERGE) * mainW(T_MERGE) * 0.6);
  const innerCurve = new THREE.CatmullRomCurve3([
    knuckleC.clone(),
    toLocal(V(0.75, 1.5, -0.05)),
    toLocal(V(0.88, 1.35, 0.05)),
    mergeP,
  ], false, 'centripetal');
  const innerW = keys([[0, 0.022], [0.15, 0.03], [0.6, 0.032], [0.9, 0.03], [1, 0.022]]);
  const innerH = keys([[0, 0.016], [0.5, 0.017], [1, 0.014]]);
  const innerGeo = geo.sweptSection(innerCurve, lens(innerW, innerH), {
    steps: 60, up: faceUp(innerCurve, 0.35), creaseAngle: deg(24),
  });
  const innerRoot = knuckleC.clone();

  // ------------------------------------------------- clamp bracket (merge)
  const clampCurve = new THREE.CatmullRomCurve3([0.21, 0.23, 0.25, 0.27].map((t) => mainCurve.getPointAt(t)));
  const armGeo = geo.sweptSection(clampCurve, (t) => {
    const W = mainW(0.24) + 0.008, H = mainH(0.24) + 0.007;
    const b = 0.01;
    return [[W, 0], [W - b * 0.4, H * 0.7], [W - b, H], [-W + b, H], [-W + b * 0.4, H * 0.7], [-W, 0], [-W + b * 0.4, -H * 0.7], [-W + b, -H], [W - b, -H], [W - b * 0.4, -H * 0.7]];
  }, { steps: 12, up: (t) => mainUp(0.21 + t * 0.06), creaseAngle: deg(30) });

  const knuckleGeo = new THREE.SphereGeometry(0.045, 24, 16);
  knuckleGeo.translate(knuckleC.x, knuckleC.y, knuckleC.z);
  const collarGeo = geo.ringStack([
    [0.04, -0.04], [0.04, 0.012], [0.046, 0.024], [0.062, 0.03], [0.078, 0.022], [0.088, 0.004], [0.092, -0.05],
  ], 48);
  const boltParts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const bg = new THREE.CylinderGeometry(0.0065, 0.0065, 0.01, 10);
    bg.rotateX(Math.PI / 2);
    bg.translate(Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0.027);
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

    const pivot = new THREE.Group();
    pivot.name = `fins.pivot.${key}`;
    space.add(pivot);
    pivot.add(ctx.mesh(Gm(knuckleGeo), knuckleMat, `fins.knuckle.${key}`));
    pivot.add(ctx.mesh(Gm(armGeo), bracketMat, `fins.bracket.${key}`));
    pivot.add(ctx.mesh(Gm(bladeGeo), bladeMat, `fins.blade.${key}`));
    pivot.add(ctx.mesh(Gm(ridgeGeo), ridgeMat, `fins.ridge.${key}`));
    pivot.add(ctx.mesh(Gm(edgeGeo), edgeMat, `fins.edge.${key}`));
    pivot.add(ctx.mesh(Gm(grooveGeo), darkMat, `fins.groove.${key}`));

    const innerPivot = new THREE.Group();
    innerPivot.name = `fins.innerPivot.${key}`;
    innerPivot.position.copy(sx(innerRoot));
    pivot.add(innerPivot);
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
