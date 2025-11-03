/**
 * Conversation Message Handler
 *
 * This module manages message routing and file operations for parallel conversations.
 * It ensures that messages from concurrent Claude SDK executions are properly isolated
 * and written to the correct conversation log files.
 *
 * Key Responsibilities:
 * - Route messages to the correct conversation based on promptId
 * - Write messages to conversation log files atomically
 * - Convert SDK messages to UI-friendly ChatMessage format
 * - Handle session state updates and persistence
 *
 * Race Condition Prevention:
 * - Uses explicit closure capture to ensure each handler has its own scope
 * - Validates promptId on every message to prevent cross-contamination
 * - Rejects messages without promptId to prevent broadcast to all handlers
 */

import type { ConversationHistory } from '../../shared/types'

export interface ChatMessage {
  id: string
  type: string
  text?: string
  timestamp: Date
  isUser?: boolean
  toolName?: string
  toolInput?: any
  toolUseId?: string
  toolResult?: any
  isError?: boolean
  sessionId?: string
  model?: string
  cwd?: string
  duration?: number
  cost?: number
  numTurns?: number
}

export enum Response {
  user = 'user',
  ai = 'ai',
  system = 'system',
}

export interface MessageHandlerConfig {
  promptId: string
  conversationLogPath: string
  conversation: ConversationHistory
  projectPath: string

  // Callbacks
  onMessage?: (messages: ChatMessage[]) => void
  onSessionId?: (sessionId: string) => void
  onComplete?: (result: any) => void
  onTokenUsage?: (usage: { inputTokens: number; outputTokens: number; totalTokens: number }) => void

  // State checks
  isSelectedConversation: () => boolean
}

/**
 * Write a message entry to the conversation log file
 */
async function writeConversationLog(
  filePath: string,
  content: any,
  from: Response
): Promise<void> {
  try {
    const logEntry = {
      from,
      timestamp: new Date().toISOString(),
      data: content,
    }

    await window.App.appendToConversationLog(filePath, logEntry)

    console.log(
      '✅ [ConversationLog] Written to file:',
      filePath.split('/').pop(),
      'from:',
      from
    )
  } catch (error) {
    console.error('❌ [ConversationLog] Write error:', error)
    throw error
  }
}

/**
 * Convert SDK message format to ChatMessage format for UI display
 */
export function convertSDKMessageToChat(sdkMessage: any): ChatMessage[] {
  const messages: ChatMessage[] = []
  const timestamp = new Date()

  switch (sdkMessage.type) {
    case 'system':
      if (sdkMessage.subtype === 'init') {
        messages.push({
          id: `init-${sdkMessage.session_id || Date.now()}`,
          type: 'init',
          timestamp,
          sessionId: sdkMessage.session_id,
          model: sdkMessage.model,
          cwd: sdkMessage.cwd,
        })
      }
      break

    case 'assistant':
      // Extract text and tool_use blocks
      sdkMessage.message.content.forEach((block: any, idx: number) => {
        if (block.type === 'text' && block.text) {
          messages.push({
            id: `text-${sdkMessage.message.id || Date.now()}-${idx}`,
            type: 'text',
            text: block.text,
            timestamp,
          })
        } else if (block.type === 'tool_use') {
          messages.push({
            id: `tool-use-${block.id}`,
            type: 'tool_use',
            toolName: block.name,
            toolInput: block.input,
            toolUseId: block.id,
            timestamp,
          })
        }
      })
      break

    case 'user':
      // Extract tool results
      sdkMessage.message.content.forEach((block: any, idx: number) => {
        if (block.type === 'tool_result') {
          messages.push({
            id: `tool-result-${block.tool_use_id}`,
            type: 'tool_result',
            toolResult: block.content,
            toolUseId: block.tool_use_id,
            isError: block.is_error || false,
            timestamp,
          })
        }
      })
      break

    case 'result':
      messages.push({
        id: `result-${sdkMessage.session_id || Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'result',
        duration: sdkMessage.duration_ms,
        cost: sdkMessage.total_cost_usd,
        numTurns: sdkMessage.num_turns,
        timestamp,
      })
      break
  }

  return messages
}

/**
 * Create a message handler for a specific conversation
 *
 * This handler is designed to work with multiple concurrent conversations:
 * - Each conversation gets its own handler instance
 * - All handlers listen to the same 'command-output' IPC channel
 * - Messages are filtered by promptId to prevent cross-contamination
 * - Explicit closure capture ensures each handler has isolated state
 *
 * @param config Configuration for this conversation's message handler
 * @returns Handler function to process incoming messages
 */
export function createMessageHandler(config: MessageHandlerConfig) {
  // ============================================================================
  // CRITICAL: Explicit Closure Capture
  // ============================================================================
  // Capture these values in local constants to ensure the closure has its own
  // isolated copy. This prevents issues where the outer scope variables might
  // change between handler creation and message arrival.
  const capturedPromptId = config.promptId
  const capturedConversationLogPath = config.conversationLogPath
  const capturedProjectPath = config.projectPath

  console.log('📡 [MessageHandler] Created for conversation:', {
    promptId: capturedPromptId,
    logPath: capturedConversationLogPath.split('/').pop(),
  })

  /**
   * Process a single message from the Claude SDK
   */
  return async function handleMessage(data: {
    type: string
    data: string
    promptId?: string
  }): Promise<void> {
    // ============================================================================
    // Message Filtering: Prevent Cross-Conversation Contamination
    // ============================================================================

    // CRITICAL CHECK 1: Reject messages without promptId
    // Messages without a promptId would be processed by ALL handlers, causing
    // them to be written to multiple conversation files
    if (!data.promptId) {
      console.warn(
        '⚠️  [MessageHandler] Rejecting message without promptId (would contaminate all conversations)'
      )
      return
    }

    // CRITICAL CHECK 2: Only process messages for THIS conversation
    // Each handler should only process messages that belong to its conversation
    if (data.promptId !== capturedPromptId) {
      console.log(
        `⏭️  [MessageHandler] Ignoring message for different conversation (received: ${data.promptId.substring(0, 8)}, expected: ${capturedPromptId.substring(0, 8)})`
      )
      return
    }

    console.log(`✅ [MessageHandler] Processing message for ${capturedPromptId.substring(0, 8)}`)

    try {
      // Parse the SDK message
      const sdkMessage = JSON.parse(data.data)

      console.log('📨 [MessageHandler] SDK message type:', sdkMessage.type)

      // ============================================================================
      // Step 1: Always write to conversation log file (for persistence)
      // ============================================================================
      // This happens for ALL conversations, even background ones, ensuring
      // messages are persisted even if the user switches away
      await writeConversationLog(
        capturedConversationLogPath,
        { content: sdkMessage },
        Response.ai
      )

      // ============================================================================
      // Step 2: Update UI if this is the currently selected conversation
      // ============================================================================
      if (config.isSelectedConversation()) {
        const chatMessages = convertSDKMessageToChat(sdkMessage)
        if (chatMessages.length > 0 && config.onMessage) {
          config.onMessage(chatMessages)
          console.log('🖥️  [MessageHandler] Updated UI with', chatMessages.length, 'messages')
        }
      } else {
        console.log('⏭️  [MessageHandler] Skipping UI update (conversation running in background)')
      }

      // ============================================================================
      // Step 3: Handle session ID (for conversation resumption)
      // ============================================================================
      if (sdkMessage.session_id && config.onSessionId) {
        console.log('🔑 [MessageHandler] Captured session ID:', sdkMessage.session_id.substring(0, 12) + '...')
        config.onSessionId(sdkMessage.session_id)

        // Persist to database
        await persistSessionId(capturedProjectPath, capturedPromptId, sdkMessage.session_id)
      }

      // ============================================================================
      // Step 4: Handle completion
      // ============================================================================
      if (sdkMessage.type === 'result') {
        console.log('🏁 [MessageHandler] Conversation completed')

        // Report token usage
        if (sdkMessage.usage && config.onTokenUsage) {
          const inputTokens = sdkMessage.usage.input_tokens || 0
          const outputTokens = sdkMessage.usage.output_tokens || 0
          const totalTokens = inputTokens + outputTokens

          config.onTokenUsage({ inputTokens, outputTokens, totalTokens })
          console.log(`📊 [MessageHandler] Token usage: ${inputTokens}/${outputTokens} (total: ${totalTokens})`)
        }

        // Mark as completed in database
        await markConversationCompleted(capturedProjectPath, capturedPromptId)

        if (config.onComplete) {
          config.onComplete(sdkMessage)
        }
      }

    } catch (error) {
      console.error('❌ [MessageHandler] Error processing message:', error)
      throw error
    }
  }
}

/**
 * Persist session ID to database for conversation resumption
 */
async function persistSessionId(
  projectPath: string,
  promptId: string,
  sessionId: string
): Promise<void> {
  try {
    const history = await window.App.getEnhancedPromptHistory(projectPath)
    const prompt = history.find((p: any) => p.id === promptId)

    if (prompt) {
      await window.App.updateEnhancedPrompt({
        ...prompt,
        startExecutionTime: new Date(prompt.startExecutionTime),
        createdAt: new Date(prompt.createdAt),
        updatedAt: new Date(),
        aiSessionId: sessionId,
      })
      console.log('✅ [MessageHandler] Persisted session ID to database')
    } else {
      console.warn('⚠️  [MessageHandler] Could not find prompt in database:', promptId.substring(0, 8))
    }
  } catch (error) {
    console.error('❌ [MessageHandler] Failed to persist session ID:', error)
  }
}

/**
 * Mark conversation as completed in database
 */
async function markConversationCompleted(
  projectPath: string,
  promptId: string
): Promise<void> {
  try {
    const history = await window.App.getEnhancedPromptHistory(projectPath)
    const prompt = history.find((p: any) => p.id === promptId)

    if (prompt) {
      await window.App.updateEnhancedPrompt({
        ...prompt,
        status: 'completed',
        updatedAt: new Date(),
      })
      console.log('✅ [MessageHandler] Marked conversation as completed')
    }
  } catch (error) {
    console.error('❌ [MessageHandler] Failed to mark as completed:', error)
  }
}
