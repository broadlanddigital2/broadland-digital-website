/**
 * Signage ↔ sectors cross-links, filled in live from the CRM's sector pages (Marketing → SEO pages, type "sector").
 *   - Signage hub (/signage-home/): "Industries we work with" (all top-level sectors) in its resources section
 *     (hub-resources.js calls sectorGroup).
 *   - Signage category and service pages (static or CRM): a "Popular with" strip above the footer listing the sectors
 *     whose pages link to this product (or, failing that, to its parent category). Pages that already link to sectors
 *     (guides, comparisons, area pages, the locations list) and the hub itself are left alone.
 */
import { getFeed } from './crm-pages.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slash = (p) => (p === '/' || p.endsWith('/') ? p : p + '/');
const name = (p) => String(p.h1 || p.title || '').replace(/\s*[|–-]\s*Broadland Digital.*$/i, '').replace(/^Signage (for|in)\s+/i, '').replace(/\s+signage$/i, '').trim();

/** Top-level sector pages (/sectors/<name>), A–Z. */
function topSectors(feed) {
  return [...(feed?.pages?.values() || [])]
    .filter((p) => p.pageType === 'sector' && /^\/sectors\/[^/]+$/.test(p.path))
    .sort((a, b) => name(a).localeCompare(name(b)));
}

/** The "Industries we work with" group for the signage hub's resources section ('' when there are no sector pages). */
export function sectorGroup(feed) {
  const list = topSectors(feed);
  if (!list.length) return '';
  return `<div class="bdr-group"><div class="bdr-group-head"><h3>Industries we work with</h3><a href="/sectors/">All sectors →</a></div>`
    + `<ul class="bdr-pills">${list.map((p) => `<li><a href="${esc(slash(p.path))}">${esc(name(p))}</a></li>`).join('')}</ul></div>`;
}

const SKIP = /^\/signage-home(\/(guides-and-advice|compare|locations|signage-brochure)(\/|$)|\/?$)/;
const LINKED = new Set(['location', 'guide', 'comparison', 'hub', 'sector']); // page types that already link to sectors

/** Sectors (top-level, A–Z) whose pages link to this signage address or, if none do, to its parent category. */
function sectorsFor(feed, key) {
  const pages = [...(feed?.pages?.values() || [])].filter((p) => p.pageType === 'sector');
  const linksTo = (p, target) => new RegExp(`href="${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?["#?]`).test(String(p.html || ''));
  const parent = key.split('/').slice(0, 3).join('/');
  let hits = pages.filter((p) => linksTo(p, key));
  if (!hits.length && parent !== key) hits = pages.filter((p) => linksTo(p, parent));
  const tops = new Map(topSectors(feed).map((p) => [p.path, p]));
  const out = new Map();
  for (const p of hits) {
    const top = tops.get(p.path.split('/').slice(0, 3).join('/'));
    if (top) out.set(top.path, top);
  }
  return [...out.values()].sort((a, b) => name(a).localeCompare(name(b)));
}

const CSS = `<style>.bdsec{background:#f4f3f7;padding:44px 24px}.bdsec-in{max-width:1240px;margin:0 auto}
.bdsec-head{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-bottom:16px}
.bdsec h2{font-family:"Adelle",adelle,Georgia,serif;font-size:26px;margin:0;color:#2a2d32}
.bdsec-head a{color:#2a2d32!important;font-weight:700;text-decoration:none;border-bottom:2px solid #713fff}
.bdsec ul{display:flex;flex-wrap:wrap;gap:10px;margin:0;padding:0;list-style:none}
.bdsec li a{display:inline-block;padding:9px 18px;border-radius:30px;background:#fff;border:1px solid #ddd8ea;color:#2a2d32!important;text-decoration:none;font-size:15px}
.bdsec li a:hover{border-color:#713fff}</style>`;

/** Adds the "Popular with" strip to a signage category or service page response. Other responses pass through. */
export async function withSectorLinks(response, key, feedKey) {
  if (!response.ok || !key.startsWith('/signage-home/') || SKIP.test(key)) return response;
  if (!(response.headers.get('content-type') || '').includes('text/html')) return response;
  const feed = await getFeed(feedKey);
  if (LINKED.has(feed?.pages?.get(key)?.pageType)) return response;
  const list = feed ? sectorsFor(feed, key) : [];
  if (!list.length) return response;
  const html = await response.text();
  const at = html.indexOf('<footer class="bdf');
  if (at < 0) return new Response(html, response);
  const strip = `${CSS}<section class="bdsec" aria-labelledby="bdsec-h"><div class="bdsec-in"><div class="bdsec-head"><h2 id="bdsec-h">Popular with</h2><a href="/sectors/">All sectors →</a></div>`
    + `<ul>${list.map((p) => `<li><a href="${esc(slash(p.path))}">${esc(name(p))}</a></li>`).join('')}</ul></div></section>`;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html.slice(0, at) + strip + html.slice(at), { status: response.status, headers });
}
