from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.ndimage import map_coordinates, zoom

from .rpca import singular_value_threshold


Array = np.ndarray


@dataclass
class TILTResult:
    rectified: Array
    low_rank: Array
    sparse: Array
    parameters: Array
    mode: str
    residuals: list[float]
    delta_history: list[float]
    rank_history: list[int]
    iterations: int


def soft_threshold(x: Array, tau: float) -> Array:
    return np.sign(x) * np.maximum(np.abs(x) - tau, 0.0)


def params_to_matrix(params: Array, mode: str = "affine") -> Array:
    params = np.asarray(params, dtype=np.float64)
    if mode == "affine":
        return np.array(
            [
                [1.0 + params[0], params[1], params[2]],
                [params[3], 1.0 + params[4], params[5]],
                [0.0, 0.0, 1.0],
            ],
            dtype=np.float64,
        )
    if mode == "projective":
        return np.array(
            [
                [1.0 + params[0], params[1], params[2]],
                [params[3], 1.0 + params[4], params[5]],
                [params[6], params[7], 1.0],
            ],
            dtype=np.float64,
        )
    raise ValueError(f"Unsupported mode: {mode}")


def matrix_to_params(matrix: Array, mode: str = "affine") -> Array:
    matrix = np.asarray(matrix, dtype=np.float64)
    if mode == "affine":
        return np.array(
            [
                matrix[0, 0] - 1.0,
                matrix[0, 1],
                matrix[0, 2],
                matrix[1, 0],
                matrix[1, 1] - 1.0,
                matrix[1, 2],
            ],
            dtype=np.float64,
        )
    if mode == "projective":
        return np.array(
            [
                matrix[0, 0] - 1.0,
                matrix[0, 1],
                matrix[0, 2],
                matrix[1, 0],
                matrix[1, 1] - 1.0,
                matrix[1, 2],
                matrix[2, 0],
                matrix[2, 1],
            ],
            dtype=np.float64,
        )
    raise ValueError(f"Unsupported mode: {mode}")


def _normalized_grid(shape: tuple[int, int]) -> tuple[Array, Array]:
    h, w = shape
    x = np.linspace(-1.0, 1.0, w)
    y = np.linspace(-1.0, 1.0, h)
    return np.meshgrid(x, y, indexing="xy")


def warp_patch_from_matrix(
    image: Array,
    matrix: Array,
    output_shape: tuple[int, int] | None = None,
    cval: float = 0.5,
) -> Array:
    image = np.asarray(image, dtype=np.float64)
    h, w = image.shape
    out_h, out_w = output_shape or image.shape
    xx, yy = _normalized_grid((out_h, out_w))
    coords = np.stack([xx.ravel(), yy.ravel(), np.ones(out_h * out_w)], axis=0)
    mapped = matrix @ coords
    mapped /= np.maximum(mapped[2:3], 1e-8)

    x_src = (mapped[0].reshape(out_h, out_w) + 1.0) * 0.5 * (w - 1)
    y_src = (mapped[1].reshape(out_h, out_w) + 1.0) * 0.5 * (h - 1)

    return map_coordinates(
        image,
        [y_src, x_src],
        order=1,
        mode="constant",
        cval=float(cval),
    )


def warp_patch(
    image: Array,
    params: Array,
    mode: str = "affine",
    output_shape: tuple[int, int] | None = None,
    cval: float = 0.5,
) -> Array:
    return warp_patch_from_matrix(image, params_to_matrix(params, mode=mode), output_shape=output_shape, cval=cval)


def distort_texture(image: Array, params: Array, mode: str = "affine") -> Array:
    matrix = params_to_matrix(params, mode=mode)
    inverse = np.linalg.inv(matrix)
    return warp_patch_from_matrix(image, inverse, output_shape=image.shape, cval=float(np.mean(image)))


def normalize_texture(image: Array) -> Array:
    image = np.asarray(image, dtype=np.float64)
    centered = image - float(np.mean(image))
    scale = np.linalg.norm(centered, ord="fro") + 1e-12
    return centered / scale


def minmax(image: Array) -> Array:
    image = np.asarray(image, dtype=np.float64)
    return (image - image.min()) / (image.max() - image.min() + 1e-12)


def fit_intensity(low_rank: Array, reference: Array) -> Array:
    x = low_rank.reshape(-1)
    y = np.asarray(reference, dtype=np.float64).reshape(-1)
    design = np.stack([x, np.ones_like(x)], axis=1)
    coeffs, *_ = np.linalg.lstsq(design, y, rcond=None)
    fitted = coeffs[0] * low_rank + coeffs[1]
    return np.clip(fitted, 0.0, 1.0)


def numerical_jacobian(
    image: Array,
    params: Array,
    mode: str,
    epsilon: float = 3e-3,
) -> tuple[Array, Array]:
    base = normalize_texture(warp_patch(image, params, mode=mode, cval=float(np.mean(image))))
    jacobian = np.zeros((base.size, len(params)), dtype=np.float64)
    for idx in range(len(params)):
        plus = params.copy()
        minus = params.copy()
        plus[idx] += epsilon
        minus[idx] -= epsilon
        warped_plus = normalize_texture(warp_patch(image, plus, mode=mode, cval=float(np.mean(image))))
        warped_minus = normalize_texture(warp_patch(image, minus, mode=mode, cval=float(np.mean(image))))
        jacobian[:, idx] = ((warped_plus - warped_minus) / (2.0 * epsilon)).reshape(-1)
    return base, jacobian


def _solve_linearized_subproblem(
    d: Array,
    jacobian: Array,
    lam: float,
    max_iter: int,
    tol: float,
    reg: float,
) -> tuple[Array, Array, Array, list[float], list[int]]:
    l = np.zeros_like(d)
    e = np.zeros_like(d)
    delta = np.zeros(jacobian.shape[1], dtype=np.float64)
    y = np.zeros_like(d)
    mu = 0.5
    mu_bar = 5e4
    rho = 1.25

    residuals: list[float] = []
    ranks: list[int] = []

    jt_j = jacobian.T @ jacobian
    eye = np.eye(jt_j.shape[0])

    for _ in range(max_iter):
        linear_term = (jacobian @ delta).reshape(d.shape)
        l, rank = singular_value_threshold(d + linear_term - e + y / mu, 1.0 / mu)
        e = soft_threshold(d + linear_term - l + y / mu, lam / mu)

        rhs = (l + e - d - y / mu).reshape(-1)
        delta = np.linalg.solve(jt_j + reg * eye, jacobian.T @ rhs)

        residual = d + (jacobian @ delta).reshape(d.shape) - l - e
        relative = float(np.linalg.norm(residual, ord="fro") / (np.linalg.norm(d, ord="fro") + 1e-12))
        residuals.append(relative)
        ranks.append(rank)

        y = y + mu * residual
        mu = min(mu * rho, mu_bar)
        if relative < tol and float(np.linalg.norm(delta)) < 5e-4:
            break

    return l, e, delta, residuals, ranks


def _affine_grid_candidates() -> list[Array]:
    candidates = [np.zeros(6, dtype=np.float64)]
    for angle in [-0.16, -0.08, 0.08, 0.16]:
        cos_t = np.cos(angle)
        sin_t = np.sin(angle)
        matrix = np.array([[cos_t, -sin_t, 0.0], [sin_t, cos_t, 0.0], [0.0, 0.0, 1.0]])
        candidates.append(matrix_to_params(matrix, mode="affine"))
    for shear in [-0.16, 0.16]:
        matrix = np.array([[1.0, shear, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]])
        candidates.append(matrix_to_params(matrix, mode="affine"))
    return candidates


def _pick_initial_params(image: Array, mode: str) -> Array:
    if mode != "affine":
        return np.zeros(8, dtype=np.float64)
    best = None
    best_score = np.inf
    for candidate in _affine_grid_candidates():
        warped = normalize_texture(warp_patch(image, candidate, mode=mode, cval=float(np.mean(image))))
        singular_values = np.linalg.svd(warped, compute_uv=False)
        score = float(np.sum(singular_values[4:]))
        if score < best_score:
            best_score = score
            best = candidate
    return np.zeros(6, dtype=np.float64) if best is None else best


def _pyramid(image: Array, levels: int) -> list[Array]:
    levels = max(1, levels)
    pyramid = []
    for level in reversed(range(levels)):
        scale = 1.0 / (2**level)
        if scale == 1.0:
            pyramid.append(image)
        else:
            pyramid.append(zoom(image, zoom=scale, order=1))
    return pyramid


def tilt_rectify(
    observed: Array,
    mode: str = "affine",
    lam: float = 0.055,
    max_outer_iter: int = 18,
    max_inner_iter: int = 100,
    tol: float = 1e-4,
    reg: float = 2e-3,
    pyramid_levels: int = 3,
    init_params: Array | None = None,
) -> TILTResult:
    observed = np.asarray(observed, dtype=np.float64)
    params = (
        np.asarray(init_params, dtype=np.float64).copy()
        if init_params is not None
        else _pick_initial_params(observed, mode=mode)
    )

    residuals: list[float] = []
    delta_history: list[float] = []
    rank_history: list[int] = []

    for level_image in _pyramid(observed, levels=pyramid_levels):
        for _ in range(max_outer_iter):
            d, jacobian = numerical_jacobian(level_image, params, mode=mode)
            l, e, delta, inner_residuals, inner_ranks = _solve_linearized_subproblem(
                d=d,
                jacobian=jacobian,
                lam=lam,
                max_iter=max_inner_iter,
                tol=tol,
                reg=reg,
            )
            params = params + np.clip(delta, -0.08, 0.08)
            residuals.extend(inner_residuals[-1:])
            delta_history.append(float(np.linalg.norm(delta)))
            rank_history.extend(inner_ranks[-1:])
            if float(np.linalg.norm(delta)) < 1e-3:
                break

    rectified_raw = warp_patch(observed, params, mode=mode, cval=float(np.mean(observed)))
    rectified_norm = normalize_texture(rectified_raw)
    sparse = np.abs(rectified_norm - l)
    low_rank_fit = fit_intensity(l, minmax(rectified_raw))

    return TILTResult(
        rectified=np.clip(minmax(rectified_raw), 0.0, 1.0),
        low_rank=np.clip(low_rank_fit, 0.0, 1.0),
        sparse=minmax(sparse),
        parameters=params,
        mode=mode,
        residuals=residuals,
        delta_history=delta_history,
        rank_history=rank_history,
        iterations=len(delta_history),
    )
