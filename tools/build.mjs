// Builds dist/ from the captured WordPress site, so the new site looks exactly like broadlanddigital.co.uk did.
// No dependencies: `node tools/build.mjs`.
//
//   source/wordpress/<address>/index.html   each page as WordPress served it (tools/capture/capture.mjs)
//   source/wordpress-assets/                the theme's and plugins' CSS, scripts, fonts and images
//   site/public/                            uploads (wp-content/uploads) and anything else copied as it is
//   site/bd-forms.js                        sends the theme's forms to the CRM (replaces Contact Form 7)
//
// Each page is cleaned up: WordPress, WooCommerce, Stripe, reCAPTCHA, Contact Form 7 and WP Rocket scripts are taken
// out; the theme's own scripts, the cookie banner, Google Analytics, the chat bot and the reviews widget stay; links
// become local; "Add to basket" becomes "Enquire now" (orders arrive in the CRM as leads); forms post to /api/forms.
//
// Pages the CRM manages (Marketing → SEO pages) and the blog are not built here: the worker serves them live inside
// dist/_crm-page, a copy of a WordPress page with its content taken out (see worker/crm-pages.js).
import { finishSeo, pruneAssets, NOINDEX as SEO_NOINDEX } from './seo.mjs';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'source/wordpress');
const ASSETS = join(ROOT, 'source/wordpress-assets');
const OUT = join(ROOT, 'dist');
const ORIGIN = 'https://broadlanddigital.co.uk';
const wp = JSON.parse(readFileSync(join(ROOT, 'content/wordpress.json'), 'utf8'));
const extra = JSON.parse(readFileSync(join(ROOT, 'content/site.json'), 'utf8'));
const VEH = JSON.parse(readFileSync(join(ROOT, 'content/vehicle.json'), 'utf8'));
const OPTS = existsSync(join(ROOT, 'content/opt-srcset.json')) ? JSON.parse(readFileSync(join(ROOT, 'content/opt-srcset.json'), 'utf8')) : {};
const OPT = existsSync(join(ROOT, 'content/opt-images.json')) ? JSON.parse(readFileSync(join(ROOT, 'content/opt-images.json'), 'utf8')) : {};
const productTitle = new Map(wp.products.map((p) => [p.path, p.title]));
const lastmod = new Map([...wp.pages, ...wp.products].map((p) => [p.path, p.modified]));

const walk = (dir) => readdirSync(dir).flatMap((e) => { const f = join(dir, e); return statSync(f).isDirectory() ? walk(f) : [f]; });
const hash = (b) => createHash('sha1').update(b).digest('hex').slice(0, 10);
const BIG_ARROW = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 12h15M13 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- Captured pages ----------
const captured = new Map();
for (const f of walk(SRC).filter((f) => f.endsWith('index.html'))) {
  const p = '/' + relative(SRC, dirname(f)).split('\\').join('/');
  captured.set(p === '/.' || p === '/' ? '/' : p.replace(/\/$/, ''), readFileSync(f, 'utf8'));
}
// A page the CRM plugin drew is a CRM page: the worker serves those live. One of them becomes the shell.
const crmPages = [...captured].filter(([, h]) => h.includes('crmseo-main')).map(([p]) => p);
// The blog (/blog, and the old /guides/<post> addresses) is served live from the CRM by the worker.
const staticPaths = new Set([...captured.keys()].filter((p) => !crmPages.includes(p) && p !== '/blog' && !p.startsWith('/guides/')));

// ---------- Assets ----------
const assetVersion = new Map();
function assetUrl(pathname) {
  // WP Rocket's minified copies (/wp-content/cache/min/1/...) and plain theme/plugin files are served from where they were.
  const file = join(ASSETS, decodeURIComponent(pathname));
  if (!existsSync(file)) return null;
  if (!assetVersion.has(pathname)) assetVersion.set(pathname, hash(readFileSync(file)));
  return `${pathname}?v=${assetVersion.get(pathname)}`;
}

// ---------- Scripts kept / removed ----------
const KEEP = /jquery-core-js|jquery-migrate-js|jquery(\.min)?\.js|jquery-migrate(\.min)?\.js|header(-js|\.js)|more_information|woo_block|swiper|ultimate_blocks|ultimate-blocks|dflip|dFlip|enquirybot|google_gtagjs|googletagmanager|gtag\(|linkbot|pagemapId|local-marketing-reports|application\/ld\+json/;
const DROP = /woocommerce|wc-|wc_|sourcebuster|order-attribution|stripe|WCPAY|recaptcha|contact-form-7|wpcf7|swv-js|swv\/|wp-polyfill|wp-hooks|wp-i18n|hooks\.min|i18n\.min|cf7rl|redirect_method|rocket|wpr-beacon|speculationrules|omnisend|soundest|ga4w|klarna|cart-fragments|wp-(url|undo|redux|private|priority|keycodes|is-shallow|html-entities|escape|element|dom|deprecated|data|compose|api-fetch)|react|lodash|js\.cookie|blockUI|add-to-cart|single-product|country-select|checkout|address-i18n/;

// Scripts that set non-essential cookies wait for consent (site/bd-consent.js switches them on).
const ANALYTICS = /googletagmanager|gtag\(|dataLayer|linkbot|pagemapId/;
const FUNCTIONAL = /enquirybot|local-marketing-reports/;
const gate = (m, attrs, cat) => m.replace(/^<script\b[^>]*>/i, `<script type="text/plain" data-bd-consent="${cat}"${attrs.replace(/\stype=["'][^"']*["']/i, '')}>`);

function cleanScripts(html) {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
    const sig = attrs + ' ' + body.slice(0, 600);
    if (/cloudflare-static\/rocket-loader/.test(attrs)) return '';
    if (/cookieyes|client_data\//i.test(sig)) return ''; // CookieYes is replaced by our own banner
    if (/launcher\.enquirybot\.com|enquirybot\.com|data-bot-id="250af904/i.test(sig)) return ''; // the old EnquiryBot chat is replaced by the CRM's assistant (CRM_BOT)
    if (/application\/ld\+json/.test(attrs)) return m;
    if (DROP.test(sig) && !KEEP.test(sig)) return '';
    if (/woocommerce-google-analytics|wc-order|ga4w|wc_add_to_cart|wpcf7/.test(sig)) return '';
    if (ANALYTICS.test(sig)) return gate(m, attrs, 'analytics');
    if (FUNCTIONAL.test(sig)) return gate(m, attrs, 'functional');
    if (KEEP.test(sig) && !/woocommerce-google-analytics|wc-order|ga4w|wc_add_to_cart|wpcf7/.test(sig)) return m;
    if (DROP.test(sig)) return '';
    return m;
  });
}

// ---------- One page ----------
const CF7 = { 21: 'contact', 704: 'quote', 593: 'guide', 9258: 'contact' };
const THANKS = { 704: '/request-quote-thank-you', 593: '/download-guide-thank-you' };
const brokenLinks = new Set();

function localPath(href) {
  // Page links: no trailing slash (the worker redirects "/x/" to "/x"); assets keep their file names.
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const [base, frag] = href.split('#');
  const [path, query] = base.split('?');
  if (/^\/(wp-content|wp-includes|_static|cdn-cgi)\//.test(path) || /\.[a-z0-9]{2,5}$/i.test(path)) {
    if (/^\/(wp-content\/(themes|plugins|cache)|wp-includes)\//.test(path)) return (assetUrl(path) || base) + (frag ? '#' + frag : '');
    return href;
  }
  // Page links keep WordPress's trailing slash (the site's addresses end in "/", as they always have).
  const slash = path.endsWith('/');
  let p = path.replace(/\/+$/, '') || '/';
  if (p !== '/' && !staticPaths.has(p) && !crmPages.includes(p) && !extra.crmPaths.includes(p) && !extra.extraPaths.includes(p) && !/^\/(blog|api)(\/|$)/.test(p)) brokenLinks.add(p);
  return (p === '/' ? '/' : p + (slash || !/^\/(blog|api)(\/|$)/.test(p) ? '/' : '')) + (query ? '?' + query : '') + (frag ? '#' + frag : '');
}

// Landing pages in WordPress (e.g. /get-a-quote) had only the logo in their header: give them the site's full header
// (taken from the Signage hub, so menu, phone and "Get a quote" match the rest of the site).
const FULL_HEADER_PAGES = ['/get-a-quote'];
function transform(html, path) {
  let h = html;
  if (FULL_HEADER_PAGES.includes(path) && captured.get('/signage-home')) {
    const full = (captured.get('/signage-home').match(/<header\b[^>]*id="masthead"[\s\S]*?<\/header>/) || [])[0];
    if (full) h = h.replace(/<header\b[^>]*id="masthead"[\s\S]*?<\/header>/, () => full);
  }
  // Cloudflare Rocket Loader renamed every script type; WP Rocket added markers.
  h = h.replace(/\stype=["'][0-9a-f]{16,}-text\/javascript["']/g, '').replace(/\sdata-rocket-[a-z-]+(=("[^"]*"|'[^']*'))?/g, '')
    .replace(/\sdata-minify="1"/g, '').replace(/\sdata-cfasync="false"/g, '');
  h = h.replace(/<!--\s*Start cookieyes banner\s*-->[\s\S]*?<!--\s*End cookieyes banner\s*-->/gi, '');
  // Google Analytics: WP Rocket served gtag.js from the site itself; load it from Google.
  h = h.replace(/src="https?:\/\/broadlanddigital\.co\.uk\/\?local_ga_js=[^"]*"/g, 'src="https://www.googletagmanager.com/gtag/js?id=GT-PJ7PZL8"');
  h = cleanScripts(h);
  // Head clutter
  h = h.replace(/<link[^>]+(oembed|wp-json|EditURI|xmlrpc|rel=['"]shortlink|rel=['"]dns-prefetch|rel=['"]https:\/\/api\.w\.org)[^>]*>\s*/gi, '')
    .replace(/<link[^>]+woocommerce-gateway-stripe[^>]*>\s*/gi, '')
    .replace(/<meta name="generator"[^>]*>\s*/gi, '');
  // Local addresses everywhere except the canonical, social and schema tags (they stay absolute).
  h = h.replace(/<(?!meta\b|link\b[^>]*rel=["'](canonical|alternate)["'])([a-z]+\b[^>]*)>/gi, (tag) =>
    tag.replace(/\b(href|src|action|data-src|data-href|poster)=(["'])(https?:)?\/\/(www\.)?broadlanddigital\.co\.uk(\/[^"']*)?\2/gi, (_m, a, q, _s, _w, p) => `${a}=${q}${p || '/'}${q}`)
      .replace(/\bsrcset=(["'])([^"']*)\1/gi, (_m, q, v) => `srcset=${q}${v.replace(/https?:\/\/(www\.)?broadlanddigital\.co\.uk/g, '')}${q}`)
      .replace(/url\((['"]?)https?:\/\/(www\.)?broadlanddigital\.co\.uk/g, 'url($1'));
  h = h.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (s) => s.replace(/url\((['"]?)https?:\/\/(www\.)?broadlanddigital\.co\.uk/g, 'url($1'));
  // Asset versions and page links
  h = h.replace(/\b(href|src|action)=(["'])(\/[^"']*)\2/g, (_m, a, q, v) => `${a}=${q}${localPath(v.replace(/&#0?38;|&amp;/g, '&'))}${q}`);
  // Forms (Contact Form 7 markup kept for its styling; bd-forms.js sends them to the CRM)
  h = h.replace(/<form\b[^>]*class="wpcf7-form[^"]*"[^>]*>/g, (tag) => {
    const id = (tag.match(/wpcf7-f(\d+)-/) || [])[1] || '21';
    return `<form class="wpcf7-form init" novalidate data-bd-form="${CF7[id] || 'contact'}"${THANKS[id] ? ` data-next="${THANKS[id]}"` : ''}>`;
  }).replace(/<fieldset class="hidden-fields-container">[\s\S]*?<\/fieldset>/g, '')
    .replace(/<input[^>]+name="_wpcf7[^"]*"[^>]*>/g, '');
  // Shop: orders become enquiries (lead in the CRM) instead of WooCommerce checkout.
  const title = productTitle.get(path) || '';
  h = h.replace(/<a href="\/cart\/?\?add-to-cart=\d+[^"]*">\s*<button class="([^"]*)">\s*ADD TO BASKET\s*<\/button>\s*<\/a>/gi, (_m, cls) => {
    const price = (h.match(/class="price[^"]*">\s*£<b>([\d.,]+)<\/b>/) || [])[1];
    return `<a href="#enquiry" data-enquire="${esc(title + (price ? ` (£${price})` : ''))}"><button type="button" class="${cls}">ENQUIRE NOW</button></a>`;
  });
  h = h.replace(/href="\/cart\/?\?add-to-cart=\d+[^"]*"/g, `href="${path}/"`).replace(/href="\/cart\/?"/g, 'href="/shop/"').replace(/href="\/(checkout|my-account)\/?"/g, 'href="/contact-us/"');
  h = h.replace(/<div[^>]*class="klarna-container"[^>]*>[\s\S]*?<\/div>/g, '');
  // Cookie consent first in <head>; "Cookie settings" in the footer's bottom line
  h = h.replace(/<head>/i, `<head>\n<script src="/_static/bd-consent.js?v=${CONSENT_V}"></script>`);
  // Browser-tab icon: the logo on the header's charcoal (site/public/favicon.*)
  h = h.replace(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>\s*|<link[^>]+apple-touch-icon[^>]*>\s*/gi, '')
    .replace(/<\/head>/i, '<link rel="icon" href="/favicon.ico" sizes="48x48">\n<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n</head>');

  // Menu: the theme's checkbox menu is replaced (content/menu.json)
  if (/<div class="navbar">/.test(h)) {
    const m = megaMenu(path);
    h = h.replace(/<div class="navbar">[\s\S]*?(<\/nav><!-- #site-navigation -->)/, () => m.button + '\n</nav><!-- #site-navigation -->')
      .replace(/<\/header>(<!-- #masthead -->)?/, (x) => x + '\n' + m.panel);
  }
  h = sectionHeader(h, path);
  h = breadcrumbs(h, path);
  if (path === '/') h = homePage(h);
  if (hubByPath.has(path)) h = hubPage(h, path);
  else if (/class="category page-(?:service|products)\b/.test(h) && !/thank-you/.test(path)) h = subPage(h, path);
  // Pictures: WordPress asked for the full-width original everywhere ("(max-width: 2560px) 100vw, 2560px") and loaded
  // them all at once. Cap at the content width and load off-screen ones lazily.
  // light WebP copies of heavy pictures shown without a srcset (tools/images/optimize.py → content/opt-images.json)
  // light WebP copies of heavy PNG/JPG sizes in srcset lists (tools/images/optimize_srcset.py)
  h = h.replace(/\ssrcset="([^"]+)"/g, (m, ss) => ` srcset="${ss.split(',').map((x) => { const [u, ...r] = x.trim().split(/\s+/); return [OPTS[u] || u, ...r].join(' '); }).join(', ')}"`)
    .replace(/(<img\b(?=[^>]*srcset=)[^>]*\ssrc=")(\/wp-content\/uploads\/[^"?]+)/g, (m, a, src) => (OPTS[src] ? a + OPTS[src] : m));
  h = h.replace(/(<img\b(?![^>]*srcset=)[^>]*\ssrc=")(\/wp-content\/uploads\/[^"?]+)/g, (m, a, src) => OPT[src] ? a + OPT[src] : m)
    .replace(/url\((\/wp-content\/uploads\/[^)'"?]+)\)/g, (m, src) => (OPT[src] ? `url(${OPT[src]})` : m));
  h = h.replace(/\ssizes="\(max-width: \d+px\) 100vw, \d+px"/g, ' sizes="(max-width: 1366px) 100vw, 1166px"')
    .replace(/<img\b(?![^>]*\b(?:loading|fetchpriority)=)(?![^>]*custom-logo)/g, '<img loading="lazy"');
  if (path === '/contact-us') h = contactPage(h);
  if (path === '/shop') h = shopPage(h);
  if (path === '/get-a-quote') h = quotePage(h).replace(/(<ul[^>]*class="menu bdh-links"[\s\S]*?<\/ul>)/, (m) => m.replace(/\saria-current="[^"]*"/g, ''));
  // Long legal pages: slightly smaller text (site/bd-pages.css .bd-legal)
  if (['/privacy-policy', '/returns', '/refund_returns'].includes(path)) h = h.replace(/class="category page\b/, 'class="category page bd-legal');
  h = h.replace(/<\/head>/i, `<link rel="stylesheet" href="/_static/bd-pages.css?v=${PAGES_V}">\n</head>`);
  // header.js expects the theme's menu checkbox; landing pages have no menu, so give it an inert one.
  if (!/class="nav-container"/.test(h)) h = h.replace(/<\/header>/, '<span class="nav-container" hidden><input type="checkbox" tabindex="-1" aria-hidden="true"></span></header>');
  // Footer: ours in place of the theme's (same section colour)
  h = h.replace(/<footer\b([^>]*)>[\s\S]*?<\/footer>/, (_m, attrs) => footerHtml((attrs.match(/class="([^"]*)"/) || [])[1] || '', { form: !['/get-a-quote', '/contact-us'].includes(path) }));
  h = h.replace(/<\/head>/i, `<link rel="stylesheet" href="/_static/bd-footer.css?v=${FOOTER_V}">\n</head>`);
  // Phone fields were number inputs (no spaces, arrows): proper phone fields
  h = h.replace(/(<input[^>]*name="your-phone"[^>]*)type="number"/g, '$1type="tel" inputmode="tel"').replace(/type="number"([^>]*name="your-phone")/g, 'type="tel" inputmode="tel"$1');
  h = h.replace(/<\/head>/i, `<link rel="stylesheet" href="/_static/bd-menu.css?v=${MENU_V}">\n</head>`);
  h = h.replace(/<\/body>/i, `<script src="/_static/bd-menu.js?v=${MENU_V}" defer></script>\n</body>`);
  // Our form script, after the theme's scripts
  h = h.replace(/<\/body>/i, `<script src="/_static/bd-forms.js?v=${FORMS_V}" defer></script>\n</body>`);
  h = h.replace(/<\/body>/i, SITE_SEARCH + '\n' + CRM_BOT + '\n</body>');
  h = fixSchema(h);
  return h;
}

// Structured data (the JSON-LD copied from WordPress / Yoast): the business node also becomes a LocalBusiness with the
// phone, a photo and the Google Maps link (hasMap, from the Business Profile); placeholder pictures (Yoast's
// "category-fimage-placeholder") and author avatars are replaced by the page's own share picture as its main image.
// The SEO optimiser scores pages on these (Schema → picture, logo and map).
const BD_MAP = 'https://maps.google.com/maps?cid=15721225970647822825';
const BD_PHOTO = 'https://broadlanddigital.co.uk/wp-content/uploads/2024/04/signage-15-scaled_v2-jpg.webp';
const PLACEHOLDER = /placeholder|gravatar|avatar/i;
function fixSchema(html) {
  const og = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) || [])[1] || '';
  const photo = og && !PLACEHOLDER.test(og) ? og.replace(/&amp;/g, '&') : BD_PHOTO;
  return html.replace(/(<script\b[^>]*type=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi, (all, open, body, close) => {
    let j; try { j = JSON.parse(body); } catch { return all; }
    const graph = Array.isArray(j['@graph']) ? j['@graph'] : null; if (!graph) return all;
    let changed = false;
    for (let i = graph.length - 1; i >= 0; i--) {
      const o = graph[i]; if (!o || typeof o !== 'object') continue;
      if (o['@type'] === 'Organization' && /broadlanddigital\.co\.uk\/#organization/.test(o['@id'] || '')) {
        o['@type'] = ['Organization', 'LocalBusiness'];
        if (!o.telephone) o.telephone = '+44 1603 407786';
        if (!o.image) o.image = BD_PHOTO;
        if (!o.hasMap) o.hasMap = BD_MAP;
        changed = true;
      }
      if (o['@type'] === 'Place' && /#place$/.test(o['@id'] || '') && !o.hasMap) { o.hasMap = BD_MAP; changed = true; }
      // Drop placeholder image nodes and point the page at a real picture.
      if (o['@type'] === 'ImageObject' && PLACEHOLDER.test(String(o.url || o['@id'] || '')) && !/author/.test(String(o['@id']))) { graph.splice(i, 1); changed = true; continue; }
      if (o['@type'] === 'WebPage' || (Array.isArray(o['@type']) && o['@type'].includes('WebPage'))) {
        const cur = o.primaryImageOfPage, curUrl = typeof cur === 'string' ? cur : cur?.url || cur?.['@id'] || '';
        if (!curUrl || PLACEHOLDER.test(curUrl)) { o.primaryImageOfPage = { '@type': 'ImageObject', url: photo, contentUrl: photo }; changed = true; }
      }
      for (const k of ['image', 'thumbnailUrl']) {
        const v = o[k], u = typeof v === 'string' ? v : v?.url || v?.['@id'] || '';
        if (u && PLACEHOLDER.test(u) && o['@type'] !== 'Person') { o[k] = photo; changed = true; }
      }
    }
    return changed ? open + JSON.stringify(j).replace(/</g, '\\u003c') + close : all;
  });
}

const formsJs = readFileSync(join(ROOT, 'site/bd-forms.js'));
const FORMS_V = hash(formsJs);
const consentJs = readFileSync(join(ROOT, 'site/bd-consent.js'));
const menuCss = readFileSync(join(ROOT, 'site/bd-menu.css'));
const menuJs = readFileSync(join(ROOT, 'site/bd-menu.js'));
const MENU_V = hash(Buffer.concat([menuCss, menuJs]));
const menu = JSON.parse(readFileSync(join(ROOT, 'content/menu.json'), 'utf8'));
const footerCss = readFileSync(join(ROOT, 'site/bd-footer.css'));
const FOOTER_V = hash(footerCss);
const pagesCss = readFileSync(join(ROOT, 'site/bd-pages.css'));
const PAGES_V = hash(pagesCss);

// The full-screen menu (content/menu.json), in place of the theme's checkbox menu. The current page and its section
// are marked; header.js still looks for the old checkbox, so an inert one stays.
// Header: the main sections as plain links (the full menu has every page), the current section marked; then the
// phone number and a Get a quote button where the theme had a basket icon (there's no basket: orders are enquiries).
const SECTION_OF_HEADER = { signage: 'signage', print: 'print', design: 'design', 'web-dev': 'web', 'liquid-wrapping': 'liquid-wrapping' };
const HEADER_ORDER = ['design', 'print', 'web', 'signage', 'liquid-wrapping'];
function headerNav(path, currentClass) {
  const here = path === '/' ? '/' : path + '/';
  const items = HEADER_ORDER.map((c) => menu.sections.find((x) => x.class === c)).filter(Boolean).map((sec) => {
    const inSec = currentClass === sec.class || here === sec.href || sec.links.some(([, h]) => h === here);
    return `<li><a href="${sec.href}"${inSec ? ' aria-current="true"' : ''}>${esc(sec.title)}</a></li>`;
  }).join('');
  return `<ul id="menu-main" class="menu bdh-links">${items}</ul>`;
}
const PHONE_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
const SEARCH_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
// CRM site search + AI assistant (Marketing → Site search; key in the CRM's site_search_configs). It opens from
// [data-site-search] elements (shown once it has loaded), "/" or Ctrl/Cmd+K.
const SITE_SEARCH = '<script src="https://crm.racecargraphics.uk/embed/site-search.js" data-key="cb26807045182484b558ce3a" defer></script>';
// The CRM's chat assistant (Channels → Broadland Digital Site Assistant): its enquiries become Broadland Digital leads in
// the CRM. It only remembers a visitor with "Analytics & marketing" consent (window.__crmBotTracking, set by bd-consent.js).
const CRM_BOT = '<script src="https://crm.racecargraphics.uk/rcg-enquiry-bot.js" data-bot-key="1fc0c248-2a70-4c51-9ed0-b43b1ba5a339" defer></script>';
function headerActions() {
  return `<div class="bdh-actions"><button class="bdh-search" type="button" data-site-search hidden aria-label="Search the site or ask a question">${SEARCH_ICON}<span>Search</span></button><a class="bdh-phone" href="tel:${menu.phone.replace(/\s/g, '')}" aria-label="Call ${esc(menu.phone)}">${PHONE_ICON}<span>${esc(menu.phone)}</span></a>`
    + `<a class="bdh-quote" href="/get-a-quote/"><span class="bdh-long">Get a quote</span><span class="bdh-short">Quote</span></a></div>`;
}
function sectionHeader(h, path) {
  const cls = (h.match(/id="masthead" class="site-header ([a-z-]+)"/) || [])[1] || '';
  return h.replace(/<ul id="menu-[a-z-]+" class="menu">[\s\S]*?<\/ul>/, () => headerNav(path, SECTION_OF_HEADER[cls]))
    .replace(/<a href="[^"]*">\s*<img class="ms-4" src="[^"]*cart-shopping-light\.svg[^"]*"[^>]*>\s*<\/a>/, headerActions);
}

// Footer (content/menu.json → footer): enquiry form, contact details, every section's links, legal and social links.
// Its colour follows the page's section, as the theme's footer did.
const FOOTER_CLASSES = ['signage', 'print', 'design', 'web-dev', 'liquid-wrapping'];
const ICON = {
  phone: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
  mail: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M3 5h18v14H3zM3 6l9 7 9-7"/></svg>',
  pin: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
  Facebook: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 8.5V6.8c0-.8.5-1 1-1h2.3V2.1L14.2 2C10.8 2 10 4.5 10 6.2v2.3H7.6V12H10v10h4V12h3l.4-3.5z"/></svg>',
  Instagram: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.3" fill="currentColor"/></svg>',
};
function footerHtml(cls, opts = {}) {
  const f = menu.footer;
  const field = (name, label, attrs, wide, hint = '') => `<div class="bdf-field${wide ? ' wide' : ''}"><label for="bdf-${name}">${label}${hint ? ` <small>${hint}</small>` : ''}</label>`
    + (name === 'message' ? `<textarea id="bdf-${name}" name="${name}" ${attrs} aria-describedby="bdf-${name}-err"></textarea>` : `<input id="bdf-${name}" name="${name}" ${attrs} aria-describedby="bdf-${name}-err">`)
    + `<span class="bdf-err" id="bdf-${name}-err" aria-live="polite"></span></div>`;
  const cols = menu.sections.map((sec) => `<div><h3><a href="${sec.href}">${esc(sec.title)}</a></h3><ul>${sec.links.map(([l, h]) => `<li><a href="${h}">${esc(l)}</a></li>`).join('')}</ul></div>`).join('')
    + `<div><h3>Broadland Digital</h3><ul>${f.company.map(([l, h]) => `<li><a href="${h}">${esc(l)}</a></li>`).join('')}</ul></div>`;
  return `<footer class="bdf ${FOOTER_CLASSES.includes(cls) ? cls : ''}${opts.form === false ? ' bdf-noform' : ''}"><div class="container">
${opts.form === false ? '' : `<div class="bdf-top">
<div class="bdf-intro"><h2 class="bdf-h">${esc(f.heading)}</h2><p>${esc(f.intro)}</p>
<ul class="bdf-contact">
<li>${ICON.phone}<a class="bdf-big" href="tel:${menu.phone.replace(/\s/g, '')}">${esc(menu.phone)}</a></li>
<li>${ICON.mail}<a href="mailto:${menu.email}">${esc(menu.email)}</a></li>
<li>${ICON.pin}<a href="${esc(f.maps)}" target="_blank" rel="noopener">Broadland Digital, ${esc(menu.address)}</a></li>
</ul></div>
<div class="bdf-wrap" id="enquiry">
<form class="bdf-form" data-bd-form="contact" novalidate aria-label="Enquiry form">
${field('name', 'Name', 'type="text" autocomplete="name" required maxlength="120"')}
${field('phone', 'Phone', 'type="tel" inputmode="tel" autocomplete="tel" required maxlength="40" placeholder="e.g. 07700 900123"')}
${field('email', 'Email', 'type="email" inputmode="email" autocomplete="email" required maxlength="254" placeholder="name@company.co.uk"', true)}
${field('message', 'How can we help?', 'rows="4" maxlength="6000" placeholder="What you need, rough sizes or quantities, and when you need it"', true, '(optional)')}
<div class="bdf-hp" aria-hidden="true"><label for="bdf-website">Leave this empty</label><input id="bdf-website" name="website" tabindex="-1" autocomplete="off"></div>
<div class="bdf-summary" role="alert"></div>
<div class="bdf-actions"><button class="bdf-send" type="submit"><span class="bdf-spin" aria-hidden="true"></span><span class="bdf-label">Send enquiry</span></button>
<p class="bdf-note">We'll only use your details to reply to your enquiry. See our <a href="/privacy-policy/">privacy policy</a>.</p></div>
</form>
<div class="bdf-done" role="status"><h3>Thank you<span class="bdf-done-name"></span>.</h3><p>We've received your enquiry and will be in touch shortly, usually the same working day. If it's urgent, call us on <a href="tel:${menu.phone.replace(/\s/g, '')}">${esc(menu.phone)}</a>.</p><button type="button" class="bdf-again">Send another enquiry</button></div>
</div>
</div>`}
<nav class="bdf-links" aria-label="Footer">${cols}</nav>
<section class="bdf-brands" aria-labelledby="bdf-brands-title"><h3 id="bdf-brands-title">Group brands</h3><div class="bdf-brand-grid">${f.brands.map((b) => {
    const img = `<img src="${b.logo}" alt="${esc(b.name)}" loading="lazy"${b.square ? ' class="sq"' : ''}>`;
    return b.current ? `<a href="/" aria-current="true" aria-label="${esc(b.name)} home page">${img}</a>`
      : b.href ? `<a href="${b.href}" target="_blank" rel="noopener" aria-label="${esc(b.name)} website (opens in a new tab)">${img}</a>` : `<div>${img}</div>`;
  }).join('')}</div></section>
<div class="bdf-bottom"><span>© ${new Date().getFullYear()} Broadland Digital Ltd. All rights reserved.</span>
<nav aria-label="Legal">${f.legal.map(([l, h]) => `<a href="${h}">${esc(l)}</a>`).join('')}<a href="#cookie-settings" data-bd-cookie-settings>Cookie settings</a></nav>
<div class="bdf-social">${f.social.map(([l, h]) => `<a href="${h}" target="_blank" rel="noopener" aria-label="Broadland Digital on ${l}">${ICON[l] || l}</a>`).join('')}</div></div>
</div></footer>`;
}

// Breadcrumbs: a trail above each page's title (Home / Signage / Vehicle graphics / Van graphics) and the same trail
// as BreadcrumbList schema. Parents come from the address, WordPress's page parents, the hub that lists a page, and the
// menu (content/menu.json); names from the menu, else the page's own title.
const wpParent = new Map(wp.pages.filter((p) => p.parent).map((p) => [p.path, p.parent]));
// (the brochure page links to everything, so it's never a parent)
for (const p of wp.pages) for (const sec of p.sections || []) if (sec.kind === 'cards' && /-home$/.test(p.path)) for (const it of sec.items || []) {
  const h = String(it.href || '').replace(/\/+$/, '');
  if (h && h.startsWith('/') && h !== p.path && !wpParent.has(h)) wpParent.set(h, p.path);
}
const slugify = (t) => t.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const catName = new Map(wp.products.flatMap((p) => p.categories).map((c) => [slugify(c), c]));
const menuName = new Map();
const menuParent = new Map();
for (const sec of menu.sections) {
  menuName.set(sec.href.replace(/\/+$/, ''), sec.title);
  for (const [l, h] of sec.links) { const k = h.replace(/\/+$/, ''); if (!menuName.has(k)) menuName.set(k, l); if (k !== sec.href.replace(/\/+$/, '')) menuParent.set(k, sec.href.replace(/\/+$/, '')); }
}
const decode = (t) => t.replace(/&amp;|&#0?38;/g, '&').replace(/&#8211;|&ndash;/g, '–').replace(/&#8217;|&rsquo;/g, '’').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(+n));
function pageName(p) {
  if (p === '/') return 'Home';
  const pg = p.match(/\/page\/(\d+)$/);
  if (pg) return `Page ${pg[1]}`;
  if (p === '/shop' || p === '/category') return 'Shop';
  const bc = extra.breadcrumbs || {};
  if (bc.names && bc.names[p]) return bc.names[p];
  if (menuName.has(p)) return menuName.get(p);
  const html = captured.get(p) || '';
  // Shop categories: the WooCommerce category's own name (from the products), blog categories: from the address.
  if (p.startsWith('/category/')) { const n = catName.get(p.split('/').pop()); if (n) return n; }
  if (p.startsWith('/posts/')) { const w = p.split('/').pop().replace(/-/g, ' '); return w === 'web dev' ? 'Web Dev' : w.charAt(0).toUpperCase() + w.slice(1); }
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
  const t = h1 ? decode(h1.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim().replace(/\.$/, '') : '';
  if (t && t !== 'Our Shop') return t;
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || p.split('/').pop().replace(/-/g, ' ');
  return decode(title).split(/ [-|–] /)[0].trim();
}
const known = (p) => p === '/' || staticPaths.has(p) || p === '/shop';
function trail(path) {
  if (path === '/') return [];
  const chain = [path];
  let cur = path;
  for (let i = 0; i < 8; i++) {
    let parent = null;
    if (/\/page\/\d+$/.test(cur)) parent = cur.replace(/\/page\/\d+$/, '');
    else if (cur.startsWith('/product/')) parent = productParent(cur);
    else if (cur.startsWith('/category/')) { const up = cur.split('/').slice(0, -1).join('/'); parent = up === '/category' ? '/shop' : up; }
    else if ((extra.breadcrumbs || {}).parents?.[cur]) parent = extra.breadcrumbs.parents[cur];
    else {
      const up = cur.split('/').slice(0, -1).join('/');
      parent = (up && known(up)) ? up : (menuParent.get(cur) || wpParent.get(cur) || null);
    }
    if (!parent || parent === '/' || chain.includes(parent) || !known(parent)) break;
    chain.unshift(parent); cur = parent;
  }
  return ['/', ...chain].map((p) => ({ path: p, name: pageName(p) }));
}
function productParent(p) {
  const prod = wp.products.find((x) => x.path === p);
  const cats = prod ? prod.categories : [];
  if (cats.includes('Vehicle Graphics') && known('/category/signage/vehicle-graphics')) return '/category/signage/vehicle-graphics';
  if (cats.includes('Liquid Wrapping') && known('/category/liquid-wrapping')) return '/category/liquid-wrapping';
  return '/shop';
}
function breadcrumbs(h, path) {
  const t = trail(path);
  const hero = /(<section[^>]*class="[^"]*\bbanner\b[^"]*"[^>]*>\s*<div[^>]*class="container[^"]*"[^>]*>)/;
  if (t.length < 2 || !hero.test(h)) return h;
  const url = (p) => ORIGIN + (p === '/' ? '/' : p + '/');
  const nav = `<nav class="bdc" aria-label="Breadcrumb"><ol>${t.map((c, i) => i === t.length - 1
    ? `<li><span aria-current="page">${esc(c.name)}</span></li>` : `<li><a href="${c.path === '/' ? '/' : c.path + '/'}">${esc(c.name)}</a></li>`).join('')}</ol></nav>`;
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: t.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: url(c.path) })) };
  return h.replace(hero, (m) => m + '\n' + nav)
    .replace(/<\/head>/i, `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n</head>`);
}

// Home page: hero with the quote and call buttons and a picture collage, the five services as a grid, why us, and
// the about text (from WordPress) with the rest behind "Read more". Wording in content/menu.json → home.
function homePage(h) {
  const tiles = {};
  for (const m of h.matchAll(/<a href="([^"]+)" class="section [^"]*"[^>]*style="background-image: url\(([^)]+)\)"/g)) tiles[m[1].replace(/\/+$/, '')] = m[2].replace(/['"]/g, '');
  const title = decode(((h.match(/<h1 class="banner-title">([\s\S]*?)<\/h1>/) || [])[1] || 'Creative solutions. Real results.').replace(/<[^>]+>/g, '')).trim();
  const lead = decode(((h.match(/<div class="banner-subtitle">([\s\S]*?)<\/div>/) || [])[1] || '').replace(/<[^>]+>/g, '')).trim();
  const about = (h.match(/<section class="container standard-padding home-content[^"]*">([\s\S]*?)<\/section>/) || [])[1] || '';
  const paras = [...about.matchAll(/<p class="wp-block-paragraph">([\s\S]*?)<\/p>/g)].map((m) => m[1].trim()).filter(Boolean);
  const H = menu.home;
  const secs = HEADER_ORDER.map((c) => menu.sections.find((x) => x.class === c)).filter(Boolean);
  const order = ['signage', 'print', 'design', 'web', 'liquid-wrapping'].map((c) => menu.sections.find((x) => x.class === c));
  const img = (sec) => tiles[sec.href.replace(/\/+$/, '')] || '';
  const [t1, ...t2] = title.split(/(?<=\.)\s+/);
  const collage = ['signage', 'liquid-wrapping', 'print'].map((c) => menu.sections.find((x) => x.class === c)).map((sec) =>
    `<a href="${sec.href}" tabindex="-1" aria-hidden="true"><img src="${img(sec)}" alt="" loading="eager"><span>${esc(sec.title)}</span></a>`).join('');
  const cards = order.map((sec) => `<a class="bdh-card ${sec.class}" href="${sec.href}"><img src="${img(sec)}" alt="" loading="lazy">
<h3>${esc(sec.title)}.</h3><p>${esc(sec.summary)}</p><span class="bdh-go"><i aria-hidden="true">${BIG_ARROW}</i>Explore ${esc(sec.title.toLowerCase())}</span></a>`).join('\n');
  const body = `<div class="bdh">
<section class="bdh-hero"><div class="wrap">
<div><span class="bdh-eyebrow">${esc(H.eyebrow)}</span>
<h1><span>${esc(t1)}</span>${t2.length ? `<span>${esc(t2.join(' '))}</span>` : ''}</h1>
${lead ? `<p class="bdh-lead">${esc(lead)}</p>` : ''}
<div class="bdh-cta"><a class="bdh-btn bdh-btn--solid" href="/get-a-quote/">Get a free quote</a><a class="bdh-btn bdh-btn--ghost" href="tel:${menu.phone.replace(/\s/g, '')}">Call ${esc(menu.phone)}</a></div>
<ul class="bdh-chips">${secs.map((sec) => `<li><a href="${sec.href}" style="--c:var(--c-${sec.class})">${esc(sec.title)}</a></li>`).join('')}</ul></div>
<div class="bdh-collage">${collage}</div>
</div></section>
<section class="bdh-section" aria-labelledby="bdh-what"><div class="wrap">
<div class="bdh-head"><h2 id="bdh-what">What we do.</h2><p>Signage, print, design, web and liquid wrapping under one roof in Norwich, so one call covers the whole job.</p></div>
<div class="bdh-grid">${cards}</div>
</div></section>
<section class="bdh-section bdh-why" aria-labelledby="bdh-why"><div class="wrap">
<div class="bdh-head"><h2 id="bdh-why">Why Broadland Digital.</h2></div>
<div class="bdh-points">${H.points.map((pt, i) => `<div class="bdh-point"><b aria-hidden="true">${i + 1}</b><h3>${esc(pt.title)}</h3><p>${esc(pt.text)}</p></div>`).join('')}</div>
</div></section>
<section class="bdh-section bdh-about" aria-labelledby="bdh-about"><div class="wrap">
<h2 id="bdh-about">About Broadland Digital.</h2>
<div class="bdh-text">${paras.slice(0, 2).map((p) => `<p>${p}</p>`).join('')}
${paras.length > 2 ? `<details><summary><span class="more">Read more</span><span class="less">Show less</span></summary>${paras.slice(2).map((p) => `<p>${p}</p>`).join('')}</details>` : ''}
<div class="bdrel"><span class="bdrel-label">Useful</span>${H.guides.map(([l, h2]) => `<a class="bdrel-chip" href="${/^\/blog$/.test(h2) ? h2 : h2}">${esc(l)}<span aria-hidden="true">${BIG_ARROW}</span></a>`).join('')}</div></div>
</div></section>
</div>`;
  return h.replace(/<div class="homepage">[\s\S]*?(?=<footer)/, body + '\n');
}

// Section hubs (content/hubs.json): hero with breadcrumbs and buttons, intro (with the WordPress wording behind
// "Read more"), the section's pages as cards, how it works, resources from the CRM (filled in live by the worker:
// worker/hub-resources.js), FAQs (with FAQPage schema) and a closing call to action.
const hubs = JSON.parse(readFileSync(join(ROOT, 'content/hubs.json'), 'utf8'));
const hubByPath = new Map(Object.entries(hubs).filter(([k]) => !k.startsWith('_')).map(([cls, v]) => [v.path, { cls, ...v }]));
// A card's one-line description: the first sentence of the linked page's meta description.
function cardDesc(href) {
  const key = href.replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '') || '/';
  const page = captured.get(key) || captured.get(key + '/') || '';
  const d = decode(((page.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '')).trim();
  const first = (d.match(/^.*?[.!?](?=\s|$)/) || [d])[0];
  return first.length > 150 ? first.slice(0, 147).replace(/\s+\S*$/, '') + '…' : first;
}
function hubPage(h, path) {
  const hub = hubByPath.get(path);
  const sec = menu.sections.find((x) => x.class === hub.cls);
  let heroImg = '';
  for (const m of (captured.get('/') || '').matchAll(/<a href="([^"]+)" class="section [^"]*"[^>]*style="background-image: url\(([^)]+)\)"/g)) {
    if (m[1].replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '') === sec.href.replace(/\/+$/, '')) heroImg = m[2].replace(/['"]/g, '').replace(/^https?:\/\/(www\.)?broadlanddigital\.co\.uk/, '');
  }
  // the hub's own page cards (picture, title, link) from the theme's list
  const cards = [...h.matchAll(/<li class="px-3">\s*<img[^>]*src="([^"]+)"[^>]*\/?>\s*<a href="([^"]*)">([\s\S]*?)<\/a>/g)]
    .map((m) => ({ img: m[1], href: m[2], title: decode(m[3]).trim() })).filter((c) => c.href)
    .map((c) => ({ ...c, desc: cardDesc(c.href) }));
  const linked = new Set(cards.map((c) => c.href.replace(/\/+$/, '')));
  const more = sec.links.filter(([, hh]) => !linked.has(hh.replace(/\/+$/, '')));
  // the WordPress wording, kept behind "Read more"
  let wpText = '';
  if (hub.keepWordPressText) {
    const raw = (h.match(/<div\s+class="section-one-content[^"]*">([\s\S]*?)<\/div>\s*<\/section>/) || [])[1] || '';
    wpText = raw.replace(/<a [^>]*ub-expand-toggle-button[^>]*>[\s\S]*?<\/a>/g, '').replace(/<\/?div[^>]*>/g, '').replace(/<br\s*\/?>\s*(<br\s*\/?>)?/g, '')
      .replace(/<p[^>]*>\s*<\/p>/g, '').replace(/\sstyle="[^"]*"/g, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  }
  const t = trail(path);
  const crumbs = `<nav class="bdc" aria-label="Breadcrumb"><ol>${t.map((c, i) => i === t.length - 1 ? `<li><span aria-current="page">${esc(c.name)}</span></li>` : `<li><a href="${c.path === '/' ? '/' : c.path + '/'}">${esc(c.name)}</a></li>`).join('')}</ol></nav>`;
  const tel = menu.phone.replace(/\s/g, '');
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: hub.faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  const body = `<div class="bdhub ${hub.cls}">
<section class="bdhub-hero"><div class="wrap">
<div class="bdhub-hero-text">${crumbs}
<span class="bdhub-eyebrow">${esc(sec.title)}</span>
<h1>${esc(hub.heading)}</h1>
<p class="bdhub-lead">${esc(sec.summary)}</p>
<div class="bdhub-cta"><a class="bdhub-btn bdhub-btn--solid" href="/get-a-quote/?service=${hub.cls}">Get a free quote</a><a class="bdhub-btn bdhub-btn--ghost" href="tel:${tel}">Call ${esc(menu.phone)}</a></div></div>
${heroImg ? `<figure class="bdhub-hero-img"><img src="${heroImg}" alt="" fetchpriority="high"></figure>` : ''}
</div></section>
<section class="bdhub-intro"><div class="wrap">
<h2>${esc(sec.title)} at Broadland Digital.</h2>
<div class="bdhub-text">${hub.intro.map((p) => `<p>${esc(p)}</p>`).join('')}
${wpText ? `<details class="bdhub-more"><summary><span class="more">Read more</span><span class="less">Show less</span></summary><div class="bdhub-wp">${wpText}</div></details>` : ''}</div>
</div></section>
<section class="bdhub-services" aria-labelledby="bdhub-services-h"><div class="wrap">
<div class="bdhub-head"><h2 id="bdhub-services-h">${esc(hub.servicesTitle)}</h2><a class="bdhub-textlink" href="/get-a-quote/?service=${hub.cls}">Not sure what you need? Ask us →</a></div>
<div class="bdhub-tiles n${cards.length}">${cards.map((c) => `<a class="bdhub-tile" href="${c.href}"><img src="${c.img}" alt="" loading="lazy"><span class="bdhub-tile-in"><span class="bdhub-tile-title">${esc(c.title)}</span>${c.desc ? `<span class="bdhub-tile-desc">${esc(c.desc)}</span>` : ''}<span class="bdhub-tile-go">View service <i aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 12h15M13 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></i></span></span></a>`).join('')}</div>
${more.length ? `<div class="bdrel bdhub-alsorow"><span class="bdrel-label">Also in ${esc(sec.title)}</span>${more.map(([l, hh]) => `<a class="bdrel-chip" href="${hh}">${esc(l)}<span aria-hidden="true">${BIG_ARROW}</span></a>`).join('')}</div>` : ''}
</div></section>
<section class="bdhub-steps" aria-labelledby="bdhub-steps-h"><div class="wrap">
<div class="bdhub-head"><h2 id="bdhub-steps-h">How it works.</h2></div>
<ol>${hub.steps.map(([a, b]) => `<li><h3>${esc(a)}</h3><p>${esc(b)}</p></li>`).join('')}</ol>
</div></section>
<section class="bdhub-res" data-bd-resources="${hub.cls}" hidden aria-labelledby="bdhub-res-h"><div class="wrap"><div class="bdhub-head"><h2 id="bdhub-res-h">Guides &amp; resources.</h2></div><div class="bdhub-res-body"></div></div></section>
<section class="bdhub-faq" aria-labelledby="bdhub-faq-h"><div class="wrap">
<h2 id="bdhub-faq-h">Questions.</h2>
<div class="bdhub-faqs">${hub.faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
</div></section>
<section class="bdhub-band"><div class="wrap"><div><h2>Ready to talk about your project?</h2><p>Tell us what you need and we'll come back to you, usually the same working day.</p></div>
<div class="bdhub-cta"><a class="bdhub-btn bdhub-btn--solid" href="/get-a-quote/?service=${hub.cls}">Get a free quote</a><a class="bdhub-btn bdhub-btn--ghost" href="tel:${tel}">Call ${esc(menu.phone)}</a></div></div></section>
</div>
`;
  return h.replace(/<div[^>]*class="category page[^"]*"[^>]*>[\s\S]*?(?=<footer)/, body)
    .replace(/<\/head>/i, `<script type="application/ld+json">${JSON.stringify(faqLd).replace(/</g, '\\u003c')}</script>\n</head>`);
}

// Get a quote (/get-a-quote): one quote form for every service (service chips, project details, contact details),
// what happens next, contact details and the van-wrap offer the old page led with. Posts to /api/forms as a
// "quote" lead, then goes to the old thank-you page (kept for conversion tracking).
function quotePage(h) {
  const tel = menu.phone.replace(/\s/g, '');
  const vanImg = (h.match(/quote-banner[^>]*url\('([^']+)'\)/) || [])[1] || '';
  const crumbs = (h.match(/<nav class="bdc"[\s\S]*?<\/nav>/) || [''])[0];
  const field = (name, label, attrs, wide, hint = '') => `<div class="bdf-field${wide ? ' wide' : ''}"><label for="bdq-${name}">${label}${hint ? ` <small>${hint}</small>` : ''}</label>`
    + (name === 'message' ? `<textarea id="bdq-${name}" name="${name}" ${attrs} aria-describedby="bdq-${name}-err"></textarea>`
      : name === 'timescale' ? `<select id="bdq-${name}" name="${name}" ${attrs} aria-describedby="bdq-${name}-err"><option value="">Choose…</option>${['As soon as possible', 'Within 2 weeks', 'Within a month', '1–3 months', 'Just planning ahead'].map((o) => `<option>${o}</option>`).join('')}</select>`
      : `<input id="bdq-${name}" name="${name}" ${attrs} aria-describedby="bdq-${name}-err">`)
    + `<span class="bdf-err" id="bdq-${name}-err" aria-live="polite"></span></div>`;
  const services = [...menu.sections.map((x) => [x.class, x.title]), ['other', 'Something else']];
  const body = `<div class="bdq">
<section class="bdq-hero"><div class="wrap">${crumbs}
<span class="bdq-eyebrow">Free, no-obligation quote</span>
<h1>Get a free quote.</h1>
<p class="bdq-lead">Tell us about your project and we'll come back with a price and ideas, usually the same working day. Design, print, web, signage and liquid wrapping, all under one roof in Norwich.</p>
<ul class="bdq-points"><li>No obligation, no hard sell</li><li>Reply usually the same working day</li><li>One team from design to installation</li></ul>
</div></section>
<section class="bdq-main"><div class="wrap">
<div class="bdq-card bdf-wrap" id="enquiry">
<form class="bdf-form bdq-form" data-bd-form="quote" data-next="/request-quote-thank-you/" novalidate aria-label="Quote request">
<fieldset class="bdq-step wide"><legend><span>1</span>What do you need?</legend>
<div class="bdq-chips">${services.map(([v, t]) => `<label class="bdq-chip ${v}"><input type="radio" name="service" value="${esc(t)}" data-key="${v}"><span>${esc(t)}</span></label>`).join('')}</div></fieldset>
<fieldset class="bdq-step wide"><legend><span>2</span>Your project</legend>
<div class="bdq-grid">
${field('message', 'Tell us about it', 'rows="5" maxlength="6000" placeholder="What you need, rough sizes or quantities, any artwork or branding you already have"', true, '(the more detail, the better the quote)')}
${field('timescale', 'When do you need it?', '', false, '(optional)')}
${field('budget', 'Rough budget', 'type="text" maxlength="60" placeholder="e.g. £500–£1,000"', false, '(optional)')}
</div></fieldset>
<fieldset class="bdq-step wide"><legend><span>3</span>Your details</legend>
<div class="bdq-grid">
${field('name', 'Name', 'type="text" autocomplete="name" required maxlength="120"')}
${field('company', 'Company', 'type="text" autocomplete="organization" maxlength="120"', false, '(optional)')}
${field('phone', 'Phone', 'type="tel" inputmode="tel" autocomplete="tel" required maxlength="40" placeholder="e.g. 07700 900123"')}
${field('email', 'Email', 'type="email" inputmode="email" autocomplete="email" required maxlength="254" placeholder="name@company.co.uk"')}
</div></fieldset>
<div class="bdf-hp" aria-hidden="true"><label for="bdq-website">Leave this empty</label><input id="bdq-website" name="website" tabindex="-1" autocomplete="off"></div>
<div class="bdf-summary" role="alert"></div>
<div class="bdf-actions"><button class="bdf-send" type="submit"><span class="bdf-spin" aria-hidden="true"></span><span class="bdf-label">Request my quote</span></button>
<p class="bdf-note">We'll only use your details to reply about your quote. See our <a href="/privacy-policy/">privacy policy</a>.</p></div>
</form>
<div class="bdf-done" role="status"><h3>Thank you<span class="bdf-done-name"></span>.</h3><p>We've got your quote request and will be in touch shortly. If it's urgent, call us on <a href="tel:${tel}">${esc(menu.phone)}</a>.</p><button type="button" class="bdf-again">Send another request</button></div>
</div>
<aside class="bdq-side">
<div class="bdq-box"><h2>What happens next?</h2><ol class="bdq-next"><li><b>We read your brief</b><span>A member of the team looks at what you need, not a call centre.</span></li><li><b>We get in touch</b><span>Usually the same working day, to ask anything we need and talk through options.</span></li><li><b>You get your quote</b><span>A clear price with no obligation. Happy? We get started.</span></li></ol></div>
<div class="bdq-box bdq-talk"><h2>Prefer to talk?</h2>
<a class="bdq-phone" href="tel:${tel}">${ICON.phone}${esc(menu.phone)}</a>
<a href="mailto:${menu.email}">${ICON.mail}${esc(menu.email)}</a>
<a href="${esc(menu.footer.maps)}" target="_blank" rel="noopener">${ICON.pin}${esc(menu.address)}</a></div>
${vanImg ? `<a class="bdq-box bdq-offer" href="/liquid-wrapping-home/"><img src="${vanImg}" alt="A van with a half wrap" loading="lazy"><span class="bdq-offer-t">Van wraps from just <b>£0.82 a day*</b></span><span class="bdq-offer-s">Driving down your advertising costs. *Based on a half wrap with a life expectancy of 5 years.</span></a>` : ''}
</aside>
</div></section>
</div>
`;
  // a landing page in WordPress (no footer): the site footer is added, without its enquiry form
  if (!/<footer\b/.test(h)) h = h.replace(/<\/body>/i, '<footer class="signage"></footer>\n</body>');
  return h.replace(/<div[^>]*class="category page[^"]*"[^>]*>[\s\S]*?(?=<footer)/, body);
}

// Service and product sub pages (theme templates page-service / page-products, e.g. /vehicle-graphics/): the hubs'
// look. Hero with breadcrumbs, lead and buttons and the page picture; the WordPress text kept (its "show more");
// the "find out more" blocks as gradient photo tiles; the inspiration gallery as a tidy grid (small, lazy-loaded
// pictures, first nine shown, click to enlarge); the shop link and the product builder kept; a closing band.
const SUB_SECTION = { signage: 'signage', print: 'print', design: 'design', 'web-dev': 'web', 'liquid-wrapping': 'liquid-wrapping' };
function subPage(h, path) {
  const wrapM = h.match(/<div[^>]*class="category (page-service|page-products)\s*([a-z-]*)[^"]*"[^>]*>/);
  if (!wrapM) return h;
  // section: the template's colour class, else the menu section that lists (or contains) this page
  const here = path + '/';
  const bySection = menu.sections.find((x) => x.links.some(([, hh]) => hh === here)) || menu.sections.find((x) => here.startsWith(x.href));
  const cls = SUB_SECTION[wrapM[2]] || bySection?.class || 'signage';
  const sec = menu.sections.find((x) => x.class === cls) || menu.sections[0];
  const tel = menu.phone.replace(/\s/g, '');
  const banner = (h.match(/<section\b[^>]*class="category-banner banner[^"]*"[^>]*>[\s\S]*?<\/section>/) || [''])[0];
  if (!banner) return h;
  const crumbs = (banner.match(/<nav class="bdc"[\s\S]*?<\/nav>/) || [''])[0];
  const title = decode(((banner.match(/<h1 class="banner-title">([\s\S]*?)<\/h1>/) || [])[1] || '').replace(/<[^>]+>/g, '')).trim();
  let lead = decode(((banner.match(/<div class="banner-subtitle">([\s\S]*?)<\/div>/) || [])[1] || '').replace(/<[^>]+>/g, '')).trim();
  if (!lead) lead = decode(((h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '')).trim();
  let heroImg = (banner.match(/<div class="banner-image[^"]*">\s*(<img[^>]*>)/) || [])[1] || '';
  heroImg = heroImg.replace(/\ssizes="[^"]*"/, ' sizes="(max-width: 1000px) 100vw, 560px"').replace(/\sstyle="[^"]*"/, '').replace(/\stitle="[^"]*"/, '');
  const hero = `<section class="bdhub-hero"><div class="wrap">
<div class="bdhub-hero-text">${crumbs}
<span class="bdhub-eyebrow">${esc(sec.title)}</span>
<h1>${esc(title)}</h1>
${lead ? `<p class="bdhub-lead">${esc(lead)}</p>` : ''}
<div class="bdhub-cta"><a class="bdhub-btn bdhub-btn--solid" href="/get-a-quote/?service=${cls}">Get a free quote</a><a class="bdhub-btn bdhub-btn--ghost" href="tel:${tel}">Call ${esc(menu.phone)}</a></div></div>
${heroImg ? `<figure class="bdhub-hero-img">${heroImg}</figure>` : ''}
</div></section>`;
  let out = h.replace(banner, hero);
  // "find out more" blocks → tiles
  out = out.replace(/<section\b[^>]*class="container section-padding\s+section-two row"[^>]*>[\s\S]*?<\/section>/, (block) => {
    const items = [...block.matchAll(/<div class='row acf-repeater'>[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<h2>([\s\S]*?)<\/h2>\s*(?:<p>([\s\S]*?)<\/p>)?[\s\S]*?<a class="find-out-more-btn" href="([^"]+)"/g)]
      .map((m) => ({ img: m[1], title: decode(m[2].replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').replace(/\.\s*$/, '').trim(), desc: decode((m[3] || '').replace(/<[^>]+>/g, '')).trim() || cardDesc(m[4]), href: m[4] }))
      .map((c) => { const fix = (extra.tileLinks || {})[c.title]; return fix ? { ...c, href: fix } : c; });
    if (!items.length) return block;
    return `<section class="bdhub-services"><div class="wrap"><div class="bdhub-head"><h2>Explore ${esc(title.replace(/\.\s*$/, '').toLowerCase())}.</h2></div>
<div class="bdhub-tiles n${items.length}">${items.map((c) => `<a class="bdhub-tile" href="${c.href}"><img src="${c.img}" alt="" loading="lazy"><span class="bdhub-tile-in"><span class="bdhub-tile-title">${esc(c.title)}</span>${c.desc ? `<span class="bdhub-tile-desc">${esc(c.desc)}</span>` : ''}<span class="bdhub-tile-go">View service <i aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 12h15M13 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></i></span></span></a>`).join('')}</div></div></section>`;
  });
  // inspiration gallery → grid
  out = out.replace(/<section\b[^>]*class="container section-padding\s+section-three row"[^>]*>[\s\S]*?<\/section>/, (block) => {
    const pageWord = title.replace(/\.\s*$/, '').trim();
    const gTitle = pageWord ? `${pageWord.charAt(0).toUpperCase()}${pageWord.slice(1).toLowerCase()} we've produced.` : 'Inspiration.';
    const imgs = [...block.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    if (!imgs.length) return '';
    const big = (tag) => { const ss = (tag.match(/srcset="([^"]*)"/) || [])[1] || ''; const c = ss.split(',').map((x) => x.trim().split(/\s+/)).filter((x) => x[1]).sort((a, b) => parseInt(b[1]) - parseInt(a[1])); const fit = c.find((x) => parseInt(x[1]) <= 1600); return (fit || c[c.length - 1] || [(tag.match(/src="([^"]+)"/) || [])[1]])[0]; };
    const cells = imgs.map((tag, i) => {
      const t = tag.replace(/\ssizes="[^"]*"/, ' sizes="(max-width: 600px) 50vw, (max-width: 1000px) 33vw, 380px"').replace(/\sstyle="[^"]*"/, '').replace(/\sdecoding="[^"]*"/, '').replace(/<img\b/, '<img loading="lazy" decoding="async"');
      const alt = (tag.match(/alt="([^"]*)"/) || [])[1] || '';
      return `<a class="bdsub-ph${i >= 9 ? ' bdsub-more' : ''}" href="${big(tag)}" data-bd-zoom aria-label="${alt ? esc(decode(alt)) + ' — ' : ''}enlarge photo">${t}</a>`;
    }).join('');
    return `<section class="bdsub-gallery-sec"><div class="wrap"><div class="bdhub-head"><h2>${esc(gTitle)}</h2></div>
<div class="bdsub-gallery${imgs.length < 3 ? ` bdsub-gallery--n${imgs.length}` : ''}" data-open="false">${cells}</div>
${imgs.length > 9 ? `<button type="button" class="bdsub-showall" onclick="this.previousElementSibling.dataset.open='true';this.remove()">Show all ${imgs.length} photos</button>` : ''}
</div></section>`;
  });
  // intro: text beside a photo from the page's own gallery (not the hero photo)
  if (!['/contact-us', '/get-a-quote'].includes(path)) {
    const heroSrc = (heroImg.match(/\ssrc="([^"]+)"/) || [])[1] || '';
    const gal = [...out.matchAll(/<a class="bdsub-ph[^"]*"[^>]*>(<img\b[^>]*>)/g)].map((m) => m[1]).filter((t) => !heroSrc || !t.includes(heroSrc));
    const pic = gal[1] || gal[0] || '';
    out = out.replace(/<section\b[^>]*class="container section-padding\s+section-one row no-gutters[^"]*"[^>]*>\s*<div class="section-one-content[^"]*">([\s\S]*?)<\/div>\s*<\/section>/, (m, inner) => {
      if (!inner.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').trim()) return '<section class="bdsub-intro bdsub-intro--empty"><div class="wrap"><div class="bdsub-intro-text"></div></div></section><!--bdsub-intro-end-->';
      const img = pic ? pic.replace(/\ssizes="[^"]*"/, ' sizes="(min-width: 1001px) 520px, 100vw"').replace(/\sclass="[^"]*"/, '') : '';
      return `<section class="bdsub-intro${img ? '' : ' bdsub-intro--solo'}"><div class="wrap"><div class="bdsub-intro-text section-one-content">${inner}</div>${img ? `<figure class="bdsub-intro-img">${img}</figure>` : ''}</div></section><!--bdsub-intro-end-->`;
    });
  }
  // closing band before the page wrapper ends (= before the footer)
  out = out.replace(/(<\/div>\s*)(<footer\b)/, `<section class="bdhub-band"><div class="wrap"><div><h2>Ready to talk about your project?</h2><p>Tell us what you need and we'll come back to you, usually the same working day.</p></div>
<div class="bdhub-cta"><a class="bdhub-btn bdhub-btn--solid" href="/get-a-quote/?service=${cls}">Get a free quote</a><a class="bdhub-btn bdhub-btn--ghost" href="tel:${tel}">Call ${esc(menu.phone)}</a></div></div></section>
$1$2`);
  // "show more" (WordPress expand block) → the extra paragraphs, then one button underneath that toggles them
  out = out.replace(/<div class="wp-block-ub-expand[\s\S]*?<div class="ub-expand-portion ub-expand-full[^"]*"[^>]*>([\s\S]*?)<a [^>]*ub-expand-toggle-button[^>]*>[\s\S]*?<\/a>\s*<\/div>\s*<\/div>/, (m, full) => {
    const before = ((m.match(/ub-expand-partial[^>]*>([\s\S]*?)<a [^>]*ub-expand-toggle-button/) || [])[1] || '').replace(/<\/?div[^>]*>/g, '').trim();
    const more = full.replace(/<\/?div[^>]*>/g, '').trim();
    if (!more) return before;
    return `${before}<div class="bdsub-more" hidden>${more}</div><button type="button" class="bdsub-morebtn" aria-expanded="false" onclick="var m=this.previousElementSibling,o=m.hidden;m.hidden=!o;this.setAttribute('aria-expanded',o);this.textContent=o?'Read less':'Read more'">Read more</button>`;
  });
  // "Visit the shop" bar → a banner with a product picture (or a quote banner where there's no shop)
  out = out.replace(/<section class="shop">[\s\S]*?<\/section>/, (m) => {
    const href = (m.match(/href="([^"]+)"/) || [])[1] || '';
    // a real photo from this page's gallery (not the ones used in the intro)
    const galSrcs = [...out.matchAll(/<a class="bdsub-ph[^"]*"[^>]*>\s*<img\b[^>]*\ssrc="([^"]+)"/g)].map((x) => x[1]);
    const photo = galSrcs[7] || galSrcs[3] || galSrcs[2] || galSrcs[0] || '';
    const prodImg = () => photo;
    let b;
    if (/liquid-wrapping/.test(href)) b = { eyebrow: 'Online shop', h: 'Shop Full Dip spray wrap.', p: 'Spray wrap colours, primers and glossifier for your own projects, ready to order online.', href: '/category/liquid-wrapping/shop/', btn: 'Shop spray wrap', img: photo };
    else if (cls === 'signage' || /signage/.test(href) || /vehicle|livery|car-graphics|race-car/.test(path)) b = { eyebrow: 'Online shop', h: 'Buy van graphics online.', p: 'Fitted or supply-only packages for small, medium and large vans, from £95 + VAT.', href: '/category/signage/vehicle-graphics/', btn: 'Shop van graphics', img: photo };
    else b = { eyebrow: 'Not sure what you need?', h: 'Tell us about your project.', p: "We'll suggest the right option and send a clear price, usually the same working day.", href: `/get-a-quote/?service=${cls}`, btn: 'Get a free quote', img: photo };
    return `<section class="bdshop"><div class="wrap"><div class="bdshop-in${b.img ? '' : ' bdshop-in--text'}"><div class="bdshop-text"><span class="bdshop-eyebrow">${esc(b.eyebrow)}</span><h2>${esc(b.h)}</h2><p>${esc(b.p)}</p><a class="bdhub-btn bdshop-btn" href="${b.href}">${esc(b.btn)} →</a></div>${b.img ? `<figure class="bdshop-img"><img src="${esc(b.img)}" alt="" loading="lazy" width="1200" height="900" sizes="(min-width: 901px) 480px, 100vw"></figure>` : ''}</div></div></section>`;
  });
  out = vehicleExtras(out, path, title);
  // categories ("Explore …" tiles) straight after the intro, not halfway down the page
  {
    const tiles = (out.match(/<section class="bdhub-services">[\s\S]*?<\/section>/) || [''])[0];
    if (tiles && out.includes('<!--bdsub-intro-end-->')) out = out.replace(tiles, '').replace('<!--bdsub-intro-end-->', tiles);
    out = out.replace('<!--bdsub-intro-end-->', '');
  }
  out = out.replace(wrapM[0], wrapM[0].replace(/class="category /, `class="bdhub bdsub ${cls} category `));
  // gallery zoom: a native <dialog>
  return out.replace(/<\/body>/i, `<script>document.addEventListener('click',function(e){var a=e.target.closest('[data-bd-zoom]');if(!a)return;e.preventDefault();var d=document.getElementById('bd-zoom');if(!d){d=document.createElement('dialog');d.id='bd-zoom';d.innerHTML='<button type="button" aria-label="Close">×</button><img alt="">';d.addEventListener('click',function(){d.close()});document.body.appendChild(d)}var im=a.querySelector('img');d.querySelector('img').src=a.href;d.querySelector('img').alt=im?im.alt:'';d.showModal()});</script>\n</body>`);
}

// Small line icons for the "what we do" cards, picked from the card's title
function incIcon(t) {
  const k = String(t).toLowerCase();
  const p = /letter|vinyl|cut/.test(k) ? '<path d="M4 20h16M7 16l5-12 5 12M9 12h6"/>'
    : /print|panel|photo/.test(k) ? '<rect x="5" y="3" width="14" height="7" rx="1"/><path d="M5 17H3v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5h-2"/><rect x="7" y="14" width="10" height="7" rx="1"/>'
    : /wrap|colour|full|part/.test(k) ? '<path d="M3 16v-4l2-5h10l4 5h2v4h-2"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M9.5 17h5"/>'
    : /chapter|reflect|chevron|safety/.test(k) ? '<path d="M4 18l5-6-5-6M11 18l5-6-5-6M18 18l2-3"/>'
    : /fleet|livery|consistent/.test(k) ? '<rect x="2" y="8" width="9" height="7" rx="1"/><rect x="13" y="8" width="9" height="7" rx="1"/><circle cx="5" cy="17" r="1.5"/><circle cx="16" cy="17" r="1.5"/>'
    : /design|brand|logo/.test(k) ? '<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.5-.8z"/>'
    : '<circle cx="12" cy="12" r="8"/><path d="M8.5 12l2.5 2.5 4.5-5"/>';
  return `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}

// Vehicle pages (content/vehicle.json): what's included, prices, links to the CRM guides/sectors/locations hubs,
// how it works and FAQs, with Service and FAQPage schema.
function vehicleExtras(h, path, title) {
  const v = VEH.pages[path];
  if (!v) return h;
  const tel = menu.phone.replace(/\s/g, '');
  const included = v.included ? `<section class="bdv-inc"><div class="wrap"><div class="bdhub-head"><h2>${esc(v.includedTitle || 'What we do.')}</h2></div>
<ul class="bdv-cards">${v.included.map(([a, b]) => `<li><span class="bdv-ico" aria-hidden="true">${incIcon(a)}</span><h3>${esc(a)}</h3><p>${esc(b)}</p></li>`).join('')}</ul></div></section>` : '';
  const pk = [
    ['Basic', '149', 'Single-colour cut vinyl: company name on the bonnet, both sides and the rear, with your web address and phone number on the lower side panels and rear doors.'],
    ['Standard', '210', 'Everything in Basic plus social media details, a second vinyl colour or panel infill, and a cut or printed logo (subject to complexity and hi-res files).'],
    ['Pro', '455', 'Everything in Basic and Standard plus design options beyond the regular layout (up to 3 ideas) and a large logo or graphic on the rear quarters and rear.'],
  ];
  const prices = v.prices ? `<section class="bdv-prices"><div class="wrap"><div class="bdhub-head"><h2>Van graphics prices.</h2><a class="bdhub-textlink" href="/category/signage/vehicle-graphics/">Shop van graphics online →</a></div>
<div class="bdv-pk">${pk.map(([n, p, t], i) => `<div class="bdv-p${i === 1 ? ' bdv-p--mid' : ''}"><h3>${n}</h3><p class="bdv-price"><small>from</small> £${p} <small>+ VAT</small></p><p>${esc(t)}</p><a class="bdhub-btn bdhub-btn--solid" href="/get-a-quote/?service=signage">Get a quote</a></div>`).join('')}</div>
<p class="bdv-note">Supply and fit within 30 miles of our Norwich workshop. Prices are "from" for a typical van; your quote confirms the price for your vehicle and design. Supply-only graphics for self-fitting are in the <a href="/category/signage/vehicle-graphics/">online shop</a>.</p></div></section>` : '';
  const hubs = v.hubLinks ? `<section class="bdv-hubs"><div class="wrap"><div class="bdhub-head"><h2>Guides, trades &amp; areas.</h2></div>
<div class="bdv-hubgrid">${[['/vehicle-graphics/guides-and-advice/', 'Guides & advice', 'Costs, how long wraps last, Chapter 8 chevrons, lease vans and choosing the right vinyl.'], ['/vehicle-graphics/sectors/', 'By trade & sector', 'What works for trades, fleets, food vans, taxis and highways and utilities vehicles.'], ['/vehicle-graphics/locations/', 'Across Norfolk & Suffolk', 'Vehicle graphics for Norwich, Great Yarmouth, Lowestoft and King’s Lynn.']].map(([href, t, d]) => `<a href="${href}"><h3>${esc(t)}</h3><p>${esc(d)}</p><span>Explore →</span></a>`).join('')}</div></div></section>` : '';
  const steps = `<section class="bdhub-steps"><div class="wrap"><div class="bdhub-head"><h2>How it works.</h2></div><ol>${VEH.steps.map(([a, b]) => `<li><h3>${esc(a)}</h3><p>${esc(b)}</p></li>`).join('')}</ol></div></section>`;
  const faqs = v.faqs?.length ? `<section class="bdhub-faq"><div class="wrap"><h2>Questions.</h2><div class="bdhub-faqs">${v.faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></div></section>` : '';
  const ld = [{ '@context': 'https://schema.org', '@type': 'Service', name: v.service || title, serviceType: v.service || title, url: ORIGIN + path + '/',
    provider: { '@type': 'LocalBusiness', name: 'Broadland Digital', telephone: '+44 1603 407786', url: ORIGIN + '/', address: { '@type': 'PostalAddress', streetAddress: 'Vulcan House, Vulcan Road North', addressLocality: 'Norwich', postalCode: 'NR6 6AQ', addressCountry: 'GB' } },
    areaServed: ['Norwich', 'Norfolk', 'Suffolk'],
    ...(v.prices ? { offers: pk.map(([n, p]) => ({ '@type': 'Offer', name: n + ' van graphics', price: p, priceCurrency: 'GBP', priceSpecification: { '@type': 'PriceSpecification', price: p, priceCurrency: 'GBP', valueAddedTaxIncluded: false } })) } : {}) }];
  if (v.faqs?.length) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: v.faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  let out = h;
  // after the intro text
  out = out.includes('<!--bdsub-intro-end-->') ? out.replace('<!--bdsub-intro-end-->', '<!--bdsub-intro-end-->' + included) : out.replace(/(<section\b[^>]*class="container section-padding\s+section-one[^"]*"[^>]*>[\s\S]*?<\/section>)/, (m) => m + included);
  // before the gallery (or the closing band): prices, hubs, steps; FAQs just before the closing band
  const mid = prices + hubs + steps;
  out = /<section class="bdsub-gallery-sec">/.test(out) ? out.replace('<section class="bdsub-gallery-sec">', mid + '<section class="bdsub-gallery-sec">') : out.replace('<section class="bdhub-band">', mid + '<section class="bdhub-band">');
  out = out.replace('<section class="bdhub-band">', faqs + '<section class="bdhub-band">');
  return out.replace(/<\/head>/i, ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('\n') + '\n</head>');
}

// Contact us (/contact-us): name, address and phone (NAP) with opening hours, a map, how to find us, directions in
// Google Maps / Apple Maps / Waze, the enquiry form, and LocalBusiness + ContactPage schema. The footer's own form is
// left out on this page (the page has it).
const NAP = { name: 'Broadland Digital', street: 'Vulcan House, Vulcan Road North', town: 'Norwich', county: 'Norfolk', postcode: 'NR6 6AQ',
  hours: 'Monday–Friday, 8:30am–5pm' };
// The online shop: the old WordPress homepage copy replaced with a shop page (hero, categories, product grids).
// The product grids are filled in with the shop category grids (<!--bdshop-grid:…-->).
function shopPage(h) {
  const start = h.indexOf('<div class="homepage">');
  const end = h.indexOf('<footer', start);
  if (start < 0 || end < 0) return h;
  const tel = menu.phone.replace(/\s/g, '');
  const img = (src) => OPT[src] || src;
  const prodImg = (re) => img((wp.products.find((p) => re.test(p.path)) || {}).image?.src || '');
  const tiles = [
    ['/category/signage/vehicle-graphics/', 'Van graphics packages', 'Basic, Standard, Pro and wrap packages for small, medium and large vans, fitted or as supply-only kits.', img('/wp-content/uploads/2023/03/Van-Graphics-Category.png')],
    ['/category/liquid-wrapping/', 'Liquid wrapping packages', 'Budget, Standard, Premium and Ultra liquid wrap colour changes, priced by vehicle size.', img('/wp-content/uploads/2024/04/category-fimage-liquid-wrap.png')],
    ['/category/liquid-wrapping/shop/', 'Full Dip spray wrap', 'Spray wrap colours, primers and glossifier for your own projects.', prodImg(/full-dip-cherry-red/)],
  ];
  const section = (id, title, desc, cats, more) => `<section class="bdshop-sec" id="${id}"><div class="wrap"><div class="bdhub-head"><h2>${esc(title)}</h2>${more ? `<a class="bdhub-textlink" href="${more[0]}">${esc(more[1])} →</a>` : ''}</div>${desc ? `<p class="bdshop-sec-desc">${esc(desc)}</p>` : ''}<!--bdshop-grid:${cats}--></div></section>`;
  const body = `<div class="bdhub signage bdshop-page">
<section class="bdhub-hero"><div class="wrap"><div class="bdhub-hero-text"><nav class="bdc" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><span aria-current="page">Shop</span></li></ol></nav>
<span class="bdhub-eyebrow">Online shop</span>
<h1>Van graphics and spray wrap, online.</h1>
<p class="bdhub-lead">Order van graphics packages, liquid wrapping and Full Dip spray wrap online from our Norwich workshop, or ask us for a quote on anything made to measure.</p>
<div class="bdhub-cta"><a class="bdhub-btn bdhub-btn--solid" href="#van-graphics">Shop van graphics</a><a class="bdhub-btn bdhub-btn--ghost" href="tel:${tel}">Call ${esc(menu.phone)}</a></div></div>
<figure class="bdhub-hero-img"><img src="${esc(prodImg(/basic-small-van-graphics$/))}" alt="Van graphics package from the Broadland Digital shop" width="1200" height="900" fetchpriority="high"></figure>
</div></section>
<section class="bdhub-intro"><div class="wrap"><h2>How the shop works.</h2><div class="bdhub-text"><p>Each package has a fixed starting price for a typical vehicle of that size. Choose the package, add your details and we will confirm the layout, artwork and price for your vehicle before anything is made.</p><p>Fitted packages are applied at our Norwich workshop. Supply-only kits are for fitting yourself, and Full Dip spray wrap is for your own projects.</p></div></div></section>
<section class="bdhub-services"><div class="wrap"><div class="bdhub-head"><h2>Shop by category.</h2><a class="bdhub-textlink" href="/get-a-quote/">Need something made to measure? Ask us →</a></div>
<div class="bdhub-tiles n3">${tiles.map(([href, t, d, src]) => `<a class="bdhub-tile" href="${href}"><img src="${esc(src)}" alt="${esc(t)}" loading="lazy" width="800" height="600"><span class="bdhub-tile-in"><span class="bdhub-tile-title">${esc(t)}</span><span class="bdhub-tile-desc">${esc(d)}</span><span class="bdhub-tile-go">Shop now <i aria-hidden="true">${BIG_ARROW}</i></span></span></a>`).join('')}</div></div></section>
${section('van-graphics', 'Fitted van graphics.', 'Designed by us and fitted at our Norwich workshop.', 'vehicle graphics+fitted', ['/category/signage/vehicle-graphics/', 'All van graphics'])}
${section('van-kits', 'Supply-only van graphics kits.', 'The same packages, supplied for you to fit yourself.', 'vehicle graphics+supply only')}
${section('liquid-wrapping', 'Liquid wrapping packages.', 'Colour changes applied at our workshop, priced by vehicle size.', 'liquid wrapping+!shop', ['/liquid-wrapping-home/', 'About liquid wrapping'])}
${section('spray-wrap', 'Full Dip spray wrap.', 'Colours, primers and glossifier for your own projects.', 'shop', ['/category/liquid-wrapping/shop/', 'All spray wrap'])}
<section class="bdhub-band"><div class="wrap"><div><h2>Can't see what you need?</h2><p>Most of our work is made to order. Send sizes, photos and a deadline and we'll price it.</p></div>
<div class="bdhub-cta"><a class="bdhub-btn bdhub-btn--solid" href="/get-a-quote/">Get a free quote</a><a class="bdhub-btn bdhub-btn--ghost" href="tel:${tel}">Call ${esc(menu.phone)}</a></div></div></section>
</div>
`;
  return h.slice(0, start) + body + h.slice(end);
}

function contactPage(h) {
  const tel = menu.phone.replace(/\s/g, '');
  const full = `${NAP.name}, ${NAP.street}, ${NAP.town}, ${NAP.postcode}`;
  const q = encodeURIComponent(full);
  const field = (name, label, attrs, wide, hint = '') => `<div class="bdf-field${wide ? ' wide' : ''}"><label for="bdk-${name}">${label}${hint ? ` <small>${hint}</small>` : ''}</label>`
    + (name === 'message' ? `<textarea id="bdk-${name}" name="${name}" ${attrs} aria-describedby="bdk-${name}-err"></textarea>` : `<input id="bdk-${name}" name="${name}" ${attrs} aria-describedby="bdk-${name}-err">`)
    + `<span class="bdf-err" id="bdk-${name}-err" aria-live="polite"></span></div>`;
  const body = `<section class="bdk"><div class="wrap">
<div class="bdk-grid">
<div class="bdk-card bdk-nap" itemscope itemtype="https://schema.org/LocalBusiness">
<h2>Get in touch.</h2>
<p class="bdk-name" itemprop="name">${NAP.name}</p>
<address itemprop="address" itemscope itemtype="https://schema.org/PostalAddress"><span itemprop="streetAddress">${NAP.street}</span><br><span itemprop="addressLocality">${NAP.town}</span>, <span itemprop="addressRegion">${NAP.county}</span><br><span itemprop="postalCode">${NAP.postcode}</span></address>
<ul class="bdk-lines">
<li>${ICON.phone}<a href="tel:${tel}" itemprop="telephone">${esc(menu.phone)}</a></li>
<li>${ICON.mail}<a href="mailto:${menu.email}" itemprop="email">${esc(menu.email)}</a></li>
<li><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span><meta itemprop="openingHours" content="Mo-Fr 08:30-17:00">${NAP.hours}</span></li>
</ul>
<div class="bdk-actions"><a class="bdk-btn bdk-btn--solid" href="tel:${tel}">Call us</a><a class="bdk-btn" href="mailto:${menu.email}">Email us</a><a class="bdk-btn" href="/get-a-quote/">Get a quote</a></div>
</div>
<div class="bdk-map"><iframe title="Map: ${esc(full)}" src="https://www.google.com/maps?q=${q}&amp;output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>
</div>
<div class="bdk-grid bdk-grid--2">
<div class="bdk-card"><h2>How to find us.</h2>
<p>Our offices and workshop are at Vulcan House on Vulcan Road North, on the airport side of Norwich. From the city, head towards the north Norwich ring road and Vulcan Road North, and set your sat nav to <strong>${NAP.postcode}</strong> or "Vulcan House" rather than a city-centre address.</p>
<p>We're open ${NAP.hours}. If you'd like to see samples, talk through artwork or collect an order, give us a call first so the right person is here. Bring photos, rough sizes and any logo or brand files you have.</p>
<p>Collecting a large panel, or need step-free access? Call ahead and we'll sort out where to park and how to get it to your vehicle.</p>
</div>
<div class="bdk-card"><h2>Directions.</h2>
<p>Open turn-by-turn directions from where you are now:</p>
<div class="bdk-dir">
<a href="https://www.google.com/maps/dir/?api=1&amp;destination=${q}" target="_blank" rel="noopener"><b>Google Maps</b><span>Directions by car, public transport, bike or on foot</span></a>
<a href="https://maps.apple.com/?daddr=${q}" target="_blank" rel="noopener"><b>Apple Maps</b><span>For iPhone, iPad and Mac</span></a>
<a href="https://waze.com/ul?q=${encodeURIComponent(NAP.street + ', ' + NAP.town + ' ' + NAP.postcode)}&amp;navigate=yes" target="_blank" rel="noopener"><b>Waze</b><span>Live traffic and route</span></a>
</div>
<p class="bdk-small">Sat nav postcode: <strong>${NAP.postcode}</strong></p>
</div>
</div>
<div class="bdk-card bdk-formcard bdf-wrap" id="enquiry">
<h2>Send us a message.</h2>
<p>Tell us what you need and we'll come back to you, usually the same working day. For a priced quote, use the <a href="/get-a-quote/">quote form</a>.</p>
<form class="bdf-form" data-bd-form="contact" novalidate aria-label="Contact form">
${field('name', 'Name', 'type="text" autocomplete="name" required maxlength="120"')}
${field('phone', 'Phone', 'type="tel" inputmode="tel" autocomplete="tel" required maxlength="40" placeholder="e.g. 07700 900123"')}
${field('email', 'Email', 'type="email" inputmode="email" autocomplete="email" required maxlength="254" placeholder="name@company.co.uk"', true)}
${field('message', 'How can we help?', 'rows="5" maxlength="6000"', true, '(optional)')}
<div class="bdf-hp" aria-hidden="true"><label for="bdk-website">Leave this empty</label><input id="bdk-website" name="website" tabindex="-1" autocomplete="off"></div>
<div class="bdf-summary" role="alert"></div>
<div class="bdf-actions"><button class="bdf-send" type="submit"><span class="bdf-spin" aria-hidden="true"></span><span class="bdf-label">Send message</span></button>
<p class="bdf-note">We'll only use your details to reply to you. See our <a href="/privacy-policy/">privacy policy</a>.</p></div>
</form>
<div class="bdf-done" role="status"><h3>Thank you<span class="bdf-done-name"></span>.</h3><p>We've received your message and will be in touch shortly. If it's urgent, call us on <a href="tel:${tel}">${esc(menu.phone)}</a>.</p><button type="button" class="bdf-again">Send another message</button></div>
</div>
</div></section>`;
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'ContactPage', '@id': ORIGIN + '/contact-us/#contact', url: ORIGIN + '/contact-us/', name: 'Contact Broadland Digital', about: { '@id': ORIGIN + '/#business' } },
    { '@type': 'LocalBusiness', '@id': ORIGIN + '/#business', name: NAP.name, url: ORIGIN + '/', telephone: '+44 1603 407786', email: menu.email,
      logo: ORIGIN + '/wp-content/uploads/2023/03/Broadland_Digital_Logo.svg', image: ORIGIN + '/wp-content/uploads/2023/03/Broadland_Digital_Logo.svg',
      address: { '@type': 'PostalAddress', streetAddress: NAP.street, addressLocality: NAP.town, addressRegion: NAP.county, postalCode: NAP.postcode, addressCountry: 'GB' },
      hasMap: 'https://www.google.com/maps?q=' + q,
      openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '08:30', closes: '17:00' }],
      contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer service', telephone: '+44 1603 407786', email: menu.email, areaServed: 'GB', availableLanguage: 'en' }],
      areaServed: ['Norwich', 'Norfolk', 'Suffolk'], sameAs: (menu.footer.social || []).map(([, u]) => u) } ] };
  return h.replace(/<span class="bdhub-eyebrow">[^<]*<\/span>/, '<span class="bdhub-eyebrow">Contact</span>')
    .replace(/<p class="bdhub-lead">[\s\S]*?<\/p>/, '<p class="bdhub-lead">Call, email or visit our Norwich offices and workshop. We usually reply the same working day.</p>')
    .replace(/<div class="bdhub-cta">[\s\S]*?<\/div><\/div>/, `<div class="bdhub-cta"><a class="bdhub-btn bdhub-btn--solid" href="tel:${tel}">Call ${esc(menu.phone)}</a><a class="bdhub-btn bdhub-btn--ghost" href="#enquiry">Send a message</a></div></div>`)
    .replace(/<section\b[^>]*class="container section-padding\s+section-one[^"]*"[^>]*>[\s\S]*?<\/section>/, body)
    .replace(/<section class="bdhub-band">[\s\S]*?<\/section>/, '')
    .replace(/<\/head>/i, `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n</head>`);
}

function megaMenu(path) {
  const here = path === '/' ? '/' : path + '/';
  const inSection = (sec) => here === sec.href || here.startsWith(sec.href) || sec.links.some(([, h]) => h === here);
  const cur = (h) => (h === here ? ' aria-current="page"' : '');
  const cols = menu.sections.map((sec) => `<details class="bdm-col ${sec.class}"${inSection(sec) ? ' data-current' : ''} open>
<summary><a class="bdm-title" href="${sec.href}"${cur(sec.href)}>${esc(sec.title)}.</a></summary>
<ul>${sec.links.map(([l, h]) => `<li><a class="bdm-link" href="${h}"${cur(h)}>${esc(l)}</a></li>`).join('')}</ul>
</details>`).join('\n');
  return { button: `<button class="bdm-btn" type="button" aria-expanded="false" aria-controls="bdm" aria-label="Open menu"><span></span><span></span><span></span></button>
<span class="nav-container" hidden><input type="checkbox" tabindex="-1" aria-hidden="true"></span>`,
  // The panel sits outside the header: the sticky header would otherwise clip a fixed panel inside it.
  panel: `<div class="bdm" id="bdm" role="dialog" aria-modal="true" aria-label="Menu" aria-hidden="true" inert>
<div class="bdm-inner"><div class="bdm-grid">
${cols}
</div>
<div class="bdm-foot"><nav class="bdm-more" aria-label="More">${menu.more.map(([l, h]) => `<a href="${h}"${cur(h)}>${esc(l)}</a>`).join('')}</nav>
<p class="bdm-contact"><a href="tel:${menu.phone.replace(/\s/g, '')}">${esc(menu.phone)}</a> · <a href="mailto:${menu.email}">${esc(menu.email)}</a><br>${esc(menu.address)}</p></div>
</div></div>` };
}
const CONSENT_V = hash(consentJs);

// ---------- Shell for CRM pages and the blog ----------
function shell() {
  const src = captured.get(crmPages.includes('/signage-home/signage-norwich') ? '/signage-home/signage-norwich' : crmPages[0]) || captured.get('/privacy-policy');
  let h = transform(src, '/_crm-page');
  const start = h.search(/<main\b[^>]*>/i);
  const end = h.lastIndexOf('</main>');
  const open = h.slice(start).match(/<main\b[^>]*>/i)[0];
  h = h.slice(0, start) + open + '<div class="crm-main" data-crm-blog="slot"></div>' + h.slice(end);
  h = h.replace(/<style[^>]*id=["']crm-seo-pages-inline-css["'][^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<meta (name|property)="(description|og:[a-z:_]+|twitter:[a-z:_]+|article:[a-z:_]+)"[^>]*>\s*/gi, '')
    .replace(/<meta name="robots"[^>]*>/i, '')
    .replace(/<title>[\s\S]*?<\/title>/i, '<title>Broadland Digital</title>')
    .replace(/<\/head>/i, '<!--crm:head-->\n</head>');
  if (!/rel="canonical"/.test(h)) h = h.replace('<!--crm:head-->', `<link rel="canonical" href="${ORIGIN}/">\n<!--crm:head-->`);
  return h;
}

function page404(sh) {
  return sh.replace('<!--crm:head-->', '<meta name="robots" content="noindex">')
    .replace('<title>Broadland Digital</title>', '<title>Page not found - Broadland Digital</title>')
    .replace('<div class="crm-main" data-crm-blog="slot"></div>', `<section class="container standard-padding" style="padding-top:120px;padding-bottom:120px"><h1 class="site-font">Page not found.</h1><p>The page you were looking for has moved or no longer exists.</p><p><a href="/">Home</a> · <a href="/signage-home">Signage</a> · <a href="/print-home">Print</a> · <a href="/design-home">Design</a> · <a href="/web-dev-home">Web Dev</a> · <a href="/contact-us">Contact us</a></p></section>`);
}

// ---------- Write ----------
rmSync(OUT, { recursive: true, force: true });
// HTML pages: every script opts out of Cloudflare Rocket Loader (on for the zone while WordPress ran there), which
// would otherwise rewrite them once the domain points at this worker.
const write = (rel, data) => {
  const f = join(OUT, rel); mkdirSync(dirname(f), { recursive: true });
  if (typeof data === 'string' && rel.endsWith('.html')) data = data.replace(/<script\b(?![^>]*data-cfasync)/g, '<script data-cfasync="false"');
  writeFileSync(f, data);
};
const built = new Map([...staticPaths].map((p) => [p, transform(captured.get(p), p)]));
const IMG_SIZES = existsSync(join(ROOT, 'content/img-sizes.json')) ? JSON.parse(readFileSync(join(ROOT, 'content/img-sizes.json'), 'utf8')) : {};
// Shop category pages: the WordPress theme left them as empty headings ("Fitted", "Supply Only"); list the products.
{
  const low = (x) => String(x || '').replace(/\.\s*$/, '').trim().toLowerCase();
  const prods = wp.products.filter((p) => built.has(p.path)).map((p) => {
    const h = built.get(p.path);
    const prices = [...h.slice(0, h.indexOf('</head>')).matchAll(/"(?:price|lowPrice)"\s*:\s*"?(\d+(?:\.\d+)?)/g)].map((m) => +m[1]).filter((x) => x > 0);
    const price = p.price > 0 ? p.price : prices.length ? Math.min(...prices) : 0;
    return { path: p.path, title: p.title, cats: p.categories.map(low), img: OPT[p.image?.src] || p.image?.src || '', price, summary: p.summary || '' };
  });
  const card = (p) => {
    const sz = IMG_SIZES[p.img] || [800, 600];
    return `<a class="bdp-card" href="${p.path}/">${p.img ? `<span class="bdp-img"><img src="${esc(p.img)}" alt="${esc(p.title)}" width="${sz[0]}" height="${sz[1]}" loading="lazy" decoding="async"></span>` : ''}<span class="bdp-body"><span class="bdp-title">${esc(p.title)}</span>${p.summary ? `<span class="bdp-sum">${esc(p.summary)}</span>` : ''}<span class="bdp-price">${p.price ? `From £${String(p.price).replace(/\.0+$/, '')}` : 'See options and prices'}</span></span></a>`;
  };
  const grid = (list) => `<div class="bdp-grid">${list.map(card).join('')}</div>`;
  if (built.has('/shop')) built.set('/shop', built.get('/shop').replace(/<!--bdshop-grid:([^>]*?)-->/g, (m, spec) => {
    const need = spec.split('+');
    const list = prods.filter((p) => need.every((n) => (n.startsWith('!') ? !p.cats.includes(n.slice(1)) : p.cats.includes(n))));
    return list.length ? grid(list) : '';
  }));
  for (const [path, h0] of built) {
    if (!path.startsWith('/category/') || /\/page\/\d+$/.test(path)) continue;
    const segs = path.split('/').slice(2);
    const names = segs.map((seg, i) => (seg === 'shop' ? 'shop' : low(pageName('/category/' + segs.slice(0, i + 1).join('/'))))).filter(Boolean);
    const mine = prods.filter((p) => names.every((n) => p.cats.includes(n)));
    if (!mine.length) continue;
    let h = h0, used = new Set();
    // parent categories: a grid under each child heading
    h = h.replace(/(<h2 class="section-two-title"[^>]*>\s*([^<]+?)\s*<\/h2>\s*<\/div>)/g, (m, all, child) => {
      const list = mine.filter((p) => p.cats.includes(low(child)));
      if (!list.length) return m;
      list.forEach((p) => used.add(p.path));
      return all + grid(list);
    });
    if (!used.size) {
      const block = `<section class="bdp-wrap"><div class="container">${grid(mine)}</div></section>`;
      const at = [/<section class="bdhub-band">/, /<footer\b/].map((r) => h.search(r)).find((i) => i >= 0);
      if (at != null) h = h.slice(0, at) + block + h.slice(at);
    }
    built.set(path, h);
  }
}

// Keyword copy blocks written per page (content/seo-sections/*.json): their keywords win over seo-keywords.json.
const SEO_SECTIONS = {};
for (const f of (existsSync(join(ROOT, 'content/seo-sections')) ? readdirSync(join(ROOT, 'content/seo-sections')) : []).filter((f) => f.endsWith('.json')).sort()) Object.assign(SEO_SECTIONS, JSON.parse(readFileSync(join(ROOT, 'content/seo-sections', f), 'utf8')));
const VIDEOS = existsSync(join(ROOT, 'content/videos.json')) ? JSON.parse(readFileSync(join(ROOT, 'content/videos.json'), 'utf8')) : {};
const SEO_KW = JSON.parse(readFileSync(join(ROOT, 'content/seo-keywords.json'), 'utf8'));
for (const [p, x] of Object.entries(SEO_SECTIONS)) if (x.primary) SEO_KW[p] = [x.primary, x.secondary || []];
writeFileSync(join(ROOT, 'worker/seo-sections.json'), JSON.stringify({ sections: SEO_SECTIONS, videos: VIDEOS }) + '\n');
const FINISHED = finishSeo(built, { trail, sizes: IMG_SIZES, faqs: JSON.parse(readFileSync(join(ROOT, 'content/faqs.json'), 'utf8')), keywords: SEO_KW, sections: SEO_SECTIONS, videos: VIDEOS });
for (const [p, h] of FINISHED) write(p === '/' ? 'index.html' : `${p.slice(1)}/index.html`, h);
// photo pools for the worker's CRM pages (keyword cards)
writeFileSync(join(ROOT, 'worker/seo-sections.json'), JSON.stringify({ sections: SEO_SECTIONS, videos: VIDEOS, pools: Object.fromEntries([...(FINISHED.pools || new Map())].map(([k, list]) => [k, list.map((t) => ({ src: (t.match(/\ssrc="([^"]+)"/) || [])[1], alt: decode((t.match(/\salt="([^"]*)"/) || [])[1] || '') })).filter((x) => x.src)])) }) + '\n');
const sh = shell();
write('_crm-page/index.html', pruneAssets(sh));
write('404.html', page404(sh));
write('_static/bd-forms.js', formsJs);
write('_static/bd-consent.js', consentJs);
write('_static/bd-menu.css', menuCss);
write('_static/bd-footer.css', footerCss);
write('_static/bd-pages.css', pagesCss);
write('_static/bd-menu.js', menuJs);

let assetsCopied = 0;
for (const f of walk(ASSETS)) { const rel = relative(ASSETS, f); mkdirSync(dirname(join(OUT, rel)), { recursive: true }); copyFileSync(f, join(OUT, rel)); assetsCopied++; }
let publicCopied = 0;
if (existsSync(join(ROOT, 'site/public'))) for (const f of walk(join(ROOT, 'site/public'))) { const rel = relative(join(ROOT, 'site/public'), f); mkdirSync(dirname(join(OUT, rel)), { recursive: true }); copyFileSync(f, join(OUT, rel)); publicCopied++; }

// Sitemap (the worker adds the CRM's pages and blog posts), robots.txt
const indexable = [...staticPaths].filter((p) => !/thank-you|quote-requested|\/page\/\d+$/.test(p) && !SEO_NOINDEX.test(p) && !/<meta name="robots" content="[^"]*noindex/.test(captured.get(p))).sort();
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map((p) => `<url><loc>${ORIGIN}${p === '/' ? '/' : p + '/'}</loc>${lastmod.get(p) ? `<lastmod>${lastmod.get(p).slice(0, 10)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /_crm-page/\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);

// Redirects: content/site.json, plus old links to "/x" where the page is "/x-2" (or moved under a parent).
const redirects = { ...extra.redirects };
for (const p of brokenLinks) {
  if (redirects[p]) continue;
  const last = p.split('/').pop();
  const cands = [p + '-2', p.replace(/-2$/, ''), ...[...staticPaths].filter((s) => s.split('/').pop() === last || s.split('/').pop() === last + '-2')].filter((c) => staticPaths.has(c));
  if (cands.length) redirects[p] = cands[0];
}
writeFileSync(join(ROOT, 'worker/redirects.json'), JSON.stringify(redirects, null, 1) + '\n');
writeFileSync(join(ROOT, 'worker/static-paths.json'), JSON.stringify([...staticPaths].sort()) + '\n');
// Styles: drop WordPress plugin styles a page doesn't use, then serve the rest as one file per combination
// (23 render-blocking requests → 1). The font stylesheet (Adobe Fonts) loads without blocking.
{
  const { createHash } = await import('node:crypto');
  const DIST = join(ROOT, 'dist');
  const bundles = new Map();
  const files = [];
  const walkHtml = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!/^(wp-content|wp-includes|opt|img|brands|_static)$/.test(f)) walkHtml(p); } else if (f === 'index.html' || f === '404.html') files.push(p); } };
  walkHtml(DIST);
  const readCss = (href) => {
    const clean = href.replace(/[?#].*$/, '');
    const fp = join(DIST, clean);
    if (!existsSync(fp)) return null;
    const dir = clean.replace(/[^/]*$/, '');
    return readFileSync(fp, 'utf8').replace(/url\(\s*(['"]?)(?!data:|https?:|\/\/|\/|#)([^'")]+)\1\s*\)/g, (m, q, u) => `url(${q}${new URL(u, 'https://x' + dir).pathname}${q})`)
      .replace(/\/\*# sourceMappingURL=[^*]*\*\//g, '');
  };
  // Bootstrap is 190 KB; the pages use a small part of it. Keep only rules whose classes appear in a page or a script.
  const used = new Set();
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/class=["']([^"']+)["']/g)) for (const c of m[1].split(/\s+/)) if (c) used.add(c);
  const jsWords = (d) => { if (!existsSync(d)) return; for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) jsWords(p); else if (f.endsWith('.js')) for (const w of readFileSync(p, 'utf8').match(/[a-zA-Z][\w-]{1,40}/g) || []) used.add(w); } };
  jsWords(join(DIST, '_static')); jsWords(join(DIST, 'wp-content/themes')); jsWords(join(DIST, 'wp-content/cache/min/1/wp-content/themes'));
  const SAFE = /^(show|showing|hide|hiding|active|open|collapse|collapsing|collapsed|fade|modal|dropdown|navbar|offcanvas|was-validated|is-|disabled|sticky|visually-hidden|sr-only)/;
  const splitTop = (sel) => { const out = []; let depth = 0, cur = ''; for (const ch of sel) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const purge = (css) => {
    let out = '', i = 0;
    while (i < css.length) {
      const open = css.indexOf('{', i);
      if (open < 0) break;
      const head = css.slice(i, open).trim();
      // find the matching close brace
      let depth = 1, j = open + 1;
      while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
      const inner = css.slice(open + 1, j - 1);
      if (head.startsWith('@media') || head.startsWith('@supports') || head.startsWith('@layer')) { const p = purge(inner); if (p.trim()) out += `${head}{${p}}`; }
      else if (head.startsWith('@')) out += `${head}{${inner}}`;
      else {
        const keep = splitTop(head).filter((sel) => { const cls = [...sel.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]); return cls.every((c) => used.has(c) || SAFE.test(c)); });
        if (keep.length) out += `${keep.join(',')}{${inner}}`;
      }
      i = j;
    }
    return out;
  };
  for (const f of files) {
    let h = readFileSync(f, 'utf8');
    const headEnd = h.indexOf('</head>');
    if (headEnd < 0) continue;
    let head = h.slice(0, headEnd);
    const body = h.slice(headEnd);
    const uses = {
      woo: /class="[^"]*\b(woocommerce|wc-block|product|cart|checkout)\b/.test(body) && /\/(product|category|shop|cart|checkout|my-account)\//.test(f.replace(DIST, '') + '/') ,
      cf7: /wpcf7/.test(body), ub: /\bub-|wp-block-ub/.test(body), dflip: /_df_(book|thumb|button)|df-element/.test(body), swiper: /class="[^"]*\bswiper\b/.test(body),
    };
    const keep = (href) => {
      if (/woocommerce|wc-blocks|single-product|woo_block/.test(href)) return uses.woo;
      if (/contact-form-7/.test(href)) return uses.cf7;
      if (/ultimate-blocks/.test(href)) return uses.ub;
      if (/dflip/.test(href)) return uses.dflip;
      if (/swiper/.test(href)) return uses.swiper;
      return true;
    };
    const tags = [...head.matchAll(/<link\b[^>]*rel=['"]stylesheet['"][^>]*>/g)].map((m) => m[0]);
    const local = [];
    let fontTag = '';
    for (const tag of tags) {
      const href = (tag.match(/href=['"]([^'"]+)['"]/) || [])[1] || '';
      const media = (tag.match(/media=['"]([^'"]+)['"]/) || [])[1] || '';
      if (/qbw1hzk\.css/.test(href)) { fontTag = href; head = head.replace(tag, ''); continue; }
      if (!keep(href)) { head = head.replace(tag, ''); continue; }
      if (/^https?:|^\/\//.test(href)) continue;
      let css = readCss(href);
      if (css == null) continue;
      if (/bootstrap\.min\.css/.test(href) && !/_crm-page|404\.html/.test(f) && !process.env.NO_PURGE) css = purge(css);
      local.push({ tag, href, media, css });
    }
    if (local.length > 1) {
      const id = createHash('sha1').update(local.map((x) => x.href + '|' + x.media).join('\n')).digest('hex').slice(0, 10);
      if (!bundles.has(id)) {
        const css = local.map((x) => `/* ${x.href.replace(/[?#].*$/, '')} */\n` + (x.media && x.media !== 'all' ? `@media ${x.media}{${x.css}}` : x.css)).join('\n');
        // @import must come first in a stylesheet: keep any at the top
        const imports = []; const rest = css.replace(/@import[^;]+;/g, (m) => { imports.push(m); return ''; });
        const out = imports.join('\n') + '\n' + rest;
        const hash = createHash('sha1').update(out).digest('hex').slice(0, 10);
        mkdirSync(join(DIST, '_static/css'), { recursive: true });
        writeFileSync(join(DIST, `_static/css/site-${hash}.css`), out);
        bundles.set(id, `/_static/css/site-${hash}.css`);
      }
      const first = local[0].tag;
      for (const x of local.slice(1)) head = head.replace(x.tag, '');
      head = head.replace(first, `<link rel="stylesheet" href="${bundles.get(id)}">`);
    }
    if (fontTag) {
      const fh = fontTag.startsWith('http') ? fontTag : fontTag;
      head = head.replace(/(<link rel="stylesheet" href="\/_static\/css\/[^"]+">|<\/title>)/, `$1\n<link rel="preconnect" href="https://use.typekit.net" crossorigin><link rel="preload" as="style" href="${fh}" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="${fh}"></noscript>`);
    }
    // stylesheet tags WordPress printed in the body
    const body2 = body.replace(/<link\b[^>]*rel=['"]stylesheet['"][^>]*>/g, (tag) => (keep((tag.match(/href=['"]([^'"]+)['"]/) || [])[1] || '') ? tag : ''));
    writeFileSync(f, head + body2);
  }
  console.log(`Styles: ${files.length} pages share ${bundles.size} combined stylesheets.`);
}

// Build id: changes whenever a page, the styles or the worker change, so the worker's page cache starts afresh
{
  const { createHash } = await import('node:crypto');
  const hsh = createHash('sha1');
  const walk = (d) => { for (const f of readdirSync(d).sort()) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!/wp-content|wp-includes|opt|img|brands/.test(f)) walk(p); } else if (/\.(html|css|js|json)$/.test(f)) hsh.update(f + readFileSync(p)); } };
  walk(join(ROOT, 'dist'));
  for (const f of readdirSync(join(ROOT, 'worker')).sort()) if (f !== 'build-id.json') hsh.update(f + readFileSync(join(ROOT, 'worker', f)));
  writeFileSync(join(ROOT, 'worker/build-id.json'), JSON.stringify({ id: hsh.digest('hex').slice(0, 12) }) + '\n');
}

const stillBroken = [...brokenLinks].filter((p) => !redirects[p]).sort();
console.log(`Built ${staticPaths.size} pages from the WordPress capture (CRM pages left to the worker: ${crmPages.join(', ') || 'none'}), ${assetsCopied} theme/plugin files, ${publicCopied} uploads, ${Object.keys(redirects).length} redirects.`);
if (stillBroken.length) console.log(`Links to addresses the site doesn't have: ${stillBroken.join(', ')}`);
