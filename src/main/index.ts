import { app, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

import { makeAppWithSingleInstanceLock } from 'lib/electron-app/factories/app/instance'
import { makeAppSetup } from 'lib/electron-app/factories/app/setup'
import { MainWindow } from './windows/main'

const execAsync = promisify(exec)

// Store for recent projects
const getRecentProjectsPath = () => {
  const appDataPath = join(homedir(), '.almondcoder')
  if (!existsSync(appDataPath)) {
    mkdirSync(appDataPath, { recursive: true })
  }
  return join(appDataPath, 'recent-projects.json')
}

const loadRecentProjects = () => {
  try {
    const filePath = getRecentProjectsPath()
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Error loading recent projects:', error)
  }
  return []
}

const saveRecentProjects = (projects: any[]) => {
  try {
    const filePath = getRecentProjectsPath()
    writeFileSync(filePath, JSON.stringify(projects, null, 2))
  } catch (error) {
    console.error('Error saving recent projects:', error)
  }
}

// IPC Handlers
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Repository Folder',
  })

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }

  return null
})

ipcMain.handle('get-recent-projects', () => {
  return loadRecentProjects()
})

ipcMain.handle('add-recent-project', (event, project) => {
  const projects = loadRecentProjects()

  // Remove existing entry if it exists
  const filteredProjects = projects.filter((p: any) => p.path !== project.path)

  // Add to beginning with timestamp
  const newProject = {
    ...project,
    lastUsed: new Date().toISOString(),
  }

  filteredProjects.unshift(newProject)

  // Keep only last 10 projects
  const limitedProjects = filteredProjects.slice(0, 10)

  saveRecentProjects(limitedProjects)
  return limitedProjects
})

// Git-related IPC handlers
ipcMain.handle('is-git-repository', async (event, path) => {
  try {
    const { stdout } = await execAsync('git rev-parse --is-inside-work-tree', {
      cwd: path,
    })
    return stdout.trim() === 'true'
  } catch (error) {
    return false
  }
})

ipcMain.handle('get-git-branches', async (event, path) => {
  try {
    const { stdout } = await execAsync('git branch -a', { cwd: path })
    const branches = stdout
      .split('\n')
      .map(branch =>
        branch.replace(/^\*?\s*/, '').replace(/^remotes\/origin\//, '')
      )
      .filter(branch => branch && !branch.startsWith('HEAD'))
      .filter((branch, index, array) => array.indexOf(branch) === index)
    return branches
  } catch (error) {
    console.error('Error getting git branches:', error)
    return ['main']
  }
})

ipcMain.handle('clone-repository', async (event, repoUrl) => {
  try {
    // Check if this might be a private repository
    const isLikelyPrivateRepo = (url: string): boolean => {
      // Private repos typically require authentication
      // This is a heuristic check - we'll let git tell us if it needs credentials
      return url.includes('github.com') || url.includes('gitlab.com') || url.includes('bitbucket.org')
    }

    // First, let user select destination folder
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Destination Folder',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const destinationPath = result.filePaths[0]

    // Extract repo name from URL
    const repoName =
      repoUrl.split('/').pop()?.replace('.git', '') || 'cloned-repo'
    const clonePath = join(destinationPath, repoName)

    // Clone the repository with timeout to catch credential prompts
    await execAsync(`git clone --quiet "${repoUrl}" "${clonePath}"`, {
      timeout: 30000, // 30 second timeout
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0', // Disable terminal prompts for authentication
        GIT_ASKPASS: '', // Disable credential helper prompts
      }
    })

    return clonePath
  } catch (error: any) {
    console.error('Error cloning repository:', error)

    // Check for common authentication-related errors
    const errorMessage = error.message || error.toString()

    if (errorMessage.includes('Username for') ||
        errorMessage.includes('Password for') ||
        errorMessage.includes('Authentication failed') ||
        errorMessage.includes('Permission denied') ||
        errorMessage.includes('could not read Username') ||
        errorMessage.includes('terminal prompts disabled') ||
        errorMessage.includes('object null is not iterable')) {
      throw new Error('Only public repositories are allowed. Private repositories require authentication which is not supported.')
    }

    // For other errors, provide the original message
    throw new Error(`Failed to clone repository: ${errorMessage}`)
  }
})

makeAppWithSingleInstanceLock(async () => {
  await app.whenReady()
  await makeAppSetup(MainWindow)
})
