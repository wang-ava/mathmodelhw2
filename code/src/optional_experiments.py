from __future__ import annotations

import csv
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
from matplotlib import font_manager as fm

from .metrics import psnr, relative_error, ssim, support_metrics
from .optional_textures import (
    build_sparse_low_rank_texture_sample,
    build_tilt_texture,
)
from .rslrt import repair_sparse_low_rank_texture
from .rpca import robust_pca
from .tilt import distort_texture, matrix_to_params, params_to_matrix, tilt_rectify


ROOT = Path(__file__).resolve().parents[2]
RESULTS_DIR = ROOT / "code" / "results"
ASSETS_DIR = ROOT / "code" / "assets"
FONT_NAME = "Songti SC" if "Songti SC" in {f.name for f in fm.fontManager.ttflist} else "DejaVu Sans"
plt.rcParams["font.family"] = FONT_NAME
plt.rcParams["axes.unicode_minus"] = False


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def save_gray(path: Path, image: np.ndarray) -> None:
    from PIL import Image

    ensure_parent(path)
    Image.fromarray(np.uint8(np.clip(image, 0.0, 1.0) * 255.0), mode="L").save(path)


def write_csv(path: Path, rows: list[dict[str, float | int | str]]) -> None:
    ensure_parent(path)
    if not rows:
        return
    fieldnames = list(dict.fromkeys(key for row in rows for key in row.keys()))
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_markdown(path: Path, rows: list[dict[str, float | int | str]]) -> None:
    headers = list(dict.fromkeys(key for row in rows for key in row.keys()))
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    for row in rows:
        values = []
        for key in headers:
            value = row.get(key, "")
            if isinstance(value, float):
                values.append(f"{value:.4f}" if abs(value) < 100 else f"{value:.2f}")
            else:
                values.append(str(value))
        lines.append("| " + " | ".join(values) + " |")
    ensure_parent(path)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def export_rslrt_overview(
    clean: np.ndarray,
    observed: np.ndarray,
    repaired: np.ndarray,
    sparse_support: np.ndarray,
    out_path: Path,
) -> None:
    fig, axes = plt.subplots(1, 4, figsize=(12.4, 3.2))
    items = [clean, observed, repaired, sparse_support.astype(float)]
    titles = ["Ground Truth", "Corrupted Texture", "Repaired Texture", "Detected Support"]
    for ax, image, title in zip(axes, items, titles, strict=True):
        ax.imshow(image, cmap="gray", vmin=0.0, vmax=1.0)
        ax.set_title(title, fontsize=10)
        ax.axis("off")
    fig.suptitle("Optional (2): Repairing Sparse Low-rank Texture", fontsize=13)
    fig.tight_layout()
    ensure_parent(out_path)
    fig.savefig(out_path, dpi=220, bbox_inches="tight")
    plt.close(fig)


def export_rslrt_comparison(
    clean: np.ndarray,
    observed: np.ndarray,
    repaired_rslrt: np.ndarray,
    repaired_rpca: np.ndarray,
    out_path: Path,
) -> None:
    fig, axes = plt.subplots(1, 4, figsize=(12.4, 3.2))
    items = [clean, observed, repaired_rslrt, repaired_rpca]
    titles = ["Ground Truth", "Observed", "Sparse Low-rank Texture", "RPCA Baseline"]
    for ax, image, title in zip(axes, items, titles, strict=True):
        ax.imshow(image, cmap="gray", vmin=0.0, vmax=1.0)
        ax.set_title(title, fontsize=10)
        ax.axis("off")
    fig.suptitle("RSLRT 与 RPCA 的纹理修复对比", fontsize=13)
    fig.tight_layout()
    ensure_parent(out_path)
    fig.savefig(out_path, dpi=220, bbox_inches="tight")
    plt.close(fig)


def export_tilt_overview(
    clean: np.ndarray,
    observed: np.ndarray,
    rectified: np.ndarray,
    low_rank: np.ndarray,
    sparse: np.ndarray,
    title: str,
    out_path: Path,
) -> None:
    fig, axes = plt.subplots(1, 5, figsize=(15.2, 3.2))
    items = [clean, observed, rectified, low_rank, sparse]
    titles = ["Ground Truth", "Warped + Occluded", "Rectified", "Low-rank L", "|Sparse E|"]
    for ax, image, label in zip(axes, items, titles, strict=True):
        ax.imshow(image, cmap="gray", vmin=0.0, vmax=1.0)
        ax.set_title(label, fontsize=10)
        ax.axis("off")
    fig.suptitle(title, fontsize=13)
    fig.tight_layout()
    ensure_parent(out_path)
    fig.savefig(out_path, dpi=220, bbox_inches="tight")
    plt.close(fig)


def export_tilt_curve(delta_history: list[float], out_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(5.8, 3.4))
    ax.plot(np.arange(1, len(delta_history) + 1), delta_history, marker="o", linewidth=1.5, markersize=3)
    ax.set_xlabel("Outer Iteration")
    ax.set_ylabel(r"$||\Delta \tau||_2$")
    ax.set_title("TILT 参数更新幅度")
    ax.grid(alpha=0.3)
    fig.tight_layout()
    ensure_parent(out_path)
    fig.savefig(out_path, dpi=220, bbox_inches="tight")
    plt.close(fig)


def run_rslrt_experiment() -> tuple[list[dict[str, float | int | str]], dict[str, float]]:
    sample = build_sparse_low_rank_texture_sample(size=96, seed=5)
    observed_mask = ~sample.missing_mask

    rslrt_result = repair_sparse_low_rank_texture(
        sample.observed,
        observed_mask=observed_mask,
        lam=0.018,
        alpha=0.075,
        support_refinement_steps=3,
        support_quantile=0.90,
    )
    rpca_result = robust_pca(sample.observed, lam=0.95 / np.sqrt(max(sample.observed.shape)), tol=1e-6, max_iter=280)

    rslrt_support = support_metrics(sample.corruption_mask.astype(float), rslrt_result.detected_support.astype(float))
    rpca_support = support_metrics(sample.corruption_mask.astype(float), (np.abs(rpca_result.sparse) > 0.05).astype(float))

    export_rslrt_overview(
        clean=sample.clean,
        observed=sample.observed,
        repaired=rslrt_result.repaired,
        sparse_support=rslrt_result.detected_support,
        out_path=RESULTS_DIR / "optional_rslrt_overview.png",
    )
    export_rslrt_comparison(
        clean=sample.clean,
        observed=sample.observed,
        repaired_rslrt=rslrt_result.repaired,
        repaired_rpca=np.clip(rpca_result.low_rank, 0.0, 1.0),
        out_path=RESULTS_DIR / "optional_rslrt_vs_rpca.png",
    )

    save_gray(ASSETS_DIR / "optional_rslrt_clean.png", sample.clean)
    save_gray(ASSETS_DIR / "optional_rslrt_observed.png", sample.observed)
    save_gray(ASSETS_DIR / "optional_rslrt_repaired.png", rslrt_result.repaired)
    save_gray(ASSETS_DIR / "optional_rslrt_support.png", rslrt_result.detected_support.astype(float))

    rows = [
        {
            "task": "repair_sparse_low_rank_texture",
            "method": "SparseLowRankTexture",
            "psnr": psnr(sample.clean, rslrt_result.repaired),
            "ssim": ssim(sample.clean, rslrt_result.repaired),
            "rel_error": relative_error(sample.clean, rslrt_result.repaired),
            "support_f1": rslrt_support["f1"],
            "iterations": rslrt_result.iterations,
        },
        {
            "task": "repair_sparse_low_rank_texture",
            "method": "RPCA",
            "psnr": psnr(sample.clean, np.clip(rpca_result.low_rank, 0.0, 1.0)),
            "ssim": ssim(sample.clean, np.clip(rpca_result.low_rank, 0.0, 1.0)),
            "rel_error": relative_error(sample.clean, np.clip(rpca_result.low_rank, 0.0, 1.0)),
            "support_f1": rpca_support["f1"],
            "iterations": rpca_result.iterations,
        },
    ]
    summary = {
        "rslrt_psnr": psnr(sample.clean, rslrt_result.repaired),
        "rslrt_ssim": ssim(sample.clean, rslrt_result.repaired),
        "rslrt_support_f1": rslrt_support["f1"],
        "rslrt_gain_over_rpca": psnr(sample.clean, rslrt_result.repaired) - psnr(sample.clean, np.clip(rpca_result.low_rank, 0.0, 1.0)),
    }
    return rows, summary


def run_tilt_experiment(mode: str) -> tuple[list[dict[str, float | int | str]], dict[str, float]]:
    clean = build_tilt_texture(size=96)
    if mode == "affine":
        true_matrix = np.array([[1.0, 0.08, 0.0], [-0.02, 1.0, 0.0], [0.0, 0.0, 1.0]], dtype=np.float64)
    else:
        true_matrix = np.array([[1.0, 0.05, 0.0], [-0.012, 1.0, 0.0], [0.005, -0.003, 1.0]], dtype=np.float64)
    true_params = matrix_to_params(true_matrix, mode=mode)

    observed = distort_texture(clean, true_params, mode=mode)
    if mode == "affine":
        observed[58:66, 54:68] = 0.0
    else:
        observed[58:66, 52:68] = 1.0

    tilt_result = tilt_rectify(
        observed,
        mode=mode,
        lam=0.05 if mode == "affine" else 0.06,
        max_outer_iter=12,
        max_inner_iter=60,
        pyramid_levels=1,
        reg=2e-3 if mode == "affine" else 4e-3,
    )

    export_tilt_overview(
        clean=clean,
        observed=observed,
        rectified=tilt_result.rectified,
        low_rank=tilt_result.low_rank,
        sparse=tilt_result.sparse,
        title=f"Optional (3): TILT ({'Affine' if mode == 'affine' else 'Projective'})",
        out_path=RESULTS_DIR / f"optional_tilt_{mode}.png",
    )
    if mode == "affine":
        export_tilt_curve(tilt_result.delta_history, RESULTS_DIR / "optional_tilt_curve.png")

    save_gray(ASSETS_DIR / f"optional_tilt_{mode}_clean.png", clean)
    save_gray(ASSETS_DIR / f"optional_tilt_{mode}_observed.png", observed)
    save_gray(ASSETS_DIR / f"optional_tilt_{mode}_rectified.png", tilt_result.rectified)
    save_gray(ASSETS_DIR / f"optional_tilt_{mode}_lowrank.png", tilt_result.low_rank)

    matrix_error = float(np.linalg.norm(params_to_matrix(tilt_result.parameters, mode=mode) - true_matrix, ord="fro"))
    rows = [
        {
            "task": f"tilt_{mode}",
            "method": "TILT",
            "psnr": psnr(clean, tilt_result.low_rank),
            "ssim": ssim(clean, tilt_result.low_rank),
            "rel_error": relative_error(clean, tilt_result.low_rank),
            "support_f1": 0.0,
            "iterations": tilt_result.iterations,
            "matrix_error": matrix_error,
        }
    ]
    summary = {
        f"tilt_{mode}_psnr": psnr(clean, tilt_result.low_rank),
        f"tilt_{mode}_ssim": ssim(clean, tilt_result.low_rank),
        f"tilt_{mode}_matrix_error": matrix_error,
    }
    return rows, summary


def main() -> None:
    rows: list[dict[str, float | int | str]] = []
    summary: dict[str, float] = {}

    rslrt_rows, rslrt_summary = run_rslrt_experiment()
    rows.extend(rslrt_rows)
    summary.update(rslrt_summary)

    affine_rows, affine_summary = run_tilt_experiment(mode="affine")
    rows.extend(affine_rows)
    summary.update(affine_summary)

    projective_rows, projective_summary = run_tilt_experiment(mode="projective")
    rows.extend(projective_rows)
    summary.update(projective_summary)

    write_csv(RESULTS_DIR / "optional_metrics.csv", rows)
    write_markdown(RESULTS_DIR / "optional_metrics.md", rows)
    ensure_parent(RESULTS_DIR / "optional_metadata.json")
    (RESULTS_DIR / "optional_metadata.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
