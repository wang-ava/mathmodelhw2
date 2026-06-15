from __future__ import annotations

import math

import numpy as np
from scipy.ndimage import gaussian_filter


Array = np.ndarray


def clamp01(image: Array) -> Array:
    return np.clip(np.asarray(image, dtype=np.float64), 0.0, 1.0)


def psnr(reference: Array, estimate: Array, data_range: float = 1.0) -> float:
    reference = clamp01(reference)
    estimate = clamp01(estimate)
    mse = np.mean((reference - estimate) ** 2)
    if mse <= 1e-12:
        return float("inf")
    return 10.0 * math.log10((data_range**2) / mse)


def ssim(reference: Array, estimate: Array, sigma: float = 1.5) -> float:
    x = clamp01(reference)
    y = clamp01(estimate)

    c1 = (0.01**2)
    c2 = (0.03**2)

    mu_x = gaussian_filter(x, sigma=sigma)
    mu_y = gaussian_filter(y, sigma=sigma)

    sigma_x = gaussian_filter(x * x, sigma=sigma) - mu_x * mu_x
    sigma_y = gaussian_filter(y * y, sigma=sigma) - mu_y * mu_y
    sigma_xy = gaussian_filter(x * y, sigma=sigma) - mu_x * mu_y

    numerator = (2.0 * mu_x * mu_y + c1) * (2.0 * sigma_xy + c2)
    denominator = (mu_x * mu_x + mu_y * mu_y + c1) * (sigma_x + sigma_y + c2)
    score = numerator / (denominator + 1e-12)
    return float(np.mean(score))


def relative_error(reference: Array, estimate: Array) -> float:
    reference = np.asarray(reference, dtype=np.float64)
    estimate = np.asarray(estimate, dtype=np.float64)
    return float(
        np.linalg.norm(reference - estimate, ord="fro")
        / (np.linalg.norm(reference, ord="fro") + 1e-12)
    )


def support_metrics(sparse_reference: Array, sparse_estimate: Array, eps: float = 1e-3) -> dict[str, float]:
    gt = np.abs(np.asarray(sparse_reference, dtype=np.float64)) > eps
    pred = np.abs(np.asarray(sparse_estimate, dtype=np.float64)) > eps

    tp = float(np.logical_and(gt, pred).sum())
    fp = float(np.logical_and(~gt, pred).sum())
    fn = float(np.logical_and(gt, ~pred).sum())

    precision = tp / (tp + fp + 1e-12)
    recall = tp / (tp + fn + 1e-12)
    f1 = 2.0 * precision * recall / (precision + recall + 1e-12)
    return {"precision": precision, "recall": recall, "f1": f1}
