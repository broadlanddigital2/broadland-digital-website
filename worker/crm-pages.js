/**
 * CRM SEO pages (Marketing → SEO pages in the CRM) served live inside the site's own header and footer.
 *
 * The CRM's seo-feed function returns every page that is published and released today (locations, guides,
 * comparisons, sectors, services and their hubs) as finished HTML plus the CSS for it. This replaces the WordPress
 * plugin (integrations/wordpress/crm-seo-pages in the CRM repo): same feed, same feed key, same ?crmseo_preview=<id>
 * preview links, so nothing changes in the CRM.
 *
 * A page published in the CRM at an address the static site also has takes over that address.
 */
const FEED = 'https://dipjypzrfigkzuarlsov.supabase.co/functions/v1/seo-feed';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let memo = { at: 0, feed: null };

/** The live feed, cached at the edge for five minutes (and in memory for one). */
export async function getFeed(feedKey) {
  if (memo.feed && Date.now() - memo.at < 60_000) return memo.feed;
  try {
    const r = await fetch(`${FEED}?key=${encodeURIComponent(feedKey)}`, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!r.ok) return memo.feed;
    const j = await r.json();
    const pages = new Map((j.pages || []).map((p) => [String(p.path).replace(/\/+$/, '') || '/', p]));
    memo = { at: Date.now(), feed: { ...j, pages } };
  } catch {
    /* keep the last good copy */
  }
  return memo.feed;
}

async function getPreview(feedKey, id) {
  const r = await fetch(`${FEED}?key=${encodeURIComponent(feedKey)}&preview=${encodeURIComponent(id)}`);
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { error: j.error || 'This preview could not be loaded. Open it again from the CRM.' };
}

function setHead(html, { title, description, url, image, schema, noindex, css, vars }) {
  const meta = (attr, name, content) => {
    if (!content) return;
    const re = new RegExp(`<meta[^>]*${attr}="${name}"[^>]*>`, 'i');
    const tag = `<meta ${attr}="${name}" content="${esc(content)}">`;
    html = re.test(html) ? html.replace(re, tag) : html.replace('</head>', tag + '</head>');
  };
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
  meta('name', 'description', description);
  meta('property', 'og:title', title);
  meta('property', 'og:description', description);
  meta('property', 'og:url', url);
  if (image) meta('property', 'og:image', image);
  // The same social and search tags the WordPress plugin printed on these pages.
  meta('property', 'og:locale', 'en_US');
  meta('property', 'og:type', 'article');
  meta('property', 'og:site_name', 'Broadland Digital');
  meta('property', 'article:publisher', 'https://www.facebook.com/broadlanddigital');
  meta('name', 'twitter:card', 'summary_large_image');
  meta('name', 'twitter:title', title);
  meta('name', 'twitter:description', description);
  if (image) meta('name', 'twitter:image', image);
  if (!noindex) meta('name', 'robots', 'index, follow');
  html = html.replace(/<link[^>]*rel="canonical"[^>]*>/i, `<link rel="canonical" href="${esc(url)}">`);
  const head = [
    noindex ? '<meta name="robots" content="noindex, nofollow">' : '',
    css ? `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>` : '',
    vars ? `<style>.crm-main{${vars}}</style>` : '',
    schema ? `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>` : '',
  ].join('');
  return html.replace('<!--crm:head-->', head);
}

// The CRM's "fixed" blocks carry a WordPress shortcode (the contact form): the site's own enquiry form goes there.
function withForms(pageHtml, shell) {
  // A second copy of the footer's enquiry form, with its own ids.
  const form = (shell.match(/<form class="bdf-form"[\s\S]*?<\/form>/) || [''])[0]
    .replace(/\b(id|for|aria-describedby)="bdf-([a-z-]+)"/g, '$1="bdf2-$2"');
  return pageHtml.replace(/<div class="crmseo-shortcode"[^>]*><\/div>/g, form ? `<div class="crmseo-shortcode bdf bdf-inline"><div class="bdf-wrap">${form}<div class="bdf-done" role="status"><h3>Thank you<span class="bdf-done-name"></span>.</h3><p>We've received your enquiry and will be in touch shortly.</p><button type="button" class="bdf-again">Send another enquiry</button></div></div></div>` : '');
}

// The site's breadcrumbs (Home / Section / … / page), white, at the top of the page's hero (as on the static pages),
// in place of the CRM's own trail under the hero picture. Styles: site/bd-pages.css (.crm-main).
const SECTIONS = { 'signage-home': 'Signage', 'print-home': 'Print', 'design-home': 'Design', 'web-dev-home': 'Web Dev', 'liquid-wrapping-home': 'Liquid Wrapping' };
// The CRM's schema, completed for the site: breadcrumbs that match the ones shown (Home / Section / … / page),
// the town for location pages ("Vehicle graphics Norwich" → Norwich), the pages a hub lists (ItemList), and the
// picture, offers and the article's section where the CRM leaves them out.
function enrichSchema(schema, { origin, path, page, trail, html }) {
  if (!schema || !Array.isArray(schema['@graph'])) return schema || null;
  const s = JSON.parse(JSON.stringify(schema));
  const g = s['@graph'];
  const here = origin + (path === '/' ? '/' : path + '/');
  const abs = (u) => (/^https?:\/\//.test(u) ? u : origin + u);
  const bc = g.find((x) => x['@type'] === 'BreadcrumbList');
  if (bc && trail?.length) bc.itemListElement = trail.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.path ? abs(c.path) : here }));
  const type = page.pageType;
  const biz = g.find((x) => x['@id'] === origin + '/#business');
  if (biz) Object.assign(biz, {
    name: biz.name || 'Broadland Digital', telephone: biz.telephone || '+44 1603 407786', email: biz.email || 'production@broadlanddigital.co.uk',
    logo: origin + '/wp-content/uploads/2023/03/Broadland_Digital_Logo.svg', image: origin + '/wp-content/uploads/2023/03/Broadland_Digital_Logo.svg',
    address: biz.address || { '@type': 'PostalAddress', streetAddress: 'Vulcan House, Vulcan Road North', addressLocality: 'Norwich', postalCode: 'NR6 6AQ', addressCountry: 'GB' },
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '08:30', closes: '17:00' }],
    sameAs: ['https://www.facebook.com/BroadlandDigital/', 'https://www.instagram.com/broadland.digital/'],
  });
  const svc = g.find((x) => x['@type'] === 'Service');
  if (svc && type === 'location') {
    const town = String(page.h1 || '').replace(/\.$/, '').replace(/^(vehicle graphics|van graphics|signage|signs)\s+(in\s+)?/i, '').trim();
    if (town && town.toLowerCase() !== String(page.h1 || '').toLowerCase()) svc.areaServed = town.split(/\s*(?:&|and)\s*/).map((t) => ({ '@type': 'Place', name: t }));
  }
  if (svc && /£\s?\d/.test(html)) {
    const prices = [...new Set([...html.matchAll(/£\s?(\d{2,4})(?:\.\d\d)?\s*\+\s*VAT/g)].map((m) => +m[1]))].sort((a, b) => a - b);
    if (prices.length) svc.offers = { '@type': 'AggregateOffer', priceCurrency: 'GBP', lowPrice: prices[0], highPrice: prices[prices.length - 1], offerCount: prices.length,
      priceSpecification: { '@type': 'PriceSpecification', priceCurrency: 'GBP', valueAddedTaxIncluded: false } };
  }
  const art = g.find((x) => x['@type'] === 'Article');
  if (art) { art.articleSection = trail?.length > 2 ? trail[trail.length - 2].name : undefined; art.about = svc ? { '@id': svc['@id'] } : art.about; art.wordCount = String(html).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length; }
  if (type === 'hub' || type === 'category') {
    const links = [...new Set([...html.matchAll(/<article class="card"[^>]*>[\s\S]*?<a\b[^>]*href="(\/[^"#?]+)"[\s\S]*?<h3>([\s\S]*?)<\/h3>/g)].map((m) => m[1] + '|' + m[2].replace(/<[^>]+>/g, '').replace(/\s*↗\s*/g, '').trim()))]
      .map((x) => x.split('|'));
    if (links.length) {
      const page_ = g.find((x) => x['@type'] === 'CollectionPage');
      const list = { '@type': 'ItemList', '@id': here + '#list', itemListElement: links.map(([u, n], i) => ({ '@type': 'ListItem', position: i + 1, name: n, url: abs(u.replace(/\/?$/, '/')) })) };
      g.push(list);
      if (page_) page_.mainEntity = { '@id': list['@id'] };
    }
  }
  return s;
}

function heroCrumbs(html, path, name) {
  heroCrumbs.trail = null;
  // pages without a CRM trail (e.g. the locations list) get Home / Section / page
  const m = html.match(/<(nav|div)\b[^>]*class="crumb wrap"[^>]*>([\s\S]*?)<\/\1>/)
    || ['', '', `<span aria-current="page">${esc(String(name || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())}</span>`];
  const tidy = (t) => t.replace(/<[^>]+>/g, '').replace(/\s*↗\s*/g, '').replace(/&amp;/g, '&').replace(/&#0?39;|&rsquo;/g, '’').trim();
  const items = [];
  for (const a of m[2].matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) items.push({ href: a[1], name: tidy(a[2]) });
  const last = tidy((m[2].match(/aria-current="page"[^>]*>([\s\S]*?)<\//) || [])[1] ?? m[2].replace(/[\s\S]*<\/a>/, '').replace(/^\s*\/\s*/, ''));
  const seg = path.split('/')[1] || '';
  const slash = (h) => (h === '/' || /[?#]/.test(h) || h.endsWith('/') ? h : h + '/');
  if (seg === 'vehicle-graphics') { // vehicle pages sit under Signage
    if (!items.some((i) => i.href.replace(/\/+$/, '') === '/vehicle-graphics')) items.unshift({ href: '/vehicle-graphics', name: 'Vehicle graphics' });
    if (!items.some((i) => i.href.replace(/\/+$/, '') === '/signage-home')) items.unshift({ href: '/signage-home', name: 'Signage' });
  } else if (SECTIONS[seg] && !items.some((i) => i.href.replace(/\/+$/, '') === '/' + seg)) items.unshift({ href: '/' + seg, name: SECTIONS[seg] });
  items.unshift({ href: '/', name: 'Home' });
  heroCrumbs.trail = [...items.map((i) => ({ name: i.name, path: slash(i.href) })), ...(last ? [{ name: last, path: null }] : [])];
  const nav = `<nav class="bdc" aria-label="Breadcrumb"><ol>${items.map((i) => `<li><a href="${slash(i.href)}">${esc(i.name)}</a></li>`).join('')}${last ? `<li><span aria-current="page">${esc(last)}</span></li>` : ''}</ol></nav>`;
  const out = m[0] ? html.replace(m[0], '') : html;
  const hero = out.match(/<div class="(?:research-hero wrap|hero-title|sector-hero[^"]*)">/);
  return hero ? out.replace(hero[0], hero[0] + nav) : html;
}

function fill(shell, inner) {
  return shell.replace(/(<div[^>]*data-crm-blog="slot"[^>]*>)\s*<\/div>/i, (_m, open) => open + inner + '</div>');
}

/**
 * Responds with the CRM page for this address, or null when the CRM has no page here.
 * opts: { feedKey, origin, shellPath }
 */
export async function crmPageResponse(request, env, opts) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const previewId = url.searchParams.get('crmseo_preview');
  let page, css, vars, preview = null;
  if (previewId) {
    const j = await getPreview(opts.feedKey, previewId);
    if (j.error) return new Response(j.error, { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    ({ page, css } = j);
    preview = j.preview || {};
  } else {
    const feed = await getFeed(opts.feedKey);
    page = feed?.pages.get(path);
    if (!page) return null;
    // Same address style as the rest of the site: "/signage-home/signage-norwich/".
    if (opts.trailingSlash && path !== '/' && !url.pathname.endsWith('/')) return Response.redirect(`${url.origin}${path}/${url.search}`, 301);
    css = feed.css;
    vars = typeof feed.vars === 'string' && !/[{}<>]/.test(feed.vars) ? feed.vars : '';
  }
  const shellRes = await env.ASSETS.fetch(new Request(new URL(opts.shellPath, url.origin)));
  if (!shellRes.ok) return null;
  const shell = await shellRes.text();
  const bar = preview ? `<div style="position:sticky;top:84px;z-index:40;padding:10px 16px;background:#ffd84d;color:#111;font:600 14px/1.4 system-ui,sans-serif;text-align:center">Preview from the CRM — not published${preview.note ? ' · ' + esc(preview.note) : ''}</div>` : '';
  const inner = bar + withForms(heroCrumbs(String(page.html || ''), path, String(page.title || '').replace(/\s*[|–]\s*Broadland Digital.*$/i, '') || page.h1), shell);
  const html = setHead(fill(shell, inner), {
    title: page.metaTitle || page.title, description: page.metaDescription, url: opts.origin + (page.path || path) + (opts.trailingSlash && (page.path || path) !== '/' ? '/' : ''),
    image: page.image || '', schema: enrichSchema(page.schema, { origin: opts.origin, path, page, trail: heroCrumbs.trail, html: String(page.html || '') }), noindex: !!preview, css, vars,
  });
  return new Response(request.method === 'HEAD' ? null : html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': preview ? 'no-store' : 'public, max-age=120' },
  });
}

/** Adds the CRM's live pages to the static sitemap. */
export async function addCrmPagesToSitemap(xml, opts) {
  const feed = await getFeed(opts.feedKey);
  if (!feed) return xml;
  const have = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  const urls = [...feed.pages.values()].map((p) => opts.origin + p.path + (p.path === '/' ? '' : '/')).filter((u) => !have.has(u))
    .map((u) => `<url><loc>${esc(u)}</loc></url>`);
  return urls.length ? xml.replace('</urlset>', urls.join('\n') + '\n</urlset>') : xml;
}

/** /llms.txt for AI assistants, from the CRM's site profile and its pages (as the WordPress plugin did). */
export async function llmsTxt(opts, staticPages) {
  const feed = await getFeed(opts.feedKey);
  const l = feed?.llms || {};
  if (l.override) return l.override;
  const lines = [`# ${l.name || 'Broadland Digital'}`, '', `> ${l.summary || 'Signage, print and design company in Norwich, Norfolk.'}`, ''];
  if (l.details?.length) lines.push(...l.details.map((d) => `- ${d}`), '');
  lines.push('## Main pages', ...staticPages.map(([p, t]) => `- [${t}](${opts.origin}${p})`), '');
  const groups = {};
  for (const p of feed?.pages?.values() || []) {
    if ((l.exclude || []).some((x) => p.path.startsWith(x))) continue;
    (groups[p.pageType || 'page'] ||= []).push(p);
  }
  const names = { hub: 'Sections', service: 'Signage services', location: 'Areas we cover', guide: 'Guides', comparison: 'Comparisons', sector: 'Sectors', category: 'Categories', pillar: 'Overview' };
  for (const [k, list] of Object.entries(groups)) {
    lines.push(`## ${names[k] || k}`, ...list.map((p) => `- [${p.h1 || p.title}](${opts.origin}${p.path})${p.metaDescription ? ': ' + p.metaDescription : ''}`), '');
  }
  return lines.join('\n');
}
