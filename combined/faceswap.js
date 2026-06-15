const FACE_CASES = {
  face1: {
    name: "人物 A",
    source: "assets/poisson/faces/face1_source.png",
    target: "assets/poisson/faces/face1_target.png",
    preset: {
      source: { cx: 64, cy: 62, rx: 34, ry: 43, angle: 0 },
      target: { cx: 64, cy: 62, rx: 35, ry: 44, angle: 0 },
    },
  },
  face2: {
    name: "人物 B",
    source: "assets/poisson/faces/face2_source.png",
    target: "assets/poisson/faces/face2_target.png",
    preset: {
      source: { cx: 64, cy: 61, rx: 33, ry: 43, angle: 0 },
      target: { cx: 64, cy: 62, rx: 35, ry: 44, angle: 0 },
    },
  },
  face3: {
    name: "人物 C",
    source: "assets/poisson/faces/face3_source.png",
    target: "assets/poisson/faces/face3_target.png",
    preset: {
      source: { cx: 64, cy: 62, rx: 34, ry: 44, angle: 0 },
      target: { cx: 64, cy: 62, rx: 35, ry: 44, angle: 0 },
    },
  },
  face4: {
    name: "人物 D",
    source: "assets/poisson/faces/face4_source.png",
    target: "assets/poisson/faces/face4_target.png",
    preset: {
      source: { cx: 64, cy: 62, rx: 34, ry: 43, angle: 0 },
      target: { cx: 64, cy: 62, rx: 35, ry: 44, angle: 0 },
    },
  },
  public1: {
    name: "公开样例 A：Biden → Trump",
    source: "assets/poisson/faces_centered/biden_crop.jpg",
    target: "assets/poisson/faces_centered/trump_crop.jpg",
    preset: {
      source: { cx: 360, cy: 335, rx: 170, ry: 225, angle: 0 },
      target: { cx: 360, cy: 335, rx: 170, ry: 225, angle: 0 },
    },
  },
  public2: {
    name: "公开样例 B：Trump → Biden",
    source: "assets/poisson/faces_centered/trump_crop.jpg",
    target: "assets/poisson/faces_centered/biden_crop.jpg",
    preset: {
      source: { cx: 360, cy: 335, rx: 170, ry: 225, angle: 0 },
      target: { cx: 360, cy: 335, rx: 170, ry: 225, angle: 0 },
    },
  },
  public3: {
    name: "公开样例 C：Obama → Biden",
    source: "assets/poisson/faces_centered/obama_crop.jpg",
    target: "assets/poisson/faces_centered/biden_crop.jpg",
    preset: {
      source: { cx: 360, cy: 335, rx: 170, ry: 225, angle: 0 },
      target: { cx: 360, cy: 335, rx: 170, ry: 225, angle: 0 },
    },
  },
};

const FACE_API_SCRIPTS = [
  "https://unpkg.com/face-api.js@0.22.2/dist/face-api.min.js",
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/dist/face-api.min.js",
];

const MODEL_URLS = [
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights",
  "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights",
];

const DISPLAY_MAX = 560;
const FACE_FEATHER_RADIUS = 14;
const POISSON_ITERATIONS = 280;
const DETECTOR_OPTIONS = () => new faceapi.TinyFaceDetectorOptions({
  inputSize: 320,
  scoreThreshold: 0.24,
});

const els = {
  status: document.getElementById("status"),
  pairSelect: document.getElementById("pairSelect"),
  sourceCanvas: document.getElementById("sourceCanvas"),
  targetCanvas: document.getElementById("targetCanvas"),
  resultCanvas: document.getElementById("resultCanvas"),
  directCanvas: document.getElementById("directCanvas"),
  alignedCanvas: document.getElementById("alignedCanvas"),
  poissonCanvas: document.getElementById("poissonCanvas"),
  sourceMeta: document.getElementById("sourceMeta"),
  targetMeta: document.getElementById("targetMeta"),
  resultMeta: document.getElementById("resultMeta"),
  sourceUpload: document.getElementById("sourceUpload"),
  targetUpload: document.getElementById("targetUpload"),
  sourceUploadBtn: document.getElementById("sourceUploadBtn"),
  targetUploadBtn: document.getElementById("targetUploadBtn"),
  detectBtn: document.getElementById("detectBtn"),
  blendBtn: document.getElementById("blendBtn"),
  saveBtn: document.getElementById("saveBtn"),
  swapBtn: document.getElementById("swapBtn"),
  landmarksBtn: document.getElementById("landmarksBtn"),
  blendSlider: document.getElementById("blendSlider"),
  blendValue: document.getElementById("blendValue"),
};

const state = {
  sourceImage: null,
  targetImage: null,
  sourceDetection: null,
  targetDetection: null,
  resultImageData: null,
  currentPairId: "face1",
  showLandmarks: true,
  blendRatio: 0.82,
  scriptLoaded: false,
  modelsLoaded: false,
  loadingModels: false,
  useTinyLandmarks: true,
};

init();

function init() {
  bindEvents();
  clearCanvas(els.sourceCanvas, "source");
  clearCanvas(els.targetCanvas, "target");
  clearCanvas(els.resultCanvas, "result");
  clearCanvas(els.directCanvas, "direct");
  clearCanvas(els.alignedCanvas, "aligned");
  clearCanvas(els.poissonCanvas, "poisson");
  loadPair(els.pairSelect.value);
}

function bindEvents() {
  els.pairSelect.addEventListener("change", () => loadPair(els.pairSelect.value));
  els.detectBtn.addEventListener("click", detectCurrentFaces);
  els.blendBtn.addEventListener("click", blendCurrentFaces);
  els.saveBtn.addEventListener("click", saveResult);
  els.sourceUploadBtn.addEventListener("click", () => els.sourceUpload.click());
  els.targetUploadBtn.addEventListener("click", () => els.targetUpload.click());
  els.sourceUpload.addEventListener("change", () => loadUploadedImage("source"));
  els.targetUpload.addEventListener("change", () => loadUploadedImage("target"));
  els.swapBtn.addEventListener("click", swapImages);
  els.landmarksBtn.addEventListener("click", () => {
    state.showLandmarks = !state.showLandmarks;
    els.landmarksBtn.textContent = state.showLandmarks ? "隐藏检测点" : "显示检测点";
    redrawDetectedCanvases();
  });
  els.blendSlider.addEventListener("input", () => {
    state.blendRatio = Number(els.blendSlider.value) / 100;
    els.blendValue.textContent = `${els.blendSlider.value}%`;
    if (state.resultImageData) {
      blendCurrentFaces();
    }
  });
}

async function loadPair(id) {
  const item = FACE_CASES[id] || FACE_CASES.face1;
  setStatus(`正在加载 ${item.name}...`, "busy");
  try {
    const [source, target] = await Promise.all([loadImage(item.source), loadImage(item.target)]);
    state.sourceImage = source;
    state.targetImage = target;
    state.currentPairId = id;
    resetFaceState();
    drawImageToCanvas(els.sourceCanvas, source);
    drawImageToCanvas(els.targetCanvas, target);
    clearCanvas(els.resultCanvas, "result");
    clearCanvas(els.directCanvas, "direct");
    clearCanvas(els.alignedCanvas, "aligned");
    clearCanvas(els.poissonCanvas, "poisson");
    els.sourceMeta.textContent = `${item.name} source · ${source.naturalWidth} x ${source.naturalHeight}`;
    els.targetMeta.textContent = `${item.name} target · ${target.naturalWidth} x ${target.naturalHeight}`;
    els.resultMeta.textContent = "";
    setStatus("图片已加载，可以检测人脸。", "ready");
  } catch (error) {
    setStatus(`图片加载失败：${error.message}`, "error");
  }
}

async function loadUploadedImage(kind) {
  const input = kind === "source" ? els.sourceUpload : els.targetUpload;
  const file = input.files && input.files[0];
  if (!file) {
    return;
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    if (kind === "source") {
      state.sourceImage = image;
      state.sourceDetection = null;
      drawImageToCanvas(els.sourceCanvas, image);
      els.sourceMeta.textContent = `${file.name} · ${image.naturalWidth} x ${image.naturalHeight}`;
    } else {
      state.targetImage = image;
      state.targetDetection = null;
      drawImageToCanvas(els.targetCanvas, image);
      els.targetMeta.textContent = `${file.name} · ${image.naturalWidth} x ${image.naturalHeight}`;
    }
    state.resultImageData = null;
    els.blendBtn.disabled = !hasPresetPair();
    els.saveBtn.disabled = true;
    clearCanvas(els.resultCanvas, "result");
    clearCanvas(els.directCanvas, "direct");
    clearCanvas(els.alignedCanvas, "aligned");
    clearCanvas(els.poissonCanvas, "poisson");
    setStatus("图片已更新，请重新检测人脸。", "ready");
  } catch (error) {
    setStatus(`上传图片读取失败：${error.message}`, "error");
  } finally {
    URL.revokeObjectURL(url);
    input.value = "";
  }
}

function swapImages() {
  const sourceImage = state.sourceImage;
  const sourceDetection = state.sourceDetection;
  const sourceMeta = els.sourceMeta.textContent;
  state.sourceImage = state.targetImage;
  state.sourceDetection = state.targetDetection;
  state.targetImage = sourceImage;
  state.targetDetection = sourceDetection;
  els.sourceMeta.textContent = els.targetMeta.textContent;
  els.targetMeta.textContent = sourceMeta;
  state.resultImageData = null;
  redrawDetectedCanvases();
  clearCanvas(els.resultCanvas, "result");
  clearCanvas(els.directCanvas, "direct");
  clearCanvas(els.alignedCanvas, "aligned");
  clearCanvas(els.poissonCanvas, "poisson");
  els.blendBtn.disabled = !(state.sourceDetection && state.targetDetection) && !hasPresetPair();
  els.saveBtn.disabled = true;
  setStatus(state.sourceDetection && state.targetDetection ? "已交换，可以对齐融合。" : "已交换，请重新检测人脸。", "ready");
}

async function detectCurrentFaces() {
  if (!state.sourceImage || !state.targetImage) {
    setStatus("请先加载源图和目标图。", "error");
    return;
  }
  setStatus("正在加载 face-api.js 与检测模型...", "busy");
  els.detectBtn.disabled = true;
  els.blendBtn.disabled = true;
  try {
    await loadModels();
    setStatus("正在检测人脸...", "busy");
    const [sourceDetection, targetDetection] = await Promise.all([
      detectSingleFace(state.sourceImage),
      detectSingleFace(state.targetImage),
    ]);
    if (!sourceDetection) {
      throw new Error("源图中未检测到人脸。");
    }
    if (!targetDetection) {
      throw new Error("目标图中未检测到人脸。");
    }
    state.sourceDetection = sourceDetection;
    state.targetDetection = targetDetection;
    redrawDetectedCanvases();
    els.sourceMeta.textContent = detectionText("源图", sourceDetection);
    els.targetMeta.textContent = detectionText("目标图", targetDetection);
    els.blendBtn.disabled = false;
    setStatus("检测完成，可以对齐融合。", "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    els.detectBtn.disabled = false;
  }
}

async function blendCurrentFaces() {
  if (!state.sourceDetection || !state.targetDetection) {
    if (hasPresetPair()) {
      blendPresetFaces();
      return;
    }
    setStatus("请先检测两张图片中的人脸。", "error");
    return;
  }
  setStatus("正在对齐与融合...", "busy");
  els.blendBtn.disabled = true;
  try {
    const targetSize = drawImageToCanvas(els.resultCanvas, state.targetImage);
    const targetImageData = getCanvasData(els.resultCanvas);
    const mask = createTargetFaceMask(targetSize);
    const alignedCanvas = alignSourceToTarget(targetSize);
    const alignedData = getCanvasData(alignedCanvas);
    trimMaskBySourceCoverage(mask, alignedData);
    const rawDirect = directBlend(targetImageData, alignedData, mask);
    const matchedData = colorMatchSourceToTarget(alignedData, targetImageData, mask);
    normalizeTransparentPixels(matchedData, targetImageData);
    const alignedPreview = directBlend(targetImageData, matchedData, mask);
    const poisson = poissonBlend(targetImageData, matchedData, mask);
    putCanvasData(els.directCanvas, rawDirect);
    putCanvasData(els.alignedCanvas, alignedPreview);
    putCanvasData(els.poissonCanvas, poisson);
    putCanvasData(els.resultCanvas, poisson);
    state.resultImageData = poisson;
    els.resultMeta.textContent = `${targetSize.width} x ${targetSize.height} · warped mask · blend ${Math.round(state.blendRatio * 100)}%`;
    els.saveBtn.disabled = false;
    setStatus("融合完成。", "success");
  } catch (error) {
    setStatus(`融合失败：${error.message}`, "error");
  } finally {
    els.blendBtn.disabled = false;
  }
}

function hasPresetPair() {
  const item = FACE_CASES[state.currentPairId];
  return Boolean(item && item.preset && state.sourceImage && state.targetImage);
}

function blendPresetFaces() {
  const item = FACE_CASES[state.currentPairId];
  if (!item || !item.preset) {
    setStatus("当前图片没有预设人脸区域，请先检测人脸。", "error");
    return;
  }
  setStatus("使用内置预设区域进行三步融合：直接贴合 -> 对齐调色 -> Poisson 融合。", "busy");
  els.blendBtn.disabled = true;
  try {
    const targetSize = drawImageToCanvas(els.resultCanvas, state.targetImage);
    const targetImageData = getCanvasData(els.resultCanvas);
    const mask = createPresetFaceMask(targetSize, item.preset.target);
    const alignedCanvas = alignPresetSourceToTarget(targetSize, item.preset);
    const alignedData = getCanvasData(alignedCanvas);
    trimMaskBySourceCoverage(mask, alignedData);
    const rawDirect = directBlend(targetImageData, alignedData, mask);
    const matchedData = colorMatchSourceToTarget(alignedData, targetImageData, mask);
    normalizeTransparentPixels(matchedData, targetImageData);
    const alignedPreview = directBlend(targetImageData, matchedData, mask);
    const poisson = poissonBlend(targetImageData, matchedData, mask);
    putCanvasData(els.directCanvas, rawDirect);
    putCanvasData(els.alignedCanvas, alignedPreview);
    putCanvasData(els.poissonCanvas, poisson);
    putCanvasData(els.resultCanvas, poisson);
    state.resultImageData = poisson;
    els.resultMeta.textContent = `${targetSize.width} x ${targetSize.height} · preset ellipse · blend ${Math.round(state.blendRatio * 100)}%`;
    els.saveBtn.disabled = false;
    setStatus("预设融合完成。下方依次为 Direct、对齐调色、Poisson 梯度融合。", "success");
  } catch (error) {
    setStatus(`预设融合失败：${error.message}`, "error");
  } finally {
    els.blendBtn.disabled = false;
  }
}

function createPresetFaceMask(size, preset) {
  const scale = size.scale;
  const center = { x: preset.cx * scale, y: preset.cy * scale };
  const points = sampleRotatedEllipse(
    center,
    preset.rx * scale,
    preset.ry * scale,
    preset.angle || 0,
    48
  );
  return rasterizeFeatheredMask(size.width, size.height, points, FACE_FEATHER_RADIUS);
}

function alignPresetSourceToTarget(targetSize, preset) {
  const canvas = document.createElement("canvas");
  canvas.width = targetSize.width;
  canvas.height = targetSize.height;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const s = preset.source;
  const t = preset.target;
  const scale = targetSize.scale;
  const sx = (t.rx / s.rx) * scale;
  const sy = (t.ry / s.ry) * scale;
  context.save();
  context.translate(t.cx * scale, t.cy * scale);
  context.rotate((t.angle || 0) - (s.angle || 0));
  context.scale(sx, sy);
  context.translate(-s.cx, -s.cy);
  context.drawImage(state.sourceImage, 0, 0);
  context.restore();
  return canvas;
}

function alignSourceToTarget(targetSize) {
  const canvas = document.createElement("canvas");
  canvas.width = targetSize.width;
  canvas.height = targetSize.height;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const sourcePoints = getWarpPoints(state.sourceDetection.landmarks, 1);
  const targetPoints = getWarpPoints(
    state.targetDetection.landmarks,
    targetSize.scale
  );
  const triangles = delaunayTriangulate(targetPoints);

  for (const triangle of triangles) {
    const sourceTriangle = triangle.map((index) => sourcePoints[index]);
    const targetTriangle = triangle.map((index) => targetPoints[index]);
    drawWarpedTriangle(context, state.sourceImage, sourceTriangle, targetTriangle);
  }

  return canvas;
}

function directBlend(targetImageData, sourceImageData, mask) {
  const output = cloneImageData(targetImageData);
  for (let i = 0; i < mask.alpha.length; i += 1) {
    const alpha = mask.alpha[i] * state.blendRatio;
    if (alpha <= 0) {
      continue;
    }
    const p = i * 4;
    for (let c = 0; c < 3; c += 1) {
      output.data[p + c] = sourceImageData.data[p + c] * alpha + targetImageData.data[p + c] * (1 - alpha);
    }
  }
  return output;
}

function poissonBlend(targetImageData, sourceImageData, mask) {
  const width = targetImageData.width;
  const height = targetImageData.height;
  const hardMask = mask.hard;
  const softAlpha = mask.alpha;
  const work = new Float32Array(targetImageData.data.length);
  const source = sourceImageData.data;
  const target = targetImageData.data;
  const { minX, minY, maxX, maxY } = mask.bbox;

  if (minX > maxX || minY > maxY) {
    return cloneImageData(targetImageData);
  }

  for (let p = 0; p < target.length; p += 4) {
    const i = p / 4;
    const fromSource = hardMask[i] && source[p + 3] > 8;
    work[p] = fromSource ? source[p] : target[p];
    work[p + 1] = fromSource ? source[p + 1] : target[p + 1];
    work[p + 2] = fromSource ? source[p + 2] : target[p + 2];
    work[p + 3] = 255;
  }

  const omega = 1.84;
  const iterations = POISSON_ITERATIONS;
  const sourceStrength = state.blendRatio;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let y = Math.max(1, minY); y <= Math.min(height - 2, maxY); y += 1) {
      for (let x = Math.max(1, minX); x <= Math.min(width - 2, maxX); x += 1) {
        const index = y * width + x;
        if (!hardMask[index]) {
          continue;
        }
        const p = index * 4;
        const neighbors = [index - 1, index + 1, index - width, index + width];
        for (let c = 0; c < 3; c += 1) {
          let boundarySum = 0;
          let guidanceSum = 0;
          for (const neighbor of neighbors) {
            const np = neighbor * 4;
            boundarySum += hardMask[neighbor] ? work[np + c] : target[np + c];
            const sourceEdge = source[p + c] - source[np + c];
            const targetEdge = target[p + c] - target[np + c];
            guidanceSum += sourceEdge * sourceStrength + targetEdge * (1 - sourceStrength);
          }
          const next = (boundarySum + guidanceSum) / 4;
          work[p + c] += omega * (next - work[p + c]);
        }
      }
    }
  }

  matchSolutionToneToTarget(work, target, hardMask);

  const output = cloneImageData(targetImageData);
  for (let i = 0; i < softAlpha.length; i += 1) {
    const alpha = softAlpha[i];
    if (alpha <= 0) {
      continue;
    }
    const p = i * 4;
    for (let c = 0; c < 3; c += 1) {
      output.data[p + c] = clampByte(work[p + c] * alpha + target[p + c] * (1 - alpha));
    }
  }
  return output;
}

function matchSolutionToneToTarget(work, target, hardMask) {
  const workSamples = [[], [], []];
  const targetSamples = [[], [], []];

  for (let i = 0; i < hardMask.length; i += 1) {
    if (!hardMask[i]) {
      continue;
    }
    const p = i * 4;
    const targetLum = luminance(target, p);
    if (targetLum < 28 || targetLum > 245) {
      continue;
    }
    for (let c = 0; c < 3; c += 1) {
      workSamples[c].push(work[p + c]);
      targetSamples[c].push(target[p + c]);
    }
  }

  if (workSamples[0].length < 32) {
    return;
  }

  const workStats = workSamples.map(robustStats);
  const targetStats = targetSamples.map(robustStats);
  const toneStrength = 0.72;
  for (let i = 0; i < hardMask.length; i += 1) {
    if (!hardMask[i]) {
      continue;
    }
    const p = i * 4;
    for (let c = 0; c < 3; c += 1) {
      const ratio = Math.max(0.72, Math.min(1.36, targetStats[c].std / workStats[c].std));
      const matched = (work[p + c] - workStats[c].mean) * ratio + targetStats[c].mean;
      work[p + c] = work[p + c] * (1 - toneStrength) + matched * toneStrength;
    }
  }
}

function createTargetFaceMask(size) {
  const scale = size.scale;
  const contour = getFaceMaskContour(state.targetDetection.landmarks, scale);
  return rasterizeFeatheredMask(size.width, size.height, contour, FACE_FEATHER_RADIUS);
}

function getFaceMaskContour(landmarks, scale) {
  const jaw = landmarks.getJawOutline().map((point) => scalePoint(point, scale));
  const brows = landmarks.getLeftEyeBrow()
    .concat(landmarks.getRightEyeBrow())
    .map((point) => scalePoint(point, scale));
  const nose = landmarks.getNose().map((point) => scalePoint(point, scale));
  const mouth = landmarks.getMouth().map((point) => scalePoint(point, scale));
  const eyeInfo = getEyeInfo(landmarks, scale);
  const noseBase = averagePoint(nose.slice(3, 6), 1);
  const mouthCenter = averagePoint(mouth, 1);
  const center = {
    x: eyeInfo.center.x * 0.16 + noseBase.x * 0.58 + mouthCenter.x * 0.26,
    y: eyeInfo.center.y * 0.2 + noseBase.y * 0.54 + mouthCenter.y * 0.26,
  };
  const faceWidth = Math.hypot(jaw[14].x - jaw[2].x, jaw[14].y - jaw[2].y);
  const faceHeight = jaw[8].y - Math.min(...brows.map((point) => point.y));
  const radiusX = Math.max(15, Math.min(faceWidth * 0.39, eyeInfo.distance * 1.02));
  const radiusY = Math.max(20, faceHeight * 0.48);
  return sampleRotatedEllipse(center, radiusX, radiusY, eyeInfo.angle, 40);
}

function sampleRotatedEllipse(center, radiusX, radiusY, angle, steps) {
  const points = [];
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);
  for (let i = 0; i < steps; i += 1) {
    const theta = (Math.PI * 2 * i) / steps;
    const x = Math.cos(theta) * radiusX;
    const y = Math.sin(theta) * radiusY;
    points.push({
      x: center.x + x * cosAngle - y * sinAngle,
      y: center.y + x * sinAngle + y * cosAngle,
    });
  }
  return points;
}

function rasterizeFeatheredMask(width, height, points, featherRadius) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.closePath();
  context.fill();

  const data = context.getImageData(0, 0, width, height).data;
  const hard = new Uint8Array(width * height);
  const bbox = { minX: width, minY: height, maxX: -1, maxY: -1 };

  for (let i = 0; i < hard.length; i += 1) {
    if (data[i * 4 + 3] > 0) {
      hard[i] = 1;
      const x = i % width;
      const y = Math.floor(i / width);
      bbox.minX = Math.min(bbox.minX, x);
      bbox.minY = Math.min(bbox.minY, y);
      bbox.maxX = Math.max(bbox.maxX, x);
      bbox.maxY = Math.max(bbox.maxY, y);
    }
  }

  const alpha = blurMask(hard, width, height, featherRadius, 3);
  return { alpha, hard, bbox };
}

function trimMaskBySourceCoverage(mask, sourceImageData) {
  const { hard, alpha, bbox } = mask;
  bbox.minX = sourceImageData.width;
  bbox.minY = sourceImageData.height;
  bbox.maxX = -1;
  bbox.maxY = -1;

  for (let i = 0; i < hard.length; i += 1) {
    const p = i * 4;
    if (sourceImageData.data[p + 3] < 24) {
      hard[i] = 0;
      alpha[i] = 0;
      continue;
    }
    if (hard[i]) {
      const x = i % sourceImageData.width;
      const y = Math.floor(i / sourceImageData.width);
      bbox.minX = Math.min(bbox.minX, x);
      bbox.minY = Math.min(bbox.minY, y);
      bbox.maxX = Math.max(bbox.maxX, x);
      bbox.maxY = Math.max(bbox.maxY, y);
    }
  }

  if (bbox.maxX < bbox.minX || bbox.maxY < bbox.minY) {
    bbox.minX = sourceImageData.width;
    bbox.minY = sourceImageData.height;
    bbox.maxX = -1;
    bbox.maxY = -1;
  }
}

async function loadModels() {
  if (state.modelsLoaded) {
    return;
  }
  if (state.loadingModels) {
    await waitForModels();
    return;
  }
  state.loadingModels = true;
  try {
    await ensureFaceApi();
    let lastError = null;
    for (const modelUrl of MODEL_URLS) {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);
        try {
          await faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl);
          state.useTinyLandmarks = false;
        } catch (landmarkError) {
          await faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelUrl);
          state.useTinyLandmarks = true;
        }
        state.modelsLoaded = true;
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("检测模型加载失败。");
  } finally {
    state.loadingModels = false;
  }
}

function waitForModels() {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const timer = setInterval(() => {
      if (state.modelsLoaded) {
        clearInterval(timer);
        resolve();
      } else if (!state.loadingModels || performance.now() - start > 15000) {
        clearInterval(timer);
        reject(new Error("检测模型加载超时。"));
      }
    }, 120);
  });
}

async function ensureFaceApi() {
  if (window.faceapi) {
    return;
  }
  let lastError = null;
  for (const src of FACE_API_SCRIPTS) {
    try {
      await loadScript(src);
      if (window.faceapi) {
        state.scriptLoaded = true;
        return;
      }
      lastError = new Error(`${src} 没有暴露 faceapi。`);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`face-api.js 未加载成功：${lastError ? lastError.message : "unknown error"}`);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-face-api][src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.faceApi = "true";
    script.onload = resolve;
    script.onerror = () => reject(new Error(`无法加载 ${src}`));
    document.head.append(script);
  });
}

async function detectSingleFace(image) {
  return faceapi.detectSingleFace(image, DETECTOR_OPTIONS()).withFaceLandmarks(state.useTinyLandmarks);
}

function redrawDetectedCanvases() {
  drawImageToCanvas(els.sourceCanvas, state.sourceImage, state.sourceDetection);
  drawImageToCanvas(els.targetCanvas, state.targetImage, state.targetDetection);
}

function drawImageToCanvas(canvas, image, detection = null) {
  const scale = Math.min(DISPLAY_MAX / image.naturalWidth, DISPLAY_MAX / image.naturalHeight, 3);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  if (detection && state.showLandmarks) {
    drawDetection(context, detection, scale);
  }
  return { width, height, scale };
}

function drawDetection(context, detection, scale) {
  const box = detection.detection.box;
  context.save();
  context.strokeStyle = "#00a66d";
  context.lineWidth = 2;
  context.strokeRect(box.x * scale, box.y * scale, box.width * scale, box.height * scale);
  context.fillStyle = "#ff6f59";
  for (const point of detection.landmarks.positions) {
    context.beginPath();
    context.arc(point.x * scale, point.y * scale, 2.2, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function getEyeInfo(landmarks, scale = 1) {
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  const left = averagePoint(leftEye, scale);
  const right = averagePoint(rightEye, scale);
  const center = {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
  const angle = Math.atan2(right.y - left.y, right.x - left.x);
  const distance = Math.hypot(right.x - left.x, right.y - left.y);
  return { left, right, center, angle, distance };
}

function getWarpPoints(landmarks, scale = 1) {
  return landmarks.positions
    .map((point) => scalePoint(point, scale))
    .concat(getLiftedBrowPoints(landmarks, scale));
}

function getLiftedBrowPoints(landmarks, scale = 1) {
  const jaw = landmarks.getJawOutline().map((point) => scalePoint(point, scale));
  const brows = landmarks.getLeftEyeBrow()
    .concat(landmarks.getRightEyeBrow())
    .map((point) => scalePoint(point, scale));
  const top = Math.min(...brows.map((point) => point.y));
  const bottom = Math.max(...jaw.map((point) => point.y));
  const lift = Math.max(4, (bottom - top) * 0.16);
  return brows.map((point) => ({
    x: point.x,
    y: point.y - lift,
  }));
}

function drawWarpedTriangle(context, image, sourceTriangle, targetTriangle) {
  if (triangleArea(targetTriangle) < 0.05 || triangleArea(sourceTriangle) < 0.05) {
    return;
  }
  const matrix = affineFromTriangles(sourceTriangle, targetTriangle);
  const clipTriangle = expandTriangle(targetTriangle, 0.75);
  context.save();
  context.beginPath();
  clipTriangle.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.closePath();
  context.clip();
  context.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
  context.drawImage(image, 0, 0);
  context.restore();
}

function expandTriangle(points, amount) {
  const center = averagePoint(points, 1);
  return points.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    return {
      x: point.x + (dx / length) * amount,
      y: point.y + (dy / length) * amount,
    };
  });
}

function triangleArea(points) {
  return Math.abs(
    (points[0].x * (points[1].y - points[2].y) +
      points[1].x * (points[2].y - points[0].y) +
      points[2].x * (points[0].y - points[1].y)) / 2
  );
}

function getAlignmentTriangle(landmarks, scale = 1) {
  const leftEye = averagePoint(landmarks.getLeftEye(), scale);
  const rightEye = averagePoint(landmarks.getRightEye(), scale);
  const nose = landmarks.getNose().map((point) => scalePoint(point, scale));
  const mouth = landmarks.getMouth().map((point) => scalePoint(point, scale));
  const noseBase = averagePoint(nose.slice(3, 6), 1);
  const mouthCenter = averagePoint(mouth, 1);
  const lowerAnchor = {
    x: noseBase.x * 0.36 + mouthCenter.x * 0.64,
    y: noseBase.y * 0.36 + mouthCenter.y * 0.64,
  };
  return [leftEye, rightEye, lowerAnchor];
}

function delaunayTriangulate(points) {
  if (points.length < 3) {
    return [];
  }
  const bounds = points.reduce((box, point) => ({
    minX: Math.min(box.minX, point.x),
    minY: Math.min(box.minY, point.y),
    maxX: Math.max(box.maxX, point.x),
    maxY: Math.max(box.maxY, point.y),
  }), {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  });
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const delta = Math.max(width, height, 1) * 16;
  const midX = (bounds.minX + bounds.maxX) / 2;
  const midY = (bounds.minY + bounds.maxY) / 2;
  const allPoints = points.concat([
    { x: midX - delta, y: midY - delta },
    { x: midX, y: midY + delta },
    { x: midX + delta, y: midY - delta },
  ]);
  const superA = points.length;
  const superB = points.length + 1;
  const superC = points.length + 2;
  let triangles = [makeTriangle(superA, superB, superC, allPoints)];

  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
    const point = allPoints[pointIndex];
    const badTriangles = triangles.filter((triangle) => circumcircleContains(triangle, point));
    const polygon = [];

    for (const triangle of badTriangles) {
      addBoundaryEdge(polygon, triangle.a, triangle.b);
      addBoundaryEdge(polygon, triangle.b, triangle.c);
      addBoundaryEdge(polygon, triangle.c, triangle.a);
    }

    triangles = triangles.filter((triangle) => !badTriangles.includes(triangle));
    for (const edge of polygon) {
      const triangle = makeTriangle(edge[0], edge[1], pointIndex, allPoints);
      if (Number.isFinite(triangle.radiusSq) && Math.abs(signedTriangleArea(triangle, allPoints)) > 0.01) {
        triangles.push(triangle);
      }
    }
  }

  return triangles
    .filter((triangle) => triangle.a < points.length && triangle.b < points.length && triangle.c < points.length)
    .map((triangle) => [triangle.a, triangle.b, triangle.c]);
}

function makeTriangle(a, b, c, points) {
  const p0 = points[a];
  const p1 = points[b];
  const p2 = points[c];
  const denominator = 2 * (
    p0.x * (p1.y - p2.y) +
    p1.x * (p2.y - p0.y) +
    p2.x * (p0.y - p1.y)
  );

  if (Math.abs(denominator) < 0.000001) {
    return { a, b, c, x: 0, y: 0, radiusSq: Infinity };
  }

  const p0Sq = p0.x * p0.x + p0.y * p0.y;
  const p1Sq = p1.x * p1.x + p1.y * p1.y;
  const p2Sq = p2.x * p2.x + p2.y * p2.y;
  const x = (
    p0Sq * (p1.y - p2.y) +
    p1Sq * (p2.y - p0.y) +
    p2Sq * (p0.y - p1.y)
  ) / denominator;
  const y = (
    p0Sq * (p2.x - p1.x) +
    p1Sq * (p0.x - p2.x) +
    p2Sq * (p1.x - p0.x)
  ) / denominator;
  return {
    a,
    b,
    c,
    x,
    y,
    radiusSq: (x - p0.x) * (x - p0.x) + (y - p0.y) * (y - p0.y),
  };
}

function circumcircleContains(triangle, point) {
  const dx = triangle.x - point.x;
  const dy = triangle.y - point.y;
  return dx * dx + dy * dy <= triangle.radiusSq + 0.01;
}

function addBoundaryEdge(edges, a, b) {
  const reverseIndex = edges.findIndex((edge) => edge[0] === b && edge[1] === a);
  if (reverseIndex >= 0) {
    edges.splice(reverseIndex, 1);
    return;
  }
  edges.push([a, b]);
}

function signedTriangleArea(triangle, points) {
  const p0 = points[triangle.a];
  const p1 = points[triangle.b];
  const p2 = points[triangle.c];
  return (
    p0.x * (p1.y - p2.y) +
    p1.x * (p2.y - p0.y) +
    p2.x * (p0.y - p1.y)
  ) / 2;
}

function affineFromTriangles(sourceTriangle, targetTriangle) {
  const [s0, s1, s2] = sourceTriangle;
  const [t0, t1, t2] = targetTriangle;
  const denominator =
    s0.x * (s1.y - s2.y) +
    s1.x * (s2.y - s0.y) +
    s2.x * (s0.y - s1.y);

  if (Math.abs(denominator) < 0.0001) {
    throw new Error("人脸关键点过于接近，无法稳定对齐。");
  }

  return {
    a: (t0.x * (s1.y - s2.y) + t1.x * (s2.y - s0.y) + t2.x * (s0.y - s1.y)) / denominator,
    b: (t0.y * (s1.y - s2.y) + t1.y * (s2.y - s0.y) + t2.y * (s0.y - s1.y)) / denominator,
    c: (t0.x * (s2.x - s1.x) + t1.x * (s0.x - s2.x) + t2.x * (s1.x - s0.x)) / denominator,
    d: (t0.y * (s2.x - s1.x) + t1.y * (s0.x - s2.x) + t2.y * (s1.x - s0.x)) / denominator,
    e:
      (t0.x * (s1.x * s2.y - s2.x * s1.y) +
        t1.x * (s2.x * s0.y - s0.x * s2.y) +
        t2.x * (s0.x * s1.y - s1.x * s0.y)) /
      denominator,
    f:
      (t0.y * (s1.x * s2.y - s2.x * s1.y) +
        t1.y * (s2.x * s0.y - s0.x * s2.y) +
        t2.y * (s0.x * s1.y - s1.x * s0.y)) /
      denominator,
  };
}

function averagePoint(points, scale = 1) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length * scale,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length * scale,
  };
}

function scalePoint(point, scale) {
  return { x: point.x * scale, y: point.y * scale };
}

function colorMatchSourceToTarget(sourceImageData, targetImageData, mask) {
  const output = cloneImageData(sourceImageData);
  const source = sourceImageData.data;
  const target = targetImageData.data;
  const sourceSamples = [[], [], []];
  const targetSamples = [[], [], []];

  for (let i = 0; i < mask.hard.length; i += 1) {
    const p = i * 4;
    if (mask.alpha[i] < 0.62 || source[p + 3] < 24) {
      continue;
    }
    const sourceLum = luminance(source, p);
    const targetLum = luminance(target, p);
    const sourceSpread = colorSpread(source, p);
    const targetSpread = colorSpread(target, p);
    if (sourceLum < 34 || targetLum < 34 || sourceLum > 242 || targetLum > 242) {
      continue;
    }
    if ((sourceLum < 76 && sourceSpread > 72) || (targetLum < 76 && targetSpread > 72)) {
      continue;
    }
    for (let c = 0; c < 3; c += 1) {
      sourceSamples[c].push(source[p + c]);
      targetSamples[c].push(target[p + c]);
    }
  }

  if (sourceSamples[0].length < 32) {
    return output;
  }

  const sourceStats = sourceSamples.map(robustStats);
  const targetStats = targetSamples.map(robustStats);

  for (let i = 0; i < mask.alpha.length; i += 1) {
    const p = i * 4;
    if (mask.alpha[i] <= 0 || source[p + 3] < 24) {
      continue;
    }
    const strength = 0.92 * smoothstep(0.18, 1, mask.alpha[i]);
    for (let c = 0; c < 3; c += 1) {
      const ratio = Math.max(0.68, Math.min(1.42, targetStats[c].std / sourceStats[c].std));
      const matched = (source[p + c] - sourceStats[c].mean) * ratio + targetStats[c].mean;
      output.data[p + c] = clampByte(source[p + c] * (1 - strength) + matched * strength);
    }
    output.data[p + 3] = 255;
  }
  return output;
}

function robustStats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const start = Math.floor(sorted.length * 0.08);
  const end = Math.max(start + 1, Math.ceil(sorted.length * 0.92));
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let i = start; i < end; i += 1) {
    const value = sorted[i];
    sum += value;
    sumSq += value * value;
    count += 1;
  }
  const mean = sum / count;
  return {
    mean,
    std: Math.sqrt(Math.max(1, sumSq / count - mean * mean)),
  };
}

function luminance(data, p) {
  return data[p] * 0.2126 + data[p + 1] * 0.7152 + data[p + 2] * 0.0722;
}

function colorSpread(data, p) {
  return Math.max(data[p], data[p + 1], data[p + 2]) - Math.min(data[p], data[p + 1], data[p + 2]);
}

function convexHull(points) {
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (sorted.length <= 2) {
    return sorted;
  }
  const cross = (origin, a, b) => (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function blurMask(mask, width, height, radius, passes) {
  let current = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) {
    current[i] = mask[i] ? 1 : 0;
  }

  for (let pass = 0; pass < passes; pass += 1) {
    current = boxBlurHorizontal(current, width, height, radius);
    current = boxBlurVertical(current, width, height, radius);
  }

  for (let i = 0; i < current.length; i += 1) {
    current[i] = Math.min(1, current[i] * 1.22);
  }
  return current;
}

function boxBlurHorizontal(input, width, height, radius) {
  const output = new Float32Array(input.length);
  const windowSize = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = -radius; x <= radius; x += 1) {
      sum += input[y * width + clampInt(x, 0, width - 1)];
    }
    for (let x = 0; x < width; x += 1) {
      output[y * width + x] = sum / windowSize;
      const removeX = clampInt(x - radius, 0, width - 1);
      const addX = clampInt(x + radius + 1, 0, width - 1);
      sum += input[y * width + addX] - input[y * width + removeX];
    }
  }
  return output;
}

function boxBlurVertical(input, width, height, radius) {
  const output = new Float32Array(input.length);
  const windowSize = radius * 2 + 1;
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) {
      sum += input[clampInt(y, 0, height - 1) * width + x];
    }
    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = sum / windowSize;
      const removeY = clampInt(y - radius, 0, height - 1);
      const addY = clampInt(y + radius + 1, 0, height - 1);
      sum += input[addY * width + x] - input[removeY * width + x];
    }
  }
  return output;
}

function normalizeTransparentPixels(sourceImageData, targetImageData) {
  for (let p = 0; p < sourceImageData.data.length; p += 4) {
    if (sourceImageData.data[p + 3] < 8) {
      sourceImageData.data[p] = targetImageData.data[p];
      sourceImageData.data[p + 1] = targetImageData.data[p + 1];
      sourceImageData.data[p + 2] = targetImageData.data[p + 2];
      sourceImageData.data[p + 3] = 255;
    }
  }
}

function getCanvasData(canvas) {
  return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
}

function putCanvasData(canvas, imageData) {
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext("2d").putImageData(imageData, 0, 0);
}

function cloneImageData(imageData) {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}

function clearCanvas(canvas, label) {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#edf3ea";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(16, 21, 15, 0.42)";
  context.font = "700 14px Inter, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, canvas.width / 2, canvas.height / 2);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Cannot load ${src}`));
    image.src = src;
  });
}

function saveResult() {
  if (!state.resultImageData) {
    return;
  }
  const link = document.createElement("a");
  link.download = `face_poisson_${Date.now()}.png`;
  link.href = els.resultCanvas.toDataURL("image/png");
  link.click();
}

function detectionText(label, detection) {
  const box = detection.detection.box;
  return `${label}: ${Math.round(box.width)} x ${Math.round(box.height)} · score ${detection.detection.score.toFixed(2)}`;
}

function resetFaceState() {
  state.sourceDetection = null;
  state.targetDetection = null;
  state.resultImageData = null;
  els.blendBtn.disabled = !hasPresetPair();
  els.saveBtn.disabled = true;
}

function setStatus(message, type = "") {
  els.status.textContent = message;
  els.status.className = `status ${type}`.trim();
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
