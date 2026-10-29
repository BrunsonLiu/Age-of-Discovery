# 从 src/ 提取游戏用到的全部字符，生成字体子集
#
# 【为什么要子集化】完整思源宋体中文版 10MB+，不可能直接塞进网页。
# 但游戏里出现的汉字其实是有限的（事件文本、港口名、UI 文案都在 src/ 里），
# 把它们全部抓出来做子集，体积能压到几百 KB。
#
# 【为什么比用 Google Fonts 好】
# Google Fonts 的中文是 303 个 unicode-range 分片 + 225KB 的 CSS，
# 且国内访问不了——对 Windows 玩家等于没改（照样回退宋体）。
# 自托管一个子集：单文件、无外部依赖、国内可用、可用 preload 提前加载。
import io
import json
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
INDEX_HTML = ROOT / 'index.html'

# 除了源码里的字，再补一些"运行时才会出现"的字符：
# 数字、常见标点、以及事件/任务文案里可能拼出来的常用字。
EXTRA = (
    '0123456789'
    'abcdefghijklmnopqrstuvwxyz'
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    '，。、；：？！「」『』（）【】《》〈〉—…·～×÷±°′″%‰'
    '＋－＝／＼｜＠＃＄＆＊０１２３４５６７８９'
    '←→↑↓↔▲▼◀▶★☆●○◆◇■□'
)

chars = set(EXTRA)
files = 0
for path in SRC.rglob('*'):
    if path.suffix not in {'.ts', '.tsx', '.css'}:
        continue
    files += 1
    try:
        text = path.read_text(encoding='utf-8')
    except Exception:
        continue
    chars.update(text)

# index.html 里也有文案（标题、meta）
if INDEX_HTML.exists():
    chars.update(INDEX_HTML.read_text(encoding='utf-8'))

# 去掉控制字符与空白
chars = {c for c in chars if c.isprintable() and c not in '\u200b\ufeff'}

han = sorted(c for c in chars if '\u4e00' <= c <= '\u9fff')
other = sorted(c for c in chars if not ('\u4e00' <= c <= '\u9fff'))

print(f'扫描 {files} 个文件')
print(f'汉字 {len(han)} 个 / 非汉字 {len(other)} 个 / 合计 {len(chars)} 个')
print(f'汉字样本: {"".join(han[:40])}')

out = ROOT / '.workbuddy' / 'font-chars.txt'
out.write_text(''.join(sorted(chars)), encoding='utf-8')
print(f'已写出 {out}（{out.stat().st_size} 字节）')

(ROOT / '.workbuddy' / 'font-chars.json').write_text(
    json.dumps({'han': len(han), 'total': len(chars)}, ensure_ascii=False),
    encoding='utf-8',
)
