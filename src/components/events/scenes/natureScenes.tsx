import type { ReactElement } from 'react'
import { Sky, Stars, WaveLayer, Ship, Cloud, Lightning, Sun, Moon, Seagull, PalmTree, Note } from '../sceneKit'

/**
 * 自然类事件场景：天气、海洋、生物、岛屿。
 * 每个场景都是 400×140 的 SVG 片段，动画 class 定义在 index.css。
 */

/** 加勒比飓风：墨空、电闪、怒浪、倾斜的船 */
export function StormScene(): ReactElement {
  return (
    <>
      <Sky uid="storm" from="#101a28" mid="#1c2e42" to="#2a4058" />
      <Cloud x={110} y={26} scale={1.5} fill="#0c1420" />
      <Cloud x={290} y={18} scale={1.7} fill="#0a111c" />
      <Cloud x={200} y={38} scale={1.2} fill="#131f30" />
      <Lightning x={128} y={30} scale={1.1} />
      <Lightning x={286} y={22} scale={0.85} />
      <g className="scene-rain" opacity={0.5}>
        {[30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360].map((x) => (
          <line key={x} x1={x} y1={40} x2={x - 8} y2={58} stroke="#9fb4c8" strokeWidth="0.8" />
        ))}
      </g>
      <WaveLayer y={86} fill="#1a3248" speed={1} amp={9} />
      <WaveLayer y={100} fill="#122840" speed={2} amp={10} />
      <WaveLayer y={118} fill="#0b1c2e" speed={3} amp={11} />
      <g className="scene-sway">
        <Ship x={205} y={102} rotate={-14} scale={0.9} />
      </g>
      <Seagull x={70} y={44} scale={0.8} />
      <Seagull x={92} y={54} scale={0.6} />
    </>
  )
}

/** 顺风而行：碧空、满帆、航速线 */
export function FairwindScene(): ReactElement {
  return (
    <>
      <Sky uid="fairwind" from="#4a6a8c" to="#d8c9a3" />
      <Sun x={332} y={26} r={13} core="#f0d888" glow="rgba(240,216,136,0.4)" />
      <Cloud x={90} y={26} scale={0.9} fill="#e8e0cc" opacity={0.85} />
      <Cloud x={240} y={40} scale={0.7} fill="#e8e0cc" opacity={0.7} />
      <g opacity={0.55} stroke="#f0e8d0" strokeWidth="1.4">
        <line x1={60} y1={86} x2={110} y2={86} />
        <line x1={70} y1={96} x2={140} y2={96} />
        <line x1={50} y1={106} x2={100} y2={106} />
      </g>
      <WaveLayer y={92} fill="#1d4260" speed={1} amp={5} />
      <WaveLayer y={106} fill="#14324c" speed={2} amp={6} />
      <WaveLayer y={122} fill="#0d2036" speed={3} amp={6} />
      <g className="scene-bob">
        <Ship x={215} y={104} scale={1.05} />
      </g>
      <Seagull x={110} y={40} scale={0.9} />
      <Seagull x={140} y={50} scale={0.7} />
    </>
  )
}

/** 赤道无风带：镜海、垂帆、酷日 */
export function DoldrumsScene(): ReactElement {
  return (
    <>
      <Sky uid="doldrums" from="#b8a878" mid="#d8c89a" to="#e8d8b0" />
      <Sun x={200} y={34} r={20} core="#e8a04c" glow="rgba(232,160,76,0.45)" />
      <g opacity={0.35} stroke="#c8b078" strokeWidth="1">
        <line x1={40} y1={62} x2={90} y2={62} />
        <line x1={280} y1={70} x2={340} y2={70} />
      </g>
      <rect x="0" y={78} width="400" height="62" fill="#9aa87c" opacity={0.35} />
      <WaveLayer y={88} fill="#7e9470" speed={1} amp={2} />
      <WaveLayer y={104} fill="#6a8062" speed={2} amp={2} />
      <WaveLayer y={122} fill="#566a50" speed={3} amp={2} />
      <g className="scene-sway">
        <Ship x={200} y={104} sail="droop" scale={0.95} />
      </g>
      <FigureSweat x={182} y={74} />
      <FigureSweat x={222} y={72} />
    </>
  )
}

function FigureSweat({ x, y }: { x: number; y: number }): ReactElement {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="0" cy="-13" r="2.6" fill="#0a0f16" />
      <path d="M-3 -9 Q0 -11 3 -9 L4 0 L-4 0 Z" fill="#0a0f16" />
      <path d="M5 -12 q3 2 0 4" stroke="#7ab8d8" strokeWidth="1" fill="none" className="scene-twinkle" />
    </g>
  )
}

/** 好望角：怒海 + 礁崖 + 灯塔光束 */
export function CapeScene(): ReactElement {
  return (
    <>
      <Sky uid="cape" from="#141f30" mid="#22344a" to="#3a5068" />
      <Cloud x={90} y={22} scale={1.4} fill="#0d1520" />
      <Cloud x={300} y={18} scale={1.5} fill="#0b131f" />
      <polygon points="0,140 0,60 26,44 52,72 74,52 96,140" fill="#0a1018" />
      <g transform="translate(46 46)">
        <rect x="-2.5" y="-16" width="5" height="18" fill="#0a1018" />
        <circle cx="0" cy="-18" r="3.4" fill="#0a1018" />
        <circle cx="0" cy="-18" r="1.6" fill="#f0d888" className="scene-flicker" />
        <polygon points="0,-18 120,-34 120,-2" fill="rgba(240,216,136,0.10)" className="scene-beam" />
      </g>
      <WaveLayer y={88} fill="#1c3a52" speed={1} amp={10} />
      <WaveLayer y={104} fill="#142c44" speed={2} amp={11} />
      <WaveLayer y={124} fill="#0a1a2c" speed={3} amp={12} />
      <circle cx={72} cy={110} r={7} fill="rgba(230,238,240,0.5)" className="scene-sparkle" />
      <circle cx={96} cy={118} r={5} fill="rgba(230,238,240,0.4)" className="scene-sparkle" />
      <g className="scene-sway">
        <Ship x={250} y={104} rotate={-16} scale={0.85} />
      </g>
    </>
  )
}

/** 迷雾深处：灰海、雾带、若隐若现的船 */
export function FogScene(): ReactElement {
  return (
    <>
      <Sky uid="fog" from="#4a5a68" mid="#5e6e78" to="#6e7c84" />
      <Moon x={320} y={26} r={10} />
      <g className="scene-fog" opacity={0.5}>
        <ellipse cx={80} cy={64} rx={90} ry={13} fill="#c8d2d8" />
        <ellipse cx={220} cy={74} rx={110} ry={11} fill="#c8d2d8" />
      </g>
      <g className="scene-fog" opacity={0.35} style={{ animationDelay: '-6s' }}>
        <ellipse cx={160} cy={54} rx={100} ry={10} fill="#d8e0e4" />
      </g>
      <WaveLayer y={96} fill="#3e5060" speed={1} amp={3} />
      <WaveLayer y={112} fill="#32455a" speed={2} amp={3} />
      <WaveLayer y={128} fill="#28394c" speed={3} amp={3} />
      <g opacity={0.4} className="scene-bob">
        <Ship x={210} y={108} scale={0.8} />
      </g>
      <g opacity={0.25} className="scene-bob" style={{ animationDelay: '-1.4s' }}>
        <Ship x={90} y={98} scale={0.5} flip />
      </g>
    </>
  )
}

/** 流星雨之夜：星空、火痕、甲板上的仰望者 */
export function MeteorScene(): ReactElement {
  return (
    <>
      <Sky uid="meteor" from="#0a1220" mid="#101d30" to="#1a2c44" />
      <Stars uid="meteor-stars" count={34} maxY={78} />
      {[
        { x: 70, y: 16, d: '0s' },
        { x: 180, y: 10, d: '-1.8s' },
        { x: 260, y: 22, d: '-3.4s' },
        { x: 330, y: 12, d: '-4.6s' },
      ].map((m, i) => (
        <g key={i} className="scene-meteor" style={{ animationDelay: m.d }}>
          <line x1={m.x} y1={m.y} x2={m.x - 26} y2={m.y - 15} stroke="#f0e6c8" strokeWidth="1.6" />
          <circle cx={m.x} cy={m.y} r="1.8" fill="#fffbe8" />
        </g>
      ))}
      <WaveLayer y={98} fill="#0e2036" speed={1} amp={4} />
      <WaveLayer y={114} fill="#0a1828" speed={2} amp={4} />
      <WaveLayer y={132} fill="#071220" speed={3} amp={4} />
      <Ship x={130} y={106} scale={0.85} />
      <g transform="translate(140 78)">
        <circle cx="0" cy="-13" r="2.6" fill="#0a0f16" />
        <path d="M-3 -9 Q0 -11 3 -9 L4 0 L-4 0 Z" fill="#0a0f16" />
      </g>
    </>
  )
}

/** 未知岛屿：椰林、瀑布、白沙、锚泊的船 */
export function IslandScene(): ReactElement {
  return (
    <>
      <Sky uid="island" from="#3f6a8c" to="#e0d0a8" />
      <Sun x={60} y={26} r={12} />
      <Cloud x={300} y={24} scale={0.8} fill="#efe6cc" opacity={0.8} />
      <ellipse cx={210} cy={104} rx={92} ry={16} fill="#e0c890" />
      <ellipse cx={210} cy={100} rx={92} ry={14} fill="#eed9a4" />
      <path d="M170 100 Q186 62 214 56 Q244 62 254 100 Z" fill="#3e6e46" />
      <path d="M214 56 Q220 84 224 100" stroke="#5a4020" strokeWidth="1.6" fill="none" />
      <path d="M216 62 Q214 80 212 98" stroke="#e8e8d8" strokeWidth="2" fill="none" opacity={0.9} />
      <PalmTree x={166} y={98} scale={0.9} />
      <PalmTree x={258} y={98} scale={0.85} flip />
      <PalmTree x={186} y={102} scale={0.65} />
      <WaveLayer y={110} fill="#2a5a7c" speed={1} amp={4} />
      <WaveLayer y={122} fill="#14324c" speed={2} amp={4} />
      <WaveLayer y={136} fill="#0d2036" speed={3} amp={4} />
      <Ship x={86} y={116} scale={0.7} />
      <Seagull x={300} y={44} scale={0.8} />
      <Seagull x={324} y={52} scale={0.6} />
    </>
  )
}

/** 鲸群邂逅：巨兽、喷泉、小勘 */
export function WhaleScene(): ReactElement {
  return (
    <>
      <Sky uid="whale" from="#2a4a68" mid="#3e6484" to="#54789c" />
      <Sun x={340} y={24} r={11} core="#f0d888" />
      <Cloud x={90} y={28} scale={0.9} fill="#5e7c9c" opacity={0.7} />
      <WaveLayer y={94} fill="#14324c" speed={1} amp={5} />
      <WaveLayer y={110} fill="#0e2438" speed={2} amp={5} />
      <WaveLayer y={128} fill="#091628" speed={3} amp={5} />
      <Ship x={92} y={112} scale={0.6} />
      {/* 鲸一：身躯 + 尾鳍 + 喷泉 */}
      <g className="scene-bob">
        <g transform="translate(250 96)">
          <path d="M-40 6 Q-20 -8 8 -2 Q28 2 34 8 Q20 14 -10 12 Q-30 12 -40 6 Z" fill="#101c28" />
          <path d="M34 8 Q46 2 50 -6 Q44 4 38 8 Z" fill="#101c28" />
          <path d="M-40 6 Q-52 0 -56 -8 Q-46 2 -38 4 Z" fill="#101c28" />
        </g>
        <g transform="translate(236 74)">
          <path d="M0 14 Q-4 4 -2 -4 Q0 -12 2 -4 Q4 4 0 14 Z" fill="rgba(220,235,240,0.85)" className="scene-spout" />
          <circle cx="-3" cy="16" r="2" fill="rgba(220,235,240,0.7)" />
          <circle cx="4" cy="18" r="1.6" fill="rgba(220,235,240,0.6)" />
        </g>
      </g>
      {/* 鲸二：母子鲸 */}
      <g className="scene-bob" style={{ animationDelay: '-1.6s' }}>
        <g transform="translate(320 112) scale(0.6)">
          <path d="M-40 6 Q-20 -8 8 -2 Q28 2 34 8 Q20 14 -10 12 Q-30 12 -40 6 Z" fill="#152230" />
          <path d="M34 8 Q46 2 50 -6 Q44 4 38 8 Z" fill="#152230" />
        </g>
        <g transform="translate(306 96) scale(0.6)">
          <path d="M0 10 Q-3 3 -1 -3 Q1 -9 3 -3 Q5 3 0 10 Z" fill="rgba(220,235,240,0.7)" className="scene-spout" />
        </g>
      </g>
    </>
  )
}

/** 海豚护航：三只跃浪海豚 + 船首浪花 */
export function DolphinScene(): ReactElement {
  return (
    <>
      <Sky uid="dolphin" from="#3a6a8c" to="#e8d8b0" />
      <Sun x={54} y={24} r={12} />
      <Cloud x={280} y={26} scale={0.85} fill="#efe6cc" opacity={0.75} />
      <WaveLayer y={94} fill="#1d4a68" speed={1} amp={5} />
      <WaveLayer y={110} fill="#143850" speed={2} amp={5} />
      <WaveLayer y={128} fill="#0c2438" speed={3} amp={5} />
      <Ship x={150} y={112} scale={0.95} />
      {[
        { x: 208, y: 96, d: '0s', s: 1 },
        { x: 240, y: 88, d: '-0.7s', s: 0.85 },
        { x: 272, y: 98, d: '-1.3s', s: 0.7 },
      ].map((dp, i) => (
        <g key={i} className="scene-leap" style={{ animationDelay: dp.d }} transform={`translate(${dp.x} ${dp.y}) scale(${dp.s})`}>
          <path d="M-16 4 Q-8 -8 4 -4 Q14 -1 18 4 Q10 8 -2 8 Q-10 8 -16 4 Z" fill="#1c3348" />
          <path d="M-16 4 Q-24 -2 -26 -12 Q-18 -4 -12 2 Z" fill="#1c3348" />
          <path d="M2 -6 Q6 -14 12 -12 Q8 -6 8 -2 Z" fill="#2e4a60" />
          <circle cx="13" cy="1" r="1" fill="#0a0f16" />
        </g>
      ))}
      <circle cx={214} cy={104} r={4} fill="rgba(230,240,245,0.6)" className="scene-sparkle" />
      <circle cx={246} cy={100} r={3} fill="rgba(230,240,245,0.5)" className="scene-sparkle" />
    </>
  )
}

/** 金枪鱼汛：沸腾的银色海面 + 围网 */
export function SchoolScene(): ReactElement {
  return (
    <>
      <Sky uid="school" from="#3a6284" mid="#54789c" to="#c8b888" />
      <Sun x={330} y={26} r={12} />
      <WaveLayer y={92} fill="#1d4a68" speed={1} amp={4} />
      <WaveLayer y={108} fill="#143850" speed={2} amp={4} />
      <WaveLayer y={126} fill="#0c2438" speed={3} amp={4} />
      {/* 沸腾鱼群 */}
      <g>
        {[
          [180, 96], [205, 88], [232, 98], [258, 86], [150, 102], [286, 96], [220, 106], [170, 88], [300, 104],
        ].map(([fx, fy], i) => (
          <g key={i} transform={`translate(${fx} ${fy})`} className="scene-bob" style={{ animationDelay: `${i * 0.22}s` }}>
            <path d="M-5 0 Q0 -3 5 0 Q0 3 -5 0 Z" fill="#b8c8d8" />
            <path d="M5 0 L8 -2 L8 2 Z" fill="#b8c8d8" />
          </g>
        ))}
        <ellipse cx={220} cy={98} rx={70} ry={10} fill="rgba(184,200,216,0.18)" />
      </g>
      <Ship x={110} y={116} scale={0.85}>
        <path d="M-20 -14 Q10 -34 44 -16" stroke="#c9a96e" strokeWidth="1.2" fill="none" strokeDasharray="3 2" />
      </Ship>
    </>
  )
}

/** 火山岛喷发：赤云、岩浆、灰雨 */
export function VolcanoScene(): ReactElement {
  return (
    <>
      <Sky uid="volcano" from="#1a1218" mid="#3a1c18" to="#5e2c18" />
      <ellipse cx={200} cy={30} rx={150} ry={26} fill="rgba(120,40,20,0.35)" />
      <polygon points="150,140 178,58 200,44 224,58 252,140" fill="#241a18" />
      <polygon points="186,58 200,44 216,58 208,66 192,66" fill="#5e1c0c" />
      <g transform="translate(200 52)">
        <g className="scene-erupt">
          <path d="M-12 0 Q-6 -34 0 -46 Q8 -30 12 0 Z" fill="#c24a18" />
          <path d="M-6 -6 Q-2 -28 2 -38 Q6 -24 8 -6 Z" fill="#e8842c" />
        </g>
        {[
          [-14, -30], [12, -36], [-4, -48], [18, -22], [-20, -18],
        ].map(([ex, ey], i) => (
          <circle key={i} cx={ex} cy={ey} r={1.6 + (i % 3) * 0.7} fill="#f0b040" className="scene-smoke" style={{ animationDelay: `${i * 0.4}s` }} />
        ))}
      </g>
      <ellipse cx={200} cy={52} rx={34} ry={10} fill="rgba(60,50,48,0.6)" />
      <path d="M196 140 Q200 118 206 100 Q210 88 206 74" stroke="#c24a18" strokeWidth="3" fill="none" opacity={0.85} />
      <path d="M206 140 Q214 122 220 106" stroke="#a83810" strokeWidth="2" fill="none" opacity={0.7} />
      <WaveLayer y={112} fill="#2a1c18" speed={1} amp={4} />
      <WaveLayer y={126} fill="#1c1210" speed={2} amp={4} />
      <WaveLayer y={138} fill="#120c0a" speed={3} amp={4} />
      <g className="scene-bob">
        <Ship x={60} y={118} scale={0.6} />
      </g>
    </>
  )
}

/** 海妖的歌声：暮色礁岩、魅影、飘音符 */
export function SirenScene(): ReactElement {
  return (
    <>
      <Sky uid="siren" from="#241a38" mid="#4a2e50" to="#7a4a58" />
      <Moon x={322} y={24} r={9} />
      <polygon points="296,140 300,84 318,70 336,92 344,140" fill="#0c0a14" />
      <polygon points="252,140 258,102 272,94 284,116 288,140" fill="#100c18" opacity={0.9} />
      <g transform="translate(316 70)">
        {/* 礁石上的魅影 */}
        <circle cx="0" cy="-14" r="3.4" fill="rgba(220,200,230,0.75)" />
        <path d="M-5 -10 Q0 -13 5 -10 L7 6 L-7 6 Z" fill="rgba(200,180,220,0.55)" />
        <path d="M-6 -8 Q-16 -2 -12 12" stroke="rgba(220,200,230,0.6)" strokeWidth="1.4" fill="none" />
        <path d="M6 -8 Q16 -2 12 12" stroke="rgba(220,200,230,0.6)" strokeWidth="1.4" fill="none" />
      </g>
      <Note x={296} y={56} scale={0.9} delay="0s" />
      <Note x={280} y={44} scale={0.7} delay="-1.1s" />
      <Note x={306} y={40} scale={0.8} delay="-2s" />
      <WaveLayer y={104} fill="#1c1630" speed={1} amp={4} />
      <WaveLayer y={118} fill="#141026" speed={2} amp={4} />
      <WaveLayer y={134} fill="#0c0a1a" speed={3} amp={4} />
      <g className="scene-sway">
        <Ship x={130} y={110} rotate={6} scale={0.8} />
      </g>
    </>
  )
}

/** 北海巨妖：触手破水、围困商船 */
export function KrakenScene(): ReactElement {
  return (
    <>
      <Sky uid="kraken" from="#0a1418" mid="#12242c" to="#1c3844" />
      <Cloud x={110} y={24} scale={1.3} fill="#081018" />
      <Cloud x={300} y={20} scale={1.4} fill="#0a121c" />
      <WaveLayer y={92} fill="#123040" speed={1} amp={8} />
      <WaveLayer y={108} fill="#0d2430" speed={2} amp={8} />
      <WaveLayer y={128} fill="#081820" speed={3} amp={8} />
      {/* 触手们 */}
      <g transform="translate(120 128)">
        <g className="scene-tentacle">
          <path d="M0 0 Q-14 -30 -4 -56 Q6 -76 -2 -96" stroke="#1e4a3a" strokeWidth="13" fill="none" strokeLinecap="round" />
          <path d="M0 0 Q-14 -30 -4 -56 Q6 -76 -2 -96" stroke="#2e6a50" strokeWidth="7" fill="none" strokeLinecap="round" opacity={0.7} />
          {[[-8, -26], [-2, -50], [0, -74]].map(([sx, sy], i) => (
            <circle key={i} cx={sx} cy={sy} r="1.6" fill="#0d2a20" />
          ))}
        </g>
      </g>
      <g transform="translate(292 132)">
        <g className="scene-tentacle" style={{ animationDelay: '-1.2s' }}>
          <path d="M0 0 Q12 -26 4 -50 Q-4 -70 2 -88" stroke="#1e4a3a" strokeWidth="11" fill="none" strokeLinecap="round" />
          <path d="M0 0 Q12 -26 4 -50 Q-4 -70 2 -88" stroke="#2e6a50" strokeWidth="6" fill="none" strokeLinecap="round" opacity={0.7} />
          {[[6, -24], [0, -46], [-2, -68]].map(([sx, sy], i) => (
            <circle key={i} cx={sx} cy={sy} r="1.4" fill="#0d2a20" />
          ))}
        </g>
      </g>
      {/* 缠住船体的主触手 */}
      <g className="scene-tentacle" style={{ animationDelay: '-0.6s' }}>
        <path d="M200 130 Q186 100 196 78 Q206 58 200 40" stroke="#24523e" strokeWidth="16" fill="none" strokeLinecap="round" />
        <path d="M200 130 Q186 100 196 78 Q206 58 200 40" stroke="#347052" strokeWidth="8" fill="none" strokeLinecap="round" opacity={0.65} />
        {[[193, 112], [191, 88], [199, 64]].map(([sx, sy], i) => (
          <circle key={i} cx={sx} cy={sy} r="1.8" fill="#0d2a20" />
        ))}
      </g>
      <g className="scene-sway">
        <Ship x={200} y={106} rotate={-18} scale={0.85} />
      </g>
      <circle cx={120} cy={96} r={2} fill="rgba(150,200,190,0.5)" className="scene-bob" />
      <circle cx={300} cy={88} r={1.6} fill="rgba(150,200,190,0.5)" className="scene-bob" style={{ animationDelay: '-1s' }} />
    </>
  )
}
