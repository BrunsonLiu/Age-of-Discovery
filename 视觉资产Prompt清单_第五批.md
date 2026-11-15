# 《大航海时代》视觉资产 Prompt 清单 · 第五批

> 前四批做完了：舰船 10 张、人物肖像 31 张、事件插图 25 张（覆盖全部 25 个 sceneKey）、
> 港口立绘 17 张。**这一批只解决一件事：把"港口"这件事真正画清楚。**
>
> 沿用第四批 0.4 的**彩色油画风格锚**（不是第一批的棕褐铜版），
> 但这一批多了两条硬约束（0.4 时代、0.5 三端适配），务必看。

---

## 0. 缺口诊断

### 0.1 岸上整屏：21 个港口里只有 3 个有真全景

`src/data/portImages.ts` 里有两套映射，很多人会看混：

| 用途 | 取图函数 | 现在的情况 |
|---|---|---|
| 港口面板那张 96px 高的小图 | `portImage()` | 17 张，21 港共用（4 个港共用一张） |
| **岸上整屏的背景** | `harborBackdrop()` | **只有 3 港**（塞维利亚 / 里斯本 / 加的斯）指向 `harbor_europe.webp` |

其余 18 港的岸上背景**回落成面板那张图**，再用 CSS `object-cover` 拉到
1500~2500px 宽铺满整屏 —— 观感是一团涂抹，玩家连"这地方长什么样"都看不出来。

这不是"图不够多"，是**分辨率不够**。

### 0.2 更要紧的：最常被放大的那批其实是插值出来的

盘里的 17 张不是同一批做的，分辨率来源也不一样 —— 这点必须分清，否则会白画：

| 批次 | 文件 | 名义尺寸 | **原生尺寸** | 岸上整屏（1440 屏） |
|---|---|---|---|---|
| 区域图 5 张 | `port_seville` / `port_caribbean` / `port_northern_europe` / `port_west_africa` / `port_southeast_asia` | 1600×900 | 1600×900（真原生） | 1:1，勉强够 |
| 专属图 8 张 | `port_havana` / `port_port_royal` / `port_nassau` / `port_cape_town` / `port_goa` / `port_cartagena` / `port_veracruz` / `port_macau` | 1792×1024 | **约 800×220**（插值放大） | **放大约 1.8× → 软** |
| 后补 4 张 | `port_guangzhou` / `port_malay_river` / `port_swahili_coast` / `harbor_europe` | 1600×900 / 1672×941 | 同左（真原生） | 1:1，够 |

> 素材说明书在 `data/portImages.ts` 的注释里自己标注过这件事：
> 「生成器输出的原图约 800×220，1792×1024 是插值放大，不是原生分辨率」。
>
> 所以**最该重画的是「专属图 8 张」那批**（它们恰好在最常去的加勒比线上），
> 而不是"所有 17 张都不行"。1600×900 那批铺 1440 屏是 1:1，只有 2K 屏才会放大 1.4×。

**这一批的规矩**：新图一律 **≥1792×1024 且必须原生**（别让生成器把小图再放大）。
一张 16:9 原生大图，既能铺岸上整屏，也能裁出面板那条 —— 一张顶两处用。

### 0.3 另外三处完全没图

| 对象 | 现在长什么样 | 数量 |
|---|---|---|
| 海上遗物（`data/relics.ts`） | 图鉴里只有 Lucide 图标 + 一行字 | 9 件 |
| 国别传说（`data/nations.ts` 的 `legend`） | 同上 | 5 条 |
| 云（甲板/3D 海图共用） | 768² 静态贴图，放大偏软 | 3 张种子 |

这三处都在**玩家会反复翻开**的地方（图鉴整屏），所以优先级不低。

---

### 0.4 年代：画"这个港最像它自己的那个年代"，但整批不要混进 19 世纪

这里有一个必须讲清的张力，否则会画出前后矛盾的图。

游戏开局是 **1492 年**，而**现有的 17 张港口图基本是 16~17 世纪的样子**
（哈瓦那那张已经画了石造要塞，皇家港那张画了成排木构酒馆）。
如果现在严格按 1492 重画，皇家港、拿骚、卡塔赫纳、韦拉克鲁斯、开普敦都会变成荒地 ——
玩家会觉得"这游戏里没有城市"。

所以这一批的口径是：

> **港口图 = 该港在大航海时代最典型的样子（大致 1490~1660 之间），
> 人物与事件仍严格在 1492；整批不许出现 18 世纪之后的元素。**

在这个口径下，每条 prompt 都标了**该港的年代下限与上限**，并且逐条写了"这个年代
绝不能出现什么"。历史上踩过一次坑：广州被画成暹罗（金色佛塔、chofa 弯檐），
大明的市舶司变成了阿瑜陀耶 —— 后来单独重画一张才补回来。所以下面的表不是装饰：

| 建筑 | 建成 | 能不能进画面 |
|---|---|---|
| 塞维利亚吉拉尔达钟楼 | 1198 宣礼塔 / 1568 加钟楼 | ✅ 能（加钟楼前是细长方塔） |
| 伦敦塔 / 伦敦桥 | 1078 / 1209 | ✅ 能 |
| 埃尔米纳圣乔治堡 | 1482 | ✅ 能 —— **唯一"应该有欧式堡垒"的非洲港** |
| 广州城墙 / 六榕寺花塔 / 妈阁庙 | 明 / 宋 / 1488 | ✅ 能 |
| 马六甲木构王宫与清真寺 | 15 世纪 | ✅ 能 |
| 蒙巴萨 / 桑给巴尔珊瑚石城 | 11 世纪起 | ✅ 能 |
| 里斯本贝伦塔 | 1521 | ❌ 不给 |
| 哈瓦那莫罗城堡 | 1589 | ❌ 不给（画天然湾） |
| 澳门大三巴 | 1602 | ❌ 不给（画渔村 + 妈阁庙） |
| 果阿仁慈耶稣教堂 | 1605 | ❌ 不给（画比贾普尔苏丹国的港） |
| 阿姆斯特丹运河环 | 1613 起 | ❌ 不给（只有阿姆斯特尔河口木码头） |
| 圣保罗大教堂穹顶 | 1710 | ❌ 不给 |
| 任何 18 世纪之后的巴洛克/新古典立面、铁壳船、蒸汽、起重机 | — | ❌ 一律不给 |

> 一句话：**加勒比那几个港如果你想要"像现在素材那样有城"，就画 16~17 世纪的木构据点；
> 如果想严格贴 1492，就画天然湾（A4 哈瓦那那条就是严格版的写法）。两种都写了。**

---

### 0.5 构图：一张图要同时喂三个容器

这批图会被三处同时使用，构图必须三面都能活：

| 用途 | 比例 | 裁切方式 |
|---|---|---|
| 岸上整屏背景 | 16:9 铺满视口 | `object-cover`，1440 屏约 1:1，2K 屏放大 1.4× |
| 港口面板小图 | ≈2.4:1 的一条 | `object-cover` 只取**竖向中间带**，上下各裁 15~20% |
| 图鉴格子（400×225 缩略） | 16:9 | 中心裁，脚本自动生成 |

由此三条硬约束（每条 prompt 末尾都内嵌了）：

1. **主体必须落在画面竖向中间 50% 以内**。
   网上 20% 是天空、下 15% 是水面/空码头 —— 这两条会被裁掉或盖住。
2. **底部 15% 不要压暗、不要放主体**。
   岸上视角会在下方叠一块**我们自己画的石砌码头**（视口 82% 水线以下），
   图里再压暗就是压两次，会糊成一片黑。
3. **不要有人在画面前景做特写**。UI（见闻板、门牌带）就压在那里。

---

### 0.6 负面提示怎么用

第六批之后的所有图，negative 请按**建筑体系**分组写，
而不是笼统写 "no wrong architecture"——后者模型完全听不懂。

**通用（每条都带）**：
```
No text, no watermark, no signature, no frame, no border,
no modern elements, no photographic realism, no 3D render,
no lens flare, no HDR glow, no fisheye distortion.
```

**亚洲港口**：
```
No Thai temple, no chofa, no prang, no chedi, no golden stupa, no Angkor towers.
No Japanese castle, no torii gate, no curved gable roofs of Japanese style.
No Chinese flying eaves with glazed yellow tiles (except Guangzhou and Macau).
No Baroque church, no Neoclassical portico, no domed cathedral.
```

**欧洲港口**：
```
No palm trees, no bamboo, no thatched huts, no tropical vegetation.
No Baroque or Neoclassical facade, no domed cathedral built after 1600.
No Dutch canal ring houses (Amsterdam, before 1613), no stepped gable rows.
```

**非洲 / 印度洋港口**：
```
No Thai temple, no chofa, no prang. No Chinese pagoda.
No Omani onion dome, no minaret taller than three storeys
(Swahili stone towns only, 15th century).
No Portuguese church built after 1550.
```

**加勒比港口**：
```
No stone fortress with star-plan bastions (post-1580).
No large stone cathedral, no European city square.
No steam, no iron hulls, no modern wharf with cranes.
```

---

### 0.7 落盘与命名

| 项 | 规定 |
|---|---|
| 格式 | **WebP，q72**（脚本 `scripts/make_port_thumbs.py` 会再派生 400×225 小图） |
| 每张体积 | **≤600KB**（岸上整屏是首屏资源，不能更大） |
| 尺寸 | **≥1792×1024**；若 GPT 只能给 1536×1024，可接受，但不要更小 |
| 文件名 | 见每条末尾的「目标文件」 |
| 放哪里 | `public/assets/ports/`（港口）、`public/assets/relics/`（遗物，新目录）、`public/assets/legend/`（传说，新目录） |
| 换图后必做 | ① 改 `src/data/portImages.ts` 的 `PORT_SPECIFIC` / `HARBOR_BACKDROP_BY_ID`；② 跑 `python scripts/make_port_thumbs.py` 重生成缩略图；③ `npm run build:clean` |
| 生成后自检 | 见第 9 节 |

---

# A 组 · 最先看到的地方（5 张，最高优先级）

> 这 5 张覆盖"玩家开局第一眼"和"跑一趟必经过"的港。
> 做完它们，岸上整屏的观感就换了一档。

### A1. 广州（大明 · 市舶司）

**史实锚点**：明代城墙与城门楼、六榕寺花塔（宋）、怀圣寺光塔（唐）、珠江上的红帆沙船、
市舶司衙署、灰瓦硬山屋面。**不要**葡式教堂、不要金色佛塔、不要泰式弯檐。

```
A wide panoramic view of Guangzhou (Canton) on the Pearl River, Ming dynasty, around 1492.
A grey brick city wall with a crenellated gate tower and a wooden gate house; inside the wall,
a slender octagonal brick pagoda (Song dynasty, plain grey brick, no gold) rising above
grey-tiled roof ridges of courtyard houses. On the waterfront, a modest customs office
(shibosi) with a tiled roof and a flagpole, stone steps down to the water, stacked bales of
silk and crates of porcelain waiting for loading. On the river: three-masted Chinese junks
with red battened sails, smaller sampans, a ferry poling across. Riverside banyan trees.
Mist over the delta hills, soft morning light.
Panoramic wide composition, the city wall and pagoda sit in the vertical middle band of the
frame, top 20% is open sky, bottom 15% is open water and stone steps that may be cropped away.
No European architecture, no Baroque church, no Portuguese facade, no Thai temple, no chofa,
no prang, no chedi, no golden stupa, no Angkor towers, no Japanese castle, no torii.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_guangzhou.webp`（已有同名文件，**直接覆盖**）

---

### A2. 塞维利亚（西班牙 · 内河大港）

**史实锚点**：瓜达尔基维尔河、金塔（Torre del Oro，1220）、吉拉尔达钟楼（1198 宣礼塔，
1568 才加钟楼 —— 画成细长的方塔 + 顶部简单即可）、印度群岛贸易署（1584 后）、
石砌河岸、装卸白银箱的吊杆。

```
A wide panoramic view of the river port of Seville on the Guadalquivir, around 1500.
Wide brown river in the foreground with a stone quay along the right bank; a tall square
brick watchtower with a simple pyramidal roof (Torre del Oro) on the water's edge.
Behind it, whitewashed houses with terracotta roofs, a slender square brick bell tower
(Giralda) rising above the town, a low customs building with arcaded ground floor.
On the quay: stacked wooden chests, ropes, mules pulling carts, dockworkers in linen shirts,
merchants in dark cloaks. Two carracks and a caravel moored, sails furled, gangplanks down.
Hot Andalusian light, pale blue sky, thin haze.
Panoramic wide composition, the tower and waterfront sit in the vertical middle band of the
frame, top 20% is open sky, bottom 15% is open water and quay that may be cropped away.
No palm trees, no tropical vegetation, no Baroque facade, no Neoclassical portico,
no domed cathedral, no modern bridge, no iron ship.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_seville.webp`（覆盖）

---

### A3. 里斯本（葡萄牙 · 大航海时代的起点）

**史实锚点**：特茹河北岸、山城层层叠叠的白墙红瓦、**贝伦塔还没有（1515 才建）**、
罗西奥一带的窄街、石阶、大帆船。要有"山城"的纵深感 —— 这是里斯本和塞维利亚最直观的区别。

```
A wide panoramic view of Lisbon harbour on the Tagus river, around 1490.
A steep hillside town of whitewashed houses with terracotta roofs and narrow stepped lanes
climbing up from the waterfront; a ruined Moorish castle wall on the crest (Castelo de São Jorge),
a plain square bell tower among the roofs. No ornate monument on the water — the shoreline is a
plain stone quay with wooden cranes. In the foreground: three-masted carracks and a caravel
moored, barrels of wine and crates, sailors mending nets, a fish market with baskets.
Wide grey-green river water, hazy Atlantic light, gulls.
Panoramic wide composition, the hillside town sits in the vertical middle band of the frame,
top 20% is open sky, bottom 15% is open water and quay that may be cropped away.
No Belém Tower, no Monument to the Discoveries, no Baroque facade, no domed cathedral,
no palm trees, no tropical vegetation, no modern bridge, no iron ship, no tram.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_lisbon.webp`（**新文件**，代码里 `PORT_SPECIFIC[7]` 改指它）

---

### A4. 哈瓦那（古巴 · 天然良港）

**史实锚点**：1492 年这里**没有城市**。天然深水湾、低矮丘陵、棕榈、原住民（泰诺人）的
茅屋村落、独木舟、泊在外面的船。**不要**莫罗城堡（1589）、不要石造教堂。

```
A wide panoramic view of a natural deep-water bay in Cuba, 1492, before any European settlement.
A sheltered turquoise bay ringed by low green hills; a small Taíno village of thatched round
huts on the shore, fish drying on wooden racks, dugout canoes pulled up on the sand.
Two Spanish caravels and a caravel at anchor in the bay, boats lowered, men wading ashore.
Dense tropical vegetation: royal palms, sea grape, mangroves at the water's edge.
Hot hazy sky with tall cumulus clouds, strong afternoon light on the water.
Panoramic wide composition, the bay and village sit in the vertical middle band of the frame,
top 20% is open sky, bottom 15% is open water and sand that may be cropped away.
No stone fortress, no star-plan bastions, no cathedral, no European town square,
no colonial arcades, no tiled roofs, no brick buildings, no modern wharf, no cranes.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_havana.webp`（覆盖）

---

### A5. 马六甲（满剌加苏丹国 · 海峡咽喉）

**史实锚点**：15 世纪满剌加苏丹国都城。**木构王宫**（高脚、直脊、多层檐）、
**木构清真寺**（不是洋葱穹顶）、中国式砖石仓库、河口、prahu 与沙船、
红树林与椰林。**绝对不要**泰式佛塔 / chofa / 金顶寺庙 —— 上一次就是这里画错的。

```
A wide panoramic view of the river mouth of Malacca, Sultanate of Malacca, around 1490.
A tropical river mouth opening into a strait; on the left bank a Malay sultan's palace of
dark timber on stilts, with a steep straight-ridged multi-tiered thatched roof and carved
wooden eaves (no gold, no stone). Beside it a small wooden mosque with a tiered pyramidal roof.
Warehouses of brick and timber along a timber wharf; stacked sacks of spices, rattan baskets,
Chinese porcelain jars. On the water: Malay prahu with triangular sails, a Chinese junk with
red battened sails, fishing boats. Dense coconut palms and mangrove behind the town,
a low green hill in the distance. Hot humid haze, flat tropical light.
Panoramic wide composition, the palace and wharf sit in the vertical middle band of the frame,
top 20% is open sky, bottom 15% is open water and timber planks that may be cropped away.
No Thai temple, no chofa, no prang, no chedi, no golden stupa, no Angkor towers,
no Japanese castle, no torii, no Chinese flying eaves with glazed yellow tiles,
no Omani onion dome, no stone fortress, no Baroque church.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_malay_river.webp`（覆盖；巴达维亚共用这一张 —— 两座都是河口港）

---

# B 组 · 把"共用一张"的港拆开（10 张）

> 这 10 张做完，21 个港口里只剩 2 组共用（蒙巴萨/桑给巴尔、塞维利亚/加的斯），
> 属于**同一片海岸的合理共用**，不再是"7 个港看同一张画"。
>
> ⚠️ 这一组里有 4 个加勒比港（皇家港 / 拿骚 / 托尔图加 / 卡塔赫纳）写的是
> **16~17 世纪的木构据点版**，与现有素材的"有城"保持一致（见 0.4 的口径）。
> 如果你更想要严格 1492 的天然湾版，把 A4 哈瓦那那条的骨架换掉城市段即可 ——
> 两者的差别是"有没有木栈桥与酒馆"，不是风格。

### B1. 皇家港（牙买加 · 海盗之都）

```
A wide panoramic view of Port Royal, Jamaica, a Caribbean pirate haven, around 1660.
A long low sand spit crowded with ramshackle timber buildings on stilts, leaning warehouses,
three taverns with painted wooden signs (no readable text), a careened hull with men scraping
its bottom, a sloop with patched sails, a captured Spanish merchantman.
In the foreground: sailors, barrels, rope coils, a parrot on a post.
Open turquoise water and a hazy green mountain ridge behind.
Sultry afternoon light, dark clouds on the right edge.
Panoramic wide composition, the wharf sits in the vertical middle band of the frame,
top 20% is open sky, bottom 15% is open water and planks that may be cropped away.
No stone fortress, no star bastions, no cathedral, no colonial arcades, no tiled roofs.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_port_royal.webp`

### B2. 拿骚（巴哈马 · 海盗共和国）

```
A wide panoramic view of Nassau harbour, Bahamas, around 1670.
A low sandy island with a shallow protected harbour; a scatter of timber huts and a
two-storey wooden tavern with a wide veranda on the beach; a rough timber jetty with
a sloop and a schooner tied up, cargo of rum casks and bales on the sand.
Pine and palmetto scrub behind the beach, pale turquoise shallows with sandbars visible
through the water, a reef line with white surf beyond.
Bright hard tropical light, high blue sky.
Panoramic wide composition, the beach and jetty sit in the vertical middle band of the frame,
top 20% is open sky, bottom 15% is shallow water that may be cropped away.
No stone fortress, no cathedral, no colonial arcades, no European town, no tiled roofs.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_nassau.webp`

### B3. 托尔图加（海地北岸 · 法国海盗的根据地）

**和拿骚的区别**：托尔图加是**陡峭的火山岛 + 悬崖**，不是平沙洲。

```
A wide panoramic view of Tortuga island, Hispaniola, a French buccaneer base, around 1650.
Steep limestone cliffs dropping into deep blue water; a narrow beach at the foot of the cliff
with a cluster of palm-thatch huts and a timber stockade; a stone watchtower (small, ruined)
on the ridge. Below: a careened brig on the beach with men working on the hull, a canoe,
a ship's boat. Buccaneers drying meat on wooden frames, smoke from a fire.
Dramatic late-afternoon light, clouds building over the ridge.
Panoramic wide composition, the cliff and beach sit in the vertical middle band of the frame,
top 20% is open sky, bottom 15% is open water that may be cropped away.
No sandy flat spit, no stone fortress town, no cathedral, no colonial arcades, no tiled roofs.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_tortuga.webp`（新文件）

### B4. 圣胡安（波多黎各 · 西班牙军事要塞）

```
A wide panoramic view of San Juan harbour, Puerto Rico, around 1540.
A wide bay entered past a rocky islet; on the headland a low stone fort with a few cannon
embrasures and a flag (no readable emblem); the town behind is a grid of whitewashed
single-storey houses with terracotta roofs and heavy wooden gates, a plain parish church
with a square tower. A stone quay with steps, a crane, hogsheads and crates.
Two caravels and a galleon at anchor, boats ferrying between ship and shore.
Bright Caribbean light, clear sky, palms along the waterfront.
Panoramic wide composition, the harbour and fort sit in the vertical middle band of the frame,
top 20% is open sky, bottom 15% is open water and quay that may be cropped away.
No star-plan bastions of the 17th century, no large cathedral, no Baroque facade,
no colonial arcades with tiled roofs, no palm-less northern landscape.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_san_juan.webp`（新文件）

### B5. 卡塔赫纳（哥伦比亚 · 珍宝航线的枢纽）

```
A wide panoramic view of Cartagena de Indias harbour, around 1570.
A broad bay behind a narrow entrance; a whitewashed Spanish colonial town of two-storey houses
with wooden balconies and terracotta roofs, one plain stone church tower, a low stone wall
along the shore with a small gate. On the quay: silver ingots in chests, bales of indigo,
mules, soldiers with halberds, merchants in dark cloaks.
Galleons at anchor in the bay, sails furled, a longboat pulling out.
Hot hazy light, flat calm water, palms among the houses.
Panoramic wide composition, the town and waterfront sit in the vertical middle band of the frame,
top 20% is open sky, bottom 15% is open water and quay that may be cropped away.
No star-plan bastions of the late 17th century, no large cathedral, no Baroque facade,
no colonial tiled arcades, no northern European houses.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_cartagena.webp`

### B6. 韦拉克鲁斯（墨西哥湾 · 白银集散地）

```
A wide panoramic view of the coast of Veracruz, Gulf of Mexico, around 1520.
A low sandy shore with dunes and scrub, a small settlement of thatched huts and one
timber warehouse on the beach; a wooden jetty running out into shallow water where a
caravel is anchored and a longboat is unloading. Totonac fishermen with nets and
dugout canoes in the foreground. Inland: the faint blue profile of a high volcano
(Orizaba) on the horizon. Hot haze, harsh tropical light, big clouds.
Panoramic wide composition, the shore sits in the vertical middle band of the frame,
top 20% is open sky, bottom 15% is shallow water that may be cropped away.
No stone fortress, no cathedral, no colonial city, no tiled roofs, no European square.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_veracruz.webp`

### B7. 伦敦（英格兰 · 伊丽莎白时代之前的泰晤士河）

**史实锚点**：伦敦塔（1078）、伦敦桥（1209，多拱石桥 + 桥上房屋）、
泰晤士河平底驳船、石砌码头。**不要**圣保罗大教堂穹顶（现存 1675 后）。

```
A wide panoramic view of the Pool of London on the Thames, around 1500.
The river fills the foreground, crowded with square-rigged merchant ships and flat-bottomed
Thames barges; the north bank is lined with timber-framed warehouses and stone quays with
wooden cranes. Behind them, the massive white keep of the Tower of London with four corner
turrets; downstream, a multi-arch stone bridge with houses built along its span (London Bridge).
Grey overcast sky with breaks of pale sun, gulls, wet cobbles.
Panoramic wide composition, the river and towers sit in the vertical middle band of the frame,
top 20% is open sky, bottom 15% is river water that may be cropped away.
No dome of St Paul's, no Baroque facade, no Neoclassical portico, no palm trees,
no iron-hulled ships, no steam, no modern bridges, no Houses of Parliament.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_northern_europe.webp`（覆盖；伦敦用这张）

### B8. 阿姆斯特丹（荷兰 · 阿姆斯特尔河口的木码头）

**史实锚点**：**运河环还没开挖（1613 后才开始）**。只有阿姆斯特尔河口的木码头、
砖砌山墙房、鲱鱼船。这一张要和伦敦明显不同（伦敦是塔与石桥，这里是低地与水巷）。

```
A wide panoramic view of the harbour at the mouth of the Amstel, Holland, around 1500.
Low flat land, a wide grey river mouth with wooden jetties on piles; a row of narrow
brick houses with steep stepped and bell gables facing the water, a small wooden crane,
fish drying racks, barrels of herring. Boats: flat-bottomed Dutch coastal vessels with
side rudders, a herring boat with its nets spread, a small ferry.
Windmills on the low horizon (drainage mills, not industrial), reeds along the bank,
heavy grey clouds with a low sun breaking through.
Panoramic wide composition, the houses and jetty sit in the vertical middle band of the frame,
top 20% is open sky, bottom 15% is water that may be cropped away.
No canal ring of concentric waterways, no tall narrow canal houses in long rows,
no Baroque facade, no domed church, no palm trees, no mountains.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_amsterdam.webp`（新文件）

### B9. 果阿（比贾普尔苏丹国的印度洋港）

**史实锚点**：1492 年葡人未到（1510 才占领）。曼多维河口、印度式石阶码头（ghat）、
**深色玄武岩石构 + 平顶**、三角帆船（dhow）、椰林。**不要**葡式教堂（仁慈耶稣 1605）。

```
A wide panoramic view of the harbour at Goa on the Mandovi river, around 1490,
under the Bijapur Sultanate. A wide brown-green river mouth; on the bank a stone landing
of broad steps (ghat) leading down to the water, low buildings of dark basalt with flat roofs
and carved wooden doorways, a small whitewashed shrine with a plain pyramidal roof.
Warehouses with tiled roofs, bales of pepper and sacks of rice, porters carrying loads
on their heads. On the water: lateen-rigged dhows with triangular sails, a few rowing boats.
Dense coconut palms behind the town, red laterite cliffs, hot hazy light.
Panoramic wide composition, the ghat and buildings sit in the vertical middle band of the frame,
top 20% is open sky, bottom 15% is open water and steps that may be cropped away.
No Portuguese church, no Baroque facade with volutes, no basilica, no Thai temple,
no chofa, no prang, no Chinese pagoda, no onion dome.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_goa.webp`

### B10. 澳门（渔村 + 妈阁庙）

**史实锚点**：1492 年葡人未到（1557 才落脚）。**妈阁庙已存在（1488）**、
疍家船、渔村棚屋、内港浅滩。**不要**大三巴（1602）、不要葡式石板街。

```
A wide panoramic view of the Inner Harbour of Macau, around 1490, a Cantonese fishing village.
A shallow tidal inlet with mudflats at low tide; stilt houses of timber and matting over the
water, drying fish racks, nets spread on frames. On the shore, a small stone temple with a
low tiled roof and red pillars built into a rocky slope, incense smoke, a few banyan trees.
On the water: Tanka boats with woven canoes, a small junk with a patched battened sail.
Grey-green shallow water, hazy delta light, low hills behind.
Panoramic wide composition, the stilt houses and temple sit in the vertical middle band of
the frame, top 20% is open sky, bottom 15% is shallow water that may be cropped away.
No Portuguese facade, no Baroque church, no stone staircase square, no lighthouse,
no Thai temple, no chofa, no prang, no golden stupa, no Japanese castle.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_macau.webp`

---

# C 组 · 非洲与东非海岸（4 张）

### C1. 埃尔米纳（黄金海岸 · 1482 年的葡式城堡）

**唯一一个"应该有欧式堡垒"的非洲港** —— 圣乔治堡 1482 年建成，1492 年立在那里。
这条 prompt 是全批里最"确定"的一张，因为它的史实锚点最硬。

```
A wide panoramic view of Elmina on the Gold Coast, around 1492.
A low rocky headland with a square whitewashed Portuguese fortress (Castelo de São Jorge da Mina)
— thick stone walls, a crenellated parapet, a small square turret with a flag, cannon ports.
Below it, a fishing beach with painted canoes drawn up on the sand, nets drying, thatched huts
of a Ghanaian fishing village, women carrying baskets. Palm trees along the shore.
Dark blue Atlantic swell breaking on the rocks, bright hot light, dramatic cumulus clouds.
Panoramic wide composition, the fortress sits in the vertical middle band of the frame,
top 20% is open sky, bottom 15% is surf and sand that may be cropped away.
No star-plan bastions, no cathedral, no Baroque facade, no Thai temple, no chofa,
no thatched-roof castle, no modern harbour.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_west_africa.webp`（覆盖）

### C2. 开普敦（好望角 · 迪亚士的补给点）

**史实锚点**：1492 年**没有城市**。桌山、狮头山、天然湾、科伊人放牧、无建筑。

```
A wide panoramic view of a sheltered bay at the Cape of Good Hope, 1492, before any settlement.
The flat-topped Table Mountain rising behind the bay, with the sharp peak of Lion's Head to
the left; white surf on granite rocks, a broad sandy beach and low dunes.
A Khoikhoi herding camp on the grass above the beach: dome-shaped mat huts, cattle,
people in skin cloaks with staffs. On the sand: a ship's boat pulled up, two sailors
filling water barrels at a stream. Kelp in the shallows, cormorants on the rocks.
Clear cold light, deep blue sea, scattered white clouds.
Panoramic wide composition, the mountain and bay sit in the vertical middle band of the frame,
top 20% is open sky, bottom 15% is surf and sand that may be cropped away.
No city, no buildings of stone or brick, no castle, no harbour wall, no docks,
no jetties, no modern city bowl, no palm trees.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_cape_town.webp`

### C3. 蒙巴萨（斯瓦希里珊瑚石城）

**史实锚点**：11 世纪起就有石城。**白色珊瑚石墙 + 平顶 + 雕花木门 + 白色宣礼塔
（不超过三层）+ 三角帆船（dhow）**。**不要**阿曼式洋葱穹顶（17 世纪后）。

```
A wide panoramic view of Mombasa island on the East African coast, around 1490, a Swahili
stone town. A wide turquoise channel with a coral reef breaking white at the entrance;
the town is a dense cluster of white coral-stone houses with flat roofs, tall carved wooden
doors, and shaded arcaded ground floors. A slender whitewashed minaret three storeys high
with a small conical cap, a plain flat-roofed mosque beside it. Timber jetties with dhows
moored — lateen sails furled, hulls sewn with coir rope. On the quay: sacks of ivory,
amphorae, baskets, porters, mangrove poles. Palms and mangrove thickets at the water's edge.
Bright equatorial light, hazy horizon.
Panoramic wide composition, the town and channel sit in the vertical middle band of the frame,
top 20% is open sky, bottom 15% is water and jetty that may be cropped away.
No Omani onion dome, no tall minaret above three storeys, no Portuguese fort,
no Baroque church, no Thai temple, no chofa, no prang, no Chinese pagoda.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_swahili_coast.webp`（覆盖；桑给巴尔共用）

### C4. 巴达维亚（爪哇北岸 · 巽他王国的河口港）

**史实锚点**：1492 年是巽他王国（Pajajaran）治下的河口港（Kalapa），
**没有荷兰运河城**（那要 1619 之后）。可复用第 A5 张构图逻辑，但要更"爪哇"：
红土、竹构、圆锥顶谷仓、Javanese joglo 屋顶。

```
A wide panoramic view of a river mouth harbour on the north coast of Java, around 1490,
under the Sunda Kingdom. A muddy river mouth opening into a shallow brown-green sea;
on the bank a trading post of timber and bamboo houses with wide eaves and steep
hip roofs, one large pavilion with a tall pyramidal thatched roof (joglo), grain barns
on stilts. Timber landing stage, cargo of rice sacks, coconut oil jars, rattan mats,
merchants with bolt cloth. On the water: Javanese prahu with raked triangular sails,
a Chinese junk at anchor. Coconut palms, banana plants, dry paddy behind the town.
Hot hazy equatorial light, thunderheads on the horizon.
Panoramic wide composition, the landing and houses sit in the vertical middle band of the frame,
top 20% is open sky, bottom 15% is water and mud that may be cropped away.
No Dutch canal ring, no stepped gable houses, no brick warehouses, no church,
no stone fortress, no Thai temple, no chofa, no prang, no Chinese pagoda.
Late 18th-century hand-colored marine painting, full color, rich but muted palette
(warm ochre stone walls, terracotta tile roofs, deep green palms, azure sea,
pale gold sunlight), thick visible brushstrokes, densely detailed period
architecture and crowds, crisp architectural drawing underneath the paint,
golden-hour warm rim light, atmospheric perspective on distant hills.
No text, no watermark, no signature, no frame, no border, no modern elements,
no photographic realism, no 3D render.
```
→ `port_batavia.webp`（新文件；若不想单独画，可继续共用 `port_malay_river`）

---

# D 组 · 海上遗物（9 张，1:1 静物）

> 图鉴「海上遗物」现在只有 Lucide 图标。这批做成**静物特写**：
> 一件东西占满画面 70%，背景是海面/沙滩/浪花，**不画人**。
> 玩家在图鉴里看到的应该是"捞上来的那个东西"，不是一张风景。

**统一前缀**（每条都带）：

```
A single object photographed as a museum still life, floating or resting against
open sea and sky, the object filling 70% of the frame, three-quarter view,
soft overcast daylight from the left, wet surfaces with salt residue,
no people, no hands, no text, no label, no frame.
```

| # | 遗物 | 目标文件 | 附加描述（接在统一前缀后） |
|---|---|---|---|
| D1 | 迪亚士的断桅 | `relic_dias_mast.webp` | A broken lower mast section of a 15th-century caravel, splintered at the top, iron hoops rusted, tarred rope ends trailing in the water, weed and barnacles on the wood. |
| D2 | 达·伽马的界碑 | `relic_mozambique_padrao.webp` | A weathered limestone pillar (padrão) lying half-buried in wet sand, the cross carved at its top worn almost smooth, Portuguese shield faintly visible, green algae in the carving. |
| D3 | 圣萨尔瓦多的铁锚 | `relic_san_salvador_anchor.webp` | A heavy four-fluked iron anchor, encrusted with rust and coral, a length of blackened hemp cable still seized to the ring, resting on a shallow sandy bottom with light rippling over it. |
| D4 | 黑胡子的舵轮 | `relic_blackbeard_wheel.webp` | A ship's wheel of dark oak with eight spokes, one spoke carved with a crude skull, brass hub green with verdigris, a broken rope wrapped around the rim. |
| D5 | 陈祖义的铁锚 | `relic_zhenghe_anchor.webp` | A massive iron anchor of Chinese pattern (two arms, wooden stock missing), cast with a worn Chinese character on the shank, heavily rusted, half sunk in river silt. |
| D6 | 马尼拉大帆船的罗盘 | `relic_galleon_compass.webp` | An open brass compass box with hinged lid, the glass intact, needle still pointing north on a faded card, engraved but illegible markings, on wet planking. |
| D7 | 海妖的肋骨 | `relic_kraken_rib.webp` | A single enormous curved white bone, larger than a mast, rising out of dark water at an angle, water streaming off it, kelp clinging to the curve. |
| D8 | 塞壬的七弦琴 | `relic_siren_lyre.webp` | A half-preserved lyre with a soundbox carved from a conch shell, three of seven gut strings still strung, the frame of pale driftwood, resting on wet rock. |
| D9 | 迪亚士的石十字 | `relic_dias_padrao.webp` | A waist-high stone cross pillar, wind-eaten and bleached white, half the carving gone, standing on a wet rock ledge with surf breaking behind it. |

**这一组不要什么**：`no human figure, no hand, no diver, no modern diving gear, no color-saturated render, no floating UI, no text or plaque.`

---

# E 组 · 传说（5 张，16:9 海域奇观）

> 传说和图鉴里"听说过但还没找到"的东西绑在一起。这批的目标是
> **"一张图能让人相信这片海上有这个传说"** —— 不是画怪物，是画"那一刻的海"。
> 尺寸同港口（≥1792×1024），因为会用在整屏。

| # | 传说 | 目标文件 | 画面要点 |
|---|---|---|---|
| E1 | 圣布伦丹岛 | `legend_sao_brandao.webp` | 云开一线，一座不该存在的小岛浮在海平线上，岛上只有草与一座石亭；前景是船头，不要把岛画大。 |
| E2 | 不老泉 | `legend_fountain_youth.webp` | 比米尼浅滩，清澈见底的淡水泉眼在海底翻涌，一圈圈扩散；棕榈倒影；一个人也没有（让玩家自己想象）。 |
| E3 | 海厄布拉 | `legend_hy_brasil.webp` | 浓雾里浮出一段海岸线，只看得见轮廓与浪，雾后什么都没有；**海岸要半透明**，像要被雾擦掉。 |
| E4 | 飞行的荷兰人 | `legend_flying_dutchman.webp` | 风暴里一艘三桅帆船，帆是破的、透着光，船身发暗；**它不朝观者驶来**，也没有航向（侧向/背向）；船周围的海面异常平静。 |
| E5 | 归墟 | `legend_guixu.webp` | 海面平得像一块铁，没有一丝浪；远处一条模糊的界线下沉，罗盘针明显偏斜（画一块放在船舷上的罗盘）；天空无云、颜色发青。 |

**这一组不要什么**：`no monster, no tentacles, no ghost with a face, no glowing magic, no fantasy sky with two moons, no text, no labels, no frame.`
风格锚同上（彩色油画），但天空可以更"过曝"一点 —— 传说要有一点点不像真的。

---

# F 组 · 云（3 张，透明 PNG）

> 3D 甲板与 3D 海图共用 3 张 768² 的静态云贴图，放大偏软。
> 这一组只要 3 张，但**必须带 alpha**。

**要求**（不是 prompt，是硬约束）：

```
Three separate cumulus cloud sprites on a pure transparent background,
photographed from slightly below, illuminated from the upper left,
soft grey undersides with warm white tops, ragged edges, no sky, no horizon,
no birds, no aircraft, no rain shafts.
```

| # | 目标文件 | 形态 |
|---|---|---|
| F1 | `cloud_01.png` | 厚积云，中心密实、边缘破碎（主用） |
| F2 | `cloud_02.png` | 横向拉长的层积云，上下薄（远处用） |
| F3 | `cloud_03.png` | 高耸的积雨云顶部，下缘平（坏天气用） |

- 尺寸 **1536×1536 PNG**（现在 768²，翻倍就够）；
- 若生成器出不了透明底，**给纯黑底**（`on pure black background`），
  我们代码里用 `screen`/`lighter` 混合，黑底等于透明 —— 但要**整片纯黑**，不能有灰雾。
- **不要**：`no sky gradient, no sun disc, no birds, no text.`

---

# G 组 · 预测：后面可能会用到（先别急着画）

> 这一节是**给你判断要不要现在做**的。每条都写了"什么时候会用到"和"做一张要多少成本"。
> 按项目现在的进度，A/B/C 三组做完，视觉上就没有明显缺口了。
> 下面这些是"如果还要再往前走一步"才需要的。

### G1. 港口夜景（21 张，成本最高）

- **什么时候用**：如果以后做"夜航/夜间靠港"，岸上视角换成夜景版。
- **怎么省**：不要单独画 21 张夜景 —— 让代码加一层夜幕 + 灯火（现在已经有一套
  `harborMood` 的夜幕层，白天/黄昏/夜三档），只补"窗户灯光"的贴图更划算。
- **结论**：**不建议画**。

### G2. 天气变体（雨/雾/风暴，各 3~5 张）

- **什么时候用**：如果岸上要按当前天气换背景。
- **怎么省**：同上，靠现有的雨/雾层叠加（`harbor-rain` / `harbor-fog` 已经做了）。
- **结论**：**不建议画**。

### G3. 货物图（10 种商品，1:1）

- **什么时候用**：贸易面板现在是纯文字行，如果以后想给每种货配一张小图。
- **成本**：10 张小图，最便宜的一组。
- **结论**：**可以画**，但优先级排在 E 组之后。

### G4. 四阵营纹章（4 张）

- **现在**：`public/assets/ui/faction_*.svg` 是手写 SVG，能用。
- **什么时候换**：如果想让纹章更"手绘感"。
- **结论**：**不必**（SVG 已经和界面百分百对齐，换位图反而要考虑描边与缩放）。

### G5. 结局背景（现在 3 张通用：胜/败/标题）

- **什么时候用**：如果想让五国各有一张结局画（"大明的结局"和"西班牙的结局"不一样）。
- **成本**：5 张 1920×1080。
- **结论**：**可做可不做**，做完提升明显但会带来"结局文案也得跟着分国"的连锁改动。

### G6. 港口"夜灯"贴图（21 张小的，或 1 张图集）

- **什么时候用**：夜里的岸上要有一格格亮起来的窗。
- **成本**：中（要么 21 张小图，要么 1 张 2048² 图集）。
- **结论**：**等 G1 真要做的时候一起做**。

### G7. 地图边缘装饰（海怪 / 帆船 / 罗盘玫瑰 / 花体标题）

- **什么时候用**：2D 海图的四角现在是空的，如果想让海图更像一张"古图"。
- **成本**：低（4~8 个棕褐线描小件）。
- **结论**：**可以画，但要沿用第一批的棕褐铜版锚点**（不是彩色油画），
  否则和海图的羊皮纸底打起来。

---

# 9. 生成后自检（每次都要过一遍）

把图拖进页面之前，先核这七条。**任何一条不过就不要换上去**。

1. **尺寸** ≥1536×864（A/B/C/E 组）；云 ≥1024²。
2. **主体在中带**：把图裁成 2.4:1 的中间条看一眼 —— 港口轮廓、塔、船还在不在？
   裁完只剩天空或只剩水，说明主体位置错了，重画。
3. **底部 15% 是空的**：水面、沙、码头石板都行，**不能有主体或大块高光**。
   这一带会被我们自绘的石砌码头盖住。
4. **没有文字**：招牌、船名、旗帜徽记、水印、签名 —— 一个都不能有。
   （AI 很容易在招牌上写乱码，放大看一定会看到。）
5. **建筑体系对**：用 negative 里的关键词反查一遍 ——
   有没有弯檐（chofa）、佛塔（prang/chedi）、洋葱穹顶、穹顶大教堂、日式天守？
   错一个就是"广州被画成暹罗"那类事故。
6. **色调和现有图并排看不出来源不同**：把新图和 `port_seville.webp` 放一起看。
   一张冷灰、一张暖橙就不行 —— 现有 17 张都是"暖金 + 深绿 + 朱红瓦"的调子。
7. **体积** ≤600KB（用 `cwebp -q 72` 转）。

## 落盘之后

```bash
# 1) 放好大图（public/assets/ports/xxx.webp）
# 2) 重新派生图鉴用的 400×225 小图
"C:/Users/Brunson/miniforge3/python.exe" scripts/make_port_thumbs.py
# 3) 跑单测（会校验每张图 400×225、≤40KB、与大图同名）
npm test
# 4) 构建
npm run build:clean
```

代码侧还要动两处（在 `src/data/portImages.ts`）：

- `PORT_SPECIFIC`：面板小图用哪张（`[港口 id]: '文件名前缀'`）
- `HARBOR_BACKDROP_BY_ID`：岸上整屏用哪张（**这批做完后，21 个港都能填上**）

---

# 10. 一句话总结优先级

| 优先级 | 组 | 张数 | 做完之后 |
|---|---|---|---|
| **P0** | A 组（广州/塞维利亚/里斯本/哈瓦那/马六甲） | 5 | 开局第一眼和最常见航线的岸上整屏不再是糊的 |
| **P1** | B 组（拆开共用图） | 10 | 21 港几乎一港一画，"跑一圈只看过 5 张图"彻底结束 |
| **P1** | E 组（传说） | 5 | 图鉴里"听说过但没找到"的东西有脸了 |
| **P2** | C 组（非洲/东非） | 4 | 印度洋航线不再是三张图轮播 |
| **P2** | D 组（遗物） | 9 | 图鉴「海上遗物」那 9 格不再是 9 个一样的罗盘图标 |
| **P3** | F 组（云） | 3 | 天空不再是一张贴图放大 |
| 看情况 | G 组（预测） | — | 见各条结论，多数建议**不画** |
