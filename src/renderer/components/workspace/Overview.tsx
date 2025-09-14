import { useState, useCallback } from 'react'
import { ReactFlow, MiniMap, Controls, Background, type Node, type Edge, type OnNodesChange, type OnEdgesChange, applyNodeChanges, applyEdgeChanges, type NodeChange } from 'reactflow'
import 'reactflow/dist/style.css'

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'default',
    position: { x: 100, y: 100 },
    data: { label: 'Rectangle 1' },
  },
  {
    id: '2',
    type: 'default',
    position: { x: 300, y: 100 },
    data: { label: 'Rectangle 2' },
  },
  {
    id: '3',
    type: 'default',
    position: { x: 200, y: 250 },
    data: { label: 'Rectangle 3' },
  },
]

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3' },
]

interface DropAction {
  draggedNode: Node
  targetNode: Node
  originalPosition: { x: number; y: number }
}

const checkNodesOverlap = (node1: Node, node2: Node): boolean => {
  const nodeWidth = 150
  const nodeHeight = 40

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

  return !(rect1.right < rect2.left ||
           rect2.right < rect1.left ||
           rect1.bottom < rect2.top ||
           rect2.bottom < rect1.top)
}

const canMerge = (draggedNodeId: string, targetNodeId: string, edges: Edge[]): boolean => {
  const hasDirectConnection = edges.some(edge => edge.source === draggedNodeId && edge.target === targetNodeId)
  const hasOutgoingConnection = edges.some(edge => edge.source === draggedNodeId)

  return hasDirectConnection && hasOutgoingConnection && !edges.some(edge => edge.source === draggedNodeId && edge.target !== targetNodeId)
}

export function Overview() {
  const [nodes, setNodes] = useState<Node[]>(initialNodes)
  const [edges, setEdges] = useState<Edge[]>(initialEdges)
  const [dropAction, setDropAction] = useState<DropAction | null>(null)
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null)
  const [originalPositions, setOriginalPositions] = useState<Record<string, { x: number; y: number }>>({})

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type === 'position' && change.dragging && change.position) {
          const draggedNode = nodes.find(n => n.id === change.id)
          if (!draggedNode) continue

          if (change.dragging && !draggedNodeId) {
            setDraggedNodeId(change.id)
            setOriginalPositions(prev => ({
              ...prev,
              [change.id]: draggedNode.position
            }))
          }

          const updatedNode = { ...draggedNode, position: change.position }

          for (const node of nodes) {
            if (node.id !== change.id && checkNodesOverlap(updatedNode, node)) {
              if (canMerge(change.id, node.id, edges)) {
                const originalPos = originalPositions[change.id] || draggedNode.position
                setDropAction({
                  draggedNode: updatedNode,
                  targetNode: node,
                  originalPosition: originalPos
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

      setNodes((nds) => applyNodeChanges(changes, nds))
    },
    [nodes, draggedNodeId, originalPositions]
  )

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  )

  const handleMerge = () => {
    if (!dropAction) return

    setNodes(prev => prev.filter(node => node.id !== dropAction.draggedNode.id))
    setEdges(prev => prev.filter(edge =>
      edge.source !== dropAction.draggedNode.id && edge.target !== dropAction.draggedNode.id
    ))
    setDropAction(null)
  }

  const handleCancel = () => {
    if (!dropAction) return

    setNodes(prev => prev.map(node =>
      node.id === dropAction.draggedNode.id
        ? { ...node, position: dropAction.originalPosition }
        : node
    ))
    setDropAction(null)
  }

  return (
    <div className="p-6 h-full">
      <h2 className="text-2xl font-bold mb-4">Components Overview</h2>
      <div className="bg-gray-800 rounded-lg p-4 h-96 relative">
        <h3 className="text-lg font-semibold mb-2">React Flow Example - Only leaf nodes can merge!</h3>
        <div className="h-80">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
            className="bg-gray-900 rounded"
          >
            <Controls />
            <MiniMap />
            <Background variant="dots" gap={12} size={1} />
          </ReactFlow>
        </div>

        {dropAction && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <h4 className="text-lg font-semibold mb-4 text-gray-800">
                Merge "{dropAction.draggedNode.data.label}" into "{dropAction.targetNode.data.label}"?
              </h4>
              <div className="flex gap-4">
                <button
                  onClick={handleMerge}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                >
                  Merge
                </button>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}