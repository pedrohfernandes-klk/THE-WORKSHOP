export const WORKSHOP_FILM_SRC = 'assets/video/because-you-say-so.mp4';
export const WORKSHOP_FILM_RATES = Object.freeze([0.75, 1, 1.5]);

export function normaliseFilmRate(value) {
  const rate = Number(value);
  return WORKSHOP_FILM_RATES.includes(rate) ? rate : 1;
}

export function createWorkshopFilmController({ THREE, screens, onStateChange = () => {} }) {
  const video = document.createElement('video');
  video.id = 'workshopSharedFilm';
  video.src = WORKSHOP_FILM_SRC;
  video.preload = 'metadata';
  video.loop = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.volume = 1;
  video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-20px;top:-20px';
  document.body.appendChild(video);

  let texture = null;
  let active = false;
  let audible = false;
  const originals = new WeakMap();
  const state = () => ({ active, audible, paused: video.paused, rate: video.playbackRate, video });

  function ensureTexture() {
    if (!texture) {
      texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
    }
    return texture;
  }

  function applyTo(screen) {
    if (!active || !screen?.mesh?.material || screen.action === 'research') return;
    if (!originals.has(screen)) originals.set(screen, { material: screen.mesh.material, cssVisible: screen.css?.visible });
    screen.mesh.material = new THREE.MeshBasicMaterial({ map: ensureTexture(), toneMapped: false, side: THREE.DoubleSide });
    if (screen.css) screen.css.visible = false;
  }

  function restore(screen) {
    const previous = originals.get(screen);
    if (!previous) return;
    screen.mesh.material.dispose?.();
    screen.mesh.material = previous.material;
    if (screen.css) screen.css.visible = previous.cssVisible !== false;
    originals.delete(screen);
  }

  async function enable({ sound = true } = {}) {
    active = true;
    audible = !!sound;
    video.muted = !audible;
    screens.forEach(applyTo);
    try { await video.play(); } catch (_) {
      audible = false;
      video.muted = true;
      await video.play().catch(() => {});
    }
    onStateChange(state());
    return state();
  }

  function disable() {
    active = false;
    video.pause();
    screens.forEach(restore);
    onStateChange(state());
  }

  function togglePlayback() {
    if (!active) return enable({ sound: true });
    if (video.paused) return video.play().then(() => onStateChange(state())).catch(() => {});
    video.pause(); onStateChange(state());
  }

  function toggleSound() {
    audible = !audible;
    video.muted = !audible;
    if (audible && video.paused) video.play().catch(() => { audible = false; video.muted = true; });
    onStateChange(state());
  }

  function setRate(value) {
    video.playbackRate = normaliseFilmRate(value);
    try { localStorage.setItem('workshop:film-rate', String(video.playbackRate)); } catch (_) {}
    onStateChange(state());
  }

  try { video.playbackRate = normaliseFilmRate(localStorage.getItem('workshop:film-rate')); } catch (_) {}
  document.addEventListener('visibilitychange', () => { if (document.hidden && !video.paused) video.pause(); });
  return { video, state, enable, disable, applyTo, togglePlayback, toggleSound, setRate };
}
