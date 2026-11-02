/**
 * POST /api/forms — every form on the site (contact, quote, guide download, product order) goes into the CRM as a
 * Broadland Digital lead (Sales → Leads, source "Website"). The CRM's inbound-webform-email function files it with the
 * "Broadland Digital Web Forms" channel's public key and emails enquiries@broadlanddigital.co.uk, so no mail service
 * is needed here.
 */
const CRM_FORMS_URL = 'https://dipjypzrfigkzuarlsov.supabase.co/functions/v1/inbound-webform-email';
const FORM_KEY = 'b7d1a0c4-5e2f-4c8b-9a61-3f0d2e7b4c19'; // channel_integrations.public_key, Broadland Digital Web Forms

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const clean = (v, max) => String(v ?? '').replace(/\0/g, '').replace(/\r/g, '').trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const SUBJECTS = {
  contact: (d) => `Website enquiry: ${d.where}`,
  quote: (d) => `Quote request${d.service ? ': ' + d.service : ''}`,
  guide: () => 'Vehicle graphics guide download',
  order: (d) => `Website order enquiry: ${d.product || d.where}`,
};

export async function handleForms(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  // Only the site's own pages may post (stops the form being used from elsewhere).
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'Not allowed' }, 403);
  let b;
  try { b = await request.json(); } catch { return json({ error: 'Something went wrong with the form.' }, 400); }
  if (clean(b.website, 200)) return json({ ok: true }); // honeypot filled in: a bot, quietly ignored

  const d = {
    kind: SUBJECTS[b.form] ? b.form : 'contact',
    name: clean(b.name, 120), email: clean(b.email, 254).toLowerCase(), phone: clean(b.phone, 40),
    service: clean(b.service, 120), product: clean(b.product, 200), message: clean(b.message, 6000),
    pageUrl: clean(b.page_url, 500), pageTitle: clean(b.page_title, 200).replace(/\s*\|\s*Broadland Digital$/i, ''),
    marketing: b.marketing === 'yes', consent: b.consent === 'yes',
  };
  d.where = d.pageTitle || 'Website';
  if (!d.name) return json({ error: 'Please enter your name.' }, 400);
  if (!EMAIL.test(d.email)) return json({ error: 'Please enter a valid email address.' }, 400);
  if (d.kind !== 'guide' && !d.phone && !d.message) return json({ error: 'Please add a phone number or a message.' }, 400);

  const [first, ...rest] = d.name.split(/\s+/);
  const details = [
    `First name: ${first}`, rest.length ? `Last name: ${rest.join(' ')}` : '',
    `Email: ${d.email}`, d.phone ? `Phone: ${d.phone}` : '',
    d.service ? `Service: ${d.service}` : '', d.product ? `Product: ${d.product}` : '',
    d.kind === 'guide' ? `Keep me up to date on news and offers: ${d.marketing ? 'Yes' : 'No'}` : '',
    d.message ? `\nMessage:\n${d.message}` : '',
    `\nSent from: ${d.pageTitle || 'website'}${d.pageUrl ? ' (' + d.pageUrl + ')' : ''}`,
  ].filter(Boolean).join('\n');

  const r = await fetch(CRM_FORMS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ form_key: FORM_KEY, subject: SUBJECTS[d.kind](d), details, email: d.email, name: d.name, page_url: d.pageUrl }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
  if (!r.ok) {
    console.error('CRM lead not created', r.status, (await r.text().catch(() => '')).slice(0, 500));
    return json({ error: 'Sorry, your message could not be sent just now.' }, 502);
  }
  const message = d.kind === 'quote' ? 'Thank you for your quote request. We will be in contact shortly to discuss it.'
    : d.kind === 'guide' ? 'Thank you. We will email you a link to the guide shortly.'
    : 'Thank you, your message has been sent. We will be in touch shortly.';
  return json({ ok: true, message });
}
