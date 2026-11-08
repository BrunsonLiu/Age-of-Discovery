import { useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { WEATHER_INFO, weatherForecast } from '@/utils/weather'
import { prevailingWindBearing } from '@/utils/navigation'
import { ports } from '@/data/ports'
import WeatherIcon from '@/components/ui/WeatherIcon'
import { seasonAt, SEASON_DAYS } from '@/utils/season'
import { phenomenonAt } from '@/data/seaPhenomena'

/**
 * 天候徽章（常驻罗盘下方）：
 * - 图标 + 天候名 + 风速 + 航速影响（-% 一眼看到代价）
 * - 点击展开未来 3 天预报——出航前看一眼，是这条环境线的决策入口
 */
export default function WeatherBadge() {
  const weather = useGameStore(s => s.weather)
  const fleet = useGameStore(s => s.fleet)
  const shipPosition = useGameStore(s => s.shipPosition)
  const [open, setOpen] = useState(false)
  const info = WEATHER_INFO[weather.kind]
  /*
   * 航季徽标。
   *
   * 【为什么必须显示】季风是这一版新加的**真机制**：印度洋半年反向，
   * 同一条果阿→桑给巴尔 夏季 28 天、秋季 14 天（实测）。
   * 不告诉玩家"现在是什么季"，那条航线突然慢一倍就只是个 bug。
   * 圆点给颜色（看），文字只做确认（读）——颜色本身随季节变。
   */
  const season = seasonAt(fleet.day)

  // 预报基准位置：航行中用船位，港内用港口
  const lat = fleet.isSailing
    ? shipPosition?.[0]
    : ports.find(p => p.id === fleet.currentPortId)?.latitude
  const lng = fleet.isSailing
    ? shipPosition?.[1]
    : ports.find(p => p.id === fleet.currentPortId)?.longitude

  const forecast = lat != null && lng != null
    ? weatherForecast(weather, fleet.day, lat, lng, prevailingWindBearing(lat), 3)
    : []

  /*
   * 船此刻是不是漂在"这一季不好走的那片水"里。
   *
   * 【为什么必须说出来】那片水会让"约 N 天可达"变长、让天候事件变多。
   * 不写这一行，玩家只会看到"同一趟怎么慢了两成"，然后当成 bug。
   * 这是**因果**，不是气氛——所以它挂在预报面板里，而不是飘个提示。
   */
  /*
   * 只在**航行中**显示：港内也拿港口坐标去判会得出"你正处在风暴带里、
   * 航速 -22%"——可船根本没在走。实测秋季停在开普敦（-33.9,18.4）
   * 离风暴带圆心 215 海里，落在圈内，那一行就冒出来骗人了。
   */
  const phenomenon = fleet.isSailing && lat != null && lng != null
    ? phenomenonAt(lat, lng, fleet.day)
    : null

  const speedPct = Math.round((info.sailMul - 1) * 100)
  // 风向箭头：风吹去的方位 → 旋转角（罗盘 0°=上）
  const windArrowRotation = weather.windDir

  return (
    <div data-testid="weather-badge" className="pointer-events-auto select-none">
      {/*
        【为什么从深蓝改成铜牌】
        原来是 bg-ocean-800/75 —— 一块半透明的深海蓝。图上其他地方没有这个色：
        罗盘是铜金 + 米黄盘面、侧栏是铜木铭牌、底栏是木梁、面板是深褐。
        这块蓝在左上角读作"另一个 App 的控件"，而且它和上面的罗盘、下面的
        风向标三件东西凑在一起时，材质语言断在中间。
        换成 .plate-btn（面板按钮/铭牌同一套：深棕渐变 + 金边 + 顶棱受光）。
      */}
      <button
        onClick={() => setOpen(o => !o)}
        className="plate-btn flex items-center gap-2 px-3 py-2 rounded-md transition-colors"
        title={`${info.label}：${info.hint}（点击看预报）`}
        aria-label={`天候：${info.label}，点击展开预报`}
        aria-expanded={open}
      >
        <WeatherIcon kind={info.kind} size={18} className="text-gold-300" />
        <span className="text-gold-200 font-serif text-[13px]">{info.label}</span>
        {/* 12px 是中文 UI 下限；gold-400 在这块深棕铜牌上实测 4.41:1 < 4.5:1，
            提一档到 gold-300。对比度审计 --harbor 抓到的就是这一行。 */}
        <span className="text-gold-300 font-serif text-[12px] tabular-nums">{weather.windSpeed}节</span>
        <span
          className="inline-flex items-center gap-1"
          title={`第 ${fleet.day} 天 · ${season.name}（每 ${SEASON_DAYS} 天一个航季）`}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: season.dot }} aria-hidden="true" />
          <span className="text-gold-200 font-serif text-[12px]">{season.name}</span>
        </span>
        {speedPct !== 0 && (
          <span className={`font-serif text-xs tabular-nums ${speedPct < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
            航速{speedPct > 0 ? '+' : ''}{speedPct}%
          </span>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" style={{ transform: `rotate(${windArrowRotation}deg)` }} className="transition-transform duration-700">
          <path d="M12 2 L16 14 L12 11.5 L8 14 Z" fill="#d4a838" />
        </svg>
        <span className={`text-gold-500 text-[11px] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div
          className="mt-1 w-64 rounded-md p-2.5 space-y-2"
          style={{
            background: 'linear-gradient(180deg, #2f2214 0%, #241a0e 100%)',
            border: '1px solid rgba(160,126,60,0.6)',
            boxShadow: 'inset 0 1px 0 rgba(255,238,186,0.16), 0 8px 22px rgba(0,0,0,0.65)',
          }}
        >
          <p className="text-gold-400 font-serif text-xs leading-relaxed">{info.hint}</p>
          {/*
            季风：这条不是"设定说明"，是这一季的航行事实。
            印度洋在西南季风期东行顺、东北季风期西行顺（实测天数差 2 倍）。
          */}
          <div className="flex items-center gap-2 text-xs font-serif">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: season.dot }} aria-hidden="true" />
            <span className="text-gold-200">{season.name}季</span>
            <span className="text-gold-500">·</span>
            <span className="text-gold-300">
              印度洋{season.monsoon > 0 ? '西南季风（东行顺）' : '东北季风（西行顺）'}
            </span>
          </div>
          {phenomenon && (
            <div className="flex items-start gap-2 text-xs font-serif" data-testid="phenomenon-now">
              <span
                className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: phenomenon.color }}
                aria-hidden="true"
              />
              <span className="text-gold-200 flex-1">{phenomenon.name}</span>
              <span className="text-gold-300 tabular-nums">
                航速{Math.round((phenomenon.speedMul - 1) * 100)}%
              </span>
            </div>
          )}
          <div className="border-t border-gold-700/20 pt-1.5">
            <p className="text-gold-400 font-serif text-xs mb-1.5 tracking-wide">未来三天</p>
            {forecast.map((w, i) => {
              const fi = WEATHER_INFO[w.kind]
              return (
                <div key={i} className="flex items-center gap-2 py-0.5">
                  <span className="text-gold-500 font-serif text-xs w-10 tabular-nums">第{fleet.day + i}天</span>
                  <span className="w-4 flex justify-center text-gold-300"><WeatherIcon kind={w.kind} size={12} /></span>
                  <span className="text-gold-200 font-serif text-xs flex-1">{fi.label}</span>
                  <span className="text-gold-500 font-serif text-xs tabular-nums">{w.windSpeed}节</span>
                  <span className={`font-serif text-xs tabular-nums w-11 text-right ${fi.sailMul < 1 ? 'text-red-300' : 'text-emerald-300'}`}>
                    {Math.round((fi.sailMul - 1) * 100)}%
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-gold-600 font-serif text-xs leading-relaxed">
            天气按海域生成、持续 1-3 天；赤道无风带多雾，中纬度多暴风雨。
          </p>
        </div>
      )}
    </div>
  )
}
