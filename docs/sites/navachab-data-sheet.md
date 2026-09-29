# QKR Navachab: site data sheet

Status: **DRAFT**. The profile in `js/sites/navachab.js` runs and is calibrated. Fleet, callsigns and payloads, loading units and hourly targets, the 3-unit operating practice, pushbacks, cycle times and the PB5 haul distance, speed limits, ROM fingers, waste dumps, ore flow, fragmentation issues, radio channels and FMS status are confirmed by site staff. The pit geometry, the specific daily faces, targets and procedures are still placeholders. The table below shows what came from public sources and what needs confirming. It also doubles as the data-collection template for onboarding any other mine.

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
| Cycle times and distances | PB3 and PB4 are near the end of their life and very deep: about **45 min per cycle** to any stockpile or waste dump. PB5 is **4.6 km from TSF Projects**, about **26 min per cycle**. Modelled with real road lengths at the governed speeds |
| Loading units | EX03 Hitachi EX1900 · EX04 Hitachi EX1200 · EX05, EX07, EX08 Komatsu PC2000 · EX10 Komatsu PC2000 (new, being assembled in the workshop; starts as "Workshop" and is released mid-shift in the day scenario) · NEX14002 CAT 6015B hydraulic shovel (Trollope Mining), about 4–5 passes / 2.5 min per 91 t truck |
| Hourly targets | PC2000s (EX05, EX07, EX08, EX10): **14 loads/h**. Smaller units (EX04 EX1200, NEX14002 CAT 6015B): **10 loads/h**. Shown live on each unit card and scored in fleet efficiency (full marks at 90% of target, since trucks are short) |
| Units running | Usually only **3 excavators run at a time** because there aren't enough trucks. Each scenario starts with 3 running and the rest parked. The controller can start a parked unit (about 10 min pre-start) when a running unit is lost, and park it again later |
| QKR haul fleet | 20 × Komatsu HD785, called **N** + number on the radio: N16, N17, N19, N22, N25, N26, N27, N29, N33, N35, N36, N42–N50 |
| Contractor haul fleet | Eitavelo Mining: 14 × CAT 777E, called **E** + number: E71, E41–E53 |
| Truck speeds and payloads | Governed at 40 km/h; 30 km/h maximum down ramps. Payloads: **HD785 90–100 t**, **CAT 777E 80–90 t** (random within the range per load) |
| Dispatch | Pit control dispatches all 34 trucks as one fleet on shared loading units |
| ROM stockpiles | One finger per ore type, named by the ore loaded. Highest grades: MC Blue, MC Red, Lime; then FW Red, FW Green. Also Purple DM, Purple HG, Brown, Orange 1, Orange 2. Low grade (stockpiled further from the crusher): Yellow, LG Brown, Purple LG |
| Ore flow and faces | Pit trucks tip ore on the finger for its ore type. Loaders and Komatsu HD325/HD465 trucks rehandle it to the crusher. **Ore types change from day to day, and one excavator can load several ore types and waste in a shift.** So each scenario starts from different faces, and grade control calls several face changes per shift (ore to ore, waste to ore, ore to waste). The controller must re-route the unit's trucks each time. Loads already on board finish to their original destination |
| Plants | CIP (main gold extraction), PCP and Argo (mainly recovery). Map annotation only |
| Waste dumps | TSF Projects is the main waste dump. HME waste dump is closed (dumped to its limit); it is drawn as closed and trucks sent there cannot tip |
| Radio | Digital radio: pit on Channel 1, rehandle on Channel 3 |
| FMS | None yet. A Hexagon FMS is being installed and goes live next year. Dispatch is by radio, so the simulator's dispatch aids (wrong-dump warnings, auto-filled dumps) are switched off for Navachab |
| Fatigue | An in-cab fatigue monitoring system is in use. The night scenario includes a monitoring-system alert |
| Drill & blast | A separate department. Recent blasts have been **poorly fragmented**, which slows digging and hurts targets. Modelled as slower loading (about 1.7× dig time) at a unit for a period, reported by the operator on the radio. The controller should rebalance trucks and report it to drill & blast |

## To confirm with the site (placeholders in use)

| # | Item | Placeholder now | What to get |
|---|---|---|---|
| 1 | Pit and road layout | Schematic Main Pit: PB3 at the bottom, PB4 west, PB5 east, PB6 north-west; one main ramp | Current pit plan: ramps, pushback access roads, intersections, give-ways |
| 3 | Faces used in the scenarios | Starting faces — day: EX04 MC Blue, EX05 FW Green, NEX14002 MC Red; storm: EX04 Lime, EX05 Purple HG, NEX14002 FW Red; night: EX04 Brown, EX05 Yellow, NEX14002 MC Blue. Changes — day: EX05 → LG Brown, EX07 waste → Orange 1, EX04 → waste; storm: EX04 → MC Red, NEX14002 → waste; night: NEX14002 → Purple HG, EX03 waste → Orange 2, EX05 → waste | Whether these are realistic combinations for the pushbacks, and how often faces typically change in a shift |
| 4 | ROM pad layout | Near fingers in rows beside the crusher; Yellow, LG Brown and Purple LG about 1.3 km further | Finger positions and distances; what "DM" means for Purple DM |
| 5 | Ramp gradients | Not modelled directly (the model uses truck speeds and road lengths) | 20–30° was quoted for the permanent ramps. That is 36–58%, far steeper than haul trucks can drive (typically 8–10%, about 5–6°). Is 20–30° the pit wall or batter angle? What gradient are the haul ramps? |
| 5a | EX03 target and truck availability | EX03 (Hitachi EX1900) assumed 14 loads/h. 8 trucks unavailable per shift (placeholder list) | EX03's hourly target, and how many trucks are typically unavailable per shift |
| 6 | NEX14002 assignment | PB3 ore (MC Red) with 5 trucks | Which pushback and face the Trollope CAT 6015B works, whether it loads ore or waste, and whether it is dispatched like the QKR units |
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
