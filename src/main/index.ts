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
import { exec, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'

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
          endExecutionTime: parsed.endExecutionTime
            ? new Date(parsed.endExecutionTime)
            : null,
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

const loadConversationHistory = (
  projectPath: string,
  promptId: string
): ConversationHistory | null => {
  try {
    const filePath = getConversationFilePath(projectPath, promptId)
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(data)
      return {
        ...parsed,
        messages: parsed.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        })),
        createdAt: new Date(parsed.createdAt),
        updatedAt: new Date(parsed.updatedAt),
      }
    }
  } catch (error) {
    console.error('Error loading conversation history:', error)
  }
  return null
}

const saveConversationHistory = (conversationData: ConversationHistory) => {
  try {
    const filePath = getConversationFilePath(
      conversationData.projectPath,
      conversationData.promptId
    )
    writeFileSync(filePath, JSON.stringify(conversationData, null, 2))
  } catch (error) {
    console.error('Error saving conversation history:', error)
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
  promptId: string
): Promise<WorktreeInfo> => {
  console.log('Creating worktree with params:', { projectPath, branch, promptText: promptText.substring(0, 50), promptId })

  // Validate and sanitize branch name
  let validBranch = branch.trim()

  // Check if branch exists in the repository
  try {
    await execAsync(`git rev-parse --verify "${validBranch}"`, {
      cwd: projectPath,
    })
  } catch (error) {
    console.log(`Branch "${validBranch}" doesn't exist, falling back to default branch`)
    // Get the default branch if the specified branch doesn't exist
    try {
      const { stdout } = await execAsync('git symbolic-ref refs/remotes/origin/HEAD', {
        cwd: projectPath,
      })
      validBranch = stdout.trim().replace('refs/remotes/origin/', '')
    } catch {
      // Fallback to 'main' if we can't determine the default branch
      validBranch = 'main'
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
    // Create the worktree using the validated branch
    await execAsync(`git worktree add -f "${worktreePath}" "${validBranch}"`, {
      cwd: projectPath,
    })

    console.log(`Created worktree: ${worktreePath} from branch: ${validBranch}`)

    return {
      worktreePath,
      promptId,
      projectName,
      sanitizedPromptName,
      shortUuid,
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
  (event, projectPath, promptId, message: ConversationMessage) => {
    let conversation = loadConversationHistory(projectPath, promptId)

    if (!conversation) {
      conversation = {
        promptId,
        projectPath,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    }

    conversation.messages.push(message)
    conversation.updatedAt = new Date()

    saveConversationHistory(conversation)
    return true
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
    // Get all branches with their commit info
    const { stdout: branchInfo } = await execAsync(
      'git for-each-ref --format="%(refname:short)|%(objectname)|%(authordate:iso8601)|%(authorname)|%(subject)" refs/heads/ refs/remotes/',
      { cwd: path }
    )

    // Get current branch
    const { stdout: currentBranch } = await execAsync(
      'git rev-parse --abbrev-ref HEAD',
      { cwd: path }
    )

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
            name === currentBranch.trim() ||
            name === `origin/${currentBranch.trim()}`,
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
      currentBranch: currentBranch.trim(),
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
      // Switch to target branch
      await execAsync(`git checkout ${targetBranch}`, { cwd: path })

      // Attempt merge
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

// Execute shell commands with real-time streaming
ipcMain.handle(
  'execute-command-stream',
  async (event, command, workingDirectory = undefined) => {
    return new Promise((resolve, reject) => {
      console.log('Executing streaming command:', command)
      if (workingDirectory) {
        console.log('Working directory:', workingDirectory)
      }

      // Use shell directly instead of splitting command
      const spawnOptions: any = {
        timeout: 120000, // 2 minute timeout
        stdio: ['ignore', 'pipe', 'pipe'], // Explicitly set stdio
        env: { ...process.env }, // Inherit environment
      }

      // Add working directory if provided
      if (workingDirectory) {
        spawnOptions.cwd = workingDirectory
      }

      const childProcess = spawn('sh', ['-c', command], spawnOptions)

      let stdout = ''
      let stderr = ''

      childProcess.stdout?.on('data', data => {
        const chunk = data.toString()
        stdout += chunk
        // Send real-time data to renderer
        event.sender.send('command-output', { type: 'stdout', data: chunk })
      })

      childProcess.stderr?.on('data', data => {
        const chunk = data.toString()
        stderr += chunk
        // Send real-time data to renderer
        event.sender.send('command-output', { type: 'stderr', data: chunk })
      })

      childProcess.on('close', code => {
        if (code === 0) {
          resolve(stdout + (stderr ? `\n${stderr}` : ''))
        } else {
          reject(
            new Error(
              `Command failed with code ${code}: ${stderr || 'Unknown error'}`
            )
          )
        }
      })

      childProcess.on('error', error => {
        reject(new Error(`Command failed: ${error.message}`))
      })

      // Handle timeout
      setTimeout(() => {
        if (!childProcess.killed) {
          childProcess.kill('SIGKILL')
          reject(new Error('Command timed out after 2 minutes'))
        }
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
  async (event, projectPath, branch, promptText, promptId) => {
    try {
      const worktreeInfo = await createWorktree(
        projectPath,
        branch,
        promptText,
        promptId
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

makeAppWithSingleInstanceLock(async () => {
  await app.whenReady()
  await makeAppSetup(MainWindow)
})
