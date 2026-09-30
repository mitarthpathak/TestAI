/**
 * PART: lips — upper lip (on the head), lower lip (rides the jaw), two
 * corner pieces and the dark mouth slit.
 * Joints: lipUpper (child of head), lipLower (child of jaw). Space: HEAD.
 */
export const meta = {
  id: 'lips',
  explode: [0, -0.3, 1.1],
};

export function build(ctx) {
  const { THREE, geo, anatomy, rig, materials: M } = ctx;
  const upperRoot = ctx.space('lipUpper', 'head');
  const lowerRoot = ctx.space('lipLower', 'head');

  const lipMat = M.get('chrome', { roughness: 0.14 });
  const slitMat = M.get('cavity');

  const lipShape = (y0, y1, curve) => {
    const s = new THREE.Shape();
    s.moveTo(-0.22, (y0 + y1) / 2);
    s.quadraticCurveTo(0, y1 + curve, 0.22, (y0 + y1) / 2);
    s.quadraticCurveTo(0, y0 + curve * 0.4, -0.22, (y0 + y1) / 2);
    return s;
  };

  const upper = geo.conformPlate(lipShape(0.18, 0.24, 0.01), { depth: 0.03, offset: 0.02, bevel: 0.008, maxEdge: 0.02 });
  upperRoot.add(ctx.mesh(upper, lipMat, 'lips.upper'));
  const lower = geo.conformPlate(lipShape(0.1, 0.155, -0.012), { depth: 0.028, offset: 0.018, bevel: 0.008, maxEdge: 0.02 });
  lowerRoot.add(ctx.mesh(lower, lipMat, 'lips.lower'));

  // mouth slit — thin dark band between the lips
  const slit = geo.conformPlate((() => {
    const s = new THREE.Shape();
    s.moveTo(-0.24, 0.17);
    s.lineTo(0.24, 0.17);
    s.lineTo(0.24, 0.155);
    s.lineTo(-0.24, 0.155);
    s.closePath();
    return s;
  })(), { depth: 0.012, offset: 0.012, bevel: 0.0, maxEdge: 0.02 });
  upperRoot.add(ctx.mesh(slit, slitMat, 'lips.slit'));

  // corner pieces (pivot at each mouth corner so they can smile / sneer)
  const corners = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const pivot = new THREE.Group();
    const x = 0.235 * side;
    const z = (anatomy.headFrontZ(x, 0.165) ?? 0.6) + 0.02;
    pivot.position.set(x, 0.165, z);
    const piece = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.05, 6, 12), lipMat);
    piece.rotation.z = Math.PI / 2;
    piece.position.x = -0.02 * side;
    piece.name = `lips.corner.${key}`;
    pivot.add(piece);
    upperRoot.add(pivot);
    corners[key] = pivot;
  }

  const params = { part: 0, smile: 0, sneer: 0 };
  return {
    params,
    paramSpec: {
      part: { min: 0, max: 1, step: 0.01 },
      smile: { min: -1, max: 1, step: 0.01 },
      sneer: { min: 0, max: 1, step: 0.01 },
    },
    apply(p) {
      rig.joints.lipUpper.position.y = rig.joints.lipUpper.userData.restPosition.y + p.part * 0.015 + p.sneer * 0.012;
      rig.joints.lipLower.position.y = rig.joints.lipLower.userData.restPosition.y - p.part * 0.02;
      corners.L.rotation.z = p.smile * 0.35;
      corners.R.rotation.z = -p.smile * 0.35;
    },
  };
}
