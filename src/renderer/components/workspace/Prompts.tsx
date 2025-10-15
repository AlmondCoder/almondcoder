import { useState, useEffect } from 'react'
import { MessageSquare, GitCompare, GitBranch } from 'lucide-react'
import { useTheme, createThemeClasses } from '../../theme/ThemeContext'
import { AgentView } from './AgentView'
import { ConversationView } from './ConversationView'

import type {
  EnhancedPromptHistoryItem,
  ConversationHistory,
  PromptStatus,
  PromptAgent,
} from '../../../shared/types'

interface ProjectContext {
  projectPath: string
  selectedTool: string
  selectedBranch: string
}

interface PromptsProps {
  projectContext?: ProjectContext
}

export function Prompts({ projectContext }: PromptsProps) {
  const { theme } = useTheme()
  const themeClasses = createThemeClasses(theme)

  const [promptHistory, setPromptHistory] = useState<
    EnhancedPromptHistoryItem[]
  >([])

  const newConversation = (): ConversationHistory => ({
    promptId: "+new",
    projectPath: "",
    worktreePath: "",
    aiSessionId: undefined,
    conversationLogPath: "",
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  const [selectedConversation, setSelectedConversation] = useState<ConversationHistory>(newConversation())

  // Track multiple conversations executing simultaneously
  const [busyConversations, setBusyConversations] = useState<Map<string, {
    conversation: ConversationHistory
    status: 'running' | 'completed' | 'error'
    sessionId?: string
    error?: string
  }>>(new Map())

  const [availableBranches, setAvailableBranches] = useState<string[]>([])

  // Agent management state
  const [viewMode, setViewMode] = useState<'prompts' | 'agents'>('prompts')
  const [conversationViewMode, setConversationViewMode] = useState<'conversation' | 'diff'>('conversation')

  // Context usage tracking (mock data for now - will be replaced with actual values)
  const getContextUsage = (): { percentage: number; usedTokens: number; totalTokens: number } => {
    if (selectedConversation.promptId === '+new') {
      return { percentage: 0, usedTokens: 0, totalTokens: 200000 }
    }
    // Mock data - replace with actual token counting logic
    return { percentage: 45, usedTokens: 90000, totalTokens: 200000 }
  }

  const [agents, setAgents] = useState<PromptAgent[]>([
    {
      id: '1',
      name: 'Code Assistant',
      systemPrompt: 'You are an expert code assistant. Help users write clean, efficient code.',
      tools: ['Read', 'Write', 'Edit', 'Bash'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '2',
      name: 'Bug Fixer',
      systemPrompt: 'You are a debugging expert. Help users identify and fix bugs in their code.',
      tools: ['Read', 'Grep', 'Bash', 'Edit'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ])

  // Load enhanced prompt history when project changes
  useEffect(() => {
    const loadPromptHistory = async () => {
      if (projectContext?.projectPath) {
        try {
          const history = await window.App.getEnhancedPromptHistory(
            projectContext.projectPath
          )
          setPromptHistory(
            history.map((item: any) => ({
              ...item,
              startExecutionTime: new Date(item.startExecutionTime),
              createdAt: new Date(item.createdAt),
              updatedAt: new Date(item.updatedAt),
            }))
          )
        } catch (error) {
          console.error('Error loading enhanced prompt history:', error)
          setPromptHistory([])
        }
      } else {
        setPromptHistory([])
      }
    }

    loadPromptHistory()
  }, [projectContext?.projectPath])

  // Load available branches when project context changes
  useEffect(() => {
    const loadBranches = async () => {
      if (projectContext?.projectPath) {
        try {
          const branches = await window.App.getGitBranches(
            projectContext.projectPath
          )
          setAvailableBranches(branches)
        } catch (error) {
          console.error('Error loading branches:', error)
          setAvailableBranches([])
        }
      } else {
        setAvailableBranches([])
      }
    }

    loadBranches()
  }, [projectContext?.projectPath, projectContext?.selectedBranch])

  const getStatusColor = (status: PromptStatus) => {
    switch (status) {
      case 'busy':
        return 'bg-red-500'
      case 'completed':
        return 'bg-green-500'
      case 'old':
        return 'bg-green-500'
    }
  }

  const isPromptBusy = (promptId: string | null): boolean => {
    if (!promptId || promptId === '+new') return false
    const prompt = promptHistory.find(p => p.id === promptId)
    return prompt?.status === 'busy'
  }

  const getAvailableBranchesForNewPrompt = (): string[] => {
    // Filter out branches that have any prompt with status 'busy'
    const busyBranches = new Set(
      promptHistory
        .filter(p => p.status === 'busy')
        .map(p => p.branch)
    )
    return availableBranches.filter(branch => !busyBranches.has(branch))
  }

  // Get the first 15 characters of the first user prompt for display
  const getPromptPreview = (): string => {
    if (selectedConversation.promptId === '+new') {
      return 'New Prompt'
    }
    const selectedPrompt = promptHistory.find(p => p.id === selectedConversation.promptId)
    if (selectedPrompt && selectedPrompt.prompt) {
      return selectedPrompt.prompt.substring(0, 15) + (selectedPrompt.prompt.length > 15 ? '...' : '')
    }
    return 'Selected Prompt'
  }

  // Get the branch name for the selected conversation
  const getBranchName = (): string => {
    if (selectedConversation.promptId === '+new') {
      return projectContext?.selectedBranch || ''
    }
    const selectedPrompt = promptHistory.find(p => p.id === selectedConversation.promptId)
    return selectedPrompt?.branch || ''
  }

  return (
    <div
      className={`flex h-full ${themeClasses.bgPrimary} ${themeClasses.textPrimary}`}
    >
      {/* First Section - Prompt History (20% width) */}
      <div
        className={`w-1/5 border-r ${themeClasses.borderPrimary} p-4 overflow-y-auto`}
      >
        <div className="space-y-3">
          {/* +New Prompt Option */}
          <button
            className={`${selectedConversation.promptId === '+new' && viewMode === 'prompts' ? themeClasses.bgInput : themeClasses.bgSecondary} rounded-lg p-3 cursor-pointer border-2 ${selectedConversation.promptId === '+new' && viewMode === 'prompts' ? themeClasses.borderFocus : 'border-transparent'} hover:${themeClasses.bgInput} transition-colors w-full text-left`}
            onClick={() => {
              console.log('Clicked +New Prompt')
              setViewMode('prompts')
              setSelectedConversation(newConversation())
            }}
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
              <span
                className={`text-sm font-medium ${themeClasses.textPrimary}`}
              >
                + New Prompt
              </span>
            </div>
          </button>

          {/* Prompt Agents Button */}
          <button
            className={`${viewMode === 'agents' ? themeClasses.bgInput : themeClasses.bgSecondary} rounded-lg p-3 cursor-pointer border-2 ${viewMode === 'agents' ? themeClasses.borderFocus : 'border-transparent'} hover:${themeClasses.bgInput} transition-colors w-full text-left`}
            onClick={() => {
              console.log('Clicked Prompt Agents')
              setViewMode('agents')
            }}
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />
              <span
                className={`text-sm font-medium ${themeClasses.textPrimary}`}
              >
                🤖 Prompt Agents
              </span>
            </div>
          </button>
        </div>

        {/* Context Usage Card */}
        <div className={`mt-4 mb-4 ${themeClasses.bgSecondary} border ${themeClasses.borderPrimary} rounded-lg p-3`}>
          <div className={`text-xs font-medium ${themeClasses.textPrimary} mb-2`}>
            Context Usage
          </div>
          <div className={`text-[10px] ${themeClasses.textSecondary} mb-2`}>
            You have used {getContextUsage().percentage}% of your context history
          </div>
          <div className={`text-[10px] ${themeClasses.textSecondary} mb-2`}>
            {getContextUsage().usedTokens.toLocaleString()} / {getContextUsage().totalTokens.toLocaleString()} tokens
          </div>
          {/* Progress Bar */}
          <div className="flex items-center gap-1">
            <span className={`text-[9px] ${themeClasses.textTertiary}`}>0</span>
            <div className="flex-1 flex items-center gap-[1px]">
              {Array.from({ length: 20 }).map((_, index) => {
                const segmentPercentage = (index + 1) * 5
                const isCompleted = segmentPercentage <= getContextUsage().percentage
                return (
                  <div
                    key={index}
                    className={`h-2 flex-1 ${isCompleted ? 'bg-green-500' : 'bg-gray-600'}`}
                  />
                )
              })}
            </div>
            <span className={`text-[9px] ${themeClasses.textTertiary}`}>100</span>
          </div>
        </div>

        {/* Prompt History Header */}
        <h3
          className={`text-md font-semibold mb-4 ${themeClasses.textPrimary}`}
        >
          Prompt History
        </h3>

        {/* Existing Prompts */}
        <div className="space-y-3">
          {promptHistory.map(prompt => (
            <button
              key={prompt.id}
              className={`${selectedConversation.promptId === prompt.id && viewMode === 'prompts' ? themeClasses.bgInput : themeClasses.bgSecondary} rounded-lg p-3 cursor-pointer border-2 ${selectedConversation.promptId === prompt.id && viewMode === 'prompts' ? themeClasses.borderFocus : 'border-transparent'} hover:${themeClasses.bgInput} transition-colors w-full text-left`}
              onClick={() => {
                console.log('Selected prompt:', prompt.id)
                setViewMode('prompts')

                // Extract project name from projectPath (e.g., /Users/user/almondcoder/test_git -> test_git)
                const projectName = prompt.projectPath.split('/').pop() || 'unknown'
                const conversationLogPath = `/Users/user/.almondcoder/${projectName}/prompts/conversations/${prompt.id}.json`

                setSelectedConversation({
                  promptId: prompt.id,
                  projectPath: prompt.projectPath,
                  worktreePath: prompt.worktreePath || '',
                  aiSessionId: undefined,
                  conversationLogPath,
                  createdAt: new Date(prompt.createdAt),
                  updatedAt: new Date(prompt.updatedAt),
                })
              }}
            >
              <div className="flex items-start gap-2">
                {/* Status Indicator */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${getStatusColor(prompt.status)}`} />

                <div className="flex-1 min-w-0">
                  {/* Prompt Text - Truncated to 40 chars */}
                  <div className={`text-sm font-medium ${themeClasses.textPrimary} truncate`}>
                    {prompt.prompt.length > 40
                      ? `${prompt.prompt.substring(0, 40)}...`
                      : prompt.prompt}
                  </div>

                  {/* Branch Name - Small Font */}
                  <div className={`text-xs ${themeClasses.textTertiary} mt-1 truncate`}>
                    🌿 {prompt.branch}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Second Section - Content Area (80% width) */}
      <div className="w-4/5 p-6 flex flex-col overflow-y-auto">
        {/* Header with Prompt Preview, Branch, and Icon Menu */}
        <div className={`flex items-center justify-between mb-4 pb-3 border-b ${themeClasses.borderPrimary}`}>
          {/* Left side - Prompt preview and branch */}
          <div className="flex items-center gap-3">
            {viewMode === 'agents' ? (
              <h3 className={`text-lg font-semibold ${themeClasses.textPrimary}`}>
                Prompt Agents
              </h3>
            ) : (
              <>
                <h3 className={`text-lg font-semibold ${themeClasses.textPrimary}`}>
                  {getPromptPreview()}
                </h3>
                {getBranchName() && (
                  <div className={`flex items-center gap-1 px-2 py-1 rounded ${themeClasses.bgSecondary} border ${themeClasses.borderPrimary}`}>
                    <GitBranch className="w-3 h-3 text-green-400" />
                    <span className={`text-xs ${themeClasses.textSecondary}`}>
                      {getBranchName()}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right side - Icon menu (only show for prompts view) */}
          {viewMode === 'prompts' && (
            <div className="flex items-center gap-2">
              <button
                className={`p-2 rounded-lg transition-colors ${
                  conversationViewMode === 'conversation'
                    ? `${themeClasses.bgTertiary} ${themeClasses.textAccent}`
                    : `${themeClasses.bgSecondary} ${themeClasses.textSecondary} hover:${themeClasses.bgTertiary}`
                }`}
                onClick={() => setConversationViewMode('conversation')}
                title="Conversation View"
              >
                <MessageSquare className="w-5 h-5" />
              </button>
              <button
                className={`p-2 rounded-lg transition-colors ${
                  conversationViewMode === 'diff'
                    ? `${themeClasses.bgTertiary} ${themeClasses.textAccent}`
                    : `${themeClasses.bgSecondary} ${themeClasses.textSecondary} hover:${themeClasses.bgTertiary}`
                }`}
                onClick={() => setConversationViewMode('diff')}
                title="Code Difference View"
              >
                <GitCompare className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Agent Management View */}
        {viewMode === 'agents' && (
          <AgentView agents={agents} setAgents={setAgents} />
        )}

        {/* Prompt View - Only show when not in agents mode */}
        {viewMode === 'prompts' && (
          <ConversationView
            projectContext={projectContext}
            selectedConversation={selectedConversation}
            setSelectedConversation={setSelectedConversation}
            availableBranches={availableBranches}
            getAvailableBranchesForNewPrompt={getAvailableBranchesForNewPrompt}
            isPromptBusy={isPromptBusy}
            newConversation={newConversation}
            busyConversations={busyConversations}
            setBusyConversations={setBusyConversations}
            promptHistory={promptHistory}
            setPromptHistory={setPromptHistory}
          />
        )}
      </div>
    </div>
  )
}
