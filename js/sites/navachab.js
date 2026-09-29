/*
 * QKR Navachab Gold Mine — Karibib, Erongo Region, Namibia.
 *
 * DRAFT PROFILE. Public facts used: open-pit gold mine ~10 km from Karibib,
 * CIP/CIL processing plant, cut-off grade of the order of 1.2 g/t, Main
 * (central) pit plus the Anomaly 16 satellite pit, summer thunderstorm season.
 *
 * Confirmed by site staff: haul fleet of 20 Komatsu HD785 (QKR) plus 14 CAT
 * 777E (Eitavelo Mining, contractor). Pit control dispatches all 34 trucks,
 * and both fleets work the same pits and loading units.
 *
 * Everything else — pit geometry, haul road network, loading units, truck
 * numbering, grades per face, targets, shift times and the wording of
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
      EX4: { x: 3020, y: 1950 },
      EX5: { x: 1280, y: 1990 },
      EX6: { x: 2760, y: 1900 }
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
      ['MF', 'J4'], ['J4', 'EX1'], ['MF', 'J5'], ['J5', 'EX2'], ['R2', 'EX3'],
      ['MF', 'EX5'], ['A2', 'EX6']
    ],
    shovels: [
      { id: 'EX1', name: 'Excavator EX1', material: 'ore', grade: 2.6, label: 'Main Pit high-grade ore', loadSec: 120 },
      { id: 'EX2', name: 'Excavator EX2', material: 'ore', grade: 0.9, label: 'Main Pit low-grade ore', loadSec: 120, safePos: { x: 1790, y: 1740 } },
      { id: 'EX3', name: 'Excavator EX3', material: 'waste', grade: 0, label: 'Main Pit waste (upper benches)', loadSec: 105 },
      { id: 'EX4', name: 'Excavator EX4', material: 'waste', grade: 0, label: 'Anomaly 16 waste pre-strip', loadSec: 105 },
      { id: 'EX5', name: 'Excavator EX5', material: 'waste', grade: 0, label: 'Main Pit waste (lower benches)', loadSec: 105 },
      { id: 'EX6', name: 'Excavator EX6', material: 'waste', grade: 0, label: 'Anomaly 16 waste (east)', loadSec: 105 }
    ],
    dumps: [
      { id: 'CR', name: 'Primary Crusher', short: 'Crusher', role: 'crusher', bays: 1, dumpSec: 50 },
      { id: 'LGS', name: 'LG / ROM Stockpile', short: 'LG stockpile', role: 'stockpile', bays: 2, dumpSec: 40 },
      { id: 'NWRD', name: 'North Waste Rock Dump', short: 'North WRD', role: 'waste', bays: 3, dumpSec: 40 },
      { id: 'EWRD', name: 'East Waste Rock Dump', short: 'East WRD', role: 'waste', bays: 3, dumpSec: 40 }
    ],
    pits: [
      { cx: 1560, cy: 1500, rx: 1020, ry: 820, floorShift: 220, label: 'MAIN PIT' },
      { cx: 2960, cy: 1720, rx: 300, ry: 430, floorShift: 120, label: 'ANOMALY 16' }
    ]
  };

  // Trucks per loading unit, EX1..EX6 (34 in total).
  const plan = (ex1, ex2, ex3, ex4, ex5, ex6) => [
    ['EX1', 'CR', ex1], ['EX2', 'CR', ex2], ['EX3', 'NWRD', ex3],
    ['EX4', 'EWRD', ex4], ['EX5', 'NWRD', ex5], ['EX6', 'EWRD', ex6]
  ];
  // QKR and Eitavelo trucks are mixed across the loading units.
  // Truck numbering (HT01-HT20, EV01-EV14) is a placeholder.
  const fleet = (p, parked) => L.mixedFleet([
    { prefix: 'HT', cls: 'HD785', count: 20 },
    { prefix: 'EV', cls: 'CAT777E', count: 14 }
  ], p, parked);
  const balanced = () => plan(6, 6, 6, 5, 6, 5);
  const CONTRACTOR = 'Eitavelo supervisor';
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
        'Mixed fleet of 34 trucks dispatched as one: 20 QKR Komatsu HD785 (HT) and 14 Eitavelo Mining CAT 777E (EV).',
        'Six loading units: EX1 (Main Pit high-grade ore), EX2 (Main Pit low-grade ore), EX3 and EX5 (Main Pit waste), EX4 and EX6 (Anomaly 16 waste).',
        'Ore goes to the primary crusher, or the LG/ROM stockpile if the crusher is down. Waste goes to the North or East waste rock dump.',
        'Practice results are not included in the candidate rankings.'
      ],
      blend,
      targets: { ore: 3100, waste: 5900 },
      fleet: fleet(balanced()),
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
        'Handover note: night shift left 4 trucks on EX1 (high-grade), 9 on EX2 (low-grade), 6 on EX3, 5 on EX4, 5 on EX5 and 5 on EX6. Check whether that suits the plant feed blend and the loading units.',
        'You dispatch the whole mixed fleet: 20 QKR Komatsu HD785 (HT) and 14 Eitavelo CAT 777E (EV).',
        blendText,
        'Shift targets: TARGET_ORE t ore and TARGET_WASTE t waste.'
      ],
      blend,
      targets: { ore: 10200, waste: 22800 },
      fleet: fleet(plan(4, 9, 6, 5, 5, 5)),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Day shift started. Review the handover allocation.' },
        L.lvCrossing(12, 'LV14 (survey)', 'the Anomaly 16 survey control point'),
        L.dust(25, 'main haul road to the North WRD'),
        { at: 30, type: 'fuelLow', truck: 'HT06', minutes: 40, radio: L.fuelRadio('HT06') },
        { at: 40, type: 'shovelDown', shovel: 'EX3', minutes: 45, reason: 'Burst hydraulic hose on the boom' },
        L.dustFollowUp(48),
        L.contractorPriority(55, CONTRACTOR),
        { at: 70, type: 'truckBreakdown', truck: 'EV08', minutes: 35, text: 'EV08 (CAT 777E) stopped on the Main Pit ramp — engine fault.', radio: L.breakdownRadio('EV08', 'Main Pit ramp') },
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
      targets: { ore: 6400, waste: 21600 },
      fleet: fleet(balanced()),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Shift started. Blast planned at EX2 this morning; storms forecast later.' },
        { at: 10, type: 'blast', shovel: 'EX2', blastIn: 35, guard: 10, reentry: 20, radius: 280 },
        L.lvCrossing(20, 'LV21 (shotfirer)', 'the explosives magazine road'),
        L.contractorAuthorisation(28, CONTRACTOR, 'EV11', 'Anomaly 16 ramp'),
        L.contractorAuthorisationFollowUp(52, 'EV11', 'Anomaly 16 ramp'),
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
      targets: { ore: 9800, waste: 24400 },
      fleet: fleet(balanced(), ['HT19', 'HT20']),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Night shift started. HT19 and HT20 parked at the go-line awaiting operators.' },
        { at: 10, type: 'available', trucks: ['HT19', 'HT20'], text: 'Operators for HT19 and HT20 have finished pre-start and are ready for assignment.' },
        L.geotech(20, 'EX1'),
        { at: 35, type: 'crusherDown', minutes: 25, reason: 'Crusher lube system alarm' },
        { at: 50, type: 'truckBreakdown', truck: 'HT07', minutes: 30, text: 'HT07 stopped on the Main Pit ramp — electrical fault.', radio: L.breakdownRadio('HT07', 'Main Pit ramp') },
        { at: 70, type: 'fuelLow', truck: 'HT11', minutes: 40, radio: L.fuelRadio('HT11') },
        L.unknownLv(85, 'HT10', 'a light vehicle with no flag or beacon', 'Main Pit ramp'),
        L.fatigue(110, 'EV05'),
        L.fatigueFollowUp(122, 'EV05'),
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
    statusNote: 'Draft profile: truck fleet confirmed; layout, loading units, grades, targets and procedure wording are placeholders pending site confirmation.',
    commodity: { name: 'Gold', gradeUnit: 'g/t Au', gradeDecimals: 2 },
    fleet: {
      count: 34,
      // Payloads are manufacturer nominal ratings; confirm actual target payloads.
      classes: {
        HD785: { name: 'Komatsu HD785', payloadT: 91, owner: 'QKR Navachab', tag: 'QKR' },
        CAT777E: { name: 'CAT 777E', payloadT: 91, owner: 'Eitavelo Mining (contractor)', tag: 'Eitavelo' }
      }
    },
    planWeights: { EX1: 6, EX2: 6, EX3: 6, EX4: 5, EX5: 6, EX6: 5 },
    wasteDumpFor: { EX3: 'NWRD', EX4: 'EWRD', EX5: 'NWRD', EX6: 'EWRD' },
    layout,
    scenarios
  });
});
