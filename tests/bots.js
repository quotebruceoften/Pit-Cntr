/*
 * Scripted controllers used to calibrate scenarios and test that scoring
 * separates competent from incompetent play.
 */
'use strict';

const { createSim } = require('../js/sim/engine.js');
const { score } = require('../js/sim/scoring.js');

const WEIGHTS = { S1: 5, S2: 5, S3: 6 };

function distribute(total, ids) {
  const wsum = ids.reduce((a, id) => a + WEIGHTS[id], 0);
  const raw = ids.map((id) => ({ id, exact: (total * WEIGHTS[id]) / wsum }));
  const out = {};
  let used = 0;
  for (const r of raw) { out[r.id] = Math.floor(r.exact); used += out[r.id]; }
  raw.sort((a, b) => (b.exact % 1) - (a.exact % 1));
  for (let i = 0; used < total; i++, used++) out[raw[i % raw.length].id]++;
  return out;
}

// A competent controller: rebalances the fleet whenever equipment
// availability changes, handles blasts, fuel and radio calls correctly.
function expertController(sim, opts) {
  opts = opts || {};
  const s = sim.state;
  const answerAfter = opts.answerAfter != null ? opts.answerAfter : 5;
  let lastCheck = -Infinity;

  return function control() {
    for (const call of s.radio.slice()) {
      if (s.real - call.real >= answerAfter) {
        const best = call.options.find((o) => o.rating === 'best');
        sim.answerRadio(call.id, best.index);
      }
    }
    if (s.t - lastCheck < 60) return;
    lastCheck = s.t;

    const b = s.blast;
    const blastActive = b && b.status !== 'reopened';
    if (b && blastActive && s.shovels[b.shovel].status === 'operating' && b.status !== 'fired') {
      sim.tram(b.shovel, 'safe');
    }
    if (b && b.status === 'reopened' && s.shovels[b.shovel].status === 'standby') {
      sim.tram(b.shovel, 'face');
    }

    const avail = Object.values(s.shovels)
      .filter((sh) => sh.status === 'operating' && !(blastActive && b.shovel === sh.id))
      .map((sh) => sh.id);
    const oreDump = s.dumps.CR.status === 'operating' ? 'CR' : 'ROM';

    const released = new Set();
    for (const d of s.disruptions) if (d.type === 'available') d.label.replace('Deploy ', '').split(', ').forEach((id) => released.add(id));
    const pool = s.trucks.filter((tr) => tr.assign.shovel !== 'PARK' || released.has(tr.id));

    if (avail.length) {
      const want = distribute(pool.length, avail);
      const have = {};
      for (const id of avail) have[id] = 0;
      const movers = [];
      for (const tr of pool) {
        const cur = tr.assign.shovel;
        if (avail.includes(cur) && have[cur] < want[cur]) have[cur]++;
        else movers.push(tr);
      }
      for (const tr of movers) {
        const target = avail.slice().sort((x, y) => (want[y] - have[y]) - (want[x] - have[x]))[0];
        have[target]++;
        sim.assign(tr.id, { shovel: target, dump: s.shovels[target].material === 'ore' ? oreDump : 'WD' });
      }
      for (const tr of pool) {
        const sh = s.shovels[tr.assign.shovel];
        if (!sh) continue;
        const dump = sh.material === 'ore' ? oreDump : 'WD';
        if (tr.assign.dump !== dump) sim.assign(tr.id, { dump });
      }
    }

    for (const tr of s.trucks) if (tr.fuelLow && !tr.pendingFuel) sim.sendToFuel(tr.id);

    if (b && (b.status === 'scheduled' || b.status === 'guard')) {
      const sh = s.shovels[b.shovel];
      const inside = s.trucks.some((tr) => Math.hypot(tr.x - b.zone.x, tr.y - b.zone.y) <= b.zone.r);
      const shovelClear = Math.hypot(sh.x - b.zone.x, sh.y - b.zone.y) > b.zone.r;
      if (!inside && shovelClear) sim.confirmBlastClear();
    }
  };
}

// A reckless controller: always picks unsafe radio answers and gives the
// blast all-clear immediately.
function recklessController(sim) {
  const s = sim.state;
  return function control() {
    for (const call of s.radio.slice()) {
      const bad = call.options.find((o) => o.rating === 'unsafe') || call.options.find((o) => o.rating === 'poor') || call.options[0];
      sim.answerRadio(call.id, bad.index);
    }
    if (s.blast && (s.blast.status === 'scheduled' || s.blast.status === 'guard')) sim.confirmBlastClear();
  };
}

function run(scenario, makeController, opts) {
  opts = opts || {};
  const sim = createSim(scenario, { seed: opts.seed || 42 });
  const control = makeController ? makeController(sim, opts) : () => {};
  const speed = scenario.speed || 15;
  while (!sim.state.finished) {
    control();
    sim.step(1, 1 / speed);
  }
  const summary = sim.summary();
  return { sim, summary, result: score(summary) };
}

module.exports = { expertController, recklessController, run };
