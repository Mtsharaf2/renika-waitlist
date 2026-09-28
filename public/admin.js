/* RENiKA admin — passcode gate, stats, chart, waitlist table */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const gate = $('#gate');
  const gateForm = $('#gate-form');
  const passcodeInput = $('#passcode');
  const gateError = $('#gate-error');
  const dashboard = $('#dashboard');

  const SESSION_KEY = 'renika-admin';
  let passcode = sessionStorage.getItem(SESSION_KEY) || '';

  /* ---------- gate ---------- */
  function showGate() {
    gate.hidden = false;
    dashboard.hidden = true;
    passcodeInput.focus();
  }

  function showDashboard() {
    gate.hidden = true;
    dashboard.hidden = false;
    loadStats();
  }

  gateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    gateError.textContent = '';
    const attempt = passcodeInput.value;
    const ok = await fetchStats(attempt);
    if (ok) {
      passcode = attempt;
      sessionStorage.setItem(SESSION_KEY, passcode);
      showDashboard();
    } else {
      gateError.textContent = 'Wrong passcode.';
      passcodeInput.select();
    }
  });

  /* ---------- data ---------- */
  const API = window.API_BASE || '';
  async function fetchStats(pc) {
    try {
      const res = await fetch(API + '/api/stats', {
        headers: pc ? { 'x-admin-passcode': pc } : {},
      });
      if (!res.ok) return false; // 401 (bad passcode) or server error
      const data = await res.json();
      renderStats(data);
      return true;
    } catch {
      return false;
    }
  }

  async function loadStats() {
    const ok_ = await fetchStats(passcode);
    if (!ok_) {
      // passcode no longer valid (server restarted with a new one)
      sessionStorage.removeItem(SESSION_KEY);
      passcode = '';
      showGate();
    }
  }

  function renderStats(data) {
    $('#stat-total').textContent = data.total.toLocaleString('en-US');
    $('#stat-today').textContent = data.today.toLocaleString('en-US');
    $('#stat-week').textContent = data.week.toLocaleString('en-US');
    renderChart(data.byDay);
    renderRows(data.signups);
  }

  function renderRows(signups) {
    const tbody = $('#rows');
    tbody.innerHTML = '';
    if (!signups.length) {
      const tr = document.createElement('tr');
      tr.className = 'empty-row';
      const td = document.createElement('td');
      td.colSpan = 3;
      td.textContent = 'No signups yet — share the page to get the first one.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    const frag = document.createDocumentFragment();
    for (const s of signups) {
      const tr = document.createElement('tr');
      const pos = document.createElement('td');
      pos.className = 'pos';
      pos.textContent = '#' + s.position;
      const email = document.createElement('td');
      email.className = 'email';
      email.textContent = s.email;
      const at = document.createElement('td');
      at.textContent = new Date(s.created_at + 'Z').toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      });
      tr.append(pos, email, at);
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
