#!/usr/bin/env python
"""
场景图归一化：内容感知裁切 + 缩放到 1200×420（2.857:1）

为什么需要这个脚本
------------------
事件插图容器是 400×140（2.857:1），而图是 1200×675（1.778:1）。
CSS object-cover 会把图上下各裁掉 18.9%，只剩竖向 19%~81% 可见。
前两批 prompt 要求的"底部 1/4 压暗"因此只剩 41px 可见——无效要求。

本脚本把任意尺寸的来图裁成**正好** 2.857:1，浏览器零裁切，玩家看到 100%。

裁切不是简单居中：
  1) 按"细节能量"（行内亮度方差）给每一行打分，画面信息越多的行得分越高；
  2) 在候选竖向窗口里选总信息量最大的；
  3) 额外惩罚"在强水平边缘处下刀"——避免把桅杆、人物、鲸背从中间切断。

用法
----
  python scripts/fit_scene.py <输入文件夹> [--out public/assets/scenes]
  python scripts/fit_scene.py <输入文件夹> --dry-run      # 只报告不写文件
  python scripts/fit_scene.py <输入文件夹> --map d15=xxx.png,d16=yyy.png

命名：默认按文件名排序，依次对应 TARGETS 列表；也可用 --map 显式指定。
"""
import argparse
import hashlib
import os
import sys

from PIL import Image

# 目标输出（第三批 11 个 sceneKey）
TARGETS = [
    'd15', 'd16', 'd17', 'd18', 'd19', 'd20', 'd21', 'd22', 'd23', 'd24', 'd25',
]

OUT_W, OUT_H = 1200, 420
TARGET_AR = OUT_W / OUT_H

# 图带 alpha 时压到这个底色（与游戏底部遮罩 rgba(10,18,25) 的暗调一致）
MATTE = (36, 26, 18)

PNG_EXT = {'.png', '.jpg', '.jpeg', '.webp'}


def row_detail(img):
    """每一行的细节量：行内亮度方差 + 与上一行的平均亮度跳变。

    行内方差高 = 该行有纹理/笔触/物体；亮度跳变大 = 该行是物体的上下边界。
    两者都要，因为"大块平坦天空"方差低但仍然是要被裁掉的区域。
    网格保持原图宽高比（GW × GH，GH 由 H/W 推出），保证网格格子在源像素里是方的，
    否则网格空间的宽高比会失真，裁切窗口高度会算错（曾误算成 236px，正确应为 420px）。
    """
    W, H = img.size
    GW = 160
    GH = max(8, int(round(GW * H / W)))
    small = img.convert('L').resize((GW, GH), Image.BILINEAR)
    px = small.load()

    var = []
    jump = []
    prev_mean = None
    for y in range(GH):
        vals = [px[x, y] for x in range(GW)]
        m = sum(vals) / GW
        v = sum((t - m) ** 2 for t in vals) / GW
        var.append(v)
        jump.append(0.0 if prev_mean is None else abs(m - prev_mean))
        prev_mean = m

    mx = max(var) or 1.0
    mj = max(jump) or 1.0
    # 细节分：方差为主，跳变为辅（跳变高说明这里有明确的物体边界，重要）
    score = [var[i] / mx + 0.35 * jump[i] / mj for i in range(GH)]
    return score, var, jump, GW, GH


def best_window(img):
    """返回 (left, top, right, bottom) 源像素裁切窗口，保证比例正好 2.857:1。"""
    W, H = img.size
    src_ar = W / H

    # 源图比目标更宽 → 裁宽度（高度全留）
    if src_ar >= TARGET_AR:
        new_w = int(round(H * TARGET_AR))
        new_w = min(W, new_w)
        left = (W - new_w) // 2
        return (left, 0, left + new_w, H)

    # 源图比目标更窄 → 裁高度，保留全部宽度
    # 窗口像素高度 = W / TARGET_AR（保宽裁高）
    win_px_h = W / TARGET_AR
    if win_px_h >= H:
        return (0, 0, W, H)

    score, var, jump, GW, GH = row_detail(img)
    win_grid_h = int(round(win_px_h / H * GH))  # 目标窗口在网格里的行数
    win_grid_h = max(1, min(win_grid_h, GH))

    # 前缀和
    pre = [0.0]
    for s in score:
        pre.append(pre[-1] + s)

    max_jump = max(jump) or 1.0
    best_top, best_val = 0, -1e18
    for top in range(0, GH - win_grid_h + 1):
        bottom = top + win_grid_h
        val = pre[bottom] - pre[top]
        # 惩罚在强跳变处下刀：切穿物体轮廓
        edge_pen = 0.0
        if top > 0:
            edge_pen += jump[top - 1] / max_jump
        if bottom < GH:
            edge_pen += jump[bottom - 1] / max_jump
        val -= edge_pen * win_grid_h * 0.55

        # 轻微偏好居中（不超过信息量差异的 8%，避免为一点点像素偏离中心太远）
        center_bonus = 0.08 * win_grid_h * (1 - abs((top + win_grid_h / 2) - GH / 2) / (GH / 2))

        total = val + center_bonus
        if total > best_val:
            best_val, best_top = total, top

    # 网格 → 原图像素
    top = int(round(best_top / GH * H))
    bottom = int(round((best_top + win_grid_h) / GH * H))
    bottom = min(H, max(bottom, top + 1))
    # 按目标比例回算高度，避免网格取整带来的比例偏差
    want_h = int(round(W / TARGET_AR))
    bottom = min(H, top + want_h)
    return (0, top, W, bottom)


def fit_one(src_path, dst_path, dry=False):
    img = Image.open(src_path)
    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
        img = img.convert('RGBA')
        bg = Image.new('RGBA', img.size, MATTE + (255,))
        img = Image.alpha_composite(bg, img)
    img = img.convert('RGB')

    orig = img.size
    box = best_window(img)
    cropped = img.crop(box)

    out = cropped.resize((OUT_W, OUT_H), Image.LANCZOS)

    md5 = hashlib.md5(open(src_path, 'rb').read()).hexdigest()[:10]
    info = {
        'src': os.path.basename(src_path),
        'orig': orig,
        'crop': (box[2] - box[0], box[3] - box[1]),
        'kept_v': f"{box[1] / orig[1] * 100:.0f}%~{(box[3] / orig[1] * 100):.0f}%",
        'md5': md5,
    }
    if not dry:
        os.makedirs(os.path.dirname(dst_path) or '.', exist_ok=True)
        out.save(dst_path, 'PNG', optimize=True)
    return info


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('indir')
    ap.add_argument('--out', default='public/assets/scenes')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--map', default='', help='如 d15=a.png,d16=b.png')
    args = ap.parse_args()

    if not os.path.isdir(args.indir):
        print(f'✗ 输入目录不存在：{args.indir}')
        return 1

    files = sorted(
        f for f in os.listdir(args.indir)
        if os.path.splitext(f)[1].lower() in PNG_EXT and not f.startswith('.')
    )
    if not files:
        print(f'✗ 目录里没有图片：{args.indir}')
        return 1

    mapping = {}
    if args.map:
        for pair in args.map.split(','):
            if '=' not in pair:
                continue
            k, v = pair.split('=', 1)
            mapping[k.strip()] = v.strip()
    else:
        if len(files) != len(TARGETS):
            print(f'⚠️ 文件数 {len(files)} ≠ 目标数 {len(TARGETS)}，按顺序对号入座（d15 起）')
        for i, f in enumerate(files):
            if i < len(TARGETS):
                mapping[TARGETS[i]] = f

    print(f'输入：{args.indir}（{len(files)} 张）')
    print(f'输出：{args.out}（{OUT_W}×{OUT_H}，比例 {TARGET_AR:.3f}）')
    print('─' * 96)
    print(f"{'目标':<6}{'源文件':<26}{'原尺寸':<12}{'裁切后':<12}{'保留竖向':<12}{'md5':<12}")
    print('─' * 96)

    unknown = set(mapping.values()) - set(files)
    if unknown:
        print(f'✗ --map 指定了不存在的文件：{sorted(unknown)}')
        return 1

    for target in TARGETS:
        if target not in mapping:
            continue
        src = os.path.join(args.indir, mapping[target])
        dst = os.path.join(args.out, f'{target}.png')
        info = fit_one(src, dst, args.dry_run)
        print(f"{target:<6}{info['src'][:24]:<26}{str(info['orig']):<12}"
              f"{str(info['crop']):<12}{info['kept_v']:<12}{info['md5']:<12}")

    print('─' * 96)
    print('（dry-run，未写文件）' if args.dry_run else '完成。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
