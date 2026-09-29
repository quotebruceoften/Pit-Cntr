/*
 * Debrief report for a completed shift. Used at the end of a shift and in
 * the assessor dashboard.
 */
(function (root) {
  'use strict';
  const PitUI = (root.PitUI = root.PitUI || {});
  const P = root.PitSim;
  const esc = (s) => PitUI.esc(s);

  const RATING_LABEL = { best: 'Best', ok: 'Acceptable', poor: 'Poor', unsafe: 'Unsafe', timeout: 'No response' };

  function clockFn(summary) {
    const site = P.getSite(summary.siteId || 'demo');
    const sc = site && site.scenarios.find((s) => s.id === summary.scenarioId);
    const start = sc ? sc.startClockMin : 360;
    return (t) => {
      const total = Math.floor(start + t / 60);
      return String(Math.floor(total / 60) % 24).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
    };
  }

  function barColor(v) {
    return v >= 80 ? 'var(--ok)' : v >= 60 ? 'var(--warn)' : 'var(--danger)';
  }

  function blendChart(summary) {
    const pts = summary.crusher.blends.filter((b) => b.blend != null);
    if (pts.length < 2) return '<p class="muted small">Not enough crusher tips to chart.</p>';
    const W = 600;
    const H = 140;
    const pad = { l: 34, r: 8, t: 8, b: 20 };
    const tMax = summary.durationMin * 60;
    const spec0 = summary.blendSpec;
    const vals = pts.map((p) => p.blend);
    const yMin = Math.max(0, Math.min(spec0.min * 0.6, Math.min.apply(null, vals)) * 0.95);
    const yMax = Math.max(spec0.max * 1.3, Math.max.apply(null, vals)) * 1.05;
    const x = (t) => pad.l + (t / tMax) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
    const spec = summary.blendSpec;
    const path = pts.map((p, i) => (i ? 'L' : 'M') + x(p.t).toFixed(1) + ' ' + y(Math.max(yMin, Math.min(yMax, p.blend))).toFixed(1)).join(' ');
    const ticks = [];
    for (let h = 0; h <= summary.durationMin / 60; h++) {
      ticks.push('<text x="' + x(h * 3600) + '" y="' + (H - 4) + '" fill="var(--muted)" font-size="10" text-anchor="middle">' + h + 'h</text>');
    }
    return '<svg class="blend-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Crusher feed blend over the shift">' +
      '<rect x="' + pad.l + '" y="' + y(spec.max) + '" width="' + (W - pad.l - pad.r) + '" height="' + (y(spec.min) - y(spec.max)) + '" fill="var(--ok)" opacity="0.12"/>' +
      [spec.min, spec.max].map((v) => '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--ok)" stroke-dasharray="4 4" opacity="0.6"/>' +
        '<text x="' + (pad.l - 4) + '" y="' + (y(v) + 3) + '" fill="var(--muted)" font-size="10" text-anchor="end">' + v.toFixed(1) + '</text>').join('') +
      '<path d="' + path + '" fill="none" stroke="var(--hg)" stroke-width="2" vector-effect="non-scaling-stroke"/>' +
      ticks.join('') + '</svg>';
  }

  function stat(value, label) {
    return '<div class="stat"><b>' + value + '</b><span>' + esc(label) + '</span></div>';
  }

  function renderReport(record, opts) {
    opts = opts || {};
    const s = record.summary;
    const r = record.result;
    const clock = clockFn(s);
    const unit = s.gradeUnit || '% Cu';
    const d = r.detail;
    const when = new Date(record.finishedAt);

    const comps = P.COMPETENCIES.map((c) => {
      const v = r.competencies[c.key];
      return '<div class="comp-bar"><div class="cb-top"><span>' + esc(c.name) + ' <span class="muted small">(' + Math.round(c.weight * 100) + '%)</span></span><span>' + v + '</span></div>' +
        '<div class="cb-track"><div class="cb-fill" style="width:' + v + '%;background:' + barColor(v) + '"></div></div>' +
        '<div class="cb-desc">' + esc(c.desc) + '</div></div>';
    }).join('');

    const ore = s.totals.oreCrusher + s.totals.oreRom;
    const stats = [
      stat(Math.round(ore).toLocaleString() + ' t', 'Ore mined (' + Math.round(d.production.orePct) + '% of ' + s.targets.ore.toLocaleString() + ' t)'),
      stat(Math.round(s.totals.waste).toLocaleString() + ' t', 'Waste moved (' + Math.round(d.production.wastePct) + '% of ' + s.targets.waste.toLocaleString() + ' t)'),
      stat(s.crusher.graded ? Math.round(d.grade.inSpecPct) + '%' : '—', 'Crusher loads in blend spec'),
      stat(Math.round(d.efficiency.utilisation * 100) + '%', 'Loading unit utilisation'),
      stat(d.efficiency.avgQueueMin.toFixed(1) + ' min', 'Avg truck queue per load'),
      stat(d.decisions.avgResponse == null ? '—' : d.decisions.avgResponse.toFixed(0) + ' s', 'Avg radio response time'),
      stat(Math.round(s.totals.oreRom).toLocaleString() + ' t', 'Ore to stockpile'),
      stat(s.idleTruckHours.toFixed(1) + ' h', 'Truck hours parked / idle'),
      stat(String(s.violations.filter((v) => v.category === 'safety').length), 'Safety incidents')
    ].join('');

    const violations = s.violations.length
      ? '<table class="data-table"><thead><tr><th>Time</th><th>Severity</th><th>Type</th><th>What happened</th></tr></thead><tbody>' +
        s.violations.map((v) => '<tr><td>' + clock(v.t) + '</td><td><span class="sev ' + v.severity + '">' + v.severity + '</span></td><td>' + v.category + '</td><td>' + esc(v.text) + '</td></tr>').join('') +
        '</tbody></table>'
      : '<p class="muted">No safety or process incidents. Well done.</p>';

    const decisions = s.decisions.length
      ? '<table class="data-table"><thead><tr><th>Time</th><th>Call</th><th>Response</th><th>Rating</th><th class="num">Resp.</th></tr></thead><tbody>' +
        s.decisions.map((x) =>
          '<tr><td>' + clock(x.t) + '</td><td><b>' + esc(x.from) + '</b><br><span class="muted small">' + esc(x.message) + '</span></td>' +
          '<td>' + (x.chosen ? esc(x.chosen) : '<span class="muted">— no response —</span>') +
          (x.rating !== 'best' && x.best ? '<br><span class="small muted">Best: ' + esc(x.best) + '</span>' : '') +
          (x.feedback ? '<br><span class="small">' + esc(x.feedback) + '</span>' : '') + '</td>' +
          '<td><span class="rating ' + x.rating + '">' + RATING_LABEL[x.rating] + '</span></td>' +
          '<td class="num">' + (x.responseReal == null ? '—' : Math.round(x.responseReal) + 's') + '</td></tr>').join('') +
        '</tbody></table>'
      : '<p class="muted">No radio calls this shift.</p>';

    const disruptions = d.awareness.items.length
      ? '<table class="data-table"><thead><tr><th>Disruption</th><th class="num">Fleet re-planned after</th><th class="num">Score</th></tr></thead><tbody>' +
        d.awareness.items.map((x) => '<tr><td>' + esc(x.label) + '</td><td class="num">' + (x.responseMin == null ? 'not addressed' : x.responseMin.toFixed(1) + ' min') + '</td><td class="num">' + Math.round(x.score) + '</td></tr>').join('') +
        '</tbody></table>'
      : '<p class="muted">No disruptions this shift.</p>';

    const c = record.candidate || {};
    const integrity = record.integrity && !opts.candidateView
      ? '<div class="panel full"><h2>Assessment integrity</h2><p class="small">Window hidden or switched away ' + record.integrity.hiddenCount + ' time(s), ' + record.integrity.hiddenSeconds + ' s in total (the simulation pauses while hidden). ' +
        s.actionCount + ' dispatch actions taken. Real time taken: ' + Math.round(s.realSeconds / 60) + ' min.</p></div>'
      : '';

    return '' +
      '<div class="rep-head">' +
        '<div><p class="eyebrow">' + (s.practice ? 'Practice debrief' : 'Assessment debrief') + '</p>' +
        '<h1>' + esc(c.name || 'Practice') + '</h1>' +
        '<p class="rep-meta">' + esc(s.siteName || 'Demo Copper Mine') + ' · ' + esc(s.scenarioName) + ' · ' + when.toLocaleString() +
        (c.role ? ' · ' + esc(c.role) : '') + (c.years != null && c.name ? ' · ' + esc(c.years) + ' yrs mining' : '') + (c.ref ? ' · ID ' + esc(c.ref) : '') + '</p></div>' +
        '<div class="rep-score"><div class="num">' + r.overall + '</div><div class="of">overall / 100</div>' +
        '<div class="band ' + r.recommendation.band + '">' + esc(r.recommendation.label) + '</div></div>' +
      '</div>' +
      '<div class="rep-grid">' +
        '<div class="panel"><h2>Competencies</h2><div class="comp-bars">' + comps + '</div></div>' +
        '<div class="panel"><h2>Summary</h2><p>' + esc(r.recommendation.reason) + '</p>' +
          '<h2>Strengths</h2><div class="pill-list">' + r.strengths.map((x) => '<span class="pill">' + esc(x) + '</span>').join('') + '</div>' +
          '<h2>Development areas</h2><div class="pill-list">' + (r.development.length ? r.development.map((x) => '<span class="pill">' + esc(x) + '</span>').join('') : '<span class="muted small">None below 80</span>') + '</div>' +
          '<h2>Shift numbers</h2><div class="stat-grid">' + stats + '</div></div>' +
        '<div class="panel full"><h2>Crusher feed blend (rolling 6 loads, ' + esc(unit) + ')</h2>' + blendChart(s) + '<p class="muted small">Green band is the ' + s.blendSpec.min + '–' + s.blendSpec.max + ' ' + esc(unit) + ' specification. Blend is only scored once every ore loading unit has been available for 20 minutes.</p></div>' +
        '<div class="panel full"><h2>Radio calls</h2>' + decisions + '</div>' +
        '<div class="panel"><h2>Incidents</h2>' + violations + '</div>' +
        '<div class="panel"><h2>Response to disruptions</h2>' + disruptions + '</div>' +
        (s.fleet && s.fleet.length > 1
          ? '<div class="panel full"><h2>Fleet by owner</h2><table class="data-table"><thead><tr><th>Trucks</th><th>Owner</th><th class="num">Count</th><th class="num">Loads</th><th class="num">Tonnes</th><th class="num">Loads / truck</th></tr></thead><tbody>' +
            s.fleet.map((f) => '<tr><td>' + esc(f.model) + '</td><td>' + esc(f.owner) + '</td><td class="num">' + f.count + '</td><td class="num">' + f.loads +
              '</td><td class="num">' + Math.round(f.tonnes).toLocaleString() + '</td><td class="num">' + (f.loads / f.count).toFixed(1) + '</td></tr>').join('') +
            '</tbody></table><p class="muted small">Similar loads per truck across owners indicates even-handed dispatch.</p></div>'
          : '') +
        integrity +
      '</div>';
  }

  PitUI.renderReport = renderReport;
})(typeof self !== 'undefined' ? self : this);
