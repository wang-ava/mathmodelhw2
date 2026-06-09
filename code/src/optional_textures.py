from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter


Array = np.ndarray


@dataclass
class TextureSample:
    clean: Array
    observed: Array
    missing_mask: Array
    corruption_mask: Array


def normalize01(image: Array) -> Array:
    image = np.asarray(image, dtype=np.float64)
    return (image - image.min()) / (image.max() - image.min() + 1e-12)


def low_rank_facade_texture(size: int = 96, rank: int = 6) -> Array:
    tile_h, tile_w = 16, 14
    tile = Image.new("L", (tile_w, tile_h), 235)
    draw = ImageDraw.Draw(tile)
    draw.rounded_rectangle((2, 2, 12, 14), radius=2, outline=65, width=1, fill=190)
    draw.rectangle((4, 4, 10, 8), fill=235)
    draw.rectangle((4, 9, 10, 13), fill=155)

    mosaic = Image.new("L", (size, size), 225)
    for row in range(0, size, tile_h):
        for col in range(0, size, tile_w):
            mosaic.paste(tile, (col, row))

    image = np.asarray(mosaic, dtype=np.float64) / 255.0
    image = gaussian_filter(image, sigma=0.7)
    u, singular_values, vt = np.linalg.svd(image, full_matrices=False)
    low_rank = (u[:, :rank] * singular_values[:rank]) @ vt[:rank, :]
    return normalize01(low_rank)


def dct_sparse_texture(size: int = 96) -> Array:
    grid = np.linspace(-1.0, 1.0, size)
    x, y = np.meshgrid(grid, grid, indexing="ij")
    components = [
        0.90 * np.outer(np.cos(0.5 * np.pi * (grid + 1.0)), np.cos(1.5 * np.pi * (grid + 1.0))),
        0.55 * np.outer(np.sin(1.0 * np.pi * (grid + 1.0)), np.cos(2.0 * np.pi * (grid + 1.0))),
        0.35 * np.outer(np.exp(-3.0 * (grid - 0.35) ** 2), np.exp(-4.0 * (grid + 0.2) ** 2)),
    ]
    diagonal = 0.12 * np.cos(3.5 * np.pi * (x + y))
    texture = sum(components) + diagonal
    return normalize01(texture)


def structured_texture(size: int = 96) -> Array:
    facade = low_rank_facade_texture(size=size, rank=6)
    smooth = dct_sparse_texture(size=size)
    return normalize01(0.58 * facade + 0.42 * smooth)


def add_missing_blocks(clean: Array, seed: int = 0) -> tuple[Array, Array]:
    rng = np.random.default_rng(seed)
    observed = clean.copy()
    missing = np.zeros_like(clean, dtype=bool)
    h, w = clean.shape

    bh = int(rng.integers(h // 5, h // 4))
    bw = int(rng.integers(w // 5, w // 4))
    top = int(rng.integers(18, max(19, h - bh - 18)))
    left = int(rng.integers(28, max(29, w - bw - 22)))
    missing[top : top + bh, left : left + bw] = True
    observed[top : top + bh, left : left + bw] = 0.92
    return observed, missing


def add_structured_corruption(clean: Array, seed: int = 0) -> tuple[Array, Array]:
    rng = np.random.default_rng(seed)
    observed = clean.copy()
    corruption = np.zeros_like(clean, dtype=bool)
    h, w = clean.shape

    for row in [10, 30]:
        observed[row : row + 2, 6 : w - 6] = 0.0
        corruption[row : row + 2, 6 : w - 6] = True

    for col in [16]:
        observed[10 : h - 12, col : col + 2] = 1.0
        corruption[10 : h - 12, col : col + 2] = True

    for _ in range(18):
        x = int(rng.integers(0, h))
        y = int(rng.integers(0, w))
        observed[x, y] = float(rng.choice([0.0, 1.0]))
        corruption[x, y] = True

    return observed, corruption


def build_sparse_low_rank_texture_sample(size: int = 96, seed: int = 0) -> TextureSample:
    clean = structured_texture(size=size)
    observed, missing = add_missing_blocks(clean, seed=seed)
    observed, corruption = add_structured_corruption(observed, seed=seed + 11)
    corruption = np.logical_or(corruption, missing)
    return TextureSample(clean=clean, observed=observed, missing_mask=missing, corruption_mask=corruption)


def add_tilt_occlusion(clean: Array, seed: int = 0) -> tuple[Array, Array]:
    rng = np.random.default_rng(seed)
    observed = clean.copy()
    corruption = np.zeros_like(clean, dtype=bool)
    h, w = clean.shape

    for _ in range(2):
        top = int(rng.integers(8, h - 20))
        left = int(rng.integers(8, w - 20))
        bh = int(rng.integers(8, 14))
        bw = int(rng.integers(14, 20))
        observed[top : top + bh, left : left + bw] = float(rng.choice([0.0, 1.0]))
        corruption[top : top + bh, left : left + bw] = True

    for row in range(10, h - 8, 22):
        observed[row : row + 1, 6 : w - 6] = 1.0
        corruption[row : row + 1, 6 : w - 6] = True

    return observed, corruption


def build_tilt_texture(size: int = 96) -> Array:
    texture = low_rank_facade_texture(size=size, rank=5)
    texture = normalize01(0.72 * texture + 0.28 * gaussian_filter(texture, sigma=1.1))
    return texture
