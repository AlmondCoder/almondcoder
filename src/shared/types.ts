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
  content: any  // Can be string, object, array, etc.
  timestamp?: Date
}

export interface ConversationHistory {
  promptId: string
  projectPath: string
  worktreePath: string
  aiSessionId?: string
  conversationLogPath: string  // e.g., /Users/user/.almondcoder/test_git/prompts/conversations/1760095035344.json
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

export interface ProjectMetadata {
  projectName: string
  projectPath: string
  createdAt: Date
  lastUsed: Date
  totalPrompts: number
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
  requestId: string      // Unique identifier for this permission request
  toolName: string       // Name of the tool requesting permission (e.g., 'Write', 'Edit', 'Bash')
  toolInput: any         // The input parameters the tool will use
  timestamp: Date        // When the permission was requested
}

/**
 * Tool permission request sent from main process to renderer
 * Used via IPC to notify the UI that a tool needs permission
 */
export interface ToolPermissionRequest {
  requestId: string           // Unique identifier for this request
  promptId: string            // Which conversation is requesting permission
  conversationTitle: string   // Display name of the conversation (first 50 chars of prompt)
  toolName: string            // Name of the tool (e.g., 'Write', 'Bash')
  toolInput: any              // Tool parameters (e.g., file_path, command)
  timestamp: number           // Unix timestamp when request was made
}

/**
 * Response sent from renderer to main process when user accepts/cancels
 */
export interface ToolPermissionResponse {
  requestId: string      // Must match the request ID
  allowed: boolean       // true = accept, false = cancel
  newPrompt?: string     // If cancelling, the new prompt user typed
}
