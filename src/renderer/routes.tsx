import { Route } from 'react-router-dom'

import { Router } from 'lib/electron-router-dom'

import { AuthGateScreen } from './screens/auth-gate'
import { MainScreen } from './screens/main'
import { WorkspaceScreen } from './screens/workspace'

export function AppRoutes() {
  return (
    <Router
      main={
        <>
          <Route element={<MainScreen />} path="/" />
          <Route element={<AuthGateScreen />} path="/auth-gate" />
          <Route element={<WorkspaceScreen />} path="/workspace" />
        </>
      }
    />
  )
}
