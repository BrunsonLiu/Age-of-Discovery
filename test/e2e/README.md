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
npm run test:e2e:supply   # 出航计划补给数字对账
npm run test:e2e:nexthint # 主屏常驻「下一站」：第一屏可见 / 与面板卡同源 / 只定位不出航
npm run test:e2e:receipt  # 到港回执：回来的理由常驻 / 与册子同源 / 翻开即收起
npm run test:e2e:notify   # 通知横幅不挡玩家操作
npm run test:e2e:mobile   # 移动端布局（390×844 触屏，dev）
npm run test:e2e:mobile:prod   # 移动端生产产物冒烟（需先 build + vite preview）
npm run test:e2e:all      # 以上全部（不含 mobile:prod）
```

## 全链分段执行

`test:e2e:all` 一条命令串 19 个脚本 + `seg6` 的 6 个（共 25 个），实测在受限
环境里跑到第 9 个就被 10 分钟上限 SIGTERM 掉（前 8 个日志 0 个 `✗`，**不是测试红**）。
本机终端没有这个限制，可以直接 `npm run test:e2e:all`；受限环境按 6 段跑，
每段一条单独命令：

```bash
npm run test:e2e:seg1   # 冒烟 / 场景三件套 / 音频 / 地图可辨性
npm run test:e2e:seg2   # 2.5D 海图 / 贸易报价 / 补给数字对账 / 常驻下一站 / 到港回执 / 通知 / 移动端布局
npm run test:e2e:seg3   # 三档可点性 / 航海日志
npm run test:e2e:seg4   # 多视口布局 / 岸上 / 小字 / 文案密度
npm run test:e2e:seg5   # 真实首局 / 参观模式 / 中文字体覆盖
npm run test:e2e:seg6   # 首分钟三屏 / 彩蛋不打断 / 对比度 / 天气 / 纸纹 / 3D 漂流物
```

**seg6 是第 26 轮补进来的**：这 6 个脚本都自带失败退出、清存档、只需 dev server，
却常年不在任何分段里，只靠手工跑；补进来当天就查出 `intro-check` 天赋页 2 段
12px 文字对比度不达标（3.92 / 4.4，AA 要 4.5），以及 `no-dialogue-interrupt`
因「上岸走走」关面板后残留对白造成的前置污染。**`debris-3d` 排在段尾**：
它会开 swiftshader 软渲染，放在像素类脚本前面会让后面的截图落在半透明/未合成帧上
（`harbor-view.mjs` 已经为这个条件修过一次）。

**seg3 里 `logbook` 必须排在 `clickable:3d` 之后**：3D 软渲染会占满 CPU 一段时间，
帮助面板要 2~3s 才渲染完，这正是 logbook 以前偶发红 3 条的负载条件；
挪到段首就测不到这个回归。

生产产物的移动端是独立一段，不在 19 个脚本里（先 `npm run build:clean`，
再 `npx vite preview --port 5180 --host 127.0.0.1`）：

```bash
npm run test:e2e:prod   # mobile-prod.mjs：全程不依赖 dev 钩子，只认玩家真按得到的路径
npm run test:e2e:full   # 本机完整回归：seg1~seg6 + prod（前置同上，需 5180 preview 常驻）
```

`test:e2e:all` 保留原来的单命令形式（本机无超时限制时可直接跑），
但它**不含** `mobile-prod`；要把生产移动端一起跑用 `test:e2e:full`。

## 构建与字体维护

```bash
npm run build:clean     # 先把旧 dist 整体挪走再全新构建
npm run font:subset     # 文案新增汉字后必须重跑
```

`build:clean` 绕开的是 Vite `emptyOutDir` 一次删 100+ 文件触发的批量删除守卫；
**不要用 `--emptyOutDir false`**，旧 chunk 会残留在 dist 里，体积数字会骗人。
`font:subset` 重切中文子集并更新 `noto-serif-sc-coverage.json`；漏了这一步，
`npm test` 的 sha1 + cmap 双向守卫会红（浏览器对缺字是**静默回退**，肉眼查不出）。

## 脚本清单

| 脚本 | 守什么 | 前置 |
|---|---|---|
| `voyage-smoke.mjs` | 全流程：向导→出航→航行循环→到港→事件→小游戏结算 | dev server |
| `scene-survey.mjs` | 25 个场景逐个渲染，确认真图 vs 手绘兜底的观感 | dev server |
| `scene-fallback-check.mjs` | 插图加载失败时回退手绘 SVG，不白屏/不破图 | dev server |
| `scene-img-failed-reset.mjs` | 失败状态不跨场景污染；素材恢复后真图自动回来 | dev server |
| `scene-missing-prod.mjs` | 生产静态服务器返回**真 404** 时的行为 | build + 静态服务器 |
| `scene-player-views.mjs` | 25 场景玩家视角大图对比（素材观感验收） | dev server |
| `player-survey.mjs` | 每个界面截一张图，看画面好不好（体验巡检）。开局现在 4 屏，天赋页点「启航！」直接进游戏 | dev server |
| `map-legibility.mjs` | 海陆明度差、图层 z-index、复古装饰不被压住 | dev server |
| `map3d-check.mjs` | 2.5D 视图：能切进切出、20 个港口标签都在、**可见标签有尺寸/在视口内/互不重叠**（含 8 港口密集场景）、**底栏图层开关在 3D 里真的生效**（对象存在 + visible 翻转 + store 一致 + 同帧 WebGL 像素差）、**国界线真的画出来了**（同帧像素差）、**区域名 28 个有尺寸/不越界/不与港口名重叠**、**港口三档规模 8/9/3 + 干船坞 9 座 + 大港/小港体积比 >1.5**、切回 2D 后 Leaflet 恢复正常、**岸上视角不空转**（读 `renderer.info.render.frame`：海图在涨 / 切到岸上 1.8 秒 0 帧 / 切回立刻恢复且末帧 draw calls>0）、运行时错误为 0。**判据用轮询等"真出一帧"**：swiftshader 软件渲染只有 2~3fps，写死「900ms 内 >2 帧」会假失败 | dev server |
| `map-check.mjs` / `map-diag.mjs` | 地图视觉复核与诊断（辅助脚本） | dev server |
| `audio-live.mjs` | 真实音频能量、BGM 情绪跟随、总开关、静音恢复 | dev server |
| `trade-quote.mjs` | 面板显示价 == 实际结算价；本港不收的货能折价卖掉 | dev server |
| `supply-parity.mjs` | **出航计划的补给数字对账**（第 27 轮新增）：面板「港内每日 / 起航后按部就班」两套日耗必须分别等于顶栏 tooltip 与 `advanceDay` 真实扣减；抢行实际扣减等于同一套 `dailyRates(rush)`；三档总账里抢行更省粮时，粮刚好够抢行、不够按部就班的临界值**必须报「不够」**并给出写清总量的抢行退路，按部就班刚好够时不再报「不够」。旧实现有两处实测缺陷：面板印基础消耗（3 粮/5 水）却与同一屏顶栏（港内 1 份）矛盾；判定用最省的抢行（15 粮）而结论句写「约 6 天可达」（按部就班要 18 粮），粮=15 时说「补给偏紧」，玩家照默认走第 5 天断粮。`.workbuddy/probe-inject-supply.py` 注入两种旧写法，e2e 与单测都要红 | dev server |
| `notification-overlap.mjs` | 成就通知堆叠时不挡玩家点击（真实鼠标点击） | dev server |
| `measure-map-load.mjs` | 实测「绘制航海图...」占屏时长 + geojson 请求次数 | dev server 或静态服务器 |
| `online-check.mjs` | 线上站点能否打开、有无控制台错误、地图是否渲染 | 无（直连线上） |
| `online-load-time.mjs` | 线上端到端加载耗时（含每个关键资源大小） | 无（直连线上） |
| `mobile-layout.mjs` | 移动端（390×844 触屏）：无横向溢出、九个入口齐全、底部抽屉、参观模式退路、罗盘与天候徽章不重叠、开局视野含港口 | dev server |
| `mobile-prod.mjs` | 同一套移动端断言跑在**生产产物**上；不依赖 dev 钩子，全程走玩家真按得到的路径（点海面出航 → 段末抉择 → 操舵退路） | build + `vite preview` |
| `layout-audit.mjs` | 多视口 × 8 个面板：元素横向越界、文字被 `overflow:hidden` 裁掉（`scrollWidth > clientWidth`）。**在压缩截图里看不出来的那类毛病**。地图 SVG 图层已排除（它本就比视口大） | dev server |
| `clickable-audit.mjs` | 所有可见按钮的中心点能否命中自己（`elementFromPoint`）+ 是否完整落在视口内。专治「看得见点不到」——DOM 的 `btn.click()` 会绕开遮挡，详见文件头。**至少跑 1440 与 1024 两档**（`--vw=1024 --vh=768`）：底栏四段在 1024 下折成两行，768–1279 这段宽度只有这一档测得到。**还要跑一档 2.5D**（`--mode=3d`）：3D 是一整块覆盖全屏的 canvas，层叠或 `pointer-events` 出错会把所有栏位按钮盖住，而 DOM 点击照样成功 | dev server |
| `next-port-hint.mjs` | **主屏常驻「下一站」**（第 28 轮新增）：第 28 轮实测进游戏第一屏 38 条可见文本 / 122 字 / 20 个按钮，「下一站/航路/目标/推荐」一个都没有，唯一的航路卡埋在「冒险笔记」面板里。守三条：① 不点开任何面板、第一屏可见文本里就有「下一站」，两个按钮 `elementFromPoint` 真实命中自己，且不压顶栏/罗盘/天候徽章/靠岸邀请条；② 常驻条与面板卡的港名、海里数、天数**同源**（`useVoyageNext` 单一来源），面板里仍保留完整理由与奖励；③ 真鼠标点「定位」后 `__mapStore.center` 落在目标港坐标，且 `isSailing`/`currentRoute`/`activePanel` 全不变（不出航、不弹面板）。另覆盖：面板打开时收起、关掉再回来、岸上视角收起、3D 全屏 canvas 下仍可点、390×844 只占一行且不压底栏/无横向溢出、真触发到港下降沿量两条 rect 不重叠。37/0；注入 3 种旧写法（只在面板里渲染 / 数字写死分叉 / 移动端退化成桌面两行）3/3 被抓，`.workbuddy/probe-inject-nexthint.py` 自动还原并校验 sha。**接入 seg4 时另抓到一处真缺陷**：360px 宽时港名「下一站：埃尔米纳」104>97 被 `truncate` 裁掉 7px（1024/1440 双视口），条宽改 400px；靠岸邀请条同时从 top-10 下移到 104px，避免中屏横向叠住 | dev server |
| `visitor-mode.mjs` | **参观模式的三条承诺是不是真的**（模式页上明写着「不会输：断粮沉船都与你无关」）：① 进游戏没有教程（`tutorialStep=-1`、无「下一步」遮罩）、界面 31/31 可点、掮客卡在（不用自己猜下一步）；② 顶栏有常驻「参观」标识，点它真的打开帮助，帮助里写明模式且有「换个玩法」入口；③ **把粮/水/士气推到 0、船体耐久推到 0，再推 10 天**：参观模式仍活着（实测推到第 19 天，耐久被抬回下限 1），**同一套烂摊子船长模式第 2 天就 gameover** —— 对照组用来证明这组条件有区分力，否则可能只是空测。对比度另跑 `contrast-audit.mjs --mode=visitor`（54 段 vs 船长 53 段，多出来的是徽标） | dev server |
| `font-coverage.mjs` | **中文字体有没有漏掉界面在用的字**。自托管的中文字体是按文案现切的子集（`.workbuddy/make_font_subset.py`），文案一长就会漏字，而漏字**不报错**：浏览器静默回退到另一个衬线体，一句话里两种字形（实测旧子集漏 41 个：啊/梅/鸡/酸/饼/舢/啐…，全在事件正文与对白里）。判据用 CDP `CSS.getPlatformFontsForNode`：把全部界面用字塞进一个节点，**只要有一笔来自 `isCustomFont=false` 的字体就是漏字**；再拿「龘齉爨」当对照组证明判据有区分力（这三个字肯定不在子集里，必须被认出由本机字体补）。同一份覆盖关系另有一条单测守卫（字体 sha1 + cmap 清单），`npm test` 就能抓到文案新增后忘了重切 | dev server |
| `arrival-receipt.mjs` | **到港回执：这趟带回了什么**（第 29 轮新增）：第 29 轮实测 1440×900 连跑 10 趟，主屏可见文本里「靠岸 ·」「酒馆里有人提起」「应验 ·」一次都没出现，唯一提示是侧栏 8px 红点 + 屏幕上看不见的 aria-label；册子本身（见闻 / 线索 / 应验 / 图鉴 / 在地图上看看）做得很完整，缺的是常驻出口。守四条：① 到港后不点任何面板，主屏 12px 主行就出现那句「没讲完的尾巴」，且港名与 logbook 最新未读页 `hint` 同源、`data-unread` 等于真实未读数、`scrollWidth` 不被 truncate 裁、中心点 `elementFromPoint` 命中自己；② 副行「下一站：X · N 海里」一字不动（回来的理由与方向同时在场）；③ 真鼠标点主行打开的是 `activePanel='event'`，见闻页显示这一页、未读归零、不出航，关面板后主行恢复「航路 · 目标」，下一趟又带回新的一页；④ 移动端 390×844 保持一行「航路 · 下一站」，不叠第二块。27/0；注入 3 种旧写法（写死 `false` 藏回面板 / 「有新内容」与册子分叉 / 打开错面板）3/3 被抓，`.workbuddy/probe-inject-receipt.py` 自动还原并校验 sha。**两个探针坑**：到港会命中剧情触发点②弹全屏彩蛋致辞（桌面没有跳过按钮，只有一行「Esc 跳过致辞」提示），要用 `__dialogueStore.skip()` 清场，否则遮罩吃掉真实鼠标点击；`pickRumor` 按确定性取模选线索港，连着两趟指向同一港是合法结果，别把「两趟文本必须不同」写成断言 | dev server |
| `first-run.mjs` | **真实首局全链路**（其余脚本都用 `setState({tutorialStep:-1})` 跳到地图，这一段从未被测过）：清档打开页面 → 开局 5 屏 → 开场致辞（老领航员 3 句）→ 10 步教程 → 点「贸易」→ 掮客推荐条 → 照推荐买 → 出航 → 到港 → 卖出。断言：① 到能做决定 ≤25 次点击（实测 21）；② **教程结束后第一下点「贸易」必须立刻打开面板**——这一条守的是「点了没反应」：修之前开场致辞排在教程之后，一弹就是 `bg-black/45` 全屏遮罩，连点两次都命中在遮罩上、`activePanel` 一直是 null；③ 推荐条有「多少金 / 多少天」，被推荐的商品有 `data-recommended` 且**排第一行**（排第三行时 +N 按钮在折叠线以下，看得见点不到）；④ 照推荐走净赚 ≥300 金（实测 500 → 945，净赚 445，第 1 天）。注入 6/6 全被抓（`.workbuddy/probe-inject-firstrun.py`） | dev server |
| `copy-density-audit.mjs` | **决策浮层「只留此刻要做的决定」+ 信息守恒**：帮助面板目录态 ≤220 字 / 首屏 ≤200 字 / 0 个数字读数（改前全量 2762 字、70 个数字、要滚四屏），小游戏开场 ≤70 字 / 0 个数字 / ≤8 块（改前 128 字、5 个数字、13 块）。**只查「字变少」会奖励删内容**，所以逐节点开 19 节累加读回 ≥2500 字、小游戏展开后三条细则/船况/说明逐条仍在。另守「只有一层滚动区」「导出按钮 rect 在面板内且 `elementFromPoint` 真命中」「正文滚到底页脚不动」「展开的节顶到滚动区开头且正文 ≥90px 可见」「Enter 仍能直接开始」；另开 390×844 移动页确认抽屉在屏内、单层滚动、导出/导入真能命中、无横向溢出 | dev server |
| `typography-audit.mjs` | **屏幕上所有可见文字的字号分布**：按区域（顶栏/底栏/左右侧栏/地图浮层）分组，统计 <12px / 12~13px / ≥14px 占比，并列出最小的 40 条与所有 <32px 的按钮。中文没有 x-height 缓冲，12px 以下笔画会糊——这类问题读代码看不出来（`text-xs` 在哪都是 12px，但压在深木底上就是读不动） | dev server |
| `font-actual.mjs` | **中文实际由哪个字体绘制**（CDP `CSS.getPlatformFontsForNode`）。CSS 里写的是字体栈，屏幕上用的是回落链里第一个含中文字形的字体；本项目还验证了「只有一个 400 字重 → 所有 font-bold 都是合成假粗体」这类看不见的缺陷 | dev server |
| `intro-check.mjs` | **首分钟三屏**（航海日志 / 你想怎么玩 / 选择你的天赋；第四屏「第一次出航」已删——内容与教程第 4/5 步、模式卡重复，座船卡并进了天赋页底部）的文字对比度、字号下限、面板是否完整落在视口内、选中态是否可辨识、五枚天赋徽章是否真的以 ≥40px 画出来。为什么单独一个脚本：`contrast-audit` 只扫主地图（51 段），首分钟是独立的 z-9999 全屏遮罩，**从来没被审计过**——实测模式页 14 段里 10 段低于 4.5（最差 2.25），天赋页 11 段不达标。判据用**差分掩膜**（拍两次、第二次文字透明，两帧差集即文字掩膜），与入场动画/滚动/对齐都无关；按矩形取分位数的做法会把背景当笔画，报出 2.0x 的假值。`--vw=375 --vh=667` 必须一起跑：375×812 过不代表 667 过（大徽章版本曾把面板撑到 705px）。第 26 轮用它抓到「座船卡」进天赋页时新加的两段 12px 文字只有 3.92 / 4.4:1，提到主名同档金色后达标；注入旧配色实测会红 1 段 | dev server |
| `shot.mjs` | 截图工具：`--vw --vh --dsf --clip=all\|bottom\|left\|side\|year\|res\|panelr\|panell --panel=port`。**只用来判断构图与布局，颜色/对齐/1-2px 一律读 DOM**（裁剪图会误导） | dev server |
| `contrast-audit.mjs` | **文字对比度的真凭实据**：截图后对每段可见文字取「矩形 + 外扩 4px」的像素直方图，剔除接近前景色的分箱，用众数当背景色，按 WCAG AA 判（正文 4.5 / 大字 3.0）。为什么不能只读 CSS：背景是半透明面板叠在地图上，同一个文字色在海面和在羊皮纸上可读性差一倍——实测交易面板有过 1.03:1。`--panel=port\|trade\|fleet\|task\|achievement\|rival\|shipyard\|event` 逐面板跑（`event` = 左栏航海日志：它没有 `data-tut` 且平时为空，脚本会先注入三条模拟记录再审计）。**它自己也踩过四个坑**（SVG 用 fill 不读 color、禁用态不该算失败、被滚动容器裁掉的行要去掉、0×0 的 divIcon 包裹层要用 Range 量文字），都写在注释里。**描边字单独归类**：港口名骑在海岸线上（一半浅色陆地一半深蓝海面），用「奶油填充 + 深褐描边」；按“字 vs 底色众数”算只有 2.81:1，但字 vs 描边 17.86:1。规则：`text-shadow` 里存在与填充色对比 ≥4.5 的颜色就改判「字 vs 描边」，并**单独输出**「其中 N 段靠描边达标」——不静默混进“0 未达标” | dev server |
| `land-texture.mjs` | **陆地（羊皮纸）纹理的颗粒幅度**。取右侧大陆内部 500×380 的样区，只统计暖色（R>175 且 R-B>40）的像素，先扣掉列均值与行均值再算标准差——判据 grain ≥ 6，低于 4 就是「有纹理但看不见」。改前实测 3.21、改后 7.13。**接缝不在这里测**：旧位图 pattern 的台阶只有 1.8 个亮度级，两个统计判据（列差比值、自相关）都抓不到，改成在单测里断言构造方式（图片尺寸必须等于单元、不许 slice） | dev server |
| `debris-3d.mjs` | **2.5D 下的海面漂流物**：切到 3D 后 DOM 数量与 `debrisSpots` 一致、热区 ≥44px、**两两中心距 ≥44px 且每个中心 `elementFromPoint` 命中自己**（远景下三个点投影只差 1~3px，不避让就会「点木桶捞到零钱」）、真实鼠标点击只结算看见的那一个、视野外的点隐藏、`resize` 到 1024×768 后仍可点、切回 2D 数量一致且 3D 节点已销毁。注入验证过：把 `MIN_GAP` 改成 0 → 4 条失败（最小间距 18px、点 barrel 结算 coins） | dev server |
| `no-dialogue-interrupt.mjs` | 面板开着时不会被自动彩蛋对白的全屏遮罩打断。必须把 `day` 推到额度之上，否则彩蛋根本不会触发，**注入 bug 后测试照样通过**（第一版就是这么假通过的）。第 26 轮修掉另一处假红：面板里「上岸走走」会切视角并关掉 `activePanel`，此时彩蛋**合法**弹出；旧脚本下一轮强行重开面板却没清残留对白，到「修理」时误判成「面板开着被打断」。现在每轮先 `skip()` + 复位额度，并把末尾 `\|\| true` 的假绿换成「关面板后彩蛋真的能弹」 | dev server |
| `weather-2d.mjs` | **2D 天气层到底看不看得出「变天」**：阴晴/风雨各态的亮度与色相差分、方向对不对、alpha 采样是否真的落在可见范围（0.055 只差 ±2 级＝看不见），12 条断言 | dev server |
| `logbook.mjs` | **航海日志 / 存档闭环**：三页 tab 齐备、未点亮格子点了有回执、靠岸带回一页见闻 + 侧栏未读小圆点、线索只移地图不出航、达标不再停机且写成称号页、**线索应验**（首次靠上旧线索指向的港 → 见闻+应验共两页、旧页补「已应验 · 第 N 天到的」、图鉴句数从日志推导、岸上陈列同一句文案、再回同港不重复收尾）、导出→改金币→导入→`reload` 真读回、坏文件给中文错误且不进确认态、全程 0 运行时错误。`waitForFunction` 的回调在页面里 eval，**Node 侧变量必须作为第 3 个参数传进去**（第一版把 `label` 写进闭包，报 `not defined`，3 条假失败） | dev server |
| `harbor-view.mjs` | **岸上视角（第二个空间）**：港口面板入口进/出、远景读的是**全景图**（`harbor_europe.webp` 原生 1672×941，不是面板里那张 96px 缩略图）、1440 屏下有效像素密度 ≥0.8（不放大）、可见区域亮度 ≥0.10 且 grain ≥0.015（没被压成黑片）、三块层 rect 齐备、地图层 `pointer-events:none` 不穿透、真实鼠标点服务按钮能开面板且仍留在岸上、Esc 一层层退 / A 键切换、见闻与线索只移地图、出航自动回海图、靠岸邀请条只认 `isSailing` 下降沿、移动端 5 个按钮中心 `elementFromPoint` 全命中自己（掮客卡与底栏不遮挡）、移动端不渲染前景剪影。**常驻空间开关**：桌面侧栏 / 移动底栏各一个双向开关（文字随 `viewMode` 变）、航行中是带原因说明的禁用态、真鼠标来回切、移动端十个入口不裁切；第二趟回同一港要显示「第 N 次靠岸」和「上一趟留下的」并可翻开日志。注入验证 7/7（`.workbuddy/probe-inject-harbor.py`）+ 9/9（`.workbuddy/probe-inject-viewmode.py`）+ 6/6（`.workbuddy/probe-inject-backdrop.py`）全被抓住 | dev server |
| `small-text-audit.mjs` | **中文 12px 下限（多场景）**：18 个界面状态（常态 + 8 侧栏 + 帮助 + 岸上 + 事件卡/结算 + 小游戏说明/进行中 + 出航计划/航段决策/操舵）逐个读 `getComputedStyle`，断言含中文的可见叶子文字没有 <12px、没有被 `overflow:hidden` 截断，且每个场景都有「确实进去了」的特征文案。`typography-audit.mjs` 只看无浮层常态，浮层里 68 条中文小字它一条也看不见；两者不是替代关系。纯符号角标（MiniMap 的 N、WeatherBadge 的 ▾）不含中文，天然不在判据内。3D 视图的 DOM 标签层另用 `.workbuddy/probe-small-text-3d.mjs` 查过一次（0 条），3D 浮层与 2D 共用组件，不必重跑 18 场景 | dev server |

## 写 e2e 时容易踩的坑

- **量「玩家多久看到第一屏」不要用 FCP，也不要用"地图元素在不在"**。
  FCP 在这个环境里与字节数不成比例（上一轮实证）；而 `.leaflet-container` 在开局阶段
  **就已经存在**——地图层是常驻的，开局界面只是盖在它上面。拿它当"进入游戏"的判据
  恒为真，会量出"点一下就进游戏 11ms"这种假数字。可靠判据是"开局界面的按钮出现/消失"
  （`.workbuddy/probe-intro-paint.mjs`：第一屏 = 「翻开日志」可点；进入游戏 = 它消失）。
- **别把"驱动流程的循环耗时"算进被测指标**。走开局 4 屏如果用「每 350ms 点一次」，
  那 1.2s 会被算成"点击到进入游戏的时间"。先走到目标屏、停在按钮上，再单独计时。

- **`document.fonts.check(font, text)` 查不出缺字，别用它**。它把**系统回退字体**也算成
  「这个字体族能画」，所以恒为 true。实测旧子集漏了 41 个字，`check` 一个都没报。
  画布位图对比（webfont vs `serif` 各画一次比像素）也不行：开发机装了同款 Noto Serif SC，
  缺字时「回退」出来的字形几乎一样（航 diff=3 像素、龘 diff=0）。唯一可靠的是 CDP
  `CSS.getPlatformFontsForNode` 里的 `isCustomFont` —— 它说的是「这一笔由哪个字体文件画的」。
- **量首屏必须用「会 gzip 的服务器」，不能拿 `vite preview` 的数字当线上**。
  `vite preview` 不做压缩，而 GitHub Pages 会（实测 2026-11-06：`land.geojson` 1244KB→382KB、
  `sea-mask.bin` 791KB→48KB，**连 `application/octet-stream` 也压**）。同一个产物，
  未压缩尺子读出「首屏 fetch 2.60MB」，gzip 尺子读出「0.52MB」——差 5 倍。
  用 `.workbuddy/serve-gzip.mjs` 起 5190 端口，行为与 Pages 对齐后再量。
- **对照实验要关缓存**。同一个浏览器连开多个页面测「屏蔽某资源后的 FCP」，
  第一档会把 JS 缓存住，后面几档凭空快 1 秒（第一版量出 A 1556ms / B 440ms，
  差点写成「省 1.1 秒」）。用 `Network.setCacheDisabled: true`。
- **FCP 的变化幅度与字节数不成比例时，别把原因归给字节**。实测屏蔽 2MB 的数据文件与
  屏蔽一个 25KB 的字体，FCP 都降约 500ms（无头环境绘制慢、主线程解码排队）——
  说明那个差值不是「传输时间」，据此去压数据文件等于白干。看瀑布图比看差值可靠。


- **别拿界面上恒定存在的词当断言**。想验「补给不够时给了抢行退路」，
  直接 `/抢行/.test(面板全文)` 永远为真——折叠区收起摘要本来就印着
  「抢行最快最险 · 谨慎最慢最稳」。判据要锁定那句带具体总量的子文案
  （`回港补给，或一路「抢行」：全程只需 15 粮 / 24 水`），才测得到它真的出现。
- **「承诺类」功能要用对照组测**。参观模式的「不会输」如果只测「推 10 天还活着」，
  那「advanceDay 根本没跑起来」也会通过。所以同一脚本里必须先跑船长模式，
  让它在同样条件下真的翻船（第 2 天 gameover），才算证明这组条件有效。
  同理 `visitor-mode.mjs` 里那条「天数确实推进了」（1 → 19）就是防这个假绿的。
- **`--mode=visitor` 这类「第二套界面」要单独审计**。参观模式和船长模式共用主界面，
  但多一枚「参观」徽标、少教程；`contrast-audit` 默认只跑船长模式，54 vs 53 段
  的差别就是那枚新徽标——不单独跑就永远没人审它。
- **「点了没反应」先查有没有整屏遮罩，别急着怀疑事件绑定**。首局那次的根因是
  开场致辞排在教程之后：教程一结束 `dialogueOpen` 变 true，`bg-black/45` 铺满全屏，
  侧栏按钮 DOM 在、`getBoundingClientRect` 正常、`computedStyle` 也没问题，
  只有 `document.elementFromPoint` 会告诉你命中的是 `DIV.absolute inset-0 bg-black/45`。
  现在 `useDialogueStore` 也挂了 dev 钩子（`window.__dialogueStore`），e2e 可以直接读
  `scriptId` 判断"是对白开着"还是"页面坏了"，不用再靠 body 文案猜。
- **判"照推荐走能不能赚钱"必须让脚本真的照推荐走**。第一版探针按"单价最低"买货，
  结果 500 金买烟草 → 卖到最近的加的斯只 +2/件，净赚 0，看起来像游戏经济崩了；
  换成点掮客推荐的那一行，同一套代码净赚 445。**测出来的 0 是探针的错误策略，
  不是产品的问题**——这种"测试自己犯错然后写成结论"最危险。
- **`page.screenshot({encoding:'base64', path})` 不会落盘**。两个参数一起给时只认
  `encoding`，返回的是字符串而不是 Buffer，`writeFileSync` 那步根本没跑——
  脚本自己能算出亮度（因为算的是返回值），人却找不到截图。固定写法：先拿
  Buffer，自己 `writeFileSync`，再把同一份 `toString('base64')` 交给 `page.evaluate` 采样。
- **用 Python 改这个仓库的源码必须 `newline=''`**。仓库是 CRLF，`Path.read_text()`
  会做 universal-newline 转换（`\r\n`→`\n`），再 `write_text()` 就写成纯 LF：
  文件内容没变但**行尾全变**，注入脚本"还原后 sha 不一致"，diff 也可能被整篇污染。
  读写两端都用 `open(p, newline='')`。
- **"参数对不对"别用截图亮度门限守**。岸上背景的压暗参数改对后，实测亮度 0.146，
  压回旧参数是 0.11——两次采样本身还差 ±0.02（动画相位），门限卡在中间必然偶发误报。
  分工是：e2e 只守"没被压成黑片"（≥0.10），**参数本身**（brightness ≥0.85、
  暗角外圈 <0.80）用单测源码守卫抓，注入 0.92 立刻失败。
- **开场对话会锁住整个地图**。`DialogueOverlay` 铺了一层 `absolute inset-0 bg-black/45`，
  对话期间地图上的一切都点不到——这是**正常设计**（对话中不该能操作地图），
  但用 `__gameStore.setState({gamePhase:'playing'})` 直接跳进地图时，对话会被触发，
  于是「面板按钮点不动」，看着像 bug。构造场景时一并设
  `dialogueSeen: ['opening_pilot']` 跳过开场对话。
- **但只设 `dialogueSeen` 不够**：那个 effect 在首次 render（persist hydrate 之前）
  可能已经 `open()` 了致辞，之后 `setState` 只改触发条件，**不会把已打开的致辞收掉**。
  本轮 `logbook.mjs` 注入一段到港状态后就是这样：点侧栏全部无效、`activePanel` 保持
  `null`，而直接读 DOM 的岸上断言却照常通过（它不经过点击）。判据看页面里有没有
  「Esc 跳过致辞」；点任何面板前按一次 Esc 并等这行字消失（用真实玩家操作，
  不要用内部 store 强关），`logbook.mjs` 的 `dismissDialogue()` 就是这个用途。
- **`textContent` / `innerText` 读到 ≠ 玩家看得见**。帮助面板改前把存档区放在
  第二层滚动容器的末尾：`innerText` 里「导出存档」四个字一直在，旧 e2e 全绿，
  但实测按钮 `top=863`、面板底边 `673`，被 `overflow:hidden` 裁在面板外。
  判「找得到」必须量 `getBoundingClientRect()` 是否落在父容器与视口内，
  再用 `elementFromPoint(中心)` 确认真能命中；并把按钮放进不随正文滚动的页脚。
- **`ParchmentCard` 自己已经有一层 `ScrollFade` 滚动区**，面板内部不要再写
  `scroll-parchment max-h-…`，否则两层滚动条、底部操作入口永远滚不到。
  需要常驻内容用可选 `footer` prop（有 footer 时正文滚动区自动让出高度）。
- **折叠不等于展开得开**：目录本身占半屏，点开一节后正文会被挤在下面只露一行半。
  展开时把该节顶到滚动区开头（`scrollTop += delta - 4`），并断言正文可见高度 ≥90px。
- **「0 条小字」很可能是场景根本没进去**。`small-text-audit.mjs` 第一版把
  `activePanel` 写成 `tasks/rivals/logbook/events`，实际名字是
  `task/rival/event`（见 `MainMap.tsx` 的 `LEFT_PANELS`），于是 10 个面板里 6 个
  报「0 条 <12px」的全是假绿。现在每个场景都断言一句页面上必须出现的特征文案，
  并断言采到的中文条数 >20（不是空页面）。
- **组件内部 state 不会因换 store 数据而重置**。`EventCard` 的 `outcome` /
  `miniGame` 是 `useState`：第二次直接 `setState({currentEvent: 新事件})` 时组件没卸载，
  仍停在上一次的结算页，于是「事件结算 / 小游戏说明 / 进行中」三个场景抓到的是
  同一屏。要先 `currentEvent:null` 卸载、等一拍，再重开。
- **`innerText` 收不到某些浮层文字，用 `textContent` 判场景**。本轮调试里
  事件卡明明在（`div.fixed.inset-0` 的 `textContent` 有全文），
  `document.body.innerText` 却只返回地图那一段；用 innerText 找特征文案会假失败。
- **出航计划要用真实 store 动作生成**。手搓
  `pendingVoyage: {waypoint, route:{from,to,points}}` 会缺 `route.distance` /
  `windFavor`，组件读 `undefined.toFixed()` 直接抛错，且屏上什么也不渲染。
  一律 `sailToWaypoint({latitude, longitude, portId, name})`。
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
- 旧写法（出航计划判定改回 `Math.min(...ledgers.map(l => l.food))`）→
  `supply-parity.mjs` 报「粮=17（抢行够 15、按部就班要 18）必须报不够」+「没给抢行退路」两条；
  旧写法（把「港内每日 / 起航后按部就班」改回基础消耗「每日耗 3 粮 / 5 水」）→ 5 条红。
  两个注入同时让源码守卫单测红。脚本：`.workbuddy/probe-inject-supply.py`（自动还原并校验 sha）。
- 旧写法（把主屏两处 `<VoyageNextHint>` 都撤掉，退回「只挂在面板里」）→
  `next-port-hint.mjs` 报 29 条红；数字写死（9999 海里 / 99 天）→ 同源对账 2 条红；
  移动端误用桌面两行结构 →「只占一行」「收起细账」2 条红。3/3 被抓，脚本
  `.workbuddy/probe-inject-nexthint.py`。**这一轮还踩到一个注入陷阱**：
  把 `{cond && <Comp/>}` 里的组件换成 `{null}` 会生成 `{cond && {null}}` 语法错误，
  Vite 编译失败、页面空白、store 钩子挂不上，e2e 以「空指针崩溃」退出而不是断言报红 ——
  那种红不算抓到。注入必须保证**代码仍能编译**；巡检也补了「页面未就绪」的明确失败行。
- 旧写法（回执条 `receipt.latest ?` 写死 `false`，退回「只藏在日志里」）→
  `arrival-receipt.mjs` 报 16 条红；主屏改回写死「有新内容」→ 同源对账 3 条红；
  点回执改成打开冒险笔记 →「打开的是航海日志」「见闻页显示这一页」「未读归零」等 5 条红。
  3/3 被抓，单测源码守卫同时红 2/3 案例，脚本 `.workbuddy/probe-inject-receipt.py`。
  注入案例①最初让巡检在 `r1.point` 处空指针崩溃 —— 又是一次「崩溃退出 ≠ 断言报红」，
  已把点击坐标改成可选链兜底，让断言明确失败。
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
