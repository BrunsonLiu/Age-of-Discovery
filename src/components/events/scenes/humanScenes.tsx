import type { ReactElement } from 'react'
import { Sky, Stars, WaveLayer, Ship, Cloud, Sun, Moon, SkullFlag, Figure, Note, WoodBg } from '../sceneKit'

/**
 * 人文类事件场景：船只对峙、港口交易、船舱内外的人与事。
 */

/** 黑旗飘扬：两船对峙、骷髅旗、舷炮火 */
export function PirateScene(): ReactElement {
  return (
    <>
      <Sky uid="pirate" from="#241a18" mid="#3a2620" to="#5e3a24" />
      <Sun x={200} y={22} r={12} core="#d8782c" glow="rgba(216,120,44,0.3)" />
      <Cloud x={80} y={28} scale={1} fill="#2a1c18" opacity={0.9} />
      <Cloud x={320} y={24} scale={1.1} fill="#241614" opacity={0.9} />
      <WaveLayer y={94} fill="#1c2e38" speed={1} amp={6} />
      <WaveLayer y={110} fill="#12222e" speed={2} amp={6} />
      <WaveLayer y={128} fill="#0a1620" speed={3} amp={6} />
      {/* 我方船 */}
      <g className="scene-bob">
        <Ship x={120} y={112} scale={0.9} flagColor="#d4a838" />
      </g>
      {/* 海盗船 */}
      <g className="scene-bob" style={{ animationDelay: '-1.2s' }}>
        <Ship x={286} y={100} scale={0.95} flip flagColor="#101418">
          <g transform="translate(24 -36.5)">
            <SkullFlag x={-13} y={-4} scale={0.9} />
          </g>
        </Ship>
      </g>
      {/* 炮口火 */}
      <g>
        {[
          [148, 92], [158, 96],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={3 + i} fill="#f0b040" className="scene-smoke" style={{ animationDelay: `${i * 0.5}s` }} />
        ))}
        <circle cx={168} cy={90} r={5} fill="rgba(240,176,64,0.5)" className="scene-smoke" style={{ animationDelay: '-0.8s' }} />
      </g>
      {/* 弹道 */}
      <path d="M160 92 Q220 60 280 86" stroke="rgba(240,176,64,0.55)" strokeWidth="1.4" fill="none" strokeDasharray="4 4" />
      <Figure x={112} y={86} scale={0.8} />
      <Figure x={134} y={84} scale={0.8} lean={-6} />
    </>
  )
}

/** 幽灵船：雾夜、惨光、残帆 */
export function GhostShipScene(): ReactElement {
  return (
    <>
      <Sky uid="ghostship" from="#0a1018" mid="#101c26" to="#16283a" />
      <Stars uid="ghost-stars" count={20} maxY={56} />
      <Moon x={70} y={22} r={9} />
      <g>
        <circle cx={210} cy={86} r={52} fill="rgba(120,200,170,0.10)" />
        <circle cx={210} cy={86} r={30} fill="rgba(140,220,185,0.08)" />
      </g>
      <g className="scene-fog" opacity={0.4}>
        <ellipse cx={140} cy={100} rx={110} ry={10} fill="#3a5a58" />
      </g>
      <g className="scene-fog" opacity={0.3} style={{ animationDelay: '-7s' }}>
        <ellipse cx={260} cy={112} rx={100} ry={9} fill="#3a5a58" />
      </g>
      <WaveLayer y={100} fill="#0e1c28" speed={1} amp={4} />
      <WaveLayer y={116} fill="#0a1420" speed={2} amp={4} />
      <WaveLayer y={134} fill="#060e18" speed={3} amp={4} />
      <g className="scene-bob">
        <Ship x={210} y={104} scale={1.05} ghost sail="torn" flagColor="rgba(140,220,185,0.5)">
          <g transform="translate(24 -36.5)">
            <SkullFlag x={-13} y={-4} scale={0.9} />
          </g>
        </Ship>
      </g>
      {/* 鬼火浮标 */}
      {[
        [140, 92, '0s'],
        [288, 84, '-1.4s'],
      ].map(([fx, fy, d]: [number, number, string], i) => (
        <circle key={i} cx={fx} cy={fy} r={2.2} fill="rgba(150,230,190,0.8)" className="scene-twinkle" style={{ animationDelay: d }} />
      ))}
    </>
  )
}

/** 海上商队：并舷交易、货箱、金币流转 */
export function MarketScene(): ReactElement {
  return (
    <>
      <Sky uid="market" from="#3a6284" mid="#5a82a4" to="#a8b8a0" />
      <Sun x={64} y={24} r={11} />
      <Cloud x={300} y={26} scale={0.9} fill="#dfe4d8" opacity={0.8} />
      <WaveLayer y={94} fill="#1d4a68" speed={1} amp={4} />
      <WaveLayer y={110} fill="#143850" speed={2} amp={4} />
      <WaveLayer y={128} fill="#0c2438" speed={3} amp={4} />
      <g className="scene-bob">
        <Ship x={140} y={112} scale={0.95} flagColor="#d4a838" />
      </g>
      <g className="scene-bob" style={{ animationDelay: '-1s' }}>
        <Ship x={268} y={108} scale={0.9} flip flagColor="#2d5a27" />
      </g>
      {/* 并靠的货箱与绳桥 */}
      <g>
        <path d="M170 100 Q200 88 236 98" stroke="#8a6c2a" strokeWidth="1.2" fill="none" />
        <rect x={176} y={92} width={10} height={8} fill="#7a5a30" />
        <rect x={222} y={90} width={10} height={8} fill="#7a5a30" />
        <rect x={200} y={86} width={9} height={7} fill="#8a6c2a" />
      </g>
      {/* 流转的金币 */}
      {[
        [196, 74, '0s'],
        [210, 68, '-0.9s'],
        [204, 80, '-1.8s'],
      ].map(([cx, cy, d]: [number, number, string], i) => (
        <circle key={i} cx={cx} cy={cy} r={2.4} fill="#e8c86a" className="scene-sparkle" style={{ animationDelay: d }} />
      ))}
      <Figure x={168} y={90} scale={0.75} />
      <Figure x={240} y={88} scale={0.75} flip />
    </>
  )
}

/** 西班牙珍宝船队：盖伦编队、金红旗、浩浩汤汤 */
export function NavyScene(): ReactElement {
  return (
    <>
      <Sky uid="navy" from="#2a4a6a" mid="#4a6e90" to="#8a9a90" />
      <Sun x={200} y={20} r={13} core="#f0d888" glow="rgba(240,216,136,0.35)" />
      <Cloud x={70} y={30} scale={0.9} fill="#6a8298" opacity={0.7} />
      <Cloud x={330} y={26} scale={1} fill="#647c94" opacity={0.7} />
      <WaveLayer y={96} fill="#14324c" speed={1} amp={5} />
      <WaveLayer y={112} fill="#0e2438" speed={2} amp={5} />
      <WaveLayer y={130} fill="#091628" speed={3} amp={5} />
      {[
        { x: 96, y: 112, s: 0.7, d: '0s' },
        { x: 168, y: 106, s: 0.85, d: '-0.8s' },
        { x: 240, y: 110, s: 0.8, d: '-1.6s' },
        { x: 312, y: 114, s: 0.65, d: '-2.4s' },
      ].map((sh, i) => (
        <g key={i} className="scene-bob" style={{ animationDelay: sh.d }}>
          <Ship x={sh.x} y={sh.y} scale={sh.s} flagColor="#c9a96e" />
        </g>
      ))}
      {/* 护航战舰（更大更黑） */}
      <g className="scene-bob" style={{ animationDelay: '-1.2s' }}>
        <g transform="translate(204 118) scale(1.15)">
          <path d="M-34 0 H34 L28 12 Q17 18 6 12 H-28 Z" fill="#0a0f16" />
          <line x1={-8} y1={0} x2={-8} y2={-26} stroke="#0a0f16" strokeWidth="2.2" />
          <line x1={12} y1={0} x2={12} y2={-42} stroke="#0a0f16" strokeWidth="2.6" />
          <path d="M-8 -22 Q-19 -14 -8 -6 Q3 -14 -8 -22 Z" fill="#cdbd92" />
          <path d="M12 -36 Q-1 -25 12 -14 Q25 -25 12 -36 Z" fill="#e6d9b8" />
          <path d="M12 -42 L26 -38 L12 -34 Z" fill="#8b2500" className="scene-flag" />
        </g>
      </g>
    </>
  )
}

/** 沉船宝藏：深蓝海底、倾斜残骸、箱中金光 */
export function TreasureScene(): ReactElement {
  return (
    <>
      <defs>
        <linearGradient id="sea-treasure" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c4a6a" />
          <stop offset="0.5" stopColor="#123048" />
          <stop offset="1" stopColor="#081826" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="400" height="140" fill="url(#sea-treasure)" />
      {/* 水面光柱 */}
      {[
        [110, 0.5], [210, 0.8], [300, 0.4],
      ].map(([lx], i) => (
        <polygon key={i} points={`${lx - 16},0 ${lx + 16},0 ${lx + 40},140 ${lx - 40},140`} fill="rgba(150,210,235,0.07)" />
      ))}
      <path d="M0 118 Q80 108 160 118 T320 118 T400 116 V140 H0 Z" fill="#3a4a3a" opacity={0.5} />
      {/* 倾斜的残骸 */}
      <g transform="translate(190 104) rotate(-16)">
        <path d="M-52 0 L52 0 L40 14 Q20 20 0 14 Q-20 20 -40 14 Z" fill="#2a2018" />
        <path d="M-52 0 L52 0" stroke="#4a3a28" strokeWidth="2" />
        <line x1={-14} y1={0} x2={-14} y2={-30} stroke="#2a2018" strokeWidth="3" />
        <line x1={16} y1={0} x2={16} y2={-38} stroke="#2a2018" strokeWidth="3" />
        <path d="M-14 -26 Q-26 -18 -14 -10 Q-2 -18 -14 -26 Z" fill="#3a3428" />
        <path d="M16 -34 Q2 -22 16 -12 Q30 -22 16 -34 Z" fill="#3a3428" />
      </g>
      {/* 宝箱与金币 */}
      <g transform="translate(258 112)">
        <path d="M-16 0 L16 0 L12 -10 L-12 -10 Z" fill="#6b4e1e" />
        <path d="M-12 -10 Q0 -20 12 -10 Z" fill="#7a5a28" />
        <rect x={-2} y={-8} width={4} height={8} fill="#e8c86a" />
        {[
          [-18, 4], [20, 5], [-8, 8], [10, 9],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={2} fill="#e8c86a" className="scene-sparkle" style={{ animationDelay: `${i * 0.4}s` }} />
        ))}
        <circle cx={0} cy={-16} r={2.4} fill="#fff0b8" className="scene-sparkle" />
      </g>
      {/* 游鱼与气泡 */}
      {[
        [90, 60], [130, 44], [330, 52],
      ].map(([fx, fy], i) => (
        <g key={i} transform={`translate(${fx} ${fy})`} className="scene-bob" style={{ animationDelay: `${i * 0.7}s` }}>
          <path d="M-6 0 Q0 -4 6 0 Q0 4 -6 0 Z" fill="#3a6a84" />
          <path d="M6 0 L10 -3 L10 3 Z" fill="#3a6a84" />
        </g>
      ))}
      <circle cx={70} cy={80} r={1.6} fill="rgba(180,220,235,0.6)" className="scene-bob" />
      <circle cx={78} cy={66} r={1.2} fill="rgba(180,220,235,0.5)" className="scene-bob" style={{ animationDelay: '-1s' }} />
    </>
  )
}

/** 暗礁危机：船触礁、进水、浪花飞溅 */
export function ReefScene(): ReactElement {
  return (
    <>
      <Sky uid="reef" from="#1a242e" mid="#2a3a48" to="#3e5060" />
      <Cloud x={100} y={24} scale={1.2} fill="#101a22" />
      <Cloud x={300} y={20} scale={1.3} fill="#0d161e" />
      <polygon points="220,140 240,96 262,84 286,100 300,140" fill="#0a0f14" />
      <polygon points="252,140 268,104 284,96 296,140" fill="#0d131a" />
      <WaveLayer y={92} fill="#1c3444" speed={1} amp={9} />
      <WaveLayer y={108} fill="#12283a" speed={2} amp={10} />
      <WaveLayer y={128} fill="#0a1a2a" speed={3} amp={10} />
      {/* 倾斜搁浅的船 */}
      <g transform="translate(216 106) rotate(-24) scale(0.85)">
        <path d="M-34 0 H34 L28 12 Q17 18 6 12 H-28 Z" fill="#0a0f16" />
        <line x1={-8} y1={0} x2={-8} y2={-26} stroke="#0a0f16" strokeWidth="2.2" />
        <line x1={12} y1={0} x2={12} y2={-38} stroke="#0a0f16" strokeWidth="2.6" />
        <path d="M-8 -22 Q-19 -14 -8 -6 Q3 -14 -8 -22 Z" fill="#cdbd92" />
        <path d="M12 -34 Q-1 -22 12 -12 Q25 -22 12 -34 Z" fill="#e6d9b8" />
        <path d="M12 -38 L24 -34 L12 -30 Z" fill="#b8432e" className="scene-flag" />
      </g>
      {/* 进水与飞溅 */}
      <circle cx={252} cy={112} r={8} fill="rgba(220,235,240,0.55)" className="scene-sparkle" />
      <circle cx={268} cy={118} r={6} fill="rgba(220,235,240,0.45)" className="scene-sparkle" />
      <circle cx={240} cy={120} r={4} fill="rgba(220,235,240,0.4)" className="scene-sparkle" />
      <Figure x={190} y={96} scale={0.8} lean={10} />
      <Figure x={206} y={92} scale={0.75} lean={-8} />
    </>
  )
}

/** 坏血病：昏暗舱室、吊床、药箱与柠檬 */
export function DiseaseScene(): ReactElement {
  return (
    <>
      <WoodBg tone="#3a2a1a" />
      {/* 吊床与病患 */}
      <g transform="translate(120 84)">
        <path d="M-44 0 Q0 22 44 0" stroke="#6b5a3a" strokeWidth="2" fill="none" />
        <path d="M-40 2 Q0 20 40 2 Q0 14 -40 2 Z" fill="#8a7a52" />
        <circle cx="-8" cy="-6" r="3.4" fill="#1a1410" />
        <path d="M-12 -2 Q-8 -4 -4 -2 L-2 8 L-14 8 Z" fill="#1a1410" />
      </g>
      {/* 药箱（红十字） */}
      <g transform="translate(280 96)">
        <rect x={-12} y={-8} width={24} height={16} fill="#5a4020" />
        <rect x={-2} y={-5} width={4} height={10} fill="#b8432e" />
        <rect x={-5} y={-2} width={10} height={4} fill="#b8432e" />
      </g>
      {/* 柠檬（解药暗示） */}
      {[
        [240, 66, '0s'],
        [256, 58, '-1.2s'],
      ].map(([cx, cy, d]: [number, number, string], i) => (
        <g key={i} className="scene-sparkle" style={{ animationDelay: d }} transform={`translate(${cx} ${cy})`}>
          <circle r={4} fill="#d8c85a" />
          <circle r={4} fill="none" stroke="#a89840" strokeWidth="0.8" />
        </g>
      ))}
      {/* 昏暗提灯 */}
      <g transform="translate(60 40)">
        <line x1={0} y1={0} x2={0} y2={-22} stroke="#1a1410" strokeWidth="1.6" />
        <path d="M-6 -22 L6 -22 L4 -34 L-4 -34 Z" fill="#2a2018" />
        <circle cx={0} cy={-27} r={3} fill="#e8c86a" className="scene-flicker" />
      </g>
      <Figure x={330} y={96} scale={0.9} fill="#1a1410" />
    </>
  )
}

/** 甲板狂欢：夜宴、篝火、起舞的水手 */
export function FestivalScene(): ReactElement {
  return (
    <>
      <Sky uid="festival" from="#0a1220" mid="#12203a" to="#1a2c48" />
      <Stars uid="festival-stars" count={22} maxY={50} />
      <Moon x={54} y={20} r={8} />
      <WaveLayer y={98} fill="#0e2036" speed={1} amp={4} />
      <WaveLayer y={114} fill="#0a1828" speed={2} amp={4} />
      <WaveLayer y={132} fill="#071220" speed={3} amp={4} />
      {/* 甲板 */}
      <path d="M60 118 L340 118 L320 140 L80 140 Z" fill="#4a3420" />
      <path d="M60 118 L340 118" stroke="#6b4e1e" strokeWidth="2" />
      {/* 篝火 */}
      <g transform="translate(200 112)">
        <path d="M-10 6 L10 6 L7 0 L-7 0 Z" fill="#5a4020" />
        <g className="scene-flicker">
          <path d="M0 -26 Q-8 -12 -4 -2 Q0 4 4 -2 Q8 -12 0 -26 Z" fill="#e8842c" />
          <path d="M0 -18 Q-4 -8 -2 -1 Q0 2 2 -1 Q4 -8 0 -18 Z" fill="#f0d888" />
        </g>
      </g>
      {/* 朗姆酒桶 */}
      <g transform="translate(120 118)">
        <rect x={-8} y={-12} width={16} height={12} rx={2} fill="#6b4e1e" />
        <ellipse cx="0" cy={-12} rx="8" ry="2.4" fill="#8a6c2a" />
      </g>
      <g transform="translate(284 118)">
        <rect x={-8} y={-12} width={16} height={12} rx={2} fill="#6b4e1e" />
        <ellipse cx="0" cy={-12} rx="8" ry="2.4" fill="#8a6c2a" />
      </g>
      {/* 起舞的水手 */}
      <Figure x={148} y={112} scale={0.95} fill="#0a0f16" lean={-8} />
      <Figure x={172} y={114} scale={0.9} fill="#0a0f16" lean={7} />
      <Figure x={232} y={113} scale={0.95} fill="#0a0f16" lean={6} />
      <Figure x={256} y={115} scale={0.9} fill="#0a0f16" lean={-7} />
      <Note x={180} y={86} scale={0.9} delay="0s" />
      <Note x={224} y={80} scale={0.75} delay="-1.4s" />
      <Note x={252} y={90} scale={0.85} delay="-2.6s" />
    </>
  )
}

/** 叛乱的阴霾：对峙的两伙人、断旗、暗红天光 */
export function MutinyScene(): ReactElement {
  return (
    <>
      <Sky uid="mutiny" from="#181018" mid="#2a1620" to="#3e1c1c" />
      <Cloud x={110} y={24} scale={1.3} fill="#140c12" />
      <Cloud x={300} y={20} scale={1.4} fill="#120a10" />
      <ellipse cx={200} cy={26} rx={90} ry={14} fill="rgba(140,40,20,0.25)" />
      <WaveLayer y={96} fill="#1c1a24" speed={1} amp={5} />
      <WaveLayer y={112} fill="#141220" speed={2} amp={5} />
      <WaveLayer y={130} fill="#0c0a14" speed={3} amp={5} />
      <path d="M40 120 L360 120 L340 140 L60 140 Z" fill="#2e2418" />
      <path d="M40 120 L360 120" stroke="#4a3a24" strokeWidth="2" />
      {/* 断旗 */}
      <g transform="translate(340 84)">
        <line x1={0} y1={0} x2={0} y2={-44} stroke="#0a0f16" strokeWidth="2.4" />
        <path d="M0 -42 L14 -38 L10 -32 L14 -26 L0 -24 Z" fill="#5e1c10" />
      </g>
      {/* 叛乱派（左） */}
      {[80, 104, 128, 152].map((fx, i) => (
        <g key={`l${i}`}>
          <Figure x={fx} y={116} scale={0.95 + (i % 2) * 0.1} fill="#0a0f16" lean={-10 + i * 4} />
          <line x1={fx + 6} y1={106} x2={fx + 12} y2={92} stroke="#0a0f16" strokeWidth="1.4" />
        </g>
      ))}
      {/* 船长（中，站在酒桶上） */}
      <g transform="translate(200 118)">
        <rect x={-9} y={-10} width={18} height={10} rx={2} fill="#5a4020" />
        <circle cx="0" cy={-24} r="3.6" fill="#0a0f16" />
        <path d="M-4.5 -19 Q0 -22 4.5 -19 L5.5 -10 L-5.5 -10 Z" fill="#0a0f16" />
        <path d="M-5 -19 L-14 -26" stroke="#0a0f16" strokeWidth="1.8" />
      </g>
      {/* 忠顺派（右） */}
      {[248, 272, 296, 320].map((fx, i) => (
        <g key={`r${i}`}>
          <Figure x={fx} y={116} scale={0.95 + (i % 2) * 0.1} fill="#0a0f16" lean={10 - i * 4} />
          <line x1={fx - 6} y1={106} x2={fx - 12} y2={92} stroke="#0a0f16" strokeWidth="1.4" />
        </g>
      ))}
    </>
  )
}

/** 午夜走私：夜泊、灯笼、一箱见不得光的货 */
export function SmuggleScene(): ReactElement {
  return (
    <>
      <Sky uid="smuggle" from="#080e18" mid="#101a28" to="#16283a" />
      <Stars uid="smuggle-stars" count={16} maxY={44} />
      <Moon x={64} y={20} r={8} />
      <WaveLayer y={98} fill="#0c1a28" speed={1} amp={3} />
      <WaveLayer y={114} fill="#091420" speed={2} amp={3} />
      <WaveLayer y={132} fill="#060e18" speed={3} amp={3} />
      {/* 两艘小船 */}
      <g className="scene-bob">
        <g transform="translate(150 110) scale(0.62)">
          <path d="M-30 0 L30 0 L24 10 Q15 15 6 10 H-24 Z" fill="#0a0f16" />
          <line x1={0} y1={0} x2={0} y2={-30} stroke="#0a0f16" strokeWidth="2.4" />
          <path d="M0 -26 Q-10 -16 0 -8 Q10 -16 0 -26 Z" fill="#2a2a30" />
        </g>
      </g>
      <g className="scene-bob" style={{ animationDelay: '-1.1s' }}>
        <g transform="translate(256 106) scale(0.62) scale(-1, 1)">
          <path d="M-30 0 L30 0 L24 10 Q15 15 6 10 H-24 Z" fill="#0a0f16" />
          <line x1={0} y1={0} x2={0} y2={-30} stroke="#0a0f16" strokeWidth="2.4" />
          <path d="M0 -26 Q-10 -16 0 -8 Q10 -16 0 -26 Z" fill="#2a2a30" />
        </g>
      </g>
      {/* 灯笼暖光 */}
      <g transform="translate(204 92)">
        <circle r={26} fill="rgba(232,200,106,0.14)" />
        <circle r={13} fill="rgba(232,200,106,0.18)" />
        <rect x={-3} y={-2} width={6} height={8} fill="#6b4e1e" />
        <circle cy={2} r={3.4} fill="#f0d888" className="scene-flicker" />
      </g>
      {/* 货箱 */}
      <g transform="translate(204 116)">
        <rect x={-9} y={-8} width={18} height={8} fill="#5a4020" />
        <rect x={-9} y={-8} width={18} height={2} fill="#7a5a28" />
      </g>
      {/* 两个披风人影 */}
      <Figure x={182} y={104} scale={0.9} fill="#0a0f16" />
      <Figure x={228} y={104} scale={0.9} fill="#0a0f16" flip />
    </>
  )
}

/** 海图与六分仪：船舱内的导航台 */
export function ChartScene(): ReactElement {
  return (
    <>
      <WoodBg tone="#4a3420" />
      {/* 桌面 */}
      <path d="M20 128 L380 128 L380 140 L20 140 Z" fill="#3a2a18" />
      {/* 展开的海图 */}
      <g transform="translate(170 84) rotate(-4)">
        <rect x={-84} y={-34} width={168} height={68} rx={2} fill="#e8d8b0" />
        <rect x={-84} y={-34} width={168} height={68} rx={2} fill="none" stroke="#a8884a" strokeWidth="1.4" />
        {/* 罗盘玫瑰 */}
        <g transform="translate(-52 0)">
          <circle r={12} fill="none" stroke="#8a6c2a" strokeWidth="1" />
          <circle r={4} fill="none" stroke="#8a6c2a" strokeWidth="0.8" />
          <path d="M0 -12 L3 0 L0 12 L-3 0 Z" fill="#8a6c2a" />
          <path d="M-12 0 L0 -3 L12 0 L0 3 Z" fill="#b08d3a" />
        </g>
        {/* 航线 */}
        <path d="M-30 -18 Q10 -26 30 -8 T76 6" stroke="#8b2500" strokeWidth="1.4" fill="none" strokeDasharray="5 3" />
        <circle cx={-30} cy={-18} r={2.4} fill="#8b2500" />
        <path d="M70 0 l6 2 l-6 2 z" fill="#8b2500" />
        {/* 海岸线涂鸦 */}
        <path d="M-80 20 Q-60 12 -40 22 T0 20 T40 26 T80 18" stroke="#a8884a" strokeWidth="1" fill="none" />
      </g>
      {/* 六分仪 */}
      <g transform="translate(320 92) rotate(14)">
        <path d="M-16 0 A18 18 0 0 1 16 0" stroke="#c9a96e" strokeWidth="2.4" fill="none" />
        <line x1={-16} y1={0} x2={16} y2={0} stroke="#c9a96e" strokeWidth="1.6" />
        <line x1={-16} y1={0} x2={4} y2={-13} stroke="#e8dcc0" strokeWidth="1" opacity={0.8} />
        <circle cx={-16} cy={0} r={2} fill="#e8dcc0" />
      </g>
      {/* 烛台 */}
      <g transform="translate(48 96)">
        <rect x={-4} y={0} width={8} height={16} fill="#6b4e1e" />
        <line x1={0} y1={0} x2={0} y2={-12} stroke="#6b4e1e" strokeWidth="1.6" />
        <ellipse cx={0} cy={-13} rx={2.4} ry={4} fill="#f0d888" className="scene-flicker" />
      </g>
    </>
  )
}

/** 酒馆的传闻：木桌、酒瓶、烛火下的低语 */
export function TavernScene(): ReactElement {
  return (
    <>
      <WoodBg tone="#422e1c" />
      {/* 背景酒架 */}
      <g transform="translate(0 30)">
        <rect x={40} y={0} width={120} height={44} fill="#2e2014" />
        {[10, 28, 46, 64, 82, 100].map((bx) => (
          <g key={bx}>
            <rect x={40 + bx} y={6} width={8} height={14} rx={2} fill="#4a7a52" opacity={0.85} />
            <rect x={40 + bx} y={24} width={8} height={14} rx={2} fill="#8b5a2a" opacity={0.85} />
          </g>
        ))}
      </g>
      <g transform="translate(240 30)">
        <rect x={0} y={0} width={120} height={44} fill="#2e2014" />
        {[10, 28, 46, 64, 82, 100].map((bx) => (
          <g key={bx}>
            <rect x={bx} y={6} width={8} height={14} rx={2} fill="#7a4a2a" opacity={0.85} />
            <rect x={bx} y={24} width={8} height={14} rx={2} fill="#4a7a52" opacity={0.8} />
          </g>
        ))}
      </g>
      {/* 吊灯 */}
      <g transform="translate(200 18)">
        <line x1={0} y1={0} x2={0} y2={10} stroke="#1a1410" strokeWidth="1.4" />
        <path d="M-8 10 L8 10 L5 18 L-5 18 Z" fill="#2a2018" />
        <circle cy={14} r={3} fill="#f0d888" className="scene-flicker" />
      </g>
      {/* 木桌与两个低语者 */}
      <path d="M60 112 L340 112 L328 128 L72 128 Z" fill="#5a4020" />
      <path d="M60 112 L340 112" stroke="#7a5a28" strokeWidth="2" />
      <Figure x={110} y={110} scale={1.1} fill="#0a0f16" lean={8} />
      <Figure x={140} y={112} scale={1.05} fill="#0a0f16" lean={-6} />
      <Figure x={270} y={110} scale={1.1} fill="#0a0f16" lean={-8} />
      {/* 桌上的啤酒杯 */}
      <g transform="translate(200 106)">
        <path d="M-5 -8 L5 -8 L3.4 0 L-3.4 0 Z" fill="#c9a96e" />
        <path d="M-5 -8 L5 -8 L4.2 -11 L-4.2 -11 Z" fill="#e8d8b0" />
      </g>
      {/* 密语气泡 */}
      <ellipse cx={196} cy={72} rx={26} ry={12} fill="rgba(232,216,176,0.14)" />
      <Note x={180} y={66} scale={0.7} delay="0s" />
      <Note x={212} y={60} scale={0.6} delay="-1.5s" />
    </>
  )
}
