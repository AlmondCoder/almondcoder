import { contextBridge, ipcRenderer } from 'electron'
import type {
  EnhancedPromptHistoryItem,
  ConversationHistory,
  ConversationMessage,
} from '../shared/types'

declare global {
  interface Window {
    App: typeof API
  }
}

const API = {
  sayHelloFromBridge: () => console.log('\nHello from bridgeAPI! 👋\n\n'),
  username: process.env.USER,
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  addRecentProject: (project: { name: string; path: string }) =>
    ipcRenderer.invoke('add-recent-project', project),
  isGitRepository: (path: string) =>
    ipcRenderer.invoke('is-git-repository', path),
  getGitBranches: (path: string) =>
    ipcRenderer.invoke('get-git-branches', path),
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
  executeCommandStream: (
    command: string,
    onOutput?: (data: { type: string; data: string }) => void,
    workingDirectory?: string
  ) => {
    if (onOutput) {
      const handler = (_event: any, data: { type: string; data: string }) =>
        onOutput(data)
      ipcRenderer.on('command-output', handler)

      return ipcRenderer
        .invoke('execute-command-stream', command, workingDirectory)
        .finally(() => {
          ipcRenderer.removeListener('command-output', handler)
        })
    }
    return ipcRenderer.invoke(
      'execute-command-stream',
      command,
      workingDirectory
    )
  },
  getProjectFiles: (projectPath: string) =>
    ipcRenderer.invoke('get-project-files', projectPath),
  checkClaudeInstallation: () =>
    ipcRenderer.invoke('check-claude-installation'),
  installClaude: () => ipcRenderer.invoke('install-claude'),
  setupClaudePath: () => ipcRenderer.invoke('setup-claude-path'),
  // Enhanced prompt tracking methods
  getEnhancedPromptHistory: (projectPath: string) =>
    ipcRenderer.invoke('get-enhanced-prompt-history', projectPath),
  saveEnhancedPrompt: (promptData: EnhancedPromptHistoryItem) =>
    ipcRenderer.invoke('save-enhanced-prompt', promptData),
  updateEnhancedPrompt: (promptData: EnhancedPromptHistoryItem) =>
    ipcRenderer.invoke('update-enhanced-prompt', promptData),
  getConversationHistory: (projectPath: string, promptId: string) =>
    ipcRenderer.invoke('get-conversation-history', projectPath, promptId),
  saveConversationHistory: (conversationData: ConversationHistory) =>
    ipcRenderer.invoke('save-conversation-history', conversationData),
  addConversationMessage: (
    projectPath: string,
    promptId: string,
    message: ConversationMessage
  ) =>
    ipcRenderer.invoke(
      'add-conversation-message',
      projectPath,
      promptId,
      message
    ),
  getCurrentBranchStatus: (projectPath: string, branchName: string) =>
    ipcRenderer.invoke('get-current-branch-status', projectPath, branchName),
  captureAiSessionId: (projectPath: string, aiTool: string) =>
    ipcRenderer.invoke('capture-ai-session-id', projectPath, aiTool),
  // Worktree methods
  createWorktree: (
    projectPath: string,
    branch: string,
    promptText: string,
    promptId: string
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
  cleanupConversationWorktrees: (projectPath: string) =>
    ipcRenderer.invoke('cleanup-conversation-worktrees', projectPath),
  // Legacy methods for backward compatibility
  getProjectPromptHistory: (projectPath: string) =>
    ipcRenderer.invoke('get-project-prompt-history', projectPath),
  saveProjectPromptHistory: (projectPath: string, prompts: any[]) =>
    ipcRenderer.invoke('save-project-prompt-history', projectPath, prompts),
}

contextBridge.exposeInMainWorld('App', API)
