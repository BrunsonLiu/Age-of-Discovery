"""
把 ui_frame_gold.png（512×512 完整画框）处理成 border-image 可用的九宫格。

问题：原图是一张"完整画框"——顶部正中凸起一枚船徽、底部正中凸起一枚贝壳。
      CSS border-image 的 9-slice 会把上下边条带横向拉伸到整个卡片宽度，
      于是船徽/贝壳被拉长铺进内容区，盖住最后一个选项按钮。

方案（"治愈"法，天然无缝）：
  1) 用旁边干净的横栏纹理，填掉顶部船徽与底部贝壳所在的凸起区域
  2) 处理后的原图直接作为 border-image 源，切片值取角块边长（140）
  3) 船徽、贝壳单独导出成小图，供卡片顶部/底部作为独立装饰叠加
     —— 既保留华丽感，又不会压住内容
"""
from PIL import Image
import os

SRC = 'public/assets/ui/ui_frame_gold.png'
OUT_DIR = 'public/assets/ui'

im = Image.open(SRC).convert('RGBA')
W, H = im.size
A = im.getchannel('A').load()


def col_height(x, y0, y1):
    return sum(1 for y in range(y0, y1) if A[x, y] > 8)


def row_span(x, y0, y1):
    ys = [y for y in range(y0, y1) if A[x, y] > 8]
    return (ys[0], ys[-1]) if ys else (y0, y0 + 40)


rail_top = min(col_height(x, 20, 160) for x in range(100, 150))
rail_bot = min(col_height(x, 370, 500) for x in range(100, 150))
ty0, ty1 = row_span(120, 20, 160)
by0, by1 = row_span(120, 370, 500)

# 船徽 / 贝壳的横向范围（高度明显隆起的区段）
crest_x = max(range(180, 340, 4), key=lambda x: col_height(x, 20, 160))
c_left = crest_x
while c_left > 100 and col_height(c_left, 20, 160) > rail_top * 1.5:
    c_left -= 2
c_right = crest_x
while c_right < 400 and col_height(c_right, 20, 160) > rail_top * 1.5:
    c_right += 2

shell_x = max(range(200, 320, 4), key=lambda x: col_height(x, 370, 500))
s_left = shell_x
while s_left > 100 and col_height(s_left, 370, 500) > rail_bot * 1.5:
    s_left -= 2
s_right = shell_x
while s_right < 400 and col_height(s_right, 370, 500) > rail_bot * 1.5:
    s_right += 2

print(f'上横栏 y={ty0}~{ty1}   船徽 x={c_left}~{c_right}')
print(f'下横栏 y={by0}~{by1}   贝壳 x={s_left}~{s_right}')

# ---------- 先备份原始装饰，再做"治愈" ----------
orig = im.copy()
crest_src = orig.crop((c_left - 10, 26, c_right + 10, ty1 + 8))
shell_src = orig.crop((s_left - 10, by0 - 36, s_right + 10, by1 + 10))
crest_src.save(os.path.join(OUT_DIR, 'ui_frame_crest.png'))
shell_src.save(os.path.join(OUT_DIR, 'ui_frame_shell.png'))
print('船徽', crest_src.size, '贝壳', shell_src.size)

healed = im.copy()
hpx = healed.load()

# 顶部：把船徽区（含其上方凸起）用左侧干净横栏纹理平铺覆盖
# 干净纹理取 x∈[CLEAN_X0, c_left)
CLEAN_X0 = 120
tile_w = c_left - CLEAN_X0
if tile_w > 0:
    for x in range(c_left, c_right + 1):
        sx = CLEAN_X0 + (x - c_left) % tile_w
        for y in range(20, ty1 + 2):
            hpx[x, y] = im.getpixel((sx, y))

# 底部：同理
tile_w2 = s_left - CLEAN_X0
if tile_w2 > 0:
    for x in range(s_left, s_right + 1):
        sx = CLEAN_X0 + (x - s_left) % tile_w2
        for y in range(by0 - 38, by1 + 2):
            hpx[x, y] = im.getpixel((sx, y))

healed.save(os.path.join(OUT_DIR, 'ui_frame_gold_slice.png'))
print('九宫格源已写出（切片值 = 140）')

# ---------- 预览：模拟 border-image 拉伸 ----------
C = 140
W_OUT, H_OUT = 420, 300
EDGE = 26
canvas = Image.new('RGBA', (W_OUT, H_OUT), (24, 33, 48, 255))


def blit(dst, src, x, y, w, h):
    dst.paste(src.resize((w, h), Image.LANCZOS), (x, y), src.resize((w, h), Image.LANCZOS))


sp = healed
blit(canvas, sp.crop((0, 0, C, C)), 0, 0, EDGE, EDGE)
blit(canvas, sp.crop((W - C, 0, W, C)), W_OUT - EDGE, 0, EDGE, EDGE)
blit(canvas, sp.crop((0, H - C, C, H)), 0, H_OUT - EDGE, EDGE, EDGE)
blit(canvas, sp.crop((W - C, H - C, W, H)), W_OUT - EDGE, H_OUT - EDGE, EDGE, EDGE)
blit(canvas, sp.crop((C, 0, W - C, C)), EDGE, 0, W_OUT - 2 * EDGE, EDGE)
blit(canvas, sp.crop((C, H - C, W - C, H)), EDGE, H_OUT - EDGE, W_OUT - 2 * EDGE, EDGE)
blit(canvas, sp.crop((0, C, C, H - C)), 0, EDGE, EDGE, H_OUT - 2 * EDGE)
blit(canvas, sp.crop((W - C, C, W, H - C)), W_OUT - EDGE, EDGE, EDGE, H_OUT - 2 * EDGE)
canvas.convert('RGB').save('.workbuddy/verify/fg-simulated.png')
print('模拟预览已保存 .workbuddy/verify/fg-simulated.png')
