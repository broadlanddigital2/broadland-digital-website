// /basket/ (tools/build.mjs): lists localStorage "bd-basket", re-prices it on the server (POST /api/checkout with quote)
// and sends the customer to Stripe Checkout. If online payment isn't switched on, offers to send the basket as an order
// enquiry (/api/forms). /basket/thanks/ empties the basket.
(function () {
  var root = document.querySelector('[data-basket]');
  if (!root) return;
  var KEY = 'bd-basket', OPENED = Date.now(), HUMAN = 0;
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, function (e) { if (e.isTrusted) HUMAN = 1; }, { passive: true, capture: true }); });
  var gbp = function (p) { return '£' + (p / 100).toFixed(2); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var read = function () { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { return []; } };
  var save = function (l) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) {} window.dispatchEvent(new Event('bd-basket')); };
  if (root.hasAttribute('data-basket-thanks')) { save([]); return; }
  var list = read(), priced = null, msg = root.querySelector('[data-msg]');

  function say(t, bad) { msg.hidden = !t; msg.className = 'bdb-msg' + (bad ? ' is-error' : ''); msg.innerHTML = t || ''; }
  function body() {
    var email = ''; try { var ss = JSON.parse(localStorage.getItem('crm-booking-session') || 'null'); email = (ss && ss.user && ss.user.email) || ''; } catch (e) {}
    return { items: list.map(function (i) { return { url: i.url, opts: i.opts, qty: i.qty }; }), email: email };
  }

  function render() {
    var box = root.querySelector('[data-items]'), sum = root.querySelector('[data-summary]');
    if (!list.length) {
      box.innerHTML = '<div class="bdb-empty"><p>Your basket is empty.</p><a class="bdb-btn" href="/signage-home/">Browse signage</a></div>';
      sum.hidden = true; return;
    }
    sum.hidden = false;
    box.innerHTML = list.map(function (i, n) {
      var line = priced && priced.lines[n];
      return '<article class="bdb-item">' + (i.img ? '<img src="' + esc(i.img) + '" alt="" width="120" height="90" loading="lazy">' : '<span class="bdb-noimg"></span>') +
        '<div class="bdb-info"><a class="bdb-name" href="' + esc(i.url) + '">' + esc(i.name) + '</a>' + (i.desc ? '<p class="bdb-desc">' + esc(i.desc) + '</p>' : '') +
        '<div class="bdb-row"><div class="bdb-qty" role="group" aria-label="Quantity for ' + esc(i.name) + '"><button type="button" data-q="-1" data-i="' + n + '" aria-label="One fewer">−</button><span>' + i.qty + '</span><button type="button" data-q="1" data-i="' + n + '" aria-label="One more">+</button></div>' +
        '<button type="button" class="bdb-remove" data-rm="' + n + '">Remove</button></div></div>' +
        '<div class="bdb-price">' + (line ? '<b>' + gbp(Math.round(line.each * 100) * line.qty) + '</b><small>' + (line.qty > 1 ? gbp(Math.round(line.each * 100)) + ' each' : '') + ' + VAT</small>' : '<b>…</b>') + '</div></article>';
    }).join('');
    if (priced) {
      var net = priced.net, vat = Math.round(net * 0.2);
      sum.querySelector('[data-net]').textContent = gbp(net);
      sum.querySelector('[data-vat]').textContent = gbp(vat);
      sum.querySelector('[data-gross]').textContent = gbp(net + vat);
    }
  }

  function reprice() {
    if (!list.length) { render(); return; }
    var b = body(); b.quote = 1;
    fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) { if (x.ok) { priced = x.j; say(''); } else { priced = null; say(esc(x.j.error || 'Sorry, something went wrong.'), true); } render(); })
      .catch(function () { say('Sorry, we couldn’t check the prices just now. Please try again.', true); render(); });
  }

  root.addEventListener('click', function (e) {
    var q = e.target.closest('[data-q]'), rm = e.target.closest('[data-rm]');
    if (q) { var i = list[+q.getAttribute('data-i')]; i.qty = Math.min(1000, Math.max(1, i.qty + Number(q.getAttribute('data-q')))); save(list); priced = null; render(); reprice(); }
    if (rm) { list.splice(+rm.getAttribute('data-rm'), 1); save(list); priced = null; render(); reprice(); }
  });

  root.querySelector('[data-checkout]').addEventListener('click', function () { location.href = '/checkout/'; });

  render(); reprice();
})();
