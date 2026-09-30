/**
 * PART: fins — the two long curved horn blades on the sides of the head.
 * Each blade roots in a ball socket on the upper side of the skull (joint
 * finL / finR), bows outward and down around the cheek disc and ends in a
 * sharp point pointing forward-inward near jaw level. Near the root the blade
 * forks: a thinner inner prong runs parallel to the main blade and ends in its
 * own spike above the root.
 *
 * Authoring: LEFT blade in HEAD space -> converted to the joint's local space
 * (origin = joint). The right blade is the X-mirror.
 *
 * Meshes (per side K = L | R):
 *   fins.socket.K   static collar on the skull (does not move)
 *   fins.pivot.K    Group at the joint: flare / sweep rotate everything below
 *     fins.knuckle.K  ball in the socket
 *     fins.arm.K      bracket from the ball to the blade
 *     fins.blade.K    main blade (broad flat face, bevels, centre ridge)
 *     fins.edge.K     bright bevel strip along the outer edge of the face
 *     fins.prongPivot.K -> fins.prong.K   inner prong (split opens the fork)
 *
 * Params: flare (outward swing), sweep (fore/aft swing), split (fork opening).
 */
export const meta = {
  id: 'fins',
  explode: [0, 0.2, 0.2],
};

export function build(ctx) {
  const { THREE, geo, anatomy, rig, materials: M } = ctx;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const S = THREE.MathUtils.smoothstep;

  const bladeMat = M.get('chrome', { roughness: 0.2, color: 0x9a9ea4, panel: 2.2, seed: 51, lineWidth: 0.0026, angle: 0.0 });
  const prongMat = M.get('chrome', { roughness: 0.2, color: 0x80848a });
  const edgeMat = M.get('chrome', { roughness: 0.1, color: 0xb4b8be });
  const armMat = M.get('gunmetal', { roughness: 0.3, panel: 9, seed: 57, lineWidth: 0.004 });
  const knuckleMat = M.get('chrome', { roughness: 0.22, color: 0x74787e });
  const socketMat = M.get('gunmetal', { roughness: 0.32 });
  const darkMat = M.get('darkMetal');

  // ------------------------------------------------------------ LEFT blade, HEAD space
  const J = V(...anatomy.JOINTS.finL.pos);
  const toLocal = (p) => p.clone().sub(J);

  // main blade centre line: top spike -> root -> outer bow -> forward tip
  const mainPts = [
    V(0.62, 1.67, -0.07),
    V(0.735, 1.535, -0.03),
    V(0.895, 1.31, 0.005),
    V(1.055, 1.0, 0.035),
    V(1.14, 0.67, 0.085),
    V(1.11, 0.37, 0.165),
    V(0.965, 0.12, 0.265),
    V(0.74, -0.04, 0.37),
  ].map(toLocal);
  const mainCurve = new THREE.CatmullRomCurve3(mainPts, false, 'centripetal');

  // blade face normal ("up" of the section) — faces forward / outward
  const headAxisLocal = toLocal(V(0, 0, 0.08));
  const faceUp = (curve, bias = 0) => (t) => {
    const p = curve.getPointAt(t);
    const out = V(p.x - headAxisLocal.x, 0, p.z - headAxisLocal.z).normalize();
    const fwd = V(0.12, 0.28 - 0.3 * t, 0.95).normalize();
    return fwd.multiplyScalar(0.78).addScaledVector(out, 0.5 + bias).normalize();
  };

  const lerpKeys = (keys) => (t) => {
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const [t0, v0] = keys[i - 1];
        const [t1, v1] = keys[i];
        return v0 + (v1 - v0) * S(t, t0, t1);
      }
    }
    return keys[keys.length - 1][1];
  };
  // half width across the face and half thickness
  const mainW = lerpKeys([[0, 0.004], [0.05, 0.034], [0.15, 0.06], [0.38, 0.068], [0.62, 0.062], [0.82, 0.046], [0.94, 0.024], [1, 0.003]]);
  const mainH = lerpKeys([[0, 0.006], [0.1, 0.02], [0.7, 0.021], [0.93, 0.013], [1, 0.004]]);

  /**
   * Faceted blade section: flat back, chamfered edges, flat face with a low
   * centre ridge (crisp with a small crease angle). CCW, x = across, y = face.
   */
  const bladeSection = (Wf, Hf, ridge = 0.35) => (t) => {
    const W = Wf(t), H = Hf(t);
    const b = Math.min(0.013, W * 0.38);
    return [
      [W, -0.1 * H],
      [W - 0.25 * b, 0.55 * H],
      [W - b, H],
      [0.12 * W, H * (1 + ridge)],
      [-0.1 * W, H * (1 + ridge)],
      [-W + b, H],
      [-W + 0.25 * b, 0.55 * H],
      [-W, -0.1 * H],
      [-W + 0.6 * b, -H],
      [W - 0.6 * b, -H],
    ];
  };

  const bladeGeo = geo.sweptSection(mainCurve, bladeSection(mainW, mainH), {
    steps: 140, up: faceUp(mainCurve), creaseAngle: THREE.MathUtils.degToRad(22),
  });

  // inner prong: runs along the inner edge of the upper blade with a narrow
  // slot, rises into its own spike above the main tip, merges lower down.
  const inward = (t) => {
    const p = mainCurve.getPointAt(t);
    return V(headAxisLocal.x - p.x, 0, headAxisLocal.z - p.z).normalize();
  };
  const mainUp = faceUp(mainCurve);
  /** unit "across" vector of the main blade at t, pointing toward the skull */
  const acrossIn = (t) => {
    const T = mainCurve.getTangentAt(t);
    const B = V(0, 0, 0).crossVectors(T, mainUp(t)).normalize();
    return B.dot(inward(t)) < 0 ? B.negate() : B;
  };
  const prongW = lerpKeys([[0, 0.003], [0.07, 0.016], [0.25, 0.024], [0.8, 0.026], [1, 0.026]]);
  const prongH = lerpKeys([[0, 0.005], [0.12, 0.013], [1, 0.015]]);
  const prongPts = [];
  const PR = 12, P_T0 = 0.0, P_T1 = 0.5;
  for (let i = 0; i <= PR; i++) {
    const s = i / PR;
    const t = P_T0 + s * (P_T1 - P_T0);
    const p = mainCurve.getPointAt(Math.max(t, 0.012));
    const gap = THREE.MathUtils.lerp(0.032, -0.03, S(s, 0.55, 1.0)) + 0.05 * Math.pow(1 - s, 3);
    const d = mainW(Math.max(t, 0.05)) + prongW(s) + gap;
    const rise = Math.pow(1 - s, 2) * 0.07; // spike rises above the main tip
    prongPts.push(p.clone()
      .addScaledVector(acrossIn(Math.max(t, 0.012)), d)
      .addScaledVector(mainUp(t), -0.012 * S(s, 0.4, 1.0))
      .add(V(0, rise, -0.03 * (1 - s))));
  }
  const prongCurve = new THREE.CatmullRomCurve3(prongPts, false, 'centripetal');
  const prongGeo = geo.sweptSection(prongCurve, bladeSection(prongW, prongH, 0.25), {
    steps: 60, up: faceUp(prongCurve, 0.15), creaseAngle: THREE.MathUtils.degToRad(22),
  });
  const prongRoot = prongCurve.getPointAt(1);

  // bright edge strip along the outer edge of the face (reads as bevel highlight)
  const edgeUp = faceUp(mainCurve);
  const edgePts = [];
  for (let i = 0; i <= 40; i++) {
    const t = 0.06 + (i / 40) * 0.86;
    const p = mainCurve.getPointAt(t);
    const T = mainCurve.getTangentAt(t);
    const up = edgeUp(t);
    const B = V(0, 0, 0).crossVectors(T, up).normalize();
    const Nn = V(0, 0, 0).crossVectors(B, T).normalize();
    // outer edge = the side facing away from the head
    const sgn = B.dot(inward(t)) > 0 ? -1 : 1;
    edgePts.push(p.clone().addScaledVector(B, sgn * (mainW(t) - 0.006)).addScaledVector(Nn, mainH(t) * 0.8));
  }
  const edgeCurve = new THREE.CatmullRomCurve3(edgePts);
  const edgeGeo = geo.sweptSection(edgeCurve, geo.roundedSection(0.0045, 0.0045, 2, 8), {
    steps: 80, up: (t) => edgeUp(0.06 + t * 0.86), scale: (t) => 0.5 + 0.5 * Math.sin(Math.PI * t),
  });

  // root: skull point + normal under the joint
  const uJ = anatomy.headAngleForX(J.x, J.y);
  const skullP = anatomy.headSurface(uJ, J.y, V(0, 0, 0));
  const skullN = anatomy.headNormal(uJ, J.y, V(0, 0, 0));
  const skullLocal = toLocal(skullP);

  // bracket arm: from the ball to the blade (nearest blade point to the joint)
  let tRoot = 0.15, best = Infinity;
  for (let i = 0; i <= 60; i++) {
    const t = 0.05 + (i / 60) * 0.35;
    const d = mainCurve.getPointAt(t).length();
    if (d < best) { best = d; tRoot = t; }
  }
  const bladeRootP = mainCurve.getPointAt(tRoot);
  const armPts = [
    V(0, 0, 0),
    V(0, 0, 0).lerp(bladeRootP, 0.35).addScaledVector(skullN, 0.015).add(V(0, 0.012, 0)),
    V(0, 0, 0).lerp(bladeRootP, 0.7).add(V(0, 0.012, 0)),
    bladeRootP.clone().addScaledVector(inward(tRoot), -0.01),
  ];
  const armCurve = new THREE.CatmullRomCurve3(armPts);
  const armGeo = geo.sweptSection(armCurve, (t) => {
    const w = THREE.MathUtils.lerp(0.04, 0.066, S(t, 0.3, 1));
    const h = THREE.MathUtils.lerp(0.03, 0.022, t);
    const b = 0.01;
    return [[w, 0], [w - b * 0.4, h * 0.7], [w - b, h], [-w + b, h], [-w + b * 0.4, h * 0.7], [-w, 0], [-w + b * 0.4, -h * 0.7], [-w + b, -h], [w - b, -h], [w - b * 0.4, -h * 0.7]];
  }, { steps: 24, up: faceUp(mainCurve)(tRoot), creaseAngle: THREE.MathUtils.degToRad(30) });

  // ball knuckle + static collar on the skull
  const knuckleGeo = new THREE.SphereGeometry(0.05, 28, 18);
  const collarGeo = geo.ringStack([
    [0.044, -0.03], [0.044, 0.016], [0.05, 0.026], [0.064, 0.03], [0.078, 0.022], [0.088, 0.004], [0.092, -0.04],
  ], 48);
  const collarPos = skullLocal.clone().addScaledVector(skullN, -0.01);
  // bolts around the collar (static)
  const boltParts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const bg = new THREE.CylinderGeometry(0.007, 0.007, 0.01, 10);
    bg.rotateX(Math.PI / 2);
    bg.translate(Math.cos(a) * 0.071, Math.sin(a) * 0.071, 0.027);
    boltParts.push(bg);
  }
  const boltGeo = geo.mergeGeometries(boltParts, false);
  boltParts.forEach((g) => g.dispose());

  // --------------------------------------------------------------- assemble
  const mirror = (g) => geo.mirrorGeometryX(g);
  const fins = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const G = side > 0 ? (g) => g : mirror;
    const sx = (v) => V(v.x * side, v.y, v.z);
    const space = ctx.space(`fin${key}`, 'local');

    // static socket collar on the skull
    const collar = new THREE.Group();
    collar.name = `fins.socket.${key}`;
    collar.position.copy(sx(collarPos));
    geo.faceDirection(collar, sx(skullN));
    collar.add(ctx.mesh(collarGeo, socketMat, `fins.collar.${key}`));
    collar.add(ctx.mesh(boltGeo, darkMat, `fins.bolts.${key}`));
    space.add(collar);

    // moving assembly
    const pivot = new THREE.Group();
    pivot.name = `fins.pivot.${key}`;
    space.add(pivot);
    pivot.add(ctx.mesh(knuckleGeo, knuckleMat, `fins.knuckle.${key}`));
    pivot.add(ctx.mesh(G(armGeo), armMat, `fins.arm.${key}`));
    pivot.add(ctx.mesh(G(bladeGeo), bladeMat, `fins.blade.${key}`));
    pivot.add(ctx.mesh(G(edgeGeo), edgeMat, `fins.edge.${key}`));

    const prongPivot = new THREE.Group();
    prongPivot.name = `fins.prongPivot.${key}`;
    prongPivot.position.copy(sx(prongRoot));
    pivot.add(prongPivot);
    const prong = ctx.mesh(G(prongGeo), prongMat, `fins.prong.${key}`);
    prong.position.copy(sx(prongRoot)).negate();
    prongPivot.add(prong);
    // split axis: perpendicular to the blade face at the prong root
    const splitAxis = sx(faceUp(prongCurve, 0.15)(1)).normalize();

    fins[key] = { side, pivot, prongPivot, splitAxis };
  }

  const params = { flare: 0, sweep: 0, split: 0 };
  return {
    params,
    paramSpec: {
      flare: { min: -0.5, max: 0.5, step: 0.01 },
      sweep: { min: -0.5, max: 0.5, step: 0.01 },
      split: { min: -0.3, max: 1, step: 0.01 },
    },
    apply(p) {
      for (const f of Object.values(fins)) {
        // flare swings the blade outward about the head's front-back axis,
        // sweep swings it fore/aft about the X axis (both from the root)
        f.pivot.rotation.set(p.sweep, 0, f.side * p.flare);
        // split opens the fork: prong tip swings in toward the skull
        f.prongPivot.quaternion.setFromAxisAngle(f.splitAxis, -f.side * p.split * 0.28);
      }
    },
  };
}
