# 《大航海时代》视觉资产生成 Prompt 清单 · 第二批

> 背景：第一批 51 项（A-H 组）已全部交付并接入，但全集 README 自述为「AI 合成裁切 + 程序延展，
> **测试占位级，非生产验收**」。本清单按三类需求开第二批：
>
> | 类别 | 为什么要画 | 条数 |
> |---|---|---|
> | **P0 质量修复** | 已交付但 README 明示不达标：D1-D4 是合成图提取版、E10 大副造型错、E13/E14 道具有偏差、E8 与 E1 撞脸 | 8 |
> | **P1 高频场景缺口** | 13 个事件场景键没有真图、走手绘 SVG 兜底，其中 chart 被 **9 个事件**共用 | 4 |
> | **P2 系统升级** | 船变体是侧视死引用（地图标记已换俯视）、派系/特质还在用 emoji 图标 | 13 |
> | **P3 对白表情** | 戴夫式致辞系统只有一种表情，差分是低成本高感染力升级 | 3 |
>
> 通用规则（风格锚点 / 负面提示 / 命名规范 / 生成后自检）**完全沿用第一批文档第 0 节**，此处不再重复。
> 每条 prompt 末尾已内嵌风格锚点，直接整段复制给 GPT 即可。

---

## P0 质量修复（8 条，最高优先级）

> 这一批都是「替换」：交付后直接覆盖同名文件，**游戏代码零改动**。

### P0-1. D1 风暴之夜（覆盖 `public/assets/scenes/d01.png`）

1200×675，不透明。事件场景，**底部 1/4 压暗**供叠事件文字，上下缘留出海天。
现状问题：现版本从多事件合成图提取+延展放大，上下缘是模糊拉伸的。

```
A raging storm at sea at night in the age of sail. A small caravel battles
towering waves, heeled hard over, sails reefed and straining, lightning
cracking across a bruised purple-black sky, rain sheeting diagonally,
whitecaps glowing faintly in the flash. Wide cinematic establishing shot,
horizon low in the upper third, bottom quarter of the image darker and
calmer for text overlay.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature, no border, no frame.
```

### P0-2. D2 海盗接舷战（覆盖 `public/assets/scenes/d02.png`）

1200×675，不透明，底部压暗。两船舷靠相接、钩索相连、火绳枪烟雾——画面主体是**两艘船和战斗的人影**。

```
A pirate boarding action between two sailing ships in the golden age of
piracy. Two vessels locked hull-to-hull with grappling hooks, a black
Jolly Roger flag whipping from the attacker's mast, musket smoke and
sparks, tiny silhouettes of sailors swarming across the gangplank,
cutlasses catching the light, tattered sails and splintered railings.
Wide cinematic side view, dramatic warm sunset rim light on the smoke,
bottom quarter darker for text overlay.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature, no border, no frame.
```

### P0-3. D3 海怪（覆盖 `public/assets/scenes/d03.png`）

1200×675，不透明，底部压暗。巨型触手缠住船身、船体倾斜危急感。

```
A colossal kraken attacking a sailing ship, multiple enormous tentacles
wrapping around the hull and snapping a mast, suction cups visible on the
undersides of the tentacles, the ship listing dangerously, sailors tiny
on deck looking up, churning black water and spray around the creature,
one tentacle rising from the depths like a waterspout.
Wide cinematic shot from slightly above, bottom quarter darker for text overlay.
16th-century hand-engraved copperplate nautical chart aesthetic,
sepia palette poisoned with sickly green glow from the deep,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature, no border, no frame.
```

### P0-4. D4 幽灵船（覆盖 `public/assets/scenes/d04.png`）

1200×675，不透明，底部压暗。幽灵船本体已是画面主体（之前靠代码叠精灵，已移除）。

```
A ghost ship under a cold full moon, a derelict 16th-century caravel with
tattered sails glowing faintly pale green, translucent misty hull,
trailing seaweed and barnacles, an eerie phosphorescent wake behind it,
skeletal rigging with no crew, calm silver-black sea reflecting the moon.
Wide cinematic shot, ghostly green and silver palette against deep blue night,
bottom quarter darker for text overlay.
16th-century hand-engraved copperplate nautical chart aesthetic,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic cold rim lighting.
No text, no watermark, no signature, no border, no frame.
```

### P0-5. E10 大副（覆盖 `public/assets/portraits/officer_first_mate.png`）

512×640，羊皮纸底即可。现状问题：现版本是「女性船医」造型（抱药箱），与游戏内海军大副身份不符。

```
Portrait of a stern female first mate of a 16th-century naval expedition,
standing on a ship's deck, wearing a navy-blue officer's coat with gold
buttons and gold trim, white cravat, holding a polished brass speaking
trumpet (megaphone) at her side, dark hair tied back, weathered face with
an authoritative gaze, rigging and coiled rope behind her, arms crossed.
Half-body portrait, facing viewer, parchment-paper background.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature.
```

### P0-6. E13 白银玛丽亚（覆盖 `public/assets/portraits/rival_silver_maria.png`）

512×640，羊皮纸底。现状问题：武器偏海盗风；游戏内她是精明的商人型对手。

```
Portrait of a sharp-eyed female merchant-rival captain in her thirties,
16th-century trade magnate, feathered tricorn hat, pearl necklace,
elegant dark coat with silver buckles, holding a ledger book and a
quill pen, calculating confident half-smile, cargo crates and a harbor
skyline behind her, silver and pearl accessories catching the light.
Half-body portrait, facing viewer, parchment-paper background.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature.
```

### P0-7. E14 星眸迭戈（覆盖 `public/assets/portraits/rival_stareyed_diego.png`）

512×640，羊皮纸底。现状问题：现版本持望远镜；游戏内他是星算家/制图师，应持六分仪。

```
Portrait of a lean intense navigator-rival captain, 16th-century Portuguese
cosmographer, weathered olive skin, close-cropped dark hair, bright pale
eyes, worn leather astronomer's coat, holding a brass sextant up in one
hand as if taking a sight, star charts and an astrolabe on the table
beside him, night sky with constellations behind him.
Half-body portrait, facing viewer, parchment-paper background.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature.
```

### P0-8. E8 黑旗向导（覆盖 `public/assets/portraits/crew_blackflag_guide.png`）

512×640，羊皮纸底。现状问题：与 E1 老汤姆同为年长水手造型，辨识度低。需强差异化。

```
Portrait of a daring West African pilot-guide in his forties who knows
every hidden reef from Guinea to the Caribbean, wearing a brightly dyed
indigo headwrap and a salt-crusted leather vest, multiple small scars on
his cheek, a polished brass compass hanging from a cord around his neck,
holding a boarding cutaway dagger loosely at his hip, confident knowing
grin, a map tucked under one arm, tropical harbor behind him.
Half-body portrait, facing viewer, parchment-paper background.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with indigo and deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature.
```

---

## P1 高频场景缺口（4 条，覆盖 19 个事件）

> 这 4 个场景键目前走手绘 SVG 兜底。交付后接入「真图优先、SVG 回退」，模式同 D5-D10。
> 横图 1200×675，不透明，底部压暗。**chart 一张覆盖 9 个事件，是全项目性价比最高的一张图。**

### P1-1. chart 航海图室（新键 `chart` → `public/assets/scenes/d11.png`，9 个事件共用）

场景意象：船长室内，油灯照亮摊开的羊皮海图——这是「发现/记录/解读线索」类事件的通用舞台。

```
The great cabin of a 16th-century exploration ship at night: a large
parchment sea chart spread across a wooden table under a single warm
oil lantern, with dividers, a brass compass, an astrolabe, an inkwell
and a quill on the chart, coastlines and rhumb lines half-drawn,
a captain's hand resting on the map edge, star-filled porthole behind,
deep shadows in the cabin corners, pools of golden lantern light.
Interior wide shot, bottom quarter darker for text overlay.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text on the map itself, no watermark, no signature, no border.
```

### P1-2. navy 王家舰队（新键 `navy` → `public/assets/scenes/d12.png`，4 个事件共用）

场景意象：视界线上列队的王家军舰、王室权威的化身。

```
A majestic royal navy squadron on the horizon: three tall warships in
line ahead flying Spanish royal ensigns with heavy gold trim, gun ports
open, wakes cutting the blue water, morning haze between the ships,
a small merchant sail watching from the foreground, authority and dread.
Wide cinematic shot from sea level, bottom quarter darker for text overlay.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature, no border, no frame.
```

### P1-3. island 新大陆海角（新键 `island` → `public/assets/scenes/d13.png`，4 个事件共用）

场景意象：从海上第一眼望见未知岛屿——发现类事件的封面。

```
An uncharted tropical island seen from the sea for the first time: a
natural crescent harbor between two volcanic headlands, palm grooves
down to white sand, a thin plume of smoke suggesting unseen inhabitants,
a waterfall spilling from green cliffs, frigatebirds circling, pristine
turquoise shallows against deep blue open water.
Wide cinematic establishing shot, bottom quarter darker for text overlay.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue and palm green accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature, no border, no frame.
```

### P1-4. tavern 港口酒馆（新键 `tavern` → `public/assets/scenes/d14.png`，2 个事件共用）

场景意象：水手们交换情报与招募人手的浊热之地。

```
The interior of a rough 16th-century Caribbean harbor tavern: heavy oak
beams, a curved dark-wood bar, barrels and tankards, lanterns and candles
throwing warm orange light, sailors in mixed period dress drinking and
whispering over a table, a bartender wiping a cup, rope coils and a
hanging fish net, one window showing the harbor at dusk, dense smoke haze.
Interior wide shot, warm chiaroscuro, bottom quarter darker for text overlay.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature, no border, no frame.
```

---

## P2 系统升级（13 条）

### P2 船变体重画·俯视化（4 条）

> 现状：`public/assets/ships/` 里的 4 个变体（galleon_war 等）还是图鉴切片的**侧视图**，
> 而地图标记旋转逻辑假设「舰艏朝上」，目前这 4 个文件无代码引用（死引用）。
> 重画为俯视后可启用「战舰 / 皇家座舰 / 线列舰」分级视觉（购船与事件用）。
> 512×512，**透明背景，舰艏朝正上方**，与现有 6 张主船同一角度。

#### P2-1. galleon_war 重装盖伦战舰（覆盖 `galleon_war.png`）

```
A heavy 16th-century war galleon, four masts with reinforced square sails,
double row of gun ports along the hull, reinforced ram bow, dark gunmetal
grey hull with black and gold chevron trim, cannon smoke stains, battle
flags at the mastheads, armored and menacing silhouette.
Top-down three-quarter view, bow pointing straight up, centered, game-sprite.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
Transparent background, no shadow, no text, no watermark.
```

#### P2-2. galleon_royal 皇家典礼盖伦（覆盖 `galleon_royal.png`）

```
A ceremonial royal galleon, four masts with billowing cream and gold sails,
elaborate gilded stern castle with carved royal crests, rich burgundy and
gold hull trim, silk banners and prayer flags along the rigging, pearl-grey
hull with gold decorative scrollwork, magnificent treasure-fleet flagship.
Top-down three-quarter view, bow pointing straight up, centered, game-sprite.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with burgundy and deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
Transparent background, no shadow, no text, no watermark.
```

#### P2-3. frigate_war 快速护航战舰（覆盖 `frigate_war.png`）

```
A fast 16th-century war frigate, two masts with tight square sails, long
low hull built for pursuit, a single row of gun ports, black-green hull
with gold figurehead of a snarling lion, striped white and blue sails,
sleek aggressive racing silhouette.
Top-down three-quarter view, bow pointing straight up, centered, game-sprite.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
Transparent background, no shadow, no text, no watermark.
```

#### P2-4. frigate_line 线列战列舰（覆盖 `frigate_line.png`）

```
A 16th-century ship of the line, three masts with massive square-rigged
sails, deep hull with two gun decks visible as rows of open ports,
pale oak hull with dark green strakes and gold port lids, heavy flagship
presence, admiral's flag at the mainmast, broadside battle silhouette.
Top-down three-quarter view, bow pointing straight up, centered, game-sprite.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
Transparent background, no shadow, no text, no watermark.
```

### P2 派系徽记（4 条）

> 现状：四个派系用 emoji（👑⚖️📜🏴‍☠️）当图标，与铜版画风格不匹配。
> 交付后接入 `src/data/factions.ts` 的 icon 字段（UI 已在渲染该字段，换路径即生效）。
> 512×512，**透明背景**，圆形盾徽构图，居中，无字。

#### P2-5. faction_crown 王室徽记（`public/assets/ui/faction_crown.png`）

```
A circular heraldic emblem for a 16th-century royal crown faction: a
golden royal crown above a castle with twin towers, laurel wreath circling
the rim, burgundy and gold on parchment, fine engraved line work,
shield-like medallion composition, flat icon design with subtle shading.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with burgundy and deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
Transparent background, no shadow, no text, no letters, no watermark.
```

#### P2-6. faction_guild 商人商会徽记（`public/assets/ui/faction_guild.png`）

```
A circular heraldic emblem for a 16th-century merchant guild: a brass
balance scale above a coiled anchor and a bulging money purse, wheat
stalks circling the rim, olive-green and gold on parchment, fine engraved
line work, shield-like medallion composition, flat icon design.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with olive green and deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
Transparent background, no shadow, no text, no letters, no watermark.
```

#### P2-7. faction_scholars 学者公会徽记（`public/assets/ui/faction_scholars.png`）

```
A circular heraldic emblem for a 16th-century scholars guild: an open
parchment scroll with a sextant and a quill pen crossed above it, a
small star chart with constellations in the background, a laurel sprig
circling the rim, indigo and gold on parchment, fine engraved line work,
shield-like medallion composition, flat icon design.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with indigo and deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
Transparent background, no shadow, no text, no letters, no watermark.
```

#### P2-8. faction_brethren 海盗兄弟会徽记（`public/assets/ui/faction_brethren.png`）

```
A circular heraldic emblem for a 16th-century pirate brethren: a skull
grinning above two crossed cutlasses, a torn black sail shape behind,
a knotted rope circling the rim, charcoal black and rust red with bone
white on parchment, fine engraved line work, shield-like medallion
composition, flat icon design, menacing but readable at small size.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with rust red and charcoal accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
Transparent background, no shadow, no text, no letters, no watermark.
```

### P2 船长特质图标（5 条）

> 现状：开局五选一特质用 emoji（💰🛡️✨🧭⚕️）。接入 `src/data/traits.ts` 的 icon 字段。
> 256×256，**透明背景**，单一主体居中，无字无框。

#### P2-9. trait_merchant 商界血脉（`public/assets/ui/trait_merchant.png`）

```
A single game icon of a plump medieval money bag with gold coins spilling
out, one coin showing a ship silhouette, warm gold and brown, engraved
line work with soft shading, centered on empty background, readable at
32 pixels.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
Transparent background, no shadow, no text, no watermark.
```

#### P2-10. trait_bulwark 铁壁舰长（`public/assets/ui/trait_bulwark.png`）

```
A single game icon of a sturdy wooden ship's shield with iron banding and
rivets, a small anchor boss in the center, dents and battle marks, warm
brown and gunmetal, engraved line work with soft shading, centered on
empty background, readable at 32 pixels.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
Transparent background, no shadow, no text, no watermark.
```

#### P2-11. trait_leader 魅力领袖（`public/assets/ui/trait_leader.png`）

```
A single game icon of a ship's helm wheel with a rising sunburst behind
it, rays spreading outward, warm gold and amber, engraved line work with
soft shading, centered on empty background, readable at 32 pixels.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
Transparent background, no shadow, no text, no watermark.
```

#### P2-12. trait_explorer 天生探险家（`public/assets/ui/trait_explorer.png`）

```
A single game icon of a brass compass with the needle pointing to a
bright north star, tiny constellation dots around the rim, warm gold and
deep blue, engraved line work with soft shading, centered on empty
background, readable at 32 pixels.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
Transparent background, no shadow, no text, no watermark.
```

#### P2-13. trait_surgeon 随船医生（`public/assets/ui/trait_surgeon.png`）

```
A single game icon of a surgeon's scalpel crossed with a fresh lemon,
a small bandage roll beside them, pale green and warm silver, engraved
line work with soft shading, centered on empty background, readable at
32 pixels.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with pale green and deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
Transparent background, no shadow, no text, no watermark.
```

---

## P3 对白表情差分（3 条，可选）

> 用途：戴夫式致辞系统（`DialogueOverlay`）目前每角色只有一种表情。老领航员开局致辞三句，
> 分别配「平静→严肃→期许」三种表情，感染力明显提升。交付后我在 `dialogue.ts` 的
> 剧本数据里给每句加 `portrait` 覆盖字段即可，组件零改动。
> 512×640，羊皮纸底，**必须与 E9 现有版同一造型同一角度，只改表情**（生成时把
> E9 现图作为参考图一起喂给 GPT，或在本 prompt 前加 "same elderly navigator character
> as reference, identical costume and framing"）。

### P3-1. 老领航员·平静（`public/assets/portraits/officer_pilot_calm.png`）

```
Portrait of the same elderly 16th-century pilot navigator as the reference
image: identical grey hair, identical navy coat with gold buttons, identical
framing and parchment background, ONLY the expression changed to calm and
reassuring, a gentle knowing smile, eyes relaxed.
Half-body portrait, facing viewer, parchment-paper background.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature.
```

### P3-2. 老领航员·严肃（`public/assets/portraits/officer_pilot_serious.png`）

```
Portrait of the same elderly 16th-century pilot navigator as the reference
image: identical grey hair, identical navy coat with gold buttons, identical
framing and parchment background, ONLY the expression changed to grave and
serious, brow furrowed, jaw set, issuing a warning.
Half-body portrait, facing viewer, parchment-paper background.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature.
```

### P3-3. 老领航员·期许（`public/assets/portraits/officer_pilot_hope.png`）

```
Portrait of the same elderly 16th-century pilot navigator as the reference
image: identical grey hair, identical navy coat with gold buttons, identical
framing and parchment background, ONLY the expression changed to warm
hopeful pride, eyes slightly crinkled, a farewell blessing.
Half-body portrait, facing viewer, parchment-paper background.
16th-century hand-engraved copperplate nautical chart aesthetic,
warm sepia and antique gold palette with deep ocean blue accents,
fine line hatching texture, slightly weathered parchment feel,
painterly but precise, dramatic warm rim lighting.
No text, no watermark, no signature.
```

---

## 备选：低频场景（11 条，暂不建议先画）

> 以下 sceneKey 各只有 1 个事件用到，SVG 兜底完全够用。列在这里仅供想补全时按需勾选：
> whale（鲸群）/ reef（珊瑚礁）/ meteor（流星雨）/ doldrums（赤道无风带）/ dolphin（海豚伴航）/
> cape（风暴海角）/ fairwind（顺风）/ mutiny（哗变）/ school（航海学校）/ disease（瘟疫）/
> market（集市）。每条统一用：
> `A 16th-century scene of <主题>, wide cinematic shot, bottom quarter darker for text overlay.`
> + 风格锚点 + `1200×675 不透明`。要画哪个说一声，我补完整 prompt。

---

## 建议生成顺序

1. **第一批次（性价比最高）**：P1-1 chart → P0-5 E10 大副 → P0-6/P0-7（E13/E14 道具修正）→ P0-8（E8 差异化）
2. **第二批次**：P0-1~P0-4（D1-D4 原生高清，四张一起生成保持场景一致性）
3. **第三批次**：P2 派系徽记 4 张 + 特质图标 5 张（同一批生成保证图标间风格统一）
4. **第四批次**：P2 船变体 4 张（俯视，和现有 6 张主船比对角度后微调）
5. **随手补**：P3 表情差分（需要 E9 参考图同喂）

## 交付方式（照旧）

下载到 `C:\Users\Brunson\Downloads`，文件夹整包或散图都行，**文件名不限**
（GPT 爱起什么起什么，我按上面标注的目标路径对号入座，md5 对账防错）。
交付后告诉我文件夹路径或文件名，我来核对、接入、跑测试。
