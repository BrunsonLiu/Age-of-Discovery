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
npm run test:e2e:all      # 以上全部
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
| `map-check.mjs` / `map-diag.mjs` | 地图视觉复核与诊断（辅助脚本） | dev server |
| `audio-live.mjs` | 真实音频能量、BGM 情绪跟随、总开关、静音恢复 | dev server |

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

改坏代码后测试必须**失败**。改 `EventScene` 的失败状态写法就能验：

- 旧写法（全局布尔值 `imgFailed`）→ `scene-img-failed-reset.mjs` 第②条断言失败，
  chart 场景被误伤退化成 SVG。

这一步别省。全绿的测试可能只是测了个寂寞。
