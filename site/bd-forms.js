// Broadland Digital forms → /api/forms → a lead in the CRM (and a copy to Boxly; see worker/forms.js).
//   .bdf-form           the footer's enquiry form (labels, an error under each field, a summary, a thank-you panel)
//   form[data-bd-form]  the theme's own forms on pages (quote, guide, product enquiry), Contact Form 7 markup kept
// Errors show when a field is left, and again on sending; once shown they update as the visitor types.
(function () {
  var PHONE = '01603 407786';
  var NAMES = { 'your-name': 'name', 'your-email': 'email', 'your-phone': 'phone', 'your-message': 'message' };
  var LABELS = { name: 'Name', email: 'Email', phone: 'Phone', message: 'Message' };

  function digits(v) { return String(v).replace(/[^\d]/g, ''); }
  function check(name, v, required) {
    v = String(v || '').trim();
    if (name === 'name') { if (!v) return 'Please tell us your name.'; if (v.length < 2) return 'Please enter your full name.'; }
    if (name === 'email') {
      if (!v) return required === false ? '' : 'Please enter your email address so we can reply.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'That email address doesn’t look right — please check it (e.g. name@company.co.uk).';
    }
    if (name === 'phone') {
      if (!v) return required ? 'Please enter a phone number so we can call you back.' : '';
      var d = digits(v);
      if (/[a-z]/i.test(v) || d.length < 10 || d.length > 13) return 'Please enter a full UK phone number, e.g. 01603 407786 or 07700 900123.';
    }
    if (name === 'message' && v.length > 6000) return 'Please keep your message under 6,000 characters.';
    return '';
  }

  function send(data) {
    return fetch('/api/forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .catch(function () { return { ok: false, j: { error: 'We couldn’t reach our server. Please check your connection and try again.' } }; });
  }

  // ---------- Footer form ----------
  document.querySelectorAll('.bdf-form').forEach(function (form) {
    var wrap = form.closest('.bdf-wrap');
    var summary = form.querySelector('.bdf-summary');
    var btn = form.querySelector('.bdf-send');
    var label = btn.querySelector('.bdf-label');
    var fields = ['name', 'email', 'phone', 'message'].map(function (n) { return form.querySelector('[name="' + n + '"]'); }).filter(Boolean);
    var shown = {};

    function show(input, msg) {
      var err = document.getElementById(input.getAttribute('aria-describedby').split(' ')[0]);
      err.textContent = msg || '';
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
    function validate(input) { var m = check(input.name, input.value, input.required); show(input, m); return m; }

    fields.forEach(function (input) {
      input.addEventListener('blur', function () { if (input.value.trim() || shown[input.name]) { shown[input.name] = true; validate(input); } });
      input.addEventListener('input', function () { if (shown[input.name]) validate(input); if (!form.querySelector('[aria-invalid="true"]')) summary.textContent = ''; });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = [];
      fields.forEach(function (input) { shown[input.name] = true; if (validate(input)) bad.push(input); });
      if (bad.length) {
        summary.innerHTML = (bad.length === 1 ? 'Please check this field: ' : 'Please check these ' + bad.length + ' fields: ')
          + bad.map(function (i) { return '<a href="#' + i.id + '">' + LABELS[i.name] + '</a>'; }).join(', ') + '.';
        bad[0].focus();
        return;
      }
      summary.textContent = '';
      var data = { form: form.getAttribute('data-bd-form') || 'contact', page_url: location.href, page_title: document.title };
      new FormData(form).forEach(function (v, k) { data[k] = String(v); });
      if (form.dataset.product) data.product = form.dataset.product;
      btn.disabled = true; form.classList.add('sending'); label.textContent = 'Sending…';
      send(data).then(function (res) {
        btn.disabled = false; form.classList.remove('sending'); label.textContent = 'Send enquiry';
        if (res.ok) {
          var first = (data.name || '').split(' ')[0];
          wrap.querySelector('.bdf-done-name').textContent = first ? ', ' + first : '';
          wrap.classList.add('done');
          form.reset(); delete form.dataset.product; shown = {};
          var done = wrap.querySelector('.bdf-done'); done.setAttribute('tabindex', '-1'); done.focus();
          return;
        }
        var j = res.j || {};
        var target = j.field && form.querySelector('[name="' + j.field + '"]');
        if (target) { show(target, j.error); target.focus(); summary.textContent = ''; }
        else summary.innerHTML = (j.error || 'Sorry, your message could not be sent just now.') + ' Please try again, or call us on <a href="tel:' + PHONE.replace(/\s/g, '') + '">' + PHONE + '</a>.';
      });
    });
    var again = wrap.querySelector('.bdf-again');
    if (again) again.addEventListener('click', function () { wrap.classList.remove('done'); fields[0].focus(); });
  });

  // ---------- The theme's forms on pages ----------
  function tip(input, text) {
    var wrap = input.closest('.wpcf7-form-control-wrap') || input.parentNode;
    var t = wrap.querySelector('.wpcf7-not-valid-tip');
    if (!text) { if (t) t.remove(); input.classList.remove('wpcf7-not-valid'); input.setAttribute('aria-invalid', 'false'); return; }
    if (!t) { t = document.createElement('span'); t.className = 'wpcf7-not-valid-tip'; t.id = (input.name || 'f') + '-err-' + Math.random().toString(36).slice(2, 7); wrap.appendChild(t); input.setAttribute('aria-describedby', t.id); }
    t.textContent = text;
    input.classList.add('wpcf7-not-valid');
    input.setAttribute('aria-invalid', 'true');
  }
  function setStatus(form, ok, html) {
    var out = form.querySelector('.wpcf7-response-output');
    form.classList.remove('init', 'sent', 'invalid', 'failed', 'submitting');
    form.classList.add(ok ? 'sent' : 'invalid');
    if (out) { out.innerHTML = html; out.setAttribute('aria-hidden', 'false'); out.setAttribute('role', ok ? 'status' : 'alert'); }
  }
  document.querySelectorAll('form[data-bd-form]:not(.bdf-form)').forEach(function (form) {
    form.querySelectorAll('input, textarea').forEach(function (el) {
      var n = NAMES[(el.name || '').replace(/\[\]$/, '')];
      if (!n) return;
      el.addEventListener('blur', function () { if (el.value.trim()) tip(el, check(n, el.value, el.getAttribute('aria-required') === 'true')); });
      el.addEventListener('input', function () { if (el.getAttribute('aria-invalid') === 'true') tip(el, check(n, el.value, el.getAttribute('aria-required') === 'true')); });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = { form: form.getAttribute('data-bd-form'), page_url: location.href, page_title: document.title };
      var bad = [];
      form.querySelectorAll('input, textarea, select').forEach(function (el) {
        if (!el.name || el.type === 'submit' || el.type === 'hidden') return;
        var name = el.name.replace(/\[\]$/, '');
        if (el.type === 'checkbox') {
          if (/consent/.test(name)) { if (el.checked) data.marketing = 'yes'; return; }
          if (el.closest('.wpcf7-validates-as-required') && !el.checked) { tip(el, 'Please tick this box to continue.'); bad.push(el); } else { tip(el, ''); data.consent = 'yes'; }
          return;
        }
        var key = NAMES[name] || name;
        var msg = NAMES[name] ? check(key, el.value, el.getAttribute('aria-required') === 'true') : '';
        tip(el, msg);
        if (msg) bad.push(el); else data[key] = el.value.trim();
      });
      if (form.dataset.product) data.product = form.dataset.product;
      if (bad.length) { setStatus(form, false, 'Please check the ' + (bad.length === 1 ? 'highlighted field' : bad.length + ' highlighted fields') + ' and try again.'); bad[0].focus(); return; }
      var btn = form.querySelector('[type=submit]');
      if (btn) btn.disabled = true;
      form.classList.add('submitting');
      send(data).then(function (res) {
        if (btn) btn.disabled = false; form.classList.remove('submitting');
        if (res.ok) {
          if (form.dataset.next) { location.href = form.dataset.next; return; }
          form.reset(); delete form.dataset.product;
          setStatus(form, true, res.j.message || 'Thank you for your message. We will be in contact shortly.');
          return;
        }
        var j = res.j || {}, el = j.field && form.querySelector('[name="your-' + j.field + '"]');
        if (el) { tip(el, j.error); el.focus(); setStatus(form, false, 'Please check the highlighted field and try again.'); }
        else setStatus(form, false, (j.error || 'Sorry, your message could not be sent just now.') + ' Please try again, or call us on <a href="tel:' + PHONE.replace(/\s/g, '') + '">' + PHONE + '</a>.');
      });
    });
  });

  // "Enquire now" on product pages: the footer form, with the product noted.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-enquire]');
    if (!a) return;
    var box = document.querySelector('.bdf-form') || document.querySelector('form[data-bd-form]');
    if (!box) return;
    e.preventDefault();
    var wrap = box.closest('.bdf-wrap'); if (wrap) wrap.classList.remove('done');
    box.dataset.product = a.getAttribute('data-enquire');
    var msg = box.querySelector('textarea');
    if (msg && !msg.value) msg.value = 'I would like to order: ' + a.getAttribute('data-enquire') + '\n';
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var first = box.querySelector('input:not([type=hidden]):not([tabindex="-1"])');
    if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 600);
  });

  // ?product=… in the address does the same.
  var q = new URLSearchParams(location.search).get('product');
  if (q) { var f = document.querySelector('.bdf-form') || document.querySelector('form[data-bd-form]'); if (f) { f.dataset.product = q; var t = f.querySelector('textarea'); if (t) t.value = 'I would like to order: ' + q + '\n'; } }
})();
