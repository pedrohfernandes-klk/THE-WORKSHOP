// Explicit module-side reservation. Never wraps AudioContext constructors.
export function reserveModuleVoice(ctx, priority, foreground, seconds, destination, when = 0) {
  const audio = ctx.audio, ac = audio?.context;
  if (!ac || ac.state !== 'running' || audio.muted || ctx.scene?.userData?.questQuiet || typeof audio.acquireVoice !== 'function') return null;
  const ms = Math.ceil((Math.max(0, when - ac.currentTime) + Math.max(.02, seconds)) * 1000 + 60);
  const voice = audio.acquireVoice({ priority, foreground, ms });
  if (!voice) return null;
  try { voice.gain.connect(destination || audio.bus); } catch { voice.release(); return null; }
  return voice;
}
export function finishModuleVoice(voice, finalSource) {
  if (voice && finalSource) finalSource.addEventListener('ended', () => voice.release(), { once: true });
}

// A stolen token owns a 30ms fade. Do not retire it or disconnect its shared mix early.
export function releaseModuleVoices(voices, cleanup, immediate = false) {
  const held = voices.slice();
  let pending = 0;
  const finish = () => {
    for (let i = 0; i < held.length; i++) held[i]?.release();
    cleanup?.();
  };
  if (!immediate) for (let i = 0; i < held.length; i++) {
    const token = held[i];
    if (!token?.fading) continue;
    pending++;
    const previous = token.onRelease;
    token.onRelease = reason => {
      try { previous?.(reason); }
      finally { if (--pending === 0) finish(); }
    };
  }
  // Audio time can pause while wall time advances: await actual retirement,
  // not a wall-clock timeout that could truncate the remaining fade on resume.
  if (!pending) finish();
}
