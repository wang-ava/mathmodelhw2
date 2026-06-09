from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from matplotlib import cbook
from PIL import Image, ImageDraw, ImageFont


Array = np.ndarray


@dataclass
class Scenario:
    name: str
    title: str
    clean: Array
    observed: Array
    sparse_gt: Array
    lambda_scale: float = 1.0


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def array_to_image(array: Array) -> Image.Image:
    return Image.fromarray(np.uint8(np.clip(array, 0.0, 1.0) * 255.0), mode="L")


def image_to_array(image: Image.Image) -> Array:
    return np.asarray(image, dtype=np.float64) / 255.0


def rgb_array_to_image(array: Array) -> Image.Image:
    return Image.fromarray(np.uint8(np.clip(array, 0.0, 1.0) * 255.0), mode="RGB")


def resize_grayscale(image: Image.Image, size: tuple[int, int]) -> Array:
    return image_to_array(image.convert("L").resize(size, Image.Resampling.LANCZOS))


def resize_rgb(image: Image.Image, size: tuple[int, int]) -> Array:
    return np.asarray(image.convert("RGB").resize(size, Image.Resampling.LANCZOS), dtype=np.float64) / 255.0


def low_rank_projection(image: Array, rank: int) -> Array:
    u, singular_values, vt = np.linalg.svd(image, full_matrices=False)
    rank = min(rank, len(singular_values))
    return np.clip((u[:, :rank] * singular_values[:rank]) @ vt[:rank, :], 0.0, 1.0)


def load_sample_grace(size: tuple[int, int] = (160, 160), rank: int = 14) -> Array:
    with Image.open(cbook.get_sample_data("grace_hopper.jpg")) as image:
        grayscale = resize_grayscale(image, size)
    return low_rank_projection(grayscale, rank=rank)


def load_sample_grace_color(size: tuple[int, int] = (160, 160), rank: int = 12) -> Array:
    with Image.open(cbook.get_sample_data("grace_hopper.jpg")) as image:
        rgb = resize_rgb(image, size)
    channels = [low_rank_projection(rgb[:, :, idx], rank=rank) for idx in range(3)]
    return np.stack(channels, axis=-1)


def generate_smooth_texture(size: int = 160) -> Array:
    grid = np.linspace(-1.0, 1.0, size)
    x, y = np.meshgrid(grid, grid, indexing="ij")

    basis_u = np.stack(
        [
            np.sin(np.pi * (x[:, 0] + 1.0) / 2.0),
            np.cos(1.8 * np.pi * (x[:, 0] + 1.0) / 2.0),
            np.exp(-4.0 * (x[:, 0] - 0.2) ** 2),
            np.exp(-5.0 * (x[:, 0] + 0.3) ** 2),
        ],
        axis=1,
    )
    basis_v = np.stack(
        [
            np.cos(1.1 * np.pi * (y[0, :] + 1.0) / 2.0),
            np.sin(2.2 * np.pi * (y[0, :] + 1.0) / 2.0),
            np.exp(-5.0 * (y[0, :] - 0.35) ** 2),
            np.exp(-3.5 * (y[0, :] + 0.25) ** 2),
        ],
        axis=1,
    )
    singular_values = np.array([0.95, 0.55, 0.35, 0.2])
    texture = sum(
        singular_values[idx] * np.outer(basis_u[:, idx], basis_v[:, idx])
        for idx in range(len(singular_values))
    )
    texture = (texture - texture.min()) / (texture.max() - texture.min() + 1e-12)
    return texture


def generate_color_texture(size: int = 150) -> Array:
    base = generate_smooth_texture(size=size)
    red = base
    green = np.clip(0.75 * np.roll(base, 8, axis=0) + 0.25 * np.roll(base, -6, axis=1), 0.0, 1.0)
    blue = np.clip(0.6 * np.roll(base, 12, axis=1) + 0.4 * np.flipud(base), 0.0, 1.0)
    return np.stack([red, green, blue], axis=-1)


def _draw_text_and_scratches(
    clean: Array,
    seed: int = 0,
    phrases: tuple[str, ...] = ("RPCA", "MASK"),
    n_lines: int = 0,
) -> Array:
    rng = np.random.default_rng(seed)
    image = array_to_image(clean)
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=24)

    for idx, phrase in enumerate(phrases):
        x = int(rng.integers(16, max(clean.shape[1] - 90, 20)))
        y = int(rng.integers(20 + 28 * idx, max(clean.shape[0] - 50, 40)))
        fill = 255 if idx % 2 == 0 else 0
        draw.text((x, y), phrase, font=font, fill=fill)

    for _ in range(n_lines):
        x0 = int(rng.integers(0, clean.shape[1]))
        y0 = int(rng.integers(0, clean.shape[0]))
        x1 = int(rng.integers(0, clean.shape[1]))
        y1 = int(rng.integers(0, clean.shape[0]))
        fill = int(rng.choice([0, 255]))
        width = int(rng.integers(2, 5))
        draw.line((x0, y0, x1, y1), fill=fill, width=width)

    return image_to_array(image)


def add_text_occlusion(
    clean: Array,
    seed: int = 0,
    phrases: tuple[str, ...] = ("RPCA", "MASK"),
    n_lines: int = 0,
) -> tuple[Array, Array]:
    observed = _draw_text_and_scratches(clean, seed=seed, phrases=phrases, n_lines=n_lines)
    sparse = observed - clean
    return np.clip(observed, 0.0, 1.0), sparse


def add_block_occlusion(clean: Array, seed: int = 0, block_size: tuple[int, int] = (30, 40)) -> tuple[Array, Array]:
    rng = np.random.default_rng(seed)
    observed = clean.copy()
    h, w = clean.shape
    bh, bw = block_size
    x0 = int(rng.integers(8, max(h - bh - 8, 9)))
    y0 = int(rng.integers(8, max(w - bw - 8, 9)))
    observed[x0 : x0 + bh, y0 : y0 + bw] = 1.0
    sparse = observed - clean
    return observed, sparse


def add_salt_pepper_noise(clean: Array, amount: float = 0.12, seed: int = 0) -> tuple[Array, Array]:
    rng = np.random.default_rng(seed)
    observed = clean.copy()
    mask = rng.random(clean.shape)
    salt = mask < amount / 2.0
    pepper = np.logical_and(mask >= amount / 2.0, mask < amount)
    observed[salt] = 1.0
    observed[pepper] = 0.0
    sparse = observed - clean
    return observed, sparse


def combine_sparse_corruptions(clean: Array, seed: int = 0) -> tuple[Array, Array]:
    observed, sparse_text = add_text_occlusion(clean, seed=seed)
    observed, sparse_block = add_block_occlusion(observed, seed=seed + 13, block_size=(24, 30))
    sparse = (observed - clean)
    return observed, sparse + 0.0 * sparse_text + 0.0 * sparse_block


def build_default_scenarios(size: int = 160) -> list[Scenario]:
    portrait = load_sample_grace(size=(size, size), rank=6)
    texture = generate_smooth_texture(size=size)

    observed_1, sparse_1 = add_text_occlusion(portrait, seed=7, phrases=("MASK", "RPCA"), n_lines=0)
    observed_2, _ = add_block_occlusion(texture, seed=9, block_size=(24, 24))
    observed_2, sparse_2 = add_text_occlusion(observed_2, seed=11, phrases=tuple(), n_lines=1)
    sparse_2 = observed_2 - texture
    observed_3, sparse_3 = add_salt_pepper_noise(portrait, amount=0.10, seed=23)

    observed_4, sparse_4 = add_text_occlusion(texture, seed=42, phrases=("MASK",), n_lines=2)
    observed_5, sparse_5 = add_block_occlusion(portrait, seed=55, block_size=(28, 30))
    sparse_5 = observed_5 - portrait
    observed_6, sparse_6 = add_salt_pepper_noise(texture, amount=0.10, seed=67)

    return [
        Scenario(
            name="portrait_text",
            title="场景1：人像文字遮挡修复",
            clean=portrait,
            observed=observed_1,
            sparse_gt=sparse_1,
            lambda_scale=0.6,
        ),
        Scenario(
            name="portrait_block",
            title="场景2：人像缺块修复",
            clean=portrait,
            observed=observed_5,
            sparse_gt=sparse_5,
            lambda_scale=0.3,
        ),
        Scenario(
            name="portrait_salt",
            title="场景3：人像椒盐噪声去噪",
            clean=portrait,
            observed=observed_3,
            sparse_gt=sparse_3,
            lambda_scale=1.5,
        ),
        Scenario(
            name="texture_text",
            title="场景4：纹理文字遮挡修复",
            clean=texture,
            observed=observed_4,
            sparse_gt=sparse_4,
            lambda_scale=0.3,
        ),
        Scenario(
            name="texture_block",
            title="场景5：纹理缺块修复",
            clean=texture,
            observed=observed_2,
            sparse_gt=sparse_2,
            lambda_scale=0.3,
        ),
        Scenario(
            name="texture_salt",
            title="场景6：纹理椒盐噪声去噪",
            clean=texture,
            observed=observed_6,
            sparse_gt=sparse_6,
            lambda_scale=1.5,
        ),
    ]
