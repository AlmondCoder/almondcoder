import { useState, useEffect, useRef } from 'react'
import { ClipboardList, Play, ChevronDown } from 'lucide-react'
import { useTheme, createThemeClasses } from '../../theme/ThemeContext'
import { StreamViewer } from '../StreamViewer'

import type {
  EnhancedPromptHistoryItem,
  ConversationHistory,
  ConversationMessage,
  PromptStatus,
} from '../../../shared/types'

// it should not be project context to have selectedTool and selectedBranch in there.
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
  const [_streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  )

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

  // Prompt pills data should be from .json file present in the project directory.
  const promptPills = [
    {
      label: 'Tailwind Frontend',
      text: 'I need help with frontend development using Tailwind CSS. Please act as an expert frontend developer.',
    },
    {
      label: 'Backend API',
      text: 'I need help with backend API development. Please act as an expert backend developer.',
    },
    {
      label: 'React Component',
      text: 'I need help creating a React component. Please act as an expert React developer.',
    },
    {
      label: 'Database Design',
      text: 'I need help with database design and optimization. Please act as a database expert.',
    },
    {
      label: 'Bug Fix',
      text: 'I have a bug that needs fixing. Please help me debug and resolve this issue.',
    },
  ]

  const [promptHistory, setPromptHistory] = useState<
    EnhancedPromptHistoryItem[]
  >([])
  const [currentConversation, setCurrentConversation] =
    useState<ConversationHistory | null>(null)
  const [activePromptId, setActivePromptId] = useState<string | null>(null)
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(
    '+new'
  )
  const [loadingConversation, setLoadingConversation] = useState<string | null>(
    null
  )
  const [skipConversationLoad, setSkipConversationLoad] = useState(false)

  // AI Tool and Branch selection state
  const [selectedAITool, setSelectedAITool] = useState<
    'claude-code' | 'codex' | 'cursor-cli'
  >('claude-code')
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [availableBranches, setAvailableBranches] = useState<string[]>([])
  const [availableWorktrees, setAvailableWorktrees] = useState<
    Array<{
      promptId: string
      worktreePath: string
      prompt: string
      createdAt: Date
      branch: string
    }>
  >([])
  const [selectedWorktree, setSelectedWorktree] = useState<string | null>(null)
  const [isAIToolDropdownOpen, setIsAIToolDropdownOpen] = useState(false)
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false)

  // Worktree state
  const [currentWorktreePath, setCurrentWorktreePath] = useState<
    string | undefined
  >(undefined)

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

  // Load conversation history when active prompt changes
  useEffect(() => {
    const loadConversation = async () => {
      // Skip loading if we just created this prompt (indicated by skipConversationLoad flag)
      if (skipConversationLoad) {
        console.log('Skipping conversation load - just created this prompt')
        setSkipConversationLoad(false)
        return
      }

      // Clear messages immediately when switching prompts
      if (activePromptId === '+new') {
        console.log('Switching to +new, clearing messages')
        setChatMessages([])
        setCurrentConversation(null)
        setCurrentWorktreePath(undefined)
        setLoadingConversation(null)
        return
      }

      if (
        projectContext?.projectPath &&
        activePromptId &&
        activePromptId !== '+new'
      ) {
        console.log(`Loading conversation for prompt: ${activePromptId}`)

        // Clear existing messages immediately to prevent showing old data
        setChatMessages([])
        setLoadingConversation(activePromptId)

        try {
          const conversation = await window.App.getConversationHistory(
            projectContext.projectPath,
            activePromptId
          )

          console.log(`Loaded conversation for ${activePromptId}:`, {
            messageCount: conversation?.messages?.length || 0,
            hasMessages: !!conversation?.messages,
          })

          if (conversation) {
            // Validate conversation structure
            if (
              !conversation.messages ||
              !Array.isArray(conversation.messages)
            ) {
              console.error(
                'Invalid conversation structure - missing or invalid messages array'
              )
              throw new Error('Invalid conversation file structure')
            }

            const validatedConversation = {
              ...conversation,
              messages: conversation.messages.map((msg: any) => ({
                ...msg,
                timestamp: new Date(msg.timestamp),
              })),
              createdAt: new Date(conversation.createdAt),
              updatedAt: new Date(conversation.updatedAt),
            }

            console.log(
              `Setting ${validatedConversation.messages.length} messages for prompt ${activePromptId}`
            )

            setCurrentConversation(validatedConversation)
            setChatMessages(validatedConversation.messages)

            // Set the worktree path for this conversation
            setCurrentWorktreePath(conversation.worktreePath)
            console.log(
              'Loaded conversation with worktree:',
              conversation.worktreePath
            )
          } else {
            // Conversation file doesn't exist, create empty conversation
            console.log(
              'No conversation file found, creating empty conversation'
            )
            const emptyConversation: ConversationHistory = {
              promptId: activePromptId,
              projectPath: projectContext.projectPath,
              worktreePath: undefined,
              parentWorktreePath: undefined,
              messages: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            }
            setCurrentConversation(emptyConversation)
            setChatMessages([])
            setCurrentWorktreePath(undefined)
          }
        } catch (error) {
          console.error('Error loading conversation history:', error)
          setCurrentConversation(null)
          setChatMessages([])
        } finally {
          setLoadingConversation(null)
        }
      } else {
        // No active prompt, clear everything
        console.log('No active prompt, clearing conversation')
        setCurrentConversation(null)
        setChatMessages([])
        setCurrentWorktreePath(undefined)
        setLoadingConversation(null)
      }
    }

    loadConversation()
  }, [projectContext?.projectPath, activePromptId])

  // Load available branches when project context changes
  useEffect(() => {
    const loadBranches = async () => {
      if (projectContext?.projectPath) {
        try {
          const branches = await window.App.getGitBranches(
            projectContext.projectPath
          )
          setAvailableBranches(branches)
          // Set the selected branch to the current project branch or first available
          const defaultBranch =
            projectContext.selectedBranch || branches[0] || 'main'
          setSelectedBranch(defaultBranch)
        } catch (error) {
          console.error('Error loading branches:', error)
          setAvailableBranches([])
          setSelectedBranch('main')
        }
      } else {
        setAvailableBranches([])
        setSelectedBranch('')
      }
    }

    loadBranches()
  }, [projectContext?.projectPath, projectContext?.selectedBranch])

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
    return `${words.slice(0, maxWords).join(' ')}...`
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

  const addChatMessage = async (
    content: string,
    type: 'user' | 'system' | 'assistant',
    isStreaming = false
  ) => {
    const newMessage: ConversationMessage = {
      id: Date.now().toString(),
      content,
      type,
      timestamp: new Date(),
      isStreaming,
    }
    setChatMessages(prev => [...prev, newMessage])

    console.log('Adding message:', {
      type,
      content: content.substring(0, 50),
      activePromptId,
      projectPath: projectContext?.projectPath,
    })

    // Save to conversation history if we have an active prompt
    if (
      projectContext?.projectPath &&
      activePromptId &&
      activePromptId !== '+new'
    ) {
      try {
        const result = await window.App.addConversationMessage(
          projectContext.projectPath,
          activePromptId,
          newMessage
        )

        if (result && typeof result === 'object' && !result.success) {
          console.error('Failed to save conversation message:', result.error)
          if (type === 'user') {
            console.warn(
              'User message could not be saved to conversation file:',
              result.error
            )
          }
        }
      } catch (error) {
        console.error('Error saving conversation message:', error)
        // Don't show system messages for every failed save, only for critical errors
        if (type === 'user') {
          // Only show warning for user messages since they're most important to preserve
          console.warn('User message could not be saved to conversation file')
        }
      }
    }

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
    content: string,
    isRawData: boolean = false
  ) => {
    setChatMessages(prev =>
      prev.map(msg => {
        if (msg.id === messageId) {
          // Always append for streaming - xterm.js will handle ANSI codes
          return {
            ...msg,
            content: msg.content + content,
          }
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

  const finalizeStreamingMessage = async (
    messageId: string,
    projectPath?: string,
    promptId?: string
  ) => {
    // First, update the UI to mark streaming as false
    setChatMessages(prev =>
      prev.map(msg => {
        if (msg.id === messageId) {
          return { ...msg, isStreaming: false }
        }
        return msg
      })
    )
    setStreamingMessageId(null)

    // Then save the finalized message to conversation history
    if (projectPath && promptId && promptId !== '+new') {
      // Use setTimeout to ensure state has been updated
      setTimeout(async () => {
        setChatMessages(currentMessages => {
          const finalMessage = currentMessages.find(msg => msg.id === messageId)
          if (finalMessage && finalMessage.content.trim()) {
            // Save to conversation history asynchronously
            window.App.addConversationMessage(projectPath, promptId, {
              ...finalMessage,
              isStreaming: false,
            }).catch(error => {
              console.error('Error saving finalized assistant message:', error)
            })
          }
          return currentMessages
        })
      }, 100)
    }
  }

  const savePromptToHistory = async (
    promptText: string,
    branch: string,
    status: PromptStatus = 'busy'
  ): Promise<string | null> => {
    if (!projectContext?.projectPath) return null

    const promptId = Date.now().toString()
    const currentTime = new Date()

    let worktreePath: string | undefined
    let worktreeBranch: string = branch // Default to original branch

    try {
      const worktreeResult = await window.App.createWorktree(
        projectContext.projectPath,
        branch,
        promptText,
        promptId,
        selectedWorktree || undefined
      )

      if (worktreeResult.success) {
        worktreePath = worktreeResult.worktreeInfo.worktreePath
        worktreeBranch = worktreeResult.worktreeInfo.branchName // Use the unique branch name
        setCurrentWorktreePath(worktreePath)
        console.log('Created worktree:', worktreePath)
        console.log('Created unique branch:', worktreeBranch)
        if (selectedWorktree) {
          console.log('Forked from parent worktree:', selectedWorktree)
        }
      } else {
        console.error('Failed to create worktree:', worktreeResult.error)
        // Continue without worktree - conversation file creation should still succeed
      }
    } catch (error) {
      console.error('Error creating worktree:', error)
      // Continue without worktree - conversation file creation should still succeed
    }

    const newPrompt: EnhancedPromptHistoryItem = {
      id: promptId,
      prompt: promptText,
      startExecutionTime: currentTime,
      branch: worktreeBranch, // Use the unique branch name from worktree
      branchStatus: 'active',
      promptHistoryId: promptId,
      status,
      projectPath: projectContext.projectPath,
      worktreePath,
      createdAt: currentTime,
      updatedAt: currentTime,
    }

    const updatedHistory = [newPrompt, ...promptHistory]
    setPromptHistory(updatedHistory)

    // Set flag to skip conversation load since we're creating this prompt
    setSkipConversationLoad(true)

    // Set activePromptId IMMEDIATELY so messages can be saved to the conversation
    setActivePromptId(promptId)
    console.log('Set activePromptId to:', promptId)

    try {
      // Always save prompt first
      await window.App.saveEnhancedPrompt(newPrompt)

      // Create initial conversation history - this should always succeed
      const initialConversation: ConversationHistory = {
        promptId,
        projectPath: projectContext.projectPath,
        worktreePath,
        messages: [],
        createdAt: currentTime,
        updatedAt: currentTime,
      }

      try {
        // Save the parent worktree path to track lineage
        const conversationWithParent: ConversationHistory = {
          ...initialConversation,
          parentWorktreePath: selectedWorktree || undefined,
        }

        await window.App.saveConversationHistory(conversationWithParent)
        setCurrentConversation(conversationWithParent)
        console.log(
          'Successfully created conversation file for prompt:',
          promptId
        )
        if (selectedWorktree) {
          console.log('Saved parent worktree reference:', selectedWorktree)
        }
      } catch (conversationError) {
        console.error('Error creating conversation file:', conversationError)
        // Don't fail the entire operation if conversation file creation fails
        // User can still continue with the prompt execution
      }

      return promptId
    } catch (error) {
      console.error('Error saving enhanced prompt:', error)
      // Even if prompt saving fails, return the promptId so execution can continue
      // The conversation will be maintained in memory
      return promptId
    }
  }

  const updatePromptStatus = async (promptId: string, status: PromptStatus) => {
    if (!projectContext?.projectPath) return

    let updatedHistory = promptHistory.map(prompt => {
      if (prompt.id === promptId) {
        const updatedPrompt = {
          ...prompt,
          status,
          updatedAt: new Date(),
        }
        return updatedPrompt
      }
      return prompt
    })
    setPromptHistory(updatedHistory)

    try {
      const promptToUpdate = updatedHistory.find(p => p.id === promptId)
      if (promptToUpdate) {
        await window.App.updateEnhancedPrompt(promptToUpdate)

        // Update branch status if prompt is completed
        if (status === 'completed' && projectContext) {
          const branchStatus = await window.App.getCurrentBranchStatus(
            projectContext.projectPath,
            promptToUpdate.branch
          )

          // Update the history with the new branch status
          updatedHistory = updatedHistory.map(prompt => {
            if (prompt.id === promptId) {
              return {
                ...prompt,
                branchStatus,
              }
            }
            return prompt
          })
          setPromptHistory(updatedHistory)

          // Save the updated prompt with branch status
          const finalPrompt = updatedHistory.find(p => p.id === promptId)
          if (finalPrompt) {
            await window.App.updateEnhancedPrompt(finalPrompt)
          }
        }
      }
    } catch (error) {
      console.error('Error updating enhanced prompt:', error)
    }
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
        }
        // If empty, set the text directly
        return text
      })
    }

    setActivePills(newActivePills)
    // Set to New Prompt when user makes changes
    setSelectedPromptId('+new')
  }

  const installClaudeIfNeeded = async () => {
    // If Claude is not installed, install it
    if (!claudeStatus.installed) {
      setClaudeStatus(prev => ({ ...prev, installing: true }))

      try {
        const installResult = await window.App.installClaude()
        if (installResult.success) {
          setClaudeStatus(prev => ({
            ...prev,
            installed: true,
            installing: false,
          }))
        } else {
          setClaudeStatus(prev => ({ ...prev, installing: false }))
          return false
        }
      } catch (error: any) {
        setClaudeStatus(prev => ({ ...prev, installing: false }))
        return false
      }
    }

    // If Claude is installed but not in PATH, set up PATH
    if (claudeStatus.installed && !claudeStatus.inPath) {
      try {
        const pathResult = await window.App.setupClaudePath()
        if (pathResult.success) {
          setClaudeStatus(prev => ({ ...prev, inPath: true }))
        }
      } catch (error: any) {
        // Silent fail - will use full path
      }
    }

    return true
  }

  const handlePlan = async () => {
    if (!currentPrompt.trim() || !projectContext) return

    // Store the prompt text before clearing
    const promptText = currentPrompt

    // Clear the input immediately and show user message
    setCurrentPrompt('')
    setIsExecuting(true)

    // Add user message immediately to chat
    const userMessage: ConversationMessage = {
      id: Date.now().toString(),
      content: promptText,
      type: 'user',
      timestamp: new Date(),
      isStreaming: false,
    }
    setChatMessages(prev => [...prev, userMessage])

    // Ensure we have a valid branch, create 'main' if none exists
    let currentBranch =
      selectedBranch || projectContext.selectedBranch || 'main'

    // IMPORTANT: Initialize repository BEFORE creating worktree
    try {
      // Check if the repository has any commits
      let hasCommits = true
      try {
        await window.App.executeCommand(
          'git rev-parse HEAD',
          projectContext.projectPath
        )
      } catch (error) {
        // No commits yet in this repository
        hasCommits = false
        console.log('Repository has no commits yet')
      }

      // If no commits, create an initial commit first
      if (!hasCommits) {
        console.log('Creating initial commit...')
        try {
          // Create a .gitkeep file to have something to commit
          await window.App.executeCommand(
            'touch .gitkeep && git add .gitkeep && git commit -m "Initial commit"',
            projectContext.projectPath
          )
        } catch (commitError) {
          console.error('Error creating initial commit:', commitError)
          // Try alternative method: commit with --allow-empty
          try {
            await window.App.executeCommand(
              'git commit --allow-empty -m "Initial commit"',
              projectContext.projectPath
            )
          } catch (emptyCommitError) {
            console.error('Error creating empty commit:', emptyCommitError)
            // Continue without branch initialization - worktree will fail but we can still proceed
            console.warn('Could not create initial commit, continuing anyway')
          }
        }
      }

      // Now check if the branch exists
      const branches = await window.App.getGitBranches(
        projectContext.projectPath
      )
      if (!branches.includes(currentBranch)) {
        // If the selected branch doesn't exist, try to create 'main'
        if (currentBranch !== 'main') {
          console.log(
            `Branch "${currentBranch}" doesn't exist, falling back to 'main'`
          )
          currentBranch = 'main'
        }

        // If 'main' doesn't exist either, create it
        if (!branches.includes('main')) {
          console.log('Creating main branch as it does not exist')
          try {
            // First check what branch we're on
            const currentBranchName = await window.App.executeCommand(
              'git rev-parse --abbrev-ref HEAD',
              projectContext.projectPath
            )

            if (currentBranchName.trim() === 'main') {
              console.log('Already on main branch')
            } else {
              // Rename current branch to main
              await window.App.executeCommand(
                'git branch -M main',
                projectContext.projectPath
              )
            }
          } catch (branchError) {
            console.error('Error creating main branch:', branchError)
            // Fallback: try checkout -b
            try {
              await window.App.executeCommand(
                'git checkout -b main',
                projectContext.projectPath
              )
            } catch (checkoutError) {
              console.error('Error with checkout -b:', checkoutError)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking/creating branch:', error)
    }

    // Check if we already have an active conversation with a worktree
    let promptId = activePromptId
    const isNewConversation = !promptId || promptId === '+new'

    if (isNewConversation) {
      // Create new prompt and worktree only for new conversations
      promptId = await savePromptToHistory(promptText, currentBranch, 'busy')
    }

    // Save user message to conversation history
    if (promptId && promptId !== '+new') {
      try {
        await window.App.addConversationMessage(
          projectContext.projectPath,
          promptId,
          userMessage
        )
      } catch (error) {
        console.error('Error saving user message:', error)
      }
    }

    // Check and install Claude if needed (only for claude-code)
    if (selectedAITool === 'claude-code') {
      const claudeReady = await installClaudeIfNeeded()
      if (!claudeReady) {
        setIsExecuting(false)
        if (promptId) updatePromptStatus(promptId, 'old')
        return
      }
    }

    try {
      // Use worktree path if available, otherwise fall back to project path
      const workingDirectory = currentWorktreePath || projectContext.projectPath

      // Generate command based on selected AI tool (without cd since we're setting working directory)
      let command: string
      if (selectedAITool === 'claude-code') {
        const claudeCmd = claudeStatus.inPath
          ? 'claude'
          : '$HOME/.local/bin/claude'

        // Check if we have an existing session to resume
        const hasSession = currentConversation?.aiSessionId
        if (hasSession) {
          command = `${claudeCmd} -r "${currentConversation.aiSessionId}" "${promptText}"`
        } else {
          command = `${claudeCmd} "${promptText}" --allowedTools "Bash,Read" --permission-mode acceptEdits`
        }
      } else if (selectedAITool === 'codex') {
        command = `codex "${promptText}"`
      } else {
        command = `cursor "${promptText}"`
      }

      // Start streaming message
      const assistantMessage: ConversationMessage = {
        id: Date.now().toString(),
        content: '',
        type: 'assistant',
        timestamp: new Date(),
        isStreaming: true,
      }
      const messageId = assistantMessage.id
      setChatMessages(prev => [...prev, assistantMessage])
      setStreamingMessageId(messageId)

      try {
        const output = await window.App.executeCommandStream(
          command,
          data => {
            if (data.type === 'stdout' || data.type === 'stderr') {
              // Helper function to strip ANSI escape codes
              const stripAnsi = (str: string): string => {
                return str.replace(
                  // eslint-disable-next-line no-control-regex
                  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
                  ''
                )
              }

              // Check if this is meaningful content
              const cleanData = stripAnsi(data.data).trim()

              // Only show messages that contain Claude's response indicator
              const hasClaudeResponse = cleanData.includes('⏺')

              // Only process messages with Claude's response
              if (hasClaudeResponse) {
                const timestamp = new Date().toISOString()
                console.log(`[${timestamp}] Important message:`, {
                  type: data.type,
                  cleanData: cleanData,
                  dataLength: data.data.length,
                  cleanLength: cleanData.length,
                })
                console.log(`[${timestamp}] Content:`, cleanData)

                // Send to viewer
                updateStreamingMessage(messageId, data.data, true)
              }
            }
          },
          workingDirectory
        )
        console.log('Planning command output:', output)

        // Finalize the streaming message and save to conversation history
        await finalizeStreamingMessage(
          messageId,
          projectContext?.projectPath,
          promptId || undefined
        )

        // Capture AI session ID if this was the first message (handlePlan)
        if (
          promptId &&
          projectContext?.projectPath &&
          !currentConversation?.aiSessionId &&
          selectedAITool === 'claude-code'
        ) {
          try {
            const result = await window.App.captureAiSessionId(
              projectContext.projectPath,
              selectedAITool
            )
            if (result.success && result.sessionId) {
              console.log('Captured AI session ID:', result.sessionId)
              // Update the conversation with the session ID
              const updatedConversation: ConversationHistory = {
                ...currentConversation!,
                aiSessionId: result.sessionId,
                updatedAt: new Date(),
              }
              setCurrentConversation(updatedConversation)
              await window.App.saveConversationHistory(updatedConversation)
            }
          } catch (error) {
            console.error('Error capturing AI session ID:', error)
          }
        }

        // Update prompt status to completed
        if (promptId) updatePromptStatus(promptId, 'completed')

        // If no output was streamed, show a message
        setChatMessages(currentMessages => {
          const finalMessage = currentMessages.find(msg => msg.id === messageId)
          if (!finalMessage?.content.trim()) {
            return currentMessages.map(msg =>
              msg.id === messageId
                ? { ...msg, content: 'Plan completed but produced no output.' }
                : msg
            )
          }
          return currentMessages
        })
      } catch (streamError) {
        // Handle streaming errors
        updateStreamingMessage(messageId, `\n\nError: ${streamError}`)
        await finalizeStreamingMessage(
          messageId,
          projectContext?.projectPath,
          promptId || undefined
        )
        if (promptId) updatePromptStatus(promptId, 'old')
        throw streamError
      }
    } catch (error: any) {
      addChatMessage(
        `Error during planning: ${error?.message || error}`,
        'system'
      )
      if (promptId) updatePromptStatus(promptId, 'old')
    } finally {
      setIsExecuting(false)
    }
  }

  const handleExecute = async () => {
    if (!currentPrompt.trim() || !projectContext) return

    // Store the prompt text before clearing
    const promptText = currentPrompt

    // Clear the input immediately and show user message
    setCurrentPrompt('')
    setIsExecuting(true)

    // Add user message immediately to chat
    const userMessage: ConversationMessage = {
      id: Date.now().toString(),
      content: promptText,
      type: 'user',
      timestamp: new Date(),
      isStreaming: false,
    }
    setChatMessages(prev => [...prev, userMessage])

    // Ensure we have a valid branch, create 'main' if none exists
    let currentBranch =
      selectedBranch || projectContext.selectedBranch || 'main'

    // IMPORTANT: Initialize repository BEFORE creating worktree
    try {
      // Check if the repository has any commits
      let hasCommits = true
      try {
        await window.App.executeCommand(
          'git rev-parse HEAD',
          projectContext.projectPath
        )
      } catch (error) {
        // No commits yet in this repository
        hasCommits = false
        console.log('Repository has no commits yet')
      }

      // If no commits, create an initial commit first
      if (!hasCommits) {
        console.log('Creating initial commit...')
        try {
          // Create a .gitkeep file to have something to commit
          await window.App.executeCommand(
            'touch .gitkeep && git add .gitkeep && git commit -m "Initial commit"',
            projectContext.projectPath
          )
        } catch (commitError) {
          console.error('Error creating initial commit:', commitError)
          // Try alternative method: commit with --allow-empty
          try {
            await window.App.executeCommand(
              'git commit --allow-empty -m "Initial commit"',
              projectContext.projectPath
            )
          } catch (emptyCommitError) {
            console.error('Error creating empty commit:', emptyCommitError)
            throw new Error('Could not create initial commit')
          }
        }
      }

      // Now check if the branch exists
      const branches = await window.App.getGitBranches(
        projectContext.projectPath
      )
      if (!branches.includes(currentBranch)) {
        // If the selected branch doesn't exist, try to create 'main'
        if (currentBranch !== 'main') {
          console.log(
            `Branch "${currentBranch}" doesn't exist, falling back to 'main'`
          )
          currentBranch = 'main'
        }

        // If 'main' doesn't exist either, create it
        if (!branches.includes('main')) {
          console.log('Creating main branch as it does not exist')
          try {
            // First check what branch we're on
            const currentBranchName = await window.App.executeCommand(
              'git rev-parse --abbrev-ref HEAD',
              projectContext.projectPath
            )

            if (currentBranchName.trim() === 'main') {
              console.log('Already on main branch')
            } else {
              // Rename current branch to main
              await window.App.executeCommand(
                'git branch -M main',
                projectContext.projectPath
              )
            }
          } catch (branchError) {
            console.error('Error creating main branch:', branchError)
            // Fallback: try checkout -b
            await window.App.executeCommand(
              'git checkout -b main',
              projectContext.projectPath
            )
          }
        }
      }
    } catch (error) {
      console.error('Error checking/creating branch:', error)
    }

    // Check if we already have an active conversation with a worktree
    let promptId = activePromptId
    const isNewConversation = !promptId || promptId === '+new'

    if (isNewConversation) {
      // Create new prompt and worktree only for new conversations
      promptId = await savePromptToHistory(promptText, currentBranch, 'busy')
    }

    // Save user message to conversation history
    if (promptId && promptId !== '+new') {
      try {
        await window.App.addConversationMessage(
          projectContext.projectPath,
          promptId,
          userMessage
        )
      } catch (error) {
        console.error('Error saving user message:', error)
      }
    }

    // Check and install Claude if needed (only for claude-code)
    if (selectedAITool === 'claude-code') {
      const claudeReady = await installClaudeIfNeeded()
      if (!claudeReady) {
        setIsExecuting(false)
        if (promptId) updatePromptStatus(promptId, 'old')
        return
      }
    }

    try {
      // Use worktree path if available, otherwise fall back to project path
      const workingDirectory = currentWorktreePath || projectContext.projectPath

      // If using worktree, we're already on the correct branch and in an isolated workspace
      if (currentWorktreePath) {
        // Already in worktree, no need to create branch
      } else {
        // Fallback to original git branch logic for non-worktree execution
        await window.App.executeCommand(
          `git checkout ${currentBranch}`,
          projectContext.projectPath
        )

        // Create sanitized branch name
        const branchName = promptText
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, '-')
          .substring(0, 50)
          .replace(/^-+|-+$/g, '') // Remove leading/trailing dashes

        // Create new git branch from the selected root branch
        await window.App.executeCommand(
          `git checkout -b "${branchName}"`,
          projectContext.projectPath
        )
      }

      // Generate command based on selected AI tool (without cd since we're setting working directory)
      let command: string
      if (selectedAITool === 'claude-code') {
        const claudeCmd = claudeStatus.inPath
          ? 'claude'
          : '$HOME/.local/bin/claude'

        // Check if we have an existing session to resume
        const hasSession = currentConversation?.aiSessionId
        console.log(currentConversation)
        if (hasSession) {
          command = `${claudeCmd} -r "${currentConversation.aiSessionId}" "${promptText}" --allowedTools "Bash,Read" --permission-mode acceptEdits`
        } else {
          command = `${claudeCmd} "${promptText}" --allowedTools "Bash,Read" --permission-mode acceptEdits`
        }
      } else if (selectedAITool === 'codex') {
        command = `codex "${promptText}"`
      } else {
        // cursor-cli
        command = `cursor "${promptText}"`
      }

      // Start streaming message
      const assistantMessage: ConversationMessage = {
        id: Date.now().toString(),
        content: '',
        type: 'assistant',
        timestamp: new Date(),
        isStreaming: true,
      }
      const messageId = assistantMessage.id
      setChatMessages(prev => [...prev, assistantMessage])
      setStreamingMessageId(messageId)

      try {
        const output = await window.App.executeCommandStream(
          command,
          data => {
            // Update the streaming message with new data
            if (data.type === 'stdout' || data.type === 'stderr') {
              // Helper function to strip ANSI escape codes
              const stripAnsi = (str: string): string => {
                return str.replace(
                  // eslint-disable-next-line no-control-regex
                  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
                  ''
                )
              }

              // Check if this is meaningful content
              const cleanData = stripAnsi(data.data).trim()

              // Only show messages that contain Claude's response indicator
              const hasClaudeResponse = cleanData.includes('⏺')

              // Only process messages with Claude's response
              if (hasClaudeResponse) {
                const timestamp = new Date().toISOString()
                console.log(`[${timestamp}] Important message:`, {
                  type: data.type,
                  cleanData: cleanData,
                  dataLength: data.data.length,
                  cleanLength: cleanData.length,
                })
                console.log(`[${timestamp}] Content:`, cleanData)

                // Send to viewer
                updateStreamingMessage(messageId, data.data, true)
              }
            }
          },
          workingDirectory
        )

        console.log('Execution command output:', output)

        // Finalize the streaming message and save to conversation history
        await finalizeStreamingMessage(
          messageId,
          projectContext?.projectPath,
          promptId || undefined
        )

        // Capture AI session ID if this was the first message (handleExecute)
        if (
          promptId &&
          projectContext?.projectPath &&
          !currentConversation?.aiSessionId &&
          selectedAITool === 'claude-code'
        ) {
          try {
            const result = await window.App.captureAiSessionId(
              projectContext.projectPath,
              selectedAITool
            )
            if (result.success && result.sessionId) {
              console.log('Captured AI session ID:', result.sessionId)
              // Update the conversation with the session ID
              const updatedConversation: ConversationHistory = {
                ...currentConversation!,
                aiSessionId: result.sessionId,
                updatedAt: new Date(),
              }
              setCurrentConversation(updatedConversation)
              await window.App.saveConversationHistory(updatedConversation)
            }
          } catch (error) {
            console.error('Error capturing AI session ID:', error)
          }
        }

        // Update prompt status to completed
        if (promptId) updatePromptStatus(promptId, 'completed')

        // If no output was streamed, show a message
        setChatMessages(currentMessages => {
          const finalMessage = currentMessages.find(msg => msg.id === messageId)
          if (!finalMessage?.content.trim()) {
            return currentMessages.map(msg =>
              msg.id === messageId
                ? {
                    ...msg,
                    content: 'Command executed but produced no output.',
                  }
                : msg
            )
          }
          return currentMessages
        })
      } catch (error) {
        // Handle streaming errors
        updateStreamingMessage(messageId, `\n\nError: ${error}`)
        await finalizeStreamingMessage(
          messageId,
          projectContext?.projectPath,
          promptId || undefined
        )
        if (promptId) updatePromptStatus(promptId, 'old')
        throw error
      }
    } catch (error: any) {
      console.error('Error during execution:', error)
      if (promptId) updatePromptStatus(promptId, 'old')
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div
      className={`flex h-full ${themeClasses.bgPrimary} ${themeClasses.textPrimary}`}
    >
      {/* First Section - Prompt History (20% width) */}
      <div
        className={`w-1/5 border-r ${themeClasses.borderPrimary} p-4 overflow-y-auto`}
      >
        <h3
          className={`text-md font-semibold mb-4 ${themeClasses.textPrimary}`}
        >
          Prompt History
        </h3>
        <div className="space-y-3">
          {/* +New Prompt Option */}
          <button
            className={`${selectedPromptId === '+new' ? themeClasses.bgInput : themeClasses.bgSecondary} rounded-lg p-3 cursor-pointer border-2 ${selectedPromptId === '+new' ? themeClasses.borderFocus : 'border-transparent'} hover:${themeClasses.bgInput} transition-colors w-full text-left`}
            onClick={() => {
              console.log('Clicked +New Prompt')
              setSelectedPromptId('+new')
              setActivePromptId('+new')
              setCurrentPrompt('')
              setChatMessages([])
              setCurrentConversation(null)
              setCurrentWorktreePath(undefined)
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

          {/* Existing Prompts */}
          {promptHistory.map(prompt => {
            const isExpanded = expandedPrompts.has(prompt.id)
            const isSelected = selectedPromptId === prompt.id
            const displayText = isExpanded
              ? prompt.prompt
              : truncatePrompt(prompt.prompt)
            const needsTruncation = prompt.prompt.split(' ').length > 20

            return (
              <button
                className={`${isSelected ? themeClasses.bgInput : themeClasses.bgSecondary} rounded-lg p-3 cursor-pointer border-2 ${isSelected ? themeClasses.borderFocus : 'border-transparent'} hover:${themeClasses.bgInput} transition-colors w-full text-left ${loadingConversation === prompt.id ? 'opacity-50' : ''}`}
                disabled={loadingConversation === prompt.id}
                key={prompt.id}
                onClick={() => {
                  if (loadingConversation) return // Prevent clicking while loading
                  setSelectedPromptId(prompt.id)
                  setActivePromptId(prompt.id)
                }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${getStatusColor(prompt.status)} mt-1 flex-shrink-0`}
                    />
                    {loadingConversation === prompt.id && (
                      <div className="flex items-center space-x-1">
                        <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"></div>
                        <div
                          className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"
                          style={{ animationDelay: '0.1s' }}
                        ></div>
                        <div
                          className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"
                          style={{ animationDelay: '0.2s' }}
                        ></div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`text-xs ${themeClasses.textTertiary}`}>
                      {prompt.createdAt.toLocaleDateString()}
                    </span>
                    <span className={`text-xs ${themeClasses.textTertiary}`}>
                      {prompt.branch}
                    </span>
                  </div>
                </div>
                <p
                  className={`text-sm ${themeClasses.textSecondary} ${needsTruncation ? `cursor-pointer hover:${themeClasses.textPrimary}` : ''}`}
                  onClick={e => {
                    if (needsTruncation) {
                      e.stopPropagation()
                      togglePromptExpansion(prompt.id)
                    }
                  }}
                  onKeyDown={e => {
                    if (
                      needsTruncation &&
                      (e.key === 'Enter' || e.key === ' ')
                    ) {
                      e.stopPropagation()
                      togglePromptExpansion(prompt.id)
                    }
                  }}
                  role={needsTruncation ? 'button' : undefined}
                  tabIndex={needsTruncation ? 0 : -1}
                >
                  {displayText}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Second Section - Input Area (45% width) */}
      <div className="w-4/5 p-6 flex flex-col">
        <h3
          className={`text-lg font-semibold mb-4 ${themeClasses.textPrimary}`}
        >
          {selectedPromptId === '+new' ? 'New Prompt' : 'Selected Prompt'}
        </h3>
        {chatMessages.length === 0 && (
          <div
            className={`mb-6 ${themeClasses.bgCard} border ${themeClasses.borderPrimary} rounded-lg p-6`}
          >
            <h1
              className={`text-2xl font-bold ${themeClasses.textPrimary} mb-4 border-b ${themeClasses.borderSecondary} pb-2`}
            >
              Welcome to AlmondCoder
            </h1>

            <div className="prose prose-invert max-w-none">
              <p
                className={`${themeClasses.textSecondary} mb-4 leading-relaxed`}
              >
                Type your coding instructions in the box below. Click on{' '}
                <strong>Plan</strong> to think through the implementation, which
                you can later edit, before executing the plan.
              </p>

              <h3
                className={`text-lg font-semibold ${themeClasses.textPrimary} mt-4 mb-2`}
              >
                Getting Started
              </h3>
              <ul className={`${themeClasses.textSecondary} space-y-1 ml-4`}>
                <li>
                  • Use the input box below to describe what you want to build
                </li>
                <li>
                  • Click{' '}
                  <code
                    className={`${themeClasses.bgTertiary} px-1 py-0.5 rounded text-sm ${themeClasses.textAccent}`}
                  >
                    Plan
                  </code>{' '}
                  to preview the implementation strategy
                </li>
                <li>
                  • Click{' '}
                  <code
                    className={`${themeClasses.bgTertiary} px-1 py-0.5 rounded text-sm text-green-400`}
                  >
                    Execute
                  </code>{' '}
                  to run the changes
                </li>
              </ul>

              <h3
                className={`text-lg font-semibold ${themeClasses.textPrimary} mt-4 mb-2`}
              >
                Prompt Pills
              </h3>
              <p
                className={`${themeClasses.textSecondary} mb-3 leading-relaxed`}
              >
                Quick templates above the input box for common development
                tasks.
              </p>

              <h4
                className={`text-sm font-medium ${themeClasses.textPrimary} mb-2`}
              >
                Examples:
              </h4>
              <ul
                className={`${themeClasses.textSecondary} space-y-1 ml-4 mb-3`}
              >
                <li>
                  •{' '}
                  <code
                    className={`${themeClasses.bgTertiary} px-1 py-0.5 rounded text-xs text-purple-400`}
                  >
                    Tailwind Frontend
                  </code>{' '}
                  - Frontend developer with Tailwind CSS expertise
                </li>
                <li>
                  •{' '}
                  <code
                    className={`${themeClasses.bgTertiary} px-1 py-0.5 rounded text-xs text-purple-400`}
                  >
                    Backend API
                  </code>{' '}
                  - Backend developer for API development
                </li>
                <li>
                  •{' '}
                  <code
                    className={`${themeClasses.bgTertiary} px-1 py-0.5 rounded text-xs text-purple-400`}
                  >
                    React Component
                  </code>{' '}
                  - React component development specialist
                </li>
              </ul>

              <blockquote
                className={`border-l-4 ${themeClasses.borderSecondary} pl-4 ${themeClasses.textTertiary} italic text-sm`}
              >
                <strong>Tip:</strong> Customize these prompts for your project
                needs. They'll be saved in your .git repository for team
                collaboration.
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
                      <div className="text-xs font-medium text-blue-300 mb-2">
                        Claude
                      </div>
                    )}
                    {message.type === 'assistant' ? (
                      <StreamViewer
                        content={message.content}
                        isStreaming={message.isStreaming}
                      />
                    ) : (
                      <div className="text-sm whitespace-pre-wrap">
                        {message.content}
                      </div>
                    )}
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
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 border ${
                      isActive
                        ? themeClasses.pillActive
                        : themeClasses.pillInactive
                    }`}
                    disabled={isExecuting}
                    key={index}
                    onClick={() => handlePillClick(index, pill.text)}
                  >
                    <span
                      className={`w-2 h-2 rounded-full transition-colors ${
                        isActive
                          ? themeClasses.pillActiveDot
                          : themeClasses.pillInactiveDot
                      }`}
                    ></span>
                    {pill.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Input Area */}
          <div className="space-y-3">
            {/* Textarea */}
            <div className="relative">
              <textarea
                className={`${themeClasses.bgInput} border ${themeClasses.borderPrimary} rounded-lg p-4 pl-4 pr-4 ${themeClasses.textPrimary} placeholder-gray-400 resize-none focus:outline-none ${themeClasses.borderFocus} h-32 min-h-[128px] w-full`}
                onChange={e => {
                  setCurrentPrompt(e.target.value)
                  // Set to New Prompt when user types
                  if (selectedPromptId !== '+new') {
                    setSelectedPromptId('+new')
                  }
                }}
                placeholder="Enter your prompt here..."
                value={currentPrompt}
              />

              {/* Left side dropdowns */}
              <div className="absolute left-2 bottom-3 flex gap-1 pointer-events-none">
                {/* AI Tool Dropdown */}
                <div className="relative pointer-events-auto">
                  <button
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm font-medium text-gray-200 hover:border-gray-500 focus:outline-none focus:border-orange-500 min-w-[100px] flex items-center justify-between transition-all"
                    onClick={() => {
                      setIsAIToolDropdownOpen(!isAIToolDropdownOpen)
                      setIsBranchDropdownOpen(false)
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-orange-400">✦</span>
                      <span className="text-xs">
                        {selectedAITool === 'claude-code'
                          ? 'Claude Code'
                          : selectedAITool === 'codex'
                            ? 'Codex'
                            : 'Cursor'}
                      </span>
                    </div>
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </button>

                  {isAIToolDropdownOpen && (
                    <div className="absolute bottom-full left-0 mb-2 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-20 min-w-[220px] max-w-sm">
                      {/* Claude Code */}
                      <button
                        className={`w-full text-left px-4 py-3 hover:bg-gray-700 first:rounded-t-lg transition-colors ${selectedAITool === 'claude-code' ? 'bg-gray-700' : ''}`}
                        onClick={() => {
                          setSelectedAITool('claude-code')
                          setIsAIToolDropdownOpen(false)
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-orange-400 text-lg">✦</span>
                          <div>
                            <div className="text-gray-200 font-medium">
                              Claude Code
                            </div>
                          </div>
                          {selectedAITool === 'claude-code' && (
                            <div className="ml-auto">
                              <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                            </div>
                          )}
                        </div>
                      </button>

                      {/* Codex */}
                      <button
                        className={`w-full text-left px-4 py-3 hover:bg-gray-700 transition-colors ${selectedAITool === 'codex' ? 'bg-gray-700' : ''}`}
                        onClick={() => {
                          setSelectedAITool('codex')
                          setIsAIToolDropdownOpen(false)
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-blue-400 text-lg">✦</span>
                          <div>
                            <div className="text-gray-200 font-medium">
                              Codex
                            </div>
                          </div>
                          {selectedAITool === 'codex' && (
                            <div className="ml-auto">
                              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                            </div>
                          )}
                        </div>
                      </button>

                      {/* Cursor */}
                      <button
                        className={`w-full text-left px-4 py-3 hover:bg-gray-700 last:rounded-b-lg transition-colors ${selectedAITool === 'cursor-cli' ? 'bg-gray-700' : ''}`}
                        onClick={() => {
                          setSelectedAITool('cursor-cli')
                          setIsAIToolDropdownOpen(false)
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-purple-400 text-lg">✦</span>
                          <div>
                            <div className="text-gray-200 font-medium">
                              Cursor
                            </div>
                          </div>
                          {selectedAITool === 'cursor-cli' && (
                            <div className="ml-auto">
                              <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                            </div>
                          )}
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                {/* Branch Dropdown */}
                <div className="relative pointer-events-auto">
                  <button
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm font-medium text-gray-200 hover:border-gray-500 focus:outline-none focus:border-orange-500 min-w-[90px] flex items-center justify-between transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={availableBranches.length === 0}
                    onClick={() => {
                      setIsBranchDropdownOpen(!isBranchDropdownOpen)
                      setIsAIToolDropdownOpen(false)
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-green-400 text-xs">🌿</span>
                      <span className="text-xs truncate max-w-[60px]">
                        {selectedBranch || 'No branch'}
                      </span>
                    </div>
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </button>

                  {isBranchDropdownOpen && availableBranches.length > 0 && (
                    <div className="absolute bottom-full left-0 mb-2 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-20 min-w-[280px] max-h-48 overflow-y-auto">
                      {availableBranches.map(branch => (
                        <button
                          className={`w-full text-left px-4 py-3 hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg transition-colors ${branch === selectedBranch ? 'bg-gray-700' : ''}`}
                          key={branch}
                          onClick={() => {
                            setSelectedBranch(branch)
                            setSelectedWorktree(null)
                            setIsBranchDropdownOpen(false)
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-green-400">🌿</span>
                            <div className="text-gray-200 font-medium">
                              {branch}
                            </div>
                            {branch === selectedBranch && (
                              <div className="ml-auto">
                                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right side buttons */}
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
