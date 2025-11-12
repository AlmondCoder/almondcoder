/**
 * Conversation Executor
 *
 * This module orchestrates the execution of Claude SDK conversations, including:
 * - Worktree creation and management
 * - Conversation log file initialization
 * - Message handler registration
 * - Session state management
 *
 * It handles both new conversations and continuation of existing ones.
 */

import { v4 as uuidv4 } from 'uuid'
import type { ConversationHistory, EnhancedPromptHistoryItem } from '../../shared/types'
import { createMessageHandler, type MessageHandlerConfig, Response } from './conversationMessageHandler'
import { trackEvent } from './posthog'

export interface ProjectContext {
  projectPath: string
  selectedBranch: string
}

export interface ExecutionOptions {
  promptText: string
  projectContext: ProjectContext
  conversation: ConversationHistory
  isNewConversation: boolean
  selectedBranch?: string
  autoAcceptEnabled: boolean

  // Callbacks
  onMessage?: (messages: any[]) => void
  onSessionId?: (sessionId: string) => void
  onComplete?: (result: any) => void
  onTokenUsage?: (usage: { inputTokens: number; outputTokens: number; totalTokens: number }) => void
  isSelectedConversation: () => boolean
}

export interface ExecutionResult {
  success: boolean
  promptId: string
  conversationLogPath: string
  worktreePath: string
  error?: string
}

/**
 * Execute a Claude SDK conversation
 *
 * This function handles the complete lifecycle:
 * 1. Setup conversation context (worktree, log files, etc.)
 * 2. Register message handler for this conversation
 * 3. Execute Claude SDK
 * 4. Return execution result
 *
 * @param options Execution configuration
 * @returns Execution result with promptId and paths
 */
export async function executeConversation(
  options: ExecutionOptions
): Promise<ExecutionResult> {
  const {
    promptText,
    projectContext,
    conversation,
    isNewConversation,
    selectedBranch,
    autoAcceptEnabled,
  } = options

  console.log('🚀 [ConversationExecutor] Starting execution...')
  console.log('   New conversation:', isNewConversation)
  console.log('   Prompt:', promptText.substring(0, 50) + '...')

  // Track conversation start
  trackEvent(isNewConversation ? 'conversation_started' : 'conversation_continued', {
    prompt_length: promptText.length,
    branch: selectedBranch || 'unknown',
    auto_accept_enabled: autoAcceptEnabled,
    project_path: projectContext.projectPath,
  })

  try {
    // ============================================================================
    // Phase 1: Setup Conversation Context
    // ============================================================================
    const context = isNewConversation
      ? await setupNewConversation(projectContext, selectedBranch!, promptText)
      : await setupExistingConversation(projectContext, conversation, selectedBranch, promptText)

    console.log('✅ [ConversationExecutor] Context setup complete:', {
      promptId: context.promptId.substring(0, 8),
      worktreePath: context.worktreePath.split('/').pop(),
      logPath: context.conversationLogPath.split('/').pop(),
    })

    // ============================================================================
    // Phase 2: Create Message Handler
    // ============================================================================
    const handlerConfig: MessageHandlerConfig = {
      promptId: context.promptId,
      conversationLogPath: context.conversationLogPath,
      conversation: context.conversation,
      projectPath: projectContext.projectPath,
      onMessage: options.onMessage,
      onSessionId: options.onSessionId,
      onComplete: options.onComplete,
      onTokenUsage: options.onTokenUsage,
      isSelectedConversation: options.isSelectedConversation,
    }

    const messageHandler = createMessageHandler(handlerConfig)

    // ============================================================================
    // Phase 3: Execute Claude SDK
    // ============================================================================
    console.log('🤖 [ConversationExecutor] Executing Claude SDK...')

    await window.App.executeClaudeSDK(
      {
        prompt: promptText,
        workingDirectory: context.worktreePath,
        allowedTools: ['Read', 'Glob', 'Grep'],
        permissionMode: 'default',
        resume: context.sessionId,
        promptId: context.promptId,
        conversationTitle: promptText.substring(0, 200),
        autoAcceptEnabled,
      },
      messageHandler
    )

    console.log('✅ [ConversationExecutor] Execution completed successfully')

    // Track successful completion
    trackEvent('conversation_completed', {
      prompt_id: context.promptId,
      is_new: isNewConversation,
    })

    return {
      success: true,
      promptId: context.promptId,
      conversationLogPath: context.conversationLogPath,
      worktreePath: context.worktreePath,
    }

  } catch (error) {
    console.error('❌ [ConversationExecutor] Execution failed:', error)

    // Track execution error
    trackEvent('conversation_error', {
      prompt_id: conversation.promptId || 'unknown',
      error_message: error instanceof Error ? error.message : String(error),
      is_new: isNewConversation,
    })

    return {
      success: false,
      promptId: conversation.promptId || 'unknown',
      conversationLogPath: conversation.conversationLogPath || '',
      worktreePath: conversation.worktreePath || '',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Setup context for a new conversation
 */
async function setupNewConversation(
  projectContext: ProjectContext,
  selectedBranch: string,
  promptText: string
) {
  console.log('📝 [ConversationExecutor] Setting up new conversation...')

  // Ensure git repository is initialized
  const finalBranch = await ensureGitRepository(projectContext.projectPath, selectedBranch)

  // Generate unique ID
  const promptId = uuidv4()

  // Create conversation log path
  const projectName = projectContext.projectPath.split('/').pop() || 'unknown'
  const appDataPath = await window.App.getAppDataPath()
  const conversationLogPath = `${appDataPath}/${projectName}/prompts/conversations/${promptId}.json`

  // Write initial user message to log
  console.log('💬 [ConversationExecutor] Writing initial user message to log...')
  await writeUserMessage(conversationLogPath, promptText)

  // Create worktree
  console.log('🌳 [ConversationExecutor] Creating worktree...')
  const worktreeResult = await window.App.createWorktree(
    projectContext.projectPath,
    finalBranch,
    promptText,
    promptId,
    undefined
  )

  if (!worktreeResult.success) {
    throw new Error(worktreeResult.error || 'Failed to create worktree')
  }

  const worktreePath = worktreeResult.worktreeInfo.worktreePath
  const worktreeBranchName = worktreeResult.worktreeInfo.branchName

  // Create conversation object
  const conversation: ConversationHistory = {
    promptId,
    projectPath: projectContext.projectPath,
    worktreePath,
    aiSessionId: undefined,
    conversationLogPath,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  // Save to prompt history
  console.log('💾 [ConversationExecutor] Saving to prompt history...')
  await window.App.saveEnhancedPrompt({
    id: promptId,
    prompt: promptText,
    startExecutionTime: new Date(),
    branch: worktreeBranchName,
    branchStatus: 'active',
    promptHistoryId: promptId,
    status: 'busy',
    projectPath: projectContext.projectPath,
    worktreePath,
    autoAcceptEnabled: false, // Will be updated later
    createdAt: new Date(),
    updatedAt: new Date(),
  } as EnhancedPromptHistoryItem)

  return {
    promptId,
    conversationLogPath,
    worktreePath,
    conversation,
    sessionId: undefined,
  }
}

/**
 * Setup context for an existing conversation
 */
async function setupExistingConversation(
  projectContext: ProjectContext,
  conversation: ConversationHistory,
  selectedBranch: string | undefined,
  promptText: string
) {
  console.log('📂 [ConversationExecutor] Setting up existing conversation...')

  const promptId = conversation.promptId
  const conversationLogPath = conversation.conversationLogPath
  let worktreePath = conversation.worktreePath

  // Create worktree if missing
  if (!worktreePath) {
    console.log('🌳 [ConversationExecutor] Creating missing worktree...')
    const worktreeResult = await window.App.createWorktree(
      projectContext.projectPath,
      selectedBranch || projectContext.selectedBranch,
      promptText,
      promptId,
      undefined
    )

    if (!worktreeResult.success) {
      throw new Error(worktreeResult.error || 'Failed to create worktree')
    }

    worktreePath = worktreeResult.worktreeInfo.worktreePath
    conversation.worktreePath = worktreePath
  }

  // Load session ID from database
  const sessionId = await loadSessionId(projectContext.projectPath, promptId)

  return {
    promptId,
    conversationLogPath,
    worktreePath,
    conversation,
    sessionId,
  }
}

/**
 * Ensure git repository is initialized
 */
async function ensureGitRepository(
  projectPath: string,
  selectedBranch: string
): Promise<string> {
  console.log('🔍 [ConversationExecutor] Checking git repository...')

  const isGitRepo = await window.App.isGitRepository(projectPath)

  if (!isGitRepo) {
    console.log('📦 [ConversationExecutor] Initializing git repository...')
    await window.App.isGitRepository(projectPath) // This will init if not exists
  }

  const branches = await window.App.getGitBranches(projectPath)

  if (!branches || branches.length === 0) {
    console.log('🌿 [ConversationExecutor] Creating initial branch: main')
    return 'main'
  }

  const finalBranch = branches.includes(selectedBranch) ? selectedBranch : branches[0]
  console.log('✅ [ConversationExecutor] Using branch:', finalBranch)

  return finalBranch
}

/**
 * Write user message to conversation log
 */
async function writeUserMessage(
  conversationLogPath: string,
  promptText: string
): Promise<void> {
  const logEntry = {
    from: Response.user,
    timestamp: new Date().toISOString(),
    data: {
      content: { type: 'text', text: promptText },
    },
  }

  await window.App.appendToConversationLog(conversationLogPath, logEntry)
}

/**
 * Load session ID from database for conversation resumption
 */
async function loadSessionId(
  projectPath: string,
  promptId: string
): Promise<string | undefined> {
  try {
    const history = await window.App.getEnhancedPromptHistory(projectPath)
    const prompt = history.find((p: any) => p.id === promptId)

    if (prompt?.aiSessionId) {
      console.log('🔑 [ConversationExecutor] Loaded session ID from database:', prompt.aiSessionId.substring(0, 12) + '...')
      return prompt.aiSessionId
    }

    console.log('🆕 [ConversationExecutor] No existing session ID - will create new session')
    return undefined
  } catch (error) {
    console.error('❌ [ConversationExecutor] Failed to load session ID:', error)
    return undefined
  }
}
