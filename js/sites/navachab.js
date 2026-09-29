/*
 * QKR Navachab Gold Mine — Karibib, Erongo Region, Namibia.
 *
 * DRAFT PROFILE.
 *
 * Public facts: open-pit gold mine ~10 km from Karibib, cut-off grade of the
 * order of 1.2 g/t, summer thunderstorm season.
 *
 * Confirmed by site staff:
 *  - Loading only in the Main Pit: pushbacks PB3, PB4 and PB5. PB3 and PB4
 *    are near the end of their life and very deep: about a 45 min cycle to any
 *    stockpile or waste dump (~1 load per truck per hour). PB6 is being
 *    prepared for waste stripping and is not released.
 *  - Loading units: EX03 Hitachi EX1900, EX04 Hitachi EX1200, EX05/EX07/EX08
 *    Komatsu PC2000, EX10 Komatsu PC2000 (new, still being assembled in the
 *    workshop) and a Trollope Mining CAT 350 (NEX1400).
 *  - Haul fleet: 20 QKR Komatsu HD785 and 14 Eitavelo Mining CAT 777E,
 *    all dispatched by pit control on shared loading units.
 *  - Ore is tipped on ROM stockpiles at the crusher, one finger per ore type:
 *    MC Blue, MC Red, Lime (highest grades), FW Red, FW Green, Purple DM,
 *    Purple HG, Brown, Orange 1, Orange 2, and the low-grade Yellow, LG Brown
 *    and Purple LG stockpiles further from the crusher. Loaders and Komatsu
 *    HD325/HD465 trucks rehandle ore to the crusher.
 *  - Plants: CIP (main gold extraction), PCP and Argo (mainly recovery).
 *  - Waste goes to TSF Projects (main waste dump). The HME waste dump is
 *    closed — it has reached its limit.
 *  - Two pit controllers per shift: pit area (Channel 1) and rehandle area
 *    (Channel 3). This simulator assesses the PIT-AREA controller.
 *  - No FMS yet (Hexagon FMS being installed, live next year): dispatch is by
 *    radio, so the simulator's dispatch aids are switched off. An in-cab
 *    fatigue monitoring system is in use.
 *
 * Still PLACEHOLDERS: pit geometry, PB5 cycle time, which ore type each unit
 * is loading, targets, shift times, truck callsign prefixes and the wording of
 * procedures (TARPs). See docs/sites/navachab-data-sheet.md.
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

  // ROM pad ore types, highest value first. tier drives map/truck colouring
  // only; routing is by exact ore type. 'far' stockpiles sit away from the crusher.
  const ORE_TYPES = [
    { id: 'MCB', name: 'MC Blue', color: '#3b82f6', tier: 'high' },
    { id: 'MCR', name: 'MC Red', color: '#ef4444', tier: 'high' },
    { id: 'LIME', name: 'Lime', color: '#a3e635', tier: 'high' },
    { id: 'FWR', name: 'FW Red', color: '#f87171', tier: 'high' },
    { id: 'FWG', name: 'FW Green', color: '#22c55e', tier: 'high' },
    { id: 'PHG', name: 'Purple HG', color: '#9333ea', tier: 'mid' },
    { id: 'PDM', name: 'Purple DM', color: '#a855f7', tier: 'mid' },
    { id: 'BRN', name: 'Brown', color: '#a16207', tier: 'mid' },
    { id: 'OR1', name: 'Orange 1', color: '#f97316', tier: 'mid' },
    { id: 'OR2', name: 'Orange 2', color: '#fb923c', tier: 'mid' },
    { id: 'YEL', name: 'Yellow', color: '#eab308', tier: 'low', far: true },
    { id: 'LGB', name: 'LG Brown', color: '#b45309', tier: 'low', far: true },
    { id: 'PLG', name: 'Purple LG', color: '#c084fc', tier: 'low', far: true }
  ];

  // ROM pad layout (schematic): near fingers in two rows beside the crusher,
  // low-grade stockpiles further away to the south-west.
  const nodes = {
    RP: { x: 640, y: 560, label: 'ROM pad' },
    LGA: { x: 350, y: 720, label: 'LG stockpiles' },
    WS: { x: 1650, y: 140, label: 'Mine workshop / fuel bay' },
    TSF: { x: 2700, y: 220, label: 'TSF Projects waste dump' },
    HME: { x: 3150, y: 880, label: 'HME waste dump (closed)' },
    J1: { x: 1050, y: 560 },
    J2: { x: 1650, y: 480 },
    J3: { x: 2350, y: 520 },
    J6: { x: 2900, y: 760 },
    R1: { x: 1350, y: 760, label: 'Main ramp' },
    R2: { x: 1850, y: 1060 },
    R3: { x: 1300, y: 1330 },
    MF: { x: 1500, y: 1620, label: 'PB3 floor' },
    J7: { x: 2250, y: 1180, label: 'PB5 access' },
    W1: { x: 950, y: 1250, label: 'PB4 access' },
    P6: { x: 1050, y: 820, label: 'PB6 (not released)' },
    EX03: { x: 2500, y: 1040 },
    EX08: { x: 2600, y: 1350 },
    EX10: { x: 2380, y: 1470 },
    EX05: { x: 650, y: 1150 },
    EX07: { x: 720, y: 1450 },
    EX04: { x: 1300, y: 1950 },
    NEX1400: { x: 1720, y: 1960 }
  };
  const near = ORE_TYPES.filter((t) => !t.far);
  near.forEach((t, i) => {
    nodes[t.id] = { x: 280 + (i % 4) * 260, y: 170 + Math.floor(i / 4) * 130, label: t.name };
  });
  ORE_TYPES.filter((t) => t.far).forEach((t, i) => {
    nodes[t.id] = { x: 150 + i * 230, y: i === 1 ? 900 : 830, label: t.name };
  });

  const edges = [
    // Road lengths (lengthM) are set so PB3/PB4 cycles are about 45 min.
    ['RP', 'J1', { lengthM: 300 }], ['LGA', 'J1', { lengthM: 1300 }],
    ['J1', 'J2', { lengthM: 800 }], ['J2', 'WS', { lengthM: 400 }], ['J2', 'J3', { lengthM: 700 }],
    ['J3', 'TSF', { lengthM: 1500 }], ['J3', 'J6', { lengthM: 600 }], ['J6', 'HME', { lengthM: 600 }],
    ['J2', 'R1', { lengthM: 300 }],
    ['R1', 'R2', { ramp: true, upFrom: 'R2', lengthM: 1700 }],
    ['R2', 'R3', { ramp: true, upFrom: 'R3', lengthM: 1700 }],
    ['R3', 'MF', { ramp: true, upFrom: 'MF', lengthM: 1700 }],
    ['R2', 'J7', { lengthM: 400 }], ['J7', 'EX03', { lengthM: 250 }], ['J7', 'EX08', { lengthM: 250 }], ['J7', 'EX10', { lengthM: 250 }],
    ['R3', 'W1', { ramp: true, upFrom: 'W1', lengthM: 1400 }], ['W1', 'EX05', { lengthM: 250 }], ['W1', 'EX07', { lengthM: 250 }],
    ['MF', 'EX04', { lengthM: 300 }], ['MF', 'NEX1400', { lengthM: 300 }],
    // PB6 access: drawn but closed to haulage until PB6 is released.
    ['J1', 'P6', { closed: true }]
  ];
  for (const t of ORE_TYPES) edges.push([t.id, t.far ? 'LGA' : 'RP']);

  const layout = {
    width: 3400,
    height: 2300,
    metersPerUnit: 0.6,
    base: 'WS',
    nodes,
    edges,
    // Which ore type / waste each unit is on is a placeholder.
    shovels: [
      { id: 'EX03', name: 'EX03 Hitachi EX1900', material: 'waste', grade: 0, label: 'PB5 waste', loadSec: 120 },
      { id: 'EX04', name: 'EX04 Hitachi EX1200', material: 'ore', oreType: 'MCB', grade: 0, label: 'PB3 ore', loadSec: 170 },
      { id: 'EX05', name: 'EX05 Komatsu PC2000', material: 'ore', oreType: 'FWG', grade: 0, label: 'PB4 ore', loadSec: 130, safePos: { x: 930, y: 1245 } },
      { id: 'EX07', name: 'EX07 Komatsu PC2000', material: 'waste', grade: 0, label: 'PB4 waste', loadSec: 130 },
      { id: 'EX08', name: 'EX08 Komatsu PC2000', material: 'waste', grade: 0, label: 'PB5 waste', loadSec: 130 },
      { id: 'EX10', name: 'EX10 Komatsu PC2000', material: 'waste', grade: 0, label: 'PB5 waste (new unit)', loadSec: 130 },
      { id: 'NEX1400', name: 'NEX1400 CAT 350 (Trollope Mining)', material: 'ore', oreType: 'MCR', grade: 0, label: 'PB3 ore (selective)', loadSec: 330 }
    ],
    dumps: ORE_TYPES.map((t) => ({
      id: t.id, name: t.name + (t.far ? ' stockpile' : ' finger'), short: t.name, role: 'stockpile',
      oreTypes: [t.id], color: t.color, marker: 'finger', bays: 1, dumpSec: 45
    })).concat([
      { id: 'TSF', name: 'TSF Projects waste dump', short: 'TSF', role: 'waste', bays: 4, dumpSec: 40 },
      { id: 'HME', name: 'HME waste dump', short: 'HME (closed)', role: 'waste', bays: 2, dumpSec: 40,
        closed: 'Closed — dumped to its limit' }
    ]),
    pits: [
      { cx: 1600, cy: 1450, rx: 1250, ry: 850, floorShift: 220, label: 'MAIN PIT' }
    ],
    // Map-only annotations.
    features: [
      { x: 20, y: 40, w: 190, h: 90, label: 'CRUSHER' },
      { x: 1180, y: 40, w: 250, h: 80, label: 'CIP / PCP / ARGO' }
    ],
    areas: [
      { x: 820, y: 640, label: 'ROM PAD — rehandle area (Ch 3)' },
      { x: 1500, y: 2090, label: 'PB3 (deep)' },
      { x: 520, y: 1330, label: 'PB4 (deep)' },
      { x: 2760, y: 1200, label: 'PB5' },
      { x: 1230, y: 690, label: 'PB6 — being prepared, not released' }
    ]
  };

  const DUMP_FOR = { EX03: 'TSF', EX04: 'MCB', EX05: 'FWG', EX07: 'TSF', EX08: 'TSF', EX10: 'TSF', NEX1400: 'MCR' };
  // Trucks per loading unit, e.g. plan({ EX03: 7, EX04: 6, ... }).
  const plan = (counts) => Object.keys(counts).map((u) => [u, DUMP_FOR[u], counts[u]]);
  const BALANCED = { EX03: 7, EX04: 6, EX05: 6, EX07: 5, EX08: 7, NEX1400: 3 };

  // Real fleet numbers. The HT/EV prefixes are placeholders so that QKR and
  // Eitavelo trucks with the same number (42-50) can be told apart.
  const QKR = [16, 17, 19, 22, 25, 26, 27, 29, 33, 35, 36, 42, 43, 44, 45, 46, 47, 48, 49, 50].map((n) => 'HT' + n);
  const EITAVELO = [71, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53].map((n) => 'EV' + n);
  const fleet = (counts, parked) => L.mixedFleet([
    { ids: QKR, cls: 'HD785' },
    { ids: EITAVELO, cls: 'CAT777E' }
  ], plan(counts), parked);

  const PIT_CH = 'Channel 1';
  const REHANDLE_CH = 'Channel 3';
  const REHANDLE = 'Rehandle controller (Ch 3)';
  const CONTRACTOR = 'Eitavelo supervisor';
  const EX10_COMMISSIONING = { EX10: 'commissioning' };
  const typeName = (id) => ORE_TYPES.find((t) => t.id === id).name;

  const roleText = 'You are the PIT-AREA controller on ' + PIT_CH + '. The rehandle controller on ' + REHANDLE_CH +
    ' runs the ROM pad, loaders and the HD325/HD465 trucks feeding the crusher. There is no FMS yet: you dispatch by radio.';
  const gradeText = 'Ore goes to the ROM finger for its ore type. At the start of shift EX04 is loading ' + typeName('MCB') +
    ', NEX1400 ' + typeName('MCR') + ' and EX05 ' + typeName('FWG') + '. Grade control will call if a unit moves into a new polygon. Waste goes to TSF Projects; HME is closed.';
  const cycleText = 'PB3 and PB4 are very deep: expect about 45 minutes per cycle, roughly one load per truck per hour. PB5 cycles are shorter.';

  const scenarios = [
    {
      id: 'practice',
      name: 'Practice shift',
      practice: true,
      durationMin: 60,
      startClockMin: 6 * 60,
      speed: 15,
      summary: 'A short warm-up on the Navachab Main Pit. Pause and change speed freely. Feedback on radio calls is shown straight away.',
      briefing: [
        roleText,
        'Mixed fleet of 34 trucks dispatched as one: 20 QKR Komatsu HD785 (HT) and 14 Eitavelo Mining CAT 777E (EV).',
        'Loading in PB3, PB4 and PB5. PB6 is being prepared and is not released. EX10 is still being assembled in the workshop.',
        cycleText,
        gradeText,
        'Practice results are not included in the candidate rankings.'
      ],
      shovelStatus: EX10_COMMISSIONING,
      fleet: fleet(BALANCED),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Practice shift started. Trucks are leaving the go-line.' },
        L.lvCrossing(8, 'LV12 (geology)', 'the PB4 geology bench'),
        { at: 20, type: 'oreChange', shovel: 'EX05', oreType: 'BRN' },
        L.gradeControlCall(20, 'EX05', typeName('BRN'), 'Brown finger'),
        { at: 35, type: 'fuelLow', truck: 'HT25', minutes: 40, radio: L.fuelRadio('HT25') }
      ]
    },
    {
      id: 'day',
      name: 'Day shift — Main Pit',
      durationMin: 180,
      startClockMin: 6 * 60,
      speed: 15,
      summary: 'A handover that starves the ore units, an ore polygon change, EX10 released from commissioning, a rehandle finger closure and routine radio traffic.',
      briefing: [
        roleText,
        'Handover note: night shift left 2 trucks on EX04, 3 on EX05, 2 on NEX1400, 9 on EX03, 9 on EX07 and 9 on EX08. Check whether that suits today\'s ore and waste targets.',
        cycleText,
        'EX10 is expected to be released from commissioning during the shift.',
        gradeText,
        'Shift targets: TARGET_ORE t ore and TARGET_WASTE t waste.'
      ],
      shovelStatus: EX10_COMMISSIONING,
      fleet: fleet({ EX03: 9, EX04: 2, EX05: 3, EX07: 9, EX08: 9, NEX1400: 2 }),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Day shift started. Review the handover allocation.' },
        L.channelDiscipline(10, 'Rehandle HD465 truck', PIT_CH, REHANDLE_CH),
        L.lvCrossing(14, 'LV14 (survey)', 'the PB5 survey control point'),
        L.dust(25, 'haul road to TSF Projects'),
        { at: 30, type: 'fuelLow', truck: 'HT22', minutes: 40, radio: L.fuelRadio('HT22') },
        L.dustFollowUp(48),
        { at: 50, type: 'oreChange', shovel: 'EX05', oreType: 'LGB' },
        L.gradeControlCall(50, 'EX05', typeName('LGB'), 'LG Brown stockpile'),
        L.contractorPriority(58, CONTRACTOR),
        { at: 62, type: 'shovelReady', shovel: 'EX10', minTrucks: 4,
          text: 'EX10 commissioning complete — released to load PB5 waste. Put trucks on it.' },
        { at: 75, type: 'truckBreakdown', truck: 'EV48', minutes: 35, text: 'EV48 (CAT 777E) stopped on the main ramp — engine fault.', radio: L.breakdownRadio('EV48', 'main ramp') },
        { at: 95, type: 'dumpDown', dump: 'MCB', minutes: 25, reason: 'Rehandle loader cleaning up and rebuilding the tip-head windrow' },
        L.rehandleClosure(95, REHANDLE, 'MC Blue finger', 'I\'ll move EX04\'s trucks onto waste units until it reopens'),
        L.closedDumpRequest(108, 'HT29', 'HME dump', 'it has been dumped to its limit', 'TSF Projects'),
        L.fatigue(120, 'HT17'),
        L.fatigueFollowUp(135, 'HT17'),
        L.waterCart(145, 'WC1'),
        L.nearMiss(165, 'EV51', 'TSF Projects')
      ]
    },
    {
      id: 'storm',
      name: 'Summer storm & blast',
      durationMin: 180,
      startClockMin: 6 * 60,
      speed: 15,
      summary: 'Clear and fire a blast at EX05 in PB4, keep trucks out of PB6, then run the lightning TARP when a thunderstorm reaches the pit.',
      briefing: [
        roleText,
        'Drill & blast will fire the PB4 bench at EX05 this morning. To clear a blast: tram EX05 to its safe position, withdraw every truck from the exclusion zone, then give the all-clear.',
        'Thunderstorms are forecast for the afternoon. Follow the site lightning TARP.',
        cycleText,
        gradeText,
        'Shift targets: TARGET_ORE t ore and TARGET_WASTE t waste (reduced for the blast and weather).'
      ],
      shovelStatus: EX10_COMMISSIONING,
      fleet: fleet(BALANCED),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Shift started. Blast planned at EX05 (PB4) this morning; storms forecast later.' },
        { at: 10, type: 'blast', shovel: 'EX05', blastIn: 35, guard: 10, reentry: 20, radius: 260 },
        L.lvCrossing(20, 'LV21 (shotfirer)', 'the explosives magazine road'),
        L.contractorAuthorisation(28, CONTRACTOR, 'EV44', 'main ramp'),
        L.unreleasedArea(40, 'HT33', 'PB6'),
        L.contractorAuthorisationFollowUp(52, 'EV44', 'main ramp'),
        L.lightningWarning(60),
        L.lightningFollowUp(84),
        { at: 85, type: 'standDown', minutes: 20, reason: 'lightning all-clear given',
          text: 'LIGHTNING TARP: strikes within 5 km of the pit. All mobile equipment parked; operators remain in their cabs until the all-clear.' },
        L.lightningCab(87, 'EX03'),
        L.rain(106),
        { at: 115, type: 'fuelLow', truck: 'HT45', minutes: 40, radio: L.fuelRadio('HT45') },
        { at: 125, type: 'oreChange', shovel: 'EX04', oreType: 'LIME' },
        L.gradeControlCall(125, 'EX04', typeName('LIME'), 'Lime finger'),
        L.rainFollowUp(130),
        { at: 145, type: 'shovelDown', shovel: 'NEX1400', minutes: 25, reason: 'Hydraulic hose failure' },
        L.fatigue(160, 'EV49'),
        L.fatigueFollowUp(172, 'EV49')
      ]
    },
    {
      id: 'night',
      name: 'Night shift — high pressure',
      durationMin: 180,
      startClockMin: 18 * 60,
      speed: 15,
      summary: 'Overlapping critical events at night: a slope radar alarm on the PB4 wall, a fatigue monitoring alert, an ore polygon change, loading-unit breakdowns and an unknown vehicle.',
      briefing: [
        roleText,
        'HT49 and HT50 are parked at the go-line while their operators finish pre-start. You will be told when they are available.',
        'EX10 is still being commissioned in the workshop. Remember the geotechnical TARP: withdraw first, investigate second.',
        cycleText,
        gradeText,
        'Shift targets: TARGET_ORE t ore and TARGET_WASTE t waste.'
      ],
      shovelStatus: EX10_COMMISSIONING,
      fleet: fleet(BALANCED, ['HT49', 'HT50']),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Night shift started. HT49 and HT50 parked at the go-line awaiting operators.' },
        { at: 10, type: 'available', trucks: ['HT49', 'HT50'], text: 'Operators for HT49 and HT50 have finished pre-start and are ready for assignment.' },
        L.geotech(20, 'EX07'),
        { at: 35, type: 'shovelDown', shovel: 'EX08', minutes: 25, reason: 'Hydraulic pump fault' },
        { at: 50, type: 'truckBreakdown', truck: 'HT26', minutes: 30, text: 'HT26 stopped on the main ramp — electrical fault.', radio: L.breakdownRadio('HT26', 'main ramp') },
        { at: 60, type: 'oreChange', shovel: 'NEX1400', oreType: 'PHG' },
        L.gradeControlCall(60, 'NEX1400', typeName('PHG'), 'Purple HG finger'),
        { at: 70, type: 'fuelLow', truck: 'HT36', minutes: 40, radio: L.fuelRadio('HT36') },
        L.unknownLv(85, 'HT42', 'a light vehicle with no flag or beacon', 'main ramp'),
        L.fatigueAlarm(110, 'EV45'),
        L.fatigueFollowUp(122, 'EV45'),
        { at: 130, type: 'shovelDown', shovel: 'EX03', minutes: 30, reason: 'Bucket tooth lost — searching the muckpile' },
        L.windrow(150, 'TSF Projects', 'Dozer DZ2')
      ]
    }
  ];

  // Shift targets, calibrated against the reference (expert) controller.
  const TARGETS = {
    practice: { ore: 800, waste: 1900 },
    day: { ore: 3200, waste: 7800 },
    storm: { ore: 2500, waste: 7400 },
    night: { ore: 4800, waste: 7600 }
  };
  for (const sc of scenarios) {
    sc.targets = TARGETS[sc.id];
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
    statusNote: 'Draft profile: fleet, loading units, pushbacks, cycle times, ROM fingers, waste dumps and radio channels confirmed; pit geometry, unit ore assignments, targets and procedure wording are placeholders pending site confirmation.',
    commodity: { name: 'Gold', gradeUnit: 'g/t Au', gradeDecimals: 2 },
    // Ore is tipped on ROM fingers by ore type; a separate rehandle
    // controller feeds the crusher.
    gradeControl: 'stockpiles',
    oreTypes: ORE_TYPES,
    // No FMS yet: no wrong-destination warnings or auto-filled dumps.
    dispatchAids: false,
    fleet: {
      count: 34,
      // Payloads are manufacturer nominal ratings; confirm actual target payloads.
      classes: {
        HD785: { name: 'Komatsu HD785', payloadT: 91, owner: 'QKR Navachab', tag: 'QKR' },
        CAT777E: { name: 'CAT 777E', payloadT: 91, owner: 'Eitavelo Mining (contractor)', tag: 'Eitavelo' }
      }
    },
    // Long cycles make the fleet truck-limited: loading units are expected to
    // wait for trucks, so utilisation is judged on a lower scale.
    utilisationRange: [0.1, 0.35],
    planWeights: { EX03: 7, EX04: 6, EX05: 6, EX07: 5, EX08: 7, EX10: 4, NEX1400: 3 },
    oreDumpFor: { EX04: 'MCB', EX05: 'FWG', NEX1400: 'MCR' },
    wasteDumpFor: { EX03: 'TSF', EX07: 'TSF', EX08: 'TSF', EX10: 'TSF' },
    radio: { pit: PIT_CH, rehandle: REHANDLE_CH },
    layout,
    scenarios
  });
});
