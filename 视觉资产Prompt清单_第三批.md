# 《大航海时代》视觉资产生成 Prompt 清单 · 第三批

> 背景：第二批交付后，全项目 25 个 `sceneKey` 中仍剩 **11 个走手绘 SVG 兜底**（色块剪影），
> 与其它 14 张真图（笔触/光影/氛围）风格割裂。本批补齐这 11 张。
>
> | sceneKey | 事件 | 标题 | 目标文件 |
> |---|---|---|---|
> | `fairwind` | 101 | 顺风而行 | `d15.png` |
> | `dolphin` | 102 | 海豚护航 | `d16.png` |
> | `school` | 103 | 丰饶渔获 | `d17.png` |
> | `market` | 104 | 海上商队 | `d18.png` |
> | `whale` | 105 | 鲸群邂逅 | `d19.png` |
> | `meteor` | 107 | 流星雨之夜 | `d20.png` |
> | `disease` | 3 | 坏血病的阴影 | `d21.png` |
> | `reef` | 6 | 暗礁危机 | `d22.png` |
> | `doldrums` | 7 | 赤道无风带 | `d23.png` |
> | `cape` | 8 | 好望角的风暴 | `d24.png` |
> | `mutiny` | 211 | 叛乱的阴霾 | `d25.png` |
>
> 通用规则（风格锚点 / 负面提示 / 命名规范）沿用第一批文档第 0 节。
> **但第 0.5 节是本批新增的硬约束，与前两批不同，请务必读完。**

---

## 0.5 构图硬约束（本批新增，前两批未写清）

事件插图在界面里的容器是 **400×140（比例 2.857:1）**，而图是 1200×675（1.778:1）。
CSS `object-cover` 会把图**上下各裁掉 18.9%**，只有原图竖向 **19%~81%** 可见。

由此推出三条与以往不同的要求：

### ① 「底部 1/4 压暗」是无效要求，删掉

前两批 prompt 结尾都写了 `bottom quarter darker for text overlay`，实测：
- 底部 1/4 压暗带（y 506~675）在裁切后**只剩 41px 可见**（占可见高度的 6%）；
- 而 `EventScene` 组件**本身已经叠了底部渐变遮罩**（`rgba(10,18,25,0.72)`，覆盖下半部），
  文字可读性由代码保证，图里再压暗是压了两次。

→ 本批 prompt **不再要求底部压暗**。要压暗请交给代码。

### ② 主体必须落在竖向 19%~81% 这条带子里

写法：**「宽幅全景构图，地平线高度明确指定，主体居中且完整落在画面中央 60% 高度内，
画面最上与最下各留出可被裁掉的简单天空 / 简单海面」**

> 反例（会被切坏）：把月亮/太阳/桅杆顶/人物头部放在画面最顶端。
> 实测现有素材里 `d06`/`d07`/`d08` 的上缘裁切损失达 84%~105%，
> 就是因为画面上方还有整块内容被切掉了。

### ③ 输出尺寸改为 **1200×420**（2.857:1）

这样浏览器**零裁切**，玩家看到的 100% 就是你生成的内容。
`d01`–`d14` 仍是 1200×675，浏览器会自动裁成一样宽高比，视觉上无差别。

---

## 0.6 交付流水线（比前两批多一步）

GPT 图像模型不支持 2.857:1 直出，**用横版尺寸生成即可，裁切由脚本做**：

```
① 用下面 11 条 prompt 生成横版图（1536×1024 或 1200×675 都行）
② 全部丢进同一个文件夹
③ 跑 scripts/fit_scene.py <文件夹> --out public/assets/scenes
   → 自动内容感知裁切 + 缩放 + 存成 1200×420，按 d15~d25 命名
④ 跑 node scripts/verify_scene_images.mjs
   → 核对 25 个 sceneKey 全部命中真图、尺寸、覆盖率
```

`fit_scene.py` 的裁切不是简单居中：它按**画面细节能量**选最合适的竖向窗口，
并避开在强边缘处下刀（防止把桅杆/人物从中间切断）。

---

## 0.7 通用负面提示（工具支持时粘贴）

```
modern elements, photorealistic, 3d render, anime, cartoon, blurry,
low quality, text, watermark, signature, frame, border, oversaturated,
horizon at the very top, subject touching the top edge, subject touching the bottom edge
```

---

## 1. fairwind 顺风而行（`d15.png`）

场景意象：信风从后方稳定吹来，帆布饱满如满月——航海者梦寐以求的风向。

```
Wide panoramic seascape at mid-morning: a 16th-century Portuguese caravel
running hard before the steady trade wind, every lateen sail bellied out
into a full round curve, the windward side of the hull lifted clear of the
water, a long streaming plume of white spray trailing off the bow, the sea
not rough but running in long smooth swells, warm sunlight from ahead,
long feathered streaks of high cloud running with the wind across a
pale gold sky.
Wide cinematic establishing shot, horizon placed low in the frame,
the ship and its full sails kept whole within the central 60% of the frame
height, plain pale sky at the very top and plain open sea at the very bottom.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature, no border, no frame.
```

## 2. dolphin 海豚护航（`d16.png`）

场景意象：银白色海豚在船头两侧编队护航，不时跃出水面旋转——水手们相信这是好运的兆头。

```
Wide panoramic seascape: a sleek 16th-century caravel gliding over calm
blue water, flanked on both sides by a formation of silver dolphins
leaping clear of the sea in graceful arcs, their bodies twisting as they
turn, spray hanging in the sunlight like scattered glass, rings of disturbed
water where they re-enter, a few dolphins surfacing further astern,
restrained joyful movement, bright warm daylight.
Wide cinematic establishing shot, horizon placed low in the frame,
the ship and the leaping dolphins kept whole within the central 60% of the
frame height, plain sky at the very top and plain open sea at the very bottom.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature, no border, no frame.
```

## 3. school 丰饶渔获（`d17.png`）

场景意象：一大群金枪鱼在船附近的海面上捕食，整个海域变成了银色的漩涡——不用渔网都能捕到。

```
Wide panoramic seascape: an enormous feeding frenzy of tuna turning the
surface of the sea into a churning silver whirlpool, hundreds of dark blue
backs and bright silver flanks flashing in and out of the water in a
tight circling shoal, spray flying where the largest fish breach, gulls
stooping into the shoal from above, the flank of a waiting ship at the
edge of the frame with its crew hauling a heavy line hand over hand,
water everywhere shot through with silver light.
Wide cinematic establishing shot, horizon placed low in the frame,
the whirlpool and the ship kept whole within the central 60% of the frame
height, plain sky at the very top and plain dark sea at the very bottom.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature, no border, no frame.
```

## 4. market 海上商队（`d18.png`）

场景意象：前方出现一支悬挂葡萄牙旗的商船队，指挥官发来友好信号——他们希望与你们贸易。

```
Wide panoramic seascape: a small Portuguese merchant convoy of two heavy
naus and a lighter caravel sailing in loose formation, red-and-white
Portuguese banners and long pennants flying from their masts, one captain
at the stern of the lead ship raising a friendly signal flag toward the
viewer, laden cargo barrels and bundled cloth lashed under the deck
covers, a friendly unhurried mood, calm bright sea, morning haze
softening the distance between the ships.
Wide cinematic establishing shot, horizon placed low in the frame,
the three ships and their flags kept whole within the central 60% of the
frame height, plain sky at the very top and plain open sea at the very bottom.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature, no border, no frame.
```

## 5. whale 鲸群邂逅（`d19.png`）

场景意象：鲸群在船只周围缓缓游动，喷起数道高高的水柱，发出低沉悠扬的歌声。水手们屏息凝神，被深深震撼。

```
Wide panoramic seascape: a pod of great whales gliding slowly in a calm
sea, one immense whale arching its back and throwing up a tall column of
vapor that catches the sunlight, two more spouts rising further away,
smooth oily swells rolling around the animals, the small dark shape of
the player's own ship tiny in the foreground for scale, the whales
overwhelming in size, a hushed reverent atmosphere, warm light low on
the water.
Wide cinematic establishing shot, horizon placed low in the frame,
the whales and their spouts kept whole within the central 60% of the
frame height, plain sky at the very top and plain sea at the very bottom.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature, no border, no frame.
```

## 6. meteor 流星雨之夜（`d20.png`）

场景意象：夜空忽然被无数流星点亮，银色的轨迹密得如同天神洒落的金粉——难得一遇的天文奇观。

> ⚠️ 这一张是**天空主体**，构图要反过来：地平线必须**压到画面最底部**，
> 天空占满 80% 以上，否则流星带会被裁掉。

```
Wide panoramic night seascape: the entire sky set alight by a meteor
shower, dozens of bright silver meteors streaking across the darkness in
every direction, several leaving long glowing trails that fade from white
through gold, the streaks faintly reflected in the mirror-still black sea
below, a scatter of stars between the meteors, the dark silhouette of a
ship's stern and two small figures on deck gazing upward at the very
bottom edge of the frame, awe-struck silence.
Wide cinematic establishing shot, horizon placed very low in the frame so
that the sky fills most of the picture, the densest meteor trails kept
whole within the central 60% of the frame height, only the darkest plain
sea and the small ship silhouette at the very bottom.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature, no border, no frame.
```

## 7. disease 坏血病的阴影（`d21.png`）

场景意象：越来越多水手牙龈出血、皮肤布满淤斑——坏血病。这是所有水手最恐惧的敌人。

```
Wide panoramic interior of a cramped 16th-century ship's sick bay below
deck: low beams and dark oak planks, two canvas hammocks slung between
them, one sick sailor lying in the nearer hammock with a gaunt grey face
and dark bruised skin, another feverish man sitting up clutching his arm,
a surgeon's open chest with a red cross beside a basket of fresh lemons,
a wooden bowl and a bottle of dark medicine, a single guttering candle
throwing deep warm shadows across the deck, damp and hopeless air.
Wide cinematic interior shot, the hammocks and the sick men kept whole
within the central 60% of the frame height, plain dark planking at the
very top and plain shadowed deck at the very bottom.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature, no border, no frame.
```

## 8. reef 暗礁危机（`d22.png`）

场景意象：船底传来撕裂声——触礁了！海水涌入底舱，不堵住裂缝，船就会沉没。

```
Wide panoramic seascape in sudden danger: a 16th-century caravel heeled
hard over onto a line of jagged black rocks just under the surface, the
hull's planking split open along the waterline with seawater tearing
through the breach, white water exploding up the rocks and washing over
the lower deck, the masts leaning at a violent angle with the sails
snapping and half furled, sailors clinging to the rail and to the rigging,
green water and flying spray everywhere, immediate ruin, harsh cold light.
Wide cinematic establishing shot, horizon placed low in the frame,
the wrecked ship and the reef kept whole within the central 60% of the
frame height, plain sky at the very top and plain churning sea at the very bottom.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature, no border, no frame.
```

## 9. doldrums 赤道无风带（`d23.png`）

场景意象：风停了。完全停了。帆布无力地垂挂，海面平静得令人窒息，船舱如同蒸笼。

> 注意反向要求：这一张**不能有浪**。静得发闷才成立。

```
Wide panoramic seascape under absolute dead calm: the sea is a perfectly
flat mirror with not a single breaking wave, the sky hazy and white with
heat, a 16th-century caravel becalmed with every sail hanging limp and
drooping in slack folds, the spars motionless, the crew resting listlessly
in the shade of the lowered canvas, a column of sweat-beaded glass and
water cask beside a barrel on deck, no wind, no birds, oppressive still
air, harsh overhead sunlight.
Wide cinematic establishing shot, horizon placed low in the frame,
the becalmed ship and its drooping sails kept whole within the central 60%
of the frame height, plain hazy sky at the very top and plain glassy sea
at the very bottom.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature, no border, no frame.
```

## 10. cape 好望角的风暴（`d24.png`）

场景意象：好望角附近卷起数十尺巨浪，狂风如万兽咆哮——葡萄牙水手称它为"风暴角"。

```
Wide panoramic seascape in a hurricane: towering grey-green walls of
water rearing far above a small 16th-century caravel that is climbing one
of them bow-first, sails torn and thrashing, spray blown back off the
crest in long streaks, a black rocky cape with a squat stone lighthouse
in the distance taking a white cap of water, the whole sea violently
stirred into boiling foam, driving rain and low scudding cloud,
immense and threatening scale.
Wide cinematic establishing shot, horizon placed low in the frame,
the ship on the wave and the distant cape kept whole within the central 60%
of the frame height, plain storm sky at the very top and plain foam sea at
the very bottom.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature, no border, no frame.
```

## 11. mutiny 叛乱的阴霾（`d25.png`）

场景意象：深夜甲板传来压低嗓门的争吵。水手分成两拨举刀握桨，只争一件事：还要不要跟你走。

```
Wide panoramic night scene on the open deck of a 16th-century ship: a
single hanging lantern casting long hard shadows across the planking,
two bands of sailors facing each other in the dark, one band gripping
drawn cutlasses and ship's oars, the other band holding their own blades
low and uncertain, a torn flag hanging slack on a cut mast, the captain
standing alone on an upturned barrel between the two groups with one arm
raised, faces half-lit and half in darkness, the sea black and silent
beyond the rail, mutiny barely held in check.
Wide cinematic shot, the two groups and the captain kept whole within the
central 60% of the frame height, plain dark sky at the very top and plain
shadowed deck planking at the very bottom.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature, no border, no frame.
```

---

## 生成后自检（每批必查）

1. **比例**：交付后由 `fit_scene.py` 统一成 1200×420，比例不用你操心；
   但生成时**别用竖版或正方形**。
2. **主体完整**：打开原图看——主体（船/鲸/人物）是否完整落在画面中央 60% 高度内？
   头/桅杆顶/月亮有没有被放在最顶边？
3. **地平线位置**：按每条 prompt 的指定（多数压低，`meteor` 必须压到最底）。
4. **色板一致**：褐棕 `#5C2E0A`、金 `#D4A838`、羊皮 `#D4B884`、深海蓝 `#1A3A52`。
5. **无水印无字**：GPT 偶尔自己加文字，检出即重生成。
6. **风格一致**：11 张要像同一位画师画的——**建议 11 条一次性生成完**，
   别分批（分批容易出现风格漂移）。

---

## 接入方式（我这边做，你不用管）

- `src/data/sceneImages.ts` 的 `SCENE_IMAGES` 表**已提前加好**这 11 个键 →
  `d15.png`~`d25.png` 的映射。图还没到时会自动 404 并回退手绘 SVG，
  **不会白屏**，所以可以先合代码后补图。
- 素材到位后跑 `node scripts/verify_scene_images.mjs` 核对，
  再跑 `node test/e2e/scene-survey.mjs` 确认 25 个键全部走真图
  （该脚本已升级为**看真实 DOM** 是 `<img>` 还是 `<svg>`，不再只看映射表）。

### 顺带修掉的一个真 bug（第三批映射会让它显形）

`EventScene` 原本用单个布尔值 `imgFailed` 记录加载失败，且组件没有 `key`，
React 会复用同一个实例。后果是：**只要遇到一次缺图，`imgFailed` 永久为 true，
之后所有事件插图都被迫退化成手绘 SVG**——连本来正常的暴风雨、海盗、海怪真图也一起消失。

这个 bug 此前一直隐形（那时所有图都存在，失败分支从不触发），
是第三批映射会让它第一次显形。已改为按 `sceneKey` 记录失败，
并给 `<img>` 加 `key` 让场景切换时重建节点。
回归测试：`test/e2e/scene-img-failed-reset.mjs`（3/3 通过）。

## 交付方式

下载到 `C:\Users\Brunson\Downloads`，文件夹整包或散图都行，**文件名不限**
（GPT 爱起什么起什么，`fit_scene.py` 按内容匹配不了就按生成顺序 d15~d25 对号入座，
md5 对账防错）。交付后告诉我文件夹路径，我来跑裁切脚本、接入、跑测试。

---

## 附录：脚本速查

| 脚本 | 作用 |
|---|---|
| `scripts/fit_scene.py <文件夹> --out public/assets/scenes` | 内容感知裁切 + 缩放到 1200×420，按 d15~d25 命名 |
| `scripts/verify_scene_images.mjs` | 核对 25 个 sceneKey 的文件、尺寸、可见带内细节占比 |
| `scripts/check_scene_key_coverage.mjs` | 核对 events.ts 与 SCENE_IMAGES 的 key 覆盖 |
| `scripts/analyze_scene_crop.mjs` | 分析各图的裁切损失与主体位置 |
| `scripts/make_crop_contact_sheet.mjs` | 生成"玩家实际看到的裁切结果"对比表 |
| `test/e2e/scene-survey.mjs` | 逐一渲染 25 个场景，判定真实走真图还是手绘 |
| `test/e2e/scene-img-failed-reset.mjs` | 回归：缺图失败状态不跨场景残留 |
| `test/e2e/scene-missing-prod.mjs` | 生产静态服务器下的 404 行为验证 |
