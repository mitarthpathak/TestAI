/**
 * Procedural studio environment for chrome reflections + scene lights.
 * OWNER: lead / integrator.
 */
import * as THREE from 'three';

/** Dark studio with a few soft boxes; returns a PMREM texture. */
export function createStudioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x020203);

  // Dark "MW3" stage: near-black room so chrome only picks up a few hard
  // strip lights (key above-front, cold rims behind). No fill walls.
  const roomGeo = new THREE.SphereGeometry(20, 48, 24);
  const colors = [];
  const top = new THREE.Color(0.055, 0.058, 0.064);
  const mid = new THREE.Color(0.016, 0.016, 0.018);
  const bot = new THREE.Color(0.004, 0.004, 0.004);
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

  const box = (w, h, color, intensity, pos, lookAt = [0, 0, 0]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    m.position.set(...pos);
    m.lookAt(...lookAt);
    env.add(m);
  };
  // key softbox: high, front-left (matches the shadow-casting key light)
  box(5, 2.4, 0xfff1e2, 2.0, [-4, 8, 6]);
  // thin overhead strip for the crest highlight
  box(8, 0.35, 0xffffff, 1.6, [0, 9, 0]);
  // cold rim strips behind on both sides
  box(1.0, 12, 0xd2dcec, 1.9, [-9, 3, -7]);
  box(1.0, 12, 0xd2dcec, 1.6, [9, 3, -7]);
  // big dim soft panel front-left: gives the chrome readable mid-tones
  box(14, 9, 0xc9ccd2, 0.22, [-8, 3, 9]);
  // very faint warm floor bounce
  box(10, 10, 0x6b5a48, 0.05, [0, -8, 3]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.02);
  pmrem.dispose();
  env.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  return rt.texture;
}

/**
 * Direct lights — cinematic "MW3" setup: one hard key that casts soft
 * shadows, two cold rim lights from behind, almost no fill, plus the small
 * red bounce from the eyes. Everything else is darkness.
 */
export function createLights() {
  const g = new THREE.Group();
  g.name = 'lights';

  const key = new THREE.DirectionalLight(0xfff2e6, 2.3);
  key.position.set(-3.2, 7.5, 5.5);
  key.target.position.set(0, 1.8, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.8;
  key.shadow.camera.bottom = -1.6;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 20;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;

  const rimL = new THREE.DirectionalLight(0xcdd8ea, 2.2);
  rimL.position.set(-5.5, 3.5, -6);
  const rimR = new THREE.DirectionalLight(0xcdd8ea, 1.7);
  rimR.position.set(5.5, 3, -6);
  // barely-there fill so the shadow side isn't pure black
  const fill = new THREE.DirectionalLight(0x8e9bb0, 0.12);
  fill.position.set(4, 1, 6);
  // red bounce from the eyes onto cheeks / nose
  const eyeBounce = new THREE.PointLight(0xff2010, 0.6, 1.6, 2);
  eyeBounce.position.set(0, 2.25, 1.15); // just in front of the eyes (world)
  eyeBounce.name = 'eyeBounce';
  g.add(key, key.target, rimL, rimR, fill, eyeBounce);
  g.userData = { key, rimL, rimR, fill, eyeBounce };
  return g;
}
