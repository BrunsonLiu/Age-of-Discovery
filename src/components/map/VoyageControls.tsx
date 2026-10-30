import { useGameStore } from '@/store/useGameStore'
import { STANCES } from '@/utils/segment'
import { Anchor, Gauge } from 'lucide-react'

/**
 * 航行中的两个「随时可做的动作」：改方针、亲手掌舵。
 *
 * 【为什么会有这个小条】
 * 原来这两件事都是**自动弹出来的全屏层**：每跨一段弹一次方针、每段起航前弹一次操舵。
 * 实测新玩家第一分钟：到地图后 12 秒内被 7 个全屏层打断，75 秒里一分钱没进账。
 * 4399 那一类游戏从不这样——同一类问题不反复问，但你随时能自己动手。
 *
 * 所以现在：
 *   · 第一段问一次方针、弹一次操舵（保证每个玩家都见过这两个机制）；
 *   · 之后不再自动弹，改成船头这个小条——想改就点，不想改就继续跑。
 * 决策权一点没少，只是从"你必须回答"变成"你想问就看"。
 *
 * 【移动端也必须能改方针】
 * 第一版只在桌面渲染，结果是手机玩家整趟都无法改方针——那是功能缺失，
 * 不是取舍。现在移动端和掮客卡一样并入底栏那个 fixed 容器按文档流往上叠
 * （两者互斥：掮客卡只在停靠时出现，这条只在航行时出现），
 * 避免任何写死的 bottom 在底栏折行时算错。
 */
export default function VoyageControls({ placement = 'float' }: { placement?: 'float' | 'stack' }) {
  const isSailing = useGameStore(s => s.fleet.isSailing)
  const gamePhase = useGameStore(s => s.gamePhase)
  const stance = useGameStore(s => s.stance)
  const pendingSegment = useGameStore(s => s.pendingSegment)
  const pendingHelm = useGameStore(s => s.pendingHelm)
  const openStancePicker = useGameStore(s => s.openStancePicker)
  const requestHelm = useGameStore(s => s.requestHelm)

  if (!isSailing || gamePhase !== 'playing' || pendingSegment || pendingHelm) return null

  const profile = STANCES[stance]

  return (
    <div className={placement === 'stack' ? 'px-2 pb-1.5' : 'absolute left-3 bottom-16 z-20'}>
      <div
        className="mx-auto flex w-fit items-center gap-1 rounded-lg px-1.5 py-1"
        style={{
          background: 'linear-gradient(180deg, #3a2b17 0%, #241a0e 100%)',
          border: '1px solid rgba(201,169,110,0.34)',
          boxShadow: 'inset 0 1px 0 rgba(255,225,170,0.12), 0 4px 12px rgba(0,0,0,0.5)',
        }}
      >
        <button
          type="button"
          onClick={openStancePicker}
          title={`当前方针：${profile.name}——${profile.hint}`}
          className="press flex items-center gap-1 rounded px-1.5 py-1 font-serif text-[11px] text-gold-200 hover:bg-gold-700/25"
        >
          <Gauge size={12} aria-hidden="true" />
          <span className="text-gold-400">{profile.icon}</span>
          {profile.name}
        </button>
        <span className="h-3.5 w-px bg-gold-700/40" aria-hidden="true" />
        <button
          type="button"
          onClick={requestHelm}
          title="亲手掌舵：评级决定这一段能少走多少海里"
          className="press flex items-center gap-1 rounded px-1.5 py-1 font-serif text-[11px] text-gold-200 hover:bg-gold-700/25"
        >
          <Anchor size={12} aria-hidden="true" />
          亲手掌舵
        </button>
      </div>
    </div>
  )
}
