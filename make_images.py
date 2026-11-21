#!/usr/bin/env python3
"""Рисует картинки для плашек бота (img_*.jpg в корне проекта) по данным из config.js.
Запуск из папки проекта:  python3 make_images.py
Нужны: Python 3, Pillow, шрифт DejaVu Sans Bold. Для нового клиента меняются цвета в PALETTE."""
import json, os, subprocess, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = ROOT
os.makedirs(OUT, exist_ok=True)
cfg = json.loads(subprocess.check_output(["node", "-e", "console.log(JSON.stringify(require('./config')))"], cwd=ROOT))

S = 2                       # рисуем в 2 раза крупнее и уменьшаем: гладкие края
W, H = 1200 * S, 628 * S
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
font = lambda p, s: ImageFont.truetype(p, int(s * S))

PLUM, VIOLET, MAGENTA, PINK = (27, 11, 46), (91, 33, 182), (192, 38, 211), (244, 114, 182)
GOLD1, GOLD2, WHITE, LILAC = (253, 230, 138), (245, 158, 11), (255, 255, 255), (233, 213, 255)
NAIL_COLORS = [(251, 113, 133), (244, 114, 182), (217, 70, 239), (167, 139, 250), (253, 230, 138), (255, 255, 255)]


def background():
    base = Image.new("RGB", (W, H))
    px = base.load()
    for y in range(H):
        for x in range(0, W):
            t = min(1.0, (x / W) * 0.55 + (y / H) * 0.45)
            if t < 0.55:
                u = t / 0.55
                c = tuple(int(PLUM[i] + (VIOLET[i] - PLUM[i]) * u) for i in range(3))
            else:
                u = (t - 0.55) / 0.45
                c = tuple(int(VIOLET[i] + (MAGENTA[i] - VIOLET[i]) * u) for i in range(3))
            px[x, y] = c
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse([W * 0.55, -H * 0.35, W * 1.15, H * 0.55], fill=(244, 114, 182, 150))
    g.ellipse([W * 0.62, H * 0.45, W * 1.1, H * 1.25], fill=(253, 230, 138, 70))
    g.ellipse([-W * 0.15, H * 0.7, W * 0.3, H * 1.3], fill=(124, 58, 237, 120))
    glow = glow.filter(ImageFilter.GaussianBlur(90 * S))
    base = base.convert("RGBA")
    base.alpha_composite(glow)
    return base


def sparkle(img, cx, cy, r, color=(253, 230, 138, 255)):
    d = ImageDraw.Draw(img)
    k = 0.22
    pts = []
    for i in range(8):
        a = math.pi / 4 * i - math.pi / 2
        rr = r if i % 2 == 0 else r * k
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=color)


def nail(w, h, color):
    """Глянцевый ноготь-«капля» с бликом."""
    n = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    grad = Image.new("RGBA", (w, h))
    gp = grad.load()
    for x in range(w):
        for y in range(h):
            k = x / w
            f = 1.18 - 0.5 * k
            gp[x, y] = (min(255, int(color[0] * f)), min(255, int(color[1] * f)), min(255, int(color[2] * f)), 255)
    # миндалевидная форма: заострённый кончик сверху, ровный край у кутикулы снизу
    left, right = [], []
    tip, p = 0.62, 1.7
    for y in range(h):
        u = y / (h - 1)
        if u < tip:
            v = 1 - u / tip
            hw = (1 - v ** p) ** (1 / p)
        else:
            hw = 1 - 0.10 * ((u - tip) / (1 - tip))
        left.append((w / 2 - hw * (w / 2 - 2), y))
        right.append((w / 2 + hw * (w / 2 - 2), y))
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).polygon(left + right[::-1], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.2 * S))
    n.paste(grad, (0, 0), mask)
    hl = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.polygon([(w * 0.30, h * 0.24), (w * 0.40, h * 0.20), (w * 0.40, h * 0.66), (w * 0.28, h * 0.70)], fill=(255, 255, 255, 125))
    hd.ellipse([w * 0.29, h * 0.74, w * 0.38, h * 0.79], fill=(255, 255, 255, 95))
    n.alpha_composite(Image.composite(hl, Image.new("RGBA", (w, h), (0, 0, 0, 0)), mask))
    return n


def nails(img, variant):
    cols = NAIL_COLORS[variant % len(NAIL_COLORS):] + NAIL_COLORS[:variant % len(NAIL_COLORS)]
    spec = [(-22, 0.0), (-8, 0.12), (7, 0.1), (22, 0.0)]
    nw, nh = 128 * S, 300 * S
    for i, (ang, dy) in enumerate(spec):
        n = nail(nw, nh, cols[i])
        shadow = Image.new("RGBA", n.size, (0, 0, 0, 0))
        shadow.paste((0, 0, 0, 120), (0, 0), n.split()[3])
        shadow = shadow.filter(ImageFilter.GaussianBlur(14 * S))
        r = n.rotate(ang, expand=True, resample=Image.BICUBIC)
        rs = shadow.rotate(ang, expand=True, resample=Image.BICUBIC)
        x = int((712 + i * 104) * S)
        y = int((150 + dy * 300 + (i % 2) * 20) * S)
        img.alpha_composite(rs, (x + 8 * S, y + 16 * S))
        img.alpha_composite(r, (x, y))
    for (sx, sy, sr) in [(1090, 110, 34), (690, 540, 22), (1130, 520, 26), (960, 80, 16)]:
        sparkle(img, sx * S, sy * S, sr * S)


def check(img):
    d = ImageDraw.Draw(img)
    cx, cy, r = 930 * S, 314 * S, 170 * S
    for i in range(3):
        rr = r + (3 - i) * 26 * S
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=(253, 230, 138, 60 + i * 40), width=4 * S)
    for k in range(r, 0, -2):
        t = k / r
        c = (int(GOLD2[0] + (GOLD1[0] - GOLD2[0]) * (1 - t)), int(GOLD2[1] + (GOLD1[1] - GOLD2[1]) * (1 - t)), int(GOLD2[2] + (GOLD1[2] - GOLD2[2]) * (1 - t)), 255)
        d.ellipse([cx - k, cy - k, cx + k, cy + k], fill=c)
    d.line([(cx - 80 * S, cy + 5 * S), (cx - 20 * S, cy + 65 * S), (cx + 85 * S, cy - 60 * S)], fill=PLUM, width=30 * S, joint="curve")
    for (sx, sy, sr) in [(1100, 120, 30), (740, 500, 20), (1120, 520, 24)]:
        sparkle(img, sx * S, sy * S, sr * S)


def wrap(d, text, f, maxw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) <= maxw:
            cur = t
        else:
            lines.append(cur); cur = w
    lines.append(cur)
    return lines


def pill(img, x, y, text, size, gold=True):
    d = ImageDraw.Draw(img)
    f = font(BOLD, size)
    tw = d.textlength(text, font=f)
    padx, pady = 34 * S, 18 * S
    box = [x, y, x + tw + padx * 2, y + size * S + pady * 2]
    if gold:
        pl = Image.new("RGBA", (int(box[2] - box[0]), int(box[3] - box[1])))
        pp = pl.load()
        for i in range(pl.width):
            t = i / pl.width
            for j in range(pl.height):
                pp[i, j] = (int(GOLD1[0] + (GOLD2[0] - GOLD1[0]) * t), int(GOLD1[1] + (GOLD2[1] - GOLD1[1]) * t), int(GOLD1[2] + (GOLD2[2] - GOLD1[2]) * t), 255)
        m = Image.new("L", pl.size, 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, pl.width - 1, pl.height - 1], radius=pl.height // 2, fill=255)
        img.paste(pl, (int(box[0]), int(box[1])), m)
        col = PLUM
    else:
        glass = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(glass).rounded_rectangle(box, radius=(box[3] - box[1]) // 2, fill=(255, 255, 255, 46), outline=(255, 255, 255, 150), width=3 * S)
        img.alpha_composite(glass)
        col = WHITE
    d.text((x + padx, y + pady - 2 * S), text, font=f, fill=col)
    return box[2]


def make(name, title, sub, pill_text=None, chip_text=None, deco="nails", variant=0):
    img = background()
    if deco == "check":
        check(img)
    else:
        nails(img, variant)
    d = ImageDraw.Draw(img)
    left, maxw = 72 * S, 640 * S
    # подпись салона
    bf = font(BOLD, 24)
    label = cfg["businessName"].upper()
    x = left
    for ch in label:
        d.text((x, 62 * S), ch, font=bf, fill=GOLD1)
        x += d.textlength(ch, font=bf) + 5 * S
    d.rectangle([left, 104 * S, left + 70 * S, 108 * S], fill=GOLD2)
    # заголовок
    size = 78
    tf = font(BOLD, size)
    lines = wrap(d, title, tf, maxw)
    while len(lines) > 3 or (lines and max(d.textlength(l, font=tf) for l in lines) > maxw):
        size -= 6; tf = font(BOLD, size); lines = wrap(d, title, tf, maxw)
    y = 140 * S
    for l in lines:
        d.text((left + 3 * S, y + 4 * S), l, font=tf, fill=(0, 0, 0, 70))   # тень
        d.text((left, y), l, font=tf, fill=WHITE)
        y += int(size * 1.14 * S)
    sf = font(REG, 33)
    y += 8 * S
    for l in wrap(d, sub, sf, maxw):
        d.text((left, y), l, font=sf, fill=LILAC)
        y += 46 * S
    py = H - 150 * S
    if pill_text:
        right = pill(img, left, py, pill_text, 42)
        if chip_text:
            pill(img, right + 18 * S, py, chip_text, 42, gold=False)
    out = img.convert("RGB").resize((1200, 628), Image.LANCZOS)
    out.save(os.path.join(OUT, "img_" + name), quality=90, optimize=True)
    print("ok", name)


make("cover.jpg", cfg["businessName"], cfg["tagline"], "Rezerwacja online 24/7", None, "nails", 0)
for i, s in enumerate(cfg["services"]):
    make(f"svc-{i}.jpg", s["name"], "Wybierz usługę i zarezerwuj termin", s["price"], f'{s.get("duration", 60)} min', "nails", i + 1)
make("calendar.jpg", "Wybierz termin", "Kalendarz z wolnymi godzinami", "Zajmie 30 sekund", None, "nails", 2)
make("confirm.jpg", "Sprawdź rezerwację", "Jeszcze jedno kliknięcie", "Prawie gotowe", None, "nails", 4)
make("success.jpg", "Rezerwacja potwierdzona", "Dziękujemy i do zobaczenia!", "Zapraszamy", None, "check")
make("info.jpg", "Adres i godziny", "Zapraszamy do salonu", "Pon–Sob", "10:00–19:00", "nails", 3)
make("portfolio.jpg", "Prace mistrza", "Zobacz efekty naszych stylizacji", "Galeria zdjęć", None, "nails", 5)
