import { app, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { exec, spawn } from 'node:child_process'
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
              currentContent += line + '\n'
            } else {
              incomingContent += line + '\n'
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
ipcMain.handle('execute-command-stream', async (event, command) => {
  return new Promise((resolve, reject) => {
    console.log('Executing streaming command:', command)

    // Use shell directly instead of splitting command
    const childProcess = spawn('sh', ['-c', command], {
      timeout: 120000, // 2 minute timeout
      stdio: ['ignore', 'pipe', 'pipe'], // Explicitly set stdio
      env: { ...process.env }, // Inherit environment
    })

    let stdout = ''
    let stderr = ''

    childProcess.stdout?.on('data', (data) => {
      const chunk = data.toString()
      stdout += chunk
      // Send real-time data to renderer
      event.sender.send('command-output', { type: 'stdout', data: chunk })
    })

    childProcess.stderr?.on('data', (data) => {
      const chunk = data.toString()
      stderr += chunk
      // Send real-time data to renderer
      event.sender.send('command-output', { type: 'stderr', data: chunk })
    })

    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve(stdout + (stderr ? '\n' + stderr : ''))
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr || 'Unknown error'}`))
      }
    })

    childProcess.on('error', (error) => {
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
})

// Keep the original execute-command for compatibility
ipcMain.handle('execute-command', async (event, command) => {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: 120000, // 2 minute timeout
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer for large outputs
    })

    // Return both stdout and stderr, Claude might output to either
    return stdout + (stderr ? '\n' + stderr : '')
  } catch (error: any) {
    console.error('Error executing command:', error)

    // Include both stdout and stderr even on error, as Claude might still provide useful output
    const output = (error.stdout || '') + (error.stderr ? '\n' + error.stderr : '')
    if (output.trim()) {
      return output
    }

    throw new Error(`Command failed: ${error.message}`)
  }
})

// Get project files
ipcMain.handle('get-project-files', async (event, projectPath) => {
  try {
    const getFiles = (dirPath: string, relativePath = ''): string[] => {
      const items = readdirSync(dirPath)
      let files: string[] = []

      for (const item of items) {
        // Skip common directories to avoid
        if (['.git', 'node_modules', '.DS_Store', 'dist', 'build', 'coverage'].includes(item)) {
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
            if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs', 'cpp', 'c', 'h', 'cs', 'php', 'rb', 'swift', 'kt', 'scala', 'dart', 'vue', 'svelte', 'html', 'css', 'scss', 'less', 'json', 'yaml', 'yml', 'toml', 'md', 'txt', 'sql', 'sh', 'bat'].includes(ext || '')) {
              files.push(itemRelativePath)
            }
          }
        } catch (error) {
          // Skip files we can't read
          continue
        }
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
      env: { ...process.env }
    })

    return {
      success: true,
      output: stdout + (stderr ? '\n' + stderr : '')
    }
  } catch (error: any) {
    console.error('Error installing Claude:', error)
    return {
      success: false,
      error: error.message,
      output: (error.stdout || '') + (error.stderr ? '\n' + error.stderr : '')
    }
  }
})

// Setup Claude CLI in PATH
ipcMain.handle('setup-claude-path', async () => {
  try {
    // Add ~/.local/bin to PATH in shell configuration
    const setupCommand = 'echo \'export PATH="$HOME/.local/bin:$PATH"\' >> ~/.zshrc && source ~/.zshrc'
    const { stdout, stderr } = await execAsync(setupCommand, {
      timeout: 30000, // 30 seconds timeout
      shell: '/bin/zsh'
    })

    return {
      success: true,
      output: stdout + (stderr ? '\n' + stderr : '')
    }
  } catch (error: any) {
    console.error('Error setting up Claude PATH:', error)

    // Try with bash if zsh fails
    try {
      const bashSetupCommand = 'echo \'export PATH="$HOME/.local/bin:$PATH"\' >> ~/.bash_profile && source ~/.bash_profile'
      const { stdout, stderr } = await execAsync(bashSetupCommand, {
        timeout: 30000,
        shell: '/bin/bash'
      })

      return {
        success: true,
        output: stdout + (stderr ? '\n' + stderr : ''),
        shell: 'bash'
      }
    } catch (bashError: any) {
      return {
        success: false,
        error: error.message,
        output: (error.stdout || '') + (error.stderr ? '\n' + error.stderr : '')
      }
    }
  }
})

makeAppWithSingleInstanceLock(async () => {
  await app.whenReady()
  await makeAppSetup(MainWindow)
})
