/* NEXUS website — shared behaviour. Every page reads fine without this file; it only adds the menu,
   live clocks, count-up figures and the motion layer (skipped entirely under reduced motion). */
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canObserve = 'IntersectionObserver' in window;
  if (!reduce && canObserve) root.classList.add('motion');

  /* mobile menu: keyboard, aria-expanded, Escape */
  var btn = document.querySelector('.menu-btn');
  var menu = document.getElementById('menu');
  if (btn && menu) {
    var set = function (open) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? 'Close' : 'Menu';
      menu.classList.toggle('is-open', open);
    };
    btn.addEventListener('click', function () { set(btn.getAttribute('aria-expanded') !== 'true'); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { set(false); btn.focus(); }
    });
  }

  /* live clocks for the corridor cities; the HTML carries a static fallback */
  var clocks = document.querySelectorAll('[data-clock]');
  var status = document.querySelectorAll('[data-overlap]');
  function parts(zone) {
    var f = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false });
    var o = {};
    f.formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  function working(p) { var h = parseInt(p.hour, 10); return ['Sat', 'Sun'].indexOf(p.weekday) < 0 && h >= 9 && h < 18; }
  function tick() {
    clocks.forEach(function (el) { var p = parts(el.getAttribute('data-clock')); el.textContent = p.hour + ':' + p.minute; });
    if (status.length) {
      var both = working(parts('Europe/London')) && working(parts('Asia/Shanghai'));
      status.forEach(function (el) { el.textContent = both ? 'Both markets are in working hours now' : 'Outside the shared working hours right now'; });
    }
  }
  if (clocks.length || status.length) { try { tick(); setInterval(tick, 30000); } catch (e) {} }

  /* count-up figures: the final value is already in the HTML */
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    if (isNaN(target)) return;
    var suffix = el.getAttribute('data-suffix') || '';
    var start = null, dur = 900;
    var fmt = function (n) { return Math.round(n).toLocaleString('en-GB') + suffix; };
    var step = function (t) {
      if (start === null) start = t;
      var k = Math.min(1, (t - start) / dur);
      var eased = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(target * eased);
      if (k < 1) requestAnimationFrame(step);
    };
    el.textContent = fmt(0);
    requestAnimationFrame(step);
  }

  /* one observer for reveals, the X crossing, the shutter and the figures */
  if (!reduce && canObserve) {
    document.querySelectorAll('[data-stagger]').forEach(function (group) {
      group.querySelectorAll('[data-reveal]').forEach(function (el, i) { el.style.setProperty('--d', (i * 70) + 'ms'); });
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.classList.add('is-in');
        if (el.hasAttribute('data-count')) countUp(el);
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    document.querySelectorAll('[data-reveal],[data-shutter],.x-stage,[data-count]').forEach(function (el) { io.observe(el); });
  }

  /* draft forms: no backend yet, so say so plainly instead of pretending to send */
  document.querySelectorAll('form[data-draft]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var out = form.querySelector('.form-status');
      if (out) out.textContent = 'Thank you. This is a design draft, so nothing has been sent; the live form will store and email your enquiry.';
    });
  });
})();
