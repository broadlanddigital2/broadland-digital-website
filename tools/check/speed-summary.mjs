// Summarises Lighthouse JSON files in a folder: score, key timings, page weight and the biggest opportunities.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2];
const ms = (v) => (v == null ? '–' : v >= 1000 ? (v / 1000).toFixed(1) + 's' : Math.round(v) + 'ms');
const kb = (v) => Math.round((v || 0) / 1024) + ' KB';
const out = ['| Page | Device | Score | FCP | LCP | TBT | CLS | Weight | Requests |', '|---|---|---|---|---|---|---|---|---|'];
const notes = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  let j; try { j = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
  const a = j.audits || {};
  const dev = f.endsWith('-desktop.json') ? 'desktop' : 'mobile';
  out.push(`| ${j.finalDisplayedUrl || j.requestedUrl} | ${dev} | ${Math.round((j.categories?.performance?.score || 0) * 100)} | ${ms(a['first-contentful-paint']?.numericValue)} | ${ms(a['largest-contentful-paint']?.numericValue)} | ${ms(a['total-blocking-time']?.numericValue)} | ${(a['cumulative-layout-shift']?.numericValue ?? 0).toFixed(2)} | ${kb(a['total-byte-weight']?.numericValue)} | ${a['network-requests']?.details?.items?.length ?? '–'} |`);
  if (dev === 'mobile') {
    const opp = Object.values(a).filter((x) => x.details?.type === 'opportunity' && (x.details.overallSavingsMs || 0) > 150).sort((x, y) => y.details.overallSavingsMs - x.details.overallSavingsMs).slice(0, 5);
    const lcpEl = a['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node?.snippet || '';
    const big = (a['total-byte-weight']?.details?.items || []).slice(0, 6).map((i) => `${kb(i.totalBytes)} ${i.url}`);
    const blocking = (a['render-blocking-resources']?.details?.items || []).map((i) => `${ms(i.wastedMs)} ${i.url}`);
    const tp = (a['third-party-summary']?.details?.items || []).slice(0, 6).map((i) => `${ms(i.blockingTime)} blocking, ${kb(i.transferSize)} ${i.entity?.text || i.entity}`);
    notes.push(`\n### ${j.finalDisplayedUrl || j.requestedUrl} (mobile)\nLCP element: \`${lcpEl.slice(0, 200)}\`\nOpportunities: ${opp.map((x) => `${x.title} (${ms(x.details.overallSavingsMs)})`).join('; ') || 'none'}\nRender-blocking:\n${blocking.map((b) => '- ' + b).join('\n') || '- none'}\nHeaviest files:\n${big.map((b) => '- ' + b).join('\n')}\nThird parties:\n${tp.map((b) => '- ' + b).join('\n') || '- none'}`);
  }
}
console.log(out.join('\n') + '\n' + notes.join('\n'));
