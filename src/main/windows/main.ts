import { BrowserWindow, nativeImage } from 'electron'
import { join } from 'node:path'

import { createWindow } from 'lib/electron-app/factories/windows/create'
import { ENVIRONMENT } from 'shared/constants'
import { displayName } from '~/package.json'

export async function MainWindow() {
  const icon = nativeImage.createFromPath(
    join(__dirname, '../../resources/public/logo.svg')
  )

  const window = createWindow({
    id: 'main',
    title: displayName,
    icon,
    width: 1200,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    show: false,
    center: true,
    movable: true,
    resizable: true,
    fullscreenable: true,
    alwaysOnTop: false,
    autoHideMenuBar: true,
    webPreferences: {
      devTools: true,
      preload: join(__dirname, '../preload/index.js'),
    },
  })

  window.webContents.on('did-finish-load', () => {
    if (ENVIRONMENT.IS_DEV) {
      window.webContents.openDevTools({ mode: 'detach' })
    }

    window.show()
  })

  window.on('close', () => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.destroy()
    }
  })

  return window
}
