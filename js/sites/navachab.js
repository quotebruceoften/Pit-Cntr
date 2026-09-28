/*
 * QKR Navachab Gold Mine — Karibib, Erongo Region, Namibia.
 *
 * DRAFT PROFILE. Public facts used: open-pit gold mine ~10 km from Karibib,
 * CIP/CIL processing plant, cut-off grade of the order of 1.2 g/t, Main
 * (central) pit plus the Anomaly 16 satellite pit, summer thunderstorm season.
 *
 * Everything else — pit geometry, haul road network, fleet size and payload,
 * equipment IDs, grades per face, targets, shift times and the wording of
 * procedures (TARPs) — is a PLACEHOLDER to be confirmed with the site.
 * See docs/sites/navachab-data-sheet.md for the list of items to confirm.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../sim/library.js'));
  } else {
    factory(root.PitSim);
  }
})(typeof self !== 'undefined' ? self : this, function (lib) {
  'use strict';

  const L = lib.scenarioLib;

  // Representative layout, not surveyed. Main Pit in the centre with a
  // switchback ramp; Anomaly 16 satellite pit to the east; plant (crusher and
  // low-grade stockpile) to the west; two waste rock dumps.
  const layout = {
    width: 3400,
    height: 2300,
    metersPerUnit: 0.6,
    base: 'WS',
    nodes: {
      CR: { x: 360, y: 380, label: 'Primary crusher (plant)' },
      LGS: { x: 660, y: 170, label: 'LG / ROM stockpile' },
      NWRD: { x: 2700, y: 220, label: 'North WRD' },
      EWRD: { x: 3230, y: 1080, label: 'East WRD' },
      WS: { x: 1650, y: 140, label: 'Mine workshop / fuel bay' },
      J1: { x: 820, y: 500 },
      J2: { x: 1650, y: 480 },
      J3: { x: 2350, y: 520 },
      J6: { x: 2900, y: 860 },
      R1: { x: 1350, y: 760, label: 'Main Pit ramp' },
      R2: { x: 1850, y: 1060 },
      R3: { x: 1300, y: 1330 },
      MF: { x: 1500, y: 1620, label: 'Main Pit floor' },
      J4: { x: 1050, y: 1720 },
      J5: { x: 1800, y: 1760 },
      EX1: { x: 800, y: 1880 },
      EX2: { x: 2060, y: 1920 },
      EX3: { x: 2330, y: 1200 },
      A1: { x: 2950, y: 1300, label: 'A16 ramp' },
      A2: { x: 2820, y: 1620 },
      EX4: { x: 3020, y: 1950 }
    },
    edges: [
      ['CR', 'J1'], ['LGS', 'J1'], ['J1', 'J2'], ['J2', 'WS'], ['J2', 'J3'], ['J3', 'NWRD'],
      ['J3', 'J6'], ['J6', 'EWRD'], ['J6', 'A1'],
      ['A1', 'A2', { ramp: true, upFrom: 'A2' }],
      ['A2', 'EX4'],
      ['J2', 'R1'],
      ['R1', 'R2', { ramp: true, upFrom: 'R2' }],
      ['R2', 'R3', { ramp: true, upFrom: 'R3' }],
      ['R3', 'MF', { ramp: true, upFrom: 'MF' }],
      ['MF', 'J4'], ['J4', 'EX1'], ['MF', 'J5'], ['J5', 'EX2'], ['R2', 'EX3']
    ],
    shovels: [
      { id: 'EX1', name: 'Excavator EX1', material: 'ore', grade: 2.6, label: 'Main Pit high-grade ore', loadSec: 120 },
      { id: 'EX2', name: 'Excavator EX2', material: 'ore', grade: 0.9, label: 'Main Pit low-grade ore', loadSec: 120, safePos: { x: 1790, y: 1740 } },
      { id: 'EX3', name: 'Excavator EX3', material: 'waste', grade: 0, label: 'Main Pit waste (upper benches)', loadSec: 105 },
      { id: 'EX4', name: 'Excavator EX4', material: 'waste', grade: 0, label: 'Anomaly 16 waste pre-strip', loadSec: 105 }
    ],
    dumps: [
      { id: 'CR', name: 'Primary Crusher', short: 'Crusher', role: 'crusher', bays: 1, dumpSec: 50 },
      { id: 'LGS', name: 'LG / ROM Stockpile', short: 'LG stockpile', role: 'stockpile', bays: 2, dumpSec: 40 },
      { id: 'NWRD', name: 'North Waste Rock Dump', short: 'North WRD', role: 'waste', bays: 3, dumpSec: 40 },
      { id: 'EWRD', name: 'East Waste Rock Dump', short: 'East WRD', role: 'waste', bays: 2, dumpSec: 40 }
    ],
    pits: [
      { cx: 1560, cy: 1500, rx: 1020, ry: 820, floorShift: 220, label: 'MAIN PIT' },
      { cx: 2960, cy: 1720, rx: 300, ry: 430, floorShift: 120, label: 'ANOMALY 16' }
    ]
  };

  const plan = (ex1, ex2, ex3, ex4) => [['EX1', 'CR', ex1], ['EX2', 'CR', ex2], ['EX3', 'NWRD', ex3], ['EX4', 'EWRD', ex4]];
  const fleet = (p, parked) => L.fleet(p, parked, 'HT');
  const blend = { min: 1.3, max: 1.9 };
  const blendText = 'Plant feed blend must stay between 1.3 and 1.9 g/t Au (rolling average of the last 6 crusher loads).';

  const scenarios = [
    {
      id: 'practice',
      name: 'Practice shift',
      practice: true,
      durationMin: 60,
      startClockMin: 6 * 60,
      speed: 15,
      summary: 'A short warm-up on the Navachab layout. Pause and change speed freely. Feedback on radio calls is shown straight away.',
      briefing: [
        'Four loading units: EX1 (Main Pit high-grade ore), EX2 (Main Pit low-grade ore), EX3 (Main Pit waste) and EX4 (Anomaly 16 waste). Five haul trucks on each.',
        'Ore goes to the primary crusher, or the LG/ROM stockpile if the crusher is down. Waste goes to the North or East waste rock dump.',
        'Practice results are not included in the candidate rankings.'
      ],
      blend,
      targets: { ore: 2700, waste: 2800 },
      fleet: fleet(plan(5, 5, 5, 5)),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Practice shift started. Trucks are leaving the go-line.' },
        L.lvCrossing(8, 'LV12 (geology)', 'the Main Pit geology bench'),
        { at: 20, type: 'shovelDown', shovel: 'EX4', minutes: 15, reason: 'Track tension fault' },
        { at: 35, type: 'fuelLow', truck: 'HT03', minutes: 40, radio: L.fuelRadio('HT03') }
      ]
    },
    {
      id: 'day',
      name: 'Day shift — Main Pit & Anomaly 16',
      durationMin: 180,
      startClockMin: 6 * 60,
      speed: 15,
      summary: 'A normal day shift across both pits: an unbalanced handover, dust, an excavator breakdown, a crusher outage and routine radio traffic.',
      briefing: [
        'Handover note: night shift left 3 trucks on EX1 (high-grade), 7 on EX2 (low-grade), 5 on EX3 and 5 on EX4. Check whether that suits the plant feed blend and the loading units.',
        blendText,
        'Shift targets: TARGET_ORE t ore and TARGET_WASTE t waste.'
      ],
      blend,
      targets: { ore: 9000, waste: 10800 },
      fleet: fleet(plan(3, 7, 5, 5)),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Day shift started. Review the handover allocation.' },
        L.lvCrossing(12, 'LV14 (survey)', 'the Anomaly 16 survey control point'),
        L.dust(25, 'main haul road to the North WRD'),
        { at: 30, type: 'fuelLow', truck: 'HT06', minutes: 40, radio: L.fuelRadio('HT06') },
        { at: 40, type: 'shovelDown', shovel: 'EX3', minutes: 45, reason: 'Burst hydraulic hose on the boom' },
        L.dustFollowUp(48),
        { at: 70, type: 'truckBreakdown', truck: 'HT12', minutes: 35, text: 'HT12 stopped on the Main Pit ramp — engine fault.', radio: L.breakdownRadio('HT12', 'Main Pit ramp') },
        { at: 95, type: 'crusherDown', minutes: 30, reason: 'Oversize boulder bridging the crusher bin' },
        L.fatigue(120, 'HT02'),
        L.fatigueFollowUp(135, 'HT02'),
        L.waterCart(145, 'WC1'),
        L.nearMiss(165, 'HT14', 'the North WRD')
      ]
    },
    {
      id: 'storm',
      name: 'Summer storm & blast',
      durationMin: 180,
      startClockMin: 6 * 60,
      speed: 15,
      summary: 'Clear and fire a blast at EX2, then run the lightning TARP when a thunderstorm reaches the pit — followed by wet roads.',
      briefing: [
        'Drill & blast will fire the EX2 bench in the Main Pit this morning. The shotfirer will issue the blast notice with the firing time.',
        'To clear a blast: tram EX2 to its safe position, withdraw every truck from the exclusion zone, then give the all-clear. Never give the all-clear with equipment inside the zone.',
        'Thunderstorms are forecast for the afternoon. Follow the site lightning TARP.',
        'Plant feed blend 1.3–1.9 g/t Au. Shift targets: TARGET_ORE t ore and TARGET_WASTE t waste (reduced for the blast and weather).'
      ],
      blend,
      targets: { ore: 5700, waste: 11200 },
      fleet: fleet(plan(5, 5, 5, 5)),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Shift started. Blast planned at EX2 this morning; storms forecast later.' },
        { at: 10, type: 'blast', shovel: 'EX2', blastIn: 35, guard: 10, reentry: 20, radius: 280 },
        L.lvCrossing(20, 'LV21 (shotfirer)', 'the explosives magazine road'),
        L.lightningWarning(60),
        L.lightningFollowUp(84),
        { at: 85, type: 'standDown', minutes: 20, reason: 'lightning all-clear given',
          text: 'LIGHTNING TARP: strikes within 5 km of the pit. All mobile equipment parked; operators remain in their cabs until the all-clear.' },
        L.lightningCab(87, 'EX1'),
        L.rain(106),
        L.rainFollowUp(130),
        { at: 120, type: 'fuelLow', truck: 'HT09', minutes: 40, radio: L.fuelRadio('HT09') },
        { at: 145, type: 'shovelDown', shovel: 'EX1', minutes: 25, reason: 'Slew ring fault' },
        L.fatigue(160, 'HT15'),
        L.fatigueFollowUp(172, 'HT15')
      ]
    },
    {
      id: 'night',
      name: 'Night shift — high pressure',
      durationMin: 180,
      startClockMin: 18 * 60,
      speed: 15,
      summary: 'Overlapping critical events at night: a slope radar alarm on the Main Pit west wall, a crusher outage, an unknown vehicle and a damaged windrow.',
      briefing: [
        'HT19 and HT20 are parked at the go-line while their operators finish pre-start. You will be told when they are available.',
        'Remember the geotechnical TARP: withdraw first, investigate second.',
        'Plant feed blend 1.3–1.9 g/t Au. Shift targets: TARGET_ORE t ore and TARGET_WASTE t waste.'
      ],
      blend,
      targets: { ore: 8500, waste: 11800 },
      fleet: fleet(plan(5, 5, 5, 5), ['HT19', 'HT20']),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Night shift started. HT19 and HT20 parked at the go-line awaiting operators.' },
        { at: 10, type: 'available', trucks: ['HT19', 'HT20'], text: 'Operators for HT19 and HT20 have finished pre-start and are ready for assignment.' },
        L.geotech(20, 'EX1'),
        { at: 35, type: 'crusherDown', minutes: 25, reason: 'Crusher lube system alarm' },
        { at: 50, type: 'truckBreakdown', truck: 'HT07', minutes: 30, text: 'HT07 stopped on the Main Pit ramp — electrical fault.', radio: L.breakdownRadio('HT07', 'Main Pit ramp') },
        { at: 70, type: 'fuelLow', truck: 'HT11', minutes: 40, radio: L.fuelRadio('HT11') },
        L.unknownLv(85, 'HT10', 'a light vehicle with no flag or beacon', 'Main Pit ramp'),
        L.fatigue(110, 'HT03'),
        L.fatigueFollowUp(122, 'HT03'),
        { at: 130, type: 'shovelDown', shovel: 'EX4', minutes: 30, reason: 'Bucket tooth lost — searching the muckpile' },
        L.windrow(150, 'East WRD', 'Dozer DZ2')
      ]
    }
  ];

  // Fill target figures into the briefing text.
  for (const sc of scenarios) {
    sc.briefing = sc.briefing.map((b) => b
      .replace('TARGET_ORE', sc.targets.ore.toLocaleString('en-US'))
      .replace('TARGET_WASTE', sc.targets.waste.toLocaleString('en-US')));
  }

  return lib.registerSite({
    id: 'navachab',
    name: 'QKR Navachab Gold Mine',
    operator: 'QKR Namibia Navachab Gold Mine (Pty) Ltd',
    location: 'Karibib, Erongo Region, Namibia',
    status: 'draft',
    statusNote: 'Draft profile: layout, fleet, grades, targets and procedure wording are placeholders pending site confirmation.',
    commodity: { name: 'Gold', gradeUnit: 'g/t Au', gradeDecimals: 2 },
    fleet: { payloadT: 90, truckClass: '~90 t class haul trucks (placeholder)', count: 20 },
    planWeights: { EX1: 5, EX2: 5, EX3: 5, EX4: 5 },
    wasteDumpFor: { EX3: 'NWRD', EX4: 'EWRD' },
    layout,
    scenarios
  });
});
