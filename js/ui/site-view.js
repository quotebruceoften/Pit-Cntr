/*
 * Display helpers derived from a site profile: equipment labels, dump
 * options, ore classes and grade formatting. Keeps site knowledge out of
 * the console, map and report code.
 */
(function (root) {
  'use strict';
  const PitUI = (root.PitUI = root.PitUI || {});

  function createSiteView(site, scenario, mine) {
    const blend = scenario.blend;
    const stockpileMode = site.gradeControl === 'stockpiles';
    // Sites without an FMS get no dispatch aids (wrong-dump warnings, auto dumps).
    const aids = site.dispatchAids !== false;
    const oreTypes = {};
    for (const t of site.oreTypes || []) oreTypes[t.id] = t;
    const TIER_CLASS = { high: 'hg', mid: 'mg', low: 'lg' };
    const oreTypeName = (id) => (oreTypes[id] ? oreTypes[id].name : id);
    const unit = site.commodity.gradeUnit;
    const decimals = site.commodity.gradeDecimals != null ? site.commodity.gradeDecimals : 2;
    const shovelById = {};
    for (const s of mine.SHOVELS) shovelById[s.id] = s;
    const dumpById = {};
    for (const d of mine.DUMPS) dumpById[d.id] = d;

    // HG / LG relative to the plant feed specification (blend sites).
    function oreClass(grade) {
      if (!blend) return grade >= 1.5 ? 'hg' : 'lg';
      if (grade >= blend.max) return 'hg';
      if (grade <= blend.min) return 'lg';
      return 'mg';
    }
    const CLASS_LABEL = { hg: 'HG', lg: 'LG', mg: 'Ore' };
    // Loading units may declare their ore class explicitly (stockpile sites).
    const shovelClass = (s) => {
      if (s.material === 'waste') return 'waste';
      if (s.oreType && oreTypes[s.oreType]) return TIER_CLASS[oreTypes[s.oreType].tier] || 'mg';
      return s.oreClass || oreClass(s.grade);
    };
    // Live description of what a unit is loading (ore type can change mid-shift).
    const loadingText = (s) => s.material === 'waste' ? 'Waste'
      : s.oreType ? oreTypeName(s.oreType) : CLASS_LABEL[shovelClass(s)] + ' ' + grade(s.grade);

    function tag(shovelId) {
      const s = shovelById[shovelId];
      if (!s) return '';
      if (s.material === 'waste') return 'Waste';
      return s.oreType ? 'ore' : CLASS_LABEL[shovelClass(s)];
    }

    function grade(g) {
      return g.toFixed(decimals) + ' ' + unit;
    }

    // Pass the live shovel state so ore-type changes are respected.
    function mismatch(shovelId, dumpId, liveShovel) {
      if (!aids) return false;
      const s = liveShovel || shovelById[shovelId];
      const d = dumpById[dumpId];
      if (!s || !d) return false;
      if (s.material === 'waste') return d.role !== 'waste';
      if (d.role === 'waste') return true;
      if (d.oreTypes) return !d.oreTypes.includes(s.oreType);
      return !!(d.gradeClass && d.gradeClass !== shovelClass(s));
    }

    // Sensible dump when a truck is moved onto a loading unit.
    function defaultDump(shovelId, state) {
      const s = shovelById[shovelId];
      if (!s) return null;
      if (s.material === 'waste') return (site.wasteDumpFor && site.wasteDumpFor[shovelId]) || mine.wasteDump().id;
      const open = (id) => state.dumps[id].status === 'operating';
      if (stockpileMode) {
        const live = state.shovels[shovelId];
        if (live.oreType) {
          const finger = mine.DUMPS.find((d) => d.oreTypes && d.oreTypes.includes(live.oreType));
          return finger ? finger.id : null;
        }
        const planned = (site.oreDumpFor && site.oreDumpFor[shovelId]) ||
          mine.DUMPS.find((d) => d.role === 'stockpile' && d.gradeClass === shovelClass(s)).id;
        if (open(planned)) return planned;
        const alt = mine.DUMPS.find((d) => d.role === 'stockpile' && d.gradeClass === dumpById[planned].gradeClass && open(d.id));
        return alt ? alt.id : planned;
      }
      const crusher = mine.crusher();
      const stockpile = mine.stockpile();
      return open(crusher.id) || !stockpile ? crusher.id : stockpile.id;
    }

    const shovelOptions = mine.SHOVELS.map((s) => [s.id, s.id + ' ' + tag(s.id)]).concat([['PARK', 'Park']]);
    const dumpOptions = mine.DUMPS.map((d) => [d.id, d.short || d.name]);
    // Truck classes / owners. The first class is drawn as circles, others as squares.
    const classes = site.fleet.classes || {};
    const classIds = Object.keys(classes);
    const classIndex = (cls) => Math.max(0, classIds.indexOf(cls));
    const classTag = (cls) => (classes[cls] && (classes[cls].tag || classes[cls].owner)) || '';

    const placeName = (id) => (dumpById[id] ? dumpById[id].short || dumpById[id].name : id === mine.BASE ? 'Workshop' : id);

    return {
      site, scenario, mine, unit, decimals, stockpileMode, shovelClass, aids, oreTypes, oreTypeName, loadingText,
      shovelById, dumpById, oreClass, tag, grade, mismatch, defaultDump,
      shovelOptions, dumpOptions, placeName,
      classes, classIds, classIndex, classTag, mixedFleet: classIds.length > 1,
      loadClass: (load) => {
        if (load.material === 'waste') return 'waste';
        if (load.oreType && oreTypes[load.oreType]) return TIER_CLASS[oreTypes[load.oreType].tier] || 'mg';
        return shovelById[load.source] ? shovelClass(shovelById[load.source]) : oreClass(load.grade);
      },
      loadText: (load) => {
        if (load.material === 'waste') return 'Waste';
        if (load.oreType && oreTypes[load.oreType]) return oreTypes[load.oreType].name;
        return tag(load.source) + ' ' + load.grade.toFixed(decimals);
      }
    };
  }

  PitUI.createSiteView = createSiteView;
})(typeof self !== 'undefined' ? self : this);
