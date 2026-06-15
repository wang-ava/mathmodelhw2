const state = {
  payload: null,
  selectedExperiment: null,
  uploadedDataUrl: null,
  repairTimer: null,
};

const $ = (id) => document.getElementById(id);

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  if (!isFinite(num)) return "inf";
  if (num >= 9999) return "inf";
  return num.toFixed(digits);
}

function setSliderLabels() {
  const lambdaEl = $("lambda-scale");
  const maxIterEl = $("max-iter");
  if (lambdaEl) $("lambda-scale-value").textContent = Number(lambdaEl.value).toFixed(2);
  if (maxIterEl) $("max-iter-value").textContent = maxIterEl.value;
}

function revealOnScroll() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    },
    { threshold: 0.08 }
  );
  document.querySelectorAll(".reveal").forEach((node) => observer.observe(node));
}

// ---- Hero ----

function renderHero(payload) {
  const el = $("hero-eyebrow");
  if (el) el.textContent = payload.hero.eyebrow;
  const t = $("hero-title");
  if (t) t.textContent = payload.hero.title;
  const s = $("hero-summary");
  if (s) s.textContent = payload.hero.subtitle;
  const statsEl = $("hero-stats");
  if (!statsEl) return;
  statsEl.innerHTML = payload.hero.stats
    .map(
      (item) =>
        `<article class="stat-card"><span class="stat-card-label">${item.label}</span><div class="stat-card-value">${item.value}</div></article>`
    )
    .join("");
}

// ---- Grid Map ----

function renderGridMap(payload) {
  const container = $("grid-map-container");
  if (!container) return;

  const scenarios = [
    { name: "portrait_text", row: 0, col: 0 },
    { name: "portrait_block", row: 0, col: 1 },
    { name: "portrait_salt", row: 0, col: 2 },
    { name: "texture_text", row: 1, col: 0 },
    { name: "texture_block", row: 1, col: 1 },
    { name: "texture_salt", row: 1, col: 2 },
  ];

  scenarios.forEach(({ name, row, col }) => {
    const exp = payload.experiments.find((e) => e.name === name);
    if (!exp) return;

    const cell = document.createElement("div");
    cell.className = "grid-map-cell";
    cell.style.gridColumn = col + 2; // columns 2-4 (col 1 is the row label)
    cell.style.gridRow = row + 2; // rows 2-3 (row 1 is the col labels)
    cell.dataset.name = name;
    cell.innerHTML = `
      <div class="grid-map-cell-images">
        <img src="${exp.images.clean}" alt="clean" loading="lazy" />
        <img src="${exp.images.observed}" alt="observed" loading="lazy" />
        <img src="${exp.images.recovered}" alt="recovered" loading="lazy" />
        <img src="${exp.images.sparse}" alt="sparse" loading="lazy" />
      </div>
      <div class="grid-map-cell-info">
        <span class="grid-map-cell-label">${exp.title}</span>
        <span class="grid-map-cell-psnr">PSNR ${formatNumber(exp.metrics.psnr)} dB</span>
      </div>
    `;

    cell.addEventListener("click", () => {
      renderExperimentDetail(exp);
      const experimentsSection = $("experiments");
      if (experimentsSection) experimentsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    container.appendChild(cell);
  });
}

// ---- Experiment Detail ----

let comparisonInitialized = false;

function initComparisonSlider() {
  if (comparisonInitialized) return;
  comparisonInitialized = true;

  const wrapper = $("comparison-wrapper");
  const slider = $("comparison-slider");
  if (!wrapper || !slider) return;

  const rightImg = wrapper.querySelector(".comparison-img-right");
  if (!rightImg) return;

  function updateSlider(clientX) {
    const rect = wrapper.getBoundingClientRect();
    let x = clientX - rect.left;
    x = Math.max(0, Math.min(x, rect.width));
    const pct = (x / rect.width) * 100;
    slider.style.left = pct + "%";
    rightImg.style.clipPath = `inset(0 0 0 ${pct}%)`;
  }

  slider.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const onMove = (ev) => updateSlider(ev.clientX);
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  wrapper.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const onMove = (ev) => updateSlider(ev.touches[0].clientX);
    const onEnd = () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
    document.addEventListener("touchmove", onMove);
    document.addEventListener("touchend", onEnd);
  });

  // Initialize at 50%
  rightImg.style.clipPath = "inset(0 0 0 50%)";
  slider.style.left = "50%";
}

function renderExperimentDetail(experiment) {
  if (!experiment) return;

  state.selectedExperiment = experiment.name;

  const titleEl = $("detail-title");
  if (titleEl) titleEl.textContent = experiment.title;

  const subEl = $("detail-subtitle");
  if (subEl) subEl.textContent = experiment.subtitle;

  const storyEl = $("detail-story");
  if (storyEl) storyEl.textContent = experiment.story;

  // Comparison slider images
  const obsEl = $("detail-observed");
  const recEl = $("detail-recovered");
  if (obsEl) obsEl.src = experiment.images.observed;
  if (recEl) recEl.src = experiment.images.recovered;

  // Reset slider
  const rightImg = document.querySelector(".comparison-img-right");
  const sliderEl = $("comparison-slider");
  if (rightImg) rightImg.style.clipPath = "inset(0 0 0 50%)";
  if (sliderEl) sliderEl.style.left = "50%";

  // Sparse image
  const sparseEl = $("detail-sparse");
  if (sparseEl) sparseEl.src = experiment.images.sparse;

  // Comparison card (median filter)
  const compCard = $("detail-comparison-card");
  const compImg = $("detail-comparison");
  if (experiment.images.comparison) {
    if (compCard) compCard.style.display = "";
    if (compImg) compImg.src = experiment.images.comparison;
  } else {
    if (compCard) compCard.style.display = "none";
  }

  // Metrics
  const metricsEl = $("detail-metrics");
  if (metricsEl) {
    metricsEl.innerHTML = `
      <div class="metric-chip"><span>PSNR</span><strong>${formatNumber(experiment.metrics.psnr)} dB</strong></div>
      <div class="metric-chip"><span>SSIM</span><strong>${formatNumber(experiment.metrics.ssim, 4)}</strong></div>
      <div class="metric-chip"><span>相对误差</span><strong>${formatNumber(experiment.metrics.rel_error)}</strong></div>
      <div class="metric-chip"><span>Support F1</span><strong>${formatNumber(experiment.metrics.support_f1)}</strong></div>
      <div class="metric-chip"><span>&lambda;</span><strong>${formatNumber(experiment.metrics.lambda, 4)}</strong></div>
      <div class="metric-chip"><span>迭代次数</span><strong>${experiment.metrics.iterations}</strong></div>
      <div class="metric-chip"><span>Rank</span><strong>${experiment.metrics.rank}</strong></div>
    `;
  }

  // Highlight in atlas list
  document.querySelectorAll(".experiment-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.name === experiment.name);
  });

  // Highlight in grid map
  document.querySelectorAll(".grid-map-cell").forEach((cell) => {
    cell.classList.toggle("active", cell.dataset.name === experiment.name);
  });
}

function renderExperiments(payload) {
  const listEl = $("atlas-list");
  if (!listEl) return;

  listEl.innerHTML = payload.experiments
    .map(
      (experiment) =>
        `<button class="experiment-card" data-name="${experiment.name}"><h3>${experiment.title}</h3><p>${experiment.subtitle}</p></button>`
    )
    .join("");

  listEl.querySelectorAll(".experiment-card").forEach((button) => {
    button.addEventListener("click", () => {
      const experiment = payload.experiments.find((item) => item.name === button.dataset.name);
      renderExperimentDetail(experiment);
    });
  });

  renderExperimentDetail(payload.experiments[0]);
}

// ---- Analysis / Insights ----

function renderInsights(payload) {
  const gridEl = $("insight-grid");
  if (!gridEl) return;
  gridEl.innerHTML = payload.analysis_panels
    .map(
      (panel) => {
        const media = panel.images
          ? `<div class="insight-image-grid">${panel.images
              .map(
                (item) =>
                  `<figure><img src="${item.src}" alt="${item.alt || item.label}" loading="lazy" /><figcaption>${item.label}</figcaption></figure>`
              )
              .join("")}</div>${panel.image ? `<img class="insight-main-image" src="${panel.image}" alt="${panel.title}" loading="lazy" />` : ""}`
          : `<img src="${panel.image}" alt="${panel.title}" loading="lazy" />`;
        return `<article class="insight-card">${media}<div class="insight-card-body"><h3>${panel.title}</h3><p>${panel.description}</p></div></article>`;
      }
    )
    .join("");
}

// ---- Advanced model metrics ----

function renderAdvancedMetrics(payload) {
  const opt = payload.optional || {};

  const rslrtEl = $("rslrt-metrics");
  if (rslrtEl && opt.rslrt) {
    rslrtEl.innerHTML = `
      <div class="metric-chip"><span>PSNR</span><strong>${formatNumber(opt.rslrt.psnr)} dB</strong></div>
      <div class="metric-chip"><span>SSIM</span><strong>${formatNumber(opt.rslrt.ssim, 4)}</strong></div>
      <div class="metric-chip"><span>Support F1</span><strong>${formatNumber(opt.rslrt.support_f1)}</strong></div>
      <div class="metric-chip"><span>vs RPCA 提升</span><strong>+${formatNumber(opt.rslrt.gain_over_rpca)} dB</strong></div>
    `;
  }

  const tiltEl = $("tilt-metrics");
  if (tiltEl && opt.tilt_affine && opt.tilt_projective) {
    tiltEl.innerHTML = `
      <div class="metric-chip"><span>仿射 PSNR</span><strong>${formatNumber(opt.tilt_affine.psnr)} dB</strong></div>
      <div class="metric-chip"><span>仿射 SSIM</span><strong>${formatNumber(opt.tilt_affine.ssim, 4)}</strong></div>
      <div class="metric-chip"><span>仿射矩阵误差</span><strong>${formatNumber(opt.tilt_affine.matrix_error, 4)}</strong></div>
      <div class="metric-chip"><span>投影 PSNR</span><strong>${formatNumber(opt.tilt_projective.psnr)} dB</strong></div>
      <div class="metric-chip"><span>投影 SSIM</span><strong>${formatNumber(opt.tilt_projective.ssim, 4)}</strong></div>
      <div class="metric-chip"><span>投影矩阵误差</span><strong>${formatNumber(opt.tilt_projective.matrix_error, 4)}</strong></div>
    `;
  }
}

// ---- Summary Table ----

function renderSummaryTable(payload) {
  const tbody = $("summary-tbody");
  if (!tbody || !payload.summary_rows) return;
  tbody.innerHTML = payload.summary_rows
    .map(
      (row) =>
        `<tr><td>${row.scenario}</td><td>${row.method}</td><td>${formatNumber(row.psnr)}</td><td>${formatNumber(row.ssim, 4)}</td><td>${formatNumber(row.rel_error)}</td><td>${formatNumber(row.support_f1)}</td><td>${formatNumber(row.lambda, 4)}</td><td>${row.iterations}</td><td>${row.rank}</td></tr>`
    )
    .join("");
}

// ---- Repair Lab ----

function makeStatsList(items) {
  return `<p class="status-pill">${items.headline || "修复完成"}</p><ul class="stat-list">
    ${items.mode ? `<li>模式: ${items.mode}</li>` : ""}
    ${items.input_size ? `<li>输入尺寸: ${items.input_size}</li>` : ""}
    ${items.iterations ? `<li>迭代次数: ${items.iterations}</li>` : ""}
    ${items.rank ? `<li>恢复秩: ${items.rank}</li>` : ""}
    ${items.channel_ranks ? `<li>各通道秩: ${items.channel_ranks.join(" / ")}</li>` : ""}
    ${items.sparse_ratio ? `<li>稀疏比例: ${formatNumber(items.sparse_ratio, 4)}</li>` : ""}
    ${items.residual ? `<li>残差: ${formatNumber(items.residual, 6)}</li>` : ""}
    ${items.lambda ? `<li>&lambda;: ${formatNumber(items.lambda, 4)}</li>` : ""}
    ${items.note ? `<li>${items.note}</li>` : ""}
  </ul>`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleSelectedFile(file) {
  if (!file) return;
  state.uploadedDataUrl = await readFileAsDataUrl(file);
  const obsEl = $("upload-observed");
  if (obsEl) obsEl.src = state.uploadedDataUrl;
  const statsEl = $("upload-stats");
  if (statsEl) {
    statsEl.innerHTML = `<p class="status-pill">图片就绪</p><ul class="stat-list"><li>${file.name}</li><li>自动运行 RPCA 中...</li></ul>`;
  }
  scheduleRepair();
}

function scheduleRepair() {
  if (!state.uploadedDataUrl) return;
  if (state.repairTimer) clearTimeout(state.repairTimer);
  state.repairTimer = setTimeout(runRepair, 500);
}

async function runRepair() {
  if (!state.uploadedDataUrl) {
    const statsEl = $("upload-stats");
    if (statsEl) statsEl.innerHTML = `<p class="status-pill">尚未上传</p><ul class="stat-list"><li>请先上传图片，或者点击下方示例按钮查看预生成的 RPCA 结果。</li></ul>`;
    return;
  }

  const statsEl = $("upload-stats");
  if (statsEl) {
    statsEl.innerHTML = `<p class="status-pill">提示</p><ul class="stat-list"><li>自定义图片的 RPCA 实时修复需要 Python 后端支持。</li><li>请运行 <code>python webapp.py</code> 启动本地服务器，或点击下方「加载示例」按钮查看预生成结果。</li></ul>`;
  }
}

function loadSampleExperiment(scenarioName) {
  if (!state.payload) return;
  const experiment = state.payload.experiments.find((item) => item.name === scenarioName);
  if (!experiment) return;

  // In static mode, directly show pre-generated images (no backend RPCA)
  const obsEl = $("upload-observed");
  const recEl = $("upload-recovered");
  const sparseEl = $("upload-sparse");
  const statsEl = $("upload-stats");

  if (obsEl) obsEl.src = experiment.images.observed;
  if (recEl) recEl.src = experiment.images.recovered;
  if (sparseEl) sparseEl.src = experiment.images.sparse;
  if (statsEl) {
    const m = experiment.metrics;
    statsEl.innerHTML = `<p class="status-pill">示例已加载</p><ul class="stat-list">
      <li>${experiment.title}</li>
      <li>PSNR: ${formatNumber(m.psnr)} dB</li>
      <li>SSIM: ${formatNumber(m.ssim, 4)}</li>
      <li>迭代次数: ${m.iterations}</li>
      <li>Rank: ${m.rank}</li>
    </ul>`;
  }

  // Load images into data URL for potential future use
  state.uploadedDataUrl = experiment.images.observed;
}

function bindUploadEvents() {
  const fileInput = $("file-input");
  const uploadDrop = $("upload-drop");
  const lambdaScale = $("lambda-scale");
  const maxIter = $("max-iter");

  if (fileInput) {
    fileInput.addEventListener("change", async (event) => {
      const [file] = event.target.files;
      await handleSelectedFile(file);
    });
  }

  if (uploadDrop) {
    ["dragenter", "dragover"].forEach((type) => {
      uploadDrop.addEventListener(type, (event) => {
        event.preventDefault();
        uploadDrop.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((type) => {
      uploadDrop.addEventListener(type, (event) => {
        event.preventDefault();
        if (type === "drop") {
          const [file] = event.dataTransfer.files;
          handleSelectedFile(file);
        }
        uploadDrop.classList.remove("dragover");
      });
    });
  }

  // Sample buttons
  document.querySelectorAll(".button-sample").forEach((btn) => {
    btn.addEventListener("click", () => {
      loadSampleExperiment(btn.dataset.sample);
    });
  });

  // Auto-rerun on parameter change
  if (lambdaScale) {
    lambdaScale.addEventListener("input", () => {
      setSliderLabels();
      scheduleRepair();
    });
  }
  if (maxIter) {
    maxIter.addEventListener("input", () => {
      setSliderLabels();
      scheduleRepair();
    });
  }
}

// ---- Bootstrap ----

async function bootstrap() {
  try {
    setSliderLabels();
    revealOnScroll();
    bindUploadEvents();
    initComparisonSlider();

    const response = await fetch("api/experiments.json");
    const payload = await response.json();
    state.payload = payload;

    renderHero(payload);
    renderGridMap(payload);
    renderExperiments(payload);
    renderInsights(payload);
    renderAdvancedMetrics(payload);
    renderSummaryTable(payload);
  } catch (err) {
    console.error("Bootstrap error:", err);
  }
}

bootstrap();
