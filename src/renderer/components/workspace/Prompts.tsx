import { useState, useEffect } from 'react'
import {
  MessageSquare,
  GitCompare,
  GitBranch,
  Plus,
  Grid3x3,
  Brain,
  Info,
  Terminal,
  Keyboard,
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

  // Track token usage per conversation
  const [conversationTokenUsage, setConversationTokenUsage] = useState<
    Map<string, { inputTokens: number; outputTokens: number; model?: string }>
  >(new Map())

  const [availableBranches, setAvailableBranches] = useState<string[]>([])

  // Load all conversation states from main process on mount
  useEffect(() => {
    const loadConversationStates = async () => {
      try {
        const states = await window.App.getAllConversationStates()
        const statesMap = new Map<string, BusyConversation>()

        states.forEach((state: any) => {
          statesMap.set(state.promptId, {
            conversation: { promptId: state.promptId } as any,
            status: state.status,
            sessionId: state.sessionId,
            pendingPermission: state.pendingPermission,
            error: state.error,
          })
        })

        setBusyConversations(statesMap)
        console.log(`📥 Loaded ${states.length} conversation states from cache`)
      } catch (error) {
        console.error('❌ Failed to load conversation states:', error)
      }
    }

    loadConversationStates()
  }, [])

  // Listen for real-time conversation state updates from main process
  useEffect(() => {
    const unsubscribe = window.App.onConversationStateChanged((state: any) => {
      console.log(
        `🔔 State changed: ${state.promptId} → ${state.deleted ? 'deleted' : state.status}`
      )

      if (state.deleted) {
        // Remove from map
        setBusyConversations(prev => {
          const newMap = new Map(prev)
          newMap.delete(state.promptId)
          return newMap
        })
      } else {
        // Update or add to map
        setBusyConversations(prev => {
          const newMap = new Map(prev)
          const existing = newMap.get(state.promptId)

          newMap.set(state.promptId, {
            conversation:
              existing?.conversation || ({ promptId: state.promptId } as any),
            status: state.status,
            sessionId: state.sessionId,
            pendingPermission: state.pendingPermission,
            error: state.error,
          })

          return newMap
        })
      }
    })

    return () => unsubscribe()
  }, [])

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
          if (
            item.status === 'completed' &&
            timeSinceCompletion > fiveMinutesInMs
          ) {
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
  const [viewMode, setViewMode] = useState<'prompts' | 'agents' | 'memory'>(
    'prompts'
  )
  const [conversationViewMode, setConversationViewMode] = useState<
    'conversation' | 'diff'
  >('conversation')
  const [triggerNewAgent, setTriggerNewAgent] = useState(false)

  // Context usage tracking - real calculation from conversation token data
  const getContextUsage = (): {
    percentage: number
    usedTokens: number
    totalTokens: number
  } => {
    if (selectedConversation.promptId === '+new') {
      return { percentage: 0, usedTokens: 0, totalTokens: 200000 }
    }

    // Get token usage for selected conversation
    const usage = conversationTokenUsage.get(selectedConversation.promptId)
    if (!usage) {
      return { percentage: 0, usedTokens: 0, totalTokens: 200000 }
    }

    const totalTokens = usage.inputTokens + usage.outputTokens
    const percentage = Math.round((totalTokens / 200000) * 100)

    return {
      percentage,
      usedTokens: totalTokens,
      totalTokens: 200000,
    }
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
      name: 'Brand Mantainer',
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

  // Load agents from file on mount
  useEffect(() => {
    const loadAgents = async () => {
      try {
        const loadedAgents = await window.App.getPromptAgents()
        if (loadedAgents.length > 0) {
          setAgents(loadedAgents)
        }
        // If no agents exist, keep the hardcoded defaults as initial seed
      } catch (error) {
        console.error('Error loading agents:', error)
      }
    }
    loadAgents()
  }, [])

  // Save agents whenever they change
  useEffect(() => {
    const saveAgents = async () => {
      try {
        await window.App.savePromptAgents(agents)
      } catch (error) {
        console.error('Error saving agents:', error)
      }
    }
    // Only save if agents array is not empty (avoid saving empty array on first render)
    if (agents.length > 0) {
      saveAgents()
    }
  }, [agents])

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

  // Get conversation state color and label
  const getConversationStatusColor = (
    status: 'idle' | 'running' | 'waiting_permission' | 'completed' | 'error'
  ) => {
    const colors = {
      running: {
        bg: 'bg-blue-500',
        label: 'Running',
        icon: '🔵',
      },
      waiting_permission: {
        bg: 'bg-yellow-500',
        label: 'Waiting',
        icon: '🟡',
      },
      completed: {
        bg: 'bg-green-500',
        label: 'Done',
        icon: '🟢',
      },
      error: {
        bg: 'bg-red-500',
        label: 'Error',
        icon: '🔴',
      },
      idle: {
        bg: 'bg-gray-500',
        label: 'Idle',
        icon: '⚪',
      },
    }
    return colors[status] || colors.idle
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
        selectedPrompt.prompt.substring(0, 80) +
        (selectedPrompt.prompt.length > 80 ? '...' : '')
      )
    }
    return 'Selected Prompt'
  }

  // Get the branch name for the selected conversation
  const getBranchName = (): string => {
    if (selectedConversation.promptId === '+new') {
      return '' // Don't show branch in top bar for new conversations
    }
    const selectedPrompt = promptHistory.find(
      p => p.id === selectedConversation.promptId
    )
    return selectedPrompt?.branch || ''
  }

  // Get branch name for context widget
  const getBranchForWidget = (): string => {
    if (selectedConversation.promptId === '+new') {
      return 'No branch selected'
    }
    const selectedPrompt = promptHistory.find(
      p => p.id === selectedConversation.promptId
    )
    return selectedPrompt?.branch || 'Unknown branch'
  }

  // Get model name for context widget
  const getModelForWidget = (): string => {
    if (selectedConversation.promptId === '+new') {
      return 'No model'
    }
    const usage = conversationTokenUsage.get(selectedConversation.promptId)
    if (usage?.model) {
      // Extract short model name from full identifier
      // e.g., "global.anthropic.claude-sonnet-4-5-20250929-v1:0" -> "Claude Sonnet 4.5"
      const modelStr = usage.model
      if (modelStr.includes('claude-sonnet-4-5')) {
        return 'Claude Sonnet 4.5'
      }
      if (modelStr.includes('claude-sonnet')) {
        return 'Claude Sonnet'
      }
      if (modelStr.includes('claude')) {
        return 'Claude'
      }
      return modelStr
    }
    return 'Claude Code'
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
                ? viewMode === 'prompts' &&
                  selectedConversation.promptId === '+new'
                  ? 'bg-white border-gray-300'
                  : 'bg-gray-50 border-transparent hover:bg-white hover:border-gray-300'
                : viewMode === 'prompts' &&
                    selectedConversation.promptId === '+new'
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
                className={`text-sm font-medium ${viewMode === 'prompts' && selectedConversation.promptId === '+new' ? themeClasses.textSecondary : themeClasses.textTertiary}`}
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
          className={`mt-20 mb-4 ${isLightTheme ? 'bg-gray-100 border-gray-200' : `${themeClasses.bgSecondary} ${themeClasses.borderPrimary}`} border rounded-lg p-3`}
        >
          {isLightTheme ? (
            <>
              <div className="flex items-center gap-2 text-[11px] text-gray-700 mb-3 leading-relaxed">
                <Info className="w-4 h-4 flex-shrink-0 text-gray-600" />
                <span>
                  Working in {getBranchForWidget()}, using {getModelForWidget()}{' '}
                  with Claude Code.
                </span>
              </div>
              <div className="text-[10px] text-gray-600 mb-2">Tokens used</div>
              {/* Progress Bar */}
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-gray-600">0K</span>
                <div className="flex-1 flex items-center gap-[1px]">
                  {Array.from({ length: 20 }).map((_, index) => {
                    const segmentPercentage = (index + 1) * 5
                    const isCompleted =
                      segmentPercentage <= getContextUsage().percentage
                    return (
                      <div
                        className={`h-2 flex-1 ${isCompleted ? 'bg-gray-800' : 'bg-gray-300'}`}
                        key={index}
                      />
                    )
                  })}
                </div>
                <span className="text-[9px] text-gray-600 ml-1">
                  {Math.round(getContextUsage().usedTokens / 1000)}K
                </span>
              </div>
            </>
          ) : (
            <>
              <div
                className={`flex items-center gap-2 text-xs font-medium ${themeClasses.textPrimary} mb-2`}
              >
                <Info
                  className={`w-4 h-4 flex-shrink-0 ${themeClasses.textSecondary}`}
                />
                <span>Context Usage</span>
              </div>
              <div className={`text-[10px] ${themeClasses.textSecondary} mb-2`}>
                {getContextUsage().usedTokens.toLocaleString()} /{' '}
                {getContextUsage().totalTokens.toLocaleString()} tokens
              </div>
              {/* Progress Bar */}
              <div className="flex items-center gap-1">
                <span className={`text-[9px] ${themeClasses.textTertiary}`}>
                  0K
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
                  {Math.round(getContextUsage().usedTokens / 1000)}K
                </span>
              </div>
            </>
          )}
        </div>

        {/* Your Prompts Header */}
        <h3
          className={`text-md font-semibold mb-4 ${themeClasses.textPrimary}`}
        >
          Your Git WorkTrees
        </h3>

        {/* Existing Prompts */}
        <div className="space-y-3">
          {promptHistory.map(prompt => {
            const isActive =
              selectedConversation.promptId === prompt.id &&
              viewMode === 'prompts'

            return (
              <button
                className={`relative rounded-lg p-3 cursor-pointer border-2 w-full text-left transition-all duration-200 ${
                  isActive
                    ? themeClasses.bgInput + ' ' + themeClasses.borderFocus
                    : themeClasses.bgSecondary +
                      ' border-transparent hover:' +
                      themeClasses.bgInput
                }`}
                key={prompt.id}
                onClick={async () => {
                  console.log('Selected prompt:', prompt.id)
                  setViewMode('prompts')

                  // Extract project name from projectPath (e.g., /Users/user/almondcoder/test_git -> test_git)
                  const projectName =
                    prompt.projectPath.split('/').pop() || 'unknown'
                  const appDataPath = await window.App.getAppDataPath()
                  const conversationLogPath = `${appDataPath}/${projectName}/prompts/conversations/${prompt.id}.json`

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
                style={{
                  borderLeftWidth: isActive ? '4px' : '2px',
                  borderLeftColor: isActive ? theme.status.info : 'transparent',
                }}
              >
                <div className="flex items-start gap-2">
                  {/* Enhanced Status Indicator with conversation state overlay */}
                  <div className="relative flex-shrink-0 mt-1">
                    {/* Base status dot from database */}
                    <div
                      className={`w-2 h-2 rounded-full ${getStatusColor(prompt.status)}`}
                    />

                    {/* Overlay active conversation state if running */}
                    {busyConversations.get(prompt.id) &&
                      (() => {
                        const busyConv = busyConversations.get(prompt.id)
                        if (!busyConv) return null
                        return (
                          <div
                            className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 ${
                              isLightTheme ? 'border-white' : 'border-gray-900'
                            } ${getConversationStatusColor(busyConv.status).bg} animate-pulse`}
                            title={
                              getConversationStatusColor(busyConv.status).label
                            }
                          />
                        )
                      })()}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Prompt Text - Truncated to 60 chars */}
                    <div
                      className={`text-sm font-medium ${themeClasses.textPrimary} truncate`}
                    >
                      {prompt.prompt.length > 60
                        ? `${prompt.prompt.substring(0, 60)}...`
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
            )
          })}
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
                Hello?
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
                    <GitBranch className="w-3 h-3" />
                    <span className={`text-xs ${themeClasses.textSecondary}`}>
                      {getBranchName()}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right side - Simple toolbar */}
          {viewMode === 'agents' ? (
            <button
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isLightTheme
                  ? 'bg-black text-white hover:bg-gray-800'
                  : 'bg-white text-black hover:bg-gray-200'
              }`}
              onClick={() => {
                setTriggerNewAgent(true)
                setTimeout(() => setTriggerNewAgent(false), 100)
              }}
            >
              <Plus className="w-4 h-4" />
              New Agent
            </button>
          ) : viewMode === 'prompts' ? (
            <div className="flex items-center gap-[10px]">
              {/* Terminal and Keyboard group */}
              <div
                className={`flex items-center rounded-lg overflow-hidden border ${themeClasses.borderPrimary}`}
              >
                <button
                  className="p-2 text-sm transition-colors flex items-center justify-center"
                  disabled={!selectedConversation.worktreePath}
                  onClick={async () => {
                    if (selectedConversation.worktreePath) {
                      const result = await window.App.openTerminalAtPath(
                        selectedConversation.worktreePath
                      )
                      if (!result.success) {
                        console.error('Failed to open terminal:', result.error)
                      }
                    }
                  }}
                  style={{
                    backgroundColor: selectedConversation.worktreePath
                      ? theme.background.tertiary
                      : theme.background.tertiary,
                    color: selectedConversation.worktreePath
                      ? theme.text.primary
                      : theme.text.muted,
                    cursor: selectedConversation.worktreePath
                      ? 'pointer'
                      : 'not-allowed',
                    opacity: selectedConversation.worktreePath ? 1 : 0.6,
                  }}
                  title={
                    selectedConversation.worktreePath
                      ? 'Open Terminal at Worktree'
                      : 'No worktree available'
                  }
                >
                  <Terminal className="w-4 h-4" />
                </button>
                <div
                  className="w-px h-6"
                  style={{ backgroundColor: theme.border.primary }}
                />
                <button
                  className="p-2 text-sm transition-colors flex items-center justify-center"
                  style={{
                    backgroundColor: theme.background.tertiary,
                    color: theme.text.primary,
                  }}
                  title="Keyboard Shortcuts"
                >
                  <Keyboard className="w-4 h-4" />
                </button>
              </div>

              {/* Conversation and Diff group */}
              <div
                className={`flex items-center rounded-lg overflow-hidden border ${themeClasses.borderPrimary}`}
              >
                <button
                  className="p-2 text-sm transition-colors flex items-center justify-center"
                  onClick={() => setConversationViewMode('conversation')}
                  style={{
                    backgroundColor:
                      conversationViewMode === 'conversation'
                        ? theme.background.tertiary
                        : theme.background.primary,
                    color:
                      conversationViewMode === 'conversation'
                        ? theme.text.primary
                        : theme.text.tertiary,
                  }}
                  title="Conversation View"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
                <div
                  className="w-px h-6"
                  style={{ backgroundColor: theme.border.primary }}
                />
                <button
                  className="p-2 text-sm transition-colors flex items-center justify-center"
                  onClick={() => setConversationViewMode('diff')}
                  style={{
                    backgroundColor:
                      conversationViewMode === 'diff'
                        ? theme.background.tertiary
                        : theme.background.primary,
                    color:
                      conversationViewMode === 'diff'
                        ? theme.text.primary
                        : theme.text.tertiary,
                  }}
                  title="Code Difference View"
                >
                  <GitCompare className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Agent Management View */}
        {viewMode === 'agents' && (
          <AgentView agents={agents} setAgents={setAgents} triggerNewAgent={triggerNewAgent} />
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
            loadAndProcessPromptHistory={loadAndProcessPromptHistory}
            newConversation={newConversation}
            onTokenUsageUpdate={usage => {
              setConversationTokenUsage(prev => {
                const newMap = new Map(prev)
                newMap.set(selectedConversation.promptId, {
                  inputTokens: usage.inputTokens,
                  outputTokens: usage.outputTokens,
                  model: usage.model,
                })
                return newMap
              })
            }}
            projectContext={projectContext}
            promptHistory={promptHistory}
            selectedConversation={selectedConversation}
            setBusyConversations={setBusyConversations}
            setPromptHistory={setPromptHistory}
            setSelectedConversation={setSelectedConversation}
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
