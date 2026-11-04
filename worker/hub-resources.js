import { resizeStorageImages } from './seo-blocks.js';
/**
 * Guides & resources on the section hubs (/signage-home/, /print-home/ …), filled in live from the CRM so new guides
 * and blog posts appear without a rebuild. The static page has an empty, hidden
 * <section class="bdhub-res" data-bd-resources="<section>">; this fills it, or leaves it hidden if there's nothing.
 *   Signage: the CRM's buying guides, comparisons, area pages and sectors (Marketing → SEO pages), plus matching blog posts
 *   Others:  matching blog posts (Marketing → Blog posts)
 */
import { getFeed } from './crm-pages.js';
import { fetchPosts } from './crm-blog.js';
import { sectorGroup } from './sector-links.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MATCH = {
  signage: /\bsign|banner|fascia|window graphic|exhibition|display|manifestation|board|lettering|wayfinding/i,
  print: /\bprint|leaflet|brochure|flyer|business card|poster|litho|stationery/i,
  design: /\bdesign|logo|brand|artwork|livery/i,
  web: /website|web design|web develop|ecommerce|e-commerce|online shop|hosting|software|seo\b/i,
  'liquid-wrapping': /liquid|wrap|dip\b|alloy|dechrom|plasti/i,
};
const slash = (p) => (p === '/' || p.endsWith('/') ? p : p + '/');

function card(href, kind, title, desc, img) {
  return `<a class="bdr-card" href="${esc(href)}">${img ? `<span class="bdr-img"><img src="${esc(resizeStorageImages(img, 800))}" alt="${esc(title || '')}" width="800" height="450" loading="lazy" decoding="async"></span>` : ''}`
    + `<span class="bdr-body"><span class="bdr-kind">${esc(kind)}</span><span class="bdr-title">${esc(title)}</span>${desc ? `<span class="bdr-desc">${esc(desc)}</span>` : ''}</span></a>`;
}

async function build(cls, opts) {
  const parts = [];
  const [feed, posts] = await Promise.all([cls === 'signage' ? getFeed(opts.feedKey) : null, fetchPosts(opts.blog)]);
  if (feed?.pages) {
    const pages = [...feed.pages.values()];
    const guides = pages.filter((p) => p.pageType === 'guide').slice(0, 6);
    const compare = pages.filter((p) => p.pageType === 'comparison').slice(0, 6);
    const areas = pages.filter((p) => p.pageType === 'location').sort((a, b) => (a.h1 || '').localeCompare(b.h1 || ''));
    if (guides.length) parts.push(`<div class="bdr-group"><div class="bdr-group-head"><h3>Buying guides</h3><a href="/signage-home/guides-and-advice/">All guides →</a></div><div class="bdr-grid">${guides.map((p) => card(slash(p.path), 'Guide', p.h1 || p.title, p.metaDescription, p.image)).join('')}</div></div>`);
    if (compare.length) parts.push(`<div class="bdr-group"><div class="bdr-group-head"><h3>Compare sign types</h3><a href="/signage-home/compare/">All comparisons →</a></div><ul class="bdr-list">${compare.map((p) => `<li><a href="${esc(slash(p.path))}"><span>${esc(p.h1 || p.title)}</span><i aria-hidden="true">→</i></a></li>`).join('')}</ul></div>`);
    if (areas.length) parts.push(`<div class="bdr-group"><div class="bdr-group-head"><h3>Areas we cover</h3><a href="/signage-home/locations/">All areas →</a></div><ul class="bdr-pills">${areas.map((p) => `<li><a href="${esc(slash(p.path))}">${esc((p.h1 || p.title).replace(/^Signage\s+/i, ''))}</a></li>`).join('')}</ul></div>`);
    const sectors = sectorGroup(feed);
    if (sectors) parts.push(sectors);
  }
  const re = MATCH[cls];
  const matching = (posts || []).filter((p) => re && re.test([p.title, p.excerpt, p.category, ...(p.keywords || [])].join(' '))).slice(0, 3);
  if (matching.length) parts.push(`<div class="bdr-group"><div class="bdr-group-head"><h3>From the blog</h3><a href="/blog">All posts →</a></div><div class="bdr-grid">${matching.map((p) => card(p.path, p.category || 'Blog', p.title, p.excerpt, p.image?.url)).join('')}</div></div>`);
  return parts.join('');
}

/** Fills the resources section of a hub page response (HTML). Returns the response unchanged if it isn't one. */
export async function withHubResources(response, opts) {
  if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) return response;
  const html = await response.text();
  const m = html.match(/<section class="bdhub-res" data-bd-resources="([a-z-]+)" hidden/);
  let out = html;
  if (m) {
    const inner = await build(m[1], opts).catch(() => '');
    if (inner) out = html.replace(m[0], `<section class="bdhub-res" data-bd-resources="${m[1]}"`).replace('<div class="bdhub-res-body"></div>', `<div class="bdhub-res-body">${inner}</div>`);
  }
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'public, max-age=300');
  return new Response(out, { status: response.status, headers });
}
