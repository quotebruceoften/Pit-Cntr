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
    const shovelClass = (s) => s.material === 'waste' ? 'waste' : (s.oreClass || oreClass(s.grade));

    function tag(shovelId) {
      const s = shovelById[shovelId];
      if (!s) return '';
      return s.material === 'waste' ? 'Waste' : CLASS_LABEL[shovelClass(s)];
    }

    function grade(g) {
      return g.toFixed(decimals) + ' ' + unit;
    }

    function mismatch(shovelId, dumpId) {
      const s = shovelById[shovelId];
      const d = dumpById[dumpId];
      if (!s || !d) return false;
      if (s.material === 'waste') return d.role !== 'waste';
      if (d.role === 'waste') return true;
      return !!(d.gradeClass && d.gradeClass !== shovelClass(s));
    }

    // Sensible dump when a truck is moved onto a loading unit.
    function defaultDump(shovelId, state) {
      const s = shovelById[shovelId];
      if (!s) return null;
      if (s.material === 'waste') return (site.wasteDumpFor && site.wasteDumpFor[shovelId]) || mine.wasteDump().id;
      const open = (id) => state.dumps[id].status === 'operating';
      if (stockpileMode) {
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
      site, scenario, mine, unit, decimals, stockpileMode, shovelClass,
      shovelById, dumpById, oreClass, tag, grade, mismatch, defaultDump,
      shovelOptions, dumpOptions, placeName,
      classes, classIds, classIndex, classTag, mixedFleet: classIds.length > 1,
      loadClass: (load) => load.material === 'waste' ? 'waste' : shovelById[load.source] ? shovelClass(shovelById[load.source]) : oreClass(load.grade)
    };
  }

  PitUI.createSiteView = createSiteView;
})(typeof self !== 'undefined' ? self : this);
