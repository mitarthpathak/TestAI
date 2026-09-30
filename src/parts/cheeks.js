/**
 * PART: cheeks — the big circular "speaker" discs on both sides of the lower
 * face plus the C-shaped guard band that wraps each disc.
 * Joints: cheekL / cheekR (disc centre; local +Z = disc facing direction).
 */
export const meta = {
  id: 'cheeks',
  explode: [0, -0.1, 0.9],
};

export function build(ctx) {
  const { THREE, geo, anatomy, materials: M } = ctx;
  const L = anatomy.LANDMARKS;
  const R = L.cheekDiscRadius;

  const rimMat = M.get('chrome', { roughness: 0.18 });
  const ringMat = M.get('gunmetal', { roughness: 0.34 });
  const deep = M.get('darkMetal');
  const bandMat = M.get('chrome', { panel: 6, seed: 41, lineWidth: 0.004 });

  const sides = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const joint = ctx.space(`cheek${key}`, 'local');
    const facing = new THREE.Group();
    const n = new THREE.Vector3(L.cheekDiscNormalL[0] * side, L.cheekDiscNormalL[1], L.cheekDiscNormalL[2]);
    geo.faceDirection(facing, n);
    joint.add(facing);

    // outer rim (static)
    const rim = geo.ringStack([
      [R * 0.86, -0.02], [R * 0.9, 0.035], [R * 1.0, 0.045], [R * 1.08, 0.02], [R * 1.12, -0.06],
    ], 72);
    facing.add(ctx.mesh(rim, rimMat, `cheeks.rim.${key}`));

    // inner concentric grille (spins)
    const spin = new THREE.Group();
    facing.add(spin);
    const prof = [[0.0, -0.035], [R * 0.12, -0.035], [R * 0.14, -0.015], [R * 0.2, -0.015], [R * 0.22, -0.05]];
    let r = R * 0.22;
    let z = -0.05;
    for (let i = 0; i < 5; i++) {
      prof.push([r + R * 0.02, z + 0.025], [r + R * 0.1, z + 0.025], [r + R * 0.12, z - 0.004]);
      r += R * 0.12;
      z -= 0.004;
    }
    prof.push([R * 0.9, -0.08]);
    const grille = geo.ringStack(prof, 72);
    spin.add(ctx.mesh(grille, ringMat, `cheeks.grille.${key}`));
    const back = new THREE.Mesh(new THREE.CircleGeometry(R * 0.9, 48), deep);
    back.position.z = -0.085;
    spin.add(back);
    // radial spokes for visible rotation
    for (let i = 0; i < 6; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.012, R * 0.62, 0.012), rimMat);
      spoke.position.set(0, R * 0.5, -0.02);
      const holder = new THREE.Group();
      holder.rotation.z = (i / 6) * Math.PI * 2;
      holder.add(spoke);
      spin.add(holder);
    }

    // C-shaped guard band around the front/bottom of the disc
    const arc = [];
    for (let a = 0; a <= 1.0001; a += 1 / 40) {
      const ang = THREE.MathUtils.lerp(0.35 * Math.PI, 1.6 * Math.PI, a);
      arc.push(new THREE.Vector3(Math.cos(ang) * R * 1.22 * -side, Math.sin(ang) * R * 1.22, 0.03));
    }
    const band = geo.sweptSection(new THREE.CatmullRomCurve3(arc), geo.roundedSection(0.045, 0.03, 4, 20), {
      steps: 60, up: new THREE.Vector3(0, 0, 1),
      scale: (t) => [0.6 + Math.sin(t * Math.PI) * 0.6, 1],
    });
    facing.add(ctx.mesh(band, bandMat, `cheeks.band.${key}`));

    sides[key] = { joint, spin };
  }

  const params = { spin: 0, spinSpeed: 0.15, pulse: 0 };
  return {
    params,
    paramSpec: {
      spin: { min: -Math.PI, max: Math.PI, step: 0.01 },
      spinSpeed: { min: -2, max: 2, step: 0.01 },
      pulse: { min: 0, max: 1, step: 0.01 },
    },
    apply(p) {
      sides.L.spin.rotation.z = p.spin;
      sides.R.spin.rotation.z = -p.spin;
    },
    update(t, dt, p) {
      if (p.spinSpeed) {
        sides.L.spin.rotation.z += p.spinSpeed * dt;
        sides.R.spin.rotation.z -= p.spinSpeed * dt;
      }
      const k = 1 + Math.sin(t * 6) * 0.01 * p.pulse;
      sides.L.spin.scale.setScalar(k);
      sides.R.spin.scale.setScalar(k);
    },
  };
}
