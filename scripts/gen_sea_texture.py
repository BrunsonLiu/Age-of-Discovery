"""
生成可平铺海面纹理（替代纯色底图的环境氛围）：
- 深蓝绿底 + 大尺度深浅斑（模拟洋流阴影）
- 正弦波浪弧线（两组不同频率，交叉成"浪纹"）
- 泡沫点与短弧（浪尖）
- 9 倍溢出绘制法保证四边无缝平铺
输出：public/assets/sea/sea-tile.png（常规）与 sea-tile-storm.png（暴风雨加深版）
"""
import os
import math
import random
from PIL import Image, ImageDraw, ImageFilter

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'assets', 'sea')
TILE = 512
BIG = TILE * 3  # 3x3 画布，中心裁出无缝平铺 tile


def make_tile(base_rgb: tuple, storm: bool = False) -> Image.Image:
    rnd = random.Random(20261023 if not storm else 777)
    img = Image.new('RGB', (BIG, BIG), base_rgb)
    dr = ImageDraw.Draw(img, 'RGBA')

    # --- 大尺度深浅斑（洋流阴影）：画在中心区，溢出部分被裁掉但相邻 tile 边缘连续 ---
    for _ in range(26):
        cx = TILE + rnd.random() * TILE
        cy = TILE + rnd.random() * TILE
        rx = 90 + rnd.random() * 190
        ry = 50 + rnd.random() * 120
        # 暴风雨版斑块更深
        delta = -rnd.randint(8, 22) if not storm else -rnd.randint(14, 30)
        c = tuple(max(0, min(255, base_rgb[i] + delta)) for i in range(3))
        dr.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=c + (rnd.randint(28, 60),))

    # --- 两组波浪弧：低频长浪 + 高频细浪 ---
    def wave_band(count, amp, wl, alpha, width, color):
        for _ in range(count):
            y0 = TILE + rnd.random() * TILE
            phase = rnd.random() * math.tau
            pts = []
            steps = 96
            for i in range(steps + 1):
                x = TILE + (i / steps) * TILE
                y = y0 + amp * math.sin((i / steps) * wl * math.tau / TILE * TILE + phase) \
                    + (amp * 0.4) * math.sin((i / steps) * wl * 2.7 * math.tau + phase * 1.7)
                pts.append((x, y))
            dr.line(pts, fill=color + (alpha,), width=width)

    wave_color = (150, 200, 215)
    wave_band(10, 10, 1.6, 26, 2, wave_color)   # 长浪
    wave_band(22, 5, 3.2, 20, 1, wave_color)    # 细浪
    if storm:
        wave_band(30, 8, 4.5, 30, 2, (170, 195, 210))  # 风暴：浪更乱更亮

    # --- 泡沫点与短弧（浪尖白沫） ---
    foam = (220, 235, 240)
    for _ in range(150 if not storm else 210):
        x = TILE + rnd.random() * TILE
        y = TILE + rnd.random() * TILE
        r = 1 + rnd.random() * 2.2
        dr.ellipse([x - r, y - r, x + r, y + r], fill=foam + (rnd.randint(30, 80),))
    for _ in range(40):
        x = TILE + rnd.random() * TILE
        y = TILE + rnd.random() * TILE
        ln = 6 + rnd.random() * 14
        dr.arc([x, y, x + ln, y + ln * 0.5], 200, 340, fill=foam + (rnd.randint(35, 70),), width=1)

    # --- 轻微模糊让斑块柔和，再裁中心 ---
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    return img.crop((TILE, TILE, TILE * 2, TILE * 2))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    # 常规深海：偏蓝绿（#1d4e63 附近，比 ocean-900 亮一档，让陆地块浮起来）
    normal = make_tile((29, 78, 99), storm=False)
    normal.save(os.path.join(OUT_DIR, 'sea-tile.png'), optimize=True)
    # 暴风雨版：更暗更冷
    storm = make_tile((16, 40, 55), storm=True)
    storm.save(os.path.join(OUT_DIR, 'sea-tile-storm.png'), optimize=True)
    print('written:', os.path.join(OUT_DIR, 'sea-tile.png'), normal.size)
    print('written:', os.path.join(OUT_DIR, 'sea-tile-storm.png'), storm.size)


if __name__ == '__main__':
    main()
