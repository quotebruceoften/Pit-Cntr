/*
 * QKR Navachab Gold Mine — Karibib, Erongo Region, Namibia.
 *
 * DRAFT PROFILE.
 *
 * Public facts: open-pit gold mine ~10 km from Karibib, CIP/CIL plant,
 * cut-off grade of the order of 1.2 g/t, summer thunderstorm season.
 *
 * Confirmed by site staff:
 *  - Loading only in the Main Pit: pushbacks PB3, PB4 and PB5. PB6 is being
 *    prepared for waste stripping and is not released yet.
 *  - Loading units: EX03 Hitachi EX1900, EX04 Hitachi EX1200, EX05/EX07/EX08
 *    Komatsu PC2000, EX10 Komatsu PC2000 (new, still being assembled in the
 *    workshop) and a Trollope Mining CAT 350 (NEX1400).
 *  - Haul fleet: 20 QKR Komatsu HD785 and 14 Eitavelo Mining CAT 777E,
 *    all dispatched by pit control on shared loading units.
 *  - Ore is tipped on stockpiles at the crusher (ROM pad) and fed to the
 *    plant by loaders and Komatsu HD325/HD465 trucks (rehandle).
 *  - Two pit controllers per shift: pit area (Channel 1) and rehandle area
 *    (Channel 3). This simulator assesses the PIT-AREA controller.
 *  - A fleet management system (FMS) is in use.
 *
 * Still PLACEHOLDERS: pit geometry and roads, which pushback/face each unit
 * is on and whether it is loading ore or waste, face grades, ROM pad finger
 * layout, waste dump names, truck callsign prefixes, targets, shift times
 * and the wording of procedures (TARPs). See docs/sites/navachab-data-sheet.md.
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

  // Schematic of the Main Pit, not surveyed. PB3 at the bottom, PB4 on the
  // west side, PB5 on the east side, PB6 (not released) to the north-west.
  // ROM pad fingers sit beside the crusher; rehandle feeds the plant.
  const layout = {
    width: 3400,
    height: 2300,
    metersPerUnit: 0.6,
    base: 'WS',
    nodes: {
      ROMH: { x: 470, y: 260, label: 'ROM pad HG finger' },
      ROML: { x: 760, y: 150, label: 'ROM pad LG finger' },
      ROMX: { x: 300, y: 560, label: 'ROM HG overflow tip' },
      WS: { x: 1650, y: 140, label: 'Mine workshop / fuel bay' },
      NWRD: { x: 2700, y: 220, label: 'North WRD' },
      EWRD: { x: 3150, y: 880, label: 'East WRD' },
      J1: { x: 820, y: 480 },
      J2: { x: 1650, y: 480 },
      J3: { x: 2350, y: 520 },
      J6: { x: 2900, y: 760 },
      R1: { x: 1350, y: 760, label: 'Main ramp' },
      R2: { x: 1850, y: 1060 },
      R3: { x: 1300, y: 1330 },
      MF: { x: 1500, y: 1620, label: 'PB3 floor' },
      J7: { x: 2250, y: 1180, label: 'PB5 access' },
      W1: { x: 950, y: 1250, label: 'PB4 access' },
      P6: { x: 1020, y: 820, label: 'PB6 (not released)' },
      EX03: { x: 2500, y: 1040 },
      EX08: { x: 2600, y: 1350 },
      EX10: { x: 2380, y: 1470 },
      EX05: { x: 650, y: 1150 },
      EX07: { x: 720, y: 1450 },
      EX04: { x: 1300, y: 1950 },
      NEX1400: { x: 1720, y: 1960 }
    },
    edges: [
      ['ROMH', 'J1'], ['ROML', 'J1'], ['ROMX', 'J1'], ['J1', 'J2'], ['J2', 'WS'], ['J2', 'J3'],
      ['J3', 'NWRD'], ['J3', 'J6'], ['J6', 'EWRD'],
      ['J2', 'R1'],
      ['R1', 'R2', { ramp: true, upFrom: 'R2' }],
      ['R2', 'R3', { ramp: true, upFrom: 'R3' }],
      ['R3', 'MF', { ramp: true, upFrom: 'MF' }],
      ['R2', 'J7'], ['J7', 'EX03'], ['J7', 'EX08'], ['J7', 'EX10'],
      ['R3', 'W1'], ['W1', 'EX05'], ['W1', 'EX07'],
      ['MF', 'EX04'], ['MF', 'NEX1400'],
      // PB6 access: drawn but closed to haulage until PB6 is released.
      ['J1', 'P6', { closed: true }]
    ],
    // Which unit is on which face, and ore vs waste, are placeholders.
    shovels: [
      { id: 'EX03', name: 'EX03 Hitachi EX1900', material: 'waste', grade: 0, label: 'PB5 waste', loadSec: 120 },
      { id: 'EX04', name: 'EX04 Hitachi EX1200', material: 'ore', oreClass: 'hg', grade: 2.6, label: 'PB3 HG ore', loadSec: 170 },
      { id: 'EX05', name: 'EX05 Komatsu PC2000', material: 'ore', oreClass: 'lg', grade: 0.9, label: 'PB4 LG ore', loadSec: 130, safePos: { x: 930, y: 1245 } },
      { id: 'EX07', name: 'EX07 Komatsu PC2000', material: 'waste', grade: 0, label: 'PB4 waste', loadSec: 130 },
      { id: 'EX08', name: 'EX08 Komatsu PC2000', material: 'waste', grade: 0, label: 'PB5 waste', loadSec: 130 },
      { id: 'EX10', name: 'EX10 Komatsu PC2000', material: 'waste', grade: 0, label: 'PB5 waste (new unit)', loadSec: 130 },
      { id: 'NEX1400', name: 'NEX1400 CAT 350 (Trollope Mining)', material: 'ore', oreClass: 'hg', grade: 2.4, label: 'PB3 HG ore (selective)', loadSec: 330 }
    ],
    dumps: [
      { id: 'ROMH', name: 'ROM pad HG finger', short: 'ROM HG', role: 'stockpile', gradeClass: 'hg', bays: 2, dumpSec: 45 },
      { id: 'ROML', name: 'ROM pad LG finger', short: 'ROM LG', role: 'stockpile', gradeClass: 'lg', bays: 2, dumpSec: 45 },
      { id: 'ROMX', name: 'ROM HG overflow tip', short: 'HG overflow', role: 'stockpile', gradeClass: 'hg', bays: 1, dumpSec: 45 },
      { id: 'NWRD', name: 'North Waste Rock Dump', short: 'North WRD', role: 'waste', bays: 3, dumpSec: 40 },
      { id: 'EWRD', name: 'East Waste Rock Dump', short: 'East WRD', role: 'waste', bays: 3, dumpSec: 40 }
    ],
    pits: [
      { cx: 1600, cy: 1450, rx: 1250, ry: 850, floorShift: 220, label: 'MAIN PIT' }
    ],
    // Map-only annotations.
    features: [
      { x: 60, y: 60, w: 230, h: 110, label: 'CRUSHER / PLANT' }
    ],
    areas: [
      { x: 260, y: 400, label: 'REHANDLE AREA (Ch 3)' },
      { x: 1500, y: 2090, label: 'PB3' },
      { x: 520, y: 1330, label: 'PB4' },
      { x: 2760, y: 1200, label: 'PB5' },
      { x: 1230, y: 690, label: 'PB6 — being prepared, not released' }
    ]
  };

  const DUMP_FOR = { EX03: 'NWRD', EX04: 'ROMH', EX05: 'ROML', EX07: 'NWRD', EX08: 'EWRD', EX10: 'EWRD', NEX1400: 'ROMH' };
  // Trucks per loading unit, e.g. plan({ EX03: 7, EX04: 5, ... }).
  const plan = (counts) => Object.keys(counts).map((u) => [u, DUMP_FOR[u], counts[u]]);
  const BALANCED = { EX03: 7, EX04: 5, EX05: 6, EX07: 6, EX08: 7, NEX1400: 3 };

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

  const roleText = 'You are the PIT-AREA controller on ' + PIT_CH + '. The rehandle controller on ' + REHANDLE_CH +
    ' runs the ROM pad, loaders and the HD325/HD465 trucks feeding the crusher.';
  const gradeText = 'Ore goes to the ROM pad finger for its grade: HG (EX04, NEX1400) to the HG finger, LG (EX05) to the LG finger. Waste goes to the North or East WRD.';

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
        gradeText,
        'Practice results are not included in the candidate rankings.'
      ],
      shovelStatus: EX10_COMMISSIONING,
      fleet: fleet(BALANCED),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Practice shift started. Trucks are leaving the go-line.' },
        L.lvCrossing(8, 'LV12 (geology)', 'the PB4 geology bench'),
        { at: 20, type: 'shovelDown', shovel: 'EX07', minutes: 15, reason: 'Track tension fault' },
        { at: 35, type: 'fuelLow', truck: 'HT25', minutes: 40, radio: L.fuelRadio('HT25') }
      ]
    },
    {
      id: 'day',
      name: 'Day shift — Main Pit',
      durationMin: 180,
      startClockMin: 6 * 60,
      speed: 15,
      summary: 'An unbalanced handover, EX10 released from commissioning, a rehandle tip closure, a contractor priority request and routine radio traffic.',
      briefing: [
        roleText,
        'Handover note: night shift left 5 trucks on EX03, 3 on EX04, 9 on EX05, 6 on EX07, 8 on EX08 and 3 on NEX1400. Check whether that suits the loading units.',
        'EX10 is expected to be released from commissioning during the shift.',
        gradeText,
        'Shift targets: TARGET_ORE t ore and TARGET_WASTE t waste.'
      ],
      shovelStatus: EX10_COMMISSIONING,
      fleet: fleet({ EX03: 5, EX04: 3, EX05: 9, EX07: 6, EX08: 8, NEX1400: 3 }),
      events: [
        { at: 0, type: 'alert', level: 'info', text: 'Day shift started. Review the handover allocation.' },
        L.channelDiscipline(10, 'Rehandle HD465 truck', PIT_CH, REHANDLE_CH),
        L.lvCrossing(14, 'LV14 (survey)', 'the PB5 survey control point'),
        L.dust(25, 'main haul road to the North WRD'),
        { at: 30, type: 'fuelLow', truck: 'HT22', minutes: 40, radio: L.fuelRadio('HT22') },
        { at: 40, type: 'shovelDown', shovel: 'EX08', minutes: 45, reason: 'Burst hydraulic hose on the boom' },
        L.dustFollowUp(48),
        L.contractorPriority(55, CONTRACTOR),
        { at: 62, type: 'shovelReady', shovel: 'EX10', minTrucks: 4,
          text: 'EX10 commissioning complete — released to load PB5 waste. Put trucks on it.' },
        { at: 75, type: 'truckBreakdown', truck: 'EV48', minutes: 35, text: 'EV48 (CAT 777E) stopped on the main ramp — engine fault.', radio: L.breakdownRadio('EV48', 'main ramp') },
        { at: 95, type: 'dumpDown', dump: 'ROMH', minutes: 25, reason: 'Rehandle loader cleaning up and rebuilding the tip-head windrow' },
        L.rehandleClosure(95, REHANDLE, 'ROM HG finger', 'HG overflow tip'),
        L.fatigue(120, 'HT17'),
        L.fatigueFollowUp(135, 'HT17'),
        L.waterCart(145, 'WC1'),
        L.nearMiss(165, 'EV51', 'the North WRD')
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
        L.rainFollowUp(130),
        { at: 120, type: 'fuelLow', truck: 'HT45', minutes: 40, radio: L.fuelRadio('HT45') },
        { at: 145, type: 'shovelDown', shovel: 'EX04', minutes: 25, reason: 'Slew ring fault' },
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
      summary: 'Overlapping critical events at night: a slope radar alarm on the PB4 wall, loading-unit breakdowns, an unknown vehicle and a damaged windrow.',
      briefing: [
        roleText,
        'HT49 and HT50 are parked at the go-line while their operators finish pre-start. You will be told when they are available.',
        'EX10 is still being commissioned in the workshop. Remember the geotechnical TARP: withdraw first, investigate second.',
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
        { at: 70, type: 'fuelLow', truck: 'HT36', minutes: 40, radio: L.fuelRadio('HT36') },
        L.unknownLv(85, 'HT42', 'a light vehicle with no flag or beacon', 'main ramp'),
        L.fatigue(110, 'EV45'),
        L.fatigueFollowUp(122, 'EV45'),
        { at: 130, type: 'shovelDown', shovel: 'EX03', minutes: 30, reason: 'Bucket tooth lost — searching the muckpile' },
        L.windrow(150, 'North WRD', 'Dozer DZ2')
      ]
    }
  ];

  // Shift targets, calibrated against the reference (expert) controller.
  const TARGETS = {
    practice: { ore: 3000, waste: 3800 },
    day: { ore: 11200, waste: 17000 },
    storm: { ore: 7300, waste: 14500 },
    night: { ore: 12100, waste: 13000 }
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
    statusNote: 'Draft profile: fleet, loading units, pushbacks, ROM pad routing and radio channels confirmed; pit geometry, face assignments, grades, targets and procedure wording are placeholders pending site confirmation.',
    commodity: { name: 'Gold', gradeUnit: 'g/t Au', gradeDecimals: 2 },
    // Ore is tipped on ROM pad fingers by grade; a separate rehandle
    // controller feeds the crusher.
    gradeControl: 'stockpiles',
    fleet: {
      count: 34,
      // Payloads are manufacturer nominal ratings; confirm actual target payloads.
      classes: {
        HD785: { name: 'Komatsu HD785', payloadT: 91, owner: 'QKR Navachab', tag: 'QKR' },
        CAT777E: { name: 'CAT 777E', payloadT: 91, owner: 'Eitavelo Mining (contractor)', tag: 'Eitavelo' }
      }
    },
    // 34 trucks on six working units queue by design (EX10 not yet released).
    queueAllowanceMin: 3,
    planWeights: { EX03: 7, EX04: 5, EX05: 6, EX07: 6, EX08: 7, EX10: 5, NEX1400: 3 },
    oreDumpFor: { EX04: 'ROMH', EX05: 'ROML', NEX1400: 'ROMH' },
    wasteDumpFor: { EX03: 'NWRD', EX07: 'NWRD', EX08: 'EWRD', EX10: 'EWRD' },
    radio: { pit: PIT_CH, rehandle: REHANDLE_CH },
    layout,
    scenarios
  });
});
