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

  /* section links glide to their section; links into the home page from other pages glide there after loading */
  var hdr = document.querySelector('.hdr');
  var gliding = 0;
  function glideTo(el) {
    var from = window.scrollY;
    var to = Math.max(0, Math.min(
      el.getBoundingClientRect().top + from - (hdr ? hdr.offsetHeight : 0) - 24,
      document.documentElement.scrollHeight - window.innerHeight));
    var dist = to - from;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
    if (reduce || Math.abs(dist) < 2) { window.scrollTo(0, to); return; }
    var dur = Math.min(1100, Math.max(550, Math.abs(dist) * 0.3));
    var start = null, run = ++gliding;
    var step = function (t) {
      if (run !== gliding) return;
      if (start === null) start = t;
      var k = Math.min(1, (t - start) / dur);
      var eased = k < 0.5 ? 8 * k * k * k * k : 1 - Math.pow(-2 * k + 2, 4) / 2;
      window.scrollTo(0, from + dist * eased);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  /* the visitor scrolling by hand takes over from a glide */
  ['wheel', 'touchstart', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function () { gliding++; }, { passive: true });
  });
  var page = location.pathname.split('/').pop() || 'index.html';
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href*="#"]');
    if (!a || a.classList.contains('skip') || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var url = new URL(a.href, location.href);
    var id = decodeURIComponent(url.hash.slice(1));
    if (!id || url.origin !== location.origin) return;
    var targetPage = url.pathname.split('/').pop() || 'index.html';
    if (targetPage === page) {
      var el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      if (location.hash !== url.hash) history.pushState(null, '', url.hash);
      glideTo(el);
    } else if (!reduce) {
      try { sessionStorage.setItem('nexus-glide', id); } catch (err) { return; }
      e.preventDefault();
      location.href = url.pathname + url.search;
    }
  });
  var pending = null;
  try { pending = sessionStorage.getItem('nexus-glide'); sessionStorage.removeItem('nexus-glide'); } catch (err) {}
  if (pending && document.getElementById(pending)) {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    history.replaceState(null, '', '#' + pending);
    window.scrollTo(0, 0);
    var go = function () { setTimeout(function () { glideTo(document.getElementById(pending)); }, 150); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
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
