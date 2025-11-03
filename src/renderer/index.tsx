import ReactDom from 'react-dom/client'
import React from 'react'

import { AppRoutes } from './routes'
import { ThemeProvider } from './theme/ThemeContext'

import './globals.css'

ReactDom.createRoot(document.querySelector('app') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppRoutes />
    </ThemeProvider>
  </React.StrictMode>
)
