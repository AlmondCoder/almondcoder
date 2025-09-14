import { Folder, ChevronDown, FileText, GitBranch } from 'lucide-react'
import { useState, useEffect, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { CloneRepositoryModal } from '../components/ui/clone-repository-modal'

// The "App" comes from the context bridge in preload/index.ts
const { App } = window

export function MainScreen() {
  const [repoPath, setRepoPath] = useState('')
  const [selectedTool, setSelectedTool] = useState<
    'claude-code' | 'gemini-cli' | 'codex'
  >('claude-code')
  const [branches, setBranches] = useState<string[]>([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [recentProjects, setRecentProjects] = useState<
    Array<{
      name: string
      path: string
      lastUsed: string
    }>
  >([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false)
  const navigate = useNavigate()

  const repoPathId = useId()
  const branchDropdownId = useId()

  useEffect(() => {
    App.sayHelloFromBridge()
    loadRecentProjects()
  }, [])

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

        setRepoPath(selectedPath)
        // Get actual Git branches
        const gitBranches = await App.getGitBranches(selectedPath)
        setBranches(gitBranches)
        setSelectedBranch(gitBranches[0] || 'main')

        // Add to recent projects
        const projectName = selectedPath.split('/').pop() || 'Unknown Project'
        await App.addRecentProject({ name: projectName, path: selectedPath })
        await loadRecentProjects()
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

      setRepoPath(project.path)
      // Get actual Git branches
      const gitBranches = await App.getGitBranches(project.path)
      setBranches(gitBranches)
      setSelectedBranch(gitBranches[0] || 'main')

      // Update recent projects with new timestamp
      await App.addRecentProject({ name: project.name, path: project.path })
      await loadRecentProjects()
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
        setRepoPath(clonePath)
        const branches = await App.getGitBranches(clonePath)
        setBranches(branches)
        setSelectedBranch(branches[0] || 'main')

        const projectName =
          repoUrl.split('/').pop()?.replace('.git', '') || 'Cloned Project'
        await App.addRecentProject({ name: projectName, path: clonePath })
        await loadRecentProjects()
      }
    } catch (error) {
      console.error('Error cloning repository:', error)
      throw error
    }
  }

  const handleCreate = () => {
    console.log('Creating project with:', {
      repoPath,
      selectedTool,
      selectedBranch,
    })
    navigate('/workspace')
  }

  return (
    <div className="min-h-screen bg-gray-900 flex">
      {/* Left Side - VS Code Style */}
      <div className="w-1/2 p-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-5xl font-light text-gray-200 mb-4">
            Almond Coder
          </h1>
          <p className="text-lg text-gray-400">
            Use AlmondCoder to stay ahead of the curve!
          </p>
        </div>

        {/* Start Section */}
        <div className="mb-10">
          <h2 className="text-2xl font-normal text-white mb-6">Start</h2>
          <div className="space-y-4">
            <button
              className="flex items-center gap-3 text-blue-400 hover:text-blue-300 transition-colors text-base"
              onClick={handleBrowseFolder}
            >
              <Folder className="w-5 h-5" />
              Open...
            </button>
            <button
              className="flex items-center gap-3 text-blue-400 hover:text-blue-300 transition-colors text-base"
              onClick={handleCloneRepository}
            >
              <GitBranch className="w-5 h-5" />
              Clone Git Repository...
            </button>
          </div>
        </div>

        {/* Recent Section */}
        <div>
          <h2 className="text-2xl font-normal text-white mb-6">Recent</h2>
          {isLoading ? (
            <div className="text-gray-400">Loading recent projects...</div>
          ) : recentProjects.length > 0 ? (
            <div className="space-y-2">
              {recentProjects.map(project => (
                <button
                  className="block text-left text-blue-400 hover:text-blue-300 transition-colors text-base"
                  key={project.path}
                  onClick={() => handleProjectSelect(project)}
                >
                  <div className="flex justify-between items-center">
                    <span>{project.name}</span>
                    <span className="text-sm text-gray-500 ml-4">
                      {project.path.replace(/^.*\/([^/]+\/[^/]+)$/, '~/$1')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-gray-500 text-base">No recent projects</div>
          )}
        </div>
      </div>

      {/* Right Side - Configuration */}
      <div className="w-1/2 bg-gray-800 p-12 border-l border-gray-700">
        <div className="max-w-md">
          <h2 className="text-2xl font-normal text-white mb-8">
            Configure Project
          </h2>

          {/* Selected Path Display */}
          {repoPath && (
            <div className="mb-6 p-4 bg-gray-900 rounded-lg border border-gray-600">
              <div className="text-sm text-gray-400 mb-1">
                Selected Repository
              </div>
              <div className="text-white font-medium">
                {repoPath.split('/').pop()}
              </div>
              <div className="text-xs text-gray-500 mt-1">{repoPath}</div>
            </div>
          )}

          {/* AI Assistant Selector */}
          <div className="mb-8">
            <label className="block text-lg text-white mb-4">
              Choose AI Assistant
            </label>
            <div className="space-y-3">
              {(['claude-code', 'gemini-cli', 'codex'] as const).map(tool => (
                <label
                  className="flex items-center gap-3 cursor-pointer"
                  key={tool}
                >
                  <input
                    checked={selectedTool === tool}
                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
                    name="ai-tool"
                    onChange={() => setSelectedTool(tool)}
                    type="radio"
                    value={tool}
                  />
                  <span className="text-gray-300">
                    {tool === 'claude-code'
                      ? 'Claude Code'
                      : tool === 'gemini-cli'
                        ? 'Gemini CLI'
                        : 'Codex'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Branch Selector */}
          {repoPath && (
            <div className="mb-8">
              <label
                className="block text-lg text-white mb-4"
                htmlFor={branchDropdownId}
              >
                Root Branch
              </label>
              <div className="relative">
                <button
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-left flex items-center justify-between hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white"
                  id={branchDropdownId}
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  <span>{selectedBranch || 'Select a branch...'}</span>
                  <ChevronDown className="w-5 h-5" />
                </button>

                {isDropdownOpen && branches.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                    {branches.map(branch => (
                      <button
                        className="w-full px-4 py-3 text-left hover:bg-gray-600 first:rounded-t-lg last:rounded-b-lg text-white transition-colors"
                        key={branch}
                        onClick={() => {
                          setSelectedBranch(branch)
                          setIsDropdownOpen(false)
                        }}
                      >
                        {branch}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Launch Button */}
          <button
            className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            disabled={!repoPath || !selectedBranch}
            onClick={handleCreate}
          >
            Launch Workspace
          </button>
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
