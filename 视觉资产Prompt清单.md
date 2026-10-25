# 《大航海时代》视觉资产生成 Prompt 清单

> 用途：游戏目前所有画面都是代码绘制的 SVG，质感已到上限。本清单列出 **51 项**建议用最强 GPT 图像模型生成的资产，每条都给好完整英文 prompt、尺寸、是否透明背景、存放路径。生成后按文末《接入方式》挂进项目即可生效。
>
> 建议工具：GPT-4o 图像生成（本清单 prompt 按其偏好优化：主体+风格+构图+光照一次说清，不依赖 MJ 参数语法）。若用 Midjourney，可在末尾加 `--ar 1:1 --style raw` 等参数。

---

## 0. 通用规则（先读这段）

### 0.1 风格锚点（每条 prompt 末尾都已内嵌，勿单独再贴）

```
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting
```

### 0.2 通用负面提示（工具支持时粘贴）

```
modern elements, photorealistic, 3d render, anime, cartoon, blurry,
low quality, text, watermark, signature, frame, border, oversaturated
```

### 0.3 输出与命名规范

| 类型 | 格式 | 尺寸 | 透明背景 |
|---|---|---|---|
| 舰船精灵 / 图标 / 边框 | PNG | 512×512（大场景 1024×1024） | **是** |
| 港口横图 / 事件场景 | PNG 或 WebP | 1600×900 / 1200×675 | 否 |
| 人物肖像 | PNG | 512×640 | 羊皮纸底即可 |
| 纹理 tile | PNG | 1024×1024 | 视用途 |

命名统一小写+下划线，存放到 `public/assets/`：
`ship_caravel.png` / `port_caribbean.png` / `event_storm.png` / `crew_boatswain.png` / `ui_frame_gold.png` …

### 0.4 生成后自检（每批必查）

1. **透视一致**：所有舰船必须是同一角度（3/4 俯视），混入正俯视或侧视会在地图上很突兀
2. **色板一致**：褐棕 `#5C2E0A`、金 `#D4A838`、羊皮 `#D4B884`、深海蓝 `#1A3A52`——偏差大的重新生成或后期统一
3. **透明背景干净**：精灵边缘无白边、无残影（GPT 直出常有毛边，需抠图工具过一遍）
4. **无水印无字**：GPT 有时会自己加文字，检出即重生成

---

## A. 舰船精灵（4-6 张，最高优先级）

> 用途：替换 `src/components/map/ShipAnimation.tsx` 里的内联 SVG 船身。地图上玩家每天看着的就是它。
> 角度要求：**3/4 俯视（top-down three-quarter view），船头朝正上方**，方便代码按航向旋转。

### A1. 卡拉维尔帆船（玩家初始船"圣玛利亚号"）

```
A 15th-century Portuguese caravel sailing ship, three-masted with lateen
triangular sails, high stern castle, wooden hull with visible plank lines
and copper trim, cream-colored canvas sails slightly bellied by wind.
Top-down three-quarter view, ship bow pointing straight up, centered,
full hull visible, game-sprite composition.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
Transparent background, no shadow, no text, no watermark.
```

### A2. 盖伦帆船（大型商船/战舰，买船后的视觉升级）

```
A massive 16th-century Spanish galleon, four masts with square-rigged
sails, towering stern and bow castles, rows of gun ports along the hull,
dark weathered oak hull with gold decorative trim, bulky cargo-ship silhouette.
Top-down three-quarter view, bow pointing straight up, centered, game-sprite.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette, fine line hatching texture,
slightly weathered parchment feel, painterly but precise,
dramatic warm rim lighting. Transparent background, no text, no watermark.
```

### A3. 单桅快船（灵活小船，贸易/侦察用）

```
A small 16th-century single-masted sloop, one tall mast with a single
mainsail, sleek narrow hull, open deck with a tiny cabin aft, fast and
agile silhouette, light brown hull with a red stripe.
Top-down three-quarter view, bow pointing straight up, centered, game-sprite.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
Transparent background, no text, no watermark.
```

### A4. 护航舰（frigate，中后期主力）

```
A 16th-century frigate, two masts with square sails, long sleek hull
built for speed, a row of gun ports, dark green-black hull with gold
figurehead, white sails with a small blue stripe.
Top-down three-quarter view, bow pointing straight up, centered, game-sprite.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
Transparent background, no text, no watermark.
```

### A5. 幽灵船变体（幽灵船事件用，半透明+绿灯）

```
A ghostly derelict 16th-century caravel, tattered torn sails glowing
faintly pale green, translucent hull as if made of sea mist, barnacles
and trailing seaweed, an eerie cold glow around the rigging.
Top-down three-quarter view, bow pointing straight up, centered, game-sprite.
16th-century hand-engraved copperplate nautical chart aesthetic,
sepia palette poisoned with sickly green glow, fine line hatching,
painterly but precise. Transparent background, no text, no watermark.
```

### A6. 海盗黑旗船变体（敌对遭遇/ rivalry 用）

```
A menacing 16th-century pirate ship, black tattered sails with a skull
and crossed bones flag, reinforced ramming bow, dark red-brown hull with
bronze cannons visible on deck, battle-worn and scorched.
Top-down three-quarter view, bow pointing straight up, centered, game-sprite.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia palette darkened with crimson accents, fine line hatching,
painterly but precise, dramatic rim lighting.
Transparent background, no text, no watermark.
```

---

## B. 海面与环境纹理（3 张）

### B1. 海面波浪无缝 tile

```
Seamless tileable texture of open-ocean surface seen from above,
stylized engraving-style waves with fine cross-hatch linework,
deep teal-blue water with lighter foam crests, subtle gold light
reflections, flat and even lighting so the tile repeats invisibly.
Vector-clean edges, no horizon, no objects.
16th-century hand-engraved nautical chart aesthetic, no text.
```

### B2. 深海远眺（大尺度航行时的水域底）

```
Top-down stylized deep ocean texture, gradient from deep navy to
lighter teal, sparse engraved wave lines and a few whitecap clusters,
vast empty water with a sense of scale, calm and slightly ominous.
16th-century hand-engraved nautical chart aesthetic, no text.
```

### B3. 云层 tile（天气系统叠层用）

```
Seamless tileable cluster of stylized 16th-century engraving-style
cumulonimbus clouds, warm grey and parchment tones with dark underbellies,
flat composition suitable as an overhead weather overlay, no ground, no birds.
No text.
```

---

## C. 港口横图（5 张，港口面板头图）

> 用途：`src/components/panels/PortDetail.tsx` 顶部按区域显示。1600×900，横向构图，**底部 1/3 压暗**方便叠文字。

### C1. 加勒比港口

```
A bustling 16th-century Caribbean harbor at golden hour, turquoise water,
white-sand shore, Spanish colonial pastel buildings with red-tile roofs,
sugar barrels and crates on the dock, palm trees, small caravels at anchor,
warm cinematic lighting, lively merchant atmosphere, no people in focus.
Period-accurate 1500s architecture, painted in a rich engraved-illustration
style with warm sepia and gold palette, no text, no watermark.
```

### C2. 西非港口

```
A 16th-century West African trading harbor at dawn, ochre earth and
rust-red cliffs, dugout canoes and a Portuguese caravel at the wharf,
ivory tusks, spices and indigo cloth bales on the dock, baobab trees
on the skyline, dusty warm light, dignified trading atmosphere.
Focus on harbor labor and trade goods only. Period-accurate,
engraved-illustration style, warm sepia palette, no text, no watermark.
```

### C3. 东南亚港口

```
A 16th-century Southeast Asian spice port in humid morning mist,
wooden stilt houses, a Chinese junk with battened sails beside a
Portuguese caravel, sacks of pepper and cinnamon on the wharf,
a golden Buddhist stupa on a green hill, monsoon clouds breaking open.
Engraved-illustration style, warm sepia palette with jade accents,
no text, no watermark.
```

### C4. 北欧港口

```
A cold 16th-century Hanseatic North Sea harbor, brick gabled warehouses,
herring boats with red sails, cobblestone quay with barrels and coiled rope,
grey-blue sky with a pale sun, gulls, crisp cold light, sober merchant mood.
Engraved-illustration style, desaturated sepia and slate palette,
no text, no watermark.
```

### C5. 伊比利亚母港（塞维利亚，玩家启航地）

```
The harbor of Seville in the 1500s, the great cathedral and Golden Tower
on the riverbank, a fleet of caravels preparing to sail, crates and
rigging on the busy quay, warm southern light, a sense of departure
and adventure. Engraved-illustration style, warm sepia and gold palette,
no text, no watermark.
```

---

## D. 事件场景大图（10 张，事件卡顶部插图）

> 用途：`src/components/events/EventScene.tsx` 按 sceneKey 显示。1200×675，横向，构图**上重下轻**，底部留给事件文字。

### D1. 风暴之夜 `event_storm`

```
A tiny 16th-century caravel struggling in a violent night storm,
towering black waves, lightning cracking across a purple-black sky,
torn sails lashing, spray flying, dramatic and terrifying.
Engraved-illustration style, dark sepia palette with cold blue lightning,
fine line hatching, no text.
```

### D2. 海盗接舷战 `event_pirate`

```
A 16th-century pirate boarding action at sea, a black-sailed ship pulling
alongside a merchant caravel, grappling hooks, torches and muskket smoke,
cutlasses raised, chaotic and violent, golden firelight against dark water.
Engraved-illustration style, warm sepia palette with crimson and fire
accents, no text.
```

### D3. 海怪 `event_kraken`

```
An enormous kraken rising from the sea beside a 16th-century caravel,
giant tentacles covered in barnacles wrapping around the hull, waves
displaced by its body, sailors tiny on deck, ancient and unknowable horror.
Engraved-illustration style, deep sepia and ocean blue palette,
fine hatching texture, no text.
```

### D4. 幽灵船 `event_ghost`

```
A translucent ghost ship materializing in thick sea fog at night, tattered
sails glowing pale green, a single lantern burning on its stern, an eerie
calm, the living ship watching from a distance.
Engraved-illustration style, sepia palette poisoned with sickly green,
no text.
```

### D5. 火山海岸 `event_volcano`

```
A volcanic island coast erupting at dusk, lava rivers pouring into the sea
in hissing steam, black ash falling like snow, a caravel fleeing the
burning shoreline, apocalyptic orange glow against ash-grey sky.
Engraved-illustration style, sepia palette with molten orange accents,
no text.
```

### D6. 浓雾 `event_fog`

```
A silent sea wrapped in heavy fog, only the vague silhouette of an
unknown shoreline and a half-seen ship ahead, muted and mysterious,
almost abstract, a sense of held breath.
Engraved-illustration style, pale sepia and grey palette, minimal contrast,
no text.
```

### D7. 港口庆典 `event_festival`

```
A 16th-century harbor festival at night, colorful pennants, bonfires on
the beach, dancing silhouettes, fireworks over the water, a caravel
decorated with lanterns in the foreground, joyful and warm.
Engraved-illustration style, warm sepia palette with gold and crimson
accents, no text.
```

### D8. 沙滩藏宝 `event_treasure`

```
A moonlit beach at low tide, a half-buried wooden chest spilling gold
coins and jewels, an old map with a red X, palm shadows, a shovel stuck
in the sand, treasure-hunt excitement, cool silver moonlight with warm
gold highlights.
Engraved-illustration style, sepia palette with strong gold accents,
no text.
```

### D9. 塞壬礁石 `event_siren`

```
Beautiful but dangerous sirens on wet black rocks in moonlit shallows,
singing to a passing caravel, half-woman half-fish silhouettes half-hidden
in spray, hypnotic and ominous, silver moon path on the water.
Engraved-illustration style, sepia palette with silver-blue moonlight,
no text.
```

### D10. 走私夜港 `event_smuggle`

```
A secret night transaction in a secluded cove, a small unlit boat meeting
a caravel under a new moon, a single hooded lantern, crates moving
silently, watchful shadows, tense and conspiratorial.
Engraved-illustration style, dark sepia palette with one warm lantern
glow, no text.
```

---

## E. 人物肖像（14 张）

> 用途：FleetPanel 名船员栏、PortDetail 码头寻访、结局"后世记载"。512×640，**半身像（chest-up）**，羊皮纸色底，视线朝向画面外（像在看着玩家）。以下每条只需把「外貌锚点」段替换进模板。

### 模板

```
A chest-up engraved portrait of {DESCRIPTION}, facing the viewer,
wearing {CLOTHING}, holding {PROP}, weathered face with {DETAIL},
warm neutral parchment background, visible cross-hatching linework.
16th-century copperplate engraving aesthetic, warm sepia and antique
gold palette, dramatic side lighting, painterly but precise.
No text, no watermark, no frame.
```

### E1-E8. 八位名船员（外貌锚点）

| # | 角色 | DESCRIPTION / CLOTHING / PROP / DETAIL |
|---|---|---|
| E1 | 水手长 老汤姆 | a grizzled 50-year-old boatswain / salt-stained navy coat, striped shirt / a coiled rope over one shoulder / a scarred cheek and kind tired eyes |
| E2 | 炮手 独眼玛格 | a broad-shouldered woman gunner in her 40s / leather apron over a red blouse / a lit slow-match and cannonball / a black eyepatch and a confident grin |
| E3 | 账房先生 | a thin, meticulous purser in his 30s / dark wool doublet and spectacles / an open ledger and quill / ink-stained fingers, worried eyebrows |
| E4 | 随船神甫 | a gentle grey-haired chaplain in his 60s / simple brown robe with a rope belt / a worn Bible and a wooden cross / a serene, listening expression |
| E5 | 学者 伊莲 | a sharp-eyed young woman scholar / practical travelling dress with a canvas satchel / a brass astrolabe and a star chart / curious, intent gaze |
| E6 | 厨子 大班 | a stout cheerful cook in his 40s / white apron stained with spices / a ladle and a hanging ham / a wide smile and flour on his nose |
| E7 | 见习航海士 小少爷 | a pale teenage midshipman in a new officer's coat / a brass telescope under one arm / eager, slightly nervous expression |
| E8 | 黑旗向导 | a weathered ex-pirate guide in his 50s / a tricorn hat and a black silk sash / a dagger and a tattered chart / a distrustful sideways glance |

### E9-E11. 三位军官

| # | 角色 | 锚点 |
|---|---|---|
| E9 | 老领航员 | a lean white-bearded old pilot in his 70s / a heavy hooded cloak / a dividers and a parchment chart / knowing, far-looking eyes |
| E10 | 大副 | a muscular first mate in her 30s / a crisp naval coat with gold buttons / a speaking trumpet / a stern appraising stare |
| E11 | 船医 | a sober surgeon in his 50s / a dark green apron and rolled sleeves / a saw and a bottle of rum / a resigned but steady gaze |

### E12-E14. 三位竞争船长

| # | 角色 | 锚点 |
|---|---|---|
| E12 | "黑帆"杰克 | a flamboyant pirate captain in his 30s / a black tricorn with a red plume, many pistols in a sash / a raiding cutlass / a roguish grin |
| E13 | "白银"玛丽亚 | an elegant merchant captain in her 40s / a silver-trimmed burgundy coat / a ledger seal and a pearl necklace / a cool calculating smile |
| E14 | "星眸"迭戈 | an intense explorer navigator in his 30s / a sun-bleached blue coat and a brass eyepiece / a sextant / dreamy eyes fixed on the horizon |

---

## F. UI 装饰素材（6 张）

### F1. 羊皮纸卡片底 `ui_parchment`

```
A clean sheet of aged parchment, warm cream-tan with subtle mottling
and slightly darker deckled edges, very subtle fiber texture, flat
enough to read text over, no folds, no writing, no stains.
Top-down, even lighting, no text.
```

### F2. 金质华丽边框 `ui_frame_gold`

```
An ornate symmetrical baroque picture frame made of Antique gold,
engraved with rope motifs and compass roses, corners heavily decorated,
center completely empty, straight-on front view, on transparent background.
No text, no glass, no picture inside.
```

### F3. 罗盘玫瑰特写 `ui_compass_rose`

```
A magnificent 16th-century compass rose, 32 points in gold and deep
brown on aged parchment, fleur-de-lis north marker, concentric degree
rings, fine engraving hatching, perfectly symmetrical, flat top-down.
No text, no letters.
```

### F4. 横幅缎带 `ui_banner`

```
A flowing golden ribbon banner with a rich crimson underside, elegant
folds, center smooth and empty for text, symmetrical, front view,
transparent background, engraved-illustration style. No text.
```

### F5. 三角旗串 `ui_pennants`

```
A string of colorful triangular pennant flags in crimson, gold, navy
and cream, gently swaying, draped across the top of the frame,
transparent background, festive nautical feel. No text.
```

### F6. 成就奖章 `ui_medal`

```
A golden laurel-wreath medal with a star center and a small engraved
ship emblem, front view, symmetrical, slight metallic sheen, transparent
background. No text, no numbers.
```

---

## G. 天气覆盖层（3 张，半透明叠加）

### G1. 雨丝层 `fx_rain`

```
A seamless tileable overlay of stylized diagonal rain streaks, thin
semi-transparent white-blue lines on transparency, light drizzle
density, flat graphic quality for screen-blend overlay.
No background, no objects.
```

### G2. 雾图层 `fx_fog`

```
A seamless tileable soft fog overlay, large translucent grey-cream
blobs with feathered edges, very low contrast, meant to be layered
over any scene at partial opacity. No objects.
```

### G3. 浪花飞沫 `fx_spray`

```
A cluster of white sea spray and foam droplets frozen in air,
translucent and airy, small droplets catching light, transparent
background, dynamic splash shape. No objects.
```

---

## H. 标题与结局背景（3 张，1920×1080）

### H1. 主标题背景 `bg_title`

```
A night harbor under a brilliant starfield with a large moon, a fleet
of 16th-century caravels silhouetted on calm water, warm lantern lights
along the quay, vast empty dark sky in the upper two-thirds for title
text, epic and inviting. Engraved-illustration style, deep blue and
gold palette, no text, no people.
```

### H2. 胜利结局背景 `bg_victory`

```
Golden dawn over a home harbor, a triumphant fleet sailing in with full
sails, seagulls, warm rays of sunlight breaking through clouds,
celebration and peace. Engraved-illustration style, bright gold and
sepia palette, upper area calm for text, no text, no people.
```

### H3. 失败结局背景 `bg_defeat`

```
A storm-lashed sea at dusk with the broken silhouette of a sinking
ship, splintered mast, dark heavy clouds parting for one cold shaft
of light, somber and majestic. Engraved-illustration style, dark sepia
and slate palette, upper area calm for text, no text, no people.
```

---

## 附 1：批量生成的一致性守则

1. **同批次只改主体**：每条 prompt 的风格锚点完全一致，只替换主体描述——这是保持全套资产"像同一个画师画的"的关键
2. **固定参考图**：若工具支持风格参考/种子，用 A1 的结果作为后续所有舰船的风格锚
3. **色板校正**：生成完后用任何图片工具做一层"统一色调"（可选）：高光偏金 `#D4A838`、暗部偏褐 `#5C2E0A`
4. **命名即契约**：按下表命名，代码侧按名取图，改名即断链

| 文件名 | 用途 | 代码挂点 |
|---|---|---|
| `ship_caravel.png` 等 6 张 | 地图舰船 | `ShipAnimation.tsx` |
| `port_*.png` 5 张 | 港口面板头图 | `PortDetail.tsx` |
| `event_*.png` 10 张 | 事件场景 | `EventScene.tsx`（sceneKey 映射） |
| `crew_*.png` / `officer_*.png` / `rival_*.png` | 人物肖像 | `FleetPanel.tsx` / `PortDetail.tsx` / 结局屏 |
| `ui_*.png` 6 张 | 界面装饰 | `ParchmentCard.tsx` / 横幅 / 成就面板 |
| `fx_*.png` 3 张 | 天气叠层 | `WeatherFx.tsx` |
| `bg_*.png` 3 张 | 标题/结局 | `IntroScreen.tsx` / 结局屏 |

## 附 2：接入代码示例（生成后照此挂载）

**舰船精灵**（`ShipAnimation.tsx`，替换内联 SVG）：

```tsx
const SHIP_IMG: Record<string, string> = {
  caravel: '/Age-of-Discovery/assets/ship_caravel.png',
  galleon: '/Age-of-Discovery/assets/ship_galleon.png',
  sloop: '/Age-of-Discovery/assets/ship_sloop.png',
  frigate: '/Age-of-Discovery/assets/ship_frigate.png',
}
// icon html 内改用 <img src="${SHIP_IMG[type]}" style="width:70px;transform:rotate(...)">
```

**事件场景**（`EventScene.tsx` 注册表加映射）：

```tsx
const SCENE_IMG: Record<string, string> = {
  storm: '/Age-of-Discovery/assets/event_storm.png',
  pirate: '/Age-of-Discovery/assets/event_pirate.png',
  kraken: '/Age-of-Discovery/assets/event_kraken.png',
  // ...
}
// 有图优先用图，无图回退现有 SVG
```

**天气叠层**（`WeatherFx.tsx`，雨/雾用 CSS 叠加）：

```css
.weather-rain { background: url('/Age-of-Discovery/assets/fx_rain.png') repeat; opacity: .35; mix-blend-mode: screen; }
```

> 路径前缀 `/Age-of-Discovery/` 由 vite.config.ts 的 `base` 决定，勿漏。

---

*清单版本：v5 配套 · 51 项 · 预计生成工作量：约 2-3 小时（含挑选与抠图）*

---

## 附 3：素材接收流程（图片下载后怎么做）

图片统一进 `C:/Users/Brunson/Downloads`，**文件名不带语义**，按本清单顺序生成、
按生成时间（文件修改时间）对号入座。台账与工具已就绪：

```bash
# 1. 看新到了哪些图、按顺序各自对应哪个 ID
python scripts/intake_assets.py scan

# 2. 肉眼确认无误后认领（文件名可只写唯一片段）
python scripts/intake_assets.py assign "ChatGPT 图像 2026年10月23日 22_05_14-2.png" A3

# 3. 处理（抠底/切分/压尺寸）并接入组件后记账
python scripts/intake_assets.py done A3 --to public/assets/ships/sloop.png --note "单桅红棕船，去底"

# 随时查看总进度
python scripts/intake_assets.py order
```

- 台账：`.workbuddy/asset-intake.json`（每个 ID 的源文件、生成次数、接入路径、备注）
- 已入账：A1-A6（六艘图鉴透明版切分 + 4 张单船图去底，见台账备注）
- 作废记录：白底的「六艘传奇帆船图鉴-2」「四艘精绘帆船编队」已在台账标记作废，勿重复接入
- 舰船类处理脚本：`scripts/slice_ships.py`（棋盘格去除 + 切分 + 限高，可复用同参数处理新船图）

---

## 附 4：2026-10-23 天候系统上线后的变更

- **B1-B3 海面纹理：已有程序化占位版**。`scripts/gen_sea_texture.py` 生成了两张无缝
  平贴图（`public/assets/sea/sea-tile.png` 常规 / `sea-tile-storm.png` 暴风雨加深版），
  已接入地图底图并随天气切换。**B 组可以跳过**；若仍想要 GPT 手绘质感更强的版本，
  生成后替换这两个文件即可（注意保持可平铺或改用大尺寸单图）。
- 新增天候玩法（晴/阴/雨/风暴/雾，见 `src/utils/weather.ts`）：影响航速、事件概率、
  船体磨损、士气、雾天瞭望半径；罗盘下方常驻天气徽章可展开三日预报；
  出航计划弹窗也有预报条——"等一个顺风天再走"成为正式决策。

---

## 附 5：2026-10-24 第二批素材已接入（E 组 + D5-D10）

**「航海时代十四人角色图鉴-2.png」→ E 组全部 14 张肖像**（`public/assets/portraits/e01-e14.png`）
- 已按职能对位接入：8 名船员（招募页+舰队"船上的人"栏）、3 名军官（酒馆招募页）、
  3 位竞争船长（航海见闻面板）——每处都是缩略图 + 姓名头衔
- ⚠️ GPT 自行改写了角色命名（图内标签：水手长老师傅/红发月玫/账房先生/随船神甫/航海士/
  航医/船匠/炮术军官/见习水手/大厨/翻译官/向导/商人/探险家），映射按"职能视觉对位"，
  记录在 `src/data/portraits.ts` 头部注释；想换肖像只改这一个文件
- 备选：另一张「航海时代船员肖像图鉴-1.png」（另一套 14 人命名，含巴尔博萨/德拉克）
  已标记为 spare，若想给竞争船长换更霸气的肖像可再切分

**「六幕海上传奇.png」→ D5-D10 六张事件场景**（`public/assets/scenes/d05-d10.png`）
- 按 sceneKey 接入：火山海岸→volcano / 浓雾海域→fog / 港口庆典→festival /
  沙滩藏宝→treasure / 塞壬礁石→siren / 走私夜港→smuggle
- EventScene 优先渲染真实插图，加载失败自动回退手绘 SVG
- 顺带把 A5/A6 幽灵船、海盗船精灵叠进了对应事件场景（右侧驶入 + 幽灵绿光）

**还缺**：C 组港口横图、F 组 UI 装饰、G 组天气层、H 组结局背景。
（D 组事件场景 10/10 已全部接入，见附 6。）

---

## 附 6：2026-10-24 第三批素材已接入（D1-D4 事件大场景）

**「Age_of_Discovery_events_D1-D4」文件夹 → D1-D4 四张事件场景**（`public/assets/scenes/d01-d04.png`，各 1200×675）
- 按 sceneKey 接入：风暴之夜→storm / 海盗接舷战→pirate / 海怪→kraken / 幽灵船→ghostship
- D 组事件场景至此 10/10 全部有真实插图；未覆盖的 sceneKey（顺风/哗变/海市蜃楼等）仍走手绘 SVG
- ⚠️ 质量声明（README 原文）：本批从 AI 生成的多事件合成图中提取画面，经背景延展、柔化融合和放大输出，
  **并非逐张原生 1200×675 生成**；上下缘为延展模糊背景、底部加暗供叠事件文字——
  恰好匹配 EventScene 400:140 容器 object-cover 的取中段裁切，作为事件视觉已够用，
  但不等于通过高清验收的最终资产，日后可用原生高清版整体替换 d01-d04
- 配套改动：D2 海盗 / D4 幽灵船插画本身已含船体，移除了原先叠在 SVG 上的
  A5/A6 船精灵遮罩层（`SCENE_PROPS`），避免真图上重影；地图上的幽灵/海盗船标记不受影响
- 接收方式升级：这批是文件夹整包交付（含 README + preview 封面），`scripts/intake_assets.py`
  的 scan/find_download 已支持下探三层子目录并跳过 preview 封面图

---

## 附 7：2026-10-24 第四批素材已接入（E1-E14 肖像全集，取代图鉴切片）

**「Age_of_Discovery_portraits_E1-E14_complete」→ 14 张独立单人像**（`public/assets/portraits/`，各 512×640 RGBA）
- 用规范编号语义文件名：`crew_boatswain / crew_gunner / crew_purser / crew_chaplain / crew_scholar /
  crew_cook / crew_midshipman / crew_blackflag_guide / officer_pilot / officer_first_mate /
  officer_surgeon / rival_black_sail_jack / rival_silver_maria / rival_stareyed_diego`
- `src/data/portraits.ts` 全部 14 个槽位改指新文件；图鉴切片 e01-e14 留盘备用（回退只改这一个文件）
- 相比切片的改进：分辨率翻倍、无底部"E14 探险家"式横幅、编号与清单 E1-E14 一一对应、
  三处 UI（PortDetail 44×64 / FleetPanel 28×40 / RivalPanel 40×56，均 object-cover object-top）无需改动
- ⚠️ 质量声明（GPT README + batch_notes）：全部为 AI 合成画面裁切放大，**非原生高清，测试占位级**；
  E10 大副是女性船医造型占位（清单要求海军制服+传声筒，优先返工）、E8 与 E1 造型接近辨识度低、
  E13 玛丽亚偏海盗风、E14 迭戈持望远镜非六分仪；E1-E9 各有小道具偏差。正式发布前逐张精修。
- 另收到早期分批包 `Age_of_Discovery_portraits_E9-E12`（仅四张），与全集内同名文件 md5 一致，已合并

---

## 附 8：2026-10-24 第五批——A-H 全集包对账与接入（50/50）

**「Age_of_Discovery_visual_assets_A-H_50」= 此前八个分包 + 全新 H 组的汇编**（manifest.json 带全部 SHA-256）。

**对账结论（md5 逐件比对）**：
- 纯重新打包（无需动作）：E 组 14 肖像、D1-D4 事件、F 组 compass_rose/frame_gold/parchment
- **升级换入**：
  - A 组 6 船 → 512² **俯视平面图**（舰艏朝上）取代图鉴侧视切片。旧侧视切片配 `bearing-90`
    旋转在地图上会"侧飞"，俯视图与该旋转逻辑正确匹配；四个变体（galleon_war 等）留作备用
  - D5-D10 → 1200×675 去标签版取代 840×315 图鉴切片（d01-d10 现全部同规格）
  - B 组海面 → ocean_waves/ocean_deep 实测接缝差 0.00/0.15，**真无缝**，取代程序生成的
    sea-tile（暴风季换 deep 深色海面）；程序生成器 scripts/gen_sea_texture.py 退役留档
- **全新接入**：
  - C 组 5 港口场景图（1600×900）→ PortDetail 头部"到港第一眼"，按区域+建筑风格对位 20 港
    （伊比利亚三港共用塞维利亚图、北欧两港共用北欧图，见 `src/data/portImages.ts`）
  - G 组 4 天气层 → WeatherFx：云层（阴/雨/风暴漂移）、真雨丝纹理（雨/风暴下滚）、
    雾团（浓雾横漂）、浪花飞沫（风暴贴海面呼吸），与既有 CSS 氛围层叠加
  - H 组 3 结局背景（1920×1080）→ IntroScreen 标题衬底、gameover 胜利（夕阳凯旋）/
    失败（暴风雨沉船）分支各配一张
- 未采用：F 组横幅/旗串/奖章用我方的裁边版（主包是未裁 512² 原图，裁边后 CSS 尺寸可预测）

**质量声明**（README）：全集为 AI 合成裁切 + 程序延展，**测试占位级，非生产验收**；
H 组天地交界有可见接缝（以压暗衬底使用，上叠 UI 不明显）；E10 大副造型仍待重做；
A 组船需在游戏内比对舰艏朝向与切边；B 组需在实际画布尺度测平铺。
