/* global Algorithms, Mazes */
(function () {
  "use strict";

  const { ALGORITHMS } = Algorithms;
  const WEIGHT_COST = 5;
  const SPEEDS = { 1: [1, 1], 2: [2, 1], 3: [5, 2], 4: [14, 3], 5: [40, 6] }; // [visited/frame, path/frame]

  const $ = (id) => document.getElementById(id);
  const gridEl = $("grid");
  const algoSelect = $("algoSelect");
  const mazeSelect = $("mazeSelect");
  const speedInput = $("speed");
  const runBtn = $("runBtn");
  const compareBtn = $("compareBtn");
  const toolButtons = [...document.querySelectorAll(".segmented button")];

  const state = {
    rows: 0, cols: 0,
    cells: [],          // DOM elements, index = r * cols + c
    walls: null,        // Uint8Array
    weights: null,      // Uint8Array
    start: [0, 0], end: [0, 0],
    tool: "wall",
    busy: false,        // animating a search or maze
    token: 0,           // bumped to cancel an animation
    hasRun: false,      // after a run, edits recompute the path instantly
  };

  const idx = (r, c) => r * state.cols + c;
  const odd = (x) => Math.max(1, x % 2 ? x : x - 1);
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];

  /* ------------------------------------------------------------------ grid */

  function measure() {
    const cell = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell")) || 26;
    const width = gridEl.parentElement.clientWidth - 2;
    const top = gridEl.getBoundingClientRect().top + window.scrollY;
    const avail = window.innerHeight - top - 70;
    let cols = Math.floor((width + 1) / (cell + 1));
    let rows = Math.floor((avail + 1) / (cell + 1));
    cols = Math.min(Math.max(cols, 11), 61);
    rows = Math.min(Math.max(rows, 13), 27);
    if (cols % 2 === 0) cols--;
    if (rows % 2 === 0) rows--;
    return { rows, cols };
  }

  function buildGrid(keep = false) {
    const { rows, cols } = measure();
    const old = keep ? { ...state, walls: state.walls, weights: state.weights } : null;

    state.rows = rows;
    state.cols = cols;
    state.walls = new Uint8Array(rows * cols);
    state.weights = new Uint8Array(rows * cols);

    if (old && old.walls) {
      for (let r = 0; r < Math.min(rows, old.rows); r++)
        for (let c = 0; c < Math.min(cols, old.cols); c++) {
          state.walls[r * cols + c] = old.walls[r * old.cols + c];
          state.weights[r * cols + c] = old.weights[r * old.cols + c];
        }
    }
    const inBounds = (p) => p[0] < rows && p[1] < cols;
    if (!old || !inBounds(old.start) || !inBounds(old.end)) {
      const mid = odd(Math.floor(rows / 2));
      state.start = [mid, odd(Math.floor(cols / 5))];
      state.end = [mid, odd(cols - 1 - Math.floor(cols / 5))];
    }
    for (const p of [state.start, state.end]) {
      state.walls[idx(...p)] = 0;
      state.weights[idx(...p)] = 0;
    }

    gridEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
    const frag = document.createDocumentFragment();
    state.cells = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const el = document.createElement("div");
        el.className = "cell";
        el.dataset.i = r * cols + c;
        state.cells.push(el);
        frag.appendChild(el);
      }
    gridEl.replaceChildren(frag);
    for (let i = 0; i < state.cells.length; i++) paintCell(i);
  }

  function paintCell(i) {
    const el = state.cells[i];
    const r = Math.floor(i / state.cols), c = i % state.cols;
    el.classList.toggle("wall", !!state.walls[i]);
    el.classList.toggle("weight", !!state.weights[i]);
    el.classList.toggle("start", same([r, c], state.start));
    el.classList.toggle("end", same([r, c], state.end));
  }

  function gridModel() {
    const { rows, cols, start, end, walls, weights } = state;
    return {
      rows, cols, start, end,
      isWall: (r, c) => walls[r * cols + c] === 1,
      weight: (r, c) => (weights[r * cols + c] ? WEIGHT_COST : 1),
    };
  }

  /* ----------------------------------------------------------- run search */

  function clearPathVisuals() {
    state.token++;
    for (const el of state.cells) el.classList.remove("visited", "path", "instant");
  }

  function setBusy(b) {
    state.busy = b;
    runBtn.disabled = b;
    compareBtn.disabled = b;
    algoSelect.disabled = b;
    mazeSelect.disabled = b;
  }

  function compute(id) {
    const algo = ALGORITHMS[id];
    const grid = gridModel();
    const t0 = performance.now();
    const res = algo.run(grid);
    res.ms = performance.now() - t0;
    return res;
  }

  function showStats(res) {
    $("statVisited").textContent = res.visited.length.toLocaleString();
    const found = res.path.length > 0;
    $("statLength").textContent = found ? res.path.length - 1 : "No path";
    $("statCost").textContent = found ? res.cost : "–";
    $("statTime").textContent = res.ms < 0.1 ? "<0.1 ms" : `${res.ms.toFixed(2)} ms`;
  }

  function resetStats() {
    for (const id of ["statVisited", "statLength", "statCost", "statTime"]) $(id).textContent = "–";
  }

  function drawInstant(res) {
    clearPathVisuals();
    for (const [r, c] of res.visited) state.cells[idx(r, c)].classList.add("visited", "instant");
    for (const [r, c] of res.path) state.cells[idx(r, c)].classList.add("path", "instant");
    showStats(res);
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  async function visualize() {
    if (state.busy) return;
    $("comparePanel").hidden = true;
    const res = compute(algoSelect.value);
    clearPathVisuals();
    resetStats();
    const token = state.token;
    setBusy(true);

    const [vStep] = SPEEDS[speedInput.value];
    for (let i = 0; i < res.visited.length; i += vStep) {
      if (token !== state.token) return setBusy(false);
      for (let j = i; j < Math.min(i + vStep, res.visited.length); j++) {
        const [r, c] = res.visited[j];
        state.cells[idx(r, c)].classList.add("visited");
      }
      $("statVisited").textContent = Math.min(i + vStep, res.visited.length).toLocaleString();
      await nextFrame();
    }

    const [, pStep] = SPEEDS[speedInput.value];
    for (let i = 0; i < res.path.length; i += pStep) {
      if (token !== state.token) return setBusy(false);
      for (let j = i; j < Math.min(i + pStep, res.path.length); j++) {
        const [r, c] = res.path[j];
        state.cells[idx(r, c)].classList.add("path");
      }
      await nextFrame();
      await nextFrame();
    }

    showStats(res);
    state.hasRun = true;
    setBusy(false);
    if (!res.path.length) toast("No path found. The target is walled off.");
  }

  function rerunIfNeeded() {
    if (state.hasRun && !state.busy) drawInstant(compute(algoSelect.value));
  }

  /* -------------------------------------------------------------- compare */

  function compareAll() {
    if (state.busy) return;
    const rows = Object.keys(ALGORITHMS).map((id) => {
      // Best of 5 runs gives a steadier timing than a single run.
      let best = null;
      for (let k = 0; k < 5; k++) {
        const res = compute(id);
        if (!best || res.ms < best.ms) best = res;
      }
      return { id, res: best };
    });

    const found = rows.filter((x) => x.res.path.length);
    const minVisited = Math.min(...rows.map((x) => x.res.visited.length));
    const minCost = found.length ? Math.min(...found.map((x) => x.res.cost)) : Infinity;
    const minLen = found.length ? Math.min(...found.map((x) => x.res.path.length)) : Infinity;

    const body = $("compareBody");
    body.replaceChildren();
    for (const { id, res } of rows) {
      const tr = document.createElement("tr");
      const ok = res.path.length > 0;
      const cells = [
        [ALGORITHMS[id].name, ""],
        [res.visited.length.toLocaleString(), res.visited.length === minVisited ? "num best" : "num"],
        [ok ? res.path.length - 1 : "–", ok && res.path.length === minLen ? "num best" : "num"],
        [ok ? res.cost : "–", ok && res.cost === minCost ? "num best" : "num"],
        [ok ? (res.cost === minCost ? "Yes" : "No") : "No path", ok && res.cost === minCost ? "best" : ""],
        [res.ms < 0.1 ? "<0.1 ms" : `${res.ms.toFixed(2)} ms`, "num"],
      ];
      for (const [text, cls] of cells) {
        const td = document.createElement("td");
        td.textContent = text;
        if (cls) td.className = cls;
        tr.appendChild(td);
      }
      tr.title = "Show this algorithm on the grid";
      tr.addEventListener("click", () => {
        algoSelect.value = id;
        updateInfo();
        drawInstant(res);
        state.hasRun = true;
        gridEl.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      body.appendChild(tr);
    }

    // Show the currently selected algorithm's result on the grid too.
    drawInstant(rows.find((x) => x.id === algoSelect.value).res);
    state.hasRun = true;
    const panel = $("comparePanel");
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ----------------------------------------------------------------- maze */

  async function generate(kind) {
    if (state.busy || !kind) return;
    clearPathVisuals();
    resetStats();
    state.hasRun = false;
    $("comparePanel").hidden = true;
    state.walls.fill(0);
    state.weights.fill(0);
    for (let i = 0; i < state.cells.length; i++) paintCell(i);

    const { rows, cols } = state;
    let list, target;
    if (kind === "division") {
      // Open cells in this maze sit on odd coordinates, so snap start/end there.
      state.start = [odd(state.start[0]), odd(state.start[1])];
      state.end = [odd(state.end[0]), odd(state.end[1])];
      if (same(state.start, state.end)) state.end = [odd(rows - 2), odd(cols - 2)];
      for (let i = 0; i < state.cells.length; i++) paintCell(i);
      list = Mazes.recursiveDivision(rows, cols);
      target = state.walls;
    } else if (kind === "random") {
      list = Mazes.randomWalls(rows, cols, 0.28);
      target = state.walls;
    } else {
      list = Mazes.randomWeights(rows, cols, 0.3);
      target = state.weights;
    }

    const token = state.token;
    setBusy(true);
    const perFrame = Math.max(4, Math.ceil(list.length / 90));
    for (let i = 0; i < list.length; i += perFrame) {
      if (token !== state.token) break;
      for (let j = i; j < Math.min(i + perFrame, list.length); j++) {
        const p = list[j];
        if (same(p, state.start) || same(p, state.end)) continue;
        const k = idx(...p);
        target[k] = 1;
        paintCell(k);
      }
      await nextFrame();
    }
    setBusy(false);
    mazeSelect.value = "";
  }

  /* ------------------------------------------------------------- drawing */

  let drag = null; // { kind: "start" | "end" | "paint", value, last }

  function cellAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest(".cell");
    return cell && gridEl.contains(cell) ? Number(cell.dataset.i) : null;
  }

  function applyPaint(i) {
    const r = Math.floor(i / state.cols), c = i % state.cols;
    if (same([r, c], state.start) || same([r, c], state.end)) return;
    if (drag.value === "wall") { state.walls[i] = 1; state.weights[i] = 0; }
    else if (drag.value === "weight") { state.weights[i] = 1; state.walls[i] = 0; }
    else { state.walls[i] = 0; state.weights[i] = 0; }
    paintCell(i);
  }

  function moveEndpoint(which, i) {
    const r = Math.floor(i / state.cols), c = i % state.cols;
    const other = which === "start" ? state.end : state.start;
    if (state.walls[i] || same([r, c], other)) return;
    const prev = state[which];
    state[which] = [r, c];
    paintCell(idx(...prev));
    paintCell(i);
  }

  gridEl.addEventListener("pointerdown", (e) => {
    if (state.busy || e.button > 0) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null) return;
    e.preventDefault();
    gridEl.setPointerCapture(e.pointerId);
    const r = Math.floor(i / state.cols), c = i % state.cols;

    if (same([r, c], state.start)) drag = { kind: "start", last: i };
    else if (same([r, c], state.end)) drag = { kind: "end", last: i };
    else {
      // Clicking a cell that already has the current tool's mark erases it.
      let value = state.tool;
      if (value === "wall" && state.walls[i]) value = "erase";
      if (value === "weight" && state.weights[i]) value = "erase";
      drag = { kind: "paint", value, last: i };
      applyPaint(i);
      rerunIfNeeded();
    }
    if (drag.kind !== "paint") gridEl.classList.add("dragging");
  });

  gridEl.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null || i === drag.last) return;
    drag.last = i;
    if (drag.kind === "paint") applyPaint(i);
    else moveEndpoint(drag.kind, i);
    rerunIfNeeded();
  });

  const endDrag = () => {
    drag = null;
    gridEl.classList.remove("dragging");
  };
  gridEl.addEventListener("pointerup", endDrag);
  gridEl.addEventListener("pointercancel", endDrag);

  /* ------------------------------------------------------------ controls */

  function updateInfo() {
    const a = ALGORITHMS[algoSelect.value];
    $("algoName").textContent = a.name;
    $("algoBlurb").textContent = a.blurb;
    const badges = $("algoBadges");
    badges.replaceChildren();
    for (const [text, good] of [
      [a.weighted ? "Weighted" : "Unweighted", a.weighted],
      [a.optimal ? "Shortest path guaranteed" : "Not always shortest", a.optimal],
    ]) {
      const span = document.createElement("span");
      span.className = "badge" + (good ? " good" : "");
      span.textContent = text;
      badges.appendChild(span);
    }
  }

  function setTool(tool) {
    state.tool = tool;
    for (const b of toolButtons) b.setAttribute("aria-checked", String(b.dataset.tool === tool));
  }

  function clearPath() {
    clearPathVisuals();
    resetStats();
    state.hasRun = false;
    setBusy(false);
  }

  function reset() {
    clearPath();
    $("comparePanel").hidden = true;
    state.start = [0, 0];
    state.walls = null;
    buildGrid(false);
  }

  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
  }

  runBtn.addEventListener("click", visualize);
  compareBtn.addEventListener("click", compareAll);
  $("clearPathBtn").addEventListener("click", clearPath);
  $("resetBtn").addEventListener("click", reset);
  mazeSelect.addEventListener("change", () => generate(mazeSelect.value));
  algoSelect.addEventListener("change", () => { updateInfo(); rerunIfNeeded(); });
  for (const b of toolButtons) b.addEventListener("click", () => setTool(b.dataset.tool));
  $("helpBtn").addEventListener("click", () => $("helpDialog").showModal());

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || $("helpDialog").open) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "SELECT" || tag === "INPUT") return;
    const k = e.key.toLowerCase();
    if (k === " ") { e.preventDefault(); visualize(); }
    else if (k === "c") clearPath();
    else if (k === "r") reset();
    else if (k === "1") setTool("wall");
    else if (k === "2") setTool("weight");
    else if (k === "3") setTool("erase");
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.busy) return;
      const { rows, cols } = measure();
      if (rows === state.rows && cols === state.cols) return;
      const wasRun = state.hasRun;
      buildGrid(true);
      if (wasRun) drawInstant(compute(algoSelect.value));
    }, 200);
  });

  updateInfo();
  buildGrid(false);
})();
