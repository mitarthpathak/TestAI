/**
 * PART: fins — the two curved side blades that sweep from the temples,
 * bow outward past the cheeks and end in points near the jaw.
 * Joints: finL / finR (root at the temple; rotate to flare the blades).
 */
export const meta = {
  id: 'fins',
  explode: [0, 0.2, 0.2],
};

export function build(ctx) {
  const { THREE, geo, anatomy, rig, materials: M } = ctx;
  const L = anatomy.LANDMARKS;

  const bladeMat = M.get('chrome', { roughness: 0.17, panel: 7, seed: 51, lineWidth: 0.0035, angle: 1.2 });
  const innerMat = M.get('gunmetal');

  const fins = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const jointName = `fin${key}`;
    const joint = ctx.space(jointName, 'local');
    // control points: HEAD space -> joint local
    const pts = L.finCurveL.map((p) => rig.toJointLocal(jointName, [p[0] * side, p[1], p[2]], 'head'));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const headCenterLocal = rig.toJointLocal(jointName, [0, 0.9, 0.1], 'head');
    const outward = (t) => {
      const p = curve.getPointAt(t);
      const d = p.clone().sub(headCenterLocal);
      d.y *= 0.3;
      return d.normalize();
    };

    // main blade: wide in the "sheet" direction, thin outward
    const blade = geo.sweptSection(curve, geo.bladeSection(0.075, 0.022, 24), {
      steps: 90,
      up: outward,
      scale: (t) => {
        const taper = t < 0.1 ? 0.55 + t * 4.5 : 1 - Math.pow((t - 0.1) / 0.9, 1.6) * 0.92;
        return [taper, 0.6 + taper * 0.4];
      },
    });
    const bladeMesh = ctx.mesh(blade, bladeMat, `fins.blade.${key}`);
    joint.add(bladeMesh);

    // secondary prong along the upper half (the forked look at the top)
    const pts2 = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12 * 0.5;
      const p = curve.getPointAt(t);
      const o = outward(t);
      pts2.push(p.clone().addScaledVector(o, -0.07).add(new THREE.Vector3(0, 0, -0.06)));
    }
    const prong = geo.sweptSection(new THREE.CatmullRomCurve3(pts2), geo.bladeSection(0.035, 0.015, 16), {
      steps: 40, up: outward, scale: (t) => 1 - t * 0.7,
    });
    joint.add(ctx.mesh(prong, innerMat, `fins.prong.${key}`));

    // root socket where the blade enters the skull
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.08, 24), innerMat);
    socket.position.copy(curve.getPointAt(0.0));
    socket.lookAt(socket.position.clone().add(outward(0)));
    socket.rotateX(Math.PI / 2);
    joint.add(socket);

    fins[key] = { joint, bladeMesh };
  }

  const params = { flare: 0, sweep: 0 };
  return {
    params,
    paramSpec: {
      flare: { min: -0.5, max: 0.5, step: 0.01 },
      sweep: { min: -0.5, max: 0.5, step: 0.01 },
    },
    apply(p) {
      // flare rotates each blade outward about the head's front-back axis
      rig.joints.finL.rotation.set(p.sweep, 0, p.flare);
      rig.joints.finR.rotation.set(p.sweep, 0, -p.flare);
    },
  };
}
