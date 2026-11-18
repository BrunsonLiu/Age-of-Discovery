"""把项目的中文源字体从 ExtraLight 换成 Regular。

【为什么】`.workbuddy/fonts-src/noto-sc-union.ttf` 的内部族名是
`Noto Serif SC ExtraLight` —— 整个游戏的中文都是 200 字重的超细体，
12~13px 下横画只有 1 个物理像素，被抗锯齿吃掉一半，看起来"发虚"。
用户的原话是"字体有点丑"，根子在这里，不在字号或颜色。

【怎么做】Google Fonts 的 CSS API 支持 `text=` 参数：只返回含有这些字的
最小 woff2。一个字集太大（2000+ 字）URL 会超长，所以分批取，再用
fontTools 合并成一份 TTF，最后改 name 表把族名落回 `Noto Serif SC`
（不改名的话浏览器会把它当成另一个家族，`font-weight: 400` 匹配不上）。

用法：`python scripts/fetch_regular_source.py`
产物：`.workbuddy/fonts-src/noto-sc-union.ttf`（原文件备份为 .extralight.bak）
"""
import io
import os
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

from fontTools.merge import Merger
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
CHARS_FILE = ROOT / '.workbuddy' / 'font-subset.txt'
OUT = ROOT / '.workbuddy' / 'fonts-src' / 'noto-sc-union.ttf'
CACHE = ROOT / '.workbuddy' / 'fonts-src' / 'regular-parts'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
BATCH = 500


def fetch(css_url: str) -> bytes:
    """用 curl 取（沙箱里的 python urllib 走代理不稳，curl 一直是通的）。"""
    p = subprocess.run(
        ['curl', '-s', '--noproxy', '*', '-m', '60', '-A', UA, css_url],
        capture_output=True, check=True,
    )
    return p.stdout


def main() -> int:
    text = CHARS_FILE.read_text(encoding='utf-8')
    chars = sorted({c for c in text if not c.isspace()})
    if not chars:
        print('字符集为空，先跑 npm run font:subset 生成 .workbuddy/font-subset.txt')
        return 1
    print(f'需要 {len(chars)} 个字符，分 {-(-len(chars)//BATCH)} 批')

    CACHE.mkdir(parents=True, exist_ok=True)
    parts = []
    for i in range(0, len(chars), BATCH):
        chunk = ''.join(chars[i:i + BATCH])
        idx = i // BATCH
        part = CACHE / f'part-{idx:02d}.woff2'
        if part.exists() and part.stat().st_size > 2000:
            parts.append(part)
            print(f'  第 {idx} 批：用缓存（{part.stat().st_size // 1024}KB）')
            continue
        q = urllib.parse.quote(chunk, safe='')
        css_url = (
            'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400&'
            f'display=swap&text={q}'
        )
        css = fetch(css_url).decode('utf-8', 'ignore')
        # CSS 里最后一个 url(...) 就是 latin+中文合并后的那份（Google 对 text= 只回一片）
        urls = [u for u in __import__('re').findall(r'url\((https://[^)]+)\)', css)]
        if not urls:
            print(f'  第 {idx} 批：CSS 里没有 woff2（返回 {len(css)} 字节）')
            return 2
        data = fetch(urls[-1])
        if len(data) < 1000:
            print(f'  第 {idx} 批：下载内容过小（{len(data)} 字节）')
            return 2
        part.write_bytes(data)
        parts.append(part)
        print(f'  第 {idx} 批：{len(chunk)} 字 → {len(data) // 1024}KB')
        time.sleep(0.4)

    # woff2 → 落盘的 TTF（Merger 只认路径，不认 TTFont 对象）
    ttf_paths = []
    for p in parts:
        f = TTFont(p)
        f.flavor = None
        tp = p.with_suffix('.ttf')
        f.save(tp)
        ttf_paths.append(str(tp))

    print(f'合并 {len(ttf_paths)} 片 ...')
    merged = Merger().merge(ttf_paths)

    # 族名必须落回 'Noto Serif SC'：源文件的族名带着 'ExtraLight'，
    # 直接换成 400 面之后，浏览器会按族名分家，`font-family: 'Noto Serif SC'`
    # 匹配不到它 —— 表现就是"换了字体但画面没变"。
    name = merged['name']
    for rec in list(name.names):
        if rec.nameID in (1, 4, 6, 16, 17):
            pass
    for rec in name.names:
        if rec.nameID == 1:
            rec.string = 'Noto Serif SC'
        elif rec.nameID == 4:
            rec.string = 'Noto Serif SC Regular'
        elif rec.nameID == 6:
            rec.string = 'NotoSerifSC-Regular'
        elif rec.nameID == 16:
            rec.string = 'Noto Serif SC'
        elif rec.nameID == 17:
            rec.string = 'Regular'
    merged['OS/2'].usWeightClass = 400

    backup = OUT.with_suffix('.extralight.bak')
    if OUT.exists() and not backup.exists():
        OUT.rename(backup)
        print(f'原文件备份为 {backup.name}')
    merged.save(OUT)
    print(f'已写入 {OUT.relative_to(ROOT)}（{OUT.stat().st_size // 1024}KB，字形 {len(merged.getGlyphOrder())}）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
