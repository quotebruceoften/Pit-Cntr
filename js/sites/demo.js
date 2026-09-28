/*
 * Demo site: a fictional copper mine. Used for demonstrations and as the
 * reference example of a site profile. See docs/SITE_PROFILES.md.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../sim/library.js'));
  } else {
    factory(root.PitSim);
  }
})(typeof self !== 'undefined' ? self : this, function (lib) {
  'use strict';

  const { fleet, lvCrossing, fatigue, fatigueFollowUp, breakdownRadio, fuelRadio, rain, rainFollowUp,
    geotech, nearMiss, windrow, unknownLv, waterCart } = lib.scenarioLib;

  const layout = {
    width: 3200,
    height: 2200,
    metersPerUnit: 0.7,
    base: 'WS',
    nodes: {
      CR: { x: 380, y: 300, label: 'Crusher' },
      ROM: { x: 700, y: 160, label: 'ROM Pad' },
      WD: { x: 2820, y: 330, label: 'Waste Dump' },
      WS: { x: 1600, y: 150, label: 'Workshop / Fuel / Go-line' },
      J1: { x: 820, y: 480 },
      J3: { x: 1600, y: 470 },
      J2: { x: 2300, y: 500 },
      RT: { x: 1450, y: 760, label: 'Ramp top' },
      RM: { x: 1950, y: 1080 },
      RB: { x: 1400, y: 1420, label: 'Pit floor' },
      J4: { x: 900, y: 1600 },
      J5: { x: 2100, y: 1640 },
      S1: { x: 560, y: 1860 },
      S2: { x: 2520, y: 1900 },
      S3: { x: 1480, y: 1950 }
    },
    edges: [
      ['CR', 'J1'], ['ROM', 'J1'], ['J1', 'J3'], ['J3', 'WS'], ['J3', 'J2'], ['J2', 'WD'], ['J3', 'RT'],
      ['RT', 'RM', { ramp: true, upFrom: 'RM' }],
      ['RM', 'RB', { ramp: true, upFrom: 'RB' }],
      ['RB', 'J4'], ['J4', 'S1'], ['RB', 'J5'], ['J5', 'S2'], ['RB', 'S3']
    ],
    shovels: [
      { id: 'S1', name: 'Shovel S1', material: 'ore', grade: 2.1, label: 'High-grade ore', loadSec: 150 },
      { id: 'S2', name: 'Shovel S2', material: 'ore', grade: 0.8, label: 'Low-grade ore', loadSec: 150, safePos: { x: 2150, y: 1700 } },
      { id: 'S3', name: 'Excavator S3', material: 'waste', grade: 0, label: 'Waste', loadSec: 120 }
    ],
    dumps: [
      { id: 'CR', name: 'Primary Crusher', short: 'Crusher', role: 'crusher', bays: 1, dumpSec: 60 },
      { id: 'ROM', name: 'ROM Stockpile', short: 'ROM', role: 'stockpile', bays: 2, dumpSec: 45 },
      { id: 'WD', name: 'Waste Dump', short: 'Waste', role: 'waste', bays: 3, dumpSec: 45 }
    ],
    pits: [{ cx: 1550, cy: 1520, rx: 1380, ry: 880, floorShift: 260 }]
  };

  const scenarios = [
    {
      id: 'practice',
      name: 'Practice shift',
      practice: true,
      durationMin: 60,
      startClockMin: 6 * 60,
      speed: 15,
      summary: 'A short, untimed warm-up. Pause and change speed freely. Feedback on radio calls is shown straight away.',
      briefing: [
        'The fleet has been allocated sensibly by the previous shift: 5 trucks on S1 (high-grade ore), 5 on S2 (low-grade ore) and 6 on S3 (waste).',
        'Try reassigning a truck, answering a radio call and handling a shovel breakdown.',
        'Practice results are not included in the candidate rankings.'
      ],
      blend: { min: 1.2, max: 1.6 },
      targets: { ore: 5500, waste: 2200 },
      fleet: fleet([['S1', 'CR', 5], ['S2', 'CR', 5], ['S3', 'WD', 6]]),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Practice shift started. Trucks are leaving the go-line.' },
        lvCrossing(8, 'LV12 (geology ute)', 'the geology bench'),
        { at: 20, type: 'shovelDown', shovel: 'S3', minutes: 15, reason: 'Track tension fault' },
        { at: 35, type: 'fuelLow', truck: 'T03', minutes: 40, radio: fuelRadio('T03') }
      ]
    },
    {
      id: 'day',
      name: 'Day shift — routine operations',
      durationMin: 180,
      startClockMin: 6 * 60,
      speed: 15,
      summary: 'A normal day shift with a poor handover allocation, equipment breakdowns, a crusher outage and routine radio traffic.',
      briefing: [
        'Handover note: night shift left 3 trucks on S1 (high-grade), 7 on S2 (low-grade) and 6 on S3 (waste). Check whether that suits the crusher blend and the loading units.',
        'Crusher feed blend must stay between 1.2% and 1.6% Cu (rolling average of the last 6 loads).',
        'Shift targets: 21,000 t ore mined and 10,000 t waste.'
      ],
      blend: { min: 1.2, max: 1.6 },
      targets: { ore: 21000, waste: 10000 },
      fleet: fleet([['S1', 'CR', 3], ['S2', 'CR', 7], ['S3', 'WD', 6]]),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Day shift started. Review the handover allocation.' },
        lvCrossing(12, 'LV07 (survey ute)', 'the survey control point'),
        { at: 25, type: 'fuelLow', truck: 'T06', minutes: 40, radio: fuelRadio('T06') },
        { at: 40, type: 'shovelDown', shovel: 'S3', minutes: 45, reason: 'Burst hydraulic hose on the boom' },
        { at: 70, type: 'truckBreakdown', truck: 'T12', minutes: 35, text: 'T12 stopped on the ramp — engine fault.', radio: breakdownRadio('T12', 'main ramp') },
        { at: 95, type: 'crusherDown', minutes: 30, reason: 'Oversize rock blocking the chute' },
        fatigue(120, 'T02'),
        fatigueFollowUp(135, 'T02'),
        waterCart(145),
        nearMiss(165, 'T14')
      ]
    },
    {
      id: 'blast',
      name: 'Blast day',
      durationMin: 180,
      startClockMin: 6 * 60,
      speed: 15,
      summary: 'A planned blast at S2 must be cleared safely while rain, breakdowns and fatigue compete for attention.',
      briefing: [
        'Drill & blast plan to fire the S2 bench this morning. The shotfirer will issue the blast notice with the firing time.',
        'To clear a blast: tram S2 to its safe position, withdraw every truck from the exclusion zone, then give the all-clear. Never give the all-clear with equipment inside the zone.',
        'Blend 1.2–1.6% Cu. Shift targets: 13,000 t ore and 13,000 t waste (reduced for the blast).'
      ],
      blend: { min: 1.2, max: 1.6 },
      targets: { ore: 13000, waste: 13000 },
      fleet: fleet([['S1', 'CR', 5], ['S2', 'CR', 5], ['S3', 'WD', 6]]),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Blast day shift started. Expect the blast notice from the shotfirer.' },
        { at: 20, type: 'blast', shovel: 'S2', blastIn: 40, guard: 10, reentry: 20, radius: 330 },
        lvCrossing(30, 'LV21 (shotfirer)', 'the magazine access road'),
        rain(45),
        rainFollowUp(70),
        { at: 100, type: 'fuelLow', truck: 'T09', minutes: 40, radio: fuelRadio('T09') },
        { at: 115, type: 'truckBreakdown', truck: 'T04', minutes: 30, text: 'T04 stopped on the pit floor — engine fault.', radio: breakdownRadio('T04', 'pit floor road') },
        { at: 140, type: 'shovelDown', shovel: 'S1', minutes: 25, reason: 'Hoist rope inspection fault' },
        fatigue(160, 'T15'),
        fatigueFollowUp(172, 'T15')
      ]
    },
    {
      id: 'night',
      name: 'Night shift — high pressure',
      durationMin: 180,
      startClockMin: 18 * 60,
      speed: 15,
      summary: 'Overlapping critical events: a slope-stability alarm, a crusher outage, an unknown vehicle and more.',
      briefing: [
        'Two operators (T15, T16) are delayed at the pre-start meeting; their trucks are parked at the go-line. You will be told when they are available.',
        'Remember the site trigger action response plan (TARP) for geotechnical alarms: withdraw first, investigate second.',
        'Blend 1.2–1.6% Cu. Shift targets: 18,000 t ore and 11,000 t waste.'
      ],
      blend: { min: 1.2, max: 1.6 },
      targets: { ore: 18000, waste: 11000 },
      fleet: fleet([['S1', 'CR', 5], ['S2', 'CR', 5], ['S3', 'WD', 6]], ['T15', 'T16']),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Night shift started. T15 and T16 parked at the go-line awaiting operators.' },
        { at: 10, type: 'available', trucks: ['T15', 'T16'], text: 'Operators for T15 and T16 have finished pre-start and are ready for assignment.' },
        geotech(20, 'S1'),
        { at: 35, type: 'crusherDown', minutes: 25, reason: 'Crusher lube system alarm' },
        { at: 50, type: 'truckBreakdown', truck: 'T07', minutes: 30, text: 'T07 stopped on the ramp — electrical fault.', radio: breakdownRadio('T07', 'main ramp') },
        { at: 70, type: 'fuelLow', truck: 'T11', minutes: 40, radio: fuelRadio('T11') },
        unknownLv(85),
        fatigue(110, 'T03'),
        fatigueFollowUp(122, 'T03'),
        { at: 130, type: 'shovelDown', shovel: 'S3', minutes: 30, reason: 'Bucket tooth lost — searching the muckpile' },
        windrow(150)
      ]
    }
  ];


  return lib.registerSite({
    id: 'demo',
    name: 'Demo Copper Mine',
    operator: 'Fictional demonstration site',
    location: 'Anywhere',
    status: 'demo',
    commodity: { name: 'Copper', gradeUnit: '% Cu', gradeDecimals: 2 },
    fleet: { payloadT: 220, truckClass: '220 t class haul trucks', count: 16 },
    // Balanced allocation used by the reference (expert) controller in tests.
    planWeights: { S1: 5, S2: 5, S3: 6 },
    layout,
    scenarios
  });
});
