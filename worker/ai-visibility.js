// AI visibility stats for the CRM (Marketing → SEO tracking → AI assistants). Shared by the Race Car Graphics,
// Auto Opulence and LeMan Cave workers: keep the copies the same.
//
// For each request it notes, in the background (never slowing or changing the response):
//  - a crawler visit, when the user agent is a known AI or search crawler (GPTBot, OAI-SearchBot, ClaudeBot, Bingbot…),
//    with the page, the response status and whether Cloudflare confirmed it really is that crawler;
//  - a person sent by an AI assistant, when a page is opened from ChatGPT, Claude, Perplexity, Gemini, Copilot… (the
//    referring site, or ChatGPT's ?utm_source=chatgpt.com tag on its links).
// Both go to the CRM's seo_ai_crawler_hit function with the site's SEO feed key (the same public key as the blog feed).

const RPC = "https://dipjypzrfigkzuarlsov.supabase.co/rest/v1/rpc/seo_ai_crawler_hit";
const KEY = "sb_publishable_KLK1Ucd9ilVSwzSGL1vkug_3SGGh4NF"; // the CRM's public (publishable) API key

// Most specific first: ChatGPT-User and OAI-SearchBot before GPTBot, and so on.
const CRAWLERS = [
  [/OAI-SearchBot/i, "OAI-SearchBot"], [/ChatGPT-User/i, "ChatGPT-User"], [/GPTBot/i, "GPTBot"],
  [/Claude-SearchBot/i, "Claude-SearchBot"], [/Claude-User/i, "Claude-User"], [/ClaudeBot|anthropic-ai/i, "ClaudeBot"],
  [/Perplexity-User/i, "Perplexity-User"], [/PerplexityBot/i, "PerplexityBot"],
  [/Google-Extended/i, "Google-Extended"], [/Googlebot|Google-InspectionTool|GoogleOther/i, "Googlebot"],
  [/bingbot|BingPreview/i, "Bingbot"], [/Applebot/i, "Applebot"], [/meta-externalagent|meta-externalfetcher/i, "Meta-ExternalAgent"],
  [/Amazonbot/i, "Amazonbot"], [/DuckAssistBot/i, "DuckAssistBot"], [/MistralAI-User/i, "MistralAI-User"],
  [/CCBot/i, "CCBot"], [/Bytespider/i, "Bytespider"],
];
const ASSISTANT_HOSTS = [
  [/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/, "ChatGPT"], [/(^|\.)claude\.ai$/, "Claude"], [/(^|\.)perplexity\.ai$/, "Perplexity"],
  [/^gemini\.google\.com$|^bard\.google\.com$/, "Gemini"], [/^copilot\.microsoft\.com$|^copilot\.cloud\.microsoft$|^m365\.cloud\.microsoft$/, "Copilot"],
  [/(^|\.)meta\.ai$/, "Meta AI"], [/(^|\.)deepseek\.com$/, "DeepSeek"], [/(^|\.)grok\.com$/, "Grok"], [/^chat\.mistral\.ai$/, "Le Chat"],
  [/^duck\.ai$/, "DuckDuckGo AI"],
];
const UTM = [[/chatgpt|openai/i, "ChatGPT"], [/claude|anthropic/i, "Claude"], [/perplexity/i, "Perplexity"], [/gemini/i, "Gemini"],
  [/copilot/i, "Copilot"], [/meta\.ai/i, "Meta AI"], [/deepseek/i, "DeepSeek"], [/grok/i, "Grok"], [/mistral/i, "Le Chat"]];

export function crawlerName(ua) {
  for (const [re, name] of CRAWLERS) if (re.test(ua || "")) return name;
  return null;
}
export function assistantName(request, url) {
  const utm = url.searchParams.get("utm_source") || "";
  if (utm) for (const [re, name] of UTM) if (re.test(utm)) return name;
  try {
    const ref = new URL(request.headers.get("referer") || "");
    if (ref.host !== url.host) for (const [re, name] of ASSISTANT_HOSTS) if (re.test(ref.hostname)) return name;
  } catch { /* no referrer */ }
  return null;
}

/**
 * Call after building the response. feedKey: the site's seo_sites.feed_key. ctx: the fetch handler's context.
 * Skips the workers.dev preview unless countPreview is set (LeMan Cave counts its preview until go-live).
 */
export function trackAi(request, response, ctx, { feedKey, countPreview = false }) {
  try {
    if (!ctx || !feedKey || !["GET", "HEAD"].includes(request.method)) return;
    const url = new URL(request.url);
    if (!countPreview && url.hostname.endsWith(".workers.dev")) return;
    if (/^\/(_static|_next|api|media|responsive|images)\//.test(url.pathname)) return;
    const ua = request.headers.get("user-agent") || "";
    const crawler = crawlerName(ua);
    let hit = null;
    if (crawler) {
      const cf = request.cf || {};
      const verified = !!(cf.verifiedBotCategory || (cf.botManagement && cf.botManagement.verifiedBot));
      hit = { crawler, path: url.pathname, status: response.status, verified };
    } else if (response.status < 400 && (response.headers.get("content-type") || "").includes("text/html") && !/bot|crawl|spider|preview/i.test(ua)) {
      const assistant = assistantName(request, url);
      if (assistant) hit = { assistant, path: url.pathname };
    }
    if (!hit) return;
    ctx.waitUntil(fetch(RPC, {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key: feedKey, p_hits: [hit] }),
    }).catch(() => { /* stats only */ }));
  } catch { /* never affects the page */ }
}
