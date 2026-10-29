/**
 * Maze generators. Each returns walls as an ordered list of [r, c] so the UI
 * can animate them being drawn. Callers should skip the start and end cells.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Mazes = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const randInt = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

  /**
   * Recursive division: split the grid with a wall that has one gap, then
   * repeat inside each half. Walls sit on even indexes and gaps on odd ones,
   * so a later wall can never block an earlier gap and every open cell stays reachable.
   */
  function recursiveDivision(rows, cols, rand = Math.random) {
    const walls = [];
    for (let c = 0; c < cols; c++) walls.push([0, c]);
    for (let r = 1; r < rows; r++) walls.push([r, cols - 1]);
    for (let c = cols - 2; c >= 0; c--) walls.push([rows - 1, c]);
    for (let r = rows - 2; r > 0; r--) walls.push([r, 0]);

    (function divide(r0, r1, c0, c1) {
      const h = r1 - r0 + 1, w = c1 - c0 + 1;
      if (h < 3 || w < 3) return;
      const horizontal = h > w ? true : w > h ? false : rand() < 0.5;

      if (horizontal) {
        const evens = [];
        for (let r = r0 + 1; r < r1; r++) if (r % 2 === 0) evens.push(r);
        const odds = [];
        for (let c = c0; c <= c1; c++) if (c % 2 === 1) odds.push(c);
        if (!evens.length || !odds.length) return;
        const wr = evens[randInt(rand, 0, evens.length - 1)];
        const gap = odds[randInt(rand, 0, odds.length - 1)];
        for (let c = c0; c <= c1; c++) if (c !== gap) walls.push([wr, c]);
        divide(r0, wr - 1, c0, c1);
        divide(wr + 1, r1, c0, c1);
      } else {
        const evens = [];
        for (let c = c0 + 1; c < c1; c++) if (c % 2 === 0) evens.push(c);
        const odds = [];
        for (let r = r0; r <= r1; r++) if (r % 2 === 1) odds.push(r);
        if (!evens.length || !odds.length) return;
        const wc = evens[randInt(rand, 0, evens.length - 1)];
        const gap = odds[randInt(rand, 0, odds.length - 1)];
        for (let r = r0; r <= r1; r++) if (r !== gap) walls.push([r, wc]);
        divide(r0, r1, c0, wc - 1);
        divide(r0, r1, wc + 1, c1);
      }
    })(1, rows - 2, 1, cols - 2);

    return walls;
  }

  /** Scatter walls randomly over roughly `density` of the grid. */
  function randomWalls(rows, cols, density = 0.28, rand = Math.random) {
    const walls = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (rand() < density) walls.push([r, c]);
    // Shuffle so the animation sparkles in rather than sweeping row by row.
    for (let i = walls.length - 1; i > 0; i--) {
      const j = randInt(rand, 0, i);
      [walls[i], walls[j]] = [walls[j], walls[i]];
    }
    return walls;
  }

  /** Scatter weights (heavy terrain) instead of walls. */
  function randomWeights(rows, cols, density = 0.3, rand = Math.random) {
    return randomWalls(rows, cols, density, rand);
  }

  /** Small seeded random generator so tests are repeatable. */
  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return { recursiveDivision, randomWalls, randomWeights, seeded };
});
