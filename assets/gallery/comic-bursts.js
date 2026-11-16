// Comic onomatopoeia over the 3D view: "SAPAS!" on a slap, "CHAPADÃO!!!" on a streak, the
// visitor's "CALA-TEEEE, #%&@!". A handful of reused DOM nodes animated on the game's own clock
// (update(dt) from the frame loop), so a slow frame never skips a word; nothing runs when idle.
export function createBursts({ reducedMotion = false } = {}) {
  if (typeof document === 'undefined') return { pop() {}, update() {}, dispose() {} };
  const layer = document.createElement('div');
  layer.className = 'comic-bursts'; layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '45', overflow: 'hidden' });
  document.body.appendChild(layer);
  const pool = [];
  function node() {
    let b = pool.find((n) => !n.on);
    if (!b) {
      if (pool.length >= 6) b = pool.reduce((a, c) => (c.t > a.t ? c : a));   // reuse the oldest
      else {
        const el = document.createElement('div');
        Object.assign(el.style, { position: 'absolute', left: '0', top: '0', whiteSpace: 'nowrap', fontFamily: "Bungee, Impact, 'Arial Black', system-ui, sans-serif", fontWeight: '900', letterSpacing: '.02em',
          WebkitTextStroke: '3px #1b1208', paintOrder: 'stroke fill', textShadow: '0 4px 0 #1b1208, 0 0 18px rgba(255,200,60,.55)', willChange: 'transform, opacity', display: 'none' });
        layer.appendChild(el); b = { el, on: false, t: 0, dur: 1, x: 0, y: 0, r: 0 }; pool.push(b);
      }
    }
    return b;
  }
  /** text at screen (x, y) in CSS pixels; size 1 = 38 px. */
  function pop(text, x, y, { size = 1, color = '#ffd84a', tilt } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const b = node();
    b.on = true; b.t = 0; b.dur = 0.8 + 0.3 * size; b.x = x; b.y = y; b.r = tilt ?? (Math.random() * 18 - 9);
    b.el.textContent = text;
    Object.assign(b.el.style, { display: 'block', fontSize: Math.round(38 * size) + 'px', color });
    draw(b);
  }
  const ease = (k) => 1 - (1 - k) ** 3;
  function draw(b) {
    const k = Math.min(1, b.t / b.dur);
    let s, rise, op;
    if (reducedMotion) { s = 1; rise = 0; op = k < .12 ? k / .12 : k > .8 ? (1 - k) / .2 : 1; }
    else if (k < .16) { const q = ease(k / .16); s = .25 + .95 * q; rise = 0; op = q; }
    else if (k < .7) { const q = (k - .16) / .54; s = 1.2 - .2 * q; rise = 8 * q; op = 1; }
    else { const q = (k - .7) / .3; s = 1 - .08 * q; rise = 8 + 20 * q; op = 1 - q; }
    b.el.style.opacity = op.toFixed(3);
    b.el.style.transform = `translate(${b.x}px, ${b.y}px) translate(-50%, -${50 + rise}%) scale(${s.toFixed(3)}) rotate(${(b.r * (k < .7 ? 1 : .5)).toFixed(1)}deg)`;
  }
  function update(dt) {
    for (const b of pool) {
      if (!b.on) continue;
      b.t += Math.min(0.1, Math.max(0, dt || 0));
      if (b.t >= b.dur) { b.on = false; b.el.style.display = 'none'; continue; }
      draw(b);
    }
  }
  return { pop, update, dispose() { layer.remove(); } };
}
