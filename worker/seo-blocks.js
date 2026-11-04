// Keyword copy blocks (content/seo-sections/*.json, merged into worker/seo-sections.json by the build) and videos
// (content/videos.json). Used by the static build (tools/seo.mjs) and by the worker for CRM pages, so both look the same.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Copy may carry <strong> and internal links only; everything else is escaped.
export function safe(html) {
  const parts = [];
  const out = String(html ?? '').replace(/<a\s+href="(\/[^"<>]*)"\s*>([\s\S]*?)<\/a>|<strong>([\s\S]*?)<\/strong>/g, (m, href, text, strong) => {
    parts.push(href != null ? `<a href="${esc(href)}">${esc(text.replace(/<[^>]+>/g, ''))}</a>` : `<strong>${esc(strong.replace(/<[^>]+>/g, ''))}</strong>`);
    return `\u0000${parts.length - 1}\u0000`;
  });
  return esc(out).replace(/\u0000(\d+)\u0000/g, (m, i) => parts[+i]);
}

export function leadHtml(s) {
  return s?.lead ? `<p class="bdkw-lead">${safe(s.lead)}</p>` : '';
}

export function videoHtml(v) {
  if (!v) return '';
  const id = String(v.youtube || '').replace(/[^\w-]/g, '');
  const src = id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : /^https:\/\/player\.vimeo\.com\/video\/\d+/.test(v.vimeo || '') ? v.vimeo : '';
  if (!src) return '';
  return `<figure class="bdkw-video"><div class="bdkw-frame"><iframe src="${esc(src)}" title="${esc(v.title || 'Video')}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>${v.caption ? `<figcaption>${esc(v.caption)}</figcaption>` : ''}</figure>`;
}

export function blockHtml(s, video) {
  if (!s?.heading && !video) return '';
  const items = (s?.items || []).filter((i) => i && i.h && i.p);
  return `<section class="bdkw"><div class="bdkw-wrap">${s?.heading ? `<h2>${safe(s.heading)}</h2>` : ''}${videoHtml(video)}`
    + (items.length ? `<div class="bdkw-grid">${items.map((i) => `<div class="bdkw-card"><h3>${safe(i.h)}</h3><p>${safe(i.p)}</p></div>`).join('')}</div>` : '')
    + (s?.close ? `<p class="bdkw-close">${safe(s.close)}</p>` : '') + '</div></section>';
}
// Styles: site/bd-pages.css (.bdkw…)

// ---- CRM pages and blog posts (rendered by the worker) ----
const norm = (x) => String(x || '').toLowerCase().replace(/&amp;/g, '&').replace(/<[^>]+>/g, ' ').replace(/[’']/g, '').replace(/[^a-z0-9£]+/g, ' ').trim();
const has = (t, k) => (' ' + norm(t) + ' ').includes(' ' + norm(k) + ' ');
const PROPER = { norwich: 'Norwich', norfolk: 'Norfolk', suffolk: 'Suffolk', uk: 'UK', '3d': '3D', pvc: 'PVC', mot: 'MOT', lynn: 'Lynn', kings: 'Kings', yarmouth: 'Yarmouth', great: 'Great', lowestoft: 'Lowestoft', cromer: 'Cromer', thetford: 'Thetford', dereham: 'Dereham', wymondham: 'Wymondham', aylsham: 'Aylsham', attleborough: 'Attleborough', walsham: 'Walsham', north: 'North' };
const SMALL = new Set(['and', 'or', 'of', 'for', 'in', 'to', 'the', 'a', 'vs', 'with', 'on']);
const titleCase = (k) => k.split(' ').map((w, i) => PROPER[w] || (i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
const sentence = (k) => { const t = k.split(' ').map((w) => PROPER[w] || w).join(' '); return t.charAt(0).toUpperCase() + t.slice(1); };
const BRAND = 'Broadland Digital';

/** SEO title that leads with the keyword (30–65 characters) */
export function kwTitle(title, pk) {
  const t = String(title || '').trim();
  if (!pk || norm(t).startsWith(norm(pk))) return t;
  const K = titleCase(norm(pk));
  const core = t.replace(/\s*[|–-]\s*Broadland Digital.*$/i, '').replace(/\.$/, '').trim();
  const overlap = (() => { const a = norm(core).split(' '), b = new Set(norm(pk).split(' ')); return a.filter((w) => b.has(w)).length / (a.length || 1); })();
  for (const c of [overlap < 0.6 && core ? `${K} – ${core} | ${BRAND}` : '', `${K} | ${BRAND}`, `${K} | Signs & Print | ${BRAND}`]) if (c && c.length <= 65 && c.length >= 30) return c;
  return t;
}
/** Meta description that mentions the keyword */
export function kwDesc(desc, pk) {
  const d = String(desc || '').trim();
  if (!pk || !d) return d;
  if (has(d, pk)) return d.length < 120 && (d + ' Call 01603 407786 for a free quote.').length <= 165 ? d + ' Call 01603 407786 for a free quote.' : d;
  let out = `${sentence(norm(pk))}: ${/^[A-Z][a-z]+ [A-Z]/.test(d) ? d : d.charAt(0).toLowerCase() + d.slice(1)}`;
  if (out.length > 165) {
    const sentences = out.match(/[^.!?]+[.!?]+(\s|$)/g) || [out];
    let acc = ''; for (const x of sentences) { if ((acc + x).trim().length > 165) break; acc += x; }
    out = acc.trim().length >= 110 ? acc.trim() : out.slice(0, 162).replace(/\s+\S*$/, '') + '.';
  }
  if (out.length < 120) for (const tail of [' Call 01603 407786 for a free quote.', ' Call 01603 407786.']) if ((out + tail).length <= 165) { out += tail; break; }
  return out;
}
/** Lead under the H1, keyword section before the enquiry band, keyword in the first photo's alt text */
export function decorateCrmHtml(html, sec, video) {
  let h = String(html || '');
  if (!sec && !video) return h;
  const lead = leadHtml(sec);
  if (lead) {
    // after the hero's own intro paragraph when there is one, otherwise straight after the H1
    const m = h.match(/<\/h1>(\s*<p\b[^>]*>[\s\S]*?<\/p>)?/);
    if (m) h = h.replace(m[0], m[0] + lead);
  }
  const block = blockHtml(sec, video);
  if (block) {
    const end = [/<section class="section tint crm-enquiry"/, /<div class="crmblog-cta/, /<\/main>/].map((r) => h.search(r)).find((i) => i >= 0);
    // after the second section below the H1, so it is read as main copy, unless the page ends first
    let at = end;
    const h1 = h.indexOf('</h1>');
    if (h1 > 0) { let i = h.indexOf('</section>', h1); if (i > 0) i = h.indexOf('</section>', i + 10); if (i > 0 && (end == null || i < end)) at = i + 10; }
    h = at != null ? h.slice(0, at) + block + h.slice(at) : h + block;
  }
  if (sec?.primary) {
    const alts = [...h.matchAll(/<img\b[^>]*\salt="([^"]*)"/g)].map((x) => x[1]);
    if (!alts.some((a) => has(a, sec.primary))) {
      let done = false;
      h = h.replace(/<img\b[^>]*>/g, (tag) => {
        if (done || /logo|\.svg/i.test(tag)) return tag;
        done = true;
        const a = (tag.match(/\salt="([^"]*)"/) || [])[1];
        const next = esc(sentence(norm(sec.primary))) + (a ? ' – ' + a : '');
        return a != null ? tag.replace(/\salt="[^"]*"/, ` alt="${next}"`) : tag.replace(/<img\b/, `<img alt="${next}"`);
      });
    }
  }
  return h;
}
