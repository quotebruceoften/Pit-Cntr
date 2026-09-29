/*
 * Canvas renderer for the mine map: pit benches, haul roads, dumps,
 * loading units, trucks and exclusion zones.
 */
(function (root) {
  'use strict';
  const PitUI = (root.PitUI = root.PitUI || {});

  const COLORS = {
    ground: '#141a1f',
    benches: ['#1a1d1e', '#1d1f1e', '#201f1c', '#23201b', '#26211a'],
    benchLine: 'rgba(255,255,255,0.05)',
    road: '#3b3834',
    roadEdge: '#2b2926',
    roadLine: 'rgba(242,169,59,0.25)',
    label: '#b8c3cc',
    hg: '#f2b134', mg: '#e3a13a', lg: '#d9793a', waste: '#9a8f82', empty: '#62b6ff', down: '#ff5f5f',
    ok: '#3ecf8e', warn: '#f2c14e', danger: '#ff5f5f', info: '#62b6ff', evac: '#c084fc'
  };

  const SHOVEL_STATUS_COLOR = {
    operating: COLORS.ok, down: COLORS.danger, tramming: COLORS.warn, standby: COLORS.warn, evacuated: COLORS.evac, commissioning: '#8d9ba8',
    parked: '#8d9ba8', starting: COLORS.warn
  };

  function createMap(canvas, sim, view) {
    const P = sim.mine;
    const ctx = canvas.getContext('2d');
    const truckColor = (tr) => (tr.load ? COLORS[view.loadClass(tr.load)] : null);
    let scale = 1;
    let ox = 0;
    let oy = 0;
    let dpr = 1;
    let truckScreen = [];

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = root.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const pad = 16;
      scale = Math.min((rect.width - pad * 2) / P.MAP_WIDTH, (rect.height - pad * 2) / P.MAP_HEIGHT);
      ox = (rect.width - P.MAP_WIDTH * scale) / 2;
      oy = (rect.height - P.MAP_HEIGHT * scale) / 2;
    }

    const sx = (x) => ox + x * scale;
    const sy = (y) => oy + y * scale;

    // Pits are drawn as nested, slightly irregular benches.
    function drawPits() {
      const factors = [1, 0.84, 0.68, 0.52, 0.36];
      for (const pit of P.PITS) {
        const shift = pit.floorShift != null ? pit.floorShift : 0;
        factors.forEach((f, i) => {
          ctx.beginPath();
          for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 36) {
            const wobble = 1 + 0.035 * Math.sin(a * 3 + i) + 0.02 * Math.cos(a * 5);
            const x = pit.cx + Math.cos(a) * pit.rx * f * wobble;
            const y = pit.cy + Math.sin(a) * pit.ry * f * wobble + (1 - f) * shift;
            if (a === 0) ctx.moveTo(sx(x), sy(y));
            else ctx.lineTo(sx(x), sy(y));
          }
          ctx.closePath();
          ctx.fillStyle = COLORS.benches[i];
          ctx.fill();
          ctx.strokeStyle = COLORS.benchLine;
          ctx.lineWidth = 1;
          ctx.stroke();
        });
        if (pit.label) text(pit.label, sx(pit.cx), sy(pit.cy + pit.ry * 0.93), COLORS.label, 10, 'center', 0.45);
      }
    }

    function drawRoads() {
      const w = Math.max(4, 26 * scale);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const pass of [0, 1, 2]) {
        for (const [a, b, opts] of P.EDGES) {
          const na = P.NODES[a];
          const nb = P.NODES[b];
          if (opts && opts.closed) {
            // Unreleased road: thin dashed red line only.
            if (pass !== 1) continue;
            ctx.beginPath();
            ctx.moveTo(sx(na.x), sy(na.y));
            ctx.lineTo(sx(nb.x), sy(nb.y));
            ctx.strokeStyle = COLORS.danger;
            ctx.globalAlpha = 0.6;
            ctx.lineWidth = Math.max(2, w * 0.35);
            ctx.setLineDash([6, 6]);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.setLineDash([]);
            continue;
          }
          ctx.beginPath();
          ctx.moveTo(sx(na.x), sy(na.y));
          ctx.lineTo(sx(nb.x), sy(nb.y));
          if (pass === 0) { ctx.strokeStyle = COLORS.roadEdge; ctx.lineWidth = w + 3; ctx.setLineDash([]); }
          if (pass === 1) { ctx.strokeStyle = COLORS.road; ctx.lineWidth = w; ctx.setLineDash([]); }
          if (pass === 2) { ctx.strokeStyle = COLORS.roadLine; ctx.lineWidth = 1; ctx.setLineDash([6, 8]); }
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      for (const [a, b, opts] of P.EDGES) {
        if (!opts || !opts.ramp) continue;
        const na = P.NODES[a];
        const nb = P.NODES[b];
        text('RAMP', sx((na.x + nb.x) / 2) + 14, sy((na.y + nb.y) / 2), COLORS.label, 9, 'left', 0.5);
      }
    }

    function text(str, x, y, color, size, align, alpha) {
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.fillStyle = color;
      ctx.font = '600 ' + size + 'px system-ui, sans-serif';
      ctx.textAlign = align || 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(str, x, y);
      ctx.globalAlpha = 1;
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawZones(state) {
      for (const z of state.zones) {
        const isBlast = z.kind === 'blast';
        const color = isBlast ? COLORS.danger : COLORS.evac;
        const armed = !isBlast || state.blast.status !== 'scheduled';
        ctx.beginPath();
        ctx.arc(sx(z.x), sy(z.y), z.r * scale, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = armed ? 0.16 : 0.07;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.setLineDash([]);
        let label = isBlast ? 'BLAST ZONE' : 'GEOTECH EXCLUSION';
        if (isBlast) {
          const st = state.blast.status;
          label += st === 'scheduled' ? ' — clear by ' + sim.clock(state.blast.guardAt)
            : st === 'guard' ? ' — GUARD PERIOD' : st === 'confirmed' ? ' — ALL CLEAR GIVEN' : ' — FIRED / NO ENTRY';
        }
        text(label, sx(z.x), sy(z.y - z.r) - 10, color, 11);
      }
    }

    // Plant buildings and area labels (pushbacks, rehandle area).
    function drawAnnotations() {
      for (const f of P.FEATURES) {
        roundRect(sx(f.x), sy(f.y), Math.max(40, f.w * scale), Math.max(20, f.h * scale), 5);
        ctx.fillStyle = '#1d242b';
        ctx.fill();
        ctx.strokeStyle = COLORS.label;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
        text(f.label, sx(f.x) + Math.max(40, f.w * scale) / 2, sy(f.y) + Math.max(20, f.h * scale) / 2, COLORS.label, 10);
      }
      for (const a of P.AREAS) text(a.label, sx(a.x), sy(a.y), COLORS.label, 10.5, 'center', 0.55);
    }

    function drawDumps(state) {
      for (const d of Object.values(state.dumps)) {
        const n = P.NODES[d.id];
        if (d.marker === 'finger') {
          // ROM pad finger: small marker in the ore type's colour.
          const r = Math.max(6, 26 * scale);
          ctx.beginPath();
          ctx.arc(sx(n.x), sy(n.y), r, 0, Math.PI * 2);
          ctx.fillStyle = d.color || COLORS.hg;
          ctx.globalAlpha = d.status === 'operating' ? 0.85 : 0.3;
          ctx.fill();
          ctx.globalAlpha = 1;
          if (d.status !== 'operating') {
            ctx.lineWidth = 2;
            ctx.strokeStyle = COLORS.danger;
            ctx.stroke();
          }
          text(d.short || d.name, sx(n.x), sy(n.y) + r + 8, d.status === 'operating' ? COLORS.label : COLORS.danger, 9);
          if (d.queue.length) text(String(d.queue.length), sx(n.x), sy(n.y), '#10161b', 9.5);
          continue;
        }
        const w = Math.max(40, 150 * scale);
        const h = Math.max(22, 80 * scale);
        const x = sx(n.x) - w / 2;
        const y = sy(n.y) - h / 2;
        roundRect(x, y, w, h, 5);
        ctx.fillStyle = d.status === 'operating' ? '#23303a' : '#3a1f22';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = d.status === 'operating' ? (d.role === 'waste' ? COLORS.waste : COLORS.hg) : COLORS.danger;
        ctx.stroke();
        text((d.short || d.name).toUpperCase(), sx(n.x), sy(n.y) - (d.queue.length ? 5 : 0), '#e2e8ee', 10.5);
        if (d.queue.length) text('queue ' + d.queue.length, sx(n.x), sy(n.y) + 8, COLORS.warn, 9.5);
        if (d.status !== 'operating') text('DOWN', sx(n.x), y - 9, COLORS.danger, 11);
      }
      const ws = P.NODES[P.BASE];
      const w = Math.max(50, 190 * scale);
      const h = Math.max(20, 70 * scale);
      roundRect(sx(ws.x) - w / 2, sy(ws.y) - h / 2, w, h, 5);
      ctx.fillStyle = '#1f2830';
      ctx.fill();
      ctx.strokeStyle = COLORS.info;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      text('WORKSHOP / FUEL', sx(ws.x), sy(ws.y), COLORS.label, 10);
    }

    function drawShovels(state) {
      for (const s of Object.values(state.shovels)) {
        const r = Math.max(9, 42 * scale);
        const x = sx(s.x);
        const y = sy(s.y);
        if (s.status === 'tramming' || s.status === 'standby') {
          ctx.beginPath();
          ctx.setLineDash([3, 4]);
          ctx.moveTo(sx(s.home.x), sy(s.home.y));
          ctx.lineTo(x, y);
          ctx.strokeStyle = COLORS.warn;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
        ctx.fillStyle = s.material === 'waste' ? '#4a443d' : view.shovelClass(s) === 'hg' ? '#5a4213' : '#523017';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = SHOVEL_STATUS_COLOR[s.status] || COLORS.ok;
        ctx.stroke();
        text(s.id, x, y, '#fff', 11);
        const sub = view.loadingText(s);
        text(sub, x, y + r + 10, COLORS.label, 10);
        if (s.status !== 'operating') {
          text(s.status.toUpperCase(), x, y - r - 10, SHOVEL_STATUS_COLOR[s.status], 10.5);
        }
      }
    }

    function drawTrucks(state, selected) {
      const r = Math.max(5, 22 * scale);
      const stationary = {};
      for (const tr of state.trucks) {
        if (!tr.moving && tr.at) (stationary[tr.at] = stationary[tr.at] || []).push(tr);
      }
      const pos = {};
      for (const tr of state.trucks) pos[tr.id] = { x: sx(tr.x), y: sy(tr.y) };
      for (const node of Object.keys(stationary)) {
        const list = stationary[node];
        const n = P.NODES[node];
        const ring = Math.max(18, 78 * scale);
        list.forEach((tr, i) => {
          const a = -Math.PI / 2 + (i / Math.max(6, list.length)) * Math.PI * 2 + (node === P.BASE ? Math.PI / 2 : 0);
          pos[tr.id] = { x: sx(n.x) + Math.cos(a) * ring, y: sy(n.y) + Math.sin(a) * ring };
        });
      }
      truckScreen = [];
      for (const tr of state.trucks) {
        const p = pos[tr.id];
        truckScreen.push({ id: tr.id, x: p.x, y: p.y });
        const fill = truckColor(tr);
        // Contractor / second-class trucks are drawn as squares.
        if (view.classIndex(tr.cls) > 0) roundRect(p.x - r * 0.9, p.y - r * 0.9, r * 1.8, r * 1.8, r * 0.35);
        else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        }
        if (tr.hold) {
          ctx.fillStyle = COLORS.down;
          ctx.fill();
        } else if (fill) {
          ctx.fillStyle = fill;
          ctx.fill();
        } else {
          ctx.fillStyle = '#10161b';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = COLORS.empty;
          ctx.stroke();
        }
        if (tr.fuelLow) {
          ctx.beginPath();
          ctx.arc(p.x + r * 0.9, p.y - r * 0.9, Math.max(2.5, r * 0.35), 0, Math.PI * 2);
          ctx.fillStyle = COLORS.warn;
          ctx.fill();
        }
        if (selected.has(tr.id)) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        }
        if (scale > 0.18 || selected.has(tr.id)) {
          // Mixed fleets share numbers (N45 / E45), so show the full callsign.
          text(view.mixedFleet ? tr.id : tr.id.replace(/^\D+/, ''), p.x, p.y + r + 8, selected.has(tr.id) ? '#fff' : COLORS.label, 9.5);
        }
      }
    }

    function render(selected) {
      const state = sim.state;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.fillStyle = COLORS.ground;
      ctx.fillRect(0, 0, w, h);
      drawPits();
      drawRoads();
      drawAnnotations();
      drawZones(state);
      drawDumps(state);
      drawShovels(state);
      drawTrucks(state, selected || new Set());
    }

    function pick(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      let best = null;
      let bestD = 16;
      for (const t of truckScreen) {
        const d = Math.hypot(t.x - x, t.y - y);
        if (d < bestD) { best = t.id; bestD = d; }
      }
      return best;
    }

    resize();
    return { render, resize, pick };
  }

  PitUI.createMap = createMap;
})(typeof self !== 'undefined' ? self : this);
