import { useState, useEffect, useRef } from 'react'
import { ClipboardList, Play } from 'lucide-react'
import { useTheme, createThemeClasses } from '../../theme/ThemeContext'

// Type definition for window.App
declare global {
  interface Window {
    App: {
      executeCommand: (command: string) => Promise<string>
      executeCommandStream: (
        command: string,
        onOutput?: (data: { type: string; data: string }) => void
      ) => Promise<string>
      getProjectFiles: (projectPath: string) => Promise<string[]>
      checkClaudeInstallation: () => Promise<{
        installed: boolean
        inPath: boolean
      }>
      installClaude: () => Promise<{
        success: boolean
        output?: string
        error?: string
      }>
      setupClaudePath: () => Promise<{
        success: boolean
        output?: string
        error?: string
        shell?: string
      }>
    }
  }
}

type PromptStatus = 'busy' | 'completed' | 'old'

interface PromptHistoryItem {
  id: string
  text: string
  status: PromptStatus
  timestamp: Date
}

interface FileChange {
  path: string
  additions: number
  deletions: number
}

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

  const [currentPrompt, setCurrentPrompt] = useState('')
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set())
  const [chatMessages, setChatMessages] = useState<
    Array<{
      id: string
      content: string
      type: 'user' | 'system' | 'assistant'
      timestamp: Date
      isStreaming?: boolean
    }>
  >([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  )
  const [inputMode, setInputMode] = useState<'full' | 'compact'>('full')
  const [projectFiles, setProjectFiles] = useState<FileChange[]>([])
  const [claudeStatus, setClaudeStatus] = useState<{
    installed: boolean
    inPath: boolean
    checking: boolean
    installing: boolean
  }>({
    installed: false,
    inPath: false,
    checking: true,
    installing: false,
  })
  const [activePills, setActivePills] = useState<Set<number>>(new Set())
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // Prompt pills data
  const promptPills = [
    { label: 'Tailwind Frontend', text: 'I need help with frontend development using Tailwind CSS. Please act as an expert frontend developer.' },
    { label: 'Backend API', text: 'I need help with backend API development. Please act as an expert backend developer.' },
    { label: 'React Component', text: 'I need help creating a React component. Please act as an expert React developer.' },
    { label: 'Database Design', text: 'I need help with database design and optimization. Please act as a database expert.' },
    { label: 'Bug Fix', text: 'I have a bug that needs fixing. Please help me debug and resolve this issue.' },
  ]

  // Mock data for prompt history
  const promptHistory: PromptHistoryItem[] = [
    {
      id: '1',
      text: 'Create a new user authentication system with JWT tokens and password hashing',
      status: 'old',
      timestamp: new Date('2024-01-15'),
    },
    {
      id: '2',
      text: 'Fix the API endpoint that handles file uploads',
      status: 'completed',
      timestamp: new Date('2024-01-16'),
    },
    {
      id: '3',
      text: 'Implement real-time notifications using WebSocket connections and handle reconnection logic',
      status: 'busy',
      timestamp: new Date('2024-01-17'),
    },
  ]

  // Check Claude installation on component mount
  useEffect(() => {
    const checkClaudeInstallation = async () => {
      try {
        const status = await window.App.checkClaudeInstallation()
        setClaudeStatus({
          installed: status.installed,
          inPath: status.inPath,
          checking: false,
          installing: false,
        })
      } catch (error) {
        console.error('Error checking Claude installation:', error)
        setClaudeStatus({
          installed: false,
          inPath: false,
          checking: false,
          installing: false,
        })
      }
    }

    checkClaudeInstallation()
  }, [])

  // Load project files when component mounts
  useEffect(() => {
    const loadProjectFiles = async () => {
      if (projectContext?.projectPath) {
        try {
          // Get project files from the loaded project
          const files = await window.App.getProjectFiles(
            projectContext.projectPath
          )

          // Convert to FileChange format with dummy data for now
          const fileChanges: FileChange[] =
            files?.map((file: string) => ({
              path: file,
              additions: Math.floor(Math.random() * 50) + 1,
              deletions: Math.floor(Math.random() * 10),
            })) || []

          setProjectFiles(fileChanges)
        } catch (error) {
          console.error('Error loading project files:', error)
          // Fallback to mock data
          setProjectFiles([
            { path: 'src/main.ts', additions: 25, deletions: 3 },
            { path: 'src/components/App.tsx', additions: 12, deletions: 0 },
            { path: 'package.json', additions: 2, deletions: 1 },
          ])
        }
      } else {
        // Mock data when no project context
        setProjectFiles([
          { path: 'src/auth/AuthService.ts', additions: 45, deletions: 12 },
          { path: 'src/components/LoginForm.tsx', additions: 23, deletions: 5 },
          { path: 'src/utils/validation.ts', additions: 18, deletions: 3 },
          { path: 'package.json', additions: 2, deletions: 0 },
        ])
      }
    }

    loadProjectFiles()
  }, [projectContext?.projectPath])

  const getStatusColor = (status: PromptStatus) => {
    switch (status) {
      case 'busy':
        return 'bg-red-500'
      case 'completed':
        return 'bg-orange-500'
      case 'old':
        return 'bg-green-500'
    }
  }

  const truncatePrompt = (text: string, maxLines: number = 2) => {
    const words = text.split(' ')
    const wordsPerLine = 10 // Approximate
    const maxWords = maxLines * wordsPerLine

    if (words.length <= maxWords) return text
    return words.slice(0, maxWords).join(' ') + '...'
  }

  const togglePromptExpansion = (promptId: string) => {
    const newExpanded = new Set(expandedPrompts)
    if (newExpanded.has(promptId)) {
      newExpanded.delete(promptId)
    } else {
      newExpanded.add(promptId)
    }
    setExpandedPrompts(newExpanded)
  }

  const addChatMessage = (
    content: string,
    type: 'user' | 'system' | 'assistant',
    isStreaming = false
  ) => {
    const newMessage = {
      id: Date.now().toString(),
      content,
      type,
      timestamp: new Date(),
      isStreaming,
    }
    setChatMessages(prev => [...prev, newMessage])

    // Auto-scroll to bottom
    setTimeout(() => {
      chatContainerRef.current?.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }, 100)

    return newMessage.id
  }

  const updateStreamingMessage = (
    messageId: string,
    additionalContent: string
  ) => {
    setChatMessages(prev =>
      prev.map(msg => {
        if (msg.id === messageId) {
          return { ...msg, content: msg.content + additionalContent }
        }
        return msg
      })
    )

    // Auto-scroll to bottom
    setTimeout(() => {
      chatContainerRef.current?.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }, 50)
  }

  const finalizeStreamingMessage = (messageId: string) => {
    setChatMessages(prev =>
      prev.map(msg => {
        if (msg.id === messageId) {
          return { ...msg, isStreaming: false }
        }
        return msg
      })
    )
    setStreamingMessageId(null)
  }

  const handlePillClick = (index: number, text: string) => {
    const newActivePills = new Set(activePills)

    if (activePills.has(index)) {
      // Remove pill: remove its text from current prompt
      newActivePills.delete(index)
      setCurrentPrompt(prev => {
        // Remove this specific pill's text
        return prev.replace(text, '').replace(/\s+/g, ' ').trim()
      })
    } else {
      // Add pill: append its text to current prompt
      newActivePills.add(index)
      setCurrentPrompt(prev => {
        if (prev.trim()) {
          // If there's already text, append with a space
          return prev + (prev.endsWith(' ') ? '' : ' ') + text
        } else {
          // If empty, set the text directly
          return text
        }
      })
    }

    setActivePills(newActivePills)
  }

  const installClaudeIfNeeded = async () => {
    // If Claude is not installed, install it
    if (!claudeStatus.installed) {
      setClaudeStatus(prev => ({ ...prev, installing: true }))
      addChatMessage(
        'Claude CLI is not installed. Installing Claude CLI...',
        'system'
      )

      try {
        const installResult = await window.App.installClaude()
        if (installResult.success) {
          addChatMessage('Claude CLI installed successfully!', 'system')
          setClaudeStatus(prev => ({
            ...prev,
            installed: true,
            installing: false,
          }))
        } else {
          addChatMessage(
            `Failed to install Claude CLI: ${installResult.error}`,
            'system'
          )
          setClaudeStatus(prev => ({ ...prev, installing: false }))
          return false
        }
      } catch (error: any) {
        addChatMessage(
          `Failed to install Claude CLI: ${error?.message || error}`,
          'system'
        )
        setClaudeStatus(prev => ({ ...prev, installing: false }))
        return false
      }
    }

    // If Claude is installed but not in PATH, set up PATH
    if (claudeStatus.installed && !claudeStatus.inPath) {
      addChatMessage('Setting up Claude CLI in PATH...', 'system')

      try {
        const pathResult = await window.App.setupClaudePath()
        if (pathResult.success) {
          addChatMessage(
            `Claude CLI PATH configured successfully! ${pathResult.shell ? `(using ${pathResult.shell})` : ''}`,
            'system'
          )
          setClaudeStatus(prev => ({ ...prev, inPath: true }))
        } else {
          addChatMessage(`Failed to setup PATH: ${pathResult.error}`, 'system')
          // Even if PATH setup fails, we can still use the full path
          addChatMessage(
            'You can still use Claude CLI, but you may need to restart your terminal.',
            'system'
          )
        }
      } catch (error: any) {
        addChatMessage(
          `Failed to setup PATH: ${error?.message || error}`,
          'system'
        )
      }
    }

    return true
  }

  const handlePlan = async () => {
    if (!currentPrompt.trim() || !projectContext) return

    setIsExecuting(true)
    setInputMode('compact')

    // Add user message
    addChatMessage(currentPrompt, 'user')

    // Check and install Claude if needed
    const claudeReady = await installClaudeIfNeeded()
    if (!claudeReady) {
      setIsExecuting(false)
      return
    }

    // Add system message about planning
    addChatMessage(
      `Planning in ${projectContext.projectPath.split('/').pop()}...`,
      'system'
    )

    try {
      // Use full path if Claude is not in PATH
      const claudeCmd = claudeStatus.inPath
        ? 'claude'
        : '$HOME/.local/bin/claude'
      const claudeCommand = `cd "${projectContext.projectPath}" && ${claudeCmd} -p "${currentPrompt}" --plan --permission-mode acceptEdits`

      // Start streaming message
      const messageId = addChatMessage('', 'assistant', true)
      setStreamingMessageId(messageId)

      try {
        const output = await window.App.executeCommandStream(
          claudeCommand,
          data => {
            // Update the streaming message with new data
            if (data.type === 'stdout' || data.type === 'stderr') {
              updateStreamingMessage(messageId, data.data)
            }
          }
        )

        // Finalize the streaming message
        finalizeStreamingMessage(messageId)

        // If no output was streamed, show a message
        const finalMessage = chatMessages.find(msg => msg.id === messageId)
        if (!finalMessage?.content.trim()) {
          updateStreamingMessage(
            messageId,
            'Plan completed but produced no output.'
          )
          finalizeStreamingMessage(messageId)
        }
      } catch (streamError) {
        // Handle streaming errors
        updateStreamingMessage(messageId, `Error: ${streamError}`)
        finalizeStreamingMessage(messageId)
        throw streamError
      }
    } catch (error: any) {
      addChatMessage(
        `Error during planning: ${error?.message || error}`,
        'system'
      )
    } finally {
      setIsExecuting(false)
    }
  }

  const handleExecute = async () => {
    if (!currentPrompt.trim() || !projectContext) return

    setIsExecuting(true)
    setInputMode('compact')

    // Add user message
    addChatMessage(currentPrompt, 'user')

    // Check and install Claude if needed
    const claudeReady = await installClaudeIfNeeded()
    if (!claudeReady) {
      setIsExecuting(false)
      return
    }

    // Add system message about execution
    addChatMessage(
      `Executing in ${projectContext.projectPath.split('/').pop()}...`,
      'system'
    )

    try {
      // Ensure we're on the selected root branch
      addChatMessage(
        `Switching to root branch: ${projectContext.selectedBranch}`,
        'system'
      )
      await window.App.executeCommand(
        `cd "${projectContext.projectPath}" && git checkout ${projectContext.selectedBranch}`
      )

      // Create sanitized branch name
      const branchName = currentPrompt
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50)
        .replace(/^-+|-+$/g, '') // Remove leading/trailing dashes

      // Create new git branch from the selected root branch
      addChatMessage(`Creating new branch: ${branchName}`, 'system')
      await window.App.executeCommand(
        `cd "${projectContext.projectPath}" && git checkout -b "${branchName}"`
      )

      // Execute Claude command in the project directory
      addChatMessage(`Running Claude with your prompt...`, 'system')

      // Use full path if Claude is not in PATH
      const claudeCmd = claudeStatus.inPath
        ? 'claude'
        : '$HOME/.local/bin/claude'
      const claudeCommand = `cd "${projectContext.projectPath}" && ${claudeCmd} -p "${currentPrompt}" --permission-mode acceptEdits`

      // Start streaming message
      const messageId = addChatMessage('', 'assistant', true)
      setStreamingMessageId(messageId)

      try {
        const output = await window.App.executeCommandStream(
          claudeCommand,
          data => {
            // Update the streaming message with new data
            if (data.type === 'stdout' || data.type === 'stderr') {
              updateStreamingMessage(messageId, data.data)
            }
          }
        )

        // Finalize the streaming message
        finalizeStreamingMessage(messageId)

        // If no output was streamed, show a message
        const finalMessage = chatMessages.find(msg => msg.id === messageId)
        if (!finalMessage?.content.trim()) {
          updateStreamingMessage(
            messageId,
            'Command executed but produced no output.'
          )
          finalizeStreamingMessage(messageId)
        }
      } catch (error) {
        // Handle streaming errors
        updateStreamingMessage(messageId, `Error: ${error}`)
        finalizeStreamingMessage(messageId)
        throw error
      }

      // Clear the prompt after successful execution
      setCurrentPrompt('')
    } catch (error: any) {
      addChatMessage(`Error: ${error?.message || error}`, 'system')
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div className={`flex h-full ${themeClasses.bgPrimary} ${themeClasses.textPrimary}`}>
      {/* First Section - Prompt History (20% width) */}
      <div className={`w-1/5 border-r ${themeClasses.borderPrimary} p-4 overflow-y-auto`}>
        <h3 className={`text-lg font-semibold mb-4 ${themeClasses.textPrimary}`}>Prompt History</h3>
        <div className="space-y-3">
          {promptHistory.map(prompt => {
            const isExpanded = expandedPrompts.has(prompt.id)
            const displayText = isExpanded
              ? prompt.text
              : truncatePrompt(prompt.text)
            const needsTruncation = prompt.text.split(' ').length > 20

            return (
              <div className={`${themeClasses.bgSecondary} rounded-lg p-3`} key={prompt.id}>
                <div className="flex items-start justify-between mb-2">
                  <div
                    className={`w-2 h-2 rounded-full ${getStatusColor(prompt.status)} mt-1 flex-shrink-0`}
                  />
                  <span className={`text-xs ${themeClasses.textTertiary} ml-2`}>
                    {prompt.timestamp.toLocaleDateString()}
                  </span>
                </div>
                <p
                  className={`text-sm ${themeClasses.textSecondary} ${needsTruncation ? `cursor-pointer hover:${themeClasses.textPrimary}` : ''}`}
                  onClick={() =>
                    needsTruncation && togglePromptExpansion(prompt.id)
                  }
                  onKeyDown={e => {
                    if (
                      needsTruncation &&
                      (e.key === 'Enter' || e.key === ' ')
                    ) {
                      togglePromptExpansion(prompt.id)
                    }
                  }}
                  role={needsTruncation ? 'button' : undefined}
                  tabIndex={needsTruncation ? 0 : -1}
                >
                  {displayText}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Second Section - Input Area (45% width) */}
      <div className="w-4/5 p-6 flex flex-col">
        <h3 className={`text-lg font-semibold mb-4 ${themeClasses.textPrimary}`}>New Prompt</h3>
        {chatMessages.length === 0 && (
          <div className={`mb-6 ${themeClasses.bgCard} border ${themeClasses.borderPrimary} rounded-lg p-6`}>
            <h1 className={`text-2xl font-bold ${themeClasses.textPrimary} mb-4 border-b ${themeClasses.borderSecondary} pb-2`}>
              Welcome to AlmondCoder
            </h1>

            <div className="prose prose-invert max-w-none">
              <p className={`${themeClasses.textSecondary} mb-4 leading-relaxed`}>
                Type your coding instructions in the box below. Click on{' '}
                <strong>Plan</strong> to think through the implementation, which
                you can later edit, before executing the plan.
              </p>

              <h3 className={`text-lg font-semibold ${themeClasses.textPrimary} mt-4 mb-2`}>
                Getting Started
              </h3>
              <ul className={`${themeClasses.textSecondary} space-y-1 ml-4`}>
                <li>
                  • Use the input box below to describe what you want to build
                </li>
                <li>
                  • Click{' '}
                  <code className={`${themeClasses.bgTertiary} px-1 py-0.5 rounded text-sm ${themeClasses.textAccent}`}>
                    Plan
                  </code>{' '}
                  to preview the implementation strategy
                </li>
                <li>
                  • Click{' '}
                  <code className={`${themeClasses.bgTertiary} px-1 py-0.5 rounded text-sm text-green-400`}>
                    Execute
                  </code>{' '}
                  to run the changes
                </li>
              </ul>

              <h3 className={`text-lg font-semibold ${themeClasses.textPrimary} mt-4 mb-2`}>
                Prompt Pills
              </h3>
              <p className={`${themeClasses.textSecondary} mb-3 leading-relaxed`}>
                Quick templates above the input box for common development tasks.
              </p>

              <h4 className={`text-sm font-medium ${themeClasses.textPrimary} mb-2`}>Examples:</h4>
              <ul className={`${themeClasses.textSecondary} space-y-1 ml-4 mb-3`}>
                <li>• <code className={`${themeClasses.bgTertiary} px-1 py-0.5 rounded text-xs text-purple-400`}>Tailwind Frontend</code> - Frontend developer with Tailwind CSS expertise</li>
                <li>• <code className={`${themeClasses.bgTertiary} px-1 py-0.5 rounded text-xs text-purple-400`}>Backend API</code> - Backend developer for API development</li>
                <li>• <code className={`${themeClasses.bgTertiary} px-1 py-0.5 rounded text-xs text-purple-400`}>React Component</code> - React component development specialist</li>
              </ul>

              <blockquote className={`border-l-4 ${themeClasses.borderSecondary} pl-4 ${themeClasses.textTertiary} italic text-sm`}>
                <strong>Tip:</strong> Customize these prompts for your project needs. They'll be saved in your .git repository for team collaboration.
              </blockquote>
            </div>
          </div>
        )}
        <div className="flex-1 flex flex-col">
          {/* Chat Messages Area */}
          {chatMessages.length > 0 && (
            <div
              className={`flex-1 ${themeClasses.bgSecondary} rounded-lg p-4 mb-4 overflow-y-auto border ${themeClasses.borderPrimary} space-y-3`}
              ref={chatContainerRef}
            >
              {chatMessages.map(message => (
                <div
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  key={message.id}
                >
                  <div
                    className={`max-w-[85%] p-3 rounded-lg ${
                      message.type === 'user'
                        ? `${themeClasses.chatUser} ml-12`
                        : message.type === 'assistant'
                          ? `${themeClasses.chatAssistant} mr-12`
                          : `${themeClasses.chatSystem} mr-12`
                    }`}
                  >
                    {message.type === 'system' && (
                      <div className="text-xs font-medium text-yellow-300 mb-1">
                        System
                      </div>
                    )}
                    {message.type === 'assistant' && (
                      <div className="text-xs font-medium text-blue-300 mb-1">
                        Claude
                        {message.isStreaming && (
                          <span className="ml-2 inline-flex items-center">
                            <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse"></div>
                            <div
                              className="w-1 h-1 bg-blue-400 rounded-full animate-pulse ml-1"
                              style={{ animationDelay: '0.2s' }}
                            ></div>
                            <div
                              className="w-1 h-1 bg-blue-400 rounded-full animate-pulse ml-1"
                              style={{ animationDelay: '0.4s' }}
                            ></div>
                          </span>
                        )}
                      </div>
                    )}
                    <div className="text-sm whitespace-pre-wrap">
                      {message.content}
                    </div>
                    <div className="text-xs opacity-70 mt-1">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
              {isExecuting && (
                <div className="flex justify-start">
                  <div className="bg-gray-700 text-gray-100 max-w-[85%] p-3 rounded-lg mr-12">
                    <div className="text-xs font-medium text-blue-300 mb-1">
                      Claude
                    </div>
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                      <div
                        className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0.1s' }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0.2s' }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Prompt Pills */}
          <div className="mb-3">
            <div className="flex flex-wrap gap-2">
              {promptPills.map((pill, index) => {
                const isActive = activePills.has(index)
                return (
                  <button
                    key={index}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 border ${
                      isActive
                        ? themeClasses.pillActive
                        : themeClasses.pillInactive
                    }`}
                    onClick={() => handlePillClick(index, pill.text)}
                    disabled={isExecuting}
                  >
                    <span
                      className={`w-2 h-2 rounded-full transition-colors ${
                        isActive ? themeClasses.pillActiveDot : themeClasses.pillInactiveDot
                      }`}
                    ></span>
                    {pill.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Input Area */}
          <div className="relative">
            <textarea
              className={`${themeClasses.bgInput} border ${themeClasses.borderPrimary} rounded-lg p-4 pr-32 ${themeClasses.textPrimary} placeholder-gray-400 resize-none focus:outline-none ${themeClasses.borderFocus} h-20 min-h-[80px] w-full`}
              onChange={e => setCurrentPrompt(e.target.value)}
              placeholder="Enter your prompt here..."
              value={currentPrompt}
            />

            <div className="absolute right-2 bottom-3 flex gap-1 pointer-events-none">
              {/* Allow pointer events only on buttons */}
              <button
                className={`${themeClasses.btnSecondary} disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 rounded text-sm font-medium transition-colors flex items-center gap-1.5 pointer-events-auto`}
                disabled={
                  !currentPrompt.trim() ||
                  isExecuting ||
                  !projectContext ||
                  claudeStatus.checking
                }
                onClick={handleExecute}
                title={
                  !projectContext
                    ? 'Please select a project first'
                    : claudeStatus.checking
                      ? 'Checking Claude CLI installation...'
                      : 'Execute the prompt'
                }
              >
                <Play className="w-3 h-3" />
                <span className="text-xs">Execute</span>
              </button>

              <button
                className={`${themeClasses.btnPrimary} disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 rounded text-sm font-medium transition-colors flex items-center gap-1.5 pointer-events-auto`}
                disabled={
                  !currentPrompt.trim() ||
                  isExecuting ||
                  !projectContext ||
                  claudeStatus.checking
                }
                onClick={handlePlan}
                title={
                  !projectContext
                    ? 'Please select a project first'
                    : claudeStatus.checking
                      ? 'Checking Claude CLI installation...'
                      : 'Plan the implementation'
                }
              >
                <ClipboardList className="w-3 h-3" />
                <span className="text-xs">Plan</span>
              </button>
            </div>
          </div>

          {/* Status Messages */}
          {!projectContext && (
            <div className="mt-3 text-sm text-yellow-400 bg-yellow-900/20 p-3 rounded-lg">
              ⚠️ No project selected. Please go to the main screen to select a
              project folder and root branch.
            </div>
          )}

          {/* Claude Status */}
          {claudeStatus.checking && (
            <div className="mt-3 text-sm text-blue-400 bg-blue-900/20 p-3 rounded-lg">
              🔍 Checking Claude CLI installation...
            </div>
          )}

          {!claudeStatus.checking && !claudeStatus.installed && (
            <div className="mt-3 text-sm text-orange-400 bg-orange-900/20 p-3 rounded-lg">
              📦 Claude CLI will be installed automatically when you run a
              prompt.
            </div>
          )}

          {!claudeStatus.checking &&
            claudeStatus.installed &&
            !claudeStatus.inPath && (
              <div className="mt-3 text-sm text-yellow-400 bg-yellow-900/20 p-3 rounded-lg">
                ⚡ Claude CLI is installed but not in PATH. Will be configured
                automatically.
              </div>
            )}
        </div>
      </div>
    </div>
  )
}
