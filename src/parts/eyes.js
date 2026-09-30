/**
 * PART: eyes — deep-set glowing lenses in mechanical sockets, eyelid plates
 * and heavy brow plates.
 *
 * Joints: eyeL / eyeR (socket, lids, lens), browL / browR (brow plates).
 * Both sides are authored once for the LEFT eye / brow (joint-local space)
 * and mirrored with a scale.x = -1 group for the right side.
 *
 * Socket frame ("F"): origin at the eye cutout centre (anatomy.CUTOUTS.eyeL),
 * z along the local face-mask normal, rolled with the socket tilt. Everything
 * inside the socket is laid out on surfaces of revolution around a hinge axis
 * (F's x axis through E, ~0.34 behind the mask):
 *   - lids are shells of revolution whose radius R(x) follows the mask
 *     surface, so rotating them about the hinge (blink / squint) keeps them
 *     tucked just behind the mask opening;
 *   - the lens / eyeball is a sphere around E, so look rotations slide it
 *     under the lids like a real eyeball.
 *
 * Glow: the lens is a procedural HDR shader (hot core, saturated red ring,
 * dark concentric lens rings, iris blades). Its colours use slightly negative
 * green/blue so they survive AgX tone mapping as a saturated red (AgX
 * otherwise desaturates pure red to salmon); the hot ring is bright enough
 * to cross the bloom threshold, and because its G/B are negative the bloom
 * halo comes out red instead of pink.
 *
 * Params (see paramSpec): glow, flicker, pupil, lookX, lookY, blink, wink,
 * squint, browL, browR, browInner (anger), idle (auto blink + micro saccades).
 */
export const meta = {
  id: 'eyes',
  explode: [0, 0.1, 1.4],
};

// Socket frame relative to the head (left eye). Roll comes from the cutout.
const FRAME_PITCH = 0.14; // +: frame z tilts down (the mask faces slightly down here)
const FRAME_YAW = 0.24; // +: frame z turns outward (mask normal at the eye)
const HINGE_DEPTH = 0.34; // lid hinge / eyeball centre behind the cutout centre
const LENS_R = 0.06; // radius of the glowing lens disc
const LID_TH = 0.011; // lid plate thickness
const LID_GAP = 0.02; // upper lid surface behind the mask outer surface
const BLINK_ANGLE = 0.46;// radians the upper lid travels to close
const LOOK_X = 0.16; // radians of eyeball yaw at lookX = 1
const LOOK_Y = 0.1; // radians of eyeball pitch at lookY = 1
const LIGHT_I = 0.02; // red socket light intensity
const REST_YAW = -0.05; // rest gaze: lens sits slightly toward the nose...
const REST_PITCH = -0.03; // ...and slightly up in the socket

// Replica of the face mask sculpt (faceplate.js `lift`) so plates sit on it.
function maskLift(u, y) {
  const brow = Math.exp(-Math.pow((y - 1.08) / 0.06, 2)) * 0.03 * Math.exp(-Math.pow((Math.abs(u) - 0.45) / 0.35, 2));
  const under = -Math.exp(-Math.pow((y - 0.78) / 0.09, 2)) * 0.018 * Math.exp(-Math.pow((Math.abs(u) - 0.5) / 0.25, 2));
  return brow + under;
}

/** Piecewise-linear interpolation over sorted xs. */
function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  const n = xs.length - 1;
  if (x >= xs[n]) return ys[n];
  let i = 0;
  while (xs[i + 1] < x) i++;
  const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
  return ys[i] + (ys[i + 1] - ys[i]) * t;
}

/**
 * Closed solid from a (nu x nv) grid of outer points and matching inner
 * points (outer normals = du x dv). Returns a non-indexed geometry with
 * approximately world-unit UVs.
 */
function gridSolid(THREE, geo, nu, nv, outerFn, innerFn, crease = 40) {
  const O = [];
  const I = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      O.push(outerFn(i / nu, j / nv));
      I.push(innerFn(i / nu, j / nv));
    }
  }
  const w = nu + 1;
  const id = (i, j) => j * w + i;
  // approximate world uvs: accumulated edge lengths along the middle row / column
  const uAcc = [0];
  for (let i = 1; i <= nu; i++) uAcc.push(uAcc[i - 1] + O[id(i, nv >> 1)].distanceTo(O[id(i - 1, nv >> 1)]));
  const vAcc = [0];
  for (let j = 1; j <= nv; j++) vAcc.push(vAcc[j - 1] + O[id(nu >> 1, j)].distanceTo(O[id(nu >> 1, j - 1)]));
  const pos = [];
  const uv = [];
  const tri = (a, b, c, ua, ub, uc) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  };
  const U = (i, j) => [uAcc[i], vAcc[j]];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
      tri(O[a], O[b], O[d], U(i, j), U(i + 1, j), U(i, j + 1));
      tri(O[b], O[c], O[d], U(i + 1, j), U(i + 1, j + 1), U(i, j + 1));
      tri(I[a], I[d], I[b], U(i, j), U(i, j + 1), U(i + 1, j));
      tri(I[b], I[d], I[c], U(i + 1, j), U(i, j + 1), U(i + 1, j + 1));
    }
  }
  const t0 = [0, 0], t1 = [0, 0.01];
  // walls along j = 0 and j = nv
  for (let i = 0; i < nu; i++) {
    const a = id(i, 0), b = id(i + 1, 0);
    tri(O[a], I[a], O[b], [uAcc[i], 0], [uAcc[i], 0.01], [uAcc[i + 1], 0]);
    tri(O[b], I[a], I[b], [uAcc[i + 1], 0], [uAcc[i], 0.01], [uAcc[i + 1], 0.01]);
    const c = id(i, nv), d = id(i + 1, nv);
    tri(O[c], O[d], I[c], [uAcc[i], 0], [uAcc[i + 1], 0], [uAcc[i], 0.01]);
    tri(O[d], I[d], I[c], [uAcc[i + 1], 0], [uAcc[i + 1], 0.01], [uAcc[i], 0.01]);
  }
  // walls along i = 0 and i = nu
  for (let j = 0; j < nv; j++) {
    const a = id(0, j), b = id(0, j + 1);
    tri(O[a], O[b], I[a], [vAcc[j], 0], [vAcc[j + 1], 0], t1);
    tri(O[b], I[b], I[a], [vAcc[j + 1], 0], [vAcc[j + 1], 0.01], t1);
    const c = id(nu, j), d = id(nu, j + 1);
    tri(O[c], I[c], O[d], [vAcc[j], 0], t1, [vAcc[j + 1], 0]);
    tri(O[d], I[c], I[d], [vAcc[j + 1], 0], t0, [vAcc[j + 1], 0.01]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const out = geo.toCreasedNormals(g, THREE.MathUtils.degToRad(crease));
  g.dispose();
  out.computeBoundingSphere();
  return out;
}

/** Loft through rows of loops (rows[k][i] = Vector3). Open ends. */
function loftLoops(THREE, rows, closed = true) {
  const n = rows[0].length;
  const segs = closed ? n : n - 1;
  const pos = [];
  const uv = [];
  const index = [];
  let v = 0;
  for (let k = 0; k < rows.length; k++) {
    if (k > 0) v += rows[k][0].distanceTo(rows[k - 1][0]);
    let u = 0;
    for (let i = 0; i <= segs; i++) {
      const p = rows[k][i % n];
      if (i > 0) u += p.distanceTo(rows[k][i - 1]);
      pos.push(p.x, p.y, p.z);
      uv.push(u, v);
    }
  }
  const w = segs + 1;
  for (let k = 0; k < rows.length - 1; k++) {
    for (let i = 0; i < segs; i++) {
      const a = k * w + i, b = a + 1, c = a + w + 1, d = a + w;
      index.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

const LENS_VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const LENS_FRAG = /* glsl */ `
uniform vec3 uGain;
uniform float uR;
uniform float uPupil;
uniform vec3 uHot;
uniform vec3 uRed;
uniform vec3 uDeep;
varying vec2 vP;
#define PI 3.14159265
float band(float r, float c, float w, float aa) { return 1.0 - smoothstep(w - aa, w + aa, abs(r - c)); }
void main() {
  vec2 p = vP / uR;
  float r = length(p);
  float a = atan(p.y, p.x);
  float aa = fwidth(r) * 0.8 + 1e-4;
  // 7-blade iris aperture
  float seg = 2.0 * PI / 7.0;
  float am = mod(a + 0.4, seg) - 0.5 * seg;
  float poly = r * cos(am) / cos(0.5 * seg);
  float ap = 0.36 * uPupil;
  // base: saturated red, darkening toward the rim
  vec3 col = mix(uRed, uDeep, smoothstep(0.5, 0.98, r));
  // iris blades between aperture and the first ring
  float bladeZone = smoothstep(ap - 0.01, ap + 0.03, poly) * (1.0 - smoothstep(0.56, 0.62, r));
  float saw = fract((a + 0.4) / seg + r * 1.6);
  col *= mix(1.0, 0.45 + 0.75 * saw, bladeZone);
  // hot core inside the aperture, with a red centre dot
  float hot = 1.0 - smoothstep(ap - 0.03 - aa, ap + aa, poly);
  col = mix(col, uHot, hot);
  float dotR = 0.16 * uPupil;
  col = mix(col, uRed * 1.6, 1.0 - smoothstep(dotR - aa, dotR + aa, r));
  // thin dark concentric rings (camera lens / aperture look)
  float d = band(poly, ap + 0.02, 0.02, aa);
  d = max(d, band(r, 0.66, 0.022, aa) * 0.85);
  d = max(d, smoothstep(0.86, 0.97, r));
  col *= 1.0 - 0.9 * d;
  // a faint specular glint on the cover glass
  float gl = exp(-dot(p - vec2(-0.3, 0.42), p - vec2(-0.3, 0.42)) * 60.0);
  col += vec3(1.2, 0.9, 0.8) * gl;
  gl_FragColor = vec4(col * uGain, 1.0);
}`;

const HALO_FRAG = /* glsl */ `
uniform vec3 uGain;
uniform vec3 uColor;
uniform float uR0;
uniform float uR1;
varying vec2 vP;
void main() {
  float r = length(vP);
  float k = 1.0 - smoothstep(uR0, uR1, r);
  k *= smoothstep(uR0 * 0.9, uR0 * 1.02, r);
  k = k * k * (0.35 + 0.65 * (1.0 - smoothstep(uR0, uR0 + (uR1 - uR0) * 0.35, r)));
  gl_FragColor = vec4(uColor * uGain * k, 1.0);
}`;

const RIM_FRAG = /* glsl */ `
uniform vec3 uGain;
uniform vec3 uColor;
uniform float uSigma;
varying vec2 vP;
void main() {
  float d = length(vP * vec2(0.8, 1.6));
  float k = exp(-d * d / (uSigma * uSigma));
  gl_FragColor = vec4(uColor * uGain * k, 1.0);
}`;

export function build(ctx) {
  const { THREE, geo, anatomy: A, materials: M } = ctx;
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  // ------------------------------------------------------------------ frames
  const cut = A.CUTOUTS.eyeL;
  const C = V3().fromArray(cut.center);
  const [ca, cb, cc] = cut.radii;
  const eyeJoint = V3().fromArray(A.JOINTS.eyeL.pos);
  const browJoint = V3().fromArray(A.JOINTS.browL.pos);
  const qS = new THREE.Quaternion().setFromEuler(new THREE.Euler(cut.rotation[0], cut.rotation[1], cut.rotation[2]));
  const qF = new THREE.Quaternion().setFromEuler(new THREE.Euler(FRAME_PITCH, FRAME_YAW, cut.rotation[2]));
  const qFi = qF.clone().invert();

  const maskZ = (hx, hy) => {
    const z = A.headFrontZ(hx, hy);
    return z === null ? null : z + 0.006 + maskLift(A.headAngleForX(hx, hy), hy);
  };
  const _v = V3();
  /** Depth (along the frame's z) of the mask outer surface at frame (x, y). */
  const depthAlong = (q, x, y) => {
    let lo = -0.4, hi = 0.25;
    for (let i = 0; i < 22; i++) {
      const m = (lo + hi) * 0.5;
      _v.set(x, y, m).applyQuaternion(q).add(C);
      const s = maskZ(_v.x, _v.y);
      if (s === null || _v.z > s) hi = m;
      else lo = m;
    }
    return (lo + hi) * 0.5;
  };
  const zF = (x, y) => depthAlong(qF, x, y);

  // mask opening outline (cutout ellipsoid ∩ mask surface), in F coords
  const NT = 72;
  const outline = [];
  for (let i = 0; i < NT; i++) {
    const t = (i / NT) * Math.PI * 2;
    const x = ca * Math.cos(t), y = cb * Math.sin(t);
    const z = depthAlong(qS, x, y);
    const k = Math.sqrt(Math.max(0.5, 1 - (z / cc) ** 2));
    outline.push(V3(x * k, y * k, z).applyQuaternion(qS).applyQuaternion(qFi));
  }
  let W = 0;
  for (const p of outline) W = Math.max(W, Math.abs(p.x));
  W += 0.035;

  // ------------------------------------------------ lid radius profile R(x)
  const E = V3(0, 0, -HINGE_DEPTH);
  const NXS = 29;
  const xs = [];
  const Rmask = [];
  for (let i = 0; i < NXS; i++) {
    const x = -W + (2 * W * i) / (NXS - 1);
    const hy = cb * Math.sqrt(Math.max(0, 1 - (x / ca) ** 2)) + 0.03;
    let m = Infinity;
    for (let j = 0; j <= 8; j++) {
      const y = -hy + (2 * hy * j) / 8;
      m = Math.min(m, Math.hypot(y - E.y, zF(x, y) - E.z));
    }
    xs.push(x);
    Rmask.push(m);
  }
  // light smoothing so the lids do not ripple
  const Rs = Rmask.map((r, i) => {
    const a = Rmask[Math.max(0, i - 1)], b = Rmask[Math.min(NXS - 1, i + 1)];
    return Math.min(r, (a + 2 * r + b) / 4);
  });
  const Rup = (x) => interp(xs, Rs, x) - LID_GAP;
  const Rlo = (x) => Rup(x) - LID_TH - 0.004;
  // lens + eyeball spheres must stay inside the lower lid's inner surface
  const clear = (x) => Rlo(x) - LID_TH - 0.003;
  let RLtop = Infinity;
  let RBall = Infinity;
  for (let i = 0; i <= 40; i++) {
    const x = -W + (2 * W * i) / 40;
    const r = Math.hypot(clear(x), x);
    if (Math.abs(x) < 0.14) RLtop = Math.min(RLtop, r);
    RBall = Math.min(RBall, r);
  }
  const RL = RLtop - 0.007; // lens glass sphere (bezel rises up to +0.007)
  RBall = Math.min(RBall - 0.004, RL - 0.004);

  // ------------------------------------------------------------ materials
  // upper lid sits in the brow's shadow (no shadow maps here), so it is darker
  const upperLidMat = M.get('darkMetal', { panel: 14, seed: 43, lineWidth: 0.0022, roughness: 0.38, color: 0x202226 });
  const leafMat = M.get('darkMetal', { panel: 11, seed: 47, lineWidth: 0.0022, roughness: 0.3, color: 0x34373c });
  const lidMat = M.get('gunmetal', { panel: 14, seed: 43, lineWidth: 0.0022, roughness: 0.32 });
  const bezelMat = M.get('darkMetal', { roughness: 0.55 });
  const ringMat = M.get('darkMetal', { roughness: 0.28, metalness: 1.0 });
  const cavityMat = M.get('cavity', { side: THREE.DoubleSide, color: 0x050506, roughness: 0.85 });
  const ballMat = M.get('cavity', { color: 0x050506, roughness: 0.8 });
  const browMat = M.get('chrome', { roughness: 0.18, panel: 5, seed: 31, lineWidth: 0.004 });

  // glow materials: registered with the library so M.setGlow() scales them
  const gain = new THREE.Color(1, 1, 1);
  const registerGlow = (mat) => {
    mat.color = gain; // M.setGlow copies baseColor * k into .color
    mat.userData.baseColor = new THREE.Color(1, 1, 1);
    if (M.all && typeof M.all.add === 'function') M.all.add(mat);
    return mat;
  };
  const lensMat = registerGlow(new THREE.ShaderMaterial({
    name: 'eyes.lens',
    uniforms: {
      uGain: { value: gain },
      uR: { value: LENS_R },
      uPupil: { value: 1 },
      uHot: { value: V3(18, -0.9, 0.1) },
      uRed: { value: V3(2.4, -0.33, -0.3) },
      uDeep: { value: V3(0.5, -0.06, -0.05) },
    },
    vertexShader: LENS_VERT,
    fragmentShader: LENS_FRAG,
  }));
  const haloMat = registerGlow(new THREE.ShaderMaterial({
    name: 'eyes.halo',
    uniforms: {
      uGain: { value: gain },
      uColor: { value: V3(0.8, -0.1, -0.09) },
      uR0: { value: LENS_R * 0.98 },
      uR1: { value: LENS_R * 1.75 },
    },
    vertexShader: LENS_VERT,
    fragmentShader: HALO_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));

  // ------------------------------------------------------ shared geometry
  // Socket tunnel: bezel ring just inside the carved opening + dark cavity wall.
  const loop = (s, depth) => outline.map((p) => V3(p.x * s, p.y * s, p.z - depth));
  const bezelGeo = geo.toCreasedNormals(
    loftLoops(THREE, [loop(1.08, 0.032), loop(1.0, 0.007), loop(0.975, 0.005), loop(0.958, 0.011), loop(0.95, 0.018)]),
    THREE.MathUtils.degToRad(35)
  );
  const cavityGeo = loftLoops(THREE, [loop(0.95, 0.018), loop(0.935, 0.06), loop(0.84, 0.15), loop(0.62, 0.3), loop(0.3, 0.36)]);
  // red light spilling onto the lower socket rim (additive, fades away from the lens)
  const lowerArc = (s, depth) => {
    const pts = [];
    for (let i = NT / 2; i <= NT; i++) {
      const p = outline[i % NT];
      pts.push(V3(p.x * s, p.y * s, p.z - depth));
    }
    return pts;
  };
  const rimGlowGeo = loftLoops(THREE, [lowerArc(1.0, 0.0065), lowerArc(0.976, 0.0048), lowerArc(0.957, 0.0115), lowerArc(0.945, 0.03)], false);
  const rimGlowMat = registerGlow(new THREE.ShaderMaterial({
    name: 'eyes.rimGlow',
    uniforms: { uGain: { value: gain }, uColor: { value: V3(0.9, -0.12, -0.1) }, uSigma: { value: 0.11 } },
    vertexShader: LENS_VERT,
    fragmentShader: RIM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  }));

  // Lids: shells of revolution about F's x axis through E.
  const ridge = (x, R, phi, lift = 0) => V3(x, E.y + (R + lift) * Math.sin(phi), E.z + (R + lift) * Math.cos(phi));
  const upperEdgeY = (x) => 0.054 + 0.15 * x - 1.5 * x * x;
  const lowerEdgeY = (x) => -0.07 - 0.05 * x + 1.2 * x * x;
  const phiU = (x) => Math.asin(THREE.MathUtils.clamp(upperEdgeY(x) / Rup(x), -0.9, 0.9));
  const phiL = (x) => Math.asin(THREE.MathUtils.clamp(lowerEdgeY(x) / Rlo(x), -0.9, 0.9));
  const PHI_TOP = 1.0;
  const PHI_BOT = -0.8;
  const xAt = (u) => -W + 2 * W * u;
  const upperLidGeo = gridSolid(THREE, geo, 36, 14,
    (u, v) => { const x = xAt(u); return ridge(x, Rup(x), phiU(x) + (PHI_TOP - phiU(x)) * v); },
    (u, v) => { const x = xAt(u); return ridge(x, Rup(x) - LID_TH, phiU(x) + 0.004 + (PHI_TOP - phiU(x)) * v); });
  // a raised leaf on the upper lid (layered shutter look)
  const leafX0 = -0.15, leafX1 = 0.19;
  const leafGeo = gridSolid(THREE, geo, 24, 8,
    (u, v) => { const x = leafX0 + (leafX1 - leafX0) * u; const p0 = phiU(x) + 0.045 + 0.02 * Math.abs(u - 0.5); return ridge(x, Rup(x), p0 + (PHI_TOP - p0) * v, 0.0045); },
    (u, v) => { const x = leafX0 + (leafX1 - leafX0) * u; const p0 = phiU(x) + 0.045 + 0.02 * Math.abs(u - 0.5); return ridge(x, Rup(x), p0 + (PHI_TOP - p0) * v, -0.002); });
  const lowerLidGeo = gridSolid(THREE, geo, 36, 14,
    (u, v) => { const x = xAt(u); return ridge(x, Rlo(x), PHI_BOT + (phiL(x) - PHI_BOT) * v); },
    (u, v) => { const x = xAt(u); return ridge(x, Rlo(x) - LID_TH, PHI_BOT + (phiL(x) - 0.004 - PHI_BOT) * v); });
  // rounded edge bars along the lid lips (catch the red light)
  const edgeBar = (fnR, fnPhi, lift, x0, x1, radius) => {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const x = x0 + ((x1 - x0) * i) / 24;
      pts.push(ridge(x, fnR(x), fnPhi(x), lift));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    return geo.sweptSection(curve, geo.roundedSection(radius, radius, 2, 10), { steps: 48, up: V3(0, 0, 1) });
  };
  const upperBarGeo = edgeBar(Rup, (x) => phiU(x) + 0.012, -LID_TH * 0.5, -W + 0.02, W - 0.02, 0.0055);
  const lowerBarGeo = edgeBar(Rlo, (x) => phiL(x) - 0.01, -LID_TH * 0.5, -W + 0.02, W - 0.02, 0.005);
  const lowerRibGeos = [0.06].map((dphi) => edgeBar(Rlo, (x) => phiL(x) - dphi, 0.0005, -W + 0.03, W - 0.03, 0.0032));
  // lid geometries are authored in F coords; move them into hinge-pivot space
  for (const g of [upperLidGeo, leafGeo, lowerLidGeo, upperBarGeo, lowerBarGeo, ...lowerRibGeos]) g.translate(-E.x, -E.y, -E.z);

  // Eyeball (lens assembly) around E, axis +Z.
  const capGeo = (R, r0, r1, seg = 64, rings = 8) => {
    const t0 = Math.asin(Math.min(0.999, r0 / R));
    const t1 = Math.asin(Math.min(0.999, r1 / R));
    const g = new THREE.SphereGeometry(R, seg, rings, 0, Math.PI * 2, t0, t1 - t0);
    g.rotateX(Math.PI / 2);
    return g;
  };
  const lensGeo = capGeo(RL, 0, LENS_R, 64, 10);
  const haloGeo = capGeo(RL + 0.0012, LENS_R * 0.95, LENS_R * 2.1, 64, 8);
  const ballGeo = capGeo(RBall, 0, Math.min(RBall * 0.92, W + 0.03), 72, 22);
  const sph = (r, dz) => [r, Math.sqrt(Math.max(1e-6, (RL + dz) ** 2 - r * r))];
  const LR = LENS_R;
  const bezelProfile = [
    [LR * 0.985, -0.0015], [LR, 0.0035], [LR + 0.005, 0.0045], [LR + 0.0075, 0.0015], [LR + 0.013, 0.0015],
    [LR + 0.015, 0.0068], [LR + 0.021, 0.0068], [LR + 0.023, 0.0], [LR + 0.037, -0.002], [LR + 0.0385, 0.0025],
    [LR + 0.043, 0.0025], [LR + 0.0445, -0.0035],
  ].map(([r, dz]) => sph(r, dz));
  const lensRingGeo = geo.ringStack(bezelProfile, 72);
  // small radial ribs in the socket corners (mechanical detail)
  const ribGeos = [];
  for (const [ang, len] of [[0, 0.05], [Math.PI, 0.05], [0.35, 0.035], [Math.PI - 0.35, 0.035], [-0.3, 0.035], [Math.PI + 0.3, 0.035]]) {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const r = 0.128 + (len * i) / 6;
      const [rr, z] = sph(r, -0.001);
      pts.push(V3(rr * Math.cos(ang), rr * Math.sin(ang), z));
    }
    ribGeos.push(geo.sweptSection(new THREE.CatmullRomCurve3(pts), geo.roundedSection(0.004, 0.0035, 4, 10), { steps: 8, up: V3(0, 0, 1) }));
  }

  // ------------------------------------------------------------------ brow
  // Lower edge follows the top of the mask opening (slightly overhanging),
  // then the plate sweeps up/out to the temple and down toward the nose.
  const top = [];
  for (let i = 0; i <= 18; i++) {
    const t = (i / 18) * Math.PI * 0.8; // 0 = outer end -> toward the inner end
    const x = ca * Math.cos(t), y = cb * Math.sin(t);
    const z = depthAlong(qS, x, y);
    const p = V3(x, y, z).applyQuaternion(qS).add(C);
    const over = 0.012 + 0.01 * (i / 18);
    top.push([p.x, p.y - over]);
  }
  const outerEnd = top[0];
  const lowerPoly = [[0.078, 0.872], ...top.slice().reverse(), [outerEnd[0] + 0.075, outerEnd[1] + 0.008]];
  const upperPoly = [
    [0.07, 0.945], [0.12, 1.035], [0.22, 1.105], [0.36, 1.145], [0.5, 1.13],
    [outerEnd[0] + 0.09, outerEnd[1] + 0.07], [outerEnd[0] + 0.1, outerEnd[1] + 0.03],
  ];
  // Lofted between the two edge curves and wrapped on the head shell: a
  // wedge that is thickest (juts out most) along the lower, overhanging edge.
  const curve2 = (pts) => new THREE.CatmullRomCurve3(pts.map(([x, y]) => V3(x, y, 0)), false, 'centripetal');
  const lowerCurve = curve2(lowerPoly);
  const upperCurve = curve2(upperPoly);
  const browLen = lowerCurve.getLength();
  const cosSpace = (v) => 0.5 - 0.5 * Math.cos(Math.PI * v); // dense samples at the edges (bevels)
  const BROW_BEVEL = 0.006;
  const _a3 = V3(), _b3 = V3(), _n = V3();
  const browPoint = (u, v, front) => {
    const s = cosSpace(u), t = cosSpace(v);
    lowerCurve.getPointAt(s, _a3);
    upperCurve.getPointAt(s, _b3);
    const x = _a3.x + (_b3.x - _a3.x) * t, y = _a3.y + (_b3.y - _a3.y) * t;
    const ua = A.headAngleForX(x, y);
    const P = A.headSurface(ua, y, V3());
    A.headNormal(ua, y, _n);
    let h = 0.006 + maskLift(ua, y);
    if (front) {
      h += 0.014 + 0.034 * (1 - t * t * (3 - 2 * t));
      const d = Math.min(Math.min(t, 1 - t) * _a3.distanceTo(_b3), Math.min(s, 1 - s) * browLen);
      if (d < BROW_BEVEL) {
        const k = BROW_BEVEL - d;
        h -= BROW_BEVEL - Math.sqrt(Math.max(0, BROW_BEVEL * BROW_BEVEL - k * k));
      }
    } else {
      h -= 0.03; // buried under the mask
    }
    return P.addScaledVector(_n, h);
  };
  const browGeo = gridSolid(THREE, geo, 56, 18, (u, v) => browPoint(u, v, true), (u, v) => browPoint(u, v, false), 35);
  browGeo.translate(-browJoint.x, -browJoint.y, -browJoint.z);

  // ------------------------------------------------------------- assemble
  const sides = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const joint = ctx.space(`eye${key}`, 'local');
    const mirror = new THREE.Group();
    mirror.name = `eyes.mirror.${key}`;
    mirror.scale.x = side;
    joint.add(mirror);

    const frame = new THREE.Group();
    frame.name = `eyes.socketFrame.${key}`;
    frame.position.copy(C).sub(eyeJoint);
    frame.quaternion.copy(qF);
    mirror.add(frame);

    frame.add(ctx.mesh(bezelGeo, bezelMat, `eyes.socketBezel.${key}`));
    frame.add(ctx.mesh(cavityGeo, cavityMat, `eyes.socket.${key}`));
    const rim = ctx.mesh(rimGlowGeo, rimGlowMat, `eyes.rimGlow.${key}`);
    rim.renderOrder = 2;
    frame.add(rim);

    // lids hinge about F's x axis through E
    const upperPivot = new THREE.Group();
    upperPivot.name = `eyes.lidUpperPivot.${key}`;
    upperPivot.position.copy(E);
    const lowerPivot = new THREE.Group();
    lowerPivot.name = `eyes.lidLowerPivot.${key}`;
    lowerPivot.position.copy(E);
    frame.add(upperPivot, lowerPivot);
    upperPivot.add(ctx.mesh(upperLidGeo, upperLidMat, `eyes.lidUpper.${key}`));
    upperPivot.add(ctx.mesh(leafGeo, leafMat, `eyes.lidUpperLeaf.${key}`));
    upperPivot.add(ctx.mesh(upperBarGeo, ringMat, `eyes.lidUpperEdge.${key}`));
    lowerPivot.add(ctx.mesh(lowerLidGeo, lidMat, `eyes.lidLower.${key}`));
    lowerPivot.add(ctx.mesh(lowerBarGeo, ringMat, `eyes.lidLowerEdge.${key}`));
    lowerRibGeos.forEach((g, i) => lowerPivot.add(ctx.mesh(g, ringMat, `eyes.lidLowerRib${i}.${key}`)));

    // eyeball / lens (look pivot at E)
    const look = new THREE.Group();
    look.name = `eyes.lookPivot.${key}`;
    look.position.copy(E);
    frame.add(look);
    const ball = new THREE.Group();
    ball.name = `eyes.eyeball.${key}`;
    ball.rotation.z = -cut.rotation[2]; // undo the socket roll so the iris is upright
    look.add(ball);
    ball.add(ctx.mesh(ballGeo, ballMat, `eyes.ball.${key}`));
    ball.add(ctx.mesh(lensRingGeo, ringMat, `eyes.lensBezel.${key}`));
    ribGeos.forEach((g, i) => ball.add(ctx.mesh(g, bezelMat, `eyes.socketRib${i}.${key}`)));
    const lens = ctx.mesh(lensGeo, lensMat, `eyes.lens.${key}`);
    ball.add(lens);
    const halo = ctx.mesh(haloGeo, haloMat, `eyes.halo.${key}`);
    halo.renderOrder = 2;
    ball.add(halo);
    const light = new THREE.PointLight(0xff1808, LIGHT_I, 0.24, 2);
    light.name = `eyes.light.${key}`;
    light.position.set(0, 0, RL + 0.025);
    ball.add(light);

    // brow plate on its own joint
    const browSpace = ctx.space(`brow${key}`, 'local');
    const browMirror = new THREE.Group();
    browMirror.name = `eyes.browMirror.${key}`;
    browMirror.scale.x = side;
    browSpace.add(browMirror);
    const browPivot = new THREE.Group();
    browPivot.name = `eyes.browPivot.${key}`;
    browMirror.add(browPivot);
    browPivot.add(ctx.mesh(browGeo, browMat, `eyes.brow.${key}`));

    sides[key] = { side, upperPivot, lowerPivot, look, browPivot, light };
  }

  // ------------------------------------------------------------- animation
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const pose = (p, extra) => {
    const wink = p.wink || 0;
    for (const key of ['L', 'R']) {
      const s = sides[key];
      const blink = clamp01((p.blink || 0) + (key === 'L' ? Math.max(0, wink) : Math.max(0, -wink)) + extra.blink);
      const squint = clamp01(p.squint || 0);
      s.upperPivot.rotation.x = blink * BLINK_ANGLE + squint * 0.05;
      s.lowerPivot.rotation.x = -(squint * 0.1 + blink * 0.05);
      const lx = THREE.MathUtils.clamp((p.lookX || 0) + extra.lx, -1, 1);
      const ly = THREE.MathUtils.clamp((p.lookY || 0) + extra.ly, -1, 1);
      s.look.rotation.set(REST_PITCH - ly * LOOK_Y, REST_YAW + s.side * lx * LOOK_X, 0);
      const b = key === 'L' ? p.browL || 0 : p.browR || 0;
      const anger = p.browInner || 0;
      s.browPivot.position.y = b * 0.022 - anger * 0.008;
      s.browPivot.rotation.z = -b * 0.06 + anger * 0.11;
      s.light.intensity = LIGHT_I * (1 - blink * 0.85);
    }
    lensMat.uniforms.uPupil.value = p.pupil ?? 1;
  };
  const NO_EXTRA = { blink: 0, lx: 0, ly: 0 };

  const params = {
    glow: 1, flicker: true, pupil: 1, lookX: 0, lookY: 0, blink: 0, wink: 0, squint: 0,
    browL: 0, browR: 0, browInner: 0, idle: true,
  };
  return {
    params,
    paramSpec: {
      glow: { min: 0, max: 3, step: 0.01 },
      flicker: {},
      pupil: { min: 0.3, max: 2, step: 0.01 },
      lookX: { min: -1, max: 1, step: 0.01 },
      lookY: { min: -1, max: 1, step: 0.01 },
      blink: { min: 0, max: 1, step: 0.01 },
      wink: { min: -1, max: 1, step: 0.01 },
      squint: { min: 0, max: 1, step: 0.01 },
      browL: { min: -1, max: 1, step: 0.01 },
      browR: { min: -1, max: 1, step: 0.01 },
      browInner: { min: -1, max: 1, step: 0.01 },
      idle: {},
    },
    apply(p) {
      pose(p, NO_EXTRA);
      M.setGlow(p.glow);
    },
    update(t, dt, p) {
      const f = p.flicker ? 1 + Math.sin(t * 7.3) * 0.03 + Math.sin(t * 23.1) * 0.015 * (Math.sin(t * 0.7) > 0.6 ? 1 : 0) : 1;
      M.setGlow(p.glow * f);
      if (!p.idle) return;
      // auto blink every ~5.5 s (zero at t = 0 so captures are deterministic)
      const ph = (t % 5.5) - 5.2;
      const blink = ph > 0 ? Math.sin((ph / 0.3) * Math.PI) : 0;
      // tiny saccades
      const lx = Math.sin(t * 0.61) * 0.08 + Math.sin(t * 1.7) * 0.03;
      const ly = Math.sin(t * 0.47 + 1.0) * 0.05 - Math.sin(1.0) * 0.05;
      pose(p, { blink: Math.max(0, blink), lx, ly });
    },
  };
}
