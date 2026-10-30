/* 逻辑冒烟测试：验证事件链、特质、价格、成就、航速、情报、军官、竞争船长真实生效 */
import { events } from '../src/data/events'
import { checkEventTrigger, consumeEventFlags, selectOutcome } from '../src/utils/eventEngine'
import { SCENE_KEYS } from '../src/components/events/EventScene'
import { applyTraitToOutcome, priceMultiplier, traits } from '../src/data/traits'
import { checkAchievements, achievements } from '../src/data/achievements'
import { GAME_BALANCE } from '../src/data/gameConfig'
import { RIVALS } from '../src/data/rivals'
import { OFFICERS } from '../src/data/officers'
import { effectiveFleetSpeed, calculateSailingDays, dailyDistanceNm, routeProgressOf } from '../src/utils/navigation'
import { WEATHER_INFO, weatherCell, weatherDuration, weatherFavorFactor } from '../src/utils/weather'
import type { WeatherState } from '../src/types'
import {
  dailyRates, daysToDestination, formatSupplyDays, moraleLevel, supplyDaysRemaining, supplyLevel,
} from '../src/utils/voyage'
import {
  adjustedOutcomes, crewLossChance, expectedDeltas, outcomeHarm, riskGrade, summarizeChoice,
  CHIP_MIN_EV, type AdjustedOutcome, type ChoiceSummary,
} from '../src/utils/eventSummary'
import { adjustOutcome, clampOutcomeToFleet } from '../src/utils/outcomeAdjust'
import { buildTerrainSymbols } from '../src/utils/terrainDecor'
import {
  STANCES, forecastSegment, stanceLedgers, segmentCountFor, segmentIndexFor, nextSegmentBoundary,
  dailyFoodUse, dailyWaterUse, dailyWearRate, settleWear, describeStanceTradeoff,
} from '../src/utils/segment'
import { generateRouteIntel, settleOfficerWages, advanceRivals, selectBuyPrice, selectSellPrice, selectPriceTone, OFFER_PRICE_RATIO } from '../src/store/useGameStore'
import { FACTIONS, factionAttitude, portFaction } from '../src/data/factions'
import { CREW_CHARS, CREW_CHAR_MAP } from '../src/data/crewChars'
import { TITLES, currentTitle, dominantAxis } from '../src/data/titles'
import {
  HELM_DURATION, HELM_FAVOR_ARC, HelmWindSim,
  advanceHelmShip, angleDiff, evaluateHelmRun, helmFavor, helmReward, inFavorArc,
  normalizeAngle, type HelmSample,
} from '../src/utils/helm'
import { useGameStore } from '../src/store/useGameStore'
import { SHIP_SPRITES, SPECIAL_SPRITES, shipSprite } from '../src/data/shipSprites'
import { crewPortrait, officerPortrait, rivalPortrait } from '../src/data/portraits'
import { sceneImage, shouldUseSceneImage } from '../src/data/sceneImages'
import { UI_ASSETS } from '../src/data/uiAssets'
import { getStatusColor } from '../src/utils/resourceColor'
import { FX_ASSETS, BG_ASSETS } from '../src/data/envAssets'
import { portImage } from '../src/data/portImages'
import {
  DIALOGUE_SCRIPTS, OPENING_SCRIPT_ID,
  advanceDialogueIndex, getScript, getSpeaker,
} from '../src/utils/dialogue'
import { useDialogueStore } from '../src/store/useDialogueStore'
import {
  BOARDING_WAVES,
  CANNON_AIM_TIME,
  CANNON_BRACE_MARK,
  CANNON_GRAZE_HALF,
  CANNON_HIT_HALF,
  CANNON_VOLLEYS,
  ESCAPE_DIRS,
  ESCAPE_TELEGRAPH,
  ESCAPE_WAVES,
  GAMBLE_BANKROLL,
  GAMBLE_DICE,
  GAMBLE_ROUNDS,
  GAMBLE_SPREAD,
  GAMBLE_STAKE,
  HAGGLE_EXIT_CONCESSION,
  MINI_GAME_COPY,
  HAGGLE_FLOOR,
  HAGGLE_ROUNDS,
  HAGGLE_START_PRICE,
  LOOKOUT_MAX_LEN,
  LOOKOUT_MAX_ROUNDS,
  LOOKOUT_START_LEN,
  STORM_ROUNDS,
  STORM_ROUND_LIMIT,
  biasProbabilities,
  boardingPerformance,
  computeModifiers,
  createBoardingState,
  createCannonState,
  createGambleState,
  createEscapeState,
  createHaggleState,
  createLookoutState,
  createStormState,
  dealGamble,
  describeModifiers,
  dodgeEscape,
  escapePerformance,
  escapeWindow,
  gamblePerformance,
  haggleAction,
  hagglePerformance,
  lookoutPerformance,
  outcomeMerit,
  placeGambleBet,
  pressLookout,
  advanceLookout,
  cashOutGamble,
  nextGambleRound,
  skipGambleRound,
  stormPerformance,
  advanceBoarding,
  advanceCannon,
  advanceEscape,
  advanceHaggle,
  advanceLookout,
  advanceStorm,
  braceCannon,
  cannonPerformance,
  fireCannon,
  pushPlank,
  tryReef,
} from '../src/utils/miniGame'
import type { OfficerId } from '../src/types'
import { emitUiCommand, onUiCommand } from '../src/utils/uiBus'
import { ports, portGoods } from '../src/data/ports'
import { goods } from '../src/data/goods'
import {
  TUTORIAL_STEPS,
  TUTORIAL_STEP_COUNT,
  TUTORIAL_STEP_TEXTS,
  TUTORIAL_TARGETS,
} from '../src/constants/tutorial'
import {
  WEATHER_INFO, WEATHER_KINDS, advanceWeather, createInitialWeather,
  isNotableWeather, weatherCell, weatherDuration, weatherFavorFactor,
  weatherForecast, weatherKindForCell, windSpeedFor,
} from '../src/utils/weather'
import { calculateBearing } from '../src/utils/navigation'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { EventOutcome, Fleet, MiniGameId, Route } from '../src/types'
import {
  greatCircleNm, greatCirclePoint, buildRouteGeometry, positionAtNm, traveledNmAt,
} from '../src/utils/routePath'
import { findSeaPath } from '../src/utils/seaRoute'

let passed = 0
let failed = 0
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`) }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`) }
}

console.log('== 1. 事件数据结构 ==')
assert(events.length === 56, `事件总数 56（实际 ${events.length}）`)
const ids = events.map(e => e.id)
assert(new Set(ids).size === ids.length, '事件 id 无重复')
const sceneSet = new Set(SCENE_KEYS)
const missingScene = events.filter(e => e.sceneKey && !sceneSet.has(e.sceneKey))
assert(missingScene.length === 0, `所有 sceneKey 已注册（缺失：${missingScene.map(e => e.id).join(',') || '无'}）`)
const noScene = events.filter(e => !e.sceneKey)
assert(noScene.length === 0, `所有事件都有 sceneKey（缺失：${noScene.map(e => e.id).join(',') || '无'}）`)

console.log('== 2. 概率合法性 ==')
for (const e of events) {
  for (const c of e.choices) {
    const sum = c.outcomes.reduce((s, o) => s + o.probability, 0)
    assert(Math.abs(sum - 1) < 0.001, `事件 ${e.id}「${c.text.slice(0, 8)}…」概率和 = ${sum.toFixed(2)}`)
    for (const o of c.outcomes) {
      assert(o.probability > 0, `事件 ${e.id} 结局概率 > 0`)
    }
  }
}

console.log('== 3. 事件链：旗标 ==')
const baseState = {
  fleet: { id: 1, name: 't', gold: 0, fame: 0, morale: 70, food: 100, water: 100, currentPortId: null, isSailing: true, day: 30, ships: [], cargo: [], flagshipId: 1, trait: null },
  currentRoute: { id: 1, fromPortId: 1, toPortId: 2, distance: 100, dangerLevel: 3 as const, windFavor: 1 },
  routeProgress: 0, waypoint: null, completedTasks: [], activeTasks: [], eventLog: [], discoveredPorts: [], currentEvent: null,
  gamePhase: 'playing' as const, marketStock: {}, seenMarketTips: [], victoryDay: null, eventFlags: {}, stats: { daysSailed: 0, trades: 0, bestDeal: 0, tradeProfit: 0, pirateWins: 0, eventsSurvived: 0, historySeen: 0 }, achievements: [],
  pendingVoyage: null, stance: 'steady' as const, routeIntel: {}, rivals: [], rivalNews: [], officers: [],
  factionRep: { crown: 0, guild: 0, scholars: 0, brethren: 0 },
  crewRoster: [],
  notoriety: { cruel: 0, mercy: 0, greed: 0, bold: 0, secret: 0 },
}
const evGhostThanks = events.find(e => e.id === 203)!
const evTreasure = events.find(e => e.id === 207)!
const evFragment = events.find(e => e.id === 204)!

// 无旗标 → 幽灵船的谢礼不触发（概率拉满也无效）
assert(!checkEventTrigger({ ...evGhostThanks, triggerCondition: { ...evGhostThanks.triggerCondition, probability: 1 } }, baseState), '无 ghost_encounter 时 203 不触发')
assert(checkEventTrigger({ ...evGhostThanks, triggerCondition: { ...evGhostThanks.triggerCondition, probability: 1 } }, { ...baseState, eventFlags: { ghost_encounter: 1 } }), '有 ghost_encounter 时 203 触发')
const consumed = consumeEventFlags(evGhostThanks, { ghost_encounter: 1, smuggler_contact: 1 })
assert(!consumed.ghost_encounter && consumed.smuggler_contact === 1, '203 触发后消耗 ghost_encounter、保留其他旗标')

// 残片防重
assert(!checkEventTrigger({ ...evFragment, triggerCondition: { ...evFragment.triggerCondition, probability: 1 } }, { ...baseState, eventFlags: { map_fragment_1: 1 } }), '已持有残片1 时 204 不重复触发')
// 藏宝图需三旗标
assert(!checkEventTrigger({ ...evTreasure, triggerCondition: { ...evTreasure.triggerCondition, probability: 1 } }, { ...baseState, eventFlags: { map_fragment_1: 1 } }), '缺旗标时 207 不触发')
assert(checkEventTrigger({ ...evTreasure, triggerCondition: { ...evTreasure.triggerCondition, probability: 1 } }, { ...baseState, eventFlags: { map_fragment_1: 1, map_fragment_2: 1, map_fragment_3: 1 } }), '三旗标齐全时 207 触发')

// 低士气事件（哗变）
const evMutiny = events.find(e => e.id === 211)!
assert(!checkEventTrigger({ ...evMutiny, triggerCondition: { ...evMutiny.triggerCondition, probability: 1 } }, baseState), '士气 70 时哗变不触发')
assert(checkEventTrigger({ ...evMutiny, triggerCondition: { ...evMutiny.triggerCondition, probability: 1 } }, { ...baseState, fleet: { ...baseState.fleet, morale: 30 } }), '士气 30 时哗变触发')

console.log('== 4. 特质结算 ==')
const raw = { goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 20, durabilityChange: -40, crewChange: -8 }
const bulwark = applyTraitToOutcome(raw, 'bulwark')
assert(bulwark.durabilityChange === -34, `铁壁：耐久损 -40 → -34（实际 ${bulwark.durabilityChange}）`)
const leader = applyTraitToOutcome(raw, 'leader')
assert(leader.moraleChange === 25, `魅力：士气 +20 → +25（实际 ${leader.moraleChange}）`)
const surgeon = applyTraitToOutcome(raw, 'surgeon')
assert(surgeon.crewChange === -6, `医生：船员损 -8 → -6（实际 ${surgeon.crewChange}）`)
const none = applyTraitToOutcome(raw, null)
assert(none.durabilityChange === -40 && none.moraleChange === 20 && none.crewChange === -8, '无特质不改变数值')

console.log('== 5. 价格系数 ==')
assert(priceMultiplier({ fame: 0, trait: null }) === 1, '无声望无特质 = 1.0')
assert(priceMultiplier({ fame: 40, trait: null }) === 0.95, '声望40 → 0.95')
assert(priceMultiplier({ fame: 100, trait: null }) === 0.9, '声望100 → 0.90')
assert(priceMultiplier({ fame: 0, trait: 'merchant' }) === 0.95, '商界血脉 → 0.95')
assert(priceMultiplier({ fame: 100, trait: 'merchant' }) === 0.85, '声望100+商界血脉 → 0.85')

console.log('== 6. 成就判定 ==')
const richState = { ...baseState, fleet: { ...baseState.fleet, gold: 1200, day: 60 }, discoveredPorts: [1,2,3,4,5,6], completedTasks: [1,2,3,4,5], achievements: [], stats: { ...baseState.stats, trades: 25, bestDeal: 600, pirateWins: 3, eventsSurvived: 16, historySeen: 5 }, eventFlags: { treasure_found: 1 } }
const unlocked = checkAchievements(richState)
const unlockedIds = unlocked.map(a => a.id)
for (const expectId of ['merchant_1000', 'sailor_50', 'explorer_5', 'contractor', 'trade_master', 'big_deal', 'pirate_slayer', 'eventful_15', 'historian', 'treasure_hunter']) {
  assert(unlockedIds.includes(expectId), `成就解锁：${expectId}`)
}
assert(!unlockedIds.includes('tycoon_20000') && !unlockedIds.includes('explorer_all'), '未达成条件不误锁')
const poorState = { ...baseState, fleet: { ...baseState.fleet, gold: 10, day: 2 }, discoveredPorts: [6], completedTasks: [], achievements: [], stats: { ...baseState.stats } }
assert(checkAchievements(poorState).length === 0, '新开局无成就误锁')

console.log('== 7. 引擎鲁棒性 ==')
const r1 = selectOutcome([{ probability: 0.5, goldChange: 1, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, description: '' }, { probability: 0.5, goldChange: 2, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, description: '' }])
assert(r1.goldChange === 1 || r1.goldChange === 2, 'selectOutcome 返回合法结局')
const { getRandomEvents } = await import('../src/utils/eventEngine')
let threw = false
try { for (let i = 0; i < 200; i++) getRandomEvents(baseState, events, i % 6 === 0 ? 99 : 1) } catch { threw = true }
assert(!threw, 'getRandomEvents 200 次抽样无异常')
assert(getRandomEvents(baseState, events, 1) === null, '事件间隔 <5 天时不触发')

console.log('== 8. 航段方针档案 ==')
// 方针是游戏里**唯一**的速度/风险旋钮（原「航速档位」已并入）。
// 这里锁定它的倍率表——改了这些数字，玩家的因果推演就全错了。
assert(STANCES.rush.speedMul === 1.7 && STANCES.rush.supplyMul === 1.5 && STANCES.rush.wearMul === 2.2 && STANCES.rush.eventRateMul === 1.8, '抢行：速度×1.7 / 补给×1.5 / 磨损×2.2 / 遇事×1.8')
assert(STANCES.steady.speedMul === 1 && STANCES.steady.supplyMul === 1 && STANCES.steady.wearMul === 1 && STANCES.steady.eventRateMul === 1, '按部就班：全部基准')
assert(STANCES.careful.speedMul === 0.6 && STANCES.careful.supplyMul === 1 && STANCES.careful.wearMul === 0.3 && STANCES.careful.eventRateMul === 0.3, '谨慎：速度×0.6 / 补给×1 / 磨损×0.3 / 遇事×0.3')
assert(STANCES.rush.moraleDelta === -3 && STANCES.steady.moraleDelta === 0 && STANCES.careful.moraleDelta === 3, '士气代价：抢行 -3 / 按部就班 0 / 谨慎 +3')

console.log('== 8b. 每日消耗口径（预测层与结算层必须一致） ==')
// 关键回归：过去 forecastSegment 用 ceil(base×mul×days)，
// 而 store 用 ceil(base×mul) 每天扣一次——两者差最多 1 份粮，
// 于是"面板预测 32 份、实际扣 33 份"。现在共用同一套取整函数。
assert(dailyFoodUse(10, 1) === 10 && dailyFoodUse(10, 1.5) === 15, '食物：基准 10、按部就班 10、抢行 15')
assert(dailyFoodUse(10, 1.5, 0.8) === 12, '食物：抢行×厨子减益 0.8 → 12（ceil(10×1.5×0.8)）')
assert(dailyWaterUse(15, 1) === 15 && dailyWaterUse(15, 0.6) === 9, '淡水：基准 15、谨慎 9')

console.log('== 8b-2. 磨损累进余数（倍率必须真正生效） ==')
// 回归点：过去每天取整，Math.round(0.3)=0 → 谨慎方针「船永不磨损」；
// 而且 ×2.2 被 ×1.7 的天数缩短抵消（抢行 3 天 6 点 vs 按部就班 5 天 5 点）。
assert(dailyWearRate(STANCES.careful) === 0.3 && dailyWearRate(STANCES.steady) === 1 && dailyWearRate(STANCES.rush) === 2.2, '磨损倍率为小数，不被取整抹平')
// 谨慎 8 天 ×0.3 = 2.4 → 磨 2 点
assert(settleWear(0, 0.3, 8).points === 2, `谨慎 8 天 ×0.3 = 2.4 → 磨 2 点（实际 ${settleWear(0, 0.3, 8).points}）`)
// 按部就班 5 天 ×1 = 5 点
assert(settleWear(0, 1, 5).points === 5, `按部就班 5 天 ×1 = 5 点（实际 ${settleWear(0, 1, 5).points}）`)
// 抢行 3 天 ×2.2 = 6.6 → 磨 6 点
assert(settleWear(0, 2.2, 3).points === 6, `抢行 3 天 ×2.2 = 6.6 → 磨 6 点（实际 ${settleWear(0, 2.2, 3).points}）`)
// 余数必须跨天保留：每天 ×0.3
// day1 0.3→0｜day2 0.6→0｜day3 0.9→0｜day4 1.2→扣1(余0.2)
// day5 0.5→0｜day6 0.8→0｜day7 1.1→扣1(余0.1)｜day8 0.4→0
// 8 天共扣 2 点，与 settleWear(0, 0.3, 8) 一致
{
  let carry = 0
  const daily = [0, 0, 0, 1, 0, 0, 1, 0]
  let total = 0
  for (let d = 1; d <= 8; d++) {
    const r = settleWear(carry, 0.3, 1)
    carry = r.carry
    total += r.points
    assert(r.points === daily[d - 1], `谨慎第 ${d} 天扣 ${daily[d - 1]} 点（实际 ${r.points}）`)
  }
  assert(total === 2, `谨慎 8 天共扣 2 点（实际 ${total}）`)
  assert(carry >= 0 && carry < 1, `余数保持在 [0,1)（实际 ${carry}）`)
}
// 全程比值：谨慎的磨损应当明显低于按部就班（这才说明倍率生效了）
{
  const careTotal = settleWear(0, 0.3, 50).points
  const steadyTotal = settleWear(0, 1, 30).points
  const rushTotal = settleWear(0, 2.2, 18).points
  assert(careTotal < steadyTotal && steadyTotal < rushTotal, `全程磨损递增：谨慎 ${careTotal} < 按部就班 ${steadyTotal} < 抢行 ${rushTotal}`)
  assert(rushTotal / steadyTotal > 1.2, `抢行的磨损明显高于按部就班（${(rushTotal / steadyTotal).toFixed(2)} 倍）`)
}

console.log('== 8c. 航段预测与方针总账 ==')
const fcBase = forecastSegment({
  segmentDistanceNm: 100, nmPerDay: 20, dailyFood: 10, dailyWater: 15,
  dailyEventRate: 0.25, stance: STANCES.steady,
})
assert(fcBase.days === 5, `按部就班：100 海里 ÷ 20 海里/天 = 5 天（实际 ${fcBase.days}）`)
const fcRush = forecastSegment({
  segmentDistanceNm: 100, nmPerDay: 20, dailyFood: 10, dailyWater: 15,
  dailyEventRate: 0.25, stance: STANCES.rush,
})
assert(fcRush.days === 3, `抢行：100 ÷ (20×1.7) = 3 天（实际 ${fcRush.days}）`)
assert(fcRush.food === 45, `抢行：每日 15 份 × 3 天 = 45 份（实际 ${fcRush.food}）`)
assert(fcRush.wear === 6, `抢行：3 天 ×2.2 = 6.6 → 磨 6 点（实际 ${fcRush.wear}）`)
assert(fcRush.events > fcBase.events, '抢行遇事次数高于按部就班')
// 谨慎不再是「零磨损」：8 天 ×0.3 = 2.4 → 2 点
const fcCareful = forecastSegment({
  segmentDistanceNm: 100, nmPerDay: 20, dailyFood: 10, dailyWater: 15,
  dailyEventRate: 0.25, stance: STANCES.careful,
})
assert(fcCareful.wear === 2, `谨慎：8 天 ×0.3 = 2.4 → 磨 2 点（实际 ${fcCareful.wear}）`)
assert(fcCareful.wear > 0 && fcCareful.wear < fcBase.wear, '谨慎磨损少于按部就班但不为零')

// 总账：三方针并排，delta 相对「按部就班」
const ledgers = stanceLedgers({
  distanceNm: 600, baseNmPerDay: 20, dailyFood: 10, dailyWater: 15, dailyEventProb: 0.25,
})
assert(ledgers.length === 3, '总账给出三个方针')
const lRush = ledgers.find(l => l.stance.id === 'rush')!
const lSteady = ledgers.find(l => l.stance.id === 'steady')!
const lCareful = ledgers.find(l => l.stance.id === 'careful')!
assert(lSteady.days === 30, `按部就班 600÷20 = 30 天（实际 ${lSteady.days}）`)
assert(lRush.days === 18, `抢行 600÷34 = 17.6 → 18 天（实际 ${lRush.days}）`)
assert(lCareful.days === 50, `谨慎 600÷12 = 50 天（实际 ${lCareful.days}）`)
assert(lRush.delta.days === lRush.days - lSteady.days, 'delta 天数 = 与按部就班之差')
assert(lCareful.delta.days > 0 && lRush.delta.days < 0, '谨慎多花天数、抢行少花天数')
// 三角关系：抢行更省粮（天数少）、谨慎更费粮（天数多）
assert(lRush.food < lSteady.food, '抢行天数少 → 总粮更省')
assert(lCareful.food > lSteady.food, '谨慎天数多 → 总粮更费')
// 没有任何方针是纯赚：抢行撞船更多，谨慎船更稳
assert(lRush.wear > lSteady.wear, '抢行更伤船')
assert(lCareful.wear < lSteady.wear, '谨慎更护船')

console.log('== 8d. 航段划分与航线进度 ==')
assert(segmentCountFor(3) === 2, '极短航程至少 2 段（太短也要给两次抉择）')
assert(segmentCountFor(50) === 8, '极长航程封顶 8 段')
assert(segmentCountFor(20) === 4, '20 基准天 → 4 段（每段 5 天）')
assert(segmentIndexFor(0, 4) === 0 && segmentIndexFor(0.3, 4) === 1 && segmentIndexFor(0.99, 4) === 3, '进度落在哪一段')
// 逐段推进：下一个分界点
assert(nextSegmentBoundary(0, 4) === 0.25 && nextSegmentBoundary(1, 4) === 0.5 && nextSegmentBoundary(3, 4) === 1, '下一段的分界进度')
// 逐段推进的关键性质：从任意进度出发，一次最多推进一段
// （高速下一帧跨过多段时，中间的抉择不能被跳过）
{
  let idx = 0
  const count = 8
  // 模拟一帧跨到 47.68%（8 段中的第 4 段起点之前）
  const progress = 0.4768
  const before = idx
  if (progress >= nextSegmentBoundary(idx, count)) idx = idx + 1
  assert(idx === before + 1, `一帧最多推进一段（${before} → ${idx}，实际进度 ${progress}）`)
  assert(idx === 1, `不会直接跳到第 4 段（实际停在第 ${idx} 段）`)
}
// 进度必须单调累加：分母是航程总距离，不是"当前位置到目标"
assert(routeProgressOf(1000, 1000) === 0, '起点进度 0')
assert(routeProgressOf(1000, 500) === 0.5, '走一半 → 50%')
assert(routeProgressOf(1000, 0) === 1, '抵达 → 100%')
assert(routeProgressOf(1000, 1200) === 0, '剩余超过总距（偏航）→ clamp 到 0')
assert(routeProgressOf(0, 0) === 0, '无航程 → 0')
// 进度随航行单调递增（这是航段边界能触发的根本前提）
let prev = -1
let monotonic = true
for (let remaining = 1000; remaining >= 0; remaining -= 50) {
  const p = routeProgressOf(1000, remaining)
  if (p < prev) monotonic = false
  prev = p
}
assert(monotonic, '航线进度随剩余距离减少而单调递增')

console.log('== 9. 航线情报 ==')
const testRoute: Route = { id: 1, fromPortId: 1, toPortId: 2, distance: 100, dangerLevel: 3, windFavor: 1 }
const intel = generateRouteIntel(testRoute, 10, () => 0.5)
assert(intel.routeKey === '1-2', 'routeKey 格式为 from-to')
assert(intel.boughtDay === 10, '情报记录购买天数')
assert(intel.fairWeather > 0.3 && intel.fairWeather < 0.65, `危险3 好天气概率居中偏低（${intel.fairWeather.toFixed(2)}）`)
assert(intel.pirateRisk > 0.15 && intel.pirateRisk < 0.3, `危险3 海盗风险约 0.21（${intel.pirateRisk.toFixed(2)}）`)
const intel5 = generateRouteIntel({ ...testRoute, dangerLevel: 5 }, 1, () => 0.5)
assert(intel5.fairWeather < intel.fairWeather && intel5.pirateRisk > intel.pirateRisk, '危险5 比危险3 更凶险')
const extreme = generateRouteIntel({ ...testRoute, dangerLevel: 5 }, 1, () => 0)
assert(extreme.pirateRisk >= 0.05 && extreme.pirateRisk <= 0.95, '情报数值 clamp 在 [0.05, 0.95]')
const cheapRoute = generateRouteIntel({ ...testRoute, dangerLevel: 1 }, 1, () => 0.5)
assert(cheapRoute.fairWeather > intel.fairWeather, '危险1 好天气概率高于危险3')

console.log('== 10. 军官工资结算 ==')
const w1 = settleOfficerWages(['pilot', 'surgeon'], 100)
assert(w1.gold === 94 && w1.left.length === 0 && w1.officers.length === 2, '工资充足：全扣（3+3=6）')
const w2 = settleOfficerWages(['pilot', 'quartermaster', 'surgeon'], 4)
assert(w2.gold === 1 && w2.officers.length === 1 && w2.left.length === 2, `工资不足：按顺序辞退（剩${w2.officers.length} 走${w2.left.length}，余 ${w2.gold}）`)
assert(w2.officers[0] === 'pilot' && w2.left.includes('quartermaster') && w2.left.includes('surgeon'), '保留名单前段、辞退后段')
const w3 = settleOfficerWages([], 50)
assert(w3.gold === 50 && w3.left.length === 0, '无军官不扣钱')
const wageMap = new Map(OFFICERS.map(o => [o.id, o.dailyWage]))
assert(wageMap.get('pilot') === 3 && wageMap.get('quartermaster') === 2 && wageMap.get('surgeon') === 3, '军官日薪 3/2/3')

console.log('== 11. 领航员航速加成 ==')
const testShip = { id: 1, name: 's', type: 'caravel' as const, speed: 6, durability: 100, maxDurability: 100, capacity: 50, usedCapacity: 0, crew: 30, maxCrew: 40 }
const testFleet: Fleet = { id: 1, name: 't', gold: 0, fame: 0, morale: 70, food: 100, water: 100, currentPortId: 6, isSailing: false, day: 1, ships: [testShip], cargo: [], flagshipId: 1, trait: null }
const baseSpeed = effectiveFleetSpeed(testFleet, [])
const pilotSpeed = effectiveFleetSpeed(testFleet, ['pilot'])
assert(Math.abs(pilotSpeed - baseSpeed * 1.15) < 0.001, `领航员加成恰为 +15%（${baseSpeed} → ${pilotSpeed}）`)
const testRoute2: Route = { id: 1, fromPortId: 6, toPortId: 7, distance: 2400, dangerLevel: 2, windFavor: 1 }
const dNo = calculateSailingDays(testRoute2, testFleet, [])
const dPilot = calculateSailingDays(testRoute2, testFleet, ['pilot'])
assert(dPilot <= dNo, `领航员不延长航期（${dNo} → ${dPilot} 天）`)

console.log('== 12. 方针影响事件概率 ==')
// 事件率现在由方针的 eventRateMul 施加在**全局触发闸门**上
// （store.advanceDay 的 eventBias），checkEventTrigger 内部不再叠乘第二层。
// 回归点：同一个事件、同一份 state，checkEventTrigger 的触发率不因 stance 改变。
const evPlain = events.find(e =>
  !e.triggerCondition.requiresFlags && !e.triggerCondition.conflictsWithFlags &&
  !e.triggerCondition.maxMorale && !e.triggerCondition.dangerLevelMin && !e.triggerCondition.region
)!
const evFixed = { ...evPlain, triggerCondition: { ...evPlain.triggerCondition, probability: 0.3 } }
const N = 2000
let rushHits = 0
let carefulHits = 0
for (let i = 0; i < N; i++) {
  if (checkEventTrigger(evFixed, { ...baseState, stance: 'rush' })) rushHits++
  if (checkEventTrigger(evFixed, { ...baseState, stance: 'careful' })) carefulHits++
}
const ratio = rushHits / Math.max(1, carefulHits)
assert(Math.abs(ratio - 1) < 0.35, `事件率不由 checkEventTrigger 叠乘方针倍率（比值 ${ratio.toFixed(2)} ≈ 1）`)
assert(STANCES.rush.eventRateMul / STANCES.careful.eventRateMul === 6, '方针层面的遇事率比：抢行/谨慎 = 1.8/0.3 = 6 倍')

console.log('== 13. 竞争船长推进 ==')
const tick = advanceRivals(RIVALS, 10)
assert(tick.rivals.every((r, i) => r.gold > RIVALS[i].gold), '三个 rival 金币均增长')
const tickAggressive = tick.rivals.find(r => r.style === 'aggressive')!
const tickExplorer = tick.rivals.find(r => r.style === 'explorer')!
const aggGain = tickAggressive.gold - RIVALS[0].gold
const expGain = tickExplorer.gold - RIVALS[2].gold
assert(aggGain > expGain, `激进派涨金快于探险派（+${aggGain} vs +${expGain}）`)
assert(tick.rivals.every(r => r.lastActionDay === 10), '推进后更新行动日')
let rs = RIVALS
for (let i = 0; i < 50; i++) rs = advanceRivals(rs, i * 2).rivals
assert(rs.every((r, i) => r.gold > RIVALS[i].gold + 500), '50 次推进后每个 rival 都显著变富')
assert(rs.every(r => r.portsFound <= 20), '探索数不超上限 20')
assert(new Set(RIVALS.map(r => r.id)).size === 3, 'rival id 不重复')

console.log(`—— 第一线小结：${passed} 通过 / ${failed} 失败 ——`)
/* ================================================================
 * 第二条线：派系声望 / 名船员 / 海上人称谓
 * ================================================================ */

console.log('== 14. 派系声望 ==')
assert(FACTIONS.length === 4, `四方势力共 4 个（实际 ${FACTIONS.length}）`)
assert(new Set(FACTIONS.map(f => f.id)).size === 4, '派系 id 不重复')
assert(factionAttitude(80).label === '崇敬' && factionAttitude(80).tone === 'good', '80 点 = 崇敬')
assert(factionAttitude(40).label === '友善', '40 点 = 友善')
assert(factionAttitude(0).label === '中立', '0 点 = 中立')
assert(factionAttitude(-40).label === '冷淡', '-40 点 = 冷淡')
assert(factionAttitude(-80).label === '敌对', '-80 点 = 敌对')
assert(factionAttitude(80).level > factionAttitude(0).level, '态度档位随声望单调递增')
// 港口归属：海盗港归兄弟会，商业港归商会
assert(portFaction(2) === 'brethren', '皇家港由兄弟会话事')
assert(portFaction(15) === 'guild', '阿姆斯特丹由商会话事')
assert(portFaction(6) === 'crown', '塞维利亚由王室话事')
assert(portFaction(7) === 'scholars', '里斯本由学者话事')
// 派系事件的门槛
const evCrownOrder = events.find(e => e.id === 230)!
const evBounty = events.find(e => e.id === 233)!
assert(!checkEventTrigger({ ...evCrownOrder, triggerCondition: { ...evCrownOrder.triggerCondition, probability: 1 } }, baseState), '王室密令：crown < 30 不触发')
assert(checkEventTrigger({ ...evCrownOrder, triggerCondition: { ...evCrownOrder.triggerCondition, probability: 1 } }, { ...baseState, factionRep: { crown: 30, guild: 0, scholars: 0, brethren: 0 } }), '王室密令：crown ≥ 30 触发')
assert(!checkEventTrigger({ ...evBounty, triggerCondition: { ...evBounty.triggerCondition, probability: 1 } }, { ...baseState, factionRep: { crown: 30, guild: 0, scholars: 0, brethren: 0 } }), '通缉令：crown > -30 不触发')
assert(checkEventTrigger({ ...evBounty, triggerCondition: { ...evBounty.triggerCondition, probability: 1 } }, { ...baseState, factionRep: { crown: -30, guild: 0, scholars: 0, brethren: 0 } }), '通缉令：crown ≤ -30 触发')
// 派系事件必须带 factionChange（"世界上有人记住你"）
const factionEvents = events.filter(e => e.type === 'faction')
assert(factionEvents.length >= 4, `派系事件 ≥4（实际 ${factionEvents.length}）`)
const factionOutcomes = factionEvents.flatMap(e => e.choices.flatMap(c => c.outcomes))
assert(factionOutcomes.every(o => o.factionChange && Object.keys(o.factionChange).length > 0), '派系事件每个结局都改派系态度')
// 走私/缉私类的派系拉扯：王室与兄弟会必须此消彼长
const crownEvent = factionEvents.find(e => e.id === 232)!
const betrayOutcome = crownEvent.choices[2].outcomes[0]
assert((betrayOutcome.factionChange?.crown ?? 0) > 0 && (betrayOutcome.factionChange?.brethren ?? 0) < 0, '告密宴会：王室+、兄弟会-')

console.log('== 15. 名船员 ==')
assert(CREW_CHARS.length === 8, `名船员共 8 位（实际 ${CREW_CHARS.length}）`)
assert(new Set(CREW_CHARS.map(c => c.id)).size === 8, '船员 id 不重复')
assert(CREW_CHARS.every(c => c.hireCost > 0 && c.perk.length > 5 && c.origin.length > 10 && c.quote.length > 5), '每人都有招募费/特长/来历/口头禅')
assert(CREW_CHAR_MAP.get('cook')?.perk.includes('20'), '厨子特长：食物消耗 -20%')
assert(CREW_CHAR_MAP.get('scholar')?.perk.includes('20'), '学者特长：发现事件 +20%')
// 个人事件必须绑定 requiresCrew
const crewEvents = events.filter(e => e.type === 'crew')
assert(crewEvents.length === 8, `个人事件共 8 个（实际 ${crewEvents.length}）`)
assert(crewEvents.every(e => (e.triggerCondition.requiresCrew ?? []).length === 1), '每个个人事件绑定一名船员')
const charIds = new Set(CREW_CHARS.map(c => c.id))
assert(crewEvents.every(e => charIds.has(e.triggerCondition.requiresCrew![0])), 'requiresCrew 引用的都是真实船员')
const evTomDebt = crewEvents.find(e => e.id === 235)!
assert(!checkEventTrigger({ ...evTomDebt, triggerCondition: { ...evTomDebt.triggerCondition, probability: 1 } }, baseState), '老汤姆的旧账：无船员在船不触发')
assert(checkEventTrigger({ ...evTomDebt, triggerCondition: { ...evTomDebt.triggerCondition, probability: 1 } }, { ...baseState, crewRoster: [{ id: 'boatswain', loyalty: 60, hiredDay: 1 }] }), '老汤姆的旧账：汤姆在船即触发')
// 每个个人事件的所有结局都必须 crewEvent 指向本人
const ev235Outcomes = evTomDebt.choices.flatMap(c => c.outcomes)
assert(ev235Outcomes.every(o => o.crewEvent?.member === 'boatswain'), '老汤姆事件的所有结局都结算到本人')

console.log('== 16. 海上人称谓 ==')
assert(TITLES.length === 5, `称号共 5 个（实际 ${TITLES.length}）`)
assert(currentTitle({ cruel: 0, mercy: 0, greed: 0, bold: 0, secret: 0 }) === null, '无累积时无称号')
assert(currentTitle({ cruel: 3, mercy: 0, greed: 0, bold: 0, secret: 0 })?.id === 'ironhand', '冷酷 ≥3 授予铁腕者')
assert(currentTitle({ cruel: 0, mercy: 0, greed: 3, bold: 0, secret: 0 })?.id === 'hoarder', '贪婪 ≥3 授予贪婪者')
assert(currentTitle({ cruel: 2, mercy: 3, greed: 0, bold: 0, secret: 0 })?.id === 'mercyful', '仁慈 ≥3 授予慈悲心')
assert(currentTitle({ cruel: 0, mercy: 0, greed: 2, bold: 3, secret: 0 })?.id === 'gambler', '并列时取累积更高者')
assert(dominantAxis({ cruel: 1, mercy: 4, greed: 0, bold: 0, secret: 0 })?.axis === 'mercy', '主导取向 = 仁慈')
// 抉择事件必须带 notoriety
const reckoningEvents = events.filter(e => e.type === 'reckoning')
assert(reckoningEvents.length === 4, `抉择事件共 4 个（实际 ${reckoningEvents.length}）`)
const reckoningOutcomes = reckoningEvents.flatMap(e => e.choices.flatMap(c => c.outcomes))
assert(reckoningOutcomes.some(o => o.notoriety && Object.keys(o.notoriety).length > 0), '抉择事件存在累积身份取向的结局')
assert(reckoningEvents.every(e => e.choices.filter(c => c.outcomes.some(o => o.notoriety)).length >= 2), '每个抉择事件至少 2 个选择带身份取向（中庸选项不强迫站队）')
// 残酷与仁慈必须真实对立（同一事件的不同选择）
const evCaptives = reckoningEvents.find(e => e.id === 243)!
const cruelAxis = evCaptives.choices[0].outcomes[0].notoriety?.cruel ?? 0
const mercyAxis = evCaptives.choices[2].outcomes[0].notoriety?.mercy ?? 0
assert(cruelAxis > 0 && mercyAxis > 0, '俘虏事件：处决=冷酷、释放=仁慈，两条路都真实存在')

console.log('== 17. 价格合成：第二条线加成 ==')
const baseFleet = { fame: 0, trait: null }
assert(priceMultiplier(baseFleet) === 1, '裸奔状态价格系数 = 1')
assert(priceMultiplier(baseFleet, { crewRoster: ['purser'] }) < 1, '账房先生在船 → 买方更便宜')
assert(priceMultiplier(baseFleet, { factionRep: { guild: 60 } }) < priceMultiplier(baseFleet, { factionRep: { guild: 0 } }), '商会 60 比中立更便宜')
assert(priceMultiplier(baseFleet, { title: currentTitle({ cruel: 0, mercy: 0, greed: 3, bold: 0, secret: 0 }) }) < priceMultiplier(baseFleet), '贪婪者称号 → 更会榨取')
const mWithAll = priceMultiplier(baseFleet, { crewRoster: ['purser'], factionRep: { guild: 90, crown: 90 }, title: currentTitle({ cruel: 0, mercy: 0, greed: 3, bold: 0, secret: 0 }) })
assert(mWithAll < 0.95, `多重叠加显著（${mWithAll.toFixed(2)}）`)
assert(mWithAll >= 0.5, '价格系数有下限保护 0.5')
// 商人血脉 + 声望仍叠加生效（旧行为不回退）
assert(priceMultiplier({ fame: 100, trait: 'merchant' }) <= 0.85, '声望100+商界血脉仍叠加')

console.log('== 18. 新事件引擎条件 ==')
const evElena = events.find(e => e.id === 238)!
assert(!checkEventTrigger({ ...evElena, triggerCondition: { ...evElena.triggerCondition, probability: 1 } }, baseState), '伊莲事件：无学者在船不触发')
assert(checkEventTrigger({ ...evElena, triggerCondition: { ...evElena.triggerCondition, probability: 1 } }, { ...baseState, crewRoster: [{ id: 'scholar', loyalty: 50, hiredDay: 3 }] }), '伊莲事件：学者在船触发')
// 学者加成：发现类事件概率 ×1.2（与探险家特质叠加而非覆盖）
const evDiscover = events.find(e => e.id === 201 || e.type === 'discovery')!
const M = 4000
let baseHits = 0
let scholarHits = 0
for (let i = 0; i < M; i++) {
  if (checkEventTrigger({ ...evDiscover, triggerCondition: { ...evDiscover.triggerCondition, probability: 0.2 } }, baseState)) baseHits++
  if (checkEventTrigger({ ...evDiscover, triggerCondition: { ...evDiscover.triggerCondition, probability: 0.2 } }, { ...baseState, crewRoster: [{ id: 'scholar', loyalty: 50, hiredDay: 1 }] })) scholarHits++
}
assert(scholarHits > baseHits * 1.05, `随船学者提升发现事件触发（${scholarHits} vs ${baseHits}）`)
// 派系事件不得与第二线的 crew 事件混淆触发
const evCrownOrder2 = events.find(e => e.id === 230)!
assert(!checkEventTrigger({ ...evCrownOrder2, triggerCondition: { ...evCrownOrder2.triggerCondition, probability: 1 } }, { ...baseState, factionRep: { crown: 0, guild: 0, scholars: 0, brethren: 0 } }), 'crown=0 时密令仍不触发')

console.log('== 19. 操舵挑战：风向物理 ==')
assert(helmFavor(90, 90) === 1.4, `正顺风 favor=1.4（实际 ${helmFavor(90, 90)}）`)
assert(helmFavor(270, 90) === 0.6, `正顶风 favor=0.6（实际 ${helmFavor(270, 90)}）`)
assert(Math.abs(helmFavor(0, 90) - 1) < 0.001, `正侧风 favor≈1.0（实际 ${helmFavor(0, 90)}）`)
assert(helmFavor(45, 90) === helmFavor(135, 90), 'favor 关于风向轴对称')
assert(angleDiff(350, 10) === 20, `跨 0° 夹角取小角（实际 ${angleDiff(350, 10)}）`)
assert(angleDiff(90, 270) === 180, '对向夹角 180')
assert(normalizeAngle(-10) === 350 && normalizeAngle(370) === 10, 'normalizeAngle 归一到 0..360')
assert(inFavorArc(90, 90 + HELM_FAVOR_ARC), '夹角恰好 = 有利区半角时算吃风')
assert(!inFavorArc(90, 90 + HELM_FAVOR_ARC + 1), '超出半角一度即出区')

console.log('== 20. 操舵挑战：帧推进 ==')
const ship0 = { heading: 0, trim: 0.6 }
const shipRight = advanceHelmShip(ship0, { turn: 1, trimDelta: 0 }, 1)
assert(shipRight.heading > 78 && shipRight.heading < 84, `右转 1 秒 = 75°×(0.75+0.6×0.55)≈81°（实际 ${shipRight.heading.toFixed(1)}）`)
const shipLeft = advanceHelmShip(ship0, { turn: -1, trimDelta: 0 }, 1)
assert(shipLeft.heading > 275 && shipLeft.heading < 281, '左转 1 秒回绕到 279° 附近')
const shipTrimClamp = advanceHelmShip({ heading: 0, trim: 1 }, { turn: 0, trimDelta: 1 }, 1)
assert(shipTrimClamp.trim === 1, '帆缆上限截断为 1')
const shipTrimFloor = advanceHelmShip({ heading: 0, trim: 0 }, { turn: 0, trimDelta: -1 }, 1)
assert(shipTrimFloor.trim === 0, '帆缆下限截断为 0')
// 帆收得紧 → 舵响应更快（同 1 秒转角更大）
const tightTurn = advanceHelmShip({ heading: 0, trim: 1 }, { turn: 1, trimDelta: 0 }, 1).heading
const looseTurn = advanceHelmShip({ heading: 0, trim: 0 }, { turn: 1, trimDelta: 0 }, 1).heading
assert(tightTurn > looseTurn, `满帆舵响更快（${tightTurn.toFixed(1)}° vs ${looseTurn.toFixed(1)}°）`)

console.log('== 21. 操舵挑战：风场仿真 ==')
const seq = [0.1, 0.9, 0.5, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6, 0.15]
// 两个各自独立计数的同种子序列——验证确定性
const makeRand = () => { let i = 0; return () => seq[i++ % seq.length] }
const simA = new HelmWindSim(90, makeRand())
const simB = new HelmWindSim(90, makeRand())
let sawGustShift = false
let allInRange = true
for (let i = 0; i < 60 * 20; i++) {
  const w = simA.update(1 / 60)
  const w2 = simB.update(1 / 60)
  if (w !== w2) allInRange = false
  // 基准 ±18 摆动 + 阵风 ±42 → 总偏移不超过 ±62
  const off = Math.abs(angleDiff(w, 90))
  if (off > 63) allInRange = false
  if (off > 20) sawGustShift = true
}
assert(allInRange, '同种子风场序列一致且总偏移有界（±63° 内）')
assert(sawGustShift, '20 秒内出现过明显阵风偏移')
// 无 rand 注入时（默认 Math.random）也能跑完不出 NaN
const simDefault = new HelmWindSim(270)
let finite = true
for (let i = 0; i < 600; i++) {
  const w = simDefault.update(1 / 60)
  if (!Number.isFinite(w)) finite = false
}
assert(finite, '默认随机风场输出始终有限')

console.log('== 22. 操舵挑战：评估与评级 ==')
assert(evaluateHelmRun([]).score === 0, '空样本评 0 分')
assert(evaluateHelmRun([]).samples === 0, '空样本无采样')
// 全程吃风：满分
const perfect: HelmSample[] = Array.from({ length: 900 }, (_, i) => ({ t: i / 60, favor: 1.4, inArc: true }))
const rPerfect = evaluateHelmRun(perfect)
assert(rPerfect.score === 1, `全程满风 → 1.0（实际 ${rPerfect.score}）`)
assert(rPerfect.bestStreak >= HELM_DURATION - 0.1, `连击 ≈ 全时长（实际 ${rPerfect.bestStreak.toFixed(1)}s）`)
assert(rPerfect.timeInArcRatio === 1, '驻留比 100%')
// 全程顶风出区：0 分
const worst: HelmSample[] = Array.from({ length: 900 }, (_, i) => ({ t: i / 60, favor: 0.6, inArc: false }))
const rWorst = evaluateHelmRun(worst)
assert(rWorst.score === 0, `全程顶风 → 0 分（实际 ${rWorst.score}）`)
assert(rWorst.bestStreak === 0, '全程顶风无连击')
// 连击按时间戳折算：每 2 秒吃风、2 秒出区 → 连击约 2 秒
const mixed: HelmSample[] = []
for (let i = 0; i < 900; i++) {
  const t = i / 60
  mixed.push({ t, favor: t % 4 < 2 ? 1.3 : 0.7, inArc: t % 4 < 2 })
}
const rMixed = evaluateHelmRun(mixed)
assert(rMixed.bestStreak >= 1.8 && rMixed.bestStreak <= 2.2, `断续吃风连击 ≈2s（实际 ${rMixed.bestStreak.toFixed(2)}s）`)
assert(rMixed.timeInArcRatio > 0.5 && rMixed.timeInArcRatio < 0.56, `断续吃风驻留比 ≈53%（15s 非 4s 周期整数倍，实际 ${rMixed.timeInArcRatio}）`)
// 中游样本：均风 1.2 但每秒都被打断 → favorScore 0.6、连击≈0 → 稳稳到港
const steadySamples: HelmSample[] = Array.from({ length: 900 }, (_, i) => ({ t: i / 60, favor: 1.2, inArc: i % 2 === 0 }))
const rSteady = evaluateHelmRun(steadySamples)
assert(rSteady.score >= 0.5 && rSteady.score < 0.7, `中游评分落在 steady 档（实际 ${rSteady.score.toFixed(3)}）`)
assert(helmReward(rSteady).grade === 'steady', '中游 → 稳稳到港')

console.log('== 23. 操舵挑战：奖励表 ==')
assert(helmReward(rPerfect).grade === 'legend', '满分 → 传奇舵手')
assert(helmReward(rPerfect).progressBonus === 0.15, '传奇省 15% 航程')
assert(helmReward(rPerfect).morale === 4 && helmReward(rPerfect).fame === 1, '传奇：士气+4 声望+1')
assert(helmReward(rWorst).grade === 'poor', '零分 → 偏航颠簸')
assert(helmReward(rWorst).wear === -3 && helmReward(rWorst).morale === -2, '偏航：旗舰耐久-3 士气-2')
assert(helmReward(rMixed).grade === 'poor', `均风 1.0 且连击短 → 偏航颠簸（实际 ${helmReward(rMixed).grade}）`)
assert(helmReward(rSteady).grade === 'steady', '中游 → 稳稳到港')
// 高分但连击不足 → 降档为好舵手（传奇要求连击 ≥35% 时长）
const highNoStreak = evaluateHelmRun(Array.from({ length: 900 }, (_, i) => ({ t: i / 60, favor: 1.4, inArc: i % 300 !== 0 })))
assert(helmReward(highNoStreak).grade === 'good', `高分短连击 → 老练舵手（实际 ${helmReward(highNoStreak).grade}）`)
// 奖励单调性：分数越高省得越多
const b1 = helmReward({ score: 0.2, avgFavor: 0.7, timeInArcRatio: 0.1, bestStreak: 0, samples: 10 }).progressBonus
const b2 = helmReward({ score: 0.55, avgFavor: 1.0, timeInArcRatio: 0.5, bestStreak: 3, samples: 10 }).progressBonus
const b3 = helmReward({ score: 0.72, avgFavor: 1.15, timeInArcRatio: 0.8, bestStreak: 6, samples: 10 }).progressBonus
assert(b1 < b2 && b2 < b3, `航程奖励随评分单调递增（${b1} < ${b2} < ${b3}）`)

console.log('== 24. 航行节拍器：操舵与航段绑定（store 集成）==')
{
  const testShip = { id: 1, name: '圣玛利亚号', type: 'caravel' as const, speed: 5, durability: 50, maxDurability: 100, capacity: 100, usedCapacity: 0, crew: 30, maxCrew: 40 }
  const testFleet: Fleet = { id: 1, name: '测试舰队', gold: 500, fame: 0, morale: 60, food: 100, water: 100, currentPortId: null, isSailing: true, day: 10, ships: [testShip], cargo: [], flagshipId: 1, trait: null, durabilityCarry: 0 }
  const testRoute: Route = { id: -42, fromPortId: 6, toPortId: 7, distance: 1000, dangerLevel: 3, windFavor: 1 }
  // --- 1) 选方针 → 立刻进入本段操舵，船停住 ---
  useGameStore.setState({
    fleet: testFleet,
    currentRoute: testRoute,
    waypoint: { latitude: 40, longitude: -10, portId: 7 },
    shipPosition: [20, -20],
    segmentCount: 4,
    segmentIndex: 0,
    stance: 'steady',
    pendingSegment: { index: 0, total: 4, hazard: '风浪渐起', segmentNm: 250, remainingNm: 1000, daysLeft: 5 },
    pendingHelm: null,
    helmAdvance: null,
    gamePhase: 'segment',
  })
  useGameStore.getState().chooseStance('rush')
  const afterStance = useGameStore.getState()
  assert(afterStance.stance === 'rush', '方针已切换为抢行')
  assert(afterStance.pendingSegment === null, '抉择已消费')
  assert(!!afterStance.pendingHelm && afterStance.pendingHelm.segmentIndex === 0,
    '选完方针立刻进入第 0 段操舵——节拍器的下一拍，不等玩家自觉')
  assert(afterStance.gamePhase === 'helm', 'gamePhase 切到 helm（SailingController 会停船等玩家）')
  assert(afterStance.fleet.morale === 57, `抢行士气代价在选定瞬间兑现 60-3=57（实际 ${afterStance.fleet.morale}）`)

  // --- 2) 操舵结算：不挪船位，只递交里程 ---
  // 旧实现在 store 里直接改 shipPosition，被下一帧 positionAtNm(traveledNm) 覆盖——
  // 结算屏说省了 15%，船原地不动（实测复现，见 .workbuddy/dbg-helm-bonus.mjs）。
  useGameStore.getState().finishHelmRun(rPerfect)
  const after = useGameStore.getState()
  assert(after.shipPosition![0] === 20 && after.shipPosition![1] === -20,
    'store 不直接挪船位——船位由控制器里的 traveledNm 每帧推导')
  assert(!!after.helmAdvance && Math.abs(after.helmAdvance.nm - 37.5) < 1e-9,
    `传奇省 15% × 本段 250nm = 37.5nm（实际 ${after.helmAdvance?.nm}）`)
  assert(after.helmAdvance.token === 1, 'token=1（控制器据此入账且只入账一次）')
  assert(after.pendingHelm === null && after.gamePhase === 'playing', '结算后恢复航行')
  assert(after.fleet.morale === 61, `士气 57+4=61（实际 ${after.fleet.morale}）`)
  assert(after.fleet.fame === 1, '声望 +1')
  assert(after.fleet.day === 10, '操舵结算不推进天数')

  // --- 3) 没有待操舵状态时再调用 = no-op（刷新页面无法重复入账）---
  useGameStore.getState().finishHelmRun(rPerfect)
  const after2 = useGameStore.getState()
  assert(after2.helmAdvance === after.helmAdvance, '无 pendingHelm 时再调用不改入账')
  assert(after2.fleet.morale === after.fleet.morale, '无 pendingHelm 时不再加士气')

  // --- 4) poor 评级磨耐久；token 继续递增 ---
  useGameStore.setState({ pendingHelm: { segmentIndex: 1 }, fleet: { ...testFleet, morale: 50 } })
  useGameStore.getState().finishHelmRun(rWorst)
  const afterPoor = useGameStore.getState()
  assert(afterPoor.fleet.morale === 48, `偏航士气 -2（实际 ${afterPoor.fleet.morale}）`)
  assert(afterPoor.fleet.ships[0].durability === 47, `旗舰耐久 50-3=47（实际 ${afterPoor.fleet.ships[0].durability}）`)
  assert(afterPoor.helmAdvance.token === 2, 'token 递增到 2')
  assert(afterPoor.helmAdvance.nm === 5, `偏航省 2% × 250nm = 5nm（实际 ${afterPoor.helmAdvance.nm}）`)

  // --- 5) 未航行时 no-op ---
  useGameStore.setState({ fleet: { ...testFleet, isSailing: false }, pendingHelm: { segmentIndex: 2 } })
  const tokenBefore = useGameStore.getState().helmAdvance.token
  useGameStore.getState().finishHelmRun(rPerfect)
  assert(useGameStore.getState().helmAdvance.token === tokenBefore, '未航行时操舵结算不生效')
  assert(useGameStore.getState().shipPosition![0] === 20, '未航行时位置不变')

  // --- 6) 兑现点必须在控制器里：store 只递交里程，控制器入账 ---
  // 这是旧 bug 的回归护栏——奖励绕过 traveledNm 就等于没给。
  const ctrlSrc = readFileSync(join(process.cwd(), 'src/components/map/SailingController.tsx'), 'utf8')
  assert(ctrlSrc.includes('helmAdvance') && ctrlSrc.includes('helmTokenRef'),
    'SailingController 必须消费 helmAdvance 并按 token 只入账一次')
  // 手动入口已移除：操舵不再是可选加分项
  const kbSrc = readFileSync(join(process.cwd(), 'src/hooks/useKeyboardControls.ts'), 'utf8')
  assert(!/case 'h'/.test(kbSrc), '键盘钩子里不再有 H 手动开操舵的分支')
  const barSrc = readFileSync(join(process.cwd(), 'src/components/ui/BottomBar.tsx'), 'utf8')
  assert(!barSrc.includes('setHelmOpen'), '底栏不再有手动操舵按钮')
}

console.log('== 23. 舰船精灵资产 ==')
{
  // shipSprites.ts 里引用的每个 PNG 都必须真实存在、是 RGBA、尺寸合理
  const allSprites: Record<string, string> = { ...SHIP_SPRITES, ...SPECIAL_SPRITES }
  const spriteNames = Object.keys(allSprites)
  assert(spriteNames.length === 10, `精灵清单共 10 项（实际 ${spriteNames.length}）`)
  for (const [key, url] of Object.entries(allSprites)) {
    // URL 形如 /Age-of-Discovery/assets/ships/xxx.png → 取文件名回 public/ 找
    // （测试约定从项目根目录运行，esbuild bundle 后 cwd 不变）
    const fileName = url.split('/').pop()!
    const filePath = join(process.cwd(), 'public', 'assets', 'ships', fileName)
    if (!existsSync(filePath)) {
      assert(false, `${key}: 文件缺失 ${fileName}`)
      continue
    }
    const buf = readFileSync(filePath)
    const isPng = buf.length > 33 && buf.readUInt32BE(0) === 0x89504e47
    const colorType = isPng ? buf[25] : -1 // IHDR: 6 = RGBA
    const width = isPng ? buf.readUInt32BE(16) : 0
    const height = isPng ? buf.readUInt32BE(20) : 0
    assert(
      isPng && colorType === 6 && width >= 150 && height >= 150 && buf.length > 20000,
      `${key}: ${fileName} 为 RGBA PNG ${width}x${height} ${Math.round(buf.length / 1024)}KB`,
    )
  }
  assert(shipSprite('caravel').endsWith('caravel.png'), 'caravel -> caravel.png')
  assert(shipSprite('galleon').endsWith('galleon.png'), 'galleon -> galleon.png')
  assert(shipSprite('sloop').endsWith('sloop.png'), 'sloop -> sloop.png')
  assert(shipSprite('frigate').endsWith('frigate.png'), 'frigate -> frigate.png')
  assert(shipSprite('unknown_type').endsWith('galleon.png'), '未知船型回退 galleon.png')
}

console.log('== 24. 天候系统：确定性生成 ==')
{
  const w1 = weatherKindForCell(5, 3, 7)
  const w2 = weatherKindForCell(5, 3, 7)
  assert(w1 === w2, `同格同日生成一致（${w1}）`)
  const kinds = new Set<string>()
  for (let day = 1; day <= 60; day++) {
    for (let cx = 0; cx < 9; cx++) {
      for (let cy = 0; cy < 9; cy++) {
        kinds.add(weatherKindForCell(day, cx, cy))
      }
    }
  }
  assert(kinds.size === 5, `60 天 × 81 格覆盖全部五种天候（实际 ${[...kinds].sort().join(',')}）`)

  // 纬度偏置：赤道带（|lat|<8，cy≈4）多雾、中纬度（cy≈5-8 对应 lat 10-70）多风暴
  let equatorFog = 0, midStorm = 0, equatorTotal = 0, midTotal = 0
  for (let day = 1; day <= 200; day++) {
    if (weatherKindForCell(day, 4, 4) === 'fog') equatorFog++
    equatorTotal++
    const mk = weatherKindForCell(day, 4, 6)
    if (mk === 'storm') midStorm++
    midTotal++
  }
  const equatorFogRate = equatorFog / equatorTotal
  const midStormRate = midStorm / midTotal
  assert(equatorFogRate > 0.15, `赤道无风带雾天概率显著（实际 ${(equatorFogRate * 100).toFixed(1)}%）`)
  assert(midStormRate > 0.06, `中纬度风暴概率高于基准 6%（实际 ${(midStormRate * 100).toFixed(1)}%）`)
}

console.log('== 25. 天候系统：持续与预报 ==')
{
  const cur = createInitialWeather()
  // 持续期内不变化
  const same = advanceWeather(cur, cur.startedDay + cur.duration - 1, 20, -30, 270)
  assert(same.kind === cur.kind && same.startedDay === cur.startedDay, '持续期内天气原样保持')
  // 到期换天
  const changed = advanceWeather(cur, cur.startedDay + cur.duration, 20, -30, 270)
  assert(changed.startedDay === cur.startedDay + cur.duration, '到期后 startedDay 更新为当天')
  assert(changed.duration >= 1 && changed.duration <= 3, `持续天数在 1-3 之间（实际 ${changed.duration}）`)

  // 预报：首日等于 advanceWeather(day0)，后续连续推进
  const base = { kind: 'clear' as const, windDir: 90, windSpeed: 10, startedDay: 1, duration: 1 }
  const fc = weatherForecast(base, 10, 25, -20, 270, 3)
  assert(fc.length === 3, '预报三天')
  const manual1 = advanceWeather(base, 10, 25, -20, 270)
  assert(fc[0].kind === manual1.kind && fc[0].windSpeed === manual1.windSpeed, '预报首日与逐日推进一致')
  const manual2 = advanceWeather(manual1, 11, 25, -20, 270)
  assert(fc[1].kind === manual2.kind, '预报次日与链式推进一致')

  // 风速按天候分档
  for (const kind of WEATHER_KINDS) {
    const [lo, hi] = { clear: [8, 14], cloudy: [10, 18], rain: [14, 22], storm: [24, 38], fog: [4, 9] }[kind]
    const v = windSpeedFor(kind, 3, 2, 5)
    assert(v >= lo && v <= hi, `${kind} 风速在 ${lo}-${hi} 节（实际 ${v}）`)
  }
  // 风暴风最快、雾最慢
  assert(windSpeedFor('storm', 3, 2, 5) > windSpeedFor('clear', 3, 2, 5), '风暴风速大于晴天')
  assert(windSpeedFor('fog', 3, 2, 5) < windSpeedFor('clear', 3, 2, 5), '雾天风速小于晴天')
}

console.log('== 26. 天候系统：属性与影响 ==')
{
  // 航速单调：晴 > 阴 > 雨 > 雾 > 风暴
  assert(WEATHER_INFO.clear.sailMul > WEATHER_INFO.cloudy.sailMul, '晴比阴快')
  assert(WEATHER_INFO.cloudy.sailMul > WEATHER_INFO.rain.sailMul, '阴比雨快')
  assert(WEATHER_INFO.rain.sailMul > WEATHER_INFO.fog.sailMul, '雨比雾快')
  assert(WEATHER_INFO.fog.sailMul > WEATHER_INFO.storm.sailMul, '雾比风暴快')
  // 事件偏置：风暴最危险，晴天最太平
  assert(WEATHER_INFO.storm.eventBias > WEATHER_INFO.rain.eventBias, '风暴事件偏置高于雨')
  assert(WEATHER_INFO.clear.eventBias < 1, '晴天事件偏置低于 1（更太平）')
  // 能见度：雾最低
  assert(WEATHER_INFO.fog.visibility < WEATHER_INFO.storm.visibility, '雾能见度低于风暴')
  assert(WEATHER_INFO.clear.visibility === 1, '晴天能见度满格')
  // 代价：只有风暴磨船压士气
  assert(WEATHER_INFO.storm.wearAdd === 1 && WEATHER_INFO.storm.moraleHit === 1, '风暴每日 1 磨损 1 士气')
  assert(WEATHER_INFO.rain.wearAdd === 0, '落雨不磨船')
  // 风向有利修正：风暴封顶
  assert(weatherFavorFactor('storm') < 1, '风暴压制风向收益')
  assert(weatherFavorFactor('clear') === 1, '晴天不修正')
  // 通知门槛
  assert(isNotableWeather('storm') && isNotableWeather('fog') && isNotableWeather('rain'), '雨雾风暴值得通知')
  assert(!isNotableWeather('clear') && !isNotableWeather('cloudy'), '晴阴不打扰玩家')
}

console.log('== 27. 肖像与事件场景资产 ==')
{
  const CREW_IDS = ['boatswain', 'gunner', 'purser', 'chaplain', 'scholar', 'cook', 'midshipman', 'corsair'] as const
  const OFFICER_IDS = ['pilot', 'quartermaster', 'surgeon'] as const
  const RIVAL_IDS = ['blackjack', 'maria', 'diego']

  // 映射全覆盖：14 个槽位一个不能少
  for (const id of CREW_IDS) assert(!!crewPortrait(id), `船员 ${id} 有肖像`)
  for (const id of OFFICER_IDS) assert(!!officerPortrait(id), `军官 ${id} 有肖像`)
  for (const id of RIVAL_IDS) assert(!!rivalPortrait(id), `竞争船长 ${id} 有肖像`)
  // 14 个槽位的肖像互不重复（一人一像）
  const allPortraits = [...CREW_IDS, ...OFFICER_IDS].map(id => (id === 'pilot' || id === 'quartermaster' || id === 'surgeon' ? officerPortrait(id as typeof OFFICER_IDS[number]) : crewPortrait(id as typeof CREW_IDS[number])))
    .concat(RIVAL_IDS.map(rivalPortrait))
  assert(new Set(allPortraits).size === 14, `14 个槽位使用 14 张不同肖像（实际 ${new Set(allPortraits).size} 张）`)

  // 文件存在且尺寸合规（单人像 512×640 RGBA，场景 d01-d04 ~1200×675，d05-d10 ~840×315）
  const pubDir = process.cwd()
  // 14 个槽位 → 14 张独立单人像（E1-E14 全集语义文件名；图鉴切片 e01-e14 退为备用，仍在盘上）
  const PORTRAIT_FILES: Array<[string, string | undefined]> = [
    ['crew_boatswain.png', crewPortrait('boatswain')],
    ['crew_gunner.png', crewPortrait('gunner')],
    ['crew_purser.png', crewPortrait('purser')],
    ['crew_chaplain.png', crewPortrait('chaplain')],
    ['crew_scholar.png', crewPortrait('scholar')],
    ['crew_cook.png', crewPortrait('cook')],
    ['crew_midshipman.png', crewPortrait('midshipman')],
    ['crew_blackflag_guide.png', crewPortrait('corsair')],
    ['officer_pilot.png', officerPortrait('pilot')],
    ['officer_first_mate.png', officerPortrait('quartermaster')],
    ['officer_surgeon.png', officerPortrait('surgeon')],
    ['rival_black_sail_jack.png', rivalPortrait('blackjack')],
    ['rival_silver_maria.png', rivalPortrait('maria')],
    ['rival_stareyed_diego.png', rivalPortrait('diego')],
  ]
  for (const [file, mapped] of PORTRAIT_FILES) {
    assert(!!mapped && mapped.endsWith(file), `槽位映射指向 ${file}`)
    const p = join(pubDir, 'public', 'assets', 'portraits', file)
    assert(existsSync(p), `肖像 ${file} 存在`)
    const buf = readFileSync(p)
    const w = buf.readUInt32BE(16); const h = buf.readUInt32BE(20)
    assert(w === 512 && h === 640, `肖像 ${file} 为 512×640（实际 ${w}×${h}）`)
    assert(buf[24] === 8 && buf[25] === 6, `肖像 ${file} 为 8bit RGBA`)
  }
  // D1-D14 十四个事件场景全部有真实插图；未生成的（顺风/哗变等）仍回退手绘 SVG
  for (const key of ['storm', 'pirate', 'kraken', 'ghostship', 'volcano', 'fog', 'festival', 'treasure', 'siren', 'smuggle']) {
    assert(!!sceneImage(key), `场景 ${key} 有真实插图`)
  }
  // 第二批 P1 补齐的四个高频场景（chart 9 个事件 / navy 4 / island 4 / tavern 2）
  for (const key of ['chart', 'navy', 'island', 'tavern']) {
    assert(!!sceneImage(key), `场景 ${key} 有真实插图（第二批 P1）`)
  }
  // 第三批 P1：最后 11 个场景（顺风/海豚/渔获/商队/鲸群/流星/坏血病/暗礁/无风带/好望角/叛乱）
  // 映射已提前写好，素材交付后零改动生效。
  // 素材尚未交付时 <img> 加载失败 → onError → 回退手绘 SVG，不会白屏；
  // 该回退行为由 test/e2e/scene-img-failed-reset.mjs 与 scene-missing-prod.mjs 守住。
  const THIRD_BATCH = ['fairwind', 'dolphin', 'school', 'market', 'whale', 'meteor', 'disease', 'reef', 'doldrums', 'cape', 'mutiny']
  for (const key of THIRD_BATCH) {
    assert(!!sceneImage(key), `场景 ${key} 映射已就位（第三批 P1，素材交付后自动生效）`)
  }
  // 插图失败状态机：失败是「URL 的属性」，不是「场景的属性」。
  // 早期版本用全局布尔值，一张图失败会让所有场景（含本该有真图的）
  // 一起退化成手绘 SVG。这几条断言把「不跨场景污染」钉死。
  {
    const storm = sceneImage('storm')!
    const chart = sceneImage('chart')!
    assert(storm !== chart, 'storm 与 chart 指向不同素材地址')
    assert(shouldUseSceneImage(null, storm), '尚未失败过时显示真图')
    assert(!shouldUseSceneImage(storm, storm), '失败的地址回退手绘 SVG')
    assert(shouldUseSceneImage(storm, chart), '一次失败不污染别的场景（chart 仍显示真图）')
    assert(shouldUseSceneImage(storm, storm) === false, '失败地址不会因为别的场景成功而复活')
    // 素材补齐后地址改变 → 新地址不在失败名单里 → 真图自动恢复，无需刷新页面
    const patched = storm.replace(/d01\.png$/, 'd01-v2.png')
    assert(patched !== storm, '构造一个「补齐后的新地址」')
    assert(shouldUseSceneImage(storm, patched), '素材补齐（地址变化）后真图自动恢复')
    assert(!shouldUseSceneImage(null, undefined), '无素材的场景直接走手绘 SVG')
    assert(!shouldUseSceneImage('x', undefined), '无素材的场景不受失败状态影响')
  }
  // D1-D14：全部为 1200×675 高清事件图（D1-D4 来自事件大图包；D5-D10 为主包升级版，取代旧图鉴切片；
  //          D11-D14 为第二批 P1 补充的四个高频场景）
  for (let i = 1; i <= 14; i++) {
    const p = join(pubDir, 'public', 'assets', 'scenes', `d${String(i).padStart(2, '0')}.png`)
    assert(existsSync(p), `场景 d${String(i).padStart(2, '0')}.png 存在`)
    const buf = readFileSync(p)
    const w = buf.readUInt32BE(16); const h = buf.readUInt32BE(20)
    assert(w > 1000 && w < 1400 && h > 500 && h < 800, `场景 d${String(i).padStart(2, '0')} 高清尺寸合规（${w}×${h}）`)
  }
  // 第二批 P2：9 枚徽记（4 派系 + 5 特质），SVG 与 PNG 各一份
  for (const file of [
    'faction_crown', 'faction_guild', 'faction_scholars', 'faction_brethren',
    'trait_merchant', 'trait_bulwark', 'trait_leader', 'trait_explorer', 'trait_surgeon',
  ]) {
    const svgP = join(pubDir, 'public', 'assets', 'ui', `${file}.svg`)
    const pngP = join(pubDir, 'public', 'assets', 'ui', `${file}.png`)
    assert(existsSync(svgP), `徽记 ${file}.svg 存在`)
    assert(existsSync(pngP), `徽记 ${file}.png 存在`)
    const buf = readFileSync(svgP)
    const text = buf.toString('utf8')
    assert(text.includes('<svg') && text.includes('viewBox="0 0 512 512"'),
      `徽记 ${file}.svg 是 512×512 矢量图`)
  }
}

console.log('== 29. 环境资产：海面/港口/天气层/结局背景 ==')
{
  const pubDir = process.cwd()
  // B 组海面：两季无缝 tile（ocean_waves 晴 / ocean_deep 暴风），512² 不透明
  //
  // 尺寸说明：这里断言 512×512 而不是 1024×1024，是有意为之。
  // MapView 以 `backgroundSize: '512px 512px'` 渲染海面，512² 素材与显示尺寸
  // 正好 1:1 像素映射——不放大、不模糊、无重采样损失。
  // 若换成 1024² 素材而仍按 512px 显示，反而是把高分辨率图缩到一半，白白浪费。
  // 平铺无缝性另由 scripts/gen_sea_texture.py 的溢出裁剪保证（实测边缘亮度差 < 5/255）。
  for (const [file, label] of [['sea-tile.png', '常规海面'], ['sea-tile-storm.png', '暴风海面']] as const) {
    const p = join(pubDir, 'public', 'assets', 'sea', file)
    assert(existsSync(p), `海面 ${file} 存在（${label}）`)
    const buf = readFileSync(p)
    const w = buf.readUInt32BE(16); const h = buf.readUInt32BE(20)
    assert(w === 512 && h === 512, `海面 ${file} 为 512×512（实际 ${w}×${h}）`)
    assert(buf[24] === 8 && buf[25] === 2, `海面 ${file} 为 8bit RGB`)
  }
  // C 组港口：五张 1600×900 场景图
  const PORT_FILES = ['port_caribbean.png', 'port_northern_europe.png', 'port_seville.png', 'port_southeast_asia.png', 'port_west_africa.png']
  for (const file of PORT_FILES) {
    const p = join(pubDir, 'public', 'assets', 'ports', file)
    assert(existsSync(p), `港口 ${file} 存在`)
    const buf = readFileSync(p)
    const w = buf.readUInt32BE(16); const h = buf.readUInt32BE(20)
    assert(w === 1600 && h === 900, `港口 ${file} 为 1600×900（实际 ${w}×${h}）`)
  }
  // 20 个港口全部有图，且抽样式对位正确
  for (const port of ports) {
    assert(!!portImage(port.id), `港口 ${port.nameCn}(${port.id}) 有场景图`)
  }
  assert(portImage(6).endsWith('port_seville.png'), '塞维利亚用专属图')
  assert(portImage(7).endsWith('port_seville.png'), '里斯本（伊比利亚）共用塞维利亚图')
  assert(portImage(8).endsWith('port_northern_europe.png'), '伦敦（北欧）用北欧图')
  assert(portImage(1).endsWith('port_caribbean.png'), '哈瓦那用加勒比图')
  assert(portImage(9).endsWith('port_west_africa.png'), '埃尔米纳用西非图')
  assert(portImage(12).endsWith('port_southeast_asia.png'), '马六甲用东南亚图')
  // G 组天气层：四张 1024² RGBA（雨/雾/飞沫/云）
  for (const [key, url] of Object.entries(FX_ASSETS)) {
    const file = url.split('/').pop()!
    const p = join(pubDir, 'public', 'assets', 'fx', file)
    assert(existsSync(p), `天气层 ${file}（${key}）存在`)
    const buf = readFileSync(p)
    const w = buf.readUInt32BE(16); const h = buf.readUInt32BE(20)
    assert(w === 1024 && h === 1024, `天气层 ${file} 为 1024×1024（实际 ${w}×${h}）`)
    assert(buf[24] === 8 && buf[25] === 6, `天气层 ${file} 为 8bit RGBA`)
  }
  // H 组结局背景：三张 1920×1080
  for (const [key, url] of Object.entries(BG_ASSETS)) {
    const file = url.split('/').pop()!
    const p = join(pubDir, 'public', 'assets', 'bg', file)
    assert(existsSync(p), `背景 ${file}（${key}）存在`)
    const buf = readFileSync(p)
    const w = buf.readUInt32BE(16); const h = buf.readUInt32BE(20)
    assert(w === 1920 && h === 1080, `背景 ${file} 为 1920×1080（实际 ${w}×${h}）`)
    assert(buf[24] === 8 && buf[25] === 2, `背景 ${file} 为 8bit RGB`)
  }
}

console.log('== 28. UI 装饰资产（F1-F6）==')
{
  const pubDir = process.cwd()
  // 文件名 → 期望尺寸；羊皮纸为不透明 RGB，其余五张带 Alpha
  const UI_FILES: Array<[string, number, number, boolean]> = [
    ['ui_parchment.png', 1024, 1024, false],
    ['ui_frame_gold.png', 512, 512, true],
    ['ui_compass_rose.png', 512, 512, true],
    ['ui_banner.png', 488, 152, true],
    ['ui_pennants.png', 431, 128, true],
    ['ui_medal.png', 210, 417, true],
  ]
  for (const [file, w, h, hasAlpha] of UI_FILES) {
    const p = join(pubDir, 'public', 'assets', 'ui', file)
    assert(existsSync(p), `UI 资产 ${file} 存在`)
    const buf = readFileSync(p)
    const iw = buf.readUInt32BE(16); const ih = buf.readUInt32BE(20)
    assert(iw === w && ih === h, `UI 资产 ${file} 尺寸 ${w}×${h}（实际 ${iw}×${ih}）`)
    assert(buf[24] === 8 && buf[25] === (hasAlpha ? 6 : 2), `UI 资产 ${file} 为 8bit ${hasAlpha ? 'RGBA' : 'RGB'}`)
  }

  // 边框衍生件：九宫格切片源 + 单独切出的中央装饰
  // 关键约束：九宫格源的"中央区域"必须全透明，否则 border-image 的 fill/9-slice
  // 会把船徽、贝壳拉长铺进内容区，盖住最后一个选项按钮。
  const slicePath = join(pubDir, 'public', 'assets', 'ui', 'ui_frame_gold_slice.png')
  assert(existsSync(slicePath), '边框九宫格源 ui_frame_gold_slice.png 存在')
  {
    const buf = readFileSync(slicePath)
    const iw = buf.readUInt32BE(16); const ih = buf.readUInt32BE(20)
    assert(iw === 512 && ih === 512, `边框九宫格源尺寸 512×512（实际 ${iw}×${ih}）`)
    assert(buf[24] === 8 && buf[25] === 6, '边框九宫格源为 8bit RGBA')
  }
  for (const f of ['ui_frame_crest.png', 'ui_frame_shell.png']) {
    assert(existsSync(join(pubDir, 'public', 'assets', 'ui', f)), `边框装饰件 ${f} 存在`)
  }
  // 全部路径型键有值且指向 ui/ 目录（数字型常量如切片值不参与路径校验）
  const entries = Object.entries(UI_ASSETS).filter(([, v]) => typeof v === 'string') as [string, string][]
  assert(entries.length === 9, `UI_ASSETS 共 9 个路径键（实际 ${entries.length} 个）`)
  for (const [k, v] of entries) {
    assert(!!v && v.includes('/assets/ui/ui_'), `UI_ASSETS.${k} 指向 ui 资产目录`)
  }
  // 边框切片值必须与 ui_frame_gold_slice.png 的角块边长一致（否则九宫格错位）
  assert(UI_ASSETS.frameGoldSliceSize === 140, `边框切片值 = 140（实际 ${UI_ASSETS.frameGoldSliceSize}）`)
}

console.log('== 30. 剧情对白系统（戴夫式角色致辞）==')
{
  // 数据完整性
  assert(DIALOGUE_SCRIPTS.length === 1, '剧本表当前 1 段（开局致辞）')
  const script = getScript(OPENING_SCRIPT_ID)
  assert(!!script, '开局致辞剧本存在')
  assert(script!.lines.length === 3, '开局致辞三句台词')
  for (const l of script!.lines) {
    assert(l.length >= 8 && l.length <= 60, `台词长度合规（${l.length} 字）`)
  }
  const speaker = getSpeaker(script!)
  assert(!!speaker, '剧本绑定的说话人存在')
  assert(!!speaker!.portrait, `说话人「${speaker!.name}」有立绘映射（复用 E 组肖像）`)
  assert(!!speaker!.name && !!speaker!.title, '说话人有名字与身份小字')
  assert(getScript('no_such_script') === undefined, '未知剧本 id 返回 undefined')
  assert(getSpeaker({ id: 'x', speakerId: 'ghost', lines: [] }) === undefined, '未知说话人返回 undefined')

  // 推进纯逻辑
  assert(advanceDialogueIndex(0, 3) === 1, '第一句→第二句')
  assert(advanceDialogueIndex(1, 3) === 2, '第二句→第三句')
  assert(advanceDialogueIndex(2, 3) === -1, '末句之后返回 -1（整段结束）')
  assert(advanceDialogueIndex(0, 0) === -1, '空剧本防御：返回 -1')

  // uiBus 命令可达（键盘 → 组件解耦的关键一环）
  let heard = ''
  const off = onUiCommand(cmd => {
    if (cmd.type === 'dialogue:advance') heard = 'advance'
    if (cmd.type === 'dialogue:skip') heard = 'skip'
  })
  emitUiCommand({ type: 'dialogue:advance' })
  emitUiCommand({ type: 'dialogue:skip' })
  off()
  assert(heard === 'skip', 'uiBus 广播 dialogue:advance/skip 可达订阅者')

  // store 行为：open 记账防重播、逐句推进、末句关闭、skip 立即关闭、未知 id 忽略
  useGameStore.getState().initGame('default')
  assert(useGameStore.getState().dialogueSeen.length === 0, 'initGame 清空已播记录')
  useDialogueStore.getState().open(OPENING_SCRIPT_ID)
  assert(useDialogueStore.getState().scriptId === OPENING_SCRIPT_ID, 'open 后剧本激活')
  assert(useDialogueStore.getState().lineIndex === 0, '从第一句开始')
  assert(useGameStore.getState().dialogueSeen.includes(OPENING_SCRIPT_ID), 'open 即记账（刷新不重播）')
  useDialogueStore.getState().advance()
  useDialogueStore.getState().advance()
  assert(useDialogueStore.getState().lineIndex === 2, '两次推进到第三句')
  useDialogueStore.getState().advance()
  assert(useDialogueStore.getState().scriptId === null, '末句后整段自动关闭')
  useDialogueStore.getState().open(OPENING_SCRIPT_ID)
  useDialogueStore.getState().skip()
  assert(useDialogueStore.getState().scriptId === null, 'skip 立即关闭整段')
  useDialogueStore.getState().open('no_such_script')
  assert(useDialogueStore.getState().scriptId === null, '未知 id 不会激活对白')

  // markDialogueSeen 幂等
  useGameStore.getState().markDialogueSeen('demo_once')
  useGameStore.getState().markDialogueSeen('demo_once')
  assert(useGameStore.getState().dialogueSeen.filter(id => id === 'demo_once').length === 1, 'markDialogueSeen 幂等')
}

console.log('== 31. 事件文本瘦身守护 ==')
{
  // 设计约束（防止文本回涨到"读小说"）：
  //   主 description ≤ 60 字（1-2 句，场景图承担氛围）
  //   outcome description ≤ 50 字（1 句话，保留一个记忆点）
  //   choice text ≤ 24 字（按钮上一行能读完）
  const MAIN_MAX = 60
  const OUTCOME_MAX = 50
  const CHOICE_MAX = 24

  const mainTooLong = events.filter(e => e.description.length > MAIN_MAX)
  assert(mainTooLong.length === 0,
    `主描述全部 ≤ ${MAIN_MAX} 字（超标：${mainTooLong.map(e => `${e.id}(${e.description.length})`).join(',') || '无'}）`)

  const outcomeTooLong: string[] = []
  for (const e of events) {
    for (const c of e.choices) {
      for (const o of c.outcomes) {
        if (o.description.length > OUTCOME_MAX) outcomeTooLong.push(`${e.id}(${o.description.length})`)
      }
    }
  }
  assert(outcomeTooLong.length === 0,
    `结局描述全部 ≤ ${OUTCOME_MAX} 字（超标：${outcomeTooLong.join(',') || '无'}）`)

  const choiceTooLong = events.flatMap(e =>
    e.choices.filter(c => c.text.length > CHOICE_MAX).map(c => `${e.id}(${c.text.length})`))
  assert(choiceTooLong.length === 0,
    `选项文案全部 ≤ ${CHOICE_MAX} 字（超标：${choiceTooLong.join(',') || '无'}）`)

  // 标题同样要短：超过 12 字就不像标题了
  const titleTooLong = events.filter(e => e.title.length > 12).map(e => `${e.id}(${e.title.length})`)
  assert(titleTooLong.length === 0, `事件标题全部 ≤ 12 字（超标：${titleTooLong.join(',') || '无'}）`)

  // 总量守门：单个事件的全部文案（主描述 + 选项 + 所有结局）≤ 380 字
  // 玩家一局只会遇到 5-8 个事件，所以真正的阅读压力是"单事件文本量"，而非全库总量
  const perEvent = events.map(e => {
    const outs = e.choices.reduce((s, c) => s + c.outcomes.reduce((x, o) => x + o.description.length, 0), 0)
    const choices = e.choices.reduce((s, c) => s + c.text.length, 0)
    return { id: e.id, total: e.description.length + outs + choices }
  })
  const worst = perEvent.sort((a, b) => b.total - a.total)[0]
  assert(worst.total <= 380, `单事件文本量 ≤ 380 字（最大：id${worst.id} = ${worst.total}）`)

  // 场景图是氛围主力：每个事件都必须挂图（防止"文字兜底"的退化）
  assert(events.every(e => !!e.sceneKey), '所有事件都有场景图（文字不承担氛围）')
}

console.log('== 32. 事件小游戏：属性加成 ==')
{
  const base = { hullRatio: 0.5, crewRatio: 0.5, officers: [] as OfficerId[] }
  const bare = computeModifiers(base)

  // 基准：没有任何经营优势时，加成应接近 0
  assert(bare.windowBonus < 0.1, `基准判定窗口加成接近 0（实际 ${bare.windowBonus.toFixed(3)}）`)
  assert(bare.forgiveness === 0, `基准无额外容错（实际 ${bare.forgiveness}）`)
  assert(bare.edgeBonus === 0, `基准无表现加成（实际 ${bare.edgeBonus}）`)

  // 船体完好 → 窗口更宽
  const sturdy = computeModifiers({ ...base, hullRatio: 1 })
  assert(sturdy.windowBonus > bare.windowBonus, '船体完好：判定窗口更宽')

  // 人手充足 → 窗口更宽 + 多 1 次容错
  const crewed = computeModifiers({ ...base, crewRatio: 0.9 })
  assert(crewed.windowBonus > bare.windowBonus, '人手充足：判定窗口更宽')
  assert(crewed.forgiveness === 1, `人手充足：多容错 1 次（实际 ${crewed.forgiveness}）`)

  // 军官各司其职
  const pilot = computeModifiers({ ...base, officers: ['pilot'] })
  assert(pilot.windowBonus > bare.windowBonus, '领航员：判定窗口更宽')
  const qm = computeModifiers({ ...base, officers: ['quartermaster'] })
  assert(qm.forgiveness === 1, `大副：多容错 1 次（实际 ${qm.forgiveness}）`)
  const surgeon = computeModifiers({ ...base, officers: ['surgeon'] })
  assert(surgeon.edgeBonus > 0, '船医：表现分有额外加成')

  // 加成必须是有界的：再好的船也不能让窗口宽到离谱
  const perfect = computeModifiers({ hullRatio: 1, crewRatio: 1, officers: ['pilot', 'quartermaster', 'surgeon'] })
  assert(perfect.windowBonus < 0.6, `加成有上限（实际 ${perfect.windowBonus.toFixed(3)}）`)
  assert(perfect.forgiveness <= 3, `容错有上限（实际 ${perfect.forgiveness}）`)

  // 加成说明要给玩家看，必须非空且是字符串
  const lines = describeModifiers(perfect, { hullRatio: 1, crewRatio: 1, officers: ['pilot'] })
  assert(lines.length > 0 && lines.every(l => typeof l === 'string' && l.length > 0), '加成说明非空')
}

console.log('== 33. 事件小游戏：表现分修正结局概率 ==')
{
  // 三个结局：明显好 / 中 / 明显坏
  const outcomes = [
    { probability: 0.5, goldChange: 100, foodChange: 5, waterChange: 5, moraleChange: 20, durabilityChange: 5, crewChange: 0, description: '大捷' },
    { probability: 0.3, goldChange: 0, foodChange: -5, waterChange: -3, moraleChange: -5, durabilityChange: -20, crewChange: -1, description: '惨胜' },
    { probability: 0.2, goldChange: -100, foodChange: -15, waterChange: -10, moraleChange: -20, durabilityChange: -45, crewChange: -8, description: '大败' },
  ]

  const neutral = biasProbabilities(outcomes, 0.5)
  assert(Math.abs(neutral[0] - 0.5) < 1e-6, `表现 0.5 时概率不变（实际 ${neutral[0].toFixed(4)}）`)
  assert(Math.abs(neutral[1] - 0.3) < 1e-6, `表现 0.5 时概率不变（实际 ${neutral[1].toFixed(4)}）`)
  assert(Math.abs(neutral[2] - 0.2) < 1e-6, `表现 0.5 时概率不变（实际 ${neutral[2].toFixed(4)}）`)

  const good = biasProbabilities(outcomes, 1)
  const bad = biasProbabilities(outcomes, 0)
  assert(good[0] > 0.5, `表现出色：好结局概率上抬（实际 ${good[0].toFixed(4)}）`)
  assert(good[2] < 0.2, `表现出色：坏结局概率压低（实际 ${good[2].toFixed(4)}）`)
  assert(bad[0] < 0.5, `表现糟糕：好结局概率下沉（实际 ${bad[0].toFixed(4)}）`)
  assert(bad[2] > 0.2, `表现糟糕：坏结局概率上抬（实际 ${bad[2].toFixed(4)}）`)

  // 撬动幅度必须落在"±25pp 量级"这个设计区间内——太小白玩不出差别，太大就成纯数值碾压
  const swing = good[0] - 0.5
  assert(swing > 0.08 && swing < 0.40, `好结局概率撬动在 8~40pp（实际 ${(swing * 100).toFixed(1)}pp）`)

  // 概率必须始终合法：非负、总和为 1
  for (const perf of [0, 0.25, 0.5, 0.75, 1]) {
    const ps = biasProbabilities(outcomes, perf)
    assert(ps.every(p => p >= 0 && p <= 1), `概率合法（perf=${perf}）`)
    assert(Math.abs(ps.reduce((a, b) => a + b, 0) - 1) < 1e-9, `概率和为 1（perf=${perf}）`)
  }

  // 全部结局一样好时不应该有倾斜（无差别地加权没意义）
  const flat = outcomes.map(o => ({ ...o, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0 }))
  const flatPs = biasProbabilities(flat, 1)
  assert(Math.abs(flatPs[0] - 0.5) < 1e-6, '结局无优劣差别时不倾斜')

  // selectOutcome 必须接受表现分参数并真的改变落点
  let goodHits = 0
  let badHits = 0
  for (let i = 0; i < 2000; i++) {
    if (selectOutcome(outcomes, 1).description === '大捷') goodHits++
    if (selectOutcome(outcomes, 0).description === '大捷') badHits++
  }
  assert(goodHits > badHits * 2, `表现分真实影响落点（好手 ${goodHits} 次 vs 差手 ${badHits} 次）`)
}

console.log('== 34. 事件小游戏：风暴收帆 ==')
{
  const mods = computeModifiers({ hullRatio: 0.5, crewRatio: 0.5, officers: [] })

  // 命中窗口中心 → 命中且精准度高
  const s1 = createStormState(() => 0.5)
  s1.needle = s1.rounds[0].center
  s1.cooldown = 0
  const r1 = tryReef(s1, mods)
  assert(r1.hit, '指针在窗口中心：命中')
  assert(r1.precision > 0.9, `正中窗口：精准度接近 1（实际 ${r1.precision.toFixed(3)}）`)
  assert(s1.hits === 1 && s1.misses === 0, '命中计数正确')

  // 指针远离窗口 → 未命中
  const s2 = createStormState(() => 0.5)
  s2.needle = s2.rounds[0].center > 0.5 ? 0.02 : 0.98
  s2.cooldown = 0
  const r2 = tryReef(s2, mods)
  assert(!r2.hit, '指针远离窗口：未命中')
  assert(s2.misses === 1 && s2.hits === 0, '失手计数正确')

  // 冷却期间按无效（防止连点秒杀）
  const s3 = createStormState(() => 0.5)
  s3.cooldown = 0.3
  const before = s3.round
  tryReef(s3, mods)
  assert(s3.round === before, '冷却期内操作无效')

  // 全部命中 → 表现分高
  const s4 = createStormState(() => 0.5)
  let guard = 0
  while (!s4.finished && guard++ < 50) {
    s4.needle = s4.rounds[Math.min(s4.round, s4.rounds.length - 1)].center
    s4.cooldown = 0
    tryReef(s4, mods)
  }
  assert(s4.finished, '连续命中 5 轮后结束')
  const perfGood = stormPerformance(s4, mods)
  assert(perfGood > 0.85, `全中表现分很高（实际 ${perfGood}）`)

  // 全部失手 → 表现分低
  // 注意：createStormState(() => 0.5) 的固定随机源会让指针初始正好落在窗口中心，
  // 所以每次操作前必须把指针挪到窗口另一侧，才是真的"打偏"
  const s5 = createStormState(() => 0.5)
  guard = 0
  while (!s5.finished && guard++ < 50) {
    const c = s5.rounds[Math.min(s5.round, s5.rounds.length - 1)].center
    s5.needle = c > 0.5 ? 0.01 : 0.99
    s5.cooldown = 0
    tryReef(s5, mods)
  }
  const perfBad = stormPerformance(s5, mods)
  assert(s5.misses === STORM_ROUNDS, `全部操作都失手（实际 ${s5.misses}/${STORM_ROUNDS}）`)
  assert(perfBad < 0.3, `全失手表现分很低（实际 ${perfBad}）`)

  // 超时未收帆也算失手（不能干等过关）
  const s6 = createStormState(() => 0.5)
  s6.needle = 0.02
  let t = 0
  while (!s6.finished && t < 10) { advanceStorm(s6, 0.1); t += 0.1 }
  assert(s6.misses > 0, `超时未收帆算失手（实际 ${s6.misses} 次）`)

  // 表现分必须落在 0..1
  assert(perfGood >= 0 && perfGood <= 1 && perfBad >= 0 && perfBad <= 1, '表现分落在 0..1')
}

console.log('== 35. 事件小游戏：接舷拦跳板 ==')
{
  const mods = computeModifiers({ hullRatio: 0.5, crewRatio: 0.5, officers: [] })

  const b1 = createBoardingState()
  assert(b1.planks.length === 3, '三条跳板')
  assert(b1.total === BOARDING_WAVES, `共 ${BOARDING_WAVES} 波登船者`)

  // 推空跳板：算无效出手
  b1.cooldown = 0
  pushPlank(b1, 0, mods)
  assert(b1.wasted === 1, '推空跳板记为无效出手')

  // 正常推挡：削进度
  const b2 = createBoardingState()
  b2.planks[1].active = true
  b2.planks[1].heat = 0.5
  b2.cooldown = 0
  const heatBefore = b2.planks[1].heat
  pushPlank(b2, 1, mods)
  assert(b2.planks[1].heat < heatBefore, '推挡削减攀爬进度')

  // 冷却期间无效
  const b3 = createBoardingState()
  b3.planks[0].active = true
  b3.planks[0].heat = 0.5
  pushPlank(b3, 0, mods)
  b3.planks[0].heat = 0.5
  const c0 = b3.cooldown
  pushPlank(b3, 0, mods)
  assert(b3.cooldown === c0, '冷却期内推挡无效')

  // 打到负数 → 击退
  const b4 = createBoardingState()
  b4.planks[2].active = true
  b4.planks[2].heat = 0.05
  b4.cooldown = 0
  const r4 = pushPlank(b4, 2, mods)
  assert(r4.repelled, '进度推到底即击退')
  assert(b4.repelled === 1 && !b4.planks[2].active, '击退后跳板清空')

  // 登船者爬满 → 上船
  const b5 = createBoardingState()
  b5.planks[0].active = true
  b5.planks[0].heat = 0.99
  advanceBoarding(b5, 0.5, () => 0)
  assert(b5.boarded === 1, '爬满即上船')

  // 全部波次打完 → 结束
  const b6 = createBoardingState()
  let guard = 0
  while (!b6.finished && guard++ < 2000) {
    advanceBoarding(b6, 0.05, () => 0)
    // 模拟玩家把每个登船者都顶回去
    for (let i = 0; i < b6.planks.length; i++) {
      if (b6.planks[i].active && b6.cooldown <= 0) {
        b6.planks[i].heat = 0
        b6.planks[i].active = false
        b6.repelled += 1
      }
    }
    b6.cooldown = 0
  }
  assert(b6.finished, '波次打完后结束')
  assert(b6.repelled === b6.total, `全部击退（实际 ${b6.repelled}/${b6.total}）`)

  // 表现分：全击退高、全上船低
  const perfGood = boardingPerformance(b6, mods)
  assert(perfGood > 0.75, `全击退表现分高（实际 ${perfGood}）`)

  const b7 = createBoardingState()
  b7.repelled = 0
  b7.boarded = b7.total
  const perfBad = boardingPerformance(b7, mods)
  assert(perfBad < 0.25, `全上船表现分低（实际 ${perfBad}）`)
  assert(perfGood >= 0 && perfGood <= 1 && perfBad >= 0 && perfBad <= 1, '表现分落在 0..1')
}

console.log('== 36. 事件小游戏：挂载与接线 ==')
{
  // 挂了小游戏的事件：必须同时存在"要动手"和"绕开"两类选项，
  // 否则玩家被强制操作，参与感变成了负担
  const withGame = events.filter(e => e.choices.some(c => c.miniGame))
  assert(withGame.length >= 4, `至少 4 个事件带小游戏（实际 ${withGame.length}）`)

  for (const e of withGame) {
    const gameChoices = e.choices.filter(c => c.miniGame)
    const plainChoices = e.choices.filter(c => !c.miniGame)
    assert(gameChoices.length < e.choices.length,
      `事件 ${e.id}：要动手的选项不能是全部（应留出绕开的路）`)
    assert(plainChoices.length >= 1,
      `事件 ${e.id}：至少保留一个不需要操作的选项`)
  }

  // 小游戏 id 只能是已实现的七种
  const VALID_IDS = ['storm', 'boarding', 'escape', 'lookout', 'gamble', 'haggle', 'cannon']
  const allIds = events.flatMap(e => e.choices.map(c => c.miniGame).filter(Boolean))
  assert(allIds.every(id => VALID_IDS.includes(id as string)),
    `小游戏 id 合法（实际：${[...new Set(allIds)].join(',')}）`)

  // 六种原型都要有事件在用（不能只实现不挂载）
  for (const id of VALID_IDS) {
    assert(allIds.includes(id as never), `原型「${id}」至少挂载了一个事件`)
  }

  // 带小游戏的选项必须有多个结局（否则修正概率毫无意义）
  for (const e of withGame) {
    for (const c of e.choices.filter(x => x.miniGame)) {
      assert(c.outcomes.length >= 2, `事件 ${e.id}：带小游戏的选项至少要有 2 个结局`)
    }
  }

  // 小游戏必须真能改变落点：同一选项，手感好坏应该给出不同的结果分布
  const gameChoice = withGame[0].choices.find(c => c.miniGame)!
  const goodOutcomes = gameChoice.outcomes.map(o => o.description)
  let bestIdx = 0
  for (let i = 1; i < gameChoice.outcomes.length; i++) {
    if (outcomeMerit(gameChoice.outcomes[i]) > outcomeMerit(gameChoice.outcomes[bestIdx])) bestIdx = i
  }
  let goodPick = 0
  let badPick = 0
  for (let i = 0; i < 3000; i++) {
    if (selectOutcome(gameChoice.outcomes, 1).description === goodOutcomes[bestIdx]) goodPick++
    if (selectOutcome(gameChoice.outcomes, 0).description === goodOutcomes[bestIdx]) badPick++
  }
  assert(goodPick > badPick, `表现分改变真实结局分布（好手 ${goodPick} vs 差手 ${badPick}）`)

  // 舷炮对轰（事件 236）：挂载点必须就是那个「三轮齐射」的迎战选项
  const ev236 = events.find(e => e.id === 236)!
  assert(ev236.choices[0].miniGame === 'cannon',
    '事件 236「掉头迎战」挂的是舷炮小游戏（叙事说的三轮齐射）')
  assert(ev236.choices.slice(1).every(c => !c.miniGame),
    '事件 236 的避战/传话选项保持纯抉择（不强制操作）')
  assert(ev236.choices[0].outcomes.some(o => o.goldChange > 0),
    '迎战的好结局带真实收益（打赢了有赏金）')
  assert(ev236.choices[0].outcomes.some(o => o.durabilityChange < 0),
    '迎战的坏结局带真实代价（船要挨炮）')
}

console.log('== 37. 教学引导：步骤常量与文案 ==')
{
  // 教学步骤常量必须与实际步骤数一致（组件里有运行时自检，这里做静态兜底）
  assert(TUTORIAL_STEP_COUNT === 10, `教学步骤常量为 10（实际 ${TUTORIAL_STEP_COUNT}）`)
  assert(TUTORIAL_STEP_COUNT >= 10, '教学步骤数不少于 10')
  // 教学必须讲到航段方针——它是游戏里唯一的速度旋钮，玩家不知道就等于没有
  const stanceText = TUTORIAL_STEP_TEXTS.find(t => t.includes('方针'))
  assert(!!stanceText, '教学里有一步专门讲航行方针')

  // 教学必须讲到事件选项的赌注摘要——否则芯片和[稳/搏/险]标签对玩家是哑谜
  const stakeText = TUTORIAL_STEP_TEXTS.find(t => t.includes('赌注'))
  assert(!!stakeText, '教学里有一步专门讲事件选项的赌注摘要')
  if (stakeText) {
    assert(stakeText.includes('稳/搏/险'), '赌注教学点明了三档风险标签')
    assert(stakeText.includes('估算'), '赌注教学说明了数字是加权估算而非承诺')
  }

  // 教学文案里必须明确告知小游戏怎么玩——否则玩家看到角标会不知道要做什么
  const miniText = TUTORIAL_STEP_TEXTS.find(t => t.includes('小标') && t.includes('小游戏'))
  assert(!!miniText, '教学里有一步专门讲小游戏')
  if (miniText) {
    assert(miniText.includes('选项'), '小游戏教学说明了在哪里会看到角标')
  }

  // 六种原型都要在教学里被点名（玩家第一次遇到不能完全没准备）
  const keyText = TUTORIAL_STEP_TEXTS.find(t => t.includes('收帆') && t.includes('接舷'))
  assert(!!keyText, '教学里有一步列出各种小标的玩法')
  if (keyText) {
    for (const name of ['收帆', '接舷', '逃脱', '瞭望', '对赌', '议价']) {
      assert(keyText.includes(name), `教学点名了「${name}」原型`)
    }
    assert(keyText.includes('空格') && keyText.includes('方向键'),
      '小游戏教学说明了操作按键')
  }

  // 所有教学文案非空
  assert(TUTORIAL_STEP_TEXTS.every(t => t.trim().length > 0),
    '所有教学步骤文案非空')
  assert(TUTORIAL_STEP_TEXTS.length === TUTORIAL_STEP_COUNT,
    `教学文案条数与常量一致（${TUTORIAL_STEP_TEXTS.length} vs ${TUTORIAL_STEP_COUNT}）`)

  // 聚光框必须锚定到真实 DOM 元素，不能是硬编码像素。
  // 之前写死 { left:'20px', top:'50%' }，实测落在 y=500，
  // 而侧栏"舰队"按钮实际在 y=388 —— 聚光框照的是一片空白。
  assert(!(TUTORIAL_STEPS as unknown as { spotlight?: unknown }[]).some(s => s.spotlight),
    '教学步骤不再使用硬编码 spotlight 坐标')
  assert(TUTORIAL_TARGETS.length >= 4,
    `教学至少 4 步带锚点（实际 ${TUTORIAL_TARGETS.length}）`)

  // 每个锚点名都必须在源码里真的存在 data-tut 属性——否则聚光框找不到目标就退化成无聚光
  // 注意用 process.cwd() 而不是 __dirname：ESM bundle 里没有 __dirname，
  // 引用它会让 esbuild 注入 require()，与顶层 await 冲突直接崩。
  const srcRoot = join(process.cwd(), 'src')
  const anchorFiles = [
    join(srcRoot, 'pages', 'MainMap.tsx'),
    join(srcRoot, 'components', 'ui', 'BottomBar.tsx'),
    join(srcRoot, 'components', 'map', 'ShipAnimation.tsx'),
  ]
  const srcAll = anchorFiles.map(f => readFileSync(f, 'utf8')).join('\n')
  for (const t of TUTORIAL_TARGETS) {
    assert(srcAll.includes(`data-tut="${t}"`) || srcAll.includes(`data-tut={`) && srcAll.includes(`btn.type`),
      `锚点「${t}」在源码里有对应的 data-tut`)
  }
  // 侧栏按钮是循环渲染，data-tut 走 btn.type，需确认 panelButtons 的 type
  // 集合覆盖教学用到的侧栏锚点
  const mainMapSrc = readFileSync(join(srcRoot, 'pages', 'MainMap.tsx'), 'utf8')
  for (const t of ['fleet', 'port', 'trade']) {
    assert(new RegExp(`type:\\s*'${t}'`).test(mainMapSrc),
      `侧栏锚点「${t}」在 panelButtons 里有定义`)
  }
}

console.log('== 38. 键盘优先级：教学通道必须高于对白与面板 ==')
{
  // 教学进行中时，键盘应完全归教学：Enter 推下一步、Esc 跳过。
  // 这里直接验 store 的动作函数（键盘钩子里调用的是同一批）。
  // 注意初始值不假设为 -1：前面的测试可能已调用过 initGame（它会把教学步重置为 0）。
  const store = useGameStore.getState()
  store.skipTutorial()
  assert(useGameStore.getState().tutorialStep === -1, 'skipTutorial 回到 -1（不在教学中）')
  assert(!(useGameStore.getState().tutorialStep >= 0
    && useGameStore.getState().tutorialStep < TUTORIAL_STEP_COUNT),
    '教学结束后不再落入教学通道')

  useGameStore.getState().nextTutorialStep()
  assert(useGameStore.getState().tutorialStep === 0, 'nextTutorialStep 从 -1 推进到第 1 步')
  useGameStore.getState().nextTutorialStep()
  assert(useGameStore.getState().tutorialStep === 1, 'nextTutorialStep 可连续推进')

  // 教学边界：最后一步再按"下一步"应由界面转成跳过（组件里判断），这里只验越界不可达
  assert(TUTORIAL_STEPS.length === TUTORIAL_STEP_COUNT, '教学步骤数与常量一致')
  assert(TUTORIAL_STEP_COUNT > 0, '教学步数大于 0')
}

console.log('== 39. 事件小游戏：逃脱（方向键闪避） ==')
{
  const noMods: MiniGameModifiers = { windowBonus: 0, forgiveness: 0, edgeBonus: 0 }
  const goodMods: MiniGameModifiers = { windowBonus: 0.30, forgiveness: 1, edgeBonus: 0.05 }

  // 反应窗口随加成放大
  assert(escapeWindow(goodMods) > escapeWindow(noMods),
    `加成放大反应窗口（${escapeWindow(goodMods).toFixed(2)} > ${escapeWindow(noMods).toFixed(2)}）`)
  assert(escapeWindow(noMods) > ESCAPE_TELEGRAPH,
    '加成是在基准时间之上延长，而不是缩短')

  // 按对方向 → 成功格挡
  {
    const s = createEscapeState()
    // 造一个确定的方向：手动生成并推进，直到出现来袭
    let guard = 0
    while (!s.dir && guard++ < 100) advanceEscape(s, 0.016, () => 0.5, noMods)
    assert(!!s.dir, '逃脱会生成来袭方向')
    const target = s.dir!
    const before = s.dodged
    const { dodged } = dodgeEscape(s, target)
    assert(dodged, '按对方向 → 格挡成功')
    assert(s.dodged === before + 1, '格挡计数 +1')
    assert(s.resolved, '格挡后本次袭击结算')
  }

  // 按错方向 → 被击中
  {
    const s = createEscapeState()
    let guard = 0
    while (!s.dir && guard++ < 100) advanceEscape(s, 0.016, () => 0.5, noMods)
    const wrong = ESCAPE_DIRS.find(d => d !== s.dir)!
    const { dodged } = dodgeEscape(s, wrong)
    assert(!dodged, '按错方向 → 失败')
    assert(s.hit === 1, '按错方向被击中计数 +1')
    assert(s.dodged === 0, '按错方向不算格挡')
  }

  // 超时没按 → 被击中
  {
    const s = createEscapeState()
    let guard = 0
    while (!s.dir && guard++ < 100) advanceEscape(s, 0.016, () => 0.5, noMods)
    const window = s.window
    let t = 0
    while (t < window + 0.2) { advanceEscape(s, 0.05, () => 0.5, noMods); t += 0.05 }
    assert(s.hit >= 1, '超时未按 → 被击中')
  }

  // 全程按对 → 表现分高；全程按错 → 表现分低
  {
    const sGood = createEscapeState()
    for (let i = 0; i < ESCAPE_WAVES; i++) {
      let guard = 0
      while (!sGood.dir && guard++ < 200) advanceEscape(sGood, 0.016, () => 0.5, noMods)
      if (!sGood.dir) break
      dodgeEscape(sGood, sGood.dir)
    }
    const perfGood = escapePerformance(sGood, noMods)
    assert(sGood.dodged === ESCAPE_WAVES, `全程按对全部格挡（实际 ${sGood.dodged}）`)
    assert(perfGood > 0.6, `全程按对表现分高（实际 ${perfGood}）`)

    const sBad = createEscapeState()
    for (let i = 0; i < ESCAPE_WAVES; i++) {
      let guard = 0
      while (!sBad.dir && guard++ < 200) advanceEscape(sBad, 0.016, () => 0.5, noMods)
      if (!sBad.dir) break
      dodgeEscape(sBad, ESCAPE_DIRS.find(d => d !== sBad.dir)!)
    }
    const perfBad = escapePerformance(sBad, noMods)
    assert(perfBad < 0.2, `全程按错表现分低（实际 ${perfBad}）`)
  }

  // 表现分落在 0..1
  {
    const s = createEscapeState()
    const p = escapePerformance(s, noMods)
    assert(p >= 0 && p <= 1, `表现分落在 0..1（实际 ${p}）`)
  }
}

console.log('== 40. 事件小游戏：瞭望（灯号记忆序列） ==')
{
  const noMods: MiniGameModifiers = { windowBonus: 0, forgiveness: 0, edgeBonus: 0 }

  // 初始序列长度
  {
    const s = createLookoutState(() => 0.5)
    assert(s.sequence.length === LOOKOUT_START_LEN,
      `初始序列 ${LOOKOUT_START_LEN} 盏（实际 ${s.sequence.length}）`)
    assert(s.phase === 'lead', '初始处于开场空档')
  }

  // 展示阶段会走到"复现"阶段
  {
    const s = createLookoutState(() => 0.5)
    let t = 0
    while (s.phase !== 'input' && t < 30) { advanceLookout(s, 0.05, noMods); t += 0.05 }
    assert(s.phase === 'input', '展示结束进入复现阶段')
  }

  // 按对整个序列 → 本轮过
  {
    const s = createLookoutState(() => 0.5)
    let t = 0
    while (s.phase !== 'input' && t < 30) { advanceLookout(s, 0.05, noMods); t += 0.05 }
    const seq = [...s.sequence]
    let cleared = false
    for (const d of seq) {
      const r = pressLookout(s, d)
      if (r.cleared) cleared = true
    }
    assert(cleared, '按对整个序列 → 本轮通过')
    assert(s.cleared === 1, '通过轮数 +1')
  }

  // 按错 → 本轮作废
  {
    const s = createLookoutState(() => 0.5)
    let t = 0
    while (s.phase !== 'input' && t < 30) { advanceLookout(s, 0.05, noMods); t += 0.05 }
    const wrong = ESCAPE_DIRS.find(d => d !== s.sequence[0])!
    const r = pressLookout(s, wrong)
    assert(r.roundFailed, '按错 → 本轮作废')
    assert(s.missed === 1, '失败轮数 +1')
  }

  // 展示阶段按方向键不惩罚（不该因为手痒被罚）
  {
    const s = createLookoutState(() => 0.5)
    const r = pressLookout(s, 'up')
    assert(!r.roundFailed && s.missed === 0, '展示阶段按方向键不判负')
  }

  // 每轮序列加长一盏
  {
    const s = createLookoutState(() => 0.5)
    const len0 = s.sequence.length
    let t = 0
    while (s.phase !== 'input' && t < 30) { advanceLookout(s, 0.05, noMods); t += 0.05 }
    for (const d of [...s.sequence]) pressLookout(s, d)
    // 结算空档 → 下一轮
    let t2 = 0
    while (s.phase === 'roundOver' && t2 < 5) { advanceLookout(s, 0.05, noMods); t2 += 0.05 }
    assert(s.round === 1, `过一轮后轮数 +1（实际 ${s.round}）`)
    assert(s.sequence.length === len0 + 1,
      `序列每轮加长一盏（${len0} → ${s.sequence.length}）`)
  }

  // 表现分：全对高分、全错低分
  {
    const sGood = createLookoutState(() => 0.5)
    let t = 0
    while (sGood.phase !== 'input' && t < 30) { advanceLookout(sGood, 0.05, noMods); t += 0.05 }
    for (const d of [...sGood.sequence]) pressLookout(sGood, d)
    const pg = lookoutPerformance(sGood, noMods)
    assert(pg > 0.5, `全部记对表现分高（实际 ${pg}）`)

    const sBad = createLookoutState(() => 0.5)
    let t2 = 0
    while (sBad.phase !== 'input' && t2 < 30) { advanceLookout(sBad, 0.05, noMods); t2 += 0.05 }
    pressLookout(sBad, ESCAPE_DIRS.find(d => d !== sBad.sequence[0])!)
    const pb = lookoutPerformance(sBad, noMods)
    assert(pb < 0.4, `记错表现分低（实际 ${pb}）`)
  }

  // 轮数用完必须结束（否则游戏会无限循环下去）
  {
    const s = createLookoutState(() => 0.5)
    let t = 0
    let guard = 0
    while (!s.finished && guard++ < 2000) {
      advanceLookout(s, 0.05, noMods)
      t += 0.05
      if (s.phase === 'input') {
        // 按对 → 过一轮（这样能顺利走到轮数上限）
        for (const d of [...s.sequence]) pressLookout(s, d)
      }
    }
    assert(s.finished, `轮数用完即结束（实际 round=${s.round}）`)
    assert(s.round >= LOOKOUT_MAX_ROUNDS, `至少玩了 ${LOOKOUT_MAX_ROUNDS} 轮（实际 ${s.round}）`)
    assert(t < 120, `整局时长合理（${t.toFixed(1)} 秒）`)
  }

  // 复现阶段超时要判负（否则玩家不按，游戏永远不结束）
  {
    const s = createLookoutState(() => 0.5)
    let t = 0
    while (s.phase !== 'input' && t < 30) { advanceLookout(s, 0.05, noMods); t += 0.05 }
    assert(s.phase === 'input', '进入复现阶段')
    assert(s.inputLimit > 0, `复现阶段有时限（实际 ${s.inputLimit}）`)
    // 一路推进但从不按键 → 超时判负
    let t2 = 0
    while (s.phase === 'input' && t2 < 60) { advanceLookout(s, 0.05, noMods); t2 += 0.05 }
    assert(s.phase !== 'input', `复现超时会离开 input 阶段（实际 ${s.phase}）`)
    assert(s.missed === 1, `复现超时算本轮作废（missed=${s.missed}）`)
    assert(s.failReason === 'timeout', `超时标记为 timeout（实际 ${s.failReason}）`)
  }

  // 按错与超时要能区分（UI 提示文案不一样）
  {
    const s = createLookoutState(() => 0.5)
    let t = 0
    while (s.phase !== 'input' && t < 30) { advanceLookout(s, 0.05, noMods); t += 0.05 }
    pressLookout(s, ESCAPE_DIRS.find(d => d !== s.sequence[0])!)
    assert(s.failReason === 'wrong', `按错标记为 wrong（实际 ${s.failReason}）`)
  }
  // 新一轮开始时失败标记要清掉
  {
    const s = createLookoutState(() => 0.5)
    let t = 0
    while (s.phase !== 'input' && t < 30) { advanceLookout(s, 0.05, noMods); t += 0.05 }
    pressLookout(s, ESCAPE_DIRS.find(d => d !== s.sequence[0])!)
    let t2 = 0
    while (s.phase === 'roundOver' && t2 < 5) { advanceLookout(s, 0.05, noMods); t2 += 0.05 }
    assert(s.failReason === null, `新一轮清掉失败标记（实际 ${s.failReason}）`)
  }

  // 整局时长上限：5 轮 × 序列最长 7 盏，展示 + 复现都算上也要在 60 秒内
  {
    const s = createLookoutState(() => 0.5)
    let t = 0
    let guard = 0
    while (!s.finished && guard++ < 5000) {
      advanceLookout(s, 0.05, noMods)
      t += 0.05
      if (s.phase === 'input') {
        for (const d of [...s.sequence]) pressLookout(s, d)
      }
    }
    assert(t < 60, `全对速通的整局时长在 60 秒内（实际 ${t.toFixed(1)} 秒）`)
  }

  // 全对通关必须拿到满分（分母不能用轮数上限，否则永远差一截）
  {
    const s = createLookoutState(() => 0.5)
    let guard = 0
    while (!s.finished && guard++ < 5000) {
      advanceLookout(s, 0.05, noMods)
      if (s.phase === 'input') {
        for (const d of [...s.sequence]) pressLookout(s, d)
      }
    }
    const p = lookoutPerformance(s, noMods)
    assert(p >= 0.99, `全对通关拿满分（实际 ${p}）`)
  }
}

console.log('== 41. 事件小游戏：对赌（押注） ==')
{
  const noMods: MiniGameModifiers = { windowBonus: 0, forgiveness: 0, edgeBonus: 0 }

  // 区间必须"含而不露"：不能 low==high 直接暴露点数
  {
    for (let i = 0; i < 200; i++) {
      const s = dealGamble(createGambleState(), noMods, Math.random)
      assert(s.high > s.low, `区间至少跨两个点（第 ${i} 次：${s.low}~${s.high}）`)
      assert(s.low >= 1 && s.high <= GAMBLE_DICE, '区间在骰子点数范围内')
    }
  }

  // 加成让区间收窄（看得更清）
  {
    const goodMods: MiniGameModifiers = { windowBonus: 0.35, forgiveness: 0, edgeBonus: 0 }
    let narrow = 0, wide = 0
    for (let i = 0; i < 200; i++) {
      const a = dealGamble(createGambleState(), noMods, Math.random)
      const b = dealGamble(createGambleState(), goodMods, Math.random)
      if (b.high - b.low < a.high - a.low) narrow++
      if (b.high - b.low > a.high - a.low) wide++
    }
    assert(narrow > wide, `加成让区间收窄（收窄 ${narrow} vs 变宽 ${wide}）`)
  }

  // 下注后不可反悔
  {
    const s = dealGamble(createGambleState(), noMods, () => 0.5)
    placeGambleBet(s, 'high', noMods, () => 0.5)
    const side = s.side
    placeGambleBet(s, 'low', noMods, () => 0.5)
    assert(s.side === side, '下注后不能改押另一边')
  }

  // 押大赢：玩家点数 > 庄家
  {
    const s = dealGamble(createGambleState(), noMods, () => 0.9)
    // rand()=0.9 → 庄家点数 1+floor(0.9*6)=6，玩家点数同值 → 平局算输
    const r = placeGambleBet(s, 'high', noMods, () => 0.9)
    assert(!r.won, '平局算押错（避免无脑押大）')
    assert(s.bankroll === GAMBLE_BANKROLL - GAMBLE_STAKE, '押错扣注')
    assert(s.losses === 1, '输的计数 +1')
  }

  // 押小赢：玩家点数 < 庄家
  {
    // 庄家取大点数、玩家取小点数，才能造出"押小且点数更小"
    const s = dealGamble(createGambleState(), noMods, () => 0.99)
    const r = placeGambleBet(s, 'low', noMods, () => 0.05)
    assert(r.won, `押小且点数更小 → 赢（庄家 ${s.dealer} 你 ${s.player}）`)
    assert(s.bankroll === GAMBLE_BANKROLL + GAMBLE_STAKE, '押对加注')
    assert(s.wins === 1, '赢的计数 +1')
  }

  // 收手：保住赌本并结束
  {
    const s = dealGamble(createGambleState(), noMods, () => 0.5)
    cashOutGamble(s)
    assert(s.finished, '收手即结束')
    assert(s.cashedOut, '标记为已收手')
    assert(s.bankroll === GAMBLE_BANKROLL, '收手不改变赌本')
  }

  // 轮数用完即结束
  {
    const s = createGambleState()
    for (let i = 0; i < GAMBLE_ROUNDS; i++) nextGambleRound(s)
    assert(s.finished, `轮数用完即结束（${GAMBLE_ROUNDS} 轮）`)
  }

  // 表现分：赢钱 > 基准 > 输钱
  {
    const sWin = createGambleState()
    sWin.pnl = 60; sWin.wins = 3; sWin.losses = 0
    const sLose = createGambleState()
    sLose.pnl = -60; sLose.wins = 0; sLose.losses = 3
    const pw = gamblePerformance(sWin, noMods)
    const pl = gamblePerformance(sLose, noMods)
    assert(pw > 0.5, `赢钱表现分高于基准（实际 ${pw}）`)
    assert(pl < 0.5, `输钱表现分低于基准（实际 ${pl}）`)
    assert(pw > pl, '赢钱比输钱分高')
  }
}

console.log('== 42. 事件小游戏：议价（价格拉锯） ==')
{
  const noMods: MiniGameModifiers = { windowBonus: 0, forgiveness: 0, edgeBonus: 0 }

  // 初始状态
  {
    const s = createHaggleState()
    assert(s.price === HAGGLE_START_PRICE, `初始报价 ${HAGGLE_START_PRICE}（实际 ${s.price}）`)
    assert(s.floor === HAGGLE_FLOOR, `对方底线 ${HAGGLE_FLOOR}（实际 ${s.floor}）`)
    assert(!s.finished, '议价一开始未结束')
  }

  // 对方每轮压价
  {
    const s = createHaggleState()
    const before = s.price
    advanceHaggle(s, 0.016, () => 0.5)
    assert(s.price < before, `对方压价（${before} → ${s.price}）`)
    assert(s.round === 1, '轮数 +1')
  }

  // 加价：报价上升
  {
    const s = createHaggleState()
    const before = s.price
    const { broke } = haggleAction(s, 'raise', () => 0.99)
    // rand=0.99 → 风险判定用两次 rand，第一次 0.99 让 risk 接近 1，但第二次 rand 决定是否翻脸
    if (!broke) {
      assert(s.price > before, `加价后报价上升（${before} → ${s.price}）`)
      assert(s.raises === 1, '加价次数 +1')
    }
  }

  // 让步成交：按当前价落袋
  {
    const s = createHaggleState()
    advanceHaggle(s, 0.016, () => 0.5)
    const { closed } = haggleAction(s, 'concede', () => 0.5)
    assert(closed, '让步即成交')
    assert(s.finished, '成交后结束')
    assert(s.finalPrice === s.price, '成交价等于让步时的报价')
  }

  // 收手：对方多让一步
  {
    const s = createHaggleState()
    const before = s.price
    const { closed } = haggleAction(s, 'accept', () => 0.5)
    assert(closed, '收手即成交')
    assert(s.finalPrice === before + HAGGLE_EXIT_CONCESSION,
      `收手让对方多让一步（${before} → ${s.finalPrice}）`)
    assert(s.finalPrice > before, '收手拿到的价比让步高')
  }

  // 谈崩：疯狂加价必然有翻脸风险（用同一个 rand 序列保证确定性）
  {
    // rand=0.0：第一次调用算进 risk（得 0.05+over*0.06），第二次调用与 risk 比较 → 0 < risk 恒成立
    let brokeCount = 0
    for (let i = 0; i < 60; i++) {
      const s = createHaggleState()
      let broke = false
      for (let k = 0; k < 6; k++) {
        advanceHaggle(s, 0.016, () => 0.5)
        if (s.finished) break
        const r = haggleAction(s, 'raise', () => 0.0)
        if (r.broke) { broke = true; break }
      }
      if (broke) brokeCount++
    }
    assert(brokeCount > 0, `一味加价存在谈崩风险（60 次里谈崩 ${brokeCount} 次）`)
  }

  // 谈崩概率随加价次数递增（越纠缠越危险）
  {
    // 用固定 rand 序列统计"第 N 次加价的本次谈崩率"
    const firstBreak: number[] = []
    for (let i = 0; i < 4000; i++) {
      const s = createHaggleState()
      for (let k = 1; k <= 4; k++) {
        advanceHaggle(s, 0.016, () => 0.5)
        if (s.finished) break
        if (haggleAction(s, 'raise', Math.random).broke) { firstBreak.push(k); break }
      }
    }
    const rateAt = (k: number) => firstBreak.filter(x => x === k).length / 4000
    assert(rateAt(1) < rateAt(3),
      `越纠缠越危险（第1加 ${(rateAt(1) * 100).toFixed(1)}% < 第3加 ${(rateAt(3) * 100).toFixed(1)}%）`)
    assert(rateAt(1) < 0.25, `首次加价风险不高（${(rateAt(1) * 100).toFixed(1)}%）`)
  }

  // 谈崩概率随报价升高而上升（贪心是有代价的）
  {
    let lowBreaks = 0, highBreaks = 0
    for (let i = 0; i < 400; i++) {
      // 低价时加价
      const lo = createHaggleState()
      lo.price = 70
      for (let k = 0; k < 4; k++) {
        advanceHaggle(lo, 0.016, () => 0.5)
        if (lo.finished) break
        if (haggleAction(lo, 'raise', Math.random).broke) { lowBreaks++; break }
      }
      // 高价时加价
      const hi = createHaggleState()
      hi.price = 135
      for (let k = 0; k < 4; k++) {
        advanceHaggle(hi, 0.016, () => 0.5)
        if (hi.finished) break
        if (haggleAction(hi, 'raise', Math.random).broke) { highBreaks++; break }
      }
    }
    assert(highBreaks > lowBreaks,
      `报价越高越容易谈崩（高价 ${highBreaks} vs 低价 ${lowBreaks}）`)
  }

  // 表现分：谈崩为 0，成交价越高分越高
  {
    const sHigh = createHaggleState()
    sHigh.finalPrice = 130; sHigh.closed = true
    const sLow = createHaggleState()
    sLow.finalPrice = 80; sLow.closed = true
    const sBroken = createHaggleState()
    sBroken.broken = true

    const pHigh = hagglePerformance(sHigh, noMods)
    const pLow = hagglePerformance(sLow, noMods)
    const pBroken = hagglePerformance(sBroken, noMods)
    assert(pHigh > pLow, `成交价高表现分更高（${pHigh} vs ${pLow}）`)
    assert(pBroken === 0, '谈崩表现为 0')
    // 成交价封顶在上限附近，不应超过 1
    assert(pHigh <= 1, `表现分不超过 1（实际 ${pHigh}）`)
  }

  // 容错：谈崩但有容错时给一点"还能再来"的余地
  {
    const s = createHaggleState()
    s.broken = true
    const pNo = hagglePerformance(s, noMods)
    const pYes = hagglePerformance(s, { windowBonus: 0, forgiveness: 1, edgeBonus: 0 })
    assert(pNo === 0, '无容错时谈崩为 0')
    assert(pYes > 0, `有容错时谈崩保留一点余地（实际 ${pYes}）`)
  }
}

console.log('== 43. 地图对齐：船头朝向与航线一致 ==')
{
  // 素材是"船首朝上（正北）"，CSS rotate 顺时针 = 罗盘方位角顺时针，
  // 所以船图旋转角必须**等于** bearing，不能减 90。
  // 之前写 bearing - 90，导致向正东航行的船看起来在往北走（偏差正好 90°）。
  const shipSrc = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'ShipAnimation.tsx'), 'utf8')
  assert(!/rotation\s*=\s*sailing\s*\?\s*bearing\s*-\s*90/.test(shipSrc),
    '船图旋转不再使用 bearing - 90（船首朝上的素材会偏 90°）')
  assert(/SPRITE_HEADING_DEG\s*=\s*0/.test(shipSrc),
    '精灵图船首基准角常量为 0（正北朝上）')

  // 摇摆动画不能与旋转写在同一个 transform 上：
  // @keyframes 里的 transform 会整体覆盖内联 transform，
  // 航行中船会既不转向也不居中。必须拆成外层旋转 + 内层摇摆。
  assert(!/transform:[^"]*rotate\(\$\{rotation\}[^"]*animation:shipSway/.test(shipSrc),
    '旋转与摇摆不在同一个元素的 transform 上')

  // 方位角语义：正北 0°、正东 90°、正南 180°
  const north = calculateBearing(10, 0, 20, 0)
  const east = calculateBearing(0, 0, 0, 10)
  const south = calculateBearing(0, 0, -10, 0)
  assert(Math.abs(north) < 0.001, `正北方位角为 0°（实际 ${north}）`)
  assert(Math.abs(east - 90) < 0.001, `正东方位角为 90°（实际 ${east}）`)
  assert(Math.abs(south - 180) < 0.001, `正南方位角为 180°（实际 ${south}）`)

  // 航线箭头的角度与船头角度必须同源，否则箭头和船指向不同方向
  const routeSrc = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'RouteLine.tsx'), 'utf8')
  assert(routeSrc.includes('calculateBearing'), '航线箭头用同一个 calculateBearing')
}

console.log('== 44. 航线几何：唯一权威路径（防瞬移 / 防船线分叉） ==')
{
  const SEV = [37.3886, -5.9823] as [number, number]
  const CAR = [10.391, -75.5364] as [number, number]

  // --- 大圆距离与插值 ---
  const gcNm = greatCircleNm(SEV[0], SEV[1], CAR[0], CAR[1])
  assert(gcNm > 3900 && gcNm < 4200, `大圆距离在合理区间（${gcNm.toFixed(0)} nm）`)

  const p0 = greatCirclePoint(SEV, CAR, 0)
  const p1 = greatCirclePoint(SEV, CAR, 1)
  const pm = greatCirclePoint(SEV, CAR, 0.5)
  assert(Math.abs(p0[0] - SEV[0]) < 1e-6 && Math.abs(p0[1] - SEV[1]) < 1e-6,
    '大圆插值 f=0 精确落在起点')
  assert(Math.abs(p1[0] - CAR[0]) < 1e-6 && Math.abs(p1[1] - CAR[1]) < 1e-6,
    '大圆插值 f=1 精确落在终点')
  // 中点应在两端连线的「北侧」（大圆向极地凸）
  const straightMidLat = (SEV[0] + CAR[0]) / 2
  assert(pm[0] > straightMidLat,
    `大圆中点纬度高于直线中点（${pm[0].toFixed(2)} > ${straightMidLat.toFixed(2)}）`)

  // --- 几何构建 ---
  const geom = buildRouteGeometry(SEV, CAR)
  assert(geom.points.length >= 24, `采样点数量充足（${geom.points.length}）`)
  assert(geom.totalNm > 0, '总里程为正')

  // --- **几何必须密到船的子步长**（本轮修掉的触礁根因）---
  // 之前 DP 简化后航路点间距实测高达 221 海里，后果有两个：
  // (a) pathTouchesLand 按大圆查、positionAtNm 按 lat/lng 直线插值，
  //     粗段上两条线差好几海里——验证说没陆，船走的线却压陆；
  // (b) 船 8 海里一子步，却要一步跨过两个航路点之间的整块陆地。
  // 实测塞维利亚出港 9 海里就"触礁搁浅"，整条航程被清空。
  let maxGap = 0
  for (let i = 1; i < geom.points.length; i++) {
    const gap = geom.points[i].cumNm - geom.points[i - 1].cumNm
    if (gap > maxGap) maxGap = gap
  }
  assert(maxGap <= 8.5, `相邻几何点间距 ≤ 8 海里（实测最大 ${maxGap.toFixed(1)} nm）`)

  // --- positionAtNm 必须走大圆插值（与 pathTouchesLand 同口径）---
  {
    const a = geom.points[0]
    const b = geom.points[1]
    const mid = positionAtNm(geom, b.cumNm / 2)
    const gcMid = greatCirclePoint([a.lat, a.lng], [b.lat, b.lng], 0.5)
    const devNm = greatCircleNm(mid.lat, mid.lng, gcMid[0], gcMid[1])
    assert(devNm < 0.05,
      `positionAtNm 用大圆插值而非 lat/lng 直线（偏离 ${devNm.toFixed(4)} nm）`)
  }
  // --- **A* 起点必须紧邻出港位置**（本轮修掉的 [gy0, gy0] 笔误）---
  // nearestSeaCell 曾把返回顺序写成 [gy0, gy0]（行列写成同一个），
  // 港口本格是海时起点被设成对角格——塞维利亚的起点被扔到西经 52°
  // 的大洋当中，A* 顺着走廊从那儿搜到目的地，几何再把港口与那个点直连，
  // 于是船出港 16 海里就"触礁搁浅"，整条航程被清空。
  {
    const sea = findSeaPath(SEV, CAR)
    if (sea.found && sea.points.length >= 2) {
      const d0 = greatCircleNm(SEV[0], SEV[1], sea.points[0][0], sea.points[0][1])
      const d1 = greatCircleNm(SEV[0], SEV[1], sea.points[1][0], sea.points[1][1])
      assert(d0 < 1, `A* 路径首点就是起点本身（${d0.toFixed(2)} nm）`)
      // 第二点必须是起点的一个网格步（≤ ~20 nm），绝不能跳到几百海里外
      assert(d1 < 20,
        `A* 路径第二点紧邻起点（${d1.toFixed(1)} nm；若上百海里说明起点格被设成了对角格）`)
    }
  }

  // --- 累计里程必须单调不减——否则进度条会往回跳 ---
  for (let i = 1; i < geom.points.length; i++) {
    if (geom.points[i].cumNm < geom.points[i - 1].cumNm - 1e-9) {
      assert(false, `累计里程在第 ${i} 点回退`)
      break
    }
  }
  assert(true, '累计里程单调不减')
  // 末点累计里程 = 总里程
  assert(Math.abs(geom.points[geom.points.length - 1].cumNm - geom.totalNm) < 1e-6,
    '末点累计里程等于总里程')

  // --- positionAtNm：位置与里程互逆 ---
  for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
    const target = geom.totalNm * frac
    const pos = positionAtNm(geom, target)
    const back = traveledNmAt(geom, pos.lat, pos.lng)
    const err = Math.abs(back - target)
    assert(err < 40, `里程 ${frac * 100}% 处正反算误差 ${err.toFixed(1)} nm（< 40）`)
  }

  // --- **防瞬移**（本轮修掉的致命缺陷）---
  // 旧代码在触礁分支里写 `safeLat = lat + dLat * 0.5`，
  // 而 dLat 是「当前位置→目标」的整条航线差值，
  // 于是船一碰岸就被传送到航线中点——实测进度瞬间冲到 47%，天数还停在第 1 天。
  // 现在路径推进是「沿里程前进」，绝不可能出现这种跳跃。
  let prev = positionAtNm(geom, 0)
  let maxJumpNm = 0
  for (let d = 2; d <= geom.totalNm; d += 2) {
    const cur = positionAtNm(geom, d)
    const jump = greatCircleNm(prev.lat, prev.lng, cur.lat, cur.lng)
    if (jump > maxJumpNm) maxJumpNm = jump
    prev = cur
  }
  // 每 2 海里推进一次，船实际移动必须也在 2 海里量级（+容差）
  assert(maxJumpNm < 6,
    `沿路径推进没有瞬移（2 海里步长内最大位移 ${maxJumpNm.toFixed(2)} nm）`)

  // --- 触礁不得把船送到航线中点 ---
  // 显式复现旧 bug 的形态：从任意位置出发，触发「撞陆」后
  // 船的位置必须仍在航线附近，而不是整条航线的中点。
  const midPoint = geom.points[Math.floor(geom.points.length / 2)]
  const startPoint = geom.points[0]
  const midTraveled = midPoint.cumNm
  const recovered = traveledNmAt(geom, startPoint.lat, startPoint.lng)
  assert(recovered < midTraveled * 0.2,
    `起点反推里程接近 0（${recovered.toFixed(1)} vs 中点 ${midTraveled.toFixed(1)}）`)

  // --- 地图与船必须用同一套几何 ---
  const ctrlSrc = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'SailingController.tsx'), 'utf8')
  const lineSrc = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'RouteLine.tsx'), 'utf8')
  assert(ctrlSrc.includes('getRouteGeometry'), '航行控制器使用记忆化的 getRouteGeometry')
  assert(lineSrc.includes('getRouteGeometry'), '航线绘制使用同一个 getRouteGeometry')
  assert(!ctrlSrc.includes('buildRouteGeometry('), '航行控制器不再各自构建几何（否则地图与船会分叉）')
  assert(!lineSrc.includes('createArcPoints'), '航线绘制不再使用旧的贝塞尔弧（与船走的路不一致）')

  // --- 船位必须来自 routeOrigin 而非当前船位 ---
  assert(ctrlSrc.includes('routeOrigin'), '船的路径起点取自 routeOrigin（航线起点，非当前船位）')
  assert(lineSrc.includes('routeOrigin'), '地图航线起点取自 routeOrigin')

  // --- 触礁分支不得出现整条航线的一半这种量级的偏移 ---
  // 旧代码：safeLat = lat + dLat * 0.5（dLat 是整条航线的差值）
  const oldTeleport = /safeLat\s*=\s*lat\s*\+\s*dLat\s*\*\s*0\.5/
  assert(!oldTeleport.test(ctrlSrc), '触礁分支不再用「整条航线的一半」做偏移（那是瞬移的根源）')
}

console.log('== 45. 常驻资源条：界面天数必须等于实际扣的天数 ==')
{
  // 夹具：30 名船员 → 基础消耗 粮 ceil(30×0.1)=3、水 ceil(30×0.15)=5
  const ship = { id: 1, name: 's', type: 'caravel' as const, speed: 6, durability: 100, maxDurability: 100, capacity: 50, usedCapacity: 0, crew: 30, maxCrew: 40 }
  const sailingFleet: Fleet = { id: 1, name: 't', gold: 0, fame: 0, morale: 70, food: 100, water: 100, currentPortId: null, isSailing: true, day: 1, ships: [ship], cargo: [], flagshipId: 1, trait: null, durabilityCarry: 0 }
  const portFleet: Fleet = { ...sailingFleet, isSailing: false, currentPortId: 6 }
  const weatherClear: WeatherState = { kind: 'clear', intensity: 0.5, windBearing: 0, changedAtDay: 0 }

  // --- 1) 航行中：与 store.advanceDay 的结算公式逐点对齐 ---
  // store 用的是 dailyFoodUse(base, supplyMul, cookRelief) / dailyWaterUse(base, supplyMul)
  const rSteady = dailyRates(sailingFleet, 'steady', false)
  assert(rSteady.foodPerDay === 3 && rSteady.waterPerDay === 5,
    `按部就班：粮 3/天、水 5/天（实际 ${rSteady.foodPerDay}/${rSteady.waterPerDay}）`)
  const rRush = dailyRates(sailingFleet, 'rush', false)
  assert(rRush.foodPerDay === 5 && rRush.waterPerDay === 8,
    `抢行 ×1.5：粮 5/天、水 8/天（实际 ${rRush.foodPerDay}/${rRush.waterPerDay}）`)
  const rCareful = dailyRates(sailingFleet, 'careful', false)
  assert(rCareful.foodPerDay === 3 && rCareful.waterPerDay === 5,
    '谨慎补给率 ×1.0——航速慢导致总消耗反而更高，这正是「稳」的代价')
  const rCook = dailyRates(sailingFleet, 'rush', true)
  assert(rCook.foodPerDay === 4,
    `胖厨子班 ×0.8：抢行粮 ceil(3×1.5×0.8)=4（实际 ${rCook.foodPerDay}）`)
  assert(rCook.waterPerDay === 8, '厨子班只影响食物，不影响淡水')

  // --- 2) 港内：海上消耗的 1/4 ---
  const rPort = dailyRates(portFleet, 'steady', false)
  assert(rPort.inPort === true && rPort.foodPerDay === 1 && rPort.waterPerDay === 2,
    `港内消耗为海上 1/4：粮 ceil(3/4)=1、水 ceil(5/4)=2（实际 ${rPort.foodPerDay}/${rPort.waterPerDay}）`)

  // --- 3) 决定性的一条：界面显示的「还能撑 N 天」必须与逐日扣减一致 ---
  // 做法：用 dailyRates 给出的每日消耗，按 store 的公式逐日扣 10 天，
  // 再验证「100 份按每天 5 份扣 10 天 = 50 份」与「100/5 = 20 天」口径相同。
  {
    let food = sailingFleet.food
    const perDay = rRush.foodPerDay
    for (let d = 0; d < 10; d++) {
      food = Math.max(0, food - dailyFoodUse(3, STANCES.rush.supplyMul, 1))
    }
    assert(food === 100 - perDay * 10,
      `逐日扣减 10 天 = 100 - 5×10 = 50（实际 ${food}，每日 ${perDay}）`)
    const days = supplyDaysRemaining(sailingFleet.food, perDay)
    assert(Math.abs(days - 20) < 1e-9,
      `同口径折算天数 100/5 = 20（实际 ${days}）——界面说的和实际扣的从此是同一个数`)
  }

  // --- 4) daysToDestination 与手算一致 ---
  {
    // 2400 海里、进度 25% → 剩 1800；按部就班、晴、无风偏
    // nmPerDay = effectiveFleetSpeed × max(0.5,1) × 1 × sailMul × 24
    const speed = effectiveFleetSpeed(sailingFleet, [])
    const expectedNmPerDay = speed * 1 * STANCES.steady.speedMul * WEATHER_INFO.clear.sailMul * weatherFavorFactor('clear') * 24
    const got = daysToDestination({
      routeDistanceNm: 2400, progress: 0.25, fleet: sailingFleet, officers: [],
      windFavor: 1, stance: 'steady', weather: weatherClear,
    })
    assert(got === Math.max(0, Math.ceil(1800 / expectedNmPerDay)),
      `剩余天数与手算一致：ceil(1800/${expectedNmPerDay.toFixed(2)}) = ${Math.ceil(1800 / expectedNmPerDay)}（实际 ${got}）`)
    // 进度走完 → 0 天，不能出现负数或 Infinity
    assert(daysToDestination({
      routeDistanceNm: 2400, progress: 1, fleet: sailingFleet, officers: [],
      windFavor: 1, stance: 'steady', weather: weatherClear,
    }) === 0, '进度 100% 时剩余天数为 0')
  }

  // --- 5) 水位判定：三档必须分清 ---
  assert(supplyLevel(100, 5, 0) === 'ok', '余量 20 天且不在航行 → ok')
  assert(supplyLevel(12, 5, 0) === 'warn', '余量 2.4 天 → warn（还够，但开始紧张）')
  assert(supplyLevel(0, 5, 0) === 'critical', '已断粮 → critical')
  assert(supplyLevel(100, 5, 10) === 'ok', '余量 20 天 > 到港 10 天 → ok')
  assert(supplyLevel(30, 5, 10) === 'critical',
    '余量 6 天 < 到港 10 天 → critical（不改方针或不补给就一定会在海上断粮）')
  assert(supplyLevel(100, 0, 10) === 'ok', '无船员不消耗 → 永远 ok')
  assert(moraleLevel(70) === 'ok' && moraleLevel(50) === 'warn' && moraleLevel(44) === 'critical',
    '士气：70 ok / 50 warn / 44 critical（44 与 store 的 lowMorale<45 判定线一致）')

  // --- 6) 天数的人类可读形式 ---
  assert(formatSupplyDays(Infinity) === '∞', '不消耗显示 ∞ 而不是 0（否则玩家以为要断粮）')
  assert(formatSupplyDays(87) === '30+', '超长余量截断为 30+，避免噪音')
  assert(formatSupplyDays(12.4) === '12', '10 天以上取整')
  assert(formatSupplyDays(6.24) === '6.2', '10 天以内保留一位小数')
  assert(formatSupplyDays(6.0) === '6', '整数不带小数点')

  // --- 7) 条的配色阈值必须匹配游戏规则，而不是一套通用百分比 ---
  // 回归点：过去 ResourceBar 用 60%/30% 一套阈值走所有资源，
  // 于是士气 38（已低于游戏的 45 低士气线，忠诚度每天掉 3）显示成金色——
  // 颜色说"没事"，系统却在按"士气崩溃"处理。
  assert(getStatusColor(80, 100) === 'bg-safe-400', '默认阈值：80/100 为安全色')
  assert(getStatusColor(50, 100) === 'bg-gold-400', '默认阈值：50/100 为紧张色')
  assert(getStatusColor(20, 100) === 'bg-danger-400', '默认阈值：20/100 为危险色')
  assert(getStatusColor(38, 100, 60, 45) === 'bg-danger-400',
    '士气 38 用绝对阈值 45/60 → 危险色（与 store 的 lowMorale<45 判定线一致）')
  assert(getStatusColor(50, 100, 60, 45) === 'bg-gold-400', '士气 50 用绝对阈值 → 紧张色')
  assert(getStatusColor(70, 100, 60, 45) === 'bg-safe-400', '士气 70 用绝对阈值 → 安全色')
  // 耐久度仍走百分比：100 点耐久打到 25 点才算危险，40 点只是紧张
  assert(getStatusColor(25, 100) === 'bg-danger-400', '耐久 25/100 走百分比 → 危险色')
  assert(getStatusColor(40, 100) === 'bg-gold-400', '耐久 40/100 走百分比 → 紧张色（未被绝对阈值误判）')
}

/* ============ 第 46 组：事件选项结构化摘要——预览必须等于实际 ============ */

{
  // 夹具：资源充足、船有伤（耐久 60/100，+5 修理不会被截断），无特质无军官
  const ship = { id: 1, name: 's', type: 'caravel' as const, speed: 6, durability: 60, maxDurability: 100, capacity: 50, usedCapacity: 0, crew: 30, maxCrew: 40 }
  const baseFleet: Fleet = { id: 1, name: 't', gold: 500, fame: 20, morale: 70, food: 100, water: 100, currentPortId: null, isSailing: true, day: 1, ships: [ship], cargo: [], flagshipId: 1, trait: null, durabilityCarry: 0 }
  const neutral = { stanceMagnitudeMul: 1, trait: null, hasQuartermaster: false }
  const ev101 = events.find(e => e.id === 101)!
  const ev7 = events.find(e => e.id === 7)!
  const ev1 = events.find(e => e.id === 1)!
  const ev207 = events.find(e => e.id === 207)!

  // --- 1) 期望值 = 手算加权平均 ---
  // 101-0「满帆借风」：士气 0.7×15 + 0.3×10 = 13.5 → 芯片 14；
  // 食物 0.7×(-2)+0.3×(-1) = -1.7、耐久 -0.9 —— 低于 CHIP_MIN_EV，不进芯片（噪声不上屏）
  const s1010 = summarizeChoice(ev101.choices[0], neutral, baseFleet, GAME_BALANCE.MORALE_MAX)
  assert(s1010.chips.length === 1 && s1010.chips[0].key === 'morale' && s1010.chips[0].ev === 14,
    `101-0 期望芯片：仅士气 +14（实际 ${JSON.stringify(s1010.chips)}）`)
  assert(s1010.risk === 'steady', '101-0 只赚不赔 → 稳')

  // 101-1「修补船帆」：士气 0.8×8+0.2×5 = 7.4 → 7；耐久 0.8×5+0.2×3 = 4.6 → 5
  const s1011 = summarizeChoice(ev101.choices[1], neutral, baseFleet, GAME_BALANCE.MORALE_MAX)
  assert(s1011.chips.length === 2, `101-1 两个芯片（实际 ${s1011.chips.length}）`)
  assert(s1011.chips[0].key === 'morale' && s1011.chips[0].ev === 7, '101-1 按 |期望| 降序：士气 +7 在前')
  assert(s1011.chips[1].key === 'durability' && s1011.chips[1].ev === 5, '101-1 耐久 +5 在后（船有伤所以修理不被截断）')

  // --- 2) 姿态放大必须体现在芯片上（预览跟着实际走）---
  const rush = { ...neutral, stanceMagnitudeMul: 1.45 }
  const sRush = summarizeChoice(ev101.choices[0], rush, baseFleet, GAME_BALANCE.MORALE_MAX)
  // 15→round(21.75)=22、10→round(14.5)=15 → 0.7×22+0.3×15 = 19.9 → 20
  assert(sRush.chips[0].ev === 20, `抢行 ×1.45：士气芯片 13.5 → 20（实际 ${sRush.chips[0].ev}）`)
  const careful = { ...neutral, stanceMagnitudeMul: 0.5 }
  const sCareful = summarizeChoice(ev101.choices[0], careful, baseFleet, GAME_BALANCE.MORALE_MAX)
  // 15→round(7.5)=8、10→5 → 0.7×8+0.3×5 = 7.1 → 7
  assert(sCareful.chips[0].ev === 7, `谨慎 ×0.5：士气芯片 13.5 → 7（实际 ${sCareful.chips[0].ev}）`)

  // --- 3) 大副弹压：士气打击减半 ---
  const noQm = summarizeChoice(ev7.choices[0], neutral, baseFleet, GAME_BALANCE.MORALE_MAX)
  // -10/-15/-25 → -(0.45×10+0.35×15+0.2×25) = -14.75 → -15
  assert(noQm.chips.find(c => c.key === 'morale')?.ev === -15,
    `无大副：赤道无风士气 -15（实际 ${noQm.chips.find(c => c.key === 'morale')?.ev}）`)
  const qm = { ...neutral, hasQuartermaster: true }
  const withQm = summarizeChoice(ev7.choices[0], qm, baseFleet, GAME_BALANCE.MORALE_MAX)
  // ceil(-10/2)=-5、ceil(-15/2)=-7、ceil(-25/2)=-13 → -(0.45×5+0.35×7+0.2×13) = -7.3 → -7
  assert(withQm.chips.find(c => c.key === 'morale')?.ev === -7,
    `有大副：士气打击减半 → -7（实际 ${withQm.chips.find(c => c.key === 'morale')?.ev}）`)

  // --- 4) 库存截断：士气 92 时 +15 只生效 +8，芯片必须显示截断后的数 ---
  const highMorale: Fleet = { ...baseFleet, morale: 92 }
  const sClamp = summarizeChoice(ev101.choices[0], neutral, highMorale, GAME_BALANCE.MORALE_MAX)
  assert(sClamp.chips[0].ev === 8,
    `士气 92：+15/+10 双双截断为 +8 → 芯片 8（实际 ${sClamp.chips[0].ev}）——预览不虚报`)

  // --- 5) 风险等级：三档必须在真实事件上分清 ---
  assert(riskGrade(adjustedOutcomes(ev101.choices[0], neutral, baseFleet, GAME_BALANCE.MORALE_MAX)) === 'steady',
    '顺风而行：稳')
  const sTreasure = summarizeChoice(ev207.choices[0], neutral, baseFleet, GAME_BALANCE.MORALE_MAX)
  assert(sTreasure.risk === 'gamble',
    `完整的藏宝图：55% 暴富 / 15% 触礁掉人 → 搏（实际 ${sTreasure.risk}）`)
  const sDoldrums = summarizeChoice(ev7.choices[0], neutral, baseFleet, GAME_BALANCE.MORALE_MAX)
  assert(sDoldrums.risk === 'risky',
    `赤道无风「耐心等待」：55% 概率掉人 → 险（实际 ${sDoldrums.risk}）`)
  assert(summarizeChoice(ev1.choices[2], neutral, baseFleet, GAME_BALANCE.MORALE_MAX).risk === 'risky',
    '加勒比飓风「满帆冲出」：期望伤害爆表 → 险')

  // --- 6) 小游戏选项：玩之前不给数字（概率会被操作改写，给了就是假精度）---
  const sHelm = summarizeChoice(ev1.choices[0], neutral, baseFleet, GAME_BALANCE.MORALE_MAX)
  assert(sHelm.plain === true && sHelm.chips.length === 0,
    '降帆收桅（小游戏）：无芯片，只说明「操作定成败」')

  // --- 7) 全库不变量（56 个事件 × 全部选项，一条不过就报）---
  let libChoices = 0, libSteady = 0, libGamble = 0, libRisky = 0, libPlain = 0, libMini = 0, libMaxChips = 0
  for (const ev of events) {
    for (const ch of ev.choices) {
      libChoices++
      const s = summarizeChoice(ch, neutral, baseFleet, GAME_BALANCE.MORALE_MAX)
      const outs = adjustedOutcomes(ch, neutral, baseFleet, GAME_BALANCE.MORALE_MAX)
      // 7.1 芯片按 |ev| 降序，且全部过阈值
      for (let i = 1; i < s.chips.length; i++) {
        assert(Math.abs(s.chips[i - 1].ev) >= Math.abs(s.chips[i].ev),
          `#${ev.id}-${ev.choices.indexOf(ch)} 芯片未按 |期望| 降序`)
      }
      for (const c of s.chips) assert(Math.abs(c.ev) >= CHIP_MIN_EV, `#${ev.id} 芯片 ${c.key} 未过显示阈值`)
      libMaxChips = Math.max(libMaxChips, s.chips.length)
      // 7.2 plain ⟺ 无芯片（小游戏除外，它恒 plain）
      if (ch.miniGame) { libMini++; assert(s.plain, `#${ev.id} 小游戏选项必须 plain`) }
      else assert(s.plain === (s.chips.length === 0), `#${ev.id} plain 与芯片数不一致`)
      if (s.plain) libPlain++
      if (s.risk === 'steady') libSteady++
      else if (s.risk === 'gamble') libGamble++
      else libRisky++
      // 7.3 人命不被「稳」掩盖：任何掉人概率 > 0 的选项都不能是稳
      if (crewLossChance(outs) > 0) {
        assert(s.risk !== 'steady', `#${ev.id}-${ev.choices.indexOf(ch)} 有掉人概率却评为稳——颜色/标签会撒谎`)
      }
      // 7.4 **预览 = 实际**：摘要流水线与 EventCard.resolveOutcome 逐字相同
      ch.outcomes.forEach((raw, i) => {
        const expect = clampOutcomeToFleet(adjustOutcome(raw, neutral), baseFleet, GAME_BALANCE.MORALE_MAX)
        assert(JSON.stringify(outs[i].outcome) === JSON.stringify(expect),
          `#${ev.id}-${ev.choices.indexOf(ch)} 第 ${i} 个结局的摘要值与结算流水线不一致`)
      })
    }
  }
  console.log(`  摘要覆盖 ${libChoices} 个选项：稳 ${libSteady} / 搏 ${libGamble} / 险 ${libRisky}，` +
    `plain ${libPlain}（含小游戏 ${libMini}），单选项最多 ${libMaxChips} 个芯片`)

  // --- 7.5 小游戏选项不得显示风险档 ---
  // 它的结局概率会被操作表现改写，硬挂一个「搏」再配一句"期望就差、尾部太重"的
  // 断言，等于凭空编造一个没算过的结论——屏显必须是真话。
  {
    const choiceSrc = readFileSync(join(process.cwd(), 'src/components/events/EventChoice.tsx'), 'utf8')
    assert(/risk && !choice\.miniGame/.test(choiceSrc),
      'EventChoice 对小游戏选项不渲染风险档（不编造未计算过的稳/搏/险）')
  }

  // --- 8) 期望值口径：Σ p×delta，与逐结局加权一致 ---
  {
    const outs = adjustedOutcomes(ev101.choices[0], neutral, baseFleet, GAME_BALANCE.MORALE_MAX)
    const ev2 = expectedDeltas(outs)
    assert(Math.abs(ev2.morale - 13.5) < 1e-9, `101-0 士气期望 13.5（实际 ${ev2.morale}）`)
    assert(Math.abs(ev2.gold) < 1e-9, '无金币变化时期望为 0')
  }
}

console.log('== 37. 事件小游戏：舷炮对轰 ==')
{
  const mods = computeModifiers({ hullRatio: 0.5, crewRatio: 0.5, officers: [] })
  const goodMods = computeModifiers({ hullRatio: 1, crewRatio: 1, officers: ['pilot'] })
  // 基准半宽 × (1 + 0.08)：写进断言，让 UI 上的带宽和这里的数字对得上
  const hitHalf = CANNON_HIT_HALF * (1 + mods.windowBonus)
  const grazeHalf = CANNON_GRAZE_HALF * (1 + mods.windowBonus)

  // --- 1) 初始状态 ---
  const c0 = createCannonState()
  assert(c0.volley === 0 && c0.phase === 'aim' && !c0.finished, '初始：第 1 轮瞄准阶段')
  assert(c0.incoming === 1, '来袭标初始在远端（敌舰一侧）')

  // --- 2) 瞄准标匀速往复：单程内必过一次敌舰正中 ---
  const c1 = createCannonState()
  c1.phaseTime = CANNON_AIM_TIME * 0.5
  advanceCannon(c1, 0.01)
  assert(Math.abs(c1.aim - 0.5) < 0.02, `单程中点瞄准标 ≈ 0.5（实际 ${c1.aim.toFixed(3)}）`)
  const c1b = createCannonState()
  c1b.phaseTime = CANNON_AIM_TIME * 1.5
  advanceCannon(c1b, 0.01)
  assert(Math.abs(c1b.aim - 0.5) < 0.02, `折返中点瞄准标 ≈ 0.5（实际 ${c1b.aim.toFixed(3)}）`)

  // --- 3) 两程不开火 = 放弃这一轮（落水），不判 hit 也不卡死 ---
  const c2 = createCannonState()
  let g2 = 0
  while (c2.phase === 'aim' && g2++ < 1000) advanceCannon(c2, 0.02)
  assert(c2.shot === 'miss' && c2.misses === 1, '超时未开火记落水')
  assert(c2.phase === 'incoming', '落水后同样进入扛伤阶段（来而不往非礼也）')

  // --- 4) 三档命中判定：|aim-0.5| 与半宽比较 ---
  const mk = (aim: number) => {
    const s = createCannonState()
    s.aim = aim
    return s
  }
  assert(fireCannon(mk(0.5), mods).result === 'hit', '正中 = 命中')
  assert(fireCannon(mk(0.5 + hitHalf * 0.9), mods).result === 'hit', '命中带内沿 = 命中')
  assert(fireCannon(mk(0.5 + hitHalf * 1.1), mods).result === 'graze', '命中带外、擦弹带内 = 擦弹')
  assert(fireCannon(mk(0.5 + grazeHalf * 0.9), mods).result === 'graze', '擦弹带内沿 = 擦弹')
  assert(fireCannon(mk(0.5 + grazeHalf * 1.1), mods).result === 'miss', '擦弹带外 = 落水')

  // --- 5) 加成真实加宽判定窗口（同一瞄准点，好船命中、破船落水）---
  const edge = (CANNON_HIT_HALF * (1 + mods.windowBonus) + CANNON_HIT_HALF * (1 + goodMods.windowBonus)) / 2
  assert(fireCannon(mk(0.5 + edge), mods).result !== 'hit' && fireCannon(mk(0.5 + edge), goodMods).result === 'hit',
    `船体/人手/领航员加宽命中带（同一偏差 ${edge.toFixed(3)}：基准非命中、满配命中）`)

  // --- 6) 每轮只能开一次火；非瞄准阶段开火无效 ---
  const c6 = createCannonState()
  c6.aim = 0.5
  fireCannon(c6, mods)
  assert(fireCannon(c6, mods).result === null, '同一轮不能开第二次火')
  c6.phase = 'incoming'
  assert(fireCannon(c6, mods).result === null, '来袭阶段开火无效')

  // --- 7) 架盾时机：来袭标过半后架 = 及时（0.15 伤）；早架 = 0.65；不架 = 直吃 ---
  const braceThenLand = (incomingAtBrace: number, brace: boolean) => {
    const s = createCannonState()
    s.aim = 0.5
    fireCannon(s, mods)
    s.phaseTime = 0
    if (brace) {
      s.incoming = incomingAtBrace
      braceCannon(s)
    }
    let g = 0
    while (s.phase !== 'resolve' && g++ < 500) advanceCannon(s, 0.02)
    return s.damages[0]
  }
  assert(Math.abs(braceThenLand(0.4, true) - 0.15) < 1e-9, '来袭标过半后架盾：几乎无伤')
  assert(Math.abs(braceThenLand(0.8, true) - 0.65) < 1e-9, '来袭标未过半就架：只挡掉一部分')
  assert(braceThenLand(0, false) === 1, '不架盾：直吃')
  const c7 = createCannonState()
  c7.aim = 0.5
  fireCannon(c7, mods)
  c7.incoming = 0.4
  const r7 = braceCannon(c7)
  assert(r7.timing === 'timely' && c7.timelyBraces === 1, '及时架盾计数')
  assert(braceCannon(c7).timing === null, '每轮只能架一次盾')

  // --- 8) 满分手感：轮轮正中 + 轮轮及时架盾 ---
  const c8 = createCannonState()
  let g8 = 0
  while (!c8.finished && g8++ < 4000) {
    if (c8.phase === 'aim' && c8.shot === null) {
      c8.aim = 0.5
      fireCannon(c8, mods)
    } else if (c8.phase === 'incoming' && !c8.braced && c8.incoming <= CANNON_BRACE_MARK) {
      braceCannon(c8)
    } else {
      advanceCannon(c8, 0.02)
    }
  }
  assert(c8.finished, `三轮打完自动结束（轮次 ${c8.volley}/${CANNON_VOLLEYS}）`)
  assert(c8.hits === CANNON_VOLLEYS, `轮轮命中（实际 ${c8.hits}）`)
  assert(c8.timelyBraces === CANNON_VOLLEYS, `轮轮及时架盾（实际 ${c8.timelyBraces}）`)
  const perfGreat = cannonPerformance(c8, mods)
  assert(perfGreat >= 0.82, `满手表现分达到「滴水不漏」（实际 ${perfGreat}）`)

  // --- 9) 全落水 + 全程不架盾：表现分 0 ---
  const c9 = createCannonState()
  let g9 = 0
  while (!c9.finished && g9++ < 4000) advanceCannon(c9, 0.05)
  assert(c9.misses === CANNON_VOLLEYS && c9.damages.every(d => d === 1),
    `全落水且直吃三轮（实际 miss ${c9.misses}，受创 ${c9.damages.join('/')}）`)
  const perfAwful = cannonPerformance(c9, mods)
  assert(perfAwful === 0, `全崩表现分 0（实际 ${perfAwful}）`)

  // --- 10) 表现分改变真实结局分布：好手更可能拿下赏金结局 ---
  const ev236 = events.find(e => e.id === 236)!
  const outs = ev236.choices[0].outcomes
  const goodIdx = outs.reduce((best, o, i) => outcomeMerit(o) > outcomeMerit(outs[best]) ? i : best, 0)
  let good = 0, bad = 0
  for (let i = 0; i < 3000; i++) {
    if (selectOutcome(outs, 1).description === outs[goodIdx].description) good++
    if (selectOutcome(outs, 0).description === outs[goodIdx].description) bad++
  }
  assert(good > bad, `炮战表现分撬动结局（好手 ${good} vs 差手 ${bad}）`)

  // --- 11) 源码级护栏：组件必须真的用上这三张炮战特效图 ---
  // 注意用 process.cwd() 而不是 __dirname：ESM bundle 里没有 __dirname
  const cannonSrc = readFileSync(join(process.cwd(), 'src', 'components', 'minigames', 'CannonGame.tsx'), 'utf8')
  for (const asset of ['cannonFlash', 'hullBurst', 'waterSpout']) {
    assert(cannonSrc.includes(`FX_ASSETS.${asset}`),
      `CannonGame 引用了 ${asset}（入库的特效图不能只躺在清单里）`)
  }
  assert(cannonSrc.includes('SPECIAL_SPRITES.frigateWar'), 'CannonGame 用敌军战舰精灵')
  const overlaySrc = readFileSync(join(process.cwd(), 'src', 'components', 'events', 'MiniGameOverlay.tsx'), 'utf8')
  assert(overlaySrc.includes("gameId === 'cannon'") && overlaySrc.includes('<CannonGame'),
    'MiniGameOverlay 真的分发 CannonGame')
}

console.log('== 47. 小游戏文案与实现常量一致 ==')
{
  // 玩家照着说明打，节奏才对得上：文案里写死的数字必须等于代码里的常量。
  // 文案表放在 utils/miniGame.ts（纯逻辑层）就是为了让这条护栏能直接跑。
  const bullets = (id: MiniGameId) => MINI_GAME_COPY[id].bullets.join(' ')
  const ids: MiniGameId[] = ['storm', 'boarding', 'escape', 'lookout', 'gamble', 'haggle', 'cannon']
  for (const id of ids) {
    const c = MINI_GAME_COPY[id]
    assert(!!c && !!c.title && !!c.brief && c.bullets.length >= 3 && c.start.includes('（Enter）'),
      `小游戏 ${id} 文案完整（标题/开场白/≥3 条要点/开始键承诺 Enter）`)
  }
  assert(/5 轮/.test(bullets('storm')) && STORM_ROUNDS === 5, '收帆文案「5 轮」== STORM_ROUNDS')
  assert(/4\.5 秒/.test(bullets('storm')) && STORM_ROUND_LIMIT === 4.5, '收帆文案「4.5 秒」== STORM_ROUND_LIMIT')
  assert(/8 波/.test(bullets('boarding')) && BOARDING_WAVES === 8, '拦跳板文案「8 波」== BOARDING_WAVES')
  assert(/8 次/.test(bullets('escape')) && ESCAPE_WAVES === 8, '逃脱文案「8 次」== ESCAPE_WAVES')
  assert(/6 手/.test(bullets('gamble')) && GAMBLE_ROUNDS === 6, '对赌文案「6 手」== GAMBLE_ROUNDS')
  assert(/每手押注 20 金/.test(bullets('gamble')) && GAMBLE_STAKE === 20, '对赌文案「押注 20 金」== GAMBLE_STAKE')
  assert(/8 轮谈判/.test(bullets('haggle')) && HAGGLE_ROUNDS === 8, '议价文案「8 轮谈判」== HAGGLE_ROUNDS')
  assert(/三轮齐射/.test(bullets('cannon')) && CANNON_VOLLEYS === 3, '舷炮文案「三轮齐射」== CANNON_VOLLEYS')
  // 庄家报的区间必须「含而不露」：跨至少 2 个点、且不越骰子边界
  {
    const mods = computeModifiers({ hullRatio: 0.5, crewRatio: 0.5, officers: [] })
    let ok = true
    for (let d = 1; d <= GAMBLE_DICE; d++) {
      const g = createGambleState()
      dealGamble(g, mods, () => (d - 1) / GAMBLE_DICE)
      if (!(g.high - g.low >= 1 && g.low >= 1 && g.high <= GAMBLE_DICE)) ok = false
    }
    assert(ok, `庄家区间恒跨 ≥2 个点且不越界（点数 1..${GAMBLE_DICE} 全覆盖）`)
    assert(GAMBLE_SPREAD >= 1 && GAMBLE_SPREAD < GAMBLE_DICE, `区间半宽 ${GAMBLE_SPREAD} 合理`)
  }
  // 瞭望序列必须真的能变长，否则「一轮比一轮长」是空话
  assert(LOOKOUT_MAX_LEN > LOOKOUT_START_LEN, `瞭望序列可增长（${LOOKOUT_START_LEN} → ${LOOKOUT_MAX_LEN}）`)
}

console.log('== 48. 风险档判据与份量权重 ==')
{
  const mk = (probability: number, ch: Partial<EventOutcome>): AdjustedOutcome => ({
    probability,
    outcome: {
      probability, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0,
      durabilityChange: 0, crewChange: 0, description: 't', ...ch,
    } as EventOutcome,
  })
  // 份量权重：掉一个人（3 分）比掉一点耐久（0.5 分）重得多——决定徽章颜色
  assert(Math.abs(outcomeHarm(mk(1, { crewChange: -1 }).outcome) - 3) < 1e-9, '掉 1 人的伤害分 = 3')
  assert(Math.abs(outcomeHarm(mk(1, { durabilityChange: -1 }).outcome) - 0.5) < 1e-9, '掉 1 点耐久的伤害分 = 0.5')
  assert(Math.abs(outcomeHarm(mk(1, { moraleChange: -1 }).outcome) - 0.3) < 1e-9, '掉 1 点士气的伤害分 = 0.3')
  assert(outcomeHarm(mk(1, { goldChange: -10 }).outcome) < 1, '金币损失几乎不计伤害（份量最轻）')
  assert(outcomeHarm(mk(1, { goldChange: 10 }).outcome) === 0, '只赚不赔时伤害分为 0')

  // 三档判据
  assert(riskGrade([mk(1, { goldChange: 10 })]) === 'steady', '只赚不赔 → 稳')
  assert(riskGrade([mk(0.5, { goldChange: 10 }), mk(0.5, { durabilityChange: -20 })]) === 'gamble',
    '期望伤害 5 分（尾部 10 分未越线）→ 搏')
  assert(riskGrade([mk(0.7, { goldChange: 10 }), mk(0.3, { crewChange: -1 })]) === 'risky',
    '掉人概率 30% → 险（人命不能被均值掩盖）')
  assert(riskGrade([mk(0.5, { goldChange: 10 }), mk(0.5, { durabilityChange: -60 })]) === 'risky',
    '尾部伤害过重 → 险')

  // 摘要对象的类型与字段约定
  const shipF = { id: 1, name: 's', type: 'caravel' as const, speed: 6, durability: 60, maxDurability: 100, capacity: 50, usedCapacity: 0, crew: 30, maxCrew: 40 }
  const fleetF: Fleet = { id: 1, name: 't', gold: 500, fame: 20, morale: 70, food: 100, water: 100, currentPortId: null, isSailing: true, day: 1, ships: [shipF], cargo: [], flagshipId: 1, trait: null, durabilityCarry: 0 }
  const s: ChoiceSummary = summarizeChoice(
    { text: 'x', outcomes: [mk(1, { goldChange: 10 }).outcome] },
    { stanceMagnitudeMul: 1, trait: null, hasQuartermaster: false },
    fleetF, GAME_BALANCE.MORALE_MAX)
  assert(s.plain === false && s.risk === 'steady' && s.chips.length === 1 && s.chips[0].key === 'gold' && s.chips[0].ev === 10,
    '只赚 10 金的选项：评稳、恰好一枚金币芯片（不是"影响甚微"）')
  const sTiny: ChoiceSummary = summarizeChoice(
    { text: 'x', outcomes: [mk(1, { goldChange: 1 }).outcome] },
    { stanceMagnitudeMul: 1, trait: null, hasQuartermaster: false },
    fleetF, GAME_BALANCE.MORALE_MAX)
  assert(sTiny.plain === true && sTiny.chips.length === 0,
    `赚 1 金低于显示阈值 ${CHIP_MIN_EV} → 判为影响甚微`)
}

console.log('== 49. 弃牌与航速的环境因子 ==')
{
  // 弃牌：赌本归零、牌面已亮；已弃过的回合再弃是空操作
  const g = createGambleState(() => 0.5)
  const g2 = skipGambleRound(g)
  assert(g2.side === null && g2.revealed === true && g2.player === 0 && g2.dealer === 0,
    '弃牌后赌本归零、牌面已亮')
  const g3 = skipGambleRound(g2)
  assert(g3.side === null && g3.revealed === true, '已弃过的回合再弃不会翻出新牌')

  // 顺风更快、逆风更慢：风必须真的作用在航速上
  const shipG = { id: 1, name: 's', type: 'caravel' as const, speed: 6, durability: 60, maxDurability: 100, capacity: 50, usedCapacity: 0, crew: 30, maxCrew: 40 }
  const fleetG: Fleet = { id: 1, name: 't', gold: 500, fame: 20, morale: 70, food: 100, water: 100, currentPortId: null, isSailing: true, day: 1, ships: [shipG], cargo: [], flagshipId: 1, trait: null, durabilityCarry: 0 }
  const withWind = dailyDistanceNm(fleetG, [], 1.2)
  const calm = dailyDistanceNm(fleetG, [], 1)
  const against = dailyDistanceNm(fleetG, [], 0.8)
  assert(calm > 0, '船必须能走（航速为 0 会让所有航程卡死）')
  assert(withWind > calm && calm > against, `风影响航速（顺 ${withWind.toFixed(1)} > 平 ${calm.toFixed(1)} > 逆 ${against.toFixed(1)}）`)

  // 天候：格子划分与持续天数
  const [cx, cy] = weatherCell(0, 0)
  assert(cx === 4 && cy === 9, `海域格按 20° 划分（0,0 → ${cx},${cy}）`)
  const dur = weatherDuration(0, cx, cy)
  assert(dur >= 1 && dur <= 3, `天候持续 1-3 天（实际 ${dur}）`)
  assert(weatherDuration(0, cx, cy) === dur, '同格同日的天候时长确定（不会刷新就变天）')
}

console.log('== 50. 特质与成就的完整性 ==')
{
  assert(traits.length === 5, `船长特质 5 选 1（实际 ${traits.length}）`)
  for (const t of traits) {
    assert(!!t.id && !!t.name && !!t.effect && !!t.icon, `特质 ${t.id} 字段齐全`)
  }
  assert(achievements.length > 0, `成就清单非空（${achievements.length} 条）`)
  for (const a of achievements) {
    assert(!!a.id && !!a.title && !!a.description && !!a.icon && typeof a.check === 'function',
      `成就 ${a.id} 字段齐全（含判定函数）`)
  }
}

console.log('== 51. 贸易报价：面板显示价必须等于实际结算价 ==')
{
  // 这条测试守的是项目最核心的那条规矩：**屏幕上显示的数字 = 实际发生的变化**。
  //
  // 旧实现里 TradePanel 自己抄了一份价格公式（漏乘 priceMultiplier、
  // 也漏掉 surge），面板写的价和真正结算的价因此分叉——实测在 fame=100 时
  // 99 个条目里 97 个对不上，最大差 67 金（丝绸：面板 286 / 实收 336）。
  // 现在面板与结算共用 store 的 selectBuyPrice / selectSellPrice，
  // 这条测试就是防止它们再次分叉。
  const shipT = {
    id: 1, name: '测试船', type: 'caravel' as const, speed: 5, durability: 50,
    maxDurability: 100, capacity: 500, usedCapacity: 0, crew: 30, maxCrew: 40,
  }
  const baseFleet: Fleet = {
    id: 1, name: '测试舰队', gold: 999999, fame: 0, morale: 60, food: 100, water: 100,
    currentPortId: 1, isSailing: false, day: 1, ships: [shipT], cargo: [],
    flagshipId: 1, trait: null, durabilityCarry: 0,
  }

  const portIds = [...new Set(portGoods.map(p => p.portId))]
  let buyChecked = 0, buyBad = 0, buyWorst = 0
  let sellChecked = 0, sellBad = 0, sellWorst = 0
  let cargoBad = 0
  const badSamples: string[] = []

  for (const fame of [0, 60, 100]) {
    for (const portId of portIds) {
      for (const pg of portGoods.filter(p => p.portId === portId)) {
        const goodName = goods.find(g => g.id === pg.goodId)?.nameCn ?? String(pg.goodId)

        // --- 买：报价必须等于实际扣掉的金币 ---
        useGameStore.setState({
          fleet: { ...baseFleet, fame, currentPortId: portId },
          marketStock: {},
        })
        const quote = selectBuyPrice(useGameStore.getState(), portId, pg.goodId)
        if (quote == null) continue
        const goldBefore = useGameStore.getState().fleet.gold
        useGameStore.getState().buyGood(portId, pg.goodId, 1)
        const spent = goldBefore - useGameStore.getState().fleet.gold
        buyChecked++
        if (spent !== quote) {
          buyBad++
          buyWorst = Math.max(buyWorst, Math.abs(spent - quote))
          if (badSamples.length < 6) badSamples.push(`  买 港${portId} ${goodName} 名声${fame}: 报价 ${quote} 实扣 ${spent}`)
        }

        // --- 卖：报价 × 数量 必须等于实际到手的金币 ---
        useGameStore.setState({
          fleet: { ...baseFleet, fame, currentPortId: portId, cargo: [{ goodId: pg.goodId, quantity: 3 }] },
          marketStock: {},
        })
        const sellQuote = selectSellPrice(useGameStore.getState(), portId, pg.goodId)
        if (sellQuote == null) continue
        const goldBefore2 = useGameStore.getState().fleet.gold
        useGameStore.getState().sellGood(portId, pg.goodId, 2)
        const after = useGameStore.getState()
        const earned = after.fleet.gold - goldBefore2
        sellChecked++
        if (earned !== sellQuote * 2) {
          sellBad++
          sellWorst = Math.max(sellWorst, Math.abs(earned - sellQuote * 2))
          if (badSamples.length < 6) badSamples.push(`  卖 港${portId} ${goodName} 名声${fame}: 报价 ${sellQuote} 实收 ${earned}`)
        }
        const left = after.fleet.cargo.find(c => c.goodId === pg.goodId)
        if (left === undefined || left.quantity !== 1) cargoBad++
      }
    }
  }
  assert(buyBad === 0, `买入报价 = 实扣金币（核对 ${buyChecked} 组，不一致 ${buyBad} 组，最大差 ${buyWorst}）`)
  assert(sellBad === 0, `卖出报价 = 实收金币（核对 ${sellChecked} 组，不一致 ${sellBad} 组，最大差 ${sellWorst}）`)
  assert(cargoBad === 0, `卖出后货舱数量正确（异常 ${cargoBad} 组）`)
  badSamples.forEach(s => console.log(s))

  // 上面三百多次大额买卖把商会好感刷到了 60 以上，价格系数因此整体下移。
  // 后面的断言要测「系数如何起作用」，必须先把第二��线状态归零，
  // 否则测到的是残留状态而不是设计。
  const resetPricingState = () => useGameStore.setState({
    officers: [],
    crewRoster: [],
    factionRep: { crown: 0, guild: 0, scholars: 0, brethren: 0 },
    notoriety: { cruel: 0, mercy: 0, greed: 0, bold: 0, secret: 0 },
    fleet: { ...baseFleet },
    marketStock: {},
  })

  // --- 声望/特质系数必须真的生效，而不是摆设 ---
  {
    const portId = portIds[0]
    // 选该港最贵的商品：低价商品的四舍五入会把系数差异吞掉，
    // 那会让这条断言偶尔「测不出差异」而不是「测出问题」
    const pg = [...portGoods.filter(p => p.portId === portId)]
      .sort((a, b) => b.price * b.priceModifier - a.price * a.priceModifier)[0]
    resetPricingState()
    const q0 = selectBuyPrice(useGameStore.getState(), portId, pg.goodId)!
    resetPricingState()
    useGameStore.setState({ fleet: { ...baseFleet, fame: 100, trait: null } })
    const q100 = selectBuyPrice(useGameStore.getState(), portId, pg.goodId)!
    assert(q100 < q0, `声望 100 的买价低于声望 0（${q100} < ${q0}）——声望系数真的作用在报价上`)

    resetPricingState()
    useGameStore.setState({ fleet: { ...baseFleet, fame: 0, trait: 'merchant' } })
    const qMerchant = selectBuyPrice(useGameStore.getState(), portId, pg.goodId)!
    assert(qMerchant <= q0, `商人特质的买价不高于普通船长（${qMerchant} ≤ ${q0}）`)
  }

  // --- 本港不经营的商品：必须有出路，否则货舱里出现永远换不成钱的死货 ---
  {
    resetPricingState()
    const noWayOut: string[] = []
    for (const g of goods) {
      for (const portId of portIds) {
        if (selectSellPrice(useGameStore.getState(), portId, g.id) == null) {
          noWayOut.push(`${g.nameCn}@港${portId}`)
        }
      }
    }
    assert(noWayOut.length === 0, `任意商品在任意港口都有出路（无出路 ${noWayOut.length} 组）`)

    // 雪茄只在 1 个港口经营——离开那个港口就是死货
    const cigar = goods.find(g => g.nameCn === '雪茄')!
    const cigarPort = portGoods.find(p => p.goodId === cigar.id)!.portId
    const otherPort = portIds.find(p => p !== cigarPort)!
    resetPricingState()
    useGameStore.setState({
      fleet: { ...baseFleet, currentPortId: otherPort, cargo: [{ goodId: cigar.id, quantity: 2 }] },
    })
    const quote = selectSellPrice(useGameStore.getState(), otherPort, cigar.id)
    assert(quote !== null, '本港不经营的商品也有报价（折价出清，而不是拒绝）')
    assert(quote! <= cigar.basePrice, `折价不超过基准价（${quote} ≤ ${cigar.basePrice}）`)
    // 折价的算法必须写死在这里：基准价 × OFFER_PRICE_RATIO ÷ 价格系数
    const expectedOffer = Math.round((cigar.basePrice * OFFER_PRICE_RATIO) / priceMultiplier(useGameStore.getState().fleet))
    assert(quote === expectedOffer, `折价 = 基准价 × ${OFFER_PRICE_RATIO} ÷ 价格系数（期望 ${expectedOffer}，实际 ${quote}）`)
    // 折价必须明显低于本经营港的正常收购价，否则「折价」两个字是骗人的
    const normalQuote = selectSellPrice(useGameStore.getState(), cigarPort, cigar.id)!
    assert(quote! < normalQuote, `折价出清比本港正常收购便宜（${quote} < ${normalQuote}）`)
    const goldBefore = useGameStore.getState().fleet.gold
    useGameStore.getState().sellGood(otherPort, cigar.id, 2)
    const after = useGameStore.getState()
    assert(after.fleet.gold === goldBefore + quote! * 2, `折价出售真实入账（报价 ${quote} × 2）`)
    assert(after.fleet.cargo.find(c => c.goodId === cigar.id) === undefined, '折价出售后货物离开货舱（不再是死货）')
  }
}

console.log('== 52. 贸易颜色提示：标绿必是全港最低价 ==')
{
  // 颜色是玩家用来做决定的信号，必须直接可行动。
  // 旧口径（相对全局基准价）量过：36 个标绿条目里只有 9 个（25%）
  // 真是全港最低价，朗姆酒在有的港标绿（6）却还有更便宜的港（3）——
  // 玩家看绿色买，结果买贵了一倍。
  useGameStore.setState({
    fleet: { ...useGameStore.getState().fleet, fame: 0, trait: null },
    marketStock: {},
    officers: [], crewRoster: [],
    factionRep: { crown: 0, guild: 0, scholars: 0, brethren: 0 },
    notoriety: { cruel: 0, mercy: 0, greed: 0, bold: 0, secret: 0 },
  })

  const portIds = [...new Set(portGoods.map(p => p.portId))]
  let cheapWrong = 0, expWrong = 0, normalChecked = 0
  let cheapIsMin = 0, cheapTotal = 0
  const badSamples: string[] = []

  for (const g of goods) {
    const ports = portGoods.filter(p => p.goodId === g.id).map(p => p.portId)
    if (ports.length === 0) continue
    const prices = ports.map(p => selectBuyPrice(useGameStore.getState(), p, g.id)!)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    ports.forEach((p, i) => {
      const tone = selectPriceTone(useGameStore.getState(), p, g.id)
      if (tone === 'cheap') {
        cheapTotal++
        if (prices[i] === min) cheapIsMin++
        else {
          cheapWrong++
          if (badSamples.length < 6) badSamples.push(`  ${g.nameCn}@港${p}: 标绿但价 ${prices[i]} > 最低 ${min}`)
        }
      } else if (tone === 'expensive') {
        if (prices[i] !== max) {
          expWrong++
          if (badSamples.length < 6) badSamples.push(`  ${g.nameCn}@港${p}: 标红但价 ${prices[i]} < 最高 ${max}`)
        }
      } else {
        normalChecked++
        if (prices[i] === min || prices[i] === max) {
          cheapWrong++
          if (badSamples.length < 6) badSamples.push(`  ${g.nameCn}@港${p}: 标中性但价 ${prices[i]} 已是极值`)
        }
      }
    })
  }
  assert(cheapWrong === 0, `标绿/标中性都必须是全港极值（异常 ${cheapWrong} 组）`)
  assert(expWrong === 0, `标红必须是全港最高价（异常 ${expWrong} 组）`)
  assert(cheapTotal > 0, `存在标绿的条目（${cheapTotal} 条）`)
  assert(cheapIsMin === cheapTotal, `标绿条目 100% 是全港最低价（${cheapIsMin}/${cheapTotal}）`)
  assert(normalChecked > 0, `存在居中的条目（${normalChecked} 条）`)
  badSamples.forEach(s => console.log(s))

  // 只有一座港经营的商品：那里既是最低也是最高——标绿（唯一可买的地方）
  {
    const cigar = goods.find(g => g.nameCn === '雪茄')!
    const cigarPort = portGoods.find(p => p.goodId === cigar.id)!.portId
    assert(selectPriceTone(useGameStore.getState(), cigarPort, cigar.id) === 'cheap',
      '只有一个港口经营的商品，标绿（那是唯一能买的地方）')
  }

  // 库存变化会推高本港价格，档位要跟着变（颜色是活的行情信号）
  {
    const portId = portIds[0]
    const pg = portGoods.find(p => p.portId === portId)!
    const before = selectPriceTone(useGameStore.getState(), portId, pg.goodId)
    useGameStore.setState({ marketStock: { [`${portId}:${pg.goodId}`]: 1 } })
    const after = selectPriceTone(useGameStore.getState(), portId, pg.goodId)
    assert(typeof after === 'string', '库存变化后档位仍可判定')
    useGameStore.setState({ marketStock: {} })
    assert(selectPriceTone(useGameStore.getState(), portId, pg.goodId) === before,
      '库存恢复后档位回到原样')
  }
}

console.log('== 53. 自由世界：模式、跳过操舵、参观模式不输 ==')
{
  // --- 1) 开局模式：默认船长，参观模式显式指定 ---
  useGameStore.getState().initGame('merchant')
  assert(useGameStore.getState().gameMode === 'captain', '默认是船长模式')
  assert(useGameStore.getState().tutorialStep === 0, '船长模式开局进教学')

  useGameStore.getState().initGame('merchant', 'visitor')
  assert(useGameStore.getState().gameMode === 'visitor', '可指定参观模式')
  assert(useGameStore.getState().tutorialStep === -1,
    '参观模式不弹教学——只想看世界的人不该被 10 步引导按着走')

  // --- 2) 操舵不再是硬门槛：任何模式都能跳过，且代价只有"没有奖励" ---
  const skipShip = { id: 1, name: '圣玛利亚号', type: 'caravel' as const, speed: 5, durability: 50, maxDurability: 100, capacity: 100, usedCapacity: 0, crew: 30, maxCrew: 40 }
  const skipFleet: Fleet = { id: 1, name: '测试舰队', gold: 500, fame: 0, morale: 60, food: 100, water: 100, currentPortId: null, isSailing: true, day: 10, ships: [skipShip], cargo: [], flagshipId: 1, trait: null, durabilityCarry: 0 }
  const skipRoute: Route = { id: -42, fromPortId: 6, toPortId: 7, distance: 1000, dangerLevel: 3, windFavor: 1 }
  useGameStore.setState({
    fleet: skipFleet,
    currentRoute: skipRoute,
    waypoint: { latitude: 40, longitude: -10, portId: 7 },
    shipPosition: [20, -20],
    segmentCount: 4,
    segmentIndex: 0,
    pendingSegment: { index: 0, total: 4, hazard: '风浪渐起', segmentNm: 250, remainingNm: 1000, daysLeft: 5 },
    pendingHelm: null,
    helmAdvance: null,
    gameMode: 'captain',
    gamePhase: 'segment',
  })
  useGameStore.getState().chooseStance('rush')
  assert(useGameStore.getState().gamePhase === 'helm', '船长模式：选完方针仍进入操舵')
  assert(!!useGameStore.getState().pendingHelm, '船长模式：操舵待办已挂上')

  // 跳过：唯一代价是没有奖励
  const beforeSkip = useGameStore.getState()
  useGameStore.getState().skipHelmRun()
  const afterSkip = useGameStore.getState()
  assert(afterSkip.pendingHelm === null, '跳过后清掉待操舵')
  assert(afterSkip.gamePhase === 'playing', '跳过后恢复航行（不卡在模态里）')
  assert(afterSkip.helmAdvance === beforeSkip.helmAdvance, '跳过不递交里程——没玩就没有奖励')
  assert(afterSkip.fleet.morale === beforeSkip.fleet.morale, '跳过不加也不扣士气')
  assert(afterSkip.fleet.ships[0].durability === beforeSkip.fleet.ships[0].durability, '跳过不磨损船体')

  // 无待操舵时跳过 = no-op（不能顺手把航行状态改掉）
  useGameStore.setState({ gamePhase: 'playing', pendingHelm: null })
  useGameStore.getState().skipHelmRun()
  assert(useGameStore.getState().gamePhase === 'playing', '没有待操舵时跳过不改游戏阶段')

  // --- 3) 参观模式：选完方针直接开走，不弹操舵 ---
  useGameStore.setState({
    fleet: skipFleet,
    currentRoute: skipRoute,
    waypoint: { latitude: 40, longitude: -10, portId: 7 },
    shipPosition: [20, -20],
    segmentCount: 4,
    segmentIndex: 0,
    pendingSegment: { index: 1, total: 4, hazard: '风浪渐起', segmentNm: 250, remainingNm: 750, daysLeft: 4 },
    pendingHelm: null,
    gameMode: 'visitor',
    gamePhase: 'segment',
  })
  useGameStore.getState().chooseStance('steady')
  const visitorAfterStance = useGameStore.getState()
  assert(visitorAfterStance.gamePhase === 'playing', '参观模式：选完方针直接开走')
  assert(visitorAfterStance.pendingHelm === null, '参观模式：不强制操舵')

  // --- 4) 参观模式：不吃不喝、不会输 ---
  useGameStore.setState({
    fleet: { ...skipFleet, food: 100, water: 100, morale: 60 },
    currentRoute: skipRoute,
    gameMode: 'visitor',
    gamePhase: 'playing',
    segmentCount: 0,
    segmentIndex: 0,
    pendingSegment: null,
    pendingHelm: null,
  })
  useGameStore.getState().advanceDay()
  const vDay = useGameStore.getState()
  assert(vDay.fleet.food === 100 && vDay.fleet.water === 100,
    `参观模式不扣补给（粮 ${vDay.fleet.food} / 水 ${vDay.fleet.water}）`)
  assert(vDay.gamePhase !== 'gameover', '参观模式不会因为一天就结束')

  // 船长模式：同样的天数是要扣补给的（证明上一条不是"恰好没扣"）
  useGameStore.setState({
    fleet: { ...skipFleet, food: 100, water: 100, morale: 60 },
    currentRoute: skipRoute,
    gameMode: 'captain',
    gamePhase: 'playing',
    segmentCount: 0,
    segmentIndex: 0,
    pendingSegment: null,
    pendingHelm: null,
  })
  useGameStore.getState().advanceDay()
  const cDay = useGameStore.getState()
  assert(cDay.fleet.food < 100, `船长模式照常扣补给（粮 ${cDay.fleet.food}）`)

  // 士气归零：船长模式结束，参观模式不结束
  useGameStore.setState({
    fleet: { ...skipFleet, morale: 0 },
    currentRoute: skipRoute,
    gameMode: 'captain',
    gamePhase: 'playing',
  })
  useGameStore.getState().advanceDay()
  assert(useGameStore.getState().gamePhase === 'gameover', '船长模式：士气归零 → 航行终结')

  useGameStore.setState({
    fleet: { ...skipFleet, morale: 0 },
    currentRoute: skipRoute,
    gameMode: 'visitor',
    gamePhase: 'playing',
  })
  useGameStore.getState().advanceDay()
  assert(useGameStore.getState().gamePhase !== 'gameover', '参观模式：士气归零也不结束')

  // 事件结算：参观模式不因"归零"而终结（耐久/士气留 1 点底）
  useGameStore.setState({
    fleet: { ...skipFleet, morale: 5, ships: [{ ...skipShip, durability: 3 }] },
    gameMode: 'visitor',
    gamePhase: 'event',
  })
  useGameStore.getState().applyEventOutcome({
    goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -50, durabilityChange: -10,
  })
  const vEvent = useGameStore.getState()
  assert(vEvent.gamePhase !== 'gameover', '参观模式：事件重创也不会结束这一局')
  assert(vEvent.fleet.morale >= 1, `参观模式士气留底（${vEvent.fleet.morale}）`)
  assert(vEvent.fleet.ships[0].durability >= 1, `参观模式耐久留底（${vEvent.fleet.ships[0].durability}）`)

  useGameStore.setState({
    fleet: { ...skipFleet, morale: 5, ships: [{ ...skipShip, durability: 3 }] },
    gameMode: 'captain',
    gamePhase: 'event',
  })
  useGameStore.getState().applyEventOutcome({
    goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -50, durabilityChange: -10,
  })
  assert(useGameStore.getState().gamePhase === 'gameover', '船长模式：同样的重创会结束这一局')

  // 复位，避免影响后续用例
  useGameStore.getState().initGame('merchant', 'captain')
}

/* ==========================================================================
 * 方针代价文案：必须与账本完全一致，不能说谎
 *
 * 界面上的那行「省粮水 · 伤船 · 事件更重」是玩家选方针时唯一的判断依据。
 * 如果它和账本数字对不上，玩家就会照着一个假的方向做决定——
 * 这比不显示更糟。
 *
 * 【为什么必须动态算】写死文案在短航段上会变成假话：
 * days = ceil(distance / (nmPerDay × speedMul))，段短时三个方针的天数
 * 被取整压成同一个数，而 supplyMul 的 1.5 倍差异照旧 → 抢行反而多耗粮。
 * 下面第一组断言就是钉住这个反直觉案例：谁把文案改回写死的
 * "抢行 = 省粮水"，这里立刻失败。
 * ========================================================================== */
{
  const ledgersAt = (dist: number) => stanceLedgers({
    distanceNm: dist,
    baseNmPerDay: 192,     // 真实初始舰队实测值
    dailyFood: 2,
    dailyWater: 3,
    cookRelief: 1,
    dailyEventProb: 0.25,
    durabilityCarry: 0,
  })

  // ① 反直觉案例：100 海里段上抢行反而费粮（天数被 ceil 抹平）
  {
    const rush = ledgersAt(100).find(l => l.stance.id === 'rush')!
    const t = describeStanceTradeoff(rush)
    assert(rush.delta.days === 0, '100 海里段上三个方针天数相同（ceil 取整抹平快慢）')
    assert(rush.delta.food + rush.delta.water > 0, '100 海里段上抢行反而多耗粮水')
    assert(t.includes('费粮水'), `100 海里段抢行文案必须说「费粮水」（实得「${t}」）`)
    assert(t.includes('用时相同'), `100 海里段抢行文案必须说「用时相同」（实得「${t}」）`)
  }

  // ② 长段上抢行确实又快又省
  {
    const rush = ledgersAt(1200).find(l => l.stance.id === 'rush')!
    const t = describeStanceTradeoff(rush)
    assert(rush.delta.days < 0, '1200 海里段上抢行更快')
    assert(rush.delta.food + rush.delta.water < 0, '1200 海里段上抢行更省粮水')
    assert(t.includes('省粮水'), `1200 海里段抢行文案必须说「省粮水」（实得「${t}」）`)
    assert(!t.includes('用时相同'), '1200 海里段抢行不应说「用时相同」')
  }

  // ③ 遍历多个段长：文案的每个方向都必须与账本一致
  let checked = 0
  for (const dist of [50, 100, 150, 200, 300, 400, 600, 800, 1200, 2000, 3000, 5000]) {
    for (const l of ledgersAt(dist)) {
      const t = describeStanceTradeoff(l)
      const tag = `${dist}nm ${l.stance.name}`

      if (l.stance.id === 'steady') {
        assert(t === '基准节奏 · 无额外代价', `steady 文案恒为基准（${tag}）`)
        continue
      }

      const supply = l.delta.food + l.delta.water
      if (supply < 0) {
        assert(t.includes('省粮水') && !t.includes('费粮水'), `${tag}：账本省粮水，文案必须说省`)
      } else if (supply > 0) {
        assert(t.includes('费粮水') && !t.includes('省粮水'), `${tag}：账本费粮水，文案必须说费`)
      } else {
        assert(!t.includes('省粮水') && !t.includes('费粮水'), `${tag}：粮水持平，文案不应提方向`)
      }

      if (l.delta.days === 0) assert(t.includes('用时相同'), `${tag}：天数相同，文案必须说「用时相同」`)
      else assert(!t.includes('用时相同'), `${tag}：天数不同，文案不应说「用时相同」`)

      if (l.delta.wear > 0) assert(t.includes('伤船'), `${tag}：账本更伤船，文案必须说「伤船」`)
      else if (l.delta.wear < 0) assert(t.includes('护船'), `${tag}：账本更护船，文案必须说「护船」`)

      // 事件后果是倍率，与段长无关，必须恒成立
      if (l.stance.eventMagnitudeMul > 1) assert(t.includes('事件更重'), `${tag}：倍率 >1 必须说「事件更重」`)
      else if (l.stance.eventMagnitudeMul < 1) assert(t.includes('事件更轻'), `${tag}：倍率 <1 必须说「事件更轻」`)

      // 文案里不应残留 + - 号：方向已经用词表达了，数字由细账表格负责
      assert(!/[+-]\d/.test(t), `${tag}：文案不该出现带符号的数字（实得「${t}」）`)
      checked++
    }
  }
  assert(checked >= 20, `文案一致性遍历覆盖足够多的账本（实测 ${checked} 条）`)
}

console.log('== 46. 地形符号：只撒在陆地内、可复现、按面积取块 ==')
{
  /**
   * L 形"大陆"：bbox 是 10×10，但右上角 (0..5, 0..5) 是海。
   *
   * 【为什么不能用正方形】——这条差点成为一个假测试。
   * 正方形填满了自己的 bbox，撒点在 bbox 内就必然在陆地内，
   * 于是"点是否在多边形内"这个判断**根本没有被检验到**。
   * 实测：把 pointInRings 的过滤整段删掉，正方形用例照样全绿。
   * L 形留出 1/4 的空洞，越界点才会真的出现。
   */
  const square = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[-5, -5], [5, -5], [5, 0], [-1, 0], [-1, 5], [-5, 5], [-5, -5]]],
      },
    }],
  }
  const symbols = buildTerrainSymbols(square)
  assert(symbols.length > 0, `正方形大陆应当撒出符号（实得 ${symbols.length}）`)
  // 全部落在 L 形内——这是撒点逻辑最核心的正确性
  const inSea = symbols.filter(s => s.lng > -1 && s.lat > 0)
  assert(inSea.length === 0, `符号不能跑到海面（越界 ${inSea.length} 个）`)

  /*
   * 专门测「海岸 inset」：撒点里有两道过滤——点本身在陆地内、
   * 以及点的四周 inset 距离内也都在陆地内。它们是冗余的（删一道另一道兜住），
   * 所以只删一道时"不能跑到海面"这条断言不会响，无法定位是哪道坏了。
   * 这里直接检查"离海岸的距离"，删掉 inset 那道就会立刻失败。
   */
  /*
   * 【为什么用敏感度断言而不是"采样邻点"】
   * 先写的是"每个符号周围 d 距离内都不能是海"。但 L 形只有 25 个格点，
   * 落在 (0, d) 那条窄带里的点本身就靠运气——实测把 inset 整段删掉，
   * 这条断言照样通过（这次随机种子恰好没生成贴边点）。
   * 改成确定性的：inset 系数翻几倍，被排除的贴边点必然更多，符号数必须变少。
   * 删掉 inset 逻辑时两个结果相同，立刻失败。
   */
  const fine = buildTerrainSymbols(square, { stepDeg: 0.6 })
  // rank 供绘图层做 zoom 分级：必须落在 [0,1)，否则"按阈值过滤"会整段失效
  // （全大于 1 就是永远画不出来，全小于 0 就是拉远也不稀）
  assert(fine.every(s => s.rank >= 0 && s.rank < 1), 'rank 必须落在 [0,1)')
  const wide = buildTerrainSymbols(square, { stepDeg: 0.6, insetMul: 1.2 })
  assert(wide.length < fine.length,
    `海岸 inset 变宽后符号应变少（${fine.length} → ${wide.length}）`)
  // 也不能贴边：贴边的符号会被海岸描边切一半
  const nearEdge = symbols.filter(s => Math.abs(Math.abs(s.lat) - 5) < 0.05 || Math.abs(Math.abs(s.lng) - 5) < 0.05)
  assert(nearEdge.length === 0, `符号不该贴着海岸线（贴边 ${nearEdge.length} 个）`)

  // 固定种子 → 同一份数据撒在同一处（否则切视图时山会乱跑）
  const again = buildTerrainSymbols(square)
  const same = symbols.length === again.length &&
    symbols.every((s, i) => s.lat === again[i].lat && s.lng === again[i].lng && s.kind === again[i].kind)
  assert(same, '同一份数据两次生成结果必须一致（种子固定）')

  // 两种符号都要出现：全是山或全是树说明 kind 分支写死了
  const kinds = new Set(symbols.map(s => s.kind))
  assert(kinds.has('peak'), '应当出现山')
  // 这个方块在赤道附近，树的比例取决于随机数；至少要保证 kind 只有两种取值
  assert([...kinds].every(k => k === 'peak' || k === 'tree'), `kind 只能是 peak/tree（实得 ${[...kinds]}）`)

  // 只处理面积前 N 块：给一堆小块 + 一个巨块，巨块必须被选中
  const small = Array.from({ length: 30 }, (_, i) => ({
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: [[[100 + i, 40], [100.2 + i, 40], [100.2 + i, 40.2], [100 + i, 40.2], [100 + i, 40]]],
    },
  }))
  const mixed = { type: 'FeatureCollection' as const, features: [...small, ...square.features] }
  const fromMixed = buildTerrainSymbols(mixed, { topBlocks: 1 })
  const allInBig = fromMixed.every(s => !(s.lng > -1 && s.lat > 0))
  assert(allInBig, 'topBlocks=1 时只应给最大的那块撒点')

  // 空数据不该崩
  assert(buildTerrainSymbols({ type: 'FeatureCollection', features: [] }).length === 0, '空数据集应返回空数组')
}

console.log('== 47. 参观模式：全程不弹航段抉择（store 分流）==')
{
  const mkShip = () => ({ id: 1, name: '圣玛利亚号', type: 'caravel' as const, speed: 5, durability: 80, maxDurability: 100, capacity: 100, usedCapacity: 0, crew: 20, maxCrew: 40 })
  const mkFleet = (): Fleet => ({ id: 1, name: '测试舰队', gold: 500, fame: 0, morale: 60, food: 100, water: 100, currentPortId: 6, isSailing: false, day: 10, ships: [mkShip()], cargo: [], flagshipId: 1, trait: null, durabilityCarry: 0 })
  const route: Route = { id: -99, fromPortId: 6, toPortId: 7, distance: 600, dangerLevel: 2, windFavor: 1 }
  const waypoint = { latitude: 40, longitude: -10, portId: 7 }

  // —— 1) 船长模式：出航即进入第 0 段抉择（原有行为，不能被改坏）——
  useGameStore.setState({
    gameMode: 'captain', fleet: mkFleet(), pendingVoyage: { waypoint, route },
    shipPosition: [20, -20], segmentCount: 0, segmentIndex: 0, pendingSegment: null, gamePhase: 'playing',
  })
  useGameStore.getState().confirmDeparture()
  const cap = useGameStore.getState()
  assert(cap.fleet.isSailing === true, '船长模式出航后确实在航行')
  assert(cap.pendingSegment !== null, '船长模式出航后应立刻进入航段抉择')
  assert(cap.gamePhase === 'segment', `船长模式出航后 gamePhase 应为 segment（实际 ${cap.gamePhase}）`)

  // —— 2) 参观模式：出航直接 playing，不产生 pendingSegment ——
  useGameStore.setState({
    gameMode: 'visitor', fleet: mkFleet(), pendingVoyage: { waypoint, route },
    shipPosition: [20, -20], segmentCount: 0, segmentIndex: 0, pendingSegment: null, gamePhase: 'playing',
  })
  useGameStore.getState().confirmDeparture()
  const vis = useGameStore.getState()
  assert(vis.fleet.isSailing === true, '参观模式仍然真的开船（不是什么都不做）')
  assert(vis.pendingSegment === null, '参观模式出航后不应产生航段抉择')
  assert(vis.gamePhase === 'playing', `参观模式出航后 gamePhase 应为 playing（实际 ${vis.gamePhase}）`)
  assert(vis.segmentCount > 0, '参观模式仍然切分了航段（进度条刻度要靠它）')

  // —— 3) 参观模式跨段：段号照常前进，仍不产生抉择 ——
  useGameStore.setState({
    gameMode: 'visitor', fleet: { ...mkFleet(), isSailing: true }, currentRoute: route,
    segmentCount: 4, segmentIndex: 0, pendingSegment: null, gamePhase: 'playing', stance: 'steady',
  })
  useGameStore.getState().syncSegmentBoundary(0.5)
  const visSeg = useGameStore.getState()
  assert(visSeg.segmentIndex === 1, `参观模式跨段后段号应 +1（实际 ${visSeg.segmentIndex}）`)
  assert(visSeg.pendingSegment === null, '参观模式跨段不应产生抉择面板')
  assert(visSeg.gamePhase === 'playing', `参观模式跨段后仍在 playing（实际 ${visSeg.gamePhase}）`)
  assert(visSeg.stance === 'steady', `参观模式不改变方针（实际 ${visSeg.stance}）`)

  // —— 4) 同样条件换成船长模式：必须弹抉择（证明分流真的按模式走）——
  useGameStore.setState({
    gameMode: 'captain', fleet: { ...mkFleet(), isSailing: true }, currentRoute: route,
    segmentCount: 4, segmentIndex: 0, pendingSegment: null, gamePhase: 'playing', stance: 'steady',
  })
  useGameStore.getState().syncSegmentBoundary(0.5)
  const capSeg = useGameStore.getState()
  assert(capSeg.segmentIndex === 1, '船长模式跨段后段号 +1')
  assert(capSeg.pendingSegment !== null, '船长模式跨段必须弹航段抉择')
  assert(capSeg.gamePhase === 'segment', '船长模式跨段后进入 segment 阶段')

  // —— 5) 参观模式连续跨多段也不会停：一次一次推进，但不产生任何 pending ——
  useGameStore.setState({
    gameMode: 'visitor', fleet: { ...mkFleet(), isSailing: true }, currentRoute: route,
    segmentCount: 4, segmentIndex: 0, pendingSegment: null, gamePhase: 'playing', stance: 'steady',
  })
  for (const p of [0.3, 0.55, 0.8]) useGameStore.getState().syncSegmentBoundary(p)
  const visTrip = useGameStore.getState()
  assert(visTrip.segmentIndex === 3, `参观模式连续推进到第 3 段（实际 ${visTrip.segmentIndex}）`)
  assert(visTrip.pendingSegment === null, '参观模式全程无拦截')
}


console.log(`\n最终结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)
