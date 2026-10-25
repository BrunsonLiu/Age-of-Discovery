# -*- coding: utf-8 -*-
"""
视觉素材接收台账：用户在 ChatGPT 按《视觉资产Prompt清单.md》的顺序生成图片，
下载到 Downloads（散图文件名无语义，按生成时间对号入座；文件夹整包交付则看 README/文件名）。

  python scripts/intake_assets.py scan                 # 看新到了哪些图、下一个该认领谁
  python scripts/intake_assets.py order                # 全清单进度总览
  python scripts/intake_assets.py assign <文件> <ID>    # 认领：某张图 = 清单某 ID
  python scripts/intake_assets.py done <ID> --to <路径> # 标记已接入代码（可多个 --to）
  python scripts/intake_assets.py note <ID> <备注>      # 补备注（如"白底作废，用-3透明版"）

台账位置：.workbuddy/asset-intake.json（项目内，不进 git 亦可，随用随读）
"""
import json
import os
import sys
import time

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEDGER = os.path.join(PROJECT, '.workbuddy', 'asset-intake.json')
DOWNLOADS = os.path.join(os.path.expanduser('~'), 'Downloads')
IMG_EXTS = ('.png', '.jpg', '.jpeg', '.webp')

# 清单 canonical 顺序（与《视觉资产Prompt清单.md》一致；file = 0.3 节命名规范）
PROMPTS = [
    ('A1', 'ship', '卡拉维尔帆船', 'ship_caravel'),
    ('A2', 'ship', '盖伦帆船', 'ship_galleon'),
    ('A3', 'ship', '单桅快船', 'ship_sloop'),
    ('A4', 'ship', '护航舰', 'ship_frigate'),
    ('A5', 'ship', '幽灵船变体', 'ship_ghost'),
    ('A6', 'ship', '海盗黑旗船变体', 'ship_pirate'),
    ('B1', 'texture', '海面波浪无缝 tile', 'tex_ocean_waves'),
    ('B2', 'texture', '深海远眺', 'tex_deep_sea'),
    ('B3', 'texture', '云层 tile', 'tex_clouds'),
    ('C1', 'port', '加勒比港口', 'port_caribbean'),
    ('C2', 'port', '西非港口', 'port_west_africa'),
    ('C3', 'port', '东南亚港口', 'port_southeast_asia'),
    ('C4', 'port', '北欧港口', 'port_north_europe'),
    ('C5', 'port', '伊比利亚母港（塞维利亚）', 'port_iberia'),
    ('D1', 'event', '风暴之夜', 'event_storm'),
    ('D2', 'event', '海盗接舷战', 'event_pirate'),
    ('D3', 'event', '海怪', 'event_kraken'),
    ('D4', 'event', '幽灵船', 'event_ghost'),
    ('D5', 'event', '火山海岸', 'event_volcano'),
    ('D6', 'event', '浓雾', 'event_fog'),
    ('D7', 'event', '港口庆典', 'event_festival'),
    ('D8', 'event', '沙滩藏宝', 'event_treasure'),
    ('D9', 'event', '塞壬礁石', 'event_siren'),
    ('D10', 'event', '走私夜港', 'event_smuggle'),
    ('E1', 'crew', '水手长 老汤姆', 'crew_boatswain'),
    ('E2', 'crew', '炮手 独眼玛格', 'crew_gunner'),
    ('E3', 'crew', '账房先生', 'crew_purser'),
    ('E4', 'crew', '随船神甫', 'crew_chaplain'),
    ('E5', 'crew', '学者 伊莲', 'crew_scholar'),
    ('E6', 'crew', '厨子 大班', 'crew_cook'),
    ('E7', 'crew', '见习航海士 小少爷', 'crew_midshipman'),
    ('E8', 'crew', '黑旗向导', 'crew_pirate_guide'),
    ('E9', 'officer', '老领航员', 'officer_pilot'),
    ('E10', 'officer', '大副', 'officer_mate'),
    ('E11', 'officer', '船医', 'officer_surgeon'),
    ('E12', 'rival', '"黑帆"杰克', 'rival_jack'),
    ('E13', 'rival', '"白银"玛丽亚', 'rival_maria'),
    ('E14', 'rival', '"星眸"迭戈', 'rival_diego'),
    ('F1', 'ui', '羊皮纸卡片底', 'ui_parchment'),
    ('F2', 'ui', '金质华丽边框', 'ui_frame_gold'),
    ('F3', 'ui', '罗盘玫瑰特写', 'ui_compass_rose'),
    ('F4', 'ui', '横幅缎带', 'ui_banner'),
    ('F5', 'ui', '三角旗串', 'ui_pennants'),
    ('F6', 'ui', '成就奖章', 'ui_medal'),
    ('G1', 'fx', '雨丝层', 'fx_rain'),
    ('G2', 'fx', '雾图层', 'fx_fog'),
    ('G3', 'fx', '浪花飞沫', 'fx_spray'),
    ('H1', 'bg', '主标题背景', 'bg_title'),
    ('H2', 'bg', '胜利结局背景', 'bg_victory'),
    ('H3', 'bg', '失败结局背景', 'bg_defeat'),
]
PROMPT_MAP = {p[0]: {'kind': p[1], 'label': p[2], 'file': p[3]} for p in PROMPTS}
ORDER = [p[0] for p in PROMPTS]


def load_ledger():
    if os.path.exists(LEDGER):
        with open(LEDGER, encoding='utf-8') as f:
            return json.load(f)
    return {'version': 1, 'lastScanAt': 0, 'entries': {}}


def save_ledger(data):
    os.makedirs(os.path.dirname(LEDGER), exist_ok=True)
    with open(LEDGER, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def fmt_time(ts):
    return time.strftime('%m-%d %H:%M:%S', time.localtime(ts)) if ts else '—'


def status_of(entry):
    if not entry:
        return '待生成'
    if entry.get('status') == 'integrated':
        return '已接入'
    return '已认领'


def list_download_images():
    """Downloads 根目录 + 一层子文件夹里的图片（按文件夹整包交付也越来越常见）。
    preview 封面图不是素材，跳过。返回 (mtime, 相对路径, 大小)。"""
    files = []
    for root, dirs, names in os.walk(DOWNLOADS):
        rel = os.path.relpath(root, DOWNLOADS)
        depth = 0 if rel == '.' else rel.count(os.sep) + 1
        if depth >= 3:
            dirs[:] = []  # 最多下探三层（兼容 文件夹/public/assets/xxx.png 整包结构）
        for name in names:
            if not name.lower().endswith(IMG_EXTS):
                continue
            if 'preview' in name.lower():
                continue
            path = os.path.join(root, name)
            try:
                mt = os.path.getmtime(path)
            except OSError:
                continue
            files.append((mt, os.path.relpath(path, DOWNLOADS), os.path.getsize(path)))
    return files


def cmd_scan(ledger):
    """列出 lastScanAt 之后新出现在 Downloads 的图片，按生成时间排序。"""
    since = ledger.get('lastScanAt', 0)
    files = [f for f in list_download_images() if f[0] > since]
    files.sort()

    pending = [pid for pid in ORDER if ledger['entries'].get(pid, {}).get('status') != 'integrated']
    print(f'== 新到图片（{fmt_time(since)} 之后，共 {len(files)} 张）==')
    if not files:
        print('  （无新图）')
    for i, (mt, name, size) in enumerate(files):
        expect = pending[i] if i < len(pending) else '（超出清单范围，需人工判断）'
        label = PROMPT_MAP.get(expect, {}).get('label', '')
        print(f'  {fmt_time(mt)}  {size // 1024:>5}KB  {name}')
        print(f'      → 按顺序应为 {expect} {label}')
    if len(files) > len(pending):
        print(f'  ⚠ 新图数量({len(files)})超过待生成项({len(pending)})，请人工核对')
    print()
    print('用法：确认无误后执行 assign <文件名> <ID>；接入代码后执行 done <ID> --to <路径>')
    # 扫描即更新水位，避免重复提示
    ledger['lastScanAt'] = max([f[0] for f in files] + [since, int(time.time())])
    save_ledger(ledger)


def cmd_order(ledger):
    print('== 清单进度 ==')
    cur_kind = None
    for pid in ORDER:
        info = PROMPT_MAP[pid]
        if info['kind'] != cur_kind:
            cur_kind = info['kind']
            print(f'  -- {cur_kind} --')
        entry = ledger['entries'].get(pid, {})
        st = status_of(entry)
        extra = ''
        if entry.get('source'):
            extra += f"  src={entry['source']}"
        if entry.get('targets'):
            extra += f"  -> {', '.join(entry['targets'])}"
        if entry.get('note'):
            extra += f"  # {entry['note']}"
        print(f'  [{st:^4}] {pid:<4} {info["label"]:<22} {info["file"]}{extra}')
    n_int = sum(1 for pid in ORDER if ledger['entries'].get(pid, {}).get('status') == 'integrated')
    print(f'\n进度：{n_int}/{len(ORDER)} 已接入')


def find_download(name):
    """允许只传文件名片段（唯一匹配即可，含一层子文件夹）。"""
    if os.path.exists(name):
        return name
    cands = [rel for _, rel, _ in list_download_images() if name in rel]
    if len(cands) == 1:
        return cands[0]
    if not cands:
        print(f'Downloads 中找不到匹配「{name}」的图片')
    else:
        print(f'「{name}」匹配到多张图，请写全名: {cands}')
    return None


def cmd_assign(ledger, file_query, pid):
    if pid not in PROMPT_MAP:
        print(f'未知 ID「{pid}」，应为 A1..H3 之一')
        return
    fname = find_download(file_query)
    if not fname:
        return
    entry = ledger['entries'].setdefault(pid, {})
    entry['source'] = fname
    entry['status'] = 'received'
    entry['attempts'] = entry.get('attempts', 0) + 1
    entry['receivedAt'] = time.strftime('%Y-%m-%dT%H:%M:%S')
    save_ledger(ledger)
    print(f'已认领：{fname} → {pid} {PROMPT_MAP[pid]["label"]}（第 {entry["attempts"]} 次生成）')


def cmd_done(ledger, pid, targets, note=None):
    if pid not in PROMPT_MAP:
        print(f'未知 ID「{pid}」')
        return
    entry = ledger['entries'].setdefault(pid, {})
    entry['status'] = 'integrated'
    entry['targets'] = targets
    entry['integratedAt'] = time.strftime('%Y-%m-%dT%H:%M:%S')
    if note:
        entry['note'] = note
    save_ledger(ledger)
    print(f'已接入：{pid} {PROMPT_MAP[pid]["label"]} → {targets}')


def cmd_note(ledger, pid, note):
    if pid not in PROMPT_MAP:
        print(f'未知 ID「{pid}」')
        return
    entry = ledger['entries'].setdefault(pid, {})
    entry['note'] = note
    save_ledger(ledger)
    print(f'已备注：{pid} — {note}')


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    ledger = load_ledger()
    cmd = args[0]
    if cmd == 'scan':
        cmd_scan(ledger)
    elif cmd == 'order':
        cmd_order(ledger)
    elif cmd == 'assign' and len(args) >= 3:
        cmd_assign(ledger, args[1], args[2].upper())
    elif cmd == 'done' and len(args) >= 2:
        targets, note = [], None
        rest = args[2:]
        i = 0
        while i < len(rest):
            if rest[i] == '--to' and i + 1 < len(rest):
                targets.append(rest[i + 1]); i += 2
            elif rest[i] == '--note' and i + 1 < len(rest):
                note = rest[i + 1]; i += 2
            else:
                i += 1
        cmd_done(ledger, args[1].upper(), targets, note)
    elif cmd == 'note' and len(args) >= 3:
        cmd_note(ledger, args[1].upper(), ' '.join(args[2:]))
    else:
        print(__doc__)


if __name__ == '__main__':
    main()
