/**
 * Stage — renderer, camera, controls, post-processing, debug GUI.
 * OWNER: lead / integrator.
 *
 * URL flags (all optional):
 *   ?debug            lil-gui panel (per-part params, explode, isolate, bloom…)
 *   ?capture=1        deterministic render for Playwright (no idle, no HUD)
 *   ?view=front|threequarter|side|closeup|hero
 *   ?only=jaw,lips    load only these parts
 *   ?isolate=jaw      load everything but show only this part
 *   ?explode=0.5      exploded view
 *   ?bg=reference     garage-ish backdrop instead of black
 *   ?set=jaw.open=0.8,eyes.lookX=0.4   set part params after load
 *   ?pose=head.ry=0.3                   rotate rig joints (disable idle to keep it)
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, SMAAEffect, SMAAPreset, KernelSize,
  NoiseEffect, BlendFunction, BrightnessContrastEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { MaterialLibrary } from './materials.js';
import { createStudioEnvironment, createLights } from './environment.js';
import { Ultron } from './Ultron.js';
import { VIEWS } from './anatomy.js';

export function readFlags(search) {
  const q = new URLSearchParams(search);
  return {
    debug: q.has('debug'),
    capture: q.get('capture') === '1',
    view: q.get('view') || null,
    only: q.get('only') ? q.get('only').split(',') : null,
    isolate: q.get('isolate') || null,
    explode: q.get('explode') ? parseFloat(q.get('explode')) : 0,
    bg: q.get('bg') || null,
    // ?set=jaw.open=0.8,eyes.lookX=0.4  -> part params applied after loading
    set: (q.get('set') || '').split(',').filter(Boolean).map((kv) => {
      const [path, v] = kv.split('=');
      const [part, key] = path.split('.');
      return { part, key, value: v === 'true' ? true : v === 'false' ? false : parseFloat(v) };
    }),
    // ?pose=head.ry=0.3,neck.rx=0.1  -> rig joint rotations/positions
    pose: (q.get('pose') || '').split(',').filter(Boolean).map((kv) => {
      const [path, v] = kv.split('=');
      const [joint, key] = path.split('.');
      return { joint, key, value: parseFloat(v) };
    }),
  };
}

function viewToCamera(view, camera, controls) {
  const v = VIEWS[view] || VIEWS.hero;
  const az = THREE.MathUtils.degToRad(v.azimuth);
  const el = THREE.MathUtils.degToRad(v.elevation);
  const t = new THREE.Vector3().fromArray(v.target);
  camera.position.set(
    t.x + v.distance * Math.cos(el) * Math.sin(az),
    t.y + v.distance * Math.sin(el),
    t.z + v.distance * Math.cos(el) * Math.cos(az)
  );
  controls.target.copy(t);
  camera.lookAt(t);
  controls.update();
}

export async function createStage(container, { flags, onStatus } = {}) {
  flags = flags || readFlags(window.location.search);
  const capture = flags.capture;

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: capture,
    stencil: false,
    depth: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, capture ? 1 : 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in the effect pass
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const envMap = createStudioEnvironment(renderer);
  scene.environment = envMap;
  const lights = createLights();
  scene.add(lights);

  if (flags.bg === 'reference') {
    scene.background = new THREE.Color(0x2a2620);
  }

  const camera = new THREE.PerspectiveCamera(28, container.clientWidth / container.clientHeight, 0.05, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !capture;
  controls.dampingFactor = 0.06;
  controls.minDistance = 2.5;
  controls.maxDistance = 16;
  controls.enablePan = flags.debug;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = Math.PI - 0.5;
  viewToCamera(flags.view || 'hero', camera, controls);

  // ------------------------------------------------------------- post
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));
  // ambient occlusion: dark crevices between plates (big part of the "game" look)
  const ao = new N8AOPostPass(scene, camera, container.clientWidth, container.clientHeight);
  ao.configuration.aoRadius = 0.22;
  ao.configuration.distanceFalloff = 0.6;
  ao.configuration.intensity = 4.0;
  ao.configuration.color = new THREE.Color(0, 0, 0);
  ao.configuration.halfRes = !capture;
  ao.configuration.gammaCorrection = false;
  ao.setQualityMode(capture ? 'High' : 'Medium');
  composer.addPass(ao);
  const bloom = new BloomEffect({
    luminanceThreshold: 5.0,
    luminanceSmoothing: 0.3,
    intensity: 2.6,
    mipmapBlur: true,
    radius: 0.72,
    levels: 7,
  });
  const vignette = new VignetteEffect({ offset: 0.22, darkness: 0.78 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  const grade = new BrightnessContrastEffect({ brightness: -0.02, contrast: 0.16 });
  const grain = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SCREEN });
  grain.blendMode.opacity.value = capture ? 0.0 : 0.05;
  const smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });
  composer.addPass(new EffectPass(camera, bloom, vignette, tone, grade, grain));
  composer.addPass(new EffectPass(camera, smaa));

  // ------------------------------------------------------------- model
  const materials = new MaterialLibrary();
  const ultron = new Ultron({ materials });
  scene.add(ultron.object);
  if (flags.explode) ultron.setExplode(flags.explode);
  if (capture) ultron.idle.enabled = false;
  if (onStatus) ultron.on(onStatus);

  // ------------------------------------------------------------- resize
  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // pointer look
  const onPointer = (e) => {
    const r = container.getBoundingClientRect();
    ultron.lookAt(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
  };
  if (!capture) window.addEventListener('pointermove', onPointer);

  // ------------------------------------------------------------- GUI
  let gui = null;
  const buildGui = async () => {
    const { default: GUI } = await import('lil-gui');
    gui = new GUI({ title: 'ultron debug' });
    const s = {
      view: flags.view || 'hero', explode: ultron.explode, isolate: flags.isolate || 'all',
      idle: ultron.idle.enabled, wireframe: false, env: 1, glow: 1,
      bloomIntensity: bloom.intensity, bloomThreshold: bloom.luminanceMaterial.threshold,
    };
    gui.add(s, 'view', Object.keys(VIEWS)).onChange((v) => viewToCamera(v, camera, controls));
    gui.add(s, 'explode', 0, 1.5, 0.01).onChange((v) => ultron.setExplode(v));
    gui.add(s, 'isolate', ['all', ...Object.keys(ultron.status)]).onChange((v) => ultron.isolate(v === 'all' ? null : v));
    gui.add(s, 'idle').onChange((v) => { ultron.idle.enabled = v; if (!v) ultron.rig.reset(); });
    gui.add(s, 'wireframe').onChange((v) => materials.setWireframe(v));
    gui.add(s, 'env', 0, 3, 0.01).onChange((v) => materials.setEnvIntensity(v));
    gui.add(s, 'glow', 0, 3, 0.01).onChange((v) => materials.setGlow(v));
    const fp = gui.addFolder('bloom');
    fp.add(s, 'bloomIntensity', 0, 8, 0.01).onChange((v) => { bloom.intensity = v; });
    fp.add(s, 'bloomThreshold', 0, 4, 0.01).onChange((v) => { bloom.luminanceMaterial.threshold = v; });
    fp.close();
    const lf = gui.addFolder('lights');
    for (const [k, l] of Object.entries(lights.userData)) lf.add(l, 'intensity', 0, 8, 0.01).name(k);
    lf.close();
    const partsFolder = gui.addFolder('parts');
    const addPartFolder = (p) => {
      const f = partsFolder.addFolder(p.id);
      f.add({ visible: true }, 'visible').onChange((v) => ultron.setVisible(p.id, v));
      for (const [key, spec] of Object.entries(p.paramSpec)) {
        if (typeof p.params[key] === 'boolean') f.add(p.params, key).onChange(() => p.apply(p.params)).listen();
        else f.add(p.params, key, spec.min, spec.max, spec.step).onChange(() => p.apply(p.params)).listen();
      }
      f.close();
    };
    for (const p of Object.values(ultron.parts)) addPartFolder(p);
    ultron.on((ev) => { if (ev.type === 'status' && ev.status === 'ready') addPartFolder(ultron.parts[ev.id]); });
  };
  if (flags.debug) buildGui();

  // ------------------------------------------------------------- loop
  const timer = new THREE.Timer();
  let raf = 0;
  let frames = 0;
  let disposed = false;
  const tick = () => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    controls.update();
    ultron.update(capture ? 0 : dt);
    composer.render(dt);
    frames++;
  };
  tick();

  // ------------------------------------------------------------- load
  const loading = ultron.loadAll({
    only: flags.only,
    stagger: capture ? 0 : 260,
    animate: !capture,
  }).then(() => {
    if (flags.isolate) ultron.isolate(flags.isolate);
    for (const { part, key, value } of flags.set) ultron.set(part, key, value);
    for (const { joint, key, value } of flags.pose) ultron.rig.pose({ [joint]: { [key]: value } });
    // signal readiness a few frames later (Playwright waits on this)
    const start = frames;
    const wait = () => {
      if (frames - start >= 4) window.__ULTRON_READY__ = true;
      else requestAnimationFrame(wait);
    };
    wait();
  });

  const api = {
    renderer, scene, camera, controls, composer, bloom, materials, ultron, lights,
    setView: (v) => viewToCamera(v, camera, controls),
    loading,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onPointer);
      gui?.destroy();
      controls.dispose();
      ultron.dispose();
      materials.dispose();
      composer.dispose();
      envMap.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
  window.__ULTRON__ = api;
  return api;
}
