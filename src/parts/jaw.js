/**
 * PART: jaw — mandible plates, chin and chin button, inner mouth cavity.
 * Joint: jaw (hinge axis = X). Authoring space: HEAD.
 * `open` rotates the whole jaw joint, carrying the lower lip with it.
 */
export const meta = {
  id: 'jaw',
  explode: [0, -0.9, 0.5],
};

export function build(ctx) {
  const { THREE, geo, anatomy, rig, materials: M } = ctx;
  const L = anatomy.LANDMARKS;
  const root = ctx.space('jaw', 'head');

  const chinMat = M.get('chrome', { panel: 4.2, seed: 61, lineWidth: 0.0045 });
  const sideMat = M.get('gunmetal', { panel: 3.6, seed: 67, lineWidth: 0.0045 });
  const bright = M.get('chrome', { roughness: 0.15 });

  // chin plate (front, below the mouth)
  const chin = geo.shellPatch({
    u0: -0.62, u1: 0.62, y0: -0.29, y1: 0.1,
    offset: 0.008, thickness: 0.06, bevel: 0.016, gap: 0.008, segU: 40, segV: 24,
    lift: (u, y) => 0.02 * Math.exp(-Math.pow(u / 0.25, 2)) * THREE.MathUtils.smoothstep(y, -0.3, 0.0),
  });
  root.add(ctx.mesh(chin, chinMat, 'jaw.chin'));

  // mandible side plates
  for (const side of [1, -1]) {
    const u0 = side > 0 ? 0.62 : -1.5;
    const u1 = side > 0 ? 1.5 : -0.62;
    let g = geo.shellPatch({
      u0, u1, y0: -0.18, y1: 0.24,
      offset: 0.004, thickness: 0.05, bevel: 0.012, gap: 0.008, segU: 28, segV: 18,
    });
    g = geo.carve(g, [side > 0 ? 'cheekL' : 'cheekR']);
    root.add(ctx.mesh(g, sideMat, `jaw.mandible.${side > 0 ? 'L' : 'R'}`));

    // jaw-line bar from hinge to chin
    const pts = [
      [0.64 * side, 0.42, 0.02],
      [0.6 * side, 0.12, 0.2],
      [0.42 * side, -0.12, 0.42],
      [0.16 * side, -0.27, 0.56],
    ].map((p) => new THREE.Vector3(...p));
    const bar = geo.sweptSection(new THREE.CatmullRomCurve3(pts), geo.roundedSection(0.035, 0.025, 4, 16), {
      steps: 50, up: new THREE.Vector3(side, 0, 0.3).normalize(),
    });
    root.add(ctx.mesh(bar, bright, `jaw.line.${side > 0 ? 'L' : 'R'}`));
  }

  // chin button
  const btn = geo.ringStack([[0, 0.05], [0.05, 0.048], [0.062, 0.035], [0.07, 0.036], [0.08, 0.02], [0.09, 0.0]], 48);
  const btnMesh = ctx.mesh(btn, bright, 'jaw.button');
  btnMesh.position.fromArray(L.chinButton);
  geo.faceDirection(btnMesh, new THREE.Vector3(0, -0.35, 1));
  root.add(btnMesh);

  // inner mouth cavity (visible when the jaw opens)
  const cavity = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.3), M.get('cavity'));
  cavity.position.set(0, 0.07, 0.48);
  root.add(cavity);

  const params = { open: 0, shift: 0, clench: 0 };
  return {
    params,
    paramSpec: {
      open: { min: 0, max: 1, step: 0.01 },
      shift: { min: -1, max: 1, step: 0.01 },
      clench: { min: 0, max: 1, step: 0.01 },
    },
    apply(p) {
      const j = rig.joints.jaw;
      j.rotation.x = p.open * 0.32;
      j.rotation.y = p.shift * 0.06;
      j.position.z = j.userData.restPosition.z - p.clench * 0.02;
    },
  };
}
