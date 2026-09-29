# Site profiles: modelling a new mine

Each mine is one file in `js/sites/`. That file describes the mine's layout, fleet, commodity and scenarios. The engine, scoring, console and assessor dashboard are shared by every site, so onboarding a new customer means writing and calibrating one profile.

## Onboarding a mine

1. **Collect site data** using the data sheet template (`docs/sites/navachab-data-sheet.md` is a worked example). Ask for:
   - a plan of the pits and haul roads,
   - the fleet list,
   - loading units and their faces,
   - dump points,
   - grade specification,
   - shift times and targets,
   - the TARPs (trigger action response plans) and procedures that cover the scenario events.
2. **Copy a profile.** Copy `js/sites/navachab.js` to `js/sites/<site-id>.js`, then change its `id`, `name`, `location` and the other fields.
3. **Register it.** Add a `<script src="js/sites/<site-id>.js"></script>` line to `index.html`. Also add a `require('../js/sites/<site-id>.js')` line to `tests/sim.test.js`.
4. **Calibrate.** Run `npm test`, which runs the expert, passive and reckless reference controllers on every scenario. Set each scenario's `targets` to about what the expert controller produces (see "Calibration" below). Adjust the scenario until:
   - the expert is *Recommended*,
   - the passive and reckless controllers are *Not suitable*,
   - the gap between expert and passive is at least 30 points.
5. **Review with the site.** Walk a senior pit controller or the mining superintendent through every radio call. Change the wording and the ratings to match their procedures.
6. **Mark it confirmed.** Once the site has signed off the parameters, set `status: 'confirmed'` and remove `statusNote`. The draft banner then disappears.
7. **Ship a locked build.** In `js/config.js`, set `defaultSite: '<site-id>'` and `lockSite: true`. That customer's copy then only shows their mine.

## Profile reference

```js
lib.registerSite({
  id: 'navachab',                    // unique, used in saved results
  name: 'QKR Navachab Gold Mine',
  operator: '…', location: '…',
  status: 'draft' | 'confirmed' | 'demo',
  statusNote: 'Shown as a banner while the profile is a draft',
  commodity: { name: 'Gold', gradeUnit: 'g/t Au', gradeDecimals: 2 },
  fleet: {                            // single class: { payloadT, truckClass }
    count: 34,                        // mixed fleets: one entry per model/owner
    classes: {
      HD785:   { name: 'Komatsu HD785', payloadT: 91, owner: 'QKR Navachab', tag: 'QKR', speedFactor: 1 },
      CAT777E: { name: 'CAT 777E', payloadT: 91, owner: 'Eitavelo Mining (contractor)', tag: 'Eitavelo' }
    }
  },
  gradeControl: 'blend' | 'stockpiles',
                                      // blend: trucks tip ore into the crusher, scored on feed blend
                                      // stockpiles: trucks tip on ROM fingers by grade class
                                      //   (a separate rehandle crew feeds the plant), scored on routing
  oreTypes: [{ id: 'MCB', name: 'MC Blue', color: '#3b82f6', tier: 'high', far? }, …],
                                      // stockpile mode: named ore types, one ROM finger each
  dispatchAids: false,                // no FMS on site: no wrong-dump warnings or auto dumps
  utilisationRange: [0.1, 0.35],      // truck-limited sites: utilisation scored on a lower scale
  runUnits: 3,                        // units normally running; scenarios list them in \`running\`
  startOrder: ['EX08', …],            // order the reference controller starts parked units
  planWeights: { EX03: 7, … },        // balanced trucks per unit (used by the expert bot)
  oreDumpFor: { EX04: 'ROMH', … },    // stockpile mode: planned finger per ore unit
  wasteDumpFor: { EX03: 'NWRD', … },  // default waste dump per waste unit
  queueAllowanceMin: 3,               // expected queueing when the fleet exceeds loading capacity
  layout: { … },                      // see below
  scenarios: [ … ]
});
```

### Layout

| Field | Meaning |
|---|---|
| `width`, `height` | Map extent in map units |
| `metersPerUnit` | Converts map distances to haul metres. Tune it so cycle times match the site's |
| `nodes` | `{ id: { x, y, label? } }`. Every loading unit and dump needs a node with the same id |
| `edges` | `[a, b, { ramp: true, upFrom: 'lowerNode', closed: true, lengthM: 1700 }?]`. `lengthM` sets the real road length when the map is only a schematic (e.g. deep pits with long ramps). Ramp segments slow loaded trucks going uphill. Closed roads (areas not yet released) are drawn but never used for haulage |
| `shovels` | `{ id, name, material: 'ore' \| 'waste', oreClass?: 'hg' \| 'lg', grade, label, loadSec, safePos? }`. `safePos` is where the unit trams to for a blast |
| `dumps` | `{ id, name, short, role: 'crusher' \| 'stockpile' \| 'waste', gradeClass?, bays, dumpSec }`. Needs a crusher or ore stockpile, and at least one waste dump. `gradeClass` marks a ROM finger |
| `base` | Node id of the workshop, fuel bay and go-line |
| shovel `targetPerHour` | Hourly loading target per unit. When set, fleet efficiency scores each running unit's loads/h against it |
| class `payloadRange` | e.g. `[90, 100]`: each load's tonnes are drawn from this range |
| `pits` | Ellipses drawn as benches: `{ cx, cy, rx, ry, floorShift?, label? }` |
| `features`, `areas` | Map annotations only: boxes such as the plant `{ x, y, w, h, label }`, and labels such as pushbacks `{ x, y, label }` |
| `speeds` | Optional truck speed overrides in m/s (`emptyFlat`, `loadedUpRamp`, …) |

To trace a real mine plan: use the pit plan image in a drawing tool, place nodes at junctions, ramp ends, loading faces and dumps, and read off pixel coordinates. The map is a schematic, so it doesn't need to be to survey accuracy. What matters is that haul distances and cycle times are realistic.

### Scenarios

A scenario can also set `running: ['EX04', …]` (other units start parked and can be started with `startUnit`), `unavailable: { N19: 'In workshop' }` (trucks out for the whole shift), `shovelStatus` and `faces`. A scenario has: `id`, `name`, `durationMin`, `startClockMin`, `speed`, `summary`, `briefing[]`, `blend {min, max}`, `targets {ore, waste}`, `fleet` and `events[]`. Build `fleet` with `lib.scenarioLib.fleet(plan)`, or with `mixedFleet(groups, plan)` for owner and contractor fleets, which interleaves the trucks across loading units. Setting `practice: true` marks the unranked practice shift. Every site needs a practice shift.

Event types (the `at` field is minutes from the start of the shift):

| Type | Fields |
|---|---|
| `alert` | `level`, `text` |
| `radio` | Use the builders in `lib.scenarioLib`, or write your own: `from`, `message`, `options[{ text, rating, feedback, effects?, severity? }]`, `timeout?`, `timeoutEffects?` |
| `shovelDown` | `shovel`, `minutes`, `reason` |
| `crusherDown` | `minutes`, `reason` |
| `fragmentation` | `shovel`, `factor` (e.g. 1.7× dig time), `minutes`. A poorly fragmented block slows a unit; pair with `fragmentationCall` |
| `dumpDown` | `dump`, `minutes`, `reason`. Closes any tip, e.g. a ROM finger. A dump with `closed: '<reason>'` in the layout is closed for the whole shift |
| `faceChange` (alias `oreChange`) | `shovel`, `oreType` (an ore type id, or `'waste'`). Grade control moves a unit onto a new face: another ore type, waste, or from waste back to ore. Loads already on board keep their destination, and the controller must re-route the rest (pair it with `gradeControlCall`). Scenarios can set starting faces with `faces: { EX04: 'MCB', EX07: 'waste' }` |
| `shovelReady` | `shovel`, `minTrucks`, `text`. Releases a unit that started with `shovelStatus: { ID: 'commissioning' }` on the scenario |
| `truckBreakdown` | `truck`, `minutes`, `text`, `radio?` |
| `fuelLow` | `truck`, `minutes`, `radio?` |
| `blast` | `shovel`, `blastIn`, `guard`, `reentry`, `radius` (the shovel needs a `safePos`) |
| `standDown` | `minutes`, `reason`, `text`. Parks the whole pit, e.g. for a lightning TARP |
| `available` | `trucks[]`, `text`. Parked trucks become available to assign |
| `violation` | `severity`, `category`, `text`. Usually used as a follow-up with `when: { flag, is }` |

Radio option effects: `hold`, `evacuate`, `speed`, `fuel`, `flag`, `violation`, `alert`, `shovelDown`.

Radio call builders in the library: `lvCrossing`, `fatigue`, `breakdownRadio`, `fuelRadio`, `rain`, `geotech`, `nearMiss`, `windrow`, `unknownLv`, `waterCart`, `lightningWarning`, `lightningCab`, `dust`, `contractorPriority`, `contractorAuthorisation`, `channelDiscipline`, `rehandleClosure`, `unreleasedArea`, `fatigueAlarm`, `gradeControlCall`, `closedDumpRequest`, `equipmentWarning` (plus `…FollowUp` consequences).

## Calibration

The scripted expert controller in `tests/bots.js` rebalances the fleet whenever availability changes, handles blasts, fuel and outages, and gives the best radio answer. To measure what it produces for your site, run:

```
node -e "
require('./js/sites/<site-id>.js');
const {getSite}=require('./js/sim/library.js'); const bots=require('./tests/bots.js');
const site=getSite('<site-id>');
for (const sc of site.scenarios) { const {summary:s,result:r}=bots.run(site, sc, bots.expertController);
  console.log(sc.id, Math.round(s.totals.oreCrusher+s.totals.oreRom), Math.round(s.totals.waste), r.overall); }"
```

Set `targets` to roughly those tonnes, rounded down slightly. A strong human controller should then land near 100% of target.

## Confidentiality

Site profiles contain customer operational data and their procedures. Keep each customer's profile out of other customers' builds, and agree with the customer how that data may be used.
