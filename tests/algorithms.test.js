// Run with: npm test   (uses Node's built-in test runner, no dependencies)
const test = require("node:test");
const assert = require("node:assert/strict");
const { ALGORITHMS, MinHeap } = require("../js/algorithms.js");
const { recursiveDivision, randomWalls, seeded } = require("../js/maze.js");

/** Build a grid from ASCII art: S start, E end, # wall, digits 2-9 weight. */
function fromAscii(lines) {
  const rows = lines.length, cols = lines[0].length;
  let start, end;
  lines.forEach((line, r) =>
    [...line].forEach((ch, c) => {
      if (ch === "S") start = [r, c];
      if (ch === "E") end = [r, c];
    })
  );
  return {
    rows, cols, start, end,
    isWall: (r, c) => lines[r][c] === "#",
    weight: (r, c) => (/[2-9]/.test(lines[r][c]) ? Number(lines[r][c]) : 1),
  };
}

function assertValidPath(grid, path) {
  assert.deepEqual(path[0], grid.start, "path starts at start");
  assert.deepEqual(path[path.length - 1], grid.end, "path ends at end");
  for (let i = 1; i < path.length; i++) {
    const [r1, c1] = path[i - 1], [r2, c2] = path[i];
    assert.equal(Math.abs(r1 - r2) + Math.abs(c1 - c2), 1, "steps are adjacent");
    assert.ok(!grid.isWall(r2, c2), "path never goes through a wall");
  }
}

const open = fromAscii([
  "S.......",
  "........",
  "........",
  ".......E",
]);

const walled = fromAscii([
  "S.#.....",
  "..#.##..",
  "..#..#..",
  "....#..E",
]);

const weighted = fromAscii([
  "S9999E",
  "......",
]);

const blocked = fromAscii([
  "S.#...",
  "..#..E",
]);

for (const [id, algo] of Object.entries(ALGORITHMS)) {
  test(`${id}: finds a valid path on an open grid`, () => {
    const res = algo.run(open);
    assertValidPath(open, res.path);
  });

  test(`${id}: finds a valid path around walls`, () => {
    const res = algo.run(walled);
    assertValidPath(walled, res.path);
  });

  test(`${id}: returns an empty path when the goal is unreachable`, () => {
    const res = algo.run(blocked);
    assert.deepEqual(res.path, []);
    assert.equal(res.cost, Infinity);
  });

  test(`${id}: start equal to end gives a one-cell path`, () => {
    const g = fromAscii(["S.."]);
    g.end = g.start;
    const res = algo.run(g);
    assert.deepEqual(res.path, [[0, 0]]);
    assert.equal(res.cost, 0);
  });
}

test("optimal algorithms find the shortest path on an open grid", () => {
  for (const id of ["astar", "dijkstra", "bfs"]) {
    const res = ALGORITHMS[id].run(open);
    assert.equal(res.path.length - 1, 3 + 7, `${id} uses the Manhattan distance`);
  }
});

test("weighted algorithms avoid heavy cells; BFS walks straight through them", () => {
  // Straight across costs 9+9+9+9+1 = 37; going around the bottom costs 7.
  for (const id of ["astar", "dijkstra"]) {
    assert.equal(ALGORITHMS[id].run(weighted).cost, 7, id);
  }
  assert.equal(ALGORITHMS.bfs.run(weighted).path.length - 1, 5);
});

test("A* explores no more cells than Dijkstra", () => {
  const a = ALGORITHMS.astar.run(open).visited.length;
  const d = ALGORITHMS.dijkstra.run(open).visited.length;
  assert.ok(a <= d, `A* visited ${a}, Dijkstra visited ${d}`);
});

test("A* and Dijkstra agree on cost over many random grids", () => {
  const rand = seeded(42);
  for (let trial = 0; trial < 200; trial++) {
    const rows = 12, cols = 20;
    const wallSet = new Set(randomWalls(rows, cols, 0.25, rand).map(([r, c]) => r * cols + c));
    const weights = new Map();
    for (let i = 0; i < 40; i++) weights.set(Math.floor(rand() * rows * cols), 2 + Math.floor(rand() * 8));
    const start = [0, 0], end = [rows - 1, cols - 1];
    wallSet.delete(0); wallSet.delete(rows * cols - 1);
    const grid = {
      rows, cols, start, end,
      isWall: (r, c) => wallSet.has(r * cols + c),
      weight: (r, c) => weights.get(r * cols + c) || 1,
    };
    const a = ALGORITHMS.astar.run(grid), d = ALGORITHMS.dijkstra.run(grid);
    assert.equal(a.cost, d.cost, `trial ${trial}`);
    if (a.path.length) assertValidPath(grid, a.path);
  }
});

test("MinHeap pops in priority order", () => {
  const h = new MinHeap();
  [5, 1, 4, 2, 3, 0].forEach((p) => h.push(p, p));
  const out = [];
  while (h.size) out.push(h.pop());
  assert.deepEqual(out, [0, 1, 2, 3, 4, 5]);
});

test("recursive division leaves every open cell reachable", () => {
  for (const seed of [1, 2, 3, 7, 99]) {
    const rows = 21, cols = 41;
    const walls = new Set(recursiveDivision(rows, cols, seeded(seed)).map(([r, c]) => r * cols + c));
    const openCells = [];
    for (let k = 0; k < rows * cols; k++) if (!walls.has(k)) openCells.push(k);
    const seen = new Set([openCells[0]]);
    const queue = [openCells[0]];
    while (queue.length) {
      const k = queue.pop();
      const r = Math.floor(k / cols), c = k % cols;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr, nc = c + dc, nk = nr * cols + nc;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || walls.has(nk) || seen.has(nk)) continue;
        seen.add(nk);
        queue.push(nk);
      }
    }
    assert.equal(seen.size, openCells.length, `seed ${seed}`);
  }
});
