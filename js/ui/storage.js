/*
 * Result persistence (browser localStorage) plus CSV/JSON export & import.
 * Falls back to in-memory storage when localStorage is unavailable.
 */
(function (root) {
  'use strict';
  const PitUI = (root.PitUI = root.PitUI || {});

  const RESULTS_KEY = 'pitsim.v1.results';
  const SETTINGS_KEY = 'pitsim.v1.settings';
  const DEFAULT_SETTINGS = { pin: '1234', showResultsToCandidate: true };
  const memory = {};
  let persistent = true;

  function read(key, fallback) {
    try {
      const v = root.localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      persistent = false;
      return memory[key] !== undefined ? memory[key] : fallback;
    }
  }

  function write(key, value) {
    memory[key] = value;
    try {
      root.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      persistent = false;
      return false;
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function list() {
    const rows = read(RESULTS_KEY, []);
    return Array.isArray(rows) ? rows : [];
  }

  function save(record) {
    const rows = list().filter((r) => r.id !== record.id);
    rows.push(record);
    return write(RESULTS_KEY, rows);
  }

  function remove(id) {
    write(RESULTS_KEY, list().filter((r) => r.id !== id));
  }

  function clear() {
    write(RESULTS_KEY, []);
  }

  function get(id) {
    return list().find((r) => r.id === id) || null;
  }

  function settings() {
    return Object.assign({}, DEFAULT_SETTINGS, read(SETTINGS_KEY, {}));
  }

  function saveSettings(patch) {
    write(SETTINGS_KEY, Object.assign(settings(), patch));
  }

  function candidateKey(c) {
    return (c.name || '').trim().toLowerCase() + '|' + (c.ref || '').trim().toLowerCase();
  }

  // Combine a candidate's assessed attempts into one recommendation.
  function candidates() {
    const groups = {};
    for (const r of list()) {
      if (r.practice) continue;
      const k = candidateKey(r.candidate);
      (groups[k] = groups[k] || { candidate: r.candidate, attempts: [] }).attempts.push(r);
    }
    return Object.values(groups).map((g) => {
      // Use each scenario's most recent attempt.
      const latest = {};
      for (const a of g.attempts.sort((x, y) => x.finishedAt.localeCompare(y.finishedAt))) latest[a.scenarioId] = a;
      const used = Object.values(latest);
      const avg = (f) => Math.round(used.reduce((s, a) => s + f(a), 0) / used.length);
      const overall = avg((a) => a.result.overall);
      const safety = avg((a) => a.result.competencies.safety);
      const critical = used.reduce((s, a) => s + a.result.critical, 0);
      let band;
      if (critical) band = { band: 'not-suitable', label: 'Not suitable at this time' };
      else if (overall >= 80 && safety >= 80) band = { band: 'recommended', label: 'Recommended' };
      else if (overall >= 65) band = { band: 'promising', label: 'Promising' };
      else if (overall >= 55) band = { band: 'develop', label: 'Needs development' };
      else band = { band: 'not-suitable', label: 'Not suitable at this time' };
      const comps = {};
      for (const key of Object.keys(used[0].result.competencies)) comps[key] = avg((a) => a.result.competencies[key]);
      return {
        key: candidateKey(g.candidate),
        candidate: g.candidate,
        attempts: g.attempts.length,
        scenarios: used.map((a) => a.scenarioId),
        lastAt: used.map((a) => a.finishedAt).sort().pop(),
        overall, competencies: comps, critical, recommendation: band,
        latestIds: used.map((a) => a.id)
      };
    });
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCSV() {
    const head = ['finished_at', 'candidate', 'ref', 'role', 'years', 'scenario', 'practice', 'overall',
      'safety', 'production', 'efficiency', 'grade', 'decisions', 'awareness', 'critical_failures', 'recommendation',
      'ore_t', 'waste_t', 'safety_violations', 'process_violations', 'avg_radio_response_s', 'window_hidden_count'];
    const lines = [head.join(',')];
    for (const r of list()) {
      const s = r.summary;
      const c = r.result.competencies;
      const avgResp = r.result.detail.decisions.avgResponse;
      lines.push([
        r.finishedAt, r.candidate.name, r.candidate.ref, r.candidate.role, r.candidate.years, r.scenarioName, r.practice ? 'yes' : 'no', r.result.overall,
        c.safety, c.production, c.efficiency, c.grade, c.decisions, c.awareness, r.result.critical, r.result.recommendation.label,
        Math.round(s.totals.oreCrusher + s.totals.oreRom), Math.round(s.totals.waste),
        s.violations.filter((v) => v.category === 'safety').length, s.violations.filter((v) => v.category === 'process').length,
        avgResp == null ? '' : avgResp.toFixed(1), r.integrity ? r.integrity.hiddenCount : ''
      ].map(csvCell).join(','));
    }
    download('pit-controller-results-' + new Date().toISOString().slice(0, 10) + '.csv', lines.join('\n'), 'text/csv');
  }

  function exportJSON() {
    const payload = { format: 'pitsim-results', version: 1, exportedAt: new Date().toISOString(), results: list() };
    download('pit-controller-results-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(payload, null, 1), 'application/json');
  }

  function importJSON(text) {
    const data = JSON.parse(text);
    const incoming = Array.isArray(data) ? data : data.results;
    if (!Array.isArray(incoming)) throw new Error('Not a results export file.');
    const rows = list();
    const ids = new Set(rows.map((r) => r.id));
    let added = 0;
    for (const r of incoming) {
      if (!r || !r.id || !r.result || !r.summary || !r.candidate || ids.has(r.id)) continue;
      rows.push(r);
      ids.add(r.id);
      added++;
    }
    write(RESULTS_KEY, rows);
    return { added, skipped: incoming.length - added };
  }

  PitUI.esc = esc;
  PitUI.store = {
    list, save, remove, clear, get, settings, saveSettings, candidates,
    exportCSV, exportJSON, importJSON,
    isPersistent: () => persistent
  };
})(typeof self !== 'undefined' ? self : this);
