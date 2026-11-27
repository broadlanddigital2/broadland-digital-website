// Business signs product configurator (tools/business-signs.mjs). Keeps the "Enquire with these options" link's
// data-enquire up to date (bd-forms.js puts it into the enquiry form) and works out the price live, ex VAT:
//   size-priced products (data-size): fixed + £/m² × area + £/m × perimeter, never below the minimum, per choice of
//   the "priced by" dropdown; otherwise data-price ("from"). Add-ons from each dropdown (data-add) are added per item.
//   Quantity discounts (data-qty-breaks: [[qty, %], …]) take % off each item from that quantity.
(function () {
  var gbp = function (n) { return '£' + n.toFixed(2); };
  document.querySelectorAll('.bds-config').forEach(function (form) {
    var btn = form.querySelector('[data-enquire]');
    var name = form.getAttribute('data-name');
    var base = parseFloat(form.getAttribute('data-price'));
    var size = null, breaks = [];
    try { size = JSON.parse(form.getAttribute('data-size') || 'null'); } catch (e) {}
    try { breaks = JSON.parse(form.getAttribute('data-qty-breaks') || '[]'); } catch (e) {}
    var qtyEl = form.querySelector('[name="qty"]');
    var out = {
      total: form.querySelector('[data-total]'), inc: form.querySelector('[data-inc]'), each: form.querySelector('[data-each]'),
      save: form.querySelector('[data-save]'), note: form.querySelector('[data-note]'), box: form.querySelector('.bdp-summary'),
      live: document.querySelectorAll('[data-live-price]')
    };
    form.querySelectorAll('[data-qty]').forEach(function (b) {
      b.addEventListener('click', function () { qtyEl.value = Math.max(1, (parseInt(qtyEl.value, 10) || 1) + Number(b.getAttribute('data-qty'))); update(); });
    });
    function update() {
      var parts = [], add = 0, w = null, h = null, sizeOk = true, byValue = null;
      form.querySelectorAll('[data-label]').forEach(function (el) {
        var v = String(el.value || '').trim();
        var hint = el.parentNode.querySelector('.bds-hint');
        if (el.type === 'number' && el.name !== 'qty') {
          var n = parseFloat(v), lo = parseFloat(el.min), hi = parseFloat(el.max);
          var bad = v !== '' && (isNaN(n) || n < lo || n > hi);
          el.setAttribute('aria-invalid', bad ? 'true' : 'false');
          if (hint) hint.classList.toggle('bad', bad);
          if (v === '' || bad) { if (el.getAttribute('data-dim')) sizeOk = false; return; }
          if (el.getAttribute('data-dim') === 'w') w = n;
          if (el.getAttribute('data-dim') === 'h') h = n;
          v += 'mm';
        }
        if (!v) return;
        parts.push(el.getAttribute('data-label') + ': ' + v);
        if (size && size.by && el.getAttribute('data-label') === size.by) byValue = el.value;
        var map = el.getAttribute('data-add');
        if (map) { try { var m = JSON.parse(map); if (m[el.value]) add += Number(m[el.value]); } catch (e) {} }
      });
      btn.setAttribute('data-enquire', name + (parts.length ? ' (' + parts.join(', ') + ')' : ''));
      var q = Math.max(1, parseInt(qtyEl && qtyEl.value, 10) || 1);
      var unit = isNaN(base) ? null : base, exact = true;
      if (size) {
        var row = size.rows[byValue] || size.rows['*'] || size.rows[Object.keys(size.rows)[0]];
        if (row && w && h && sizeOk) {
          var A = (w / 1000) * (h / 1000), P = 2 * (w + h) / 1000;
          unit = Math.max(row[3] || 0, row[0] + row[1] * A + row[2] * P);
        } else { exact = false; if (row) unit = row[3] || unit; }
      }
      if (unit === null || !out.total) return;
      var pct = 0; breaks.forEach(function (b) { if (q >= b[0]) pct = b[1]; });
      var each = unit * (1 - pct / 100) + add, total = each * q;
      out.box.hidden = false;
      out.total.textContent = (exact ? '' : 'From ') + gbp(total);
      if (out.inc) out.inc.textContent = '(' + gbp(total * 1.2) + ' inc VAT)';
      if (out.each) out.each.textContent = q > 1 ? gbp(each) + ' each' : '';
      if (out.save) { out.save.hidden = !pct; out.save.textContent = pct ? 'You save ' + Math.round(pct) + '% on ' + q : ''; }
      if (out.note) out.note.textContent = size && !exact ? 'Enter your size for an exact price' : '';
      out.live.forEach(function (el) { el.textContent = (exact ? '' : 'From ') + gbp(total); });
    }
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.addEventListener('submit', function (e) { e.preventDefault(); btn.click(); });
    update();
  });
})();

// Page menu: sticks just under the site header (which becomes fixed once you scroll), highlights the section you're
// reading, shows reading progress, and reveals the price + Configure button once the buy box is out of view.
(function () {
  var nav = document.querySelector('[data-bdp-nav]');
  var header = document.getElementById('masthead');
  var root = document.documentElement;
  function offset() {
    var top = 0;
    if (header) { var cs = getComputedStyle(header); if (cs.position === 'fixed' || cs.position === 'sticky') top = Math.max(0, header.getBoundingClientRect().bottom); }
    root.style.setProperty('--bdp-top', top + 'px');
    return top;
  }
  if (!nav) { offset(); return; }
  var links = [].slice.call(nav.querySelectorAll('.bdp-nav-links a'));
  var secs = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
  var bar = nav.querySelector('.bdp-progress');
  var buy = document.getElementById('configure');
  var ticking = false;
  function onScroll() {
    ticking = false;
    var top = offset(), navH = nav.offsetHeight, y = top + navH + 24;
    var r = nav.getBoundingClientRect();
    nav.classList.toggle('is-stuck', r.top <= top + 1);
    if (buy) nav.classList.toggle('show-buy', buy.getBoundingClientRect().bottom < top);
    var cur = -1;
    secs.forEach(function (s, i) { if (s && s.getBoundingClientRect().top <= y) cur = i; });
    links.forEach(function (a, i) { a.classList.toggle('is-on', i === cur); if (i === cur) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    if (cur >= 0 && links[cur]) { var lr = links[cur].getBoundingClientRect(), pr = links[cur].parentNode.getBoundingClientRect(); if (lr.left < pr.left || lr.right > pr.right) links[cur].parentNode.scrollLeft += lr.left - pr.left - 16; }
    var first = secs[0], last = secs[secs.length - 1];
    if (bar && first && last) { var start = first.offsetTop - y, end = last.offsetTop + last.offsetHeight - window.innerHeight; bar.style.transform = 'scaleX(' + Math.min(1, Math.max(0, (window.scrollY - start) / Math.max(1, end - start))) + ')'; }
  }
  function req() { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }
  window.addEventListener('scroll', req, { passive: true });
  window.addEventListener('resize', req);
  links.concat([].slice.call(document.querySelectorAll('a[href="#configure"]'))).forEach(function (a) {
    a.addEventListener('click', function (e) {
      var t = document.getElementById(a.getAttribute('href').slice(1)); if (!t) return;
      e.preventDefault();
      var y = t.getBoundingClientRect().top + window.scrollY - offset() - nav.offsetHeight - 12;
      window.scrollTo({ top: y, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      history.replaceState(null, '', a.getAttribute('href'));
    });
  });
  onScroll();
})();

// Sections fade up as they come into view (skipped for people who prefer reduced motion).
(function () {
  var els = document.querySelectorAll('.bdp-reveal');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { els.forEach(function (e) { e.classList.add('is-in'); }); return; }
  document.documentElement.classList.add('bdp-anim');
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
  els.forEach(function (e) { io.observe(e); });
})();

// Product gallery: a thumbnail shows its photo as the main one; the main photo opens a full-size viewer with
// previous / next (arrow keys), and Escape or a click outside the photo closes it.
(function () {
  document.querySelectorAll('[data-gallery]').forEach(function (g) {
    var zoom = g.querySelector('[data-zoom]');
    var main = zoom && zoom.querySelector('img');
    var btns = [].slice.call(g.querySelectorAll('.bds-thumb-btn'));
    var photos = btns.length ? btns.map(function (b) { return { src: b.getAttribute('data-src'), alt: b.getAttribute('data-alt') }; })
      : main ? [{ src: zoom.getAttribute('href'), alt: main.alt }] : [];
    var at = 0;
    function show(i) {
      at = (i + photos.length) % photos.length;
      main.src = photos[at].src; main.alt = photos[at].alt; zoom.href = photos[at].src;
      zoom.setAttribute('aria-label', 'Enlarge photo: ' + photos[at].alt);
      btns.forEach(function (b, n) { b.classList.toggle('is-on', n === at); if (n === at) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    }
    btns.forEach(function (b, n) { b.addEventListener('click', function () { show(n); }); });
    if (!zoom || !photos.length) return;

    var box, img, count, last;
    function build() {
      box = document.createElement('div');
      box.className = 'bds-lightbox'; box.hidden = true;
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Photo viewer');
      box.innerHTML = '<img alt=""><button type="button" class="bds-lb-close" aria-label="Close">×</button>'
        + (photos.length > 1 ? '<button type="button" class="bds-lb-prev" aria-label="Previous photo">‹</button><button type="button" class="bds-lb-next" aria-label="Next photo">›</button><span class="bds-lb-count"></span>' : '');
      document.body.appendChild(box);
      img = box.querySelector('img'); count = box.querySelector('.bds-lb-count');
      box.querySelector('.bds-lb-close').addEventListener('click', close);
      if (photos.length > 1) {
        box.querySelector('.bds-lb-prev').addEventListener('click', function () { step(-1); });
        box.querySelector('.bds-lb-next').addEventListener('click', function () { step(1); });
      }
      box.addEventListener('click', function (e) { if (e.target === box) close(); });
      box.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft') step(-1);
        else if (e.key === 'ArrowRight') step(1);
      });
    }
    function paint() { img.src = photos[at].src; img.alt = photos[at].alt; if (count) count.textContent = (at + 1) + ' / ' + photos.length; }
    function step(d) { if (photos.length < 2) return; show(at + d); paint(); }
    function open(e) {
      e.preventDefault();
      if (!box) build();
      last = document.activeElement; paint(); box.hidden = false;
      document.documentElement.style.overflow = 'hidden';
      box.querySelector('.bds-lb-close').focus();
    }
    function close() { box.hidden = true; document.documentElement.style.overflow = ''; if (last) last.focus(); }
    zoom.addEventListener('click', open);
  });
})();

// Sign builder: visitors upload a logo (or a logo plus text) and see a preview drawn in the product's material on a
// matching wall, building, pavement or window. A name and email are asked for first (sent to the CRM as a
// "Sign builder" lead through /api/forms); the logo never leaves the visitor's browser.
(function () {
  var opener = document.querySelector('[data-builder]');
  if (!opener) return;
  var cfg = {}; try { cfg = JSON.parse(opener.getAttribute('data-builder')); } catch (e) {}
  var OPENED = Date.now(), HUMAN = 0;
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, function (e) { if (e.isTrusted) HUMAN = 1; }, { passive: true, capture: true }); });
  var KEY = 'bdsb-lead';
  var lead = null; try { lead = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  var box = document.createElement('div');
  box.className = 'bdsb'; box.hidden = true;
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'bdsb-title');
  box.innerHTML =
    '<div class="bdsb-panel">' +
    '<button type="button" class="bdsb-close" aria-label="Close">×</button>' +
    '<div class="bdsb-gate"><span class="bdp-kicker">Sign builder</span><h2 id="bdsb-title">See your logo as a ' + esc(cfg.product || 'sign') + '</h2>' +
    '<p>Tell us who you are and we\'ll open the builder. We\'ll use these details to follow up on your design, nothing else.</p>' +
    '<form class="bdsb-form" novalidate><label>Name<input name="name" autocomplete="name" required></label><label>Email<input name="email" type="email" autocomplete="email" required></label>' +
    '<label>Phone <small>(optional)</small><input name="phone" type="tel" autocomplete="tel"></label><input name="website" class="bdsb-hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
    '<p class="bdsb-err" role="alert"></p><button class="bds-btn bds-btn--lg" type="submit">Open the builder</button></form></div>' +
    '<div class="bdsb-app" hidden><div class="bdsb-stage"><canvas width="1600" height="1000" aria-label="Preview of your sign"></canvas><p class="bdsb-empty">Upload your logo to see your sign</p></div>' +
    '<div class="bdsb-tools"><div class="bdsb-tabs" role="tablist"><button type="button" role="tab" aria-selected="true" data-mode="logo">Logo</button><button type="button" role="tab" aria-selected="false" data-mode="text">Logo + text</button></div>' +
    '<label class="bdsb-drop"><input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden><b>Upload your logo</b><small>PNG with a transparent background works best (JPG, SVG and WebP too)</small></label>' +
    '<label class="bdsb-check"><input type="checkbox" data-knock checked> Remove white background</label>' +
    '<div class="bdsb-text" hidden><label>Main text<input data-t1 maxlength="40" placeholder="Your business name"></label><label>Second line<input data-t2 maxlength="60" placeholder="e.g. Solicitors · Est. 1998"></label>' +
    '<div class="bdsb-row"><label>Font<select data-font><option value="sans">Modern</option><option value="serif">Classic</option><option value="slab">Bold slab</option><option value="script">Script</option></select></label>' +
    '<label>Colour<input type="color" data-col value="#1d1d24"></label><label>Layout<select data-layout><option value="left">Logo left</option><option value="top">Logo above</option></select></label></div></div>' +
    '<p class="bdsb-actions"><button type="button" class="bds-btn" data-send>Send me a quote for this</button><button type="button" class="bds-btn bds-btn--ghost" data-dl>Download image</button></p>' +
    '<p class="bdsb-note">A guide to how your sign could look. We\'ll send a proper proof before anything is made.</p></div></div></div>';
  document.body.appendChild(box);
  var $ = function (s) { return box.querySelector(s); };
  var canvas = $('canvas'), ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  var logo = null, mode = 'logo', last = null;

  function open() { box.hidden = false; document.documentElement.style.overflow = 'hidden'; show(); last = document.activeElement; setTimeout(function () { (lead ? $('.bdsb-drop') : $('[name=name]')).focus(); }, 30); }
  function close() { box.hidden = true; document.documentElement.style.overflow = ''; if (last) last.focus(); }
  function show() { $('.bdsb-gate').hidden = !!lead; $('.bdsb-app').hidden = !lead; if (lead) draw(); }
  opener.addEventListener('click', open);
  $('.bdsb-close').addEventListener('click', close);
  box.addEventListener('click', function (e) { if (e.target === box) close(); });
  box.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  function send(extra) {
    var d = { form: 'builder', name: lead.name, email: lead.email, phone: lead.phone || '', product: cfg.product, page_url: location.href, page_title: document.title,
      message: extra, elapsed: Date.now() - OPENED, human: HUMAN, website: '' };
    return fetch('/api/forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); });
  }
  $('.bdsb-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, err = $('.bdsb-err');
    var v = { name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim() };
    if (f.website.value) return;
    if (v.name.length < 2) { err.textContent = 'Please tell us your name.'; f.name.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) { err.textContent = 'Please enter a valid email address.'; f.email.focus(); return; }
    err.textContent = ''; lead = v;
    send('Opened the sign builder for ' + cfg.product + '.').then(function (r) {
      if (!r.ok) { lead = null; err.textContent = (r.j && r.j.error) || 'Sorry, something went wrong. Please try again.'; return; }
      try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (x) {}
      show();
    }).catch(function () { lead = null; err.textContent = 'We couldn\'t reach our server. Please try again.'; });
  });

  // ---- inputs ----
  box.querySelectorAll('[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () { mode = b.getAttribute('data-mode'); box.querySelectorAll('[data-mode]').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); }); $('.bdsb-text').hidden = mode !== 'text'; draw(); });
  });
  $('.bdsb-drop input').addEventListener('change', function (e) {
    var file = e.target.files[0]; if (!file) return;
    var img = new Image(); img.onload = function () { logo = img; draw(); }; img.src = URL.createObjectURL(file);
    $('.bdsb-drop b').textContent = file.name;
  });
  box.querySelectorAll('.bdsb-tools input, .bdsb-tools select').forEach(function (el) { el.addEventListener('input', draw); el.addEventListener('change', draw); });

  // ---- artwork: the logo (white knocked out if asked) and, in text mode, the text, laid out on a transparent canvas ----
  var FONTS = { sans: '700 {s}px azo-sans-web, Helvetica, Arial, sans-serif', serif: '700 {s}px Georgia, "Times New Roman", serif', slab: '800 {s}px Adelle, Rockwell, Georgia, serif', script: 'italic 700 {s}px "Brush Script MT", "Segoe Script", cursive' };
  function artwork() {
    var t1 = mode === 'text' ? $('[data-t1]').value.trim() : '', t2 = mode === 'text' ? $('[data-t2]').value.trim() : '';
    if (!logo && !t1 && !t2) return null;
    var col = $('[data-col]').value, font = FONTS[$('[data-font]').value], layout = $('[data-layout]').value;
    var L = null;
    if (logo) {
      var s = Math.min(1, 900 / Math.max(logo.naturalWidth || 900, logo.naturalHeight || 900));
      var lw = Math.max(1, Math.round((logo.naturalWidth || 900) * s)), lh = Math.max(1, Math.round((logo.naturalHeight || 900) * s));
      L = document.createElement('canvas'); L.width = lw; L.height = lh;
      var lc = L.getContext('2d'); lc.drawImage(logo, 0, 0, lw, lh);
      if ($('[data-knock]').checked) { try { var id = lc.getImageData(0, 0, lw, lh), px = id.data; for (var i = 0; i < px.length; i += 4) { var m = Math.min(px[i], px[i + 1], px[i + 2]); if (m > 235) px[i + 3] = 0; else if (m > 210) px[i + 3] = Math.round(px[i + 3] * (235 - m) / 25); } lc.putImageData(id, 0, 0); } catch (e) {} }
    }
    var A = document.createElement('canvas'), a = A.getContext('2d');
    var s1 = 150, s2 = 64, gap = 40;
    a.font = font.replace('{s}', s1); var w1 = t1 ? a.measureText(t1).width : 0;
    a.font = font.replace('{s}', s2); var w2 = t2 ? a.measureText(t2).width : 0;
    var tw = Math.max(w1, w2), th = (t1 ? s1 : 0) + (t2 ? s2 + 20 : 0);
    var lh2 = L ? (tw ? (layout === 'top' ? 360 : Math.max(th, 300)) : 600) : 0, lw2 = L ? L.width * (lh2 / L.height) : 0;
    if (layout === 'top' || !L || !tw) { A.width = Math.ceil(Math.max(lw2, tw) + 40); A.height = Math.ceil(lh2 + (L && tw ? gap : 0) + th + 40); }
    else { A.width = Math.ceil(lw2 + gap + tw + 40); A.height = Math.ceil(Math.max(lh2, th) + 40); }
    a = A.getContext('2d'); a.textBaseline = 'top'; a.fillStyle = col;
    var x = 20, y = 20;
    if (L) { var lx = (layout === 'top' || !tw) ? (A.width - lw2) / 2 : x, ly = (layout === 'top' || !tw) ? y : (A.height - lh2) / 2; a.drawImage(L, lx, ly, lw2, lh2); }
    if (tw) {
      var tx = (layout === 'top' || !L) ? (A.width - tw) / 2 : x + lw2 + gap, ty = (layout === 'top' && L) ? y + lh2 + gap : (A.height - th) / 2;
      a.textAlign = 'left';
      if (t1) { a.font = font.replace('{s}', s1); a.fillText(t1, tx + (layout === 'top' || !L ? (tw - w1) / 2 : 0), ty); }
      if (t2) { a.font = font.replace('{s}', s2); a.globalAlpha = .85; a.fillText(t2, tx + (layout === 'top' || !L ? (tw - w2) / 2 : 0), ty + (t1 ? s1 + 20 : 0)); a.globalAlpha = 1; }
    }
    return A;
  }

  // ---- scenes ----
  function noise(alpha) { var g = ctx.createImageData(W, H); for (var i = 0; i < g.data.length; i += 4) { var v = Math.random() * 255; g.data[i] = g.data[i + 1] = g.data[i + 2] = v; g.data[i + 3] = alpha; } var c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').putImageData(g, 0, 0); ctx.drawImage(c, 0, 0); }
  function wall(top, bottom) { var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(1, bottom); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  function spot(x, y, r, a) { var g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,248,235,' + a + ')'); g.addColorStop(1, 'rgba(255,248,235,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  function bricks(y0, y1, night) {
    var bw = 120, bh = 40;
    for (var y = y0, row = 0; y < y1; y += bh, row++) for (var x = -((row % 2) * bw / 2); x < W; x += bw) {
      var r = 150 + Math.random() * 40, gg = 70 + Math.random() * 25, b = 55 + Math.random() * 20, k = night ? .35 : 1;
      ctx.fillStyle = 'rgb(' + (r * k | 0) + ',' + (gg * k | 0) + ',' + (b * k | 0) + ')'; ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
    }
  }
  function scene() {
    var sc = cfg.scene;
    if (sc === 'brick' || sc === 'night') { ctx.fillStyle = sc === 'night' ? '#2a2420' : '#d9d2c9'; ctx.fillRect(0, 0, W, H); bricks(0, H * .86, sc === 'night'); ctx.fillStyle = sc === 'night' ? '#1b1b20' : '#9a9a9e'; ctx.fillRect(0, H * .86, W, H); if (sc === 'night') { ctx.fillStyle = 'rgba(10,12,30,.45)'; ctx.fillRect(0, 0, W, H); } }
    else if (sc === 'outdoor') { wall('#bcd7ef', '#eaf2f8'); ctx.fillStyle = '#7d8a6a'; ctx.fillRect(0, H * .62, W, H * .1); bricks(H * .3, H * .62, false); ctx.fillStyle = '#8d8f94'; ctx.fillRect(0, H * .72, W, H); for (var i = 0; i < W; i += 220) { ctx.fillStyle = '#f2f2f2'; ctx.fillRect(i, H * .86, 120, 10); } }
    else if (sc === 'pavement') { ctx.fillStyle = '#25303b'; ctx.fillRect(0, 0, W, H * .12); var g = ctx.createLinearGradient(0, H * .12, 0, H * .58); g.addColorStop(0, '#5a7488'); g.addColorStop(1, '#9fb4c3'); ctx.fillStyle = g; ctx.fillRect(0, H * .12, W, H * .46); ctx.fillStyle = '#2e2e33'; for (var j = 0; j < W; j += 400) ctx.fillRect(j, H * .12, 14, H * .46); ctx.fillStyle = '#b9b4ac'; ctx.fillRect(0, H * .58, W, H); ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 3; for (var y = H * .58; y < H; y += 70) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } for (var x = 0; x < W; x += 140) { ctx.beginPath(); ctx.moveTo(x, H * .58); ctx.lineTo(x - 60, H); ctx.stroke(); } }
    else if (sc === 'window') { ctx.fillStyle = '#26282d'; ctx.fillRect(0, 0, W, H); var gw = ctx.createLinearGradient(0, 0, W, H); gw.addColorStop(0, '#41505c'); gw.addColorStop(.5, '#6f8796'); gw.addColorStop(1, '#3b4650'); ctx.fillStyle = gw; ctx.fillRect(80, 70, W - 160, H - 180); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.moveTo(300, 70); ctx.lineTo(620, 70); ctx.lineTo(260, H - 110); ctx.lineTo(-60, H - 110); ctx.fill(); }
    else if (sc === 'floor') { ctx.fillStyle = '#d8d2c8'; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 3; for (var k = -20; k < 30; k++) { ctx.beginPath(); ctx.moveTo(W / 2 + k * 60, 0); ctx.lineTo(W / 2 + k * 160, H); ctx.stroke(); } for (var yy = 0; yy < H; yy += 40 + yy * .12) { ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke(); } }
    else { wall('#ece7df', '#dcd5ca'); spot(W / 2, -80, 900, .55); ctx.fillStyle = '#b9ab98'; ctx.fillRect(0, H * .88, W, H); ctx.fillStyle = '#f5f2ec'; ctx.fillRect(0, H * .875, W, 16); }
    noise(sc === 'window' ? 6 : 10);
  }

  // ---- sign ----
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function fillFor(m, x, y, w, h) {
    if (m === 'black') { var g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#2b2b30'); g.addColorStop(1, '#0d0d10'); return g; }
    if (m === 'metal' || m === 'gold') { var g2 = ctx.createLinearGradient(x, y, x + w, y + h); var c = m === 'gold' ? ['#a8843a', '#f0d68b', '#b8923f', '#e9cf86'] : ['#9ea3a8', '#eef0f2', '#a9aeb3', '#dfe2e5']; c.forEach(function (cc, i) { g2.addColorStop(i / 3, cc); }); return g2; }
    if (m === 'wood') { var g3 = ctx.createLinearGradient(x, y, x, y + h); g3.addColorStop(0, '#b98a5a'); g3.addColorStop(.5, '#a6764a'); g3.addColorStop(1, '#c39566'); return g3; }
    if (m === 'slate') return '#3b3f45';
    if (m === 'glitter') return '#c8a24a';
    if (m === 'lit') return '#ffffff';
    if (m === 'clear') return 'rgba(255,255,255,.16)';
    return '#fbfbfb';
  }
  function texture(m, x, y, w, h) {
    ctx.save(); rr(x, y, w, h, 6); ctx.clip();
    if (m === 'metal' || m === 'gold') { ctx.globalAlpha = .08; for (var i = 0; i < h; i += 2) { ctx.fillStyle = Math.random() > .5 ? '#fff' : '#000'; ctx.fillRect(x, y + i, w, 1); } }
    if (m === 'wood') { ctx.globalAlpha = .12; ctx.strokeStyle = '#5a3a1c'; for (var j = 0; j < 40; j++) { ctx.beginPath(); var yy = y + Math.random() * h; ctx.moveTo(x, yy); ctx.bezierCurveTo(x + w * .3, yy + 10, x + w * .6, yy - 10, x + w, yy + 4); ctx.stroke(); } }
    if (m === 'slate' || m === 'glitter') { ctx.globalAlpha = m === 'glitter' ? .5 : .15; for (var k = 0; k < 3000; k++) { ctx.fillStyle = m === 'glitter' ? (Math.random() > .5 ? '#fff6c8' : '#7a5a10') : '#fff'; ctx.fillRect(x + Math.random() * w, y + Math.random() * h, 2, 2); } }
    ctx.restore();
  }
  function standoffs(x, y, w, h) { [[x + 34, y + 34], [x + w - 34, y + 34], [x + 34, y + h - 34], [x + w - 34, y + h - 34]].forEach(function (p) { var g = ctx.createRadialGradient(p[0] - 5, p[1] - 5, 2, p[0], p[1], 18); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#8e949a'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], 16, 0, 7); ctx.fill(); }); }
  function place(art, maxW, maxH) { var s = Math.min(maxW / art.width, maxH / art.height); return { w: art.width * s, h: art.height * s }; }
  function panel(art, cx, cy, maxW, maxH, opt) {
    opt = opt || {};
    var m = cfg.material, a = place(art, maxW * .78, maxH * .7), w = Math.min(maxW, a.w / .78), h = Math.min(maxH, Math.max(a.h / .7, w * .32));
    if (opt.fill) { w = maxW; h = maxH; a = place(art, w * .82, h * .62); }
    var x = cx - w / 2, y = cy - h / 2;
    ctx.save(); ctx.shadowColor = m === 'lit' ? 'rgba(255,240,200,.9)' : 'rgba(0,0,0,.35)'; ctx.shadowBlur = m === 'lit' ? 90 : 40; ctx.shadowOffsetY = m === 'lit' ? 0 : 18; ctx.shadowOffsetX = m === 'lit' ? 0 : 8;
    rr(x, y, w, h, opt.r == null ? 6 : opt.r); ctx.fillStyle = fillFor(m, x, y, w, h); ctx.fill(); ctx.restore();
    texture(m, x, y, w, h);
    if (m === 'clear') { ctx.save(); ctx.globalAlpha = .35; ctx.drawImage(art, cx - a.w / 2 + 10, cy - a.h / 2 + 16, a.w, a.h); ctx.restore(); ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.restore(); }
    ctx.save(); if (m === 'black' || m === 'slate') ctx.filter = 'none'; ctx.drawImage(art, cx - a.w / 2, cy - a.h / 2, a.w, a.h); ctx.restore();
    var hl = ctx.createLinearGradient(x, y, x + w, y + h); hl.addColorStop(0, 'rgba(255,255,255,.35)'); hl.addColorStop(.35, 'rgba(255,255,255,0)'); hl.addColorStop(1, 'rgba(255,255,255,.08)');
    if (m !== 'wood' && m !== 'slate') { ctx.fillStyle = hl; rr(x, y, w, h, 6); ctx.fill(); }
    ctx.strokeStyle = m === 'clear' ? 'rgba(255,255,255,.75)' : 'rgba(0,0,0,.12)'; ctx.lineWidth = m === 'clear' ? 4 : 2; rr(x, y, w, h, 6); ctx.stroke();
    if (opt.standoffs !== false && ['clear', 'white', 'black', 'metal', 'gold', 'glitter'].indexOf(m) > -1) standoffs(x, y, w, h);
    return { x: x, y: y, w: w, h: h };
  }
  function letters(art, cx, cy, maxW, maxH) {
    var a = place(art, maxW, maxH), x = cx - a.w / 2, y = cy - a.h / 2, lit = cfg.material === 'lit' || cfg.scene === 'night';
    var dark = document.createElement('canvas'); dark.width = art.width; dark.height = art.height; var dc = dark.getContext('2d'); dc.drawImage(art, 0, 0); dc.globalCompositeOperation = 'source-atop'; dc.fillStyle = lit ? 'rgba(255,240,200,.9)' : 'rgba(0,0,0,.55)'; dc.fillRect(0, 0, dark.width, dark.height);
    ctx.save(); if (lit) { ctx.shadowColor = 'rgba(255,236,190,1)'; ctx.shadowBlur = 70; ctx.drawImage(dark, x, y, a.w, a.h); }
    else { ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 26; ctx.shadowOffsetX = 14; ctx.shadowOffsetY = 18; ctx.drawImage(dark, x + 6, y + 6, a.w, a.h); }
    ctx.restore();
    for (var i = 8; i > 0; i--) ctx.drawImage(dark, x + i * .9, y + i * .9, a.w, a.h);
    ctx.drawImage(art, x, y, a.w, a.h);
  }
  function draw() {
    if (box.hidden || !lead) return;
    ctx.clearRect(0, 0, W, H); scene();
    var art = artwork(); $('.bdsb-empty').hidden = !!art;
    if (!art) return;
    var sh = cfg.shape;
    if (sh === 'letters') letters(art, W / 2, H * .42, W * .62, H * .42);
    else if (sh === 'wall') { ctx.save(); ctx.globalAlpha = .92; ctx.globalCompositeOperation = 'multiply'; var a = place(art, W * .6, H * .5); ctx.drawImage(art, W / 2 - a.w / 2, H * .42 - a.h / 2, a.w, a.h); ctx.restore(); }
    else if (sh === 'window') { ctx.save(); ctx.globalAlpha = .95; var b = place(art, W * .6, H * .5); ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 6; ctx.drawImage(art, W / 2 - b.w / 2, H * .45 - b.h / 2, b.w, b.h); ctx.restore(); }
    else if (sh === 'floor') { ctx.save(); ctx.translate(W / 2, H * .6); ctx.transform(1, 0, -0.35, .45, 0, 0); var c = place(art, W * .55, H * .9); panel(art, 0, 0, c.w / .78, c.h / .7, { standoffs: false, r: 30 }); ctx.restore(); }
    else if (sh === 'hanging') { ctx.fillStyle = '#1d1d22'; ctx.fillRect(W * .2, H * .2, 26, 90); ctx.fillRect(W * .2, H * .24, W * .38, 16); [W * .32, W * .54].forEach(function (x) { ctx.fillRect(x, H * .26, 4, 50); }); var p = panel(art, W * .43, H * .26 + 50 + 170, W * .3, 340, { standoffs: false }); }
    else if (sh === 'aboard' || sh === 'aboard-chalk') { var cx = W / 2, top = H * .3, bw = 460, bh = 640; ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 20; ctx.fillStyle = cfg.material === 'wood' ? '#8a5e34' : '#1f2125'; ctx.beginPath(); ctx.moveTo(cx - bw / 2 + 30, top); ctx.lineTo(cx + bw / 2 - 30, top); ctx.lineTo(cx + bw / 2, top + bh); ctx.lineTo(cx - bw / 2, top + bh); ctx.closePath(); ctx.fill(); ctx.restore(); var save = cfg.material; if (sh === 'aboard-chalk') cfg.material = 'slate'; panel(art, cx, top + bh * .5, bw - 90, bh - 120, { standoffs: false, r: 2, fill: true }); cfg.material = save; }
    else if (sh === 'post' || sh === 'totem') { ctx.fillStyle = '#6c7177'; var px = W / 2; if (sh === 'post') { ctx.fillRect(px - 260, H * .2, 20, H * .66); ctx.fillRect(px + 240, H * .2, 20, H * .66); panel(art, px, H * .34, 640, 380, { standoffs: false, r: 4, fill: true }); } else { panel(art, px, H * .5, 380, 760, { standoffs: false, r: 18, fill: true }); } }
    else if (sh === 'banner' || sh === 'barrier') { var q = panel(art, W / 2, H * .42, W * .7, H * .4, { standoffs: false, r: 0 }); ctx.fillStyle = '#c9ccd1'; [[q.x + 16, q.y + 16], [q.x + q.w - 16, q.y + 16], [q.x + 16, q.y + q.h - 16], [q.x + q.w - 16, q.y + q.h - 16]].forEach(function (pp) { ctx.beginPath(); ctx.arc(pp[0], pp[1], 9, 0, 7); ctx.fill(); }); }
    else if (sh === 'roller') { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 30; ctx.fillStyle = '#fff'; ctx.fillRect(W / 2 - 220, H * .08, 440, H * .8); ctx.restore(); ctx.fillStyle = '#9aa0a6'; ctx.fillRect(W / 2 - 240, H * .87, 480, 22); var r2 = place(art, 380, 600); ctx.drawImage(art, W / 2 - r2.w / 2, H * .44 - r2.h / 2, r2.w, r2.h); }
    else panel(art, W / 2, H * .42, W * .62, H * .5);
  }
  $('[data-dl]').addEventListener('click', function () { var a = document.createElement('a'); a.download = (cfg.product || 'sign').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-preview.png'; a.href = canvas.toDataURL('image/png'); a.click(); });
  $('[data-send]').addEventListener('click', function () {
    var b = this; b.disabled = true; b.textContent = 'Sending…';
    var cfgForm = document.querySelector('[data-enquire]');
    var msg = 'Sign builder design for ' + cfg.product + (mode === 'text' ? ' with text "' + $('[data-t1]').value + '" / "' + $('[data-t2]').value + '"' : ' (logo)') + '. Options chosen: ' + ((cfgForm && cfgForm.getAttribute('data-enquire')) || cfg.product) + '. Please send a quote; the customer will email their logo file.';
    send(msg).then(function (r) { b.textContent = r.ok ? 'Sent – we\'ll be in touch' : 'Try again'; b.disabled = !r.ok ? false : true; }).catch(function () { b.textContent = 'Try again'; b.disabled = false; });
  });
})();

// Scrolling card rows (Where to use it): arrows move one card at a time and grey out at either end.
(function () {
  document.querySelectorAll('.bdp-scroll').forEach(function (row) {
    var wrap = row.closest('section'); if (!wrap) return;
    var btns = wrap.querySelectorAll('[data-scroll]');
    function step() { var li = row.querySelector('li'); return li ? li.getBoundingClientRect().width + 18 : row.clientWidth * .8; }
    function state() {
      var max = row.scrollWidth - row.clientWidth - 2;
      btns.forEach(function (b) { var d = Number(b.getAttribute('data-scroll')); b.disabled = d < 0 ? row.scrollLeft <= 2 : row.scrollLeft >= max; });
      wrap.querySelector('.bdp-arrows').hidden = row.scrollWidth <= row.clientWidth + 2;
    }
    btns.forEach(function (b) { b.addEventListener('click', function () { row.scrollBy({ left: step() * Number(b.getAttribute('data-scroll')), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }); });
    row.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); row.scrollBy({ left: step() * (e.key === 'ArrowRight' ? 1 : -1) }); } });
    row.addEventListener('scroll', function () { requestAnimationFrame(state); }, { passive: true });
    window.addEventListener('resize', state);
    state();
  });
})();

/* FAQs: one open at a time (fallback for browsers without <details name>) */
(() => {
  document.querySelectorAll('.bdp-faqs, .bds .bdhub-faqs').forEach((box) => {
    box.addEventListener('toggle', (e) => {
      const d = e.target;
      if (d.tagName !== 'DETAILS' || !d.open) return;
      box.querySelectorAll('details[open]').forEach((o) => { if (o !== d) o.open = false; });
    }, true);
  });
})();
