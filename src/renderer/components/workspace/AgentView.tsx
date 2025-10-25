import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTheme, createThemeClasses } from '../../theme/ThemeContext'
import type { PromptAgent } from '../../../shared/types'

interface AgentViewProps {
  agents: PromptAgent[]
  setAgents: (agents: PromptAgent[]) => void
}

export function AgentView({ agents, setAgents }: AgentViewProps) {
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
      setAgents([...agents, agent])
      setIsCreatingNew(false)
      setNewAgent({ name: '', systemPrompt: '', tools: [] })
    }
  }

  const handleCancelNewAgent = () => {
    setIsCreatingNew(false)
    setNewAgent({ name: '', systemPrompt: '', tools: [] })
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with Create New Agent Button */}
      <div className="flex items-center justify-between mb-4 pb-3">
        <button
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            isLightTheme
              ? 'bg-black text-white hover:bg-gray-800'
              : 'bg-white text-black hover:bg-gray-200'
          }`}
          disabled={isCreatingNew}
          onClick={handleCreateNewAgent}
        >
          <Plus className="w-4 h-4" />
          New Agent
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {/* Create New Agent Form */}
        {isCreatingNew && (
          <div
            className={`${themeClasses.bgSecondary} border ${themeClasses.borderPrimary} rounded-lg p-6`}
          >
            <div className="space-y-4">
              <div>
                <label
                  className={`text-sm font-medium ${themeClasses.textSecondary} mb-2 block`}
                >
                  Agent Name
                </label>
                <input
                  autoFocus
                  className={`w-full ${themeClasses.bgInput} border ${themeClasses.borderPrimary} rounded-lg p-3 ${themeClasses.textPrimary} focus:outline-none ${themeClasses.borderFocus}`}
                  onChange={e => {
                    setNewAgent({ ...newAgent, name: e.target.value })
                  }}
                  placeholder="Enter agent name"
                  type="text"
                  value={newAgent.name}
                />
              </div>

              <div>
                <label
                  className={`text-sm font-medium ${themeClasses.textSecondary} mb-2 block`}
                >
                  System Prompt
                </label>
                <textarea
                  className={`w-full ${themeClasses.bgInput} border ${themeClasses.borderPrimary} rounded-lg p-3 ${themeClasses.textPrimary} focus:outline-none ${themeClasses.borderFocus} min-h-[120px]`}
                  onChange={e => {
                    setNewAgent({ ...newAgent, systemPrompt: e.target.value })
                  }}
                  placeholder="Enter system prompt for this agent"
                  value={newAgent.systemPrompt}
                />
              </div>

              <div>
                <label
                  className={`text-sm font-medium ${themeClasses.textSecondary} mb-2 block`}
                >
                  Available Tools
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Read',
                    'Write',
                    'Edit',
                    'Bash',
                    'Glob',
                    'Grep',
                    'Task',
                    'WebFetch',
                    'WebSearch',
                    'TodoWrite',
                  ].map(tool => (
                    <button
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border-2 ${
                        newAgent.tools.includes(tool)
                          ? `${themeClasses.interactivePrimaryBg} ${themeClasses.interactivePrimaryText} ${themeClasses.borderFocus}`
                          : `${themeClasses.bgSecondary} ${themeClasses.textSecondary} border-transparent ${themeClasses.borderHover}`
                      }`}
                      key={tool}
                      onClick={() => {
                        const updatedTools = newAgent.tools.includes(tool)
                          ? newAgent.tools.filter(t => t !== tool)
                          : [...newAgent.tools, tool]
                        setNewAgent({ ...newAgent, tools: updatedTools })
                      }}
                    >
                      {tool}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${themeClasses.bgSecondary} border ${themeClasses.borderPrimary} hover:${themeClasses.bgInput} transition-colors`}
                  onClick={handleCancelNewAgent}
                >
                  Cancel
                </button>
                <button
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    newAgent.name.trim() && newAgent.systemPrompt.trim()
                      ? `${themeClasses.interactivePrimaryBg} hover:${themeClasses.interactivePrimaryBgHover} ${themeClasses.interactivePrimaryText}`
                      : 'bg-gray-500 text-gray-300 cursor-not-allowed'
                  }`}
                  disabled={
                    !newAgent.name.trim() || !newAgent.systemPrompt.trim()
                  }
                  onClick={handleSaveNewAgent}
                >
                  Create Agent
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Existing Agents */}
        {agents.map(agent => (
          <div
            className={`${themeClasses.bgSecondary} border ${themeClasses.borderPrimary} rounded-lg p-6`}
            key={agent.id}
          >
            {editingAgentId === agent.id ? (
              // Edit Mode
              <div className="space-y-4">
                <div>
                  <label
                    className={`text-sm font-medium ${themeClasses.textSecondary} mb-2 block`}
                  >
                    Agent Name
                  </label>
                  <input
                    className={`w-full ${themeClasses.bgInput} border ${themeClasses.borderPrimary} rounded-lg p-3 ${themeClasses.textPrimary} focus:outline-none ${themeClasses.borderFocus}`}
                    onChange={e => {
                      if (editingAgent) {
                        setEditingAgent({
                          ...editingAgent,
                          name: e.target.value,
                        })
                      }
                    }}
                    placeholder="Agent name"
                    type="text"
                    value={editingAgent?.name || ''}
                  />
                </div>

                <div>
                  <label
                    className={`text-sm font-medium ${themeClasses.textSecondary} mb-2 block`}
                  >
                    System Prompt
                  </label>
                  <textarea
                    className={`w-full ${themeClasses.bgInput} border ${themeClasses.borderPrimary} rounded-lg p-3 ${themeClasses.textPrimary} focus:outline-none ${themeClasses.borderFocus} min-h-[120px]`}
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

                <div>
                  <label
                    className={`text-sm font-medium ${themeClasses.textSecondary} mb-2 block`}
                  >
                    Available Tools
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Read',
                      'Write',
                      'Edit',
                      'Bash',
                      'Glob',
                      'Grep',
                      'Task',
                      'WebFetch',
                      'WebSearch',
                      'TodoWrite',
                    ].map(tool => (
                      <button
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border-2 ${
                          editingAgent?.tools.includes(tool)
                            ? `${themeClasses.interactivePrimaryBg} ${themeClasses.interactivePrimaryText} ${themeClasses.borderFocus}`
                            : `${themeClasses.bgSecondary} ${themeClasses.textSecondary} border-transparent ${themeClasses.borderHover}`
                        }`}
                        key={tool}
                        onClick={() => {
                          if (editingAgent) {
                            const newTools = editingAgent.tools.includes(tool)
                              ? editingAgent.tools.filter(t => t !== tool)
                              : [...editingAgent.tools, tool]
                            setEditingAgent({
                              ...editingAgent,
                              tools: newTools,
                            })
                          }
                        }}
                      >
                        {tool}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${themeClasses.bgSecondary} border ${themeClasses.borderPrimary} hover:${themeClasses.bgInput} transition-colors`}
                    onClick={() => {
                      setEditingAgentId(null)
                      setEditingAgent(null)
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${themeClasses.interactivePrimaryBg} hover:${themeClasses.interactivePrimaryBgHover} ${themeClasses.interactivePrimaryText} transition-colors`}
                    onClick={() => {
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
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              // View Mode
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4
                      className={`text-xl font-bold ${themeClasses.textPrimary} mb-1`}
                    >
                      {agent.name}
                    </h4>
                    <p className={`text-xs ${themeClasses.textTertiary}`}>
                      Last updated: {agent.updatedAt.toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${themeClasses.interactivePrimaryBg} hover:${themeClasses.interactivePrimaryBgHover} ${themeClasses.interactivePrimaryText} transition-colors`}
                    onClick={() => {
                      setEditingAgentId(agent.id)
                      setEditingAgent({ ...agent })
                    }}
                  >
                    Edit
                  </button>
                </div>

                <div>
                  <label
                    className={`text-sm font-medium ${themeClasses.textSecondary} mb-2 block`}
                  >
                    System Prompt
                  </label>
                  <div
                    className={`${themeClasses.bgInput} border ${themeClasses.borderPrimary} rounded-lg p-3`}
                  >
                    <p className={`text-sm ${themeClasses.textPrimary}`}>
                      {agent.systemPrompt}
                    </p>
                  </div>
                </div>

                <div>
                  <label
                    className={`text-sm font-medium ${themeClasses.textSecondary} mb-2 block`}
                  >
                    Available Tools
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {agent.tools.map(tool => (
                      <span
                        className="text-xs px-2 py-0.5 rounded"
                        key={tool}
                        style={{
                          backgroundColor: theme.background.labels,
                          color: theme.text.muted,
                        }}
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
