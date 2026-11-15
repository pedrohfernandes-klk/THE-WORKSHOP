// Pure, deterministic lift state machine (no THREE). Driven by update(dt).
// States: 'idle' | 'opening' | 'open' | 'closing' | 'moving'.
export const LIFT_DEFAULTS = {
  levels: [0, 7.2],
  openTime: 1.2, closeTime: 1.4, holdTime: 6,
  vMax: 1.0, aMax: 0.6, jerk: 4.0,
  departDelay: 0.35, arriveDelay: 0.25,
};

// Jerk-limited S-curve travel profile (symmetric accel / cruise / decel).
export function makeProfile(dist, { vMax = 1, aMax = 0.6, jerk = 4 } = {}) {
  const dt = 0.001;
  const tj = aMax / jerk;
  const th = Math.max(0, vMax / aMax - tj); // constant-accel hold
  const Ta = 2 * tj + th;
  const n = Math.round(Ta / dt);
  const S = new Float64Array(n + 2);
  let v = 0, s = 0;
  const acc = (t) => (t < tj ? jerk * t : t < tj + th ? aMax : Math.max(0, aMax - jerk * (t - tj - th)));
  for (let i = 1; i <= n + 1; i++) { const t = (i - 0.5) * dt; v += acc(t) * dt; s += v * dt; S[i] = s; }
  const sAcc = (t) => { if (t <= 0) return 0; const f = Math.min(t / dt, n); const i = Math.floor(f); return S[i] + (S[i + 1] - S[i]) * (f - i); };
  const Sa = sAcc(Ta);
  const cruise = Math.max(0, (dist - 2 * Sa) / vMax);
  const total = 2 * Ta + cruise;
  const pos = (t) => {
    if (t <= 0) return 0; if (t >= total) return dist;
    if (t < Ta) return sAcc(t);
    if (t < Ta + cruise) return Sa + vMax * (t - Ta);
    return dist - sAcc(total - t);
  };
  return { total, pos };
}

export class LiftLogic {
  constructor(opts = {}) {
    this.o = { ...LIFT_DEFAULTS, ...opts };
    this.emit = opts.emit || null;
    this.level = 0;          // level the car is at / departed from
    this.carY = this.o.levels[0];
    this.state = 'idle';
    this.door = 0;           // 0 closed .. 1 open
    this.pending = this.o.levels.map(() => ({ call: false, go: false }));
    this.threshold = false;  // someone in the doorway
    this.inside = false;     // visitor in the car
    this.hold = 0; this.wait = 0;
    this.target = 0; this.travelT = 0; this.profile = null; this.fromY = 0; this.dir = 0;
    this.chimeArrive = false;
  }
  get doorLevel() { return (this.state === 'open' || this.state === 'opening') ? this.level : -1; }
  get publicState() { return this.state === 'arrived' ? 'moving' : this.state; }
  get moving() { return this.state === 'moving'; }
  isPending(l) { return this.pending[l].call || this.pending[l].go; }
  setOccupancy(threshold, inside) { this.threshold = !!threshold; this.inside = !!inside; }
  _ev(n) { if (this.emit) this.emit(n); }
  call(l) { this._request(l, 'call'); }
  go(l) { this._request(l, 'go'); }
  _request(l, kind) {
    if (!(l in this.pending) || !this.pending[l]) return;
    const atHere = l === this.level && this.state !== 'moving';
    if (atHere) {
      if (this.state === 'open') { this.hold = 0; return; }
      if (this.state === 'closing') { this.state = 'opening'; this._ev('doors-open'); return; }
      if (this.state === 'opening') return;
      this.pending[l][kind] = true; // idle: opens next tick
      return;
    }
    this.pending[l][kind] = true;
    if (kind === 'go' && this.state === 'open') this.hold = this.o.holdTime; // close promptly
  }
  _nextTarget() {
    // nearest pending level other than the current one
    let best = -1, bd = 1e9;
    for (let l = 0; l < this.pending.length; l++) if (l !== this.level && this.isPending(l)) {
      const d = Math.abs(this.o.levels[l] - this.o.levels[this.level]); if (d < bd) { bd = d; best = l; }
    }
    return best;
  }
  update(dt) {
    const o = this.o;
    switch (this.state) {
      case 'idle': {
        if (this.isPending(this.level)) { this._open(); break; }
        const t = this._nextTarget();
        if (t >= 0) { this.wait += dt; if (this.wait >= o.departDelay) this._depart(t); } else this.wait = 0;
        break;
      }
      case 'opening':
        this.door = Math.min(1, this.door + dt / o.openTime);
        if (this.door >= 1) { this.state = 'open'; this.hold = 0; }
        break;
      case 'open': {
        const p = this.pending[this.level]; p.call = false; p.go = false;
        if (this.threshold) this.hold = 0; else this.hold += dt;
        if (this.hold >= o.holdTime) { this.state = 'closing'; this._ev('doors-close'); }
        break;
      }
      case 'closing':
        if (this.threshold) { this.state = 'opening'; this._ev('doors-open'); break; }
        this.door = Math.max(0, this.door - dt / o.closeTime);
        if (this.door <= 0) { this.state = 'idle'; this.wait = 0; }
        break;
      case 'moving': {
        this.travelT += dt;
        const s = this.profile.pos(this.travelT);
        this.carY = this.fromY + this.dir * s;
        if (this.travelT >= this.profile.total) {
          this.carY = o.levels[this.target]; this.level = this.target; this.profile = null;
          this._ev('motor-stop');
          this.state = 'arrived'; this.wait = 0;
        }
        break;
      }
      case 'arrived':
        this.wait += dt;
        if (this.wait >= o.arriveDelay) { this._ev('chime'); this._open(); }
        break;
    }
  }
  _open() { this.state = 'opening'; this._ev('doors-open'); const p = this.pending[this.level]; p.call = false; p.go = false; }
  _depart(t) {
    this.target = t; this.fromY = this.o.levels[this.level]; this.dir = Math.sign(this.o.levels[t] - this.fromY);
    this.profile = makeProfile(Math.abs(this.o.levels[t] - this.fromY), this.o);
    this.travelT = 0; this.state = 'moving'; this._ev('motor-start');
  }
}
