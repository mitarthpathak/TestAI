/**
 * Procedural studio environment for chrome reflections + scene lights.
 * OWNER: lead / integrator.
 */
import * as THREE from 'three';

/**
 * Film-grade environment (reference/ultron-film-*.png): a cool blue-grey
 * night-city light field so the steel reads as mid-tone gunmetal with cold
 * reflections, a large soft key above-front-left, cold rims behind, an
 * overhead strip for the crest highlight and a few small warm sources low
 * behind (the orange bokeh in the plates). Returns a PMREM texture.
 */
export function createStudioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x05070a);

  const roomGeo = new THREE.SphereGeometry(20, 64, 32);
  const colors = [];
  const top = new THREE.Color(0.2, 0.235, 0.27);
  const horizon = new THREE.Color(0.07, 0.095, 0.115);
  const bot = new THREE.Color(0.012, 0.014, 0.016);
  const c = new THREE.Color();
  const pa = roomGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const h = pa.getY(i) / 20; // -1..1
    if (h > 0) c.lerpColors(horizon, top, Math.pow(h, 0.7));
    else c.lerpColors(horizon, bot, Math.pow(-h, 0.45));
    colors.push(c.r, c.g, c.b);
  }
  roomGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const room = new THREE.Mesh(roomGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  env.add(room);

  const box = (w, h, color, intensity, pos, lookAt = [0, 0, 0], round = false) => {
    const m = new THREE.Mesh(
      round ? new THREE.CircleGeometry(w, 24) : new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    m.position.set(...pos);
    m.lookAt(...lookAt);
    env.add(m);
  };
  // key softbox: high, front-left (matches the shadow-casting key light)
  box(7, 4, 0xe8eef5, 2.1, [-5, 8, 7]);
  // overhead strip -> bright crest / top-edge highlights on every plate
  box(9, 0.6, 0xffffff, 2.4, [0, 10, 1]);
  // cold rim strips behind on both sides
  box(1.4, 12, 0xbcd0e6, 2.2, [-9, 3, -7]);
  box(1.4, 12, 0xbcd0e6, 1.9, [9, 3, -7]);
  // broad cool fill panel front-right: readable mid-tones on the shadow side
  box(16, 8, 0x8fa3b8, 0.42, [9, 2, 9]);
  // big dim panel front-left / front: general chrome mid-tones
  box(18, 10, 0xaab6c4, 0.3, [-6, 2, 12]);
  // warm city bokeh: small orange discs low behind and to the sides
  box(0.9, 0, 0xffa060, 3.0, [-8, -0.5, -6], [0, 1.5, 0], true);
  box(0.7, 0, 0xffb070, 2.6, [7, -1.5, -8], [0, 1.5, 0], true);
  box(0.6, 0, 0xff9a50, 2.2, [-10, 1, 3], [0, 1.5, 0], true);
  // faint teal floor bounce
  box(14, 14, 0x24323a, 0.35, [0, -8, 2]);

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
 * Screen-space backdrop like the film plates: deep teal-blue night with a
 * soft lighter haze behind the head and out-of-focus warm / cool bokeh.
 * Deterministic (seeded) so captures are stable.
 */
export function createBackdrop(width = 1024, height = 1024) {
  const cv = document.createElement('canvas');
  cv.width = width;
  cv.height = height;
  const g = cv.getContext('2d');
  const lin = g.createLinearGradient(0, 0, 0, height);
  lin.addColorStop(0, '#16222b');
  lin.addColorStop(0.55, '#0c141a');
  lin.addColorStop(1, '#05080b');
  g.fillStyle = lin;
  g.fillRect(0, 0, width, height);
  const haze = g.createRadialGradient(width * 0.5, height * 0.32, 0, width * 0.5, height * 0.32, width * 0.62);
  haze.addColorStop(0, 'rgba(70,96,112,0.42)');
  haze.addColorStop(1, 'rgba(70,96,112,0)');
  g.fillStyle = haze;
  g.fillRect(0, 0, width, height);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bokeh = (x, y, r, rgb, a) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${rgb},${a})`);
    rg.addColorStop(0.7, `rgba(${rgb},${a * 0.8})`);
    rg.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  // cool city bokeh, mostly upper half and edges
  for (let i = 0; i < 26; i++) {
    const side = rnd() < 0.5 ? rnd() * 0.3 : 0.7 + rnd() * 0.3;
    bokeh(side * width, rnd() * height * 0.75, width * (0.012 + rnd() * 0.035), '120,160,185', 0.05 + rnd() * 0.1);
  }
  // a few warm out-of-focus lights low on the sides (orange street lights)
  const warm = [[0.08, 0.66, 0.05], [0.93, 0.58, 0.035], [0.97, 0.3, 0.02], [0.03, 0.12, 0.025], [0.88, 0.85, 0.03]];
  for (const [x, y, r] of warm) bokeh(x * width, y * height, r * width, '255,170,90', 0.35);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Direct lights — cinematic "MW3" setup: one hard key that casts soft
 * shadows, two cold rim lights from behind, almost no fill, plus the small
 * red bounce from the eyes. Everything else is darkness.
 */
export function createLights() {
  const g = new THREE.Group();
  g.name = 'lights';

  // soft cool key, high front-left (casts the plate-on-plate shadows)
  const key = new THREE.DirectionalLight(0xf2f5fa, 2.2);
  key.position.set(-3.2, 7.5, 5.5);
  key.target.position.set(0, 1.9, 0);
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

  const rimL = new THREE.DirectionalLight(0xc4d6ea, 2.0);
  rimL.position.set(-5.5, 3.5, -6);
  const rimR = new THREE.DirectionalLight(0xc4d6ea, 1.7);
  rimR.position.set(5.5, 3, -6);
  // cool fill from the right so the shadow side stays readable steel, not black
  const fill = new THREE.DirectionalLight(0x9fb2c8, 0.55);
  fill.position.set(4, 1, 6);
  // red bounce from the eyes onto cheeks / nose
  // (two off-axis lights: a single one on the centre line mirrors as a red
  // stripe down the flat nose board)
  const eyeBounce = new THREE.PointLight(0xff2010, 0.35, 1.4, 2);
  eyeBounce.position.set(0.3, 2.25, 0.98); // just in front of each eye (world)
  eyeBounce.name = 'eyeBounce';
  const eyeBounceR = new THREE.PointLight(0xff2010, 0.35, 1.4, 2);
  eyeBounceR.position.set(-0.3, 2.25, 0.98);
  eyeBounceR.name = 'eyeBounceR';
  g.add(key, key.target, rimL, rimR, fill, eyeBounce, eyeBounceR);
  g.userData = { key, rimL, rimR, fill, eyeBounce, eyeBounceR };
  return g;
}
