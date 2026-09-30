/**
 * PART: eyes — sockets, glowing red lenses, and brow plates.
 * Joints: eyeL / eyeR (lens + socket), browL / browR (brow plates).
 * Authoring: each eye is built around its own joint origin (local space),
 * so rotating the joint makes the eye "look".
 */
export const meta = {
  id: 'eyes',
  explode: [0, 0.1, 1.4],
};

export function build(ctx) {
  const { THREE, geo, anatomy, materials: M } = ctx;
  const L = anatomy.LANDMARKS;

  const glow = M.get('eyeGlow', { intensity: 7 });
  const glowDim = M.get('eyeGlow', { intensity: 2.2 });
  const cavity = M.get('cavity');
  const rim = M.get('darkMetal');
  const browMat = M.get('chrome', { roughness: 0.18, panel: 5, seed: 31, lineWidth: 0.004 });

  const eyes = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const joint = ctx.space(`eye${key}`, 'local'); // authored around the joint origin

    const tilt = new THREE.Group();
    tilt.rotation.set(0, side * 0.35, side * L.socketTilt);
    joint.add(tilt);

    // socket: dark cup behind the lens (open side faces +Z)
    const cupGeo = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    cupGeo.rotateX(-Math.PI / 2);
    const cupMesh = ctx.mesh(cupGeo, M.get('cavity', { side: THREE.DoubleSide }), `eyes.socket.${key}`);
    cupMesh.scale.set(L.socketRadii[0] * 1.05, L.socketRadii[1] * 1.2, 0.14);
    cupMesh.position.z = 0.1;
    tilt.add(cupMesh);

    // lens: concentric rings, glowing
    const lens = new THREE.Group();
    lens.position.z = 0.02;
    tilt.add(lens);
    const r = L.eyeRadius;
    const outer = geo.ringStack([[r * 0.95, 0.0], [r * 1.0, 0.012], [r * 1.35, 0.012], [r * 1.45, 0.0]], 48);
    lens.add(ctx.mesh(outer, rim, `eyes.bezel.${key}`));
    const ring = geo.ringStack([[r * 0.55, 0.004], [r * 0.95, 0.004]], 48);
    lens.add(ctx.mesh(ring, glowDim, `eyes.ring.${key}`));
    const core = new THREE.Mesh(new THREE.CircleGeometry(r * 0.48, 40), glow);
    core.position.z = 0.006;
    core.name = `eyes.core.${key}`;
    lens.add(core);
    const pupil = new THREE.Mesh(new THREE.RingGeometry(r * 0.2, r * 0.3, 40), M.get('cavity'));
    pupil.position.z = 0.008;
    pupil.name = `eyes.pupil.${key}`;
    lens.add(pupil);

    // brow plate on its own joint (for expressions)
    const browJoint = ctx.space(`brow${key}`, 'local');
    const bs = new THREE.Shape();
    bs.moveTo(-0.2, 0.0);
    bs.lineTo(0.18, 0.06);
    bs.lineTo(0.2, 0.1);
    bs.lineTo(-0.16, 0.07);
    bs.closePath();
    const bg = new THREE.ExtrudeGeometry(bs, { depth: 0.07, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 });
    bg.translate(0, -0.04, -0.07);
    const brow = ctx.mesh(bg, browMat, `eyes.brow.${key}`);
    brow.scale.x = side;
    brow.rotation.set(-0.25, side * 0.3, 0);
    browJoint.add(brow);

    eyes[key] = { joint, lens, core, pupil, brow, browJoint };
  }

  const params = { glow: 1, pupil: 1, lookX: 0, lookY: 0, browL: 0, browR: 0, flicker: true };
  return {
    params,
    paramSpec: {
      glow: { min: 0, max: 3, step: 0.01 },
      pupil: { min: 0.3, max: 2, step: 0.01 },
      lookX: { min: -1, max: 1, step: 0.01 },
      lookY: { min: -1, max: 1, step: 0.01 },
      browL: { min: -1, max: 1, step: 0.01 },
      browR: { min: -1, max: 1, step: 0.01 },
      flicker: {},
    },
    apply(p) {
      for (const [key, e] of Object.entries(eyes)) {
        e.lens.rotation.set(-p.lookY * 0.25, p.lookX * 0.3, 0);
        e.pupil.scale.setScalar(p.pupil);
        const b = key === 'L' ? p.browL : p.browR;
        e.browJoint.position.y = b * 0.03;
        e.browJoint.rotation.z = (key === 'L' ? 1 : -1) * b * 0.15;
      }
    },
    update(t, dt, p) {
      const f = p.flicker ? 1 + Math.sin(t * 7.3) * 0.04 + Math.sin(t * 23.1) * 0.03 : 1;
      M.setGlow(p.glow * f);
    },
  };
}
