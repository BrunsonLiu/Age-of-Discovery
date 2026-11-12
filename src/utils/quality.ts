/**
 * 画质档位（低 / 中 / 高）。
 *
 * 【为什么要有】这个游戏的 3D 场景在桌面独显上跑满 60 很轻松，但在核显 / 轻薄本
 * 上会掉到 25~35 —— 而它是个"站在甲板上慢慢看"的游戏，卡一下就被记成"很卡"。
 * 光靠自适应分辨率只能救一半：像素降下去之后，draw call、后处理、装饰层仍然在花
 * 预算。所以给三档**预设**，把"哪些东西值得画"这件事一次定下来，玩家也能手动选。
 *
 * 【为什么默认 mid 而不是 high】high 的三项增量（1.5× 分辨率、颗粒、完整装饰层）
 * 在笔记本上正好是掉帧的来源；mid 保留了抗锯齿与颗粒，观感差别很小。
 */
export type QualityLevel = 'low' | 'mid' | 'high'

export interface QualityPreset {
  label: string
  /** 内部渲染分辨率的倍率上限（再乘 devicePixelRatio） */
  pixelCap: number
  /** 自适应分辨率的下限（占 pixelCap 的比例） */
  minScale: number
  /** 后处理抗锯齿 */
  fxaa: boolean
  /** 画布颗粒强度（0 = 关） */
  grain: number
  /** 辉光强度倍率 */
  bloom: number
  /** 装饰层：压顶石 / 系缆桩 / 护木 / 货堆 / 屋脊瓦 / 第三排屋顶 / 海岸的树与礁石 */
  extraDetail: boolean
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    label: '流畅',
    pixelCap: 0.85,
    minScale: 0.62,
    fxaa: false,
    grain: 0,
    bloom: 0.55,
    extraDetail: false,
  },
  mid: {
    label: '标准',
    pixelCap: 1.15,
    minScale: 0.7,
    fxaa: true,
    grain: 0.016,
    bloom: 1,
    extraDetail: true,
  },
  high: {
    label: '精细',
    pixelCap: 1.5,
    minScale: 0.78,
    fxaa: true,
    grain: 0.022,
    bloom: 1,
    extraDetail: true,
  },
}

const KEY = 'aod.quality'

/** 读档位；没存过就看设备猜一个（核少 / 无独显 → 标准偏低） */
export function loadQuality(): QualityLevel {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'low' || v === 'mid' || v === 'high') return v
  } catch {
    /* 隐私模式下 localStorage 会抛，忽略 */
  }
  return guessQuality()
}

export function saveQuality(q: QualityLevel): void {
  try {
    localStorage.setItem(KEY, q)
  } catch {
    /* 同上 */
  }
}

/**
 * 猜一个初始档位。
 *
 * 【判据只用两样】`hardwareConcurrency`（4 核及以下基本是轻薄本 / 老机）与
 * `devicePixelRatio`（Retina 屏上 1.5 倍渲染的像素量是 1 倍的两倍多）。
 * 不去读 GPU 型号：WebGL 的 `UNMASKED_RENDERER` 在部分浏览器需要额外权限，
 * 而且名字映射到性能的规则一直在变 —— 猜错的代价（少一点颗粒）比读不到小。
 */
export function guessQuality(): QualityLevel {
  if (typeof navigator === 'undefined') return 'mid'
  const cores = navigator.hardwareConcurrency ?? 4
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  if (cores <= 4) return 'low'
  if (dpr > 2 && cores <= 8) return 'mid'
  return 'mid'
}

/** 档位顺序（UI 循环用） */
export const QUALITY_ORDER: QualityLevel[] = ['low', 'mid', 'high']

/*
 * ---- 当前档位 + 订阅 ----
 * Canvas 里的渲染循环是命令式的（不是 React 渲染的一部分），所以档位变化
 * 走一个极小的发布订阅，而不是把 whole scene 塞进 React state 触发重建。
 * 切换档位时只需要：改 pixelRatio、改 post 的三个 uniform、改装饰层 visible。
 */
let current: QualityLevel = loadQuality()
const listeners = new Set<(q: QualityLevel) => void>()

export function getQuality(): QualityLevel {
  return current
}

export function getPreset(): QualityPreset {
  return QUALITY_PRESETS[current]
}

export function setQuality(q: QualityLevel): void {
  if (q === current) return
  current = q
  saveQuality(q)
  for (const f of listeners) f(q)
}

export function cycleQuality(): QualityLevel {
  const i = QUALITY_ORDER.indexOf(current)
  const next = QUALITY_ORDER[(i + 1) % QUALITY_ORDER.length]
  setQuality(next)
  return next
}

export function onQualityChange(f: (q: QualityLevel) => void): () => void {
  listeners.add(f)
  return () => listeners.delete(f)
}
