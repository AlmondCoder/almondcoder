import { useEffect, useRef } from 'react'

interface StreamViewerProps {
  content: string
  isStreaming?: boolean
}

export function StreamViewer({ content, isStreaming }: StreamViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when content updates
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [content])

  // Strip ANSI escape sequences for clean display
  const stripAnsi = (str: string): string => {
    // Remove ANSI escape codes
    return str.replace(
      // eslint-disable-next-line no-control-regex
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
      ''
    )
  }

  const cleanContent = stripAnsi(content)

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        className="rounded bg-gray-800 p-3 font-mono text-sm text-gray-100 overflow-y-auto whitespace-pre-wrap break-words"
        style={{ minHeight: '100px', maxHeight: '500px' }}
      >
        {cleanContent || (isStreaming ? 'Waiting for output...' : 'No output')}
      </div>
      {isStreaming && (
        <div className="flex items-center gap-1 mt-2 text-xs text-blue-400">
          <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse"></div>
          <div
            className="w-1 h-1 bg-blue-400 rounded-full animate-pulse"
            style={{ animationDelay: '0.2s' }}
          ></div>
          <div
            className="w-1 h-1 bg-blue-400 rounded-full animate-pulse"
            style={{ animationDelay: '0.4s' }}
          ></div>
          <span className="ml-1">Streaming...</span>
        </div>
      )}
    </div>
  )
}
