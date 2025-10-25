import { join, basename } from 'node:path'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  statSync,
  lstatSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { WorktreeInfo } from '../shared/types'

const execAsync = promisify(exec)

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a short UUID for unique identification
 */
export const generateShortUuid = (): string => {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 6)
  return `${timestamp}-${random}`.substring(0, 8)
}

/**
 * Sanitize prompt text to create valid branch/folder names
 */
export const sanitizePromptName = (prompt: string): string => {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .substring(0, 30) // Limit length
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
}

// ============================================================================
// Git Repository Functions
// ============================================================================

/**
 * Check if repository has any commits and create initial commit if needed
 */
export const ensureRepositoryHasCommits = async (
  projectPath: string
): Promise<void> => {
  let hasCommits = true
  try {
    await execAsync('git rev-parse HEAD', { cwd: projectPath })
  } catch (error) {
    hasCommits = false
    console.log('Repository has no commits yet, creating initial commit')
  }

  if (!hasCommits) {
    try {
      await execAsync('git commit --allow-empty -m "Initial commit"', {
        cwd: projectPath,
      })
      console.log('Created initial empty commit')
    } catch (commitError: any) {
      throw new Error(
        `Cannot create worktree: Repository has no commits and initial commit failed: ${commitError.message}`
      )
    }
  }
}

/**
 * Validate that a branch exists or get the current/default branch
 */
export const validateAndGetBranch = async (
  projectPath: string,
  branch: string
): Promise<string> => {
  const validBranch = branch.trim()

  // Check if branch exists in the repository
  try {
    await execAsync(`git rev-parse --verify "${validBranch}"`, {
      cwd: projectPath,
    })
    console.log(`Branch "${validBranch}" exists`)
    return validBranch
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
          return 'main'
        } catch (renameError) {
          console.error('Error renaming branch:', renameError)
          return currentBranch
        }
      }
      return currentBranch
    } catch (currentBranchError) {
      console.error('Error getting current branch:', currentBranchError)
      // Last resort: try to get default branch from remote
      try {
        const { stdout } = await execAsync(
          'git symbolic-ref refs/remotes/origin/HEAD',
          { cwd: projectPath }
        )
        return stdout.trim().replace('refs/remotes/origin/', '')
      } catch {
        return 'main' // Absolute fallback
      }
    }
  }
}

// ============================================================================
// Git Stash Functions
// ============================================================================

/**
 * Stash uncommitted changes including untracked files
 * Returns the stash UUID if changes were stashed, null otherwise
 */
export const stashUncommittedChanges = async (
  projectPath: string
): Promise<{ stashUuid: string | null; hasStashedChanges: boolean }> => {
  try {
    // Check if there are any changes to stash (staged, unstaged, or untracked)
    const { stdout: statusOutput } = await execAsync('git status --porcelain', {
      cwd: projectPath,
    })

    if (statusOutput.trim()) {
      // There are changes to stash
      const stashUuid = generateShortUuid()
      const stashMessage = `almondcoder-stash-${stashUuid}`

      console.log(
        `📦 Stashing uncommitted changes with message: ${stashMessage}`
      )
      await execAsync(`git stash push -u -m "${stashMessage}"`, {
        cwd: projectPath,
      })

      console.log('✅ Successfully stashed uncommitted changes')
      return { stashUuid, hasStashedChanges: true }
    }

    console.log('ℹ️  No uncommitted changes to stash')
    return { stashUuid: null, hasStashedChanges: false }
  } catch (stashError: any) {
    console.error('Error stashing changes:', stashError)
    console.warn('⚠️  Continuing without stashing changes')
    return { stashUuid: null, hasStashedChanges: false }
  }
}

/**
 * Apply stashed changes to worktree and pop from original directory
 */
export const applyStashedChanges = async (
  projectPath: string,
  worktreePath: string
): Promise<void> => {
  try {
    console.log('📥 Applying stashed changes to new worktree...')

    // Apply the stash in the new worktree directory
    await execAsync('git stash apply stash@{0}', {
      cwd: worktreePath,
    })

    console.log('✅ Successfully applied stashed changes to worktree')

    // Pop the stash from the original directory to clean up and restore original state
    console.log('🔄 Popping stash from original directory...')
    await execAsync('git stash pop', {
      cwd: projectPath,
    })

    console.log('✅ Successfully popped stash from original directory')
  } catch (stashApplyError: any) {
    console.error('Error applying/popping stash:', stashApplyError)
    console.warn(
      '⚠️  Failed to apply stashed changes to worktree, but worktree was created successfully'
    )

    // Try to pop the stash anyway to clean up
    try {
      await execAsync('git stash pop', { cwd: projectPath })
      console.log('✅ Cleaned up stash from original directory')
    } catch (popError) {
      console.error('Error popping stash during cleanup:', popError)
    }
  }
}

/**
 * Restore stashed changes by popping the stash (used on error)
 */
export const restoreStashedChanges = async (
  projectPath: string
): Promise<void> => {
  try {
    console.log(
      '🔄 Restoring stashed changes due to worktree creation failure...'
    )
    await execAsync('git stash pop', { cwd: projectPath })
    console.log('✅ Restored stashed changes')
  } catch (popError) {
    console.error('Error restoring stash after worktree failure:', popError)
  }
}

// ============================================================================
// Gitignore Symlink Functions
// ============================================================================

/**
 * Parse .gitignore file and return list of patterns
 */
const parseGitignore = (gitignorePath: string): string[] => {
  try {
    if (!existsSync(gitignorePath)) {
      return []
    }

    const content = readFileSync(gitignorePath, 'utf8')
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => {
        // Skip empty lines and comments
        if (!line || line.startsWith('#')) return false
        // Skip negation patterns (lines starting with !)
        if (line.startsWith('!')) return false
        return true
      })
      .map(pattern => {
        // Remove leading slash
        if (pattern.startsWith('/')) {
          return pattern.substring(1)
        }
        return pattern
      })
  } catch (error) {
    console.error('Error parsing .gitignore:', error)
    return []
  }
}

/**
 * Check if a path matches a gitignore pattern
 */
const matchesPattern = (path: string, pattern: string): boolean => {
  // Simple pattern matching - handle wildcards and directories
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1)
    return path.startsWith(prefix)
  }
  if (pattern.endsWith('/')) {
    // Directory pattern
    return path === pattern.slice(0, -1) || path.startsWith(pattern)
  }
  return path === pattern
}

/**
 * Create symlinks for .gitignore entries from original repo to worktree
 */
export const createGitignoreSymlinks = async (
  projectPath: string,
  worktreePath: string
): Promise<void> => {
  const gitignorePath = join(projectPath, '.gitignore')

  if (!existsSync(gitignorePath)) {
    console.log('ℹ️  No .gitignore file found, skipping symlink creation')
    return
  }

  console.log('🔗 Creating symlinks for .gitignore entries...')

  const patterns = parseGitignore(gitignorePath)
  let symlinkCount = 0

  for (const pattern of patterns) {
    try {
      // Skip patterns with wildcards in the middle (complex patterns)
      if (pattern.includes('*') && !pattern.endsWith('*')) {
        continue
      }

      // Remove trailing wildcard for directory checking
      const cleanPattern = pattern.endsWith('*')
        ? pattern.slice(0, -1)
        : pattern

      // Check if the pattern matches a file or directory in the original repo
      const originalPath = join(projectPath, cleanPattern)
      const worktreeTargetPath = join(worktreePath, cleanPattern)

      // Check if path exists in original directory
      if (!existsSync(originalPath)) {
        continue
      }

      // Check if it's already a symlink in worktree
      if (existsSync(worktreeTargetPath)) {
        try {
          const stats = lstatSync(worktreeTargetPath)
          if (stats.isSymbolicLink()) {
            console.log(`  ⏭️  Symlink already exists: ${cleanPattern}`)
            continue
          }
        } catch (error) {
          // Continue to create symlink
        }
      }

      // Get stats to determine if it's a file or directory
      const stats = statSync(originalPath)

      if (stats.isDirectory() || stats.isFile()) {
        // Create parent directory if needed
        const worktreeParent = join(worktreeTargetPath, '..')
        if (!existsSync(worktreeParent)) {
          mkdirSync(worktreeParent, { recursive: true })
        }

        // Create symlink
        symlinkSync(
          originalPath,
          worktreeTargetPath,
          stats.isDirectory() ? 'dir' : 'file'
        )
        symlinkCount++
        console.log(`  ✅ Created symlink: ${cleanPattern}`)
      }
    } catch (error: any) {
      // Log but don't fail - symlink creation is best-effort
      console.warn(
        `  ⚠️  Failed to create symlink for ${pattern}: ${error.message}`
      )
    }
  }

  console.log(`🔗 Created ${symlinkCount} symlinks from .gitignore entries`)
}

// ============================================================================
// Main Worktree Creation Function
// ============================================================================

/**
 * Create a new git worktree for an AlmondCoder conversation
 */
export const createWorktree = async (
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

  // STEP 1: Ensure repository has commits
  await ensureRepositoryHasCommits(projectPath)

  // STEP 2: Stash uncommitted changes
  const { stashUuid, hasStashedChanges } =
    await stashUncommittedChanges(projectPath)

  // STEP 3: Validate and get branch
  const validBranch = await validateAndGetBranch(projectPath, branch)

  // STEP 4: Prepare worktree directory
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
    // STEP 5: Create worktree with unique branch
    const uniqueBranchName = `almondcoder/${sanitizedPromptName}-${shortUuid}`
    console.log(`🌿 Creating worktree with branch name: ${uniqueBranchName}`)

    if (parentWorktreePath && existsSync(parentWorktreePath)) {
      // Create from parent worktree
      console.log(`Creating worktree from parent: ${parentWorktreePath}`)

      const { stdout: parentCommit } = await execAsync('git rev-parse HEAD', {
        cwd: parentWorktreePath,
      })

      const commitHash = parentCommit.trim()
      console.log(`Parent worktree is at commit: ${commitHash}`)

      await execAsync(
        `git worktree add -b "${uniqueBranchName}" "${worktreePath}" "${commitHash}"`,
        { cwd: projectPath }
      )

      console.log(
        `✅ Created worktree: ${worktreePath} with branch ${uniqueBranchName} from parent worktree commit: ${commitHash}`
      )
    } else {
      // Create from validated branch
      await execAsync(
        `git worktree add -b "${uniqueBranchName}" "${worktreePath}" "${validBranch}"`,
        { cwd: projectPath }
      )

      console.log(
        `✅ Created worktree: ${worktreePath} with branch ${uniqueBranchName} from branch: ${validBranch}`
      )
    }

    // STEP 6: Apply stashed changes to worktree
    if (hasStashedChanges && stashUuid) {
      await applyStashedChanges(projectPath, worktreePath)
    }

    // STEP 7: Create symlinks for .gitignore entries
    await createGitignoreSymlinks(projectPath, worktreePath)

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

    // Restore stashed changes if we stashed them
    if (hasStashedChanges) {
      await restoreStashedChanges(projectPath)
    }

    throw new Error(`Failed to create worktree: ${error.message}`)
  }
}

/**
 * Remove a git worktree
 */
export const removeWorktree = async (worktreePath: string): Promise<void> => {
  try {
    await execAsync(`git worktree remove "${worktreePath}"`)
    console.log(`Removed worktree: ${worktreePath}`)
  } catch (error: any) {
    console.error('Error removing worktree:', error)
    // Don't throw error for cleanup, just log it
  }
}

/**
 * Validate if a worktree path is still valid
 */
export const validateWorktreePath = async (
  worktreePath: string
): Promise<boolean> => {
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
