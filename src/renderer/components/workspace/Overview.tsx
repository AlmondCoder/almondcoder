import { useState, useCallback, useEffect } from 'react'
import { useTheme, createThemeClasses } from '../../theme/ThemeContext'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow'
import 'reactflow/dist/style.css'

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

interface MergeConflict {
  file: string
  currentContent: string
  incomingContent: string
  currentBranch: string
  incomingBranch: string
}

interface DropAction {
  draggedNode: Node
  targetNode: Node
  originalPosition: { x: number; y: number }
  menuPosition: { x: number; y: number }
}

interface ConflictResolution {
  file: string
  content: string
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

export function Overview({
  projectContext,
}: {
  projectContext: ProjectContext
}) {
  const { theme } = useTheme()
  const _themeClasses = createThemeClasses(theme)

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
  const [resolutions, setResolutions] = useState<
    Record<string, ConflictResolution>
  >({})

  useEffect(() => {
    if (projectContext?.projectPath) {
      loadGitData()
    }
  }, [projectContext])

  const loadGitData = async () => {
    try {
      setLoading(true)
      const data = await App.getGitBranchGraph(projectContext.projectPath)
      setGitData(data)
      generateNodesAndEdges(data)
    } catch (error) {
      console.error('Error loading git data:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateNodesAndEdges = (data: GitBranchGraph) => {
    const nodePositions = new Map<string, { x: number; y: number }>()

    // Position main/master at the center
    const mainBranch = data.branches.find(
      b => b.name === 'main' || b.name === 'master'
    )
    if (mainBranch) {
      nodePositions.set(mainBranch.name, { x: 300, y: 100 })
    }

    // Position other branches around main
    const xOffset = 100
    const yOffset = 250
    const spacing = 200

    const generatedNodes: Node[] = data.branches.map((branch, index) => {
      let position = nodePositions.get(branch.name)

      if (!position) {
        position = {
          x: xOffset + (index % 3) * spacing,
          y: yOffset + Math.floor(index / 3) * 120,
        }
      }

      const nodeStyle = {
        background: branch.isCurrent
          ? '#3b82f6'
          : branch.name === 'main' || branch.name === 'master'
            ? '#059669'
            : '#6b7280',
        color: 'white',
        border: '2px solid #374151',
        borderRadius: '8px',
        fontSize: '12px',
        fontWeight: 'bold',
      }

      return {
        id: branch.name,
        type: 'default',
        position,
        data: {
          label: (
            <div style={{ padding: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', marginBottom: '4px' }}>
                {branch.name}
              </div>
              <div style={{ fontSize: '10px', opacity: 0.8 }}>
                {branch.author} • {new Date(branch.date).toLocaleDateString()}
              </div>
              <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '2px' }}>
                {branch.subject.substring(0, 30)}
                {branch.subject.length > 30 ? '...' : ''}
              </div>
            </div>
          ),
        },
        style: nodeStyle,
      }
    })

    const generatedEdges: Edge[] = data.relationships.map(rel => ({
      id: `e-${rel.source}-${rel.target}`,
      source: rel.source,
      target: rel.target,
      type: 'smoothstep',
      style: { stroke: '#6b7280', strokeWidth: 2 },
      animated: false,
    }))

    setNodes(generatedNodes)
    setEdges(generatedEdges)
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

  const handleMergeClick = async (deleteWorktree: boolean = false) => {
    if (!dropAction || !projectContext) return

    try {
      // Check for merge conflicts first
      const mergeCheck = await App.checkMergeConflicts({
        path: projectContext.projectPath,
        sourceBranch: dropAction.draggedNode.id,
        targetBranch: dropAction.targetNode.id,
      })

      if (mergeCheck.canMerge) {
        // No conflicts, proceed with merge
        const result = await App.performMerge({
          path: projectContext.projectPath,
          sourceBranch: dropAction.draggedNode.id,
          targetBranch: dropAction.targetNode.id,
        })

        if (result.success) {
          // If deleteWorktree is true, find and delete associated worktrees
          if (deleteWorktree) {
            try {
              const worktreesResult = await App.getProjectWorktrees(projectContext.projectPath)
              if (worktreesResult.success) {
                // Find worktrees associated with the merged branch
                const branchWorktrees = worktreesResult.worktrees.filter(
                  (wt: any) => wt.branch === dropAction.draggedNode.id
                )

                // Delete each associated worktree
                for (const worktree of branchWorktrees) {
                  await App.cleanupWorktree(worktree.worktreePath)
                  console.log(`Deleted worktree: ${worktree.worktreePath}`)
                }
              }
            } catch (worktreeError) {
              console.error('Error deleting worktrees:', worktreeError)
              alert('Merge successful but failed to delete associated worktrees')
            }
          }

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
        } else {
          alert(`Merge failed: ${result.error}`)
        }
      } else {
        // Show conflicts in panel
        setMergeConflicts(mergeCheck.conflicts)
        setShowConflictPanel(true)
        setDropAction(null)
      }
    } catch (error) {
      console.error('Error during merge:', error)
      alert('Failed to perform merge')
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

  const handleConflictResolution = (file: string, content: string) => {
    setResolutions(prev => ({
      ...prev,
      [file]: { file, content },
    }))
  }

  const handleResolveAllConflicts = async () => {
    if (!dropAction || mergeConflicts.length === 0) return

    try {
      const resolutionArray = Object.values(resolutions)

      if (resolutionArray.length !== mergeConflicts.length) {
        alert('Please resolve all conflicts before proceeding')
        return
      }

      const result = await App.performMerge({
        path: projectContext.projectPath,
        sourceBranch: mergeConflicts[0].incomingBranch,
        targetBranch: mergeConflicts[0].currentBranch,
        resolutions: resolutionArray,
      })

      if (result.success) {
        setShowConflictPanel(false)
        setMergeConflicts([])
        setResolutions({})
        await loadGitData()
      } else {
        alert(`Merge failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Error resolving conflicts:', error)
      alert('Failed to resolve conflicts')
    }
  }

  if (!projectContext) {
    return (
      <div className="p-6 h-full">
        <h2 className="text-2xl font-bold mb-4">Git Overview</h2>
        <p className="text-gray-400">No project selected</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-6 h-full">
        <h2 className="text-2xl font-bold mb-4">Git Overview</h2>
        <p className="text-gray-400">Loading git data...</p>
      </div>
    )
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-4">
        <h2 className="text-2xl font-bold mb-2">Git Branch Overview</h2>
        <p className="text-gray-400">
          Project: {projectContext.projectPath.split('/').pop()} • Current:{' '}
          {gitData?.currentBranch}
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Drag branches onto each other to merge. Related branches can be merged
          together.
        </p>
      </div>

      {/* React Flow Canvas */}
      <div className="bg-gray-800 rounded-lg flex-1 relative overflow-hidden">
        <ReactFlow
          className="bg-gray-900 rounded"
          edges={edges}
          fitView
          maxZoom={2}
          minZoom={0.5}
          nodes={nodes}
          onEdgesChange={onEdgesChange}
          onNodesChange={onNodesChange}
        >
          <Controls />
          <MiniMap
            className="bg-gray-800"
            nodeColor={node => {
              const style = node.style as any
              return style?.background || '#6b7280'
            }}
          />
          <Background color="#374151" gap={12} size={1} variant="dots" />
        </ReactFlow>

        {/* Compact Merge Menu */}
        {dropAction && (
          <div
            className="absolute bg-gray-700 border border-gray-600 rounded-lg shadow-lg p-3 z-50 min-w-[280px]"
            style={{
              left: dropAction.menuPosition.x,
              top: dropAction.menuPosition.y,
            }}
          >
            <div className="text-sm text-gray-300 mb-3 text-center">
              Merge "{dropAction.draggedNode.id}" → "{dropAction.targetNode.id}
              "?
            </div>
            <div className="flex flex-col gap-2">
              <button
                className="px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors w-full text-left flex items-center gap-2"
                onClick={() => handleMergeClick(true)}
              >
                <span className="text-red-400">🗑️</span>
                <span>Merge and Delete Worktree</span>
              </button>
              <button
                className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors w-full text-left flex items-center gap-2"
                onClick={() => handleMergeClick(false)}
              >
                <span className="text-green-400">✓</span>
                <span>Merge and Keep Worktree</span>
              </button>
              <button
                className="px-3 py-2 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 transition-colors w-full text-center"
                onClick={handleCancelMerge}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Merge Conflicts Panel */}
      {showConflictPanel && mergeConflicts.length > 0 && (
        <div className="mt-4 bg-gray-800 rounded-lg p-4 max-h-96 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-red-400">
              Merge Conflicts
            </h3>
            <button
              className="text-gray-400 hover:text-white"
              onClick={() => setShowConflictPanel(false)}
            >
              ✕
            </button>
          </div>

          <p className="text-sm text-gray-400 mb-4">
            Resolve conflicts in {mergeConflicts.length} file(s) before
            completing the merge.
          </p>

          <div className="space-y-4">
            {mergeConflicts.map((conflict, index) => (
              <div
                className="border border-gray-600 rounded-lg p-4"
                key={conflict.file}
              >
                <h4 className="font-medium text-yellow-400 mb-3">
                  {conflict.file}
                </h4>

                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <div className="text-sm text-gray-400 mb-2">
                      Current ({conflict.currentBranch})
                    </div>
                    <pre className="bg-gray-900 p-3 rounded text-sm overflow-x-auto">
                      {conflict.currentContent}
                    </pre>
                  </div>

                  <div>
                    <div className="text-sm text-gray-400 mb-2">
                      Incoming ({conflict.incomingBranch})
                    </div>
                    <pre className="bg-gray-900 p-3 rounded text-sm overflow-x-auto">
                      {conflict.incomingContent}
                    </pre>
                  </div>
                </div>

                <div className="flex gap-2 mb-3">
                  <button
                    className={`px-3 py-1 text-sm rounded transition-colors ${
                      resolutions[conflict.file]?.content ===
                      conflict.currentContent
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                    }`}
                    onClick={() =>
                      handleConflictResolution(
                        conflict.file,
                        conflict.currentContent
                      )
                    }
                  >
                    Use Current
                  </button>
                  <button
                    className={`px-3 py-1 text-sm rounded transition-colors ${
                      resolutions[conflict.file]?.content ===
                      conflict.incomingContent
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                    }`}
                    onClick={() =>
                      handleConflictResolution(
                        conflict.file,
                        conflict.incomingContent
                      )
                    }
                  >
                    Use Incoming
                  </button>
                </div>

                <textarea
                  className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm font-mono"
                  onChange={e =>
                    handleConflictResolution(conflict.file, e.target.value)
                  }
                  placeholder="Or manually edit the resolution..."
                  rows={4}
                  value={resolutions[conflict.file]?.content || ''}
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
              disabled={
                Object.keys(resolutions).length !== mergeConflicts.length
              }
              onClick={handleResolveAllConflicts}
            >
              Complete Merge
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
