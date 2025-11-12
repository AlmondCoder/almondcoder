import ReactDom from 'react-dom/client'
import React from 'react'

import { AppRoutes } from './routes'
import { ThemeProvider } from './theme/ThemeContext'
import { initPostHog } from './services/posthog'

import './globals.css'

// Initialize PostHog analytics
initPostHog()

ReactDom.createRoot(document.querySelector('app') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppRoutes />
    </ThemeProvider>
  </React.StrictMode>
)
