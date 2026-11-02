// Broadland Digital cookie consent (replaces CookieYes). Loaded first in <head>.
//
// Nothing that sets non-essential cookies runs until the visitor agrees: tools/build.mjs turns those scripts into
// <script type="text/plain" data-bd-consent="analytics|functional"> and this file switches them on.
//   analytics  — Google Analytics, Google Ads, Linkbot
//   functional — the chat assistant and the reviews widget
// The choice is kept for a year (cookie "bd_consent"). Google Consent Mode v2 is told the same choice.
// The footer's "Cookie settings" link (or any element with data-bd-cookie-settings) opens the settings again.
(function () {
  var NAME = 'bd_consent', VERSION = 1, DAYS = 365;
  var CATS = [
    { id: 'analytics', name: 'Analytics & marketing', text: 'Google Analytics and Google Ads help us see how the site is used and which adverts bring people to it.' },
    { id: 'functional', name: 'Chat & reviews', text: 'The website chat assistant and our customer reviews widget, which are provided by other companies and may set their own cookies.' },
  ];

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', functionality_storage: 'granted', security_storage: 'granted', wait_for_update: 500 });
  gtag('set', 'ads_data_redaction', true);

  function read() {
    var m = document.cookie.match(/(?:^|;\s*)bd_consent=([^;]*)/);
    if (!m) return null;
    try { var v = JSON.parse(decodeURIComponent(m[1])); return v && v.v === VERSION ? v : null; } catch (e) { return null; }
  }
  function write(choice) {
    choice.v = VERSION; choice.at = new Date().toISOString();
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = NAME + '=' + encodeURIComponent(JSON.stringify(choice)) + '; Max-Age=' + DAYS * 86400 + '; Path=/; SameSite=Lax' + secure;
  }

  var enabled = {};
  function enable(cat) {
    if (enabled[cat]) return;
    enabled[cat] = true;
    if (cat === 'analytics') gtag('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' });
    // CRM site search (crm.racecargraphics.uk/embed/site-search.js): keeps its visitor ID between visits only with analytics consent
    if (cat === 'analytics') { window.__crmBotTracking = true; try { window.dispatchEvent(new CustomEvent('rcg-enquiry-bot-consent', { detail: { tracking: true } })); } catch (e) { /* old browser */ } }
    var list = document.querySelectorAll('script[type="text/plain"][data-bd-consent="' + cat + '"]');
    for (var i = 0; i < list.length; i++) {
      var old = list[i], s = document.createElement('script');
      for (var j = 0; j < old.attributes.length; j++) { var a = old.attributes[j]; if (a.name !== 'type' && a.name !== 'data-bd-consent') s.setAttribute(a.name, a.value); }
      if (old.src) { if (!old.hasAttribute('async')) s.async = false; } else s.text = old.text;
      old.parentNode.replaceChild(s, old);
    }
  }
  function apply(choice) { CATS.forEach(function (c) { if (choice[c.id]) enable(c.id); }); }

  var CSS = '.bdcc{position:fixed;left:20px;bottom:20px;z-index:2147483000;max-width:420px;background:#2a2d32;color:#fff;padding:26px 26px 22px;'
    + 'box-shadow:0 10px 40px rgba(0,0,0,.35);font:15px/1.55 azo-sans-web,Arial,sans-serif}'
    + '.bdcc h2{font:700 20px/1.2 azo-sans-web,Arial,sans-serif;margin:0 0 10px;color:#fff;letter-spacing:0}.bdcc p{margin:0 0 16px!important;color:#e6e6e8;font-size:15px!important;line-height:1.55!important;font-family:azo-sans-web,Arial,sans-serif}'
    + '.bdcc a{color:#fff;text-decoration:underline}.bdcc-btns{display:flex;flex-wrap:wrap;gap:10px}'
    + '.bdcc button{font:600 14px azo-sans-web,Arial,sans-serif;border-radius:24px;padding:9px 20px;cursor:pointer;border:2px solid #fff;background:transparent;color:#fff}'
    + '.bdcc button.bdcc-yes{background:#713fff;border-color:#713fff}.bdcc button:hover{opacity:.85}.bdcc button:focus-visible{outline:3px solid #b79cff;outline-offset:2px}'
    + '.bdcc-cats{margin:4px 0 16px;border-top:1px solid #ffffff33}.bdcc-cat{padding:12px 0;border-bottom:1px solid #ffffff33}'
    + '.bdcc-cat label{display:flex;justify-content:space-between;align-items:center;gap:12px;font-weight:700}.bdcc-cat small{display:block;line-height:1.5;color:#cfd0d4;font-size:13px;margin-top:4px}'
    + '.bdcc-cat input{width:20px;height:20px;accent-color:#713fff}.bdcc-always{font-size:12px;font-weight:400;color:#cfd0d4}'
    + '@media(max-width:520px){.bdcc{left:10px;right:10px;bottom:10px;max-width:none;padding:20px}}';

  var box;
  function close() { if (box) { box.remove(); box = null; } }
  function save(choice) {
    write(choice); apply(choice); close();
    if (!choice.analytics) { window.__crmBotTracking = false; try { window.dispatchEvent(new CustomEvent('rcg-enquiry-bot-consent', { detail: { tracking: false } })); } catch (e) { /* old browser */ } }
  }
  function show(settings) {
    close();
    var current = read() || {};
    if (!document.getElementById('bdcc-css')) { var st = document.createElement('style'); st.id = 'bdcc-css'; st.textContent = CSS; document.head.appendChild(st); }
    box = document.createElement('div');
    box.className = 'bdcc';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-labelledby', 'bdcc-title');
    box.innerHTML = '<h2 id="bdcc-title">We value your privacy</h2>'
      + '<p>We use essential cookies to make this site work. With your permission we would also like to use analytics and marketing cookies, and to load our chat assistant and reviews. See our <a href="/privacy-policy">privacy policy</a>.</p>'
      + (settings ? '<div class="bdcc-cats"><div class="bdcc-cat"><label>Essential <span class="bdcc-always">Always on</span></label><small>Needed for the site and its forms to work.</small></div>'
        + CATS.map(function (c) { return '<div class="bdcc-cat"><label for="bdcc-' + c.id + '">' + c.name + '<input type="checkbox" id="bdcc-' + c.id + '"' + (current[c.id] ? ' checked' : '') + '></label><small>' + c.text + '</small></div>'; }).join('') + '</div>' : '')
      + '<div class="bdcc-btns">' + (settings ? '<button type="button" class="bdcc-yes" data-a="save">Save my choices</button>' : '<button type="button" class="bdcc-yes" data-a="all">Accept all</button>')
      + '<button type="button" data-a="none">Reject all</button>' + (settings ? '' : '<button type="button" data-a="settings">Settings</button>') + '</div>';
    box.addEventListener('click', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-a');
      if (a === 'all') save({ analytics: true, functional: true });
      else if (a === 'none') { var had = read(); save({ analytics: false, functional: false }); if (had && (had.analytics || had.functional)) location.reload(); }
      else if (a === 'settings') show(true);
      else if (a === 'save') {
        var c = {}; CATS.forEach(function (x) { c[x.id] = !!box.querySelector('#bdcc-' + x.id).checked; });
        var prev = read(); save(c);
        if (prev && CATS.some(function (x) { return prev[x.id] && !c[x.id]; })) location.reload();
      }
    });
    document.body.appendChild(box);
    var first = box.querySelector('button'); if (first) first.focus({ preventScroll: true });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-bd-cookie-settings], a[href="#cookie-settings"]');
    if (t) { e.preventDefault(); show(true); }
  });
  function start() { var c = read(); if (c) apply(c); else show(false); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
