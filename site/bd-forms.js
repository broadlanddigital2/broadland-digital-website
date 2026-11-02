// Broadland Digital: sends the theme's forms (Contact Form 7 markup, kept for its look) to /api/forms, which files them
// in the CRM as Broadland Digital leads. Also: product "Enquire now" buttons fill in the enquiry form below them.
(function () {
  var FIELDS = { 'your-name': 'name', 'your-email': 'email', 'your-phone': 'phone', 'your-message': 'message' };

  function setStatus(form, ok, text) {
    var out = form.querySelector('.wpcf7-response-output');
    form.classList.remove('init', 'sent', 'invalid', 'failed', 'submitting');
    form.classList.add(ok ? 'sent' : 'invalid');
    if (out) { out.textContent = text; out.setAttribute('aria-hidden', 'false'); out.setAttribute('role', 'status'); }
  }

  function tip(input, text) {
    var wrap = input.closest('.wpcf7-form-control-wrap') || input.parentNode;
    var t = wrap.querySelector('.wpcf7-not-valid-tip');
    if (!text) { if (t) t.remove(); input.classList.remove('wpcf7-not-valid'); input.setAttribute('aria-invalid', 'false'); return; }
    if (!t) { t = document.createElement('span'); t.className = 'wpcf7-not-valid-tip'; t.setAttribute('aria-hidden', 'true'); wrap.appendChild(t); }
    t.textContent = text;
    input.classList.add('wpcf7-not-valid');
    input.setAttribute('aria-invalid', 'true');
  }

  document.querySelectorAll('form[data-bd-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = { form: form.getAttribute('data-bd-form'), page_url: location.href, page_title: document.title };
      var bad = false;
      form.querySelectorAll('input, textarea, select').forEach(function (el) {
        if (!el.name || el.type === 'submit') return;
        var name = el.name.replace(/\[\]$/, '');
        if (el.type === 'checkbox') {
          if (/consent/.test(name)) { if (el.checked) data.marketing = 'yes'; return; }
          // the "agree to our terms" box on the contact form is required
          if (el.closest('.wpcf7-validates-as-required') && !el.checked) { tip(el, 'Please tick to agree.'); bad = true; } else { tip(el, ''); data.consent = 'yes'; }
          return;
        }
        var v = el.value.trim();
        if (el.getAttribute('aria-required') === 'true' && !v) { tip(el, 'Please fill out this field.'); bad = true; return; }
        if (el.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { tip(el, 'Please enter an email address.'); bad = true; return; }
        tip(el, '');
        data[FIELDS[name] || name] = v;
      });
      if (form.dataset.product) data.product = form.dataset.product;
      if (bad) { setStatus(form, false, 'One or more fields have an error. Please check and try again.'); return; }
      var btn = form.querySelector('[type=submit]');
      if (btn) btn.disabled = true;
      form.classList.add('submitting');
      fetch('/api/forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j.error || 'There was an error trying to send your message.');
          if (form.dataset.next) { location.href = form.dataset.next; return; }
          form.reset();
          delete form.dataset.product;
          setStatus(form, true, res.j.message || 'Thank you for your message. We will be in contact shortly.');
        })
        .catch(function (err) { setStatus(form, false, err.message + ' Please try again later or call 01603 407786.'); })
        .then(function () { if (btn) btn.disabled = false; form.classList.remove('submitting'); });
    });
  });

  // "Enquire now" on product pages: scroll to the enquiry form with the product noted.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-enquire]');
    if (!a) return;
    var box = document.querySelector('#wpcf7-f21-o1 form') || document.querySelector('form[data-bd-form]');
    if (!box) return;
    e.preventDefault();
    box.dataset.product = a.getAttribute('data-enquire');
    var msg = box.querySelector('textarea');
    if (msg && !msg.value) msg.value = 'I would like to order: ' + a.getAttribute('data-enquire') + '\n';
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var first = box.querySelector('input[type=text], input:not([type])');
    if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 600);
  });

  // ?product=… in the address (links from elsewhere) does the same.
  var q = new URLSearchParams(location.search).get('product');
  if (q) { var f = document.querySelector('form[data-bd-form]'); if (f) { f.dataset.product = q; var t = f.querySelector('textarea'); if (t) t.value = 'I would like to order: ' + q + '\n'; } }
})();
