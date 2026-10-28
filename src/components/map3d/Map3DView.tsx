import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { useFxStore as useFx } from '@/store/useFxStore'
import { ports } from '@/data/ports'
import { findNearestOceanPoint, isOnLand, fetchLandGeojsonForRender } from '@/utils/landCheck'
import { getRouteGeometry, toLatLngList } from '@/utils/routePath'
import { calculateBearing } from '@/utils/navigation'
import {
  MAP_WORLD_SIZE, lonToWorldX, latToWorldZ, worldXToLon, worldZToLat,
} from '@/utils/mapProjection'
import { buildLandGeometry, PLATE_THICKNESS } from './landGeometry'
import { createPortModelKit, createShipModelKit, makePortModel, makeShipModel } from './models'
import { buildMap3DLayers } from './mapLayers3d'
import { buildMap3DBorders } from './mapBorders3d'
import { fetchBordersGeojson } from '@/utils/mapGeoJson'
import {
  createAreaLabels, createPortLabel, measureLabels, placeLabels, remeasureWhenFontsReady,
  type ScreenLabel,
} from './mapLabels3d'
import type { Waypoint } from '@/types'

/**
 * 2.5D 立体海图（实验性视图）。
 *
 * 【它是什么】
 * 把世界地图从 Leaflet 的 2D 矢量图换成 three.js 的斜俯视立体地图：
 * 平的羊皮纸陆地板块 + 沿海岸的薄边 + 微缩港口底座 + 低模帆船。
 * 风格参照《Age of Sail》——那种"斜俯视的微缩立体战略地图"。
 *
 * 【和 2D 地图的关系】
 * 这是**并列的第二种视图**，不是替换。玩法逻辑完全共用：
 *   - 船位仍由 SailingController 的 positionAtNm 推导（这里只读不写）
 *   - 航线仍走 getRouteGeometry（和 2D 的虚线是同一条几何）
 *   - 陆地碰撞仍用 landCheck 的 isOnLand / findNearestOceanPoint
 *   - 点击海面的语义与 MapClickHandler 完全一致
 * 唯一新增的是把 [lat,lng] 换算成世界坐标的投影函数（utils/mapProjection）。
 *
 * 【为什么默认不开启】
 * 2D 地图有 26 处 e2e 断言依赖 Leaflet 的 DOM 结构（.leaflet-overlay-pane path 等）。
 * 2.5D 作为可切换视图，2D 保持默认，这批断言一条都不用改。
 */
export default function Map3DView() {
  const mountRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let disposed = false
    let raf = 0
    let renderer: THREE.WebGLRenderer | null = null
    const disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = []

    const boot = async () => {
      const base = import.meta.env.BASE_URL

      // ---- 资源：陆地数据与两张贴图 ----
      //
      // 【贴图朝向的统一约定】两张贴图都是 flipY=false，即「PNG 第 0 行 = 北极」。
      //   - 陆地：landGeometry 的 UV 直接写 mercNorm(lat)，v=0 就是北 → 对齐
      //   - 海面：几何体 UV 额外翻转过一次（v=0 也是北）→ 同样对齐
      //
      // 【踩过的坑】海面贴图原本用 flipY=true，而几何体那边又把 v 翻了，
      // 等于**上下翻了两次**，南北颠倒：南极那片黑（海面贴图在陆地像素处
      // 原本就没写入）被翻到了北极，在画面上方糊出一大块黑楔形。
      // 实测：翻回来后画面上 1/4 区域的极暗像素占比 8.9% → 0.5%。
      const [geojson, landTex, seaTex] = await Promise.all([
        fetchLandGeojsonForRender(),
        loadTexture(`${base}data/painted-land.png`, false),
        loadTexture(`${base}data/painted-sea.png`, false),
      ])
      if (disposed) return

      // ---- 国界线数据 ----
      //
      // 【为什么不跟上面一起 Promise.all】
      // borders.geojson 有 640KB，是国界线的全部内容。
      // 它是**可选图层**：加载失败不该挡住地图出场。
      // 所以单独 await 且失败返回 null（见 utils/mapGeoJson.ts）。
      // 与 2D 的 MapView 共用同一个 Promise，不会下载两趟。
      const bordersGeojson = await fetchBordersGeojson()
      if (disposed) return

      const width = mount.clientWidth || 800
      const height = mount.clientHeight || 600

      // ---- 渲染器 ----
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
      renderer.setSize(width, height)
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFShadowMap
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.42
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.domElement.style.display = 'block'
      mount.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x0a1018)
      const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 200)

      // ---- 环境光：自建渐变全景，给海面一点反光 ----
      {
        const c = document.createElement('canvas'); c.width = 16; c.height = 128
        const g2 = c.getContext('2d')!
        const grad = g2.createLinearGradient(0, 0, 0, 128)
        grad.addColorStop(0, '#4d7396'); grad.addColorStop(0.5, '#22394d'); grad.addColorStop(1, '#0a151f')
        g2.fillStyle = grad; g2.fillRect(0, 0, 16, 128)
        const envTex = new THREE.CanvasTexture(c)
        envTex.mapping = THREE.EquirectangularReflectionMapping
        envTex.colorSpace = THREE.SRGBColorSpace
        const pmrem = new THREE.PMREMGenerator(renderer)
        scene.environment = pmrem.fromEquirectangular(envTex).texture
        scene.environmentIntensity = 0.72
        disposables.push(envTex)
        pmrem.dispose()
      }

      // ---- 海面 ----
      const seaGeo = new THREE.PlaneGeometry(MAP_WORLD_SIZE, MAP_WORLD_SIZE)
      seaGeo.rotateX(-Math.PI / 2)
      {
        // 世界 Z 从北(-10)到南(+10)，贴图 v=0 在北 → 翻转 v
        const uv = seaGeo.attributes.uv.array as Float32Array
        for (let i = 1; i < uv.length; i += 2) uv[i] = 1 - uv[i]
        seaGeo.attributes.uv.needsUpdate = true
      }
      const seaMat = new THREE.MeshStandardMaterial({
        map: seaTex, roughness: 0.3, metalness: 0.1, envMapIntensity: 1.3,
      })
      const sea = new THREE.Mesh(seaGeo, seaMat)
      sea.position.set(MAP_WORLD_SIZE / 2, -PLATE_THICKNESS - 0.004, 0)
      sea.receiveShadow = true
      scene.add(sea)

      const outer = new THREE.Mesh(
        new THREE.PlaneGeometry(90, 90),
        new THREE.MeshStandardMaterial({ color: 0x16303f, roughness: 0.5, metalness: 0.2 })
      )
      outer.rotation.x = -Math.PI / 2
      outer.position.set(MAP_WORLD_SIZE / 2, -PLATE_THICKNESS - 0.02, 0)
      scene.add(outer)
      disposables.push(seaGeo, seaMat, outer.geometry, outer.material)

      // ---- 陆地板块 ----
      const land = buildLandGeometry(geojson as unknown as Parameters<typeof buildLandGeometry>[0])
      const lidMat = new THREE.MeshStandardMaterial({
        map: landTex, roughness: 0.88, metalness: 0.02,
      })
      // 侧壁（海岸薄边）。
      //
      // 【为什么加 emissive】侧壁是垂直面，背对主光的那一面只被
      // ambient（冷蓝 0x3d5470）照到，实测渲染出来接近纯黑，
      // 于是整圈海岸变成一道**黑锯齿边**——看起来像毛刺，不像浮雕。
      // （改色法取证：把 wall 改成纯红，那圈黑边原位变红，确认归属。）
      //
      // 加一点暖色自发光当"底光"，让背光面仍读作暗棕色的岩壁，
      // 而不是被吃掉的黑色剪影。这是"给暗部补光"，不是"取消阴影"。
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0xa89066,
        roughness: 0.92,
        metalness: 0,
        emissive: 0x6b5334,
        emissiveIntensity: 0.55,
      })
      const lidMesh = new THREE.Mesh(land.lid, lidMat)
      lidMesh.castShadow = true; lidMesh.receiveShadow = true
      const wallMesh = new THREE.Mesh(land.wall, wallMat)
      wallMesh.castShadow = true; wallMesh.receiveShadow = true
      scene.add(lidMesh, wallMesh)
      disposables.push(land.lid, land.wall, lidMat, wallMat)

      // ---- 微缩港口 ----
      const portKit = createPortModelKit()
      const shipKit = createShipModelKit()
      disposables.push(
        portKit.base, portKit.house, portKit.roof, portKit.pole, portKit.flag,
        portKit.tower, portKit.towerTop, portKit.unit,
        portKit.baseMat, portKit.houseMat, portKit.poleMat, portKit.flagMat,
        portKit.towerMat, portKit.woodMat, portKit.deckMat,
        // 屋顶材质按 region 分四套（Record），要展开成单个材质再登记
        ...Object.values(portKit.roofMat),
        shipKit.hull, shipKit.deck, shipKit.mast, shipKit.sail, shipKit.bowsprit,
        shipKit.hullMat, shipKit.deckMat, shipKit.mastMat, shipKit.sailMat,
      )

      const portGroup = new THREE.Group()
      const portObjects: { group: THREE.Group; id: number; label: ScreenLabel }[] = []
      for (const p of ports) {
        // 模型按港口自身的 services 分三档规模 + 只有能修船的港才有干船坞
        // （见 models.ts 的 portScaleOf / makePortModel）
        const g = makePortModel(portKit, p)
        g.position.set(lonToWorldX(p.longitude), 0, latToWorldZ(p.latitude))
        g.userData.portId = p.id
        portGroup.add(g)
        const label = createPortLabel(mount, p.nameCn, g.position.x, g.position.z)
        portObjects.push({ group: g, id: p.id, label })
      }
      scene.add(portGroup)

      // ---- 区域名（海名 + 洲名）----
      //
      // 【为什么 3D 也要有】
      // 2D 的 OceanLabels 一直显示这 28 个名字。3D 里没有的话，
      // 玩家切到立体海图就失去了"我在哪个大洋/哪块大陆"的方位感——
      // 而这恰恰是斜俯视地图最难自己读出来的信息。
      // 数据来自 @/data/mapLayers，与 2D 同一份定义。
      const areaLabels = createAreaLabels(mount)
      const allLabels: ScreenLabel[] = [...portObjects.map(p => p.label), ...areaLabels]
      measureLabels(allLabels)
      remeasureWhenFontsReady(allLabels)

      // ---- 玩家船 ----
      const ship = makeShipModel(shipKit)
      // 起个名字，供 e2e 找到它（验证停泊时不会把港口模型盖住）
      ship.name = 'map3d-ship'
      scene.add(ship)

      // ---- 航线（与 2D 的虚线同一份几何） ----
      const routeMat = new LineMaterial({
        color: 0xe8c46a, linewidth: 2.4, transparent: true, opacity: 0.9,
        dashed: true, dashSize: 0.28, gapSize: 0.18,
      })
      routeMat.resolution.set(width, height)
      const routeGeo = new LineGeometry()
      const routeLine = new Line2(routeGeo, routeMat)
      routeLine.visible = false
      // 注意：这里**不能**调 computeLineDistances()——
      // 它内部要读 geometry.attributes.instanceStart.count，
      // 而 LineGeometry 还没 setPositions 过，那个属性是 undefined，直接抛错。
      // 距离属性在每次 setPositions 之后再算（见 tick 里���。
      scene.add(routeLine)
      disposables.push(routeGeo, routeMat)

      // ---- 叠加图层：洋流 / 海盗区 / 风带 ----
      //
      // 【为什么 3D 也要有这三个图层】
      // 底栏的图层开关（风向/洋流/海盗区域）在 3D 模式下**照样可见可点**——
      // BottomBar 是无条件渲染的。3D 里没有对应图层的话，
      // 玩家按下去就什么都不会发生：这是"承诺不兑现"。
      //
      // 数据来自 @/data/mapLayers，与 2D 完全同一份。
      const layers = buildMap3DLayers()
      scene.add(layers.currents, layers.pirates, layers.winds)
      for (const m of layers.lineMaterials) m.resolution.set(width, height)

      // ---- 国界线 ----
      //
      // 【为什么 3D 也要有】
      // 2D 地图画了 borders.geojson。3D 里没有的话，
      // 玩家切视图就少了一层地理信息（大洲内部的政治分界）。
      //
      // 393 段合并成**一个** LineSegments2 ——一次 draw call，
      // 逐段建 Line2 的话是 393 个 draw call，移动端会掉帧。
      const borders = bordersGeojson ? buildMap3DBorders(bordersGeojson) : null
      if (borders) {
        scene.add(borders.lines)
        borders.material.resolution.set(width, height)
      }

      // ---- 光照 ----
      const key = new THREE.DirectionalLight(0xffe4b8, 3.0)
      key.position.set(-9, 6, 6)
      key.castShadow = true
      key.shadow.mapSize.set(2048, 2048)
      key.shadow.camera.left = -14; key.shadow.camera.right = 14
      key.shadow.camera.top = 14; key.shadow.camera.bottom = -14
      key.shadow.camera.near = 1; key.shadow.camera.far = 40
      key.shadow.bias = -0.0012
      scene.add(key)
      const rim = new THREE.DirectionalLight(0x6f9fd8, 0.45)
      rim.position.set(7, 3, -6)
      scene.add(rim)
      scene.add(new THREE.AmbientLight(0x3d5470, 0.78))

      // 晕影不在这里做：游戏自带的 VintageMapOverlay 已经有一层暗角，
      // 两层叠加会把 3D 画面压到只剩 20% 亮度（实测 2D 陆地 p90=203 / 3D 陆地 p90=41）。

      // ---- 相机状态：绕着船转，玩家控制角度与距离 ----
      const camState = { fx: 10, fz: 0, dist: 15, az: 0.42, el: 0.62 }
      const camTarget = { x: 10, z: 0 }

      // ---- 交互：拖拽转视角 / 滚轮缩放 / 点击选点 ----
      let dragging = false
      let moved = 0
      let lastX = 0, lastY = 0
      const el = renderer.domElement

      const onPointerDown = (e: PointerEvent) => {
        dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY
        el.setPointerCapture(e.pointerId)
      }
      const onPointerMove = (e: PointerEvent) => {
        if (!dragging) return
        const dx = e.clientX - lastX, dy = e.clientY - lastY
        lastX = e.clientX; lastY = e.clientY
        moved += Math.abs(dx) + Math.abs(dy)
        camState.az -= dx * 0.005
        camState.el = Math.min(1.35, Math.max(0.16, camState.el + dy * 0.004))
      }
      const onPointerUp = (e: PointerEvent) => {
        dragging = false
        try { el.releasePointerCapture(e.pointerId) } catch { /* 指针已释放 */ }
        if (moved < 5) handleClick(e)
      }
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        camState.dist = Math.min(40, Math.max(3, camState.dist * (1 + e.deltaY * 0.0012)))
      }
      el.addEventListener('pointerdown', onPointerDown)
      el.addEventListener('pointermove', onPointerMove)
      el.addEventListener('pointerup', onPointerUp)
      el.addEventListener('pointercancel', onPointerUp)
      el.addEventListener('wheel', onWheel, { passive: false })

      const raycaster = new THREE.Raycaster()
      const ndc = new THREE.Vector2()

      /** 点击海面/港口 → 与 2D 的 MapClickHandler 语义一致 */
      function handleClick(e: PointerEvent) {
        const rect = el.getBoundingClientRect()
        ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(ndc, camera)

        // 先打港口模型
        const portHits = raycaster.intersectObjects(portGroup.children, true)
        let lat: number, lng: number
        if (portHits.length) {
          let o: THREE.Object3D | null = portHits[0].object
          while (o && o.userData.portId === undefined) o = o.parent
          const pid = o?.userData.portId as number | undefined
          const p = pid !== undefined ? ports.find(pp => pp.id === pid) : undefined
          if (!p) return
          lat = p.latitude; lng = p.longitude
        } else {
          const seaHits = raycaster.intersectObject(sea, false)
          if (!seaHits.length) return
          const hit = seaHits[0].point
          lng = worldXToLon(hit.x)
          lat = worldZToLat(hit.z)
        }
        applyWaypoint(lat, lng)
      }

      /** 复刻 MapClickHandler 的判定顺序 */
      function applyWaypoint(lat: number, lng: number) {
        const state = useGameStore.getState()
        const fleet = state.fleet
        const discoveredPorts = state.discoveredPorts

        const nearbyPort = ports.find(p => {
          const dLat = p.latitude - lat
          const dLng = p.longitude - lng
          return Math.sqrt(dLat * dLat + dLng * dLng) < 2
        })

        if (nearbyPort) {
          if (nearbyPort.id === fleet.currentPortId) return
          const alreadyDiscovered = discoveredPorts.includes(nearbyPort.id)
          const waypoint: Waypoint = {
            latitude: nearbyPort.latitude,
            longitude: nearbyPort.longitude,
            name: alreadyDiscovered ? nearbyPort.nameCn : undefined,
            portId: nearbyPort.id,
          }
          if (fleet.isSailing) state.changeCourse(waypoint)
          else {
            state.setWaypoint(waypoint)
            state.sailToWaypoint(waypoint)
            useFx.getState().fx({ kind: 'cue', tone: 'plain', text: '' }, 'sail')
          }
          if (alreadyDiscovered) {
            useMapStore.getState().setSelectedPortId(nearbyPort.id)
            state.setActivePanel('port')
          }
          return
        }

        let targetLat = lat, targetLng = lng
        if (isOnLand(lat, lng)) {
          const ocean = findNearestOceanPoint(lat, lng)
          if (!ocean) {
            state.addNotification({
              id: `no-ocean-${Date.now()}`,
              type: 'warning',
              title: '无法航行',
              message: '这一带是连绵的陆地，附近找不到可以出海的点。',
            })
            return
          }
          targetLat = ocean[0]; targetLng = ocean[1]
          state.addNotification({
            id: `coast-snap-${Date.now()}`,
            type: 'discovery',
            title: '航线已贴岸',
            message: '目标点在陆地上，航线自动改道至最近的海岸。',
          })
        }

        const waypoint: Waypoint = { latitude: targetLat, longitude: targetLng }
        if (fleet.isSailing) state.changeCourse(waypoint)
        else if (fleet.currentPortId || state.shipPosition) {
          state.setWaypoint(waypoint)
          state.sailToWaypoint(waypoint)
          useFx.getState().fx({ kind: 'cue', tone: 'plain', text: '' }, 'sail')
        }
      }

      // ---- 尺寸自适应 ----
      const onResize = () => {
        const w = mount.clientWidth || width
        const h = mount.clientHeight || height
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer!.setSize(w, h)
        routeMat.resolution.set(w, h)
        for (const m of layers.lineMaterials) m.resolution.set(w, h)
        borders?.material.resolution.set(w, h)
      }
      window.addEventListener('resize', onResize)

      // ---- 帧循环 ----
      const portMap = new Map(ports.map(p => [p.id, p]))
      let routeSig = ''
      const tmpV = new THREE.Vector3()

      const tick = () => {
        raf = requestAnimationFrame(tick)
        const state = useGameStore.getState()
        const fleet = state.fleet

        // 船位：港内取所在港口，航行中取船位
        let shipLat: number | null = null, shipLng: number | null = null
        if (state.shipPosition && isFinite(state.shipPosition[0]) && isFinite(state.shipPosition[1])) {
          shipLat = state.shipPosition[0]; shipLng = state.shipPosition[1]
        } else if (fleet.currentPortId) {
          const p = portMap.get(fleet.currentPortId)
          if (p) { shipLat = p.latitude; shipLng = p.longitude }
        }
        if (shipLat === null) {
          const p = portMap.get(6)
          if (p) { shipLat = p.latitude; shipLng = p.longitude }
        }

        if (shipLat !== null && shipLng !== null) {
          // 【停泊时的偏移与缩小：否则船把港口模型整个盖住】
          // 港内时船位就是港口坐标，而帆船模型（放大到不真实的大小，
          // 参考 Age of Sail 的刻意风格）比港口大一圈——
          // 线上实测：停在塞维利亚时港口**完全看不见**，只露出一个"塞维利亚"标签。
          // 刚做完的港口辨识度（三档规模 + 干船坞）在玩家最常看的位置失效，等于白做。
          // 处理：停泊时把船挪到港口一侧并缩小，读作"船停在码头边"。
          // 【判据不能用 !state.shipPosition】开局时 shipPosition 就被写成
          // 所在港口坐标（非空），那样判断会让"停泊"永远为假、修复等于没做
          // （e2e 的断言当场抓到这个：scale 仍是 0.8、中心距 0）。
          // 正确的判据是"在港内 且 没在航行"。
          const docked = !!fleet.currentPortId && !fleet.isSailing
          const sx = lonToWorldX(shipLng) + (docked ? 0.45 : 0)
          const sz = latToWorldZ(shipLat)
          ship.position.set(sx, -PLATE_THICKNESS + 0.02, sz)
          ship.scale.setScalar(docked ? 0.55 : 0.8)
          const wp = state.waypoint
          if (fleet.isSailing && wp) {
            const bearing = calculateBearing(shipLat, shipLng, wp.latitude, wp.longitude)
            ship.rotation.y = -bearing * Math.PI / 180 + Math.PI
          }
          // 相机焦点跟随船
          camTarget.x = sx; camTarget.z = sz
        }

        camState.fx += (camTarget.x - camState.fx) * 0.12
        camState.fz += (camTarget.z - camState.fz) * 0.12
        const ce = Math.cos(camState.el), se = Math.sin(camState.el)
        camera.position.set(
          camState.fx + Math.sin(camState.az) * ce * camState.dist,
          se * camState.dist,
          camState.fz + Math.cos(camState.az) * ce * camState.dist
        )
        camera.lookAt(camState.fx, 0, camState.fz)

        // 港口显隐：未发现的不显示（与 2D 的 PortMarker 一致）
        for (const po of portObjects) {
          const found = state.discoveredPorts.includes(po.id)
          po.group.visible = found
          po.label.shown = found
        }

        // 航线：与 2D 虚线共用 getRouteGeometry
        const origin = state.routeOrigin ?? state.shipPosition
        const wp = state.waypoint
        if (origin && wp) {
          const sig = `${origin[0].toFixed(3)},${origin[1].toFixed(3)}->${wp.latitude.toFixed(3)},${wp.longitude.toFixed(3)}`
          if (sig !== routeSig) {
            routeSig = sig
            const geom = getRouteGeometry([origin[0], origin[1]], [wp.latitude, wp.longitude])
            const pts = toLatLngList(geom)
            if (pts.length >= 2) {
              const arr: number[] = []
              for (const [la, ln] of pts) arr.push(lonToWorldX(ln), -PLATE_THICKNESS + 0.03, latToWorldZ(la))
              routeGeo.setPositions(arr)
              routeLine.computeLineDistances()
              routeLine.visible = true
            } else routeLine.visible = false
          }
        } else {
          routeSig = ''
          routeLine.visible = false
        }

        // 叠加图层可见性：跟着底栏的开关走
        //
        // 【为什么在帧循环里读而不是用 React state】
        // 开关状态在 useMapStore 里，而 3D 场景是命令式构建的
        // （three.js 对象不经过 React 渲染）。每帧读一次 getState()
        // 既不用重建场景，也不用引入订阅，代价可以忽略。
        //
        // 这样玩家在 3D 模式里点底栏的图层开关，画面会立刻跟着变——
        // 开关在 2D 和 3D 里指的是**同一件事**。
        const mapState = useMapStore.getState()
        layers.currents.visible = mapState.showCurrentOverlay
        layers.pirates.visible = mapState.showPirateZones
        layers.winds.visible = mapState.showWindOverlay

        // 标签投影到屏幕（港口名 + 海名 + 洲名，共用一套机制）
        //
        // 【为什么要做标签避让】
        // 直接把投影坐标写进 left/top，重叠必然发生：
        // 加勒比（哈瓦那/拿骚/圣胡安）、欧洲（里斯本/伦敦/塞维利亚）
        // 这些港口在地图上本来就挨得近，标签文字会互相压住。
        // 实测：8 个已发现港口有 **4 对重叠**（e2e 抓出来的）。
        //
        // 【为什么挪到独立模块】
        // 现在有三类标签（港口 20 + 海名 18 + 洲名 10 = 48 个）要互相避让，
        // 逻辑写在帧循环里会越来越臃肿。见 mapLabels3d.ts。
        placeLabels(allLabels, camera, width, height, tmpV)

        renderer!.render(scene, camera)
      }

      raf = requestAnimationFrame(tick)
      setPhase('ready')

      // ---- 清理 ----
      const cleanup = () => {
        cancelAnimationFrame(raf)
        window.removeEventListener('resize', onResize)
        el.removeEventListener('pointerdown', onPointerDown)
        el.removeEventListener('pointermove', onPointerMove)
        el.removeEventListener('pointerup', onPointerUp)
        el.removeEventListener('pointercancel', onPointerUp)
        el.removeEventListener('wheel', onWheel)
        for (const po of portObjects) po.label.el.remove()
        for (const l of areaLabels) l.el.remove()
        scene.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose()
        })
        for (const d of disposables) d.dispose()
        // 图层组里的 Line2 / 填充 / 箭头资源不在 disposables 里，单独释放
        layers.dispose()
        borders?.dispose()
        renderer?.dispose()
        if (renderer && renderer.domElement.parentNode === mount) {
          mount.removeChild(renderer.domElement)
        }
      }
      ;(mount as unknown as { __map3dCleanup?: () => void }).__map3dCleanup = cleanup

      // 开发调试钩子：仅在 dev 构建下暴露 three 场景，便于自动化验证
      // （生产构建会被 tree-shake 掉，实测生产包 0 命中）。
      if (import.meta.env?.DEV && typeof window !== 'undefined') {
        ;(window as unknown as { __map3d?: unknown }).__map3d = { scene, camera, renderer }
      }
    }

    boot().catch(err => {
      console.error('[Map3DView]', (err as Error)?.stack ?? err)
      if (!disposed) { setErrorMsg(String(err?.message ?? err)); setPhase('error') }
    })

    return () => {
      disposed = true
      const c = (mount as unknown as { __map3dCleanup?: () => void }).__map3dCleanup
      if (c) c()
    }
  }, [])

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: '#0a1018' }}>
      <div ref={mountRef} className="absolute inset-0" />

      {phase === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-[#e8d4a8] font-serif"
             style={{ letterSpacing: 3, background: 'linear-gradient(180deg,#16212e 0%,#0d1620 100%)' }}>
          <div className="text-center">
            <div className="text-4xl mb-4" style={{ animation: 'loadPulse 1.5s ease-in-out infinite' }}>⚓</div>
            <div>装配立体海图...</div>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-red-200 font-serif text-sm">
          立体海图加载失败：{errorMsg}
        </div>
      )}

      {phase === 'ready' && (
        <div className="absolute bottom-3 left-3 z-10 text-[#c9b489] font-serif text-xs pointer-events-none"
             style={{ textShadow: '0 1px 4px #000' }}>
          拖拽转视角 · 滚轮缩放 · 点击海面设定航向
        </div>
      )}
    </div>
  )
}

/** 载入贴图（flipY=false 时 v=0 对应图片首行，用于 Web Mercator 贴图） */
function loadTexture(url: string, flipY: boolean): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.flipY = flipY
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 4
        tex.needsUpdate = true
        resolve(tex)
      },
      undefined,
      () => reject(new Error(`贴图加载失败：${url}`)),
    )
  })
}
