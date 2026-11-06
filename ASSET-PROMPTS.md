# 航海图 · 生图素材完整清单（交给 GPT 生成）

版本：2026-11-07 · 替代 `.workbuddy/asset-prompts.txt`（旧版第 7 节的尺寸与构图数字是估的，这版是实测重算）

用法：**每条 Prompt 都是一个独立的生图请求，块里已经含风格锚与反面约束，整块复制即可**。不要一次要求模型出 20 张，按优先级一条一条来。

---

## 0. 先说 5 条，决定你会不会白做

**① 尺寸：要模型能给的最大横版，别要 2560×1440。**
主流模型的上限是 1792×1024（DALL·E 3）或 1536×1024（gpt-image-1）。写 2560×1440 它只会插值放大，像素是假的、文件还更大。所以每条都写「最大横版」，出来是 1792×1024 或 1536×1024 都行。

**② 这批的缺口不是分辨率，是「谁在承担全屏」。**
现有 13 张港口图在港口面板里只显示 **≈296×96**，原生 800×220 绰绰有余。问题是其中 17 个港口的**整屏岸上背景**也在用这同一张缩略图，被拉开到 1483px 宽（CSS 放大 1.85 倍，DPR2 屏物理放大 3.7 倍），所以看着像一团涂抹。
→ 结论：第一批要做的是 **4 张原生全景**，不是重画缩略图。

**③ 三条硬禁止（每块 Prompt 里都带了）：**
任何文字 / 字母 / 数字 / 招牌 / 落款 / 印章；现代建筑与现代船只；纯白天空、纯黑阴影。

**④ 一次只出一张，先验构图。** 出完第 1 张发我看，通过再批量。构图错等于额度白花。

**⑤ 文件名必须逐字一致**（下面每项都标了）。我按同名替换接入，改文件名就得改代码。

---

## 1. P0 · 岸上全景 ×4（零代码改动，放进去就生效）

拿到这 4 张，**20 个港口全部都有原生全屏背景**，一张缩略图都不用再放大。

| 文件名 | 覆盖港口 | 现在的样子 |
|---|---|---|
| `harbor_caribbean.png` | 7 港：哈瓦那 / 皇家港 / 拿骚 / 托尔图加 / 圣胡安 / 卡塔赫纳 / 韦拉克鲁斯 | 96px 缩略图放大 1.85 倍 |
| `harbor_africa.png` | 4 港：埃尔米纳 / 开普敦 / 蒙巴萨 / 桑给巴尔 | 同上 |
| `harbor_asia.png` | 4 港：果阿 / 马六甲 / 澳门 / 巴达维亚 | 同上 |
| `harbor_northern_europe.png` | 2 港：伦敦 / 阿姆斯特丹 | 同上 |

`harbor_europe.webp`（塞维利亚 / 里斯本 / 加的斯）已有 1672×941，**不用重出**。

### 1.1 构图要求（这一节是 2026-11-07 实测的，别按直觉改）

1440×900 真实浏览器实测，岸上视角压在背景上的东西只有三块：

```
见闻板        x144–766  / y122–361
服务板        x790–1296 / y122–425      ← 两块合起来盖住 y122–425 的整个中段
前景码头剪影   x0–1440   / y574–738      ← 全宽，压住下半部
状态栏         y860–900
```

于是**真正完整露出来的只有三条横带**：

| 横带 | 1440×900 | 1024×768 | 手机上（390×844） |
|---|---|---|---|
| 顶部（天空） | y0–121（14%） | y0–121（16%） | y0–97（12%） |
| 中段（面板与码头之间） | **y425–573（149px）** | **y425–465（只有 41px）** | 无（被面板铺满） |
| 底部（近处水面） | y738–899（162px） | y630–767（138px） | y648–843（196px） |

外加**左右各 144px 的竖条全高可见**（x0–144 / x1296–1440），那里不会被面板盖住。

所以构图硬要求：

1. **天际线最高点落在画面纵向 47%~62%**，也就是那 149px 的横带里。别放在上半部——上半部左中右都被面板吃掉了。
2. **主体建筑（钟楼 / 城堡 / 教堂）横向放到左侧 8%~12% 或右侧 88%~92%**。那个位置是侧边竖条，全高可见；正中放再漂亮的建筑，玩家也只看得到一条缝。
3. **地面线（码头边缘）压到 64% 左右**，因为 64%~82% 会被前景码头剪影盖住。
4. **最底部 82%~100% 会露出**，那里放水面反光、石阶、系缆桩，别放主体。
5. **天空 0~13% 会露一条**，要有云 / 远山 / 暖光，不能是纯色。
6. 手机上只能看到顶部 12% 和底部 23%，中间全被面板盖住——**这张图在手机上只当氛围底色**，不承载信息，别为竖屏单独设计。

### 1.2 第 1 张（先做这张，验过再批量）

```
A wide 16:9 panoramic establishing view of an Iberian Caribbean colonial harbor
(Caribbean: low whitewashed fort walls, palm trees, tiled roofs, a single church
bell tower), seen from a ship's deck just outside the harbor, slightly elevated.

COMPOSITION (follow exactly):
- The horizon / roof line sits at 55% of the image height. The tallest structure
  (bell tower or fort bastion) peaks at 48% and is placed at 10% from the LEFT edge.
- Ground / quay edge line at 64% of image height.
- Below 82%: calm water with soft horizontal reflections and a few mooring posts.
- Above 13%: warm hazy late-afternoon sky with thin clouds and a distant headland
  silhouette at the far right (88%-100% width).
- The central 45%-65% of the frame must stay relatively calm and open (text panels
  will be placed over it).
- Stretch the town horizontally across the full width; no single dominant focal
  point in the middle.

Style: 17th-century port town panorama, painterly historical illustration, muted
oil-painted texture with visible but soft brushwork, warm late-afternoon light,
desaturated ochre / terracotta / slate blue / deep umber palette (#8a6a3f, #a8632f,
#4a5a66, #2b1e0e). Atmospheric perspective: distant hills hazier than the foreground.
NO photorealism, NO 3D render look, NO modern buildings, NO neon or glow.

ABSOLUTELY NO text, letters, numbers, signs, banners with writing, signatures or
watermarks. No people larger than 1/20 of frame height (no faces to render). No pure
white sky, no pure black shadows — the whole image will be darkened by a brown
overlay and needs mid-tone detail to survive.

Output the widest landscape your model supports (1792×1024 or 1536×1024). Do not
upscale beyond native resolution. Opaque, no alpha.
```

验过之后，其余 3 张只换第一句里的 subject 与调色，构图、光线方向（都从右侧打光）、笔触全部一字不改：

| 图 | 替换用的 subject / 调色 |
|---|---|
| `harbor_africa.png` | `a West African coastal fortress port — a whitewashed castle with cannon embrasures on a low rocky shore, dhows with lateen sails, sandy ground, sparse palms`・调色偏土黄与赭石，天空更亮更干 |
| `harbor_asia.png` | `an East Asian trading harbor — crowded junk sails, tiled pagoda roofs, a stone quay with bales and crates, distant green hills`・调色加入青绿与赭红 |
| `harbor_northern_europe.png` | `a Northern European river harbor — tall narrow gabled brick houses, a stone bridge, dense forest of masts, cold pale sky with low clouds`・调色偏冷灰与砖红，光线更平、更冷 |

---

## 2. P1 · 港口专属缩略图 ×10（补齐覆盖）

现在 20 个港口只有 13 张画：加勒比 7 港共用一张、非洲 4 港共用一张。补这 10 张之后**每个港口都有一张专属图**，港口面板第一眼就能认出「又回到这里了，不是上次那个」。

显示位置：港口面板顶部一条 **≈296×96**（`h-24` + `object-cover` 居中裁切，源图上下各裁掉约 22%）。**分辨率不敏感**，1024×576 就够，别超过 1536×1024。

| # | 港口 | 文件（放 `public/assets/ports/`） | 画面要点 |
|---|---|---|---|
| 4 | 托尔图加 | `port_tortuga.png` | 小岛、木栈桥、酒桶与临时棚屋、棕榈，海盗据点 |
| 5 | 圣胡安 | `port_san_juan.png` | 海岸要塞城墙与炮台（莫罗式）、灯塔、海湾 |
| 7 | 里斯本 | `port_lisbon.png` | 特茹河口、贝伦塔式石塔、山坡城市、密集帆船 |
| 8 | 伦敦 | `port_london.png` | 泰晤士河、石砌塔楼、木构山墙楼房、桅杆森林 |
| 9 | 埃尔米纳 | `port_elmina.png` | 白墙方堡紧贴沙滩、炮口、独木舟与棕榈 |
| 12 | 马六甲 | `port_malacca.png` | 海峡、红顶教堂、中国式店屋排屋、香料船 |
| 15 | 阿姆斯特丹 | `port_amsterdam.png` | 运河、窄高山墙砖屋、吊桥、仓库群 |
| 16 | 蒙巴萨 | `port_mombasa.png` | 珊瑚石橙褐要塞（耶稣堡式）、阿拉伯帆船 |
| 17 | 桑给巴尔 | `port_zanzibar.png` | 白沙滩、石砌宫殿与拱廊、香料船 |
| 19 | 巴达维亚 | `port_batavia.png` | 荷兰式城堡与运河、椰林、热带湿气 |

Prompt 模板（每张只替换 `[SUBJECT]`，其余不动）：

```
A wide landscape view of [SUBJECT], seen from the water, painterly historical
illustration in the style of 17th-century marine painting.

COMPOSITION: the town occupies the MIDDLE 55% of the image height (the top 22% and
bottom 22% will be cropped away by the UI). Keep the skyline and its most
recognizable landmark inside that middle band. The landmark sits off-center, at
about 30% or 70% from the left edge. Water in the lower part of the middle band.

Style: muted oil-painted texture, soft brushwork, warm afternoon light,
desaturated ochre / terracotta / slate blue / deep umber palette
(#8a6a3f, #a8632f, #4a5a66, #2b1e0e), atmospheric perspective.
NO photorealism, NO 3D render look, NO modern buildings, NO neon.

ABSOLUTELY NO text, letters, numbers, signs or watermarks. No faces. No pure white
sky, no pure black shadows. Output 1536×1024 or the closest wide landscape size;
do not upscale. Opaque, no alpha.
```

---

## 3. P2 · 航海日志 / 图鉴线描 ×11（要先接线，我会写代码）

这一组**目前代码里还没有引用**（我核过：`src/` 全库搜不到 `logbook_header` / `sighting_` / `clue_note` 等任何一处）。所以它们放进去**不会自动出现**，我得先写渲染代码。优先级低于 P0/P1，但风格完全不同，别和上面那两批混在一次会话里生成。

### 3.1 统一风格锚（这一组每条都要附）

```
Style: 16th-century nautical chart copperplate engraving, flat 2D illustration,
fine sepia ink line work, aged parchment texture, muted gold accents, no 3D
rendering, no photorealism, no glow, no neon. Palette limited to deep ink
#2b1e0e, ochre #8a6a3f, antique gold #c9a96e, pale parchment #e8d9b5.
Lines must stay legible on a DARK BROWN panel (#30241a). Transparent background
(alpha PNG), no white box, no border frame.
```

### 3.2 统一反面约束

```
ABSOLUTELY NO text, letters, numbers, pseudo-writing, signatures, watermarks, or
fake seals with gibberish characters. No drop shadows, no gradients except subtle
paper grain, no background scenery behind the subject. Center the subject with 8%
safe margin on all sides. Output PNG with alpha channel.
```

### 3.3 逐项

**① 日志页眉装饰带**（最值得做）→ `logbook_header.png`
落地显示 288×54，线宽至少 2px；输出 1152×216，透明。

```
A wide horizontal decorative rule for a ship's logbook, symmetric. A small
eight-point compass rose at the exact center, flanked by two thin engraved lines
that taper into curled rope knots and a few oak leaves at both ends. Very sparse,
mostly empty space in the middle so it reads as a divider, not a picture.
Engraved line work only, 2-3 px stroke at display size.
```

**② 见闻页港口速写 ×4** → `sighting_europe.png` / `sighting_caribbean.png` / `sighting_africa.png` / `sighting_asia.png`
显示 96×96，只画大剪影；输出 512×512。四张必须同一次会话、同笔触、同地平线高度。

```
A small square vignette of [SUBJECT], drawn as a single bold silhouette with a few
interior engraved lines, sea horizon at one third height, one tiny sailing ship in
the foreground for scale, generous empty sky. No buildings smaller than 1/8 of the
frame, no crowds, no tiny detail.

[欧洲]   a walled Iberian river port with a single bell tower and stone quay
[加勒比] a Caribbean colonial harbor with palm trees and a low fort
[非洲]   a West African coastal fortress on a low sandy shore
[东方]   an East Asian harbor crowded with junk sails and a pagoda roof
```

**③ 图鉴未点亮格底纹** → `atlas_empty_slot.png`
显示约 140×44，会被横向拉伸 → 必须九宫格可拉伸；输出 512×160。

```
A very faint empty-slot texture for a collector's atlas: aged parchment with a
barely visible square chart grid, four tiny brass corner studs, and a subtle darker
vignette toward the edges. The CENTER MUST BE COMPLETELY EMPTY (a question mark
will be added in CSS). Extremely low contrast, quiet enough to sit behind text.
Symmetric so it can be nine-slice stretched.
```

**④ 称号蜡封 ×3** → `seal_all_ports.png` / `seal_all_tasks.png` / `seal_rich.png`
显示 48×48；输出 256×256。

```
A single round wax seal in antique gold, slightly irregular hand-pressed edge, with
ONE simple engraved symbol centered: [SYMBOL]. No ring of text, no letters, no
ribbon, no border inscriptions. Flat color with a thin darker inner rim for depth.

[all_ports] a compass rose
[all_tasks] a rolled scroll
[rich]      a coin pouch
```

**⑤ 线索小图标** → `clue_note.png`
显示 20×20，必须 20px 下能认出是「一张纸条」；输出 128×128。

```
A minimal icon of a rolled-up paper note tied with a short piece of string, viewed
slightly from above, drawn with 3-4 confident engraved strokes plus one small wax
dot. Single subject, no background objects, no text on the paper. Must remain
recognizable at 20 × 20 pixels.
```

**⑥ 空册子插画**（最后做）→ `logbook_empty.png`
显示 200×150；输出 800×600。

```
A closed blank leather logbook lying on a ship's chart table, one corner curling up,
a single seabird perched on its edge, and the edge of a brass compass peeking in
from one side. Quiet, slightly melancholy, generous empty space around the objects.
Engraved line work, no text on the cover.
```

---

## 4. 建议跳过的（省额度）

- **前景码头剪影**（旧清单第 8 项）：现在用内联 SVG 画的，落地只占 y574–738、164px 高。花一次生成换一块剪影不划算，而且它一换就要重新校准暗部层次。**不做。**
- **重画已有 13 张缩略图**：面板里只显示 296×96，现有 800×220 已经够。除非你想要"每个港口都不一样"，那走 P1 补齐，不是重画。
- **`harbor_europe` 重出**：现有 1672×941 在 1440 屏是 0.86 倍、不放大，只有 2K/4K 屏会放大。**不做。**

## 5. 明确不需要的（都已齐，别浪费）

| 类目 | 现状 |
|---|---|
| 舰船精灵 | 10 张，覆盖 4 种可购船型（卡拉维尔 / 单桅快船 / 护卫舰 / 盖伦）以及战舰、皇家、海盗、幽灵等变体，无空缺 |
| 事件场景 | 25 张（d01–d25），全部被 `sceneImages.ts` 引用，无空缺 |
| 船员 / 军官立绘 | **24 张**（15 位船员 + 6 张军官含领航员 4 种表情 + 3 位敌对船长），已就位 |
| UI 装饰 F1–F6 | 羊皮纸、金框、九宫格、罗盘、横幅、三角旗、奖章，已就位 |
| 海面纹理 / 天气特效 | `sea-tile`（含风暴版）、云、雨、雾、浪花等 9 件 |

## 6. 交付与验收（我会做的）

1. **命名逐字一致**，P0 放 `public/assets/ports/`，P1 同名放同目录。我转 WebP（q0.72，实测伊比利亚那张 391KB）并加映射。
2. **先只给我第 1 张 P0**，我用真实浏览器把岸上视角跑起来，量三件事：全屏铺满时放大倍率、中段 149px 横带里有没有东西、深褐面板压上去之后背景亮度还够不够（当前 0.88 亮度 + 三层渐变）。
3. 通过再批量。**不通过我不会硬接**——上一批 B 组岩壁纹理就是这样被否掉的。
4. 全部接完跑 `npm run test:e2e:harbor`（现有 60 条断言：背景不 404、object-cover 不露缝、面板不压主体、手机上不出横向滚动）。

---

## 附：优先级一句话总结

**先做 1 张 `harbor_caribbean`。** 它决定「上岸」这个空间像不像一个地方——现在玩家看到的是 96px 缩略图放大 1.85 倍的涂抹。这一张过了，其余 3 张再一起出；P1 的 10 张缩略图是"每个港口不重样"的加分项；P2 的线描得我先写代码才看得见。
