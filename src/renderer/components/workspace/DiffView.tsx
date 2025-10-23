import { useState, useEffect } from 'react'
import { File, Plus, Minus, FileText } from 'lucide-react'
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
        return 'text-green-400'
      case 'modified':
        return 'text-yellow-400'
      case 'deleted':
        return 'text-red-400'
      default:
        return 'text-gray-400'
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
            <div className="flex items-center gap-3 text-xs mt-1">
              <span className="text-green-400 flex items-center gap-1">
                <Plus className="w-3 h-3" />
                {totalAdditions}
              </span>
              <span className="text-red-400 flex items-center gap-1">
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
                  <span className={getStatusColor(diff.status)}>
                    {getStatusIcon(diff.status)}
                  </span>
                  <span
                    className={`text-sm font-medium ${themeClasses.textPrimary}`}
                  >
                    {diff.filePath}
                  </span>
                  <span
                    className={`text-xs ${getStatusColor(diff.status)} uppercase`}
                  >
                    {diff.status}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-green-400">+{diff.additions}</span>
                    <span className="text-red-400">-{diff.deletions}</span>
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

              {/* Diff Content - Scrollable */}
              {isExpanded && (
                <div className="max-h-96 overflow-y-auto font-mono text-xs">
                  {diff.hunks.map((hunk, hunkIndex) => (
                    <div key={hunkIndex}>
                      {hunk.lines.map((line, lineIndex) => {
                        const lineKey = `${hunkIndex}-${lineIndex}`

                        if (line.type === 'header') {
                          return (
                            <div
                              className="px-3 py-1 border-t border-b sticky top-0"
                              style={{
                                backgroundColor: theme.background.tertiary,
                                color: theme.text.accent,
                                borderColor: theme.border.primary,
                              }}
                              key={lineKey}
                            >
                              {line.content}
                            </div>
                          )
                        }

                        const bgColor =
                          line.type === 'added'
                            ? isLightTheme
                              ? 'rgba(34, 197, 94, 0.08)'
                              : 'rgba(34, 197, 94, 0.12)'
                            : line.type === 'deleted'
                              ? isLightTheme
                                ? 'rgba(239, 68, 68, 0.08)'
                                : 'rgba(239, 68, 68, 0.12)'
                              : 'transparent'

                        const borderColor =
                          line.type === 'added'
                            ? isLightTheme
                              ? '#22c55e'
                              : '#4ade80'
                            : line.type === 'deleted'
                              ? isLightTheme
                                ? '#ef4444'
                                : '#f87171'
                              : 'transparent'

                        const textColor =
                          line.type === 'added'
                            ? isLightTheme
                              ? '#166534'
                              : '#86efac'
                            : line.type === 'deleted'
                              ? isLightTheme
                                ? '#991b1b'
                                : '#fca5a5'
                              : theme.text.secondary

                        return (
                          <div
                            className="flex items-start cursor-text select-text hover:brightness-95"
                            style={{
                              backgroundColor: bgColor,
                              borderLeft:
                                line.type !== 'context'
                                  ? `2px solid ${borderColor}`
                                  : 'none',
                            }}
                            key={lineKey}
                          >
                            <span
                              className="flex-shrink-0 text-right px-2 select-none"
                              style={{
                                width: '70px',
                                color: theme.text.muted,
                              }}
                            >
                              <span className="inline-block w-7 text-right">
                                {line.type === 'deleted' || line.type === 'context'
                                  ? line.oldLineNumber || ''
                                  : ''}
                              </span>
                              <span className="inline-block w-7 text-right ml-1">
                                {line.type === 'added' || line.type === 'context'
                                  ? line.newLineNumber || ''
                                  : ''}
                              </span>
                            </span>
                            <pre
                              className="flex-1 px-3 py-0.5 m-0 whitespace-pre-wrap break-all"
                              style={{
                                color: textColor,
                                fontFamily: 'inherit',
                              }}
                            >
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
