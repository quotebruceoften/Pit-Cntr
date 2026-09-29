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
 *    workshop) and a Trollope Mining CAT 6015B hydraulic shovel (NEX14002).
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
    NEX14002: { x: 1720, y: 1960 }
  };
  const near = ORE_TYPES.filter((t) => !t.far);
  near.forEach((t, i) => {
    nodes[t.id] = { x: 280 + (i % 4) * 260, y: 170 + Math.floor(i / 4) * 130, label: t.name };
  });
  ORE_TYPES.filter((t) => t.far).forEach((t, i) => {
    nodes[t.id] = { x: 150 + i * 230, y: i === 1 ? 900 : 830, label: t.name };
  });

  const edges = [
    // Road lengths (lengthM): PB5 to TSF Projects is 4.6 km (confirmed) with a
    // 26 min cycle. PB3/PB4 distances are scaled from it at the same average
    // speed (same ~57% ramp share): a 45 min cycle gives ~8.4-8.6 km one way.
    // Haul ramps are ~10% (pit walls 20-30°, not modelled), so ~4.8 km of ramp
    // puts PB3/PB4 about 480 m below the ramp top and PB5 (2.6 km) about 265 m.
    ['RP', 'J1', { lengthM: 300 }], ['LGA', 'J1', { lengthM: 1300 }],
    ['J1', 'J2', { lengthM: 800 }], ['J2', 'WS', { lengthM: 400 }], ['J2', 'J3', { lengthM: 500 }],
    ['J3', 'TSF', { lengthM: 1010 }], ['J3', 'J6', { lengthM: 600 }], ['J6', 'HME', { lengthM: 600 }],
    ['J2', 'R1', { lengthM: 300 }],
    ['R1', 'R2', { ramp: true, upFrom: 'R2', lengthM: 2000 }],
    ['R2', 'R3', { ramp: true, upFrom: 'R3', lengthM: 1400 }],
    ['R3', 'MF', { ramp: true, upFrom: 'MF', lengthM: 1400 }],
    // PB5 bench ramp; PB5 face to TSF Projects is 4.6 km (confirmed).
    ['R2', 'J7', { ramp: true, upFrom: 'J7', lengthM: 640 }],
    ['J7', 'EX03', { lengthM: 150 }], ['J7', 'EX08', { lengthM: 150 }], ['J7', 'EX10', { lengthM: 150 }],
    ['R3', 'W1', { ramp: true, upFrom: 'W1', lengthM: 1400 }], ['W1', 'EX05', { lengthM: 2000 }], ['W1', 'EX07', { lengthM: 2000 }],
    ['MF', 'EX04', { lengthM: 2000 }], ['MF', 'NEX14002', { lengthM: 2000 }],
    // PB6 access: drawn but closed to haulage until PB6 is released.
    ['J1', 'P6', { closed: true }]
  ];
  for (const t of ORE_TYPES) edges.push([t.id, t.far ? 'LGA' : 'RP']);

  const layout = {
    width: 3400,
    height: 2300,
    metersPerUnit: 0.6,
    base: 'WS',
    // Trucks are governed at 40 km/h (11.1 m/s) and 30 km/h (8.3 m/s) down ramps.
    speeds: { emptyFlat: 11.1, loadedFlat: 10, emptyDownRamp: 8.3, loadedDownRamp: 8.3, emptyUpRamp: 8, loadedUpRamp: 4 },
    nodes,
    edges,
    // Labels are pushbacks; what each unit loads (ore type or waste) is its
    // face, set per scenario and changed by grade control during the shift.
    shovels: [
      { id: 'EX03', name: 'EX03 Hitachi EX1900', material: 'waste', grade: 0, label: 'PB5', loadSec: 120, targetPerHour: 14 },
      { id: 'EX04', name: 'EX04 Hitachi EX1200', material: 'ore', oreType: 'MCB', grade: 0, label: 'PB3', loadSec: 170, targetPerHour: 10 },
      { id: 'EX05', name: 'EX05 Komatsu PC2000', material: 'ore', oreType: 'FWG', grade: 0, label: 'PB4', loadSec: 130, targetPerHour: 14, safePos: { x: 930, y: 1245 } },
      { id: 'EX07', name: 'EX07 Komatsu PC2000', material: 'waste', grade: 0, label: 'PB4', loadSec: 130, targetPerHour: 14 },
      { id: 'EX08', name: 'EX08 Komatsu PC2000', material: 'waste', grade: 0, label: 'PB5', loadSec: 130, targetPerHour: 14 },
      { id: 'EX10', name: 'EX10 Komatsu PC2000', material: 'waste', grade: 0, label: 'PB5 (new unit)', loadSec: 130, targetPerHour: 14 },
      // CAT 6015B (~8 m³ bucket): about 4-5 passes per 91 t truck.
      { id: 'NEX14002', name: 'NEX14002 CAT 6015B (Trollope Mining)', material: 'ore', oreType: 'MCR', grade: 0, label: 'PB3', loadSec: 150, targetPerHour: 10 }
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

  // Where each face tips: an ore type goes to its own finger (finger id =
  // ore type id); waste goes to TSF Projects.
  const dumpForFace = (face) => face === 'waste' ? 'TSF' : face;
  // Units not given a face by the scenario stay on waste.
  const WASTE_UNITS = { EX03: 'waste', EX07: 'waste', EX08: 'waste', EX10: 'waste' };
  // Trucks per loading unit, e.g. plan({ EX04: 8, EX05: 11, EX08: 7 }, faces).
  const plan = (counts, faces) => Object.keys(counts).map((u) => [u, dumpForFace(Object.assign({}, WASTE_UNITS, faces)[u]), counts[u]]);

  // Radio callsigns: N + number for QKR (Navachab) trucks, E + number for
  // Eitavelo trucks, e.g. N45 and E43.
  const QKR = [16, 17, 19, 22, 25, 26, 27, 29, 33, 35, 36, 42, 43, 44, 45, 46, 47, 48, 49, 50].map((n) => 'N' + n);
  const EITAVELO = [71, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53].map((n) => 'E' + n);

  // Not every truck is available: these are out for the whole shift
  // (placeholder list — the real one changes every shift).
  const UNAVAILABLE = {
    N19: 'In workshop — planned service', N27: 'In workshop — tyre change', N35: 'No operator', N43: 'No operator',
    E42: 'In workshop — brakes', E47: 'No operator', E50: 'In workshop — engine', E53: 'No operator'
  };

  // Build the fleet: interleave QKR and Eitavelo trucks, allocate the
  // available ones to the plan, and park the unavailable ones.
  const fleet = (counts, faces, parked) => {
    const all = L.mixedFleet([
      { ids: QKR, cls: 'HD785' },
      { ids: EITAVELO, cls: 'CAT777E' }
    ], [['PARK', 'TSF', QKR.length + EITAVELO.length]]);
    const avail = all.filter((t) => !UNAVAILABLE[t.id]);
    let n = 0;
    for (const [unit, dump, count] of plan(counts, faces)) {
      for (let i = 0; i < count; i++) Object.assign(avail[n++], { shovel: unit, dump });
    }
    if (n !== avail.length) throw new Error('Navachab plan allocates ' + n + ' trucks but ' + avail.length + ' are available');
    for (const id of parked || []) all.find((t) => t.id === id).shovel = 'PARK';
    return all;
  };

  const PIT_CH = 'Channel 1';
  const REHANDLE_CH = 'Channel 3';
  const REHANDLE = 'Rehandle controller (Ch 3)';
  const CONTRACTOR = 'Eitavelo supervisor';
  const EX10_COMMISSIONING = { EX10: 'commissioning' };
  const typeName = (id) => id === 'waste' ? 'waste' : ORE_TYPES.find((t) => t.id === id).name;
  const destName = (face) => face === 'waste' ? 'TSF Projects'
    : 'the ' + typeName(face) + (ORE_TYPES.find((t) => t.id === face).far ? ' stockpile' : ' finger');

  // A grade control change: the unit moves to a new face (an ore type or
  // waste) and the geologist calls it in. Returns the event and radio call.
  const faceChange = (at, unit, face) => [
    { at, type: 'faceChange', shovel: unit, oreType: face },
    L.gradeControlCall(at, unit, typeName(face), destName(face))
  ];
  // A poorly fragmented block at a unit: slower digging plus the operator's call.
  const poorFragmentation = (at, unit, minutes) => [
    { at, type: 'fragmentation', shovel: unit, factor: 1.7, minutes },
    L.fragmentationCall(at, unit)
  ];

  const roleText = 'You are the PIT-AREA controller on ' + PIT_CH + '. The rehandle controller on ' + REHANDLE_CH +
    ' runs the ROM pad, loaders and the HD325/HD465 trucks feeding the crusher. There is no FMS yet: you dispatch by radio.';
  const fleetText = 'Mixed fleet: 20 QKR Komatsu HD785 (N16 … N50, 90–100 t) and 14 Eitavelo Mining CAT 777E (E41 … E71, 80–90 t), dispatched as one. ' +
    '8 trucks are out today (workshop or no operator), leaving 26.';
  const runText = (running) => 'Because of the truck shortage only 3 loading units run at a time — today ' + running.join(', ') +
    '. The others are parked and can be started (about 10 min pre-start) if a running unit is lost. Hourly targets: PC2000 14 loads/h; EX04 and NEX14002 10 loads/h.';
  const facesText = (faces) => 'Faces at the start of shift: ' +
    Object.keys(faces).map((u) => u + ' ' + typeName(faces[u])).join(', ') +
    '; the other units are on waste. Faces change during the shift: grade control calls each change, and a unit can move between ore types and waste.';
  const routingText = 'Ore goes to the ROM finger for its ore type; waste goes to TSF Projects. HME is closed.';
  const cycleText = 'PB3 and PB4 are very deep: about 45 minutes per cycle. PB5 is 4.6 km from TSF Projects, about 26 minutes per cycle. Trucks are governed at 40 km/h, and 30 km/h down ramps.';
  const blastText = 'Drill & blast is its own department. Recent blasts have been poorly fragmented, which slows digging — expect it.';

  // Starting faces differ from day to day.
  const FACES = {
    practice: { EX04: 'MCB', EX05: 'FWG', NEX14002: 'MCR' },
    day: { EX04: 'MCB', EX05: 'FWG', NEX14002: 'MCR' },
    storm: { EX04: 'LIME', EX05: 'PHG', NEX14002: 'FWR' },
    night: { EX04: 'BRN', EX05: 'YEL', NEX14002: 'MCB' }
  };
  const RUNNING = {
    practice: ['EX04', 'EX05', 'EX08'],
    day: ['EX04', 'EX05', 'EX08'],
    storm: ['EX04', 'EX05', 'EX03'],
    night: ['EX04', 'NEX14002', 'EX07']
  };

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
        fleetText,
        runText(RUNNING.practice),
        'Loading in PB3, PB4 and PB5. PB6 is being prepared and is not released. EX10 is still being assembled in the workshop.',
        cycleText,
        facesText(FACES.practice),
        routingText,
        'Practice results are not included in the candidate rankings.'
      ],
      shovelStatus: EX10_COMMISSIONING,
      running: RUNNING.practice,
      unavailable: UNAVAILABLE,
      faces: FACES.practice,
      fleet: fleet({ EX04: 8, EX05: 11, EX08: 7 }, FACES.practice),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Practice shift started. Trucks are leaving the go-line.' },
        L.lvCrossing(8, 'LV12 (geology)', 'the PB4 geology bench'),
        ...faceChange(20, 'EX05', 'BRN'),
        ...poorFragmentation(30, 'EX04', 20),
        { at: 35, type: 'fuelLow', truck: 'N25', minutes: 40, radio: L.fuelRadio('N25') }
      ]
    },
    {
      id: 'day',
      name: 'Day shift — Main Pit',
      durationMin: 180,
      startClockMin: 6 * 60,
      speed: 15,
      summary: 'A handover that starves the ore units, a breakdown that needs a parked unit started, poor fragmentation, three face changes and a rehandle finger closure.',
      briefing: [
        roleText,
        fleetText,
        runText(RUNNING.day),
        'Handover note: night shift left 4 trucks on EX04, 5 on EX05 and 17 on EX08. Check whether that suits the hourly targets and today\'s ore and waste targets.',
        cycleText,
        blastText,
        'EX10 is still being commissioned in the workshop.',
        facesText(FACES.day),
        routingText,
        'Shift targets: TARGET_ORE t ore and TARGET_WASTE t waste.'
      ],
      shovelStatus: EX10_COMMISSIONING,
      running: RUNNING.day,
      unavailable: UNAVAILABLE,
      faces: FACES.day,
      fleet: fleet({ EX04: 4, EX05: 5, EX08: 17 }, FACES.day),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Day shift started. Review the handover allocation.' },
        L.channelDiscipline(10, 'Rehandle HD465 truck', PIT_CH, REHANDLE_CH),
        L.lvCrossing(14, 'LV14 (survey)', 'the PB5 survey control point'),
        L.dust(25, 'haul road to TSF Projects'),
        { at: 30, type: 'fuelLow', truck: 'N22', minutes: 40, radio: L.fuelRadio('N22') },
        { at: 40, type: 'shovelDown', shovel: 'EX08', minutes: 50, reason: 'Burst hydraulic hose on the boom' },
        L.dustFollowUp(48),
        ...faceChange(50, 'EX05', 'LGB'),
        L.contractorPriority(58, CONTRACTOR),
        ...poorFragmentation(68, 'EX05', 50),
        { at: 78, type: 'truckBreakdown', truck: 'E48', minutes: 35, text: 'E48 (CAT 777E) stopped on the main ramp — engine fault.', radio: L.breakdownRadio('E48', 'main ramp') },
        { at: 95, type: 'dumpDown', dump: 'MCB', minutes: 25, reason: 'Rehandle loader cleaning up and rebuilding the tip-head windrow' },
        L.rehandleClosure(95, REHANDLE, 'MC Blue finger', 'I\'ll move EX04\'s trucks onto another unit until it reopens'),
        ...faceChange(105, 'EX08', 'OR1'),
        L.closedDumpRequest(112, 'N29', 'HME dump', 'it has been dumped to its limit', 'TSF Projects'),
        L.fatigue(120, 'N17'),
        L.fatigueFollowUp(135, 'N17'),
        ...faceChange(140, 'EX04', 'waste'),
        L.waterCart(148, 'WC1'),
        L.nearMiss(165, 'E51', 'TSF Projects')
      ]
    },
    {
      id: 'storm',
      name: 'Summer storm & blast',
      durationMin: 180,
      startClockMin: 6 * 60,
      speed: 15,
      summary: 'Clear and fire a blast at EX05 in PB4 (keeping 3 units running meanwhile), deal with its poor fragmentation, keep trucks out of PB6, and run the lightning TARP.',
      briefing: [
        roleText,
        fleetText,
        runText(RUNNING.storm),
        'Drill & blast will fire the PB4 bench at EX05 this morning. To clear a blast: tram EX05 to its safe position, withdraw every truck from the exclusion zone, then give the all-clear.',
        blastText,
        'Thunderstorms are forecast for the afternoon. Follow the site lightning TARP.',
        cycleText,
        facesText(FACES.storm),
        routingText,
        'Shift targets: TARGET_ORE t ore and TARGET_WASTE t waste (reduced for the blast and weather).'
      ],
      shovelStatus: EX10_COMMISSIONING,
      running: RUNNING.storm,
      unavailable: UNAVAILABLE,
      faces: FACES.storm,
      fleet: fleet({ EX04: 8, EX05: 11, EX03: 7 }, FACES.storm),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Shift started. Blast planned at EX05 (PB4) this morning; storms forecast later.' },
        { at: 10, type: 'blast', shovel: 'EX05', blastIn: 35, guard: 10, reentry: 20, radius: 260 },
        L.lvCrossing(20, 'LV21 (shotfirer)', 'the explosives magazine road'),
        L.contractorAuthorisation(28, CONTRACTOR, 'E44', 'main ramp'),
        L.unreleasedArea(40, 'N33', 'PB6'),
        L.contractorAuthorisationFollowUp(52, 'E44', 'main ramp'),
        L.lightningWarning(60),
        L.lightningFollowUp(84),
        { at: 85, type: 'standDown', minutes: 20, reason: 'lightning all-clear given',
          text: 'LIGHTNING TARP: strikes within 5 km of the pit. All mobile equipment parked; operators remain in their cabs until the all-clear.' },
        L.lightningCab(87, 'EX03'),
        L.rain(106),
        ...poorFragmentation(110, 'EX05', 60),
        { at: 115, type: 'fuelLow', truck: 'N45', minutes: 40, radio: L.fuelRadio('N45') },
        ...faceChange(125, 'EX04', 'MCR'),
        L.rainFollowUp(130),
        { at: 145, type: 'shovelDown', shovel: 'EX03', minutes: 25, reason: 'Hydraulic hose failure' },
        ...faceChange(150, 'EX05', 'waste'),
        L.fatigue(160, 'E49'),
        L.fatigueFollowUp(172, 'E49')
      ]
    },
    {
      id: 'night',
      name: 'Night shift — high pressure',
      durationMin: 180,
      startClockMin: 18 * 60,
      speed: 15,
      summary: 'Overlapping critical events at night: a slope radar alarm on the PB4 wall, two breakdowns needing a parked unit started, poor fragmentation, a fatigue monitoring alert, face changes and an unknown vehicle.',
      briefing: [
        roleText,
        fleetText,
        runText(RUNNING.night),
        'N49 and N50 are parked at the go-line while their operators finish pre-start. You will be told when they are available.',
        'EX10 is still being commissioned in the workshop. Remember the geotechnical TARP: withdraw first, investigate second.',
        cycleText,
        blastText,
        facesText(FACES.night),
        routingText,
        'Shift targets: TARGET_ORE t ore and TARGET_WASTE t waste.'
      ],
      shovelStatus: EX10_COMMISSIONING,
      running: RUNNING.night,
      unavailable: UNAVAILABLE,
      faces: FACES.night,
      fleet: fleet({ EX04: 8, NEX14002: 8, EX07: 10 }, FACES.night, ['N49', 'N50']),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Night shift started. N49 and N50 parked at the go-line awaiting operators.' },
        { at: 10, type: 'available', trucks: ['N49', 'N50'], text: 'Operators for N49 and N50 have finished pre-start and are ready for assignment.' },
        L.geotech(20, 'EX07'),
        { at: 35, type: 'shovelDown', shovel: 'EX04', minutes: 25, reason: 'Hydraulic pump fault' },
        { at: 50, type: 'truckBreakdown', truck: 'N26', minutes: 30, text: 'N26 stopped on the main ramp — electrical fault.', radio: L.breakdownRadio('N26', 'main ramp') },
        ...faceChange(60, 'NEX14002', 'PHG'),
        { at: 70, type: 'fuelLow', truck: 'N36', minutes: 40, radio: L.fuelRadio('N36') },
        ...poorFragmentation(75, 'NEX14002', 45),
        L.unknownLv(85, 'N42', 'a light vehicle with no flag or beacon', 'main ramp'),
        ...faceChange(100, 'EX04', 'OR2'),
        L.fatigueAlarm(110, 'E45'),
        L.fatigueFollowUp(122, 'E45'),
        { at: 130, type: 'shovelDown', shovel: 'NEX14002', minutes: 30, reason: 'Bucket tooth lost — searching the muckpile' },
        ...faceChange(140, 'EX04', 'waste'),
        L.windrow(150, 'TSF Projects', 'Dozer DZ2')
      ]
    }
  ];

  // Shift targets, calibrated against the reference (expert) controller.
  const TARGETS = {
    practice: { ore: 950, waste: 620 },
    day: { ore: 5150, waste: 1400 },
    storm: { ore: 2700, waste: 4100 },
    night: { ore: 3850, waste: 3100 }
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
    statusNote: 'Draft profile: fleet and callsigns, loading units, pushbacks, cycle times, speed limits, ROM fingers, waste dumps and radio channels confirmed; pit geometry, the day-to-day faces, targets and procedure wording are placeholders pending site confirmation.',
    commodity: { name: 'Gold', gradeUnit: 'g/t Au', gradeDecimals: 2 },
    // Ore is tipped on ROM fingers by ore type; a separate rehandle
    // controller feeds the crusher.
    gradeControl: 'stockpiles',
    oreTypes: ORE_TYPES,
    // No FMS yet: no wrong-destination warnings or auto-filled dumps.
    dispatchAids: false,
    fleet: {
      count: 34,
      // Actual payloads (confirmed): HD785 90-100 t, CAT 777E 80-90 t.
      classes: {
        HD785: { name: 'Komatsu HD785', payloadT: 95, payloadRange: [90, 100], owner: 'QKR Navachab', tag: 'QKR' },
        CAT777E: { name: 'CAT 777E', payloadT: 85, payloadRange: [80, 90], owner: 'Eitavelo Mining (contractor)', tag: 'Eitavelo' }
      }
    },
    // Fleet efficiency is scored on each running unit's loads/hour against its
    // targetPerHour. Long cycles make trucks travel in platoons, so about
    // 2 min of queueing per load is expected even with good dispatch.
    queueAllowanceMin: 2,
    // Usually only 3 units run at a time because there are not enough trucks.
    runUnits: 3,
    // Order in which the reference controller starts a parked unit.
    startOrder: ['EX08', 'EX03', 'EX07', 'NEX14002', 'EX05', 'EX04'],
    // Trucks per unit for a balanced plan (~45 min PB3/PB4 and ~26 min PB5 cycles
    // against the hourly targets); the reference controller uses these weights.
    planWeights: { EX03: 7, EX04: 8, EX05: 11, EX07: 11, EX08: 7, EX10: 7, NEX14002: 8 },
    // Default destinations; units follow their current face (see FACES).
    oreDumpFor: { EX04: 'MCB', EX05: 'FWG', NEX14002: 'MCR' },
    wasteDumpFor: { EX03: 'TSF', EX04: 'TSF', EX05: 'TSF', EX07: 'TSF', EX08: 'TSF', EX10: 'TSF', NEX14002: 'TSF' },
    radio: { pit: PIT_CH, rehandle: REHANDLE_CH },
    layout,
    scenarios
  });
});
