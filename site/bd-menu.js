// Broadland Digital full-screen menu: opens and closes, Escape and outside links close it, focus stays inside while
// open, the page behind doesn't scroll. On phones each section is a fold-out (<details>); on wider screens they're
// all open.
(function () {
  // Header dropdowns: hover opens them on desktop (CSS); the arrow buttons open them by click, tap or keyboard.
  var items = document.querySelectorAll('.bdd-item');
  function closeAll(except) { items.forEach(function (li) { if (li !== except) { li.classList.remove('open'); var b = li.querySelector('.bdd-toggle'); if (b) b.setAttribute('aria-expanded', 'false'); } }); }
  items.forEach(function (li) {
    var b = li.querySelector('.bdd-toggle');
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !li.classList.contains('open');
      closeAll(li);
      li.classList.toggle('open', open);
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { var first = li.querySelector('.bdd-panel a'); if (first && e.detail === 0) first.focus(); }
    });
    li.addEventListener('focusout', function (e) { if (!li.contains(e.relatedTarget)) { li.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); } });
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.bdd-item')) closeAll(); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = document.querySelector('.bdd-item.open');
    if (open) { closeAll(); open.querySelector('.bdd-toggle').focus(); }
  });
})();

(function () {
  var btn = document.querySelector('.bdm-btn');
  var menu = document.getElementById('bdm');
  if (!btn || !menu) return;
  var cols = menu.querySelectorAll('details.bdm-col');
  var mq = window.matchMedia('(max-width: 767px)');

  function layout() {
    // Desktop: every section open, headings aren't toggles. Phone: folded, the current section open.
    cols.forEach(function (d) {
      if (mq.matches) d.open = d.hasAttribute('data-current');
      else d.open = true;
    });
  }
  layout();
  if (mq.addEventListener) mq.addEventListener('change', layout); else mq.addListener(layout);

  // Section headings: on wide screens they're links (the section can't fold); on phones the first tap opens the
  // section and a tap on its title once open goes to the section's page.
  cols.forEach(function (d) {
    d.querySelector('summary').addEventListener('click', function (e) {
      var link = e.target.closest('a');
      if (!mq.matches) { e.preventDefault(); if (link) location.href = link.href; return; }
      if (link && d.open) return; // follow the link
      e.preventDefault();
      d.open = !d.open;
    });
  });

  function setOpen(open) {
    menu.classList.toggle('open', open);
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) menu.removeAttribute('inert'); else menu.setAttribute('inert', '');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('bdm-lock', open);
    if (open) { var first = menu.querySelector('a, summary'); if (first) first.focus({ preventScroll: true }); }
    else btn.focus({ preventScroll: true });
  }
  btn.addEventListener('click', function () { setOpen(!menu.classList.contains('open')); });
  document.addEventListener('keydown', function (e) {
    if (!menu.classList.contains('open')) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    if (e.key === 'Tab') {
      var items = [btn].concat([].slice.call(menu.querySelectorAll('a, summary')).filter(function (el) { return el.offsetParent !== null; }));
      var i = items.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
      else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
    }
  });
  menu.addEventListener('click', function (e) { var a = e.target.closest('a'); if (a && a.getAttribute('href').charAt(0) === '#') setOpen(false); });
})();
