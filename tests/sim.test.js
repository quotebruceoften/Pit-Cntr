'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createMine } = require('../js/sim/mine.js');
const engine = require('../js/sim/engine.js');
const { SITES } = require('../js/sim/library.js');
const { score } = require('../js/sim/scoring.js');
const bots = require('./bots.js');
const demo = require('../js/sites/demo.js');
require('../js/sites/navachab.js');

// Focused engine tests run on the demo site.
const createSim = (sc, opts) => engine.createSim(demo, sc, opts);
const scenario = (id) => demo.scenarios.find((s) => s.id === id);

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

for (const site of SITES) test(site.id + ': road network routes every loading unit to every dump', () => {
  const mine = createMine(site.layout);
  for (const s of mine.SHOVELS) {
    for (const d of mine.DUMPS) {
      const path = mine.shortestPath(s.id, d.id);
      assert.equal(path[0], s.id);
      assert.equal(path[path.length - 1], d.id);
      assert.ok(mine.routeLength(path) > 500, 'haul should be over 500 m');
      // Loaded hauls climb out of the pit so take longer than the empty return.
      assert.ok(mine.travelSeconds(path, true) > mine.travelSeconds(path.slice().reverse(), false));
    }
  }
});

test('simulation is deterministic for a given seed and set of actions', () => {
  const a = bots.run(demo, scenario('day'), bots.expertController, { seed: 7 });
  const b = bots.run(demo, scenario('day'), bots.expertController, { seed: 7 });
  assert.deepEqual(a.summary.totals, b.summary.totals);
  assert.equal(a.result.overall, b.result.overall);
});

for (const site of SITES) {
  const assessed = site.scenarios.filter((s) => !s.practice);
  for (const sc of assessed) {
    const name = site.id + '/' + sc.id;
    test(name + ': expert controller is recommended with no safety violations', () => {
      const { summary, result } = bots.run(site, sc, bots.expertController);
      assert.deepEqual(summary.violations.filter((v) => v.category === 'safety'), []);
      assert.equal(result.recommendation.band, 'recommended', JSON.stringify(result.competencies));
      assert.ok(result.overall >= 85, 'overall ' + result.overall);
    });

    test(name + ': doing nothing is never recommended', () => {
      const { result } = bots.run(site, sc, null);
      assert.equal(result.recommendation.band, 'not-suitable', 'overall ' + result.overall);
      assert.equal(result.competencies.decisions, 0);
    });

    test(name + ': reckless controller fails on safety', () => {
      const { result } = bots.run(site, sc, bots.recklessController);
      assert.ok(result.competencies.safety <= 40, 'safety ' + result.competencies.safety);
      assert.equal(result.recommendation.band, 'not-suitable');
    });

    test(name + ': expert clearly outscores a passive controller', () => {
      const good = bots.run(site, sc, bots.expertController).result.overall;
      const idle = bots.run(site, sc, null).result.overall;
      assert.ok(good - idle >= 30, good + ' vs ' + idle);
    });
  }

  test(site.id + ': practice scenario exists and every scenario only references its own equipment', () => {
    assert.ok(site.scenarios.some((s) => s.practice));
    const mine = createMine(site.layout);
    const units = new Set(mine.SHOVELS.map((x) => x.id).concat(['PARK']));
    const dumps = new Set(mine.DUMPS.map((x) => x.id));
    for (const sc of site.scenarios) {
      const trucks = new Set(sc.fleet.map((f) => f.id));
      for (const f of sc.fleet) {
        assert.ok(units.has(f.shovel), sc.id + ' fleet uses unknown unit ' + f.shovel);
        assert.ok(dumps.has(f.dump), sc.id + ' fleet uses unknown dump ' + f.dump);
      }
      for (const ev of sc.events) {
        if (ev.shovel) assert.ok(units.has(ev.shovel), sc.id + ' event uses unknown unit ' + ev.shovel);
        if (ev.truck) assert.ok(trucks.has(ev.truck), sc.id + ' event uses unknown truck ' + ev.truck);
        for (const o of ev.options || []) for (const e of o.effects || []) {
          if (e.truck) assert.ok(trucks.has(e.truck), sc.id + ' radio effect uses unknown truck ' + e.truck);
          if (e.shovel) assert.ok(units.has(e.shovel), sc.id + ' radio effect uses unknown unit ' + e.shovel);
        }
      }
    }
  });
}

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

test('navachab: mixed fleet of 20 Komatsu HD785 (QKR) and 14 CAT 777E (Eitavelo) shares the loading units', () => {
  const site = SITES.find((s) => s.id === 'navachab');
  for (const sc of site.scenarios) {
    const sim = engine.createSim(site, sc, { seed: 1 });
    const byCls = {};
    for (const t of sim.state.trucks) byCls[t.cls] = (byCls[t.cls] || 0) + 1;
    assert.deepEqual(byCls, { HD785: 20, CAT777E: 14 }, sc.id);
    assert.ok(sim.state.trucks.filter((t) => t.cls === 'CAT777E').every((t) => /Eitavelo/.test(t.owner)));
    // Both owners share every running loading unit from the start.
    for (const unit of sc.running) {
      const owners = new Set(sim.state.trucks.filter((t) => t.assign.shovel === unit).map((t) => t.cls));
      assert.equal(owners.size, 2, sc.id + ' ' + unit);
    }
  }
  const { summary } = bots.run(site, site.scenarios.find((s) => s.id === 'day'), bots.expertController);
  assert.equal(summary.fleet.length, 2);
  assert.ok(summary.fleet.every((f) => f.loads > 0));
});

test('contractor authorisation: refusing parks the truck; allowing it leads to a near miss', () => {
  const site = SITES.find((s) => s.id === 'navachab');
  const lib = require('../js/sim/library.js').scenarioLib;
  const base = site.scenarios.find((s) => s.id === 'storm');
  const sc = Object.assign({}, base, { events: [lib.contractorAuthorisation(1, 'Eitavelo supervisor', 'E44', 'main ramp'), lib.contractorAuthorisationFollowUp(20, 'E44', 'main ramp')] });
  for (const rating of ['best', 'unsafe']) {
    const sim = engine.createSim(site, sc, { seed: 1 });
    while (sim.state.t < 70) sim.step(1, 1 / 15);
    const call = sim.state.radio[0];
    sim.answerRadio(call.id, call.options.find((o) => o.rating === rating).index);
    while (sim.state.t < 25 * 60) sim.step(1, 1 / 15);
    const nearMiss = sim.state.violations.some((v) => /lost traction/.test(v.text));
    if (rating === 'best') {
      assert.ok(!nearMiss);
      assert.ok(sim.state.trucks.find((t) => t.id === 'E44').hold);
    } else {
      assert.ok(nearMiss);
    }
  }
});

const navachab = () => SITES.find((s) => s.id === 'navachab');
const navScenario = (id, patch) => Object.assign({}, navachab().scenarios.find((s) => s.id === id), patch || {});
const runNav = (sim, minutes, control) => {
  while (!sim.state.finished && sim.state.t < minutes * 60) { if (control) control(); sim.step(1, 1 / 15); }
};

test('navachab: trucks use the site callsigns (N for QKR, E for Eitavelo)', () => {
  const sim = engine.createSim(navachab(), navScenario('day'), { seed: 1 });
  const ids = sim.state.trucks.map((t) => t.id);
  assert.equal(new Set(ids).size, 34);
  for (const n of [16, 17, 19, 22, 25, 26, 27, 29, 33, 35, 36, 42, 43, 44, 45, 46, 47, 48, 49, 50]) assert.ok(ids.includes('N' + n));
  for (const n of [71, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53]) assert.ok(ids.includes('E' + n));
});

test('navachab: PB6 road is drawn but never used for haulage', () => {
  const mine = createMine(navachab().layout);
  assert.ok(mine.EDGES.some(([a, b, o]) => b === 'P6' && o && o.closed));
  for (const s of mine.SHOVELS) for (const d of mine.DUMPS) {
    assert.ok(!mine.shortestPath(s.id, d.id).includes('P6'));
  }
});

test('navachab: EX10 starts in commissioning and must be put to work once released', () => {
  const sc = navScenario('day', { events: [{ at: 5, type: 'shovelReady', shovel: 'EX10', minTrucks: 3 }] });
  const sim = engine.createSim(navachab(), sc, { seed: 1 });
  assert.equal(sim.state.shovels.EX10.status, 'commissioning');
  runNav(sim, 6);
  assert.equal(sim.state.shovels.EX10.status, 'operating');
  const d = sim.state.disruptions.find((x) => x.type === 'shovelReady');
  assert.equal(d.resolvedAt, null);
  for (const t of sim.state.trucks.filter((x) => x.assign.shovel === 'EX08').slice(0, 3)) sim.assign(t.id, { shovel: 'EX10', dump: 'TSF' });
  runNav(sim, 7);
  assert.ok(d.resolvedAt != null);
});

test('navachab: ore tipped on the wrong ROM finger is a grade misroute', () => {
  const sim = engine.createSim(navachab(), navScenario('day', { events: [] }), { seed: 1 });
  for (const t of sim.state.trucks.filter((x) => x.assign.shovel === 'EX05')) sim.assign(t.id, { dump: 'MCB' });
  runNav(sim, 120);
  const s = sim.summary();
  assert.ok(s.routing.oreTips > 0 && s.routing.correct < s.routing.oreTips);
  assert.ok(s.violations.some((v) => v.code === 'misroute' && /FW Green ore on the MC Blue finger/.test(v.text)));
  assert.ok(score(s).detail.grade.inSpecPct < 100);
});

test('navachab: ore polygon change — loads already on board keep their finger, new loads need re-routing', () => {
  const sc = navScenario('day', { events: [{ at: 60, type: 'oreChange', shovel: 'EX05', oreType: 'LGB' }] });
  const sim = engine.createSim(navachab(), sc, { seed: 1 });
  runNav(sim, 60.1);
  const d = sim.state.disruptions.find((x) => x.type === 'oreChange');
  assert.equal(d.resolvedAt, null);
  const loaded = sim.state.trucks.filter((t) => t.assign.shovel === 'EX05' && t.load && t.load.oreType === 'FWG');
  for (const t of sim.state.trucks.filter((x) => x.assign.shovel === 'EX05')) sim.assign(t.id, { dump: 'LGB' });
  runNav(sim, 61);
  assert.ok(d.resolvedAt != null);
  for (const t of loaded) if (t.load) assert.equal(t.load.dump, 'FWG', t.id + ' should finish its FW Green load');
  runNav(sim, 180);
  assert.equal(sim.summary().violations.filter((v) => v.code === 'misroute').length, 0);
  assert.ok(sim.state.tips.some((x) => x.dump === 'LGB' && x.oreType === 'LGB'));
});

test('navachab: HME is closed and trucks sent there never tip', () => {
  const sim = engine.createSim(navachab(), navScenario('day', { events: [] }), { seed: 1 });
  assert.equal(sim.state.dumps.HME.status, 'down');
  for (const t of sim.state.trucks.filter((x) => x.assign.shovel === 'EX03')) sim.assign(t.id, { dump: 'HME' });
  runNav(sim, 120);
  assert.equal(sim.state.dumps.HME.tips, 0);
});

test('assigning an unknown dump or loading unit is rejected', () => {
  const sim = engine.createSim(navachab(), navScenario('day'), { seed: 1 });
  assert.equal(sim.assign('N16', { dump: 'NOPE' }).ok, false);
  assert.equal(sim.assign('N16', { shovel: 'EX99' }).ok, false);
});

test('navachab: PB5 cycles are about 26 minutes', () => {
  const mine = createMine(navachab().layout);
  for (const unit of ['EX03', 'EX08']) {
    const p = mine.shortestPath(unit, 'TSF');
    const min = (mine.travelSeconds(p, true) + mine.travelSeconds(p.slice().reverse(), false)) / 60;
    assert.ok(min > 20 && min < 24, unit + ' travel ' + min.toFixed(1) + ' min (+ ~3.5 min loading and tipping)');
  }
});

test('navachab: trucks respect the 40 km/h governor and 30 km/h on down ramps', () => {
  const sp = createMine(navachab().layout).SPEEDS;
  for (const v of Object.values(sp)) assert.ok(v <= 40 / 3.6 + 1e-9);
  assert.ok(sp.emptyDownRamp <= 30 / 3.6 + 0.01 && sp.loadedDownRamp <= 30 / 3.6 + 0.01);
});

test('navachab: a unit can switch from ore to waste and from waste to ore mid-shift', () => {
  const sc = navScenario('day', { events: [
    { at: 30, type: 'faceChange', shovel: 'EX04', oreType: 'waste' },
    { at: 30, type: 'faceChange', shovel: 'EX08', oreType: 'OR1' }
  ] });
  const sim = engine.createSim(navachab(), sc, { seed: 1 });
  runNav(sim, 30.1);
  assert.equal(sim.state.shovels.EX04.material, 'waste');
  assert.equal(sim.state.shovels.EX08.material, 'ore');
  assert.equal(sim.state.shovels.EX08.oreType, 'OR1');
  const ds = sim.state.disruptions.filter((x) => x.type === 'oreChange');
  assert.equal(ds.length, 2);
  for (const t of sim.state.trucks.filter((x) => x.assign.shovel === 'EX04')) sim.assign(t.id, { dump: 'TSF' });
  for (const t of sim.state.trucks.filter((x) => x.assign.shovel === 'EX08')) sim.assign(t.id, { dump: 'OR1' });
  runNav(sim, 31);
  assert.ok(ds.every((d) => d.resolvedAt != null));
  runNav(sim, 180);
  const tips = sim.state.tips;
  assert.ok(tips.some((x) => x.source === 'EX04' && x.material === 'waste' && x.dump === 'TSF'));
  assert.ok(tips.some((x) => x.source === 'EX08' && x.oreType === 'OR1' && x.dump === 'OR1'));
  assert.equal(sim.summary().violations.filter((v) => v.category === 'process').length, 0);
});

test('navachab: starting faces differ between scenarios', () => {
  const faces = navachab().scenarios.map((s) => JSON.stringify(s.faces));
  assert.ok(new Set(faces).size >= 3);
});

test('navachab: PB3 and PB4 cycles are about 45 minutes', () => {
  const mine = createMine(navachab().layout);
  for (const [unit, dump] of [['EX04', 'MCB'], ['EX05', 'FWG'], ['EX07', 'TSF']]) {
    const p = mine.shortestPath(unit, dump);
    const min = (mine.travelSeconds(p, true) + mine.travelSeconds(p.slice().reverse(), false)) / 60;
    assert.ok(min > 36 && min < 46, unit + ' travel ' + min.toFixed(1) + ' min');
  }
});

test('navachab: a closed finger with no alternative is resolved by moving trucks off that unit', () => {
  const sc = navScenario('day', { events: [{ at: 5, type: 'dumpDown', dump: 'MCB', minutes: 20, reason: 'test' }] });
  const sim = engine.createSim(navachab(), sc, { seed: 1 });
  runNav(sim, 6);
  const d = sim.state.disruptions.find((x) => x.type === 'dumpDown');
  assert.equal(d.resolvedAt, null);
  for (const t of sim.state.trucks.filter((x) => x.assign.dump === 'MCB')) sim.assign(t.id, { shovel: 'EX08', dump: 'TSF' });
  runNav(sim, 7);
  assert.ok(d.resolvedAt != null);
});

test('navachab: only 3 units run; a parked unit can be started and parked again', () => {
  const sim = engine.createSim(navachab(), navScenario('day', { events: [] }), { seed: 1 });
  const running = () => Object.values(sim.state.shovels).filter((x) => x.status === 'operating').map((x) => x.id).sort();
  assert.deepEqual(running(), ['EX04', 'EX05', 'EX08']);
  assert.equal(sim.state.shovels.EX03.status, 'parked');
  assert.ok(sim.startUnit('EX03').ok);
  assert.equal(sim.state.shovels.EX03.status, 'starting');
  runNav(sim, 11);
  assert.equal(sim.state.shovels.EX03.status, 'operating');
  assert.ok(sim.parkUnit('EX03').ok);
  assert.equal(sim.state.shovels.EX03.status, 'parked');
  assert.equal(sim.startUnit('EX10').ok, false, 'EX10 is still being commissioned');
});

test('navachab: 8 trucks are unavailable for the shift and never move', () => {
  const sim = engine.createSim(navachab(), navScenario('day', { events: [] }), { seed: 1 });
  const out = sim.state.trucks.filter((t) => t.hold && t.hold.kind === 'unavailable');
  assert.equal(out.length, 8);
  sim.assign(out[0].id, { shovel: 'EX04', dump: 'MCB' });
  runNav(sim, 60);
  assert.equal(out[0].loads, 0);
  assert.equal(out[0].at, 'WS');
});

test('navachab: payloads are 90-100 t (HD785) and 80-90 t (CAT 777E)', () => {
  const sim = engine.createSim(navachab(), navScenario('day', { events: [] }), { seed: 1 });
  runNav(sim, 180);
  const byTruck = Object.fromEntries(sim.state.trucks.map((t) => [t.id, t.cls]));
  const tips = sim.state.tips;
  assert.ok(tips.length > 50);
  for (const x of tips) {
    const [lo, hi] = byTruck[x.truck] === 'HD785' ? [90, 100] : [80, 90];
    assert.ok(x.tonnes >= lo && x.tonnes <= hi, x.truck + ' ' + x.tonnes);
  }
});

test('navachab: PB3/PB4 hauls are scaled from PB5 (4.6 km / 26 min) to ~8.4-8.6 km / 45 min', () => {
  const mine = createMine(navachab().layout);
  for (const [unit, dump] of [['EX04', 'MCB'], ['EX05', 'FWG'], ['EX07', 'TSF'], ['NEX14002', 'MCR']]) {
    const km = mine.routeLength(mine.shortestPath(unit, dump)) / 1000;
    assert.ok(km > 8.3 && km < 8.7, unit + ' to ' + dump + ' ' + km.toFixed(2) + ' km');
  }
});

test('navachab: PB5 is 4.6 km from TSF Projects', () => {
  const mine = createMine(navachab().layout);
  assert.equal(Math.round(mine.routeLength(mine.shortestPath('EX03', 'TSF'))), 4600);
});

test('poor fragmentation slows loading at the affected unit', () => {
  const base = navScenario('day', { events: [] });
  const withFrag = navScenario('day', { events: [{ at: 0, type: 'fragmentation', shovel: 'EX05', factor: 1.7 }] });
  const rate = (sc) => {
    const sim = engine.createSim(navachab(), sc, { seed: 1 });
    for (const t of sim.state.trucks.filter((x) => x.assign.shovel === 'EX08')) sim.assign(t.id, { shovel: 'EX05', dump: 'FWG' });
    runNav(sim, 120);
    return sim.state.shovels.EX05.busyTime / Math.max(1, sim.state.shovels.EX05.loads);
  };
  assert.ok(rate(withFrag) > rate(base) * 1.3);
});
