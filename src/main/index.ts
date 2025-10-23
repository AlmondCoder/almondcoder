import {
  app,
  dialog,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  BrowserWindow,
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

import { makeAppWithSingleInstanceLock } from 'lib/electron-app/factories/app/instance'
import { makeAppSetup } from 'lib/electron-app/factories/app/setup'
import { MainWindow } from './windows/main'
import { executeClaudeQuery } from './claude-sdk'
import type {
  EnhancedPromptHistoryItem,
  ConversationHistory,
  ConversationMessage,
  ProjectMetadata,
  ProjectSettings,
  BranchStatus,
  WorktreeInfo,
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

const validateWorktreePath = async (worktreePath: string): Promise<boolean> => {
  try {
    if (!existsSync(worktreePath)) {
      console.log('Worktree path does not exist:', worktreePath)
      return false
    }

    // Check if it's a valid git worktree
    const { stdout } = await execAsync('git worktree list --porcelain', {
      cwd: worktreePath,
    })

    return stdout.includes(worktreePath)
  } catch (error) {
    console.error('Error validating worktree path:', error)
    return false
  }
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

// Worktree utility functions
const generateShortUuid = (): string => {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 6)
  return `${timestamp}-${random}`.substring(0, 8)
}

const sanitizePromptName = (prompt: string): string => {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .substring(0, 30) // Limit length
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
}

const createWorktree = async (
  projectPath: string,
  branch: string,
  promptText: string,
  promptId: string,
  parentWorktreePath?: string
): Promise<WorktreeInfo> => {
  console.log('Creating worktree with params:', {
    projectPath,
    branch,
    promptText: promptText.substring(0, 50),
    promptId,
    parentWorktreePath,
  })

  // STEP 1: Check if repository has any commits
  let hasCommits = true
  try {
    await execAsync('git rev-parse HEAD', { cwd: projectPath })
  } catch (error) {
    hasCommits = false
    console.log('Repository has no commits yet, creating initial commit')
  }

  // STEP 2: Create initial commit if needed
  if (!hasCommits) {
    try {
      // Try to create initial commit with --allow-empty
      await execAsync('git commit --allow-empty -m "Initial commit"', {
        cwd: projectPath,
      })
      console.log('Created initial empty commit')
    } catch (commitError: any) {
      console.error('Error creating initial commit:', commitError)
      throw new Error(
        `Cannot create worktree: Repository has no commits and initial commit failed: ${commitError.message}`
      )
    }
  }

  // STEP 3: Validate and sanitize branch name
  let validBranch = branch.trim()

  // STEP 4: Check if branch exists in the repository
  try {
    await execAsync(`git rev-parse --verify "${validBranch}"`, {
      cwd: projectPath,
    })
    console.log(`Branch "${validBranch}" exists`)
  } catch (error) {
    console.log(
      `Branch "${validBranch}" doesn't exist, attempting to create or find default branch`
    )

    // Try to get current branch name
    try {
      const { stdout: currentBranchOutput } = await execAsync(
        'git rev-parse --abbrev-ref HEAD',
        { cwd: projectPath }
      )
      const currentBranch = currentBranchOutput.trim()

      // If we want 'main' but we're on a different branch, rename it
      if (validBranch === 'main' && currentBranch !== 'main') {
        try {
          await execAsync('git branch -M main', { cwd: projectPath })
          console.log(`Renamed branch ${currentBranch} to main`)
          validBranch = 'main'
        } catch (renameError) {
          console.error('Error renaming branch:', renameError)
          // Use current branch if rename fails
          validBranch = currentBranch
        }
      } else {
        // Use current branch
        validBranch = currentBranch
      }
    } catch (currentBranchError) {
      console.error('Error getting current branch:', currentBranchError)
      // Last resort: try to get default branch from remote
      try {
        const { stdout } = await execAsync(
          'git symbolic-ref refs/remotes/origin/HEAD',
          { cwd: projectPath }
        )
        validBranch = stdout.trim().replace('refs/remotes/origin/', '')
      } catch {
        // Absolute fallback
        validBranch = 'main'
      }
    }
  }

  const projectName = basename(projectPath)
  const sanitizedPromptName = sanitizePromptName(promptText)
  const shortUuid = generateShortUuid()
  const worktreeName = `${sanitizedPromptName}-${shortUuid}`

  const almondcoderDir = join(homedir(), '.almondcoder')
  if (!existsSync(almondcoderDir)) {
    mkdirSync(almondcoderDir, { recursive: true })
  }

  const projectWorktreeDir = join(almondcoderDir, projectName)
  if (!existsSync(projectWorktreeDir)) {
    mkdirSync(projectWorktreeDir, { recursive: true })
  }

  const worktreePath = join(projectWorktreeDir, worktreeName)

  try {
    // Create a unique branch name for this worktree
    // Format: almondcoder/<prompt-name>-<uuid>
    const uniqueBranchName = `almondcoder/${sanitizedPromptName}-${shortUuid}`
    console.log(`🌿 Creating worktree with branch name: ${uniqueBranchName}`)

    // If we have a parent worktree, create from it
    if (parentWorktreePath && existsSync(parentWorktreePath)) {
      console.log(`Creating worktree from parent: ${parentWorktreePath}`)

      // Create worktree from the parent worktree's current state
      // Use the parent worktree as the working directory to get its current branch/commit
      const { stdout: parentCommit } = await execAsync('git rev-parse HEAD', {
        cwd: parentWorktreePath,
      })

      const commitHash = parentCommit.trim()
      console.log(`Parent worktree is at commit: ${commitHash}`)

      // Create new worktree with a new branch based on the parent's commit
      await execAsync(
        `git worktree add -b "${uniqueBranchName}" "${worktreePath}" "${commitHash}"`,
        {
          cwd: projectPath,
        }
      )

      console.log(
        `✅ Created worktree: ${worktreePath} with branch ${uniqueBranchName} from parent worktree commit: ${commitHash}`
      )
    } else {
      // Create new branch from the validated branch and create worktree on it
      await execAsync(
        `git worktree add -b "${uniqueBranchName}" "${worktreePath}" "${validBranch}"`,
        {
          cwd: projectPath,
        }
      )

      console.log(
        `✅ Created worktree: ${worktreePath} with branch ${uniqueBranchName} from branch: ${validBranch}`
      )
    }

    return {
      worktreePath,
      promptId,
      projectName,
      sanitizedPromptName,
      shortUuid,
      branchName: uniqueBranchName,
    }
  } catch (error: any) {
    console.error('Error creating worktree:', error)
    throw new Error(`Failed to create worktree: ${error.message}`)
  }
}

const removeWorktree = async (worktreePath: string): Promise<void> => {
  try {
    // Remove the worktree
    await execAsync(`git worktree remove "${worktreePath}"`)
    console.log(`Removed worktree: ${worktreePath}`)
  } catch (error: any) {
    console.error('Error removing worktree:', error)
    // Don't throw error for cleanup, just log it
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

ipcMain.handle('get-app-data-path', () => {
  return join(homedir(), '.almondcoder')
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

// Project Memory IPC handlers - Reads/writes CLAUDE.md in project root
ipcMain.handle('read-project-memory', async (event, projectPath: string) => {
  try {
    const claudeMdPath = join(projectPath, 'CLAUDE.md')

    if (existsSync(claudeMdPath)) {
      return readFileSync(claudeMdPath, 'utf-8')
    }
    return ''
  } catch (error) {
    console.error('Error reading CLAUDE.md:', error)
    throw error
  }
})

ipcMain.handle('save-project-memory', async (event, projectPath: string, content: string) => {
  try {
    const claudeMdPath = join(projectPath, 'CLAUDE.md')
    writeFileSync(claudeMdPath, content, 'utf-8')
    return true
  } catch (error) {
    console.error('Error saving CLAUDE.md:', error)
    throw error
  }
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

ipcMain.handle('save-project-settings', async (event, projectPath: string, settings: ProjectSettings) => {
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
})

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

      // Read existing file content or create empty array
      let logEntries: any[] = []

      if (existsSync(expandedFilePath)) {
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
      } else {
        console.log('Creating new conversation log file:', expandedFilePath)
      }

      // Append new entry
      logEntries.push(logEntry)

      // Write back to file
      writeFileSync(expandedFilePath, JSON.stringify(logEntries, null, 2))
      console.log(
        '✅ Successfully wrote to conversation log:',
        expandedFilePath
      )

      return { success: true }
    } catch (error: any) {
      console.error('Error appending to conversation log:', error)
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
    return false
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
    // Get the diff between HEAD and working directory
    const { stdout } = await execAsync('git diff HEAD', { cwd: path })

    if (!stdout.trim()) {
      // No changes
      return { diffs: [], error: null }
    }

    // Parse the diff output
    const diffs: any[] = []
    const diffLines = stdout.split('\n')

    let currentFile: any = null
    let currentHunk: any = null
    let oldLineNumber = 0
    let newLineNumber = 0

    for (let i = 0; i < diffLines.length; i++) {
      const line = diffLines[i]

      // New file header (diff --git)
      if (line.startsWith('diff --git')) {
        if (currentFile) {
          diffs.push(currentFile)
        }

        // Extract file path from "diff --git a/path b/path"
        const match = line.match(/diff --git a\/(.*?) b\/(.*)/)
        const filePath = match ? match[2] : 'unknown'

        currentFile = {
          filePath,
          status: 'modified',
          additions: 0,
          deletions: 0,
          hunks: [],
        }
        currentHunk = null
      }

      // File status indicators
      if (line.startsWith('new file mode')) {
        if (currentFile) currentFile.status = 'added'
      } else if (line.startsWith('deleted file mode')) {
        if (currentFile) currentFile.status = 'deleted'
      }

      // Hunk header (@@ -oldStart,oldLines +newStart,newLines @@)
      if (line.startsWith('@@')) {
        if (currentHunk) {
          currentFile?.hunks.push(currentHunk)
        }

        const match = line.match(
          /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/
        )
        if (match) {
          oldLineNumber = parseInt(match[1], 10)
          const oldLines = match[2] ? parseInt(match[2], 10) : 1
          newLineNumber = parseInt(match[3], 10)
          const newLines = match[4] ? parseInt(match[4], 10) : 1

          currentHunk = {
            oldStart: oldLineNumber,
            oldLines,
            newStart: newLineNumber,
            newLines,
            lines: [
              {
                type: 'header',
                content: line,
              },
            ],
          }
        }
      } else if (
        currentHunk &&
        !line.startsWith('diff --git') &&
        !line.startsWith('index ') &&
        !line.startsWith('---') &&
        !line.startsWith('+++') &&
        !line.startsWith('new file') &&
        !line.startsWith('deleted file')
      ) {
        // Diff content lines
        if (line.startsWith('+')) {
          currentHunk.lines.push({
            type: 'added',
            content: line.substring(1),
            newLineNumber: newLineNumber++,
          })
          if (currentFile) currentFile.additions++
        } else if (line.startsWith('-')) {
          currentHunk.lines.push({
            type: 'deleted',
            content: line.substring(1),
            oldLineNumber: oldLineNumber++,
          })
          if (currentFile) currentFile.deletions++
        } else if (line.startsWith(' ')) {
          currentHunk.lines.push({
            type: 'context',
            content: line.substring(1),
            oldLineNumber: oldLineNumber++,
            newLineNumber: newLineNumber++,
          })
        }
      }
    }

    // Push the last file and hunk
    if (currentHunk) {
      currentFile?.hunks.push(currentHunk)
    }
    if (currentFile) {
      diffs.push(currentFile)
    }

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
    } catch {
      continue
    }
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
    await execAsync(`start powershell.exe -NoExit -Command "Set-Location '${path}'"`)
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
    const { stdout } = await execAsync('xdg-mime query default x-scheme-handler/terminal 2>/dev/null')
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
    } catch {
      continue
    }
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

let tray: Tray | null = null

makeAppWithSingleInstanceLock(async () => {
  await app.whenReady()

  // Create tray icon
  const trayIconPath = join(__dirname, '../resources/public/logo.svg')
  const trayIcon = nativeImage.createFromPath(trayIconPath)
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))

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
