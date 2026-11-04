/* AlexNet's five convolution layers in plain JavaScript, forward and guided
   backpropagation. Used by the 'layers' demo (inside a Web Worker when the
   browser allows it) and by tools that check it against PyTorch. */
function alexEngine() {
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  let L = null;
  function setWeights(ws) {
    L = ws.map((l) => {
      const q = new Int8Array(b64(l.w).buffer), n = l.cin * l.k * l.k;
      return { ...l, W: Float32Array.from(q, (v, i) => v * l.scale[(i / n) | 0]), b: Float32Array.from(l.b) };
    });
  }
  function conv(x, H, l) {                     // x: cin*H*H -> cout*Ho*Ho
    const { cin, cout, k, s, p, W, b } = l, Ho = Math.floor((H + 2 * p - k) / s) + 1, out = new Float32Array(cout * Ho * Ho);
    for (let co = 0; co < cout; co++) {
      const o = co * Ho * Ho; out.fill(b[co], o, o + Ho * Ho);
      for (let ci = 0; ci < cin; ci++) for (let ky = 0; ky < k; ky++) for (let kx = 0; kx < k; kx++) {
        const w = W[((co * cin + ci) * k + ky) * k + kx]; if (w === 0) continue;
        const ox0 = Math.max(0, Math.ceil((p - kx) / s)), ox1 = Math.min(Ho - 1, Math.floor((H - 1 + p - kx) / s));
        for (let oy = 0; oy < Ho; oy++) {
          const iy = oy * s - p + ky; if (iy < 0 || iy >= H) continue;
          const ri = ci * H * H + iy * H - p + kx, ro = o + oy * Ho;
          for (let ox = ox0; ox <= ox1; ox++) out[ro + ox] += w * x[ri + ox * s];
        }
      }
    }
    return [out, Ho];
  }
  function convBack(g, Ho, H, l) {             // gradient wrt the input of a conv
    const { cin, cout, k, s, p, W } = l, gi = new Float32Array(cin * H * H);
    for (let co = 0; co < cout; co++) {
      const o = co * Ho * Ho; let any = false;
      for (let i = 0; i < Ho * Ho; i++) if (g[o + i] !== 0) { any = true; break; }
      if (!any) continue;
      for (let ci = 0; ci < cin; ci++) for (let ky = 0; ky < k; ky++) for (let kx = 0; kx < k; kx++) {
        const w = W[((co * cin + ci) * k + ky) * k + kx]; if (w === 0) continue;
        const ox0 = Math.max(0, Math.ceil((p - kx) / s)), ox1 = Math.min(Ho - 1, Math.floor((H - 1 + p - kx) / s));
        for (let oy = 0; oy < Ho; oy++) {
          const iy = oy * s - p + ky; if (iy < 0 || iy >= H) continue;
          const ri = ci * H * H + iy * H - p + kx, ro = o + oy * Ho;
          for (let ox = ox0; ox <= ox1; ox++) gi[ri + ox * s] += w * g[ro + ox];
        }
      }
    }
    return gi;
  }
  function pool(x, C, H) {                     // 3x3 max, stride 2; remember the winners
    const Ho = Math.floor((H - 3) / 2) + 1, out = new Float32Array(C * Ho * Ho), arg = new Int32Array(C * Ho * Ho);
    for (let c = 0; c < C; c++) for (let y = 0; y < Ho; y++) for (let x0 = 0; x0 < Ho; x0++) {
      let m = -Infinity, a = 0;
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) { const i = c * H * H + (y * 2 + dy) * H + x0 * 2 + dx; if (x[i] > m) { m = x[i]; a = i; } }
      out[c * Ho * Ho + y * Ho + x0] = m; arg[c * Ho * Ho + y * Ho + x0] = a;
    }
    return [out, Ho, arg];
  }
  const relu = (x) => { for (let i = 0; i < x.length; i++) if (x[i] < 0) x[i] = 0; return x; };
  let tape = null;
  function forward(img) {                      // img: 3*224*224, already normalized
    tape = [];
    let x = img, H = 224;
    const outs = {};
    for (let li = 0; li < 5; li++) {
      if (li === 1 || li === 2) { const [y, Ho, arg] = pool(x, L[li - 1].cout, H); tape.push({ op: 'pool', H, Ho, arg, C: L[li - 1].cout }); x = y; H = Ho; }
      const [y, Ho] = conv(x, H, L[li]); relu(y);
      tape.push({ op: 'conv', li, H, Ho, act: y });
      outs['conv' + (li + 1)] = { data: y, C: L[li].cout, H: Ho };
      x = y; H = Ho;
    }
    return outs;
  }
  function guided(layer, ch, r, c) {           // which input pixels drive one unit, guided backprop
    const li = +layer.slice(4) - 1;
    let k = tape.findIndex((t) => t.op === 'conv' && t.li === li);
    const t0 = tape[k];
    let g = new Float32Array(t0.act.length); g[ch * t0.Ho * t0.Ho + r * t0.Ho + c] = 1;
    for (; k >= 0; k--) {
      const t = tape[k];
      if (t.op === 'conv') {
        for (let i = 0; i < g.length; i++) if (t.act[i] <= 0 || g[i] < 0) g[i] = 0;   // the guided ReLU
        g = convBack(g, t.Ho, t.H, L[t.li]);
      } else {
        const gi = new Float32Array(t.C * t.H * t.H);
        for (let i = 0; i < g.length; i++) if (g[i]) gi[t.arg[i]] += g[i];
        g = gi;
      }
    }
    return g;                                  // 3*224*224
  }
  return { setWeights, forward, guided };
}
if (typeof module !== 'undefined') module.exports = alexEngine;
if (typeof self !== 'undefined' && typeof window === 'undefined' && typeof module === 'undefined') {
  const E = alexEngine();
  self.onmessage = (e) => {
    const m = e.data;
    if (m.weights) { E.setWeights(m.weights); self.postMessage({ ready: true }); }
    else if (m.img) { const t = performance.now(); const o = E.forward(m.img); self.postMessage({ id: m.id, outs: o, ms: performance.now() - t }); }
    else if (m.guided) { const g = E.guided(...m.guided); self.postMessage({ id: m.id, grad: g }); }
  };
}
