/* 逻辑冒烟测试：验证事件链、特质、价格、成就、航速、情报、军官、竞争船长真实生效 */
import { events } from '../src/data/events'
import { checkEventTrigger, consumeEventFlags, selectOutcome, markExplorerBonus } from '../src/utils/eventEngine'
import { SCENE_KEYS } from '../src/components/events/EventScene'
import { applyTraitToOutcome, priceMultiplier, traits } from '../src/data/traits'
import { checkAchievements, achievements } from '../src/data/achievements'
import { GAME_BALANCE } from '../src/data/gameConfig'
import { RIVALS } from '../src/data/rivals'
import { OFFICERS } from '../src/data/officers'
import { effectiveFleetSpeed, calculateDailyConsumption, calculateSailingDays, dailyDistanceNm, daysForDistance, haversineNm, routeProgressOf } from '../src/utils/navigation'
import { WEATHER_INFO, weatherCell, weatherDuration, weatherFavorFactor } from '../src/utils/weather'
import type { WeatherState } from '../src/types'
import {
  dailyRates, daysToDestination, formatSupplyDays, moraleLevel, routeFacts, supplyDaysRemaining, supplyLevel, voyageDays,
} from '../src/utils/voyage'
import {
  adjustedOutcomes, crewLossChance, expectedDeltas, outcomeHarm, riskGrade, summarizeChoice,
  CHIP_MIN_EV, type AdjustedOutcome, type ChoiceSummary,
} from '../src/utils/eventSummary'
import { adjustOutcome, clampOutcomeToFleet } from '../src/utils/outcomeAdjust'
import { buildTerrainSymbols, filterPeaksByElevation } from '../src/utils/terrainDecor'
import { latToWorldZ, lonToWorldX, mercNorm, MAP_WORLD_SIZE, MERCATOR_LAT_LIMIT } from '../src/utils/mapProjection'
import {
  coastSegments, graticuleSegments,
  GRATICULE_MERIDIANS, GRATICULE_PARALLELS, GRATICULE_STEP_DEG,
} from '../src/utils/chartLines'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { birdPose, flagYaw, smokePose } from '../src/utils/portLife'
import { DIALOGUE_RULES, dialogueBudget, pickDialogue, unreachableScripts, type DialogueContext } from '../src/utils/dialogueTriggers'
import { traitEffect } from '../src/utils/outcomeAdjust'
import { groupJournal, journalHeadline } from '../src/utils/captainLog'
import { rollSeaOmen, OMEN_CHANCE, OMEN_COOLDOWN_DAYS } from '../src/utils/seaOmen'
import { voyageMilestones, nextMilestone, newlyReached, suggestPortFor } from '../src/data/voyageMilestones'
import { advanceDebris, spawnDebris } from '../src/utils/seaDebris'
import { debrisGain, DEBRIS_MAX, DEBRIS_TTL_DAYS, DEBRIS_SPAWN_CHANCE, type DebrisSpot } from '../src/data/debris'
import { npcLegAt, npcPose } from '../src/utils/npcShips'
import { getRouteGeometry } from '../src/utils/routePath'
import { durabilityColor, loadColor, DANGER_COLOR, WARN_COLOR, SAFE_COLOR } from '../src/utils/shipVitals'
import {
  STANCES, forecastSegment, stanceLedgers, segmentCountFor, segmentIndexFor, nextSegmentBoundary,
  dailyFoodUse, dailyWaterUse, dailyWearRate, settleWear, describeStanceTradeoff,
} from '../src/utils/segment'
import { generateRouteIntel, settleOfficerWages, advanceRivals, selectBuyPrice, selectSellPrice, selectPriceTone, OFFER_PRICE_RATIO, dynamicSellPrice, selectBestDeal, selectCargoSale, selectDealTalentBonus, selectReturnLeg, tickCrewLoyalty } from '../src/store/useGameStore'
import { repairCost, taskGold, supplyCost, supplyAmounts, CARPENTER_COST_MUL, MERCHANT_REWARD_MUL, INTERPRETER_FACTION_MUL, PATHFINDER_DISCOVERY_MUL } from '../src/utils/crewPerks'
import { FACTIONS, factionAttitude, portFaction } from '../src/data/factions'
import { CREW_CHARS, CREW_CHAR_MAP } from '../src/data/crewChars'
import { TITLES, currentTitle, dominantAxis } from '../src/data/titles'
import {
  HELM_DURATION, HELM_FAVOR_ARC, HelmWindSim,
  advanceHelmShip, angleDiff, evaluateHelmRun, helmFavor, helmReward, inFavorArc,
  normalizeAngle, type HelmSample,
} from '../src/utils/helm'
import { useGameStore } from '../src/store/useGameStore'
import { useMapStore } from '../src/store/useMapStore'
import { arrivalCountAt, clueCenter, hasAnyService, latestArrivalAt, previousArrivalAt } from '../src/utils/harbor'
import type { LogbookEntry } from '../src/types'
import { SHIP_SPRITES, SPECIAL_SPRITES, shipSprite } from '../src/data/shipSprites'
import { crewPortrait, officerPortrait, rivalPortrait } from '../src/data/portraits'
import { sceneImage, shouldUseSceneImage } from '../src/data/sceneImages'
import { UI_ASSETS } from '../src/data/uiAssets'
import { getStatusColor } from '../src/utils/resourceColor'
import { FX_ASSETS, BG_ASSETS } from '../src/data/envAssets'
import { harborBackdrop, portImage } from '../src/data/portImages'
import {
  DIALOGUE_SCRIPTS, OPENING_SCRIPT_ID, SPEAKERS,
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
import { createHash } from 'node:crypto'
import type { EventOutcome, Fleet, GameEvent, MiniGameId, Route } from '../src/types'
import {
  greatCircleNm, greatCirclePoint, buildRouteGeometry, positionAtNm, traveledNmAt,
} from '../src/utils/routePath'
import { findSeaPath } from '../src/utils/seaRoute'
import { advanceAlongRoute } from '../src/utils/sailStep'
import { decidePixelRatio, PIXEL_RATIO_STEP, SLOW_FRAME_MS, MIN_SAMPLES } from '../src/utils/adaptiveResolution'
import { isTapGesture, TAP_SLOP_MOUSE, TAP_SLOP_TOUCH } from '../src/utils/tapGesture'
import { landPaperPatternMarkup, PAPER_TILE } from '../src/utils/paperTexture'
import { buildRhumbNetwork, RHUMB_CENTERS } from '../src/utils/rhumbLines'
import { hasSnow, SNOW_LAT, rankMaxForZoom, PEAK_MIN_ELEV } from '../src/utils/terrainDecor'
import { chooseLabelSides } from '../src/utils/portLabels'
import { ports } from '../src/data/ports'
import { tasks } from '../src/data/tasks'
import {
  appendLogbook, countEchoes, echoAt, echoDayFor, echoForPort, findClueFor,
  makeArrivalEntry, makeEchoEntry, makeTitleEntry, markAllRead, pickRumor, LOGBOOK_MAX,
} from '../src/data/logbook'
import { parseSaveText, SAVE_FIELDS, SAVE_KEY, SAVE_VERSION } from '../src/utils/saveFile'

let passed = 0
let failed = 0
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`) }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`) }
}

/**
 * 读图片头的尺寸与 alpha —— PNG 与 WebP 都支持。
 *
 * 【为什么需要】素材从 PNG 换成 WebP 后（首屏省 85% 体积），
 * 原来直接读 PNG 头的断言全部失败，报出 167772160×536870912 这种天文数字
 * （把 "RIFF" 当成了 IHDR 的宽）。与其把断言退化成"文件存在就算过"，
 * 不如让它认两种格式——尺寸和透明通道这两件事，格式无关。
 */
function imageInfo(buf: Buffer): { format: 'png' | 'webp' | 'unknown'; width: number; height: number; alpha: boolean } {
  if (buf.length > 33 && buf.readUInt32BE(0) === 0x89504e47) {
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), alpha: buf[25] === 6 }
  }
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fourcc = buf.toString('ascii', 12, 16)
    // 扩展格式：flags 的 0x10 位 = 有 alpha；画布尺寸是 24 位小端、存的是「减 1」
    if (fourcc === 'VP8X') {
      return {
        format: 'webp',
        width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
        height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
        alpha: (buf[20] & 0x10) !== 0,
      }
    }
    // 无损：隐式带 alpha，14 位宽 + 14 位高
    if (fourcc === 'VP8L') {
      const w4 = buf.readUInt32LE(21)
      return { format: 'webp', width: (w4 & 0x3fff) + 1, height: ((w4 >> 14) & 0x3fff) + 1, alpha: true }
    }
    // 有损简单格式：无 alpha，14 位宽高在帧头之后
    if (fourcc === 'VP8 ') {
      return {
        format: 'webp',
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
        alpha: false,
      }
    }
  }
  return { format: 'unknown', width: 0, height: 0, alpha: false }
}

console.log('== 1. 事件数据结构 ==')
assert(events.length === 63, `事件总数 63（实际 ${events.length}）`)
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
// 厨子的「粮食 -20%」已拆掉（见 utils/crewPerks 的说明）：
// 起始船队 2 份/天，打八折 1.6 取整还是 2，一份都不省。收益改为「补给时食物多给一半」。
assert(dailyFoodUse(2, 1) === 2, '起始船队 15 人：粮 2 份/天（这就是比例减免失效的量级）')
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
assert(CREW_CHARS.length === 15, `名船员共 15 位（8 + 第二批 7，实际 ${CREW_CHARS.length}）`)
assert(new Set(CREW_CHARS.map(c => c.id)).size === 15, '船员 id 不重复')
assert(CREW_CHARS.every(c => c.hireCost > 0 && c.perk.length > 5 && c.origin.length > 10 && c.quote.length > 5), '每人都有招募费/特长/来历/口头禅')
assert(CREW_CHAR_MAP.get('cook')?.perk.includes('30'), '厨子特长：补给食物 20 → 30（旧的比例减免已拆）')
assert(CREW_CHAR_MAP.get('scholar')?.perk.includes('20'), '学者特长：发现事件 +20%')
// 个人事件必须绑定 requiresCrew
const crewEvents = events.filter(e => e.type === 'crew')
assert(crewEvents.length === 15, `个人事件共 15 个（实际 ${crewEvents.length}）`)
assert(crewEvents.every(e => (e.triggerCondition.requiresCrew ?? []).length === 1), '每个个人事件绑定一名船员')
const charIds = new Set(CREW_CHARS.map(c => c.id))
assert(crewEvents.every(e => charIds.has(e.triggerCondition.requiresCrew![0])), 'requiresCrew 引用的都是真实船员')
const evTomDebt = crewEvents.find(e => e.id === 235)!
assert(!checkEventTrigger({ ...evTomDebt, triggerCondition: { ...evTomDebt.triggerCondition, probability: 1 } }, baseState), '老汤姆的旧账：无船员在船不触发')
assert(checkEventTrigger({ ...evTomDebt, triggerCondition: { ...evTomDebt.triggerCondition, probability: 1 } }, { ...baseState, crewRoster: [{ id: 'boatswain', loyalty: 60, hiredDay: 1 }] }), '老汤姆的旧账：汤姆在船即触发')
// 每个个人事件的所有结局都必须 crewEvent 指向本人
const ev235Outcomes = evTomDebt.choices.flatMap(c => c.outcomes)
assert(ev235Outcomes.every(o => o.crewEvent?.member === 'boatswain'), '老汤姆事件的所有结局都结算到本人')

/*
 * 【全员覆盖】每位名船员都必须有一桩个人事件。
 *
 * 这条是被现实教出来的：第二批 7 位船员接进玩法后，帮助面板上仍写着
 * "每人都有一桩个人事件等着你"，而他们一个都没有——玩家会等到一个不存在的东西。
 * 判据用**差集**（谁没有），不是数条数：15 条全挤在同一个人身上也能凑够数量。
 */
{
  const withEvent = new Set(crewEvents.map(e => e.triggerCondition.requiresCrew![0]))
  const missing = CREW_CHARS.filter(c => !withEvent.has(c.id))
  assert(missing.length === 0,
    `每位船员都有个人事件${missing.length ? '（缺：' + missing.map(c => c.name).join('、') + '）' : ''}`)

  // 结局必须结算到事件本人，不能把 A 的事记在 B 的忠诚上
  const wrongMember = crewEvents.filter(e => {
    const self = e.triggerCondition.requiresCrew![0]
    return e.choices.flatMap(c => c.outcomes).some(o => o.crewEvent?.member !== self)
  })
  assert(wrongMember.length === 0,
    `个人事件的结局都结算到本人${wrongMember.length ? '（错：' + wrongMember.map(e => e.id).join(',') + '）' : ''}`)

  // 每个个人事件都必须"有好有坏"：至少一个结局加忠诚、至少一个减。
  // 全是加分的选项等于没有选择——玩家只会挑选项文字最好看的那个。
  const oneSided = crewEvents.filter(e => {
    const ls = e.choices.flatMap(c => c.outcomes).map(o => o.crewEvent?.loyaltyChange ?? 0)
    return !ls.some(x => x > 0) || !ls.some(x => x < 0)
  })
  assert(oneSided.length === 0,
    `个人事件都有正反两面${oneSided.length ? '（只有单边：' + oneSided.map(e => e.id).join(',') + '）' : ''}`)

  /*
   * 触发条件真的认人：把概率钉到 1，该在船的人触发、不在船的人不触发。
   *
   * 这一条防的是**拼错 id**：requiresCrew 写的是 'naviagtor' 这种，
   * 上面的差集会报"缺人"，但如果同时把两个事件写成同一个人，差集也发现不了。
   * 逐个事件走一遍真实判定，才算验完。
   */
  const neverFires: number[] = []
  const firesWithoutCrew: number[] = []
  for (const e of crewEvents) {
    const who = e.triggerCondition.requiresCrew![0]
    const forced = { ...e, triggerCondition: { ...e.triggerCondition, probability: 1 } }
    if (!checkEventTrigger(forced, { ...baseState, crewRoster: [{ id: who, loyalty: 60, hiredDay: 1 }] })) {
      neverFires.push(e.id)
    }
    if (checkEventTrigger(forced, baseState)) firesWithoutCrew.push(e.id)
  }
  assert(neverFires.length === 0, `每个个人事件在其船员在船时都能触发${neverFires.length ? '（不触发：' + neverFires.join(',') + '）' : ''}`)
  assert(firesWithoutCrew.length === 0, `没有那人在船时不触发${firesWithoutCrew.length ? '（误触发：' + firesWithoutCrew.join(',') + '）' : ''}`)
}

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
  const CREW_IDS = ['boatswain', 'gunner', 'purser', 'chaplain', 'scholar', 'cook', 'midshipman', 'corsair',
    'navigator', 'medic', 'carpenter', 'interpreter', 'guide', 'merchant', 'pathfinder'] as const
  const OFFICER_IDS = ['pilot', 'quartermaster', 'surgeon'] as const
  const RIVAL_IDS = ['blackjack', 'maria', 'diego']

  // 映射全覆盖：14 个槽位一个不能少
  for (const id of CREW_IDS) assert(!!crewPortrait(id), `船员 ${id} 有肖像`)
  for (const id of OFFICER_IDS) assert(!!officerPortrait(id), `军官 ${id} 有肖像`)
  for (const id of RIVAL_IDS) assert(!!rivalPortrait(id), `竞争船长 ${id} 有肖像`)
  // 14 个槽位的肖像互不重复（一人一像）
  const allPortraits = [...CREW_IDS, ...OFFICER_IDS].map(id => (id === 'pilot' || id === 'quartermaster' || id === 'surgeon' ? officerPortrait(id as typeof OFFICER_IDS[number]) : crewPortrait(id as typeof CREW_IDS[number])))
    .concat(RIVAL_IDS.map(rivalPortrait))
  assert(new Set(allPortraits).size === 21, `21 个槽位使用 21 张不同肖像（15 船员 + 3 军官 + 3 对手，实际 ${new Set(allPortraits).size} 张）`)

  // 文件存在且尺寸合规（单人像 512×640 RGBA，场景 d01-d04 ~1200×675，d05-d10 ~840×315）
  const pubDir = process.cwd()
  // 14 个槽位 → 14 张独立单人像（E1-E14 全集语义文件名；图鉴切片 e01-e14 退为备用，仍在盘上）
  const PORTRAIT_FILES: Array<[string, string | undefined]> = [
    ['crew_boatswain.webp', crewPortrait('boatswain')],
    ['crew_gunner.webp', crewPortrait('gunner')],
    ['crew_purser.webp', crewPortrait('purser')],
    ['crew_chaplain.webp', crewPortrait('chaplain')],
    ['crew_scholar.webp', crewPortrait('scholar')],
    ['crew_cook.webp', crewPortrait('cook')],
    ['crew_midshipman.webp', crewPortrait('midshipman')],
    ['crew_blackflag_guide.webp', crewPortrait('corsair')],
    ['officer_pilot.webp', officerPortrait('pilot')],
    ['officer_first_mate.webp', officerPortrait('quartermaster')],
    ['officer_surgeon.webp', officerPortrait('surgeon')],
    ['rival_black_sail_jack.webp', rivalPortrait('blackjack')],
    ['rival_silver_maria.webp', rivalPortrait('maria')],
    ['rival_stareyed_diego.webp', rivalPortrait('diego')],
  ]
  for (const [file, mapped] of PORTRAIT_FILES) {
    assert(!!mapped && mapped.endsWith(file), `槽位映射指向 ${file}`)
    const p = join(pubDir, 'public', 'assets', 'portraits', file)
    assert(existsSync(p), `肖像 ${file} 存在`)
    const buf = readFileSync(p)
    /*
     * 断言「能解析 + 尺寸对 + 不是占位空文件」。
     *
     * 原断言是 `buf[25] === 6`（PNG 的 RGBA 色型）。实测这 14 张**全是 100% 不透明**
     * （alpha 全 255，画面是油画背景而不是抠图人物），所以那条从来没有真正检查过什么，
     * 只是在验一个编码细节。换成 WebP 后编码器直接省掉了无用的 alpha 通道，
     * 反而把"这条断言没意义"这件事暴露了。
     */
    const info = imageInfo(buf)
    assert(info.format !== 'unknown', `肖像 ${file} 是可解析的图片（${info.format}）`)
    assert(info.width === 512 && info.height === 640, `肖像 ${file} 为 512×640（实际 ${info.width}×${info.height}）`)
    assert(buf.length > 8000, `肖像 ${file} 有实际内容（${Math.round(buf.length / 1024)}KB，非占位图）`)
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
    const patched = storm.replace(/d01\.webp$/, 'd01-v2.webp')
    assert(patched !== storm, '构造一个「补齐后的新地址」')
    assert(shouldUseSceneImage(storm, patched), '素材补齐（地址变化）后真图自动恢复')
    assert(!shouldUseSceneImage(null, undefined), '无素材的场景直接走手绘 SVG')
    assert(!shouldUseSceneImage('x', undefined), '无素材的场景不受失败状态影响')
  }
  // D1-D14：全部为 1200×675 高清事件图（D1-D4 来自事件大图包；D5-D10 为主包升级版，取代旧图鉴切片；
  //          D11-D14 为第二批 P1 补充的四个高频场景）
  for (let i = 1; i <= 14; i++) {
    const name = `d${String(i).padStart(2, '0')}`
    const p = join(pubDir, 'public', 'assets', 'scenes', `${name}.webp`)
    assert(existsSync(p), `场景 ${name}.webp 存在`)
    const info = imageInfo(readFileSync(p))
    assert(info.width > 1000 && info.width < 1400 && info.height > 500 && info.height < 800, `场景 ${name} 高清尺寸合规（${info.width}×${info.height}）`)
  }
  /*
   * 第二批 P2：9 枚徽记（4 派系 + 5 特质）。
   * 原来 SVG 与 PNG 各留一份、两条都断言存在；实测代码（data/badges.ts）只引用 .svg，
   * PNG 那 9 份（合计 0.79MB）是死文件，已移进 `unused-assets/legacy/assets/ui/`。
   * 现在只断言**真正被加载的 .svg**，并顺带确认它是个 SVG（防止放个空文件）。
   */
  for (const file of [
    'faction_crown', 'faction_guild', 'faction_scholars', 'faction_brethren',
    'trait_merchant', 'trait_bulwark', 'trait_leader', 'trait_explorer', 'trait_surgeon',
  ]) {
    const svgP = join(pubDir, 'public', 'assets', 'ui', `${file}.svg`)
    assert(existsSync(svgP), `徽记 ${file}.svg 存在`)
    const head = readFileSync(svgP, 'utf8').slice(0, 120)
    assert(/<svg[\s>]/.test(head), `徽记 ${file}.svg 是有效 SVG（开头：${head.slice(0, 40)}）`)
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
  /*
   * C 组港口：五张 1600×900 场景图 —— **只保留 WebP 版**。
   * 原来这里断言的是同名 .png（每张 2MB+，合计 11.3MB），而代码引用的一直是 .webp；
   * 那批 PNG 已移进 `unused-assets/legacy/`（产物因此从 34MB 降到 19MB）。
   * 现在断言的必须是**真正被加载的那个文件**，否则守卫在守一个没人用的东西。
   */
  const PORT_FILES = ['port_caribbean', 'port_northern_europe', 'port_seville', 'port_southeast_asia', 'port_west_africa']
  for (const stem of PORT_FILES) {
    for (const ext of ['webp']) {
      const file = `${stem}.${ext}`
      const p = join(pubDir, 'public', 'assets', 'ports', file)
      assert(existsSync(p), `港口 ${file} 存在`)
      const buf = readFileSync(p)
      // WebP 三种容器的尺寸位置不同，与上面 harbor_europe 的解析保持同一套
      const tag = buf.subarray(12, 16).toString('ascii')
      let w = 0, h = 0
      if (tag === 'VP8X') { w = buf.readUIntLE(24, 3) + 1; h = buf.readUIntLE(27, 3) + 1 }
      else if (tag === 'VP8 ') { w = buf.readUInt16LE(26) & 0x3fff; h = buf.readUInt16LE(28) & 0x3fff }
      else if (tag === 'VP8L') { const bits = buf.readUInt32LE(21); w = (bits & 0x3fff) + 1; h = ((bits >> 14) & 0x3fff) + 1 }
      assert(w === 1600 && h === 900, `港口 ${file} 为 1600×900（实际 ${w}×${h}）`)
      const kb = Math.round(buf.length / 1024)
      assert(kb <= 400, `港口 ${file} ≤400KB（实际 ${kb}KB；PNG 原图是 2MB+）`)
    }
  }
  // 20 个港口全部有图，且抽样式对位正确
  for (const port of ports) {
    assert(!!portImage(port.id), `港口 ${port.nameCn}(${port.id}) 有场景图`)
  }
  assert(portImage(6).endsWith('port_seville.webp'), '塞维利亚用专属图')
  assert(portImage(7).endsWith('port_seville.webp'), '里斯本（伊比利亚）共用塞维利亚图')
  assert(portImage(8).endsWith('port_northern_europe.webp'), '伦敦（北欧）用北欧图')
  // 第四批：8 个港口有了专属立绘（此前加勒比 7 港共用一张）
  assert(portImage(1).endsWith('port_havana.webp'), '哈瓦那用专属图')
  assert(portImage(2).endsWith('port_port_royal.webp'), '皇家港用专属图')
  assert(portImage(3).endsWith('port_nassau.webp'), '拿骚用专属图')
  assert(portImage(10).endsWith('port_cape_town.webp'), '开普敦用专属图')
  assert(portImage(11).endsWith('port_goa.webp'), '果阿用专属图')
  assert(portImage(13).endsWith('port_cartagena.webp'), '卡塔赫纳用专属图')
  assert(portImage(14).endsWith('port_veracruz.webp'), '韦拉克鲁斯用专属图')
  assert(portImage(18).endsWith('port_macau.webp'), '澳门用专属图')
  // 没做专属图的港口仍退回区域图（不能让它们变成空图）
  assert(portImage(4).endsWith('port_caribbean.webp'), '托尔图加仍用加勒比区域图')
  assert(portImage(9).endsWith('port_west_africa.webp'), '埃尔米纳用西非图')
  assert(portImage(12).endsWith('port_southeast_asia.webp'), '马六甲用东南亚图')
  /*
   * 【专属图不得互相撞车】这是这一批素材的意义所在：
   * 之前 7 个港口共用一张画，跑一圈只看过 5 张图。
   * 判据用**去重后的张数**，不是逐个 if——后者漏掉一个新港口也不会报错。
   */
  {
    const ids = ports.map(p => p.id)
    const covers = ids.map(id => portImage(id)!)
    const distinct = new Set(covers).size
    // 改造前是 5 张（加勒比 7 港共用一张）。专属 8 张进来后是 13 张。
    // 断言写"至少 13"而不是"等于 20"：剩下的 12 港本来就该共用区域图，
    // 要求 20 张等于要求这 12 港也各有专属图——那是还没做的内容，不是 bug。
    assert(distinct >= 13, `20 个港口用 ${distinct} 张不同的图（改造前只有 5 张）`)
  }
  /*
   * 【岸上整屏背景：必须是全景图，不能拿 96px 缩略图放大】
   *
   * 这条守卫防的是"图能显示就算过"的假绿：port_seville.webp 在面板里当 96px
   * 缩略图完全够用，可铺满 1440~1920 的整屏就是一团涂抹，玩家认不出这是哪。
   * 判据四条：
   *   ① 伊比利亚三港的 backdrop 指向 harbor_europe，且与缩略图**不是同一张**；
   *   ② 文件真实存在，WebP 头解出来的原生宽 ≥1600（不许降级替换）；
   *   ③ 体积 ≤600KB（原始无损是 2.7MB，首屏背景不能这个量级）；
   *   ④ 没配全景的港口回落到 portImage，不能变空图。
   */
  {
    const HB = ['harbor_europe.webp']
    for (const id of [6, 7, 20]) {
      const u = harborBackdrop(id)
      assert(!!u && u.endsWith(HB[0]), `港口 ${id} 的岸上背景用全景图（${u}）`)
      assert(u !== portImage(id), `港口 ${id} 的全景图与面板缩略图是两张（不是同一文件）`)
    }
    // 没配全景的港口必须回落，不能 undefined
    for (const port of ports) {
      assert(!!harborBackdrop(port.id), `港口 ${port.nameCn} 的岸上背景有值（回落或全景）`)
    }
    assert(harborBackdrop(8) === portImage(8), '未配全景的港口（伦敦）回落到缩略图，行为不变')

    const p = join(pubDir, 'public', 'assets', 'ports', HB[0])
    assert(existsSync(p), '全景图 harbor_europe.webp 存在')
    const buf = readFileSync(p)
    assert(buf.subarray(0, 4).toString('ascii') === 'RIFF', '全景图是 WebP 容器')
    // VP8X（扩展）/ VP8 （有损）/ VP8L（无损）三种头的尺寸位置不同，逐个分支解
    let w = 0, h = 0
    const tag = buf.subarray(12, 16).toString('ascii')
    if (tag === 'VP8X') {
      w = buf.readUIntLE(24, 3) + 1
      h = buf.readUIntLE(27, 3) + 1
    } else if (tag === 'VP8 ') {
      w = buf.readUInt16LE(26) & 0x3fff
      h = buf.readUInt16LE(28) & 0x3fff
    } else if (tag === 'VP8L') {
      const bits = buf.readUInt32LE(21)
      w = (bits & 0x3fff) + 1
      h = ((bits >> 14) & 0x3fff) + 1
    }
    assert(w >= 1600, `全景图原生宽 ≥1600（实际 ${w}×${h}）`)
    assert(h >= 900, `全景图原生高 ≥900（实际 ${w}×${h}）`)
    const kb = Math.round(buf.length / 1024)
    assert(kb <= 600, `全景图体积 ≤600KB（实际 ${kb}KB；原始无损是 2.7MB，别直接塞回去）`)
  }
  // G 组天气层：四张 1024² 带透明通道（雨/雾/飞沫/云）—— alpha 是硬需求，丢了会出黑框
  for (const [key, url] of Object.entries(FX_ASSETS)) {
    const file = url.split('/').pop()!
    const p = join(pubDir, 'public', 'assets', 'fx', file)
    assert(existsSync(p), `天气层 ${file}（${key}）存在`)
    const info = imageInfo(readFileSync(p))
    assert(info.width === 1024 && info.height === 1024, `天气层 ${file} 为 1024×1024（实际 ${info.width}×${info.height}）`)
    assert(info.alpha, `天气层 ${file} 带透明通道（${info.format}；丢了会在海面上盖出黑框）`)
  }
  // H 组结局背景：三张 1920×1080（不透明全幅背景）
  for (const [key, url] of Object.entries(BG_ASSETS)) {
    const file = url.split('/').pop()!
    const p = join(pubDir, 'public', 'assets', 'bg', file)
    assert(existsSync(p), `背景 ${file}（${key}）存在`)
    const info = imageInfo(readFileSync(p))
    assert(info.width === 1920 && info.height === 1080, `背景 ${file} 为 1920×1080（实际 ${info.width}×${info.height}）`)
    assert(info.format !== 'unknown', `背景 ${file} 是可解析的图片（${info.format}）`)
  }
}

console.log('== 28. UI 装饰资产（F1-F6）==')
{
  const pubDir = process.cwd()
  // 文件名 → 期望尺寸；羊皮纸为不透明，其余五张带 Alpha（叠在面板/地图上，丢了会出黑底）
  const UI_FILES: Array<[string, number, number, boolean]> = [
    ['ui_parchment.webp', 1024, 1024, false],
    ['ui_frame_gold.webp', 512, 512, true],
    ['ui_compass_rose.webp', 512, 512, true],
    ['ui_banner.webp', 488, 152, true],
    ['ui_pennants.webp', 431, 128, true],
    ['ui_medal.webp', 210, 417, true],
  ]
  for (const [file, w, h, hasAlpha] of UI_FILES) {
    const p = join(pubDir, 'public', 'assets', 'ui', file)
    assert(existsSync(p), `UI 资产 ${file} 存在`)
    const info = imageInfo(readFileSync(p))
    assert(info.width === w && info.height === h, `UI 资产 ${file} 尺寸 ${w}×${h}（实际 ${info.width}×${info.height}）`)
    assert(info.alpha === hasAlpha, `UI 资产 ${file} ${hasAlpha ? '带' : '不带'}透明通道（实际 ${info.alpha}，${info.format}）`)
  }

  // 边框衍生件：九宫格切片源 + 单独切出的中央装饰
  // 关键约束：九宫格源的"中央区域"必须全透明，否则 border-image 的 fill/9-slice
  // 会把船徽、贝壳拉长铺进内容区，盖住最后一个选项按钮。
  const slicePath = join(pubDir, 'public', 'assets', 'ui', 'ui_frame_gold_slice.webp')
  assert(existsSync(slicePath), '边框九宫格源 ui_frame_gold_slice.webp 存在')
  {
    const info = imageInfo(readFileSync(slicePath))
    assert(info.width === 512 && info.height === 512, `边框九宫格源尺寸 512×512（实际 ${info.width}×${info.height}）`)
    assert(info.alpha, `边框九宫格源带透明通道（${info.format}；中央必须透明，否则 border-image 会把装饰拉进内容区）`)
  }
  for (const f of ['ui_frame_crest.webp', 'ui_frame_shell.webp']) {
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
  /*
   * 剧本数量：1 段开场 + 13 段彩蛋。
   *
   * 这条断言的价值不是"数字要对"，而是**防止内容被悄悄删掉**：
   * 曾经这里写的是 1（全游戏只有开场三句），而 14 张立绘早就躺在素材里
   * 没进过一句台词。数量掉回去时必须有人解释。
   */
  assert(DIALOGUE_SCRIPTS.length === 24,
    `剧本表 24 段（1 段开场 + 23 段彩蛋），实得 ${DIALOGUE_SCRIPTS.length}`)
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
  // 厨子的收益不在每日消耗上（那条已经拆掉），所以这里必须与无厨子时完全相同
  const rCook = dailyRates(sailingFleet, 'rush')
  assert(rCook.foodPerDay === rRush.foodPerDay,
    `厨子不再改变每日耗粮（仍是 ${rCook.foodPerDay} 份/天；他的收益在补给时多给一半）`)
  assert(rCook.waterPerDay === 8, '厨子不碰淡水')

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

  /*
   * 「撒哈拉长树」回归锁。
   *
   * 根因不是撒点算法，是「低于 PEAK_MIN_ELEV 就不出山 → **改成树**」这条规则：
   * 撒哈拉腹地高程实测 0.10，刚好在 0.12 下面，于是整片沙漠的山全变成了树。
   * 「不是山就是树」这个二选一，把「不该有符号」的地方填满了。
   *
   * 判据用纬度带（ARID_BAND 15°~35°）。双向断言，缺一不可：
   *   · 平移到 20°N → 一个 tree 都不能有；
   *   · 原来那块赤道 L 形 → 必须还有 tree。只断言前者的话，把树整个删掉也能过。
   */
  const shift = (lat: number) => ({
    type: 'FeatureCollection' as const,
    features: square.features.map(f => ({
      ...f,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [f.geometry.coordinates[0].map(([lng, la]: [number, number]) => [lng, la + lat])],
      },
    })),
  })
  const arid = buildTerrainSymbols(shift(20), { topBlocks: 1 })
  assert(arid.length > 0, `干旱带也要撒出符号（实得 ${arid.length}）`)
  const aridTrees = arid.filter(s => s.kind === 'tree')
  assert(aridTrees.length === 0, `副热带干旱带（15°~35°）不许有树（实得 ${aridTrees.length} 棵）`)
  assert(symbols.some(s => s.kind === 'tree'), '赤道附近必须还有树（别把树一刀切光）')

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

  /*
   * 团簇（clusterStrength）：让山脉成簇、平原留白。
   *
   * 两条断言缺一不可：
   *   ① 符号数必须变少（否则等于没生效）；
   *   ② 保留下来的符号坐标必须与"不团簇"时**逐个相同**——
   *      也就是说团簇只允许"择掉"，不允许"挪位置"。
   * 第 ② 条是这次改动的关键约束：如果实现里改成用 rand() 判团簇，
   * 每多一次随机数消耗都会让后面所有点整体错位，山会整片跳走。
   * 用户看到的会是"地形变了"，而不是"地形稀疏了"。
   */
  const dense = buildTerrainSymbols(square, { clusterStrength: 0 })
  const clumped = buildTerrainSymbols(square, { clusterStrength: 1 })
  assert(clumped.length > 0, `团簇后仍应有符号（实得 ${clumped.length}）`)
  assert(clumped.length < dense.length,
    `团簇后符号应变少（${dense.length} → ${clumped.length}）`)
  const denseKeys = new Set(dense.map(s => `${s.lat},${s.lng}`))
  const moved = clumped.filter(s => !denseKeys.has(`${s.lat},${s.lng}`))
  assert(moved.length === 0,
    `团簇只能择掉符号、不能挪动位置（挪了 ${moved.length} 个）`)
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

  // —— 4) 同样条件换成船长模式：跨段同样不弹（问卷只发生在出航时）——
  //
  // 【这条以前断言的是"船长模式跨段必弹"，现在反过来了】
  // 改成"每趟只在出航时问一次方针"之后，两种模式在**跨段**这一点上没有区别；
  // 真正的模式差异在出航那一刻：船长会弹第 0 段抉择 + 操舵，参观两样都不弹
  // （见本组 1)、2) 两条）。所以这里保留"跨段不弹"的断言，
  // 模式分流由 1)/2) 继续守住，判断力没有丢。
  useGameStore.setState({
    gameMode: 'captain', fleet: { ...mkFleet(), isSailing: true }, currentRoute: route,
    segmentCount: 4, segmentIndex: 0, pendingSegment: null, gamePhase: 'playing', stance: 'steady',
  })
  useGameStore.getState().syncSegmentBoundary(0.5)
  const capSeg = useGameStore.getState()
  assert(capSeg.segmentIndex === 1, '船长模式跨段后段号 +1')
  assert(capSeg.pendingSegment === null, '船长模式跨段也不再弹方针（每趟只问一次）')
  assert(capSeg.gamePhase === 'playing', '船长模式跨段后仍在航行阶段')

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


console.log('== 48. 船况配色：边界值必须落在正确的一档 ==')
{
  // 耐久：≤30% 危险、≤60% 提醒、其余正常
  assert(durabilityColor(0) === DANGER_COLOR, '耐久 0% 应为危险色')
  assert(durabilityColor(0.3) === DANGER_COLOR, '耐久正好 30% 应仍算危险（边界包含）')
  assert(durabilityColor(0.31) === WARN_COLOR, '耐久 31% 应升一档为提醒色')
  assert(durabilityColor(0.6) === WARN_COLOR, '耐久正好 60% 应仍算提醒')
  assert(durabilityColor(0.61) === SAFE_COLOR, '耐久 61% 应为正常色')
  assert(durabilityColor(1) === SAFE_COLOR, '耐久 100% 应为正常色')

  // 载重：只有 ≥95% 一档危险（空着跑和装八成都没有后果）
  assert(loadColor(0) === WARN_COLOR, '载重 0% 不该报危险')
  assert(loadColor(0.6) === WARN_COLOR, '载重 60% 不该报危险')
  assert(loadColor(0.94) === WARN_COLOR, '载重 94% 仍不该报危险')
  assert(loadColor(0.95) === DANGER_COLOR, '载重正好 95% 应报危险（边界包含）')
  assert(loadColor(1) === DANGER_COLOR, '满载必须报危险')

  // 两种规则不能混：耐久在 50% 是提醒色，载重在 50% 也是提醒色，
  // 但耐久在 20% 该红、载重在 20% 不该红 —— 这条能抓住"把两个函数写成一个"
  assert(durabilityColor(0.2) === DANGER_COLOR && loadColor(0.2) === WARN_COLOR,
    '耐久与载重的危险阈值不同，不能共用一个函数')
}

console.log('== 49. 贸易价差：同港卖价必须永远低于买价（禁止原地套利）==')
{
  /*
   * 【为什么这条必须存在】
   * 买价是 × priceMultiplier、卖价是 ÷ priceMultiplier —— 两边都朝"对玩家有利"
   * 的方向。mult 一旦足够小（高声望），除法的加价就会吃掉 15% 的价差并反超。
   * 实测修复前：
   *   fame=0   同港卖价 > 买价 0 / 99
   *   fame=50  **92 / 99**
   *   fame=100 **97 / 99**（哈瓦那丝绸买 286 卖 336）
   * 玩家可以在原地反复买卖赚钱，一步不用挪 —— 整条贸易线的意义就没了。
   *
   * 这条断言遍历全部港口商品组合，是"经济能不能成立"的底线。
   */
  for (const fame of [0, 50, 100]) {
    useGameStore.getState().initGame('merchant', 'captain')
    useGameStore.setState({ fleet: { ...useGameStore.getState().fleet, fame } })
    const st = useGameStore.getState()
    let bad = 0
    let checked = 0
    for (const pg of portGoods) {
      const buy = selectBuyPrice(st, pg.portId, pg.goodId)
      const sell = selectSellPrice(st, pg.portId, pg.goodId)
      if (buy == null || sell == null) continue
      checked++
      if (sell >= buy) {
        bad++
        if (bad <= 3) console.log(`       [fame=${fame}] 港${pg.portId} 货${pg.goodId} 买${buy} 卖${sell}`)
      }
    }
    assert(checked >= 90, `应覆盖绝大部分组合（fame=${fame} 实际 ${checked} 个）`)
    assert(bad === 0, `fame=${fame} 不应有卖价≥买价的组合（实际 ${bad}/${checked}）`)
  }
}

console.log('== 50. 卖价随本港库存单调下降（库存过剩要压价）==')
{
  /*
   * 修复前 dynamicSellPrice 用 `Math.min(1, 库存/基准)`，把"库存过剩"全截成 1，
   * 于是卖得越多、本港越满，卖价一分不降（实测加的斯库存 30→90，卖价恒 219）。
   * 现在改成 1/(1+超出比例×0.55)，这条断言锁住单调性。
   */
  const pg = { price: 210, priceModifier: 1.6 }
  const baseStock = 30
  const stocks = [30, 45, 60, 90, 150]
  const prices = stocks.map(stock => dynamicSellPrice(pg, stock, baseStock))
  for (let i = 1; i < prices.length; i++) {
    assert(prices[i] < prices[i - 1],
      `库存 ${stocks[i]} 的卖价应低于库存 ${stocks[i - 1]}（实得 ${prices.join(' / ')}）`)
  }
  // 库存恰好等于基准时，不享受过剩折扣（surge 应为 1）
  assert(dynamicSellPrice(pg, baseStock, baseStock) === Math.round(pg.price * pg.priceModifier * 0.85),
    '库存等于基准时卖价不打折')
  // 缺货仍按原逻辑涨价（最高 +40%）
  assert(dynamicSellPrice(pg, 0, baseStock) > dynamicSellPrice(pg, baseStock, baseStock),
    '缺货时卖价应更高')
  // 无论库存多大，价格都不能变成 0 或负数
  assert(dynamicSellPrice(pg, 100000, baseStock) > 0, '库存极大时卖价仍应为正')
}

console.log('== 51. 掮客推荐：卡片说的利润必须等于实际到账 ==')
{
  /*
   * 【为什么这条最重要】
   * 这张卡是新玩家看到的第一个"具体收益承诺"（+670 金）。它一旦和实际结算分叉，
   * 就成了这个项目最忌讳的东西：屏幕上的数字在骗人。
   * 所以不只断言"有推荐"，而是**真的走一遍买卖，把金币差额和卡片数字对账**。
   * 任何一环改了取价来源（比如有人图快用 good.basePrice），这里必然失败。
   */
  useGameStore.getState().initGame('merchant', 'captain')
  const S = () => useGameStore.getState()
  const deal = selectBestDeal(S())
  assert(deal !== null, '开局在塞维利亚应当有推荐（否则卡片不出现，新手又没人指路）')
  if (deal) {
    assert(deal.qty >= 1, `推荐数量应为正（实际 ${deal.qty}）`)
    assert(deal.unitProfit > 0, `单位利润应为正（实际 ${deal.unitProfit}）`)
    assert(deal.nm > 0 && deal.days >= 1, `航程与天数应为正（${deal.nm}nm / ${deal.days}天）`)

    // —— 天数必须与出航计划面板同口径（第 33 轮）——
    //
    // 【为什么这条不能省】掮客卡与出航计划面板都在报「N 天」，玩家点一下卡
    // 就会看到面板上的天数。原先两边口径不同：卡片用 calculateSailingDays
    // （**不含天候倍率**），面板用「按部就班 × 天候」。于是暴风雨里卡片写
    // 「3 天」、面板写「约 6 天可达」——差一倍，点一下就发现界面自己打自己。
    //
    // 现在两边都走 utils/voyage.voyageDays，所以这里要逐字相等。
    const fromPort = ports.find(p => p.id === S().fleet.currentPortId!)!
    const toPort = ports.find(p => p.id === deal.toPortId)!
    const facts = routeFacts([fromPort.latitude, fromPort.longitude], [toPort.latitude, toPort.longitude])
    assert(facts.distanceNm === deal.nm,
      `掮客卡的航程必须是真实避陆弧长（卡 ${deal.nm}，航线 ${facts.distanceNm}）`)
    const expectDays = voyageDays({
      distanceNm: deal.nm,
      windFavor: facts.windFavor,
      fleet: S().fleet,
      officers: S().officers,
      weather: S().weather,
    })
    assert(deal.days === expectDays,
      `掮客卡的天数必须与出航计划面板同口径（卡 ${deal.days}，期望 ${expectDays}）`)

    // 卡片价 == 面板取价（同一来源）
    assert(deal.buy === selectBuyPrice(S(), S().fleet.currentPortId!, deal.goodId), '卡片买价必须等于面板买价')
    assert(deal.sell === selectSellPrice(S(), deal.toPortId, deal.goodId), '卡片卖价必须等于目标港卖价')

    // 真的买卖一次，对账
    const from = S().fleet.currentPortId!
    const gold0 = S().fleet.gold
    S().buyGood(from, deal.goodId, deal.qty)
    useGameStore.setState({ fleet: { ...S().fleet, currentPortId: deal.toPortId } })
    S().sellGood(deal.toPortId, deal.goodId, deal.qty)
    const actual = S().fleet.gold - gold0
    assert(actual === deal.totalProfit,
      `实际到账必须等于卡片利润（卡片 ${deal.totalProfit}，实际 ${actual}）`)
  }

  // 航行中不该推荐（人不在港口）
  useGameStore.setState({ fleet: { ...S().fleet, isSailing: true } })
  assert(selectBestDeal(S()) === null, '航行中不应给出推荐')
  // 不在港口也不该推荐
  useGameStore.setState({ fleet: { ...S().fleet, isSailing: false, currentPortId: null } })
  assert(selectBestDeal(S()) === null, '不在港口时不应给出推荐')
}

console.log('== 51b. 掮客卡的天数必须含天候（暴风雨里不得与面板差一倍） ==')
{
  /*
   * 【为什么单开一段】
   * 上面那条「天数 == voyageDays」在晴天有侥幸通过的可能——晴天天候倍率是 1，
   * 旧口径（calculateSailingDays，不含天候）算出来恰好一样。
   * 所以这里专门造一次暴风雨：天候倍率 0.55 × 0.85 = 0.4675，
   * 旧口径必然对不上。这一段才是那条断言真正的**区分力**所在。
   *
   * 【为什么换到埃尔米纳做这一趟】
   * 开局在塞维利亚时推荐的那一单只有 54 海里 / 1 天——暴风雨下 ceil(0.67) 还是 1，
   * 新旧口径都是 1 天，测不出任何东西。必须挑一条**长途**：
   * 埃尔米纳 → 里斯本 2157 海里 / 晴天 13 天 / 暴风雨约 28 天，差一倍多。
   *
   * 【顺便锁住「门槛不受天候影响」】
   * 推荐门槛 MIN_DEAL_PROFIT_PER_DAY 用的是不含天候的天数，那是**平衡参数**，
   * 改它会改变"推哪一单"——属于设计决定，不该顺手改。
   * 所以天候只影响**显示天数**，不影响推不推这一单、也不影响推去哪一单。
   */
  useGameStore.getState().initGame('merchant', 'captain')
  const S = () => useGameStore.getState()
  // 埃尔米纳（9）——它的推荐单是长途，天气对天数才有放大效应
  useGameStore.setState({
    fleet: { ...S().fleet, currentPortId: 9 },
    weather: { ...S().weather, kind: 'clear' },
  })

  const clearDeal = selectBestDeal(S())
  assert(clearDeal !== null, '埃尔米纳应有推荐')
  if (clearDeal) {
    const clearDays = clearDeal.days
    assert(clearDays >= 3,
      `这条长途单晴天也该有几天（实际 ${clearDays} 天）——否则下面的天候断言没有区分力`)
    const fromPort = ports.find(p => p.id === S().fleet.currentPortId!)!
    const toPort = ports.find(p => p.id === clearDeal.toPortId)!
    const facts = routeFacts([fromPort.latitude, fromPort.longitude], [toPort.latitude, toPort.longitude])

    useGameStore.setState({ weather: { ...S().weather, kind: 'storm' } })
    const stormDeal = selectBestDeal(S())
    assert(stormDeal !== null, '暴风雨里仍应有推荐（门槛按不含天候的利润/天算，不该被天候挡住）')
    if (stormDeal) {
      assert(stormDeal.toPortId === clearDeal.toPortId,
        `天候不该改变推荐去哪（晴天 ${clearDeal.toPortId}，暴风雨 ${stormDeal.toPortId}）`)
      assert(stormDeal.days > clearDays,
        `暴风雨里天数必须变多（晴天 ${clearDays}，暴风雨 ${stormDeal.days}）`)

      // 旧写法：不含天候的 calculateSailingDays —— 显示天数若等于它，说明没含天候
      const oldWay = calculateSailingDays({
        id: -1, fromPortId: fromPort.id, toPortId: toPort.id,
        distance: stormDeal.nm, dangerLevel: 2, windFavor: facts.windFavor,
      }, S().fleet, S().officers)
      assert(stormDeal.days !== oldWay,
        `暴风雨里显示天数若等于旧口径（${oldWay} 天），说明没有含天候`)
      assert(stormDeal.days === voyageDays({
        distanceNm: stormDeal.nm, windFavor: facts.windFavor,
        fleet: S().fleet, officers: S().officers, weather: S().weather,
      }), '暴风雨里的显示天数仍必须走 voyageDays')
    }
    // 复原天候，别污染后面的用例
    useGameStore.setState({ weather: { ...S().weather, kind: 'clear' } })
  }
}

console.log('== 52. 航行节奏：方针只问一次、操舵只在第一段强制 ==')
{
  /*
   * 【这条锁的是什么】
   * 实测新玩家第一分钟：到地图后 12 秒内被 7 个全屏层打断（出航计划 → 方针 1/2 →
   * 操舵 → 方针 2/2 …），75 秒里一分钱没进账。4399 的教训是"同一类问题不反复问"。
   *
   * 现在：第一段问一次方针 + 弹一次操舵（保证机制被见过），
   * 之后每跨一段只推进段号 + 一条飘字，不再弹全屏层；
   * 想改方针 / 想操舵，船上有常驻按钮（openStancePicker / requestHelm）。
   *
   * 这几条断言直接对着"弹层次数"写，改回每段必弹会立刻失败。
   */
  const mkShip = () => ({ id: 1, name: '圣玛利亚号', type: 'caravel' as const, speed: 5, durability: 80, maxDurability: 100, capacity: 100, usedCapacity: 0, crew: 20, maxCrew: 40 })
  const mkFleet = (): Fleet => ({ id: 1, name: '测试舰队', gold: 500, fame: 0, morale: 60, food: 100, water: 100, currentPortId: 6, isSailing: false, day: 10, ships: [mkShip()], cargo: [], flagshipId: 1, trait: null, durabilityCarry: 0 })
  // 距离要够长，否则 confirmDeparture 会按天数把段数压成 2 段（段数由 segmentCountFor 决定）
  const route: Route = { id: -99, fromPortId: 6, toPortId: 7, distance: 6000, dangerLevel: 2, windFavor: 1 }
  const waypoint = { latitude: 40, longitude: -10, portId: 7 }
  const S = () => useGameStore.getState()

  // —— 第一段：出航即问方针，选完进操舵（机制必须被见过）——
  useGameStore.setState({
    gameMode: 'captain', fleet: mkFleet(), pendingVoyage: { waypoint, route },
    shipPosition: [20, -20], segmentCount: 4, segmentIndex: 0, pendingSegment: null,
    pendingHelm: null, gamePhase: 'playing',
  })
  S().confirmDeparture()
  assert(S().pendingSegment !== null, '出航后应立刻问一次方针（第 0 段）')
  S().chooseStance('steady')
  assert(S().pendingHelm !== null, '第一段选完方针应强制弹一次操舵')
  assert(S().gamePhase === 'helm', `第一段应进入操舵阶段（实际 ${S().gamePhase}）`)
  S().skipHelmRun()
  assert(S().gamePhase === 'playing' && S().pendingHelm === null, '跳过操舵后回到航行')

  // 段数由距离/天数决定，测试不能写死；按真实段数取边界
  const nSeg = S().segmentCount
  assert(nSeg >= 3, `测试航线应分成至少 3 段（实际 ${nSeg}）`)
  const cross = (i: number) => nextSegmentBoundary(i, nSeg) + 0.02

  // —— 第一次跨段：不再弹（本趟唯一的问卷发生在出航时）——
  S().syncSegmentBoundary(cross(0))
  assert(S().segmentIndex === 1, `第一次跨段应到第 1 段（实际 ${S().segmentIndex}）`)
  assert(S().pendingSegment === null, '第一次跨段**不该**弹方针（2 段航线也只问一次）')
  assert(S().gamePhase === 'playing', `跨段后应仍在航行（实际 ${S().gamePhase}）`)

  // —— 后续跨段：只推进段号，不再弹任何全屏层 ——
  S().syncSegmentBoundary(cross(1))
  assert(S().segmentIndex === 2, `第二次跨段到第 2 段（实际 ${S().segmentIndex}）`)
  assert(S().pendingSegment === null, '第二次跨段**不该**再弹方针面板')
  assert(S().gamePhase === 'playing', '跨段后仍在航行阶段')

  S().syncSegmentBoundary(cross(2))
  assert(S().segmentIndex === 3, `第三次跨段到第 3 段（实际 ${S().segmentIndex}）`)
  assert(S().pendingSegment === null, '第三次跨段也不该弹面板')

  // 方针沿用上一次的选择，不会被重置
  assert(S().stance === 'steady', `方针应沿用出航时的选择（实际 ${S().stance}）`)

  // —— 船上按钮：想改方针 / 想操舵，随时能开 ——
  S().openStancePicker()
  assert(S().pendingSegment !== null, '「改方针」按钮应能主动打开面板')
  assert(S().gamePhase === 'segment', '主动打开时应暂停航行')
  S().chooseStance('steady')
  assert(S().gamePhase === 'playing', '选完继续航行')
  assert(S().pendingHelm === null, '主动改方针不应顺带弹操舵')

  S().requestHelm()
  assert(S().pendingHelm !== null, '「亲手掌舵」按钮应能召唤操舵')
  assert(S().gamePhase === 'helm', '召唤后进入操舵阶段')
}

console.log('== 53. 卸货卡片：说的金额必须等于实际到账；不值得的单不推荐 ==')
{
  /*
   * 第一笔钱的闭环里，"卖"这一头也必须对账。
   * 卡片写「全部出手 · +1095」，点下去金币就必须涨 1095 —— 少一分都是骗人。
   */
  useGameStore.getState().initGame('merchant', 'captain')
  const S = () => useGameStore.getState()
  const deal = selectBestDeal(S())
  assert(deal !== null, '开局应有推荐')
  if (deal) {
    const from = S().fleet.currentPortId!
    S().buyGood(from, deal.goodId, deal.qty)
    useGameStore.setState({ fleet: { ...S().fleet, currentPortId: deal.toPortId } })

    const sale = selectCargoSale(S())
    assert(sale !== null, '带着货到港后应有卸货报价')
    if (sale) {
      assert(sale.qty === deal.qty, `卸货数量应等于买入数量（${sale.qty} vs ${deal.qty}）`)
      assert(sale.total === deal.sell * deal.qty,
        `卸货金额应等于卖价×数量（${sale.total} vs ${deal.sell * deal.qty}）`)

      const gold0 = S().fleet.gold
      for (const it of sale.items) S().sellGood(deal.toPortId, it.goodId, it.qty)
      const actual = S().fleet.gold - gold0
      assert(actual === sale.total, `实际到账必须等于卡片金额（卡片 ${sale.total}，实际 ${actual}）`)
      assert(S().fleet.cargo.length === 0 || S().fleet.cargo.every(c => c.quantity === 0),
        '全部出手后货舱应为空')
    }

    // 卖空之后不该再给"卸货"卡
    assert(selectCargoSale(S()) === null, '货舱空时不应有卸货报价')
  }

  // 买不起时不推荐（否则卡片会让人点一个什么都不发生的按钮）
  useGameStore.getState().initGame('merchant', 'captain')
  useGameStore.setState({ fleet: { ...useGameStore.getState().fleet, gold: 1 } })
  assert(selectBestDeal(useGameStore.getState()) === null, '金只够 1 枚时不应推荐（买不起任何货）')

  // 舱位满时不推荐
  useGameStore.getState().initGame('merchant', 'captain')
  useGameStore.setState({
    fleet: {
      ...useGameStore.getState().fleet,
      ships: useGameStore.getState().fleet.ships.map(sh => ({ ...sh, usedCapacity: sh.capacity })),
    },
  })
  assert(selectBestDeal(useGameStore.getState()) === null, '货舱已满时不应推荐')
}

console.log('== 54. 回程建议：卖完货不能让人卡在"无推荐"里 ==')
{
  /*
   * 实测死胡同：在加的斯卖完丝绸后，本港唯一有正向差价的货是"丝绸→哈瓦那"（22 天）。
   * 对刚赚到 1170 金的新手，那不是建议。正确下一步是回采购地补货。
   * 这条测试锁两件事：
   *   ① arriveAtPort 必须把"从哪来"记进 lastPortId（currentRoute 会被清空）
   *   ② 回程建议指向的港口与天数必须真实
   */
  useGameStore.getState().initGame('merchant', 'captain')
  const S = () => useGameStore.getState()

  // 从塞维利亚出发到加的斯（20）
  useGameStore.setState({
    fleet: { ...S().fleet, currentPortId: 6, isSailing: true },
    currentRoute: { id: -9, fromPortId: 6, toPortId: 20, distance: 54, dangerLevel: 2, windFavor: 1 } as Route,
  })
  S().arriveAtPort(20)
  assert(S().lastPortId === 6, `到港后应记住来处（实际 ${S().lastPortId}）`)
  assert(S().currentRoute === null, '到港后 currentRoute 应清空（所以必须单独记 lastPortId）')

  const back = selectReturnLeg(S())
  assert(back !== null, '在加的斯应给出回程建议')
  if (back) {
    assert(back.toPortId === 6, `回程应指向塞维利亚（实际 ${back.toPortId}）`)
    assert(back.nm > 0 && back.days >= 1, `回程航程应为正（${back.nm}nm / ${back.days}天）`)

    // 回程提示也是一屏数字，点开的面板必须说同一个数（第 33 轮）
    const a = ports.find(p => p.id === S().fleet.currentPortId!)!
    const b = ports.find(p => p.id === back.toPortId)!
    const facts = routeFacts([a.latitude, a.longitude], [b.latitude, b.longitude])
    assert(facts.distanceNm === back.nm,
      `回程航程必须是真实避陆弧长（提示 ${back.nm}，航线 ${facts.distanceNm}）`)
    const expectDays = voyageDays({
      distanceNm: back.nm, windFavor: facts.windFavor,
      fleet: S().fleet, officers: S().officers, weather: S().weather,
    })
    assert(back.days === expectDays,
      `回程天数必须与出航计划面板同口径（提示 ${back.days}，期望 ${expectDays}）`)
  }

  // 回到塞维利亚后，回程建议反过来指向加的斯（说明它是"来处"而不是写死的）
  useGameStore.setState({
    fleet: { ...S().fleet, isSailing: true },
    currentRoute: { id: -8, fromPortId: 20, toPortId: 6, distance: 54, dangerLevel: 2, windFavor: 1 } as Route,
  })
  S().arriveAtPort(6)
  const back2 = selectReturnLeg(S())
  assert(back2 !== null && back2.toPortId === 20, `回塞维利亚后应建议回加的斯（实际 ${back2?.toPortId}）`)

  // 同一个港口不应建议回自己
  useGameStore.setState({ lastPortId: 6 })
  assert(selectReturnLeg(S()) === null, '所在地与来处相同时不应给回程建议')
}

console.log('== 55. 沿海擦边：跳过一格陆地，而不是整趟搁浅 ==')
{
  /*
   * 【为什么这条必须存在】
   * 航线是搜出来并做过穿陆校验的，但"8 海里的直线"和"掩码格"不是一个量级：
   * 一段 15km 的斜线可以擦过岬角一格的角，两端采样点都在海里。
   * 于是船会在自己规划的航线上报"前方是陆地，被迫停航"——
   * 实测在塞维利亚→加的斯 47% 处出现过，玩家带着货被搁在半路。
   *
   * 这段逻辑原来埋在帧循环里，触发依赖 dt 抖动，跑十次未必复现一次。
   * 抽成纯函数后，用合成陆地就能把每种情形测死。
   */
  // 一条 100 海里的直线航线，坐标就是里程本身（方便断言）
  const posAt = (nm: number): [number, number] => [nm, 0]

  // —— 1) 一路是海：正常推进，不擦边不触礁 ——
  const clear = advanceAlongRoute({
    fromNm: 10, stepNm: 8, totalNm: 100,
    posAt, isLand: () => false, lookaheadNm: 12,
  })
  assert(clear.traveledNm === 18, `正常推进应走满一步（实际 ${clear.traveledNm}）`)
  assert(!clear.grazed && !clear.aground, '全是海时不该擦边也不该触礁')

  // —— 2) 擦角：只有一格（18~19）是陆地，后面又是海 ——
  const graze = advanceAlongRoute({
    fromNm: 10, stepNm: 8, totalNm: 100,
    posAt, isLand: (lat) => lat >= 18 && lat < 19, lookaheadNm: 12,
  })
  assert(!graze.aground, '只擦过一格陆地时不该判触礁')
  assert(graze.grazed, '应当标记为"擦边跳过"')
  assert(graze.traveledNm === 19, `应跳到那一格之后的第一个海面点（实际 ${graze.traveledNm}）`)

  // —— 3) 真撞上：从落点起一直是陆地 ——
  const blocked = advanceAlongRoute({
    fromNm: 10, stepNm: 8, totalNm: 100,
    posAt, isLand: (lat) => lat >= 18, lookaheadNm: 12,
  })
  assert(blocked.aground, '前方连续 12 海里都是陆地时必须判触礁')
  assert(blocked.traveledNm === 10, `触礁时里程不能推进（实际 ${blocked.traveledNm}）`)

  // —— 4) 前瞻为 0 = 旧行为：擦一格也直接触礁 ——
  const noGrace = advanceAlongRoute({
    fromNm: 10, stepNm: 8, totalNm: 100,
    posAt, isLand: (lat) => lat >= 18 && lat < 19, lookaheadNm: 0,
  })
  assert(noGrace.aground, '把宽容关掉后，擦一格也应判触礁（证明这个参数真的在起作用）')

  // —— 5) 不能越过终点：最后一步最多推进到 totalNm ——
  const tail = advanceAlongRoute({
    fromNm: 95, stepNm: 8, totalNm: 100,
    posAt, isLand: () => false, lookaheadNm: 12,
  })
  assert(tail.traveledNm === 100, `推进不得超过航线总长（实际 ${tail.traveledNm}）`)

  // —— 6) 擦边跳过的距离必须受前瞻上限约束 ——
  const farLand = advanceAlongRoute({
    fromNm: 10, stepNm: 8, totalNm: 100,
    posAt, isLand: (lat) => lat >= 18 && lat < 40, lookaheadNm: 12,
  })
  assert(farLand.aground, '陆地宽度超过前瞻距离时必须触礁（不能横穿半岛）')
}

console.log('== 56. 3D 自适应分辨率：只降不升、单帧尖峰不误判 ==')
{
  /*
   * 【这条锁的是什么】
   * 初始 pixelRatio 是 min(devicePixelRatio, 1.5)。2 倍屏上等于 2.25 倍像素，
   * 核显（实测 Intel UHD 630）从 27ms/帧 掉到 20fps 以下。
   * 降档本身要稳：判错一次，玩家看到的就是画面莫名变糊或反复抖。
   */
  const fill = (n: number, ms: number) => Array.from({ length: n }, () => ms)

  // —— 1) 样本不足不决策（一次加载抖动不能当依据）——
  assert(decidePixelRatio(1.5, fill(MIN_SAMPLES - 1, 60)) === null,
    `样本不足 ${MIN_SAMPLES} 帧时不应降档`)

  // —— 2) 本来就流畅：不动 ——
  assert(decidePixelRatio(1.5, fill(40, 15)) === null, '15ms/帧（60fps）不应降档')

  // —— 3) 刚好在阈值上：不动（> 才算慢，等于不算）——
  assert(decidePixelRatio(1.5, fill(40, SLOW_FRAME_MS)) === null,
    `帧时正好 ${SLOW_FRAME_MS}ms 时不应降档`)

  // —— 4) 持续慢：降一档，且只降一档 ——
  const slow = decidePixelRatio(1.5, fill(40, 30))
  assert(slow !== null && Math.abs(slow - (1.5 - PIXEL_RATIO_STEP)) < 1e-9,
    `30ms/帧应降到 ${1.5 - PIXEL_RATIO_STEP}（实际 ${slow}）`)

  // —— 5) 已经到下限：不再降（1 以下会明显模糊）——
  assert(decidePixelRatio(1, fill(40, 30)) === null, 'pixelRatio 1 时不应再降')
  assert(decidePixelRatio(0.9, fill(40, 30)) === null, '低于 1 时不应再降')

  // —— 6) 关键：单帧尖峰（GC / 贴图上传）不能触发降档 ——
  // 40 帧里 39 帧 15ms、1 帧 500ms：中位数仍是 15ms
  const spike = [...fill(39, 15), 500]
  assert(decidePixelRatio(1.5, spike) === null,
    '单帧 500ms 尖峰不应触发降档（否则偶尔卡一下就永久变糊）')

  // —— 7) 一步到下限：1.5 直接降到 1，不经过 1.25 ——
  // 中间档实测约 33ms（仍超阈值），必然继续降，只是多糊一次而已。
  const once = decidePixelRatio(1.5, fill(40, 40))!
  assert(once === 1, `1.5 应一步降到 1（实际 ${once}）`)
  assert(decidePixelRatio(once, fill(40, 40)) === null, '到 1 后停止')
}

console.log('== 57. 3D 点击判定：手指抖动不该让航向设不上 ==')
{
  /*
   * 【这条锁的是什么】
   * 原来的判据是"每帧增量绝对值之和 < 5"。手指按下-抬起本意是点，但会有
   * 3~5px 的游走，累加后超过阈值 —— 实测（CDP 真实触摸序列，390×844）：
   *   抖动 2,2px → 算点击；**抖动 4,3px → 判成拖拽**，航向设不上。
   * 玩家看到的是"点了海面没反应"，功能像是坏的。
   * 现在改成净位移（起点→终点）+ 按设备分阈值。
   */
  const tap = (o: Partial<Parameters<typeof isTapGesture>[0]>) => isTapGesture({
    pointerType: 'touch', startX: 100, startY: 100, endX: 100, endY: 100,
    pinched: false, eventType: 'pointerup', ...o,
  })

  // —— 鼠标：精确设备，5px 以内算点 ——
  assert(tap({ pointerType: 'mouse' }), '鼠标原地点击应算点击')
  assert(tap({ pointerType: 'mouse', endX: 103, endY: 102 }),
    `鼠标移动 ${TAP_SLOP_MOUSE}px 以内应算点击（净位移 3.6）`)
  assert(!tap({ pointerType: 'mouse', endX: 108, endY: 106 }),
    `鼠标移动 10px 应算拖拽（净位移 > ${TAP_SLOP_MOUSE}）`)

  // —— 触屏：同样的位移要算点击（这就是这次的修复点）——
  assert(tap({ endX: 106, endY: 105 }),
    '触屏抖动 6,5px（净位移 7.8）应算点击 —— 改前会被判成拖拽')
  assert(!tap({ endX: 112, endY: 108 }),
    `触屏移动 14px 应算拖拽（净位移 > ${TAP_SLOP_TOUCH}）`)
  // 触屏的容忍必须真的比鼠标宽，否则这次修改没有意义
  assert(TAP_SLOP_TOUCH > TAP_SLOP_MOUSE,
    '触屏的点击容忍必须大于鼠标（手指天然比鼠标抖）')

  // —— 捏合过就绝不是点击 ——
  // 两指缩放松手时坐标可能落回原点，不屏蔽会误触发"点海面设航向"
  assert(!tap({ pinched: true }), '捏合松手不应算点击')

  // —— pointercancel 不可能是点击（坐标不可靠、玩家本意不是点）——
  assert(!tap({ eventType: 'pointercancel' }), 'pointercancel 不应算点击')
  assert(!tap({ eventType: 'pointerdown' }), 'pointerdown 不应算点击')
}


/* ==========================================================================
 * 羊皮纸 pattern：图片绘制尺寸必须精确等于 pattern 单元
 *
 * 【为什么这条只能在这一层测】
 * 原来用的是美工给的 360px 位图：`<image width=360 x=-60 preserveAspectRatio=
 * "xMidYMid slice">` 被裁成中心 240px 铺进 240px 的单元。左右边缘取自原图的
 * 不同位置，于是每 240px 一道硬边（实测接缝落在 x=960 / y=480，正好是 240 的倍数）。
 *
 * 但在截图上**测不出来**：那道台阶只有 1.8 个亮度级，而纸张本身的斑驳起伏
 * 已经比它大。我试过"相邻列差的自相关"，用改前的截图跑 r=0.184 照样通过——
 * 判据没有区分力，留着就是假测试，所以删掉了，改在这里断言构造方式。
 * ========================================================================== */
{
  const html = landPaperPatternMarkup('data:image/png;base64,AAAA')

  assert(html.includes(`width="${PAPER_TILE}" height="${PAPER_TILE}">`),
    `pattern 单元尺寸必须是 ${PAPER_TILE}×${PAPER_TILE}`)

  const img = /<image[^>]*>/.exec(html)?.[0] ?? ''
  assert(img.includes(`width="${PAPER_TILE}"`) && img.includes(`height="${PAPER_TILE}"`),
    `图片的绘制尺寸必须精确等于单元尺寸（当前 ${img}）—— 差一个像素就会在边界露出原图的另一侧`)
  assert(img.includes('x="0"') && img.includes('y="0"'),
    '图片必须从单元原点开始画，偏移会把接缝推进画面中间')
  assert(!img.includes('slice'),
    '不允许 preserveAspectRatio="slice"：那会把图裁掉一圈，左右边缘来自原图不同位置')

  // sprite 必须原样用上（不能拼错引号，否则 pattern 空白、整块陆地变成纯色）
  assert(html.includes('href="data:image/png;base64,AAAA"'), 'sprite 的 href 必须原样写入')

  // 单元尺寸要够大：太小则大斑驳会周期性重复（256 时一屏只放两格，肉眼能认出）
  assert(PAPER_TILE >= 384, `单元边长 ${PAPER_TILE} 太小，大斑驳会周期性重复（要求 ≥384）`)
}


/* ==========================================================================
 * 等角航线网（rhumb lines）
 *
 * 这块是纯几何，可以精确断言——不需要截图。要守住的是三件事：
 *   ① 采样点必须**落在一条直线上**（墨卡托下等角航线是直线；不共线就说明
 *      投影/反投影写错了，画到屏幕上会是一条弯的"方位线"，等于说谎）；
 *   ② 方位角的方向要对（0° 朝北、90° 朝东）；
 *   ③ 高纬必须夹住（墨卡托在极点发散，不夹会渲染出 NaN 或飞出画面）。
 * ========================================================================== */
{
  const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
  const net = (center: [number, number], opt?: Parameters<typeof buildRhumbNetwork>[1]) =>
    buildRhumbNetwork(center, { steps: 1, bands: [1], ...opt })

  // —— ① 共线：首尾定义一条直线，中间点偏离必须 ≈ 0 ——
  {
    const rings = buildRhumbNetwork([38, -28], { steps: 8, bands: [0.5, 1] })
    let worst = 0
    for (const ring of rings) {
      for (const line of ring) {
        const p0 = [(line[0][1] * Math.PI) / 180, mercY(line[0][0])]
        const p1 = [(line[line.length - 1][1] * Math.PI) / 180, mercY(line[line.length - 1][0])]
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1]
        const len = Math.hypot(dx, dy)
        if (len < 1e-9) continue
        for (let i = 1; i < line.length - 1; i++) {
          const q = [(line[i][1] * Math.PI) / 180, mercY(line[i][0])]
          const dev = Math.abs((q[0] - p0[0]) * dy - (q[1] - p0[1]) * dx) / len
          if (dev > worst) worst = dev
        }
      }
    }
    assert(worst < 1e-9, `采样点必须共线（最大偏离 ${worst.toExponential(2)}）—— 不共线说明投影写错了，画出来是弯的`)
  }

  // —— ② 方位角 0 朝北、90 朝东 ——
  {
    const [north] = net([0, 0], { bearings: 4 }).flat()
    const [east] = net([0, 0], { bearings: 4 }).flat().slice(1)
    const endN = north[north.length - 1], endE = east[east.length - 1]
    assert(Math.abs(endN[1]) < 0.01 && endN[0] > 10,
      `方位角 0° 应基本沿经线向北（终点 ${endN}）`)
    assert(Math.abs(endE[0]) < 0.01 && endE[1] > 10,
      `方位角 90° 应基本沿纬线向东（终点 ${endE}）—— 墨卡托下正东是水平直线`)
  }

  // —— ③ 高纬夹住：极点上墨卡托发散，不夹会出现 Infinity/NaN ——
  {
    // 只取 8 个方位、2 段：断言数量够用即可，32×3 圈×5 点会刷出近千条重复断言，
    // 让"最终结果"的数字虚高（曾从 3081 涨到 4051，看着像加了 970 条测试）
    const rings = buildRhumbNetwork([80, 0], { radius: 3, steps: 2, bearings: 8 })
    for (const ring of rings) {
      for (const line of ring) {
        for (const [lat, lng] of line) {
          assert(Number.isFinite(lat) && Math.abs(lat) <= 85.001,
            `纬度必须夹在 ±85°（得到 ${lat}）`)
          assert(Number.isFinite(lng) && lng >= -180 && lng < 180,
            `经度必须折回 [-180,180)（得到 ${lng}）`)
        }
      }
    }
  }

  // —— 半径翻倍 → 端点必须更远（敏感度断言，防"参数不起作用"）——
  {
    const far = (r: number) => {
      const line = net([0, 0], { bearings: 4, radius: r }).flat()[0]
      return line[line.length - 1][0]
    }
    assert(far(1.2) > far(0.6) + 5,
      `半径翻倍端点纬度必须明显更远（0.6→${far(0.6).toFixed(1)}°, 1.2→${far(1.2).toFixed(1)}°）`)
  }

  // —— 罗经点必须都在开阔海面上（不能压到大港口的家门口，否则线会糊在岸线里）——
  {
    assert(RHUMB_CENTERS.length >= 3, '罗经点至少 3 个，否则默认视野里只有一束平行线，读不出"网"')
    for (const [lat, lng] of RHUMB_CENTERS) {
      assert(Math.abs(lat) < 60 && lng > -170 && lng < 170,
        `罗经点 (${lat},${lng}) 应当在开阔洋面且避开极点附近`)
    }
  }
}


/* ==========================================================================
 * 雪线：只有高纬的山才有雪顶
 *
 * 绘制层原来**无条件**给每座山画雪帽，于是撒哈拉、阿拉伯、印度的山尖上
 * 全是一撮白。这不是风格问题，是事实错误：热带石灰岩山不会有永久积雪。
 * 判据抽成纯函数（canvas 里断言不到像素级的"有没有雪"），在这里锁死。
 * ========================================================================== */
{
  assert(!hasSnow(25), '撒哈拉（25°N）的山不该有雪顶')
  assert(!hasSnow(0), '赤道不该有雪顶')
  assert(!hasSnow(-20), '南纬 20°（非洲南部）不该有雪顶')
  assert(!hasSnow(SNOW_LAT - 0.1), `雪线下方（${SNOW_LAT - 0.1}°）不该有雪顶`)
  assert(hasSnow(SNOW_LAT), `雪线上（${SNOW_LAT}°）应当有雪顶`)
  assert(hasSnow(62), '斯堪的纳维亚（62°N）应当有雪顶')
  // 南半球对称：火地岛/南极方向也该有雪
  assert(hasSnow(-55), '南纬 55° 应当有雪顶（雪线是纬度的绝对值）')
  // 防止有人把判据写成"只认北半球"
  assert(hasSnow(-60) === hasSnow(60), '南北半球必须对称')
}


/* ==========================================================================
 * 地形符号的缩放分级（rankMaxForZoom）
 *
 * 【守的是什么】符号是"1.1° 一格"撒出来的，屏幕间距 = 步长 × 像素/度。
 * 拉远不筛会糊成一片，拉近不加密就只剩十几座山（伊比利亚整块内陆实测过）。
 * 所以阈值的两条性质必须成立：**单调不减**（拉近不会反而变稀，也不会让
 * 已经出现的符号消失——嵌套），**放大后确实更密**。
 * ========================================================================== */
{
  const zs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const rs = zs.map(rankMaxForZoom)
  for (let i = 0; i < rs.length; i++) {
    assert(rs[i] > 0 && rs[i] <= 1, `zoom ${zs[i]} 的 rank 阈值必须在 (0,1]，实得 ${rs[i]}`)
    if (i > 0) assert(rs[i] >= rs[i - 1], `阈值必须随缩放单调不减：zoom ${zs[i - 1]} ${rs[i - 1]} → zoom ${zs[i]} ${rs[i]}`)
  }
  assert(rankMaxForZoom(10) === 1, '最大缩放必须全画')
  assert(rankMaxForZoom(2) < 0.1, `最远缩放必须只留很少一部分（实得 ${rankMaxForZoom(2)}）`)
  // 越界/异常输入要给一个可用的值，不能是 NaN（NaN 比较恒 false，会让过滤整段失效）
  assert(Number.isFinite(rankMaxForZoom(-5)) && rankMaxForZoom(-5) > 0, '缩放为负也要给出有效阈值')
  assert(rankMaxForZoom(NaN) === 1, 'NaN 缩放要退化成"全画"，不能变成 NaN 阈值')

  // 用一块够大的陆地量一遍：放大到 zoom 6 时画出来的符号必须明显多于 zoom 4
  const block40 = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[10, -10], [50, -10], [50, 30], [10, 30], [10, -10]]],
      },
    }],
  }
  const big = buildTerrainSymbols(block40, { maxSymbols: 100000 })
  const at4 = big.filter((s) => s.rank <= rankMaxForZoom(4)).length
  const at6 = big.filter((s) => s.rank <= rankMaxForZoom(6)).length
  assert(at6 > at4 * 1.8,
    `放大到 zoom 6 必须明显更密（zoom4 ${at4} 个 → zoom6 ${at6} 个，要求 ≥1.8×）`)
}


/* ==========================================================================
 * 港口名写在哪一侧（chooseLabelSides）
 *
 * 挨着的港口标签会叠在一起：实测「塞维利亚 × 加的斯」重叠 41×8px（zoom 4）、
 * 「伦敦 × 阿姆斯特丹」27×4px（先按 id 取模轮换时）。轮换与几何无关，
 * 解决一对就把冲突推到另一对。现在按"背离最近邻居"选边。
 *
 * 断言用的是**几何不变量**而不是具体返回值：标签方向与"指向邻居"的方向
 * 必须点积为负（即背对邻居）。写死返回值只能测到当前这 20 个港口。
 * ========================================================================== */
{
  const sides = chooseLabelSides(ports)

  // 方向 → 屏幕向量（北是 -y）
  const VEC: Record<string, [number, number]> = {
    top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0],
  }
  const rows = Object.entries(sides)
  assert(rows.length === ports.length, `每个港口都要有方位（${rows.length}/${ports.length}）`)
  for (const [, v] of rows) assert(v in VEC, `方位只能是 top/right/bottom/left，实得 ${v}`)

  // 每个有近邻的港口：选的方向必须背对最近的那个邻居
  for (const p of ports) {
    let nb = null
    let bestD = Infinity
    for (const q of ports) {
      if (q.id === p.id) continue
      const dLng = (q.longitude - p.longitude) * Math.cos((p.latitude * Math.PI) / 180)
      const dLat = q.latitude - p.latitude
      const d = Math.hypot(dLng, dLat)
      if (d < bestD) { bestD = d; nb = { dLng, dLat } }
    }
    if (!nb || bestD > 12) continue
    const v = VEC[sides[p.id]]
    // 邻居在屏幕上的方向向量（北 = -y）
    const [nx, ny] = [nb.dLng, -nb.dLat]
    const dot = v[0] * nx + v[1] * ny
    assert(dot < 0,
      `港口 ${p.id} 的标签必须背对最近邻居（点积 ${dot.toFixed(3)}，方位 ${sides[p.id]}）`)
  }

  // 两组实际冲突必须分开
  assert(sides[6] !== sides[20], `塞维利亚与加的斯必须不同侧（实得 ${sides[6]} / ${sides[20]}）`)
  assert(sides[8] !== sides[15], `伦敦与阿姆斯特丹必须不同侧（实得 ${sides[8]} / ${sides[15]}）`)
  // 塞维利亚在加的斯北边 → 塞维利亚写上面、加的斯写下面
  assert(sides[6] === 'top' && sides[20] === 'bottom',
    `南北相邻应一上一下（塞维利亚 ${sides[6]}、加的斯 ${sides[20]}）`)

  // 孤立的港口默认写上方
  const lone = chooseLabelSides([{ id: 1, latitude: 0, longitude: 0 }])
  assert(lone[1] === 'top', `附近没有别的港口时默认写上方（实得 ${lone[1]}）`)

  // 确定性：同样的输入两次必须一致（缩放平移时标签不能在两侧之间跳）
  const again = chooseLabelSides(ports)
  assert(ports.every((p) => again[p.id] === sides[p.id]), '同样的港口两次必须得到同样的方位')
}


/* ==========================================================================
 * 地形符号按高程"否决"山峰
 *
 * 【守的是什么】地形符号原来是纯随机决定山/树的，于是撒哈拉、亚马逊这些
 * 又平又低的地方也长满了山。高程数据能可靠回答的是"这里够高吗"，
 * 回答不了"山峰的准确位置"——所以只做否决：低于阈值的地方不许出山峰。
 *
 * 三个不变量：
 *   ① 否决**只改 kind，不挪位置**（随机序列不能因为改判而错位）；
 *   ② 采样失败（返回负数）等同于没给采样器，不能把地形整层清空；
 *   ③ 阈值之上的行为与没有采样器时**完全一致**（不凭空造山、也不额外删山）。
 * ========================================================================== */
{
  /*
   * 【这个方块为什么要挪到南半球】
   * 它原来跨 lat -10~30，正好穿过「副热带干旱带 15°~35° 不出树」那条新规则。
   * 那一步会在沙漠里删掉 tree，于是 elevationAt=()=>0（全部改判成 tree）之后
   * 数量必然变少 —— 本节的命题「高程否决只改种类、不删点」会被另一条**无关规则**带崩。
   * 挪到 -60~-40（南纬 40°~60°，南北对称地避开干旱带）之后，这里只考察高程否决本身。
   * 干旱带那条单独测（见第 46 节），两件事分开，判据才互不干扰。
   */
  const box = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[10, -60], [50, -60], [50, -40], [10, -40], [10, -60]]],
      },
    }],
  }
  const base = buildTerrainSymbols(box, { maxSymbols: 100000 })

  // ① 低位采样器：拒绝所有山峰，但位置必须一模一样
  const flat = buildTerrainSymbols(box, { maxSymbols: 100000, elevationAt: () => 0 })
  assert(flat.length === base.length,
    `否决只改种类、不删点（${base.length} → ${flat.length}）`)
  assert(flat.every((s, i) => s.lat === base[i].lat && s.lng === base[i].lng),
    '否决不允许挪动任何符号的位置——随机序列一旦错位，整片山的分布就变了')
  assert(flat.every(s => s.kind === 'tree'),
    `全部低于阈值时不该有山峰（实得 ${flat.filter(s => s.kind === 'peak').length} 个）`)

  // ② 采样失败：返回负数要等同于"没有高程数据"
  const failed = buildTerrainSymbols(box, { maxSymbols: 100000, elevationAt: () => -1 })
  assert(failed.length === base.length, '采样失败不能删点')
  assert(failed.every((s, i) => s.kind === base[i].kind),
    '采样失败时必须与"没有采样器"完全一致，不能悄悄把山全变成树')

  // ③ 高处采样器：与没有采样器时完全一致（不该凭空造山、也不该额外删山）
  const high = buildTerrainSymbols(box, { maxSymbols: 100000, elevationAt: () => 1 })
  assert(high.length === base.length && high.every((s, i) => s.kind === base[i].kind),
    '阈值之上必须与原始行为逐点一致')

  // ④ 阈值本身要落在"能分开平原和山地"的区间里，且被后面的人改坏时能立刻发现
  assert(PEAK_MIN_ELEV > 0.05 && PEAK_MIN_ELEV < 0.3,
    `峰值阈值 ${PEAK_MIN_ELEV} 落在实测有效区间（0.05~0.3）内`)
}

/*
 * 投影：极地纬度必须被夹在 Mercator 边界上。
 *
 * 【为什么值得单独测】这不是"数值精度"问题，是**画面级**的：
 * land.geojson 有 269 个顶点在 -89.999（南极绕极那一圈），
 * mercNorm 在这里数学上发散（tan→0、log→-∞），未夹住时 z ≈ 37，
 * 而海图边界只有 10 —— 2.5D 里从南沿拉出一张 27 单位长的米黄纸片，
 * 把屏幕左下角整块糊掉。
 *
 * 【为什么每一条都要有对照组】只断言"极地 = 10"是不够的：
 * 把 clampLat 写成"永远返回 ±85"也能过。所以同时断言赤道仍是 0、
 * 中间纬度仍然单调、UV 仍落在 [0,1]。
 */
{
  const SOUTH = latToWorldZ(-89.999)
  const NORTH = latToWorldZ(89.999)
  assert(Math.abs(SOUTH - MAP_WORLD_SIZE / 2) < 1e-6,
    `南极点必须夹到海图南沿 z=${MAP_WORLD_SIZE / 2}（实得 ${SOUTH.toFixed(3)}）`)
  assert(Math.abs(NORTH + MAP_WORLD_SIZE / 2) < 1e-6,
    `北极点必须夹到海图北沿 z=${-MAP_WORLD_SIZE / 2}（实得 ${NORTH.toFixed(3)}）`)
  // 夹的不能过头：赤道仍在地图纵向正中
  assert(Math.abs(latToWorldZ(0)) < 1e-9, `赤道仍在 z=0（实得 ${latToWorldZ(0)}）`)
  // 夹的边界要**正好**落在海图沿上，否则陆地会在地图外露出一条缝或压进海里
  assert(Math.abs(latToWorldZ(MERCATOR_LAT_LIMIT) + MAP_WORLD_SIZE / 2) < 1e-6,
    `Mercator 纬度上界必须正好落在海图北沿（实得 ${latToWorldZ(MERCATOR_LAT_LIMIT).toFixed(4)}）`)
  // 单调：北为负、越往北 z 越小（数组从 -85 排到 +85，所以 z 必须递减）
  const seq = [-85, -60, -30, 0, 30, 60, 85].map(latToWorldZ)
  assert(seq.every((v, i) => i === 0 || v < seq[i - 1]),
    `z 必须随纬度单调递减（实得 ${seq.map(v => v.toFixed(2)).join(' ')}）`)
  // 全部落在海图纵向范围内——几何越界就是从这条破了开始的
  assert(seq.every(v => v >= -MAP_WORLD_SIZE / 2 - 1e-6 && v <= MAP_WORLD_SIZE / 2 + 1e-6),
    '常量纬度必须都落在海图纵向范围内')
  assert([-89.999, -85, 0, 85, 89.999].every(l => {
    const v = mercNorm(l)
    return v >= -1e-9 && v <= 1 + 1e-9
  }), 'UV 的 v 必须在 [0,1]（超出会被 ClampToEdge 拉成一条糊边）')
  // 非有限输入不能把 NaN 传染进几何（NaN 顶点会让整块网格消失）
  assert(Number.isFinite(latToWorldZ(NaN)), 'NaN 纬度不能产出 NaN 世界坐标')
}

/*
 * 港口待机动画（青烟 / 海鸥 / 旗）的纯数学。
 *
 * 【为什么只测数学不测画面】这三样跑在 3D 帧循环里，帧循环没法测
 * （dt 不确定、无头浏览器 rAF 还慢）。而它们出错的典型形态恰恰是数学层的：
 * 相位同步（20 个港一起冒烟）、两端不归零（一片闪烁的圆点）、
 * 半径漂走（鸟越飞越远最后离开港口）。这些都能在纯函数里钉死。
 */
{
  /*
   * ① 烟：p 必须在 [0,1)；p→0 与 p→1 时几乎透明；rise / scale 是 p 的单调函数。
   *
   * 【为什么不能按 t 采样后断言"上升"】p = (t/周期 + 相位) % 1 —— t 增大的
   * 过程中 p 会绕回 0，rise 随之归零。第一版就是按 t 采一整个周期，
   * 正好跨过一次绕回，于是断言"必须持续上升"必然失败（实测 rise 差值 -0.01）。
   * 要钉的性质是"rise 随 p 单调"，所以按 p 排序后再断言。
   */
  {
    const many = [] as { p: number; rise: number; scale: number; alpha: number }[]
    for (const seed of [1, 7, 42]) {
      for (let i = 0; i < 120; i++) many.push(smokePose(0, i * 0.1, seed))
    }
    assert(many.every(s => s.p >= 0 && s.p < 1), '烟的周期位置必须落在 [0,1)')
    const byP = [...many].sort((a, b) => a.p - b.p)
    assert(byP.every((s, i) => i === 0 || s.rise >= byP[i - 1].rise - 1e-9),
      '烟的高度必须随 p 单调上升（同一缕不能中途回落）')
    assert(byP.every((s, i) => i === 0 || s.scale >= byP[i - 1].scale - 1e-9),
      '烟的体积必须随 p 单调变大（要散开）')
    assert(byP[byP.length - 1].rise - byP[0].rise > 0.2,
      `烟的高度变化必须明显（实得 ${(byP[byP.length - 1].rise - byP[0].rise).toFixed(2)}）`)
    // 两端淡出：取最靠近 p=0 与 p=1 的样本
    assert(byP[0].alpha < 0.12, `刚出生的烟必须几乎透明（实得 ${byP[0].alpha.toFixed(2)}）`)
    assert(byP[byP.length - 1].alpha < 0.12, `散尽前的烟必须几乎透明（实得 ${byP[byP.length - 1].alpha.toFixed(2)}）`)
    // 中段必须有浓度，否则整段都看不见
    assert(Math.max(...many.map(s => s.alpha)) > 0.7, '烟在中段必须足够浓（否则粒子白做）')
  }
  {
    const a = smokePose(0, 1.234, 1).p
    const b = smokePose(0, 1.234, 2).p
    assert(Math.abs(a - b) > 0.05, `不同港口的烟相位必须错开（实得 ${a.toFixed(2)} vs ${b.toFixed(2)}）`)
  }

  // ② 海鸥：绕港盘旋，半径不能漂走
  {
    const radius: number[] = []
    for (let i = 0; i < 60; i++) {
      const b = birdPose(0, i * 0.4, 3)
      radius.push(Math.hypot(b.dx, b.dz))
    }
    assert(Math.min(...radius) > 0.24 && Math.max(...radius) < 0.4,
      `海鸥半径必须在 0.24~0.4（实得 ${Math.min(...radius).toFixed(3)}~${Math.max(...radius).toFixed(3)}）`)
    const b = birdPose(0, 2.0, 3)
    assert(b.dy > 0.28 && b.dy < 0.38, `海鸥高度必须在房子与塔之间（实得 ${b.dy.toFixed(3)}）`)
    assert(Number.isFinite(b.yaw), '海鸥朝向不能是 NaN（会让实例矩阵变成 NaN，整批鸟消失）')
  }
  {
    /*
     * 两只鸟必须**反向**盘旋。
     *
     * 【判据为什么是角速度符号，而不是比较 yaw 数值】
     * 第一版比较的是两只鸟同一时刻的 yaw（|Δ|>0.5 或符号不同）——
     * 那是拿"数值巧合"当性质：相位不同时它们本来就会落在任意角度上，
     * 同向盘旋也可能碰巧通过，反向也可能碰巧失败。真正要保证的是
     * **绕行方向相反**，所以取同一只鸟前后 0.1 秒的极角差看符号。
     */
    const angAt = (i: number, t: number) => {
      const b = birdPose(i, t, 3)
      return Math.atan2(b.dz, b.dx)
    }
    /** 极角差折回 (-π, π]，避免跨 ±π 时符号翻转 */
    const delta = (i: number) => {
      const d = angAt(i, 1.1) - angAt(i, 1.0)
      return Math.atan2(Math.sin(d), Math.cos(d))
    }
    assert(Math.sign(delta(0)) === -Math.sign(delta(1)),
      `同港两只海鸥必须反向盘旋（实得角速度 ${delta(0).toFixed(3)} / ${delta(1).toFixed(3)}）`)
  }

  // ③ 旗：摆动幅度有界，且不能是常数
  {
    const ys = Array.from({ length: 40 }, (_, i) => flagYaw(i * 0.05, 5))
    assert(Math.max(...ys.map(Math.abs)) < 0.45, '旗的摆幅必须小于 0.45 rad（再大就像抽筋）')
    assert(Math.max(...ys) - Math.min(...ys) > 0.2, '旗必须真的在动（幅度不能塌成常数）')
  }
}

/*
 * 彩蛋对白：触发规则。
 *
 * 【为什么这些必须逐条测边界】彩蛋的判断全是阈值（水 24/25、耐久 39/40、
 * 分数 79/80）。差一格的条件在手动试玩里永远不会被发现——要么一直不弹，
 * 要么一直弹。而且 pickDialogue 有一个"看起来对、用起来错"的陷阱：
 * 规则表顺序决定优先级，改一行顺序就可能让"没水了"被"停在港口"抢先。
 */
{
  const base: DialogueContext = {
    day: 5, gold: 500, fame: 0, morale: 70, water: 80,
    durability: 100, currentPortId: null, portHasShipyard: false,
    discoveredCount: 2, weatherKind: 'clear', seen: ['opening_pilot'],
    isSailing: false, crewCount: 2, crewMax: 8, completedTasks: 0,
    lit: 0.9, wellStocked: false,
  }
  const withSeen = (c: Partial<DialogueContext>, seen: string[] = ['opening_pilot']) =>
    ({ ...base, ...c, seen })

  // ① 一切正常 → 不该弹任何东西（否则玩家一开局就被打断）
  assert(pickDialogue(base) === null, '状态健康时不该弹彩蛋')

  // ② 阈值边界：水 24 弹、25 不弹
  assert(pickDialogue(withSeen({ water: 24 })) === 'egg_low_water', '淡水 24 必须弹"按滴数"那段')
  assert(pickDialogue(withSeen({ water: 25 })) === null, '淡水 25 不该弹（边界必须是严格小于）')

  // ③ 优先级：同时缺水 + 缺士气 + 船破 → 先说缺水（会死人）
  assert(pickDialogue(withSeen({ water: 10, morale: 10, durability: 10 })) === 'egg_low_water',
    '多条同时成立时，缺水必须优先（规则表顺序即优先级）')

  // ④ 看过的跳过，不会重复播
  assert(pickDialogue(withSeen({ water: 10 }, ['opening_pilot', 'egg_low_water'])) === null,
    '同一段彩蛋不能重播（dialogueSeen 里有就必须跳过）')

  // ⑤ 额度：开场之后头两天不给弹，第 3 天才给
  assert(pickDialogue(withSeen({ day: 1, water: 10 })) === null, '第 1 天不给弹彩蛋（额度未到）')
  assert(pickDialogue(withSeen({ day: 2, water: 10 })) === null, '第 2 天仍不给弹（彩蛋不是每日提示）')
  assert(pickDialogue(withSeen({ day: 3, water: 10 })) === 'egg_low_water', '第 3 天开始可以弹第一段')
  /*
   * 间隔守卫：旧额度是 2+2×，第二天就弹第二段、之后每两天一段。
   * 配合事件卡和海上异闻，玩家一天被打断两三次（用户反馈"弹窗太多"）。
   * 这条断言钉死"两段之间至少隔 4 天"，防止以后有人顺手把它调回去。
   */
  assert(dialogueBudget(3) - dialogueBudget(2) >= 4,
    `彩蛋间隔至少 4 天（第 ${dialogueBudget(2)} 天 → 第 ${dialogueBudget(3)} 天）`)
  // 看过 4 段之后，下一次要等到 day >= 3 + 4×3 = 15
  const four = ['opening_pilot', 'egg_low_water', 'egg_damaged', 'egg_low_morale']
  assert(pickDialogue(withSeen({ day: 14, durability: 10 }, four)) === null,
    '已看 4 段时第 14 天额度还不够（应为 day≥15）')
  /*
   * 第 15 天额度到位、船也确实破（durability 10），但"船破"那段已经看过 ——
   * 此时必须沿规则表顺延到下一段成立的（第 12 天之后那条），而不是重播。
   * （改额度时这条从"什么都不弹"变成"顺延"，因为 day 15 已经越过 egg_long_voyage 的门槛。）
   */
  assert(pickDialogue(withSeen({ day: 15, durability: 10 }, four)) === 'egg_long_voyage',
    '额度到位但船破那段已看过 → 顺延到"第 12 天之后"那段，绝不重播')
  // 顺延：额度到位、前面几条不成立，就沿规则表往下找
  assert(pickDialogue(withSeen({ day: 15, discoveredCount: 8 }, four)) === 'egg_many_ports',
    '额度到位后应沿规则表顺延到"发现 6 港"那段')

  // ⑥ 修船计划只在"停在能修的港口"时成立
  assert(pickDialogue(withSeen({ durability: 60, currentPortId: 3, portHasShipyard: false })) !== 'egg_shipyard',
    '港口不能修船时不该提"船坞就在那儿"')
  assert(pickDialogue(withSeen({ durability: 60, currentPortId: 3, portHasShipyard: true })) === 'egg_shipyard',
    '停在能修船的港口且耐久 60 时必须提船坞')

  // ⑥b 新一批规则：处境类必须**先于**通用类触发（风暴 > 夜航 > 停靠）
  {
    const ctx = (c: Partial<DialogueContext>) => withSeen(c)
    assert(pickDialogue(ctx({ isSailing: true, weatherKind: 'storm' })) === 'egg_storm_chaplain',
      '海上遇到风暴时必须先谈风暴')
    assert(pickDialogue(ctx({ isSailing: true, lit: 0.1 })) === 'egg_night_helm',
      '夜航（日照 0.1）必须触发罗盘/星星那段')
    // 停泊时不该谈夜航：isSailing=false 时 lit 再低也不触发
    assert(pickDialogue(ctx({ isSailing: false, lit: 0.05, currentPortId: null, day: 5 })) === null,
      '停泊时不能触发夜航那段（否则白天看"夜里别盯着罗盘"就穿帮了）')
    // 船员为 0 才说"除了你我没人了"
    assert(pickDialogue(ctx({ crewCount: 0, day: 5 })) === 'egg_no_crew', '没船员时要说"船上没人"')
    assert(pickDialogue(ctx({ crewCount: 1 })) !== 'egg_no_crew', '有 1 个船员时不能说"船上没人"')
    // 招满 + 至少 3 人才说"吊床轮着睡"
    assert(pickDialogue(ctx({ crewCount: 8, crewMax: 8 })) === 'egg_full_crew', '招满时要说吊床那段')
    assert(pickDialogue(ctx({ crewCount: 2, crewMax: 8 })) !== 'egg_full_crew', '没招满时不该说招满的话')
    assert(pickDialogue(ctx({ crewCount: 2, crewMax: 2 })) !== 'egg_full_crew',
      '编制只有 2 人时不该说"打赢的那一方"（门槛是 ≥3）')
    // 仓库充足只在海上说（停泊时本来就该补给，不算新闻）
    assert(pickDialogue(ctx({ isSailing: true, wellStocked: true })) === 'egg_stocked',
      '海上且补给充足时聊"舱里塞满了"')
    assert(pickDialogue(ctx({ isSailing: false, wellStocked: true })) !== 'egg_stocked',
      '停泊时不说"舱里塞满了"')
    // 大额门槛
    /*
     * 【同一字段的阈值必须按降序排，否则被低门槛那条吃掉】
     * 这里成对断言：高门槛选中"高那条"，中门槛选中"低那条"。
     * 只断言高门槛那条的话，把顺序调反（12000 排到 2500 后面）照样能过 ——
     * 因为 2500 那条会先命中，测试就变成了"断言一个错误的结果"。
     */
    assert(pickDialogue(ctx({ gold: 12000 })) === 'egg_rich_maria',
      '金币 12000 时选中玛丽亚那条（高门槛在前）')
    assert(pickDialogue(ctx({ gold: 3000 })) === 'egg_rich_blackjack',
      '金币 3000 时选中杰克那条（没到玛丽亚的门槛）')
    assert(pickDialogue(ctx({ fame: 45 })) === 'egg_fame_jack',
      '声望 45 时选中杰克那条（高门槛在前）')
    assert(pickDialogue(ctx({ fame: 25 })) === 'egg_fame_maria',
      '声望 25 时选中玛丽亚那条')
    assert(pickDialogue(ctx({ discoveredCount: 11 })) === 'egg_ten_ports',
      '发现 11 港时选中"十座港口"那条')
    assert(pickDialogue(ctx({ discoveredCount: 7 })) === 'egg_many_ports',
      '发现 7 港时选中"六座港口"那条')
    assert(pickDialogue(ctx({ day: 55 })) === 'egg_day50', '第 55 天选中"五十天"那条')
    assert(pickDialogue(ctx({ day: 21 })) === 'egg_stars_diego', '第 21 天选中"数星星"那条')
    assert(pickDialogue(ctx({ day: 50 })) === 'egg_day50', '第 50 天有迭戈那段')
    assert(pickDialogue(ctx({ completedTasks: 1 })) === 'egg_first_task', '完成第一个委托后有对白')
    assert(pickDialogue(ctx({ discoveredCount: 10 })) === 'egg_ten_ports', '发现 10 港后有对白')
  }

  // ⑦ 写得再漂亮，只要没进规则表就等于不存在
  assert(unreachableScripts().length === 0,
    `所有剧本都必须能被触发（漏掉：${unreachableScripts().join(',')}）`)

  // ⑧ 规则表里的 id 必须真的在剧本表里（否则 pickDialogue 会静默跳过）
  const scriptIds = new Set(DIALOGUE_SCRIPTS.map(x => x.id))
  const ghost = DIALOGUE_RULES.filter(r => !scriptIds.has(r.id)).map(r => r.id)
  assert(ghost.length === 0, `规则表里有不存在的剧本 id：${ghost.join(',')}`)

  // ⑨ 每个说话人都必须登记过，否则对话框里没有立绘也没有名字
  const missingSpeaker = DIALOGUE_SCRIPTS.filter(x => !SPEAKERS[x.speakerId]).map(x => x.id)
  assert(missingSpeaker.length === 0, `有剧本的说话人没登记：${missingSpeaker.join(',')}`)

  // ⑩ 14 张立绘必须都进过 SPEAKERS（"素材没用上"这条要能被测出来）
  assert(Object.keys(SPEAKERS).length >= 14,
    `说话人登记数应覆盖 14 个角色（实得 ${Object.keys(SPEAKERS).length}）`)
  const noPortrait = Object.values(SPEAKERS).filter(sp => !sp.portrait).map(sp => sp.id)
  assert(noPortrait.length === 0, `说话人缺立绘：${noPortrait.join(',')}`)
}

/*
 * NPC 商船的航行动力学（按时刻求位置，无状态）。
 *
 * 【要钉的三件事】① 里程永远不越界（越界会让 positionAtNm 钳到端点、
 * 船"贴在港口上不动"）；② 折返是三角波：端点处位置连续，只有方向翻转；
 * ③ 同一时刻问两次答案必须完全相同（2D 与 2.5D 各问一次，必须一致）。
 */
{
  const TOTAL = 420
  const SPD = 20

  // ① 位移 = 速度 × 时间（从相位 0 出发）
  {
    const a = npcLegAt(TOTAL, SPD, 0, 0)
    const b = npcLegAt(TOTAL, SPD, 0, 2000)
    assert(Math.abs(a.posNm - 0) < 1e-9, `t=0 必须从起点出发（实得 ${a.posNm}）`)
    assert(Math.abs(b.posNm - 40) < 1e-9, `2 秒应前进 40 海里（实得 ${b.posNm}）`)
  }
  // ② 折返：越过终点后方向翻转，且位置连续、不越界
  {
    const T = 5 // 秒到终点（100 海里 / 20 nm/s）
    const before = npcLegAt(100, SPD, 0, T * 1000 - 100)
    const at = npcLegAt(100, SPD, 0, T * 1000)
    const after = npcLegAt(100, SPD, 0, T * 1000 + 100)
    assert(before.sign === 1 && after.sign === -1, '越过终点后必须掉头')
    assert(Math.abs(at.posNm - 100) < 1e-6, `端点处必须在终点（实得 ${at.posNm}）`)
    // 位置连续：端点前后各 0.1 秒，里程差 ≤ 2 海里（而不是跳回 0）
    assert(Math.abs(before.posNm - after.posNm) < 3,
      `折返处位置必须连续（${before.posNm.toFixed(2)} → ${after.posNm.toFixed(2)}）`)
  }
  // ③ 长时间（一整天）不越界
  {
    let ok = true
    for (let ms = 0; ms < 86400_000; ms += 7_919) {
      const st = npcLegAt(TOTAL, SPD, 0.3, ms)
      if (!(st.posNm >= 0 && st.posNm <= TOTAL)) ok = false
    }
    assert(ok, '一整天内里程必须始终落在 [0, 总里程]')
  }
  // ④ 同一时刻问两次，答案必须逐位相同（这就是 2D/3D 一致的保证）
  {
    const a = npcLegAt(TOTAL, SPD, 0.42, 12_345)
    const b = npcLegAt(TOTAL, SPD, 0.42, 12_345)
    assert(a.posNm === b.posNm && a.sign === b.sign, '同一时刻两次查询必须完全一致')
  }
  // ⑤ 退化输入不许产出 NaN
  {
    const st = npcLegAt(0, SPD, 0, 1000)
    assert(Number.isFinite(st.posNm) && st.posNm === 0, '航程为 0 时位置必须是 0，不能 NaN')
  }

  // ⑥ 姿态：端点位置必须等于几何端点，朝向必须有限且在 0~360
  {
    const geom = getRouteGeometry([37.4, -5.99], [38.7, -9.14]) // 塞维利亚 → 里斯本
    assert(geom.totalNm > 0, '测试航线总里程必须为正（几何没建出来时这条会先挂）')
    const start = npcPose(geom, { posNm: 0, sign: 1 })
    assert(Math.abs(start.lat - geom.from[0]) < 1e-6 && Math.abs(start.lng - geom.from[1]) < 1e-6,
      '里程 0 必须在航线起点')
    const end = npcPose(geom, { posNm: geom.totalNm, sign: 1 })
    assert(Math.abs(end.lat - geom.to[0]) < 1e-6 && Math.abs(end.lng - geom.to[1]) < 1e-6,
      '里程 = 总里程 必须在航线终点')
    for (const nm of [0, geom.totalNm * 0.5, geom.totalNm]) {
      const pose = npcPose(geom, { posNm: nm, sign: 1 })
      assert(Number.isFinite(pose.bearing) && pose.bearing >= 0 && pose.bearing <= 360,
        `朝向必须是 0~360 的有限值（nm=${nm.toFixed(1)} 实得 ${pose.bearing}）`)
    }
    /*
     * 端点上的朝向必须是"进来的航向"，不能退化成正北 0。
     * 第一版在端点拿 geom.to 兜底，而那儿就是船自己 → bearing = 0，
     * 船在掉头那一帧突然指北。这条断言就是钉这个的。
     */
    const beforeEnd = npcPose(geom, { posNm: geom.totalNm - 0.5, sign: 1 })
    const atEnd = npcPose(geom, { posNm: geom.totalNm, sign: 1 })
    assert(Math.abs(atEnd.bearing - beforeEnd.bearing) < 30,
      `终点前的朝向必须连续（${beforeEnd.bearing.toFixed(1)} → ${atEnd.bearing.toFixed(1)}）`)
    const atStart = npcPose(geom, { posNm: 0, sign: -1 })
    assert(atStart.bearing !== 0 || geom.totalNm === 0,
      '反程到起点时朝向不能退化成正北')
  }
}

/*
 * 2.5D 海图的线：经纬网 + 海岸墨线（utils/chartLines，纯计算）。
 *
 * 【为什么这些必须测位置而不是测"有没有返回数组"】
 * 线画错位置是最不显眼的失败：数组照样有、draw call 照样发，
 * 只是线落在海图外面或者东西向反了。所以要断言"经线 0° 落在世界中心 x=0"、
 * "赤道落在 z=0"、"纬线 z 恒定 / 经线 x 恒定"这些**几何事实**，
 * 而不是断言长度大于 0。
 */
{
  const W = MAP_WORLD_SIZE

  // ① 经纬网的数量：25 条经线（含 ±180）+ 11 条纬线
  assert(GRATICULE_MERIDIANS === 25, `应有 25 条经线（实得 ${GRATICULE_MERIDIANS}）`)
  assert(GRATICULE_PARALLELS === 11, `应有 11 条纬线（实得 ${GRATICULE_PARALLELS}）`)

  const Y = -0.083
  const seg = graticuleSegments(Y)
  assert(seg.length % 6 === 0, '线段数组必须是 6 个浮点一段（两个端点）')
  const segs = seg.length / 6
  // 经线 1 段 + 纬线 72 段
  assert(segs === GRATICULE_MERIDIANS + GRATICULE_PARALLELS * 72,
    `线段数应为 ${GRATICULE_MERIDIANS + GRATICULE_PARALLELS * 72}（实得 ${segs}）`)

  /*
   * ② 全部点必须是有限值，且 y 等于传入高度（画错层会导致线被海面吃掉）。
   * 聚合成两条，不逐点断言：4900 多个浮点逐条断言会把上面 3000 多条单测的
   * 计数冲掉（实测总数从 3391 涨到 9957），"通过 / 失败"这个数字就没意义了。
   */
  let nan = 0, wrongY = 0
  for (let i = 0; i < seg.length; i += 3) {
    if (!Number.isFinite(seg[i]) || !Number.isFinite(seg[i + 1]) || !Number.isFinite(seg[i + 2])) nan++
    if (Math.abs(seg[i + 1] - Y) > 1e-12) wrongY++
  }
  assert(nan === 0, `经纬网坐标不能有 NaN/Infinity（异常 ${nan} 个点）`)
  assert(wrongY === 0, `经纬网所有点的 y 必须等于 ${Y}（异常 ${wrongY} 个）`)

  // ③ 经线：x 恒定、z 从南沿到北沿（跨度必须正好是图高，不是半个图）
  {
    const meridianSegs = GRATICULE_MERIDIANS
    let minZ = Infinity, maxZ = -Infinity, tilt = 0
    for (let k = 0; k < meridianSegs; k++) {
      const o = k * 6
      // 聚合成一条：25 条逐条断言会把日志刷成 25 行，失败时反而看不出重点
      if (Math.abs(seg[o] - seg[o + 3]) > 1e-12) tilt++
      minZ = Math.min(minZ, seg[o + 2], seg[o + 5])
      maxZ = Math.max(maxZ, seg[o + 2], seg[o + 5])
    }
    assert(tilt === 0, `经线必须竖直（x 相同），有 ${tilt} 条是斜的`)
    // 墨卡托南北沿正好是 ±half（陆地板块被夹在同一范围）
    assert(Math.abs(maxZ - W / 2) < 1e-6 && Math.abs(minZ + W / 2) < 1e-6,
      `经线应铺满整个海图高度 ±${W / 2}（实得 ${minZ.toFixed(2)}~${maxZ.toFixed(2)}）`)
    /*
     * 尤其要钉住"0° 经线在正中间"。
     * 如果 lonToWorldX 漏了 +180 的偏移（写成 lon/360*W），所有线会整体西移半个图，
     * 而"线铺满高度""数量对"这些断言全都照样通过 —— 只有这一条抓得到。
     */
    const zeroIdx = (0 + 180) / GRATICULE_STEP_DEG
    assert(Math.abs(seg[zeroIdx * 6] - W / 2) < 1e-9,
      `0° 经线必须落在世界 x=${W / 2}（实得 ${seg[zeroIdx * 6]}）`)
  }

  // ④ 纬线：z 恒定、赤道在 z=0、南北对称
  {
    const start = GRATICULE_MERIDIANS * 6
    const zs = new Set<number>()
    let flat = 0
    for (let k = 0; k < GRATICULE_PARALLELS * 72; k++) {
      const o = start + k * 6
      if (Math.abs(seg[o + 2] - seg[o + 5]) > 1e-12) flat++
      zs.add(Math.round(seg[o + 2] * 1e6) / 1e6)
    }
    assert(flat === 0, `纬线必须水平（z 相同），有 ${flat} 段是斜的`)
    assert(zs.size === GRATICULE_PARALLELS,
      `纬线应只有 ${GRATICULE_PARALLELS} 个不同的 z（实得 ${zs.size}）`)
    assert([...zs].some(z => Math.abs(z) < 1e-6),
      `赤道（纬度 0）必须落在 z=0，实得 z 集合 ${[...zs].map(v => v.toFixed(2)).join(',')}`)
    // 南北对称：z 的集合关于 0 对称（墨卡托对纬度是对称的）
    for (const z of zs) {
      assert([...zs].some(o => Math.abs(o + z) < 1e-6),
        `纬线必须南北对称（缺 ${(-z).toFixed(2)}）`)
    }
  }

  // ⑤ 海岸线：环要闭合成线，洞/湖也要描，小岛分到细线组
  {
    // 用一个合成要素：外环 4 点闭合 + 内环（洞）4 点闭合
    const square: number[][] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]
    const hole: number[][] = [[0.2, 0.2], [0.4, 0.2], [0.4, 0.4], [0.2, 0.4], [0.2, 0.2]]
    const geo = {
      features: [
        { geometry: { type: 'Polygon', coordinates: [square, hole] } },
        // 一块 0.01 度见方的小岛 → 必须进 minor
        { geometry: { type: 'Polygon', coordinates: [[[10, 10], [10.1, 10], [10.1, 10.1], [10, 10.1], [10, 10]]] } },
      ],
    }
    const out = coastSegments(geo as unknown as Parameters<typeof coastSegments>[0], 0.006)
    assert(out.rings === 3, `应统计到 3 个环（外环+洞+小岛），实得 ${out.rings}`)
    // 5 点闭合的环 = 4 段；外环 + 洞 = 8 段 → major 有 8*6 个浮点
    assert(out.major.length === 8 * 6, `大陆组应有 8 段（实得 ${out.major.length / 6}）`)
    assert(out.minor.length === 4 * 6, `小岛组应有 4 段（实得 ${out.minor.length / 6}）`)
    /*
     * 洞（湖泊）必须单独描一圈。
     * 【不能只断言"线段总数对"】总数对得上也可能全是外环多算了几段——
     * 这里直接按投影后的坐标找洞的那条边 (0.2,0.2)→(0.4,0.2)。
     */
    const hx0 = lonToWorldX(0.2), hz0 = latToWorldZ(0.2)
    const hx1 = lonToWorldX(0.4), hz1 = latToWorldZ(0.2)
    let holeHit = false
    for (let i = 0; i < out.major.length; i += 6) {
      if (Math.abs(out.major[i] - hx0) < 1e-9 && Math.abs(out.major[i + 2] - hz0) < 1e-9
        && Math.abs(out.major[i + 3] - hx1) < 1e-9 && Math.abs(out.major[i + 5] - hz1) < 1e-9) {
        holeHit = true
        break
      }
    }
    assert(holeHit, '洞（湖泊）的边必须被描出来（否则内陆湖没有轮廓）')
    /*
     * 所有点必须共面于传入高度（合成要素只有 12 个点，但仍然聚合成一条断言：
     * 逐点断言会把日志刷成几百行，真失败时反而看不清是哪条挂了）。
     */
    let yBad = 0
    for (let i = 1; i < out.major.length; i += 3) {
      if (Math.abs(out.major[i] - 0.006) > 1e-12) yBad++
    }
    assert(yBad === 0, `海岸线所有点的 y 必须等于传入高度（异常 ${yBad} 个）`)
    // 零长段必须被丢掉（否则 LineSegmentsGeometry 的方向归一化会除以 0）
    assert(out.major.every(Number.isFinite), '海岸线坐标不能有 NaN')
  }

  // ⑥ 同一份 land.geojson：线段数必须与顶点数对得上（漏环/漏洞会明显偏少）
  {
    // 测试从项目根目录跑（npm test 的 cwd），直接按相对路径读
    const raw = readFileSync('public/data/land.geojson', 'utf8')
    const land = JSON.parse(raw)
    const out = coastSegments(land, 0.006)
    const segs = (out.major.length + out.minor.length) / 6
    /*
     * 实测基线：1422 环 / 60669 顶点。闭合环 n 点 → n-1 段，
     * 再减去零长段（重复坐标）。这里给 3% 容差，而不是写死 59xxx：
     * 上游精简精度时会小幅变化，写死会让一条数据更新就把测试打红。
     */
    assert(segs > 58000, `海岸线段数应 > 58000（实得 ${segs}，环 ${out.rings}）`)
    assert(out.rings === 1422, `环数应为 1422（实得 ${out.rings}）`)
    // 大块陆地必须占多数线段：如果分档判据反了，major 会只剩几个碎岛
    assert(out.major.length > out.minor.length,
      `大陆组线段（${out.major.length / 6}）应多于小岛组（${out.minor.length / 6}）`)
  }
}

/*
 * 3D 山峰符号的高程筛选。
 *
 * 【为什么单独测这一层】它决定"沙漠里会不会长出山"。阈值写错一格的表现
 * 不是报错，而是**整片西非铺满三角**（实测过一次），只能靠肉眼发现。
 * 这里用假采样器把它变成可断言的：高地留、低地删、非 peak 不动、采样失败保留。
 */
{
  const mk = (kind: 'peak' | 'tree', lat: number, lng: number): { lat: number; lng: number; kind: 'peak' | 'tree'; scale: number; rank: number } =>
    ({ lat, lng, kind, scale: 1, rank: 0.5 })
  const syms = [
    mk('peak', 46, 10),   // 阿尔卑斯
    mk('peak', 22, 15),   // 撒哈拉
    mk('tree', 22, 15),   // 树不看高程
    mk('peak', 30, 80),   // 采样失败（返回 -1）
  ]
  /*
   * 假采样器：46°N 一圈 0.30（山脊），其余 0.15（平原），30°N 采样失败（-1）。
   *
   * 【为什么要把"山脊"做成窄窄一条】第一版写成 `lat > 40 ? 0.30 : 0.15`，
   * 于是 46°N 的邻域里全是 0.30 —— 那是一片**高原**，不是山脊，
   * 判据（比邻域均值高 0.02）把它正确地删掉了，而断言写的是"必须留"。
   * 是断言错了，不是判据错了：这里改成 ±0.5° 的窄脊，两侧才真的是低的。
   */
  const elev = (lat: number) =>
    lat === 30 ? -1 : (lat > 45.5 && lat < 46.5) ? 0.30 : 0.15

  // ① 门槛 0.25：阿尔卑斯留、撒哈拉的山删
  const kept = filterPeaksByElevation(syms, elev, 0.25)
  assert(kept.filter(x => x.kind === 'peak').length === 2,
    `0.25 门槛下应只剩 2 座山（阿尔卑斯 + 采样失败那座），实得 ${kept.filter(x => x.kind === 'peak').length}`)
  assert(kept.some(x => x.kind === 'peak' && x.lat === 46), '阿尔卑斯（0.30）必须留下')
  assert(!kept.some(x => x.kind === 'peak' && x.lat === 22), '撒哈拉（0.15）的山必须被删掉')
  // ② 非 peak 一个都不许动
  assert(kept.filter(x => x.kind === 'tree').length === 1, '树不参与高程筛选（原样保留）')
  // ③ 采样失败时保留：图没加载好不该让地形整片消失
  assert(kept.some(x => x.kind === 'peak' && x.lat === 30), '采样失败（-1）的山必须保留')
  // ④ 没有采样器时原样返回（离线回退）
  assert(filterPeaksByElevation(syms, null, 0.25).length === syms.length,
    '没有高程采样器时必须原样返回')
  // ⑤ 门槛提高必须单调变少（敏感度断言，不是抽样）
  const a = filterPeaksByElevation(syms, elev, 0.2).length
  const b = filterPeaksByElevation(syms, elev, 0.4).length
  assert(a >= b, `门槛提高后保留数不能变多（0.2 → ${a}，0.4 → ${b}）`)

  /*
   * ⑥ 山脊判据（默认门槛 0.14）：这一条是"沙漠不长山"真正的把关人。
   *
   * 造一块"平原"：所有采样值都等于 0.20（高于 0.14，但不比邻居高）。
   * 绝对阈值会把它全留下；山脊判据必须一个都不留。
   * 再造一条"山脊"：中间一列高、两侧低，中间那列必须留下。
   */
  const flat = (): number => 0.20
  const flatSyms = [mk('peak', 20, 20), mk('peak', 22, 22)]
  assert(filterPeaksByElevation(flatSyms, flat).length === 0,
    '等高的一片地（0.20）不该长出山：山脊判据必须要求"比邻域高"')
  const ridge = (lat: number, lng: number) => (Math.abs(lng - 20) < 0.8 ? 0.32 : 0.18)
  const ridgeSyms = [mk('peak', 20, 20), mk('peak', 20, 24)]
  const ridgeKept = filterPeaksByElevation(ridgeSyms, ridge)
  assert(ridgeKept.length === 1 && ridgeKept[0].lng === 20,
    `只该留下脊线上的那座（实得 ${ridgeKept.map(x => x.lng).join(',') || '无'}）`)
  // ⑦ 低于下限（0.14）的一律不算，即使它是局部高点
  const lowRidge = (lat: number, lng: number) => (Math.abs(lng - 20) < 0.8 ? 0.10 : 0.02)
  assert(filterPeaksByElevation([mk('peak', 20, 20)], lowRidge).length === 0,
    '低于 0.14 的地方即使是局部高点也不该出山（澳洲内陆实测 27% → 0%）')
}

/*
 * 「死港」不变量：每个港口，掮客都必须给得出一单。
 *
 * 【为什么这条必须存在】用游戏自己的掮客逻辑（selectBestDeal）把 20 个港口
 * 逐个设为出发港，实测有两个港口**永远拿不到单**：
 *   拿骚   最佳出口 烟草→加的斯  38 金/天，而航程 30 天
 *   加的斯 五种货 modifier 全部 > 1，最好一条 2 金/天
 * 而 20 港里还有 12 港没有委托，于是玩家到港后屏幕上什么都没有，
 * 掮客卡只能走兜底文案「本港行情已平 · 指条回程」——它在明确地让玩家空船回去。
 *
 * 【判据为什么用 selectBestDeal，而不是自己算"有没有正边际"】
 * 第一版就是这么写的，**抓不到旧缺陷**：拿骚的烟草有 +2 金/天、加的斯的丝绸也有
 * +2 金/天，"存在正边际"两边都成立，于是把旧数据注入回去测试依然全绿。
 * 玩家面对的不是"边际是否为正"，而是"卡片上有没有单"——那就必须用同一个函数判。
 * 45 金/天 是游戏自己的推荐门槛，落在它下面按定义就是死港。
 *
 * 代价是这条断言对价格微调敏感（加的斯现在正好 46）。这是**设计意图**：
 * 任何一次改动让某个港口跌出推荐线，都应该被显式看见并解释，而不是悄悄发生。
 */
{
  /*
   * 【基线为什么必须给 1000 金】
   * useGameStore.getState() 拿到的是 **initGame 之前**的默认船（speed 12、金币 500），
   * 不是玩家真正开局的那艘受损卡拉维尔（speed 8）。用它测出来的"金/天"会系统性偏乐观：
   * 加的斯→埃尔米纳 在默认船上是 10 天（46 金/天，勉强过线），
   * 在真实船上要 14 天（33 金/天，过不了）——这条差异是我在浏览器里调同一个函数
   * 才发现的两个数字不一致（Node 10 天 / 浏览器 14 天）。
   *
   * 而"抵达某港时身上有多少钱"也不是随意的：玩家第一次到加的斯，
   * 是在塞维利亚用 425 金买 5 件丝绸、到港卖 1040 金之后 —— 约 1100 金。
   * 拿 500 金（远洋归来却更穷）去要求"每个港口都必须有单"，是在测一个不存在的状态。
   * 所以基线取 1000：既不是初始值，也不是后期暴富，是"跑过一趟正常买卖之后"。
   */
  const st0 = useGameStore.getState()
  const st = {
    ...st0,
    fleet: { ...st0.fleet, gold: 1000 },
  }
  const dead: string[] = []
  const clearing: string[] = []
  for (const p of ports) {
    const s = { ...st, fleet: { ...st.fleet, currentPortId: p.id, isSailing: false } }
    if (selectBestDeal(s as typeof st)) clearing.push(p.nameCn)
    else dead.push(p.nameCn)
  }
  assert(dead.length === 0, `每个港口掮客都必须给得出单（死港：${dead.join('、') || '无'}）`)
  assert(clearing.length === ports.length,
    `20 个港口全部可推荐（实得 ${clearing.length}）`)

  // 两个曾经的死港单独点名（回归时一眼看出是哪两个塌了）
  for (const name of ['拿骚', '加的斯']) {
    assert(clearing.includes(name), `${name} 必须重新有单可接（它曾是全图仅有的两个死港之一）`)
  }

  /*
   * 反向套利陷阱：加的斯→塞维利亚有丝绸单向生意（塞→加），
   * 给加的斯加军火之后必须确认**没有反向套利**——若哪天塞维利亚的火枪
   * modifier 被抬到 1.0 以上，这两个港就变成一台 1 天往返的印钞机
   * （历史上已经踩过一次 26 倍套利，见 dynamicSellPrice 的 14 号修订）。
   */
  const cadiz = ports.find(p => p.nameCn === '加的斯')!
  const sevilla = ports.find(p => p.nameCn === '塞维利亚')!
  const s2 = { ...st, fleet: { ...st.fleet, currentPortId: cadiz.id, isSailing: false } }
  const buyMusket = selectBuyPrice(s2 as typeof st, cadiz.id, 7)
  const sellMusket = selectSellPrice(s2 as typeof st, sevilla.id, 7)
  assert(buyMusket != null, '加的斯必须经营火枪（它是军械装船港，也是它唯一的出口）')
  assert(sellMusket != null && sellMusket <= buyMusket,
    `加的斯→塞维利亚的火枪不能反向套利（买 ${buyMusket} / 卖 ${sellMusket}）`)
}

/*
 * 天赋的「痕迹」：这两条函数负责把开局那一次选择，变成局内看得见的一句话。
 *
 * 【为什么值得单独测】五个天赋的效果全都实现了，但改之前**一处都没显示**：
 * 商界血脉藏在动态价格的系数里，铁壁/魅力/医生藏在事件结算的乘法里，
 * 玩家一次也看不到自己的选择起过作用——那么"选天赋"就只是开局的一个仪式。
 * 这两条函数的判据不是"有没有返回东西"，而是**数字必须对得上账**。
 */
{
  // ---- ① 事件侧：反事实差值 ----
  const ctx = { stanceMagnitudeMul: 1, trait: 'bulwark', hasQuartermaster: false }
  const hurt = { goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: -20, crewChange: 0 }

  const bulwark = traitEffect(hurt, ctx)
  assert(bulwark !== null, '铁壁舰长遇到扣耐久的事件必须留下痕迹')
  // 20 × 0.85 = 17 → 少损 3 点
  assert(bulwark!.text.includes('铁壁舰长'), `痕迹里应写明是谁（实得「${bulwark!.text}」）`)
  assert(bulwark!.text.includes('少损 3 点耐久'), `铁壁应少损 3 点（20→17），实得「${bulwark!.text}」`)
  assert(bulwark!.magnitude === 3, `magnitude 应为 3（实得 ${bulwark!.magnitude}）`)

  // 没触发条件时不显示（加耐久的好事，铁壁帮不上忙）——否则它会开始吹牛
  assert(traitEffect({ ...hurt, durabilityChange: 8 }, ctx) === null,
    '铁壁遇到"耐久增加"的事件不该声称自己省了东西')
  // 没选天赋
  assert(traitEffect(hurt, { ...ctx, trait: null }) === null, '没有天赋时不该有任何痕迹')
  // 别的天赋不越界
  assert(traitEffect(hurt, { ...ctx, trait: 'surgeon' }) === null,
    '随船医生不该对"不掉人"的事件留痕迹')

  // 魅力：士气 +10 → 13，多得 3
  const moraleUp = traitEffect({ ...hurt, durabilityChange: 0, moraleChange: 10 }, { ...ctx, trait: 'leader' })
  assert(moraleUp?.text.includes('多得 3 点士气'), `魅力应多得 3 点士气（实得「${moraleUp?.text}」）`)
  // 医生：船员 -8 → -6，少损 2
  const crewLose = traitEffect({ ...hurt, durabilityChange: 0, crewChange: -8 }, { ...ctx, trait: 'surgeon' })
  assert(crewLose?.text.includes('少损 2 名船员'), `医生应少损 2 名（实得「${crewLose?.text}」）`)

  /*
   * ---- ② 商界血脉：卡片上的"多赚 N 金"必须与真实差价对得上 ----
   * 这是本项目最核心的承诺：屏幕上的数字必须等于实际发生的变化。
   * 判据不是"bonus > 0"，而是把"有天赋"与"没天赋"两条真实路径都走一遍，
   * 看差额是不是正好等于卡片上那句话。
   */
  const st0 = useGameStore.getState()
  const mk = (trait: string | null) => ({
    ...st0,
    fleet: { ...st0.fleet, trait, currentPortId: 6, isSailing: false, gold: 1000, cargo: [],
      ships: st0.fleet.ships.map(sh => ({ ...sh, usedCapacity: 0 })) },
  } as typeof st0)

  const merchantState = mk('merchant')
  const deal = selectBestDeal(merchantState)
  assert(deal !== null, '塞维利亚在商界血脉下必须有一单（否则下面无从对账）')
  const bonus = selectDealTalentBonus(merchantState, deal!)
  assert(bonus != null && bonus > 0, `商界血脉在这一单上必须多赚（实得 ${bonus}）`)

  /*
   * 同一条航线的"没天赋"版本：用同一批价格函数重新算。
   *
   * 【为什么按**每件边际**对账，而不是按总利润】
   * 买价不同 → floor(金币/买价) 不同 → 件数会差 1（实测 12 件 vs 11 件），
   * 于是"总利润差"里混进了件数差，两边永远对不上。
   * 第一版就是这么写的，报出「1474 + 165 ≠ 1309」——公式错了，不是函数错了。
   * 真正要钉的是：**每件多赚的部分 × 件数 == 卡片上那句话**。
   */
  const bare = mk(null)
  const buy0 = selectBuyPrice(bare, 6, deal!.goodId)!
  const sell0 = selectSellPrice(bare, deal!.toPortId, deal!.goodId)!
  const unitWith = deal!.sell - deal!.buy
  const unitWithout = sell0 - buy0
  assert(unitWith > unitWithout, `有天赋的每件边际必须更高（${unitWith} vs ${unitWithout}）`)
  assert((unitWith - unitWithout) * deal!.qty === bonus,
    `对账失败：每件多赚 ${unitWith - unitWithout} × ${deal!.qty} 件 应等于 ${bonus}（实得 ${(unitWith - unitWithout) * deal!.qty}）`)
  // 加成不可能超过这一单本身的利润（否则那句话就不叫"多赚"了）
  assert(bonus! < deal!.totalProfit, `天赋加成 ${bonus} 不该超过整单利润 ${deal!.totalProfit}`)

  // 别的天赋不该被算成"多赚"
  assert(selectDealTalentBonus(mk('bulwark'), deal!) === null,
    '铁壁舰长不该在贸易单上显示"多赚"（它影响的是事件，不是价格）')
}

/*
 * 船长日志：一天一行。
 *
 * 【为什么这些必须逐条过判据】这一层的全部价值在于**文体纪律**：
 * ≤24 字、不带数字、只在有事时写。它不像价格那样有对账可以兜底，
 * 一旦有人往表里追加一句"耐久 -17、金币 +240，士气受损"，它不会报错，
 * 只会悄悄变回一张报表 —— 而没人会为此开 issue。
 */
{
  const mkEntry = (type: string, o: Partial<{ durabilityChange: number; crewChange: number; moraleChange: number; goldChange: number }>, day = 3) => ({
    event: { id: 1, title: 'T', type, choices: [{ text: 'C', outcomes: [] }] },
    choiceIndex: 0,
    outcome: { probability: 1, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, ...o },
    day,
  }) as unknown as Parameters<typeof journalHeadline>[0][number]

  assert(journalHeadline([]) === null, '没有条目的一天不该有日志行（凑数的"风平浪静"会让真正的平静失去分量）')

  const stormBad = journalHeadline([mkEntry('storm', { durabilityChange: -20 })])
  const stormOk = journalHeadline([mkEntry('storm', { moraleChange: 5 })])
  assert(stormBad === '风把帆撕了一道口子。', `风暴受损应有对应的一句（实得「${stormBad}」）`)
  assert(stormOk !== stormBad, '风暴里没受损时不该说"帆被撕了"（同一事件要分好坏两说）')

  // 未知类型落到兜底句，而不是抛错或返回 undefined
  const unknown = journalHeadline([mkEntry('no-such-type', { goldChange: 10 })])
  assert(typeof unknown === 'string' && unknown.length > 0, '未知事件类型必须有兜底句')

  /*
   * 全部文案过三关：≤24 字 / 无阿拉伯数字 / 非空。
   * 遍历的是所有真实事件类型（含好坏两种），所以以后往表里加句子也会被这条拦住。
   */
  const types = ['storm', 'pirate', 'disease', 'accident', 'discovery', 'treasure', 'kraken', 'ghost',
    'festival', 'smuggle', 'siren', 'volcano', 'fog', 'faction', 'crew', 'reckoning', 'historical', 'bogus']
  /*
   * 逐条断言会把这些检查刷成 70 多条，把上面几千条单测的计数冲得看不出变化
   * （本项目已经踩过一次）。所以先收集违规，再聚合成三条断言。
   */
  const seen = new Set<string>()
  const tooLong: string[] = []
  const hasDigit: string[] = []
  for (const t of types) {
    for (const o of [{ durabilityChange: -30 }, { goldChange: 40 }]) {
      const line = journalHeadline([mkEntry(t, o)])!
      seen.add(line)
      if (line.length > 24) tooLong.push(`${t}:${line}(${line.length})`)
      if (/[0-9０-９]/.test(line)) hasDigit.push(`${t}:${line}`)
    }
  }
  assert(tooLong.length === 0, `日志行必须 ≤24 字（超长：${tooLong.join(' / ') || '无'}）`)
  assert(hasDigit.length === 0, `日志行里不许出现数字（违规：${hasDigit.join(' / ') || '无'}）`)
  assert(seen.size >= 12, `日志行不该千篇一律（只见到 ${seen.size} 种）`)

  // 同一天多件事：由"最重"的那件定调（耐久 ×5、人命 ×10 的权重与结算屏一致）
  const mixed = journalHeadline([
    mkEntry('festival', { moraleChange: 8 }),
    mkEntry('pirate', { durabilityChange: -40, crewChange: -2 }),
  ])
  assert(mixed === '他们的刀比我们快。', `同一天应以最重的事件定调（实得「${mixed}」）`)

  // 按天分组：新的在前、天内保持发生顺序
  const log = [mkEntry('storm', {}, 2), mkEntry('festival', {}, 2), mkEntry('discovery', {}, 5)]
  const days = groupJournal(log)
  assert(days.length === 2, `应分成 2 天（实得 ${days.length}）`)
  assert(days[0].day === 5, '最新的那一天必须排在最前')
  assert(days[1].entries.length === 2, '同一天的两条必须归到一组')
  assert(days[1].entries[0].event.type === 'storm', '同一天内保持发生顺序')
  // 分组不能丢条目
  assert(days.reduce((n, d) => n + d.entries.length, 0) === log.length, '分组不许丢条目')
}

/*
 * 委托覆盖度 —— 这一组是「20 个港口必须都有单可接」的不变量。
 *
 * 【为什么值得写死】原来的状态是 8 个港口有委托、12 个港口打开任务面板永远空的：
 * 玩家跑了半个世界，到港没东西可接。补数据容易，**但没有任何东西挡住它再次退回原样**
 * —— 加港口、删委托、改 id，都不会让任何一条已有测试失败。
 *
 * 判据用 ports 全表对差集，而不是数委托条数：19 条委托全挤在塞维利亚也能凑够数量。
 * 「有售」那一条更关键：委托要的货如果接单港根本不卖，玩家接了也买不到，
 * 面板上却写着「金 XXX」，属于承诺兑现不了 —— 这是本项目反复踩过的那类坑。
 */
console.log('\n== 委托覆盖：每个港口都要有单可接 ==')
{
  const taskPortIds = new Set(tasks.map(t => t.portId))
  const missing = ports.filter(p => !taskPortIds.has(p.id)).map(p => `${p.id}${p.nameCn}`)
  assert(missing.length === 0, `20 个港口都能接到委托（缺：${missing.join('、') || '无'}）`)

  const tids = tasks.map(t => t.id)
  assert(new Set(tids).size === tids.length, `委托 id 无重复（${tids.length} 条）`)

  const portIds = new Set(ports.map(p => p.id))
  const badTarget = tasks.filter(t => t.targetPortId != null && !portIds.has(t.targetPortId))
  assert(badTarget.length === 0, `目标港都是真实港口${badTarget.length ? '：' + badTarget.map(t => t.title).join('、') : ''}`)

  // 接单港必须真的卖这种货，否则「接了却买不到」
  const unbuyable: string[] = []
  for (const t of tasks) {
    for (const need of t.requiredGoods ?? []) {
      const sold = portGoods.some(pg => pg.portId === t.portId && pg.goodId === need.goodId)
      if (!sold) {
        const p = ports.find(x => x.id === t.portId)?.nameCn ?? t.portId
        const g = goods.find(x => x.id === need.goodId)?.nameCn ?? need.goodId
        unbuyable.push(`#${t.id}「${t.title}」要 ${g}，但${p}不卖`)
      }
    }
  }
  assert(unbuyable.length === 0, `委托要的货都能在接单港买到${unbuyable.length ? '：' + unbuyable.join('；') : ''}`)

  // 单条需货量不超过初始货舱（40 舱），否则第一次到港根本接不下
  const tooBig = tasks.filter(t => (t.requiredGoods ?? []).some(r => r.quantity > 10))
  assert(tooBig.length === 0, `单条委托需货量 ≤10，初始货舱装得下${tooBig.length ? '：' + tooBig.map(t => t.title).join('、') : ''}`)}

/*
 * 全航线收益：不允许出现「压倒性的异常值」。
 *
 * 【为什么需要这条】
 * 价格表是手写的 100 多行常量，任何一行改错都可能造出一个套利点，而**别的测试全都发现不了**
 * ——它们只验证「卖价 < 同港买价」，管不到跨港。
 * 实测过一次：加的斯丝绸 price 175 / modifier 1.4，配上塞维利亚（105 / 0.85）只隔 1 天，
 * 稳态 952 金/天，比第二名（桑给巴尔→开普敦 716）高 33%，而航程 1 天、零风险。
 * 玩家四天能从 500 金滚到 8000+。已压到 150 / 1.3（616 金/天）。
 *
 * 【口径】稳态，不是首趟
 * 产地库存每天只回补 STOCK_RECOVER_PER_DAY 件。1 天的短途下次回来只补了 8 件，
 * 按「满舱 40」算等于假设港口囤着无限的货——那会把短途系统性高估（4760 vs 952）。
 *
 * 【判据为什么是「最大 / 第二」而不是绝对值】
 * 绝对值会随以后调平衡整体上浮下移，写死就会变成一条需要反复改的测试。
 * 「有没有一个解压过所有其他解」是结构性的，和数值大小无关。
 */
console.log('\n== 航线收益：不能有压倒性的异常值 ==')
{
  // 价格吃 fame 与市场库存，前面的用例会买卖很多次，先归零再算
  const st0 = useGameStore.getState()
  useGameStore.setState({ fleet: { ...st0.fleet, fame: 0, gold: 500 }, marketStock: {} })
  const st = useGameStore.getState()
  const cap = st.fleet.ships.reduce((s, x) => s + x.capacity, 0)
  const nmPerDay = dailyDistanceNm(st.fleet, [], 1)
  const recover = GAME_BALANCE.STOCK_RECOVER_PER_DAY

  const perDay: number[] = []
  const bestFrom = new Map<number, number>()
  for (const a of ports) {
    for (const b of ports) {
      if (a.id === b.id) continue
      const days = daysForDistance(haversineNm(a.latitude, a.longitude, b.latitude, b.longitude), nmPerDay)
      for (const g of goods) {
        const buy = selectBuyPrice(st, a.id, g.id)
        if (buy == null) continue
        const sell = selectSellPrice(st, b.id, g.id)
        if (sell == null || sell <= buy) continue
        const pg = portGoods.find(p => p.portId === a.id && p.goodId === g.id)!
        const qty = Math.max(1, Math.min(pg.stock, cap, recover * days))
        const v = Math.round(((sell - buy) * qty) / Math.max(1, days))
        perDay.push(v)
        bestFrom.set(a.id, Math.max(bestFrom.get(a.id) ?? 0, v))
      }
    }
  }
  perDay.sort((x, y) => y - x)
  const ratio = perDay[1] > 0 ? perDay[0] / perDay[1] : Infinity
  assert(ratio < 1.25, `最高金/天不压过第二名 1.25 倍（实测 ${perDay[0]} vs ${perDay[1]}，比值 ${ratio.toFixed(2)}）`)

  // 每个港口出发都要有一条像样的路，否则玩家到了那儿不知道该往哪开
  const dead = ports.filter(p => (bestFrom.get(p.id) ?? 0) < 40).map(p => `${p.nameCn}(${bestFrom.get(p.id) ?? 0})`)
  assert(dead.length === 0, `没有「从这里出发无利可图」的死港${dead.length ? '：' + dead.join('、') : ''}`)
}

/*
 * 船员特长：perk 文本写了，就必须真的改变结算。
 *
 * 【为什么单开一节】`crewChars.ts` 里 8 个船员每条都有 perk 文案，面板上也印着。
 * 实测当时**只有 cook（食物 -20%）和 purser（买价 -2%）真的生效**，
 * 其余 6 条是纯文本承诺 —— 玩家花 200~400 金雇一个"船员流失减半"的水手长，
 * 得到的只是一个说法。这类"写了没接"是本项目最忌讳的一种缺陷：
 * 界面在承诺一件不会发生的事。
 *
 * 每条都做**双向**断言：加成生效 + 反向不生效。
 * 只测"有水手长时 -2"的话，写成"船员损失永远减半"也能通过。
 */
console.log('\n== 船员特长：perk 写了就必须真的改变结算 ==')
{
  const mk = (o: Partial<EventOutcome>): EventOutcome => ({
    probability: 1, goldChange: 0, foodChange: 0, waterChange: 0,
    moraleChange: 0, durabilityChange: 0, crewChange: 0, description: '',
    ...o,
  } as EventOutcome)
  const base = { stanceMagnitudeMul: 1, trait: null, hasQuartermaster: false }

  // —— 水手长：船员流失减半 ——
  const hurt = mk({ crewChange: -4 })
  const noBosun = adjustOutcome(hurt, { ...base, crewIds: [] })
  const withBosun = adjustOutcome(hurt, { ...base, crewIds: ['boatswain'] })
  assert(noBosun.crewChange === -4, `没有水手长时船员损失不变（实得 ${noBosun.crewChange}）`)
  assert(withBosun.crewChange === -2, `水手长把船员损失减半（-4 → ${withBosun.crewChange}）`)
  const rescue = mk({ crewChange: 2 })
  assert(adjustOutcome(rescue, { ...base, crewIds: ['boatswain'] }).crewChange === 2,
    '水手长不该削减"救人"（减半只对损失生效）')

  // —— 炮手：击退海盗的缴获 +50%，且只对海盗、只对正收益 ——
  const loot = mk({ goldChange: 200 })
  const g = (t?: string) => adjustOutcome(loot, { ...base, crewIds: ['gunner'], eventType: t }).goldChange
  assert(g('pirate') === 300, `海盗战胜的缴获 +50%（200 → ${g('pirate')}）`)
  assert(g('storm') === 200, `非海盗事件不享受缴获加成（实得 ${g('storm')}）`)
  assert(g() === 200, '没有事件类型时不加成')
  const loss = mk({ goldChange: -200 })
  assert(adjustOutcome(loss, { ...base, crewIds: ['gunner'], eventType: 'pirate' }).goldChange === -200,
    '打输赔钱不翻倍——否则 perk 变成 debuff')

  // —— 两个特长互不干扰：同时雇了，各管各的字段 ——
  const both = adjustOutcome(mk({ crewChange: -4, goldChange: 200 }), {
    ...base, crewIds: ['boatswain', 'gunner'], eventType: 'pirate',
  })
  assert(both.crewChange === -2 && both.goldChange === 300,
    `两个特长同时生效且不串味（船员 ${both.crewChange} / 金币 ${both.goldChange}）`)

  // —— 黑旗向导：走私收益 +20%，且只对走私 ——
  const smug = mk({ goldChange: 100 })
  const corsairGold = (t?: string) =>
    adjustOutcome(smug, { ...base, crewIds: ['corsair'], eventType: t }).goldChange
  assert(corsairGold('smuggle') === 120, `走私收益 +20%（100 → ${corsairGold('smuggle')}）`)
  assert(corsairGold('pirate') === 100, `非走私事件不享受走私加成（实得 ${corsairGold('pirate')}）`)

  /*
   * —— 黑旗向导的另一半：海盗遭遇率 -15% ——
   * checkEventTrigger 末尾是 `Math.random() < probability`，所以要钉住随机数来比较。
   * 取 0.18：0.2 的原概率触发，0.2×0.85=0.17 不触发，正好落在两者之间。
   * 这是本轮唯一需要 mock 随机数的断言——不用它就只能跑一千次统计，
   * 那既慢又不稳。
   */
  {
    const pirateEv = { id: -1, type: 'pirate', triggerCondition: { probability: 0.2 }, choices: [] } as unknown as GameEvent
    const st0 = useGameStore.getState()
    const noGuide = { ...st0, crewRoster: [] } as typeof st0
    const withGuide = { ...st0, crewRoster: [{ id: 'corsair' as const, loyalty: 60 }] } as typeof st0
    const origRand = Math.random
    try {
      Math.random = () => 0.18
      assert(checkEventTrigger(pirateEv, noGuide) === true, '没有黑旗向导时，0.18 仍会撞上海盗')
      assert(checkEventTrigger(pirateEv, withGuide) === false, '有黑旗向导时，同一掷值不再触发（遭遇率 -15%）')
    } finally {
      Math.random = origRand
    }
  }
}

/*
 * 见习航海士：发现新港口的声望 +50%。
 *
 * 【为什么放在整个文件的最后】discoverPort 是个大动作——它同时写
 * discoveredPorts / factionRep / notifications / achievements。放在中间会污染
 * 后面所有依赖这些状态的用例。放最后、并且每次都显式重置那三项，副作用就收得住。
 */
console.log('\n== 见习航海士：发现新港口声望 +50% ==')
{
  const s0 = useGameStore.getState()
  useGameStore.setState({ fleet: { ...s0.fleet, fame: 0 }, discoveredPorts: [], crewRoster: [] })
  useGameStore.getState().discoverPort(4)
  const fameNo = useGameStore.getState().fleet.fame

  const s1 = useGameStore.getState()
  useGameStore.setState({
    fleet: { ...s1.fleet, fame: 0 },
    discoveredPorts: [],
    // 只需要 id —— discoverPort 里只做 `some(m => m.id === ...)`
    crewRoster: [{ id: 'midshipman', loyalty: 60 }] as never,
  })
  // 必须用**同一个港口**：两次用不同港会触发不同的航路里程碑，差值就不再只是见习航海士那 3 点
  useGameStore.getState().discoverPort(4)
  const fameYes = useGameStore.getState().fleet.fame

  /*
   * 【为什么改成比差值而不是绝对值】
   * 到港声望现在不是唯一来源：航路里程碑也会给声望（托尔图加/马六甲都算里程碑目标）。
   * 断言绝对值 5 / 8 会在任何一次经济改动后误报，而这条断言真正要守的是
   * "见习航海士让到港声望多一半" —— 那是差值。
   * 同时保留一条"至少 +5"的兜底：万一有人把到港声望整个删了，差值仍是 0，也能抓到。
   */
  const bonus = fameYes - fameNo
  assert(fameNo >= 5, `没有见习航海士时到港声望至少 +5（实得 ${fameNo}，含里程碑奖励）`)
  assert(bonus === 3, `见习航海士让到港声望从 5 变 8（差值 ${bonus}，总 ${fameNo} → ${fameYes}）`)
}

/*
 * 「天生探险家」的痕迹：只在"没有天赋就不会撞上"时，才说这句话是真的。
 *
 * 【为什么必须用反事实】它的效果是"发现类事件概率 ×1.3"，没有一个可以直接显示的
 * 差值。如果只是"玩家有 explorer 且这场是 discovery 就打标签"，那么每一场发现
 * 都会被标成"天赋给的"——那是把角色设定讲成了每次都生效，比不标更糟。
 * 所以判定要拿**同一个掷值**再跑一遍没有天赋的版本，只有结论翻转才算。
 */
console.log('\n== 天生探险家：只在真的多带来一次遭遇时才打标 ==')
{
  const st0 = useGameStore.getState()
  const ev = { id: -2, type: 'discovery', triggerCondition: { probability: 0.2 }, choices: [] } as unknown as GameEvent
  const noTrait = { ...st0, fleet: { ...st0.fleet, trait: null }, crewRoster: [] } as typeof st0
  const withTrait = { ...st0, fleet: { ...st0.fleet, trait: 'explorer' }, crewRoster: [] } as typeof st0

  // 0.23 落在两条线之间：0.2（无天赋）不触发，0.2×1.3=0.26（有天赋）触发
  assert(checkEventTrigger(ev, noTrait, () => 0.23) === false, '0.23 在没有天赋时不触发')
  assert(checkEventTrigger(ev, withTrait, () => 0.23) === true, '同一个 0.23 在有天赋时触发')

  assert(markExplorerBonus(ev, withTrait, 0.23) === true, '结论翻转 → 标为"天赋带来的遭遇"')
  // 0.15 两条线都会触发 → 不是天赋的功劳，不能打标
  assert(markExplorerBonus(ev, withTrait, 0.15) === false, '两条线都会触发时不许打标（那是夸大）')
  assert(markExplorerBonus(ev, noTrait, 0.23) === false, '没有天赋时永远不打标')
  const storm = { ...ev, type: 'storm' } as unknown as GameEvent
  assert(markExplorerBonus(storm, withTrait, 0.23) === false, '非发现类事件不受探险家影响')
}

/*
 * ============================================================================
 * 第二批船员：7 张闲置立绘接进玩法
 *
 * 这批的每一条 perk 都先想清楚"落在哪一行代码"再写文案 —— 因为上一轮盘点时
 * 抓到过 6 条**空承诺**（面板上印着效果、代码里根本没有实现）。
 * 所以这里的断言不是"表里有没有这一条"，而是“数字有没有真的变”。
 * 每条都双向：生效时必须变，不该生效时必须一点都不变。
 * ========================================================================== */
console.log('\n== 第二批船员：7 条 perk 逐条对账 ==')
{
  const mk = (o: Partial<EventOutcome>): EventOutcome => ({
    probability: 1, goldChange: 0, foodChange: 0, waterChange: 0,
    moraleChange: 0, durabilityChange: 0, crewChange: 0, description: '',
    ...o,
  } as EventOutcome)
  const base = { stanceMagnitudeMul: 1, trait: null, hasQuartermaster: false }

  // —— 表结构：15 位、id 唯一、每人有立绘、带 portId 的都是真实港口 ——
  const NEW_IDS = ['navigator', 'medic', 'carpenter', 'interpreter', 'guide', 'merchant', 'pathfinder'] as const
  for (const id of NEW_IDS) {
    assert(CREW_CHAR_MAP.has(id), `第二批船员 ${id} 已登记`)
    assert(!!crewPortrait(id), `${id} 有立绘（缺映射时面板会渲染成空框）`)
  }
  // portId 指向真实港口：写错一个数字，那个角色就永远不会在任何港口出现
  const portIdSet = new Set(ports.map(p => p.id))
  const badPort = CREW_CHARS.filter(c => c.portId !== undefined && !portIdSet.has(c.portId))
  assert(badPort.length === 0, `portId 都是真实港口${badPort.length ? '：' + badPort.map(c => c.name).join('、') : ''}`)
  // 第一批必须仍然"哪个港都招得到"（这是既有体验，不能被 portId 改动波及）
  assert(CREW_CHARS.filter(c => c.portId === undefined).length === 8, '第一批 8 位仍无 portId（任何港口可招）')
  // 第二批不能有两个人在同一个港口——那样一个港会同时冒两张卡，而其他港少一个
  const newPorts = CREW_CHARS.filter(c => c.portId !== undefined).map(c => c.portId)
  assert(new Set(newPorts).size === newPorts.length, '第二批每人各占一个港口')

  // 招募入口也必须守 portId：数据是唯一规则，不能只靠面板过滤
  {
    const s0 = useGameStore.getState()
    useGameStore.setState({
      fleet: { ...s0.fleet, currentPortId: 11, isSailing: false, gold: 5000 },
      crewRoster: [],
    })
    useGameStore.getState().recruitCrewMember('merchant') // 商人在塞维利亚(6)
    assert(useGameStore.getState().crewRoster.length === 0,
      '在果阿招不到塞维利亚的商人（portId 由 store 把关，不只靠面板）')
    useGameStore.getState().recruitCrewMember('navigator') // 航海士在果阿(11)
    assert(useGameStore.getState().crewRoster.some(m => m.id === 'navigator'),
      '在果阿招得到航海士')
  }

  // —— 航海士：靠港补给半价（面板按钮与结算共用 supplyCost） ——
  assert(supplyCost(GAME_BALANCE.SUPPLY_TOTAL_COST, false) === 60, '无航海士时补给 60 金')
  assert(supplyCost(GAME_BALANCE.SUPPLY_TOTAL_COST, true) === 30,
    `航海士把补给价砍到 ${supplyCost(GAME_BALANCE.SUPPLY_TOTAL_COST, true)} 金`)
  {
    // 走一遍真实结算：面板上写多少，实际就扣多少
    const s0 = useGameStore.getState()
    useGameStore.setState({
      fleet: { ...s0.fleet, currentPortId: 20, gold: 1000, food: 0, water: 0 },
      crewRoster: [{ id: 'navigator', loyalty: 60, hiredDay: 1 }],
    })
    useGameStore.getState().supplyFleet()
    const after = useGameStore.getState().fleet
    assert(1000 - after.gold === supplyCost(GAME_BALANCE.SUPPLY_TOTAL_COST, true),
      `航海士在船时补给实际扣 ${1000 - after.gold} 金，与按钮一致`)
    assert(after.food === GAME_BALANCE.SUPPLY_AMOUNT && after.water === GAME_BALANCE.SUPPLY_AMOUNT,
      '半价不影响份量（粮水各 20）')
  }

  // —— 厨子：补给时食物多给一半（旧的「粮食 -20%」已拆，见 utils/crewPerks） ——
  {
    // 比例减免拆掉的依据：起始船队 2 份/天，×0.8 取整仍是 2
    assert(Math.ceil(2 * 0.8) === 2, '15 人船队 2 份/天：打八折取整还是 2（这就是它失效的原因）')
    assert(supplyAmounts(20, { hasCook: false }).food === 20, '无厨子时补给粮 20')
    assert(supplyAmounts(20, { hasCook: true }).food === 30, '厨子补给粮 20 → 30')
    assert(supplyAmounts(20, { hasCook: true }).water === 20, '厨子不给水（他只管粮）')

    // 走一遍真实结算：面板上写的份量，就是实际增加的份量
    const s0 = useGameStore.getState()
    useGameStore.setState({
      fleet: { ...s0.fleet, currentPortId: 20, gold: 1000, food: 0, water: 0 },
      crewRoster: [
        { id: 'cook', loyalty: 60, hiredDay: 1 },
        { id: 'navigator', loyalty: 60, hiredDay: 1 },
      ] as never,
    })
    useGameStore.getState().supplyFleet()
    const after = useGameStore.getState().fleet
    assert(after.food === 30 && after.water === 20,
      `厨子在船时补给实际到手 粮 ${after.food} 水 ${after.water}，与面板一致`)
    // 两条 perk 叠在同一件商品上，各管各的：厨子管份量、航海士管价钱
    assert(1000 - after.gold === supplyCost(GAME_BALANCE.SUPPLY_TOTAL_COST, true),
      `两条补给 perk 互不干扰：扣 ${1000 - after.gold} 金（半价）但粮 30 份`)
  }

  // —— 船匠：修理费六折（面板与结算共用 repairCost） ——
  assert(repairCost(20, false) === 100, `无船匠时修 20 点耐久收 ${repairCost(20, false)} 金`)
  assert(repairCost(20, true) === 100 * CARPENTER_COST_MUL, `船匠打六折（${repairCost(20, true)} 金）`)
  // 边界：1 点耐久不能被折成 0 金（向上取整）
  assert(repairCost(1, true) >= 1, `最小一笔修理也不能免费（实得 ${repairCost(1, true)} 金）`)

  // —— 商人：委托赏金 +25% ——
  assert(taskGold(480, false) === 480 && taskGold(480, true) === 480 * MERCHANT_REWARD_MUL,
    `商人把 480 金的委托谈到 ${taskGold(480, true)} 金`)
  {
    // 走一遍真实结算：卡片上写多少，到账就得是多少
    const s0 = useGameStore.getState()
    const task = { ...s0.activeTasks[0], id: 99001, reward: { gold: 400, fame: 0 }, portId: 6, targetPortId: undefined, requiredGoods: undefined }
    useGameStore.setState({
      fleet: { ...s0.fleet, currentPortId: 6, gold: 1000 },
      activeTasks: [task as never],
      crewRoster: [{ id: 'merchant', loyalty: 60, hiredDay: 1 }],
    })
    useGameStore.getState().completeTask(99001)
    const gained = useGameStore.getState().fleet.gold - 1000
    assert(gained === taskGold(400, true), `商人交付委托到账 ${gained} 金，与卡片一致`)
  }

  // —— 翻译官：派系好感 +50%，但惩罚不放大 ——
  {
    const run = (factionChange: Record<string, number>, crew: string[]) => {
      const s0 = useGameStore.getState()
      useGameStore.setState({
        fleet: { ...s0.fleet, currentPortId: 6 },
        crewRoster: crew.map(id => ({ id, loyalty: 60, hiredDay: 1 })) as never,
        factionRep: { crown: 0, brethren: 0, guild: 0, scholars: 0 } as never,
      })
      useGameStore.getState().applyEventOutcome(mk({ factionChange: factionChange as never }))
      return useGameStore.getState().factionRep.crown
    }
    assert(run({ crown: 6 }, []) === 6, '没有翻译官时派系好感就是 6')
    assert(run({ crown: 6 }, ['interpreter']) === 6 * INTERPRETER_FACTION_MUL,
      `翻译官把好感放大到 ${run({ crown: 6 }, ['interpreter'])}`)
    // 关键：负的不许放大 —— 放大了这条 perk 就成了 debuff
    assert(run({ crown: -6 }, []) === -6 && run({ crown: -6 }, ['interpreter']) === -6,
      '翻译官不放大惩罚（走私被记的账还是 -6）')
  }

  // —— 向导：高危航段不再掉忠诚，但低士气照扣 ——
  {
    const st = useGameStore.getState()
    const fleet = { ...st.fleet, morale: 100, food: 50, water: 50 }
    const roster = (id: string) => [{ id, loyalty: 60, hiredDay: 1 }] as never
    const noGuide = tickCrewLoyalty({ ...st, crewRoster: roster('cook') }, fleet, 2, 5, () => 0.99)
    assert(noGuide.roster[0].loyalty === 59, `危险航段无向导：忠诚 60 → ${noGuide.roster[0].loyalty}`)
    const withGuide = tickCrewLoyalty({ ...st, crewRoster: roster('guide') }, fleet, 2, 5, () => 0.99)
    assert(withGuide.roster[0].loyalty === 60, `有向导时危险航段不掉忠诚（实得 ${withGuide.roster[0].loyalty}）`)
    // 反例：士气崩了照样扣 3，他不是免死金牌
    const sad = { ...fleet, morale: 30 }
    const guideSad = tickCrewLoyalty({ ...st, crewRoster: roster('guide') }, sad, 2, 5, () => 0.99)
    assert(guideSad.roster[0].loyalty === 57, `有向导时低士气仍扣 3（实得 ${guideSad.roster[0].loyalty}）`)
  }

  // —— 航医：缺粮断水时病死概率减半（钉死掷值卡在两条线之间） ——
  {
    const st = useGameStore.getState()
    const starved = { ...st.fleet, food: 0, water: 10, morale: 100 }
    const roster = (id: string) => [{ id, loyalty: 60, hiredDay: 1 }] as never
    // 0.07 介于 0.06（有航医）与 0.12（无航医）之间
    const dead = tickCrewLoyalty({ ...st, crewRoster: roster('cook') }, starved, 2, 1, () => 0.07)
    assert(dead.died.length === 1, `无航医时 0.07 的掷值会死一个人（实得 ${dead.died.length}）`)
    const alive = tickCrewLoyalty({ ...st, crewRoster: roster('medic') }, starved, 2, 1, () => 0.07)
    assert(alive.died.length === 0, `有航医时同一个掷值活下来（实得 ${alive.died.length}）`)
    // 反例：掷值低于减半后的概率，航医也救不回来 —— 他只减半，不是免死
    const stillDead = tickCrewLoyalty({ ...st, crewRoster: roster('medic') }, starved, 2, 1, () => 0.05)
    assert(stillDead.died.length === 1, `0.05 的掷值下航医也救不回来（实得 ${stillDead.died.length}）`)
  }

  // —— 探险家：探索类事件的金币与声望 +30% ——
  {
    const loot = mk({ goldChange: 200, fameChange: 5 })
    const noPath = adjustOutcome(loot, { ...base, crewIds: [], eventType: 'discovery' })
    const withPath = adjustOutcome(loot, { ...base, crewIds: ['pathfinder'], eventType: 'discovery' })
    assert(noPath.goldChange === 200 && noPath.fameChange === 5, '没有探险家时金币/声望不变')
    assert(withPath.goldChange === Math.round(200 * PATHFINDER_DISCOVERY_MUL),
      `探险家把探索金币放大到 ${withPath.goldChange}`)
    assert(withPath.fameChange === Math.round(5 * PATHFINDER_DISCOVERY_MUL),
      `探险家把探索声望放大到 ${withPath.fameChange}`)
    // 非探索事件不吃这一条
    const stormOutcome = adjustOutcome(loot, { ...base, crewIds: ['pathfinder'], eventType: 'storm' })
    assert(stormOutcome.goldChange === 200, '风暴事件的金币不受探险家影响')
    // 赔钱的探索也不许放大
    const loss = mk({ goldChange: -100 })
    assert(adjustOutcome(loss, { ...base, crewIds: ['pathfinder'], eventType: 'discovery' }).goldChange === -100,
      '探索赔钱时不放大亏损（perk 不能变 debuff）')
  }
}

console.log('\n== 海上异闻：氛围层必须是"偶尔、简短、不打断" ==')
{
  /*
   * 这一层的设计约束只有三条，全部可以断言：
   *   ① 稀——绝大多数日子什么都不该发生（否则变成噪音）
   *   ② 短——一行字，不带数字（它不是数据面板）
   *   ③ 不打断——不产生任何状态变更，除了它自己那一条
   * 概率型的东西必须**钉死随机源**，跑几百次数比例是抽样不是断言。
   */
  const ctx = (over: Partial<Parameters<typeof rollSeaOmen>[0]> = {}) => ({
    day: 40, lastOmenDay: 0, weatherKind: 'clear', dangerLevel: 2, rand: () => 0.5, ...over,
  })

  // ① 冷却：4 天之内不再出
  assert(rollSeaOmen(ctx({ day: 3, lastOmenDay: 0, rand: () => 0 })) === null,
    `冷却 ${OMEN_COOLDOWN_DAYS} 天内不再出现（第 3 天判定为空）`)
  assert(rollSeaOmen(ctx({ day: 4, lastOmenDay: 0, rand: () => 0 })) !== null,
    '刚好满冷却天数就可以出现')

  // ② 概率：掷值 0 必出、0.99 必不出
  assert(rollSeaOmen(ctx({ rand: () => 0 })) !== null, '掷值 0 一定出现')
  assert(rollSeaOmen(ctx({ rand: () => 0.99 })) === null, '掷值 0.99 一定不出现')

  /*
   * ③ 天候确实在改概率。
   *
   * 【为什么不用"固定掷值卡在两条线之间"】第一版用的是 0.15，正好卡在
   * 晴 0.16×0.55=0.088 与 暴风 0.16×1.6=0.256 之间。后来把基准概率
   * 提到 0.22、晴天系数提到 0.75（晴=0.165），0.15 就落进了"晴天也出"的区间，
   * 断言立刻失败 —— 但它失败的原因是**参数变了**，不是代码坏了。
   *
   * 现在改成确定性扫描：把 rand 均匀铺满 [0,1)，触发次数 / 次数 就等于概率本身。
   * 断言的是**相对关系**（暴风 > 晴天），不是某两个绝对值。
   */
  const rate = (patch: Partial<Parameters<typeof rollSeaOmen>[0]>) => {
    const N = 800
    let hit = 0
    for (let i = 0; i < N; i++) {
      if (rollSeaOmen(ctx({ ...patch, rand: () => i / N }))) hit++
    }
    return hit / N
  }
  const clearRate = rate({ weatherKind: 'clear' })
  const stormRate = rate({ weatherKind: 'storm' })
  assert(stormRate > clearRate * 1.5,
    `暴风雨比晴天更容易出异闻（晴 ${(clearRate * 100).toFixed(1)}% / 暴风 ${(stormRate * 100).toFixed(1)}%）`)
  /*
   * 但晴天不能是 0。异闻里有一半是"好天气才看得见"的东西（鲸群、跃鱼、夜光海），
   * 把它们关在坏天气里，等于说"海上只有出事的时候才有东西看"。
   */
  assert(clearRate > 0.02, `晴天也会出异闻（${(clearRate * 100).toFixed(1)}%，不能是 0）`)

  // ④ 危险航段更容易出：同一套扫描比较危险度 1 与 5
  const calmRate = rate({ weatherKind: 'cloudy', dangerLevel: 1 })
  const roughRate = rate({ weatherKind: 'cloudy', dangerLevel: 5 })
  assert(roughRate > calmRate,
    `危险航段比平静航段更容易遇见（Lv1 ${(calmRate * 100).toFixed(1)}% / Lv5 ${(roughRate * 100).toFixed(1)}%）`)

  // ⑤ 文案：一行、≤18 字、不带阿拉伯数字（它不是数据面板）
  const kinds = new Set<string>()
  for (let i = 0; i < 400; i++) {
    // 用可复现的伪随机遍历各种组合，覆盖全部 kind 与文案
    const r = rollSeaOmen(ctx({
      day: 40 + i * 5,
      lastOmenDay: 0,
      weatherKind: ['clear', 'cloudy', 'rain', 'storm', 'fog'][i % 5],
      dangerLevel: 1 + (i % 5),
      rand: (() => { let k = 0; return () => ((i * 9301 + (k++) * 49297) % 233280) / 233280 })(),
    }))
    if (!r) continue
    kinds.add(r.kind)
    assert(r.text.length <= 18, `异闻文案 ≤18 字（实得 ${r.text.length}：「${r.text}」）`)
    assert(!/[0-9]/.test(r.text), `异闻文案不带阿拉伯数字（「${r.text}」）`)
  }
  assert(kinds.size >= 5, `覆盖到多种异闻（实得 ${[...kinds].join('/')}）`)

  // ⑥ 它不该改任何数值：只返回 kind/text/day 三个字段
  const one = rollSeaOmen(ctx({ rand: () => 0 }))!
  assert(Object.keys(one).sort().join(',') === 'day,kind,text',
    `异闻只返回 kind/text/day（实得 ${Object.keys(one).join(',')}）`)
  assert(OMEN_CHANCE > 0 && OMEN_CHANCE < 0.3, `基准概率克制（${OMEN_CHANCE}，一天一遇会变噪音）`)
}
/*
 * 航路里程碑：把"往哪走"变成可读目标。
 *
 * 这套东西最容易出的两个错：
 *   ① `atPorts` 里写了一个不存在的港口 id → 里程碑永远达不成，但界面上还在提示玩家去
 *   ② 一次到港同时跨两级时只结算一级（从塞维利亚直航哈瓦那会同时越过"新大陆"）
 */
console.log('\n== 航路里程碑 ==')
{
  // ① 每个目标港口 id 都必须真实存在（拼错 = 永远达不成）
  const portIds = new Set(ports.map(p => p.id))
  const bad = voyageMilestones.filter(m => m.atPorts.some(id => !portIds.has(id)))
  assert(bad.length === 0,
    `里程碑的目标港口都真实存在${bad.length ? '（不存在：' + bad.map(m => m.id).join(',') + '）' : ''}`)

  // ② 顺序推进：什么都没发现时指向第一段
  assert(nextMilestone([])?.id === 'beyond_pillars', '开局指向"出了海格力斯之柱"')
  // 到过埃尔米纳 → 第一段完成，指向新大陆
  assert(nextMilestone([6, 9])?.id === 'new_world', '到过埃尔米纳后指向"看见新大陆"')
  // 加勒比任一港即可（不必是哈瓦那）
  assert(nextMilestone([6, 9, 4])?.id === 'cape_of_storms', '到过托尔图加也算"看见新大陆"')

  // ③ 全走完 → null（界面据此显示结束语，而不是留一张空卡）
  const all = voyageMilestones.flatMap(m => m.atPorts)
  assert(nextMilestone(all) === null, '全部达成后不再有下一段')

  // ④ 一次跨两级也只算一次"新达成"，但两段都要结算
  const jumped = newlyReached([6], [6, 1])
  assert(jumped.length === 1 && jumped[0].id === 'new_world',
    `直航哈瓦那只结算"看见新大陆"这一段（实得 ${jumped.map(m => m.id).join(',')}）`)
  const two = newlyReached([], [10])
  assert(two.map(m => m.id).sort().join(',') === 'beyond_pillars,cape_of_storms',
    `一下到开普敦会同时达成两段（实得 ${two.map(m => m.id).join(',')}）`)

  // ⑤ 真实到港结算：金币与声望都要到账，且不能重复发
  {
    const s0 = useGameStore.getState()
    useGameStore.setState({
      fleet: { ...s0.fleet, gold: 1000, fame: 0 },
      discoveredPorts: [6],
      crewRoster: [],
      notifications: [],
    })
    const before = useGameStore.getState().fleet.gold
    useGameStore.getState().discoverPort(1) // 哈瓦那 → 看见新大陆
    const st1 = useGameStore.getState()
    const reward = voyageMilestones.find(m => m.id === 'new_world')!.reward
    assert(st1.fleet.gold === before + reward.gold,
      `到哈瓦那结算里程碑金币 +${reward.gold}（实得 ${st1.fleet.gold - before}）`)
    assert(st1.fleet.fame >= reward.fame,
      `同时结算声望 +${reward.fame}（实得 ${st1.fleet.fame}）`)
    assert(st1.notifications.some(n => n.title.includes('航路')), '里程碑会留下一条通知')
    // 再"发现"一次同一港：discoverPort 直接返回，不重复发钱
    const goldAfter = useGameStore.getState().fleet.gold
    useGameStore.getState().discoverPort(1)
    assert(useGameStore.getState().fleet.gold === goldAfter, '同一港口不会重复结算里程碑')
  }

  // ⑥ 建议目的港：给最近的一个（还没去过的）
  {
    const m = voyageMilestones.find(x => x.id === 'new_world')!
    // 从塞维利亚出发，加勒比七港里最近的是圣胡安（约 3200 海里）
    // 注意这里返回的是**大圆距离**（gcDistanceNm）：它只用来排序，
    // 玩家看到的航程是避陆后的弧长，由 utils/voyage.routeFacts 另算。
    const near = suggestPortFor(m, [6], [37.39, -5.98])
    assert(near !== null && near.gcDistanceNm > 1000,
      `从塞维利亚出发会给出一个加勒比目的港（${near?.nameCn} ${near?.gcDistanceNm} 海里）`)
    // 已经去过的港要从候选里剔除
    const skip = suggestPortFor(m, [6, 5], [37.39, -5.98])
    assert(skip === null || skip.id !== 5, '已经到过的港口不会再被推荐')
  }
}
/*
 * 海面漂流物（SeaDebris）：地图上唯一"主动去点"的东西。
 *
 * 这套逻辑最容易出的错是**只增不减**（木桶越积越多，最后海面像垃圾场），
 * 以及停泊时还在生成（码头边漂着木桶不合理）。三条都要单独钉住。
 */
console.log('\n== 海面漂流物 ==')
{
  const spot = (day: number): DebrisSpot => ({ id: `d${day}`, kind: 'barrel', lat: 30, lng: -10, bornDay: day })

  // ① 过期：超过 TTL 就消失（不是"永远留着"）
  const old = [spot(1), spot(4)]
  const after = advanceDebris(old, 5, [30, -10], { sailing: true, rand: () => 0.99 })
  assert(after.length === 1 && after[0].bornDay === 4,
    `第 1 天的漂流物在第 5 天已漂走（剩 ${after.length} 个，TTL ${DEBRIS_TTL_DAYS} 天）`)

  // ② 上限：到量就不再生成（rand=0 保证"一定会生成"）
  const full = [spot(4), spot(4), spot(4)]
  const capped = advanceDebris(full, 5, [30, -10], { sailing: true, rand: () => 0 })
  assert(capped.length <= DEBRIS_MAX, `同时在海上不超过 ${DEBRIS_MAX} 个（实得 ${capped.length}）`)

  // ③ 停泊时不生成（但已有的仍会过期）
  const docked = advanceDebris([], 5, [30, -10], { sailing: false, rand: () => 0 })
  assert(docked.length === 0, '停泊时不会在码头边漂来木桶')

  // ④ 概率克制：rand 落在阈值之上就什么都不生成
  const noSpawn = advanceDebris([], 5, [30, -10], { sailing: true, rand: () => 0.99 })
  assert(noSpawn.length === 0, `概率 ${DEBRIS_SPAWN_CHANCE} 之下不会每次都生成`)

  // ⑤ 生成的位置是有效坐标，且 id 不重复
  const one = spawnDebris([36, -6], 7, () => 0)
  assert(one !== null && Number.isFinite(one.lat) && Number.isFinite(one.lng),
    `生成的漂流物坐标有效（${one?.lat.toFixed(2)}, ${one?.lng.toFixed(2)}）`)
  const a = spawnDebris([36, -6], 7, () => 0)
  const b2 = spawnDebris([36, -6], 7, () => (0.5))
  assert(!!a && !!b2 && a.id !== b2.id, '不同方位生成的漂流物 id 不同（否则 React key 会撞）')

  // ⑥ 四种漂流物的收益都是"小而真"的：不能改变航向，但值得伸手
  for (const k of ['barrel', 'crate', 'coins', 'bottle'] as const) {
    const gain = debrisGain(k)
    // 瓶中信给的是声望不是物资，所以四类统一按"点数"合计（声望 1 点折 1）
    const worth = gain.gold + gain.food + gain.water + gain.fame
    assert(worth >= 3 && worth <= 60, `${k} 的收益克制（合计 ${worth}）`)
    assert(gain.text.length > 0 && gain.text.length <= 24, `${k} 的反馈文案 ≤24 字（${gain.text}）`)
  }

  // ⑦ 真实打捞：东西从海面消失、资源到账
  {
    const s0 = useGameStore.getState()
    useGameStore.setState({
      fleet: { ...s0.fleet, gold: 500, food: 20, water: 20 },
      debrisSpots: [{ id: 'test-coins', kind: 'coins', lat: 30, lng: -10, bornDay: s0.fleet.day }],
      notifications: [],
    })
    useGameStore.getState().collectDebris('test-coins')
    const st = useGameStore.getState()
    assert(st.debrisSpots.length === 0, '打捞后漂流物从海面消失')
    assert(st.fleet.gold === 560, `零钱袋打捞到账（500 → ${st.fleet.gold}）`)
    assert(st.notifications.some(n => n.title.includes('打捞')), '打捞会留在日志里')
    // 重复点同一个 id 不该二次结算
    const gold = st.fleet.gold
    useGameStore.getState().collectDebris('test-coins')
    assert(useGameStore.getState().fleet.gold === gold, '同一个漂流物不会被结算两次')
  }

  // ⑧ 满仓打捞木桶：屏幕上必须真的有数字变化
  //
  // 【抓到过什么】collectDebris 原来自己夹了 Math.min(100, food+6)，
  // 而港口补给根本不设上限。粮水 100 时点木桶，两个数都纹丝不动 ——
  // 玩家看到的就是"点了没反应"。这条断言锁住"承诺 +6 就真给 +6"。
  {
    const s0 = useGameStore.getState()
    useGameStore.setState({
      fleet: { ...s0.fleet, food: 100, water: 100 },
      debrisSpots: [{ id: 'test-barrel-full', kind: 'barrel', lat: 30, lng: -10, bornDay: s0.fleet.day }],
    })
    useGameStore.getState().collectDebris('test-barrel-full')
    const st = useGameStore.getState()
    assert(st.fleet.food === 106 && st.fleet.water === 106,
      `满仓时木桶仍 +6/+6（实得 ${st.fleet.food}/${st.fleet.water}）`)
    assert(st.debrisSpots.length === 0, '木桶打捞后从海面消失')
  }
}
/*
 * 航行中「加餐」：海上唯一的主动士气操作。
 *
 * 士气**没有每日衰减**（只有断粮断水那天才掉），是事件驱动的：
 * 被海盗/风暴打掉之后，原来只能绕回港口休整补回来。
 * 这条给了一个"在海上也能补"的小决定，对 30 天以上的远洋最有意义。
 * 三个约束必须同时成立：只在航行中、每天一次、粮水够。
 */
console.log('\n== 航行中加餐 ==')
{
  const set = (patch: Record<string, unknown>) => {
    const s = useGameStore.getState()
    useGameStore.setState({
      fleet: { ...s.fleet, isSailing: true, day: 10, food: 30, water: 30, morale: 50, ...patch },
      messDay: -1,
      notifications: [],
    })
    const t = useGameStore.getState()
    useGameStore.setState({ fleet: { ...t.fleet, ...patch } })
  }

  // ① 正常加餐：粮 -2、水 -1、士气 +10
  set({})
  useGameStore.getState().holdMess()
  let st = useGameStore.getState()
  assert(st.fleet.food === 28 && st.fleet.water === 29,
    `加餐消耗粮 2 水 1（粮 30→${st.fleet.food}，水 30→${st.fleet.water}）`)
  assert(st.fleet.morale === 60, `士气 50 → ${st.fleet.morale}（+10）`)
  assert(st.notifications.some(n => n.title.includes('小灶')), '加餐会留一句日志')

  // ② 同一天不能第二次（否则就是"粮→士气"的搬运工）
  useGameStore.getState().holdMess()
  st = useGameStore.getState()
  assert(st.fleet.food === 28 && st.fleet.morale === 60,
    `同一天第二次无效（粮仍 ${st.fleet.food}、士气仍 ${st.fleet.morale}）`)

  // ③ 换一天可以再来
  const s3 = useGameStore.getState()
  useGameStore.setState({ fleet: { ...s3.fleet, day: 11 } })
  useGameStore.getState().holdMess()
  assert(useGameStore.getState().fleet.food === 26, '第二天可以再开一次小灶（粮 28→26）')

  // ④ 停泊时无效：港口有休整（粮 5→士气 10）与盛宴，加餐更便宜会让那两条作废
  set({ isSailing: false, food: 30 })
  useGameStore.getState().holdMess()
  assert(useGameStore.getState().fleet.food === 30, '停泊时不能加餐（那是港口的事）')

  // ⑤ 粮不够时无效
  set({ food: 1 })
  useGameStore.getState().holdMess()
  assert(useGameStore.getState().fleet.food === 1, '粮不足 2 时加餐无效')

  // ⑥ 士气不超上限
  set({ morale: GAME_BALANCE.MORALE_MAX - 3 })
  useGameStore.getState().holdMess()
  assert(useGameStore.getState().fleet.morale === GAME_BALANCE.MORALE_MAX,
    `士气封顶在 ${GAME_BALANCE.MORALE_MAX}（实得 ${useGameStore.getState().fleet.morale}）`)
}

/*
 * 天数口径守卫：面板上的"约 N 天"必须与真正推进用的公式同源。
 *
 * 背景：舰队面板原来用 `calculateSailingDays(route, fleet)`，函数内部只传了
 * route.windFavor —— **不含天候、不含方针**。于是面板写"约 2 天"，
 * 抢行时实际 1 天多、暴风雨谨慎时 4 天，玩家按面板备水会死在半路。
 *
 * 这类问题靠"看代码"很难发现（公式分散在 6 个文件里），所以直接钉一条
 * 源码级断言：业务代码里不许再出现那个只含风向的简化函数。
 */
console.log('\n== 天数口径守卫 ==')
{
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p, out)
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
    }
    return out
  }
  /*
   * 判据只看 **import 语句**，不看全文：注释里提到这个函数名是正常的
   * （FleetPanel 的注释在解释为什么把它换掉了）。第一版按全文匹配，
   * 于是被两条注释误报，反而把真正的问题淹没在噪音里。
   */
  const offenders = walk(join(process.cwd(), 'src', 'components'))
    .filter(f => /^\s*import\b[^\n]*calculateSailingDays/m.test(readFileSync(f, 'utf8')))
  assert(offenders.length === 0,
    `组件里不许用只含风向的 calculateSailingDays${offenders.length ? '（' + offenders.map(f => f.split(/[\\/]/).pop()).join(',') + '）' : ''}`)

  // 同一组输入下，四种口径必须给出同一个日航程
  const f = { ...useGameStore.getState().fleet, isSailing: true }
  const a = dailyDistanceNm(f, [], 1.1, 1.7, 0.9)
  const b = dailyDistanceNm(f, [], 1.1, 1.7, 0.9)
  assert(a === b, `同参数下日航程可复现（${Math.round(a)} 海里/天）`)
  assert(dailyDistanceNm(f, [], 1, 1.7, 1) > dailyDistanceNm(f, [], 1, 1, 1),
    '方针倍率确实进了日航程（抢行快于按部就班）')
  assert(dailyDistanceNm(f, [], 1, 1, 0.6) < dailyDistanceNm(f, [], 1, 1, 1),
    '天候倍率确实进了日航程（暴风雨慢于晴天）')
}

/* ===== 航海日志 / 存档导出导入 / 结局不停机 ===== */
{
  console.log('\n== 航海日志与存档 ==')

  // --- 见闻：线索必须是"真实存在且没去过"的港口，不编造目标 ---
  const allPortIds = ports.map(p => p.id)
  const firstRumor = pickRumor([6], 3, 6)
  assert(firstRumor !== null && firstRumor.id !== 6 && allPortIds.includes(firstRumor.id),
    '线索指向真实存在、且没去过的港')
  assert(pickRumor(allPortIds, 3, 6) === null, '全图点亮后不再编造线索')
  assert(makeArrivalEntry(999, 3, [6]) === null, '未知港口不写页')

  const page = makeArrivalEntry(1, 3, [6])!
  assert(page.id === 'arrival-3-1' && page.read === false, '到港生成一页未读见闻')
  assert(page.targetPortId !== 1 && page.targetPortId != null, '线索不指向脚下这座港')
  assert(page.hint !== null && page.hint.includes('不催'), '线索不设期限、明说没有催')
  assert(makeArrivalEntry(1, 3, [6])?.id === page.id, '同一天同港 id 稳定（可去重）')
  assert(makeArrivalEntry(1, 4, [6])?.id !== page.id, '不同天是不同的一页')

  // --- 封顶淘汰：称号页是最早写的，不能因为长局被挤掉 ---
  const titlePage = makeTitleEntry({ key: 't', name: '甲', desc: '乙' }, 1)
  let thick = appendLogbook([], titlePage)
  for (let d = 2; d <= LOGBOOK_MAX + 12; d++) {
    thick = appendLogbook(thick, makeArrivalEntry(1, d, [6])!)
  }
  assert(thick.length === LOGBOOK_MAX, `长局日志封顶在 ${LOGBOOK_MAX} 页`)
  assert(thick.some(e => e.kind === 'title'), '封顶淘汰时称号页永远保留')
  assert(markAllRead(thick).every(e => e.read), '打开见闻页后全部标已读')

  // --- 存档：格式校验 + 白名单（导入不能覆盖 store 的 action 函数） ---
  const goodText = JSON.stringify({
    version: SAVE_VERSION,
    state: { fleet: { gold: 500, day: 3 }, logbook: [], setActivePanel: 'OVERWRITE' },
  })
  const good = parseSaveText(goodText)
  assert(good.ok === true, '合法存档可读入')
  if (good.ok) {
    assert(!('setActivePanel' in good.value.state), '白名单挡住伪造的 action 字段')
    assert((good.value.state.fleet as { gold: number }).gold === 500, '存档里的舰队数据原样保留')
  }
  assert(parseSaveText('not json').ok === false, '坏 JSON 被拒')
  assert(parseSaveText('{}').ok === false, '缺版本号被拒')
  assert(parseSaveText(JSON.stringify({ version: SAVE_VERSION, state: {} })).ok === false, '缺舰队数据被拒')
  assert(parseSaveText(JSON.stringify({ version: SAVE_VERSION + 1, state: { fleet: { gold: 1 } } })).ok === false,
    '来自未来版本的存档被拒（不静默丢日志）')
  assert(parseSaveText(JSON.stringify({ version: 1, state: { fleet: { gold: 1 } } })).ok === true,
    '老版本存档放行，交给 migrate 补字段')

  /*
   * 白名单与 partialize 必须是同一份：改一处忘另一处，导入就会悄悄丢进度。
   * 这里用源码守卫而不是 persist.getOptions() —— Node 环境没有 localStorage，
   * middleware 不会挂上 .persist，运行时拿不到配置；读源码反而是稳定的判据。
   */
  const storeSrc = readFileSync(join(process.cwd(), 'src', 'store', 'useGameStore.ts'), 'utf8')
  assert(storeSrc.includes('name: SAVE_KEY'), '存档键只定义一份（store 引用常量）')
  assert(storeSrc.includes('version: SAVE_VERSION'), '存档版本只定义一份（store 引用常量）')
  const pStart = storeSrc.indexOf('partialize: (state) => ({')
  const pEnd = storeSrc.indexOf('}),', pStart)
  const partialBlock = storeSrc.slice(pStart, pEnd)
  const persistedKeys = [...partialBlock.matchAll(/(\w+):\s*state\.(\w+)/g)].map(m => m[1])
  const missing = SAVE_FIELDS.filter(k => !persistedKeys.includes(k))
  const extra = persistedKeys.filter(k => !(SAVE_FIELDS as readonly string[]).includes(k))
  assert(missing.length === 0 && extra.length === 0,
    `导入白名单与 partialize 完全一致${missing.length || extra.length ? `（缺 ${missing.join(',')} / 多 ${extra.join(',')}）` : ''}`)

  // --- store 集成：到港写页、同天去重 ---
  const base = useGameStore.getState()
  useGameStore.setState({
    logbook: [], claimedVictories: [], collectedDebris: [],
    discoveredPorts: [6], gamePhase: 'playing', victoryDay: null,
    currentEvent: null,
    fleet: { ...base.fleet, day: 10, currentPortId: 1, isSailing: false, gold: 100, morale: 80, food: 100, water: 100 },
  })
  useGameStore.getState().arriveAtPort(1)
  assert(useGameStore.getState().logbook.length === 1, '靠岸带回一页见闻')
  useGameStore.getState().arriveAtPort(1)
  assert(useGameStore.getState().logbook.length === 1, '同一天同港不刷重复页')
  useGameStore.setState({ fleet: { ...useGameStore.getState().fleet, day: 11 } })
  useGameStore.getState().arriveAtPort(2)
  assert(useGameStore.getState().logbook.length === 2, '下一趟又多一页（册子会自己变厚）')

  // --- 达标 = 写称号页 + 横幅，不再 gameover 停机 ---
  const beforeWin = useGameStore.getState()
  useGameStore.setState({
    gamePhase: 'playing', gameMode: 'captain', victoryDay: null,
    claimedVictories: [], currentEvent: null,
    pendingSegment: null, pendingHelm: null, segmentCount: 0, segmentIndex: 0,
    fleet: {
      ...beforeWin.fleet, gold: GAME_BALANCE.VICTORY_GOLD + 10,
      morale: 80, food: 100, water: 100, isSailing: true, day: 12,
    },
  })
  const pagesBeforeWin = useGameStore.getState().logbook.length
  useGameStore.getState().advanceDay()
  const won = useGameStore.getState()
  assert(won.gamePhase !== 'gameover', '攒够金币不再弹出停机结局')
  assert(won.claimedVictories.includes('rich'), '称号只领一次地记进状态')
  assert(won.logbook.some(e => e.kind === 'title'), '称号写成日志里的一页')
  assert(won.logbook.length === pagesBeforeWin + 1, '达标那天确实多了一页')
  assert(won.victoryDay !== null, '首次达标日仍被记录（生涯回顾要用）')
  useGameStore.getState().advanceDay()
  assert(useGameStore.getState().claimedVictories.filter(k => k === 'rich').length === 1,
    '第二天不重复领同一个称号')

  // --- 翻船后「接着看海」：不清日志 ---
  const beforeContinue = useGameStore.getState()
  useGameStore.setState({
    gamePhase: 'gameover', gameMode: 'captain',
    fleet: {
      ...beforeContinue.fleet, morale: 0, food: 0,
      ships: beforeContinue.fleet.ships.map(sh => ({ ...sh, durability: 0 })),
    },
  })
  const pagesBeforeContinue = useGameStore.getState().logbook.length
  useGameStore.getState().continueAsVisitor()
  const cv = useGameStore.getState()
  assert(cv.gamePhase === 'playing' && cv.gameMode === 'visitor', '接着看海 → 回到可航行的参观模式')
  assert(cv.logbook.length === pagesBeforeContinue + 1, '日志没被清空，还添了一页')
  assert(cv.fleet.morale >= 60 && cv.fleet.food >= 60 && cv.fleet.ships[0].durability >= 40,
    '资源拉回可航行区间（「继续」不是假按钮）')

  // --- 打捞会在图鉴里点亮一格 ---
  useGameStore.setState({
    collectedDebris: [],
    debrisSpots: [{ id: 'probe-barrel', kind: 'barrel', lat: 10, lng: -20, bornDay: 1 }],
  })
  useGameStore.getState().collectDebris('probe-barrel')
  assert(useGameStore.getState().collectedDebris.includes('barrel'), '捞过的漂流物点亮图鉴一格')

  // --- 源码守卫：结局层不再按 victoryDay 判胜负（否则"先拿称号后翻船"会显示传奇船长） ---
  const mainSrc = readFileSync(join(process.cwd(), 'src', 'pages', 'MainMap.tsx'), 'utf8')
  assert(!/const victoryDay\s*=/.test(mainSrc), '结局层不再用 victoryDay 判胜负')
  const advanceBlock = storeSrc.slice(storeSrc.indexOf('advanceDay: () =>'), storeSrc.indexOf('arriveAtPort: '))
  assert(!/gamePhase:\s*'gameover'/.test(advanceBlock), 'advanceDay 里不再因达标写 gameover')
}
// ---- 岸上视角：第二个空间的纯规则、存档边界与源码守卫 ----
{
  // 读源码而不是 useMapStore.persist.getOptions()：Node 里没有 localStorage，
  // persist middleware 的 API 在测试 bundle 中不一定挂得上（实测 undefined）。
  const mapStoreSrc = readFileSync(join(process.cwd(), 'src', 'store', 'useMapStore.ts'), 'utf8')
  const pm = mapStoreSrc.match(/partialize:\s*\(state\)\s*=>\s*\(\{([\s\S]*?)\}\)/)
  assert(!!pm, '地图 store 的 partialize 仍是显式列字段（守卫前提）')
  assert(!/viewMode/.test(pm?.[1] ?? ''), 'viewMode 不进存档（刷新一律回海图）')
  assert(!/renderMode/.test(pm?.[1] ?? ''), 'renderMode 仍不进存档（顺带守住旧规则）')
  assert(useMapStore.getState().viewMode === 'chart', '默认在海图')
  useMapStore.getState().setViewMode('harbor')
  assert(useMapStore.getState().viewMode === 'harbor', '可以切到岸上')
  useMapStore.getState().setViewMode('chart')
  assert(useMapStore.getState().viewMode === 'chart', '可以切回海图')

  // 线索只移地图，不编假港口；服务入口按本港设施过滤
  const seville = ports.find(p => p.id === 6)
  assert(clueCenter(6)?.[0] === seville?.latitude && clueCenter(6)?.[1] === seville?.longitude,
    '线索指向真实港口的坐标')
  assert(clueCenter(null) === null, '没有线索时返回 null，不编一个假港')
  assert(clueCenter(9999) === null, '不存在的港口 id 返回 null')
  assert(hasAnyService(['supply', 'trade'], ['repair', 'trade']), '任一服务命中就给入口')
  assert(!hasAnyService(['supply'], ['shipyard']), '本港没有造船厂就不给造船入口（承诺要兑现）')

  const pages: LogbookEntry[] = [
    { id: 'new', kind: 'arrival', day: 3, portId: 6, title: '新页', text: '新', aside: '', hint: '听人提起', targetPortId: 1, read: false },
    { id: 'title', kind: 'title', day: 2, portId: null, title: '称号', text: '', aside: '', hint: null, targetPortId: null, read: true },
    { id: 'old', kind: 'arrival', day: 1, portId: 6, title: '旧页', text: '旧', aside: '', hint: null, targetPortId: null, read: true },
    { id: 'other', kind: 'arrival', day: 1, portId: 2, title: '别港', text: '', aside: '', hint: null, targetPortId: null, read: true },
  ]
  assert(latestArrivalAt(pages, 6)?.id === 'new', '取该港最新一页，不是最旧')
  assert(latestArrivalAt(pages, 2)?.id === 'other', '别港的页不会串到本港')
  assert(latestArrivalAt(pages, 99) === null, '没写过的港返回 null（界面直说还没写）')
  assert(latestArrivalAt(pages, 6)?.kind === 'arrival', '称号页不会被当成到港见闻')
  // 岸上铭牌的「第 N 次靠岸」与「上一趟留下的」靠这两个纯函数，
  // 判据必须是"该港的 arrival 页"，不能把称号页或别港的页数进去。
  assert(arrivalCountAt(pages, 6) === 2, '该港累计两页，不含称号页与别港')
  assert(arrivalCountAt(pages, 2) === 1, '别港只数自己的页')
  assert(arrivalCountAt(pages, 99) === 0, '没去过的港是 0，界面不该写「第 0 次」')
  assert(previousArrivalAt(pages, 6)?.id === 'old', '上一趟取该港第二新的页，不是最新')
  assert(previousArrivalAt(pages, 2) === null, '只来过一趟的港没有「上一趟」')
  assert(previousArrivalAt(pages, 99) === null, '没去过的港也没有「上一趟」')

  // 源码守卫：这些是"改坏就打断玩家"的关键点，注入旧写法必须失败
  const mainSrc2 = readFileSync(join(process.cwd(), 'src', 'pages', 'MainMap.tsx'), 'utf8')
  assert(/pointerEvents:\s*viewMode === 'harbor' \? 'none'/.test(mainSrc2),
    '岸上时地图层关掉命中测试（否则点岸上会穿透设航点）')
  assert(/fleet\.isSailing \|\| fleet\.currentPortId == null/.test(mainSrc2),
    '出航或当前港清空时自动回海图（视角不撒谎）')
  const inviteSrc = readFileSync(join(process.cwd(), 'src', 'components', 'harbor', 'HarborInvite.tsx'), 'utf8')
  assert(/wasSailing\.current && !fleet\.isSailing/.test(inviteSrc),
    '邀请条只认「刚从海上回来」的下降沿，刷新页面不重弹')
  assert(/AUTO_HIDE_MS/.test(inviteSrc), '邀请条会自动收起，不常驻')
  const harborSrc = readFileSync(join(process.cwd(), 'src', 'components', 'harbor', 'HarborView.tsx'), 'utf8')
  assert(/hasAnyService\(port\.services, s\.needs\)/.test(harborSrc),
    '岸上服务入口按本港设施过滤')
  assert(/clueCenter\(entry\?\.targetPortId/.test(harborSrc),
    '岸上线索与日志面板共用同一份判定')
  const logbookViewSrc = readFileSync(join(process.cwd(), 'src', 'components', 'panels', 'LogbookViews.tsx'), 'utf8')
  assert(/clueCenter\(targetPortId\)/.test(logbookViewSrc), '日志面板也走同一份线索判定')

  // 第二空间不能只有港口面板里的隐藏入口：桌面/移动都要有常驻开关
  assert(mainSrc2.includes('data-testid="view-mode-switch"'), '桌面侧栏有常驻的海图/岸上开关')
  assert(/disabled=\{!canAshore && viewMode !== 'harbor'\}/.test(mainSrc2),
    '航行中开关是明确的禁用态，不是"点了没反应"')
  const tabSrc = readFileSync(join(process.cwd(), 'src', 'components', 'ui', 'MobileTabBar.tsx'), 'utf8')
  assert(tabSrc.includes("it.key === 'view' ? 'view-mode-switch' : undefined"),
    '移动端底栏也有同一个常驻开关')
  assert(tabSrc.includes('grid-cols-10') && tabSrc.includes('grid-cols-5'),
    '十个入口在横屏一行 / 竖屏两行都排得下，不把港口贸易挤出屏幕')
  assert(/harbor-previous-visit/.test(harborSrc), '第二趟起岸上能翻到上一趟留下的那页')
  /*
   * 【首局顺序：致辞在前，教学在后】
   * 原来是"教学进行中不弹致辞"，于是玩家被 10 步教学教完、刚点「开始冒险」，
   * 一段老领航员对白才压上来把侧栏全盖住——实测这时候连点两次「贸易」都命中
   * 在那层 `bg-black/45` 上，`activePanel` 一直是 null。这是"点了没反应"的又一例。
   * 三条守卫锁住当前约定：
   *   ① 开场致辞不再等教学（条件里没有 tutorialActive）；
   *   ② 教学渲染要等对白关掉（否则两块整屏层叠在一起、Enter 被两边抢）；
   *   ③ 教学首句不能再是"欢迎来到大航海时代"（致辞刚说过，等于倒着讲）。
   */
  assert(/if \(gamePhase === 'playing' && !dialogueSeen\.includes\(OPENING_SCRIPT_ID\)\)/.test(mainSrc2),
    '开场致辞不再以"教学未开始"为前提')
  assert(/!dialogueOpen && tutorialStep >= 0/.test(mainSrc2),
    '对白开着时不叠教学遮罩（两块整屏层会互相吃掉点击）')
  /*
   * 【开局只留 4 屏，且最后一屏不许把重复内容加回来】
   * 原先 5 屏，最后一屏「第一次出航」91 字，两句提示在教程第 4/5 步和模式卡上
   * 都讲过一遍（而且更细），属于纯重复：多一屏动画、多一次点击、零信息增益。
   * 现在把"你的座船"那张卡搬到天赋页底部，删除整屏。
   * 三条断言：页数=4；「第一次出航」标题不再出现；那句重复的航线提示不再出现。
   */
  /*
   * 【字体必须自托管，不许再有 Google Fonts 外链】
   * 实测（.workbuddy/probe-fonts-offline.mjs，CDP 阻断两个域名）：
   *   外链时：FCP +436ms、DCL +530ms（这还是"立即失败"的乐观情况，真实被墙是超时）
   *   自托管后：阻断 GF 完全无影响，FCP/LCP 各降约 400ms
   * 五个 latin 子集合计 109KB，比等一个可能永远不来的请求划算。
   */
  {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
    assert(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html),
      'index.html 里没有 Google Fonts 外链（外链样式表会阻塞渲染）')
    const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8')
    for (const f of ['pirata-one-400-latin', 'crimson-text-400-latin',
      'crimson-text-400-italic-latin', 'crimson-text-600-latin', 'crimson-text-700-latin']) {
      const p = join(process.cwd(), 'src', 'assets', 'fonts', `${f}.woff2`)
      assert(existsSync(p), `字体 ${f}.woff2 存在`)
      assert(css.includes(`./assets/fonts/${f}.woff2`), `index.css 里声明了 ${f}`)
      const kb = Math.round(readFileSync(p).length / 1024)
      assert(kb > 4 && kb <= 120, `字体 ${f} 体积合理（实际 ${kb}KB）`)
    }
    // 标题/正文两族的 @font-face 都要有，缺一个就会静默回退到系统衬线
    assert(/font-family: 'Pirata One'/.test(css), '@font-face 声明了 Pirata One')
    assert(/font-family: 'Crimson Text'/.test(css), '@font-face 声明了 Crimson Text')
  }
  /*
   * 【开局 4 屏不许等地图代码】
   * bundle 实测（`.workbuddy/vite.analyze.ts`，按库/目录拆包）：
   *   拆之前 首屏 JS 313KB gz（index 一个 chunk 装下 react + leaflet + 地图 + 面板 + 数据）
   *   拆之后 189KB gz（地图 62KB、事件卡 28KB、面板各自 1~5KB 都进了懒加载块）
   * 实测第一屏出现 903~959ms → 464~473ms（同一把尺子：模拟 Pages 的 gzip 服务 + 4G + 禁缓存，
   * 判据是"翻开日志"按钮出现，不用 FCP —— 无头环境 FCP 与字节数不成比例）。
   * 守卫要点：
   *   ① 地图/面板/浮层必须是 `lazy(() => import(...))`，不许回到静态 import（一回去就全进首屏）；
   *   ② 地图块在**模块求值时**预取：它是玩家点「启航」立刻要的东西（放空闲取实测要等 280ms）；
   *   ③ 每个懒加载组件都得有 Suspense 兜底，否则挂起时整棵树报错；
   *   ④ react-router 已移除 —— 全项目只有一条路由，白带 35KB/13KB gz。
   */
  {
    const mainSrc = readFileSync(join(process.cwd(), 'src', 'pages', 'MainMap.tsx'), 'utf8')
    for (const [name, mod] of [
      ['MapView', '@/components/map/MapView'],
      ['HarborView', '@/components/harbor/HarborView'],
      ['TradePanel', '@/components/panels/TradePanel'],
      ['FleetPanel', '@/components/panels/FleetPanel'],
      ['PortDetail', '@/components/panels/PortDetail'],
      ['ShipyardPanel', '@/components/panels/ShipyardPanel'],
      ['TaskPanel', '@/components/panels/TaskPanel'],
      ['AchievementPanel', '@/components/panels/AchievementPanel'],
      ['RivalPanel', '@/components/panels/RivalPanel'],
      ['EventLog', '@/components/panels/EventLog'],
      ['VoyagePlanModal', '@/components/map/VoyagePlanModal'],
      ['SegmentDecision', '@/components/map/SegmentDecision'],
      ['HelmModal', '@/components/map/HelmModal'],
      ['EventCard', '@/components/events/EventCard'],
    ] as const) {
      assert(mainSrc.includes(`const ${name} = lazy(() => import('${mod}'))`),
        `${name} 是懒加载块（静态 import 会把地图/面板塞回首屏）`)
      assert(!new RegExp(`^import ${name} from`, 'm').test(mainSrc),
        `${name} 没有残留静态 import`)
    }
    // ② 地图块在模块求值时预取（不是只在空闲时）
    assert(/if \(import\.meta\.env\.PROD\) void import\('@\/components\/map\/MapView'\)/.test(mainSrc),
      '地图块在模块求值时预取（否则急性子玩家点「启航」要干等约 280ms）')
    assert(/function prefetchSurface/.test(mainSrc), '其余块有空闲预取函数')
    assert(/requestIdleCallback/.test(mainSrc), '空闲预取用 requestIdleCallback（别和开局大图抢带宽）')
    // 预取只在生产跑：dev server 按需编译，13 个动态 import 会把主线程和 dev server 一起占住，
    // 让 e2e 出现"点开面板没反应"的假故障（本轮实测）
    assert(/if \(!import\.meta\.env\.PROD\) return/.test(mainSrc), '预取在 dev 下直接返回')
    // ③ Suspense 兜底：地图 / 岸上 / 左面板 / 右面板 / 浮层组 / 事件卡
    const suspenseN = (mainSrc.match(/<Suspense /g) ?? []).length
    assert(suspenseN >= 5, `懒加载组件都有 Suspense 兜底（实际 ${suspenseN} 处）`)
    // ④ 路由依赖彻底移除
    const appSrc = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8')
    // 只匹配 import 语句：注释里为了解释原因也写了 react-router，
    // 全文匹配会把解释当成违规（这类误报已经第四次了，判据一律落在语法结构上）
    assert(!/from 'react-router-dom'/.test(appSrc), 'App 不再套 react-router（单路由，纯死重量）')
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as
      { dependencies?: Record<string, string> }
    assert(!pkg.dependencies?.['react-router-dom'], 'package.json 里没有 react-router-dom')
    assert(!/from 'react-router/.test(readFileSync(join(process.cwd(), 'src', 'pages', 'MainMap.tsx'), 'utf8')),
      'MainMap 里也没有路由引用')
    // 首屏探针判「进入游戏」靠的是这块遮罩消失，不是「翻开日志」按钮消失
    // （那个按钮点第一下就没了，曾量出 -8182ms）。锚点没了要能立刻发现。
    const introSrc = readFileSync(join(process.cwd(), 'src', 'components', 'intro', 'IntroScreen.tsx'), 'utf8')
    assert(/data-testid="intro-screen"/.test(introSrc), '开局遮罩有稳定锚点（首屏探针靠它判进入游戏）')
    // 事件正文锚点：copy-density-audit 靠它做「逐字等于数据源」的信息守恒巡检
    const eventCardSrc = readFileSync(join(process.cwd(), 'src', 'components', 'events', 'EventCard.tsx'), 'utf8')
    assert(/data-testid="event-description"/.test(eventCardSrc),
      '事件正文有巡检锚点（密度巡检靠它读文案，别只量帮助和小游戏）')
    // 经纬网透明度按相机距离衰减：基准值只在一处定义，运行时不许写死第二个 0.22
    const gratSrc = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'mapGraticule3d.ts'), 'utf8')
    const viewSrc = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'Map3DView.tsx'), 'utf8')
    assert(/export const GRATICULE_OPACITY_NEAR/.test(gratSrc), '经纬网近景透明度有单一来源')
    assert(/graticule\.material\.opacity = GRATICULE_OPACITY_NEAR/.test(viewSrc),
      '极远视角会按相机距离压低经纬网透明度')
    assert(/\(camState\.dist - 12\)/.test(viewSrc), '衰减读的是真实相机距离，不是常量')
    // 3D 漂流物疏散的安全边界：钳住偏移 + 反投影查海陆，别把图标画到岸上
    const debrisSrc = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'debrisLayer3d.ts'), 'utf8')
    assert(/const MAX_OFFSET = MIN_GAP \* 1\.5/.test(debrisSrc),
      '疏散偏移有兜底上限，且不能小到破坏「两两间距 ≥ MIN_GAP」的收敛结果')
    assert(/isOnLand\(/.test(debrisSrc) && /isLandLoaded\(/.test(debrisSrc), '疏散后会反投影查海陆')
    // 判据只认「调用了项目自己的投影函数」，不写死局部变量名：
    // 上一版匹配 `worldZToLat(wz), worldXToLon(wx)`，当实现把 wz/wx 内联后
    // 就变成假红（`npm test | tail -3` 还把失败行截掉了，拖了一轮才发现）。
    assert(/from '@\/utils\/mapProjection'/.test(debrisSrc)
      && /worldZToLat\(/.test(debrisSrc) && /worldXToLon\(/.test(debrisSrc),
      '反投影用项目自己的投影函数，不手写换算公式')
  }
  /*
   * 【中文字体必须覆盖所有界面用字】
   * 中文子集是按文案现切的（`.workbuddy/make_font_subset.py`），文案一长就会漏字。
   * 漏字**不报错**：浏览器静默回退到另一个衬线体，一句话里两种字形。
   * 实测旧子集漏了 41 个字（啊/梅/鸡/酸/饼/舢/啐…，全在事件正文与对白里），
   * 而开发机恰好装了同款 Noto Serif SC —— 肉眼、截图、`document.fonts.check`
   * 三种查法全都看不出来（check 把系统回退也算成"能画"，恒为 true）。
   * 所以判据落在这份**由脚本从字体 cmap 直接生成**的清单上，外加字体指纹：
   *   只改字体不改清单 → sha1 对不上；只加文案不重切 → 用字不在清单里。
   */
  {
    const fontPath = join(process.cwd(), 'src', 'assets', 'fonts', 'noto-serif-sc-subset.woff2')
    const manifestPath = join(process.cwd(), 'src', 'assets', 'fonts', 'noto-serif-sc-coverage.json')
    assert(existsSync(fontPath), '中文子集字体存在')
    assert(existsSync(manifestPath), '中文字体覆盖清单存在（跑 .workbuddy/make_font_subset.py 生成）')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as
      { fontSha1: string; chars: string; fontKB: number }
    const sha1 = createHash('sha1').update(readFileSync(fontPath)).digest('hex')
    assert(sha1 === manifest.fontSha1,
      `字体与覆盖清单是同一份（清单 ${manifest.fontSha1.slice(0, 8)}… / 实际 ${sha1.slice(0, 8)}…）`
      + ' —— 改了字体要重跑 .workbuddy/make_font_subset.py')

    const covered = new Set(manifest.chars)
    // 与 make_font_subset.py 同一套字符判据：去注释、只取字符串字面量与 JSX 文本
    const lit = /'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\]*)`|>([^<>{}]*)</gs
    const used = new Set<string>()
    const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })
    const walkTyped = (dir: string): string[] => walk(dir).filter(f => /\.(ts|tsx|css|html)$/.test(f))
    for (const f of walkTyped(join(process.cwd(), 'src'))) {
      let src = readFileSync(f, 'utf8')
      src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      for (const m of src.matchAll(lit)) {
        for (const g of m.slice(1)) {
          if (!g) continue
          for (const ch of g) if (ch >= '\u3000' && ch <= '\u9fff') used.add(ch)
        }
      }
    }
    const missing = [...used].filter(c => !covered.has(c))
    assert(missing.length === 0,
      `界面用字 ${used.size} 个全在字体里（缺 ${missing.length} 个：${missing.join('')}）`
      + ' —— 跑 python .workbuddy/make_font_subset.py 重切')
    // 清单本身别退化成空壳：至少要比用字多（还有 ASCII 与标点）
    assert(manifest.chars.length > used.size, `覆盖清单 ${manifest.chars.length} 字 > 文案用字 ${used.size}`)
    // 字体不能无限长胖：现在是 362KB，卡 500KB
    assert(manifest.fontKB <= 500, `中文字体 ≤500KB（实际 ${manifest.fontKB}KB）`)
  }
  /*
   * 【素材目录不许再放 PNG】实测：ports/ 里 5 张 1600×900 PNG（11.3MB）、
   * scenes/ 里 3 张（3.2MB）、ui/ 里 9 张（0.79MB）全部**没有任何代码引用**——
   * 同目录都有 .webp 或 .svg 版本在用。它们从 10 月起就躺在 public 里，
   * 每次 build 都被拷进 dist，产物因此虚胖 15MB（34MB → 19MB 就是移走它们省下的）。
   * 守卫：这三类目录里出现 .png 就是又有人把未压缩的大图丢进来了。
   */
  {
    for (const dir of ['ports', 'scenes', 'ui']) {
      const d = join(process.cwd(), 'public', 'assets', dir)
      const pngs = readdirSync(d).filter(f => f.endsWith('.png'))
      assert(pngs.length === 0,
        `public/assets/${dir} 里没有 PNG（实际 ${pngs.length} 张：${pngs.slice(0, 3).join(', ')}）`)
    }
    // 站内素材总量上限：现在是 17MB，卡 24MB 留出加素材的余量，
    // 但 30MB+ 那种"没清死文件"的状态会被这条挡住。
    const walkSize = (dir: string): number => readdirSync(dir).reduce((a, f) => {
      const p = join(dir, f)
      const st = statSync(p)
      return a + (st.isDirectory() ? walkSize(p) : st.size)
    }, 0)
    const pubMb = walkSize(join(process.cwd(), 'public')) / 1024 / 1024
    assert(pubMb <= 24, `public 总体积 ≤24MB（实际 ${pubMb.toFixed(1)}MB；含死文件时会到 31MB）`)
  }
  /*
   * 【立绘必须是压缩过的 WebP，不许回退成整张 PNG】
   * 开局致辞那三张差分（calm/serious/hope）原来是 PNG，512×640 每张 640KB，
   * 合计 1.9MB —— 而它们是**开局第一屏就要加载**的三张图。转成 q0.88 的 WebP
   * 后每张 ~110KB（合计 328KB），视觉无差（油画质感仍在，实测手机截图比对）。
   * 守卫三件：引用必须是 .webp；portraits 目录里不许有 png；单张 ≤200KB。
   */
  {
    const dlgSrc = readFileSync(join(process.cwd(), 'src', 'utils', 'dialogue.ts'), 'utf8')
    const pngRefs = dlgSrc.match(/officer_pilot_(calm|serious|hope)\.png/g) ?? []
    assert(pngRefs.length === 0, `对白差分立绘不再引用 PNG（实际 ${pngRefs.length} 处）`)
    for (const n of ['calm', 'serious', 'hope']) {
      assert(dlgSrc.includes(`officer_pilot_${n}.webp`), `对白引用了 ${n} 的 WebP 版本`)
      const p = join(process.cwd(), 'public', 'assets', 'portraits', `officer_pilot_${n}.webp`)
      assert(existsSync(p), `${n}.webp 文件存在`)
      const kb = Math.round(readFileSync(p).length / 1024)
      assert(kb <= 200, `${n}.webp ≤200KB（实际 ${kb}KB；PNG 原图是 640KB）`)
    }
    const pngs = readdirSync(join(process.cwd(), 'public', 'assets', 'portraits')).filter(f => f.endsWith('.png'))
    assert(pngs.length === 0, `portraits 目录里没有 PNG（实际 ${pngs.join(', ') || '无'}）`)
  }
  /*
   * 【参观模式的三条承诺】模式选择页上明写着"不会输：断粮沉船都与你无关"，
   * 加上"没有教学"。这四条分散在 store 的不同分支里，任何一条被改掉，
   * 玩家就会在以为"只是逛逛"的时候被掀翻。代码层守卫 + e2e 实测双保险
   * （e2e 见 `visitor-mode.mjs`：同条件下船长第 2 天翻船、参观推到第 19 天还活着）。
   */
  {
    const storeSrc = readFileSync(join(process.cwd(), 'src', 'store', 'useGameStore.ts'), 'utf8')
    assert(/const newFood = isVisitor\s*\?\s*fleet\.food/.test(storeSrc),
      '参观模式不扣粮（承诺"断粮与你无关"）')
    assert(/const newWater = isVisitor\s*\?\s*fleet\.water/.test(storeSrc), '参观模式不扣水')
    assert(/gameMode !== 'visitor' && \(allShipsDestroyed \|\| newFleet\.morale <= 0\)/.test(storeSrc),
      '参观模式不判翻船（船毁/士气 0 都不结束）')
    assert(/const floor = isVisitor \? 1 : 0/.test(storeSrc), '参观模式船体耐久下限是 1，不会归零')
    assert(/pendingSegment: isVisitor \|\| isShortHop \? null/.test(storeSrc),
      '参观模式不进航段方针环节')
    const barSrc = readFileSync(join(process.cwd(), 'src', 'components', 'ui', 'TimelineBar.tsx'), 'utf8')
    assert(barSrc.includes('data-testid="visitor-badge"'), '主界面有常驻的「参观」标识（不只是帮助里能看到）')
    assert(/gameMode === 'visitor' && \(/.test(barSrc), '标识只在参观模式出现，船长模式不占位')
    // 手机端也要看得见：徽标不能带 hidden md:（曾经为了不挤顶栏藏起来，
    // 结果手机上只能去帮助里查模式）。让位的是「事件名」那格，不是徽标。
    assert(/className="inline-flex items-center shrink-0 rounded border border-gold-600\/55/.test(barSrc),
      '「参观」徽标在手机上也显示（不再 hidden md:）')
    assert(/hidden sm:block text-gold-400 font-serif text-\[13px\] min-w-\[130px\]/.test(barSrc),
      '「事件名」那格在手机上让位（130px 才能腾给轨道）')
  }
  const introSrc = readFileSync(join(process.cwd(), 'src', 'components', 'intro', 'IntroScreen.tsx'), 'utf8')
  {
    const pageCount = (introSrc.match(/^\s+button: '/gm) ?? []).length
    assert(pageCount === 4, `开局是 4 屏（实际 ${pageCount} 屏；每多一屏就多一次点击）`)
    // 只查 JSX 文本节点：解释原因的注释里也有这个标题，全文 includes 会误报
    // （源码守卫被注释误报，这是第二次了）
    assert(!introSrc.includes('>第一次出航<'), '删掉的那屏标题没有被加回来')
    assert(!introSrc.includes('点击海图任意一点就能规划航线'),
      '那句"怎么出航"不再重复（教程第 4 步已经讲得更细）')
    assert(/shipSprite\('caravel'\)/.test(introSrc), '座船卡还在（船型决定航速与载重，别处没有）')
  }
  const tutSrc = readFileSync(join(process.cwd(), 'src', 'constants', 'tutorial.ts'), 'utf8')
  // 只查 text: 里面真正的文案——注释里为了解释原因也写了这句话，
  // 全文 includes 会把解释本身当成违规（源码守卫被注释误报，犯过一次了）
  assert(!/text:\s*'[^']*欢迎来到大航海时代/.test(tutSrc),
    '教学首句不再和开场致辞抢同一句话')
  /*
   * 【掮客推荐必须在贸易面板里看得见】
   * 实测：开局最便宜的烟草 52 金，卖到最近的加的斯只 +2/件；而丝绸 85 金
   * 卖过去 +89/件。玩家按"哪个便宜买哪个"必然白跑一趟。推荐条与左下角那张
   * 掮客卡必须同源（都调 selectBestDeal），否则两边会各说一套。
   */
  const tradeSrc = readFileSync(join(process.cwd(), 'src', 'components', 'panels', 'TradePanel.tsx'), 'utf8')
  assert(/selectBestDeal\(useGameStore\.getState\(\)\)/.test(tradeSrc),
    '贸易面板的推荐来自 selectBestDeal（与掮客卡同一份数据）')
  assert(tradeSrc.includes('data-testid="trade-recommend"'), '推荐条有稳定锚点，e2e 才查得到')
  assert(tradeSrc.includes("data-recommended={recommended ? '1' : undefined}"),
    '被推荐的那一行有机器可读标记（不是只加个颜色）')
  assert(/\.sort\(\(a, b\) => Number\(b\.goodId === deal\?\.goodId\)/.test(tradeSrc),
    '被推荐的商品排到第一行（排第三行时 +N 按钮在折叠线以下，看得见点不到）')
  const brokerSrc = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'BrokerTip.tsx'), 'utf8')
  assert(/selectBestDeal\(st\)/.test(brokerSrc), '掮客卡也用同一个 selectBestDeal（两边不会各说一套）')
  /*
   * 背景必须走 harborBackdrop（全景图），而不是 portImage（96px 缩略图）。
   * 这条是接新素材时最容易悄悄退回去的地方：缩略图也能铺满 object-cover，
   * 页面不报错、截图不空白，只是"糊"——而"糊"没有任何断言会失败。
   */
  assert(/harborBackdrop\(port\)/.test(harborSrc), '岸上背景取全景图，不拿面板缩略图放大')
  assert(!/portImage\(port\)/.test(harborSrc), '岸上组件里不再残留 portImage(port)')
  /*
   * 【压暗参数要有上限】接高清素材时最容易白干的一步：图换对了，可 filter 与
   * 两层暗角叠下去，屏幕上的景只剩 0.08 亮度（实测）。这两个数是"能不能看见景"
   * 的直接原因，写进守卫比靠截图眼judge 可靠。
   *   brightness 0.82 → 水面 0.08（旧）；0.88 → 0.15~0.18（现在）
   *   暗角最外圈 0.92 → 四角纯黑；0.74 → 仍有轮廓
   */
  {
    const bright = Number((harborSrc.match(/brightness\((0?\.\d+)\)/) ?? [])[1])
    assert(bright >= 0.85, `背景亮度系数 ≥0.85（实际 ${bright}；0.82 时画面只剩 0.08）`)
    // 暗角最外圈用的是 rgba(10,7,3,α)，全文只此一处，可以精确定位
    const outer = Number((harborSrc.match(/rgba\(10,7,3,([\d.]+)\)/) ?? [])[1])
    assert(outer > 0 && outer < 0.80, `暗角最外圈 <0.80（实际 ${outer}；0.92 时四角纯黑、景消失）`)
  }
}

/* ===== 线索的回响 + 岸上 3D 不空转 ===== */
{
  console.log('\n== 线索应验与 3D 岸上不空转 ==')

  // 造一句"第 1 天在塞维利亚听人提起哈瓦那"的旧线索
  const clue: LogbookEntry = {
    ...makeArrivalEntry(6, 1, [6])!,
    id: 'arrival-1-6',
    hint: '酒馆里有人提起哈瓦那——没说什么时候去，也不催。',
    targetPortId: 1,
    read: true,
  }
  assert(findClueFor([clue], 1)?.id === clue.id, '能找到指向该港的旧线索')
  assert(findClueFor([clue], 2) === null, '别的港不认这条线索')

  const echo = makeEchoEntry(clue, 1, 5)!
  assert(echo.kind === 'echo' && echo.id === 'echo-5-1' && echo.day === 5, '应验页记的是本次到达日')
  assert(echo.text.includes('第 1 天') && echo.text.includes('塞维利亚') && echo.text.includes('哈瓦那'),
    '应验文案的天数 / 听说地 / 到达港全部来自真实数据')
  assert(echo.hint === null && echo.targetPortId === null, '应验页不再派新任务、不再接新尾巴')
  const book = [echo, clue]
  assert(echoDayFor(book, 1) === 5, '旧页能读到真实应验天数')
  assert(echoDayFor([clue], 1) === null && echoDayFor(book, null) === null, '没应验就不编天数')
  assert(echoAt(book, 1, 5) === echo && echoAt(book, 1, 6) === null, '通知只认本次到达的应验页')
  assert(findClueFor(book, 1) === null, '已有应验页时不再重复收尾')
  assert(echoForPort(book, 1) === echo && countEchoes(book) === 1, '个人纪录只数真正应验过的页')

  // 应验页同时是去重凭据：被上限挤掉就会"再应验一次"
  let thick2 = appendLogbook([], echo)
  for (let d = 2; d <= LOGBOOK_MAX + 12; d++) {
    thick2 = appendLogbook(thick2, makeArrivalEntry(1, d, [6])!)
  }
  assert(thick2.length === LOGBOOK_MAX && echoForPort(thick2, 1)?.id === echo.id,
    '长局里应验页不被挤掉（否则会重复应验）')

  // store 集成：第一次靠上线索指向的港，见闻 + 应验共两页
  const s0 = useGameStore.getState()
  useGameStore.setState({
    logbook: [clue], discoveredPorts: [6], claimedVictories: [], collectedDebris: [],
    gamePhase: 'playing', victoryDay: null, currentEvent: null,
    fleet: { ...s0.fleet, day: 5, currentPortId: 6, isSailing: false, gold: 100, morale: 80, food: 100, water: 100 },
  })
  useGameStore.getState().arriveAtPort(1)
  const after = useGameStore.getState().logbook
  assert(after.length === 3, '首次靠上线索指向的港：见闻 + 应验共添两页（1 → 3 页）')
  assert(after[0].kind === 'echo' && after[0].day === 5, '应验页在最上面，是这趟最该先看到的一页')
  assert(after.some(e => e.kind === 'arrival' && e.portId === 1), '普通到港见闻照旧还在')
  assert(echoForPort(after, 1)?.text.includes('第 1 天'), '写的是旧线索那天，不是今天')

  useGameStore.setState({ fleet: { ...useGameStore.getState().fleet, day: 6 } })
  useGameStore.getState().arriveAtPort(1)
  assert(countEchoes(useGameStore.getState().logbook) === 1, '再回同一港不重复应验')

  useGameStore.setState({
    logbook: [], discoveredPorts: [6],
    fleet: { ...useGameStore.getState().fleet, day: 7 },
  })
  useGameStore.getState().arriveAtPort(2)
  const plain = useGameStore.getState().logbook
  assert(plain.length === 1 && plain[0].kind === 'arrival' && countEchoes(plain) === 0,
    '没有旧线索时只写见闻，不硬凑一页应验')

  // 源码守卫：改坏就打断玩家 / 数字会对不上
  const sc = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'SailingController.tsx'), 'utf8')
  assert(/echoAt\(now\.logbook, portId, now\.fleet\.day\)/.test(sc),
    '到港通知读的是 arriveAtPort 写入之后的状态（拿旧快照问不到应验页）')
  assert(sc.includes('日志添了两页'), '应验时通知说的页数等于实际写入的页数')
  // 到港有两条路径（航点就是港口 / 落在港口附近），只改一处就会一边说一页、
  // 一边说两页。教训：一次脚本多处替换必须逐处校验，别看"命令成功"。
  assert((sc.match(/message: arrivalMessage\(/g) ?? []).length === 2,
    '两条到港路径都走同一个通知文案（不多不少两处）')
  const lv = readFileSync(join(process.cwd(), 'src', 'components', 'panels', 'LogbookViews.tsx'), 'utf8')
  assert(/echoDayFor\(logbook, entry\.targetPortId\)/.test(lv), '旧线索页显示真实应验天数')
  assert(lv.includes('data-testid="clue-fulfilled"'), '旧线索页有可见的「已应验」回执')
  assert(/countEchoes\(logbook\)/.test(lv), '图鉴里的句数从日志推导，不是写死的')
  const hv = readFileSync(join(process.cwd(), 'src', 'components', 'harbor', 'HarborView.tsx'), 'utf8')
  assert(/echoForPort\(logbook, port\?\.id/.test(hv), '岸上把应验页摆回来')
  assert(hv.includes('data-testid="harbor-clue-echo"'), '岸上的回响是可见的，不是只躺在日志里')
  assert(/\{echo\.text\}/.test(hv), '岸上直接陈列应验页文案，不在第二处另拼一句')
  const m3 = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'Map3DView.tsx'), 'utf8')
  assert(/if \(useMapStore\.getState\(\)\.viewMode === 'harbor'\) return/.test(m3),
    '岸上时 3D 帧循环早退，不再逐帧空转')
}

// 中文 12px 下限：全项目不许再出现 <12px 的 Tailwind 字号。
// 实测取证见 .workbuddy/probe-small-text.mjs：改前 18 个界面共 68 条去重中文小字，
// 全部藏在浮层里，只巡检「地图上、无浮层」的 typography-audit.mjs 一条也看不见。
// 只有两个不含中文的纯符号角标例外，白名单本身也要断言命中，防止守卫空转。
{
  const srcRoot = join(process.cwd(), 'src')
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name)
    return e.isDirectory() ? walk(p) : (/\.tsx?$/.test(e.name) ? [p] : [])
  })
  const TINY = /text-\[(?:9|10|11)px\]/
  const ALLOW = [
    { name: 'MiniMap.tsx', line: /text-\[10px\].*?>N<\/span>/ },
    { name: 'WeatherBadge.tsx', line: /text-\[11px\].*?>▾<\/span>/ },
  ]
  const hitAllow = [0, 0]
  const bad: string[] = []
  for (const f of walk(srcRoot)) {
    readFileSync(f, 'utf8').split('\n').forEach((ln, i) => {
      if (!TINY.test(ln)) return
      const k = ALLOW.findIndex(a => f.endsWith(a.name) && a.line.test(ln))
      if (k >= 0) { hitAllow[k]++; return }
      bad.push(`${f.slice(process.cwd().length + 1)}:${i + 1}`)
    })
  }
  assert(bad.length === 0,
    `中文 UI 不得小于 12px（残留 ${bad.length} 处：${bad.slice(0, 3).join(', ') || '无'}）`)
  ALLOW.forEach((a, i) => assert(hitAllow[i] === 1,
    `${a.name} 的纯符号角标白名单恰好命中 1 处（守卫不空转）`))
  const audit = readFileSync(join(process.cwd(), 'test', 'e2e', 'small-text-audit.mjs'), 'utf8')
  assert(/px < 12/.test(audit), '浏览器巡检按真实 computed 字号判定，不是读源码')
  assert(/if \(marker\)/.test(audit), '每个关键场景带「确实进去了」标记，防假绿')
}

// ---- 决策浮层：默认给结论、细账折叠，但一条信息都不许删 ----
// 只断言「字变少」是危险的：把说明删掉也能让审计变漂亮，所以浏览器侧
// 有「逐节点开读回原字数」的守恒断言，这里守的是实现结构与判据本身。
{
  const help = readFileSync(join(process.cwd(), 'src', 'components', 'intro', 'HelpPanel.tsx'), 'utf8')
  const card = readFileSync(join(process.cwd(), 'src', 'components', 'ui', 'ParchmentCard.tsx'), 'utf8')
  const mg = readFileSync(join(process.cwd(), 'src', 'components', 'events', 'MiniGameOverlay.tsx'), 'utf8')
  const audit = readFileSync(join(process.cwd(), 'test', 'e2e', 'copy-density-audit.mjs'), 'utf8')

  assert(help.includes("useState<string | null>(null)") && help.includes('openSection === section.title'),
    '帮助 19 节默认收起，一次只展开一节')
  assert(help.includes('aria-expanded={open}') && help.includes('data-testid={`help-section-${section.title}`}'),
    '每节是可访问的折叠按钮，且带巡检锚点')
  assert(help.includes('footer={'), '存档/换模式入口放在不随正文滚动的常驻页脚')
  assert(!help.includes('scroll-parchment max-h-[70vh]'),
    '帮助面板不许再套第二层滚动容器（会把存档区裁到面板外）')
  assert(help.includes("btn.closest('.scroll-parchment')"),
    '点开的节要顶到滚动区开头，否则正文只露一行半')
  assert(card.includes('footer?: ReactNode') && card.includes('{footer}'),
    'ParchmentCard 提供可选常驻页脚')
  // 用正则：源码是 CRLF，写死 '\n' 会在 Windows 上假失败
  assert(/footer\s*\?\s*'max-h-\[40dvh\]/.test(card)
    && card.includes(": 'max-h-[68dvh] md:max-h-[60vh]"),
    '有常驻页脚时正文滚动区让出高度，其余面板沿用旧高度')

  assert(mg.includes('useState(false)') && mg.includes('data-testid="minigame-fine-print-toggle"'),
    '小游戏开场细则默认收起')
  assert(mg.includes('copy.bullets.map') && mg.includes('describeModifiers(modifiers, ctx)'),
    '三条玩法细则与船况加成没有被删掉，只是折叠了')
  assert(mg.includes('这一段的操作会决定结局概率往哪边偏'), '操作与结局的说明段仍在折叠区')
  assert(mg.includes('data-testid="minigame-start"'), '开始按钮带巡检锚点')

  assert(audit.includes('readBack >= 2500'), '浏览器巡检带「信息守恒」下界，不是只查字变少')
  assert(audit.includes('elementFromPoint'), '存档按钮做的是真实命中测试，不读 innerText 自证')
  assert(audit.includes('layout.scrollers === 1'), '巡检守「只有一层滚动区」')
  assert(audit.includes('reveal.visibleBody >= 90'), '巡检守「展开后正文真的看得见」')
  assert(audit.includes('width: 390, height: 844') && audit.includes('mm.exportHit'),
    '巡检覆盖移动端抽屉：页脚在屏内且导出/导入真能命中')
}

// ---------------- 历史时间轴刻线：不许画到屏幕外 ----------------
// 实测：1440 视口下 day=200 那根 2px 刻线的 rect 是 [1546,1548]，
// 把 documentElement.scrollWidth 从 1440 撑成 1548；玩家却永远看不见它。
{
  const bar = readFileSync(join(process.cwd(), 'src', 'components', 'ui', 'TimelineBar.tsx'), 'utf8')
  const data = readFileSync(join(process.cwd(), 'src', 'data', 'historicalTimeline.ts'), 'utf8')
  const audit = readFileSync(join(process.cwd(), 'test', 'e2e', 'layout-audit.mjs'), 'utf8')
  const days = [...data.matchAll(/\{ day: (\d+)/g)].map(m => Number(m[1]))

  assert(days.length >= 16 && Math.max(...days) > 150,
    `数据里确实有超过 150 天的成就节点，过滤才有区分力（最大 day=${Math.max(...days)}）`)
  assert(/const TIMELINE_LAST_DAY = 150/.test(bar), '年份换算 / 进度条 / 刻度共用同一个跨度常量')
  assert(/historicalTimeline\.filter\(e => e\.day <= TIMELINE_LAST_DAY\)/.test(bar),
    '超过历史跨度的成就节点不画刻度（否则 left>100% 会把刻线画到屏外）')
  assert(/Math\.min\(1, \(event\.day - 1\) \/ TIMELINE_LAST_DAY\)/.test(bar),
    '刻度位置有 clamp 兜底，以后加更靠后的节点也不会再溢出')
  assert(/docScrollWidth/.test(audit) && /noPageOverflow/.test(audit),
    '布局巡检有页面级横向溢出判据，不再被 2px 元素的宽高阈值漏掉')

  const harborAudit = readFileSync(join(process.cwd(), 'test', 'e2e', 'harbor-view.mjs'), 'utf8')
  assert(/getComputedStyle\(v\)\.opacity >= 0\.999/.test(harborAudit),
    '岸上像素巡检要等整屏淡入动画结束，不能截到半透明帧')
  assert(/requestAnimationFrame\(\(\) => requestAnimationFrame\(res\)\)/.test(harborAudit),
    '淡入结束后还要等两帧，让解码完的背景图真正合成到屏幕')
}

// ---------------- 回归链不许再漏掉「孤儿」巡检 ----------------
// 第 26 轮实测：6 个自带失败退出的 e2e 脚本常年不在 seg/full/all 里，只靠手工跑，
// 其中 intro-check（天赋页对比度）与 no-dialogue-interrupt（前置污染）当时就是红的。
{
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
  const ORPHANS = [
    'intro-check.mjs', 'no-dialogue-interrupt.mjs', 'contrast-audit.mjs',
    'weather-2d.mjs', 'land-texture.mjs', 'debris-3d.mjs',
  ]
  const names = readdirSync(join(process.cwd(), 'test', 'e2e'))
  const seg6 = pkg.scripts['test:e2e:seg6'] ?? ''
  for (const name of ORPHANS) {
    assert(names.includes(name), `${name} 文件还在（别把巡检删了）`)
    assert(seg6.includes(name), `${name} 已进 seg6，不再只靠手工跑`)
  }
  const full = pkg.scripts['test:e2e:full'] ?? ''
  for (let i = 1; i <= 6; i++) {
    assert(full.includes(`npm run test:e2e:seg${i}`), `full 包含 seg${i}`)
  }
  assert(full.includes('npm run test:e2e:prod'), 'full 包含生产移动端')
  assert((pkg.scripts['test:e2e:all'] ?? '').includes('npm run test:e2e:seg6'),
    'all 也包含 seg6（旧的展开式单命令不能漏）')
  // 替换脚本定义时，seg5 的值与 all 的前缀相同，曾经误把 seg6 串进 seg5 自身
  assert(!(pkg.scripts['test:e2e:seg5'] ?? '').includes('seg6'),
    'seg5 没有误引用 seg6（分段之间不许自引用）')
}

// ---------------- 出航计划：补给数字必须对得上实际结算 ----------------
// 第 27 轮实测（30 人船、哈瓦那→皇家港 6 天）：
//   面板「每日耗 3 粮 / 5 水」 vs 同一屏顶栏「每天吃 1 份」、港内实际扣 1/2；
//   判定用抢行总耗 15 粮、结论句却写「约 6 天可达」（按部就班要 18 粮）→
//   粮=15 时界面说「补给偏紧」，玩家照默认走法第 5 天断粮。
{
  const plan = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'VoyagePlanModal.tsx'), 'utf8')
  const audit = readFileSync(join(process.cwd(), 'test', 'e2e', 'supply-parity.mjs'), 'utf8')
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }

  assert(/from '@\/utils\/voyage'/.test(plan) && /dailyRates\(/.test(plan),
    '两套日耗都走 dailyRates（与顶栏、store.advanceDay 同源）')
  assert(/dailyRates\(\{ \.\.\.fleet, isSailing: true \}, 'steady'\)/.test(plan),
    '起航后日耗按结论句里的「按部就班」口径算')
  assert(!/每日耗 \{consumption\./.test(plan),
    '不许再把基础消耗 crew×0.1 当成「每日耗」直接印在屏幕上')
  assert(/ledgers\.find\(l => l\.stance\.id === 'steady'\)/.test(plan),
    '判定取「按部就班」那一档的总账（结论句写的就是它的天数）')
  assert(!/Math\.min\(\.\.\.ledgers\.map/.test(plan),
    '不许拿三档里最省的方针当判定线，那是兑现不了的承诺')
  assert(/港内每日/.test(plan) && /起航后按部就班/.test(plan),
    '面板同时标明港内与起航后两套日耗，不再让同一屏出现两个矛盾数字')
  assert(/按部就班只够/.test(plan), '「只够 N 天」标明走法，不与港内口径混用')
  assert(/全程只需/.test(plan), '按部就班不够但抢行够时，把抢行的总量写清楚')
  assert(/data-testid="voyage-supply-rates"/.test(plan) && /data-testid="voyage-verdict-text"/.test(plan),
    '对账巡检有稳定 DOM 锚点，不靠从整屏文本里正则捞')

  assert(pkg.scripts['test:e2e:supply']?.includes('supply-parity.mjs'), '补给对账有独立命令')
  assert(pkg.scripts['test:e2e:seg7']?.includes('test:e2e:supply'), '补给对账进了 seg7（seg2 只剩 3D+报价，否则整段跑过 10 分钟被 SIGTERM）')
  assert(pkg.scripts['test:e2e:all']?.includes('test:e2e:supply'), 'all 也含补给对账')
  assert(!(pkg.scripts['test:e2e:seg5'] ?? '').includes('supply'),
    'seg5 没有误引用补给对账（分段之间不许自引用）')
  assert(/advanceOnce\(\)/.test(audit) && /dailyRates\(\{ \.\.\.s\.fleet, isSailing: true \}, 'rush'\)/.test(audit),
    '巡检量的是 advanceDay 真实扣减，抢行期望值来自同一套 dailyRates')
  assert(/altRoute/.test(audit) && /假绿/.test(audit),
    '「给抢行退路」这条断言不能用 /抢行/ 判（折叠摘要恒含此词，是假绿）')
}

// ---------------- 掮客卡：天数必须与出航计划面板逐字一致 ----------------
// 第 33 轮实测：掮客卡的「N 天」用 calculateSailingDays（**不含天候倍率**），
// 出航计划面板用「按部就班 × 天候」。暴风雨里卡片写「13 天」、面板写「约 28 天可达」。
// 两处都是玩家会照着备粮水的数字，差一倍多就不能算「界面自洽」。
{
  const store = readFileSync(join(process.cwd(), 'src', 'store', 'useGameStore.ts'), 'utf8')
  const tip = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'BrokerTip.tsx'), 'utf8')
  const audit = readFileSync(join(process.cwd(), 'test', 'e2e', 'broker-parity.mjs'), 'utf8')
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8') as unknown as {
    scripts: Record<string, string>
  })

  // selectBestDeal 返回的天数必须走 voyageDays（含天候）
  // 只取 selectBestDeal 自己的函数体：整份文件里还有 selectReturnLeg 也用 voyageDays，
  // 拿全文匹配等于两个函数互相顶替，守卫就没有区分力了。
  const iBest = store.indexOf('export function selectBestDeal')
  const iReturn = store.indexOf('export function selectReturnLeg')
  const bestBody = iBest >= 0 && iReturn > iBest ? store.slice(iBest, iReturn) : ''
  assert(bestBody.length > 0, '找得到 selectBestDeal 的函数体（守卫本身没写错）')
  assert(/days: voyageDays\(\{/.test(bestBody),
    '掮客卡的显示天数走 utils/voyage.voyageDays（含天候）')
  assert(!/days: calculateSailingDays/.test(bestBody),
    '掮客卡不许再显示不含天候的旧天数')
  // 门槛仍用不含天候的天数——那是平衡参数，不该顺手改
  assert(/MIN_DEAL_PROFIT_PER_DAY/.test(bestBody) && /totalProfit \/ Math\.max\(1, days\)/.test(bestBody),
    '推荐门槛仍按不含天候的利润/天算（平衡参数，不跟着显示口径改）')
  // 卡片的天数含天候 ⇒ 卡片的天数必须随天候重算
  assert(/weather/.test(tip) && /\[portId, isSailing, gold, fame, marketStock, cargo, lastPortId, weather, landDataReady\]/.test(tip),
    '掮客卡把天候算进依赖，天候变了要重算（否则卡上留着旧天数的航程）')

  /*
   * 【第 33 轮：几何没就绪时不许报里程与天数】
   * 海陆掩码异步到位之前，buildRouteGeometry 会**退化成大圆直线**：
   * 埃尔米纳 → 里斯本 报 2157 海里（横穿撒哈拉），就绪后绕开陆地才是 2903 海里。
   * 而且那张卡不会自己纠正——它会一直挂着少报 35% 的直线里程。
   *
   * 规则：三处（掮客卡 / 交易面板 / 主屏常驻条）统一「没就绪就不报」。
   */
  const trade = readFileSync(join(process.cwd(), 'src', 'components', 'panels', 'TradePanel.tsx'), 'utf8')
  const mapView = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'MapView.tsx'), 'utf8')
  const landCheck = readFileSync(join(process.cwd(), 'src', 'utils', 'landCheck.ts'), 'utf8')
  assert(/landDataReady/.test(tip) && /const legDeal = landDataReady && deal/.test(tip),
    '掮客卡在几何没就绪时不报里程与天数（宁可少一个数字，也不报错数字）')
  assert(/landDataReady/.test(tip) && /landDataReady\]/.test(tip),
    '掮客卡把 landDataReady 算进依赖，掩码到位后自动刷新成真实弧长')
  assert(/landDataReady/.test(trade) && /dealDays = landDataReady && deal \? deal\.days : null/.test(trade),
    '交易面板里的掮客行同样按就绪状态决定报不报天数')
  /*
   * hook 必须在提前 return 之前。
   * 判据用「行首的语句」而不是 indexOf：注释里写着同一句 `if (!portId) return null`
   * 时，indexOf 会命中注释那行，于是 hook 明明在前也被判成在后（假红）。
   */
  const hookIdx = trade.search(/const landDataReady = useMapStore\(/)
  const retIdx = trade.search(/^\s*if \(!portId\) return null/m)
  assert(hookIdx >= 0 && retIdx >= 0 && hookIdx < retIdx,
    '交易面板的 useMapStore 必须在提前 return 之前（否则是条件调用，React 会直接抛错）')
  assert(/isSeaMaskLoaded\(\)\) throw new Error/.test(landCheck),
    '掩码没到位时 loadLandData 必须 reject（loadSeaMask 内部自己 catch 了，不能靠 Promise.all 报错）')
  assert(/catch\(\(\) => \{[\s\S]{0,400}setLandDataReady\(false\)/.test(mapView),
    '掩码失败时不就绪标志保持 false（置位等于允许界面报直线距离）')

  assert(pkg.scripts['test:e2e:broker']?.includes('broker-parity.mjs'), '掮客对账有独立命令')
  assert(pkg.scripts['test:e2e:seg7']?.includes('test:e2e:broker'), '掮客对账进了 seg7（不许变成孤儿巡检）')
  assert(pkg.scripts['test:e2e:all']?.includes('test:e2e:broker'), 'all 也含掮客对账')
  assert(/voyage-verdict-text/.test(audit) && /voyage-route-distance/.test(audit),
    '掮客对账读的是稳定 DOM 锚点，不是从整屏文本里正则捞')
  assert(/埃尔米纳|买进并起航/.test(audit),
    '掮客对账真的点「买进并起航」把出航计划面板开出来比数字')
}

// ---------------- 航线几何没就绪：地图不许拿直线冒充航线 ----------------
// 第 34 轮实测：地图内容（候选航线虚线、NPC 商船航线）在**挂载那一刻**算一次
// 航线几何，而挂载那一刻海陆掩码常常还在路上——那几何是**横穿陆地的大圆直线**：
//   挂载那一刻算出来的商船腿： 439 / 4035 / 1971 / 137 海里
//   掩码到位后重算的真值：      781 / 4121 / 2158 / 140 海里   （第一条差 78%）
// 而且这些几何被 React 的 memo/ref 记住，**永远不会自己纠正**。
//
// 关键机制（上一轮踩过）：`loading` 遮罩只是盖在上面的一个覆盖层，
// 它**不阻止子组件挂载**——`<MapContainer>` 与它的子组件在 2D 分支里立刻挂载。
// 所以「在 loadData 里等掩码」对几何没有约束力（实测改完仍测到 439）。
// 真正管用的是：**地图内容在几何有结论之后才挂载**。
{
  const mapView = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'MapView.tsx'), 'utf8')
  const mapStore = readFileSync(join(process.cwd(), 'src', 'store', 'useMapStore.ts'), 'utf8')
  const npc2d = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'NpcShips2D.tsx'), 'utf8')
  const routeLine = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'RouteLine.tsx'), 'utf8')
  const sailing = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'SailingController.tsx'), 'utf8')
  const map3d = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'Map3DView.tsx'), 'utf8')
  const geoAudit = readFileSync(join(process.cwd(), 'test', 'e2e', 'geometry-ready.mjs'), 'utf8')
  const pkg2 = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8') as unknown as {
    scripts: Record<string, string>
  })

  // ① 「几何有结论」= 就绪（掩码到位）**或** 失败（确认拿不到）
  assert(/landDataReady: boolean/.test(mapStore) && /landDataFailed: boolean/.test(mapStore),
    '地图状态里同时有「几何就绪」与「几何失败」两个标志')
  assert(/const geoSettled = landDataReady \|\| landDataFailed/.test(mapView),
    '几何有结论 = 就绪 或 失败（两者之一）')
  assert(/const mapReady = geoSettled && !loading/.test(mapView),
    '地图内容的挂载判据是「几何有结论 且 渲染数据到了」')

  // ② 地图内容必须真的挂在 mapReady 后面（判据定义了不等于用了）
  //    注意：`<MapContainer` 在注释里也出现过（解释「遮罩挡不住子组件挂载」那段），
  //    所以要从闸门**之后**开始找，否则会命中注释 → 假红。
  const iGate = mapView.search(/\{mapReady && \(/)
  const iContainer = iGate >= 0 ? mapView.indexOf('<MapContainer', iGate) : -1
  assert(iGate >= 0 && iContainer >= 0 && iGate < iContainer,
    '地图内容（MapContainer）挂在 mapReady 后面——几何没结论时屏幕上不出现半张图')

  // ③ 掩码失败也是「有结论」：地图要照常出来（不能被一个可选文件锁死）
  assert(/catch\(\(\) => \{[\s\S]{0,300}setLandDataReady\(false\)[\s\S]{0,200}setLandDataFailed\(true\)/.test(mapView),
    '掩码失败时置「失败」标志，地图照常出来（退化成直线，但游戏能玩）')

  // ④ 两个标志都不许进存档（会话状态，刷新后重新加载即可）
  const partMatch = mapStore.match(/partialize: \(state\) => \(\{([\s\S]*?)\}\),/)
  assert(partMatch !== null, '找得到 partialize 块（守卫本身没写错）')
  assert(!/landDataReady/.test(partMatch![1]) && !/landDataFailed/.test(partMatch![1]),
    '几何就绪/失败标志都不许持久化（读档后必须重新判断）')

  // ⑤ 船的几何身份里必须含「是否就绪」：掩码后到时几何要重建，
  //    但**已走里程必须保留**（船位在旧直线上，按位置反推会让进度跳）
  assert(/geomReadyRef/.test(sailing) && /prevReady !== geoReady/.test(sailing),
    '船的航线几何按「几何是否就绪」重建（掩码后到时不再抱着那条直线）')
  assert(/if \(prevRouteKey !== routeKey \|\| prevReady === null\)[\s\S]{0,160}traveledNmRef\.current = traveledNmAt\(/.test(sailing),
    '只有改道/首次建几何才按船位反推已走里程（掩码后到的重建要保留进度）')

  // ⑥ 3D 这条路径不经过 MapView 的 2D 分支，得自己等几何
  assert(/loadLandData\(\)\.catch/.test(map3d),
    '3D 装配时等航线几何有结论（NPC 商船不许建在退化直线上）')
  assert(/geoReady \? 1 : 0/.test(map3d),
    '3D 航线虚线的变更检测带上几何就绪状态（掩码后到时重算）')

  // ⑦ e2e 要能读出「屏幕上走的是哪条路」：商船把航程挂到 DOM，候选航线有稳定选择器
  assert(/data-leg-nm/.test(npc2d),
    '商船图标把这条腿的航程挂到 DOM（e2e 要能读出屏幕上走的是不是避陆后的路）')
  assert(/route-line/.test(routeLine),
    '候选航线虚线有稳定选择器 route-line（e2e 要能只挑它，不被浅滩描边干扰）')
  assert(/npc-ship-icon \[data-leg-nm\]/.test(geoAudit) && /\.route-line/.test(geoAudit),
    '几何就绪巡检读的是稳定 DOM 锚点')
  assert(/sea-mask\.bin/.test(geoAudit) && /MASK_HOLD_MS/.test(geoAudit),
    '几何就绪巡检掐住掩码请求来复现「几何没结论」这一档（掐断是另一档）')
  assert(/geodesic|大圆|greatCircle|haversine/.test(geoAudit),
    '几何就绪巡检拿大圆直线当反向对照（证明这条断言有区分力）')

  assert(pkg2.scripts['test:e2e:geometry']?.includes('geometry-ready.mjs'), '几何就绪巡检有独立命令')
  assert(pkg2.scripts['test:e2e:seg7']?.includes('test:e2e:geometry'), '几何就绪巡检进了 seg7（不许变成孤儿巡检）')
  assert(pkg2.scripts['test:e2e:all']?.includes('test:e2e:geometry'), 'all 也含几何就绪巡检')
}

// ---------------- 主屏常驻「下一站」：第一屏可见 + 单一来源 ----------------
// 第 28 轮实测：进游戏第一屏 38 条可见文本 / 122 字 / 20 个按钮，没有一个字
// 回答「我下一步该往哪开」；唯一的航路卡埋在「冒险笔记」面板里。
// 守卫只匹配语法结构（import、JSX 标签、判据表达式），不写死注释里的措辞。
{
  const main = readFileSync(join(process.cwd(), 'src', 'pages', 'MainMap.tsx'), 'utf8')
  const hint = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'VoyageNextHint.tsx'), 'utf8')
  const card = readFileSync(join(process.cwd(), 'src', 'components', 'panels', 'VoyageNextCard.tsx'), 'utf8')
  const hook = readFileSync(join(process.cwd(), 'src', 'hooks', 'useVoyageNext.ts'), 'utf8')
  const invite = readFileSync(join(process.cwd(), 'src', 'components', 'harbor', 'HarborInvite.tsx'), 'utf8')
  const audit = readFileSync(join(process.cwd(), 'test', 'e2e', 'next-port-hint.mjs'), 'utf8')
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }

  assert(/import VoyageNextHint from '@\/components\/map\/VoyageNextHint'/.test(main),
    '主屏静态引入常驻指引（不许只在面板里渲染）')
  assert(/<VoyageNextHint\s*\/>/.test(main), '桌面端有常驻挂载点')
  assert(/<VoyageNextHint placement="stack"\s*\/>/.test(main),
    '移动端走 stack 结构（并入底栏文档流，不写死 bottom）')
  assert(/NEXT_HINT:\s*25/.test(main), '层级在侧栏之上、面板之下')
  assert(/from '@\/hooks\/useVoyageNext'/.test(hint) && /from '@\/hooks\/useVoyageNext'/.test(card),
    '常驻条与面板卡共用同一个 hook，港名/海里/天数只能有一个值')
  assert(!/dailyDistanceNm\(/.test(card), '面板卡不许再自己算一遍日航程（会与常驻条分叉）')
  /*
   * 天数口径（第 33 轮改）：原先是「船速×风向×**当前方针**×天候」，
   * 那是主屏与出航计划面板对不上天的根源——面板写「按部就班 · 约 15 天可达」，
   * 主屏按抢行报「约 10 天」，差 5 天。现在两处都走 utils/voyage.voyageDays，
   * 固定按部就班（含军官、含当前天候）。
   */
  assert(/voyageDays/.test(hook) && !/STANCES\[stance\]\.speedMul/.test(hook),
    'hook 的天数走 voyageDays（按部就班口径，不按当前方针算）')
  assert(/data-testid="next-port-locate"/.test(hint) && /data-testid="next-port-detail"/.test(hint),
    '常驻条两个入口都有稳定 DOM 锚点')
  assert(/data-testid="voyage-next-card"/.test(card), '面板卡有稳定锚点供同源对账')
  assert(/gamePhase !== 'playing' \|\| activePanel/.test(hint),
    '开局遮罩期与面板打开时收起，不与面板里的同一张卡并排出现')
  assert(/setCenter\(\[p\.latitude, p\.longitude\]\)/.test(hint),
    '「定位」只移动地图，不出航')
  assert(/placement === 'stack'/.test(hint), '移动端是 JS 条件渲染的另一套结构，不是 CSS 隐藏')
  assert(/max-w-\[400px\]/.test(hint),
    '桌面条宽 400px：360px 时港名实测 104>97 被裁（layout-audit 在 1024/1440 都报）')
  assert(/fixed top-\[6\.5rem\] left-1\/2/.test(invite),
    '靠岸邀请条下移一行，中屏上不与常驻指引横向叠在一起')

  assert(pkg.scripts['test:e2e:nexthint']?.includes('next-port-hint.mjs'), '常驻指引有独立巡检命令')
  assert(pkg.scripts['test:e2e:seg7']?.includes('test:e2e:nexthint'), '巡检进了 seg7')
  assert(pkg.scripts['test:e2e:all']?.includes('test:e2e:nexthint'), 'all 也含常驻指引巡检')
  assert(!(pkg.scripts['test:e2e:seg5'] ?? '').includes('nexthint'),
    'seg5 没有误引用（分段之间不许自引用）')
  assert(/createBrowserContext/.test(audit) && /elementFromPoint/.test(audit),
    '巡检用独立 context + 真实命中测试（DOM 存在 ≠ 玩家点得到）')
  assert(/documentElement\.scrollWidth/.test(audit), '移动端巡检量页面级横向溢出')
}

// ---------------- 到港回执：回来的理由常驻可见 ----------------
// 第 29 轮实测 1440×900 连跑 10 趟：主屏可见文本里「靠岸 ·」「酒馆里有人提起」
// 「应验 ·」一次都没出现，唯一提示是侧栏 8px 红点 + 屏幕上看不见的 aria-label；
// 册子本身（见闻 / 线索 / 应验 / 图鉴）做得很完整，缺的是常驻出口。
// 守卫只匹配语法结构（import、JSX 属性、表达式），不写死注释措辞。
{
  const hint = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'VoyageNextHint.tsx'), 'utf8')
  const hook = readFileSync(join(process.cwd(), 'src', 'hooks', 'useArrivalReceipt.ts'), 'utf8')
  const views = readFileSync(join(process.cwd(), 'src', 'components', 'panels', 'LogbookViews.tsx'), 'utf8')
  const audit = readFileSync(join(process.cwd(), 'test', 'e2e', 'arrival-receipt.mjs'), 'utf8')
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }

  assert(/from '@\/hooks\/useArrivalReceipt'/.test(hint) && /useArrivalReceipt\(\)/.test(hint),
    '常驻条消费同一个回执 hook，不与册子各算一套')
  assert(/logbook\.filter\(e => !e\.read\)/.test(hook), '只读未读页：翻开就收起，不留消不掉的横条')
  assert(/const MAX_GIST = 16/.test(hook), '12px 主行有硬上限（上一轮港名被 truncate 裁 7px 的教训）')
  assert(/hint\.indexOf\('——'\)/.test(hook), '线索句截到破折号前，留下那句「没讲完的尾巴」')
  assert(/entry\.hint/.test(hook) && /entry\.title/.test(hook) && /LogbookEntry/.test(hook),
    '短句只读 LogbookEntry 的真实字段，不凭空造字')
  assert(/data-testid="arrival-receipt"/.test(hint) && /data-unread=\{receipt\.unread\}/.test(hint),
    '回执条有稳定 DOM 锚点，未读数可与 logbook 实际值对账')
  assert(/刚带回 · \{receipt\.gist\}/.test(hint), '主屏短句来自 hook，不是写死一句「有新内容」')
  assert(/receipt\.latest \? \(/.test(hint),
    '回执条由「是否有未读页」决定渲染，不许写死 false 把它藏回面板里')
  assert(/receiptHead \?\? \(/.test(hint) && /下一站：\{suggest\.nameCn\}/.test(hint),
    '副行「下一站」独立保留，回执没有把上一轮刚做常驻的方向换掉')
  assert(/setActivePanel\('event'\)/.test(hint), '点回执翻开的是航海日志，不是冒险笔记')
  assert(/placement === 'stack' \? null : receiptHead/.test(hint),
    '移动端不叠第二块内容（底栏「日志」标签自带未读徽标）')
  assert(/markLogbookRead\(\)/.test(views), '翻开见闻页把未读归零，回执才会自动收起')

  assert(pkg.scripts['test:e2e:receipt']?.includes('arrival-receipt.mjs'), '回执有独立巡检命令')
  assert(pkg.scripts['test:e2e:seg7']?.includes('test:e2e:receipt'), '回执巡检进了 seg7')
  assert(pkg.scripts['test:e2e:all']?.includes('test:e2e:receipt'), 'all 也含回执巡检')
  assert(!(pkg.scripts['test:e2e:seg5'] ?? '').includes('receipt'),
    'seg5 没有误引用（分段之间不许自引用）')
  assert(/latestHint/.test(audit) && /同源/.test(audit), '巡检做主屏与册子的同源对账')
  assert(/scrollWidth > el\.clientWidth/.test(audit) && /elementFromPoint/.test(audit),
    '巡检量主行裁切 + 真实命中测试（DOM 存在 ≠ 玩家看得见、点得到）')
  assert(/setViewport\(\{ width: 390/.test(audit), '巡检覆盖移动端结构不变')
}

/* ==========================================================================
 * 日志页首插图（2026-11-07）
 * 只给最上面那一页配画 —— 每页都配会变成画册在滚动，反而没有重点。
 * 守卫三件：取图走单一入口、只有 idx===0 出图、加载失败要藏起来不留空框。
 * ========================================================================== */
{
  const views = readFileSync(join(process.cwd(), 'src', 'components', 'panels', 'LogbookViews.tsx'), 'utf8')
  const art = readFileSync(join(process.cwd(), 'src', 'data', 'logbookArt.ts'), 'utf8')

  assert(/from '@\/data\/logbookArt'/.test(views), '插图走 logbookArt 单一入口（换素材只改一处）')
  assert(!/portImage/.test(views), '面板里不再直接引 portImage（否则换 sighting_* 要动渲染代码）')
  assert(/idx === 0 \? logbookArt\(entry\.portId\)/.test(views), '只有最上面那一页取图')
  assert(/data-testid="logbook-art"/.test(views), '插图有稳定锚点（巡检与截图都靠它）')
  assert(/onError=/.test(views), '图挂了要隐藏，不能留个空框（路径错会静默 404）')
  assert(/onError/.test(art) === false, '取图函数不掺渲染逻辑')
  assert(/ports\.some\(p => p\.id === portId\)/.test(art), '取图前先确认港口存在（防脏 id 造出 404 路径）')
}

/* ==========================================================================
 * 港口服务按钮（2026-11-07）
 * 这五块铜牌曾经只有 trade / shipyard 挂 onClick —— 修理/补给/招募点了毫无
 * 反应，正是玩家最早反馈的「点了没反应」。现在它们跳到对应分区。
 * 守卫：五块都要有非空行为 + 三个分区锚点必须在 + 造船厂面板要有稳定锚点。
 * ========================================================================== */
{
  const pd = readFileSync(join(process.cwd(), 'src', 'components', 'panels', 'PortDetail.tsx'), 'utf8')
  const sy = readFileSync(join(process.cwd(), 'src', 'components', 'panels', 'ShipyardPanel.tsx'), 'utf8')

  assert(/data-service=\{svc\}/.test(pd), '服务按钮带 data-service，巡检可稳定定位')
  assert(/svc === 'trade'[\s\S]{0,40}setActivePanel\('trade'\)/.test(pd), '贸易按钮切到贸易面板')
  assert(/svc === 'shipyard'[\s\S]{0,60}setActivePanel\('shipyard'\)/.test(pd), '造船厂按钮切到造船厂面板')
  assert(/scrollIntoView/.test(pd), '其余三个按钮必须真的跳转（不能是空 onClick）')
  for (const k of ['repair', 'supply', 'recruit']) {
    assert(new RegExp(`data-service-anchor="${k}"`).test(pd), `${k} 分区有跳转锚点`)
  }
  assert(/aria-label=/.test(pd), '服务按钮有 aria-label（图标按钮不能只靠画认）')
  assert(/data-testid="shipyard-panel"/.test(sy), '造船厂面板有稳定锚点')

  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
  assert(pkg.scripts['test:e2e:portsvc']?.includes('port-services.mjs'), '服务按钮有独立巡检命令')
  assert(pkg.scripts['test:e2e:seg3']?.includes('test:e2e:portsvc'),
    '服务按钮巡检进了 seg3（原在 seg2，加上它之后整段跑过 10 分钟被 SIGTERM，移到可点性主题更贴的 seg3）')
  assert(!(pkg.scripts['test:e2e:seg2'] ?? '').includes('portsvc'),
    'seg2 不再含它（避免两段重复跑、也避免再撑爆时限）')
  assert(pkg.scripts['test:e2e:all']?.includes('test:e2e:portsvc'), 'all 也含服务按钮巡检')
}

/* ==========================================================================
 * 航路指引与出航计划必须说同一个数字（第 33 轮）
 *
 * 背景：主屏常驻的「下一站」原先用 haversine **大圆距离**报里程、用**当前方针**
 * 算天数；而船实际走的是避陆弧线、天数按「按部就班」算。实测 20 条里程碑
 * 航线**全部**少报——塞维利亚→埃尔米纳主屏写「1956 海里 · 约 10 天」，
 * 出航计划写「航程 2917 海里 · 约 15 天可达」，差 49%、差 5 天。
 * 而「粮水够不够」又是按出航计划那个天数判的：主屏在骗玩家备货。
 *
 * 守卫：
 *   ① voyageDays 必须等于出航计划面板那份 steady 总账的天数（同一口径）；
 *   ② voyageDays 必须与玩家的**当前方针无关**（方针要到每段起点才选）；
 *   ③ 领航员（+15%）必须算进来；
 *   ④ routeFacts 的弧长必须等于 getRouteGeometry 的实际里程（不是大圆）；
 *   ⑤ 源码层：useVoyageNext 不得再用大圆距离 / 不得漏军官；
 *      VoyagePlanModal 与 store.sailToWaypoint 必须走同一个函数。
 * ========================================================================== */
{
  const ship = { id: 1, name: 's', type: 'caravel' as const, speed: 8, durability: 100, maxDurability: 100, capacity: 50, usedCapacity: 0, crew: 30, maxCrew: 40 }
  const fl: Fleet = { id: 1, name: 't', gold: 0, fame: 0, morale: 70, food: 100, water: 100, currentPortId: 6, isSailing: false, day: 1, ships: [ship], cargo: [], flagshipId: 1, trait: null, durabilityCarry: 0 }
  const wx: WeatherState = { kind: 'clear', intensity: 0.5, windBearing: 0, changedAtDay: 0 }

  // ① 与出航计划面板的 steady 总账同口径
  {
    const distanceNm = 2917
    const windFavor = 0.9
    const weatherMul = WEATHER_INFO[wx.kind].sailMul * weatherFavorFactor(wx.kind)
    const baseNmPerDay = dailyDistanceNm(fl, [], windFavor, 1, weatherMul)
    const led = stanceLedgers({
      distanceNm, baseNmPerDay,
      dailyFood: calculateDailyConsumption(fl).food,
      dailyWater: calculateDailyConsumption(fl).water,
      dailyEventProb: 0.25 * WEATHER_INFO[wx.kind].eventBias,
      durabilityCarry: fl.durabilityCarry,
    })
    const steadyDays = led.find(l => l.stance.id === 'steady')!.days
    const d = voyageDays({ distanceNm, windFavor, fleet: fl, officers: [], weather: wx })
    assert(d === steadyDays,
      `voyageDays 与出航计划面板的 steady 天数一致（${d} vs ${steadyDays}）`)
    assert(d > 0 && d === Math.ceil(distanceNm / baseNmPerDay),
      `天数就是「距离 ÷ 按部就班日航程」（${distanceNm} ÷ ${baseNmPerDay.toFixed(1)} = ${d}）`)
  }

  // ② 与当前方针无关：抢行的账本更快，但指引报的是「按部就班」
  {
    const distanceNm = 2917
    const windFavor = 0.9
    const weatherMul = WEATHER_INFO[wx.kind].sailMul * weatherFavorFactor(wx.kind)
    const baseNmPerDay = dailyDistanceNm(fl, [], windFavor, 1, weatherMul)
    const led = stanceLedgers({
      distanceNm, baseNmPerDay,
      dailyFood: 1, dailyWater: 1, dailyEventProb: 0.25, durabilityCarry: 0,
    })
    const rush = led.find(l => l.stance.id === 'rush')!.days
    const d = voyageDays({ distanceNm, windFavor, fleet: fl, officers: [], weather: wx })
    assert(rush < d,
      `抢行确实更快（${rush} 天 < 按部就班 ${d} 天）——所以指引若按当前方针算就会偏`)
  }

  // ③ 领航员（pilot +15%）必须算进来
  {
    const distanceNm = 2917
    const windFavor = 0.9
    const plain = voyageDays({ distanceNm, windFavor, fleet: fl, officers: [], weather: wx })
    const withPilot = voyageDays({ distanceNm, windFavor, fleet: fl, officers: ['pilot'], weather: wx })
    assert(withPilot <= plain,
      `领航员让航程更快或持平（${withPilot} ≤ ${plain}）`)
    assert(withPilot < plain,
      `领航员确实更快（${withPilot} < ${plain}）——漏掉军官就会把主屏天数报多 15%`)
  }

  // ④ routeFacts 的弧长 = getRouteGeometry 的实际里程（避陆后的弧，不是大圆）
  {
    const from: [number, number] = [37.3886, -5.9823]   // 塞维利亚
    const to: [number, number] = [5.0833, -1.35]       // 埃尔米纳
    const facts = routeFacts(from, to)
    const geom = getRouteGeometry(from, to)
    assert(facts.distanceNm === Math.round(geom.totalNm),
      `routeFacts 的里程就是几何里程（${facts.distanceNm} = ${Math.round(geom.totalNm)}）`)
    assert(facts.distanceNm > 0 && facts.windFavor > 0, 'routeFacts 给出里程与风向')
    // 大圆距离（旧的算法）必须比弧长短——否则就没有「绕开陆地」这回事了，
    // 这条断言在无掩码的 node 环境里也会成立（直线=大圆），但它守住了
    // 「routeFacts 不能被换成 haversine」这件事（换成大圆就会相等）。
    const gc = haversineNm(from[0], from[1], to[0], to[1])
    assert(facts.distanceNm >= Math.round(gc),
      `弧长不短于大圆距离（${facts.distanceNm} ≥ ${Math.round(gc)}）`)
  }

  // ⑤ 源码层：两处不许各算一遍
  {
    const hookSrc = readFileSync(join(process.cwd(), 'src', 'hooks', 'useVoyageNext.ts'), 'utf8')
    const planSrc = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'VoyagePlanModal.tsx'), 'utf8')
    const storeSrc = readFileSync(join(process.cwd(), 'src', 'store', 'useGameStore.ts'), 'utf8')

    assert(/from '@\/utils\/voyage'/.test(hookSrc) && /routeFacts/.test(hookSrc),
      'useVoyageNext 的里程走 utils/voyage.routeFacts（不是大圆）')
    assert(!/haversineNm/.test(hookSrc), 'useVoyageNext 不再出现 haversine（大圆距离不能当航程）')
    assert(/voyageDays/.test(hookSrc), 'useVoyageNext 的天数走 utils/voyage.voyageDays')
    assert(!/dailyDistanceNm\(\s*fleet,\s*\[\]/.test(hookSrc),
      'useVoyageNext 不再漏掉军官（dailyDistanceNm(fleet, []) 会少算领航员的 15%）')
    assert(/landDataReady/.test(hookSrc),
      'useVoyageNext 等航线几何就绪再报里程（掩码没到位时只能给直线）')

    assert(/voyageDays/.test(planSrc), '出航计划面板的天数走同一个 voyageDays')
    assert(/from '@\/utils\/voyage'/.test(planSrc), '出航计划面板从 utils/voyage 取 voyageDays')

    assert(/routeFacts/.test(storeSrc), 'store.sailToWaypoint 的里程走同一个 routeFacts')
    assert(/routeFacts\(/.test(storeSrc), 'routeFacts 真的被调用了（不是只 import）')
  }
}

console.log(`\n最终结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)
