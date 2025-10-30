import { useState, useEffect } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { useTheme, createThemeClasses } from '../../theme/ThemeContext'
import type { PromptAgent } from '../../../shared/types'

interface AgentViewProps {
  agents: PromptAgent[]
  setAgents: (agents: PromptAgent[]) => void
  triggerNewAgent?: boolean
}

export function AgentView({ agents, setAgents, triggerNewAgent }: AgentViewProps) {
  const { theme, themeName } = useTheme()
  const themeClasses = createThemeClasses(theme)
  const isLightTheme = themeName === 'light'

  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [editingAgent, setEditingAgent] = useState<PromptAgent | null>(null)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [newAgent, setNewAgent] = useState<
    Omit<PromptAgent, 'id' | 'createdAt' | 'updatedAt'>
  >({
    name: '',
    systemPrompt: '',
    tools: [],
  })

  const handleCreateNewAgent = () => {
    setIsCreatingNew(true)
    setEditingAgentId(null)
    setEditingAgent(null)
  }

  // React to triggerNewAgent prop from parent
  useEffect(() => {
    if (triggerNewAgent) {
      handleCreateNewAgent()
    }
  }, [triggerNewAgent])

  const handleSaveNewAgent = () => {
    if (newAgent.name.trim() && newAgent.systemPrompt.trim()) {
      const agent: PromptAgent = {
        id: Date.now().toString(),
        name: newAgent.name,
        systemPrompt: newAgent.systemPrompt,
        tools: newAgent.tools,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      setAgents([agent, ...agents])
      setIsCreatingNew(false)
      setNewAgent({ name: '', systemPrompt: '', tools: [] })
    }
  }

  const handleCancelNewAgent = () => {
    setIsCreatingNew(false)
    setNewAgent({ name: '', systemPrompt: '', tools: [] })
  }

  const handleDeleteAgent = (agentId: string) => {
    setAgents(agents.filter(a => a.id !== agentId))
  }

  const handleStartEdit = (agent: PromptAgent) => {
    setEditingAgentId(agent.id)
    setEditingAgent({ ...agent })
    setIsCreatingNew(false)
  }

  const handleSaveEdit = () => {
    if (editingAgent) {
      setAgents(
        agents.map(a =>
          a.id === editingAgent.id
            ? { ...editingAgent, updatedAt: new Date() }
            : a
        )
      )
      setEditingAgentId(null)
      setEditingAgent(null)
    }
  }

  const formatDate = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`

    const day = date.getDate()
    const month = date.toLocaleDateString('en-US', { month: 'long' })
    return `${day} ${month}`
  }

  return (
    <div className="h-full flex flex-col">
      {/* Grid Layout */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
          {/* Create New Agent Card */}
          {isCreatingNew && (
            <div
              className={`${themeClasses.bgSecondary} border ${themeClasses.borderPrimary} rounded-lg p-4 flex flex-col h-[280px]`}
            >
              <div className="flex items-center justify-between mb-4">
                <input
                  autoFocus
                  className={`flex-1 ${themeClasses.bgPrimary} border-none rounded px-2 py-1 ${themeClasses.textPrimary} focus:outline-none text-base font-semibold`}
                  onChange={e => {
                    setNewAgent({ ...newAgent, name: e.target.value })
                  }}
                  placeholder="Title"
                  type="text"
                  value={newAgent.name}
                />
                <div className="flex items-center gap-2 ml-2">
                  <button
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      isLightTheme
                        ? 'bg-black text-white hover:bg-gray-800'
                        : 'bg-white text-black hover:bg-gray-200'
                    }`}
                    onClick={handleSaveNewAgent}
                  >
                    Save
                  </button>
                  <button
                    className={`p-1 rounded hover:${themeClasses.bgInput} transition-colors`}
                    onClick={handleCancelNewAgent}
                  >
                    <Trash2 className={`w-4 h-4 ${themeClasses.textSecondary}`} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden">
                <label className={`text-xs font-semibold ${themeClasses.textSecondary} mb-2 block`}>
                  Prompt
                </label>
                <textarea
                  className={`w-full h-[160px] ${themeClasses.bgPrimary} border-none rounded p-2 ${themeClasses.textPrimary} focus:outline-none text-sm resize-none`}
                  onChange={e => {
                    setNewAgent({ ...newAgent, systemPrompt: e.target.value })
                  }}
                  placeholder="Quick templates above the input box for common development tasks. Customize these prompts for your project needs."
                  value={newAgent.systemPrompt}
                />
              </div>

              <div className={`text-xs ${themeClasses.textTertiary} mt-2`}>
                Updated just now
              </div>
            </div>
          )}

          {/* Existing Agent Cards */}
          {agents.map(agent => (
            <div
              className={`${themeClasses.bgSecondary} border ${themeClasses.borderPrimary} rounded-lg p-4 flex flex-col h-[280px] hover:${themeClasses.borderHover} transition-colors cursor-pointer`}
              key={agent.id}
            >
              {editingAgentId === agent.id ? (
                // Edit Mode
                <>
                  <div className="flex items-center justify-between mb-4">
                    <input
                      className={`flex-1 ${themeClasses.bgPrimary} border-none rounded px-2 py-1 ${themeClasses.textPrimary} focus:outline-none text-base font-semibold`}
                      onChange={e => {
                        if (editingAgent) {
                          setEditingAgent({
                            ...editingAgent,
                            name: e.target.value,
                          })
                        }
                      }}
                      placeholder="Title"
                      type="text"
                      value={editingAgent?.name || ''}
                    />
                    <div className="flex items-center gap-2 ml-2">
                      <button
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          isLightTheme
                            ? 'bg-black text-white hover:bg-gray-800'
                            : 'bg-white text-black hover:bg-gray-200'
                        }`}
                        onClick={handleSaveEdit}
                      >
                        Save
                      </button>
                      <button
                        className={`p-1 rounded hover:${themeClasses.bgInput} transition-colors`}
                        onClick={() => handleDeleteAgent(agent.id)}
                      >
                        <Trash2 className={`w-4 h-4 ${themeClasses.textSecondary}`} />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-hidden">
                    <label className={`text-xs font-semibold ${themeClasses.textSecondary} mb-2 block`}>
                      Prompt
                    </label>
                    <textarea
                      className={`w-full h-[160px] ${themeClasses.bgPrimary} border-none rounded p-2 ${themeClasses.textPrimary} focus:outline-none text-sm resize-none`}
                      onChange={e => {
                        if (editingAgent) {
                          setEditingAgent({
                            ...editingAgent,
                            systemPrompt: e.target.value,
                          })
                        }
                      }}
                      placeholder="System prompt for this agent"
                      value={editingAgent?.systemPrompt || ''}
                    />
                  </div>

                  <div className={`text-xs ${themeClasses.textTertiary} mt-2`}>
                    Updated on {formatDate(agent.updatedAt)}
                  </div>
                </>
              ) : (
                // View Mode
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-base font-semibold ${themeClasses.textPrimary} truncate flex-1`}>
                      {agent.name}
                    </h3>
                    <button
                      className={`p-1 rounded hover:${themeClasses.bgInput} transition-colors flex-shrink-0 ml-2`}
                      onClick={() => handleStartEdit(agent)}
                    >
                      <Pencil className={`w-4 h-4 ${themeClasses.textSecondary}`} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-hidden">
                    <label className={`text-xs font-semibold ${themeClasses.textSecondary} mb-2 block`}>
                      Prompt
                    </label>
                    <p className={`text-sm ${themeClasses.textPrimary} line-clamp-6`}>
                      {agent.systemPrompt}
                    </p>
                  </div>

                  <div className={`text-xs ${themeClasses.textTertiary} mt-2`}>
                    Updated on {formatDate(agent.updatedAt)}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
