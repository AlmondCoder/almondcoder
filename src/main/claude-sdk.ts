import { query, type CanUseTool, type PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'

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

  // New fields for permission system:
  promptId?: string            // Which conversation is this (needed to route permissions)
  conversationTitle?: string   // Display name for UI (first 50 chars of prompt)
  autoAcceptEnabled?: boolean  // Whether auto-accept is enabled (bypass permissions)
}

export async function executeClaudeQuery(
  options: ClaudeSDKOptions,
  sender: BrowserWindow['webContents']
): Promise<void> {
  const {
    prompt,
    workingDirectory,
    allowedTools = [ 'Read', 'Glob', 'Grep'],
    permissionMode = 'default',  // Changed from 'acceptEdits' to 'default' to use canUseTool
    resume,
    promptId,
    conversationTitle,
    autoAcceptEnabled = false,
  } = options

  console.log('Starting Claude SDK query:', {
    prompt: prompt.substring(0, 50),
    workingDirectory,
    allowedTools,
    permissionMode,
    resume,
    promptId,
    autoAcceptEnabled,
  })

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
    console.log(`   Auto-accept enabled: ${autoAcceptEnabled}`)

    // FAST PATH: If auto-accept is enabled, immediately allow without asking
    if (autoAcceptEnabled) {
      console.log(`✅ [Permission] Auto-accept enabled, allowing "${toolName}" immediately`)
      return { behavior: 'allow', updatedInput: toolInput }
    }

    // PERMISSION NEEDED: Auto-accept is OFF, we must ask the user
    // Generate unique request ID to track this specific permission request
    const requestId = `${promptId || 'unknown'}-${Date.now()}-${Math.random()}`

    console.log(`⏸️  [Permission] Pausing execution, requesting user approval for "${toolName}"`)
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

    // ============================================================================
    // Wait for User Response (Accept or Cancel)
    // ============================================================================
    // LOGIC: We create a Promise that will be resolved when the user either:
    // 1. Clicks "Accept" button → resolve with 'allow'
    // 2. Types a new prompt → resolve with 'deny' + new prompt message
    // 3. Timeout (30s) → resolve with 'deny' + timeout message
    return new Promise<PermissionResult>((resolve, reject) => {
      // Timeout: Auto-deny after 30 seconds to prevent hanging
      const timeout = setTimeout(() => {
        cleanup()
        console.log(`⏰ [Permission] Request ${requestId} timed out after 30 seconds`)

        // Notify renderer that this request timed out
        sender.send('tool-permission-timeout', { requestId })

        // Deny the tool execution
        resolve({
          behavior: 'deny',
          message: 'Permission request timed out (30 seconds). Please try again.',
        })
      }, 30000)  // 30 second timeout

      // ============================================================================
      // Listen for Accept Response
      // ============================================================================
      // LOGIC: User clicked "Accept" button in the UI
      const acceptListener = (_event: any, data: { requestId: string }) => {
        if (data.requestId !== requestId) return  // Not for this request, ignore

        cleanup()
        console.log(`✅ [Permission] User accepted "${toolName}" for request ${requestId}`)

        // Allow the tool to execute
        resolve({ behavior: 'allow', updatedInput: toolInput })
      }

      // ============================================================================
      // Listen for Cancel Response (User Typed New Prompt)
      // ============================================================================
      // LOGIC: User typed a new prompt instead of accepting, meaning they want
      // to override Claude's decision and give different instructions
      const cancelListener = (_event: any, data: { requestId: string; newPrompt: string }) => {
        if (data.requestId !== requestId) return  // Not for this request, ignore

        cleanup()
        console.log(`❌ [Permission] User cancelled "${toolName}" with new prompt: "${data.newPrompt.substring(0, 50)}..."`)

        // Deny the tool and pass the new prompt as context to Claude
        resolve({
          behavior: 'deny',
          message: `User provided alternative instruction: "${data.newPrompt}"`,
        })
      }

      // ============================================================================
      // Cleanup Function
      // ============================================================================
      // LOGIC: Remove event listeners and timeout when we get a response
      const cleanup = () => {
        clearTimeout(timeout)
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

  // ============================================================================
  // DEBUG: Verify canUseTool callback is defined
  // ============================================================================
  console.log('🔍 [DEBUG] Verifying canUseTool callback:')
  console.log(`   - Type: ${typeof canUseTool}`)
  console.log(`   - Is function: ${typeof canUseTool === 'function'}`)
  console.log(`   - permissionMode: ${permissionMode}`)
  console.log(`   - autoAcceptEnabled: ${autoAcceptEnabled}`)

  try {
    // Create the query with SDK
    // Override model to fix Claude Code bug with AWS Bedrock model identifier
    const result = query({
      prompt,
      options: {
        cwd: workingDirectory,
        allowedTools,
        permissionMode,  // Now 'default' instead of 'acceptEdits'
        canUseTool,      // ✨ ADD OUR CUSTOM PERMISSION CALLBACK
        resume,          // Session resumption
        includePartialMessages: false, // CRITICAL: Enable streaming of partial messages
        model: 'global.anthropic.claude-sonnet-4-5-20250929-v1:0', // Override to fix bug

        // CRITICAL: Load project settings to respect working directory and CLAUDE.md
        settingSources: ['project'],

        // CRITICAL: Use Claude Code system prompt to support CLAUDE.md files
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
        },
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
        data: jsonMessage + '\n', // Add newline to match CLI format
        rawData: false, // This is JSON, not ANSI
      })

      // Log full message content for debugging
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(`📤 SDK Message #${messageCount}: ${message.type}`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(JSON.stringify(message, null, 2))
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    }

    console.log(`✅ Claude SDK query completed successfully (${messageCount} messages)`)
  } catch (error) {
    console.error('❌ Error during Claude SDK query:', error)
    console.error(`   Streamed ${messageCount} messages before error`)

    // Send error message to renderer so user sees it
    const errorMessage = error instanceof Error ? error.message : String(error)
    sender.send('command-output', {
      type: 'stderr',
      data: JSON.stringify({
        type: 'error',
        error: errorMessage,
        messageCount,
      }) + '\n',
      rawData: false,
    })

    // If we got at least one message, the query partially succeeded
    // Don't throw if we got a result message (indicates completion)
    if (messageCount > 0 && errorMessage.includes('exited with code 1')) {
      console.log('⚠️  Process exited with code 1, but messages were received. Treating as success.')
      return
    }

    throw error
  }
}
