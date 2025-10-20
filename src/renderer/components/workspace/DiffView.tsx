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
  const { theme } = useTheme()
  const themeClasses = createThemeClasses(theme)

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
    <div className="space-y-4">
      {/* Summary Header */}
      <div
        className={`${themeClasses.bgSecondary} border ${themeClasses.borderPrimary} rounded-lg p-4`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3
              className={`text-md font-semibold ${themeClasses.textPrimary} mb-1`}
            >
              {diffs.length} file{diffs.length !== 1 ? 's' : ''} changed
            </h3>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-green-400 flex items-center gap-1">
                <Plus className="w-3 h-3" />
                {totalAdditions} addition{totalAdditions !== 1 ? 's' : ''}
              </span>
              <span className="text-red-400 flex items-center gap-1">
                <Minus className="w-3 h-3" />
                {totalDeletions} deletion{totalDeletions !== 1 ? 's' : ''}
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

      {/* File Diffs */}
      <div className="space-y-3">
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

              {/* Diff Content */}
              {isExpanded && (
                <div className="font-mono text-xs">
                  {diff.hunks.map((hunk, hunkIndex) => (
                    <div key={hunkIndex}>
                      {hunk.lines.map((line, lineIndex) => {
                        const lineKey = `${hunkIndex}-${lineIndex}`

                        if (line.type === 'header') {
                          return (
                            <div
                              className="bg-blue-900/20 text-blue-300 px-4 py-1 border-t border-b border-blue-900/30"
                              key={lineKey}
                            >
                              {line.content}
                            </div>
                          )
                        }

                        const bgColor =
                          line.type === 'added'
                            ? 'bg-green-900/20 border-l-2 border-green-500'
                            : line.type === 'deleted'
                              ? 'bg-red-900/20 border-l-2 border-red-500'
                              : 'bg-transparent'

                        const textColor =
                          line.type === 'added'
                            ? 'text-green-200'
                            : line.type === 'deleted'
                              ? 'text-red-200'
                              : 'text-gray-400'

                        return (
                          <div
                            className={`${bgColor} ${textColor} px-4 py-0.5 flex items-start`}
                            key={lineKey}
                          >
                            <span className="w-16 text-gray-500 select-none flex-shrink-0 text-right mr-4">
                              {line.type === 'deleted' ||
                              line.type === 'context'
                                ? line.oldLineNumber || ''
                                : ''}
                              {' | '}
                              {line.type === 'added' || line.type === 'context'
                                ? line.newLineNumber || ''
                                : ''}
                            </span>
                            <span className="flex-1 whitespace-pre-wrap break-all">
                              {line.content}
                            </span>
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
