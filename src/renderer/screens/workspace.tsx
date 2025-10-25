import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageSquare, GitMerge, FolderOpen, User } from 'lucide-react'
import { useTheme, createThemeClasses } from '../theme/ThemeContext'
import { Overview } from '../components/workspace/Overview'
import { Prompts } from '../components/workspace/Prompts'
import { Terminal as TerminalComponent } from '../components/workspace/Terminal'
import { Settings as SettingsComponent } from '../components/workspace/Settings'

interface LocationState {
  projectPath: string
  selectedTool: string
  selectedBranch: string
}

export function WorkspaceScreen() {
  const { theme, setCurrentProject } = useTheme()
  const themeClasses = createThemeClasses(theme)

  const location = useLocation()
  const projectContext = location.state as LocationState

  // Load project settings when workspace is opened
  useEffect(() => {
    if (projectContext?.projectPath) {
      setCurrentProject(projectContext.projectPath)

      // Set window title to "AlmondCoder - ProjectName"
      const projectName =
        projectContext.projectPath.split('/').pop() || 'Project'
      window.App.setWindowTitle(`AlmondCoder - ${projectName}`)
    }

    // Cleanup when leaving workspace
    return () => {
      setCurrentProject(null)
      // Reset title when leaving workspace
      window.App.setWindowTitle('AlmondCoder')
    }
  }, [projectContext?.projectPath])
  const [activeSection, setActiveSection] = useState('prompts')
  const [message, setMessage] = useState('')
  const [chatHistory, setChatHistory] = useState([
    {
      id: 1,
      sender: 'assistant',
      content:
        "Hello! I'm ready to help you with your project. What would you like to work on?",
      timestamp: new Date(),
    },
  ])

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return

    const newMessage = {
      id: chatHistory.length + 1,
      sender: 'user' as const,
      content: message,
      timestamp: new Date(),
    }

    setChatHistory(prev => [...prev, newMessage])
    setMessage('')

    // Simulate assistant response
    setTimeout(() => {
      const assistantMessage = {
        id: chatHistory.length + 2,
        sender: 'assistant' as const,
        content: `I received your message: "${message}". How can I help you with that?`,
        timestamp: new Date(),
      }
      setChatHistory(prev => [...prev, assistantMessage])
    }, 1000)
  }

  const topMenuItems = [
    { icon: MessageSquare, label: 'Prompts', key: 'prompts' },
    { icon: GitMerge, label: 'Merge', key: 'merge' }
  ]

  const bottomMenuItems = [{ icon: User, label: 'Account', key: 'account' }]

  const renderContent = () => {
    switch (activeSection) {
      case 'prompts':
        return <Prompts projectContext={projectContext} />
      case 'merge':
        return <Overview projectContext={projectContext} />
      case 'account':
        return <SettingsComponent />
      default:
        return <Prompts projectContext={projectContext} />
    }
  }

  return (
    <div
      className={`h-screen ${themeClasses.bgPrimary} ${themeClasses.textPrimary} flex`}
    >
      {/* Vertical Sidebar Menu */}
      <div
        className={`${themeClasses.bgSecondary} border-r ${themeClasses.borderPrimary} w-16 flex flex-col items-center py-4`}
      >
        {/* App Logo at top */}
        <div className="mb-8">
          <div
            className={`w-12 h-12 rounded-xl bg-[rgb(45,45,45)] flex items-center justify-center p-2`}
          >
            <img
              alt="Almond Coder"
              className="w-full h-full object-contain"
              src="/logo.svg"
            />
          </div>
        </div>

        {/* Top Menu Items */}
        <div className="flex flex-col items-center space-y-1">
          {topMenuItems.map((item, index) => (
            <button
              className={`w-12 h-12 flex items-center justify-center rounded-lg transition-all duration-200 group relative ${
                activeSection === item.key
                  ? `bg-[rgb(45,45,45)] text-white`
                  : `${themeClasses.textSecondary} hover:bg-[rgba(0,0,0,0.05)]`
              }`}
              key={index}
              onClick={() => setActiveSection(item.key)}
              title={item.label}
            >
              <item.icon className="w-6 h-6" />
              {/* Tooltip on hover */}
              <span
                className={`absolute left-full ml-2 px-3 py-1.5 rounded-md ${themeClasses.bgTertiary} ${themeClasses.textPrimary} text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg z-50`}
              >
                {item.label}
              </span>
            </button>
          ))}
        </div>

        {/* Spacer to push bottom items down */}
        <div className="flex-1" />

        {/* Bottom Menu Items */}
        <div className="flex flex-col items-center space-y-1">
          {bottomMenuItems.map((item, index) => (
            <button
              className={`w-12 h-12 flex items-center justify-center rounded-lg transition-all duration-200 group relative ${
                activeSection === item.key
                  ? `bg-[rgb(45,45,45)] text-white`
                  : `${themeClasses.textSecondary} hover:bg-[rgba(0,0,0,0.05)]`
              }`}
              key={index}
              onClick={() => setActiveSection(item.key)}
              title={item.label}
            >
              <item.icon className="w-6 h-6" />
              {/* Tooltip on hover */}
              <span
                className={`absolute left-full ml-2 px-3 py-1.5 rounded-md ${themeClasses.bgTertiary} ${themeClasses.textPrimary} text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg z-50`}
              >
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden">{renderContent()}</div>
    </div>
  )
}
