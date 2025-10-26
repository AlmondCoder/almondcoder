import { contextBridge, ipcRenderer } from 'electron'
import type {
  EnhancedPromptHistoryItem,
  ConversationHistory,
  ConversationMessage,
  ToolPermissionRequest,
  ToolPermissionResponse,
  ProjectSettings,
} from '../shared/types'

declare global {
  interface Window {
    App: typeof API
  }
}

const API = {
  sayHelloFromBridge: () => console.log('\nHello from bridgeAPI! 👋\n\n'),
  username: process.env.USER,
  setWindowTitle: (title: string) =>
    ipcRenderer.invoke('set-window-title', title),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  getAppDataPath: () => ipcRenderer.invoke('get-app-data-path'),
  addRecentProject: (project: { name: string; path: string }) =>
    ipcRenderer.invoke('add-recent-project', project),
  isGitRepository: (path: string) =>
    ipcRenderer.invoke('is-git-repository', path),
  getGitBranches: (path: string) =>
    ipcRenderer.invoke('get-git-branches', path),
  getGitDiff: (path: string) => ipcRenderer.invoke('get-git-diff', path),
  getGitBranchGraph: (path: string) =>
    ipcRenderer.invoke('get-git-branch-graph', path),
  checkMergeConflicts: (params: {
    path: string
    sourceBranch: string
    targetBranch: string
  }) => ipcRenderer.invoke('check-merge-conflicts', params),
  performMerge: (params: {
    path: string
    sourceBranch: string
    targetBranch: string
    resolutions?: any[]
  }) => ipcRenderer.invoke('perform-merge', params),
  cloneRepository: (repoUrl: string) =>
    ipcRenderer.invoke('clone-repository', repoUrl),
  executeCommand: (command: string, workingDirectory?: string) =>
    ipcRenderer.invoke('execute-command', command, workingDirectory),
  // Enhanced prompt tracking methods
  getEnhancedPromptHistory: (projectPath: string) =>
    ipcRenderer.invoke('get-enhanced-prompt-history', projectPath),
  saveEnhancedPrompt: (promptData: EnhancedPromptHistoryItem) =>
    ipcRenderer.invoke('save-enhanced-prompt', promptData),
  updateEnhancedPrompt: (promptData: EnhancedPromptHistoryItem) =>
    ipcRenderer.invoke('update-enhanced-prompt', promptData),
  readConversationLog: (filePath: string) =>
    ipcRenderer.invoke('read-conversation-log', filePath),
  appendToConversationLog: (filePath: string, logEntry: any) =>
    ipcRenderer.invoke('append-to-conversation-log', filePath, logEntry),
  getCurrentBranchStatus: (projectPath: string, branchName: string) =>
    ipcRenderer.invoke('get-current-branch-status', projectPath, branchName),
  // Project Memory methods - Read/write CLAUDE.md
  readProjectMemory: (projectPath: string) =>
    ipcRenderer.invoke('read-project-memory', projectPath),
  saveProjectMemory: (projectPath: string, content: string) =>
    ipcRenderer.invoke('save-project-memory', projectPath, content),
  // Project Settings methods - General settings management
  getProjectSettings: (projectPath: string) =>
    ipcRenderer.invoke('get-project-settings', projectPath),
  saveProjectSettings: (projectPath: string, settings: ProjectSettings) =>
    ipcRenderer.invoke('save-project-settings', projectPath, settings),
  // Worktree methods
  createWorktree: (
    projectPath: string,
    branch: string,
    promptText: string,
    promptId: string,
    undefined: undefined
  ) =>
    ipcRenderer.invoke(
      'create-worktree',
      projectPath,
      branch,
      promptText,
      promptId
    ),
  cleanupWorktree: (worktreePath: string) =>
    ipcRenderer.invoke('cleanup-worktree', worktreePath),
  validateWorktree: (worktreePath: string) =>
    ipcRenderer.invoke('validate-worktree', worktreePath),
  checkFileExists: (filePath: string) =>
    ipcRenderer.invoke('check-file-exists', filePath),
  getProjectWorktrees: (projectPath: string) =>
    ipcRenderer.invoke('get-project-worktrees', projectPath),
  getWorktreeBranches: (projectPath: string) =>
    ipcRenderer.invoke('get-worktree-branches', projectPath),
  performWorktreeMerge: (params: {
    projectPath: string
    sourceBranch: string
    targetBranch: string
  }) => ipcRenderer.invoke('perform-worktree-merge', params),
  completeWorktreeMerge: (params: {
    projectPath: string
    sourceBranch: string
    worktreePath: string
    resolutions: Array<{ file: string; content: string }>
    hasStashedMainRepo: boolean
  }) => ipcRenderer.invoke('complete-worktree-merge', params),
  abortWorktreeMerge: (params: {
    projectPath: string
    hasStashedMainRepo: boolean
  }) => ipcRenderer.invoke('abort-worktree-merge', params),
  discardWorktreeChanges: (params: {
    projectPath: string
    sourceBranch: string
  }) => ipcRenderer.invoke('discard-worktree-changes', params),
  openTerminalAtPath: (path: string) =>
    ipcRenderer.invoke('open-terminal-at-path', path),
  // ============================================================================
  // Claude SDK method - streams JSON messages in real-time
  // ============================================================================
  // LOGIC: Updated to include permission system parameters (promptId, conversationTitle, autoAcceptEnabled)
  executeClaudeSDK: (
    options: {
      prompt: string
      workingDirectory: string
      allowedTools?: string[]
      permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
      resume?: string
      // Permission system fields:
      promptId?: string
      conversationTitle?: string
      autoAcceptEnabled?: boolean
    },
    onOutput?: (data: { type: string; data: string }) => void
  ) => {
    if (onOutput) {
      const handler = (_event: any, data: { type: string; data: string }) => {
        console.log('🔌 [Preload] Received IPC message:', {
          type: data.type,
          dataLength: data.data?.length,
        })
        onOutput(data)
      }
      ipcRenderer.on('command-output', handler)

      return ipcRenderer.invoke('execute-claude-sdk', options).finally(() => {
        console.log('🔌 [Preload] Removing IPC listener')
        ipcRenderer.removeListener('command-output', handler)
      })
    }
    return ipcRenderer.invoke('execute-claude-sdk', options)
  },

  // ============================================================================
  // Permission System IPC Methods
  // ============================================================================
  // These methods handle the tool permission request/response flow between
  // the main process (canUseTool callback) and the renderer (UI)

  /**
   * Listen for tool permission requests from main process
   * LOGIC: Main process sends 'tool-permission-pending' when Claude wants to use a tool
   * and auto-accept is OFF. The renderer should update UI to show pending permission.
   */
  onToolPermissionPending: (
    callback: (request: ToolPermissionRequest) => void
  ) => {
    const handler = (_event: any, request: ToolPermissionRequest) => {
      callback(request)
    }
    ipcRenderer.on('tool-permission-pending', handler)
    return handler // Return handler so it can be removed later
  },

  /**
   * Remove permission event listeners
   * LOGIC: Cleanup when component unmounts
   */
  removeToolPermissionListeners: () => {
    ipcRenderer.removeAllListeners('tool-permission-pending')
  },

  /**
   * Send acceptance to main process
   * LOGIC: User clicked "Accept" button, tell main process to allow the tool
   */
  acceptToolPermission: (data: { requestId: string }) => {
    console.log('🔌 [Preload] Sending tool-permission-accept:', data.requestId)
    ipcRenderer.send('tool-permission-accept', data)
  },

  /**
   * Send cancellation to main process
   * LOGIC: User typed a new prompt instead of accepting, tell main process to deny
   * the tool and pass the new prompt as context
   */
  cancelToolPermission: (data: { requestId: string; newPrompt: string }) => {
    console.log('🔌 [Preload] Sending tool-permission-cancel:', data.requestId)
    ipcRenderer.send('tool-permission-cancel', data)
  },

  /**
   * Update auto-accept state for a conversation
   * LOGIC: When user toggles the auto-accept switch, immediately notify main process
   * to update the in-memory cache so canUseTool uses the fresh value
   */
  updateAutoAcceptState: (data: { promptId: string; enabled: boolean }) => {
    console.log(
      '🔌 [Preload] Sending update-auto-accept-state:',
      data.promptId,
      '=',
      data.enabled
    )
    ipcRenderer.send('update-auto-accept-state', data)
  },

  // ============================================================================
  // Conversation State Management API
  // ============================================================================
  // Minimal IPC API: GET ALL + UPDATE ONE + LISTEN for broadcasts

  /**
   * Get all conversation states (called once on mount)
   */
  getAllConversationStates: () => {
    return ipcRenderer.invoke('get-all-conversation-states')
  },

  /**
   * Update conversation state (renderer-triggered, e.g., Accept button)
   */
  updateConversationState: (data: { promptId: string; updates: any }) => {
    console.log(
      '🔌 [Preload] Sending update-conversation-state:',
      data.promptId,
      data.updates
    )
    ipcRenderer.send('update-conversation-state', data)
  },

  /**
   * Listen for conversation state changes from main process
   * LOGIC: Main process broadcasts state updates, renderer listens and updates UI
   * Returns cleanup function to remove listener
   */
  onConversationStateChanged: (callback: (state: any) => void) => {
    const handler = (_event: any, state: any) => {
      callback(state)
    }
    ipcRenderer.on('conversation-state-changed', handler)

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('conversation-state-changed', handler)
    }
  },
}

contextBridge.exposeInMainWorld('App', API)
