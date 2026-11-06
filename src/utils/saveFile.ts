/**
 * 存档的导出 / 导入（纯前端，零服务端）。
 *
 * 【为什么必须先有这个】
 * 存档只落在 localStorage：清缓存、换设备、无痕模式 = 全丢。
 * 一旦游戏开始承诺「日志会一页页变厚」，那就是在承诺一份**累积资产**，
 * 而资产随时可能消失就是句假话。Flash 时代 4399 那批小游戏靠手动拷 .sol
 * 事后补救，我们可以从一开始就给一个能带走的 JSON 文件。
 *
 * 【为什么不重新序列化 state】
 * 导出的就是 localStorage 里 persist 写下的**原文**（{state, version}）。
 * 重新组装一份等于引入第二套口径，任何漏字段、类型漂移都只有玩家会撞上；
 * 原文交给同一份 migrate / merge 读回去，和刷新页面走的是完全同一条路径。
 *
 * 【为什么导入要按白名单过滤】
 * persist 的 merge 是 `{...current, ...persisted}`。恶意或误编辑的文件里
 * 若写了 `setActivePanel: 123`，会把 store 的 action 函数覆盖掉，整个界面崩。
 * 只放行 partialize 认可的字段，函数永远留在 current 里。
 */

export const SAVE_KEY = 'age-of-discovery-save'
/** 与 useGameStore.ts 的 persist version 保持一致；升版本时两处一起改 */
export const SAVE_VERSION = 16

/**
 * 导入白名单 = persist 的 partialize 字段表。
 * 两份清单由 test/logic.test.ts 的一致性断言守着，改一处忘另一处会直接测试失败。
 */
export const SAVE_FIELDS = [
  'fleet', 'currentRoute', 'routeProgress', 'routeOrigin', 'waypoint',
  'shipPosition', 'simSpeed', 'completedTasks', 'activeTasks', 'eventLog',
  'discoveredPorts', 'gamePhase', 'tutorialStep', 'seenHistoricalEvents',
  'lastEventDay', 'marketStock', 'seenMarketTips', 'victoryDay', 'eventFlags',
  'stats', 'achievements', 'pendingVoyage', 'routeIntel', 'rivals', 'rivalNews',
  'officers', 'factionRep', 'crewRoster', 'notoriety', 'pendingHelm',
  'helmAdvance', 'weather', 'dialogueSeen', 'gameMode',
  'logbook', 'claimedVictories', 'collectedDebris',
] as const

export interface SaveFile {
  version: number
  state: Record<string, unknown>
}

export type ParseResult =
  | { ok: true; value: SaveFile }
  | { ok: false; error: string }

/**
 * 校验一份存档文本。
 *
 * 拒绝"来自未来"的版本：旧客户端不认识新字段，硬读会静默丢掉玩家的日志页。
 * 允许更旧的版本：persist 的 migrate 会逐版本补齐，这正是它存在的意义。
 */
export function parseSaveText(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: '这不是存档文件：内容无法解析（请选择导出的 .json）' }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '这不是存档文件：格式不对' }
  }
  const obj = raw as Record<string, unknown>
  if (typeof obj.version !== 'number' || !Number.isFinite(obj.version)) {
    return { ok: false, error: '存档缺少版本号，无法安全读入' }
  }
  if (obj.version > SAVE_VERSION) {
    return { ok: false, error: `这份存档来自更新的版本（v${obj.version}），当前是 v${SAVE_VERSION}，导入会丢东西，已拒绝` }
  }
  const state = obj.state
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { ok: false, error: '存档里没有游戏数据' }
  }
  const s = state as Record<string, unknown>
  const fleet = s.fleet
  if (!fleet || typeof fleet !== 'object' || typeof (fleet as Record<string, unknown>).gold !== 'number') {
    return { ok: false, error: '存档不完整：缺少舰队数据' }
  }

  const filtered: Record<string, unknown> = {}
  for (const key of SAVE_FIELDS) {
    if (key in s) filtered[key] = s[key]
  }
  // 新字段在老存档里不存在：交给 migrate 补，这里不擅自编造
  return { ok: true, value: { version: obj.version, state: filtered } }
}

/** localStorage 里的存档原文；没有存档时返回 null（由 UI 提示） */
export function readSaveText(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(SAVE_KEY)
}

/** 导出：原样下载 persist 写下的那串 JSON */
export function downloadSave(): boolean {
  const text = readSaveText()
  if (!text) return false
  const parsed = parseSaveText(text)
  const fleet = parsed.ok ? (parsed.value.state.fleet as Record<string, unknown> | undefined) : undefined
  const day = typeof fleet?.day === 'number' ? fleet.day : 0
  const stamp = new Date().toISOString().slice(0, 10)
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `航海日志-第${day}天-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 立刻 revoke 在部分浏览器会截断下载；留到下一个宏任务再释放
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return true
}

/**
 * 导入：写回 localStorage，由调用方 reload 触发 rehydrate + migrate。
 * 不在写入后手工 setState —— 那样会绕开版本迁移，等于第二条读档路径。
 */
export function applySaveText(text: string): ParseResult {
  const parsed = parseSaveText(text)
  if (!parsed.ok) return parsed
  if (typeof localStorage === 'undefined') {
    return { ok: false, error: '当前浏览器不允许本地存储，无法导入' }
  }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(parsed.value))
  } catch {
    return { ok: false, error: '写入本地存储失败（可能是隐私模式或空间不足）' }
  }
  return parsed
}
