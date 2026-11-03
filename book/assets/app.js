/* Page behavior: theme, contents drawer, reading progress, scroll spy,
   reveal-on-scroll, copy buttons, figure lightbox, keyboard paging,
   math, pixel-digit chapter numbers, and the home-page network. */
(function () {
  'use strict';
  const doc = document.documentElement;
  doc.classList.add('js');
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const css = (v) => getComputedStyle(doc).getPropertyValue(v).trim();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* theme */
  const themeBtn = $('#theme-btn');
  if (themeBtn) themeBtn.addEventListener('click', () => {
    const dark = doc.dataset.theme ? doc.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    doc.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('ldl-theme', doc.dataset.theme); } catch (e) {}
    window.dispatchEvent(new Event('themechange'));
  });

  /* contents drawer (on the home page, the button scrolls to the parts) */
  const drawer = $('#drawer'), tocBtn = $('#toc-btn');
  if (tocBtn) tocBtn.addEventListener('click', (e) => {
    if (!drawer) {
      const parts = $('#part-I');
      if (parts) parts.scrollIntoView({ behavior: 'smooth' });
      else location.href = 'index.html#part-I';
      return;
    }
    e.stopPropagation();
    drawer.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (drawer && drawer.classList.contains('open') && !drawer.contains(e.target)) drawer.classList.remove('open');
  });

  /* progress bar + scroll spy */
  const bar = $('.progress i');
  const links = $$('.local a');
  const heads = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
  let ticking = false;
  function onScroll() {
    ticking = false;
    const h = doc.scrollHeight - innerHeight;
    if (bar) bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
    let cur = -1;
    heads.forEach((el, i) => { if (el.getBoundingClientRect().top < innerHeight * 0.3) cur = i; });
    links.forEach((a, i) => a.classList.toggle('active', i === cur));
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* reveal on scroll */
  const io = new IntersectionObserver((ents) => ents.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach((el) => io.observe(el));

  /* copy buttons */
  $$('.listing .copy').forEach((b) => b.addEventListener('click', () => {
    const text = b.closest('.listing').querySelector('pre.code').innerText;
    const done = () => { b.textContent = 'copied'; b.classList.add('done'); setTimeout(() => { b.textContent = 'copy'; b.classList.remove('done'); }, 1400); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => {});
  }));

  /* figure lightbox */
  $$('.fig-frame').forEach((f) => f.addEventListener('click', () => {
    const box = document.createElement('div');
    box.className = 'lightbox';
    box.innerHTML = `<div><img src="${f.querySelector('img').getAttribute('src')}" alt=""></div>`;
    box.addEventListener('click', () => box.remove());
    document.body.appendChild(box);
  }));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $$('.lightbox').forEach((b) => b.remove()); if (drawer) drawer.classList.remove('open'); }
    if (e.target.closest('input, textarea, .widget') || e.metaKey || e.ctrlKey || e.altKey) return;
    const body = document.body;
    if (e.key === 'ArrowRight' && body.dataset.next) location.href = body.dataset.next;
    if (e.key === 'ArrowLeft' && body.dataset.prev) location.href = body.dataset.prev;
  });

  /* ------------------------------------------------ pixel digits */
  const D = window.BOOKDATA;
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const samples = D ? b64(D.samples) : null;
  window.BOOK = { b64, samples, css };
  function digitIndex(d, k) {
    let seen = 0;
    for (let i = 0; i < D.sampleLabels.length; i++) if (D.sampleLabels[i] === d && seen++ === k) return i;
    return 0;
  }
  // A handwritten digit drawn as a grid of square cells that fill in, brightest first.
  function pixelDigit(canvas, idx, delay, small) {
    const px = samples.subarray(idx * 784, idx * 784 + 784);
    const cell = small ? 2 : 5, gap = small ? 0 : 1, N = 28;
    canvas.width = canvas.height = N * cell;
    const ctx = canvas.getContext('2d');
    const order = Array.from(px.keys()).filter((i) => px[i] > 20)
      .sort((a, b) => (px[b] - px[a]) + (Math.random() - 0.5) * 180);
    const t0 = performance.now() + (delay || 0);
    const dur = reduced || small ? 1 : 900;
    function frame(now) {
      const t = Math.max(0, Math.min(1, (now - t0) / dur));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const ink = css('--ink'), acc = css('--accent');
      ctx.fillStyle = css('--rule');
      for (let i = 0; i < 784; i += 1) if (px[i] <= 20 && (i % 2 === 0)) {
        ctx.globalAlpha = 0.35;
        if (!small) ctx.fillRect((i % N) * cell + 2, ((i / N) | 0) * cell + 2, 1, 1);
      }
      const shown = Math.floor(order.length * (1 - Math.pow(1 - t, 3)));
      for (let k = 0; k < shown; k++) {
        const i = order[k], v = px[i] / 255;
        ctx.globalAlpha = 0.25 + 0.75 * v;
        ctx.fillStyle = v > 0.92 && k % 7 === 0 ? acc : ink;
        ctx.fillRect((i % N) * cell, ((i / N) | 0) * cell, cell - gap, cell - gap);
      }
      ctx.globalAlpha = 1;
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return frame;
  }
  if (samples) {
    $$('[data-num]').forEach((el, j) => {
      const digits = String(el.dataset.num).split('').map(Number);
      const redraws = [];
      const start = () => digits.forEach((d, k) => {
        const c = document.createElement('canvas');
        el.appendChild(c);
        redraws.push(pixelDigit(c, digitIndex(d, (Number(el.dataset.num) + k) % 12), k * 160 + (el.classList.contains('card-num') ? 0 : 250), el.classList.contains('card-num')));
      });
      const o = new IntersectionObserver((es) => { if (es[0].isIntersecting) { o.disconnect(); start(); } });
      o.observe(el);
      addEventListener('themechange', () => redraws.forEach((f) => requestAnimationFrame(f)));
    });
  }

  /* ------------------------------------------------ home: a network reads digits */
  const hc = $('#hero-canvas');
  if (hc && D) hero(hc);

  function hero(cv) {
    const ctx = cv.getContext('2d');
    const net = window.Widgets.mlp;
    let W, H, dpr, geo;
    function layout() {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const wide = W > 960;
      const x0 = wide ? W * 0.5 : W * 0.06, x1 = wide ? W * 0.95 : W * 0.94;
      const h = wide ? Math.min(H * 0.7, (x1 - x0) * 0.56) : Math.min(H * 0.26, (x1 - x0) * 0.42);
      const y0 = wide ? (H - h) / 2 : H - h - 96;
      const cell = h / 28;
      geo = { wide, x0, x1, y0, h, cell,
        hx: x0 + 28 * cell + (x1 - x0 - 28 * cell) * 0.42,
        ox: x1 - 34, alpha: wide ? 1 : 0.55 };
    }
    layout();
    addEventListener('resize', layout);

    let k = 0, t0 = performance.now(), cur = null, drawing = null, idle = 0;
    const order = Array.from({ length: D.sampleLabels.length }, (_, i) => i);
    const cap = $('#hero-caption');
    // run the network on a 28x28 image (values 0-255) and keep what the animation needs
    function show(px, mine) {
      const x = Float32Array.from(px, (v) => v / 255);
      const r = net.forward(x);
      const sortedHidden = Array.from(r.h.keys()).sort((a, b) => r.h[b] - r.h[a]);
      const bright = Array.from(px.keys()).filter((i) => px[i] > 140);
      // strongest pixel->hidden contributions, for the drawn connections
      const links = [];
      for (const j of sortedHidden.slice(0, 14)) {
        const best = bright.map((i) => [i, x[i] * net.w1[j * 784 + i]]).sort((a, b) => b[1] - a[1]);
        best.slice(0, 3).forEach(([i]) => links.push([i, j]));
      }
      const empty = !bright.length;
      cur = { px, r, links, empty, hmax: Math.max(...r.h, 1e-6), pred: r.p.indexOf(Math.max(...r.p)),
        order: Array.from(px.keys()).filter((i) => px[i] > 15).sort(() => Math.random() - 0.5) };
      if (cap) cap.textContent = empty ? 'Draw a digit in the grid. The network reads it as you draw.'
        : `Live: a 784 → 64 → 10 network, running in your browser, reads ${mine ? 'your drawing' : 'a test digit'} as ${cur.pred} (${Math.round(r.p[cur.pred] * 100)}% sure)${mine ? '' : ' · draw your own in the grid'}`;
    }
    function next() {
      const idx = order[k++ % order.length];
      show(samples.subarray(idx * 784, idx * 784 + 784), false);
      t0 = performance.now();
    }
    next();

    // drawing on the input grid: a soft round brush, like a pen on MNIST's scale
    function cellAt(e) {
      const r = cv.getBoundingClientRect(), { x0, y0, cell } = geo;
      const gx = (e.clientX - r.left - x0) / cell, gy = (e.clientY - r.top - y0) / cell;
      return gx >= -1 && gx < 29 && gy >= -1 && gy < 29 ? [gx, gy] : null;
    }
    function ink(gx, gy) {
      for (let y = Math.floor(gy - 2); y <= gy + 2; y++) for (let x = Math.floor(gx - 2); x <= gx + 2; x++) {
        if (x < 0 || y < 0 || x > 27 || y > 27) continue;
        const d = Math.hypot(x + 0.5 - gx, y + 0.5 - gy), v = 255 * Math.max(0, Math.min(1, 1.6 - d));
        drawing[y * 28 + x] = Math.max(drawing[y * 28 + x], v);
      }
    }
    let last = null;
    cv.addEventListener('pointerdown', (e) => {
      const c = cellAt(e);
      if (!c) { if (!drawing) next(); return; }
      if (!drawing || performance.now() - idle > 2500) drawing = new Uint8ClampedArray(784);
      cv.setPointerCapture(e.pointerId); last = c; ink(...c); show(drawing, true);
    });
    cv.addEventListener('pointermove', (e) => {
      const c = cellAt(e);
      cv.style.cursor = c ? 'crosshair' : 'pointer';
      if (!last || !c) return;
      const n = Math.ceil(Math.hypot(c[0] - last[0], c[1] - last[1]) * 3) || 1;
      for (let i = 1; i <= n; i++) ink(last[0] + (c[0] - last[0]) * i / n, last[1] + (c[1] - last[1]) * i / n);
      last = c; show(drawing, true);
    });
    const up = () => { if (last) { last = null; idle = performance.now(); } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

    // only animate while the hero is on screen and the tab is visible
    let visible = true;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(cv);

    const ease = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
    function hpos(j) {
      const { y0, h, hx } = geo;
      const col = j % 2, row = (j / 2) | 0;
      return [hx + col * 10, y0 + (row + 0.5) * (h / 32)];
    }
    function opos(d) {
      const { y0, h, ox } = geo;
      return [ox, y0 + h * 0.08 + d * (h * 0.84 / 9)];
    }
    function draw(now) {
      if (!cur) return;
      if (drawing && !last && now - idle > 6000) { drawing = null; next(); }
      const T = drawing ? 4.4 : reduced ? 4.4 : (now - t0) / 1000;
      if (T > 6.2) next();
      const { x0, y0, cell, alpha } = geo;
      const ink = css('--ink'), acc = css('--accent'), rule = css('--rule'), muted = css('--muted');
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = alpha;
      const fadeOut = 1 - ease((T - 5.6) / 0.6);
      // input grid
      const a1 = ease(T / 1.1);
      ctx.fillStyle = rule;
      for (let i = 0; i < 784; i++) ctx.fillRect(x0 + (i % 28) * cell + cell / 2 - 1, y0 + ((i / 28) | 0) * cell + cell / 2 - 1, 2, 2);
      const n = Math.floor(cur.order.length * a1);
      for (let q = 0; q < n; q++) {
        const i = cur.order[q], v = cur.px[i] / 255;
        ctx.globalAlpha = alpha * fadeOut * (0.15 + 0.85 * v);
        ctx.fillStyle = ink;
        ctx.fillRect(x0 + (i % 28) * cell + 0.5, y0 + ((i / 28) | 0) * cell + 0.5, cell - 1.5, cell - 1.5);
      }
      // an invitation to draw
      ctx.globalAlpha = alpha * (drawing ? 0.9 : 0.5);
      ctx.strokeStyle = drawing ? acc : muted; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.strokeRect(x0 - 6, y0 - 6, 28 * cell + 12, 28 * cell + 12); ctx.setLineDash([]);
      ctx.fillStyle = drawing ? acc : muted; ctx.font = '500 10.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(drawing ? 'YOUR DIGIT' : 'DRAW HERE', x0 - 6, y0 + 28 * cell + 12);
      // connections input -> hidden, with travelling pulses
      const a2 = ease((T - 1.0) / 1.2);
      ctx.lineWidth = 1;
      for (const [i, j] of cur.links) {
        const sx = x0 + (i % 28 + 0.5) * cell, sy = y0 + (((i / 28) | 0) + 0.5) * cell;
        const [ex, ey] = hpos(j);
        ctx.globalAlpha = alpha * fadeOut * 0.18 * a2;
        ctx.strokeStyle = ink;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        const p = (T - 1.0) / 1.2;
        if (p > 0 && p < 1) {
          ctx.globalAlpha = alpha * 0.9;
          ctx.fillStyle = acc;
          ctx.fillRect(sx + (ex - sx) * p - 1.5, sy + (ey - sy) * p - 1.5, 3, 3);
        }
      }
      // hidden units (real activations)
      const a3 = ease((T - 1.9) / 0.8);
      for (let j = 0; j < 64; j++) {
        const [hx, hy] = hpos(j);
        const v = cur.r.h[j] / cur.hmax;
        ctx.globalAlpha = alpha * fadeOut * (0.12 + 0.88 * v * a3);
        ctx.fillStyle = v > 0.55 && a3 > 0.5 ? acc : ink;
        const s = Math.max(4, geo.h / 40);
        ctx.fillRect(hx - s / 2, hy - s / 2, s, s);
      }
      // hidden -> output
      const a4 = ease((T - 2.6) / 1.0);
      for (let d = 0; d < 10; d++) {
        const [ox, oy] = opos(d);
        for (let j = 0; j < 64; j += 3) {
          const [hx, hy] = hpos(j);
          const c = cur.r.h[j] * net.w2[d * 64 + j];
          if (c <= 0.4) continue;
          ctx.globalAlpha = alpha * fadeOut * Math.min(0.25, c * 0.05) * a4;
          ctx.strokeStyle = d === cur.pred ? acc : ink;
          ctx.beginPath(); ctx.moveTo(hx + 4, hy); ctx.lineTo(ox - 26, oy); ctx.stroke();
        }
      }
      // outputs: digit + probability bar
      const a5 = ease((T - 3.2) / 0.9);
      ctx.font = `500 ${Math.max(11, geo.h / 28)}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let d = 0; d < 10; d++) {
        const [ox, oy] = opos(d);
        const p = cur.empty ? 0 : cur.r.p[d] * a5, win = !cur.empty && d === cur.pred && a5 > 0.6;
        ctx.globalAlpha = alpha * fadeOut * (win ? 1 : 0.55);
        ctx.fillStyle = win ? acc : muted;
        ctx.fillText(String(d), ox - 8, oy);
        ctx.fillStyle = win ? acc : rule;
        ctx.fillRect(ox - 2, oy - 4, 2 + 32 * p, 8);
      }
      // the one answer
      if (a5 > 0 && !cur.empty) {
        ctx.globalAlpha = alpha * fadeOut * a5;
        ctx.fillStyle = acc;
        ctx.font = `italic 350 ${geo.h * 0.16}px Fraunces, Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.fillText(String(cur.pred), geo.hx + (geo.ox - geo.hx) * 0.45, geo.y0 + geo.h + geo.h * 0.12);
      }
      ctx.globalAlpha = 1;
    }
    (function loop(now) { if (visible && !document.hidden) draw(now); requestAnimationFrame(loop); })(performance.now());
  }
})();
