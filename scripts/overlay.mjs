#!/usr/bin/env node
/**
 * Overlay sheet: aligns each render to its reference by the two glowing eyes
 * (similarity transform: scale + rotation + translation) and shows
 *   [reference] [render, aligned] [50% blend] [edge overlay: ref = cyan, render = red]
 * so silhouette / feature placement errors are measurable, not guessed.
 *
 *   node scripts/snap.mjs --tag t --views front,filmfront,film34,threequarter
 *   node scripts/overlay.mjs --tag t            # -> screenshots/t/overlay.png
 *   node scripts/overlay.mjs --tag t --only filmfront
 *
 * Needs screenshots/<tag>/<view>.png + <view>.json (written by snap.mjs).
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
    return acc;
  }, [])
);
const tag = args.tag || 'latest';
const dir = path.resolve('screenshots', tag);
const refDir = path.resolve('reference');

// Reference eye centres in reference pixels (measured from the red glow).
// eyeR = model's right eye (viewer's left), eyeL = model's left eye.
export const REFS = [
  { view: 'front',        file: 'ultron-front.png',         eyeR: [190.1, 262.9], eyeL: [310.2, 262.2] },
  { view: 'filmfront',    file: 'ultron-film-front.png',    eyeR: [177.8, 163.5], eyeL: [282.5, 144.1] },
  { view: 'film34',       file: 'ultron-film-34.png',       eyeR: [63.9, 81.0],   eyeL: [105.9, 54.3] },
  { view: 'threequarter', file: 'ultron-threequarter.webp', eyeR: [423.5, 237.1], eyeL: [632.5, 231.9] },
];
const only = args.only ? args.only.split(',') : null;
const H = parseInt(args.height || '560', 10);

const b64 = (p) => `data:image/${p.endsWith('.webp') ? 'webp' : 'png'};base64,${fs.readFileSync(p).toString('base64')}`;
const jobs = [];
for (const r of REFS) {
  if (only && !only.includes(r.view)) continue;
  const png = path.join(dir, `${r.view}.png`), js = path.join(dir, `${r.view}.json`);
  if (!fs.existsSync(png) || !fs.existsSync(js)) continue;
  jobs.push({ ...r, ref: b64(path.join(refDir, r.file)), render: b64(png), marks: JSON.parse(fs.readFileSync(js, 'utf8')) });
}
if (!jobs.length) { console.error(`no renders with landmarks in ${dir} (run snap.mjs with views ${REFS.map((r) => r.view).join(',')})`); process.exit(1); }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1800, height: 800 } });
await page.setContent('<html><body style="margin:0;background:#111"></body></html>');
const result = await page.evaluate(async ({ jobs, H }) => {
  const load = async (src) => { const i = new Image(); i.src = src; await i.decode(); return i; };
  const edges = (ctx, w, h) => {
    const d = ctx.getImageData(0, 0, w, h).data;
    const L = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) L[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
    const E = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = L[i + 1 - w] + 2 * L[i + 1] + L[i + 1 + w] - L[i - 1 - w] - 2 * L[i - 1] - L[i - 1 + w];
      const gy = L[i - 1 + w] + 2 * L[i + w] + L[i + 1 + w] - L[i - 1 - w] - 2 * L[i - w] - L[i + 1 - w];
      E[i] = Math.hypot(gx, gy);
    }
    return E;
  };
  const rows = [];
  const stats = [];
  for (const j of jobs) {
    const ref = await load(j.ref), ren = await load(j.render);
    const s = H / ref.height, W = Math.round(ref.width * s);
    // reference eye pixels in the output frame
    const rR = [j.eyeR[0] * s, j.eyeR[1] * s], rL = [j.eyeL[0] * s, j.eyeL[1] * s];
    const mR = j.marks.eyeR, mL = j.marks.eyeL;
    // similarity transform render -> ref frame from the eye pair
    const dv = [mL[0] - mR[0], mL[1] - mR[1]], dr = [rL[0] - rR[0], rL[1] - rR[1]];
    const scale = Math.hypot(...dr) / Math.hypot(...dv);
    const rot = Math.atan2(dr[1], dr[0]) - Math.atan2(dv[1], dv[0]);
    const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const cRef = canvas(W, H), gRef = cRef.getContext('2d');
    gRef.drawImage(ref, 0, 0, W, H);
    const cRen = canvas(W, H), gRen = cRen.getContext('2d');
    gRen.fillStyle = '#000'; gRen.fillRect(0, 0, W, H);
    gRen.translate(rR[0], rR[1]); gRen.rotate(rot); gRen.scale(scale, scale); gRen.translate(-mR[0], -mR[1]);
    gRen.drawImage(ren, 0, 0);
    gRen.setTransform(1, 0, 0, 1, 0, 0);
    const cMix = canvas(W, H), gMix = cMix.getContext('2d');
    gMix.drawImage(cRef, 0, 0); gMix.globalAlpha = 0.5; gMix.drawImage(cRen, 0, 0); gMix.globalAlpha = 1;
    // edge overlay
    const eRef = edges(gRef, W, H), eRen = edges(gRen, W, H);
    const cE = canvas(W, H), gE = cE.getContext('2d');
    const img = gE.createImageData(W, H);
    let mx = 0, mx2 = 0;
    for (let i = 0; i < W * H; i++) { mx = Math.max(mx, eRef[i]); mx2 = Math.max(mx2, eRen[i]); }
    for (let i = 0; i < W * H; i++) {
      const a = Math.min(1, (eRef[i] / mx) * 3.5), b = Math.min(1, (eRen[i] / mx2) * 3.5);
      img.data[i * 4] = 255 * b; img.data[i * 4 + 1] = 200 * a; img.data[i * 4 + 2] = 255 * a; img.data[i * 4 + 3] = 255;
    }
    gE.putImageData(img, 0, 0);
    // landmark crosses: reference eyes (cyan) and where the render puts jaw / cheeks (red)
    const toRef = (p) => {
      const x = (p[0] - mR[0]) * scale, y = (p[1] - mR[1]) * scale;
      return [rR[0] + x * Math.cos(rot) - y * Math.sin(rot), rR[1] + x * Math.sin(rot) + y * Math.cos(rot)];
    };
    for (const g of [gMix, gE]) {
      g.lineWidth = 1.5;
      for (const p of [rR, rL]) { g.strokeStyle = '#0ff'; g.beginPath(); g.arc(p[0], p[1], 6, 0, 7); g.stroke(); }
      for (const k of ['cheekL', 'cheekR', 'jaw']) if (j.marks[k]) {
        const p = toRef(j.marks[k]); g.strokeStyle = '#f44'; g.beginPath(); g.moveTo(p[0] - 6, p[1]); g.lineTo(p[0] + 6, p[1]); g.moveTo(p[0], p[1] - 6); g.lineTo(p[0], p[1] + 6); g.stroke();
      }
    }
    rows.push({ view: j.view, W, imgs: [cRef, cRen, cMix, cE].map((c) => c.toDataURL('image/png')) });
    stats.push(`${j.view}: render->ref scale ${scale.toFixed(3)}, roll ${(rot * 180 / Math.PI).toFixed(1)}deg`);
  }
  const html = rows.map((r) => `<div style="display:flex;gap:6px;margin:6px;align-items:flex-start"><div style="color:#bbb;font:13px sans-serif;writing-mode:vertical-rl">${r.view}</div>${r.imgs.map((s) => `<img src="${s}" style="height:${H}px">`).join('')}</div>`).join('');
  document.body.innerHTML = html;
  await Promise.all([...document.images].map((i) => i.decode()));
  return stats;
}, { jobs, H });
const out = path.join(dir, args.out || 'overlay.png');
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(result.join('\n'));
console.log('✓ overlay sheet ->', path.relative(process.cwd(), out), ' (cols: reference | render aligned by eyes | 50% blend | edges: cyan=ref red=render)');
