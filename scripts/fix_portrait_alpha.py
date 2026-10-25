# 第二批新肖像：RGB -> RGBA（alpha 全 255，视觉零变化）
# 原因：项目约定肖像统一 8bit RGBA；测试第 681 行断言 buf[25]===6
# 新素材是"羊皮纸不透明"RGB，转 RGBA 后与旧肖像规格一致，未来要抠背景也有 alpha 通道可用
from PIL import Image
import os

FILES = [
    'officer_first_mate.png',
    'rival_silver_maria.png',
    'rival_stareyed_diego.png',
    'crew_blackflag_guide.png',
]
base = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets', 'portraits')
base = os.path.normpath(base)

for f in FILES:
    p = os.path.join(base, f)
    im = Image.open(p)
    if im.mode == 'RGBA':
        print(f'{f}: 已是 RGBA，跳过')
        continue
    rgb = im.convert('RGB')
    out = Image.new('RGBA', rgb.size, (0, 0, 0, 0))
    out.paste(rgb, (0, 0))
    out.save(p, 'PNG', optimize=True)
    print(f'{f}: {im.mode} -> RGBA  {out.size}')

# 复核
import struct
print('--- 复核 ---')
for f in FILES:
    d = open(os.path.join(base, f), 'rb').read()
    w, h = struct.unpack('>II', d[16:24])
    print(f'{f:28} {w}x{h} depth={d[24]} colortype={d[25]} (6=RGBA)')
