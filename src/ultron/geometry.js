/**
 * Geometry helpers shared by every part.
 *
 * OWNER: lead / integrator. Part sessions may READ and USE these helpers but
 * must not edit this file. Put part-specific geometry code in your part file.
 *
 * Most important helpers:
 *   shellPatch()    – a thick, bevelled armour plate cut from the head shell
 *                     (or any other parametric surface).
 *   conformPlate()  – extrude a 2D THREE.Shape and wrap it onto the head
 *                     shell like a decal with real thickness.
 *   ringStack()     – concentric stepped rings / discs (eyes, cheek discs,
 *                     chin button) facing +Z.
 *   sweptSection()  – sweep an arbitrary 2D cross-section along a 3D curve
 *                     (fins, cables, ridges).
 *   csgSubtract()   – boolean subtraction via three-bvh-csg.
 * UVs produced by these helpers are in approximately WORLD units, so the
 * shared panel-line shader gives consistent line spacing everywhere.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { Brush, Evaluator, SUBTRACTION, ADDITION, INTERSECTION } from 'three-bvh-csg';
import { headSurface, headNormal, headAngleForX, CUTOUTS, insideCutout } from './anatomy.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Parameter samples in [0,1] with extra density near both ends (for bevels). */
function edgeDenseSamples(count, edgeFrac) {
  const out = new Set([0, 1]);
  const e = THREE.MathUtils.clamp(edgeFrac, 0, 0.45);
  if (e > 0) {
    for (const f of [0.15, 0.4, 0.7, 1.0]) {
      out.add(e * f);
      out.add(1 - e * f);
    }
  }
  for (let i = 1; i < count; i++) out.add(i / count);
  return [...out].sort((x, y) => x - y);
}

/**
 * Thick bevelled plate cut from a parametric surface.
 *
 * @param {object} o
 * @param {number} o.u0,o.u1   angle range (see anatomy.headSurface)
 * @param {number} o.y0,o.y1   height range
 * @param {number} [o.offset=0]      lift along the surface normal
 * @param {number} [o.thickness=0.04]
 * @param {number} [o.bevel=0.015]   rounded edge radius (world units)
 * @param {number} [o.gap=0]         shrink each edge by this much (panel seams)
 * @param {number} [o.segU=32], [o.segV=32]
 * @param {Function} [o.surface]     (u, y, target) => Vector3  (default head shell)
 * @param {Function} [o.normal]      (u, y, target) => Vector3
 * @param {Function} [o.lift]        (u, y) => extra offset (sculpt ridges / dents)
 */
export function shellPatch(o) {
  const surface = o.surface || headSurface;
  const normal = o.normal || headNormal;
  const offset = o.offset ?? 0;
  const thickness = o.thickness ?? 0.04;
  const bevel = o.bevel ?? 0.015;
  const gap = o.gap ?? 0;
  const segU = o.segU ?? 32;
  const segV = o.segV ?? 32;
  const lift = o.lift || null;

  // approximate world size of the patch to convert gap/bevel into params
  const um = (o.u0 + o.u1) / 2;
  const ym = (o.y0 + o.y1) / 2;
  const du = 1e-3;
  const lenU = surface(um + du, ym, _a).distanceTo(surface(um - du, ym, _b)) / (2 * du);
  const lenY = surface(um, ym + du, _a).distanceTo(surface(um, ym - du, _b)) / (2 * du);
  const gU = lenU > 0 ? gap / lenU : 0;
  const gY = lenY > 0 ? gap / lenY : 0;
  const u0 = o.u0 + gU;
  const u1 = o.u1 - gU;
  const y0 = o.y0 + gY;
  const y1 = o.y1 - gY;
  const worldW = Math.max(1e-4, (u1 - u0) * lenU);
  const worldH = Math.max(1e-4, (y1 - y0) * lenY);

  const su = edgeDenseSamples(segU, bevel / worldW);
  const sv = edgeDenseSamples(segV, bevel / worldH);
  const nu = su.length;
  const nv = sv.length;

  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  const outerPos = [];
  const outerUv = [];
  const innerPos = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const u = u0 + (u1 - u0) * su[i];
      const y = y0 + (y1 - y0) * sv[j];
      surface(u, y, P);
      normal(u, y, N);
      const extra = lift ? lift(u, y) : 0;
      // quarter-round bevel
      const d = Math.min(su[i] * worldW, (1 - su[i]) * worldW, sv[j] * worldH, (1 - sv[j]) * worldH);
      let b = 0;
      if (bevel > 0 && d < bevel) {
        const k = bevel - d;
        b = -(bevel - Math.sqrt(Math.max(0, bevel * bevel - k * k)));
      }
      const off = offset + extra;
      outerPos.push(P.x + N.x * (off + b), P.y + N.y * (off + b), P.z + N.z * (off + b));
      outerUv.push(su[i] * worldW, sv[j] * worldH);
      const inn = off - thickness;
      innerPos.push(P.x + N.x * inn, P.y + N.y * inn, P.z + N.z * inn);
    }
  }

  const idx = (i, j) => j * nu + i;
  const outerIndex = [];
  const innerIndex = [];
  for (let j = 0; j < nv - 1; j++) {
    for (let i = 0; i < nu - 1; i++) {
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
      outerIndex.push(a, b, d, b, c, d);
      innerIndex.push(a, d, b, b, d, c);
    }
  }
  const outer = new THREE.BufferGeometry();
  outer.setAttribute('position', new THREE.Float32BufferAttribute(outerPos, 3));
  outer.setAttribute('uv', new THREE.Float32BufferAttribute(outerUv, 2));
  outer.setIndex(outerIndex);
  outer.computeVertexNormals();

  const inner = new THREE.BufferGeometry();
  inner.setAttribute('position', new THREE.Float32BufferAttribute(innerPos, 3));
  inner.setAttribute('uv', new THREE.Float32BufferAttribute(outerUv.slice(), 2));
  inner.setIndex(innerIndex);
  inner.computeVertexNormals();

  // side walls around the border loop
  const loop = [];
  for (let i = 0; i < nu; i++) loop.push(idx(i, 0));
  for (let j = 1; j < nv; j++) loop.push(idx(nu - 1, j));
  for (let i = nu - 2; i >= 0; i--) loop.push(idx(i, nv - 1));
  for (let j = nv - 2; j > 0; j--) loop.push(idx(0, j));
  const wallPos = [];
  const wallUv = [];
  const wallIndex = [];
  let acc = 0;
  for (let k = 0; k <= loop.length; k++) {
    const id = loop[k % loop.length];
    const ox = outerPos[id * 3], oy = outerPos[id * 3 + 1], oz = outerPos[id * 3 + 2];
    const ix = innerPos[id * 3], iy = innerPos[id * 3 + 1], iz = innerPos[id * 3 + 2];
    if (k > 0) {
      const prev = loop[(k - 1) % loop.length];
      acc += Math.hypot(ox - outerPos[prev * 3], oy - outerPos[prev * 3 + 1], oz - outerPos[prev * 3 + 2]);
    }
    wallPos.push(ox, oy, oz, ix, iy, iz);
    wallUv.push(acc, 0, acc, thickness);
    if (k > 0) {
      const base = (k - 1) * 2;
      wallIndex.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  const walls = new THREE.BufferGeometry();
  walls.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
  walls.setAttribute('uv', new THREE.Float32BufferAttribute(wallUv, 2));
  walls.setIndex(wallIndex);
  walls.computeVertexNormals();
  // walls should face outward from the patch; fix winding if needed
  fixWinding(walls, outer);

  const merged = mergeGeometries([outer, inner, walls], false);
  outer.dispose(); inner.dispose(); walls.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/** Flip `geo` winding if its normals point toward the centroid of `ref`. */
function fixWinding(geo, ref) {
  ref.computeBoundingBox();
  const c = ref.boundingBox.getCenter(new THREE.Vector3());
  geo.computeBoundingBox();
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  let score = 0;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 2) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nrm, i);
    score += n.dot(p.sub(c));
  }
  if (score < 0) flipWinding(geo);
}

export function flipWinding(geo) {
  const index = geo.index;
  if (index) {
    const a = index.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    index.needsUpdate = true;
  } else {
    for (const name of Object.keys(geo.attributes)) {
      const attr = geo.attributes[name];
      const s = attr.itemSize;
      const arr = attr.array;
      for (let i = 0; i < attr.count; i += 3) {
        for (let k = 0; k < s; k++) {
          const a = (i + 1) * s + k, b = (i + 2) * s + k;
          const t = arr[a]; arr[a] = arr[b]; arr[b] = t;
        }
      }
      attr.needsUpdate = true;
    }
  }
  if (geo.attributes.normal) {
    const n = geo.attributes.normal.array;
    for (let i = 0; i < n.length; i++) n[i] = -n[i];
    geo.attributes.normal.needsUpdate = true;
  }
  return geo;
}

/** Signed "facing" of a geometry along a direction (area-weighted). */
export function facingScore(geo, dir) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3();
  let score = 0;
  const count = idx ? idx.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    n.crossVectors(b.sub(a), c.sub(a));
    score += n.dot(dir);
  }
  return score;
}

/**
 * Extrude a 2D shape and wrap it onto the head shell.
 *
 * Shape coordinates:
 *   mode 'front': (x, y) are HEAD-space x / y as seen from the front.
 *   mode 'wrap' : x is the angle `u` around the head (radians), y is height.
 * The extrusion depth grows along the shell normal, starting at `offset`.
 */
export function conformPlate(shape, o = {}) {
  const depth = o.depth ?? 0.03;
  const offset = o.offset ?? 0;
  const mode = o.mode || 'front';
  const bevel = o.bevel ?? 0.008;
  const maxEdge = o.maxEdge ?? 0.03;
  const surface = o.surface || headSurface;
  const normal = o.normal || headNormal;
  const lift = o.lift || null;
  let geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 3,
    curveSegments: o.curveSegments ?? 24,
  });
  if (geo.index) geo = geo.toNonIndexed();
  geo.deleteAttribute('normal');
  const tess = new TessellateModifier(maxEdge, 8);
  geo = tess.modify(geo);

  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i); // -bevel .. depth + bevel
    const u = mode === 'wrap' ? x : headAngleForX(x, y);
    surface(u, y, P);
    normal(u, y, N);
    const h = offset + z + bevel + (lift ? lift(u, y, x) : 0);
    pos.setXYZ(i, P.x + N.x * h, P.y + N.y * h, P.z + N.z * h);
    uv[i * 2] = mode === 'wrap' ? x * 0.75 : x;
    uv[i * 2 + 1] = y;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const creased = toCreasedNormals(geo, o.creaseAngle ?? THREE.MathUtils.degToRad(35));
  geo.dispose();
  creased.computeBoundingSphere();
  return creased;
}

/**
 * Concentric stepped rings facing +Z, built with a lathe.
 * `profile` is a list of [radius, z] points from the centre outward
 * (e.g. [[0, 0.02], [0.05, 0.02], [0.05, 0], [0.1, 0], ...]).
 */
export function ringStack(profile, segments = 64) {
  const pts = profile.map(([r, z]) => new THREE.Vector2(Math.max(r, 1e-4), z));
  const g = new THREE.LatheGeometry(pts, segments);
  // Lathe revolves around +Y; rotating +90deg about X maps lathe height -> +Z.
  g.rotateX(Math.PI / 2);
  // Make the rings face outward (+Z / away from the axis) whatever the profile order.
  const outward = new THREE.Vector3(0, 0, 1);
  if (facingScore(g, outward) < 0) flipWinding(g);
  g.computeVertexNormals();
  // world-ish uvs: polar
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    uv[i * 2] = Math.atan2(y, x) * Math.hypot(x, y);
    uv[i * 2 + 1] = Math.hypot(x, y);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return toCreasedNormals(g, THREE.MathUtils.degToRad(40));
}

/**
 * Sweep a closed 2D section along a curve.
 * @param {THREE.Curve} curve
 * @param {Array<[number,number]>|(t)=>Array<[number,number]>} section
 *        2D points (x = across, y = along `up`), closed loop, CCW.
 * @param {object} o  { steps, up: Vector3 | (t)=>Vector3, scale: (t)=>number|[sx,sy], caps }
 */
export function sweptSection(curve, section, o = {}) {
  const steps = o.steps ?? 64;
  const upRef = o.up || new THREE.Vector3(0, 1, 0);
  const scaleFn = o.scale || (() => 1);
  const caps = o.caps ?? true;
  const pos = [];
  const uv = [];
  const index = [];
  let ringLen = 0;
  let along = 0;
  const prevP = new THREE.Vector3();
  const T = new THREE.Vector3();
  const B = new THREE.Vector3();
  const Nn = new THREE.Vector3();
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const P = curve.getPointAt(t);
    curve.getTangentAt(t, T).normalize();
    const up = typeof upRef === 'function' ? upRef(t) : upRef;
    B.crossVectors(T, up).normalize();   // "across"
    Nn.crossVectors(B, T).normalize();   // "up" orthogonal to tangent
    const sec = typeof section === 'function' ? section(t) : section;
    let sc = scaleFn(t);
    const sx = Array.isArray(sc) ? sc[0] : sc;
    const sy = Array.isArray(sc) ? sc[1] : sc;
    if (s > 0) along += P.distanceTo(prevP);
    prevP.copy(P);
    ringLen = sec.length;
    let per = 0;
    for (let k = 0; k < sec.length; k++) {
      const [x, y] = sec[k];
      pos.push(P.x + B.x * x * sx + Nn.x * y * sy, P.y + B.y * x * sx + Nn.y * y * sy, P.z + B.z * x * sx + Nn.z * y * sy);
      if (k > 0) per += Math.hypot(x - sec[k - 1][0], y - sec[k - 1][1]) * sx;
      uv.push(along, per);
    }
  }
  const n = ringLen;
  for (let s = 0; s < steps; s++) {
    for (let k = 0; k < n; k++) {
      const a = s * n + k;
      const b = s * n + ((k + 1) % n);
      const c = (s + 1) * n + ((k + 1) % n);
      const d = (s + 1) * n + k;
      index.push(a, d, b, b, d, c);
    }
  }
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  if (caps) {
    const capGeos = [0, steps].map((s) => {
      const ring = [];
      for (let k = 0; k < n; k++) ring.push(new THREE.Vector3().fromArray(pos, (s * n + k) * 3));
      const c = ring.reduce((m, p) => m.add(p), new THREE.Vector3()).multiplyScalar(1 / n);
      const cp = [c.x, c.y, c.z];
      const cu = [0, 0];
      const ci = [];
      for (let k = 0; k < n; k++) {
        cp.push(ring[k].x, ring[k].y, ring[k].z);
        cu.push(0, 0);
        const a = 1 + k, b = 1 + ((k + 1) % n);
        if (s === 0) ci.push(0, a, b); else ci.push(0, b, a);
      }
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
      cg.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2));
      cg.setIndex(ci);
      return cg;
    });
    geo = mergeGeometries([geo, ...capGeos], false);
  }
  const out = toCreasedNormals(geo.index ? geo.toNonIndexed() : geo, o.creaseAngle ?? THREE.MathUtils.degToRad(40));
  out.computeBoundingSphere();
  return out;
}

/** Superellipse / rounded-rect 2D section helper for sweptSection. */
export function roundedSection(w, h, exponent = 4, count = 24) {
  const pts = [];
  const e = 2 / exponent;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    pts.push([w * Math.sign(c) * Math.pow(Math.abs(c), e), h * Math.sign(s) * Math.pow(Math.abs(s), e)]);
  }
  return pts;
}

/** Blade-like lens section: sharp at +x, rounded at -x. */
export function bladeSection(w, h, count = 20) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const x = w * c;
    const taper = c > 0 ? 1 - Math.pow(c, 2) * 0.85 : 1;
    pts.push([x, h * s * taper]);
  }
  return pts;
}

/** Orient an object so its local +Z faces `dir` (world/parent space). */
export function faceDirection(object, dir, up = new THREE.Vector3(0, 1, 0)) {
  const z = new THREE.Vector3().copy(dir).normalize();
  const x = new THREE.Vector3().crossVectors(up, z);
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return object;
}

/**
 * Build a left/right pair: `build(side)` is called with side = +1 (model's
 * left, +X) and -1 (right). Return value is a Group containing both, and the
 * individual halves as `.userData.left` / `.userData.right`.
 */
export function symmetric(build) {
  const g = new THREE.Group();
  const left = build(1);
  const right = build(-1);
  left.name ||= 'left';
  right.name ||= 'right';
  g.add(left, right);
  g.userData.left = left;
  g.userData.right = right;
  return g;
}

/** Mirror a geometry across X (fixes winding + normals). */
export function mirrorGeometryX(geo) {
  const g = geo.clone();
  g.scale(-1, 1, 1); // mirrors positions and normals
  // restore counter-clockwise winding without touching the (already correct) normals
  flipWinding(g);
  if (g.attributes.normal) {
    const n = g.attributes.normal.array;
    for (let i = 0; i < n.length; i++) n[i] = -n[i];
    g.attributes.normal.needsUpdate = true;
  }
  return g;
}

// ---------------------------------------------------------------------------
// CSG (three-bvh-csg)
// ---------------------------------------------------------------------------
let _evaluator = null;
function evaluator() {
  if (!_evaluator) {
    _evaluator = new Evaluator();
    _evaluator.attributes = ['position', 'uv', 'normal'];
    _evaluator.useGroups = false;
  }
  return _evaluator;
}

function toBrush(g) {
  if (g.isBrush) return g;
  if (g.isMesh) {
    const b = new Brush(g.geometry.clone());
    b.position.copy(g.position); b.quaternion.copy(g.quaternion); b.scale.copy(g.scale);
    b.updateMatrixWorld();
    return b;
  }
  const geo = g.index ? g : g; // Brush handles both
  if (!geo.attributes.uv) {
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const b = new Brush(geo);
  b.updateMatrixWorld();
  return b;
}

/**
 * Subtract cutters from a geometry. Cutters may be BufferGeometries or Meshes
 * (a Mesh's transform is honoured). Returns a new BufferGeometry.
 */
export function csgSubtract(geometry, cutters, op = SUBTRACTION) {
  let result = toBrush(geometry);
  for (const c of cutters) {
    result = evaluator().evaluate(result, toBrush(c), op);
    result.updateMatrixWorld();
  }
  const out = result.geometry;
  out.computeBoundingSphere();
  return out;
}
export const CSG = { SUBTRACTION, ADDITION, INTERSECTION };

/** Ellipsoid cutter mesh, handy for sockets / recesses. */
export function ellipsoidCutter(center, radii, rotation = [0, 0, 0], seg = 32) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
  const m = new THREE.Mesh(g);
  m.position.set(center[0], center[1], center[2]);
  m.scale.set(radii[0], radii[1], radii[2]);
  m.rotation.set(rotation[0], rotation[1], rotation[2]);
  m.updateMatrixWorld();
  return m;
}

/** Cylinder cutter mesh along `axis`. */
export function cylinderCutter(center, axis, radius, halfLength, seg = 48) {
  const g = new THREE.CylinderGeometry(radius, radius, halfLength * 2, seg, 1);
  const m = new THREE.Mesh(g);
  m.position.set(center[0], center[1], center[2]);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...axis).normalize());
  m.updateMatrixWorld();
  return m;
}

/** Cutter meshes for named anatomy.CUTOUTS (HEAD space). */
export function cutoutMeshes(names = Object.keys(CUTOUTS), pad = 0) {
  return names.map((n) => {
    const c = CUTOUTS[n];
    if (!c) throw new Error(`Unknown cutout "${n}"`);
    if (c.type === 'ellipsoid') return ellipsoidCutter(c.center, c.radii.map((r) => r + pad), c.rotation);
    return cylinderCutter(c.center, c.axis, c.radius + pad, c.halfLength);
  });
}

/**
 * Carve anatomy cutouts (eye sockets, cheek discs…) out of a CLOSED plate
 * geometry authored in HEAD space. Returns a new geometry.
 */
export function carve(geometry, names, pad = 0) {
  return csgSubtract(geometry, cutoutMeshes(names, pad));
}

export { insideCutout };
export { mergeGeometries, mergeVertices, toCreasedNormals };

// ---------------------------------------------------------------------------
// Generic superellipse-stack surface (same maths as the head shell) so parts
// such as the neck and collar can define their own body surfaces.
// profile: [{ y, w, zf, zb, n, zc }, ...] sorted by y.
// Returns { section(y), surface(u, y, target), normal(u, y, target) }.
// ---------------------------------------------------------------------------
export function profileSurface(profile) {
  const P = profile;
  const yMin = P[0].y;
  const yMax = P[P.length - 1].y;
  const cr = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  const section = (y) => {
    const yy = THREE.MathUtils.clamp(y, yMin, yMax);
    let i = 0;
    while (i < P.length - 2 && P[i + 1].y < yy) i++;
    const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
    const t = (yy - b.y) / (c.y - b.y || 1);
    const o = { y: yy };
    for (const k of ['w', 'zf', 'zb', 'n', 'zc']) o[k] = cr(a[k] ?? 0, b[k] ?? 0, c[k] ?? 0, d[k] ?? 0, t);
    o.w = Math.max(0, o.w); o.zf = Math.max(0, o.zf); o.zb = Math.max(0, o.zb); o.n = Math.max(1.2, o.n || 2);
    return o;
  };
  const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  const surface = (u, y, target = new THREE.Vector3()) => {
    const s = section(y);
    const e = 2 / s.n;
    const su = Math.sin(u), cu = Math.cos(u);
    return target.set(s.w * sp(su, e), s.y, (s.zc || 0) + (cu >= 0 ? s.zf : s.zb) * sp(cu, e));
  };
  const normal = (u, y, target = new THREE.Vector3()) => {
    const h = 1e-3;
    const du = surface(u + h, y, new THREE.Vector3()).sub(surface(u - h, y, new THREE.Vector3()));
    const dv = surface(u, y + h, new THREE.Vector3()).sub(surface(u, y - h, new THREE.Vector3()));
    target.crossVectors(du, dv).normalize();
    const c = surface(u, y, new THREE.Vector3());
    const s = section(y);
    const radial = new THREE.Vector3(c.x, 0, c.z - (s.zc || 0));
    if (radial.lengthSq() > 1e-8 && target.dot(radial) < 0) target.negate();
    return target;
  };
  return { section, surface, normal, yRange: [yMin, yMax] };
}

/** Thin single-sided parametric surface (no thickness) over (u, y). */
export function surfaceSheet({ surface, normal, u0, u1, y0, y1, segU = 64, segV = 48, offset = 0, keep = null }) {
  const pos = [], uv = [], index = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  for (let j = 0; j <= segV; j++) {
    for (let i = 0; i <= segU; i++) {
      const u = u0 + ((u1 - u0) * i) / segU;
      const y = y0 + ((y1 - y0) * j) / segV;
      surface(u, y, P);
      if (offset) { normal(u, y, N); P.addScaledVector(N, offset); }
      pos.push(P.x, P.y, P.z);
      uv.push(u, y);
    }
  }
  const w = segU + 1;
  const C = new THREE.Vector3();
  const tri = (a, b, c) => {
    if (keep) {
      C.set(
        (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3,
        (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3,
        (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3
      );
      if (!keep(C)) return;
    }
    index.push(a, b, c);
  };
  for (let j = 0; j < segV; j++) for (let i = 0; i < segU; i++) {
    const a = j * w + i, b = a + 1, c = a + w + 1, d = a + w;
    tri(a, b, d); tri(b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  // ensure outward facing: compare with the analytic normal at the middle
  const mi = Math.floor(segV / 2) * w + Math.floor(segU / 2);
  const n = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, mi);
  normal((u0 + u1) / 2, (y0 + y1) / 2, N);
  const score = n.dot(N);
  if (score < 0) flipWinding(g);
  return g;
}
