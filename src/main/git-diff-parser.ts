/**
 * Git Diff Parser
 * Based on gitdiff-parser by ecomfe (https://github.com/ecomfe/gitdiff-parser)
 * Converted to TypeScript with modern syntax
 */

export interface GitDiffFile {
  oldPath: string
  newPath: string
  type: 'add' | 'delete' | 'modify' | 'rename' | 'copy'
  hunks: GitDiffHunk[]
  oldRevision?: string
  newRevision?: string
  oldMode?: string
  newMode?: string
  similarity?: number
  isBinary?: boolean
  oldEndingNewLine: boolean
  newEndingNewLine: boolean
}

export interface GitDiffHunk {
  content: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  changes: GitDiffChange[]
}

export interface GitDiffChange {
  type: 'normal' | 'insert' | 'delete'
  content: string
  lineNumber?: number
  oldLineNumber?: number
  newLineNumber?: number
  isNormal?: boolean
  isInsert?: boolean
  isDelete?: boolean
}

interface ParsedPath {
  oldPath: string
  newPath: string
}

function parsePathFromFirstLine(line: string): ParsedPath {
  const filesStr = line.slice(11)
  let oldPath = ''
  let newPath = ''

  const quoteIndex = filesStr.indexOf('"')

  switch (quoteIndex) {
    case -1: {
      // No quotes: diff --git a/file.txt b/file.txt
      const segs = filesStr.split(' ')
      oldPath = segs[0].slice(2) // Remove "a/"
      newPath = segs[1].slice(2) // Remove "b/"
      break
    }

    case 0: {
      // Starts with quote: diff --git "a/file.txt" "b/file.txt"
      const nextQuoteIndex = filesStr.indexOf('"', 2)
      oldPath = filesStr.slice(3, nextQuoteIndex)
      const newQuoteIndex = filesStr.indexOf('"', nextQuoteIndex + 1)
      if (newQuoteIndex < 0) {
        newPath = filesStr.slice(nextQuoteIndex + 4)
      } else {
        newPath = filesStr.slice(newQuoteIndex + 3, -1)
      }
      break
    }

    default: {
      // Quote in middle: diff --git a/file.txt "b/file name.txt"
      const segs = filesStr.split(' ')
      oldPath = segs[0].slice(2)
      newPath = segs[1].slice(3, -1)
      break
    }
  }

  return { oldPath, newPath }
}

export function parseGitDiff(source: string): GitDiffFile[] {
  const infos: GitDiffFile[] = []
  let currentInfo: GitDiffFile | null = null
  let currentHunk: GitDiffHunk | null = null
  let changeOldLine = 0
  let changeNewLine = 0

  const lines = source.split('\n')
  const linesLen = lines.length
  let i = 0

  while (i < linesLen) {
    const line = lines[i]

    if (line.indexOf('diff --git') === 0) {
      // Parse file header
      const paths = parsePathFromFirstLine(line)
      currentInfo = {
        hunks: [],
        oldEndingNewLine: true,
        newEndingNewLine: true,
        oldPath: paths.oldPath,
        newPath: paths.newPath,
        type: 'modify',
      }

      infos.push(currentInfo)

      let currentInfoType:
        | 'add'
        | 'delete'
        | 'modify'
        | 'rename'
        | 'copy'
        | null = null

      // Parse file metadata
      let simiLine: string | undefined
      simiLoop: while ((simiLine = lines[++i])) {
        const spaceIndex = simiLine.indexOf(' ')
        const infoType =
          spaceIndex > -1 ? simiLine.slice(0, spaceIndex) : simiLine

        switch (infoType) {
          case 'diff':
            // Next file starts
            i--
            break simiLoop

          case 'deleted':
          case 'new': {
            const leftStr = simiLine.slice(spaceIndex + 1)
            if (leftStr.indexOf('file mode') === 0) {
              if (infoType === 'new') {
                currentInfo.newMode = leftStr.slice(10)
              } else {
                currentInfo.oldMode = leftStr.slice(10)
              }
            }
            break
          }

          case 'similarity':
            currentInfo.similarity = parseInt(simiLine.split(' ')[2], 10)
            break

          case 'index': {
            const segs = simiLine.slice(spaceIndex + 1).split(' ')
            const revs = segs[0].split('..')
            currentInfo.oldRevision = revs[0]
            currentInfo.newRevision = revs[1]

            if (segs[1]) {
              currentInfo.oldMode = currentInfo.newMode = segs[1]
            }
            break
          }

          case 'copy':
          case 'rename': {
            const infoStr = simiLine.slice(spaceIndex + 1)
            if (infoStr.indexOf('from') === 0) {
              currentInfo.oldPath = infoStr.slice(5)
            } else {
              // rename to / copy to
              currentInfo.newPath = infoStr.slice(3)
            }
            currentInfoType = infoType
            break
          }

          case '---': {
            let oldPath = simiLine.slice(spaceIndex + 1)
            let newPath = lines[++i].slice(4) // Next line must be "+++ xxx"

            if (oldPath === '/dev/null') {
              newPath = newPath.slice(2)
              currentInfoType = 'add'
            } else if (newPath === '/dev/null') {
              oldPath = oldPath.slice(2)
              currentInfoType = 'delete'
            } else {
              currentInfoType = 'modify'
              oldPath = oldPath.slice(2)
              newPath = newPath.slice(2)
            }

            if (oldPath) {
              currentInfo.oldPath = oldPath
            }
            if (newPath) {
              currentInfo.newPath = newPath
            }
            break simiLoop
          }
        }
      }

      currentInfo.type = currentInfoType || 'modify'
    } else if (line.indexOf('Binary') === 0) {
      // Binary file
      if (currentInfo) {
        currentInfo.isBinary = true
        currentInfo.type =
          line.indexOf('/dev/null and') >= 0
            ? 'add'
            : line.indexOf('and /dev/null') >= 0
              ? 'delete'
              : 'modify'
      }
      currentInfo = null
    } else if (currentInfo && line.indexOf('@@') === 0) {
      // Hunk header
      const match = /^@@\s+-(\d+)(,(\d+))?\s+\+(\d+)(,(\d+))?/.exec(line)
      if (match) {
        currentHunk = {
          content: line,
          oldStart: parseInt(match[1], 10),
          newStart: parseInt(match[4], 10),
          oldLines: parseInt(match[3], 10) || 1,
          newLines: parseInt(match[6], 10) || 1,
          changes: [],
        }

        currentInfo.hunks.push(currentHunk)
        changeOldLine = currentHunk.oldStart
        changeNewLine = currentHunk.newStart
      }
    } else if (currentHunk && currentInfo) {
      // Change line
      const typeChar = line.slice(0, 1)
      const change: GitDiffChange = {
        type: 'normal',
        content: line.slice(1),
      }

      switch (typeChar) {
        case '+':
          change.type = 'insert'
          change.isInsert = true
          change.lineNumber = changeNewLine
          changeNewLine++
          break

        case '-':
          change.type = 'delete'
          change.isDelete = true
          change.lineNumber = changeOldLine
          changeOldLine++
          break

        case ' ':
          change.type = 'normal'
          change.isNormal = true
          change.oldLineNumber = changeOldLine
          change.newLineNumber = changeNewLine
          changeOldLine++
          changeNewLine++
          break

        case '\\': {
          // "\ No newline at end of file"
          const lastChange = currentHunk.changes[currentHunk.changes.length - 1]
          if (lastChange) {
            if (!lastChange.isDelete) {
              currentInfo.newEndingNewLine = false
            }
            if (!lastChange.isInsert) {
              currentInfo.oldEndingNewLine = false
            }
          }
          // Don't add this line to changes
          i++
          continue
        }
      }

      if (change.type) {
        currentHunk.changes.push(change)
      }
    }

    i++
  }

  return infos
}
