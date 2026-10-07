import { test } from 'node:test';
import assert from 'node:assert/strict';

const session = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (session.has(k) ? session.get(k) : null),
  setItem: (k, v) => session.set(k, String(v)),
  removeItem: (k) => session.delete(k),
};

const { buildCues, cuesBetween, END, layoutFor, milestones, hopStart, HOP, WALK } = await import('../src/components/opening/timeline.js');
const { saveEntryStage, readEntryStage, clearEntryStage, withEntryStage } = await import('../src/lib/entryStage.js');
const { STAGES } = await import('../src/lib/userContext.js');

test('sound cues are sorted, inside the film, and footsteps follow the walk', () => {
  for (const [vw, vh] of [[1440, 900], [390, 844]]) {
    const cues = buildCues(vw, vh);
    assert.ok(cues.length > 40);
    cues.forEach((c, i) => {
      assert.ok(c.t >= 0 && c.t <= END, `${c.name} at ${c.t}`);
      if (i) assert.ok(c.t >= cues[i - 1].t);
    });
    const steps = cues.filter((c) => c.name === 'step');
    assert.ok(steps.length >= 4, 'several footsteps');
    assert.ok(steps.every((c) => c.t >= WALK.start && c.t <= WALK.end + 0.1));
    // One rising note per milestone landing.
    const { portrait } = layoutFor(vw, vh);
    assert.equal(cues.filter((c) => c.name === 'note').length, milestones(portrait).length);
  }
});

test('hops finish exactly when the you-dot forms, on both layouts', () => {
  for (const portrait of [false, true]) {
    const n = milestones(portrait).length;
    assert.equal(hopStart(n) + n * HOP.duration, HOP.end);
  }
});

test('large jumps (skip, scrubbing) play no sounds; normal frames do', () => {
  const cues = buildCues(1440, 900);
  assert.deepEqual(cuesBetween(cues, 0, END), []);
  assert.deepEqual(cuesBetween(cues, 5, 4), []);
  assert.ok(cuesBetween(cues, 1.59, 1.61).some((c) => c.name === 'click'));
});

test('the stage picked in the opening pre-answers the assessment only', () => {
  clearEntryStage();
  saveEntryStage('not_a_stage');
  assert.equal(readEntryStage(), null);
  saveEntryStage('school_12');
  assert.equal(readEntryStage(), 'school_12');
  const fresh = withEntryStage({ full_name: 'Asha' });
  assert.equal(fresh.current_stage, 'school_12');
  assert.equal(fresh.primary_goal, 'choose_degree');
  // Never overrides a stage the person already gave.
  assert.equal(withEntryStage({ current_stage: 'undergraduate' }).current_stage, 'undergraduate');
  assert.equal(withEntryStage(null, null), null);
  clearEntryStage();
  assert.equal(readEntryStage(), null);
});

test('every real stage is offered at the end of the opening', () => {
  // The opening builds its chips straight from STAGES; ids must stay valid profile values.
  assert.equal(STAGES.length, 8);
  STAGES.forEach((s) => assert.match(s.id, /^[a-z0-9_]+$/));
});
