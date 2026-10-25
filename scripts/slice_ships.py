# -*- coding: utf-8 -*-
"""
把 ChatGPT 生成的帆船图鉴切分成游戏可用的透明精灵。

输入（Downloads 目录，只读）：
  六艘帆船航海图鉴-3.png   1536x1024，3列x2行，棋盘格背景（RGB 无 Alpha）
  ChatGPT 图像 ...-1..4.png 单船白底图

输出：public/assets/ships/*.png（RGBA，去背景 + 裁边 + 限高 520px）

去背景原理：
  棋盘格灰格实测在 205-240 之间波动（早期 ±18 容差参照法会漏掉 234-240 的亮格，
  导致帆面残留棋盘格碎片）。改用「中性度 + 连通性」双条件：
  1) 背景候选 = 近中性色（max-min 通道差 < 10）且亮度 > 195。
     船帆是奶白（R/G/B 差 20+）、船体是褐木（差值更大），均不满足中性测试；
     原图中帆为半透明渲染，但奶油色叠任何棋盘格后色差仍 > 15，不会误判。
  2) 再用「从图像边界泛洪的连通性」兜底：船内部偶然的中性亮点不连通到边界，保留不删。
"""
import os
from collections import deque
from PIL import Image

SRC = r'C:\Users\Brunson\Downloads'
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'assets', 'ships')
MAX_H = 520  # 输出最大高度（地图图标 70px，2x 视网膜 140px，留足余量）


def build_bg_mask(im, spread_max=10, bright_min=195):
    """返回 set：(x,y) 属于可删背景（中性且够亮）。
    不比较具体颜色——棋盘格灰格实测波动 205-240，参照色容差法会漏格。"""
    w, h = im.size
    px = im.load()
    mask = set()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if max(r, g, b) - min(r, g, b) < spread_max and min(r, g, b) > bright_min:
                mask.add((x, y))
    return mask


def flood_from_border(mask, w, h):
    """只保留与图像边界连通的背景像素（BFS）。"""
    if not mask:
        return set()
    q = deque()
    seen = set()
    for x in range(w):
        for y in (0, h - 1):
            if (x, y) in mask and (x, y) not in seen:
                seen.add((x, y))
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if (x, y) in mask and (x, y) not in seen:
                seen.add((x, y))
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) in mask and (nx, ny) not in seen:
                seen.add((nx, ny))
                q.append((nx, ny))
    return seen


def remove_bg(im):
    """返回 RGBA 图（已删背景、未裁剪）。"""
    im = im.convert('RGB')
    w, h = im.size
    mask = build_bg_mask(im)
    connected = flood_from_border(mask, w, h)
    out = im.convert('RGBA')
    opx = out.load()
    for (x, y) in connected:
        r, g, b, _ = opx[x, y]
        opx[x, y] = (r, g, b, 0)
    return out


def trim(out):
    """按 alpha>8 裁剪到内容包围盒。"""
    bbox = out.getbbox()
    if not bbox:
        return out
    return out.crop(bbox)


def downscale(im, max_h=MAX_H):
    if im.height <= max_h:
        return im
    ratio = max_h / im.height
    return im.resize((max(1, round(im.width * ratio)), max_h), Image.LANCZOS)


def save(im, name):
    path = os.path.join(OUT, name)
    im.save(path, 'PNG', optimize=True)
    kb = os.path.getsize(path) // 1024
    print(f'  {name:24s} {im.size[0]}x{im.size[1]}  {kb} KB')
    return path


def main():
    os.makedirs(OUT, exist_ok=True)
    atlas = Image.open(os.path.join(SRC, '六艘帆船航海图鉴-3.png'))
    W, H = atlas.size
    # 3列x2行单元（列区间由投影分析得出）
    cols = [(212, 477), (604, 937), (1107, 1362)]
    rows = [(0, 512), (512, 1024)]
    cells = {
        'galleon': (cols[0], rows[0]),   # 西班牙大帆船（红十字帆）
        'ghost':   (cols[1], rows[1]),   # 幽灵船（绿光）
        'caravel': (cols[2], rows[0]),   # 小型轻快船
        'frigate': (cols[0], rows[1]),   # 蓝白条纹帆盖伦
        'galleon_war': (cols[1], rows[0]),  # 三桅战舰（西班牙旗）
        'pirate':  (cols[2], rows[1]),   # 海盗船（黑旗）
    }
    print('== 图鉴切分 ==')
    for name, ((x0, x1), (y0, y1)) in cells.items():
        cell = atlas.crop((x0, y0, x1, y1))
        out = downscale(trim(remove_bg(cell)))
        save(out, f'{name}.png')

    print('== 单船图去底 ==')
    singles = {
        'sloop': 'ChatGPT 图像 2026年10月23日 22_05_14-2.png',      # 小型单桅红棕船
        'galleon_royal': 'ChatGPT 图像 2026年10月23日 22_05_12-1.png',  # 蓝金船身盖伦
        'frigate_war': 'ChatGPT 图像 2026年10月23日 22_05_16-3.png',    # 金色船艉战舰
        'frigate_line': 'ChatGPT 图像 2026年10月23日 22_05_18-4.png',   # 条纹帆盖伦
    }
    for name, fn in singles.items():
        im = Image.open(os.path.join(SRC, fn))
        out = downscale(trim(remove_bg(im)))
        save(out, f'{name}.png')

    print('完成 ->', OUT)


if __name__ == '__main__':
    main()
