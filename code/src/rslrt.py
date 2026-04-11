from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.fft import dctn, idctn
from scipy.ndimage import binary_closing, binary_dilation, binary_opening

from .rpca import singular_value_threshold


Array = np.ndarray


@dataclass
class SparseLowRankTextureResult:
    repaired: Array
    low_rank: Array
    sparse_coefficients: Array
    sparse_error: Array
    trusted_mask: Array
    detected_support: Array
    residuals: list[float]
    support_history: list[float]
    iterations: int


def dct2(image: Array) -> Array:
    return dctn(np.asarray(image, dtype=np.float64), norm="ortho")


def idct2(coefficients: Array) -> Array:
    return idctn(np.asarray(coefficients, dtype=np.float64), norm="ortho")


def soft_threshold(x: Array, tau: float) -> Array:
    return np.sign(x) * np.maximum(np.abs(x) - tau, 0.0)


def _refine_support(
    sparse_error: Array,
    observed_mask: Array,
    support_quantile: float,
    smooth_support: bool,
) -> Array:
    magnitude = np.abs(sparse_error)
    threshold = np.quantile(magnitude[observed_mask], support_quantile)
    detected = np.logical_and(observed_mask, magnitude >= threshold)
    if smooth_support:
        structure = np.ones((3, 3), dtype=bool)
        detected = binary_closing(detected, structure=structure)
        detected = binary_opening(detected, structure=structure)
        detected = binary_dilation(detected, structure=structure)
    return detected


def repair_sparse_low_rank_texture(
    observed: Array,
    observed_mask: Array | None = None,
    lam: float = 0.020,
    alpha: float = 0.085,
    rho1: float = 1.0,
    rho2: float = 1.0,
    rho3: float = 1.2,
    max_iter: int = 280,
    tol: float = 1e-5,
    support_refinement_steps: int = 3,
    support_quantile: float = 0.90,
    smooth_support: bool = True,
) -> SparseLowRankTextureResult:
    """
    Sparse low-rank texture repair with a low-rank image prior and a sparse DCT prior.

    We solve a simplified variant of the model from "Repairing Sparse Low-rank Texture":

        min ||A||_* + lam ||W||_1 + alpha ||E||_1
        s.t. A = X,
             W = DCT(X),
             P_Omega(X + E) = P_Omega(D)

    and iteratively shrink the trusted support Omega based on the recovered sparse error.
    """
    observed = np.asarray(observed, dtype=np.float64)
    base_mask = np.ones_like(observed, dtype=bool) if observed_mask is None else np.asarray(observed_mask, dtype=bool)
    trusted_mask = base_mask.copy()

    x = observed.copy()
    a = x.copy()
    w = dct2(x)
    e = np.zeros_like(x)
    u1 = np.zeros_like(x)
    u2 = np.zeros_like(x)
    u3 = np.zeros_like(x)

    residuals: list[float] = []
    support_history: list[float] = []

    for refine_idx in range(support_refinement_steps):
        for _ in range(max_iter):
            a, _ = singular_value_threshold(x - u1, 1.0 / rho1)
            w = soft_threshold(dct2(x) - u2, lam / rho2)
            e = np.zeros_like(x)
            e[trusted_mask] = soft_threshold(observed[trusted_mask] - x[trusted_mask] + u3[trusted_mask], alpha / rho3)

            numerator = rho1 * (a + u1) + rho2 * idct2(w + u2)
            numerator += rho3 * trusted_mask.astype(np.float64) * (observed - e + u3)
            denominator = rho1 + rho2 + rho3 * trusted_mask.astype(np.float64)
            x = numerator / (denominator + 1e-12)

            primal1 = a - x
            primal2 = w - dct2(x)
            primal3 = trusted_mask.astype(np.float64) * (observed - x - e)

            u1 = u1 + primal1
            u2 = u2 + primal2
            u3 = trusted_mask.astype(np.float64) * (u3 + primal3)

            residual = max(
                float(np.linalg.norm(primal1, ord="fro")),
                float(np.linalg.norm(primal2, ord="fro")),
                float(np.linalg.norm(primal3, ord="fro")),
            ) / (np.linalg.norm(observed, ord="fro") + 1e-12)
            residuals.append(residual)
            support_history.append(float(np.mean(~trusted_mask)))
            if residual < tol:
                break

        if refine_idx < support_refinement_steps - 1:
            detected = _refine_support(
                sparse_error=e,
                observed_mask=base_mask,
                support_quantile=support_quantile,
                smooth_support=smooth_support,
            )
            trusted_mask = np.logical_and(base_mask, ~detected)

    detected_support = np.logical_and(base_mask, ~trusted_mask)
    final_sparse = np.zeros_like(x)
    final_sparse[base_mask] = observed[base_mask] - x[base_mask]

    return SparseLowRankTextureResult(
        repaired=np.clip(x, 0.0, 1.0),
        low_rank=np.clip(a, 0.0, 1.0),
        sparse_coefficients=w,
        sparse_error=final_sparse,
        trusted_mask=trusted_mask,
        detected_support=detected_support,
        residuals=residuals,
        support_history=support_history,
        iterations=len(residuals),
    )
