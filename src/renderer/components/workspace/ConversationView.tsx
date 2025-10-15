import { useState, useEffect, useRef } from 'react'
import { ClipboardList, Play, ChevronDown } from 'lucide-react'
import { useTheme, createThemeClasses } from '../../theme/ThemeContext'
import type {
  ConversationHistory,
  EnhancedPromptHistoryItem,
  PendingPermission,
  ToolPermissionRequest
} from '../../../shared/types'
import { playNotificationSound } from '../../utils/notificationSound'

interface ProjectContext {
  projectPath: string
  selectedTool: string
  selectedBranch: string
}

// ============================================================================
// BusyConversation Interface
// ============================================================================
// Tracks the execution state of conversations running in parallel
// LOGIC: We need to know when a conversation is actively running, completed,
// encountered an error, OR is waiting for user permission to execute a tool.
// The 'waiting_permission' status is critical for the permission system.
interface BusyConversation {
  conversation: ConversationHistory

  // Status can be:
  // - 'running': Claude is actively processing (no permission needed)
  // - 'waiting_permission': Paused, waiting for user to Accept or override with new prompt
  // - 'completed': Conversation finished successfully
  // - 'error': Conversation encountered an error
  status: 'running' | 'waiting_permission' | 'completed' | 'error'

  sessionId?: string  // Claude SDK session ID for resumption
  error?: string      // Error message if status is 'error'

  // When status is 'waiting_permission', this contains details about what tool
  // is waiting for approval. This allows the UI to show exactly what Claude wants to do.
  pendingPermission?: PendingPermission
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
  setBusyConversations: (conversations: Map<string, BusyConversation> | ((prev: Map<string, BusyConversation>) => Map<string, BusyConversation>)) => void
  promptHistory: EnhancedPromptHistoryItem[]
  setPromptHistory: (history: EnhancedPromptHistoryItem[]) => void
}

interface ChatMessage {
  id: string
  type: 'init' | 'text' | 'tool_use' | 'tool_result' | 'result' | 'permission_request' | 'permission_response'
  timestamp: Date

  // For text messages
  text?: string
  isUser?: boolean  // Distinguish user messages from AI messages

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
  newPrompt?: string  // For cancelled permissions with override
}

enum Response {
  user = 'user',
  system = 'system',
  ai = 'ai'
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
}: ConversationViewProps) {
  const { theme } = useTheme()
  const themeClasses = createThemeClasses(theme)

  const [currentPrompt, setCurrentPrompt] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [activePills, setActivePills] = useState<Set<number>>(new Set())

  const [selectedAITool, setSelectedAITool] = useState<
    'claude-code' | 'codex' | 'cursor-cli'
  >('claude-code')
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [selectedWorktree, setSelectedWorktree] = useState<string | null>(null)
  const [isAIToolDropdownOpen, setIsAIToolDropdownOpen] = useState(false)
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false)
  const [isAutoAcceptEnabled, setIsAutoAcceptEnabled] = useState(false)
  const [showToolDetails, setShowToolDetails] = useState(false)  // Toggle to show/hide tool input details

  const chatContainerRef = useRef<HTMLDivElement>(null)
  const selectedConversationRef = useRef(selectedConversation)

  const isNewConversation = selectedConversation.promptId === '+new'

  // Keep ref synchronized with selectedConversation for use in callbacks
  useEffect(() => {
    selectedConversationRef.current = selectedConversation
  }, [selectedConversation])

  // Prompt pills data
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

  // Load conversation messages from the conversation log file (for existing conversations)
  useEffect(() => {
    const loadConversationMessages = async () => {
      if (!isNewConversation && selectedConversation.conversationLogPath) {
        try {
          console.log('Loading conversation from:', selectedConversation.conversationLogPath)

          const fileContent = await window.App.readConversationLog(selectedConversation.conversationLogPath)

          if (!fileContent || fileContent.length === 0) {
            setChatMessages([])
            return
          }

          const messages: ChatMessage[] = []

          fileContent.forEach((entry: any, index: number) => {
            const { timestamp, data, from } = entry

            // 1. Handle user prompt messages (from: "user")
            if (from === 'user' && data.content?.type === 'text' && data.content?.text) {
              messages.push({
                id: `user-${index}`,
                type: 'text',
                text: data.content.text,
                isUser: true,
                timestamp: new Date(timestamp),
              })
            }

            // 2. Handle init message (system initialization)
            if (data.content?.type === 'system' && data.content?.subtype === 'init') {
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
            timestamp: new Date(request.timestamp)
          }

          updatedMap.set(request.promptId, busyConv)
          console.log('✅ [Permission] Updated conversation status to waiting_permission')

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
                  status: 'pending'
                }
              },
              Response.system
            ).catch(err => {
              console.error('❌ Failed to log permission request to file:', err)
            })
          }
        } else {
          console.warn('⚠️  [Permission] No busy conversation found for promptId:', request.promptId)
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
    // LOGIC: If user doesn't respond within 30 seconds, main process sends timeout
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
            console.log('✅ [Permission] Cleared timed-out permission for conversation:', promptId)
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
  }, [])  // ✅ Empty dependency array - listeners registered once on mount

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


  const updateConversationFile = async (file: string, jsonConversation: any, from: Response) => {
    // Append to file this jsonConversation, with timestamp, and from
    try {
      const logEntry = {
        from,
        timestamp: new Date().toISOString(),
        data: jsonConversation
      }
      await window.App.appendToConversationLog(file, logEntry)
      console.log('✅ Appended conversation entry to file:', file, 'from:', from)
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
    if (!busyState || busyState.status !== 'waiting_permission' || !busyState.pendingPermission) {
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
              respondedBy: 'user'
            }
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
        busyConv.pendingPermission = undefined  // Clear the pending permission
        updatedMap.set(selectedConversation.promptId, busyConv)
      }

      return updatedMap
    })

    // Hide tool details after accepting
    setShowToolDetails(false)
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

    if (busyState?.status === 'waiting_permission' && busyState.pendingPermission) {
      const { requestId, toolName } = busyState.pendingPermission
      const conversationLogPath = busyState.conversation.conversationLogPath

      console.log('❌ [Permission] User typed new prompt, cancelling pending tool:', toolName)
      console.log('   Request ID:', requestId)
      console.log('   New prompt:', userPromptText.substring(0, 50) + '...')

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
                newPrompt: userPromptText
              }
            },
            Response.system
          )
        } catch (err) {
          console.error('❌ Failed to log permission cancellation to file:', err)
        }
      }

      // Send cancellation with new prompt to main process via IPC
      // The main process's canUseTool callback will deny the tool and pass
      // the new prompt as context to Claude
      window.App.cancelToolPermission({
        requestId,
        newPrompt: userPromptText
      })

      // Update conversation status back to 'running'
      // LOGIC: Permission cancelled, Claude will receive denial + new instructions
      setBusyConversations(prev => {
        const updatedMap = new Map(prev)
        const busyConv = updatedMap.get(selectedConversation.promptId)

        if (busyConv) {
          busyConv.status = 'running'
          busyConv.pendingPermission = undefined  // Clear the pending permission
          updatedMap.set(selectedConversation.promptId, busyConv)
        }

        return updatedMap
      })

      // Hide tool details after cancelling
      setShowToolDetails(false)

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
        console.log("Git Initialised on Branch: ", finalBranch)

        // Generate prompt ID
        promptId = Date.now().toString()

        // Create conversation log path
        const projectName = projectContext.projectPath.split('/').pop() || 'unknown'
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
        console.log("Created Successfully Worktree", worktreeResult)
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

        sessionId = undefined
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

        sessionId = conversation.aiSessionId
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

      const handleClaudeMessage = async (data: { type: string; data: string }) => {
        console.log('🔔 handleClaudeMessage called!', data)
        try {
          console.log('🔍 Raw data received:', data)
          const sdkMessage = JSON.parse(data.data)
          console.log('📨 Full SDK message:', JSON.stringify(sdkMessage, null, 2))

          // Always log to conversation file (for all conversations, even background ones)
          await updateConversationFile(
            conversationLogPath,
            { content: sdkMessage },
            Response.ai
          )

          // Only update UI in real-time if this is the selected conversation
          // This enables parallel conversations - background ones save to file only
          // Use ref to avoid stale closure when user switches conversations
          const isSelectedConversation = selectedConversationRef.current.promptId === promptId
          console.log('🔍 Is this the selected conversation?', isSelectedConversation,
                      'selectedConversation.promptId:', selectedConversationRef.current.promptId,
                      'current promptId:', promptId)

          if (isSelectedConversation) {
            const newMessages = convertSDKMessageToChatMessage(sdkMessage)
            setChatMessages(prev => {
              // Double-check still selected before committing update
              if (selectedConversationRef.current.promptId === promptId) {
                return [...prev, ...newMessages]
              }
              return prev  // Don't update if conversation changed
            })
            console.log('✅ Updated chat messages in UI (real-time)')
          } else {
            console.log('⏭️ Skipping real-time UI update - conversation running in background')
            console.log('   Messages are saved to file and will load when user switches to this conversation')
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

            // Update selected conversation with session ID (only if still selected)
            conversation.aiSessionId = sdkMessage.session_id
            if (selectedConversationRef.current.promptId === promptId) {
              setSelectedConversation(conversation)
            }
          }

          // Handle completion
          if (sdkMessage.type === 'result') {
            console.log('🏁 Conversation completed with status:', sdkMessage.subtype)
            setBusyConversations(prev => {
              const updatedBusyMap = new Map(prev)
              updatedBusyMap.delete(promptId)
              return updatedBusyMap
            })
            console.log('✅ Removed conversation from busy map:', promptId)

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
            allowedTools: [ 'Read', 'Glob', 'Grep'],
            permissionMode: 'default',  // Changed: Always use 'default' to enable canUseTool callback
            resume: sessionId,

            // ✨ Permission system parameters:
            // LOGIC: Pass these to main process so canUseTool can route permissions correctly
            promptId,  // Which conversation is making this request
            conversationTitle: userPromptText.substring(0, 50),  // Display name for UI
            autoAcceptEnabled: isAutoAcceptEnabled,  // Whether to bypass permission requests
          },
          handleClaudeMessage  // Pass the callback here
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
              message: sdkError instanceof Error ? sdkError.message : String(sdkError)
            }
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
        alert(`Failed to create conversation: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full" ref={chatContainerRef}>
      {/* Chat Messages Area - Only show if there are messages */}
      {chatMessages.length > 0 ? (
        <div
          className={`flex-1 ${themeClasses.bgSecondary} rounded-lg p-4 mb-4 border ${themeClasses.borderPrimary} space-y-3 overflow-y-auto`}
        >
          {chatMessages.map(message => {
            // Init message
            if (message.type === 'init') {
              return (
                <div key={message.id} className="flex justify-center mb-4">
                  <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 text-xs max-w-2xl">
                    <div className="text-blue-300 font-medium mb-2">🚀 Session Started</div>
                    <div className="text-gray-400 space-y-1">
                      <div>Model: <span className="text-gray-300">{message.model}</span></div>
                      <div>Directory: <span className="text-gray-300">{message.cwd}</span></div>
                      <div>Session ID: <span className="text-gray-300 font-mono text-[10px]">{message.sessionId}</span></div>
                    </div>
                  </div>
                </div>
              )
            }

            // Text message from User or Claude
            if (message.type === 'text') {
              if (message.isUser) {
                // User message - align right
                return (
                  <div key={message.id} className="flex justify-end mb-3">
                    <div className="bg-blue-600 text-white max-w-[85%] p-3 rounded-lg ml-12">
                      <div className="text-xs font-medium mb-2 opacity-80">You</div>
                      <div className="text-sm whitespace-pre-wrap">{message.text}</div>
                      <div className="text-xs opacity-70 mt-2">{message.timestamp.toLocaleTimeString()}</div>
                    </div>
                  </div>
                )
              } else {
                // Claude message - align left
                return (
                  <div key={message.id} className="flex justify-start mb-3">
                    <div className="bg-gray-700 text-gray-100 max-w-[85%] p-3 rounded-lg mr-12">
                      <div className="text-xs font-medium text-blue-300 mb-2">Claude</div>
                      <div className="text-sm whitespace-pre-wrap">{message.text}</div>
                      <div className="text-xs opacity-70 mt-2">{message.timestamp.toLocaleTimeString()}</div>
                    </div>
                  </div>
                )
              }
            }

            // Tool use message
            if (message.type === 'tool_use') {
              return (
                <div key={message.id} className="flex justify-start mb-3">
                  <div className="bg-purple-900/30 border border-purple-500/30 max-w-[85%] p-3 rounded-lg mr-12">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-purple-400 font-medium text-sm">🔧 {message.toolName}</span>
                    </div>
                    {message.toolInput && Object.keys(message.toolInput).length > 0 && (
                      <pre className="bg-gray-900/50 rounded p-2 text-xs overflow-x-auto text-gray-300 border border-purple-500/20">
                        {JSON.stringify(message.toolInput, null, 2)}
                      </pre>
                    )}
                    <div className="text-xs opacity-70 mt-2 text-purple-300">{message.timestamp.toLocaleTimeString()}</div>
                  </div>
                </div>
              )
            }

            // Tool result message
            if (message.type === 'tool_result') {
              const resultContent = typeof message.toolResult === 'string'
                ? message.toolResult
                : JSON.stringify(message.toolResult, null, 2)

              return (
                <div key={message.id} className="flex justify-start mb-3">
                  <div className={`max-w-[85%] p-3 rounded-lg mr-12 ${
                    message.isError
                      ? 'bg-red-900/30 border border-red-500/30'
                      : 'bg-green-900/20 border border-green-500/30'
                  }`}>
                    <div className={`text-xs font-medium mb-2 ${
                      message.isError ? 'text-red-300' : 'text-green-300'
                    }`}>
                      {message.isError ? '❌ Tool Error' : '✅ Tool Result'}
                    </div>
                    <div className={`text-sm whitespace-pre-wrap max-h-64 overflow-y-auto ${
                      message.isError ? 'text-red-200' : 'text-gray-300'
                    }`}>
                      {resultContent}
                    </div>
                    <div className="text-xs opacity-70 mt-2">{message.timestamp.toLocaleTimeString()}</div>
                  </div>
                </div>
              )
            }

            // Final result message
            if (message.type === 'result') {
              return (
                <div key={message.id} className="flex justify-center mb-4">
                  <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3 text-xs max-w-md">
                    <div className="text-green-300 font-medium mb-2">✅ Conversation Complete</div>
                    <div className="text-gray-400 space-y-1">
                      <div>Duration: <span className="text-gray-300">{message.duration}ms</span></div>
                      <div>Cost: <span className="text-gray-300">${message.cost?.toFixed(6)}</span></div>
                      <div>Turns: <span className="text-gray-300">{message.numTurns}</span></div>
                    </div>
                  </div>
                </div>
              )
            }

            // Permission request message
            if (message.type === 'permission_request') {
              return (
                <div key={message.id} className="flex justify-center mb-4">
                  <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 text-xs max-w-2xl">
                    <div className="text-yellow-300 font-medium mb-2">
                      🔒 Permission Request: {message.toolName}
                    </div>
                    <div className="text-gray-400 space-y-1">
                      <div>Status: <span className="text-yellow-300">{message.permissionStatus}</span></div>
                      {message.toolInput && Object.keys(message.toolInput).length > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-gray-300 hover:text-white">
                            Show tool input
                          </summary>
                          <pre className="mt-2 bg-gray-900 p-2 rounded text-[10px] overflow-x-auto">
                            {JSON.stringify(message.toolInput, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              )
            }

            // Permission response message
            if (message.type === 'permission_response') {
              const isAccepted = message.permissionStatus === 'accepted'
              const isCancelled = message.permissionStatus === 'cancelled'

              return (
                <div key={message.id} className="flex justify-center mb-4">
                  <div className={`border rounded-lg p-3 text-xs max-w-2xl ${
                    isAccepted
                      ? 'bg-green-900/20 border-green-500/30'
                      : 'bg-red-900/20 border-red-500/30'
                  }`}>
                    <div className={`font-medium mb-2 ${
                      isAccepted ? 'text-green-300' : 'text-red-300'
                    }`}>
                      {isAccepted ? '✅ Permission Accepted' : '❌ Permission Cancelled'}
                    </div>
                    <div className="text-gray-400 space-y-1">
                      <div>Tool: <span className="text-gray-300">{message.toolName}</span></div>
                      <div>By: <span className="text-gray-300">{message.respondedBy}</span></div>
                      {isCancelled && message.newPrompt && (
                        <div className="mt-2 pt-2 border-t border-gray-700">
                          <div className="text-gray-400 text-xs mb-1">New instruction:</div>
                          <div className="text-gray-300 italic">"{message.newPrompt}"</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            }

            return null
          })}
          {busyConversations.get(selectedConversation.promptId)?.status === 'running' && (
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
      ) : (
        /* Empty state - Centered input with intro text */
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-3xl px-6">
            <div className="text-center mb-6">
              <h2 className={`text-xl font-semibold ${themeClasses.textPrimary} mb-2`}>
                Start a new conversation
              </h2>
              <p className={`text-sm ${themeClasses.textSecondary}`}>
                Describe what you'd like to build or the problem you need help with
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Input Area - Always at bottom */}
      <div className={chatMessages.length === 0 ? 'w-full max-w-3xl mx-auto px-6' : ''}>
        {/* Status Bar - Above Input */}
        {/* ================================================================ */}
        {/* LOGIC: Show different status based on conversation state:        */}
        {/* - waiting_permission: Show pending tool details + Accept button  */}
        {/* - running: Show "Claude is working..." message                   */}
        {/* - default: Show "Ready to execute" message                       */}
        {/* ================================================================ */}
        <div className={`${themeClasses.bgSecondary} border ${themeClasses.borderPrimary} rounded-t-lg px-4 py-2 flex items-center justify-between`}>
          {/* LEFT SIDE: Status message or pending tool info */}
          <div className="flex items-center gap-3">
            {(() => {
              const busyState = busyConversations.get(selectedConversation.promptId)

              // Show pending permission details
              if (busyState?.status === 'waiting_permission' && busyState.pendingPermission) {
                return (
                  <>
                    <span className="text-yellow-400">⚠️</span>
                    <span className={`text-sm ${themeClasses.textPrimary}`}>
                      <strong>{busyState.pendingPermission.toolName}</strong> is waiting for approval
                    </span>
                    <button
                      className="text-xs text-blue-400 underline hover:text-blue-300 transition-colors"
                      onClick={() => setShowToolDetails(!showToolDetails)}
                    >
                      {showToolDetails ? 'Hide' : 'Show'} details
                    </button>
                  </>
                )
              }

              // Show running indicator
              if (busyState?.status === 'running') {
                return (
                  <span className={`text-sm ${themeClasses.textSecondary}`}>
                    Claude is working...
                  </span>
                )
              }

              // Default: Ready state
              return (
                <span className={`text-sm ${themeClasses.textSecondary}`}>
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
              title={isAutoAcceptEnabled ? 'Auto-accept is ON - tools will execute immediately' : 'Auto-accept is OFF - tools will ask for permission'}
            >
              <span
                className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                  isAutoAcceptEnabled ? 'right-1' : 'left-1'
                }`}
              />
            </button>
            <span className={`text-xs ${themeClasses.textSecondary}`}>
              Auto Accept
            </span>

            {/* Accept Button - Only enabled when there's a pending permission */}
            {/* LOGIC: Button is disabled unless conversation is waiting_permission */}
            <button
              className={`${themeClasses.btnPrimary} px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-opacity`}
              disabled={busyConversations.get(selectedConversation.promptId)?.status !== 'waiting_permission'}
              onClick={handleAcceptPermission}
              title={
                busyConversations.get(selectedConversation.promptId)?.status === 'waiting_permission'
                  ? 'Accept this tool execution'
                  : 'No pending tool to accept'
              }
            >
              Accept
            </button>
          </div>
        </div>

        {/* Tool Details Expandable Section */}
        {/* LOGIC: Only show when user clicks "Show details" and there's a pending permission */}
        {showToolDetails &&
         busyConversations.get(selectedConversation.promptId)?.status === 'waiting_permission' &&
         busyConversations.get(selectedConversation.promptId)?.pendingPermission && (
          <div className="bg-gray-800 border-l-4 border-yellow-500 p-3 mb-2 rounded">
            <div className="text-xs text-yellow-300 font-medium mb-2">
              Tool Input:
            </div>
            <pre className="text-xs text-gray-300 overflow-x-auto max-h-48 overflow-y-auto bg-gray-900 p-2 rounded">
              {JSON.stringify(
                busyConversations.get(selectedConversation.promptId)!.pendingPermission!.toolInput,
                null,
                2
              )}
            </pre>
          </div>
        )}

        {/* Textarea */}
        <div className="space-y-3">
          <div className="relative">
            <textarea
              className={`${themeClasses.bgInput} border ${themeClasses.borderPrimary} rounded-none rounded-b-lg border-t-0 p-4 pl-4 pr-4 ${themeClasses.textPrimary} placeholder-gray-400 resize-none focus:outline-none ${themeClasses.borderFocus} h-32 min-h-[128px] w-full`}
              onChange={e => {
                setCurrentPrompt(e.target.value)
                // Set to New Prompt when user types in a new conversation
                if (isNewConversation && selectedConversation.promptId !== '+new') {
                  setSelectedConversation(newConversation())
                }
              }}
              placeholder="Do something else"
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

              {/* Branch Dropdown - Only show for new conversations */}
              {isNewConversation && (
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
                      {getAvailableBranchesForNewPrompt().map(branch => (
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
              )}
            </div>

            {/* Right side buttons */}
            <div className="absolute right-2 bottom-3 flex gap-1 pointer-events-none">
              {/* Allow pointer events only on buttons */}
              <button
                className={`${themeClasses.btnSecondary} disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 rounded text-sm font-medium transition-colors flex items-center gap-1.5 pointer-events-auto`}
                disabled={
                  !projectContext ||
                  !currentPrompt.trim() ||
                  (isNewConversation && !selectedBranch) ||
                  busyConversations.get(selectedConversation.promptId)?.status === 'running'
                }
                onClick={handleExecute}
                title={
                  !projectContext
                    ? 'Please select a project first'
                    : !currentPrompt.trim()
                      ? 'Please enter a prompt'
                      : isNewConversation && !selectedBranch
                        ? 'Please select a branch'
                        : busyConversations.get(selectedConversation.promptId)?.status === 'running'
                          ? 'This conversation is currently executing'
                          : isNewConversation
                            ? 'Create new conversation and execute'
                            : 'Execute the prompt'
                }
              >
                <Play className="w-3 h-3" />
                <span className="text-xs">
                  {busyConversations.get(selectedConversation.promptId)?.status === 'running'
                    ? 'Executing...'
                    : 'Execute'}
                </span>
              </button>


            </div>
          </div>
        </div>

        {/* Prompt Pills - Below Input */}
        <div className="mt-3">
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
                  disabled={false}
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

        {/* Status Messages */}
        {!projectContext && (
          <div className="mt-3 text-sm text-yellow-400 bg-yellow-900/20 p-3 rounded-lg">
            ⚠️ No project selected. Please go to the main screen to select a
            project folder and root branch.
          </div>
        )}
      </div>
    </div>
  )
}
