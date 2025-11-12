import { useState, useEffect } from 'react'
import { File, Plus, Minus, FileText } from '@phosphor-icons/react'
import { useTheme, createThemeClasses } from '../../theme/ThemeContext'

interface DiffViewProps {
  projectPath: string
  worktreePath: string
}

interface FileDiff {
  filePath: string
  status: 'added' | 'modified' | 'deleted'
  additions: number
  deletions: number
  hunks: DiffHunk[]
}

interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

interface DiffLine {
  type: 'added' | 'deleted' | 'context' | 'header'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

export function DiffView({ projectPath, worktreePath }: DiffViewProps) {
  const { theme, themeName } = useTheme()
  const themeClasses = createThemeClasses(theme)
  const isLightTheme = themeName === 'light'

  const [diffs, setDiffs] = useState<FileDiff[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadGitDiff()
  }, [projectPath, worktreePath])

  const loadGitDiff = async () => {
    setLoading(true)
    setError(null)

    try {
      // Use worktreePath if available, otherwise fall back to projectPath
      const pathToUse = worktreePath || projectPath

      if (!pathToUse) {
        setError('No project path or worktree path available')
        setLoading(false)
        return
      }

      console.log('Loading git diff for path:', pathToUse)
      const diffResult = await window.App.getGitDiff(pathToUse)

      if (diffResult.error) {
        setError(diffResult.error)
        setDiffs([])
      } else {
        setDiffs(diffResult.diffs || [])
        // Automatically expand all files
        setExpandedFiles(
          new Set(diffResult.diffs?.map((d: FileDiff) => d.filePath) || [])
        )
      }
    } catch (err) {
      console.error('Error loading git diff:', err)
      setError(err instanceof Error ? err.message : 'Failed to load git diff')
      setDiffs([])
    } finally {
      setLoading(false)
    }
  }

  const toggleFileExpansion = (filePath: string) => {
    setExpandedFiles(prev => {
      const newSet = new Set(prev)
      if (newSet.has(filePath)) {
        newSet.delete(filePath)
      } else {
        newSet.add(filePath)
      }
      return newSet
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'added':
        return '#22c55e' // green-400
      case 'modified':
        return '#bf8700' // GitHub modified yellow
      case 'deleted':
        return '#f87171' // red-400
      default:
        return '#9ca3af' // gray-400
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'added':
        return <Plus className="w-4 h-4" />
      case 'deleted':
        return <Minus className="w-4 h-4" />
      case 'modified':
        return <FileText className="w-4 h-4" />
      default:
        return <File className="w-4 h-4" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className={`text-center ${themeClasses.textSecondary}`}>
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
          <p>Loading git diff...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className={`${themeClasses.bgSecondary} border ${themeClasses.borderPrimary} rounded-lg p-6`}
      >
        <div className="flex items-start gap-3">
          <div className="text-red-400 text-xl">⚠️</div>
          <div>
            <h3
              className={`text-lg font-semibold ${themeClasses.textPrimary} mb-2`}
            >
              Error Loading Diff
            </h3>
            <p className={`text-sm ${themeClasses.textSecondary} mb-4`}>
              {error}
            </p>
            <button
              className={`${themeClasses.btnSecondary} px-4 py-2 rounded text-sm font-medium`}
              onClick={loadGitDiff}
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (diffs.length === 0) {
    return (
      <div
        className={`${themeClasses.bgSecondary} border ${themeClasses.borderPrimary} rounded-lg p-8 text-center`}
      >
        <div className="text-gray-400 text-5xl mb-4">📝</div>
        <h3
          className={`text-lg font-semibold ${themeClasses.textPrimary} mb-2`}
        >
          No Changes
        </h3>
        <p className={`text-sm ${themeClasses.textSecondary}`}>
          There are no changes in this worktree compared to the last commit.
        </p>
      </div>
    )
  }

  // Calculate total stats
  const totalAdditions = diffs.reduce((sum, diff) => sum + diff.additions, 0)
  const totalDeletions = diffs.reduce((sum, diff) => sum + diff.deletions, 0)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Summary Header */}
      <div
        className={`${themeClasses.bgSecondary} border ${themeClasses.borderPrimary} rounded-lg p-3 mb-3 flex-shrink-0`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className={`text-sm font-semibold ${themeClasses.textPrimary}`}>
              {diffs.length} file{diffs.length !== 1 ? 's' : ''} changed
            </h3>
            <div className="flex items-center gap-3 text-xs mt-1 text-gray-400">
              <span className="flex items-center gap-1">
                <Plus className="w-3 h-3" />
                {totalAdditions}
              </span>
              <span className="flex items-center gap-1">
                <Minus className="w-3 h-3" />
                {totalDeletions}
              </span>
            </div>
          </div>
          <button
            className={`${themeClasses.btnSecondary} px-3 py-1.5 rounded text-xs font-medium`}
            onClick={loadGitDiff}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* File Diffs - Scrollable */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-2">
        {diffs.map(diff => {
          const isExpanded = expandedFiles.has(diff.filePath)

          return (
            <div
              className={`${themeClasses.bgSecondary} border ${themeClasses.borderPrimary} rounded-lg overflow-hidden`}
              key={diff.filePath}
            >
              {/* File Header */}
              <button
                className={`w-full ${themeClasses.bgTertiary} p-3 flex items-center justify-between hover:opacity-80 transition-opacity`}
                onClick={() => toggleFileExpansion(diff.filePath)}
              >
                <div className="flex items-center gap-3">
                  <span style={{ color: getStatusColor(diff.status) }}>
                    {getStatusIcon(diff.status)}
                  </span>
                  <span
                    className={`text-sm font-medium ${themeClasses.textPrimary}`}
                  >
                    {diff.filePath}
                  </span>
                  <span
                    className="text-xs uppercase"
                    style={{ color: getStatusColor(diff.status) }}
                  >
                    {diff.status}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>+{diff.additions}</span>
                    <span>-{diff.deletions}</span>
                  </div>
                  <svg
                    className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M19 9l-7 7-7-7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                    />
                  </svg>
                </div>
              </button>

              {/* Diff Content - GitHub-style diff view */}
              {isExpanded && (
                <div className="font-mono text-xs">
                  {diff.hunks.map((hunk, hunkIndex) => (
                    <div key={hunkIndex}>
                      {hunk.lines.map((line, lineIndex) => {
                        const lineKey = `${hunkIndex}-${lineIndex}`

                        if (line.type === 'header') {
                          return (
                            <div
                              className="px-3 py-2 font-semibold"
                              key={lineKey}
                              style={{
                                backgroundColor: '#f6f8fa',
                                color: '#57606a',
                                borderTop: '1px solid #d0d7de',
                                borderBottom: '1px solid #d0d7de',
                              }}
                            >
                              {line.content}
                            </div>
                          )
                        }

                        // GitHub-style colors (light theme)
                        const bgColor =
                          line.type === 'added'
                            ? '#dafbe1' // GitHub light green background
                            : line.type === 'deleted'
                              ? '#ffebe9' // GitHub light red background
                              : 'transparent'

                        const textColor = '#1f2328' // GitHub text color

                        const lineNumberBg =
                          line.type === 'added'
                            ? '#bef5be' // GitHub light green for line numbers
                            : line.type === 'deleted'
                              ? '#ffd7d5' // GitHub light red for line numbers
                              : 'transparent'

                        const lineNumberColor = '#57606a'

                        const signColor =
                          line.type === 'added'
                            ? '#1a7f37' // GitHub green plus sign
                            : line.type === 'deleted'
                              ? '#cf222e' // GitHub red minus sign
                              : 'transparent'

                        return (
                          <div
                            className="flex items-start hover:bg-opacity-80"
                            key={lineKey}
                            style={{
                              backgroundColor: bgColor,
                            }}
                          >
                            {/* Line numbers section */}
                            <div
                              className="flex-shrink-0 select-none flex"
                              style={{
                                backgroundColor: lineNumberBg || '#ffffff',
                              }}
                            >
                              {/* Old line number */}
                              <span
                                className="inline-block text-right px-2 py-0.5"
                                style={{
                                  width: '50px',
                                  color: lineNumberColor,
                                  fontSize: '12px',
                                  lineHeight: '20px',
                                }}
                              >
                                {line.type === 'deleted' ||
                                line.type === 'context'
                                  ? line.oldLineNumber || ''
                                  : ''}
                              </span>
                              {/* New line number */}
                              <span
                                className="inline-block text-right px-2 py-0.5"
                                style={{
                                  width: '50px',
                                  color: lineNumberColor,
                                  fontSize: '12px',
                                  lineHeight: '20px',
                                  borderLeft: '1px solid #d0d7de',
                                }}
                              >
                                {line.type === 'added' ||
                                line.type === 'context'
                                  ? line.newLineNumber || ''
                                  : ''}
                              </span>
                            </div>

                            {/* Content section */}
                            <pre
                              className="flex-1 px-2 py-0.5 m-0 whitespace-pre overflow-x-visible cursor-text select-text"
                              style={{
                                color: textColor,
                                fontFamily:
                                  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                                fontSize: '12px',
                                lineHeight: '20px',
                              }}
                            >
                              {line.type === 'added' && (
                                <span
                                  style={{
                                    color: signColor,
                                    marginRight: '4px',
                                  }}
                                >
                                  +
                                </span>
                              )}
                              {line.type === 'deleted' && (
                                <span
                                  style={{
                                    color: signColor,
                                    marginRight: '4px',
                                  }}
                                >
                                  -
                                </span>
                              )}
                              {line.type === 'context' && (
                                <span
                                  style={{ marginRight: '4px', opacity: 0 }}
                                >
                                  ·
                                </span>
                              )}
                              {line.content}
                            </pre>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
