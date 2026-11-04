/* Interactive demos. Each <div class="widget" data-widget="name"> is built
   by WIDGETS[name](el) when it first scrolls into view. Plain canvas + DOM. */
(function () {
  'use strict';
  const D = window.BOOKDATA;
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- the small network used by the hero and the classifier */
  const mlp = (() => {
    const m = D.mlp;
    const deq = ({ q, s }) => {
      const v = new Int8Array(b64(q).buffer), n = v.length / s.length;
      return Float32Array.from(v, (x, i) => x * s[(i / n) | 0]);
    };
    const w1 = deq(m.w1), b1 = Float32Array.from(m.b1);
    const w2 = deq(m.w2), b2 = Float32Array.from(m.b2);
    function forward(x) {
      const h = new Float32Array(64), z = new Float32Array(10);
      for (let j = 0; j < 64; j++) {
        let s = b1[j];
        const o = j * 784;
        for (let i = 0; i < 784; i++) s += w1[o + i] * x[i];
        h[j] = s > 0 ? s : 0;
      }
      for (let d = 0; d < 10; d++) {
        let s = b2[d];
        for (let j = 0; j < 64; j++) s += w2[d * 64 + j] * h[j];
        z[d] = s;
      }
      const mx = Math.max(...z);
      const e = Array.from(z, (v) => Math.exp(v - mx));
      const sum = e.reduce((a, b) => a + b, 0);
      return { h, z, p: e.map((v) => v / sum) };
    }
    return { w1, b1, w2, b2, forward };
  })();

  /* ---------------- helpers */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') el.className = attrs[k];
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    }
    kids.flat().forEach((c) => c != null && el.append(c.nodeType ? c : document.createTextNode(c)));
    return el;
  }
  function frame(el, title, note) {
    el.append(h('span', { class: 'w-tag' }, 'Interactive'), h('div', { class: 'w-title' }, title));
    if (note) { const p = h('p', { class: 'w-note' }); p.innerHTML = note; el.append(p); }
  }
  // text on a canvas that has been shrunk to fit a phone grows back, within limits
  function fpx(c, px) {
    const k = Math.min(1.6, Math.max(1, c.W / (c.clientWidth || c.W)));
    return Math.round(px * k);
  }
  function canvas(w, hgt, cls) {
    const c = h('canvas', { class: 'w-canvas ' + (cls || '') });
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = w * dpr; c.height = hgt * dpr;
    c.style.width = w + 'px'; c.style.aspectRatio = `${w} / ${hgt}`;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.W = w; c.H = hgt;
    // only canvases that respond to touch should stop the page scrolling
    const add = c.addEventListener.bind(c);
    c.addEventListener = (type, ...rest) => {
      if (/^(pointer|touch|mouse)/.test(type)) c.classList.add('interactive');
      return add(type, ...rest);
    };
    return [c, ctx];
  }
  function slider(label, min, max, step, value, fmt, on) {
    const out = h('output', {}, fmt(value));
    const inp = h('input', { type: 'range', min, max, step, value, 'aria-label': label });
    inp.addEventListener('input', () => { out.textContent = fmt(+inp.value); on(+inp.value); });
    const lab = h('label', {}, label, inp, out);
    lab.input = inp; lab.set = (v) => { inp.value = v; out.textContent = fmt(v); };
    return lab;
  }
  function btn(text, on, cls) { return h('button', { type: 'button', class: 'w-btn ' + (cls || ''), onclick: on }, text); }
  function chips(names, cur, on) {
    const wrap = h('div', { class: 'w-chips' });
    const bs = names.map((n) => btn(n, () => { bs.forEach((b) => b.classList.toggle('on', b === bb[n])); on(n); }));
    const bb = {}; names.forEach((n, i) => { bb[n] = bs[i]; });
    bs.forEach((b, i) => b.classList.toggle('on', names[i] === cur));
    wrap.append(...bs);
    return wrap;
  }
  function bars(n, labels) {
    const wrap = h('div', { class: 'bars' });
    const rows = Array.from({ length: n }, (_, i) => {
      const fill = h('div', { class: 'fill' });
      const val = h('span', {}, '');
      const r = h('div', { class: 'bar' }, h('b', {}, labels ? labels[i] : String(i)), h('div', { class: 'track' }, fill), val);
      wrap.append(r);
      return { r, fill, val };
    });
    wrap.set = (vals, fmt, max, winner) => {
      const top = winner != null ? winner : vals.indexOf(Math.max(...vals));
      const m = max || Math.max(...vals.map(Math.abs), 1e-9);
      rows.forEach((row, i) => {
        row.fill.style.width = clamp(vals[i] / m, 0, 1) * 100 + '%';
        row.val.textContent = fmt(vals[i]);
        row.r.classList.toggle('top', i === top);
      });
    };
    return wrap;
  }
  // diverging color for a value in [-1, 1]
  function div(v) {
    const pos = hex(css('--pos')), neg = hex(css('--neg')), mid = hex(css('--card'));
    const c = v >= 0 ? pos : neg, t = Math.min(1, Math.abs(v));
    return `rgb(${mid.map((m, i) => Math.round(m + (c[i] - m) * t)).join(',')})`;
  }
  function hex(s) {
    s = s.replace('#', '');
    if (s.length === 3) s = s.split('').map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  }
  const onTheme = (f) => addEventListener('themechange', f);
  // keyboard control for a canvas: arrow keys call fn(dx, dy, shift)
  function keys(c, label, fn) {
    c.tabIndex = 0;
    c.setAttribute('aria-label', label);
    c.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault();
      fn(d[0], d[1], e.shiftKey);
    });
  }

  /* ---------------- drawing pad that produces an MNIST-style 28x28 input */
  function pad(onChange) {
    const S = 224;
    const [c, ctx] = canvas(S, S, 'pad');
    c.style.background = '#000'; c.style.cursor = 'crosshair'; c.style.borderRadius = '10px';
    const ink = document.createElement('canvas'); ink.width = ink.height = 280;
    const ic = ink.getContext('2d', { willReadFrequently: true });
    ic.lineCap = ic.lineJoin = 'round'; ic.strokeStyle = '#fff'; ic.lineWidth = 22;
    let last = null, dirty = false;
    function pos(e) { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 280, (e.clientY - r.top) / r.height * 280]; }
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); last = pos(e); stroke(last); });
    c.addEventListener('pointermove', (e) => { if (last) { const p = pos(e); stroke(p); last = p; } });
    const up = () => { last = null; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    function stroke(p) {
      ic.beginPath(); ic.moveTo(last[0], last[1]); ic.lineTo(p[0] + 0.01, p[1]); ic.stroke();
      paint(); dirty = true;
    }
    function paint() {
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(ink, 0, 0, S, S);
    }
    setInterval(() => { if (dirty) { dirty = false; onChange(read()); } }, 60);
    // MNIST preprocessing: fit the bounding box in 20x20, then center by mass in 28x28
    function read() {
      const big = ic.getImageData(0, 0, 280, 280).data;
      let x0 = 280, y0 = 280, x1 = -1, y1 = -1;
      for (let y = 0; y < 280; y++) for (let x = 0; x < 280; x++) if (big[(y * 280 + x) * 4] > 20) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      const out = new Float32Array(784);
      if (x1 < 0) return out;
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, s = 20 / Math.max(bw, bh);
      const t = document.createElement('canvas'); t.width = t.height = 28;
      const tc = t.getContext('2d');
      tc.imageSmoothingQuality = 'high';
      const w = bw * s, hh = bh * s;
      tc.drawImage(ink, x0, y0, bw, bh, (28 - w) / 2, (28 - hh) / 2, w, hh);
      const d = tc.getImageData(0, 0, 28, 28).data;
      let m = 0, mx = 0, my = 0;
      for (let i = 0; i < 784; i++) { const v = d[i * 4] / 255; m += v; mx += v * (i % 28); my += v * ((i / 28) | 0); }
      const dx = Math.round(14 - mx / m), dy = Math.round(14 - my / m);
      for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) {
        const sx = x - dx, sy = y - dy;
        if (sx >= 0 && sx < 28 && sy >= 0 && sy < 28) out[y * 28 + x] = d[(sy * 28 + sx) * 4] / 255;
      }
      return out;
    }
    function clear() { ic.clearRect(0, 0, 280, 280); paint(); onChange(new Float32Array(784)); }
    function load(px) {
      ic.clearRect(0, 0, 280, 280);
      const t = document.createElement('canvas'); t.width = t.height = 28;
      const tc = t.getContext('2d'), im = tc.createImageData(28, 28);
      for (let i = 0; i < 784; i++) { im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = px[i]; im.data[i * 4 + 3] = 255; }
      tc.putImageData(im, 0, 0);
      ic.imageSmoothingEnabled = true; ic.globalCompositeOperation = 'lighter';
      ic.drawImage(t, 0, 0, 280, 280); ic.globalCompositeOperation = 'source-over';
      paint(); onChange(Float32Array.from(px, (v) => v / 255));
    }
    return { el: c, clear, load };
  }
  function drawDigit(ctx, x, X, Y, size, color) {
    const cell = size / 28;
    for (let i = 0; i < 784; i++) if (x[i] > 0.02) {
      ctx.globalAlpha = x[i];
      ctx.fillStyle = color;
      ctx.fillRect(X + (i % 28) * cell, Y + ((i / 28) | 0) * cell, cell + 0.3, cell + 0.3);
    }
    ctx.globalAlpha = 1;
  }
  const samples = b64(D.samples);
  const randomSample = () => { const k = (Math.random() * D.sampleLabels.length) | 0; return samples.subarray(k * 784, k * 784 + 784); };

  const W = {};

  /* ---------------- 1. a neuron is a dot product */
  W.neuron = (el) => {
    frame(el, 'A neuron is a weighted vote',
      'Each input <code>x</code> is multiplied by its weight <code>w</code>; the products are added. Drag the sliders. Positive weights (orange) push the sum up, negative weights (blue) pull it down, and a weight near zero ignores its input.');
    const x = [0.8, 0.3, 0.9, 0.5], w = [1.2, -0.7, 0.4, -1.5];
    const rows = h('div', { style: 'display:grid;gap:10px' });
    const [c, ctx] = canvas(560, 150);
    const total = h('div', { class: 'w-kv' });
    function draw() {
      const Wd = c.W;
      ctx.clearRect(0, 0, Wd, c.H);
      const mid = Wd / 2, scale = Wd / 8;
      ctx.fillStyle = css('--rule'); ctx.fillRect(mid - 0.5, 0, 1, 112);
      let s = 0;
      x.forEach((xi, i) => {
        const p = xi * w[i];
        ctx.fillStyle = div(Math.sign(p) * 0.9);
        const y = 6 + i * 24;
        ctx.fillRect(p >= 0 ? mid : mid + p * scale, y, Math.abs(p) * scale, 16);
        ctx.fillStyle = css('--muted'); ctx.font = `${fpx(c, 12)}px "JetBrains Mono", monospace`;
        ctx.textAlign = p >= 0 ? 'left' : 'right';
        ctx.fillText(`x${i + 1}·w${i + 1} = ${p.toFixed(2)}`, p >= 0 ? mid + p * scale + 6 : mid + p * scale - 6, y + 12);
        s += p;
      });
      const y = 118;
      ctx.fillStyle = s >= 0 ? css('--pos') : css('--neg');
      ctx.fillRect(s >= 0 ? mid : mid + s * scale, y, Math.abs(s) * scale, 22);
      ctx.fillStyle = css('--ink'); ctx.font = `600 ${fpx(c, 13)}px "JetBrains Mono", monospace`;
      ctx.textAlign = s >= 0 ? 'left' : 'right';
      ctx.fillText(`sum = ${s.toFixed(2)}`, s >= 0 ? mid + s * scale + 8 : mid + s * scale - 8, y + 15);
      total.innerHTML = `x @ w = ${x.map((v, i) => `(${v.toFixed(1)})(${w[i].toFixed(1)})`).join(' + ')} = <b>${s.toFixed(3)}</b> &nbsp;→&nbsp; ${s > 0 ? '<b style="color:var(--accent)">fires</b>' : 'stays quiet'}`;
    }
    x.forEach((_, i) => rows.append(h('div', { class: 'w-ctrl', style: 'margin:0' },
      slider(`x${i + 1}`, 0, 1, 0.05, x[i], (v) => v.toFixed(2), (v) => { x[i] = v; draw(); }),
      slider(`w${i + 1}`, -2, 2, 0.05, w[i], (v) => v.toFixed(2), (v) => { w[i] = v; draw(); }))));
    el.append(rows, h('div', { style: 'margin-top:16px' }, c), total);
    draw(); onTheme(draw);
  };

  /* ---------------- 2. pixels are numbers */
  W.pixels = (el) => {
    frame(el, 'Every pixel is a number',
      'Move over the picture (or drag on a phone). The magnifier shows the numbers stored under your cursor. In color each pixel holds three: red, green, blue.');
    const imgs = { camera: D.camera, cat: D.cat };
    let name = 'camera', R = 7, hover = [80, 80];
    const [c, ctx] = canvas(320, 320);
    const [m, mctx] = canvas(300, 300);
    const readout = h('div', { class: 'w-kv', style: 'margin-top:10px' });
    let px, iw, ih, color, scale, off;
    function load() {
      const im = imgs[name];
      px = b64(im.px); iw = im.w; ih = im.h; color = px.length === iw * ih * 3;
      scale = Math.min(320 / iw, 320 / ih);
      // the canvas takes the photo's shape, so a wide photo leaves no empty bands
      const ch = Math.round(ih * scale), dpr = Math.min(2, devicePixelRatio || 1);
      c.height = ch * dpr; c.H = ch; c.style.aspectRatio = `320 / ${ch}`; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = (el.clientWidth || 600) < 520 ? 4 : 7;
      const t = document.createElement('canvas'); t.width = iw; t.height = ih;
      const tc = t.getContext('2d'), d = tc.createImageData(iw, ih);
      for (let i = 0; i < iw * ih; i++) {
        for (let k = 0; k < 3; k++) d.data[i * 4 + k] = color ? px[i * 3 + k] : px[i];
        d.data[i * 4 + 3] = 255;
      }
      tc.putImageData(d, 0, 0);
      off = t;
      hover = [iw >> 1, ih >> 1];
      draw();
    }
    function val(x, y) { const i = y * iw + x; return color ? [px[i * 3], px[i * 3 + 1], px[i * 3 + 2]] : [px[i]]; }
    function draw() {
      ctx.clearRect(0, 0, 320, c.H);
      ctx.imageSmoothingEnabled = false;
      const w = iw * scale, hh = ih * scale, ox = (320 - w) / 2, oy = (c.H - hh) / 2;
      ctx.drawImage(off, ox, oy, w, hh);
      const [hx, hy] = hover;
      ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2;
      ctx.strokeRect(ox + (hx - R) * scale, oy + (hy - R) * scale, (2 * R + 1) * scale, (2 * R + 1) * scale);
      const n = 2 * R + 1, cs = 300 / n;
      mctx.clearRect(0, 0, 300, 300);
      mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x = clamp(hx - R + i, 0, iw - 1), y = clamp(hy - R + j, 0, ih - 1);
        const v = val(x, y);
        mctx.fillStyle = color ? `rgb(${v})` : `rgb(${v[0]},${v[0]},${v[0]})`;
        mctx.fillRect(i * cs, j * cs, cs - 1, cs - 1);
        const lum = color ? 0.3 * v[0] + 0.59 * v[1] + 0.11 * v[2] : v[0];
        mctx.fillStyle = lum > 128 ? 'rgba(0,0,0,.75)' : 'rgba(255,255,255,.8)';
        const fs = Math.min(color ? cs * 0.27 : cs * 0.4, fpx(m, color ? 6.5 : 8.5));
        mctx.font = `${fs}px "JetBrains Mono", monospace`;
        if (color) v.forEach((u, k) => mctx.fillText(u, i * cs + cs / 2, j * cs + cs / 2 + (k - 1) * fs));
        else mctx.fillText(v[0], i * cs + cs / 2, j * cs + cs / 2);
      }
      mctx.strokeStyle = css('--accent'); mctx.lineWidth = 2;
      mctx.strokeRect(R * cs, R * cs, cs - 1, cs - 1);
      const v = val(hx, hy);
      readout.innerHTML = `img[<b>${hy}</b>, <b>${hx}</b>] = <b>${color ? '[' + v.join(', ') + ']' : v[0]}</b> &nbsp; shape ${color ? `(${ih}, ${iw}, 3)` : `(${ih}, ${iw})`}`;
    }
    function move(e) {
      const r = c.getBoundingClientRect();
      const sx = (e.clientX - r.left) / r.width * 320, sy = (e.clientY - r.top) / r.height * c.H;
      const w = iw * scale, hh = ih * scale, ox = (320 - w) / 2, oy = (c.H - hh) / 2;
      hover = [clamp(Math.floor((sx - ox) / scale), 0, iw - 1), clamp(Math.floor((sy - oy) / scale), 0, ih - 1)];
      draw();
    }
    c.addEventListener('pointermove', move); c.addEventListener('pointerdown', move);
    c.style.cursor = 'crosshair';
    keys(c, 'Photograph. Arrow keys move the magnifier; hold Shift for single pixels.', (dx, dy, fine) => {
      const k = fine ? 1 : 4;
      hover = [clamp(hover[0] + dx * k, 0, iw - 1), clamp(hover[1] + dy * k, 0, ih - 1)]; draw();
    });
    el.append(h('div', { class: 'w-row' }, h('div', {}, c), h('div', {}, m)), readout,
      h('div', { class: 'w-ctrl' }, chips(['camera', 'cat'], name, (n) => { name = n; load(); })));
    load(); onTheme(draw);
  };

  /* ---------------- 3. templates: compare a drawing to the ten average digits */
  W.templates = (el) => {
    frame(el, 'Draw a digit, match a template',
      'Draw in the black square. Your drawing is compared with each of the ten average digits from the 60,000 training images, in both of the ways described above. Switch between them: the <b>dot product</b> rewards ink, so the heavy templates such as 0 and 8 often win; the <b>distance</b> picks the template your drawing is closest to.');
    const means = b64(D.means);
    const T = Array.from({ length: 10 }, (_, d) => Float32Array.from(means.subarray(d * 784, d * 784 + 784), (u) => u / 255));
    const [tc, tctx] = canvas(300, 120);
    const b = bars(10);
    let mode = 'distance', x = new Float32Array(784), winner = -1;
    function score() {
      const dot = T.map((t) => t.reduce((s, u, i) => s + u * x[i], 0));
      const dist = T.map((t) => t.reduce((s, u, i) => s + (u - x[i]) ** 2, 0));
      const empty = !x.some((v) => v > 0);
      if (mode === 'dot product') {
        winner = empty ? -1 : dot.indexOf(Math.max(...dot));
        b.set(dot, (v) => v.toFixed(0));
      } else {
        winner = empty ? -1 : dist.indexOf(Math.min(...dist));
        b.set(dist, (v) => v.toFixed(0), null, winner);
      }
      drawT();
    }
    function drawT() {
      tctx.clearRect(0, 0, 300, 120);
      for (let d = 0; d < 10; d++) {
        const X = (d % 5) * 60, Y = ((d / 5) | 0) * 60;
        tctx.fillStyle = d === winner ? css('--accent') : '#000';
        tctx.fillRect(X + 2, Y + 2, 54, 54);
        drawDigit(tctx, T[d], X + 2, Y + 2, 54, '#fff');
      }
    }
    const p = pad((v) => { x = v; score(); });
    el.append(h('div', { class: 'w-row' },
      h('div', {}, p.el, h('div', { class: 'w-ctrl' }, btn('clear', p.clear), btn('a real digit', () => p.load(randomSample())))),
      h('div', { class: 'w-col' }, tc,
        h('div', { class: 'w-ctrl', style: 'margin:10px 0 12px' }, chips(['dot product', 'distance'], mode, (m) => { mode = m; score(); })),
        b)));
    p.load(randomSample()); onTheme(drawT);
  };

  /* ---------------- 4. a trained network classifies your drawing */
  W.classify = (el) => {
    frame(el, 'A trained network, live',
      'This is a network shaped like the one above (784 inputs, 64 hidden units with ReLU, 10 outputs), trained on MNIST and running in your page. Draw a digit. The strip shows the 64 hidden units; the bars are the softmax probabilities.');
    const [ic, ictx] = canvas(112, 112);
    const [hc, hctx] = canvas(256, 34);
    const b = bars(10);
    let last = null;
    function draw() {
      if (!last) return;
      ictx.fillStyle = '#000'; ictx.fillRect(0, 0, 112, 112);
      drawDigit(ictx, last.x, 0, 0, 112, '#fff');
      const r = last.r, mx = Math.max(...r.h, 1e-6);
      hctx.clearRect(0, 0, 256, 34);
      for (let j = 0; j < 64; j++) {
        hctx.fillStyle = css('--accent'); hctx.globalAlpha = 0.08 + 0.92 * r.h[j] / mx;
        hctx.fillRect((j % 32) * 8, ((j / 32) | 0) * 17, 7, 16);
      }
      hctx.globalAlpha = 1;
    }
    const p = pad((x) => {
      const r = mlp.forward(x);
      last = { x, r };
      b.set(Math.max(...x) > 0 ? r.p : new Array(10).fill(0), (v) => (v * 100).toFixed(0) + '%', 1);
      draw();
    });
    el.append(h('div', { class: 'w-row' },
      h('div', {}, p.el, h('div', { class: 'w-ctrl' }, btn('clear', p.clear), btn('a test digit', () => p.load(randomSample())))),
      h('div', { class: 'w-col' },
        h('div', { class: 'w-row', style: 'gap:14px;align-items:flex-end' },
          h('div', {}, h('div', { class: 'w-kv' }, 'what it sees (28×28)'), ic),
          h('div', {}, h('div', { class: 'w-kv' }, '64 hidden units'), hc)),
        h('div', { style: 'margin-top:14px' }, b))));
    p.load(randomSample()); onTheme(draw);
  };

  /* ---------------- 5. random search vs hill climbing on a landscape */
  W.climb = (el) => {
    frame(el, 'Guessing, with and without memory',
      'The landscape is a score to maximize over two weights (brighter is better). <b>Random search</b> throws darts anywhere. <b>Hill climbing</b> keeps its best guess and tries small random changes to it, keeping a change only if it scores higher. It can stall on a lesser peak; try a few runs.');
    const N = 200;
    const peaks = [[0.72, 0.3, 0.13, 1], [0.25, 0.7, 0.1, 0.75], [0.6, 0.78, 0.07, 0.6], [0.2, 0.2, 0.09, 0.5]];
    const f = (x, y) => peaks.reduce((s, [a, b, r, hgt]) => s + hgt * Math.exp(-((x - a) ** 2 + (y - b) ** 2) / (2 * r * r)), 0)
      + 0.06 * Math.sin(9 * x) * Math.cos(7 * y);
    const [c, ctx] = canvas(340, 340);
    const field = document.createElement('canvas'); field.width = field.height = N;
    let fmax = 0;
    const vals = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const v = f(i / N, j / N); vals[j * N + i] = v; fmax = Math.max(fmax, v); }
    function paintField() {
      const fc = field.getContext('2d'), im = fc.createImageData(N, N);
      const dark = hex(css('--card')), hi = hex(css('--accent'));
      for (let k = 0; k < N * N; k++) {
        const t = Math.pow(Math.max(0, vals[k]) / fmax, 1.4);
        const band = Math.abs((t * 10) % 1 - 0.5) < 0.04 ? 0.18 : 0;
        for (let q = 0; q < 3; q++) im.data[k * 4 + q] = dark[q] + (hi[q] - dark[q]) * Math.min(1, t * 0.85 + band);
        im.data[k * 4 + 3] = 255;
      }
      fc.putImageData(im, 0, 0);
    }
    paintField();
    let mode = 'hill climbing', pts = [], best = null, steps = 0, timer = null;
    const info = h('div', { class: 'w-kv', style: 'margin-top:10px' });
    function reset() {
      pts = []; steps = 0;
      const x = Math.random(), y = Math.random();
      best = { x, y, v: f(x, y) };
      pts.push({ ...best, kept: true });
      draw();
    }
    function step() {
      steps++;
      let x, y;
      if (mode === 'random search') { x = Math.random(); y = Math.random(); }
      else { x = clamp(best.x + (Math.random() - 0.5) * 0.12, 0, 1); y = clamp(best.y + (Math.random() - 0.5) * 0.12, 0, 1); }
      const v = f(x, y), kept = v > best.v;
      if (kept) best = { x, y, v };
      pts.push({ x, y, v, kept });
      if (pts.length > 400) pts.shift();
      draw();
    }
    function draw() {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(field, 0, 0, 340, 340);
      let prev = null;
      for (const p of pts) {
        if (p.kept) {
          if (prev && mode === 'hill climbing') {
            ctx.strokeStyle = css('--ink'); ctx.lineWidth = 1.5; ctx.beginPath();
            ctx.moveTo(prev.x * 340, prev.y * 340); ctx.lineTo(p.x * 340, p.y * 340); ctx.stroke();
          }
          prev = p;
        }
        ctx.fillStyle = p.kept ? css('--ink') : 'rgba(127,127,127,.5)';
        ctx.fillRect(p.x * 340 - (p.kept ? 2.5 : 1.5), p.y * 340 - (p.kept ? 2.5 : 1.5), p.kept ? 5 : 3, p.kept ? 5 : 3);
      }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(best.x * 340, best.y * 340, 7, 0, 7); ctx.stroke();
      info.innerHTML = `${mode} · guesses <b>${steps}</b> · best score <b>${(best.v / fmax * 100).toFixed(1)}%</b> of the highest peak`;
    }
    function run() {
      if (timer) { clearInterval(timer); timer = null; go.textContent = 'run'; go.classList.remove('on'); return; }
      go.textContent = 'pause'; go.classList.add('on');
      timer = setInterval(() => { step(); if (steps >= 300) run(); }, reduced ? 0 : 30);
    }
    const go = btn('run', run, 'accent');
    el.append(h('div', { class: 'w-row' }, h('div', {}, c),
      h('div', { class: 'w-col' }, h('div', { class: 'w-ctrl', style: 'margin-top:0' },
        chips(['random search', 'hill climbing'], mode, (m) => { mode = m; if (timer) run(); reset(); })),
      h('div', { class: 'w-ctrl' }, go, btn('one guess', step), btn('new start', () => { if (timer) run(); reset(); })), info)));
    reset();
    onTheme(() => { paintField(); draw(); });
  };

  /* ---------------- 6. gradient descent on a parabola */
  W.descent = (el) => {
    frame(el, 'Follow the slope downhill',
      'The loss is <i>f</i>(<i>w</i>) = <i>w</i>², whose slope is 2<i>w</i>. Each step moves <i>w</i> by −(learning rate)·slope. Drag the dot to choose a start, then step. Small rates crawl; past 1.0 every step overshoots further than the last, and the descent diverges.');
    let lr = 0.2, w0 = 3.6, path = [];
    const [c, ctx] = canvas(560, 300);
    const info = h('div', { class: 'w-kv', style: 'margin-top:8px;min-height:2.6em' });
    const X = (w) => 280 + w * 62, Y = (v) => 282 - v * 13.6;
    function reset() { path = [w0]; draw(); }
    function step() {
      const w = path[path.length - 1];
      if (Math.abs(w) > 1e3) return;
      path.push(w - lr * 2 * w);
      draw();
    }
    function draw() {
      ctx.clearRect(0, 0, 560, 300);
      ctx.strokeStyle = css('--rule'); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(560, Y(0)); ctx.moveTo(X(0), 0); ctx.lineTo(X(0), 300); ctx.stroke();
      ctx.strokeStyle = css('--ink'); ctx.lineWidth = 2; ctx.beginPath();
      for (let px = 0; px <= 560; px += 2) { const w = (px - 280) / 62; ctx[px ? 'lineTo' : 'moveTo'](px, Y(w * w)); }
      ctx.stroke();
      // zigzag path
      ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath();
      path.forEach((w, i) => { const x = X(w), y = Y(w * w); ctx[i ? 'lineTo' : 'moveTo'](x, y); });
      ctx.stroke(); ctx.setLineDash([]);
      path.forEach((w, i) => {
        const last = i === path.length - 1;
        ctx.fillStyle = last ? css('--accent') : css('--ink');
        ctx.globalAlpha = last ? 1 : 0.35 + 0.65 * i / path.length;
        ctx.beginPath(); ctx.arc(X(w), Y(w * w), last ? 7 : 3.5, 0, 7); ctx.fill();
      });
      ctx.globalAlpha = 1;
      const w = path[path.length - 1];
      // tangent at current point
      if (Math.abs(w) < 5) {
        const g = 2 * w;
        ctx.strokeStyle = css('--neg'); ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(X(w - 0.8), Y(w * w - 0.8 * g)); ctx.lineTo(X(w + 0.8), Y(w * w + 0.8 * g)); ctx.stroke();
      }
      const n = path.length - 1;
      info.innerHTML = Math.abs(w) > 4.5
        ? `step ${n}: w = <b>${w.toExponential(2)}</b>, off the chart. <b style="color:var(--accent)">Diverged.</b> Each step multiplies w by (1 − 2·lr) = ${(1 - 2 * lr).toFixed(2)}.`
        : `step ${n}: w = <b>${w.toFixed(4)}</b>, loss = <b>${(w * w).toFixed(4)}</b>, slope = ${(2 * w).toFixed(3)}<br>next w = ${w.toFixed(3)} − ${lr.toFixed(2)} × ${(2 * w).toFixed(3)} = ${(w - lr * 2 * w).toFixed(3)}`;
    }
    let dragging = false;
    c.addEventListener('pointerdown', (e) => { dragging = true; c.setPointerCapture(e.pointerId); move(e); });
    c.addEventListener('pointermove', (e) => { if (dragging) move(e); });
    c.addEventListener('pointerup', () => { dragging = false; });
    function move(e) { const r = c.getBoundingClientRect(); w0 = clamp(((e.clientX - r.left) / r.width * 560 - 280) / 62, -4.2, 4.2); reset(); }
    keys(c, 'Loss curve. Left and right arrows choose the starting point.', (dx) => { w0 = clamp(w0 + dx * 0.2, -4.2, 4.2); reset(); });
    c.style.cursor = 'grab';
    let timer = null;
    function play() {
      if (timer) { clearInterval(timer); timer = null; pb.textContent = 'play'; return; }
      pb.textContent = 'pause';
      timer = setInterval(() => { step(); if (path.length > 40 || Math.abs(path[path.length - 1]) > 4.5) play(); }, 380);
    }
    const pb = btn('play', play, 'accent');
    el.append(c, info, h('div', { class: 'w-ctrl' },
      slider('learning rate', 0.02, 1.1, 0.01, lr, (v) => v.toFixed(2), (v) => { lr = v; reset(); }),
      pb, btn('step', step), btn('reset', reset)));
    reset(); onTheme(draw);
  };

  /* ---------------- 7. a small network learns a 2-D decision boundary */
  W.playground = (el) => {
    frame(el, 'Watch hidden units bend the boundary',
      'A network with two inputs (the point’s coordinates), one hidden layer and one output learns to separate orange from blue, trained right here by gradient descent. With no hidden layer it can only draw a straight line. Add hidden units and watch the boundary bend. <b>Make your own data:</b> click anywhere to add a point in the chosen color, or pick <b>yours</b> to start from an empty field.');
    const S = 300, G = 50;
    let data = [], net = null, H = 8, act = 'relu', lr = 0.05, set = 'circles', epoch = 0, timer = null;
    const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(6.2832 * rnd());
    let brush = 'orange';
    function makeData() {
      data = [];
      if (set === 'yours') return;
      for (let i = 0; i < 200; i++) {
        let x, y, l;
        if (set === 'circles') { l = i % 2; const r = l ? 0.25 + 0.12 * rnd() : 0.62 + 0.15 * rnd(), a = rnd() * 6.283; x = r * Math.cos(a); y = r * Math.sin(a); }
        else if (set === 'xor') { x = rnd() * 2 - 1; y = rnd() * 2 - 1; x += Math.sign(x) * 0.08; y += Math.sign(y) * 0.08; l = x * y > 0 ? 1 : 0; }
        else if (set === 'spiral') { l = i % 2; const t = (i >> 1) / 100 * 8 + 0.6; const r = t / 9; x = r * Math.cos(t + l * Math.PI) + gauss() * 0.03; y = r * Math.sin(t + l * Math.PI) + gauss() * 0.03; }
        else { l = i % 2; x = (l ? 0.4 : -0.4) + gauss() * 0.22; y = (l ? 0.3 : -0.3) + gauss() * 0.22; }
        data.push([x, y, l]);
      }
    }
    function init() {
      const he = (n) => gauss() * Math.sqrt(2 / n);
      net = H === 0
        ? { w2: [he(2), he(2)], b2: 0 }
        : { w1: Array.from({ length: H }, () => [he(2) * 1.5, he(2) * 1.5]), b1: Array.from({ length: H }, () => gauss() * 0.3), w2: Array.from({ length: H }, () => he(H)), b2: 0 };
      epoch = 0;
    }
    const A = (z) => act === 'relu' ? Math.max(0, z) : Math.tanh(z);
    const dA = (z, a) => act === 'relu' ? (z > 0 ? 1 : 0) : 1 - a * a;
    const sig = (z) => 1 / (1 + Math.exp(-z));
    function fwd(x, y) {
      if (H === 0) return { o: net.w2[0] * x + net.w2[1] * y + net.b2 };
      const z = net.w1.map((w, j) => w[0] * x + w[1] * y + net.b1[j]);
      const a = z.map(A);
      return { z, a, o: a.reduce((s, v, j) => s + v * net.w2[j], net.b2) };
    }
    function train(iters) {
      let loss = 0;
      for (let it = 0; it < iters; it++) {
        const g = H === 0 ? { w2: [0, 0], b2: 0 } : { w1: net.w1.map(() => [0, 0]), b1: new Array(H).fill(0), w2: new Array(H).fill(0), b2: 0 };
        loss = 0;
        for (const [x, y, l] of data) {
          const r = fwd(x, y), p = sig(r.o);
          loss -= l ? Math.log(p + 1e-9) : Math.log(1 - p + 1e-9);
          const d = (p - l) / Math.max(1, data.length);
          g.b2 += d;
          if (H === 0) { g.w2[0] += d * x; g.w2[1] += d * y; continue; }
          for (let j = 0; j < H; j++) {
            g.w2[j] += d * r.a[j];
            const dz = d * net.w2[j] * dA(r.z[j], r.a[j]);
            g.w1[j][0] += dz * x; g.w1[j][1] += dz * y; g.b1[j] += dz;
          }
        }
        const k = lr * 20;
        net.b2 -= k * g.b2;
        if (H === 0) { net.w2[0] -= k * g.w2[0]; net.w2[1] -= k * g.w2[1]; }
        else for (let j = 0; j < H; j++) {
          net.w2[j] -= k * g.w2[j]; net.b1[j] -= k * g.b1[j];
          net.w1[j][0] -= k * g.w1[j][0]; net.w1[j][1] -= k * g.w1[j][1];
        }
        epoch++;
      }
      return loss / data.length;
    }
    const [c, ctx] = canvas(S, S);
    const fieldC = document.createElement('canvas'); fieldC.width = fieldC.height = G;
    const info = h('div', { class: 'w-kv', style: 'margin-top:8px' });
    let lastLoss = 0;
    function draw() {
      const fc = fieldC.getContext('2d'), im = fc.createImageData(G, G);
      const pos = hex(css('--pos')), neg = hex(css('--neg')), mid = hex(css('--card'));
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const p = sig(fwd(i / (G - 1) * 2 - 1, 1 - j / (G - 1) * 2).o), t = Math.abs(p - 0.5) * 1.3;
        const col = p > 0.5 ? pos : neg;
        for (let q = 0; q < 3; q++) im.data[(j * G + i) * 4 + q] = mid[q] + (col[q] - mid[q]) * t;
        im.data[(j * G + i) * 4 + 3] = 255;
      }
      fc.putImageData(im, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(fieldC, 0, 0, S, S);
      let correct = 0;
      for (const [x, y, l] of data) {
        const p = sig(fwd(x, y).o);
        if ((p > 0.5) === (l === 1)) correct++;
        ctx.fillStyle = l ? css('--pos') : css('--neg');
        ctx.strokeStyle = css('--card'); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc((x + 1) / 2 * S, (1 - y) / 2 * S, 3.6, 0, 7); ctx.fill(); ctx.stroke();
      }
      info.innerHTML = data.length ? `epoch <b>${epoch}</b> · loss <b>${epoch ? lastLoss.toFixed(3) : '–'}</b> · accuracy <b>${(correct / data.length * 100).toFixed(0)}%</b> · ${data.length} points · ${H === 0 ? 'no hidden layer: a single line' : `${H} hidden units, ${act}`}` : 'click on the field to place points, then train';
    }
    function tick() { lastLoss = train(4); draw(); }
    function play() {
      if (timer) { cancelAnimationFrame(timer); timer = null; pb.textContent = 'train'; pb.classList.remove('on'); return; }
      pb.textContent = 'pause';
      const stopAt = epoch + 4000;
      const loop = () => { tick(); timer = epoch < stopAt ? requestAnimationFrame(loop) : (play(), null); };
      timer = requestAnimationFrame(loop);
    }
    function restart() { if (timer) play(); init(); lastLoss = train(0) || 0; draw(); }
    const pb = btn('train', play, 'accent');
    c.style.cursor = 'crosshair';
    c.addEventListener('pointerdown', (e) => {
      const r = c.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * 2 - 1, y = 1 - (e.clientY - r.top) / r.height * 2;
      data.push([x, y, brush === 'orange' ? 1 : 0]);
      lastLoss = train(0) || 0; draw();
    });
    el.append(h('div', { class: 'w-row' }, h('div', { style: `max-width:${S}px` }, c, info),
      h('div', { class: 'w-col' },
        h('div', { class: 'w-kv' }, 'data'), chips(['blobs', 'circles', 'xor', 'spiral', 'yours'], set, (s) => { set = s; makeData(); restart(); }),
        h('div', { class: 'w-kv', style: 'margin-top:14px' }, 'click to add'), chips(['orange', 'blue'], brush, (b) => { brush = b; }),
        h('div', { class: 'w-kv', style: 'margin-top:14px' }, 'activation'), chips(['relu', 'tanh'], act, (a) => { act = a; restart(); }),
        h('div', { class: 'w-ctrl' }, slider('hidden units', 0, 32, 1, H, (v) => String(v), (v) => { H = v; restart(); })),
        h('div', { class: 'w-ctrl' }, slider('learning rate', 0.005, 0.2, 0.005, lr, (v) => v.toFixed(3), (v) => { lr = v; })),
        h('div', { class: 'w-ctrl' }, pb, btn('reset', restart)))));
    makeData(); restart(); onTheme(draw);
  };

  /* ---------------- 8. a 3x3 kernel on a photograph */
  W.kernel = (el) => {
    frame(el, 'Slide a kernel over a photograph',
      'Each output pixel is the dot product of the 3×3 kernel with the 3×3 patch of the image under it. Pick a preset or type your own numbers. In the output, orange is positive and blue is negative.');
    const im = D.camera, iw = im.w, ih = im.h, px = Float32Array.from(b64(im.px), (v) => v / 255);
    const presets = {
      identity: [0, 0, 0, 0, 1, 0, 0, 0, 0],
      blur: [1, 1, 1, 1, 1, 1, 1, 1, 1].map((v) => +(v / 9).toFixed(3)),
      sharpen: [0, -1, 0, -1, 5, -1, 0, -1, 0],
      'vertical edges': [-1, 0, 1, -2, 0, 2, -1, 0, 1],
      'horizontal edges': [-1, -2, -1, 0, 0, 0, 1, 2, 1],
      outline: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
      emboss: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
    };
    let k = presets['vertical edges'].slice(), name = 'vertical edges';
    const [a, actx] = canvas(220, 220), [b, bctx] = canvas(220, 220);
    const grid = h('div', { class: 'kernel-grid' });
    const inputs = k.map((v, i) => {
      const inp = h('input', { type: 'text', inputmode: 'decimal', value: String(v), 'aria-label': `kernel ${i}` });
      inp.addEventListener('input', () => { const n = parseFloat(inp.value); if (!isNaN(n)) { k[i] = n; run(); } });
      grid.append(inp); return inp;
    });
    // one scratch canvas per panel: WebKit may defer a drawImage, so
    // reusing a single scratch canvas in one frame can show the wrong image
    const scratch = new Map();
    function img(cv, vals, signed) {
      if (!scratch.has(cv)) { const s = document.createElement('canvas'); s.width = iw; s.height = ih; scratch.set(cv, s); }
      const t = scratch.get(cv);
      const c = t.getContext('2d'), d = c.createImageData(iw, ih);
      let m = 0; for (const v of vals) m = Math.max(m, Math.abs(v));
      const pos = hex(css('--pos')), neg = hex(css('--neg'));
      for (let i = 0; i < vals.length; i++) {
        let rgb;
        if (!signed) { const g = clamp(vals[i], 0, 1) * 255; rgb = [g, g, g]; }
        else { const s = vals[i] / (m || 1), col = s >= 0 ? pos : neg, u = Math.min(1, Math.abs(s) * 1.6); rgb = col.map((q) => 12 + (q - 12) * u); }
        d.data[i * 4] = rgb[0]; d.data[i * 4 + 1] = rgb[1]; d.data[i * 4 + 2] = rgb[2]; d.data[i * 4 + 3] = 255;
      }
      c.putImageData(d, 0, 0);
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(t, 0, 0, 220, 220);
    }
    function run() {
      const out = new Float32Array(iw * ih);
      let neg = false;
      for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
        let s = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++)
          s += k[(j + 1) * 3 + i + 1] * px[clamp(y + j, 0, ih - 1) * iw + clamp(x + i, 0, iw - 1)];
        out[y * iw + x] = s; if (s < -0.02) neg = true;
      }
      img(a, px, false);
      img(b, out, neg);
    }
    const ch = chips(Object.keys(presets), name, (n) => { name = n; k = presets[n].slice(); inputs.forEach((inp, i) => { inp.value = k[i]; }); run(); });
    el.append(h('div', { class: 'w-row' },
      h('div', {}, h('div', { class: 'w-kv' }, 'input'), a),
      h('div', {}, h('div', { class: 'w-kv' }, 'kernel'), grid),
      h('div', {}, h('div', { class: 'w-kv' }, 'output'), b)),
      h('div', { style: 'margin-top:14px' }, ch));
    run(); onTheme(run);
  };

  /* ---------------- 9. the sliding window, one position at a time */
  W.slide = (el) => {
    frame(el, 'The loop, slowed down',
      'This is what the double loop computes. The kernel (a vertical-edge detector) visits every position of a 12×12 crop of a digit; at each one, nine multiplications are added into a single output number.');
    const base = samples.subarray(784 * 3, 784 * 4);
    const N = 12, K = 3, M = N - K + 1, off = 8;
    const x = Array.from({ length: N * N }, (_, i) => base[(((i / N) | 0) + off) * 28 + (i % N) + off] / 255);
    const k = [-1, 0, 1, -1, 0, 1, -1, 0, 1];
    const out = new Array(M * M).fill(null);
    let pos = 0, timer = null;
    const cs = 22;
    const [c, ctx] = canvas(N * cs + 40 + M * cs, N * cs + 4);
    const sum = h('div', { class: 'w-kv', style: 'margin-top:8px;min-height:3.2em' });
    function compute(p) {
      const r = (p / M) | 0, q = p % M; let s = 0, terms = [];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const v = x[(r + j) * N + q + i]; s += v * k[j * 3 + i]; if (k[j * 3 + i]) terms.push(`${k[j * 3 + i] > 0 ? '+' : '−'}${v.toFixed(2)}`); }
      return { r, q, s, terms };
    }
    function draw() {
      ctx.clearRect(0, 0, c.W, c.H);
      const ink = css('--ink');
      for (let i = 0; i < N * N; i++) {
        ctx.fillStyle = '#000'; ctx.fillRect((i % N) * cs, ((i / N) | 0) * cs, cs - 1, cs - 1);
        ctx.globalAlpha = x[i]; ctx.fillStyle = '#fff'; ctx.fillRect((i % N) * cs, ((i / N) | 0) * cs, cs - 1, cs - 1); ctx.globalAlpha = 1;
      }
      const { r, q, s, terms } = compute(pos);
      ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2.5;
      ctx.strokeRect(q * cs - 1, r * cs - 1, K * cs + 1, K * cs + 1);
      ctx.font = `600 ${Math.min(fpx(c, 10), cs * 0.62)}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        const kv = k[j * 3 + i]; if (!kv) continue;
        ctx.fillStyle = css('--card'); ctx.globalAlpha = 0.85; ctx.fillRect((q + i) * cs + 1, (r + j) * cs + cs * 0.18, cs - 3, cs * 0.64); ctx.globalAlpha = 1;   // a backing so the label reads on black and white
        ctx.fillStyle = kv > 0 ? css('--pos') : css('--neg');
        ctx.fillText(kv > 0 ? '+1' : '−1', (q + i) * cs + cs / 2, (r + j) * cs + cs / 2);
      }
      const ox = N * cs + 40;
      ctx.fillStyle = ink; ctx.font = '' + fpx(c, 18) + 'px "JetBrains Mono", monospace'; ctx.fillText('→', N * cs + 20, (r + 1.5) * cs);
      const m = 2.2;
      for (let i = 0; i < M * M; i++) {
        ctx.fillStyle = out[i] == null ? css('--paper-2') : div(out[i] / m);
        ctx.fillRect(ox + (i % M) * cs, ((i / M) | 0) * cs, cs - 1, cs - 1);
      }
      ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.strokeRect(ox + q * cs - 1, r * cs - 1, cs + 1, cs + 1);
      sum.innerHTML = `out[${r}, ${q}] = ${terms.join(' ')} = <b>${s.toFixed(2)}</b><br>position ${pos + 1} of ${M * M}`;
    }
    function step() { const { s } = compute(pos); out[pos] = s; draw(); pos = (pos + 1) % (M * M); if (pos === 0) out.fill(null); }
    function play() {
      if (timer) { clearInterval(timer); timer = null; pb.textContent = 'play'; return; }
      pb.textContent = 'pause'; timer = setInterval(step, 140);
    }
    const pb = btn('play', play, 'accent');
    el.append(c, sum, h('div', { class: 'w-ctrl' }, pb, btn('step', step), btn('fill all', () => {
      if (timer) play();
      for (let p = 0; p < M * M; p++) out[p] = compute(p).s; pos = M * M - 1; draw(); pos = 0;
    })));
    draw(); onTheme(draw);
  };

  /* ---------------- 10. patches and attention */
  W.patches = (el) => {
    frame(el, 'Patches looking at patches',
      'The image is cut into sixteen 7×7 patches, each flattened to 49 numbers. Click a patch: it becomes the <i>query</i>, and every patch is scored by the dot product of its pixels with the query, scaled by √49 and passed through softmax. This sketch uses raw pixels, with no learned projections, so it shows only the mechanism: a trained model learns <i>what</i> to compare.');
    let k = 0, q = 5;
    const [c, ctx] = canvas(252, 252), [a, actx] = canvas(252, 252);
    const info = h('div', { class: 'w-kv', style: 'margin-top:8px' });
    function patches(px) {
      return Array.from({ length: 16 }, (_, p) => {
        const r = (p / 4) | 0, s = p % 4, v = [];
        for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) v.push(px[(r * 7 + j) * 28 + s * 7 + i] / 255);
        return v;
      });
    }
    function draw() {
      const px = samples.subarray(k * 784, k * 784 + 784), P = patches(px);
      const sc = P.map((v) => v.reduce((s, u, i) => s + u * P[q][i], 0) / 7);
      const mx = Math.max(...sc), e = sc.map((s) => Math.exp(s - mx)), Z = e.reduce((s, v) => s + v, 0), att = e.map((v) => v / Z);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 252, 252);
      drawDigit(ctx, Float32Array.from(px, (v) => v / 255), 0, 0, 252, '#fff');
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(i * 63, 0); ctx.lineTo(i * 63, 252); ctx.moveTo(0, i * 63); ctx.lineTo(252, i * 63); ctx.stroke(); }
      ctx.strokeStyle = css('--accent'); ctx.lineWidth = 3; ctx.strokeRect((q % 4) * 63 + 1.5, ((q / 4) | 0) * 63 + 1.5, 60, 60);
      const am = Math.max(...att);
      actx.clearRect(0, 0, 252, 252);
      for (let p = 0; p < 16; p++) {
        actx.fillStyle = css('--accent'); actx.globalAlpha = 0.06 + 0.94 * att[p] / am;
        actx.fillRect((p % 4) * 63 + 1, ((p / 4) | 0) * 63 + 1, 61, 61);
        actx.globalAlpha = 1; actx.fillStyle = att[p] / am > 0.5 ? '#fff' : css('--ink');
        actx.font = '12px "JetBrains Mono", monospace'; actx.textAlign = 'center'; actx.textBaseline = 'middle';
        actx.fillText(att[p].toFixed(2), (p % 4) * 63 + 32, ((p / 4) | 0) * 63 + 32);
      }
      info.innerHTML = `query = patch <b>${q}</b> · attention weights sum to 1 · the biggest goes to patch <b>${att.indexOf(am)}</b>`;
    }
    c.style.cursor = 'pointer';
    keys(c, 'Digit cut into 16 patches. Arrow keys choose the query patch.', (dx, dy) => {
      q = clamp(((q / 4) | 0) + dy, 0, 3) * 4 + clamp((q % 4) + dx, 0, 3); draw();
    });
    c.addEventListener('click', (e) => { const r = c.getBoundingClientRect(); q = ((e.clientY - r.top) / r.height * 4 | 0) * 4 + ((e.clientX - r.left) / r.width * 4 | 0); draw(); });
    el.append(h('div', { class: 'w-row' }, h('div', {}, h('div', { class: 'w-kv' }, 'click a patch (the query)'), c), h('div', {}, h('div', { class: 'w-kv' }, 'attention weights'), a)),
      info, h('div', { class: 'w-ctrl' }, btn('another digit', () => { k = (k + 1 + (Math.random() * 20 | 0)) % D.sampleLabels.length; draw(); })));
    draw(); onTheme(draw);
  };

  /* ---------------- 11. a line is a decision */
  W.line = (el) => {
    frame(el, 'A line is a decision',
      'Drag either handle to move the line. Everything on the shaded side is called “yes.” Can you find a line that gets every point right? Then press <b>learn</b> and let the perceptron rule nudge the line one mistake at a time.');
    const S = 340;
    const rnd = (() => { let s = 3; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const pts = Array.from({ length: 40 }, (_, i) => {
      const l = i % 2, g = () => (rnd() + rnd() + rnd() - 1.5) * 0.5;
      return [l ? 0.66 + g() * 0.5 : 0.34 + g() * 0.5, l ? 0.36 + g() * 0.5 : 0.64 + g() * 0.5, l];
    });
    let A = [0.1, 0.2], B = [0.9, 0.55], drag = null, timer = null;
    const [c, ctx] = canvas(S, S);
    const info = h('div', { class: 'w-kv', style: 'margin-top:8px' });
    // line through A,B as w·p + b = 0
    const wb = () => { const w = [B[1] - A[1], A[0] - B[0]]; return [w, -(w[0] * A[0] + w[1] * A[1])]; };
    function draw() {
      const [w, b] = wb();
      ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = css('--paper-2'); ctx.fillRect(0, 0, S, S);
      // shade the yes side
      ctx.save(); ctx.beginPath();
      const far = 4, d = [B[0] - A[0], B[1] - A[1]], L = Math.hypot(...d), u = [d[0] / L, d[1] / L], n = [w[0] / L, w[1] / L];
      const p1 = [A[0] - u[0] * far, A[1] - u[1] * far], p2 = [A[0] + u[0] * far, A[1] + u[1] * far];
      ctx.moveTo(p1[0] * S, p1[1] * S); ctx.lineTo(p2[0] * S, p2[1] * S);
      ctx.lineTo((p2[0] + n[0] * far) * S, (p2[1] + n[1] * far) * S); ctx.lineTo((p1[0] + n[0] * far) * S, (p1[1] + n[1] * far) * S);
      ctx.closePath(); ctx.fillStyle = css('--pos'); ctx.globalAlpha = 0.16; ctx.fill(); ctx.restore();
      ctx.strokeStyle = css('--ink'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p1[0] * S, p1[1] * S); ctx.lineTo(p2[0] * S, p2[1] * S); ctx.stroke();
      let right = 0;
      for (const [x, y, l] of pts) {
        const yes = w[0] * x + w[1] * y + b > 0, ok = yes === (l === 1);
        right += ok;
        ctx.fillStyle = l ? css('--pos') : css('--neg');
        ctx.beginPath();
        if (l) ctx.arc(x * S, y * S, 5, 0, 7); else ctx.rect(x * S - 4.5, y * S - 4.5, 9, 9);
        ctx.fill();
        if (!ok) { ctx.strokeStyle = css('--ink'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x * S, y * S, 9, 0, 7); ctx.stroke(); }
      }
      for (const P of [A, B]) {
        ctx.fillStyle = css('--card'); ctx.strokeStyle = css('--ink'); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(P[0] * S, P[1] * S, 8, 0, 7); ctx.fill(); ctx.stroke();
      }
      info.innerHTML = `<b>${right}</b> of ${pts.length} correct${right === pts.length ? ' · <b style="color:var(--accent)">a perfect line</b>' : ' · circled points are on the wrong side'}`;
      return right;
    }
    const pos = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    c.addEventListener('pointerdown', (e) => {
      const p = pos(e);
      drag = Math.hypot(p[0] - A[0], p[1] - A[1]) < Math.hypot(p[0] - B[0], p[1] - B[1]) ? A : B;
      c.setPointerCapture(e.pointerId); drag[0] = clamp(p[0], 0, 1); drag[1] = clamp(p[1], 0, 1); draw();
    });
    c.addEventListener('pointermove', (e) => { if (!drag) return; const p = pos(e); drag[0] = clamp(p[0], 0.01, 0.99); drag[1] = clamp(p[1], 0.01, 0.99); draw(); });
    c.addEventListener('pointerup', () => { drag = null; });
    c.style.cursor = 'grab';
    keys(c, 'Decision line. Arrow keys move one end of the line; hold Shift to move the other end.', (dx, dy, other) => {
      const P = other ? A : B;
      P[0] = clamp(P[0] + dx * 0.03, 0.01, 0.99); P[1] = clamp(P[1] + dy * 0.03, 0.01, 0.99); draw();
    });
    // perceptron: update w, b on a mistake, then re-express as two handles on the box
    function learn() {
      if (timer) { clearInterval(timer); timer = null; lb.textContent = 'learn'; return; }
      lb.textContent = 'stop';
      let [w, b] = wb(), it = 0;
      timer = setInterval(() => {
        const bad = pts.filter(([x, y, l]) => (w[0] * x + w[1] * y + b > 0) !== (l === 1));
        if (!bad.length || it++ > 200) { learn(); return; }
        const [x, y, l] = bad[(Math.random() * bad.length) | 0], t = l ? 1 : -1, r = 0.08;
        w = [w[0] + r * t * x, w[1] + r * t * y]; b += r * t;
        // the line's points closest to the center, spread along its direction
        const n2 = w[0] * w[0] + w[1] * w[1], c0 = [0.5, 0.5], s = (w[0] * c0[0] + w[1] * c0[1] + b) / n2;
        const m = [c0[0] - s * w[0], c0[1] - s * w[1]], dir = [-w[1], w[0]], dl = Math.hypot(...dir);
        A = [m[0] - dir[0] / dl * 0.4, m[1] - dir[1] / dl * 0.4];
        B = [m[0] + dir[0] / dl * 0.4, m[1] + dir[1] / dl * 0.4];
        draw();
      }, reduced ? 0 : 120);
    }
    const lb = btn('learn', learn, 'accent');
    el.append(c, info, h('div', { class: 'w-ctrl' }, lb, btn('reset', () => { if (timer) learn(); A = [0.1, 0.2]; B = [0.9, 0.55]; draw(); })));
    draw(); onTheme(draw);
  };

  /* ---------------- 12. the history is the syllabus */
  W.timeline = (el) => {
    frame(el, 'The history is the syllabus',
      'Every milestone in this story is something you will build. Choose one to see where.');
    // Links follow the web edition's chapter numbering (ch01 = Chapter 1).
    const M = [
      [1958, 'The perceptron', 'Frank Rosenblatt’s machine learns to classify patterns by adjusting the strengths of its connections.', 'ch01.html', 'Chapter 1 · a line is a decision'],
      [1969, '<i>Perceptrons</i>', 'Minsky and Papert show exactly what a single layer cannot compute. Funding drains away: an AI winter.', 'ch12.html', 'Chapter 12 · why one layer is not enough'],
      [1980, 'Neocognitron', 'Kunihiko Fukushima builds a layered network for visual patterns, inspired by the visual cortex.', 'ch13.html', 'Chapter 13 · convolution'],
      [1986, 'Backpropagation', 'Rumelhart, Hinton and Williams popularize sending the error backward through many layers.', 'ch11.html', 'Chapter 11 · following the gradient'],
      [1998, 'LeNet and MNIST', 'Yann LeCun’s convolutional networks read handwritten digits well enough for practical use.', 'ch14.html', 'Chapter 14 · a convolutional network'],
      [2012, 'AlexNet', 'LeNet’s design, made much larger and trained on graphics processors, wins ImageNet by a wide margin.', 'ch15.html', 'Chapter 15 · inside AlexNet'],
      [2017, 'The transformer', 'A network built around attention becomes the engine of language models.', 'ch20.html', 'Chapter 20 · attention'],
      [2022, 'ChatGPT', 'A large language model reaches the public, built from the same ideas as everything above.', 'ch20.html', 'Chapter 20 · onward'],
    ];
    const y0 = 1950, y1 = 2030, pct = (y) => ((y - y0) / (y1 - y0) * 100).toFixed(2) + '%';
    const track = h('div', { class: 'tl-track' },
      h('div', { class: 'tl-line' }),
      h('div', { class: 'tl-winter', style: `left:${pct(1969)};width:calc(${pct(1982)} - ${pct(1969)})` }, h('span', {}, 'AI winter')));
    [1960, 1980, 2000, 2020].forEach((y) => track.append(h('span', { class: 'tl-tick', style: `left:${pct(y)}` }, String(y))));
    const card = h('div', { class: 'tl-card', 'aria-live': 'polite' });
    let cur = 0, auto = null;
    const dots = M.map(([y, t], i) => {
      const b = h('button', { type: 'button', class: 'tl-dot ' + (i % 2 ? 'down' : 'up'), style: `left:${pct(y)};--i:${i}`,
        onclick: () => { stop(); pick(i); } });
      b.innerHTML = `<span class="tl-y">${y}</span><span class="tl-t">${t}</span>`;
      track.append(b); return b;
    });
    function pick(i) {
      cur = i;
      dots.forEach((d, j) => d.classList.toggle('on', j === i));
      const [y, t, text, href, where] = M[i];
      card.innerHTML = `<div class="tl-cy">${y}</div><div><div class="tl-ct">${t}</div><p>${text}</p><a href="${href}">Build it: ${where} →</a></div>`;
      card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap');
      const sc = track.parentNode;   // on a phone the strip scrolls: keep the chosen dot in view
      if (sc && sc.scrollWidth > sc.clientWidth) { const x = dots[i].offsetLeft - sc.clientWidth / 2; sc.scrollTo({ left: Math.max(0, x), behavior: reduced ? 'auto' : 'smooth' }); }
    }
    function stop() { if (auto) { clearInterval(auto); auto = null; } }
    el.append(h('div', { class: 'tl-scroll' }, track), card);
    el.classList.add('tl-in');
    pick(0);
    if (!reduced) auto = setInterval(() => pick((cur + 1) % M.length), 3200);
    el.addEventListener('pointerenter', stop);
  };

  /* ---------------- 13. three generations of neurons */
  W.generations = (el) => {
    frame(el, 'One input, three generations',
      'The same input drive feeds three kinds of neuron. The first generation is a switch, all on or all off. The second gives a graded output, like every network in this book. The third fires brief spikes, faster when driven harder. Move the slider.');
    let drive = 0.3, v = 0, spikes = [], last = performance.now(), running = true;
    const [c, ctx] = canvas(600, 210);
    const S = 600;
    const sig = (z) => 1 / (1 + Math.exp(-z));
    function draw(now) {
      const dt = Math.min(0.25, (now - last) / 1000); last = now;
      // leaky integrate-and-fire: v' = -v/tau + I, spike at 1 (1 ms steps)
      const I = Math.max(0, 1.001 + 1.5 * drive) / 0.12;   // threshold reached just above zero drive
      for (let t = 0; t < dt; t += 0.001) {
        v += 0.001 * (-v / 0.12 + I);
        if (v >= 1) { v = 0; spikes.push(now - (dt - t) * 1000); }
      }
      spikes = spikes.filter((t) => now - t < 1500);
      ctx.clearRect(0, 0, S, 210);
      const ink = css('--ink'), acc = css('--accent'), rule = css('--rule'), muted = css('--muted');
      const col = S / 3;
      ctx.font = `${fpx(c, 11)}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ['1943 · switch', '1980s on · graded', '1997 · spiking'].forEach((t, i) => { ctx.fillStyle = muted; ctx.fillText(t.toUpperCase(), col * i + col / 2, 200); });
      // 1. switch: a lamp
      const on = drive > 0;
      ctx.fillStyle = on ? acc : rule;
      ctx.beginPath(); ctx.arc(col / 2, 90, 38, 0, 7); ctx.fill();
      if (on) { ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.arc(col / 2, 90, 58, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.fillStyle = on ? '#fff' : muted; ctx.font = '600 ' + fpx(c, 20) + 'px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle';
      ctx.fillText(on ? '1' : '0', col / 2, 91);
      // 2. graded: a sigmoid with the current point
      const gx = col + 24, gw = col - 48, gy = 30, gh = 120;
      ctx.strokeStyle = rule; ctx.lineWidth = 1; ctx.strokeRect(gx, gy, gw, gh);
      ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= gw; i++) { const z = (i / gw - 0.5) * 2; ctx[i ? 'lineTo' : 'moveTo'](gx + i, gy + gh - sig(z * 5) * gh); }
      ctx.stroke();
      const px = gx + (drive / 2 + 0.5) * gw, py = gy + gh - sig(drive * 5) * gh;
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(px, py, 6, 0, 7); ctx.fill();
      ctx.fillStyle = ink; ctx.font = '600 ' + fpx(c, 13) + 'px "JetBrains Mono", monospace';
      ctx.fillText(sig(drive * 5).toFixed(2), col * 1.5, 170);
      // 3. spiking: a scrolling spike train and the membrane potential
      const sx = col * 2 + 16, sw = col - 32;
      ctx.strokeStyle = rule; ctx.beginPath(); ctx.moveTo(sx, 130); ctx.lineTo(sx + sw, 130); ctx.stroke();
      ctx.strokeStyle = acc; ctx.lineWidth = 1.5;
      for (const t of spikes) { const x = sx + sw - (now - t) / 1500 * sw; ctx.beginPath(); ctx.moveTo(x, 130); ctx.lineTo(x, 50); ctx.stroke(); }
      ctx.fillStyle = muted; ctx.fillRect(sx + sw + 4, 130 - v * 80, 3, v * 80);
      ctx.fillText(`${(spikes.length / 1.5).toFixed(0)} spikes/s`, col * 2.5, 170);
      if (running) requestAnimationFrame(draw);
    }
    new IntersectionObserver((es) => { const was = running; running = es[0].isIntersecting; if (running && !was) { last = performance.now(); requestAnimationFrame(draw); } }).observe(c);
    el.append(c, h('div', { class: 'w-ctrl' }, slider('input drive', -1, 1, 0.01, drive, (x) => (x >= 0 ? '+' : '') + x.toFixed(2), (x) => { drive = x; })));
    requestAnimationFrame(draw);
  };

  /* ---------------- 14. teaching a gut feeling */
  W.value = (el) => {
    frame(el, 'Teaching a gut feeling',
      'A toy game: a token starts in the middle and moves one step left or right at random. Reaching the orange end wins for orange; the blue end, for blue. Each game is a filmstrip, and once it ends every frame becomes a training example labeled with the winner. The bars are the learned value: from each position, how often orange went on to win. The dashed line is the exact answer.');
    const N = 10, P = 2 * N + 1;
    const wins = new Array(P).fill(0), seen = new Array(P).fill(0);
    let games = 0, film = [], winner = 0, timer = null;
    const [strip, sctx] = canvas(600, 64);
    const [c, ctx] = canvas(600, 220);
    const info = h('div', { class: 'w-kv', style: 'margin-top:6px' });
    function play() {
      let x = 0; const f = [0];
      while (Math.abs(x) < N) { x += Math.random() < 0.5 ? 1 : -1; f.push(x); }
      film = f; winner = x > 0 ? 1 : 0; games++;
      for (const p of f) { seen[p + N]++; wins[p + N] += winner; }
    }
    function drawStrip() {
      sctx.clearRect(0, 0, 600, 64);
      const n = film.length, k = Math.min(n, 60), w = 600 / 60;
      for (let i = 0; i < k; i++) {
        const fi = Math.round(i * (n - 1) / Math.max(1, k - 1)), x = film[fi];
        sctx.fillStyle = css('--paper-2'); sctx.fillRect(i * w + 0.5, 4, w - 1, 44);
        sctx.fillStyle = x > 0 ? css('--pos') : x < 0 ? css('--neg') : css('--ink');
        sctx.fillRect(i * w + 1.5, 4 + (1 - (x + N) / (2 * N)) * 40, w - 3, 4);
      }
      sctx.fillStyle = winner ? css('--pos') : css('--neg'); sctx.font = '' + fpx(strip, 11) + 'px "JetBrains Mono", monospace';
      sctx.textAlign = 'left'; sctx.textBaseline = 'top';
      if (games) sctx.fillText(`last game: ${film.length - 1} moves · every frame labeled “${winner ? 'orange' : 'blue'} wins”`, 0, 52);
    }
    function draw() {
      ctx.clearRect(0, 0, 600, 220);
      const bw = 600 / P, base = 190;
      ctx.strokeStyle = css('--muted'); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(bw / 2, base); ctx.lineTo(600 - bw / 2, base - 170); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < P; i++) {
        const v = seen[i] ? wins[i] / seen[i] : null;
        if (i === 0 || i === P - 1) continue;
        ctx.fillStyle = v == null ? css('--paper-2') : div((v - 0.5) * 2);
        const hgt = v == null ? 3 : Math.max(2, v * 170);
        ctx.fillRect(i * bw + 2, base - hgt, bw - 4, hgt);
      }
      ctx.fillStyle = css('--neg'); ctx.fillRect(0, base - 170, bw - 2, 170);
      ctx.fillStyle = css('--pos'); ctx.fillRect(600 - bw + 2, base - 170, bw - 2, 170);
      ctx.fillStyle = css('--muted'); ctx.font = '' + fpx(c, 10.5) + 'px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('start', 300, base + 8);
      ctx.textAlign = 'left'; ctx.fillText('blue wins', 0, base + 8);
      ctx.textAlign = 'right'; ctx.fillText('orange wins', 600, base + 8);
      const err = seen.slice(1, -1).reduce((s, n, i) => s + (n ? Math.abs(wins[i + 1] / n - (i + 1) / (P - 1)) : 0.5), 0) / (P - 2);
      info.innerHTML = `games <b>${games}</b> · training frames <b>${seen.reduce((a, b) => a + b, 0) - 2 * games}</b> · average error of the gut feeling <b>${(err * 100).toFixed(1)}</b> points`;
    }
    function many(n) { for (let i = 0; i < n; i++) play(); drawStrip(); draw(); }
    function auto() {
      if (timer) { clearInterval(timer); timer = null; ab.textContent = 'keep playing'; return; }
      ab.textContent = 'pause';
      timer = setInterval(() => { many(Math.max(1, games >> 3)); if (games > 5000) auto(); }, 120);
    }
    const ab = btn('keep playing', auto, 'accent');
    el.append(strip, c, info, h('div', { class: 'w-ctrl' }, btn('play one game', () => many(1)), ab,
      btn('forget', () => { if (timer) auto(); wins.fill(0); seen.fill(0); games = 0; film = []; drawStrip(); draw(); })));
    drawStrip(); draw(); onTheme(() => { drawStrip(); draw(); });
  };

  /* ---------------- shared: a seeded random generator for repeatable demos */
  function mulberry(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rand) {
    const u = 1 - rand(), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* ---------------- chance: a Galton board */
  W.galton = (el) => {
    frame(el, 'A Galton board',
      'Each ball bounces left or right at every row of pins, like a coin flip. Where it lands counts its heads. The <b>dots</b> are the exact chances from Pascal\'s triangle, scaled to the number of balls dropped. Drop enough balls and the bars grow up to meet them.');
    const Wd = 340, Ht = 330;
    const [c, ctx] = canvas(Wd, Ht);
    let rows = 10, counts, balls, total, timer = null;
    const info = h('div', { class: 'w-kv', style: 'margin-top:10px' });
    const top = 18, pinH = 170;
    const dx = () => (Wd - 40) / (rows + 1);
    function comb(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }
    function reset() { counts = new Array(rows + 1).fill(0); balls = []; total = 0; draw(); }
    function xAt(row, right) { return Wd / 2 + (right - row / 2) * dx(); }
    function drop(n) {
      for (let i = 0; i < n; i++) {
        const path = Array.from({ length: rows }, () => Math.random() < 0.5 ? 0 : 1);
        balls.push({ path, t: -i * 0.35 });
      }
      if (!timer) loop();
    }
    function loop() {
      timer = requestAnimationFrame(() => {
        const speed = reduced ? rows + 1 : 0.22 + balls.length / 120;
        balls.forEach((b) => { b.t += speed; });
        balls = balls.filter((b) => {
          if (b.t >= rows + 1) { counts[b.path.reduce((a, v) => a + v, 0)]++; total++; return false; }
          return true;
        });
        draw();
        if (balls.length) loop(); else timer = null;
      });
    }
    function draw() {
      ctx.clearRect(0, 0, Wd, Ht);
      const ink = css('--ink'), acc = css('--accent'), sp = dx();
      ctx.fillStyle = ink;
      for (let r = 0; r < rows; r++) for (let k = 0; k <= r; k++) {
        ctx.beginPath(); ctx.arc(xAt(r, k), top + (r + 0.5) * pinH / rows, 2, 0, 7); ctx.fill();
      }
      const base = Ht - 18, maxH = base - top - pinH - 16;
      const expect = counts.map((_, k) => comb(rows, k) / 2 ** rows);
      const peak = Math.max(...expect) * Math.max(total, 1);
      const scale = maxH / Math.max(peak, ...counts, 1);
      counts.forEach((n, k) => {
        const x = xAt(rows, k);
        ctx.fillStyle = 'rgba(127,127,127,.35)';
        ctx.fillRect(x - sp * 0.42, base - n * scale, sp * 0.84, n * scale);
        if (total) {
          ctx.fillStyle = ink;
          ctx.beginPath(); ctx.arc(x, base - expect[k] * total * scale, 2.5, 0, 7); ctx.fill();
        }
      });
      ctx.strokeStyle = 'rgba(127,127,127,.6)'; ctx.beginPath(); ctx.moveTo(10, base + 0.5); ctx.lineTo(Wd - 10, base + 0.5); ctx.stroke();
      ctx.fillStyle = acc;
      balls.forEach((b) => {
        if (b.t < 0) return;
        const r = Math.min(Math.floor(b.t), rows), f = b.t - r;
        const heads = b.path.slice(0, r).reduce((a, v) => a + v, 0);
        const x0 = xAt(r, heads), next = r < rows ? xAt(r + 1, heads + b.path[r]) : x0;
        const y0 = top + r * pinH / rows, y1 = r < rows ? top + (r + 1) * pinH / rows : base - 4;
        ctx.beginPath(); ctx.arc(x0 + (next - x0) * f, y0 + (y1 - y0) * f - 4 * Math.sin(Math.PI * f), 3.2, 0, 7); ctx.fill();
      });
      ctx.fillStyle = css('--ink-2'); ctx.font = '' + fpx(c, 11) + 'px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText('0 heads', xAt(rows, 0), Ht - 4); ctx.fillText(`${rows} heads`, xAt(rows, rows), Ht - 4);
      info.innerHTML = `rows <b>${rows}</b> · balls landed <b>${total}</b>`;
    }
    el.append(c, info, h('div', { class: 'w-ctrl' },
      btn('drop 1', () => drop(1)), btn('drop 100', () => drop(100), 'accent'), btn('drop 1000', () => drop(1000)),
      btn('clear', () => { balls = []; reset(); }),
      slider('rows', 4, 16, 1, rows, (v) => v, (v) => { rows = v; balls = []; reset(); })));
    reset(); onTheme(draw);
  };

  /* ---------------- chance: pi from random darts */
  W.darts = (el) => {
    frame(el, 'Throwing darts at π',
      'Darts land uniformly in the square. The fraction inside the circle, times four, estimates π. Watch the error: it shrinks, but only as one over the square root of the number of darts, so each extra correct digit costs a hundred times as many throws.');
    const S = 260;
    const [c, ctx] = canvas(S, S);
    const [g, gctx] = canvas(300, 150);
    const dots = document.createElement('canvas'); dots.width = dots.height = S * 2;
    const dctx = dots.getContext('2d');
    let n = 0, inside = 0, hist = [], timer = null;
    const big = h('div', { class: 'w-big' }, '—');
    const info = h('div', { class: 'w-kv' });
    function reset() { n = 0; inside = 0; hist = []; dctx.clearRect(0, 0, S * 2, S * 2); draw(); }
    function throwN(k) {
      const acc = css('--accent');
      for (let i = 0; i < k; i++) {
        const x = Math.random() * 2 - 1, y = Math.random() * 2 - 1, inn = x * x + y * y < 1;
        n++; if (inn) inside++;
        if (n < 40000) { dctx.fillStyle = inn ? acc : 'rgba(127,127,127,.7)'; dctx.fillRect((x + 1) * S - 1, (y + 1) * S - 1, 2.2, 2.2); }
        if ((n & (n - 1)) === 0 || n % 5000 === 0) hist.push([n, 4 * inside / n]);
      }
      draw();
    }
    function draw() {
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(dots, 0, 0, S, S);
      ctx.strokeStyle = css('--ink'); ctx.lineWidth = 1.2;
      ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
      ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 0.5, 0, 7); ctx.stroke();
      const est = n ? 4 * inside / n : NaN;
      big.textContent = n ? est.toFixed(4) : '—';
      info.innerHTML = n ? `darts <b>${n.toLocaleString()}</b> · inside <b>${inside.toLocaleString()}</b><br>error <b>${Math.abs(est - Math.PI).toFixed(4)}</b> · typical error for this many ≈ <b>${(1.31 / Math.sqrt(n)).toFixed(4)}</b>` : 'press a button to throw';
      gctx.clearRect(0, 0, 300, 150);
      const lx = (v) => 30 + (Math.log10(v) / 6) * 260, ly = (v) => 75 - (v - Math.PI) * 120;
      gctx.strokeStyle = 'rgba(127,127,127,.5)'; gctx.beginPath(); gctx.moveTo(30, ly(Math.PI)); gctx.lineTo(292, ly(Math.PI)); gctx.stroke();
      gctx.fillStyle = css('--ink-2'); gctx.font = '' + fpx(g, 10) + 'px "JetBrains Mono", monospace';
      gctx.fillText('π', 18, ly(Math.PI) + 3);
      [1, 100, 10000, 1000000].forEach((v) => gctx.fillText(v >= 1e6 ? '1M' : v >= 1e4 ? '10k' : String(v), lx(v) - 6, 146));
      gctx.strokeStyle = css('--accent'); gctx.lineWidth = 1.5; gctx.beginPath();
      hist.forEach(([k, e], i) => { const X = lx(k), Y = clamp(ly(e), 4, 134); i ? gctx.lineTo(X, Y) : gctx.moveTo(X, Y); });
      gctx.stroke();
    }
    function auto() {
      if (timer) { clearInterval(timer); timer = null; ab.textContent = 'keep throwing'; ab.classList.remove('on'); return; }
      ab.textContent = 'pause'; ab.classList.add('on');
      timer = setInterval(() => { throwN(Math.max(10, Math.floor(n / 25))); if (n >= 1e6) auto(); }, reduced ? 200 : 40);
    }
    const ab = btn('keep throwing', auto, 'accent');
    el.append(h('div', { class: 'w-row' }, c, h('div', { class: 'w-col' }, big, info, h('div', { style: 'margin-top:12px' }, g))),
      h('div', { class: 'w-ctrl' }, btn('throw 1', () => throwN(1)), btn('throw 100', () => throwN(100)), ab,
        btn('clear', () => { if (timer) auto(); reset(); })));
    reset(); onTheme(draw);
  };

  /* ---------------- images: bit depth and dithering */
  W.bitdepth = (el) => {
    frame(el, 'How many shades does a picture need?',
      'Slide the bit depth down from 8 (256 shades) to 1 (black and white). <b>Rounding</b> snaps each pixel to the nearest shade on its own. <b>Dithering</b> passes each pixel\'s rounding error on to its neighbors, so that patterns of dots stand in for the missing shades.');
    const im = D.cat, raw = b64(im.px), iw = im.w, ih = im.h, Z = 2;
    const px = Uint8Array.from({ length: iw * ih }, (_, i) => (raw[i * 3] + raw[i * 3 + 1] + raw[i * 3 + 2]) / 3);
    const [c, ctx] = canvas(iw * Z, ih * Z);
    const [ramp, rctx] = canvas(iw * Z, 18);
    const off = document.createElement('canvas'); off.width = iw; off.height = ih;
    const octx = off.getContext('2d');
    let bits = 2, mode = 'dither';
    const info = h('div', { class: 'w-kv', style: 'margin-top:8px' });
    function render() {
      const L = 2 ** bits, x = Float32Array.from(px, (v) => v / 255), out = new Float32Array(iw * ih);
      for (let r = 0; r < ih; r++) for (let q = 0; q < iw; q++) {
        const i = r * iw + q, v = x[i];
        const o = Math.min(L - 1, Math.max(0, Math.round(v * (L - 1)))) / (L - 1);
        out[i] = o;
        if (mode === 'dither') {
          const e = v - o;
          if (q + 1 < iw) x[i + 1] += e * 7 / 16;
          if (r + 1 < ih) {
            if (q > 0) x[i + iw - 1] += e * 3 / 16;
            x[i + iw] += e * 5 / 16;
            if (q + 1 < iw) x[i + iw + 1] += e / 16;
          }
        }
      }
      const d = octx.createImageData(iw, ih);
      for (let i = 0; i < iw * ih; i++) { const v = Math.round(out[i] * 255); d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255; }
      octx.putImageData(d, 0, 0);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(off, 0, 0, iw * Z, ih * Z);
      rctx.clearRect(0, 0, iw * Z, 18);
      for (let k = 0; k < L; k++) {
        const v = Math.round(255 * k / Math.max(1, L - 1));
        rctx.fillStyle = `rgb(${v},${v},${v})`; rctx.fillRect(k * iw * Z / L, 0, Math.ceil(iw * Z / L), 18);
      }
      info.innerHTML = `<b>${bits}</b> bit${bits > 1 ? 's' : ''} per pixel · <b>${L}</b> shades · ${(iw * ih * bits / 8 / 1024).toFixed(1)} KB for this ${iw}×${ih} image`;
    }
    el.append(c, h('div', { style: 'margin-top:6px' }, ramp), info, h('div', { class: 'w-ctrl' },
      slider('bits', 1, 8, 1, bits, (v) => v, (v) => { bits = v; render(); }),
      chips(['round', 'dither'], mode, (m) => { mode = m; render(); })));
    render();
  };

  /* ---------------- convolution: local rules (Life, ripples, reaction-diffusion) */
  W.rules = (el) => {
    frame(el, 'One small kernel, three worlds',
      'Every step, each cell looks at its 3×3 neighborhood (a convolution) and updates itself by a simple rule. <b>Life</b>: count living neighbors. <b>Ripples</b>: the Laplacian pulls a drumhead toward its neighbors. <b>Reaction–diffusion</b>: two chemicals spread and react. Click or drag on the grid to poke it.');
    const N = 128, Z = 320 / N;
    const [c, ctx] = canvas(320, 320);
    const off = document.createElement('canvas'); off.width = off.height = N;
    const octx = off.getContext('2d'), img = octx.createImageData(N, N);
    let mode = 'Life', A, B, timer = null, steps = 0;
    let born = new Set([3]), survive = new Set([2, 3]);
    const digits = (str) => new Set(String(str).replace(/[^0-8]/g, '').split('').map(Number));
    const ruleIn = (label, val, set) => {
      const inp = h('input', { type: 'text', value: val, size: 6, 'aria-label': label, style: 'font-family:var(--mono);width:5.5em' });
      inp.addEventListener('input', () => set(digits(inp.value)));
      return h('label', {}, label, inp);
    };
    const ruleBox = h('div', { class: 'w-ctrl' },
      ruleIn('born with', '3', (v) => { born = v; }), ruleIn('survives with', '23', (v) => { survive = v; }));
    const info = h('div', { class: 'w-kv', style: 'margin-top:10px' });
    const idx = (r, q) => ((r + N) % N) * N + ((q + N) % N);
    function lap(F, i, r, q) {
      return 0.5 * (F[idx(r - 1, q)] + F[idx(r + 1, q)] + F[idx(r, q - 1)] + F[idx(r, q + 1)])
        + 0.25 * (F[idx(r - 1, q - 1)] + F[idx(r - 1, q + 1)] + F[idx(r + 1, q - 1)] + F[idx(r + 1, q + 1)]) - 3 * F[i];
    }
    function reset() {
      steps = 0;
      if (mode === 'Life') { A = new Uint8Array(N * N).map(() => Math.random() < 0.28 ? 1 : 0); B = new Uint8Array(N * N); }
      else if (mode === 'Ripples') { A = new Float32Array(N * N); B = new Float32Array(N * N); [[N >> 1, N >> 1]].forEach(([r, q]) => poke(r, q)); }
      else {
        A = new Float32Array(N * N).fill(1); B = new Float32Array(N * N);
        for (let r = 54; r < 74; r++) for (let q = 54; q < 74; q++) { A[r * N + q] = 0.5; B[r * N + q] = 0.25; }
        for (let i = 0; i < N * N; i++) B[i] += 0.02 * Math.random();
      }
      draw();
    }
    function poke(r, q) {
      if (mode === 'Life') { for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (Math.random() < 0.5) A[idx(r + a, q + b)] = 1; }
      else if (mode === 'Ripples') { for (let a = -6; a <= 6; a++) for (let b = -6; b <= 6; b++) A[idx(r + a, q + b)] += Math.exp(-(a * a + b * b) / 8); }
      else { for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) { A[idx(r + a, q + b)] = 0.5; B[idx(r + a, q + b)] = 0.25; } }
    }
    function step() {
      steps++;
      if (mode === 'Life') {
        for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) {
          let n = 0;
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) n += A[idx(r + a, q + b)];
          const i = r * N + q; B[i] = (A[i] ? survive : born).has(n) ? 1 : 0;
        }
        [A, B] = [B, A];
      } else if (mode === 'Ripples') {
        const L = new Float32Array(N * N);
        for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) { const i = r * N + q; L[i] = lap(A, i, r, q) / 2; }
        for (let i = 0; i < N * N; i++) { B[i] = 0.995 * (B[i] + 0.25 * L[i]); A[i] += B[i]; }
      } else {
        const LU = new Float32Array(N * N), LV = new Float32Array(N * N);
        for (let s = 0; s < 8; s++) {
          for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) { const i = r * N + q; LU[i] = lap(A, i, r, q) / 2; LV[i] = lap(B, i, r, q) / 2; }
          for (let i = 0; i < N * N; i++) {
            const uvv = A[i] * B[i] * B[i];
            A[i] += 0.16 * LU[i] - uvv + 0.037 * (1 - A[i]);
            B[i] += 0.08 * LV[i] + uvv - 0.097 * B[i];
          }
        }
      }
    }
    function draw() {
      const ink = hex(css('--ink')), bg = hex(css('--card')), acc = hex(css('--accent')), neg = hex(css('--neg'));
      for (let i = 0; i < N * N; i++) {
        let col;
        if (mode === 'Life') col = A[i] ? ink : bg;
        else if (mode === 'Ripples') { const t = clamp(A[i] * 6, -1, 1); const e = t >= 0 ? acc : neg; col = bg.map((m, k) => m + (e[k] - m) * Math.abs(t)); }
        else { const t = clamp(B[i] / 0.4, 0, 1); col = bg.map((m, k) => m + (acc[k] - m) * t); }
        img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = mode !== 'Life';
      ctx.drawImage(off, 0, 0, 320, 320);
      const extra = mode === 'Life' ? ` · alive <b>${A.reduce((s, v) => s + v, 0)}</b>` : mode === 'Reaction–diffusion' ? ` (×8 per frame)` : '';
      info.innerHTML = `${mode} · step <b>${steps * (mode === 'Reaction–diffusion' ? 8 : 1)}</b>${extra}`;
    }
    function run() {
      if (timer) { cancelAnimationFrame(timer); timer = null; go.textContent = 'run'; go.classList.remove('on'); return; }
      go.textContent = 'pause'; go.classList.add('on');
      const tick = () => { step(); draw(); timer = requestAnimationFrame(tick); };
      tick();
    }
    let down = false;
    const at = (e) => { const rc = c.getBoundingClientRect(); return [Math.floor((e.clientY - rc.top) / rc.height * N), Math.floor((e.clientX - rc.left) / rc.width * N)]; };
    c.addEventListener('pointerdown', (e) => { down = true; c.setPointerCapture(e.pointerId); poke(...at(e)); draw(); });
    c.addEventListener('pointermove', (e) => { if (down) { poke(...at(e)); draw(); } });
    c.addEventListener('pointerup', () => { down = false; });
    c.style.cursor = 'crosshair';
    const go = btn('run', run, 'accent');
    el.append(h('div', { class: 'w-row' }, c, h('div', { class: 'w-col' },
      h('div', { class: 'w-ctrl', style: 'margin-top:0' }, chips(['Life', 'Ripples', 'Reaction–diffusion'], mode, (m) => { mode = m; reset(); })),
      h('div', { class: 'w-ctrl' }, go, btn('one step', () => { step(); draw(); }), btn('reset', reset)), info,
      h('div', { class: 'w-kv', style: 'margin-top:14px' }, 'Life rule: neighbor counts (try born 36, survives 23)'), ruleBox)));
    reset(); onTheme(draw);
  };

  /* ---------------- random features: a curve from random tanh neurons */
  W.randfit = (el) => {
    frame(el, 'Fitting with random neurons',
      'Each faint curve is one hidden neuron, tanh(<i>wx</i> + <i>b</i>) with random <i>w</i> and <i>b</i>. Only the weights of their sum are chosen, by solving a least-squares problem. Add neurons and the fit improves, until there are as many neurons as points and it swings wildly between them. Then raise the <b>ridge</b>.');
    const rand0 = mulberry(7);
    const P = 30, xs = [], ys = [];
    for (let i = 0; i < P; i++) { const x = -10 + 20 * rand0(); xs.push(x); ys.push(Math.exp(-0.02 * (x - 4) ** 2) + 0.1 * gauss(rand0)); }
    let hN = 8, ridgeExp = -9, seed = 1, Wt, Bs, coef;
    const [c, ctx] = canvas(360, 240);
    const info = h('div', { class: 'w-kv', style: 'margin-top:8px' });
    function feats(x) { return Wt.map((w, j) => Math.tanh(w * x + Bs[j])); }
    function solve() {
      const r = mulberry(seed * 9973);
      Wt = Array.from({ length: hN }, () => gauss(r)); Bs = Wt.map((w) => -w * (-10 + 20 * r()));   // each one bends somewhere in the range
      const lam = 10 ** ridgeExp, G = Array.from({ length: hN }, () => new Float64Array(hN + 1));
      xs.forEach((x, i) => { const f = feats(x); for (let a = 0; a < hN; a++) { for (let b = 0; b < hN; b++) G[a][b] += f[a] * f[b]; G[a][hN] += f[a] * ys[i]; } });
      for (let a = 0; a < hN; a++) G[a][a] += lam;
      for (let k = 0; k < hN; k++) {                 // Gaussian elimination with pivoting
        let p = k; for (let i = k + 1; i < hN; i++) if (Math.abs(G[i][k]) > Math.abs(G[p][k])) p = i;
        [G[k], G[p]] = [G[p], G[k]];
        for (let i = k + 1; i < hN; i++) { const m = G[i][k] / G[k][k]; for (let j = k; j <= hN; j++) G[i][j] -= m * G[k][j]; }
      }
      coef = new Array(hN).fill(0);
      for (let k = hN - 1; k >= 0; k--) { let s = G[k][hN]; for (let j = k + 1; j < hN; j++) s -= G[k][j] * coef[j]; coef[k] = s / G[k][k]; }
      draw();
    }
    function draw() {
      ctx.clearRect(0, 0, 360, 240);
      const X = (x) => 20 + (x + 10) / 20 * 330, Y = (y) => 220 - (y + 0.35) / 1.8 * 200;
      ctx.strokeStyle = 'rgba(127,127,127,.35)'; ctx.lineWidth = 1;
      for (let j = 0; j < hN; j++) { ctx.beginPath(); for (let k = 0; k <= 200; k++) { const x = -10 + k / 10; const v = Math.tanh(Wt[j] * x + Bs[j]) * 0.35 + 0.55; k ? ctx.lineTo(X(x), Y(v)) : ctx.moveTo(X(x), Y(v)); } ctx.stroke(); }
      ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2.2; ctx.beginPath();
      for (let k = 0; k <= 400; k++) { const x = -10 + k / 20; const f = feats(x); const v = f.reduce((s, u, j) => s + u * coef[j], 0); const yy = clamp(Y(v), -20, 260); k ? ctx.lineTo(X(x), yy) : ctx.moveTo(X(x), yy); }
      ctx.stroke();
      ctx.fillStyle = css('--ink');
      xs.forEach((x, i) => { ctx.beginPath(); ctx.arc(X(x), Y(ys[i]), 3, 0, 7); ctx.fill(); });
      const err = xs.reduce((s, x, i) => s + (feats(x).reduce((t, u, j) => t + u * coef[j], 0) - ys[i]) ** 2, 0) / P;
      const big = Math.max(...coef.map(Math.abs));
      info.innerHTML = `<b>${hN}</b> random neurons, <b>${P}</b> points · training error <b>${err.toExponential(1)}</b> · largest weight <b>${big.toExponential(1)}</b>`;
    }
    el.append(c, info, h('div', { class: 'w-ctrl' },
      slider('neurons', 1, 40, 1, hN, (v) => v, (v) => { hN = v; solve(); }),
      slider('ridge', -9, 1, 1, ridgeExp, (v) => '1e' + v, (v) => { ridgeExp = v; solve(); }),
      btn('new random neurons', () => { seed++; solve(); }, 'accent')));
    solve(); onTheme(draw);
  };

  /* ---------------- CNN: max and average pooling */
  W.pool = (el) => {
    frame(el, 'Pooling a digit',
      'Pooling shrinks a feature map by summarizing each block of pixels with one number: its <b>maximum</b> or its <b>average</b>. Move over the input to see which block feeds which output pixel. A 2×2 pool keeps the shape; by 7×7 only a rough idea of where the ink is remains.');
    const S = D.samples ? b64(D.samples) : null;
    let k = 0, size = 2, mode = 'max', hover = null;
    const [a, actx] = canvas(224, 224), [b, bctx] = canvas(224, 224);
    const info = h('div', { class: 'w-kv', style: 'margin-top:8px' });
    const digit = () => Float32Array.from(S.subarray(k * 784, k * 784 + 784), (u) => u / 255);
    function pooled(x) {
      const n = 28 / size, out = new Float32Array(n * n);
      for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
        let m = 0;
        for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
          const v = x[(r * size + i) * 28 + q * size + j];
          m = mode === 'max' ? Math.max(m, v) : m + v / (size * size);
        }
        out[r * n + q] = m;
      }
      return out;
    }
    function paint(c2, x, n) {
      const cs = 224 / n, ink = hex(css('--ink')), bg = hex(css('--card'));
      for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
        const t = x[r * n + q];
        c2.fillStyle = `rgb(${bg.map((m, i) => Math.round(m + (ink[i] - m) * t)).join(',')})`;
        c2.fillRect(q * cs, r * cs, cs + 0.5, cs + 0.5);
      }
    }
    function draw() {
      const x = digit(), y = pooled(x), n = 28 / size;
      paint(actx, x, 28); paint(bctx, y, n);
      [[actx, 28], [bctx, n]].forEach(([c2, m]) => {
        c2.strokeStyle = 'rgba(127,127,127,.35)'; c2.lineWidth = 1;
        const step = 224 / (c2 === actx ? 28 / size : n);
        for (let i = 1; i < 224 / step; i++) { c2.beginPath(); c2.moveTo(i * step + 0.5, 0); c2.lineTo(i * step + 0.5, 224); c2.moveTo(0, i * step + 0.5); c2.lineTo(224, i * step + 0.5); c2.stroke(); }
      });
      if (hover) {
        const [r, q] = hover, cs = 224 / n;
        actx.strokeStyle = bctx.strokeStyle = css('--accent'); actx.lineWidth = bctx.lineWidth = 2.5;
        actx.strokeRect(q * cs, r * cs, cs, cs); bctx.strokeRect(q * cs, r * cs, cs, cs);
        info.innerHTML = `block (${r}, ${q}) → ${mode} = <b>${y[r * n + q].toFixed(2)}</b> · output ${n}×${n} = ${n * n} numbers instead of 784`;
      } else info.innerHTML = `output ${n}×${n} = <b>${n * n}</b> numbers instead of 784`;
    }
    a.addEventListener('pointermove', (e) => { const rc = a.getBoundingClientRect(), n = 28 / size; hover = [clamp(Math.floor((e.clientY - rc.top) / rc.height * n), 0, n - 1), clamp(Math.floor((e.clientX - rc.left) / rc.width * n), 0, n - 1)]; draw(); });
    a.addEventListener('pointerleave', () => { hover = null; draw(); });
    el.append(h('div', { class: 'w-row' }, h('div', {}, h('div', { class: 'w-kv' }, 'input 28×28'), a), h('div', {}, h('div', { class: 'w-kv' }, 'pooled'), b)), info,
      h('div', { class: 'w-ctrl' }, chips(['max', 'average'], mode, (m) => { mode = m; draw(); }),
        chips(['2×2', '4×4', '7×7'], '2×2', (s) => { size = +s[0]; hover = null; draw(); }),
        btn('another digit', () => { k = (k + 1) % 120; draw(); })));
    draw(); onTheme(draw);
  };

  /* ---------------- teach it your own two classes (logistic regression, live) */
  W.teach = (el) => {
    frame(el, 'Teach it your own two things',
      'Invent two kinds of drawing (circles and crosses, suns and moons, your initials and a friend\'s). Draw an example and add it to one side; five or more of each is a good start. Press <b>train</b>: 785 weights learn by gradient descent, right here. Then draw something new and watch it decide. The picture of the weights shows what it learned to look for: orange pixels vote for the first kind, blue for the second.');
    const ex = [];                            // [pixels, label]
    let w = new Float32Array(784), bias = 0, trained = false, current = new Float32Array(784), timer = null, steps = 0;
    const names = ['circle', 'cross'];
    const [th, thctx] = canvas(300, 84);
    const [wc, wctx] = canvas(112, 112);
    wc.style.border = '1px solid var(--rule)';   // visible before training
    const verdict = h('div', { class: 'w-big', style: 'font-size:34px;margin:6px 0' }, '—');
    const info = h('div', { class: 'w-kv' });
    const nameIn = (i) => {
      const inp = h('input', { type: 'text', value: names[i], 'aria-label': `name of kind ${i + 1}`, style: 'font-family:var(--mono);width:7em' });
      inp.addEventListener('input', () => { names[i] = inp.value || `kind ${i + 1}`; addBtn[i].textContent = `add as ${names[i]}`; show(); });
      return inp;
    };
    const sig = (z) => 1 / (1 + Math.exp(-z));
    const prob = (x) => sig(x.reduce((s, v, i) => s + v * w[i], bias));   // chance of kind 1
    function drawThumbs() {
      thctx.clearRect(0, 0, 300, 84);
      [0, 1].forEach((lab) => {
        const mine = ex.filter((e) => e[1] === lab).slice(-10);
        mine.forEach(([x], k) => {
          thctx.fillStyle = '#000'; thctx.fillRect(k * 30, lab * 42, 28, 28);
          drawDigit(thctx, x, k * 30, lab * 42, 28, lab ? css('--neg') : css('--pos'));
        });
        thctx.fillStyle = css('--ink-2'); thctx.font = '' + fpx(th, 10) + 'px "JetBrains Mono", monospace';
        thctx.fillText(`${names[lab]}: ${ex.filter((e) => e[1] === lab).length}`, 0, lab * 42 + 39);
      });
    }
    function drawWeights() {
      const m = Math.max(...w.map(Math.abs), 1e-6), cs = 112 / 28;
      for (let i = 0; i < 784; i++) { wctx.fillStyle = div(-w[i] / m); wctx.fillRect((i % 28) * cs, ((i / 28) | 0) * cs, cs, cs); }
    }
    function show() {
      drawThumbs(); drawWeights();
      const any = current.some((v) => v > 0);
      if (!trained || !any) { verdict.textContent = trained ? 'draw one' : '—'; }
      else { const p = prob(current); verdict.textContent = `${p < 0.5 ? names[0] : names[1]} · ${Math.round(Math.max(p, 1 - p) * 100)}%`; }
      info.innerHTML = trained ? `trained for <b>${steps}</b> steps on <b>${ex.length}</b> drawings` : `${ex.length} drawings so far; add some of each, then train`;
    }
    function trainSteps(k) {
      for (let s = 0; s < k; s++) {
        const g = new Float32Array(784); let gb = 0;
        for (const [x, l] of ex) { const d = prob(x) - l; gb += d; for (let i = 0; i < 784; i++) if (x[i]) g[i] += d * x[i]; }
        for (let i = 0; i < 784; i++) w[i] -= 0.5 * g[i] / ex.length + 0.001 * w[i];
        bias -= 0.5 * gb / ex.length; steps++;
      }
    }
    function train() {
      if (ex.length < 2 || new Set(ex.map((e) => e[1])).size < 2) { info.textContent = 'add at least one drawing of each kind first'; return; }
      if (timer) return;
      let n = 0;
      timer = setInterval(() => { trainSteps(10); trained = true; show(); if (++n >= 30) { clearInterval(timer); timer = null; } }, reduced ? 0 : 30);
    }
    const p = pad((x) => { current = x; show(); });
    const add = (lab) => { if (!current.some((v) => v > 0)) return; ex.push([Float32Array.from(current), lab]); p.clear(); show(); };
    const addBtn = [btn(`add as ${names[0]}`, () => add(0)), btn(`add as ${names[1]}`, () => add(1))];
    el.append(h('div', { class: 'w-row' },
      h('div', {}, p.el, h('div', { class: 'w-ctrl' }, addBtn[0], addBtn[1], btn('clear', p.clear))),
      h('div', { class: 'w-col' },
        h('div', { class: 'w-ctrl', style: 'margin-top:0' }, h('label', {}, 'first kind', nameIn(0)), h('label', {}, 'second', nameIn(1))),
        h('div', { style: 'margin-top:10px' }, th),
        h('div', { class: 'w-ctrl' }, btn('train', train, 'accent'), btn('forget', () => { w.fill(0); bias = 0; trained = false; steps = 0; ex.length = 0; show(); })),
        verdict, info,
        h('div', { class: 'w-row', style: 'gap:12px;margin-top:8px;align-items:center' }, wc, h('div', { class: 'w-kv', style: 'flex:1' }, 'its 784 weights, as a picture')))));
    show(); onTheme(show);
  };

  /* ---------------- generative: a tiny GAN learns a distribution you draw */
  W.gan1d = (el) => {
    frame(el, 'A tiny GAN learns what you draw',
      'Drag over the gray bars to draw a target: how often each number from -1 to 1 should come up. Then press <b>play</b>. The generator turns random noise into numbers; the discriminator tries to tell them from samples of your target, and its opinion is the dashed line. Both are small networks trained by gradient descent, against each other. Give it half a minute: the orange line, a histogram of the generator\'s output, moves toward yours and never quite settles, because each player keeps answering the other. The dashed line crosses the dotted 0.5 line where the discriminator stops being sure. Watch the gaps: one noise number goes in, so the generator can only stretch and squeeze it, and it leaves a thin bridge of samples between hills. Press <b>new players</b> a few times, and sometimes it piles everything into narrow spikes instead, a small taste of the mode collapse of Chapter 19.');
    const B = 40, Wd = 340, Ht = 220;
    const [c, ctx] = canvas(Wd, Ht);
    let target = new Float32Array(B).map((_, i) => Math.exp(-((i - 11) ** 2) / 24) + Math.exp(-((i - 28) ** 2) / 24));
    // the generator's histogram is drawn from fixed, evenly spread noise, so the line moves only when the generator does
    const NQ = 4000, zq = Float64Array.from({ length: NQ }, (_, k) => { const p = (k + 0.5) / NQ, t = Math.sqrt(-2 * Math.log(Math.min(p, 1 - p))), z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t); return p < 0.5 ? -z : z; });
    const info = h('div', { class: 'w-kv', style: 'margin-top:8px' });
    const rnd = mulberry(5);
    const g = () => gauss(rnd);
    const H = 32;
    const mk = (s) => ({ w1: Float64Array.from({ length: H }, () => g() * s), b1: Float64Array.from({ length: H }, () => g() * 0.5 * s), w2: Float64Array.from({ length: H }, () => g() / 4), b2: 0 });
    let G = mk(1), D = mk(3), timer = null, step = 0;
    const tanh = Math.tanh, sig = (z) => 1 / (1 + Math.exp(-z));
    function fwd(n, x) { const hh = new Float64Array(H); let o = n.b2; for (let j = 0; j < H; j++) { hh[j] = tanh(n.w1[j] * x + n.b1[j]); o += n.w2[j] * hh[j]; } return { hh, o }; }
    function back(n, x, r, dOut, grad) {       // accumulate gradients; return d(out)/d(input) * dOut
      let dx = 0; grad.b2 += dOut;
      for (let j = 0; j < H; j++) { grad.w2[j] += dOut * r.hh[j]; const dz = dOut * n.w2[j] * (1 - r.hh[j] ** 2); grad.w1[j] += dz * x; grad.b1[j] += dz; dx += dz * n.w1[j]; }
      return dx;
    }
    const zero = () => ({ w1: new Float64Array(H), b1: new Float64Array(H), w2: new Float64Array(H), b2: 0 });
    const apply = (n, gr, lr) => { for (let j = 0; j < H; j++) { n.w1[j] -= lr * gr.w1[j]; n.b1[j] -= lr * gr.b1[j]; n.w2[j] -= lr * gr.w2[j]; } n.b2 -= lr * gr.b2; };
    function sampleTarget() {
      const tot = target.reduce((a, b) => a + b, 0); let u = rnd() * tot;
      for (let i = 0; i < B; i++) { u -= target[i]; if (u <= 0) return -1 + (i + rnd()) / B * 2; }
      return 1;
    }
    const gen = (z) => tanh(fwd(G, z).o);
    function trainStep() {
      if (target.reduce((a, b) => a + b, 0) < 1e-3) return;   // nothing drawn yet: nothing to learn
      const m = 128;
      for (let dk = 0; dk < 5; dk++) {        // discriminator: real -> 1, fake -> 0
        const gd = zero();
        for (let k = 0; k < m; k++) {
          const xr = sampleTarget(), rr = fwd(D, xr); back(D, xr, rr, (sig(rr.o) - 1) / m, gd);
          const xf = gen(g()), rf = fwd(D, xf); back(D, xf, rf, sig(rf.o) / m, gd);
        }
        apply(D, gd, 0.1);
      }
      const gg = zero(), dummy = zero();      // generator: make D say 1
      for (let k = 0; k < m; k++) {
        const z = g(), rg = fwd(G, z), x = tanh(rg.o), rd = fwd(D, x);
        const dx = back(D, x, rd, (sig(rd.o) - 1) / m, dummy);
        back(G, z, rg, dx * Math.max(1 - x * x, 0.1), gg);   // keep a little gradient when the output saturates at ±1
      }
      apply(G, gg, 0.003);
      step++;
    }
    function draw() {
      ctx.clearRect(0, 0, Wd, Ht);
      const base = Ht - 24, bw = Wd / B;
      const hist = new Float32Array(B);
      for (let k = 0; k < NQ; k++) { const x = gen(zq[k]); hist[Math.min(B - 1, Math.max(0, Math.floor((x + 1) / 2 * B)))]++; }
      const tsum = Math.max(target.reduce((a, b) => a + b, 0), 1e-6), scale = (base - 20) / Math.max(NQ / tsum, ...hist);   // a target bar of 1 fills the height
      ctx.fillStyle = 'rgba(127,127,127,.35)';
      for (let i = 0; i < B; i++) { const hgt = target[i] / tsum * NQ * scale; ctx.fillRect(i * bw + 1, base - hgt, bw - 2, hgt); }
      ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2.2; ctx.beginPath();
      for (let i = 0; i < B; i++) { const y = base - hist[i] * scale; i ? ctx.lineTo((i + 0.5) * bw, y) : ctx.moveTo((i + 0.5) * bw, y); }
      ctx.stroke();
      ctx.strokeStyle = css('--rule'); ctx.lineWidth = 1; ctx.setLineDash([1, 3]); ctx.beginPath(); ctx.moveTo(0, base - 0.5 * (base - 20)); ctx.lineTo(Wd, base - 0.5 * (base - 20)); ctx.stroke();
      ctx.strokeStyle = css('--ink'); ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath();
      for (let i = 0; i <= 100; i++) { const x = -1 + i / 50, y = base - sig(fwd(D, x).o) * (base - 20); i ? ctx.lineTo((x + 1) / 2 * Wd, y) : ctx.moveTo(0, y); }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = css('--ink-2'); ctx.font = fpx(c, 10) + 'px "JetBrains Mono", monospace';
      ctx.fillText('-1', 2, Ht - 8); ctx.fillText('1', Wd - fpx(c, 10), Ht - 8); ctx.fillText('0.5', 2, base - 0.5 * (base - 20) - 3);
      let tv = 0; for (let i = 0; i < B; i++) tv += Math.abs(target[i] / tsum - hist[i] / NQ);
      info.innerHTML = tsum < 1e-3 ? 'the target is empty: drag over the canvas to draw one' : `step <b>${step}</b> · mismatch <b>${(tv / 2).toFixed(2)}</b> (0 is a perfect copy) · gray: your target · orange: the generator · dashed: the discriminator's "real" probability`;
    }
    let drawing = false, lastBin = null;
    const paint = (e) => {      // the bar's top follows the finger; a fast drag fills every bin it passed
      const r = c.getBoundingClientRect(), i = clamp(Math.floor((e.clientX - r.left) / r.width * B), 0, B - 1);
      const y = (e.clientY - r.top) / r.height * Ht, v = clamp((Ht - 24 - y) / (Ht - 44), 0, 1);
      const from = lastBin == null ? i : lastBin[0], fv = lastBin == null ? v : lastBin[1];
      for (let j = Math.min(from, i); j <= Math.max(from, i); j++) target[j] = from === i ? v : fv + (v - fv) * (j - from) / (i - from);
      lastBin = [i, v]; draw();
    };
    c.addEventListener('pointerdown', (e) => { drawing = true; lastBin = null; c.setPointerCapture(e.pointerId); paint(e); });
    c.addEventListener('pointermove', (e) => { if (drawing) paint(e); });
    c.addEventListener('pointerup', () => { drawing = false; });
    c.style.cursor = 'crosshair';
    function play() {
      if (timer) { cancelAnimationFrame(timer); timer = null; pb.textContent = 'play'; pb.classList.remove('on'); return; }
      pb.textContent = 'pause'; pb.classList.add('on');
      const loop = () => { const t0 = performance.now(); do trainStep(); while (performance.now() - t0 < 9); draw(); timer = requestAnimationFrame(loop); };
      timer = requestAnimationFrame(loop);
    }
    const pb = btn('play', play, 'accent');
    el.append(c, info, h('div', { class: 'w-ctrl' }, pb,
      btn('new players', () => { G = mk(1); D = mk(3); step = 0; draw(); }),
      btn('clear target', () => { target.fill(0); draw(); })));
    draw(); onTheme(draw);
  };

  /* ---------------- autoencoder: squeeze a digit through k numbers */
  W.squeeze = (el) => {
    frame(el, 'Squeeze a digit through a few numbers',
      'A linear autoencoder\'s best possible encoder and decoder, worked out right here from 120 handwritten digits. Draw a digit (or pick a test one). It is squeezed into <b>k</b> numbers, the code, and rebuilt from them alone. Lower k and watch what is lost. On the map, every one of the 120 digits is placed by the first two numbers of its code. Click anywhere on that map to decode a code nobody drew.');
    const S = b64(D.samples), L = D.sampleLabels, n = L.length, K = 16;
    const X = Array.from({ length: n }, (_, i) => Float64Array.from(S.subarray(i * 784, i * 784 + 784), (v) => v / 255));
    // top-K directions (uncentered, as for the book's linear autoencoder): power iteration on the n x n Gram matrix
    const Gm = Array.from({ length: n }, () => new Float64Array(n));   // plain loops: this runs as the page scrolls
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { const a = X[i], b = X[j]; let t = 0; for (let p = 0; p < 784; p++) t += a[p] * b[p]; Gm[i][j] = Gm[j][i] = t; }
    const comps = [];
    const r0 = mulberry(3);
    for (let k = 0; k < K; k++) {
      let u = Float64Array.from({ length: n }, () => r0() - 0.5), lam = 0;
      for (let it = 0; it < 120; it++) {
        const v = new Float64Array(n);
        for (let i = 0; i < n; i++) { let s = 0; const row = Gm[i]; for (let j = 0; j < n; j++) s += row[j] * u[j]; v[i] = s; }
        for (const c of comps) { let d = 0; for (let i = 0; i < n; i++) d += c.u[i] * v[i]; for (let i = 0; i < n; i++) v[i] -= d * c.u[i]; }
        lam = 0; for (let i = 0; i < n; i++) lam += v[i] * v[i]; lam = Math.sqrt(lam); u = v.map((x) => x / lam);
      }
      const dir = new Float64Array(784);
      for (let i = 0; i < n; i++) for (let p = 0; p < 784; p++) dir[p] += u[i] * X[i][p];
      const norm = Math.sqrt(dir.reduce((s, x) => s + x * x, 0)); for (let p = 0; p < 784; p++) dir[p] /= norm;
      comps.push({ u, dir });
    }
    const encode = (x, k) => comps.slice(0, k).map((c) => c.dir.reduce((s, d, p) => s + d * x[p], 0));
    const decode = (code) => { const out = new Float64Array(784); code.forEach((a, k) => { for (let p = 0; p < 784; p++) out[p] += a * comps[k].dir[p]; }); return out; };
    let k = 4, current = null;
    const [rc, rctx] = canvas(140, 140), [mc, mctx] = canvas(260, 260);
    const codeBars = h('div', { class: 'w-kv', style: 'margin-top:6px;max-width:260px;overflow-wrap:anywhere' });
    const info = h('div', { class: 'w-kv' });
    const pts = X.map((x) => encode(x, 2));
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const lo = [Math.min(...xs), Math.min(...ys)], hi = [Math.max(...xs), Math.max(...ys)];
    const toMap = (a, b) => [10 + (a - lo[0]) / (hi[0] - lo[0]) * 240, 250 - (b - lo[1]) / (hi[1] - lo[1]) * 240];
    const fromMap = (px, py) => [lo[0] + (px - 10) / 240 * (hi[0] - lo[0]), lo[1] + (250 - py) / 240 * (hi[1] - lo[1])];
    function showImage(img) {
      rctx.fillStyle = '#000'; rctx.fillRect(0, 0, 140, 140);
      drawDigit(rctx, Float32Array.from(img, (v) => Math.max(0, Math.min(1, v))), 0, 0, 140, '#fff');
    }
    function drawMap(mark) {
      mctx.clearRect(0, 0, 260, 260);
      const card = hex(css('--card')), light = (card[0] + card[1] + card[2]) / 3 < 128 ? 66 : 42;   // brighter labels on a dark page
      mctx.font = '600 ' + fpx(mc, 11) + 'px "JetBrains Mono", monospace'; mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
      pts.forEach(([a, b], i) => { const [px, py] = toMap(a, b); mctx.fillStyle = `hsl(${L[i] * 36},60%,${light}%)`; mctx.fillText(String(L[i]), px, py); });
      if (mark) { const [px, py] = toMap(mark[0], mark[1]); mctx.strokeStyle = css('--ink'); mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(px, py, 7, 0, 7); mctx.stroke(); }
    }
    function update() {
      if (!current || !current.some((v) => v > 0)) { info.textContent = 'draw a digit'; return; }
      const code = encode(current, k), rec = decode(code);
      showImage(rec);
      const err = current.reduce((s, v, p) => s + (v - rec[p]) ** 2, 0) / 784;
      codeBars.textContent = 'code: [' + code.map((v) => v.toFixed(1)).join(', ') + ']';
      info.innerHTML = `784 pixels → <b>${k}</b> numbers → 784 pixels · squared error <b>${err.toFixed(4)}</b>`;
      drawMap(code.length >= 2 ? code : null);
    }
    mc.style.cursor = 'crosshair'; mc.style.border = '1px solid var(--rule)';
    mc.addEventListener('pointerdown', (e) => {
      const r = mc.getBoundingClientRect(); const code = fromMap((e.clientX - r.left) / r.width * 260, (e.clientY - r.top) / r.height * 260);
      showImage(decode(code)); drawMap(code);
      codeBars.textContent = `code: [${code.map((v) => v.toFixed(1)).join(', ')}]`;
      info.innerHTML = 'decoded from just these <b>2</b> numbers: a digit nobody drew';
    });
    const p = pad((x) => { current = x; update(); });
    el.append(h('div', { class: 'w-row' },
      h('div', {}, p.el, h('div', { class: 'w-ctrl' }, btn('clear', p.clear), btn('a test digit', () => { const i = (Math.random() * n) | 0; p.load(S.subarray(i * 784, i * 784 + 784)); }))),
      h('div', {}, h('div', { class: 'w-kv' }, 'rebuilt from the code'), rc, codeBars,
        h('div', { class: 'w-ctrl' }, slider('k', 1, K, 1, k, (v) => String(v), (v) => { k = v; update(); })), info),
      h('div', {}, h('div', { class: 'w-kv' }, 'the 120 digits, by the first two code numbers'), mc)));
    drawMap(); p.load(S.subarray(0, 784));
  };

  /* ---------------- matrix product: every entry is one dot product */
  W.matmul = (el) => {
    frame(el, 'Every entry is a dot product',
      'Point at (or tab to) any number in the answer <b>C = A @ B</b>. Its row of A and its column of B light up, and the sum that made it is spelled out below. Change the sizes: the inner sizes must match, because each row of A is laid against a column of B, number by number.');
    let n = 2, k = 3, m = 2, A, B, sel = [0, 0];
    const rnd = mulberry(11);
    const fill = () => {
      A = Array.from({ length: n }, () => Array.from({ length: k }, () => Math.floor(rnd() * 7) - 3));
      B = Array.from({ length: k }, () => Array.from({ length: m }, () => Math.floor(rnd() * 7) - 3));
    };
    const area = h('div', { class: 'mm-area' }), sum = h('div', { class: 'w-kv mm-sum' });
    function grid(M, cls, onCell) {
      const g = h('div', { class: 'mm-grid ' + cls, style: `grid-template-columns:repeat(${M[0].length},2.4em)` });
      M.forEach((row, i) => row.forEach((v, j) => {
        const c = h(onCell ? 'button' : 'span', { class: 'mm-cell', type: onCell ? 'button' : undefined }, String(v));
        c.dataset.i = i; c.dataset.j = j;
        if (onCell) { c.addEventListener('pointerenter', () => onCell(i, j)); c.addEventListener('focus', () => onCell(i, j)); c.addEventListener('click', () => onCell(i, j)); }
        g.append(c);
      }));
      return g;
    }
    function render() {
      sel = [Math.min(sel[0], n - 1), Math.min(sel[1], m - 1)];
      const C = A.map((row) => B[0].map((_, j) => row.reduce((s, a, t) => s + a * B[t][j], 0)));
      const gA = grid(A, 'mm-a'), gB = grid(B, 'mm-b'), gC = grid(C, 'mm-c', (i, j) => { sel = [i, j]; mark(); });
      const lab = (t, g, shape) => h('div', { class: 'mm-block' }, h('div', { class: 'w-kv' }, h('b', {}, t), ' ' + shape), g);
      area.replaceChildren(lab('A', gA, `${n}×${k}`), h('span', { class: 'mm-op' }, '@'), lab('B', gB, `${k}×${m}`), h('span', { class: 'mm-op' }, '='), lab('C', gC, `${n}×${m}`));
      function mark() {
        const [i, j] = sel;
        gA.querySelectorAll('.mm-cell').forEach((c) => c.classList.toggle('on', +c.dataset.i === i));
        gB.querySelectorAll('.mm-cell').forEach((c) => c.classList.toggle('on', +c.dataset.j === j));
        gC.querySelectorAll('.mm-cell').forEach((c) => c.classList.toggle('on', +c.dataset.i === i && +c.dataset.j === j));
        const terms = A[i].map((a, t) => `${a}·${B[t][j] < 0 ? '(' + B[t][j] + ')' : B[t][j]}`);
        sum.innerHTML = `C[${i}, ${j}] = row ${i} of A · column ${j} of B = ${terms.join(' + ')} = <b>${C[i][j]}</b>`;
      }
      mark();
    }
    fill();
    el.append(area, sum, h('div', { class: 'w-ctrl' },
      slider('rows of A', 1, 4, 1, n, String, (v) => { n = v; fill(); render(); }),
      slider('inner size', 1, 5, 1, k, String, (v) => { k = v; fill(); render(); }),
      slider('columns of B', 1, 4, 1, m, String, (v) => { m = v; fill(); render(); }),
      btn('new numbers', () => { fill(); render(); })));
    render();
  };

  /* ---------------- uint8 overflow: brighten the cat */
  W.overflow = (el) => {
    frame(el, 'Brighter, and the trap',
      'Multiply every pixel of the cat by a number. With <b>wrap</b>, the result is stored as an 8-bit integer the way NumPy\'s <code>uint8</code> does: anything past 255 wraps around to the bottom, so bright fur turns dark. With <b>clip</b>, values past 255 are held at 255. Point at the photo to see the arithmetic for one pixel. The histogram shows how many pixels have each brightness.');
    const { w, h: ht, px } = D.cat, src = b64(px);
    const [c, ctx] = canvas(w, ht), [hc, hx] = canvas(256, 110);
    const img = ctx.createImageData(w, ht);
    const dpr = Math.min(2, devicePixelRatio || 1);
    const off = document.createElement('canvas'); off.width = w; off.height = ht;
    let k = 2, mode = 'wrap', probe = null;
    const info = h('div', { class: 'w-kv' });
    const f = (v) => { const y = Math.round(v * k); return mode === 'wrap' ? ((y % 256) + 256) % 256 : Math.min(255, y); };
    function draw() {
      const hist = new Float32Array(256);
      for (let i = 0; i < w * ht; i++) for (let ch = 0; ch < 3; ch++) { const v = f(src[i * 3 + ch]); img.data[i * 4 + ch] = v; hist[v]++; }
      for (let i = 0; i < w * ht; i++) img.data[i * 4 + 3] = 255;
      off.getContext('2d').putImageData(img, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.drawImage(off, 0, 0);
      if (probe) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(probe[0] - 3, probe[1] - 3, 6, 6); }
      hx.clearRect(0, 0, 256, 110);
      const mx = Math.max(...hist.slice(1, 255), 1);
      hx.fillStyle = css('--accent');
      for (let v = 0; v < 256; v++) { const hh = Math.min(1, hist[v] / mx) * 96; hx.fillRect(v, 100 - hh, 1, hh); }
      hx.fillStyle = css('--ink-2'); hx.font = fpx(hc, 10) + 'px "JetBrains Mono", monospace';
      hx.fillText('0', 0, 110); hx.fillText('255', 256 - fpx(hc, 20), 110);
      if (probe) {
        const i = (probe[1] * w + probe[0]) * 3, r = src[i], y = Math.round(r * k);
        info.innerHTML = `red channel here: ${r} × ${k} = ${y} → stored as <b>${f(r)}</b>` + (y > 255 ? (mode === 'wrap' ? ` (${y} − 256${y > 511 ? ' − 256' : ''})` : ' (held at 255)') : '');
      } else info.innerHTML = 'point at the photo';
    }
    c.addEventListener('pointermove', (e) => { const r = c.getBoundingClientRect(); probe = [clamp(Math.floor((e.clientX - r.left) / r.width * w), 0, w - 1), clamp(Math.floor((e.clientY - r.top) / r.height * ht), 0, ht - 1)]; draw(); });
    c.addEventListener('pointerdown', (e) => c.dispatchEvent(new PointerEvent('pointermove', e)));
    el.append(h('div', { class: 'w-row' }, c, h('div', {}, h('div', { class: 'w-kv' }, 'how many pixels have each value'), hc, info)),
      h('div', { class: 'w-ctrl' }, slider('multiply by', 0.5, 3, 0.1, k, (v) => v.toFixed(1), (v) => { k = v; draw(); }),
        chips(['wrap', 'clip'], mode, (v) => { mode = v; draw(); })));
    draw(); onTheme(draw);
  };

  /* ---------------- count every picture */
  W.count = (el) => {
    frame(el, 'Count every picture',
      'Click squares to draw a black-and-white picture. Read as a binary number, square by square, it is one picture out of all possible ones, and it lights up in the full list on the right. Each square you add doubles the list. Then try the size and shades sliders to see how fast the count grows.');
    let n = 3, cells = new Uint8Array(9);
    const [gc, gx] = canvas(150, 150), [lc, lx] = canvas(320, 160);
    const info = h('div', { class: 'w-kv' }), big = h('div', { class: 'w-kv' });
    let side = 28, shades = 256;
    const index = () => cells.reduce((s, v, i) => s + v * 2 ** (n * n - 1 - i), 0);
    function draw() {
      const ink = css('--ink'), card = css('--card'), acc = css('--accent');
      gx.clearRect(0, 0, 150, 150);
      const s = 150 / n;
      for (let i = 0; i < n * n; i++) {
        gx.fillStyle = cells[i] ? ink : card; gx.fillRect((i % n) * s + 1, ((i / n) | 0) * s + 1, s - 2, s - 2);
        gx.strokeStyle = css('--rule'); gx.strokeRect((i % n) * s + 1, ((i / n) | 0) * s + 1, s - 2, s - 2);
      }
      const total = 2 ** (n * n), cols = n === 3 ? 32 : n === 2 ? 8 : 2, rows = total / cols;
      const t = Math.min(320 / cols, 160 / rows), q = t / n, me = index();
      lx.clearRect(0, 0, 320, 160);
      for (let p = 0; p < total; p++) {
        const X = (p % cols) * t, Y = ((p / cols) | 0) * t;
        for (let i = 0; i < n * n; i++) if ((p >> (n * n - 1 - i)) & 1) { lx.fillStyle = ink; lx.fillRect(X + (i % n) * q + 0.5, Y + ((i / n) | 0) * q + 0.5, q - 0.5, q - 0.5); }
        if (p === me) { lx.strokeStyle = acc; lx.lineWidth = 2; lx.strokeRect(X + 0.5, Y + 0.5, t - 1, t - 1); }
      }
      const bits = Array.from(cells).join('');
      info.innerHTML = `${n}×${n} squares: <b>2<sup>${n * n}</sup> = ${total}</b> pictures · yours is ${bits} in binary = number <b>${me}</b>`;
      const digits = Math.floor(side * side * Math.log10(shades)) + 1;
      big.innerHTML = `${side}×${side} pixels with ${shades} shades: ${shades}<sup>${side * side}</sup> pictures, a number with <b>${digits.toLocaleString()}</b> digits` + (digits > 80 ? ' (the universe has about 10<sup>80</sup> atoms)' : '');
    }
    gc.style.cursor = 'pointer';
    gc.addEventListener('pointerdown', (e) => {
      const r = gc.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * n), y = Math.floor((e.clientY - r.top) / r.height * n);
      if (x >= 0 && x < n && y >= 0 && y < n) { cells[y * n + x] ^= 1; draw(); }
    });
    el.append(h('div', { class: 'w-row' }, gc, lc), info,
      h('div', { class: 'w-ctrl' }, chips(['1×1', '2×2', '3×3'], '3×3', (v) => { n = +v[0]; cells = new Uint8Array(n * n); draw(); }),
        btn('random', () => { cells = cells.map(() => Math.random() < 0.5 ? 1 : 0); draw(); })),
      h('div', { class: 'w-ctrl' }, slider('size', 1, 28, 1, side, (v) => v + '×' + v, (v) => { side = v; draw(); }),
        slider('shades', 2, 256, 1, shades, String, (v) => { shades = v; draw(); })), big);
    draw(); onTheme(draw);
  };

  /* ---------------- Monty Hall */
  W.monty = (el) => {
    frame(el, 'Monty Hall, played',
      'Pick a door. The host, who knows where the car is, opens a different door with a goat behind it. Then stay or switch. Play a few rounds by hand, then let the computer play a thousand of each and watch the two win rates settle.');
    const doors = h('div', { class: 'mh-doors' }), say = h('div', { class: 'w-kv' }), tally = h('div', { class: 'bars' });
    const stat = { stay: [0, 0], switch: [0, 0] };
    const bb = bars(2, ['stay', 'switch']);
    bb.classList.add('wide-labels');
    let car, pick, opened, done;
    const ds = [0, 1, 2].map((i) => { const d = btn('door ' + (i + 1), () => choose(i)); d.classList.add('mh-door'); doors.append(d); return d; });
    const stayB = btn('stay', () => finish(false)), swB = btn('switch', () => finish(true), 'accent');
    function reset() {
      car = (Math.random() * 3) | 0; pick = opened = null; done = false;
      ds.forEach((d, i) => { d.textContent = 'door ' + (i + 1); d.disabled = false; d.className = 'w-btn mh-door'; });
      stayB.disabled = swB.disabled = true; say.textContent = 'Pick a door.';
    }
    function choose(i) {
      if (pick != null) return;
      pick = i; ds[i].classList.add('on');
      const goats = [0, 1, 2].filter((d) => d !== pick && d !== car);
      opened = goats[(Math.random() * goats.length) | 0];
      ds[opened].textContent = '🐐'; ds[opened].disabled = true;
      stayB.disabled = swB.disabled = false;
      say.textContent = `You picked door ${pick + 1}. The host opens door ${opened + 1}: a goat. Stay with ${pick + 1}, or switch to ${3 - pick - opened + 1}?`;
    }
    function finish(sw) {
      if (done || pick == null) return;
      done = true;
      const fin = sw ? 3 - pick - opened : pick, win = fin === car;
      ds.forEach((d, i) => { d.textContent = i === car ? '🚗' : '🐐'; d.disabled = true; });
      ds[fin].classList.add(win ? 'mh-win' : 'mh-lose');
      record(sw, win);
      say.innerHTML = `You ${sw ? 'switched' : 'stayed'} and ${win ? '<b>won the car</b>' : 'got a goat'}. <button type="button" class="w-btn">again</button>`;
      say.querySelector('button').onclick = reset;
    }
    function record(sw, win) { const s = stat[sw ? 'switch' : 'stay']; s[0] += win; s[1]++; show(); }
    function show() {
      const r = ['stay', 'switch'].map((k) => (stat[k][1] ? stat[k][0] / stat[k][1] : 0));
      bb.set(r, (v) => (v * 100).toFixed(1) + '%', 1);
      tally.textContent = `stay: won ${stat.stay[0]} of ${stat.stay[1]} · switch: won ${stat.switch[0]} of ${stat.switch[1]}`;
    }
    function many() {
      for (let t = 0; t < 1000; t++) for (const sw of [false, true]) {
        const c = (Math.random() * 3) | 0, p = (Math.random() * 3) | 0;
        const goats = [0, 1, 2].filter((d) => d !== p && d !== c), o = goats[(Math.random() * goats.length) | 0];
        record(sw, (sw ? 3 - p - o : p) === c);
      }
    }
    tally.className = 'w-kv';
    el.append(doors, say, h('div', { class: 'w-ctrl' }, stayB, swB, btn('play 1000 of each', many), btn('reset counts', () => { stat.stay = [0, 0]; stat.switch = [0, 0]; show(); })), bb, tally);
    reset(); show();
  };

  /* ---------------- softmax and cross-entropy */
  W.softmax = (el) => {
    frame(el, 'Scores to probabilities',
      'Drag the top bars to set the network\'s ten scores, one per digit. Below them, softmax turns the scores into probabilities that add up to 1. Click a digit\'s label to say which one is right: the loss is minus the log of the probability on the right answer. Try raising every score by the same amount, and try a confident wrong answer.');
    const N = 10, Wd = 340, Ht = 260, top = 124, y0 = 16;
    const [c, ctx] = canvas(Wd, Ht);
    let s = [0.5, -1, 2, 0, -0.5, 1, -2, 0.2, 3, -1], truth = 8;
    const info = h('div', { class: 'w-kv' });
    const bw = Wd / N, sMax = 5;
    const sm = () => { const m = Math.max(...s), e = s.map((v) => Math.exp(v - m)), t = e.reduce((a, b) => a + b, 0); return e.map((v) => v / t); };
    function draw() {
      ctx.clearRect(0, 0, Wd, Ht);
      const p = sm(), mid = (y0 + top) / 2, ink = css('--ink'), ink2 = css('--ink-2'), acc = css('--accent');
      ctx.strokeStyle = css('--rule'); ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(Wd, mid); ctx.moveTo(0, Ht - 28); ctx.lineTo(Wd, Ht - 28); ctx.stroke();
      ctx.font = fpx(c, 10) + 'px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      for (let i = 0; i < N; i++) {
        const x = i * bw + 4, w = bw - 8, y = s[i] / sMax * (mid - y0 - 4);
        ctx.fillStyle = i === truth ? acc : ink2; ctx.globalAlpha = 0.85;
        ctx.fillRect(x, y > 0 ? mid - y : mid, w, Math.abs(y));
        const ph = p[i] * (Ht - 28 - top - 14);
        ctx.fillStyle = i === truth ? acc : ink; ctx.fillRect(x, Ht - 28 - ph, w, ph); ctx.globalAlpha = 1;
        ctx.fillStyle = ink2; ctx.fillText(s[i].toFixed(1), x + w / 2, s[i] >= 0 ? mid + 12 : mid - 4);
        ctx.fillText(p[i] < 0.995 ? p[i].toFixed(2).replace(/^0/, '') : '1.0', x + w / 2, Ht - 32 - ph);
        ctx.fillStyle = i === truth ? acc : ink; ctx.font = (i === truth ? 'bold ' : '') + fpx(c, 13) + 'px "JetBrains Mono", monospace';
        ctx.fillText(String(i), x + w / 2, Ht - 10); ctx.font = fpx(c, 10) + 'px "JetBrains Mono", monospace';
      }
      ctx.textAlign = 'left'; ctx.fillStyle = ink2; ctx.fillText('scores (drag them)', 2, 10); ctx.fillText('probabilities', 2, top + 12);
      const loss = -Math.log(Math.max(p[truth], 1e-12));
      info.innerHTML = `right answer <b>${truth}</b> · probability ${p[truth].toFixed(3)} · loss = −log ${p[truth].toFixed(3)} = <b>${loss.toFixed(3)}</b> · sum of probabilities ${p.reduce((a, b) => a + b, 0).toFixed(3)}`;
    }
    let drag = null;
    const at = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * Wd, (e.clientY - r.top) / r.height * Ht]; };
    c.addEventListener('pointerdown', (e) => {
      const [x, y] = at(e), i = clamp(Math.floor(x / bw), 0, N - 1);
      if (y > Ht - 28) { truth = i; draw(); return; }
      if (y < top) { drag = i; c.setPointerCapture(e.pointerId); move(e); }
    });
    const move = (e) => { if (drag == null) return; const y = at(e)[1], mid = (y0 + top) / 2; s[drag] = Math.round(clamp((mid - y) / (mid - y0 - 4) * sMax, -sMax, sMax) * 10) / 10; draw(); };
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', () => { drag = null; });
    keys(c, 'ten scores; left and right choose a digit, up and down change its score', (dx, dy) => {
      if (dx) truth = (truth + dx + N) % N; else s[truth] = clamp(Math.round((s[truth] - dy * 0.5) * 10) / 10, -sMax, sMax); draw();
    });
    el.append(c, info, h('div', { class: 'w-ctrl' },
      btn('+1 to every score', () => { s = s.map((v) => Math.min(sMax, v + 1)); draw(); }),
      btn('confident and wrong', () => { s = s.map(() => -1); s[(truth + 3) % N] = 5; draw(); }),
      btn('all equal', () => { s = s.map(() => 0); draw(); })));
    draw(); onTheme(draw);
  };

  /* ---------------- occlusion: what does the network look at? */
  W.occlude = (el) => {
    frame(el, 'Cover part of the digit',
      'This is the small trained network from this chapter\'s demos, looking at a handwritten test digit. Move the black square over the digit to erase that part, and watch the probabilities change. Press <b>map</b> to slide the square over every position: red marks the pixels whose loss hurts the network\'s answer most.');
    const S = 224, cell = S / 28;
    const [c, ctx] = canvas(S, S);
    let k = 1 + ((Math.random() * 119) | 0), x0 = null, size = 8, heat = null, sq = [10, 10];
    const pb = bars(10);
    const info = h('div', { class: 'w-kv' });
    const digit = () => Float32Array.from(samples.subarray(k * 784, k * 784 + 784), (v) => v / 255);
    function covered(x, sx, sy) { const y = Float32Array.from(x); for (let r = sy; r < sy + size; r++) for (let q = sx; q < sx + size; q++) if (r >= 0 && r < 28 && q >= 0 && q < 28) y[r * 28 + q] = 0; return y; }
    function draw() {
      const x = x0, y = covered(x, sq[0], sq[1]);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
      drawDigit(ctx, y, 0, 0, S, '#fff');
      if (heat) {
        const m = Math.max(...heat, 1e-6);
        for (let i = 0; i < 784; i++) if (heat[i] > 0) { ctx.fillStyle = `rgba(239,68,68,${0.75 * heat[i] / m})`; ctx.fillRect((i % 28) * cell, ((i / 28) | 0) * cell, cell, cell); }
      }
      ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.strokeRect(sq[0] * cell, sq[1] * cell, size * cell, size * cell);
      const p0 = mlp.forward(x).p, p = mlp.forward(y).p, best = p0.indexOf(Math.max(...p0));
      pb.set(p, (v) => v.toFixed(2), 1);
      const now = p.indexOf(Math.max(...p));
      info.innerHTML = `the digit is a <b>${D.sampleLabels[k]}</b> · uncovered, the network says ${best} (${(p0[best] * 100).toFixed(0)}%) · covered, it says <b>${now}</b> (${(p[now] * 100).toFixed(0)}%)`;
    }
    function map() {
      const x = x0, p0 = mlp.forward(x).p, t = p0.indexOf(Math.max(...p0));
      const acc = new Float32Array(784), cnt = new Float32Array(784);
      for (let sy = -size + 1; sy < 28; sy += 1) for (let sx = -size + 1; sx < 28; sx += 1) {
        const drop = Math.max(0, p0[t] - mlp.forward(covered(x, sx, sy)).p[t]);
        for (let r = Math.max(0, sy); r < Math.min(28, sy + size); r++) for (let q = Math.max(0, sx); q < Math.min(28, sx + size); q++) { acc[r * 28 + q] += drop; cnt[r * 28 + q]++; }
      }
      heat = acc.map((v, i) => (cnt[i] ? v / cnt[i] : 0)); draw();
    }
    const place = (e) => { const r = c.getBoundingClientRect(); sq = [Math.round((e.clientX - r.left) / r.width * 28 - size / 2), Math.round((e.clientY - r.top) / r.height * 28 - size / 2)]; draw(); };
    let down = false;
    c.addEventListener('pointerdown', (e) => { down = true; c.setPointerCapture(e.pointerId); place(e); });
    c.addEventListener('pointermove', (e) => { if (down || e.pointerType === 'mouse') place(e); });
    c.addEventListener('pointerup', () => { down = false; });
    c.style.cursor = 'none';
    keys(c, 'digit with a movable black square', (dx, dy) => { sq = [sq[0] + dx, sq[1] + dy]; draw(); });
    const next = () => { k = (k + 1 + ((Math.random() * 118) | 0)) % 120; x0 = digit(); heat = null; draw(); };
    el.append(h('div', { class: 'w-row' }, c, h('div', { style: 'flex:1;min-width:220px' }, pb, info)),
      h('div', { class: 'w-ctrl' }, btn('map', map, 'accent'), btn('another digit', next), btn('clear map', () => { heat = null; draw(); }),
        slider('square', 2, 14, 1, size, (v) => v + '×' + v, (v) => { size = v; heat = null; draw(); })));
    x0 = digit(); draw(); onTheme(draw);
  };

  /* ---------------- AlexNet's real first layer */
  W.alexnet = (el) => {
    frame(el, 'AlexNet\'s real first layer',
      'These are the 64 filters of AlexNet\'s first layer, exactly as the network learned them from ImageNet, each 11×11 pixels in three colors. Pick one to run it over the cat, stepping 4 pixels at a time as AlexNet does. Its feature map is 55×55: bright where that bit of the photo matches the filter. With <b>signed</b>, orange is a match and blue an anti-match; ReLU keeps only the matches; pooling then keeps the strongest of each 3×3 patch.');
    const A = D.alexnet, q = new Int8Array(b64(A.w).buffer);
    const Wt = Float32Array.from(q, (v, i) => v * A.s[(i / 363) | 0]);
    const [fc, fx] = canvas(8 * 30 + 7 * 3, 8 * 30 + 7 * 3), [ic, ix] = canvas(224, 224), [mc, mx] = canvas(224, 224);
    const info = h('div', { class: 'w-kv' });
    let pick = 1, mode = 'ReLU', X = null;
    const mean = [0.485, 0.456, 0.406], sd = [0.229, 0.224, 0.225];
    function filterRGB(f) {
      const o = f * 363, v = Wt.subarray(o, o + 363), m = Math.max(...v.map(Math.abs));
      return (y, x) => [0, 1, 2].map((ch) => Math.round(127.5 + 127.5 * v[ch * 121 + y * 11 + x] / m));
    }
    function drawFilters() {
      fx.clearRect(0, 0, fc.W, fc.H);
      for (let f = 0; f < 64; f++) {
        const X0 = (f % 8) * 33, Y0 = ((f / 8) | 0) * 33, rgb = filterRGB(f);
        for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) { const [r, g, b] = rgb(y, x); fx.fillStyle = `rgb(${r},${g},${b})`; fx.fillRect(X0 + x * 30 / 11, Y0 + y * 30 / 11, 30 / 11 + 0.4, 30 / 11 + 0.4); }
        if (f === pick) { fx.strokeStyle = css('--accent'); fx.lineWidth = 3; fx.strokeRect(X0 - 1, Y0 - 1, 32, 32); }
      }
    }
    function featureMap() {
      const o = pick * 363, out = new Float32Array(55 * 55), b = A.b[pick];
      for (let oy = 0; oy < 55; oy++) for (let ox = 0; ox < 55; ox++) {
        let s = b;
        for (let ch = 0; ch < 3; ch++) for (let y = 0; y < 11; y++) {
          const iy = oy * 4 - 2 + y; if (iy < 0 || iy >= 224) continue;
          for (let x = 0; x < 11; x++) { const ixx = ox * 4 - 2 + x; if (ixx < 0 || ixx >= 224) continue; s += Wt[o + ch * 121 + y * 11 + x] * X[ch][iy * 224 + ixx]; }
        }
        out[oy * 55 + ox] = s;
      }
      return out;
    }
    function drawMap() {
      if (!X) return;
      let m = featureMap(), n = 55;
      if (mode !== 'signed') m = m.map((v) => Math.max(0, v));
      if (mode === 'ReLU + pool') {
        const p = new Float32Array(27 * 27);
        for (let y = 0; y < 27; y++) for (let x = 0; x < 27; x++) { let b = 0; for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) b = Math.max(b, m[(y * 2 + dy) * 55 + x * 2 + dx]); p[y * 27 + x] = b; }
        m = p; n = 27;
      }
      const mxv = Math.max(...m.map(Math.abs), 1e-6), c = 224 / n;
      mx.clearRect(0, 0, 224, 224);
      for (let i = 0; i < n * n; i++) {
        mx.fillStyle = mode === 'signed' ? div(m[i] / mxv) : `rgb(${Array(3).fill(Math.round(255 * m[i] / mxv)).join(',')})`;
        mx.fillRect((i % n) * c, ((i / n) | 0) * c, c + 0.4, c + 0.4);
      }
      info.innerHTML = `filter <b>${pick}</b> of 64 · its map is ${n}×${n}` + (mode === 'ReLU + pool' ? ' after 3×3 pooling with stride 2' : '') + ' · 64 filters like this make AlexNet\'s first layer, 23,232 weights in all';
    }
    const im = new Image();
    im.onload = () => {
      ix.drawImage(im, 0, 0, 224, 224);
      const t = document.createElement('canvas'); t.width = t.height = 224;
      const tc = t.getContext('2d'); tc.drawImage(im, 0, 0);
      const d = tc.getImageData(0, 0, 224, 224).data;
      X = [0, 1, 2].map((ch) => Float32Array.from({ length: 224 * 224 }, (_, i) => (d[i * 4 + ch] / 255 - mean[ch]) / sd[ch]));
      drawMap();
    };
    im.src = A.jpg;
    fc.style.cursor = 'pointer';
    const choose = (f) => { pick = (f + 64) % 64; drawFilters(); drawMap(); };
    fc.addEventListener('pointerdown', (e) => {
      const r = fc.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * fc.W / 33), y = Math.floor((e.clientY - r.top) / r.height * fc.H / 33);
      if (x >= 0 && x < 8 && y >= 0 && y < 8) choose(y * 8 + x);
    });
    keys(fc, 'the 64 first-layer filters; arrow keys choose one', (dx, dy) => choose(pick + dx + dy * 8));
    el.append(h('div', { class: 'w-row' },
      h('div', {}, h('div', { class: 'w-kv' }, 'the 64 learned filters'), fc),
      h('div', {}, h('div', { class: 'w-kv' }, 'the input, 224×224'), ic),
      h('div', {}, h('div', { class: 'w-kv' }, 'the feature map'), mc)), info,
      h('div', { class: 'w-ctrl' }, chips(['signed', 'ReLU', 'ReLU + pool'], mode, (v) => { mode = v; drawMap(); }),
        btn('random filter', () => choose((Math.random() * 64) | 0))));
    drawFilters(); onTheme(() => { drawFilters(); drawMap(); });
  };

  /* ---------------- AlexNet by the formula */
  W.alexsize = (el) => {
    frame(el, 'AlexNet by the formula',
      'Every shape in AlexNet follows from one rule: a layer with kernel k, stride s and padding p turns a side of n pixels into ⌊(n + 2p − k)/s⌋ + 1. Change the input size and watch the table recompute. The bars compare layers: where the weights are (mostly the fully connected layers) and where the multiplications are (mostly the convolutions). The receptive field is how many input pixels across one unit in that layer can see.');
    const L = [
      ['conv1', 'c', 3, 64, 11, 4, 2], ['pool1', 'p', 0, 0, 3, 2, 0], ['conv2', 'c', 64, 192, 5, 1, 2], ['pool2', 'p', 0, 0, 3, 2, 0],
      ['conv3', 'c', 192, 384, 3, 1, 1], ['conv4', 'c', 384, 256, 3, 1, 1], ['conv5', 'c', 256, 256, 3, 1, 1], ['pool5', 'p', 0, 0, 3, 2, 0],
      ['avgpool', 'a'], ['fc6', 'f', 9216, 4096], ['fc7', 'f', 4096, 4096], ['fc8', 'f', 4096, 1000]];
    const tbl = h('table', { class: 'w-table' }), tot = h('div', { class: 'w-kv' });
    let N = 224;
    const fmt = (v) => v >= 1e9 ? (v / 1e9).toFixed(2) + 'G' : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : String(v);
    function render() {
      let n = N, ch = 3, rf = 1, jump = 1, rows = [], ok = true;
      for (const l of L) {
        let w = 0, mult = 0, shape;
        if (l[1] === 'c' || l[1] === 'p') {
          const [, t, cin, cout, k, s, p] = l;
          n = Math.floor((n + 2 * p - k) / s) + 1; if (n < 1) { ok = false; break; }
          rf += (k - 1) * jump; jump *= s;
          if (t === 'c') { ch = cout; w = cin * k * k * cout + cout; mult = cin * k * k * cout * n * n; }
          shape = `${ch}×${n}×${n}`;
        } else if (l[1] === 'a') { shape = `${ch}×6×6`; n = 6; }
        else { w = l[2] * l[3] + l[3]; mult = l[2] * l[3]; shape = String(l[3]); }
        rows.push({ name: l[0], shape, w, mult, rf: l[1] === 'c' || l[1] === 'p' ? rf : null });
      }
      if (!ok) { tbl.innerHTML = '<tr><td>too small: a layer would have no pixels left</td></tr>'; tot.textContent = ''; return; }
      const W0 = rows.reduce((s, r) => s + r.w, 0), M0 = rows.reduce((s, r) => s + r.mult, 0);
      const bar = (v, t, cls) => `<span class="w-mini ${cls}" style="width:${Math.max(v / t * 100, v ? 1 : 0).toFixed(1)}%"></span>`;
      tbl.innerHTML = '<tr><th>layer</th><th>output</th><th>weights</th><th>multiplications</th><th>sees</th></tr>' +
        rows.map((r) => `<tr><td>${r.name}</td><td>${r.shape}</td><td>${r.w ? fmt(r.w) : ''}<div class="w-minibox">${bar(r.w, W0, 'w')}</div></td><td>${r.mult ? fmt(r.mult) : ''}<div class="w-minibox">${bar(r.mult, M0, 'm')}</div></td><td>${r.rf ? r.rf + ' px' : ''}</td></tr>`).join('');
      tot.innerHTML = `total: <b>${W0.toLocaleString()}</b> weights · <b>${fmt(M0)}</b> multiplications per image` + (N === 224 ? ' (the 61,100,840 printed by <code>ax_count</code>)' : '');
    }
    el.append(h('div', { class: 'w-ctrl' }, slider('input size', 63, 448, 1, N, (v) => v + '×' + v, (v) => { N = v; render(); })), h('div', { class: 'w-scroll' }, tbl), tot);
    render();
  };

  /* ---------------- echo: a reservoir continues a signal */
  W.echo = (el) => {
    frame(el, 'A random memory, live',
      'A reservoir of 200 randomly connected tanh units is fed a signal. Only the readout, one number per unit, is solved for, by least squares on 2,000 steps, so that it predicts the next value. Then the input is cut off and the reservoir runs on its own, fed back by its own predictions (orange). Turn the <b>strength</b> of the random connections down and the memory is too short; up and the reservoir starts to make its own chaos. Try a new random reservoir, too.');
    const Nn = 200, Wd = 340, Ht = 150;
    const [c, ctx] = canvas(Wd, Ht);
    const info = h('div', { class: 'w-kv' });
    let sig = 'Mackey–Glass', g = 0.95, seed = 8, bend = true;
    function signal(kind, T) {
      if (kind === 'sine') return Float64Array.from({ length: T }, (_, t) => Math.sin(t / 6));
      if (kind === 'two waves') return Float64Array.from({ length: T }, (_, t) => 0.6 * Math.sin(t / 5) + 0.4 * Math.sin(t / 13.7));
      const tau = 17, dt = 0.1, hist = new Float64Array(tau * 10 + 1).fill(1.2), out = new Float64Array(T); let x = 1.2, ptr = 0;
      for (let t = 0; t < 300 + T; t++) {
        for (let k = 0; k < 10; k++) { const xd = hist[ptr]; hist[ptr] = x; ptr = (ptr + 1) % hist.length; x += dt * (0.2 * xd / (1 + xd ** 10) - 0.1 * x); }
        if (t >= 300) out[t - 300] = x;
      }
      return out.map((v) => (v - 0.9) * 2.2);
    }
    function solve(Am, bv) {             // Gaussian elimination with partial pivoting
      const n = bv.length;
      for (let i = 0; i < n; i++) {
        let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(Am[r][i]) > Math.abs(Am[p][i])) p = r;
        [Am[i], Am[p]] = [Am[p], Am[i]]; [bv[i], bv[p]] = [bv[p], bv[i]];
        for (let r = i + 1; r < n; r++) { const f = Am[r][i] / Am[i][i]; if (!f) continue; for (let q = i; q < n; q++) Am[r][q] -= f * Am[i][q]; bv[r] -= f * bv[i]; }
      }
      const x = new Float64Array(n);
      for (let i = n - 1; i >= 0; i--) { let s = bv[i]; for (let q = i + 1; q < n; q++) s -= Am[i][q] * x[q]; x[i] = s / Am[i][i]; }
      return x;
    }
    function run() {
      const T0 = 100, T1 = 2000, T2 = 300, u = signal(sig, T0 + T1 + T2 + 1);
      const r = mulberry(seed), gs = () => gauss(r);
      const Wr = Array.from({ length: Nn }, () => Float64Array.from({ length: Nn }, () => gs() * g / Math.sqrt(Nn)));
      const win = Float64Array.from({ length: Nn }, () => gs() * 0.5), wb = Float64Array.from({ length: Nn }, () => gs() * 0.2);
      const f = bend ? Math.tanh : (v) => v;
      const step = (s, x) => { const o = new Float64Array(Nn); for (let i = 0; i < Nn; i++) { let a = win[i] * x + wb[i]; const row = Wr[i]; for (let j = 0; j < Nn; j++) a += row[j] * s[j]; o[i] = f(a); } return o; };
      let s = new Float64Array(Nn);
      const SS = Array.from({ length: Nn }, () => new Float64Array(Nn)), Sy = new Float64Array(Nn);
      for (let t = 0; t < T0 + T1; t++) {
        s = step(s, u[t]);
        if (t >= T0) { const y = u[t + 1]; for (let i = 0; i < Nn; i++) { Sy[i] += s[i] * y; const si = s[i], row = SS[i]; for (let j = 0; j < Nn; j++) row[j] += si * s[j]; } }
      }
      for (let i = 0; i < Nn; i++) SS[i][i] += 1e-6;
      const wo = solve(SS, Sy);
      const out = new Float64Array(T2); let x = u[T0 + T1];
      for (let t = 0; t < T2; t++) { s = step(s, x); x = s.reduce((a, v, i) => a + v * wo[i], 0); if (!isFinite(x) || Math.abs(x) > 1e3) x = NaN; out[t] = x; }
      const truth = u.subarray(T0 + T1 + 1, T0 + T1 + 1 + T2), past = u.subarray(T0 + T1 - 120, T0 + T1 + 1);
      draw(past, truth, out);
      const err = (n) => { let e = 0; for (let t = 0; t < n; t++) e += Math.abs(truth[t] - out[t]); return e / n; };
      const e1 = err(100), e3 = err(T2);
      info.innerHTML = isFinite(e3) ? `average error, first 100 steps on its own: <b>${e1.toExponential(1)}</b> · all 300: <b>${e3.toExponential(1)}</b>` : 'the reservoir blew up running on its own';
    }
    function draw(past, truth, out) {
      ctx.clearRect(0, 0, Wd, Ht);
      const n = past.length + truth.length, X = (t) => t / n * Wd, Y = (v) => Ht / 2 - v * Ht * 0.4;
      ctx.strokeStyle = css('--rule'); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(past.length), 0); ctx.lineTo(X(past.length), Ht); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = css('--ink'); ctx.globalAlpha = 0.25; ctx.lineWidth = 4; ctx.beginPath();
      [...past, ...truth].forEach((v, t) => (t ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v)))); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.6; ctx.beginPath(); let on = false;
      out.forEach((v, t) => { if (!isFinite(v) || Math.abs(v) > 2.4) { on = false; return; } const x = X(past.length + t), y = Y(v); on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true; }); ctx.stroke();
      ctx.fillStyle = css('--ink-2'); ctx.font = fpx(c, 10) + 'px "JetBrains Mono", monospace';
      ctx.fillText('fed the signal', 4, 12); ctx.fillText('on its own →', X(past.length) + 4, 12);
    }
    let pending = null;
    const later = () => { clearTimeout(pending); info.textContent = 'solving…'; pending = setTimeout(run, 30); };
    el.append(c, info, h('div', { class: 'w-ctrl' }, chips(['sine', 'two waves', 'Mackey–Glass'], sig, (v) => { sig = v; later(); }),
      chips(['tanh', 'no bend'], 'tanh', (v) => { bend = v === 'tanh'; later(); })),
      h('div', { class: 'w-ctrl' }, slider('strength', 0.1, 1.6, 0.05, g, (v) => v.toFixed(2), (v) => { g = v; later(); }),
        btn('new random reservoir', () => { seed++; later(); })));
    later(); onTheme(later);
  };

  /* ---------------- MENACE: a learning machine made of matchboxes */
  W.menace = (el) => {
    frame(el, 'MENACE, the matchbox learner',
      'MENACE plays X and you play O. Every position it has seen is a matchbox holding beads, a few for each free square, and it moves by drawing a bead at random. Positions that are rotations or mirror images of each other share a box, as in Michie\'s machine. The small numbers show the beads it had for each square in the box it just drew from. After a game, every box it used gains beads for the move it made: 3 if it won, 1 for a draw, and it loses 3 if it lost. Play it, or let it train against a player who moves at random, and watch it stop losing.');
    const boxes = new Map(), board = Array(9).fill(' '), used = [];
    let over = false, games = 0;
    const hist = [];
    const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    const winner = (b) => { for (const [a, c, d] of lines) if (b[a] !== ' ' && b[a] === b[c] && b[a] === b[d]) return b[a]; return b.includes(' ') ? null : 'draw'; };
    let log = [];
    const SYM = [[0, 1, 2, 3, 4, 5, 6, 7, 8], [6, 3, 0, 7, 4, 1, 8, 5, 2], [8, 7, 6, 5, 4, 3, 2, 1, 0], [2, 5, 8, 1, 4, 7, 0, 3, 6],
      [2, 1, 0, 5, 4, 3, 8, 7, 6], [6, 7, 8, 3, 4, 5, 0, 1, 2], [0, 3, 6, 1, 4, 7, 2, 5, 8], [8, 5, 2, 7, 4, 1, 6, 3, 0]];
    const canon = (b) => { let key = null, map = null; for (const s of SYM) { const k = s.map((i) => b[i]).join(''); if (key === null || k < key) { key = k; map = s; } } return [key, map]; };
    const box = (key) => { if (!boxes.has(key)) { const n = [...key].filter((v) => v === ' ').length, start = n >= 8 ? 4 : n >= 6 ? 3 : n >= 4 ? 2 : 1; boxes.set(key, [...key].map((v) => (v === ' ' ? start : 0))); } return boxes.get(key); };
    function menaceMove(b, log) {
      const [key, map] = canon(b), beads = box(key), tot = beads.reduce((a, v) => a + v, 0);
      let r = Math.random() * tot, m = -1;
      for (let i = 0; i < 9; i++) { r -= beads[i]; if (r < 0) { m = i; break; } }
      if (m < 0) { const free = [...key].map((v, i) => (v === ' ' ? i : -1)).filter((i) => i >= 0); m = free[(Math.random() * free.length) | 0]; }
      log.push([key, m, map]); b[map[m]] = 'X';
    }
    function learn(log, result) {
      const d = result === 'X' ? 3 : result === 'draw' ? 1 : -3;
      for (const [key, m] of log) { const bx = boxes.get(key); bx[m] = Math.max(0, bx[m] + d); }
      games++; hist.push(result === 'O' ? 0 : result === 'draw' ? 1 : 2); if (hist.length > 2000) hist.shift();
    }
    const cells = Array.from({ length: 9 }, (_, i) => { const b = btn('', () => human(i)); b.className = 'mn-cell'; return b; });
    const grid = h('div', { class: 'mn-board' }, ...cells), say = h('div', { class: 'w-kv' });
    const [sc, sx] = canvas(300, 70);
    function show(beads) {
      cells.forEach((c, i) => {
        c.innerHTML = board[i] !== ' ' ? board[i] : beads && beads[i] ? `<small>${beads[i]}</small>` : '';
        c.classList.toggle('x', board[i] === 'X'); c.disabled = over || board[i] !== ' ';
      });
      sx.clearRect(0, 0, 300, 70);
      const win = 100, cols = [css('--neg'), css('--ink-2'), css('--accent')];
      const pts = [];
      for (let e = win; e <= hist.length; e += Math.max(1, Math.floor(hist.length / 150))) { const seg = hist.slice(e - win, e); pts.push([e, seg.filter((v) => v === 0).length / win]); }
      sx.strokeStyle = css('--rule'); sx.strokeRect(0.5, 0.5, 299, 69);
      sx.fillStyle = css('--ink-2'); sx.font = fpx(sc, 10) + 'px "JetBrains Mono", monospace';
      sx.fillText('games lost, of the last 100 (top = 40)', 4, 12);
      if (pts.length > 1) { sx.strokeStyle = cols[0]; sx.lineWidth = 1.6; sx.beginPath(); pts.forEach(([e, v], i) => { const x = (i / (pts.length - 1)) * 296 + 2, y = 67 - Math.min(1, v / 0.4) * 50; i ? sx.lineTo(x, y) : sx.moveTo(x, y); }); sx.stroke(); }
      const last = hist.slice(-100), L = last.filter((v) => v === 0).length, Dd = last.filter((v) => v === 1).length;
      say.innerHTML = `${games} games · ${boxes.size} matchboxes so far` + (last.length ? ` · last ${last.length}: MENACE won ${last.length - L - Dd}, drew ${Dd}, lost <b>${L}</b>` : '');
    }
    function start() { board.fill(' '); over = false; log = []; menaceMove(board, log); show(usedBox()); }
    const usedBox = () => {       // the beads of the last box, placed back on the real board
      if (!log.length) return null;
      const [key, , map] = log[log.length - 1], bx = boxes.get(key), out = Array(9).fill(0);
      map.forEach((sq, i) => { if (key[i] === ' ') out[sq] = bx[i]; });
      return out;
    };
    function human(i) {
      if (over || board[i] !== ' ') return;
      board[i] = 'O';
      let w = winner(board);
      if (!w) { menaceMove(board, log); w = winner(board); }
      if (!w) { show(usedBox()); return; }
      over = true; learn(log, w); show(usedBox());
      say.innerHTML = (w === 'X' ? 'MENACE wins. ' : w === 'O' ? '<b>You win.</b> MENACE takes beads away. ' : 'A draw. ') + say.innerHTML;
    }
    function train(n) {
      for (let g = 0; g < n; g++) {
        const b = Array(9).fill(' '), lg = []; let w = null;
        while (true) {
          menaceMove(b, lg); if ((w = winner(b))) break;
          const free = b.map((v, i) => (v === ' ' ? i : -1)).filter((i) => i >= 0); b[free[(Math.random() * free.length) | 0]] = 'O';
          if ((w = winner(b))) break;
        }
        learn(lg, w);
      }
      start();
    }
    el.append(h('div', { class: 'w-row' }, grid, h('div', {}, sc, say)),
      h('div', { class: 'w-ctrl' }, btn('new game', start, 'accent'), btn('train 200 games', () => train(200)), btn('train 2000', () => train(2000)),
        btn('forget everything', () => { boxes.clear(); hist.length = 0; games = 0; start(); })));
    start(); onTheme(() => show(usedBox()));
  };

  /* ---------------- AlexNet, layer by layer: the real feature maps of a photo */
  const loadScript = (() => {
    const done = {};
    return (src) => done[src] || (done[src] = new Promise((ok, bad) => {
      const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { delete done[src]; bad(new Error('could not load ' + src)); };
      document.head.append(s);
    }));
  })();
  const loadImage = (src) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.src = src; });
  // AlexNet's five conv layers, run in the browser (a Web Worker when allowed): loads engine.js and 3 MB of int8 weights once
  const alexRun = (() => {
    let ready = null;
    return () => ready || (ready = (async () => {
      await loadScript('assets/alexnet/engine.js'); await loadScript('assets/alexnet/weights.js');
      const ws = window.ALEXNET.weights;
      let worker = null;
      try {
        const shim = `const E = (${window.alexEngine.toString()})();
          self.onmessage = (e) => { const m = e.data;
            if (m.weights) { E.setWeights(m.weights); self.postMessage({ ready: true }); }
            else if (m.img) self.postMessage({ id: m.id, outs: E.forward(m.img) });
            else self.postMessage({ id: m.id, grad: E.guided(...m.guided) }); };`;
        worker = new Worker(URL.createObjectURL(new Blob([shim], { type: 'text/javascript' })));
        await new Promise((ok, bad) => { worker.onmessage = (e) => e.data.ready && ok(); worker.onerror = bad; worker.postMessage({ weights: ws }); setTimeout(() => bad(new Error('worker timeout')), 15000); });
      } catch (e) { if (worker) worker.terminate(); worker = null; }
      if (!worker) { const E = window.alexEngine(); E.setWeights(ws); return { forward: async (x) => E.forward(x), guided: async (...a) => E.guided(...a) }; }
      let id = 0; const wait = {};
      worker.onmessage = (e) => { const f = wait[e.data.id]; delete wait[e.data.id]; if (f) f(e.data); };
      const call = (m) => new Promise((ok) => { m.id = ++id; wait[id] = ok; worker.postMessage(m); });
      // the worker keeps one forward pass in memory for tracing, so calls are serialized
      let chain = Promise.resolve();
      const queue = (f) => (chain = chain.then(f, f));
      return { forward: (x) => queue(async () => (await call({ img: x })).outs), guided: (...a) => queue(async () => (await call({ guided: a })).grad) };
    })());
  })();
  function squareCrop(src, w, h) {               // the central square of any picture, as a 224x224 canvas
    const t = document.createElement('canvas'); t.width = t.height = 224;
    const side = Math.min(w, h);
    t.getContext('2d').drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 224, 224);
    return t;
  }
  function tensorOf(c224) {                      // ImageNet normalization, channels first
    const d = c224.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 224, 224).data, x = new Float32Array(3 * 50176);
    const mean = [0.485, 0.456, 0.406], sd = [0.229, 0.224, 0.225];
    for (let i = 0; i < 50176; i++) for (let ch = 0; ch < 3; ch++) x[ch * 50176 + i] = (d[i * 4 + ch] / 255 - mean[ch]) / sd[ch];
    return x;
  }
  function atlasOf({ data, C, H }) {             // the same layout export_alexnet_layers.py uses
    let cols = Math.ceil(Math.sqrt(C)); while (C % cols) cols++;
    const rows = C / cols, Wa = cols * (H + 1) - 1, Ha = rows * (H + 1) - 1;
    const t = document.createElement('canvas'); t.width = Wa; t.height = Ha;
    const g = t.getContext('2d'), im = g.createImageData(Wa, Ha), peak = [], mean = [];
    for (let c = 0; c < C; c++) {
      let m = 0, s = 0; const o = c * H * H;
      for (let i = 0; i < H * H; i++) { m = Math.max(m, data[o + i]); s += data[o + i]; }
      peak.push(m); mean.push(s / (H * H));
      const r = (c / cols) | 0, q = c % cols;
      for (let y = 0; y < H; y++) for (let x = 0; x < H; x++) {
        const v = Math.round(255 * data[o + y * H + x] / (m + 1e-6)), j = ((r * (H + 1) + y) * Wa + q * (H + 1) + x) * 4;
        im.data[j] = im.data[j + 1] = im.data[j + 2] = v; im.data[j + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    return { im: t, C, H, cols, peak, mean };
  }

  W.layers = (el) => {
    frame(el, 'Inside AlexNet, layer by layer',
      'A photo flows left to right through AlexNet. Every square is a real feature map, computed from this photo, and each block shows the strongest few of its layer; drag sideways to turn the stack. Click a block to open every map of that layer. Click a map to enlarge it, then point at it: the box on the photo shows the patch that one number can see, which grows from 11 pixels in conv1 to 163 in conv5. For conv5 you also see what that unit <b>wants</b> to see: an image made by gradient ascent to excite it as much as possible. In the spirit of the Deep Visualization Toolbox, every unit also shows the nine pictures from a small gallery that excite it most, and <b>trace</b> runs AlexNet\'s convolutions right here in your browser to show which pixels of this photo made the unit fire. Try <b>your photo</b>, or the <b>camera</b> for live feature maps.');
    const L = [   // name, kernel, stride, pad (pools folded in where they occur)
      { key: 'input', name: 'input', shape: '3×224×224' },
      { key: 'conv1', name: 'conv1', shape: '64×55×55', ops: [[11, 4, 2]] },
      { key: 'conv2', name: 'conv2', shape: '192×27×27', ops: [[3, 2, 0], [5, 1, 2]], note: 'after pool1' },
      { key: 'conv3', name: 'conv3', shape: '384×13×13', ops: [[3, 2, 0], [3, 1, 1]], note: 'after pool2' },
      { key: 'conv4', name: 'conv4', shape: '256×13×13', ops: [[3, 1, 1]] },
      { key: 'conv5', name: 'conv5', shape: '256×13×13', ops: [[3, 1, 1]] },
      { key: 'fc6', name: 'fc6', shape: '4096', note: 'pool5 →' },
      { key: 'fc7', name: 'fc7', shape: '4096' },
      { key: 'out', name: 'fc8', shape: '1000' }];
    const PHOTOS = ['cat', 'coffee', 'rocket', 'astronaut', 'motorcycle', 'your photo', 'camera'];
    const narrow = (el.clientWidth || 800) < 600;            // a phone: smaller canvas, names only
    const Wd = narrow ? 400 : 760, Ht = narrow ? 210 : 290, room = narrow ? 14 : 120;
    const [c, ctx] = canvas(Wd, Ht);
    const top5 = bars(5, ['', '', '', '', '']), status = h('div', { class: 'w-kv' });
    top5.classList.add('lx-top');
    const detail = h('div', { class: 'lx-detail' });
    let fitK = 1, photo = 'cat', rec = null, maps = {}, yaw = 0.62, sel = null, reveal = 1, hoverBlock = -1, pick = 0, wantsData = null;
    const geo = [];   // screen boxes of the blocks, for clicks

    function mapTile(layer, k) {            // one map from the atlas as its own small canvas
      const a = rec.layers[layer], key = layer + ':' + k;
      if (maps[key]) return maps[key];
      const t = document.createElement('canvas'); t.width = t.height = a.H;
      const r = (k / a.cols) | 0, q = k % a.cols;
      t.getContext('2d').drawImage(a.im, q * (a.H + 1), r * (a.H + 1), a.H, a.H, 0, 0, a.H, a.H);
      return (maps[key] = t);
    }
    const strongest = (layer, n) => rec.layers[layer].mean.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, n).map((p) => p[1]);

    function draw(t) {
      ctx.setTransform(Math.min(2, devicePixelRatio || 1), 0, 0, Math.min(2, devicePixelRatio || 1), 0, 0);
      ctx.clearRect(0, 0, Wd, Ht);
      const dpr = Math.min(2, devicePixelRatio || 1), ink = css('--ink'), ink2 = css('--ink-2'), acc = css('--accent'), rule = css('--rule');
      const cy = narrow ? 92 : 128, kx = Math.cos(yaw), ky = Math.sin(yaw) * 0.45;
      const K = fitK, sizes = [116, 96, 80, 64, 64, 64].map((v) => v * K), depth = [1, 7, 8, 9, 8, 8];
      let x = 18;
      geo.length = 0;
      ctx.font = fpx(c, 10.5) + 'px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      L.forEach((l, li) => {
        const on = reveal >= li / L.length, fade = clamp((reveal * L.length - li) * 1.5, 0, 1);
        let x0 = x, x1;
        ctx.globalAlpha = on ? fade : 0;
        if (li < 6) {
          const s = sizes[li], n = depth[li], gap = li === 0 ? 0 : 5 * K, w = s * kx * 0.8, hgt = s;
          const ids = li === 0 ? [0] : strongest(l.key, n).reverse();
          ids.forEach((id, j) => {
            const ox = x + j * gap, oy = cy - hgt / 2 - j * gap * 0.35;
            const tex = li === 0 ? rec.photoIm : mapTile(l.key, id);
            ctx.setTransform(dpr * w / tex.width, dpr * (-ky * s) / tex.width, 0, dpr * hgt / tex.height, dpr * ox, dpr * (oy + ky * s * 0.5));
            ctx.imageSmoothingEnabled = li === 0;
            ctx.globalAlpha = (on ? fade : 0) * (li === 0 ? 1 : 0.35 + 0.65 * (j + 1) / ids.length);
            ctx.drawImage(tex, 0, 0);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.globalAlpha = on ? fade : 0;
            ctx.strokeStyle = hoverBlock === li || sel === li ? acc : rule; ctx.lineWidth = hoverBlock === li || sel === li ? 1.6 : 0.8;
            ctx.beginPath(); ctx.moveTo(ox, oy + ky * s * 0.5); ctx.lineTo(ox + w, oy + ky * s * 0.5 - ky * s); ctx.lineTo(ox + w, oy + ky * s * 0.5 - ky * s + hgt); ctx.lineTo(ox, oy + ky * s * 0.5 + hgt); ctx.closePath(); ctx.stroke();
          });
          x1 = x + (ids.length - 1) * gap + w;
          x = x1 + (li === 0 ? 30 : 24) * K;
        } else {                                  // fully connected: a column of 4096 (or 1000) numbers
          const hgt = (li === 8 ? 120 : 170) * (narrow ? 0.7 : 1), w = 12 * K;
          if (narrow) x += 4;
          ctx.fillStyle = sel === li || hoverBlock === li ? acc : ink2; ctx.globalAlpha = (on ? fade : 0) * 0.85;
          for (let k = 0; k < 34; k++) { ctx.beginPath(); ctx.arc(x + w / 2, cy - hgt / 2 + (k + 0.5) * hgt / 34, 1.9, 0, 7); ctx.fill(); }
          ctx.globalAlpha = on ? fade : 0;
          x1 = x + w; x = x1 + 40 * K;
        }
        ctx.fillStyle = sel === li ? acc : ink; ctx.fillText(narrow ? l.name.replace('conv', 'c').replace('input', 'in').replace('fc', 'f') : l.name, (x0 + x1) / 2, Ht - (narrow ? 14 : 46));
        if (narrow) { geo.push([x0 - 4, x1 + 4]); ctx.globalAlpha = 1; return; }
        ctx.fillStyle = ink2; ctx.fillText(l.shape, (x0 + x1) / 2, Ht - 32);
        if (l.note) { ctx.fillStyle = css('--muted'); ctx.fillText(l.note, (x0 + x1) / 2, Ht - 18); }
        geo.push([x0 - 6, x1 + 6]);
        ctx.globalAlpha = 1;
      });
      // keep the whole stack and the answer inside the canvas, whatever the angle
      const want = clamp(fitK * (Wd - room) / x, 0.3, 1);
      if (Math.abs(want - fitK) > 0.01 && !draw.again) { fitK = want; draw.again = true; draw(t); draw.again = false; return; }
      // the answer
      if (reveal >= 1 && rec && rec.top && !narrow) {
        ctx.textAlign = 'left'; ctx.fillStyle = acc; ctx.font = '600 ' + fpx(c, 12.5) + 'px "JetBrains Mono", monospace';
        const [name, p] = rec.top[0];
        ctx.fillText(name, x - 8, cy - 6); ctx.fillStyle = ink2; ctx.font = fpx(c, 10.5) + 'px "JetBrains Mono", monospace';
        ctx.fillText((p * 100).toFixed(1) + '%', x - 8, cy + 10);
      }
      // a pulse running through while the photo flows in
      if (reveal < 1) { const px = 18 + reveal * (x - 18); ctx.fillStyle = acc; ctx.globalAlpha = 0.18; ctx.fillRect(px - 10, 20, 20, Ht - 80); ctx.globalAlpha = 1; }
    }

    function flow() {
      if (reduced) { reveal = 1; draw(); return; }
      const t0 = performance.now();
      const step = (t) => { reveal = Math.min(1, (t - t0) / 1600); draw(); if (reveal < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }

    async function load(name) {
      photo = name; status.textContent = 'loading ' + name + '…';
      await loadScript(`assets/alexnet/photo_${name}.js`);
      const r = window.ALEXNET['photo_' + name];
      r.photoIm = await loadImage(r.jpg);
      for (const k of Object.keys(r.layers)) r.layers[k].im = await loadImage(r.layers[k].img);
      rec = r; maps = {}; top5.style.display = '';
      top5.set(r.top.map((t) => t[1]), (v) => (v * 100).toFixed(1) + '%', 1);
      top5.querySelectorAll('.bar b').forEach((b, i) => { b.textContent = r.top[i][0]; });
      status.innerHTML = `AlexNet's top five guesses for this photo` + (name === 'rocket' || name === 'astronaut' ? ' · ImageNet has no class for this, so it reaches for the nearest thing it knows' : '');
      flow(); if (sel != null) openLayer(sel);
    }

    // your own picture, or a camera frame: the five conv layers computed right here
    let busy = false, traceOn = false, lastForward = null;
    async function useImage(src, w, h, live) {
      if (busy) return; busy = true;
      try {
        if (!live) status.textContent = 'loading AlexNet\'s convolution layers (3 MB, once)…';
        const E = await alexRun();
        const photoIm = squareCrop(src, w, h), x = tensorOf(photoIm);
        if (!live) status.textContent = 'running five convolution layers in your browser…';
        const t0 = performance.now(), outs = await E.forward(x), ms = performance.now() - t0;
        const layers = {}; for (const k of Object.keys(outs)) layers[k] = atlasOf(outs[k]);
        rec = { photoIm, layers, custom: true, x }; lastForward = rec; traceOn = true; maps = {}; top5.style.display = 'none';
        status.innerHTML = `computed in your browser in <b>${(ms / 1000).toFixed(1)} s</b> · only the convolution layers: the fully connected ones hold 58 of AlexNet's 61 million weights, too many to send to a web page, so there is no guess`;
        if (live) { reveal = 1; draw(); } else flow();
        openLayer(sel == null || sel === 0 || sel > 5 ? 1 : sel, true);
      } catch (e) { status.textContent = 'could not run AlexNet here: ' + e.message; } finally { busy = false; }
    }
    const file = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      const im = await loadImage(URL.createObjectURL(f)); useImage(im, im.naturalWidth, im.naturalHeight);
      file.value = '';
    });
    let cam = null;
    async function startCam() {
      try {
        const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 } }, audio: false });
        const v = document.createElement('video'); v.srcObject = st; v.muted = true; v.playsInline = true; await v.play();
        cam = { st, v }; const me = cam;
        while (cam === me) {
          if (!el.isConnected || document.hidden) { await new Promise((r) => setTimeout(r, 500)); if (!el.isConnected) stopCam(); continue; }
          await useImage(v, v.videoWidth, v.videoHeight, true);
          await new Promise((r) => setTimeout(r, 60));
        }
      } catch (e) { status.textContent = 'no camera here: ' + e.message; }
    }
    function stopCam() { if (cam) { cam.st.getTracks().forEach((t) => t.stop()); cam = null; } }
    const io2 = new IntersectionObserver((es) => es.forEach((e) => { if (!e.isIntersecting) stopCam(); }));
    io2.observe(el);

    // receptive field: which input pixels can one unit of a layer see?
    function field(li, r, q) {
      const ops = []; for (let k = 1; k <= li; k++) ops.push(...L[k].ops);
      let a0 = r, a1 = r, b0 = q, b1 = q;
      for (let k = ops.length - 1; k >= 0; k--) { const [ks, s, p] = ops[k]; a0 = a0 * s - p; a1 = a1 * s - p + ks - 1; b0 = b0 * s - p; b1 = b1 * s - p + ks - 1; }
      return [clamp(a0, 0, 223), clamp(a1, 0, 223), clamp(b0, 0, 223), clamp(b1, 0, 223), a1 - a0 + 1];
    }

    function openLayer(li, keep) {
      const same = keep && sel === li;
      sel = li; draw();
      const l = L[li];
      if (li >= 6 && rec.custom) {
        detail.replaceChildren(h('p', { class: 'w-kv', style: 'max-width:640px' }, `${l.name} is not computed for your own pictures: the fully connected layers hold 58 of AlexNet's 61 million weights, too many to send to a web page.`));
        return;
      }
      if (li === 0 || li >= 6) {
        const txt = li === 0 ? 'The input: 224×224 pixels in three colors, 150,528 numbers.'
          : li === 8 ? `fc8 holds one score per ImageNet class. Softmax turns the 1,000 scores into probabilities; the top five are the bars above.`
            : `${l.name} is a list of 4,096 numbers, each a weighted sum of every number in the layer before (9,216 of them for fc6). After the ReLU, <b>${rec.fc[l.key].active.toLocaleString()}</b> of the 4,096 are above zero for this photo. There are no pictures here any more: just a long list that the last layer reads off.`;
        detail.replaceChildren(h('p', { class: 'w-kv', style: 'max-width:640px' }));
        detail.firstChild.innerHTML = txt;
        if (li === 8) showClasses();
        return;
      }
      const a = rec.layers[l.key];
      const scale = Math.min(2, 340 / a.im.width);
      const [ac, actx] = canvas(Math.round(a.im.width * scale), Math.round(a.im.height * scale));
      const [mc, mctx] = canvas(208, 208), [pc, pctx] = canvas(208, 208);
      const info = h('div', { class: 'w-kv' }), wantBox = h('div', {});
      if (!same) pick = strongest(l.key, 1)[0];
      let cellNow = null;
      function drawAtlas() {
        actx.imageSmoothingEnabled = false; actx.clearRect(0, 0, ac.W, ac.H); actx.drawImage(a.im, 0, 0, ac.W, ac.H);
        const r = (pick / a.cols) | 0, q = pick % a.cols, s = (a.H + 1) * scale;
        actx.strokeStyle = css('--accent'); actx.lineWidth = 2; actx.strokeRect(q * s - 1, r * s - 1, a.H * scale + 2, a.H * scale + 2);
      }
      function drawMap(cell) {
        mctx.imageSmoothingEnabled = false; mctx.clearRect(0, 0, 208, 208); mctx.drawImage(mapTile(l.key, pick), 0, 0, 208, 208);
        pctx.clearRect(0, 0, 208, 208); pctx.drawImage(rec.photoIm, 0, 0, 208, 208);
        if (cell) {
          const [r0, r1, q0, q1, span] = field(li, cell[0], cell[1]), k = 208 / 224, s = 208 / a.H;
          mctx.strokeStyle = css('--accent'); mctx.lineWidth = 2; mctx.strokeRect(cell[1] * s, cell[0] * s, s, s);
          pctx.fillStyle = 'rgba(0,0,0,.45)'; pctx.fillRect(0, 0, 208, 208);
          pctx.drawImage(rec.photoIm, q0, r0, q1 - q0 + 1, r1 - r0 + 1, q0 * k, r0 * k, (q1 - q0 + 1) * k, (r1 - r0 + 1) * k);
          pctx.strokeStyle = css('--accent'); pctx.lineWidth = 2; pctx.strokeRect(q0 * k, r0 * k, (q1 - q0 + 1) * k, (r1 - r0 + 1) * k);
          info.innerHTML = `${l.name}, map <b>${pick}</b> of ${a.C} · unit (${cell[0]}, ${cell[1]}) of ${a.H}×${a.H} sees a <b>${span}×${span}</b> patch of the photo` + (span > 224 ? ' (more than the whole photo, padding included)' : '');
        } else info.innerHTML = `${l.name}, map <b>${pick}</b> of ${a.C} · its strongest response here is ${a.peak[pick].toFixed(1)} · point at the map, click to trace that unit`;
      }
      function choose(k) {
        pick = clamp(k, 0, a.C - 1); drawAtlas(); drawMap(null); cellNow = null;
        if (l.key === 'conv5') showWant(); else if (l.key === 'conv1') showFilter(); else wantBox.replaceChildren();
        showGallery(); if (tracing) trace();
      }
      // the nine gallery pictures that excite this unit most, each cropped to what the unit can see
      const [gc, gx] = canvas(204, 204);
      async function showGallery() {
        const me = pick;
        await ensureGallery(); if (me !== pick) return;
        gx.clearRect(0, 0, 204, 204);
        const best = galleryData.top[l.key][pick];
        for (let i = 0; i < best.length; i++) {
          const [g, r, q] = best[i], im = await galleryImage(g); if (me !== pick) return;
          const [r0, r1, q0, q1] = field(li, r, q);
          gx.drawImage(im, q0, r0, q1 - q0 + 1, r1 - r0 + 1, (i % 3) * 68, ((i / 3) | 0) * 68, 66, 66);
        }
      }
      // guided backpropagation: which pixels of this photo drive the unit
      const [tc, tx] = canvas(208, 208), traceNote = h('div', { class: 'w-kv', style: 'max-width:208px' });
      let tracing = traceOn;
      const traceBtn = btn('trace it to the pixels', () => { tracing = traceOn = true; traceBtn.remove(); trace(); }, 'accent');
      async function trace() {
        const me = pick, li0 = li;
        traceNote.textContent = 'tracing…';
        try {
          const E = await alexRun();
          if (lastForward !== rec) { const r0 = rec; await E.forward(rec.x || (rec.x = tensorOf(squareCrop(rec.photoIm, rec.photoIm.width, rec.photoIm.height)))); lastForward = r0; }
          let cell = cellNow;
          if (!cell) {                            // the unit's strongest spot in this map
            const t = mapTile(l.key, pick), d = t.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, t.width, t.height).data;
            let bi = 0; for (let i = 0; i < t.width * t.height; i++) if (d[i * 4] > d[bi * 4]) bi = i;
            cell = [(bi / t.width) | 0, bi % t.width];
          }
          const g = await E.guided(l.key, pick, cell[0], cell[1]);
          if (me !== pick || li0 !== sel) return;
          let s2 = 0; for (let i = 0; i < g.length; i++) s2 += g[i] * g[i];
          const sd = Math.sqrt(s2 / g.length) || 1, im = tx.createImageData(224, 224);
          for (let i = 0; i < 50176; i++) { for (let ch = 0; ch < 3; ch++) im.data[i * 4 + ch] = clamp(128 + 40 * g[ch * 50176 + i] / sd, 0, 255); im.data[i * 4 + 3] = 255; }
          const t = document.createElement('canvas'); t.width = t.height = 224; t.getContext('2d').putImageData(im, 0, 0);
          // zoom to what the unit can see (at least 56 pixels across), so small early units are visible too
          const [r0, r1, q0, q1] = field(li, cell[0], cell[1]), side = clamp(Math.max(r1 - r0, q1 - q0) + 1, 56, 224);
          const cy0 = clamp((r0 + r1) / 2 - side / 2, 0, 224 - side), cx0 = clamp((q0 + q1) / 2 - side / 2, 0, 224 - side), k = 208 / side;
          tx.imageSmoothingEnabled = side > 120; tx.clearRect(0, 0, 208, 208); tx.drawImage(t, cx0, cy0, side, side, 0, 0, 208, 208);
          tx.strokeStyle = css('--accent'); tx.lineWidth = 1.5; tx.strokeRect((q0 - cx0) * k, (r0 - cy0) * k, (q1 - q0 + 1) * k, (r1 - r0 + 1) * k);
          traceNote.innerHTML = `unit (${cell[0]}, ${cell[1]}) of map ${pick}: the ${side}×${side} pixels around what it sees: gray is no effect, color marks the pixels that push it up` + (s2 === 0 ? ' (this unit is silent here, so nothing does)' : '');
        } catch (e) { traceNote.textContent = 'could not trace: ' + e.message; }
      }
      function showFilter() {
        const [fc, fx] = canvas(110, 110), Wt = new Int8Array(b64(D.alexnet.w).buffer), o = pick * 363;
        let m = 0; for (let i = 0; i < 363; i++) m = Math.max(m, Math.abs(Wt[o + i]));
        for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) { const v = [0, 1, 2].map((ch) => Math.round(127.5 + 127.5 * Wt[o + ch * 121 + y * 11 + x] / m)); fx.fillStyle = `rgb(${v})`; fx.fillRect(x * 10, y * 10, 10, 10); }
        wantBox.replaceChildren(h('div', { class: 'w-kv' }, 'its filter, 11×11'), fc);
      }
      async function showWant() {
        wantBox.replaceChildren(h('div', { class: 'w-kv' }, 'what it wants to see: loading…'));
        await ensureWants();
        const im = h('img', { src: wantsData.conv5[pick], width: 208, height: 208, alt: `an image made to excite conv5 unit ${pick}`, class: 'lx-want' });
        wantBox.replaceChildren(h('div', { class: 'w-kv' }, 'what it wants to see'), im);
      }
      ac.style.cursor = 'pointer';
      ac.addEventListener('pointerdown', (e) => {
        const r = ac.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * ac.W / scale, y = (e.clientY - r.top) / r.height * ac.H / scale;
        const q = Math.floor(x / (a.H + 1)), rr = Math.floor(y / (a.H + 1));
        if (q < a.cols && rr * a.cols + q < a.C) choose(rr * a.cols + q);
      });
      keys(ac, `all ${a.C} maps of ${l.name}; arrow keys choose one`, (dx, dy) => choose(pick + dx + dy * a.cols));
      const at = (e) => { const r = mc.getBoundingClientRect(); return [clamp(Math.floor((e.clientY - r.top) / r.height * a.H), 0, a.H - 1), clamp(Math.floor((e.clientX - r.left) / r.width * a.H), 0, a.H - 1)]; };
      mc.addEventListener('pointermove', (e) => drawMap(at(e)));
      mc.addEventListener('pointerdown', (e) => { cellNow = at(e); drawMap(cellNow); if (tracing) trace(); });
      mc.style.cursor = 'crosshair';
      detail.replaceChildren(
        h('div', { class: 'w-kv' }, `all ${a.C} maps of ${l.name} for this photo, each scaled to its own brightest point · click one`), ac,
        h('div', { class: 'w-row', style: 'margin-top:12px' },
          h('div', {}, h('div', { class: 'w-kv' }, 'the map, enlarged'), mc),
          h('div', {}, h('div', { class: 'w-kv' }, 'what one unit sees'), pc), wantBox), info,
        h('div', { class: 'w-row', style: 'margin-top:14px' },
          h('div', { style: 'max-width:208px' }, h('div', { class: 'w-kv' }, 'the nine gallery pictures it likes most'), gc),
          h('div', { style: 'max-width:208px' }, h('div', { class: 'w-kv' }, 'the pixels behind it'), tracing ? tc : h('div', {}, tc, traceBtn), traceNote)));
      if (!tracing) { tx.fillStyle = css('--paper-2'); tx.fillRect(0, 0, 208, 208); traceNote.textContent = 'runs AlexNet in your browser (3 MB, once)'; }
      choose(pick);
    }

    let galleryData = null; const galleryIms = {};
    async function ensureGallery() { if (!galleryData) { await loadScript('assets/alexnet/gallery.js'); galleryData = window.ALEXNET.gallery; } }
    const galleryImage = (g) => galleryIms[g] || (galleryIms[g] = loadImage(galleryData.images[g]));
    async function ensureWants() { if (!wantsData) { await loadScript('assets/alexnet/wants.js'); wantsData = window.ALEXNET.wants; } }
    const classBox = h('div', {});
    async function showClasses() {
      classBox.replaceChildren(h('div', { class: 'w-kv' }, 'loading…'));
      await ensureWants();
      const grid = h('div', { class: 'lx-classes' }, ...wantsData.classes.map(([n, src]) => h('figure', {}, h('img', { src, alt: `an image made to make AlexNet say ${n}`, width: 128, height: 128 }), h('figcaption', {}, n))));
      classBox.replaceChildren(h('p', { class: 'w-kv', style: 'max-width:640px' }, 'And here is what AlexNet imagines for a few classes: each image starts as gray noise and is changed, step by step, to raise one class score as high as it will go. Flamingo legs, fish scales, cat ears and eyes appear, but never a whole sensible scene: the network has learned the parts that vote for a class, not what the scene looks like.'), grid);
      detail.append(classBox);
    }

    // turning and choosing on the stack
    let drag = null;
    const blockAt = (e) => { const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * Wd; return geo.findIndex(([a, b]) => x >= a && x <= b); };
    c.addEventListener('pointerdown', (e) => { drag = [e.clientX, yaw, false]; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => {
      if (drag) { const dx = e.clientX - drag[0]; if (Math.abs(dx) > 4) { drag[2] = true; yaw = clamp(drag[1] + dx / 180, 0.15, 1.35); draw(); } return; }
      const b = blockAt(e); if (b !== hoverBlock) { hoverBlock = b; c.style.cursor = b >= 0 ? 'pointer' : 'grab'; draw(); }
    });
    c.addEventListener('pointerup', (e) => { if (drag && !drag[2]) { const b = blockAt(e); if (b >= 0 && rec) openLayer(b); } drag = null; });
    c.addEventListener('pointerleave', () => { hoverBlock = -1; draw(); });
    keys(c, 'AlexNet as a stack of layers; left and right choose a layer', (dx) => { if (rec) openLayer(clamp((sel == null ? 0 : sel) + dx, 0, L.length - 1)); });

    el.append(h('div', { class: 'w-ctrl', style: 'margin-top:0' }, chips(PHOTOS, photo, (n) => { stopCam(); if (n === 'your photo') file.click(); else if (n === 'camera') startCam(); else load(n); }), file, btn('play it through again', flow)),
      h('div', { class: 'w-scroll' }, c), h('div', { class: 'w-row' }, h('div', { style: 'flex:1;min-width:260px' }, status, top5)), detail);
    load('cat').then(() => openLayer(1)).catch((e) => { status.textContent = String(e.message); });
    onTheme(() => { draw(); if (sel != null) openLayer(sel); });
  };

  /* ---------------- mount when visible */
  const io = new IntersectionObserver((ents) => ents.forEach((e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    const f = W[e.target.dataset.widget];
    if (f) {
      try { f(e.target); } catch (err) { console.error(err); e.target.remove(); return; }
      const t = e.target.querySelector('.w-title');
      e.target.querySelectorAll('canvas').forEach((c) => {
        c.setAttribute('role', 'img');
        if (!c.getAttribute('aria-label')) c.setAttribute('aria-label', t ? t.textContent : 'interactive figure');
      });
    }
  }), { rootMargin: '300px 0px' });
  document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('.widget').forEach((w) => io.observe(w)));

  window.Widgets = { mlp, all: W };
})();
