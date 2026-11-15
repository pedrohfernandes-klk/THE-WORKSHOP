// ui.js — the interface layer of THE WORKSHOP. DOM only, no THREE.
// All markup and CSS live in index.html; this module wires it up.

const $ = (id) => document.getElementById(id);

export function formatDuration(s) {
  const t = Math.max(0, Math.floor(Number.isFinite(s) ? s : 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

function slugify(text) {
  return String(text || 'exhibition')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'exhibition';
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

const SHARED_SUB = 'Hung by one visitor’s attention';
const OWN_SUB = 'Hung by your attention';

function subtitleFor(summary) {
  return `${summary.shared ? SHARED_SUB : OWN_SUB} · THE WORKSHOP${summary.dateText ? ' · ' + String(summary.dateText).replace(/ /g, '\u00a0') : ''}`;
}

export function showFallback(message) {
  const box = $('fallback');
  if (!box) return;
  if (message) $('fallback-message').textContent = message;
  box.classList.add('is-on');
  for (const id of ['entry', 'hud', 'exhibition']) {
    const n = $(id);
    if (n) { n.setAttribute('inert', ''); n.style.display = 'none'; }
  }
  const stage = $('stage');
  if (stage) stage.style.display = 'none';
  const link = box.querySelector('a');
  if (link) link.focus({ preventScroll: true });
}

function fillStrip(node, palette, empty) {
  const key = (palette || []).map((p) => p.hex + ':' + (+p.share).toFixed(3)).join('|');
  if (node.__key === key) return;
  node.__key = key;
  const items = (palette || []).filter((p) => p && p.share > 0);
  node.classList.toggle('is-empty', items.length === 0);
  if (items.length === 0) { node.replaceChildren(); return; }
  const total = items.reduce((a, p) => a + p.share, 0) || 1;
  const kids = items.map((p) => {
    const i = document.createElement('i');
    i.style.flexBasis = (p.share / total * 100).toFixed(3) + '%';
    i.style.backgroundColor = p.hex;
    return i;
  });
  node.replaceChildren(...kids);
}

export function createUI(handlers = {}) {
  const h = {
    onEnter() {}, onOpenExhibition() {}, onCloseExhibition() {},
    onNext() {}, onPrev() {}, onLeaveFocus() {}, onResumeAttentive() {},
    ...handlers,
  };

  const entry = $('entry'), hud = $('hud');
  const enterBtn = $('enter'), enterFill = $('enter-fill'), enterLabel = $('enter-label'), enterPct = $('enter-pct');
  const label = $('label'), labelTitle = $('label-title'), labelMeta = $('label-meta'), labelTime = $('label-time');
  const labelExtra = $('label-extra'), labelNote = $('label-note'), labelCredit = $('label-credit');
  const hintEl = $('hint'), toastEl = $('toast');
  const exh = $('exhibition'), exhScroll = $('exh-scroll');
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- entry ----------
  let progress = 0, ready = false, entryVisible = false;

  function paintProgress() {
    const p = Math.max(0, Math.min(1, progress));
    ready = p >= 1;
    enterBtn.disabled = !ready;
    enterFill.style.transform = `scaleX(${p})`;
    if (ready) {
      enterLabel.textContent = 'Enter';
      enterPct.textContent = '→';
      enterPct.style.opacity = '1';
      if (entryVisible && !enterBtn.__focused && !window.matchMedia('(pointer: coarse)').matches) {
        enterBtn.__focused = true;
        if (!document.activeElement || document.activeElement === document.body) enterBtn.focus({ preventScroll: true });
      }
    } else {
      enterLabel.textContent = 'Preparing the room';
      enterPct.textContent = Math.round(p * 100) + '%';
    }
  }

  enterBtn.addEventListener('click', () => { if (ready) h.onEnter(); });
  $('entry-resume').addEventListener('click', () => h.onResumeAttentive());

  function showEntry({ mode = 'attentive', title, dateText } = {}) {
    const shared = mode === 'shared';
    const titleEl = $('entry-title');
    if (shared) {
      titleEl.textContent = title || 'An exhibition';
      titleEl.classList.toggle('is-long', true);
    } else {
      const it = el('span', 'it', 'The');
      titleEl.replaceChildren(it, document.createTextNode(' Workshop'));
      titleEl.classList.remove('is-long');
    }
    $('entry-eyebrow').textContent = shared ? 'An exhibition hung by one visitor’s gaze' : 'A single room';
    const date = $('entry-date');
    date.hidden = !(shared && dateText);
    date.textContent = dateText || '';
    $('entry-lede').hidden = shared;
    $('entry-sub').hidden = shared;
    $('entry-resume').hidden = !shared;
    entry.classList.remove('is-hidden');
    entry.removeAttribute('inert');
    entry.removeAttribute('aria-hidden');
    hud.classList.add('is-hidden');
    hud.setAttribute('inert', '');
    entryVisible = true;
    enterBtn.__focused = false;
    paintProgress();
  }

  function hideEntry() {
    entryVisible = false;
    const hadFocus = entry.contains(document.activeElement);
    entry.classList.add('is-hidden');
    entry.setAttribute('inert', '');
    entry.setAttribute('aria-hidden', 'true');
    hud.classList.remove('is-hidden');
    hud.removeAttribute('inert');
    if (hadFocus) { try { $('stage').focus({ preventScroll: true }); } catch (e) { /* noop */ } }
  }

  function setProgress(p) {
    progress = Number.isFinite(p) ? p : 0;
    paintProgress();
  }

  // ---------- wall label ----------
  let curWork = undefined, curSeconds = -1, curFocused = null;

  function setLabel(work, { seconds = 0, focused = false } = {}) {
    const empty = !work;
    label.classList.toggle('is-empty', empty);
    if (empty) {
      if (curWork !== null) { curWork = null; label.dataset.focused = 'false'; labelExtra.setAttribute('inert', ''); curFocused = false; }
      return;
    }
    if (work !== curWork) {
      const had = curWork;
      curWork = work;
      labelTitle.textContent = work.title || '';
      const meta = labelMeta;
      meta.replaceChildren();
      const parts = [work.medium, work.no].filter(Boolean);
      parts.forEach((t, i) => {
        if (i) meta.appendChild(el('span', 'sep', '·'));
        meta.appendChild(el('span', 'nb', t));
      });
      labelNote.textContent = work.note || '';
      const credit = [work.artist, work.series].filter(Boolean).join(' — ');
      labelCredit.textContent = credit;
      labelCredit.hidden = !credit;
      curSeconds = -1;
      if (had !== undefined && had !== null && !reduceMotion()) {
        for (const n of [labelTitle, labelMeta]) {
          n.classList.remove('label-fade'); void n.offsetWidth; n.classList.add('label-fade');
        }
      }
    }
    const whole = Math.floor(seconds);
    if (whole !== curSeconds) {
      curSeconds = whole;
      if (whole >= 1) {
        labelTime.replaceChildren(document.createTextNode('You have looked for '), el('b', null, formatDuration(whole)));
        labelTime.hidden = false;
      } else {
        labelTime.hidden = true;
      }
    }
    if (focused !== curFocused) {
      curFocused = focused;
      label.dataset.focused = focused ? 'true' : 'false';
      if (focused) labelExtra.removeAttribute('inert'); else labelExtra.setAttribute('inert', '');
    }
  }

  $('label-prev').addEventListener('click', () => h.onPrev());
  $('label-next').addEventListener('click', () => h.onNext());
  $('label-leave').addEventListener('click', () => h.onLeaveFocus());

  // ---------- palette strip ----------
  const strip = $('exh-strip');
  function setPalette(palette) { fillStrip(strip, palette); }
  $('exh-btn').addEventListener('click', () => h.onOpenExhibition());

  // ---------- hint & toast ----------
  let hintTimer = 0;
  function hint(text) {
    clearTimeout(hintTimer);
    if (!text) {
      hintEl.classList.remove('is-on');
      return;
    }
    hintEl.textContent = text;
    // restart transition so a changed line fades in again
    hintEl.classList.add('is-on');
  }

  let toastTimer = 0;
  function toast(text, ms = 5200) {
    clearTimeout(toastTimer);
    if (!text) { toastEl.classList.remove('is-on'); return; }
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), ms);
  }

  // ---------- exhibition overlay ----------
  let isOpen = false, lastSummary = null, returnFocus = null, copyTimer = 0;
  const copyBtn = $('exh-copy'), posterBtn = $('exh-poster'), linkInput = $('exh-link');

  function openExhibition(summary) {
    lastSummary = summary;
    const works = summary.works || [];
    $('exh-title').textContent = summary.title || 'Untitled';
    $('exh-sub').textContent = subtitleFor(summary);
    exhPalette(summary.palette);
    const total = works.reduce((a, w) => a + Math.floor(w.seconds || 0), 0);
    $('exh-count').textContent = `${works.length} ${works.length === 1 ? 'work' : 'works'}`;
    $('exh-total').textContent = total >= 1 ? `${summary.shared ? 'Looked at for' : 'You looked for'} ${formatDuration(total)}` : (summary.shared ? '' : 'Look a little longer to hang your own');

    const list = $('exh-works');
    const frag = document.createDocumentFragment();
    works.forEach(({ work, seconds }) => {
      const li = el('li', 'exh-card');
      const ph = el('div', 'ph');
      const img = document.createElement('img');
      img.alt = `${work.title || 'Work'}${work.medium ? ', ' + work.medium : ''}`;
      img.decoding = 'async';
      img.loading = 'lazy';
      img.src = work.src;
      ph.appendChild(img);
      const meta = el('div', 'meta caps');
      meta.appendChild(el('span', null, work.no || ''));
      const sec = Math.floor(seconds || 0);
      const time = el('span', 'time num' + (sec < 1 ? ' zero' : ''), sec >= 1 ? formatDuration(sec) : '—');
      if (sec >= 1) time.title = 'Time looked';
      meta.appendChild(time);
      li.append(ph, meta, el('h3', null, work.title || ''), el('p', null, work.medium || ''));
      frag.appendChild(li);
    });
    list.replaceChildren(frag);

    linkInput.value = summary.link || '';
    copyBtn.textContent = 'Copy link';
    copyBtn.disabled = !summary.link;

    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    isOpen = true;
    exh.classList.add('is-open');
    exh.setAttribute('aria-hidden', 'false');
    hud.setAttribute('inert', '');
    entry.setAttribute('inert', '');
    exhScroll.scrollTop = 0;
    requestAnimationFrame(() => $('exh-close-top').focus({ preventScroll: true }));
  }

  function exhPalette(palette) {
    const band = $('exh-band');
    fillStrip(band, palette);
    const items = (palette || []).filter((p) => p.share > 0);
    band.setAttribute('aria-label', items.length ? 'Palette of attention: ' + items.map((p) => p.hex).join(', ') : 'No palette yet');
    $('exh-band-note').textContent = items.length ? '' : 'Still gathering';
  }

  function closeExhibition() {
    if (!isOpen) return;
    isOpen = false;
    exh.classList.remove('is-open');
    exh.setAttribute('aria-hidden', 'true');
    if (!entryVisible) hud.removeAttribute('inert');
    else entry.removeAttribute('inert');
    const target = returnFocus && document.contains(returnFocus) && !returnFocus.closest('[inert]') ? returnFocus : $('exh-btn');
    returnFocus = null;
    try { target.focus({ preventScroll: true }); } catch (e) { /* noop */ }
  }

  // focus trap + Esc
  document.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      h.onCloseExhibition();
      return;
    }
    if (e.key !== 'Tab') return;
    const f = [...exh.querySelectorAll('button:not([disabled]), input, a[href], [tabindex="0"]')].filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!exh.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, true);

  const close = () => h.onCloseExhibition();
  $('exh-close').addEventListener('click', close);
  $('exh-close-top').addEventListener('click', close);

  function flashCopied(text) {
    copyBtn.textContent = text;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 2400);
  }
  copyBtn.addEventListener('click', async () => {
    const link = lastSummary && lastSummary.link;
    if (!link) return;
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(link); ok = true; }
    } catch (e) { ok = false; }
    if (!ok) {
      linkInput.focus();
      linkInput.select();
      try { linkInput.setSelectionRange(0, link.length); ok = document.execCommand('copy'); } catch (e) { ok = false; }
    }
    flashCopied(ok ? 'Copied' : 'Press Ctrl+C to copy');
  });
  linkInput.addEventListener('focus', () => linkInput.select());

  posterBtn.addEventListener('click', async () => {
    if (!lastSummary) return;
    posterBtn.setAttribute('aria-busy', 'true');
    const prev = posterBtn.textContent;
    posterBtn.textContent = 'Preparing…';
    try {
      const blob = await renderPoster(lastSummary);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `the-workshop-${slugify(lastSummary.title)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      posterBtn.textContent = 'Saved';
      setTimeout(() => { posterBtn.textContent = prev; }, 2000);
    } catch (e) {
      console.error(e);
      posterBtn.textContent = 'Could not make poster';
      setTimeout(() => { posterBtn.textContent = prev; }, 2600);
    } finally {
      posterBtn.removeAttribute('aria-busy');
    }
  });

  paintProgress();

  const soundBtn = $('sound-btn');
  if (soundBtn) soundBtn.addEventListener('click', () => handlers.onToggleSound?.());
  function setSound(on) {
    if (!soundBtn) return;
    soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    soundBtn.setAttribute('aria-label', on ? 'Sound on — mute' : 'Sound off — unmute');
  }

  return {
    showEntry, setProgress, hideEntry, setLabel, setPalette, hint, toast,
    openExhibition, closeExhibition, renderPoster, setSound,
  };
}

// ======================= poster =======================
const PAPER = '#f4efe6', INK = '#15120e';
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS = '"Instrument Sans", system-ui, sans-serif';

async function loadImage(src) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  try { await img.decode(); return img; } catch (e) { return null; }
}

function setSpacing(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }

function wrapLines(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW || !line) line = t;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const keep = lines.slice(0, maxLines);
    keep[maxLines - 1] = lines.slice(maxLines - 1).join(' ');
    return keep;
  }
  return lines;
}

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

function ellipsizeMiddle(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let a = Math.ceil(text.length / 2), b = Math.floor(text.length / 2);
  let out = text;
  while (a + b > 8) {
    a = Math.max(4, a - 1); b = Math.max(4, b - 1);
    out = text.slice(0, a) + '…' + text.slice(text.length - b);
    if (ctx.measureText(out).width <= maxW) return out;
  }
  return out;
}

function drawCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s, sh = h / s;
  const sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

export async function renderPoster(summary) {
  const W = 1080, H = 1350, M = 90, CW = W - M * 2;
  await Promise.all([
    document.fonts.load(`108px "Instrument Serif"`),
    document.fonts.load(`italic 108px "Instrument Serif"`),
    document.fonts.load(`400 24px "Instrument Sans"`),
    document.fonts.load(`600 24px "Instrument Sans"`),
  ]).catch(() => {});

  const works = (summary.works || []).slice(0, 6);
  const [imgs, sig] = await Promise.all([
    Promise.all(works.map((w) => loadImage(w.work.src))),
    loadImage('./assets/extracted/hrm-signature.webp'),
  ]);

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  // eyebrow
  ctx.fillStyle = '#9c3d33';
  ctx.font = `600 18px ${SANS}`;
  setSpacing(ctx, 3.4);
  ctx.fillText('EXHIBITION', M, M + 14);
  setSpacing(ctx, 0);

  // title
  let size = 128, lines;
  const title = summary.title || 'Untitled';
  for (; size >= 72; size -= 4) {
    ctx.font = `400 ${size}px ${SERIF}`;
    lines = wrapLines(ctx, title, CW, 3);
    if (lines.length <= 2 || (lines.length === 3 && size <= 92)) {
      if (lines.every((l) => ctx.measureText(l).width <= CW)) break;
    }
  }
  ctx.font = `400 ${size}px ${SERIF}`;
  ctx.fillStyle = INK;
  setSpacing(ctx, -size * 0.02);
  const lh = size * 0.94;
  let y = M + 14 + 40 + size * 0.78;
  lines.forEach((l, i) => ctx.fillText(l, M - 3, y + i * lh));
  setSpacing(ctx, 0);
  y += (lines.length - 1) * lh;

  // date line
  y += 52;
  ctx.fillStyle = 'rgba(21,18,14,.72)';
  ctx.font = `400 22px ${SANS}`;
  ctx.fillText(fitText(ctx, subtitleFor(summary), CW), M, y);

  // palette band
  y += 40;
  const bandH = 48;
  const pal = (summary.palette || []).filter((p) => p.share > 0);
  if (pal.length) {
    const tot = pal.reduce((a, p) => a + p.share, 0);
    let x = M;
    pal.forEach((p, i) => {
      const w = i === pal.length - 1 ? M + CW - x : Math.round(CW * p.share / tot);
      ctx.fillStyle = p.hex;
      ctx.fillRect(x, y, w, bandH);
      x += w;
    });
  } else {
    ctx.fillStyle = 'rgba(21,18,14,.14)';
    ctx.fillRect(M, y + bandH / 2, CW, 1);
  }
  y += bandH + 36;

  // grid
  const footTop = H - 176;
  const cols = 3, gap = 24;
  const rows = works.length > 3 ? 2 : 1;
  const cellW = (CW - gap * (cols - 1)) / cols;
  const capH = 46;
  const availH = footTop - 30 - y;
  const cellH = Math.min(cellW * 1.25, (availH - gap * (rows - 1) - capH * rows) / rows);
  works.forEach((item, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = M + col * (cellW + gap);
    const yy = y + row * (cellH + capH + gap);
    ctx.fillStyle = '#ebe4d7';
    ctx.fillRect(x, yy, cellW, cellH);
    if (imgs[i]) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x, yy, cellW, cellH); ctx.clip();
      drawCover(ctx, imgs[i], x, yy, cellW, cellH);
      ctx.restore();
    }
    ctx.fillStyle = INK;
    ctx.font = `400 22px ${SERIF}`;
    const sec = Math.floor(item.seconds || 0);
    const tw = sec >= 1 ? (setSpacing(ctx, 0), ctx.measureText(formatDuration(sec)).width) : 0;
    ctx.fillText(fitText(ctx, item.work.title || '', cellW - tw - 12), x, yy + cellH + 28);
    if (sec >= 1) {
      ctx.font = `500 15px ${SANS}`;
      ctx.fillStyle = 'rgba(21,18,14,.72)';
      ctx.textAlign = 'right';
      ctx.fillText(formatDuration(sec), x + cellW, yy + cellH + 28);
      ctx.textAlign = 'left';
    }
  });

  // footer
  ctx.fillStyle = 'rgba(21,18,14,.2)';
  ctx.fillRect(M, footTop, CW, 1);
  ctx.fillStyle = INK;
  ctx.font = `600 17px ${SANS}`;
  setSpacing(ctx, 3);
  ctx.fillText('THE WORKSHOP · HrM', M, footTop + 52);
  setSpacing(ctx, 0);
  if (summary.link) {
    ctx.font = `400 15px ${SANS}`;
    ctx.fillStyle = 'rgba(21,18,14,.68)';
    const sigW = sig ? 96 : 0;
    ctx.fillText(ellipsizeMiddle(ctx, summary.link.replace(/^https?:\/\//, ''), CW - sigW - 20), M, footTop + 88);
  }
  if (sig) {
    const sh = 52, sw = sh * sig.naturalWidth / sig.naturalHeight;
    const o = document.createElement('canvas');
    o.width = Math.ceil(sw * 2); o.height = Math.ceil(sh * 2);
    const oc = o.getContext('2d');
    oc.drawImage(sig, 0, 0, o.width, o.height);
    oc.globalCompositeOperation = 'source-in';
    oc.fillStyle = INK;
    oc.fillRect(0, 0, o.width, o.height);
    ctx.drawImage(o, M + CW - sw, footTop + 28, sw, sh);
  }

  return await new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Poster could not be encoded'))), 'image/png');
  });
}
