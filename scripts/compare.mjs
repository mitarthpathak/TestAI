#!/usr/bin/env node
/**
 * Side-by-side comparison sheet: reference images next to the latest renders.
 *
 *   node scripts/compare.mjs                 # uses screenshots/latest
 *   node scripts/compare.mjs --tag jaw       # uses screenshots/jaw
 *
 * Writes screenshots/<tag>/compare.png. Open it (e.g. with the Read tool) and
 * compare silhouette, proportions, plate layout, glow and material response.
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

const b64 = (p) => (fs.existsSync(p) ? `data:image/${p.endsWith('.webp') ? 'webp' : 'png'};base64,${fs.readFileSync(p).toString('base64')}` : '');
const cell = (src, label) => `<figure><img src="${src}"/><figcaption>${label}</figcaption></figure>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#111;color:#bbb;font:14px/1.3 system-ui,sans-serif;padding:16px}
  .row{display:flex;gap:12px;margin-bottom:12px;align-items:flex-start}
  figure{margin:0;background:#000;border:1px solid #333}
  img{display:block;height:520px;width:auto}
  figcaption{padding:4px 8px}
</style></head><body>
  <div class="row">
    ${cell(b64(path.join(refDir, 'ultron-front.png')), 'REFERENCE front')}
    ${cell(b64(path.join(dir, 'front.png')), `render front (${tag})`)}
    ${cell(b64(path.join(dir, 'side.png')), `render side (${tag})`)}
  </div>
  <div class="row">
    ${cell(b64(path.join(refDir, 'ultron-threequarter.webp')), 'REFERENCE 3/4')}
    ${cell(b64(path.join(dir, 'threequarter.png')), `render 3/4 (${tag})`)}
  </div>
  <div class="row">
    ${cell(b64(path.join(refDir, 'ultron-poster-34.png')), 'REFERENCE poster 3/4')}
    ${cell(b64(path.join(refDir, 'ultron-film-front.png')), 'REFERENCE film')}
    ${cell(b64(path.join(refDir, 'ultron-film-34.png')), 'REFERENCE film 3/4')}
  </div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 2000, height: 1200 } });
await page.setContent(html, { waitUntil: 'load' });
const out = path.join(dir, 'compare.png');
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('✓ compare sheet ->', path.relative(process.cwd(), out));
