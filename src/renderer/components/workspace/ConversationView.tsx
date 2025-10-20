import { useState, useEffect, useRef } from 'react'
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
  Wrench
} from 'lucide-react'
import { useTheme, createThemeClasses } from '../../theme/ThemeContext'
import type {
  ConversationHistory,
  EnhancedPromptHistoryItem,
  PendingPermission,
  ToolPermissionRequest,
  BusyConversation,
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

  const [currentPrompt, setCurrentPrompt] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [activePills, setActivePills] = useState<Set<number>>(new Set())
  const [selectedPills, setSelectedPills] = useState<
    Array<{ label: string; text: string }>
  >([])
  const [isPillDropdownOpen, setIsPillDropdownOpen] = useState(false)
  const [pillSearchText, setPillSearchText] = useState('')

  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [selectedWorktree, setSelectedWorktree] = useState<string | null>(null)
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false)
  const [isAutoAcceptEnabled, setIsAutoAcceptEnabled] = useState(false)

  const chatContainerRef = useRef<HTMLDivElement>(null)
  const chatMessagesScrollRef = useRef<HTMLDivElement>(null)
  const selectedConversationRef = useRef(selectedConversation)
  const pillDropdownRef = useRef<HTMLDivElement>(null)

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

  // Close pill dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pillDropdownRef.current &&
        !pillDropdownRef.current.contains(event.target as Node)
      ) {
        setIsPillDropdownOpen(false)
        setPillSearchText('')
      }
    }

    if (isPillDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isPillDropdownOpen])

  // Prompt pills data
  const promptPills = [
    {
      label: 'Code Planner',
      text: 'Can you tell me 2-3 plans to implement this feautre, go through the code properly and try and reuse existing code instead of giving me new code. Be concise and direct with your plan and recommend me the best plan to implement.',
    },
    {
      label: 'Expert Frontend Developer',
      text: 'You are an expert frontend developer with lot of experience, please ensure that that the brand colors #FFFFFF, #151312, #66645F, #B0B0AB, #D2D2D0, #DEDEDB, #000000 are being used for this feature. Ensure you reuse components whereever possible.',
    },
    {
      label: 'Backend Architect',
      text: 'You are an expert backend architect which can devise a database design along with backend architechture using the right recommended tools.',
    },
    {
      label: 'Bug Fix',
      text: 'I have a bug that needs fixing. Run the bash terminal with the command pnpm run dev and look at the logs to find the error mentioned. Find the source of the big and fix it.',
    },
  ]

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

          fileContent.forEach((entry: any, index: number) => {
            const { timestamp, data, from } = entry

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

  const handlePillClick = (index: number, text: string) => {
    const newActivePills = new Set(activePills)

    if (activePills.has(index)) {
      newActivePills.delete(index)
      setCurrentPrompt(prev => {
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
  }

  // New pill system handlers
  const handleAddPill = (pill: { label: string; text: string }) => {
    // Check if pill is already selected
    if (selectedPills.some(p => p.label === pill.label)) {
      return
    }

    setSelectedPills(prev => [...prev, pill])

    // Add pill text to current prompt
    setCurrentPrompt(prev => {
      if (prev.trim()) {
        return prev + (prev.endsWith(' ') ? '' : ' ') + pill.text
      }
      return pill.text
    })

    // Close dropdown and reset search
    setIsPillDropdownOpen(false)
    setPillSearchText('')
  }

  const handleRemovePill = (pillLabel: string) => {
    const pillToRemove = selectedPills.find(p => p.label === pillLabel)
    if (!pillToRemove) return

    setSelectedPills(prev => prev.filter(p => p.label !== pillLabel))

    // Remove pill text from current prompt
    setCurrentPrompt(prev => {
      return prev.replace(pillToRemove.text, '').replace(/\s+/g, ' ').trim()
    })
  }

  const getFilteredPills = () => {
    if (!pillSearchText.trim()) {
      return promptPills
    }

    const search = pillSearchText.toLowerCase()
    return promptPills.filter(
      pill =>
        pill.label.toLowerCase().includes(search) ||
        pill.text.toLowerCase().includes(search)
    )
  }

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

  const handleExecute = async () => {
    if (!projectContext || !currentPrompt.trim()) {
      console.warn('Cannot execute: missing project context or prompt')
      return
    }

    const userPromptText = currentPrompt.trim()

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

    // Clear input immediately
    setCurrentPrompt('')

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
        promptId = Date.now().toString()

        // Create conversation log path
        const projectName =
          projectContext.projectPath.split('/').pop() || 'unknown'
        conversationLogPath = `/Users/user/.almondcoder/${projectName}/prompts/conversations/${promptId}.json`

        // Create worktree
        console.log('Creating worktree for new conversation:', promptId)
        const worktreeResult = await window.App.createWorktree(
          projectContext.projectPath,
          finalBranch,
          currentPrompt,
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
        }

        // Update selectedConversation immediately so real-time message updates work
        // This ensures selectedConversationRef.current.promptId matches the new promptId
        setSelectedConversation(conversation)

        // Save enhanced prompt to history
        console.log('💾 Saving enhanced prompt to history...')
        await window.App.saveEnhancedPrompt({
          id: promptId,
          prompt: currentPrompt,
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

      // Save user message to conversation log
      console.log('💬 Saving user message to conversation log:', userPromptText)
      await updateConversationFile(
        conversationLogPath,
        { content: { type: 'text', text: userPromptText } },
        Response.user
      )

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
      }) => {
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
            if (selectedConversationRef.current.promptId === promptId) {
              setSelectedConversation(conversation)
            }
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
              <div
                className={`flex items-center gap-2 rounded-lg p-3 ${
                  isLightTheme
                    ? 'bg-white border border-gray-300'
                    : 'bg-gray-800 border border-gray-700'
                }`}
              >
                {/* Plus Button */}
                <button
                  className={`flex-shrink-0 ${
                    isLightTheme
                      ? 'text-gray-600 hover:text-gray-900'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M12 4v16m8-8H4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                    />
                  </svg>
                </button>

                {/* Input */}
                <input
                  className={`flex-1 outline-none text-sm bg-transparent ${
                    isLightTheme
                      ? 'text-gray-900 placeholder-gray-400'
                      : 'text-white placeholder-gray-500'
                  }`}
                  onChange={e => setCurrentPrompt(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleExecute()
                    }
                  }}
                  placeholder="Enter your prompt here..."
                  type="text"
                  value={currentPrompt}
                />

                {/* Branch Dropdown */}
                <div className="relative">
                  <button
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      isLightTheme
                        ? 'text-gray-700 bg-gray-50 hover:bg-gray-100 border-gray-300'
                        : 'text-gray-300 bg-gray-700 hover:bg-gray-600 border-gray-600'
                    }`}
                    disabled={availableBranches.length === 0}
                    onClick={() =>
                      setIsBranchDropdownOpen(!isBranchDropdownOpen)
                    }
                  >
                    <span className="text-green-500">🌿</span>
                    <span>{selectedBranch || 'Select Branch'}</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>

                  {isBranchDropdownOpen && availableBranches.length > 0 && (
                    <div
                      className={`absolute top-full right-0 mt-2 rounded-lg shadow-xl z-20 min-w-[280px] max-h-48 overflow-y-auto ${
                        isLightTheme
                          ? 'bg-white border border-gray-300'
                          : 'bg-gray-800 border border-gray-700'
                      }`}
                    >
                      {getAvailableBranchesForNewPrompt().map(branch => (
                        <button
                          className={`w-full text-left px-4 py-3 first:rounded-t-lg last:rounded-b-lg transition-colors ${
                            isLightTheme
                              ? `hover:bg-gray-50 ${branch === selectedBranch ? 'bg-gray-50' : ''}`
                              : `hover:bg-gray-700 ${branch === selectedBranch ? 'bg-gray-700' : ''}`
                          }`}
                          key={branch}
                          onClick={() => {
                            setSelectedBranch(branch)
                            setSelectedWorktree(null)
                            setIsBranchDropdownOpen(false)
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={
                                isLightTheme ? 'text-gray-600' : 'text-gray-400'
                              }
                            >
                              •
                            </span>
                            <div
                              className={`text-sm ${isLightTheme ? 'text-gray-700' : 'text-gray-300'}`}
                            >
                              {branch}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Execute Button */}
                <button
                  className={`flex-shrink-0 p-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    isLightTheme
                      ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                  disabled={
                    !projectContext ||
                    !currentPrompt.trim() ||
                    !selectedBranch ||
                    busyConversations.get(selectedConversation.promptId)
                      ?.status === 'running'
                  }
                  onClick={handleExecute}
                  title={
                    !projectContext
                      ? 'Please select a project first'
                      : !currentPrompt.trim()
                        ? 'Please enter a prompt'
                        : !selectedBranch
                          ? 'Please select a branch'
                          : 'Execute the prompt'
                  }
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M5 10l7-7m0 0l7 7m-7-7v18"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Prompt Pills */}
            <div className="flex flex-wrap gap-2 justify-center">
              {promptPills.map((pill, index) => {
                const isActive = activePills.has(index)
                return (
                  <button
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 border ${
                      isActive
                        ? themeClasses.pillActive
                        : themeClasses.pillInactive
                    }`}
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
        </div>
      ) : chatMessages.length > 0 ? (
        /* Existing conversation with messages */
        <div
          ref={chatMessagesScrollRef}
          className={`flex-1 overflow-y-auto ${isLightTheme ? 'bg-white' : themeClasses.bgSecondary} rounded-lg p-6 border ${themeClasses.borderPrimary} space-y-4 mb-2`}
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
                      className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap ${
                        isLightTheme
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-gray-700 text-gray-200'
                      }`}
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
                        borderColor: isLightTheme
                          ? 'rgba(209, 213, 219, 0.6)' // light theme border - more prominent
                          : 'rgba(75, 85, 99, 0.7)', // dark theme border - more prominent
                      }}
                    />
                  )}
                  <div
                    className={`flex-1 text-sm whitespace-pre-wrap ${
                      isLightTheme ? 'text-gray-700' : 'text-gray-300'
                    } ${hasConnectingLine ? '' : 'ml-3'}`}
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

              return (
                <div className="mb-3 flex" key={message.id}>
                  {/* Connecting line */}
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

                  <div className="flex-1">
                    {/* Tool name line */}
                    <div className="flex items-center gap-2 py-1 mb-2">
                      <IconComponent
                        className="w-4 h-4"
                        style={{ color: theme.text.tertiary }}
                      />
                      <span
                        className="text-sm font-medium"
                        style={{ color: theme.text.primary }}
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
                            fontSize: '0.9rem',
                            fontWeight: 550,
                            background: isLightTheme ? '#f9fafb' : '#111827',
                          }}
                          lineNumberStyle={{
                            minWidth: '3em',
                            paddingRight: '1em',
                            color: isLightTheme ? '#9ca3af' : '#6b7280',
                            userSelect: 'none',
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
                              fontSize: '0.9rem',
                              fontWeight: 550,
                              background: isLightTheme ? '#f9fafb' : '#111827',
                            }}
                            lineNumberStyle={{
                              minWidth: '3em',
                              paddingRight: '1em',
                              color: isLightTheme ? '#9ca3af' : '#6b7280',
                              userSelect: 'none',
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
                              fontSize: '0.9rem',
                              fontWeight: 550,
                              background: isLightTheme ? '#f9fafb' : '#111827',
                            }}
                            lineNumberStyle={{
                              minWidth: '3em',
                              paddingRight: '1em',
                              color: isLightTheme ? '#9ca3af' : '#6b7280',
                              userSelect: 'none',
                            }}
                          >
                            {message.toolInput.new_string}
                          </SyntaxHighlighter>
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
                <div className="flex justify-start mb-3" key={message.id}>
                  {/* Connecting line */}
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
                    className={`max-w-[85%] p-3 rounded-lg mr-12 ${
                      isLightTheme
                        ? 'bg-red-50 border border-red-200'
                        : 'bg-red-900/30 border border-red-500/30'
                    }`}
                  >
                    <div
                      className={`text-xs font-medium mb-2 ${
                        isLightTheme ? 'text-red-700' : 'text-red-300'
                      }`}
                    >
                      ❌ Tool Error
                    </div>
                    <div
                      className={`text-sm whitespace-pre-wrap max-h-64 overflow-y-auto ${
                        isLightTheme ? 'text-red-800' : 'text-red-200'
                      }`}
                    >
                      {resultContent}
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
              'waiting_permission' ? (
                <button
                  className="bg-white text-gray-900 hover:bg-gray-100 px-4 py-1.5 rounded text-sm font-medium transition-colors"
                  onClick={handleAcceptPermission}
                  title="Accept this tool execution"
                >
                  Accept
                </button>
              ) : busyConversations.get(selectedConversation.promptId)
                  ?.status === 'running' ? (
                <div className="flex items-center gap-2 text-gray-300 text-sm">
                  <div className="flex items-center space-x-1">
                    <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"></div>
                    <div
                      className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"
                      style={{ animationDelay: '0.1s' }}
                    ></div>
                    <div
                      className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"
                      style={{ animationDelay: '0.2s' }}
                    ></div>
                  </div>
                  <span>accepting...</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Textarea with integrated pill selector */}
          <div className="space-y-3">
            <div
              className={`${themeClasses.bgInput} border ${themeClasses.borderPrimary} rounded-none rounded-b-lg border-t-0 ${themeClasses.borderFocus}`}
            >
              {/* Textarea */}
              <div className="relative">
                <textarea
                  className={`w-full p-4 pb-16 ${themeClasses.textPrimary} placeholder-gray-400 resize-none focus:outline-none bg-transparent h-32 min-h-[128px]`}
                  onChange={e => {
                    setCurrentPrompt(e.target.value)
                    // Set to New Prompt when user types in a new conversation
                    if (
                      isNewConversation &&
                      selectedConversation.promptId !== '+new'
                    ) {
                      setSelectedConversation(newConversation())
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleExecute()
                    }
                  }}
                  placeholder="Do something else"
                  value={currentPrompt}
                />

                {/* Bottom bar with pills and execute button */}
                <div className="absolute left-0 right-0 bottom-0 px-3 pb-3 flex items-center justify-between gap-2">
                  {/* Left side: Plus icon and selected pills */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {/* Plus Icon Button */}
                    <div className="relative" ref={pillDropdownRef}>
                      <button
                        className={`w-8 h-8 rounded flex items-center justify-center transition-colors flex-shrink-0 ${
                          isLightTheme
                            ? 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                            : 'bg-gray-700 hover:bg-gray-600 text-gray-400'
                        }`}
                        onClick={() =>
                          setIsPillDropdownOpen(!isPillDropdownOpen)
                        }
                        title="Add prompt template"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M12 4v16m8-8H4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                          />
                        </svg>
                      </button>

                      {/* Dropdown with Typeahead - Opens Upward */}
                      {isPillDropdownOpen && (
                        <div
                          className={`absolute bottom-full left-0 mb-2 rounded-lg shadow-xl z-50 w-80 ${
                            isLightTheme
                              ? 'bg-white border border-gray-200'
                              : 'bg-gray-800 border border-gray-700'
                          }`}
                        >
                          {/* Filtered Pills List */}
                          <div className="max-h-64 overflow-y-auto">
                            {getFilteredPills().length > 0 ? (
                              getFilteredPills().map((pill, index) => {
                                const isSelected = selectedPills.some(
                                  p => p.label === pill.label
                                )
                                return (
                                  <button
                                    className={`w-full text-left px-4 py-3 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                                      isSelected
                                        ? isLightTheme
                                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                          : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                        : isLightTheme
                                          ? 'hover:bg-gray-50 text-gray-900'
                                          : 'hover:bg-gray-700 text-gray-200'
                                    }`}
                                    disabled={isSelected}
                                    key={index}
                                    onClick={() =>
                                      !isSelected && handleAddPill(pill)
                                    }
                                  >
                                    <div className="font-medium text-sm">
                                      {pill.label}
                                    </div>
                                    <div
                                      className={`text-xs mt-1 ${
                                        isLightTheme
                                          ? 'text-gray-500'
                                          : 'text-gray-400'
                                      }`}
                                    >
                                      {pill.text.substring(0, 60)}...
                                    </div>
                                  </button>
                                )
                              })
                            ) : (
                              <div
                                className={`px-4 py-8 text-center text-sm ${
                                  isLightTheme
                                    ? 'text-gray-500'
                                    : 'text-gray-400'
                                }`}
                              >
                                No templates found
                              </div>
                            )}
                          </div>

                          {/* Search Input at Bottom */}
                          <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                            <input
                              autoFocus
                              className={`w-full px-3 py-2 rounded-md text-sm outline-none ${
                                isLightTheme
                                  ? 'bg-gray-50 border border-gray-300 text-gray-900 placeholder-gray-400'
                                  : 'bg-gray-700 border border-gray-600 text-white placeholder-gray-500'
                              }`}
                              onChange={e => setPillSearchText(e.target.value)}
                              placeholder="Search templates..."
                              type="text"
                              value={pillSearchText}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Selected Pills on the Right */}
                    <div className="flex flex-wrap gap-2 flex-1 min-w-0 overflow-x-auto">
                      {selectedPills.map((pill, index) => (
                        <div
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs border flex-shrink-0 ${
                            isLightTheme
                              ? 'bg-white border-gray-300 text-gray-700'
                              : 'bg-gray-800 border-gray-600 text-gray-200'
                          }`}
                          key={index}
                        >
                          <span className="truncate max-w-[150px]">
                            {pill.label}
                          </span>
                          <button
                            className={`hover:opacity-70 transition-opacity ${
                              isLightTheme ? 'text-gray-500' : 'text-gray-400'
                            }`}
                            onClick={() => handleRemovePill(pill.label)}
                            title="Remove"
                          >
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                d="M6 18L18 6M6 6l12 12"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                              />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right side: Execute button */}
                  <button
                    className={`disabled:opacity-50 disabled:cursor-not-allowed p-2 rounded transition-colors flex items-center justify-center flex-shrink-0 ${
                      busyConversations.get(selectedConversation.promptId)
                        ?.status === 'running'
                        ? isLightTheme
                          ? 'bg-gray-400'
                          : 'bg-gray-600'
                        : isLightTheme
                          ? 'bg-black hover:bg-gray-800'
                          : 'bg-white hover:bg-gray-200'
                    }`}
                    disabled={
                      !projectContext ||
                      !currentPrompt.trim() ||
                      (isNewConversation && !selectedBranch) ||
                      busyConversations.get(selectedConversation.promptId)
                        ?.status === 'running'
                    }
                    onClick={handleExecute}
                    title={
                      !projectContext
                        ? 'Please select a project first'
                        : !currentPrompt.trim()
                          ? 'Please enter a prompt'
                          : isNewConversation && !selectedBranch
                            ? 'Please select a branch'
                            : busyConversations.get(
                                  selectedConversation.promptId
                                )?.status === 'running'
                              ? 'This conversation is currently executing'
                              : isNewConversation
                                ? 'Create new conversation and execute'
                                : 'Execute the prompt'
                    }
                  >
                    <ArrowUp
                      className={`w-4 h-4 ${
                        busyConversations.get(selectedConversation.promptId)
                          ?.status === 'running'
                          ? isLightTheme
                            ? 'text-white'
                            : 'text-gray-300'
                          : isLightTheme
                            ? 'text-white'
                            : 'text-black'
                      }`}
                    />
                  </button>
                </div>
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
        </div>
      )}
    </div>
  )
}
