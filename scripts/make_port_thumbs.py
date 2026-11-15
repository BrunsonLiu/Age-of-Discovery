# 港口缩略图：给「图鉴」的港口格子配一张小画。
#
# 【为什么需要】
# 图鉴原来 21 个港口格全是「⚓ 名字 / 区域」两行字，等于一本通讯录。
# 项目里已经有 17 张港口场景图（1600×900 / 1792×1024），
# 但一张 200KB，直接塞进 21 个格子 = 4MB，册子一开就卡。
#
# 【判据：按显示尺寸定源尺寸】
# 册子内容区在 1440 屏约 800px 宽、4 列 → 每格约 195px，图高约 110px。
# DPR 2 下需要 390×220。取 400×225 正好覆盖，再大就是白下载。
# 源图 1600×900 是 16:9，1792×1024 是 7:4 → 中心裁成 16:9（上下各切 32px，
# 港口画的天与前景码头本来就被裁过，中心带才是主体）。
#
# 用法：
#   "C:/Users/Brunson/miniforge3/python.exe" scripts/make_port_thumbs.py [--dry]
#
# ⚠️ 系统的 `python`（3.13）没装 Pillow，本机要用 miniforge 那个解释器。
from PIL import Image
import os
import sys

W, H, Q = 400, 225, 72
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SRC = os.path.join(ROOT, 'public', 'assets', 'ports')
OUT = os.path.join(SRC, 'thumb')
dry = '--dry' in sys.argv

os.makedirs(OUT, exist_ok=True)

rows = []
total_src = total_out = 0
for f in sorted(os.listdir(SRC)):
    if not f.endswith('.webp'):
        continue
    sp = os.path.join(SRC, f)
    im = Image.open(sp).convert('RGB')
    sw, sh = im.size
    # 中心裁成 16:9
    want = W / H
    if sw / sh > want:
        cw, ch = int(round(sh * want)), sh
    else:
        cw, ch = sw, int(round(sw / want))
    box = ((sw - cw) // 2, (sh - ch) // 2, (sw + cw) // 2, (sh + ch) // 2)
    thumb = im.crop(box).resize((W, H), Image.LANCZOS)
    op = os.path.join(OUT, f)
    if not dry:
        thumb.save(op, 'WEBP', quality=Q, method=6)
    out_bytes = os.path.getsize(op) if (not dry and os.path.exists(op)) else 0
    src_bytes = os.path.getsize(sp)
    total_src += src_bytes
    total_out += out_bytes
    rows.append((f, f'{sw}x{sh}', f'{cw}x{ch}', src_bytes, out_bytes))

print(f'{"文件":26} {"原尺寸":11} {"裁切后":10} {"原":>7} {"缩略":>7}')
for f, s, c, sb, ob in rows:
    print(f'{f:26} {s:11} {c:10} {sb/1024:6.0f}K {ob/1024:6.0f}K')
print(f'\n共 {len(rows)} 张 · {total_src/1024:.0f}KB → {total_out/1024:.0f}KB '
      f'（{total_out/max(total_src,1)*100:.1f}%）')
