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
