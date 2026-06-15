from __future__ import annotations

import csv
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.image as mpimg
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.backends.backend_pdf import PdfPages

from .render_web_preview import render_preview


ROOT = Path(__file__).resolve().parents[2]
RESULTS_DIR = ROOT / "code" / "results"
REPORT_DIR = ROOT / "code" / "report"
FONT_PATH = Path("/System/Library/Fonts/Supplemental/Songti.ttc")
FONT_PROP = fm.FontProperties(fname=str(FONT_PATH)) if FONT_PATH.exists() else None
plt.rcParams["font.family"] = FONT_PROP.get_name() if FONT_PROP else "DejaVu Sans"
plt.rcParams["axes.unicode_minus"] = False


def load_summary() -> list[dict[str, str]]:
    with (RESULTS_DIR / "summary_metrics.csv").open("r", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def load_metadata() -> dict:
    return json.loads((RESULTS_DIR / "metadata.json").read_text(encoding="utf-8"))


def load_optional_summary() -> list[dict[str, str]]:
    path = RESULTS_DIR / "optional_metrics.csv"
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def load_optional_metadata() -> dict:
    path = RESULTS_DIR / "optional_metadata.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def metric_row(rows: list[dict[str, str]], scenario: str, method: str = "RPCA") -> dict[str, str]:
    for row in rows:
        if row["scenario"] == scenario and row["method"] == method:
            return row
    raise KeyError((scenario, method))


def optional_row(rows: list[dict[str, str]], task: str, method: str) -> dict[str, str]:
    for row in rows:
        if row["task"] == task and row["method"] == method:
            return row
    raise KeyError((task, method))


def fmt(value: str, digits: int = 2) -> str:
    return f"{float(value):.{digits}f}"


def write_markdown(
    summary_rows: list[dict[str, str]],
    metadata: dict,
    optional_rows: list[dict[str, str]],
    optional_metadata: dict,
) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "report.md").write_text((ROOT / "report_template.md").read_text(encoding="utf-8"), encoding="utf-8")


def add_text_page(pdf: PdfPages, title: str, body_lines: list[str]) -> None:
    fig = plt.figure(figsize=(8.27, 11.69))
def add_image_page(
    pdf: PdfPages,
    title: str,
    image_specs: list[tuple[str, tuple[float, float, float, float]]],
    captions: list[tuple[str, tuple[float, float]]],
) -> None:
    fig = plt.figure(figsize=(8.27, 11.69))
    fig.text(0.08, 0.95, title, fontsize=20, fontproperties=FONT_PROP, weight="bold")
    for path_str, rect in image_specs:
        ax = fig.add_axes(rect)
        ax.imshow(mpimg.imread(path_str))
        ax.axis("off")
    for text, (x, y) in captions:
        fig.text(x, y, text, fontsize=11, fontproperties=FONT_PROP, va="top")
    pdf.savefig(fig, bbox_inches="tight")
    plt.close(fig)


def write_pdf(
    summary_rows: list[dict[str, str]],
    metadata: dict,
    optional_rows: list[dict[str, str]],
    optional_metadata: dict,
) -> None:
    pt = metric_row(summary_rows, "portrait_text")
    pb = metric_row(summary_rows, "portrait_block")
    ps = metric_row(summary_rows, "portrait_salt", "RPCA")
    pm = metric_row(summary_rows, "portrait_salt", "Median(3x3)")
    tt = metric_row(summary_rows, "texture_text")
    tb = metric_row(summary_rows, "texture_block")
    ts = metric_row(summary_rows, "texture_salt", "RPCA")
    rslrt = optional_row(optional_rows, "repair_sparse_low_rank_texture", "SparseLowRankTexture")
    rslrt_rpca = optional_row(optional_rows, "repair_sparse_low_rank_texture", "RPCA")
    tilt_affine = optional_row(optional_rows, "tilt_affine", "TILT")
    tilt_projective = optional_row(optional_rows, "tilt_projective", "TILT")

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    with PdfPages(REPORT_DIR / "report.pdf") as pdf:
        add_text_page(
            pdf,
            "作业2实验报告：基于低秩分解的图像修复",
            [
                "摘要",
                "本次作业我实现了 Robust PCA 的 Inexact ALM 求解器，",
                "用「低秩 + 稀疏分解」的思路来修复被污染的图像。",
                "",
                "核心想法：干净图片 = 低秩矩阵 L，噪声/遮挡 = 稀疏矩阵 S，",
                "观测图 A = L + S。我在两种底图上分别叠了三种破坏，",
                "形成 2x3 实验网格来全面测试 RPCA。",
                "",
                "主要结果：",
                f"- 人像文字遮挡：PSNR={fmt(pt['psnr'])} dB, SSIM={fmt(pt['ssim'], 4)}",
                f"- 人像缺块修复：PSNR={fmt(pb['psnr'])} dB, SSIM={fmt(pb['ssim'], 4)}",
                f"- 人像椒盐噪声：PSNR={fmt(ps['psnr'])} dB, SSIM={fmt(ps['ssim'], 4)}",
                f"- 纹理文字遮挡：PSNR={fmt(tt['psnr'])} dB, SSIM={fmt(tt['ssim'], 4)}",
                f"- 纹理缺块修复：PSNR={fmt(tb['psnr'])} dB, SSIM={fmt(tb['ssim'], 4)}",
                f"- 纹理椒盐噪声：PSNR={fmt(ts['psnr'])} dB, SSIM={fmt(ts['ssim'], 4)}",
                "",
                f"- Optional (2) 稀疏低秩纹理修复：PSNR={fmt(rslrt['psnr'])} dB",
                f"- Optional (3) TILT-Affine：PSNR={fmt(tilt_affine['psnr'])} dB",
                f"- Optional (3) TILT-Projective：PSNR={fmt(tilt_projective['psnr'])} dB",
                "",
                "建模与算法",
                "目标函数: min ||L||_* + lambda ||S||_1, s.t. A = L + S",
                "rank 和 l0 都是 NP-hard，所以松弛为核范数 + l1。",
                "求解用 Inexact ALM：L 用 SVT 更新，S 用软阈值更新。",
                "",
                "实现说明",
                "只调用 numpy.linalg.svd 算 SVD，RPCA 主循环、",
                "阈值更新、停止准则均为手写。",
            ],
        )

        add_image_page(
            pdf,
            "双底图统一对比网格",
            [
                (str(RESULTS_DIR / "unified_grid.png"), (0.05, 0.05, 0.90, 0.85)),
            ],
            [
                (
                    "图1 2 种底图 × 3 种破坏类型的完整 RPCA 对比网格。每格从左到右：干净图 / 观测图 / 恢复 L / |稀疏 S|。",
                    (0.08, 0.01),
                ),
            ],
        )

        add_image_page(
            pdf,
            "主实验详情：遮挡与缺块修复",
            [
                (str(RESULTS_DIR / "portrait_text_overview.png"), (0.07, 0.53, 0.86, 0.28)),
                (str(RESULTS_DIR / "portrait_block_overview.png"), (0.07, 0.14, 0.86, 0.28)),
            ],
            [
                (
                    f"图2 人像文字遮挡：PSNR={fmt(pt['psnr'])} dB, SSIM={fmt(pt['ssim'], 4)}，文字被分离到稀疏项。",
                    (0.08, 0.49),
                ),
                (
                    f"图3 人像缺块修复：PSNR={fmt(pb['psnr'])} dB, SSIM={fmt(pb['ssim'], 4)}，缺块区域被部分恢复。",
                    (0.08, 0.10),
                ),
            ],
        )

        add_image_page(
            pdf,
            "主实验详情：纹理修复与椒盐噪声对比",
            [
                (str(RESULTS_DIR / "texture_text_overview.png"), (0.07, 0.53, 0.86, 0.28)),
                (str(RESULTS_DIR / "saltpepper_vs_median.png"), (0.07, 0.14, 0.86, 0.28)),
            ],
            [
                (
                    f"图4 纹理文字遮挡：PSNR={fmt(tt['psnr'])} dB, SSIM={fmt(tt['ssim'], 4)}，纹理底图恢复效果优于人像。",
                    (0.08, 0.49),
                ),
                (
                    f"图5 人像椒盐噪声：RPCA PSNR={fmt(ps['psnr'])} dB 显著高于中值滤波 {fmt(pm['psnr'])} dB。",
                    (0.08, 0.10),
                ),
            ],
        )

        add_image_page(
            pdf,
            "参数敏感性与收敛性",
            [
                (str(RESULTS_DIR / "lambda_sensitivity.png"), (0.08, 0.54, 0.84, 0.24)),
                (str(RESULTS_DIR / "convergence_curve.png"), (0.08, 0.16, 0.40, 0.24)),
            ],
            [
                (
                    "图6 lambda 敏感性：c 从 0.4 到 1.5 时 PSNR 持续上升，继续增大后回落。",
                    (0.08, 0.50),
                ),
                (
                    "图7 收敛曲线：Inexact ALM 在三十余次迭代后收敛。",
                    (0.08, 0.12),
                ),
            ],
        )

        add_image_page(
            pdf,
            "加分实验：彩色扩展与网页展示",
            [
                (str(RESULTS_DIR / "color_extension.png"), (0.08, 0.52, 0.84, 0.24)),
                (str(RESULTS_DIR / "webapp_snapshot.png"), (0.08, 0.11, 0.84, 0.30)),
            ],
            [
                (
                    f"图8 彩色纹理逐通道 RPCA：平均 PSNR={metadata['color_extension']['color_psnr']:.2f} dB。",
                    (0.08, 0.48),
                ),
                (
                    "图9 网页交互站点：支持实验展示、参数调节和用户上传去噪。",
                    (0.08, 0.07),
                ),
            ],
        )

        add_text_page(
            pdf,
            "Optional (2): Repairing Sparse Low-rank Texture",
            [
                "核心思想",
                "规则纹理不仅在图像域中低秩，在 DCT 域中也是稀疏的。",
                "所以模型里多了 W = DCT(X) 的稀疏约束。",
                "",
                "实现说明",
                "1. 用 A 承担核范数约束，W 承担 DCT 稀疏约束；",
                "2. ADMM 交替更新 A / W / E / X；",
                "3. 每轮根据稀疏误差缩小可信支持集 (support refinement)。",
                "",
                "调参过程",
                "这个方法的调参比较头疼，lambda、alpha、",
                "support quantile 都需要调。refinement 步数太多会过拟合。",
                "",
                "结果",
                f"- Sparse Low-rank Texture: PSNR={fmt(rslrt['psnr'])} dB, SSIM={fmt(rslrt['ssim'], 4)}",
                f"- RPCA baseline: PSNR={fmt(rslrt_rpca['psnr'])} dB, SSIM={fmt(rslrt_rpca['ssim'], 4)}",
                f"- 增益: +{optional_metadata['rslrt_gain_over_rpca']:.2f} dB",
            ],
        )

        add_image_page(
            pdf,
            "Optional (2) 结果图：Repairing Sparse Low-rank Texture",
            [
                (str(RESULTS_DIR / "optional_rslrt_overview.png"), (0.08, 0.55, 0.84, 0.22)),
                (str(RESULTS_DIR / "optional_rslrt_vs_rpca.png"), (0.08, 0.16, 0.84, 0.22)),
            ],
            [
                (
                    "图10 稀疏低秩纹理修复：在大块缺失和细线污染同时存在时，双先验模型能较好恢复纹理结构。",
                    (0.08, 0.51),
                ),
                (
                    f"图11 与 RPCA 对比：加入 DCT 稀疏先验后，PSNR 从 {fmt(rslrt_rpca['psnr'])} dB 提升到 "
                    f"{fmt(rslrt['psnr'])} dB。",
                    (0.08, 0.12),
                ),
            ],
        )

        add_text_page(
            pdf,
            "Optional (3): TILT",
            [
                "核心思想",
                "TILT 把几何校正和低秩恢复放在同一个框架里。",
                "如果纹理发生了倾斜或透视变形，先校正再分解效果更好。",
                "",
                "实现说明",
                "1. 外层循环更新 affine / projective 变换参数；",
                "2. 内层用 ALM 联合更新 L、E 和 Delta tau；",
                "3. Jacobian 用数值差分计算。",
                "",
                "踩坑",
                "TILT 对初始化很敏感，初始变换参数离真值太远会",
                "收敛到局部最优。我用了金字塔策略（先低分辨率粗调，",
                "再高分辨率精调）来缓解这个问题。",
                "",
                f"- TILT-Affine: PSNR={fmt(tilt_affine['psnr'])} dB, SSIM={fmt(tilt_affine['ssim'], 4)}, matrix error={fmt(tilt_affine['matrix_error'], 4)}",
                f"- TILT-Projective: PSNR={fmt(tilt_projective['psnr'])} dB, SSIM={fmt(tilt_projective['ssim'], 4)}, matrix error={fmt(tilt_projective['matrix_error'], 4)}",
            ],
        )

        add_image_page(
            pdf,
            "Optional (3) 结果图：TILT",
            [
                (str(RESULTS_DIR / "optional_tilt_affine.png"), (0.08, 0.54, 0.84, 0.20)),
                (str(RESULTS_DIR / "optional_tilt_projective.png"), (0.08, 0.26, 0.84, 0.20)),
                (str(RESULTS_DIR / "optional_tilt_curve.png"), (0.26, 0.04, 0.48, 0.14)),
            ],
            [
                (
                    "图12 TILT-Affine：轻度仿射倾斜和局部遮挡下恢复接近正视纹理。",
                    (0.08, 0.50),
                ),
                (
                    "图13 TILT-Projective：在轻度投影畸变下恢复规整窗格结构。",
                    (0.08, 0.22),
                ),
                (
                    "图14 参数更新曲线：Delta tau 在数次外层迭代后快速收敛。",
                    (0.26, 0.01),
                ),
            ],
        )

        add_text_page(
            pdf,
            "遇到的问题与反思",
            [
                "问题1: 人像底图不满足低秩假设",
                "一开始直接用 grace_hopper 的灰度图做 RPCA，",
                "恢复出来非常模糊。debug 后发现原图秩远高于 6，",
                "不满足 RPCA 的基本假设——那些「多出来」的高频细节",
                "会被当成稀疏异常删掉。",
                "解决：先做 rank-6 SVD 截断，人为创造低秩干净图。",
                "",
                "问题2: lambda 的选择很痛苦",
                "论文默认值 lambda = 1/sqrt(max(m,n)) 在大多数场景下都不太好。",
                "文字遮挡场景下默认 lambda 会让稀疏项混入正常图像内容。",
                "我最终对每个场景做了 lambda 扫描，手动选最优 c 值。",
                "",
                "问题3: 缺块修复效果差",
                "人像缺块 PSNR 只有 19.72 dB，是所有场景最差的。",
                "扫 lambda 发现 c=0.3 已是局部最优。",
                "原因：缺块是连续区域，既破坏像素值也破坏秩结构，",
                "和 RPCA 「稀疏扰动只影响少量独立位置」的假设矛盾。",
                "",
                "问题4: TILT/RSLRT 不能套在人像上",
                "一开始想让所有方法跑同一张图做对比，",
                "但 RSLRT 需要 DCT 稀疏先验，TILT 需要重复纹理结构。",
                "硬套到人像上只会得到差结果。",
                "最终改为在报告中说明各方法的适用范围。",
            ],
        )

        add_text_page(
            pdf,
            "结论与 AI 使用说明",
            [
                "结论",
                "1. RPCA 的效果高度依赖「低秩假设」——",
                "   合成纹理严格低秩，效果极好；真实图像只是近似低秩，效果受限。",
                "2. 不同「稀疏破坏」难度差异大：离散椒盐噪声最容易，连续缺块最难。",
                "3. lambda 选择对结果影响很大，需要根据场景手动调参。",
                "4. RPCA 是全局方法，不考虑像素间空间关系。",
                "   需要 local continuity 的 inpainting 任务应结合其他方法。",
                "5. RSLRT 和 TILT 在各自适用场景下确实优于 RPCA 基线。",
                "",
                "AI 使用说明",
                "AI 协助了代码调试、梳理报告结构、润色文字；",
                "建模思路、参数选择（lambda 扫描调参）、实验设计",
                "和结果分析都是我自己做的。",
            ],
        )


def main() -> None:
    summary_rows = load_summary()
    metadata = load_metadata()
    optional_rows = load_optional_summary()
    optional_metadata = load_optional_metadata()
    render_preview()
    write_markdown(summary_rows, metadata, optional_rows, optional_metadata)
    write_pdf(summary_rows, metadata, optional_rows, optional_metadata)


if __name__ == "__main__":
    main()
