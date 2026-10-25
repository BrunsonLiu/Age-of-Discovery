"""
切分 GPT 生成的图鉴：
1) 十四人角色图鉴-2.png（1536×1024，7 列 × 2 行，带 E1-E14 编号签）
   → public/assets/portraits/e01.png ... e14.png（保留编号签，整格切出）
2) 六幕海上传奇.png（1672×941，2 列 × 3 行，带 D5-D10 编号签）
   → public/assets/scenes/d05.png ... d10.png
分隔带位置由 variance 分析实测得出（见提交记录），非硬编码假设。
"""
import os
from PIL import Image

SRC_DIR = r'C:\Users\Brunson\Downloads'
OUT_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'assets')

PORTRAIT_SRC = os.path.join(SRC_DIR, '航海时代十四人角色图鉴-2.png')
PORTRAIT_OUT = os.path.join(OUT_ROOT, 'portraits')
# 7 列分隔带中点：217, 437, 658, 878, 1100, 1321 → 边界取带左缘
PORTRAIT_COLS = [0, 221, 440, 661, 882, 1103, 1325, 1536]
PORTRAIT_ROWS = [0, 503, 1024]

SCENE_SRC = os.path.join(SRC_DIR, '六幕海上传奇 карти pictorial.png')
SCENE_OUT = os.path.join(OUT_ROOT, 'scenes')
# 2 列分隔带 832-840；3 行分隔带 309-315 / 623-629
SCENE_COLS = [0, 840, 1672]
SCENE_ROWS = [0, 315, 629, 941]


def slice_grid(src, cols, rows, out_dir, prefix, count, pad=0):
    im = Image.open(src).convert('RGB')
    os.makedirs(out_dir, exist_ok=True)
    n = 0
    for ri in range(len(rows) - 1):
        for ci in range(len(cols) - 1):
            if n >= count:
                return
            x0, x1 = cols[ci] + pad, cols[ci + 1] - pad
            y0, y1 = rows[ri] + pad, rows[ri + 1] - pad
            cell = im.crop((x0, y0, x1, y1))
            name = f'{prefix}{n + 1:02d}.png'
            cell.save(os.path.join(out_dir, name), optimize=True)
            print(f'  {name}: {cell.size}')
            n += 1


def main():
    print('肖像（E 编号，来自 十四人角色图鉴-2）:')
    slice_grid(PORTRAIT_SRC, PORTRAIT_COLS, PORTRAIT_ROWS, PORTRAIT_OUT, 'e', 14)
    print('事件场景（D 编号，来自 六幕海上传奇）:')
    slice_grid(SCENE_SRC, SCENE_COLS, SCENE_ROWS, SCENE_OUT, 'd', 6)
    print('done')


if __name__ == '__main__':
    main()
