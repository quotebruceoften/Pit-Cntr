# QKR Navachab: site data sheet

Status: **DRAFT**. The profile in `js/sites/navachab.js` runs and is calibrated. Fleet, loading units, pushbacks, ore flow and radio channels are confirmed by site staff; the pit geometry, face assignments, grades, targets and procedures are still placeholders. The table below shows what came from public sources and what needs confirming. It also doubles as the data-collection template for onboarding any other mine.

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
| Loading units | EX03 Hitachi EX1900 · EX04 Hitachi EX1200 · EX05, EX07, EX08 Komatsu PC2000 · EX10 Komatsu PC2000 (new, being assembled in the workshop; starts as "Workshop" and is released mid-shift in the day scenario) · NEX1400 CAT 350 (Trollope Mining) |
| QKR haul fleet | 20 × Komatsu HD785, fleet numbers 16, 17, 19, 22, 25, 26, 27, 29, 33, 35, 36, 42–50 |
| Contractor haul fleet | Eitavelo Mining: 14 × CAT 777E, fleet numbers 71, 41–53 |
| Dispatch | Pit control dispatches all 34 trucks as one fleet on shared loading units |
| Ore flow | Pit trucks tip ore on stockpiles at the crusher (ROM pad). Loaders and Komatsu HD325/HD465 trucks rehandle it to the crusher. Grade control is therefore scored as ore reaching the correct ROM finger, not as a crusher blend |
| Radio | Digital radio: pit on Channel 1, rehandle on Channel 3 |
| Fleet management | An FMS is in use |

## To confirm with the site (placeholders in use)

| # | Item | Placeholder now | What to get |
|---|---|---|---|
| 1 | Pit and road layout | Schematic Main Pit: PB3 at the bottom, PB4 west, PB5 east, PB6 north-west; one switchback main ramp | Current pit plan showing ramps, pushback access roads, intersections and give-ways |
| 2 | Haul distances and cycle times | Hauls of about 1.5–2.5 km | Typical haul distance and cycle time per circuit (from the FMS) |
| 3 | Truck callsigns and payloads | Numbers are real; the "HT" (QKR) and "EV" (Eitavelo) prefixes are placeholders, since both fleets use 42–50. 91 t nominal payload for both | How trucks are called on the radio and shown in the FMS (e.g. "Q42" / "E42"?), and target payloads |
| 4 | Unit face assignments | EX03 PB5 waste · EX04 PB3 HG ore · EX05 PB4 LG ore · EX07 PB4 waste · EX08 PB5 waste · EX10 PB5 waste once released · NEX1400 PB3 selective HG ore | Which pushback and face each unit is on, and whether it is loading ore or waste. Typical load times per unit |
| 5 | NEX1400 role | Modelled as a slow, selective ore loader (about 5.5 min per HD785 load) | What the Trollope CAT 350 actually does (selective ore mining, clean-up, loading which trucks?) |
| 6 | ROM pad fingers | HG finger, LG finger and an HG overflow tip | Actual finger names and grade classes (HG / MG / LG / marginal?), and the procedure when a finger is closed |
| 7 | Face grades | HG 2.6 and 2.4 g/t, LG 0.9 g/t (display only) | Typical grades per class |
| 8 | Waste dumps | North WRD and East WRD | Actual waste dump and tip names, and which pushback goes where |
| 9 | Targets | Shift targets calibrated from the expert controller | Planned shift tonnes for ore and waste |
| 10 | Shift pattern | 06:00 day shift, 18:00 night shift | Shift start times, crib times and handover practice |
| 11 | Lightning TARP | Warning at about 10 km: stop explosives work, get people on foot under cover. Stand-down within 5 km: park the fleet, operators stay in cabs | Exact trigger distances, levels and required actions |
| 12 | Geotech TARP | Radar alarm leads to immediate evacuation and an exclusion zone | Radar/prism trigger levels and response steps; which walls are monitored |
| 13 | Blast procedure | 10-min guard period, all-clear from pit control, 20-min re-entry | Guard times, exclusion distances, who gives the all-clear, re-entry rules |
| 14 | Light-vehicle rules | Positive radio communication before entering or crossing haul roads | LV rules, flags and beacons, call-up procedures |
| 15 | Fatigue management | Stop safely and send a relief operator | Fatigue procedure and any fatigue-detection system in use |
| 16 | Controller coordination | Rehandle controller calls pit control to close a ROM tip; rehandle trucks that call on Channel 1 are sent to Channel 3 | How the two controllers coordinate (radio, phone, FMS) and who owns the ROM pad tip heads |
| 17 | Contractor rules | Contractor supervisor asks by radio; the same authorisation (VOC) rules apply to both fleets | How pit control and the Eitavelo and Trollope supervisors communicate, and any contract rules that affect dispatch |
| 18 | FMS | Assignment by hand in the simulator's fleet table | Which FMS it is, and whether controllers assign trucks manually or the FMS auto-dispatches (this changes what the assessment should test) |

## Before using this for real hiring at Navachab

- Get items 11–15 checked by the safety or training department. Radio answers are scored as "best" or "unsafe" against these procedures.
- Get a senior pit controller to do a practice run and give feedback on realism.
- Run a pilot with 3–5 existing pit controllers to check the scores match their known ability.
- Then set `status: 'confirmed'` in the profile.
