/* RENiKA admin — passcode gate, stats, chart, waitlist table */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const gate = $('#gate');
  const gateForm = $('#gate-form');
  const passcodeInput = $('#passcode');
  const gateError = $('#gate-error');
  const dashboard = $('#dashboard');
  const locked = $('#locked');

  const SESSION_KEY = 'renika-admin';
  let passcode = sessionStorage.getItem(SESSION_KEY) || '';

  /* ---------- gate ---------- */
  function showGate() {
    gate.hidden = false;
    locked.hidden = true;
    dashboard.hidden = true;
    passcodeInput.focus();
  }

  function showLocked() {
    gate.hidden = true;
    locked.hidden = false;
    dashboard.hidden = true;
  }

  function showDashboard() {
    gate.hidden = true;
    locked.hidden = true;
    dashboard.hidden = false;
    loadStats();
  }

  gateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    gateError.textContent = '';
    const attempt = passcodeInput.value;
    const result = await fetchStats(attempt);
    if (result === 'ok') {
      passcode = attempt;
      sessionStorage.setItem(SESSION_KEY, passcode);
      showDashboard();
    } else if (result === 'locked') {
      showLocked();
    } else {
      gateError.textContent = 'Wrong passcode.';
      passcodeInput.select();
    }
  });

  /* ---------- data ---------- */
  const API = window.API_BASE || '';
  // Resolves to 'ok' | 'unauthorized' | 'locked' | 'error'.
  async function fetchStats(pc) {
    try {
      const res = await fetch(API + '/api/stats', {
        headers: pc ? { 'x-admin-passcode': pc } : {},
      });
      if (res.status === 503) return 'locked'; // server has no ADMIN_PASSCODE configured
      if (res.status === 401) return 'unauthorized';
      if (!res.ok) return 'error';
      const data = await res.json();
      renderStats(data);
      return 'ok';
    } catch {
      return 'error';
    }
  }

  async function loadStats() {
    const result = await fetchStats(passcode);
    if (result === 'ok') return;
    if (result === 'locked') {
      showLocked();
      return;
    }
    // passcode no longer valid (server restarted with a new one)
    sessionStorage.removeItem(SESSION_KEY);
    passcode = '';
    showGate();
  }

  function renderStats(data) {
    $('#stat-total').textContent = data.total.toLocaleString('en-US');
    $('#stat-today').textContent = data.today.toLocaleString('en-US');
    $('#stat-week').textContent = data.week.toLocaleString('en-US');
    renderChart(data.byDay);
    renderEvents(data.events || []);
    renderSources(data.sources || []);
    renderReferrers(data.referrers || []);
    renderRows(data.signups);
  }

  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const cell = (text, className) => {
    const td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text;
    return td;
  };
  function emptyRow(tbody, colSpan, text) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    const td = cell(text);
    td.colSpan = colSpan;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  const EVENT_LABELS = {
    page_view: 'Page view',
    cta_click: 'CTA click (Join the waitlist)',
    signup: 'Signup',
    example_view: 'Worked example viewed',
  };

  function renderEvents(events) {
    const tbody = $('#event-rows');
    tbody.innerHTML = '';
    if (!events.length) return emptyRow(tbody, 5, 'No events recorded yet.');
    const views = events.find((e) => e.name === 'page_view')?.total || 0;
    const frag = document.createDocumentFragment();
    for (const e of events) {
      const tr = document.createElement('tr');
      const rate = views ? Math.round((e.total / views) * 100) + '%' : '—';
      tr.append(
        cell(EVENT_LABELS[e.name] || e.name, 'event-name'),
        cell(fmt(e.total), 'num-col strong'),
        cell(fmt(e.week), 'num-col'),
        cell(fmt(e.today), 'num-col'),
        cell(e.name === 'page_view' ? '—' : rate, 'num-col muted')
      );
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
  }

  function renderSources(sources) {
    const tbody = $('#source-rows');
    tbody.innerHTML = '';
    if (!sources.length) return emptyRow(tbody, 4, 'No signups yet.');
    const frag = document.createDocumentFragment();
    for (const s of sources) {
      const tr = document.createElement('tr');
      tr.append(
        cell(s.utm_source || '(direct / untagged)', s.utm_source ? '' : 'muted'),
        cell(s.utm_medium || '—', s.utm_medium ? '' : 'muted'),
        cell(s.utm_campaign || '—', s.utm_campaign ? '' : 'muted'),
        cell(fmt(s.count), 'num-col strong')
      );
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
  }

  function renderReferrers(referrers) {
    const tbody = $('#referrer-rows');
    tbody.innerHTML = '';
    if (!referrers.length) return emptyRow(tbody, 2, 'No page views recorded yet.');
    const frag = document.createDocumentFragment();
    for (const r of referrers) {
      const tr = document.createElement('tr');
      let label = r.referrer;
      try { if (label !== '(direct)') label = new URL(label).host + new URL(label).pathname.replace(/\/$/, ''); } catch { /* keep raw */ }
      tr.append(cell(label, r.referrer === '(direct)' ? 'muted' : 'email'), cell(fmt(r.count), 'num-col strong'));
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
  }

  function sourceLabel(s) {
    const parts = [s.utm_source, s.utm_medium, s.utm_campaign].filter(Boolean);
    if (parts.length) return parts.join(' / ');
    if (s.referrer) {
      try { return new URL(s.referrer).host; } catch { return s.referrer; }
    }
    return 'direct';
  }

  function renderRows(signups) {
    const tbody = $('#rows');
    tbody.innerHTML = '';
    if (!signups.length) return emptyRow(tbody, 4, 'No signups yet — share the page to get the first one.');
    const frag = document.createDocumentFragment();
    for (const s of signups) {
      const tr = document.createElement('tr');
      const tagged = s.utm_source || s.utm_medium || s.utm_campaign || s.referrer;
      tr.append(
        cell('#' + s.position, 'pos'),
        cell(s.email, 'email'),
        cell(sourceLabel(s), tagged ? 'source' : 'source muted'),
        cell(new Date(s.created_at + 'Z').toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        }))
      );
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
  }

  /* ---------- chart ---------- */
  const canvas = $('#chart');
  const tip = $('#chart-tip');
  let chartData = [];

  function renderChart(byDay) {
    chartData = byDay;
    drawChart();
  }

  function drawChart() {
    const box = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const padL = 34, padR = 10, padT = 14, padB = 26;
    const iw = w - padL - padR, ih = h - padT - padB;
    const n = chartData.length;
    const max = Math.max(4, ...chartData.map((d) => d.count));
    const x = (i) => padL + (i / (n - 1)) * iw;
    const y = (c) => padT + ih - (c / max) * ih;

    // grid + y labels
    ctx.font = '11px "Bricolage Grotesque", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const v = Math.round((max / steps) * i);
      const gy = y(v);
      ctx.strokeStyle = 'rgba(30, 68, 80, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(w - padR, gy);
      ctx.stroke();
      ctx.fillStyle = 'rgba(143, 176, 176, 0.7)';
      ctx.fillText(String(v), padL - 8, gy);
    }

    // x labels (every 5 days)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i < n; i += 5) {
      const d = new Date(chartData[i].date + 'T00:00:00Z');
      ctx.fillStyle = 'rgba(143, 176, 176, 0.55)';
      ctx.fillText(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }), x(i), h - padB + 8);
    }

    // area fill
    const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
    grad.addColorStop(0, 'rgba(242, 107, 122, 0.30)');
    grad.addColorStop(1, 'rgba(242, 107, 122, 0.02)');
    ctx.beginPath();
    ctx.moveTo(x(0), y(chartData[0].count));
    chartData.forEach((d, i) => ctx.lineTo(x(i), y(d.count)));
    ctx.lineTo(x(n - 1), h - padB);
    ctx.lineTo(x(0), h - padB);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // line
    ctx.beginPath();
    chartData.forEach((d, i) => (i ? ctx.lineTo(x(i), y(d.count)) : ctx.moveTo(x(i), y(d.count))));
    ctx.strokeStyle = '#F26B7A';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // points (only where count > 0)
    chartData.forEach((d, i) => {
      if (!d.count) return;
      ctx.beginPath();
      ctx.arc(x(i), y(d.count), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#F26B7A';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0C2A33';
      ctx.stroke();
    });
  }

  // hover tooltip
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const padL = 34, padR = 10;
    const iw = rect.width - padL - padR;
    const n = chartData.length;
    if (!n) return;
    const i = Math.round(((e.clientX - rect.left - padL) / iw) * (n - 1));
    if (i < 0 || i >= n) {
      tip.style.opacity = 0;
      return;
    }
    const d = chartData[i];
    const date = new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
    });
    tip.innerHTML = `${date} — <strong>${d.count}</strong> signup${d.count === 1 ? '' : 's'}`;
    tip.style.left = padL + (i / (n - 1)) * iw + 'px';
    tip.style.top = '40px';
    tip.style.opacity = 1;
  });
  canvas.addEventListener('mouseleave', () => (tip.style.opacity = 0));

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawChart, 120);
  });

  /* ---------- wiring ---------- */
  $('#refresh').addEventListener('click', loadStats);

  if (passcode) {
    // validate stored passcode against the server
    loadStats();
  } else {
    showGate();
  }

  // auto-refresh every 30s while the dashboard is open
  setInterval(() => {
    if (!dashboard.hidden) loadStats();
  }, 30000);
})();
