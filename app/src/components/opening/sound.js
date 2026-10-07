// Opening sound effects, synthesised with the Web Audio API: no audio files to load.
// Browsers only allow audio after a user gesture, so `init()` is called from the
// Enter Praxio button (or the sound toggle).

const VOLUME = 0.55;

export class SoundBoard {
  constructor(muted = false) {
    this.muted = muted;
    this.ac = null;
  }

  init() {
    if (this.ac) {
      if (this.ac.state === 'suspended') this.ac.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = this.muted ? 0 : VOLUME;
      this.master.connect(this.ac.destination);
      const len = this.ac.sampleRate;
      const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch {
      this.ac = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : VOLUME;
  }

  close() {
    try { this.ac?.close(); } catch { /* already closed */ }
    this.ac = null;
  }

  env(g, t0, attack, peak, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, attack + 0.02));
  }

  tone(type, f0, f1, dur, peak, delay = 0) {
    const ac = this.ac;
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    this.env(g, t0, 0.005, peak, dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.1);
  }

  hiss(filter, f0, f1, dur, peak, { q = 1, delay = 0, attack = 0.005 } = {}) {
    const ac = this.ac;
    const t0 = ac.currentTime + delay;
    const s = ac.createBufferSource();
    const f = ac.createBiquadFilter();
    const g = ac.createGain();
    s.buffer = this.noise;
    s.loop = true;
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    this.env(g, t0, attack, peak, dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t0);
    s.stop(t0 + dur + 0.1);
  }

  play(name, a) {
    if (!this.ac || this.muted) return;
    switch (name) {
      case 'step': this.tone('sine', 120, 55, 0.12, 0.22); this.hiss('lowpass', 700, 250, 0.07, 0.05); break;
      case 'thud': this.tone('sine', a || 90, (a || 90) * 0.45, 0.22, 0.4); this.hiss('lowpass', 900, 200, 0.12, 0.12); break;
      case 'spring': this.tone('sine', 150, 60, 0.32, 0.32); this.tone('triangle', 200, 340, 0.2, 0.06, 0.06); break;
      case 'pop': this.tone('sine', a || 600, (a || 600) * 1.6, 0.09, 0.2); break;
      case 'tick': this.tone('triangle', a || 1800, a || 1800, 0.04, 0.05); break;
      case 'click': this.hiss('highpass', 3200, 3200, 0.02, 0.22); this.tone('square', 1400, 900, 0.025, 0.04); break;
      case 'buzz': this.tone('sawtooth', 110, 105, 0.07, 0.035); break;
      case 'bling': this.tone('sine', 1500, 2300, 0.1, 0.06); this.tone('sine', 2300, 2300, 0.2, 0.03, 0.08); break;
      case 'paper': this.hiss('bandpass', 1800, 900, 0.12, 0.16, { q: 0.8 }); break;
      case 'fwip': this.hiss('bandpass', 600, 2400, 0.3, 0.1, { q: 1.2, attack: 0.06 }); break;
      case 'chime': this.tone('sine', 880, 880, 0.6, 0.1); this.tone('sine', 1320, 1320, 0.8, 0.07, 0.1); break;
      case 'rush': this.hiss('bandpass', 250, 3200, 2.1, 0.22, { q: 0.9, attack: 1.5 }); this.tone('sine', 55, 110, 2.1, 0.1); break;
      case 'shimmer': this.tone('sine', 1760, 1760, 0.9, 0.06); this.tone('sine', 2637, 2637, 1.1, 0.04, 0.07); break;
      case 'boing': this.tone('sine', a, a * 1.7, 0.14, 0.14); break;
      case 'note': this.tone('triangle', a, a, 0.24, 0.11); this.tone('sine', a * 2, a * 2, 0.18, 0.035); break;
      case 'whistle': this.tone('sine', 480, 1300, 0.55, 0.07); break;
      case 'swish': this.hiss('highpass', 1800, 6000, 0.32, 0.07, { q: 0.7, attack: 0.07 }); break;
      case 'select': this.tone('triangle', 990, 1480, 0.09, 0.12); break;
      case 'enter': this.tone('sine', 330, 660, 0.18, 0.18); this.tone('sine', 660, 990, 0.3, 0.08, 0.1); break;
      default: break;
    }
  }
}
