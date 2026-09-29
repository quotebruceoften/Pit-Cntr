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
    const unit = site.commodity.gradeUnit;
    const decimals = site.commodity.gradeDecimals != null ? site.commodity.gradeDecimals : 2;
    const shovelById = {};
    for (const s of mine.SHOVELS) shovelById[s.id] = s;
    const dumpById = {};
    for (const d of mine.DUMPS) dumpById[d.id] = d;

    // HG / LG relative to the plant feed specification.
    function oreClass(grade) {
      if (grade >= blend.max) return 'hg';
      if (grade <= blend.min) return 'lg';
      return 'mg';
    }
    const CLASS_LABEL = { hg: 'HG', lg: 'LG', mg: 'Ore' };

    function tag(shovelId) {
      const s = shovelById[shovelId];
      if (!s) return '';
      return s.material === 'waste' ? 'Waste' : CLASS_LABEL[oreClass(s.grade)];
    }

    function grade(g) {
      return g.toFixed(decimals) + ' ' + unit;
    }

    function mismatch(shovelId, dumpId) {
      const s = shovelById[shovelId];
      const d = dumpById[dumpId];
      if (!s || !d) return false;
      return s.material === 'ore' ? d.role === 'waste' : d.role !== 'waste';
    }

    // Sensible dump when a truck is moved onto a loading unit.
    function defaultDump(shovelId, state) {
      const s = shovelById[shovelId];
      if (!s) return null;
      if (s.material === 'waste') return (site.wasteDumpFor && site.wasteDumpFor[shovelId]) || mine.wasteDump().id;
      const crusher = mine.crusher();
      const stockpile = mine.stockpile();
      return state.dumps[crusher.id].status === 'operating' || !stockpile ? crusher.id : stockpile.id;
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
      site, scenario, mine, unit, decimals,
      shovelById, dumpById, oreClass, tag, grade, mismatch, defaultDump,
      shovelOptions, dumpOptions, placeName,
      classes, classIds, classIndex, classTag, mixedFleet: classIds.length > 1,
      loadClass: (load) => load.material === 'waste' ? 'waste' : oreClass(shovelById[load.source] ? shovelById[load.source].grade : load.grade)
    };
  }

  PitUI.createSiteView = createSiteView;
})(typeof self !== 'undefined' ? self : this);
