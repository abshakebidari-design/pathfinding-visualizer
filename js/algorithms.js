/**
 * Pathfinding algorithms on a 2D grid.
 *
 * Every algorithm takes the same input and returns the same output, so the UI
 * can animate any of them the same way:
 *
 *   input:  grid = { rows, cols, start: [r, c], end: [r, c],
 *                    isWall(r, c) -> bool, weight(r, c) -> number >= 1 }
 *   output: { visited: [[r, c], ...],   // order in which cells were explored
 *             path:    [[r, c], ...],   // start -> end, or [] if unreachable
 *             cost:    number }         // total weight of the path (Infinity if none)
 *
 * Movement is 4-directional (up, right, down, left). Entering a cell costs its weight.
 * Works in the browser (window.Algorithms) and in Node (module.exports) for testing.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Algorithms = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];

  /** Minimal binary min-heap keyed by priority. */
  class MinHeap {
    constructor() { this.items = []; }
    get size() { return this.items.length; }
    push(value, priority, tie = 0) {
      const a = this.items;
      a.push({ value, priority, tie });
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!less(a[i], a[p])) break;
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      }
    }
    pop() {
      const a = this.items;
      const top = a[0];
      const last = a.pop();
      if (a.length > 0) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < a.length && less(a[l], a[m])) m = l;
          if (r < a.length && less(a[r], a[m])) m = r;
          if (m === i) break;
          [a[i], a[m]] = [a[m], a[i]];
          i = m;
        }
      }
      return top.value;
    }
  }
  function less(x, y) {
    return x.priority < y.priority || (x.priority === y.priority && x.tie < y.tie);
  }

  const key = (r, c, cols) => r * cols + c;

  function neighbors(grid, r, c) {
    const out = [];
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < grid.rows && nc >= 0 && nc < grid.cols && !grid.isWall(nr, nc)) {
        out.push([nr, nc]);
      }
    }
    return out;
  }

  function buildPath(grid, parent) {
    const { cols, start, end } = grid;
    const path = [];
    let k = key(end[0], end[1], cols);
    const s = key(start[0], start[1], cols);
    if (k !== s && !parent.has(k)) return { path: [], cost: Infinity };
    let cost = 0;
    while (k !== undefined) {
      const r = Math.floor(k / cols), c = k % cols;
      path.push([r, c]);
      if (k === s) break;
      cost += grid.weight(r, c);
      k = parent.get(k);
    }
    return { path: path.reverse(), cost };
  }

  const manhattan = (r, c, end) => Math.abs(r - end[0]) + Math.abs(c - end[1]);

  /** Breadth-first search: shortest path by number of steps (ignores weights). */
  function bfs(grid) {
    const { cols, start, end } = grid;
    const seen = new Set([key(start[0], start[1], cols)]);
    const parent = new Map();
    const visited = [];
    const queue = [start];
    let head = 0;
    while (head < queue.length) {
      const [r, c] = queue[head++];
      visited.push([r, c]);
      if (r === end[0] && c === end[1]) break;
      for (const [nr, nc] of neighbors(grid, r, c)) {
        const k = key(nr, nc, cols);
        if (seen.has(k)) continue;
        seen.add(k);
        parent.set(k, key(r, c, cols));
        queue.push([nr, nc]);
      }
    }
    return { visited, ...buildPath(grid, parent) };
  }

  /** Depth-first search: finds *a* path, usually not the shortest. */
  function dfs(grid) {
    const { cols, start, end } = grid;
    const seen = new Set();
    const parent = new Map();
    const visited = [];
    const stack = [start];
    while (stack.length) {
      const [r, c] = stack.pop();
      const k = key(r, c, cols);
      if (seen.has(k)) continue;
      seen.add(k);
      visited.push([r, c]);
      if (r === end[0] && c === end[1]) break;
      // Push in reverse so the first direction (up) is explored first.
      const ns = neighbors(grid, r, c);
      for (let i = ns.length - 1; i >= 0; i--) {
        const [nr, nc] = ns[i];
        const nk = key(nr, nc, cols);
        if (!seen.has(nk)) {
          parent.set(nk, k);
          stack.push([nr, nc]);
        }
      }
    }
    return { visited, ...buildPath(grid, parent) };
  }

  /**
   * Shared best-first search. priority(g, r, c) decides the algorithm:
   *   Dijkstra -> g             (cheapest so far)
   *   A*       -> g + h         (cheapest so far + estimate to goal)
   *   Greedy   -> h             (closest-looking to goal)
   */
  function bestFirst(grid, priority) {
    const { cols, start, end } = grid;
    const sk = key(start[0], start[1], cols);
    const dist = new Map([[sk, 0]]);
    const parent = new Map();
    const closed = new Set();
    const visited = [];
    const heap = new MinHeap();
    let counter = 0;
    heap.push(start, priority(0, start[0], start[1]), counter++);
    while (heap.size) {
      const [r, c] = heap.pop();
      const k = key(r, c, cols);
      if (closed.has(k)) continue;
      closed.add(k);
      visited.push([r, c]);
      if (r === end[0] && c === end[1]) break;
      const g = dist.get(k);
      for (const [nr, nc] of neighbors(grid, r, c)) {
        const nk = key(nr, nc, cols);
        if (closed.has(nk)) continue;
        const ng = g + grid.weight(nr, nc);
        if (!dist.has(nk) || ng < dist.get(nk)) {
          dist.set(nk, ng);
          parent.set(nk, k);
          heap.push([nr, nc], priority(ng, nr, nc), counter++);
        }
      }
    }
    return { visited, ...buildPath(grid, parent) };
  }

  const dijkstra = (grid) => bestFirst(grid, (g) => g);
  const astar = (grid) => bestFirst(grid, (g, r, c) => g + manhattan(r, c, grid.end));
  const greedy = (grid) => bestFirst(grid, (g, r, c) => manhattan(r, c, grid.end));

  const ALGORITHMS = {
    astar: {
      run: astar, name: "A* Search", weighted: true, optimal: true,
      blurb: "Uses distance-so-far plus a straight-line guess to the goal. Weighted and guarantees the shortest path, usually exploring far fewer cells than Dijkstra.",
    },
    dijkstra: {
      run: dijkstra, name: "Dijkstra's Algorithm", weighted: true, optimal: true,
      blurb: "Always expands the cheapest cell found so far. Weighted and guarantees the shortest path, but explores in every direction.",
    },
    bfs: {
      run: bfs, name: "Breadth-First Search", weighted: false, optimal: true,
      blurb: "Explores layer by layer. Ignores weights; guarantees the fewest steps.",
    },
    greedy: {
      run: greedy, name: "Greedy Best-First", weighted: true, optimal: false,
      blurb: "Rushes toward whatever looks closest to the goal. Very fast, but the path is not guaranteed to be shortest.",
    },
    dfs: {
      run: dfs, name: "Depth-First Search", weighted: false, optimal: false,
      blurb: "Follows one direction as far as it can before backtracking. Ignores weights; paths are usually long and winding.",
    },
  };

  return { ALGORITHMS, bfs, dfs, dijkstra, astar, greedy, MinHeap };
});
