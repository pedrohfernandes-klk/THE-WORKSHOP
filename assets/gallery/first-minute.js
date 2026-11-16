// The first minute: five short hints, each once per browser and only when it is useful. They say
// what can be done here (look, slap or talk, take the tram, fight, spend pride) and then get out of
// the way. Text is English; ui.toast translates it for Portuguese browsers (PT_SAY in ui.js).
const KEY = 'workshop.hints.v1';
export const FIRST_MINUTE_HINTS = Object.freeze({
  look: 'Walk up to a work to hear its story.',
  people: 'People here answer back: click to slap, E to talk.',
  tram: 'The tram waits at the east platform: get in and press PARTIR.',
  porrada: 'Hold Q next to someone for a proper porrada. BRIO is your breath in a fight.',
  pride: 'ORGULHO comes from missions and fights, and goes on intangible goods at the vending machine.',
});

export function createFirstMinute({ toast, storage = null, now = () => performance.now() / 1000, gap = 7, duration = 5200 } = {}) {
  let seen = {};
  try { seen = JSON.parse(storage?.getItem(KEY) || '{}') || {}; } catch { seen = {}; }
  const queue = [];
  let enteredAt = -1, outsideAt = -1, last = -Infinity;
  function want(id) {
    if (seen[id] || queue.includes(id)) return;
    queue.push(id);
  }
  function update({ entered = false, inHall = true, slaps = 0, busy = false } = {}) {
    if (!entered) return;
    const t = now();
    if (enteredAt < 0) enteredAt = t;
    if (t - enteredAt > 6) want('look');
    if (!inHall && outsideAt < 0) outsideAt = t;
    if (outsideAt >= 0) {
      if (t - outsideAt > 2) want('people');
      if (t - outsideAt > 25) want('tram');
      if (t - outsideAt > 55) want('pride');
    }
    if (slaps > 0) want('porrada');
    // One at a time, never over a fight, a dialogue or another hint.
    if (!queue.length || busy || t - last < gap) return;
    const id = queue.shift();
    seen[id] = 1; last = t;
    try { storage?.setItem(KEY, JSON.stringify(seen)); } catch { /* private mode: hints may repeat */ }
    toast(FIRST_MINUTE_HINTS[id], duration);
  }
  return { update, get pending() { return queue.slice(); } };
}
