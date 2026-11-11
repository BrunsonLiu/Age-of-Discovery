/**
 * 甲板上的小艇（longboat）：位置、尺寸、以及它作为**障碍**的矩形。
 *
 * 【为什么这条船需要一条小艇】从上往下看甲板（找东西、走到船首）时，腰部的
 * 甲板是一大片空木板 —— 只有舱口、几只桶和缆桩。真实商船的腰部一定架着
 * 一条长艇（上岸、拖锚、送缆全靠它），它是**除了桅杆之外甲板上最大的东西**。
 * 少它，船就读作"一个装着桅杆的大盒子"。
 *
 * 【为什么它必须进"行走碰撞"】甲板行走只约束船体轮廓与桅杆。一条 7 米长、
 * 0.8 米高的艇摆在腰部，玩家会**直接从中间穿过去** —— 那是比"没有艇"更糟的
 * 假象（模型在，世界是空的）。所以这里同时给出障碍矩形，`deckWalk` 用它推离。
 *
 * 单位：模型米（船体局部系）。
 */
import { shipDeckHalfWidthAt } from './shipShape'

/**
 * 小艇的参数。
 *
 * 【为什么摆在左舷腰部 z=4.3】这一带是甲板最宽处（半宽 4.9 米），艇宽 1.56 米
 * 架上去之后**左舷还留 1.4 米走道**，右舷的货舱口与舱口水手都不受影响。
 * 【为什么 yaw 只有 0.06】真实是顺着船身绑在垫木上的；偏一点点只为看起来不是
 * 尺子量出来的，偏多了（>0.1）艇首就会碰到舷墙。
 */
export const BOAT = {
  x: -2.45,
  z: 4.3,
  halfLen: 3.5,
  halfWide: 0.78,
  /** 艇深（从舷缘到艇底） */
  depth: 0.86,
  /** 垫木把艇底抬离甲板的高度 */
  chockLift: 0.34,
  yaw: 0.06,
} as const

/** 小艇在 xz 平面上的占位（按轴对齐的矩形；yaw 只有 0.06，斜边差异 < 0.2 米） */
export function boatObstacle(): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return {
    minX: BOAT.x - BOAT.halfWide,
    maxX: BOAT.x + BOAT.halfWide,
    minZ: BOAT.z - BOAT.halfLen,
    maxZ: BOAT.z + BOAT.halfLen,
  }
}

/** 艇底在甲板之上多少（供渲染与判据用） */
export function boatKeelLift(): number {
  return BOAT.chockLift
}

/** 放样站位数（沿船长）与每个横截面的段数 */
export const BOAT_STATIONS = 10
export const BOAT_ARC = 5

/**
 * 小艇的艇体（纯数组，与 `shipHull` 同一套做法）。
 *
 * 【为什么不用一个压扁的半球】第一版就是"下半球拉长"——从甲板上看是一只**黑碗**：
 * 两端是圆头、没有舷弧、内部是一个黑洞（实测截图）。真实长艇的剪影靠三件事：
 * ① 两端收成尖（双头艇）；② 龙骨在中段最深、两端上翘；③ 舷缘有一点点舷弧。
 * 这三件事都是"沿船长的剖面"，所以照船体的办法放样，一共 10 站 × 5 段。
 *
 * 坐标：x 横向（左右对称）、y 竖直（**艇缘在 0**、艇底为负）、z 沿船长。
 */
export function boatHull(): { positions: Float32Array; indices: number[] } {
  const pos: number[] = []
  const idx: number[] = []
  const N = BOAT_STATIONS
  const ARC = BOAT_ARC
  for (const side of [-1, 1]) {
    const base = pos.length / 3
    for (let i = 0; i <= N; i++) {
      const t = i / N
      const e = 2 * t - 1 // −1（船尾）..+1（船首）
      const w = BOAT.halfWide * Math.sqrt(Math.max(0, 1 - e * e))
      // 舷弧：中段舷缘略高（+0.06），两端落到 0
      const rimY = 0.06 * (1 - e * e)
      // 龙骨线：中段最深
      const keelY = -BOAT.depth * Math.pow(Math.max(0, 1 - e * e), 0.35)
      for (let j = 0; j <= ARC; j++) {
        const s = j / ARC
        const x = side * w * Math.pow(s, 0.72)
        const y = keelY * (1 - Math.pow(s, 1.6)) + rimY * Math.pow(s, 1.2)
        pos.push(x, y, -BOAT.halfLen + 2 * BOAT.halfLen * t)
      }
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < ARC; j++) {
        const a = base + i * (ARC + 1) + j
        const b = a + (ARC + 1)
        // 左右两侧绕向相反，法线才都朝外
        if (side < 0) idx.push(a, b, a + 1, a + 1, b, b + 1)
        else idx.push(a, a + 1, b, a + 1, b + 1, b)
      }
    }
  }
  return { positions: new Float32Array(pos), indices: idx }
}

/**
 * 小艇最外侧（左舷方向）离舷墙内侧还有多远（米）。
 * 【为什么要这个数】它必须 > 0.5：小于半米时"从艇与舷墙之间挤过去"会在视觉上
 * 变成穿模（玩家半径 0.32，两侧各留 0.32 才走得过去）。
 */
export function boatRailGap(): number {
  const deckHalf = shipDeckHalfWidthAt(BOAT.z)
  return deckHalf - Math.abs(boatObstacle().minX)
}
