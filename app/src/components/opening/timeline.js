// Cinematic opening: pure timing helpers shared by the renderer and the sound cues.
// Everything is driven by one clock `t` (seconds). Negative t is the entry gate lifting away.

export const END = 19.5;
export const GATE_EXIT = -0.7;

export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, k) => a + (b - a) * k;

export const ease = {
  io: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  eo: (k) => 1 - Math.pow(1 - k, 3),
  ei: (k) => k * k * k,
  // Back out / in: overshoot, for the chunky springy pops.
  bo: (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  bi: (k) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * k * k * k - c1 * k * k; },
  // Elastic out: the desk springing up.
  el: (k) => (k <= 0 ? 0 : k >= 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
};

/** Portrait screens get a recomposed room (desk centred, shorter walk). */
export function layoutFor(vw, vh) {
  const portrait = vw < 700 || vh > vw * 1.1;
  const P = portrait
    ? { WW: 720, WH: 1260, floor: 920, deskX: 470, deskW: 320, deskTop: 760, startX: -300, stopX: 140, sw: 210 }
    : { WW: 1600, WH: 1000, floor: 760, deskX: 990, deskW: 400, deskTop: 600, startX: -320, stopX: 620, sw: 232 };
  return { portrait, P };
}

export const WALK = { start: 1.9, end: 5.0 };

/** The student's x position while walking in (decelerates to a stop). */
export function walkX(t, P) {
  const k = clamp((t - WALK.start) / (WALK.end - WALK.start));
  return lerp(P.startX, P.stopX, ease.eo(k));
}

/** Journey milestones: fewer on portrait. */
export function milestones(portrait) {
  return portrait ? ['10th', '12th', 'Degree', 'Work'] : ['10th', '11th', '12th', 'Undergrad', 'Postgrad', 'Work'];
}
export const HOP = { duration: 0.4, end: 16.4 };
export const hopStart = (count) => HOP.end - count * HOP.duration;

/**
 * Sound cues for the film, as [{ t, name, arg }] sorted by time. Footsteps follow the
 * walk cycle so they land on the student's actual strides.
 */
export function buildCues(vw, vh) {
  const { portrait, P } = layoutFor(vw, vh);
  const c = [];
  const add = (t, name, arg) => c.push({ t, name, arg });
  add(0.32, 'spring'); add(1.0, 'pop', 520); add(1.2, 'pop', 700);
  add(1.6, 'click'); add(1.68, 'buzz'); add(1.76, 'click'); add(1.82, 'buzz'); add(1.9, 'click');
  let prev = null;
  for (let tt = WALK.start; tt <= WALK.end; tt += 0.01) {
    const k = (tt - WALK.start) / (WALK.end - WALK.start);
    const amp = Math.min(1, (1 - k) * 2.6);
    const stride = Math.floor((walkX(tt, P) * 0.045) / Math.PI + 0.5);
    if (prev !== null && stride !== prev && amp > 0.15) add(tt, 'step');
    prev = stride;
  }
  add(5.05, 'step'); add(5.22, 'bling');
  add(6.6, 'thud', 120); add(6.62, 'paper'); add(6.78, 'tick', 2200);
  add(7.4, 'thud', 80); add(7.42, 'click'); add(7.46, 'fwip'); add(7.98, 'chime');
  add(8.8, 'rush'); add(10.85, 'shimmer');
  [11.5, 11.59, 11.75, 11.84, 11.97].forEach((x, i) => add(x + 0.05, 'pop', 500 + i * 90));
  add(13.2, 'swish'); add(13.35, 'fwip');
  const count = milestones(portrait).length;
  const hs = hopStart(count);
  const notes = [523, 587, 659, 784, 880, 1047];
  for (let i = 0; i < count; i++) add(13.6 + i * 0.08, 'tick', 1400 + i * 120);
  add(hs - 0.3, 'pop', 800);
  for (let i = 0; i < count; i++) {
    add(hs + i * HOP.duration + 0.01, 'boing', 260 + i * 40);
    add(hs + (i + 1) * HOP.duration, 'note', notes[i]);
  }
  add(16.45, 'pop', 420); add(16.8, 'whistle'); add(17.4, 'thud', 150); add(17.42, 'pop', 900); add(17.46, 'swish');
  [18.0, 18.09, 18.2].forEach((x, i) => add(x + 0.05, 'pop', 660 + i * 110));
  for (let i = 0; i < 8; i++) add(18.55 + i * 0.06, 'tick', 1500 + i * 90);
  return c.sort((a, b) => a.t - b.t);
}

/** Cues that fall inside (from, to]. Large jumps (skip, scrubbing) play nothing. */
export function cuesBetween(cues, from, to) {
  if (to - from > 0.2 || to <= from) return [];
  return cues.filter((c) => c.t > from && c.t <= to);
}
