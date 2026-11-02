// Screenshots of the live WordPress site (desktop full page, desktop first screen, mobile full page) and, for each
// page, the computed styles of the main elements, written to reference/.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const pages = ['/', '/signage-home/', '/signage-home/building-signage-shop-signs/', '/van-graphics/', '/vehicle-graphics/', '/contact-us/', '/get-a-quote/',
  '/product/basic-large-van-graphics/', '/privacy-policy/', '/signage-home/signage-norwich/', '/liquid-wrapping-home/', '/digital-print/'];
mkdirSync('reference/shots', { recursive: true });
const browser = await chromium.launch();
const styles = {};
for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const p of pages) {
    const slug = p.replace(/^\/|\/$/g, '').replace(/\//g, '__') || 'home';
    try {
      await page.goto('https://broadlanddigital.co.uk' + p, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1500);
      // dismiss cookie banners if any
      for (const t of ['Accept', 'Accept all', 'I agree', 'OK']) { const b = page.getByRole('button', { name: t, exact: true }); if (await b.count()) { await b.first().click().catch(() => {}); } }
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `reference/shots/${name}-${slug}.png`, fullPage: true });
      if (name === 'desktop') {
        await page.screenshot({ path: `reference/shots/${name}-${slug}-top.png` });
        writeFileSync(`reference/shots/${slug}.html`, await page.content());
        styles[p] = await page.evaluate(() => {
          const pick = (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect();
            return { tag: el.tagName.toLowerCase(), cls: el.className && String(el.className).slice(0, 80), text: (el.innerText || '').trim().slice(0, 60),
              box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], font: s.fontFamily, size: s.fontSize, weight: s.fontWeight,
              lh: s.lineHeight, ls: s.letterSpacing, color: s.color, bg: s.backgroundColor, bgimg: s.backgroundImage.slice(0, 120), pad: s.padding, margin: s.margin,
              radius: s.borderRadius, border: s.border, tt: s.textTransform }; };
          const sel = 'header, header *, nav a, h1, h2, h3, h4, h5, h6, p, a.button, a.btn, button, .btn, input, textarea, footer, footer *, section, main > *, img';
          return [...document.querySelectorAll(sel)].filter((el) => el.getBoundingClientRect().width > 0).slice(0, 400).map(pick);
        });
      }
    } catch (e) { console.log('failed', p, e.message); }
  }
  await ctx.close();
}
writeFileSync('reference/styles.json', JSON.stringify(styles, null, 1));
await browser.close();
