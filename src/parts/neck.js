/**
 * PART: neck — segmented front column, side cable bundles, back plates.
 * Joint: neck. Authoring space: BODY.
 */
export const meta = {
  id: 'neck',
  explode: [0, 0.1, 0.6],
};

export function build(ctx) {
  const { THREE, geo, materials: M } = ctx;
  const root = ctx.space('neck', 'body');

  const neckSurf = geo.profileSurface([
    { y: 0.1,  w: 0.56, zf: 0.44, zb: 0.5,  n: 2.6, zc: 0.02 },
    { y: 0.4,  w: 0.46, zf: 0.4,  zb: 0.44, n: 2.4, zc: 0.02 },
    { y: 0.9,  w: 0.42, zf: 0.38, zb: 0.42, n: 2.3, zc: 0.0 },
    { y: 1.4,  w: 0.44, zf: 0.4,  zb: 0.44, n: 2.3, zc: 0.0 },
    { y: 1.7,  w: 0.48, zf: 0.42, zb: 0.46, n: 2.3, zc: 0.0 },
  ]);
  const S = { surface: neckSurf.surface, normal: neckSurf.normal };

  const coreMat = M.get('darkMetal');
  const segMat = M.get('chrome', { panel: 5, seed: 71, lineWidth: 0.004 });
  const sideMat = M.get('gunmetal', { panel: 4, seed: 73, lineWidth: 0.004 });
  const cableMat = M.get('cable');

  // core
  root.add(ctx.mesh(geo.surfaceSheet({ ...S, u0: -Math.PI, u1: Math.PI, y0: 0.1, y1: 1.7, segU: 64, segV: 24, offset: -0.03 }), coreMat, 'neck.core'));

  // front column: stacked segments (trachea / spine-like)
  const segs = 9;
  for (let i = 0; i < segs; i++) {
    const y0 = 0.22 + i * 0.13;
    const g = geo.shellPatch({
      ...S, u0: -0.42, u1: 0.42, y0, y1: y0 + 0.13,
      offset: 0.02 + Math.sin((i / segs) * Math.PI) * 0.01, thickness: 0.06, bevel: 0.018, gap: 0.012, segU: 16, segV: 6,
    });
    root.add(ctx.mesh(g, segMat, `neck.segment.${i}`));
  }

  // side plates + back plates
  for (const side of [1, -1]) {
    const spans = [[0.55, 1.2], [1.25, 2.0], [2.05, 3.05]];
    spans.forEach(([a, b], k) => {
      for (let j = 0; j < 4; j++) {
        const y0 = 0.2 + j * 0.34;
        const g = geo.shellPatch({
          ...S, u0: side > 0 ? a : -b, u1: side > 0 ? b : -a, y0, y1: y0 + 0.34,
          offset: 0.0, thickness: 0.05, bevel: 0.012, gap: 0.012, segU: 12, segV: 8,
        });
        root.add(ctx.mesh(g, sideMat, `neck.plate.${k}.${j}.${side > 0 ? 'L' : 'R'}`));
      }
    });

    // cable bundle (sternocleidomastoid): behind the ear down to the sternum
    for (let c = 0; c < 3; c++) {
      const pts = [
        [0.44 * side, 1.62, -0.12 + c * 0.05],
        [0.47 * side, 1.1, 0.02 + c * 0.05],
        [0.36 * side, 0.55, 0.26 + c * 0.035],
        [0.14 * side, 0.25, 0.42 + c * 0.02],
      ].map((p) => new THREE.Vector3(...p));
      const g = geo.sweptSection(new THREE.CatmullRomCurve3(pts), geo.roundedSection(0.03, 0.03, 2.2, 14), { steps: 48 });
      root.add(ctx.mesh(g, c === 1 ? sideMat : cableMat, `neck.cable.${c}.${side > 0 ? 'L' : 'R'}`));
    }
  }

  return { params: {}, paramSpec: {} };
}
