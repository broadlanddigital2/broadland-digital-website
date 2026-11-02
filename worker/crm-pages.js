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
  const form = (shell.match(/<div class="wpcf7[^"]*"[^>]*>[\s\S]*?<\/form>\s*<\/div>/) || [''])[0]
    .replace(/wpcf7-f(\d+)-o1/g, 'wpcf7-f$1-o2');
  return pageHtml.replace(/<div class="crmseo-shortcode"[^>]*><\/div>/g, form ? `<div class="crmseo-shortcode">${form}</div>` : '');
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
  const inner = bar + withForms(String(page.html || ''), shell);
  const html = setHead(fill(shell, inner), {
    title: page.metaTitle || page.title, description: page.metaDescription, url: opts.origin + (page.path || path) + (opts.trailingSlash && (page.path || path) !== '/' ? '/' : ''),
    image: page.image || '', schema: page.schema || null, noindex: !!preview, css, vars,
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
