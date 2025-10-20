import { useState } from 'react'
import { useTheme, createThemeClasses } from '../../theme/ThemeContext'
import type { PromptAgent } from '../../../shared/types'

interface AgentViewProps {
  agents: PromptAgent[]
  setAgents: (agents: PromptAgent[]) => void
}

export function AgentView({ agents, setAgents }: AgentViewProps) {
  const { theme } = useTheme()
  const themeClasses = createThemeClasses(theme)

  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [editingAgent, setEditingAgent] = useState<PromptAgent | null>(null)

  return (
    <div className="space-y-4">
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
                      setEditingAgent({ ...editingAgent, name: e.target.value })
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
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        editingAgent?.tools.includes(tool)
                          ? 'bg-purple-600 text-white border-2 border-purple-400'
                          : 'bg-gray-700 text-gray-300 border-2 border-transparent hover:border-gray-500'
                      }`}
                      key={tool}
                      onClick={() => {
                        if (editingAgent) {
                          const newTools = editingAgent.tools.includes(tool)
                            ? editingAgent.tools.filter(t => t !== tool)
                            : [...editingAgent.tools, tool]
                          setEditingAgent({ ...editingAgent, tools: newTools })
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
                  className={`px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white transition-colors`}
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
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white transition-colors`}
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
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-600/20 text-purple-300 border border-purple-500/30"
                      key={tool}
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
  )
}
