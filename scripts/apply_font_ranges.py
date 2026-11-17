"""把 split-ranges.json 里的两段 unicode-range 贴进 src/index.css。

字体子集重建后字符集会变（少几个字、多几个字），CSS 里的 unicode-range
必须跟着换 —— 单测会拿 split-ranges.json 与 index.css 逐段比对。
两段字符串都上万字符，手贴容易漏一个逗号，所以写脚本。
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ranges = json.loads((ROOT / 'src/assets/fonts/split-ranges.json').read_text(encoding='utf-8'))
css_path = ROOT / 'src/index.css'
css = css_path.read_text(encoding='utf-8')

for key in ('boot', 'rest'):
    pattern = re.compile(
        r"(noto-serif-sc-" + key + r"\.woff2'\) format\('woff2'\);\s*\r?\n\s*unicode-range: )[^;]+;"
    )
    if not pattern.search(css):
        raise SystemExit(f'没找到 {key} 的 unicode-range 块')
    css = pattern.sub(lambda m: m.group(1) + ranges[key] + ';', css, count=1)

css_path.write_text(css, encoding='utf-8')
print('已更新 index.css：boot', len(ranges['boot']), '/ rest', len(ranges['rest']), '字符')
