// Used by .github/workflows/site-check.yml: opens the preview site in Chromium, tries the site search, saves
// screenshots and the search API responses to out/ (pushed to the site-check-results branch).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const BASE = process.env.BASE || 'https://broadland-digital-website.justin-b8f.workers.dev';
mkdirSync('out', { recursive: true });
const log = [];
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
pg.on('console', (m) => log.push(`console.${m.type()}: ${m.text()}`));
pg.on('pageerror', (e) => log.push('pageerror: ' + e.message));
pg.on('requestfailed', (r) => log.push('failed: ' + r.url() + ' ' + r.failure()?.errorText));
pg.on('response', async (r) => { if (/site-search/.test(r.url())) { let t = ''; try { t = (await r.text()).slice(0, 1500); } catch {} log.push(`resp ${r.status()} ${r.request().method()} ${r.url()} ${r.request().postData()?.slice(0, 200) || ''}\n  ${t}`); } });
await pg.goto(BASE + '/signage-home/', { waitUntil: 'networkidle' });
await pg.waitForTimeout(2000);
log.push('search button hidden: ' + await pg.evaluate(() => document.querySelector('.bdh-search')?.hidden));
log.push('SiteSearch: ' + await pg.evaluate(() => typeof window.SiteSearch));
await pg.evaluate(() => window.SiteSearch?.open('banners'));
await pg.waitForTimeout(4000);
await pg.screenshot({ path: 'out/search-banners.png' });
await pg.keyboard.press('Escape');
await pg.evaluate(() => window.SiteSearch?.open(''));
await pg.waitForTimeout(3000);
await pg.screenshot({ path: 'out/search-open.png' });
// sticky header after scrolling
await pg.goto(BASE + '/signage-home/', { waitUntil: 'networkidle' });
await pg.evaluate(() => window.scrollTo(0, 1400)); await pg.waitForTimeout(800);
await pg.screenshot({ path: 'out/sticky.png' });
writeFileSync('out/log.txt', log.join('\n'));
await b.close();
