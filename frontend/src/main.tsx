import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/geist/latin-400.css'
import '@fontsource/geist/latin-500.css'
import '@fontsource/geist/latin-600.css'
import '@fontsource/geist/latin-700.css'
import 'leaflet/dist/leaflet.css'
import './map-workspace.css'
import './route-improvements.css'
import './result-details.css'
import App from './App'

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() {
    return { error: true }
  }
  render() {
    if (this.state.error)
      return (
        <main className="fatal">
          <h1>Let’s get back on the road.</h1>
          <p>The workspace couldn’t load. Refresh to try again.</p>
          <button className="primary" onClick={() => window.location.reload()}>
            Reload workspace
          </button>
        </main>
      )
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
