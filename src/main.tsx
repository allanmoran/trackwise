import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { StyledEngineProvider } from '@mui/material/styles'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { muiTheme } from './theme/muiTheme'
import AppLayout from './components/layout/AppLayout'
import './index.css'

console.log('🚀 Main.tsx loaded')

const DailyPicks = lazy(() => {
  console.log('Loading DailyPicks...')
  return import('./pages/DailyPicks').catch(err => {
    console.error('Failed to load DailyPicks:', err)
    throw err
  })
})
const KnowledgeBase = lazy(() => import('./pages/KnowledgeBase'))
const FormHub = lazy(() => import('./pages/FormHub'))

let root: Root | null = null

const App = () => {
  return (
    <StrictMode>
      <StyledEngineProvider injectFirst>
        <ThemeProvider theme={muiTheme}>
          <CssBaseline />
          <BrowserRouter>
            <AppLayout>
              <Suspense fallback={
                <div className="h-screen flex items-center justify-center bg-slate-50">
                  <div className="text-slate-400 font-mono text-sm">Loading…</div>
                </div>
              }>
                <Routes>
                  <Route path="/" element={<DailyPicks />} />
                  <Route path="/kb" element={<KnowledgeBase />} />
                  <Route path="/form-hub" element={<FormHub />} />
                </Routes>
              </Suspense>
            </AppLayout>
          </BrowserRouter>
        </ThemeProvider>
      </StyledEngineProvider>
    </StrictMode>
  )
}

const renderApp = () => {
  const rootElement = document.getElementById('root')
  if (!rootElement) {
    console.error('❌ No root element found')
    return
  }

  if (!root) {
    console.log('✅ Creating root...')
    root = createRoot(rootElement)
  }

  try {
    console.log('✅ Rendering app...')
    root.render(<App />)
  } catch (error) {
    console.error('❌ Render error:', error)
    rootElement.innerHTML = `<div style="padding: 20px; color: red;"><h1>Error Loading App</h1><pre>${String(error)}</pre></div>`
  }
}

renderApp()

// Handle HMR updates
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    console.log('🔄 Hot reload detected')
    renderApp()
  })
}
