// Local check without wrangler: runs worker/index.js in Node with dist/ as the ASSETS binding (drop-trailing-slash,
// 404 page) and the CRM's feeds stubbed out unless CRM=live. `node tools/test/serve.mjs [port]`, then open the site.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const ROOT = new URL('../..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.xml': 'application/xml', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf' };
const realFetch = globalThis.fetch;
const sent = [];
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.includes('inbound-webform-email')) { sent.push(JSON.parse(init.body)); return new Response('{"ok":true}', { status: 200 }); }
  if (url.includes('supabase.co') || url.includes('broadlanddigital.co.uk')) {
    if (process.env.CRM_FIXTURE && url.includes('seo-feed')) return new Response(readFileSync(process.env.CRM_FIXTURE), { status: 200 });
    return new Response('offline', { status: 503 });
  }
  return realFetch(input, init);
};
const file = (p) => { const f = join(DIST, p); return existsSync(f) && statSync(f).isFile() ? f : null; };
const ASSETS = { async fetch(req) {
  const u = new URL(req.url); const p = decodeURIComponent(u.pathname);
  // force-trailing-slash, as on Cloudflare: "/x" → "/x/", "/x/" → x/index.html
  if (!p.endsWith('/') && !file(p) && file(join(p, 'index.html'))) return new Response(null, { status: 307, headers: { Location: p + '/' + u.search } });
  const f = file(p) || (p.endsWith('/') ? file(join(p, 'index.html')) : null);
  if (f && !(p.endsWith('/index.html'))) return new Response(readFileSync(f), { headers: { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' } });
  return new Response(readFileSync(join(DIST, '404.html')), { status: 404, headers: { 'Content-Type': TYPES['.html'] } });
} };
const worker = (await import(join(ROOT, 'worker/index.js'))).default;
export { worker, ASSETS, sent };
const port = Number(process.argv[2] || 8787);
if ((process.argv[1] || '').endsWith('serve.mjs')) createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await worker.fetch(new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), { ASSETS, OLD_SITE_ORIGIN: 'https://broadlanddigital.co.uk' }, { waitUntil() {} });
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log('http://localhost:' + port));
