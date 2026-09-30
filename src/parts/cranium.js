/**
 * PART: cranium — skull dome, crown ridge, temples, back of the head, and the
 * dark under-shell that shows through every panel gap.
 * Joint: head. Authoring space: HEAD.
 */
export const meta = {
  id: 'cranium',
  explode: [0, 0.9, -0.5],
};

export function build(ctx) {
  const { THREE, geo, anatomy, materials: M } = ctx;
  const root = ctx.space('head', 'head');
  const { headSurface, headNormal } = anatomy;

  const core = M.get('darkMetal');
  const plateA = M.get('chrome', { panel: 2.4, seed: 11, lineWidth: 0.005 });
  const plateB = M.get('gunmetal', { panel: 3.1, seed: 23, lineWidth: 0.005 });
  const ridgeMat = M.get('chrome', { roughness: 0.16 });

  // 1. dark under-shell (slightly inset) — fills every gap
  const under = geo.surfaceSheet({
    surface: headSurface, normal: headNormal,
    u0: -Math.PI, u1: Math.PI, y0: -0.28, y1: 1.995, segU: 160, segV: 110, offset: -0.028,
    // keep clear of the eye sockets and cheek discs so they stay visible
    keep: (p) => !anatomy.insideCutout(p, ['eyeL', 'eyeR', 'cheekL', 'cheekR'], -0.01),
  });
  root.add(ctx.mesh(under, core, 'cranium.core'));

  // 2. armour plates (left side built, then mirrored)
  const bands = [
    // [y0, y1, list of [u0, u1]]  (u measured on the LEFT side, 0 = front)
    [0.35, 0.82, [[1.02, 1.45], [1.45, 1.95], [1.95, 2.5], [2.5, Math.PI]]],
    [0.82, 1.28, [[1.0, 1.32], [1.32, 1.8], [1.8, 2.35], [2.35, Math.PI]]],
    [1.28, 1.6, [[0.12, 0.62], [0.62, 1.15], [1.15, 1.7], [1.7, 2.4], [2.4, Math.PI - 0.1]]],
    [1.6, 1.84, [[0.12, 0.7], [0.7, 1.5], [1.5, 2.3], [2.3, Math.PI - 0.1]]],
    [1.84, 1.985, [[0.12, 1.1], [1.1, 2.1], [2.1, Math.PI - 0.1]]],
  ];
  const plates = [];
  let k = 0;
  for (const [y0, y1, spans] of bands) {
    for (const [u0, u1] of spans) {
      for (const side of [1, -1]) {
        const a = side > 0 ? u0 : -u1;
        const b = side > 0 ? u1 : -u0;
        let g = geo.shellPatch({
          u0: a, u1: b, y0, y1,
          offset: 0.0 + (k % 3) * 0.004,
          thickness: 0.05, bevel: 0.012, gap: 0.011,
          segU: 20, segV: 14,
        });
        // plates next to the cheek discs must keep the disc opening clear
        if (y0 < 0.7 && u0 < 1.5) g = geo.carve(g, [side > 0 ? 'cheekL' : 'cheekR']);
        const m = ctx.mesh(g, k % 2 ? plateB : plateA, `cranium.plate.${k}.${side > 0 ? 'L' : 'R'}`);
        root.add(m);
        plates.push(m);
      }
      k++;
    }
  }

  // 3. crown ridge — raised spine from the forehead over the top to the nape
  const pts = [];
  for (let y = 1.3; y <= 2.0; y += 0.05) pts.push(headSurface(0, y, new THREE.Vector3()));
  pts.push(headSurface(0, 2.018, new THREE.Vector3()));
  for (let y = 2.0; y >= 0.5; y -= 0.06) pts.push(headSurface(Math.PI, y, new THREE.Vector3()));
  const n = new THREE.Vector3();
  const ridgePts = pts.map((p) => {
    // push slightly outward from the head centre
    const c = new THREE.Vector3(0, 1.05, -0.05);
    n.copy(p).sub(c).normalize();
    return p.clone().addScaledVector(n, 0.012);
  });
  const ridgeCurve = new THREE.CatmullRomCurve3(ridgePts, false, 'centripetal');
  const ridge = geo.sweptSection(ridgeCurve, geo.roundedSection(0.075, 0.035, 5, 28), {
    steps: 140,
    up: (t) => {
      const p = ridgeCurve.getPointAt(t);
      return p.clone().sub(new THREE.Vector3(0, 1.05, -0.05)).normalize();
    },
    scale: (t) => [1 - 0.35 * Math.pow(Math.abs(t - 0.3) / 0.7, 2), 1],
  });
  root.add(ctx.mesh(ridge, ridgeMat, 'cranium.ridge'));

  // twin grooves flanking the ridge (dark inlay)
  for (const side of [1, -1]) {
    const gp = [];
    for (let y = 1.32; y <= 1.99; y += 0.05) gp.push(headSurface(side * 0.1, y, new THREE.Vector3()));
    for (let y = 1.99; y >= 0.6; y -= 0.08) gp.push(headSurface(side * (Math.PI - 0.1), y, new THREE.Vector3()));
    const curve = new THREE.CatmullRomCurve3(gp, false, 'centripetal');
    const g = geo.sweptSection(curve, geo.roundedSection(0.012, 0.012, 2, 8), { steps: 90 });
    root.add(ctx.mesh(g, M.get('cavity'), `cranium.groove.${side > 0 ? 'L' : 'R'}`));
  }

  const params = { panelLift: 0 };
  return {
    params,
    paramSpec: { panelLift: { min: 0, max: 0.08, step: 0.001 } },
    apply(p) {
      // "breathing" plates: lift every plate along its average normal
      for (const m of plates) {
        if (!m.userData.dir) {
          m.geometry.computeBoundingSphere();
          m.userData.dir = m.geometry.boundingSphere.center.clone().sub(new THREE.Vector3(0, 1.05, 0)).normalize();
        }
        m.position.copy(m.userData.dir).multiplyScalar(p.panelLift);
      }
    },
  };
}
