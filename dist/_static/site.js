// Broadland Digital — menu, gallery lightbox and enquiry forms (posted to the worker's /api/forms, which files them in
// the CRM as Broadland Digital leads).
(function () {
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  // Gallery: opens the full-size picture over the page.
  var box;
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.gallery a');
    if (!a) return;
    e.preventDefault();
    if (!box) {
      box = document.createElement('div');
      box.className = 'lightbox';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.innerHTML = '<button type="button">Close</button><img alt="">';
      box.addEventListener('click', function (ev) { if (ev.target === box || ev.target.tagName === 'BUTTON') box.classList.remove('open'); });
      document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') box.classList.remove('open'); });
      document.body.appendChild(box);
    }
    var img = box.querySelector('img');
    img.src = a.href;
    img.alt = (a.querySelector('img') || {}).alt || '';
    box.classList.add('open');
    box.querySelector('button').focus();
  });

  // Forms
  document.querySelectorAll('form[data-enquiry]').forEach(function (form) {
    var status = form.querySelector('.form-status');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type=submit]');
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = String(v); });
      data.page_url = location.href;
      data.page_title = document.title;
      btn.disabled = true;
      status.className = 'form-status';
      status.textContent = 'Sending…';
      fetch('/api/forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j.error || 'Your message could not be sent.');
          if (form.dataset.next) { location.href = form.dataset.next; return; }
          form.reset();
          status.className = 'form-status ok';
          status.textContent = res.j.message || 'Thank you, your message has been sent. We will be in touch shortly.';
        })
        .catch(function (err) {
          status.className = 'form-status err';
          status.textContent = err.message + ' Please call 01603 407786.';
        })
        .then(function () { btn.disabled = false; });
    });
  });
})();
