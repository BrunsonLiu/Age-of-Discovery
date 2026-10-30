import { useEffect, useState } from 'react'
import { useFxStore, type FxEvent } from '@/store/useFxStore'
import { playCue } from '@/utils/audio'
import { EASE_STANDARD } from '@/utils/motion'

/**
 * 「兑现层」：把游戏里原本只是数字变化的结果，变成看得见、听得到的瞬间。
 *
 * 订阅 useFxStore 的一次性队列。为保证音效全部同步触发、且不会被
 * React 批处理吞掉，组件常驻挂载并自持渲染队列。
 */

interface Toast extends FxEvent {
  born: number
}

const TOAST_MS = 1600
const FLASH_MS = 460
const BANNER_MS = 2600

const TONE_TEXT: Record<string, string> = {
  gold: 'text-gold-300',
  danger: 'text-danger-400',
  safe: 'text-safe-300',
  plain: 'text-gold-100',
}

export default function FxLayer() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [flash, setFlash] = useState<{ id: string; tone: string } | null>(null)
  const [banner, setBanner] = useState<Toast | null>(null)

  useEffect(() => {
    const apply = (events: FxEvent[]) => {
      if (events.length === 0) return
      const now = Date.now()
      const newToasts: Toast[] = []

      for (const e of events) {
        // 音效逐条触发，多个音同时响起时天然形成和声
        if (e.sound) playCue(e.sound)

        if (e.kind === 'float') {
          newToasts.push({
            ...e,
            id: e.id,
            x: e.x ?? 50 + (Math.random() * 10 - 5),
            y: e.y ?? 44,
            born: now + newToasts.length * 110,
          })
        } else if (e.kind === 'flash') {
          setFlash({ id: e.id, tone: e.tone })
        } else if (e.kind === 'banner') {
          setBanner({ ...e, born: now })
        }
      }

      if (newToasts.length > 0) {
        setToasts((prev) => [...prev, ...newToasts].slice(-14))
      }
    }

    apply(useFxStore.getState().consume())
    return useFxStore.subscribe((state, prev) => {
      if (state.events === prev.events) return
      apply(useFxStore.getState().consume())
    })
  }, [])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), FLASH_MS)
    return () => clearTimeout(t)
  }, [flash])

  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), BANNER_MS)
    return () => clearTimeout(t)
  }, [banner])

  return (
    <>
      {/* 飘字：金币 / 声望 / 消耗，出现在场地中部 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 65 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className="absolute animate-float-up"
            style={{ left: `${t.x}%`, top: `${t.y}%`, transform: 'translate(-50%, -50%)', animationDelay: `${Math.max(0, t.born - Date.now())}ms` }}
            onAnimationEnd={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
          >
            <div className={`drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] text-lg font-serif font-bold whitespace-nowrap ${TONE_TEXT[t.tone] ?? TONE_TEXT.plain}`}>
              {t.text}
            </div>
            {t.sub && (
              <div className="text-[11px] font-serif text-gold-500 text-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                {t.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 全屏闪光：遭遇 / 发现 / 里程碑 */}
      {flash && (
        <div
          key={flash.id}
          className={`pointer-events-none fixed inset-0 animate-fx-flash ${
            flash.tone === 'danger' ? 'bg-danger-500/25' : flash.tone === 'safe' ? 'bg-safe-400/20' : 'bg-gold-300/20'
          }`}
          style={{ zIndex: 66 }}
        />
      )}

      {/* 屏下横幅：里程碑 / 胜利这类值得停一下的时刻 */}
      {banner && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 flex justify-center" style={{ zIndex: 67 }}>
          <div
            key={banner.id}
            className={`animate-banner-in parchment-bg border-2 rounded-xl px-6 py-3 text-center shadow-2xl ${
              banner.tone === 'safe' ? 'border-safe-400/60' : 'border-gold-400/60'
            }`}
          >
            {/* 
              标题必须用**深墨**，不能用 TONE_TEXT 里的金色。
              实测：横幅底是羊皮纸 #efdcb0，而 gold-300 是 #e5c35c，
              两者对比度只有 **1.27:1**（可读性下限 4.5:1）——标题几乎看不见，
              只剩一圈金边和一团模糊的浅黄。而横幅在每次选方针时都会弹，
              是全场最高频的一条反馈，"看不清"等于没有反馈。
              语气（gold / safe / danger）仍然保留在边框上，不丢信息。
            */}
            <div className="pirate-title text-xl text-[#2b1e0e]">{banner.text}</div>
            {banner.sub && <div className="font-serif text-xs mt-0.5 text-[#5a4526]">{banner.sub}</div>}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fxFloatUp {
          0%   { opacity: 0; transform: translate(-50%, 6px) scale(0.9); }
          18%  { opacity: 1; transform: translate(-50%, -6px) scale(1.06); }
          70%  { opacity: 1; transform: translate(-50%, -30px) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -52px) scale(1); }
        }
        /* 曲线取 utils/motion.ts 的 EASE_STANDARD（全项目一条通用曲线） */
        .animate-float-up { animation: fxFloatUp ${TOAST_MS}ms ${EASE_STANDARD} forwards; }

        @keyframes fxFxFlash {
          0%   { opacity: 0; }
          12%  { opacity: 1; }
          100% { opacity: 0; }
        }
        .animate-fx-flash { animation: fxFxFlash ${FLASH_MS}ms ease-out forwards; }

        @keyframes fxBannerIn {
          0%   { opacity: 0; transform: translateY(24px) scale(0.94); }
          12%  { opacity: 1; transform: translateY(0) scale(1); }
          86%  { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-8px) scale(0.99); }
        }
        .animate-banner-in { animation: fxBannerIn ${BANNER_MS}ms ${EASE_STANDARD} forwards; }
      `}</style>
    </>
  )
}
