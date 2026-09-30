#!/usr/bin/env node
/**
 * Playwright capture: renders the model from fixed views and saves PNGs.
 *
 *   node scripts/snap.mjs                       # front, threequarter, side -> screenshots/latest/
 *   node scripts/snap.mjs --port 3002 --tag jaw --isolate jaw
 *   node scripts/snap.mjs --views closeup --only eyes,faceplate,cranium
 *   node scripts/snap.mjs --url http://localhost:3000 --explode 0.6
 *
 * Needs a running server (`npm run dev -- -p <port>`).
 * Uses the pre-installed Chromium at /opt/pw-browsers/chromium (or $CHROMIUM).
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
for (const k of ['only', 'isolate', 'explode', 'bg']) if (args[k]) extra.set(k, args[k]);

const written = [];
for (const view of views) {
  extra.set('view', view);
  const url = `${base}/?${extra.toString()}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__ULTRON_READY__ === true, null, { timeout: 180000, polling: 250 });
  const file = path.join(outDir, `${view}.png`);
  await page.screenshot({ path: file });
  const status = await page.evaluate(() => window.__ULTRON__?.ultron?.status);
  written.push(file);
  console.log(`✓ ${view.padEnd(13)} ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${path.relative(process.cwd(), file)}`);
  if (view === views[0]) console.log('  part status:', JSON.stringify(status));
}

await browser.close();
const filtered = errors.filter((e) => !/GPU stall|WebGL-|swiftshader|Automatic fallback/i.test(e));
if (filtered.length) {
  console.log(`\n${filtered.length} console error(s)/warning(s):`);
  for (const e of [...new Set(filtered)].slice(0, 30)) console.log('  ' + e);
}
