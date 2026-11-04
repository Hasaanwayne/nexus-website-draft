/* NEXUS website: shared behaviour. Every page works without this file; it adds:
   - the mobile menu (keyboard, aria-expanded, Escape)
   - section links that glide to their section (instant under reduced motion)
   - London and Shanghai live clocks and the shared-working-hours status
   - placeholder review switch (?placeholders=off hides everything marked data-placeholder)
   - cookie consent (Accept all / Reject / Manage), stored in localStorage
   - GA4, loaded only after analytics consent and only when GA_MEASUREMENT_ID is set
   - dataLayer events from brief §11, pushed only after analytics consent
   - every form[data-form]: inline validation, honeypot, source fields, draft thank-you or JSON POST to data-endpoint */
(function () {
  'use strict';

  /* ---------- configuration: the one place to set the analytics ID ---------- */
  var GA_MEASUREMENT_ID = ''; /* e.g. 'G-XXXXXXXXXX'. Empty = analytics never load. */
  var CONSENT_KEY = 'nexus-consent';
  var CONSENT_VERSION = 1;
  var ATTRIB_KEY = 'nexus-attrib';
  var CTA_KEY = 'nexus-cta';

  var doc = document;
  var root = doc.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pageName = location.pathname.split('/').pop() || 'index.html';

  function store(kind) { try { return window[kind]; } catch (e) { return null; } }
  function getItem(kind, key) { try { var s = store(kind); return s ? s.getItem(key) : null; } catch (e) { return null; } }
  function setItem(kind, key, val) { try { var s = store(kind); if (s) s.setItem(key, val); } catch (e) {} }
  function removeItem(kind, key) { try { var s = store(kind); if (s) s.removeItem(key); } catch (e) {} }

  /* ---------- placeholders: review switch ---------- */
  try {
    if (new URLSearchParams(location.search).get('placeholders') === 'off') root.classList.add('hide-placeholders');
  } catch (e) {}

  /* ---------- mobile menu ---------- */
  var menuBtn = doc.querySelector('.menu-btn');
  var menu = doc.getElementById('menu');
  if (menuBtn && menu) {
    var setMenu = function (open) {
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      menuBtn.textContent = open ? 'Close' : 'Menu';
      menu.classList.toggle('is-open', open);
    };
    menuBtn.addEventListener('click', function () { setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuBtn.getAttribute('aria-expanded') === 'true') { setMenu(false); menuBtn.focus(); }
    });
    window.addEventListener('resize', function () { if (window.innerWidth >= 1100) setMenu(false); });
  }

  /* ---------- section links glide to their section (instant under reduced motion) ---------- */
  var hdr = doc.querySelector('.hdr');
  var gliding = 0;
  function headerOffset() {
    if (!hdr) return 0;
    var pos = getComputedStyle(hdr).position;
    return pos === 'sticky' || pos === 'fixed' ? hdr.offsetHeight : 0;
  }
  function glideTo(el) {
    var from = window.scrollY;
    var to = Math.max(0, Math.min(
      el.getBoundingClientRect().top + from - headerOffset() - 24,
      root.scrollHeight - window.innerHeight));
    var dist = to - from;
    if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
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
  doc.addEventListener('click', function (e) {
    var a = e.target.closest('a[href*="#"]');
    if (!a || a.classList.contains('skip') || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var url = new URL(a.href, location.href);
    var id = decodeURIComponent(url.hash.slice(1));
    if (!id || url.origin !== location.origin) return;
    var targetPage = url.pathname.split('/').pop() || 'index.html';
    if (targetPage === pageName) {
      var el = doc.getElementById(id);
      if (!el) return;
      e.preventDefault();
      if (location.hash !== url.hash) history.pushState(null, '', url.hash);
      glideTo(el);
    } else if (!reduce) {
      setItem('sessionStorage', 'nexus-glide', id);
      if (getItem('sessionStorage', 'nexus-glide') !== id) return;
      e.preventDefault();
      location.href = url.pathname + url.search;
    }
  });
  var pending = getItem('sessionStorage', 'nexus-glide');
  removeItem('sessionStorage', 'nexus-glide');
  if (pending && doc.getElementById(pending)) {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    history.replaceState(null, '', '#' + pending);
    window.scrollTo(0, 0);
    var go = function () { setTimeout(function () { glideTo(doc.getElementById(pending)); }, 150); };
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(go); else go();
  }

  /* ---------- live clocks; the HTML carries a static fallback ---------- */
  var clocks = doc.querySelectorAll('[data-clock]');
  var overlap = doc.querySelectorAll('[data-overlap]');
  function zoneParts(zone) {
    var f = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false });
    var o = {};
    f.formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  function working(p) { var h = parseInt(p.hour, 10); return ['Sat', 'Sun'].indexOf(p.weekday) < 0 && h >= 9 && h < 18; }
  function tick() {
    clocks.forEach(function (el) { var p = zoneParts(el.getAttribute('data-clock')); el.textContent = p.hour + ':' + p.minute; });
    if (overlap.length) {
      var both = working(zoneParts('Europe/London')) && working(zoneParts('Asia/Shanghai'));
      overlap.forEach(function (el) { el.textContent = both ? 'Both markets are in working hours now.' : 'Outside the shared working hours right now.'; });
    }
  }
  if (clocks.length || overlap.length) { try { tick(); setInterval(tick, 30000); } catch (e) {} }

  /* =====================================================================================
     Consent, attribution and analytics
     ===================================================================================== */
  function readConsent() {
    try {
      var v = JSON.parse(getItem('localStorage', CONSENT_KEY));
      if (v && v.v === CONSENT_VERSION && typeof v.analytics === 'boolean') return v;
    } catch (e) {}
    return null;
  }
  var consent = readConsent();
  function analyticsAllowed() { return !!(consent && consent.analytics); }

  window.dataLayer = window.dataLayer || [];
  var gaLoaded = false;
  function loadAnalytics() {
    if (!GA_MEASUREMENT_ID || gaLoaded || !analyticsAllowed()) return;
    gaLoaded = true;
    window['ga-disable-' + GA_MEASUREMENT_ID] = false;
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, { anonymize_ip: true, transport_type: 'beacon' });
    var s = doc.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_MEASUREMENT_ID);
    doc.head.appendChild(s);
  }

  /* brief §11 events; nothing is pushed without analytics consent */
  function track(name, params) {
    if (!analyticsAllowed()) return;
    var p = params || {};
    var msg = { event: name };
    Object.keys(p).forEach(function (k) { if (p[k] !== undefined && p[k] !== '') msg[k] = p[k]; });
    window.dataLayer.push(msg);
    if (gaLoaded && typeof window.gtag === 'function') {
      var gp = {}; Object.keys(msg).forEach(function (k) { if (k !== 'event') gp[k] = msg[k]; });
      window.gtag('event', name, gp);
    }
  }

  /* attribution: first-touch UTMs, landing page and referrer are kept for the visit only with consent */
  function currentTouch() {
    var q = new URLSearchParams(location.search);
    return {
      utm_source: q.get('utm_source') || '',
      utm_medium: q.get('utm_medium') || '',
      utm_campaign: q.get('utm_campaign') || '',
      landing_page: location.origin + location.pathname,
      referrer: doc.referrer || ''
    };
  }
  function rememberFirstTouch() {
    if (!analyticsAllowed()) return;
    if (!getItem('sessionStorage', ATTRIB_KEY)) setItem('sessionStorage', ATTRIB_KEY, JSON.stringify(currentTouch()));
  }
  function attribution() {
    if (analyticsAllowed()) {
      try { var saved = JSON.parse(getItem('sessionStorage', ATTRIB_KEY)); if (saved) return saved; } catch (e) {}
    }
    return currentTouch();
  }

  /* the last CTA clicked (kept across pages for the visit only with consent) */
  var lastCta = '';
  function ctaText(el) { return (el.getAttribute('data-cta') || el.textContent || '').replace(/\s+/g, ' ').replace(/[→←]/g, '').trim().slice(0, 120); }
  function lastCtaText() { return lastCta || (analyticsAllowed() ? (getItem('sessionStorage', CTA_KEY) || '') : ''); }

  doc.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (a) {
      var url;
      try { url = new URL(a.href, location.href); } catch (err) { url = null; }
      if (url && /(^|\.)globalinnovatorawards\.com$/i.test(url.hostname)) track('outbound_gia_click', { page: location.pathname, destination: url.href });
    }
    var cta = e.target.closest('.btn, [data-cta]');
    if (!cta || cta.closest('.cookie') || cta.type === 'submit') return;
    lastCta = ctaText(cta);
    if (analyticsAllowed()) setItem('sessionStorage', CTA_KEY, lastCta);
    track('cta_click', { button_text: lastCta, page: location.pathname, destination: cta.getAttribute('href') || '' });
  });

  function applyConsent() {
    if (analyticsAllowed()) {
      rememberFirstTouch();
      loadAnalytics();
      var body = doc.body;
      if (body && body.getAttribute('data-case-study') && !body.hasAttribute('data-cs-tracked')) {
        body.setAttribute('data-cs-tracked', '');
        track('case_study_view', { case_study: body.getAttribute('data-case-study'), sector: body.getAttribute('data-sector') || '' });
      }
    } else {
      removeItem('sessionStorage', ATTRIB_KEY);
      removeItem('sessionStorage', CTA_KEY);
      if (GA_MEASUREMENT_ID) window['ga-disable-' + GA_MEASUREMENT_ID] = true;
    }
  }
  function saveConsent(analytics) {
    consent = { v: CONSENT_VERSION, analytics: !!analytics, at: new Date().toISOString() };
    setItem('localStorage', CONSENT_KEY, JSON.stringify(consent));
    applyConsent();
  }

  /* ---------- cookie banner and settings panel ---------- */
  var banner = null;
  function buildBanner() {
    banner = doc.createElement('section');
    banner.className = 'cookie';
    banner.setAttribute('aria-labelledby', 'cookie-title');
    banner.setAttribute('tabindex', '-1');
    banner.hidden = true;
    banner.innerHTML =
      '<p class="cookie-title" id="cookie-title">Cookies on this site</p>' +
      '<p>We use necessary cookies to make this site work. With your permission we would also use analytics cookies to see how the site is used. <a class="link" href="cookies.html">Cookie policy</a></p>' +
      '<div class="cookie-manage" id="cookie-manage" hidden>' +
        '<div class="check"><input type="checkbox" id="cookie-essential" checked disabled><label for="cookie-essential"><b>Necessary</b>Remember your cookie choice. Always on.</label></div>' +
        '<div class="check"><input type="checkbox" id="cookie-analytics"><label for="cookie-analytics"><b>Analytics</b>Google Analytics 4, to count visits and enquiries by source. Off unless you turn it on.</label></div>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button type="button" class="btn btn-primary" data-consent="accept">Accept all</button>' +
        '<button type="button" class="btn btn-secondary" data-consent="reject">Reject</button>' +
        '<button type="button" class="btn btn-secondary" data-consent="manage" aria-expanded="false" aria-controls="cookie-manage">Manage</button>' +
        '<button type="button" class="btn btn-primary" data-consent="save" hidden>Save choices</button>' +
      '</div>';
    doc.body.appendChild(banner);
    banner.addEventListener('click', function (e) {
      var b = e.target.closest('[data-consent]');
      if (!b) return;
      var act = b.getAttribute('data-consent');
      if (act === 'accept') { saveConsent(true); closeBanner(); }
      else if (act === 'reject') { saveConsent(false); closeBanner(); }
      else if (act === 'manage') { setManage(b.getAttribute('aria-expanded') !== 'true'); }
      else if (act === 'save') { saveConsent(doc.getElementById('cookie-analytics').checked); closeBanner(); }
    });
    banner.addEventListener('keydown', function (e) { if (e.key === 'Escape' && consent) closeBanner(); });
  }
  var returnFocus = null;
  function setManage(open) {
    var panel = doc.getElementById('cookie-manage');
    var mb = banner.querySelector('[data-consent="manage"]');
    panel.hidden = !open;
    mb.setAttribute('aria-expanded', open ? 'true' : 'false');
    banner.querySelector('[data-consent="save"]').hidden = !open;
    doc.getElementById('cookie-analytics').checked = analyticsAllowed();
  }
  function openBanner(manage) {
    if (!banner) buildBanner();
    banner.hidden = false;
    setManage(!!manage);
    if (manage) { returnFocus = doc.activeElement; banner.focus(); }
  }
  function closeBanner() {
    if (!banner) return;
    banner.hidden = true;
    if (returnFocus && returnFocus.focus) { returnFocus.focus(); returnFocus = null; }
  }
  doc.addEventListener('click', function (e) {
    var t = e.target.closest('[data-cookie-settings]');
    if (!t) return;
    e.preventDefault();
    openBanner(true);
  });
  if (!consent) openBanner(false);
  applyConsent();

  /* =====================================================================================
     Forms: every form[data-form]
     ===================================================================================== */
  var FORM_EVENTS = {
    partnership_call: 'partnership_call_request',
    diagnostic_international: 'diagnostic_request',
    diagnostic_scaleup: 'diagnostic_request',
    sponsor_pack: 'sponsor_pack_request',
    delegation_interest: 'delegation_interest',
    event_interest: 'event_interest',
    general: 'general_enquiry',
    report_download: 'report_download'
    /* newsletter: brief §11 lists no event for it, so none is sent */
  };
  var SOURCE_FIELDS = ['form_type', 'page_url', 'cta', 'utm_source', 'utm_medium', 'utm_campaign', 'referrer', 'landing_page', 'submitted_at'];
  var EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

  function ensureHidden(form) {
    SOURCE_FIELDS.forEach(function (name) {
      if (!form.querySelector('input[name="' + name + '"]')) {
        var i = doc.createElement('input');
        i.type = 'hidden'; i.name = name;
        form.appendChild(i);
      }
    });
  }
  function setVal(form, name, v) { var el = form.querySelector('input[name="' + name + '"]'); if (el) el.value = v || ''; }
  function fillSource(form) {
    var a = attribution();
    setVal(form, 'form_type', form.getAttribute('data-form'));
    setVal(form, 'page_url', location.origin + location.pathname);
    setVal(form, 'cta', lastCtaText());
    setVal(form, 'utm_source', a.utm_source);
    setVal(form, 'utm_medium', a.utm_medium);
    setVal(form, 'utm_campaign', a.utm_campaign);
    setVal(form, 'referrer', a.referrer);
    setVal(form, 'landing_page', a.landing_page);
    setVal(form, 'submitted_at', new Date().toISOString());
  }

  function labelText(form, el) {
    var l = el.id ? form.querySelector('label[for="' + el.id + '"]') : null;
    if (!l) { var fs = el.closest('fieldset'); l = fs ? fs.querySelector('legend') : null; }
    var t = l ? l.textContent : (el.getAttribute('aria-label') || el.name || 'this field');
    return t.replace(/\*/g, '').replace(/\((required|optional)\)/gi, '').replace(/\s+/g, ' ').trim();
  }
  function lowerFirst(s) { return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  function isHoneypot(el) { return !!el.closest('[data-hp], .hp'); }
  function validatable(form) {
    return Array.prototype.filter.call(form.elements, function (el) {
      return el.name && !el.disabled && el.type !== 'hidden' && el.type !== 'submit' && el.type !== 'button' && !isHoneypot(el);
    });
  }
  function checkField(form, el) {
    var custom = el.getAttribute('data-error');
    if (el.type === 'radio') {
      if (!el.required) return '';
      var group = form.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
      var any = Array.prototype.some.call(group, function (r) { return r.checked; });
      return any ? '' : (custom || 'Choose an option for ' + lowerFirst(labelText(form, el)));
    }
    if (el.type === 'checkbox') return el.required && !el.checked ? (custom || 'Tick this box to continue') : '';
    var v = (el.value || '').trim();
    if (el.required && !v) return custom || (el.tagName === 'SELECT' ? 'Choose an option for ' : 'Enter your ') + lowerFirst(labelText(form, el));
    if (v && el.type === 'email' && !EMAIL_RE.test(v)) return 'Enter an email address in the right format, like name@company.com';
    if (v && el.maxLength > 0 && v.length > el.maxLength) return labelText(form, el) + ' must be ' + el.maxLength + ' characters or fewer';
    return '';
  }
  function errorTarget(el) { return el.type === 'radio' ? el.closest('fieldset') || el : el; }
  function setError(form, el, msg) {
    var key = (el.type === 'radio' ? el.name : (el.id || el.name)) + '-error';
    var err = doc.getElementById(key);
    var wrap = el.closest('.field, .check') || el.parentNode;
    var group = el.type === 'radio' ? form.querySelectorAll('input[type="radio"][name="' + el.name + '"]') : [el];
    if (msg) {
      if (!err) {
        err = doc.createElement('p');
        err.className = 'field-error';
        err.id = key;
        if (wrap.classList.contains('check')) wrap.appendChild(err);
        else {
          var before = wrap.querySelector('input:not([type="checkbox"]):not([type="radio"]), select, textarea, .choices');
          wrap.insertBefore(err, before || null);
        }
      }
      err.innerHTML = '<span class="sr-only">Error: </span>';
      err.appendChild(doc.createTextNode(msg));
      wrap.classList.add('has-error');
      Array.prototype.forEach.call(group, function (g) {
        g.setAttribute('aria-invalid', 'true');
        var d = (g.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
        if (d.indexOf(key) < 0) d.unshift(key);
        g.setAttribute('aria-describedby', d.join(' '));
      });
    } else {
      if (err) err.parentNode.removeChild(err);
      wrap.classList.remove('has-error');
      Array.prototype.forEach.call(group, function (g) {
        g.removeAttribute('aria-invalid');
        var d = (g.getAttribute('aria-describedby') || '').split(' ').filter(function (x) { return x && x !== key; });
        if (d.length) g.setAttribute('aria-describedby', d.join(' ')); else g.removeAttribute('aria-describedby');
      });
    }
  }
  function showSummary(form, problems) {
    var box = form.querySelector('.form-errors');
    if (!problems.length) { if (box) box.parentNode.removeChild(box); return; }
    if (!box) {
      box = doc.createElement('div');
      box.className = 'form-errors';
      box.setAttribute('role', 'alert');
      box.setAttribute('tabindex', '-1');
      form.insertBefore(box, form.firstChild);
    }
    box.innerHTML = '<p class="form-errors-title">There ' + (problems.length === 1 ? 'is a problem' : 'are ' + problems.length + ' problems') + '</p><ul></ul>';
    var ul = box.querySelector('ul');
    problems.forEach(function (p) {
      var target = p.el.type === 'radio' ? form.querySelector('input[type="radio"][name="' + p.el.name + '"]') : p.el;
      if (!target.id) target.id = 'f-' + Math.random().toString(36).slice(2, 9);
      var li = doc.createElement('li');
      var a = doc.createElement('a');
      a.href = '#' + target.id;
      a.className = 'link';
      a.textContent = p.msg;
      a.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); target.focus(); });
      li.appendChild(a);
      ul.appendChild(li);
    });
    box.focus();
  }
  function validate(form) {
    var problems = [];
    var seenRadio = {};
    validatable(form).forEach(function (el) {
      if (el.type === 'radio') { if (seenRadio[el.name]) return; seenRadio[el.name] = true; }
      var msg = checkField(form, el);
      setError(form, el, msg);
      if (msg) problems.push({ el: el, msg: msg });
    });
    showSummary(form, problems);
    return problems.length === 0;
  }
  function collect(form) {
    var data = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled || isHoneypot(el) || el.type === 'submit' || el.type === 'button') return;
      if (el.type === 'checkbox') {
        var same = form.querySelectorAll('input[type="checkbox"][name="' + el.name + '"]');
        if (same.length > 1) { data[el.name] = data[el.name] || []; if (el.checked) data[el.name].push(el.value); }
        else data[el.name] = el.checked;
        return;
      }
      if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; else if (!(el.name in data)) data[el.name] = ''; return; }
      data[el.name] = (el.value || '').trim();
    });
    if (!('marketing_consent' in data)) data.marketing_consent = false;
    return data;
  }
  function nextSteps(form) {
    var block = form.closest('.enquiry, [data-form-block]');
    var list = block ? block.querySelector('.next ol, .next ul') : null;
    var text = form.getAttribute('data-next');
    if (!list && !text) return null;
    var wrap = doc.createElement('div');
    var h = doc.createElement('p');
    h.innerHTML = '<b>What happens next</b>';
    wrap.appendChild(h);
    if (list) { var copy = list.cloneNode(true); copy.removeAttribute('id'); wrap.appendChild(copy); }
    else { var p = doc.createElement('p'); p.textContent = text; wrap.appendChild(p); }
    return wrap;
  }
  function showDone(form, mode) {
    var done = doc.createElement('div');
    done.className = 'form-done';
    done.setAttribute('tabindex', '-1');
    done.setAttribute('role', 'status');
    var title = doc.createElement('p');
    title.className = 'form-done-title';
    title.textContent = 'Thank you.';
    done.appendChild(title);
    var note = doc.createElement('p');
    note.className = 'draft-note';
    note.textContent = mode === 'sent'
      ? 'Your request has reached our team.'
      : 'This is a design draft, so nothing was sent and nothing was stored. On the live site this form will store your request and email it to our team.';
    done.appendChild(note);
    var next = nextSteps(form);
    if (next) done.appendChild(next);
    form.hidden = true;
    form.parentNode.insertBefore(done, form.nextSibling);
    done.focus();
  }
  function showStatus(form, msg) {
    var s = form.querySelector('.form-status');
    if (!s) { s = doc.createElement('p'); s.className = 'form-status'; s.setAttribute('role', 'alert'); form.appendChild(s); }
    s.textContent = msg;
  }
  function trackForm(form, data) {
    var type = form.getAttribute('data-form');
    var name = FORM_EVENTS[type];
    if (!name) return;
    var page = location.pathname;
    var p;
    switch (name) {
      case 'partnership_call_request': p = { page: page, organisation_type: data.organisation_type, interest: data.interest }; break;
      case 'diagnostic_request': p = { page: page, form_type: type, sector: data.sector, stage: data.stage }; break;
      case 'sponsor_pack_request': p = { interest: data.interest, budget_band: data.budget_band }; break;
      case 'delegation_interest': p = { sector: data.sector, interest: data.interest }; break;
      case 'event_interest': p = { organisation_type: data.organisation_type }; break;
      case 'general_enquiry': p = { page: page }; break;
      case 'report_download': p = { report_name: form.getAttribute('data-report') || data.report_name || '' }; break;
      default: p = { page: page };
    }
    if (Array.isArray(p.interest)) p.interest = p.interest.join(', ');
    track(name, p);
  }

  doc.querySelectorAll('form[data-form]').forEach(function (form) {
    form.noValidate = true;
    ensureHidden(form);
    form.addEventListener('focusin', function () { fillSource(form); }, { once: true });
    /* once a field has shown an error, re-check it as the visitor fixes it */
    var recheck = function (e) {
      var el = e.target;
      if (!el.name || isHoneypot(el)) return;
      var wrap = el.closest('.field, .check');
      if (!wrap || !wrap.classList.contains('has-error')) return;
      setError(form, el, checkField(form, el));
    };
    form.addEventListener('input', recheck);
    form.addEventListener('change', recheck);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var hp = form.querySelector('[data-hp] input, .hp input');
      if (hp && hp.value) { showDone(form, 'draft'); return; } /* a bot: pretend success, send nothing */
      if (!validate(form)) return;
      fillSource(form);
      var data = collect(form);
      var endpoint = form.getAttribute('data-endpoint');
      if (!endpoint) { trackForm(form, data); showDone(form, 'draft'); return; }
      var btn = form.querySelector('[type="submit"]');
      if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(data), credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); trackForm(form, data); showDone(form, 'sent'); })
        .catch(function () {
          if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
          showStatus(form, 'Sorry, your request could not be sent. Please try again in a moment.');
        });
    });
  });
})();
