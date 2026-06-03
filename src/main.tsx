import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

class GlobalErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(error: Error) {
    return { error: error.message }
  }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[App Crash]', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ position: 'fixed', inset: 0, padding: 24, color: '#c9a96e', background: '#0e1a2b', fontFamily: 'serif', overflow: 'auto' }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>⚠️ 应用启动失败</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5 }}>{this.state.error}</pre>
          <p style={{ marginTop: 16, fontSize: 12, opacity: 0.7 }}>请按 F12 打开控制台查看完整堆栈</p>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </StrictMode>,
)
