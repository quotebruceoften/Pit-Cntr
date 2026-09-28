'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const mine = require('../js/sim/mine.js');
const { createSim } = require('../js/sim/engine.js');
const { SCENARIOS } = require('../js/sim/scenarios.js');
const { score } = require('../js/sim/scoring.js');
const bots = require('./bots.js');

const scenario = (id) => SCENARIOS.find((s) => s.id === id);
const assessed = SCENARIOS.filter((s) => !s.practice);

function runUntil(sim, minutes, control) {
  while (!sim.state.finished && sim.state.t < minutes * 60) {
    if (control) control();
    sim.step(1, 1 / 15);
  }
}

// Minimal scenario for focused engine tests.
function mini(overrides) {
  return Object.assign({
    id: 'mini', name: 'Mini', durationMin: 90, blend: { min: 1.2, max: 1.6 }, targets: { ore: 1000, waste: 1000 },
    fleet: [
      { id: 'T01', shovel: 'S1', dump: 'CR', departSec: 0 },
      { id: 'T02', shovel: 'S3', dump: 'WD', departSec: 0 }
    ],
    events: []
  }, overrides);
}

test('road network routes every loading unit to every dump', () => {
  for (const s of mine.SHOVELS) {
    for (const d of mine.DUMPS) {
      const path = mine.shortestPath(s.id, d.id);
      assert.equal(path[0], s.id);
      assert.equal(path[path.length - 1], d.id);
      assert.ok(mine.routeLength(path) > 1000, 'haul should be over 1 km');
      // Loaded hauls climb out of the pit so take longer than the empty return.
      assert.ok(mine.travelSeconds(path, true) > mine.travelSeconds(path.slice().reverse(), false));
    }
  }
});

test('simulation is deterministic for a given seed and set of actions', () => {
  const a = bots.run(scenario('day'), bots.expertController, { seed: 7 });
  const b = bots.run(scenario('day'), bots.expertController, { seed: 7 });
  assert.deepEqual(a.summary.totals, b.summary.totals);
  assert.equal(a.result.overall, b.result.overall);
});

for (const sc of assessed) {
  test(sc.id + ': expert controller is recommended with no safety violations', () => {
    const { summary, result } = bots.run(sc, bots.expertController);
    assert.deepEqual(summary.violations.filter((v) => v.category === 'safety'), []);
    assert.equal(result.recommendation.band, 'recommended', JSON.stringify(result.competencies));
    assert.ok(result.overall >= 85, 'overall ' + result.overall);
  });

  test(sc.id + ': doing nothing is never recommended', () => {
    const { result } = bots.run(sc, null);
    assert.equal(result.recommendation.band, 'not-suitable', 'overall ' + result.overall);
    assert.equal(result.competencies.decisions, 0);
  });

  test(sc.id + ': reckless controller fails on safety', () => {
    const { result } = bots.run(sc, bots.recklessController);
    assert.ok(result.competencies.safety <= 40, 'safety ' + result.competencies.safety);
    assert.equal(result.recommendation.band, 'not-suitable');
  });
}

test('expert clearly outscores a passive controller in every scenario', () => {
  for (const sc of assessed) {
    const good = bots.run(sc, bots.expertController).result.overall;
    const idle = bots.run(sc, null).result.overall;
    assert.ok(good - idle >= 30, sc.id + ': ' + good + ' vs ' + idle);
  }
});

test('reassigning a loaded truck lets it finish its current load to the original dump', () => {
  const sim = createSim(mini(), { seed: 3 });
  const t2 = sim.state.trucks.find((t) => t.id === 'T02');
  runUntil(sim, 60, () => {});
  while (!t2.load) sim.step(1, 0.1);
  sim.assign('T02', { shovel: 'S1', dump: 'CR' });
  while (t2.load) sim.step(1, 0.1);
  const tip = sim.state.tips.filter((t) => t.truck === 'T02').pop();
  assert.equal(tip.material, 'waste');
  assert.equal(tip.dump, 'WD');
  assert.equal(sim.state.violations.length, 0);
});

test('changing only the dump redirects the load on board (crusher outage)', () => {
  const sim = createSim(mini(), { seed: 3 });
  const t1 = sim.state.trucks.find((t) => t.id === 'T01');
  while (!t1.load) sim.step(1, 0.1);
  sim.assign('T01', { dump: 'ROM' });
  while (t1.load) sim.step(1, 0.1);
  assert.equal(sim.state.tips.pop().dump, 'ROM');
});

test('tipping waste into the crusher is a process violation and blocks the crusher', () => {
  const sim = createSim(mini({ fleet: [{ id: 'T01', shovel: 'S3', dump: 'CR', departSec: 0 }] }), { seed: 1 });
  runUntil(sim, 40);
  assert.ok(sim.state.violations.some((v) => v.category === 'process' && /waste into the crusher/.test(v.text)));
  assert.ok(sim.state.dumps.CR.tips >= 1);
});

test('blast: false all-clear with equipment in the zone is a critical failure', () => {
  const sc = mini({ events: [{ at: 1, type: 'blast', shovel: 'S2', blastIn: 30, guard: 10, reentry: 10 }],
    fleet: [{ id: 'T01', shovel: 'S2', dump: 'CR', departSec: 0 }] });
  const sim = createSim(sc, { seed: 1 });
  runUntil(sim, 2);
  const res = sim.confirmBlastClear();
  assert.ok(res.inside.includes('S2'));
  runUntil(sim, 40);
  const crit = sim.state.violations.filter((v) => v.severity === 'critical');
  assert.ok(crit.length >= 1);
  const r = score(sim.summary());
  assert.equal(r.recommendation.band, 'not-suitable');
});

test('blast: shovel cannot return to the face before the area is reopened', () => {
  const sc = mini({ events: [{ at: 1, type: 'blast', shovel: 'S2', blastIn: 20, guard: 10, reentry: 10 }], fleet: [{ id: 'T01', shovel: 'S1', dump: 'CR', departSec: 0 }] });
  const sim = createSim(sc, { seed: 1 });
  runUntil(sim, 2);
  assert.ok(sim.tram('S2', 'safe').ok);
  runUntil(sim, 12);
  assert.equal(sim.state.shovels.S2.status, 'standby');
  assert.ok(sim.confirmBlastClear().ok);
  runUntil(sim, 22);
  assert.equal(sim.state.blast.status, 'fired');
  assert.equal(sim.tram('S2', 'face').ok, false);
  runUntil(sim, 33);
  assert.equal(sim.state.blast.status, 'reopened');
  assert.ok(sim.tram('S2', 'face').ok);
  assert.deepEqual(sim.state.violations, []);
});

test('ignoring a low-fuel warning leaves the truck stranded', () => {
  const sc = mini({ events: [{ at: 5, type: 'fuelLow', truck: 'T01', minutes: 10 }] });
  const sim = createSim(sc, { seed: 1 });
  runUntil(sim, 16);
  const t1 = sim.state.trucks.find((t) => t.id === 'T01');
  assert.ok(t1.hold && /fuel/.test(t1.hold.reason));
});

test('sending a truck to fuel resolves the disruption and refuels it', () => {
  const sc = mini({ events: [{ at: 5, type: 'fuelLow', truck: 'T01', minutes: 30 }] });
  const sim = createSim(sc, { seed: 1 });
  runUntil(sim, 6);
  sim.sendToFuel('T01');
  runUntil(sim, 60);
  const t1 = sim.state.trucks.find((t) => t.id === 'T01');
  assert.equal(t1.fuelLow, false);
  assert.ok(!t1.hold);
  assert.ok(sim.state.disruptions[0].resolvedAt != null);
});

test('radio calls time out on the real-time clock and score zero', () => {
  const sc = mini({ events: [Object.assign({}, scenario('day').events.find((e) => e.id === 'lv-crossing'), { at: 1 })] });
  const sim = createSim(sc, { seed: 1 });
  runUntil(sim, 1.1);
  assert.equal(sim.state.radio.length, 1);
  sim.advanceReal(60);
  assert.equal(sim.state.radio.length, 0);
  assert.equal(sim.state.decisions[0].rating, 'timeout');
});

test('unsafe radio answers are logged as safety violations', () => {
  const sc = mini({ events: [Object.assign({}, scenario('day').events.find((e) => e.id === 'lv-crossing'), { at: 1 })] });
  const sim = createSim(sc, { seed: 1 });
  runUntil(sim, 1.1);
  const call = sim.state.radio[0];
  const unsafe = call.options.find((o) => o.rating === 'unsafe');
  sim.answerRadio(call.id, unsafe.index);
  assert.equal(sim.state.violations[0].category, 'safety');
  assert.equal(sim.state.decisions[0].rating, 'unsafe');
});

test('geotech evacuation penalises trucks left in the exclusion zone', () => {
  const sc = mini({ events: [{ at: 20, type: 'radio', id: 'g', from: 'Geo', message: 'm', options: [
    { text: 'evacuate', rating: 'best', effects: [{ type: 'evacuate', shovel: 'S1', minutes: 30 }] }] }],
  fleet: [1, 2, 3, 4].map((i) => ({ id: 'T0' + i, shovel: 'S1', dump: 'CR', departSec: 0 })) });
  const sim = createSim(sc, { seed: 1 });
  runUntil(sim, 20.1);
  sim.answerRadio(sim.state.radio[0].id, 0);
  runUntil(sim, 50);
  assert.ok(sim.state.violations.some((v) => /geotechnical exclusion/.test(v.text)));
});

test('scoring weights sum to one', () => {
  const { COMPETENCIES } = require('../js/sim/scoring.js');
  const total = COMPETENCIES.reduce((a, c) => a + c.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test('blend is scored again once a blasted shovel could have returned but was left on standby', () => {
  const sc = mini({ durationMin: 150, events: [{ at: 1, type: 'blast', shovel: 'S2', blastIn: 15, guard: 5, reentry: 5 }],
    fleet: [1, 2, 3].map((i) => ({ id: 'T0' + i, shovel: 'S1', dump: 'CR', departSec: 0 })) });
  const sim = createSim(sc, { seed: 1 });
  runUntil(sim, 2);
  sim.tram('S2', 'safe');
  runUntil(sim, 12);
  sim.confirmBlastClear();
  runUntil(sim, 150);
  assert.equal(sim.state.blast.status, 'reopened');
  const late = sim.state.tips.filter((t) => t.dump === 'CR' && t.t > (21 + 20) * 60);
  assert.ok(late.length > 0);
  assert.ok(late.every((t) => t.assessable), 'standby by choice must not excuse the blend');
  assert.ok(late.every((t) => !t.inSpec), 'high-grade only feed is out of spec');
});
