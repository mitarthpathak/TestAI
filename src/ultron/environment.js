/**
 * Procedural studio environment for chrome reflections + scene lights.
 * OWNER: lead / integrator.
 */
import * as THREE from 'three';

/** Dark studio with a few soft boxes; returns a PMREM texture. */
export function createStudioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x020203);

  // gradient room: bright-ish ceiling, dim concrete walls, dark floor.
  // Chrome needs something to reflect or it reads as black.
  const roomGeo = new THREE.SphereGeometry(20, 48, 24);
  const colors = [];
  const top = new THREE.Color(0.34, 0.34, 0.35);
  const mid = new THREE.Color(0.12, 0.115, 0.105);
  const bot = new THREE.Color(0.03, 0.028, 0.026);
  const c = new THREE.Color();
  const pa = roomGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const h = pa.getY(i) / 20; // -1..1
    if (h > 0) c.lerpColors(mid, top, Math.pow(h, 0.8));
    else c.lerpColors(mid, bot, Math.pow(-h, 0.5));
    colors.push(c.r, c.g, c.b);
  }
  roomGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const room = new THREE.Mesh(roomGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  env.add(room);

  // soft gradient floor bounce (warm-ish concrete like the reference garage)
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(12, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.07, 0.065, 0.058) })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -6;
  env.add(floor);

  const box = (w, h, color, intensity, pos, lookAt = [0, 0, 0]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    m.position.set(...pos);
    m.lookAt(...lookAt);
    env.add(m);
  };
  // key: large overhead strip slightly in front
  box(10, 2.2, 0xffffff, 2.2, [0, 9, 4]);
  // overhead beams / strip lights (the garage in the front reference)
  box(14, 0.5, 0xffffff, 1.4, [0, 8, -3]);
  box(0.5, 14, 0xf2ece2, 0.9, [-6, 8, 2], [0, 0, 0]);
  // cool rim left, warm rim right
  box(1.4, 12, 0xcfe0ff, 1.6, [-10, 2, -4]);
  box(1.4, 12, 0xffe6cf, 1.3, [10, 2, -5]);
  // broad soft front fill, low + a dim wall behind the camera (gives chrome mid-tones)
  box(9, 1.6, 0xffffff, 0.7, [0, -1, 12]);
  box(16, 8, 0x9a948a, 0.16, [0, 3, 15]);
  // small kicker for crisp specular pings
  box(0.6, 3, 0xffffff, 1.2, [6, 5, 8]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.02);
  pmrem.dispose();
  env.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  return rt.texture;
}

/** Direct lights (for crisp shading on top of the IBL). */
export function createLights() {
  const g = new THREE.Group();
  g.name = 'lights';
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(2.5, 7, 5);
  const rimL = new THREE.DirectionalLight(0xbfd4ff, 1.5);
  rimL.position.set(-6, 3, -4);
  const rimR = new THREE.DirectionalLight(0xffe2c8, 1.2);
  rimR.position.set(6, 2.5, -5);
  const fill = new THREE.HemisphereLight(0x8a93a0, 0x151210, 0.35);
  // red bounce from the eyes onto cheeks / nose
  const eyeBounce = new THREE.PointLight(0xff2010, 0.6, 1.6, 2);
  eyeBounce.position.set(0, 2.25, 1.15); // just in front of the eyes (world)
  eyeBounce.name = 'eyeBounce';
  g.add(key, rimL, rimR, fill, eyeBounce);
  g.userData = { key, rimL, rimR, fill, eyeBounce };
  return g;
}
