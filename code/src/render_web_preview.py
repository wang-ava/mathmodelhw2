from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
RESULTS_DIR = ROOT / "code" / "results"
FONT_PATH = Path("/System/Library/Fonts/Supplemental/Songti.ttc")


def rounded_image(path: Path, size: tuple[int, int], radius: int) -> Image.Image:
    image = Image.open(path).convert("RGB").resize(size, Image.Resampling.LANCZOS)
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    output = Image.new("RGBA", size)
    output.paste(image, (0, 0))
    output.putalpha(mask)
    return output


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if FONT_PATH.exists():
        return ImageFont.truetype(str(FONT_PATH), size=size)
    return ImageFont.load_default()


def render_preview(output_path: Path | None = None) -> Path:
    target_path = output_path or RESULTS_DIR / "webapp_snapshot.png"
    target_path.parent.mkdir(parents=True, exist_ok=True)

    canvas = Image.new("RGB", (1560, 980), "#efe6d8")
    draw = ImageDraw.Draw(canvas)

    title_font = font(54)
    heading_font = font(30)
    body_font = font(18)
    small_font = font(14)

    draw.rounded_rectangle((34, 24, 1524, 130), radius=34, fill="#10283a")
    draw.text((68, 56), "RPCA Repair Atlas", fill="#f9f4eb", font=title_font)
    draw.text((940, 48), "Low-rank image repair / editorial web demo", fill="#d9d0c3", font=body_font)

    draw.rounded_rectangle((34, 160, 500, 900), radius=34, fill="#f8f4eb")
    draw.text((72, 200), "Interactive Repair Lab", fill="#10283a", font=heading_font)
    draw.text((72, 248), "Upload image for denoising", fill="#10283a", font=body_font)
    draw.rounded_rectangle((72, 292, 462, 430), radius=24, outline="#c38b53", width=3, fill="#fffdf8")
    draw.text((102, 334), "Drag, drop, or browse", fill="#6e6b63", font=small_font)
    draw.text((102, 366), "Supports grayscale and color images.", fill="#10283a", font=body_font)
    draw.text((102, 402), "Color images are repaired channel by channel.", fill="#6e6b63", font=small_font)

    draw.text((72, 482), "lambda scale", fill="#10283a", font=small_font)
    draw.rounded_rectangle((72, 510, 462, 536), radius=13, fill="#d7cfc3")
    draw.rounded_rectangle((72, 510, 302, 536), radius=13, fill="#c38b53")
    draw.text((72, 574), "max iterations", fill="#10283a", font=small_font)
    draw.rounded_rectangle((72, 602, 462, 628), radius=13, fill="#d7cfc3")
    draw.rounded_rectangle((72, 602, 412, 628), radius=13, fill="#8ba79a")

    draw.rounded_rectangle((72, 684, 462, 740), radius=28, fill="#10283a")
    draw.text((198, 700), "Run RPCA Repair", fill="#f9f4eb", font=body_font)

    draw.rounded_rectangle((72, 774, 462, 866), radius=26, fill="#ece5d9")
    stats = [
        "PSNR: 54.50 dB",
        "SSIM: 0.9995",
        "Iterations: 33",
        "Recovered Rank: 144",
    ]
    draw.text((102, 798), "Sample stats", fill="#10283a", font=body_font)
    for idx, line in enumerate(stats):
        draw.text((102, 832 + idx * 18), line, fill="#4b5761", font=small_font)

    draw.rounded_rectangle((534, 160, 1492, 900), radius=34, fill="#122d3c")
    draw.text((582, 202), "Experiment Atlas + Upload Results", fill="#f9f4eb", font=heading_font)
    draw.text((582, 244), "A website that combines experiment storytelling with real denoising.", fill="#d5d2c8", font=body_font)

    hero_img = rounded_image(RESULTS_DIR / "saltpepper_vs_median.png", (840, 238), radius=24)
    canvas.paste(hero_img, (582, 286), hero_img)

    observed = rounded_image(ROOT / "code" / "assets" / "salt_pepper_observed.png", (250, 250), radius=20)
    repaired = rounded_image(ROOT / "code" / "assets" / "salt_pepper_recovered.png", (250, 250), radius=20)
    sparse = rounded_image(ROOT / "code" / "assets" / "salt_pepper_sparse.png", (250, 250), radius=20)

    for idx, (image, label) in enumerate(
        [
            (observed, "Observed"),
            (repaired, "Recovered L"),
            (sparse, "Sparse |S|"),
        ]
    ):
        x = 586 + idx * 280
        draw.rounded_rectangle((x, 560, x + 258, 864), radius=26, fill="#f7f3ea")
        draw.text((x + 20, 584), label, fill="#10283a", font=body_font)
        canvas.paste(image, (x + 4, 620), image)

    canvas.save(target_path)
    return target_path


if __name__ == "__main__":
    render_preview()
