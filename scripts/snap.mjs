#!/usr/bin/env node
/**
 * Playwright capture: renders the model from fixed views and saves PNGs.
 *
 *   node scripts/snap.mjs                       # front, threequarter, side -> screenshots/latest/
 *   node scripts/snap.mjs --port 3002 --tag jaw --isolate jaw
 *   node scripts/snap.mjs --views closeup --only eyes,faceplate,cranium
 *   node scripts/snap.mjs --url http://localhost:3000 --explode 0.6
 *   node scripts/snap.mjs --tag jawopen --set jaw.open=0.8,lips.part=0.5 --views threequarter
 *
 * Needs a running server (`npm run dev -- -p <port>`).
 * Uses the pre-installed Chromium at /opt/pw-browsers/chromium (or $CHROMIUM).
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { LANDMARKS } from '../src/ultron/anatomy.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
    return acc;
  }, [])
);

const port = args.port || process.env.PORT || '3000';
const base = args.url || `http://localhost:${port}`;
const tag = args.tag || 'latest';
const views = (args.views || 'front,threequarter,side').split(',');
const width = parseInt(args.width || '900', 10);
const height = parseInt(args.height || '1100', 10);
const outDir = path.resolve('screenshots', tag);
fs.mkdirSync(outDir, { recursive: true });

const executablePath = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  executablePath,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const extra = new URLSearchParams();
extra.set('capture', '1');
for (const k of ['only', 'isolate', 'explode', 'bg', 'set', 'pose']) if (args[k]) extra.set(k, args[k]);

const written = [];
// one page load (parts build once), then switch the camera per view
extra.set('view', views[0]);
const url = `${base}/?${extra.toString()}`;
const t0 = Date.now();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
await page.waitForFunction(() => window.__ULTRON_READY__ === true, null, { timeout: 300000, polling: 250 });
const info = await page.evaluate(() => {
  const u = window.__ULTRON__?.ultron;
  let tris = 0;
  const perPart = {};
  u?.object.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    const n = (g.index ? g.index.count : g.attributes.position.count) / 3;
    tris += n;
    let p = o;
    while (p && !p.userData.part) p = p.parent;
    const id = p?.userData.part || '?';
    perPart[id] = (perPart[id] || 0) + n;
  });
  return { status: u?.status, timings: u?.timings, tris: Math.round(tris), perPart };
});
console.log(`  loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('  part status :', JSON.stringify(info.status));
console.log('  build ms    :', JSON.stringify(info.timings));
console.log('  triangles   :', info.tris.toLocaleString(), JSON.stringify(Object.fromEntries(Object.entries(info.perPart).map(([k, v]) => [k, Math.round(v)]))));
for (const view of views) {
  const t1 = Date.now();
  await page.evaluate(async (v) => { window.__ULTRON__.setView(v); await window.__ULTRON__.frames(2); }, view);
  const file = path.join(outDir, `${view}.png`);
  await page.screenshot({ path: file, timeout: 180000 });
  // projected landmark pixels (used by scripts/overlay.mjs to align with the references)
  const marks = await page.evaluate((LM) => {
    const S = window.__ULTRON__;
    const out = {};
    const v = new S.camera.position.constructor();
    const w = S.renderer.domElement.clientWidth, h = S.renderer.domElement.clientHeight;
    for (const name of ['eyeL', 'eyeR', 'jaw', 'head', 'neck', 'cheekL', 'cheekR']) {
      const j = S.ultron.rig.joints[name];
      if (!j) continue;
      j.getWorldPosition(v);
      v.project(S.camera);
      out[name] = [+((v.x + 1) * 0.5 * w).toFixed(1), +((1 - v.y) * 0.5 * h).toFixed(1)];
    }
    // head-space landmarks (the head joint sits at the head-space origin)
    const hj = S.ultron.rig.joints.head;
    for (const [name, p] of Object.entries(LM)) {
      v.set(p[0], p[1], p[2]);
      hj.localToWorld(v);
      v.project(S.camera);
      out[name] = [+((v.x + 1) * 0.5 * w).toFixed(1), +((1 - v.y) * 0.5 * h).toFixed(1)];
    }
    return out;
  }, { chin: LANDMARKS.chinButton, crown: LANDMARKS.crownTop, mouth: LANDMARKS.mouthCenter });
  fs.writeFileSync(path.join(outDir, `${view}.json`), JSON.stringify(marks));
  written.push(file);
  console.log(`✓ ${view.padEnd(13)} ${((Date.now() - t1) / 1000).toFixed(1)}s -> ${path.relative(process.cwd(), file)}`);
}

await browser.close();
const filtered = errors.filter((e) => !/GPU stall|WebGL-|swiftshader|Automatic fallback|maxLeafSize/i.test(e));
if (filtered.length) {
  console.log(`\n${filtered.length} console error(s)/warning(s):`);
  for (const e of [...new Set(filtered)].slice(0, 30)) console.log('  ' + e);
}
