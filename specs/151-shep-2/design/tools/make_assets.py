"""Generate Shep 2 image assets: dithered skies, app icons, share-card background."""
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

PAL = [(7, 10, 28), (20, 26, 68), (38, 44, 102), (77, 63, 120), (138, 83, 116), (201, 118, 58), (243, 180, 92), (255, 228, 176)]
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def h(x, y):
    v = math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return v - math.floor(v)


def sky(W, H, p, seed=11, sheep_done=None, n_sheep=6, t=1.3, base_frac=0.84, show_pen=True, show_shepherd=True):
    """Port of the page's Dither.draw: night-to-dawn scene as an 8-color ordered dither."""
    rnd = random.Random(seed)
    if sheep_done is None:
        sheep_done = round(p * n_sheep)
    base = round(H * base_frac)
    pen0, pen1 = W * 0.72, W * 0.96
    v = [[0.0] * W for _ in range(H)]

    def ground(x):
        if x > pen0 - 8 or not show_pen:
            hh = H * (0.045 + 0.035 * math.sin(x * 0.04 * 192 / W + 0.4) + 0.02 * math.sin(x * 0.1 * 192 / W + 1.3))
            if not show_pen:
                return round(base - hh)
            return base
        hh = H * (0.045 + 0.035 * math.sin(x * 0.04 * 192 / W + 0.4) + 0.02 * math.sin(x * 0.1 * 192 / W + 1.3))
        bl = max(0.0, min(1.0, (x - (pen0 - 30 * W / 192)) / (22 * W / 192)))
        return round(base - hh * (1 - bl))

    gs = [ground(x) for x in range(W)]
    topv, horv = 0.02 + 0.2 * p, 0.2 + 0.64 * p
    for y in range(H):
        for x in range(W):
            if y >= gs[x]:
                v[y][x] = 0.05 + 0.13 * p + (0.08 if h(x, y) < 0.06 else 0)
            else:
                v[y][x] = topv + (horv - topv) * (y / base) ** 1.6
    # stars
    for _ in range(round(W * H / 70)):
        sx, sy = rnd.randrange(W), rnd.randrange(int(H * 0.6))
        fade, ph, sp = rnd.random(), rnd.random() * 6.28, 0.5 + rnd.random() * 2
        if fade < p * 1.25 - 0.08 or sy >= gs[sx]:
            continue
        tw = 0.5 + 0.5 * math.sin(t * sp + ph)
        v[sy][sx] = max(v[sy][sx], 0.45 + 0.5 * tw * (1 - p))
    # moon
    mcx, mcy, mr = W * 0.8, H * (0.14 + 0.56 * p), H * 0.1
    for y in range(int(mcy - mr - 1), int(mcy + mr + 2)):
        for x in range(int(mcx - mr - 1), int(mcx + mr + 2)):
            if 0 <= x < W and 0 <= y < H and y < gs[x] and math.hypot(x - mcx, y - mcy) <= mr:
                shade = 0.94 + 0.06 * ((mcx - x) * 0.7 + (mcy - y) * 0.5) / mr
                v[y][x] = max(v[y][x], shade * (1 - 0.2 * p))
    # sun
    if p > 0.42:
        s = (p - 0.42) / 0.58
        scx, sr = W * 0.36, H * 0.13
        scy = base + sr * 1.1 - s * H * 0.34
        for y in range(max(0, int(scy - sr * 2.4)), min(H, int(scy + sr * 2.4))):
            for x in range(max(0, int(scx - sr * 2.4)), min(W, int(scx + sr * 2.4))):
                if y >= gs[x]:
                    continue
                ds = math.hypot(x - scx, y - scy)
                v[y][x] = 1.0 if ds <= sr else min(1.0, v[y][x] + 0.32 * s * math.exp(-(((ds - sr) / (sr * 0.9)) ** 2)))
    k = W / 192
    if show_pen:
        rail = round(base - H * 0.19)
        for x in range(round(pen0), round(pen1) + 1):
            v[rail][x] = 0.55
            v[rail + 1][x] = 0.4
        for y in range(rail, base):
            for px in (round(pen0), round(pen1), round((pen0 + pen1) / 2)):
                v[y][px] = 0.55
        # sheep
        for i in range(n_sheep):
            done = i < sheep_done
            mx = W * (0.24 + i * 0.07)
            my = gs[min(W - 1, round(mx))] - round(4 * k)
            px = pen0 + 5 * k + (i % 3) * (W * 0.07)
            py = base - round(4 * k) if i < 3 else base - round(9 * k)
            sx, sy = (round(px), round(py)) if done else (round(mx), round(my))
            bw, bh = round(6 * k), round(3 * k)
            for yy in range(bh):
                for xx in range(bw):
                    X, Y = sx + xx, sy + yy
                    corner = (xx < k or xx >= bw - k) and not (bh / 3 <= yy < 2 * bh / 3)
                    if 0 <= X < W and 0 <= Y < H and not corner:
                        v[Y][X] = 1.0
            for yy in range(round(k)):
                for xx in range(round(k)):
                    X, Y = sx + bw + xx, sy + round(k) + yy
                    if X < W and Y < H:
                        v[Y][X] = 0.3
    if show_shepherd:
        hx0 = round(W * 0.06)
        gy = gs[min(W - 1, hx0 + round(2 * k))]
        tall = round(15 * k)
        for y in range(gy - tall, gy):
            for x in range(hx0, hx0 + round(5 * k)):
                rel = (y - (gy - tall)) / k
                xr = (x - hx0) / k
                on = (rel < 3 and 1 <= xr < 4) or (3 <= rel < 10) or (rel >= 10 and (1 <= xr < 2 or 3 <= xr < 4))
                if on and y >= 0:
                    v[y][x] = 0.01
        for y in range(gy - round(20 * k), gy - round(9 * k)):
            for x in range(hx0 + round(7 * k), hx0 + round(7 * k) + max(1, round(k * 0.8))):
                if 0 <= y < H:
                    v[y][x] = 0.02
        lx, ly = hx0 + round(9 * k), gy - round(12 * k)
        R = round(12 * k)
        for y in range(ly - R, ly + R + 1):
            for x in range(lx - R, lx + R + 1):
                if 0 <= x < W and 0 <= y < H:
                    dl = ((x - lx) ** 2 + (y - ly) ** 2) / (k * k)
                    v[y][x] = min(1.0, v[y][x] + 0.42 * math.exp(-dl / 26) * (1 - p * 0.5))
        for yy in range(round(2 * k)):
            for xx in range(max(1, round(k))):
                if 0 <= ly + yy < H:
                    v[ly + yy][lx + xx] = 1.0
    img = Image.new('RGB', (W, H))
    px = img.load()
    n = len(PAL)
    for y in range(H):
        for x in range(W):
            idx = int(v[y][x] * (n - 1) + (BAYER[y & 3][x & 3] + 0.5) / 16)
            px[x, y] = PAL[max(0, min(n - 1, idx))]
    return img


def up(img, f):
    return img.resize((img.width * f, img.height * f), Image.NEAREST)


# --- skies: progress 0..6 of 6 tasks
for i in range(7):
    up(sky(192, 104, i / 6, sheep_done=i), 4).save(os.path.join(OUT, f'sky-{i}of6.png'))
# --- hero (wide) at dawn and at night
up(sky(320, 140, 1.0, sheep_done=6, base_frac=0.86), 4).save(os.path.join(OUT, 'hero-dawn.png'))
up(sky(320, 140, 0.12, sheep_done=0, base_frac=0.86), 4).save(os.path.join(OUT, 'hero-night.png'))
# --- share card background 1200x630 (300x158 x4)
up(sky(300, 158, 0.92, sheep_done=5, base_frac=0.88), 4).crop((0, 0, 1200, 630)).save(os.path.join(OUT, 'share-bg.png'))
# --- sidebar sky (tall)
up(sky(64, 200, 0.5, show_pen=False, show_shepherd=False, base_frac=0.92), 4).save(os.path.join(OUT, 'sidebar-sky.png'))


# --- app icons (1024, supersampled)
S = 2048


def squircle_mask(size, n=5.0):
    m = Image.new('L', (size, size), 0)
    px = m.load()
    r = size / 2
    for y in range(size):
        for x in range(size):
            dx, dy = abs((x + 0.5 - r) / (r * 0.9)), abs((y + 0.5 - r) / (r * 0.9))
            if dx ** n + dy ** n <= 1:
                px[x, y] = 255
    return m


def vgrad(size, stops):
    g = Image.new('RGB', (size, size))
    d = ImageDraw.Draw(g)
    for y in range(size):
        t = y / (size - 1)
        for (a, ca), (b, cb) in zip(stops, stops[1:]):
            if a <= t <= b:
                u = (t - a) / (b - a)
                c = tuple(round(ca[j] + (cb[j] - ca[j]) * u) for j in range(3))
                d.line([(0, y), (size, y)], fill=c)
                break
    return g


def glow(size, cx, cy, r, color, alpha):
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color + (alpha,))
    return layer.filter(ImageFilter.GaussianBlur(r * 0.45))


def finish(img, name):
    mask = squircle_mask(S)
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    out.resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, name))


def lantern_icon(bg_stops, crook, lamp, glow_col, name):
    base = vgrad(S, bg_stops).convert('RGBA')
    base = Image.alpha_composite(base, glow(S, 1210, 1180, 520, glow_col, 150))
    d = ImageDraw.Draw(base)
    w = 96
    # crook: shaft + hook
    d.line([(760, 1720), (760, 760)], fill=crook, width=w)
    d.arc([760, 470, 1240, 950], start=180, end=360, fill=crook, width=w)
    d.line([(1240, 710), (1240, 880)], fill=crook, width=w)
    for cx, cy in [(760, 1720), (760, 760), (1240, 880)]:
        d.ellipse([cx - w / 2, cy - w / 2, cx + w / 2, cy + w / 2], fill=crook)
    # lantern
    d.rounded_rectangle([1130, 930, 1350, 1250], radius=52, fill=lamp)
    d.rounded_rectangle([1170, 880, 1310, 950], radius=24, fill=crook)
    finish(base, name)


lantern_icon([(0, (20, 26, 82)), (0.62, (61, 58, 122)), (1, (243, 180, 92))], (233, 231, 242), (255, 242, 207), (243, 180, 92), 'icon-lantern.png')
lantern_icon([(0, (28, 28, 30)), (1, (52, 52, 56))], (240, 240, 244), (255, 214, 120), (255, 200, 100), 'icon-lantern-dark.png')


def sheep_icon(name):
    base = vgrad(S, [(0, (16, 21, 70)), (0.55, (77, 63, 120)), (0.78, (201, 118, 58)), (1, (243, 180, 92))]).convert('RGBA')
    base = Image.alpha_composite(base, glow(S, 1024, 1500, 560, (255, 214, 140), 170))
    d = ImageDraw.Draw(base)
    # sun on the horizon
    d.ellipse([1020, 1180, 1620, 1780], fill=(255, 228, 176))
    # ground
    d.rectangle([0, 1560, S, S], fill=(24, 20, 48))
    # sheep: wool cloud
    wool = (246, 244, 252)
    for cx, cy, r in [(cx0 - 180, cy0, r0) for cx0, cy0, r0 in [(820, 1330, 170), (1000, 1260, 190), (1180, 1330, 170), (900, 1440, 170), (1110, 1440, 170), (1000, 1380, 200)]]:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=wool)
    # head and legs
    face = (32, 28, 56)
    d.ellipse([1060, 1250, 1280, 1500], fill=face)
    for lx in (700, 930):
        d.rounded_rectangle([lx, 1540, lx + 70, 1700], radius=30, fill=face)
    d.ellipse([1190, 1330, 1220, 1360], fill=(255, 228, 176))
    finish(base, name)


sheep_icon('icon-sheep.png')
print('done', sorted(os.listdir(OUT)))
