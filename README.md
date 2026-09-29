# Pit Controller Simulator

A browser-based open-pit mine dispatch simulation for **assessing pit controller competency** and **identifying new pit controllers** from your operator workforce or external applicants.

Candidates run a compressed shift in the pit control seat. They dispatch the haul fleet between loading units and dump points, answer radio calls, and handle breakdowns, crusher outages, blasts, lightning, slope-stability alarms and fatigue. Every candidate in a scenario gets the same scripted events at the same times, so results are directly comparable.

## Sites

Each mine is modelled as a **site profile**. A profile holds the mine's own pit and haul-road layout, fleet, loading units, dumps, commodity and grade units, and a set of scenarios written in its own terminology. The engine, scoring and assessor tools are shared by every site. See [docs/SITE_PROFILES.md](docs/SITE_PROFILES.md) for how to onboard a mine.

| Site | Status | Scenarios |
|---|---|---|
| **QKR Navachab Gold Mine** (Karibib, Namibia) | Draft. Confirmed: Main Pit PB3–PB5 (PB3/PB4 ~45 min cycles, PB5 4.6 km to TSF, ~26 min; PB6 not released), 7 loading units (3 run at a time; PC2000 14 loads/h, EX04 and NEX14002 10 loads/h) incl. EX10 in commissioning and the Trollope CAT 6015B (NEX14002), poor blast fragmentation, 20 Komatsu HD785 (QKR, N-callsigns, 90–100 t) + 14 CAT 777E (Eitavelo, E-callsigns, 80–90 t) governed at 40 km/h (30 km/h down ramps), 13 ROM fingers by ore type with faces that change mid-shift (ore ↔ waste), TSF Projects waste dump (HME closed), pit controller on Ch 1 and rehandle on Ch 3, no FMS yet (dispatch aids off). Other items: see the [data sheet](docs/sites/navachab-data-sheet.md) | Practice · Day shift (ore polygon change, EX10 released, finger closure, HME request, wrong-channel call, contractor priority) · Summer storm & blast (lightning TARP, PB6 shortcut, contractor authorisation, polygon change) · Night shift (slope radar alarm, fatigue monitoring alert, polygon change) |
| Demo Copper Mine | Fictional demo | Practice · Day shift · Blast day · Night shift |

Pick the active site on the home screen or under assessor Settings. For a customer installation, lock the site in `js/config.js`.

## Running it

No install or build step. Open `index.html` in Chrome, Edge or Firefox. It works offline from a USB stick or a shared drive.

To serve it locally instead, run `npm start` (uses `http-server`) and open http://localhost:8080.

## Using it

1. **Practice shift.** A 1-hour shift (about 4 minutes) with pause, speed control and instant feedback on radio answers. It is not ranked. Every candidate should do this first.
2. **Start assessment.** Register the candidate, pick a scenario and read the briefing. Each assessed shift is 3 hours of mine time in about 12 real minutes, with no pause.
3. **Debrief.** Shows competency scores, the recommendation, every radio decision next to the best answer, incidents, disruption response times and a crusher blend chart. It can be printed or saved as a PDF.
4. **Assessor dashboard** (default PIN `1234`, change it under Settings). Candidate rankings combine each person's assessed shifts. You can also drill into every attempt, export CSV/JSON, and import results from other assessment PCs.

### What the scenarios test

- **Day shift:** fixing a poor handover allocation, a loading-unit breakdown, a crusher outage, low fuel, fatigue, a near miss, dust and water-cart control, a light-vehicle crossing.
- **Blast:** tramming the unit out, clearing the exclusion zone, giving a correct all-clear, and returning safely.
- **Weather:** the lightning TARP (warning, then stand-down with operators staying in their cabs), then wet roads.
- **Night shift:** a slope-radar alarm (geotech TARP), an overlapping crusher outage, an unknown vehicle on the ramp, deploying late operators, a damaged windrow.

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

These checks run for every scenario of every site profile. The tests also check that each scenario only references equipment that exists at its site.

It also tests the engine's rules: the blast lifecycle, loads finishing to the right dump after reassignment, fuel, geotech zones, radio timeouts and determinism.

```
npm test
```

Shift targets were calibrated against the expert bot, so a strong human controller should reach roughly 100% of target.

## Project layout

```
index.html            App shell (all screens); one <script> line per site profile
js/config.js          Deployment config: default site, lock to one site
js/sim/mine.js        Builds a mine model (roads, routing, speeds) from a site layout
js/sim/engine.js      Simulation engine (trucks, queues, blasts, zones, radio, disruptions)
js/sim/library.js     Reusable radio calls and events, site registry
js/sim/scoring.js     Competency scoring and recommendation bands
js/sites/*.js         Site profiles (navachab.js, demo.js)
js/ui/*.js            Map renderer, console, report, storage, app shell
docs/                 Site onboarding guide and per-site data sheets
tests/                Node test suite and calibration bots (run on every site)
```

## Customising

- **A mine's layout, fleet, grades and scenarios:** edit its file in `js/sites/`. To add a new mine, see [docs/SITE_PROFILES.md](docs/SITE_PROFILES.md).
- **Radio calls shared across sites:** edit `js/sim/library.js`.
- **Weights and bands:** edit `js/sim/scoring.js`.
- After changing anything, run `npm test`. If the expert bot's production shifts, re-calibrate the targets.

## Data and privacy

Results are stored only in the browser's local storage on the machine that ran the assessment, and each result is tagged with its site. Export JSON regularly to keep them. The assessor PIN deters casual access on a shared PC but is not real security. Use this tool as one input to a selection decision, alongside interviews and on-the-job assessment.
