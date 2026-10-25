import { Scroll, Map, Coins, Compass, Package, CheckCircle2 } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { tasks } from '@/data/tasks'
import { goods } from '@/data/goods'
import { ports } from '@/data/ports'
import ParchmentCard from '@/components/ui/ParchmentCard'
import { useFxStore as useFx } from '@/store/useFxStore'

const typeLabels: Record<string, string> = {
  main: '主线', trade: '送货', escort: '护送', treasure: '寻宝', rescue: '救援',
}

export default function TaskPanel() {
  const fleet = useGameStore(s => s.fleet)
  const activeTasks = useGameStore(s => s.activeTasks)
  const completedTasks = useGameStore(s => s.completedTasks)
  const acceptTask = useGameStore(s => s.acceptTask)
  const completeTask = useGameStore(s => s.completeTask)
  const setActivePanel = useGameStore(s => s.setActivePanel)

  const nameOf = (id: number) => goods.find(g => g.id === id)?.nameCn ?? ''
  const cargoOf = (goodId: number) => fleet.cargo.find(c => c.goodId === goodId)?.quantity ?? 0

  const availableTasks = tasks.filter(t => {
    if (t.status !== 'available') return false
    if (activeTasks.some(at => at.id === t.id)) return false
    if (completedTasks.includes(t.id)) return false
    if (t.minDay !== undefined && fleet.day < t.minDay) return false
    if (t.portId !== null && t.portId !== undefined && fleet.currentPortId !== t.portId) return false
    return true
  })

  const canComplete = (task: typeof activeTasks[0]) => {
    const targetPort = task.targetPortId ?? task.portId
    if (fleet.currentPortId !== targetPort) return false
    if (task.requiredGoods) {
      for (const req of task.requiredGoods) {
        if (cargoOf(req.goodId) < req.quantity) return false
      }
    }
    return true
  }

  const progress = `${completedTasks.length}/${tasks.length}`

  return (
    <div className="w-80 animate-slide-in-left">
      <ParchmentCard title="冒险笔记" onClose={() => setActivePanel(null)}>
        <p className="text-gold-500 text-xs font-serif italic mb-2">
          这些只是建议，你可以自由探索任何地方
        </p>
        <div className="flex items-center justify-between text-xs text-gold-400 font-serif mb-3 border-b border-gold-700/20 pb-2">
          <span className="flex items-center gap-1"><CheckCircle2 size={12} /> 冒险进度</span>
          <span className="text-gold-300">{progress}</span>
        </div>

        <div className="space-y-3">
          {activeTasks.length > 0 && (
            <div>
              <h4 className="text-gold-300 font-serif text-sm mb-2 flex items-center gap-1">
                <Compass size={14} /> 进行中的旅程
              </h4>
              <div className="space-y-1.5">
                {activeTasks.map(task => {
                  const done = canComplete(task)
                  return (
                    <div key={task.id} className="bg-ocean-800/30 rounded p-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] px-1 py-0.5 rounded bg-gold-700/30 text-gold-300 font-serif shrink-0">
                          {typeLabels[task.type] ?? task.type}
                        </span>
                        <span className="text-gold-200 text-xs font-serif">{task.title}</span>
                      </div>
                      <p className="text-gold-500 text-xs font-serif mb-1.5">{task.description}</p>
                      {task.requiredGoods && (
                        <div className="mb-1.5 space-y-0.5">
                          {task.requiredGoods.map(req => {
                            const have = cargoOf(req.goodId)
                            const ok = have >= req.quantity
                            return (
                              <p key={req.goodId} className={`text-xs font-serif flex items-center gap-1 ${ok ? 'text-safe-400' : 'text-gold-500'}`}>
                                <Package size={10} /> 需携带 {nameOf(req.goodId)} {req.quantity} 件（现有 {have}）
                              </p>
                            )
                          })}
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-gold-400 text-xs flex items-center gap-0.5">
                          <Coins size={10} /> {task.reward.gold}
                          {task.reward.fame && <span className="ml-1">+{task.reward.fame}声望</span>}
                        </span>
                        {done ? (
                          <button
                            onClick={() => {
                              completeTask(task.id)
                              if (completedTasks.includes(task.id)) return
                              useFx.getState().fx(
                                { kind: 'banner', tone: 'safe', text: '✦ 冒险达成 ✦', sub: task.title },
                                'task',
                              )
                              useFx.getState().fx(
                                { kind: 'float', tone: 'gold', text: `+${task.reward.gold}`, sub: task.reward.fame ? `声望 +${task.reward.fame}` : undefined },
                              )
                            }}
                            className="text-safe-400 hover:text-safe-300 text-xs font-serif transition-colors"
                          >
                            ✓ 交付领赏
                          </button>
                        ) : (
                          <span className="text-gold-600 text-xs font-serif flex items-center gap-0.5">
                            <Map size={10} /> 前往{ports.find(p => p.id === (task.targetPortId ?? task.portId))?.nameCn ?? '目的地'}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className={activeTasks.length > 0 ? 'border-t border-gold-700/30 pt-2' : ''}>
            <h4 className="text-gold-300 font-serif text-sm mb-2 flex items-center gap-1">
              <Scroll size={14} /> 道听途说
            </h4>
            {availableTasks.length === 0 ? (
              <p className="text-gold-600 text-xs font-serif italic">暂无新的传闻（有些线索要航行更久才会浮现）</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin">
                {availableTasks.map(task => (
                  <div key={task.id} className="bg-ocean-800/30 rounded p-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] px-1 py-0.5 rounded bg-gold-700/30 text-gold-300 font-serif shrink-0">
                        {typeLabels[task.type] ?? task.type}
                      </span>
                      <span className="text-gold-200 text-xs font-serif">{task.title}</span>
                    </div>
                    <p className="text-gold-500 text-xs font-serif mb-1.5">{task.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-gold-400 text-xs flex items-center gap-0.5">
                        <Coins size={10} /> {task.reward.gold}
                        {task.reward.fame && <span className="ml-1">+{task.reward.fame}声望</span>}
                      </span>
                      <button
                        onClick={() => acceptTask(task.id)}
                        className="text-gold-400 hover:text-gold-300 text-xs font-serif transition-colors"
                      >
                        记下这条
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {completedTasks.length > 0 && (
            <div className="border-t border-gold-700/30 pt-2">
              <h4 className="text-gold-300 font-serif text-sm mb-2 flex items-center gap-1">
                <CheckCircle2 size={14} /> 已完成的旅程 ({completedTasks.length})
              </h4>
            </div>
          )}
        </div>
      </ParchmentCard>
    </div>
  )
}
