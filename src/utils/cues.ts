/**
 * 音效定义表（纯数据，零依赖）。
 *
 * 单独成文件的原因：测试脚本需要用同一份定义来离线渲染 WAV，
 * 保证"测的就是线上那套参数"，而不是复制一份可能过时的副本。
 *
 * 每条 cue 的合成参数：
 *   root   基频（Hz）
 *   ratios 相对基频的泛音/谐波比（第一项通常是 1，即基音本身）
 *   dur    单音时长（秒）
 *   type   振荡器波形
 *   vol    峰值音量
 *   sweep  可选：终止频率倍数（>1 升调，<1 降调）
 *   noise  可选：叠加的噪声成分比例（0~1），用于打击/摩擦质感
 */

export type CueName =
  | 'coin'
  | 'sell'
  | 'impact'
  | 'discover'
  | 'milestone'
  | 'task'
  | 'ship'
  | 'sail'
  | 'port'
  | 'era'
  // —— 航行与海况 ——
  | 'cannon'        // 炮击：闷响 + 远处回声
  | 'anchor'        // 抛锚：铁链哗啦 + 沉闷撞击
  | 'thunder'       // 雷声：低频滚雷
  | 'creak'         // 船体吱嘎：木头受力的呻吟
  | 'splash'        // 落水
  | 'wave'          // 大浪拍舷
  | 'bell'          // 船钟
  // —— 界面与阅读 ——
  | 'click'         // 轻点按钮
  | 'page'          // 翻页
  | 'error'         // 操作被拒
  | 'select'        // 选中

export interface CueSpec {
  root: number
  ratios: number[]
  dur: number
  type: OscillatorType
  vol: number
  sweep?: number
  noise?: number
}

/**
 * 噪声成分的滤波参数：不同语义用不同的频段，
 * 让炮击是低频轰、雷声是滚动低频、翻页是高频摩擦。
 */
export const NOISE_PROFILE: Partial<Record<CueName, {
  type: BiquadFilterType
  freq: number
  q?: number
  sweepTo?: number
}>> = {
  cannon: { type: 'lowpass', freq: 1400, q: 0.9, sweepTo: 260 },
  anchor: { type: 'highpass', freq: 2200, q: 0.8 },
  thunder: { type: 'lowpass', freq: 700, q: 0.7, sweepTo: 160 },
  creak: { type: 'bandpass', freq: 1500, q: 5.5 },
  splash: { type: 'highpass', freq: 900, q: 0.7 },
  wave: { type: 'bandpass', freq: 1100, q: 0.6, sweepTo: 2400 },
  page: { type: 'highpass', freq: 1800, q: 0.6 },
  click: { type: 'bandpass', freq: 2600, q: 1.6 },
}

export const CUES: Record<CueName, CueSpec> = {
  // 轻提示音（金币/选中/点击）音量偏低时会被海浪本底淹没，
  // 实测提示音峰值需达到背景 1.5 倍以上玩家才听得清，故略微上调。
  coin: { root: 740, ratios: [1, 1.25, 1.5], dur: 0.09, type: 'triangle', vol: 0.22 },
  sell: { root: 987, ratios: [1, 1.19, 1.5, 2], dur: 0.22, type: 'triangle', vol: 0.20 },
  impact: { root: 95, ratios: [1, 0.6], dur: 0.32, type: 'sawtooth', vol: 0.22 },
  discover: { root: 587, ratios: [1, 1.25, 1.5, 2], dur: 0.30, type: 'sine', vol: 0.24 },
  milestone: { root: 523, ratios: [1, 1.25, 1.5, 2, 2.5], dur: 0.38, type: 'triangle', vol: 0.24 },
  task: { root: 440, ratios: [1, 1.5, 2, 3], dur: 0.24, type: 'triangle', vol: 0.21 },
  ship: { root: 110, ratios: [1, 0.67, 1.5], dur: 0.34, type: 'triangle', vol: 0.20 },
  sail: { root: 320, ratios: [1, 1.34, 1.8], dur: 0.16, type: 'triangle', vol: 0.20 },
  port: { root: 392, ratios: [1, 1.5, 2], dur: 0.26, type: 'sine', vol: 0.22 },
  // 年代钟：低沉、缓慢、尾音长——一个历史节点的分量
  era: { root: 174, ratios: [1, 1.5, 2.25], dur: 0.9, type: 'sine', vol: 0.18 },

  // 炮击：极低频闷响（正弦下滑）+ 噪声爆裂，模拟炮口在远处
  cannon: { root: 78, ratios: [1, 1.5, 2.1], dur: 0.75, type: 'sine', vol: 0.34, sweep: 0.55, noise: 0.55 },
  // 抛锚：铁链哗啦（高频噪声）+ 底部闷撞
  anchor: { root: 92, ratios: [1, 1.9], dur: 0.55, type: 'triangle', vol: 0.20, sweep: 0.7, noise: 0.42 },
  // 雷声：低频滚雷，长尾
  thunder: { root: 62, ratios: [1, 1.34, 1.9], dur: 1.15, type: 'sine', vol: 0.26, sweep: 0.42, noise: 0.35 },
  // 船体吱嘎：细窄高频摩擦，带缓慢颤动
  creak: { root: 340, ratios: [1, 1.48], dur: 0.62, type: 'sawtooth', vol: 0.075, sweep: 0.82, noise: 0.3 },
  // 落水：一记短促的水花
  splash: { root: 520, ratios: [1, 1.32], dur: 0.30, type: 'sine', vol: 0.16, sweep: 0.32, noise: 0.6 },
  // 大浪拍舷：低频推涌 + 白噪声碎沫
  wave: { root: 86, ratios: [1, 1.5], dur: 0.85, type: 'sine', vol: 0.19, sweep: 1.25, noise: 0.48 },
  // 船钟：失谐的钟体泛音
  bell: { root: 660, ratios: [1, 2.02, 2.98, 4.1], dur: 1.05, type: 'sine', vol: 0.15 },

  // 界面轻点：极短的木质敲击
  click: { root: 880, ratios: [1, 2.1], dur: 0.045, type: 'triangle', vol: 0.075, noise: 0.18 },
  // 翻页：一段短噪声摩擦
  page: { root: 1400, ratios: [1, 1.6], dur: 0.16, type: 'sine', vol: 0.055, sweep: 0.5, noise: 0.7 },
  // 操作被拒：低沉不协和的两音
  error: { root: 196, ratios: [1, 1.41], dur: 0.26, type: 'square', vol: 0.10 },
  // 选中：轻快上行
  select: { root: 622, ratios: [1, 1.5], dur: 0.10, type: 'triangle', vol: 0.10 },
}
