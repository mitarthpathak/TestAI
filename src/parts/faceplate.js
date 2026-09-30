/**
 * PART: faceplate — forehead, central nose plate, cheekbone plates and the
 * face mask with the eye-socket openings.
 * Joint: head. Authoring space: HEAD.
 */
export const meta = {
  id: 'faceplate',
  explode: [0, 0.2, 1.0],
};

export function build(ctx) {
  const { THREE, geo, anatomy, materials: M } = ctx;
  const root = ctx.space('head', 'head');
  const L = anatomy.LANDMARKS;

  const mask = M.get('chrome', { panel: 3.4, seed: 5, lineWidth: 0.0045 });
  const bright = M.get('chrome', { roughness: 0.15, panel: 4, seed: 9, lineWidth: 0.004 });
  const dark = M.get('darkMetal');

  // --- face mask: one shell plate with eye sockets carved out (CSG)
  let face = geo.shellPatch({
    u0: -1.04, u1: 1.04, y0: 0.5, y1: 1.3,
    offset: 0.006, thickness: 0.07, bevel: 0.014, gap: 0.008, segU: 56, segV: 40,
    // sculpt: brow bulge above the eyes, recess under them
    lift: (u, y) => {
      const brow = Math.exp(-Math.pow((y - 1.08) / 0.06, 2)) * 0.03 * Math.exp(-Math.pow((Math.abs(u) - 0.45) / 0.35, 2));
      const under = -Math.exp(-Math.pow((y - 0.78) / 0.09, 2)) * 0.018 * Math.exp(-Math.pow((Math.abs(u) - 0.5) / 0.25, 2));
      return brow + under;
    },
  });
  face = geo.carve(face, ['eyeL', 'eyeR', 'cheekL', 'cheekR']);
  root.add(ctx.mesh(face, mask, 'faceplate.mask'));

  // --- central nose plate: long tapered blade from the brow to above the mouth
  const nose = new THREE.Shape();
  nose.moveTo(0, 1.34);
  nose.lineTo(0.07, 1.2);
  nose.lineTo(0.06, 0.95);
  nose.lineTo(0.12, 0.62);
  nose.lineTo(0.1, 0.46);
  nose.lineTo(0.0, 0.4);
  nose.lineTo(-0.1, 0.46);
  nose.lineTo(-0.12, 0.62);
  nose.lineTo(-0.06, 0.95);
  nose.lineTo(-0.07, 1.2);
  nose.closePath();
  const noseGeo = geo.conformPlate(nose, {
    depth: 0.05, offset: 0.03, bevel: 0.012, maxEdge: 0.03,
    // central keel: raise the middle, most at the bridge
    lift: (u, y, x) => (0.05 - Math.abs(x) * 0.35) * THREE.MathUtils.smoothstep(y, 0.4, 0.8),
  });
  root.add(ctx.mesh(noseGeo, bright, 'faceplate.nose'));

  // --- forehead widow's-peak plate
  const fore = new THREE.Shape();
  fore.moveTo(0, 1.22);
  fore.lineTo(0.2, 1.3);
  fore.lineTo(0.5, 1.42);
  fore.lineTo(0.62, 1.62);
  fore.lineTo(0.12, 1.66);
  fore.lineTo(0, 1.5);
  fore.lineTo(-0.12, 1.66);
  fore.lineTo(-0.62, 1.62);
  fore.lineTo(-0.5, 1.42);
  fore.lineTo(-0.2, 1.3);
  fore.closePath();
  root.add(ctx.mesh(geo.conformPlate(fore, { depth: 0.035, offset: 0.012, bevel: 0.01 }), mask, 'faceplate.forehead'));

  // --- cheekbone plates (under the eyes, sweeping back to the temples)
  const cheekbones = geo.symmetric((side) => {
    const s = new THREE.Shape();
    const X = (x) => x * side;
    s.moveTo(X(0.14), 0.82);
    s.lineTo(X(0.28), 0.8);
    s.lineTo(X(0.52), 0.84);
    s.lineTo(X(0.66), 0.95);
    s.lineTo(X(0.7), 0.82);
    s.lineTo(X(0.52), 0.68);
    s.lineTo(X(0.3), 0.64);
    s.lineTo(X(0.15), 0.66);
    s.closePath();
    const g = geo.conformPlate(s, { depth: 0.035, offset: 0.03, bevel: 0.01 });
    return ctx.mesh(g, bright, `faceplate.cheekbone.${side > 0 ? 'L' : 'R'}`);
  });
  root.add(cheekbones);

  // --- dark seams between nose and mask
  for (const side of [1, -1]) {
    const pts = [[0.07, 1.2], [0.065, 0.95], [0.13, 0.62], [0.11, 0.46]].map(([x, y]) => {
      const z = anatomy.headFrontZ(x * side, y) ?? 0.7;
      return new THREE.Vector3(x * side, y, z + 0.02);
    });
    const c = new THREE.CatmullRomCurve3(pts);
    root.add(ctx.mesh(geo.sweptSection(c, geo.roundedSection(0.01, 0.01, 2, 8), { steps: 40 }), dark, 'faceplate.seam'));
  }

  return { params: {}, paramSpec: {} };
}
