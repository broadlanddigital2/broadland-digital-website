// Business signs product configurator (tools/business-signs.mjs). Keeps the "Enquire with these options" link's
// data-enquire up to date, which bd-forms.js puts into the enquiry form (product + message), and shows a running
// total when the product has a price (data-price, ex VAT) and options have add-on prices (data-add on a select).
(function () {
  document.querySelectorAll('.bds-config').forEach(function (form) {
    var btn = form.querySelector('[data-enquire]');
    var name = form.getAttribute('data-name');
    var base = parseFloat(form.getAttribute('data-price'));
    var totalWrap = form.querySelector('.bds-total');
    var total = totalWrap && totalWrap.querySelector('b');
    function update() {
      var parts = [], add = 0;
      form.querySelectorAll('[data-label]').forEach(function (el) {
        var v = String(el.value || '').trim();
        var hint = el.parentNode.querySelector('.bds-hint');
        if (el.type === 'number' && el.name !== 'qty') {
          var n = parseFloat(v), lo = parseFloat(el.min), hi = parseFloat(el.max);
          var bad = v !== '' && (isNaN(n) || n < lo || n > hi);
          el.setAttribute('aria-invalid', bad ? 'true' : 'false');
          if (hint) hint.classList.toggle('bad', bad);
          if (v === '' || bad) return;
          v += 'mm';
        }
        if (!v) return;
        parts.push(el.getAttribute('data-label') + ': ' + v);
        var map = el.getAttribute('data-add');
        if (map) { try { var m = JSON.parse(map); if (m[el.value]) add += Number(m[el.value]); } catch (e) {} }
      });
      btn.setAttribute('data-enquire', name + (parts.length ? ' (' + parts.join(', ') + ')' : ''));
      if (!isNaN(base) && total) {
        var q = Math.max(1, parseInt((form.querySelector('[name="qty"]') || {}).value, 10) || 1);
        total.textContent = '£' + ((base + add) * q).toFixed(2);
        totalWrap.hidden = false;
      }
    }
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.addEventListener('submit', function (e) { e.preventDefault(); btn.click(); });
    update();
  });
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
