/*
 * Mine model built from a site layout: road network, loading units, dump
 * points and routing. Each site profile (js/sites/*.js) supplies a layout.
 *
 * Layout shape:
 *   width, height          map extent in map units
 *   metersPerUnit          converts map units to haul distance
 *   nodes   { id: {x, y, label?} }
 *   edges   [[a, b, {ramp, upFrom}?]]   upFrom = low end of a ramp
 *   shovels [{id, name, material: 'ore'|'waste', grade, label, loadSec, safePos?}]
 *   dumps   [{id, name, short, role: 'crusher'|'stockpile'|'waste', bays, dumpSec}]
 *   base    node id of the workshop / fuel bay / go-line
 *   pits    [{cx, cy, rx, ry, label?, floorShift?}]  (drawing only)
 *   speeds  optional overrides of DEFAULT_SPEEDS (m/s)
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

  const DEFAULT_SPEEDS = {
    emptyFlat: 10, emptyDownRamp: 7, emptyUpRamp: 8,
    loadedFlat: 8, loadedUpRamp: 4, loadedDownRamp: 5
  };

  function createMine(layout) {
    const NODES = layout.nodes;
    const EDGES = layout.edges;
    const SHOVELS = layout.shovels;
    const DUMPS = layout.dumps;
    const BASE = layout.base;
    const SPEEDS = Object.assign({}, DEFAULT_SPEEDS, layout.speeds || {});
    const metersPerUnit = layout.metersPerUnit || 1;

    const adjacency = {};
    const edgeIndex = {};
    const pathCache = {};
    const key = (a, b) => a + '|' + b;

    for (const id of Object.keys(NODES)) adjacency[id] = [];
    for (const [a, b, opts] of EDGES) {
      if (!NODES[a] || !NODES[b]) throw new Error('Road ' + a + '-' + b + ' references an unknown node');
      const len = Math.hypot(NODES[a].x - NODES[b].x, NODES[a].y - NODES[b].y) * metersPerUnit;
      const info = Object.assign({ a, b, len, ramp: false, upFrom: null }, opts || {});
      edgeIndex[key(a, b)] = info;
      edgeIndex[key(b, a)] = info;
      adjacency[a].push(b);
      adjacency[b].push(a);
    }
    for (const x of SHOVELS.concat(DUMPS)) {
      if (!NODES[x.id]) throw new Error('Layout has no node for ' + x.id);
    }
    if (!DUMPS.some((d) => d.role === 'crusher')) throw new Error('Layout needs a crusher dump');
    if (!DUMPS.some((d) => d.role === 'waste')) throw new Error('Layout needs a waste dump');

    function edge(a, b) {
      const e = edgeIndex[key(a, b)];
      if (!e) throw new Error('No road between ' + a + ' and ' + b);
      return e;
    }

    // Dijkstra on road length; site networks are small so a linear scan is fine.
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

    const dumpsByRole = (role) => DUMPS.filter((d) => d.role === role);

    return {
      MAP_WIDTH: layout.width,
      MAP_HEIGHT: layout.height,
      METERS_PER_UNIT: metersPerUnit,
      NODES, EDGES, SHOVELS, DUMPS, BASE, SPEEDS,
      PITS: layout.pits || [],
      edge, shortestPath, routeLength, segmentSpeed, travelSeconds,
      dumpsByRole,
      crusher: () => dumpsByRole('crusher')[0],
      stockpile: () => dumpsByRole('stockpile')[0] || null,
      wasteDump: () => dumpsByRole('waste')[0]
    };
  }

  return { createMine, DEFAULT_SPEEDS };
});
