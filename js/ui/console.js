/*
 * The pit controller console: runs the simulation loop and wires the map,
 * fleet table, equipment cards, radio calls, blast panel and event log.
 */
(function (root) {
  'use strict';
  const PitUI = (root.PitUI = root.PitUI || {});
  const P = root.PitSim;
  const esc = (s) => PitUI.esc(s);
  const $ = (id) => document.getElementById(id);

  const SHOVEL_OPTS = [
    ['S1', 'S1 HG'], ['S2', 'S2 LG'], ['S3', 'S3 Waste'], ['PARK', 'Park']
  ];
  const DUMP_OPTS = [['CR', 'Crusher'], ['ROM', 'ROM'], ['WD', 'Waste']];
  const DUMP_NAMES = { CR: 'Crusher', ROM: 'ROM', WD: 'Waste dump' };
  const PLACE_NAMES = Object.assign({ WS: 'Workshop' }, DUMP_NAMES);

  function options(list, value) {
    return list.map(([v, l]) => '<option value="' + v + '"' + (v === value ? ' selected' : '') + '>' + l + '</option>').join('');
  }

  function mismatch(shovel, dump) {
    const s = P.SHOVELS.find((x) => x.id === shovel);
    if (!s) return false;
    return s.material === 'ore' ? dump === 'WD' : dump !== 'WD';
  }

  function fmtMin(sec) {
    const m = Math.max(0, Math.ceil(sec / 60));
    return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm';
  }

  function createBeeper() {
    let ac = null;
    let muted = false;
    return {
      setMuted(m) { muted = m; },
      isMuted: () => muted,
      beep(kind) {
        if (muted) return;
        try {
          ac = ac || new (root.AudioContext || root.webkitAudioContext)();
          const tones = kind === 'danger' ? [880, 660, 880] : [740, 990];
          tones.forEach((f, i) => {
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.frequency.value = f;
            o.type = 'sine';
            const t0 = ac.currentTime + i * 0.13;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
            o.connect(g).connect(ac.destination);
            o.start(t0);
            o.stop(t0 + 0.13);
          });
        } catch (e) { /* audio unavailable */ }
      }
    };
  }

  function startConsole(opts) {
    const { scenario, candidate, onFinish } = opts;
    const practice = !!scenario.practice;
    const sim = P.createSim(scenario, { seed: scenario.seed || 1 });
    const state = sim.state;
    const ac = new AbortController();
    const on = (el, ev, fn) => el.addEventListener(ev, fn, { signal: ac.signal });
    const beeper = createBeeper();
    const selected = new Set();
    let speed = scenario.speed || 15;
    // Dev/testing aid: ?speed=N may only make a shift faster (never slower,
    // which would give candidates extra thinking time).
    const urlSpeed = Number(new URLSearchParams(root.location.search).get('speed'));
    if (urlSpeed > speed) speed = urlSpeed;
    let paused = false;
    let stopped = false;
    let alertIdx = 0;
    const integrity = { hiddenCount: 0, hiddenSeconds: 0 };
    let hiddenAt = null;

    // ------------------------------------------------------------ top bar
    $('tb-scenario').textContent = scenario.name;
    $('tb-candidate').textContent = candidate ? candidate.name : 'Practice';
    $('speed-controls').hidden = !practice;
    $('speed-select').value = String(speed);
    $('btn-pause').textContent = '❚❚';
    $('kpi-blend-spec').textContent = 'spec ' + scenario.blend.min.toFixed(1) + '–' + scenario.blend.max.toFixed(1) + '%';
    $('event-log').innerHTML = '';
    $('radio-panel').innerHTML = '';
    $('toast-host').innerHTML = '';
    $('btn-mute').textContent = '🔔';

    on($('btn-pause'), 'click', () => {
      paused = !paused;
      $('btn-pause').textContent = paused ? '▶' : '❚❚';
    });
    on($('speed-select'), 'change', (e) => { speed = Number(e.target.value); });
    on($('btn-mute'), 'click', () => {
      beeper.setMuted(!beeper.isMuted());
      $('btn-mute').textContent = beeper.isMuted() ? '🔕' : '🔔';
      $('btn-mute').setAttribute('aria-pressed', String(beeper.isMuted()));
    });
    on($('btn-end'), 'click', () => {
      const msg = practice ? 'End the practice shift now?' : 'End the shift early? The remaining time will not be played and production will count as it stands.';
      if (root.confirm(msg)) sim.finish();
    });

    // ------------------------------------------------------------------ map
    const canvas = $('map');
    const map = PitUI.createMap(canvas, sim);
    const ro = new ResizeObserver(() => map.resize());
    ro.observe($('map-wrap'));
    on(canvas, 'click', (e) => {
      const id = map.pick(e.clientX, e.clientY);
      if (!id) {
        if (!e.shiftKey) { selected.clear(); syncSelection(); }
        return;
      }
      if (!e.shiftKey && !e.metaKey && !e.ctrlKey) selected.clear();
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      syncSelection();
      const row = rows[id].tr;
      row.scrollIntoView({ block: 'nearest' });
      row.classList.remove('flash');
      void row.offsetWidth;
      row.classList.add('flash');
    });

    // ---------------------------------------------------------------- fleet
    const rows = {};
    const body = $('fleet-body');
    body.innerHTML = '';
    for (const tr of state.trucks) {
      const row = document.createElement('tr');
      row.innerHTML =
        '<td><input type="checkbox" aria-label="Select ' + tr.id + '"></td>' +
        '<td class="tid">' + tr.id + '</td>' +
        '<td class="st"></td>' +
        '<td class="ld"></td>' +
        '<td><div class="circuit"><select class="sel-shovel" aria-label="' + tr.id + ' loading unit">' + options(SHOVEL_OPTS, tr.assign.shovel) + '</select>' +
        '<select class="sel-dump" aria-label="' + tr.id + ' dump">' + options(DUMP_OPTS, tr.assign.dump) + '</select></div></td>' +
        '<td><button class="fuel-btn" title="Send ' + tr.id + ' to the fuel bay">⛽</button></td>';
      body.appendChild(row);
      const r = {
        tr: row,
        cb: row.querySelector('input'),
        st: row.querySelector('.st'),
        ld: row.querySelector('.ld'),
        shovel: row.querySelector('.sel-shovel'),
        dump: row.querySelector('.sel-dump'),
        fuel: row.querySelector('.fuel-btn')
      };
      rows[tr.id] = r;
      on(r.cb, 'change', () => {
        if (r.cb.checked) selected.add(tr.id); else selected.delete(tr.id);
        syncSelection();
      });
      on(r.shovel, 'change', () => {
        const shovel = r.shovel.value;
        const upd = { shovel };
        // Pick a sensible default dump when switching material type.
        const s = P.SHOVELS.find((x) => x.id === shovel);
        if (s && mismatch(shovel, r.dump.value)) upd.dump = s.material === 'ore' ? (state.dumps.CR.status === 'operating' ? 'CR' : 'ROM') : 'WD';
        sim.assign(tr.id, upd);
        updateFleet(true);
      });
      on(r.dump, 'change', () => { sim.assign(tr.id, { dump: r.dump.value }); updateFleet(true); });
      on(r.fuel, 'click', () => {
        const res = sim.sendToFuel(tr.id);
        if (!res.ok) toast('Fuel', res.reason, 'error');
        else toast(tr.id + ' → fuel bay', 'Will head to the fuel bay once empty.', '');
        updateFleet(true);
      });
    }
    $('bulk-shovel').innerHTML = '<option value="">Loading unit…</option>' + options(SHOVEL_OPTS, null);
    $('bulk-dump').innerHTML = '<option value="">Dump…</option>' + options(DUMP_OPTS, null);
    on($('fleet-all'), 'change', (e) => {
      selected.clear();
      if (e.target.checked) state.trucks.forEach((t) => selected.add(t.id));
      syncSelection();
    });
    on($('bulk-apply'), 'click', () => {
      const shovel = $('bulk-shovel').value;
      const dump = $('bulk-dump').value;
      if (!selected.size || (!shovel && !dump)) {
        toast('Bulk assign', 'Select trucks and a loading unit and/or dump first.', 'error');
        return;
      }
      for (const id of selected) {
        const upd = {};
        if (shovel) upd.shovel = shovel;
        if (dump) upd.dump = dump;
        else if (shovel && shovel !== 'PARK') {
          const tr = state.trucks.find((t) => t.id === id);
          if (mismatch(shovel, tr.assign.dump)) {
            upd.dump = P.SHOVELS.find((x) => x.id === shovel).material === 'ore' ? (state.dumps.CR.status === 'operating' ? 'CR' : 'ROM') : 'WD';
          }
        }
        sim.assign(id, upd);
      }
      toast('Reassigned ' + selected.size + ' truck' + (selected.size > 1 ? 's' : ''), [shovel, dump].filter(Boolean).join(' → '), '');
      selected.clear();
      $('bulk-shovel').value = '';
      $('bulk-dump').value = '';
      syncSelection();
      updateFleet(true);
    });

    function syncSelection() {
      for (const id of Object.keys(rows)) {
        rows[id].cb.checked = selected.has(id);
        rows[id].tr.classList.toggle('sel', selected.has(id));
      }
      $('bulk-count').textContent = selected.size + ' selected';
      $('fleet-all').checked = selected.size === state.trucks.length;
    }

    function truckStatus(tr) {
      if (tr.hold) {
        return { text: (tr.hold.kind === 'breakdown' ? 'DOWN ' : 'STOPPED ') + fmtMin(tr.hold.until - state.t), cls: 'down', title: tr.hold.reason };
      }
      const at = tr.at ? (PLACE_NAMES[tr.at] || tr.at) : '';
      switch (tr.phase) {
        case 'idle': return { text: 'Go-line · departs ' + sim.clock(tr.departAt) };
        case 'toShovel': return { text: '→ ' + tr.dest };
        case 'queueShovel': return { text: 'Queued @ ' + at };
        case 'loading': return { text: 'Loading @ ' + at };
        case 'toDump': return { text: '→ ' + DUMP_NAMES[tr.dest] };
        case 'queueDump': return { text: 'Queued @ ' + at };
        case 'dumping': return { text: 'Tipping @ ' + at };
        case 'toBase': return tr.purpose === 'fuel' ? { text: '→ Fuel bay', cls: 'fuel' } : { text: '→ Go-line (park)' };
        case 'fueling': return { text: 'Refuelling', cls: 'fuel' };
        case 'parked': return { text: 'Parked at go-line' };
        default: return { text: tr.phase };
      }
    }

    function loadCell(tr) {
      if (!tr.load) return '<span class="load-dot" title="Empty"></span><span class="muted">—</span>';
      if (tr.load.material === 'waste') return '<span class="load-dot waste"></span>Waste';
      const hg = tr.load.source === 'S1';
      return '<span class="load-dot ' + (hg ? 'hg' : 'lg') + '"></span>' + (hg ? 'HG ' : 'LG ') + tr.load.grade.toFixed(2);
    }

    function updateFleet() {
      let working = 0;
      for (const tr of state.trucks) {
        const r = rows[tr.id];
        const st = truckStatus(tr);
        if (r.st.textContent !== st.text) r.st.textContent = st.text;
        r.st.className = 'st' + (st.cls ? ' ' + st.cls : '');
        r.st.title = st.title || st.text;
        const ld = loadCell(tr);
        if (r.ld.innerHTML !== ld) r.ld.innerHTML = ld;
        if (document.activeElement !== r.shovel && r.shovel.value !== tr.assign.shovel) r.shovel.value = tr.assign.shovel;
        if (document.activeElement !== r.dump && r.dump.value !== tr.assign.dump) r.dump.value = tr.assign.dump;
        const bad = mismatch(tr.assign.shovel, tr.assign.dump);
        r.dump.classList.toggle('mismatch', bad);
        r.dump.title = bad ? 'Material from this loading unit does not belong at this dump' : '';
        r.fuel.classList.toggle('low', tr.fuelLow && !tr.pendingFuel);
        r.fuel.disabled = tr.pendingFuel || tr.phase === 'fueling';
        if (!tr.hold && tr.phase !== 'parked' && tr.phase !== 'idle') working++;
      }
      $('fleet-summary').textContent = working + ' of ' + state.trucks.length + ' trucks working';
    }

    // ------------------------------------------------------------ equipment
    const equip = $('equipment');
    equip.innerHTML = '';
    const shovelCards = {};
    for (const s of Object.values(state.shovels)) {
      const card = document.createElement('div');
      card.className = 'equip-card';
      card.innerHTML =
        '<div class="ec-head"><span class="ec-name">' + esc(s.name) + '</span><span class="chip"></span></div>' +
        '<div class="ec-row"><span>' + esc(s.label) + (s.material === 'ore' ? ' ' + s.grade.toFixed(1) + '%' : '') + '</span></div>' +
        '<div class="ec-row"><span>Assigned</span><b class="f-assigned"></b></div>' +
        '<div class="ec-row"><span>Queue</span><b class="f-queue"></b></div>' +
        '<div class="ec-row"><span>Utilisation</span><b class="f-util"></b></div>' +
        (s.safePos ? '<button class="btn btn-sm f-tram" hidden></button>' : '');
      equip.appendChild(card);
      shovelCards[s.id] = {
        chip: card.querySelector('.chip'),
        assigned: card.querySelector('.f-assigned'),
        queue: card.querySelector('.f-queue'),
        util: card.querySelector('.f-util'),
        tram: card.querySelector('.f-tram')
      };
      if (shovelCards[s.id].tram) {
        on(shovelCards[s.id].tram, 'click', () => {
          const target = s.status === 'standby' ? 'face' : 'safe';
          const res = sim.tram(s.id, target);
          if (!res.ok) toast(s.name, res.reason, 'error');
          updateEquipment();
        });
      }
    }
    const dumpWrap = document.createElement('div');
    dumpWrap.className = 'equip-dumps';
    equip.appendChild(dumpWrap);
    const dumpCards = {};
    for (const d of Object.values(state.dumps)) {
      const card = document.createElement('div');
      card.className = 'equip-card';
      card.innerHTML =
        '<div class="ec-head"><span class="ec-name">' + esc(d.name) + '</span><span class="chip"></span></div>' +
        '<div class="ec-row"><span>Queue <b class="f-queue"></b></span><b class="f-tonnes"></b></div>';
      dumpWrap.appendChild(card);
      dumpCards[d.id] = { chip: card.querySelector('.chip'), queue: card.querySelector('.f-queue'), tonnes: card.querySelector('.f-tonnes'), card };
    }

    const STATUS_CHIP = {
      operating: ['ok', 'Operating'], down: ['danger', 'Down'], tramming: ['warn', 'Tramming'],
      standby: ['warn', 'Standby'], evacuated: ['danger', 'Evacuated']
    };

    function updateEquipment() {
      for (const s of Object.values(state.shovels)) {
        const c = shovelCards[s.id];
        const [cls, label] = STATUS_CHIP[s.status] || ['muted', s.status];
        c.chip.className = 'chip ' + cls;
        c.chip.textContent = label;
        c.chip.title = s.downReason ? s.downReason + (s.until > state.t ? ' — est. ' + fmtMin(s.until - state.t) : '') : '';
        c.assigned.textContent = state.trucks.filter((t) => t.assign.shovel === s.id).length + ' trucks';
        c.queue.textContent = s.queue.length + (s.serving ? ' + loading' : '');
        c.util.textContent = s.opTime > 60 ? Math.round((100 * s.busyTime) / s.opTime) + '%' : '—';
        if (c.tram) {
          const b = state.blast;
          const blastHere = b && b.shovel === s.id;
          if (s.status === 'standby') {
            c.tram.hidden = false;
            c.tram.textContent = 'Return to face';
            c.tram.disabled = blastHere && b.status !== 'reopened';
          } else if (blastHere && s.status === 'operating' && b.status !== 'reopened' && b.status !== 'fired') {
            c.tram.hidden = false;
            c.tram.textContent = 'Tram to safe position';
            c.tram.disabled = false;
          } else {
            c.tram.hidden = true;
          }
        }
      }
      for (const d of Object.values(state.dumps)) {
        const c = dumpCards[d.id];
        const up = d.status === 'operating';
        c.chip.className = 'chip ' + (up ? 'ok' : 'danger');
        c.chip.textContent = up ? 'Online' : 'Down';
        c.chip.title = d.downReason || '';
        c.queue.textContent = d.queue.length + (d.serving.length ? ' + ' + d.serving.length + ' tipping' : '');
        c.tonnes.textContent = Math.round(d.tonnes).toLocaleString() + ' t';
      }
    }

    // ---------------------------------------------------------------- blast
    const blastPanel = $('blast-panel');
    blastPanel.hidden = true;
    blastPanel.innerHTML = '';
    let blastBuilt = false;
    let blastConfirming = false;
    const blastEls = {};

    function buildBlast() {
      blastPanel.innerHTML =
        '<h3>Blast — ' + esc(state.shovels[state.blast.shovel].name) + ' bench</h3>' +
        '<div class="blast-times"><div>Clear by<b class="b-guard"></b></div><div>Fire at<b class="b-fire"></b></div><div>Status<b class="b-status"></b></div></div>' +
        '<p class="small muted b-help"></p>' +
        '<div class="blast-actions"><button class="btn btn-danger b-clear">Give all-clear to shotfirer</button>' +
        '<button class="btn btn-danger b-yes" hidden>Yes — zone is clear</button><button class="btn b-no" hidden>Cancel</button></div>';
      for (const k of ['guard', 'fire', 'status', 'help', 'clear', 'yes', 'no']) blastEls[k] = blastPanel.querySelector('.b-' + k);
      on(blastEls.clear, 'click', () => { blastConfirming = true; updateBlast(); });
      on(blastEls.no, 'click', () => { blastConfirming = false; updateBlast(); });
      on(blastEls.yes, 'click', () => {
        blastConfirming = false;
        const res = sim.confirmBlastClear();
        if (!res.ok) toast('Blast', res.reason, 'error');
        updateBlast();
      });
      blastBuilt = true;
    }

    function updateBlast() {
      const b = state.blast;
      if (!b) return;
      if (!blastBuilt) buildBlast();
      const done = b.status === 'reopened' && state.shovels[b.shovel].status === 'operating';
      blastPanel.hidden = done;
      blastEls.guard.textContent = sim.clock(b.guardAt);
      blastEls.fire.textContent = sim.clock(b.blastAt);
      const labels = {
        scheduled: 'Clearing', guard: 'Guarding', confirmed: 'All-clear given', fired: 'Fired', reopened: 'Reopened'
      };
      blastEls.status.textContent = labels[b.status];
      const help = {
        scheduled: 'Tram the shovel to its safe position and withdraw every truck from the red zone before the guard period starts. Then give the all-clear.',
        guard: 'Guard period in force. Nothing may be inside the zone. Give the all-clear once you have verified the zone is empty.',
        confirmed: 'Zone locked. The shot will be fired at the scheduled time.',
        fired: 'Post-blast fume clearance and inspection in progress. No entry.',
        reopened: 'Area reopened. Return the shovel to the face and re-plan the fleet.'
      };
      blastEls.help.textContent = help[b.status];
      const canConfirm = b.status === 'scheduled' || b.status === 'guard';
      blastEls.clear.hidden = !canConfirm || blastConfirming;
      blastEls.yes.hidden = !canConfirm || !blastConfirming;
      blastEls.no.hidden = !canConfirm || !blastConfirming;
    }

    // ---------------------------------------------------------------- radio
    const radioCards = {};

    function renderRadio() {
      const live = new Set(state.radio.map((c) => c.id));
      for (const id of Object.keys(radioCards)) {
        if (!live.has(id)) {
          radioCards[id].el.remove();
          delete radioCards[id];
        }
      }
      $('radio-empty').hidden = state.radio.length > 0;
      for (const call of state.radio) {
        if (radioCards[call.id]) continue;
        const el = document.createElement('div');
        const urgent = call.key === 'geotech' || call.key === 'unknown-lv';
        el.className = 'radio-card' + (urgent ? ' urgent' : '');
        el.innerHTML =
          '<div class="radio-head"><span class="radio-from">' + esc(call.from) + '</span><span class="radio-timer"></span></div>' +
          '<p class="radio-msg">' + esc(call.message) + '</p>' +
          '<div class="radio-bar"><div></div></div>' +
          '<div class="radio-opts">' + call.options.map((o, i) =>
            '<button class="radio-opt" data-index="' + o.index + '"><kbd>' + 'ABCD'[i] + '</kbd><span>' + esc(o.text) + '</span></button>').join('') + '</div>';
        $('radio-panel').appendChild(el);
        radioCards[call.id] = { el, bar: el.querySelector('.radio-bar div'), timer: el.querySelector('.radio-timer'), call };
        el.querySelectorAll('.radio-opt').forEach((btn) => {
          on(btn, 'click', () => answer(call, Number(btn.dataset.index)));
        });
        beeper.beep(urgent ? 'danger' : 'radio');
      }
    }

    function answer(call, index) {
      const res = sim.answerRadio(call.id, index);
      if (!res.ok) return;
      const d = res.decision;
      if (practice) {
        const titles = { best: 'Best response', ok: 'Acceptable', poor: 'Poor response', unsafe: 'Unsafe instruction' };
        toast(titles[d.rating], d.feedback + (d.rating !== 'best' && d.best ? ' Best: “' + d.best + '”' : ''), d.rating, 11000);
      } else {
        toast('Instruction sent', 'To ' + call.from + '.', '', 2500);
      }
      renderRadio();
      updatePanels();
    }

    function updateRadioTimers() {
      for (const r of Object.values(radioCards)) {
        const total = r.call.deadlineReal - r.call.real;
        const left = Math.max(0, r.call.deadlineReal - state.real);
        r.bar.style.width = (100 * left) / total + '%';
        r.timer.textContent = Math.ceil(left) + 's';
      }
    }

    // ---------------------------------------------------------------- alerts
    function toast(title, body, cls, ms) {
      const host = $('toast-host');
      const el = document.createElement('div');
      el.className = 'toast ' + (cls || '');
      el.innerHTML = '<b>' + esc(title) + '</b>' + esc(body || '');
      host.prepend(el);
      while (host.children.length > 4) host.lastChild.remove();
      setTimeout(() => el.remove(), ms || 5000);
    }

    function updateLog() {
      const log = $('event-log');
      while (alertIdx < state.alerts.length) {
        const a = state.alerts[alertIdx++];
        const li = document.createElement('li');
        li.innerHTML = '<time>' + sim.clock(a.t) + '</time><span class="' + a.level + '">' + esc(a.text) + '</span>';
        log.prepend(li);
        if (a.level === 'danger') beeper.beep('danger');
      }
      while (log.children.length > 200) log.lastChild.remove();
    }

    function updateTopbar() {
      $('tb-clock').textContent = sim.clock(state.t);
      $('tb-left').textContent = fmtMin(state.duration - state.t) + ' left' + (paused ? ' · PAUSED' : '');
      const ore = state.totals.oreCrusher + state.totals.oreRom;
      const t = scenario.targets;
      $('kpi-ore').style.width = Math.min(100, (100 * ore) / t.ore) + '%';
      $('kpi-ore-text').textContent = Math.round(ore).toLocaleString() + ' / ' + t.ore.toLocaleString() + ' t';
      $('kpi-waste').style.width = Math.min(100, (100 * state.totals.waste) / t.waste) + '%';
      $('kpi-waste-text').textContent = Math.round(state.totals.waste).toLocaleString() + ' / ' + t.waste.toLocaleString() + ' t';
      const last = state.tips.filter((x) => x.dump === 'CR').pop();
      const bl = $('kpi-blend');
      if (last) {
        bl.textContent = last.blend.toFixed(2) + '%';
        bl.className = 'tb-blend ' + (last.inSpec ? 'in' : 'out');
      }
      const inc = state.violations.filter((v) => v.category === 'safety').length;
      $('kpi-incidents').textContent = inc;
      $('kpi-incidents').className = 'tb-incidents' + (inc ? ' bad' : '');
    }

    function updatePanels() {
      updateTopbar();
      updateFleet();
      updateEquipment();
      updateBlast();
      renderRadio();
      updateLog();
    }

    // ---------------------------------------------------------------- loop
    on(document, 'visibilitychange', () => {
      if (document.hidden) {
        integrity.hiddenCount++;
        hiddenAt = performance.now();
      } else if (hiddenAt != null) {
        integrity.hiddenSeconds += (performance.now() - hiddenAt) / 1000;
        hiddenAt = null;
      }
    });

    sim.on((kind, payload) => {
      if (kind !== 'finished') return;
      stop();
      updatePanels();
      integrity.hiddenSeconds = Math.round(integrity.hiddenSeconds);
      setTimeout(() => onFinish(payload, { integrity }), 400);
    });

    let last = performance.now();
    let lastPanel = 0;
    function frame(now) {
      if (stopped) return;
      const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
      last = now;
      if (!paused) sim.step(dt * speed, dt);
      if (stopped) return;
      map.render(selected);
      updateRadioTimers();
      if (now - lastPanel > 200) {
        lastPanel = now;
        updatePanels();
      }
      root.requestAnimationFrame(frame);
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      ac.abort();
      ro.disconnect();
    }

    syncSelection();
    updatePanels();
    map.resize();
    root.requestAnimationFrame(frame);

    return { sim, stop };
  }

  PitUI.startConsole = startConsole;
})(typeof self !== 'undefined' ? self : this);
