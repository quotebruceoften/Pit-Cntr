/*
 * Mine layout: road network, loading units (shovels), dump points and routing.
 * Coordinates are map units; METERS_PER_UNIT converts them to haul distances.
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

  const METERS_PER_UNIT = 0.7;
  const MAP_WIDTH = 3200;
  const MAP_HEIGHT = 2200;

  const NODES = {
    CR: { x: 380, y: 300, label: 'Crusher' },
    ROM: { x: 700, y: 160, label: 'ROM Pad' },
    WD: { x: 2820, y: 330, label: 'Waste Dump' },
    WS: { x: 1600, y: 150, label: 'Workshop / Fuel / Go-line' },
    J1: { x: 820, y: 480 },
    J3: { x: 1600, y: 470 },
    J2: { x: 2300, y: 500 },
    RT: { x: 1450, y: 760, label: 'Ramp top' },
    RM: { x: 1950, y: 1080 },
    RB: { x: 1400, y: 1420, label: 'Pit floor' },
    J4: { x: 900, y: 1600 },
    J5: { x: 2100, y: 1640 },
    S1: { x: 560, y: 1860 },
    S2: { x: 2520, y: 1900 },
    S3: { x: 1480, y: 1950 }
  };

  // [a, b, options]. upFrom marks the low end of a ramp segment.
  const EDGES = [
    ['CR', 'J1'],
    ['ROM', 'J1'],
    ['J1', 'J3'],
    ['J3', 'WS'],
    ['J3', 'J2'],
    ['J2', 'WD'],
    ['J3', 'RT'],
    ['RT', 'RM', { ramp: true, upFrom: 'RM' }],
    ['RM', 'RB', { ramp: true, upFrom: 'RB' }],
    ['RB', 'J4'],
    ['J4', 'S1'],
    ['RB', 'J5'],
    ['J5', 'S2'],
    ['RB', 'S3']
  ];

  const SHOVELS = [
    { id: 'S1', name: 'Shovel S1', material: 'ore', grade: 2.1, label: 'High-grade ore', loadSec: 150 },
    { id: 'S2', name: 'Shovel S2', material: 'ore', grade: 0.8, label: 'Low-grade ore', loadSec: 150, safePos: { x: 2150, y: 1700 } },
    { id: 'S3', name: 'Excavator S3', material: 'waste', grade: 0, label: 'Waste', loadSec: 120 }
  ];

  const DUMPS = [
    { id: 'CR', name: 'Primary Crusher', accepts: 'ore', bays: 1, dumpSec: 60 },
    { id: 'ROM', name: 'ROM Stockpile', accepts: 'ore', bays: 2, dumpSec: 45 },
    { id: 'WD', name: 'Waste Dump', accepts: 'waste', bays: 3, dumpSec: 45 }
  ];

  const BASE = 'WS';

  // Truck speeds in metres per second.
  const SPEEDS = {
    emptyFlat: 10, emptyDownRamp: 7, emptyUpRamp: 8,
    loadedFlat: 8, loadedUpRamp: 4, loadedDownRamp: 5
  };

  const adjacency = {};
  const edgeIndex = {};

  function key(a, b) { return a + '|' + b; }

  for (const id of Object.keys(NODES)) adjacency[id] = [];
  for (const [a, b, opts] of EDGES) {
    const dx = NODES[a].x - NODES[b].x;
    const dy = NODES[a].y - NODES[b].y;
    const len = Math.hypot(dx, dy) * METERS_PER_UNIT;
    const info = Object.assign({ a, b, len, ramp: false, upFrom: null }, opts || {});
    edgeIndex[key(a, b)] = info;
    edgeIndex[key(b, a)] = info;
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  function edge(a, b) {
    const e = edgeIndex[key(a, b)];
    if (!e) throw new Error('No road between ' + a + ' and ' + b);
    return e;
  }

  const pathCache = {};

  // Dijkstra on road length; the network is tiny so a linear scan is fine.
  function shortestPath(from, to) {
    const k = key(from, to);
    if (pathCache[k]) return pathCache[k].slice();
    const dist = {};
    const prev = {};
    const open = new Set(Object.keys(NODES));
    for (const id of open) dist[id] = Infinity;
    dist[from] = 0;
    while (open.size) {
      let u = null;
      for (const id of open) if (u === null || dist[id] < dist[u]) u = id;
      open.delete(u);
      if (u === to || dist[u] === Infinity) break;
      for (const v of adjacency[u]) {
        const alt = dist[u] + edge(u, v).len;
        if (alt < dist[v]) { dist[v] = alt; prev[v] = u; }
      }
    }
    if (dist[to] === Infinity) throw new Error('No route ' + from + ' -> ' + to);
    const path = [to];
    while (path[0] !== from) path.unshift(prev[path[0]]);
    pathCache[k] = path;
    return path.slice();
  }

  function routeLength(path) {
    let len = 0;
    for (let i = 0; i < path.length - 1; i++) len += edge(path[i], path[i + 1]).len;
    return len;
  }

  function segmentSpeed(a, b, loaded) {
    const e = edge(a, b);
    if (!e.ramp) return loaded ? SPEEDS.loadedFlat : SPEEDS.emptyFlat;
    const uphill = e.upFrom === a;
    if (loaded) return uphill ? SPEEDS.loadedUpRamp : SPEEDS.loadedDownRamp;
    return uphill ? SPEEDS.emptyUpRamp : SPEEDS.emptyDownRamp;
  }

  function travelSeconds(path, loaded) {
    let s = 0;
    for (let i = 0; i < path.length - 1; i++) {
      s += edge(path[i], path[i + 1]).len / segmentSpeed(path[i], path[i + 1], loaded);
    }
    return s;
  }

  return {
    METERS_PER_UNIT, MAP_WIDTH, MAP_HEIGHT, NODES, EDGES, SHOVELS, DUMPS, BASE, SPEEDS,
    edge, shortestPath, routeLength, segmentSpeed, travelSeconds
  };
});
