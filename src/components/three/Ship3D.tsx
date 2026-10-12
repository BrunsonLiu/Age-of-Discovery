import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

/**
 * 3D 帆船展示（方案 C：隔离的原型，不触碰 2D 地图与游戏逻辑）。
 *
 * 工程要点：
 * - 本模块被 FleetPanel 通过 React.lazy 动态导入，three.js 只打进这个
 *   独立 chunk，主包体积不受影响（见 README 的体积说明）。
 * - 纯几何体手工建模，无外部模型/贴图资源，体积可控。
 * - 用 requestAnimationFrame 驱动，船体轻微起伏，镜头缓慢环绕；
 *   组件卸载时彻底释放 GPU 资源，避免泄漏。
 *
 * 模型各部位按"船"的实例类型做参数化，颜色随船只类型变化。
 */

interface Ship3DProps {
  type: 'caravel' | 'galleon' | 'sloop' | 'frigate'
  name: string
}

const HULL_COLORS: Record<string, { hull: number; sail: number }> = {
  caravel: { hull: 0x6b3410, sail: 0xf0e0c0 },
  galleon: { hull: 0x5c2e0a, sail: 0xe8d5b0 },
  sloop: { hull: 0x7a4520, sail: 0xf5ead0 },
  frigate: { hull: 0x4a2c12, sail: 0xe0cba8 },
}

export default function Ship3D({ type, name }: Ship3DProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const width = mount.clientWidth || 300
    const height = mount.clientHeight || 180
    const colors = HULL_COLORS[type] ?? HULL_COLORS.caravel

    const scene = new THREE.Scene()
    scene.background = null

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100)
    camera.position.set(3.2, 2.2, 3.6)
    camera.lookAt(0, 0.35, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    renderer.shadowMap.enabled = false
    mount.appendChild(renderer.domElement)

    // --- 光照：暖色主光 + 冷色补光，贴合古航海氛围 ---
    const key = new THREE.DirectionalLight(0xffe8c0, 2.4)
    key.position.set(4, 6, 3)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x88aacc, 1.1)
    rim.position.set(-4, 2, -3)
    scene.add(rim)
    scene.add(new THREE.AmbientLight(0xffffff, 0.5))

    // --- 船体（用缩放的多面体近似出艏高艉低的曲线）---
    const ship = new THREE.Group()

    const hullGeom = new THREE.CylinderGeometry(0.55, 0.35, 0.42, 6, 1)
    hullGeom.scale(1.9, 1, 1)
    const hullMat = new THREE.MeshStandardMaterial({ color: colors.hull, roughness: 0.85, metalness: 0.05 })
    const hull = new THREE.Mesh(hullGeom, hullMat)
    hull.rotation.y = Math.PI / 6
    hull.position.y = 0.1
    ship.add(hull)

    // 甲板
    const deckGeom = new THREE.BoxGeometry(1.7, 0.06, 0.85)
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 })
    const deck = new THREE.Mesh(deckGeom, deckMat)
    deck.position.y = 0.32
    ship.add(deck)

    // --- 桅杆 ---
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x3f2410, roughness: 0.9 })
    const mastCount = type === 'galleon' || type === 'frigate' ? 3 : type === 'sloop' ? 1 : 2
    const mastXs = mastCount === 3 ? [-0.55, 0, 0.55] : mastCount === 2 ? [-0.4, 0.4] : [0]
    const mastH = type === 'galleon' ? 1.7 : 1.4
    for (const x of mastXs) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, mastH, 8), mastMat)
      mast.position.set(x, 0.32 + mastH / 2, 0)
      ship.add(mast)
    }

    // --- 风帆（横帆：帆面横跨船身，法线沿船艏方向；双面材质）---
    const sailMat = new THREE.MeshStandardMaterial({
      color: colors.sail, roughness: 0.95, side: THREE.DoubleSide,
    })
    for (const x of mastXs) {
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.62, mastH * 0.62), sailMat)
      // 默认 PlaneGeometry 法线沿 Z、横跨 X；绕 Y 旋转 90° 后横跨船身、法线沿船艏
      sail.rotation.y = Math.PI / 2
      sail.position.set(x, 0.32 + mastH * 0.62, 0)
      ship.add(sail)
      const sail2 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, mastH * 0.4), sailMat)
      sail2.rotation.y = Math.PI / 2
      sail2.position.set(x, 0.32 + mastH * 0.28, 0)
      ship.add(sail2)
    }

    // --- 船首斜桅 + 旗帜 ---
    const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.7, 6), mastMat)
    bowsprit.rotation.z = Math.PI / 2.4
    bowsprit.position.set(1.05, 0.42, 0)
    ship.add(bowsprit)

    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.16),
      new THREE.MeshStandardMaterial({ color: 0xd4a838, roughness: 0.7, side: THREE.DoubleSide })
    )
    flag.position.set(mastXs[mastXs.length - 1], 0.32 + mastH + 0.12, 0)
    ship.add(flag)

    // --- 海面（半透明圆盘）---
    const sea = new THREE.Mesh(
      new THREE.CircleGeometry(4.5, 48),
      new THREE.MeshStandardMaterial({ color: 0x2e5a6b, roughness: 0.4, metalness: 0.2, transparent: true, opacity: 0.55 })
    )
    sea.rotation.x = -Math.PI / 2
    sea.position.y = -0.05
    scene.add(sea)

    ship.position.y = 0.08
    scene.add(ship)

    // --- 动画循环 ---
    let raf = 0
    let t = 0
    const clock = new THREE.Clock()
    const animate = () => {
      const dt = clock.getDelta()
      t += dt
      // 船体轻微起伏与横摇
      ship.position.y = 0.08 + Math.sin(t * 1.1) * 0.045
      ship.rotation.z = Math.sin(t * 0.9) * 0.035
      ship.rotation.x = Math.sin(t * 0.7) * 0.02
      // 镜头缓慢环绕
      const ang = t * 0.22
      camera.position.x = Math.sin(ang) * 3.9
      camera.position.z = Math.cos(ang) * 3.9
      camera.position.y = 2.2 + Math.sin(t * 0.5) * 0.25
      camera.lookAt(0, 0.4, 0)
      renderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    setReady(true)

    // --- 尺寸自适应 ---
    const onResize = () => {
      const w = mount.clientWidth || width
      const h = mount.clientHeight || height
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    // --- 清理：释放几何体/材质/渲染器 ---
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const m = obj.material
          if (Array.isArray(m)) m.forEach(mm => mm.dispose())
          else m.dispose()
        }
      })
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [type])

  return (
    <div className="relative w-full" style={{ height: 180 }}>
      <div ref={mountRef} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-gold-600 text-xs font-serif">
          正在装配 3D 船模…
        </div>
      )}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-gold-400 text-xs font-serif pointer-events-none">
        {name}
      </div>
    </div>
  )
}
