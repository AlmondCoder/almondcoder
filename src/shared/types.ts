import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'

import type { registerRoute } from 'lib/electron-router-dom'

export type BrowserWindowOrNull = Electron.BrowserWindow | null

type Route = Parameters<typeof registerRoute>[0]

export interface WindowProps extends Electron.BrowserWindowConstructorOptions {
  id: Route['id']
  query?: Route['query']
}

export interface WindowCreationByIPC {
  channel: string
  window(): BrowserWindowOrNull
  callback(window: BrowserWindow, event: IpcMainInvokeEvent): void
}

// Enhanced Prompt Tracking Types
export type PromptStatus = 'busy' | 'completed' | 'old'
export type BranchStatus = 'active' | 'deleted'

export interface ConversationMessage {
  type: 'user' | 'ai'
  content: any // Can be string, object, array, etc.
  timestamp?: Date
}

export interface ConversationHistory {
  messages?: any
  promptId: string
  projectPath: string
  worktreePath: string
  aiSessionId?: string
  conversationLogPath: string // e.g., /Users/user/.almondcoder/test_git/prompts/conversations/1760095035344.json
  createdAt: Date
  updatedAt: Date
}

export interface EnhancedPromptHistoryItem {
  id: string
  prompt: string
  startExecutionTime: Date
  branch: string
  branchStatus: BranchStatus
  promptHistoryId: string
  status: PromptStatus
  projectPath: string
  worktreePath?: string
  aiSessionId?: string
  autoAcceptEnabled?: boolean // Persists auto-accept toggle state (default: false)
  isExecuting?: boolean
  createdAt: Date
  updatedAt: Date
}

export interface WorktreeInfo {
  worktreePath: string
  promptId: string
  projectName: string
  sanitizedPromptName: string
  shortUuid: string
  branchName: string
}

export interface ProjectSettings {
  theme?: {
    name: string // 'dark' | 'light' | 'midnight' | 'ocean'
    fontPreferences?: {
      size: string // 'xs' | 'sm' | 'base' | 'lg' | 'xl' | 'xxl'
      family: string // 'inter' | 'system' | 'mono' | 'serif'
    }
  }
  // Add other settings here in the future (e.g., editor preferences, terminal settings, etc.)
}

export interface ProjectMetadata {
  projectName: string
  projectPath: string
  createdAt: Date
  lastUsed: Date
  totalPrompts: number
  settings?: ProjectSettings
}

export interface PromptAgent {
  id: string
  name: string
  systemPrompt: string
  tools: string[]
  createdAt: Date
  updatedAt: Date
}

// ============================================================================
// Permission System Types
// ============================================================================
// These types support the tool permission system where Claude requests
// permission before executing tools like Write, Edit, Bash, etc.

/**
 * Represents a pending tool permission request
 * This is stored in BusyConversation when a conversation is waiting for user approval
 */
export interface PendingPermission {
  requestId: string // Unique identifier for this permission request
  toolName: string // Name of the tool requesting permission (e.g., 'Write', 'Edit', 'Bash')
  toolInput: any // The input parameters the tool will use
  timestamp: Date // When the permission was requested
}

/**
 * Tracks the execution state of conversations running in parallel
 * Used to manage multiple concurrent AI conversations and their permission states
 */
export interface BusyConversation {
  conversation: ConversationHistory

  // Status can be:
  // - 'running': Claude is actively processing (no permission needed)
  // - 'waiting_permission': Paused, waiting for user to Accept or override with new prompt
  // - 'completed': Conversation finished successfully
  // - 'error': Conversation encountered an error
  status: 'running' | 'waiting_permission' | 'completed' | 'error'

  sessionId?: string // Claude SDK session ID for resumption
  error?: string // Error message if status is 'error'

  // When status is 'waiting_permission', this contains details about what tool
  // is waiting for approval. This allows the UI to show exactly what Claude wants to do.
  pendingPermission?: PendingPermission
}

/**
 * Tool permission request sent from main process to renderer
 * Used via IPC to notify the UI that a tool needs permission
 */
export interface ToolPermissionRequest {
  requestId: string // Unique identifier for this request
  promptId: string // Which conversation is requesting permission
  conversationTitle: string // Display name of the conversation (first 50 chars of prompt)
  toolName: string // Name of the tool (e.g., 'Write', 'Bash')
  toolInput: any // Tool parameters (e.g., file_path, command)
  timestamp: number // Unix timestamp when request was made
}

/**
 * Response sent from renderer to main process when user accepts/cancels
 */
export interface ToolPermissionResponse {
  requestId: string // Must match the request ID
  allowed: boolean // true = accept, false = cancel
  newPrompt?: string // If cancelling, the new prompt user typed
}

// ============================================================================
// Todo System Types
// ============================================================================
// These types support the TodoWrite tool that tracks task progress in conversations

export type TodoStatus = 'pending' | 'in_progress' | 'completed'

/**
 * Represents a single todo item in a conversation
 */
export interface TodoItem {
  content: string // The task description (imperative form, e.g., "Run tests")
  activeForm: string // Present continuous form (e.g., "Running tests")
  status: TodoStatus // Current status of the task
}

/**
 * Represents the complete todo list from a TodoWrite tool call
 */
export interface TodoList {
  todos: TodoItem[]
}

// ============================================================================
// Authentication Provider Types
// ============================================================================
// These types support multi-provider authentication (Anthropic, AWS Bedrock, Google Vertex)

export type AuthProvider = 'anthropic' | 'bedrock' | 'vertex'

export interface AnthropicCredentials {
  apiKey: string
}

export interface BedrockCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  region?: string
  model?: string
}

export interface VertexCredentials {
  projectId: string
  region: string
  model?: string
  smallFastModel?: string
  disablePromptCaching?: boolean
}

export type ProviderCredentials =
  | AnthropicCredentials
  | BedrockCredentials
  | VertexCredentials

export interface AuthenticationCheckResult {
  authenticated: boolean
  error?: string
  errorType?: 'auth' | 'model' | 'network' | 'unknown'
  suggestedProvider?: AuthProvider
  currentProvider?: AuthProvider
}
