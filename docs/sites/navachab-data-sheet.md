# QKR Navachab: site data sheet

Status: **DRAFT**. The profile in `js/sites/navachab.js` runs and is calibrated. Fleet, loading units, pushbacks, cycle times, ROM fingers, waste dumps, ore flow, radio channels and FMS status are confirmed by site staff; the pit geometry, ore types per unit, targets and procedures are still placeholders. The table below shows what came from public sources and what needs confirming. It also doubles as the data-collection template for onboarding any other mine.

## From public sources

| Item | Value used | Source |
|---|---|---|
| Location | Open pit about 10 km from Karibib, Erongo Region, Namibia | [Wikipedia](https://en.wikipedia.org/wiki/Navachab_Gold_Mine), [namibweb](https://www.namibweb.com/navachab.htm) |
| Owner | QKR Namibia (acquired from AngloGold Ashanti in 2014) | [Wikipedia](https://en.wikipedia.org/wiki/Navachab_Gold_Mine) |
| Pits | Main (central) pit; Anomaly 16 and Gecko are also mentioned. Site staff confirm loading is currently in the Main Pit only | [Mining Data Online](https://miningdataonline.com/property/467/Navachab-Mine.aspx) |
| Processing | Crushing and grinding, gravity, CIP/CIL | [Farmonaut](https://farmonaut.com/mining/qkr-navachab-gold-mine-sustainable-impact-in-namibia-2026), [Lycopodium](https://www.lycopodium.com/case-studies/navachab-gold-mine-plant-expansion/) |
| Cut-off grade | "Of the order of 1.2 g/t" | [Mining Data Online](https://miningdataonline.com/property/467/Navachab-Mine.aspx) |
| Drilling | Owner-operated drilling fleet (6 × Epiroc FlexiROC D65) | [The Extractor](https://theextractormagazine.com/2024/06/11/namibias-oldest-gold-mine-navachab-takes-over-drill-operations-as-expansion-drive-picks-up-speed/) |
| Climate hazard | Summer thunderstorms and lightning; wind-blown dust | General knowledge of the region |

## Confirmed by site staff

| Item | Value used |
|---|---|
| Role assessed | The **pit-area controller** (Channel 1). A second controller runs the rehandle area on Channel 3 |
| Active pit | Main Pit only, loading in pushbacks PB3, PB4 and PB5. PB6 is being prepared for waste stripping and is not released (its access road is drawn closed) |
| Cycle times | PB3 and PB4 are near the end of their life and very deep: about **45 min per cycle** to any stockpile or waste dump, so about 1 load per truck per hour. Modelled with real road lengths (PB3/PB4 ≈ 44–47 min), which makes the fleet truck-limited |
| Loading units | EX03 Hitachi EX1900 · EX04 Hitachi EX1200 · EX05, EX07, EX08 Komatsu PC2000 · EX10 Komatsu PC2000 (new, being assembled in the workshop; starts as "Workshop" and is released mid-shift in the day scenario) · NEX1400 CAT 350 (Trollope Mining) |
| QKR haul fleet | 20 × Komatsu HD785, fleet numbers 16, 17, 19, 22, 25, 26, 27, 29, 33, 35, 36, 42–50 |
| Contractor haul fleet | Eitavelo Mining: 14 × CAT 777E, fleet numbers 71, 41–53 |
| Dispatch | Pit control dispatches all 34 trucks as one fleet on shared loading units |
| ROM stockpiles | One finger per ore type, named by the ore loaded. Highest grades: MC Blue, MC Red, Lime; then FW Red, FW Green. Also Purple DM, Purple HG, Brown, Orange 1, Orange 2. Low grade (stockpiled further from the crusher): Yellow, LG Brown, Purple LG |
| Ore flow | Pit trucks tip ore on the finger for its ore type. Loaders and Komatsu HD325/HD465 trucks rehandle it to the crusher. Grade control is scored as ore reaching the correct finger. A unit can move into a new ore polygon mid-shift (a grade control call), and its trucks must then be re-routed |
| Plants | CIP (main gold extraction), PCP and Argo (mainly recovery). Map annotation only |
| Waste dumps | TSF Projects is the main waste dump. HME waste dump is closed (dumped to its limit); it is drawn as closed and trucks sent there cannot tip |
| Radio | Digital radio: pit on Channel 1, rehandle on Channel 3 |
| FMS | None yet. A Hexagon FMS is being installed and goes live next year. Dispatch is by radio, so the simulator's dispatch aids (wrong-dump warnings, auto-filled dumps) are switched off for Navachab |
| Fatigue | An in-cab fatigue monitoring system is in use. The night scenario includes a monitoring-system alert |

## To confirm with the site (placeholders in use)

| # | Item | Placeholder now | What to get |
|---|---|---|---|
| 1 | Pit and road layout | Schematic Main Pit: PB3 at the bottom, PB4 west, PB5 east, PB6 north-west; one main ramp | Current pit plan: ramps, pushback access roads, intersections, give-ways |
| 2 | PB5 cycle time | About 26 min to TSF | Typical PB5 cycle time |
| 3 | Ore type per unit | Start of shift: EX04 MC Blue, NEX1400 MC Red, EX05 FW Green. Scripted polygon changes: EX05 to LG Brown (day), EX04 to Lime (storm), NEX1400 to Purple HG (night) | Which ore types each pushback currently produces, and how often units move between polygons |
| 4 | ROM pad layout | Near fingers in rows beside the crusher; Yellow, LG Brown and Purple LG about 1.3 km further | Finger positions and distances; what "DM" means for Purple DM |
| 5 | Truck callsigns and payloads | Real numbers; the "HT" (QKR) and "EV" (Eitavelo) prefixes are placeholders, since both fleets use 42–50. 91 t nominal payload | How trucks are called on the radio, and target payloads |
| 6 | NEX1400 role | Slow, selective ore loader (about 5.5 min per HD785 load) | What the Trollope CAT 350 actually does |
| 7 | Targets | Shift targets calibrated from the expert controller | Planned shift tonnes for ore and waste |
| 8 | Shift pattern | 06:00 day shift, 18:00 night shift | Shift start times, crib times and handover practice |
| 9 | Lightning TARP | Warning at about 10 km: stop explosives work, get people on foot under cover. Stand-down within 5 km: park the fleet, operators stay in cabs | Exact trigger distances, levels and required actions |
| 10 | Geotech TARP | Radar alarm leads to immediate evacuation and an exclusion zone | Radar/prism trigger levels and response steps; which walls are monitored |
| 11 | Blast procedure | 10-min guard period, all-clear from pit control, 20-min re-entry | Guard times, exclusion distances, who gives the all-clear, re-entry rules |
| 12 | Light-vehicle rules | Positive radio communication before entering or crossing haul roads | LV rules, flags and beacons, call-up procedures |
| 13 | Fatigue response | Monitoring alert: stop at the next safe bay, relief operator, supervisor informed | The site's procedure for fatigue-system alerts and self-reported fatigue, and the system's name |
| 14 | Controller coordination | Rehandle controller calls pit control to close a finger; rehandle trucks calling on Channel 1 are sent to Channel 3 | How the two controllers coordinate, and who owns the finger tip heads |
| 15 | Contractor rules | Contractor supervisor asks by radio; the same authorisation (VOC) rules apply to both fleets | How pit control and the Eitavelo and Trollope supervisors communicate, and any contract rules that affect dispatch |

## After the Hexagon FMS goes live

Once the FMS is live, the pit controller's job shifts toward supervising automatic assignments and handling exceptions. At that point:

- turn dispatch aids back on (`dispatchAids: true`),
- consider adding FMS-specific scenarios, such as an FMS outage that forces a fall-back to radio dispatch, or overriding a bad auto-assignment.

## Before using this for real hiring at Navachab

- Get items 9–13 checked by the safety or training department. Radio answers are scored as "best" or "unsafe" against these procedures.
- Get a senior pit controller to do a practice run and give feedback on realism.
- Run a pilot with 3–5 existing pit controllers to check the scores match their known ability.
- Then set `status: 'confirmed'` in the profile.
