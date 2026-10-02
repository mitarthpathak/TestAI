/**
 * PART: faceplate — the front of the face between the brow and the upper lip
 * (reference/ultron-face-close.png).
 * Joints: head (nose shield, sockets, cheek plates), browL / browR (brows).
 * Authoring space: HEAD.
 *
 *  - faceplate.under              dark backing sheet (no holes between plates)
 *  - faceplate.nose               central SHIELD: broad between the eyes, straight
 *                                 chamfered sides converging toward the mouth
 *    .nose.keel                   raised inverted trapezoid with a W-notched bottom
 *    .nose.lower / .nose.tab      narrower lower step + small tab above the mouth slit
 *  - faceplate.brow.{L,R}         layered angular brow ridge (on browL/R), whose
 *    .browMid / .browCap          outer end wraps down beside the eye
 *  - faceplate.socket.{L,R}       almond socket frames (outer corner high, inner
 *                                 corner pulled down to the nose)
 *  - faceplate.cheekbone.{L,R}    pivot; 3 stacked plates .cheek{0,1,2}.{L,R} from
 *                                 the shield side down/out to the outer face edge,
 *                                 step edges running diagonally (inverted-triangle mask)
 *
 * Params: browRaise (+ up), browAngle (+ angry: inner ends drop),
 *         noseFlex (scrunch), cheekFlex (sneer / cheekbones lift).
 */
export const meta = {
  id: 'faceplate',
  explode: [0, 0.2, 1.0],
};

// Eye-socket opening (shared with eyes.js — keep in sync). Almond outline in
// eye-local units (o = outward from the nose, v = up), measured from the face
// close-up: outer corner raised, inner corner drawn down toward the nose.
export const SOCKET_PTS = [
  [0.165, 0.045], [0.1, 0.076], [0.02, 0.072], [-0.08, 0.047], [-0.16, 0.012],
  [-0.205, -0.05], [-0.175, -0.112], [-0.085, -0.122], [0.02, -0.08], [0.11, -0.015],
];
export const SOCKET_SCALE = 1.0;
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
export function socketPoint(anatomy, side, t, k = 1) {
  const L = socketLUT(), N = L.length;
  let f = ((t / (2 * Math.PI)) % 1 + 1) % 1 * N;
  const i = Math.floor(f) % N, j = (i + 1) % N;
  f -= Math.floor(f);
  const o = (L[i][0] + (L[j][0] - L[i][0]) * f) * SOCKET_SCALE * k;
  const v = (L[i][1] + (L[j][1] - L[i][1]) * f) * SOCKET_SCALE * k;
  const e = anatomy.LANDMARKS.eyeL;
  return [side * (e[0] + o), e[1] + v];
}
/** 2D test: is front-view (x, y) inside the socket outline scaled by k? */
export function insideSocket(anatomy, side, x, y, k = 1) {
  const L = socketLUT(), e = anatomy.LANDMARKS.eyeL, s = SOCKET_SCALE * k;
  const o = (side * x - e[0]) / s, v = (y - e[1]) / s;
  if (Math.abs(o) > 0.25 || Math.abs(v) > 0.16) return false;
  let inside = false;
  for (let i = 0, j = L.length - 1; i < L.length; j = i++) {
    const [xi, yi] = L[i], [xj, yj] = L[j];
    if ((yi > v) !== (yj > v) && o < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// nose shield outline (x half-width, y): broad between the eyes, then a long
// taper to a slim lower tab above the mouth (face close-up)
const NOSE_EDGE = [[0.13, 1.115], [0.138, 1.05], [0.133, 0.98], [0.122, 0.9], [0.117, 0.82], [0.112, 0.72], [0.1, 0.62], [0.085, 0.52], [0.07, 0.44], [0.058, 0.37]];

// cranium region starts above this brow line (cranium.js browY)
const craniumBrowY = (x) => {
  const t = Math.min(1, Math.max(0, (Math.abs(x) - 0.1) / 0.5));
  return 1.05 + 0.07 * t * t * (3 - 2 * t);
};

export function build(ctx) {
  const { THREE, geo, anatomy, materials: M } = ctx;
  const head = ctx.space('head', 'head');
  const field = makeHeadField(THREE, anatomy);
  const chart = field.chart;
  const sm = THREE.MathUtils.smoothstep;
  const lerp = THREE.MathUtils.lerp;

  // light polished steel (the close-up is well lit), panel lines on every plate
  const steel = M.get('chrome', { color: 0xc6cbd1, roughness: 0.3, panel: 7, seed: 5, lineWidth: 0.0026, lineDepth: 0.7 });
  const steelB = M.get('chrome', { color: 0xbac0c7, roughness: 0.25, panel: 5.5, seed: 9, lineWidth: 0.0026, lineDepth: 0.7 });
  const steelC = M.get('chrome', { color: 0xb0b6bd, roughness: 0.33, panel: 9, seed: 31, lineWidth: 0.0024, lineDepth: 0.65 });
  const steelD = M.get('chrome', { color: 0xa4aab2, roughness: 0.36, panel: 11, seed: 37, lineWidth: 0.0022, lineDepth: 0.65 });
  const frameMat = M.get('gunmetal', { color: 0x5a6068, roughness: 0.36, side: THREE.DoubleSide, edge: 2.4 });
  // the mid-face (shield + inner cheek layer) reads darker than the bright V bands
  // large flat plates: darker, rougher gunmetal; `edge` brightens the polished bevels
  const midA = M.get('gunmetal', { color: 0x5e646c, roughness: 0.5, panel: 7, seed: 55, lineWidth: 0.0026, lineDepth: 0.75, edge: 2.6 });
  const midB = M.get('gunmetal', { color: 0x555b63, roughness: 0.52, panel: 9, seed: 57, lineWidth: 0.0024, lineDepth: 0.75, edge: 2.6 });
  const midC = M.get('gunmetal', { color: 0x686e76, roughness: 0.46, panel: 8, seed: 59, lineWidth: 0.0024, lineDepth: 0.75, edge: 2.4 });
  const gun = M.get('gunmetal', { color: 0x8c929a, panel: 8, seed: 13, lineWidth: 0.0028, lineDepth: 0.8 });
  const keelMat = M.get('gunmetal', { color: 0x80868e, roughness: 0.36, panel: 6, seed: 65, lineWidth: 0.0026, lineDepth: 0.75, edge: 2.6 });
  const browMat = M.get('gunmetal', { color: 0x7a8088, roughness: 0.34, panel: 6, seed: 61, lineWidth: 0.0026, lineDepth: 0.75, edge: 2.4 });
  const browMatB = M.get('gunmetal', { color: 0x868c94, roughness: 0.32, panel: 7, seed: 63, lineWidth: 0.0026, lineDepth: 0.75, edge: 2.2 });
  const under = M.get('darkMetal', { panel: 10, seed: 21, lineWidth: 0.0025, side: THREE.DoubleSide });

  // rails: [x, y] front-view points converted to chart (u, y)
  const rail = (pts, mirror = 1) => {
    const c = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(anatomy.headAngleForX(x * mirror, y), y)));
    c.arcLengthDivisions = 300;
    const v = new THREE.Vector2();
    return (t) => { c.getPointAt(THREE.MathUtils.clamp(t, 0, 1), v); return [v.x, v.y]; };
  };
  const mixRail = (rA, rB, s) => (t) => { const a = rA(t), b = rB(t); return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]; };
  const surfZ = (x, y) => anatomy.headFrontZ(x, y);

  const pivots = {};
  const pivot = (name, hinge, parent = head) => {
    const g = new THREE.Group();
    g.name = `${name}.pivot`;
    g.position.copy(hinge);
    g.userData.rest = hinge.clone();
    const inner = new THREE.Group();
    inner.position.copy(hinge).negate();
    g.add(inner);
    parent.add(g);
    pivots[name] = g;
    return inner;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ------------------------------------------------------------ dark backing sheet
  {
    const _P = new THREE.Vector3();
    const g = geo.surfaceSheet({
      surface: (u, y, P) => field.surface(u, y, P),
      normal: (u, y, N) => field.normalAt(field.surface(u, y, _P), N),
      u0: -1.15, u1: 1.15, y0: 0.29, y1: 1.2, segU: 90, segV: 70, offset: -0.014,
      keep: (C) => C.y < craniumBrowY(C.x) + 0.03
        && !insideSocket(anatomy, 1, C.x, C.y, 1.0) && !insideSocket(anatomy, -1, C.x, C.y, 1.0)
        && !anatomy.insideCutout(C, ['cheekL', 'cheekR']),
    });
    head.add(ctx.mesh(g, under, 'faceplate.under'));
  }

  // ------------------------------------------------------------ nose shield
  // front face: a straight line in side view from under the brow (y 1.1) to the
  // nose tip landmark (y 0.5), then a little further forward to the mouth slit
  const tip = anatomy.LANDMARKS.noseTip;
  const noseFrontZ = (y) => (y >= tip[1] ? lerp(0.722, tip[2] - 0.034, (1.1 - y) / (1.1 - tip[1])) : tip[2] - 0.034 + (tip[1] - y) * 0.07);
  const shieldLift = (dz) => (s, t, P, N) => (noseFrontZ(P.y) + dz - P.z) / Math.max(0.5, N.z);
  {
    const inner = pivot('faceplate.nose', V(0, 1.06, 0.76));
    const base = shieldLift(0);
    const edge = NOSE_EDGE;
    const g = ribbonPlate(THREE, geo, {
      chart, railA: rail(edge, -1), railB: rail(edge, 1),
      segS: 34, segT: 72, offset: 0, thickness: 0.13, bevel: 0.006, gap: 0.0,
      lift: (s, t, P, N) => {
        const e = Math.abs(2 * s - 1);
        // chamfered sides, bridge step under the brows, faint centre crease
        const bridge = 0.006 * sm(P.y, 0.955, 0.965);
        // central keel: a slim raised spine with soft flanks (concept 3/4)
        const keel = Math.exp(-Math.pow(e / 0.07, 2)) * sm(P.y, 0.9, 0.95) * (1 - sm(P.y, 1.06, 1.1));
        // top end ramps down and tucks under the cranium crest (keystone)
        const tuck = 0.026 * sm(P.y, 1.06, 1.11);
        return base(s, t, P, N) - 0.026 * sm(e, 0.62, 1.0) + bridge + 0.004 * keel - tuck;
      },
    });
    inner.add(ctx.mesh(g, midA, 'faceplate.nose'));

    // raised inverted trapezoid keel with a W-notched bottom edge
    const keel = [[0.108, 0.905], [0.104, 0.84], [0.096, 0.76], [0.088, 0.68], [0.08, 0.6], [0.074, 0.52], [0.072, 0.5]];
    const wY = (x) => 0.52 + 0.075 * Math.abs(Math.cos((Math.PI * x) / 0.088));
    const kg = ribbonPlate(THREE, geo, {
      chart, railA: rail(keel, -1), railB: rail(keel, 1),
      segS: 34, segT: 56, offset: 0, thickness: 0.06, bevel: 0.004, gap: 0.0,
      lift: (s, t, P, N) => {
        const e = Math.abs(2 * s - 1);
        const groove = Math.exp(-Math.pow((e - 0.3) / 0.035, 2)) * sm(P.y, 0.88, 0.8) * sm(P.y, 0.66, 0.74);
        // soft W step: a shallow bevelled drop, not a cut-out
        const cut = 1 - sm(P.y, wY(P.x) - 0.012, wY(P.x) + 0.01);
        return base(s, t, P, N) + 0.009 - 0.006 * sm(e, 0.85, 1.0) - 0.003 * groove - 0.008 * cut;
      },
    });
    inner.add(ctx.mesh(kg, keelMat, 'faceplate.nose.keel'));

    // bridge plate between the eyes: slim raised trapezoid with two cross steps
    const br = [[0.072, 1.06], [0.068, 1.0], [0.063, 0.94], [0.058, 0.9]];
    const bg = ribbonPlate(THREE, geo, {
      chart, railA: rail(br, -1), railB: rail(br, 1),
      segS: 16, segT: 30, offset: 0, thickness: 0.05, bevel: 0.003, gap: 0.0, gap1: 0.0,
      lift: (s, t, P, N) => {
        const steps = 0.0025 * (sm(P.y, 1.035, 1.04) + sm(P.y, 0.985, 0.99));
        return base(s, t, P, N) + 0.003 + steps - 0.003 * sm(Math.abs(2 * s - 1), 0.85, 1.0);
      },
    });
    inner.add(ctx.mesh(bg, midC, 'faceplate.nose.bridge'));

    // narrower lower step and the small tab just above the mouth slit
    const low = [[0.08, 0.56], [0.074, 0.5], [0.066, 0.45], [0.058, 0.41]];
    const lg = ribbonPlate(THREE, geo, {
      chart, railA: rail(low, -1), railB: rail(low, 1),
      segS: 40, segT: 30, offset: 0, thickness: 0.06, bevel: 0.004, gap: 0.0,
      lift: (s, t, P, N) => {
        const cut = 1 - sm(P.y, wY(P.x) - 0.045, wY(P.x) - 0.039); // follows the W, one step lower
        return base(s, t, P, N) + 0.006 - 0.004 * sm(Math.abs(2 * s - 1), 0.85, 1.0) + 0.0 * cut - 0.03 * (1 - cut);
      },
    });
    inner.add(ctx.mesh(lg, steelC, 'faceplate.nose.lower'));
    const tab = [[0.042, 0.405], [0.04, 0.37], [0.038, 0.335]];
    const tg = ribbonPlate(THREE, geo, {
      chart, railA: rail(tab, -1), railB: rail(tab, 1),
      segS: 12, segT: 12, offset: 0, thickness: 0.06, bevel: 0.004, gap: 0.0,
      lift: (s, t, P, N) => base(s, t, P, N) + 0.014 - 0.006 * sm(t, 0.55, 0.65),
    });
    inner.add(ctx.mesh(tg, gun, 'faceplate.nose.tab'));
  }

  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';

    // ---------------------------------------------------------- socket frame
    {
      const NS = 160;
      const loops = [
        [1.12, 0.002], [1.09, 0.008], [1.06, 0.01], [1.03, 0.006],
        [1.01, -0.006], [0.99, -0.026], [0.975, -0.05],
      ].map(([k, dz]) => {
        const pts = [];
        for (let i = 0; i < NS; i++) {
          const [x, y] = socketPoint(anatomy, side, (i / NS) * Math.PI * 2, k);
          pts.push(V(x, y, (surfZ(x, y) ?? 0.5) + dz));
        }
        return pts;
      });
      head.add(ctx.mesh(loftRings(THREE, geo, loops), frameMat, `faceplate.socket.${key}`));

      // stepped concentric almond frames (model-side sculpt): each ring is a
      // separate layer, one step higher than the ring inside it, growing mostly
      // outward / downward (the brow hoods the top, the nose clamps the inner corner)
      const base = [];
      for (let i = 0; i < NS; i++) {
        const t = (i / NS) * Math.PI * 2;
        const [x, y] = socketPoint(anatomy, side, t, 1.12);
        const [xa, ya] = socketPoint(anatomy, side, t - 0.01, 1.12);
        const [xb, yb] = socketPoint(anatomy, side, t + 0.01, 1.12);
        let nx = yb - ya, ny = -(xb - xa);
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl; ny /= nl;
        const e = anatomy.LANDMARKS.eyeL;
        if (nx * (x - side * e[0]) + ny * (y - e[1]) < 0) { nx = -nx; ny = -ny; }
        const o = side * x - e[0], v = y - e[1];
        const w = lerp(0.12, 1, sm(o, -0.19, 0.04)) * (v > 0 ? lerp(1, 0.75, sm(v, 0.0, 0.07)) : 1) * (1 + 0.35 * sm(o, 0.08, 0.17));
        base.push([x, y, nx, ny, w]);
      }
      const ringLoop = (d, h) => base.map(([x, y, nx, ny, w]) => {
        const px = x + nx * d * w, py = y + ny * d * w;
        return V(px, py, (surfZ(px, py) ?? 0.5) + h);
      });
      const RINGS = [
        { d0: 0.0, d1: 0.024, h: 0.014, mat: steelC },
        { d0: 0.029, d1: 0.054, h: 0.028, mat: frameMat },
        { d0: 0.06, d1: 0.084, h: 0.04, mat: browMatB },
        { d0: 0.09, d1: 0.118, h: 0.05, mat: steelD },
      ];
      RINGS.forEach((R, i) => {
        const rows = [
          ringLoop(R.d1, R.h - 0.03),
          ringLoop(R.d1, R.h - 0.004),
          ringLoop(R.d1 - 0.004, R.h),
          ringLoop(R.d0 + 0.004, R.h),
          ringLoop(R.d0, R.h - 0.004),
          ringLoop(R.d0, R.h - 0.03),
        ];
        head.add(ctx.mesh(loftRings(THREE, geo, rows), R.mat, `faceplate.socket.ring${i}.${key}`));
      });
    }

    // ---------------------------------------------------------- brow (browL / browR joint)
    const browSpace = ctx.space(`brow${key}`, 'head');
    const bj = anatomy.JOINTS[`brow${key}`].pos;
    const browIn = pivot(`faceplate.brow.${key}`, V(bj[0], bj[1], bj[2]), browSpace);
    // lower edge hoods the socket top and wraps down its outer side
    // sits TIGHT on the socket top (no helmet arch): a low band from the shield
    // top out to the temple whose top edge meets the forehead plates
    const bLow = rail([[0.14, 0.93], [0.2, 0.953], [0.27, 0.978], [0.35, 0.994], [0.43, 1.004], [0.5, 1.0], [0.545, 0.978], [0.56, 0.95]], side);
    const bTop = rail([[0.11, 1.072], [0.18, 1.08], [0.26, 1.092], [0.34, 1.106], [0.44, 1.124], [0.53, 1.13], [0.59, 1.09], [0.605, 1.02], [0.6, 0.95]], side);
    // three angular layers, stepping down from the overhang to the forehead
    const layers = [
      // heavy angular hood: the lower layer juts well forward of the socket
      // (deep shadow over the eye in 3/4) with a hard crease along its face
      { s0: 0.0, s1: 0.46, h0: 0.16, h1: 0.075, th: 0.22, mat: browMat, name: 'brow', crease: 0.4 },
      { s0: 0.46, s1: 0.76, h0: 0.062, h1: 0.042, th: 0.14, mat: browMatB, name: 'browMid' },
      { s0: 0.76, s1: 1.0, h0: 0.038, h1: 0.026, th: 0.1, mat: steelC, name: 'browCap' },
    ];
    for (const Ly of layers) {
      const g = ribbonPlate(THREE, geo, {
        chart, railA: mixRail(bLow, bTop, Ly.s0), railB: mixRail(bLow, bTop, Ly.s1),
        segS: Ly.crease ? 14 : 8, segT: 64, offset: 0, thickness: Ly.th, bevel: 0.007,
        gapA: Ly.s0 ? 0.003 : 0, gapB: 0.0, gap0: 0.002, gap1: 0.004,
        lift: (s, t) => {
          // thinner toward the temple leg, and at the nose end it tucks under the shield top
          const fade = 1 - 0.38 * sm(t, 0.55, 1.0);
          const nose = lerp(0.5, 1, sm(t, 0.0, 0.14));
          let h;
          if (Ly.crease) {
            // two flat facets meeting at a crease: steep front face below, sloped top above
            const c = Ly.crease, hc = Ly.h0 - 0.02;
            h = s < c ? Ly.h0 + (hc - Ly.h0) * (s / c) : hc + (Ly.h1 - hc) * ((s - c) / (1 - c));
          } else h = Ly.h0 + (Ly.h1 - Ly.h0) * s;
          return h * fade * nose;
        },
      });
      browIn.add(ctx.mesh(g, Ly.mat, `faceplate.${Ly.name}.${key}`));
    }

    // ---------------------------------------------------------- cheek plates
    // from the shield side out / down under the eye to the outer face edge;
    // the outer boundary runs diagonally from beside the outer eye corner
    // toward the mouth corner. Three stacked strips -> diagonal step edges.
    const rIn = rail([[0.128, 0.786], [0.122, 0.72], [0.112, 0.62], [0.096, 0.52], [0.081, 0.44], [0.068, 0.36], [0.06, 0.3]], side);
    const rOut = rail([[0.525, 0.9], [0.46, 0.75], [0.36, 0.6], [0.29, 0.48], [0.222, 0.38], [0.158, 0.29]], side);
    const cheekG = pivot(`faceplate.cheekbone.${key}`, V(0.2 * side, 0.7, surfZ(0.2, 0.7)));
    const strips = [
      { s0: 0.0, s1: 0.26, h0: 0.036, h1: 0.033, mat: midB },
      { s0: 0.26, s1: 0.5, h0: 0.031, h1: 0.028, mat: midA },
      { s0: 0.5, s1: 0.75, h0: 0.027, h1: 0.022, mat: midC },
      { s0: 0.75, s1: 1.0, h0: 0.019, h1: 0.012, mat: steelD },
    ];
    strips.forEach((S, i) => {
      // short seams / insets at staggered heights in each strip
      const ticks = [0.18 + 0.07 * i, 0.42 + 0.05 * i, 0.66 - 0.04 * i];
      const g = ribbonPlate(THREE, geo, {
        chart, railA: mixRail(rIn, rOut, S.s0), railB: mixRail(rIn, rOut, S.s1),
        segS: 10, segT: 44, offset: 0, thickness: 0.1, bevel: 0.005,
        gapA: i ? 0.003 : 0.002, gapB: 0.0, gap0: 0.0, gap1: 0.0,
        lift: (s, t) => {
          let h = S.h0 + (S.h1 - S.h0) * s;
          h -= 0.003 * Math.exp(-Math.pow((s - 0.5) / 0.03, 2)); // fine parallel seam
          // short cross seams (sharp steps, not dents)
          for (const c of ticks) h -= 0.003 * (sm(t, c - 0.006, c) - sm(t, c + 0.012, c + 0.018)) * sm(s, 0.1, 0.2) * (1 - sm(s, 0.8, 0.9));
          return h;
        },
      });
      cheekG.add(ctx.mesh(g, S.mat, `faceplate.cheek${i}.${key}`));
      // small raised rectangular insets on the strips (face close-up)
      const tabs = [[[0.3, 0.37], [0.58, 0.63]], [[0.22, 0.28], [0.46, 0.52], [0.72, 0.76]], [[0.34, 0.4], [0.62, 0.67]], [[0.26, 0.31], [0.52, 0.57]]][i];
      tabs.forEach(([t0, t1], k) => {
        const sA = S.s0 + (S.s1 - S.s0) * 0.22, sB = S.s0 + (S.s1 - S.s0) * 0.78;
        const sub = (r) => (t) => r(t0 + (t1 - t0) * t);
        const tg = ribbonPlate(THREE, geo, {
          chart, railA: sub(mixRail(rIn, rOut, sA)), railB: sub(mixRail(rIn, rOut, sB)),
          segS: 3, segT: 6, offset: 0, thickness: 0.06, bevel: 0.0025, gap: 0,
          lift: (s2) => S.h0 + (S.h1 - S.h0) * (0.22 + 0.56 * s2) + 0.006,
        });
        cheekG.add(ctx.mesh(tg, i < 2 ? midA : midC, `faceplate.cheek${i}.tab${k}.${key}`));
      });
    });
  }

  // ------------------------------------------------------------ params
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const set = (name, rx, ry, rz, dx, dy, dz) => {
    const g = pivots[name];
    g.quaternion.copy(_q.setFromEuler(_e.set(rx, ry, rz)));
    g.position.copy(g.userData.rest).add(new THREE.Vector3(dx, dy, dz));
  };
  const params = { browRaise: 0, browAngle: 0, noseFlex: 0, cheekFlex: 0 };
  return {
    params,
    paramSpec: {
      browRaise: { min: -1, max: 1, step: 0.01 },
      browAngle: { min: -1, max: 1, step: 0.01 },
      noseFlex: { min: -1, max: 1, step: 0.01 },
      cheekFlex: { min: -1, max: 1, step: 0.01 },
    },
    apply(p) {
      set('faceplate.nose', -p.noseFlex * 0.03, 0, 0, 0, p.noseFlex * 0.01, 0);
      for (const key of ['L', 'R']) {
        const sd = key === 'L' ? 1 : -1;
        set(`faceplate.brow.${key}`, -p.browRaise * 0.05, 0, sd * p.browAngle * 0.12, 0, p.browRaise * 0.025, p.browRaise * 0.006);
        set(`faceplate.cheekbone.${key}`, -p.cheekFlex * 0.03, 0, -sd * p.cheekFlex * 0.04, 0, p.cheekFlex * 0.014, p.cheekFlex * 0.004);
      }
    },
  };
}

/** Indexed loft through closed loops (rows[k][i]); creased normals, world-ish UVs. */
function loftRings(THREE, geo, rows) {
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
  if (geo.facingScore(g, new THREE.Vector3(0, 0, 1)) < 0) geo.flipWinding(g);
  const out = geo.toCreasedNormals(g.toNonIndexed(), THREE.MathUtils.degToRad(32));
  g.dispose();
  out.computeBoundingSphere();
  return out;
}

// ===========================================================================
// Local geometry helpers (duplicated in cranium.js; candidates for geometry.js)
// ===========================================================================

/**
 * Fast, allocation-free sampler of the shared head shell: anatomy.headSection
 * tabulated at 1 mm steps. F(x,y,z) is the superellipse implicit (<0 inside),
 * normals come from its gradient.
 */
function makeHeadField(THREE, anatomy) {
  const [Y0, Y1] = anatomy.HEAD_Y_RANGE;
  const n = 2300, h = (Y1 - Y0) / n;
  const T = { w: new Float64Array(n + 1), zf: new Float64Array(n + 1), zb: new Float64Array(n + 1), e: new Float64Array(n + 1), zc: new Float64Array(n + 1) };
  for (let i = 0; i <= n; i++) {
    const s = anatomy.headSection(Y0 + i * h);
    T.w[i] = s.w; T.zf[i] = s.zf; T.zb[i] = s.zb; T.e[i] = s.n; T.zc[i] = s.zc;
  }
  const S = { w: 0, zf: 0, zb: 0, n: 2, zc: 0 };
  const section = (y) => {
    let f = (y - Y0) / h;
    f = f < 0 ? 0 : f > n ? n : f;
    const i = Math.min(n - 1, f | 0), t = f - i;
    S.w = T.w[i] + (T.w[i + 1] - T.w[i]) * t;
    S.zf = T.zf[i] + (T.zf[i + 1] - T.zf[i]) * t;
    S.zb = T.zb[i] + (T.zb[i + 1] - T.zb[i]) * t;
    S.n = T.e[i] + (T.e[i + 1] - T.e[i]) * t;
    S.zc = T.zc[i] + (T.zc[i + 1] - T.zc[i]) * t;
    return S;
  };
  const F = (x, y, z) => {
    if (y <= Y0 + 1e-4 || y >= Y1 - 1e-4) return 1;
    const s = section(y);
    if (s.w < 1e-5) return 1;
    const d = z >= s.zc ? s.zf : s.zb;
    return Math.pow(Math.abs(x) / s.w, s.n) + Math.pow(Math.abs(z - s.zc) / d, s.n) - 1;
  };
  const normalAt = (P, N) => {
    const s = section(P.y);
    const w = Math.max(1e-5, s.w), ne = s.n, dz = P.z - s.zc, d = dz >= 0 ? s.zf : s.zb;
    const gx = (ne * Math.pow(Math.abs(P.x) / w, ne - 1) / w) * Math.sign(P.x);
    const gz = (ne * Math.pow(Math.abs(dz) / d, ne - 1) / d) * Math.sign(dz);
    const e = 2e-4;
    const gy = (F(P.x, Math.min(Y1 - 2e-4, P.y + e), P.z) - F(P.x, P.y - e, P.z)) / (2 * e);
    N.set(gx, gy, gz);
    if (N.lengthSq() < 1e-12) N.set(0, 1, 0);
    return N.normalize();
  };
  const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  const surface = (u, y, P) => {
    const s = section(y);
    const e = 2 / s.n, cu = Math.cos(u);
    return P.set(s.w * sp(Math.sin(u), e), y, s.zc + (cu >= 0 ? s.zf : s.zb) * sp(cu, e));
  };
  /** (u, y) chart: same parametrisation as anatomy.headSurface */
  const chart = (u, y, P, N) => { surface(u, y, P); normalAt(P, N); };
  return { section, F, normalAt, surface, chart };
}

function edgeDense(count, edgeFrac) {
  const out = new Set([0, 1]);
  const e = Math.min(0.45, Math.max(0, edgeFrac));
  if (e > 0) for (const f of [0.15, 0.4, 0.7, 1.0]) { out.add(e * f); out.add(1 - e * f); }
  for (let i = 1; i < count; i++) out.add(i / count);
  return [...out].sort((a, b) => a - b);
}

/**
 * Thick bevelled plate between two rails on a surface chart.
 *  chart(a, b, P, N)  -> surface point + outward unit normal for chart coords
 *  railA(t), railB(t) -> [a, b] chart coords for t in [0, 1]
 * Gaps are in world units (per edge), so seams keep a constant width even
 * where the chart is stretched. lift(s, t) sculpts the outer surface.
 * UVs are world-unit (along, across) so panel lines follow the plate flow.
 */
function ribbonPlate(THREE, geo, o) {
  const chart = o.chart, A = o.railA, B = o.railB;
  const segS = o.segS ?? 10, segT = o.segT ?? 30;
  const offset = o.offset ?? 0, thickness = o.thickness ?? 0.045, bevel = o.bevel ?? 0.012;
  const gap = o.gap ?? 0.007;
  const gapA = o.gapA ?? gap, gapB = o.gapB ?? gap, gap0 = o.gap0 ?? gap, gap1 = o.gap1 ?? gap;
  const lift = o.lift || null;
  const P = new THREE.Vector3(), N = new THREE.Vector3(), Q = new THREE.Vector3(), Mv = new THREE.Vector3(), Pr = new THREE.Vector3();
  const mix = (a, b, s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];

  // arc length of the midline + rail-to-rail width along t
  const K = 64;
  const cum = new Float64Array(K + 1);
  for (let k = 0; k <= K; k++) {
    const t = k / K;
    const m = mix(A(t), B(t), 0.5);
    chart(m[0], m[1], Mv, N);
    cum[k] = k ? cum[k - 1] + Mv.distanceTo(Pr) : 0;
    Pr.copy(Mv);
  }
  const total = cum[K];
  const tAt = (L) => {
    if (L <= 0) return 0;
    if (L >= total) return 1;
    let lo = 0, hi = K;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < L) lo = mid; else hi = mid; }
    return (lo + (L - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo])) / K;
  };
  const L0 = Math.min(Math.max(0, gap0), total * 0.45);
  const L1 = total - Math.min(Math.max(0, gap1), total * 0.45);
  const Leff = Math.max(1e-4, L1 - L0);
  const widthAt = (t) => {
    const a = A(t), b = B(t);
    chart(a[0], a[1], P, N); chart(b[0], b[1], Q, N);
    return P.distanceTo(Q);
  };

  // orientation: (dS x dT) must point along the surface normal
  const Lm = 0.5 * (L0 + L1);
  const tm = tAt(Lm), t2 = tAt(Math.min(total, Lm + 0.01)), t1 = tAt(Math.max(0, Lm - 0.01));
  const am = A(tm), bm = B(tm);
  const c0 = mix(am, bm, 0.4), c1 = mix(am, bm, 0.6), cm = mix(am, bm, 0.5);
  chart(c1[0], c1[1], P, N); chart(c0[0], c0[1], Q, N);
  const dS = P.clone().sub(Q);
  const m2 = mix(A(t2), B(t2), 0.5), m1 = mix(A(t1), B(t1), 0.5);
  chart(m2[0], m2[1], P, N); chart(m1[0], m1[1], Q, N);
  const dT = P.clone().sub(Q);
  chart(cm[0], cm[1], P, N);
  const flip = dS.cross(dT).dot(N) < 0;

  const wMid = widthAt(tm);
  const sig = edgeDense(segS, bevel / Math.max(1e-3, wMid));
  const tau = edgeDense(segT, bevel / Leff);
  const nu = sig.length, nv = tau.length;
  const outerPos = new Float32Array(nu * nv * 3);
  const innerPos = new Float32Array(nu * nv * 3);
  const uvs = new Float32Array(nu * nv * 2);
  for (let j = 0; j < nv; j++) {
    const L = L0 + Leff * tau[j];
    const t = tAt(L);
    const a = A(t), b = B(t);
    const w = widthAt(t);
    let s0 = w > 1e-5 ? gapA / w : 0.5;
    let s1 = w > 1e-5 ? 1 - gapB / w : 0.5;
    if (s1 - s0 < 0.02) { const mid = THREE.MathUtils.clamp(0.5 * (s0 + s1), 0, 1); s0 = mid - 0.01; s1 = mid + 0.01; }
    const wEff = w * (s1 - s0);
    for (let i = 0; i < nu; i++) {
      const s = s0 + (s1 - s0) * sig[i];
      const c = mix(a, b, s);
      chart(c[0], c[1], P, N);
      const d = Math.min(sig[i] * wEff, (1 - sig[i]) * wEff, tau[j] * Leff, (1 - tau[j]) * Leff);
      let bv = 0;
      if (bevel > 0 && d < bevel) { const k = bevel - d; bv = -(bevel - Math.sqrt(Math.max(0, bevel * bevel - k * k))); }
      const h = offset + (lift ? lift(s, t, P, N) : 0) + bv;
      const id = j * nu + i;
      outerPos[id * 3] = P.x + N.x * h; outerPos[id * 3 + 1] = P.y + N.y * h; outerPos[id * 3 + 2] = P.z + N.z * h;
      const hi = offset - thickness;
      innerPos[id * 3] = P.x + N.x * hi; innerPos[id * 3 + 1] = P.y + N.y * hi; innerPos[id * 3 + 2] = P.z + N.z * hi;
      uvs[id * 2] = L - L0; uvs[id * 2 + 1] = sig[i] * wEff;
    }
  }
  const idx = (i, j) => j * nu + i;
  const oi = [], ii = [];
  for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
    const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
    if (!flip) { oi.push(a, b, d, b, c, d); ii.push(a, d, b, b, d, c); }
    else { oi.push(a, d, b, b, d, c); ii.push(a, b, d, b, c, d); }
  }
  const mk = (pos, uv, index) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  };
  const outer = mk(outerPos, uvs, oi);
  const inner = mk(innerPos, uvs.slice(), ii);
  // side walls around the border loop
  const loop = [];
  for (let i = 0; i < nu; i++) loop.push(idx(i, 0));
  for (let j = 1; j < nv; j++) loop.push(idx(nu - 1, j));
  for (let i = nu - 2; i >= 0; i--) loop.push(idx(i, nv - 1));
  for (let j = nv - 2; j > 0; j--) loop.push(idx(0, j));
  const wp = new Float32Array((loop.length + 1) * 6);
  const wu = new Float32Array((loop.length + 1) * 4);
  const wi = [];
  let acc = 0;
  for (let k = 0; k <= loop.length; k++) {
    const id = loop[k % loop.length];
    if (k > 0) {
      const pv = loop[k - 1];
      acc += Math.hypot(outerPos[id * 3] - outerPos[pv * 3], outerPos[id * 3 + 1] - outerPos[pv * 3 + 1], outerPos[id * 3 + 2] - outerPos[pv * 3 + 2]);
    }
    wp.set([outerPos[id * 3], outerPos[id * 3 + 1], outerPos[id * 3 + 2], innerPos[id * 3], innerPos[id * 3 + 1], innerPos[id * 3 + 2]], k * 6);
    wu.set([acc, 0, acc, thickness], k * 4);
    if (k > 0) {
      const q = (k - 1) * 2;
      if (!flip) wi.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      else wi.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
    }
  }
  const walls = mk(wp, wu, wi);
  const merged = geo.mergeGeometries([outer, inner, walls], false);
  outer.dispose(); inner.dispose(); walls.dispose();
  merged.computeBoundingSphere();
  return merged;
}
