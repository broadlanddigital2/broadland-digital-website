// Used by .github/workflows/site-check.yml: opens pages of the preview site in Chromium and saves screenshots and
// a log to out/ (pushed to the site-check-results branch). PAGES: comma-separated paths (default below).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const BASE = process.env.BASE || 'https://broadland-digital-website.justin-b8f.workers.dev';
const PAGES = (process.env.PAGES || '/vehicle-graphics/,/vehicle-graphics/guides-and-advice/,/vehicle-graphics/sectors/trades-van-graphics/,/vehicle-graphics/locations/vehicle-graphics-norwich/,/vehicle-graphics/sectors/fleet-graphics/?crmseo_preview=a4af6ae2-292e-4fea-8701-51596d1383cf,/vehicle-graphics/sectors/fleet-graphics/').split(',');
mkdirSync('out', { recursive: true });
const log = [];
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
pg.on('pageerror', (e) => log.push('pageerror: ' + e.message));
let i = 0;
for (const p of PAGES) {
  const r = await pg.goto(BASE + p, { waitUntil: 'networkidle' }).catch((e) => null);
  await pg.evaluate(() => { document.querySelectorAll('.bdcc').forEach((e) => e.remove()); window.scrollTo(0, document.body.scrollHeight); });
  await pg.waitForTimeout(1500); await pg.evaluate(() => window.scrollTo(0, 0)); await pg.waitForTimeout(300);
  const info = await pg.evaluate(() => ({ title: document.title, h1: document.querySelector('h1')?.textContent?.trim(), ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => { try { const j = JSON.parse(s.textContent); return (j['@graph'] || [j]).map((x) => x['@type']).join('+'); } catch { return 'ERR'; } }).join(', '), canonical: document.querySelector('link[rel=canonical]')?.href, robots: document.querySelector('meta[name=robots]')?.content }));
  log.push(`${r?.status()} ${p}\n  ${JSON.stringify(info)}`);
  await pg.screenshot({ path: `out/p${++i}.png`, fullPage: false });
}
writeFileSync('out/log.txt', log.join('\n'));
await b.close();
