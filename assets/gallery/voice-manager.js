// S: one admission ledger per shared AudioContext. Sources are created by callers.
// Production never wraps native factories. Optional factory auditing is TEST-only.
export function createVoiceManager(context, { test = false } = {}) {
  const slots = new Array(26).fill(null);
  const sourceOwners = new WeakMap();
  let serial = 0, stolen = 0, disposed = false, draining = false, collecting = false, duckUntil = 0, gapAt = 0;
  const audit = test ? installAudit(context, sourceOwners) : null;
  const audits = audit ? [audit] : [], registered = new WeakSet([context]);
  function registerContext(other) {
    if (!other || typeof other.createGain !== 'function') return false;
    if (!registered.has(other)) { registered.add(other); if (test) audits.push(installAudit(other, sourceOwners)); }
    return true;
  }
  const clampPriority = n => Math.max(0, Math.min(3, Number.isFinite(n) ? Math.floor(n) : 0));

  function retire(token, reason) {
    if (!token || token.released || slots[token.slot] !== token) return;
    token.released = true; token.active = false; token.fading = false;
    slots[token.slot] = null;
    for (let i = 0; i < token.sources.length; i++) {
      const source = token.sources[i];
      try { source.stop(token.context.currentTime); } catch { /* already ended */ }
      try { source.disconnect(); } catch { /* optional source */ }
    }
    try { token.gain.disconnect(); } catch { /* not connected */ }
    for (let i = 0; i < token.outputs.length; i++) try { token.outputs[i].disconnect(); } catch {}
    if (typeof token.onRelease === 'function') {
      try { token.onRelease(reason); } catch { /* one owner cannot break admission */ }
    }
  }

  function tick() {
    if (collecting || disposed) return;
    collecting = true;
    const now = context.currentTime;
    for (let i = 0; i < slots.length; i++) {
      const token = slots[i];
      if (!token) continue;
      if (token.fading && now >= token.fadeEnd) retire(token, 'stolen');
      else if (token.active && token.context.currentTime >= token.expires) retire(token, 'expired');
    }
    collecting = false;
  }

  function counts() {
    let voices = 0, foreground = 0, fading = 0;
    for (let i = 0; i < slots.length; i++) {
      const token = slots[i];
      if (token?.active) { voices++; if (token.foreground) foreground++; }
      else if (token?.fading) fading++;
    }
    return { voices, foreground, fading };
  }

  function fade(token) {
    const now = context.currentTime;
    token.active = false; token.fading = true; token.fadeEnd = now + 0.03;
    const audioNow = token.context.currentTime, audioEnd = audioNow + 0.03;
    fadeGain(token.gain.gain, audioNow, audioEnd);
    for (let i = 0; i < token.outputs.length; i++) fadeGain(token.outputs[i].gain, audioNow, audioEnd);
    for (let i = 0; i < token.sources.length; i++) {
      try { token.sources[i].stop(audioEnd); } catch { /* already ended */ }
    }
    stolen++;
  }

  function acquireVoice({ priority = 0, foreground = false, ms, sourceContext = context } = {}) {
    if (disposed || draining || !Number.isFinite(ms) || ms <= 0 || ms > 3600000) return null;
    if (!registerContext(sourceContext)) return null;
    tick();
    priority = clampPriority(priority); foreground = !!foreground;
    let voices = 0, fronts = 0, fades = 0, free = -1;
    for (let i = 0; i < slots.length; i++) {
      const token = slots[i];
      if (!token) { if (free < 0) free = i; continue; }
      if (token.active) { voices++; if (token.foreground) fronts++; }
      else if (token.fading) fades++;
    }
    const foregroundFull = foreground && fronts >= 6;
    if (free < 0) return null;
    if (voices >= 24 || foregroundFull) {
      if (fades >= 2) return null;
      let victim = null;
      for (let i = 0; i < slots.length; i++) {
        const candidate = slots[i];
        if (!candidate?.active || candidate.priority >= priority) continue;
        if (foregroundFull && !candidate.foreground) continue;
        // Oldest lower-priority admission, exactly as specified by the integrator.
        if (!victim || candidate.id < victim.id) victim = candidate;
      }
      if (!victim) return null;
      fade(victim);
    }
    const now = sourceContext.currentTime;
    const token = {
      context: sourceContext,
      id: ++serial, slot: free, priority, foreground, startAt: now,
      expires: now + ms / 1000, gain: sourceContext.createGain(), outputs: [], sources: [], ended: 0,
      active: true, fading: false, fadeEnd: 0, released: false, onRelease: null,
      addOutput(node) {
        if (!token.active || !node?.gain) return false;
        token.outputs.push(node);
        if (!token.foreground) applyDuck(node.gain, sourceContext.currentTime, sourceContext);
        return true;
      },
      track(source) {
        if (!source || token.released || !token.active) return false;
        if (token.sources.indexOf(source) >= 0) return true;
        const owner = sourceOwners.get(source);
        if (owner && owner !== token && !owner.released) return false;
        token.sources.push(source); sourceOwners.set(source, token);
        source.addEventListener('ended', () => {
          token.ended++;
          if (token.ended === token.sources.length) retire(token, token.fading ? 'stolen' : 'ended');
        }, { once: true });
        return true;
      },
      renew(durationMs) {
        if (!token.active || token.released || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 3600000) return false;
        if (sourceContext.currentTime >= token.expires) { retire(token, 'expired'); return false; }
        token.expires = sourceContext.currentTime + durationMs / 1000;
        return true;
      },
      release() { retire(token, 'released'); },
    };
    token.gain.gain.value = 1;
    if (!foreground) applyDuck(token.gain.gain, token.context.currentTime, token.context);
    slots[free] = token;
    return token;
  }

  function releaseVoice(token) { retire(token, 'released'); }
  function fadeGain(gain, now, end) {
    if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
    else { gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now); }
    gain.linearRampToValueAtTime(0, end);
  }
  function applyDuck(param, now, sourceContext = context) {
    const offset = context.currentTime - sourceContext.currentTime;
    const localUntil = duckUntil - offset, localGap = gapAt - offset;
    if (now >= localUntil) return;
    param.cancelScheduledValues(now);
    param.setValueAtTime(now >= localGap ? 0 : 0.2511886432, now);
    if (now < localGap) { param.setValueAtTime(0.2511886432, localGap); param.linearRampToValueAtTime(0, localGap + .005); }
    param.setValueAtTime(0, localUntil);
    param.linearRampToValueAtTime(1, localUntil + .08);
  }
  function preparePunchline() {
    const now = context.currentTime;
    gapAt = now + .25; duckUntil = now + .29;
    for (let i = 0; i < slots.length; i++) {
      const token = slots[i]; if (!token?.active || token.foreground) continue;
      applyDuck(token.gain.gain, token.context.currentTime, token.context);
      for (let j = 0; j < token.outputs.length; j++) applyDuck(token.outputs[j].gain, token.context.currentTime, token.context);
    }
    return .29;
  }
  function stopAll(reason = 'silence') {
    if (draining) return;
    draining = true;
    try { for (let i = 0; i < slots.length; i++) if (slots[i]) retire(slots[i], reason); }
    finally { draining = false; }
  }
  function stats() {
    tick();
    const c = counts();
    return { voices: c.voices, foreground: c.foreground, fading: c.fading, stolen,
      unmanaged: audit ? auditTotal() : 0 };
  }
  function auditTotal() { let total = 0; for (const a of audits) { const value = a.unmanaged(); if (value < 0) return -1; total += value; } return total; }
  function diagnostics() {
    if (!audit) return null;
    const result = audit.snapshot();
    for (let i = 1; i < audits.length; i++) { const part = audits[i].snapshot(); result.installed = result.installed && part.installed; for (const key of ['sources','managedSources','scheduled']) result[key] += part[key]; }
    result.unmanaged = auditTotal(); return result;
  }
  function dispose() { if (disposed) return; disposed = true; stopAll('dispose'); for (const a of audits) a.restore(); }
  return { registerContext, acquireVoice, releaseVoice, tick, stopAll, stats, diagnostics, preparePunchline, dispose };
}

function installAudit(context, owners) {
  const live = [], originals = [], wrappers = [];
  const names = ['createOscillator', 'createBufferSource'];
  let installed = true;
  function remove(record) {
    const index = live.indexOf(record);
    if (index >= 0) { live[index] = live[live.length - 1]; live.pop(); }
  }
  for (let i = 0; i < names.length; i++) {
    const name = names[i], original = context[name]; originals.push(original);
    const wrapper = function (...args) {
      const source = original.apply(context, args);
      const record = { source, start: Infinity, stop: Infinity, started: false };
      const start = source.start, stop = source.stop;
      source.start = function (when = 0, ...rest) {
        const result = start.call(source, when, ...rest);
        record.start = Math.max(context.currentTime, when || 0); record.started = true;
        live.push(record); return result;
      };
      source.stop = function (when = 0) {
        const result = stop.call(source, when);
        record.stop = Math.max(context.currentTime, when || 0); return result;
      };
      source.addEventListener('ended', () => remove(record), { once: true });
      return source;
    };
    wrappers.push(wrapper);
    try { context[name] = wrapper; if (context[name] !== wrapper) installed = false; }
    catch { installed = false; }
  }
  function unmanaged() {
    if (!installed) return -1; // explicitly unavailable, never a false zero
    const now = context.currentTime; let count = 0;
    for (let i = 0; i < live.length; i++) {
      const record = live[i];
      if (record.started && record.start <= now && record.stop > now && !owners.get(record.source)) count++;
    }
    return count;
  }
  function snapshot() {
    const now = context.currentTime; let sources = 0, managedSources = 0, scheduled = 0;
    for (let i = 0; i < live.length; i++) {
      const r = live[i]; if (r.start > now) { scheduled++; continue; }
      if (r.stop <= now) continue;
      sources++; if (owners.get(r.source)) managedSources++;
    }
    return { installed, sources, managedSources, unmanaged: unmanaged(), scheduled };
  }
  function restore() {
    for (let i = 0; i < names.length; i++) if (context[names[i]] === wrappers[i]) context[names[i]] = originals[i];
    live.length = 0;
  }
  return { unmanaged, snapshot, restore };
}
