import {
  query,
  type CanUseTool,
  type PermissionResult,
} from '@anthropic-ai/claude-agent-sdk'
import type { BrowserWindow } from 'electron'
import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { homedir, userInfo, tmpdir } from 'node:os'

// ============================================================================
// PATH Augmentation - Runs IMMEDIATELY at Module Load Time
// ============================================================================
/**
 * CRITICAL FIX for "spawn node ENOENT" error.
 *
 * When macOS launches an app via double-click, it provides a minimal PATH:
 * /usr/bin:/bin:/usr/sbin:/sbin
 *
 * This doesn't include /usr/local/bin or /opt/homebrew/bin where Node.js
 * is typically installed via Homebrew.
 *
 * This IIFE runs IMMEDIATELY when this module is imported, ensuring PATH
 * is augmented BEFORE any other code runs.
 */
;(function initializeNodePath() {
  const currentPath = process.env.PATH || ''
  const originalPath = currentPath // Save for logging

  // Common Node.js installation paths (in priority order)
  const additionalPaths = [
    '/usr/local/bin',           // Homebrew on Intel Macs
    '/opt/homebrew/bin',        // Homebrew on Apple Silicon
    '/usr/bin',                 // System installations
  ]

  // Filter paths that exist and aren't already in PATH
  const newPaths = additionalPaths.filter(p => {
    return existsSync(p) && !currentPath.split(':').includes(p)
  })

  if (newPaths.length > 0) {
    // Prepend new paths to existing PATH (so they're searched first)
    process.env.PATH = `${newPaths.join(':')}:${currentPath}`
    console.log(`🚀 [PATH] Module load: Augmented PATH with Node.js locations`)
    console.log(`   Added: ${newPaths.join(', ')}`)
    console.log(`   Before: ${originalPath}`)
    console.log(`   After:  ${process.env.PATH}`)
  } else {
    console.log(`✅ [PATH] Module load: Node.js paths already in PATH`)
    console.log(`   Current: ${currentPath}`)
  }
})()

// ============================================================================
// SDK Path Resolution (Development vs Production)
// ============================================================================
/**
 * Get the correct path to the Claude SDK in both dev and production.
 * In production, the SDK is unpacked from ASAR to app.asar.unpacked/
 */
function getSDKPath(): string {
  const isPackaged = app.isPackaged

  if (!isPackaged) {
    // Development: use node_modules directly
    const devPath = join(process.cwd(), 'node_modules', '@anthropic-ai/claude-agent-sdk')
    console.log(`🔍 [SDK Path] Development mode: ${devPath}`)
    return devPath
  }

  // Production: SDK is unpacked in app.asar.unpacked
  const prodPath = join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '@anthropic-ai/claude-agent-sdk'
  )

  console.log(`🔍 [SDK Path] Production mode: ${prodPath}`)
  console.log(`🔍 [SDK Path] Resources path: ${process.resourcesPath}`)
  console.log(`🔍 [SDK Path] SDK exists: ${existsSync(prodPath)}`)

  // Verify CLI exists
  const cliPath = join(prodPath, 'cli.js')
  console.log(`🔍 [SDK Path] CLI path: ${cliPath}`)
  console.log(`🔍 [SDK Path] CLI exists: ${existsSync(cliPath)}`)

  return prodPath
}

/**
 * Verify SDK is properly accessible (for debugging)
 */
export function verifySDKAccess(): boolean {
  try {
    const sdkPath = getSDKPath()
    const cliPath = join(sdkPath, 'cli.js')
    const vendorPath = join(sdkPath, 'vendor')

    console.log('🔍 [SDK Verification] Checking SDK accessibility...')
    console.log(`   - App packaged: ${app.isPackaged}`)
    console.log(`   - SDK path exists: ${existsSync(sdkPath)}`)
    console.log(`   - CLI exists: ${existsSync(cliPath)}`)
    console.log(`   - Vendor exists: ${existsSync(vendorPath)}`)

    return existsSync(sdkPath) && existsSync(cliPath)
  } catch (error) {
    console.error('❌ [SDK Verification] Failed:', error)
    return false
  }
}

// ============================================================================
// Setup Authentication Provider
// ============================================================================
export async function setupAuthProvider(): Promise<string | null> {
  try {
    // Verify SDK accessibility in production
    if (app.isPackaged) {
      const sdkAccessible = verifySDKAccess()
      if (!sdkAccessible) {
        console.error('❌ [Auth] Claude SDK is not accessible in production!')
        console.error('   This usually means asarUnpack is not configured correctly.')
        return null
      }
    }

    const { getActiveProvider, getCredentials, importFromShellEnv } = await import(
      './credential-manager'
    )
    let activeProvider = await getActiveProvider()

    // ============================================================================
    // Auto-Import from Shell Environment if No Credentials Found
    // ============================================================================
    // LOGIC: If no provider is configured in keychain, automatically try to
    // import credentials from shell config files (~/.zshrc, ~/.bashrc, etc.)
    // This solves the issue where credentials exist in shell but production
    // app doesn't inherit them (unlike dev mode which runs from terminal)
    if (!activeProvider) {
      console.log('ℹ️  [Auth] No provider found in keychain, attempting auto-import from shell...')
      activeProvider = await importFromShellEnv()

      if (activeProvider) {
        console.log(`✅ [Auth] Auto-imported ${activeProvider} credentials from shell environment`)
      } else {
        console.log('⚠️ [Auth] No credentials found in shell environment either')
        return null
      }
    }

    if (activeProvider) {
      console.log(`🔑 [Provider] Setting environment for: ${activeProvider}`)
      const credentials = await getCredentials(activeProvider)

      // Clear any existing provider env vars first
      delete process.env.CLAUDE_CODE_USE_BEDROCK
      delete process.env.CLAUDE_CODE_USE_VERTEX

      if (credentials) {
        if (activeProvider === 'bedrock') {
          const bedrockCreds = credentials as any
          process.env.CLAUDE_CODE_USE_BEDROCK = '1'
          process.env.AWS_ACCESS_KEY_ID = bedrockCreds.accessKeyId
          process.env.AWS_SECRET_ACCESS_KEY = bedrockCreds.secretAccessKey
          if (bedrockCreds.sessionToken)
            process.env.AWS_SESSION_TOKEN = bedrockCreds.sessionToken
          if (bedrockCreds.region) process.env.AWS_REGION = bedrockCreds.region
          if (bedrockCreds.model)
            process.env.ANTHROPIC_MODEL = bedrockCreds.model
        } else if (activeProvider === 'vertex') {
          const vertexCreds = credentials as any
          process.env.CLAUDE_CODE_USE_VERTEX = '1'
          process.env.CLOUD_ML_REGION = vertexCreds.region || 'global'
          process.env.ANTHROPIC_VERTEX_PROJECT_ID = vertexCreds.projectId
          if (vertexCreds.model) process.env.ANTHROPIC_MODEL = vertexCreds.model
          if (vertexCreds.smallFastModel)
            process.env.ANTHROPIC_SMALL_FAST_MODEL = vertexCreds.smallFastModel
          if (vertexCreds.disablePromptCaching)
            process.env.DISABLE_PROMPT_CACHING = '1'
        } else if (activeProvider === 'anthropic') {
          const anthropicCreds = credentials as any
          if (anthropicCreds.apiKey)
            process.env.ANTHROPIC_API_KEY = anthropicCreds.apiKey
        }
      }

      // Log environment variables (redacted for security)
      console.log('🔍 [Auth] Environment variables set:')
      console.log(`   - CLAUDE_CODE_USE_BEDROCK: ${!!process.env.CLAUDE_CODE_USE_BEDROCK}`)
      console.log(`   - CLAUDE_CODE_USE_VERTEX: ${!!process.env.CLAUDE_CODE_USE_VERTEX}`)
      console.log(`   - ANTHROPIC_API_KEY: ${!!process.env.ANTHROPIC_API_KEY}`)
      console.log(`   - AWS_ACCESS_KEY_ID: ${!!process.env.AWS_ACCESS_KEY_ID}`)
    }
    return activeProvider
  } catch (error) {
    console.error('⚠️ [Provider] Failed to load credentials:', error)
    if (error instanceof Error) {
      console.error('⚠️ [Provider] Error stack:', error.stack)
    }
    return null
  }
}

// ============================================================================
// In-Memory Cache for Auto-Accept State
// ============================================================================
// LOGIC: Store auto-accept state per conversation in memory so it can be
// updated in real-time when user toggles during an active conversation.
// This avoids stale closure values and expensive disk reads.
const autoAcceptCache = new Map<string, boolean>()
const abortControllers = new Map<string, AbortController>()

// ============================================================================
// In-Memory Cache for Conversation State
// ============================================================================
// LOGIC: Store conversation state (running, waiting, completed, error) per
// conversation. Main process updates this automatically during SDK execution
// and broadcasts changes to renderer for real-time UI updates.
export interface ConversationState {
  promptId: string
  status:
    | 'idle'
    | 'running'
    | 'waiting_permission'
    | 'completed'
    | 'error'
    | 'aborted'
  sessionId?: string
  pendingPermission?: {
    requestId: string
    toolName: string
    toolInput: any
  }
  error?: string
  lastUpdated: number
}

const conversationStateCache = new Map<string, ConversationState>()

/**
 * Update the auto-accept state for a specific conversation
 * Called via IPC when user toggles the auto-accept switch
 */
export function updateAutoAcceptState(promptId: string, enabled: boolean) {
  autoAcceptCache.set(promptId, enabled)
  console.log(
    `✅ [AutoAccept Cache] Updated for conversation ${promptId}: ${enabled}`
  )
}

/**
 * Get the current auto-accept state for a conversation
 */
function getAutoAcceptState(
  promptId: string | undefined,
  fallback: boolean
): boolean {
  if (!promptId) return fallback
  return autoAcceptCache.get(promptId) ?? fallback
}

/**
 * Clear auto-accept state from cache when conversation completes
 */
function clearAutoAcceptState(promptId: string | undefined) {
  if (promptId) {
    autoAcceptCache.delete(promptId)
    console.log(`🧹 [AutoAccept Cache] Cleared for conversation ${promptId}`)
  }
}

// ============================================================================
// Conversation State Management Functions
// ============================================================================

/**
 * Update conversation state and broadcast to all renderer windows
 * Called automatically by main process during SDK execution
 */
export function updateConversationState(
  promptId: string,
  updates: Partial<ConversationState>,
  broadcast = true
) {
  const existing = conversationStateCache.get(promptId) || {
    promptId,
    status: 'idle' as const,
    lastUpdated: Date.now(),
  }

  const updated: ConversationState = {
    ...existing,
    ...updates,
    promptId, // Ensure promptId is always set
    lastUpdated: Date.now(),
  }

  conversationStateCache.set(promptId, updated)
  console.log(
    `📡 [State] Updated ${promptId}: ${updated.status}${updates.error ? ` (${updates.error})` : ''}`
  )

  // Broadcast to all renderer windows
  if (broadcast) {
    const { BrowserWindow } = require('electron')
    BrowserWindow.getAllWindows().forEach((win: BrowserWindow) => {
      win.webContents.send('conversation-state-changed', updated)
    })
  }
}

/**
 * Get conversation state for a specific prompt
 */
export function getConversationState(
  promptId: string
): ConversationState | undefined {
  return conversationStateCache.get(promptId)
}

/**
 * Get all conversation states
 */
export function getAllConversationStates(): ConversationState[] {
  return Array.from(conversationStateCache.values())
}

/**
 * Clear conversation state and notify renderer
 */
export function clearConversationState(promptId: string) {
  conversationStateCache.delete(promptId)
  console.log(`🧹 [State] Cleared conversation state for ${promptId}`)

  // Broadcast deletion
  const { BrowserWindow } = require('electron')
  BrowserWindow.getAllWindows().forEach((win: BrowserWindow) => {
    win.webContents.send('conversation-state-changed', {
      promptId,
      deleted: true,
    })
  })
}

// ============================================================================
// ClaudeSDKOptions Interface
// ============================================================================
// LOGIC: We need to pass additional context to the SDK execution function
// so it can identify which conversation is making the request and get
// information needed for the permission system
export interface ClaudeSDKOptions {
  prompt: string
  workingDirectory: string
  allowedTools?: string[]
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
  resume?: string // Session ID to resume
  abortController?: AbortController
  // New fields for permission system:
  promptId?: string // Which conversation is this (needed to route permissions)
  conversationTitle?: string // Display name for UI (first 50 chars of prompt)
  autoAcceptEnabled?: boolean // Whether auto-accept is enabled (bypass permissions)
}

export async function abortQuery(
  prompId: string,
  sender?: Electron.WebContents
) {
  const controller = abortControllers.get(prompId)
  console.log(`Received abort request for controller: ${controller}`)
  if (controller) {
    controller.abort()
    console.log(`Aborting query: ${prompId}`)

    // Send abort message as a tool call for rendering in conversation view
    if (sender) {
      sender.send(
        'command-output',
        JSON.stringify({
          type: 'tool_use',
          data: {
            type: 'tool_use',
            id: `abort_${Date.now()}`,
            name: 'Abort',
            input: {
              reason: 'User cancelled execution',
            },
          },
        })
      )
    }

    // Clean up abort controller
    abortControllers.delete(prompId)

    // Update conversation state to 'aborted'
    updateConversationState(prompId, 'aborted')
  } else {
    console.log(`Query ${prompId} not found`)
  }
}

export async function executeClaudeQuery(
  options: ClaudeSDKOptions,
  sender: BrowserWindow['webContents']
): Promise<void> {
  const {
    prompt,
    workingDirectory,
    allowedTools = ['Read', 'Glob', 'Grep'],
    permissionMode = 'default', // Changed from 'acceptEdits' to 'default' to use canUseTool
    resume,
    promptId,
    conversationTitle,
    autoAcceptEnabled = false,
    abortController = new AbortController(),
  } = options

  console.log('Starting Claude SDK query:', {
    prompt: prompt.substring(0, 50),
    workingDirectory,
    allowedTools,
    permissionMode,
    resume,
    promptId,
    autoAcceptEnabled,
    abortController,
  })

  // Log current PATH for debugging
  console.log(`🔍 [SDK Query] Current PATH: ${process.env.PATH}`)

  // ============================================================================
  // Set Provider Environment Variables
  // ============================================================================
  await setupAuthProvider()

  // ============================================================================
  // Initialize Auto-Accept Cache
  // ============================================================================
  // LOGIC: Store the initial auto-accept value in cache. This allows the value
  // to be updated mid-conversation via IPC without closure staleness issues.
  if (promptId) {
    autoAcceptCache.set(promptId, autoAcceptEnabled)
    abortControllers.set(promptId, abortController)

    console.log(
      `📝 [AutoAccept Cache] Initialized for ${promptId}: ${autoAcceptEnabled}`
    )
  }

  // ============================================================================
  // Initialize Conversation State
  // ============================================================================
  // LOGIC: Mark conversation as 'running' and broadcast to renderer
  if (promptId) {
    updateConversationState(promptId, {
      status: 'running',
      sessionId: resume,
    })
  }

  let messageCount = 0

  // ============================================================================
  // canUseTool Callback - Permission System Core
  // ============================================================================
  // LOGIC: This callback is invoked by the Claude SDK BEFORE executing any tool.
  // We intercept tool execution to ask the user for permission.
  //
  // Flow:
  // 1. If auto-accept is enabled → immediately return 'allow'
  // 2. If auto-accept is OFF → pause execution, send IPC to renderer asking for permission
  // 3. Wait for user to either Accept (allow) or type new prompt (deny)
  // 4. Return PermissionResult to SDK which continues or blocks the tool
  const canUseTool: CanUseTool = async (toolName, toolInput, { signal }) => {
    console.log(`🔒 [Permission] Tool "${toolName}" requesting permission`)

    // ============================================================================
    // ✅ FIX: Read from in-memory cache instead of stale closure
    // ============================================================================
    // LOGIC: Instead of using the captured `autoAcceptEnabled` value from closure
    // (which never changes during the conversation), we read from the cache which
    // gets updated in real-time when the user toggles the switch.
    const currentAutoAccept = getAutoAcceptState(promptId, autoAcceptEnabled)
    console.log(`   Auto-accept enabled (from cache): ${currentAutoAccept}`)

    // FAST PATH: If auto-accept is enabled, immediately allow without asking
    if (currentAutoAccept) {
      console.log(
        `✅ [Permission] Auto-accept enabled, allowing "${toolName}" immediately`
      )
      return { behavior: 'allow', updatedInput: toolInput }
    }

    // PERMISSION NEEDED: Auto-accept is OFF, we must ask the user
    // Generate unique request ID to track this specific permission request
    const requestId = `${promptId || 'unknown'}-${Date.now()}-${Math.random()}`

    console.log(
      `⏸️  [Permission] Pausing execution, requesting user approval for "${toolName}"`
    )
    console.log(`   Request ID: ${requestId}`)

    // Send permission request to renderer via IPC
    // The renderer will update the UI to show the pending tool and play notification sound
    sender.send('tool-permission-pending', {
      requestId,
      promptId: promptId || 'unknown',
      conversationTitle: conversationTitle || prompt.substring(0, 50),
      toolName,
      toolInput,
      timestamp: Date.now(),
    })

    // ✅ Update conversation state to 'waiting_permission'
    if (promptId) {
      updateConversationState(promptId, {
        status: 'waiting_permission',
        pendingPermission: {
          requestId,
          toolName,
          toolInput,
        },
      })
    }

    // ============================================================================
    // Wait for User Response (Accept or Cancel)
    // ============================================================================
    // LOGIC: We create a Promise that will be resolved when the user either:
    // 1. Clicks "Accept" button → resolve with 'allow'
    // 2. Types a new prompt → resolve with 'deny' + new prompt message
    // NOTE: No timeout - permission request waits indefinitely until user responds
    return new Promise<PermissionResult>((resolve, reject) => {
      // ============================================================================
      // Listen for Accept Response
      // ============================================================================
      // LOGIC: User clicked "Accept" button in the UI
      const acceptListener = (_event: any, data: { requestId: string }) => {
        if (data.requestId !== requestId) return // Not for this request, ignore

        cleanup()
        console.log(
          `✅ [Permission] User accepted "${toolName}" for request ${requestId}`
        )

        // ✅ Update conversation state back to 'running'
        if (promptId) {
          updateConversationState(promptId, {
            status: 'running',
            pendingPermission: undefined,
          })
        }

        // Allow the tool to execute
        resolve({ behavior: 'allow', updatedInput: toolInput })
      }

      // ============================================================================
      // Listen for Cancel Response (User Typed New Prompt)
      // ============================================================================
      // LOGIC: User typed a new prompt instead of accepting, meaning they want
      // to override Claude's decision and give different instructions
      const cancelListener = (
        _event: any,
        data: { requestId: string; newPrompt: string }
      ) => {
        if (data.requestId !== requestId) return // Not for this request, ignore

        cleanup()
        console.log(
          `❌ [Permission] User cancelled "${toolName}" with new prompt: "${data.newPrompt.substring(0, 50)}..."`
        )

        // Deny the tool and pass the new prompt as context to Claude
        resolve({
          behavior: 'deny',
          message: `User provided alternative instruction: "${data.newPrompt}"`,
        })
      }

      // ============================================================================
      // Cleanup Function
      // ============================================================================
      // LOGIC: Remove event listeners when we get a response
      const cleanup = () => {
        ipcMain.removeListener('tool-permission-accept', acceptListener)
        ipcMain.removeListener('tool-permission-cancel', cancelListener)
      }

      // Register IPC listeners
      ipcMain.on('tool-permission-accept', acceptListener)
      ipcMain.on('tool-permission-cancel', cancelListener)

      // Handle abort signal (if SDK is cancelled externally)
      signal.addEventListener('abort', () => {
        cleanup()
        reject(new Error('Permission request aborted'))
      })
    })
  }

  try {
    // Create the query with SDK
    // Override model to fix Claude Code bug with AWS Bedrock model identifier

    console.log('abortController from line 456:', abortController)

    // ============================================================================
    // Prepare Complete Environment for Spawned CLI Process
    // ============================================================================
    // CRITICAL FIX: When launched via double-click, macOS provides minimal environment
    // without HOME, USER, TMPDIR, etc. The AWS SDK REQUIRES these variables.
    //
    // We use Node.js APIs (os.homedir(), os.userInfo()) which work even when
    // environment variables aren't set, ensuring the CLI has everything it needs.
    const spawnEnv = {
      ...process.env,
      // HOME: Required by AWS SDK to find ~/.aws/credentials and ~/.aws/config
      HOME: process.env.HOME || homedir(),
      // USER: Used by AWS SDK for profile resolution and logging
      USER: process.env.USER || userInfo().username,
      // TMPDIR: Required for AWS SDK temporary credential caching
      TMPDIR: process.env.TMPDIR || tmpdir(),
      // LANG: Required for proper string encoding in AWS API calls
      LANG: process.env.LANG || 'en_US.UTF-8',
      // AWS_SDK_LOAD_CONFIG: Explicitly tell AWS SDK to load ~/.aws/config
      AWS_SDK_LOAD_CONFIG: '1',
    }

    console.log(`🔍 [SDK Query] Environment prepared for CLI spawn:`)
    console.log(`   HOME: ${spawnEnv.HOME}`)
    console.log(`   USER: ${spawnEnv.USER}`)
    console.log(`   TMPDIR: ${spawnEnv.TMPDIR}`)
    console.log(`   LANG: ${spawnEnv.LANG}`)
    console.log(`   AWS_SDK_LOAD_CONFIG: ${spawnEnv.AWS_SDK_LOAD_CONFIG}`)

    const result = query({
      prompt,
      options: {
        cwd: workingDirectory,
        allowedTools,
        permissionMode, // Now 'default' instead of 'acceptEdits'
        canUseTool, // ✨ ADD OUR CUSTOM PERMISSION CALLBACK
        resume, // Session resumption
        includePartialMessages: false,
        abortController, // CRITICAL: Enable streaming of partial messages
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
        },
        // ✨ CRITICAL FIX: Pass complete environment with all required variables
        env: spawnEnv,
      },
    })

    // Stream EVERY message IMMEDIATELY as it arrives from the SDK
    // This ensures real-time output to the user
    for await (const message of result) {
      messageCount++

      // Convert SDK message to JSON string (matching CLI output format)
      const jsonMessage = JSON.stringify(message)

      // IMMEDIATELY send to renderer - no buffering!
      // This sends each message as soon as it's received from the SDK
      sender.send('command-output', {
        type: 'stdout',
        data: `${jsonMessage}\n`, // Add newline to match CLI format
        rawData: false, // This is JSON, not ANSI
        promptId: promptId, // Identify which conversation this message belongs to
      })
    }

    console.log(
      `✅ Claude SDK query completed successfully (${messageCount} messages)`
    )

    // ============================================================================
    // Cleanup and Mark as Completed
    // ============================================================================
    // LOGIC: Remove caches and mark conversation as completed
    clearAutoAcceptState(promptId)

    if (promptId) {
      updateConversationState(promptId, { status: 'completed' })
      // Clear from cache after a short delay to allow UI to update
      setTimeout(() => clearConversationState(promptId), 1000)
    }
  } catch (error) {
    console.error('❌ Error during Claude SDK query:', error)
    console.error(`   Streamed ${messageCount} messages before error`)

    // Send error message to renderer so user sees it
    const errorMessage = error instanceof Error ? error.message : String(error)
    sender.send('command-output', {
      type: 'stderr',
      data: `${JSON.stringify({
        type: 'error',
        error: errorMessage,
        messageCount,
      })}\n`,
      rawData: false,
      promptId: promptId, // Identify which conversation this error belongs to
    })

    // If we got at least one message, the query partially succeeded
    // Don't throw if we got a result message (indicates completion)
    if (messageCount > 0 && errorMessage.includes('exited with code 1')) {
      console.log(
        '⚠️  Process exited with code 1, but messages were received. Treating as success.'
      )
      // Cleanup cache even on partial success
      clearAutoAcceptState(promptId)

      if (promptId) {
        updateConversationState(promptId, { status: 'completed' })
        setTimeout(() => clearConversationState(promptId), 1000)
      }
      return
    }

    // Cleanup cache and mark as error
    clearAutoAcceptState(promptId)

    if (promptId) {
      updateConversationState(promptId, {
        status: 'error',
        error: errorMessage,
      })
      setTimeout(() => clearConversationState(promptId), 3000)
    }

    throw error
  }
}
