import { useState, useEffect } from 'react'
import {
  MessageSquare,
  GitCompare,
  GitBranch,
  Plus,
  Grid3x3,
  Brain,
  Info
} from 'lucide-react'
import { useTheme, createThemeClasses } from '../../theme/ThemeContext'
import { AgentView } from './AgentView'
import { ConversationView } from './ConversationView'
import { DiffView } from './DiffView'
import { ProjectMemory } from './ProjectMemory'

import type {
  EnhancedPromptHistoryItem,
  ConversationHistory,
  PromptStatus,
  PromptAgent,
  BusyConversation,
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
  const { theme, themeName } = useTheme()
  const themeClasses = createThemeClasses(theme)
  const isLightTheme = themeName === 'light'

  const [promptHistory, setPromptHistory] = useState<
    EnhancedPromptHistoryItem[]
  >([])

  const newConversation = (): ConversationHistory => ({
    promptId: '+new',
    projectPath: '',
    worktreePath: '',
    aiSessionId: undefined,
    conversationLogPath: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  const [selectedConversation, setSelectedConversation] =
    useState<ConversationHistory>(newConversation())

  // Track multiple conversations executing simultaneously
  const [busyConversations, setBusyConversations] = useState<
    Map<string, BusyConversation>
  >(new Map())

  const [availableBranches, setAvailableBranches] = useState<string[]>([])

  // Helper function to load and process prompt history
  const loadAndProcessPromptHistory = async (projectPath: string) => {
    try {
      const history = await window.App.getEnhancedPromptHistory(projectPath)

      const nowEpoch = Date.now()
      const fiveMinutesInMs = 5 * 60 * 1000

      // Process history and mark old prompts
      const processedHistory = await Promise.all(
        history.map(async (item: any) => {
          const updatedAtEpoch = new Date(item.updatedAt).getTime()
          const timeSinceCompletion = nowEpoch - updatedAtEpoch

          // If prompt is completed and more than 5 minutes old, mark as 'old'
          if (item.status === 'completed' && timeSinceCompletion > fiveMinutesInMs) {
            // Update status in database
            try {
              await window.App.updateEnhancedPrompt({
                ...item,
                status: 'old',
                updatedAt: new Date(item.updatedAt), // Keep original completion time
              })
              return {
                ...item,
                status: 'old' as PromptStatus,
                startExecutionTime: new Date(item.startExecutionTime),
                createdAt: new Date(item.createdAt),
                updatedAt: new Date(item.updatedAt),
              }
            } catch (error) {
              console.error('Error updating prompt to old status:', error)
            }
          }

          return {
            ...item,
            startExecutionTime: new Date(item.startExecutionTime),
            createdAt: new Date(item.createdAt),
            updatedAt: new Date(item.updatedAt),
          }
        })
      )

      setPromptHistory(processedHistory)
    } catch (error) {
      console.error('Error loading enhanced prompt history:', error)
      setPromptHistory([])
    }
  }

  // Agent management state
  const [viewMode, setViewMode] = useState<'prompts' | 'agents' | 'memory'>('prompts')
  const [conversationViewMode, setConversationViewMode] = useState<
    'conversation' | 'diff'
  >('conversation')

  // Context usage tracking (mock data for now - will be replaced with actual values)
  const getContextUsage = (): {
    percentage: number
    usedTokens: number
    totalTokens: number
  } => {
    if (selectedConversation.promptId === '+new') {
      return { percentage: 0, usedTokens: 0, totalTokens: 200000 }
    }
    // Mock data - replace with actual token counting logic
    return { percentage: 45, usedTokens: 90000, totalTokens: 200000 }
  }

  const [agents, setAgents] = useState<PromptAgent[]>([
    {
      id: '1',
      name: 'Code Planner',
      systemPrompt:
        'Can you tell me 2-3 plans to implement this feautre, go through the code properly and try and reuse existing code instead of giving me new code. Be concise and direct with your plan and recommend me the best plan to implement.',
      tools: ['Read', 'Glob', 'Grep', 'Task'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '2',
      name: 'Expert Frontend Developer',
      systemPrompt:
        'You are an expert frontend developer with lot of experience, please ensure that that the brand colors #FFFFFF, #151312, #66645F, #B0B0AB, #D2D2D0, #DEDEDB, #000000 are being used for this feature. Ensure you reuse components whereever possible.',
      tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '3',
      name: 'Backend Architect',
      systemPrompt:
        'You are an expert backend architect which can devise a database design along with backend architechture using the right recommended tools.',
      tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '4',
      name: 'Bug Fix',
      systemPrompt:
        'I have a bug that needs fixing. Run the bash terminal with the command pnpm run dev and look at the logs to find the error mentioned. Find the source of the big and fix it.',
      tools: ['Read', 'Edit', 'Bash', 'Grep', 'Glob'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ])

  // Load enhanced prompt history when project changes
  useEffect(() => {
    if (projectContext?.projectPath) {
      loadAndProcessPromptHistory(projectContext.projectPath)
    } else {
      setPromptHistory([])
    }
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
        return 'bg-gray-500'
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
      promptHistory.filter(p => p.status === 'busy').map(p => p.branch)
    )
    return availableBranches.filter(branch => !busyBranches.has(branch))
  }

  // Get the first 15 characters of the first user prompt for display
  const getPromptPreview = (): string => {
    if (selectedConversation.promptId === '+new') {
      return 'New Prompt'
    }
    const selectedPrompt = promptHistory.find(
      p => p.id === selectedConversation.promptId
    )
    if (selectedPrompt && selectedPrompt.prompt) {
      return (
        selectedPrompt.prompt.substring(0, 15) +
        (selectedPrompt.prompt.length > 15 ? '...' : '')
      )
    }
    return 'Selected Prompt'
  }

  // Get the branch name for the selected conversation
  const getBranchName = (): string => {
    if (selectedConversation.promptId === '+new') {
      return projectContext?.selectedBranch || ''
    }
    const selectedPrompt = promptHistory.find(
      p => p.id === selectedConversation.promptId
    )
    return selectedPrompt?.branch || ''
  }

  return (
    <div
      className={`flex h-full ${themeClasses.bgPrimary} ${themeClasses.textPrimary}`}
    >
      {/* First Section - Prompt History (16.67% width) */}
      <div
        className={`w-1/6 border-r ${themeClasses.borderPrimary} p-4 overflow-y-auto`}
      >
        <div className="space-y-3">
          {/* Create new prompt Option */}
          <button
            className={`${
              isLightTheme
                ? viewMode === 'prompts' && selectedConversation.promptId === '+new'
                  ? 'bg-white border-gray-300'
                  : 'bg-gray-50 border-transparent hover:bg-white hover:border-gray-300'
                : viewMode === 'prompts' && selectedConversation.promptId === '+new'
                  ? themeClasses.bgInput +
                    ' border-2 ' +
                    themeClasses.borderFocus
                  : themeClasses.bgSecondary +
                    ' border-2 border-transparent hover:' +
                    themeClasses.bgInput
            } rounded-lg p-3 cursor-pointer border transition-all w-full text-left`}
            onClick={() => {
              console.log('Clicked Create new prompt')
              setViewMode('prompts')
              setSelectedConversation(newConversation())
            }}
          >
            <div className="flex items-center gap-2">
              <Plus
                className={`w-4 h-4 flex-shrink-0 ${viewMode === 'prompts' && selectedConversation.promptId === '+new' ? themeClasses.textSecondary : themeClasses.textTertiary}`}
              />
              <span
                className={`text-sm font-medium ${viewMode === 'prompts'  && selectedConversation.promptId === '+new' ? themeClasses.textSecondary : themeClasses.textTertiary}`}
              >
                Create new prompt
              </span>
            </div>
          </button>

          {/* Prompt Agents Button */}
          <button
            className={`${
              isLightTheme
                ? viewMode === 'agents'
                  ? 'bg-white border-gray-300'
                  : 'bg-gray-50 border-transparent hover:bg-white hover:border-gray-300'
                : viewMode === 'agents'
                  ? themeClasses.bgInput +
                    ' border-2 ' +
                    themeClasses.borderFocus
                  : themeClasses.bgSecondary +
                    ' border-2 border-transparent hover:' +
                    themeClasses.bgInput
            } rounded-lg p-3 cursor-pointer border transition-all w-full text-left`}
            onClick={() => {
              console.log('Clicked Prompt Agents')
              setViewMode('agents')
            }}
          >
            <div className="flex items-center gap-2">
              <Grid3x3
                className={`w-4 h-4 flex-shrink-0 ${viewMode === 'agents' ? themeClasses.textSecondary : themeClasses.textTertiary}`}
              />
              <span
                className={`text-sm font-medium ${viewMode === 'agents' ? themeClasses.textSecondary : themeClasses.textTertiary}`}
              >
                Prompt Agents
              </span>
            </div>
          </button>

          {/* Project Memory Button */}
          <button
            className={`${
              isLightTheme
                ? viewMode === 'memory'
                  ? 'bg-white border-gray-300'
                  : 'bg-gray-50 border-transparent hover:bg-white hover:border-gray-300'
                : viewMode === 'memory'
                  ? themeClasses.bgInput +
                    ' border-2 ' +
                    themeClasses.borderFocus
                  : themeClasses.bgSecondary +
                    ' border-2 border-transparent hover:' +
                    themeClasses.bgInput
            } rounded-lg p-3 cursor-pointer border transition-all w-full text-left`}
            onClick={() => {
              console.log('Clicked Project Memory')
              setViewMode('memory')
            }}
          >
          <div className="flex items-center gap-2">
              <Brain
                className={`w-4 h-4 flex-shrink-0 ${viewMode === 'memory' ? themeClasses.textSecondary : themeClasses.textTertiary}`}
              />
              <span
                className={`text-sm font-medium ${viewMode === 'memory' ? themeClasses.textSecondary : themeClasses.textTertiary}`}
              >
                Project Memory
              </span>
            </div>
          </button>
        </div>

        {/* Context Widget */}
        <div
          className={`mt-20 mb-4 ${isLightTheme ? 'bg-gray-100 border-gray-200' : themeClasses.bgSecondary + ' ' + themeClasses.borderPrimary} border rounded-lg p-3`}
        >
          {isLightTheme ? (
            <>
              <div className="flex items-center gap-2 text-[11px] text-gray-700 mb-3 leading-relaxed">
                <Info className="w-4 h-4 flex-shrink-0 text-gray-600" />
                <span>Working in XYZ branch, using model A with Claude Code.</span>
              </div>
              <div className="text-[10px] text-gray-600 mb-2">
                Context remaining
              </div>
              {/* Progress Bar */}
              <div className="flex items-center gap-[2px]">
                {Array.from({ length: 20 }).map((_, index) => {
                  const segmentPercentage = (index + 1) * 5
                  const isCompleted = segmentPercentage <= 70
                  return (
                    <div
                      className={`h-2 flex-1 ${isCompleted ? 'bg-gray-800' : 'bg-gray-300'}`}
                      key={index}
                    />
                  )
                })}
                <span className="text-[10px] text-gray-600 ml-2">70%</span>
              </div>
            </>
          ) : (
            <>
              <div className={`flex items-center gap-2 text-xs font-medium ${themeClasses.textPrimary} mb-2`}>
                <Info className={`w-4 h-4 flex-shrink-0 ${themeClasses.textSecondary}`} />
                <span>Context Usage</span>
              </div>
              <div className={`text-[10px] ${themeClasses.textSecondary} mb-2`}>
                You have used {getContextUsage().percentage}% of your context
                history
              </div>
              <div className={`text-[10px] ${themeClasses.textSecondary} mb-2`}>
                {getContextUsage().usedTokens.toLocaleString()} /{' '}
                {getContextUsage().totalTokens.toLocaleString()} tokens
              </div>
              {/* Progress Bar */}
              <div className="flex items-center gap-1">
                <span className={`text-[9px] ${themeClasses.textTertiary}`}>
                  0
                </span>
                <div className="flex-1 flex items-center gap-[1px]">
                  {Array.from({ length: 20 }).map((_, index) => {
                    const segmentPercentage = (index + 1) * 5
                    const isCompleted =
                      segmentPercentage <= getContextUsage().percentage
                    return (
                      <div
                        className={`h-2 flex-1 ${isCompleted ? 'bg-green-500' : 'bg-gray-600'}`}
                        key={index}
                      />
                    )
                  })}
                </div>
                <span className={`text-[9px] ${themeClasses.textTertiary}`}>
                  100
                </span>
              </div>
            </>
          )}
        </div>

        {/* Your Prompts Header */}
        <h3
          className={`text-md font-semibold mb-4 ${themeClasses.textPrimary}`}
        >
          Your Prompts
        </h3>

        {/* Existing Prompts */}
        <div className="space-y-3">
          {promptHistory.map(prompt => (
            <button
              className={`${selectedConversation.promptId === prompt.id && viewMode === 'prompts' ? themeClasses.bgInput : themeClasses.bgSecondary} rounded-lg p-3 cursor-pointer border-2 ${selectedConversation.promptId === prompt.id && viewMode === 'prompts' ? themeClasses.borderFocus : 'border-transparent'} hover:${themeClasses.bgInput} transition-colors w-full text-left`}
              key={prompt.id}
              onClick={() => {
                console.log('Selected prompt:', prompt.id)
                setViewMode('prompts')

                // Extract project name from projectPath (e.g., /Users/user/almondcoder/test_git -> test_git)
                const projectName =
                  prompt.projectPath.split('/').pop() || 'unknown'
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
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${getStatusColor(prompt.status)}`}
                />

                <div className="flex-1 min-w-0">
                  {/* Prompt Text - Truncated to 40 chars */}
                  <div
                    className={`text-sm font-medium ${themeClasses.textPrimary} truncate`}
                  >
                    {prompt.prompt.length > 40
                      ? `${prompt.prompt.substring(0, 40)}...`
                      : prompt.prompt}
                  </div>

                  {/* Branch Name - Small Font */}
                  <div
                    className={`flex items-center gap-1 text-xs ${themeClasses.textTertiary} mt-1`}
                  >
                    <GitBranch className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{prompt.branch}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Second Section - Content Area (83.33% width) */}
      <div className="w-5/6 p-6 flex flex-col h-full overflow-hidden">
        {/* Header with Prompt Preview, Branch, and Icon Menu */}
        <div
          className={`flex items-center justify-between mb-4 pb-3 border-b ${themeClasses.borderPrimary}`}
        >
          {/* Left side - Prompt preview and branch */}
          <div className="flex items-center gap-3">
            {viewMode === 'agents' ? (
              <h3
                className={`text-lg font-semibold ${themeClasses.textPrimary}`}
              >
                Prompt Agents
              </h3>
            ) : viewMode === 'memory' ? (
              <h3
                className={`text-lg font-semibold ${themeClasses.textPrimary}`}
              >
                Project Memory
              </h3>
            ) : (
              <>
                <h3
                  className={`text-lg font-semibold ${themeClasses.textPrimary}`}
                >
                  {getPromptPreview()}
                </h3>
                {getBranchName() && (
                  <div
                    className={`flex items-center gap-1 px-2 py-1 rounded ${themeClasses.bgSecondary} border ${themeClasses.borderPrimary}`}
                  >
                    <GitBranch className="w-3 h-3 text-green-400" />
                    <span className={`text-xs ${themeClasses.textSecondary}`}>
                      {getBranchName()}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right side - Simple toolbar (only show for prompts view) */}
          {viewMode === 'prompts' && (
            <div className={`flex items-center rounded-lg overflow-hidden border ${themeClasses.borderPrimary}`}>
              <button
                className={`px-4 py-1.5 text-sm transition-colors flex items-center gap-2 ${
                  conversationViewMode === 'conversation'
                    ? `${isLightTheme ? 'bg-gray-100 text-gray-900' : 'bg-gray-700 text-white'}`
                    : `${isLightTheme ? 'bg-white text-gray-600 hover:bg-gray-50' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`
                }`}
                onClick={() => setConversationViewMode('conversation')}
                title="Conversation View"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Chat</span>
              </button>
              <div className={`w-px h-6 ${themeClasses.borderPrimary} bg-gray-300 dark:bg-gray-600`} />
              <button
                className={`px-4 py-1.5 text-sm transition-colors flex items-center gap-2 ${
                  conversationViewMode === 'diff'
                    ? `${isLightTheme ? 'bg-gray-100 text-gray-900' : 'bg-gray-700 text-white'}`
                    : `${isLightTheme ? 'bg-white text-gray-600 hover:bg-gray-50' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`
                }`}
                onClick={() => setConversationViewMode('diff')}
                title="Code Difference View"
              >
                <GitCompare className="w-4 h-4" />
                <span>Diff</span>
              </button>
            </div>
          )}
        </div>

        {/* Agent Management View */}
        {viewMode === 'agents' && (
          <AgentView agents={agents} setAgents={setAgents} />
        )}

        {/* Project Memory View */}
        {viewMode === 'memory' && (
          <ProjectMemory projectPath={projectContext?.projectPath || ''} />
        )}

        {/* Prompt View - Only show when not in agents mode */}
        {viewMode === 'prompts' && conversationViewMode === 'conversation' && (
          <ConversationView
            availableBranches={availableBranches}
            busyConversations={busyConversations}
            getAvailableBranchesForNewPrompt={getAvailableBranchesForNewPrompt}
            isPromptBusy={isPromptBusy}
            newConversation={newConversation}
            projectContext={projectContext}
            promptHistory={promptHistory}
            selectedConversation={selectedConversation}
            setBusyConversations={setBusyConversations}
            setPromptHistory={setPromptHistory}
            setSelectedConversation={setSelectedConversation}
            loadAndProcessPromptHistory={loadAndProcessPromptHistory}
          />
        )}

        {/* Diff View - Show when diff mode is selected */}
        {viewMode === 'prompts' && conversationViewMode === 'diff' && (
          <DiffView
            projectPath={projectContext?.projectPath || ''}
            worktreePath={selectedConversation.worktreePath || ''}
          />
        )}
      </div>
    </div>
  )
}
