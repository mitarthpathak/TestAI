/**
 * PART: cheeks — the big recessed "turbine / speaker" discs on both sides of
 * the lower face plus the thick C-shaped armour band that wraps each disc.
 * Joints: cheekL / cheekR (disc centre). Every piece is authored in the DISC
 * FRAME: origin = joint, +Z = LANDMARKS.cheekDiscNormal (outward), +X = the
 * "back / ear" side of the disc for the LEFT cheek (mirrored for the right),
 * +Y ~ up.
 *
 * Stack, from the skull surface inward (each step deeper):
 *   band      thick C armour band (under the eye -> outside -> bottom -> jaw)
 *   channel   dark groove between band and disc
 *   rim       bevelled chrome rim, conformed to the skull all the way round
 *   socket    dark deep cup (fills the anatomy.CUTOUTS cheek opening)
 *   stator    static ledge ring with fine notches
 *   rotor     spinning: segmented outer ring, turbine floor, pitched vanes
 *             (iris), stepped inner ring
 *   hub       central lens (pulse pushes it outward)
 *
 * Params: spin (abs angle), spinSpeed (idle rad/s), iris (vane pitch 0 closed
 * .. 1 open), pulse (hub push-out 0..1), recess (whole inner stack in/out).
 */
export const meta = {
  id: 'cheeks',
  explode: [0, -0.1, 0.9],
};

export function build(ctx) {
  const { THREE, geo, anatomy, materials: M } = ctx;
  const LM = anatomy.LANDMARKS;
  const K = LM.cheekDiscRadius / 0.27; // every radius below is authored for R = 0.27

  // ------------------------------------------------------------------ frame
  const C = new THREE.Vector3().fromArray(LM.cheekDiscL);
  const N = new THREE.Vector3().fromArray(LM.cheekDiscNormalL).normalize();
  const EX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), N).normalize();
  const EY = new THREE.Vector3().crossVectors(N, EX).normalize();

  // ------------------------------------------------ skull height in disc frame
  const [yMin, yMax] = anatomy.HEAD_Y_RANGE;
  /** Implicit head-shell function: < 0 inside, > 0 outside (superellipse sections). */
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
  /**
   * Axial height (along the disc normal) of the head shell at polar
   * (theta, r) in the disc frame. Illinois regula falsi (~6-8 evaluations).
   */
  function shellH(theta, r) {
    _b.copy(C).addScaledVector(EX, r * Math.cos(theta)).addScaledVector(EY, r * Math.sin(theta));
    let a = -0.7, b = 0.5;
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

  // ------------------------------------------------------------- helpers
  /**
   * Lathe around the disc axis whose profile points may conform to the skull.
   * profile: [{ r, z }] (planar) or [{ r, h, min }] (z = max(shell + h, min)).
   */
  function polarLathe(profile, segs = 128, theta0 = 0, theta1 = Math.PI * 2) {
    const P = profile.length;
    const pos = [], uv = [], idx = [];
    const full = Math.abs(theta1 - theta0 - Math.PI * 2) < 1e-6;
    const cols = full ? segs : segs + 1;
    const vAcc = new Array(P).fill(0);
    for (let j = 1; j < P; j++) {
      const a = profile[j - 1], b = profile[j];
      vAcc[j] = vAcc[j - 1] + Math.hypot(b.r - a.r, (b.z ?? b.h) - (a.z ?? a.h)) + 1e-4;
    }
    for (let i = 0; i < cols; i++) {
      const th = theta0 + ((theta1 - theta0) * i) / segs;
      const c = Math.cos(th), s = Math.sin(th);
      for (let j = 0; j < P; j++) {
        const p = profile[j];
        const r = p.r * K;
        const z = p.z !== undefined ? p.z : Math.max(shellH(th, r) + p.h, p.min ?? -Infinity);
        pos.push(r * c, r * s, z);
        uv.push(th * Math.max(r, 0.02), vAcc[j]);
      }
    }
    const nextCol = (i) => (full ? (i + 1) % cols : i + 1);
    const lastCol = full ? cols : cols - 1;
    for (let i = 0; i < lastCol; i++) {
      const i2 = nextCol(i);
      for (let j = 0; j < P - 1; j++) {
        const a = i * P + j, b = i * P + j + 1, c = i2 * P + j, d = i2 * P + j + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const out = geo.toCreasedNormals(g, THREE.MathUtils.degToRad(38));
    g.dispose();
    out.computeBoundingSphere();
    return out;
  }

  /**
   * Conforming polar strip on the skull (thick, bevelled) via shellPatch.
   * u = polar angle, v = 0 at the OUTER edge .. 1 at the inner edge (this
   * orientation makes shellPatch's winding face outward).
   */
  function polarBand({ th0, th1, rIn, rOut, offset, thickness, bevel, lift, zTop = null, segU = 72, segV = 10 }) {
    const surface = (u, v, target) => {
      const r = rOut(u) - v * (rOut(u) - rIn(u));
      return target.set(r * Math.cos(u), r * Math.sin(u), zTop ? zTop(u, r) : shellH(u, r));
    };
    const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(), D = new THREE.Vector3();
    const normal = (u, v, target) => {
      const h = 1e-3;
      surface(u + h, v, A); surface(u - h, v, B);
      surface(u, v + h, Cc); surface(u, v - h, D);
      A.sub(B); Cc.sub(D);
      target.crossVectors(A, Cc).normalize();
      if (target.z < 0) target.negate();
      return target;
    };
    return geo.shellPatch({ u0: th0, u1: th1, y0: 0, y1: 1, surface, normal, offset, thickness, bevel, lift, segU, segV });
  }

  /** Annular sector plates (extruded, bevelled) merged into one geometry. */
  function segmentRing({ count, rIn, rOut, gap, depth, bevel, zTop, phase = 0 }) {
    const parts = [];
    for (let k = 0; k < count; k++) {
      const a0 = phase + (k / count) * Math.PI * 2 + gap / 2;
      const a1 = phase + ((k + 1) / count) * Math.PI * 2 - gap / 2;
      const s = new THREE.Shape();
      s.moveTo(rIn * Math.cos(a0), rIn * Math.sin(a0));
      s.lineTo(rOut * Math.cos(a0), rOut * Math.sin(a0));
      s.absarc(0, 0, rOut, a0, a1, false);
      s.lineTo(rIn * Math.cos(a1), rIn * Math.sin(a1));
      s.absarc(0, 0, rIn, a1, a0, true);
      const g = new THREE.ExtrudeGeometry(s, {
        depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel,
        bevelSegments: 2, curveSegments: 5,
      });
      g.translate(0, 0, zTop - depth - bevel);
      g.clearGroups();
      parts.push(g); // ExtrudeGeometry is already non-indexed
    }
    const merged = geo.mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    const out = geo.toCreasedNormals(merged, THREE.MathUtils.degToRad(35));
    merged.dispose();
    out.computeBoundingSphere();
    return out;
  }

  /** Small radial blocks around a ring (notches / teeth), merged. */
  function teethRing({ count, r0, r1, width, height, zBase }) {
    const parts = [];
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      const b = new THREE.BoxGeometry(r1 - r0, width, height);
      b.translate((r0 + r1) / 2, 0, zBase + height / 2);
      b.rotateZ(a);
      parts.push(b.toNonIndexed());
      b.dispose();
    }
    const merged = geo.mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    merged.computeBoundingSphere();
    return merged;
  }

  // ------------------------------------------------------------- materials
  const rimMat = M.get('chrome', { roughness: 0.16 });
  const bandMat = M.get('chrome', { roughness: 0.22, panel: 5.5, seed: 43, lineWidth: 0.0035 });
  const statorMat = M.get('gunmetal', { roughness: 0.3 });
  const segMat = M.get('gunmetal', { roughness: 0.28 });
  const vaneMat = M.get('chrome', { roughness: 0.3, color: 0x6c7076 });
  const innerMat = M.get('chrome', { roughness: 0.2 });
  const darkMat = M.get('darkMetal');
  const cavityMat = M.get('cavity');
  const lensMat = M.get('cavity', { roughness: 0.12, metalness: 0.4, color: 0x0b0b0e });
  const ventMat = M.get('redAccent', { intensity: 0.42 });
  // dim red glow deep in the hub (kept below the bloom threshold; pulse brightens it)
  const CORE_RGB = new THREE.Color(1.0, 0.06, 0.03);
  const coreMat = new THREE.MeshBasicMaterial({ color: CORE_RGB.clone().multiplyScalar(2.2), toneMapped: false });
  const haloMat = new THREE.MeshBasicMaterial({ color: CORE_RGB.clone().multiplyScalar(1.0), toneMapped: false });

  // ------------------------------------------------ static housing (L frame)
  // depths (disc frame, joint = 0). The skull sits ~+0.03 over the centre and
  // falls to ~-0.11 at the lower-outer rim, so the inner stack starts deep.
  const Z = {
    ledge: -0.105, seg: -0.125, segFloor: -0.15, floor: -0.215, vanePivot: -0.19,
    inner: -0.178, bezel: -0.186, lens: -0.196, back: -0.29,
  };

  const socketGeo = polarLathe([
    { r: 0.0, z: Z.back }, { r: 0.238, z: Z.back }, { r: 0.238, z: Z.ledge - 0.012 },
  ], 96);
  const wallGeo = polarLathe([
    { r: 0.262, z: Z.ledge - 0.004 }, { r: 0.262, h: 0.012, min: Z.ledge + 0.012 },
  ], 128);
  const statorGeo = polarLathe([
    { r: 0.238, z: Z.ledge - 0.012 }, { r: 0.2415, z: Z.ledge }, { r: 0.2585, z: Z.ledge }, { r: 0.262, z: Z.ledge - 0.004 },
  ], 96);
  const statorTeeth = teethRing({ count: 60, r0: 0.243 * K, r1: 0.257 * K, width: 0.0045, height: 0.006, zBase: Z.ledge - 0.001 });
  // chamfered rim: steep inner chamfer, flat crown, outer chamfer, skirt
  const rimGeo = polarLathe([
    { r: 0.262, h: 0.004, min: Z.ledge + 0.01 },
    { r: 0.2665, h: 0.026, min: Z.ledge + 0.03 },
    { r: 0.274, h: 0.034, min: Z.ledge + 0.038 },
    { r: 0.298, h: 0.036, min: Z.ledge + 0.04 },
    { r: 0.307, h: 0.026, min: Z.ledge + 0.03 },
    { r: 0.313, h: 0.004, min: Z.ledge + 0.008 },
    { r: 0.316, h: -0.05 },
  ], 144);

  // C band: under the eye (top, nose side) -> outside -> bottom -> toward the jaw
  const TH0 = THREE.MathUtils.degToRad(-142);
  const TH1 = THREE.MathUtils.degToRad(132);
  const along = (u) => (u - TH0) / (TH1 - TH0);
  const bandWidth = (u) => {
    const a = THREE.MathUtils.clamp(along(u), 0, 1);
    const ends = Math.pow(Math.sin(Math.PI * a), 0.45);
    const jaw = 1 - 0.3 * Math.pow(Math.max(0, 0.4 - a) / 0.4, 1.3); // narrower toward the jaw
    const eye = 1 - 0.45 * Math.pow(Math.max(0, a - 0.72) / 0.28, 1.2); // keep clear of the eye
    return (0.04 + 0.13 * ends * jaw) * eye;
  };
  const B_IN = 0.322;
  // band top: a shallow cone parallel to the disc face in the middle of the
  // C (stands proud of the skull where the head falls away), diving onto the
  // skull at both ends so it flows into the face plates.
  const bandTop = (u, r) => {
    const a = THREE.MathUtils.clamp(along(u), 0, 1);
    const endK = THREE.MathUtils.smoothstep(a, 0.0, 0.2) * THREE.MathUtils.smoothstep(1 - a, 0.0, 0.16);
    const plane = 0.0 - 0.32 * (r / K - B_IN) - (1 - endK) * 0.35;
    const off = 0.018 + 0.03 * THREE.MathUtils.smoothstep(a, 0.0, 0.12) * THREE.MathUtils.smoothstep(1 - a, 0.0, 0.12);
    return Math.max(shellH(u, r) + off, plane);
  };
  const bandGeo = polarBand({
    th0: TH0, th1: TH1,
    rIn: () => B_IN * K,
    rOut: (u) => (B_IN + bandWidth(u)) * K,
    zTop: bandTop, offset: 0, thickness: 0.24, bevel: 0.03,
    // rounded torus-like crown (peaks toward the inner edge, hugging the disc)
    lift: (u, v) => {
      const a = THREE.MathUtils.clamp(along(u), 0, 1);
      const mid = Math.pow(Math.sin(Math.PI * a), 0.5);
      const crown = Math.pow(Math.sin(Math.PI * THREE.MathUtils.clamp(0.08 + v * 0.84, 0, 1)), 0.6);
      return (0.034 * crown + 0.01 * Math.exp(-Math.pow((v - 0.7) / 0.2, 2))) * mid;
    },
    segU: 110, segV: 12,
  });
  const channelGeo = polarBand({
    th0: TH0 - 0.2, th1: TH1 + 0.2,
    rIn: () => 0.306 * K, rOut: () => 0.35 * K,
    offset: 0.022, thickness: 0.07, bevel: 0.0, segU: 72, segV: 3,
  });

  // red-lit vent ladder along the outer-back edge of the band
  const deg = THREE.MathUtils.degToRad;
  const V0 = deg(-24), V1 = deg(64);
  const ventIn = (u) => (B_IN + bandWidth(u) + 0.004) * K;
  const ventOut = (u) => (B_IN + bandWidth(u) + 0.034) * K;
  const ventGeo = polarBand({
    th0: V0, th1: V1, rIn: ventIn, rOut: ventOut,
    offset: 0.006, thickness: 0.05, bevel: 0.0, segU: 36, segV: 2,
  });
  const ribParts = [];
  const RIBS = 24;
  for (let k = 0; k < RIBS; k++) {
    const u = V0 + ((k + 0.5) / RIBS) * (V1 - V0);
    ribParts.push(polarBand({
      th0: u - 0.012, th1: u + 0.012, rIn: (x) => ventIn(x) - 0.004, rOut: (x) => ventOut(x) + 0.006,
      offset: 0.022, thickness: 0.04, bevel: 0.0, segU: 1, segV: 2,
    }));
  }
  // vent housing lips (dark) on both sides of the slot
  ribParts.push(polarBand({
    th0: V0 - 0.03, th1: V1 + 0.03, rIn: (u) => ventOut(u), rOut: (u) => ventOut(u) + 0.012,
    offset: 0.03, thickness: 0.06, bevel: 0.004, segU: 36, segV: 2,
  }));
  const ribGeo = geo.mergeGeometries(ribParts, false);
  ribParts.forEach((g) => g.dispose());

  // --------------------------------------------------------- rotor (L frame)
  const segGeo = segmentRing({ count: 16, rIn: 0.193 * K, rOut: 0.232 * K, gap: 0.05, depth: 0.012, bevel: 0.0035, zTop: Z.seg });
  const rotorBaseGeo = polarLathe([
    { r: 0.066, z: Z.floor }, { r: 0.19, z: Z.floor }, { r: 0.19, z: Z.segFloor }, { r: 0.236, z: Z.segFloor }, { r: 0.236, z: Z.back + 0.03 },
  ], 96);
  const segRibs = teethRing({ count: 16, r0: 0.19 * K, r1: 0.236 * K, width: 0.01, height: 0.02, zBase: Z.segFloor - 0.005 });
  const innerGeo = polarLathe([
    { r: 0.066, z: Z.floor + 0.01 }, { r: 0.066, z: Z.inner - 0.006 }, { r: 0.0705, z: Z.inner },
    { r: 0.086, z: Z.inner + 0.003 }, { r: 0.101, z: Z.inner }, { r: 0.108, z: Z.inner - 0.008 }, { r: 0.108, z: Z.floor - 0.005 },
  ], 96);
  // turbine vanes: thin curved (swirl) blades between the inner ring and the
  // groove. Each vane is built in its CHORD frame (x = inner->outer chord,
  // origin = chord midpoint) so the iris can pitch it about that chord.
  const VANES = 30;
  const vR0 = 0.111 * K, vR1 = 0.188 * K, vSweep = 0.62;
  const vS = new THREE.Vector2(vR0, 0);
  const vE = new THREE.Vector2(vR1 * Math.cos(vSweep), vR1 * Math.sin(vSweep));
  const vMid = vS.clone().add(vE).multiplyScalar(0.5);
  const vAlpha = Math.atan2(vE.y - vS.y, vE.x - vS.x);
  const vanePts = [];
  for (let i = 0; i <= 10; i++) {
    const s = i / 10;
    const r = vR0 + (vR1 - vR0) * s;
    const a = vSweep * Math.pow(s, 0.75);
    const p = new THREE.Vector2(r * Math.cos(a), r * Math.sin(a)).sub(vMid).rotateAround(new THREE.Vector2(), -vAlpha);
    vanePts.push(new THREE.Vector3(p.x, p.y, 0));
  }
  const vc = 0.05; // chord height along the disc axis
  const vaneGeo = geo.sweptSection(new THREE.CatmullRomCurve3(vanePts), [
    [-0.0022, -vc / 2], [0.0022, -vc / 2], [0.0022, vc / 2 - 0.004], [0, vc / 2], [-0.0022, vc / 2 - 0.004],
  ], { steps: 14, up: new THREE.Vector3(0, 0, 1), scale: (t) => [1, 1 - 0.25 * t] });
  const mirrorY = (g) => {
    const c = g.clone();
    c.scale(1, -1, 1);
    geo.flipWinding(c);
    const n = c.attributes.normal.array;
    for (let i = 0; i < n.length; i++) n[i] = -n[i];
    return c;
  };
  const vaneGeoR = mirrorY(vaneGeo);

  // hub (lens + bezel + pin)
  const bezelGeo = polarLathe([
    { r: 0.047, z: Z.lens - 0.01 }, { r: 0.047, z: Z.bezel + 0.004 }, { r: 0.051, z: Z.bezel + 0.008 },
    { r: 0.06, z: Z.bezel + 0.008 }, { r: 0.064, z: Z.bezel + 0.002 }, { r: 0.064, z: Z.floor },
  ], 64);
  const lensGeo = polarLathe([
    { r: 0.0, z: Z.lens + 0.012 }, { r: 0.014, z: Z.lens + 0.011 }, { r: 0.016, z: Z.lens + 0.006 },
    { r: 0.03, z: Z.lens + 0.004 }, { r: 0.032, z: Z.lens }, { r: 0.047, z: Z.lens - 0.004 }, { r: 0.047, z: Z.lens - 0.01 },
  ], 64);

  // red lens core: concentric glowing rings in the lens + a faint halo ring on the floor
  const coreGeo = geo.mergeGeometries([
    polarLathe([{ r: 0.0, z: Z.lens + 0.0125 }, { r: 0.009, z: Z.lens + 0.0125 }], 32),
    polarLathe([{ r: 0.017, z: Z.lens + 0.0075 }, { r: 0.0285, z: Z.lens + 0.0055 }], 48),
  ].map((g) => (g.index ? g.toNonIndexed() : g)), false);
  const haloGeo = polarLathe([{ r: 0.068, z: Z.floor + 0.004 }, { r: 0.1, z: Z.floor + 0.004 }], 64);

  // --------------------------------------------------------------- assemble
  const mirror = (g) => geo.mirrorGeometryX(g);
  const sides = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const G = side > 0 ? (g) => g : mirror;
    const joint = ctx.space(`cheek${key}`, 'local');
    const facing = new THREE.Group();
    facing.name = `cheeks.frame.${key}`;
    geo.faceDirection(facing, new THREE.Vector3(N.x * side, N.y, N.z));
    joint.add(facing);

    const add = (parent, g, mat, name) => {
      const m = ctx.mesh(G(g), mat, name);
      parent.add(m);
      return m;
    };
    add(facing, bandGeo, bandMat, `cheeks.band.${key}`);
    add(facing, channelGeo, cavityMat, `cheeks.channel.${key}`);
    add(facing, ventGeo, ventMat, `cheeks.vent.${key}`);
    add(facing, ribGeo, darkMat, `cheeks.ventRibs.${key}`);
    add(facing, rimGeo, rimMat, `cheeks.rim.${key}`);
    add(facing, wallGeo, darkMat, `cheeks.wall.${key}`);
    add(facing, socketGeo, cavityMat, `cheeks.socket.${key}`);
    add(facing, statorGeo, statorMat, `cheeks.stator.${key}`);
    add(facing, statorTeeth, darkMat, `cheeks.statorTeeth.${key}`);

    // everything that recesses together (recess param)
    const stack = new THREE.Group();
    stack.name = `cheeks.stack.${key}`;
    facing.add(stack);
    // rotor: spins about the disc axis
    const rotor = new THREE.Group();
    rotor.name = `cheeks.rotor.${key}`;
    stack.add(rotor);
    add(rotor, segGeo, segMat, `cheeks.segments.${key}`);
    add(rotor, rotorBaseGeo, darkMat, `cheeks.rotorBase.${key}`);
    add(rotor, segRibs, darkMat, `cheeks.ribs.${key}`);
    add(rotor, innerGeo, innerMat, `cheeks.innerRing.${key}`);
    // one InstancedMesh per side; per-vane pitch is written in apply()
    const vanes = new THREE.InstancedMesh(side > 0 ? vaneGeo : vaneGeoR, vaneMat, VANES);
    vanes.name = `cheeks.vanes.${key}`;
    vanes.userData.part = 'cheeks';
    rotor.add(vanes);
    // hub: pushes out along the axis (pulse)
    const hub = new THREE.Group();
    hub.name = `cheeks.hub.${key}`;
    stack.add(hub);
    add(hub, bezelGeo, innerMat, `cheeks.bezel.${key}`);
    add(hub, lensGeo, lensMat, `cheeks.lens.${key}`);
    add(hub, coreGeo, coreMat, `cheeks.core.${key}`);
    add(rotor, haloGeo, haloMat, `cheeks.halo.${key}`);

    sides[key] = { side, stack, rotor, hub, vanes };
  }

  let phase = 0; // accumulated idle spin
  const params = { spin: 0, spinSpeed: 0.12, iris: 0.35, pulse: 0, recess: 0 };
  const _m = new THREE.Matrix4();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);
  const _qq = new THREE.Quaternion();
  const writeVanes = (s, pitch) => {
    for (let i = 0; i < VANES; i++) {
      const phi = (i / VANES) * Math.PI * 2;
      // L: rotate the chord frame to (phi + alpha); R is the X-mirror of L
      const beta = phi + vAlpha;
      const mx = vMid.x * Math.cos(phi) - vMid.y * Math.sin(phi);
      const my = vMid.x * Math.sin(phi) + vMid.y * Math.cos(phi);
      if (s.side > 0) {
        _e.set(pitch, 0, beta, 'ZYX');
        _p.set(mx, my, Z.vanePivot);
      } else {
        _e.set(-pitch, 0, Math.PI - beta, 'ZYX');
        _p.set(-mx, my, Z.vanePivot);
      }
      _m.compose(_p, _qq.setFromEuler(_e), _s);
      s.vanes.setMatrixAt(i, _m);
    }
    s.vanes.instanceMatrix.needsUpdate = true;
    s.vanes.computeBoundingSphere();
  };
  const apply = (p) => {
    for (const s of Object.values(sides)) {
      s.rotor.rotation.z = s.side * (p.spin + phase);
      const pitch = THREE.MathUtils.lerp(1.2, 0.1, THREE.MathUtils.clamp(p.iris, 0, 1));
      writeVanes(s, pitch);
      s.hub.position.z = p.pulse * 0.045;
      s.hub.scale.setScalar(1 + p.pulse * 0.08);
      s.stack.position.z = -p.recess * 0.05;
    }
    coreMat.color.copy(CORE_RGB).multiplyScalar(2.2 + 1.2 * THREE.MathUtils.clamp(p.pulse, 0, 1));
  };
  return {
    params,
    paramSpec: {
      spin: { min: -Math.PI, max: Math.PI, step: 0.01 },
      spinSpeed: { min: -2, max: 2, step: 0.01 },
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
