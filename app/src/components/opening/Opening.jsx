import { Component } from 'react';
import { STAGES } from '../../lib/userContext.js';
import { SoundBoard } from './sound.js';
import { END, GATE_EXIT, clamp as cl, lerp as L, ease, layoutFor, walkX, WALK, milestones, HOP, hopStart, buildCues, cuesBetween } from './timeline.js';
import './opening.css';

// Cinematic opening: entry gate → a student walks in and opens a laptop → the camera
// moves through the screen → the screen *is* Praxio → a short journey → stage selection.
// One clock `t` drives everything; the laptop screen renders the real entry UI at full
// viewport size, scaled to the screen rect, so the hand-off has no cut.
//
// props: onContinue(stageId), onSignIn(), onExplore()

const THEME_KEY = 'praxio-theme';
const SHORT_LABEL = { undergraduate: 'Undergraduate', graduate_unemployed: 'Graduated, looking for work' };
const STAGE_CHIPS = STAGES.map((s) => ({ id: s.id, label: SHORT_LABEL[s.id] ?? s.label }));

const readSavedTheme = () => {
  try { const v = localStorage.getItem(THEME_KEY); return v === 'light' || v === 'dark' ? v : null; } catch { return null; }
};
const media = (q) => { try { return window.matchMedia(q); } catch { return null; } };

export default class Opening extends Component {
  constructor(props) {
    super(props);
    this.state = {
      t: GATE_EXIT, entered: false, gt: 0, muted: false,
      vw: window.innerWidth, vh: window.innerHeight, mx: 0, my: 0,
      theme: readSavedTheme(), sysDark: Boolean(media('(prefers-color-scheme: dark)')?.matches),
      rm: Boolean(media('(prefers-reduced-motion: reduce)')?.matches), stage: null,
    };
    this.sound = new SoundBoard(false);
    this.cues = [];
    this.tick = this.tick.bind(this);
    this.measure = this.measure.bind(this);
    this.onScheme = (e) => this.setState({ sysDark: e.matches });
  }

  componentDidMount() {
    window.addEventListener('resize', this.measure);
    this.mq = media('(prefers-color-scheme: dark)');
    this.mq?.addEventListener?.('change', this.onScheme);
    this.raf = requestAnimationFrame(this.tick);
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.measure);
    this.mq?.removeEventListener?.('change', this.onScheme);
    this.sound.close();
  }

  measure() {
    this.setState({ vw: window.innerWidth, vh: window.innerHeight });
  }

  tick(now) {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    const { entered, gt, t } = this.state;
    const held = this.wheelAt && now - this.wheelAt < 1200;
    if (!entered) {
      if (gt < 3) this.setState({ gt: gt + dt });
    } else if (!held && t < END) {
      const nt = Math.min(END, t + dt);
      for (const c of cuesBetween(this.cues, t, nt)) this.sound.play(c.name, c.arg);
      this.setState({ t: nt });
    }
    this.raf = requestAnimationFrame(this.tick);
  }

  scrub(d) {
    const { entered, t } = this.state;
    if (!entered || t < 0 || t >= END) return;
    this.wheelAt = performance.now();
    this.setState({ t: cl(t + d, 0, END) });
  }

  enter = () => {
    this.sound.init();
    this.cues = buildCues(this.state.vw, this.state.vh);
    this.sound.play('enter');
    this.setState({ entered: true, t: GATE_EXIT });
  };

  replay = () => {
    this.sound.init();
    this.cues = buildCues(this.state.vw, this.state.vh);
    this.wheelAt = 0;
    this.setState({ t: 0, stage: null });
  };

  skip = () => this.setState({ t: END });

  toggleSound = () => {
    this.sound.init();
    const muted = !this.state.muted;
    this.sound.setMuted(muted);
    this.setState({ muted });
    if (!muted) this.sound.play('pop', 700);
  };

  flipTheme = (dark) => {
    const next = dark ? 'light' : 'dark';
    this.sound.play('click');
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage unavailable */ }
    this.setState({ theme: next });
  };

  pickStage = (id) => {
    this.sound.play('select');
    this.setState({ stage: id });
  };

  onWheel = (e) => this.scrub(e.deltaY * 0.004);
  onTouchStart = (e) => { this.ty = e.touches[0].clientY; };
  onTouchMove = (e) => { const y = e.touches[0].clientY; this.scrub((this.ty - y) * 0.012); this.ty = y; };
  onMouseMove = (e) => {
    if (this.state.t > 11.1) return;
    this.setState({ mx: (e.clientX / this.state.vw) * 2 - 1, my: (e.clientY / this.state.vh) * 2 - 1 });
  };

  // Everything below is a pure function of state: one frame of the film.
  frame() {
    const { t, vw, vh, rm, mx, my, entered, gt } = this.state;
    const PI = Math.PI;
    const seg = (a, b) => cl((t - a) / (b - a));
    const { io, eo, ei, bo, bi, el } = ease;
    const R = (k) => (rm ? (k >= 0.5 ? 1 : 0) : k);
    const S = (a, b, f) => (rm ? (t >= (a + b) / 2 ? 1 : 0) : (f || io)(seg(a, b)));
    const settle = (t0, amp, freq, decay) => (rm || t < t0 ? 0 : amp * Math.exp(-decay * (t - t0)) * Math.sin(freq * (t - t0)));
    const done = t >= END;

    const { portrait, P } = layoutFor(vw, vh);
    const fit = Math.min(vw / P.WW, vh / P.WH);
    const asp = cl(vh / vw, 0.56, 0.78);
    const sw = P.sw, sh = sw * asp, lidW = sw + 12, lidH = sh + 14;
    const hingeY = P.deskTop - 12, scx = P.deskX, scy = hingeY - 8 - sh / 2;

    // lights on
    let lampOn = 0;
    if (rm) lampOn = t >= 1.6 ? 1 : 0;
    else if (t >= 1.9) lampOn = 1;
    else if (t >= 1.82) lampOn = 0.25;
    else if (t >= 1.76) lampOn = 1;
    else if (t >= 1.68) lampOn = 0;
    else if (t >= 1.6) lampOn = 1;
    const deskK = S(0.3, 1.05, el);

    // the student
    const wk = seg(WALK.start, WALK.end);
    const fx = rm ? (t >= WALK.start ? P.stopX : P.startX) : walkX(t, P);
    const amp = rm || t < WALK.start || wk >= 1 ? 0 : cl((1 - wk) * 2.6);
    const ph = fx * 0.045;
    const sn = Math.sin(ph);
    const bob = 9 * amp * Math.abs(Math.cos(ph));
    const sq = 0.04 * amp * Math.pow(Math.abs(sn), 4);
    const reachB = rm ? 0 : Math.sin(PI * seg(5.95, 6.7));
    const reachL = rm ? 0 : Math.sin(PI * seg(6.7, 7.5));
    const g = rm ? 0 : Math.min(io(seg(5.05, 5.3)), 1 - io(seg(5.8, 6.05)));
    const blink = [3.4, 5.5, 6.9, 9.3].some((b) => Math.abs(t - b) < 0.07);
    const figTop = P.floor - 384 - bob;
    const fig = {
      left: fx, top: figTop,
      lean: 3 * amp + settle(5.0, 8, 13, 5) + (rm ? 0 : 5 * Math.sin(PI * seg(8.3, 8.9))), sx: 1 + sq, sy: 1 - sq,
      hipF: 28 * amp * sn, hipB: -28 * amp * sn,
      kneeF: 36 * amp * Math.max(0, -Math.sin(ph - 0.9)), kneeB: 36 * amp * Math.max(0, Math.sin(ph - 0.9)),
      armF: 4 * amp * sn - 36 * reachB, armB: -22 * amp * sn - 60 * reachL, elbB: -12 - 22 * reachL,
      shX: fx + 6, shK: 1 - 0.15 * amp * Math.abs(Math.cos(ph)),
      headRot: -7 * g + (rm ? 0 : 2 * amp * Math.sin(ph * 2)), faceX: -4 * g,
      eyeRy: blink ? 0.5 : 4.3, eyeRyFar: blink ? 0.5 : 3.8, browY: 41 - 3 * g, browY2: 40 - 4 * g,
      smile: `M85 63 Q91 ${66 + 3 * g} 97 63`,
      glow: (rm ? 0 : seg(8.1, 8.4)) * (1 - S(8.8, 10.2)) * 0.28,
    };
    const kb = S(6.1, 6.6);
    const bsq = Math.abs(settle(6.6, 0.18, 30, 12));
    const bk = {
      left: L(fx + 78, P.deskX - P.deskW / 2 + 34, kb),
      top: L(figTop + 112, P.deskTop - 44, kb) - (rm ? 0 : Math.sin(PI * kb) * 50),
      rot: 3 * amp * Math.sin(ph + 0.8) * (1 - kb) + settle(6.6, 5, 24, 7), topRot: settle(6.6, -12, 20, 5), sx: 1 + bsq, sy: 1 - bsq,
    };
    const kl = S(6.8, 7.4);
    const lap = {
      left: L(fx + 68, P.deskX - 126, kl), top: L(figTop + 180, hingeY, kl) - (rm ? 0 : Math.sin(PI * kl) * 40),
      w: L(15, 252, kl), h: L(122, 12, kl), sx: 1 + Math.abs(settle(7.4, 0.08, 30, 12)), sy: 1 - Math.abs(settle(7.4, 0.3, 30, 12)),
    };

    // camera
    const z0 = Math.max(0.2, 1 + 0.06 * io(seg(0, 8.3)) - (rm ? 0 : 0.07 * Math.sin(PI * seg(8.3, 8.85))));
    const drift = io(seg(4.5, 8.8)) * 0.3;
    const c0x = L(P.WW / 2, scx, drift), c0y = L(P.WH / 2, scy, drift);
    const e = S(8.8, 11), ec = S(8.8, 10.6);
    const zEnd = vw / (sw * fit);
    const z = z0 * Math.pow(zEnd / z0, e);
    const cx = L(c0x, scx, ec), cy = L(c0y, scy, ec);
    const par = 1 - e;
    const ox = vw / 2 - mx * 16 * par, oy = vh / 2 - my * 9 * par;
    const sc = fit * z;
    const rot = rm ? 0 : -4 * Math.sin(PI * e);
    const lampL = P.deskX + P.deskW / 2 - 118, lampT = P.deskTop - 170;
    const w = {
      tf: `translate(${ox}px, ${oy}px) rotate(${rot}deg) scale(${sc}) translate(${-cx}px, ${-cy}px)`,
      blur: rm ? 0 : 12 * ei(seg(9.9, 11)),
      deskK, deskSX: 1 + (1 - deskK) * 0.25, deskSh: cl(deskK, 0, 1.2),
      lampK: S(1.0, 1.5, bo), lampOn, plantK: S(1.2, 1.7, bo), dimO: 1 - 0.85 * lampOn,
      lampL, lampT, lidK: S(7.4, 7.95, bo),
    };

    // the screen, locked to the camera
    const rw = sw * sc, rh = sh * sc;
    const vx = (scx - cx) * sc, vy = (scy - cy) * sc;
    const cr = Math.cos((rot * PI) / 180), sr = Math.sin((rot * PI) / 180);
    const ccx = ox + vx * cr - vy * sr, ccy = oy + vx * sr + vy * cr;
    const bl = S(10.6, 11);
    const ow = L(rw, vw, bl), oh = L(rh, vh, bl);
    const pX = R(seg(7.95, 8.08)), pY = R(seg(8.08, 8.3));
    const o = {
      x: L(ccx - rw / 2, 0, bl), y: L(ccy - rh / 2, 0, bl), w: ow, h: oh, s: ow / vw, r: L(5 * sc, 0, bl), rot: rot * (1 - bl),
      ix: ((1 - pX) * ow) / 2, iy: (1 - pY) * Math.max(0, oh / 2 - 1), px: mx * 10 * par, py: my * 6 * par,
      sheenX: L(-150, 600, seg(10, 10.9)), sheenO: rm ? 0 : t > 10 && t < 10.9 ? 1 : 0,
    };
    const sk = seg(9.7, 10.9);
    const streakO = rm ? 0 : Math.sin(PI * sk) * 0.3;
    const streaks = Array.from({ length: 12 }, (_, i) => {
      const r = (sk * 2.2 + ((i * 0.37) % 1)) % 1;
      return { a: i * 30 + 8, d: 80 + r * Math.max(vw, vh) * 0.6, len: 30 + r * 170, o: streakO * (1 - r) };
    });

    // inside Praxio
    const padX = portrait ? 20 : 40;
    const word = (text, t0, i, outT, ser) => {
      const k = rm ? (t >= t0 ? 1 : 0) : seg(t0 + i * 0.09, t0 + i * 0.09 + 0.55);
      const kk = rm ? k : bo(k);
      const out = outT ? cl(S(outT + i * 0.05, outT + i * 0.05 + 0.4, bi)) : 0;
      return { text, ser, y: (1 - kk) * 70 - out * 140, s: 0.6 + 0.4 * kk, r: (1 - k) * -10, o: Math.min(1, k * 2.5) * (1 - out) };
    };
    const shrink = S(17.3, 18);
    const wmSize = L(portrait ? vw * 0.22 : Math.min(vw * 0.15, 220), 22, shrink);
    const wmTop = L(vh * (portrait ? 0.12 : 0.13), 35, shrink);
    const wmX = L(padX, padX + 24, shrink);
    const stSize = portrait ? vw * 0.1 : Math.min(vw * 0.066, 104);
    const r1 = vh * (portrait ? 0.48 : 0.52);
    const B = portrait
      ? [[-20, vh * 0.84], [vw * 0.2, vh * 0.98], [vw * 0.65, vh * 0.55], [vw + 20, vh * 0.5]]
      : [[-40, vh * 0.82], [vw * 0.28, vh * 1.02], [vw * 0.52, vh * 0.42], [vw + 40, vh * 0.4]];
    const bez = (u) => {
      const a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
      return [a * B[0][0] + b * B[1][0] + c * B[2][0] + d * B[3][0], a * B[0][1] + b * B[1][1] + c * B[2][1] + d * B[3][1]];
    };
    const labels = milestones(portrait);
    const nM = labels.length;
    const uStart = 0.03, uEnd = portrait ? 0.8 : 0.85;
    const us = labels.map((_, i) => 0.12 + (i * (uEnd - 0.12)) / (nM - 1));
    const hd = HOP.duration, hs = hopStart(nM);
    let u = uStart, hopY = 0, inAir = 0, lastLand = -1;
    if (rm) u = t >= hs ? us[nM - 1] : uStart;
    else if (t >= hs + nM * hd) { u = us[nM - 1]; lastLand = hs + nM * hd; }
    else if (t >= hs) {
      const i = Math.floor((t - hs) / hd), h = (t - hs - i * hd) / hd;
      u = L(i === 0 ? uStart : us[i - 1], us[i], io(h));
      inAir = Math.sin(PI * h);
      hopY = -inAir * (portrait ? 40 : 56);
      lastLand = i === 0 ? -1 : hs + i * hd;
    }
    const mp = bez(u);
    const landSq = lastLand > 0 && !rm ? 0.32 * Math.exp(-14 * (t - lastLand)) : 0;
    const collapse = S(16.5, 16.85, bi);
    const marks = labels.map((label, i) => {
      const p = bez(us[i]);
      const tl = hs + (i + 1) * hd;
      const landed = t >= tl;
      const pk = rm ? 0 : seg(tl, tl + 0.45);
      const rk = rm ? 1 : seg(tl, tl + 0.7);
      const appear = S(13.6 + i * 0.08, 14.05 + i * 0.08, bo);
      return {
        label, x: p[0], y: p[1], landed,
        k: Math.max(0, appear * (1 - collapse)) * (1 + 0.7 * Math.sin(PI * pk) * (1 - pk)),
        ring: 1 + 2.4 * rk, ringO: landed ? (1 - rk) * (1 - collapse) : 0,
      };
    });
    const erase = S(16.8, 17.5);
    const path = `M${B[0][0]} ${B[0][1]} C${B[1][0]} ${B[1][1]}, ${B[2][0]} ${B[2][1]}, ${B[3][0]} ${B[3][1]}`;
    const baseDash = `0 ${erase} ${Math.max(0, S(13.3, 14.1) - erase)} 2`;
    const trailDash = `0 ${erase} ${Math.max(0, (t < hs ? 0 : u) - erase)} 2`;
    const mo = S(16.4, 16.75);
    const appearM = S(hs - 0.35, hs, bo);
    const mLeg = 26 * inAir;
    const m = {
      left: mp[0] - 13, top: mp[1] - 56 + hopY,
      sx: appearM * (1 - mo) * (1 + landSq - 0.08 * inAir), sy: appearM * (1 - mo) * (1 - landSq + 0.14 * inAir),
      show: t >= hs - 0.35, legF: mLeg, legB: -mLeg * 0.6, arm: -70 * inAir,
    };
    const dk = S(16.45, 16.8, bo);
    const fk = S(16.8, 17.4);
    const dockX = vw - padX - 30, dockY = 46;
    const nSize = L(52, 40, fk) * dk;
    const ncx = L(mp[0], dockX, fk), ncy = L(mp[1] - 28, dockY, fk) - (rm ? 0 : Math.sin(PI * fk) * 200);
    const landD = settle(17.4, 0.35, 18, 8);
    const flying = fk > 0 && fk < 1 ? 0.1 : 0;
    const n = { left: ncx - nSize / 2, top: ncy - nSize / 2, size: nSize, txt: dk > 0.7, sx: 1 + landD + flying, sy: 1 - landD - flying };

    const hSize = portrait ? vw * 0.12 : Math.min(vw * 0.074, 116);
    const hRow = hSize * 1.08;
    const qTop = portrait ? 120 : 150;
    const h1 = qTop + 34, h2 = h1 + hRow;
    const subTop = h2 + hRow + 18;
    const gTop = subTop + (portrait ? 100 : 72);
    const chips = STAGE_CHIPS.map((c, i) => {
      const k = rm ? (t >= 18.5 ? 1 : 0) : seg(18.5 + i * 0.06, 19 + i * 0.06);
      const kk = rm ? k : bo(k);
      return { ...c, o: Math.min(1, k * 2.5), y: (1 - kk) * 26, s: 0.7 + 0.3 * kk };
    });
    const contTop = gTop + (portrait ? 360 : 150);
    const s = {
      innerH: Math.max(vh, contTop + 120), padX, wmX, wmTop, wmSize, stSize, rowH: stSize * 1.12, r1, r2: r1 + stSize * 1.08,
      A1: -115 * S(11.2, 11.6), A2: -115 * S(11.28, 11.68),
      B1: [word('Your', 11.5, 0, 13.2), word('career', 11.5, 1, 13.2)],
      B2: [word("isn't", 11.75, 0, 13.3), word('a', 11.75, 1, 13.3), word('guess.', 11.75, 2.4, 13.3, true)],
      navClip: 100 * (1 - S(17.4, 18, eo)), navShow: t >= 17.4,
      qTop, qO: S(17.9, 18.2), qY: 10 * (1 - S(17.9, 18.2)), hSize, h1, h2,
      E1: [word("Let's", 18, 0), word('start', 18, 1)], E2: [word('where you are.', 18.2, 0, 0, true)],
      subTop, subO: S(18.4, 18.8), subY: 12 * (1 - S(18.4, 18.8)), gTop, chips, contTop, contO: S(19, 19.4),
    };

    // entry gate
    const gk = entered ? (rm ? (t >= -0.35 ? 1 : 0) : io(cl((t - GATE_EXIT) / 0.6))) : 0;
    const gIn = (a, b) => (rm ? 1 : cl((gt - a) / (b - a)));
    const gw = (text, t0, i, accent) => {
      const k = gIn(t0 + i * 0.07, t0 + i * 0.07 + 0.5);
      const b = rm ? 1 : bo(k);
      return { text, accent, y: (1 - b) * 60, s: 0.6 + 0.4 * b, r: (1 - k) * -8, o: Math.min(1, k * 2.5) };
    };
    const gate = {
      show: !entered || t < 0, o: 1 - gk, y: -50 * gk, s: 1 - 0.06 * gk,
      hSize: portrait ? vw * 0.105 : Math.min(vw * 0.06, 92), subSize: portrait ? 17 : 21, orb: Math.max(vw, vh) * 1.1,
      L1: ["DON'T", 'JUST', 'CHOOSE', 'A', 'PATH.'].map((x, i) => gw(x, 0.2, i)),
      L2: ['EXPERIENCE', 'IT.'].map((x, i) => gw(x, 0.7, i * 1.6, true)),
      subO: gIn(1.1, 1.6), subY: 14 * (1 - gIn(1.1, 1.6)),
      btnK: rm ? 1 : bo(gIn(1.35, 1.85)), btnO: gIn(1.35, 1.6), sndO: gIn(1.7, 2.1),
    };

    return {
      P, portrait, done, fig, bk, lap, w, o, streaks, s, marks, path, baseDash, trailDash, m, n, gate,
      lidW, lidH, hingeY, scx, lampL, lampT,
      showWorld: t < 11.05, showLid: t >= 7.4, showScreen: t >= 7.95, showStreaks: !rm && t > 9.7 && t < 10.9,
      showSkip: entered && t >= 0 && !done, showHint: entered && t >= 0 && t < 8.8,
    };
  }

  renderWords(list) {
    return list.map((x) => (
      <span
        key={x.text}
        className={x.ser ? 'ser' : undefined}
        style={{ display: 'inline-block', color: x.ser || x.accent ? 'var(--accent)' : 'var(--text)', opacity: x.o, transform: `translateY(${x.y}%) scale(${x.s}) rotate(${x.r}deg)`, transformOrigin: '50% 100%' }}
      >
        {x.text}
      </span>
    ));
  }

  render() {
    const { vw, vh, rm, muted, stage, theme, sysDark } = this.state;
    const dark = (theme ?? (sysDark ? 'dark' : 'light')) === 'dark';
    const f = this.frame();
    const { P, fig, bk, lap, w, o, s, m, n, gate } = f;
    const abs = { position: 'absolute' };
    const picked = STAGE_CHIPS.find((c) => c.id === stage);
    const { onContinue, onSignIn, onExplore } = this.props;

    const soundIcon = muted ? (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M2 6h2.5L8 3v10L4.5 10H2z" /><path d="M11 6l4 4M15 6l-4 4" /></svg>
    ) : (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M2 6h2.5L8 3v10L4.5 10H2z" /><path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6.3 6.3 0 0 1 0 9" /></svg>
    );

    return (
      <div
        className={`pxo${dark ? ' dark' : ''}${rm ? ' rm' : ''}`}
        onWheel={this.onWheel}
        onMouseMove={this.onMouseMove}
        onTouchStart={this.onTouchStart}
        onTouchMove={this.onTouchMove}
      >
        {/* ================= THE ROOM ================= */}
        {f.showWorld && (
          <div aria-hidden="true" className="tr" style={{ ...abs, left: 0, top: 0, width: P.WW, height: P.WH, transformOrigin: '0 0', transform: w.tf, filter: `blur(${w.blur}px)`, willChange: 'transform' }}>
            <div style={{ ...abs, left: P.deskX - 450, top: P.deskTop - 520, width: 900, height: 900, borderRadius: '50%', background: 'radial-gradient(closest-side, var(--pool), transparent)' }} />
            <div style={{ ...abs, left: -2000, top: P.floor, width: 6000, height: 900, background: 'linear-gradient(180deg, var(--surface-2), var(--bg) 60%)' }} />

            {/* plant */}
            <div style={{ ...abs, left: P.deskX + P.deskW / 2 + 36, top: P.floor - 118, width: 80, height: 120, transform: `scale(${w.plantK})`, transformOrigin: '50% 100%' }}>
              <svg width="80" height="120" viewBox="0 0 80 120" style={{ display: 'block', overflow: 'visible' }}>
                <g className="sway">
                  <ellipse cx="30" cy="44" rx="11" ry="28" transform="rotate(-24 30 44)" style={{ fill: 'var(--leaf-2)' }} />
                  <ellipse cx="52" cy="40" rx="11" ry="30" transform="rotate(22 52 40)" style={{ fill: 'var(--leaf)' }} />
                  <ellipse cx="41" cy="30" rx="10" ry="30" style={{ fill: 'var(--leaf)' }} />
                </g>
                <path d="M18 72 L62 72 L56 116 C55 119 52 120 49 120 L31 120 C28 120 25 119 24 116 Z" style={{ fill: 'var(--pot)' }} />
                <rect x="14" y="68" width="52" height="10" rx="5" style={{ fill: 'var(--pot)' }} />
              </svg>
            </div>

            {/* desk */}
            <div style={{ ...abs, left: P.deskX - P.deskW / 2, top: P.floor - 9, width: P.deskW, height: 20, borderRadius: '50%', background: 'radial-gradient(closest-side, var(--contact), transparent)', transform: `scaleX(${w.deskSh})` }} />
            <div style={{ ...abs, left: P.deskX - P.deskW / 2, top: P.deskTop, width: P.deskW, height: P.floor - P.deskTop, transform: `scale(${w.deskSX}, ${w.deskK})`, transformOrigin: '50% 100%' }}>
              <div style={{ ...abs, left: 30, top: 12, width: 12, height: P.floor - P.deskTop - 12, borderRadius: 6, background: 'var(--desk-leg)' }} />
              <div style={{ ...abs, right: 30, top: 12, width: 12, height: P.floor - P.deskTop - 12, borderRadius: 6, background: 'var(--desk-leg)' }} />
              <div style={{ ...abs, left: 0, top: 0, width: '100%', height: 20, borderRadius: 10, background: 'var(--desk)' }} />
            </div>

            {/* lamp */}
            <div style={{ ...abs, left: f.lampL, top: f.lampT, width: 120, height: 172, transform: `scale(${w.lampK})`, transformOrigin: '50% 100%' }}>
              <svg width="120" height="172" viewBox="0 0 120 172" style={{ display: 'block', overflow: 'visible' }}>
                <ellipse cx="70" cy="166" rx="30" ry="7" style={{ fill: 'var(--lamp)' }} />
                <path d="M70 162 L80 96 L36 46" className="limb" style={{ stroke: 'var(--lamp)', strokeWidth: 8 }} />
                <circle cx="80" cy="96" r="7" style={{ fill: 'var(--lamp)' }} />
                <path d="M14 40 C14 28 44 18 52 30 L58 52 C50 62 24 70 18 62 Z" style={{ fill: 'var(--lamp)' }} />
                <circle cx="24" cy="60" r="7" style={{ fill: '#FFD08A', opacity: w.lampOn }} />
              </svg>
            </div>

            {/* laptop lid + body */}
            {f.showLid && (
              <div className="tr" style={{ ...abs, left: f.scx - f.lidW / 2, top: f.hingeY - f.lidH, width: f.lidW, height: f.lidH, borderRadius: '12px 12px 3px 3px', background: 'var(--device-2)', transform: `scaleY(${w.lidK})`, transformOrigin: '50% 100%' }}>
                <div style={{ ...abs, inset: '6px 6px 8px', borderRadius: 7, background: 'var(--screen)' }} />
              </div>
            )}
            <div className="tr" style={{ ...abs, left: lap.left, top: lap.top, width: lap.w, height: lap.h, borderRadius: 7, background: 'var(--device)', transform: `scale(${lap.sx}, ${lap.sy})`, transformOrigin: '50% 100%' }} />

            {/* student */}
            <div style={{ ...abs, left: fig.shX, top: P.floor - 8, width: 140, height: 18, borderRadius: '50%', background: 'radial-gradient(closest-side, var(--contact), transparent)', transform: `scaleX(${fig.shK})` }} />
            <div className="tr" style={{ ...abs, left: fig.left, top: fig.top, width: 150, height: 390, transform: `rotate(${fig.lean}deg) scale(${fig.sx}, ${fig.sy})`, transformOrigin: '50% 100%' }}>
              <Student fig={fig} />
            </div>

            {/* books */}
            <div className="tr" style={{ ...abs, left: bk.left, top: bk.top, width: 66, height: 44, transform: `rotate(${bk.rot}deg) scale(${bk.sx}, ${bk.sy})`, transformOrigin: '50% 100%' }}>
              <div style={{ ...abs, left: 7, top: 0, width: 54, height: 12, borderRadius: 4, background: 'var(--book1)', transform: `rotate(${bk.topRot}deg)`, transformOrigin: '20% 100%' }} />
              <div style={{ ...abs, left: 0, top: 13, width: 64, height: 14, borderRadius: 4, background: 'var(--book2)' }} />
              <div style={{ ...abs, left: 3, top: 28, width: 60, height: 16, borderRadius: 4, background: 'var(--book3)' }} />
            </div>

            {/* light: dim until the lamp clicks on */}
            <div style={{ ...abs, left: -2000, top: -2000, width: 6000, height: 6000, background: 'var(--dim)', opacity: w.dimO }} />
            <div style={{ ...abs, left: f.lampL - 225, top: f.lampT + 52, width: 270, height: P.deskTop - f.lampT - 46, background: 'linear-gradient(180deg, var(--lamp-light), transparent 96%)', clipPath: 'polygon(84% 0, 94% 0, 100% 100%, 4% 100%)', opacity: w.lampOn }} />
            <div style={{ ...abs, left: f.lampL - 220, top: P.deskTop - 14, width: 280, height: 30, borderRadius: '50%', background: 'radial-gradient(closest-side, var(--lamp-light), transparent)', opacity: w.lampOn }} />
          </div>
        )}

        {/* speed streaks */}
        {f.showStreaks && (
          <div aria-hidden="true" style={{ ...abs, inset: 0, pointerEvents: 'none' }}>
            {f.streaks.map((k, i) => (
              <div key={i} style={{ ...abs, left: vw / 2, top: vh / 2, width: k.len, height: 3, borderRadius: 2, background: 'var(--text)', opacity: k.o, transform: `rotate(${k.a}deg) translateX(${k.d}px)`, transformOrigin: '0 50%' }} />
            ))}
          </div>
        )}

        {/* ================= THE SCREEN = THE SITE ================= */}
        {f.showScreen && (
          <div className="tr" style={{ ...abs, left: o.x, top: o.y, width: o.w, height: o.h, borderRadius: o.r, transform: `rotate(${o.rot}deg)`, overflowX: 'hidden', overflowY: f.done ? 'auto' : 'hidden', clipPath: `inset(${o.iy}px ${o.ix}px ${o.iy}px ${o.ix}px round ${o.r}px)`, background: 'var(--bg)' }}>
            <div style={{ ...abs, left: 0, top: 0, width: vw, height: s.innerH, transformOrigin: '0 0', transform: `scale(${o.s}) translate(${o.px}px, ${o.py}px)`, pointerEvents: f.done ? 'auto' : 'none' }}>
              <div aria-hidden="true" style={{ ...abs, left: vw * 0.55, top: -vh * 0.2, width: Math.max(vw, vh) * 0.9, height: Math.max(vw, vh) * 0.9, borderRadius: '50%', background: 'radial-gradient(closest-side, var(--accent-soft), transparent)' }} />

              <button type="button" onClick={onExplore} aria-label="About Praxio" style={{ ...abs, zIndex: 3, left: s.wmX, top: s.wmTop, fontSize: s.wmSize, fontWeight: 700, letterSpacing: '-.065em', lineHeight: 1, color: 'var(--text)', background: 'none', border: 0, padding: 0 }}>
                praxio<span style={{ color: 'var(--accent)' }}>.</span>
              </button>

              {/* opening statement (seen on the laptop) */}
              <div style={{ ...abs, left: s.padX, right: s.padX, top: s.r1, height: s.rowH, overflow: 'hidden' }}>
                <div className="disp" style={{ fontSize: s.stSize, transform: `translateY(${s.A1}%)` }}>Know where you <span className="ser" style={{ color: 'var(--accent)' }}>stand.</span></div>
              </div>
              <div style={{ ...abs, left: s.padX, right: s.padX, top: s.r2, height: s.rowH, overflow: 'hidden' }}>
                <div className="disp" style={{ fontSize: s.stSize, color: 'var(--text-3)', transform: `translateY(${s.A2}%)` }}>Then move.</div>
              </div>
              <div className="disp" style={{ ...abs, left: s.padX, top: s.r1, fontSize: s.stSize, display: 'flex', gap: '.26em' }}>{this.renderWords(s.B1)}</div>
              <div className="disp" style={{ ...abs, left: s.padX, top: s.r2, fontSize: s.stSize, display: 'flex', gap: '.26em' }}>{this.renderWords(s.B2)}</div>

              {/* journey */}
              <svg aria-hidden="true" width={vw} height={vh} viewBox={`0 0 ${vw} ${vh}`} style={{ ...abs, left: 0, top: 0, overflow: 'visible' }}>
                <path d={f.path} pathLength="1" style={{ fill: 'none', stroke: 'var(--line-2)', strokeWidth: 2, strokeDasharray: f.baseDash }} />
                <path d={f.path} pathLength="1" style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 5, strokeLinecap: 'round', strokeDasharray: f.trailDash }} />
              </svg>
              {f.marks.map((k) => (
                <div key={k.label} aria-hidden="true" style={{ ...abs, left: k.x, top: k.y, width: 0, height: 0 }}>
                  <div style={{ ...abs, left: -14, top: -14, width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--accent)', transform: `scale(${k.ring})`, opacity: k.ringO }} />
                  <div style={{ ...abs, left: -9, top: -9, width: 18, height: 18, borderRadius: '50%', background: k.landed ? 'var(--accent)' : 'var(--line-2)', boxShadow: '0 0 0 5px var(--bg)', transform: `scale(${k.k})` }} />
                  <div style={{ ...abs, left: 0, top: 20, transform: `translateX(-50%) scale(${k.k})`, transformOrigin: '50% 0', whiteSpace: 'nowrap', fontSize: 14, fontWeight: k.landed ? 600 : 400, color: k.landed ? 'var(--text)' : 'var(--text-3)' }}>{k.label}</div>
                </div>
              ))}
              {m.show && (
                <div aria-hidden="true" style={{ ...abs, left: m.left, top: m.top, width: 26, height: 56, transform: `scale(${m.sx}, ${m.sy})`, transformOrigin: '50% 100%' }}>
                  <MiniStudent m={m} />
                </div>
              )}
              <div aria-hidden="true" style={{ ...abs, zIndex: 3, left: n.left, top: n.top, width: n.size, height: n.size, transform: `scale(${n.sx}, ${n.sy})`, transformOrigin: '50% 100%' }}>
                {f.done && <div className="halo" style={{ ...abs, inset: 0, borderRadius: '50%', background: 'var(--accent)', opacity: 0.35 }} />}
                <div style={{ ...abs, inset: 0, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
                  <span style={{ opacity: n.txt ? 1 : 0 }}>you</span>
                </div>
              </div>

              {/* nav unfolds out of the dot */}
              {s.navShow && (
                <nav aria-label="Praxio" style={{ ...abs, left: s.padX, right: s.padX, top: 16, height: 60, borderRadius: 999, background: 'var(--surface)', boxShadow: 'var(--shadow)', clipPath: `inset(0 0 0 ${s.navClip}% round 999px)`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: '0 10px 0 24px' }}>
                  {!f.portrait && <button type="button" onClick={onExplore} style={{ marginRight: 'auto', marginLeft: 120, color: 'var(--text-2)', fontSize: 15, background: 'none', border: 0, minHeight: 44 }}>How it works</button>}
                  <button type="button" onClick={() => this.flipTheme(dark)} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} style={{ width: 44, height: 44, borderRadius: '50%', border: 0, background: 'var(--surface-2)', color: 'var(--text)', display: 'grid', placeItems: 'center' }}>
                    {dark ? (
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="9" cy="9" r="3.4" /><path d="M9 1.5v1.8M9 14.7v1.8M1.5 9h1.8M14.7 9h1.8M3.7 3.7l1.3 1.3M13 13l1.3 1.3M3.7 14.3L5 13M13 5l1.3-1.3" /></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M15 10.8A6.5 6.5 0 0 1 7.2 3a6.5 6.5 0 1 0 7.8 7.8z" /></svg>
                    )}
                  </button>
                  {onSignIn && <button type="button" onClick={onSignIn} style={{ height: 44, padding: '0 16px', borderRadius: 999, color: 'var(--text)', fontSize: 15, background: 'none', border: 0 }}>Sign in</button>}
                  <span aria-hidden="true" style={{ width: 40, height: 40 }} />
                </nav>
              )}

              {/* entry: where are you right now? */}
              <div style={{ ...abs, left: s.padX, top: s.qTop, fontSize: 15, color: 'var(--text-3)', opacity: s.qO, transform: `translateY(${s.qY}px)` }}>Where are you right now?</div>
              <h1 className="disp" style={{ ...abs, left: s.padX, top: s.h1, margin: 0, fontSize: s.hSize, display: 'flex', gap: '.26em' }}>{this.renderWords(s.E1)}</h1>
              <div className="disp" style={{ ...abs, left: s.padX, top: s.h2, fontSize: s.hSize, display: 'flex', gap: '.26em' }}>{this.renderWords(s.E2)}</div>
              <p style={{ ...abs, left: s.padX, right: s.padX, top: s.subTop, maxWidth: 520, margin: 0, fontSize: 18, lineHeight: 1.5, color: 'var(--text-2)', opacity: s.subO, transform: `translateY(${s.subY}px)` }}>
                Pick the stage closest to today. Everything Praxio shows you next adapts to it.
              </p>
              <div role="radiogroup" aria-label="Your current stage" style={{ ...abs, left: s.padX, right: s.padX, top: s.gTop, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {s.chips.map((c) => {
                  const on = stage === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => this.pickStage(c.id)}
                      className={`chip${on ? ' on' : ''}`}
                      style={{ minHeight: 54, padding: `0 22px 0 ${on ? 14 : 22}px`, border: 0, borderRadius: 999, background: on ? 'var(--accent)' : 'var(--surface)', color: on ? 'var(--on-accent)' : 'var(--text)', boxShadow: on ? 'none' : 'var(--shadow)', fontSize: 17, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 10, opacity: c.o, transform: `translateY(${c.y}px) scale(${c.s})` }}
                    >
                      {on && <span className="badge" style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--on-accent)', color: 'var(--accent)', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700 }}>you</span>}
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ ...abs, left: s.padX, right: s.padX, top: s.contTop, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', opacity: s.contO }}>
                {picked ? (
                  <button type="button" className="pill" onClick={() => onContinue?.(picked.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 12, minHeight: 58, padding: '0 30px', borderRadius: 999, border: 0, background: 'var(--text)', color: 'var(--bg)', fontSize: 16, fontWeight: 600 }}>
                    Continue as {picked.label.toLowerCase()} <span aria-hidden="true">→</span>
                  </button>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 58, padding: '0 30px', borderRadius: 999, background: 'var(--surface-2)', color: 'var(--text-3)', fontSize: 16 }}>Choose a stage to continue</span>
                )}
                {onExplore && <button type="button" onClick={onExplore} style={{ fontSize: 15, minHeight: 44, color: 'var(--accent)', background: 'none', border: 0 }}>Explore Praxio first</button>}
                <button type="button" onClick={this.replay} style={{ border: 0, background: 'transparent', color: 'var(--text-3)', fontSize: 15, minHeight: 44 }}>Replay intro</button>
              </div>
            </div>
            <div aria-hidden="true" style={{ ...abs, top: '-30%', left: 0, width: '22%', height: '160%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.2), transparent)', transform: `translateX(${o.sheenX}%) rotate(16deg)`, opacity: o.sheenO, pointerEvents: 'none' }} />
          </div>
        )}

        {/* ================= ENTRY GATE ================= */}
        {gate.show && (
          <div style={{ ...abs, inset: 0, zIndex: 10, background: 'var(--bg)', opacity: gate.o, pointerEvents: this.state.entered ? 'none' : 'auto', overflow: 'hidden' }}>
            <div aria-hidden="true" style={{ ...abs, left: '50%', top: '50%', width: gate.orb, height: gate.orb, marginLeft: -gate.orb / 2, marginTop: -gate.orb / 2, borderRadius: '50%', background: 'radial-gradient(closest-side, var(--accent-soft), transparent)' }} />
            <div style={{ ...abs, left: s.padX, top: 30, fontSize: 22, fontWeight: 700, letterSpacing: '-.065em', opacity: gate.subO }}>praxio<span style={{ color: 'var(--accent)' }}>.</span></div>
            <div style={{ ...abs, inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `0 ${s.padX}px`, textAlign: 'center', transform: `translateY(${gate.y}px) scale(${gate.s})` }}>
              <h1 className="disp" style={{ margin: 0, fontSize: gate.hSize, fontWeight: 700, whiteSpace: 'normal', lineHeight: 1, maxWidth: 1200 }}>
                <span style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 .24em' }}>{this.renderWords(gate.L1)}</span>
                <span style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 .24em', marginTop: '.06em' }}>{this.renderWords(gate.L2)}</span>
              </h1>
              <p style={{ margin: '32px 0 0', maxWidth: 620, fontSize: gate.subSize, lineHeight: 1.5, color: 'var(--text-2)', opacity: gate.subO, transform: `translateY(${gate.subY}px)` }}>
                Discover what fits. Build the skills. Demonstrate what you can do.
              </p>
              <div style={{ position: 'relative', marginTop: 44, transform: `scale(${gate.btnK})`, opacity: gate.btnO }}>
                <span aria-hidden="true" className="ringPulse" style={{ ...abs, inset: 0, borderRadius: 999, background: 'var(--accent)' }} />
                <button type="button" onClick={this.enter} className="enter" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 18, minHeight: 68, padding: '0 10px 0 34px', border: 0, borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 19, fontWeight: 600, boxShadow: 'var(--shadow)' }}>
                  Enter Praxio
                  <span className="arr" aria-hidden="true" style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--on-accent)', color: 'var(--accent)', display: 'grid', placeItems: 'center' }}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10h11M11 5l5 5-5 5" /></svg>
                  </span>
                </button>
              </div>
              <button type="button" onClick={this.toggleSound} aria-pressed={!muted} style={{ marginTop: 22, minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 16px', border: 0, borderRadius: 999, background: 'transparent', color: 'var(--text-3)', fontSize: 14, opacity: gate.sndO }}>
                {soundIcon}{muted ? 'Sound off' : 'Sound on'}
              </button>
            </div>
          </div>
        )}

        {f.showSkip && (
          <button type="button" onClick={this.skip} className="skip" style={{ ...abs, right: 20, bottom: 20, zIndex: 6, minHeight: 40, padding: '0 14px', border: 0, borderRadius: 999, background: 'transparent', color: 'var(--text-3)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Skip intro
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 2.5l3.5 3.5L2 9.5M6.5 2.5L10 6l-3.5 3.5" /></svg>
          </button>
        )}
        {f.showHint && <div style={{ ...abs, right: 28, top: 28, fontSize: 13, color: 'var(--text-3)', pointerEvents: 'none' }}>Scroll to move closer</div>}
      </div>
    );
  }
}

function Student({ fig }) {
  const limb = (stroke, width) => ({ stroke, strokeWidth: width });
  const leg = (hip, knee, pants) => (
    <g transform={`rotate(${hip} 76 216)`}>
      <line x1="76" y1="216" x2="76" y2="296" className="limb" style={limb(pants, 27)} />
      <g transform={`rotate(${knee} 76 296)`}>
        <line x1="76" y1="296" x2="76" y2="364" className="limb" style={limb(pants, 23)} />
        <rect x="62" y="362" width="46" height="20" rx="10" style={{ fill: 'var(--shoe)' }} />
        <rect x="62" y="378" width="46" height="5" rx="2.5" style={{ fill: 'var(--sole)' }} />
      </g>
    </g>
  );
  return (
    <svg width="150" height="390" viewBox="0 0 150 390" style={{ overflow: 'visible', display: 'block' }}>
      <rect x="26" y="98" width="38" height="96" rx="16" style={{ fill: 'var(--pack)' }} />
      <rect x="30" y="140" width="28" height="30" rx="8" style={{ fill: 'var(--pack-2)' }} />
      <g transform={`rotate(${fig.armB} 76 106)`}>
        <line x1="76" y1="106" x2="74" y2="168" className="limb" style={limb('var(--fig-top-2)', 19)} />
        <g transform={`rotate(${fig.elbB} 74 168)`}>
          <line x1="74" y1="168" x2="76" y2="216" className="limb" style={limb('var(--fig-top-2)', 17)} />
          <circle cx="76" cy="223" r="9.5" style={{ fill: 'var(--skin-2)' }} />
        </g>
      </g>
      {leg(fig.hipB, fig.kneeB, 'var(--fig-pants-2)')}
      {leg(fig.hipF, fig.kneeF, 'var(--fig-pants)')}
      <ellipse cx="74" cy="96" rx="24" ry="12" style={{ fill: 'var(--fig-top-2)' }} />
      <path d="M50 112 C50 94 62 88 80 88 C98 88 108 96 108 114 L112 208 C112 222 102 228 90 228 L62 228 C50 228 44 220 46 208 Z" style={{ fill: 'var(--fig-top)' }} />
      <path d="M60 180 L100 180 C102 180 104 182 104 184 L106 204 L58 204 L58 184 C58 182 59 180 60 180 Z" style={{ fill: 'var(--fig-top-2)', opacity: 0.55 }} />
      <line x1="64" y1="104" x2="72" y2="172" className="limb" style={limb('var(--pack-2)', 6)} />
      <rect x="72" y="70" width="17" height="26" rx="8.5" style={{ fill: 'var(--skin-2)' }} />
      <g transform={`rotate(${fig.headRot} 80 78)`}>
        <circle cx="82" cy="50" r="29" style={{ fill: 'var(--skin)' }} />
        <circle cx="64" cy="54" r="6.5" style={{ fill: 'var(--skin-2)' }} />
        <circle cx="88" cy="50" r="29" style={{ fill: 'var(--accent)', opacity: fig.glow }} />
        <path d="M53 52 C48 22 68 11 88 13 C107 15 117 30 111 48 C102 39 92 35 82 37 C75 31 65 33 61 43 C59 47 57 50 53 52 Z" style={{ fill: 'var(--hair)' }} />
        <path d="M80 16 C81 4 93 1 98 8 C91 8 86 12 84 18 Z" style={{ fill: 'var(--hair)' }} />
        <g transform={`translate(${fig.faceX} 0)`}>
          <circle cx="80" cy="61" r="4.5" style={{ fill: 'var(--blush)' }} />
          <circle cx="100" cy="61" r="4" style={{ fill: 'var(--blush)' }} />
          <ellipse cx="84" cy="51" rx="3" ry={fig.eyeRyFar} style={{ fill: 'var(--hair)' }} />
          <ellipse cx="97" cy="51" rx="3.5" ry={fig.eyeRy} style={{ fill: 'var(--hair)' }} />
          <line x1="80" y1={fig.browY} x2="87" y2={fig.browY2} className="limb" style={limb('var(--hair)', 2.6)} />
          <line x1="93" y1={fig.browY2} x2="101" y2={fig.browY} className="limb" style={limb('var(--hair)', 2.8)} />
          <path d={fig.smile} className="limb" style={limb('var(--hair)', 2.8)} />
        </g>
      </g>
      <g transform={`rotate(${fig.armF} 80 108)`}>
        <line x1="80" y1="108" x2="80" y2="164" className="limb" style={limb('var(--fig-top)', 19)} />
        <line x1="80" y1="164" x2="126" y2="158" className="limb" style={limb('var(--fig-top)', 17)} />
        <circle cx="132" cy="157" r="9.5" style={{ fill: 'var(--skin)' }} />
      </g>
    </svg>
  );
}

function MiniStudent({ m }) {
  return (
    <svg width="26" height="56" viewBox="0 0 26 56" style={{ display: 'block', overflow: 'visible' }}>
      <rect x="1" y="14" width="9" height="16" rx="4" style={{ fill: 'var(--pack)' }} />
      <g transform={`rotate(${m.legB} 13 34)`}><line x1="13" y1="34" x2="13" y2="50" className="limb" style={{ stroke: 'var(--fig-pants-2)', strokeWidth: 5.5 }} /></g>
      <g transform={`rotate(${m.legF} 13 34)`}><line x1="13" y1="34" x2="13" y2="50" className="limb" style={{ stroke: 'var(--fig-pants)', strokeWidth: 5.5 }} /></g>
      <rect x="6" y="15" width="14" height="21" rx="6" style={{ fill: 'var(--fig-top)' }} />
      <g transform={`rotate(${m.arm} 15 19)`}><line x1="15" y1="19" x2="24" y2="27" className="limb" style={{ stroke: 'var(--fig-top)', strokeWidth: 4.5 }} /></g>
      <circle cx="14" cy="8" r="7.5" style={{ fill: 'var(--skin)' }} />
      <path d="M7 7 C6 0 14 -2 19 1 C22 3 22 6 21 7 C17 4 12 4 7 7 Z" style={{ fill: 'var(--hair)' }} />
    </svg>
  );
}
