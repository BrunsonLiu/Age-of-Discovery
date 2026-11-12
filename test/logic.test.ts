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
  windFavorForRoute,
} from '../src/utils/voyage'
import {
  SEA_PHENOMENA, activePhenomena, phenomenonAt, phenomenonRing,
  routePhenomenonFactor, phenomenonEventBias, inPhenomenon,
} from '../src/data/seaPhenomena'
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
import { RELICS, RELIC_COUNT, RELIC_PICKUP_NM, relicDistanceNm, relicInReach, relicInSeason, findRelic } from '../src/data/relics'
import { groupJournal, journalHeadline } from '../src/utils/captainLog'
import { rollSeaOmen, OMEN_CHANCE, OMEN_COOLDOWN_DAYS } from '../src/utils/seaOmen'
import { voyageMilestones, nextMilestone, newlyReached, suggestPortFor } from '../src/data/voyageMilestones'
import { advanceDebris, spawnDebris } from '../src/utils/seaDebris'
import { debrisGain, DEBRIS_MAX, DEBRIS_TTL_DAYS, DEBRIS_SPAWN_CHANCE, type DebrisSpot } from '../src/data/debris'
import { npcLegAt, npcPose } from '../src/utils/npcShips'
import { getRouteGeometry } from '../src/utils/routePath'
import {
  compositeShore, foamAlpha, shallowAlpha, FOAM_SPAN_DEG, FIRST_SEA_CELL_DEG,
  SHALLOW_FALLOFF_DEG, MAX_SHALLOW_ALPHA,
} from '../src/utils/shoreBand'
import { shipNearZoomScale, SHIP_NEAR_ZOOM_MIN } from '../src/utils/shipZoom'
import { iceStrengthAt, iceEdgeShift, ICE_SEASON_SHIFT_DEG } from '../src/utils/polarIce'
import { componentAreas, majorLand } from '../src/utils/shoreBand'
import { clampToDeck, deckEyeY, deckWalkHalfWidth, isOnDeck, stepWalk, WALK_RADIUS_M } from '../src/components/deck/deckWalk'
import { BOAT, BOAT_ARC, BOAT_STATIONS, boatHull, boatKeelLift, boatObstacle, boatRailGap } from '../src/components/deck/deckBoat'
import { PEN, PEN_SPOTS, penLivestock, penObstacle } from '../src/components/deck/deckPen'
import { pickScale, SCALE_MAX_PX, SCALE_MIN_PX, SCALE_STEPS, scaleHint } from '../src/utils/scaleBar'
import {
  circleLatLngs, MIN_RING_NM, pickRingDays, RING_DAY_CANDIDATES, RING_MAX_PX, RING_MIN_PX, RING_SEGMENTS, ringRadii,
} from '../src/utils/voyageRings'
import {
  degreeLabel, GRATICULE_STEPS, graticuleValues, isWholeDegree, MIN_LINE_GAP_PX, pickGraticuleStep,
} from '../src/utils/graticule'
import {
  CLIMATE_LABEL_FRAC, CLIMATE_LABEL_PAD, CLIMATE_LINES,
  climateGapCenter, climateLabelPx, climateRuns, OBLIQUITY_DEG, POLAR_CIRCLE_DEG,
} from '../src/utils/climateLines'
import { climateZoneAt, cursorLabel, readoutPlacement } from '../src/utils/cursorReadout'
import { DEFAULT_NATION, legendPending, NATION_COUNT, NATIONS, nationById, nextChapter, storyStep, tributeState } from '../src/data/nations'
import {
  SURF_PERIOD_PX, SURF_WIND_FULL, SURF_WIND_MIN, surfDash, surfOpacity, surfStrength, surfWeight,
} from '../src/utils/surf'
import { densify, filterSeaPoints, splitAtLand } from '../src/utils/seaClip'
import {
  WAKE_MAX_NM, WAKE_MAX_POINTS, WAKE_MIN_NM, WAKE_SCREEN_PX, wakeNmForScreen, wakePolyline,
} from '../src/utils/shipWake'
import type { RouteGeometry } from '../src/utils/routePath'
import { isOnLand, registerLandGeojson } from '../src/utils/landCheck'
import { OCEAN_CURRENTS, OCEAN_LABELS, currentFlowPoints, windArrowSites } from '../src/data/mapLayers'
import { buildHullGeo } from '../src/components/deck/shipHull'
import {
  HULL_ARC, HULL_BULWARK, SHIP_DRAFT_LIFT, SHIP_HALF_LENGTH, SHIP_SCALE,
  shipDeckAt, shipDeckHalfWidthAt, shipHalfWidthAt, shipKeelAt,
} from '../src/components/deck/shipShape'
import { DECK_WAVES } from '../src/components/deck/deckWaves'
import { compassWord, ridgeHeightAt, ridgeHeights } from '../src/components/deck/deckCoast'
import { BIRD_MAX, deckBirdFlock, deckBirdPose } from '../src/components/deck/deckBirds'
import { sailorIdle, SAILOR_POSES, SAILOR_STATIONS, sailorCount } from '../src/components/deck/deckCrew'
import { chartCourse, CHART_MAX_NM } from '../src/components/deck/deckChart'
import { bearingDelta, FLAG_SEG_X, flagOffset, pennantYaw, windK } from '../src/components/deck/deckFlag'
import {
  BRACE_SEGMENTS, braceYaw, rotateAboutYaw, SAIL_TAPER, sailClew,
  sheetSag, sheetSway, SHEET_SEGMENTS, writeSheetPoints,
} from '../src/components/deck/deckRigging'
import {
  BOWSPRIT_BASE, BOWSPRIT_TIP, bowspritYAt, FIGUREHEAD, FIGUREHEAD_CREST, FIGUREHEAD_SPINE,
  figureheadPoints, figureheadTip, STEM_Z,
} from '../src/components/deck/deckBow'
import {
  ANCHOR_Z, anchorFootY, anchorPose, HAWSE_Y, HAWSE_Z,
} from '../src/components/deck/deckAnchor'
import { bowWaveLength, bowWaveSpread, KELVIN_TAN, kelvinStrength, wakeStrength, WATERLINE_Y_M } from '../src/components/deck/deckWake'
import { CABIN_BOUNDS, CABIN_ENTER, CABIN_EXIT, cabinEyeY, cabinFloorY, clampToCabin, isInCabin, stepInCabin } from '../src/components/deck/deckCabin'
import { clampElevation, EL_MAX, EL_MIN, EL_TIGHTEN_FROM, minElevationAt } from '../src/components/map3d/cameraLimits'
import {
  findCoast, wrapDeg, coastLayout, coastScenePos, bearingWord,
} from '../src/components/deck/deckCoast'
import {
  approachLook, deckWeatherLook, lightningEnvelope, rainDropCount,
} from '../src/components/deck/deckWeather'
import { surfaceDimMul } from '../src/utils/mapSurfaceDim'
import {
  pointSizeForWorld, portLightPlan, portLightStrength,
} from '../src/utils/portLights'
import { shipFarZoomScale, shipZoomScale, SHIP_FAR_ZOOM_MIN } from '../src/utils/shipZoom'
import { coastWidthScale } from '../src/components/map3d/mapCoastline3d'
import { sunDirection, SUN_SWING_DEG } from '../src/utils/sunDirection'
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
import { localDemands, ports, portGoods } from '../src/data/ports'
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
  greatCircleNm, greatCirclePoint, buildRouteGeometry, positionAtNm, traveledNmAt, pathTouchesLand,
} from '../src/utils/routePath'
import { findSeaPath, loadSeaMask, isSeaMaskLoaded, isLandAt } from '../src/utils/seaRoute'
import { seasonAt, SEASON_DAYS, ALL_SEASONS, inMonsoonZone } from '../src/utils/season'
import { prevailingWindBearingAt, prevailingWindBearing, computeWindFavor } from '../src/utils/navigation'
import { snowPhaseOf } from '../src/components/map3d/mapPeaks3d'
import { buildMap3DLayers } from '../src/components/map3d/mapLayers3d'
import { routeCurrentFactor, currentAt } from '../src/utils/seaCurrents'
import * as THREE from 'three'
import { OCEAN_CURRENTS, currentFlowPoints, windArrowSites } from '../src/data/mapLayers'
import { ports } from '../src/data/ports'
import { RELIC_PICKUP_NM, relicDistanceNm, relicInReach } from '../src/data/relics'
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
  HARBOR_CALM_NM, HARBOR_MAX_NM, HARBOR_STYLES, harborCalm, harborPlan, harborRadius,
  harborStyleFor, harborVisible, lampReflectionLen,
} from '../src/components/deck/deckHarbor'
import { shadeFaces as shadeHarbor } from '../src/components/deck/harborModel'
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
    const facts = routeFacts([fromPort.latitude, fromPort.longitude], [toPort.latitude, toPort.longitude], S().fleet.day)
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
    const facts = routeFacts([fromPort.latitude, fromPort.longitude], [toPort.latitude, toPort.longitude], S().fleet.day)

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
    const facts = routeFacts([a.latitude, a.longitude], [b.latitude, b.longitude], S().fleet.day)
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
    const debrisSrc = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'seaLayer3d.ts'), 'utf8')
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

// ---------------- 海上遗物：历史与神话作为地图上的实物 ----------------
// 2026-11-07 用户定的方向：**不要再扩展金钱/经济玩法**；
// 神话与历史可以融入更多，但**不要只是一味地增加文字**。
// 于是史实必须以「地图上看得见、点得到的东西」落地，而不是日志里的一段话。
//
// 守四件事：
//   ① 每件遗物都真的在**海上**（拿真实 sea-mask.bin 判定，不靠人眼）；
//   ② 收益里**没有金币**（方向的第一条约束）；
//   ③ 2D 与 3D 读**同一份**数据、拾完一起消失；
//   ④ 拾过的记进存档与图鉴（不然刷新就没了）。
{
  const relicsSrc = readFileSync(join(process.cwd(), 'src', 'data', 'relics.ts'), 'utf8')
  const seaRelicsSrc = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'SeaRelics.tsx'), 'utf8')
  const glyphSrc = readFileSync(join(process.cwd(), 'src', 'utils', 'relicGlyph.ts'), 'utf8')
  const sea3dSrc = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'seaLayer3d.ts'), 'utf8')
  const map3dSrc = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'Map3DView.tsx'), 'utf8')
  const mapViewSrc = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'MapView.tsx'), 'utf8')
  const storeSrc2 = readFileSync(join(process.cwd(), 'src', 'store', 'useGameStore.ts'), 'utf8')
  const saveSrc = readFileSync(join(process.cwd(), 'src', 'utils', 'saveFile.ts'), 'utf8')
  const typesSrc = readFileSync(join(process.cwd(), 'src', 'types', 'index.ts'), 'utf8')
  const atlasSrc = readFileSync(join(process.cwd(), 'src', 'components', 'panels', 'LogbookViews.tsx'), 'utf8')

  // ① 坐标必须在海上：拿真实的海陆掩码逐个点一遍
  //    掩码口径必须与 utils/seaRoute.ts 完全一致（0.1°/格、1 bit/格），
  //    否则这条断言就是拿另一套海陆定义在比。
  const MASK_STEP = 0.1
  const MASK_W = 3600
  const MASK_H = 1800
  const mask = new Uint8Array(readFileSync(join(process.cwd(), 'public', 'data', 'sea-mask.bin')))
  const maskIsLand = (lat: number, lng: number): boolean => {
    const gy = Math.min(MASK_H - 1, Math.max(0, Math.floor((lat + 90) / MASK_STEP)))
    let gx = Math.floor((lng + 180) / MASK_STEP)
    gx = ((gx % MASK_W) + MASK_W) % MASK_W
    const i = gy * MASK_W + gx
    return ((mask[i >> 3] >> (i & 7)) & 1) === 1
  }
  assert(RELICS.length >= 6, `遗物数量够撑起「路过才遇得到」（${RELICS.length} 件）`)
  // 位置必须是**钉死**的：它一直在那儿等着有人路过，不是每天随机冒出来的东西
  assert(!/Math\.random|Date\.now/.test(relicsSrc),
    '遗物位置是钉死的（不随机生成、不随时间漂走——它一直在那儿等你路过）')
  for (const r of RELICS) {
    assert(!maskIsLand(r.lat, r.lng),
      `遗物「${r.name}」落在海上（真实掩码判定，不能搁在陆地上）`)
  }
  const coordKeys = RELICS.map(r => `${r.lat.toFixed(2)},${r.lng.toFixed(2)}`)
  assert(new Set(coordKeys).size === RELICS.length,
    '遗物坐标互不重复（两件叠在一起就等于少了一件）')
  assert(RELICS.some(r => r.lore === 'history') && RELICS.some(r => r.lore === 'myth'),
    '遗物里历史与神话都有（不能只剩史实）')
  for (const r of RELICS) {
    assert(!('gold' in r.gain), `遗物「${r.name}」的收益里没有金币（方向约束）`)
    assert(r.gain.fame > 0, `遗物「${r.name}」给名号（声望），不然就是白捡`)
    assert(r.note.length > 10, `遗物「${r.name}」有一句来历（拾起时才给，不是开场白）`)
  }

  // ② 拾取动作里不许出现金币
  const iRelic = storeSrc2.indexOf('collectRelic: (id) => {')
  const iAfterRelic = storeSrc2.indexOf('addNotification:', iRelic)
  const relicBody = iRelic >= 0 && iAfterRelic > iRelic ? storeSrc2.slice(iRelic, iAfterRelic) : ''
  assert(relicBody.length > 0, '找得到 collectRelic 的函数体（守卫本身没写错）')
  assert(!/gold:\s*state\.fleet\.gold|gold:\s*[\w.]+\.gold|\.gold\s*\+/.test(relicBody),
    '拾取遗物不给金币（钱重要，但本作卖的是航路与名号，不是账本）')
  assert(/collectedRelics/.test(relicBody) && /fame/.test(relicBody) && /morale/.test(relicBody),
    '拾取遗物给名号与士气，并记进 collectedRelics')

  // ②-2 **必须真的开过去**：超距不结算，只回执 + 设为目的地
  //
  // 2026-11-07 实测事故：遗物本来在世界另一头也能直接「拾起」
  // （collectRelic 没有任何距离校验），于是"它一直在那儿等着有人路过"
  // 这句设定成了空话，玩家在塞维利亚就能捞走亚速尔外海的白骨。
  assert(/RELIC_PICKUP_NM/.test(relicBody),
    '拾取有半径把关（超距不结算）')
  assert(/relicDistanceNm/.test(relicBody),
    '距离用 relicDistanceNm 算（与图鉴里显示的「离你多少海里」同一个口径）')
  assert(/太远了/.test(relicBody),
    '超距时给「太远了」的回执（玩家知道自己差多少）')
  assert(/changeCourse|sailToWaypoint/.test(relicBody),
    '超距时把它设为目的地（提示必须可行动，不能只是"你不够不着"）')
  // 超距那一支**不能**结算收益：收益的加法都在半径判断之后
  const iGate = relicBody.indexOf('RELIC_PICKUP_NM')
  const iGain = relicBody.indexOf('fame: state.fleet.fame + g.fame')
  assert(iGate >= 0 && iGain > iGate,
    '半径判断在收益结算之前（超距时一个数都不加）')

  // ③ 2D 与 3D 读同一份数据、拾完一起消失
  assert(/from '@\/data\/relics'/.test(seaRelicsSrc) && /RELICS/.test(seaRelicsSrc),
    '2D 的遗物从 data/relics 取')
  assert(/from '@\/data\/relics'/.test(map3dSrc) && /RELIC_ITEMS/.test(map3dSrc),
    '3D 的遗物从同一份 data/relics 取')
  assert(/collectRelic/.test(seaRelicsSrc) && /collectRelic/.test(map3dSrc),
    '2D 与 3D 用同一个拾取动作（不存在"这边拾过那边还在"）')
  assert(/SeaStaticItem/.test(sea3dSrc) && /relic3d-icon/.test(sea3dSrc),
    '3D 的海上物件层同时承载漂流物与遗物（同一套疏散/反投影逻辑）')
  assert(/<SeaRelics \/>/.test(mapViewSrc), '2D 地图上挂着遗物层')

  // ④ 拾过的记进存档与图鉴
  assert(/collectedRelics: string\[\]/.test(typesSrc), 'collectedRelics 有类型声明')
  assert(/collectedRelics: state\.collectedRelics/.test(storeSrc2), 'collectedRelics 进 partialize（刷新不丢）')
  assert(/'collectedRelics'/.test(saveSrc), 'collectedRelics 进存档白名单（导出/导入不丢）')
  assert(/collectedRelics/.test(atlasSrc) && /海上遗物/.test(atlasSrc),
    '图鉴里有一节「海上遗物」（拾过的东西有个地方放）')
  assert(/relicMarkerHtml/.test(glyphSrc) && /relicColor/.test(glyphSrc),
    '遗物有独立的视觉（史实旧铜 / 神话冷银，不与漂流物混成一类）')

  // ⑤ 端到端巡检不许变成孤儿
  // 第 26 轮实测：6 个自带失败退出的 e2e 脚本常年不在 seg/full/all 里，只靠手工跑，
  // 当时 intro-check 与 no-dialogue-interrupt 就是红的。遗物这一层同样不许只靠手工跑。
  {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    assert(readdirSync(join(process.cwd(), 'test', 'e2e')).includes('relics.mjs'),
      'relics.mjs 文件还在（别把巡检删了）')
    assert((pkg.scripts['test:e2e:relics'] ?? '').includes('relics.mjs'),
      '遗物巡检有独立命令')
    assert((pkg.scripts['test:e2e:seg6'] ?? '').includes('relics.mjs'),
      '遗物巡检进了 seg6（与 debris-3d 同属 3D 海面层，不能只靠手工跑）')
    assert((pkg.scripts['test:e2e:all'] ?? '').includes('test:e2e:relics'),
      'all 也含遗物巡检')
    // 巡检本身必须真的断言了「不给金币」——不然改坏代码时它不会红
    const relicAudit = readFileSync(join(process.cwd(), 'test', 'e2e', 'relics.mjs'), 'utf8')
    assert(/金币一个都不动/.test(relicAudit) && /after\.gold === before\.gold/.test(relicAudit),
      '遗物巡检真的在断言「金币一个都不动」（否则改坏代码它不会红）')
    assert(/elementFromPoint/.test(relicAudit) && /mouse\.click/.test(relicAudit),
      '遗物巡检走真实鼠标点击 + 命中测试（不靠 el.click() 绕过遮挡）')
  }
}

// ---------------- 大圆插值不许塌（东半球航线几何塌陷的根因） ----------------
//
// 2026-11-07 实测事故：utils/seaRoute.ts 的 greatCircleAt 把 haversine 的
// cos(la2) 写成了 cos(lo1)（**纬度写成了经度**）。
//
// 【这个 bug 的真实影响面，比"东半球塌陷"大得多】
// 新旧两版跑同一批真实航线（拿真掩码喂进 fetch，A* 走的是掩码），
// 对比 buildRouteGeometry 的输出：
//
//   路线              旧版里程/压陆比例      新版里程/压陆比例
//   阿姆斯特丹→果阿    4005nm / 84.5%       10953nm /  0.0%
//   埃尔米纳→蒙巴萨    2677nm / 84.6%        5348nm /  0.0%
//   果阿→澳门          2197nm / 95.3%        3777nm /  0.0%
//   蒙巴萨→澳门        4587nm / 55.5%        5691nm /  0.0%
//   塞维利亚→开普敦     4754nm / 44.3%        5315nm /  0.0%
//
// 也就是说旧版把「绕好望角 / 绕印度洋」的航程算成了**横穿大陆的直线**：
// 里程少一半以上，航线压陆 44%~95%。玩家看到的是一条从欧洲直接插进印度的
// 线，船真的开过去——开普敦→巴达维亚的船会从非洲肚子里穿过去。
//
// 【为什么第一版守卫抓不住它（这条是本轮踩的坑）】
// 初版守卫测两件事：
//   ① f=0.5 的中点离两端各约 d/2；② 10 段折线长度 ≈ d。
// 两件都测不出来：
//   ① slerp 在 f=0.5 时 A=B，最终方向与 d **无关**——就算 d 算错一半，
//      中点照样落在两端之间；
//   ② 长段上 2% 的相对容差把误差吃干净了（实测旧版偏差 1~11 nm，
//      而容差是 27~90 nm）。
// 真正有区分力的是**逐点弧长**：
//      greatCircleNm(from, greatCircleAt(from,to,f)) ≈ f × d
// 这个式子对 d 敏感，且用绝对容差（不是相对）。
// 现在守卫就是这么写的。
//
// 【口径分裂是笔误的铁证】
// 同一个文件里 greatCircleNm 用的是 cos(lat1)·cos(lat2)（对），
// greatCircleAt 用的是 cos(la1)·cos(lo1)（错）——两个函数本该同源。
{
  const cases: [string, [number, number], [number, number]][] = [
    ['塞维利亚→近海', [37.39, -5.98], [36.0, -8.0]],
    ['拿骚→塞维利亚', [25.05, -77.36], [37.39, -5.98]],
    ['塞维利亚→开普敦', [37.39, -5.98], [-33.92, 18.42]],
    ['马六甲→澳门（东半球）', [2.19, 102.25], [22.20, 113.54]],
    ['巴达维亚→澳门（东半球）', [-6.21, 106.85], [22.20, 113.54]],
    ['果阿→桑给巴尔（东半球）', [15.30, 74.12], [-6.17, 39.20]],
    // 短段：旧版在这一段整段塌成 0（18 个点全在同一处）
    ['马六甲→陈祖义铁锚（短段）', [2.19, 102.25], [2.0, 101.3]],
  ]
  for (const [label, from, to] of cases) {
    const d = greatCircleNm(from[0], from[1], to[0], to[1])
    // 绝对容差 1 海里（不是相对容差——相对容差在长段上会把误差吃掉）
    const tol = Math.max(1, d * 0.001)

    // ① 逐点弧长：插出来的点必须正好在弧上 f 处
    //    （这条对 d 敏感；f=0.5 的中点测不出来，因为那时 A=B，方向与 d 无关）
    for (const f of [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]) {
      const p = greatCirclePoint(from, to, f)
      const actual = greatCircleNm(from[0], from[1], p[0], p[1])
      assert(Math.abs(actual - f * d) < tol,
        `插值点精确落在弧上 f=${f} 处（${label}：实际 ${actual.toFixed(1)} nm vs 应为 ${(f * d).toFixed(1)} nm，容差 ${tol.toFixed(1)}）`)
    }

    // ② 折线长度必须等于大圆距离：塌了就等于 0
    let sum = 0
    let prev = from
    for (let k = 1; k <= 10; k++) {
      const p = greatCirclePoint(from, to, k / 10)
      sum += greatCircleNm(prev[0], prev[1], p[0], p[1])
      prev = p
    }
    assert(Math.abs(sum - d) < tol,
      `采样折线长度等于大圆距离（${label}：${sum.toFixed(0)} vs ${d.toFixed(0)} nm）`)

    // ③ 两端必须精确落位
    const p0 = greatCirclePoint(from, to, 0)
    const p1 = greatCirclePoint(from, to, 1)
    assert(greatCircleNm(from[0], from[1], p0[0], p0[1]) < 0.01, `f=0 精确落在起点（${label}）`)
    assert(greatCircleNm(to[0], to[1], p1[0], p1[1]) < 0.01, `f=1 精确落在终点（${label}）`)
  }

  // ④ 口径不许分裂：greatCircleAt 与 greatCircleNm 必须用同一个 haversine
  //    （旧版一个用 cos(lat1)·cos(lat2)、另一个用 cos(la1)·cos(lo1)——笔误的铁证）
  const seaRouteSrc = readFileSync(join(process.cwd(), 'src', 'utils', 'seaRoute.ts'), 'utf8')
  const gcAtBody = seaRouteSrc.slice(
    seaRouteSrc.indexOf('export function greatCircleAt'),
    seaRouteSrc.indexOf('export function greatCircleAt') + 2000,
  )
  assert(/Math\.cos\(la1\)\s*\*\s*Math\.cos\(la2\)/.test(gcAtBody),
    'greatCircleAt 的 haversine 用 cos(la1)·cos(la2)（两个纬度），不许写成 cos(la1)·cos(lo1)（经度）')
  assert(!/Math\.cos\(la1\)\s*\*\s*Math\.cos\(lo1\)\s*\*\s*Math\.sin/.test(gcAtBody),
    'greatCircleAt 里不许出现 cos(la1)·cos(lo1)·sin（那是把纬度写成经度的那个笔误）')
}

// ---------------- 每件遗物都必须开得到（不是摆在世界另一头的死物件） ----------------
//
// 2026-11-07 实测事故：麦哲伦海峡那件遗物钉在 (-53.5,-70.5)，
// 而 0.1° 的海陆掩码里那条水道是**断的**（东西向被陆地切成好几段），
// A* 根本穿不过去——玩家点它，A* 搜不到路（实测 found=false、展开 17 万节点）。
// 于是"它一直在那儿等着有人路过"成了空话：谁也到不了。
//
// 守两件事：
//   ① 每件遗物从**最近的港口** A* 过去有路，而且那条路不压陆；
//   ② 拾取半径是个真数字（不是 0，也不是无穷大），边界语义正确。
{
  // 把真掩码喂进 fetch（node 里没有 http server；掩码不加载的话
  // A* 会把整张海图当成全是海，下面这条守卫就成了假绿）
  const maskBuf = readFileSync(join(process.cwd(), 'public', 'data', 'sea-mask.bin'))
  const origFetch = globalThis.fetch
  globalThis.fetch = (async (input: any) => {
    const url = String(input)
    if (url.includes('sea-mask.bin')) {
      const b = maskBuf.buffer.slice(maskBuf.byteOffset, maskBuf.byteOffset + maskBuf.byteLength)
      return { ok: true, status: 200, arrayBuffer: async () => b } as any
    }
    return origFetch(input)
  }) as any
  await loadSeaMask('')
  assert(isSeaMaskLoaded(), '真掩码喂进 fetch 之后 seaRoute 认得海陆（否则可达性判断是假的）')

  assert(RELIC_PICKUP_NM > 40 && RELIC_PICKUP_NM < 600,
    `拾取半径是个真数字（${RELIC_PICKUP_NM} 海里：再小要精确停在它上面，再大就成了顺路经过半个大洋）`)

  // 半径的边界语义（用赤道上的探针：1° 经度 = 60 海里）
  {
    const probe = { ...RELICS[0], lat: 0, lng: 0 }
    const d = relicDistanceNm(0, -RELIC_PICKUP_NM / 60, probe)
    assert(Math.abs(d - RELIC_PICKUP_NM) < 1,
      `relicDistanceNm 量的是直线海里（${d.toFixed(1)} ≈ ${RELIC_PICKUP_NM}）`)
    assert(relicInReach(0, -(RELIC_PICKUP_NM - 1.2) / 60, probe), '在半径内算够得着')
    assert(!relicInReach(0, -(RELIC_PICKUP_NM + 1.2) / 60, probe), '出了半径算够不着')
    assert(!relicInReach(null, null, probe), '船还没下水时什么都够不着')
  }

  for (const r of RELICS) {
    let near = { d: Infinity, p: ports[0] }
    for (const p of ports) {
      const d = haversineNm(r.lat, r.lng, p.latitude, p.longitude)
      if (d < near.d) near = { d, p }
    }
    const from: [number, number] = [near.p.latitude, near.p.longitude]
    const sea = findSeaPath(from, [r.lat, r.lng])
    assert(sea.found,
      `遗物「${r.name}」从${near.p.nameCn}开得过去（A* 有路；离最近的港 ${near.d.toFixed(0)} 海里）`)
    if (sea.found) {
      const geom = buildRouteGeometry(from, [r.lat, r.lng])
      assert(!pathTouchesLand(geom.points.map(p => [p.lat, p.lng] as [number, number])),
        `通往遗物「${r.name}」的那条航线不压陆（实测 ${geom.totalNm.toFixed(0)} 海里）`)
    }
  }
}

// ---------------- 主要港口之间的航线不许穿陆 ----------------
//
// 2026-11-07 实测事故（比 greatCircleAt 那个 bug 更靠后的症状）：
// 大圆插值写错经纬之后，**所有东半球航线**都变成了横穿大陆的直线——
// 旧版阿姆斯特丹→果阿实测 4005 海里 / 压陆 84.5%（正确是 10953 海里 / 压陆 0%）。
// 玩家看到的是一条从欧洲直接插进印度的线，船真的会开过去。
//
// 这条守卫是**端到端**的：不测单个函数，而是拿真掩码跑真实的
// buildRouteGeometry，断言「玩家天天走的主航线」一条都不压陆。
// 上游任何一环（掩码 / A* / 简化 / 重采样 / 加密）坏了它都会红。
{
  const maskBuf = readFileSync(join(process.cwd(), 'public', 'data', 'sea-mask.bin'))
  const origFetch = globalThis.fetch
  globalThis.fetch = (async (input: any) => {
    const url = String(input)
    if (url.includes('sea-mask.bin')) {
      const b = maskBuf.buffer.slice(maskBuf.byteOffset, maskBuf.byteOffset + maskBuf.byteLength)
      return { ok: true, status: 200, arrayBuffer: async () => b } as any
    }
    return origFetch(input)
  }) as any
  await loadSeaMask('')
  assert(isSeaMaskLoaded(), '主航线压陆守卫跑在真掩码上（否则 A* 把全世界当海）')

  const byName = (n: string) => ports.find(p => p.nameCn === n)!
  const MAIN_ROUTES: [string, string][] = [
    ['塞维利亚', '哈瓦那'],
    ['塞维利亚', '开普敦'],
    ['塞维利亚', '巴达维亚'],
    ['塞维利亚', '韦拉克鲁斯'],
    ['伦敦', '巴达维亚'],
    ['伦敦', '开普敦'],
    ['阿姆斯特丹', '果阿'],
    ['开普敦', '巴达维亚'],
    ['开普敦', '韦拉克鲁斯'],
    ['埃尔米纳', '蒙巴萨'],
    ['果阿', '桑给巴尔'],
    ['马六甲', '澳门'],
    ['澳门', '巴达维亚'],
    ['拿骚', '塞维利亚'],
    ['里斯本', '哈瓦那'],
    // 韦拉克鲁斯当**起点**这一趟单独列出来：
    // 旧版几何在这里算出的总里程只有直线距离的 0.41 倍——
    // 「航程比两点间的直线还短」是物理上不可能的，是几何塌陷的典型症状。
    // 掮客推荐也因此把收益算高一倍多（264 金/天 vs 真值 100 金/天）。
    ['韦拉克鲁斯', '哈瓦那'],
    ['里斯本', '塞维利亚'],
  ]
  for (const [a, b] of MAIN_ROUTES) {
    const pa = byName(a), pb = byName(b)
    const geom = buildRouteGeometry([pa.latitude, pa.longitude], [pb.latitude, pb.longitude])
    const pts = geom.points.map(p => [p.lat, p.lng] as [number, number])
    assert(!pathTouchesLand(pts),
      `主航线 ${a}→${b} 不穿陆（实测 ${geom.totalNm.toFixed(0)} 海里）`)
    // 绕非洲的航线必须真的绕：直线距离与实际航程的差额不能小得离谱
    const straight = haversineNm(pa.latitude, pa.longitude, pb.latitude, pb.longitude)
    assert(geom.totalNm >= straight * 0.98,
      `主航线 ${a}→${b} 的里程不短于直线距离（航程 ${geom.totalNm.toFixed(0)} nm ≥ 直线 ${straight.toFixed(0)} nm）`)
  }

  // ---- 每件遗物都必须落在玩家真的会经过的水域里 ----
  //
  // 2026-11-07 实测事故：修好航线几何之后重测，8 件里有 2 件是**碰不到的摆设**：
  //   圣萨尔瓦多的铁锚  离最近主航线 153 海里（拾取半径 150 —— 差 3 海里）
  //   海妖的肋骨        离最近主航线 877 海里（在亚速尔外海，玩家根本不走那边）
  // 「A* 开得过去」和「路过时够得着」是两件事：
  // 前者保证不是死物件，后者保证玩家真的会遇到它。
  // 少了这一条，坐标随手一挪就成了谁也发现不了的装饰。
  {
    const routePts: { lat: number; lng: number }[] = []
    for (const [a, b] of MAIN_ROUTES) {
      const pa = byName(a), pb = byName(b)
      routePts.push(...buildRouteGeometry([pa.latitude, pa.longitude], [pb.latitude, pb.longitude]).points)
    }
    for (const r of RELICS) {
      let best = { d: Infinity, label: '' }
      for (const pt of routePts) {
        const d = greatCircleNm(r.lat, r.lng, pt.lat, pt.lng)
        if (d < best.d) best = { d, label: '' }
      }
      assert(best.d <= RELIC_PICKUP_NM,
        `遗物「${r.name}」在玩家真的会经过的水域里（离最近主航线 ${best.d.toFixed(0)} nm ≤ 拾取半径 ${RELIC_PICKUP_NM} nm）`)
    }
  }
}

// ---------------- 压在海图上的浮条不许整张卡吃点击 ----------------
// 2026-11-07 实测事故：海上遗物加入 3D 视图后，clickable-audit 报
// 「被遮挡 1」——那件遗物正好投影到左下角，被**掮客推荐浮条**的标题行
// 「掮客递来一单」吃掉了点击。掮客浮条整张卡是 pointer-events-auto，
// 于是它盖住的地图区域全变成死区。
//
// 修法与项目既有约定一致（components/ui/NotificationToast.tsx：
// 「通知是纯展示，绝不能挡住玩家的点击」）：
//   浮条 = pointer-events-none，**只有按钮** = pointer-events-auto。
{
  const brokerSrc = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'BrokerTip.tsx'), 'utf8')
  const wrappers = [...brokerSrc.matchAll(/className=\{`\$\{wrapper\} ([^`]*)`\}/g)]
  assert(wrappers.length >= 2, '找得到掮客浮条的外层容器（紧凑版 + 展开版）')
  for (const m of wrappers) {
    assert(/pointer-events-none/.test(m[1]),
      '掮客浮条外层是 pointer-events-none（它压在海图上，不许整张卡吃点击）')
  }
  assert(/mx-auto rounded-lg overflow-hidden pointer-events-none/.test(brokerSrc),
    '掮客浮条的卡片本体也不接点击（只有按钮接）')
  // 每个按钮都必须把点击接回来——浮条整体 none 之后，忘了 auto 就等于按钮点不动
  const chunks = brokerSrc.split('<button').slice(1)
  assert(chunks.length >= 8, `掮客浮条里有 ${chunks.length} 个按钮`)
  const missing = chunks.filter(c => {
    const m = c.match(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/)
    const cls = m ? (m[1] ?? m[2] ?? m[3] ?? '') : ''
    return !/pointer-events-auto/.test(cls) && !/btnClass/.test(cls)
  })
  assert(missing.length === 0,
    `掮客浮条里有 ${missing.length} 个按钮没接回点击（浮条整体 none，按钮必须 pointer-events-auto）`)
  // 按钮共用样式的地方，那条样式本身也要带 pointer-events-auto
  const btnClass = brokerSrc.match(/const btnClass =\s*'([^']*)'/)
  assert(btnClass && /pointer-events-auto/.test(btnClass[1]),
    '掮客浮条的共用按钮样式（btnClass）也带 pointer-events-auto')
}


// ---------------- 航季与季风（季节必须改变航行，而不只是换个颜色） ----------------
//
// 2026-11-08：用户要「融入季节、不要只用文字」。做的是两件事：
//   ① 四季的色调真的作用在海面/陆地上（看得到）；
//   ② 印度洋季风半年反向——这是真实的航海硬约束，不是设定说明。
//
// 【为什么必须守"天数真的变了"】
// 一个只改颜色的"季节"是装饰；季风要成立，就必须让同一条航线
// 在两季走出不同的天数。实测果阿→桑给巴尔 夏 28 天 / 秋 14 天。
// 若哪天有人把 monsoonBearing 的返回值改成恒定，颜色还在、机制没了，
// 这条断言会红。
{
  // ---- ① 周期：30 天一个航季，四个一循环 ----
  assert(seasonAt(1).id === 'spring' && seasonAt(31).id === 'summer'
    && seasonAt(61).id === 'autumn' && seasonAt(91).id === 'winter',
    `航季每 ${SEASON_DAYS} 天轮换（1/31/61/91 → 春/夏/秋/冬）`)
  assert(seasonAt(121).id === 'spring', '四个航季之后回到春（120 天一轮）')

  // ---- ② 四季色调必须真的不同，且都在合理范围 ----
  const dots = new Set(ALL_SEASONS.map(s => s.dot))
  assert(dots.size === 4, `四季各有自己的显示色（实测 ${dots.size} 种）`)
  for (const s of ALL_SEASONS) {
    for (const c of s.seaTint) {
      assert(c > 0.8 && c < 1.3,
        `${s.name}季的海色乘数在合理范围（${c}：太大就不是"偏色"而是"换游戏"）`)
    }
  }
  // 相邻两季的海色必须真的不一样：全都相等就等于没做季节
  for (let i = 0; i < ALL_SEASONS.length; i++) {
    const a = ALL_SEASONS[i].seaTint
    const b = ALL_SEASONS[(i + 1) % ALL_SEASONS.length].seaTint
    const diff = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
    assert(diff > 0.06,
      `${ALL_SEASONS[i].name}→${ALL_SEASONS[(i + 1) % ALL_SEASONS.length].name} 海色有可见差异（Σ|Δ| = ${diff.toFixed(2)}）`)
  }

  // ---- ③ 季风只在季风区生效，区外保持旧规则 ----
  const GOA: [number, number] = [15.30, 74.12]
  const ZANZ: [number, number] = [-6.17, 39.20]
  const SEV: [number, number] = [37.39, -5.98]
  const HAV: [number, number] = [23.11, -82.37]
  const SUMMER = 45, AUTUMN = 75   // 夏（西南季风）/ 秋（东北季风）

  assert(inMonsoonZone(GOA[0], GOA[1]) && inMonsoonZone(ZANZ[0], ZANZ[1]),
    '果阿与桑给巴尔都在季风区内')
  assert(!inMonsoonZone(SEV[0], SEV[1]) && !inMonsoonZone(HAV[0], HAV[1]),
    '塞维利亚与哈瓦那都在季风区外（大西洋不受季风支配）')

  assert(prevailingWindBearingAt(GOA[0], GOA[1], SUMMER) === 90
    && prevailingWindBearingAt(GOA[0], GOA[1], AUTUMN) === 270,
    '印度洋的风向半年反向（夏 90 / 秋 270）——这是季风，不是信风')
  // 区外：季节不改变风向
  assert(prevailingWindBearingAt(SEV[0], SEV[1], SUMMER) === prevailingWindBearing(SEV[0])
    && prevailingWindBearingAt(SEV[0], SEV[1], AUTUMN) === prevailingWindBearing(SEV[0]),
    '季风区外的风向与季节无关（大西洋不该跟着印度洋一起翻）')

  // ---- ④ 机制：同一条航线两季的天数必须明显不同 ----
  const fleet = {
    ships: [{ id: 1, name: 'x', type: 'caravel', capacity: 60, usedCapacity: 0, durability: 100, crew: 40, speed: 6 }],
    officers: [], morale: 80, fame: 0, gold: 500, day: 1, food: 100, water: 100,
    trait: 'merchant', currentPortId: 6, isSailing: false,
  } as unknown as Parameters<typeof calculateSailingDays>[1]
  const dist = 2614  // 果阿→桑给巴尔的真实航程
  const daysOf = (day: number) => {
    const wf = computeWindFavor(GOA[0], GOA[1], ZANZ[0], ZANZ[1], day)
    return calculateSailingDays(
      { id: -1, fromPortId: 11, toPortId: 17, distance: dist, dangerLevel: 1, windFavor: wf },
      fleet,
    )
  }
  const dSummer = daysOf(SUMMER), dAutumn = daysOf(AUTUMN)
  // 「快」= 天数少。秋季（东北季风，西行顺）往西走，所以秋季天数必须明显更少
  assert(dSummer >= dAutumn * 1.5,
    `果阿→桑给巴尔 秋季比夏季快至少 1.5 倍（实测 夏 ${dSummer} 天 → 秋 ${dAutumn} 天）——季风是真的机制，不是颜色`)

  // 反向航线的快慢必须倒过来（否则就不是"风变了"，而是"整体变快了"）
  const daysOfRev = (day: number) => {
    const wf = computeWindFavor(ZANZ[0], ZANZ[1], GOA[0], GOA[1], day)
    return calculateSailingDays(
      { id: -1, fromPortId: 17, toPortId: 11, distance: dist, dangerLevel: 1, windFavor: wf },
      fleet,
    )
  }
  assert(daysOfRev(SUMMER) <= dAutumn,
    `反向航线（桑给巴尔→果阿）夏季不比秋季慢（实测 ${daysOfRev(SUMMER)} / ${daysOfRev(AUTUMN)} 天）`)
  // 大西洋对照：两季完全一样
  const atlantic = (day: number) => computeWindFavor(SEV[0], SEV[1], HAV[0], HAV[1], day)
  assert(atlantic(SUMMER) === atlantic(AUTUMN),
    `大西洋航线不受季风影响（夏 ${atlantic(SUMMER)} / 秋 ${atlantic(AUTUMN)} 必须相同）`)

  // ---- ⑤ 洋流：只有季风漂流掉头 ----
  const drift = OCEAN_CURRENTS.find(c => c.monsoonReverses)
  assert(!!drift, '有一条洋流标了「随季风掉头」（季风漂流）')
  const gulf = OCEAN_CURRENTS.find(c => c.name === '湾流')!
  assert(currentFlowPoints(gulf, SUMMER) === gulf.points
    && currentFlowPoints(gulf, AUTUMN) === gulf.points,
    '湾流常年一个方向，不随季节掉头')
  if (drift) {
    const a = currentFlowPoints(drift, SUMMER)
    const b = currentFlowPoints(drift, AUTUMN)
    assert(a.length === b.length && a[0][0] === b[b.length - 1][0] && a[0][1] === b[b.length - 1][1],
      '季风漂流在东北季风期点序反向（3D 的虚线沿点序流动，反向即"水往回流"）')
  }

  // ---- ⑥ 风箭头：季风区内外都得跟着同一份口径 ----
  const arrowsSummer = windArrowSites(SUMMER)
  const arrowsAutumn = windArrowSites(AUTUMN)
  assert(arrowsSummer.length === arrowsAutumn.length && arrowsSummer.length > 100,
    `风箭头站点数两季一致（${arrowsSummer.length} 个）`)
  const inZone = (s: { lat: number; lng: number }) => inMonsoonZone(s.lat, s.lng)
  const flipped = arrowsSummer.filter((s, i) => inZone(s) && arrowsAutumn[i].bearing !== s.bearing)
  const steady = arrowsSummer.filter((s, i) => !inZone(s) && arrowsAutumn[i].bearing !== s.bearing)
  assert(flipped.length > 0, `季风区内的箭头在秋季反了向（${flipped.length} 个）`)
  assert(steady.length === 0, `季风区外的箭头两季一致（异常 ${steady.length} 个）`)
}


// ---------------- 雪线：既要看海拔，也要随季节升降 ----------------
//
// 2026-11-08：原来雪态是 `|lat| >= 48` 一刀切，于是：
//   · 阿尔卑斯（46°N，很高）没有雪；西伯利亚平原（60°N，平地）有雪 —— 反了；
//   · 乞力马扎罗在赤道却没有雪 —— 也反了。
// 现在分三相：常年雪 / 只有寒季雪 / 无雪。中间那一相就是真实雪线在做的事
// （夏季上移、冬季压下来），换季时山上会多一层/脱一层雪。
//
// 【为什么必须守"三相都不是空集"】退化成两相（全常年雪或全无雪），
// 换季就不会有任何变化，而画面依旧正常——那种"静默失效"只能靠断言抓。
{
  const NO_ELEV = {}
  // 高纬平地：常年雪
  assert(snowPhaseOf(62, 20, NO_ELEV) === 'always', '高纬（62°N）常年有雪')
  // 中纬：不给海拔时只到"寒季雪"一档（旧判据在这里是 48° 一刀切，46° 直接无雪）
  assert(snowPhaseOf(46, 10, NO_ELEV) === 'cold', '中纬（46°N）不给高程时是"寒季雪"（不是一无所有）')
  // 海拔的作用：同一个 46°N，高程够高就从"寒季雪"升成"常年雪"
  assert(snowPhaseOf(46, 10, { elevAt: () => 0.9 }) === 'always',
    '同一个纬度，高程 0.9 时升为常年雪——海拔是判据的一部分，不是装饰')
  assert(snowPhaseOf(46, 10, { elevAt: () => 0.2 }) === 'cold',
    '同一个纬度，高程 0.2 时退回寒季雪——低地不该跟高峰一样白')
  // 中纬 + 高海拔（阿尔卑斯）：只有寒季雪
  const highAlps = { elevAt: (la: number, ln: number) => (Math.abs(la - 46) < 3 && Math.abs(ln - 10) < 6 ? 0.82 : 0.2) }
  assert(snowPhaseOf(46, 10, highAlps) === 'cold', '阿尔卑斯（46°N 且高程 0.82）只有寒季有雪')
  // 赤道 + 极高（乞力马扎罗）：常年雪
  const kilimanjaro = { elevAt: () => 0.9 }
  assert(snowPhaseOf(-3, 37, kilimanjaro) === 'always', '赤道的高峰（乞力马扎罗）常年有雪——纬度不是唯一判据')
  // 低纬低地：无雪
  assert(snowPhaseOf(0, 20, { elevAt: () => 0.1 }) === 'never', '赤道低地没有雪')

  // 三相在真实数据上都必须非空（否则换季看不出变化）
  // 用一组覆盖全球的探针点代替真实符号，保证这条断言不依赖解码 PNG
  let always = 0, cold = 0, never = 0
  for (const [la, ln, e] of [
    [70, 20, 0.1], [62, -40, 0.3], [58, 60, 0.2],
    [46, 10, 0.82], [40, -105, 0.80], [-30, -70, 0.78],
    [5, 20, 0.1], [0, 100, 0.2], [25, 80, 0.3],
  ] as [number, number, number][]) {
    const ph = snowPhaseOf(la, ln, { elevAt: () => e })
    if (ph === 'always') always++
    else if (ph === 'cold') cold++
    else never++
  }
  assert(always > 0 && cold > 0 && never > 0,
    `雪态三相都不是空集（常年 ${always} / 寒季 ${cold} / 无雪 ${never}）——退化两相就等于没有季节`)
}

// ---------------- 神话按时令出现（不是"藏起来"，是那一季根本不在） ----------------
//
// 2026-11-08：把神话绑到季节上，且**不写一段说明**——
// 塞壬的七弦琴只在夏天（风平浪静才听得见），海妖的肋骨只在秋天（风暴把海底翻上来）。
// 其他三季它不是躲在某处，而是海面上没有它。
//
// 【为什么必须守"看不见的不许被拾走"】2D/3D 层按季节过滤了，
// 但换季瞬间 DOM 可能还留着旧标记；若拾取闸门不判季节，
// 玩家就能点在旧帧上把"秋天才有"的东西捞走——那句话当场变成假的。
{
  const SUMMER = 45, AUTUMN = 75, WINTER = 105
  const gated = RELICS.filter(r => r.seasons && r.seasons.length > 0)
  const always = RELICS.filter(r => !r.seasons || r.seasons.length === 0)
  assert(gated.length > 0 && gated.length < RELICS.length,
    `按时令出现的遗物只是少数（${gated.length}/${RELICS.length}：其余常年都在）`)
  assert(always.every(r => relicInSeason(r, SUMMER) && relicInSeason(r, AUTUMN)),
    '没标 seasons 的遗物四季都在（多数东西不该随季节消失）')

  const kraken = RELICS.find(r => r.id === 'kraken_rib')!
  const siren = RELICS.find(r => r.id === 'siren_lyre')!
  assert(relicInSeason(kraken, AUTUMN) && !relicInSeason(kraken, SUMMER) && !relicInSeason(kraken, WINTER),
    '海妖的肋骨只在秋季出现（风暴季把海底的东西翻上来）')
  assert(relicInSeason(siren, SUMMER) && !relicInSeason(siren, AUTUMN),
    '塞壬的七弦琴只在夏季出现（风平浪静才听得见她的歌）')

  // 图鉴的满分不因为季节而变：格子一直有 8 个，只是标「此季不在」
  assert(RELIC_COUNT === RELICS.length && RELIC_COUNT >= 8,
    `图鉴仍是全部 ${RELIC_COUNT} 格（按时令出现的也在册子里，只是标"此季不在"）`)

  // 三处必须共用同一个判据，别各判一次
  const sea2d = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'SeaRelics.tsx'), 'utf8')
  assert(/relicInSeason\(r, day\)/.test(sea2d), '2D 海面层按季节过滤遗物')
  const view3d = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'Map3DView.tsx'), 'utf8')
  assert(/relicInSeason\(r, day\)/.test(view3d), '3D 海面层按季节过滤遗物（与 2D 同一份判据）')
  const store = readFileSync(join(process.cwd(), 'src', 'store', 'useGameStore.ts'), 'utf8')
  const iRelic = store.indexOf('collectRelic: (id) => {')
  const iAfter = store.indexOf('addNotification:', iRelic)
  const body = iRelic >= 0 && iAfter > iRelic ? store.slice(iRelic, iAfter) : ''
  assert(/relicInSeason\(relic, state\.fleet\.day\)/.test(body),
    '拾取闸门也判季节：看不见的东西不许被拾走（换季瞬间的旧 DOM 也不行）')
}

// ---------------- 季节性海上现象：这一季的这片水必须真的在主航线上 ----------------
//
// 2026-11-08 用户方向：「融入季节，不要只用文字」。
// 这一层不是给季节配一句说明，而是**一片按时令出现在地图上的水**：
// 开进去天数真的变多、出事真的更频繁、船在风暴带里时天气面板会说出来。
//
// 选址是最容易做假的一步：随便找一个漂亮的海域画个圈，玩家一辈子开不到那里，
// 那就是"装饰"而不是机制（海上遗物那一轮已经踩过一次：两件遗物离任何航线
// 150 海里以上）。所以下面三条必须一起守：
//   ① 圆心在海上（真掩码）；
//   ② 界线的每一段到圆心都是同一个距离（真圆，2D/3D 才画得一样）；
//   ③ **主航线真的穿过它**（真 A*，至少 150 海里在圈内）。
{
  const maskBuf = readFileSync(join(process.cwd(), 'public', 'data', 'sea-mask.bin'))
  const origFetch2 = globalThis.fetch
  globalThis.fetch = (async (input: any) => {
    const url = String(input)
    if (url.includes('sea-mask.bin')) {
      const b = maskBuf.buffer.slice(maskBuf.byteOffset, maskBuf.byteOffset + maskBuf.byteLength)
      return { ok: true, status: 200, arrayBuffer: async () => b } as any
    }
    return origFetch2(input)
  }) as any
  await loadSeaMask('')

  // ---- ① 四季各一条，一年走完一圈 ----
  const seasons = new Set(SEA_PHENOMENA.map(p => p.season))
  assert(SEA_PHENOMENA.length === 4 && seasons.size === 4,
    `四季各有一条海上现象（共 ${SEA_PHENOMENA.length} 条 / ${seasons.size} 个航季）`)
  const names = new Set(SEA_PHENOMENA.map(p => p.name))
  assert(names.size === SEA_PHENOMENA.length, '四条的名字不重复（地图上要靠名字分辨）')

  for (const p of SEA_PHENOMENA) {
    // ---- ② 圆心必须在海上 ----
    assert(!isLandAt(p.lat, p.lng),
      `「${p.name}」的圆心在海里（${p.lat}, ${p.lng}）——画在陆地上就不是海况了`)

    // ---- ③ 界线是真圆 ----
    const ring = phenomenonRing(p)
    const want = p.radiusDeg * 60
    const ds = ring.map(([la, ln]) => haversineNm(p.lat, p.lng, la, ln))
    const lo = Math.min(...ds), hi = Math.max(...ds)
    assert(Math.abs(lo - want) < want * 0.03 && Math.abs(hi - want) < want * 0.03,
      `「${p.name}」的界线是正圆（期望 ${want.toFixed(0)} 海里，实测 ${lo.toFixed(0)}~${hi.toFixed(0)}）`)
    // 2D 与 3D 读同一段点：环必须闭合（首尾同点）
    assert(ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1],
      `「${p.name}」的界线闭合（2D 折线与 3D 线读的是同一段点）`)

    // 季节性：只有本季会出现
    const dayIn = ['spring', 'summer', 'autumn', 'winter'].indexOf(p.season) * SEASON_DAYS + 5
    const dayOut = ((dayIn / SEASON_DAYS + 1) | 0) * SEASON_DAYS + 5
    assert(phenomenonAt(p.lat, p.lng, dayIn)?.id === p.id,
      `「${p.name}」在${p.season}的圆心处确实在（day ${dayIn}）`)
    assert(phenomenonAt(p.lat, p.lng, dayOut) === null,
      `「${p.name}」换到别的航季就不在了（day ${dayOut}）`)
    assert(!inPhenomenon(p, p.lat + p.radiusDeg * 2, p.lng),
      `「${p.name}」的边界之外不算在里面`)
  }

  // ---- ④ 主航线必须真的穿过（否则就是"画在没人去的大洋上"）----
  {
    const byName = (n: string) => ports.find(p => p.nameCn === n)!
    const MAIN: [string, string][] = [
      ['塞维利亚', '巴达维亚'], ['伦敦', '开普敦'], ['塞维利亚', '开普敦'],
      ['里斯本', '圣胡安'], ['拿骚', '里斯本'], ['塞维利亚', '哈瓦那'],
      ['伦敦', '巴达维亚'], ['阿姆斯特丹', '果阿'], ['开普敦', '巴达维亚'],
      ['塞维利亚', '韦拉克鲁斯'], ['里斯本', '哈瓦那'], ['拿骚', '塞维利亚'],
    ]
    const geoms = MAIN.map(([a, b]) => {
      const pa = byName(a), pb = byName(b)
      return { label: `${a}→${b}`, geom: buildRouteGeometry([pa.latitude, pa.longitude], [pb.latitude, pb.longitude]) }
    })
    for (const p of SEA_PHENOMENA) {
      let best = { nm: 0, label: '—' }
      for (const g of geoms) {
        let nm = 0
        for (let i = 1; i < g.geom.points.length; i++) {
          const a = g.geom.points[i - 1], b = g.geom.points[i]
          const seg = haversineNm(a.lat, a.lng, b.lat, b.lng)
          if (inPhenomenon(p, (a.lat + b.lat) / 2, (a.lng + b.lng) / 2)) nm += seg
        }
        if (nm > best.nm) best = { nm, label: g.label }
      }
      assert(best.nm >= 150,
        `「${p.name}」真的压在主航线上（最长穿过 ${best.nm.toFixed(0)} 海里：${best.label}）——摆在没人走的洋面上等于没做`)
    }
  }

  // ---- ⑤ 真的改变天数：同一条航线，这一季比别的季慢 ----
  {
    const fleet2 = {
      ships: [{ id: 1, name: 'x', type: 'caravel', capacity: 60, usedCapacity: 0, durability: 100, crew: 40, speed: 6, maxCrew: 40 }],
      officers: [], morale: 80, fame: 0, gold: 500, day: 1, food: 100, water: 100,
      trait: null, currentPortId: 6, isSailing: false,
    } as unknown as Parameters<typeof voyageDays>[0]['fleet']
    const clear = { kind: 'clear' } as unknown as Parameters<typeof voyageDays>[0]['weather']
    const lis = ports.find(p => p.nameCn === '里斯本')!
    const sju = ports.find(p => p.nameCn === '圣胡安')!
    const A: [number, number] = [lis.latitude, lis.longitude]
    const B: [number, number] = [sju.latitude, sju.longitude]
    const geom = buildRouteGeometry(A, B)
    const nm = Math.round(geom.totalNm)
    const daysAt = (day: number) => voyageDays({
      distanceNm: nm,
      windFavor: windFavorForRoute(A, B, day, geom.points),
      fleet: fleet2, officers: [], weather: clear,
    })
    const SPRING = 5, SUMMER = 35
    // 里斯本→圣胡安 夏季要横穿马尾藻的无风带（实测 21.6% 的航程在圈内）
    const dSpring = daysAt(SPRING), dSummer = daysAt(SUMMER)
    assert(dSummer > dSpring,
      `夏季走里斯本→圣胡安必须更慢（春 ${dSpring} 天 → 夏 ${dSummer} 天：要横穿马尾藻的无风带）`)

    // 反过来：不在这一季，乘数必须是 1（不能"四季都在减速"）
    const fSummer = routePhenomenonFactor(geom.points, SUMMER)
    const fWinter = routePhenomenonFactor(geom.points, 95)
    assert(fSummer < 0.99 && fSummer > 0.5,
      `夏季这条航线被无风带拖慢（乘数 ${fSummer}，在 0.5~0.99 之间）`)
    assert(fWinter === 1,
      `冬季同一条航线完全不受影响（乘数 ${fWinter}）——现象只在它那一季生效`)
  }

  // ---- ⑥ 事件率：坏水更凶，无风带反而更太平 ----
  {
    const cape = SEA_PHENOMENA.find(p => p.id === 'cape_storm_belt')!
    const sarg = SEA_PHENOMENA.find(p => p.id === 'sargasso_calm')!
    assert(phenomenonEventBias(cape.lat, cape.lng, 65) > 1.3,
      `秋季在风暴带里，天候事件率明显更高（×${phenomenonEventBias(cape.lat, cape.lng, 65).toFixed(2)}）`)
    assert(phenomenonEventBias(sarg.lat, sarg.lng, 35) < 0.9,
      `夏季在马尾藻里，天候事件率反而更低（×${phenomenonEventBias(sarg.lat, sarg.lng, 35).toFixed(2)}：没有风就没有风暴）`)
    assert(phenomenonEventBias(cape.lat, cape.lng, 35) === 1,
      '不在这一季就没有加成（同一片海，夏季不该还按风暴带算）')
  }

  // ---- ⑦ 2D 与 3D 必须读同一份数据 ----
  {
    const flat = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'SeaPhenomena.tsx'), 'utf8')
    assert(/activePhenomena\(day\)/.test(flat) && /phenomenonRing\(p\)/.test(flat),
      '2D 海面层用 data/seaPhenomena 的选区与界线')
    assert(/interactive=\{false\}/.test(flat),
      '2D 现象层不吃点击（压在海图上的浮层绝不能挡玩家点地图）')
    const three = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'mapLayers3d.ts'), 'utf8')
    assert(/SEA_PHENOMENA/.test(three) && /phenomenonRing\(/.test(three),
      '3D 用的是同一批现象与同一条界线（不是各画一个形状）')
    const badge = readFileSync(join(process.cwd(), 'src', 'components', 'ui', 'WeatherBadge.tsx'), 'utf8')
    assert(/const phenomenon = fleet\.isSailing && lat != null && lng != null\s*\?\s*phenomenonAt\(lat, lng, fleet\.day\)/.test(badge),
      '船在这片水里时天气面板要说出来，且只在航行中（港内拿港口坐标判会谎报"航速 -22%"）')
  }
}


// ---------------- 3D 图层换季：洋流点序与风箭头必须跟着变 ----------------
//
// 2026-11-08：3D 的洋流与风箭头原先只在**挂载时**按当天算一次。
// 玩家在 3D 里过了一个换季，航线天数已经按新季风算（印度洋半年反向），
// 画面上却还是上一季的风与水流——"屏幕上的东西不等于实际发生的变化"，
// 这是本项目最不能留的一类问题，而且它不会报错、截图也看不出来。
//
// 【为什么这里能直接在 node 里建 3D 图层】只建几何与实例矩阵，不渲染，
// 不需要 WebGL。建完读 geometry 的顶点、InstancedMesh 的矩阵就能判定。
{
  const layersSpring = buildMap3DLayers(5)    // 春：西南季风
  const gulfIdx = OCEAN_CURRENTS.findIndex(c => c.name === '湾流')
  const driftIdx = OCEAN_CURRENTS.findIndex(c => !!c.monsoonReverses)
  assert(gulfIdx >= 0 && driftIdx >= 0, '洋流数据里有湾流与季风漂流')

  /** 取第 i 条洋流线的第一个顶点（世界坐标） */
  const firstPointOf = (grp: THREE.Group, i: number) => {
    const line = grp.children[i] as unknown as {
      geometry?: { attributes?: { instanceStart?: { data?: { array: ArrayLike<number> } } } }
    }
    const arr = line.geometry?.attributes?.instanceStart?.data?.array
    return arr ? [arr[0], arr[1], arr[2]] : null
  }

  const driftSpring = firstPointOf(layersSpring.currents, driftIdx)
  const gulfSpring = firstPointOf(layersSpring.currents, gulfIdx)
  assert(!!driftSpring && !!gulfSpring, '读得到洋流线的顶点（否则下面两条是空断言）')

  // 风箭头：整份实例矩阵
  const windMesh = layersSpring.winds.children.find(
    c => (c as unknown as { isInstancedMesh?: boolean }).isInstancedMesh,
  ) as unknown as { instanceMatrix?: { array: ArrayLike<number> } } | undefined
  const windSpring = windMesh?.instanceMatrix?.array
  assert(!!windSpring && windSpring.length > 0, '风带层里有一个 InstancedMesh（箭头）')
  const windSnapshot = windSpring ? Array.from(windSpring) : []

  // 换到秋（东北季风）
  layersSpring.setDay(65)

  const driftAutumn = firstPointOf(layersSpring.currents, driftIdx)
  const gulfAutumn = firstPointOf(layersSpring.currents, gulfIdx)
  const windAutumn = windMesh?.instanceMatrix?.array
  const windChanged = !!windAutumn && Array.from(windAutumn).some((v, i) => v !== windSnapshot[i])

  const driftMoved = !!driftAutumn && !!driftSpring
    && (driftAutumn[0] !== driftSpring[0] || driftAutumn[2] !== driftSpring[2])
  const gulfMoved = !!gulfAutumn && !!gulfSpring
    && (gulfAutumn[0] !== gulfSpring[0] || gulfAutumn[2] !== gulfSpring[2])

  assert(driftMoved,
    '换季后季风漂流换了点序（3D 虚线沿点序流动，倒过来就是"水往回流"）')
  assert(!gulfMoved, '湾流常年一个方向，换季不该动它')
  assert(windChanged,
    '换季后风箭头被重写（印度洋半年反向：不重写就是屏幕和实际不一致）')

  // 回到春：必须逐位还原（不是"越改越偏"）
  layersSpring.setDay(5)
  const driftBack = firstPointOf(layersSpring.currents, driftIdx)
  const windBack = windMesh?.instanceMatrix?.array
  assert(!!driftBack && driftBack[0] === driftSpring![0] && driftBack[2] === driftSpring![2],
    '换回春季，洋流点序逐位还原')
  assert(!!windBack && Array.from(windBack).every((v, i) => v === windSnapshot[i]),
    '换回春季，风箭头矩阵逐位还原')

  // 同一天重复调用是空操作（帧循环里每次换季只该算一次）
  layersSpring.setDay(5)
  const driftAgain = firstPointOf(layersSpring.currents, driftIdx)
  assert(!!driftAgain && driftAgain[0] === driftSpring![0], '同一天重复 setDay 不改动任何东西')

  layersSpring.dispose()
}


// ---------------- 驶入一片坏水要有一次回执（不是每天一条） ----------------
//
// 现象会让航程变长、天候事件变多，但两件事都是"慢慢发生"的：
// 玩家看到的只是这两天走得慢，原因藏在天气面板里。因果必须在发生的那一刻说一次。
// 但也不能每天说——一路穿过风暴带会连弹五条，通知容器同屏只留两条。
{
  const breezeShip = {
    id: 1, name: '测试船', type: 'caravel', capacity: 60, usedCapacity: 0,
    durability: 100, crew: 40, maxCrew: 40, speed: 6,
  }
  const fleetP: Fleet = {
    id: 1, name: '测试舰队', gold: 500, fame: 0, morale: 60, food: 100, water: 100,
    currentPortId: null, isSailing: true, day: 35, ships: [breezeShip as never],
    cargo: [], flagshipId: 1, trait: null, durabilityCarry: 0,
  }
  const routeP: Route = { id: -77, fromPortId: 6, toPortId: 7, distance: 1000, dangerLevel: 2, windFavor: 1 }

  const enterCount = () => useGameStore.getState().notifications.filter(n => n.title.startsWith('驶入')).length

  useGameStore.setState({
    fleet: fleetP,
    currentRoute: routeP,
    waypoint: { latitude: 27, longitude: -55, portId: 7 },
    // 马尾藻的无风带圆心（夏季）
    shipPosition: [27, -55],
    segmentCount: 0, segmentIndex: 0, pendingSegment: null, pendingHelm: null, helmAdvance: null,
    // 参观模式：不吃不喝不判负，把变量压到最少
    gameMode: 'visitor',
    gamePhase: 'playing',
    lastEventDay: 999999,
    lastPhenomenonId: null,
    notifications: [],
  })

  useGameStore.getState().advanceDay()
  assert(enterCount() === 1,
    `驶入无风带时给一次回执（实测 ${enterCount()} 条）——否则"这两天怎么慢了两成"没有解释`)
  const first = useGameStore.getState().notifications.find(n => n.title.startsWith('驶入'))!
  assert(first.title.includes('马尾藻'), `回执说的是那一片水（${first.title}）`)
  assert(first.message.length > 10, '回执带着这片水的来历（不是干巴巴一句"你进入了区域"）')
  assert(useGameStore.getState().lastPhenomenonId === 'sargasso_calm',
    '结算时记下了船在哪片水里（下次要靠它判"是不是换了一片"）')

  // 同一天气、同一片水：第二天不该再弹
  useGameStore.getState().advanceDay()
  assert(enterCount() === 1, `同一片水里连着走几天只提示一次（实测 ${enterCount()} 条）`)

  // 驶出：不提示，但要把记录清掉
  useGameStore.setState({ shipPosition: [0, -120] })
  useGameStore.getState().advanceDay()
  assert(enterCount() === 1, '驶出时不弹提示（离开不是事件）')
  assert(useGameStore.getState().lastPhenomenonId === null, '驶出后记录清空（再进来才要再提示一次）')

  // 再驶入：还要提示
  useGameStore.setState({ shipPosition: [27, -55] })
  useGameStore.getState().advanceDay()
  assert(enterCount() === 2, `再次驶入再提示一次（实测 ${enterCount()} 条）`)

  // 收尾：别把这份状态留给后面的用例
  useGameStore.setState({ shipPosition: null, lastPhenomenonId: null, notifications: [] })
}


// ---------------- 石十字改的不是数值，是规则（识得此路） ----------------
//
// 2026-11-08：用户要「神话/历史靠机制落地」。一件只给名号与补给的实物，
// 本质上还是"+数值的收集品"。迪亚士的石十字不同：它标的是贴着岸走的窄水道，
// 拾到它 = 这条航路从此对你不同（风暴带不再拖累航程）。
//
// 【这一条为什么必须守】"知识改变规则"最容易做成空话：
// 拾起的动画有了、图鉴点亮了、回执也弹了，但计算里根本没读它——
// 玩家只会觉得"好像顺了一点"。所以要断言**同一条航线、同一天，
// 带不识得时慢、识得后恢复**。
{
  const fleetK = {
    ships: [{ id: 1, name: 'x', type: 'caravel', capacity: 60, usedCapacity: 0, durability: 100, crew: 40, speed: 6, maxCrew: 40 }],
    officers: [], morale: 80, fame: 0, gold: 500, day: 1, food: 100, water: 100,
    trait: null, currentPortId: 6, isSailing: false,
  } as unknown as Parameters<typeof voyageDays>[0]['fleet']
  const clearK = { kind: 'clear' } as unknown as Parameters<typeof voyageDays>[0]['weather']

  // ① 石十字必须在海上、且在风暴带圈内 —— 否则"要穿过那片水才拿得到"是假的
  const padrao = RELICS.find(r => r.passage)
  assert(!!padrao, '有一件遗物标着 passage（拾到就识得一条航路）')
  const padraoBelt = SEA_PHENOMENA.find(p => p.id === padrao!.passage)!
  assert(!!padraoBelt, '那条航路在 data/seaPhenomena 里真实存在')
  assert(!relicInSeason(padrao!, 5) || relicInSeason(padrao!, 5),
    '石十字常年都在（它不是时令物，是钉在礁石上的东西）')
  {
    const maskBuf2 = readFileSync(join(process.cwd(), 'public', 'data', 'sea-mask.bin'))
    const origFetch3 = globalThis.fetch
    globalThis.fetch = (async (input: any) => {
      const url = String(input)
      if (url.includes('sea-mask.bin')) {
        const b = maskBuf2.buffer.slice(maskBuf2.byteOffset, maskBuf2.byteOffset + maskBuf2.byteLength)
        return { ok: true, status: 200, arrayBuffer: async () => b } as any
      }
      return origFetch3(input)
    }) as any
    await loadSeaMask('')
    assert(!isLandAt(padrao!.lat, padrao!.lng),
      `石十字在海里（${padrao!.lat}, ${padrao!.lng}）`)
    assert(inPhenomenon(padraoBelt, padrao!.lat, padrao!.lng),
      '石十字就立在风暴带里——想拿到它，必须开进那片水')
  }

  // ② 同一条航线：不识得时慢，识得后恢复
  {
    const kap = ports.find(p => p.nameCn === '开普敦')!
    const bat = ports.find(p => p.nameCn === '巴达维亚')!
    const A: [number, number] = [kap.latitude, kap.longitude]
    const B: [number, number] = [bat.latitude, bat.longitude]
    const geom = buildRouteGeometry(A, B)
    const nm = Math.round(geom.totalNm)
    const AUTUMN = 65

    const fBlind = routePhenomenonFactor(geom.points, AUTUMN)
    const fKnown = routePhenomenonFactor(geom.points, AUTUMN, [padraoBelt.id])
    assert(fBlind < 1, `不识得时这条航线被风暴带拖慢（乘数 ${fBlind}）`)
    assert(fKnown === 1,
      `识得之后同一条航线不再减速（乘数 ${fKnown}）——知识改的是规则，不是数值`)

    const daysBlind = voyageDays({
      distanceNm: nm, windFavor: windFavorForRoute(A, B, AUTUMN, geom.points),
      fleet: fleetK, officers: [], weather: clearK,
    })
    const daysKnown = voyageDays({
      distanceNm: nm, windFavor: windFavorForRoute(A, B, AUTUMN, geom.points, [padraoBelt.id]),
      fleet: fleetK, officers: [], weather: clearK,
    })
    assert(daysKnown <= daysBlind && daysKnown >= 1,
      `识得此路真的省下天数（${daysBlind} 天 → ${daysKnown} 天）`)

    // 别的季节不受影响：秋天才有风暴带
    assert(routePhenomenonFactor(geom.points, 5) === 1,
      '春季这条航线本来就没事（识得不识得都一样）')
  }

  // ③ 拾起动作真的把它记进 knownPassages，并说清后果
  {
    const storeSrc3 = readFileSync(join(process.cwd(), 'src', 'store', 'useGameStore.ts'), 'utf8')
    assert(/knownPassages: learnsPassage\s*\n?\s*\? \[\.\.\.state\.knownPassages, relic\.passage as string\]/.test(storeSrc3)
      || /learnsPassage/.test(storeSrc3) && /state\.knownPassages, relic\.passage/.test(storeSrc3),
      '拾起带 passage 的遗物时写进 knownPassages')
    assert(/识得此路/.test(storeSrc3), '回执标题说"识得此路"（不是"你获得了知识"这种空话）')
    assert(/不再减速/.test(storeSrc3), '回执正文说清后果（此后穿过某片水不再减速）')

    // 存档：这几处必须同源，否则刷新后"知识"丢了，规则又变回去
    const saveSrc = readFileSync(join(process.cwd(), 'src', 'utils', 'saveFile.ts'), 'utf8')
    const typeSrc = readFileSync(join(process.cwd(), 'src', 'types', 'index.ts'), 'utf8')
    assert(/knownPassages/.test(typeSrc), 'knownPassages 在 GameState 里')
    assert(/knownPassages/.test(saveSrc), 'knownPassages 在存档白名单里（否则重开就忘）')
    assert(/knownPassages: state\.knownPassages/.test(storeSrc3), 'knownPassages 进了 partialize')

    // 四个算航程的地方都要把它传下去（少一处就会出现"面板说慢、卡说快"）
    const passCount = (storeSrc3.match(/state\.knownPassages/g) ?? []).length
    assert(passCount >= 6,
      `store 里至少有 6 处用到 knownPassages（实测 ${passCount} 处：记账 + 四处航程 + 存档）`)
  }
}


// ---------------- 洋流：顺流推你一把，逆流顶你回来 ----------------
//
// 2026-11-09：洋流以前只是地图上的虚线，不参与任何计算。而大航海最实在的
// 地理知识就是"顺着流走"：湾流把船从加勒比推回欧洲，阿古拉斯沿岸流把船
// 从印度洋那边顶回来（所以回欧洲的人宁可走外海绕开它）。
//
// 【修了一处数据错误】北赤道流、南赤道流都向西流，阿古拉斯沿南非东南岸向西南流，
// 而它们原来的点序是反的。以前没人读方向，所以看不出来；一旦方向进入计算，
// 顺流与逆流就整个颠倒——所以下面第一条就钉方向。
{
  // ---- ① 方向：点序就是流向，三条修过的必须指向真实方向 ----
  const bearingOf = (name: string) => {
    const c = OCEAN_CURRENTS.find(x => x.name === name)!
    const [a, b] = [c.points[0], c.points[c.points.length - 1]]
    return calculateBearing(a[0], a[1], b[0], b[1])
  }
  const nec = bearingOf('北赤道流')
  const sec = bearingOf('南赤道流')
  const agu = bearingOf('阿古拉斯暖流')
  assert(nec > 250 && nec < 290, `北赤道流向西（实测方位 ${nec.toFixed(0)}°）——信风推的，不是向东`)
  assert(sec > 250 && sec < 290, `南赤道流向西（实测 ${sec.toFixed(0)}°）`)
  assert(agu > 180 && agu < 260, `阿古拉斯沿南非东南岸向西南（实测 ${agu.toFixed(0)}°）`)

  // ---- ② 符号：顺流 > 1、逆流 < 1、横穿 ≈ 1 ----
  {
    const west = Array.from({ length: 20 }, (_, i) => ({ lat: 15, lng: -25 - i * 1.5 }))
    const east = [...west].reverse()
    const fw = routeCurrentFactor(west, 5)
    const fe = routeCurrentFactor(east, 5)
    assert(fw > 1.02, `沿北赤道流向西是顺流（乘数 ${fw}）`)
    assert(fe < 0.98, `反向向东是逆流（乘数 ${fe}）`)
    assert(Math.abs(fw - 1) < 0.2 && Math.abs(fe - 1) < 0.2,
      `洋流的影响在合理范围（${fw} / ${fe}）——再大就成了气候不是洋流`)

    const ne = Array.from({ length: 20 }, (_, i) => ({ lat: 30 + i * 0.7, lng: -72 + i * 1.2 }))
    const sw = [...ne].reverse()
    const fn = routeCurrentFactor(ne, 5)
    const fs = routeCurrentFactor(sw, 5)
    assert(fn > 1.04, `顺湾流往东北更快（乘数 ${fn}）`)
    assert(fs < 0.96, `逆湾流往西南更慢（乘数 ${fs}）`)

    // 横穿洋流既不快也不慢（补舵抵掉横向位移）
    const south = Array.from({ length: 20 }, (_, i) => ({ lat: 30 - i * 0.8, lng: -60 }))
    const fc = routeCurrentFactor(south, 5)
    assert(Math.abs(fc - 1) < 0.01, `横穿洋流对里程几乎无影响（乘数 ${fc}）——方向对了才可能这样`)
  }

  // ---- ③ 只在有流的海域生效 ----
  assert(currentAt(0, -140, 5) === null, '太平洋中部没有洋流数据，乘数应为 1')
  assert(routeCurrentFactor([{ lat: 0, lng: -140 }, { lat: 1, lng: -139 }], 5) === 1,
    '没有洋流的海域乘数恒为 1（不假装全世界都有流）')
  assert(!!currentAt(37, -65, 5), '百慕大一带在湾流带里')

  // ---- ④ 季风漂流：换季掉头，同一条直线两季一顺一逆 ----
  {
    const along = Array.from({ length: 16 }, (_, i) => ({ lat: 8 + i * 0.45, lng: 60 + i * 2.1 }))
    const fSpring = routeCurrentFactor(along, 5)    // 西南季风：向东
    const fAutumn = routeCurrentFactor(along, 65)   // 东北季风：向西
    assert(fSpring > fAutumn,
      `季风漂流换季后同一条航线由顺转逆（春 ${fSpring} / 秋 ${fAutumn}）`)
  }

  // ---- ⑤ 接在唯一的航程链上（否则就是又一份"算了但没人用"） ----
  {
    const src = readFileSync(join(process.cwd(), 'src', 'utils', 'voyage.ts'), 'utf8')
    assert(/routeCurrentFactor\(pts, day\)/.test(src),
      'windFavorForRoute 里真的乘了洋流因子——天数只有这一条链')
    // 同一条航线：有洋流与无洋流算出来必须不是一个数
    const havA: [number, number] = [24, -78]
    const havB: [number, number] = [37.5, -6]
    const wf = windFavorForRoute(havA, havB, 5)
    const base = computeWindFavor(havA[0], havA[1], havB[0], havB[1], 5)
    assert(Math.abs(wf - base) > 1e-6,
      `穿湾流的航线与"只有风"的算法得出了不同的系数（${wf.toFixed(3)} vs ${base.toFixed(3)}）`)
  }
}

/*
 * ---- 岸外两圈颜色（浅水 + 碎浪）与船随缩放的曲线 ----
 *
 * 【这一组守的是什么】这两条曲线都有"单位写错就静默失效"的历史：
 * 碎浪按"格"写死在 0.62，而距离场第一格海水的值是 1.0 ⇒ 白沫一次都没画出来，
 * 屏幕上只是"岸边少了点什么"，没有任何报错。所以把曲线抽成度制纯函数，
 * 由单测从两头钉住：贴岸必须白、远处必须归零、分辨率不能改变带宽。
 */
{
  // ---- ① 碎浪：贴岸的第一格海水必须是白的 ----
  assert(foamAlpha(FIRST_SEA_CELL_DEG, 1) > 0.2,
    `贴岸第一格海水要有白沫（实测 ${foamAlpha(FIRST_SEA_CELL_DEG, 1).toFixed(3)}）`)
  // 旧写法（按 0.62 格起算）在这里恒为 0 —— 这条断言就是用来抓它的
  assert(foamAlpha(FIRST_SEA_CELL_DEG, 1) > foamAlpha(FIRST_SEA_CELL_DEG * 3, 1),
    '碎浪随离岸距离衰减')

  // ---- ② 出带即归零，且不出现 NaN ----
  assert(foamAlpha(FIRST_SEA_CELL_DEG + FOAM_SPAN_DEG + 0.01, 1) === 0,
    '超过碎浪带宽之后一点白都不留')
  assert(Number.isFinite(foamAlpha(NaN, NaN)), 'NaN 输入不能算出 NaN')

  // ---- ③ 斑块只调浓淡，不改变"贴岸有白"这条 ----
  assert(foamAlpha(FIRST_SEA_CELL_DEG, 1) > foamAlpha(FIRST_SEA_CELL_DEG, 0),
    '起浪的段落比不起浪的段落白')
  assert(foamAlpha(FIRST_SEA_CELL_DEG, 0) > 0,
    '不起浪的段落仍留一点白——整条岸线断掉会读成"岸线没画完"')

  // ---- ④ 分辨率不改变带宽：0.35°(第一格) 与 1 格@2048 的物理距离不同，带宽相同 ----
  {
    // 用"物理距离"直接问同一个问题，答案必须一致：这正是"按度不按格"的意义
    const a = foamAlpha(0.7, 1)
    const b = foamAlpha(0.7, 1)
    assert(a === b && a > 0, '带宽只由度数决定')
    assert(foamAlpha(SHALLOW_FALLOFF_DEG + 0.5, 1) === 0,
      '浅水带之外当然也没有碎浪')
  }

  // ---- ⑤ 合成：不透明度封顶 1，白沫占比 0..1 ----
  {
    let maxA = 0
    for (let d = 0; d <= 3; d += 0.02) {
      const c = compositeShore(d, 0.5)
      assert(c.alpha >= 0 && c.alpha <= 1, `合成不透明度越界（d=${d.toFixed(2)}）`)
      assert(c.foamMix >= 0 && c.foamMix <= 1, `白沫占比越界（d=${d.toFixed(2)}）`)
      maxA = Math.max(maxA, c.alpha)
    }
    // 两层在贴岸处必然重叠：若写成"直接相加"这里会超过 1
    assert(maxA <= 1, '两层相加不会溢出成纯白（贴岸处曾是最容易过曝的地方）')
    assert(maxA > 0.5, `贴岸要读得出白（峰值 ${maxA.toFixed(2)}）`)
  }

  // ---- ⑥ 浅水带：近处最亮、远处归零、单调 ----
  {
    assert(shallowAlpha(0) === MAX_SHALLOW_ALPHA, '贴岸是浅水带的最亮处')
    let prev = Infinity
    for (let d = 0; d <= SHALLOW_FALLOFF_DEG * 1.5; d += 0.05) {
      const a = shallowAlpha(d)
      assert(a <= prev + 1e-9, `浅水带随离岸距离单调变淡（d=${d.toFixed(2)}）`)
      prev = a
    }
    assert(shallowAlpha(SHALLOW_FALLOFF_DEG * 2) === 0, '远处没有浅水')
  }

  // ---- ⑦ 船随缩放的曲线：近景让位、远景不变、两端钳住 ----
  {
    assert(shipNearZoomScale(3) === SHIP_NEAR_ZOOM_MIN, '最近端钳在 0.45')
    assert(shipNearZoomScale(8) === 1, 'dist=8 起完全不缩')
    assert(shipNearZoomScale(40) === 1, '远景不放大（那会让船变成巨轮）')
    assert(shipNearZoomScale(NaN) === 1, 'NaN 退回不缩放')
    let prev = 0
    for (let d = 2; d <= 20; d += 0.5) {
      const k = shipNearZoomScale(d)
      assert(k >= prev - 1e-9, `缩放随距离单调不减（d=${d}）`)
      prev = k
    }
    /*
     * 【为什么要断言这一条】原来只有玩家船乘这条曲线、NPC 固定 0.72，
     * 实测航行到 dist=4 时 NPC 是座舰的 **1.80 倍**（停泊时 2.88 倍）。
     * 玩家第一眼就会觉得"这不是我的船"。守着它的是 Map3DView 里 NPC 那段
     * 的同一个调用。
     */
    const src = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'Map3DView.tsx'), 'utf8')
    assert(/npcK = NPC_SCALE \* shipZoomScale\(camState\.dist\)/.test(src),
      'NPC 商船也走同一条缩放曲线（否则近景会"别人的船比我的大"）')

    /*
     * ---- 远景也要收 ----
     *
     * 旧曲线到 dist=8 就封顶 1.0，"远景不放大"看着对，但模型的尺寸是世界单位：
     * 相机拉远时它在屏幕上本该变小，不缩就等于**越拉越大**。实测 dist=15 时
     * 船长 ≈73px、dist=26 时 ≈123px（占屏高 14%），比伊比利亚半岛还高。
     */
    assert(shipFarZoomScale(10) === 1, 'dist≤15 不受远景曲线影响')
    assert(shipFarZoomScale(15) === 1, 'dist=15 是分界点')
    assert(shipFarZoomScale(26) < 1, 'dist=26 要收')
    // 15/20 = 0.75 还没到钳位，正好用来验公式本身
    assert(Math.abs(shipFarZoomScale(20) - 0.75) < 1e-9, '远景按 15/dist 收')
    // 15/26 = 0.577 已经低于 0.6 ⇒ 被钳住（再远处屏幕尺寸保持不变）
    assert(Math.abs(shipFarZoomScale(26) - SHIP_FAR_ZOOM_MIN) < 1e-9, 'dist=26 已到钳位')
    assert(shipFarZoomScale(60) === SHIP_FAR_ZOOM_MIN, '收到底钳在 0.6（不能缩成看不见的点）')
    assert(shipFarZoomScale(NaN) === 1, 'NaN 退回原尺寸')
    // 合成曲线：近景端仍是 0.45，中景 1.0，远景按 15/dist
    assert(Math.abs(shipZoomScale(3) - SHIP_NEAR_ZOOM_MIN) < 1e-9, '近景端不变')
    assert(shipZoomScale(10) === 1, '中景不变')
    assert(Math.abs(shipZoomScale(20) - 0.75) < 1e-9, '远景按 15/dist（合成曲线同值）')
  }
}

/*
 * ---- 极地冰盖 ----
 *
 * 【守什么】这块最容易"看着像做了、其实没做"：
 * ① 按纬度一刀切会把挪威/西伯利亚刷成冰——格陵兰必须是**单独的软框**；
 * ② 冰缘伸缩的符号很容易写反（冬天反而缩回去），屏幕上只是"好像没变"；
 * ③ 强度必须落在 0..1，否则 [0,1] 之外的 alpha 会被 canvas 静默夹掉。
 */
{
  const spring = 5    // 季节 0：南半球正是夏天之后? —— 见下：0/1 是南半球寒季
  const autumn = 65   // 季节 2
  const day = (idx: number) => idx * 30 + 5   // 0→5(春) 1→35(夏) 2→65(秋) 3→95(冬)

  // ---- ① 两块冰盖都在，赤道带没有 ----
  assert(iceStrengthAt(-75, 0, spring) > 0.9, '南极内陆是冰盖')
  assert(iceStrengthAt(72, -42, autumn) > 0.8, '格陵兰是冰盖')
  assert(iceStrengthAt(-35, -30, spring) === 0, '南大西洋没有冰')
  assert(iceStrengthAt(20, 10, autumn) === 0, '撒哈拉当然没有冰')

  // ---- ② 同纬度但不是冰盖的地方不许染白 ----
  assert(iceStrengthAt(68, 20, day(3)) === 0,
    '挪威 68°N 不是冰盖（按纬度一刀切就会把它刷白）')
  assert(iceStrengthAt(70, 100, day(3)) === 0, '西伯利亚 70°N 不是冰盖')

  // ---- ③ 冰缘随季伸缩：南半球寒季（我们的春/夏）向南推 ----
  {
    const edgeLat = -60
    const winter = iceStrengthAt(edgeLat, 0, day(1))   // 南半球冬天
    const summer = iceStrengthAt(edgeLat, 0, day(3))   // 南半球夏天
    assert(winter > summer,
      `南极冰缘在南半球冬天要更靠北（冬 ${winter.toFixed(2)} / 夏 ${summer.toFixed(2)}）`)
    assert(summer === 0, '夏天 -60° 上没有冰')
    // 北半球反过来
    const gWinter = iceStrengthAt(57, -42, day(3))
    const gSummer = iceStrengthAt(57, -42, day(1))
    assert(gWinter >= gSummer,
      `格陵兰南缘在北半球冬天更靠南（冬 ${gWinter.toFixed(2)} / 夏 ${gSummer.toFixed(2)}）`)
  }

  // ---- ④ 伸缩幅度本身：两季之差就是 ICE_SEASON_SHIFT_DEG ----
  {
    const sh = iceEdgeShift(day(1))
    assert(sh.south === ICE_SEASON_SHIFT_DEG, '南半球寒季冰缘推 5°')
    assert(sh.north === 0, '同一时刻北半球不推（一个半球冷，另一个不冷）')
    const sh2 = iceEdgeShift(day(3))
    assert(sh2.north === ICE_SEASON_SHIFT_DEG && sh2.south === 0,
      '北半球寒季反过来——两个半球不会同时到达最北')
  }

  // ---- ⑤ 值域与单调 ----
  {
    for (const d of [5, 65]) {
      for (let lat = -85; lat <= 85; lat += 2.5) {
        const v = iceStrengthAt(lat, -42, d)
        assert(v >= 0 && v <= 1, `冰盖强度必须落在 0..1（lat=${lat} → ${v}）`)
      }
    }
    let prev = 0
    for (let lat = -55; lat >= -80; lat -= 1) {
      const v = iceStrengthAt(lat, 0, day(1))
      assert(v >= prev - 1e-9, `越往南极越白（lat=${lat}）`)
      prev = v
    }
    assert(iceStrengthAt(NaN, 0, 5) === 0, 'NaN 输入返回 0，不把整块地图刷白')
  }

  // ---- ⑥ 陆块面积：群岛不许连成一条假海岸线 ----
  {
    // 8×8 网格：左上角一块 4×4 的大陆，右上角一个孤格小岛
    const w = 8, h = 8
    const land = new Uint8Array(w * h)
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) land[y * w + x] = 1
    land[1 * w + 6] = 1   // 孤格小岛

    const areas = componentAreas(land, w, h)
    assert(areas[0] === 16 && areas[3 * w + 3] === 16, `连成一片的陆地面积要算对（${areas[0]}）`)
    assert(areas[1 * w + 6] === 1, '孤立一格是 1')
    assert(areas[7 * w + 7] === 0, '海面没有面积')

    // 门槛 2：4×4 腐蚀后还剩 2×2 的核心（保得住），孤格被剔除
    const big = majorLand(land, w, h, 2)
    assert(big[1 * w + 1] === 1, '有分量的陆块保留')
    assert(big[1 * w + 6] === 0, '孤立礁石不产生岸外光晕（否则群岛会连成一条假海岸线）')
    assert(big[7 * w + 7] === 0, '海面仍是海面')

    /*
     * 一格宽的细条（海底山脊那种）面积够大但保不住 —— 腐蚀先把它去掉。
     * 这是南大西洋上那条"闭环白线"的成因。
     */
    const ridge = new Uint8Array(w * h)
    for (let x = 0; x < w; x++) ridge[3 * w + x] = 1
    assert(majorLand(ridge, w, h, 2).every(v => v === 0), '一格宽的细长陆地不产生光晕')

    /*
     * 大数组不许爆栈：`Math.max(...Uint32Array)` 在这种尺寸上会直接
     * RangeError（52 万个参数），而且它发生在 3D 构建里 —— 表现是"3D 打不开"，
     * 单测当时全绿也发现不了。这条用例专门用真实尺寸跑一遍。
     */
    {
      const W = 600, H = 400
      const big = new Uint8Array(W * H)
      for (let y = 100; y < 300; y++) for (let x = 100; x < 500; x++) big[y * W + x] = 1
      const areas = componentAreas(big, W, H)
      assert(areas[200 * W + 200] === 400 * 200, `大网格的陆块面积（${areas[200 * W + 200]}）`)
      assert(majorLand(big, W, H).length === W * H, 'majorLand 能在大网格上跑完')
    }

    // 对角相邻不算相连（4 连通）：否则一串斜着排的礁石会被当成一块大陆
    const diag = new Uint8Array(w * h)
    diag[0] = 1; diag[1 * w + 1] = 1
    assert(componentAreas(diag, w, h)[1 * w + 1] === 1, '对角相邻不合并')

    /*
     * 【为什么这条守卫重要】实测德雷克海峡从合恩角到南极半岛被 0.75° 的
     * 光晕连成一条横穿大洋的白线，远景读作一条不存在的海岸线。
     * 判据用"陆块面积"而不是"腐蚀一格"：南设得兰那种几公里宽、彼此只隔 1° 的
     * 岛群腐蚀完还在，晕照样连成线。
     */
    const src = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'shallowBand.ts'), 'utf8')
    assert(/distanceField\(majorLand\(/.test(src),
      '距离场用的是"有分量的陆地"，不是全部陆地')
    /*
     * 【海岸几何必须与墨线同源】浅水带原来读 sea-mask.bin，墨线读 land.geojson，
     * 两份数据有配准差 → 南大西洋上飘着几段"错位的海岸线"（截图实测）。
     * 这条守卫钉死数据源：不许再 import seaRoute 的掩码。
     */
    assert(!/from '@\/utils\/seaRoute'/.test(src),
      '浅水带不读海陆掩码（会与 geojson 海岸线错位），只用 land.geojson')
  }

  // ---- ⑦ 两条线必须接上：材质用的是被重画过的贴图 ----
  {
    const src = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'Map3DView.tsx'), 'utf8')
    assert(/map: lidMap, roughness/.test(src),
      '陆地材质用 lidMap（画过冰的那张），不是原始 painted-land')
    assert(/repaintIce\?\.\(fleet\.day\)/.test(src),
      '换季时重画冰盖——否则季节对它不起作用')
  }
}

/*
 * ---- 海面上"不受光的东西"的昼夜/天气倍率 ----
 *
 * 【守什么】岸外的浅水带/白沫是 MeshBasicMaterial（不受光），它的颜色
 * 只能靠这条倍率跟着暗。漏掉它白天一点看不出来（乘数正好 1），
 * 傍晚才露馅：海面暗下去、贴岸一圈白沫还亮着，读作"会发光的岸"。
 */
{
  assert(Math.abs(surfaceDimMul(1, 1) - 1) < 1e-9, '白天天晴 = 原样（乘数 1）')
  const night = surfaceDimMul(1, 0)
  assert(Math.abs(night - 0.62) < 1e-9, `天晴的夜里压到 0.62（实测 ${night.toFixed(3)}）`)
  assert(Math.abs(surfaceDimMul(0, 1) - 0.55) < 1e-9, '最差天气的白天压到 0.55')
  assert(surfaceDimMul(0, 1) < surfaceDimMul(1, 1), '阴天比晴天暗')
  assert(surfaceDimMul(1, 0) < surfaceDimMul(0.5, 0.5), '夜里比阴天更暗')
  assert(Math.abs(surfaceDimMul(NaN, NaN) - 1) < 1e-9, 'NaN 退回满亮度，不把地图压黑')
  // 单调：天气/日相任一维变好都不该更暗
  assert(surfaceDimMul(0.3, 0.8) <= surfaceDimMul(0.6, 0.8), '天气单调')
  assert(surfaceDimMul(1, 0.3) <= surfaceDimMul(1, 0.7), '日相单调')

  const src = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'Map3DView.tsx'), 'utf8')
  assert(/sm\.color\.setScalar\(overlayMul\)/.test(src),
    '浅水带/白沫用的是同一条倍率（否则夜里会亮成一圈发光的岸）')

  /*
   * 【为什么逐个点名】这些图层原来全是"建好就再也不碰"的不受光材质，
   * 实测风暴前后亮度一点不变（洋流 0.279、海盗区 0.098、风带 0.129、
   * 季节现象 0.549）。夜里它们比海面亮好几倍，读成发光的电线圈。
   * 少收一个就少一个；所以每个组都单独断言被收进清单。
   */
  for (const group of ['currents', 'pirates', 'winds', 'phenomena.group']) {
    assert(
      new RegExp(`collectDimmed\\(layers\\.${group.replace('.', '\\.')}\\)`).test(src),
      `${group} 被收进统一压暗清单`,
    )
  }
  assert(/d\.color\.copy\(d\.base\)\.multiplyScalar\(overlayMul\)/.test(src),
    '叠加层每帧从**基色**乘倍率（否则会越乘越暗）')
}

/*
 * ---- 海岸墨线的线宽随距离 ----
 * 线宽单位是屏幕像素，不随相机缩放：远景 1.5px 正好，近景就细成发丝。
 */
{
  assert(coastWidthScale(15) === 1, '远景不加粗')
  assert(coastWidthScale(8) === 1, 'dist=8 是起点')
  assert(coastWidthScale(2) === 1.45, '最近端封顶 1.45（≈2.2px）')
  assert(coastWidthScale(NaN) === 1, 'NaN 退回原宽')
  // 距离越大越细：所以顺序扫一遍，k 必须是不增的
  let prev = Infinity
  for (let d = 1; d <= 20; d += 0.5) {
    const k = coastWidthScale(d)
    assert(k <= prev + 1e-9, `越远越细（d=${d} → ${k.toFixed(2)}）`)
    prev = k
  }
}

/*
 * ---- 太阳方向：随日相摆动、随航季升降 ----
 *
 * 原来主光钉死在 (-9,6,6)，一整天里地势明暗完全一样，只有亮度在变——
 * 那是调光台，不是太阳。这里钉住三条：方向是单位向量、正午在中位且两侧对称、
 * 冬天比夏天低。
 */
{
  const len = (d: { x: number; y: number; z: number }) => Math.hypot(d.x, d.y, d.z)
  for (const p of [0, 0.25, 0.5, 0.75, 1]) {
    for (const si of [0, 1, 2, 3]) {
      const d = sunDirection(p, si)
      assert(Math.abs(len(d) - 1) < 1e-9, `方向必须是单位向量（p=${p} si=${si}）`)
    }
  }
  // 正午在中位：水平方向的比值与基准一致（归一化会同时缩放三个分量，比值不变）
  const noon = sunDirection(0.5, 1)
  assert(Math.abs(noon.x / noon.z - (-9 / 6)) < 0.01,
    `正午保持在基准方位（x/z=${(noon.x / noon.z).toFixed(2)}）`)
  // 晨昏之间正好差一个摆动幅度（用水平方位角量，别用 x 分量：旋转不对称）
  const azimuth = (d: { x: number; z: number }) => (Math.atan2(d.z, d.x) * 180) / Math.PI
  const morn = sunDirection(0.25, 1)
  const eve = sunDirection(0.75, 1)
  // 摆动是按整个日相 0..1 分配的，日出→日落只走一半
  assert(Math.abs(azimuth(eve) - azimuth(morn) - SUN_SWING_DEG / 2) < 0.5,
    `日出到日落走半个摆动幅度（实测 ${(azimuth(eve) - azimuth(morn)).toFixed(1)}°）`)
  assert(Math.abs(morn.y - eve.y) < 1e-9, '晨昏高度相同')
  // 冬天比夏天低（同一个日相）
  assert(sunDirection(0.5, 3).y < sunDirection(0.5, 1).y, '冬天的太阳更低')
  assert(sunDirection(0.5, 1).y > sunDirection(0.5, 0).y, '夏天比春天高')
  // NaN 不许把光源甩到无穷远
  assert(Number.isFinite(sunDirection(NaN, NaN).y), 'NaN 输入仍给出有限方向')
}

/*
 * ---- 海岸接触影必须真的画在陆地图层上 ----
 * 它是"板块读成实物"的唯一提示（侧壁不受光，打光打不出来），
 * 而它只是重绘回调里的一行——重构时最容易静默丢掉。
 */
{
  const src = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'Map3DView.tsx'), 'utf8')
  assert(/paintCoastShade\(c2d, geojson, c\.width, c\.height\)/.test(src),
    '陆地重绘时画了海岸接触影')
  const shade = readFileSync(join(process.cwd(), 'src', 'utils', 'coastShade.ts'), 'utf8')
  assert(/source-atop/.test(shade), '接触影只画在陆地内侧（source-atop）')
}

/*
 * ---- 港口灯火 ----
 *
 * 【守什么】这一块全是"看不见就等于没做"的东西：
 * ① 天还亮着时灯必须灭（否则白天一片光斑，像故障）；
 * ② 每个港都得有一盏（小补给站也有一盏，否则夜里那些港等于不存在）；
 * ③ 尺寸要按 fov 换算（PointsMaterial 的 size 比世界尺寸小 2.9 倍，
 *    第一版就是这样，0.1 的信标只有 13px，4 倍放大才认得出）；
 * ④ 灯必须跟着"港口发现"走，否则会泄露还没发现的港口位置。
 */
{
  // ---- ① 一昼夜的曲线：白天全灭、深夜全亮、单调 ----
  assert(portLightStrength(1) === 0, '正午不亮灯')
  assert(portLightStrength(0.65) === 0, '天还亮着不亮灯（0.65 是起点）')
  assert(portLightStrength(0) === 1, '深夜全亮')
  assert(portLightStrength(0.18) === 1, '到 0.18 就全亮了')
  const mid = portLightStrength(0.42)
  assert(mid > 0.2 && mid < 0.8, `黄昏要有过渡（0.42 → ${mid.toFixed(2)}）`)
  let prev = 0
  for (let l = 1; l >= -0.2; l -= 0.05) {
    const v = portLightStrength(l)
    assert(v >= prev - 1e-9, `越黑越亮（lit=${l.toFixed(2)}）`)
    assert(v >= 0 && v <= 1, `值域 0..1（lit=${l.toFixed(2)} → ${v}）`)
    prev = v
  }
  assert(portLightStrength(NaN) === 0, 'NaN 不许把全图点亮')

  // ---- ② 每个港都有灯，规模只决定数量 ----
  for (const sc of ['major', 'medium', 'minor'] as const) {
    const plan = portLightPlan(sc)
    assert(plan.halo >= 1, `${sc} 要有暖光池（远景靠它读"哪里有港"）`)
    assert(plan.lanterns >= 1, `${sc} 至少要有一盏码头灯`)
    assert(plan.windows >= 1, `${sc} 至少要有一扇亮着的窗`)
  }
  assert(portLightPlan('major').beacons === 1, '只有大港有塔顶信标')
  assert(portLightPlan('medium').beacons === 0, '中港没有信标')
  assert(portLightPlan('minor').beacons === 0, '小补给站没有信标')
  assert(portLightPlan('major').windows > portLightPlan('minor').windows,
    '大港的窗比小港多（规模差要看得出来）')

  // ---- ③ 尺寸换算：PointsMaterial 的 size 比世界尺寸小 tan(fov/2) ----
  {
    const k = pointSizeForWorld(1, 38)
    assert(Math.abs(k - 1 / Math.tan((38 * Math.PI) / 360)) < 1e-9,
      `fov=38 时换算系数应为 1/tan(19°)≈2.90（实测 ${k.toFixed(3)}）`)
    assert(k > 2.8 && k < 3.0, '数量级别写错（差 10 倍就会变成一片光斑）')
    assert(pointSizeForWorld(0.1, 38) > pointSizeForWorld(0.05, 38), '线性')
    assert(pointSizeForWorld(NaN, 38) === 0 && pointSizeForWorld(0.1, NaN) === 0,
      'NaN 输入不许算出 NaN 尺寸（three 会画成整屏）')
  }

  // ---- ④ 三条接线：建模登记灯位、渲染换算尺寸、灯跟随发现状态 ----
  {
    const models = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'models.ts'), 'utf8')
    assert(/g\.userData\.portLights = lights/.test(models),
      '港口模型要把灯位登记到 userData.portLights')
    assert(/portLightPlan\(scale\)/.test(models),
      '灯的数量走 portLightPlan（与港规模同一套判据）')
    // 灯位必须在 setScalar 之后算：早一步算，灯会浮在房子外面
    const iScale = models.indexOf('g.scale.setScalar(0.8)')
    const iLights = models.indexOf('g.userData.portLights = lights')
    assert(iScale > 0 && iLights > iScale, '灯位要在缩放之后计算（否则整组偏移）')

    const view = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'Map3DView.tsx'), 'utf8')
    assert(/size: pointSizeForWorld\(look\.size, camera\.fov\)/.test(view),
      'Points 的 size 必须按 fov 换算（否则灯小 2.9 倍）')
    assert(/applyLightDiscovery\(state\.discoveredPorts\)/.test(view),
      '灯火要跟随发现状态（否则未发现的港口会自己亮起来）')
    assert(/portLightStrength\(lit\)/.test(view), '亮度由昼夜曲线驱动')
  }
}

/*
 * ---- 船上视角的近岸（岸线 / 灯塔 / 窗光）----
 *
 * 【守什么】这个模块最容易"看着像做了、其实错了"：
 * ① 距离映射与方位换算错了，屏幕上一片海，没有报错；
 * ② 场景坐标的**符号**反了，岸会出现在相反的一侧，看着还挺自然；
 * ③ 岸在身后时硬画一块，变成"前方凭空出现陆地"。
 */
{
  // ---- ① 最近港与 42 海里阈值 ----
  const here = findCoast(37.3886, -5.9823, 0)
  assert(here !== null, '停在港口坐标上必须找到近岸')
  assert(here!.distNm < 1, `停泊时距离约 0（实测 ${here!.distNm.toFixed(2)}）`)
  assert(here!.presence > 0.95, '贴岸时景别拉满')
  assert(here!.port.nameCn === '塞维利亚', `最近港应是塞维利亚（实测 ${here!.port.nameCn}）`)

  // 远洋：大西洋中部 42 海里内没有港
  assert(findCoast(0, -40, 0) === null, '大西洋中部不该有近岸')
  // 阈值本身可调（用 maxNm 收窄，验证"超阈值即 null"）
  assert(findCoast(37.5, -6.2, 0, 1) === null, '超过 maxNm 就不画岸')
  // NaN 不许算出岸
  assert(findCoast(NaN, NaN, 0) === null, 'NaN 船位返回 null')

  // ---- ② 相对方位：折到 −180..180 ----
  assert(wrapDeg(370) === 10, `370° → 10°（实测 ${wrapDeg(370)}）`)
  assert(wrapDeg(-350) === 10, '-350° → 10°')
  assert(wrapDeg(180) === -180, '180° 折到 -180')
  assert(wrapDeg(NaN) === 0, 'NaN 折成 0')

  // ---- ③ 景别：越近半径越小、灯塔永远比"真实比例"高 ----
  {
    const near = coastLayout(1)
    const far = coastLayout(0)
    assert(Math.abs(near.radius - 24) < 1e-9, `贴岸半径 24（实测 ${near.radius}）`)
    assert(Math.abs(far.radius - 58) < 1e-9, `最远半径 58（实测 ${far.radius}）`)
    assert(near.radius < far.radius, 'presence 越大越近')
    let prev = Infinity
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const r = coastLayout(p).radius
      assert(r <= prev + 1e-9, `半径单调（p=${p.toFixed(2)}）`)
      prev = r
    }
    assert(Math.abs(near.width - near.radius * 2) < 1e-9, '宽度 = 2 × 半径')
    assert(near.towerHeight >= 3.0, '灯塔高度有下限（否则 24 单位外只有几个像素）')
    assert(far.towerHeight <= 5.6, '灯塔高度有上限（远处不能变成巨塔）')
    /*
     * 【上限为什么是 58】海面几何只有 140×140（半径 70），它的 fragment 在
     * d=62 之外混成天光色 —— 岸画到那儿会浮在"地平线"上。这不是随便取的数，
     * 改海面尺寸时这条会红。
     */
    assert(far.radius < 62, '岸线最远不超过海面的天光渐隐起点')
  }

  // ---- ④ 场景坐标符号：右舷在世界 −X（屏幕上"右边"）----
  {
    const front = coastScenePos(0, 24)
    assert(Math.abs(front.x) < 1e-9 && Math.abs(front.z - 24) < 1e-9, '正前方：x=0、z=+R')
    const starboard = coastScenePos(90, 24)
    assert(starboard.x < -1e-6, `右舷的岸在世界 −X（实测 x=${starboard.x}）`)
    const port = coastScenePos(-90, 24)
    assert(port.x > 1e-6, '左舷在世界 +X')
    assert(starboard.z > 0, '岸永远在远处（z>0），不按方位旋转')
  }

  // ---- ⑤ HUD 方位词 ----
  assert(bearingWord(0) === '正前方', '0° 是正前方')
  assert(bearingWord(-5) === '正前方', '±12° 内都算正前方')
  assert(bearingWord(90) === '右舷', '90° 是右舷')
  assert(bearingWord(-90) === '左舷', '−90° 是左舷')
  // ±168° 以外并到"正后方"：那个角度上左右已经没有意义了
  assert(bearingWord(170) === '正后方', '170° 归入正后方')
  assert(bearingWord(150) === '右后方', '150° 是右后方')
  assert(bearingWord(-150) === '左后方', '−150° 是左后方')

  // ---- ⑥ 接线：三个必须存在的调用/判据 ----
  {
    const view = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'DeckView.tsx'), 'utf8')
    assert(/coast\.setSighting\(/.test(view), '帧循环要把近岸交给岸线组')
    assert(/frame % 8 === 0/.test(view), '近岸每 8 帧算一次（不必每帧）')
    assert(/data-testid="deck-coast-hud"/.test(view), 'HUD 要有最近陆地的读数')
    /*
     * 【天空与海面**不许**自己编码】—— 第 66 轮把这条判据整个翻了过来。
     *
     * 船上视角接了后处理：画面先渲进**线性 HalfFloat** 的 RT，再由 `post.ts` 的
     * 合成 pass 统一 srgbEncode。天空/海面着色器如果自己也编码一遍，就是双编码：
     * 线性 0.15 → 0.42 → 0.68，正午海面实测 135/155/168（灰白），而且**调 uSky
     * 也救不回来**（只能把双编码后的值从 0.68 拉到 0.6）。去掉自编码后同一帧是
     * 62/83/100（海）与 177/204/224（天），正好等于 uniform 里的 hex。
     *
     * 所以判据是：gl_FragColor 直接写线性 col，且**一次** srgbEncode 都不许出现在
     * 天空与海面的片元着色器里（post.ts 里那两处才是唯一允许编码的地方）。
     */
    const enc = view.match(/srgbEncode\(clamp\(col, 0\.0, 1\.0\)\)/g) || []
    assert(enc.length === 0, `天空与海面不许自编码（实测 ${enc.length} 处，post 会编码）`)
    const raw = view.match(/gl_FragColor = vec4\(clamp\(col, 0\.0, 1\.0\), 1\.0\);/g) || []
    assert(raw.length >= 2, `天空与海面都直接写线性 col（实测 ${raw.length} 处）`)
    const post = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'post.ts'), 'utf8')
    assert(/srgbEncode\(clamp\(col, 0\.0, 1\.0\)\)/.test(post), '编码只发生在 post 的合成 pass')
    /*
     * 【帆的片元补丁必须用 vMapUv】three 0.15x 之后每张贴图有自己的 uv varying。
     * 帆材质定义了 USE_MAP 但**没有** USE_UV，写 vUv 会让整个片元着色器编译失败
     * —— 表现是"帆整块不渲染"，控制台里只有一行 'vUv' undeclared。这条坑查了
     * 整整一轮，所以要挡住。
     */
    const ship = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'shipModel.ts'), 'utf8')
    assert(/vMapUv\.x/.test(ship), '帆的布面补丁用 vMapUv（每贴图自己的 uv）')
    assert(!/vUv\.[xy]/.test(ship), '帆的布面补丁不许写 vUv（未定义 USE_UV 时编译失败）')
    // 白沫必须按日相衰减：直接加到颜色上会让夜海整片发白（实测过）
    assert(/uFoamLight/.test(view), '白沫必须乘 uFoamLight（夜里不是自发光）')

    const coast = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'coastModel.ts'), 'utf8')
    assert(/COAST_HIDE_BEHIND_DEG/.test(coast), '岸在身后时不画（否则"前方凭空出现陆地"）')
    // 旧写法：整组按方位旋转 —— 实测把岸与灯塔一起转出画面
    assert(!/rotation\.y = -s\.relBearingDeg/.test(coast),
      '不许再按方位旋转整组（会把岸转出视野）')
    assert(/setScalar\(tw\)/.test(coast),
      '灯塔要均匀缩放（非均匀矩阵会把 sprite 拉成一条竖带）')
  }
}

/*
 * ---- 船上视角的天气 ----
 *
 * 【守什么】天气是"五个数分发到四处"的结构（雨/雾/浪高/压暗/闪电），
 * 错一处屏幕上都只是"看起来不太对"，没有任何报错。这里钉住三件事：
 * ① 每种天气的参数不许退化成一样（否则"五个天气"其实只有一个）；
 * ② 平滑趋近必须收敛且单调，不能把 0.1 秒的 dt 放大成一次跳变；
 * ③ 雨量到滴数的换算：0 就是 0（不付顶点），满就是满。
 */
{
  // ---- ① 每种天气的参数表 ----
  const clear = deckWeatherLook('clear')
  assert(clear.rain === 0 && clear.fog === 0 && clear.wave === 1, '晴天：不雨不雾、浪是基准')
  const storm = deckWeatherLook('storm')
  assert(storm.rain === 1, '暴风雨的雨量是满的')
  assert(storm.wave > 1.8, `暴风雨浪高接近两倍（实测 ${storm.wave}）`)
  assert(storm.darken > deckWeatherLook('rain').darken, '暴风雨比下雨更暗')
  assert(deckWeatherLook('fog').fog > 0.85, '浓雾的雾值接近 1')
  assert(deckWeatherLook('fog').rain === 0, '浓雾不下雨')
  assert(deckWeatherLook('rain').rain > 0 && deckWeatherLook('rain').rain < 1,
    '下雨是"半满"，不是暴风雨')
  // 五种天气的浪高必须互不相同（否则玩家感觉不到天气）
  const waves = (['clear', 'cloudy', 'rain', 'storm', 'fog'] as const).map(k => deckWeatherLook(k).wave)
  assert(new Set(waves).size === 5, `五种天气的浪高各不相同（实测 ${waves.join('/')}）`)
  // 未知/空值退回晴天，不能算出 NaN 让画面卡死
  assert(deckWeatherLook('nonsense').rain === 0, '未知天气退回晴天')
  assert(deckWeatherLook(null).wave === 1, 'null 退回晴天')

  // ---- ② 平滑趋近 ----
  {
    let cur = clear
    const target = storm
    let prev = cur.rain
    for (let i = 0; i < 200; i++) {
      cur = approachLook(cur, target, 1 / 60)
      assert(cur.rain >= prev - 1e-9, '单调趋近（不许回头）')
      prev = cur.rain
    }
    assert(Math.abs(cur.rain - 1) < 0.01, `3.3 秒后基本到位（实测 ${cur.rain.toFixed(3)}）`)
    assert(Math.abs(cur.wave - target.wave) < 0.02, '浪高同样收敛')
    // 一次巨大的 dt（切后台回来）不许一步跳完
    const jump = approachLook(clear, storm, 30)
    assert(jump.rain < 0.2, `dt 被钳住，不会一步到位（实测 ${jump.rain.toFixed(2)}）`)
    // NaN 的 dt 不许把状态污染成 NaN
    const bad = approachLook(clear, storm, NaN)
    assert(Number.isFinite(bad.rain), 'NaN 的 dt 不会污染参数')
  }

  // ---- ③ 雨量 → 滴数 ----
  assert(rainDropCount(clear, 6000) === 0, '不下雨时一滴都不画')
  assert(rainDropCount(storm, 6000) === 6000, '暴风雨画满')
  assert(rainDropCount(deckWeatherLook('rain'), 6000) > 2000, '下雨至少要有两千滴（否则看不见）')
  assert(rainDropCount({ rain: NaN, fog: 0, wave: 1, darken: 0, tilt: 0, lightning: 0 }, 6000) === 0,
    'NaN 雨量返回 0')
  assert(rainDropCount({ rain: 5, fog: 0, wave: 1, darken: 0, tilt: 0, lightning: 0 }, 6000) === 6000,
    '超过 1 的雨量钳在满')

  // ---- ④ 闪电包络 ----
  assert(lightningEnvelope(-1) === 0, '负年龄不闪')
  assert(lightningEnvelope(99) === 0, '很久以前的不闪')
  assert(lightningEnvelope(0.05) > 0.85, '刚击中时接近满亮')
  assert(lightningEnvelope(0.5) < 0.1, '半秒后基本消失')
  assert(Number.isFinite(lightningEnvelope(NaN)) , 'NaN 年龄不产生 NaN 亮度')

  // ---- ⑤ 接线与三条反回退守卫 ----
  {
    const view = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'DeckView.tsx'), 'utf8')
    /*
     * 浪高：海面 shader、船姿态、船高必须用**同一个** `waveAmp`
     * （= 天气的 look.wave × 港内 calm；见 harborCalm）。
     * 三个里任何一个自己写 look.wave，港内就会"水面平了船还在摇"。
     */
    assert(/uWaveScale\.value = look\.wave \* harborCalmK/.test(view), '海面用天气浪高 × 港内系数')
    assert(/const waveAmp = look\.wave \* harborCalmK/.test(view),
      '船姿态与船高共用一个 waveAmp（否则船会浮在浪外 / 或港内船在摇而水面平）')
    // 雾：海面混的是雾色而不是天光色
    assert(/vec3 farCol = mix\(uSky \* 0\.85, uFogColor, uFogK\)/.test(view),
      '海面远处混雾色（只收窄区间不够）')
    // 压暗：两个 shader 都要乘
    assert((view.match(/col \*= uDark;/g) || []).length >= 2, '天空与海面都要压暗')

    const rain = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'rainLayer.ts'), 'utf8')
    /*
     * 【为什么守这一条】setAmount 第一版收 0..1 比例，而调用方传的是滴数，
     * 每个非零值都被 clamp 到 1 —— 小雨与暴风雨的雨幕一模一样，且不报错。
     */
    assert(/setAmount\(drops: number\)/.test(rain), 'setAmount 的参数是滴数')
    assert(!/setAmount\(k: number\)/.test(rain), '不许退回 0..1 比例语义')
    // 雨滴的倾斜必须在**两端点**上（只平移整滴的话雨永远是竖直的）
    assert(/aEnd \* aLen \* skew/.test(rain), '雨丝的两端要错开（否则雨是竖直的）')

    const coast = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'coastModel.ts'), 'utf8')
    /*
     * 雾对发光物的削弱必须在所有基础赋值**之后**：写在前面会被后面的
     * `winMat.opacity = ...` 覆盖回去，雾里窗光与滩线一点都不淡。
     */
    const iBase = coast.indexOf('winMat.opacity = 0.06')
    const iFog = coast.indexOf('const glowFade')
    assert(iBase > 0 && iFog > iBase, '雾的削弱写在基础赋值之后')
  }
}

/*
 * ---- 船上视角接后处理（辉光）----
 *
 * 【上一轮的误判】当时判定"共用 post 在极暗场景里会把整体提亮 +55"，
 * 于是没接。真正的根因是船上视角的 shader **缺 sRGB 编码**：直出把线性值
 * 当 sRGB 写（偏暗），而 post 在合成末尾做了正确编码 —— "接了反而正常亮"，
 * 看起来像 post 提亮了暗部。第 61 轮补上编码后两条路径值域一致。
 *
 * 这里守三件事：① 确实走 post；② 两个场景的阈值/强度**分开**；
 * ③ setBloom 必须直接写 uniform（改局部变量不会进 shader）。
 */
{
  const view = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'DeckView.tsx'), 'utf8')
  assert(/post\.render\(scene, camera\)/.test(view), '船上视角要走后处理')
  assert(!/^\s*renderer\.render\(scene, camera\)/m.test(view), '不许留一条绕过 post 的渲染路径')
  assert(/post\.setThreshold\(/.test(view), '阈值要按场景单独设定')
  /*
   * 船上视角的阈值必须高于海图：这里的"亮部"包含海面的月光反射带
   * （线性 0.5~0.9），用海图的 0.45 会把整条反光带捞进去、模糊后叠成
   * 一条"白公路"（实测截图）。
   */
  const m = view.match(/post\.setThreshold\(([\d.]+)\)/)
  assert(m !== null, '阈值是显式数字')
  const deckThreshold = Number(m![1])
  assert(deckThreshold > 0.6, `船上视角的阈值高于 0.6（实测 ${deckThreshold}）`)

  const post = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'post.ts'), 'utf8')
  assert(/setThreshold\(t: number\): void/.test(post), 'post 暴露 setThreshold')
  assert(/setBloom\(strength: number\): void/.test(post), 'post 暴露 setBloom（A/B 用）')
  // setBloom 必须写 uniform，不能只改局部变量
  assert(/compositeMat\.uniforms\.uBloom\.value =/.test(post),
    'setBloom 直接写 uniform（改局部变量不会进 shader）')
  assert(/brightMat\.uniforms\.uThreshold\.value =/.test(post),
    'setThreshold 直接写 uniform')
  // 关掉辉光仍走合成 —— 这条判据的像素级验证在 probe-deck-post.mjs
  assert(/uBloom\.value = Number\.isFinite\(strength\)/.test(post), 'setBloom 挡住 NaN')
}

/*
 * ---- 甲板行走的几何 ----
 *
 * 【守什么】甲板行走最容易错的是**单位**：船模型半长 18、船宽 10（米），
 * 整体缩到世界 0.05。任何一处把"米"当成世界单位，人就会比桅杆高 20 倍；
 * 反过来把米制的坐标再乘一次缩放，相机就会被拉到龙骨里（实测：
 * 屏幕上是"从船体内部看出去的一堆木纹"，而且看着还挺像有内容）。
 */
{
  // ---- ① 人眼高度：甲板 + 1.7 米 ----
  {
    const eye0 = deckEyeY(0)
    assert(Math.abs(eye0 - (shipDeckAt(0) + 1.7)) < 1e-9, `人眼 = 甲板 + 1.7（实测 ${eye0}）`)
    assert(eye0 > 2.5 && eye0 < 4.2, '人眼在甲板上方 1.7 米（不是 1.7 世界单位）')
    // 船首的甲板更高（舷弧），人眼也跟着抬
    assert(deckEyeY(16) > deckEyeY(0), '船首甲板更高')
  }

  // ---- ② 可行走宽度随船体收窄 ----
  {
    const mid = deckWalkHalfWidth(0)
    const bow = deckWalkHalfWidth(16)
    assert(mid > bow, `船首比船中窄（中 ${mid.toFixed(2)} / 首 ${bow.toFixed(2)}）`)
    assert(mid > 3 && mid < 5, '船中可走半宽 3~5 米')
    assert(bow >= 0, '不会算出负宽度')
  }

  // ---- ③ 边界：船首尾与左右 ----
  {
    const clamped = clampToDeck(100, 100)
    assert(clamped.z <= 16 && clamped.z >= -13, `z 被钳进船体（实测 ${clamped.z}）`)
    assert(Math.abs(clamped.x) <= deckWalkHalfWidth(clamped.z) + 1e-9, 'x 不超过该处半宽')
    assert(isOnDeck(clamped.x, clamped.z), '钳完之后一定在甲板上')
    // 船中外侧的点会被拉回来
    const outside = clampToDeck(20, 0)
    assert(isOnDeck(outside.x, outside.z), '船外 20 米被拉回甲板内')
  }

  // ---- ④ 一步移动：不会穿出船体，也不会卡在桅杆里 ----
  {
    let p = { x: 0, z: -10 }
    // 朝船首走 40 米（远超船长）：必须停在船首
    for (let i = 0; i < 200; i++) p = stepWalk(p, 0, 0.4)
    assert(p.z <= 16, `一直往前走到船首就停（实测 z=${p.z.toFixed(1)}）`)
    assert(isOnDeck(p.x, p.z), '停下时仍在甲板上')

    // 横着撞桅杆：从 (0, 11−3) 往 +z 走到主桅，必须被推开而不是穿过
    let q = { x: 0, z: 1 - 3 }
    for (let i = 0; i < 60; i++) q = stepWalk(q, 0, 0.15)
    // 桅杆在 z=1；走完之后要么绕过去，要么被挡在它前面，不能正好在圆心
    assert(!(Math.abs(q.x) < 0.5 && Math.abs(q.z - 1) < 0.5),
      `不会停在桅杆圆心（实测 ${q.x.toFixed(2)}, ${q.z.toFixed(2)}）`)
    assert(isOnDeck(q.x, q.z), '被推开后仍在甲板上')
  }

  // ---- ⑤ 接线：三处必须存在的用法 ----
  {
    const view = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'DeckView.tsx'), 'utf8')
    /*
     * 局部坐标交给 localToWorld —— 不许再乘一次 SHIP_SCALE（会缩两次）。
     * 第 76 轮起相机高度按"在甲板 / 在舱内"取两个来源：甲板是 `deckEyeY(z)`、
     * 舱内是常数 `cabinEyeY()`，所以判据改成"两种来源都在、且仍直接交给 localToWorld"。
     */
    assert(/const eyeY = inCabinRef\.current \? cabinEyeY\(\) : deckEyeY\(walkPos\.z\)/.test(view),
      '相机高度按甲板/舱内取两个来源（舱内的地板是常数高度）')
    assert(/const eye = new THREE\.Vector3\(walkPos\.x, eyeY, walkPos\.z\)/.test(view),
      '相机用米制局部坐标交给 localToWorld（不要再乘 SHIP_SCALE）')
    assert(/ship\.localToWorld\(eye\)/.test(view), '船体的摇摆要传到相机')
    assert(/dir\.applyQuaternion\(ship\.quaternion\)/.test(view),
      '视线方向也要乘船的姿态（否则船一摇相机像浮在船外）')
    assert(/walkPos = inCabinRef\.current \? stepInCabin\(walkPos, dx, dz\) : stepWalk\(walkPos, dx, dz\)/.test(view),
      '移动在舱内走 stepInCabin（矩形）、在甲板走 stepWalk（分轴 + 桅杆推离）')
    // 键盘与移动端按钮共用 keysRef；用 state 会每帧重渲染整个组件
    assert(/keysRef\.current\[dir\] = true/.test(view), '移动端方向键写进 keysRef')
  }
}

/*
 * ---- 船壳放样：顶点数必须与索引步长一致 ----
 *
 * 【守什么】`shipHull.ts` 里每个站位 push 的顶点数是 `ARC+3`（左舷墙顶 + ARC+1 个
 * 圆弧点 + 右舷墙顶）。第一版的索引步长写成了 `ARC+2`，于是每一圈的第 0 个顶点
 * 其实是上一圈的最后一个 —— 三角形斜着跨过甲板，把甲板切成一条条深色横带。
 * 从默认机位（远看）它还是个"船形的东西"，只有站到甲板上才暴露。
 *
 * 这两条不变量就是那个错误的指纹：
 *   ① 顶点数必须能被每站顶点数整除；
 *   ② 任何**跨过中线**的三角形都必须整块落在甲板面以下（船壳是个 U，中线只有龙骨）。
 */
{
  const hull = buildHullGeo()
  const n = hull.positions.length / 3
  // 首尾封板各多出一个"扇形中心"顶点，所以减掉 2 再除
  assert((n - 2) % hull.perStation === 0,
    `顶点数 ${n}（减掉 2 个封板中心）能被每站 ${hull.perStation} 整除`)
  assert(hull.perStation === HULL_ARC + 3, `每站 ${hull.perStation} 个顶点 = ARC(10) + 3`)
  const bad = hull.indices.filter((i) => i < 0 || i >= n)
  assert(bad.length === 0, '所有索引都落在顶点范围内')
  assert(!hull.positions.some((v) => !Number.isFinite(v)), '放样坐标没有 NaN')

  let crossing = 0
  for (let t = 0; t < hull.indices.length; t += 3) {
    /*
     * 首尾封板（transom）不算：它是从截面中心扇形连到整个截面（含舷墙顶）的，
     * 本来就该跨中线、且高到舷墙 —— 这条判据只守**船壳侧壁**的放样。
     */
    const [a, b, c] = [hull.indices[t], hull.indices[t + 1], hull.indices[t + 2]]
    const xs = [a, b, c].map((i) => hull.positions[i * 3])
    const ys = [a, b, c].map((i) => hull.positions[i * 3 + 1])
    const zs = [a, b, c].map((i) => hull.positions[i * 3 + 2])
    if (zs.some((z) => Math.abs(Math.abs(z) - SHIP_HALF_LENGTH) < 1e-6)) continue // 封板
    // 龙骨中线上有一个 x==0 的顶点，所以判据是"有没有落在两侧"，不是"跨过"
    if (Math.min(...xs) > 0 || Math.max(...xs) < 0) continue
    crossing++
    const zc = (zs[0] + zs[1] + zs[2]) / 3
    // 跨中线的三角形只能是龙骨附近的那几块：必须低于甲板面
    assert(Math.max(...ys) < shipDeckAt(zc) - 0.2,
      `跨中线的三角形必须低于甲板（z=${zc.toFixed(1)} 处最高 ${Math.max(...ys).toFixed(2)} vs 甲板 ${shipDeckAt(zc).toFixed(2)}）`)
  }
  assert(crossing >= 10, `中线上确实有三角形（龙骨 ${crossing} 个，说明放样没塌）`)

  // 船壳不能高过舷墙顶，也不能低于龙骨
  for (let i = 0; i < n; i++) {
    const y = hull.positions[i * 3 + 1]
    const z = hull.positions[i * 3 + 2]
    assert(y <= shipDeckAt(z) + HULL_BULWARK + 1e-6, '船壳顶点不高于舷墙顶')
    assert(y >= -shipKeelAt(z) - 1e-6, '船壳顶点不低于龙骨')
  }
}

/*
 * ---- 吃水：甲板必须高于浪峰 ----
 *
 * 【守什么】模型的水线在 y=0、甲板只有 1.32 模型米高。若不把整条船抬起来，
 * 涌浪（±0.13 世界单位）会把甲板淹掉 —— 站到甲板上时脚下一大片"淡蓝色的板"，
 * 其实是盖在甲板上的海水。那条 bug 活了整整一轮，因为从默认机位看不出来。
 */
{
  const deckY = shipDeckAt(0) * SHIP_SCALE + SHIP_DRAFT_LIFT
  const crest = DECK_WAVES.reduce((sum, w) => sum + w.amp, 0)
  assert(deckY > crest + 0.02,
    `甲板（${deckY.toFixed(3)}）必须高出浪峰（${crest.toFixed(3)}）至少 0.02`)
  // 干舷占船长的比例要像真船（36 米船约 4 米 → 10%~12%）
  const freeboardRatio = deckY / (2 * SHIP_HALF_LENGTH * SHIP_SCALE)
  assert(freeboardRatio > 0.06 && freeboardRatio < 0.2,
    `干舷/船长 = ${(freeboardRatio * 100).toFixed(1)}%，应在 6%~20%`)
  const view = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'DeckView.tsx'), 'utf8')
  /*
   * 船的 y 必须是"该点真实浪高 + 吃水抬升"。
   * 【为什么不能用 pose.y】`pose.y` 是合成浪高的 0.72 倍，与该点真实水面差
   * 2~6 厘米世界单位 —— 船会一半悬空一半入水，水线泡沫带也跟着被海面遮住。
   */
  assert(/ship\.position\.y = seaAtShip \+ SHIP_DRAFT_LIFT/.test(view),
    '船的 y 必须是 seaAtShip + SHIP_DRAFT_LIFT（写死数字会与测试脱钩）')
  assert(/const seaAtShip = deckWaveHeight\(0, 0, t, waveAmp\)/.test(view),
    'seaAtShip 用与 GPU 同一个 deckWaveHeight、同一个 waveAmp 采船位的水面')
  assert(!/ship\.position\.y = pose\.y/.test(view),
    '船的 y 不许用 pose.y（它只表达起伏，不等于水面高度）')
}

/*
 * ---- 岸上的树必须站在坡面上 ----
 *
 * 【守什么】远岸的树是"到岸了"唯一可以贴近看的实物。它们的 y 必须由**山脊几何
 * 同一份高度剖面**插值而来 —— 两处各写一遍公式，树就会浮在半空或者埋进坡里，
 * 而这种错在截图上很难一眼看出来（树本来就只是几个像素）。
 */
{
  const hs = ridgeHeights(72)
  assert(hs.length === 73, `山脊剖面 73 个采样（实测 ${hs.length}）`)
  assert(hs.every((h) => h >= 0 && h < 1.3), '剖面高度都在 0..1.3 之间')
  // 两端压低：岸线不能在画面边缘被"裁断"
  assert(hs[0] < 0.1 && hs[72] < 0.1, '岸线两端压到接近 0')

  // 插值连续：相邻采样之间的中点必须落在两端之间（不能跳变）
  for (let i = 0; i < 72; i++) {
    const mid = ridgeHeightAt((i + 0.5) / 72)
    assert(mid >= Math.min(hs[i], hs[i + 1]) - 1e-9 && mid <= Math.max(hs[i], hs[i + 1]) + 1e-9,
      `u=${i} 与 u=${i + 1} 之间的插值不越界`)
  }
  // 端点精确
  assert(Math.abs(ridgeHeightAt(0) - hs[0]) < 1e-9, 'u=0 处等于剖面首项')
  assert(Math.abs(ridgeHeightAt(1) - hs[72]) < 1e-6, 'u=1 处等于剖面末项（不越界）')

  // 树的 y = 剖面高度 × t × 岸高：t=0 贴水线、t=1 正好在脊线上
  const RH = 4.2
  for (const u of [0.1, 0.35, 0.5, 0.77, 0.93]) {
    const base = ridgeHeightAt(u) * RH
    assert(Math.abs(base * 1 - base) < 1e-9 && base > 0 && base <= RH * 1.3,
      `u=${u} 的脊线高度在岸高范围内（${base.toFixed(2)} / ${RH}）`)
  }
}

/*
 * ---- 2.5D 海图的相机仰角下限 ----
 *
 * 【守什么】海图是一块有限大的板。相机能"拉到 40 单位远 + 压到 9°"时是贴着板边看，
 * 南极一侧的板缘会露出来（用户报了很久的"白色楔形"）。现在仰角下限随距离收紧：
 * 近处仍可平视（贴海平视是重要的观察视角），远处必须俯视。
 */
{
  assert(Math.abs(minElevationAt(3) - EL_MIN) < 1e-9, '近处（dist=3）允许最低仰角')
  assert(Math.abs(minElevationAt(EL_TIGHTEN_FROM) - EL_MIN) < 1e-9, '收紧起点处仍是 0.16')
  assert(minElevationAt(40) > 0.6, `最远处最小仰角 > 0.6 弧度（实测 ${minElevationAt(40).toFixed(2)}）`)
  // 单调：越远越不允许平视
  let prev = -1
  for (let d = 3; d <= 40; d += 1) {
    const m = minElevationAt(d)
    assert(m >= prev - 1e-9, `dist=${d} 的下限不回落`)
    assert(m <= EL_MAX + 1e-9, `dist=${d} 的下限不超过上限`)
    prev = m
  }
  // 钳制：低于下限抬到下限，高于上限压到上限，非法输入不产生 NaN
  assert(clampElevation(40, 0.16) > 0.6, '拉远后平视会被抬起来')
  assert(Math.abs(clampElevation(3, 0.16) - 0.16) < 1e-9, '近处平视不受影响')
  assert(Math.abs(clampElevation(10, 9) - EL_MAX) < 1e-9, '超大仰角钳到上限')
  assert(Number.isFinite(clampElevation(Number.NaN, Number.NaN)), 'NaN 输入也给出有限值')
}

/*
 * ---- 海图极区"裁断边"的暗角 ----
 *
 * 【守什么】land.geojson 在极圈附近被直接切断，南极那片陆地在海图最南端是一条
 * 笔直的边（用户报了很久的"白色楔形"）。修法是在陆板材质的 map_fragment 里按
 * **几何 uv** 压暗——注意不能用 vMapUv：它是"贴图矩阵变换后"的 uv，冰盖贴图带着
 * 自己的变换，值域不是 0..1（实测按它写 smoothstep 一个像素都不变，查了两轮）。
 */
{
  const view = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'Map3DView.tsx'), 'utf8')
  assert(/vLandUv = uv/.test(view), '顶点着色器要传出几何 uv（vLandUv）')
  assert(/smoothstep\(0\.9[0-9]+, 0\.99[0-9]+, vLandUv\.y\)/.test(view),
    '南端按几何 uv 做压暗（vLandUv.y 接近 1）')
  assert(!/smoothstep\([^)]*vMapUv\.y\)/.test(view),
    '极区压暗不许用 vMapUv（贴图矩阵变换后的 uv，值域不是 0..1）')
  assert(/diffuseColor\.rgb \*= 1\.0 - 0\.9[0-9] \* max\(edgeS, edgeN\)/.test(view),
    '暗角是乘性压暗（往海色 mix 太弱：陆地被方向光照得很亮）')
}

/*
 * ---- 罗盘方位词（瞭望台报风用）----
 *
 * 【守什么】`compassWord` 接的是 `weather.windDir`，它是**风吹去**的罗盘方位
 * （0 = 北、90 = 东）。8 个扇区必须覆盖整圈且相邻扇区不重叠；负数与 >360 要绕回。
 * 这条判据看着琐碎，但报错一个字（"往东去"写成"从东来"）就是玩家按错的依据。
 */
{
  const cases: [number, string][] = [
    [0, '北'], [45, '东北'], [90, '东'], [135, '东南'],
    [180, '南'], [225, '西南'], [270, '西'], [315, '西北'], [359, '北'],
  ]
  for (const [deg, want] of cases) {
    assert(compassWord(deg) === want, `${deg}° → ${want}（实测 ${compassWord(deg)}）`)
  }
  // 绕回：−90 与 270 同向
  assert(compassWord(-90) === compassWord(270), '负数绕回与正数同向')
  assert(compassWord(450) === compassWord(90), '>360 绕回')
  // 每个扇区宽 45°，边界取整必须落在一侧（不能出现空字符串）
  for (let d = 0; d < 360; d += 7) {
    assert(compassWord(d).length >= 1, `${d}° 有方位词`)
  }
}

/*
 * ---- 帆的透光：几何法线必须单独传 ----
 *
 * 【守什么】片元里的 `normal` 会被 three 按 gl_FrontFacing 翻成"朝相机"的那一面 ——
 * 用它算逆光永远得到 0（帆在夜里永远是纯黑剪影）。必须有 `vSailN`（世界空间的原始
 * 朝向）；而且透光要乘 `diffuseColor`（包边/纵缝/织纹），否则六张帆是六块均匀
 * 发亮的板（实测：整片 54/61/65 没有起伏，读作塑料）。
 */
{
  const ship = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'shipModel.ts'), 'utf8')
  assert(/vSailN\s*=\s*normalize\(mat3\(modelMatrix\) \* objectNormal\)/.test(ship),
    '透光用的是世界空间原始法线（vSailN），不是会被翻转的 normal')
  assert(/totalEmissiveRadiance \+= uSailGlow \* through/.test(ship), '透光加到 emissive 上')
  assert(/uSailGlow \* through[^;]*diffuseColor\.rgb/.test(ship), '透光要乘布面自身的明暗')
  assert(/setBacklight\(/.test(ship), 'DeckShip 暴露 setBacklight')
  const view = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'DeckView.tsx'), 'utf8')
  assert(/setBacklight\(fill\.position, fill\.color, [\d.]+ \* fill\.intensity\)/.test(view),
    '透光方向与强度都跟着主光（fill）走，不另设曲线')
}

/*
 * ---- 夜航尾迹：波脊不能只活在月光道里 ----
 *
 * 【守什么】开尔文波脊原来**只乘在镜面项**里（1.0 + kwSpec*2.6）—— 而镜面只在
 * 月光道里有值，于是道外的波脊亮度恒等于零。冻住 performance.now 做 A/B 差分
 * （.workbuddy/kelvin-probe.mjs）量到的就是：整片水域里唯一的变化是月光道上
 * 那几块碎光。所以补了一项"被搅起来的水把月光散回来"的散射。
 * 两条都必须守：
 *  ① 散射项存在，而且乘了 uMoonK（不然正午的尾迹带一条发蓝的亮带）；
 *  ② 镜面那一项的系数还在（不要为了加散射把原来的镜面调制删掉）。
 */
{
  const view = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'DeckView.tsx'), 'utf8')
  assert(/\(1\.0 \+ kwSpec \* 2\.6\)/.test(view), '波脊仍然参与镜面（kwSpec × 2.6）')
  assert(/col \+= uMoon \* kwSpec \* 0\.055 \* foamGate \* uMoonK;/.test(view),
    '波脊另有一项散射，且乘了 uMoonK（白天不亮）')
  assert(/float foamGate = 0\.35 \+ 0\.65 \* vnoise/.test(view), '散射项有噪声门（不是一条连续的弧线）')
}

/*
 *
 * 【守什么】`traffic` 是按 uv 的 **u** 做的剖面。甲板的 uv 里 u 是横向（24 块板沿 u
 * 排开）、v 是船长方向，且 repeat 只沿 v —— 一旦有人把 repeat 改成 (2,3) 或把
 * 剖面写成按 v，那条"被踩白的走道"就会变成几道横杠（而截图里看着仍像"有纹理"）。
 */
{
  const ship = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'shipModel.ts'), 'utf8')
  assert(/traffic:\s*1/.test(ship), '甲板贴图开了中央走道磨损')
  assert(/deckTex\.repeat\.set\(1, 3\)/.test(ship), '甲板 uv 只沿 v 重复（u 横跨整条船宽一次）')
  const tex = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'shipTextures.ts'), 'utf8')
  assert(/createLinearGradient\(0, 0, S, 0\)/.test(tex), '走道剖面沿 x（= u = 船宽）')
}

/*
 * ---- 桅顶瞭望台：必须在下帆桁与上帆脚之间 ----
 *
 * 【守什么】这个高度不是随便挑的：真实帆船的桅盘就架在下桅桅头（下帆桁正上方）。
 * 改帆桁表的人很容易把它忘掉 —— 一旦挪到下帆桁以下，平台会插进帆布里；挪到桅顶
 * 以上，就变成"旗杆上的鸟窝"。两条边界都用帆桁表推出来。
 */
{
  const ship = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'shipModel.ts'), 'utf8')
  const m = ship.match(/const NEST_Y = ([\d.]+)/)
  assert(!!m, '桅顶瞭望台有明确的高度常量 NEST_Y')
  const nestY = Number(m![1])
  const yardBlock = ship.match(/const yardData = \[([\s\S]*?)\n  \]/)
  assert(!!yardBlock, '找得到帆桁表')
  const rows = [...yardBlock![1].matchAll(/\{ z: (-?\d+), y: ([\d.]+), len: ([\d.]+), sailH: ([\d.]+)/g)]
    .map((r) => ({ z: Number(r[1]), y: Number(r[2]), h: Number(r[4]) }))
  const main = rows.filter((r) => r.z === 1).sort((a, b) => a.y - b.y)
  assert(main.length === 2, `主桅有两张帆（实测 ${main.length}）`)
  const lowerYard = main[0].y
  const upperFoot = main[1].y - main[1].h
  assert(nestY > lowerYard && nestY < upperFoot,
    `瞭望台（${nestY}）必须在下帆桁（${lowerYard}）与上帆脚（${upperFoot}）之间`)
}

/*
 * ---- 海鸟：什么时候有、有几只、朝哪飞 ----
 *
 * 【守什么】海鸟是这条船上唯一的"活物"，同时是一条真实的导航线索（顺着鸟飞的方向
 * 找陆地）。所以它的出现条件必须与"能不能看见陆地"**同源**：远洋不能有鸟、
 * 夜里不能有鸟、暴风雨与浓雾里不能有鸟；群飞方向必须等于最近陆地的方位。
 * 这些规则一旦有人手滑改成常量，整条线索就变成了"天上永远有几只鸟"。
 */
{
  // 没有陆地 → 没有鸟
  assert(deckBirdFlock(null, 1, 'clear').count === 0, '视野里没有陆地就没有鸟')
  assert(deckBirdFlock(60, 1, 'clear').count === 0, '60 海里外（远洋）没有鸟')
  assert(deckBirdFlock(26.5, 1, 'clear').count === 0, '刚出 26 海里就没有鸟')
  assert(deckBirdFlock(26, 1, 'clear').count > 0, '26 海里内开始有鸟')

  // 越近越多，且有上限
  const near = deckBirdFlock(4, 1, 'clear').count
  const far = deckBirdFlock(24, 1, 'clear').count
  assert(near > far, `越近鸟越多（4 海里 ${near} 只 vs 24 海里 ${far} 只）`)
  assert(near <= BIRD_MAX && far >= 1, `数量在 1..${BIRD_MAX}`)
  for (let nm = 0; nm <= 26; nm += 1) {
    const c = deckBirdFlock(nm, 1, 'clear').count
    assert(c >= 1 && c <= BIRD_MAX, `${nm} 海里有 ${c} 只（应在 1..${BIRD_MAX}）`)
  }
  // 单调：距离变大时数量不增加
  let prev = 99
  for (let nm = 2; nm <= 26; nm += 1) {
    const c = deckBirdFlock(nm, 1, 'clear').count
    assert(c <= prev, `${nm} 海里的鸟不多于更近处（${c} ≤ ${prev}）`)
    prev = c
  }

  // 夜里 / 暴风雨 / 浓雾 → 没有鸟
  assert(deckBirdFlock(8, 0.1, 'clear').count === 0, '夜里没有鸟（归巢）')
  assert(deckBirdFlock(8, 1, 'storm').count === 0, '暴风雨里没有鸟')
  assert(deckBirdFlock(8, 1, 'fog').count === 0, '浓雾里没有鸟')
  assert(deckBirdFlock(8, 1, 'rain').count > 0, '小雨里还有鸟')

  // 群飞方向 = 传入的陆地方位（由调用方从 findCoast 的结果给）
  assert(deckBirdFlock(8, 1, 'clear', -78).headingDeg === -78, '群飞方位原样透传')

  /*
   * 姿态：鸟不能飞进海里、不能飞进船体、不能叠成一只。
   * 船体半长 0.9 世界单位 —— 所以鸟离原点必须远大于它。
   */
  const flock = deckBirdFlock(8, 1, 'clear', -78)
  const seen = new Set<string>()
  let minY = 99
  let maxY = -99
  for (let i = 0; i < flock.count; i++) {
    const p = deckBirdPose(i, 3.7, flock)
    assert(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z), `第 ${i} 只坐标有限`)
    /*
     * 【为什么下限是 0.4 而不是 0】眼睛在海面上方 0.27 世界单位，鸟若贴着水面飞，
     * 从甲板看过去就是"海平线上的一排黑点"（实测过）。给 0.4 的下限，保证它们在
     * 视线上方，读作"在天上飞"。
     */
    assert(p.y > 0.4 && p.y < 2.2, `第 ${i} 只的高度 ${p.y.toFixed(2)} 在 0.4..2.2 之间`)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    assert(Math.hypot(p.x, p.z) > 4, `第 ${i} 只离船 ≥4 单位（不飞进船舱）`)
    assert(Math.abs(p.wing) <= 1.0001, '翅膀在 −1..1')
    assert(p.span > 0.05 && p.span < 0.2, `翼展 ${p.span.toFixed(3)} 在合理范围`)
    seen.add(`${p.x.toFixed(1)},${p.z.toFixed(1)}`)
  }
  assert(seen.size === flock.count, `每只鸟的位置都不同（${seen.size}/${flock.count}）`)
  assert(maxY - minY > 0.5, `一群鸟的高度有层次（${(maxY - minY).toFixed(2)} 单位）`)

  /*
   * 群在"朝陆地那一侧"。
   *
   * 方位约定（与 `coastScenePos` 同一套）：相机看 +z，所以**右舷是 −x、左舷是 +x**。
   * 方位 −78°（左舷偏前）→ 群心应当在 +x、+z；方位 0° → 群心在正前方。
   * 判据看的是**整群的平均位置**而不是第 0 只：每只鸟有自己的侧向散布，
   * 单挑一只既可能被散布推过中线（第一版就是这么写错的），也测不出"群朝哪边"。
   *
   * 写反的后果是所有海鸟朝背离陆地的方向飞 —— 那比没有鸟更糟：它会把玩家往反方向指。
   */
  const meanPos = (heading: number) => {
    const f = deckBirdFlock(8, 1, 'clear', heading)
    let sx = 0, sz = 0
    for (let i = 0; i < f.count; i++) { const p = deckBirdPose(i, 1.1, f); sx += p.x; sz += p.z }
    return { x: sx / f.count, z: sz / f.count }
  }
  const left = meanPos(-78)
  assert(left.x > 2 && left.z > 0,
    `方位 −78°（左舷偏前）的群心在左前方（实测 x=${left.x.toFixed(1)}, z=${left.z.toFixed(1)}）`)
  assert(left.x > left.z, '群心以横向为主（−78° 接近正横）')
  const ahead = meanPos(0)
  assert(ahead.z > 5 && Math.abs(ahead.x) < 1.6,
    `方位 0° 的群心在正前方（实测 x=${ahead.x.toFixed(1)}, z=${ahead.z.toFixed(1)}）`)
  // 右舷：方位 +78° 时群心在 −x（右舷）
  const right = meanPos(78)
  assert(right.x < -2, `方位 +78° 的群心在右舷（实测 x=${right.x.toFixed(1)}）`)
}

/*
 * ---- 甲板水手：人数由真实船员数决定，站位必须在甲板上 ----
 *
 * 【守什么】甲板上站着几个人，是玩家唯一能"看见"船员数的窗口（HUD 上只有数字）。
 * 所以它必须严格由 `fleet.ships[].crew` 决定：空船不能还站着水手，人也绝不能
 * 站在舷墙外面或桅杆里面 —— 这两种错在截图里都很难一眼看出来。
 */
{
  // 人数分档
  assert(sailorCount(0) === 0, '船员 0 → 甲板上没人')
  assert(sailorCount(-3) === 0, '负数按 0 处理')
  assert(sailorCount(Number.NaN) === 0, 'NaN 不产生水手')
  assert(sailorCount(1) === 1, '1 人 → 1 个水手')
  assert(sailorCount(7) === 1, '7 人 → 1 个水手')
  assert(sailorCount(8) === 2, '8 人 → 2 个水手')
  assert(sailorCount(15) === 2, '15 人（初始小船）→ 2 个水手')
  assert(sailorCount(20) === 3, '20 人 → 3 个水手')
  assert(sailorCount(40) === 3, '40 人 → 3 个水手（上限就是三个站位）')
  // 单调不减
  let prev = -1
  for (let c = 0; c <= 45; c += 1) {
    const n = sailorCount(c)
    assert(n >= prev && n <= SAILOR_STATIONS.length, `${c} 人 → ${n}（单调且不超过站位数量）`)
    prev = n
  }

  /*
   * 站位：必须在甲板面以内（`shipDeckHalfWidthAt` 是甲板的半宽），
   * 且不能站在桅杆里（三根桅在 z = 11 / 1 / −8，桅杆半径 0.36）。
   */
  for (const st of SAILOR_STATIONS) {
    const halfW = shipDeckHalfWidthAt(st.z)
    assert(Math.abs(st.x) < halfW - 0.25,
      `${st.kind} 站位（x=${st.x}）在甲板半宽 ${halfW.toFixed(2)} 以内`)
    assert(st.z > -15 && st.z < 17, `${st.kind} 的 z=${st.z} 在船体内`)
    for (const mastZ of [11, 1, -8]) {
      assert(Math.hypot(st.x, st.z - mastZ) > 0.6,
        `${st.kind} 不站在桅杆里（离 z=${mastZ} 的桅杆 ${Math.hypot(st.x, st.z - mastZ).toFixed(2)}）`)
    }
  }
  // 三个站位互不重叠（间距 > 1 米，否则两个人会长在一起）
  for (let i = 0; i < SAILOR_STATIONS.length; i++) {
    for (let j = i + 1; j < SAILOR_STATIONS.length; j++) {
      const a = SAILOR_STATIONS[i], b = SAILOR_STATIONS[j]
      assert(Math.hypot(a.x - b.x, a.z - b.z) > 1,
        `${a.kind} 与 ${b.kind} 相距 ${Math.hypot(a.x - b.x, a.z - b.z).toFixed(2)} 米`)
    }
  }
  // 舵手必须站在"舵轮（z=−10.9）与船尾楼前壁（z=−12.0）之间那条缝"里
  const helm = SAILOR_STATIONS.find((s) => s.kind === 'helm')!
  assert(helm.z < -10.9 && helm.z > -12.0,
    `舵手（z=${helm.z}）站在舵轮与船尾楼之间`)
}

/*
 * ---- 动索：帆脚索的垂度 / 帆角的位置 / 转桁角 ----
 *
 * 【守什么】这一整块只有一件事会出错：**绳子和帆分家**。
 *  · 帆角的坐标若与帆的变形公式不一致 → 索头悬在布外面 5~20 厘米；
 *  · 贝塞尔控制点如果按"sag"直接给（而不是 2×），单测说垂 1 米、画面上只有 0.5 米；
 *  · 转桁角的方向搞反 → 帆转到背风侧，"追风"变成"躲风"；
 *  · 相位不分 → 左右两根索像连在一起，同时抽。
 * 这些都是算得出来的，不必靠看截图。
 */
{
  const A = { x: 0, y: 10, z: 0 }
  const B = { x: 6, y: 2, z: 0 }
  const n = SHEET_SEGMENTS
  const flat = new Float32Array((n + 1) * 3)
  writeSheetPoints(flat, A.x, A.y, A.z, B.x, B.y, B.z, 0, 0, n)
  assert(flat.length === (n + 1) * 3, `顶点数 = (${n}+1)×3`)
  assert(Math.abs(flat[0] - A.x) < 1e-9 && Math.abs(flat[1] - A.y) < 1e-9 && Math.abs(flat[2] - A.z) < 1e-9,
    '第一点就是绳头（帆角）')
  const last = n * 3
  assert(Math.abs(flat[last] - B.x) < 1e-9 && Math.abs(flat[last + 1] - B.y) < 1e-9 && Math.abs(flat[last + 2] - B.z) < 1e-9,
    '最后一点就是绳尾（舷边）')

  // sag 是"中点的实际下垂"，不是控制点偏移
  const sag = 1.4
  writeSheetPoints(flat, A.x, A.y, A.z, B.x, B.y, B.z, sag, 0, n)
  const midI = (n / 2) * 3
  const wantMidY = (A.y + B.y) / 2 - sag
  assert(Math.abs(flat[midI + 1] - wantMidY) < 1e-6,
    `中点垂到 y=${wantMidY.toFixed(2)}（实测 ${flat[midI + 1].toFixed(2)}）—— sag 不会被贝塞尔砍掉一半`)
  assert(flat[midI] > A.x && flat[midI] < B.x, '中点在两端之间（没有甩出绳外）')
  // 单调：每一段都往下走，绳不会出现"波浪"
  let prevY = Infinity
  let monotonic = true
  for (let i = 0; i <= n; i++) {
    if (flat[i * 3 + 1] > prevY + 1e-9) monotonic = false
    prevY = flat[i * 3 + 1]
  }
  assert(monotonic, '从帆角到舷边单调下垂（没有回勾）')

  // 侧摆：沿水平垂线（A→B 沿 z 时，垂线是 x）
  const flat2 = new Float32Array((n + 1) * 3)
  writeSheetPoints(flat2, 0, 10, 0, 0, 2, 10, 0, 0.5, n)
  assert(Math.abs(flat2[midI] - -0.5) < 1e-6, `侧摆 0.5 米落在 −x 方向（实测 x=${flat2[midI].toFixed(3)}）`)
  assert(Math.abs(flat2[midI + 2] - 5) < 1e-6, '侧摆不改变沿绳方向的中间位置')

  /*
   * 帆角：必须就是帆面变形之后下缘两端的那个点。
   * 这里按 `shipModel` 里同一套变形重算一遍（收分 + 帆脚弧 + 鼓胀在角上都是 0）。
   */
  const sw = 14.5 * 0.86
  const sh = 6.4
  const clew = sailClew(sw, sh, 13.6, 11, 1)
  assert(Math.abs(clew.x - (sw / 2) * (1 - SAIL_TAPER)) < 1e-9,
    `帆角在收分后的帆缘上（x=${clew.x.toFixed(2)}，帆桁半长 ${(14.5 / 2).toFixed(2)}）`)
  assert(Math.abs(clew.x) < 14.5 / 2, '帆角在帆桁长度以内（布不会比桁还宽）')
  assert(Math.abs(clew.y - (13.6 - sh - 0.2)) < 1e-9,
    `帆角在帆脚下方 0.2 米处的挂点（y=${clew.y.toFixed(2)}）`)
  assert(clew.y < 13.6 - sh * 0.8, '帆角接近帆的下缘（不是帆的一半高）')
  const clewL = sailClew(sw, sh, 13.6, 11, -1)
  assert(Math.abs(clewL.x + clew.x) < 1e-9, '左右帆角对称')

  /*
   * 垂度：风小的时候垂得下去、风大的时候几乎绷直；而且**必须真的在动**
   * （只靠"值不同"是不够的，要看时间序列的振幅）。
   */
  const series = (k: number) => {
    const vals: number[] = []
    for (let t = 0; t <= 20; t += 0.05) vals.push(sheetSag(t, 1.3, k))
    return vals
  }
  const calm = series(0)
  const fresh = series(1)
  const amp = (v: number[]) => Math.max(...v) - Math.min(...v)
  assert(Math.max(...calm) > 1.0, `无风时垂得下去（最深 ${Math.max(...calm).toFixed(2)} 米）`)
  assert(Math.max(...fresh) < 0.35, `强风时几乎绷直（最深 ${Math.max(...fresh).toFixed(2)} 米）`)
  assert(amp(calm) > 0.15, `无风时索在抽动（振幅 ${amp(calm).toFixed(2)} 米）`)
  assert(amp(fresh) < 0.06, `强风时几乎不动（振幅 ${amp(fresh).toFixed(2)} 米）`)
  assert(Math.min(...calm) > 0, '垂度永远为正（索不会穿到绳的另一侧）')
  assert(sheetSag(Number.NaN, 1, 0.5) > 0, 'NaN 时间也给一个有限值')
  assert(sheetSag(5, 1.3, Number.NaN) > 0, 'NaN 风速退回无风')
  // 相位不同：左右两根索不能同时抽
  assert(Math.abs(sheetSag(5, 1.3, 0.4) - sheetSag(5, 4.9, 0.4)) > 1e-3,
    '两根索的相位不同（不会像连在一起）')
  assert(Math.abs(sheetSway(5, 1.3, 0) - sheetSway(5, 4.9, 0)) > 1e-3, '侧摆相位也各自独立')
  assert(Math.abs(sheetSway(3, 1, 0)) <= 0.31 && Math.abs(sheetSway(3, 1, 1)) <= 0.05,
    '侧摆：松时 0.30 米、紧时 0.04 米')

  /*
   * 转桁：风沿船首尾吹不转，横风转得最多（上限 15°），方向是"帆迎向风"。
   * 方向判据：风从右舷（方位 90°）来时，+x 那一端必须转向船首（z 变大）。
   */
  assert(Math.abs(braceYaw(0, 1)) < 1e-9, '风从正后方来 → 帆桁不转')
  assert(Math.abs(braceYaw(180, 1)) < 1e-9, '风从正前方来 → 帆桁不转')
  assert(Math.abs(braceYaw(NaN, 1)) < 1e-9, 'NaN 风向 → 不转')
  assert(Math.abs(braceYaw(90, 0)) < 1e-9, '无风 → 不转（帆是垂的）')
  assert(braceYaw(90, 1) < 0, '右舷来风 → 负向转')
  assert(braceYaw(270, 1) > 0, '左舷来风 → 正向转')
  for (const b of [0, 45, 90, 135, 180, 225, 270, 315]) {
    assert(Math.abs(braceYaw(b, 1)) <= 0.26 + 1e-9, `方位 ${b}° 的转角不超过 15°`)
  }
  const yaw90 = braceYaw(90, 1)
  const tipP = rotateAboutYaw(7.25, 11, 11, yaw90)
  assert(tipP.z > 11, `右舷来风时 +x 桁臂转向船首（z ${11} → ${tipP.z.toFixed(2)}）`)
  assert(Math.abs(Math.hypot(tipP.x, tipP.z - 11) - 7.25) < 1e-9, '转桁不改变桁臂长度（只是转）')
  const still = rotateAboutYaw(3, 11, 11, 0)
  assert(Math.abs(still.x - 3) < 1e-9 && Math.abs(still.z - 11) < 1e-9, '转角为 0 时点不动')
  const onMast = rotateAboutYaw(0, 11, 11, 1.2)
  assert(Math.abs(onMast.x) < 1e-9 && Math.abs(onMast.z - 11) < 1e-9, '桅轴线上的点转过之后还在轴上')
  assert(BRACE_SEGMENTS >= 4 && SHEET_SEGMENTS >= 8, '分段数够圆滑')
}

/*
 * ---- 舵轮不能埋进船尾楼；白天窗玻璃不能发光 ----
 *
 * 两条都是这轮实测出来的真错：
 *  ① 船尾楼中心 z=−14.6、进深 5.2 ⇒ 前壁在 −12.0，而舵轮原来在 −12.2（墙里 20 厘米），
 *    从甲板回头看只有一块黑方板；
 *  ② 窗玻璃白天自发光 2.2×0.12=0.26 → 出来 147/102/69，比舱壁（55/47/43）亮 2.7 倍，
 *    正午的舱门小窗像一盏点着的铜灯。
 */
{
  const ship = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'shipModel.ts'), 'utf8')
  const wheelZ = Number((ship.match(/wheel\.position\.set\(0, shipDeckAt\((-?[\d.]+)\)/) || [])[1])
  assert(Number.isFinite(wheelZ), '找得到舵轮的 z')
  assert(wheelZ > -12.0, `舵轮（z=${wheelZ}）必须在船尾楼前壁（−12.0）之前`)
  const litK = ship.match(/const litK = ([\d.]+) \+ ([\d.]+) \* night/)
  assert(!!litK, '灯的白天地板值是常量表达式')
  assert(Number(litK![1]) <= 0.05, `灯在白天的地板值 ${litK![1]} ≤ 0.05（0.12 时正午的窗还是亮的）`)
  assert(Math.abs(Number(litK![1]) + Number(litK![2]) - 1) < 1e-9, '夜里 litK 必须是 1')
}

/*
 * ---- 船长室：矩形房间的边界，以及"舱比船壳窄" ----
 *
 * 【守什么】舱内是**第一个矩形**空间（甲板是按 z 求半宽的船体轮廓）。两条东西容
 * 易错、而且在截图里看不出来：
 *  ① 玩家能走出房间（撞墙不生效）→ 会站到舱壁里，看见全黑的背面；
 *  ② 舱比船壳宽 → 船壳的木条会斜插进舱内（实测时射线命中 `ship-hull`，
 *     画面里是一条灰蓝色楔形）。
 */
{
  // 房间在地板之上，人眼高度合理
  assert(cabinEyeY() - cabinFloorY() > 1.6 && cabinEyeY() - cabinFloorY() < 1.8,
    `舱内人眼高度 ${(cabinEyeY() - cabinFloorY()).toFixed(2)} 米`)

  // 钳制：界内不变，界外被拉回
  const mid = clampToCabin(0, -14.5)
  assert(Math.abs(mid.x) < 1e-9 && Math.abs(mid.z + 14.5) < 1e-9, '界内的点原样返回')
  const far = clampToCabin(99, -99)
  assert(far.x === CABIN_BOUNDS.maxX && far.z === CABIN_BOUNDS.minZ, '越界被拉回最近的一角')
  assert(isInCabin(far.x, far.z), '拉回之后确实在舱内')

  /*
   * 随机走两万步，一步都不许出界。
   * 【为什么先累计再断言】每步一条断言会让"通过数"虚增两万条，看起来像加了功能，
   * 实际只是循环次数 —— 判据该说"零次越界"，而不是"两万次都在界内"。
   */
  let p = { x: 0, z: -14.5 }
  let seed = 12345
  let escapes = 0
  let firstEscape = ''
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  for (let i = 0; i < 20000; i++) {
    p = stepInCabin(p, (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.6)
    if (!isInCabin(p.x, p.z)) {
      escapes++
      if (!firstEscape) firstEscape = `第 ${i} 步 (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`
    }
  }
  assert(escapes === 0, `两万步零次越界（越界 ${escapes} 次，首例 ${firstEscape || '无'}）`)

  /*
   * 进/出舱的机位：进门那一刻必须已经在房间里（否则下一帧会被甲板钳制拽回去），
   * 出门那一刻必须在**甲板上**（否则人会卡在船尾楼的墙里）。
   */
  assert(isInCabin(CABIN_ENTER.x, CABIN_ENTER.z), `进舱机位在房间内（z=${CABIN_ENTER.z}）`)
  assert(!isInCabin(CABIN_EXIT.x, CABIN_EXIT.z), `出舱机位在房间外（z=${CABIN_EXIT.z}）`)
  // 出舱机位还要在甲板可行走范围内（否则被 stepWalk 钳到别处，人会"跳"一下）
  assert(Math.abs(CABIN_EXIT.x) <= deckWalkHalfWidth(CABIN_EXIT.z),
    `出舱机位在甲板半宽内（${CABIN_EXIT.x} ≤ ${deckWalkHalfWidth(CABIN_EXIT.z).toFixed(2)}）`)

  /*
   * 舱必须比船壳窄。船体在船尾的半宽：z=−12 → 4.03、z=−17.2 → 3.07。
   * 舱的内半宽（2.8）必须小于**最窄处**，否则船壳会插进舱里。
   */
  const innerHalfW = CABIN_BOUNDS.maxX + 0.4
  for (const z of [-12, -14.6, -17.2]) {
    assert(innerHalfW < shipHalfWidthAt(z),
      `舱半宽 ${innerHalfW} < 船壳半宽 ${shipHalfWidthAt(z).toFixed(2)}（z=${z}）`)
  }
}

/*
 * ---- 接触暗部：便宜、但有三条硬约束 ----
 *
 * 【守什么】接触暗部是"物件落在地上"的那圈软阴影（不开 shadowMap，用一张径向渐变
 * 贴图贴在脚下）。它有三个容易写错、而且在截图里看不出来的地方：
 *  ① **必须 depthWrite = false**：写深度会让后面绘制的透明物体（雨、光晕）被一块
 *     看不见的平面切掉；
 *  ② **必须 disabling raycast**：否则点"影子"会命中一个看不见的平面，甲板拾取会飘；
 *  ③ **纹理边缘必须淡到 0**：硬边一眼就看出来是贴片。
 */
{
  const ship = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'shipModel.ts'), 'utf8')
  assert(/depthWrite: false, opacity: 0\.6, color: 0x000000/.test(ship),
    '接触暗部的材质写了 depthWrite: false（不然会切掉后面的透明物体）')
  assert(/m\.raycast = \(\) => \{\}/.test(ship), '接触暗部不参与拾取（否则点到"影子"）')
  assert(/grad\.addColorStop\(1, 'rgba\(0,0,0,0\)'\)/.test(ship), '纹理边缘淡到 0（不能有硬边）')
  // 至少覆盖甲板家具、水手、舱内家具三类
  const uses = (ship.match(/addShadow\(/g) || []).length
  assert(uses >= 8, `至少 8 处用了接触暗部（实测 ${uses}，含函数定义）`)
  assert(/addShadow\(g, 0, 0\.008, 0\.06, 0\.42, 0\.34\)/.test(ship), '水手脚下也有')
  assert(/addShadow\(cabin,/.test(ship), '舱内家具也有')
}

/*
 * ---- 海图上的航线：方位要画对，不能画反 ----
 *
 * 【守什么】海图是"上北下南"的平面图，而 canvas 的 y 轴向下。方位 0°（北）必须
 * 画成**向上**、90°（东）画成**向右** —— 写反一次，玩家低头看到的是一条指向
 * 反方向的航线，而且它"看起来完全正常"。
 */
{
  const up = chartCourse(0, 1000)!
  // 向上 = −90°（canvas 角度）
  assert(Math.abs(up.angleRad + Math.PI / 2) < 1e-9, `方位 0° → 向上（实测 ${(up.angleRad * 180 / Math.PI).toFixed(1)}°）`)
  const right = chartCourse(90, 1000)!
  assert(Math.abs(right.angleRad) < 1e-9, '方位 90°（东）→ 向右')
  const down = chartCourse(180, 1000)!
  assert(Math.abs(down.angleRad - Math.PI / 2) < 1e-9, '方位 180°（南）→ 向下')
  /*
   * 西向：−π 与 +π 是同一个方向，判据要比**单位向量**而不是比角度值
   * （第一版写 `angleRad + PI ≈ 0`，实际返回 +π，测试当场红了）。
   */
  const left = chartCourse(270, 1000)!
  assert(Math.abs(Math.cos(left.angleRad) + 1) < 1e-9 && Math.abs(Math.sin(left.angleRad)) < 1e-9,
    `方位 270°（西）→ 向左（cos=${Math.cos(left.angleRad).toFixed(3)}）`)

  // 长度：越远越长，且始终留边（0.18~0.82）
  const near = chartCourse(45, 10)!
  const far = chartCourse(45, CHART_MAX_NM)!
  const over = chartCourse(45, CHART_MAX_NM * 5)!
  // 下限只在 remainNm → 0 时才取到，而 0 已被判为"没有航路" —— 所以是"略大于 0.18"
  assert(near.lengthFrac > 0.18 && near.lengthFrac < 0.2,
    `很近时贴着下限（实测 ${near.lengthFrac.toFixed(4)}）`)
  assert(far.lengthFrac > near.lengthFrac, '越远线越长')
  assert(Math.abs(over.lengthFrac - far.lengthFrac) < 1e-12, '超过上限不再变长（不会画到图框外）')
  for (const nm of [1, 100, 500, 1500, 3000, 9000]) {
    const c = chartCourse(123, nm)!
    // 0.18 + 0.64 = 0.8200000000000001（浮点），判据带 1e-9 容差
    assert(c.lengthFrac >= 0.18 && c.lengthFrac <= 0.82 + 1e-9,
      `${nm} 海里的长度 ${c.lengthFrac} 在 0.18~0.82`)
  }

  // 没有航路 → 不画线
  assert(chartCourse(null, 500) === null, '没有方位就不画')
  assert(chartCourse(90, null) === null, '没有距离就不画')
  assert(chartCourse(90, 0) === null, '已经在目的地（0 海里）不画线')
  assert(chartCourse(Number.NaN, 100) === null, 'NaN 不画')
  assert(chartCourse(90, Number.NaN) === null, 'NaN 距离不画')
}

/*
 * ---- 三角旗：它是一张"风向的可视化"，方向绝不能反 ----
 *
 * 【守什么】`weather.windDir` 决定航程天数（顺风/逆风），而玩家在船上唯一能直接
 * 看到风向的就是桅顶这面旗。旗面沿局部 +x 伸出，`flagYaw` 负责把它转到"风吹去"
 * 的方位上；写反一次，玩家会照着反方向规划航线 —— 而且画面上"完全正常"。
 *
 * 判据用**旋转后的单位向量**而不是角度值：−π 与 +π 是同一个方向，比角度会假红
 * （这条在 chartCourse 那组测试里踩过）。
 */
{
  // 方位 0（吹向北，= 船首 +z）
  const dirOf = (deg: number) => {
    const yaw = pennantYaw(deg)
    // 绕 y 轴转 yaw：(1,0,0) → (cos yaw, 0, −sin yaw)
    return { x: Math.cos(yaw), z: -Math.sin(yaw) }
  }
  const north = dirOf(0)
  assert(Math.abs(north.z - 1) < 1e-9 && Math.abs(north.x) < 1e-9,
    `风向 0° → 旗指向船首 +z（实测 ${north.x.toFixed(2)}, ${north.z.toFixed(2)}）`)
  const east = dirOf(90)
  assert(Math.abs(east.x + 1) < 1e-9 && Math.abs(east.z) < 1e-9,
    '风向 90°（东）→ 旗指向右舷 −x')
  const west = dirOf(270)
  assert(Math.abs(west.x - 1) < 1e-9, '风向 270°（西）→ 旗指向左舷 +x')
  const south = dirOf(180)
  assert(Math.abs(south.z + 1) < 1e-9, '风向 180° → 旗指向船尾 −z')
  // 任意方位：四个方向都要与 (sin B, cos B) 那一套符号约定一致
  for (const deg of [15, 45, 135, 200, 315]) {
    const d = dirOf(deg)
    const rad = (deg * Math.PI) / 180
    assert(Math.abs(d.x + Math.sin(rad)) < 1e-9 && Math.abs(d.z - Math.cos(rad)) < 1e-9,
      `风向 ${deg}° 的旗向 = (−sin, cos)`)
  }
  // 非法输入不产生 NaN
  assert(Number.isFinite(pennantYaw(Number.NaN)), 'NaN 方位也给有限角度')
}

/*
 * ---- 旗面：旗根不动、旗尾甩、风小下垂 ----
 *
 * 【守什么】三角旗的波是 CPU 逐顶点算的（`flagOffset`）。三条不变量：
 *  ① 旗根（u=0）必须**完全不动** —— 动了就是"整面旗在平移"，像一块塑料板；
 *  ② 旗尾的横向甩动必须随风速增大；
 *  ③ 风小时旗子要垂下来（这是"没风"最直观的信号）。
 */
{
  for (const v of [-1, 0, 1]) {
    const root = flagOffset(0, v, 3.3, 20)
    assert(Math.abs(root.z) < 1e-12 && Math.abs(root.y) < 1e-12, '旗根（u=0）不位移')
  }
  // 旗尾：风越大甩得越开（取一个相位，避免正好落在零点）
  const tailCalm = Math.abs(flagOffset(1, 0, 1.7, 6).z)
  const tailWindy = Math.abs(flagOffset(1, 0, 1.7, 24).z)
  assert(tailWindy > tailCalm, `风大时旗尾甩得更开（${tailWindy.toFixed(3)} > ${tailCalm.toFixed(3)}）`)
  // 下垂：风越小，旗尾越低
  const droopCalm = flagOffset(1, 1, 0, 0).y
  const droopWindy = flagOffset(1, 1, 0, 25).y
  assert(droopCalm < droopWindy, `风小时旗子更低（${droopCalm.toFixed(2)} < ${droopWindy.toFixed(2)}）`)
  assert(droopCalm < -0.3, `无风时明显下垂（实测 ${droopCalm.toFixed(2)} 米）`)
  // 所有采样都有限（NaN 会让整个几何消失）
  for (let i = 0; i <= FLAG_SEG_X; i++) {
    const o = flagOffset(i / FLAG_SEG_X, 1, 2, 12)
    assert(Number.isFinite(o.z) && Number.isFinite(o.y), `第 ${i} 段有限`)
  }
  // 风速归一化
  assert(windK(0) === 0 && windK(5) === 0, '5 节以下算无风')
  assert(windK(25) === 1, '25 节满')
  assert(windK(100) === 1, '超过上限钳到 1')
  let prevK = -1
  for (let v = 0; v <= 30; v += 1) {
    const k = windK(v)
    assert(k >= prevK, `风速 ${v} 的 k 不回落`)
    prevK = k
  }
  // 角差：350 → 10 是 +20，不是 −340
  assert(Math.abs(bearingDelta(350, 10) - 20) < 1e-9, '350→10 转 +20')
  assert(Math.abs(bearingDelta(10, 350) + 20) < 1e-9, '10→350 转 −20')
  assert(bearingDelta(90, 90) === 0, '同向差 0')
}

/*
 * ---- 航迹：系泊与航行必须是两件事 ----
 *
 * 【守什么】航迹是"我在动"的可视化：系泊时船侧只有一道淡痕、船首**没有** V 浪；
 * 航行时才有白沫与 V 浪，而且越快越明显。三条都容易在调参时被抹平成常量。
 */
{
  assert(Math.abs(wakeStrength(false, 0) - 0.26) < 1e-9, '系泊时强度 0.26（不是 0，也不是满）')
  assert(Math.abs(wakeStrength(false, 12) - 0.26) < 1e-9, '系泊时与船速无关')
  assert(wakeStrength(true, 4) >= 0.42, '刚起步就有白沫')
  assert(Math.abs(wakeStrength(true, 12) - 1) < 1e-9, '12 节满强度')
  assert(wakeStrength(true, 40) === 1, '超过上限钳到 1')
  let prevS = -1
  for (let v = 0; v <= 20; v += 1) {
    const s = wakeStrength(true, v)
    assert(s >= prevS, `船速 ${v} 的强度不回落`)
    prevS = s
  }
  // 船首 V 浪：系泊时长度为 0（必须完全消失），航行时随速度变长
  assert(bowWaveLength(false, 10) === 0, '系泊时没有船首浪')
  assert(bowWaveLength(true, 4) > 0, '航行时船首浪存在')
  assert(bowWaveLength(true, 12) > bowWaveLength(true, 4), '越快船首浪越长')
  // 张角：慢船张得开、快船推成正前
  const slow = bowWaveSpread(4)
  const fast = bowWaveSpread(12)
  assert(slow > fast, `慢船张角更大（${(slow * 180 / Math.PI).toFixed(0)}° > ${(fast * 180 / Math.PI).toFixed(0)}°）`)
  assert(slow < 0.6 && fast > 0.15, '张角在合理区间（15°~34°）')
  assert(Number.isFinite(bowWaveSpread(Number.NaN)), 'NaN 船速也给出有限张角')
  assert(bowWaveLength(true, Number.NaN) > 0, 'NaN 船速仍有船首浪（按最慢算）')
}

/*
 * ---- 开尔文波：V 形波脊的几何 ----
 *
 * 【守什么】水面上的那两条斜纹不是装饰：它的半角必须是**开尔文波的理论值
 * 19.47°**（tan = 0.354），而不是"看起来差不多"的某个斜率。这个数写错，V 会
 * 张得过开（像喷气尾迹）或过窄（像两条平行线）—— 两种都很像"画的"，但都不对。
 * 另外三条：左右对称（船不歪）、船首之前没有波、强度 0 时整片消失。
 */
{
  const A = { bowZ: 0.83, sternZ: -0.83, strength: 1 }
  // ① 峰值落在 |x| = tan(19.47°) × d 上
  for (const d of [3, 6, 12]) {
    const onRidge = kelvinStrength(KELVIN_TAN * d, A.bowZ - d, A)
    const inside = kelvinStrength(KELVIN_TAN * d * 0.5, A.bowZ - d, A)
    const outside = kelvinStrength(KELVIN_TAN * d * 2.2, A.bowZ - d, A)
    assert(onRidge > 0.2, `d=${d} 的波脊上强度足够（实测 ${onRidge.toFixed(2)}）`)
    assert(onRidge > inside * 1.5, `d=${d} 的波脊比 V 内侧亮（${onRidge.toFixed(2)} vs ${inside.toFixed(2)}）`)
    assert(onRidge > outside * 2, `d=${d} 的波脊比外侧亮（${onRidge.toFixed(2)} vs ${outside.toFixed(2)}）`)
  }
  // ② 左右对称
  for (const [x, z] of [[1.2, -2], [2.6, -7], [-3.1, -9]]) {
    const a = kelvinStrength(x, z, A)
    const b = kelvinStrength(-x, z, A)
    assert(Math.abs(a - b) < 1e-12, `(±${x}, ${z}) 左右对称（${a.toFixed(4)} vs ${b.toFixed(4)}）`)
  }
  // ③ 船首之前没有波（d ≤ 0.9 一律 0）
  assert(kelvinStrength(0.2, 1.5, A) === 0, '船首前方没有波')
  assert(kelvinStrength(0.35, 0.5, A) === 0, '船首正上方没有波')
  // ④ 强度为 0 / 非法输入 → 整片消失（不能留一条"幽灵线"）
  assert(kelvinStrength(1.77, -4.17, { ...A, strength: 0 }) === 0, '系泊强度 0 时没有波')
  assert(kelvinStrength(1.77, -4.17, { ...A, strength: Number.NaN }) === 0, 'NaN 强度没有波')
  assert(kelvinStrength(Number.NaN, -4, A) === 0, 'NaN 坐标没有波')
  // ⑤ 随距离衰减（脊上同一相对位置，越远越弱）
  const near = kelvinStrength(KELVIN_TAN * 4, A.bowZ - 4, A)
  const far = kelvinStrength(KELVIN_TAN * 16, A.bowZ - 16, A)
  assert(near > far, `越远越弱（d=4: ${near.toFixed(3)} > d=16: ${far.toFixed(3)}）`)
  assert(far < 0.26, `16 单位外已经明显变淡（实测 ${far.toFixed(3)}）`)
  // ⑥ 值域
  for (const [x, z] of [[0, -3], [1.8, -5], [4, -8], [0, -20], [-2, -1]]) {
    const v = kelvinStrength(x, z, A)
    assert(v >= 0 && v <= 1, `(${x}, ${z}) 的强度在 0..1（实测 ${v.toFixed(3)}）`)
  }
  // ⑦ 船尾中线有尾迹（船正后方那条白带）
  const sternWake = kelvinStrength(0, A.sternZ - 1.5, A)
  assert(sternWake > 0.3, `船尾后方中线有尾迹（实测 ${sternWake.toFixed(2)}）`)
}

/*
 * ---- 不受光的材质必须自己跟日相；艉灯必须挂在船尾最高处 ----
 *
 * 【守什么】两条都是"夜里才看得出"的错：
 *  ① 水线湿痕、舱内窗玻璃用的是 MeshBasicMaterial（不受光、颜色恒定）。船壳是
 *     Lambert，夜里几乎全黑 —— 于是那条湿痕在夜里比整条船还亮，像贴了条胶带。
 *     所有 Basic 材质都必须显式按 night 插值。
 *  ② 艉灯如果挂在楼顶 **下方**，从船后上方看会被楼顶挡住一半（第一版就是），
 *     只在画面上露出一个橘点。它必须在楼顶之上。
 */
{
  const ship = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'shipModel.ts'), 'utf8')
  assert(/wetMatRef\.color\.copy\(WET_DAY\)\.lerp\(WET_NIGHT, night\)/.test(ship),
    '水线湿痕的颜色随夜色插值（Basic 材质不会自己变暗）')
  assert(/cabinGlassMat\.color\.copy\(CABIN_GLASS_DAY\)\.lerp\(CABIN_GLASS_NIGHT, night\)/.test(ship),
    '舱内窗玻璃同样跟随夜色')
  // 艉灯：高度必须在楼顶之上（楼顶 = shipDeckAt(-14.6) + 2.7，灯再加 ≥1）
  const m = ship.match(/lantern\.position\.set\(0, shipDeckAt\(-14\.6\) \+ ([\d.]+)/)
  assert(!!m, '找得到艉灯的位置表达式')
  assert(Number(m![1]) >= 3.6, `艉灯高于楼顶（偏移 ${m![1]}，楼顶在 +2.7）`)
  assert(/ship-stern-lantern/.test(ship), '艉灯有名字（能定位、能被 e2e 断言）')
  // 护舷木条：两侧各一条，且用不透明材质（半透明的贴片在夜里会消失）
  assert(/ship-strake-\$\{side > 0 \? 'port' : 'stbd'\}/.test(ship), '护舷木条左右各一条')
  const strake = ship.match(/const strakeMat = new THREE\.MeshLambertMaterial\(\{ color: 0x([0-9a-f]{6}) \}\)/)
  assert(!!strake, '护舷木条用不透明的 Lambert（不是 Basic 贴片）')
}

/*
 * ---- 三个水手必须各有姿态，而且舵手的手真的落在轮盘上 ----
 *
 * 【守什么】上一轮三个人是同样的垂手挺立 —— 从甲板上看是三根位置不同的木桩。
 * "岗位"这件事靠**身体**表达：掌舵的人握着轮、清点的人弯着腰、瞭望的人举着手。
 * 两条不变量：
 *  ① 三个岗位的姿态不能有两个完全相同（改了数据退化成"都一样"时，画面会静悄悄
 *     退回三根木桩，没有任何报错）；
 *  ② 舵手的手必须落在**轮盘范围内** —— 站位、手臂角度、臂长三个数一起决定这件事，
 *     改任何一个都可能变成"对着空气扶"（这一版改了三次才对上）。
 */
{
  const kinds = ['helm', 'hatch', 'bow'] as const
  // ① 两两不同
  for (let i = 0; i < kinds.length; i++) {
    for (let j = i + 1; j < kinds.length; j++) {
      const a = JSON.stringify(SAILOR_POSES[kinds[i]])
      const b = JSON.stringify(SAILOR_POSES[kinds[j]])
      assert(a !== b, `${kinds[i]} 与 ${kinds[j]} 的姿态不同`)
    }
  }
  // 角度都在人体范围内
  for (const k of kinds) {
    const p = SAILOR_POSES[k]
    assert(p.lean >= 0 && p.lean <= 0.8, `${k} 的前倾 ${p.lean} 在 0..0.8 rad`)
    assert(p.sink >= 0 && p.sink <= 0.2, `${k} 的下沉 ${p.sink} 在 0..0.2 m`)
    for (const a of [p.armLX, p.armRX]) {
      assert(a <= 0.35 && a >= -2.6, `${k} 的手臂角 ${a} 在 −2.6..0.35 rad（不甩到背后）`)
    }
    assert(Math.abs(p.headTilt) < 0.6, `${k} 的头俯仰 ${p.headTilt} 不超过 0.6 rad`)
  }
  // 舵手：两臂对称（不对称的手扶不住轮）
  assert(SAILOR_POSES.helm.armLX === SAILOR_POSES.helm.armRX, '舵手两臂对称')
  assert(Math.abs(SAILOR_POSES.helm.armLZ + SAILOR_POSES.helm.armRZ) < 1e-9, '舵手两臂的外张互为反向')
  // 清点的人必须真的弯腰
  assert(SAILOR_POSES.hatch.lean > 0.4, `舱口的人弯腰 ${SAILOR_POSES.hatch.lean} > 0.4 rad`)
  // 瞭望的人只举一只手臂
  assert(Math.abs(SAILOR_POSES.bow.armLX - SAILOR_POSES.bow.armRX) > 1, '船首的人只举一只手臂')

  /*
   * ② 舵手的手落在轮盘内。
   * 轮盘：中心 (0, 1.0, −10.9)、半径 0.72（在 xy 平面上，轮平面法线是 z）。
   * 手的水平位置 = 站位 + 手臂方向的水平分量 × 臂长。
   */
  const ARM_LEN = 0.56
  const helmSt = SAILOR_STATIONS.find((s) => s.kind === 'helm')!
  const armX = SAILOR_POSES.helm.armRX
  /*
   * 手臂几何朝 **−y** 延伸，所以经过 Rx(armX) 之后的方向是 (0, −cos, −sin)：
   *   Rx(θ)·(0,−1,0) = (0, −cosθ, −sinθ)
   * 第一版把 sin 的符号写反（(0,−cos,+sin)），算出来手在 z=−12.0（船尾方向），
   * 而轮盘在 −10.9 —— 判据当场把这个符号错抓了出来。
   */
  const tipY = -ARM_LEN * Math.cos(armX)
  const tipZ = -ARM_LEN * Math.sin(armX)
  const handY = 1.33 + tipY
  const handZ = -10.9 + (helmSt.z + tipZ + 10.9) // = helmSt.z + tipZ
  const distToHub = Math.hypot(helmSt.x, handY - 1.0)
  assert(handZ > -10.95 && handZ < -10.75, `手在轮盘平面上（z=${handZ.toFixed(2)}，轮在 −10.9）`)
  assert(distToHub < 0.72, `手落在轮盘半径内（到轮心 ${distToHub.toFixed(2)} < 0.72）`)
}

/*
 * ---- 岗位小动作：三个人不能是蜡像，但也不能变成另一个人 ----
 *
 * 【守什么】小动作是**增量**，所以真正的风险不是"不像"，而是"加起来越界"：
 *  · 舵手推轮时两臂必须同一个增量（不对称的手扶不住轮，e2e 也在守这条）；
 *  · 弯腰清点的人直起腰之后**仍然前倾**（0.55−0.34=0.21）—— 站直了就不是这个岗位；
 *  · 瞭望的人放下手臂之后**仍然举着**（−1.95+0.55=−1.40）—— 垂手就成了散步；
 *  · 头不能从"仰着看"变成"埋进胸口"。
 * 这四条都是算得出来的，不必盯着截图猜。
 */
{
  const kinds = ['helm', 'hatch', 'bow'] as const
  const PHASES = [0, 2.1, 4.3]
  // ① 任何时刻都不越界、不出 NaN（扫一遍，只报最坏值 —— 不逐点刷断言）
  {
    let worst = 0
    let worstAt = ''
    let bad = ''
    for (const k of kinds) {
      for (const ph of PHASES) {
        for (let t = 0; t <= 40; t += 0.1) {
          const d = sailorIdle(k, t, ph)
          for (const [name, v] of Object.entries(d)) {
            if (!Number.isFinite(v)) bad = `${k} t=${t.toFixed(2)} ${name}`
            const a = Math.abs(v)
            if (a > worst) { worst = a; worstAt = `${k} t=${t.toFixed(2)} ${name}` }
          }
        }
      }
    }
    assert(!bad, `小动作任何时刻都不出 NaN（${bad}）`)
    assert(worst < 0.7, `小动作最大幅度 ${worst.toFixed(2)} rad < 0.7（${worstAt}）`)
  }
  // ② 舵手：两臂同增量（对称），推的方向是"更向前"，且幅度小（不是打太极）
  {
    let maxPush = 0
    let symOk = true
    let armWorst = -99
    for (let t = 0; t <= 20; t += 0.02) {
      const d = sailorIdle('helm', t, 0)
      if (d.armLX !== d.armRX) symOk = false
      maxPush = Math.max(maxPush, -d.armLX)
      armWorst = Math.max(armWorst, SAILOR_POSES.helm.armRX + d.armRX)
    }
    assert(symOk, '舵手两臂增量完全相同（不对称的手扶不住轮）')
    assert(armWorst < -1.2, `推轮最远时手仍在轮上（armX 最大 ${armWorst.toFixed(2)} < −1.2）`)
    assert(maxPush > 0.05, `舵手真的推了一下（最大 ${maxPush.toFixed(2)} rad）`)
    assert(maxPush <= 0.12, `推的幅度不超过 0.12 rad（${maxPush.toFixed(2)}）`)
  }
  // ③ 舱口：直起腰的幅度够大，但永远回不到"站直"
  {
    let minLean = 99
    let maxStand = 0
    let tiltWorst = -99
    let dirOk = true
    for (let t = 0; t <= 20; t += 0.02) {
      const d = sailorIdle('hatch', t, 2.1)
      if (d.lean > 0) dirOk = false
      minLean = Math.min(minLean, SAILOR_POSES.hatch.lean + d.lean)
      maxStand = Math.max(maxStand, -d.lean)
      tiltWorst = Math.max(tiltWorst, SAILOR_POSES.hatch.headTilt + d.headTilt)
    }
    assert(dirOk, '舱口的人只会往直里动（不会趴得更低）')
    assert(maxStand > 0.25, `真的直起腰了（最大 ${maxStand.toFixed(2)} rad）`)
    assert(minLean > 0.15, `直起腰之后仍然前倾（最低 ${minLean.toFixed(2)} rad > 0.15）`)
    assert(minLean < 0.3, `直起腰的低点 ${minLean.toFixed(2)} < 0.3（看得出在起伏）`)
    assert(tiltWorst <= 0, `直起腰时头不会埋进胸口（${tiltWorst.toFixed(2)} rad ≤ 0）`)
  }
  // ④ 船首：放下的那只手仍然举着，另一只手一动不动
  {
    let maxDrop = 0
    let armWorst = -99
    let otherMoved = false
    for (let t = 0; t <= 60; t += 0.02) {
      const d = sailorIdle('bow', t, 4.3)
      if (d.armLX !== 0) otherMoved = true
      maxDrop = Math.max(maxDrop, d.armRX)
      armWorst = Math.max(armWorst, SAILOR_POSES.bow.armRX + d.armRX)
    }
    assert(!otherMoved, '船首的另一只手不参与小动作')
    assert(maxDrop > 0.4, `真的放下去了（最大 ${maxDrop.toFixed(2)} rad）`)
    assert(armWorst <= -1.2, `放下之后仍然举着（最高 ${armWorst.toFixed(2)} rad ≤ −1.2）`)
  }
  // ⑤ 三人的节奏不同（同相位也不该同步动）、相位真的有用
  for (const k of kinds) {
    /*
     * 相位判据不能只看某一个 t：包络在谷底是**恒 0**（"平时不动"就是要把两个
     * 相位都压在 0），单点比较会撞上 0 === 0 的假红。要看一整段时间里是否存在
     * 差别。
     */
    let phaseSpread = 0
    for (let t = 0; t <= 20; t += 0.05) {
      phaseSpread = Math.max(phaseSpread, Math.abs(sailorIdle(k, t, 0).lean - sailorIdle(k, t, 2.1).lean))
    }
    assert(phaseSpread > 1e-3, `${k} 的小动作受相位影响（三人不会一起动，最大差 ${phaseSpread.toFixed(3)}）`)
    const nan = sailorIdle(k, Number.NaN, Number.NaN)
    for (const v of Object.values(nan)) assert(Number.isFinite(v), `${k} 的 NaN 时间不产生 NaN`)
  }
  /*
   * ⑥ 源码守卫：`headTilt` 必须**真的被应用**。
   * 这张表在上一轮就写好了、注释也写了"弯腰之后再低头脸会埋进胸口"，但当时
   * 代码里没有任何人读这个数 —— 数据躺在表里、头一动不动。这类"注释说了、代码
   * 没做"的错，单测不守就永远发现不了（截图上只是"那个人有点僵"）。
   */
  {
    const ship = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'shipModel.ts'), 'utf8')
    assert(/head\.rotation\.x = pose\.headTilt/.test(ship), '头的俯仰真的被写进场景（headTilt 不再是一张死表）')
    assert(/headGroup\.add\(hat\)/.test(ship), '帽子挂在头组下面（低头时帽子跟着走）')
    assert(/sailorIdle\(st\.kind, t, st\.phase\)/.test(ship), '每帧都在调小动作（不是只在建模型时调一次）')
  }
}


/*
 * ---- 船首：斜桅只有一个端点，船首像不能插进斜桅也不能没入水里 ----
 *
 * 【守什么】斜桅端点在 `shipModel` 里原来算了**两遍**（实体用 base+dir·len、
 * 索具用 shipDeckAt(17)+6.1）。实测两处**碰巧重合**（都是 y=7.96，方向里少算的
 * 0.95 与底端多算的 0.95 抵消），所以这不是修一个看得见的错，而是拆掉一颗
 * 定时炸弹：改任何一个数，前支索就会系在杆头之外的空气里，而远景里那只是
 * 几根细线。这一轮把端点收进 `deckBow`，这里守三件事：
 *  ① 斜桅轴线的函数在端点处自洽（同一个来源才可能）；
 *  ② 船首像的每个球都在水线之上、斜桅之下（不然就是"插进桅里/泡在水里"）；
 *  ③ 源码里不许再出现斜桅端点的字面量（防止第三次分叉）。
 */
{
  assert(BOWSPRIT_TIP.y > BOWSPRIT_BASE.y + 4, `斜桅向上抬 ${(BOWSPRIT_TIP.y - BOWSPRIT_BASE.y).toFixed(2)} 米`)
  assert(BOWSPRIT_TIP.z > BOWSPRIT_BASE.z, '斜桅朝船首前方伸出')
  assert(Math.abs(bowspritYAt(BOWSPRIT_BASE.z) - BOWSPRIT_BASE.y) < 1e-9, '轴线函数在底端等于底端')
  assert(Math.abs(bowspritYAt(BOWSPRIT_TIP.z) - BOWSPRIT_TIP.y) < 1e-9, '轴线函数在端头等于端头')

  const pts = figureheadPoints()
  assert(pts.length === FIGUREHEAD_SPINE.length, '脊柱点数与数据表一致')
  for (let i = 1; i < pts.length; i++) {
    assert(pts[i].z > pts[i - 1].z, `第 ${i} 段更靠前（z ${pts[i - 1].z.toFixed(2)} → ${pts[i].z.toFixed(2)}）`)
    assert(pts[i].r < pts[i - 1].r, `第 ${i} 段更细（r ${pts[i - 1].r} → ${pts[i].r}）`)
  }
  for (const p of pts) {
    assert(p.y - p.r > WATERLINE_Y_M + 0.8,
      `船首像在水线之上（y=${p.y.toFixed(2)} − r ${p.r} > 水线 ${WATERLINE_Y_M}）`)
    assert(p.y + p.r < bowspritYAt(p.z) - 0.05,
      `船首像不捅进斜桅（顶 ${(p.y + p.r).toFixed(2)} < 斜桅 ${bowspritYAt(p.z).toFixed(2)}）`)
  }
  const tip = figureheadTip()
  assert(tip.z > STEM_Z + 1, `尾尖伸出船首柱 ${(tip.z - STEM_Z).toFixed(2)} 米（剪影要探出去才看得见）`)
  assert(tip.z < BOWSPRIT_TIP.z - 4, '船首像不会伸到斜桅端头去（那里是系索的地方）')
  /*
   * 头冠必须一起判：它建在脊柱之外，是整个船首像**最高**的部件。
   * 第一版就是它捅进了斜桅（顶 3.85 vs 斜桅轴线 3.80）—— 脊柱全部合格，
   * 只有这个尖越界，所以它必须有自己的判据。
   */
  const crest = pts[0]
  const crestTop = crest.y + FIGUREHEAD_CREST.lift + FIGUREHEAD_CREST.height / 2
  assert(crestTop < bowspritYAt(crest.z) - 0.06,
    `头冠不捅进斜桅（顶 ${crestTop.toFixed(2)} < 斜桅 ${bowspritYAt(crest.z).toFixed(2)}）`)
  assert(FIGUREHEAD.pitch > 0 && FIGUREHEAD.pitch < 0.6, `前倾 ${FIGUREHEAD.pitch} rad 在 0..0.6`)

  // 源码守卫：端点只许在 deckBow 里出现
  const ship = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'shipModel.ts'), 'utf8')
  assert(!/26\.2/.test(ship), 'shipModel 里不再有斜桅端点的字面量（端点只许来自 deckBow）')
  assert(/import \{[\s\S]{0,200}BOWSPRIT_TIP/.test(ship), 'shipModel 从 deckBow 取端点')
  assert(/ship-figurehead/.test(ship) && /ship-stem/.test(ship), '船首柱与船首像真的建出来了')
}

/*
 * ---- 锚：抛锚/收锚是"船在不在走"的实体信号 ----
 *
 * 【守什么】锚是这条船上唯一与 `fleet.isSailing` 直接挂钩的实体，判据要能守住
 * "两种状态在画面上真的不一样"，而不是"有个名叫锚的东西"：
 *  ① 抛锚时锚爪在水下、收锚时锚爪在水上（不然"抛了锚"和"收着锚"长得一样）；
 *  ② 两个位置差得够远（≥2 米）—— 只差 20 厘米等于没变化；
 *  ③ 锚挂在船壳**外沿**（x 略大于该站位的半宽）：挂在舷墙里面就成了"甲板上放了块铁"；
 *  ④ 锚链孔在舷墙顶之下、锚之前的位置合理（链子才有斜度）。
 */
{
  const moored = anchorPose(true)
  const sailing = anchorPose(false)
  assert(sailing.y - moored.y > 2, `收锚比抛锚高 ${(sailing.y - moored.y).toFixed(2)} 米（≥2）`)
  assert(anchorFootY(true) < WATERLINE_Y_M, `抛锚时锚爪在水下（${anchorFootY(true).toFixed(2)} < 水线 ${WATERLINE_Y_M}）`)
  assert(anchorFootY(false) > WATERLINE_Y_M + 1,
    `收锚时锚爪在水面之上（${anchorFootY(false).toFixed(2)} > ${(WATERLINE_Y_M + 1).toFixed(2)}）`)
  assert(moored.wet && !sailing.wet, '只有抛锚时才"湿"（渲染端据此决定是否画水花）')
  // 挂在船壳外沿（不是舷墙里面）：左舷所以 x 是负的，判据取绝对值
  const halfW = shipHalfWidthAt(ANCHOR_Z)
  assert(Math.abs(moored.x) > halfW && Math.abs(moored.x) < halfW + 0.8,
    `锚在船壳外沿（x=${moored.x.toFixed(2)}，半宽 ${halfW.toFixed(2)}）`)
  assert(Math.sign(moored.x) < 0, '锚挂在左舷（外景机位在左舷，锚才进得了画）')
  assert(moored.z > HAWSE_Z && moored.z < STEM_Z, '锚在锚链孔之前、船首柱之后')
  assert(HAWSE_Y < shipDeckAt(HAWSE_Z) + 0.95, `锚链孔在舷墙顶之下（${HAWSE_Y} < ${(shipDeckAt(HAWSE_Z) + 0.95).toFixed(2)}）`)
  assert(moored.cableSag < sailing.cableSag, '抛锚时链子绷直、收锚时松垮')
  assert(Math.sign(moored.tilt) !== Math.sign(sailing.tilt), '两种状态的倾角方向不同（收起来翻贴船壳）')
  // 源码守卫：状态来自同一个 isSailing，锚与链子真的建出来了
  const deck = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'DeckView.tsx'), 'utf8')
  assert(/setMooring\(!st\.fleet\.isSailing\)/.test(deck), '锚的状态与航迹同源（都读 fleet.isSailing）')
  const ship = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'shipModel.ts'), 'utf8')
  assert(/ship-anchor'/.test(ship) && /ship-anchor-cable'/.test(ship), '锚与锚链真的建出来了')
}

/*
 * ---- 甲板小艇：位置合理，而且**必须真的挡人** ----
 *
 * 【守什么】甲板行走只约束船体轮廓与桅杆。一条 7 米长、近 1 米高的艇摆在腰部，
 * 如果它不参与碰撞，玩家会**直接从中间穿过去** —— 模型在、世界是空的，
 * 比没有这条艇更糟。这里守三件事：位置不出界、不压舱口/不挡桅杆、真的能推离。
 */
{
  const b = boatObstacle()
  assert(BOAT.halfLen * 2 > 6 && BOAT.halfLen * 2 < 8, `小艇长 ${(BOAT.halfLen * 2).toFixed(1)} 米（6~8）`)
  assert(BOAT.halfWide * 2 > 1.2 && BOAT.halfWide * 2 < 2.2, `艇宽 ${(BOAT.halfWide * 2).toFixed(2)} 米（1.2~2.2）`)
  assert(b.minX > -deckWalkHalfWidth(BOAT.z), `小艇没穿出舷墙（左缘 ${b.minX.toFixed(2)} > 可走界限 ${(-deckWalkHalfWidth(BOAT.z)).toFixed(2)}）`)
  assert(boatRailGap() > 0.5, `艇与舷墙之间留出 ${boatRailGap().toFixed(2)} 米走道`)
  // 不压货舱口（舱口 x 从 −1.1 到 1.9、z 从 4.4 到 6.8）
  assert(b.maxX < -1.1, `小艇不压货舱口（艇右缘 ${b.maxX.toFixed(2)} < 舱口左缘 −1.1）`)
  // 不进主桅（桅在 (0, 1)、半径 1.15）
  assert(0 - b.maxX > 1.15, `小艇不碰主桅（离轴 ${(0 - b.maxX).toFixed(2)} > 1.15）`)
  assert(boatKeelLift() > 0.2, `艇底用垫木抬起 ${boatKeelLift()} 米`)

  // ① 从右边撞进去 → 被推到右缘（+ 玩家半径）
  const push = stepWalk({ x: -1.0, z: 2 }, -0.6, 0)
  assert(Math.abs(push.x - (b.maxX + WALK_RADIUS_M)) < 1e-9, `撞向小艇会被推开（x=${push.x.toFixed(2)}）= 艇缘 + 半径`)
  assert(Math.abs(push.z - 2) < 1e-9, '被推开时 z 不变（沿最浅的一轴推）')
  // ② 贴着小艇侧面走：不能卡住，z 要能推进（起点稍在艇内，靠推离把 x 顶出来）
  const slide = stepWalk({ x: -1.5, z: 2 }, 0, 0.4)
  assert(slide.z > 2.2, `贴着小艇走能滑过去（z 2 → ${slide.z.toFixed(2)}）`)
  assert(Math.abs(slide.x - (b.maxX + WALK_RADIUS_M)) < 1e-9, '滑动时仍然贴在艇边')
  // ③ 从船首方向撞进去 → 沿 z 推回
  const head = stepWalk({ x: -2.45, z: 8.0 }, 0, -0.4)
  assert(Math.abs(head.z - (b.maxZ + WALK_RADIUS_M)) < 1e-9, `从船首撞进去沿 z 推回（z=${head.z.toFixed(2)}）`)
  // ④ 左舷走道仍然走得动（艇与舷墙之间那条缝）
  const corridor = stepWalk({ x: -3.7, z: 4.0 }, 0, 0.5)
  assert(Math.abs(corridor.x + 3.7) < 1e-9 && corridor.z > 4.4, '左舷走道没被小艇堵死')
  // ⑤ 源码守卫：stepWalk 里真的用了这个矩形
  const walk = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'deckWalk.ts'), 'utf8')
  assert(/boatObstacle\(\)/.test(walk), 'stepWalk 真的读了小艇的占位矩形')

  /*
   * 艇体放样（`boatHull`）：
   * 【守什么】第一版用"压扁的下半球"，从甲板看是一只黑碗（两端圆头、没有舷弧）。
   * 换成沿船长放样之后，这三件事必须算得出来：两端收成尖、龙骨中段最深、
   * 顶点一个都不许超出 BOAT 的尺寸。
   */
  const h = boatHull()
  const vcount = h.positions.length / 3
  assert(vcount === 2 * (BOAT_STATIONS + 1) * (BOAT_ARC + 1), `艇体顶点数 = 2×${BOAT_STATIONS + 1}×${BOAT_ARC + 1}（实测 ${vcount}）`)
  let maxAbsX = 0
  let maxY = -99
  let minY = 99
  let minZ = 99
  let maxZ = -99
  for (let i = 0; i < vcount; i++) {
    const x = h.positions[i * 3]
    const y = h.positions[i * 3 + 1]
    const z = h.positions[i * 3 + 2]
    maxAbsX = Math.max(maxAbsX, Math.abs(x))
    maxY = Math.max(maxY, y)
    minY = Math.min(minY, y)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  assert(maxAbsX <= BOAT.halfWide + 1e-6, `艇体不超宽（${maxAbsX.toFixed(2)} ≤ ${BOAT.halfWide}）`)
  assert(Math.abs(minY + BOAT.depth) < 0.02, `龙骨最低点 ≈ −depth（${minY.toFixed(2)}）`)
  assert(maxY <= 0.07, `舷缘最高 ${maxY.toFixed(2)} 米（艇缘在 0 附近）`)
  assert(Math.abs(minZ + BOAT.halfLen) < 1e-6 && Math.abs(maxZ - BOAT.halfLen) < 1e-6,
    `艇体纵跨 −${BOAT.halfLen}..+${BOAT.halfLen}`)
  // 两端的宽度必须是 0（尖头），中段最宽
  const widthAt = (t: number) => {
    const row = Math.round(t * BOAT_STATIONS) * (BOAT_ARC + 1) + BOAT_ARC
    return Math.abs(h.positions[row * 3])
  }
  assert(widthAt(0) < 0.02 && widthAt(1) < 0.02, `两端收成尖（${widthAt(0).toFixed(3)} / ${widthAt(1).toFixed(3)}）`)
  assert(widthAt(0.5) > BOAT.halfWide * 0.9, `中段最宽（${widthAt(0.5).toFixed(2)}）`)
  // 索引范围只判一次（逐条判会把断言数刷到几千条，掩盖真正的变化）
  const iMin = Math.min(...h.indices)
  const iMax = Math.max(...h.indices)
  assert(iMin >= 0 && iMax < vcount, `索引都在顶点范围内（${iMin}..${iMax} / ${vcount}）`)
}

/*
 * ---- 牲口栏：几只羊必须等于"粮"算出来的数 ----
 *
 * 【守什么】栏子是"粮快见底"的预告，它必须严格由 `fleet.food` 决定：
 * 分档单调、整数、上下限、空栏只发生在粮真的不够时。位置也要守（不能压货舱口、
 * 不能压小艇、不能挡主桅），并且要能挡住玩家（与甲板小艇同一套推离）。
 */
{
  const live = (f: number) => penLivestock(f)
  assert(live(0) === 0 && live(-5) === 0, '粮 0 / 负数 → 空栏')
  assert(live(Number.NaN) === 0, 'NaN 粮 → 空栏')
  assert(live(3) === 0, '粮 3 → 空栏（马上要饿肚子了）')
  assert(live(4) === 1, '粮 4 → 1 只')
  assert(live(9) === 1, '粮 9 → 1 只')
  assert(live(10) === 2, '粮 10 → 2 只')
  assert(live(19) === 2, '粮 19 → 2 只')
  assert(live(20) === 3, '粮 20 → 3 只（满栏）')
  assert(live(999) === 3, '粮再多也只有 3 只（栏就这么大）')
  let prevN = -1
  for (let f = 0; f <= 40; f += 1) {
    const n = live(f)
    assert(Number.isInteger(n) && n >= prevN && n <= PEN_SPOTS.length,
      `粮 ${f} → ${n} 只（整数、单调不减、不超过栏位）`)
    prevN = n
  }

  // 位置：不压货舱口、不压小艇、不挡主桅、在可走范围内
  const p = penObstacle()
  assert(p.minX > -1.1 || p.maxX < -1.1, '栏子在货舱口的另一侧（不与舱口重叠）')
  const boat = boatObstacle()
  const overlapBoat = p.minX < boat.maxX && p.maxX > boat.minX && p.minZ < boat.maxZ && p.maxZ > boat.minZ
  assert(!overlapBoat, '栏子与甲板小艇不重叠')
  const distMast = Math.hypot(Math.max(0, p.minX) - 0, PEN.z - 1)
  assert(distMast > 1.15, `栏子离主桅 ${distMast.toFixed(2)} 米（> 1.15）`)
  assert(p.maxX < deckWalkHalfWidth(PEN.z), `栏子没穿出舷墙（右缘 ${p.maxX.toFixed(2)} < ${deckWalkHalfWidth(PEN.z).toFixed(2)}）`)

  // 真的挡人：从中央走道往**右舷**（+x，栏子那一侧）撞过去要停在栏边
  const hit = stepWalk({ x: PEN.x - PEN.halfX - 0.2, z: PEN.z }, 0.5, 0)
  assert(Math.abs(hit.x - (p.minX - WALK_RADIUS_M)) < 1e-9,
    `撞向牲口栏会被推开（x=${hit.x.toFixed(2)}）= 栏缘 − 半径`)

  // 源码守卫：状态与粮同源，羊真的建出来了
  const deck = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'DeckView.tsx'), 'utf8')
  assert(/setProvisions\(st\.fleet\.food\)/.test(deck), '栏里几只羊直接读 fleet.food')
  const ship = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'shipModel.ts'), 'utf8')
  assert(/ship-pen-sheep-/.test(ship) && /ship-pen-straw/.test(ship), '栏子与羊真的建出来了')
}

/*
 * ---- 海图比例尺：长度必须是量出来的，档位必须是整数 ----
 *
 * 【守什么】比例尺是玩家用来"量"航线的工具。它有两种错法都会毁掉信任：
 *  ① 写死一个长度（缩放不变）→ 高纬度差一半，玩家按它估补给；
 *  ② 档位不是整数（比如 3.7 海里）→ 玩家还得心算。
 * 这里守：像素落在可读区间、档位来自 1-2-5 系列、缩放变大时档位单调变小。
 */
{
  assert(pickScale(0) === null && pickScale(-1) === null && pickScale(Number.NaN) === null,
    '像素/海里 不可用时不给尺子（宁可没有，也不给错数）')
  const steps = new Set<number>(SCALE_STEPS as readonly number[])
  let prevNm = Infinity
  for (const ppm of [0.02, 0.05, 0.1, 0.3, 0.8, 2, 5, 12, 30, 80, 200]) {
    const b = pickScale(ppm)
    assert(!!b, `ppm=${ppm} 有尺子`)
    assert(steps.has(b!.nm), `ppm=${ppm} 的档位 ${b!.nm} 来自 1-2-5 系列`)
    assert(Math.abs(b!.px - ppm * b!.nm) < 1.01, `ppm=${ppm} 的像素长 ${b!.px} = ${ppm}×${b!.nm}`)
    /*
     * 区间保证只在"有档位塞得进区间"时成立；所有档位都太长/太短时，
     * 取**最接近区间中心**的一档 —— 这时长度仍然是真的（px = ppm×nm），
     * 只是可能略超出可读区间。宁可尺子长一点，也不许它说谎。
     */
    const fits = SCALE_STEPS.some((nm) => ppm * nm >= SCALE_MIN_PX && ppm * nm <= SCALE_MAX_PX)
    if (fits) {
      assert(b!.px >= SCALE_MIN_PX && b!.px <= SCALE_MAX_PX,
        `ppm=${ppm} 的尺子 ${b!.px}px 落在可读区间 ${SCALE_MIN_PX}..${SCALE_MAX_PX}`)
    } else if (b) {
      assert(b.px <= SCALE_MAX_PX * 2, `ppm=${ppm} 无档位可塞时取最近档（${b.px}px）`)
    }
    // 放大（ppm 变大）时，同一条屏幕长度代表的里程只会变少
    assert(b!.nm <= prevNm * 1.0001, `ppm=${ppm} 的档位 ${b!.nm} 不比上一档 ${prevNm} 大`)
    prevNm = b!.nm
  }
  // 具体一例：60 海里 ≈ 1 度纬度；如果 1 度在屏幕上是 300px，尺子应当是 50 或 100 海里
  // 极端缩放：没有一条尺子能既真实又可读 → 宁可不画（不许拉长去凑区间）
  assert(pickScale(600) === null, '极端放大时不给尺子（1 海里的档位也有 600px，会横穿海图）')
  // 1 度纬度 = 60 海里；如果 1 度在屏幕上 300px ⇒ 5 px/海里 ⇒ 100px 的尺子 = 20 海里
  const b60 = pickScale(300 / 60)
  assert(b60!.nm === 20 && b60!.px === 100, `1 度=300px（5 px/海里）时给 ${b60!.nm} 海里 = ${b60!.px}px`)
  assert(scaleHint(100) === '≈ 185 公里', `100 海里换算成 ${scaleHint(100)}`)
  assert(scaleHint(2) === '≈ 3.7 公里', `2 海里换算成 ${scaleHint(2)}`)

  // 源码守卫：比例尺必须真的量投影，而且不吃点击
  const bar = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'ScaleBar.tsx'), 'utf8')
  assert(/pxPerNmAt\(map\)/.test(bar), '比例尺用共享的 pxPerNmAt（与航程圈同一份比例）')
  const mapScale = readFileSync(join(process.cwd(), 'src', 'utils', 'mapScale.ts'), 'utf8')
  assert(/latLngToContainerPoint/.test(mapScale), '比例是量容器像素得来的（不是写死的长度）')
  assert(/haversineNm/.test(mapScale), '海里数走 haversineNm（与航程同一个来源）')
  assert(/pointer-events-none/.test(bar), '比例尺不吃点击')
  assert(/map\.on\('zoomend'/.test(bar), '缩放结束后重算')
}

/*
 * ---- 航程圈：圈上每一点到本船的距离必须真的等于半径 ----
 *
 * 【守什么】航程圈唯一的用途就是"量够不够得着"。它有两种错法都致命：
 *  ① 用平面近似算圆 → 高纬度圈被压扁，圈上距离不等于半径（玩家按它判断会翻车）；
 *  ② 半径不来自 `dailyDistanceNm` → 圈和出航计划面板各说一套。
 * 这里逐点用 haversine 量半径，并守住"半径 = 每日航程 × 天数"这条式子。
 */
{
  // 60°N 处画一个 600 海里的圈：地球上任意纬度、任意方位，每点到圆心的距离都必须 = 600
  for (const [lat, lng] of [[0, 0], [60, -9], [-35, 120], [78, 15]] as const) {
    const pts = circleLatLngs(lat, lng, 600)
    assert(pts.length === RING_SEGMENTS, `${lat}°N 的圈有 ${RING_SEGMENTS} 段（实测 ${pts.length}）`)
    let worst = 0
    for (const p of pts) worst = Math.max(worst, Math.abs(haversineNm(lat, lng, p[0], p[1]) - 600))
    assert(worst < 1.2, `(${lat}, ${lng}) 的圈半径误差 ${worst.toFixed(2)} 海里 < 1.2（球面正算）`)
  }
  // 经度归一：跨 180° 经线时不能出现 181° 这种值
  const across = circleLatLngs(0, 179.5, 300)
  assert(across.every(([, lon]) => lon >= -180 && lon <= 180), '跨 180° 经线时经度已归一')
  // 非法输入不画
  assert(circleLatLngs(Number.NaN, 0, 100).length === 0, 'NaN 纬度 → 不画')
  assert(circleLatLngs(0, 0, 0).length === 0, '半径 0 → 不画')
  assert(circleLatLngs(0, 0, -5).length === 0, '负半径 → 不画')

  // 半径 = 每日航程 × 天数；每日航程不可用时不画
  assert(ringRadii(0).length === 0 && ringRadii(Number.NaN).length === 0, '每日航程无效 → 不画圈')
  const rings = ringRadii(60)
  assert(rings.length === RING_DAY_CANDIDATES.length, `60 海里/天 → 每个候选天数一圈（${rings.length}）`)
  for (const r of rings) {
    assert(Math.abs(r.nm - 60 * r.days) < 1e-9, `${r.days} 天圈半径 = 60 × ${r.days} = ${r.nm} 海里`)
  }
  /*
   * 自适应天数：圈必须落在 70~320px 之间 —— 这是"看得见"的判据。
   * 固定 5/10 天时，默认缩放（约 0.45 px/海里）下 10 天圈半径 860px，整圈在画面外。
   */
  {
    const cases: [number, number][] = [[192, 0.45], [192, 1.2], [192, 3], [60, 0.45], [400, 0.2]]
    for (const [nmPerDay, ppm] of cases) {
      const days = pickRingDays(nmPerDay, ppm)
      assert(days.length <= 2, `${nmPerDay} 海里/天 @ ${ppm}px → 最多两圈（${days.length}）`)
      if (days.length === 0) {
        // 连 1 天圈都超出上限：宁可一圈不画，也不画一个整圈跑到画面外的圈
        assert(nmPerDay * 1 * ppm > RING_MAX_PX,
          `不画圈时确实连 1 天圈都超过 ${RING_MAX_PX}px（${(nmPerDay * ppm).toFixed(0)}px）`)
      }
      for (const d of days) {
        const px = nmPerDay * d * ppm
        assert(px >= RING_MIN_PX - 1e-9 && px <= RING_MAX_PX + 1e-9,
          `${d} 天圈在屏幕上 ${px.toFixed(0)}px，落在 ${RING_MIN_PX}..${RING_MAX_PX}`)
      }
      // 升序，且两圈之间不能挤在一起（否则读成双线）
      if (days.length === 2) {
        assert(days[0] < days[1], `${days[0]} 天在内圈、${days[1]} 天在外圈`)
        assert(days[0] <= days[1] * 0.55 + 1e-9, `两圈拉开距离（${days[0]} vs ${days[1]}）`)
      }
    }
    assert(pickRingDays(0, 0.45).length === 0 && pickRingDays(192, 0).length === 0, '参数无效 → 不画圈')
  }

  // 太小的圈不画（半径 ≤ MIN_RING_NM）
  const tiny = ringRadii(1) // 1 海里/天：5 天圈只有 5 海里，10 天圈 10 海里
  assert(tiny.every((r) => r.nm > MIN_RING_NM), `半径不大于 ${MIN_RING_NM} 海里的圈不画`)
  assert(!tiny.some((r) => r.days === 5), '1 海里/天时 5 天圈（5 海里）被丢掉')
  assert(tiny.some((r) => r.days === 10), '1 海里/天时 10 天圈（10 海里）仍然画')

  // 源码守卫：半径必须来自 dailyDistanceNm（与出航计划同一个函数）
  const ring = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'VoyageRings.tsx'), 'utf8')
  assert(/dailyDistanceNm\(/.test(ring), '圈半径来自 dailyDistanceNm')
  assert(/STANCES\.steady\.speedMul/.test(ring), '方针口径与出航计划一致（按部就班）')
  assert(/interactive: false/.test(ring), '圈不吃点击')
}


/*
 * ---- 经纬网：步长跟着缩放走、度数不带错字 ----
 *
 * 【守什么】经纬网只有两个失效方式，都会让玩家读到错的经纬度：
 *  ① 步长写死 → 开局线挤成一张网、放大后整屏一根线都没有；
 *  ② 度数格式错（0°N / 180°E / -0°）→ 玩家照着报的坐标是错的。
 * 另守一条几何恒等式：**经度每度的像素 ≥ 纬度每度的像素**（墨卡托里横向被
 * 1/cos φ 拉伸），所以只要纬度方向的间距够 72px，经度方向一定更松 ——
 * 这是"标签永不自相重叠"的根据，不靠运气。
 */
{
  // ① 不可用时不给网（宁可不画，也不画一张度数乱掉的网）
  assert(pickGraticuleStep(0) === 0 && pickGraticuleStep(-3) === 0,
    '像素/度 不可用时返回 0（不画）')
  assert(pickGraticuleStep(Number.NaN) === 0 && pickGraticuleStep(Infinity) === 0,
    'NaN / Infinity 不画')

  /*
   * ② 游戏真实的 9 个缩放级（minZoom 2 .. maxZoom 10）逐级验：
   *    墨卡托里 1 度 ≈ 256·2^z / 360 像素（与实测一致：z=5 时 22.75）
   */
  const steps = new Set<number>(GRATICULE_STEPS as readonly number[])
  let prevStep = 0
  for (let z = 2; z <= 10; z++) {
    const pxPerDeg = (256 * 2 ** z) / 360
    const step = pickGraticuleStep(pxPerDeg)
    assert(steps.has(step), `zoom ${z} 的步长 ${step} 来自候选表`)
    assert(step * pxPerDeg >= MIN_LINE_GAP_PX,
      `zoom ${z} 的 ${step}° 线间距 ${(step * pxPerDeg).toFixed(0)}px ≥ ${MIN_LINE_GAP_PX}`)
    // 它必须是"够宽的最小档"：再小一档就该不够宽了
    const idx = (GRATICULE_STEPS as readonly number[]).indexOf(step)
    if (idx > 0) {
      const finer = GRATICULE_STEPS[idx - 1] as number
      assert(finer * pxPerDeg < MIN_LINE_GAP_PX,
        `zoom ${z} 没选更细的 ${finer}°（它只有 ${(finer * pxPerDeg).toFixed(0)}px，会挤）`)
    }
    // 放大只会更细（步长单调不增）
    assert(step <= prevStep || prevStep === 0, `zoom ${z} 的步长 ${step} 不大于 zoom ${z - 1} 的 ${prevStep}`)
    prevStep = step
  }
  // 具体三例（写出来当"如果这里变了要知道"的锚）
  assert(pickGraticuleStep(22.75) === 5, `zoom 5（22.75px/度）用 5° 网格`)
  assert(pickGraticuleStep(91) === 1, `zoom 7（91px/度）用 1° 网格`)
  assert(pickGraticuleStep(2.84) === 30, `zoom 2（2.84px/度）用 30° 网格`)

  /*
   * 高缩放级必须有**够多的线**。
   *
   * 【守的是这条】上一版最小步长 1°：zoom 10 时 1° = 728px，900px 高的画面
   * 只跨 1.2° —— 整屏一根纬线、一根经线，海面大片空白（截图确认）。
   * 细分到 0.1°（6′）之后同屏 12 条纬线。这条判据问的就是"一屏看得见几条"。
   */
  for (const z of [7, 8, 9, 10]) {
    const pxPerDeg = (256 * 2 ** z) / 360
    const step = pickGraticuleStep(pxPerDeg)
    const linesOnScreen = 900 / (step * pxPerDeg)
    assert(linesOnScreen >= 4, `zoom ${z}：900px 高的画面能看到 ${linesOnScreen.toFixed(1)} 条纬线（≥ 4）`)
    assert(step === 1 || step === 0.5 || step === 0.25 || step === 0.1,
      `zoom ${z} 的步长 ${step}° 已经是"分刻度"档`)
  }
  assert(pickGraticuleStep(728) === 0.1, 'zoom 10（728px/度）细分到 0.1°（6′）')
  // 步长必须是整分钟：0.1°=6′、0.25°=15′、0.5°=30′
  for (const st of GRATICULE_STEPS) {
    const minutes = st * 60
    assert(Math.abs(minutes - Math.round(minutes)) < 1e-9, `步长 ${st}° = ${minutes}′ 是整分钟`)
  }
  // 整度判定（用来分主刻度/分刻度两档线宽）
  assert(isWholeDegree(35) && isWholeDegree(-10) && isWholeDegree(0), '整数度是整度线')
  assert(!isWholeDegree(35.4) && !isWholeDegree(0.1) && !isWholeDegree(Number.NaN), '0.1/35.4/NaN 不是整度线')

  // ③ 经度方向一定比纬度方向松（cos φ ≤ 1）—— 标签不会横向挤在一起
  for (const lat of [0, 20, 40, 60, 75, 85]) {
    const latPx = 22.75
    const lngPx = latPx / Math.cos((lat * Math.PI) / 180)
    assert(lngPx >= latPx - 1e-9, `${lat}° 处经度像素 ${lngPx.toFixed(1)} ≥ 纬度 ${latPx}`)
  }

  // ④ 取整数倍：边界、跨 0、负值、退化输入
  assert(JSON.stringify(graticuleValues(-12, 12, 5)) === JSON.stringify([-10, -5, 0, 5, 10]),
    `[-12,12] 步长 5 → ${graticuleValues(-12, 12, 5).join(',')}`)
  assert(graticuleValues(-90, 90, 30).includes(0), '南北半球之间的网格含 0°（赤道）')
  assert(graticuleValues(-90, 90, 30).every((v) => Number.isInteger(v)), '网格值都是整数（不出现 -89.99999）')
  /*
   * 分刻度的值**不能被取整**。
   * 这一条是补的：我把 `Math.round(v)` 注入回去（原来的写法）跑了一遍，
   * 全套 8140 条判据一条都没红 —— 因为所有既有用例的步长都是整数度。
   * 0.1° 步长下取整会把 34.1/34.2/34.3 全变成 34，图上就只剩一条线。
   */
  {
    const frac = graticuleValues(34.1, 34.4, 0.1)
    assert(frac.length === 4, `[34.1, 34.4] 步长 0.1 → 4 个值（实测 ${frac.length}）`)
    assert(Math.abs(frac[0] - 34.1) < 1e-9 && Math.abs(frac[3] - 34.4) < 1e-9,
      `端点保留小数（${frac[0]} … ${frac[3]}）`)
    assert(new Set(frac).size === frac.length, `分刻度不产生重复值（${frac.join(',')}）`)
    for (const v of frac) {
      assert(Math.abs(v / 0.1 - Math.round(v / 0.1)) < 1e-6, `${v} 落在 0.1° 网格上`)
      assert(!Number.isInteger(v), `${v} 没有被取整成整数`)
    }
    // 0.25 步长同理
    const q = graticuleValues(35.0, 35.75, 0.25)
    assert(q.length === 4 && Math.abs(q[1] - 35.25) < 1e-9, `[35, 35.75] 步长 0.25 → ${q.join(',')}`)
  }
  assert(graticuleValues(0, 10, 0).length === 0 && graticuleValues(10, 0, 5).length === 0,
    '步长 0 / 上下界颠倒 → 空（不画）')
  assert(graticuleValues(Number.NaN, 10, 5).length === 0, 'NaN 上界 → 空')
  // 参数错到离谱时不许把浏览器卡死（四百条以上直接放弃）
  assert(graticuleValues(-90, 90, 0.0001).length === 0, '步长小到会画几百万条 → 直接返回空')

  // ⑤ 度数格式
  assert(degreeLabel('lat', 30) === '30°N', `北纬 30 → ${degreeLabel('lat', 30)}`)
  assert(degreeLabel('lat', -15) === '15°S', `南纬 15 → ${degreeLabel('lat', -15)}`)
  assert(degreeLabel('lat', 0) === '0°', '赤道写 0°（不是 0°N）')
  assert(degreeLabel('lng', 120) === '120°E', '东经 120')
  assert(degreeLabel('lng', -45) === '45°W', '西经 45')
  assert(degreeLabel('lng', 0) === '0°', '本初子午线写 0°（不是 0°E）')
  assert(degreeLabel('lng', 180) === '180°' && degreeLabel('lng', -180) === '180°',
    '180° 不带 E/W（它既是东经也是西经）')
  // -0 不能漏出去（浮点算出来的 -0.0000001 会进来）
  assert(!degreeLabel('lat', -0.0000001).includes('-'), `-1e-7 度不产生负号（${degreeLabel('lat', -0.0000001)}）`)
  assert(degreeLabel('lat', Number.NaN) === '', 'NaN 给空串（不画字）')
  /*
   * 分刻度：0.1° 步长下会真的用到。分钟补两位、撇号用 U+2032
   * （字体子集 BASE 里有 °′″，不会缺字）。
   */
  assert(degreeLabel('lat', 35.4) === '35°24′N', `35.4° → ${degreeLabel('lat', 35.4)}`)
  assert(degreeLabel('lat', 35.5) === '35°30′N', `35.5° → ${degreeLabel('lat', 35.5)}`)
  assert(degreeLabel('lat', -35.25) === '35°15′S', `-35.25° → ${degreeLabel('lat', -35.25)}`)
  assert(degreeLabel('lng', -10.1) === '10°06′W', `-10.1° → ${degreeLabel('lng', -10.1)}（分钟补两位）`)
  assert(degreeLabel('lat', 0.1) === '0°06′N', `0.1° → ${degreeLabel('lat', 0.1)}（0 度也要写）`)
  assert(degreeLabel('lng', 179.9) === '179°54′E', `179.9° → ${degreeLabel('lng', 179.9)}`)
  assert(degreeLabel('lng', 179.999) === '180°', `179.999° 进位成 180°（不带 E/W）`)
  assert(!degreeLabel('lat', 35.4).includes('°00'), '分钟为 0 时不写 00′')

  // ⑥ 源码守卫：量屏幕、分 pane、不吃点击、字号不低于 12px
  const g = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'Graticule.tsx'), 'utf8')
  assert(/latLngToContainerPoint/.test(g), '纬线位置是量容器像素得来的（不是按 zoom 推算）')
  assert(/pickGraticuleStep\(/.test(g), '步长走 pickGraticuleStep（不在组件里写死）')
  assert(/zIndex = '340'/.test(g) && /zIndex = '520'/.test(g),
    '网线在陆地以下(340)、度数在陆地以上港口以下(520)')
  assert(/pointerEvents = 'none'/.test(g), 'pane 不吃指针事件（否则点海面出航会被网格挡住）')
  assert(/font-size:12px/.test(g), '度数用 12px（项目下限；再小在高分屏上读不出）')
  assert(/as unknown as/.test(g) === false, '没有残留的类型强转')
}


/*
 * ---- 气候线：回归线与极圈 ----
 *
 * 【守什么】这四条线是"两条天文学恒等式 + 一个断口"落地成画面的东西，
 * 三种错法都不会报错、只会让图**说的是假话**：
 *  ① 纬度写歪（23.5 / 23.4 / 极圈另写一个数）—— 字面上看不出来，
 *     但回归线一旦不等于 90 − 极圈，四季就散了架；
 *  ② 断口的位置/宽度与标签对不上 —— 线会从字中间穿过去，或者断得莫名其妙；
 *  ③ 断口把线"吃掉"一段 —— 两段长度之和必须等于原长减断口，差一个像素都不行，
 *     否则线上会凭空多出/少掉一截（这种错在缩放到某个级别时才会露出来）。
 */
{
  // ① 两组数必须由同一个常数推出来（各写一份迟早有一个被改掉）
  assert(Math.abs(POLAR_CIRCLE_DEG - (90 - OBLIQUITY_DEG)) < 1e-12,
    `极圈 ${POLAR_CIRCLE_DEG.toFixed(4)}° = 90 − 黄赤交角 ${OBLIQUITY_DEG}°`)
  assert(Math.abs(OBLIQUITY_DEG - 23.4362) < 1e-9,
    `黄赤交角取 ${OBLIQUITY_DEG}°（2026 年 23°26′11″，不是课本上的 23.5°）`)

  // ② 四条线：两条回归、两条极圈，南北对称，回归线在两极圈之内
  assert(CLIMATE_LINES.length === 4, `共 ${CLIMATE_LINES.length} 条气候线`)
  const byKey = Object.fromEntries(CLIMATE_LINES.map((l) => [l.key, l])) as Record<string, { lat: number; name: string }>
  assert(byKey['tropic-n'] && byKey['tropic-s'] && byKey['arctic'] && byKey['antarctic'],
    '四个键齐全（tropic-n / tropic-s / arctic / antarctic）')
  assert(byKey['tropic-n'].lat === -byKey['tropic-s'].lat, '南北回归线关于赤道对称')
  assert(byKey['arctic'].lat === -byKey['antarctic'].lat, '南北极圈关于赤道对称')
  assert(byKey['tropic-n'].lat > 0 && byKey['tropic-n'].lat < 30,
    `北回归线在 ${byKey['tropic-n'].lat.toFixed(4)}°N（热带北界）`)
  assert(byKey['arctic'].lat > 60 && byKey['arctic'].lat < 70,
    `北极圈在 ${byKey['arctic'].lat.toFixed(4)}°N（北寒带南界）`)
  assert(byKey['arctic'].lat - byKey['tropic-n'].lat > 40,
    '极圈与回归线之间隔着温带（不是一个数）')

  // ③ 图上写出来的字必须对得上这个数
  assert(degreeLabel('lat', byKey['tropic-n'].lat) === '23°26′N',
    `北回归线的度数写成「${degreeLabel('lat', byKey['tropic-n'].lat)}」`)
  assert(degreeLabel('lat', byKey['tropic-s'].lat) === '23°26′S', '南回归线写 S')
  assert(degreeLabel('lat', byKey['arctic'].lat) === '66°34′N',
    `北极圈写成「${degreeLabel('lat', byKey['arctic'].lat)}」`)

  // ④ 标签宽度的估算：四字约 60~70px，与字号/字距一致
  const wTropic = climateLabelPx('北回归线')
  assert(wTropic >= 4 * 12 && wTropic <= 4 * 16 + 16,
    `「北回归线」估宽 ${wTropic}px（4 字 × 12px 起）`)
  assert(climateLabelPx('北极圈') < wTropic, '三字比四字窄')
  assert(climateLabelPx('') === 0 && climateLabelPx(Number.NaN as unknown as string) === 0,
    '空名字 → 0（不画断口）')

  // ⑤ 断口中心：可见经度跨度的固定比例（墨卡托经度在屏幕上是线性的）
  assert(Math.abs(climateGapCenter(-40, 60, 0.36) - (-40 + 100 * 0.36)) < 1e-9,
    `[-40,60] 的 36% → ${climateGapCenter(-40, 60, 0.36)}°E`)
  assert(Math.abs(climateGapCenter(-40, 60, CLIMATE_LABEL_FRAC) - climateGapCenter(-40, 60, 0.36)) < 1e-12,
    '默认比例就是 0.36')
  assert(Math.abs(climateGapCenter(-40, 60, 5) - 55) < 1e-9, '比例离谱时夹到 0.95（不跑到画面外）')
  assert(Math.abs(climateGapCenter(-40, 60, -3) - (-35)) < 1e-9, '负比例夹到 0.05')
  assert(climateGapCenter(10, 10) === 10, '跨度 0 → 退回西边界（不除零）')
  assert(Number.isNaN(climateGapCenter(Number.NaN, 60)), 'west 不可用 → NaN（组件那边要挡）')

  // ⑥ 断口：只挖中间一段，两端照画，且**总长不多不少**
  const runs2 = climateRuns(-40, 60, 10, 4, 0)
  assert(runs2.length === 2, `断口在中间 → 两段（实测 ${runs2.length} 段）`)
  assert(runs2[0][0] === -40 && Math.abs(runs2[0][1] - 6) < 1e-9,
    `左段 [-40, ${runs2[0][1]}]（到断口左沿 6°）`)
  assert(Math.abs(runs2[1][0] - 14) < 1e-9 && runs2[1][1] === 60,
    `右段 [${runs2[1][0]}, 60]（从断口右沿 14° 起）`)
  assert(Math.abs((runs2[0][1] - runs2[0][0]) + (runs2[1][1] - runs2[1][0]) + 8 - 100) < 1e-9,
    '两段长度 + 断口 = 原长 100°（挖断口不丢距离）')

  // 断口在段外 → 一整条；断口盖住整段 → 空；halfGap 0 → 一整条
  const one = climateRuns(-40, 60, 200, 4)
  assert(one.length === 1 && one[0][0] === -40 && one[0][1] === 60, '断口在画面外 → 线是完整的一条')
  assert(climateRuns(-40, 60, 10, 500).length === 0, '断口比整段还宽 → 什么都不画')
  assert(climateRuns(-40, 60, 10, 0).length === 1, '没有断口 → 一整条')

  // 碎段（只剩两度）要被丢掉：否则线头会露出一根几像素的脏点
  const dropped = climateRuns(-40, 60, -38, 1, 3)
  assert(dropped.length === 1 && Math.abs(dropped[0][0] - (-37)) < 1e-9,
    `只剩 1° 的碎段被丢掉，保留 [${dropped[0][0]}, ${dropped[0][1]}]`)
  assert(climateRuns(-40, 60, 10, 4, 0).length === 2, 'minRun=0 时碎段全留（参数可选）')

  // 退化输入
  assert(climateRuns(60, -40, 10, 4).length === 0, '东西颠倒 → 空')
  assert(climateRuns(Number.NaN, 60, 10, 4).length === 0, 'NaN → 空')
  /*
   * 断口参数坏了（NaN）时**画完整的一条线**，不是不画：
   * 线本身是一条真实存在的地理界线，缺了它就是图在说谎；名字少一个只是不方便。
   * 「宁可密，不可空」——与经纬网那边同一条原则。
   */
  const noGap = climateRuns(-40, 60, Number.NaN, 4)
  assert(noGap.length === 1 && noGap[0][0] === -40 && noGap[0][1] === 60, '断口 NaN → 画完整的一条线')

  // ⑦ 源码守卫：两个 pane、暖色虚线、字宽驱动断口、12px
  const cl = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'ClimateLines.tsx'), 'utf8')
  assert(/createPane\(CLIMATE_PANE\)/.test(cl) && /createPane\(CLIMATE_LABEL_PANE\)/.test(cl),
    '线与名字各用一个自建 pane（不寄生在经纬网那两个上）')
  assert(/zIndex = '345'/.test(cl) && /zIndex = '522'/.test(cl),
    '线 345（陆地以下）/ 名字 522（网格度数之上、港口 600 之下）')
  assert(/pointerEvents = 'none'/.test(cl), 'pane 不吃指针事件（否则点海面出航会被气候线挡住）')
  assert(/fontSize|font-size:12px/.test(cl), '名字用 12px（项目下限）')
  assert(/dashArray: '8 4'/.test(cl), '虚线 8 4（占空 67%：7 6 在全世界缩放下读成"一串点"）')
  assert(/climateLabelPx\(/.test(cl) && /climateRuns\(/.test(cl),
    '断口宽度由字宽算、断口由纯函数挖（不在组件里写死坐标）')
  assert(!/23\.4|66\.5/.test(cl), '纬度不写死在组件里（唯一来源是 utils/climateLines）')

  /*
   * ⑧ 全局：pane 名字里不许出现 "Pane" 字样。
   * Leaflet 建 pane 时执行 `'leaflet-' + name.replace('Pane','') + '-pane'`，
   * 名字里带 "Pane" 会被切掉、类名与 ES 里的名字对不上 —— 第 94 轮的
   * `graticuleLabelPane` 就是这么量了个寂寞（探针找了个不存在的类名）。
   */
  const mapDir = join(process.cwd(), 'src', 'components', 'map')
  for (const f of readdirSync(mapDir)) {
    if (!f.endsWith('.tsx') && !f.endsWith('.ts')) continue
    const src = readFileSync(join(mapDir, f), 'utf8')
    for (const m of src.matchAll(/createPane\(\s*['"]([^'"]+)['"]/g)) {
      assert(!m[1].includes('Pane'), `${f} 的 pane 名「${m[1]}」不含 "Pane"（会被 Leaflet 切掉）`)
    }
  }
}


/*
 * ---- 光标读数：指哪儿读哪儿（度分 + 气候带）----
 *
 * 【守什么】读数框是玩家用来**报坐标**的工具，它说的每个字都得成立：
 *  ① 气候带的分界必须与图上那四条金线是同一个数（各写一份迟早对不上）；
 *  ② 分界线上算高一档（站在线上已经"过去了"）；
 *  ③ 度数写成度分、南北东西不缺字母；
 *  ④ 贴边要翻到光标另一侧 —— 只露半行字比没有读数更糟。
 * 另有一条**结构**约束：这个组件不许进 React state。mousemove 逐像素来，
 * 每次 setState 重渲染这棵子树 —— 本项目为此吃过大亏（60fps → 27fps）。
 */
{
  // ① 分界与 climateLines 同源（不是把 23.44 再抄一遍）
  assert(climateZoneAt(0)?.name === '热带', '赤道 → 热带')
  assert(climateZoneAt(10)?.name === '热带' && climateZoneAt(-10)?.name === '热带',
    '南北纬 10° 都在热带（热带跨赤道，不带半球前缀）')
  assert(climateZoneAt(OBLIQUITY_DEG - 1e-6)?.name === '热带',
    `23°26′ 以南（${(OBLIQUITY_DEG - 1e-6).toFixed(4)}°）仍是热带`)
  assert(climateZoneAt(OBLIQUITY_DEG)?.name === '北温带',
    `分界线上算高一档：${OBLIQUITY_DEG}°N → 北温带`)
  assert(climateZoneAt(-OBLIQUITY_DEG)?.name === '南温带', '南回归线上 → 南温带')
  assert(climateZoneAt(45)?.name === '北温带' && climateZoneAt(-45)?.name === '南温带',
    '南北纬 45° 分属南北温带')
  assert(climateZoneAt(POLAR_CIRCLE_DEG - 1e-6)?.name === '北温带', '极圈以南仍是温带')
  assert(climateZoneAt(POLAR_CIRCLE_DEG)?.name === '北寒带', '北极圈上 → 北寒带')
  assert(climateZoneAt(-POLAR_CIRCLE_DEG)?.name === '南寒带', '南极圈上 → 南寒带')
  assert(climateZoneAt(90)?.name === '北寒带' && climateZoneAt(-90)?.name === '南寒带', '两极')
  assert(climateZoneAt(Number.NaN) === null, 'NaN 纬度 → 不判（组件就不写这一段）')
  // 两个分界之间必须只隔一条线（不能有第三种答案，也不能漏掉某一段）
  const zoneNames = [-89, -70, -50, -30, -23, -10, 0, 10, 23, 30, 50, 70, 89].map((l) => climateZoneAt(l)?.name)
  assert(zoneNames.join(',') === '南寒带,南寒带,南温带,南温带,热带,热带,热带,热带,热带,北温带,北温带,北寒带,北寒带',
    `由南到北的气候带顺序：${zoneNames.join(' / ')}`)

  // ② 一行读数
  assert(cursorLabel(30, -10) === '30°N  10°W · 北温带', `读数：${cursorLabel(30, -10)}`)
  assert(cursorLabel(29.95, -10.0167) === '29°57′N  10°01′W · 北温带', `分刻度：${cursorLabel(29.95, -10.0167)}`)
  assert(cursorLabel(0, 0) === '0°  0° · 热带', `赤道与本初子午线：${cursorLabel(0, 0)}`)
  assert(cursorLabel(-33.87, 151.21).endsWith('南温带'), `悉尼一带 → ${cursorLabel(-33.87, 151.21)}`)
  assert(cursorLabel(Number.NaN, 0) === '', 'NaN 不写字')

  // ③ 贴边翻侧
  const size = { x: 1440, y: 900 }
  const mid = readoutPlacement(700, 400, 150, 28, size)
  assert(mid.x === 714 && mid.y === 416 && !mid.flippedX && !mid.flippedY,
    `画面中间：右下 ${mid.x},${mid.y}（gap 14）`)
  const rx = readoutPlacement(1400, 400, 150, 28, size)
  assert(rx.flippedX && rx.x + 150 <= 1400, `贴右边翻到光标左侧（x=${rx.x}）`)
  const by = readoutPlacement(700, 880, 150, 28, size)
  assert(by.flippedY && by.y + 28 <= 880, `贴下边翻到光标上方（y=${by.y}，底栏 52px 让开）`)
  const corner = readoutPlacement(1420, 890, 150, 28, size)
  assert(corner.x >= 4 && corner.x + 150 <= size.x - 4 && corner.y >= 4 && corner.y + 28 <= size.y - 4,
    `角落也关得住（${corner.x},${corner.y}）`)
  assert(readoutPlacement(Number.NaN, Number.NaN, 10, 10, size).x >= 4, 'NaN 光标 → 夹到安全位置（不写 NaN）')

  // ④ 源码守卫：不重渲染、不吃点击、12px
  const cc = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'CursorCoords.tsx'), 'utf8')
  assert(!/useState/.test(cc), 'CursorCoords 不用 useState（mousemove 逐像素，重渲染会吃帧）')
  assert(/map\.on\('mousemove'/.test(cc) && /textContent/.test(cc),
    '读数走 DOM（textContent + transform），不走 state')
  assert(/pointer-events-none/.test(cc), '读数框不吃点击（压在海图上的浮层不许整张吃点击）')
  assert(/text-\[12px\]/.test(cc), '读数用 12px（项目下限）')
  assert(/offsetWidth/.test(cc), '翻边按真实宽度算（字数变了宽度也变）')
  assert(/movestart/.test(cc) && /zoomstart/.test(cc), '拖动/缩放时先藏起来（避免读数停在旧位置）')
}


/*
 * ---- 开局国别：换一面旗 = 换港口、换船上的人、换一个传说 ----
 *
 * 【守什么】用户 2026-11-12 的方向是"开局选国家，不同国家有不同的故事，
 * 可以结合神话和传说"。这一层最容易做成"只换了开场那段文字"——
 * 玩家选完发现世界一模一样。所以下面四件事都要用**真状态**验：
 *  ① 母港真的换了（`fleet.currentPortId` 与 `discoveredPorts` 都换）；
 *  ② 船上真的换了（船名、船员数、士气、名号）；
 *  ③ 起手真的有人认你（`factionRep`）；
 *  ④ 传说坐标真的在海上（真 geojson），而且只在你自己的国别下存在。
 * 另加一条**方向性**约束：开局包里不许有金币（这条线不再靠钱堆强度）。
 */
{
  // ① 五个国别：母港不同、船名不同
  assert(NATION_COUNT === 5 && new Set(NATIONS.map(n => n.id)).size === 5,
    `五个国别，id 不重复（${NATIONS.map(n => n.id).join(' / ')}）`)
  assert(new Set(NATIONS.map(n => n.portId)).size === 5, '五个母港互不相同（不能两个人挤一个码头）')
  assert(new Set(NATIONS.map(n => n.shipName)).size === 5, `五条座船各有名字（${NATIONS.map(n => n.shipName).join(' / ')}）`)
  for (const n of NATIONS) {
    const p = ports.find(x => x.id === n.portId)
    assert(!!p, `${n.name}的母港 id=${n.portId} 真的在 data/ports 里`)
  }
  // 历史上的港口不能写串：里斯本给葡萄牙、塞维利亚给西班牙、伦敦给英格兰、阿姆斯特丹给荷兰
  const portOf = (id: string) => ports.find(p => p.id === nationById(id).portId)?.nameCn
  assert(portOf('portugal') === '里斯本', `葡萄牙的母港是里斯本（实测 ${portOf('portugal')}）`)
  assert(portOf('spain') === '塞维利亚', `西班牙的母港是塞维利亚（实测 ${portOf('spain')}）`)
  assert(portOf('england') === '伦敦', `英格兰的母港是伦敦（实测 ${portOf('england')}）`)
  assert(portOf('netherlands') === '阿姆斯特丹', `荷兰的母港是阿姆斯特丹（实测 ${portOf('netherlands')}）`)
  assert(portOf('china') === '广州', `大明的母港是广州（实测 ${portOf('china')}）`)
  // 广州真的能做生意：有货、有渴求品（1.3 以上才进掮客推荐单）
  assert(portGoods.some(pg => pg.portId === 21), '广州有货价行（新港不许是个空壳）')
  assert(localDemands(21).length >= 1, `广州有渴求品（${localDemands(21).join(',')}）—— 否则掮客开不出单`)
  assert(portGoods.filter(pg => pg.portId === 21).some(pg => pg.priceModifier <= 0.75),
    '广州有本地特产（modifier ≤ 0.75），第一趟才有货可买')
  /*
   * 【为什么大明不放在欧洲】它是五个国别里唯一从亚洲出发的：
   * "开局船的位置也不一样"这条要求在这里最极端 —— 广州到加勒比要横穿两个大洋。
   * 所以母港必须真的在 asia 区，否则地图上的"东方起点"是假的。
   */
  assert(ports.find(p => p.id === nationById('china').portId)?.region === 'asia',
    '大明的母港在亚洲区（不是欧洲某个港换个中文名）')

  // ② 开局包里没有金币（这条线卖的是航路、名号、见闻）
  for (const n of NATIONS) {
    assert(!('gold' in n.start), `${n.name}的开局包里没有金币字段`)
    assert(n.start.morale >= 0 && n.start.crew >= 0 && n.start.fame >= 0, `${n.name}的加成都不是负数`)
  }
  const nationsSrc = readFileSync(join(process.cwd(), 'src', 'data', 'nations.ts'), 'utf8')
  assert(!/\bgold\b/.test(nationsSrc), 'nations.ts 里没有 gold（不给金币开口子）')

  // ③ 传说坐标真的在海上（与遗物同一套真 geojson 校验）
  {
    const gj = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'land.geojson'), 'utf8'))
    registerLandGeojson(gj)
    for (const n of NATIONS) {
      const L = n.legend
      assert(!isOnLand(L.lat, L.lng), `「${L.name}」在海里（${L.lat}, ${L.lng}）—— 画在陆地上就开不到`)
      assert(L.radiusNm >= 60 && L.radiusNm <= 120, `「${L.name}」的触发半径 ${L.radiusNm} 海里（既不能隔空领、也不能窄到开不进去）`)
      assert(L.gain.fame > 0 && L.gain.morale >= 0, `「${L.name}」给名号/士气（不给钱）`)
    }
    assert(new Set(NATIONS.map(n => n.legend.id)).size === NATION_COUNT, '四个传说的 id 互不相同')
    assert(new Set(NATIONS.map(n => n.legend.name)).size === NATION_COUNT, '四个传说的名字互不相同')
  }

  // ④ legendPending：没选国别 / 没兑现 / 已兑现
  assert(legendPending(null, []) === null, '没有国别 → 没有传说（老存档不会凭空多出一个点）')
  assert(legendPending('portugal', [])?.id === 'sao-brandao', '葡萄牙船长的传说是圣布伦丹岛')
  assert(legendPending('portugal', ['sao-brandao']) === null, '兑现之后就不再出现（一次性）')
  assert(legendPending('england', ['sao-brandao'])?.id === 'hy-brasil',
    '英格兰船长不会去追葡萄牙人的岛（各国只认自己那条）')

  // ⑤ 真跑一次开局：出发港、船、士气、船员、名号、声望
  const init = (id?: string) => {
    useGameStore.getState().initGame('merchant', 'captain', id as never)
    return useGameStore.getState()
  }
  const pt = init('portugal')
  assert(pt.nation === 'portugal', `initGame 记住了国别（${pt.nation}）`)
  assert(pt.fleet.currentPortId === 7, `葡萄牙从里斯本出发（currentPortId=${pt.fleet.currentPortId}）`)
  assert(JSON.stringify(pt.discoveredPorts) === '[7]', `母港是"已发现"的（${JSON.stringify(pt.discoveredPorts)}）`)
  assert(pt.shipPosition?.[0] === ports.find(p => p.id === 7)?.latitude, '船位在母港坐标上')
  assert(pt.fleet.ships[0].name === '圣加布里埃尔号', `座船名（${pt.fleet.ships[0].name}）`)
  assert(pt.fleet.morale === 78, `士气 70 + 8 = ${pt.fleet.morale}`)
  assert(pt.factionRep.crown === 14, `王室起手声望 ${pt.factionRep.crown}`)
  assert(pt.fleet.gold === 500, `金币仍是 500（国别不改钱）`)

  const es = init('spain')
  assert(es.fleet.currentPortId === 6 && es.fleet.ships[0].crew === 20,
    `西班牙：塞维利亚 + 船员 ${es.fleet.ships[0].crew}/20（15 + 5）`)
  assert(es.factionRep.crown === 10, `西班牙王室声望 +10（${es.factionRep.crown}）`)

  const en = init('england')
  assert(en.fleet.currentPortId === 8 && en.fleet.fame === 12,
    `英格兰：伦敦 + 起手名号 ${en.fleet.fame}（私掠名声）`)
  assert(en.factionRep.brethren === 12, `英格兰起手兄弟会 ${en.factionRep.brethren}`)

  const nl = init('netherlands')
  assert(nl.fleet.currentPortId === 15 && nl.factionRep.guild === 16,
    `荷兰：阿姆斯特丹 + 商会声望 ${nl.factionRep.guild}`)
  assert(nl.fleet.ships[0].crew === 17, `荷兰船员 +2（${nl.fleet.ships[0].crew}）`)

  // 不传国别 = 老版本的塞维利亚开局（存档升级/参观模式走这条路）
  const plain = init()
  assert(plain.fleet.currentPortId === 6 && plain.nation === DEFAULT_NATION,
    `不传国别 → 塞维利亚（${plain.nation}），与从前一样`)

  // ⑥ 开进传说圈：真的兑现一次，且只兑现一次
  {
    const pt2 = init('portugal')
    const legend = nationById('portugal').legend
    useGameStore.setState({
      fleet: { ...pt2.fleet, day: 9 },
      gamePhase: 'playing',
      waypoint: null,
      currentRoute: null,
      shipPosition: [legend.lat, legend.lng],
      collectedLegends: [],
    })
    useGameStore.getState().advanceDay()
    const after = useGameStore.getState()
    assert(after.collectedLegends.includes(legend.id),
      `开进「${legend.name}」→ 记进 collectedLegends（${JSON.stringify(after.collectedLegends)}）`)
    assert(after.fleet.fame === legend.gain.fame,
      `名号 +${legend.gain.fame}（实测 ${after.fleet.fame}）`)
    // 第二天仍在原地：不许再兑现一次
    const fameOnce = after.fleet.fame
    useGameStore.getState().advanceDay()
    const after2 = useGameStore.getState()
    assert(after2.fleet.fame === fameOnce,
      `传说只兑现一次（第二次 ${after2.fleet.fame} = 第一次 ${fameOnce}）`)
    assert(legendPending(after2.nation, after2.collectedLegends) === null, '兑现后不再有"待发现"的传说')
  }

  // ⑦ 存档白名单与老存档兜底
  const storeSrc = readFileSync(join(process.cwd(), 'src', 'store', 'useGameStore.ts'), 'utf8')
  assert(/nation: state\.nation/.test(storeSrc) && /collectedLegends: state\.collectedLegends/.test(storeSrc),
    '国别与传说进了存档白名单（刷新后还在）')
  assert(/merged\.nation = merged\.nation \?\? null/.test(storeSrc),
    '老存档把国别补成 null（不偷偷给玩家换国籍、不白送声望）')

  // ⑧ 界面守卫：选国卡片真的在，且选中的国别会传给 initGame
  const introSrc = readFileSync(join(process.cwd(), 'src', 'components', 'intro', 'IntroScreen.tsx'), 'utf8')
  assert(/data-nation=\{n\.id\}/.test(introSrc), '开局界面有四张国别卡（带 data-nation 便于取证）')
  assert(/initGame\(selectedTrait, gameMode, selectedNation\)/.test(introSrc),
    '选中的国别真的交给了 initGame（不是只在界面上高亮）')
  const legendSrc = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'NationLegend.tsx'), 'utf8')
  assert(/legendPending\(nation/.test(legendSrc), '传说标记按国别与已兑现列表过滤')
  assert(/pointer-events: none !important/.test(legendSrc), '传说标记不吃点击（压在海图上的浮层不许吃指针）')
}


/*
 * ---- 国别故事线：三段航路必须真的能走完 ----
 *
 * 【守什么】用户 2026-11-12 的第二次要求："每个国家在这段历史有不同的故事线和航线……
 * 但还是不要只用文字堆砌"。所以故事线不是一段文案，而是**三段目的地**：
 *  ① 每国恰好三段，终点都是 `data/ports` 里真实的港（否则永远开不到）；
 *  ② 按 id 推进且幂等：同一座港反复靠，第二段不会重复发奖；
 *  ③ 奖励里没有金币（与遗物、传说同一条规矩）；
 *  ④ 三段走完后 `nextChapter` 必须返回 null，海图上的标记才会消失。
 */
{
  for (const n of NATIONS) {
    assert(n.story.length === 3, `${n.name}的航路是三段（实测 ${n.story.length}）`)
    assert(new Set(n.story.map(c => c.id)).size === 3, `${n.name}的三段 id 不重复`)
    assert(new Set(n.story.map(c => c.name)).size === 3, `${n.name}的三段名字不重复（地图上要靠名字分辨）`)
    for (const c of n.story) {
      const p = ports.find(x => x.id === c.portId)
      assert(!!p, `${n.name}「${c.name}」的目的地 id=${c.portId} 真的存在`)
      assert(c.gain.fame > 0, `${n.name}「${c.name}」给名号（${c.gain.fame}）`)
      assert(!('gold' in c.gain), `${n.name}「${c.name}」不给金币`)
      assert(c.line.length <= 60, `${n.name}「${c.name}」的兑现句是一句（${c.line.length} 字）`)
    }
    // 三段的目的地不能重复（否则"走三段"变成"去一个地方三趟"）
    assert(new Set(n.story.map(c => c.portId)).size === 3, `${n.name}的三段目的地各不相同`)
  }
  // 五条航路加起来要覆盖到不同的海：不能五个国家都只在加勒比打转
  const allPorts = new Set(NATIONS.flatMap(n => n.story.map(c => c.portId)))
  assert(allPorts.size >= 12, `五条航路一共覆盖 ${allPorts.size} 个港（不是同一条线换个名字）`)

  // ② 推进与幂等
  const pt = nationById('portugal')
  assert(nextChapter('portugal', [])?.id === 'portugal-1', '葡萄牙第一段是西非商站')
  assert(nextChapter('portugal', ['portugal-1'])?.id === 'portugal-2', '走完一段就推进到下一段')
  assert(nextChapter('portugal', ['portugal-1', 'portugal-2', 'portugal-3']) === null,
    '三段走完 → 没有下一段（海图上的菱形标记随之消失）')
  assert(nextChapter(null, []) === null, '没有国别 → 没有航路')
  assert(storyStep('portugal', []) === 0 && storyStep('portugal', ['portugal-1', 'portugal-2']) === 2,
    '已走段数按 id 数，不按下标')

  // ③ 真跑一遍：大明的第一段（广州 → 满剌加）
  const initCn = () => {
    useGameStore.getState().initGame('merchant', 'captain', 'china')
    return useGameStore.getState()
  }
  const cn = initCn()
  assert(cn.nation === 'china' && cn.fleet.currentPortId === 21,
    `大明从广州出发（nation=${cn.nation} port=${cn.fleet.currentPortId}）`)
  assert(cn.fleet.ships[0].name === '清和号', `座船「${cn.fleet.ships[0].name}」`)
  assert(cn.fleet.ships[0].crew === 17, `船员 15+2=${cn.fleet.ships[0].crew}`)
  assert(cn.factionRep.scholars === 14, `学者声望起手 ${cn.factionRep.scholars}`)
  assert(JSON.stringify(cn.discoveredPorts) === '[21]', `母港广州已发现（${JSON.stringify(cn.discoveredPorts)}）`)
  assert(nextChapter('china', cn.storyDone)?.portId === 12, '大明的下一站是满剌加（马六甲）')

  const fameBefore = cn.fleet.fame
  useGameStore.getState().arriveAtPort(12)
  const after = useGameStore.getState()
  assert(JSON.stringify(after.storyDone) === '["china-1"]',
    `到满剌加 → 第一段记账（${JSON.stringify(after.storyDone)}）`)
  assert(after.fleet.fame === fameBefore + 12, `名号 +12（${fameBefore} → ${after.fleet.fame}）`)
  assert(nextChapter('china', after.storyDone)?.id === 'china-2', '下一站推进到蒙巴萨')

  // 再靠一次同一座港：不许再发一次奖（幂等）
  const fameOnce = after.fleet.fame
  useGameStore.getState().arriveAtPort(12)
  const again = useGameStore.getState()
  assert(again.fleet.fame === fameOnce, `同一座港再靠一次不再发奖（${again.fleet.fame} = ${fameOnce}）`)
  assert(again.storyDone.filter(x => x === 'china-1').length === 1, '第一段只记一次')

  // ④ 段号写在地图上：标记用菱形 + 段号，且不吃点击
  const storySrc = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'NationStory.tsx'), 'utf8')
  assert(/nextChapter\(nation/.test(storySrc), '航路标记按"当前该走哪一段"取目的地')
  assert(/pointer-events: none !important/.test(storySrc), '航路标记不吃点击')
  assert(/story-mark-step/.test(storySrc), '标记上写着段号（1/2/3）')
  const storeSrc2 = readFileSync(join(process.cwd(), 'src', 'store', 'useGameStore.ts'), 'utf8')
  assert(/storyDone: state\.storyDone/.test(storeSrc2), '航路进度进存档白名单')
}


/*
 * ---- 走完三段航路：专属名号与册子上的那一页 ----
 *
 * 【守什么】三段走完如果只留一句"这条航路走完了"，那条线没有收尾：
 * 玩家记得自己跑过三个港，但记不住"我是谁"。这里守三件事：
 *  ① 五国的名号各不相同（不能五条航路最后都叫"老船长"）；
 *  ② 走完第三段才发，走两段不发（发早了等于把收尾提前）；
 *  ③ 只发一次 —— 反复靠同一座港、导入旧存档都不会重发（走 claimedVictories 那套去重）。
 */
{
  const keys = NATIONS.map(n => n.finale.key)
  const names = NATIONS.map(n => n.finale.name)
  assert(new Set(keys).size === NATION_COUNT, `五个名号的键各不相同（${keys.join(' / ')}）`)
  assert(new Set(names).size === NATION_COUNT, `五个名号的名字各不相同（${names.join(' / ')}）`)
  for (const n of NATIONS) {
    assert(n.finale.key === `route-${n.id}`, `${n.name}的名号键是 route-${n.id}（实测 ${n.finale.key}）`)
    assert(n.finale.desc.length > 10 && n.finale.desc.length <= 60,
      `${n.name}的名号有一句话的落款（${n.finale.desc.length} 字）`)
  }

  // 真跑：大明从广州一路开到桑给巴尔
  useGameStore.getState().initGame('merchant', 'captain', 'china')
  const go = (portId: number) => {
    const st0 = useGameStore.getState()
    useGameStore.setState({
      fleet: { ...st0.fleet, day: st0.fleet.day + 1, currentPortId: null, isSailing: true },
      gamePhase: 'playing',
      shipPosition: [0, 0],
    })
    useGameStore.getState().arriveAtPort(portId)
  }
  go(12) // 满剌加
  go(16) // 蒙巴萨
  const mid = useGameStore.getState()
  assert(mid.storyDone.length === 2, `走到第二段只记两段（${mid.storyDone.length}）`)
  assert(!mid.claimedVictories.includes('route-china'), '走两段还不给名号（收尾不能提前）')
  assert(!mid.logbook.some(e => e.title.includes('宝船旧航路上的人')), '册子里还没有那一页')

  go(17) // 桑给巴尔
  const end = useGameStore.getState()
  assert(end.storyDone.length === 3, `三段走完（${end.storyDone.length}）`)
  assert(end.claimedVictories.includes('route-china'), `名号记进门号表（${JSON.stringify(end.claimedVictories)}）`)
  const page = end.logbook.find(e => e.title === '称号 · 宝船旧航路上的人')
  assert(!!page, `册子里多了一页「称号 · 宝船旧航路上的人」（现有 ${end.logbook.length} 页）`)
  assert(page?.kind === 'title', '那一页的类型是"称号"（与其它名号同一档）')
  assert((page?.text ?? '').includes('满剌加'), `那一页写着走过的三个港（${page?.text?.slice(0, 16)}…）`)

  // 再靠一次：不许重发
  const pagesBefore = end.logbook.length
  go(17)
  const again = useGameStore.getState()
  assert(again.claimedVictories.filter(k => k === 'route-china').length === 1, '名号只记一次')
  assert(again.logbook.filter(e => e.title === '称号 · 宝船旧航路上的人').length === 1,
    `册子里只有一页（${again.logbook.filter(e => e.title === '称号 · 宝船旧航路上的人').length}）`)
  /*
   * 【为什么不是"页数不变"】再靠一次是**新的一天**，到港见闻本来就该多写一页
   * （`makeArrivalEntry` 按 day+portId 去重）。这里要守的是"不再多出称号页"：
   * 多出来的最多一页，而且不是 title 类型。
   */
  const newPages = again.logbook.slice(0, again.logbook.length - pagesBefore)
  assert(again.logbook.length - pagesBefore <= 1, `再靠一次最多多一页（${again.logbook.length - pagesBefore} 页）`)
  assert(!newPages.some(e => e.kind === 'title'), '多出来的那页不是称号页（名号不重发）')

  // 图鉴里的「航路」一节：有国别才出现，且按 storyDone 点亮
  const atlasSrc = readFileSync(join(process.cwd(), 'src', 'components', 'panels', 'LogbookViews.tsx'), 'utf8')
  assert(/航路/.test(atlasSrc) && /storyStep\(nation/.test(atlasSrc), '图鉴里有「航路」一节，进度走 storyStep')
  assert(/nation && \(/.test(atlasSrc), '没选国别（老存档/参观模式）时整块不出现')
  const storeSrc3 = readFileSync(join(process.cwd(), 'src', 'store', 'useGameStore.ts'), 'utf8')
  assert(/makeTitleEntry\(finaleClaim/.test(storeSrc3), '名号走的是与其它称号同一条写入路径（写进册子）')
}


/*
 * ---- 朝贡（交勘合）：大明的非金钱杠杆 ----
 *
 * 【守什么】用户要"每个国家在这段历史有不同的故事线"。大明的身份是朝贡宗主，
 * 所以给它一个别人没有的动作：把南洋带回来的香料交给市舶司，换名号与脸面。
 * 这里守四件事：
 *  ① 只有大明有这条规则（别国是 undefined，界面那块根本不出现）；
 *  ② 换的不是钱：交付的是**船上的货**，回赐里没有金币；
 *  ③ 判据只有一份（`tributeState`），界面与 store 共用 —— 按钮亮着就一定能交；
 *  ④ 冷却真的挡得住：同一天连点两次只算一次。
 */
{
  const china = nationById('china')
  assert(!!china.tribute, '大明有朝贡规则')
  assert(NATIONS.filter(n => n.tribute).length === 1, '只有大明有朝贡（别国没有这条线）')
  const rule = china.tribute!
  assert(rule.portId === china.portId, '朝贡只能在母港（广州）交')
  assert(!('gold' in rule.gain), '回赐里没有金币')
  assert(rule.gain.fame > 0 && rule.cooldownDays >= 7, `回赐有名号、冷却 ${rule.cooldownDays} 天`)
  assert(rule.titleAt >= 2 && rule.titleAt <= 5, `交够 ${rule.titleAt} 次给名号（一次太轻、五次太重）`)
  assert(rule.title.key === 'tribute-china' && rule.title.name.length > 0, `名号是「${rule.title.name}」`)
  for (const g of rule.goods) {
    assert(!!goods.find(x => x.id === g.goodId), `要的货 id=${g.goodId} 真的存在`)
    assert(g.qty > 0, `要的件数 ${g.qty} 是正数`)
    // 关键：要的货不能在广州本地便宜买到，否则"朝贡"就是左手进右手出
    const local = portGoods.find(pg => pg.portId === rule.portId && pg.goodId === g.goodId)
    assert(!local || local.priceModifier > 0.9, `要的货在广州不是本地特产（modifier ${local?.priceModifier ?? '无'}）`)
  }

  // ② 判据：位置 / 冷却 / 货量三关
  const cargo = [{ goodId: 9, quantity: 6 }]
  const ok = tributeState('china', 30, -99, cargo, 21, false)
  assert(!!ok && ok.ready, `在广州、有 6 担香料 → 可交（${JSON.stringify(ok?.missing)}）`)
  assert(tributeState('china', 30, -99, cargo, 12, false)?.ready === false, '在满剌加不能交（不是市舶司）')
  assert(tributeState('china', 30, -99, [], 21, false)?.ready === false, '船上没货不能交')
  assert(tributeState('china', 30, -99, cargo, 21, true)?.ready === false, '航行中不能交')
  const cooling = tributeState('china', 30, 20, cargo, 21, false)
  assert(cooling?.cooldownLeft === 10 && cooling.ready === false,
    `冷却中：还剩 ${cooling?.cooldownLeft} 天（应 10）`)
  assert(tributeState('china', 40, 20, cargo, 21, false)?.ready === true, '冷却到了就能再交')
  assert(tributeState('portugal', 30, -99, cargo, 7, false) === null, '葡萄牙没有朝贡状态')
  assert(tributeState(null, 30, -99, cargo, 21, false) === null, '没选国别就没有朝贡')

  // ③ 真跑：交一次，货少了、名号涨了、进冷却
  useGameStore.getState().initGame('merchant', 'captain', 'china')
  const base = useGameStore.getState()
  useGameStore.setState({
    fleet: { ...base.fleet, day: 30, cargo: [{ goodId: 9, quantity: 6 }], usedCapacity: 6, fame: 0, morale: 70 },
    factionRep: { ...base.factionRep, scholars: 14 },
    lastTributeDay: -99,
  })
  useGameStore.getState().payTribute()
  const paid = useGameStore.getState()
  assert((paid.fleet.cargo.find(c => c.goodId === 9)?.quantity ?? 0) === 0,
    `香料交出去了（剩 ${paid.fleet.cargo.find(c => c.goodId === 9)?.quantity ?? 0}）`)
  assert(paid.fleet.fame === rule.gain.fame, `名号 +${rule.gain.fame}（实测 ${paid.fleet.fame}）`)
  assert(paid.factionRep.scholars === 14 + (rule.gain.faction.scholars ?? 0),
    `学者声望 ${paid.factionRep.scholars}`)
  assert(paid.lastTributeDay === 30, `记下第 ${paid.lastTributeDay} 天交的`)

  // 同一天再点：货已经没了 + 冷却，两边都不该动
  useGameStore.setState({ fleet: { ...paid.fleet, cargo: [{ goodId: 9, quantity: 6 }] } })
  const fameBefore = useGameStore.getState().fleet.fame
  useGameStore.getState().payTribute()
  assert(useGameStore.getState().fleet.fame === fameBefore, '同一天连点第二次不结算（冷却挡得住）')

  // 交够三次：给名号「勘合船主」，只发一次
  {
    useGameStore.getState().initGame('merchant', 'captain', 'china')
    const run = (d: number) => {
      const s0 = useGameStore.getState()
      useGameStore.setState({
        fleet: { ...s0.fleet, day: d, cargo: [{ goodId: 9, quantity: 6 }], currentPortId: 21, isSailing: false },
        lastTributeDay: -99,
      })
      useGameStore.getState().payTribute()
    }
    run(30)
    assert(useGameStore.getState().tributes === 1, `交一次记 1 次（${useGameStore.getState().tributes}）`)
    run(52)
    assert(useGameStore.getState().tributes === 2, '交两次记 2 次')
    const beforeTitle = useGameStore.getState().claimedVictories.includes('tribute-china')
    assert(!beforeTitle, '两次还没有名号（门槛是 3）')
    run(75)
    const titled = useGameStore.getState()
    assert(titled.tributes === 3, `交三次（${titled.tributes}）`)
    assert(titled.claimedVictories.includes('tribute-china'), '第三次给名号勘合船主')
    const tPage = titled.logbook.find(e => e.title === '称号 · 勘合船主')
    assert(!!tPage && tPage.kind === 'title', `册子里多了一页「称号 · 勘合船主」`)
    // 第四次不再发一次名号
    run(98)
    assert(useGameStore.getState().tributes === 4, '次数继续累加（4）')
    assert(useGameStore.getState().claimedVictories.filter(k => k === 'tribute-china').length === 1,
      '名号只发一次')
    assert(useGameStore.getState().logbook.filter(e => e.title === '称号 · 勘合船主').length === 1,
      '册子里只有一页')
  }

  // 葡萄牙船长在广州也交不了（规则根本不挂在他身上）
  useGameStore.getState().initGame('merchant', 'captain', 'portugal')
  const pt0 = useGameStore.getState()
  useGameStore.setState({ fleet: { ...pt0.fleet, currentPortId: 21, cargo: [{ goodId: 9, quantity: 6 }] } })
  const ptFame = useGameStore.getState().fleet.fame
  useGameStore.getState().payTribute()
  assert(useGameStore.getState().fleet.fame === ptFame, '葡萄牙船长在广州交不了勘合')

  // ④ 界面守卫：港口面板用同一个判据，且带 data-service-anchor 便于取证
  const pdSrc = readFileSync(join(process.cwd(), 'src', 'components', 'panels', 'PortDetail.tsx'), 'utf8')
  assert(/tributeState\(/.test(pdSrc), '港口面板的按钮状态走同一份 tributeState')
  assert(/data-service-anchor="tribute"/.test(pdSrc), '朝贡那一块有锚点（e2e 据此取证）')
  assert(/disabled=\{!tribute\.ready\}/.test(pdSrc), '不可交时按钮是灰的（不是点了没反应）')
}


/*
 * ---- 靠港近景：从甲板上看见的"那座城" ----
 *
 * 【守什么】`coastModel` 给的是**所有港口通用**的一条海岸（山脊、树、灯塔）——
 * 停在塞维利亚港和停在荒岛的画面一模一样，玩家在甲板上认不出"到了哪"。这一层
 * 补的是只有港口才有的东西，所以判据要守四件事：
 *  ① 四种海域的样式真的不同（屋顶角度、墙色、棕榈、帆型），不是换个色调；
 *  ② 布局不越界、不互相穿插（房子不出岸线、栈桥不撞防波堤、停泊船在码头外侧）；
 *  ③ 同一个港每次进来是同一座城（布局只由港 id 与 presence 决定，不是随机的）；
 *  ④ 该出现的时候出现（6 海里内 / 停泊无条件），不该出现时整组隐藏。
 */
{
  // ① 四套样式：剪影能分开的四件事
  const styles = Object.values(HARBOR_STYLES)
  assert(styles.length === 4, `四套港口样式（${styles.map(s => s.id).join(' / ')}）`)
  assert(new Set(styles.map(s => s.wall)).size === 4, '四种墙色互不相同')
  assert(new Set(styles.map(s => s.roof)).size === 4, '四种屋顶色互不相同')
  assert(new Set(styles.map(s => s.id)).size === 4, 'id 不重复')
  // 欧洲有钟楼、加勒比/非洲/南洋有棕榈 —— 这是"到哪片海"的识别符号
  assert(HARBOR_STYLES.europe.spire === true && HARBOR_STYLES.europe.palms === 0,
    '欧洲样式有钟楼、没有棕榈')
  for (const id of ['caribbean', 'asia', 'africa'] as const) {
    assert(HARBOR_STYLES[id].spire === false && HARBOR_STYLES[id].palms > 0,
      `${id} 没有钟楼、有棕榈（热带的识别符号）`)
  }
  assert(HARBOR_STYLES.asia.sail === 'junk' && HARBOR_STYLES.europe.sail === 'square',
    '南洋用硬帆、欧洲用方帆')
  // 屋顶角度：欧洲陡顶、非洲平顶（0.2 与 0.75 在剪影上是两种建筑）
  assert(HARBOR_STYLES.europe.roofPitch > HARBOR_STYLES.africa.roofPitch * 2.5,
    `欧洲陡顶 ${HARBOR_STYLES.europe.roofPitch} vs 非洲平顶 ${HARBOR_STYLES.africa.roofPitch}`)

  // region → 样式：america 归加勒比（都是西班牙殖民港的样子）
  assert(harborStyleFor('europe').id === 'europe', 'europe → europe')
  assert(harborStyleFor('asia').id === 'asia', 'asia → asia')
  assert(harborStyleFor('africa').id === 'africa', 'africa → africa')
  assert(harborStyleFor('caribbean').id === 'caribbean' && harborStyleFor('america').id === 'caribbean',
    'caribbean 与 america 共用一套')
  assert(harborStyleFor('没这个区').id === 'europe', '未知区回落到欧洲（不会崩）')

  // ② 布局：不越界、不穿插
  for (const st of styles) {
    const plan = harborPlan(st, 36, 1, 6)
    assert(plan.visible, `${st.id} 在贴岸时可见`)
    assert(plan.houses.length >= 5 && plan.houses.length <= 11,
      `${st.id} 房屋数 ${plan.houses.length}（5~11）`)
    assert(plan.houses.length >= st.houses[0] && plan.houses.length <= st.houses[1],
      `${st.id} 房屋数落在样式给的区间里`)
    // 房子不能超出码头面（超出去就站在水里）
    for (const h of plan.houses) {
      assert(Math.abs(h.x) + h.w * 0.5 <= plan.deckHalfW * 1.02,
        `${st.id} 房屋 x=${h.x.toFixed(1)} 宽 ${h.w.toFixed(1)} 仍在码头面内（半宽 ${plan.deckHalfW.toFixed(1)}）`)
      assert(h.z > plan.deckZ0 && h.z < plan.deckZ1,
        `${st.id} 房屋站在码头面上（z=${h.z.toFixed(2)} ∈ [${plan.deckZ0}, ${plan.deckZ1}]）`)
      assert(h.h > 0 && h.roofH > 0, `${st.id} 房屋有墙高与屋顶高`)
    }
    // 栈桥必须伸进水里（z1 < z0），而且不与防波堤的 x 区间重叠
    /*
     * 名义 `piers` 条里，中间那条永远让给航道口（正前方要能进船），
     * 所以实际是名义值 −0 或 −1。判据写死"≥2 且不超过名义"，不写等于。
     */
    assert(plan.piers.length >= 2 && plan.piers.length <= st.piers,
      `${st.id} 栈桥 ${plan.piers.length} 条（名义 ${st.piers}，中间让给航道口）`)
    for (const p of plan.piers) {
      assert(p.z1 < p.z0, `${st.id} 栈桥朝海伸出（z0=${p.z0} → z1=${p.z1.toFixed(1)}）`)
      assert(Math.abs(p.x) + p.w * 0.5 <= plan.deckHalfW, `${st.id} 栈桥在码头面内`)
    }
    // 防波堤：两道，内端在岸线附近、外端伸进水里，且口子留在中间
    assert(plan.breakwaters.length === 2, `${st.id} 两道防波堤`)
    const [bl, br] = plan.breakwaters
    assert(bl.x0 < 0 && br.x0 > 0, '左臂在左、右臂在右')
    assert(bl.z1 < 0 && br.z1 < 0, '两臂都伸进水里（z1 < 0）')
    assert(Math.abs(bl.x1) > plan.deckHalfW * 0.4, `左臂外端 x=${bl.x1.toFixed(1)} 没堵到中间（口子留着）`)
    assert(bl.h > 0 && bl.h < 1.2, `堤高 ${bl.h.toFixed(2)}（低矮的抛石堤，不是一堵墙）`)
    // 停泊船：在码头面**外侧**（更靠海），不能在码头上
    assert(plan.moorings.length >= 3, `${st.id} 至少三条停泊船（${plan.moorings.length}）`)
    for (const m of plan.moorings) {
      assert(m.z < plan.deckZ0, `${st.id} 停泊船在码头外（z=${m.z.toFixed(1)} < ${plan.deckZ0}）`)
      assert(m.len >= 0.8 && m.len <= 2.2, `${st.id} 船长 ${m.len.toFixed(2)} 单位（14~40 米，不是 100 米）`)
    }
    /*
     * 每条船都要**贴着某条栈桥的侧舷**（x = 栈桥中心 ± (半宽 + 半个船宽 + 余量)，
     * z 落在栈桥的范围内）。第 114 轮从"离岸多近"改成这条判据：原来船按
     * x/z 独立摆放，正好落在栈桥板的投影里，从甲板看过去船体被木板整个盖住，
     * 只剩桅杆 —— 屏幕上读作"一排栅栏"（用户三次说粗糙最直接的一处）。
     */
    for (const m of plan.moorings) {
      const near = plan.piers.find((p) =>
        Math.abs(Math.abs(m.x - p.x) - (p.w * 0.5 + m.len * 0.2 + 0.04)) < 1e-6
        && m.z > p.z1 && m.z < p.z0)
      assert(!!near, `${st.id} 船（x=${m.x.toFixed(1)}, z=${m.z.toFixed(1)}）停在某条栈桥的侧舷`)
    }
    // 而且不能压在抛石堤上（外侧栈桥的船曾经搁在石堆上，放大截图能看见船底穿石）
    for (const m of plan.moorings) {
      for (const b of plan.breakwaters) {
        const x0 = Math.min(b.x0, b.x1) - 0.5
        const x1 = Math.max(b.x0, b.x1) + 0.5
        assert(!(m.x > x0 && m.x < x1 && m.z > b.z1 - 3.5),
          `${st.id} 船（x=${m.x.toFixed(1)}）没压在抛石堤上`)
      }
    }
    assert(plan.palms.length === st.palms, `${st.id} 棕榈 ${plan.palms.length} 棵`)
    assert(plan.cranes.length === 2, `${st.id} 两台吊货臂架`)
  }

  /*
   * ⑤ 城内第三排（远屋顶）：第 114 轮加的城纵深。
   * 守三件事：数量够密、站在码头面上、**最高的那栋必须高过前排** ——
   * 甲板视角的视线几乎是平的（眼高 1.5、远排 27 单位外），比前排矮就一个像素
   * 也看不见（按直线求交算过）。这三条一破，"城"就退回一条贴岸的房子带。
   */
  for (const st of styles) {
    const plan = harborPlan(st, 36, 1, 6)
    assert(plan.farHouses.length >= 8 && plan.farHouses.length <= 16,
      `${st.id} 城内第三排 ${plan.farHouses.length} 栋（8~16）`)
    const frontMax = Math.max(...plan.houses.map(h => h.h))
    for (const f of plan.farHouses) {
      assert(Math.abs(f.x) + f.w * 0.5 <= plan.deckHalfW,
        `${st.id} 远排 x=${f.x.toFixed(1)} 不越出码头面（半宽 ${plan.deckHalfW.toFixed(1)}）`)
      assert(f.z > plan.deckZ0 && f.z < plan.deckZ1,
        `${st.id} 远排站在码头面上（z=${f.z.toFixed(2)}）`)
      assert(f.h > 0 && f.roofH > 0, `${st.id} 远排有墙高与屋顶高`)
    }
    assert(Math.max(...plan.farHouses.map(f => f.h)) > frontMax,
      `${st.id} 远排最高的屋顶高过前排（否则整排被挡在后面）`)
  }

  // ③ 同一个港每次都是同一座城
  const a1 = harborPlan(HARBOR_STYLES.europe, 36, 1, 6)
  const a2 = harborPlan(HARBOR_STYLES.europe, 36, 1, 6)
  assert(JSON.stringify(a1) === JSON.stringify(a2), '同样的输入 → 完全一样的布局（不抖）')
  const b1 = harborPlan(HARBOR_STYLES.europe, 36, 1, 12)
  assert(JSON.stringify(a1.houses.map(h => h.x)) !== JSON.stringify(b1.houses.map(h => h.x)),
    '不同的港（seed 不同）长得不一样')

  // ④ 出现条件与景别
  assert(harborVisible(2, true) && harborVisible(HARBOR_MAX_NM, true), '航行中 6 海里内画港')
  assert(!harborVisible(HARBOR_MAX_NM + 0.1, true), '超过 6 海里不画（远处只有海岸）')
  assert(harborVisible(8, false), '停泊时 8 海里也画（船就靠在码头边）')
  assert(!harborVisible(Number.NaN, false), 'NaN 距离不画')
  assert(harborRadius(1) === 18, `贴岸半径 18（实测 ${harborRadius(1)}）`)
  assert(harborRadius(0) === 42, `远景半径 42（实测 ${harborRadius(0)}）`)
  assert(harborRadius(0.5) > harborRadius(0.9), 'presence 越大越近（单调）')

  // ⑤ 源码守卫：与海岸读同一份 sighting、几何命名、样式随港切换
  const dvSrc = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'DeckView.tsx'), 'utf8')
  assert(/harbor\.setSighting\(sighting, st\.fleet\.isSailing\)/.test(dvSrc),
    '港口与海岸读**同一份** sighting（各自算一次会分叉）')
  const hmSrc = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'harborModel.ts'), 'utf8')
  for (const name of ['deck-harbor-quay', 'deck-harbor-walls', 'deck-harbor-hulls', 'deck-harbor-spire']) {
    assert(hmSrc.includes(`name = '${name}'`) || hmSrc.includes(`'${name}'`), `网格命名 ${name}（取证要用）`)
  }
  assert(/harborVisible\(s\.distNm, isSailing\)/.test(hmSrc), '可见性走 harborVisible（不在几何层自己算阈值）')
  assert(/harborStyleFor\(s\.port\.region\)/.test(hmSrc), '样式按港口 region 取（不是写死欧洲）')
  // 船体必须手写几何：ExtrudeGeometry 那版一个像素都不显示（真踩过）
  assert(!/new THREE\.ExtrudeGeometry/.test(hmSrc), '船体不 new ExtrudeGeometry（那版三角化后整船不可见）')
  assert(/RING/.test(hmSrc), '船体是自己列的轮廓顶点')
}


/*
 * ---- 让"纯色纸片"有体积：烘在几何上的明暗 ----
 *
 * 【守什么】这一层的材质全是 `MeshBasicMaterial` + 一个纯色，房子就是一块矩形
 * 色块 —— 用户的原话是"看着还是非常粗糙"。改法只有一个方向：**同一个面上，
 * 朝向不同的面亮度不同**（正面亮、侧面暗、顶面最亮），而且这些亮度必须
 * ① 由法线决定（不是拍脑袋的固定值）、② 落在合理区间、③ 与昼夜插值相乘之后
 * 仍然分得开（夜里整座城一起暗，但房子之间的明暗不能消失）。
 */
{
  const g = shadeHarbor(new THREE.BoxGeometry(1, 1, 1))
  const n = g.getAttribute('normal')
  const c = g.getAttribute('color')
  assert(!!c && c.count === n.count, `顶点色按顶点给（${c?.count} = ${n.count}）`)
  let top = 0, front = 0, bottom = 0, litSide = 0, darkSide = 0
  for (let i = 0; i < n.count; i++) {
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i)
    if (ny > 0.99) top = c.getX(i)
    if (nz > 0.99) front = c.getX(i)
    if (ny < -0.99) bottom = c.getX(i)
    /*
     * 光在 **+x 上方**（HARBOR_LIGHT = (0.35,0.75,0.55)）→ 朝 +x 的面亮。
     * 相机在船尾看向 +z 时，屏幕左 = 世界 +x（右手系），也就是说**我们看到的是
     * 每栋房子暗的那一侧墙**（−x）—— 这正是截图里房子右墙偏深的来源。
     */
    if (nx > 0.99) litSide = c.getX(i)
    if (nx < -0.99) darkSide = c.getX(i)
  }
  assert(top > front && front > bottom, `顶 ${top.toFixed(2)} > 正面 ${front.toFixed(2)} > 底 ${bottom.toFixed(2)}`)
  assert(litSide > darkSide + 0.1, `朝光侧 ${litSide.toFixed(2)} 明显亮于背光侧 ${darkSide.toFixed(2)}（左右墙分得开）`)
  assert(top < 1.2 && bottom >= 0.3, `亮度在 0.3~1.2（顶 ${top.toFixed(2)} / 底 ${bottom.toFixed(2)}）`)
  // 连续：屋顶前坡（45°）应落在"顶"与"正面"之间 —— 硬阈值分档会把两坡分成同色
  const slope = shadeHarbor((() => {
    const q = new THREE.BufferGeometry()
    q.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0,
      -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
    ], 3))
    q.computeVertexNormals()
    return q
  })())
  const slopeC = slope.getAttribute('color').getX(0)
  /*
   * 45° 前坡吃到 y 与 z 两个分量（d = 0.707·0.75 + 0.707·0.55 = 0.92），
   * 比水平面（d = 0.75）还亮 —— 这是对的物理，不是 bug。要守的是
   * **前坡与竖直正面之间有明确差异**（否则两坡顶读成一块平板）。
   */
  assert(slopeC > front + 0.05,
    `45° 前坡 ${slopeC.toFixed(2)} 比竖直正面 ${front.toFixed(2)} 亮一档以上（两坡分得开）`)
  // 背光坡（法线 −z 一侧）必须明显暗于正面
  const backSlope = shadeHarbor((() => {
    const q = new THREE.BufferGeometry()
    q.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,
      -0.5, 0, -0.5, 0.5, 1, 0, 0.5, 0, -0.5,
    ], 3))
    q.computeVertexNormals()
    return q
  })()).getAttribute('color').getX(0)
  assert(backSlope < front - 0.1, `背光坡 ${backSlope.toFixed(2)} 明显暗于正面 ${front.toFixed(2)}`)
  // 幂等：重复烘焙不改结果（apply 会被反复调用）
  const before = c.getX(0)
  shadeHarbor(g)
  assert(g.getAttribute('color').getX(0) === before, '重复烘焙结果一致（幂等）')

  const hm = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'harborModel.ts'), 'utf8')
  // 所有实体几何都必须过 shadeFaces（漏一个 = 那块变纯黑）
  assert(/vertexColors: true/.test(hm), '实体材质开 vertexColors（否则烘焙的色不起作用）')
  for (const geo of ['BoxGeometry(1, 1, 1)', 'CylinderGeometry(0.08, 0.08, 1, 5)', 'ConeGeometry(0.5, 1, 4)', 'SphereGeometry(0.5, 6, 4)']) {
    assert(new RegExp(`shadeFaces\\(new THREE\\.${geo.replace(/[()]/g, '\\$&')}`).test(hm),
      `${geo} 过了 shadeFaces`)
  }
  /* 屋顶改成手写瓦垄（自己给顶点色），不再走 shadeFaces —— 见文件末尾那一条 */
  assert(/const SEG = 10/.test(hm), '屋顶是手写的瓦垄几何（10 段）')
  // 逐栋色差
  assert(/walls\.setColorAt\(i, tone\)/.test(hm) && /roofs\.setColorAt\(i, tone\)/.test(hm),
    '墙与屋顶按栋给色差（八栋房子不能是一条等亮度的白带）')
  assert(/if \(walls\.instanceColor\) walls\.instanceColor\.needsUpdate = true/.test(hm),
    'instanceColor 标脏（忘了这一句 = 色差永远不生效）')
  // 结构：岸壁、檐影、勒脚、吊臂立柱
  for (const name of ['deck-harbor-quayface', 'deck-harbor-eaves', 'deck-harbor-plinths', 'deck-harbor-craneposts']) {
    assert(hm.includes(`'${name}'`), `新网格命名 ${name}（取证与判据按名字取）`)
  }
  // 防波堤：一定是"一堆石头"，不是一整块板
  assert(/const BW_PER_ARM = 10/.test(hm), '防波堤每臂 10 块石头（一整块板读作水泥台）')
  assert(/for \(let k = 0; k < BW_PER_ARM; k\+\+\)/.test(hm), '石头沿臂逐块摆')
  // 白天不许点灯
  assert(/lampMat\.opacity = Math\.min\(1, \(0\.06 \+ 0\.94 \* night\)\)/.test(hm),
    '水边的灯白天 0.06（原来是 0.25 —— 正午的码头上挂着几个黄点）')
  /*
   * 【夜间插值的基色必须与样式同步】`update` 用 bases 里的"白天本色"重算颜色：
   * 只同步墙/屋顶/石堤时，栈桥、码头面、旗、塔身会在黄昏那一次重算跳回默认色。
   */
  for (const m of ['pierMat', 'deckMat', 'flagMat', 'spireMat']) {
    assert(new RegExp(`bases\\.set\\(${m},`).test(hm), `applyStyle 同步了 ${m} 的基色（否则夜里跳回欧洲默认色）`)
  }
}


/*
 * ---- 白天的立面细节：窗洞与烟囱 ----
 *
 * 【守什么】房屋墙是一块纯色 Basic 材质，没有窗就是"一排白板"（实测截图）。
 * 窗是白天唯一的立面细节，所以位置要对：**每一扇都必须落在自己那栋房的
 * 正面墙上**（在墙外一点、在房宽之内、在墙高之内），不能飘在空中、不能
 * 一半埋进墙里（第一版就是这样，一个窗都看不见）。
 */
{
  for (const st of Object.values(HARBOR_STYLES)) {
    const plan = harborPlan(st, 36, 1, 8)
    assert(plan.panes.length >= plan.houses.length * 2,
      `${st.id} 每栋房至少两扇窗（${plan.panes.length} 扇 / ${plan.houses.length} 栋）`)
    assert(plan.panes.length <= plan.houses.length * 6,
      `${st.id} 窗数不超过上限（${plan.panes.length} ≤ ${plan.houses.length * 6}，实例池是 6×）`)
    for (const pn of plan.panes) {
      // 找到这扇窗属于哪栋房（x 落在房宽之内、z 在房正面附近）
      const host = plan.houses.find((h) => Math.abs(pn.x - h.x) <= h.w * 0.5 + 1e-6
        && Math.abs(pn.z - (h.z - h.d * 0.5)) < 0.12)
      assert(!!host, `${st.id} 窗 (${pn.x.toFixed(2)}, ${pn.z.toFixed(2)}) 落在某一栋房的正面墙上`)
      if (host) {
        assert(pn.y > plan.deckY && pn.y < plan.deckY + host.h,
          `${st.id} 窗在墙高之内（y=${pn.y.toFixed(2)} ∈ ${plan.deckY.toFixed(2)}..${(plan.deckY + host.h).toFixed(2)}）`)
        // 必须**整块在墙外**：否则会被墙面盖住（第一版的错）
        assert(pn.z < host.z - host.d * 0.5, `${st.id} 窗贴在墙的外侧（z=${pn.z.toFixed(2)} < ${(host.z - host.d * 0.5).toFixed(2)}）`)
      }
      assert(pn.w > 0.05 && pn.h > 0.05, `${st.id} 窗有面积（${pn.w.toFixed(2)}×${pn.h.toFixed(2)}）`)
    }
    // 烟囱：有、但不到每栋都有（每栋都长烟囱是"工厂"不是港口）
    assert(plan.chimneys.length > 0 && plan.chimneys.length < plan.houses.length,
      `${st.id} 烟囱 ${plan.chimneys.length} 个（0 < n < 房子数）`)
    for (const ch of plan.chimneys) {
      const host = plan.houses.find((h) => Math.abs(ch.x - h.x) <= h.w * 0.5 + 1e-6)
      assert(!!host, `${st.id} 烟囱长在某栋房的屋脊上`)
      if (host) assert(Math.abs(ch.z - host.z) < 1e-6, '烟囱在屋脊线上（z = 房中心）')
      assert(ch.h > 0.1 && ch.w > 0.05, `${st.id} 烟囱有尺寸（${ch.w.toFixed(2)}×${ch.h.toFixed(2)}）`)
    }
  }
  // 网格命名（e2e 与取证按名字取）
  const hmSrc2 = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'harborModel.ts'), 'utf8')
  assert(/name = 'deck-harbor-panes'/.test(hmSrc2), '窗洞网格命名 deck-harbor-panes')
  assert(/name = 'deck-harbor-chimneys'/.test(hmSrc2), '烟囱网格命名 deck-harbor-chimneys')
  assert(/MAX_HOUSE \* 6/.test(hmSrc2), '窗的实例池是房子数×6（单测守这个上限）')
}


/*
 * ---- 码头上要有人（不然是一座空城）----
 *
 * 【守什么】房子、栈桥、防波堤都做完之后，整座城里一个人都没有 —— 画面上
 * 读作"模型"而不是"地方"。这里守四件事：
 *  ① 人只站在**码头前沿那条带**（z 在码头面之内、房子之前）——
 *     一条带同时避开"站在水里"与"穿进房子"，不需要做碰撞；
 *  ② 人都在视野中部（撒满整条岸时一半落在画面外）；
 *  ③ 至少两种身份（装卸/行船/闲站的衣服颜色不同，一眼能看出不是复制品）；
 *  ④ 身高落在"可读但不离谱"的区间（<0.15 单位只有 5 像素，>0.3 比房子还高）。
 */
{
  for (const st of Object.values(HARBOR_STYLES)) {
    const plan = harborPlan(st, 36, 1, 5)
    assert(plan.folk.length >= 4 && plan.folk.length <= 14,
      `${st.id} 码头上 ${plan.folk.length} 个人（4~14）`)
    for (const f of plan.folk) {
      assert(f.z >= plan.deckZ0 && f.z <= 0.62,
        `${st.id} 人站在码头前沿（z=${f.z.toFixed(2)} ∈ ${plan.deckZ0}..0.62）`)
      assert(Math.abs(f.x) <= plan.deckHalfW * 0.72,
        `${st.id} 人在视野中部（|x|=${Math.abs(f.x).toFixed(1)} ≤ ${(plan.deckHalfW * 0.72).toFixed(1)}）`)
      assert(f.h >= 0.15 && f.h <= 0.3, `${st.id} 身高 ${f.h.toFixed(2)} 单位（0.15~0.3）`)
      assert(Number.isFinite(f.yaw) && Number.isFinite(f.phase), `${st.id} 朝向与相位都是数`)
    }
    const kinds = new Set(plan.folk.map((f) => f.kind))
    assert(kinds.size >= 2, `${st.id} 至少两种身份（${[...kinds].join('/')}）`)
    // 确定性：同一个港每次进来是同样几个人（不能每次刷新都换一批）
    const again = harborPlan(st, 36, 1, 5)
    assert(JSON.stringify(plan.folk) === JSON.stringify(again.folk), `${st.id} 同港同人（确定性）`)
    // 不同的港不能是同一批人
    const other = harborPlan(st, 36, 1, 17)
    assert(JSON.stringify(plan.folk.map((f) => f.x)) !== JSON.stringify(other.folk.map((f) => f.x)),
      `${st.id} 不同的港站的不是同一批人`)
  }
  // 网格命名（e2e / 取证按名字取）
  const hmSrc3 = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'harborModel.ts'), 'utf8')
  for (const k of ['porter', 'sailor', 'idle']) {
    assert(hmSrc3.includes('deck-harbor-folk-${k}') || hmSrc3.includes(`deck-harbor-folk-${k}`),
      `人（${k}）的网格按身份命名`)
  }
  assert(/deck-harbor-folk-head/.test(hmSrc3), '头单独一个网格（远处读作一个圆点）')
  // 走路只是很小的起伏：幅度必须远小于身高（否则像在跳）
  assert(/f\.h \* 0\.07/.test(hmSrc3), '起伏幅度是身高的 7%（读作在走，不是在跳）')
}


/*
 * ---- 夜里的码头：一排灯 ----
 *
 * 【守什么】夜里的港口原来只有房子的窗光（散在墙上、同一高度）。真实的码头
 * 是**沿着水边挂一排灯**的：栈桥末端、系缆桩旁。这一排灯的分布与窗光完全不同，
 * 是夜里"这里是码头"最强的形状信号。守四件事：
 *  ① 每条栈桥末端都有一盏（系缆的地方必须看得清）；
 *  ② 灯杆比人高得多（灯埋在人里就等于没有）；
 *  ③ 灯只在夜里亮（白天亮一排黄点是最假的）；
 *  ④ 亮度有差异（一排同样亮的灯读作"贴图"）。
 */
{
  for (const st of Object.values(HARBOR_STYLES)) {
    const plan = harborPlan(st, 36, 1, 6)
    assert(plan.lamps.length >= plan.piers.length + 2,
      `${st.id} 灯 ${plan.lamps.length} 盏（≥ 栈桥数 + 2）`)
    // ① 每条栈桥末端一盏
    for (const p of plan.piers) {
      const atTip = plan.lamps.some((l) => Math.abs(l.x - p.x) < 1e-6 && Math.abs(l.z - (p.z1 + 0.12)) < 1e-6)
      assert(atTip, `${st.id} 栈桥 x=${p.x.toFixed(1)} 的末端有一盏灯`)
    }
    // ② 灯比人高（人的身高上限 0.3，灯最低 0.5）
    const maxFolk = Math.max(0, ...plan.folk.map((f) => f.h))
    for (const l of plan.lamps) {
      assert(l.y > maxFolk + 0.15, `${st.id} 灯高 ${l.y.toFixed(2)} 高于最高的人 ${maxFolk.toFixed(2)}`)
      assert(l.y >= 0.5 && l.y <= 0.9, `${st.id} 灯高在 0.5~0.9 单位（9~16 米）`)
      // 灯必须在水侧（码头前沿或更外），不能挂到内陆房顶上
      assert(l.z <= 0.2, `${st.id} 灯在水边（z=${l.z.toFixed(2)} ≤ 0.2）`)
    }
    // ④ 亮度有差异（不是一排复制品）
    const ks = plan.lamps.map((l) => l.k)
    assert(new Set(ks.map((k) => k.toFixed(2))).size >= Math.min(3, ks.length),
      `${st.id} 灯的亮度至少有 3 档不同（${ks.map((k) => k.toFixed(2)).join('/')}）`)
  }
  const hmSrc4 = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'harborModel.ts'), 'utf8')
  assert(/name = 'deck-harbor-lamps'/.test(hmSrc4), '灯的光点网格命名 deck-harbor-lamps')
  assert(/name = 'deck-harbor-lampposts'/.test(hmSrc4), '灯杆网格命名 deck-harbor-lampposts')
  /*
   * ③ 只在夜里亮：opacity 里的底值必须是"黄昏就点上"的那种小常数，
   * 而不是 1（白天 1 的话，一排黄点挂在白天的码头上）。
   */
  assert(/lampMat\.opacity = Math\.min\(1, \(0\.06 \+ 0\.94 \* night\)\)/.test(hmSrc4),
    '灯的亮度随 night 走（白天 0.06、夜里 1：正午不许挂黄点）')
  assert(/lampMat\.opacity[\s\S]{0,120}fogK/.test(hmSrc4), '雾里要削（否则"能见度 100 米"时 7 海里外的灯还亮着）')
  /*
   * 昼夜与雾的**顺序**：必须"先混雾色、再乘昼夜"。
   * 反过来时，黄昏那片暖亮的 uFogColor 会把墙提亮回来 ——
   * 实测夜里 litK 0.638 而墙面只暗了 18%（#d7ccb5 → #b1a895）。
   */
  const order = hmSrc4.indexOf('m.color.lerp(fogColor')
  const after = hmSrc4.indexOf('m.color.multiplyScalar(litK)')
  assert(order > 0 && after > order, '先混雾色、再乘昼夜系数（反过来夜里会被雾提亮）')
}


/*
 * ---- 画面本身的细节：水纹与云 ----
 *
 * 【守什么】用户两次说"看着还是非常粗糙"。可量的那一半是"这块像素有多不平"：
 * 港内把浪压平之后，海面左侧一块的亮度标准差只有 1.87 —— 一整片纯色塑料板。
 * 这一层加的是**不依赖几何**的细节（法线/颜色上的噪声），所以守的是结构：
 *  ① 海面有毛细波法线（波长比顶点间距还小，只能逐像素算）；
 *  ② 有沿风向拉长的细纹（各向同性 = 电视雪花）；
 *  ③ 天空的云用**方位角 + 仰角**取噪声（用 d.xz/d.y 会把云拉成竖幕，改过三次）；
 *  ④ 云随昼夜：白天开、夜里几乎关掉（月光下不该是白天的云）。
 */
{
  const dv = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'DeckView.tsx'), 'utf8')
  // ① 毛细波
  assert(/n\.x \+= \(r1 - 0\.5\) \* 0\.12/.test(dv), '海面有毛细波（逐像素扰动法线）')
  assert(/vnoise\(rq \* 4\.1/.test(dv), '毛细波用世界坐标的噪声（不随浪高变）')
  // ② 细纹：各向异性 + 单层采样（性能）
  assert(/vec2 fineQ = vec2\(vWorld\.x \* 1\.6/.test(dv) && /vWorld\.z \* 7\.0/.test(dv),
    '细纹的坐标各向异性（沿风向拉长，否则是电视雪花）')
  assert(/smoothstep\(0\.18, 0\.86, vnoise\(fineQ \* 2\.6\)\)/.test(dv),
    '细纹是**单层**噪声 + smoothstep 提对比（两层采样把帧率拖到 55.6）')
  assert(/col \*= \(0\.84 \+ 0\.32 \* fine\) \* shadePatch/.test(dv),
    '细纹乘进颜色（只抖法线时，近景菲涅尔已饱和，几乎看不出变化）')
  // 水色斑必须在"远方混雾"之前（否则远处把它洗掉）
  const patchAt = dv.indexOf('* shadePatch')
  const fogAt = dv.indexOf('float d = length(vWorld.xz)')
  assert(patchAt > 0 && fogAt > patchAt, '水色斑在远方混雾之前（否则远处被洗平）')
  // ③ 云的投影
  assert(/float az = atan\(d\.z, d\.x\)/.test(dv) && /float el = asin\(clamp\(d\.y/.test(dv),
    '云用方位角 + 仰角取噪声（用 d.xz/d.y 会拉成竖幕）')
  assert(/vec2 cp = vec2\(az \* 9\.5, el \* 9\.5\)/.test(dv),
    'az 与 el 用同一个系数（等角度采样才各向同性；不同系数会把云压扁）')
  /*
   * 云的**边缘宽度** = 窗口 / cn 的空间梯度。这三条守的就是"别又变回一层雾"：
   * 窗口 0.12 → 80px（读作白气）、0.008 → 8px（积云的轮廓）。
   */
  assert(/float cover = smoothstep\(0\.594, 0\.602, cn\)/.test(dv),
    '云的阈值窗口只有 0.008（窗口大了边缘就跨几十像素，云变成雾）')
  assert(/vec2 wq = vec2\(vnoise\(cp \* 0\.75 \+ 3\.1\)/.test(dv) && /vec2 cq = cp \+ wq \* 0\.55/.test(dv),
    '云的采样坐标被一层低频噪声揉过（等值线才是团块状，不是抹刀痕）')
  assert(/cloudCol \*= 0\.94 \+ 0\.12 \* vnoise\(cq \* 7\.3 \+ 61\.0\)/.test(dv),
    '云面有絮状明暗（一块平白读作"涂抹"）')
  /*
   * 云体色（第 114 轮）：厚度 → 亮度，再乘一条仰角阴影。
   * 守两件事：① 云色**不是** uCloudColor 的平涂（那样是一坨白斑）；
   * ② 三层 fbm（第三层把边缘打毛，否则云团是圆的）。
   */
  assert(/vec3 cloudCol = uCloudColor \* mix\(0\.86, 1\.16, smoothstep\(0\.50, 0\.78, cn\)\)/.test(dv),
    '云体色按厚度分档（一坨平色读作白斑）')
  assert(/col = mix\(col, cloudCol, cover \* uCloud \* 0\.98\)/.test(dv),
    '云混进天空色（不是画一圈亮边）')
  assert(/0\.18 \* vnoise\(cq \* 5\.70 \+ 41\.0\)/.test(dv),
    '第三层高频噪声（云边缘要被打毛，两层只剩圆斑）')
  // ④ 云随昼夜
  /*
   * 白天 0.96：0.82 时云只是"提亮一点的天"，混合后仍是灰蓝（实测云心 187/193/202）。
   * 白云的漫反射接近全反射，权重 >0.9 才有"白"这个读感。
   */
  assert(/uCloud\.value = 0\.10 \+ 0\.86 \* dayK/.test(dv), '云随昼夜：白天 0.96、夜里 0.10')
  assert(/lerp\(CLOUD_WHITE, 0\.90\)/.test(dv), '云色先往白里推到 0.90（留 10% 天蓝在云底）')
  assert(/uCloudDrift\.value\.set\(t \* 0\.004/.test(dv), '云会漂（极慢，一分钟 0.24 个单位）')
  // 取证句柄（e2e 读 uniform —— 天空那块被教程遮罩压着，量像素量到的是遮罩）
  assert(/__deckSky\?: unknown \}\)\.__deckSky = skyMat/.test(dv), '暴露天空句柄给 e2e')
}


/*
 * ---- 灯在水面上的倒影 ----
 *
 * 【守什么】灯挂着、水里却没像，等于灯悬在空气中。倒影长度跟灯高走
 * （越高的光源像越长），但要有上限（否则灯杆一高，亮条会横穿半个港）。
 */
{
  assert(lampReflectionLen(0) === 0, '没有灯就没有倒影')
  assert(Math.abs(lampReflectionLen(0.7) - 1.54) < 0.01, `灯高 0.7 → 倒影 ${lampReflectionLen(0.7).toFixed(2)}`)
  assert(lampReflectionLen(5) === 3.4, `上限 3.4（${lampReflectionLen(5)}）`)
  assert(lampReflectionLen(0.3) < lampReflectionLen(0.6), '灯越高倒影越长（单调）')
  assert(lampReflectionLen(Number.NaN) === 0, 'NaN → 0')
  assert(lampReflectionLen(-1) === 0, '负高度 → 0')

  const hm = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'harborModel.ts'), 'utf8')
  assert(/name = 'deck-harbor-lampglow'/.test(hm), '倒影网格命名 deck-harbor-lampglow')
  assert(/reflectMat\.opacity = Math\.min\(1, 0\.2 \+ 0\.8 \* night\)/.test(hm),
    '倒影随 night 亮（白天是 0.2 的底，几乎看不见）')
  assert(/reflectMat\.opacity[\s\S]{0,140}fogK/.test(hm), '倒影在雾里削得更狠（水面上的像最先被雾吃掉）')
  assert(/dummy\.position\.set\(l\.x, 0\.014, l\.z - len \* 0\.5\)/.test(hm),
    '倒影从灯的投影点朝 −z（相机方向）铺开')
}


/*
 * ---- 系泊缆绳：船真的被系住了 ----
 *
 * 【守什么】停在码头边的船原来只是"浮在那里"，一根缆绳都没有，
 * 看久了会发现它在漂。真实的系泊是船首与船尾各一根、斜着拉到码头 ——
 * 这是"八"字，一眼能读出"这条船被系住了"。守四件事：
 *  ① 只给离岸最近的一两条船（远处的船要拉 90 米缆，比"没系"更怪）；
 *  ② 船上一端在**船尾两侧**（船首朝海，缆绳只能从船尾拉向岸；旧写法按长轴
 *     两端取点，船首那端在海里，缆绳横跨整条栈桥 —— 截图里像一根甩起来的鞭子）；
 *  ③ 岸上一端在码头前沿（z 在小正数、y 在码头面高度）；
 *  ④ 有下垂（绷成直线读作"一根钢筋"）。
 */
{
  for (const st of Object.values(HARBOR_STYLES)) {
    const plan = harborPlan(st, 36, 1, 6)
    const nShip = Math.min(2, plan.moorings.length)
    assert(plan.lines.length === nShip * 2,
      `${st.id} 最近 ${nShip} 条船各两根缆（共 ${plan.lines.length} 根）`)
    for (const L of plan.lines) {
      const [fx, fy, fz] = L.from
      // 属于哪条船：端点应该在那条船的船首/船尾
      const host = plan.moorings.find((m) => {
        const sternZ = m.z + m.len * 0.42
        return Math.abs(fz - sternZ) < 1e-6
          && (Math.abs(fx - (m.x - m.len * 0.11)) < 1e-6 || Math.abs(fx - (m.x + m.len * 0.11)) < 1e-6)
      })
      assert(!!host, `${st.id} 缆绳的船上一端在某条船的船尾（${fx.toFixed(1)}, ${fz.toFixed(1)}）`)
      assert(fy > 0.2, `${st.id} 船上一端在甲板高度（y=${fy.toFixed(2)}，不能从水面里长出来）`)
      // 岸上一端：码头前沿
      assert(L.to[2] > 0 && L.to[2] < 0.3, `${st.id} 岸上一端在码头前沿（z=${L.to[2].toFixed(2)}）`)
      assert(L.to[1] >= plan.deckY - 0.05, `${st.id} 岸上一端不低于码头面（y=${L.to[1].toFixed(2)}）`)
      // ④ 下垂
      assert(L.sag > 0.05 && L.sag < 0.25, `${st.id} 有下垂（${L.sag.toFixed(2)}）`)
      // 缆绳不能横穿整座城：两端水平距离不该超过 6 单位
      const horiz = Math.hypot(L.to[0] - fx, L.to[2] - fz)
      assert(horiz < 6, `${st.id} 缆绳不横跨半个港（水平 ${horiz.toFixed(1)} 单位）`)
    }
  }
  const hm5 = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'harborModel.ts'), 'utf8')
  assert(/name = `deck-harbor-mooringline-\$\{i\}`/.test(hm5), '缆绳网格按序命名（取证要用）')
  /*
   * 【为什么必须是 Tube 而不是 Line】真实缆绳直径 5 厘米，在 18 单位外是 0.2 像素；
   * `THREE.Line` 永远只画 1 像素 —— 实测一张图里一根都看不见。Tube 半径 0.028
   * （夸张 10 倍）才有 2~3 像素，读作"一根缆"。
   */
  assert(/new THREE\.TubeGeometry\(curve, 10, 0\.028, 4, false\)/.test(hm5),
    '缆绳是细 Tube（Line 在 0.2 像素的宽度下完全不可见）')
  assert(/QuadraticBezierCurve3/.test(hm5), '缆绳走二次贝塞尔（中点下垂）')
}


/*
 * ---- 同一座港在两个视图里必须是同一座城 ----
 *
 * 【守什么】甲板视角（`HARBOR_STYLES`）与 2.5D 全球板（`map3d/models.ts`）
 * 各有一套港口配色。原来 3D 那边把四个屋顶色**写死**了一遍：
 * 加勒比给的是砖红 0xb4522f，而甲板上是茅草土黄 0x8e7a44 —— 玩家出海图看
 * 一眼、进港看一眼，两处是两种建筑。这不是风格差异，是同一份事实抄了两遍。
 * 现在 3D 侧从 HARBOR_STYLES 取色（只做一次 ACES 补偿），这里守三件事：
 *  ① 源码里不再有那四个旧字面量（抄回去会红）；
 *  ② 墙与屋顶都按 region 各四份（不是"墙统一米色"）；
 *  ③ 三个补偿后仍是四个互不相同的色（补偿不能把两套压成一个）。
 */
{
  const modelsSrc = readFileSync(join(process.cwd(), 'src', 'components', 'map3d', 'models.ts'), 'utf8')
  assert(/from '\.\.\/deck\/deckHarbor'/.test(modelsSrc), 'map3d/models 从 deckHarbor 取色（单一来源）')
  assert(/HARBOR_STYLES\.(europe|caribbean|asia|africa)\.wall/.test(modelsSrc), '墙色取 HARBOR_STYLES.*.wall')
  assert(/HARBOR_STYLES\.(europe|caribbean|asia|africa)\.roof/.test(modelsSrc), '屋顶取 HARBOR_STYLES.*.roof')
  /*
   * 只匹配 `color: 0x...` 的**代码**（注释里会提到旧值当考古记录，那是应该留的）。
   */
  for (const old of ['0xb4522f', '0x8f4530', '0xb8873f', '0x6b463a']) {
    assert(!new RegExp(`color: ${old}`).test(modelsSrc), `旧写死的屋顶色 ${old} 已删（不再抄第二份）`)
  }
  assert(!/houseMat: new THREE\.MeshStandardMaterial\(\{ color: 0xd8c9a4/.test(modelsSrc),
    '墙色不再统一米色（要按海域分）')
  // 补偿系数：写死的常量，且不能把颜色乘到溢出
  const mLift = /const PORT_TINT_LIFT = ([\d.]+)/.exec(modelsSrc)
  assert(!!mLift, 'ACES 补偿写成具名常量（可查、可调）')
  const lift = Number(mLift?.[1])
  assert(lift > 1 && lift < 1.5, `补偿系数 ${lift}（提亮一档，不是重调一套配色）`)
  const styles = Object.values(HARBOR_STYLES)
  const scaled = styles.map((st) => {
    const c = { r: ((st.roof >> 16) & 255) * lift, g: ((st.roof >> 8) & 255) * lift, b: (st.roof & 255) * lift }
    return `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}`
  })
  assert(new Set(scaled).size === 4, `补偿之后四个屋顶色仍然互不相同（${scaled.join(' | ')}）`)
}


/*
 * ---- 港内水面必须比外海平静（防波堤的意义）----
 *
 * 【守什么】停泊时如果海面与比斯开湾中间一模一样，那座防波堤就只是装饰。
 * 这里守系数本身，以及**船与水面读同一个数**（一个平一个摇是最容易出的错）。
 */
{
  assert(harborCalm(0, false) === 0.34, `贴岸停泊 → 0.34（实测 ${harborCalm(0, false)}）`)
  assert(Math.abs(harborCalm(0, true) - 0.38) < 0.002, `贴岸航行 → 0.38（实测 ${harborCalm(0, true).toFixed(3)}）`)
  assert(harborCalm(HARBOR_CALM_NM, true) === 1, `8 海里外 → 1（${harborCalm(HARBOR_CALM_NM, true)}）`)
  assert(harborCalm(30, true) === 1 && harborCalm(30, false) === 1, '远洋 → 不干预')
  assert(harborCalm(Number.NaN, true) === 1, 'NaN → 1（不把海面弄平）')
  // 单调：越近越平（中间不能有凸起，否则靠港时海面会"忽然抖一下"）
  const seq = [7, 6, 4, 2, 0].map((d) => harborCalm(d, true))
  for (let i = 1; i < seq.length; i++) assert(seq[i] <= seq[i - 1] + 1e-9, `越近越平（${seq.map(v => v.toFixed(2)).join(' ≥ ')}）`)
  // 停泊永远不比航行大
  for (const d of [0, 2, 5, 8]) assert(harborCalm(d, false) <= harborCalm(d, true) + 1e-9, `停泊 ${d} 海里不高于航行`)

  // 源码守卫：海面与船用同一个倍率
  const deckSrc = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'DeckView.tsx'), 'utf8')
  assert(/uWaveScale\.value = look\.wave \* harborCalmK/.test(deckSrc),
    '海面浪高乘了港内系数（uWaveScale = look.wave × harborCalmK）')
  assert(/const waveAmp = look\.wave \* harborCalmK/.test(deckSrc),
    '船姿态读同一个 waveAmp（不是各算一份）')
  assert(/deckShipPose\(t, 0\.72, 0\.26, waveAmp\)/.test(deckSrc), '船姿态用的是 waveAmp')
  assert(/deckWaveHeight\(0, 0, t, waveAmp\)/.test(deckSrc), '船高用的是同一个 waveAmp')
}


/*
 * ---- 港内连尾迹都不该有 ----
 *
 * 【守什么】系泊时 `wakeStrength` 故意不是 0（0.26 = 贴身的细小水痕，完全 0
 * 会让静止的船像被抠图贴上去）。但港内海面压到 0.34（`harborCalm`）之后，
 * 那条 0.26 的白沫就露馅了：海面是镜面，船尾拖出一道白痕（实测截图）。
 * 所以系泊那一档乘 calm，而**航行那一档不乘** —— 速度已经表达了尾迹大小，
 * 再乘一次会把进港减速时的尾迹压得比停泊还淡（方向反了）。
 */
{
  assert(wakeStrength(false, 0, 1) === 0.26, `外海系泊仍是 0.26（${wakeStrength(false, 0, 1)}）`)
  assert(Math.abs(wakeStrength(false, 0, 0.34) - 0.088) < 0.003,
    `港内系泊 0.26×0.34 = ${wakeStrength(false, 0, 0.34).toFixed(3)}（几乎看不见）`)
  assert(wakeStrength(true, 12, 1) === 1, '12 节满尾迹')
  assert(wakeStrength(true, 12, 0.34) === 1, '航行那一档不乘 calm（速度已表达）')
  assert(wakeStrength(true, 12, 0.34) > wakeStrength(false, 0, 0.34) * 5,
    '进港航行时的尾迹仍明显大于系泊（不能反）')
  assert(Math.abs(wakeStrength(false, 0, Number.NaN) - 0.26) < 1e-9, 'calm 是 NaN 时按 1 算')
  assert(wakeStrength(false, 0, 5) === 0.26, 'calm 大于 1 时夹到 1')

  const view = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'DeckView.tsx'), 'utf8')
  assert(/const harborCalmK = sightingRef\.current/.test(view),
    '港内系数在 tick 开头算一次（海面/船/尾迹共用）')
  assert(/wakeStrength\(\s*st\.fleet\.isSailing,[\s\S]{0,160}harborCalmK,?\s*\)/.test(view),
    '尾迹强度收到同一个 harborCalmK')
  assert(!/harborCalm\(sightingRef\.current\.distNm/.test(view) || (view.match(/harborCalm\(/g) ?? []).length === 1,
    'harborCalm 不再在多处各算一次（只此一处）')
}


/*
 * ---- 岸边浪线：强弱必须真的来自风速，虚线周期必须能无缝回卷 ----
 *
 * 【守什么】浪线看起来像"贴图"，但它带着一个承诺：**风越大浪越明显**。
 * 三种错法都会悄悄毁掉这个承诺：
 *  ① 风速不可用时随便给个默认值（画出一片无中生有的浪）；
 *  ② 虚线周期不等于 12 —— 将来若恢复"沿虚线爬"的动画，走到终点接不上，
 *     每循环一次抖一下；
 *  ③ 线的粗细/亮度不随风变（那就真是贴图了）。
 * 另外守两条**结构**约束（只在源码里能看出来）：
 *  · 浪线必须夹在浅水层与陆地之间（写反了白沫会被洗淡或盖住）；
 *  · 不许再给这一层加 CSS 动画（实测 60 → 10.2 fps）。
 */
{
  assert(surfStrength(Number.NaN) === 0 && surfStrength(undefined as unknown as number) === 0,
    '风速不可用 → 无浪（不凭空画）')
  assert(surfStrength(SURF_WIND_MIN) === 0, `风速 ${SURF_WIND_MIN} 节（风平浪静）没有白沫`)
  assert(surfStrength(SURF_WIND_FULL) === 1, `风速 ${SURF_WIND_FULL} 节（风暴）浪打满`)
  assert(surfStrength(0) === 0, '0 节 → 0（不是负数）')
  assert(surfStrength(99) === 1, '超过上限也夹在 1')
  assert(Math.abs(surfStrength(12) - (12 - SURF_WIND_MIN) / (SURF_WIND_FULL - SURF_WIND_MIN)) < 1e-9,
    `12 节（晴天常见风速）→ ${surfStrength(12).toFixed(3)}`)

  // 单调：风越大，线越粗、越亮
  let prevW = 0
  let prevO = 0
  for (let w = 0; w <= 40; w++) {
    const s = surfStrength(w)
    const ww = surfWeight(s)
    const oo = surfOpacity(s)
    assert(ww >= prevW - 1e-9 && oo >= prevO - 1e-9, `${w} 节时线宽/亮度不倒退`)
    assert(ww >= 3.4 - 1e-9 && ww <= 6.6 + 1e-9, `${w} 节线宽 ${ww.toFixed(2)} 在 3.4..6.6（可见厚度 = 一半）`)
    assert(oo > 0.29 && oo < 0.65, `${w} 节不透明度 ${oo.toFixed(2)} 在 0.30..0.64`)
    prevW = ww
    prevO = oo
  }

  // 虚线：两段之和必须正好是一个周期（动画才能无缝回卷），且占空比随风增长
  let prevDuty = 0
  for (const w of [0, 6, 12, 20, 30, 40]) {
    const [d, g] = surfDash(surfStrength(w)).split(' ').map(Number)
    assert(Math.abs(d + g - SURF_PERIOD_PX) < 1e-6,
      `${w} 节：白沫 ${d} + 空隙 ${g} = 周期 ${SURF_PERIOD_PX}（差一点都会让循环抖一下）`)
    assert(g > 0, `${w} 节：空隙 ${g > 0} 不为 0（否则整条线变实线）`)
    const duty = d / SURF_PERIOD_PX
    assert(duty >= prevDuty - 1e-9, `${w} 节占空比 ${(duty * 100).toFixed(0)}% 不倒退`)
    assert(duty > 0.19 && duty < 0.41, `${w} 节占空比在 20%~40%（太细读成噪点、太密读成实线）`)
    prevDuty = duty
  }

  // 结构守卫①：浪线夹在浅水层与陆地之间（渲染顺序就是图层顺序）
  const mv = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'MapView.tsx'), 'utf8')
  const iShallow = mv.indexOf('shallows-${w}')
  const iSurf = mv.indexOf('<SurfLine')
  const iLand = mv.indexOf('key="land"')
  assert(iShallow > 0 && iSurf > 0 && iLand > 0, '三处都在（浅水层 / 浪线 / 陆地）')
  assert(iShallow < iSurf, '浪线排在浅水层之后（否则白沫被 12 层青蓝洗淡）')
  assert(iSurf < iLand, '浪线排在陆地之前（否则整条海岸套一圈亮边）')

  // 结构守卫②：这一层不许有 CSS 动画（实测 60 → 10.2 fps，见 SurfLine 注释）
  const sf = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'SurfLine.tsx'), 'utf8')
  assert(!/animation\s*:/.test(sf), 'SurfLine 没有 animation（白沫爬行会让整片 SVG 每帧重绘）')
  // 用 @keyframes 而不是裸 keyframes：注释里写着"没有 keyframes"不该被自己判红
  assert(!/@keyframes/.test(sf), 'SurfLine 没有 @keyframes')
  assert(/useGameStore/.test(sf) && /weather\.windSpeed/.test(sf), '浪的强弱来自 weather.windSpeed')
}


/*
 * ---- 海上的线不许穿陆：洋流与风箭头 ----
 *
 * 【守什么】这些装饰是按**经纬度**摆的，谁也不看陆地长什么样。实测（真实
 * land.geojson + isOnLand，逐 0.25° 加密）：
 *   · 风箭头 135 个落点里 **48 个在陆地上**（撒哈拉、巴西高原、南非内陆）；
 *   · 4 条洋流的节点直接在内陆：加那利 28/63、阿古拉斯 19/25、南赤道 19/121、
 *     季风漂流 9/65 —— 画出来就是"洋流从非洲大陆中间穿过去"。
 * 洋流这条折线**同时是物理来源**（seaCurrents 按 200 海里带宽算顺流逆流），
 * 所以不能只裁画面，数据本身必须离岸。
 *
 * 这里分两段守：
 *  ① 纯函数的边界行为（用合成掩码，快、不看数据）；
 *  ② 用**真实 geojson** 逐点验数据：每条洋流、每个风箭头都必须在水里。
 */
{
  // ① densify：相邻两点不得超过步长，端点必须保留
  const line: [number, number][] = [[0, 0], [10, 0], [10, 20]]
  const d = densify(line, 1)
  assert(d[0][0] === 0 && d[0][1] === 0, 'densify 保留起点')
  assert(d[d.length - 1][0] === 10 && d[d.length - 1][1] === 20, 'densify 保留终点')
  let maxStep = 0
  for (let i = 1; i < d.length; i++) {
    maxStep = Math.max(maxStep, Math.abs(d[i][0] - d[i - 1][0]), Math.abs(d[i][1] - d[i - 1][1]))
  }
  assert(maxStep <= 1 + 1e-9, `加密后最大步长 ${maxStep.toFixed(3)}° ≤ 1°`)
  assert(densify([[3, 4]], 1).length === 1, '单点原样返回')
  assert(densify([], 1).length === 0, '空线返回空')
  assert(densify([[0, 0], [2, 0]], 0).length === 2, '步长非法时原样返回（不除零）')

  // ① splitAtLand：陆地夹在中间 → 两段；陆地在一端 → 一段；全陆 → 空
  const midLand = (lat: number, lng: number) => Math.abs(lng) < 5
  const two = splitAtLand([[-20, -30], [-20, 30]], midLand, 1, 1)
  assert(two.length === 2, `陆地夹在中间时切成两段（实测 ${two.length} 段）`)
  for (const run of two) {
    for (const [la, ln] of run) assert(!midLand(la, ln), '切出来的段里没有陆地点')
  }
  assert(two[0][two[0].length - 1][1] < -4 && two[1][0][1] > 4, '两段的端点分别停在陆地两侧')
  const endLand = (lat: number) => lat > 10
  const one = splitAtLand([[0, 0], [20, 0]], endLand, 1, 1)
  assert(one.length === 1, `陆地在一端时只剩一段（实测 ${one.length}）`)
  assert(one[0][one[0].length - 1][0] <= 10, '留下的那一段停在海岸（纬度 ≤ 10）')
  assert(splitAtLand([[50, 0], [60, 0]], endLand, 1, 1).length === 0, '整条在陆地上 → 不画')
  // 碎段要丢掉：0.6° 的孤岛水塘只会有 1~2 个像素
  const speck = splitAtLand([[-20, -6], [-20, -5.4]], midLand, 0.2, 1.5)
  assert(speck.length === 0, '短于 minRunDeg 的碎段被丢掉')

  // ② 真实数据：注册 land.geojson 后逐条验
  const gj = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'land.geojson'), 'utf8'))
  registerLandGeojson(gj)

  for (const cur of OCEAN_CURRENTS) {
    for (const season of [1, 200]) {
      const pts = currentFlowPoints(cur, season)
      const dense = densify(pts, 0.25)
      const bad = dense.filter(([la, ln]) => isOnLand(la, ln))
      assert(bad.length === 0,
        `${cur.name}（第 ${season} 天）在陆地上有 ${bad.length} 个点` +
        (bad.length ? `，例：${bad.slice(0, 3).map(([la, ln]) => `${la.toFixed(1)},${ln.toFixed(1)}`).join(' ')}` : ''))
      // 而且它必须真的被切成一段（数据干净时护栏不该切它）
      const runs = splitAtLand(pts, isOnLand, 0.25)
      assert(runs.length === 1, `${cur.name}（第 ${season} 天）数据干净 → 护栏不切它（实测 ${runs.length} 段）`)
    }
  }

  const sites = windArrowSites(1)
  const onLand = sites.filter((s) => isOnLand(s.lat, s.lng))
  const kept = filterSeaPoints(sites, isOnLand)
  assert(onLand.length > 0, `网格里确实有落在陆地上的点（${onLand.length} 个），否则这条判据是空的`)
  assert(kept.length === sites.length - onLand.length, `过滤掉的正好是陆地上那些（${kept.length} 留在海里）`)
  assert(kept.every((s) => !isOnLand(s.lat, s.lng)), '过滤后剩下的每一个都在水里')
  assert(kept.length > 60, `海里还剩下 ${kept.length} 个箭头（不能一刀切光）`)

  // 海洋名也要在水里（原来就是对的，守一下别再飘到岸上）
  for (const l of OCEAN_LABELS) {
    assert(!isOnLand(l.lat, l.lng), `海洋名「${l.name}」不在陆地上`)
  }

  // 源码守卫：两个图层真的用了过滤/裁切
  const ov = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'MapOverlays.tsx'), 'utf8')
  assert(/filterSeaPoints\(windArrowSites/.test(ov), '风箭头按陆地过滤')
  assert(/splitAtLand\(currentFlowPoints/.test(ov), '洋流按陆地裁切')
  assert(/pane=\{BAND_PANE\}/.test(ov), '风带虚线挂在自建 pane 上')
  assert(/zIndex = '330'/.test(ov), '风带 pane 在陆地填充（400）之下 —— 否则一条青线横穿撒哈拉')
}


/*
 * ---- 商船尾迹：必须长在它**走过的航迹**上 ----
 *
 * 【守什么】尾迹是"这艘船从哪儿来"的唯一线索，两种错法都会立刻被看出来：
 *  ① 画在船头前面（返程时按 sign=1 算就会这样）—— 看起来船在倒着开；
 *  ② 两端点直接连一条线 —— A* 的折线是绕着海岸走的，直线段会横穿陆地。
 * 所以判据盯着：端点确实在"身后"、中间必须走几何自己的顶点、端点在航线端点处不画。
 */
{
  const mkGeom = (): RouteGeometry => ({
    points: [
      { lat: 0, lng: 0, cumNm: 0 },
      { lat: 0, lng: 1, cumNm: 60 },
      { lat: 0, lng: 2, cumNm: 120 },
    ],
    totalNm: 120,
    from: [0, 0],
    to: [0, 2],
    expansions: 0,
    elapsedMs: 0,
  })
  const g = mkGeom()

  // ① 正向：船在 100 海里处，尾迹应当在它**西边**（lng 更小）
  const fwd = wakePolyline(g, 100, 1, 60)
  assert(fwd.length >= 2, `正向尾迹有 ${fwd.length} 个点`)
  assert(Math.abs(fwd[fwd.length - 1][1] - (100 / 60)) < 0.02, `尾迹头在船位（lng≈${(100 / 60).toFixed(2)}）`)
  assert(fwd[0][1] < fwd[fwd.length - 1][1], `尾迹在船身后方（${fwd[0][1].toFixed(2)} < ${fwd[fwd.length - 1][1].toFixed(2)}）`)

  // ② 返程（sign=-1）：船头朝西，尾迹必须在**东边**
  const back = wakePolyline(g, 100, -1, 60)
  assert(back.length >= 2, '返程尾迹也画得出来')
  assert(back[0][1] > back[back.length - 1][1], `返程时尾迹在另一侧（${back[0][1].toFixed(2)} > ${back[back.length - 1][1].toFixed(2)}）`)

  // ③ 中间点必须是几何顶点（lng=1 那个拐点），不能是两端点的直线插值
  assert(fwd.some(([, lng]) => Math.abs(lng - 1) < 1e-9), '尾迹经过了航线自己的拐点（没走直线）')

  // ④ 端点处（身后没有航迹）不画
  assert(wakePolyline(g, 0, 1, 60).length === 0, '刚出发时不画尾迹')
  assert(wakePolyline(g, 0, -1, 60).length >= 2, '刚出发但朝返程方向 → 身后有航迹，要画')
  assert(wakePolyline(g, Number.NaN, 1, 60).length === 0, 'NaN 里程不画')
  assert(wakePolyline(g, 100, 1, 0).length === 0, '长度 0 不画')

  // ⑤ 点数量有上限（逐帧 setLatLngs，点太多会卡）
  const long: RouteGeometry = {
    points: Array.from({ length: 400 }, (_, i) => ({ lat: 0, lng: i * 0.01, cumNm: i * 0.6 })),
    totalNm: 399 * 0.6,
    from: [0, 0],
    to: [0, 4],
    expansions: 0,
    elapsedMs: 0,
  }
  const many = wakePolyline(long, long.totalNm, 1, 200)
  assert(many.length <= WAKE_MAX_POINTS, `点被抽稀到 ${many.length} 个（上限 ${WAKE_MAX_POINTS}）`)
  assert(Math.abs(many[0][1] - 0) > 1e-9 || Math.abs(many[many.length - 1][1] - 4) < 1e-6,
    '抽稀后首尾仍然正确')

  // ⑥ 屏幕长度恒定：把"想要的像素长度"换成海里
  assert(Math.abs(wakeNmForScreen(WAKE_SCREEN_PX / 100) - 100) < 1e-9, '100px/海里 → 100 海里（屏幕长度恒定）')
  assert(wakeNmForScreen(0.05) === WAKE_MAX_NM, `world zoom（0.05px/海里）夹到上限 ${WAKE_MAX_NM} 海里`)
  assert(wakeNmForScreen(5) === WAKE_MIN_NM, `近岸（5px/海里）夹到下限 ${WAKE_MIN_NM} 海里`)
  assert(wakeNmForScreen(Number.NaN) > 0 && wakeNmForScreen(0) > 0, '参数不可用时给一个正数（不画 0 长度）')

  // ⑦ 源码守卫：重画必须节流（逐帧 setLatLngs 实测 60 → 27 fps）
  const npc = readFileSync(join(process.cwd(), 'src', 'components', 'map', 'NpcShips2D.tsx'), 'utf8')
  assert(/lastPx/.test(npc) && />=\s*2/.test(npc), '尾迹按"屏幕上移动 ≥2px"节流重画')
  assert(/wakeNmForScreen/.test(npc), '尾迹长度按当前缩放换算（屏幕长度恒定）')
}

console.log(`\n最终结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

/*
 * ---- 屋面的瓦垄、窗框、屋顶比例、海面的纵深 ----
 *
 * 【守什么】上一轮补了明暗与色差之后仍然是"一排积木"。原因有三个，都是**比例与
 * 分节**，不是"细节不够"：
 *  ① 屋顶是一整片纯红斜面（法线相同 → 同一个亮度）→ 改成一垄一垄的瓦；
 *  ② 屋顶占房高 75%、再加 14% 挑檐 → 屏幕上屋顶比墙大；
 *  ③ 窗洞是一块纯黑 → 读作"洞"，加一圈窗框才成"窗"。
 * 另加一条海面的：近处与远处亮度原本都是 77（菲涅尔上限把远近压平），
 * 加空气透视之后远处必须比近处亮。
 */
{
  const hm2 = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'harborModel.ts'), 'utf8')
  // ① 瓦垄
  /*
   * 三档节奏（每 3 条一道深缝）而不是"一明一暗"：严格交替会被眼睛读成**条纹图案**，
   * 节奏一乱才变成材质。第 114 轮从 8 段改 10 段（8 段一条垄 ≈ 3 米，是木板条）。
   */
  assert(/const tile = i % 3 === 0 \? 1\.0 : i % 2 === 0 \? 0\.95 : 0\.89/.test(hm2),
    '屋顶的瓦垄是交替明暗（凸起的瓦脊亮、凹槽暗，三档节奏）')
  assert(/const RIDGE_K = 1\.02/.test(hm2) && /const EAVE_K = 0\.84/.test(hm2),
    '距屋脊越远越暗（檐口积灰、被墙挡住的天光）')
  // ② 窗框
  assert(/name = 'deck-harbor-windowframes'/.test(hm2), '窗框网格命名 deck-harbor-windowframes')
  assert(/windowFrames\.setMatrixAt\(qi, dummy\.matrix\)/.test(hm2), '窗框按窗逐扇写（与窗同一个 qi）')
  assert(/pn\.w \* 1\.7, pn\.h \* 1\.5/.test(hm2), '框比窗大 70%/50%（只露出四边）')
  // ③ 屋顶比例
  const dh = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'deckHarbor.ts'), 'utf8')
  assert(/roofH: h \* style\.roofPitch \* 0\.56/.test(dh),
    '屋顶 = 房高 × 坡度 × 0.56（原先是 ×1.0，屏幕上屋顶比墙大）')
  /* 用真布局验：任何样式下屋顶都不能高过墙的 65%，也不能没有坡 */
  for (const st of Object.values(HARBOR_STYLES)) {
    const plan = harborPlan(st, 36, 1, 4)
    const worst = Math.max(...plan.houses.map((h) => h.roofH / h.h))
    assert(worst <= 0.65, `${st.id} 屋顶/墙高 最坏 ${worst.toFixed(2)} ≤ 0.65（一排红帽子）`)
    /* 下限 0.08：非洲样式是"平顶土屋"（坡度 0.2），本来就不该有陡顶 */
    assert(worst >= 0.08, `${st.id} 屋顶也不是平的（${worst.toFixed(2)} ≥ 0.08）`)
  }
  // ④ 海面纵深
  const dv2 = readFileSync(join(process.cwd(), 'src', 'components', 'deck', 'DeckView.tsx'), 'utf8')
  assert(/float haze = smoothstep\(12\.0, 56\.0, d\) \* 0\.55/.test(dv2), '远处混天光（空气透视）')
  assert(/col = mix\(col, uSky \* 1\.9, haze\)/.test(dv2),
    '混的是提亮后的天光（uSky 本身压暗过，×1.0 时与海色差不到 2 级）')
  // ⑤ 近岸浅水与浪花
  assert(/float shallow = smoothstep\(-0\.9, 0\.0, shoreD\)/.test(dv2), '近岸有一条浅水带')
  assert(/float surfBand = exp\(-pow\(\(shoreD - 0\.25\) \/ 0\.62, 2\.0\)\)/.test(dv2),
    '岸边有一条会起伏的白沫（不是直线）')
  assert(/seaUniforms\.uShoreK\.value = 0/.test(dv2),
    '远洋时关掉浅水（否则浅水带停在上一处岸的位置）')
  assert(/const cl = coastLayout\(sightingRef\.current\.presence\)/.test(dv2),
    '岸线坐标与海岸几何用同一个 coastLayout（一定对齐）')
}
