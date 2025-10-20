import { useState, useEffect } from 'react'
import { Save, Brain, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTheme, createThemeClasses } from '../../theme/ThemeContext'

interface ProjectMemoryProps {
  projectPath: string
}

export function ProjectMemory({ projectPath }: ProjectMemoryProps) {
  const { theme, themeName } = useTheme()
  const themeClasses = createThemeClasses(theme)
  const isLightTheme = themeName === 'light'

  const [markdownContent, setMarkdownContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Load project memory when component mounts or project changes
  useEffect(() => {
    const loadProjectMemory = async () => {
      if (!projectPath) return

      try {
        const content = await window.App.readProjectMemory(projectPath)
        setMarkdownContent(content || '')
      } catch (error) {
        console.error('Error loading project memory:', error)
        setMarkdownContent('')
      }
    }

    loadProjectMemory()
  }, [projectPath])

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
      await window.App.saveProjectMemory(projectPath, markdownContent)
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
  }, [markdownContent, projectPath])

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
          <h2
            className={`text-xl font-semibold ${themeClasses.textPrimary}`}
          >
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
            }`}
            disabled={!projectPath}
            onClick={() => {
              console.log('Generate button clicked - backend to be implemented')
            }}
            title="AI Generate Memory"
          >
            <Sparkles className="w-4 h-4" />
            Generate
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

      {/* Split View - Editor and Preview */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Side - Markdown Editor */}
        <div
          className={`w-1/2 border-r ${themeClasses.borderPrimary} flex flex-col overflow-hidden`}
        >
          <div
            className={`px-4 py-2 text-xs font-medium ${themeClasses.textSecondary} border-b ${themeClasses.borderPrimary} flex-shrink-0`}
          >
            EDITOR
          </div>
          <textarea
            className={`flex-1 w-full p-6 resize-none focus:outline-none font-mono text-sm leading-relaxed ${
              isLightTheme
                ? 'bg-white text-gray-900 placeholder-gray-400'
                : 'bg-gray-900 text-gray-100 placeholder-gray-500'
            } overflow-y-auto`}
            onChange={e => setMarkdownContent(e.target.value)}
            placeholder="# Project Memory

Write your project notes, architecture decisions, important context, and anything you want to remember about this project...

## Example Sections

### Architecture Overview
Describe your project structure here...

### Key Decisions
- Decision 1: Why we chose X over Y
- Decision 2: Important tradeoffs

### Important Context
Things the AI should know when working on this project..."
            spellCheck={false}
            value={markdownContent}
          />
        </div>

        {/* Right Side - Markdown Preview */}
        <div
          className={`w-1/2 flex flex-col overflow-hidden ${isLightTheme ? 'bg-gray-50' : 'bg-gray-900'}`}
        >
          <div
            className={`px-4 py-2 text-xs font-medium ${themeClasses.textSecondary} border-b ${themeClasses.borderPrimary} flex-shrink-0`}
          >
            PREVIEW
          </div>
          <div
            className={`flex-1 overflow-y-auto p-6 ${isLightTheme ? 'bg-white' : 'bg-gray-900'}`}
          >
            {markdownContent ? (
              <div
                className={`markdown-preview max-w-4xl mx-auto ${
                  isLightTheme ? 'text-gray-900' : 'text-gray-100'
                }`}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ node, ...props }) => (
                      <h1
                        className={`text-4xl font-bold mb-6 mt-8 ${isLightTheme ? 'text-gray-900' : 'text-white'}`}
                        {...props}
                      />
                    ),
                    h2: ({ node, ...props }) => (
                      <h2
                        className={`text-3xl font-bold mb-4 mt-6 ${isLightTheme ? 'text-gray-900' : 'text-white'}`}
                        {...props}
                      />
                    ),
                    h3: ({ node, ...props }) => (
                      <h3
                        className={`text-2xl font-semibold mb-3 mt-5 ${isLightTheme ? 'text-gray-800' : 'text-gray-100'}`}
                        {...props}
                      />
                    ),
                    h4: ({ node, ...props }) => (
                      <h4
                        className={`text-xl font-semibold mb-2 mt-4 ${isLightTheme ? 'text-gray-800' : 'text-gray-100'}`}
                        {...props}
                      />
                    ),
                    h5: ({ node, ...props }) => (
                      <h5
                        className={`text-lg font-semibold mb-2 mt-3 ${isLightTheme ? 'text-gray-800' : 'text-gray-100'}`}
                        {...props}
                      />
                    ),
                    h6: ({ node, ...props }) => (
                      <h6
                        className={`text-base font-semibold mb-2 mt-3 ${isLightTheme ? 'text-gray-800' : 'text-gray-100'}`}
                        {...props}
                      />
                    ),
                    p: ({ node, ...props }) => (
                      <p
                        className={`mb-4 leading-relaxed ${isLightTheme ? 'text-gray-700' : 'text-gray-300'}`}
                        {...props}
                      />
                    ),
                    ul: ({ node, ...props }) => (
                      <ul
                        className={`list-disc list-outside ml-6 mb-4 ${isLightTheme ? 'text-gray-700' : 'text-gray-300'}`}
                        {...props}
                      />
                    ),
                    ol: ({ node, ...props }) => (
                      <ol
                        className={`list-decimal list-outside ml-6 mb-4 ${isLightTheme ? 'text-gray-700' : 'text-gray-300'}`}
                        {...props}
                      />
                    ),
                    li: ({ node, ...props }) => (
                      <li className="mb-2 leading-relaxed" {...props} />
                    ),
                    pre: ({ node, ...props }) => (
                      <pre
                        className={`rounded-lg overflow-hidden mb-4 ${
                          isLightTheme ? 'bg-gray-100' : 'bg-gray-800'
                        }`}
                        {...props}
                      />
                    ),
                    blockquote: ({ node, ...props }) => (
                      <blockquote
                        className={`border-l-4 pl-4 italic mb-4 ${
                          isLightTheme
                            ? 'border-gray-300 text-gray-600'
                            : 'border-gray-600 text-gray-400'
                        }`}
                        {...props}
                      />
                    ),
                    a: ({ node, ...props }) => (
                      <a
                        className={`underline ${isLightTheme ? 'text-purple-600 hover:text-purple-800' : 'text-purple-400 hover:text-purple-300'}`}
                        {...props}
                      />
                    ),
                    table: ({ node, ...props }) => (
                      <div className="overflow-x-auto mb-4">
                        <table
                          className={`min-w-full border ${isLightTheme ? 'border-gray-300' : 'border-gray-700'}`}
                          {...props}
                        />
                      </div>
                    ),
                    th: ({ node, ...props }) => (
                      <th
                        className={`border px-4 py-2 text-left font-semibold ${
                          isLightTheme
                            ? 'border-gray-300 bg-gray-100'
                            : 'border-gray-700 bg-gray-800'
                        }`}
                        {...props}
                      />
                    ),
                    td: ({ node, ...props }) => (
                      <td
                        className={`border px-4 py-2 ${
                          isLightTheme
                            ? 'border-gray-300'
                            : 'border-gray-700'
                        }`}
                        {...props}
                      />
                    ),
                    hr: ({ node, ...props }) => (
                      <hr
                        className={`my-8 ${isLightTheme ? 'border-gray-300' : 'border-gray-700'}`}
                        {...props}
                      />
                    ),
                  }}
                >
                  {markdownContent}
                </ReactMarkdown>
              </div>
            ) : (
              <div
                className={`flex items-center justify-center h-full ${themeClasses.textTertiary}`}
              >
                <div className="text-center">
                  <Brain className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg">Start writing to see the preview</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
