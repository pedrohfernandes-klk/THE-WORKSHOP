// murals.js — Leo's wall paintings (docs/gallery/BRIEF.md §6.2).
// Original drawings in the manner of Renaissance notebooks and wall studies, painted procedurally
// once at build: iron-gall sepia and red chalk on aged plaster, edges that fade and flake into the
// wall they sit on. No readable words anywhere (the "mirror script" is loops and strokes only).
//   voo      hall, WEST outer wall (face x = -6.9)  — study of a flying machine: bat wings, gears, cords
//   homem    hall, EAST outer wall (face x = +6.9)  — a figure measured in a circle and a square,
//                                                     light on spheres, a flowering plant
//   paisagem ruins, south wall facing the forecourt (face z = -25.85) — sfumato landscape fresco, flaked
//   predela  amphitheatre backdrop under the screen (face x = -57)   — water, horses in motion, plants
// One mesh per mural (4 draw calls), textures drawn once, nothing per frame. Click → a caption.
export function build(ctx) {
  const { THREE } = ctx;
  const low = ctx.quality === 'low';
  const K = low ? 0.5 : 1;                         // canvases are authored in fixed units, scaled by K
  const group = new THREE.Group(); group.name = 'murals';
  const pickables = [];
  const caps = ctx.renderer && ctx.renderer.capabilities;
  const ANISO = Math.min(low ? 4 : 8, (caps && caps.getMaxAnisotropy && caps.getMaxAnisotropy()) || 4);
  const TAU = Math.PI * 2;
  const SEPIA = '60,37,20', BISTRE = '112,76,44', SANG = '158,66,40', CHALK = '252,246,230';
  const rgba = (c, a) => `rgba(${c},${a})`;

  // ---------------------------------------------------------------- drawing kit
  function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
  function noise(r) {
    const v = new Float32Array(512); for (let i = 0; i < 512; i++) v[i] = r();
    return (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return v[i & 511] * (1 - u) + v[(i + 1) & 511] * u; };
  }
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * K)); c.height = Math.max(1, Math.round(h * K));
    const g = c.getContext('2d'); g.scale(K, K); g.lineCap = 'round'; g.lineJoin = 'round';
    return { c, g };
  }
  const pen = (g, col, a, wd) => { g.strokeStyle = rgba(col, a); g.lineWidth = wd; };
  // the hand never draws a perfect line: every stroke is jittered a little
  function line(g, r, pts, j = 0.8) {
    g.beginPath();
    pts.forEach(([x, y], i) => { const X = x + (r() - 0.5) * j, Y = y + (r() - 0.5) * j; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
    g.stroke();
  }
  function curve(g, r, f, t0, t1, n, j = 0.6) {
    g.beginPath();
    for (let i = 0; i <= n; i++) { const [x, y] = f(t0 + (t1 - t0) * i / n); const X = x + (r() - 0.5) * j, Y = y + (r() - 0.5) * j; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
    g.stroke();
  }
  const arc = (g, r, cx, cy, R, a0, a1, j = 0.6) => curve(g, r, (t) => [cx + Math.cos(t) * R, cy + Math.sin(t) * R], a0, a1, Math.max(10, Math.ceil(Math.abs(a1 - a0) * R / 5)), j);
  const qb = (a, b, c, u) => { const v = 1 - u; return [v * v * a[0] + 2 * v * u * b[0] + u * u * c[0], v * v * a[1] + 2 * v * u * b[1] + u * u * c[1]]; };
  // smooth spline through points (Catmull-Rom as Béziers)
  function spline(pts, closed) {
    const p = new Path2D(), n = pts.length;
    const P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      p.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    if (closed) p.closePath();
    return p;
  }
  // left-handed hatching: "\" strokes, upper left to lower right, inside the current clip
  function hatch(g, r, x0, y0, x1, y1, sp, ang = Math.PI / 4) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + 2;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let o = -R; o <= R; o += sp * (0.75 + r() * 0.5)) {
      const px = cx - dy * o, py = cy + dx * o, L = R * (0.85 + r() * 0.3);
      g.beginPath(); g.moveTo(px - dx * L, py - dy * L); g.lineTo(px + dx * L + (r() - 0.5) * 2, py + dy * L + (r() - 0.5) * 2); g.stroke();
    }
  }
  function hatchIn(g, r, path, box, sp, col, a, wd, ang, extra) {
    g.save(); g.clip(path); if (extra) { g.beginPath(); extra(g); g.clip(); }
    pen(g, col, a, wd); hatch(g, r, box[0], box[1], box[2], box[3], sp, ang); g.restore();
  }
  // soft-edged fill (sfumato): only the blurred shadow of the shape lands on the canvas
  function softFill(g, pathFn, col, blur) {
    g.save(); g.shadowColor = col; g.shadowBlur = blur * K; g.shadowOffsetX = 6000 * K; g.translate(-6000, 0);
    g.fillStyle = '#000'; g.beginPath(); pathFn(g); g.fill(); g.restore();
  }
  // illegible mirror-written notes: right-justified rows of loops and hooks, ragged on the left
  function script(g, r, xr, y, w, rows, lh, col = SEPIA, a = 0.55) {
    pen(g, col, a, Math.max(0.8, lh * 0.075));
    for (let k = 0; k < rows; k++) {
      const yy = y + k * lh, end = xr - w * (k === rows - 1 ? 0.3 + r() * 0.4 : 0.82 + r() * 0.18);
      let x = xr - r() * lh * 0.5;
      while (x > end) {
        const n = 2 + (r() * 6 | 0);
        g.beginPath(); g.moveTo(x, yy);
        for (let i = 0; i < n && x > end; i++) {
          const lw = lh * (0.2 + r() * 0.22), t = r();
          if (t < 0.26) { const q = lw * 0.45; for (let s = 0; s <= 9; s++) { const an = s / 9 * TAU; g.lineTo(x - q + Math.cos(an) * q, yy - q - Math.sin(an) * q * 0.9); } }
          else if (t < 0.44) { g.lineTo(x - lw * 0.2, yy - lh * 0.62); g.lineTo(x - lw * 0.55, yy); }
          else if (t < 0.54) { g.lineTo(x - lw * 0.3, yy + lh * 0.34); g.lineTo(x - lw * 0.6, yy); }
          else g.quadraticCurveTo(x - lw * 0.5, yy - lh * (0.22 + r() * 0.16), x - lw, yy);
          x -= lw;
        }
        g.stroke();
        x -= lh * (0.3 + r() * 0.35);
      }
    }
  }
  function plaster(g, w, h, r, base) {
    g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) {
      const x = r() * w, y = r() * h, R = 20 + r() * 150, c = r() < 0.55 ? '128,98,64' : '255,250,236';
      const gr = g.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, rgba(c, 0.04 + r() * 0.07)); gr.addColorStop(1, rgba(c, 0));
      g.fillStyle = gr; g.fillRect(x - R, y - R, 2 * R, 2 * R);
    }
    const n = (w * h / 70) | 0;
    for (let i = 0; i < n; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(96,70,44,0.08)' : 'rgba(255,251,240,0.09)';
      const s = 0.7 + r() * 1.8; g.fillRect(r() * w, r() * h, s, s);
    }
  }
  function age(g, w, h, r, { damp = 0.2, streaks = 24, cracks = 6, foxing = 40 } = {}) {
    const d = g.createLinearGradient(0, h, 0, h * (1 - damp));
    d.addColorStop(0, 'rgba(96,74,48,0.38)'); d.addColorStop(1, 'rgba(96,74,48,0)');
    g.fillStyle = d; g.fillRect(0, h * (1 - damp), w, h * damp);
    for (let i = 0; i < streaks; i++) {
      const x = r() * w, len = h * (0.15 + r() * 0.6), wd = 2 + r() * 9, s = g.createLinearGradient(0, 0, 0, len);
      s.addColorStop(0, `rgba(84,64,42,${0.05 + r() * 0.08})`); s.addColorStop(1, 'rgba(84,64,42,0)');
      g.fillStyle = s; g.fillRect(x, 0, wd, len);
    }
    for (let i = 0; i < foxing; i++) {
      const x = r() * w, y = r() * h, R = 2 + r() * 9, f = g.createRadialGradient(x, y, 0, x, y, R);
      f.addColorStop(0, `rgba(122,82,42,${0.1 + r() * 0.16})`); f.addColorStop(1, 'rgba(122,82,42,0)');
      g.fillStyle = f; g.fillRect(x - R, y - R, 2 * R, 2 * R);
    }
    for (let i = 0; i < cracks; i++) {
      let x = r() * w, y = r() * h, a = r() * TAU;
      pen(g, '58,42,28', 0.25 + r() * 0.3, 0.6 + r() * 0.9);
      g.beginPath(); g.moveTo(x, y);
      const n = 12 + (r() * 30 | 0);
      for (let k = 0; k < n; k++) { a += (r() - 0.5) * 1.1; const s = 3 + r() * 9; x += Math.cos(a) * s; y += Math.sin(a) * s; g.lineTo(x, y); }
      g.stroke();
    }
  }
  // Alpha mask (an opaque canvas, white = plaster still on the wall): a soft irregular patch whose
  // edge breaks into chips, a few stray islands beyond it, optional losses inside and a cut() hook.
  function mask(w, h, r, { margin = 22, blur = 12, flakes = 70, inner = 0, islands = 14, cut } = {}) {
    const { c, g } = canvas(w, h);
    const n = noise(r);
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const N = 240, per = 2 * (w + h), pts = [];
    for (let i = 0; i < N; i++) {
      const s = per * i / N; let x, y, nx, ny;
      if (s < w) { x = s; y = 0; nx = 0; ny = 1; } else if (s < w + h) { x = w; y = s - w; nx = -1; ny = 0; }
      else if (s < 2 * w + h) { x = 2 * w + h - s; y = h; nx = 0; ny = -1; } else { x = 0; y = per - s; nx = 1; ny = 0; }
      const d = margin * (0.9 + 1.6 * n(i * 0.15) * n(i * 0.045 + 9) + 0.55 * n(i * 0.7 + 50));
      pts.push([x + nx * d, y + ny * d, nx, ny, d]);
    }
    softFill(g, (q) => { pts.forEach(([x, y], i) => (i ? q.lineTo(x, y) : q.moveTo(x, y))); q.closePath(); }, '#fff', blur);
    const chips = [];
    const chip = (x, y, s) => { const k = 5 + (r() * 5 | 0), a0 = r() * TAU, q = []; for (let i = 0; i < k; i++) { const a = a0 + i / k * TAU, e = s * (0.45 + r() * 0.75); q.push([x + Math.cos(a) * e, y + Math.sin(a) * e * (0.6 + r() * 0.5)]); } return q; };
    const poly = (q) => { g.beginPath(); q.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
    g.fillStyle = '#000';
    for (let i = 0; i < flakes; i++) {                   // chips bitten out of the edge
      const p = pts[(r() * N) | 0], dep = margin * (0.2 + Math.pow(r(), 2) * 2.4);
      const q = chip(p[0] + p[2] * dep, p[1] + p[3] * dep, 3 + r() * 14); chips.push(q); poly(q);
    }
    for (let i = 0; i < inner; i++) {                    // scattered losses
      const q = chip(margin * 3 + r() * (w - margin * 6), margin * 3 + r() * (h - margin * 6), 2 + Math.pow(r(), 3) * 30); chips.push(q); poly(q);
    }
    g.fillStyle = '#fff';
    for (let i = 0; i < islands; i++) {                  // plaster still clinging beyond the edge
      const p = pts[(r() * N) | 0], o = margin * (0.15 + r() * 0.3);
      poly(chip(p[0] - p[2] * o, p[1] - p[3] * o, 1.5 + r() * 3));
    }
    if (cut) { g.fillStyle = '#000'; cut(g, r); }
    return { c, chips };
  }
  // the darker broken rim round every chip of lost plaster
  function rims(g, chips) {
    g.fillStyle = 'rgba(70,52,34,0.34)';
    for (const q of chips) {
      let cx = 0, cy = 0; for (const p of q) { cx += p[0]; cy += p[1]; } cx /= q.length; cy /= q.length;
      g.beginPath(); q.forEach(([x, y], i) => { const X = cx + (x - cx) * 1.35, Y = cy + (y - cy) * 1.35; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }); g.closePath(); g.fill();
    }
  }
  // a long frieze is painted on a strip and folded into two rows of one texture (≤ 1024 × 512)
  function fold(src) {
    const c = document.createElement('canvas'); c.width = src.width / 2; c.height = src.height * 2;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0, c.width, src.height, 0, 0, c.width, src.height);
    g.drawImage(src, c.width, 0, c.width, src.height, 0, src.height, c.width, src.height);
    return c;
  }

  // ---------------------------------------------------------------- motifs
  function gear(g, r, cx, cy, R, n, rot) {
    const p = new Path2D(), ri = R * 0.84, tw = Math.PI / n;
    for (let i = 0; i < n; i++) {
      const a = rot + i * TAU / n;
      [[ri, a - tw * 0.55], [R, a - tw * 0.3], [R, a + tw * 0.3], [ri, a + tw * 0.55]].forEach(([e, b], k) => {
        const x = cx + Math.cos(b) * e, y = cy + Math.sin(b) * e; if (!i && !k) p.moveTo(x, y); else p.lineTo(x, y);
      });
    }
    p.closePath();
    g.fillStyle = rgba(BISTRE, 0.14); g.fill(p);
    hatchIn(g, r, p, [cx - R, cy - R, cx + R, cy + R], Math.max(2.4, R * 0.09), SEPIA, 0.4, 0.8, Math.PI / 4,
      (q) => { q.moveTo(cx - R * 1.2, cy + R * 1.2); q.lineTo(cx + R * 1.2, cy - R * 1.2); q.lineTo(cx + R * 1.2, cy + R * 1.2); q.closePath(); });
    pen(g, SEPIA, 0.85, Math.max(1, R * 0.045)); g.stroke(p);
    pen(g, SEPIA, 0.6, 1); arc(g, r, cx, cy, R * 0.64, 0, TAU, 0.4); arc(g, r, cx, cy, R * 0.2, 0, TAU, 0.3);
    const sp = R > 25 ? 6 : 4;
    for (let i = 0; i < sp; i++) { const a = rot + i * TAU / sp + 0.2; line(g, r, [[cx + Math.cos(a) * R * 0.2, cy + Math.sin(a) * R * 0.2], [cx + Math.cos(a) * R * 0.64, cy + Math.sin(a) * R * 0.64]], 0.4); }
    g.fillStyle = rgba(SEPIA, 0.7); g.beginPath(); g.arc(cx, cy, Math.max(1.5, R * 0.06), 0, TAU); g.fill();
  }
  // bat-like wing: spar (arm) from shoulder S to wrist W, finger ribs to the tips, scalloped membrane
  function wing(g, r, S, W, tips, B) {
    const mem = new Path2D(), all = [...tips, B];
    mem.moveTo(S[0], S[1]); mem.lineTo(W[0], W[1]); mem.lineTo(tips[0][0], tips[0][1]);
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1], b = all[i], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, k = i === all.length - 1 ? 0.22 : 0.3;
      mem.quadraticCurveTo(mx + (W[0] - mx) * k, my + (W[1] - my) * k, b[0], b[1]);
    }
    mem.closePath();
    const xs = [S, W, ...all].map((p) => p[0]), ys = [S, W, ...all].map((p) => p[1]);
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    g.fillStyle = rgba(BISTRE, 0.13); g.fill(mem);
    hatchIn(g, r, mem, box, 6.5, SEPIA, 0.24, 0.9);
    // membrane folds: faint lines from the shoulder fanning toward the trailing edge
    pen(g, SEPIA, 0.22, 0.8);
    for (let i = 0; i < all.length - 1; i++) { const a = all[i], b = all[i + 1]; const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; line(g, r, [W, [W[0] + (m[0] - W[0]) * 0.8, W[1] + (m[1] - W[1]) * 0.8]], 0.6); }
    for (const t of tips) {
      const mx = (W[0] + t[0]) / 2, my = (W[1] + t[1]) / 2, dx = t[0] - W[0], dy = t[1] - W[1], c = [mx - dy * 0.07, my + dx * 0.07];
      pen(g, SEPIA, 0.82, 2.1); curve(g, r, (u) => qb(W, c, t, u), 0, 1, 18, 0.5);
      pen(g, SEPIA, 0.4, 0.9); curve(g, r, (u) => { const p = qb(W, c, t, u); return [p[0] + 3, p[1] + 3]; }, 0.06, 0.94, 14, 0.5);
      for (let u = 0.25; u < 0.95; u += 0.22) { const p = qb(W, c, t, u); pen(g, SEPIA, 0.55, 1); line(g, r, [[p[0] - 3, p[1] - 2], [p[0] + 4, p[1] + 4]], 0.3); }
    }
    pen(g, SEPIA, 0.9, 2.8); line(g, r, [S, W], 0.6);
    pen(g, SEPIA, 0.5, 1.0); line(g, r, [[S[0], S[1] + 5], [W[0], W[1] + 5]], 0.6);
    pen(g, SEPIA, 0.55, 1.1); g.stroke(mem);
    for (const P of [S, W]) { pen(g, SEPIA, 0.85, 1.4); arc(g, r, P[0], P[1], 6, 0, TAU, 0.3); g.fillStyle = rgba(SEPIA, 0.6); g.beginPath(); g.arc(P[0], P[1], 2, 0, TAU); g.fill(); }
  }
  function bird(g, r, x, y, s, ph) {
    const up = ph * s * 0.55;
    g.beginPath(); g.moveTo(x - s, y - up); g.quadraticCurveTo(x - s * 0.45, y - s * 0.25 - up * 0.2, x, y);
    g.quadraticCurveTo(x + s * 0.45, y - s * 0.25 - up * 0.2, x + s, y - up); g.stroke();
  }
  function hinge(g, r, x, y) {
    const plate = (a) => {
      const dx = Math.cos(a), dy = Math.sin(a), nx = -dy * 10, ny = dx * 10, p = new Path2D();
      p.moveTo(x + nx, y + ny); p.lineTo(x + dx * 72 + nx * 0.6, y + dy * 72 + ny * 0.6); p.lineTo(x + dx * 72 - nx * 0.6, y + dy * 72 - ny * 0.6); p.lineTo(x - nx, y - ny); p.closePath();
      g.fillStyle = rgba(BISTRE, 0.15); g.fill(p);
      hatchIn(g, r, p, [x - 80, y - 80, x + 80, y + 80], 3.2, SEPIA, 0.35, 0.8);
      pen(g, SEPIA, 0.8, 1.5); g.stroke(p);
      for (const u of [30, 55]) { pen(g, SEPIA, 0.7, 1); arc(g, r, x + dx * u, y + dy * u, 3, 0, TAU, 0.2); }
    };
    plate(Math.PI + 0.3); plate(-0.55);
    pen(g, SEPIA, 0.85, 1.5); arc(g, r, x, y, 11, 0, TAU, 0.3);
    g.fillStyle = rgba(SEPIA, 0.7); g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill();
    pen(g, SANG, 0.6, 1.3); arc(g, r, x, y, 48, -1.25, -0.25, 0.5);
    const ex = x + Math.cos(-0.25) * 48, ey = y + Math.sin(-0.25) * 48;
    line(g, r, [[ex - 7, ey - 6], [ex, ey], [ex - 9, ey + 3]], 0.3);
  }
  function sphere(g, r, cx, cy, R, L, gy) {
    const dx = L[0] - cx, dy = L[1] - cy, d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
    if (gy) {
      const vx = -ux, vy = -uy, b = Math.asin(Math.min(0.95, R / d));
      let far = cx;
      for (const s of [-1, 1]) {
        const ca = Math.cos(s * b), sa = Math.sin(s * b), ex = vx * ca - vy * sa, ey = vx * sa + vy * ca;
        if (ey <= 0.05) continue;
        const t = (gy - L[1]) / ey, gx = L[0] + ex * t; far = Math.max(far, gx);
        pen(g, SANG, 0.3, 0.9); line(g, r, [L, [gx, gy]], 0.6);
      }
      const sx = (cx + far) / 2 + R * 0.1, rx = (far - cx) / 2 + R * 0.25, ry = R * 0.16;
      const sh = new Path2D(); sh.ellipse(sx, gy, rx, ry, 0, 0, TAU);
      const gr = g.createRadialGradient(cx + R * 0.2, gy, 1, sx, gy, rx);
      gr.addColorStop(0, rgba(SEPIA, 0.5)); gr.addColorStop(1, rgba(SEPIA, 0.05));
      g.fillStyle = gr; g.fill(sh);
      hatchIn(g, r, sh, [sx - rx, gy - ry, sx + rx, gy + ry], 2.6, SEPIA, 0.4, 0.8);
      pen(g, SEPIA, 0.45, 1); line(g, r, [[cx - R * 1.6, gy], [far + R * 0.8, gy]], 0.8);
    }
    const body = new Path2D(); body.arc(cx, cy, R, 0, TAU);
    const gr = g.createRadialGradient(cx + ux * R * 0.42, cy + uy * R * 0.42, R * 0.04, cx + ux * R * 0.08, cy + uy * R * 0.08, R * 1.06);
    gr.addColorStop(0, rgba(CHALK, 0.8)); gr.addColorStop(0.2, rgba(CHALK, 0.25)); gr.addColorStop(0.5, rgba(BISTRE, 0.22));
    gr.addColorStop(0.8, rgba(SEPIA, 0.55)); gr.addColorStop(0.92, rgba(SEPIA, 0.36)); gr.addColorStop(1, rgba(BISTRE, 0.3));
    g.fillStyle = gr; g.fill(body);
    const px = -uy, py = ux, ox = cx + ux * R * 0.05, oy = cy + uy * R * 0.05;
    const half = (q) => { q.moveTo(ox + px * 2 * R, oy + py * 2 * R); q.lineTo(ox - px * 2 * R, oy - py * 2 * R); q.lineTo(ox - px * 2 * R - ux * 3 * R, oy - py * 2 * R - uy * 3 * R); q.lineTo(ox + px * 2 * R - ux * 3 * R, oy + py * 2 * R - uy * 3 * R); q.closePath(); };
    hatchIn(g, r, body, [cx - R, cy - R, cx + R, cy + R], Math.max(2.4, R * 0.07), SEPIA, 0.32, 0.9, Math.PI / 4, half);
    hatchIn(g, r, body, [cx - R, cy - R, cx + R, cy + R], Math.max(3, R * 0.1), SEPIA, 0.2, 0.8, Math.PI / 4 + 0.55, half);
    const a = Math.atan2(uy, ux);
    pen(g, SEPIA, 0.82, Math.max(1, R * 0.028)); arc(g, r, cx, cy, R, a + 0.7, a + TAU - 0.7, 0.5);
    pen(g, SEPIA, 0.3, 0.8); arc(g, r, cx, cy, R, a - 0.7, a + 0.7, 0.5);
  }
  function leaf(g, r, x, y, a, L, wd, col = SEPIA) {
    const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx, tx = x + dx * L, ty = y + dy * L, mx = x + dx * L * 0.45, my = y + dy * L * 0.45;
    const p = new Path2D(); p.moveTo(x, y); p.quadraticCurveTo(mx + nx * wd, my + ny * wd, tx, ty); p.quadraticCurveTo(mx - nx * wd, my - ny * wd, x, y);
    g.fillStyle = rgba(BISTRE, 0.12); g.fill(p);
    hatchIn(g, r, p, [Math.min(x, tx) - wd, Math.min(y, ty) - wd, Math.max(x, tx) + wd, Math.max(y, ty) + wd], 2.6, col, 0.3, 0.7, Math.PI / 4,
      (q) => { q.moveTo(x, y); q.lineTo(tx, ty); q.lineTo(tx - nx * wd * 2, ty - ny * wd * 2); q.lineTo(x - nx * wd * 2, y - ny * wd * 2); q.closePath(); });
    pen(g, col, 0.75, 1.1); g.stroke(p);
    pen(g, col, 0.45, 0.7); line(g, r, [[x, y], [mx, my], [tx, ty]], 0.4);
  }
  // a flowering stem: alternate leaves and a six-petalled star at the top
  function stem(g, r, x0, y0, x1, y1, bend, s = 1, col = SEPIA) {
    const c = [(x0 + x1) / 2 + bend, (y0 + y1) / 2], f = (u) => qb([x0, y0], c, [x1, y1], u);
    pen(g, col, 0.8, 1.5 * s); curve(g, r, f, 0, 1, 30, 0.5);
    pen(g, col, 0.35, 0.8); curve(g, r, (u) => { const p = f(u); return [p[0] + 2, p[1]]; }, 0, 0.95, 24, 0.5);
    for (let u = 0.12, k = 0; u < 0.86; u += 0.085, k++) {
      const [px, py] = f(u), [qx, qy] = f(u + 0.01), ta = Math.atan2(qy - py, qx - px), side = k % 2 ? 1 : -1;
      leaf(g, r, px, py, ta + side * (0.75 + r() * 0.3), (34 + r() * 22) * s * (1 - u * 0.5), (7 + r() * 3) * s, col);
    }
    const [hx, hy] = f(1);
    for (let i = 0; i < 6; i++) leaf(g, r, hx, hy, i / 6 * TAU + 0.3, 17 * s, 5 * s, col);
    g.fillStyle = rgba(col, 0.6); g.beginPath(); g.arc(hx, hy, 3 * s, 0, TAU); g.fill();
    const [bx, by] = f(0.9); pen(g, col, 0.7, 1); line(g, r, [[bx, by], [bx + 16 * s, by - 14 * s]], 0.4);
    g.fillStyle = rgba(BISTRE, 0.25); g.beginPath(); g.ellipse(bx + 18 * s, by - 16 * s, 4 * s, 6 * s, 0.7, 0, TAU); g.fill(); g.stroke();
  }
  function rosette(g, r, cx, cy, R) {
    const GA = Math.PI * (3 - Math.sqrt(5));
    for (let i = 21; i >= 1; i--) {
      const a = i * GA, L = R * (0.25 + 0.75 * i / 21);
      leaf(g, r, cx, cy, a, L, L * 0.2);
    }
    g.fillStyle = rgba(SEPIA, 0.5); g.beginPath(); g.arc(cx, cy, 3, 0, TAU); g.fill();
  }
  // water: a pier in a current, its wake of curling vortices, and a jet falling into a pool
  function vortex(g, r, cx, cy, R, dir, strands = 4) {
    for (let s = 0; s < strands; s++) {
      const off = s * 2.2, turns = 2.4 + r() * 0.8, ph = r() * TAU;
      pen(g, SEPIA, 0.6 - s * 0.1, 1.1);
      curve(g, r, (t) => { const rho = (R - off) * (1 - t / (turns * TAU)) + 1.5; return [cx + Math.cos(ph + dir * t) * rho, cy + Math.sin(ph + dir * t) * rho * 0.82]; }, 0, turns * TAU * 0.96, 80, 0.4);
    }
  }
  function water(g, r, x0, x1, y0, y1) {
    const cy = (y0 + y1) / 2, px = x0 + 100;
    g.fillStyle = rgba(BISTRE, 0.3); g.fillRect(px - 8, cy - 26, 16, 52);
    pen(g, SEPIA, 0.8, 1.5); line(g, r, [[px - 8, cy - 26], [px + 8, cy - 26], [px + 8, cy + 26], [px - 8, cy + 26], [px - 8, cy - 26]], 0.6);
    for (let k = 0; k < 9; k++) {
      const yk = y0 + 14 + k * (y1 - y0 - 28) / 8, side = yk < cy ? -1 : 1, near = Math.exp(-Math.pow((yk - cy) / 34, 2));
      pen(g, SEPIA, 0.45, 1);
      curve(g, r, (x) => { const b = Math.exp(-Math.pow((x - px) / 26, 2)) * 30 * near * side, after = x > px ? Math.sin(x * 0.07 + k) * 3 * near : 0; return [x, yk + b + after]; }, x0 + 6, x0 + 300, 70, 0.6);
    }
    for (let i = 0; i < 5; i++) vortex(g, r, px + 34 + i * 38, cy + (i % 2 ? 19 : -19), 11 + i * 2.6, i % 2 ? 1 : -1);
    const jx = x1 - 85, sy = cy + 32;
    for (let s = -3; s <= 3; s++) { pen(g, SEPIA, 0.55, 1); curve(g, r, (t) => [jx + s * 3.2 + Math.sin(t * 9 + s) * 1.2 + t * t * 8, y0 + 6 + t * (sy - y0 - 6)], 0, 1, 30, 0.4); }
    for (const dir of [-1, 1]) for (let i = 0; i < 2; i++) vortex(g, r, jx + dir * (20 + i * 30), sy + 10 + i * 12, 13 - i * 2, -dir, 3);
    pen(g, SEPIA, 0.5, 1); curve(g, r, (x) => [x, sy + Math.sin(x * 0.2) * 2], x1 - 175, x1 - 8, 60, 0.5);
    for (let i = 0; i < 26; i++) { pen(g, SEPIA, 0.5, 0.8); const bx = jx + (r() - 0.5) * 90, by = sy + 6 + r() * (y1 - sy - 12); arc(g, r, bx, by, 1 + r() * 3, 0, TAU, 0.2); }
  }
  // horse in profile, facing right; legs posed per gait, construction circles in red chalk
  const HORSE = [[0, 0.78], [0.1, 0.96], [0.3, 0.95], [0.52, 0.93], [0.7, 1.0], [0.84, 1.12], [0.95, 1.26], [1.01, 1.35], [1.07, 1.31], [1.2, 1.07], [1.25, 0.99], [1.21, 0.95],
    [1.1, 0.99], [1.03, 1.08], [0.98, 1.12], [0.92, 0.98], [0.87, 0.84], [0.85, 0.7], [0.79, 0.58], [0.6, 0.55], [0.4, 0.56], [0.26, 0.6], [0.18, 0.63], [0.05, 0.67]];
  const GAITS = {
    trot: { lift: 0, legs: [
      { at: [0.76, 0.62], seg: [[0.29, -10], [0.24, -8], [0.1, 32]], far: true },
      { at: [0.15, 0.68], seg: [[0.27, 22], [0.27, 30], [0.1, 20]], far: true },
      { at: [0.8, 0.62], seg: [[0.29, 42], [0.23, -42], [0.1, -40]], far: false },
      { at: [0.19, 0.68], seg: [[0.27, -30], [0.28, -12], [0.1, 26]], far: false }] },
    gallop: { lift: 0.07, legs: [
      { at: [0.76, 0.62], seg: [[0.29, 22], [0.23, -64], [0.1, -88]], far: true },
      { at: [0.15, 0.68], seg: [[0.27, -10], [0.27, 18], [0.1, 34]], far: true },
      { at: [0.8, 0.62], seg: [[0.29, 54], [0.24, 30], [0.1, 40]], far: false },
      { at: [0.19, 0.68], seg: [[0.27, 12], [0.28, 36], [0.1, 46]], far: false }] },
  };
  function horse(g, r, ox, gy, s, gait) {
    const G = GAITS[gait];
    const chains = G.legs.map((L) => {
      const pts = [L.at.slice()];
      for (const [len, deg] of L.seg) { const a = deg * Math.PI / 180, p = pts[pts.length - 1]; pts.push([p[0] + Math.sin(a) * len, p[1] - Math.cos(a) * len]); }
      return { pts, far: L.far };
    });
    let minY = Infinity; for (const c of chains) minY = Math.min(minY, c.pts[c.pts.length - 1][1]);
    const dy = G.lift - minY;                            // the lowest hoof meets the ground (or floats)
    const P = ([x, y]) => [ox + x * s, gy - (y + dy) * s];
    pen(g, SANG, 0.28, 1);
    arc(g, r, ...P([0.7, 0.8]), 0.21 * s, 0, TAU, 0.8); arc(g, r, ...P([0.16, 0.8]), 0.19 * s, 0, TAU, 0.8); arc(g, r, ...P([1.1, 1.15]), 0.12 * s, 0, TAU, 0.6);
    line(g, r, [P([-0.1, 0.8]), P([1.25, 1.18])], 0.8);
    pen(g, SEPIA, 0.4, 1); line(g, r, [[ox - 0.45 * s, gy], [ox + 1.5 * s, gy]], 0.8);
    for (let i = 0; i < 14; i++) { const x = ox - 0.4 * s + r() * 1.85 * s; line(g, r, [[x, gy], [x + 2 + r() * 3, gy - 3 - r() * 5]], 0.3); }
    const limb = (c) => {
      const W = [0.075, 0.05, 0.04, 0.036], A = [], B = [];
      c.pts.forEach((p, i) => {
        const a = c.pts[Math.max(0, i - 1)], b = c.pts[Math.min(c.pts.length - 1, i + 1)];
        let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        A.push(P([p[0] - ty * W[i] / 2, p[1] + tx * W[i] / 2])); B.unshift(P([p[0] + ty * W[i] / 2, p[1] - tx * W[i] / 2]));
      });
      const path = spline([...A, ...B], true);
      g.fillStyle = rgba(BISTRE, c.far ? 0.3 : 0.12); g.fill(path);
      if (c.far) hatchIn(g, r, path, [ox - 0.6 * s, gy - 1.5 * s, ox + 1.6 * s, gy + 0.1 * s], 2.6, SEPIA, 0.35, 0.8);
      pen(g, SEPIA, c.far ? 0.6 : 0.85, 1.3); g.stroke(path);
      const h0 = c.pts[c.pts.length - 1], [hx, hy] = P(h0);
      g.fillStyle = rgba(SEPIA, 0.55); g.beginPath(); g.ellipse(hx, hy, 0.03 * s, 0.022 * s, 0, 0, TAU); g.fill();
      for (let i = 1; i < c.pts.length - 1; i++) { const [jx, jy] = P(c.pts[i]); pen(g, SEPIA, 0.5, 0.9); arc(g, r, jx, jy, 0.022 * s, 0, TAU, 0.2); }
    };
    for (const c of chains) if (c.far) limb(c);
    // tail streaming back
    for (let i = 0; i < 7; i++) { pen(g, SEPIA, 0.55, 1); const e = [-0.26 - r() * 0.12, 0.62 + r() * 0.2 - (gait === 'trot' ? 0.12 : 0)]; curve(g, r, (u) => P(qb([0.04, 0.9], [-0.16, 0.95 + i * 0.01], e, u)), 0, 1, 16, 0.5); }
    const body = spline(HORSE.map(P), true);
    g.fillStyle = rgba(BISTRE, 0.1); g.fill(body);
    hatchIn(g, r, body, [ox - 0.1 * s, gy - 1.4 * s, ox + 1.3 * s, gy], 3, SEPIA, 0.34, 0.85, Math.PI / 4, (q) => { const [ax, ay] = P([0, 0.72]); q.rect(ax - s, ay, 3 * s, s); });
    hatchIn(g, r, body, [ox - 0.1 * s, gy - 1.4 * s, ox + 1.3 * s, gy], 3.2, SEPIA, 0.3, 0.8, Math.PI / 4, (q) => { const [ax, ay] = P([0.86, 1.15]); q.rect(ax, ay, 0.2 * s, 0.4 * s); });
    pen(g, SEPIA, 0.88, 1.7); g.stroke(body);
    g.save(); g.translate(1.6, 1.1); pen(g, SEPIA, 0.22, 1); g.stroke(body); g.restore();     // pentimento
    for (const c of chains) if (!c.far) limb(c);
    pen(g, SEPIA, 0.85, 1.3); line(g, r, [P([1.0, 1.33]), P([0.99, 1.45]), P([1.05, 1.35])], 0.3);
    arc(g, r, ...P([1.08, 1.2]), 0.018 * s, 0, TAU, 0.2);
    g.fillStyle = rgba(SEPIA, 0.6); const [nx, ny] = P([1.22, 1.0]); g.beginPath(); g.arc(nx, ny, 0.012 * s, 0, TAU); g.fill();
    for (let i = 0; i < 16; i++) { const u = i / 15, p = [0.72 + u * 0.27, 1.02 + u * 0.31]; pen(g, SEPIA, 0.6, 1); line(g, r, [P(p), P([p[0] - 0.07 - r() * 0.04, p[1] - 0.05 - r() * 0.05])], 0.4); }
  }

  // ---------------------------------------------------------------- the four paintings
  function paintVoo(g, w, h, r) {
    plaster(g, w, h, r, '229,216,190');
    pen(g, SANG, 0.22, 1.1);                             // compass and rule, faint red chalk
    line(g, r, [[70, 268], [770, 268]], 1.5); line(g, r, [[400, 52], [400, 470]], 1.5);
    arc(g, r, 352, 246, 268, Math.PI * 0.82, Math.PI * 1.32, 1); arc(g, r, 448, 246, 268, -Math.PI * 0.42, Math.PI * 0.1, 1);
    arc(g, r, 400, 340, 72, 0, TAU, 1);
    wing(g, r, [352, 246], [214, 206], [[92, 226], [104, 296], [146, 340], [210, 356]], [338, 292]);     // end of the down-stroke
    wing(g, r, [448, 246], [596, 128], [[716, 104], [736, 178], [706, 240], [646, 282]], [462, 290]);    // raised
    const hull = new Path2D(); hull.moveTo(318, 290); hull.quadraticCurveTo(400, 262, 486, 288); hull.quadraticCurveTo(404, 322, 318, 290); hull.closePath();
    g.fillStyle = rgba(BISTRE, 0.16); g.fill(hull);
    hatchIn(g, r, hull, [318, 262, 486, 322], 4, SEPIA, 0.4, 0.9);
    pen(g, SEPIA, 0.85, 1.8); g.stroke(hull);
    for (let i = 1; i < 8; i++) { const x = 318 + i * 21, s = Math.sin(i / 8 * Math.PI); pen(g, SEPIA, 0.5, 1); line(g, r, [[x, 281 - s * 6], [x + 2, 299 + s * 6]], 0.5); }
    pen(g, SEPIA, 0.85, 2.2); line(g, r, [[400, 284], [400, 140]], 0.6);
    pen(g, SEPIA, 0.7, 1.4); line(g, r, [[372, 146], [428, 146]], 0.5);
    for (const [x, y] of [[372, 146], [428, 146]]) arc(g, r, x, y, 5, 0, TAU, 0.3);
    pen(g, SEPIA, 0.45, 0.8);
    line(g, r, [[372, 146], [214, 206]], 0.4); line(g, r, [[428, 146], [596, 128]], 0.4);
    line(g, r, [[372, 150], [352, 246]], 0.4); line(g, r, [[428, 150], [448, 246]], 0.4);
    gear(g, r, 400, 342, 34, 16, 0.1);                   // crank → pinion → great wheel → rods to the wing levers
    gear(g, r, 444, 330, 15, 7, 0.3);
    pen(g, SEPIA, 0.85, 2); line(g, r, [[444, 330], [474, 356], [490, 350]], 0.5);
    pen(g, SEPIA, 0.7, 1.4); line(g, r, [[386, 324], [352, 252]], 0.5); line(g, r, [[414, 324], [448, 252]], 0.5);
    // the same wheels again, larger, and the wrist hinge opened up
    gear(g, r, 846, 150, 64, 22, 0.05);
    gear(g, r, 925, 150, 22, 9, 0.12);
    pen(g, SANG, 0.3, 1); arc(g, r, 846, 150, 82, 0, TAU, 1); line(g, r, [[756, 150], [966, 150]], 1);
    hinge(g, r, 880, 392);
    pen(g, SANG, 0.6, 1.4);
    for (let i = 0; i < 6; i++) bird(g, r, 86 + i * 44, 74 + Math.sin(i * 1.3) * 12, 11 + i * 1.6, Math.cos(i * 1.15));
    script(g, r, 1000, 262, 232, 5, 15);
    script(g, r, 330, 418, 262, 4, 16);
    script(g, r, 812, 372, 168, 5, 15);
    script(g, r, 700, 56, 170, 3, 14);
    age(g, w, h, r, { damp: 0.18, streaks: 26, cracks: 5, foxing: 50 });
  }
  function figure(g, r, cx, top, S) {
    const P = (x, y) => [cx + x * S, top + y * S], M = (pts) => pts.map(([x, y]) => P(x, y)), mir = (pts) => pts.map(([x, y]) => [-x, y]);
    const armL = [[-0.11, 0.163], [-0.3, 0.168], [-0.44, 0.171], [-0.5, 0.175], [-0.5, 0.182], [-0.44, 0.19], [-0.3, 0.2], [-0.125, 0.226]];
    const legL = [[-0.105, 0.5], [-0.076, 0.74], [-0.073, 0.82], [-0.05, 0.955], [-0.088, 0.997], [-0.022, 1.0], [-0.025, 0.955], [-0.03, 0.84], [-0.032, 0.74], [-0.02, 0.6], [-0.004, 0.515]];
    const torso = [[-0.135, 0.178], [-0.12, 0.22], [-0.125, 0.27], [-0.095, 0.36], [-0.11, 0.45], [-0.1, 0.52], [0, 0.505], [0.1, 0.52], [0.11, 0.45], [0.095, 0.36], [0.125, 0.27], [0.12, 0.22], [0.135, 0.178], [0.026, 0.158], [-0.026, 0.158]];
    const parts = [[legL, 0.03], [mir(legL), 0.09], [torso, 0.035], [armL, null], [mir(armL), null]];
    for (const [pts, shadeX] of parts) {
      const path = spline(M(pts), true);
      g.fillStyle = rgba(BISTRE, 0.1); g.fill(path);
      const box = [cx - 0.55 * S, top, cx + 0.55 * S, top + S];
      if (shadeX != null) hatchIn(g, r, path, box, 3.2, SEPIA, 0.36, 0.85, Math.PI / 4, (q) => q.rect(cx + shadeX * S - (shadeX < 0.05 ? 0 : 0), top, S, S));
      else hatchIn(g, r, path, box, 3, SEPIA, 0.3, 0.8, Math.PI / 4, (q) => q.rect(cx - S, top + 0.185 * S, 2 * S, S));
      pen(g, SEPIA, 0.85, 1.6); g.stroke(path);
      g.save(); g.translate(1.5, 1); pen(g, SEPIA, 0.22, 1); g.stroke(path); g.restore();
    }
    const head = new Path2D(); head.ellipse(cx, top + 0.064 * S, 0.046 * S, 0.062 * S, 0, 0, TAU);
    g.fillStyle = rgba(BISTRE, 0.1); g.fill(head);
    hatchIn(g, r, head, [cx - 0.05 * S, top, cx + 0.05 * S, top + 0.13 * S], 2.4, SEPIA, 0.35, 0.8, Math.PI / 4, (q) => q.rect(cx + 0.012 * S, top, S, S));
    pen(g, SEPIA, 0.85, 1.5); g.stroke(head);
    pen(g, SEPIA, 0.8, 1.2); line(g, r, [P(-0.022, 0.12), P(-0.026, 0.16)], 0.3); line(g, r, [P(0.022, 0.12), P(0.026, 0.16)], 0.3);
    pen(g, SEPIA, 0.6, 1);
    for (let i = 0; i < 16; i++) { const a = Math.PI * (1.05 + i / 15 * 0.9), x = cx + Math.cos(a) * 0.046 * S, y = top + 0.064 * S + Math.sin(a) * 0.062 * S; arc(g, r, x, y, 0.009 * S, a, a + 4, 0.3); }
    line(g, r, [P(-0.024, 0.058), P(-0.01, 0.058)], 0.3); line(g, r, [P(0.01, 0.058), P(0.024, 0.058)], 0.3);
    line(g, r, [P(0, 0.06), P(0.004, 0.085), P(-0.004, 0.088)], 0.3); line(g, r, [P(-0.012, 0.102), P(0.012, 0.102)], 0.3);
    pen(g, SEPIA, 0.55, 1);
    curve(g, r, (u) => P(-0.1 + u * 0.1, 0.24 + Math.sin(u * Math.PI) * 0.018), 0, 1, 12, 0.3);
    curve(g, r, (u) => P(u * 0.1, 0.24 + Math.sin(u * Math.PI) * 0.018), 0, 1, 12, 0.3);
    line(g, r, [P(0, 0.27), P(0, 0.4)], 0.4); arc(g, r, ...P(0, 0.4), 0.006 * S, 0, TAU, 0.2);
    curve(g, r, (u) => P(-0.09 + u * 0.08, 0.44 + u * 0.06), 0, 1, 8, 0.3); curve(g, r, (u) => P(0.09 - u * 0.08, 0.44 + u * 0.06), 0, 1, 8, 0.3);
    for (const s of [-1, 1]) arc(g, r, ...P(s * 0.053, 0.745), 0.014 * S, 0, TAU, 0.3);
    pen(g, SANG, 0.55, 1);
    for (const s of [-1, 1]) for (const [x, y] of [[0.135, 0.19], [0.3, 0.184], [0.44, 0.18], [0.075, 0.48], [0.053, 0.74], [0.04, 0.955]]) arc(g, r, ...P(s * x, y), 0.011 * S, 0, TAU, 0.2);
  }
  function paintHomem(g, w, h, r) {
    plaster(g, w, h, r, '230,218,194');
    const S = 330, X0 = 110, Y0 = 96, cx = X0 + S / 2, foot = Y0 + S, nav = [cx, Y0 + S * 0.4], RC = S * 0.6;
    pen(g, SANG, 0.2, 1);
    for (let i = 1; i < 8; i++) line(g, r, [[X0 - 8, Y0 + i * S / 8], [X0 + S + 8, Y0 + i * S / 8]], 1);
    line(g, r, [[X0, Y0], [X0 + S, foot]], 1); line(g, r, [[X0 + S, Y0], [X0, foot]], 1);
    for (const [x, y] of [[X0, Y0], [X0 + S, Y0], [X0, foot], [X0 + S, foot]]) arc(g, r, x, y, 26, 0, TAU, 0.6);
    pen(g, SEPIA, 0.75, 1.8); line(g, r, [[X0, Y0], [X0 + S, Y0], [X0 + S, foot], [X0, foot], [X0, Y0]], 1);
    pen(g, SANG, 0.65, 1.7); arc(g, r, nav[0], nav[1], RC, 0, TAU, 1.2);
    pen(g, SEPIA, 0.32, 1); arc(g, r, nav[0], nav[1], RC + 3, 0.3, 2.7, 1);
    for (let i = 0; i <= 8; i++) { pen(g, SEPIA, 0.6, 1); line(g, r, [[X0 - 11, Y0 + i * S / 8], [X0, Y0 + i * S / 8]], 0.4); }
    for (let i = 0; i < 8; i++) { g.fillStyle = rgba(SEPIA, i % 2 ? 0.08 : 0.45); g.fillRect(X0 + i * S / 8, foot + 16, S / 8, 7); }
    pen(g, SEPIA, 0.6, 1); line(g, r, [[X0, foot + 16], [X0 + S, foot + 16], [X0 + S, foot + 23], [X0, foot + 23], [X0, foot + 16]], 0.4);
    figure(g, r, cx, Y0, S);
    // light on spheres: one lamp, a ball on the ground with its rays and cast shadow, two studies of the turning edge
    const L = [548, 92];
    pen(g, SEPIA, 0.75, 1.2); arc(g, r, L[0], L[1], 9, 0, TAU, 0.3);
    pen(g, SANG, 0.45, 1); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; line(g, r, [[L[0] + Math.cos(a) * 13, L[1] + Math.sin(a) * 13], [L[0] + Math.cos(a) * 22, L[1] + Math.sin(a) * 22]], 0.3); }
    sphere(g, r, 640, 300, 62, L, 362);
    sphere(g, r, 752, 168, 30, L);
    sphere(g, r, 752, 268, 20, L);
    for (let i = 0; i < 6; i++) { g.fillStyle = rgba(SEPIA, 0.05 + i * 0.12); g.fillRect(566 + i * 30, 398, 26, 16); pen(g, SEPIA, 0.5, 0.8); line(g, r, [[566 + i * 30, 398], [592 + i * 30, 398], [592 + i * 30, 414], [566 + i * 30, 414], [566 + i * 30, 398]], 0.3); }
    stem(g, r, 870, 470, 905, 128, -40, 1.1);
    stem(g, r, 900, 470, 960, 250, 24, 0.7);
    rosette(g, r, 952, 418, 42);
    script(g, r, 1000, 64, 190, 4, 15);
    script(g, r, 790, 442, 220, 2, 15);
    script(g, r, 520, 42, 60, 2, 12);
    age(g, w, h, r, { damp: 0.18, streaks: 26, cracks: 5, foxing: 50 });
  }
  // the ruin fresco: panel world bounds (south wall of the ruins, east of the entrance gap)
  const PAI = { x0: -47.4, x1: -43.8, y0: 0.32, y1: 2.88 };
  function paintPaisagem(g, w, h, r) {
    const n = noise(r);
    plaster(g, w, h, r, '214,198,168');
    const B = 34, x0 = B, y0 = B, x1 = w - B, y1 = h - B, hz = y0 + (y1 - y0) * 0.56;
    const sky = g.createLinearGradient(0, y0, 0, hz);
    sky.addColorStop(0, 'rgb(112,142,168)'); sky.addColorStop(0.6, 'rgb(172,188,196)'); sky.addColorStop(1, 'rgb(224,216,192)');
    g.fillStyle = sky; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    for (let i = 0; i < 9; i++) { const cx = x0 + r() * (x1 - x0), cy = y0 + 26 + r() * 90, rx = 50 + r() * 110, ry = 8 + r() * 14; softFill(g, (q) => q.ellipse(cx, cy, rx, ry, 0, 0, TAU), 'rgba(242,236,220,0.45)', 16); }
    const ridge = (base, amp, f, ph, bottom) => (q) => {
      q.moveTo(x0 - 40, bottom);
      for (let x = x0 - 40; x <= x1 + 40; x += 4) { const t = x * f + ph, v = n(t) * 0.62 + n(t * 2.3 + 31) * 0.28 + n(t * 5.1 + 77) * 0.1; q.lineTo(x, base - amp * Math.pow(v, 1.5) * 1.6); }
      q.lineTo(x1 + 40, bottom); q.closePath();
    };
    const haze = (top, bot, a) => { const gr = g.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, 'rgba(222,216,196,0)'); gr.addColorStop(1, `rgba(222,216,196,${a})`); g.fillStyle = gr; g.fillRect(x0, top, x1 - x0, bot - top); };
    softFill(g, ridge(hz - 62, 64, 0.011, 3, hz + 30), 'rgb(170,186,200)', 10); haze(hz - 90, hz + 4, 0.6);
    softFill(g, ridge(hz - 32, 50, 0.016, 41, hz + 30), 'rgb(138,160,180)', 7); haze(hz - 50, hz + 6, 0.55);
    softFill(g, ridge(hz - 8, 34, 0.024, 87, hz + 30), 'rgb(110,132,150)', 5); haze(hz - 22, hz + 8, 0.5);
    softFill(g, ridge(hz + 16, 22, 0.03, 133, y1 + 20), 'rgb(126,128,84)', 4);
    softFill(g, ridge(hz + 14, 16, 0.03, 133, hz + 24), 'rgba(170,158,100,0.6)', 5);
    // a river winding out of the distance toward us, holding the sky
    const riv = (u) => [x0 + (x1 - x0) * (0.6 - 0.28 * u + 0.12 * Math.sin(u * 7.5)), hz + 14 + u * (y1 - hz - 4)];
    softFill(g, (q) => {
      for (let i = 0; i <= 40; i++) { const u = i / 40, [x, y] = riv(u), wd = 2 + u * u * 56; if (i) q.lineTo(x - wd, y); else q.moveTo(x - wd, y); }
      for (let i = 40; i >= 0; i--) { const u = i / 40, [x, y] = riv(u), wd = 2 + u * u * 56; q.lineTo(x + wd, y); }
      q.closePath();
    }, 'rgb(186,198,200)', 3);
    softFill(g, ridge(hz + 96, 42, 0.02, 201, y1 + 20), 'rgb(92,82,54)', 3);
    const fg = g.createLinearGradient(0, hz + 60, 0, y1); fg.addColorStop(0, 'rgba(70,58,38,0)'); fg.addColorStop(1, 'rgba(60,48,30,0.7)');
    g.fillStyle = fg; g.fillRect(x0, hz + 60, x1 - x0, y1 - hz - 60);
    for (let i = 0; i < 7; i++) {                        // rocks, lit from the upper left
      const rx = x0 + 20 + r() * (x1 - x0 - 40), ry = y1 - 12 - r() * 60, s = 10 + r() * 22;
      softFill(g, (q) => { q.moveTo(rx - s, ry); q.lineTo(rx - s * 0.5, ry - s * 0.8); q.lineTo(rx + s * 0.4, ry - s * 0.6); q.lineTo(rx + s, ry); q.closePath(); }, 'rgb(74,62,44)', 2);
      softFill(g, (q) => { q.moveTo(rx - s * 0.8, ry - s * 0.2); q.lineTo(rx - s * 0.5, ry - s * 0.75); q.lineTo(rx + s * 0.1, ry - s * 0.62); q.closePath(); }, 'rgba(160,140,104,0.7)', 2);
    }
    const tree = (tx, ty, H, Wd, flat) => {
      pen(g, '52,40,26', 0.85, 2.4); line(g, r, [[tx, ty], [tx + 2, ty - H * (flat ? 0.75 : 0.35)]], 0.6);
      for (let i = 0; i < 70; i++) {
        const u = r(), v = r() - 0.5, x = tx + v * Wd * (flat ? 1 : 1 - u * 0.6), y = ty - H * (flat ? 0.78 + u * 0.22 : 0.2 + u * 0.8);
        softFill(g, (q) => q.ellipse(x, y, 4 + r() * 6, 3 + r() * 5, 0, 0, TAU), `rgba(${40 + (r() * 22 | 0)},${52 + (r() * 22 | 0)},${32 + (r() * 12 | 0)},0.55)`, 3);
      }
    };
    tree(x0 + 66, y1 - 26, 230, 42, false); tree(x0 + 104, y1 - 18, 170, 30, false); tree(x1 - 118, y1 - 30, 150, 120, true);
    haze(hz - 24, hz + 26, 0.32);
    g.restore();
    pen(g, '124,52,34', 0.9, B * 0.62); g.strokeRect(B * 0.5, B * 0.5, w - B, h - B);       // painted red-ochre border
    pen(g, '236,222,190', 0.6, 2); g.strokeRect(B + 2, B + 2, w - 2 * B - 4, h - 2 * B - 4);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(228,214,184,${0.25 + r() * 0.5})`; const s = 0.8 + r() * 3; g.fillRect(r() * w, r() * h, s, s); }  // abraded pigment
    for (let i = 0; i < 6; i++) { const cx = r() * w, cy = r() * h; softFill(g, (q) => q.ellipse(cx, cy, 30 + r() * 60, 20 + r() * 40, 0, 0, TAU), 'rgba(238,232,218,0.22)', 20); }  // salt bloom
    age(g, w, h, r, { damp: 0.34, streaks: 36, cracks: 12, foxing: 24 });
  }
  // the ruins wall's broken crest (ruins.js wall(-47.5, -26, 7.5), seed 1337): the fresco stays below it
  const CREST = [[-47.5, 2.647], [-47.031, 2.923], [-46.562, 3.104], [-45.625, 2.614], [-44.687, 2.721], [-43.75, 2.107], [-42.812, 1.39]];
  const crestY = (x) => { for (let i = 1; i < CREST.length; i++) if (x <= CREST[i][0]) { const [ax, ay] = CREST[i - 1], [bx, by] = CREST[i]; return ay + (by - ay) * (x - ax) / (bx - ax); } return CREST[CREST.length - 1][1]; };
  function cutCrest(w, h) {
    return (g, r) => {
      const n = noise(r);
      g.beginPath(); g.moveTo(0, -2);
      for (let px = 0; px <= w; px += 3) {
        const X = PAI.x0 + (px / w) * (PAI.x1 - PAI.x0), Y = crestY(X) - 0.12 - 0.2 * n(px * 0.045) - 0.05 * n(px * 0.4 + 20);
        g.lineTo(px, Math.max(-2, (PAI.y1 - Y) / (PAI.y1 - PAI.y0) * h));
      }
      g.lineTo(w + 2, -2); g.closePath(); g.fill();
    };
  }
  function paintFrieze(g, w, h, r) {
    plaster(g, w, h, r, '226,212,184');
    const panels = [[30, 500], [532, 1012], [1036, 1516], [1548, 2018]], y0 = 30, y1 = 226;
    for (const [a, b] of panels) {
      pen(g, SANG, 0.55, 1.6); line(g, r, [[a, y0], [b, y0], [b, y1], [a, y1], [a, y0]], 1.2);
      pen(g, SANG, 0.28, 1); line(g, r, [[a + 6, y0 + 6], [b - 6, y0 + 6], [b - 6, y1 - 6], [a + 6, y1 - 6], [a + 6, y0 + 6]], 1);
    }
    water(g, r, 30, 500, y0, y1);
    script(g, r, 490, 44, 120, 3, 12);
    horse(g, r, 600, 214, 126, 'trot');
    script(g, r, 1000, 48, 190, 5, 13);
    pen(g, SANG, 0.55, 1.1);                             // footfalls of the trot: hoof prints in diagonal pairs
    for (let i = 0; i < 4; i++) for (const s of [0, 1]) { const x = 830 + i * 40 + s * 18, y = 160 + s * 26; arc(g, r, x, y, 6, Math.PI * 0.15, Math.PI * 1.85, 0.3); }
    horse(g, r, 1100, 208, 116, 'gallop');
    pen(g, SANG, 0.45, 1); g.setLineDash([5, 5]);
    curve(g, r, (t) => [1100 + 116 * (1.0 + 0.32 * Math.cos(t)), 208 - 116 * (0.22 + 0.14 * Math.sin(t))], 0, TAU, 40, 0.5);
    g.setLineDash([]);
    { // a head studied larger
      const s = 200, ox = 1190, gy = 320, Q = ([x, y]) => [ox + x * s, gy - y * s], pts = HORSE.slice(4, 18).map(Q), path = spline(pts, false);
      g.save(); g.beginPath(); g.rect(1300, y0 + 8, 210, y1 - y0 - 16); g.clip();
      const shade = spline(pts, true);
      hatchIn(g, r, shade, [1300, y0, 1516, y1], 3, SEPIA, 0.32, 0.85, Math.PI / 4, (q) => { const [ax, ay] = Q([0.9, 1.12]); q.rect(ax - 40, ay, 120, 200); });
      pen(g, SEPIA, 0.85, 1.6); g.stroke(path);
      line(g, r, [Q([1.0, 1.33]), Q([0.99, 1.45]), Q([1.05, 1.35])], 0.3);
      arc(g, r, ...Q([1.08, 1.2]), 4, 0, TAU, 0.2);
      g.fillStyle = rgba(SEPIA, 0.6); const [nx, ny] = Q([1.22, 1.0]); g.beginPath(); g.arc(nx, ny, 2.5, 0, TAU); g.fill();
      pen(g, SEPIA, 0.5, 1); curve(g, r, (u) => Q([1.04 + u * 0.12, 1.12 - u * 0.1 + Math.sin(u * 3) * 0.02]), 0, 1, 12, 0.3);
      for (let i = 0; i < 12; i++) { const u = i / 11, p = [0.72 + u * 0.27, 1.02 + u * 0.31]; line(g, r, [Q(p), Q([p[0] - 0.06 - r() * 0.03, p[1] - 0.04 - r() * 0.04])], 0.4); }
      g.restore();
    }
    for (let i = 0; i < 7; i++) {                       // reeds
      const bx = 1580 + i * 22 + r() * 10, tx = bx + (r() - 0.3) * 60, ty = 52 + r() * 50;
      pen(g, SEPIA, 0.7, 1.1); curve(g, r, (u) => qb([bx, 222], [bx + (tx - bx) * 0.2, 140], [tx, ty], u), 0, 1, 20, 0.4);
      pen(g, SEPIA, 0.4, 0.8); curve(g, r, (u) => { const p = qb([bx, 222], [bx + (tx - bx) * 0.2, 140], [tx, ty], u); return [p[0] + 3 * (1 - u), p[1]]; }, 0, 0.98, 20, 0.4);
    }
    stem(g, r, 1790, 222, 1808, 70, 26, 0.9);
    rosette(g, r, 1930, 132, 62);
    script(g, r, 2008, 212, 120, 1, 12);
    age(g, w, h, r, { damp: 0.25, streaks: 30, cracks: 7, foxing: 60 });
  }

  // ---------------------------------------------------------------- walls
  function mural({ id, w, h, seed, paint, maskOpt, folded, geo, pos, ry, caption }) {
    const r = rng(seed);
    const { c, g } = canvas(w, h);
    paint(g, w, h, r);
    const m = mask(w, h, rng(seed * 7 + 3), maskOpt);
    rims(g, m.chips);
    const map = new THREE.CanvasTexture(folded ? fold(c) : c);
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = ANISO;
    const alpha = new THREE.CanvasTexture(folded ? fold(m.c) : m.c);
    alpha.anisotropy = ANISO;
    const mat = new THREE.MeshStandardMaterial({
      map, alphaMap: alpha, transparent: true, depthWrite: false, roughness: 0.95, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    mat.name = 'mural-' + id;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'mural-' + id;
    mesh.position.set(pos[0], pos[1], pos[2]); mesh.rotation.y = ry;
    mesh.castShadow = false; mesh.receiveShadow = true;
    mesh.userData.action = { type: 'custom', id: 'mural-' + id };
    mesh.userData.caption = caption;
    mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
    group.add(mesh); pickables.push(mesh);
  }
  // two quads side by side, each showing one row of a folded texture
  function foldedPlane(W, H) {
    const hw = W / 2, hh = H / 2, gq = new THREE.BufferGeometry();
    gq.setAttribute('position', new THREE.Float32BufferAttribute([-hw, -hh, 0, 0, -hh, 0, 0, hh, 0, -hw, hh, 0, 0, -hh, 0, hw, -hh, 0, hw, hh, 0, 0, hh, 0], 3));
    gq.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    gq.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0.5, 1, 0.5, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0.5, 0, 0.5], 2));
    gq.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    return gq;
  }
  const HALF = Math.PI / 2;
  mural({ id: 'voo', w: 1024, h: 512, seed: 1452, paint: paintVoo, maskOpt: { margin: 24, blur: 14, flakes: 80, islands: 16 },
    geo: new THREE.PlaneGeometry(9.6, 4.8), pos: [-6.92, 3.3, 6.5], ry: -HALF,
    caption: 'Estudo de máquina voadora — o ar também tem peso.' });
  mural({ id: 'homem', w: 1024, h: 512, seed: 1519, paint: paintHomem, maskOpt: { margin: 24, blur: 14, flakes: 80, islands: 16 },
    geo: new THREE.PlaneGeometry(9.6, 4.8), pos: [6.92, 3.3, 6.5], ry: HALF,
    caption: 'O corpo medido no círculo e no quadrado — e a luz que pousa nas esferas.' });
  mural({ id: 'paisagem', w: 720, h: 512, seed: 1503, paint: paintPaisagem,
    maskOpt: { margin: 18, blur: 7, flakes: 110, inner: 34, islands: 12, cut: cutCrest(720, 512) },
    geo: new THREE.PlaneGeometry(PAI.x1 - PAI.x0, PAI.y1 - PAI.y0), pos: [(PAI.x0 + PAI.x1) / 2, (PAI.y0 + PAI.y1) / 2, -25.83], ry: 0,
    caption: 'Paisagem a fresco — ao longe, o ar pinta os montes de azul.' });
  mural({ id: 'predela', w: 2048, h: 256, seed: 1490, paint: paintFrieze, folded: true, maskOpt: { margin: 20, blur: 10, flakes: 120, islands: 20 },
    geo: foldedPlane(12.7, 1.5), pos: [-56.98, -1.3, 30], ry: HALF,
    caption: 'Estudos de água e de cavalos — tudo o que corre desenha a sua curva.' });

  function onPick(o) {
    const t = o && o.userData && o.userData.caption;
    if (t && ctx.ui && typeof ctx.ui.toast === 'function') ctx.ui.toast(t);
  }
  return { group, regions: [], colliders: [], pickables, update() {}, onPick };
}
