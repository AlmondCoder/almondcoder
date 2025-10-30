import { AlertCircle, ExternalLink, RefreshCw } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme, createThemeClasses } from '../theme/ThemeContext'

const { App } = window

export function AuthGateScreen() {
  const { theme } = useTheme()
  const themeClasses = createThemeClasses(theme)
  const navigate = useNavigate()

  const [isChecking, setIsChecking] = useState(true)
  const [checkError, setCheckError] = useState<string | null>(null)
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
        // Not authenticated, show login screen
        setCheckError(result.error || 'Not authenticated')
      }
    } catch (error) {
      console.error('Failed to check authentication:', error)
      setCheckError('Failed to check authentication status')
    } finally {
      setIsChecking(false)
    }
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
            <img
              alt="Almond Coder"
              className="w-24 h-24"
              src="/logo.svg"
            />
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
          <div className="flex items-start mb-6">
            <AlertCircle
              className={`w-8 h-8 ${themeClasses.textAccent} mr-4 flex-shrink-0 mt-1`}
            />
            <div>
              <h2
                className={`text-2xl font-semibold ${themeClasses.textPrimary} mb-2`}
              >
                Authentication Required
              </h2>
              <p className={`text-base ${themeClasses.textSecondary} mb-4`}>
                To use Almond Coder, you need to authenticate with Claude. This
                enables access to Claude Sonnet for AI-powered coding
                assistance.
              </p>
              {checkError && (
                <p className={`text-sm ${themeClasses.textMuted} mb-4`}>
                  Error: {checkError}
                </p>
              )}
            </div>
          </div>

          {/* Call to Action */}
          <div className="space-y-4">
            <button
              className={`w-full ${themeClasses.bgAccent} text-white font-semibold py-4 px-6 rounded-lg hover:opacity-90 transition-all duration-200 flex items-center justify-center gap-3 group`}
              disabled={isLoadingUrl}
              onClick={handleLoginClick}
            >
              {isLoadingUrl ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Opening login page...</span>
                </>
              ) : (
                <>
                  <span>Login to Continue</span>
                  <ExternalLink className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            {loginUrl && (
              <div
                className={`text-center p-4 ${themeClasses.bgTertiary} rounded-lg`}
              >
                <p className={`text-sm ${themeClasses.textSecondary} mb-2`}>
                  Return here after logging in and click:
                </p>
                <button
                  className={`${themeClasses.bgSecondary} ${themeClasses.borderPrimary} border-2 ${themeClasses.textPrimary} font-medium py-2 px-6 rounded-lg hover:${themeClasses.borderFocus} transition-all duration-200 flex items-center justify-center gap-2 mx-auto`}
                  onClick={checkAuthentication}
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Check Again</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Info Box */}
        <div
          className={`max-w-2xl w-full ${themeClasses.bgTertiary} rounded-lg p-6`}
        >
          <h3 className={`text-lg font-semibold ${themeClasses.textPrimary} mb-3`}>
            New to Claude?
          </h3>
          <p className={`text-base ${themeClasses.textSecondary} mb-4`}>
            Start your free trial and get access to Claude Sonnet with $1
            million tokens per month. Perfect for building, debugging, and
            understanding your codebase.
          </p>
          <ul className={`text-sm ${themeClasses.textMuted} space-y-2`}>
            <li>✓ Advanced code understanding and generation</li>
            <li>✓ Git integration with branch management</li>
            <li>✓ Parallel conversation support</li>
            <li>✓ Visual architecture planning</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
