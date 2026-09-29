/*
 * Scenario building blocks shared by every site profile, plus the site
 * registry. Site files (js/sites/*.js) combine these into scenarios using
 * their own equipment names, locations and callsigns.
 *
 * Every candidate taking the same scenario faces the same scripted events at
 * the same times, so results are comparable.
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

  // plan: [[loadingUnit, dump, truckCount], ...]; parked: truck ids starting parked.
  // cls: optional truck class id (see site.fleet.classes).
  function fleet(plan, parked, prefix, cls) {
    const out = [];
    let n = 1;
    for (const [shovel, dump, count] of plan) {
      for (let i = 0; i < count; i++) {
        const f = { id: (prefix || 'T') + String(n++).padStart(2, '0'), shovel, dump };
        if (cls) f.cls = cls;
        out.push(f);
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
        feedback: 'Micro-sleeps at the wheel of a loaded haul truck can be fatal. Self-reported fatigue must never be pushed through.' },
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

  const nearMiss = (at, truck, place) => ({
    at, type: 'radio', id: 'near-miss',
    from: truck + ' operator',
    message: 'Pit control, ' + truck + '. The dozer at ' + (place || 'the waste dump') + ' just reversed into my path without calling it — missed me by a couple of metres!',
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

  const windrow = (at, dumpName, dozer) => ({
    at, type: 'radio', id: 'windrow',
    from: (dozer || 'Dozer D2') + ' operator',
    message: 'The windrow on the ' + (dumpName || 'waste dump') + ' tip edge has been pushed down to about knee height. I need to rebuild it — trucks are still tipping there.',
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

  const unknownLv = (at, reporter, vehicle, where) => ({
    at, type: 'radio', id: 'unknown-lv',
    from: (reporter || 'T10') + ' operator',
    message: 'There\'s ' + (vehicle || 'a white ute') + ' on the ' + (where || 'main ramp') + ' heading down into the pit. It\'s not on our channel and it\'s not flying a flag.',
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

  const waterCart = (at, cart) => ({
    at, type: 'radio', id: 'water-cart',
    from: 'Water cart ' + (cart || 'WC1'),
    message: (cart || 'WC1') + ' here. It\'s getting dusty, visibility is dropping on the ramp. Want me to give it a good soaking?',
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

  // Lightning: the storm-season hazard at southern African sites. Wording is
  // generic; align distances and actions with the site's lightning TARP.
  const lightningWarning = (at, from) => ({
    at, type: 'radio', id: 'lightning-warning',
    from: from || 'Emergency control room',
    message: 'Lightning detector alarm — strikes detected about 10 km away and the storm cell is moving towards the pit.',
    options: [
      { text: 'Activate the lightning TARP: announce it on all channels, stop all explosives handling and withdraw the blast crew, get everyone on foot into buildings or vehicles, and keep monitoring the detector.', rating: 'best',
        effects: [{ type: 'flag', key: 'lightningManaged' }],
        feedback: 'Acts at the warning stage: people in the open and explosives work are the highest lightning risks.' },
      { text: 'Warn everyone on the radio to watch the weather; we\'ll act if it gets closer.', rating: 'poor',
        feedback: 'A warning alone leaves people exposed in the open and explosives work continuing while strikes approach.' },
      { text: 'It\'ll probably pass to the north — carry on as normal.', rating: 'unsafe', severity: 'major',
        feedback: 'Storms move unpredictably; the detector alarm is the trigger to act.' },
      { text: 'Keep the blast crew charging holes — we need that pattern fired today.', rating: 'unsafe', severity: 'critical',
        feedback: 'Lightning can initiate explosives. Charging must stop when the lightning TARP is triggered.' }
    ],
    timeoutEffects: [{ type: 'violation', severity: 'major', category: 'safety', text: 'Lightning detector alarm was not acted on by pit control.' }],
    timeoutText: 'Pit control did not respond to a lightning alarm.'
  });

  const lightningFollowUp = (at) => ({
    at, type: 'violation', when: { flag: 'lightningManaged', is: false }, severity: 'major', category: 'safety',
    text: 'Personnel were still working in the open when lightning reached the pit — no lightning TARP had been activated.'
  });

  const lightningCab = (at, operator) => ({
    at, type: 'radio', id: 'lightning-cab', timeout: 25,
    from: operator + ' operator',
    message: 'The storm is right on top of us now. Can I climb down and walk across to the crib hut? It\'s only about 100 metres.',
    options: [
      { text: 'Negative — stay in your cab with the door closed until I give the all-clear. The cab is the safest place for you right now.', rating: 'best',
        feedback: 'An enclosed metal cab protects the operator; walking across open ground during a storm does not.' },
      { text: 'Wait for a gap between strikes and then go quickly.', rating: 'unsafe', severity: 'major',
        feedback: 'There is no safe gap — strikes can hit several kilometres from the storm. Stay in the cab.' },
      { text: 'Yes, go now while it\'s quiet.', rating: 'unsafe', severity: 'major',
        feedback: 'Exposes the operator in the open during active lightning.' },
      { text: 'Your call — do whatever you feel is safest.', rating: 'poor',
        feedback: 'The controller must give a clear instruction during a TARP event.' }
    ],
    timeoutEffects: [{ type: 'violation', severity: 'minor', category: 'safety', text: operator + ' operator asked about leaving the cab during lightning and got no answer.' }],
    timeoutText: 'An operator asked whether to leave the cab during lightning and got no answer.'
  });

  const dust = (at, where) => ({
    at, type: 'radio', id: 'dust',
    from: 'Shift supervisor',
    message: 'Strong wind has picked up — dust off the ' + (where || 'haul road') + ' has visibility down to about one truck length in places.',
    options: [
      { text: 'Slow everything down through the affected section, increase following distances, and have operators stop and wait if they lose sight of the road or the truck ahead.', rating: 'best',
        effects: [{ type: 'speed', factor: 0.8 }, { type: 'flag', key: 'dustManaged' }],
        feedback: 'Matches speed and spacing to visibility, with a clear stop rule when visibility is lost.' },
      { text: 'Just tell operators to put their lights on.', rating: 'poor',
        feedback: 'Lights help but do not control speed and spacing when visibility is near zero.' },
      { text: 'Carry on at normal speed; they know the road.', rating: 'unsafe', severity: 'major',
        feedback: 'Rear-end collisions in dust are a classic haul road fatality mechanism.' }
    ],
    timeoutText: 'Pit control did not respond to low visibility on the haul road.'
  });

  const dustFollowUp = (at) => ({
    at, type: 'violation', when: { flag: 'dustManaged', is: false }, severity: 'major', category: 'safety',
    text: 'Two trucks came within metres of a rear-end collision in dust (near miss) — no visibility controls in place.'
  });

  // Mixed fleets: groups = [{ prefix, cls, count }] or [{ ids: [...], cls }]
  // to use the site's real fleet numbers. Trucks from each group
  // are interleaved in proportion and then allocated to the plan in order,
  // so owners share loading units.
  function mixedFleet(groups, plan, parked) {
    const trucks = [];
    groups = groups.map((g) => Object.assign({}, g, { count: g.ids ? g.ids.length : g.count }));
    const used = groups.map(() => 0);
    const total = groups.reduce((a, g) => a + g.count, 0);
    for (let k = 0; k < total; k++) {
      let best = -1;
      let bestLag = -Infinity;
      groups.forEach((g, i) => {
        if (used[i] >= g.count) return;
        const lag = (k + 1) * g.count / total - used[i];
        if (lag > bestLag) { bestLag = lag; best = i; }
      });
      const g = groups[best];
      used[best]++;
      trucks.push({ id: g.ids ? g.ids[used[best] - 1] : g.prefix + String(used[best]).padStart(2, '0'), cls: g.cls });
    }
    const planned = plan.reduce((a, p) => a + p[2], 0);
    if (planned !== total) throw new Error('Fleet plan allocates ' + planned + ' trucks but the fleet has ' + total);
    let n = 0;
    for (const [shovel, dump, count] of plan) {
      for (let i = 0; i < count; i++) Object.assign(trucks[n++], { shovel, dump });
    }
    for (const id of parked || []) trucks.find((t) => t.id === id).shovel = 'PARK';
    return trucks;
  }

  // Contractor fleets dispatched by the owner's pit control.
  const contractorPriority = (at, supervisor) => ({
    at, type: 'radio', id: 'contractor-priority',
    from: supervisor,
    message: 'Pit control, ' + supervisor + '. We\'re behind on our contract tonnes this month. Can you put our trucks at the front of the queue at the crusher and the ore diggers for the rest of the shift?',
    options: [
      { text: 'Negative. Dispatch follows the mine plan, not the company — queue order stays first-come at every digger and tip. If tonnes are a concern, please raise it with the mining superintendent.', rating: 'best',
        feedback: 'Fair, plan-driven dispatch keeps the whole operation efficient and avoids favouritism; commercial issues go to management.' },
      { text: 'OK, I\'ll quietly give your trucks priority for the rest of the shift.', rating: 'poor',
        effects: [{ type: 'violation', severity: 'minor', category: 'process', text: 'Dispatch priority given to one company\'s trucks outside the mine plan.' }],
        feedback: 'Biased dispatch costs overall production, breaks trust with the other fleet and is a commercial decision the controller does not own.' },
      { text: 'I\'ll see what I can do if the queues allow.', rating: 'ok',
        feedback: 'Polite, but non-committal; it invites future pressure. State the dispatch rule and escalate the concern.' },
      { text: 'Not my problem.', rating: 'poor',
        feedback: 'Correct outcome, poor professionalism. The controller must work with contractor supervisors every shift.' }
    ],
    timeoutText: 'A contractor supervisor\'s request went unanswered.'
  });

  const contractorAuthorisation = (at, supervisor, truck, route) => ({
    at, type: 'radio', id: 'contractor-authorisation',
    from: supervisor,
    message: supervisor + ' here. I\'ve put a new operator on ' + truck + '. He\'s done his induction but hasn\'t been signed off on the ' + route + ' yet. We\'re short of operators — can he haul there today?',
    options: [
      { text: 'No. He can only operate where he has been assessed and signed off. Park ' + truck + ' at the go-line until a trainer can ride with him, and I\'ll re-plan the fleet.', rating: 'best',
        effects: [{ type: 'hold', truck, minutes: 30, reason: 'waiting for a trainer to ride along' }],
        feedback: 'Authorisation (VOC) rules apply to contractor operators exactly as to your own. The production loss is the correct trade-off.' },
      { text: 'Yes, just tell him to take it slow on the ramp.', rating: 'unsafe', severity: 'major',
        effects: [{ type: 'flag', key: 'unauthorisedOperator' }],
        feedback: 'Allows an unassessed operator on a ramp haul — a known high-risk task.' },
      { text: 'Only if one of your experienced operators talks him through it on the radio.', rating: 'poor',
        effects: [{ type: 'flag', key: 'unauthorisedOperator' }],
        feedback: 'Radio coaching is not an assessment; he is still unauthorised for that route.' },
      { text: 'Your operators are your responsibility — do what you think is right.', rating: 'poor',
        effects: [{ type: 'flag', key: 'unauthorisedOperator' }],
        feedback: 'Pit control shares responsibility for who is dispatched where on the owner\'s roads.' }
    ],
    timeoutEffects: [{ type: 'flag', key: 'unauthorisedOperator' }],
    timeoutText: 'A contractor asked whether an unauthorised operator could haul, and got no answer.'
  });

  const contractorAuthorisationFollowUp = (at, truck, route) => ({
    at, type: 'violation', when: { flag: 'unauthorisedOperator', is: true }, severity: 'major', category: 'safety',
    text: truck + '\'s unassessed operator lost traction and stopped against the windrow on the ' + route + ' (near miss).'
  });

  // Sites with separate pit and rehandle controllers on different channels.
  const channelDiscipline = (at, caller, pitChannel, rehandleChannel) => ({
    at, type: 'radio', id: 'channel-discipline',
    from: caller + ' (on ' + pitChannel + ')',
    message: 'Pit control, ' + caller + '. I\'ve just come out of the workshop — where do you want me to go?',
    options: [
      { text: 'You\'re on the pit channel. Switch to ' + rehandleChannel + ' and call the rehandle controller for your instructions.', rating: 'best',
        feedback: 'Each controller directs their own area. Sending the operator to the right channel keeps one clear line of control.' },
      { text: 'Go and load at the ROM pad HG finger.', rating: 'poor',
        feedback: 'Directing equipment in the rehandle controller\'s area creates conflicting instructions and they won\'t know where the unit is.' },
      { text: 'Stand by, I\'ll find out and come back to you.', rating: 'ok',
        feedback: 'Avoids giving a conflicting instruction, but ties up the pit channel; just redirect them to the rehandle channel.' }
    ],
    timeoutText: 'A rehandle operator called pit control and got no answer.'
  });

  // plan: what pit control will do with the affected trucks, e.g.
  // 'I'll redirect them to the HG overflow tip' or 'I'll move EX04's trucks onto waste'.
  const rehandleClosure = (at, controller, finger, plan) => ({
    at, type: 'radio', id: 'rehandle-closure',
    from: controller,
    message: 'Pit control, ' + controller + '. I need to close the ' + finger + ' tip head for about 25 minutes — the loader is cleaning up and rebuilding the windrow. Can you keep your trucks off it?',
    options: [
      { text: 'Copy. ' + plan + ' now and confirm when they\'re clear of the ' + finger + '. Call me when it\'s open again.', rating: 'best',
        feedback: 'Keeps haul trucks away from the loader, keeps the grade on the right stockpile and closes the loop.' },
      { text: 'Tip them on the other grade finger for now.', rating: 'poor',
        feedback: 'Mixing grades on the wrong finger defeats grade control on the ROM pad.' },
      { text: 'Have the loader work around my trucks, we can\'t afford the delay.', rating: 'unsafe', severity: 'major',
        feedback: 'Haul trucks tipping beside a loader working the tip head is a serious interaction risk.' },
      { text: 'Can it wait until shift change?', rating: 'poor',
        feedback: 'A damaged tip-head windrow is a safety control; the rehandle controller\'s request should be supported.' }
    ],
    timeoutText: 'The rehandle controller\'s request to close a tip went unanswered.'
  });

  const unreleasedArea = (at, truck, area) => ({
    at, type: 'radio', id: 'unreleased-area',
    from: truck + ' operator',
    message: truck + ' here. The road through ' + area + ' looks open now — shall I take that shortcut to the waste dump? It\'ll save a couple of minutes.',
    options: [
      { text: 'Negative. ' + area + ' is not released for haulage — stay on the designated haul road.', rating: 'best',
        feedback: 'Areas under preparation may lack edge bunds, have dozers and drills working, and are not on the traffic plan.' },
      { text: 'OK, but take it slowly.', rating: 'unsafe', severity: 'major',
        feedback: 'Routes a haul truck through an area that has not been released or inspected for haulage.' },
      { text: 'Check with the dozer operator there first.', rating: 'poor',
        feedback: 'Release of an area is a formal step, not something agreed on the radio between operators.' }
    ],
    timeoutText: 'An operator asked about using an unreleased area and got no answer.'
  });

  // Alert from an in-cab fatigue monitoring system rather than the operator.
  const fatigueAlarm = (at, truck, system) => ({
    at, type: 'radio', id: 'fatigue-alarm',
    from: system || 'Fatigue monitoring system',
    message: 'FATIGUE ALERT — ' + truck + ' operator: two microsleep events detected in the last 10 minutes.',
    options: [
      { text: 'Call ' + truck + ' now: stop at the next safe bay and park up. Send the supervisor with a relief operator, and log the event.', rating: 'best',
        effects: [{ type: 'hold', truck, minutes: 25, reason: 'fatigue relief after monitoring alert' }],
        feedback: 'Repeated microsleeps mean the operator must stop driving. Act on the system, not on how the operator says they feel.' },
      { text: 'Call the operator and ask if they\'re OK; carry on if they say yes.', rating: 'poor',
        effects: [{ type: 'flag', key: 'fatigueIgnored' }],
        feedback: 'Fatigued people are poor judges of their own fatigue. Two events need the operator stood down.' },
      { text: 'Probably a false alarm — that system is too sensitive. Acknowledge and ignore.', rating: 'unsafe', severity: 'major',
        effects: [{ type: 'flag', key: 'fatigueIgnored' }],
        feedback: 'Dismissing fatigue alerts defeats the control. Treat every alert as real until the supervisor has checked.' }
    ],
    timeoutEffects: [
      { type: 'flag', key: 'fatigueIgnored' },
      { type: 'violation', severity: 'major', category: 'safety', text: 'Fatigue monitoring alert for ' + truck + ' was not acted on.' }
    ],
    timeoutText: 'A fatigue monitoring alert went unanswered.'
  });

  // Grade control moves a unit into a different ore polygon; the controller
  // must re-route its trucks to the matching ROM finger (see 'oreChange' event).
  // oreName is an ore type name, or 'waste' when the unit moves into waste.
  const gradeControlCall = (at, unit, oreName, stockpile) => ({
    at, type: 'radio', id: 'grade-control',
    from: 'Grade control geologist',
    message: 'Pit control, grade control. ' + unit + ' is moving into ' + (oreName === 'waste' ? 'waste' : 'the ' + oreName + ' polygon') +
      ' from the next bucket. All ' + unit + ' loads go to ' + stockpile + ' until I tell you otherwise.',
    options: [
      { text: 'Copy — I\'ll re-route every truck on ' + unit + ' to ' + stockpile + ' now and confirm when done. Trucks already loaded finish to their original destination.', rating: 'best',
        feedback: 'Acts at once, closes the loop with the geologist, and handles loads already in transit correctly.' },
      { text: 'Copy.', rating: 'ok',
        feedback: 'Acknowledged, but no confirmation back. The geologist cannot tell when the change took effect.' },
      { text: 'Just tell the ' + unit + ' operator to let the truck drivers know.', rating: 'poor',
        feedback: 'Destinations are the controller\'s job. Relaying through the loader operator risks misrouted loads.' }
    ],
    timeoutText: 'A grade control change went unanswered.'
  });

  // A poorly fragmented blasted block slows the unit (pair with the
  // 'fragmentation' event, which sets the slower dig rate).
  const fragmentationCall = (at, unit) => ({
    at, type: 'radio', id: 'fragmentation',
    from: unit + ' operator',
    message: unit + ' here. This block is badly fragmented — big boulders and tight digging. It\'s taking me nearly twice as long per truck.',
    options: [
      { text: 'Copy. I\'ll take some trucks off you so they don\'t stand in your queue. Put the oversize aside for the rock breaker, and I\'ll report the fragmentation to drill & blast and the supervisor.', rating: 'best',
        feedback: 'Rebalances the fleet to the slower dig rate, keeps oversize out of the trucks and feeds the problem back to drill & blast.' },
      { text: 'Dig around the worst of it and tell me when you\'re through.', rating: 'ok',
        feedback: 'Sensible at the face, but the trucks are still queuing and drill & blast never hear about it.' },
      { text: 'Load the boulders anyway — we need the tonnes.', rating: 'unsafe', severity: 'major',
        feedback: 'Oversize can damage truck bodies, fall off on the ramp and block the ROM pad or crusher.' },
      { text: 'Copy, do the best you can.', rating: 'poor',
        feedback: 'No change to truck allocation and no report to drill & blast; the lost production just continues.' }
    ],
    timeoutText: 'An excavator operator reported poor fragmentation and got no answer.'
  });

  // An operator asks to use a dump that has been closed.
  const closedDumpRequest = (at, truck, dumpName, reason, alternative) => ({
    at, type: 'radio', id: 'closed-dump',
    from: truck + ' operator',
    message: truck + ' here. The ' + dumpName + ' looks clear and it\'s much closer than ' + alternative + ' — can I tip there this load?',
    options: [
      { text: 'Negative. The ' + dumpName + ' is closed — ' + reason + '. Tip at ' + alternative + '.', rating: 'best',
        feedback: 'A closed dump has no working tip edge or bund. Only open, inspected tips may be used.' },
      { text: 'OK, but tip short of the edge.', rating: 'unsafe', severity: 'major',
        feedback: 'Tipping on a closed dump at its limit risks going over an unbunded edge.' },
      { text: 'Ask the dozer operator there whether it\'s OK.', rating: 'poor',
        feedback: 'Opening or closing a dump is a formal decision, not agreed between operators on the radio.' }
    ],
    timeoutText: 'An operator asked about tipping on a closed dump and got no answer.'
  });

  // ------------------------------------------------------------ site registry

  const SITES = [];

  function registerSite(site) {
    for (const k of ['id', 'name', 'layout', 'fleet', 'commodity', 'scenarios']) {
      if (!site[k]) throw new Error('Site profile missing "' + k + '"');
    }
    const existing = SITES.findIndex((x) => x.id === site.id);
    if (existing >= 0) SITES.splice(existing, 1);
    SITES.push(site);
    return site;
  }

  function getSite(id) {
    return SITES.find((s) => s.id === id) || null;
  }

  function formatGrade(site, g) {
    return g.toFixed(site.commodity.gradeDecimals != null ? site.commodity.gradeDecimals : 2) + ' ' + site.commodity.gradeUnit;
  }

  return {
    SITES, registerSite, getSite, formatGrade,
    scenarioLib: {
      fleet, mixedFleet, fatigueAlarm, gradeControlCall, fragmentationCall, closedDumpRequest, channelDiscipline, rehandleClosure, unreleasedArea, contractorPriority, contractorAuthorisation, contractorAuthorisationFollowUp,
      lvCrossing, fatigue, fatigueFollowUp, breakdownRadio, fuelRadio, rain, rainFollowUp,
      geotech, nearMiss, windrow, unknownLv, waterCart,
      lightningWarning, lightningFollowUp, lightningCab, dust, dustFollowUp
    }
  };
});
