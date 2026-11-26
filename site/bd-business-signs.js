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
