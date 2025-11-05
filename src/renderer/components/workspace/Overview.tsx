import { useState, useCallback, useEffect } from 'react'
import { useTheme, createThemeClasses } from '../../theme/ThemeContext'
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  X,
  NotePencil,
  CaretLeft,
  CaretRight,
  CaretDown,
  CheckCircle,
  WarningCircle,
  GitBranch as GitBranchIcon,
  Dot,
} from '@phosphor-icons/react'

const { App } = window

interface ProjectContext {
  projectPath: string
  selectedTool: string
  selectedBranch: string
}

interface GitBranch {
  name: string
  commit: string
  date: string
  author: string
  subject: string
  isRemote: boolean
  isCurrent: boolean
}

interface GitRelationship {
  source: string
  target: string
  type: string
}

interface GitBranchGraph {
  branches: GitBranch[]
  relationships: GitRelationship[]
  currentBranch: string
}

interface FileConflict {
  id: string
  startLine: number
  endLine: number
  currentContent: string
  incomingContent: string
}

interface MergeConflict {
  file: string
  fullContent: string
  currentBranch: string
  incomingBranch: string
  conflicts: FileConflict[]
}

interface DropAction {
  draggedNode: Node
  targetNode: Node
  originalPosition: { x: number; y: number }
  menuPosition: { x: number; y: number }
}

interface ConflictResolution {
  conflictId: string
  resolution: 'current' | 'incoming' | 'both'
  resolvedContent: string
}

const checkNodesOverlap = (node1: Node, node2: Node): boolean => {
  const nodeWidth = 180
  const nodeHeight = 60

  const rect1 = {
    left: node1.position.x,
    right: node1.position.x + nodeWidth,
    top: node1.position.y,
    bottom: node1.position.y + nodeHeight,
  }

  const rect2 = {
    left: node2.position.x,
    right: node2.position.x + nodeWidth,
    top: node2.position.y,
    bottom: node2.position.y + nodeHeight,
  }

  return !(
    rect1.right < rect2.left ||
    rect2.right < rect1.left ||
    rect1.bottom < rect2.top ||
    rect2.bottom < rect1.top
  )
}

const BranchNodeLabel = ({
  branch,
  isParentBranch,
  promptText,
  isBeingDraggedOver,
}: {
  branch: GitBranch
  isParentBranch: boolean
  promptText?: string
  isBeingDraggedOver?: boolean
}) => {
  if (isParentBranch) {
    // Parent branch: Simple flat design
    return (
      <div style={{ textAlign: 'left' }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: '600',
            color: isBeingDraggedOver ? '#FFFFFF' : '#1a1a1a',
            width: '100%',
          }}
        >
          {branch.name}
        </div>
      </div>
    )
  }

  // Child branch (almondcoder/): Nested card design
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        margin: '-10px',
        borderRadius: '8px',
        backgroundColor: isBeingDraggedOver
          ? 'rgb(68, 69, 71)'
          : 'rgb(229, 231, 235)',
      }}
    >
      {/* Header section with branch name */}
      <div
        style={{
          padding: '4px 4px',
          borderRadius: '8px',
          width: '116%',
        }}
      >
        <div
          style={{
            fontSize: '8px',
            fontWeight: '500',
            color: isBeingDraggedOver ? '#FFFFFF' : '#4b5563',
            width: '100%',
            whiteSpace: 'normal',
            wordBreak: 'break-all',
            overflowWrap: 'break-word',
            display: 'flex', // Add this
            alignItems: 'center', // Add this to vertically center
            gap: '0px', // Add this for spacing between icon and text
          }}
        >
          • {branch.name.replace('almondcoder/', '')}
        </div>
      </div>

      {/* Content section with commit details */}
      <div
        style={{
          paddingRight: '3px',
          paddingLeft: '3px',
        }}
      >
        <div
          style={{
            backgroundColor: '#FFFFFF',
            padding: '4px',
            borderBottomLeftRadius: '2px',
            borderBottomRightRadius: '2px',
            borderTopRightRadius: '2px',
            borderTopLeftRadius: '2px',

            gap: '6px',
            width: '115%',
            minHeight: 'fit-content',
          }}
        >
          <div
            style={{
              fontSize: '8px',
              color: '#1a1a1a',
              lineHeight: '1.2',
              fontWeight: '400',
              width: '115%',
              paddingRight: '20px',
              marginBottom: '2px',
              minHeight: 'fit-content',
            }}
          >
            {promptText || branch.subject}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Overview({
  projectContext,
}: {
  projectContext: ProjectContext
}) {
  const { theme } = useTheme()
  const themeClasses = createThemeClasses(theme)

  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [gitData, setGitData] = useState<GitBranchGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [dropAction, setDropAction] = useState<DropAction | null>(null)
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null)
  const [originalPositions, setOriginalPositions] = useState<
    Record<string, { x: number; y: number }>
  >({})
  const [mergeConflicts, setMergeConflicts] = useState<MergeConflict[]>([])
  const [showConflictPanel, setShowConflictPanel] = useState(false)
  const [currentConflictIndex, setCurrentConflictIndex] = useState(0)
  const [resolutions, setResolutions] = useState<
    Map<string, ConflictResolution>
  >(new Map())
  const [mergeContext, setMergeContext] = useState<{
    sourceBranch: string
    targetBranch: string
    worktreePath: string
    hasStashedMainRepo: boolean
    originalBranch?: string
  } | null>(null)

  // Sidebar state for hierarchical branch tree
  const [branchTree, setBranchTree] = useState<Record<string, string[]>>({})
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    new Set(['main', 'master'])
  )
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)

  useEffect(() => {
    if (projectContext?.projectPath) {
      loadGitData()
    }
  }, [projectContext])

  // Update node style when dragging (style the dragged node itself)
  useEffect(() => {
    if (!draggedNodeId) {
      // No drag in progress - reset all nodes to normal colors
      setNodes(prevNodes =>
        prevNodes.map(node => {
          const isParentBranch = !node.id.startsWith('almondcoder/')
          const branch = gitData?.branches.find(b => b.name === node.id)
          if (!branch) return node

          const promptText = node.data.promptText || branch.subject || undefined

          const nodeStyle = {
            background: isParentBranch
              ? 'rgb(210, 210, 208)'
              : 'rgb(229, 231, 235)',
            color: '#333333',
            border: `1px solid ${selectedBranch === node.id ? '#3B82F6' : '#E5E5E0'}`,
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 'normal',
            boxShadow:
              selectedBranch === node.id
                ? '0 2px 8px rgba(59, 130, 246, 0.2)'
                : '0 1px 3px rgba(0, 0, 0, 0.1)',
            padding: '10px',
          }

          return {
            ...node,
            style: nodeStyle,
            data: {
              ...node.data,
              label: (
                <BranchNodeLabel
                  branch={branch}
                  isBeingDraggedOver={false}
                  isParentBranch={isParentBranch}
                  promptText={promptText}
                />
              ),
              promptText,
            },
          }
        })
      )
    } else {
      // Drag in progress - style the dragged node
      setNodes(prevNodes =>
        prevNodes.map(node => {
          const isParentBranch = !node.id.startsWith('almondcoder/')
          const isBeingDragged = node.id === draggedNodeId
          const branch = gitData?.branches.find(b => b.name === node.id)
          if (!branch) return node

          const promptText = node.data.promptText || branch.subject || undefined

          // Only apply dark styling to child branches (almondcoder/) being dragged
          const shouldApplyDragStyle = isBeingDragged && !isParentBranch

          const nodeStyle = {
            background: shouldApplyDragStyle
              ? 'rgb(68, 69, 71)'
              : isParentBranch
                ? 'rgb(210, 210, 208)'
                : 'rgb(229, 231, 235)',
            color: shouldApplyDragStyle ? '#FFFFFF' : '#333333',
            border: `1px solid ${selectedBranch === node.id ? '#3B82F6' : '#E5E5E0'}`,
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 'normal',
            boxShadow:
              selectedBranch === node.id
                ? '0 2px 8px rgba(59, 130, 246, 0.2)'
                : '0 1px 3px rgba(0, 0, 0, 0.1)',
            padding: '10px',
          }

          return {
            ...node,
            style: nodeStyle,
            data: {
              ...node.data,
              label: (
                <BranchNodeLabel
                  branch={branch}
                  isBeingDraggedOver={shouldApplyDragStyle}
                  isParentBranch={isParentBranch}
                  promptText={promptText}
                />
              ),
              promptText,
            },
          }
        })
      )
    }
  }, [draggedNodeId, selectedBranch, gitData])

  const loadGitData = async () => {
    try {
      setLoading(true)
      const data = await App.getGitBranchGraph(projectContext.projectPath)

      // Get list of branches that have active worktrees (using git directly)
      const worktreeBranchesResult = await App.getWorktreeBranches(
        projectContext.projectPath
      )
      console.log('Worktree branches result:', worktreeBranchesResult)

      const worktreeBranches = worktreeBranchesResult.success
        ? new Set<string>(worktreeBranchesResult.branches)
        : new Set<string>()

      console.log('Worktree branches from git:', Array.from(worktreeBranches))
      console.log(
        'All git branches:',
        data.branches.map(b => b.name)
      )

      // Load prompt history to get original prompt text for each branch
      const promptHistory = await App.getEnhancedPromptHistory(
        projectContext.projectPath
      )
      const promptMap = new Map(promptHistory.map(p => [p.branch, p.prompt]))

      setGitData(data)
      generateNodesAndEdges(data, worktreeBranches, promptMap)
    } catch (error) {
      console.error('Error loading git data:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateNodesAndEdges = (
    data: GitBranchGraph,
    worktreeBranches: Set<string>,
    promptMap: Map<string, string>
  ) => {
    const nodePositions = new Map<string, { x: number; y: number }>()

    // Filter branches: only show almondcoder/ branches that have worktrees, and all non-almondcoder branches
    const filteredBranches = data.branches.filter(branch => {
      const isAlmondcoderBranch = branch.name.startsWith('almondcoder/')
      if (isAlmondcoderBranch) {
        // Only show almondcoder branches that have associated worktrees
        return worktreeBranches.has(branch.name)
      }
      // Show all non-almondcoder branches (like main, master, feature branches, etc.)
      return true
    })

    // Position main/master at the center
    const mainBranch = filteredBranches.find(
      b => b.name === 'main' || b.name === 'master'
    )
    if (mainBranch) {
      nodePositions.set(mainBranch.name, { x: 300, y: 100 })
    }

    // Position other branches around main
    const xOffset = 100
    const yOffset = 250
    const spacing = 200

    const generatedNodes: Node[] = filteredBranches.map((branch, index) => {
      let position = nodePositions.get(branch.name)

      if (!position) {
        position = {
          x: xOffset + (index % 3) * spacing,
          y: yOffset + Math.floor(index / 3) * 120,
        }
      }

      // Light theme node styling
      // Parent branches (non-almondcoder) get gray background, child branches stay white
      const isParentBranch = !branch.name.startsWith('almondcoder/')

      // Check if this node is being dragged over (target of drag)
      const isBeingDraggedOver =
        dropAction && dropAction.targetNode.id === branch.name

      const nodeStyle = {
        background: isBeingDraggedOver
          ? 'rgb(68, 69, 71)'
          : isParentBranch
            ? 'rgb(210, 210, 208)'
            : 'rgb(229, 231, 235)',
        color: isBeingDraggedOver ? '#FFFFFF' : '#333333',
        border: `1px solid ${selectedBranch === branch.name ? '#3B82F6' : '#E5E5E0'}`,
        borderRadius: '8px',
        fontSize: '12px',
        fontWeight: 'normal',
        boxShadow:
          selectedBranch === branch.name
            ? '0 2px 8px rgba(59, 130, 246, 0.2)'
            : '0 1px 3px rgba(0, 0, 0, 0.1)',
        padding: '10px',
      }

      const promptText = promptMap.get(branch.name)

      return {
        id: branch.name,
        type: 'default',
        position,
        data: {
          label: (
            <BranchNodeLabel
              branch={branch}
              isBeingDraggedOver={isBeingDraggedOver}
              isParentBranch={isParentBranch}
              promptText={promptText}
            />
          ),
          promptText, // Store for future updates in useEffect
        },
        style: nodeStyle,
      }
    })

    const generatedEdges: Edge[] = data.relationships.map(rel => ({
      id: `e-${rel.source}-${rel.target}`,
      source: rel.source,
      target: rel.target,
      type: 'smoothstep',
      style: { stroke: '#D0D0D0', strokeWidth: 1 },
      animated: false,
    }))

    setNodes(generatedNodes)
    setEdges(generatedEdges)

    // Build branch tree for sidebar
    const tree: Record<string, string[]> = {}

    // Get parent branches (non-almondcoder branches)
    const parentBranches = filteredBranches.filter(
      b => !b.name.startsWith('almondcoder/')
    )

    // Initialize tree with empty arrays for each parent
    parentBranches.forEach(parent => {
      tree[parent.name] = []
    })

    // Assign almondcoder branches to their parent branches
    const almondcoderBranches = filteredBranches.filter(b =>
      b.name.startsWith('almondcoder/')
    )

    almondcoderBranches.forEach(almondBranch => {
      // Find the parent by looking at relationships
      const parentRel = data.relationships.find(
        rel => rel.target === almondBranch.name
      )
      if (parentRel && tree[parentRel.source]) {
        tree[parentRel.source].push(almondBranch.name)
      } else {
        // If no relationship found, default to 'main' or 'master'
        const defaultParent = tree.main
          ? 'main'
          : tree.master
            ? 'master'
            : parentBranches[0]?.name
        if (defaultParent && tree[defaultParent]) {
          tree[defaultParent].push(almondBranch.name)
        }
      }
    })

    setBranchTree(tree)
  }

  const onNodesChange: OnNodesChange = useCallback(
    changes => {
      for (const change of changes) {
        if (change.type === 'position' && change.dragging && change.position) {
          const draggedNode = nodes.find(n => n.id === change.id)
          if (!draggedNode) continue

          if (change.dragging && !draggedNodeId) {
            setDraggedNodeId(change.id)
            setOriginalPositions(prev => ({
              ...prev,
              [change.id]: draggedNode.position,
            }))
          }

          const updatedNode = { ...draggedNode, position: change.position }

          for (const node of nodes) {
            if (node.id !== change.id && checkNodesOverlap(updatedNode, node)) {
              // Only allow merging if there's a relationship between branches
              const hasRelationship = edges.some(
                edge =>
                  (edge.source === change.id && edge.target === node.id) ||
                  (edge.source === node.id && edge.target === change.id)
              )

              if (
                hasRelationship ||
                node.id === 'main' ||
                node.id === 'master'
              ) {
                const originalPos =
                  originalPositions[change.id] || draggedNode.position
                const menuPosition = {
                  x: Math.min(change.position.x + 180, window.innerWidth - 200),
                  y: Math.min(change.position.y + 30, window.innerHeight - 100),
                }

                setDropAction({
                  draggedNode: updatedNode,
                  targetNode: node,
                  originalPosition: originalPos,
                  menuPosition,
                })
              }
              return
            }
          }

          setDropAction(null)
        }

        if (change.type === 'position' && !change.dragging) {
          setDraggedNodeId(null)
        }
      }

      setNodes(nds => applyNodeChanges(changes, nds))
    },
    [nodes, draggedNodeId, originalPositions, edges]
  )

  const onEdgesChange: OnEdgesChange = useCallback(
    changes => setEdges(eds => applyEdgeChanges(changes, eds)),
    []
  )

  const handleMergeClick = async () => {
    if (!dropAction || !projectContext) return

    // Validate target branch - should not be an almondcoder/ branch
    if (dropAction.targetNode.id.startsWith('almondcoder/')) {
      alert(
        'Cannot merge into a worktree branch. Please select a regular branch like main or master.'
      )
      return
    }

    try {
      console.log('Starting merge process...')

      // Use the new performWorktreeMerge method
      const result: any = await App.performWorktreeMerge({
        projectPath: projectContext.projectPath,
        sourceBranch: dropAction.draggedNode.id,
        targetBranch: dropAction.targetNode.id,
      })

      if (result.success) {
        console.log('Merge successful!')

        // Remove the merged branch from visualization
        setNodes(prev =>
          prev.filter(node => node.id !== dropAction.draggedNode.id)
        )
        setEdges(prev =>
          prev.filter(
            edge =>
              edge.source !== dropAction.draggedNode.id &&
              edge.target !== dropAction.draggedNode.id
          )
        )
        setDropAction(null)

        // Reload git data to reflect changes
        await loadGitData()

        alert('Successfully merged and cleaned up worktree!')
      } else if (result.hasConflicts) {
        console.log('Merge has conflicts, showing conflict resolution UI')

        // Store merge context for later completion
        setMergeContext({
          sourceBranch: result.sourceBranch,
          targetBranch: result.targetBranch,
          worktreePath: result.worktreePath,
          hasStashedMainRepo: result.hasStashedMainRepo,
          originalBranch: result.originalBranch,
        })

        // Show conflicts in modal
        setMergeConflicts(result.conflicts)
        setShowConflictPanel(true)
        setDropAction(null)
      } else {
        alert(`Merge failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Error during merge:', error)
      alert('Failed to perform merge')
    }
  }

  const handleDiscardChanges = async () => {
    if (!dropAction || !projectContext) return

    const confirmed = window.confirm(
      `Are you sure you want to discard all changes in "${dropAction.draggedNode.id}"? This cannot be undone.`
    )

    if (!confirmed) return

    try {
      console.log('Discarding worktree changes...')

      const result = await App.discardWorktreeChanges({
        projectPath: projectContext.projectPath,
        sourceBranch: dropAction.draggedNode.id,
      })

      if (result.success) {
        console.log('Worktree discarded successfully!')

        // Remove the branch from visualization
        setNodes(prev =>
          prev.filter(node => node.id !== dropAction.draggedNode.id)
        )
        setEdges(prev =>
          prev.filter(
            edge =>
              edge.source !== dropAction.draggedNode.id &&
              edge.target !== dropAction.draggedNode.id
          )
        )
        setDropAction(null)

        // Reload git data to reflect changes
        await loadGitData()

        alert('Successfully discarded worktree and branch!')
      } else {
        alert(`Failed to discard: ${result.error}`)
      }
    } catch (error) {
      console.error('Error discarding worktree:', error)
      alert('Failed to discard worktree')
    }
  }

  const handleCancelMerge = () => {
    if (!dropAction) return

    setNodes(prev =>
      prev.map(node =>
        node.id === dropAction.draggedNode.id
          ? { ...node, position: dropAction.originalPosition }
          : node
      )
    )
    setDropAction(null)
  }

  const handleConflictResolution = (
    conflictId: string,
    resolution: 'current' | 'incoming' | 'both',
    resolvedContent: string
  ) => {
    setResolutions(prev => {
      const newMap = new Map(prev)
      newMap.set(conflictId, { conflictId, resolution, resolvedContent })
      return newMap
    })
  }

  // Get total number of conflicts across all files
  const getTotalConflicts = () => {
    return mergeConflicts.reduce(
      (total, file) => total + file.conflicts.length,
      0
    )
  }

  // Get number of resolved conflicts
  const getResolvedCount = () => {
    return resolutions.size
  }

  // Navigate to previous conflict
  const handlePreviousConflict = () => {
    const total = getTotalConflicts()
    setCurrentConflictIndex(prev => (prev - 1 + total) % total)
  }

  // Navigate to next conflict
  const handleNextConflict = () => {
    const total = getTotalConflicts()
    setCurrentConflictIndex(prev => (prev + 1) % total)
  }

  // Get current conflict data based on index
  const getCurrentConflict = () => {
    let index = 0
    for (const fileConflict of mergeConflicts) {
      for (const conflict of fileConflict.conflicts) {
        if (index === currentConflictIndex) {
          return { fileConflict, conflict }
        }
        index++
      }
    }
    return null
  }

  const handleResolveAllConflicts = async () => {
    if (!mergeContext || !projectContext || mergeConflicts.length === 0) return

    try {
      const totalConflicts = getTotalConflicts()
      if (resolutions.size !== totalConflicts) {
        alert('Please resolve all conflicts before proceeding')
        return
      }

      // Build file resolutions by applying all conflict resolutions
      const fileResolutions: Array<{ file: string; content: string }> = []

      for (const fileConflict of mergeConflicts) {
        let content = fileConflict.fullContent

        // Replace each conflict with resolved content (in reverse order to preserve line numbers)
        const sortedConflicts = [...fileConflict.conflicts].sort(
          (a, b) => b.startLine - a.startLine
        )

        for (const conflict of sortedConflicts) {
          const resolution = resolutions.get(conflict.id)
          if (resolution) {
            const lines = content.split('\n')
            const beforeConflict = lines.slice(0, conflict.startLine - 1)
            const afterConflict = lines.slice(conflict.endLine)
            const resolvedLines = resolution.resolvedContent.split('\n')

            content = [
              ...beforeConflict,
              ...resolvedLines,
              ...afterConflict,
            ].join('\n')
          }
        }

        fileResolutions.push({
          file: fileConflict.file,
          content,
        })
      }

      const resolutionArray = fileResolutions

      if (resolutionArray.length !== mergeConflicts.length) {
        alert('Please resolve all conflicts before proceeding')
        return
      }

      console.log('Completing merge with resolutions...')

      const result = await App.completeWorktreeMerge({
        projectPath: projectContext.projectPath,
        sourceBranch: mergeContext.sourceBranch,
        worktreePath: mergeContext.worktreePath,
        resolutions: resolutionArray,
        hasStashedMainRepo: mergeContext.hasStashedMainRepo,
      })

      if (result.success) {
        console.log('Merge completed successfully!')

        // Remove the merged branch from visualization
        setNodes(prev =>
          prev.filter(node => node.id !== mergeContext.sourceBranch)
        )
        setEdges(prev =>
          prev.filter(
            edge =>
              edge.source !== mergeContext.sourceBranch &&
              edge.target !== mergeContext.sourceBranch
          )
        )

        // Reset state
        setShowConflictPanel(false)
        setMergeConflicts([])
        setResolutions(new Map())
        setMergeContext(null)

        // Reload git data
        await loadGitData()

        alert('Successfully merged and cleaned up worktree!')
      } else {
        alert(`Merge failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Error resolving conflicts:', error)
      alert('Failed to resolve conflicts')
    }
  }

  const handleAbortMerge = async () => {
    if (!mergeContext || !projectContext) return

    const confirmed = window.confirm(
      'Are you sure you want to abort this merge? All conflict resolutions will be lost.'
    )

    if (!confirmed) return

    try {
      console.log('Aborting merge...')

      const result = await App.abortWorktreeMerge({
        projectPath: projectContext.projectPath,
        hasStashedMainRepo: mergeContext.hasStashedMainRepo,
        originalBranch: mergeContext.originalBranch,
      })

      if (result.success) {
        console.log('Merge aborted successfully')

        // Reset state
        setShowConflictPanel(false)
        setMergeConflicts([])
        setResolutions(new Map())
        setMergeContext(null)

        // Reload git data
        await loadGitData()
      } else {
        alert(`Failed to abort merge: ${result.error}`)
      }
    } catch (error) {
      console.error('Error aborting merge:', error)
      alert('Failed to abort merge')
    }
  }

  if (!projectContext) {
    return (
      <div className="p-6 h-full">
        <h2 className={`text-2xl font-bold mb-4 ${themeClasses.textPrimary}`}>
          Git Overview
        </h2>
        <p className={themeClasses.textTertiary}>No project selected</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-6 h-full">
        <h2 className={`text-2xl font-bold mb-4 ${themeClasses.textPrimary}`}>
          Git Overview
        </h2>
        <p className={themeClasses.textTertiary}>Loading git data...</p>
      </div>
    )
  }

  return (
    <div
      className="flex h-full"
      style={{ backgroundColor: theme.background.primary }}
    >
      {/* Left Sidebar - Branch Tree */}
      <div
        className="w-1/6 border-r p-4 overflow-y-auto"
        style={{
          backgroundColor: theme.background.secondary,
          borderColor: theme.border.primary,
        }}
      >
        <h3
          className="text-sm font-semibold mb-4"
          style={{ color: theme.text.primary }}
        >
          Branches
        </h3>

        <div className="space-y-1">
          {Object.keys(branchTree).map(parentBranch => {
            const isExpanded = expandedParents.has(parentBranch)
            const childBranches = branchTree[parentBranch] || []

            return (
              <div key={parentBranch}>
                {/* Parent Branch Button */}
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 rounded transition-all text-left"
                  onClick={() => {
                    setSelectedBranch(parentBranch)
                    setExpandedParents(prev => {
                      const newSet = new Set(prev)
                      if (newSet.has(parentBranch)) {
                        newSet.delete(parentBranch)
                      } else {
                        newSet.add(parentBranch)
                      }
                      return newSet
                    })
                  }}
                  onMouseEnter={e => {
                    if (selectedBranch !== parentBranch) {
                      e.currentTarget.style.backgroundColor =
                        theme.background.card
                    }
                  }}
                  onMouseLeave={e => {
                    if (selectedBranch !== parentBranch) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }
                  }}
                  style={{
                    backgroundColor:
                      selectedBranch === parentBranch
                        ? theme.background.card
                        : 'transparent',
                    border: `1px solid ${selectedBranch === parentBranch ? theme.border.focus : 'transparent'}`,
                    color: theme.text.primary,
                  }}
                >
                  {childBranches.length > 0 &&
                    (isExpanded ? (
                      <CaretDown size={14} />
                    ) : (
                      <CaretRight size={14} />
                    ))}
                  <GitBranchIcon size={14} />
                  <span className="text-sm font-medium flex-1 truncate">
                    {parentBranch}
                  </span>
                  {childBranches.length > 0 && (
                    <span
                      className="text-xs"
                      style={{ color: theme.text.muted }}
                    >
                      ({childBranches.length})
                    </span>
                  )}
                </button>

                {/* Child Branches (almondcoder/) */}
                {isExpanded && childBranches.length > 0 && (
                  <div className="ml-6 mt-1 space-y-1">
                    {childBranches.map(childBranch => (
                      <button
                        className="w-full flex items-center gap-2 px-3 py-2 rounded transition-all text-left"
                        key={childBranch}
                        onClick={() => setSelectedBranch(childBranch)}
                        onMouseEnter={e => {
                          if (selectedBranch !== childBranch) {
                            e.currentTarget.style.backgroundColor =
                              theme.background.card
                          }
                        }}
                        onMouseLeave={e => {
                          if (selectedBranch !== childBranch) {
                            e.currentTarget.style.backgroundColor =
                              'transparent'
                          }
                        }}
                        style={{
                          backgroundColor:
                            selectedBranch === childBranch
                              ? theme.background.card
                              : 'transparent',
                          border: `1px solid ${selectedBranch === childBranch ? theme.border.focus : 'transparent'}`,
                          color: theme.text.secondary,
                        }}
                      >
                        <GitBranchIcon size={12} />
                        <span className="text-xs truncate">
                          {childBranch.replace('almondcoder/', '')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Right Area - ReactFlow Visualization */}
      <div className="w-5/6 p-6 flex flex-col">
        <div className="mb-4">
          <h2
            className="text-2xl font-bold mb-2"
            style={{ color: theme.text.primary }}
          >
            Git Branch Overview
          </h2>
          <p className="text-sm" style={{ color: theme.text.secondary }}>
            Project: {projectContext.projectPath.split('/').pop()} • Current:{' '}
            {gitData?.currentBranch}
          </p>
          <p className="text-xs mt-1" style={{ color: theme.text.muted }}>
            Drag branches onto each other to merge. Related branches can be
            merged together.
          </p>
        </div>

        {/* React Flow Canvas */}
        <div
          className="rounded-lg flex-1 relative overflow-hidden"
          style={{
            backgroundColor: theme.background.primary,
            border: `1px solid ${theme.border.primary}`,
          }}
        >
          <ReactFlow
            className="rounded"
            edges={edges}
            fitView
            maxZoom={2}
            minZoom={0.5}
            nodes={nodes}
            onEdgesChange={onEdgesChange}
            onNodesChange={onNodesChange}
            style={{ backgroundColor: theme.background.primary }}
          >
            <Background
              color={theme.border.primary}
              gap={16}
              size={1}
              variant="dots"
            />
          </ReactFlow>

          {/* Merge Dialog */}
          {dropAction && (
            <div
              className="absolute rounded-2xl shadow-xl p-6 z-50 min-w-[400px]"
              style={{
                left: dropAction.menuPosition.x,
                top: dropAction.menuPosition.y,
                backgroundColor: `white`,
                width: '180px',
                border: `1px solid ${theme.border.primary}`,
              }}
            >
              {/* Close button */}
              <button
                className="absolute top-4 right-4 p-2 transition-colors rounded-full"
                onClick={handleCancelMerge}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor =
                    theme.background.tertiary
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
                style={{ color: theme.text.secondary }}
              >
                <X size={20} />
              </button>

              {/* Title */}
              <div
                className="text-base font-semibold mb-6"
                style={{
                  color: theme.text.primary,
                  wordBreak: 'break-all',
                  overflowWrap: 'break-word',
                  alignItems: 'center',
                  paddingRight: '32px',
                }}
              >
                Merge {dropAction.draggedNode.id}
                <br />
                <span
                  style={{
                    color: theme.text.secondary,
                    fontSize: '14px',
                    fontWeight: 'normal',
                  }}
                >
                  into{' '}
                  {dropAction.targetNode.id === 'main' ||
                    dropAction.targetNode.id}
                </span>
              </div>

              {/* Buttons */}
              <div className="flex flex-col gap-3">
                <button
                  className="px-4 py-3 text-sm rounded-lg transition-all w-full text-center font-medium"
                  onClick={handleMergeClick}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = theme.text.secondary
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = theme.text.primary
                  }}
                  style={{
                    backgroundColor: theme.text.primary,
                    color: theme.background.card,
                  }}
                >
                  Merge Changes
                </button>
                <button
                  className="px-4 py-3 text-sm rounded-lg transition-all w-full text-center flex items-center justify-center gap-2"
                  onClick={handleDiscardChanges}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor =
                      theme.background.tertiary
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                  style={{
                    backgroundColor: 'transparent',
                    color: theme.text.secondary,
                    border: `1px solid ${theme.border.primary}`,
                  }}
                >
                  <NotePencil size={18} />
                  Discard Changes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Merge Conflicts Modal */}
      {showConflictPanel && mergeConflicts.length > 0 && (
        <>
          {/* Backdrop */}
          <div
            aria-label="Close modal"
            className="fixed inset-0 z-40"
            onClick={handleAbortMerge}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                handleAbortMerge()
              }
            }}
            role="presentation"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          />

          {/* Modal */}
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ pointerEvents: 'none' }}
          >
            <div
              className="rounded-lg w-full max-w-7xl h-[85vh] flex flex-col"
              style={{
                backgroundColor: theme.background.secondary,
                pointerEvents: 'auto',
              }}
            >
              {/* Header with all controls */}
              <div
                className="flex items-center justify-between px-6 py-4 border-b"
                style={{ borderColor: theme.border.primary }}
              >
                <div className="flex items-center gap-4">
                  <h3
                    className="text-lg font-semibold"
                    style={{ color: theme.text.primary }}
                  >
                    Merge Conflicts ({currentConflictIndex + 1}/
                    {getTotalConflicts()})
                  </h3>
                  <div className="flex gap-1">
                    <button
                      className="p-2 rounded transition-colors"
                      disabled={getTotalConflicts() === 0}
                      onClick={handlePreviousConflict}
                      style={{
                        backgroundColor: theme.background.tertiary,
                        color: theme.text.primary,
                      }}
                    >
                      <CaretLeft size={18} />
                    </button>
                    <button
                      className="p-2 rounded transition-colors"
                      disabled={getTotalConflicts() === 0}
                      onClick={handleNextConflict}
                      style={{
                        backgroundColor: theme.background.tertiary,
                        color: theme.text.primary,
                      }}
                    >
                      <CaretRight size={18} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    className="px-4 py-2 text-sm rounded transition-colors"
                    disabled
                    style={{
                      backgroundColor: theme.background.tertiary,
                      color: theme.text.muted,
                      cursor: 'not-allowed',
                      opacity: 0.5,
                    }}
                  >
                    Resolve with AI
                  </button>
                  <button
                    className="px-4 py-2 text-sm rounded transition-colors font-medium"
                    disabled={getResolvedCount() !== getTotalConflicts()}
                    onClick={handleResolveAllConflicts}
                    style={{
                      backgroundColor:
                        getResolvedCount() === getTotalConflicts()
                          ? theme.status.success
                          : theme.background.tertiary,
                      color:
                        getResolvedCount() === getTotalConflicts()
                          ? theme.text.primary
                          : theme.text.muted,
                      cursor:
                        getResolvedCount() === getTotalConflicts()
                          ? 'pointer'
                          : 'not-allowed',
                      opacity:
                        getResolvedCount() === getTotalConflicts() ? 1 : 0.6,
                    }}
                  >
                    Merge ({getResolvedCount()}/{getTotalConflicts()})
                  </button>
                  <button
                    className="p-2 rounded transition-colors"
                    onClick={handleAbortMerge}
                    style={{ color: theme.text.tertiary }}
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Body: Two pane layout */}
              <div className="flex flex-1 overflow-hidden">
                {/* Left Pane - File List */}
                <div
                  className="w-64 border-r overflow-y-auto"
                  style={{
                    borderColor: theme.border.primary,
                    backgroundColor: theme.background.tertiary,
                  }}
                >
                  <div className="p-4">
                    {mergeConflicts.map(fileConflict => {
                      const fileResolved = fileConflict.conflicts.every(c =>
                        resolutions.has(c.id)
                      )
                      const handleFileClick = () => {
                        // Jump to first conflict in this file
                        let index = 0
                        for (const fc of mergeConflicts) {
                          if (fc.file === fileConflict.file) {
                            setCurrentConflictIndex(index)
                            break
                          }
                          index += fc.conflicts.length
                        }
                      }
                      return (
                        <button
                          className="flex items-center gap-2 p-2 rounded cursor-pointer mb-1 transition-colors w-full text-left"
                          key={fileConflict.file}
                          onClick={handleFileClick}
                          style={{
                            backgroundColor:
                              getCurrentConflict()?.fileConflict.file ===
                              fileConflict.file
                                ? theme.background.primary
                                : 'transparent',
                            color: theme.text.primary,
                            border: 'none',
                          }}
                          type="button"
                        >
                          {fileResolved ? (
                            <CheckCircle
                              size={16}
                              style={{ color: theme.status.success }}
                            />
                          ) : (
                            <WarningCircle
                              size={16}
                              style={{ color: theme.status.warning }}
                            />
                          )}
                          <span className="text-sm truncate">
                            {fileConflict.file}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Right Pane - Code View */}
                <div
                  className="flex-1 overflow-y-auto p-6"
                  style={{ backgroundColor: theme.background.primary }}
                >
                  {(() => {
                    const currentConflict = getCurrentConflict()
                    if (!currentConflict) return null

                    const { fileConflict, conflict } = currentConflict
                    const lines = fileConflict.fullContent.split('\n')
                    const isResolved = resolutions.has(conflict.id)
                    const resolution = resolutions.get(conflict.id)

                    return (
                      <div>
                        <div className="mb-4">
                          <h4
                            className="text-sm font-medium mb-2"
                            style={{ color: theme.text.secondary }}
                          >
                            {fileConflict.file}
                          </h4>
                        </div>

                        <div
                          className="font-mono text-sm"
                          style={{ color: theme.text.primary }}
                        >
                          {lines.map((line, idx) => {
                            const lineNumber = idx + 1
                            const isInConflict =
                              lineNumber >= conflict.startLine &&
                              lineNumber <= conflict.endLine

                            // Detect conflict markers
                            const isConflictStart = line.startsWith('<<<<<<<')
                            const isConflictSeparator =
                              line.trim() === '======='
                            const isConflictEnd = line.startsWith('>>>>>>>')

                            // Determine background color based on position in conflict
                            let backgroundColor = 'transparent'
                            if (
                              isInConflict &&
                              !isConflictStart &&
                              !isConflictSeparator &&
                              !isConflictEnd
                            ) {
                              // Find separator line to determine if this is current or incoming
                              let separatorIdx = -1
                              for (
                                let i = conflict.startLine - 1;
                                i <= conflict.endLine - 1;
                                i++
                              ) {
                                if (lines[i] && lines[i].trim() === '=======') {
                                  separatorIdx = i
                                  break
                                }
                              }

                              if (separatorIdx !== -1) {
                                if (idx < separatorIdx) {
                                  // Current changes (before separator) - light green
                                  backgroundColor = `${theme.status.success}15`
                                } else if (idx > separatorIdx) {
                                  // Incoming changes (after separator) - light blue
                                  backgroundColor = `${theme.status.info}15`
                                }
                              }
                            } else if (
                              isConflictStart ||
                              isConflictSeparator ||
                              isConflictEnd
                            ) {
                              // Marker lines - grey
                              backgroundColor = theme.background.tertiary
                            }

                            return (
                              <div key={idx}>
                                <div
                                  className="flex"
                                  style={{ backgroundColor }}
                                >
                                  <span
                                    className="inline-block w-12 text-right mr-4 select-none"
                                    style={{ color: theme.text.muted }}
                                  >
                                    {lineNumber}
                                  </span>
                                  <span
                                    className="flex-1"
                                    style={{ whiteSpace: 'pre-wrap' }}
                                  >
                                    {line || ' '}
                                  </span>
                                </div>

                                {/* Show action buttons after conflict end marker */}
                                {isConflictEnd && (
                                  <div className="my-3 ml-16 flex items-center gap-2">
                                    {!isResolved ? (
                                      <>
                                        <button
                                          className="px-3 py-1.5 text-xs rounded transition-colors"
                                          onClick={() =>
                                            handleConflictResolution(
                                              conflict.id,
                                              'current',
                                              conflict.currentContent
                                            )
                                          }
                                          style={{
                                            backgroundColor:
                                              theme.background.tertiary,
                                            color: theme.text.primary,
                                            border: `1px solid ${theme.border.primary}`,
                                          }}
                                        >
                                          Accept Current Change
                                        </button>
                                        <button
                                          className="px-3 py-1.5 text-xs rounded transition-colors"
                                          onClick={() =>
                                            handleConflictResolution(
                                              conflict.id,
                                              'incoming',
                                              conflict.incomingContent
                                            )
                                          }
                                          style={{
                                            backgroundColor:
                                              theme.background.tertiary,
                                            color: theme.text.primary,
                                            border: `1px solid ${theme.border.primary}`,
                                          }}
                                        >
                                          Accept Incoming Change
                                        </button>
                                        <button
                                          className="px-3 py-1.5 text-xs rounded transition-colors"
                                          onClick={() =>
                                            handleConflictResolution(
                                              conflict.id,
                                              'both',
                                              `${conflict.currentContent}\n${conflict.incomingContent}`
                                            )
                                          }
                                          style={{
                                            backgroundColor:
                                              theme.background.tertiary,
                                            color: theme.text.primary,
                                            border: `1px solid ${theme.border.primary}`,
                                          }}
                                        >
                                          Accept Both Changes
                                        </button>
                                      </>
                                    ) : (
                                      <div
                                        className="flex items-center gap-2 text-sm"
                                        style={{
                                          color: theme.status.success,
                                        }}
                                      >
                                        <CheckCircle size={16} />
                                        <span>
                                          Resolved with:{' '}
                                          {resolution?.resolution}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
