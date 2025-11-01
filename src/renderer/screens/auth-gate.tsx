import { AlertCircle, ExternalLink, RefreshCw } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme, createThemeClasses } from '../theme/ThemeContext'
import { ProviderTabs } from '../components/auth/ProviderTabs'
import type { AuthProvider } from '../../shared/types'

const { App } = window

export function AuthGateScreen() {
  const { theme } = useTheme()
  const themeClasses = createThemeClasses(theme)
  const navigate = useNavigate()

  const [isChecking, setIsChecking] = useState(true)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [errorType, setErrorType] = useState<
    'auth' | 'model' | 'network' | 'unknown'
  >('unknown')
  const [suggestedProvider, setSuggestedProvider] = useState<
    AuthProvider | undefined
  >()
  const [showProviderConfig, setShowProviderConfig] = useState(false)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [isLoadingUrl, setIsLoadingUrl] = useState(false)

  // Check authentication on mount
  useEffect(() => {
    checkAuthentication()
  }, [])

  const checkAuthentication = async () => {
    setIsChecking(true)
    setCheckError(null)

    try {
      const result = await App.checkClaudeAuthentication()

      if (result.authenticated) {
        // User is authenticated, navigate to main screen
        navigate('/')
      } else {
        // Not authenticated, show login screen with error details
        setCheckError(result.error || 'Not authenticated')
        setErrorType(result.errorType || 'unknown')
        setSuggestedProvider(result.suggestedProvider)

        // Auto-show provider config if we have a suggestion
        if (result.suggestedProvider) {
          setShowProviderConfig(true)
        }
      }
    } catch (error) {
      console.error('Failed to check authentication:', error)
      setCheckError('Failed to check authentication status')
      setErrorType('unknown')
    } finally {
      setIsChecking(false)
    }
  }

  const handleProviderConfigSuccess = () => {
    // After successful provider configuration, check auth again
    checkAuthentication()
  }

  const handleLoginClick = async () => {
    setIsLoadingUrl(true)

    try {
      // Get login URL from main process
      const result = await App.getClaudeLoginUrl()

      if (result.url) {
        setLoginUrl(result.url)
        // Open URL in external browser
        await App.openExternalUrl(result.url)
      } else {
        console.error('Failed to get login URL:', result.error)
      }
    } catch (error) {
      console.error('Failed to open login URL:', error)
    } finally {
      setIsLoadingUrl(false)
    }
  }

  if (isChecking) {
    return (
      <div
        className={`min-h-screen ${themeClasses.bgPrimary} flex items-center justify-center`}
      >
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <RefreshCw
              className={`w-12 h-12 ${themeClasses.textAccent} animate-spin`}
            />
          </div>
          <h2 className={`text-2xl font-semibold ${themeClasses.textPrimary}`}>
            Checking Authentication
          </h2>
          <p className={`text-lg ${themeClasses.textSecondary} mt-2`}>
            Please wait...
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
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <img alt="Almond Coder" className="w-24 h-24" src="/logo.svg" />
          </div>
          <h1
            className={`text-5xl font-light ${themeClasses.textPrimary} mb-4`}
          >
            Welcome to Almond Coder
          </h1>
          <p className={`text-xl ${themeClasses.textSecondary} mb-2`}>
            AI-powered coding assistant with Git integration
          </p>
        </div>

        {/* Authentication Status */}
        <div
          className={`max-w-2xl w-full ${themeClasses.bgSecondary} ${themeClasses.borderPrimary} border-2 rounded-xl p-8 mb-6`}
        >
          <h2
            className={`text-2xl font-semibold ${themeClasses.textPrimary} mb-6`}
          >
            Choose Authentication Provider
          </h2>
          <div className="flex items-start mb-6">
            <ProviderTabs
              onSuccess={handleProviderConfigSuccess}
              suggestedProvider={suggestedProvider}
            />
          </div>

          {/* Call to Action */}
        </div>
      </div>
    </div>
  )
}
