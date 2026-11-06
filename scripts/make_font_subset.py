#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
重新切中文子集字体（**这是唯一该用的字体构建入口**）。

【与 `scripts/extract_font_chars.py` 的关系】
那个脚本只负责「从 src 提取字符、写一份清单」，不切字体，而且**整文件读、不剥注释**——
注释里出现的字（如「刘姓籍」这类只在说明文字里出现的字）会被算进子集，
而真正该有却漏掉的字它也发现不了。本脚本做了三件它没做的事：
  ① 剥注释后再取字符串字面量，只算子集真正需要的字；
  ② 直接产出 woff2（主源 + 补源合并，见下）；
  ③ 生成 `noto-serif-sc-coverage.json`（字体 sha1 + 真实 cmap），给单测当权威依据。


【为什么需要这个脚本】
项目自托管 `noto-serif-sc-subset.woff2`（401KB / 2175 汉字）。子集是按**当时的文案**
切的，而文案一直在长 —— 实测有 41 个界面在用的字不在字体里（啊 / 梅 / 鸡 / 酸 / 饼…，
集中在 events.ts、dialogue.ts、crewChars.ts、tasks.ts）。
缺字不会报错，浏览器会**静默回退到系统衬线**：同一句话里出现两种字形。
这种缺陷截图也难看，只能靠 cmap 逐字比对。

【怎么做】
1. 从 src 收集「界面文案」用到的汉字：去掉注释，只取字符串字面量与 JSX 文本节点；
   再加上 ASCII、CJK 标点、全角符号等基础字形。
2. 用 pyftsubset 从**完整源字体**切出这些字，flavor=woff2。
3. 打印前后体积与覆盖率。

【源字体从哪来】
`noto-serif-sc-chinese-simplified-400-normal.woff2`（fontsource，1.5MB，7946 码位 / 7333 汉字），
比 Google Fonts 的 CSS2 分片好处理 —— 那套按 unicode-range 切成上百片，合并很麻烦。
源文件缓存在 `.workbuddy/fonts-src/`（不进仓库、不打包）。

但这个源也缺几个生僻字：**啐 / 焐 / 舢**（events.ts 里「舢板」「焐开火漆」「啐了一口」）。
它们恰好都在**旧子集**里，所以先把两路源合并成 `noto-sc-union.ttf`（7991 码位）再切 ——
这样零缺字。合并结果会缓存，脚本只做一次。

【什么时候要重跑】
新增/改动文案后，如果 `test/e2e/font-coverage.mjs` 报缺字，就跑一遍这个脚本。
"""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / '.workbuddy' / 'fonts-src'
# 主源（7333 汉字）+ 补源（旧子集，提供主源缺的 3 个生僻字）
SRC_FULL = FONT_DIR / 'noto-sc-full.woff2'
SRC_EXTRA = FONT_DIR / 'old-subset.woff2'
SRC_UNION = FONT_DIR / 'noto-sc-union.ttf'
OUT_FONT = ROOT / 'src' / 'assets' / 'fonts' / 'noto-serif-sc-subset.woff2'

# 基础字形：ASCII 可打印 + CJK 标点 + 常用全角符号。
# 这些不是「从文案里扫出来的」，但界面上随时会出现（数字、单位、破折号、书名号…），
# 少一个就是一个方块，所以固定带上。
BASE = (
    ''.join(chr(c) for c in range(0x20, 0x7F))
    + '。，、；：？！“”‘’（）【】《》〈〉「」『』…—～·　'
    + '％＋－×÷＝≠≤≥°′″※→←↑↓↔'
)

# 字符串字面量与 JSX 文本节点
LIT = re.compile(r"""'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\]*)`|>([^<>{}]*)<""", re.S)


def collect_chars() -> set[str]:
    chars: set[str] = set()
    files = [p for p in (ROOT / 'src').rglob('*') if p.suffix in ('.ts', '.tsx', '.css', '.html')]
    for p in files:
        s = p.read_text(encoding='utf-8', errors='replace')
        # 去掉注释，避免把「解释用字」也算进去（不过多算一点只是字体大一点，不影响正确性）
        s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
        s = re.sub(r'^\s*//.*$', '', s, flags=re.M)
        for m in LIT.finditer(s):
            for g in m.groups():
                if not g:
                    continue
                for ch in g:
                    o = ord(ch)
                    if 0x3400 <= o <= 0x9FFF or 0x3000 <= o <= 0x303F or 0xFF00 <= o <= 0xFFEF:
                        chars.add(ch)
    # 数据文件里的中文（港口名的其它写法、航线说明等）
    for p in (ROOT / 'public' / 'data').rglob('*.json'):
        try:
            s = p.read_text(encoding='utf-8', errors='replace')
        except OSError:
            continue
        for ch in s:
            if 0x3400 <= ord(ch) <= 0x9FFF:
                chars.add(ch)
    return chars


def build_union() -> pathlib.Path:
    """
    主源 + 补源合成一个 union.ttf（缓存）。

    为什么要合：主源（fontsource 简体）缺 啐/焐/舢，而这三个字在旧子集里有；
    合并后 7991 码位，才能做到「文案用字一个不缺」。
    合并用 fontTools.merge，注意它只接受**路径**（传 TTFont 对象会报 TypeError）。
    """
    if SRC_UNION.exists():
        return SRC_UNION
    if not SRC_EXTRA.exists():
        print(f'没有补源 {SRC_EXTRA}，直接用主源（会有 3 个生僻字缺失）')
        return SRC_FULL
    from fontTools.merge import Merger
    print('合并主源 + 补源 → union.ttf ...')
    merged = Merger().merge([str(SRC_FULL), str(SRC_EXTRA)])
    merged.save(str(SRC_UNION))
    cov: set[int] = set()
    for t in merged['cmap'].tables:
        cov |= set(t.cmap.keys())
    print(f'   合并后 {len(cov)} 码位 / {SRC_UNION.stat().st_size // 1024}KB')
    return SRC_UNION


def main() -> int:
    if not SRC_FULL.exists():
        print(f'缺源字体：{SRC_FULL}\n先下载：\n'
              '  curl -s -o .workbuddy/fonts-src/noto-sc-full.woff2 \\\n'
              '    https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-sc@5/files/'
              'noto-serif-sc-chinese-simplified-400-normal.woff2')
        return 1

    src = build_union()

    chars = collect_chars()
    text = ''.join(sorted(set(chars) | set(BASE)))
    tmp = ROOT / '.workbuddy' / 'font-subset.txt'
    tmp.write_text(text, encoding='utf-8')

    before = OUT_FONT.stat().st_size if OUT_FONT.exists() else 0
    cmd = [
        sys.executable, '-m', 'fontTools.subset', str(src),
        f'--text-file={tmp}',
        '--flavor=woff2',
        '--layout-features=kern,liga',
        '--no-hinting',
        '--desubroutinize',
        f'--output-file={OUT_FONT}',
    ]
    print('切子集：', ' '.join(cmd[2:]))
    subprocess.run(cmd, check=True)
    after = OUT_FONT.stat().st_size

    from fontTools.ttLib import TTFont
    f = TTFont(OUT_FONT)
    cov: set[int] = set()
    for t in f['cmap'].tables:
        cov |= set(t.cmap.keys())
    missing = [c for c in sorted(chars) if ord(c) not in cov]
    print(f'\n字形 {len(f.getGlyphOrder())} 个 · 码位 {len(cov)} 个')
    print(f'体积 {before // 1024}KB → {after // 1024}KB（{(after - before) / 1024:+.0f}KB）')
    print(f'文案用字 {len(chars)} 个，缺 {len(missing)} 个' + (f' → {"".join(missing)}' if missing else ' ✓'))

    # 覆盖清单：给单测用的**权威**依据。
    # 为什么不是"把刚才要求切进去的字记下来"——那样是自证：切的时候漏了，
    # 清单也会跟着漏。所以这里存的是**字体里真实存在的 cmap**（权威），
    # 外加字体文件的 sha1：单测先核对指纹，再核对文案用字是否都在 cmap 里。
    # 只改字体不改清单 → 指纹对不上；只加文案不重切 → 用字不在清单里。两头都堵住。
    import hashlib
    import json
    digest = hashlib.sha1(OUT_FONT.read_bytes()).hexdigest()
    manifest = {
        '_说明': '由 scripts/make_font_subset.py 生成，勿手改。文案新增字后重跑该脚本。',
        'fontSha1': digest,
        'fontKB': round(after / 1024),
        'codepoints': len(cov),
        'chars': ''.join(chr(c) for c in sorted(cov) if c >= 0x20),
    }
    (OUT_FONT.parent / 'noto-serif-sc-coverage.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'覆盖清单已写：noto-serif-sc-coverage.json（sha1 {digest[:12]}…，{len(manifest["chars"])} 字）')
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main())
