/*
 * Competency scoring. Converts a simulation summary into six competency
 * scores (0-100), a weighted overall score and a recommendation band.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PitSim = root.PitSim || {};
    Object.assign(root.PitSim, factory());
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COMPETENCIES = [
    { key: 'safety', name: 'Safety leadership', weight: 0.30,
      desc: 'Keeps people and equipment out of harm: blast and geotech exclusion zones, fatigue, unsafe instructions.' },
    { key: 'production', name: 'Production delivery', weight: 0.20,
      desc: 'Ore and waste tonnes moved against the shift plan.' },
    { key: 'efficiency', name: 'Fleet efficiency', weight: 0.15,
      desc: 'Matches trucks to loading units: unit loading rates (against hourly targets where set) and truck queueing.' },
    { key: 'grade', name: 'Grade & process control', weight: 0.10,
      desc: 'Sends ore to the right place by grade (crusher blend or ROM pad finger) and keeps waste out of ore.' },
    { key: 'decisions', name: 'Radio decision making', weight: 0.15,
      desc: 'Quality and speed of instructions given in response to radio calls.' },
    { key: 'awareness', name: 'Situational awareness', weight: 0.10,
      desc: 'How quickly the fleet is re-planned after breakdowns, outages, alarms and blasts.' }
  ];

  const SAFETY_PENALTY = { minor: 5, major: 20, critical: 50 };
  const PROCESS_PENALTY = { minor: 5, major: 15, critical: 30 };
  const RATING_SCORE = { best: 100, ok: 60, poor: 25, unsafe: 0, timeout: 0 };

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  // Linear ramp: returns 0 at x0 and 1 at x1 (works for x0 > x1 too).
  const ramp = (x, x0, x1) => clamp((x - x0) / (x1 - x0), 0, 1);

  function scoreSafety(s) {
    let score = 100;
    let critical = 0;
    for (const v of s.violations) {
      if (v.category !== 'safety') continue;
      score -= SAFETY_PENALTY[v.severity] || 0;
      if (v.severity === 'critical') critical++;
    }
    return { score: clamp(score, 0, 100), critical };
  }

  function scoreProduction(s) {
    // In blend mode ore sent to a stockpile is rehandled later, so it counts
    // at 85%. In stockpile mode the ROM pad is the intended destination.
    const romWeight = s.gradeControl === 'stockpiles' ? 1 : 0.85;
    const ore = (s.totals.oreCrusher + romWeight * s.totals.oreRom) / s.targets.ore;
    const waste = s.totals.waste / s.targets.waste;
    return {
      score: 100 * (0.65 * Math.min(1, ore) + 0.35 * Math.min(1, waste)),
      orePct: ore * 100,
      wastePct: waste * 100
    };
  }

  function scoreEfficiency(s) {
    let op = 0;
    let busy = 0;
    for (const sh of s.shovels) { op += sh.opTime; busy += sh.busyTime; }
    const util = op > 0 ? busy / op : 0;
    // Truck-limited sites (long cycles) cannot keep loading units busy, so a
    // site can set the utilisation range that counts as poor → excellent.
    const [uLo, uHi] = s.utilisationRange || [0.35, 0.85];
    let utilScore = ramp(util, uLo, uHi);
    // Sites with hourly loading targets per unit: score each unit that ran
    // for at least 30 min on its loads/hour against target (50% → 0, 90% → 1;
    // truck-limited sites rarely reach 100% even with good dispatch).
    const targeted = s.shovels.filter((sh) => sh.targetPerHour && sh.opTime >= 1800);
    let unitTargets = null;
    if (targeted.length) {
      unitTargets = targeted.map((sh) => ({ id: sh.id, rate: sh.loadsPerHour, target: sh.targetPerHour }));
      utilScore = unitTargets.reduce((a, u) => a + ramp(u.rate / u.target, 0.5, 0.9), 0) / unitTargets.length;
    }
    // Sites whose fleet is larger than the loading units can serve queue by
    // design; queueAllowanceMin shifts the scale so only avoidable queueing counts.
    const allow = s.queueAllowanceMin || 0;
    const queueScore = ramp(s.avgQueueMinPerLoad, 6 + allow, 1 + allow);
    return { score: 100 * (0.6 * utilScore + 0.4 * queueScore), utilisation: util, avgQueueMin: s.avgQueueMinPerLoad, unitTargets };
  }

  function scoreGrade(s) {
    let pct;
    if (s.gradeControl === 'stockpiles') {
      // Share of ore loads tipped on the ROM pad finger for their grade class.
      pct = s.routing.oreTips ? (100 * s.routing.correct) / s.routing.oreTips : 0;
    } else {
      pct = s.crusher.graded ? (100 * s.crusher.inSpec) / s.crusher.graded : 0;
    }
    let score = pct;
    for (const v of s.violations) {
      // Misrouted loads are already reflected in the routing percentage.
      if (v.category === 'process' && v.code !== 'misroute') score -= PROCESS_PENALTY[v.severity] || 0;
    }
    return { score: clamp(score, 0, 100), inSpecPct: pct };
  }

  function scoreDecisions(s) {
    if (!s.decisions.length) return { score: 100, avgResponse: null };
    let total = 0;
    let respSum = 0;
    let respN = 0;
    for (const d of s.decisions) {
      let v = RATING_SCORE[d.rating] || 0;
      if (d.responseReal != null) {
        v *= 1 - 0.15 * ramp(d.responseReal, 10, 30);
        respSum += d.responseReal;
        respN++;
      }
      total += v;
    }
    return { score: total / s.decisions.length, avgResponse: respN ? respSum / respN : null };
  }

  function disruptionScore(d) {
    if (d.resolvedAt == null) return 0;
    const resp = d.resolvedAt - d.start;
    return 100 * (1 - ramp(resp, d.target, d.limit));
  }

  function scoreAwareness(s) {
    if (!s.disruptions.length) return { score: 100, items: [] };
    const items = s.disruptions.map((d) => ({
      label: d.label,
      responseMin: d.resolvedAt != null ? (d.resolvedAt - d.start) / 60 : null,
      score: disruptionScore(d)
    }));
    return { score: items.reduce((a, b) => a + b.score, 0) / items.length, items };
  }

  function recommend(overall, safety, critical) {
    if (critical > 0) {
      return { band: 'not-suitable', label: 'Not suitable at this time', reason: 'Critical safety failure during the assessment.' };
    }
    if (overall >= 80 && safety >= 80) {
      return { band: 'recommended', label: 'Recommended', reason: 'Ready to progress to pit controller role / final interview.' };
    }
    if (overall >= 65) {
      return { band: 'promising', label: 'Promising', reason: 'Good potential — recommend the pit controller trainee pathway.' };
    }
    if (overall >= 55) {
      return { band: 'develop', label: 'Needs development', reason: 'Some capability shown; significant development needed before reassessment.' };
    }
    return { band: 'not-suitable', label: 'Not suitable at this time', reason: 'Overall performance below the minimum standard.' };
  }

  function score(summary) {
    const safety = scoreSafety(summary);
    const detail = {
      safety,
      production: scoreProduction(summary),
      efficiency: scoreEfficiency(summary),
      grade: scoreGrade(summary),
      decisions: scoreDecisions(summary),
      awareness: scoreAwareness(summary)
    };
    const competencies = {};
    let overall = 0;
    for (const c of COMPETENCIES) {
      const v = Math.round(detail[c.key].score);
      competencies[c.key] = v;
      overall += v * c.weight;
    }
    overall = Math.round(overall);
    const ranked = COMPETENCIES.slice().sort((a, b) => competencies[b.key] - competencies[a.key]);
    return {
      overall,
      competencies,
      detail,
      critical: safety.critical,
      recommendation: recommend(overall, competencies.safety, safety.critical),
      strengths: ranked.slice(0, 2).map((c) => c.name),
      development: ranked.slice(-2).reverse().filter((c) => competencies[c.key] < 80).map((c) => c.name)
    };
  }

  return { COMPETENCIES, score };
});
