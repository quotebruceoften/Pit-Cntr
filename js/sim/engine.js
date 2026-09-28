/*
 * Discrete-time simulation of an open-pit load & haul operation.
 *
 * The candidate plays the pit controller: they assign trucks to shovels and
 * dumps, respond to radio calls and manage disruptions (breakdowns, crusher
 * outages, blasts, geotechnical alarms). The engine records everything the
 * scoring module needs to rate their competency.
 *
 * Time is in simulated seconds (state.t). A separate "real" clock
 * (state.real) measures wall-clock seconds so radio-call response times
 * reflect how quickly the candidate actually reacted.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./mine.js'));
  } else {
    root.PitSim = root.PitSim || {};
    Object.assign(root.PitSim, factory(root.PitSim));
  }
})(typeof self !== 'undefined' ? self : this, function (mine) {
  'use strict';

  const { NODES, SHOVELS, DUMPS, BASE, edge, shortestPath } = mine;

  const PAYLOAD_T = 220;
  const SPOT_SEC = 30;
  const FUEL_SEC = 8 * 60;
  const TRAM_SEC = 8 * 60;
  const OUT_OF_FUEL_SEC = 45 * 60;
  const CRUSHER_CONTAMINATION_SEC = 20 * 60;
  const BLEND_WINDOW = 6;
  const BLEND_RECOVERY_SEC = 20 * 60;
  const DEFAULT_RADIO_TIMEOUT = 35;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createSim(scenario, opts) {
    opts = opts || {};
    const rng = mulberry32(opts.seed != null ? opts.seed : (scenario.seed || 1));
    const jitter = (spread) => 1 + (rng() * 2 - 1) * spread;

    const state = {
      scenarioId: scenario.id,
      t: 0,
      real: 0,
      duration: scenario.durationMin * 60,
      startClockMin: scenario.startClockMin || 360,
      speedFactor: 1,
      flags: {},
      trucks: [],
      shovels: {},
      dumps: {},
      tips: [],
      alerts: [],
      violations: [],
      radio: [],
      decisions: [],
      disruptions: [],
      actions: [],
      zones: [],
      blast: null,
      totals: { oreCrusher: 0, oreRom: 0, oreLost: 0, waste: 0, queueTime: 0, idleTime: 0 },
      finished: false
    };

    const disruptionChecks = {};
    let eventIdx = 0;
    let radioSeq = 0;
    const events = (scenario.events || []).slice().sort((a, b) => a.at - b.at);
    const listeners = [];

    // ---------------------------------------------------------------- setup

    for (const def of SHOVELS) {
      const home = NODES[def.id];
      state.shovels[def.id] = Object.assign({}, def, {
        status: 'operating', lastForcedOutAt: -Infinity, until: 0, x: home.x, y: home.y, home: { x: home.x, y: home.y },
        tram: null, queue: [], serving: null, opTime: 0, busyTime: 0, hangTime: 0, loads: 0, tonnes: 0
      });
    }
    for (const def of DUMPS) {
      state.dumps[def.id] = Object.assign({}, def, {
        status: 'operating', until: 0, queue: [], serving: [], tonnes: 0, tips: 0
      });
    }
    scenario.fleet.forEach((f, i) => {
      const n = NODES[BASE];
      state.trucks.push({
        id: f.id,
        assign: { shovel: f.shovel, dump: f.dump },
        phase: 'idle',
        purpose: null,
        departAt: f.departSec != null ? f.departSec : i * 30,
        load: null,
        route: null, seg: 0, pos: 0, moving: false,
        at: BASE, x: n.x, y: n.y,
        hold: null,
        fuelLow: false, pendingFuel: false, fuelDeadline: null,
        speedMul: jitter(0.04),
        serviceLeft: 0,
        loads: 0, tonnes: 0, queueTime: 0, idleTime: 0,
        zoneFlags: {}
      });
    });

    // -------------------------------------------------------------- helpers

    const truckById = (id) => state.trucks.find((tr) => tr.id === id);

    function emit(kind, payload) {
      for (const fn of listeners) fn(kind, payload);
    }

    function alert(level, text) {
      const a = { t: state.t, level, text };
      state.alerts.push(a);
      emit('alert', a);
    }

    function violation(severity, category, text) {
      const v = { t: state.t, severity, category, text };
      state.violations.push(v);
      emit('violation', v);
      alert(severity === 'minor' ? 'warn' : 'danger', (category === 'safety' ? 'SAFETY: ' : 'PROCESS: ') + text);
    }

    function record(type, detail) {
      state.actions.push({ t: state.t, real: state.real, type, detail });
    }

    function removeFromLocation(truck) {
      for (const s of Object.values(state.shovels)) {
        s.queue = s.queue.filter((id) => id !== truck.id);
        if (s.serving === truck.id) s.serving = null;
      }
      for (const d of Object.values(state.dumps)) {
        d.queue = d.queue.filter((id) => id !== truck.id);
        d.serving = d.serving.filter((sv) => sv.id !== truck.id);
      }
    }

    function placeAtNode(truck, node) {
      truck.at = node;
      truck.x = NODES[node].x;
      truck.y = NODES[node].y;
    }

    // ------------------------------------------------------ truck movement

    function routeTo(truck, target, phase, purpose) {
      truck.phase = phase;
      truck.purpose = purpose || null;
      truck.dest = target;
      if (truck.moving) {
        const a = truck.route[truck.seg];
        const b = truck.route[truck.seg + 1];
        const onward = shortestPath(b, target);
        if (onward.length > 1 && onward[1] === a) {
          // Turn around on the current segment.
          const len = edge(a, b).len;
          truck.route = [b].concat(shortestPath(a, target));
          truck.pos = len - truck.pos;
        } else {
          truck.route = [a].concat(onward);
        }
        truck.seg = 0;
        return;
      }
      if (truck.at === target) {
        truck.route = null;
        arrive(truck);
        return;
      }
      truck.route = shortestPath(truck.at, target);
      truck.seg = 0;
      truck.pos = 0;
      truck.moving = true;
      truck.at = null;
    }

    function nextLeg(truck) {
      if (truck.pendingFuel) return routeTo(truck, BASE, 'toBase', 'fuel');
      if (truck.assign.shovel === 'PARK') return routeTo(truck, BASE, 'toBase', 'park');
      return routeTo(truck, truck.assign.shovel, 'toShovel');
    }

    function resume(truck) {
      if (truck.phase === 'fueling') return;
      if (truck.load) return routeTo(truck, truck.load.dump, 'toDump');
      nextLeg(truck);
    }

    function arrive(truck) {
      const node = truck.at;
      if (truck.phase === 'toShovel') {
        const s = state.shovels[node];
        if (!s) return nextLeg(truck);
        truck.phase = 'queueShovel';
        s.queue.push(truck.id);
      } else if (truck.phase === 'toDump') {
        const d = state.dumps[node];
        truck.phase = 'queueDump';
        d.queue.push(truck.id);
      } else if (truck.phase === 'toBase') {
        if (truck.purpose === 'fuel') {
          truck.phase = 'fueling';
          truck.serviceLeft = FUEL_SEC;
        } else {
          truck.phase = 'parked';
        }
      }
    }

    function moveTruck(truck, h) {
      let left = h;
      while (left > 0 && truck.moving) {
        const a = truck.route[truck.seg];
        const b = truck.route[truck.seg + 1];
        const e = edge(a, b);
        const v = mine.segmentSpeed(a, b, !!truck.load) * truck.speedMul * state.speedFactor;
        const need = (e.len - truck.pos) / v;
        if (need <= left) {
          left -= need;
          truck.seg++;
          truck.pos = 0;
          if (truck.seg >= truck.route.length - 1) {
            truck.moving = false;
            truck.route = null;
            placeAtNode(truck, b);
            arrive(truck);
            return;
          }
        } else {
          truck.pos += v * left;
          left = 0;
        }
      }
      if (truck.moving) {
        const a = NODES[truck.route[truck.seg]];
        const b = NODES[truck.route[truck.seg + 1]];
        const f = truck.pos / edge(truck.route[truck.seg], truck.route[truck.seg + 1]).len;
        truck.x = a.x + (b.x - a.x) * f;
        truck.y = a.y + (b.y - a.y) * f;
      }
    }

    function holdTruck(truck, seconds, reason, kind) {
      const wasShovel = truck.phase === 'queueShovel' || truck.phase === 'loading';
      const wasDump = truck.phase === 'queueDump' || truck.phase === 'dumping';
      removeFromLocation(truck);
      if (wasShovel) truck.phase = 'toShovel';
      if (wasDump) truck.phase = 'toDump';
      truck.hold = { until: state.t + seconds, reason, kind };
    }

    function updateTrucks(h) {
      for (const truck of state.trucks) {
        if (truck.hold) {
          if (state.t >= truck.hold.until) {
            const reason = truck.hold.reason;
            truck.hold = null;
            alert('info', truck.id + ' back in service (' + reason + ').');
            resume(truck);
          } else {
            continue;
          }
        }
        if (truck.phase === 'idle') {
          truck.idleTime += h;
          state.totals.idleTime += h;
          if (state.t >= truck.departAt) nextLeg(truck);
          continue;
        }
        if (truck.phase === 'parked') {
          truck.idleTime += h;
          state.totals.idleTime += h;
          continue;
        }
        if (truck.phase === 'fueling') {
          truck.serviceLeft -= h;
          if (truck.serviceLeft <= 0) {
            truck.fuelLow = false;
            truck.pendingFuel = false;
            truck.fuelDeadline = null;
            alert('info', truck.id + ' refuelled and leaving the fuel bay.');
            nextLeg(truck);
          }
          continue;
        }
        if (truck.phase === 'queueShovel' || truck.phase === 'queueDump') {
          truck.queueTime += h;
          state.totals.queueTime += h;
        }
        if (truck.moving) moveTruck(truck, h);

        if (truck.fuelLow && state.t >= truck.fuelDeadline && !truck.hold) {
          const refuelling = truck.phase === 'fueling' || (truck.phase === 'toBase' && truck.purpose === 'fuel');
          if (!refuelling) {
            holdTruck(truck, OUT_OF_FUEL_SEC, 'recovered after running out of fuel', 'breakdown');
            truck.fuelLow = false;
            truck.pendingFuel = false;
            truck.fuelDeadline = null;
            violation('minor', 'process', truck.id + ' ran out of fuel on the haul road and needs recovery.');
          }
        }
      }
    }

    // ------------------------------------------------------ loading/dumping

    function defaultDump(shovel) {
      return shovel.material === 'ore' ? 'CR' : 'WD';
    }

    function completeLoad(shovel, truck) {
      const tonnes = Math.round(PAYLOAD_T * (0.97 + rng() * 0.06));
      const grade = shovel.material === 'ore' ? Math.round(shovel.grade * jitter(0.08) * 100) / 100 : 0;
      // The load goes to the dump assigned at loading time; a later change of
      // circuit only applies after this load is tipped.
      truck.load = { material: shovel.material, grade, tonnes, source: shovel.id, dump: truck.loadDump };
      shovel.loads++;
      shovel.tonnes += tonnes;
      routeTo(truck, truck.load.dump, 'toDump');
    }

    function completeDump(dump, truck) {
      const load = truck.load;
      const tip = { t: state.t, truck: truck.id, dump: dump.id, material: load.material, grade: load.grade, tonnes: load.tonnes, source: load.source };
      dump.tonnes += load.tonnes;
      dump.tips++;
      truck.loads++;
      truck.tonnes += load.tonnes;

      if (load.material === 'waste') {
        state.totals.waste += load.tonnes;
        if (dump.id === 'CR') {
          violation('major', 'process', truck.id + ' tipped waste into the crusher — crusher blocked for clean-out.');
          dump.status = 'down';
          dump.until = state.t + CRUSHER_CONTAMINATION_SEC;
          dump.downReason = 'Waste contamination clean-out';
        } else if (dump.id === 'ROM') {
          violation('minor', 'process', truck.id + ' tipped waste on the ROM ore stockpile (dilution).');
        }
      } else if (dump.id === 'CR') {
        state.totals.oreCrusher += load.tonnes;
      } else if (dump.id === 'ROM') {
        state.totals.oreRom += load.tonnes;
      } else {
        state.totals.oreLost += load.tonnes;
        violation('major', 'process', truck.id + ' tipped ' + load.tonnes + ' t of ore on the waste dump (ore loss).');
      }

      if (dump.id === 'CR') {
        const crusherTips = state.tips.filter((x) => x.dump === 'CR').concat([tip]);
        const window = crusherTips.slice(-BLEND_WINDOW);
        const tonnes = window.reduce((s, x) => s + x.tonnes, 0);
        tip.blend = window.reduce((s, x) => s + x.grade * x.tonnes, 0) / tonnes;
        tip.inSpec = tip.blend >= scenario.blend.min && tip.blend <= scenario.blend.max;
        // Blend is only assessable once every ore source has been available
        // long enough for the controller to rebalance the fleet.
        tip.assessable = Object.values(state.shovels).every((s) => s.material !== 'ore' ||
          state.t - s.lastForcedOutAt >= BLEND_RECOVERY_SEC);
      }
      state.tips.push(tip);
      truck.load = null;
      nextLeg(truck);
    }

    function serveLocations(h) {
      for (const s of Object.values(state.shovels)) {
        const operating = s.status === 'operating';
        if (operating) s.opTime += h;
        if (s.serving) {
          const truck = truckById(s.serving);
          if (operating) {
            s.busyTime += h;
            truck.serviceLeft -= h;
            if (truck.serviceLeft <= 0) {
              s.serving = null;
              completeLoad(s, truck);
            }
          }
        } else if (operating) {
          s.hangTime += h;
        }
        if (operating && !s.serving && s.queue.length) {
          const truck = truckById(s.queue.shift());
          s.serving = truck.id;
          truck.phase = 'loading';
          truck.loadDump = truck.assign.shovel === s.id ? truck.assign.dump : defaultDump(s);
          truck.serviceLeft = s.loadSec * jitter(0.1) + SPOT_SEC;
        }
      }
      for (const d of Object.values(state.dumps)) {
        const operating = d.status === 'operating';
        if (operating) {
          for (const sv of d.serving.slice()) {
            const truck = truckById(sv.id);
            truck.serviceLeft -= h;
            if (truck.serviceLeft <= 0) {
              d.serving = d.serving.filter((x) => x.id !== sv.id);
              completeDump(d, truck);
            }
          }
        }
        while (d.status === 'operating' && d.serving.length < d.bays && d.queue.length) {
          const truck = truckById(d.queue.shift());
          d.serving.push({ id: truck.id });
          truck.phase = 'dumping';
          truck.serviceLeft = d.dumpSec * jitter(0.1);
        }
      }
    }

    // ------------------------------------------------------------ equipment

    function updateEquipment() {
      for (const s of Object.values(state.shovels)) {
        if ((s.status === 'down' || s.status === 'evacuated') && state.t >= s.until) {
          if (s.status === 'evacuated') {
            state.zones = state.zones.filter((z) => z.id !== 'geo-' + s.id);
            alert('info', 'Geotechnical engineer has cleared ' + s.name + ' to resume digging.');
          } else {
            alert('info', s.name + ' repaired and back in operation.');
          }
          s.status = 'operating';
          s.downReason = null;
        }
        if (s.status === 'tramming') {
          const f = Math.min(1, (state.t - s.tram.start) / TRAM_SEC);
          s.x = s.tram.from.x + (s.tram.to.x - s.tram.from.x) * f;
          s.y = s.tram.from.y + (s.tram.to.y - s.tram.from.y) * f;
          if (f >= 1) {
            if (s.tram.target === 'safe') {
              s.status = 'standby';
              alert('info', s.name + ' has trammed clear of the blast zone and is on standby.');
            } else {
              s.status = 'operating';
              alert('info', s.name + ' is back at the face and ready to load.');
            }
            s.tram = null;
          }
        }
      }
      for (const d of Object.values(state.dumps)) {
        if (d.status === 'down' && state.t >= d.until) {
          d.status = 'operating';
          d.downReason = null;
          alert('info', d.name + ' is back online and accepting trucks.');
        }
      }
      updateBlast();
      for (const s of Object.values(state.shovels)) {
        if (forcedOut(s)) s.lastForcedOutAt = state.t;
      }
    }

    // A loading unit out of action for reasons the controller cannot avoid.
    // Leaving a shovel on standby once its blast area has reopened is a
    // controller choice and does not count.
    function forcedOut(s) {
      if (s.status === 'down' || s.status === 'evacuated' || s.status === 'tramming') return true;
      if (s.status === 'standby') return !!state.blast && state.blast.shovel === s.id && state.blast.status !== 'reopened';
      return false;
    }

    function equipmentInZone(zone) {
      const inside = [];
      for (const tr of state.trucks) {
        if (Math.hypot(tr.x - zone.x, tr.y - zone.y) <= zone.r) inside.push(tr.id);
      }
      return inside;
    }

    function shovelInZone(shovel, zone) {
      return Math.hypot(shovel.x - zone.x, shovel.y - zone.y) <= zone.r;
    }

    function updateBlast() {
      const b = state.blast;
      if (!b) return;
      const s = state.shovels[b.shovel];
      if (b.status === 'scheduled' && state.t >= b.guardAt) {
        b.status = 'guard';
        alert('danger', 'Blast guard period has started for ' + s.name + '. Exclusion zone must be clear.');
        if (shovelInZone(s, b.zone)) {
          violation('major', 'safety', s.name + ' still inside the blast exclusion zone at the start of the guard period.');
        }
      }
      if (b.status === 'guard' && state.t >= b.blastAt && !b.delayed) {
        b.delayed = true;
        violation('minor', 'process', 'Blast delayed — no all-clear from the pit controller by the scheduled firing time.');
      }
      if (b.status === 'confirmed' && state.t >= b.blastAt) fireBlast();
      if (b.status === 'fired' && state.t >= b.reopenAt) {
        b.status = 'reopened';
        state.zones = state.zones.filter((z) => z.id !== 'blast');
        alert('info', 'Post-blast inspection complete — ' + s.name + ' area reopened. Shovel may return to the face.');
      }
    }

    function fireBlast() {
      const b = state.blast;
      const s = state.shovels[b.shovel];
      b.status = 'fired';
      b.firedAt = state.t;
      b.reopenAt = state.t + b.reentrySec;
      const inside = equipmentInZone(b.zone);
      if (shovelInZone(s, b.zone)) inside.push(s.id);
      for (const id of inside) {
        violation('critical', 'safety', id + ' was inside the blast exclusion zone when the shot was fired.');
      }
      alert('danger', 'BLAST FIRED at ' + s.name + ' bench. Zone closed for fume clearance and inspection.');
    }

    function checkZones() {
      for (const zone of state.zones) {
        let severity = zone.severity;
        if (zone.kind === 'blast') {
          const st = state.blast.status;
          if (st === 'scheduled') continue;
          severity = st === 'guard' ? 'major' : 'critical';
        }
        if (state.t < zone.activeFrom) continue;
        for (const tr of state.trucks) {
          const inside = Math.hypot(tr.x - zone.x, tr.y - zone.y) <= zone.r;
          if (!inside) continue;
          const graceOk = zone.initialInside.includes(tr.id) && state.t - zone.activeFrom <= zone.grace;
          if (graceOk) continue;
          const flag = zone.id + ':' + severity;
          if (tr.zoneFlags[flag]) continue;
          tr.zoneFlags[flag] = true;
          const what = zone.kind === 'blast'
            ? (state.blast.status === 'guard' ? 'inside the blast exclusion zone during the guard period' : 'inside the blast exclusion zone after the all-clear')
            : 'inside the geotechnical exclusion zone at ' + zone.label;
          violation(severity, 'safety', tr.id + ' ' + what + '.');
        }
      }
    }

    function addZone(zone) {
      zone.initialInside = equipmentInZone(zone);
      state.zones.push(zone);
    }

    // ---------------------------------------------------------- disruptions

    function addDisruption(d, check) {
      d.resolvedAt = null;
      d.endedAt = null;
      state.disruptions.push(d);
      disruptionChecks[d.id] = check;
    }

    function trucksAssignedTo(pred) {
      return state.trucks.filter(pred).map((tr) => tr.id);
    }

    function checkDisruptions() {
      for (const d of state.disruptions) {
        if (d.resolvedAt != null || d.endedAt != null) continue;
        const c = disruptionChecks[d.id];
        if (c.resolved()) d.resolvedAt = state.t;
        else if (c.ended()) d.endedAt = state.t;
      }
    }

    // --------------------------------------------------------------- events

    function applyEffects(effects) {
      for (const e of effects || []) {
        if (e.type === 'hold') {
          const tr = truckById(e.truck);
          holdTruck(tr, e.minutes * 60, e.reason, e.kind || 'relief');
        } else if (e.type === 'evacuate') {
          evacuateShovel(e.shovel, e.minutes);
        } else if (e.type === 'speed') {
          state.speedFactor = e.factor;
          alert('info', 'Haul road speed restriction in force (' + Math.round(e.factor * 100) + '% of normal).');
        } else if (e.type === 'flag') {
          state.flags[e.key] = true;
        } else if (e.type === 'fuel') {
          sendToFuel(e.truck, true);
        } else if (e.type === 'violation') {
          violation(e.severity, e.category || 'safety', e.text);
        } else if (e.type === 'alert') {
          alert(e.level || 'info', e.text);
        }
      }
    }

    function evacuateShovel(id, minutes) {
      const s = state.shovels[id];
      if (s.serving) {
        const tr = truckById(s.serving);
        s.queue.unshift(tr.id);
        tr.phase = 'queueShovel';
        s.serving = null;
      }
      s.status = 'evacuated';
      s.until = state.t + minutes * 60;
      s.downReason = 'Geotechnical evacuation';
      addZone({ id: 'geo-' + id, kind: 'geotech', label: s.name, x: s.home.x, y: s.home.y, r: 260, severity: 'major', activeFrom: state.t, grace: 180 });
      alert('danger', s.name + ' evacuated — geotechnical exclusion zone in force. Keep all trucks out.');
      addDisruption(
        { id: 'geo-' + id + '-' + state.t, type: 'geotech', label: 'Withdraw trucks from ' + s.name + ' (geotech)', start: state.t, target: 3 * 60, limit: 15 * 60 },
        {
          resolved: () => trucksAssignedTo((tr) => tr.assign.shovel === id).length === 0,
          ended: () => s.status !== 'evacuated'
        }
      );
    }

    function conditionMet(ev) {
      if (!ev.when) return true;
      const val = !!state.flags[ev.when.flag];
      return val === ev.when.is;
    }

    function processEvents() {
      while (eventIdx < events.length && events[eventIdx].at * 60 <= state.t) {
        const ev = events[eventIdx++];
        if (!conditionMet(ev)) continue;
        runEvent(ev);
      }
    }

    function runEvent(ev) {
      switch (ev.type) {
        case 'alert':
          alert(ev.level || 'info', ev.text);
          break;
        case 'radio':
          issueRadio(ev);
          break;
        case 'truckBreakdown': {
          const tr = truckById(ev.truck);
          holdTruck(tr, ev.minutes * 60, 'repaired by field maintenance', 'breakdown');
          alert('warn', ev.text || (tr.id + ' broken down.'));
          if (ev.radio) issueRadio(ev.radio);
          break;
        }
        case 'shovelDown': {
          const s = state.shovels[ev.shovel];
          s.status = 'down';
          s.until = state.t + ev.minutes * 60;
          s.downReason = ev.reason;
          alert('danger', s.name + ' DOWN: ' + ev.reason + '. Estimated repair ' + ev.minutes + ' min.');
          addDisruption(
            { id: 'down-' + s.id + '-' + state.t, type: 'shovelDown', label: s.name + ' breakdown', start: state.t, target: 5 * 60, limit: 25 * 60 },
            {
              resolved: () => trucksAssignedTo((tr) => tr.assign.shovel === s.id).length === 0,
              ended: () => s.status !== 'down'
            }
          );
          break;
        }
        case 'crusherDown': {
          const d = state.dumps.CR;
          d.status = 'down';
          d.until = state.t + ev.minutes * 60;
          d.downReason = ev.reason;
          alert('danger', 'CRUSHER DOWN: ' + ev.reason + '. Estimated ' + ev.minutes + ' min.');
          addDisruption(
            { id: 'crusher-' + state.t, type: 'crusherDown', label: 'Crusher outage', start: state.t, target: 5 * 60, limit: 25 * 60 },
            {
              resolved: () => trucksAssignedTo((tr) => tr.assign.dump === 'CR').length === 0,
              ended: () => d.status !== 'down'
            }
          );
          break;
        }
        case 'fuelLow': {
          const tr = truckById(ev.truck);
          tr.fuelLow = true;
          tr.fuelDeadline = state.t + ev.minutes * 60;
          alert('warn', tr.id + ' low fuel warning — approx. ' + ev.minutes + ' min of fuel remaining.');
          addDisruption(
            { id: 'fuel-' + tr.id + '-' + state.t, type: 'fuel', label: tr.id + ' low fuel', start: state.t, target: 10 * 60, limit: ev.minutes * 60 },
            {
              resolved: () => tr.pendingFuel || !tr.fuelLow,
              ended: () => state.t >= tr.fuelDeadline || !tr.fuelLow
            }
          );
          if (ev.radio) issueRadio(ev.radio);
          break;
        }
        case 'available': {
          alert('info', ev.text);
          const ids = ev.trucks;
          addDisruption(
            { id: 'avail-' + state.t, type: 'available', label: 'Deploy ' + ids.join(', '), start: state.t, target: 5 * 60, limit: 20 * 60 },
            {
              resolved: () => ids.every((id) => truckById(id).assign.shovel !== 'PARK'),
              ended: () => false
            }
          );
          break;
        }
        case 'blast': {
          const s = state.shovels[ev.shovel];
          const zone = { id: 'blast', kind: 'blast', label: s.name + ' blast', x: s.home.x, y: s.home.y, r: ev.radius || 330, severity: 'major', activeFrom: state.t, grace: 0 };
          state.blast = {
            shovel: ev.shovel,
            zone,
            announcedAt: state.t,
            guardAt: state.t + (ev.blastIn - (ev.guard || 10)) * 60,
            blastAt: state.t + ev.blastIn * 60,
            reentrySec: (ev.reentry || 20) * 60,
            status: 'scheduled',
            confirmedAt: null, firedAt: null, reopenAt: null, delayed: false
          };
          state.zones.push(zone);
          zone.initialInside = [];
          alert('danger', 'BLAST NOTICE: ' + s.name + ' bench to be fired at ' + clock(state.blast.blastAt) +
            '. Guard period from ' + clock(state.blast.guardAt) + '. Tram ' + s.name + ' clear, withdraw all trucks, then give the all-clear.');
          addDisruption(
            { id: 'blast', type: 'blast', label: 'Blast clearance & all-clear', start: state.t, target: state.blast.blastAt - state.t, limit: state.blast.blastAt - state.t + 15 * 60 },
            {
              resolved: () => state.blast.confirmedAt != null,
              ended: () => false
            }
          );
          break;
        }
        case 'speed':
          state.speedFactor = ev.factor;
          break;
        case 'violation':
          violation(ev.severity, ev.category || 'safety', ev.text);
          break;
        default:
          throw new Error('Unknown event type ' + ev.type);
      }
    }

    function issueRadio(ev) {
      const order = ev.options.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const call = {
        id: 'R' + (++radioSeq),
        key: ev.id,
        from: ev.from,
        message: ev.message,
        competency: ev.competency || 'Decision making',
        options: order.map((i) => Object.assign({ index: i }, ev.options[i])),
        t: state.t,
        real: state.real,
        deadlineReal: state.real + (ev.timeout || DEFAULT_RADIO_TIMEOUT),
        timeoutEffects: ev.timeoutEffects || [],
        timeoutText: ev.timeoutText || 'No response given in time.'
      };
      state.radio.push(call);
      emit('radio', call);
    }

    function checkRadioTimeouts() {
      for (const call of state.radio.slice()) {
        if (state.real < call.deadlineReal) continue;
        state.radio = state.radio.filter((c) => c !== call);
        const best = call.options.find((o) => o.rating === 'best');
        state.decisions.push({
          id: call.id, key: call.key, t: call.t, from: call.from, message: call.message,
          rating: 'timeout', chosen: null, best: best ? best.text : null,
          feedback: call.timeoutText, responseReal: null
        });
        alert('warn', 'Radio call from ' + call.from + ' went unanswered.');
        applyEffects(call.timeoutEffects);
      }
    }

    // ------------------------------------------------------------- commands

    function assign(truckId, a) {
      const truck = truckById(truckId);
      if (!truck) return { ok: false, reason: 'Unknown truck' };
      const next = { shovel: a.shovel || truck.assign.shovel, dump: a.dump || truck.assign.dump };
      if (next.shovel === truck.assign.shovel && next.dump === truck.assign.dump) return { ok: true };
      const prev = truck.assign;
      truck.assign = next;
      record('assign', { truck: truckId, from: prev, to: next });
      if (truck.hold) return { ok: true };
      const shovelChanged = prev.shovel !== next.shovel;
      const dumpChanged = prev.dump !== next.dump;
      if (shovelChanged) {
        if (truck.phase === 'toShovel' || truck.phase === 'parked' ||
            (truck.phase === 'toBase' && truck.purpose === 'park')) {
          nextLeg(truck);
        } else if (truck.phase === 'queueShovel') {
          removeFromLocation(truck);
          nextLeg(truck);
        }
      }
      if (dumpChanged && !shovelChanged && truck.phase === 'loading') truck.loadDump = next.dump;
      // Changing only the dump on the same circuit redirects the load on board.
      if (dumpChanged && !shovelChanged && truck.load && truck.load.source === next.shovel) {
        truck.load.dump = next.dump;
        if (truck.phase === 'toDump') {
          routeTo(truck, next.dump, 'toDump');
        } else if (truck.phase === 'queueDump') {
          removeFromLocation(truck);
          routeTo(truck, next.dump, 'toDump');
        }
      }
      return { ok: true };
    }

    function sendToFuel(truckId, viaRadio) {
      const truck = truckById(truckId);
      if (!truck) return { ok: false, reason: 'Unknown truck' };
      if (truck.pendingFuel || truck.phase === 'fueling') return { ok: false, reason: truck.id + ' is already going to fuel.' };
      truck.pendingFuel = true;
      if (!viaRadio) record('fuel', { truck: truckId });
      if (truck.hold) return { ok: true };
      if (!truck.load && (truck.phase === 'toShovel' || truck.phase === 'queueShovel' || truck.phase === 'parked' ||
          truck.phase === 'idle' || truck.phase === 'toBase')) {
        removeFromLocation(truck);
        nextLeg(truck);
      }
      return { ok: true };
    }

    function tram(shovelId, target) {
      const s = state.shovels[shovelId];
      if (!s || !s.safePos) return { ok: false, reason: 'This unit has no designated safe tramming position.' };
      if (target === 'safe') {
        if (s.status !== 'operating') return { ok: false, reason: s.name + ' must be operating to tram (currently ' + s.status + ').' };
        if (s.serving) {
          const tr = truckById(s.serving);
          s.queue.unshift(tr.id);
          tr.phase = 'queueShovel';
          s.serving = null;
        }
        s.status = 'tramming';
        s.tram = { target, start: state.t, from: { x: s.x, y: s.y }, to: s.safePos };
      } else {
        if (s.status !== 'standby') return { ok: false, reason: s.name + ' is not on standby.' };
        if (state.blast && state.blast.shovel === shovelId && state.blast.status !== 'reopened') {
          return { ok: false, reason: 'Blast area not yet reopened — re-entry is not permitted.' };
        }
        s.status = 'tramming';
        s.tram = { target, start: state.t, from: { x: s.x, y: s.y }, to: s.home };
      }
      record('tram', { shovel: shovelId, target });
      return { ok: true };
    }

    function confirmBlastClear() {
      const b = state.blast;
      if (!b) return { ok: false, reason: 'No blast is scheduled.' };
      if (b.status !== 'scheduled' && b.status !== 'guard') return { ok: false, reason: 'All-clear already given.' };
      const inside = equipmentInZone(b.zone);
      const s = state.shovels[b.shovel];
      if (shovelInZone(s, b.zone)) inside.push(s.id);
      record('blastClear', { inside });
      b.confirmedAt = state.t;
      b.status = 'confirmed';
      if (inside.length) {
        violation('critical', 'safety', 'False all-clear given for the blast: ' + inside.join(', ') + ' still inside the exclusion zone.');
        for (const id of inside) {
          const tr = truckById(id);
          if (tr) tr.zoneFlags['blast:critical'] = true;
        }
      } else {
        alert('info', 'All-clear confirmed with the shotfirer. Zone locked until after firing.');
      }
      if (state.t >= b.blastAt) fireBlast();
      return { ok: true, inside };
    }

    function answerRadio(callId, optionIndex) {
      const call = state.radio.find((c) => c.id === callId);
      if (!call) return { ok: false, reason: 'Call no longer active.' };
      const opt = call.options.find((o) => o.index === optionIndex);
      state.radio = state.radio.filter((c) => c !== call);
      const best = call.options.find((o) => o.rating === 'best');
      const decision = {
        id: call.id, key: call.key, t: call.t, from: call.from, message: call.message,
        rating: opt.rating, chosen: opt.text, best: best ? best.text : null,
        feedback: opt.feedback || '', responseReal: state.real - call.real
      };
      state.decisions.push(decision);
      record('radio', { call: call.key, rating: opt.rating });
      if (opt.rating === 'unsafe') {
        violation(opt.severity || 'major', 'safety', 'Unsafe instruction to ' + call.from + ': ' + (opt.feedback || opt.text));
      }
      applyEffects(opt.effects);
      return { ok: true, decision };
    }

    // ----------------------------------------------------------------- tick

    function tick(h, hr) {
      state.t += h;
      state.real += hr;
      processEvents();
      updateEquipment();
      updateTrucks(h);
      serveLocations(h);
      checkZones();
      checkDisruptions();
      checkRadioTimeouts();
      if (state.t >= state.duration) finish();
    }

    function step(dtSim, dtReal) {
      if (state.finished || dtSim <= 0) return;
      const realPerSim = dtReal != null ? dtReal / dtSim : 0;
      let remaining = dtSim;
      while (remaining > 1e-9 && !state.finished) {
        const h = Math.min(1, remaining);
        tick(h, h * realPerSim);
        remaining -= h;
      }
    }

    // Real time passes while the sim is paused (practice mode) so radio
    // deadlines still apply to thinking time.
    function advanceReal(dtReal) {
      state.real += dtReal;
      checkRadioTimeouts();
    }

    function finish() {
      if (state.finished) return;
      // Unanswered radio calls at end of shift count as timeouts.
      for (const call of state.radio.slice()) call.deadlineReal = state.real;
      checkRadioTimeouts();
      if (state.blast && (state.blast.status === 'scheduled' || state.blast.status === 'guard')) {
        violation('major', 'process', 'Blast was never fired — the pit controller did not give the all-clear.');
      }
      for (const d of state.disruptions) {
        if (d.resolvedAt == null && d.endedAt == null) d.endedAt = state.t;
      }
      state.finished = true;
      emit('finished', summary());
    }

    function clock(t) {
      const total = Math.floor(state.startClockMin + t / 60);
      const hh = Math.floor(total / 60) % 24;
      const mm = total % 60;
      return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    }

    function summary() {
      const shovels = Object.values(state.shovels).map((s) => ({
        id: s.id, name: s.name, loads: s.loads, tonnes: s.tonnes,
        opTime: s.opTime, busyTime: s.busyTime, hangTime: s.hangTime,
        utilisation: s.opTime > 0 ? s.busyTime / s.opTime : 0
      }));
      const crusherTips = state.tips.filter((x) => x.dump === 'CR');
      const graded = crusherTips.slice(2).filter((x) => x.assessable);
      const loads = state.tips.length;
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        practice: !!scenario.practice,
        durationMin: scenario.durationMin,
        targets: scenario.targets,
        blendSpec: scenario.blend,
        totals: Object.assign({}, state.totals),
        loads,
        avgQueueMinPerLoad: loads ? state.totals.queueTime / loads / 60 : 0,
        idleTruckHours: state.totals.idleTime / 3600,
        shovels,
        crusher: {
          tips: crusherTips.length,
          inSpec: graded.filter((x) => x.inSpec).length,
          graded: graded.length,
          blends: crusherTips.map((x) => ({ t: x.t, blend: x.blend }))
        },
        violations: state.violations.slice(),
        decisions: state.decisions.slice(),
        disruptions: state.disruptions.map((d) => Object.assign({}, d)),
        blast: state.blast ? {
          shovel: state.blast.shovel, blastAt: state.blast.blastAt, confirmedAt: state.blast.confirmedAt,
          firedAt: state.blast.firedAt, delayed: state.blast.delayed
        } : null,
        actionCount: state.actions.length,
        actions: state.actions.slice(),
        realSeconds: state.real
      };
    }

    return {
      state,
      step,
      advanceReal,
      assign,
      sendToFuel: (id) => sendToFuel(id, false),
      tram,
      confirmBlastClear,
      answerRadio,
      finish,
      summary,
      clock,
      on: (fn) => listeners.push(fn)
    };
  }

  return { createSim, mulberry32 };
});
