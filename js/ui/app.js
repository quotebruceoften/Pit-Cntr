/*
 * App shell: screen navigation, candidate registration, briefing, results
 * saving and the assessor dashboard.
 */
(function (root) {
  'use strict';
  const P = root.PitSim;
  const UI = root.PitUI;
  const store = UI.store;
  const esc = UI.esc;
  const $ = (id) => document.getElementById(id);

  const config = root.PitSimConfig || {};
  let pending = null; // { site, scenario, candidate }
  let reportReturn = 'home';
  let unlocked = false;

  // ----------------------------------------------------------------- sites
  function activeSite() {
    const url = new URLSearchParams(root.location.search).get('site');
    const id = config.lockSite ? config.defaultSite : (url || store.settings().siteId || config.defaultSite);
    return P.getSite(id) || P.SITES[0];
  }

  function siteOptions(selectedId) {
    return P.SITES.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === selectedId ? ' selected' : '') + '>' +
      esc(x.name) + (x.status === 'draft' ? ' (draft)' : x.status === 'demo' ? ' (demo)' : '') + '</option>').join('');
  }

  function renderSiteBar() {
    const site = activeSite();
    $('site-bar').innerHTML =
      '<span class="site-name">' + esc(site.name) + '</span><span class="site-loc">' + esc(site.location || '') + '</span>' +
      (config.lockSite || P.SITES.length < 2 ? '' : '<label>Site <select id="site-select">' + siteOptions(site.id) + '</select></label>') +
      (site.statusNote ? '<div class="draft-note">' + esc(site.statusNote) + '</div>' : '');
    $('home-sequence').textContent = 'Recommended sequence for a candidate: ' + site.scenarios.map((s) => s.name).join(' → ') +
      '. Each assessed shift takes about ' + Math.round(Math.max(...site.scenarios.map((s) => s.durationMin / s.speed))) + ' minutes.';
    const sel = $('site-select');
    if (sel) sel.addEventListener('change', () => { store.saveSettings({ siteId: sel.value }); renderSiteBar(); });
  }

  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    root.scrollTo(0, 0);
  }

  function go(target) {
    if (target === 'home') { renderSiteBar(); return show('home'); }
    if (target === 'setup') { renderScenarioOptions(); show('setup'); $('cand-name').focus(); return; }
    if (target === 'practice') {
      const site = activeSite();
      pending = { site, scenario: site.scenarios.find((s) => s.practice), candidate: null };
      return briefing();
    }
    if (target === 'assessor') { renderAssessor(); show('assessor'); if (!unlocked) $('pin-input').focus(); }
  }

  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));

  // ------------------------------------------------------------------ home
  renderSiteBar();
  $('home-competencies').innerHTML = P.COMPETENCIES.map((c) =>
    '<li><span class="w">' + Math.round(c.weight * 100) + '%</span><strong>' + esc(c.name) + '</strong><span class="d">' + esc(c.desc) + '</span></li>').join('');

  // ----------------------------------------------------------------- setup
  function renderScenarioOptions() {
    const assessed = activeSite().scenarios.filter((s) => !s.practice);
    $('scenario-options').innerHTML = assessed.map((s, i) =>
      '<label class="scenario-opt"><input type="radio" name="scenario" value="' + s.id + '"' + (i === 0 ? ' checked' : '') + '>' +
      '<div><strong>' + esc(s.name) + ' <span class="muted small">· ' + s.durationMin / 60 + ' h shift, ~' + Math.round(s.durationMin / s.speed) + ' min</span></strong>' +
      '<span>' + esc(s.summary) + '</span></div></label>').join('');
  }

  $('setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = String(f.get('name') || '').trim();
    if (!name) return;
    const site = activeSite();
    pending = {
      site,
      scenario: site.scenarios.find((s) => s.id === f.get('scenario')),
      candidate: {
        name,
        ref: String(f.get('ref') || '').trim(),
        role: f.get('role'),
        years: Number(f.get('years') || 0)
      }
    };
    briefing();
  });

  // -------------------------------------------------------------- briefing
  function briefing() {
    const sc = pending.scenario;
    const practice = !!sc.practice;
    $('brief-mode').textContent = pending.site.name + ' · ' + (practice ? 'Practice shift' : 'Assessment · ' + pending.candidate.name);
    $('brief-draft').hidden = !pending.site.statusNote;
    $('brief-draft').textContent = pending.site.statusNote || '';
    const classes = pending.site.fleet.classes ? Object.values(pending.site.fleet.classes) : [];
    $('legend-classes').hidden = classes.length < 2;
    if (classes.length > 1) {
      $('legend-classes').innerHTML = '<span class="sw sw-empty"></span>' + esc(classes[0].name) + ' (' + esc(classes[0].tag || classes[0].owner) + ')' +
        ' &nbsp; <span class="sw sw-empty sw-contractor"></span>' + classes.slice(1).map((c) => esc(c.name) + ' (' + esc(c.tag || c.owner) + ')').join(', ');
    }
    $('brief-title').textContent = sc.name;
    $('brief-summary').textContent = sc.summary;
    $('brief-points').innerHTML = sc.briefing.map((b) => '<li>' + esc(b) + '</li>').join('');
    const rules = practice
      ? [
        'You can pause and change the speed at any time.',
        'Feedback on each radio answer is shown straight away.',
        'Results are not saved to the candidate rankings.'
      ]
      : [
        'The shift runs at ' + sc.speed + '× real time: ' + sc.durationMin / 60 + ' hours of shift in about ' + Math.round(sc.durationMin / sc.speed) + ' minutes. There is no pause.',
        'Radio calls must be answered within their countdown (about 30 seconds).',
        'Stay on this window. Switching away is recorded and the simulation stops while hidden.',
        'Scoring: safety 30%, production 20%, fleet efficiency 15%, radio decisions 15%, grade control 10%, situational awareness 10%.'
      ];
    $('brief-rules').innerHTML = rules.map((b) => '<li>' + esc(b) + '</li>').join('');
    show('briefing');
  }

  $('btn-start-shift').addEventListener('click', () => {
    const { site, scenario, candidate } = pending;
    const startedAt = new Date().toISOString();
    show('sim');
    UI.startConsole({
      site,
      scenario,
      candidate,
      onFinish: (summary, meta) => finishShift(site, scenario, candidate, startedAt, summary, meta)
    });
  });

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function finishShift(site, scenario, candidate, startedAt, summary, meta) {
    const record = {
      id: uid(),
      siteId: site.id,
      siteName: site.name,
      candidate: candidate || { name: 'Practice' },
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      practice: !!scenario.practice,
      startedAt,
      finishedAt: new Date().toISOString(),
      summary,
      result: P.score(summary),
      integrity: meta.integrity
    };
    let saved = true;
    if (!record.practice) saved = store.save(record);
    const settings = store.settings();
    reportReturn = 'home';
    if (record.practice || settings.showResultsToCandidate) {
      $('report').innerHTML = UI.renderReport(record, { candidateView: true }) +
        (saved ? '' : '<p class="error">Warning: results could not be saved to this browser\'s storage. Print or save this page now.</p>');
    } else {
      $('report').innerHTML = '<div class="complete-msg"><h1>Shift complete</h1><p class="lede" style="margin:0 auto">Thank you, ' +
        esc(candidate.name) + '. Your results have been recorded for the assessor.</p></div>';
    }
    show('report');
  }

  $('report-back').addEventListener('click', () => {
    if (reportReturn === 'assessor') { renderAssessor(); show('assessor'); } else show('home');
  });
  $('report-print').addEventListener('click', () => root.print());

  // -------------------------------------------------------------- assessor
  $('pin-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if ($('pin-input').value === store.settings().pin) {
      unlocked = true;
      $('pin-input').value = '';
      $('pin-error').hidden = true;
      renderAssessor();
    } else {
      $('pin-error').hidden = false;
    }
  });

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));

  function selectTab(name) {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach((x) => x.classList.toggle('active', x.dataset.panel === name));
  }

  const sortState = { candidates: { key: 'overall', dir: -1 }, attempts: { key: 'finishedAt', dir: -1 } };

  function sortRows(rows, st, get) {
    return rows.slice().sort((a, b) => {
      const x = get(a, st.key);
      const y = get(b, st.key);
      return (x < y ? -1 : x > y ? 1 : 0) * st.dir;
    });
  }

  function headerCells(cols, st) {
    return '<tr>' + cols.map(([key, label, cls]) =>
      '<th class="sortable ' + (cls || '') + '" data-key="' + key + '">' + label + (st.key === key ? (st.dir < 0 ? ' ▾' : ' ▴') : '') + '</th>').join('') + '</tr>';
  }

  function bindSort(table, st, rerender) {
    table.querySelectorAll('th.sortable').forEach((th) => th.addEventListener('click', () => {
      if (st.key === th.dataset.key) st.dir = -st.dir;
      else { st.key = th.dataset.key; st.dir = -1; }
      rerender();
    }));
  }

  const COMP_COLS = [['safety', 'Safety'], ['production', 'Prod.'], ['efficiency', 'Eff.'], ['grade', 'Grade'], ['decisions', 'Radio'], ['awareness', 'Aware.']];

  function scoreCell(v) {
    const color = v >= 80 ? 'var(--ok)' : v >= 60 ? 'var(--warn)' : 'var(--danger)';
    return '<td class="num" style="color:' + color + '">' + v + '</td>';
  }

  function renderCandidates() {
    const table = $('cand-table');
    const list = store.candidates(assessorSite());
    if (!list.length) {
      table.innerHTML = '<tr><td class="empty">No assessed shifts yet.</td></tr>';
      return;
    }
    const st = sortState.candidates;
    const get = (c, k) => k === 'name' ? c.candidate.name.toLowerCase() : k === 'lastAt' ? c.lastAt : k === 'shifts' ? c.scenarios.length
      : k === 'overall' ? c.overall : k === 'rec' ? c.recommendation.label : c.competencies[k];
    const cols = [['name', 'Candidate'], ['shifts', 'Shifts'], ['overall', 'Overall', 'num']].concat(COMP_COLS.map(([k, l]) => [k, l, 'num'])).concat([['rec', 'Recommendation'], ['lastAt', 'Last assessed']]);
    table.innerHTML = '<thead>' + headerCells(cols, st) + '</thead><tbody>' +
      sortRows(list, st, get).map((c) =>
        '<tr class="clickable" data-name="' + esc(c.candidate.name) + '">' +
        '<td><b>' + esc(c.candidate.name) + '</b><br><span class="muted small">' + esc(c.candidate.role || '') + (c.candidate.ref ? ' · ' + esc(c.candidate.ref) : '') + '</span></td>' +
        '<td>' + c.scenarios.map((id) => '<span class="pill">' + esc(id) + '</span>').join(' ') + '</td>' +
        '<td class="num"><b>' + c.overall + '</b></td>' +
        COMP_COLS.map(([k]) => scoreCell(c.competencies[k])).join('') +
        '<td><span class="band ' + c.recommendation.band + '">' + esc(c.recommendation.label) + '</span>' + (c.critical ? '<br><span class="small" style="color:var(--danger)">' + c.critical + ' critical safety failure(s)</span>' : '') + '</td>' +
        '<td class="small muted">' + new Date(c.lastAt).toLocaleDateString() + '</td></tr>').join('') + '</tbody>';
    bindSort(table, st, renderCandidates);
    table.querySelectorAll('tr.clickable').forEach((tr) => tr.addEventListener('click', () => {
      $('attempt-search').value = tr.dataset.name;
      selectTab('attempts');
      renderAttempts();
    }));
  }

  function renderAttempts() {
    const table = $('attempt-table');
    const filter = $('attempt-filter').value;
    const q = $('attempt-search').value.trim().toLowerCase();
    const includePractice = $('attempt-practice').checked;
    const siteId = assessorSite();
    const rows = store.list().filter((r) => (includePractice || !r.practice) && (!siteId || store.siteOf(r) === siteId) &&
      (!filter || store.siteOf(r) + ':' + r.scenarioId === filter) &&
      (!q || (r.candidate.name || '').toLowerCase().includes(q) || (r.candidate.ref || '').toLowerCase().includes(q)));
    if (!rows.length) {
      table.innerHTML = '<tr><td class="empty">No matching attempts.</td></tr>';
      return;
    }
    const st = sortState.attempts;
    const get = (r, k) => k === 'finishedAt' ? r.finishedAt : k === 'name' ? r.candidate.name.toLowerCase() : k === 'scenario' ? r.scenarioName
      : k === 'overall' ? r.result.overall : k === 'rec' ? r.result.recommendation.label : r.result.competencies[k];
    const cols = [['finishedAt', 'Date'], ['name', 'Candidate'], ['scenario', 'Scenario'], ['overall', 'Overall', 'num']]
      .concat(COMP_COLS.map(([k, l]) => [k, l, 'num'])).concat([['rec', 'Recommendation']]);
    table.innerHTML = '<thead>' + headerCells(cols, st).replace('</tr>', '<th></th></tr>') + '</thead><tbody>' +
      sortRows(rows, st, get).map((r) =>
        '<tr class="clickable" data-id="' + esc(r.id) + '">' +
        '<td class="small">' + new Date(r.finishedAt).toLocaleString() + '</td>' +
        '<td><b>' + esc(r.candidate.name) + '</b></td>' +
        '<td>' + esc(r.scenarioName) + (r.practice ? ' <span class="chip muted">practice</span>' : '') + '</td>' +
        '<td class="num"><b>' + r.result.overall + '</b></td>' +
        COMP_COLS.map(([k]) => scoreCell(r.result.competencies[k])).join('') +
        '<td><span class="band ' + r.result.recommendation.band + '">' + esc(r.result.recommendation.label) + '</span></td>' +
        '<td><button class="btn btn-sm btn-danger-outline" data-del="' + esc(r.id) + '" aria-label="Delete attempt">✕</button></td></tr>').join('') + '</tbody>';
    bindSort(table, st, renderAttempts);
    table.querySelectorAll('tr.clickable').forEach((tr) => tr.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) {
        e.stopPropagation();
        if (root.confirm('Delete this attempt permanently?')) { store.remove(del.dataset.del); renderAssessor(); }
        return;
      }
      openReport(tr.dataset.id);
    }));
  }

  function openReport(id) {
    const rec = store.get(id);
    if (!rec) return;
    reportReturn = 'assessor';
    $('report').innerHTML = UI.renderReport(rec, { candidateView: false });
    show('report');
  }

  function renderAssessor() {
    $('assessor-lock').hidden = unlocked;
    $('assessor-body').hidden = !unlocked;
    if (!unlocked) return;
    const siteSel = $('assessor-site');
    if (!siteSel.options.length) {
      siteSel.innerHTML = (config.lockSite ? '' : '<option value="">All sites</option>') + siteOptions(activeSite().id);
      siteSel.value = activeSite().id;
    }
    $('assessor-site-row').hidden = config.lockSite || P.SITES.length < 2;
    const sel = $('attempt-filter');
    const cur = sel.value;
    const sites = assessorSite() ? [P.getSite(assessorSite())] : P.SITES;
    sel.innerHTML = '<option value="">All scenarios</option>' + sites.map((site) => site.scenarios.map((s) =>
      '<option value="' + site.id + ':' + s.id + '">' + (sites.length > 1 ? esc(site.name) + ' — ' : '') + esc(s.name) + '</option>').join('')).join('');
    sel.value = [...sel.options].some((o) => o.value === cur) ? cur : '';
    const setSite = $('set-site');
    setSite.innerHTML = siteOptions(activeSite().id);
    setSite.disabled = !!config.lockSite;
    $('site-lock-note').textContent = config.lockSite
      ? 'This installation is locked to ' + activeSite().name + '.'
      : 'The site used for new assessments and practice shifts on this computer.';
    $('set-show-results').checked = store.settings().showResultsToCandidate;
    renderCandidates();
    renderAttempts();
    if (!store.isPersistent()) {
      $('import-status').textContent = 'Warning: this browser is not allowing local storage — results will be lost when the page closes. Export now.';
    }
  }

  function assessorSite() {
    return $('assessor-site').value;
  }

  $('assessor-site').addEventListener('change', () => { $('attempt-filter').value = ''; renderAssessor(); });
  $('set-site').addEventListener('change', (e) => {
    store.saveSettings({ siteId: e.target.value });
    $('import-status').textContent = 'Active site set to ' + P.getSite(e.target.value).name + '.';
  });
  $('attempt-filter').addEventListener('change', renderAttempts);
  $('attempt-search').addEventListener('input', renderAttempts);
  $('attempt-practice').addEventListener('change', renderAttempts);
  $('set-show-results').addEventListener('change', (e) => store.saveSettings({ showResultsToCandidate: e.target.checked }));
  $('pin-change').addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = $('pin-new').value.trim();
    if (pin.length < 4) { $('import-status').textContent = 'PIN must be at least 4 characters.'; return; }
    store.saveSettings({ pin });
    $('pin-new').value = '';
    $('import-status').textContent = 'PIN changed.';
  });
  $('export-csv').addEventListener('click', () => store.exportCSV());
  $('export-json').addEventListener('click', () => store.exportJSON());
  $('import-json').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then((text) => {
      try {
        const res = store.importJSON(text);
        $('import-status').textContent = 'Imported ' + res.added + ' result(s)' + (res.skipped ? ', skipped ' + res.skipped + ' duplicate/invalid.' : '.');
        renderAssessor();
      } catch (err) {
        $('import-status').textContent = 'Import failed: ' + err.message;
      }
      e.target.value = '';
    });
  });
  $('clear-all').addEventListener('click', () => {
    if (root.confirm('Delete ALL saved results from this browser? Export first if you need them.')) {
      store.clear();
      renderAssessor();
    }
  });
})(typeof self !== 'undefined' ? self : this);
