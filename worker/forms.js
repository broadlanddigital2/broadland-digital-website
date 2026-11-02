/**
 * POST /api/forms — every form on the site (contact, quote, guide download, product order) goes into the CRM as a
 * Broadland Digital lead (Sales → Leads, source "Website"). The CRM's inbound-webform-email function files it with the
 * "Broadland Digital Web Forms" channel's public key and emails enquiries@broadlanddigital.co.uk.
 *
 * Boxly (until the CRM's Meta app is approved): each enquiry is also emailed to the Boxly inbox (BOXLY_EMAIL in
 * wrangler.jsonc) through SendGrid (secret SENDGRID_API_KEY), in the same format the old Contact Form 7 email used,
 * so Boxly keeps creating its leads. Remove BOXLY_EMAIL to stop.
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

export async function handleForms(request, env = {}) {
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
  // Same checks as the page (site/bd-forms.js); "field" tells the page which field to mark.
  const bad = (field, error) => json({ error, field }, 400);
  if (d.name.length < 2) return bad('name', 'Please tell us your name.');
  if (!EMAIL.test(d.email)) return bad('email', 'That email address doesn’t look right — please check it.');
  const digits = d.phone.replace(/\D/g, '');
  if (d.kind !== 'guide' && !d.phone) return bad('phone', 'Please enter a phone number so we can call you back.');
  if (d.phone && (/[a-z]/i.test(d.phone) || digits.length < 10 || digits.length > 13)) return bad('phone', 'Please enter a full UK phone number, e.g. 01603 407786.');

  const [first, ...rest] = d.name.split(/\s+/);
  const details = [
    `First name: ${first}`, rest.length ? `Last name: ${rest.join(' ')}` : '',
    `Email: ${d.email}`, d.phone ? `Phone: ${d.phone}` : '',
    d.service ? `Service: ${d.service}` : '', d.product ? `Product: ${d.product}` : '',
    d.kind === 'guide' ? `Keep me up to date on news and offers: ${d.marketing ? 'Yes' : 'No'}` : '',
    d.message ? `\nMessage:\n${d.message}` : '',
    `\nSent from: ${d.pageTitle || 'website'}${d.pageUrl ? ' (' + d.pageUrl + ')' : ''}`,
  ].filter(Boolean).join('\n');

  const [crm, boxly] = await Promise.all([
    fetch(CRM_FORMS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form_key: FORM_KEY, subject: SUBJECTS[d.kind](d), details, email: d.email, name: d.name, page_url: d.pageUrl }),
    }).then(async (r) => { if (!r.ok) console.error('CRM lead not created', r.status, (await r.text().catch(() => '')).slice(0, 500)); return r.ok; })
      .catch((e) => { console.error('CRM lead not created', String(e)); return false; }),
    sendToBoxly(env, d),
  ]);
  // The enquiry is safe if either the CRM or Boxly has it.
  if (!crm && !boxly) return json({ error: 'Sorry, your message could not be sent just now.' }, 502);
  const message = d.kind === 'quote' ? 'Thank you for your quote request. We will be in contact shortly to discuss it.'
    : d.kind === 'guide' ? 'Thank you. We will email you a link to the guide shortly.'
    : 'Thank you, your message has been sent. We will be in touch shortly.';
  return json({ ok: true, message });
}

// The old site's Contact Form 7 email to Boxly, field for field ("From: name <email>", "Contact No:", "Message Body:"),
// sent from enquiries@broadlanddigital.co.uk with the customer as Reply-To.
async function sendToBoxly(env, d) {
  const to = String(env.BOXLY_EMAIL || '').trim();
  if (!to) return false;
  if (!env.SENDGRID_API_KEY) { console.error('Boxly copy not sent: SENDGRID_API_KEY is not set on the worker'); return false; }
  const extra = [d.service ? `Service: ${d.service}` : '', d.product ? `Product: ${d.product}` : '', d.pageUrl ? `Page: ${d.pageUrl}` : ''].filter(Boolean).join('\n');
  const text = `From: ${d.name} <${d.email}>\nContact No: ${d.phone}\nSubject: New Enquiry from ${d.name}\n\nMessage Body:\n${d.message || SUBJECTS[d.kind](d)}${extra ? '\n\n' + extra : ''}\n`;
  try {
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: env.BOXLY_FROM_EMAIL || 'enquiries@broadlanddigital.co.uk', name: 'Broadland Digital' },
        reply_to: { email: d.email, name: d.name },
        subject: `New Enquiry from ${d.name}`,
        content: [{ type: 'text/plain', value: text }],
      }),
    });
    if (!r.ok) console.error('Boxly copy not sent', r.status, (await r.text().catch(() => '')).slice(0, 500));
    return r.ok;
  } catch (e) {
    console.error('Boxly copy not sent', String(e));
    return false;
  }
}
