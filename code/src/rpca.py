from __future__ import annotations

from dataclasses import dataclass

import numpy as np


Array = np.ndarray


@dataclass
class RPCAResult:
    low_rank: Array
    sparse: Array
    residuals: list[float]
    ranks: list[int]
    sparse_ratios: list[float]
    iterations: int
    lam: float


def soft_threshold(x: Array, tau: float) -> Array:
    return np.sign(x) * np.maximum(np.abs(x) - tau, 0.0)


def singular_value_threshold(x: Array, tau: float) -> tuple[Array, int]:
    u, singular_values, vt = np.linalg.svd(x, full_matrices=False)
    shrunk = np.maximum(singular_values - tau, 0.0)
    rank = int(np.count_nonzero(shrunk > 0.0))
    if rank == 0:
        return np.zeros_like(x), 0
    return (u[:, :rank] * shrunk[:rank]) @ vt[:rank, :], rank


def robust_pca(
    matrix: Array,
    lam: float | None = None,
    tol: float = 1e-7,
    max_iter: int = 500,
    mu: float | None = None,
    rho: float = 1.5,
    mu_bar_factor: float = 1e7,
) -> RPCAResult:
    """
    Inexact ALM solver for Robust PCA:
        min ||L||_* + lam ||S||_1  s.t.  D = L + S
    """
    d = np.asarray(matrix, dtype=np.float64)
    m, n = d.shape
    lam = float(lam if lam is not None else 1.0 / np.sqrt(max(m, n)))

    norm_two = np.linalg.norm(d, 2)
    norm_inf = np.max(np.abs(d)) / max(lam, 1e-12)
    dual_norm = max(norm_two, norm_inf, 1e-12)
    y = d / dual_norm

    low_rank = np.zeros_like(d)
    sparse = np.zeros_like(d)
    mu = float(mu if mu is not None else 1.25 / max(norm_two, 1e-12))
    mu_bar = mu * mu_bar_factor
    d_norm = np.linalg.norm(d, ord="fro") + 1e-12

    residuals: list[float] = []
    ranks: list[int] = []
    sparse_ratios: list[float] = []

    for iteration in range(1, max_iter + 1):
        low_rank, rank = singular_value_threshold(d - sparse + y / mu, 1.0 / mu)
        sparse = soft_threshold(d - low_rank + y / mu, lam / mu)

        residual = d - low_rank - sparse
        stop_criterion = np.linalg.norm(residual, ord="fro") / d_norm

        residuals.append(float(stop_criterion))
        ranks.append(rank)
        sparse_ratios.append(float(np.mean(np.abs(sparse) > 1e-6)))

        y = y + mu * residual
        mu = min(mu * rho, mu_bar)

        if stop_criterion < tol:
            break

    return RPCAResult(
        low_rank=low_rank,
        sparse=sparse,
        residuals=residuals,
        ranks=ranks,
        sparse_ratios=sparse_ratios,
        iterations=len(residuals),
        lam=lam,
    )
