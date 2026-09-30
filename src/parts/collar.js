/**
 * PART: collar — shoulders / trapezius, collarbones, sternum, upper chest
 * (the bust is cut just below the collarbones).
 * Joint: chest. Authoring space: BODY.
 */
export const meta = {
  id: 'collar',
  explode: [0, -0.8, 0.2],
};

export function build(ctx) {
  const { THREE, geo, materials: M } = ctx;
  const root = ctx.space('chest', 'body');

  const torso = geo.profileSurface([
    { y: -0.62, w: 1.95, zf: 0.64, zb: 0.6,  n: 3.2, zc: 0.0 },
    { y: -0.3,  w: 2.0,  zf: 0.66, zb: 0.62, n: 3.4, zc: 0.0 },
    { y: 0.0,   w: 1.85, zf: 0.62, zb: 0.6,  n: 3.4, zc: 0.0 },
    { y: 0.18,  w: 1.45, zf: 0.56, zb: 0.56, n: 3.2, zc: 0.0 },
    { y: 0.32,  w: 0.95, zf: 0.5,  zb: 0.52, n: 2.8, zc: 0.0 },
    { y: 0.44,  w: 0.6,  zf: 0.46, zb: 0.5,  n: 2.5, zc: 0.0 },
    { y: 0.5,   w: 0.5,  zf: 0.44, zb: 0.48, n: 2.4, zc: 0.0 },
  ]);
  const S = { surface: torso.surface, normal: torso.normal };

  const coreMat = M.get('darkMetal');
  const plateMat = M.get('gunmetal', { panel: 2.6, seed: 81, lineWidth: 0.006 });
  const plate2 = M.get('chrome', { panel: 3.2, seed: 83, lineWidth: 0.005 });
  const barMat = M.get('chrome', { roughness: 0.16 });

  root.add(ctx.mesh(geo.surfaceSheet({ ...S, u0: -Math.PI, u1: Math.PI, y0: -0.62, y1: 0.5, segU: 96, segV: 32, offset: -0.03 }), coreMat, 'collar.core'));

  let k = 0;
  for (const side of [1, -1]) {
    const add = (a, b, y0, y1, mat, extra = {}) => {
      const g = geo.shellPatch({
        ...S, u0: side > 0 ? a : -b, u1: side > 0 ? b : -a, y0, y1,
        offset: 0.0, thickness: 0.06, bevel: 0.02, gap: 0.014, segU: 22, segV: 12, ...extra,
      });
      root.add(ctx.mesh(g, mat, `collar.plate.${k++}.${side > 0 ? 'L' : 'R'}`));
    };
    // trapezius (top of the shoulder, sloping to the neck)
    add(0.35, 1.25, 0.12, 0.47, plateMat);
    add(1.25, 2.2, 0.05, 0.4, plateMat);
    add(2.2, 3.1, 0.1, 0.45, plateMat);
    // pectoral plates (upper chest)
    add(0.1, 0.62, -0.6, -0.08, plate2, { offset: 0.01 });
    add(0.62, 1.15, -0.6, -0.05, plateMat);
    // shoulder caps
    add(1.15, 1.9, -0.6, 0.02, plate2, { offset: 0.02, thickness: 0.08 });
    add(1.9, 2.6, -0.6, 0.02, plateMat);

    // clavicle bar
    const pts = [
      [0.1 * side, 0.2, 0.52],
      [0.6 * side, 0.18, 0.6],
      [1.15 * side, 0.12, 0.5],
      [1.62 * side, 0.05, 0.3],
    ].map((p) => new THREE.Vector3(...p));
    const bar = geo.sweptSection(new THREE.CatmullRomCurve3(pts), geo.roundedSection(0.07, 0.045, 3.5, 20), {
      steps: 60, up: new THREE.Vector3(0, 1, 0.2).normalize(), scale: (t) => 1 - t * 0.35,
    });
    root.add(ctx.mesh(bar, barMat, `collar.clavicle.${side > 0 ? 'L' : 'R'}`));
  }

  // sternum plate
  const sternum = geo.shellPatch({
    ...S, u0: -0.1, u1: 0.1, y0: -0.6, y1: 0.28, offset: 0.03, thickness: 0.06, bevel: 0.02, gap: 0.01, segU: 8, segV: 24,
  });
  root.add(ctx.mesh(sternum, barMat, 'collar.sternum'));

  return { params: {}, paramSpec: {} };
}
