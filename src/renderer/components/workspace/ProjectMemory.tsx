import { useState, useEffect, useRef } from 'react'
import { Save, Brain, Sparkles, Loader2 } from 'lucide-react'
import { Crepe } from '@milkdown/crepe'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { useTheme, createThemeClasses } from '../../theme/ThemeContext'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

// Prompt for generating CLAUDE.md via Claude Code workflow
const GENERATE_CLAUDE_MD_PROMPT = `Please analyze this codebase thoroughly and generate a comprehensive CLAUDE.md file for project memory.

Include these sections:

1. **Project Overview** - What this project does, key technologies used, package manager, and purpose

2. **Development Commands** - How to run, build, test, and lint the project

3. **Architecture** - Process architecture (Electron main/renderer/preload), key files and directories, data flow patterns

4. **Important Implementation Notes** - Critical patterns, gotchas, configuration details, IPC communication patterns

5. **Type System** - Key interfaces and type definitions location

6. **Build Configuration** - Build tools, output targets, platform support

Be thorough and technical. Focus on information that would help an AI assistant understand and work with this codebase effectively.

Write the file to CLAUDE.md in the project root.`

interface ProjectMemoryProps {
  projectPath: string
}

// Crepe Editor Component
function CrepeEditor({
  content,
  onContentChange,
  isLightTheme,
}: {
  content: string
  onContentChange: (markdown: string) => void
  isLightTheme: boolean
}) {
  const { get } = useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: content,
      features: {
        [Crepe.Feature.CodeMirror]: true,
        [Crepe.Feature.ListItem]: true,
        [Crepe.Feature.BlockEdit]: true,
        [Crepe.Feature.Clipboard]: true,
        [Crepe.Feature.Cursor]: true,
        [Crepe.Feature.LinkTooltip]: true,
        [Crepe.Feature.ImageBlock]: true,
        [Crepe.Feature.Toolbar]: true,
        [Crepe.Feature.LaTeX]: false,
      },
    })

    // Listen to content changes
    crepe.editor.onStatusChange((status) => {
      if (status === 'ready') {
        crepe.editor.action((ctx) => {
          const listener = ctx.get(crepe.listener)
          listener.markdownUpdated((ctx, markdown) => {
            onContentChange(markdown)
          })
        })
      }
    })

    return crepe.editor
  })

  return (
    <div
      className={`milkdown-crepe-editor h-full ${
        isLightTheme ? 'crepe-theme-light' : 'crepe-theme-dark'
      }`}
      data-theme={isLightTheme ? 'light' : 'dark'}
    >
      <Milkdown />
    </div>
  )
}

export function ProjectMemory({ projectPath }: ProjectMemoryProps) {
  const { theme, themeName } = useTheme()
  const themeClasses = createThemeClasses(theme)
  const isLightTheme = themeName === 'light'

  const [markdownContent, setMarkdownContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const contentRef = useRef('')

  // Load project memory when component mounts or project changes
  useEffect(() => {
    const loadProjectMemory = async () => {
      if (!projectPath) return

      try {
        const content = await window.App.readProjectMemory(projectPath)
        const loadedContent =
          content ||
          '# Project Memory\n\nStart writing your project notes here...'
        setMarkdownContent(loadedContent)
        contentRef.current = loadedContent
        setIsLoaded(true)
      } catch (error) {
        console.error('Error loading project memory:', error)
        const defaultContent =
          '# Project Memory\n\nStart writing your project notes here...'
        setMarkdownContent(defaultContent)
        contentRef.current = defaultContent
        setIsLoaded(true)
      }
    }

    setIsLoaded(false)
    loadProjectMemory()
  }, [projectPath])

  // Handle content changes from editor
  const handleContentChange = (markdown: string) => {
    contentRef.current = markdown
  }

  // Save project memory
  const handleSave = async () => {
    if (!projectPath) {
      setSaveMessage('No project selected')
      setTimeout(() => setSaveMessage(null), 3000)
      return
    }

    setIsSaving(true)
    setSaveMessage(null)

    try {
      const currentContent = contentRef.current
      await window.App.saveProjectMemory(projectPath, currentContent)
      setLastSaved(new Date())
      setSaveMessage('Saved successfully!')
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (error) {
      console.error('Error saving project memory:', error)
      setSaveMessage('Failed to save')
      setTimeout(() => setSaveMessage(null), 3000)
    } finally {
      setIsSaving(false)
    }
  }

  // Generate CLAUDE.md using Claude Code workflow
  const handleGenerate = async () => {
    if (!projectPath) {
      setSaveMessage('No project selected')
      setTimeout(() => setSaveMessage(null), 3000)
      return
    }

    setIsGenerating(true)
    setSaveMessage('Generating CLAUDE.md with AI...')

    try {
      // Execute Claude SDK with the generation prompt
      await window.App.executeClaudeSDK(
        {
          prompt: GENERATE_CLAUDE_MD_PROMPT,
          workingDirectory: projectPath,
          allowedTools: ['Read', 'Glob', 'Grep', 'Write', 'Edit'],
          permissionMode: 'acceptEdits',
        },
        (output) => {
          // Optional: Log streaming progress
          console.log('Generation progress:', output)
        }
      )

      // Wait a moment for file system to settle
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // Reload the content from the newly generated file
      const content = await window.App.readProjectMemory(projectPath)
      if (content) {
        setMarkdownContent(content)
        contentRef.current = content
        setSaveMessage('CLAUDE.md generated successfully!')
      } else {
        setSaveMessage('Generation completed, but file may be empty')
      }

      setTimeout(() => setSaveMessage(null), 3000)
    } catch (error) {
      console.error('Failed to generate CLAUDE.md:', error)
      setSaveMessage('Failed to generate CLAUDE.md')
      setTimeout(() => setSaveMessage(null), 3000)
    } finally {
      setIsGenerating(false)
    }
  }

  // Auto-save on Cmd+S / Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [projectPath])

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header with Save Button */}
      <div
        className={`flex items-center justify-between px-6 py-4 border-b ${themeClasses.borderPrimary} flex-shrink-0`}
      >
        <div className="flex items-center gap-3">
          <Brain
            className={`w-5 h-5 ${isLightTheme ? 'text-gray-600' : themeClasses.textSecondary}`}
          />
          <h2 className={`text-xl font-semibold ${themeClasses.textPrimary}`}>
            Project Memory
          </h2>
          {lastSaved && (
            <span className={`text-xs ${themeClasses.textTertiary}`}>
              Last saved: {lastSaved.toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {saveMessage && (
            <span
              className={`text-sm ${
                saveMessage.includes('Failed')
                  ? 'text-red-500'
                  : 'text-green-500'
              }`}
            >
              {saveMessage}
            </span>
          )}
          <button
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              isLightTheme
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700'
                : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
            } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!projectPath || isGenerating}
            onClick={handleGenerate}
            title="AI Generate Memory"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {isGenerating ? 'Generating...' : 'Generate'}
          </button>
          <button
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              isSaving
                ? isLightTheme
                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : isLightTheme
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-purple-500 text-white hover:bg-purple-600'
            }`}
            disabled={isSaving || !projectPath}
            onClick={handleSave}
            title="Save (Cmd+S / Ctrl+S)"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Crepe Editor */}
      <div className="flex-1 overflow-hidden">
        {!isLoaded ? (
          <div
            className={`flex items-center justify-center h-full ${themeClasses.textTertiary}`}
          >
            <div className="text-center">
              <Brain className="w-16 h-16 mx-auto mb-4 opacity-30 animate-pulse" />
              <p className="text-lg">Loading...</p>
            </div>
          </div>
        ) : (
          <MilkdownProvider key={markdownContent}>
            <CrepeEditor
              content={markdownContent}
              onContentChange={handleContentChange}
              isLightTheme={isLightTheme}
            />
          </MilkdownProvider>
        )}
      </div>
    </div>
  )
}
