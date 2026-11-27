/**
 * POST /api/crm/booking → the CRM's booking-order-flow function (customer sign-in codes and the customer account on
 * /account/). The CRM only answers browsers on the business's own address, so the account widget calls this
 * same-site proxy instead (data-endpoint), which also lets it work on the preview address. Only this one function is
 * reachable; the customer's own access token (if any) is passed through unchanged.
 */
const TARGET = 'https://dipjypzrfigkzuarlsov.supabase.co/functions/v1/booking-order-flow';

export async function handleCrmBooking(request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return new Response('Not allowed', { status: 403 });
  const body = await request.text();
  if (body.length > 200000) return new Response('Too large', { status: 413 });
  const headers = { 'Content-Type': 'application/json', Origin: 'https://broadlanddigital.co.uk' };
  for (const h of ['apikey', 'authorization']) { const v = request.headers.get(h); if (v) headers[h] = v; }
  const ip = request.headers.get('cf-connecting-ip'); if (ip) headers['x-forwarded-for'] = ip;
  const r = await fetch(TARGET, { method: 'POST', headers, body }).catch(() => null);
  if (!r) return Response.json({ error: 'The account service did not respond. Please try again shortly.' }, { status: 502 });
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' } });
}
