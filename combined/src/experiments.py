from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
from matplotlib import font_manager as fm
from scipy.ndimage import median_filter

from .image_utils import (
    Scenario,
    array_to_image,
    build_default_scenarios,
    ensure_parent,
    generate_color_texture,
    rgb_array_to_image,
)
from .metrics import psnr, relative_error, ssim, support_metrics
from .rpca import robust_pca


ROOT = Path(__file__).resolve().parents[2]
RESULTS_DIR = ROOT / "code" / "results"
ASSETS_DIR = ROOT / "code" / "assets"
FONT_NAME = "Songti SC" if "Songti SC" in {f.name for f in fm.fontManager.ttflist} else "DejaVu Sans"
plt.rcParams["font.family"] = FONT_NAME
plt.rcParams["axes.unicode_minus"] = False


def save_gray(path: Path, image: np.ndarray) -> None:
    ensure_parent(path)
    array_to_image(np.clip(image, 0.0, 1.0)).save(path)


def save_rgb(path: Path, image: np.ndarray) -> None:
    ensure_parent(path)
    rgb_array_to_image(np.clip(image, 0.0, 1.0)).save(path)


def metrics_for(clean: np.ndarray, low_rank: np.ndarray, sparse_gt: np.ndarray, sparse_hat: np.ndarray) -> dict[str, float]:
    sparse_scores = support_metrics(sparse_gt, sparse_hat)
    return {
        "psnr": psnr(clean, low_rank),
        "ssim": ssim(clean, low_rank),
        "rel_error": relative_error(clean, low_rank),
        "support_precision": sparse_scores["precision"],
        "support_recall": sparse_scores["recall"],
        "support_f1": sparse_scores["f1"],
    }


def export_triptych(
    scenario: Scenario,
    low_rank: np.ndarray,
    sparse_hat: np.ndarray,
    out_path: Path,
) -> None:
    fig, axes = plt.subplots(1, 4, figsize=(12, 3.2))
    images = [scenario.clean, scenario.observed, low_rank, np.abs(sparse_hat)]
    titles = ["Ground Truth", "Observed A", "Recovered L", "|Sparse S|"]
    for ax, image, title in zip(axes, images, titles, strict=True):
        ax.imshow(image, cmap="gray", vmin=0.0, vmax=1.0)
        ax.set_title(title, fontsize=10)
        ax.axis("off")
    fig.suptitle(scenario.title, fontsize=13, y=1.02)
    fig.tight_layout()
    ensure_parent(out_path)
    fig.savefig(out_path, dpi=220, bbox_inches="tight")
    plt.close(fig)


def export_saltpepper_comparison(
    clean: np.ndarray,
    observed: np.ndarray,
    rpca_low_rank: np.ndarray,
    sparse_hat: np.ndarray,
    out_path: Path,
) -> dict[str, float]:
    median = median_filter(observed, size=3)
    fig, axes = plt.subplots(1, 5, figsize=(15, 3))
    titles = ["Ground Truth", "Observed", "Median Filter", "RPCA L", "|RPCA S|"]
    images = [clean, observed, median, rpca_low_rank, np.abs(sparse_hat)]
    for ax, image, title in zip(axes, images, titles, strict=True):
        ax.imshow(image, cmap="gray", vmin=0.0, vmax=1.0)
        ax.set_title(title, fontsize=10)
        ax.axis("off")
    fig.tight_layout()
    ensure_parent(out_path)
    fig.savefig(out_path, dpi=220, bbox_inches="tight")
    plt.close(fig)
    return {"median_psnr": psnr(clean, median), "median_ssim": ssim(clean, median)}


def export_convergence_curve(residuals: list[float], out_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(5.8, 3.6))
    ax.plot(np.arange(1, len(residuals) + 1), residuals, marker="o", linewidth=1.5, markersize=3)
    ax.set_xlabel("Iteration")
    ax.set_ylabel(r"$||A-L-S||_F / ||A||_F$")
    ax.set_title("RPCA 收敛曲线")
    ax.grid(alpha=0.3)
    fig.tight_layout()
    ensure_parent(out_path)
    fig.savefig(out_path, dpi=220, bbox_inches="tight")
    plt.close(fig)


def export_lambda_curve(
    scenario: Scenario,
    lambda_scales: list[float],
    base_lambda: float,
    max_iter: int,
    out_path: Path,
) -> list[dict[str, float]]:
    rows: list[dict[str, float]] = []
    for scale in lambda_scales:
        result = robust_pca(scenario.observed, lam=base_lambda * scale, tol=1e-6, max_iter=max_iter)
        stats = metrics_for(scenario.clean, result.low_rank, scenario.sparse_gt, result.sparse)
        rows.append(
            {
                "scale": scale,
                "lambda": result.lam,
                "psnr": stats["psnr"],
                "ssim": stats["ssim"],
                "rank": result.ranks[-1],
                "sparse_ratio": result.sparse_ratios[-1],
            }
        )

    fig, axes = plt.subplots(1, 2, figsize=(10.4, 3.6))
    axes[0].plot([row["scale"] for row in rows], [row["psnr"] for row in rows], marker="o", label="PSNR")
    axes[0].plot([row["scale"] for row in rows], [row["ssim"] * 30 for row in rows], marker="s", label="30 x SSIM")
    axes[0].set_xlabel(r"$\lambda / \lambda_0$")
    axes[0].set_title("恢复质量随 λ 变化")
    axes[0].grid(alpha=0.3)
    axes[0].legend()

    axes[1].plot([row["scale"] for row in rows], [row["rank"] for row in rows], marker="o", label="Recovered Rank")
    axes[1].plot([row["scale"] for row in rows], [100 * row["sparse_ratio"] for row in rows], marker="s", label="Sparse Ratio (%)")
    axes[1].set_xlabel(r"$\lambda / \lambda_0$")
    axes[1].set_title("结构复杂度随 λ 变化")
    axes[1].grid(alpha=0.3)
    axes[1].legend()

    fig.tight_layout()
    ensure_parent(out_path)
    fig.savefig(out_path, dpi=220, bbox_inches="tight")
    plt.close(fig)
    return rows


def export_color_extension(out_path: Path) -> dict[str, float]:
    clean = generate_color_texture(size=150)
    observed = clean.copy()
    observed[22:38, 100:118, :] = np.array([1.0, 0.85, 0.1])
    observed[88:102, 32:52, :] = np.array([0.1, 0.95, 0.75])
    for idx in range(3):
        observed[40 + idx : 43 + idx, 20:130, idx] = 1.0

    recovered_channels = []
    sparse_channels = []
    for idx in range(3):
        result = robust_pca(
            observed[:, :, idx],
            lam=0.25 / np.sqrt(clean.shape[0]),
            tol=1e-6,
            max_iter=220,
        )
        recovered_channels.append(result.low_rank)
        sparse_channels.append(np.abs(result.sparse))

    recovered = np.stack(recovered_channels, axis=-1)
    sparse = np.stack(sparse_channels, axis=-1)

    fig, axes = plt.subplots(1, 4, figsize=(12.2, 3.3))
    images = [clean, observed, recovered, sparse / max(sparse.max(), 1e-12)]
    titles = ["Clean RGB", "Observed RGB", "Recovered RGB", "|Sparse RGB|"]
    for ax, image, title in zip(axes, images, titles, strict=True):
        ax.imshow(np.clip(image, 0.0, 1.0))
        ax.set_title(title, fontsize=10)
        ax.axis("off")
    fig.suptitle("加分实验：彩色纹理逐通道 RPCA", fontsize=13, y=1.02)
    fig.tight_layout()
    ensure_parent(out_path)
    fig.savefig(out_path, dpi=220, bbox_inches="tight")
    plt.close(fig)

    channel_psnr = float(np.mean([psnr(clean[:, :, i], recovered[:, :, i]) for i in range(3)]))
    channel_ssim = float(np.mean([ssim(clean[:, :, i], recovered[:, :, i]) for i in range(3)]))
    save_rgb(ASSETS_DIR / "color_clean.png", clean)
    save_rgb(ASSETS_DIR / "color_observed.png", observed)
    save_rgb(ASSETS_DIR / "color_recovered.png", recovered)
    return {"color_psnr": channel_psnr, "color_ssim": channel_ssim}


def write_csv(path: Path, rows: list[dict[str, float | int | str]]) -> None:
    ensure_parent(path)
    if not rows:
        return
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def write_markdown_summary(path: Path, rows: list[dict[str, float | int | str]]) -> None:
    headers = list(rows[0].keys())
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    for row in rows:
        formatted = []
        for key in headers:
            value = row[key]
            if isinstance(value, float):
                if math.isinf(value):
                    formatted.append(">99.99")
                elif "psnr" in key:
                    formatted.append(f"{value:.2f}")
                elif "ssim" in key or "support" in key or key == "lambda":
                    formatted.append(f"{value:.4f}")
                elif key == "rel_error":
                    formatted.append(f"{value:.4f}")
                else:
                    formatted.append(f"{value:.4f}")
            else:
                formatted.append(str(value))
        lines.append("| " + " | ".join(formatted) + " |")
    ensure_parent(path)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def export_unified_grid(
    scenarios: list[Scenario],
    results_map: dict[str, tuple[np.ndarray, np.ndarray]],
    out_path: Path,
) -> None:
    fig, axes = plt.subplots(2, 3, figsize=(15, 8))
    grid_names = ["portrait_text", "portrait_block", "portrait_salt", "texture_text", "texture_block", "texture_salt"]
    col_titles = ["Text Occlusion", "Block Missing", "Salt-and-Pepper"]
    row_titles = ["Portrait (Grace Hopper)", "Synthetic Texture"]

    for row_idx in range(2):
        for col_idx in range(3):
            ax = axes[row_idx, col_idx]
            name = grid_names[row_idx * 3 + col_idx]
            low_rank, sparse = results_map[name]
            stacked = np.hstack([scenarios[[s.name for s in scenarios].index(name)].clean,
                                 scenarios[[s.name for s in scenarios].index(name)].observed,
                                 low_rank,
                                 np.abs(sparse) / max(np.max(np.abs(sparse)), 1e-12)])
            ax.imshow(stacked, cmap="gray", vmin=0.0, vmax=1.0)
            if row_idx == 0:
                ax.set_title(col_titles[col_idx], fontsize=11, fontweight="bold")
            if col_idx == 0:
                ax.set_ylabel(row_titles[row_idx], fontsize=10)
            ax.set_xticks([])
            ax.set_yticks([])

    fig.suptitle("RPCA Unified Comparison: 2 Base Images x 3 Corruption Types", fontsize=14, y=0.98)
    fig.text(0.5, 0.01, "Each row: Clean | Observed | Recovered L | |Sparse S|", ha="center", fontsize=9, color="gray")
    fig.tight_layout(rect=[0, 0.03, 1, 0.95])
    ensure_parent(out_path)
    fig.savefig(out_path, dpi=220, bbox_inches="tight")
    plt.close(fig)


def main() -> None:
    scenarios = build_default_scenarios(size=160)
    summary_rows: list[dict[str, float | int | str]] = []
    results_map: dict[str, tuple[np.ndarray, np.ndarray]] = {}

    for scenario in scenarios:
        save_gray(ASSETS_DIR / f"{scenario.name}_clean.png", scenario.clean)
        save_gray(ASSETS_DIR / f"{scenario.name}_observed.png", scenario.observed)

        default_lambda = 1.0 / np.sqrt(max(scenario.observed.shape))
        result = robust_pca(
            scenario.observed,
            lam=scenario.lambda_scale * default_lambda,
            tol=1e-6,
            max_iter=250,
        )
        stats = metrics_for(scenario.clean, result.low_rank, scenario.sparse_gt, result.sparse)

        results_map[scenario.name] = (result.low_rank, result.sparse)
        save_gray(ASSETS_DIR / f"{scenario.name}_recovered.png", result.low_rank)
        save_gray(ASSETS_DIR / f"{scenario.name}_sparse.png", np.abs(result.sparse) / max(np.max(np.abs(result.sparse)), 1e-12))
        export_triptych(scenario, result.low_rank, result.sparse, RESULTS_DIR / f"{scenario.name}_overview.png")

        summary_rows.append(
            {
                "scenario": scenario.name,
                "method": "RPCA",
                "lambda": result.lam,
                "iterations": result.iterations,
                "rank": result.ranks[-1],
                "psnr": stats["psnr"],
                "ssim": stats["ssim"],
                "rel_error": stats["rel_error"],
                "support_precision": stats["support_precision"],
                "support_recall": stats["support_recall"],
                "support_f1": stats["support_f1"],
            }
        )

        if scenario.name == "portrait_salt":
            comparison = export_saltpepper_comparison(
                clean=scenario.clean,
                observed=scenario.observed,
                rpca_low_rank=result.low_rank,
                sparse_hat=result.sparse,
                out_path=RESULTS_DIR / "saltpepper_vs_median.png",
            )
            median_recovered = median_filter(scenario.observed, size=3)
            summary_rows.append(
                {
                    "scenario": scenario.name,
                    "method": "Median(3x3)",
                    "lambda": 0.0,
                    "iterations": 1,
                    "rank": int(np.linalg.matrix_rank(median_recovered)),
                    "psnr": comparison["median_psnr"],
                    "ssim": comparison["median_ssim"],
                    "rel_error": relative_error(scenario.clean, median_recovered),
                    "support_precision": 0.0,
                    "support_recall": 0.0,
                    "support_f1": 0.0,
                }
            )
            export_convergence_curve(result.residuals, RESULTS_DIR / "convergence_curve.png")
            lambda_rows = export_lambda_curve(
                scenario=scenario,
                lambda_scales=[0.4, 0.6, 0.8, 1.0, 1.2, 1.5, 1.8],
                base_lambda=default_lambda,
                max_iter=180,
                out_path=RESULTS_DIR / "lambda_sensitivity.png",
            )
            write_csv(RESULTS_DIR / "lambda_sensitivity.csv", lambda_rows)

        if scenario.name == "texture_salt":
            comparison = export_saltpepper_comparison(
                clean=scenario.clean,
                observed=scenario.observed,
                rpca_low_rank=result.low_rank,
                sparse_hat=result.sparse,
                out_path=RESULTS_DIR / "saltpepper_vs_median_texture.png",
            )
            median_recovered = median_filter(scenario.observed, size=3)
            summary_rows.append(
                {
                    "scenario": scenario.name,
                    "method": "Median(3x3)",
                    "lambda": 0.0,
                    "iterations": 1,
                    "rank": int(np.linalg.matrix_rank(median_recovered)),
                    "psnr": comparison["median_psnr"],
                    "ssim": comparison["median_ssim"],
                    "rel_error": relative_error(scenario.clean, median_recovered),
                    "support_precision": 0.0,
                    "support_recall": 0.0,
                    "support_f1": 0.0,
                }
            )

    export_unified_grid(scenarios, results_map, RESULTS_DIR / "unified_grid.png")

    color_stats = export_color_extension(RESULTS_DIR / "color_extension.png")

    write_csv(RESULTS_DIR / "summary_metrics.csv", summary_rows)
    write_markdown_summary(RESULTS_DIR / "summary_metrics.md", summary_rows)

    metadata = {
        "font_name": FONT_NAME,
        "color_extension": color_stats,
    }
    ensure_parent(RESULTS_DIR / "metadata.json")
    (RESULTS_DIR / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
