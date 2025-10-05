import { app, dialog, ipcMain } from 'electron'
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
import { createHash } from 'node:crypto'
import * as pty from 'node-pty'
import stripAnsi from 'strip-ansi'

import { makeAppWithSingleInstanceLock } from 'lib/electron-app/factories/app/instance'
import { makeAppSetup } from 'lib/electron-app/factories/app/setup'
import { MainWindow } from './windows/main'
import type {
  EnhancedPromptHistoryItem,
  ConversationHistory,
  ConversationMessage,
  ProjectMetadata,
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
  if (data.parentWorktreePath !== undefined && typeof data.parentWorktreePath !== 'string')
    return false

  // aiSessionId is optional but if present, should be a string
  if (data.aiSessionId !== undefined && typeof data.aiSessionId !== 'string')
    return false

  // sessionWorkingDirectory is optional but if present, should be a string
  if (data.sessionWorkingDirectory !== undefined && typeof data.sessionWorkingDirectory !== 'string')
    return false

  // Validate each message
  for (const msg of data.messages) {
    if (!msg || typeof msg !== 'object') return false
    if (typeof msg.id !== 'string') return false
    if (typeof msg.content !== 'string') return false
    if (!['user', 'system', 'assistant', 'tool_call'].includes(msg.type)) return false
    if (!msg.timestamp) return false

    // For tool_call messages, validate optional tool-related fields
    if (msg.type === 'tool_call') {
      if (msg.toolName !== undefined && typeof msg.toolName !== 'string') return false
      if (msg.toolUseId !== undefined && typeof msg.toolUseId !== 'string') return false
      if (msg.toolResult !== undefined && typeof msg.toolResult !== 'string') return false
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

const saveConversationHistory = (conversationData: ConversationHistory) => {
  try {
    // Validate conversation data before saving
    if (!validateConversationData(conversationData)) {
      throw new Error('Invalid conversation data structure')
    }

    const filePath = getConversationFilePath(
      conversationData.projectPath,
      conversationData.promptId
    )

    // Ensure the directory exists
    ensureProjectFolderStructure(conversationData.projectPath)

    // Create backup if file already exists
    if (existsSync(filePath)) {
      try {
        const existingData = readFileSync(filePath, 'utf8')
        const backupPath = `${filePath}.backup`
        writeFileSync(backupPath, existingData)
      } catch (backupError) {
        // Don't fail save if backup creation fails
        console.warn(
          'Could not create backup of existing conversation file:',
          backupError
        )
      }
    }

    // Write the conversation data
    writeFileSync(filePath, JSON.stringify(conversationData, null, 2))
    console.log('Successfully saved conversation history:', filePath)
  } catch (error) {
    console.error('Error saving conversation history:', error)
    throw error // Re-throw so caller can handle the error
  }
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

// Legacy support functions for backward compatibility
const getProjectPromptHistoryPath = (projectPath: string) => {
  const appDataPath = join(homedir(), '.almondcoder')
  if (!existsSync(appDataPath)) {
    mkdirSync(appDataPath, { recursive: true })
  }

  const promptsDir = join(appDataPath, 'project-prompts')
  if (!existsSync(promptsDir)) {
    mkdirSync(promptsDir, { recursive: true })
  }

  const pathHash = createHash('sha256')
    .update(projectPath)
    .digest('hex')
    .substring(0, 16)
  return join(promptsDir, `${pathHash}.json`)
}

const loadProjectPromptHistory = (projectPath: string) => {
  try {
    const filePath = getProjectPromptHistoryPath(projectPath)
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Error loading project prompt history:', error)
  }
  return []
}

const saveProjectPromptHistory = (projectPath: string, prompts: any[]) => {
  try {
    const filePath = getProjectPromptHistoryPath(projectPath)
    writeFileSync(filePath, JSON.stringify(prompts, null, 2))
  } catch (error) {
    console.error('Error saving project prompt history:', error)
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
    // Format: worktree/<prompt-name>-<uuid>
    const uniqueBranchName = `worktree/${sanitizedPromptName}-${shortUuid}`

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
      await execAsync(`git worktree add -b "${uniqueBranchName}" "${worktreePath}" "${commitHash}"`, {
        cwd: projectPath,
      })

      console.log(`Created worktree: ${worktreePath} with branch ${uniqueBranchName} from parent worktree commit: ${commitHash}`)
    } else {
      // Create new branch from the validated branch and create worktree on it
      await execAsync(`git worktree add -b "${uniqueBranchName}" "${worktreePath}" "${validBranch}"`, {
        cwd: projectPath,
      })

      console.log(`Created worktree: ${worktreePath} with branch ${uniqueBranchName} from branch: ${validBranch}`)
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

ipcMain.handle(
  'save-conversation-history',
  (event, conversationData: ConversationHistory) => {
    saveConversationHistory(conversationData)
    return true
  }
)

ipcMain.handle(
  'add-conversation-message',
  async (event, projectPath, promptId, message: ConversationMessage) => {
    try {
      let conversation = loadConversationHistory(projectPath, promptId)

      if (!conversation) {
        // Create new conversation if it doesn't exist
        conversation = {
          promptId,
          projectPath,
          worktreePath: undefined,
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      }

      // Validate message structure before adding
      if (
        !message.id ||
        !message.content ||
        !message.type ||
        !message.timestamp
      ) {
        throw new Error('Invalid message structure')
      }

      // Check if message with this ID already exists to prevent duplicates
      const messageExists = conversation.messages.some(m => m.id === message.id)
      if (messageExists) {
        console.log(`Message with ID ${message.id} already exists, skipping duplicate`)
        return { success: true, skipped: true }
      }

      conversation.messages.push(message)
      conversation.updatedAt = new Date()

      await saveConversationHistory(conversation)
      return { success: true }
    } catch (error) {
      console.error('Error adding conversation message:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
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

// Legacy Prompt history IPC handlers (for backward compatibility)
ipcMain.handle('get-project-prompt-history', (event, projectPath) => {
  return loadProjectPromptHistory(projectPath)
})

ipcMain.handle('save-project-prompt-history', (event, projectPath, prompts) => {
  saveProjectPromptHistory(projectPath, prompts)
  return true
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

ipcMain.handle('clone-repository', async (event, repoUrl) => {
  try {
    // Check if this might be a private repository
    const isLikelyPrivateRepo = (url: string): boolean => {
      // Private repos typically require authentication
      // This is a heuristic check - we'll let git tell us if it needs credentials
      return (
        url.includes('github.com') ||
        url.includes('gitlab.com') ||
        url.includes('bitbucket.org')
      )
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
        'Only public repositories are allowed. Private repositories require authentication which is not supported.'
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
            console.log('Target branch is in a worktree, using merge without checkout')

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

            console.log(`Merged ${sourceBranch} into ${targetBranch} without checkout`)
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

// Execute shell commands with real-time streaming using PTY for interactive output
ipcMain.handle(
  'execute-command-stream',
  async (event, command, workingDirectory = undefined) => {
    return new Promise((resolve, reject) => {
      console.log('Executing streaming command:', command)
      if (workingDirectory) {
        console.log('Working directory:', workingDirectory)
      }

      // Determine the shell to use
      const shell = process.env.SHELL || '/bin/sh'

      // Use PTY for proper interactive terminal emulation
      const ptyProcess = pty.spawn(shell, ['-c', command], {
        name: 'dumb',
        cols: 120,
        rows: 30,
        cwd: workingDirectory || process.cwd(),
        env: {
          ...process.env,
          TERM: 'dumb', // Disable ANSI colors and formatting
          NO_COLOR: '1', // Standard environment variable to disable colors
          COLORTERM: '', // Remove color terminal support
          FORCE_COLOR: '0', // Disable forced colors
        },
      })

      let fullOutput = ''
      let timeoutHandle: NodeJS.Timeout | null = null

      // Handle data from PTY
      ptyProcess.onData((data) => {
        // Send raw data with ANSI codes to renderer - xterm.js will handle them
        fullOutput += data
        event.sender.send('command-output', {
          type: 'stdout',
          data: data,
          rawData: true, // Signal that this contains ANSI codes
        })
      })

      // Handle process exit
      ptyProcess.onExit(({ exitCode, signal }) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle)
        }

        // Strip ANSI for the final output return value
        const cleanOutput = stripAnsi(fullOutput)
        if (exitCode === 0) {
          resolve(cleanOutput)
        } else {
          reject(
            new Error(
              `Command failed with code ${exitCode}${signal ? ` (signal: ${signal})` : ''}`
            )
          )
        }
      })

      // Handle timeout (2 minutes)
      timeoutHandle = setTimeout(() => {
        ptyProcess.kill()
        reject(new Error('Command timed out after 2 minutes'))
      }, 120000)
    })
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

// Get project files
ipcMain.handle('get-project-files', async (event, projectPath) => {
  try {
    const getFiles = (dirPath: string, relativePath = ''): string[] => {
      const items = readdirSync(dirPath)
      let files: string[] = []

      for (const item of items) {
        // Skip common directories to avoid
        if (
          [
            '.git',
            'node_modules',
            '.DS_Store',
            'dist',
            'build',
            'coverage',
          ].includes(item)
        ) {
          continue
        }

        const fullPath = join(dirPath, item)
        const itemRelativePath = relativePath ? join(relativePath, item) : item

        try {
          const stat = statSync(fullPath)
          if (stat.isDirectory()) {
            // Recursively get files from subdirectories (limit depth)
            if (relativePath.split('/').length < 3) {
              files = files.concat(getFiles(fullPath, itemRelativePath))
            }
          } else if (stat.isFile()) {
            // Only include common code file extensions
            const ext = item.split('.').pop()?.toLowerCase()
            if (
              [
                'js',
                'ts',
                'jsx',
                'tsx',
                'py',
                'java',
                'go',
                'rs',
                'cpp',
                'c',
                'h',
                'cs',
                'php',
                'rb',
                'swift',
                'kt',
                'scala',
                'dart',
                'vue',
                'svelte',
                'html',
                'css',
                'scss',
                'less',
                'json',
                'yaml',
                'yml',
                'toml',
                'md',
                'txt',
                'sql',
                'sh',
                'bat',
              ].includes(ext || '')
            ) {
              files.push(itemRelativePath)
            }
          }
        } catch (error) {}
      }

      return files
    }

    const files = getFiles(projectPath)
    return files.slice(0, 50) // Limit to 50 files to avoid overwhelming the UI
  } catch (error) {
    console.error('Error getting project files:', error)
    return []
  }
})

// Check if Claude CLI is installed
ipcMain.handle('check-claude-installation', async () => {
  try {
    // First try to run claude directly
    try {
      await execAsync('claude --version')
      return { installed: true, inPath: true }
    } catch (error) {
      // If claude command fails, check if it exists in ~/.local/bin
      const claudePath = join(homedir(), '.local', 'bin', 'claude')
      if (existsSync(claudePath)) {
        return { installed: true, inPath: false }
      }
      return { installed: false, inPath: false }
    }
  } catch (error) {
    console.error('Error checking Claude installation:', error)
    return { installed: false, inPath: false }
  }
})

// Install Claude CLI
ipcMain.handle('install-claude', async () => {
  try {
    // Download and run the installation script
    const installCommand = 'curl -fsSL https://claude.ai/install.sh | bash'
    const { stdout, stderr } = await execAsync(installCommand, {
      timeout: 120000, // 2 minutes timeout
      env: { ...process.env },
    })

    return {
      success: true,
      output: stdout + (stderr ? `\n${stderr}` : ''),
    }
  } catch (error: any) {
    console.error('Error installing Claude:', error)
    return {
      success: false,
      error: error.message,
      output: (error.stdout || '') + (error.stderr ? `\n${error.stderr}` : ''),
    }
  }
})

// Setup Claude CLI in PATH
ipcMain.handle('setup-claude-path', async () => {
  try {
    // Add ~/.local/bin to PATH in shell configuration
    const setupCommand =
      'echo \'export PATH="$HOME/.local/bin:$PATH"\' >> ~/.zshrc && source ~/.zshrc'
    const { stdout, stderr } = await execAsync(setupCommand, {
      timeout: 30000, // 30 seconds timeout
      shell: '/bin/zsh',
    })

    return {
      success: true,
      output: stdout + (stderr ? `\n${stderr}` : ''),
    }
  } catch (error: any) {
    console.error('Error setting up Claude PATH:', error)

    // Try with bash if zsh fails
    try {
      const bashSetupCommand =
        'echo \'export PATH="$HOME/.local/bin:$PATH"\' >> ~/.bash_profile && source ~/.bash_profile'
      const { stdout, stderr } = await execAsync(bashSetupCommand, {
        timeout: 30000,
        shell: '/bin/bash',
      })

      return {
        success: true,
        output: stdout + (stderr ? `\n${stderr}` : ''),
        shell: 'bash',
      }
    } catch (bashError: any) {
      return {
        success: false,
        error: error.message,
        output:
          (error.stdout || '') + (error.stderr ? `\n${error.stderr}` : ''),
      }
    }
  }
})

// Worktree IPC handlers
ipcMain.handle(
  'create-worktree',
  async (event, projectPath, branch, promptText, promptId, parentWorktreePath) => {
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

// Capture AI session ID from filesystem
const captureClaudeSessionId = async (projectPath: string): Promise<string | null> => {
  try {
    // Sanitize project path for Claude's directory structure
    const sanitizedPath = projectPath.replace(/\//g, '-')
    const claudeSessionsDir = join(homedir(), '.claude', 'projects', sanitizedPath)

    if (!existsSync(claudeSessionsDir)) {
      console.log('Claude sessions directory does not exist:', claudeSessionsDir)
      return null
    }

    // Get list of session files
    const files = readdirSync(claudeSessionsDir)
    const sessionFiles = files
      .filter(file => file.endsWith('.jsonl'))
      .map(file => ({
        name: file,
        mtime: statSync(join(claudeSessionsDir, file)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime)

    if (sessionFiles.length === 0) {
      console.log('No Claude session files found')
      return null
    }

    // Get the newest session file
    const newestSession = sessionFiles[0]
    const sessionId = newestSession.name.replace('.jsonl', '')

    console.log('Captured Claude session ID:', sessionId)
    return sessionId
  } catch (error) {
    console.error('Error capturing Claude session ID:', error)
    return null
  }
}

ipcMain.handle('capture-ai-session-id', async (event, projectPath, aiTool) => {
  try {
    let sessionId: string | null = null

    // Only Claude Code is supported for now
    if (aiTool === 'claude-code') {
      sessionId = await captureClaudeSessionId(projectPath)
    }
    // TODO: Add support for cursor-cli and codex session capture

    return {
      success: true,
      sessionId,
    }
  } catch (error: any) {
    console.error('Error in capture-ai-session-id IPC handler:', error)
    return {
      success: false,
      error: error.message,
      sessionId: null,
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

            saveConversationHistory(updatedConversation)
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

makeAppWithSingleInstanceLock(async () => {
  await app.whenReady()
  await makeAppSetup(MainWindow)
})
