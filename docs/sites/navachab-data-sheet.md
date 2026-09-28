# QKR Navachab: site data sheet

Status: **DRAFT**. The profile in `js/sites/navachab.js` runs and is calibrated, but most of its parameters are placeholders. The table below shows what came from public sources and what needs confirming. It also doubles as the data-collection template for onboarding any other mine.

## From public sources

| Item | Value used | Source |
|---|---|---|
| Location | Open pit about 10 km from Karibib, Erongo Region, Namibia | [Wikipedia](https://en.wikipedia.org/wiki/Navachab_Gold_Mine), [namibweb](https://www.namibweb.com/navachab.htm) |
| Owner | QKR Namibia (acquired from AngloGold Ashanti in 2014) | [Wikipedia](https://en.wikipedia.org/wiki/Navachab_Gold_Mine) |
| Pits | Main (central) pit and the Anomaly 16 satellite pit. Gecko is also mentioned | [Mining Data Online](https://miningdataonline.com/property/467/Navachab-Mine.aspx) |
| Processing | Crushing and grinding, gravity, CIP/CIL | [Farmonaut](https://farmonaut.com/mining/qkr-navachab-gold-mine-sustainable-impact-in-namibia-2026), [Lycopodium](https://www.lycopodium.com/case-studies/navachab-gold-mine-plant-expansion/) |
| Cut-off grade | "Of the order of 1.2 g/t". Used to set the plant feed blend spec of 1.3–1.9 g/t (to be confirmed) | [Mining Data Online](https://miningdataonline.com/property/467/Navachab-Mine.aspx) |
| Drilling | Owner-operated drilling fleet (6 × Epiroc FlexiROC D65) | [The Extractor](https://theextractormagazine.com/2024/06/11/namibias-oldest-gold-mine-navachab-takes-over-drill-operations-as-expansion-drive-picks-up-speed/) |
| Climate hazard | Summer thunderstorms and lightning; wind-blown dust | General knowledge of the region |

## To confirm with the site (placeholders in use)

| # | Item | Placeholder now | What to get |
|---|---|---|---|
| 1 | Pit and road layout | Schematic: Main Pit with a switchback ramp, Anomaly 16 to the east, plant to the west | Current pit plan showing haul roads, ramps, intersections and give-ways |
| 2 | Haul distances and cycle times | Hauls of 0.9–2.7 km, cycles of about 8–14 min | Typical haul distance and cycle time for each circuit (from dispatch or FMS data) |
| 3 | Haul trucks | 20 trucks, about 90 t payload, IDs HT01–HT20 | Truck model(s), count, payload and fleet numbering |
| 4 | Loading units | EX1–EX4: 2 on ore, 2 on waste | Models, IDs, typical load times and current face assignments |
| 5 | Face grades | HG 2.6 g/t, LG 0.9 g/t | Typical HG and LG grades being mined |
| 6 | Plant feed spec | 1.3–1.9 g/t Au blend | Target head grade and allowed range, and the blending practice (e.g. ratio of HG to LG loads) |
| 7 | Dumps | Primary crusher (1 tip), LG/ROM stockpile, North WRD, East WRD | Actual tip points, names, number of tip bays, stockpile rules |
| 8 | Strip ratio and targets | About 1.2 : 1 waste to ore; shift targets calibrated from the expert bot | Planned shift tonnes for ore and waste |
| 9 | Shift pattern | 06:00 day shift, 18:00 night shift | Shift start times, crib times and handover practice |
| 10 | Lightning TARP | Warning at about 10 km: stop explosives work, get people on foot under cover. Stand-down within 5 km: park the fleet, operators stay in cabs | Exact trigger distances, levels and required actions |
| 11 | Geotech TARP | Radar alarm leads to immediate evacuation and an exclusion zone | Radar/prism trigger levels and response steps; which walls are monitored |
| 12 | Blast procedure | 10-min guard period, all-clear from pit control, 20-min re-entry | Guard times, exclusion distances, who gives the all-clear, re-entry rules |
| 13 | Light-vehicle rules | Positive radio communication before entering or crossing haul roads | LV rules, flags and beacons, call-up procedures |
| 14 | Fatigue management | Stop safely and send a relief operator | Fatigue procedure and any fatigue-detection system in use |
| 15 | Radio call wording | Generic | Local callsigns, channel names and terminology |
| 16 | Contractor split | Owner fleet only | Whether any pits or fleets are run by contractors, and whether pit control dispatches them |

## Before using this for real hiring at Navachab

- Get items 10–14 checked by the safety or training department. Radio answers are scored as "best" or "unsafe" against these procedures.
- Get a senior pit controller to do a practice run and give feedback on realism.
- Run a pilot with 3–5 existing pit controllers to check the scores match their known ability.
- Then set `status: 'confirmed'` in the profile.
