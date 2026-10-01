/**
 * PART: eyes — everything inside the eye sockets.
 * Joints: eyeL / eyeR. Authoring: socket cavity + rim in HEAD space, lens and
 * lids in the eye joint's LOCAL space.
 *
 *  - eyes.cavity.{L,R}        dark funnel behind the faceplate socket frame
 *  - eyes.rim.{L,R}           polished inner socket rim, eyes.rimGlow.{L,R} red-lit lower lip
 *  - eyes.lookPivot.{L,R}     gaze pivot (lookX / lookY), carries:
 *      eyes.lens.{L,R}        HDR iris: white-hot core, red ring, dark concentric
 *                             ring structure + radial slits (poster close-up)
 *      eyes.lensBezel.{L,R}   stepped dark rings around the lens, eyes.halo.{L,R}
 *  - eyes.lidUpperPivot.{L,R} / eyes.lidLowerPivot.{L,R}  shutter hinges (rolled
 *    with the socket tilt) carrying eyes.lidUpper / lidUpperLeaf / lidUpperEdge
 *    and eyes.lidLower / lidLowerEdge
 *
 * The lens is the only bloom source: only its core crosses the bloom
 * threshold, so the glow stays tight. Colours use slightly negative G/B so
 * they survive AgX tone mapping as saturated red.
 *
 * Params: glow, flicker, pupil, lookX, lookY, blink, wink, squint, idle.
 */
export const meta = {
  id: 'eyes',
  explode: [0, 0.1, 1.4],
};

// Eye-socket opening — same outline as faceplate.js (keep in sync).
const SOCKET = { a: 0.17, bTop: 0.078, bBot: 0.09, n: 2.6 };
function socketPoint(anatomy, side, t, k = 1) {
  const L = anatomy.LANDMARKS;
  const c = Math.cos(t), s = Math.sin(t);
  const e = 2 / SOCKET.n;
  const lx = SOCKET.a * k * Math.sign(c) * Math.pow(Math.abs(c), e);
  const ly = (s >= 0 ? SOCKET.bTop : SOCKET.bBot) * k * Math.sign(s) * Math.pow(Math.abs(s), e);
  const th = side * L.socketTilt;
  const ex = L.eyeL[0] * side, ey = L.eyeL[1];
  return [ex + lx * Math.cos(th) - ly * Math.sin(th), ey + lx * Math.sin(th) + ly * Math.cos(th)];
}

const LENS_R = 0.06;       // LANDMARKS.eyeRadius
const LENS_Z = 0.012;      // lens in front of the eye joint (local z)
const LID_C = -0.075;      // lid hinge axis behind the eye joint (local z)
const LID_R = 0.118;       // lid shell radius about the hinge
const LID_TH = 0.009;
const LOOK_C = -0.07;      // gaze pivot behind the lens
const UP_REST = 0.47;      // upper lid edge angle at rest (rad, + up)
const LO_REST = -0.56;     // lower lid edge angle at rest
const MEET = -0.06;        // where the lids meet on a blink
const LOOK_X = 0.2, LOOK_Y = 0.12;
const LIGHT_I = 0.03;

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
varying vec2 vP;
#define PI 3.14159265
float ring(float r, float c, float w, float aa) { return 1.0 - smoothstep(w - aa, w + aa, abs(r - c)); }
void main() {
  vec2 p = vP / uR;
  float r = length(p);
  float a = atan(p.y, p.x);
  float aa = fwidth(r) * 0.75 + 1e-4;
  float pr = r / max(0.3, uPupil);
  // base layers, outside -> in
  vec3 deep = vec3(0.75, -0.09, -0.075);
  vec3 red = vec3(3.8, -0.5, -0.42);
  vec3 orange = vec3(11.0, 0.35, -0.12);
  vec3 hot = vec3(26.0, 6.5, 2.2);
  vec3 col = deep;
  col = mix(col, red, 1.0 - smoothstep(0.66 - aa, 0.66 + aa, pr));
  // radial slits in the red ring (segmented arcs)
  float seg = abs(fract(a / (2.0 * PI) * 14.0 + 0.25) - 0.5);
  float slit = (1.0 - smoothstep(0.05, 0.09, seg)) * smoothstep(0.3, 0.34, pr) * (1.0 - smoothstep(0.54, 0.58, pr));
  col *= 1.0 - 0.75 * slit;
  col = mix(col, orange, 1.0 - smoothstep(0.27 - aa, 0.27 + aa, pr));
  col = mix(col, hot, 1.0 - smoothstep(0.1, 0.25, pr));
  // dark concentric rings (lens / aperture structure)
  float d = ring(pr, 0.29, 0.018, aa);
  d = max(d, ring(r, 0.62, 0.028, aa));
  d = max(d, ring(r, 0.74, 0.012, aa) * 0.7);
  d = max(d, ring(r, 0.84, 0.01, aa) * 0.6);
  d = max(d, smoothstep(0.9, 0.99, r));
  col *= 1.0 - 0.88 * d;
  // tiny cover-glass glint
  float gl = exp(-dot(p - vec2(-0.32, 0.4), p - vec2(-0.32, 0.4)) * 90.0);
  col += vec3(1.4, 1.0, 0.9) * gl;
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
  float k = (1.0 - smoothstep(uR0, uR1, r)) * smoothstep(uR0 * 0.95, uR0 * 1.02, r);
  gl_FragColor = vec4(uColor * uGain * k * k, 1.0);
}`;

export function build(ctx) {
  const { THREE, geo, anatomy: A, materials: M } = ctx;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const surfZ = (x, y) => A.headFrontZ(x, y) ?? 0.5;

  // ------------------------------------------------------------ materials
  const lidMat = M.get('darkMetal', { panel: 16, seed: 43, lineWidth: 0.002, roughness: 0.34, color: 0x26292e, side: THREE.DoubleSide });
  const leafMat = M.get('gunmetal', { panel: 14, seed: 47, lineWidth: 0.002, roughness: 0.3, side: THREE.DoubleSide });
  const edgeMat = M.get('chrome', { roughness: 0.2 });
  const ringMat = M.get('darkMetal', { roughness: 0.26, metalness: 1.0 });
  const cavityMat = M.get('cavity', { side: THREE.DoubleSide, color: 0x040405, roughness: 0.85 });
  const rimMat = M.get('gunmetal', { roughness: 0.22 });
  const rimGlowMat = M.get('redAccent', { intensity: 1.5 });

  const gain = new THREE.Color(1, 1, 1);
  const registerGlow = (mat) => {
    mat.color = gain; // M.setGlow copies baseColor * k into .color (shared gain)
    mat.userData.baseColor = new THREE.Color(1, 1, 1);
    if (M.all && typeof M.all.add === 'function') M.all.add(mat);
    return mat;
  };
  const lensMat = registerGlow(new THREE.ShaderMaterial({
    name: 'eyes.lens',
    uniforms: { uGain: { value: gain }, uR: { value: LENS_R }, uPupil: { value: 1 } },
    vertexShader: LENS_VERT,
    fragmentShader: LENS_FRAG,
  }));
  const haloMat = registerGlow(new THREE.ShaderMaterial({
    name: 'eyes.halo',
    uniforms: { uGain: { value: gain }, uColor: { value: V(0.45, -0.06, -0.05) }, uR0: { value: LENS_R * 1.0 }, uR1: { value: LENS_R * 1.3 } },
    vertexShader: LENS_VERT,
    fragmentShader: HALO_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));

  // ------------------------------------------------------ shared lens geometry
  const lensGeo = new THREE.CircleGeometry(LENS_R, 72);
  const haloGeo = new THREE.RingGeometry(LENS_R * 0.98, LENS_R * 1.6, 72, 1);
  const LR = LENS_R;
  const bezelGeo = geo.ringStack([
    [LR * 0.99, -0.002], [LR + 0.002, 0.004], [LR + 0.007, 0.004], [LR + 0.009, -0.001], [LR + 0.016, -0.001],
    [LR + 0.018, 0.003], [LR + 0.024, 0.003], [LR + 0.026, -0.004], [LR + 0.036, -0.008], [LR + 0.04, -0.03],
  ], 72);

  // lid shells: annular sectors about the hinge (local x axis), swept along x
  const lidSection = (th0, th1, r0, r1, n = 14) => {
    const pts = [];
    for (let i = 0; i <= n; i++) { const th = th0 + ((th1 - th0) * i) / n; pts.push([r1 * Math.cos(th), r1 * Math.sin(th)]); }
    for (let i = n; i >= 0; i--) { const th = th0 + ((th1 - th0) * i) / n; pts.push([r0 * Math.cos(th), r0 * Math.sin(th)]); }
    return pts;
  };
  const W = 0.205;
  const xLine = (x0, x1, y = 0, z = 0) => new THREE.LineCurve3(V(x0, y, z), V(x1, y, z));
  const sweep = (sec, x0 = -W, x1 = W) => geo.sweptSection(xLine(x0, x1), sec, { steps: 2, up: V(0, 1, 0), creaseAngle: THREE.MathUtils.degToRad(35) });
  const upperLidGeo = sweep(lidSection(UP_REST, 1.45, LID_R - LID_TH, LID_R));
  const leafGeo = sweep(lidSection(UP_REST + 0.13, UP_REST + 0.42, LID_R, LID_R + 0.005, 8), -0.15, 0.17);
  const lowerLidGeo = sweep(lidSection(-1.4, LO_REST, LID_R - LID_TH - 0.004, LID_R - 0.004));
  const rod = (th, r, rad, x0 = -W + 0.01, x1 = W - 0.01) =>
    geo.sweptSection(xLine(x0, x1, r * Math.sin(th), r * Math.cos(th)), geo.roundedSection(rad, rad, 2, 10), { steps: 2, up: V(0, 1, 0) });
  const upperEdgeGeo = rod(UP_REST + 0.03, LID_R - LID_TH * 0.5, 0.0058);
  const lowerEdgeGeo = rod(LO_REST - 0.03, LID_R - 0.004 - LID_TH * 0.5, 0.0052);
  const lowerRibGeo = rod(LO_REST - 0.16, LID_R - 0.002, 0.0032, -W + 0.04, W - 0.04);

  // ------------------------------------------------------------- assemble
  const sides = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const eye = A.LANDMARKS[`eye${key}`];

    // socket cavity + rim in head space (outline loops)
    const hs = ctx.space(`eye${key}`, 'head');
    const NS = 96;
    const loopAt = (k, zf) => {
      const pts = [];
      for (let i = 0; i < NS; i++) {
        const [x, y] = socketPoint(A, side, (i / NS) * Math.PI * 2, k);
        pts.push(V(x, y, zf(x, y)));
      }
      return pts;
    };
    const rows = [
      loopAt(1.02, (x, y) => surfZ(x, y) - 0.03),
      loopAt(0.965, (x, y) => surfZ(x, y) - 0.062),
      loopAt(0.9, () => eye[2] - 0.035),
      loopAt(0.72, () => eye[2] - 0.08),
      loopAt(0.4, () => eye[2] - 0.105),
      loopAt(0.04, () => eye[2] - 0.115),
    ];
    hs.add(ctx.mesh(loftLoops(THREE, rows), cavityMat, `eyes.cavity.${key}`));
    {
      const ring = loopAt(0.968, (x, y) => surfZ(x, y) - 0.054);
      const g = geo.sweptSection(new THREE.CatmullRomCurve3(ring, true), geo.roundedSection(0.0055, 0.0055, 2, 10), { steps: 160, up: V(0, 0, 1), caps: false });
      hs.add(ctx.mesh(g, rimMat, `eyes.rim.${key}`));
      // red-lit lower lip of the socket (poster)
      const low = [];
      for (let i = 0; i <= 40; i++) {
        const t = Math.PI * (1.08 + 0.84 * (i / 40));
        const [x, y] = socketPoint(A, side, t, 0.955);
        low.push(V(x, y, surfZ(x, y) - 0.06));
      }
      const gg = geo.sweptSection(new THREE.CatmullRomCurve3(low), geo.roundedSection(0.0028, 0.0028, 2, 8), {
        steps: 60, up: V(0, 0, 1), scale: (t) => Math.min(1, t * 5, (1 - t) * 5),
      });
      hs.add(ctx.mesh(gg, rimGlowMat, `eyes.rimGlow.${key}`));
    }

    // lens + lids in the eye joint's local space
    const local = ctx.space(`eye${key}`, 'local');
    const frame = new THREE.Group();
    frame.name = `eyes.frame.${key}`;
    frame.rotation.y = side * 0.14; // sockets face slightly outward
    local.add(frame);

    const lidFrame = new THREE.Group();
    lidFrame.name = `eyes.lidFrame.${key}`;
    lidFrame.rotation.z = side * A.LANDMARKS.socketTilt; // lid line follows the slanted socket
    frame.add(lidFrame);
    const upperPivot = new THREE.Group();
    upperPivot.name = `eyes.lidUpperPivot.${key}`;
    upperPivot.position.set(0, 0, LID_C);
    const lowerPivot = new THREE.Group();
    lowerPivot.name = `eyes.lidLowerPivot.${key}`;
    lowerPivot.position.set(0, 0, LID_C);
    lidFrame.add(upperPivot, lowerPivot);
    upperPivot.add(ctx.mesh(upperLidGeo, lidMat, `eyes.lidUpper.${key}`));
    upperPivot.add(ctx.mesh(leafGeo, leafMat, `eyes.lidUpperLeaf.${key}`));
    upperPivot.add(ctx.mesh(upperEdgeGeo, edgeMat, `eyes.lidUpperEdge.${key}`));
    lowerPivot.add(ctx.mesh(lowerLidGeo, lidMat, `eyes.lidLower.${key}`));
    lowerPivot.add(ctx.mesh(lowerEdgeGeo, edgeMat, `eyes.lidLowerEdge.${key}`));
    lowerPivot.add(ctx.mesh(lowerRibGeo, ringMat, `eyes.lidLowerRib.${key}`));

    const look = new THREE.Group();
    look.name = `eyes.lookPivot.${key}`;
    look.position.set(0, 0, LOOK_C);
    frame.add(look);
    const iris = new THREE.Group();
    iris.name = `eyes.iris.${key}`;
    iris.position.set(0, 0, LENS_Z - LOOK_C);
    look.add(iris);
    iris.add(ctx.mesh(bezelGeo, ringMat, `eyes.lensBezel.${key}`));
    const lens = ctx.mesh(lensGeo, lensMat, `eyes.lens.${key}`);
    lens.position.z = 0.0005;
    iris.add(lens);
    const halo = ctx.mesh(haloGeo, haloMat, `eyes.halo.${key}`);
    halo.position.z = 0.003;
    halo.renderOrder = 2;
    iris.add(halo);
    const light = new THREE.PointLight(0xff1808, LIGHT_I, 0.3, 2);
    light.name = `eyes.light.${key}`;
    light.position.set(0, 0, 0.03);
    iris.add(light);

    sides[key] = { side, upperPivot, lowerPivot, look, light };
  }

  // ------------------------------------------------------------- animation
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const pose = (p, extra) => {
    const wink = p.wink || 0;
    for (const key of ['L', 'R']) {
      const s = sides[key];
      const blink = clamp01((p.blink || 0) + (key === 'L' ? Math.max(0, wink) : Math.max(0, -wink)) + extra.blink);
      const squint = clamp01(p.squint || 0);
      // rotation.x > 0 tips +z toward -y: the upper lid swings down
      const up = UP_REST - squint * 0.18;
      const lo = LO_REST + squint * 0.22;
      s.upperPivot.rotation.x = (UP_REST - (up + (MEET - up) * blink));
      s.lowerPivot.rotation.x = -((lo + (MEET - 0.01 - lo) * blink) - LO_REST);
      const lx = THREE.MathUtils.clamp((p.lookX || 0) + extra.lx, -1, 1);
      const ly = THREE.MathUtils.clamp((p.lookY || 0) + extra.ly, -1, 1);
      s.look.rotation.set(-ly * LOOK_Y, s.side * lx * LOOK_X, 0);
      s.light.intensity = LIGHT_I * (1 - blink * 0.85);
    }
    lensMat.uniforms.uPupil.value = p.pupil ?? 1;
  };
  const NO_EXTRA = { blink: 0, lx: 0, ly: 0 };

  const params = { glow: 1, flicker: true, pupil: 1, lookX: 0, lookY: 0, blink: 0, wink: 0, squint: 0, idle: true };
  return {
    params,
    paramSpec: {
      glow: { min: 0, max: 3, step: 0.01 },
      flicker: {},
      pupil: { min: 0.4, max: 1.8, step: 0.01 },
      lookX: { min: -1, max: 1, step: 0.01 },
      lookY: { min: -1, max: 1, step: 0.01 },
      blink: { min: 0, max: 1, step: 0.01 },
      wink: { min: -1, max: 1, step: 0.01 },
      squint: { min: 0, max: 1, step: 0.01 },
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
      const lx = Math.sin(t * 0.61) * 0.08 + Math.sin(t * 1.7) * 0.03;
      const ly = Math.sin(t * 0.47 + 1.0) * 0.05 - Math.sin(1.0) * 0.05;
      pose(p, { blink: Math.max(0, blink), lx, ly });
    },
  };
}

/** Loft through closed loops (rows[k][i] = Vector3). */
function loftLoops(THREE, rows) {
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
  return g;
}
