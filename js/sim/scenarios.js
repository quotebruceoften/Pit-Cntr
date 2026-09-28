/*
 * Assessment scenarios. Every candidate taking the same scenario faces the
 * same scripted events at the same times, so results are comparable.
 *
 * Event times (`at`) are in minutes from the start of the shift.
 * Radio option ratings: best | ok | poor | unsafe.
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

  function fleet(plan, parked) {
    const out = [];
    let n = 1;
    for (const [shovel, dump, count] of plan) {
      for (let i = 0; i < count; i++) {
        out.push({ id: 'T' + String(n++).padStart(2, '0'), shovel, dump });
      }
    }
    for (const id of parked || []) {
      const t = out.find((f) => f.id === id);
      t.shovel = 'PARK';
    }
    return out;
  }

  // ------------------------------------------------------ reusable radio calls

  const lvCrossing = (at, callsign, where) => ({
    at, type: 'radio', id: 'lv-crossing',
    from: callsign,
    message: 'Pit control, ' + callsign + '. I\'m at the give-way on the main haul road near the ramp top and need to cross to ' + where + '. Can I go?',
    options: [
      { text: 'Hold at the give-way. I\'ll call the approaching trucks, then give you a clear to cross — confirm back when you\'re across.', rating: 'best',
        feedback: 'Positive communication: haul trucks are informed, the LV only moves on an explicit clearance and confirms when clear.' },
      { text: 'Cross when you see a gap in the traffic.', rating: 'ok',
        feedback: 'Leaves the judgement to the LV driver with no warning to truck operators; large trucks have significant blind spots.' },
      { text: 'Just go now, the trucks will see you.', rating: 'unsafe', severity: 'major',
        feedback: 'Haul truck operators cannot see small vehicles close in front. Never assume a truck has seen an LV.' },
      { text: 'Crossings are not allowed during the shift — wait until the shift change.', rating: 'poor',
        feedback: 'Unnecessarily blocks legitimate work; controlled crossings are routine with positive communication.' }
    ],
    timeoutText: 'The LV driver was left waiting at the give-way with no answer.'
  });

  const fatigue = (at, truck) => ({
    at, type: 'radio', id: 'fatigue',
    from: truck + ' operator',
    message: truck + ' here. I\'m really struggling to stay awake, caught myself nodding off on the last haul.',
    options: [
      { text: 'Pull over at the next safe bay, park up with brakes on and hazards. I\'ll send a relief operator and the supervisor.', rating: 'best',
        effects: [{ type: 'hold', truck, minutes: 20, reason: 'fatigue relief — fresh operator' }],
        feedback: 'Fatigue is a critical risk. Stop the truck safely immediately and arrange relief; the lost production is the right trade-off.' },
      { text: 'Crib break is in 40 minutes — open the window, have some water and push through until then.', rating: 'unsafe', severity: 'major',
        effects: [{ type: 'flag', key: 'fatigueIgnored' }],
        feedback: 'Micro-sleeps at the wheel of a 200 t truck can be fatal. Self-reported fatigue must never be pushed through.' },
      { text: 'Finish this load, then park at the go-line and we\'ll sort something out.', rating: 'poor',
        effects: [{ type: 'hold', truck, minutes: 30, reason: 'fatigue relief — fresh operator' }],
        feedback: 'Allows a fatigued operator to keep driving a loaded truck up the ramp — the highest-risk part of the cycle.' },
      { text: 'Stop the truck where you are right now in the middle of the road and wait.', rating: 'ok',
        effects: [{ type: 'hold', truck, minutes: 20, reason: 'fatigue relief — fresh operator' }],
        feedback: 'Stopping is right, but in a live travel lane without warning other traffic creates a collision hazard.' }
    ],
    timeoutEffects: [
      { type: 'hold', truck, minutes: 25, reason: 'fatigue — supervisor intervened' },
      { type: 'violation', severity: 'major', category: 'safety', text: 'A fatigued operator (' + truck + ') was left driving with no instruction until the supervisor intervened.' }
    ],
    timeoutText: 'A fatigued operator reported in and got no instruction from pit control.'
  });

  const fatigueFollowUp = (at, truck) => ({
    at, type: 'violation', when: { flag: 'fatigueIgnored', is: true }, severity: 'major', category: 'safety',
    text: truck + ' drifted off the road and hit the windrow — operator had fallen asleep (near miss).'
  });

  const breakdownRadio = (truck, where) => ({
    id: 'breakdown', from: truck + ' operator',
    message: truck + ' here, engine warning light and I\'m losing power on the ' + where + '. What do you want me to do?',
    options: [
      { text: 'Pull over to the windrow side, stop, apply the park brake, hazards on and stay in the cab. I\'ll warn traffic and call maintenance.', rating: 'best',
        feedback: 'Makes the vehicle and operator safe, warns other traffic and gets maintenance moving.' },
      { text: 'Try to limp it to the next pull-out bay and park there.', rating: 'ok',
        feedback: 'Reasonable if the truck is safely controllable, but traffic has not been warned.' },
      { text: 'Keep going to the dump — we\'ll look at it after this load.', rating: 'unsafe', severity: 'major',
        feedback: 'Operating a failing truck, especially loaded on a ramp, risks loss of power/brakes and a runaway.' },
      { text: 'Hop out and have a look in the engine bay, tell me what you see.', rating: 'unsafe', severity: 'major',
        feedback: 'Operators must not get out on an active haul road without isolation and traffic control.' }
    ],
    timeoutEffects: [{ type: 'violation', severity: 'minor', category: 'safety', text: 'Broken-down ' + truck + ' left on the haul road with no instruction or traffic warning.' }],
    timeoutText: 'A broken-down truck on the haul road got no instruction from pit control.'
  });

  const fuelRadio = (truck) => ({
    id: 'fuel', from: truck + ' operator',
    message: truck + ' here, fuel warning just came on. I\'ve got maybe 40 minutes left.',
    options: [
      { text: 'Copy. Finish your current dump then head straight to the fuel bay; I\'ll pull you off the circuit.', rating: 'best',
        effects: [{ type: 'fuel', truck }],
        feedback: 'Refuels with minimal disruption before the truck runs dry.' },
      { text: 'Keep hauling, you can fuel at crib.', rating: 'poor',
        feedback: 'Crib is too far away; the truck will run out on the road and need recovery.' },
      { text: 'Stop wherever you are and I\'ll send the fuel truck out to you.', rating: 'ok',
        effects: [{ type: 'hold', truck, minutes: 20, reason: 'field refuel' }, { type: 'flag', key: 'fieldRefuel' }],
        feedback: 'Works, but ties up the fuel truck and leaves a stationary truck on the haul road.' }
    ],
    timeoutText: 'The low-fuel call went unanswered.'
  });

  const rain = (at) => ({
    at, type: 'radio', id: 'rain',
    from: 'Shift supervisor',
    message: 'Heavy rain moving in, roads are getting slick — especially the main ramp. How do you want to run the fleet?',
    options: [
      { text: 'Put a speed restriction on all haul roads, tell every operator to increase following distance, and ask the water cart to stop watering.', rating: 'best',
        effects: [{ type: 'speed', factor: 0.75 }, { type: 'flag', key: 'rainManaged' }],
        feedback: 'Reduces speed and spacing risk on wet roads and removes extra water. Accepts a cycle-time cost.' },
      { text: 'Just remind everyone to take care.', rating: 'poor',
        feedback: 'No actual control is put in place for slippery roads.' },
      { text: 'We\'re behind target — keep full speed and keep the water cart going for dust.', rating: 'unsafe', severity: 'major',
        feedback: 'Production pressure must never override wet-road controls; adding water makes it worse.' },
      { text: 'Stand the whole fleet down until the rain passes.', rating: 'ok',
        effects: [{ type: 'speed', factor: 0.75 }, { type: 'flag', key: 'rainManaged' }],
        feedback: 'Safe but more drastic than needed for rain at this intensity; a speed restriction is the usual first control. (Simulated as a speed restriction.)' }
    ],
    timeoutEffects: [],
    timeoutText: 'No wet-weather controls were put in place.'
  });

  const rainFollowUp = (at) => ({
    at, type: 'violation', when: { flag: 'rainManaged', is: false }, severity: 'major', category: 'safety',
    text: 'Loaded truck slid on the wet ramp and stopped against the windrow (near miss) — no wet-weather controls in place.'
  });

  const geotech = (at, shovel) => ({
    at, type: 'radio', id: 'geotech', timeout: 25,
    from: 'Geotechnical engineer',
    message: 'URGENT — slope radar is showing accelerating movement on the wall above ' + shovel + '. Movement rate is past the trigger action threshold.',
    options: [
      { text: 'Evacuate ' + shovel + ' and all trucks from the area immediately, set up the exclusion zone, and hold until you give the all-clear.', rating: 'best',
        effects: [{ type: 'evacuate', shovel, minutes: 50 }],
        feedback: 'An accelerating wall is a potential fatal failure. Evacuate first, investigate second.' },
      { text: 'Let ' + shovel + ' finish loading the trucks in the queue, then pull out.', rating: 'unsafe', severity: 'critical',
        effects: [{ type: 'evacuate', shovel, minutes: 50 }],
        feedback: 'Delaying evacuation when a trigger threshold is exceeded exposes people to a wall failure.' },
      { text: 'Can you go and do a visual check first before we stop production?', rating: 'unsafe', severity: 'major',
        effects: [{ type: 'evacuate', shovel, minutes: 50 }],
        feedback: 'The trigger action response plan requires withdrawal first; visual checks happen from a safe location.' },
      { text: 'Keep working but tell the operator to keep an eye on the wall.', rating: 'unsafe', severity: 'critical',
        effects: [{ type: 'evacuate', shovel, minutes: 50 }],
        feedback: 'Operators cannot see radar-detected movement. This ignores the TARP.' }
    ],
    timeoutEffects: [{ type: 'evacuate', shovel, minutes: 50 }, { type: 'violation', severity: 'major', category: 'safety', text: 'No response to an urgent slope-stability alarm — geotech had to order the evacuation.' }],
    timeoutText: 'Pit control did not respond to an urgent geotechnical alarm.'
  });

  const nearMiss = (at, truck) => ({
    at, type: 'radio', id: 'near-miss',
    from: truck + ' operator',
    message: 'Pit control, ' + truck + '. The dozer at the waste dump just reversed into my path without calling it — missed me by a couple of metres!',
    options: [
      { text: 'Is everyone OK? Dozer to stop and park up. I\'ll notify the supervisor, and tipping stays paused at that spot until they\'ve reviewed it.', rating: 'best',
        feedback: 'Checks welfare, stops the hazard, escalates for investigation.' },
      { text: 'Dozer operator: remember to call your movements. Carry on everyone.', rating: 'ok',
        feedback: 'Addresses behaviour but a near miss should be reported to the supervisor for investigation.' },
      { text: 'Noted, I\'ll put it in the shift report.', rating: 'poor',
        feedback: 'No immediate control; the same interaction could happen on the next tip.' },
      { text: 'Just keep your distance from the dozer.', rating: 'poor',
        feedback: 'Puts the whole burden on the truck operator and doesn\'t report the incident.' }
    ],
    timeoutEffects: [{ type: 'violation', severity: 'minor', category: 'safety', text: 'Near-miss report from ' + truck + ' was not acted on.' }],
    timeoutText: 'A near-miss report was ignored.'
  });

  const windrow = (at) => ({
    at, type: 'radio', id: 'windrow',
    from: 'Dozer D2 operator',
    message: 'The windrow on the waste dump tip edge has been pushed down to about knee height. I need to rebuild it — trucks are still tipping there.',
    options: [
      { text: 'Stop tipping on that edge now. I\'ll send trucks to the other tip head until you confirm the windrow is back to height.', rating: 'best',
        feedback: 'An undersized tip-edge windrow is an over-the-edge risk. Stop tipping there until it is restored.' },
      { text: 'Keep tipping short of the edge while you work around them.', rating: 'unsafe', severity: 'major',
        feedback: 'Mixes dozer and trucks with an inadequate edge bund — two hazards at once.' },
      { text: 'Fix it at the end of the shift.', rating: 'unsafe', severity: 'major',
        feedback: 'Leaves an inadequate edge bund in service for hours.' },
      { text: 'Tell the truck operators to take extra care near the edge.', rating: 'poor',
        feedback: 'Administrative warning only; the physical control is missing.' }
    ],
    timeoutEffects: [{ type: 'violation', severity: 'minor', category: 'safety', text: 'Trucks kept tipping over a damaged windrow while the dozer operator waited for an answer.' }],
    timeoutText: 'The dozer operator got no answer about the damaged windrow.'
  });

  const unknownLv = (at) => ({
    at, type: 'radio', id: 'unknown-lv',
    from: 'T10 operator',
    message: 'There\'s a white ute on the main ramp heading down into the pit. It\'s not on our channel and it\'s not flying a flag.',
    options: [
      { text: 'All trucks on the ramp stop in place. I\'ll try the ute on all channels and send the supervisor to intercept and escort it out.', rating: 'best',
        feedback: 'An uncontrolled light vehicle among haul trucks is a fatal-risk interaction. Stop traffic, make contact, intercept.' },
      { text: 'Keep an eye on it and give it plenty of room.', rating: 'poor',
        feedback: 'Doesn\'t control the interaction and relies on every operator seeing the ute.' },
      { text: 'Carry on, they probably know what they\'re doing.', rating: 'unsafe', severity: 'major',
        feedback: 'Unknown vehicles without comms must be treated as a serious hazard.' },
      { text: 'I\'ll report it to security at the end of the shift.', rating: 'unsafe', severity: 'major',
        feedback: 'Far too slow — the hazard is present now.' }
    ],
    timeoutEffects: [{ type: 'violation', severity: 'major', category: 'safety', text: 'Uncontrolled light vehicle on the ramp was not dealt with.' }],
    timeoutText: 'An uncontrolled vehicle on the ramp was reported and pit control did not respond.'
  });

  const waterCart = (at) => ({
    at, type: 'radio', id: 'water-cart',
    from: 'Water cart WC1',
    message: 'WC1 here. It\'s getting dusty, visibility is dropping on the ramp. Want me to give it a good soaking?',
    options: [
      { text: 'Water the flat haul roads, but only light, intermittent passes on the ramp and none at intersections. I\'ll let operators know.', rating: 'best',
        feedback: 'Controls dust while avoiding a slick ramp or intersection.' },
      { text: 'Yes, soak the whole ramp.', rating: 'unsafe', severity: 'major',
        feedback: 'Over-watering a ramp causes loss of traction for loaded trucks.' },
      { text: 'No watering this shift.', rating: 'poor',
        feedback: 'Dust reduces visibility and is a health hazard; it needs controlling.' }
    ],
    timeoutText: 'The water cart got no direction about dust control.'
  });

  // --------------------------------------------------------------- scenarios

  const SCENARIOS = [
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

  return { SCENARIOS };
});
