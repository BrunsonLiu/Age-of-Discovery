# 端到端测试索引

浏览器实测脚本。全部用 Edge 无头 + 真实页面交互，验的是**玩家实际看到/听到的东西**，
不是单元测试能覆盖的逻辑。

## 前置条件

绝大多数脚本要一个跑着的 dev server：

```bash
npm run dev -- --port 5174 --base /Age-of-Discovery/
```

`scene-missing-prod.mjs` 不用 dev server，它要**生产产物 + 静态服务器**：

```bash
npm run build
# 用任意静态服务器把 dist/ 挂在 5181，且要挂在 /Age-of-Discovery/ 前缀下
node test/e2e/scene-missing-prod.mjs
```

## 快速跑法

```bash
npm run test:e2e          # voyage-smoke：全流程航行冒烟
npm run test:e2e:scenes   # 场景插图三件套
npm run test:e2e:audio    # 音频实跑
npm run test:e2e:map      # 地图可辨性
npm run test:e2e:map3d    # 2.5D 立体海图（切换/港口标签/切回 2D/运行时错误）
npm run test:e2e:trade    # 贸易报价一致性
npm run test:e2e:notify   # 通知横幅不挡玩家操作
npm run test:e2e:mobile   # 移动端布局（390×844 触屏，dev）
npm run test:e2e:mobile:prod   # 移动端生产产物冒烟（需先 build + vite preview）
npm run test:e2e:all      # 以上全部（不含 mobile:prod）
```

## 脚本清单

| 脚本 | 守什么 | 前置 |
|---|---|---|
| `voyage-smoke.mjs` | 全流程：向导→出航→航行循环→到港→事件→小游戏结算 | dev server |
| `scene-survey.mjs` | 25 个场景逐个渲染，确认真图 vs 手绘兜底的观感 | dev server |
| `scene-fallback-check.mjs` | 插图加载失败时回退手绘 SVG，不白屏/不破图 | dev server |
| `scene-img-failed-reset.mjs` | 失败状态不跨场景污染；素材恢复后真图自动回来 | dev server |
| `scene-missing-prod.mjs` | 生产静态服务器返回**真 404** 时的行为 | build + 静态服务器 |
| `scene-player-views.mjs` | 25 场景玩家视角大图对比（素材观感验收） | dev server |
| `player-survey.mjs` | 每个界面截一张图，看画面好不好（体验巡检） | dev server |
| `map-legibility.mjs` | 海陆明度差、图层 z-index、复古装饰不被压住 | dev server |
| `map3d-check.mjs` | 2.5D 视图：能切进切出、20 个港口标签都在、**可见标签有尺寸/在视口内/互不重叠**（含 8 港口密集场景）、**底栏图层开关在 3D 里真的生效**（对象存在 + visible 翻转 + store 一致 + 同帧 WebGL 像素差）、**国界线真的画出来了**（同帧像素差）、**区域名 28 个有尺寸/不越界/不与港口名重叠**、**港口三档规模 8/9/3 + 干船坞 9 座 + 大港/小港体积比 >1.5**、切回 2D 后 Leaflet 恢复正常、运行时错误为 0 | dev server |
| `map-check.mjs` / `map-diag.mjs` | 地图视觉复核与诊断（辅助脚本） | dev server |
| `audio-live.mjs` | 真实音频能量、BGM 情绪跟随、总开关、静音恢复 | dev server |
| `trade-quote.mjs` | 面板显示价 == 实际结算价；本港不收的货能折价卖掉 | dev server |
| `notification-overlap.mjs` | 成就通知堆叠时不挡玩家点击（真实鼠标点击） | dev server |
| `measure-map-load.mjs` | 实测「绘制航海图...」占屏时长 + geojson 请求次数 | dev server 或静态服务器 |
| `online-check.mjs` | 线上站点能否打开、有无控制台错误、地图是否渲染 | 无（直连线上） |
| `online-load-time.mjs` | 线上端到端加载耗时（含每个关键资源大小） | 无（直连线上） |
| `mobile-layout.mjs` | 移动端（390×844 触屏）：无横向溢出、九个入口齐全、底部抽屉、参观模式退路、罗盘与天候徽章不重叠、开局视野含港口 | dev server |
| `mobile-prod.mjs` | 同一套移动端断言跑在**生产产物**上；不依赖 dev 钩子，全程走玩家真按得到的路径（点海面出航 → 段末抉择 → 操舵退路） | build + `vite preview` |
| `layout-audit.mjs` | 多视口 × 8 个面板：元素横向越界、文字被 `overflow:hidden` 裁掉（`scrollWidth > clientWidth`）。**在压缩截图里看不出来的那类毛病**。地图 SVG 图层已排除（它本就比视口大） | dev server |
| `clickable-audit.mjs` | 所有可见按钮的中心点能否命中自己（`elementFromPoint`）+ 是否完整落在视口内。专治「看得见点不到」——DOM 的 `btn.click()` 会绕开遮挡，详见文件头。**至少跑 1440 与 1024 两档**（`--vw=1024 --vh=768`）：底栏四段在 1024 下折成两行，768–1279 这段宽度只有这一档测得到。**还要跑一档 2.5D**（`--mode=3d`）：3D 是一整块覆盖全屏的 canvas，层叠或 `pointer-events` 出错会把所有栏位按钮盖住，而 DOM 点击照样成功 | dev server |

## 写 e2e 时容易踩的坑

- **开场对话会锁住整个地图**。`DialogueOverlay` 铺了一层 `absolute inset-0 bg-black/45`，
  对话期间地图上的一切都点不到——这是**正常设计**（对话中不该能操作地图），
  但用 `__gameStore.setState({gamePhase:'playing'})` 直接跳进地图时，对话会被触发，
  于是「面板按钮点不动」，看着像 bug。构造场景时一并设
  `dialogueSeen: ['opening_pilot']` 跳过开场对话。
- 排查「点不到」用 `document.elementFromPoint(x, y)` 看真正命中的是谁，
  比猜 CSS 层级快得多。
- **移动端是「结构级响应」不是「样式级响应」**：侧栏按钮在窄屏下是**根本不渲染**
  （`{!isMobile && ...}`），不是被 CSS 藏起来。所以用 `[data-tut="fleet"]` 在移动端
  永远查不到——这不是 bug，是设计。移动端入口一律走底部标签栏
  `[data-testid="mobile-tab-bar"]`。
- **开场致辞是全屏模态（z=75），会盖住底部标签栏**。桌面端能按 Esc 跳过，
  触屏没有 Esc 键，所以 `DialogueOverlay` 专门加了「跳过这段致辞」按钮。
  移动端 e2e 必须先点掉它，否则后面所有「点底部标签栏」的步骤都会被它截胡。

### 在 3D 视图里点地图：三个必踩的坑

`map3d-check.mjs` 的点击断言（点港口 / 点海面）踩过三个坑，**都不是代码 bug**：

1. **算点击坐标必须用 canvas 自己的 `getBoundingClientRect()`**。
   `project()` 出来的是 NDC，换成屏幕坐标要基于 canvas 的实际位置与尺寸
   （顶栏占了视口上方约 40px）。用 `innerWidth/innerHeight` 会整体偏移几十像素，
   而港口模型只有 ~30px 大 → 直接点空。
2. **点地图会让船直接出航，并弹出 `VoyagePlanModal`**（`fixed inset-0`、z=80、全屏遮罩）。
   那个弹窗会把后续所有点击吃掉。所以每次点击后都要
   `cancelVoyage()` + `setState({pendingVoyage:null, waypoint:null, fleet:{...isSailing:false}})`。
3. **对话遮罩 `div.absolute.inset-0.bg-black/45` 也会锁住地图**（正常设计）。
   点之前循环点掉「继续」/按 Esc，直到 `elementFromPoint` 命中 CANVAS。

> 判定点击位置是否可用，直接断言 `document.elementFromPoint(x, y) === canvas`，
> 比猜层级快得多。

## 构造「缺图」的两种方式

素材一旦全部交付，「某文件恰好不存在」这种前提就失效了——脚本会变成测一个
不存在的假设。现在统一用两种**真实故障**来构造：

1. **请求拦截**（dev 用）：`page.setRequestInterception(true)` + `req.abort('failed')`，
   把指定图片的 HTTP 请求打断。模拟断网/CDN 故障，不碰文件系统。
   见 `scene-fallback-check.mjs`、`scene-img-failed-reset.mjs`。

2. **移走产物**（生产用）：把 `dist/assets/scenes/` 里某个真图临时改名，
   让静态服务器返回货真价实的 404。脚本用 `process.on('exit')` 保证归还。
   见 `scene-missing-prod.mjs`。

> 两种方式选的都必须是**当前真实存在**的素材。拿一个本来就不存在的地址去测，
> 测到的是「文件不存在」，不是「文件存在但加载失败」——后者才是线上会遇到的故障。

## 验证测试本身有效

改坏代码后测试必须**失败**。已验证过的注入点：

- 旧写法（`EventScene` 用全局布尔值 `imgFailed`）→ `scene-img-failed-reset.mjs` 第②条断言失败，
  chart 场景被误伤退化成 SVG。
- 旧写法（`selectBuyPrice` 漏乘 `priceMultiplier`，结算仍用完整系数）→
  `trade-quote.mjs` 报「屏幕写 195，实际扣 176」，逐行核对同时报出多行不一致。
- 旧写法（`NotificationToast` 去掉 `pointer-events-none` 与让位）→
  `notification-overlap.mjs` 的「出售按钮依然点得动」失败，命中的是通知卡片本身。
- 国界线沉到海面以下（`BORDER_Y = -0.5`，完全不可见）→
  `map3d-check.mjs` 的「国界线在画面上真的画出来了」失败，`borderSignal = 0`。
  只断言「对象存在 + 段数对 + 是虚线」的话，测试**照样全绿**——那是假测试。
- 标签去掉越界/重叠检查 → `map3d-check.mjs` 报 3 条失败
  （「日本海」「澳大利亚」越界 + 9 对重叠）。
- 港口三档全部退化成 `major` + 删掉干船坞 → `map3d-check.mjs` 报 **5 条失败**
  （大港 8→20、中港/小港变 undefined、干船坞 9→0、体积比 N/A）。
  只断言「场景里有 20 个港口 group」的话，这两处退化测试照样全绿。

## 判定元素可见性：别用 `offsetParent`

`offsetParent` 对 `position: fixed` 的元素**恒为 null**。
用它过滤「可见按钮」会把浮层（标题页 z=9999、对话层 z=70）里的按钮全部误判成不可见，
于是「点掉开场对话」的循环一次都没点，后续所有交互被浮层截胡——
现象是「滚轮缩放无效」「按钮点不动」，很容易误判成功能坏了。

**改用 `getBoundingClientRect()` 的宽高是否 > 0。** 本轮实测踩到这个，
排查了很久（以为滚轮监听或 pointer-events 有问题）。

> 注意：`position: absolute` 的元素 offsetParent 是最近的定位祖先，一般非 null，
> 所以这个坑只在 fixed 元素上出现——更难联想到。

> 注意 `trade-quote.mjs` 把声望设成 100：价格系数在 fame=0 时恰为 1，
> 显示价与结算价**必然**相等——那样的测试是永远通过的假测试。系数 ≠1 时才有区分力。

### 像素级取证的两个坑（`map3d-check.mjs`）

要证明「图层真的画在画面上」，必须做像素差分。整屏截图差分**不可信**：
页面有持续重绘的动画层（风带箭头 `mix-blend-mode: screen`、船体动画、相机缓动），
实测噪声基线高达 10.5%——信号被噪声淹没。

可行的做法是 **WebGL `readPixels`**，且有两个必须遵守的条件：

1. **必须在同一个 `page.evaluate` 里连续 render + readPixels**，中间不跨 rAF 帧。
   相机是指数缓动（`fx += (target.x - fx) * 0.12`），数学上**永不收敛到完全相等**，
   200ms 内 x 实测从 14.7012 → 14.6656，画面持续位移 → 11.6% 差分噪声。
   同一帧内开/关差分，噪声基线降到 **0 像素**。

2. **`readPixels` 必须在 `render()` 之后立即读**。
   `preserveDrawingBuffer: false` 时，合成后 back buffer 内容未定义，
   隔 200ms 再读会读到已清空的缓冲 → 差分恒为 0（无效测量）。

另外 `readPixels` 的**行 0 是画布底部**，反投影时 NDC y = `(py/H)*2-1`（不取负）；
反投影必须复用项目自己的 `mapProjection.ts`，手写公式会错。

> 这条别省。全绿的测试可能只是测了个寂寞。
