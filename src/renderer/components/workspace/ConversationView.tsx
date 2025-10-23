import { useState, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  ClipboardList,
  Play,
  ChevronDown,
  ArrowUp,
  FileEdit,
  BookOpen,
  Terminal,
  ListTodo,
  Search,
  FolderOpen,
  Globe,
  CheckSquare,
  Notebook,
  Zap,
  XCircle,
  Wrench,
  Plus,
  X
} from 'lucide-react'
import { useTheme, createThemeClasses } from '../../theme/ThemeContext'
import { PromptInput } from './PromptInput'
import type {
  ConversationHistory,
  EnhancedPromptHistoryItem,
  PendingPermission,
  ToolPermissionRequest,
  BusyConversation,
  TodoItem,
  TodoList,
} from '../../../shared/types'
import { playNotificationSound } from '../../utils/notificationSound'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { detectLanguageFromPath } from '../../utils/languageDetection'

interface ProjectContext {
  projectPath: string
  selectedTool: string
  selectedBranch: string
}

interface ConversationViewProps {
  projectContext?: ProjectContext
  selectedConversation: ConversationHistory
  setSelectedConversation: (conversation: ConversationHistory) => void
  availableBranches: string[]
  getAvailableBranchesForNewPrompt: () => string[]
  isPromptBusy: (promptId: string | null) => boolean
  newConversation: () => ConversationHistory
  busyConversations: Map<string, BusyConversation>
  setBusyConversations: (
    conversations:
      | Map<string, BusyConversation>
      | ((prev: Map<string, BusyConversation>) => Map<string, BusyConversation>)
  ) => void
  promptHistory: EnhancedPromptHistoryItem[]
  setPromptHistory: (history: EnhancedPromptHistoryItem[]) => void
  loadAndProcessPromptHistory: (projectPath: string) => Promise<void>
}

interface ChatMessage {
  id: string
  type:
    | 'init'
    | 'text'
    | 'tool_use'
    | 'tool_result'
    | 'result'
    | 'permission_request'
    | 'permission_response'
  timestamp: Date

  // For text messages
  text?: string
  isUser?: boolean // Distinguish user messages from AI messages

  // For tool use
  toolName?: string
  toolInput?: any
  toolUseId?: string

  // For tool results
  toolResult?: string
  isError?: boolean

  // For init messages
  sessionId?: string
  model?: string
  cwd?: string

  // For result messages
  duration?: number
  cost?: number
  numTurns?: number

  // For permission messages
  requestId?: string
  permissionStatus?: 'pending' | 'accepted' | 'cancelled' | 'timeout'
  respondedBy?: 'user' | 'system'
  newPrompt?: string // For cancelled permissions with override
}

enum Response {
  user = 'user',
  system = 'system',
  ai = 'ai',
}

// Helper function to get tool icon component
const getToolIcon = (toolName: string) => {
  const iconMap: Record<string, any> = {
    Write: FileEdit,
    Edit: FileEdit,
    Read: BookOpen,
    Bash: Terminal,
    Task: ListTodo,
    Grep: Search,
    Glob: FolderOpen,
    WebFetch: Globe,
    TodoWrite: CheckSquare,
    NotebookEdit: Notebook,
    SlashCommand: Zap,
    BashOutput: Terminal,
    KillShell: XCircle,
  }
  return iconMap[toolName] || Wrench
}

// Helper function to extract tool description
const getToolDescription = (toolName: string, toolInput: any): string => {
  if (!toolInput) return ''

  switch (toolName) {
    case 'Write':
    case 'Edit':
    case 'Read':
      return toolInput.file_path || ''
    case 'Bash':
      return toolInput.command
        ? toolInput.command.substring(0, 50) +
            (toolInput.command.length > 50 ? '...' : '')
        : toolInput.description || ''
    case 'Task':
      return toolInput.description || ''
    case 'Grep':
      return `"${toolInput.pattern}" in ${toolInput.path || 'files'}`
    case 'Glob':
      return toolInput.pattern || ''
    case 'WebFetch':
      return toolInput.url || ''
    default:
      return ''
  }
}

export function ConversationView({
  projectContext,
  selectedConversation,
  setSelectedConversation,
  availableBranches,
  getAvailableBranchesForNewPrompt,
  isPromptBusy,
  newConversation,
  busyConversations,
  setBusyConversations,
  promptHistory,
  setPromptHistory,
  loadAndProcessPromptHistory,
}: ConversationViewProps) {
  const { theme, themeName } = useTheme()
  const themeClasses = createThemeClasses(theme)
  const isLightTheme = themeName === 'light'

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])

  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [selectedWorktree, setSelectedWorktree] = useState<string | null>(null)
  const [isAutoAcceptEnabled, setIsAutoAcceptEnabled] = useState(false)

  const chatContainerRef = useRef<HTMLDivElement>(null)
  const chatMessagesScrollRef = useRef<HTMLDivElement>(null)
  const selectedConversationRef = useRef(selectedConversation)

  const isNewConversation = selectedConversation.promptId === '+new'

  // Keep ref synchronized with selectedConversation for use in callbacks
  useEffect(() => {
    selectedConversationRef.current = selectedConversation
  }, [selectedConversation])

  // Auto-scroll to bottom when conversation loads or new messages arrive
  useEffect(() => {
    if (chatMessagesScrollRef.current && chatMessages.length > 0) {
      chatMessagesScrollRef.current.scrollTop = chatMessagesScrollRef.current.scrollHeight
    }
  }, [selectedConversation.promptId, chatMessages.length])

  // Set default branch for new conversations
  useEffect(() => {
    if (isNewConversation && !selectedBranch && availableBranches.length > 0) {
      const defaultBranch = availableBranches[0]
      setSelectedBranch(defaultBranch)
      console.log('Set default branch for new conversation:', defaultBranch)
    }
  }, [isNewConversation, selectedBranch, availableBranches])

  // Reset selected branch when switching to a new conversation
  useEffect(() => {
    if (isNewConversation) {
      setSelectedBranch('')
      console.log('Reset branch selection for new conversation')
    }
  }, [selectedConversation.promptId, isNewConversation])

  // Load conversation messages from the conversation log file (for existing conversations)
  useEffect(() => {
    const loadConversationMessages = async () => {
      if (!isNewConversation && selectedConversation.conversationLogPath) {
        try {
          console.log(
            'Loading conversation from:',
            selectedConversation.conversationLogPath
          )

          const fileContent = await window.App.readConversationLog(
            selectedConversation.conversationLogPath
          )

          if (!fileContent || fileContent.length === 0) {
            setChatMessages([])
            return
          }

          const messages: ChatMessage[] = []
          let lastSessionId: string | undefined = undefined

          fileContent.forEach((entry: any, index: number) => {
            const { timestamp, data, from } = entry

            // Capture session_id from any message that has it
            if (data.content?.session_id) {
              lastSessionId = data.content.session_id
            }

            // 1. Handle user prompt messages (from: "user")
            if (
              from === 'user' &&
              data.content?.type === 'text' &&
              data.content?.text
            ) {
              messages.push({
                id: `user-${index}`,
                type: 'text',
                text: data.content.text,
                isUser: true,
                timestamp: new Date(timestamp),
              })
            }

            // 2. Handle init message (system initialization)
            if (
              data.content?.type === 'system' &&
              data.content?.subtype === 'init'
            ) {
              messages.push({
                id: `init-${index}`,
                type: 'init',
                timestamp: new Date(timestamp),
                sessionId: data.content.session_id,
                model: data.content.model,
                cwd: data.content.cwd,
              })
            }

            // 3. Handle assistant text messages
            if (data.content?.type === 'assistant' && data.content?.message) {
              const messageContent = data.content.message.content || []

              messageContent.forEach((block: any, blockIndex: number) => {
                // Text blocks
                if (block.type === 'text' && block.text) {
                  messages.push({
                    id: `text-${index}-${blockIndex}`,
                    type: 'text',
                    text: block.text,
                    timestamp: new Date(timestamp),
                  })
                }

                // Tool use blocks
                if (block.type === 'tool_use') {
                  messages.push({
                    id: `tool-use-${index}-${blockIndex}`,
                    type: 'tool_use',
                    toolName: block.name,
                    toolInput: block.input,
                    toolUseId: block.id,
                    timestamp: new Date(timestamp),
                  })
                }
              })
            }

            // 4. Handle tool results
            if (data.content?.type === 'user' && data.content?.message) {
              const userContent = data.content.message.content || []

              userContent.forEach((block: any, blockIndex: number) => {
                if (block.type === 'tool_result') {
                  messages.push({
                    id: `tool-result-${index}-${blockIndex}`,
                    type: 'tool_result',
                    toolResult: block.content,
                    toolUseId: block.tool_use_id,
                    isError: block.is_error || false,
                    timestamp: new Date(timestamp),
                  })
                }
              })
            }

            // 5. Handle final result message
            if (data.content?.type === 'result') {
              messages.push({
                id: `result-${index}`,
                type: 'result',
                duration: data.content.duration_ms,
                cost: data.content.total_cost_usd,
                numTurns: data.content.num_turns,
                timestamp: new Date(timestamp),
              })
            }

            // 6. Handle permission request messages
            if (data.content?.type === 'permission_request') {
              messages.push({
                id: `permission-request-${index}`,
                type: 'permission_request',
                requestId: data.content.requestId,
                toolName: data.content.toolName,
                toolInput: data.content.toolInput,
                permissionStatus: data.content.status,
                timestamp: new Date(timestamp),
              })
            }

            // 7. Handle permission response messages (accepted/cancelled)
            if (data.content?.type === 'permission_response') {
              messages.push({
                id: `permission-response-${index}`,
                type: 'permission_response',
                requestId: data.content.requestId,
                toolName: data.content.toolName,
                permissionStatus: data.content.status,
                respondedBy: data.content.respondedBy,
                newPrompt: data.content.newPrompt,
                timestamp: new Date(timestamp),
              })
            }
          })

          setChatMessages(messages)

          // Update selectedConversation with captured session ID
          if (lastSessionId && lastSessionId !== selectedConversation.aiSessionId) {
            console.log('🔑 Loaded session ID from conversation file:', lastSessionId)
            setSelectedConversation({
              ...selectedConversation,
              aiSessionId: lastSessionId
            })
          }
        } catch (error) {
          console.error('Error loading conversation messages:', error)
          setChatMessages([])
        }
      } else {
        // Clear messages for new conversations
        setChatMessages([])
      }
    }

    loadConversationMessages()
  }, [selectedConversation.conversationLogPath, isNewConversation])

  // ============================================================================
  // Permission System Event Listeners
  // ============================================================================
  // LOGIC: Listen for tool permission requests from main process and update
  // the parent's busyConversations state via setBusyConversations to show
  // pending tools in the UI across all conversations (including background ones)
  useEffect(() => {
    // ============================================================================
    // Handle Tool Permission Pending
    // ============================================================================
    // LOGIC: When Claude wants to use a tool and auto-accept is OFF, the main
    // process sends 'tool-permission-pending'. We update the conversation's status
    // to 'waiting_permission' and store the tool details in pendingPermission.
    // We also LOG this to the conversation file so it appears in chat history.
    const handleToolPending = async (request: ToolPermissionRequest) => {
      console.log('🔒 [Permission] Tool pending approval:', request)
      console.log('   Tool:', request.toolName)
      console.log('   Conversation:', request.conversationTitle)
      console.log('   Request ID:', request.requestId)

      // Update busyConversations status to 'waiting_permission'
      setBusyConversations(prev => {
        const updatedMap = new Map(prev)
        const busyConv = updatedMap.get(request.promptId)

        if (busyConv) {
          // Change status from 'running' to 'waiting_permission'
          busyConv.status = 'waiting_permission'

          // Store the pending tool details so UI can display them
          busyConv.pendingPermission = {
            requestId: request.requestId,
            toolName: request.toolName,
            toolInput: request.toolInput,
            timestamp: new Date(request.timestamp),
          }

          updatedMap.set(request.promptId, busyConv)
          console.log(
            '✅ [Permission] Updated conversation status to waiting_permission'
          )

          // ============================================================================
          // Log Permission Request to Conversation File
          // ============================================================================
          // LOGIC: Write to conversation log so when user switches to this conversation
          // (even if it's running in background), they can see the permission request
          // in the chat history
          const conversationLogPath = busyConv.conversation.conversationLogPath
          if (conversationLogPath) {
            updateConversationFile(
              conversationLogPath,
              {
                content: {
                  type: 'permission_request',
                  requestId: request.requestId,
                  toolName: request.toolName,
                  toolInput: request.toolInput,
                  status: 'pending',
                },
              },
              Response.system
            ).catch(err => {
              console.error('❌ Failed to log permission request to file:', err)
            })
          }
        } else {
          console.warn(
            '⚠️  [Permission] No busy conversation found for promptId:',
            request.promptId
          )
        }

        return updatedMap
      })

      // ✨ Play notification sound in frontend (not main process)
      // LOGIC: Alert user that a conversation needs their attention
      playNotificationSound()
    }

    // ============================================================================
    // Handle Tool Permission Timeout
    // ============================================================================
    // LOGIC: If user doesn't respond within 10 minutes, main process sends timeout
    // event. We remove the pending permission and let the conversation continue
    // (it will be denied automatically by the main process).
    const handleToolTimeout = (data: { requestId: string }) => {
      console.log('⏰ [Permission] Tool request timed out:', data.requestId)

      // Find the conversation with this requestId and clear its pending permission
      setBusyConversations(prev => {
        const updatedMap = new Map(prev)

        // Search through all conversations to find the one with this requestId
        for (const [promptId, busyConv] of updatedMap.entries()) {
          if (busyConv.pendingPermission?.requestId === data.requestId) {
            // Clear the pending permission and restore 'running' status
            busyConv.status = 'running'
            busyConv.pendingPermission = undefined
            updatedMap.set(promptId, busyConv)
            console.log(
              '✅ [Permission] Cleared timed-out permission for conversation:',
              promptId
            )
            break
          }
        }

        return updatedMap
      })
    }

    // Register IPC event listeners
    window.App.onToolPermissionPending(handleToolPending)
    window.App.onToolPermissionTimeout(handleToolTimeout)

    // Cleanup on unmount
    return () => {
      console.log('🧹 [Permission] Cleaning up permission event listeners')
      window.App.removeToolPermissionListeners()
    }
  }, []) // ✅ Empty dependency array - listeners registered once on mount


  const ensureGitRepositoryInitialized = async (
    projectPath: string,
    currentBranch: string
  ): Promise<string> => {
    // Check if the repository has any commits
    let hasCommits = true
    try {
      await window.App.executeCommand('git rev-parse HEAD', projectPath)
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
          projectPath
        )
      } catch (commitError) {
        console.error('Error creating initial commit:', commitError)
        // Try alternative method: commit with --allow-empty
        try {
          await window.App.executeCommand(
            'git commit --allow-empty -m "Initial commit"',
            projectPath
          )
        } catch (emptyCommitError) {
          console.error('Error creating empty commit:', emptyCommitError)
          throw new Error('Could not create initial commit')
        }
      }
    }

    // Now check if the branch exists
    const branches = await window.App.getGitBranches(projectPath)
    let finalBranch = currentBranch

    if (!branches.includes(currentBranch)) {
      // If the selected branch doesn't exist, try to create 'main'
      if (currentBranch !== 'main') {
        console.log(
          `Branch "${currentBranch}" doesn't exist, falling back to 'main'`
        )
        finalBranch = 'main'
      }

      // If 'main' doesn't exist either, create it
      if (!branches.includes('main')) {
        console.log('Creating main branch as it does not exist')
        try {
          // First check what branch we're on
          const currentBranchName = await window.App.executeCommand(
            'git rev-parse --abbrev-ref HEAD',
            projectPath
          )

          if (currentBranchName.trim() === 'main') {
            console.log('Already on main branch')
          } else {
            // Rename current branch to main
            await window.App.executeCommand('git branch -M main', projectPath)
          }
        } catch (branchError) {
          console.error('Error creating main branch:', branchError)
          // Fallback: try checkout -b
          await window.App.executeCommand('git checkout -b main', projectPath)
        }
      }
    }

    return finalBranch
  }

  const updateConversationFile = async (
    file: string,
    jsonConversation: any,
    from: Response
  ) => {
    // Append to file this jsonConversation, with timestamp, and from
    try {
      const logEntry = {
        from,
        timestamp: new Date().toISOString(),
        data: jsonConversation,
      }
      await window.App.appendToConversationLog(file, logEntry)
      console.log(
        '✅ Appended conversation entry to file:',
        file,
        'from:',
        from
      )
    } catch (error) {
      console.error('❌ Error appending to conversation file:', error)
    }
  }

  // Convert SDK message to ChatMessage format
  const convertSDKMessageToChatMessage = (sdkMessage: any): ChatMessage[] => {
    const messages: ChatMessage[] = []
    const timestamp = new Date()

    switch (sdkMessage.type) {
      case 'system':
        if (sdkMessage.subtype === 'init') {
          messages.push({
            id: `init-${Date.now()}`,
            type: 'init',
            timestamp,
            sessionId: sdkMessage.session_id,
            model: sdkMessage.model,
            cwd: sdkMessage.cwd,
          })
        }
        break

      case 'assistant':
        // Extract text and tool_use blocks
        sdkMessage.message.content.forEach((block: any, idx: number) => {
          if (block.type === 'text' && block.text) {
            messages.push({
              id: `text-${Date.now()}-${idx}`,
              type: 'text',
              text: block.text,
              timestamp,
            })
          } else if (block.type === 'tool_use') {
            messages.push({
              id: `tool-use-${Date.now()}-${idx}`,
              type: 'tool_use',
              toolName: block.name,
              toolInput: block.input,
              toolUseId: block.id,
              timestamp,
            })
          }
        })
        break

      case 'user':
        // Extract tool results
        sdkMessage.message.content.forEach((block: any, idx: number) => {
          if (block.type === 'tool_result') {
            messages.push({
              id: `tool-result-${Date.now()}-${idx}`,
              type: 'tool_result',
              toolResult: block.content,
              toolUseId: block.tool_use_id,
              isError: block.is_error || false,
              timestamp,
            })
          }
        })
        break

      case 'result':
        messages.push({
          id: `result-${Date.now()}`,
          type: 'result',
          duration: sdkMessage.duration_ms,
          cost: sdkMessage.total_cost_usd,
          numTurns: sdkMessage.num_turns,
          timestamp,
        })
        break
    }

    return messages
  }

  // ============================================================================
  // handleAcceptPermission - Accept Button Click Handler
  // ============================================================================
  // LOGIC: When user clicks "Accept" button, we send approval to main process
  // and update the conversation status back to 'running' so Claude can continue
  const handleAcceptPermission = async () => {
    const busyState = busyConversations.get(selectedConversation.promptId)

    // Validation: Ensure there's actually a pending permission
    if (
      !busyState ||
      busyState.status !== 'waiting_permission' ||
      !busyState.pendingPermission
    ) {
      console.warn('⚠️  [Permission] No pending permission to accept')
      return
    }

    const { requestId, toolName } = busyState.pendingPermission
    const conversationLogPath = busyState.conversation.conversationLogPath

    console.log('✅ [Permission] User accepted tool:', toolName)
    console.log('   Request ID:', requestId)

    // ============================================================================
    // Log Permission Acceptance to Conversation File
    // ============================================================================
    // LOGIC: Record that user accepted this tool so it appears in chat history
    if (conversationLogPath) {
      try {
        await updateConversationFile(
          conversationLogPath,
          {
            content: {
              type: 'permission_response',
              requestId,
              toolName,
              status: 'accepted',
              respondedBy: 'user',
            },
          },
          Response.system
        )
      } catch (err) {
        console.error('❌ Failed to log permission acceptance to file:', err)
      }
    }

    // Send acceptance to main process via IPC
    // The main process's canUseTool callback is waiting for this response
    window.App.acceptToolPermission({ requestId })

    // Update conversation status back to 'running'
    // LOGIC: Permission approved, Claude can now execute the tool and continue
    setBusyConversations(prev => {
      const updatedMap = new Map(prev)
      const busyConv = updatedMap.get(selectedConversation.promptId)

      if (busyConv) {
        busyConv.status = 'running'
        busyConv.pendingPermission = undefined // Clear the pending permission
        updatedMap.set(selectedConversation.promptId, busyConv)
      }

      return updatedMap
    })
  }

  const handleExecute = async (promptText: string) => {
    if (!projectContext || !promptText.trim()) {
      console.warn('Cannot execute: missing project context or prompt')
      return
    }

    const userPromptText = promptText.trim()

    // ============================================================================
    // Permission Cancellation Logic
    // ============================================================================
    // LOGIC: If there's a pending permission, user typing a new prompt means
    // they want to override Claude's decision and give different instructions.
    // Cancel the pending tool and send the new prompt as context to Claude.
    const busyState = busyConversations.get(selectedConversation.promptId)

    if (
      busyState?.status === 'waiting_permission' &&
      busyState.pendingPermission
    ) {
      const { requestId, toolName } = busyState.pendingPermission
      const conversationLogPath = busyState.conversation.conversationLogPath

      console.log(
        '❌ [Permission] User typed new prompt, cancelling pending tool:',
        toolName
      )
      console.log('   Request ID:', requestId)
      console.log('   New prompt:', userPromptText.substring(0, 200) + '...')

      // ============================================================================
      // Log Permission Cancellation to Conversation File
      // ============================================================================
      // LOGIC: Record that user cancelled this tool and provided override instructions
      if (conversationLogPath) {
        try {
          await updateConversationFile(
            conversationLogPath,
            {
              content: {
                type: 'permission_response',
                requestId,
                toolName,
                status: 'cancelled',
                respondedBy: 'user',
                newPrompt: userPromptText,
              },
            },
            Response.system
          )
        } catch (err) {
          console.error(
            '❌ Failed to log permission cancellation to file:',
            err
          )
        }
      }

      // Send cancellation with new prompt to main process via IPC
      // The main process's canUseTool callback will deny the tool and pass
      // the new prompt as context to Claude
      window.App.cancelToolPermission({
        requestId,
        newPrompt: userPromptText,
      })

      // Update conversation status back to 'running'
      // LOGIC: Permission cancelled, Claude will receive denial + new instructions
      setBusyConversations(prev => {
        const updatedMap = new Map(prev)
        const busyConv = updatedMap.get(selectedConversation.promptId)

        if (busyConv) {
          busyConv.status = 'running'
          busyConv.pendingPermission = undefined // Clear the pending permission
          updatedMap.set(selectedConversation.promptId, busyConv)
        }

        return updatedMap
      })

      // Don't proceed with normal execution - the SDK is already running
      // and will receive the denial message with the new prompt
      return
    }

    // Add user message to UI immediately for instant feedback
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'text',
      text: userPromptText,
      isUser: true,
      timestamp: new Date(),
    }
    if (isNewConversation) {
      setChatMessages([userMessage])
    } else {
      setChatMessages(prev => [...prev, userMessage])
    }
    console.log('current chat messages', chatMessages);

    let promptId: string
    let conversationLogPath: string
    let worktreePath: string
    let conversation: ConversationHistory
    let sessionId: string | undefined

    try {
      // ============ PHASE 1: Setup conversation context ============
      if (isNewConversation) {
        // NEW CONVERSATION: Create worktree, conversation log, etc.
        if (!selectedBranch) {
          console.warn('Cannot execute: no branch selected')
          return
        }

        // Ensure git repository is initialized
        console.log('Ensuring git repository is initialized...')
        const finalBranch = await ensureGitRepositoryInitialized(
          projectContext.projectPath,
          selectedBranch
        )
        console.log('Git Initialised on Branch: ', finalBranch)

        // Generate prompt ID
        promptId = uuidv4()

        // Create conversation log path
        const projectName =
          projectContext.projectPath.split('/').pop() || 'unknown'
        const appDataPath = await window.App.getAppDataPath()
        conversationLogPath = `${appDataPath}/${projectName}/prompts/conversations/${promptId}.json`

        // Save user message to conversation log immediately (before setSelectedConversation)
        // This ensures the useEffect that loads messages will find the user message in the file
        console.log('💬 Saving user message to conversation log:', userPromptText)
        await updateConversationFile(
          conversationLogPath,
          { content: { type: 'text', text: userPromptText } },
          Response.user
        )

        // Create worktree
        console.log('Creating worktree for new conversation:', promptId)
        const worktreeResult = await window.App.createWorktree(
          projectContext.projectPath,
          finalBranch,
          userPromptText,
          promptId,
          undefined
        )
        console.log('Created Successfully Worktree', worktreeResult)
        if (!worktreeResult.success) {
          throw new Error(worktreeResult.error || 'Failed to create worktree')
        }

        worktreePath = worktreeResult.worktreeInfo.worktreePath
        const worktreeBranchName = worktreeResult.worktreeInfo.branchName
        console.log('✅ Worktree branch name:', worktreeBranchName)

        // Create conversation object
        conversation = {
          promptId,
          projectPath: projectContext.projectPath,
          worktreePath,
          aiSessionId: undefined,
          conversationLogPath,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as ConversationHistory

        // Update selectedConversation immediately so real-time message updates work
        // This ensures selectedConversationRef.current.promptId matches the new promptId
        setSelectedConversation(conversation)

        // Save enhanced prompt to history
        console.log('💾 Saving enhanced prompt to history...')
        await window.App.saveEnhancedPrompt({
          id: promptId,
          prompt: userPromptText,
          startExecutionTime: new Date(),
          branch: worktreeBranchName,
          branchStatus: 'active',
          promptHistoryId: promptId,
          status: 'busy',
          projectPath: projectContext.projectPath,
          worktreePath,
          createdAt: new Date(),
          updatedAt: new Date(),
        })

        // Refresh prompt history to show the new conversation immediately
        console.log('🔄 Refreshing prompt history...')
        const updatedHistory = await window.App.getEnhancedPromptHistory(
          projectContext.projectPath
        )
        setPromptHistory(
          updatedHistory.map((item: any) => ({
            ...item,
            startExecutionTime: new Date(item.startExecutionTime),
            createdAt: new Date(item.createdAt),
            updatedAt: new Date(item.updatedAt),
          }))
        )

        // Check if prompt file has existing session ID (from previous execution)
        const savedPrompt = updatedHistory.find((p: any) => p.id === promptId)
        sessionId = savedPrompt?.aiSessionId
        console.log('🔑 Loaded session ID from database:', sessionId || 'none (will create new)')
      } else {
        // EXISTING CONVERSATION: Reuse existing context
        conversation = { ...selectedConversation }
        promptId = conversation.promptId
        conversationLogPath = conversation.conversationLogPath
        worktreePath = conversation.worktreePath

        // Create worktree if missing
        if (!worktreePath) {
          console.log('Creating worktree for conversation:', promptId)
          const worktreeResult = await window.App.createWorktree(
            projectContext.projectPath,
            selectedBranch || projectContext.selectedBranch,
            userPromptText,
            promptId,
            undefined
          )

          if (!worktreeResult.success) {
            throw new Error(worktreeResult.error || 'Failed to create worktree')
          }

          worktreePath = worktreeResult.worktreeInfo.worktreePath
          conversation.worktreePath = worktreePath
        }

        // Load session ID from database if not in memory
        sessionId = conversation.aiSessionId
        if (!sessionId) {
          // Session ID not in memory, try loading from database
          const historyItem = promptHistory.find(p => p.id === promptId)
          sessionId = historyItem?.aiSessionId
          console.log('🔑 Loaded session ID from database for existing conversation:', sessionId || 'none (will create new)')
        } else {
          console.log('🔑 Using session ID from memory:', sessionId)
        }
      }

      // ============ PHASE 2: Common execution logic ============

      // Save user message to conversation log (for existing conversations only)
      // New conversations already saved the message earlier
      if (!isNewConversation) {
        console.log('💬 Saving user message to conversation log:', userPromptText)
        await updateConversationFile(
          conversationLogPath,
          { content: { type: 'text', text: userPromptText } },
          Response.user
        )
      }

      // Mark conversation as busy
      console.log('⏳ Marking conversation as busy:', promptId)
      setBusyConversations(prev => {
        const newBusyMap = new Map(prev)
        newBusyMap.set(promptId, {
          conversation,
          status: 'running',
        })
        return newBusyMap
      })

      // Setup message handler for Claude SDK output
      console.log('📡 Setting up message handler for Claude SDK...')
      console.log('📡 Handler will process messages for promptId:', promptId)

      const handleClaudeMessage = async (data: {
        type: string
        data: string
        promptId?: string
      }) => {
        // ============================================================================
        // CRITICAL FIX: Filter messages by promptId to prevent session ID contamination
        // ============================================================================
        // LOGIC: Each handler receives ALL messages on the 'command-output' channel.
        // If we don't filter, this handler will process messages from OTHER conversations,
        // causing session ID contamination (lines 1072, 1092, 1108).
        // By checking if the message's promptId matches THIS conversation's promptId,
        // we ensure only the correct handler processes each message.
        if (data.promptId && data.promptId !== promptId) {
          console.log(
            `⏭️ [FILTER] Ignoring message from different conversation:`,
            `received: ${data.promptId}, expected: ${promptId}`
          )
          return // Exit early - prevents session ID contamination
        }

        console.log('✅ [FILTER] Message belongs to this conversation, processing...')
        console.log('🔔 handleClaudeMessage called!', data)
        try {
          console.log('🔍 Raw data received:', data)
          const sdkMessage = JSON.parse(data.data)
          console.log(
            '📨 Full SDK message:',
            JSON.stringify(sdkMessage, null, 2)
          )

          // Always log to conversation file (for all conversations, even background ones)
          await updateConversationFile(
            conversationLogPath,
            { content: sdkMessage },
            Response.ai
          )

          // Only update UI in real-time if this is the selected conversation
          // This enables parallel conversations - background ones save to file only
          // Use ref to avoid stale closure when user switches conversations
          const isSelectedConversation =
            selectedConversationRef.current.promptId === promptId
          console.log(
            '🔍 Is this the selected conversation?',
            isSelectedConversation,
            'selectedConversation.promptId:',
            selectedConversationRef.current.promptId,
            'current promptId:',
            promptId
          )

          if (isSelectedConversation) {
            const newMessages = convertSDKMessageToChatMessage(sdkMessage)
            setChatMessages(prev => {
              // Double-check still selected before committing update
              if (selectedConversationRef.current.promptId === promptId) {
                return [...prev, ...newMessages]
              }
              return prev // Don't update if conversation changed
            })
            console.log('✅ Updated chat messages in UI (real-time)')
          } else {
            console.log(
              '⏭️ Skipping real-time UI update - conversation running in background'
            )
            console.log(
              '   Messages are saved to file and will load when user switches to this conversation'
            )
          }

          // Capture session ID for resumption
          if (sdkMessage.session_id) {
            console.log('🔑 Captured session ID:', sdkMessage.session_id)
            setBusyConversations(prev => {
              const updatedBusyMap = new Map(prev)
              const busyConv = updatedBusyMap.get(promptId)
              if (busyConv) {
                busyConv.sessionId = sdkMessage.session_id
                busyConv.conversation.aiSessionId = sdkMessage.session_id
                updatedBusyMap.set(promptId, busyConv)
              }
              return updatedBusyMap
            })

            // Update selectedConversation for resumption
            setSelectedConversation(prev => {
              if (prev.promptId === promptId) {
                console.log('✅ Updated selectedConversation with session ID')
                return { ...prev, aiSessionId: sdkMessage.session_id }
              }
              return prev
            })

            // Persist session ID to database for resumption
            try {
              // Reload prompt history to get latest data
              const currentHistory = await window.App.getEnhancedPromptHistory(
                projectContext?.projectPath || conversation.projectPath
              )
              const prompt = currentHistory.find((p: any) => p.id === promptId)

              if (prompt) {
                await window.App.updateEnhancedPrompt({
                  ...prompt,
                  startExecutionTime: new Date(prompt.startExecutionTime),
                  createdAt: new Date(prompt.createdAt),
                  updatedAt: new Date(),
                  aiSessionId: sdkMessage.session_id,
                })
                console.log('✅ Persisted session ID to database:', sdkMessage.session_id)
              } else {
                console.warn('⚠️  Could not find prompt in database to update session ID:', promptId)
              }
            } catch (error) {
              console.error('❌ Failed to persist session ID:', error)
            }

            // Update selected conversation with session ID (only if still selected)
            conversation.aiSessionId = sdkMessage.session_id
            
          }

          // Handle completion
          if (sdkMessage.type === 'result') {
            console.log(
              '🏁 Conversation completed with status:',
              sdkMessage.subtype
            )
            setBusyConversations(prev => {
              const updatedBusyMap = new Map(prev)
              updatedBusyMap.delete(promptId)
              return updatedBusyMap
            })
            console.log('✅ Removed conversation from busy map:', promptId)

            // Update prompt status to 'completed' in the database
            try {
              const prompt = promptHistory.find(p => p.id === promptId)
              if (prompt) {
                await window.App.updateEnhancedPrompt({
                  ...prompt,
                  status: 'completed',
                  updatedAt: new Date(),
                })
                console.log('✅ Updated prompt status to completed:', promptId)

                // Refresh prompt history to show updated status
                if (projectContext?.projectPath) {
                  const updatedHistory = await window.App.getEnhancedPromptHistory(
                    projectContext.projectPath
                  )
                  setPromptHistory(
                    updatedHistory.map((item: any) => ({
                      ...item,
                      startExecutionTime: new Date(item.startExecutionTime),
                      createdAt: new Date(item.createdAt),
                      updatedAt: new Date(item.updatedAt),
                    }))
                  )
                  console.log('✅ Refreshed prompt history')
                }
              }
            } catch (error) {
              console.error('❌ Error updating prompt status:', error)
            }

            // Play notification sound
            playNotificationSound()
          }
        } catch (error) {
          console.error('❌ Error processing Claude message:', error)
        }
      }

      // Execute Claude SDK with output callback
      console.log('🚀 Starting Claude SDK execution for:', promptId)
      console.log('📂 Working directory:', worktreePath)
      console.log('🔄 Session ID (resume):', sessionId)
      console.log('🔒 Auto-accept enabled:', isAutoAcceptEnabled)

      try {
        const result = await window.App.executeClaudeSDK(
          {
            prompt: userPromptText,
            workingDirectory: worktreePath,
            allowedTools: ['Read', 'Glob', 'Grep'],
            permissionMode: 'default', // Changed: Always use 'default' to enable canUseTool callback
            resume: sessionId,

            // ✨ Permission system parameters:
            // LOGIC: Pass these to main process so canUseTool can route permissions correctly
            promptId, // Which conversation is making this request
            conversationTitle: userPromptText.substring(0, 200), // Display name for UI
            autoAcceptEnabled: isAutoAcceptEnabled, // Whether to bypass permission requests
          },
          handleClaudeMessage // Pass the callback here
        )
        console.log('✅ Claude SDK execution completed successfully')
        console.log('📋 Result:', JSON.stringify(result, null, 2))
      } catch (sdkError) {
        console.error('❌ Error executing Claude SDK:', sdkError)

        // Clean up busy state on error
        setBusyConversations(prev => {
          const updatedBusyMap = new Map(prev)
          updatedBusyMap.delete(promptId)
          return updatedBusyMap
        })

        // Log error to conversation file
        await updateConversationFile(
          conversationLogPath,
          {
            content: {
              type: 'error',
              message:
                sdkError instanceof Error ? sdkError.message : String(sdkError),
            },
          },
          Response.system
        )

        throw sdkError
      }
    } catch (error) {
      console.error('❌ Error executing conversation:', error)

      // Remove from busy conversations on error
      setBusyConversations(prev => {
        const updatedBusyMap = new Map(prev)
        updatedBusyMap.delete(promptId)
        return updatedBusyMap
      })

      if (isNewConversation) {
        alert(
          `Failed to create conversation: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  }

  return (
    <div
      className="flex-1 flex flex-col h-full overflow-hidden"
      ref={chatContainerRef}
    >
      {/* Show different layouts based on conversation state */}
      {isNewConversation ? (
        /* New Conversation - Centered layout for both themes */
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-2xl px-6">
            {/* Greeting */}
            <div className="text-center mb-3">
              <span
                className={`text-sm ${isLightTheme ? 'text-gray-500' : 'text-gray-400'}`}
              >
                ✨ Hello, Vaibhav
              </span>
            </div>

            {/* Main Heading */}
            <h1
              className={`text-4xl font-serif text-center mb-8 ${
                isLightTheme ? 'text-gray-900' : 'text-white'
              }`}
            >
              Let's make something awesome!
            </h1>

            {/* Input Container */}
            <div className="mb-4">
              <PromptInput
                onExecute={handleExecute}
                isNewConversation={isNewConversation}
                isExecuting={
                  busyConversations.get(selectedConversation.promptId)?.status === 'running'
                }
                projectContext={projectContext}
                selectedBranch={selectedBranch}
                availableBranches={availableBranches}
                onBranchSelect={setSelectedBranch}
                onWorktreeSelect={setSelectedWorktree}
                getAvailableBranchesForNewPrompt={getAvailableBranchesForNewPrompt}
              />
            </div>

          </div>
        </div>
      ) : chatMessages.length > 0 ? (
        /* Existing conversation with messages */
        <div
          ref={chatMessagesScrollRef}
          className={`flex-1 overflow-y-auto ${isLightTheme ? 'bg-white' : themeClasses.bgSecondary} rounded-lg p-6 space-y-4 mb-2`}
        >
          {chatMessages.map((message, index) => {
            // Helper function to determine if this message should have a connecting line
            const shouldShowConnectingLine = () => {
              // Show line for tool_use, tool_result, and non-user text messages
              // that are part of a sequence (not preceded by a user message)
              if (index === 0) return false

              const currentType = message.type
              const prevMessage = chatMessages[index - 1]

              // If current is a tool message, show line if previous wasn't a user message
              if (currentType === 'tool_use' || currentType === 'tool_result') {
                return prevMessage && !prevMessage.isUser
              }

              // If current is Claude text, show line if previous was also Claude-related
              if (currentType === 'text' && !message.isUser) {
                return (
                  prevMessage &&
                  (prevMessage.type === 'tool_use' ||
                    prevMessage.type === 'tool_result' ||
                    (prevMessage.type === 'text' && !prevMessage.isUser))
                )
              }

              return false
            }

            const hasConnectingLine = shouldShowConnectingLine()
            // Init message - hidden from view
            if (message.type === 'init') {
              return null
            }

            // Text message from User or Claude
            if (message.type === 'text') {
              if (message.isUser) {
                // User message - right aligned with bubble
                return (
                  <div className="mb-4 flex justify-end" key={message.id}>
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2.5 whitespace-pre-wrap select-text cursor-text ${
                        isLightTheme
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-gray-700 text-gray-200'
                      }`}
                      style={{ fontSize: '0.8rem' }}
                    >
                      {message.text}
                    </div>
                  </div>
                )
              }
              // Claude message - left aligned, minimal styling with optional connecting line
              return (
                <div className="mb-4 flex" key={message.id}>
                  {/* Connecting line */}
                  {hasConnectingLine && (
                    <div
                      className="w-0.5 mr-3 border-l-2 border-dotted"
                      style={{
                        borderColor: theme.border.primary,
                      }}
                    />
                  )}
                  <div
                    className={`flex-1 whitespace-pre-wrap select-text cursor-text ${
                      isLightTheme ? 'text-gray-700' : 'text-gray-300'
                    } ${hasConnectingLine ? '' : 'ml-3'}`}
                    style={{ fontSize: '0.8rem' }}
                  >
                    {message.text}
                  </div>
                </div>
              )
            }

            // Tool use message
            if (message.type === 'tool_use') {
              const IconComponent = getToolIcon(message.toolName || '')
              const description = getToolDescription(
                message.toolName || '',
                message.toolInput
              )

              // Check for Write tool with content
              const hasWriteContent =
                message.toolName === 'Write' && message.toolInput?.content

              // Check for Edit tool with old_string and new_string
              const hasEditContent =
                message.toolName === 'Edit' &&
                message.toolInput?.old_string &&
                message.toolInput?.new_string

              // Check for TodoWrite tool with todos
              const hasTodoContent =
                message.toolName === 'TodoWrite' && message.toolInput?.todos

              return (
                <div className="mb-3 flex" key={message.id}>
                  {/* Connecting line */}
                  {hasConnectingLine && (
                    <div
                      className="w-0.5 mr-3 border-l-2 border-dotted"
                      style={{
                        borderColor: theme.border.hover,
                      }}
                    />
                  )}

                  <div className="flex-1">
                    {/* Tool name line */}
                    <div className="flex items-center gap-2 py-1 mb-2">
                      <IconComponent
                        className="w-4 h-4"
                        style={{ color: theme.text.tertiary }}
                      />
                      <span
                        className="font-medium"
                        style={{ color: theme.text.primary, fontSize: '0.8rem' }}
                      >
                        {message.toolName}
                      </span>
                      {description && (
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: theme.background.labels,
                            color: theme.text.muted,
                          }}
                        >
                          {description}
                        </span>
                      )}
                    </div>

                    {/* Code block for Write tool with content */}
                    {hasWriteContent && (
                      <div
                        className={`rounded-lg border overflow-hidden ${
                          isLightTheme
                            ? 'bg-gray-50 border-gray-200'
                            : 'bg-gray-900 border-gray-700'
                        }`}
                      >
                        <SyntaxHighlighter
                          language={detectLanguageFromPath(message.toolInput.file_path)}
                          style={isLightTheme ? vs : vscDarkPlus}
                          showLineNumbers
                          customStyle={{
                            margin: 0,
                            borderRadius: 0,
                            fontSize: '0.8rem',
                            fontWeight: 550,
                            background: isLightTheme ? '#f9fafb' : '#111827',
                            cursor: 'text',
                            userSelect: 'text',
                          }}
                          lineNumberStyle={{
                            minWidth: '3em',
                            paddingRight: '1em',
                            color: isLightTheme ? '#9ca3af' : '#6b7280',
                            userSelect: 'none',
                          }}
                          codeTagProps={{
                            style: {
                              cursor: 'text',
                              userSelect: 'text',
                            }
                          }}
                        >
                          {message.toolInput.content}
                        </SyntaxHighlighter>
                      </div>
                    )}

                    {/* Diff view for Edit tool with old_string and new_string */}
                    {hasEditContent && (
                      <div
                        className={`rounded-lg border overflow-hidden ${
                          isLightTheme
                            ? 'bg-gray-50 border-gray-200'
                            : 'bg-gray-900 border-gray-700'
                        }`}
                      >
                        {/* Old string (removed) */}
                        <div
                          className="border-l-4"
                          style={{
                            borderColor: isLightTheme ? '#ff8182' : '#f85149',
                          }}
                        >
                          <div
                            className={`px-3 py-1 text-xs font-medium ${
                              isLightTheme ? 'bg-gray-50' : 'bg-gray-900'
                            }`}
                            style={{
                              color: isLightTheme ? '#cf222e' : '#ffb3b3',
                            }}
                          >
                            - Removed
                          </div>
                          <SyntaxHighlighter
                            language={detectLanguageFromPath(message.toolInput.file_path)}
                            style={isLightTheme ? vs : vscDarkPlus}
                            showLineNumbers
                            customStyle={{
                              margin: 0,
                              borderRadius: 0,
                              fontSize: '0.8rem',
                              fontWeight: 550,
                              background: isLightTheme ? '#f9fafb' : '#111827',
                              cursor: 'text',
                              userSelect: 'text',
                            }}
                            lineNumberStyle={{
                              minWidth: '3em',
                              paddingRight: '1em',
                              color: isLightTheme ? '#9ca3af' : '#6b7280',
                              userSelect: 'none',
                            }}
                            codeTagProps={{
                              style: {
                                cursor: 'text',
                                userSelect: 'text',
                              }
                            }}
                          >
                            {message.toolInput.old_string}
                          </SyntaxHighlighter>
                        </div>

                        {/* New string (added) */}
                        <div
                          className="border-l-4"
                          style={{
                            borderColor: isLightTheme ? '#34d058' : '#3fb950',
                          }}
                        >
                          <div
                            className={`px-3 py-1 text-xs font-medium ${
                              isLightTheme ? 'bg-gray-50' : 'bg-gray-900'
                            }`}
                            style={{
                              color: isLightTheme ? '#116329' : '#a8ffa8',
                            }}
                          >
                            + Added
                          </div>
                          <SyntaxHighlighter
                            language={detectLanguageFromPath(message.toolInput.file_path)}
                            style={isLightTheme ? vs : vscDarkPlus}
                            showLineNumbers
                            customStyle={{
                              margin: 0,
                              borderRadius: 0,
                              fontSize: '0.8rem',
                              fontWeight: 550,
                              background: isLightTheme ? '#f9fafb' : '#111827',
                              cursor: 'text',
                              userSelect: 'text',
                            }}
                            lineNumberStyle={{
                              minWidth: '3em',
                              paddingRight: '1em',
                              color: isLightTheme ? '#9ca3af' : '#6b7280',
                              userSelect: 'none',
                            }}
                            codeTagProps={{
                              style: {
                                cursor: 'text',
                                userSelect: 'text',
                              }
                            }}
                          >
                            {message.toolInput.new_string}
                          </SyntaxHighlighter>
                        </div>
                      </div>
                    )}

                    {/* Todo list for TodoWrite tool */}
                    {hasTodoContent && (
                      <div
                        className={`rounded-md border mt-2 ${
                          isLightTheme
                            ? 'bg-gray-50/50 border-gray-200'
                            : 'bg-gray-800/30 border-gray-700/50'
                        }`}
                      >
                        <div className="p-2 space-y-1">
                          {message.toolInput.todos.map((todo: TodoItem, todoIndex: number) => {
                            const isCompleted = todo.status === 'completed'
                            const isInProgress = todo.status === 'in_progress'

                            return (
                              <div
                                key={todoIndex}
                                className="flex items-center gap-2 py-1 px-2"
                              >
                                {/* Status Icon */}
                                <div className="flex-shrink-0">
                                  {isCompleted ? (
                                    <CheckSquare
                                      className="w-3.5 h-3.5"
                                      style={{ color: isLightTheme ? '#22c55e' : '#4ade80' }}
                                    />
                                  ) : isInProgress ? (
                                    <div
                                      className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center"
                                      style={{
                                        borderColor: isLightTheme ? '#3b82f6' : '#60a5fa',
                                      }}
                                    >
                                      <div
                                        className="w-1.5 h-1.5 rounded-full"
                                        style={{
                                          backgroundColor: isLightTheme ? '#3b82f6' : '#60a5fa',
                                        }}
                                      />
                                    </div>
                                  ) : (
                                    <div
                                      className="w-3.5 h-3.5 rounded border"
                                      style={{
                                        borderColor: isLightTheme ? '#d1d5db' : '#4b5563',
                                      }}
                                    />
                                  )}
                                </div>

                                {/* Todo Content */}
                                <div
                                  className={`text-xs flex-1 cursor-text select-text ${
                                    isCompleted
                                      ? isLightTheme
                                        ? 'text-gray-400 line-through'
                                        : 'text-gray-500 line-through'
                                      : isLightTheme
                                        ? 'text-gray-700'
                                        : 'text-gray-300'
                                  }`}
                                >
                                  {isInProgress ? todo.activeForm : todo.content}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            }

            // Tool result message - Only show if error
            if (message.type === 'tool_result') {
              // Only display tool results if there's an error
              if (!message.isError) {
                return null
              }

              const resultContent =
                typeof message.toolResult === 'string'
                  ? message.toolResult
                  : JSON.stringify(message.toolResult, null, 2)

              return (
                <div className="mb-3 flex" key={message.id}>
                  {/* Connecting line */}
                  {hasConnectingLine && (
                    <div
                      className="w-0.5 mr-3 border-l-2 border-dotted"
                      style={{
                        borderColor: theme.border.hover,
                      }}
                    />
                  )}

                  <div className="flex-1">
                    {/* Tool error header */}
                    <div className="flex items-center gap-2 py-1 mb-2">
                      <XCircle
                        className="w-4 h-4"
                        style={{ color: theme.text.tertiary }}
                      />
                      <span
                        className="font-medium"
                        style={{ color: theme.text.primary, fontSize: '0.8rem' }}
                      >
                        Tool Error
                      </span>
                    </div>

                    {/* Error content - styled like code block */}
                    <div
                      className="rounded-lg border overflow-hidden cursor-text"
                      style={{
                        backgroundColor: theme.background.tertiary,
                        borderColor: theme.border.primary,
                      }}
                    >
                      <pre
                        className="p-3 whitespace-pre-wrap max-h-64 overflow-y-auto select-text cursor-text font-mono"
                        style={{
                          fontSize: '0.8rem',
                          margin: 0,
                          color: theme.text.secondary,
                        }}
                      >
                        {resultContent}
                      </pre>
                    </div>
                  </div>
                </div>
              )
            }

            // Final result message - hidden from view
            if (message.type === 'result') {
              return null
            }

            // Permission request message
            if (message.type === 'permission_request') {
              return (
                <div className="mb-4 flex" key={message.id}>
                  {hasConnectingLine && (
                    <div
                      className="w-0.5 mr-3 border-l-2 border-dotted"
                      style={{
                        borderColor: isLightTheme
                          ? 'rgba(209, 213, 219, 0.3)' // light theme border.secondary
                          : 'rgba(55, 65, 81, 0.3)', // dark theme border.secondary
                      }}
                    />
                  )}
                  <div
                    className={`text-xs ${
                      isLightTheme ? 'text-gray-500' : 'text-gray-400'
                    }`}
                  >
                    Waiting for permission • {message.toolName}
                  </div>
                </div>
              )
            }

            // Permission response message
            if (message.type === 'permission_response') {
              const isAccepted = message.permissionStatus === 'accepted'
              const isCancelled = message.permissionStatus === 'cancelled'

              return (
                <div className="mb-4 flex" key={message.id}>
                  {hasConnectingLine && (
                    <div
                      className="w-0.5 mr-3 border-l-2 border-dotted"
                      style={{
                        borderColor: isLightTheme
                          ? 'rgba(209, 213, 219, 0.3)' // light theme border.secondary
                          : 'rgba(55, 65, 81, 0.3)', // dark theme border.secondary
                      }}
                    />
                  )}
                  <div
                    className={`text-xs ${
                      isLightTheme ? 'text-gray-500' : 'text-gray-400'
                    }`}
                  >
                    {isAccepted
                      ? 'Permission accepted'
                      : 'Permission cancelled'}{' '}
                    • {message.toolName}
                    {isCancelled &&
                      message.newPrompt &&
                      ` • New instruction provided`}
                  </div>
                </div>
              )
            }

            return null
          })}
        
        </div>
      ) : (
        /* Empty state for existing conversation with no messages */
        <div className="flex-1 overflow-y-auto"></div>
      )}

      {/* Input Area - Show for existing conversations (with or without messages) */}
      {!isNewConversation && (
        <div className="flex-shrink-0">
          {/* Status Bar - Above Input */}
          {/* ================================================================ */}
          {/* LOGIC: Show different status based on conversation state:        */}
          {/* - waiting_permission: Show pending tool details + Accept button  */}
          {/* - running: Show "Claude is working..." message                   */}
          {/* - default: Show "Ready to execute" message                       */}
          {/* ================================================================ */}
          <div className="bg-[#2D2D2D] border-t border-gray-700 rounded-t-lg px-4 py-3 flex items-center justify-between">
            {/* LEFT SIDE: Status message or pending tool info */}
            <div className="flex items-center gap-3 flex-1">
              {(() => {
                const busyState = busyConversations.get(
                  selectedConversation.promptId
                )

                // Show pending permission details
                if (
                  busyState?.status === 'waiting_permission' &&
                  busyState.pendingPermission
                ) {
                  const { toolName } = busyState.pendingPermission
                  return (
                    <span className="text-sm text-white">
                      {toolName} - Do you want to accept changes?
                    </span>
                  )
                }

                // Show running indicator with spinner
                if (busyState?.status === 'running') {
                  return (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center space-x-1">
                        <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"></div>
                        <div
                          className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"
                          style={{ animationDelay: '0.1s' }}
                        ></div>
                        <div
                          className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"
                          style={{ animationDelay: '0.2s' }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-300">
                        Claude is working...
                      </span>
                    </div>
                  )
                }

                // Default: Ready state
                return (
                  <span className="text-sm text-gray-400">
                    Ready to execute
                  </span>
                )
              })()}
            </div>

            {/* RIGHT SIDE: Auto Accept toggle + Accept button */}
            <div className="flex items-center gap-3">
              {/* Auto Accept Toggle */}
              <button
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  isAutoAcceptEnabled ? 'bg-green-500' : 'bg-gray-600'
                }`}
                onClick={() => setIsAutoAcceptEnabled(!isAutoAcceptEnabled)}
                title={
                  isAutoAcceptEnabled
                    ? 'Auto-accept is ON - tools will execute immediately'
                    : 'Auto-accept is OFF - tools will ask for permission'
                }
              >
                <span
                  className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                    isAutoAcceptEnabled ? 'right-1' : 'left-1'
                  }`}
                />
              </button>
              <span className="text-xs text-gray-300">Auto accept</span>

              {/* Accept Button or Spinner */}
              {busyConversations.get(selectedConversation.promptId)?.status ===
              'waiting_permission' && (
                <button
                  className="bg-white text-gray-900 hover:bg-gray-100 px-4 py-1.5 rounded text-sm font-medium transition-colors"
                  onClick={handleAcceptPermission}
                  title="Accept this tool execution"
                >
                  Accept
                </button>
              )}
            </div>
          </div>

          {/* Textarea with integrated pill selector */}
          <div className="space-y-3">
            <PromptInput
              onExecute={handleExecute}
              isNewConversation={false}
              isExecuting={
                busyConversations.get(selectedConversation.promptId)?.status === 'running'
              }
              projectContext={projectContext}
              selectedBranch={selectedBranch}
              availableBranches={availableBranches}
              onBranchSelect={setSelectedBranch}
              onWorktreeSelect={setSelectedWorktree}
              getAvailableBranchesForNewPrompt={getAvailableBranchesForNewPrompt}
              onNewConversation={() => {
                if (
                  isNewConversation &&
                  selectedConversation.promptId !== '+new'
                ) {
                  setSelectedConversation(newConversation())
                }
              }}
            />
          </div>

          {/* Status Messages */}
          {!projectContext && (
            <div className="mt-3 text-sm text-yellow-400 bg-yellow-900/20 p-3 rounded-lg">
              ⚠️ No project selected. Please go to the main screen to select a
              project folder and root branch.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
