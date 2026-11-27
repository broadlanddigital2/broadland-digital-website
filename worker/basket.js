/**
 * Basket checkout (business signs).
 *   POST /api/checkout        { items: [{ url, opts, qty }] } → prices every item on the server (sign-pricing.js),
 *                             creates a Stripe Checkout session and returns { url } to send the customer to.
 *   POST /api/stripe-webhook  Stripe's checkout.session.completed → the paid order goes into the CRM as a lead.
 *
 * Needs the worker secrets STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (Cloudflare → Workers → this worker → Settings →
 * Variables and Secrets). Until STRIPE_SECRET_KEY is set, checkout answers "not switched on" and the basket page offers
 * to send the basket as an order enquiry instead. Delivery: BASKET_DELIVERY_PENCE (ex VAT, var in wrangler.jsonc).
 * Prices on the site are ex VAT; the customer pays them plus 20% VAT (a separate line) plus delivery.
 */
import CATALOG from './business-signs-catalog.json' with { type: 'json' };
import { priceItem } from './sign-pricing.js';
import { sendCrmLead } from './forms.js';

const VAT = 0.2;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const pence = (gbp) => Math.round(gbp * 100);

function priceBasket(items) {
  if (!Array.isArray(items) || !items.length) return { error: 'Your basket is empty.' };
  if (items.length > 30) return { error: 'Please split very large orders, or call us on 01603 407786.' };
  const lines = [];
  for (const it of items) {
    const url = String(it?.url || '');
    const prod = CATALOG[url];
    const r = priceItem(prod, it?.opts && typeof it.opts === 'object' ? it.opts : {}, it?.qty);
    if (!r.ok) return { error: `${prod ? prod.name : 'An item'}: ${r.error}` };
    lines.push({ url, name: prod.name, img: prod.img, each: r.each, qty: r.qty, desc: r.lines.join(', ') });
  }
  const net = lines.reduce((t, l) => t + pence(l.each) * l.qty, 0);
  return { lines, net };
}

export async function handleCheckout(request, env = {}) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const origin = request.headers.get('origin');
  const self = new URL(request.url);
  if (origin && new URL(origin).host !== self.host) return json({ error: 'Not allowed' }, 403);
  let b; try { b = await request.json(); } catch { return json({ error: 'Something went wrong.' }, 400); }
  const priced = priceBasket(b.items);
  if (priced.error) return json({ error: priced.error }, 400);
  if (b.quote) return json({ ok: true, lines: priced.lines, net: priced.net }); // basket page: server prices
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Online payment isn’t switched on yet. You can send your basket to us as an order instead and we’ll send a payment link with your proof.', offline: true }, 503);

  const delivery = Math.max(0, Math.round(Number(env.BASKET_DELIVERY_PENCE || 0)));
  const f = new URLSearchParams();
  f.set('mode', 'payment');
  f.set('success_url', `${self.origin}/basket/thanks/?session_id={CHECKOUT_SESSION_ID}`);
  f.set('cancel_url', `${self.origin}/basket/`);
  f.set('billing_address_collection', 'required');
  f.set('shipping_address_collection[allowed_countries][0]', 'GB');
  f.set('phone_number_collection[enabled]', 'true');
  f.set('locale', 'en-GB');
  priced.lines.forEach((l, i) => {
    f.set(`line_items[${i}][quantity]`, String(l.qty));
    f.set(`line_items[${i}][price_data][currency]`, 'gbp');
    f.set(`line_items[${i}][price_data][unit_amount]`, String(pence(l.each)));
    f.set(`line_items[${i}][price_data][product_data][name]`, l.name.slice(0, 250));
    if (l.desc) f.set(`line_items[${i}][price_data][product_data][description]`, l.desc.slice(0, 500));
    const img = /^\//.test(l.img) ? self.origin + l.img : l.img;
    if (/^https:\/\//.test(img)) f.set(`line_items[${i}][price_data][product_data][images][0]`, img);
  });
  const n = priced.lines.length;
  f.set(`line_items[${n}][quantity]`, '1');
  f.set(`line_items[${n}][price_data][currency]`, 'gbp');
  f.set(`line_items[${n}][price_data][unit_amount]`, String(Math.round((priced.net + delivery) * VAT)));
  f.set(`line_items[${n}][price_data][product_data][name]`, 'VAT (20%)');
  f.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  f.set('shipping_options[0][shipping_rate_data][display_name]', env.BASKET_DELIVERY_LABEL || 'UK delivery');
  f.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(delivery));
  f.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'gbp');
  // what was ordered, for the CRM lead (Stripe metadata values are limited to 500 characters each)
  f.set('metadata[source]', 'business-signs-basket');
  priced.lines.slice(0, 40).forEach((l, i) => f.set(`metadata[item_${i + 1}]`, `${l.qty} × ${l.name}${l.desc ? ` (${l.desc})` : ''} @ £${l.each.toFixed(2)}`.slice(0, 500)));

  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST', headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: f,
  }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  if (!r || !r.ok || !j.url) { console.error('Stripe checkout failed', r && r.status, JSON.stringify(j.error || {}).slice(0, 500)); return json({ error: 'Sorry, checkout isn’t available just now. Please try again or call 01603 407786.' }, 502); }
  return json({ url: j.url });
}

// Stripe-Signature: t=…,v1=… — HMAC-SHA256 of "t.payload" with the webhook secret; rejected if older than 5 minutes.
async function verify(payload, header, secret) {
  const parts = Object.fromEntries(String(header || '').split(',').map((x) => x.split('=')).filter((x) => x.length === 2));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300 || !parts.v1) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
  const v1s = String(header).split(',').filter((x) => x.startsWith('v1=')).map((x) => x.slice(3));
  return v1s.some((v) => v.length === hex.length && [...v].reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}

export async function handleStripeWebhook(request, env = {}) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'Not configured' }, 503);
  const payload = await request.text();
  if (!(await verify(payload, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) return json({ error: 'Bad signature' }, 400);
  let ev; try { ev = JSON.parse(payload); } catch { return json({ error: 'Bad payload' }, 400); }
  if (ev.type !== 'checkout.session.completed') return json({ received: true });
  const s = ev.data?.object || {};
  if (s.metadata?.source !== 'business-signs-basket' || s.payment_status !== 'paid') return json({ received: true });
  const c = s.customer_details || {}, ship = s.shipping_details || s.collected_information?.shipping_details || {};
  const addr = (a) => (a ? [a.line1, a.line2, a.city, a.state, a.postal_code, a.country].filter(Boolean).join(', ') : '');
  const items = Object.keys(s.metadata).filter((k) => k.startsWith('item_')).sort((a, b) => +a.slice(5) - +b.slice(5)).map((k) => '- ' + s.metadata[k]);
  const name = c.name || ship.name || 'Website customer';
  const [first, ...rest] = name.split(/\s+/);
  const details = [
    `First name: ${first}`, rest.length ? `Last name: ${rest.join(' ')}` : '', `Email: ${c.email || ''}`, c.phone ? `Phone: ${c.phone}` : '',
    `Product: Business signs order (paid online)`,
    `\nMessage:\nPAID ONLINE: £${((s.amount_total || 0) / 100).toFixed(2)} inc VAT and delivery (Stripe ${s.payment_intent || s.id}).`,
    `\nItems:\n${items.join('\n')}`,
    ship.address ? `\nDeliver to: ${ship.name || name}, ${addr(ship.address)}` : '', c.address ? `Billing address: ${addr(c.address)}` : '',
    '\nNext step: ask for artwork and send a proof before production.',
  ].filter(Boolean).join('\n');
  const ok = await sendCrmLead({ subject: `Paid order: business signs (£${((s.amount_total || 0) / 100).toFixed(2)})`, details, email: c.email || '', name, page_url: '/basket/' });
  return ok ? json({ received: true }) : json({ error: 'CRM unavailable' }, 500); // 500 → Stripe retries
}
