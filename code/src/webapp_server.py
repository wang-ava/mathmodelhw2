from __future__ import annotations

import argparse
import base64
import csv
import json
import mimetypes
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
from PIL import Image, ImageOps

from .metrics import psnr, relative_error, ssim
from .rpca import RPCAResult, robust_pca


def _safe_float(val: str, inf_sentinel: float = 9999.0) -> float:
    """Parse a float, converting inf/nan to a sentinel so JSON stays valid."""
    f = float(val)
    if np.isinf(f):
        return inf_sentinel
    if np.isnan(f):
        return 0.0
    return f


ROOT = Path(__file__).resolve().parents[2]
SITE_DIR = ROOT / "code" / "site"
RESULTS_DIR = ROOT / "code" / "results"
ASSETS_DIR = ROOT / "code" / "assets"
REPORT_DIR = ROOT / "code" / "report"


EXPERIMENT_CONFIG = {
    "portrait_text": {
        "title": "人像文字遮挡",
        "subtitle": "在高对比度文字遮挡下，rank-6 人像的 RPCA 分离效果。",
        "story": "将干净人像压缩到 rank-6，然后叠加 MASK/RPCA 文字。RPCA 将文字遮挡分离到稀疏项 S 中，同时保留人像主体轮廓。",
        "overview": "/results/portrait_text_overview.png",
        "clean": "/assets/portrait_text_clean.png",
        "observed": "/assets/portrait_text_observed.png",
        "recovered": "/assets/portrait_text_recovered.png",
        "sparse": "/assets/portrait_text_sparse.png",
    },
    "portrait_block": {
        "title": "人像缺块修复",
        "subtitle": "人像底图上挖去一个矩形块，RPCA 尝试恢复缺失区域。",
        "story": "一个亮色矩形块替换了人像的一部分。RPCA 将该块视为稀疏异常，尝试恢复底层结构。",
        "overview": "/results/portrait_block_overview.png",
        "clean": "/assets/portrait_block_clean.png",
        "observed": "/assets/portrait_block_observed.png",
        "recovered": "/assets/portrait_block_recovered.png",
        "sparse": "/assets/portrait_block_sparse.png",
    },
    "portrait_salt": {
        "title": "人像椒盐去噪",
        "subtitle": "10% 椒盐噪声 + rank-6 人像，并与中值滤波对比。",
        "story": "椒盐噪声是典型的稀疏异常，每个噪点只影响单个像素。RPCA 将脉冲噪声分离到稀疏项，不触碰干净像素，效果远超 3x3 中值滤波。",
        "overview": "/results/portrait_salt_overview.png",
        "comparison": "/results/saltpepper_vs_median.png",
        "clean": "/assets/portrait_salt_clean.png",
        "observed": "/assets/portrait_salt_observed.png",
        "recovered": "/assets/portrait_salt_recovered.png",
        "sparse": "/assets/portrait_salt_sparse.png",
    },
    "texture_text": {
        "title": "纹理文字遮挡",
        "subtitle": "在 rank-4 合成纹理上叠加文字和划痕。",
        "story": "光滑低秩纹理上叠加了文字和划痕线。由于纹理严格低秩，RPCA 能精确恢复原始纹理。",
        "overview": "/results/texture_text_overview.png",
        "clean": "/assets/texture_text_clean.png",
        "observed": "/assets/texture_text_observed.png",
        "recovered": "/assets/texture_text_recovered.png",
        "sparse": "/assets/texture_text_sparse.png",
    },
    "texture_block": {
        "title": "纹理缺块修复",
        "subtitle": "rank-4 合成纹理上的块缺失和划痕修复。",
        "story": "纹理图由平滑基函数构造，天然低秩。RPCA 能够准确恢复缺失块。",
        "overview": "/results/texture_block_overview.png",
        "clean": "/assets/texture_block_clean.png",
        "observed": "/assets/texture_block_observed.png",
        "recovered": "/assets/texture_block_recovered.png",
        "sparse": "/assets/texture_block_sparse.png",
    },
    "texture_salt": {
        "title": "纹理椒盐去噪",
        "subtitle": "10% 椒盐噪声 + rank-4 纹理。",
        "story": "低秩纹理上的椒盐噪声。RPCA 通过隔离稀疏噪声分量实现极高 PSNR。",
        "overview": "/results/texture_salt_overview.png",
        "comparison": "/results/saltpepper_vs_median_texture.png",
        "clean": "/assets/texture_salt_clean.png",
        "observed": "/assets/texture_salt_observed.png",
        "recovered": "/assets/texture_salt_recovered.png",
        "sparse": "/assets/texture_salt_sparse.png",
    },
}


def load_summary_rows() -> list[dict[str, str]]:
    with (RESULTS_DIR / "summary_metrics.csv").open("r", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def load_metadata() -> dict[str, Any]:
    return json.loads((RESULTS_DIR / "metadata.json").read_text(encoding="utf-8"))


def load_optional_metadata() -> dict[str, Any]:
    path = RESULTS_DIR / "optional_metadata.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def metric_row(rows: list[dict[str, str]], scenario: str, method: str = "RPCA") -> dict[str, str]:
    for row in rows:
        if row["scenario"] == scenario and row["method"] == method:
            return row
    raise KeyError((scenario, method))


def experiment_payload() -> dict[str, Any]:
    rows = load_summary_rows()
    metadata = load_metadata()
    optional_metadata = load_optional_metadata()
    median = metric_row(rows, "portrait_salt", "Median(3x3)")

    experiments = []
    for scenario in ["portrait_text", "portrait_block", "portrait_salt", "texture_text", "texture_block", "texture_salt"]:
        rpca_row = metric_row(rows, scenario)
        entry = {
            "name": scenario,
            "title": EXPERIMENT_CONFIG[scenario]["title"],
            "subtitle": EXPERIMENT_CONFIG[scenario]["subtitle"],
            "story": EXPERIMENT_CONFIG[scenario]["story"],
            "images": {key: value for key, value in EXPERIMENT_CONFIG[scenario].items() if key in {"overview", "comparison", "clean", "observed", "recovered", "sparse"}},
            "metrics": {
                "psnr": _safe_float(rpca_row["psnr"]),
                "ssim": _safe_float(rpca_row["ssim"]),
                "rel_error": _safe_float(rpca_row["rel_error"]),
                "support_f1": _safe_float(rpca_row["support_f1"]),
                "lambda": _safe_float(rpca_row["lambda"]),
                "iterations": int(rpca_row["iterations"]),
                "rank": int(rpca_row["rank"]),
            },
        }
        experiments.append(entry)

    salt = metric_row(rows, "portrait_salt", "RPCA")

    # Build summary rows for the table
    summary_rows = []
    for row in rows:
        summary_rows.append({
            "scenario": row["scenario"],
            "method": row["method"],
            "psnr": row["psnr"],
            "ssim": row["ssim"],
            "rel_error": row["rel_error"],
            "support_f1": row["support_f1"],
            "lambda": row["lambda"],
            "iterations": row["iterations"],
            "rank": row["rank"],
        })

    return {
        "hero": {
            "eyebrow": "数学建模 / 作业二 / 选题二",
            "title": "RPCA 图像修复",
            "subtitle": "A = L + S \u2014 用低秩 + 稀疏分解修复被污染的图像。2 种底图 \u00d7 3 种破坏类型，加上 RSLRT 和 TILT 两个论文复现。",
            "stats": [
                {"label": "文字遮挡 PSNR", "value": f'{_safe_float(metric_row(rows, "portrait_text")["psnr"]):.2f} dB'},
                {"label": "纹理椒盐 PSNR", "value": "inf" if _safe_float(metric_row(rows, "texture_salt")["psnr"]) >= 9999 else f'{_safe_float(metric_row(rows, "texture_salt")["psnr"]):.2f} dB'},
                {"label": "椒盐去噪提升", "value": f'+{_safe_float(salt["psnr"]) - _safe_float(median["psnr"]):.2f} dB'},
                {"label": "彩色扩展", "value": f'{metadata["color_extension"]["color_psnr"]:.2f} dB'},
            ],
        },
        "experiments": experiments,
        "analysis_panels": [
            {
                "title": "\u03bb \u654f\u611f\u6027\u5206\u6790",
                "description": "\u5728\u690e\u76d0\u566a\u58f0\u5b9e\u9a8c\u4e2d\uff0c\u53c2\u6570 c \u4ece 0.4 \u63d0\u5347\u5230 1.5 \u65f6\uff0c\u6062\u590d\u8d28\u91cf\u6301\u7eed\u53d8\u597d\uff1bc \u8fc7\u5927\u540e\u5f00\u59cb\u56de\u843d\u3002\u8fd9\u5f20\u56fe\u771f\u6b63\u8ba9\u6211\u7406\u89e3\u4e86 \u03bb \u7684\u7269\u7406\u542b\u4e49\u3002",
                "image": "/results/lambda_sensitivity.png",
            },
            {
                "title": "\u6536\u655b\u66f2\u7ebf",
                "description": "Inexact ALM \u5728 30 \u4f59\u6b21\u8fed\u4ee3\u540e\u6536\u655b\uff0c\u6b8b\u5dee\u66f2\u7ebf\u5e73\u6ed1\u4e0b\u964d\u3002\u03bc \u7684\u6307\u6570\u589e\u957f\u7b56\u7565\uff08\u6bcf\u6b21\u4e58 \u03c1=1.5\uff09\u8ba9\u6536\u655b\u901f\u5ea6\u975e\u5e38\u5feb\u3002",
                "image": "/results/convergence_curve.png",
            },
            {
                "title": "\u5f69\u8272\u7eb9\u7406\u6269\u5c55",
                "description": f"\u5bf9\u5f69\u8272\u7eb9\u7406\u56fe\u91c7\u7528\u9010\u901a\u9053 RPCA\uff0cPSNR={metadata['color_extension']['color_psnr']:.2f} dB\u3002\u539f\u56fe\u3001\u9000\u5316\u89c2\u6d4b\u548c\u4f4e\u79e9\u6062\u590d\u5171\u540c\u8bf4\u660e\u7070\u5ea6\u77e9\u9635\u5206\u89e3\u53ef\u4ee5\u8fc1\u79fb\u5230 RGB \u4e09\u901a\u9053\u5904\u7406\u3002",
                "images": [
                    {"label": "\u771f\u503c", "src": "/assets/color_clean.png", "alt": "\u5f69\u8272\u539f\u56fe"},
                    {"label": "\u89c2\u6d4b", "src": "/assets/color_observed.png", "alt": "\u5f69\u8272\u9000\u5316\u89c2\u6d4b"},
                    {"label": "\u6062\u590d", "src": "/assets/color_recovered.png", "alt": "\u5f69\u8272\u4f4e\u79e9\u6062\u590d"},
                ],
                "image": "/results/color_extension.png",
            },
            {
                "title": "\u7edf\u4e00\u5bf9\u6bd4\u7f51\u683c",
                "description": "2 \u79cd\u5e95\u56fe \u00d7 3 \u79cd\u7834\u574f\u7c7b\u578b\u7684\u5b8c\u6574\u5bf9\u6bd4\u3002\u6bcf\u683c\u4ece\u5de6\u5230\u53f3\uff1a\u5e72\u51c0\u56fe / \u89c2\u6d4b\u56fe / \u6062\u590d L / |S|\u3002\u7eb9\u7406\u5e95\u56fe\u5168\u9762\u78be\u538b\u4eba\u50cf\u5e95\u56fe\u3002",
                "image": "/results/unified_grid.png",
            },
            {
                "title": "RPCA vs \u4e2d\u503c\u6ee4\u6ce2",
                "description": f"\u4eba\u50cf\u690e\u76d0\u573a\u666f\uff1aRPCA PSNR={float(salt['psnr']):.2f} dB\uff0c\u4e2d\u503c\u6ee4\u6ce2 {float(median['psnr']):.2f} dB\u3002\u4e2d\u503c\u6ee4\u6ce2\u6a21\u7cca\u8fb9\u7f18\uff0cRPCA \u5168\u5c40\u5265\u79bb\u566a\u70b9\u3002",
                "image": "/results/saltpepper_vs_median.png",
            },
            {
                "title": "进阶模型验证：RSLRT",
                "description": f"\u52a0\u5165 DCT \u7a00\u758f\u5148\u9a8c\u540e PSNR \u63d0\u5347\u5230 {optional_metadata.get('rslrt_psnr', 0.0):.2f} dB\uff0c\u76f8\u5bf9 RPCA \u57fa\u7ebf\u63d0\u5347\u7ea6 {optional_metadata.get('rslrt_gain_over_rpca', 0.0):.2f} dB\u3002",
                "image": "/results/optional_rslrt_vs_rpca.png",
            },
            {
                "title": "进阶模型验证：TILT",
                "description": f"TILT affine/projective \u5206\u522b\u8fbe\u5230 {optional_metadata.get('tilt_affine_psnr', 0.0):.2f} dB \u548c {optional_metadata.get('tilt_projective_psnr', 0.0):.2f} dB\uff0c\u53d8\u6362\u77e9\u9635\u8bef\u5dee\u4ec5 0.003/0.006\u3002",
                "image": "/results/optional_tilt_projective.png",
            },
            {
                "title": "RSLRT \u7ed3\u679c\u8be6\u60c5",
                "description": "\u5728\u5927\u5757\u7f3a\u5931\u548c\u7ec6\u7ebf\u6c61\u67d3\u540c\u65f6\u5b58\u5728\u65f6\uff0c\u53cc\u5148\u9a8c\u6a21\u578b\u80fd\u8f83\u597d\u6062\u590d\u7eb9\u7406\u7ed3\u6784\u3002\u7a97\u683c\u7eb9\u7406\u8fb9\u754c\u66f4\u5b8c\u6574\u3001\u66f4\u5e72\u51c0\u3002",
                "image": "/results/optional_rslrt_overview.png",
            },
            {
                "title": "TILT \u53c2\u6570\u66f2\u7ebf",
                "description": "\u5916\u5c42\u5faa\u73af\u4f30\u8ba1\u53d8\u6362\u53c2\u6570\uff0c\u5185\u5c42 ALM \u66f4\u65b0 L\u3001E\u3002\u91d1\u5b57\u5854\u7b56\u7565\u5148\u4f4e\u5206\u8fa8\u7387\u7c97\u8c03\uff0c\u518d\u9ad8\u5206\u8fa8\u7387\u7cbe\u8c03\u3002",
                "image": "/results/optional_tilt_curve.png",
            },
        ],
        "optional": {
            "rslrt": {
                "psnr": optional_metadata.get("rslrt_psnr", 0.0),
                "ssim": optional_metadata.get("rslrt_ssim", 0.0),
                "support_f1": optional_metadata.get("rslrt_support_f1", 0.0),
                "gain_over_rpca": optional_metadata.get("rslrt_gain_over_rpca", 0.0),
            },
            "tilt_affine": {
                "psnr": optional_metadata.get("tilt_affine_psnr", 0.0),
                "ssim": optional_metadata.get("tilt_affine_ssim", 0.0),
                "matrix_error": optional_metadata.get("tilt_affine_matrix_error", 0.0),
            },
            "tilt_projective": {
                "psnr": optional_metadata.get("tilt_projective_psnr", 0.0),
                "ssim": optional_metadata.get("tilt_projective_ssim", 0.0),
                "matrix_error": optional_metadata.get("tilt_projective_matrix_error", 0.0),
            },
        },
        "summary_rows": summary_rows,
        "baseline": {
            "median_psnr": float(median["psnr"]),
            "median_ssim": float(median["ssim"]),
        },
        "report": "/report/report.pdf",
    }


def clamp_scale(value: float) -> float:
    return min(2.8, max(0.2, value))


def clamp_iters(value: int) -> int:
    return min(320, max(40, value))


def decode_data_url(data_url: str) -> Image.Image:
    encoded = data_url.split(",", 1)[1] if "," in data_url else data_url
    raw = base64.b64decode(encoded)
    image = Image.open(BytesIO(raw))
    image = ImageOps.exif_transpose(image)
    if image.mode in {"RGBA", "LA"}:
        background = Image.new("RGBA", image.size, (245, 239, 226, 255))
        background.alpha_composite(image.convert("RGBA"))
        image = background.convert("RGB")
    return image


def fit_image(image: Image.Image, max_side: int = 180) -> Image.Image:
    width, height = image.size
    scale = min(1.0, max_side / max(width, height))
    target = (max(1, int(width * scale)), max(1, int(height * scale)))
    return image.resize(target, Image.Resampling.LANCZOS)


def image_to_data_url(image: Image.Image) -> str:
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    payload = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{payload}"


def normalize_sparse_visual(sparse: np.ndarray) -> np.ndarray:
    magnitude = np.abs(sparse)
    if magnitude.ndim == 2:
        return magnitude / max(float(magnitude.max()), 1e-12)
    return magnitude / max(float(magnitude.max()), 1e-12)


def array_to_pil(image: np.ndarray) -> Image.Image:
    if image.ndim == 2:
        return Image.fromarray(np.uint8(np.clip(image, 0.0, 1.0) * 255.0), mode="L")
    return Image.fromarray(np.uint8(np.clip(image, 0.0, 1.0) * 255.0), mode="RGB")


def solve_grayscale(image: np.ndarray, lambda_scale: float, max_iter: int) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    result = robust_pca(
        image,
        lam=lambda_scale / np.sqrt(max(image.shape)),
        tol=1e-6,
        max_iter=max_iter,
    )
    stats = {
        "mode": "灰度",
        "iterations": result.iterations,
        "rank": int(result.ranks[-1]),
        "sparse_ratio": float(result.sparse_ratios[-1]),
        "lambda": float(result.lam),
        "residual": float(result.residuals[-1]),
    }
    return result.low_rank, normalize_sparse_visual(result.sparse), stats


def solve_color(image: np.ndarray, lambda_scale: float, max_iter: int) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    lows = []
    sparses = []
    ranks = []
    sparse_ratios = []
    residuals = []
    iterations = []

    for idx in range(image.shape[2]):
        result: RPCAResult = robust_pca(
            image[:, :, idx],
            lam=lambda_scale / np.sqrt(max(image.shape[:2])),
            tol=1e-6,
            max_iter=max_iter,
        )
        lows.append(result.low_rank)
        sparses.append(result.sparse)
        ranks.append(int(result.ranks[-1]))
        sparse_ratios.append(float(result.sparse_ratios[-1]))
        residuals.append(float(result.residuals[-1]))
        iterations.append(int(result.iterations))

    low_rank = np.stack(lows, axis=-1)
    sparse = normalize_sparse_visual(np.stack(sparses, axis=-1))
    stats = {
        "mode": "彩色逐通道",
        "iterations": max(iterations),
        "rank": int(sum(ranks) / len(ranks)),
        "channel_ranks": ranks,
        "sparse_ratio": float(sum(sparse_ratios) / len(sparse_ratios)),
        "residual": float(sum(residuals) / len(residuals)),
        "lambda": float(lambda_scale / np.sqrt(max(image.shape[:2]))),
        "note": "彩色图像采用逐通道 RPCA 处理。",
    }
    return low_rank, sparse, stats


def uploaded_demo_payload(body: dict[str, Any]) -> dict[str, Any]:
    image_data = body.get("image_data", "")
    lambda_scale = clamp_scale(float(body.get("lambda_scale", 1.2)))
    max_iter = clamp_iters(int(body.get("max_iter", 180)))
    image = fit_image(decode_data_url(image_data), max_side=320)

    if image.mode in {"L", "1"}:
        observed = np.asarray(image.convert("L"), dtype=np.float64) / 255.0
        low_rank, sparse, stats = solve_grayscale(observed, lambda_scale=lambda_scale, max_iter=max_iter)
        observed_pil = array_to_pil(observed)
        recovered_pil = array_to_pil(low_rank)
        sparse_pil = array_to_pil(sparse)
    else:
        observed = np.asarray(image.convert("RGB"), dtype=np.float64) / 255.0
        low_rank, sparse, stats = solve_color(observed, lambda_scale=lambda_scale, max_iter=max_iter)
        observed_pil = array_to_pil(observed)
        recovered_pil = array_to_pil(low_rank)
        sparse_pil = array_to_pil(sparse)

    stats["input_size"] = f"{observed_pil.width} x {observed_pil.height}"
    stats["lambda_scale"] = lambda_scale
    stats["max_iter"] = max_iter
    stats["headline"] = "修复完成"

    return {
        "images": {
            "observed": image_to_data_url(observed_pil),
            "recovered": image_to_data_url(recovered_pil),
            "sparse": image_to_data_url(sparse_pil),
        },
        "stats": stats,
    }


class RPCAWebHandler(BaseHTTPRequestHandler):
    server_version = "RPCARepairAtlas/1.0"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path in {"/", "/index.html"}:
            self._serve_file(SITE_DIR / "index.html", no_cache=True)
            return
        if path == "/styles.css":
            self._serve_file(SITE_DIR / "styles.css", no_cache=True)
            return
        if path == "/app.js":
            self._serve_file(SITE_DIR / "app.js", no_cache=True)
            return
        if path == "/api/experiments":
            self._json_response(experiment_payload())
            return
        if path.startswith("/results/"):
            self._serve_scoped_file(RESULTS_DIR, path.removeprefix("/results/"))
            return
        if path.startswith("/assets/"):
            self._serve_scoped_file(ASSETS_DIR, path.removeprefix("/assets/"))
            return
        if path.startswith("/report/"):
            self._serve_scoped_file(REPORT_DIR, path.removeprefix("/report/"))
            return

        self.send_error(404, "Not Found")

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/denoise":
            self.send_error(404, "Not Found")
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length)
        try:
            body = json.loads(raw.decode("utf-8"))
            payload = uploaded_demo_payload(body)
        except Exception as exc:
            self._json_response({"error": str(exc)}, status=400)
            return
        self._json_response(payload)

    def _serve_scoped_file(self, root: Path, relative_path: str) -> None:
        target = (root / relative_path).resolve()
        try:
            target.relative_to(root.resolve())
        except ValueError:
            self.send_error(403, "Forbidden")
            return
        self._serve_file(target)

    def _serve_file(self, path: Path, no_cache: bool = False) -> None:
        if not path.exists() or not path.is_file():
            self.send_error(404, "Not Found")
            return
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        if no_cache:
            self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _json_response(self, payload: dict[str, Any], status: int = 200) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format: str, *args: Any) -> None:
        super().log_message(format, *args)


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the RPCA website.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    for port in range(args.port, args.port + 10):
        try:
            server = ThreadingHTTPServer((args.host, port), RPCAWebHandler)
            print(f"RPCA website running at http://{args.host}:{port}")
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
            finally:
                server.server_close()
            return
        except OSError:
            print(f"Port {port} in use, trying {port + 1}...")

    print("Could not find an available port (tried 8000-8009).")


if __name__ == "__main__":
    main()
