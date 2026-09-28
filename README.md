# Pit Controller Simulator

A browser-based open-pit mine dispatch simulation for **assessing pit controller competency** and **identifying new pit controllers** from your operator workforce or external applicants.

Candidates run a compressed shift in the pit control seat: dispatching a 16-truck haul fleet between three loading units and three dump points, answering radio calls, and handling breakdowns, crusher outages, blasts, slope-stability alarms and fatigue. Every candidate in a scenario gets the same scripted events at the same times, so results are directly comparable.

## Running it

No install or build step. Open `index.html` in Chrome, Edge or Firefox. It works offline from a USB stick or a shared drive.

To serve it locally instead, run `npm start` (uses `http-server`) and open http://localhost:8080.

## Using it

1. **Practice shift.** A 1-hour shift (about 4 minutes) with pause, speed control and instant feedback on radio answers. It is not ranked. Every candidate should do this first.
2. **Start assessment.** Register the candidate, pick a scenario and read the briefing. Each assessed shift is 3 hours of mine time in about 12 real minutes, with no pause.
3. **Debrief.** Shows competency scores, the recommendation, every radio decision next to the best answer, incidents, disruption response times and a crusher blend chart. It can be printed or saved as a PDF.
4. **Assessor dashboard** (default PIN `1234`, change it under Settings). Candidate rankings combine each person's assessed shifts. You can also drill into every attempt, export CSV/JSON, and import results from other assessment PCs.

### Scenarios

| Scenario | What it tests |
|---|---|
| Day shift: routine operations | Fixing a poor handover allocation, shovel breakdown, crusher outage, low fuel, fatigue, near miss, water cart, light-vehicle crossing |
| Blast day | Tramming the shovel out, clearing the exclusion zone, giving a correct all-clear, and returning safely, while also handling rain, a breakdown and fatigue |
| Night shift: high pressure | A slope-radar alarm (TARP), overlapping crusher outage, an unknown vehicle on the ramp, deploying late operators, a damaged windrow |

## Scoring

| Competency | Weight | Measured by |
|---|---|---|
| Safety leadership | 30% | Exclusion-zone breaches, false all-clears, unsafe radio instructions, ignored hazards (minor −5, major −20, critical −50) |
| Production delivery | 20% | Ore (ROM stockpile counts at 85%) and waste tonnes against the shift target |
| Fleet efficiency | 15% | Loading-unit utilisation and average truck queue time |
| Grade & process control | 10% | Crusher blend within spec (rolling 6 loads), minus penalties for misrouted material |
| Radio decision making | 15% | Rating of each answer (best / acceptable / poor / unsafe / no response), slightly reduced for slow answers |
| Situational awareness | 10% | Time taken to re-plan the fleet after each disruption |

**Recommendation bands:** Recommended (≥80 overall and ≥80 safety), Promising / trainee pathway (≥65), Needs development (≥55), Not suitable at this time (<55). **Any critical safety failure means "Not suitable at this time", whatever the other scores are.**

The blend is only scored when every ore shovel has been available for 20 minutes. Forced outages (breakdowns, evacuations, blasts) are therefore not held against the candidate, but leaving a shovel idle by choice is.

Integrity: the debrief records how many times the candidate switched away from the window. The simulation pauses while the window is hidden.

## Calibration and tests

`tests/bots.js` contains an **expert controller** bot, a **passive** (do-nothing) controller and a **reckless** one. The test suite checks that in every assessed scenario:

- the expert is *Recommended* and has no safety violations,
- the passive and reckless controllers are *Not suitable*,
- the expert beats the passive controller by at least 30 points.

It also tests the engine's rules: the blast lifecycle, loads finishing to the right dump after reassignment, fuel, geotech zones, radio timeouts and determinism.

```
npm test
```

Shift targets were calibrated against the expert bot, so a strong human controller should reach roughly 100% of target.

## Project layout

```
index.html            App shell (all screens)
css/styles.css        Control-room theme
js/sim/mine.js        Road network, loading units, dumps, routing, truck speeds
js/sim/engine.js      Simulation engine (trucks, queues, blasts, zones, radio, disruptions)
js/sim/scenarios.js   Scripted scenarios and radio calls
js/sim/scoring.js     Competency scoring and recommendation bands
js/ui/*.js            Map renderer, console, report, storage, app shell
tests/                Node test suite and calibration bots
```

## Customising for your site

- **Scenarios / radio calls:** edit `js/sim/scenarios.js`. Events are timed in minutes from the start of the shift. Radio options are rated `best`, `ok`, `poor` or `unsafe` and can trigger effects such as `hold`, `evacuate`, `speed`, `fuel`, `flag` or `violation`. Align the wording with your site's TARPs and procedures.
- **Mine layout, fleet, speeds and grades:** edit `js/sim/mine.js`.
- **Weights and bands:** edit `js/sim/scoring.js`.
- After changing anything, run `npm test`. If the expert bot's production shifts, re-calibrate the targets.

## Data and privacy

Results are stored only in the browser's local storage on the machine that ran the assessment. Export JSON regularly to keep them. The assessor PIN deters casual access on a shared PC but is not real security. Use this tool as one input to a selection decision, alongside interviews and on-the-job assessment.
