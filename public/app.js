/* RENiKA landing — animation ported from the loading screen, plus waitlist logic */
(() => {
  'use strict';

  /* ================= animation (from RENiKA loading screen.html) ================= */
  const $ = (s) => document.querySelector(s);
  const rA = $('#rA'), rB = $('#rB'), R = $('#R'), pen = $('#pen'), ring = $('#ring'), tag = $('#tag');
  const letters = [...document.querySelectorAll('.L')];

  const ROSE = '#F26B7A', INK = '#EAF2EF';
  const WORD_X = 72, WORD_Y = 450;
  const R_OFF = 195;
  const D = 460;
  const I_X = 268;

  const T = { A0: 280, A1: 880, B0: 950, B1: 1110, P0: 1200, P1: 1800, F0: 1560, F1: 2040, END: 2340 };
  const HOLD = 2600; // pause on the finished wordmark before looping

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const E = {
    out: (p) => 1 - Math.pow(1 - p, 3),
    out4: (p) => 1 - Math.pow(1 - p, 4),
    io: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    ios: (p) => -(Math.cos(Math.PI * p) - 1) / 2,
  };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, k) => {
    const x = hex(a), y = hex(b);
    return 'rgb(' + x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',') + ')';
  };

  const LA = rA.getTotalLength(), LB = rB.getTotalLength();
  rA.style.strokeDasharray = LA;
  rB.style.strokeDasharray = LB;

  let t = 0, last = performance.now();
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) t = T.END;

  function render(t) {
    const offE = D * (1 - E.out4(prog(t, T.P0, T.P1)));
    const rOff = Math.min(R_OFF, offE);
    R.setAttribute('transform', `translate(${rOff} 0)`);
    letters.forEach((el, i) => {
      const p = prog(t, T.P0 + i * 30, T.P1 + i * 30);
      el.setAttribute('transform', `translate(${D * (1 - E.out4(p))} 0)`);
    });

    const pA = E.ios(prog(t, T.A0, T.A1));
    const pB = E.ios(prog(t, T.B0, T.B1));
    rA.style.strokeDashoffset = LA * (1 - pA);
    rB.style.strokeDashoffset = LB * (1 - pB);
    rA.style.strokeOpacity = pA > 0 ? 1 : 0;
    rB.style.strokeOpacity = pB > 0 ? 1 : 0;
    const col = mix(ROSE, INK, E.ios(prog(t, T.P0 + 80, T.P1)));
    rA.style.stroke = col;
    rB.style.stroke = col;

    const W = (lx, ly) => [WORD_X + rOff + lx, WORD_Y + ly];
    const foot = W(62, 100);
    const target = [WORD_X + I_X, WORD_Y + 2];
    let x, y, sx = 0.8, sy = 0.8, rot = -18;

    if (t < T.A0) {
      const p = E.out(prog(t, 0, T.A0));
      const s = W(0, 100);
      x = -30 + (s[0] + 30) * p;
      y = s[1] + 90 * (1 - p);
    } else if (t < T.A1) {
      const pt = rA.getPointAtLength(pA * LA);
      [x, y] = W(pt.x, pt.y);
    } else if (t < T.B0) {
      const p = E.ios(prog(t, T.A1, T.B0));
      const a = W(0, 54), b = W(26, 54);
      x = a[0] + (b[0] - a[0]) * p;
      y = a[1] + (b[1] - a[1]) * p - 12 * Math.sin(Math.PI * p);
    } else if (t < T.F0) {
      if (t < T.B1) {
        const pt = rB.getPointAtLength(pB * LB);
        [x, y] = W(pt.x, pt.y);
      } else {
        [x, y] = foot;
      }
    } else if (t < T.F1) {
      const e = E.io(prog(t, T.F0, T.F1));
      x = foot[0] + (target[0] - foot[0]) * e;
      y = foot[1] + (target[1] - foot[1]) * e - 110 * Math.sin(Math.PI * e);
      sx = sy = 0.8 + 0.2 * e;
      rot = -18 + 35 * Math.sin(Math.PI * e);
    } else {
      const q = prog(t, T.F1, T.END), d = 1 - q;
      const sq = 0.22 * Math.cos(q * Math.PI * 3) * d * d;
      x = target[0];
      y = target[1] - Math.abs(Math.sin(q * Math.PI * 2.2)) * 9 * d;
      sx = 1 + sq; sy = 1 - sq;
    }
    pen.setAttribute('transform', `translate(${x} ${y}) rotate(${rot}) scale(${sx} ${sy})`);

    const rt = t - (T.END - 100);
    if (rt > 0 && !reduce) {
      const ph = (rt % 1800) / 1800;
      ring.setAttribute('cx', target[0]);
      ring.setAttribute('cy', target[1]);
      ring.setAttribute('r', 12 + 24 * ph);
      ring.style.opacity = 0.5 * (1 - ph);
    } else {
      ring.style.opacity = 0;
    }

    tag.style.opacity = E.out(prog(t, T.F1 - 100, T.F1 + 500));
  }

  function frame(now) {
    const dt = Math.min(now - last, 100);
    last = now;
    if (!reduce) {
      t += dt;
      if (t > T.END + HOLD) t = 0; // loop the launch film
    }
    render(t);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ================= lightweight analytics ================= */
  // First-touch attribution for this browser session: UTM params (or ?source= /
  // ?ref=), the external referrer and the landing path. Stored in sessionStorage
  // so a signup a few minutes later is still credited to the original source.
  const API = window.API_BASE || '';
  const ATTR_KEY = 'renika-attr';
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  function captureAttribution() {
    let stored = null;
    try { stored = JSON.parse(sessionStorage.getItem(ATTR_KEY) || 'null'); } catch { /* ignore */ }

    const params = new URLSearchParams(location.search);
    const fromUrl = {};
    for (const k of UTM_KEYS) if (params.get(k)) fromUrl[k] = params.get(k);
    const alias = params.get('source') || params.get('ref');
    if (alias && !fromUrl.utm_source) fromUrl.utm_source = alias;

    // A new tagged link overrides the stored session attribution.
    if (stored && !Object.keys(fromUrl).length) return stored;

    const ref = document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : '';
    const attr = { ...fromUrl, referrer: ref, landing_path: location.pathname + location.search };
    try { sessionStorage.setItem(ATTR_KEY, JSON.stringify(attr)); } catch { /* ignore */ }
    return attr;
  }
  const attribution = captureAttribution();

  function track(name) {
    try {
      fetch(API + '/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, attribution }),
        keepalive: true,
      }).catch(() => {});
    } catch { /* analytics must never break the page */ }
  }
  track('page_view');

  /* ================= waitlist logic ================= */
  const form = $('#waitlist-form');
  const emailInput = $('#email');
  const submitBtn = $('#submit-btn');
  const formError = $('#form-error');
  const reveal = $('#reveal');
  const revealLead = $('#reveal-lead');
  const positionNum = $('#position-num');
  const confirmLine = $('#confirm-line');
  const confirmEmail = $('#confirm-email');
  const countEl = $('#count');

  function setCount(n) {
    countEl.textContent = n.toLocaleString('en-US');
  }

  async function loadCount() {
    try {
      const res = await fetch(API + '/api/count');
      const data = await res.json();
      setCount(data.total);
    } catch {
      countEl.textContent = '—';
    }
  }
  loadCount();

  function countUp(el, to, duration = 1400) {
    const start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = '#' + Math.round(to * eased).toLocaleString('en-US');
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function showReveal({ position, email, already, confirmation = 'configured' }) {
    form.hidden = true;
    formError.textContent = '';
    revealLead.textContent = already ? "You're already" : 'You are';
    confirmLine.hidden = false;
    confirmEmail.textContent = email;
    const message = already
      ? 'Already registered: '
      : confirmation === 'configured'
        ? "We've sent a confirmation to "
        : "We'll send launch updates to ";
    confirmLine.replaceChildren(document.createTextNode(message), confirmEmail);
    reveal.hidden = false;
    countUp(positionNum, position);
    loadCount();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    track('cta_click'); // primary CTA pressed (button click or Enter), before validation
    formError.textContent = '';
    form.classList.remove('error');

    const email = emailInput.value.trim();
    if (!email) {
      formError.textContent = 'Please enter your email address.';
      form.classList.add('error');
      emailInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Joining…';

    try {
      const res = await fetch(API + '/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, attribution }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        showReveal({ position: data.position, email, already: true });
        return;
      }
      if (!res.ok) {
        formError.textContent = data.error || 'Something went wrong. Please try again.';
        form.classList.add('error');
        return;
      }
      showReveal({
        position: data.position,
        email,
        already: false,
        confirmation: data.confirmation,
      });
    } catch {
      formError.textContent = 'Network error — please try again.';
      form.classList.add('error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Join the waitlist';
    }
  });

  emailInput.addEventListener('input', () => {
    formError.textContent = '';
    form.classList.remove('error');
  });

  /* ================= design enhancements ================= */

  // 4. Scroll-triggered fade-ins
  const fadeEls = document.querySelectorAll('.fade-in');
  const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        fadeObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  fadeEls.forEach((el) => fadeObserver.observe(el));

  // Worked-example view: fires once when at least a third of the section is on screen.
  const example = document.getElementById('worked-example');
  if (example) {
    const exampleObserver = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) {
        track('example_view');
        exampleObserver.disconnect();
      }
    }, { threshold: 0.33 });
    exampleObserver.observe(example);
  }

  // 5. Magnetic button
  const ctaBtn = document.getElementById('submit-btn');
  if (ctaBtn) {
    ctaBtn.addEventListener('mousemove', (e) => {
      const rect = ctaBtn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      ctaBtn.style.transform = `translate(${x * 0.15}px, ${y * 0.2}px)`;
    });
    ctaBtn.addEventListener('mouseleave', () => {
      ctaBtn.style.transform = '';
    });
  }

  // 6. Parallax on floating kidneys
  const floaters = document.querySelectorAll('.floater');
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        floaters.forEach((el, i) => {
          const speed = 0.02 + (i % 3) * 0.015;
          el.style.translate = `0 ${scrollY * speed}px`;
        });
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
})();
