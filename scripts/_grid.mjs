import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [,, file, out, scaleArg, x0a, y0a, x1a, y1a, stepA] = process.argv;
const scale = +scaleArg || 2;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1600 } });
const src = 'data:image/' + (file.endsWith('webp') ? 'webp' : 'png') + ';base64,' + fs.readFileSync(file).toString('base64');
await page.setContent('<body style="margin:0;background:#000"></body>');
await page.evaluate(async ([src, scale, x0, y0, x1, y1, step]) => {
  const img = new Image(); img.src = src; await img.decode();
  x0 = x0 ?? 0; y0 = y0 ?? 0; x1 = x1 ?? img.width; y1 = y1 ?? img.height;
  const c = document.createElement('canvas'); c.width = (x1 - x0) * scale; c.height = (y1 - y0) * scale;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = true;
  g.drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
  g.font = '11px monospace';
  for (let x = Math.ceil(x0 / step) * step; x < x1; x += step) { const X = (x - x0) * scale; g.strokeStyle = x % (step * 5) ? 'rgba(0,255,255,0.25)' : 'rgba(255,255,0,0.6)'; g.beginPath(); g.moveTo(X, 0); g.lineTo(X, c.height); g.stroke(); g.fillStyle = '#ff0'; g.fillText(x, X + 2, 11); }
  for (let y = Math.ceil(y0 / step) * step; y < y1; y += step) { const Y = (y - y0) * scale; g.strokeStyle = y % (step * 5) ? 'rgba(0,255,255,0.25)' : 'rgba(255,255,0,0.6)'; g.beginPath(); g.moveTo(0, Y); g.lineTo(c.width, Y); g.stroke(); g.fillStyle = '#ff0'; g.fillText(y, 2, Y - 2); }
  document.body.appendChild(c);
}, [src, scale, x0a ? +x0a : null, y0a ? +y0a : null, x1a ? +x1a : null, y1a ? +y1a : null, +stepA || 10]);
await page.locator('canvas').screenshot({ path: out });
await browser.close();
