/**
 * ANATOMY — the shared coordinate contract for every Ultron part.
 *
 * OWNER: lead / integrator. Part sessions must NOT edit this file.
 * If a part needs a landmark moved, say so in your report instead.
 *
 * Conventions
 *  - Units are arbitrary "head units" (~ chin-to-crown = 2.3).
 *  - +Y is up, +Z is forward (the face looks down +Z), +X is the MODEL'S LEFT
 *    (the viewer's right when looking at the face).
 *  - Two authoring spaces:
 *      BODY space: origin at the centre of the collar line (sternal notch).
 *                  Used by `neck` and `collar`.
 *      HEAD space: origin at the head joint (atlas, top of the neck).
 *                  Used by every face / skull part.
 *    `ctx.space(jointName)` hands a part a Group in which it can author in
 *    the joint's space while still being driven by that joint's rotation.
 */
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Joints. `pos` is expressed in the authoring space named by `space`.
// The rig converts these into a parent/child hierarchy of pivots.
// ---------------------------------------------------------------------------
export const JOINTS = {
  root:   { parent: null,    space: 'body', pos: [0, 0, 0] },
  chest:  { parent: 'root',  space: 'body', pos: [0, 0, 0] },
  neck:   { parent: 'chest', space: 'body', pos: [0, 0.35, -0.02] },
  head:   { parent: 'neck',  space: 'body', pos: [0, 1.3, -0.05] },   // == HEAD space origin
  jaw:    { parent: 'head',  space: 'head', pos: [0, 0.4, 0.04] },     // hinge axis = X
  eyeL:   { parent: 'head',  space: 'head', pos: [0.335, 0.93, 0.645] },
  eyeR:   { parent: 'head',  space: 'head', pos: [-0.335, 0.93, 0.645] },
  browL:  { parent: 'head',  space: 'head', pos: [0.33, 1.08, 0.68] },
  browR:  { parent: 'head',  space: 'head', pos: [-0.33, 1.08, 0.68] },
  cheekL: { parent: 'head',  space: 'head', pos: [0.47, 0.46, 0.55] },  // turbine hub (triangulated from 3 refs)
  cheekR: { parent: 'head',  space: 'head', pos: [-0.47, 0.46, 0.55] },
  finL:   { parent: 'head',  space: 'head', pos: [0.64, 1.6, -0.12] },
  finR:   { parent: 'head',  space: 'head', pos: [-0.64, 1.6, -0.12] },
  lipUpper: { parent: 'head', space: 'head', pos: [0, 0.27, 0.88] },
  lipLower: { parent: 'jaw',  space: 'head', pos: [0, 0.21, 0.86] },
};

// ---------------------------------------------------------------------------
// Key landmarks (HEAD space unless noted). Parts should derive placement
// from these rather than hard-coding numbers, so the face stays coherent.
//
// Proportions are measured from reference/ultron-front.png and the film
// frames (scripts/overlay.mjs aligns renders to them by the eyes). With
// E = eye spacing (0.67): crown 1.55E above the eyes, mouth 1.0E below,
// chin bottom ~1.85E below. Cheek-disc hubs were triangulated from the front,
// film and 3/4 references (residual < 0.03E): 0.7E below the eyes, 1.4E
// apart, recessed ~0.17 into the cheek just below / outside the eye.
// ---------------------------------------------------------------------------
export const LANDMARKS = {
  crownTop:     [0, 1.96, -0.12],
  chinBottom:   [0, -0.32, 0.6],
  chinButton:   [0, -0.14, 0.76],     // the round "button" on the front of the chin
  mouthCenter:  [0, 0.24, 0.88],      // mouth slit, on the forward muzzle
  mouthHalfWidth: 0.17,
  noseTip:      [0, 0.5, 0.9],        // bottom of the central nose plate (just above the upper lip)
  browCenter:   [0, 1.1, 0.77],
  noseRidgeTop: [0, 1.07, 0.77],     // nose board top; the cranium crest starts here at the brow
  eyeL:         JOINTS.eyeL.pos,
  eyeR:         JOINTS.eyeR.pos,
  eyeRadius:    0.068,                 // radius of the glowing iris disc
  socketRadii:  [0.17, 0.085, 0.12],   // eye socket ellipsoid (x, y, z)
  socketTilt:   0.3,                   // radians; outer corner raised (angry slant)
  cheekDiscL:   JOINTS.cheekL.pos,
  cheekDiscR:   JOINTS.cheekR.pos,
  cheekDiscRadius: 0.26,               // recessed turbine cavity; the rim rings reach ~0.4
  cheekDiscNormalL: [0.9, -0.06, 0.43], // disc faces mostly sideways (~60 deg off the face axis)
  jawHinge:     JOINTS.jaw.pos,
  templeL:      [0.74, 1.25, 0.2],
  templeR:      [-0.74, 1.25, 0.2],
  // Side blades ("fins"): centre line of the LEFT blade, HEAD space, root -> hook tip.
  // Stand-off C-shaped horns that frame the face in front view (outer edge
  // x~1.08), rooted on the upper cranium side, sweeping forward to a hook that
  // points inward at mouth-corner level. Mirror X for the right blade.
  finCurveL: [
    [0.64, 1.6, -0.12],
    [0.88, 1.38, -0.02],
    [1.03, 1.06, 0.1],
    [1.08, 0.72, 0.2],
    [1.01, 0.44, 0.3],
    [0.85, 0.25, 0.44],
    [0.64, 0.17, 0.6],
  ],
  // BODY space
  neckBase:     [0, 0.3, -0.02],
  neckTop:      [0, 1.3, -0.05],
  neckRadius:   0.75,   // outer edge of the side pillars (front ref: ~head width at eye level)
  trapeziusTop: [0.8, 1.29, -0.1], // trapezius crest beside the neck (mirror X)
  collarWidth:  1.9,    // half-span to the shoulder tip
  collarY:      0.45,   // shoulder-cap centre height
};

// ---------------------------------------------------------------------------
// Head shell profile. A stack of superellipse cross-sections (HEAD space).
//   y   : height of the section
//   w   : half width (X)
//   zf  : depth in front of the section centre (+Z)
//   zb  : depth behind the section centre (-Z)
//   n   : superellipse exponent (2 = ellipse, higher = boxier)
//   zc  : Z offset of the section centre
// Sampled with Catmull-Rom so the shell is smooth. This is the FINAL shape
// (FACE_WARP is off): an egg-shaped dome widest at eye / cheek level, a
// long skull behind, and a narrower forward muzzle + long chin below.
// ---------------------------------------------------------------------------
export const HEAD_PROFILE = [
  { y: -0.32, w: 0.14, zf: 0.1,  zb: 0.16, n: 2.2, zc: 0.5 },
  { y: -0.2,  w: 0.25, zf: 0.2,  zb: 0.3,  n: 2.4, zc: 0.52 },
  { y: 0.0,   w: 0.35, zf: 0.28, zb: 0.5,  n: 2.6, zc: 0.52 },
  { y: 0.24,  w: 0.46, zf: 0.38, zb: 0.72, n: 2.6, zc: 0.48 },
  { y: 0.47,  w: 0.62, zf: 0.52, zb: 0.86, n: 2.6, zc: 0.32 },
  { y: 0.72,  w: 0.72, zf: 0.62, zb: 0.95, n: 2.6, zc: 0.17 },
  { y: 0.95,  w: 0.75, zf: 0.64, zb: 1.0,  n: 2.5, zc: 0.08 },
  { y: 1.2,   w: 0.73, zf: 0.63, zb: 0.97, n: 2.4, zc: 0.03 },
  { y: 1.45,  w: 0.67, zf: 0.57, zb: 0.94, n: 2.3, zc: -0.01 },
  { y: 1.65,  w: 0.56, zf: 0.47, zb: 0.9,  n: 2.2, zc: -0.05 },
  { y: 1.8,   w: 0.43, zf: 0.35, zb: 0.72, n: 2.1, zc: -0.08 },
  { y: 1.9,   w: 0.27, zf: 0.21, zb: 0.47, n: 2.0, zc: -0.11 },
  { y: 1.96,  w: 0.0,  zf: 0.0,  zb: 0.0,  n: 2.0, zc: -0.12 },
];

const HEAD_Y_MIN = HEAD_PROFILE[0].y;
const HEAD_Y_MAX = HEAD_PROFILE[HEAD_PROFILE.length - 1].y;
export const HEAD_Y_RANGE = [HEAD_Y_MIN, HEAD_Y_MAX];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Interpolated cross-section at height y (HEAD space). */
export function headSection(y) {
  const P = HEAD_PROFILE;
  const yy = THREE.MathUtils.clamp(y, HEAD_Y_MIN, HEAD_Y_MAX);
  let i = 0;
  while (i < P.length - 2 && P[i + 1].y < yy) i++;
  const a = P[Math.max(0, i - 1)];
  const b = P[i];
  const c = P[i + 1];
  const d = P[Math.min(P.length - 1, i + 2)];
  const t = (yy - b.y) / (c.y - b.y || 1);
  const out = { y: yy };
  for (const k of ['w', 'zf', 'zb', 'n', 'zc']) {
    out[k] = catmull(a[k], b[k], c[k], d[k], t);
  }
  out.w = Math.max(0, out.w);
  out.zf = Math.max(0, out.zf);
  out.zb = Math.max(0, out.zb);
  return out;
}

const sgnPow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

/**
 * Point on the head shell. `u` is the angle around the head:
 *   u = 0 -> front centre (+Z), u = +PI/2 -> model's left (+X), u = +-PI -> back.
 */
export function headSurface(u, y, target = new THREE.Vector3()) {
  const s = headSection(y);
  const e = 2 / s.n;
  const su = Math.sin(u);
  const cu = Math.cos(u);
  const d = cu >= 0 ? s.zf : s.zb;
  return target.set(s.w * sgnPow(su, e), y, s.zc + d * sgnPow(cu, e));
}

/** Outward unit normal of the head shell at (u, y), by finite differences. */
export function headNormal(u, y, target = new THREE.Vector3()) {
  const h = 1e-3;
  const p0 = headSurface(u - h, y, new THREE.Vector3());
  const p1 = headSurface(u + h, y, new THREE.Vector3());
  const q0 = headSurface(u, y - h, new THREE.Vector3());
  const q1 = headSurface(u, y + h, new THREE.Vector3());
  const du = p1.sub(p0);
  const dv = q1.sub(q0);
  target.crossVectors(du, dv).normalize();
  // make sure it points away from the head axis
  const c = headSurface(u, y, new THREE.Vector3());
  const s = headSection(y);
  const radial = new THREE.Vector3(c.x, 0, c.z - s.zc);
  if (radial.lengthSq() > 1e-8 && target.dot(radial) < 0) target.negate();
  return target;
}

/**
 * Front surface depth at (x, y): solves the superellipse for z on the FRONT
 * half. Returns null when x is outside the section.
 */
export function headFrontZ(x, y) {
  const s = headSection(y);
  if (Math.abs(x) >= s.w) return null;
  const t = Math.pow(1 - Math.pow(Math.abs(x) / s.w, s.n), 1 / s.n);
  return s.zc + s.zf * t;
}

/** Angle `u` on the front half that corresponds to a given x at height y. */
export function headAngleForX(x, y) {
  const s = headSection(y);
  const r = THREE.MathUtils.clamp(x / (s.w || 1), -1, 1);
  // x = w * sgn(sin u) |sin u|^(2/n)  =>  |sin u| = |r|^(n/2)
  return Math.asin(Math.sign(r) * Math.pow(Math.abs(r), s.n / 2));
}

export const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
export const mirrorX = (a) => [-a[0], a[1], a[2]];

// ---------------------------------------------------------------------------
// CUTOUTS — volumes that shell / plate parts must keep clear so recessed
// features (eye sockets, cheek discs) are not buried. HEAD space.
//   ellipsoid: { center, radii, rotation (Euler XYZ) }
//   cylinder : { center, axis, radius, halfLength }
// Use geo.carve(geometry, names) for closed plates (CSG) and
// anatomy.insideCutout(point, names) to mask thin sheets.
// ---------------------------------------------------------------------------
const eyeCut = (side) => ({
  type: 'ellipsoid',
  center: [0.335 * side, 0.93, 0.76],
  radii: [LANDMARKS.socketRadii[0], LANDMARKS.socketRadii[1], 0.3],
  rotation: [0, side * 0.35, side * LANDMARKS.socketTilt],
});
const discCut = (side) => ({
  type: 'cylinder',
  center: [JOINTS.cheekL.pos[0] * side, JOINTS.cheekL.pos[1], JOINTS.cheekL.pos[2]],
  axis: [LANDMARKS.cheekDiscNormalL[0] * side, LANDMARKS.cheekDiscNormalL[1], LANDMARKS.cheekDiscNormalL[2]],
  radius: LANDMARKS.cheekDiscRadius * 1.04,
  halfLength: 0.3,
});
export const CUTOUTS = {
  eyeL: eyeCut(1),
  eyeR: eyeCut(-1),
  cheekL: discCut(1),
  cheekR: discCut(-1),
};

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _ax = new THREE.Vector3();
/** True if a HEAD-space point lies inside any of the named cutouts. */
export function insideCutout(point, names = Object.keys(CUTOUTS), pad = 0) {
  for (const name of names) {
    const c = CUTOUTS[name];
    _p.set(point.x - c.center[0], point.y - c.center[1], point.z - c.center[2]);
    if (c.type === 'ellipsoid') {
      _q.setFromEuler(_e.set(c.rotation[0], c.rotation[1], c.rotation[2])).invert();
      _p.applyQuaternion(_q);
      const r = c.radii;
      if ((_p.x / (r[0] + pad)) ** 2 + (_p.y / (r[1] + pad)) ** 2 + (_p.z / (r[2] + pad)) ** 2 < 1) return true;
    } else {
      _ax.set(c.axis[0], c.axis[1], c.axis[2]).normalize();
      const along = _p.dot(_ax);
      const radial = _p.addScaledVector(_ax, -along).length();
      if (Math.abs(along) < c.halfLength && radial < c.radius + pad) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// FACE_WARP — (disabled) global reshaping of the head, applied to every head part right
// after it is built (see Ultron.loadPart). Parts author on the shell above;
// the warp then narrows the lower face (taper) and lengthens the jaw/chin
// (stretch below pivotY) to match the film silhouette (reference/ultron-film-*.png).
// Joints in `rigid` move as solid bodies (no per-vertex warp) so eyes stay
// round and the cheek turbines keep spinning about their own centre.
// ---------------------------------------------------------------------------
export const FACE_WARP = {
  // OFF: HEAD_PROFILE / LANDMARKS now describe the final face directly.
  // Kept so a global reshape can still be prototyped without touching parts.
  enabled: false,
  pivotY: 0.34,     // no vertical change above this height
  stretch: 1.55,    // vertical scale of everything well below pivotY
  blend: 0.22,      // height over which the stretch ramps in
  // [y, x-scale] keyframes (linear), 1 = unchanged
  taper: [[0.95, 1.0], [0.7, 0.93], [0.4, 0.84], [0.1, 0.74], [-0.3, 0.62]],
  muzzle: 0.16,     // push the centre of the lower face forward (+Z), grows toward the chin
  rigid: ['eyeL', 'eyeR', 'browL', 'browR', 'cheekL', 'cheekR'],
  skipParts: ['neck', 'collar'], // body parts (their head anchors are re-aimed live)
};

function warpTaper(y) {
  const T = FACE_WARP.taper;
  if (y >= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) {
    if (y >= T[i][0]) {
      const [y0, g0] = T[i - 1], [y1, g1] = T[i];
      return g1 + ((g0 - g1) * (y - y1)) / (y0 - y1);
    }
  }
  return T[T.length - 1][1];
}
function warpY(y) {
  const { pivotY, stretch, blend } = FACE_WARP;
  const d = pivotY - y;
  if (d <= 0) return { y, dy: 1 };
  if (d <= blend) return { y: pivotY - (d + ((stretch - 1) * d * d) / (2 * blend)), dy: 1 + ((stretch - 1) * d) / blend };
  return { y: pivotY - (blend + ((stretch - 1) * blend) / 2 + stretch * (d - blend)), dy: stretch };
}
function warpMuzzle(x, y) {
  // 0 at the eyes, ramps to 1 at the mouth and keeps growing a little to the chin
  const t = THREE.MathUtils.clamp((0.8 - y) / 0.7, 0, 1.6);
  const ramp = t * t * (3 - 2 * Math.min(t, 1));
  return FACE_WARP.muzzle * ramp * Math.exp(-Math.pow(x / 0.42, 2));
}

/** Warp a HEAD-space point in place. Returns the point. */
export function warpHeadPoint(p) {
  if (!FACE_WARP.enabled) return p;
  const g = warpTaper(p.y);
  const z = p.z + (p.z > 0 ? warpMuzzle(p.x, p.y) : 0);
  const { y } = warpY(p.y);
  return p.set(p.x * g, y, z);
}

/** Approximate normal transform for warpHeadPoint (in place, normalised). */
export function warpHeadNormal(p, n) {
  if (!FACE_WARP.enabled) return n;
  const g = warpTaper(p.y);
  const { dy } = warpY(p.y);
  return n.set(n.x / g, n.y / dy, n.z).normalize();
}

/** Camera presets used by the page and by the Playwright capture script. */
export const VIEWS = {
  // azimuth: degrees around Y towards the model's left (+X); elevation: degrees up;
  // fov: vertical lens angle (default 28). front / filmfront / threequarter /
  // film34 match their reference's lens + angle (scripts/overlay.mjs pairs them
  // by name); the long lenses keep the frame height of the 28deg / 7u camera.
  front:        { azimuth: 1,  elevation: -6,  distance: 19.6, fov: 10, target: [0, 1.85, 0] },
  threequarter: { azimuth: 38, elevation: -17, distance: 13.3, fov: 14, target: [0, 1.95, 0.1] },
  side:         { azimuth: 90, elevation: 0,   distance: 7.2, target: [0, 1.85, 0] },
  closeup:      { azimuth: 12, elevation: 2,   distance: 4.6, target: [0, 2.3, 0.2] },
  film34:       { azimuth: 41, elevation: -28, distance: 12.6, fov: 14, target: [0, 1.95, 0.1] },
  filmfront:    { azimuth: 34, elevation: -5,  distance: 12.9, fov: 14, target: [0, 1.9, 0.1] },
  back34:       { azimuth: 125, elevation: 6,  distance: 7.0, target: [0, 2.0, 0] },
  hero:         { azimuth: 0,  elevation: -4,  distance: 7.6, target: [0, 1.8, 0] },
};
