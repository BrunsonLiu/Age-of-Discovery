import { useEffect, useRef } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { ports } from '@/data/ports'
import { isOnLand } from '@/utils/landCheck'

const BASE_MOVE_DEG_PER_SEC = 0.35
const KM_PER_DEGREE = 111
const NM_PER_KM = 0.539957
const ARRIVE_THRESHOLD_DEG = 0.05
const NEARBY_PORT_THRESHOLD_DEG = 10
const SIGHT_RANGE_DEG = 4

const portMap = new Map(ports.map(p => [p.id, p]))

export default function SailingController() {
  const isSailing = useGameStore(s => s.fleet.isSailing)
  const gamePhase = useGameStore(s => s.gamePhase)
  const waypoint = useGameStore(s => s.waypoint)
  const simSpeed = useGameStore(s => s.simSpeed)
  const shipSpeedKnots = useGameStore(s => {
    if (s.fleet.ships.length === 0) return 0
    return s.fleet.ships.reduce((sum, ship) => sum + ship.speed, 0) / s.fleet.ships.length
  })

  const lastTimeRef = useRef<number>(0)
  const dayAccumRef = useRef<number>(0)
  const rafRef = useRef<number>(0)

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

    const moveDegPerSec = BASE_MOVE_DEG_PER_SEC * (shipSpeedKnots / 5) * simSpeed

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

      const currentPos = state.shipPosition
      const target = state.waypoint

      const dLat = target.latitude - currentPos[0]
      const dLng = target.longitude - currentPos[1]
      const distDeg = Math.sqrt(dLat * dLat + dLng * dLng)

      if (distDeg < ARRIVE_THRESHOLD_DEG) {
        if (target.portId) {
          state.arriveAtPort(target.portId)
          state.discoverPort(target.portId)
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
            const dp = Math.sqrt((port.latitude - target.latitude) ** 2 + (port.longitude - target.longitude) ** 2)
            if (!nearestPort || dp < nearestPort.dist) {
              nearestPort = { port, dist: dp }
            }
          }

          if (nearestPort && nearestPort.dist < NEARBY_PORT_THRESHOLD_DEG) {
            state.arriveAtPort(nearestPort.port.id)
            state.discoverPort(nearestPort.port.id)
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
        dayAccumRef.current = 0
        lastTimeRef.current = 0
        return
      }

      const moveDeg = moveDegPerSec * dt
      const actualMove = Math.min(moveDeg, distDeg)
      const ratio = actualMove / distDeg

      const newLat = currentPos[0] + dLat * ratio
      const newLng = currentPos[1] + dLng * ratio

      if (isOnLand(newLat, newLng)) {
        const safeLat = currentPos[0] + dLat * 0.5
        const safeLng = currentPos[1] + dLng * 0.5
        if (isOnLand(safeLat, safeLng)) {
          state.setShipPosition(currentPos)
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
          return
        }
        state.setShipPosition([safeLat, safeLng])
        useGameStore.setState({ routeProgress: Math.min(1, Math.max(0, 0.5)) })
        return
      }

      state.setShipPosition([newLat, newLng])

      for (const port of portMap.values()) {
        if (state.discoveredPorts.includes(port.id)) continue
        const dLatP = port.latitude - newLat
        const dLngP = port.longitude - newLng
        if (dLatP * dLatP + dLngP * dLngP < SIGHT_RANGE_DEG * SIGHT_RANGE_DEG) {
          state.discoverPort(port.id)
        }
      }

      const distMovedNm = actualMove * KM_PER_DEGREE * NM_PER_KM
      const nmPerDay = shipSpeedKnots * 24
      dayAccumRef.current += distMovedNm / nmPerDay

      while (dayAccumRef.current >= 1) {
        dayAccumRef.current -= 1
        state.advanceDay()
      }

      const progress = 1 - (Math.sqrt((target.latitude - newLat) ** 2 + (target.longitude - newLng) ** 2) / distDeg)
      useGameStore.setState({ routeProgress: Math.min(1, Math.max(0, progress)) })

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
  }, [isSailing, gamePhase, waypoint, simSpeed, shipSpeedKnots])

  return null
}