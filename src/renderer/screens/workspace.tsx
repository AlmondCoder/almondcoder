import { useState } from 'react'
import {
  File,
  Folder,
  Settings,
  User,
  Search,
  GitBranch,
  Send,
  Paperclip,
  Terminal,
  BarChart3,
  MessageSquare,
} from 'lucide-react'
import { Overview } from '../components/workspace/Overview'
import { Prompts } from '../components/workspace/Prompts'
import { Terminal as TerminalComponent } from '../components/workspace/Terminal'
import { Settings as SettingsComponent } from '../components/workspace/Settings'

export function WorkspaceScreen() {
  const [activeSection, setActiveSection] = useState('overview')
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

  const topMenuItems = {
    left: [
      { icon: BarChart3, label: 'Overview', key: 'overview' },
      { icon: MessageSquare, label: 'Prompts', key: 'prompts' },
    ],
    right: [
      { icon: Terminal, label: 'Terminal', key: 'terminal' },
      { icon: Settings, label: 'Settings', key: 'settings' },
      { icon: GitBranch, label: 'Push', key: 'Push' },
    ]
  }

  const renderContent = () => {
    switch (activeSection) {
      case 'overview':
        return <Overview />
      case 'prompts':
        return <Prompts />
      case 'terminal':
        return <TerminalComponent />
      case 'settings':
        return <SettingsComponent />
      default:
        return <Overview />
    }
  }

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col">
      {/* Top Horizontal Menu */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Left side menu items */}
          <div className="flex items-center space-x-1">
            {topMenuItems.left.map((item, index) => (
              <button
                key={index}
                onClick={() => setActiveSection(item.key)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeSection === item.key
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          {/* Center - App title */}
          <div className="text-center">
            <h1 className="text-lg font-semibold text-white">AlmondCoder</h1>
          </div>

          {/* Right side menu items */}
          <div className="flex items-center space-x-1">
            {topMenuItems.right.map((item, index) => (
              <button
                key={index}
                onClick={() => setActiveSection(item.key)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeSection === item.key
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto">
        {renderContent()}
      </div>
    </div>
  )
}
