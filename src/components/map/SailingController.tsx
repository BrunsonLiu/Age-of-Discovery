import { useEffect, useRef } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { ports } from '@/data/ports'
import { isLandAt } from '@/utils/seaRoute'
import { effectiveFleetSpeed, dailyDistanceNm } from '@/utils/navigation'
import { useFxStore as useFx } from '@/store/useFxStore'
import { STANCES } from '@/utils/segment'
import { WEATHER_INFO, weatherFavorFactor } from '@/utils/weather'
import {
  getRouteGeometry,
  positionAtNm,
  traveledNmAt,
  type RouteGeometry,
} from '@/utils/routePath'

/**
 * 航速换算系数：地图上的「海里/秒」÷「海里/天」。
 *
 * 为什么地图速度必须由每日航程换算而来：
 * 之前这里是独立的「度/秒」常量，于是「地图上跑得快」和「天数扣得快」
 * 是两套互不相干的数——玩家看到船在图上飞驰，天数却几乎不动。
 * 现在 nmPerSec = nmPerDay × 本系数 × 模拟速度，
 * 于是一个游戏日在 1x 下固定约 5.7 秒（与旧手感一致），
 * 而「抢行」会让**地图速度与天数同时变化**，比例恒定——
 * 这正是「抢行确实少花几天」在画面上兑现的方式。
 */
const NM_PER_SEC_PER_DAY = 0.175

const ARRIVE_THRESHOLD_NM = 3
const NEARBY_PORT_THRESHOLD_NM = 60
const SIGHT_RANGE_NM = 40
/**
 * 单个子步的最大位移（海里）。
 *
 * 为什么需要子步进：一帧里船可能移动相当远（8x 速度下可达十几海里），
 * 若整帧一步走完，就会「跨过」段界——玩家直接被推到第 4 段，
 * 中间两段的抉择被完全跳过。把一帧拆成多个小步，
 * 每步都重新检查段界，就不会漏判。
 */
const MAX_STEP_NM = 8

const portMap = new Map(ports.map(p => [p.id, p]))

export default function SailingController() {
  const isSailing = useGameStore(s => s.fleet.isSailing)
  const gamePhase = useGameStore(s => s.gamePhase)
  const waypoint = useGameStore(s => s.waypoint)
  const simSpeed = useGameStore(s => s.simSpeed)
  const currentRoute = useGameStore(s => s.currentRoute)
  // 航速姿态：玩家在航段开始时选定的承诺，决定这一段的航速与消耗
  const stance = useGameStore(s => s.stance)
  // 有效船速：船员不足会掉速，领航员加成（与预估公式一致）
  const shipSpeedKnots = useGameStore(s => effectiveFleetSpeed(s.fleet, s.officers))
  // 真风有利度：与预估公式一致（route.windFavor 已在出航时按真风计算）
  const windFavor = currentRoute ? Math.max(0.5, currentRoute.windFavor) : 1
  // 天候：晴阴雨风暴雾各有航速倍率与风向修正（环境线）
  const weather = useGameStore(s => s.weather)
  const weatherSailMul = WEATHER_INFO[weather.kind].sailMul * weatherFavorFactor(weather.kind)
  const sightRangeNm = SIGHT_RANGE_NM * WEATHER_INFO[weather.kind].visibility

  const lastTimeRef = useRef<number>(0)
  const dayAccumRef = useRef<number>(0)
  const rafRef = useRef<number>(0)
  /** 已航行的累计里程（海里）—— 沿权威路径累加 */
  const traveledNmRef = useRef<number>(0)
  /** 当前航线的几何（权威路径） */
  const geomRef = useRef<RouteGeometry | null>(null)
  /** 几何对应的航线 id —— 改道后要重建 */
  const geomKeyRef = useRef<number>(0)
  /** 已入账的操舵奖励 token——同一个 token 只入账一次 */
  const helmTokenRef = useRef<number>(0)

  useEffect(() => {
    const shouldRun = isSailing && gamePhase === 'playing' && !!waypoint

    if (!shouldRun) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
      lastTimeRef.current = 0
      return
    }

    const stanceMul = STANCES[stance].speedMul
    // 每日航程用**唯一权威口径**（navigation.dailyDistanceNm）：
    // 船速 × 风向 × 天候 × 方针航速倍率 × 24。
    const nmPerDay = dailyDistanceNm(useGameStore.getState().fleet, useGameStore.getState().officers, windFavor, stanceMul, weatherSailMul)
    // 地图移动速度由每日航程换算而来：
    // 一天 = 24 小时 = 一整天真实时间（模拟速度另算），
    // 于是「地图上跑得快」和「天数扣得快」永远是同一件事。
    const nmPerSec = nmPerDay * NM_PER_SEC_PER_DAY * simSpeed

    const animate = (timestamp: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = timestamp
        rafRef.current = requestAnimationFrame(animate)
        return
      }

      const dt = (timestamp - lastTimeRef.current) / 1000
      lastTimeRef.current = timestamp

      if (dt > 0.5) {
        rafRef.current = requestAnimationFrame(animate)
        return
      }

      const state = useGameStore.getState()
      if (!state.fleet.isSailing || !state.waypoint || !state.shipPosition) return

      // **帧内实时检查游戏阶段**。
      //
      // 之前只靠 React 的 effect 清理来暂停（gamePhase 变化 → 清理 → 取消 rAF），
      // 但 store 更新到 React 重渲染之间有几帧的窗口：
      // 船在这几帧里继续跑，跨过了好几个段界，
      // 于是「段 3/8」却停在 47% 的位置、天数还停在第 1 天——
      // 船白跑了几千海里，玩家看到的账全是错的。
      //
      // 这里每帧读一次最新状态，阶段不对就原地停住。
      if (state.gamePhase !== 'playing') {
        rafRef.current = requestAnimationFrame(animate)
        return
      }

      // --- 航线几何（唯一权威路径）---
      // 地图上画的那条线，和船实际走的，是同一条。
      // 之前船走 lat/lng 直线、地图画贝塞尔弧，两者根本不是一条路——
      // 这就是玩家最早抱怨的「船和路线没对齐」。
      //
      // 几何按「航线 id」缓存：中途改道（changeCourse）换了目的地，
      // 几何必须重建，且从船的当前位置重新起算。
      const routeKey = state.currentRoute?.id ?? 0
      if (!geomRef.current || geomKeyRef.current !== routeKey) {
        // 几何的起点是**航线起点**（出港位置），不是当前船位——
        // 否则船一动，几何就变了，地图上的线也跟着变。
        const from = state.routeOrigin ?? state.shipPosition
        geomRef.current = getRouteGeometry(
          [from[0], from[1]],
          [state.waypoint.latitude, state.waypoint.longitude],
        )
        geomKeyRef.current = routeKey
        // 从存档恢复时船可能已在航线中段——用位置反推已走里程，
        // 否则读档后进度会从 0 重来（等于白走一趟）。
        traveledNmRef.current = traveledNmAt(geomRef.current, state.shipPosition[0], state.shipPosition[1])
      }
      const geom = geomRef.current
      const totalNm = geom.totalNm

      // --- 操舵省下的里程入账（航行节拍器的兑现点）---
      //
      // store 的 finishHelmRun 只递交一个里程数，真正入账在这里：
      // traveledNm 是唯一权威的「已经走了多远」，船位每帧都由它推导。
      // 旧的实现直接在 store 里挪 shipPosition，结果被下一帧的
      // positionAtNm(traveledNm) 覆盖——结算屏说省了 15%，
      // 船却原地不动（.workbuddy/dbg-helm-bonus.mjs 实测复现）。
      // 现在奖励走同一条账：加里程 → 重算船位 → 推进度，一气呵成。
      if (state.helmAdvance && helmTokenRef.current !== state.helmAdvance.token) {
        helmTokenRef.current = state.helmAdvance.token
        const advanced = Math.min(totalNm, traveledNmRef.current + state.helmAdvance.nm)
        traveledNmRef.current = advanced
        const surged = positionAtNm(geom, advanced)
        state.setShipPosition([surged.lat, surged.lng])
        useGameStore.setState({ routeProgress: totalNm > 0 ? advanced / totalNm : 0 })
      }

      const remainingNm = totalNm - traveledNmRef.current
      if (remainingNm <= ARRIVE_THRESHOLD_NM) {
        arrive(state)
        return
      }

      // 本帧总位移（海里），拆成若干子步逐步推进。
      const totalMoveNm = Math.min(nmPerSec * dt, remainingNm)
      const stepCount = Math.max(1, Math.ceil(totalMoveNm / MAX_STEP_NM))
      const stepNm = totalMoveNm / stepCount

      let pos = state.shipPosition
      let movedNm = 0
      /** 触礁：整帧作废，停在安全点 */
      let aground = false

      for (let step = 0; step < stepCount; step++) {
        const nextTraveled = traveledNmRef.current + stepNm
        const next = positionAtNm(geom, nextTraveled)

        // 沿途若撞上陆地，停在这里等玩家处理。
        //
        // 判定用**掩码**（isLandAt）而不是多边形（isOnLand）：
        // 航路是按掩码搜出来的，若触礁检查用另一套判据，
        // 船会在「自己规划的航线」上报触礁——两套口径必须同源。
        if (isLandAt(next.lat, next.lng)) {
          aground = true
          break
        }

        pos = [next.lat, next.lng]
        movedNm += stepNm
        traveledNmRef.current = nextTraveled

        // 每一步都检查段界：一旦跨过，立刻停在这一段的末尾，
        // 让玩家的抉择**正好落在段界上**，而不是跳到下一段中间。
        //
        // 停在子步的实际位置即可——一个子步最多 8 海里，
        // 相对一段 500 海里的航程只有 1.6% 的误差，
        // 而精确反推落点会让「移动距离」与「实际坐标」对不上，
        // 那才是真正的破坏（天数与航程脱节）。
        const progress = totalNm > 0 ? nextTraveled / totalNm : 0
        const nextBoundary = (state.segmentIndex + 1) / state.segmentCount
        if (state.segmentCount > 0 && progress >= nextBoundary) {
          break
        }
      }

      if (aground) {
        state.setShipPosition(pos)
        useGameStore.setState({
          fleet: { ...state.fleet, isSailing: false },
          currentRoute: null, routeProgress: 0, waypoint: null,
        })
        state.addNotification({
          id: `run-aground-${Date.now()}`,
          type: 'warning',
          title: '触礁搁浅',
          message: '前方是陆地，船只被迫停航。重新规划航线吧！',
        })
        dayAccumRef.current = 0
        lastTimeRef.current = 0
        geomRef.current = null
        return
      }

      state.setShipPosition(pos)

      for (const port of portMap.values()) {
        if (state.discoveredPorts.includes(port.id)) continue
        const dp = haversineNm(pos[0], pos[1], port.latitude, port.longitude)
        // 雾天瞭望半径收缩：看不见的港口要等雾散（或靠近）
        if (dp < sightRangeNm) {
          const beforeCount = state.discoveredPorts.length
          state.discoverPort(port.id)
          const afterCount = useGameStore.getState().discoveredPorts.length
          if (afterCount > beforeCount) {
            // 第 5/10/15/20 座港口值得停下来庆祝一下
            if (afterCount >= 5 && afterCount % 5 === 0) {
              useFx.getState().fx(
                { kind: 'banner', tone: 'gold', text: `已探索 ${afterCount} 座港口`, sub: `声望 +5 · 还差 ${Math.max(0, 20 - afterCount)} 座走遍世界` },
                'milestone',
              )
            } else {
              // 瞭望可见即是「陆地！」——这才是发现港口应有的兑现瞬间
              useFx.getState().fx({ kind: 'flash', tone: 'safe', text: '' }, 'discover')
            }
          }
        }
      }

      // 天数结算：只推进**真的生效**的天数。
      //
      // 之前是 `while (acc >= 1) { acc -= 1; advanceDay() }`——
      // 但 advanceDay 在 gamePhase !== 'playing' 时会直接返回（不结算），
      // 于是 acc 减了、天数却没加：船在抉择面板前白跑了几十海里，
      // 玩家看到的「天数」与船实际航行的距离对不上。
      // 现在先看状态、确认能推进才扣 acc。
      if (nmPerDay > 0) {
        dayAccumRef.current += movedNm / nmPerDay
      }
      while (dayAccumRef.current >= 1) {
        if (useGameStore.getState().gamePhase !== 'playing') break
        dayAccumRef.current -= 1
        state.advanceDay()
      }

      // 航线进度：已航行里程 ÷ 总里程。
      // 与天数同源——同一个 movedNm，既扣天数也推进度，
      // 于是「天数」和「进度条」永远不会互相矛盾。
      const progress = totalNm > 0 ? Math.min(1, traveledNmRef.current / totalNm) : 0
      useGameStore.setState({ routeProgress: progress })

      // 航段边界：进度跨过一段的分界时，弹出下一次姿态抉择。
      //
      // 这里**无论是否在本帧跨过边界都要调用**：
      // syncSegmentBoundary 内部按「当前段索引 + 1」逐段推进，
      // 跨过段界时它会把玩家送进下一段的抉择；
  // 没跨过时它会原样返回（progress < boundary），是幂等的。
      // 之前写成 `if (!hitBoundary)`，结果恰好反了——
      // 跨过边界时不触发抉择，玩家被卡在段界上动弹不得。
      state.syncSegmentBoundary(progress)

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
      lastTimeRef.current = 0
    }
  }, [isSailing, gamePhase, waypoint, simSpeed, shipSpeedKnots, windFavor, weatherSailMul, sightRangeNm, stance])

  return null
}

/** 两点大圆距离（海里）—— 瞭望用 */
function haversineNm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 0.539957
}

/** 抵达处理 */
function arrive(state: ReturnType<typeof useGameStore.getState>) {
  const target = state.waypoint
  if (!target) return
  if (target.portId) {
    state.arriveAtPort(target.portId)
    state.discoverPort(target.portId)
    useFx.getState().fx({ kind: 'cue', tone: 'plain', text: '' }, 'port')
    const port = portMap.get(target.portId)
    state.addNotification({
      id: `arrive-${target.portId}-${Date.now()}`,
      type: 'discovery',
      title: '抵达港口',
      message: `你到达了${port?.nameCn ?? '目的地'}`,
    })
  } else {
    let nearestPort: { port: typeof ports[0]; dist: number } | null = null
    for (const port of portMap.values()) {
      const dp = haversineNm(port.latitude, port.longitude, target.latitude, target.longitude)
      if (!nearestPort || dp < nearestPort.dist) {
        nearestPort = { port, dist: dp }
      }
    }
    if (nearestPort && nearestPort.dist < NEARBY_PORT_THRESHOLD_NM) {
      state.arriveAtPort(nearestPort.port.id)
      state.discoverPort(nearestPort.port.id)
      useFx.getState().fx({ kind: 'cue', tone: 'plain', text: '' }, 'port')
      state.addNotification({
        id: `arrive-${nearestPort.port.id}-${Date.now()}`,
        type: 'discovery',
        title: '抵达附近港口',
        message: `你到达了${nearestPort.port.nameCn}`,
      })
    } else {
      useGameStore.setState({
        fleet: { ...state.fleet, isSailing: false },
        currentRoute: null, routeProgress: 0, waypoint: null,
      })
      state.addNotification({
        id: `arrive-open-${Date.now()}`,
        type: 'achievement',
        title: '抵达目的地海域',
        message: '你到达了指定海域。点击地图任意位置可继续航行。',
      })
    }
  }
}
