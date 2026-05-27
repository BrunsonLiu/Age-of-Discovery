import { Scroll, Map, Coins, Compass } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { tasks } from '@/data/tasks'
import ParchmentCard from '@/components/ui/ParchmentCard'

export default function TaskPanel() {
  const fleet = useGameStore(s => s.fleet)
  const activeTasks = useGameStore(s => s.activeTasks)
  const completedTasks = useGameStore(s => s.completedTasks)
  const acceptTask = useGameStore(s => s.acceptTask)
  const completeTask = useGameStore(s => s.completeTask)
  const setActivePanel = useGameStore(s => s.setActivePanel)

  const availableTasks = tasks.filter(
    t => t.status === 'available' && !activeTasks.some(at => at.id === t.id) && !completedTasks.includes(t.id)
  )

  const canComplete = (task: typeof activeTasks[0]) => {
    const targetPort = task.targetPortId ?? task.portId
    if (fleet.currentPortId !== targetPort) return false
    if (task.requiredGoods) {
      for (const req of task.requiredGoods) {
        const cargo = fleet.cargo.find(c => c.goodId === req.goodId)
        if (!cargo || cargo.quantity < req.quantity) return false
      }
    }
    return true
  }

  return (
    <div className="w-80 animate-slide-in-left">
      <ParchmentCard title="冒险笔记" onClose={() => setActivePanel(null)}>
        <p className="text-gold-500 text-xs font-serif italic mb-3">
          这些只是建议，你可以自由探索任何地方
        </p>
        <div className="space-y-3">
          {activeTasks.length > 0 && (
            <div>
              <h4 className="text-gold-300 font-serif text-sm mb-2 flex items-center gap-1">
                <Compass size={14} /> 旅途中的线索
              </h4>
              <div className="space-y-1.5">
                {activeTasks.map(task => (
                  <div key={task.id} className="bg-ocean-800/30 rounded p-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Map size={12} className="text-gold-400" />
                      <span className="text-gold-200 text-xs font-serif">{task.title}</span>
                    </div>
                    <p className="text-gold-500 text-xs font-serif mb-1.5">{task.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-gold-400 text-xs flex items-center gap-0.5">
                        <Coins size={10} /> {task.reward.gold}
                        {task.reward.fame && <span className="ml-1">+{task.reward.fame}声望</span>}
                      </span>
                      {canComplete(task) && (
                        <button
                          onClick={() => completeTask(task.id)}
                          className="text-safe-400 hover:text-safe-300 text-xs font-serif transition-colors"
                        >
                          ✓ 记录完成
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={activeTasks.length > 0 ? 'border-t border-gold-700/30 pt-2' : ''}>
            <h4 className="text-gold-300 font-serif text-sm mb-2 flex items-center gap-1">
              <Scroll size={14} /> 道听途说
            </h4>
            {availableTasks.length === 0 ? (
              <p className="text-gold-600 text-xs font-serif italic">暂无新的传闻</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin">
                {availableTasks.map(task => (
                  <div key={task.id} className="bg-ocean-800/30 rounded p-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Map size={12} className="text-gold-400" />
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
                <Scroll size={14} /> 已完成的旅程 ({completedTasks.length})
              </h4>
            </div>
          )}
        </div>
      </ParchmentCard>
    </div>
  )
}
