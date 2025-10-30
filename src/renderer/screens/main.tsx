import { Folder, GitBranch } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CloneRepositoryModal } from '../components/ui/clone-repository-modal'
import { useTheme, createThemeClasses } from '../theme/ThemeContext'

// The "App" comes from the context bridge in preload/index.ts
const { App } = window

export function MainScreen() {
  const { theme } = useTheme()
  const themeClasses = createThemeClasses(theme)

  const [selectedTool] = useState<'claude-code' | 'gemini-cli' | 'codex'>(
    'claude-code'
  )
  const [recentProjects, setRecentProjects] = useState<
    Array<{
      name: string
      path: string
      lastUsed: string
    }>
  >([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false)
  const navigate = useNavigate()

  // Check authentication on mount
  useEffect(() => {
    checkAuthenticationStatus()
  }, [])

  const checkAuthenticationStatus = async () => {
    try {
      const result = await App.checkClaudeAuthentication()

      if (!result.authenticated) {
        // Not authenticated, redirect to auth gate
        navigate('/auth-gate')
        return
      }

      // Authenticated, continue loading
      App.sayHelloFromBridge()
      loadRecentProjects()
    } catch (error) {
      console.error('Failed to check authentication:', error)
      // On error, redirect to auth gate to be safe
      navigate('/auth-gate')
    } finally {
      setIsCheckingAuth(false)
    }
  }

  const loadRecentProjects = async () => {
    try {
      const projects = await App.getRecentProjects()
      setRecentProjects(
        projects.map((project: any) => ({
          ...project,
          lastUsed: formatLastUsed(project.lastUsed),
        }))
      )
    } catch (error) {
      console.error('Error loading recent projects:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatLastUsed = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffHours < 1) return 'Less than an hour ago'
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    return date.toLocaleDateString()
  }

  const handleBrowseFolder = async () => {
    try {
      const selectedPath = await App.selectFolder()
      if (selectedPath) {
        // Check if it's a git repository
        const isGitRepo = await App.isGitRepository(selectedPath)
        if (!isGitRepo) {
          alert(
            'Selected folder is not a Git repository. Please select a valid Git repository.'
          )
          return
        }

        // Get actual Git branches
        const gitBranches = await App.getGitBranches(selectedPath)
        const mainBranch = gitBranches[0] || 'main'

        // Add to recent projects
        const projectName = selectedPath.split('/').pop() || 'Unknown Project'
        await App.addRecentProject({ name: projectName, path: selectedPath })
        await loadRecentProjects()

        // Launch workspace directly
        console.log('Launching project:', {
          projectPath: selectedPath,
          selectedTool,
          selectedBranch: mainBranch,
        })
        navigate('/workspace', {
          state: {
            projectPath: selectedPath,
            selectedTool,
            selectedBranch: mainBranch,
          },
        })
      }
    } catch (error) {
      console.error('Error selecting folder:', error)
    }
  }

  const handleProjectSelect = async (project: (typeof recentProjects)[0]) => {
    try {
      // Verify the project path still exists and is a git repository
      const isGitRepo = await App.isGitRepository(project.path)
      if (!isGitRepo) {
        alert('This project is no longer a valid Git repository.')
        return
      }

      // Get actual Git branches
      const gitBranches = await App.getGitBranches(project.path)
      const mainBranch = gitBranches[0] || 'main'

      // Update recent projects with new timestamp
      await App.addRecentProject({ name: project.name, path: project.path })
      await loadRecentProjects()

      // Launch workspace directly
      console.log('Launching project:', {
        projectPath: project.path,
        selectedTool,
        selectedBranch: mainBranch,
      })
      navigate('/workspace', {
        state: {
          projectPath: project.path,
          selectedTool,
          selectedBranch: mainBranch,
        },
      })
    } catch (error) {
      console.error('Error selecting project:', error)
    }
  }

  const handleCloneRepository = () => {
    setIsCloneModalOpen(true)
  }

  const handleCloneSubmit = async (repoUrl: string) => {
    try {
      const clonePath = await App.cloneRepository(repoUrl)
      if (clonePath) {
        const branches = await App.getGitBranches(clonePath)
        const mainBranch = branches[0] || 'main'

        const projectName =
          repoUrl.split('/').pop()?.replace('.git', '') || 'Cloned Project'
        await App.addRecentProject({ name: projectName, path: clonePath })
        await loadRecentProjects()

        // Launch workspace directly
        console.log('Launching cloned project:', {
          projectPath: clonePath,
          selectedTool,
          selectedBranch: mainBranch,
        })
        navigate('/workspace', {
          state: {
            projectPath: clonePath,
            selectedTool,
            selectedBranch: mainBranch,
          },
        })
      }
    } catch (error) {
      console.error('Error cloning repository:', error)
      throw error
    }
  }

  // Show loading state while checking authentication
  if (isCheckingAuth) {
    return (
      <div
        className={`min-h-screen ${themeClasses.bgPrimary} flex items-center justify-center`}
      >
        <div className="text-center">
          <img
            alt="almondCoder"
            className="w-16 h-16 mx-auto mb-4 opacity-50"
            src="/logo.svg"
          />
          <p className={`text-lg ${themeClasses.textSecondary}`}>
            Checking authentication...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${themeClasses.bgPrimary} relative`}>
      {/* Main Content - Centered */}
      <div className="flex flex-col items-center justify-center min-h-screen px-12">
        {/* Header */}
        <div className="text-center mb-16 mt-10">
          <h1
            className={`text-6xl font-light ${themeClasses.textPrimary} mb-6`}
          >
            Almond Coder
          </h1>
          <p className={`text-xl ${themeClasses.textSecondary} mb-4`}>
            The VibeCoding Cleaner.
          </p>
          <p
            className={`text-base ${themeClasses.textMuted} max-w-3xl mx-auto`}
          >
            Claude Code, Codex CLI, and Cursor CLI - supercharged for parallel
            execution, visual architecture planning, and seamless merging.
          </p>
        </div>

        {/* Primary Actions - Compact */}
        <div className="w-full max-w-4xl">
          {/* Start Section */}
          <div className="mb-10">
            <h2
              className={`text-2xl font-semibold ${themeClasses.textPrimary} mb-4 text-center`}
            >
              Get Started
            </h2>
            <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
              <button
                className={`${themeClasses.bgSecondary} ${themeClasses.borderPrimary} border-2 rounded-xl p-6 hover:${themeClasses.borderFocus} hover:scale-105 transition-all duration-200 group`}
                onClick={handleBrowseFolder}
              >
                <div className="flex flex-col items-center text-center">
                  <div
                    className={`p-3 rounded-full ${themeClasses.bgTertiary} mb-3 group-hover:scale-110 transition-transform`}
                  >
                    <Folder className={`w-6 h-6 ${themeClasses.textAccent}`} />
                  </div>
                  <h3
                    className={`text-lg font-semibold ${themeClasses.textPrimary} mb-2`}
                  >
                    Open Project
                  </h3>
                  <p className={`text-sm ${themeClasses.textSecondary}`}>
                    Browse and select an existing Git repository
                  </p>
                </div>
              </button>

              <button
                className={`${themeClasses.bgSecondary} ${themeClasses.borderPrimary} border-2 rounded-xl p-6 hover:${themeClasses.borderFocus} hover:scale-105 transition-all duration-200 group`}
                onClick={handleCloneRepository}
              >
                <div className="flex flex-col items-center text-center">
                  <div
                    className={`p-3 rounded-full ${themeClasses.bgTertiary} mb-3 group-hover:scale-110 transition-transform`}
                  >
                    <GitBranch
                      className={`w-6 h-6 ${themeClasses.textAccent}`}
                    />
                  </div>
                  <h3
                    className={`text-lg font-semibold ${themeClasses.textPrimary} mb-2`}
                  >
                    Clone Repository
                  </h3>
                  <p className={`text-sm ${themeClasses.textSecondary}`}>
                    Clone a Git repository from URL
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Recent Projects */}
          {!isLoading && recentProjects.length > 0 && (
            <div className="mb-16">
              <h2
                className={`text-xl font-semibold ${themeClasses.textPrimary} mb-8 text-center`}
              >
                Recent Projects
              </h2>
              <div className="max-w-3xl mx-auto">
                <div className="space-y-3">
                  {recentProjects.slice(0, 5).map(project => (
                    <button
                      className={`w-full text-left p-4 rounded-lg ${themeClasses.bgSecondary} border ${themeClasses.borderPrimary} hover:${themeClasses.borderFocus} hover:scale-[1.02] transition-all duration-200 group`}
                      key={project.path}
                      onClick={() => handleProjectSelect(project)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div
                            className={`font-medium ${themeClasses.textPrimary} group-hover:${themeClasses.textAccent} text-base`}
                          >
                            {project.name}
                          </div>
                          <div className={`text-sm ${themeClasses.textMuted}`}>
                            {project.lastUsed}
                          </div>
                        </div>
                        <div
                          className={`text-sm ${themeClasses.textSecondary}`}
                        >
                          {project.path.replace(/^.*\/([^/]+\/[^/]+)$/, '~/$1')}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Logo at bottom center */}
          <div className="flex justify-center">
            <img
              alt="Almond Coder"
              className="w-16 h-16 opacity-30 hover:opacity-50 transition-opacity"
              src="/logo.svg"
            />
          </div>
        </div>
      </div>

      <CloneRepositoryModal
        isOpen={isCloneModalOpen}
        onClone={handleCloneSubmit}
        onClose={() => setIsCloneModalOpen(false)}
      />
    </div>
  )
}
