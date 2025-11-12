import {
  app,
  dialog,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  BrowserWindow,
  shell,
} from 'electron'
import { join, basename } from 'node:path'
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import * as lockfile from 'proper-lockfile'

import { makeAppWithSingleInstanceLock } from 'lib/electron-app/factories/app/instance'
import { makeAppSetup } from 'lib/electron-app/factories/app/setup'
import { MainWindow } from './windows/main'
import {
  executeClaudeQuery,
  abortQuery,
  updateAutoAcceptState,
  getAllConversationStates,
  updateConversationState,
  type ConversationState,
} from './claude-sdk'
import {
  createWorktree,
  removeWorktree,
  validateWorktreePath,
} from './worktree-manager'
import { parseGitDiff } from './git-diff-parser'
import type {
  EnhancedPromptHistoryItem,
  ConversationHistory,
} from '../shared/types'

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
  const filePath = getRecentProjectsPath()
  if (existsSync(filePath)) {
    const data = readFileSync(filePath, 'utf8')
    return JSON.parse(data)
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

// Prompt Agents persistence functions
const getAgentsFilePath = () => {
  const appDataPath = join(homedir(), '.almondcoder')
  const agentsDir = join(appDataPath, 'agents')
  if (!existsSync(agentsDir)) {
    mkdirSync(agentsDir, { recursive: true })
  }
  return join(agentsDir, 'prompts.json')
}

const loadPromptAgents = () => {
  try {
    const filePath = getAgentsFilePath()
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(data)
      return parsed.map((agent: any) => ({
        ...agent,
        createdAt: new Date(agent.createdAt),
        updatedAt: new Date(agent.updatedAt),
      }))
    }
  } catch (error) {
    console.error('Error loading prompt agents:', error)
  }
  return []
}

const savePromptAgents = (agents: any[]) => {
  try {
    const filePath = getAgentsFilePath()
    writeFileSync(filePath, JSON.stringify(agents, null, 2))
  } catch (error) {
    console.error('Error saving prompt agents:', error)
  }
}

// Enhanced project folder structure functions
const getProjectFolderPath = (projectPath: string) => {
  const projectName = basename(projectPath)
  const appDataPath = join(homedir(), '.almondcoder')
  if (!existsSync(appDataPath)) {
    mkdirSync(appDataPath, { recursive: true })
  }
  return join(appDataPath, projectName)
}

const ensureProjectFolderStructure = (projectPath: string) => {
  const projectFolderPath = getProjectFolderPath(projectPath)
  const promptsDir = join(projectFolderPath, 'prompts')
  const conversationsDir = join(promptsDir, 'conversations')

  if (!existsSync(projectFolderPath)) {
    mkdirSync(projectFolderPath, { recursive: true })
  }
  if (!existsSync(promptsDir)) {
    mkdirSync(promptsDir, { recursive: true })
  }
  if (!existsSync(conversationsDir)) {
    mkdirSync(conversationsDir, { recursive: true })
  }

  return { projectFolderPath, promptsDir, conversationsDir }
}

const getProjectMetadataPath = (projectPath: string) => {
  const { projectFolderPath } = ensureProjectFolderStructure(projectPath)
  return join(projectFolderPath, 'project-info.json')
}

const loadProjectMetadata = (projectPath: string): ProjectMetadata | null => {
  try {
    const filePath = getProjectMetadataPath(projectPath)
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(data)
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        lastUsed: new Date(parsed.lastUsed),
      }
    }
  } catch (error) {
    console.error('Error loading project metadata:', error)
  }
  return null
}

const saveProjectMetadata = (
  projectPath: string,
  metadata: ProjectMetadata
) => {
  try {
    const filePath = getProjectMetadataPath(projectPath)
    writeFileSync(filePath, JSON.stringify(metadata, null, 2))
  } catch (error) {
    console.error('Error saving project metadata:', error)
  }
}

const createOrUpdateProjectMetadata = (projectPath: string) => {
  const projectName = basename(projectPath)
  let metadata = loadProjectMetadata(projectPath)

  if (!metadata) {
    metadata = {
      projectName,
      projectPath,
      createdAt: new Date(),
      lastUsed: new Date(),
      totalPrompts: 0,
    }
  } else {
    metadata.lastUsed = new Date()
  }

  saveProjectMetadata(projectPath, metadata)
  return metadata
}

const getPromptFilePath = (projectPath: string, promptId: string) => {
  const { promptsDir } = ensureProjectFolderStructure(projectPath)
  return join(promptsDir, `${promptId}.json`)
}

const getConversationFilePath = (projectPath: string, promptId: string) => {
  const { conversationsDir } = ensureProjectFolderStructure(projectPath)
  return join(conversationsDir, `${promptId}.json`)
}

const loadEnhancedPromptHistory = (
  projectPath: string
): EnhancedPromptHistoryItem[] => {
  try {
    const { promptsDir } = ensureProjectFolderStructure(projectPath)
    const promptFiles = readdirSync(promptsDir).filter(file =>
      file.endsWith('.json')
    )

    const prompts: EnhancedPromptHistoryItem[] = []
    for (const file of promptFiles) {
      try {
        const filePath = join(promptsDir, file)
        const data = readFileSync(filePath, 'utf8')
        const parsed = JSON.parse(data)
        prompts.push({
          ...parsed,
          startExecutionTime: new Date(parsed.startExecutionTime),
          createdAt: new Date(parsed.createdAt),
          updatedAt: new Date(parsed.updatedAt),
        })
      } catch (error) {
        console.error(`Error loading prompt file ${file}:`, error)
      }
    }

    return prompts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  } catch (error) {
    console.error('Error loading enhanced prompt history:', error)
    return []
  }
}

const saveEnhancedPrompt = (promptData: EnhancedPromptHistoryItem) => {
  try {
    const filePath = getPromptFilePath(promptData.projectPath, promptData.id)
    writeFileSync(filePath, JSON.stringify(promptData, null, 2))
  } catch (error) {
    console.error('Error saving enhanced prompt:', error)
  }
}

const validateConversationData = (data: any): data is ConversationHistory => {
  if (!data || typeof data !== 'object') return false
  if (typeof data.promptId !== 'string') return false
  if (typeof data.projectPath !== 'string') return false
  if (!Array.isArray(data.messages)) return false

  // worktreePath is optional but if present, should be a string
  if (data.worktreePath !== undefined && typeof data.worktreePath !== 'string')
    return false

  // parentWorktreePath is optional but if present, should be a string
  if (
    data.parentWorktreePath !== undefined &&
    typeof data.parentWorktreePath !== 'string'
  )
    return false

  // aiSessionId is optional but if present, should be a string
  if (data.aiSessionId !== undefined && typeof data.aiSessionId !== 'string')
    return false

  // sessionWorkingDirectory is optional but if present, should be a string
  if (
    data.sessionWorkingDirectory !== undefined &&
    typeof data.sessionWorkingDirectory !== 'string'
  )
    return false

  // Validate each message
  for (const msg of data.messages) {
    if (!msg || typeof msg !== 'object') return false
    if (typeof msg.id !== 'string') return false
    if (typeof msg.content !== 'string') return false
    if (!['user', 'system', 'assistant', 'tool_call'].includes(msg.type))
      return false
    if (!msg.timestamp) return false

    // For tool_call messages, validate optional tool-related fields
    if (msg.type === 'tool_call') {
      if (msg.toolName !== undefined && typeof msg.toolName !== 'string')
        return false
      if (msg.toolUseId !== undefined && typeof msg.toolUseId !== 'string')
        return false
      if (msg.toolResult !== undefined && typeof msg.toolResult !== 'string')
        return false
    }
  }

  return true
}

const loadConversationHistory = (
  projectPath: string,
  promptId: string
): ConversationHistory | null => {
  try {
    const filePath = getConversationFilePath(projectPath, promptId)
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf8')

      // Try to parse JSON
      let parsed
      try {
        parsed = JSON.parse(data)
      } catch (parseError) {
        console.error(
          'Invalid JSON in conversation file:',
          filePath,
          parseError
        )
        // Try to recover by creating backup and returning null
        const backupPath = `${filePath}.backup.${Date.now()}`
        try {
          writeFileSync(backupPath, data)
          console.log('Created backup of corrupted file:', backupPath)
        } catch (backupError) {
          console.error('Failed to create backup:', backupError)
        }
        return null
      }

      // Validate the parsed data structure
      if (!validateConversationData(parsed)) {
        console.error('Invalid conversation data structure in file:', filePath)
        // Create backup and return null
        const backupPath = `${filePath}.invalid.${Date.now()}`
        try {
          writeFileSync(backupPath, JSON.stringify(parsed, null, 2))
          console.log(
            'Created backup of invalid conversation file:',
            backupPath
          )
        } catch (backupError) {
          console.error('Failed to create backup:', backupError)
        }
        return null
      }

      // Convert dates and create conversation object
      const conversation = {
        ...parsed,
        messages: parsed.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        })),
        createdAt: new Date(parsed.createdAt),
        updatedAt: new Date(parsed.updatedAt),
      }

      // Validate worktree path if present (async validation, don't block loading)
      if (conversation.worktreePath) {
        validateWorktreePath(conversation.worktreePath)
          .then(isValid => {
            if (!isValid) {
              console.warn(
                `Conversation ${promptId} references invalid worktree: ${conversation.worktreePath}`
              )
              // Could optionally clear the worktreePath here or notify the user
            }
          })
          .catch(error => {
            console.error('Error validating worktree for conversation:', error)
          })
      }

      return conversation
    }
  } catch (error) {
    console.error('Error loading conversation history:', error)
  }
  return null
}

const getCurrentBranchStatus = async (
  projectPath: string,
  branchName: string
): Promise<BranchStatus> => {
  try {
    const { stdout } = await execAsync('git branch -a', { cwd: projectPath })
    const branches = stdout
      .split('\n')
      .map(b => b.replace(/^\*?\s*/, '').replace(/^remotes\/origin\//, ''))
    return branches.includes(branchName) ? 'active' : 'deleted'
  } catch (error) {
    return 'active'
  }
}

// Note: Worktree utility functions have been moved to ./worktree-manager.ts

// IPC Handlers
ipcMain.handle('set-window-title', async (event, title: string) => {
  try {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      window.setTitle(title)
      return { success: true }
    }
    return { success: false, error: 'Window not found' }
  } catch (error: any) {
    console.error('Error setting window title:', error)
    return { success: false, error: error.message }
  }
})

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

ipcMain.handle('get-app-data-path', () => {
  return join(homedir(), '.almondcoder')
})

// Prompt Agents IPC handlers
ipcMain.handle('get-prompt-agents', () => {
  return loadPromptAgents()
})

ipcMain.handle('save-prompt-agents', (event, agents) => {
  savePromptAgents(agents)
  return true
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

// Settings IPC handlers - General settings management
ipcMain.handle('get-project-settings', async (event, projectPath: string) => {
  try {
    const metadata = loadProjectMetadata(projectPath)
    return metadata?.settings || {}
  } catch (error) {
    console.error('Error getting project settings:', error)
    throw error
  }
})

ipcMain.handle(
  'save-project-settings',
  async (event, projectPath: string, settings: ProjectSettings) => {
    try {
      let metadata = loadProjectMetadata(projectPath)

      if (!metadata) {
        // Create metadata if it doesn't exist
        const projectName = basename(projectPath)
        metadata = {
          projectName,
          projectPath,
          createdAt: new Date(),
          lastUsed: new Date(),
          totalPrompts: 0,
          settings,
        }
      } else {
        // Update existing metadata with new settings
        metadata.settings = settings
        metadata.lastUsed = new Date()
      }

      saveProjectMetadata(projectPath, metadata)
      return true
    } catch (error) {
      console.error('Error saving project settings:', error)
      throw error
    }
  }
)

// Enhanced Prompt history IPC handlers
ipcMain.handle('get-enhanced-prompt-history', (event, projectPath) => {
  ensureProjectFolderStructure(projectPath)
  createOrUpdateProjectMetadata(projectPath)
  return loadEnhancedPromptHistory(projectPath)
})

ipcMain.handle(
  'save-enhanced-prompt',
  (event, promptData: EnhancedPromptHistoryItem) => {
    saveEnhancedPrompt(promptData)

    const metadata = createOrUpdateProjectMetadata(promptData.projectPath)
    metadata.totalPrompts += 1
    saveProjectMetadata(promptData.projectPath, metadata)

    return true
  }
)

ipcMain.handle(
  'update-enhanced-prompt',
  (event, promptData: EnhancedPromptHistoryItem) => {
    saveEnhancedPrompt(promptData)
    return true
  }
)

ipcMain.handle('get-conversation-history', (event, projectPath, promptId) => {
  return loadConversationHistory(projectPath, promptId)
})

ipcMain.handle('read-conversation-log', async (event, filePath: string) => {
  try {
    // Expand tilde in file path
    const expandedFilePath = filePath.startsWith('~')
      ? join(homedir(), filePath.slice(1))
      : filePath

    if (!existsSync(expandedFilePath)) {
      console.log('Conversation log file does not exist:', expandedFilePath)
      return []
    }

    const fileContent = readFileSync(expandedFilePath, 'utf8')
    const logEntries = JSON.parse(fileContent)

    if (!Array.isArray(logEntries)) {
      console.warn('Conversation log file is not an array')
      return []
    }

    console.log(
      `✅ Read ${logEntries.length} entries from conversation log:`,
      expandedFilePath
    )
    return logEntries
  } catch (error) {
    console.error('❌ Error reading conversation log:', error)
    return []
  }
})

ipcMain.handle(
  'append-to-conversation-log',
  async (event, filePath: string, logEntry: any) => {
    let release: (() => Promise<void>) | null = null

    try {
      // Expand tilde in file path
      const expandedFilePath = filePath.startsWith('~')
        ? join(homedir(), filePath.slice(1))
        : filePath

      // Ensure the directory exists
      const dirPath = join(expandedFilePath, '..')
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true })
        console.log('Created directory:', dirPath)
      }

      // Create file if it doesn't exist (required for locking)
      if (!existsSync(expandedFilePath)) {
        writeFileSync(expandedFilePath, JSON.stringify([], null, 2))
        console.log('Creating new conversation log file:', expandedFilePath)
      }

      // 🔒 CRITICAL FIX: Acquire exclusive lock to prevent race conditions
      // This ensures atomic read-modify-write operations when multiple prompts
      // execute concurrently and try to write to the same file
      console.log('🔒 Attempting to acquire lock for:', expandedFilePath)
      release = await lockfile.lock(expandedFilePath, {
        retries: {
          retries: 10, // Retry up to 10 times
          minTimeout: 50, // Start with 50ms delay
          maxTimeout: 1000, // Max 1 second delay between retries
        },
        stale: 10000, // Consider lock stale after 10 seconds
      })
      console.log('✅ Lock acquired for:', expandedFilePath)

      // Read existing file content or create empty array
      let logEntries: any[] = []

      try {
        const fileContent = readFileSync(expandedFilePath, 'utf8')
        logEntries = JSON.parse(fileContent)

        if (!Array.isArray(logEntries)) {
          console.warn('Conversation log file is not an array, recreating')
          logEntries = []
        }
      } catch (parseError) {
        console.error(
          'Error parsing conversation log file, recreating:',
          parseError
        )
        logEntries = []
      }

      // Append new entry
      logEntries.push(logEntry)

      // Write back to file
      writeFileSync(expandedFilePath, JSON.stringify(logEntries, null, 2))
      console.log(
        '✅ Successfully wrote to conversation log:',
        expandedFilePath
      )

      // Release lock
      await release()
      console.log('🔓 Lock released for:', expandedFilePath)

      return { success: true }
    } catch (error: any) {
      console.error('Error appending to conversation log:', error)

      // Ensure lock is released even on error
      if (release) {
        try {
          await release()
          console.log('🔓 Lock released (error path) for:', filePath)
        } catch (releaseError) {
          console.error('Error releasing lock:', releaseError)
        }
      }

      return {
        success: false,
        error: error.message,
      }
    }
  }
)

ipcMain.handle(
  'get-current-branch-status',
  async (event, projectPath, branchName) => {
    return await getCurrentBranchStatus(projectPath, branchName)
  }
)

// Git-related IPC handlers
ipcMain.handle('is-git-repository', async (event, path) => {
  try {
    const { stdout } = await execAsync('git rev-parse --is-inside-work-tree', {
      cwd: path,
    })
    return stdout.trim() === 'true'
  } catch (error) {
    try {
      await execAsync('git init', { cwd: path })
      // Create an initial empty commit to avoid empty repo issues
      await execAsync('git commit -m "Initial commit"', { cwd: path })
      return true
    } catch (initError) {
      console.error('Failed to initialize git repository:', initError)
      return false
    }
  }
})

ipcMain.handle('get-git-branches', async (event, path) => {
  try {
    const { stdout } = await execAsync(
      "git for-each-ref --format='%(refname:short)' refs/heads --exclude='refs/heads/worktree/**'",
      { cwd: path }
    )
    const branches = stdout
      .split('\n')
      .map(branch => branch.trim().replace(/^'|'$/g, ''))
      .filter(branch => branch && !branch.startsWith('worktree/'))
      .filter((branch, index, array) => array.indexOf(branch) === index)
    return branches.length > 0 ? branches : ['main']
  } catch (error) {
    console.error('Error getting git branches:', error)
    return ['main']
  }
})

ipcMain.handle('get-git-diff', async (event, path) => {
  try {
    // Add intent-to-add for untracked files so they appear in diff
    // This makes git aware of new files without actually staging them
    await execAsync('git add -N .', { cwd: path }).catch(() => {
      // Ignore errors (e.g., if no untracked files exist)
    })

    // Get the diff between HEAD and working directory
    const { stdout } = await execAsync('git diff HEAD', { cwd: path })

    if (!stdout.trim()) {
      // No changes
      return { diffs: [], error: null }
    }

    // Parse using the new parser
    const parsedFiles = parseGitDiff(stdout)

    // Transform to UI format
    const diffs = parsedFiles.map(file => ({
      filePath: file.newPath || file.oldPath,
      status:
        file.type === 'add'
          ? 'added'
          : file.type === 'delete'
            ? 'deleted'
            : 'modified',
      additions: file.hunks.reduce(
        (sum, hunk) => sum + hunk.changes.filter(c => c.isInsert).length,
        0
      ),
      deletions: file.hunks.reduce(
        (sum, hunk) => sum + hunk.changes.filter(c => c.isDelete).length,
        0
      ),
      hunks: file.hunks.map(hunk => ({
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        newStart: hunk.newStart,
        newLines: hunk.newLines,
        lines: [
          {
            type: 'header',
            content: hunk.content,
          },
          ...hunk.changes.map(change => ({
            type:
              change.type === 'normal'
                ? 'context'
                : change.isDelete
                  ? 'deleted'
                  : 'added',
            content: change.content,
            oldLineNumber:
              change.oldLineNumber ||
              (change.isDelete ? change.lineNumber : undefined),
            newLineNumber:
              change.newLineNumber ||
              (change.isInsert ? change.lineNumber : undefined),
          })),
        ],
      })),
    }))

    return { diffs, error: null }
  } catch (error) {
    console.error('Error getting git diff:', error)
    return {
      diffs: [],
      error: error instanceof Error ? error.message : 'Failed to get git diff',
    }
  }
})

ipcMain.handle('clone-repository', async (event, repoUrl) => {
  try {
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
      },
    })

    return clonePath
  } catch (error: any) {
    console.error('Error cloning repository:', error)

    // Check for common authentication-related errors
    const errorMessage = error.message || error.toString()

    if (
      errorMessage.includes('Username for') ||
      errorMessage.includes('Password for') ||
      errorMessage.includes('Authentication failed') ||
      errorMessage.includes('Permission denied') ||
      errorMessage.includes('could not read Username') ||
      errorMessage.includes('terminal prompts disabled') ||
      errorMessage.includes('object null is not iterable')
    ) {
      throw new Error(
        'Please configure GIT SSH to download private repositories.'
      )
    }

    // For other errors, provide the original message
    throw new Error(`Failed to clone repository: ${errorMessage}`)
  }
})

// Get detailed branch information with relationships
ipcMain.handle('get-git-branch-graph', async (event, path) => {
  try {
    // Check if repository has any commits
    let hasCommits = true
    let currentBranchName = 'main'

    try {
      await execAsync('git rev-parse HEAD', { cwd: path })
    } catch (error) {
      hasCommits = false
      console.log('Repository has no commits yet, returning empty branch graph')
    }

    if (!hasCommits) {
      // Return empty branch graph for repositories with no commits
      return {
        branches: [],
        relationships: [],
        currentBranch: 'main',
      }
    }

    // Get all branches with their commit info
    const { stdout: branchInfo } = await execAsync(
      'git for-each-ref --format="%(refname:short)|%(objectname)|%(authordate:iso8601)|%(authorname)|%(subject)" refs/heads/ refs/remotes/',
      { cwd: path }
    )

    // Get current branch
    try {
      const { stdout: currentBranch } = await execAsync(
        'git rev-parse --abbrev-ref HEAD',
        { cwd: path }
      )
      currentBranchName = currentBranch.trim()
    } catch (error) {
      console.error('Error getting current branch:', error)
      currentBranchName = 'main'
    }

    // Get merge base information to determine relationships
    const branches = branchInfo
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        const [name, commit, date, author, subject] = line.split('|')
        return {
          name: name.replace('origin/', ''),
          commit,
          date,
          author,
          subject,
          isRemote: name.startsWith('origin/'),
          isCurrent:
            name === currentBranchName ||
            name === `origin/${currentBranchName}`,
        }
      })

    // Remove duplicates (local and remote versions of same branch)
    const uniqueBranches = branches.reduce(
      (acc, branch) => {
        const existingIndex = acc.findIndex(b => b.name === branch.name)
        if (existingIndex >= 0) {
          // Prefer local branch over remote
          if (!branch.isRemote) {
            acc[existingIndex] = branch
          }
        } else {
          acc.push(branch)
        }
        return acc
      },
      [] as typeof branches
    )

    // Get parent relationships
    const relationships = []
    for (const branch of uniqueBranches) {
      try {
        // Try to find merge base with main/master
        const mainBranches = ['main', 'master']
        for (const mainBranch of mainBranches) {
          if (
            branch.name !== mainBranch &&
            uniqueBranches.some(b => b.name === mainBranch)
          ) {
            try {
              const { stdout: mergeBase } = await execAsync(
                `git merge-base ${branch.name} ${mainBranch}`,
                { cwd: path }
              )
              if (mergeBase.trim()) {
                relationships.push({
                  source: mainBranch,
                  target: branch.name,
                  type: 'branch',
                })
                break
              }
            } catch {
              // Continue to next main branch
            }
          }
        }
      } catch (error) {
        // Skip if can't determine relationship
      }
    }

    return {
      branches: uniqueBranches,
      relationships,
      currentBranch: currentBranchName,
    }
  } catch (error) {
    console.error('Error getting git branch graph:', error)
    return {
      branches: [],
      relationships: [],
      currentBranch: 'main',
    }
  }
})

// Check if merge is possible and get conflicts
ipcMain.handle(
  'check-merge-conflicts',
  async (event, { path, sourceBranch, targetBranch }) => {
    try {
      // First check if we can merge without conflicts
      const { stdout: mergePreview } = await execAsync(
        `git merge-tree $(git merge-base ${sourceBranch} ${targetBranch}) ${sourceBranch} ${targetBranch}`,
        { cwd: path }
      )

      const hasConflicts = mergePreview.includes('<<<<<<<')

      if (!hasConflicts) {
        return {
          canMerge: true,
          conflicts: [],
        }
      }

      // Parse conflicts
      const conflicts = []
      const conflictSections = mergePreview.split('<<<<<<< ')

      for (let i = 1; i < conflictSections.length; i++) {
        const section = conflictSections[i]
        const lines = section.split('\n')
        const sourceName = lines[0]

        let currentContent = ''
        let incomingContent = ''
        let fileName = ''
        let mode = 'current'

        for (const line of lines.slice(1)) {
          if (line.startsWith('=======')) {
            mode = 'incoming'
          } else if (line.startsWith('>>>>>>> ')) {
            break
          } else if (line.startsWith('--- ') || line.startsWith('+++ ')) {
            if (line.startsWith('+++ ')) {
              fileName = line.substring(4)
            }
          } else {
            if (mode === 'current') {
              currentContent += `${line}\n`
            } else {
              incomingContent += `${line}\n`
            }
          }
        }

        if (fileName) {
          conflicts.push({
            file: fileName,
            currentContent: currentContent.trim(),
            incomingContent: incomingContent.trim(),
            currentBranch: targetBranch,
            incomingBranch: sourceBranch,
          })
        }
      }

      return {
        canMerge: false,
        conflicts,
      }
    } catch (error: any) {
      console.error('Error checking merge conflicts:', error)
      return {
        canMerge: false,
        conflicts: [],
        error: error.message,
      }
    }
  }
)

// Perform actual merge
ipcMain.handle(
  'perform-merge',
  async (event, { path, sourceBranch, targetBranch, resolutions }) => {
    try {
      // Get the current branch in the main repository
      const { stdout: currentBranch } = await execAsync(
        'git rev-parse --abbrev-ref HEAD',
        { cwd: path }
      )
      const currentBranchName = currentBranch.trim()

      // Check if we need to switch branches
      if (currentBranchName !== targetBranch) {
        try {
          // Try direct checkout first
          await execAsync(`git checkout ${targetBranch}`, { cwd: path })
        } catch (checkoutError: any) {
          // If checkout fails due to worktree conflict, use a workaround
          if (checkoutError.message.includes('already used by worktree')) {
            console.log(
              'Target branch is in a worktree, using merge without checkout'
            )

            // Get the commit hash of the source branch
            const { stdout: sourceCommit } = await execAsync(
              `git rev-parse ${sourceBranch}`,
              { cwd: path }
            )

            // Get the commit hash of the target branch
            const { stdout: targetCommit } = await execAsync(
              `git rev-parse ${targetBranch}`,
              { cwd: path }
            )

            // Update the target branch to include the merge without checking it out
            await execAsync(
              `git update-ref refs/heads/${targetBranch} $(git commit-tree $(git rev-parse ${targetBranch}^{tree}) -p ${targetCommit.trim()} -p ${sourceCommit.trim()} -m "Merge ${sourceBranch} into ${targetBranch}")`,
              { cwd: path }
            )

            console.log(
              `Merged ${sourceBranch} into ${targetBranch} without checkout`
            )
            return { success: true }
          }
          throw checkoutError
        }
      }

      // Attempt merge (if we successfully checked out)
      try {
        await execAsync(`git merge ${sourceBranch} --no-ff`, { cwd: path })
        return { success: true }
      } catch (mergeError) {
        // If there are conflicts and we have resolutions, apply them
        if (resolutions && resolutions.length > 0) {
          for (const resolution of resolutions) {
            // Write resolved content to file
            writeFileSync(join(path, resolution.file), resolution.content)
            // Stage the resolved file
            await execAsync(`git add "${resolution.file}"`, { cwd: path })
          }

          // Complete the merge
          await execAsync('git commit --no-edit', { cwd: path })
          return { success: true }
        }
        // Abort the merge if no resolutions provided
        await execAsync('git merge --abort', { cwd: path })
        throw mergeError
      }
    } catch (error: any) {
      console.error('Error performing merge:', error)
      return {
        success: false,
        error: error.message,
      }
    }
  }
)

// Keep the original execute-command for compatibility
ipcMain.handle(
  'execute-command',
  async (event, command, workingDirectory = undefined) => {
    try {
      const execOptions: any = {
        timeout: 120000, // 2 minute timeout
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer for large outputs
      }

      // Add working directory if provided
      if (workingDirectory) {
        execOptions.cwd = workingDirectory
        console.log('Executing command in directory:', workingDirectory)
      }

      const { stdout, stderr } = await execAsync(command, execOptions)

      // Return both stdout and stderr, Claude might output to either
      return stdout + (stderr ? `\n${stderr}` : '')
    } catch (error: any) {
      console.error('Error executing command:', error)

      // Include both stdout and stderr even on error, as Claude might still provide useful output
      const output =
        (error.stdout || '') + (error.stderr ? `\n${error.stderr}` : '')
      if (output.trim()) {
        return output
      }

      throw new Error(`Command failed: ${error.message}`)
    }
  }
)

// Worktree IPC handlers
ipcMain.handle(
  'create-worktree',
  async (
    event,
    projectPath,
    branch,
    promptText,
    promptId,
    parentWorktreePath
  ) => {
    try {
      const worktreeInfo = await createWorktree(
        projectPath,
        branch,
        promptText,
        promptId,
        parentWorktreePath
      )
      return {
        success: true,
        worktreeInfo,
      }
    } catch (error: any) {
      console.error('Error in create-worktree IPC handler:', error)
      return {
        success: false,
        error: error.message,
      }
    }
  }
)

ipcMain.handle('cleanup-worktree', async (event, worktreePath) => {
  try {
    await removeWorktree(worktreePath)
    return {
      success: true,
    }
  } catch (error: any) {
    console.error('Error in cleanup-worktree IPC handler:', error)
    return {
      success: false,
      error: error.message,
    }
  }
})

// Validate if a worktree path is still valid
ipcMain.handle('validate-worktree', async (event, worktreePath) => {
  try {
    const isValid = await validateWorktreePath(worktreePath)
    return {
      success: true,
      isValid,
    }
  } catch (error: any) {
    console.error('Error in validate-worktree IPC handler:', error)
    return {
      success: false,
      error: error.message,
      isValid: false,
    }
  }
})

// Check if a file exists
ipcMain.handle('check-file-exists', async (event, filePath) => {
  try {
    const exists = existsSync(filePath)
    return {
      success: true,
      exists,
    }
  } catch (error: any) {
    console.error('Error in check-file-exists IPC handler:', error)
    return {
      success: false,
      error: error.message,
      exists: false,
    }
  }
})

// Helper function to get worktree information from git for a specific branch
async function getWorktreeInfoFromGit(
  projectPath: string,
  branchName: string
): Promise<{ worktreePath: string; branch: string } | null> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', {
      cwd: projectPath,
    })

    const lines = stdout.split('\n')
    let currentWorktreePath: string | null = null
    let currentBranch: string | null = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (line.startsWith('worktree ')) {
        currentWorktreePath = line.replace('worktree ', '').trim()
      } else if (line.startsWith('branch refs/heads/')) {
        currentBranch = line.replace('branch refs/heads/', '').trim()

        // If we found the matching branch, return the info
        if (currentBranch === branchName && currentWorktreePath) {
          return {
            worktreePath: currentWorktreePath,
            branch: currentBranch,
          }
        }
      } else if (line === '') {
        // Empty line indicates end of worktree entry, reset
        currentWorktreePath = null
        currentBranch = null
      }
    }

    return null
  } catch (error) {
    console.error('Error getting worktree info from git:', error)
    return null
  }
}

// Get list of branch names that have active worktrees (using git directly)
ipcMain.handle('get-worktree-branches', async (event, projectPath) => {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', {
      cwd: projectPath,
    })

    const branches: string[] = []
    const lines = stdout.split('\n')

    for (const line of lines) {
      if (line.startsWith('branch refs/heads/')) {
        const branchName = line.replace('branch refs/heads/', '').trim()
        branches.push(branchName)
      }
    }

    console.log('Found worktree branches:', branches)

    return {
      success: true,
      branches,
    }
  } catch (error: any) {
    console.error('Error getting worktree branches:', error)
    return {
      success: false,
      error: error.message,
      branches: [],
    }
  }
})

// Get list of existing worktrees for a project
ipcMain.handle('get-project-worktrees', async (event, projectPath) => {
  try {
    const { conversationsDir } = ensureProjectFolderStructure(projectPath)
    const conversationFiles = readdirSync(conversationsDir).filter(file =>
      file.endsWith('.json')
    )

    const worktrees: Array<{
      promptId: string
      worktreePath: string
      prompt: string
      createdAt: Date
      branch: string
    }> = []

    for (const file of conversationFiles) {
      try {
        const promptId = file.replace('.json', '')
        const conversation = loadConversationHistory(projectPath, promptId)

        if (conversation?.worktreePath) {
          // Validate the worktree still exists
          const isValid = await validateWorktreePath(conversation.worktreePath)

          if (isValid) {
            // Load the prompt details
            const prompt = loadEnhancedPromptHistory(projectPath).find(
              p => p.id === promptId
            )

            if (prompt) {
              worktrees.push({
                promptId: prompt.id,
                worktreePath: conversation.worktreePath,
                prompt: prompt.prompt,
                createdAt: prompt.createdAt,
                branch: prompt.branch,
              })
            }
          }
        }
      } catch (error) {
        console.error(`Error processing conversation ${file}:`, error)
      }
    }

    return {
      success: true,
      worktrees: worktrees.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      ),
    }
  } catch (error: any) {
    console.error('Error in get-project-worktrees IPC handler:', error)
    return {
      success: false,
      error: error.message,
      worktrees: [],
    }
  }
})

// Perform worktree merge with auto-commit and cleanup
ipcMain.handle(
  'perform-worktree-merge',
  async (event, { projectPath, sourceBranch, targetBranch }) => {
    try {
      console.log('Starting worktree merge:', {
        projectPath,
        sourceBranch,
        targetBranch,
      })

      // Step 1: Get worktree information from git directly
      const worktreeInfo = await getWorktreeInfoFromGit(
        projectPath,
        sourceBranch
      )

      if (!worktreeInfo) {
        throw new Error(`Worktree for branch ${sourceBranch} not found`)
      }

      const worktreePath = worktreeInfo.worktreePath

      // Try to get the prompt text from conversation history for commit message
      let promptText = sourceBranch // Default to branch name
      try {
        const { conversationsDir } = ensureProjectFolderStructure(projectPath)
        const conversationFiles = readdirSync(conversationsDir).filter(file =>
          file.endsWith('.json')
        )

        for (const file of conversationFiles) {
          try {
            const promptId = file.replace('.json', '')
            const prompt = loadEnhancedPromptHistory(projectPath).find(
              p => p.id === promptId && p.branch === sourceBranch
            )

            if (prompt) {
              promptText = prompt.prompt
              break
            }
          } catch (error) {
            // Continue searching
          }
        }
      } catch (error) {
        console.warn(
          'Could not load prompt text from history, using branch name'
        )
      }

      console.log('Found worktree:', { worktreePath, promptText })

      // Step 2: Check for uncommitted changes in worktree
      const { stdout: statusOutput } = await execAsync(
        'git status --porcelain',
        {
          cwd: worktreePath,
        }
      )

      // Step 3: Auto-commit if there are uncommitted changes
      if (statusOutput.trim()) {
        console.log('Auto-committing changes in worktree...')
        await execAsync('git add .', { cwd: worktreePath })

        // Format commit message: almondcoder: <prompt text>
        const commitMessage = `almondcoder: ${promptText}`
        const escapedMessage = commitMessage.replace(/"/g, '\\"')

        await execAsync(`git commit -m "${escapedMessage}"`, {
          cwd: worktreePath,
        })
        console.log('Changes committed with message:', commitMessage)
      } else {
        console.log('No uncommitted changes in worktree')
      }

      // Step 4: Get current branch in main repo
      const { stdout: currentBranch } = await execAsync(
        'git rev-parse --abbrev-ref HEAD',
        { cwd: projectPath }
      )
      const currentBranchName = currentBranch.trim()

      // Step 5: Stash any uncommitted changes in main repo
      let hasStashedMainRepo = false
      const { stdout: mainRepoStatus } = await execAsync(
        'git status --porcelain',
        { cwd: projectPath }
      )

      if (mainRepoStatus.trim()) {
        console.log('Stashing uncommitted changes in main repo...')
        await execAsync('git stash push -u -m "almondcoder-temp-stash"', {
          cwd: projectPath,
        })
        hasStashedMainRepo = true
      }

      try {
        // Step 6: Checkout target branch in main repo
        if (currentBranchName !== targetBranch) {
          console.log(`Checking out target branch: ${targetBranch}`)
          await execAsync(`git checkout ${targetBranch}`, { cwd: projectPath })
        }

        // Step 7: Merge the worktree branch
        console.log(`Merging ${sourceBranch} into ${targetBranch}`)
        try {
          await execAsync(`git merge ${sourceBranch} --no-ff`, {
            cwd: projectPath,
          })
        } catch (mergeError: any) {
          // Check if this is a merge conflict
          if (mergeError.stdout && mergeError.stdout.includes('CONFLICT')) {
            console.log('Merge conflicts detected, parsing conflicts...')

            // Get list of conflicted files
            const { stdout: statusOutput } = await execAsync(
              'git status --porcelain',
              {
                cwd: projectPath,
              }
            )

            const conflictedFiles = statusOutput
              .split('\n')
              .filter(line => line.startsWith('UU ') || line.startsWith('AA '))
              .map(line => line.substring(3).trim())

            console.log('Conflicted files:', conflictedFiles)

            // Parse conflicts for each file with full content
            const conflicts = []
            for (const file of conflictedFiles) {
              try {
                const filePath = join(projectPath, file)
                const fullContent = readFileSync(filePath, 'utf8')
                const lines = fullContent.split('\n')

                // Find all conflicts in this file
                const fileConflicts = []
                let conflictIndex = 0

                for (let i = 0; i < lines.length; i++) {
                  if (lines[i].startsWith('<<<<<<< ')) {
                    const startLine = i
                    let currentContent = ''
                    let incomingContent = ''
                    let endLine = i
                    let mode = 'current'

                    // Parse this conflict
                    for (let j = i + 1; j < lines.length; j++) {
                      if (lines[j].startsWith('=======')) {
                        mode = 'incoming'
                      } else if (lines[j].startsWith('>>>>>>>')) {
                        endLine = j
                        break
                      } else {
                        if (mode === 'current') {
                          currentContent += lines[j] + '\n'
                        } else {
                          incomingContent += lines[j] + '\n'
                        }
                      }
                    }

                    fileConflicts.push({
                      id: `${file}-${conflictIndex}`,
                      startLine: startLine + 1, // 1-indexed for display
                      endLine: endLine + 1,
                      currentContent: currentContent.trim(),
                      incomingContent: incomingContent.trim(),
                    })

                    conflictIndex++
                    i = endLine // Skip to end of this conflict
                  }
                }

                // Add file with all its conflicts
                if (fileConflicts.length > 0) {
                  conflicts.push({
                    file,
                    fullContent,
                    currentBranch: targetBranch,
                    incomingBranch: sourceBranch,
                    conflicts: fileConflicts,
                  })
                }
              } catch (fileError) {
                console.error(`Error parsing conflict in ${file}:`, fileError)
              }
            }

            // Return conflict information without aborting
            return {
              success: false,
              hasConflicts: true,
              conflicts,
              sourceBranch,
              targetBranch,
              worktreePath,
              hasStashedMainRepo,
              originalBranch: currentBranchName,
            }
          }

          // Not a conflict error, throw it
          throw mergeError
        }

        // Step 8: Cleanup - Remove worktree and delete branch
        console.log('Cleaning up worktree and branch...')
        await execAsync(`git worktree remove "${worktreePath}"`, {
          cwd: projectPath,
        })
        await execAsync(`git branch -d ${sourceBranch}`, { cwd: projectPath })

        // Step 9: Pop stash if we stashed
        if (hasStashedMainRepo) {
          try {
            await execAsync('git stash pop', { cwd: projectPath })
            console.log('Restored stashed changes')
          } catch (popError) {
            console.warn('Could not pop stash:', popError)
          }
        }

        console.log('Merge completed successfully')
        return { success: true }
      } catch (mergeError: any) {
        // Restore stash if merge failed
        if (hasStashedMainRepo) {
          try {
            await execAsync('git stash pop', { cwd: projectPath })
          } catch (popError) {
            console.warn('Could not restore stash after error:', popError)
          }
        }
        throw mergeError
      }
    } catch (error: any) {
      console.error('Error performing worktree merge:', error)
      return {
        success: false,
        error: error.message,
      }
    }
  }
)

// Complete worktree merge after conflicts are resolved
ipcMain.handle(
  'complete-worktree-merge',
  async (
    event,
    { projectPath, sourceBranch, worktreePath, resolutions, hasStashedMainRepo }
  ) => {
    try {
      console.log('Completing worktree merge with resolutions...')

      // Step 1: Write resolved contents to files
      for (const resolution of resolutions) {
        const filePath = join(projectPath, resolution.file)
        writeFileSync(filePath, resolution.content, 'utf8')
        console.log(`Wrote resolution for ${resolution.file}`)
      }

      // Step 2: Stage resolved files
      await execAsync('git add .', { cwd: projectPath })

      // Step 3: Complete the merge commit
      await execAsync('git commit --no-edit', { cwd: projectPath })
      console.log('Merge commit completed')

      // Step 4: Cleanup - Remove worktree and delete branch
      console.log('Cleaning up worktree and branch...')
      await execAsync(`git worktree remove "${worktreePath}"`, {
        cwd: projectPath,
      })
      await execAsync(`git branch -d ${sourceBranch}`, { cwd: projectPath })

      // Step 5: Pop stash if we stashed
      if (hasStashedMainRepo) {
        try {
          await execAsync('git stash pop', { cwd: projectPath })
          console.log('Restored stashed changes')
        } catch (popError) {
          console.warn('Could not pop stash:', popError)
        }
      }

      console.log('Merge completed successfully')
      return { success: true }
    } catch (error: any) {
      console.error('Error completing worktree merge:', error)
      return {
        success: false,
        error: error.message,
      }
    }
  }
)

// Abort worktree merge
ipcMain.handle(
  'abort-worktree-merge',
  async (event, { projectPath, hasStashedMainRepo, originalBranch }) => {
    try {
      console.log('Aborting worktree merge...')

      // Abort the merge
      await execAsync('git merge --abort', { cwd: projectPath })

      // Restore original branch if provided
      if (originalBranch) {
        try {
          const { stdout: currentBranch } = await execAsync(
            'git rev-parse --abbrev-ref HEAD',
            { cwd: projectPath }
          )
          if (currentBranch.trim() !== originalBranch) {
            await execAsync(`git checkout ${originalBranch}`, {
              cwd: projectPath,
            })
            console.log(`Restored original branch: ${originalBranch}`)
          }
        } catch (checkoutError) {
          console.warn('Could not restore original branch:', checkoutError)
        }
      }

      // Pop stash if we stashed
      if (hasStashedMainRepo) {
        try {
          await execAsync('git stash pop', { cwd: projectPath })
          console.log('Restored stashed changes')
        } catch (popError) {
          console.warn('Could not pop stash:', popError)
        }
      }

      console.log('Merge aborted successfully')
      return { success: true }
    } catch (error: any) {
      console.error('Error aborting worktree merge:', error)
      return {
        success: false,
        error: error.message,
      }
    }
  }
)

// Discard worktree changes - delete worktree and branch
ipcMain.handle(
  'discard-worktree-changes',
  async (event, { projectPath, sourceBranch }) => {
    try {
      console.log('Discarding worktree changes for branch:', sourceBranch)

      // Step 1: Get worktree information from git directly
      const worktreeInfo = await getWorktreeInfoFromGit(
        projectPath,
        sourceBranch
      )

      if (!worktreeInfo) {
        throw new Error(`Worktree for branch ${sourceBranch} not found`)
      }

      const worktreePath = worktreeInfo.worktreePath

      // Step 2: Force remove worktree (including uncommitted changes)
      console.log('Removing worktree:', worktreePath)
      await execAsync(`git worktree remove --force "${worktreePath}"`, {
        cwd: projectPath,
      })

      // Step 3: Force delete branch
      console.log('Deleting branch:', sourceBranch)
      await execAsync(`git branch -D ${sourceBranch}`, { cwd: projectPath })

      console.log('Worktree and branch discarded successfully')
      return { success: true }
    } catch (error: any) {
      console.error('Error discarding worktree changes:', error)
      return {
        success: false,
        error: error.message,
      }
    }
  }
)

// Helper function to detect default terminal on macOS
async function getMacOSDefaultTerminal(): Promise<string | null> {
  // Check for popular terminal apps in order of preference
  const terminals = [
    { name: 'iTerm', app: 'iTerm' },
    { name: 'Warp', app: 'Warp' },
    { name: 'Alacritty', app: 'Alacritty' },
    { name: 'Kitty', app: 'kitty' },
    { name: 'Hyper', app: 'Hyper' },
    { name: 'Terminal', app: 'Terminal' }, // Default macOS terminal
  ]

  for (const terminal of terminals) {
    try {
      // Check if the application exists
      await execAsync(`osascript -e 'exists application "${terminal.app}"'`)
      return terminal.app
    } catch {}
  }

  return 'Terminal' // Fallback to default Terminal.app
}

// Helper function to open macOS terminal at path
async function openMacOSTerminal(terminalApp: string, path: string) {
  const escapedPath = path.replace(/"/g, '\\"')

  if (terminalApp === 'iTerm') {
    // iTerm2 specific AppleScript
    const script = `tell application "iTerm"
      activate
      create window with default profile
      tell current session of current window
        write text "cd \\"${escapedPath}\\""
      end tell
    end tell`
    await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`)
  } else if (terminalApp === 'Alacritty') {
    // Alacritty uses command line flags
    await execAsync(`open -a Alacritty --args --working-directory "${path}"`)
  } else if (terminalApp === 'Kitty' || terminalApp === 'kitty') {
    // Kitty uses command line flags
    await execAsync(`open -a kitty --args --directory="${path}"`)
  } else if (terminalApp === 'Warp') {
    // Warp can be opened with the path
    await execAsync(`open -a Warp "${path}"`)
  } else {
    // Default Terminal.app and other terminals
    const script = `tell application "${terminalApp}"
      activate
      do script "cd \\"${escapedPath}\\""
    end tell`
    await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`)
  }
}

// Helper function to detect default terminal on Windows
async function getWindowsDefaultTerminal(): Promise<string> {
  // Check for Windows Terminal first (modern default)
  try {
    await execAsync('where wt.exe')
    return 'wt'
  } catch {
    // Check for PowerShell
    try {
      await execAsync('where pwsh.exe')
      return 'pwsh'
    } catch {
      // Check for Windows PowerShell
      try {
        await execAsync('where powershell.exe')
        return 'powershell'
      } catch {
        // Fallback to cmd.exe
        return 'cmd'
      }
    }
  }
}

// Helper function to open Windows terminal at path
async function openWindowsTerminal(terminal: string, path: string) {
  if (terminal === 'wt') {
    // Windows Terminal
    await execAsync(`wt.exe -d "${path}"`)
  } else if (terminal === 'pwsh') {
    // PowerShell Core
    await execAsync(`start pwsh.exe -NoExit -Command "Set-Location '${path}'"`)
  } else if (terminal === 'powershell') {
    // Windows PowerShell
    await execAsync(
      `start powershell.exe -NoExit -Command "Set-Location '${path}'"`
    )
  } else {
    // cmd.exe
    await execAsync(`start cmd.exe /K "cd /d ${path}"`)
  }
}

// Helper function to detect default terminal on Linux
async function getLinuxDefaultTerminal(): Promise<string | null> {
  // Check TERMINAL environment variable first
  if (process.env.TERMINAL) {
    return process.env.TERMINAL
  }

  // Check for x-terminal-emulator (Debian/Ubuntu default)
  try {
    await execAsync('which x-terminal-emulator 2>/dev/null')
    return 'x-terminal-emulator'
  } catch {
    // Continue to other checks
  }

  // Try to get default from xdg-mime
  try {
    const { stdout } = await execAsync(
      'xdg-mime query default x-scheme-handler/terminal 2>/dev/null'
    )
    if (stdout.trim()) {
      // Extract terminal name from .desktop file
      const desktopFile = stdout.trim()
      const terminalName = desktopFile.replace('.desktop', '')
      return terminalName
    }
  } catch {
    // Continue to fallback
  }

  // Try common terminals in order of popularity
  const terminals = [
    'gnome-terminal',
    'konsole',
    'xfce4-terminal',
    'alacritty',
    'kitty',
    'terminator',
    'tilix',
    'xterm',
  ]

  for (const terminal of terminals) {
    try {
      await execAsync(`which ${terminal} 2>/dev/null`)
      return terminal
    } catch {}
  }

  return null
}

// Helper function to open Linux terminal at path
async function openLinuxTerminal(terminal: string, path: string) {
  // Handle specific terminals with their working directory flags
  if (terminal === 'gnome-terminal') {
    await execAsync(`gnome-terminal --working-directory="${path}"`)
  } else if (terminal === 'konsole') {
    await execAsync(`konsole --workdir "${path}"`)
  } else if (terminal === 'xfce4-terminal') {
    await execAsync(`xfce4-terminal --working-directory="${path}"`)
  } else if (terminal === 'alacritty') {
    await execAsync(`alacritty --working-directory "${path}"`)
  } else if (terminal === 'kitty') {
    await execAsync(`kitty --directory="${path}"`)
  } else if (terminal === 'terminator') {
    await execAsync(`terminator --working-directory="${path}"`)
  } else if (terminal === 'tilix') {
    await execAsync(`tilix --working-directory="${path}"`)
  } else if (terminal === 'x-terminal-emulator') {
    await execAsync(`x-terminal-emulator --working-directory="${path}"`)
  } else {
    // Generic fallback - execute shell command to cd
    await execAsync(`${terminal} -e "cd '${path}' && $SHELL"`)
  }
}

// Open system terminal at a specific path using user's default terminal
ipcMain.handle('open-terminal-at-path', async (event, path) => {
  try {
    const platform = process.platform

    if (platform === 'darwin') {
      // macOS: Detect and use default terminal
      const terminal = await getMacOSDefaultTerminal()
      if (terminal) {
        await openMacOSTerminal(terminal, path)
      } else {
        throw new Error('No terminal application found')
      }
    } else if (platform === 'win32') {
      // Windows: Detect and use default terminal
      const terminal = await getWindowsDefaultTerminal()
      await openWindowsTerminal(terminal, path)
    } else {
      // Linux: Detect and use default terminal
      const terminal = await getLinuxDefaultTerminal()
      if (terminal) {
        await openLinuxTerminal(terminal, path)
      } else {
        throw new Error('No supported terminal emulator found')
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error opening terminal:', error)
    return {
      success: false,
      error: error.message,
    }
  }
})

// Clean up orphaned conversation worktree references
ipcMain.handle('cleanup-conversation-worktrees', async (event, projectPath) => {
  try {
    const { conversationsDir } = ensureProjectFolderStructure(projectPath)
    const conversationFiles = readdirSync(conversationsDir).filter(file =>
      file.endsWith('.json')
    )

    let cleanedCount = 0
    const errors: string[] = []

    for (const file of conversationFiles) {
      try {
        const filePath = join(conversationsDir, file)
        const conversation = loadConversationHistory(
          projectPath,
          file.replace('.json', '')
        )

        if (conversation?.worktreePath) {
          const isValid = await validateWorktreePath(conversation.worktreePath)

          if (!isValid) {
            console.log(`Cleaning up invalid worktree reference in ${file}`)
            const updatedConversation = {
              ...conversation,
              worktreePath: undefined,
              updatedAt: new Date(),
            }

            // Write the updated conversation directly
            const filePath = getConversationFilePath(
              projectPath,
              conversation.promptId
            )
            writeFileSync(
              filePath,
              JSON.stringify(updatedConversation, null, 2)
            )
            cleanedCount++
          }
        }
      } catch (error) {
        const errorMsg = `Error processing ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`
        console.error(errorMsg)
        errors.push(errorMsg)
      }
    }

    return {
      success: true,
      cleanedCount,
      errors,
    }
  } catch (error: any) {
    console.error('Error in cleanup-conversation-worktrees IPC handler:', error)
    return {
      success: false,
      error: error.message,
      cleanedCount: 0,
      errors: [],
    }
  }
})

// ============================================================================
// Claude SDK IPC Handler - Streams JSON messages in real-time
// ============================================================================
// LOGIC: This handler receives requests from the renderer to execute Claude SDK
// queries. We've extended it to include permission system parameters.
ipcMain.handle(
  'execute-claude-sdk',
  async (
    event,
    options: {
      prompt: string
      workingDirectory: string
      allowedTools?: string[]
      permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
      resume?: string
      // New fields for permission system:
      promptId?: string // Which conversation is making this request
      conversationTitle?: string // Display name for the conversation
      autoAcceptEnabled?: boolean // Whether auto-accept toggle is ON
    }
  ) => {
    try {
      // Pass all options including permission-related fields to executeClaudeQuery
      await executeClaudeQuery(options, event.sender)
      return { success: true }
    } catch (error: any) {
      console.error('Error in execute-claude-sdk IPC handler:', error)
      return {
        success: false,
        error: error.message,
      }
    }
  }
)

// ============================================================================
// Abort Claude SDK Query IPC Handler
// ============================================================================
// LOGIC: This handler receives abort requests from the renderer and calls
// the abortQuery function from claude-sdk.ts to stop the running query
ipcMain.handle('abort-claude-sdk', async (event, promptId: string) => {
  try {
    await abortQuery(promptId, event.sender)
    return { success: true }
  } catch (error: any) {
    console.error('Error aborting Claude SDK:', error)
    return {
      success: false,
      error: error.message,
    }
  }
})

// ============================================================================
// Auto-Accept State Update IPC Handler
// ============================================================================
// LOGIC: When user toggles the auto-accept switch in the UI, this handler
// immediately updates the in-memory cache so the running canUseTool callback
// uses the fresh value instead of the stale closure value.
ipcMain.on(
  'update-auto-accept-state',
  (event, data: { promptId: string; enabled: boolean }) => {
    console.log(
      `📥 [IPC] Received auto-accept update for conversation ${data.promptId}: ${data.enabled}`
    )
    updateAutoAcceptState(data.promptId, data.enabled)
  }
)

// ============================================================================
// Conversation State IPC Handlers
// ============================================================================
// LOGIC: Minimal IPC for conversation state management
// - GET ALL: Load all conversation states once on mount
// - UPDATE ONE: Update state when renderer triggers changes (e.g., Accept button)
// - BROADCAST: Main process auto-broadcasts changes via 'conversation-state-changed'

// GET ALL conversation states (called once on mount)
ipcMain.handle('get-all-conversation-states', () => {
  const states = getAllConversationStates()
  console.log(`📥 [IPC] Returning ${states.length} conversation states`)
  return states
})

// UPDATE ONE conversation state (called from renderer for UI-triggered changes)
ipcMain.on(
  'update-conversation-state',
  (event, data: { promptId: string; updates: Partial<ConversationState> }) => {
    console.log(
      `📥 [IPC] Updating conversation state for ${data.promptId}:`,
      data.updates
    )
    updateConversationState(data.promptId, data.updates)
  }
)

// ============================================================================
// Authentication Check IPC Handlers
// ============================================================================
// LOGIC: Check if Claude Agent SDK is authenticated by running a minimal test query
// If the query succeeds, authentication is working. If it fails, user needs to login.

/**
 * Check if Claude Agent SDK is authenticated
 * Returns { authenticated: boolean, error?: string }
 */
ipcMain.handle('check-claude-authentication', async () => {
  try {
    // Setup auth provider before testing SDK
    const { setupAuthProvider } = await import('./claude-sdk')
    const activeProvider = await setupAuthProvider()

    // Import query function from SDK
    const { query } = await import('@anthropic-ai/claude-agent-sdk')

    // Run a minimal test query with very short prompt and no tools
    // This will fail if not authenticated or if SDK is not working
    const testQuery = query({
      prompt: 'test',
      options: {
        cwd: app.getPath('home'),
        allowedTools: [],
        permissionMode: 'bypassPermissions',
      },
    })

    // Try to get first message - if this succeeds, we're authenticated
    const firstMessage = await testQuery.next()

    if (firstMessage.done === false) {
      console.log('✅ [Auth Check] Claude SDK is authenticated')
      return {
        authenticated: true,
        currentProvider: activeProvider,
      }
    }

    // If done immediately, something went wrong
    console.log('❌ [Auth Check] Test query completed without messages')
    return {
      authenticated: false,
      error: 'SDK returned no messages',
      errorType: 'unknown',
    }
  } catch (error: any) {
    console.error('❌ [Auth Check] Authentication check failed:', error)
    return {
      authenticated: false,
      error: error?.message || String(error),
      errorType: 'auth',
    }
  }
})

/**
 * Get the login URL for Claude authentication
 * This launches the setup-token flow which provides a login URL
 */
ipcMain.handle('get-claude-login-url', async () => {
  try {
    console.log('🔗 [Auth] Getting Claude login URL...')

    // The setup-token command generates a login URL
    // For now, we'll return the claude.com URL
    // TODO: Extract actual URL from setup-token command if needed
    const loginUrl = 'https://claude.ai/login'

    console.log('✅ [Auth] Login URL:', loginUrl)
    return { url: loginUrl }
  } catch (error: any) {
    console.error('❌ [Auth] Failed to get login URL:', error)
    return { error: error?.message || String(error) }
  }
})

// ============================================================================
// Provider Configuration IPC Handlers
// ============================================================================

/**
 * Get the currently active authentication provider
 */
ipcMain.handle('get-active-provider', async () => {
  try {
    const { getActiveProvider } = await import('./credential-manager')
    const provider = await getActiveProvider()
    return { provider }
  } catch (error: any) {
    console.error('❌ [Provider] Failed to get active provider:', error)
    return { error: error?.message || String(error) }
  }
})

/**
 * Set the active authentication provider
 */
ipcMain.handle('set-active-provider', async (event, provider: string) => {
  try {
    const { setActiveProvider } = await import('./credential-manager')
    await setActiveProvider(provider as any)
    console.log('✅ [Provider] Active provider set to:', provider)
    return { success: true }
  } catch (error: any) {
    console.error('❌ [Provider] Failed to set active provider:', error)
    return { error: error?.message || String(error) }
  }
})

/**
 * Get credentials for a specific provider
 */
ipcMain.handle('get-provider-credentials', async (event, provider: string) => {
  try {
    const { getCredentials } = await import('./credential-manager')
    const credentials = await getCredentials(provider as any)
    return { credentials }
  } catch (error: any) {
    console.error('❌ [Provider] Failed to get credentials:', error)
    return { error: error?.message || String(error) }
  }
})

/**
 * Save credentials for a specific provider
 */
ipcMain.handle(
  'save-provider-credentials',
  async (event, provider: string, credentials: any) => {
    try {
      const { saveCredentials, setActiveProvider } = await import(
        './credential-manager'
      )
      await saveCredentials(provider as any, credentials)
      // Also set this as the active provider
      await setActiveProvider(provider as any)
      console.log('✅ [Provider] Credentials saved for:', provider)
      return { success: true }
    } catch (error: any) {
      console.error('❌ [Provider] Failed to save credentials:', error)
      return { error: error?.message || String(error) }
    }
  }
)

/**
 * Delete credentials for a specific provider
 */
ipcMain.handle(
  'delete-provider-credentials',
  async (event, provider: string) => {
    try {
      const { deleteCredentials } = await import('./credential-manager')
      await deleteCredentials(provider as any)
      console.log('✅ [Provider] Credentials deleted for:', provider)
      return { success: true }
    } catch (error: any) {
      console.error('❌ [Provider] Failed to delete credentials:', error)
      return { error: error?.message || String(error) }
    }
  }
)

/**
 * Detect existing environment variables for a provider
 */
ipcMain.handle('detect-existing-env-vars', async (event, provider: string) => {
  try {
    const { detectExistingEnvVars } = await import('./credential-manager')
    const envVars = detectExistingEnvVars(provider as any)
    return { envVars }
  } catch (error: any) {
    console.error('❌ [Provider] Failed to detect env vars:', error)
    return { error: error?.message || String(error) }
  }
})

/**
 * Test provider connection with given credentials
 */
ipcMain.handle(
  'test-provider-connection',
  async (event, provider: string, credentials: any) => {
    try {
      console.log('🔍 [Provider] Testing connection for:', provider)

      // Temporarily set environment variables based on provider
      const originalEnv = { ...process.env }

      // Clear any existing provider env vars first
      delete process.env.CLAUDE_CODE_USE_BEDROCK
      delete process.env.CLAUDE_CODE_USE_VERTEX

      // Set provider-specific env vars
      if (provider === 'bedrock') {
        process.env.CLAUDE_CODE_USE_BEDROCK = '1'
        process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId
        process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey
        if (credentials.sessionToken)
          process.env.AWS_SESSION_TOKEN = credentials.sessionToken
        if (credentials.region) process.env.AWS_REGION = credentials.region
        if (credentials.model) process.env.ANTHROPIC_MODEL = credentials.model
      } else if (provider === 'vertex') {
        process.env.CLAUDE_CODE_USE_VERTEX = '1'
        process.env.CLOUD_ML_REGION = credentials.region || 'global'
        process.env.ANTHROPIC_VERTEX_PROJECT_ID = credentials.projectId
        if (credentials.model) process.env.ANTHROPIC_MODEL = credentials.model
        if (credentials.smallFastModel)
          process.env.ANTHROPIC_SMALL_FAST_MODEL = credentials.smallFastModel
        if (credentials.disablePromptCaching)
          process.env.DISABLE_PROMPT_CACHING = '1'
      } else if (provider === 'anthropic') {
        if (credentials.apiKey)
          process.env.ANTHROPIC_API_KEY = credentials.apiKey
      }

      // Test connection with a minimal query
      const { query } = await import('@anthropic-ai/claude-agent-sdk')
      const testQuery = query({
        prompt: 'hi',
        options: {
          cwd: '/tmp',
          allowedTools: [],
          permissionMode: 'bypassPermissions',
        },
      })

      const firstMessage = await testQuery.next()

      // Restore original environment
      process.env = originalEnv

      if (firstMessage.done === false) {
        console.log('✅ [Provider] Connection test successful')
        return { success: true }
      }

      console.log('❌ [Provider] Connection test failed - no response')
      return { success: false, error: 'No response from provider' }
    } catch (error: any) {
      console.error('❌ [Provider] Connection test failed:', error)
      return { success: false, error: error?.message || String(error) }
    }
  }
)

/**
 * Open an external URL in the default browser
 */
ipcMain.handle('open-external-url', async (event, url: string) => {
  try {
    await shell.openExternal(url)
    return { success: true }
  } catch (error: any) {
    console.error('❌ [Auth] Failed to open URL:', error)
    return { error: error?.message || String(error) }
  }
})

let tray: Tray | null = null

makeAppWithSingleInstanceLock(async () => {
  await app.whenReady()

  // Create tray icon
  // In development, resources are in src/resources/public
  // In production, resources are copied to the app's resources folder
  const isDev = !app.isPackaged
  const trayIconPath = isDev
    ? join(process.cwd(), 'src/resources/public/trayIconTemplate.png')
    : join(process.resourcesPath, 'public/trayIconTemplate.png')

  console.log('Tray icon path:', trayIconPath)
  const trayIcon = nativeImage.createFromPath(trayIconPath)
  trayIcon.setTemplateImage(true) // Enable macOS template mode
  tray = new Tray(trayIcon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show AlmondCoder',
      click: () => {
        const windows = BrowserWindow.getAllWindows()
        if (windows.length > 0) {
          windows[0].show()
          windows[0].focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setToolTip('AlmondCoder')
  tray.setContextMenu(contextMenu)

  // Handle tray icon click to show/hide window
  tray.on('click', () => {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      if (windows[0].isVisible()) {
        windows[0].hide()
      } else {
        windows[0].show()
        windows[0].focus()
      }
    }
  })

  await makeAppSetup(MainWindow)
})
