// Broadland Digital full-screen menu: opens and closes, Escape and outside links close it, focus stays inside while
// open, the page behind doesn't scroll. On phones each section is a fold-out (<details>); on wider screens they're
// all open.
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
