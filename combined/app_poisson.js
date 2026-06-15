const CASES = [
  {
    id: "case1",
    name: "样例 1：海岛裁片",
    source: "assets/poisson/cases/case1_source.png",
    target: "assets/poisson/cases/case1_target.png",
    mask: [
      [152, 24],
      [222, 24],
      [305, 55],
      [318, 99],
      [279, 136],
      [185, 140],
      [126, 99],
      [116, 58],
    ],
    paste: [100, 92],
    repairMask: [
      [332, 110],
      [398, 122],
      [448, 172],
      [430, 222],
      [355, 207],
      [312, 155],
    ],
  },
  {
    id: "case2",
    name: "样例 2：花朵到织物",
    source: "assets/poisson/cases/case2_source.png",
    target: "assets/poisson/cases/case2_target.png",
    mask: [
      [137, 100],
      [176, 64],
      [232, 66],
      [272, 104],
      [266, 160],
      [224, 198],
      [166, 191],
      [126, 152],
    ],
    paste: [172, 62],
    repairMask: [
      [329, 98],
      [415, 103],
      [444, 168],
      [386, 225],
      [315, 191],
    ],
  },
  {
    id: "case3",
    name: "样例 3：霓虹标志到砖墙",
    source: "assets/poisson/cases/case3_source.png",
    target: "assets/poisson/cases/case3_target.png",
    mask: [
      [210, 27],
      [244, 84],
      [307, 77],
      [262, 128],
      [298, 204],
      [214, 173],
      [135, 207],
      [164, 134],
      [105, 84],
      [177, 88],
    ],
    paste: [156, 72],
    repairMask: [
      [116, 136],
      [211, 103],
      [278, 132],
      [254, 202],
      [158, 226],
      [94, 187],
    ],
  },
  {
    id: "case4",
    name: "样例 4：鱼到水面",
    source: "assets/poisson/cases/case4_source.png",
    target: "assets/poisson/cases/case4_target.png",
    mask: [
      [145, 113],
      [197, 70],
      [280, 92],
      [357, 101],
      [340, 139],
      [358, 180],
      [286, 190],
      [214, 203],
      [151, 162],
    ],
    paste: [70, 72],
    repairMask: [
      [38, 42],
      [124, 33],
      [151, 80],
      [107, 119],
      [45, 102],
    ],
  },
  {
    id: "case5",
    name: "加分应用：便签与桌面修复",
    source: "assets/poisson/cases/case5_source.png",
    target: "assets/poisson/cases/case5_target.png",
    mask: [
      [101, 47],
      [324, 51],
      [331, 219],
      [103, 223],
    ],
    paste: [112, 58],
    repairMask: [
      [347, 88],
      [445, 139],
      [508, 221],
      [489, 248],
      [363, 152],
      [337, 108],
    ],
  },
];

const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];
const MAX_MASK_PIXELS = 25000;

const els = {
  caseSelect: document.getElementById("caseSelect"),
  appMode: document.getElementById("appMode"),
  sourceCanvas: document.getElementById("sourceCanvas"),
  resultCanvas: document.getElementById("resultCanvas"),
  naiveCanvas: document.getElementById("naiveCanvas"),
  importCanvas: document.getElementById("importCanvas"),
  mixingCanvas: document.getElementById("mixingCanvas"),
  compareStrip: document.getElementById("compareStrip"),
  runtimeStatus: document.getElementById("runtimeStatus"),
  solveStats: document.getElementById("solveStats"),
  maskStats: document.getElementById("maskStats"),
  matrixStats: document.getElementById("matrixStats"),
  positionStats: document.getElementById("positionStats"),
  naiveCaption: document.getElementById("naiveCaption"),
  importCaption: document.getElementById("importCaption"),
  mixingCaption: document.getElementById("mixingCaption"),
  sourceTitle: document.getElementById("sourceTitle"),
  resultTitle: document.getElementById("resultTitle"),
  dragLabel: document.getElementById("dragLabel"),
  seamStats: document.getElementById("seamStats"),
  presetMaskBtn: document.getElementById("presetMaskBtn"),
  drawMaskBtn: document.getElementById("drawMaskBtn"),
  autoDemoBtn: document.getElementById("autoDemoBtn"),
  recordBtn: document.getElementById("recordBtn"),
  saveFrameBtn: document.getElementById("saveFrameBtn"),
  resetBtn: document.getElementById("resetBtn"),
  compareToggle: document.getElementById("compareToggle"),
  iterationSlider: document.getElementById("iterationSlider"),
  iterationValue: document.getElementById("iterationValue"),
  opacitySlider: document.getElementById("opacitySlider"),
  opacityValue: document.getElementById("opacityValue"),
  textureField: document.getElementById("textureField"),
  textureSlider: document.getElementById("textureSlider"),
  textureValue: document.getElementById("textureValue"),
  recordStats: document.getElementById("recordStats"),
  modeHelpTitle: document.getElementById("modeHelpTitle"),
  modeHelpText: document.getElementById("modeHelpText"),
  modeHelpSteps: document.getElementById("modeHelpSteps"),
};

const missingElements = Object.entries(els)
  .filter(([, element]) => !element)
  .map(([name]) => name);

if (missingElements.length) {
  throw new Error(`Missing required DOM elements: ${missingElements.join(", ")}`);
}

const ctx = {
  source: els.sourceCanvas.getContext("2d", { willReadFrequently: true }),
  result: els.resultCanvas.getContext("2d", { willReadFrequently: true }),
  naive: els.naiveCanvas.getContext("2d"),
  importing: els.importCanvas.getContext("2d"),
  mixing: els.mixingCanvas.getContext("2d"),
};

function isTargetOnlyMode() {
  return state.appMode === "inpaint" || state.appMode === "texture";
}

const state = {
  caseIndex: 0,
  appMode: "clone",
  gradientMode: "import",
  sourceBitmap: null,
  targetBitmap: null,
  sourceData: null,
  targetData: null,
  sourceSize: { w: 0, h: 0 },
  targetSize: { w: 0, h: 0 },
  mask: null,
  plan: null,
  paste: { x: 0, y: 0 },
  drawMode: false,
  drawing: false,
  drawingPoints: [],
  dragging: false,
  dragOffset: { x: 0, y: 0 },
  pending: false,
  latestImport: null,
  latestMixing: null,
  latestTexture: null,
  latestNaive: null,
  recording: false,
  recorder: null,
  chunks: [],
};

for (const [i, item] of CASES.entries()) {
  const option = document.createElement("option");
  option.value = String(i);
  option.textContent = item.name;
  els.caseSelect.append(option);
}

init();

async function init() {
  initMotionEffects();
  bindEvents();
  const params = new URLSearchParams(location.search);
  const initialCase = Math.max(0, Math.min(CASES.length - 1, Number(params.get("case") || 0)));
  if (["inpaint", "texture"].includes(params.get("app"))) {
    state.appMode = params.get("app");
    els.appMode.value = state.appMode;
  }
  if (params.get("gradient") === "mixing") {
    state.gradientMode = "mixing";
    document.querySelectorAll("[data-gradient]").forEach((button) => {
      button.classList.toggle("active", button.dataset.gradient === "mixing");
    });
  }
  await loadCase(Number.isFinite(initialCase) ? initialCase : 0);
  if (await maybeRunSelfTest()) {
    return;
  }
  await maybeRunHeadlessRecording();
}

function initMotionEffects() {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const revealTargets = Array.from(document.querySelectorAll(".reveal, .panel, .case-card, .limit-card, .flow-step"));

  root.classList.add("motion-ready");
  revealTargets.forEach((element, index) => {
    element.style.setProperty("--reveal-delay", `${Math.min(index % 5, 4) * 45}ms`);
  });

  if (!reduceMotion.matches && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    revealTargets.forEach((element) => observer.observe(element));
  } else {
    revealTargets.forEach((element) => element.classList.add("is-visible"));
  }

  const zoomPanel = document.querySelector("[data-zoom-panel]");
  let ticking = false;
  const updateScrollState = () => {
    ticking = false;
    document.body.classList.toggle("is-scrolled", window.scrollY > 24);
    if (!zoomPanel) {
      return;
    }
    const rect = zoomPanel.getBoundingClientRect();
    const viewport = Math.max(1, window.innerHeight);
    const progress = clamp01((viewport * 0.9 - rect.top) / (rect.height + viewport * 0.4));
    root.style.setProperty("--hero-progress", progress.toFixed(3));
  };
  const requestScrollState = () => {
    if (ticking) {
      return;
    }
    ticking = true;
    requestAnimationFrame(updateScrollState);
  };

  window.addEventListener("scroll", requestScrollState, { passive: true });
  window.addEventListener("resize", requestScrollState);
  requestScrollState();

  document.querySelectorAll("[data-open-analysis]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      document.querySelector('.nav-tab[data-tab="analysis"]')?.click();
      requestAnimationFrame(() => {
        document.getElementById("analysis-section")?.scrollIntoView({
          behavior: reduceMotion.matches ? "auto" : "smooth",
          block: "start",
        });
      });
    });
  });
}

function bindEvents() {
  els.caseSelect.addEventListener("change", async () => {
    await loadCase(Number(els.caseSelect.value));
  });

  els.appMode.addEventListener("change", () => {
    state.appMode = els.appMode.value;
    applyPresetMask();
  });

  document.querySelectorAll("[data-gradient]").forEach((button) => {
    button.addEventListener("click", () => {
      state.gradientMode = button.dataset.gradient;
      document.querySelectorAll("[data-gradient]").forEach((b) => b.classList.toggle("active", b === button));
      updateModeHelp();
      scheduleBlend(false);
    });
  });

  els.compareToggle.addEventListener("change", () => {
    els.compareStrip.hidden = !els.compareToggle.checked;
    if (els.compareToggle.checked) {
      updateComparison();
    }
  });

  els.iterationSlider.addEventListener("input", () => {
    els.iterationValue.value = els.iterationSlider.value;
  });

  els.iterationSlider.addEventListener("change", () => scheduleBlend(false));

  els.opacitySlider.addEventListener("input", () => {
    els.opacityValue.value = Number(els.opacitySlider.value).toFixed(2);
    drawSource();
    drawResultOverlay();
  });

  els.textureSlider.addEventListener("input", () => {
    els.textureValue.value = els.textureSlider.value;
    if (state.appMode === "texture") {
      els.dragLabel.textContent = `阈值 ${els.textureSlider.value}`;
    }
  });

  els.textureSlider.addEventListener("change", () => {
    if (state.appMode === "texture") {
      scheduleBlend(false);
    }
  });

  els.presetMaskBtn.addEventListener("click", applyPresetMask);

  els.drawMaskBtn.addEventListener("click", () => {
    state.drawMode = !state.drawMode;
    state.drawing = false;
    state.drawingPoints = [];
    els.drawMaskBtn.textContent = state.drawMode ? "结束绘制" : "绘制选区";
    els.runtimeStatus.textContent = state.drawMode ? "在左侧画布拖动绘制" : "就绪";
    drawSource();
  });

  els.autoDemoBtn.addEventListener("click", runAutoDemo);
  els.recordBtn.addEventListener("click", toggleRecording);
  els.saveFrameBtn.addEventListener("click", saveCurrentFrame);
  els.resetBtn.addEventListener("click", () => loadCase(state.caseIndex));

  els.sourceCanvas.addEventListener("pointerdown", onSourcePointerDown);
  els.sourceCanvas.addEventListener("pointermove", onSourcePointerMove);
  els.sourceCanvas.addEventListener("pointerup", onSourcePointerUp);
  els.sourceCanvas.addEventListener("pointercancel", onSourcePointerUp);

  els.resultCanvas.addEventListener("pointerdown", onResultPointerDown);
  els.resultCanvas.addEventListener("pointermove", onResultPointerMove);
  els.resultCanvas.addEventListener("pointerup", onResultPointerUp);
  els.resultCanvas.addEventListener("pointercancel", onResultPointerUp);
}

async function loadCase(index) {
  state.caseIndex = Number.isFinite(index) ? index : 0;
  els.caseSelect.value = String(state.caseIndex);
  els.runtimeStatus.textContent = "加载图片";
  const item = CASES[state.caseIndex] || CASES[0];
  try {
    const [source, target] = await Promise.all([loadImage(item.source), loadImage(item.target)]);
    state.sourceBitmap = source;
    state.targetBitmap = target;
    state.sourceSize = { w: source.width, h: source.height };
    state.targetSize = { w: target.width, h: target.height };
    state.sourceData = imageToData(source);
    state.targetData = imageToData(target);
    resizeCanvas(els.sourceCanvas, source.width, source.height);
    resizeCanvas(els.resultCanvas, target.width, target.height);
    for (const canvas of [els.naiveCanvas, els.importCanvas, els.mixingCanvas]) {
      resizeCanvas(canvas, target.width, target.height);
    }
    state.drawMode = false;
    state.drawing = false;
    state.drawingPoints = [];
    els.drawMaskBtn.textContent = "绘制选区";
    applyPresetMask();
  } catch (error) {
    console.error(error);
    els.runtimeStatus.textContent = "图片加载失败";
    els.solveStats.textContent = error.message;
    drawLoadError(els.sourceCanvas, error.message);
    drawLoadError(els.resultCanvas, error.message);
  }
}

function applyPresetMask() {
  const item = CASES[state.caseIndex];
  if (isTargetOnlyMode()) {
    resizeCanvas(els.sourceCanvas, state.targetSize.w, state.targetSize.h);
    state.mask = rasterizePolygon(item.repairMask || item.mask, state.targetSize.w, state.targetSize.h);
    state.paste = { x: state.mask.bbox.minX, y: state.mask.bbox.minY };
  } else {
    resizeCanvas(els.sourceCanvas, state.sourceSize.w, state.sourceSize.h);
    state.mask = rasterizePolygon(item.mask, state.sourceSize.w, state.sourceSize.h);
    state.paste = clampPaste({ x: item.paste[0], y: item.paste[1] }, state.mask);
  }
  rebuildPlan();
  drawSource();
  scheduleBlend(false);
}

function rebuildPlan() {
  if (!state.mask) {
    return;
  }
  const data = isTargetOnlyMode() ? state.targetData : state.sourceData;
  state.plan = buildPoissonPlan(state.mask, data);
  state.latestImport = null;
  state.latestMixing = null;
  state.latestTexture = null;
  updatePlanReadout();
}

function buildPoissonPlan(maskObj, imageData) {
  const { width, height, data } = imageData;
  const indexMap = new Int32Array(width * height);
  indexMap.fill(-1);
  const xs = [];
  const ys = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const key = y * width + x;
      if (maskObj.mask[key]) {
        indexMap[key] = xs.length;
        xs.push(x);
        ys.push(y);
      }
    }
  }

  if (xs.length > MAX_MASK_PIXELS) {
    els.runtimeStatus.textContent = `选区过大，已限制为 ${MAX_MASK_PIXELS} px 以内更适合实时`;
  }

  const n = xs.length;
  const neighbors = new Int32Array(n * 4);
  neighbors.fill(-2);
  const diag = new Float32Array(n);
  const srcGrad = new Float32Array(n * 3);

  for (let i = 0; i < n; i += 1) {
    const x = xs[i];
    const y = ys[i];
    const p = (y * width + x) * 4;
    for (let d = 0; d < 4; d += 1) {
      const qx = x + DX[d];
      const qy = y + DY[d];
      if (qx < 0 || qx >= width || qy < 0 || qy >= height) {
        continue;
      }
      const qKey = qy * width + qx;
      const q = qKey * 4;
      diag[i] += 1;
      neighbors[i * 4 + d] = indexMap[qKey];
      for (let c = 0; c < 3; c += 1) {
        srcGrad[i * 3 + c] += data[p + c] - data[q + c];
      }
    }
  }

  return {
    width,
    height,
    count: n,
    bbox: maskObj.bbox,
    xs: Int32Array.from(xs),
    ys: Int32Array.from(ys),
    indexMap,
    neighbors,
    diag,
    srcGrad,
    solutionImport: null,
    solutionMixing: null,
    solutionTexture: null,
  };
}

function scheduleBlend(interactive) {
  if (!state.plan || !state.targetData) {
    return;
  }
  if (state.pending) {
    return;
  }
  state.pending = true;
  requestAnimationFrame(() => {
    state.pending = false;
    blendNow(interactive);
  });
}

function blendNow(interactive) {
  const start = performance.now();
  const iterations = interactive ? Math.min(90, Number(els.iterationSlider.value)) : Number(els.iterationSlider.value);
  let result;

  if (state.appMode === "inpaint") {
    result = solveAndComposite("zero", iterations, interactive);
    state.latestImport = result;
    drawImageData(ctx.result, result.imageData);
  } else if (state.appMode === "texture") {
    result = solveAndComposite("texture", iterations, interactive);
    state.latestTexture = result;
    drawImageData(ctx.result, result.imageData);
  } else {
    const mode = state.gradientMode;
    result = solveAndComposite(mode, iterations, interactive);
    if (mode === "import") {
      state.latestImport = result;
    } else {
      state.latestMixing = result;
    }
    drawImageData(ctx.result, result.imageData);
  }

  drawResultOverlay();
  updateComparison(interactive);
  updateQualityReadout(result.imageData);
  const elapsed = performance.now() - start;
  els.runtimeStatus.textContent = interactive ? "实时更新" : "已完成";
  els.solveStats.textContent = `${iterations} iter / ${elapsed.toFixed(1)} ms`;
  updatePlanReadout();
}

function solveAndComposite(mode, iterations, interactive) {
  const plan = state.plan;
  const n = plan.count;
  const target = state.targetData;
  const rhs = buildRhs(plan, mode, target);
  const solutionKey =
    mode === "mixing" ? "solutionMixing" : mode === "texture" ? "solutionTexture" : "solutionImport";
  let solution = plan[solutionKey];

  if (!solution || solution.length !== n * 3 || !interactive) {
    solution = initialSolution(plan, target);
  }

  solveSor(plan, rhs, solution, iterations);
  plan[solutionKey] = solution;
  const imageData = compositeSolution(plan, solution, target);
  return { imageData, solution, mode };
}

function buildRhs(plan, mode, target) {
  const rhs = new Float32Array(plan.count * 3);
  const source = isTargetOnlyMode() ? state.targetData : state.sourceData;
  const sourceData = source.data;
  const targetData = target.data;
  const targetW = target.width;
  const targetH = target.height;
  const sourceW = source.width;
  const paste = isTargetOnlyMode() ? { x: plan.bbox.minX, y: plan.bbox.minY } : state.paste;
  const textureThreshold = Number(els.textureSlider.value);

  for (let i = 0; i < plan.count; i += 1) {
    const sx = plan.xs[i];
    const sy = plan.ys[i];
    const tx = paste.x + sx - plan.bbox.minX;
    const ty = paste.y + sy - plan.bbox.minY;
    const tp = (ty * targetW + tx) * 4;
    const sp = (sy * sourceW + sx) * 4;

    for (let d = 0; d < 4; d += 1) {
      const qx = sx + DX[d];
      const qy = sy + DY[d];
      const nb = plan.neighbors[i * 4 + d];
      if (nb === -2) {
        continue;
      }
      const tqx = paste.x + qx - plan.bbox.minX;
      const tqy = paste.y + qy - plan.bbox.minY;
      if (tqx < 0 || tqx >= targetW || tqy < 0 || tqy >= targetH) {
        continue;
      }
      const tq = (tqy * targetW + tqx) * 4;
      const sq = (qy * sourceW + qx) * 4;
      const sourceGrad = [
        sourceData[sp] - sourceData[sq],
        sourceData[sp + 1] - sourceData[sq + 1],
        sourceData[sp + 2] - sourceData[sq + 2],
      ];
      const targetGrad = [
        targetData[tp] - targetData[tq],
        targetData[tp + 1] - targetData[tq + 1],
        targetData[tp + 2] - targetData[tq + 2],
      ];
      const sourceMagnitude = Math.hypot(sourceGrad[0], sourceGrad[1], sourceGrad[2]);

      for (let c = 0; c < 3; c += 1) {
        let g = 0;
        if (mode === "import") {
          g = sourceGrad[c];
        } else if (mode === "mixing") {
          const sg = sourceGrad[c];
          const tg = targetGrad[c];
          g = Math.abs(sg) > Math.abs(tg) ? sg : tg;
        } else if (mode === "texture") {
          g = sourceMagnitude >= textureThreshold ? sourceGrad[c] : 0;
        }
        rhs[i * 3 + c] += g;
        if (nb < 0) {
          rhs[i * 3 + c] += targetData[tq + c];
        }
      }
    }
  }

  return rhs;
}

function initialSolution(plan, target) {
  const solution = new Float32Array(plan.count * 3);
  const targetData = target.data;
  const targetW = target.width;
  const paste = isTargetOnlyMode() ? { x: plan.bbox.minX, y: plan.bbox.minY } : state.paste;
  for (let i = 0; i < plan.count; i += 1) {
    const tx = paste.x + plan.xs[i] - plan.bbox.minX;
    const ty = paste.y + plan.ys[i] - plan.bbox.minY;
    const p = (ty * targetW + tx) * 4;
    solution[i * 3] = targetData[p];
    solution[i * 3 + 1] = targetData[p + 1];
    solution[i * 3 + 2] = targetData[p + 2];
  }
  return solution;
}

function solveSor(plan, rhs, solution, iterations) {
  const omega = 1.86;
  const n = plan.count;
  const neighbors = plan.neighbors;
  for (let it = 0; it < iterations; it += 1) {
    for (let i = 0; i < n; i += 1) {
      const diag = plan.diag[i] || 4;
      for (let c = 0; c < 3; c += 1) {
        let sum = rhs[i * 3 + c];
        for (let d = 0; d < 4; d += 1) {
          const nb = neighbors[i * 4 + d];
          if (nb >= 0) {
            sum += solution[nb * 3 + c];
          }
        }
        const pos = i * 3 + c;
        const next = sum / diag;
        solution[pos] += omega * (next - solution[pos]);
      }
    }
  }
}

function compositeSolution(plan, solution, target) {
  const out = new ImageData(new Uint8ClampedArray(target.data), target.width, target.height);
  const paste = isTargetOnlyMode() ? { x: plan.bbox.minX, y: plan.bbox.minY } : state.paste;
  for (let i = 0; i < plan.count; i += 1) {
    const tx = paste.x + plan.xs[i] - plan.bbox.minX;
    const ty = paste.y + plan.ys[i] - plan.bbox.minY;
    if (tx < 0 || tx >= out.width || ty < 0 || ty >= out.height) {
      continue;
    }
    const p = (ty * out.width + tx) * 4;
    out.data[p] = clampByte(solution[i * 3]);
    out.data[p + 1] = clampByte(solution[i * 3 + 1]);
    out.data[p + 2] = clampByte(solution[i * 3 + 2]);
    out.data[p + 3] = 255;
  }
  return out;
}

function updateComparison(interactive = false) {
  if (!els.compareToggle.checked || !state.targetData || !state.plan) {
    return;
  }

  const naive = compositeNaive();
  drawImageData(ctx.naive, naive);

  if (isTargetOnlyMode()) {
    const current = state.latestTexture?.imageData || state.latestImport?.imageData || naive;
    drawImageData(ctx.importing, current);
    drawImageData(ctx.mixing, naive);
    return;
  }

  const oldMode = state.gradientMode;
  const importResult =
    oldMode === "import" && state.latestImport
      ? state.latestImport
      : state.latestImport || (interactive ? null : solveAndComposite("import", 90, true));
  const mixingResult =
    oldMode === "mixing" && state.latestMixing
      ? state.latestMixing
      : state.latestMixing || (interactive ? null : solveAndComposite("mixing", 90, true));
  state.latestImport = importResult;
  state.latestMixing = mixingResult;
  drawImageData(ctx.importing, importResult?.imageData || naive);
  drawImageData(ctx.mixing, mixingResult?.imageData || naive);
}

function compositeNaive() {
  const target = state.targetData;
  const out = new ImageData(new Uint8ClampedArray(target.data), target.width, target.height);
  if (isTargetOnlyMode()) {
    return out;
  }

  const src = state.sourceData;
  const plan = state.plan;
  for (let i = 0; i < plan.count; i += 1) {
    const sx = plan.xs[i];
    const sy = plan.ys[i];
    const tx = state.paste.x + sx - plan.bbox.minX;
    const ty = state.paste.y + sy - plan.bbox.minY;
    if (tx < 0 || tx >= out.width || ty < 0 || ty >= out.height) {
      continue;
    }
    const sp = (sy * src.width + sx) * 4;
    const tp = (ty * out.width + tx) * 4;
    out.data[tp] = src.data[sp];
    out.data[tp + 1] = src.data[sp + 1];
    out.data[tp + 2] = src.data[sp + 2];
    out.data[tp + 3] = 255;
  }
  return out;
}

function drawSource() {
  const canvas = els.sourceCanvas;
  const context = ctx.source;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (isTargetOnlyMode()) {
    context.drawImage(state.targetBitmap, 0, 0);
  } else {
    context.drawImage(state.sourceBitmap, 0, 0);
  }

  if (state.mask) {
    drawMaskOverlay(context, state.mask, "source");
  }

  if (state.drawingPoints.length > 1) {
    context.save();
    context.strokeStyle = "#c44e35";
    context.lineWidth = 2;
    context.setLineDash([6, 4]);
    context.beginPath();
    context.moveTo(state.drawingPoints[0][0], state.drawingPoints[0][1]);
    for (const point of state.drawingPoints.slice(1)) {
      context.lineTo(point[0], point[1]);
    }
    context.stroke();
    context.restore();
  }
}

function drawResultOverlay() {
  if (!state.plan) {
    return;
  }
  const plan = state.plan;
  const context = ctx.result;
  context.save();
  context.strokeStyle = state.appMode === "texture" ? "#d49b25" : state.gradientMode === "mixing" ? "#d49b25" : "#117c73";
  context.lineWidth = 2;
  context.setLineDash([7, 5]);
  context.fillStyle = `rgba(17, 124, 115, ${Number(els.opacitySlider.value) * 0.55})`;
  if (isTargetOnlyMode()) {
    context.fillStyle =
      state.appMode === "texture"
        ? `rgba(212, 155, 37, ${Number(els.opacitySlider.value)})`
        : `rgba(196, 78, 53, ${Number(els.opacitySlider.value)})`;
    drawPolygonPath(context, state.mask.points);
  } else {
    const translated = state.mask.points.map(([x, y]) => [
      state.paste.x + x - plan.bbox.minX,
      state.paste.y + y - plan.bbox.minY,
    ]);
    drawPolygonPath(context, translated);
  }
  context.fill();
  context.stroke();
  context.restore();
  updatePositionReadout();
}

function drawMaskOverlay(context, maskObj) {
  const alpha = Number(els.opacitySlider.value);
  const image = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
  const data = image.data;
  for (let i = 0; i < maskObj.mask.length; i += 1) {
    if (!maskObj.mask[i]) {
      continue;
    }
    const p = i * 4;
    data[p] = Math.round(data[p] * (1 - alpha) + 17 * alpha);
    data[p + 1] = Math.round(data[p + 1] * (1 - alpha) + 124 * alpha);
    data[p + 2] = Math.round(data[p + 2] * (1 - alpha) + 115 * alpha);
  }
  context.putImageData(image, 0, 0);
  context.save();
  context.strokeStyle = "#c44e35";
  context.lineWidth = 2;
  context.strokeRect(
    maskObj.bbox.minX + 0.5,
    maskObj.bbox.minY + 0.5,
    maskObj.bbox.maxX - maskObj.bbox.minX + 1,
    maskObj.bbox.maxY - maskObj.bbox.minY + 1,
  );
  context.restore();
}

function drawPolygonPath(context, points) {
  if (!points || points.length === 0) {
    return;
  }
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    context.lineTo(points[i][0], points[i][1]);
  }
  context.closePath();
}

function rasterizePolygon(points, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "#fff";
  drawPolygonPath(context, points);
  context.fill();
  const raw = context.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const key = y * width + x;
      if (raw[key * 4 + 3] > 0) {
        mask[key] = 1;
        count += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (count === 0) {
    minX = minY = maxX = maxY = 0;
  }
  return { mask, width, height, count, bbox: { minX, minY, maxX, maxY }, points };
}

function onSourcePointerDown(event) {
  if (!state.drawMode) {
    return;
  }
  const p = canvasPoint(els.sourceCanvas, event);
  state.drawing = true;
  state.drawingPoints = [[p.x, p.y]];
  els.sourceCanvas.setPointerCapture(event.pointerId);
  drawSource();
}

function onSourcePointerMove(event) {
  if (!state.drawing) {
    return;
  }
  const p = canvasPoint(els.sourceCanvas, event);
  const last = state.drawingPoints[state.drawingPoints.length - 1];
  if (Math.hypot(p.x - last[0], p.y - last[1]) >= 3) {
    state.drawingPoints.push([p.x, p.y]);
    drawSource();
  }
}

function onSourcePointerUp(event) {
  if (!state.drawing) {
    return;
  }
  state.drawing = false;
  els.sourceCanvas.releasePointerCapture(event.pointerId);
  if (state.drawingPoints.length >= 3) {
    const simplified = simplifyPoints(state.drawingPoints, 2.6);
    const width = isTargetOnlyMode() ? state.targetSize.w : state.sourceSize.w;
    const height = isTargetOnlyMode() ? state.targetSize.h : state.sourceSize.h;
    state.mask = rasterizePolygon(simplified, width, height);
    if (isTargetOnlyMode()) {
      state.paste = { x: state.mask.bbox.minX, y: state.mask.bbox.minY };
    } else {
      state.paste = clampPaste(state.paste, state.mask);
    }
    rebuildPlan();
    drawSource();
    scheduleBlend(false);
  }
}

function onResultPointerDown(event) {
  if (state.appMode !== "clone" || !state.plan) {
    return;
  }
  const p = canvasPoint(els.resultCanvas, event);
  const box = currentTargetBox();
  state.dragging = true;
  state.dragOffset.x = p.x - box.x;
  state.dragOffset.y = p.y - box.y;
  if (!pointInBox(p, box)) {
    state.dragOffset.x = box.w / 2;
    state.dragOffset.y = box.h / 2;
  }
  els.resultCanvas.classList.add("dragging");
  els.resultCanvas.setPointerCapture(event.pointerId);
  onResultPointerMove(event);
}

function onResultPointerMove(event) {
  if (!state.dragging || state.appMode !== "clone") {
    return;
  }
  const p = canvasPoint(els.resultCanvas, event);
  state.paste = clampPaste({ x: p.x - state.dragOffset.x, y: p.y - state.dragOffset.y }, state.mask);
  scheduleBlend(true);
}

function onResultPointerUp(event) {
  if (!state.dragging) {
    return;
  }
  state.dragging = false;
  els.resultCanvas.classList.remove("dragging");
  els.resultCanvas.releasePointerCapture(event.pointerId);
  scheduleBlend(false);
}

function currentTargetBox() {
  const b = state.plan.bbox;
  return {
    x: state.paste.x,
    y: state.paste.y,
    w: b.maxX - b.minX + 1,
    h: b.maxY - b.minY + 1,
  };
}

function pointInBox(p, box) {
  return p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
}

function clampPaste(point, maskObj) {
  if (!maskObj) {
    return { x: Math.round(point.x), y: Math.round(point.y) };
  }
  const width = maskObj.bbox.maxX - maskObj.bbox.minX + 1;
  const height = maskObj.bbox.maxY - maskObj.bbox.minY + 1;
  const margin = 1;
  const maxX = Math.max(margin, state.targetSize.w - width - margin);
  const maxY = Math.max(margin, state.targetSize.h - height - margin);
  return {
    x: Math.round(Math.max(margin, Math.min(maxX, point.x))),
    y: Math.round(Math.max(margin, Math.min(maxY, point.y))),
  };
}

async function runAutoDemo() {
  if (state.appMode !== "clone") {
    state.appMode = "clone";
    els.appMode.value = "clone";
    applyPresetMask();
  }
  els.runtimeStatus.textContent = "自动拖动中";
  const box = currentTargetBox();
  const start = {
    x: Math.max(1, Math.min(state.targetSize.w - box.w - 2, state.paste.x - 70)),
    y: Math.max(1, Math.min(state.targetSize.h - box.h - 2, state.paste.y - 28)),
  };
  const end = {
    x: Math.max(1, Math.min(state.targetSize.w - box.w - 2, state.paste.x + 96)),
    y: Math.max(1, Math.min(state.targetSize.h - box.h - 2, state.paste.y + 58)),
  };
  const frames = 48;
  for (let i = 0; i <= frames; i += 1) {
    const t = i / frames;
    const ease = 0.5 - 0.5 * Math.cos(Math.PI * t);
    state.paste = clampPaste(
      {
        x: start.x * (1 - ease) + end.x * ease,
        y: start.y * (1 - ease) + end.y * ease,
      },
      state.mask,
    );
    blendNow(true);
    await sleep(34);
  }
  blendNow(false);
}

function toggleRecording() {
  if (!("MediaRecorder" in window) || !els.resultCanvas.captureStream) {
    els.recordStats.textContent = "浏览器不支持";
    return;
  }
  if (state.recording) {
    state.recorder.stop();
    return;
  }
  const stream = els.resultCanvas.captureStream(30);
  state.chunks = [];
  const mimeType = preferredMimeType();
  state.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  state.recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      state.chunks.push(event.data);
    }
  };
  state.recorder.onstop = () => {
    const blob = new Blob(state.chunks, { type: state.recorder.mimeType || "video/webm" });
    const url = URL.createObjectURL(blob);
    downloadUrl(url, `poisson_interaction_${Date.now()}.webm`);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    state.recording = false;
    els.recordBtn.classList.remove("recording");
    els.recordBtn.textContent = "录制 WebM";
    els.recordStats.textContent = `${(blob.size / 1024 / 1024).toFixed(2)} MB`;
  };
  state.recorder.start();
  state.recording = true;
  els.recordBtn.classList.add("recording");
  els.recordBtn.textContent = "停止录制";
  els.recordStats.textContent = "录制中";
}

function preferredMimeType() {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function saveCurrentFrame() {
  els.resultCanvas.toBlob((blob) => {
    if (!blob) {
      return;
    }
    const url = URL.createObjectURL(blob);
    downloadUrl(url, `poisson_frame_${Date.now()}.png`);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }, "image/png");
}

function downloadUrl(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
}

function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(canvas.width - 1, (event.clientX - rect.left) * (canvas.width / rect.width))),
    y: Math.max(0, Math.min(canvas.height - 1, (event.clientY - rect.top) * (canvas.height / rect.height))),
  };
}

function imageToData(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Cannot load ${src}. 请确认 index.html 与 assets 目录在同一个 web 文件夹内。`));
    img.src = new URL(src, document.baseURI).href;
  });
}

function resizeCanvas(canvas, width, height) {
  canvas.width = width;
  canvas.height = height;
}

function drawLoadError(canvas, message) {
  resizeCanvas(canvas, 520, 220);
  const context = canvas.getContext("2d");
  context.fillStyle = "#f0eeeb";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#c44e35";
  context.font = "600 16px sans-serif";
  context.fillText("图片加载失败", 24, 58);
  context.fillStyle = "#6b6b6b";
  context.font = "13px sans-serif";
  wrapCanvasText(context, message, 24, 92, canvas.width - 48, 20);
}

function wrapCanvasText(context, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = "";
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (context.measureText(testLine).width > maxWidth && line) {
      context.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  context.fillText(line, x, y);
}

function drawImageData(context, imageData) {
  context.canvas.width = imageData.width;
  context.canvas.height = imageData.height;
  context.putImageData(imageData, 0, 0);
}

function simplifyPoints(points, minDistance) {
  const result = [];
  for (const p of points) {
    if (!result.length || Math.hypot(p[0] - result[result.length - 1][0], p[1] - result[result.length - 1][1]) >= minDistance) {
      result.push([Math.round(p[0]), Math.round(p[1])]);
    }
  }
  return result.slice(0, 420);
}

function updatePlanReadout() {
  if (!state.plan || !state.mask) {
    return;
  }
  const n = state.plan.count;
  const nnz = n + Array.from(state.plan.neighbors).filter((v) => v >= 0).length;
  els.maskStats.textContent = `${n} px`;
  els.matrixStats.textContent = `${n} x ${n}, nnz ${nnz}`;
  els.textureField.hidden = state.appMode !== "texture";
  if (state.appMode === "inpaint") {
    els.sourceTitle.textContent = "待修复图与遮罩";
    els.resultTitle.textContent = "Poisson 修复结果";
    els.dragLabel.textContent = "零梯度填充";
    els.naiveCaption.textContent = "原图";
    els.importCaption.textContent = "修复结果";
    els.mixingCaption.textContent = "边界参考";
  } else if (state.appMode === "texture") {
    els.sourceTitle.textContent = "待压平图与遮罩";
    els.resultTitle.textContent = "Poisson 纹理压平结果";
    els.dragLabel.textContent = `阈值 ${els.textureSlider.value}`;
    els.naiveCaption.textContent = "原图";
    els.importCaption.textContent = "纹理压平";
    els.mixingCaption.textContent = "边界参考";
  } else {
    els.sourceTitle.textContent = "源图与选区";
    els.resultTitle.textContent = "背景与融合结果";
    els.dragLabel.textContent = "拖动融合区域";
    els.naiveCaption.textContent = "直接复制";
    els.importCaption.textContent = "Importing";
    els.mixingCaption.textContent = "Mixing";
  }
  updateModeHelp();
}

function updateModeHelp() {
  let title = "Seamless Cloning";
  let text = "把左侧选区融合到中间背景图。拖动中间虚线区域可以改变粘贴位置。";
  let steps = [
    "先选测试样例，再保留或手绘左侧遮罩。",
    "在中间画布拖动虚线融合区域，松手后会重新精算。",
    `当前梯度策略是 ${state.gradientMode === "mixing" ? "Mixing：优先保留背景纹理" : "Importing：优先保留源图结构"}。`,
  ];

  if (state.appMode === "inpaint") {
    title = "Poisson 修复";
    text = "用目标图自身的边界信息填补遮罩区域，适合演示去除物体或局部修补。";
    steps = [
      "左侧显示待修复图，红色遮罩是要被填补的区域。",
      "点击“绘制选区”可重新圈出待修复区域。",
      "提高迭代次数会更平滑，但处理时间也会增加。",
    ];
  } else if (state.appMode === "texture") {
    title = "纹理压平";
    text = "压低遮罩区域里的细碎纹理梯度，同时尽量保留大轮廓和边界连续性。";
    steps = [
      "左侧遮罩决定哪些区域会被压平。",
      "调节“纹理阈值”：数值越高，越多细节会被压平。",
      "观察中间结果和下方对比，找到细节保留与平滑之间的平衡。",
    ];
  }

  els.modeHelpTitle.textContent = title;
  els.modeHelpText.textContent = text;
  els.modeHelpSteps.replaceChildren(...steps.map((step) => {
    const item = document.createElement("li");
    item.textContent = step;
    return item;
  }));
}

function updatePositionReadout() {
  if (!state.plan) {
    return;
  }
  if (isTargetOnlyMode()) {
    els.positionStats.textContent = `mask (${state.plan.bbox.minX}, ${state.plan.bbox.minY})`;
  } else {
    els.positionStats.textContent = `paste (${state.paste.x}, ${state.paste.y})`;
  }
}

function updateQualityReadout(currentImageData) {
  if (!state.plan || !currentImageData) {
    els.seamStats.textContent = "-";
    return;
  }

  if (state.appMode === "clone") {
    const direct = boundaryJump(compositeNaive());
    const current = boundaryJump(currentImageData);
    const drop = direct > 0 ? Math.max(0, (1 - current / direct) * 100) : 0;
    els.seamStats.textContent = `直接 ${direct.toFixed(1)} / 当前 ${current.toFixed(1)}，降 ${drop.toFixed(0)}%`;
  } else {
    const original = boundaryJump(state.targetData);
    const current = boundaryJump(currentImageData);
    els.seamStats.textContent = `原图 ${original.toFixed(1)} / 当前 ${current.toFixed(1)}`;
  }
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function maybeRunSelfTest() {
  const params = new URLSearchParams(location.search);
  if (!params.has("selftest")) {
    return false;
  }
  const report = [];
  for (let i = 0; i < Math.min(4, CASES.length); i += 1) {
    state.appMode = "clone";
    els.appMode.value = "clone";
    await loadCase(i);
    const t0 = performance.now();
    const naiveResult = compositeNaive();
    const importResult = solveAndComposite("import", 70, false);
    const mixResult = solveAndComposite("mixing", 70, false);
    const changed = meanAbsoluteDifference(importResult.imageData, state.targetData);
    report.push({
      case: CASES[i].id,
      pixels: state.plan.count,
      changed: Number(changed.toFixed(3)),
      timeMs: Number((performance.now() - t0).toFixed(1)),
      seam: {
        direct: Number(boundaryJump(naiveResult).toFixed(2)),
        importing: Number(boundaryJump(importResult.imageData).toFixed(2)),
        mixing: Number(boundaryJump(mixResult.imageData).toFixed(2)),
      },
    });
  }

  state.appMode = "inpaint";
  els.appMode.value = "inpaint";
  await loadCase(4);
  const inpaintStart = performance.now();
  const inpaintResult = solveAndComposite("zero", 100, false);
  const inpaint = {
    case: "case5",
    pixels: state.plan.count,
    changed: Number(meanAbsoluteDifference(inpaintResult.imageData, state.targetData).toFixed(3)),
    timeMs: Number((performance.now() - inpaintStart).toFixed(1)),
  };

  state.appMode = "texture";
  els.appMode.value = "texture";
  await loadCase(2);
  const textureStart = performance.now();
  const textureResult = solveAndComposite("texture", 100, false);
  const texture = {
    case: "case3",
    pixels: state.plan.count,
    threshold: Number(els.textureSlider.value),
    changed: Number(meanAbsoluteDifference(textureResult.imageData, state.targetData).toFixed(3)),
    timeMs: Number((performance.now() - textureStart).toFixed(1)),
  };

  document.body.innerHTML = `<pre id="selftest">${JSON.stringify({ ok: true, report, inpaint, texture }, null, 2)}</pre>`;
  return true;
}

function meanAbsoluteDifference(a, b) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    sum += Math.abs(a.data[i] - b.data[i]);
    sum += Math.abs(a.data[i + 1] - b.data[i + 1]);
    sum += Math.abs(a.data[i + 2] - b.data[i + 2]);
    count += 3;
  }
  return sum / count;
}

function boundaryJump(imageData) {
  const plan = state.plan;
  const paste = isTargetOnlyMode() ? { x: plan.bbox.minX, y: plan.bbox.minY } : state.paste;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < plan.count; i += 1) {
    const tx = paste.x + plan.xs[i] - plan.bbox.minX;
    const ty = paste.y + plan.ys[i] - plan.bbox.minY;
    const p = (ty * imageData.width + tx) * 4;
    for (let d = 0; d < 4; d += 1) {
      const nb = plan.neighbors[i * 4 + d];
      if (nb >= 0 || nb === -2) {
        continue;
      }
      const qx = tx + DX[d];
      const qy = ty + DY[d];
      if (qx < 0 || qx >= imageData.width || qy < 0 || qy >= imageData.height) {
        continue;
      }
      const q = (qy * imageData.width + qx) * 4;
      sum += Math.abs(imageData.data[p] - imageData.data[q]);
      sum += Math.abs(imageData.data[p + 1] - imageData.data[q + 1]);
      sum += Math.abs(imageData.data[p + 2] - imageData.data[q + 2]);
      count += 3;
    }
  }
  return count ? sum / count : 0;
}

async function maybeRunHeadlessRecording() {
  const params = new URLSearchParams(location.search);
  if (!params.has("recordDemo")) {
    return false;
  }
  els.compareToggle.checked = false;
  els.compareStrip.hidden = true;
  const blob = await recordAutoDemoBlob();
  const dataUrl = await blobToDataUrl(blob);
  document.body.innerHTML = `<pre id="recording">${JSON.stringify(
    { ok: true, mime: blob.type, size: blob.size, dataUrl },
    null,
    2,
  )}</pre>`;
  return true;
}

function recordAutoDemoBlob() {
  return new Promise((resolve, reject) => {
    if (!("MediaRecorder" in window) || !els.resultCanvas.captureStream) {
      reject(new Error("MediaRecorder is not available"));
      return;
    }
    const stream = els.resultCanvas.captureStream(24);
    const chunks = [];
    const mimeType = preferredMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onerror = () => reject(recorder.error || new Error("recording failed"));
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
    };
    recorder.start();
    runAutoDemo()
      .then(() => sleep(300))
      .then(() => recorder.stop())
      .catch(reject);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

