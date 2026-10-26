"""
生成可平铺的海面纹理（古铜版画海图口吻）。

【为什么重做】
原来这张图是「写实油画浪花」——高饱和深蓝、密布白色浪沫、照片级细节。
放在地图上当底图，两个问题：
  1. 风格割裂：旁边是羊皮纸陆地，这里是现代海洋摄影
  2. 抢戏：浪花细节比海岸线、比航线、比港口标签都响，
     玩家在地图上第一眼看到的是「浪」而不是「航线」

【新版的做法】
底色用低饱和的青灰（铜版画里海水的刻线色），浪用**细线排刻**表现
——一组组平行的手绘波纹线，而不是照片级的立体浪花。
线多但淡、密度低、方向一致，远看是一整片"刻出来的海"，
近看能看见笔触，但绝不抢走海岸线和航线的注意力。

无缝：用 3×3 画布绘制再裁中心（溢出部分保证相邻 tile 边界连续）。
输出：
  public/assets/sea/sea-tile.png         常规
  public/assets/sea/sea-tile-storm.png   暴风雨（更深、更乱、浪线更密）
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

    # --- 大尺度深浅斑：洋流的明暗，让海面不平 ---
    # 数量刻意压低：斑块太密会让远看变成噪点。
    for _ in range(10 if not storm else 14):
        cx = TILE + rnd.random() * TILE
        cy = TILE + rnd.random() * TILE
        rx = 140 + rnd.random() * 240
        ry = 90 + rnd.random() * 160
        delta = -rnd.randint(6, 14) if not storm else -rnd.randint(12, 26)
        c = tuple(max(0, min(255, base_rgb[i] + delta)) for i in range(3))
        dr.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=c + (rnd.randint(22, 42),))

    # --- 刻线波纹：铜版画里"海"的标准画法 ---
    # 每组是若干条近似平行的弧线，组内间距均匀——像刻刀一笔一笔拉出来的。
    line_rgb = (206, 222, 224) if not storm else (198, 212, 218)
    groups = 26 if not storm else 34

    def wave_group(gx: float, gy: float, amp: float, wl: float, phase: float,
                   count: int, alpha: int, width: int):
        for i in range(count):
            y0 = gy + i * 5.5
            pts = []
            steps = 120
            for s in range(steps + 1):
                t = s / steps
                x = TILE + t * TILE
                y = (y0
                     + amp * math.sin(t * wl * math.tau + phase)
                     + (amp * 0.35) * math.sin(t * wl * 2.3 * math.tau + phase * 1.7))
                pts.append((x, y))
            dr.line(pts, fill=line_rgb + (alpha,), width=width)

    for _ in range(groups):
        wave_group(
            gx=TILE + rnd.random() * TILE,
            gy=TILE + rnd.random() * TILE,
            amp=4 + rnd.random() * 7,
            wl=1.1 + rnd.random() * 1.8,
            phase=rnd.random() * math.tau,
            count=3 + rnd.randint(0, 4),
            alpha=rnd.randint(22, 40) if not storm else rnd.randint(30, 52),
            width=1,
        )

    # --- 极少量浪尖白沫：只是点缀，不是主角 ---
    # 原版 150 个泡沫点太吵；这里降到 26 个，且透明度很低。
    foam = (226, 236, 238)
    for _ in range(26 if not storm else 40):
        x = TILE + rnd.random() * TILE
        y = TILE + rnd.random() * TILE
        r = 1 + rnd.random() * 1.6
        dr.ellipse([x - r, y - r, x + r, y + r], fill=foam + (rnd.randint(18, 38),))

    # --- 轻微模糊让线条像手绘而不是矢量的锐边 ---
    img = img.filter(ImageFilter.GaussianBlur(0.7))
    return img.crop((TILE, TILE, TILE * 2, TILE * 2))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    # 常规海：低饱和青灰（#3d5a5e 附近）——比陆地的暖黄冷、比深夜亮，
    # 玩家一眼能分辨"水"和"地"，但海面不抢戏。
    normal = make_tile((61, 90, 94), storm=False)
    normal.save(os.path.join(OUT_DIR, 'sea-tile.png'), optimize=True)
    # 暴风雨版：更深更冷
    storm = make_tile((38, 58, 64), storm=True)
    storm.save(os.path.join(OUT_DIR, 'sea-tile-storm.png'), optimize=True)
    print('written:', os.path.join(OUT_DIR, 'sea-tile.png'), normal.size)
    print('written:', os.path.join(OUT_DIR, 'sea-tile-storm.png'), storm.size)


if __name__ == '__main__':
    main()
