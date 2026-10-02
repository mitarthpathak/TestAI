/**
 * PART: eyes — everything inside the eye sockets.
 * Joints: eyeL / eyeR. Authoring: socket cavity + rim in HEAD space, lens and
 * lids in the eye joint's LOCAL space.
 *
 *  - eyes.cavity.{L,R}        dark funnel behind the faceplate socket frame
 *  - eyes.rim.{L,R}           polished inner socket rim, eyes.rimGlow.{L,R} red-lit lower lip
 *  - eyes.stepFrame.{L,R}     stepped almond terraces descending into the socket
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

// Eye-socket opening (shared with eyes.js — keep in sync). Almond outline in
// eye-local units (o = outward from the nose, v = up), measured from the face
// close-up: outer corner raised, inner corner drawn down toward the nose.
const SOCKET_PTS = [
  [0.165, 0.045], [0.1, 0.076], [0.02, 0.072], [-0.08, 0.047], [-0.16, 0.012],
  [-0.205, -0.05], [-0.175, -0.112], [-0.085, -0.122], [0.02, -0.08], [0.11, -0.015],
];
const SOCKET_SCALE = 1.0;
let _lut = null;
function socketLUT() {
  if (_lut) return _lut;
  const P = SOCKET_PTS, n = P.length, dense = [];
  const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let j = 0; j < 48; j++) {
      const t = j / 48;
      dense.push([cr(p0[0], p1[0], p2[0], p3[0], t), cr(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[cum.length - 1], N = 720, out = [];
  let k = 0;
  for (let i = 0; i < N; i++) {
    const L = (i / N) * total;
    while (cum[k + 1] < L) k++;
    const f = (L - cum[k]) / Math.max(1e-9, cum[k + 1] - cum[k]);
    const a = dense[k], b = dense[(k + 1) % dense.length];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  _lut = out;
  return out;
}
/** Socket outline point: t in [0, 2PI) (0 = outer corner, then over the top), k = radial scale. */
function socketPoint(anatomy, side, t, k = 1) {
  const L = socketLUT(), N = L.length;
  let f = ((t / (2 * Math.PI)) % 1 + 1) % 1 * N;
  const i = Math.floor(f) % N, j = (i + 1) % N;
  f -= Math.floor(f);
  const o = (L[i][0] + (L[j][0] - L[i][0]) * f) * SOCKET_SCALE * k;
  const v = (L[i][1] + (L[j][1] - L[i][1]) * f) * SOCKET_SCALE * k;
  const e = anatomy.LANDMARKS.eyeL;
  return [side * (e[0] + o), e[1] + v];
}

const LENS_R = 0.058;      // small ringed disc, half hidden by the lids (face close-up)
const LENS_Z = 0.012;      // lens in front of the eye joint (local z)
const LID_C = -0.075;      // lid hinge axis behind the eye joint (local z)
const LID_R = 0.118;       // lid shell radius about the hinge
const LID_TH = 0.009;
const LOOK_C = -0.07;      // gaze pivot behind the lens
const UP_C = 0.26;         // upper lid edge angle at the centre of the arch (rad, + up)
const LO_C = -0.44;        // lower lid edge angle at the centre of the sag
const MEET = -0.06;        // where the lids meet on a blink
const LOOK_X = 0.2, LOOK_Y = 0.12;
const LIGHT_I = 0.01;

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
  // face close-up: pink-red disc with a hot white-pink outer rim, concentric
  // red rings, tick marks and a small white "pupil" ring near the top
  vec3 deep = vec3(0.9, -0.09, -0.075);
  vec3 red = vec3(3.4, -0.4, -0.28);
  vec3 pink = vec3(4.2, 0.25, 0.32);
  vec3 white = vec3(13.0, 5.2, 5.0);
  vec3 col = mix(red, pink, smoothstep(0.45, 0.8, r));
  // concentric darker red rings
  float d = ring(r, 0.3, 0.03, aa) * 0.6;
  d = max(d, ring(r, 0.56, 0.035, aa) * 0.7);
  d = max(d, ring(r, 0.74, 0.02, aa) * 0.55);
  // radial ticks in the band between the rings
  float seg = abs(fract(a / (2.0 * PI) * 18.0 + 0.25) - 0.5);
  float tick = (1.0 - smoothstep(0.06, 0.1, seg)) * smoothstep(0.6, 0.63, r) * (1.0 - smoothstep(0.7, 0.73, r));
  d = max(d, tick * 0.8);
  col *= 1.0 - d;
  // hot white-pink outer rim
  col = mix(col, white, ring(r, 0.85, 0.085, aa));
  // small white pupil ring near the top centre
  vec2 q = (p - vec2(0.0, 0.14)) / max(0.3, uPupil);
  float qr = length(q);
  col = mix(col, white, 1.0 - smoothstep(0.17 - aa, 0.17 + aa, qr));
  col = mix(col, red * 0.5, ring(qr, 0.22, 0.035, aa));
  col = mix(col, deep, smoothstep(0.95, 1.0, r));
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
  const lidMat = M.get('gunmetal', { panel: 16, seed: 43, lineWidth: 0.002, roughness: 0.3, color: 0x5c626a, side: THREE.DoubleSide });
  const leafMat = M.get('gunmetal', { panel: 14, seed: 47, lineWidth: 0.002, roughness: 0.3, side: THREE.DoubleSide });
  const edgeMat = M.get('gunmetal', { roughness: 0.28, color: 0x6a7078 });
  const ringMat = M.get('darkMetal', { roughness: 0.26, metalness: 1.0 });
  const cavityMat = M.get('cavity', { side: THREE.DoubleSide, color: 0x040405, roughness: 0.85 });
  const rimMat = M.get('gunmetal', { roughness: 0.22 });
  const stepMat = M.get('gunmetal', { roughness: 0.26, color: 0x4a5058, side: THREE.DoubleSide });
  const rimGlowMat = M.get('redAccent', { intensity: 3.0 });

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
    uniforms: { uGain: { value: gain }, uColor: { value: V(0.22, -0.03, -0.025) }, uR0: { value: LENS_R * 1.0 }, uR1: { value: LENS_R * 1.3 } },
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
  // CURVED lid edges (face close-up): the upper edge arches over the iris
  // (almond), peaking a little toward the outer corner; the lower edge sags.
  // u = outward coordinate (-1 inner corner .. +1 outer corner).
  const thUp = (u) => UP_C - 0.27 * (u - 0.18) * (u - 0.18) + 0.05 * u;
  const thLo = (u) => LO_C + 0.34 * u * u - 0.03 * u;
  /** thick lid shell between theta edge(x) and a fixed far angle, swept across x */
  const lidShell = (side, edgeFn, far, r0, r1, x0 = -W, x1 = W, nx = 28, nt = 12) => {
    const pos = [], uv = [], idx = [];
    const rows = [];
    const at = (x, th, r) => [x, r * Math.sin(th), r * Math.cos(th)];
    // grid: outer surface (r1) then inner (r0); i = x, j = theta (edge -> far)
    for (const r of [r1, r0]) {
      for (let i = 0; i <= nx; i++) {
        const x = x0 + ((x1 - x0) * i) / nx;
        const e = edgeFn((side * x) / W);
        for (let j = 0; j <= nt; j++) {
          const f = typeof far === 'function' ? far((side * x) / W) : far;
          const th = e + ((f - e) * j) / nt;
          pos.push(...at(x, th, r));
          uv.push(x * 1.0, th * r);
        }
      }
    }
    const G = (k, i, j) => k * (nx + 1) * (nt + 1) + i * (nt + 1) + j;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nt; j++) {
      idx.push(G(0, i, j), G(0, i + 1, j), G(0, i, j + 1), G(0, i + 1, j), G(0, i + 1, j + 1), G(0, i, j + 1));
      idx.push(G(1, i, j), G(1, i, j + 1), G(1, i + 1, j), G(1, i + 1, j), G(1, i, j + 1), G(1, i + 1, j + 1));
    }
    // edge wall (j = 0) joining outer and inner
    for (let i = 0; i < nx; i++) idx.push(G(0, i, 0), G(1, i, 0), G(0, i + 1, 0), G(0, i + 1, 0), G(1, i, 0), G(1, i + 1, 0));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  };
  /** rod following a curved lid edge: theta = edgeFn(u) + d at radius r */
  const edgeRod = (side, edgeFn, d, r, rad, x0 = -W + 0.01, x1 = W - 0.01) => {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const x = x0 + ((x1 - x0) * i) / 24;
      const th = edgeFn((side * x) / W) + d;
      pts.push(V(x, r * Math.sin(th), r * Math.cos(th)));
    }
    return geo.sweptSection(new THREE.CatmullRomCurve3(pts), geo.roundedSection(rad, rad, 2, 10), { steps: 40, up: V(0, 0, 1) });
  };
  const lidGeos = (side) => ({
    upper: lidShell(side, thUp, 1.45, LID_R - LID_TH, LID_R),
    leaf: lidShell(side, (u) => thUp(u) + 0.13, (u) => thUp(u) + 0.42, LID_R, LID_R + 0.005, -0.15, 0.17, 18, 2),
    lower: lidShell(side, thLo, -1.4, LID_R - LID_TH - 0.004, LID_R - 0.004),
    upperEdge: edgeRod(side, thUp, 0.03, LID_R - LID_TH * 0.5, 0.0058),
    lowerEdge: edgeRod(side, thLo, -0.03, LID_R - 0.004 - LID_TH * 0.5, 0.0052),
    lowerRibs: [-0.16, -0.32, -0.48].map((d, i) => edgeRod(side, thLo, d, LID_R - 0.002 - (i ? 0.0015 : 0), i ? 0.0024 : 0.0032, -W + 0.04 + i * 0.01, W - 0.04 - i * 0.01)),
    upperRibs: [0.2, 0.36, 0.55].map((d, i) => edgeRod(side, thUp, d, LID_R + 0.0005, 0.0026, -W + 0.03 + i * 0.02, W - 0.03 - i * 0.015)),
  });

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
    // stepped almond frames descending into the socket (model-side sculpt):
    // two polished terraces, then the dark funnel
    const steps = [
      loopAt(1.02, (x, y) => surfZ(x, y) - 0.026),
      loopAt(0.995, (x, y) => surfZ(x, y) - 0.028),
      loopAt(0.993, (x, y) => surfZ(x, y) - 0.044),
      loopAt(0.968, (x, y) => surfZ(x, y) - 0.046),
      loopAt(0.966, (x, y) => surfZ(x, y) - 0.062),
    ];
    hs.add(ctx.mesh(loftLoops(THREE, steps), stepMat, `eyes.stepFrame.${key}`));
    const rows = [
      loopAt(0.966, (x, y) => surfZ(x, y) - 0.062),
      loopAt(0.9, () => eye[2] - 0.035),
      loopAt(0.72, () => eye[2] - 0.08),
      loopAt(0.4, () => eye[2] - 0.105),
      loopAt(0.04, () => eye[2] - 0.115),
    ];
    hs.add(ctx.mesh(loftLoops(THREE, rows), cavityMat, `eyes.cavity.${key}`));
    {
      const ring = loopAt(0.97, (x, y) => surfZ(x, y) - 0.047);
      const g = geo.sweptSection(new THREE.CatmullRomCurve3(ring, true), geo.roundedSection(0.0055, 0.0055, 2, 10), { steps: 160, up: V(0, 0, 1), caps: false });
      hs.add(ctx.mesh(g, rimMat, `eyes.rim.${key}`));
      // red-lit lower lip of the socket (poster)
      const low = [];
      for (let i = 0; i <= 40; i++) {
        const t = Math.PI * 2 * (0.36 + 0.52 * (i / 40)); // inner-top -> inner corner -> bottom
        const [x, y] = socketPoint(A, side, t, 0.995);
        low.push(V(x, y, surfZ(x, y) - 0.022));
      }
      const gg = geo.sweptSection(new THREE.CatmullRomCurve3(low), geo.roundedSection(0.007, 0.007, 2, 8), {
        steps: 80, up: V(0, 0, 1), scale: (t) => Math.min(1, t * 5, (1 - t) * 5),
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
    lidFrame.rotation.z = side * A.LANDMARKS.socketTilt * 0.5; // lid line follows the slanted socket
    frame.add(lidFrame);
    const upperPivot = new THREE.Group();
    upperPivot.name = `eyes.lidUpperPivot.${key}`;
    upperPivot.position.set(0, 0, LID_C);
    const lowerPivot = new THREE.Group();
    lowerPivot.name = `eyes.lidLowerPivot.${key}`;
    lowerPivot.position.set(0, 0, LID_C);
    lidFrame.add(upperPivot, lowerPivot);
    const LG = lidGeos(side);
    upperPivot.add(ctx.mesh(LG.upper, lidMat, `eyes.lidUpper.${key}`));
    upperPivot.add(ctx.mesh(LG.leaf, leafMat, `eyes.lidUpperLeaf.${key}`));
    upperPivot.add(ctx.mesh(LG.upperEdge, edgeMat, `eyes.lidUpperEdge.${key}`));
    lowerPivot.add(ctx.mesh(LG.lower, lidMat, `eyes.lidLower.${key}`));
    lowerPivot.add(ctx.mesh(LG.lowerEdge, edgeMat, `eyes.lidLowerEdge.${key}`));
    LG.lowerRibs.forEach((g, i) => lowerPivot.add(ctx.mesh(g, ringMat, i ? `eyes.lidLowerRib${i}.${key}` : `eyes.lidLowerRib.${key}`)));
    LG.upperRibs.forEach((g, i) => upperPivot.add(ctx.mesh(g, ringMat, `eyes.lidUpperRib${i}.${key}`)));

    const look = new THREE.Group();
    look.name = `eyes.lookPivot.${key}`;
    look.position.set(0, 0, LOOK_C);
    frame.add(look);
    const iris = new THREE.Group();
    iris.name = `eyes.iris.${key}`;
    iris.position.set(0, 0, LENS_Z - LOOK_C);
    iris.scale.set(1.0, 0.94, 1); // round disc; the lids crop it to a slit
    look.add(iris);
    iris.add(ctx.mesh(bezelGeo, ringMat, `eyes.lensBezel.${key}`));
    const lens = ctx.mesh(lensGeo, lensMat, `eyes.lens.${key}`);
    lens.position.z = 0.0005;
    iris.add(lens);
    const halo = ctx.mesh(haloGeo, haloMat, `eyes.halo.${key}`);
    halo.position.z = 0.003;
    halo.renderOrder = 2;
    iris.add(halo);
    const light = new THREE.PointLight(0xff1808, LIGHT_I, 0.2, 2);
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
      // centre of the curved edges travels to MEET on a blink
      const up = UP_C - squint * 0.18;
      const lo = LO_C + squint * 0.22;
      s.upperPivot.rotation.x = (UP_C - (up + (MEET - up) * blink));
      s.lowerPivot.rotation.x = -((lo + (MEET - 0.01 - lo) * blink) - LO_C);
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
