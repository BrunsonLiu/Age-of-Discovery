import { Suspense, lazy, Component, type ReactNode } from 'react'

/**
 * 3D 船模的懒加载外壳。
 * three.js 体积较大，用 React.lazy 让它在独立 chunk 中按需加载——
 * 只有玩家真正展开这块 UI 时才会下载，主包保持轻量。
 * 同时用错误边界兜底：WebGL 不可用或加载失败时静默隐藏，绝不拖垮页面。
 */

const Ship3DLazy = lazy(() => import('./Ship3D'))

class QuietBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}

function Fallback() {
  return (
    <div className="w-full flex items-center justify-center text-gold-600 text-xs font-serif" style={{ height: 180 }}>
      ⛵ 正在装配 3D 船模…
    </div>
  )
}

export default function Ship3DView({ type, name }: { type: 'caravel' | 'galleon' | 'sloop' | 'frigate'; name: string }) {
  return (
    <QuietBoundary>
      <Suspense fallback={<Fallback />}>
        <Ship3DLazy type={type} name={name} />
      </Suspense>
    </QuietBoundary>
  )
}
