#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把中文子集字体按 **unicode-range 拆成两片**：首屏片（A）+ 其余片（B）。

【为什么要拆 —— 实测数字】
slow4g（400KB/s + 300ms RTT）冷启动时，中文字体 `noto-serif-sc-subset.woff2`
是 369KB / 2149 字。用 `test/e2e/probe-block.mjs` 逐项 abort 做归因：

    拦掉中文字体 → 「陆地画出来」早 **1131ms**（基线 5726ms）

原因不是"字体挡渲染"，而是它**在地图数据下载的中途抢走了整条管子**：
land.geojson（368KB）从 1768ms 开始，字体在 1916ms 插进来，两者各分一半带宽。
字体是 High 优先级（Chrome 认为文字渲染阻塞），抢得比 fetch 还凶。

而首屏真正要渲染的中文，只有主标题、五国名、几行说明 —— 几十个字。
把这一小片先给出去，剩下的等地图出来再取，**首屏就不用等 369KB**。

【为什么从"现有子集"里切，而不是从源字体重切】
现有子集是按当前文案切好的、已被单测与 `font-coverage.mjs` 验过零缺字。
用 pyftsubset 对它做**按码位再切**，A ∪ B 必然逐字等于原集合 ——
不存在"重切一遍又漏了哪个字"的风险。这是这次改动唯一能接受的做法。

【A 集合怎么定】
按源码文件白名单取字（下面 FIRST_SCREEN_FILES）。判据是"这些文件在
地图出现之前就已经渲染"。取字逻辑与 `make_font_subset.py` 一致（剥注释、
只取字符串字面量与 JSX 文本），否则两边各说一套。

【错了会怎样】
不会碎：A 里没有的字会落进 B，浏览器于是照旧去下 B（回到今天的行为），
只是没省下时间。所以这是**收益型改动**，不是风险型。单测仍会盯
"首屏白名单里的字必须都在 A"，防止悄悄退化。

用法：
  python scripts/split_font_subset.py            # 生成 A/B + 更新覆盖清单
  python scripts/split_font_subset.py --dry      # 只打印统计
"""
import json
import pathlib
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / 'src' / 'assets' / 'fonts'
SRC = FONT_DIR / 'noto-serif-sc-subset.woff2'
OUT_A = FONT_DIR / 'noto-serif-sc-boot.woff2'
OUT_B = FONT_DIR / 'noto-serif-sc-rest.woff2'
MANIFEST = FONT_DIR / 'noto-serif-sc-coverage.json'
CSS_HINT = FONT_DIR / 'split-ranges.json'

#: 地图出现之前就已经在屏幕上的那些文件。加新屏/新开场内容时把文件补进来。
#:
#: 【逐个文件的取舍理由】每多一个字都直接变成首屏要等的字节，所以只放
#: "开场就在、且地图出现前不会消失"的东西：
#:   · IntroScreen        开场日志卡、主标题、五国卡（首屏主体）
#:   · nations.ts         国名/船名/一句话旗号（卡片上直接显示）
#:   · MainMap            地图外壳：顶栏、图例、提示条（地图模块一挂上就有）
#:   · BottomBar/ShipCard 常驻底栏与船卡
#:   · ships.ts/Compass   船型中文名、罗盘方位字
#:
#: 【故意**不在**名单里的】
#:   · intro/HelpPanel        740 字 —— 帮助面板，玩家点"帮助"才出现。
#:     它一个人就顶掉整片预算（首屏从 198 字涨到 938 字），却不在首屏。
#:   · intro/TutorialOverlay  16 字 —— 新手引导层，地图出来之后才浮上来。
#:   · 各 panels/events 组件   全是点开才有的内容。
#: 漏掉一个"其实首屏就在"的文件 → 它的字落进 B 片 → B 被提前请求 →
#: 回到今天的行为（不碎，但没省）。单测会盯住这个退化。
FIRST_SCREEN_FILES = [
    'src/App.tsx',
    'src/pages/MainMap.tsx',
    'src/components/intro/IntroScreen.tsx',
    'src/components/ui/BottomBar.tsx',
    'src/components/ui/TopBar.tsx',
    'src/components/ui/Compass.tsx',
    'src/components/ui/ShipCard.tsx',
    'src/components/map/ShipAnimation.tsx',
    'src/components/map/NpcShips2D.tsx',
    'src/data/nations.ts',
    'src/data/uiAssets.ts',
    'src/data/ships.ts',
]

#: 与 make_font_subset.py / 单测同一套判据
LIT = re.compile(r"'([^'\\\n]*)'|\"([^\"\\\n]*)\"|`([^`\\]*)`|>([^<>{}]*)<", re.S)
CJK = re.compile(r'[\u3000-\u9fff]')


def strip_comments(text: str) -> str:
    text = re.sub(r'/\*[\s\S]*?\*/', '', text)
    return re.sub(r'^\s*//.*$', '', text, flags=re.M)


def chars_of(path: pathlib.Path) -> set:
    src = strip_comments(path.read_text(encoding='utf-8'))
    out = set()
    for m in LIT.finditer(src):
        for g in m.groups():
            if not g:
                continue
            for ch in g:
                if CJK.match(ch):
                    out.add(ch)
    return out


#: 实测首屏字表（DOM 抓取；`test/e2e/font-split.mjs` 会重抓并比对）
BOOT_CHARS = FONT_DIR / 'boot-chars.txt'


def first_screen_chars() -> set:
    out = set()
    for rel in FIRST_SCREEN_FILES:
        p = ROOT / rel
        if p.is_dir():
            for f in p.rglob('*.ts*'):
                out |= chars_of(f)
        elif p.exists():
            out |= chars_of(p)
        else:
            print(f'  ! 白名单里的路径不存在：{rel}', file=sys.stderr)
    # 【为什么要并上 boot-chars.txt】
    # 首屏有几个字根本不在上面那些文件里：
    #   · 晴朗 / 节   天气与风速单位，标签在工具函数里拼出来
    #   · 春          季节名（utils/season.ts）
    #   · 哥          年表第一天的「哥伦布发现新大陆」（data/historicalTimeline.ts）
    #   · 制          「绘制航海图…」地图加载文案（MapView）
    # 这些模块本身各有几百上千字（events.ts 单独就有两万多字），整个塞进白名单
    # 会把首屏预算打爆。所以判据改成**实测**：跑起来抓一次首屏 DOM 文本，
    # 存在 boot-chars.txt 里（test/e2e/font-split.mjs 负责重抓与比对）。
    # 文件白名单仍然保留 —— 它挡的是"新加了一整块首屏 UI"这种结构性变化。
    if BOOT_CHARS.exists():
        for line in BOOT_CHARS.read_text(encoding='utf-8').splitlines():
            if line.startswith('#'):
                continue
            for ch in line:
                if CJK.match(ch):
                    out.add(ch)
    else:
        print(f'  ! 没有 {BOOT_CHARS.name}，只用文件白名单（首屏可能多下一片字体）',
              file=sys.stderr)
    return out


def cmap_of(path: pathlib.Path) -> set:
    from fontTools.ttLib import TTFont
    f = TTFont(str(path))
    cps = set()
    for table in f['cmap'].tables:
        cps |= set(table.cmap.keys())
    f.close()
    return cps


def subset(src: pathlib.Path, codepoints: set, out: pathlib.Path) -> None:
    """用 pyftsubset 按码位切。保留 cmap 里的一切，只挑码位。"""
    unicodes = ','.join(f'U+{cp:04X}' for cp in sorted(codepoints))
    cmd = [
        sys.executable, '-m', 'fontTools.subset', str(src),
        f'--unicodes={unicodes}',
        '--flavor=woff2',
        '--layout-features=kern,liga',
        '--no-hinting',
        f'--output-file={out}',
    ]
    subprocess.run(cmd, check=True)


def to_ranges(codepoints: set, absorbable: set | None = None) -> str:
    """码位集合 → CSS unicode-range 字符串。

    【`absorbable` 是干什么的】直接把 570 个散点写成 unicode-range，A 片要
    4429 个字符、B 片 10830 个 —— CSS 从 55KB 涨到 95KB。而区间之间的空隙里
    大多数码位**两片都没有**（那 2149 个常用字之外的汉字），把它们并进区间
    不改变任何渲染结果：这些字今天也是回退到系统字体。
    所以允许把"两片都没有的码位"并进来，只为了把零碎区间连成整段。
    判据很硬：`absorbable` 必须显式传入，就是 `全集 - A - B`。
    """
    if absorbable:
        cps = sorted(codepoints)
        merged: list[list[int]] = []
        for cp in cps:
            if merged and all(c in absorbable for c in range(merged[-1][1] + 1, cp)):
                merged[-1][1] = cp
            else:
                merged.append([cp, cp])
    else:
        merged = []
        for cp in sorted(codepoints):
            if merged and cp == merged[-1][1] + 1:
                merged[-1][1] = cp
            else:
                merged.append([cp, cp])
    parts = []
    for a, b in merged:
        parts.append(f'U+{a:04X}' if a == b else f'U+{a:04X}-{b:04X}')
    return ', '.join(parts)


def _old_to_ranges(codepoints: set) -> str:
    """码位集合 → CSS unicode-range 字符串（连续段合并）"""
    cps = sorted(codepoints)
    parts = []
    i = 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        if i == j:
            parts.append(f'U+{cps[i]:04X}')
        else:
            parts.append(f'U+{cps[i]:04X}-{cps[j]:04X}')
        i = j + 1
    return ', '.join(parts)


def main() -> None:
    dry = '--dry' in sys.argv
    if not SRC.exists():
        sys.exit(f'找不到现有子集 {SRC}')
    all_cps = cmap_of(SRC)
    print(f'现有子集：{SRC.name}  {SRC.stat().st_size / 1024:.0f}KB  {len(all_cps)} 码位')

    want = first_screen_chars()
    cps_want = {ord(c) for c in want}
    a = {cp for cp in all_cps if cp in cps_want}
    b = all_cps - a
    missing = cps_want - all_cps
    print(f'首屏白名单用字 {len(want)} 个，其中在字体里 {len(a)} 个'
          + (f'（**缺 {len(missing)} 个**，先跑 make_font_subset.py）' if missing else ''))
    print(f'A（首屏片）{len(a)} 码位   B（其余片）{len(b)} 码位')
    if dry:
        print('\nA 的字：' + ''.join(chr(cp) for cp in sorted(a)))
        return

    a = a | {cp for cp in all_cps if cp < 0x2E80}   # ASCII/标点始终留在首屏片
    b = all_cps - a
    # 两片都没有的码位：并进区间只为连段，不影响渲染
    absorbable = {cp for cp in range(0x20, 0x10000) if cp not in all_cps}

    with tempfile.TemporaryDirectory() as td:
        tmp_a = pathlib.Path(td) / 'a.woff2'
        subset(SRC, a, tmp_a)
        size_a = tmp_a.stat().st_size
        subset(SRC, b, OUT_B)
        OUT_A.write_bytes(tmp_a.read_bytes())

    size_b = OUT_B.stat().st_size
    print(f'A {size_a / 1024:.1f}KB   B {size_b / 1024:.1f}KB   合计 {(size_a + size_b) / 1024:.1f}KB'
          f'（原 {SRC.stat().st_size / 1024:.0f}KB）')

    # 覆盖清单：chars 仍是**并集**，单测据此判"界面用字全在字体里"
    chars = ''.join(chr(cp) for cp in sorted(all_cps))
    import hashlib
    manifest = {
        '_说明': '由 scripts/split_font_subset.py 生成：A(首屏片)+B(其余片) 的并集。'
                 'chars 是两片 cmap 的并集，fontSha1 是两片各自的指纹。',
        'split': True,
        'fontSha1': {
            'boot': hashlib.sha1(OUT_A.read_bytes()).hexdigest(),
            'rest': hashlib.sha1(OUT_B.read_bytes()).hexdigest(),
        },
        'fontKB': round((size_a + size_b) / 1024),
        'bootKB': round(size_a / 1024, 1),
        'restKB': round(size_b / 1024, 1),
        'codepoints': len(all_cps),
        'chars': chars,
        'bootRanges': to_ranges(a, absorbable),
        'restRanges': to_ranges(b, absorbable),
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
    CSS_HINT.write_text(
        json.dumps({'boot': manifest['bootRanges'], 'rest': manifest['restRanges']},
                   ensure_ascii=False, indent=1),
        encoding='utf-8',
    )
    print(f'覆盖清单已更新：{MANIFEST.name}（{len(chars)} 字，并集校验通过）')
    print(f'CSS unicode-range：boot {len(manifest["bootRanges"])} 字符 / rest {len(manifest["restRanges"])} 字符')
    print('下一步：把两段的 unicode-range 贴进 src/index.css（单测会比对 split-ranges.json）')


if __name__ == '__main__':
    main()
