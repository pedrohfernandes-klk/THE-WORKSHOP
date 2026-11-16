// ui.js — the interface layer of THE WORKSHOP. DOM only, no THREE.
// All markup and CSS live in index.html; this module wires it up.
// House style (LEO canon): Bungee for titles and places, Space Grotesk for
// sentences, Silkscreen for keys, prompts, toasts and counters; ink, paper,
// tangerine, sun, sea, signal and night.

const $ = (id) => document.getElementById(id);
const LANG = (navigator.languages && navigator.languages[0]) || navigator.language || '';
const PT = /^pt\b/i.test(LANG);

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

// Every word the title screen may say (LEO canon §4).
const WORDS = PT
  ? { line: 'Muda quando não estás a olhar.', enter: 'Entrar', tap: 'Entrar', ready: 'Pronto.' }
  : { line: 'It changes when you look away.', enter: 'Press Enter', tap: 'Tap to enter', ready: 'Ready.' };
const SHARED_LINE = 'Hung by one visitor’s gaze.';

const SHARED_SUB = 'Hung by one visitor’s gaze';
const OWN_SUB = 'Hung by your gaze';

function subtitleFor(summary) {
  return `${summary.shared ? SHARED_SUB : OWN_SUB}${summary.dateText ? ' · ' + String(summary.dateText).replace(/ /g, ' ') : ''}`;
}

// Letters for the drop-in; words stay whole so a long title wraps cleanly.
function letters(text, start = 0) {
  const frag = document.createDocumentFragment();
  let i = start;
  for (const part of String(text).split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); continue; }
    const w = el('span', 'w');
    for (const ch of part) {
      const c = el('span', 'ch', ch);
      c.style.setProperty('--i', String(Math.min(i++, 26)));
      w.appendChild(c);
    }
    frag.appendChild(w);
  }
  return { frag, next: i };
}

// ---------- prompts: one grammar, `[KEY] VERB` ----------
const KEY = /^(WASD|Shift|Space|Esc|Click|Tap|Drag|Mouse|[1-9]\s*[–-]\s*[1-9]|[EFGT])\b[:\s]*(?:to\s+)?(.*)$/i;
const VERBS = [
  [/paper ball/i, 'Take'],
  [/approach|the work\b/i, 'Look'],
  [/catalogue|exhibition/i, 'Read'],
  [/^sit\b|seat/i, 'Sit'],
  [/^up\b/i, 'Up'],
  [/^down\b/i, 'Down'],
  [/lift/i, 'Call'],
  [/screen|plays/i, 'Watch'],
  [/slap/i, 'Slap'],
  [/^talk\b/i, 'Talk'],
  [/^use$/i, 'Use'],
  [/^open$/i, 'Open'],
];
// One language per visitor: the interface speaks the browser's (English or pt-PT);
// the world itself (signs, radio, people) speaks Portuguese. Leo, final pass.
const PT_SAY = new Map(Object.entries({
  take: 'Apanhar', look: 'Olhar', read: 'Ler', sit: 'Sentar', up: 'Subir', down: 'Descer', call: 'Chamar',
  watch: 'Ver', slap: 'Chapada', talk: 'Falar', use: 'Usar', open: 'Abrir', play: 'Jogar', throw: 'Atirar',
  'look around': 'olhar', walk: 'andar', run: 'correr', jump: 'saltar', 'or hold to walk': 'ou mantém para andar',
  'releases the mouse': 'solta o rato', seated: 'Sentado', 'or space to stand up': 'ou Espaço para levantar',
  'the floor to stand': 'o chão para levantar', 'click to play': 'Clica para jogar',
  click: 'Clique', tap: 'Toque', drag: 'Arrasta', space: 'Espaço', mouse: 'Rato',
  // in-world notices (toasts)
  'get closer': 'Chega-te mais perto', 'get closer to talk': 'Chega-te para falar',
  'too far to slap': 'Longe demais para a chapada', 'get closer to sit': 'Chega-te para te sentares',
  'the doors are open.': 'As portas estão abertas.', 'hold f, release to throw': 'Segura F e larga para atirar',
  // First-minute hints (first-minute.js)
  'walk up to a work to hear its story.': 'Aproxima-te de uma obra para ouvires a história dela.',
  'people here answer back: click to slap, e to talk.': 'Aqui a malta responde: clica para dar chapada, E para conversar.',
  'the tram waits at the east platform: get in and press partir.': 'O elétrico espera na plataforma a nascente: entra e carrega em PARTIR.',
  'hold q next to someone for a proper porrada. brio is your breath in a fight.': 'Mantém Q ao pé de alguém para porrada a sério. O BRIO é o teu fôlego na luta.',
  'orgulho comes from missions and fights, and goes on intangible goods at the vending machine.': 'O ORGULHO ganha-se em missões e porradas e gasta-se em bens imateriais na máquina.',
}));
const say = (s) => (PT && PT_SAY.get(String(s).trim().toLowerCase())) || s;
function verbFor(label) {
  for (const [re, verb] of VERBS) if (re.test(label)) return say(verb);
  return say(/^[\p{L}-]{1,10}$/u.test(label) ? label : 'Open');
}
function isKeySegment(seg) { return KEY.test(seg.trim()); }

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

function fillStrip(node, palette) {
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
  const enterStatus = $('enter-status');
  const label = $('label'), labelTitle = $('label-title'), labelMeta = $('label-meta'), labelTime = $('label-time');
  const labelExtra = $('label-extra'), labelNote = $('label-note'), labelCredit = $('label-credit');
  const hintEl = $('hint'), toastEl = $('toast'), placeEl = $('place');
  const exh = $('exhibition'), exhScroll = $('exh-scroll');
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = () => window.matchMedia('(pointer: coarse)').matches;

  // ---------- entry ----------
  if (PT) {
    entry.lang = 'pt-PT';
    for (const n of entry.querySelectorAll('[data-pt]')) n.textContent = n.dataset.pt;
    // the one HUD word that is not a prompt: same language as the prompts
    const exhT = document.querySelector('#exh-btn .t');
    if (exhT) { exhT.replaceChildren(el('span', 'm-hide', 'A tua '), document.createTextNode('exposição')); $('exh-btn').setAttribute('aria-label', 'A tua exposição'); }
  }
  const BLOCKS = 10;
  enterFill.replaceChildren(...Array.from({ length: BLOCKS }, () => el('i')));
  const blocks = [...enterFill.children];

  let progress = 0, ready = false, entryVisible = false, entering = false;

  function paintProgress() {
    const p = Math.max(0, Math.min(1, progress));
    ready = p >= 1;
    enterBtn.disabled = !ready;
    enterBtn.classList.toggle('is-ready', ready);
    const lit = Math.floor(p * BLOCKS + 1e-6);
    blocks.forEach((b, i) => b.classList.toggle('on', i < lit));
    if (ready) {
      const t = coarse() ? WORDS.tap : WORDS.enter;
      if (enterLabel.textContent !== t) enterLabel.textContent = t;
      enterPct.textContent = '';
      enterBtn.setAttribute('aria-label', t);
      enterBtn.removeAttribute('aria-busy');
      if (entryVisible && enterStatus && !enterStatus.textContent) enterStatus.textContent = WORDS.ready;
      if (entryVisible && !enterBtn.__focused && !coarse()) {
        enterBtn.__focused = true;
        if (!document.activeElement || document.activeElement === document.body) enterBtn.focus({ preventScroll: true });
      }
    } else {
      const pct = Math.round(p * 100) + '%';
      enterLabel.textContent = '';
      enterPct.textContent = pct;
      enterBtn.setAttribute('aria-label', `${PT ? 'Entrar' : 'Enter'} · ${pct}`);
      enterBtn.setAttribute('aria-busy', 'true');
    }
  }

  function go() {
    if (!ready || entering || !entryVisible) return;
    entering = true;
    h.onEnter();
  }
  enterBtn.addEventListener('click', go);
  // The blink stops once the visitor reaches for the button.
  const calm = () => enterBtn.classList.add('is-calm');
  enterBtn.addEventListener('pointerenter', calm);
  // PRESS ENTER means it: Enter or Space anywhere on the title screen.
  document.addEventListener('keydown', (e) => {
    if (!entryVisible) return;
    if (e.key === 'Tab') { calm(); return; }
    if ((e.key !== 'Enter' && e.key !== ' ') || e.repeat || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t === enterBtn) return; // the button's own click does it
    if (t instanceof Element && t !== document.body && t.closest('a,button,input,textarea,select,[contenteditable="true"]')) return;
    if (!ready) return;
    e.preventDefault();
    go();
  });
  $('entry-resume').addEventListener('click', () => { if (!entering) { entering = true; h.onResumeAttentive(); } });

  function showEntry({ mode = 'attentive', title } = {}) {
    const shared = mode === 'shared';
    const titleEl = $('entry-title');
    if (shared) {
      const name = title || 'An exhibition';
      const big = el('span', 't-big');
      big.setAttribute('aria-hidden', 'true');
      big.appendChild(letters(name).frag);
      titleEl.replaceChildren(big);
      titleEl.setAttribute('aria-label', name);
      titleEl.classList.add('is-long');
    } else {
      const the = el('span', 't-the'), big = el('span', 't-big');
      the.setAttribute('aria-hidden', 'true');
      big.setAttribute('aria-hidden', 'true');
      const a = letters('The');
      the.appendChild(a.frag);
      big.appendChild(letters('Workshop', a.next).frag);
      titleEl.replaceChildren(the, big);
      titleEl.setAttribute('aria-label', 'The Workshop');
      titleEl.classList.remove('is-long');
    }
    const lede = $('entry-lede');
    lede.textContent = shared ? SHARED_LINE : WORDS.line;
    if (shared && PT) lede.lang = 'en'; else lede.removeAttribute('lang');
    $('entry-resume').hidden = !shared;
    const classic = $('entry-classic');
    if (classic) classic.hidden = shared;
    entry.classList.remove('is-hidden');
    entry.removeAttribute('inert');
    entry.removeAttribute('aria-hidden');
    hud.classList.add('is-hidden');
    hud.setAttribute('inert', '');
    entryVisible = true;
    entering = false;
    enterBtn.__focused = false;
    enterBtn.classList.remove('is-calm');
    if (enterStatus) enterStatus.textContent = '';
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
        labelTime.replaceChildren(document.createTextNode('Looked'), el('b', null, formatDuration(whole)));
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

  // ---------- controls strip, behind the "?" key ----------
  const keysBtn = $('keys-btn'), keys = $('keys');
  function setKeys(open) {
    if (!keysBtn || !keys) return;
    keys.hidden = !open;
    keysBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  keysBtn?.addEventListener('click', () => setKeys(keys.hidden));
  addEventListener('keydown', (e) => {
    if (e.key !== '?' || entryVisible || isOpen || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest('input,textarea,[contenteditable="true"]')) return;
    setKeys(keys.hidden);
  });

  // ---------- prompt: [KEY] VERB under the crosshair, teaching strip, or CLICK TO PLAY ----------
  function keyParts(box, seg) {
    const m = KEY.exec(seg.trim());
    if (!m) { box.append(el('span', null, say(seg.trim()))); return; }
    box.append(el('kbd', null, say(m[1].replace(/\s+/g, ''))));
    if (m[2]) box.append(el('span', null, say(m[2])));
  }
  function segments(box, text) {
    text.split(/\s+·\s+/).forEach((seg, i) => {
      if (i) box.append(el('span', 'dot', '·'));
      keyParts(box, seg);
    });
  }
  function hint(text) {
    if (!text) { hintEl.classList.remove('is-on'); return; }
    const box = el('span', 'in');
    const pre = /^(E|Tap|Click)\s+·\s+(.+)$/.exec(text);
    if (pre) {
      // A target under the crosshair: `[E] TALK` (or both verbs when there are two).
      hintEl.dataset.mode = 'cap';
      const rest = pre[2];
      if (rest.split(/\s+·\s+/).some(isKeySegment)) segments(box, rest);
      else { box.append(el('kbd', null, say(pre[1])), el('span', null, verbFor(rest))); }
      if (verbFor(rest) !== rest) box.append(el('span', 'sr-only', ` (${rest})`));
    } else if (/^click to play\b/i.test(text)) {
      hintEl.dataset.mode = 'centre';
      box.append(el('span', null, say(text.split(/\s+·\s+/)[0])));
    } else if (!/·/.test(text) && VERBS.some(([re]) => re.test(text))) {
      // Hovering a thing with a free mouse: the same grammar, at the foot of the screen.
      hintEl.dataset.mode = 'strip';
      box.append(el('kbd', null, say(coarse() ? 'Tap' : 'Click')), el('span', null, verbFor(text)));
      box.append(el('span', 'sr-only', ` (${text})`));
    } else {
      hintEl.dataset.mode = 'strip';
      segments(box, text);
    }
    hintEl.replaceChildren(box);
    hintEl.classList.add('is-on');
  }

  // ---------- toast: one plate, newest replaces, 2.4s ----------
  let toastTimer = 0;
  function toast(text, ms = 2400) {
    clearTimeout(toastTimer);
    if (!text) { toastEl.classList.remove('is-on'); return; }
    if (PLACE.test(text)) { place(text); return; }
    toastEl.textContent = say(text);
    toastEl.classList.add('is-on');
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), Math.min(Number(ms) || 2400, 2400));
  }

  // ---------- area name: top-centre marquee; once per area per 30s ----------
  // Arrivals still come in through toast(name); names shaped like the campus's
  // places are routed here until main.js calls place() directly.
  const PLACE = /^(?:The \p{Lu}[\p{L}’'-]+|Sala(?: de)? \p{Lu}[\p{L}’'-]+|Roof terrace|Studio|Arcade)$/u;
  const placeSeen = new Map();
  let placeTimer = 0;
  function place(name) {
    if (!name) { placeEl.classList.remove('is-on'); return; }
    const now = performance.now();
    if (placeSeen.has(name) && now - placeSeen.get(name) < 30000) return;
    placeSeen.set(name, now);
    clearTimeout(placeTimer);
    placeEl.textContent = name;
    placeEl.classList.add('is-on');
    placeTimer = setTimeout(() => placeEl.classList.remove('is-on'), 150 + 1800);
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
    $('exh-total').textContent = total >= 1 ? `${formatDuration(total)} looked` : (summary.shared ? '' : 'Look longer');

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
    setKeys(false);
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
    $('exh-band-note').textContent = items.length ? '' : 'Gathering…';
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
    flashCopied(ok ? 'Copied' : 'Press Ctrl+C');
  });
  linkInput.addEventListener('focus', () => linkInput.select());

  posterBtn.addEventListener('click', async () => {
    if (!lastSummary) return;
    posterBtn.setAttribute('aria-busy', 'true');
    const prev = posterBtn.textContent;
    posterBtn.textContent = 'Drawing…';
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
      posterBtn.textContent = 'No poster';
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

  // ---------------- sites and apps, inside the Workshop ----------------
  const appBox = $('app-overlay'), appFrame = $('app-frame'), appTitle = $('app-title'), appNew = $('app-newtab');
  const chooser = $('chooser'), chooserList = $('chooser-list'), chooserSecondary = $('chooser-secondary');
  let appReturn = null;
  function isExternal(url) { return /^https?:/i.test(url) && !url.startsWith(location.origin); }
  function openApp(url, title) {
    closeChooser(true);
    appReturn = document.activeElement;
    const href = new URL(url, location.href).href;
    appTitle.textContent = title || '';
    appFrame.title = title || 'Inside the Workshop';
    // Sites of the client's own projects run sandboxed; local apps are ours.
    if (isExternal(href)) appFrame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads');
    else appFrame.removeAttribute('sandbox');
    appFrame.src = href;
    appNew.href = href;
    appBox.classList.add('is-on');
    appBox.setAttribute('aria-hidden', 'false');
    handlers.onOverlay?.(true);
    $('app-close').focus({ preventScroll: true });
  }
  function closeApp() {
    if (!appBox.classList.contains('is-on')) return;
    appBox.classList.remove('is-on');
    appBox.setAttribute('aria-hidden', 'true');
    appFrame.src = 'about:blank';
    handlers.onOverlay?.(false);
    if (appReturn && appReturn.focus) appReturn.focus({ preventScroll: true });
  }
  $('app-close').addEventListener('click', closeApp);
  addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==appFrame.contentWindow||!appBox.classList.contains('is-on'))return;
    let url;try{url=new URL(appFrame.src);}catch{return;}
    if(url.origin!==location.origin||!url.pathname.endsWith('/assets/apps/amphi-reader.html'))return;
    if(event.data?.type==='workshop-reader-close')closeApp();
  });

  /** items: [{ label, detail, url, title } | { label, detail, run }]; secondary: same, shown small. */
  function openChooser({ eyebrow = 'On this screen', title = 'Choose what to show', items = [], secondary = [] }) {
    $('chooser-eyebrow').textContent = eyebrow;
    $('chooser-title').textContent = title;
    const make = (item, primary) => {
      const b = el('button');
      b.type = 'button';
      if (primary) { b.append(el('span', 't', item.label), el('span', 'd', item.detail || '')); }
      else b.textContent = item.label;
      b.addEventListener('click', () => {
        if (item.run) { closeChooser(); item.run(); }
        else if (item.newTab) { closeChooser(); window.open(item.url, '_blank', 'noopener'); }
        else openApp(item.url, item.title || item.label);
      });
      return b;
    };
    chooserList.replaceChildren(...items.map((it) => { const li = el('li'); li.append(make(it, true)); return li; }));
    chooserSecondary.replaceChildren(...secondary.map((it) => make(it, false)));
    chooser.classList.add('is-on');
    chooser.setAttribute('aria-hidden', 'false');
    handlers.onOverlay?.(true);
    const first = chooserList.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }
  function closeChooser(keepOverlay) {
    if (!chooser.classList.contains('is-on')) return;
    chooser.classList.remove('is-on');
    chooser.setAttribute('aria-hidden', 'true');
    if (!keepOverlay) handlers.onOverlay?.(false);
  }
  $('chooser-close').addEventListener('click', () => closeChooser());
  chooser.addEventListener('click', (e) => { if (e.target === chooser) closeChooser(); });
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (appBox.classList.contains('is-on')) { e.preventDefault(); closeApp(); }
    else if (chooser.classList.contains('is-on')) { e.preventDefault(); closeChooser(); }
    else if (keys && !keys.hidden) setKeys(false);
  });
  const isOverlayOpen = () => appBox.classList.contains('is-on') || chooser.classList.contains('is-on');

  return {
    showEntry, setProgress, hideEntry, setLabel, setPalette, hint, toast, place,
    openExhibition, closeExhibition, renderPoster, setSound,
    openApp, closeApp, openChooser, closeChooser, isOverlayOpen,
  };
}

// ======================= poster =======================
// Printed in the house style: paper, ink, a tangerine misregistration under
// the Bungee title, Silkscreen counters.
const PAPER = '#fff3d6', INK = '#1a1c2c', TANGERINE = '#ef7d57';
const INK_SOFT = 'rgba(26,28,44,.76)';
const DISPLAY = '"Bungee", Impact, "Arial Black", sans-serif';
const TEXT = '"Space Grotesk", system-ui, sans-serif';
const HUD = '"Silkscreen", ui-monospace, monospace';

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
    document.fonts.load(`400 96px "Bungee"`),
    document.fonts.load(`400 24px "Silkscreen"`),
    document.fonts.load(`500 24px "Space Grotesk"`),
    document.fonts.load(`600 24px "Space Grotesk"`),
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
  ctx.fillStyle = INK;
  ctx.font = `400 24px ${HUD}`;
  ctx.fillText('EXHIBITION', M, M + 18);

  // title: Bungee caps, shrinking to fit, with a tangerine offset print
  let size = 112, lines;
  const title = String(summary.title || 'Untitled').toUpperCase();
  for (; size >= 56; size -= 4) {
    ctx.font = `400 ${size}px ${DISPLAY}`;
    lines = wrapLines(ctx, title, CW - size * 0.06, 3);
    if (lines.length <= 2 || (lines.length === 3 && size <= 80)) {
      if (lines.every((l) => ctx.measureText(l).width <= CW - size * 0.06)) break;
    }
  }
  ctx.font = `400 ${size}px ${DISPLAY}`;
  const lh = size * 1.02;
  let y = M + 18 + 44 + size * 0.8;
  const off = Math.max(3, Math.round(size * 0.045));
  lines.forEach((l, i) => {
    ctx.fillStyle = TANGERINE;
    ctx.fillText(l, M + off, y + i * lh + off);
    ctx.fillStyle = INK;
    ctx.fillText(l, M, y + i * lh);
  });
  y += (lines.length - 1) * lh;

  // subtitle
  y += 56;
  ctx.fillStyle = INK_SOFT;
  ctx.font = `500 24px ${TEXT}`;
  ctx.fillText(fitText(ctx, subtitleFor(summary), CW), M, y);

  // palette band, framed like the catalogue's
  y += 34;
  const bandH = 48;
  const pal = (summary.palette || []).filter((p) => p.share > 0);
  if (pal.length) {
    ctx.fillStyle = INK;
    ctx.fillRect(M + 5, y + 5, CW, bandH);
    const tot = pal.reduce((a, p) => a + p.share, 0);
    let x = M;
    pal.forEach((p, i) => {
      const w = i === pal.length - 1 ? M + CW - x : Math.round(CW * p.share / tot);
      ctx.fillStyle = p.hex;
      ctx.fillRect(x, y, w, bandH);
      x += w;
    });
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.strokeRect(M + 1.5, y + 1.5, CW - 3, bandH - 3);
  } else {
    ctx.fillStyle = 'rgba(26,28,44,.2)';
    ctx.fillRect(M, y + bandH / 2, CW, 2);
  }
  y += bandH + 40;

  // grid
  const footTop = H - 170;
  const cols = 3, gap = 26;
  const rows = works.length > 3 ? 2 : 1;
  const cellW = (CW - gap * (cols - 1)) / cols;
  const capH = 48;
  const availH = footTop - 34 - y;
  const cellH = Math.min(cellW * 1.25, (availH - gap * (rows - 1) - capH * rows) / rows);
  works.forEach((item, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = M + col * (cellW + gap);
    const yy = y + row * (cellH + capH + gap);
    ctx.fillStyle = INK;
    ctx.fillRect(x + 5, yy + 5, cellW, cellH);
    ctx.fillStyle = '#efe2c4';
    ctx.fillRect(x, yy, cellW, cellH);
    if (imgs[i]) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x, yy, cellW, cellH); ctx.clip();
      drawCover(ctx, imgs[i], x, yy, cellW, cellH);
      ctx.restore();
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, yy + 1.5, cellW - 3, cellH - 3);
    const sec = Math.floor(item.seconds || 0);
    ctx.font = `400 24px ${HUD}`;
    const tw = sec >= 1 ? ctx.measureText(formatDuration(sec)).width : 0;
    if (sec >= 1) {
      ctx.fillStyle = INK;
      ctx.textAlign = 'right';
      ctx.fillText(formatDuration(sec), Math.round(x + cellW), Math.round(yy + cellH + 32));
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = INK;
    ctx.font = `600 21px ${TEXT}`;
    ctx.fillText(fitText(ctx, item.work.title || '', cellW - tw - 14), x, yy + cellH + 32);
  });

  // footer
  ctx.fillStyle = INK;
  ctx.fillRect(M, footTop, CW, 3);
  ctx.font = `400 32px ${DISPLAY}`;
  ctx.fillStyle = TANGERINE;
  ctx.fillText('THE WORKSHOP', M + 2, footTop + 62);
  ctx.fillStyle = INK;
  ctx.fillText('THE WORKSHOP', M, footTop + 60);
  if (summary.link) {
    ctx.font = `500 18px ${TEXT}`;
    ctx.fillStyle = INK_SOFT;
    const sigW = sig ? 110 : 0;
    ctx.fillText(ellipsizeMiddle(ctx, summary.link.replace(/^https?:\/\//, ''), CW - sigW - 20), M, footTop + 100);
  }
  if (sig) {
    const sh = 56, sw = sh * sig.naturalWidth / sig.naturalHeight;
    const o = document.createElement('canvas');
    o.width = Math.ceil(sw * 2); o.height = Math.ceil(sh * 2);
    const oc = o.getContext('2d');
    oc.drawImage(sig, 0, 0, o.width, o.height);
    oc.globalCompositeOperation = 'source-in';
    oc.fillStyle = INK;
    oc.fillRect(0, 0, o.width, o.height);
    ctx.drawImage(o, M + CW - sw, footTop + 26, sw, sh);
  }

  return await new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Poster could not be encoded'))), 'image/png');
  });
}
