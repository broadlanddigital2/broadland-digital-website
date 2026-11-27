// Business signs prices, worked out on the server from worker/business-signs-catalog.json (written by the build from
// the CRM-edited product data). Same rules as the product page (site/bd-business-signs.js), so the basket can't be
// tampered with: size price = max(minimum, fixed + £/m² × area + £/m × perimeter) per choice of the "priced by"
// dropdown, otherwise the product's price; dropdown add-ons are added per item; quantity breaks take % off.

/** opts: { o0: '600', o1: 'Gloss', … } (the product form's field names). Returns { ok, each, lines, error }. */
export function priceItem(prod, opts = {}, qty = 1) {
  if (!prod) return { ok: false, error: 'That product is no longer available.' };
  const q = Math.floor(Number(qty));
  if (!(q >= 1 && q <= 1000)) return { ok: false, error: 'Please choose a quantity between 1 and 1000.' };
  let w = null, h = null, add = 0, byValue = null;
  const lines = [];
  for (const [i, o] of prod.options.entries()) {
    const raw = String(opts['o' + i] ?? '').trim();
    if (o.range) {
      const n = Number(raw), [lo, hi] = o.range;
      const dim = /height/i.test(o.label) ? 'h' : /width/i.test(o.label) ? 'w' : '';
      if (raw === '') { if (dim) return { ok: false, error: `Please enter the ${o.label.replace(/ \(mm\)$/, '').toLowerCase()}.` }; continue; }
      if (!Number.isFinite(n) || n < lo || (hi && n > hi)) return { ok: false, error: `${o.label.replace(/ \(mm\)$/, '')} must be ${lo}mm${hi ? ` to ${hi}mm` : ' or more'}.` };
      if (dim === 'w') w = n; if (dim === 'h') h = n;
      lines.push(`${o.label.replace(/ \(mm\)$/, '')}: ${n}mm`);
    } else {
      const v = raw === '' ? o.choices[0] : raw;
      if (!o.choices.includes(v)) return { ok: false, error: `Please choose a valid ${o.label.toLowerCase()}.` };
      if (o.add && o.add[v]) add += Number(o.add[v]);
      if (prod.size && prod.size.by === o.label) byValue = v;
      lines.push(`${o.label}: ${v}`);
    }
  }
  let unit = prod.price || null;
  if (prod.size) {
    const rows = prod.size.rows;
    const row = rows[byValue] || rows['*'] || rows[Object.keys(rows)[0]];
    if (!row) return { ok: false, error: 'This product needs a quote.' };
    if (!(w && h)) return { ok: false, error: 'Please enter your width and height.' };
    const A = (w / 1000) * (h / 1000), P = (2 * (w + h)) / 1000;
    unit = Math.max(row[3] || 0, row[0] + row[1] * A + row[2] * P);
  }
  if (!(unit > 0)) return { ok: false, error: 'This product needs a quote.' };
  let pct = 0;
  for (const [n, p] of prod.qtyBreaks || []) if (q >= n) pct = p;
  const each = Math.round((unit * (1 - pct / 100) + add) * 100) / 100;
  return { ok: true, each, qty: q, pct, lines };
}
