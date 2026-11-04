# 《大航海时代》视觉资产生成 Prompt 清单 · 第四批

> 前三批（舰船 / 场景 / 事件插图）已基本覆盖：25 个 `sceneKey` 全部有真图，
> 舰船精灵 10 张、人物肖像 31 张。**这一批只做前几批没覆盖到的两类缺口。**
>
> 沿用第一批文档第 0 节：风格锚点、负面提示、命名规范、生成后自检。
> **但港口图的风格锚与第 0.1 节不同（见下方 0.4），灰度/棕褐铜版那套不适用。**

---

## 0. 缺口诊断（为什么是这两类）

### 0.1 港口立绘：5 张图对 20 个港口

`src/data/portImages.ts` 目前的对应关系是「区域共用」：

| 现有图 | 覆盖港口 | 数量 |
|---|---|---|
| `port_seville.png` | 塞维利亚 6 / 里斯本 7 / 加的斯 20 | 3 |
| `port_northern_europe.png` | 伦敦 8 / 阿姆斯特丹 15 | 2 |
| `port_caribbean.png` | 哈瓦那 1 / 皇家港 2 / 拿骚 3 / 托尔图加 4 / 圣胡安 5 / 卡塔赫纳 13 / 韦拉克鲁斯 14 | **7** |
| `port_west_africa.png` | 埃尔米纳 9 / 开普敦 10 / 蒙巴萨 16 / 桑给巴尔 17 | 4 |
| `port_southeast_asia.png` | 果阿 11 / 马六甲 12 / 澳门 18 / 巴达维亚 19 | 4 |

**玩家跑一趟加勒比，七个港口打开面板看到的是同一张画。** 这是目前重复感最强的一处，
也是这一批里**唯一确定能见效**的改动（不需要改任何代码逻辑，只换映射表）。

### 0.2 3D 陆地/海面近景是纯色

`painted-land.png` / `painted-sea.png` 是 1024×512 的全球图，每像素约 39km。
近景（相机距离 3~8）时它被放大几十倍，本质就是一块纯色 —— 这不是画得不好，
是分辨率物理上限。代码侧已有 `bumpMap` 颗粒（`GRAIN_TILES=22`），但那只是明暗扰动，**不改颜色**。

唯一能突破的办法是**再叠一层高频 tile**（可平铺纹理），用第二张贴图通道或第二个 mesh 实现。
这需要素材，也需要我先做一次性能/观感实验 —— **所以 B 组是「给我弹药」，不保证一定用得上**。

### 0.3 不需要的（别浪费时间）

- ❌ **世界地图 / 海岸线**：必须和 `land.geojson` 逐点对齐，AI 生成的地理一律不准，
  现有 `painted-land` 已经够用（它的问题是分辨率，不是内容）。
- ❌ **更多事件插图**：25 个 sceneKey 已 100% 覆盖。
- ❌ **UI 边框 / 羊皮纸底 / 铜木铭牌**：这些已经用 CSS 渐变 + 九宫格做完了，
  再贴图反而会破坏现有的对比度校准（每个字的位置都量过 AA）。

---

## 0.4 港口图的风格锚（与第 0.1 节不同，务必用这条）

第一批的锚点是「棕褐铜版画」，那适合舰船和图标。
但**现有 5 张港口图是彩色油画**：蓝天白云、红瓦、绿植、金色阳光，笔触明显、细节密集。
新图必须和它们并排看不出来源不同，否则一个港口是彩色、隔壁是棕褐，割裂感更强。

每条 prompt 末尾都内嵌这段，**不要另贴棕褐锚点**：

```
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```

---

## 0.5 构图硬约束（港口图）

港口立绘在界面里的容器是 **面板内宽 205~280px × 高 96px**（≈ 2.4:1~2.9:1），
而图是 16:9。CSS `object-cover` 会**裁掉上下各约 15~20%**，只保留竖向中间的带子。

由此三条：

### ① 主体必须落在**画面竖向中央 50%** 以内

写成：「panoramic wide composition, the harbour and its skyline sit in the vertical
middle band of the frame, top 20% is open sky, bottom 15% is open water/quay that may be cropped away」。

> 反例（会被切掉）：把大教堂塔尖、太阳、旗杆顶端顶到画面最上沿；把人群脚部放在最下沿。

### ② 不要底部压暗、不要留白给文字

`ParchmentCard` 自己已经叠了 `linear-gradient(180deg, transparent → rgba(30,22,13,0.85))`。
图里再压暗是压两次，会变成一团黑。

### ③ 输出尺寸 **1792×1024**（16:9 横版）

裁切交给 CSS，不要试图直接生成 2.4:1（GPT 直出不稳定，会变形）。

---

## A 组：港口立绘（8 张，最高优先级）

> 只做 8 张也值得 —— 这 8 个港口的建筑风格差异最大，做完之后「同一张图铺 7 个港」
> 的重复感会消失大半。剩余 12 港继续用区域图，可以接受。
>
> 存放：`public/assets/ports/`，命名见每条的「目标文件」。

### A1. 哈瓦那（古巴 · 西班牙殖民大港）

```
A wide panoramic view of the harbour of Havana, Cuba, in the late 16th century.
A natural deep-water bay enclosed by low hills; a Spanish colonial town of whitewashed
stone buildings with terracotta roofs and wooden balconies climbing the slope.
One modest stone church tower and a low stone fort with a few cannon embrasures on
the headland. In the foreground: a busy stone quay with stacked hogsheads of sugar,
crates of tobacco leaf, moored wooden boats, and Spanish soldiers and merchants in
16th-century dress. Two caravels and a galleon at anchor in the bay, sails furled.
Tropical palms and a hot hazy sky with tall cumulus clouds.
Panoramic wide composition, the town and harbour sit in the vertical middle band of
the frame, top 20% is open sky, bottom 15% is open water and quay that may be cropped away.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_havana.png`

### A2. 皇家港（牙买加 · 海盗之都）

```
A wide panoramic view of Port Royal, Jamaica, a notorious Caribbean pirate haven,
late 17th century. A long low sand spit crowded with ramshackle wooden buildings on
stilts, leaning warehouses, and three taverns with painted wooden signs (no readable text).
Ships of every description moored three deep along a rough timber wharf: a careened hull
with men scraping its bottom, a sloop with patched sails, a captured Spanish merchantman.
In the foreground: drunk sailors, barrels, rope coils, a cockfight, a parrot on a post.
Behind: open turquoise Caribbean water and a hazy green mountain ridge.
Sultry afternoon light, threatening dark clouds on the right edge.
Panoramic wide composition, the wharf and buildings sit in the vertical middle band of
the frame, top 20% is open sky, bottom 15% is open water and planks that may be cropped away.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_port_royal.png`

### A3. 拿骚（巴哈马 · 海盗共和国，比皇家港更穷）

```
A wide panoramic view of Nassau harbour in the Bahamas, late 17th century, a poor and
lawless pirate republic. A low sandy island, a handful of weathered clapboard shacks with
sagging roofs and driftwood fences, a single stone blockhouse on the ridge above.
A crumbling wooden jetty where a grounded sloop is being repaired with salvaged timber.
In the foreground: barefoot pirates, turtle shells, broken barrels, a beached longboat,
laundry on a line. Brilliant turquoise shallows fading to deep blue, white sand,
scrubby palms bent by trade winds, huge bright cumulus clouds.
Panoramic wide composition, the settlement and jetty sit in the vertical middle band of
the frame, top 20% is open sky, bottom 15% is open water and sand that may be cropped away.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_nassau.png`

### A4. 卡塔赫纳（哥伦比亚 · 西班牙要塞）

```
A wide panoramic view of Cartagena de Indias, a fortified Spanish treasure port on the
Caribbean coast of South America, late 16th century. Massive weathered coral-stone city
walls with sloped bastions running along the water, a squat round watchtower, a heavy
fort with tiered gun batteries on the headland. Inside the walls: whitewashed houses with
overhanging wooden balconies, a cathedral dome, bell towers. In the foreground: a stone
quay with cannon, a Spanish officer with a plumed hat, porters carrying chests, a
galleon with gun ports open at anchor. Hot flat tropical light, deep blue sea.
Panoramic wide composition, the walls and skyline sit in the vertical middle band of
the frame, top 20% is open sky, bottom 15% is open water and quay that may be cropped away.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_cartagena.png`

### A5. 韦拉克鲁斯（墨西哥湾 · 白银船队起点）

```
A wide panoramic view of Veracruz, the Spanish port on the Gulf of Mexico, late 16th
century. A flat sandy shore with a low coral-stone fortress island in the harbour, its
crenellated walls and a single flag bastion. Behind: a long arc of whitewashed arcaded
buildings with terracotta roofs and a church tower, and beyond them the hazy blue volcanic
range of the interior. In the foreground: the stone mole crowded with porters rolling
barrels, stacked silver ingots in wooden chests guarded by soldiers, crates of cochineal
dye, and a line of galleons being loaded. Heavy humid heat haze, still green sea.
Panoramic wide composition, the fortress and town sit in the vertical middle band of
the frame, top 20% is open sky, bottom 15% is open water and quay that may be cropped away.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_veracruz.png`

### A6. 开普敦（好望角 · 荷兰补给站）

```
A wide panoramic view of the Dutch victualling station at the Cape of Good Hope, late
17th century. The flat-topped Table Mountain dominates the background, its sheer cliff
face dropping to a green coastal plain. A small grid of whitewashed Dutch colonial
buildings with steep thatched roofs, a square fort with four corner bastions, and
ordered vegetable gardens and orchards laid out behind. In the foreground: the rocky
shore of Table Bay, a wooden pier, barrels of water and crates of livestock being loaded
onto a Dutch East Indiaman, Khoikhoi herders with cattle, Dutch sailors in wide hats.
Cold clear southern light, white surf, deep grey-blue sea, gulls.
Panoramic wide composition, the fort and mountain sit in the vertical middle band of
the frame, top 20% is open sky, bottom 15% is surf and rocks that may be cropped away.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_cape_town.png`

### A7. 果阿（印度 · 葡萄牙东方首府）

```
A wide panoramic view of Goa on the Mandovi river, Portuguese India, late 16th century.
A broad muddy river estuary lined with whitewashed Portuguese baroque churches with
ornate facades and bell towers, a flight of broad stone steps down to the water, palm
groves and red laterite cliffs behind. In the foreground: a crowded riverside market with
bales of pepper, sacks of cloves and nutmeg, clay pots, Indian traders in dhotis and
turbans bargaining with Portuguese fidalgos in black doublets. Several lateen-rigged
country craft and one Portuguese carrack at anchor. Hot golden haze, flat calm water,
kingfishers, hibiscus.
Panoramic wide composition, the churches and market sit in the vertical middle band of
the frame, top 20% is open sky, bottom 15% is water and steps that may be cropped away.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_goa.png`

### A8. 澳门（中国 · 葡中混杂的口岸）

```
A wide panoramic view of Macau, the Portuguese trading post on the Pearl River delta,
late 16th century. A curved bay with a stone sea wall; on the slope a dense jumble of
low Chinese buildings with grey tiled roofs and upturned eaves, mingled with a few
whitewashed Portuguese houses with arched windows and a small baroque church facade.
A Chinese temple with red pillars and a tiled roof sits at the water's edge, incense
smoke drifting. In the foreground: a stone pier with Chinese junk boats, sedan chairs,
bales of silk and porcelain crates, Portuguese and Chinese merchants negotiating,
rickshaws. Warm humid haze, hazy green hills, wide pale sky.
Panoramic wide composition, the buildings and pier sit in the vertical middle band of
the frame, top 20% is open sky, bottom 15% is water and pier that may be cropped away.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_macau.png`

---

## B 组：可平铺纹理（5 张，给 3D 近景用）

> **前提说清楚**：这 5 张是「弹药」，我需要先做实验才知道能不能用上。
> 3D 陆地的 UV 是全球 0..1，要叠高频细节必须 `repeat` 几十次，
> 所以**必须是严格无缝**的（边缘能对上，不能有明显的接缝或四角暗角）。
>
> GPT 生成「无缝」并不保证。给两个补救办法：
> 1. 生成时**不要**写 "seamless"（它会让模型画成一块四边发黑的方形），
>    而是写 "flat orthographic top-down view of a uniform surface, even lighting,
>    no vignette, no border, no shadow, filling the entire frame edge to edge"；
> 2. 我这边会用镜像平铺（`MirroredRepeatWrapping`）兜底 —— 代价是纹理有轻微的对称感，
>    在 ±10% 不透明度下看不出来。
>
> 尺寸 1024×1024，PNG，无透明。

### B1. 羊皮纸纤维（陆地 albedo 细节）

```
A flat orthographic close-up of aged parchment paper filling the entire frame edge to
edge, warm cream and pale ochre tone, fine irregular fibre grain, subtle mottled
staining, a few tiny darker flecks, no folds, no tears, no writing, no drawing.
Perfectly even diffuse lighting, no vignette, no border, no shadow, no highlight,
no gradient, uniform density across the whole image.
```
→ `tile_parchment.png`

### B2. 干燥岩土（沙漠 / 地中海 / 北非地表）

```
A flat orthographic top-down close-up of dry stony earth filling the entire frame edge to
edge: pale sandy ochre ground with scattered small gravel, faint cracks, dry tufts,
subtle tonal variation. Muted warm tan and dusty brown, no vegetation clumps larger than
a pebble, no shadows. Perfectly even diffuse lighting, no vignette, no border,
no gradient, uniform density across the whole image.
```
→ `tile_terrain_dry.png`

### B3. 林地地被（温带 / 热带内陆）

```
A flat orthographic top-down close-up of a dense forest floor filling the entire frame
edge to edge: dark olive-green mossy ground, scattered leaf litter, thin exposed roots,
small ferns, subtle dappled tonal variation but no strong light patches. Muted deep green
and umber. Perfectly even diffuse lighting, no vignette, no border, no gradient,
uniform density across the whole image.
```
→ `tile_terrain_green.png`

### B4. 岩层断面（海岸侧壁用）

```
A flat close-up of a weathered exposed rock face filling the entire frame edge to edge,
seen straight on: horizontal sedimentary strata of warm tan, ochre and dark brown,
crumbling texture, small fissures, no vegetation, no sky, no water.
Perfectly even diffuse lighting, no vignette, no border, no gradient.
```
→ `tile_rock_face.png`

### B5. 海面细波（3D 海面 bumpMap 用）

```
A flat orthographic top-down close-up of calm open sea surface filling the entire frame
edge to edge: fine wind-driven capillary ripples, gentle overlapping wavelets, no foam,
no breaking waves, no boat, no land. Muted deep blue-green, low contrast, subtle.
Perfectly even lighting, no sun glitter, no vignette, no border, no gradient.
```
→ `tile_sea_ripple.png`

---

## C 组（可选，风险最高）：地形符号 sprite

> 这一组**优先级最低**，因为现在 2D 的山和树是代码画的（26×19px），
> 3D 用的是同一套 canvas 贴图，两边已经对齐。换成手绘符号要重调两边的缩放/透视，
> 而且很容易和现有海岸墨线、经纬网的线条粗细打架。
>
> **只有 A、B 两组都做完、效果确认之后再做这一组。**

一张**符号图集**（不是单张），2 行 × 4 列，每格 256×256，透明背景，褐色线描：

```
A sprite sheet on pure white background, 2 rows and 4 columns of 8 separate antique
map terrain symbols, each centred in its own 256x256 cell with clear empty margins:
row 1 — single sharp mountain peak, twin mountain ridge, rounded hill, sand dune;
row 2 — conifer tree cluster, broadleaf tree cluster, palm tree, small village cluster.
Each symbol drawn in the manner of 16th-century hand-engraved map ornament: fine dark
brown ink outline, sparse hatching on the shaded right side, very light warm tan wash
inside, no colour fill beyond that. Uniform line weight, consistent scale across all
symbols, no shadow, no text, no frame, no numbers, no grid lines.
```
→ `ui_terrain_symbols.png`（我会自己切片，你只要给整张）

---

## 验收标准（我会这么查）

| 检查项 | 不通过就退回 |
|---|---|
| 尺寸 | 港口图 ≥1536×864；tile 1024×1024 |
| 有无文字 | 任何可读字母/数字/水印 → 重生成 |
| 港口构图 | 主体若顶到画面上沿 15% 或下沿 15%，裁成 96px 高会切掉主体 |
| 风格一致性 | 与 `port_seville.png` 并排看，色温/笔触/细节密度不能有明显代差 |
| tile 接缝 | 左右拼接、上下拼接各看一次，接缝处不能有亮线/暗线/结构断裂 |
| tile 暗角 | 四角不能比中心暗（有暗角会在平铺时变成网格） |

**一次交付不需要全给。先给 A 组 8 张，我接进去对比完，再决定 B 组值不值得做。**

---

## 接入方式（我来做，你只管给图）

1. 把图按上面的文件名丢进 `public/assets/ports/` 或 `public/assets/tiles/`
2. 我改 `src/data/portImages.ts`：把区域共用改成按港口 id 的专属表，其余港口继续回退区域图
3. 跑 `npm test` + 8 面板对比度审计 + 移动端 37 项 + 布局 8×2
4. 截图逐港目检（现有 e2e 脚本 `.workbuddy/panel-shots.mjs` 可以按港口截）
