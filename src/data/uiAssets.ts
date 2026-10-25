/**
 * UI 装饰资产路径（GPT 生成，F1-F6，来自 Age_of_Discovery_UI_F1-F6 文件夹包）。
 * 选型记录：同内容另有「复古航海装饰资产图集-2.png」图集版（2×3 网格带文字标签），
 * 文件夹包为已提取、去标签、带 Alpha 的独立文件，每件有效分辨率更高，故选文件夹包。
 *
 *   F1 ui_parchment    羊皮纸底纹 1024×1024 不透明（程序化柔化过，保证文字可读）
 *   F2 ui_frame_gold   金质边框 512×512 透明（border-image 切片用，勿裁）
 *      ├ ui_frame_gold_slice  治愈版九宫格：把原图中央的船徽/贝壳用横栏纹理填平，
 *      │                       否则 9-slice 横向拉伸时装饰会被拉长铺进内容区、盖住选项按钮
 *      ├ ui_frame_crest       顶部船徽（单独切出，作装饰叠加用）
 *      └ ui_frame_shell       底部贝壳（单独切出，作装饰叠加用）
 *   F3 ui_compass_rose 罗盘玫瑰 512×512 透明（无 NSEW 字母，字母由 SVG 叠）
 *   F4 ui_banner       横幅缎带 488×152 透明（已裁掉画布留白）
 *   F5 ui_pennants     三角旗串 431×128 透明（已裁掉画布留白）
 *   F6 ui_medal        成就奖章 210×417 透明（已裁掉画布留白）
 *
 * ⚠️ 质量声明（README）：AI 合成图裁切放大，非原生高清，原型测试级；
 *    F3 透明底从棋盘背景提取、边缘可能需手工修整；F4 金色偏差；F6 非星形中心。
 */

const BASE = (import.meta.env?.BASE_URL as string | undefined) || '/'

export const UI_ASSETS = {
  parchment: `${BASE}assets/ui/ui_parchment.png`,
  frameGold: `${BASE}assets/ui/ui_frame_gold.png`,
  /** border-image 专用：九宫格源，中央透明，切片值 140 */
  frameGoldSlice: `${BASE}assets/ui/ui_frame_gold_slice.png`,
  /** border-image 切片值（与 ui_frame_gold_slice.png 的角块边长一致） */
  frameGoldSliceSize: 140,
  /** 边框中央的独立装饰件（不参与 border-image，避免盖住内容） */
  frameCrest: `${BASE}assets/ui/ui_frame_crest.png`,
  frameShell: `${BASE}assets/ui/ui_frame_shell.png`,
  compassRose: `${BASE}assets/ui/ui_compass_rose.png`,
  banner: `${BASE}assets/ui/ui_banner.png`,
  pennants: `${BASE}assets/ui/ui_pennants.png`,
  medal: `${BASE}assets/ui/ui_medal.png`,
} as const
