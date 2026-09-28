# SPDX-License-Identifier: GPL-3.0-only
"""Brand icons and share images (docs/PLAN.md §9.5-2, §9.5-5).

Run on macOS (Avenir Next for the latin wordmark):

    python3 scripts/og/generate.py

Downloads Shippori Mincho B1 ExtraBold (SIL OFL 1.1) into scripts/og/.cache/
on first run. Writes into public/: favicon-32.png, apple-touch-icon.png,
logo-512.png and og/{guide,home,online}.jpg. The outputs are committed; CI
never runs this. public/favicon.svg is hand-written (same drawing as PieceMark
in src/site/SiteChrome.tsx).
"""

from pathlib import Path
import urllib.request

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public"
CACHE = Path(__file__).resolve().parent / ".cache"
MINCHO = CACHE / "ShipporiMinchoB1-ExtraBold.ttf"
MINCHO_URL = "https://github.com/google/fonts/raw/main/ofl/shipporiminchob1/ShipporiMinchoB1-ExtraBold.ttf"
AVENIR = "/System/Library/Fonts/Avenir Next.ttc"

PAPER = (246, 241, 231)
INK = (34, 38, 46)
INK_SOFT = (93, 97, 107)
SHU = (179, 57, 45)
WOOD = (236, 202, 142)
WOOD_LO = (215, 169, 95)
GRID = (122, 90, 51)
FRAME = (94, 65, 34)
PIECE_FACE = (251, 241, 214)
PIECE_EDGE = (185, 147, 87)


def mincho(size):
    if not MINCHO.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(MINCHO_URL, MINCHO)
    return ImageFont.truetype(str(MINCHO), size)


def avenir(size, bold=True):
    # Avenir Next.ttc: index 0 = Bold, 2 = Demi Bold, 7 = Regular (macOS 14+).
    return ImageFont.truetype(AVENIR, size, index=0 if bold else 7)


def pentagon(cx, cy, w, h, flip=False):
    """A shogi piece outline centred on (cx, cy)."""
    pts = [(0, -0.5), (0.36, -0.36), (0.44, 0.5), (-0.44, 0.5), (-0.36, -0.36)]
    s = -1 if flip else 1
    return [(cx + x * w * s, cy + y * h * s) for x, y in pts]


def draw_piece(img, cx, cy, size, text, *, flip=False, face=PIECE_FACE, edge=PIECE_EDGE, color=INK, width=None):
    """Piece with its glyph; gote pieces (flip) are drawn upside down."""
    w, h = size * 0.86, size
    layer = Image.new("RGBA", (int(size * 1.4), int(size * 1.4)), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    lc = layer.width / 2
    d.polygon(pentagon(lc, lc, w, h), fill=face, outline=edge, width=width or max(1, round(size / 22)))
    font = mincho(round(size * (0.62 if len(text) == 1 else 0.38)))
    if len(text) == 1:
        d.text((lc, lc + size * 0.07), text, font=font, fill=color, anchor="mm")
    else:  # two-character promoted names, stacked
        d.text((lc, lc - size * 0.12), text[0], font=font, fill=color, anchor="mm")
        d.text((lc, lc + size * 0.24), text[1], font=font, fill=color, anchor="mm")
    if flip:
        layer = layer.rotate(180)
    img.alpha_composite(layer, (int(cx - lc), int(cy - lc)))


# ----------------------------------------------------------------- icons

def icon(size, background):
    img = Image.new("RGBA", (size, size), background or (0, 0, 0, 0))
    piece = size * (0.8 if background else 0.98)
    draw_piece(img, size / 2, size / 2 + size * 0.01, piece, "将", face=WOOD, edge=GRID, width=max(1, round(size / 18)))
    return img


def make_icons():
    icon(32, None).save(PUBLIC / "favicon-32.png")
    icon(180, PAPER + (255,)).convert("RGB").save(PUBLIC / "apple-touch-icon.png")
    icon(512, PAPER + (255,)).convert("RGB").save(PUBLIC / "logo-512.png")


# ----------------------------------------------------------------- share images

# Rows a..i (top = gote's side), files 9..1 left to right. "v" = gote piece.
POSITIONS = {
    # 頭金: the first mate every beginner learns.
    "guide": [
        ". . . . v王 . . . .",
        ". . . . 金 . . . .",
        ". . . . 歩 . . . .",
        ". . . . . . . . .",
        ". . . . . . . . .",
        ". . . . . . . . .",
        "歩 歩 歩 歩 . 歩 歩 歩 歩",
        ". 角 . . . . . 飛 .",
        "香 桂 銀 金 玉 . 銀 桂 香",
    ],
    # After 7六歩 3四歩 2六歩 8四歩 2五歩 8五歩 7八金 3二金: a quiet 相掛かり opening.
    "home": [
        "v香 v桂 v銀 v金 v玉 . v銀 v桂 v香",
        ". v飛 . . . . v金 v角 .",
        "v歩 . v歩 v歩 v歩 v歩 . v歩 v歩",
        ". . . . . . v歩 . .",
        ". v歩 . . . . . 歩 .",
        ". . 歩 . . . . . .",
        "歩 歩 . 歩 歩 歩 歩 . 歩",
        ". 角 金 . . . . 飛 .",
        "香 桂 銀 . 玉 金 銀 桂 香",
    ],
    # A 中飛車 vs 居飛車 middle game.
    "online": [
        "v香 v桂 . v金 . . . v桂 v香",
        ". v玉 v銀 . . . v金 v角 .",
        ". v歩 v歩 v歩 v歩 . v銀 v歩 v歩",
        "v歩 . . . . v歩 v歩 . .",
        ". . . . . . . . 歩",
        "歩 . 歩 . . 歩 歩 . .",
        ". 歩 銀 歩 歩 銀 . 歩 .",
        ". 玉 . . 飛 . . . .",
        "香 桂 金 . . 金 . 桂 香",
    ],
}

COPY = {
    "guide": ("ルール入門", "駒の動きから反則まで、8章で図解"),
    "home": ("AIと対局", "入門から伝説3まで、11段階の強さ"),
    "online": ("オンライン対局", "全国の相手や友だちと"),
}


def draw_board(img, x0, y0, cell, rows):
    d = ImageDraw.Draw(img)
    pad = cell * 0.35
    d.rounded_rectangle([x0 - pad, y0 - pad, x0 + cell * 9 + pad, y0 + cell * 9 + pad], radius=10, fill=WOOD, outline=FRAME, width=4)
    for i in range(10):
        d.line([x0, y0 + i * cell, x0 + cell * 9, y0 + i * cell], fill=GRID, width=2)
        d.line([x0 + i * cell, y0, x0 + i * cell, y0 + cell * 9], fill=GRID, width=2)
    for sx, sy in ((3, 3), (6, 3), (3, 6), (6, 6)):
        r = cell * 0.07
        d.ellipse([x0 + sx * cell - r, y0 + sy * cell - r, x0 + sx * cell + r, y0 + sy * cell + r], fill=GRID)
    for y, row in enumerate(rows):
        for x, token in enumerate(row.split()):
            if token == ".":
                continue
            flip = token.startswith("v")
            name = token[1:] if flip else token
            draw_piece(img, x0 + (x + 0.5) * cell, y0 + (y + 0.5) * cell, cell * 0.88, name, flip=flip)


def make_og(name):
    W, H = 1200, 630
    img = Image.new("RGBA", (W, H), PAPER + (255,))
    cell = 58
    draw_board(img, 64, (H - cell * 9) / 2, cell, POSITIONS[name])
    d = ImageDraw.Draw(img)
    tx = 64 + cell * 9 + 80
    heading, sub = COPY[name]
    d.text((tx, 150), "将棋", font=mincho(120), fill=INK, anchor="ls")
    d.text((tx, 250), heading, font=mincho(64 if len(heading) <= 5 else 54), fill=SHU, anchor="ls")
    d.text((tx, 320), sub, font=mincho(30), fill=INK_SOFT, anchor="ls")
    d.text((tx, 380), "無料・ブラウザですぐに", font=mincho(30), fill=INK_SOFT, anchor="ls")
    # Wordmark bottom right: "shogi" ink + "go" shu, with the piece mark.
    font = avenir(52)
    y = H - 64
    draw_piece(img, tx + 22, y - 20, 50, "将", face=WOOD, edge=GRID, width=3)
    x = tx + 60
    d.text((x, y), "shogi", font=font, fill=INK, anchor="ls")
    x += d.textlength("shogi", font=font)
    d.text((x, y), "go", font=font, fill=SHU, anchor="ls")
    (PUBLIC / "og").mkdir(exist_ok=True)
    img.convert("RGB").save(PUBLIC / "og" / f"{name}.jpg", quality=86, optimize=True, progressive=True)


if __name__ == "__main__":
    make_icons()
    for page in POSITIONS:
        make_og(page)
    print("ok")
