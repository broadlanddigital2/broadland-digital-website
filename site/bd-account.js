// Customer sign-in (/login/), account (/account/) and checkout (/checkout/), styled like the Race Car Graphics pages.
// Sign-in uses the CRM's emailed 6-digit codes (booking-order-flow, through the same-site proxy /api/crm/booking);
// the session is stored as "crm-booking-session", the key the CRM's account widget reads, so /account/ shows it.
(function () {
  var API = '/api/crm/booking', APIKEY = 'sb_publishable_KLK1Ucd9ilVSwzSGL1vkug_3SGGh4NF', AUTH = 'https://dipjypzrfigkzuarlsov.supabase.co/auth/v1/';
  var BIZ = 'bc08f82c-908c-4ecb-8ae5-4cc5b6a4de7c', KEY = 'crm-booking-session';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var gbp = function (p) { return '£' + (p / 100).toFixed(2); };
  function getSession() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function setSession(s) {
    try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) {}
    window.dispatchEvent(new CustomEvent('crm-session-change', { detail: { signedIn: !!s } }));
  }
  // a fresh access token (refreshed a minute before it expires); null when signed out
  function token() {
    var s = getSession();
    if (!s || !s.refresh_token) return Promise.resolve(null);
    if (s.expires_at - 60 > Date.now() / 1000) return Promise.resolve(s.access_token);
    return fetch(AUTH + 'token?grant_type=refresh_token', { method: 'POST', headers: { apikey: APIKEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (d) { s.access_token = d.access_token; s.refresh_token = d.refresh_token; s.expires_at = Number(d.expires_at) || Math.floor(Date.now() / 1000) + Number(d.expires_in || 3600); setSession(s); return s.access_token; })
      .catch(function () { setSession(null); return null; });
  }
  function crm(action, body, signedIn) {
    return (signedIn ? token() : Promise.resolve(null)).then(function (t) {
      var h = { apikey: APIKEY, 'Content-Type': 'application/json' }; if (t) h.Authorization = 'Bearer ' + t;
      return fetch(API, { method: 'POST', headers: h, body: JSON.stringify(Object.assign({ action: action }, body || {})) });
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok || d.error) throw new Error(d.error || 'Something went wrong. Please try again.'); return d; }); });
  }
  var next = function () { var n = new URLSearchParams(location.search).get('next') || '/account/'; return /^\/[a-z0-9/_-]*$/i.test(n) ? n : '/account/'; };

  // Email-code sign-in inside a box (two forms: data-step="email" and "code"); onDone(session) once signed in.
  function signInFlow(box, msg, onDone) {
    var step1 = box.querySelector('[data-step="email"]'), step2 = box.querySelector('[data-step="code"]'), email = '';
    var say = function (t, bad) { msg.hidden = !t; msg.textContent = t || ''; msg.className = 'bdx-msg' + (bad ? ' is-error' : ''); };
    step1.addEventListener('submit', function (e) {
      e.preventDefault(); email = step1.email.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { say('Please enter a valid email address.', true); step1.email.focus(); return; }
      var b = step1.querySelector('button'); b.disabled = true; b.textContent = 'Sending…'; say('');
      crm('public_request_login_code', { email: email, business_unit_id: BIZ }).then(function () {
        step1.hidden = true; step2.hidden = false; box.querySelector('[data-sent-to]').textContent = email; step2.code.focus();
      }).catch(function (err) { say(err.message, true); }).then(function () { b.disabled = false; b.textContent = 'Email me a code'; });
    });
    step2.addEventListener('submit', function (e) {
      e.preventDefault(); var code = step2.code.value.replace(/\D/g, '');
      if (code.length !== 6) { say('Enter the 6-digit code from your email.', true); step2.code.focus(); return; }
      var b = step2.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Signing in…'; say('');
      crm('public_verify_login_code', { email: email, code: code, business_unit_id: BIZ }).then(function (d) {
        setSession(d.session); onDone(d.session);
      }).catch(function (err) { say(err.message, true); b.disabled = false; b.textContent = 'Sign in'; });
    });
    box.querySelector('[data-back]').addEventListener('click', function () { step2.hidden = true; step1.hidden = false; say(''); step1.email.focus(); });
  }

  // ---------- /login/ ----------
  var login = document.querySelector('[data-bd-login]');
  if (login) {
    if (getSession()) { location.replace(next()); return; }
    signInFlow(login, login.querySelector('[data-msg]'), function () { location.replace(next()); });
  }

  // ---------- /account/ ----------
  var account = document.querySelector('[data-bd-account]');
  if (account) {
    if (!getSession()) { location.replace('/login/?next=/account/'); return; }
    var s = getSession(), who = account.querySelector('[data-who]'); if (who && s.user && s.user.email) who.textContent = s.user.email;
    var out = account.querySelector('[data-signout]');
    if (out) out.addEventListener('click', function () {
      var t = getSession(); setSession(null);
      if (t) fetch(AUTH + 'logout', { method: 'POST', headers: { apikey: APIKEY, Authorization: 'Bearer ' + t.access_token } }).catch(function () {});
      location.href = '/login/';
    });
    window.addEventListener('crm-session-change', function (e) { if (!e.detail.signedIn) location.replace('/login/'); });
  }

  // ---------- /checkout/ ----------
  var co = document.querySelector('[data-bd-checkout]');
  if (co) {
    var OPENED = Date.now(), HUMAN = 0;
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, function (e) { if (e.isTrusted) HUMAN = 1; }, { passive: true, capture: true }); });
    var list = []; try { list = JSON.parse(localStorage.getItem('bd-basket') || '[]') || []; } catch (e) {}
    if (!list.length) { location.replace('/basket/'); return; }
    var form = co.querySelector('.bdx-co-form'), cmsg = co.querySelector('[data-msg]'), priced = null;
    var csay = function (t, bad) { cmsg.hidden = !t; cmsg.innerHTML = t || ''; cmsg.className = 'bdx-msg' + (bad ? ' is-error' : ''); if (t) cmsg.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    var items = function () { return list.map(function (i) { return { url: i.url, opts: i.opts, qty: i.qty }; }); };
    // signed in: the tabs show "Signed in as", details come from the CRM customer record
    var tabs = co.querySelector('[data-tabs]'), panel = co.querySelector('[data-co-signin]');
    function tab(which) {
      tabs.querySelectorAll('[data-tab]').forEach(function (t) { var on = t.getAttribute('data-tab') === which; t.classList.toggle('is-on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
      panel.hidden = which !== 'signin'; form.hidden = which === 'signin';
      if (which === 'signin') panel.querySelector('[data-step="email"]').hidden ? panel.querySelector('[name=code]').focus() : panel.querySelector('[name=email]').focus();
    }
    function signedIn(sess) {
      tabs.hidden = true; panel.hidden = true; form.hidden = false;
      var si = co.querySelector('[data-signed-in]'); si.hidden = false; si.querySelector('b').textContent = (sess.user && sess.user.email) || '';
      crm('customer_profile', {}, true).then(function (d) {
        var c = d.customer || {}; var set = function (n, v) { if (v && !form[n].value) form[n].value = v; };
        set('first_name', c.first_name); set('last_name', c.last_name); set('email', c.email || (sess.user && sess.user.email)); set('mobile', c.mobile);
        set('postcode', c.postcode); set('line1', c.address_line_1); set('line2', c.address_line_2); set('city', c.city);
      }).catch(function () { if (sess.user && sess.user.email && !form.email.value) form.email.value = sess.user.email; });
    }
    tabs.addEventListener('click', function (e) { var t = e.target.closest('[data-tab]'); if (t) tab(t.getAttribute('data-tab')); });
    panel.querySelector('[data-guest]').addEventListener('click', function () { tab('guest'); });
    signInFlow(panel, panel.querySelector('[data-sl-msg]'), function (sess) { signedIn(sess); window.scrollTo({ top: co.offsetTop - 120, behavior: 'smooth' }); });
    var sess = getSession();
    if (sess) signedIn(sess);
    // order summary, priced on the server
    fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote: 1, items: items() }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        var box = co.querySelector('[data-order]');
        if (!x.ok) { box.innerHTML = '<p class="bdx-err">' + esc(x.j.error || 'Please check your basket.') + ' <a href="/basket/">Back to basket</a></p>'; return; }
        priced = x.j; var net = priced.net, vat = Math.round(net * 0.2);
        box.innerHTML = '<ul class="bdx-lines">' + priced.lines.map(function (l, n) { var img = l.img || (list[n] && list[n].img) || ''; return '<li>' + (img ? '<img class="bdx-thumb" src="' + esc(img) + '" alt="" width="64" height="48" loading="lazy">' : '<span class="bdx-thumb"></span>') + '<span class="bdx-line-txt"><b>' + l.qty + ' × ' + esc(l.name) + '</b>' + (l.desc ? '<small>' + esc(l.desc) + '</small>' : '') + '</span><em>' + gbp(Math.round(l.each * 100) * l.qty) + '</em></li>'; }).join('') + '</ul>' +
          '<dl><dt>Subtotal</dt><dd>' + gbp(net) + '</dd><dt>VAT (20%)</dt><dd>' + gbp(vat) + '</dd><dt>Delivery</dt><dd>To be agreed</dd></dl><div class="bdx-total"><span>Total including VAT</span><b>' + gbp(net + vat) + '</b></div>';
      });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var need = ['first_name', 'last_name', 'email', 'mobile', 'postcode', 'line1', 'city'].filter(function (n) { return !String(form[n].value || '').trim(); });
      form.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
      if (need.length) { need.forEach(function (n) { form[n].setAttribute('aria-invalid', 'true'); }); form[need[0]].focus(); csay('Please fill in the highlighted fields.', true); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.value.trim())) { form.email.setAttribute('aria-invalid', 'true'); form.email.focus(); csay('That email address doesn’t look right.', true); return; }
      var btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Opening secure payment…'; csay('');
      var d = { first_name: form.first_name.value.trim(), last_name: form.last_name.value.trim(), email: form.email.value.trim(), mobile: form.mobile.value.trim(),
        postcode: form.postcode.value.trim().toUpperCase(), line1: form.line1.value.trim(), line2: form.line2.value.trim(), city: form.city.value.trim(), notes: form.notes.value.trim(), marketing: form.marketing.checked };
      fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: items(), email: d.email, customer: d }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (x.ok && x.j.url) { location.href = x.j.url; return; }
          if (!x.j.offline) { btn.disabled = false; btn.textContent = 'Place order'; csay(esc(x.j.error || 'Sorry, checkout isn’t available just now.'), true); return; }
          // online payment not switched on yet: the order goes to us as an order enquiry, and we send a payment link
          var lines = (priced ? priced.lines : list).map(function (l) { return '- ' + l.qty + ' × ' + l.name + (l.desc ? ' (' + l.desc + ')' : '') + (l.each ? ' @ ' + gbp(Math.round(l.each * 100)) + ' + VAT' : ''); });
          return fetch('/api/forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form: 'order', name: d.first_name + ' ' + d.last_name, email: d.email, phone: d.mobile,
            product: 'Business signs order (' + list.length + (list.length === 1 ? ' item' : ' items') + ')',
            message: 'ORDER FROM CHECKOUT (online payment not yet on: please send a payment link)\n' + lines.join('\n') + (priced ? '\n\nTotal: ' + gbp(priced.net) + ' + VAT' : '') +
              '\n\nDeliver to: ' + [d.line1, d.line2, d.city, d.postcode].filter(Boolean).join(', ') + (d.notes ? '\n\nNotes: ' + d.notes : '') + '\nMarketing emails: ' + (d.marketing ? 'yes' : 'no'),
            page_url: location.href, page_title: document.title, elapsed: Date.now() - OPENED, human: HUMAN }) })
            .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
            .then(function (y) {
              if (!y.ok) { btn.disabled = false; btn.textContent = 'Place order'; csay(esc(y.j.error || 'Sorry, your order could not be sent.'), true); return; }
              try { localStorage.setItem('bd-basket', '[]'); } catch (e) {} window.dispatchEvent(new Event('bd-basket'));
              co.querySelector('.bdx-main').innerHTML = '<div class="bdx-card bdx-done"><h2>Thank you, we’ve got your order.</h2><p>We’ll be in touch shortly to confirm the details and delivery, ask for your artwork and send a proof with a secure payment link.</p><a class="bdx-btn" href="/">Back to the home page</a></div>';
              window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        })
        .catch(function () { btn.disabled = false; btn.textContent = 'Place order'; csay('Sorry, checkout isn’t available just now. Please try again or call 01603 407786.', true); });
    });
  }
})();
