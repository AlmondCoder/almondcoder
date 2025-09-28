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
  id: string
  content: string
  type: 'user' | 'system' | 'assistant'
  timestamp: Date
  isStreaming?: boolean
}

export interface ConversationHistory {
  promptId: string
  projectPath: string
  messages: ConversationMessage[]
  createdAt: Date
  updatedAt: Date
}

export interface EnhancedPromptHistoryItem {
  id: string
  prompt: string
  startExecutionTime: Date
  endExecutionTime: Date | null
  branch: string
  branchStatus: BranchStatus
  promptHistoryId: string
  status: PromptStatus
  projectPath: string
  createdAt: Date
  updatedAt: Date
}

export interface ProjectMetadata {
  projectName: string
  projectPath: string
  createdAt: Date
  lastUsed: Date
  totalPrompts: number
}
