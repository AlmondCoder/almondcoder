import { useState, useEffect } from 'react'
import type { AuthProvider, BedrockCredentials, VertexCredentials, AnthropicCredentials } from '../../../shared/types'

interface ProviderTabsProps {
  suggestedProvider?: AuthProvider
  onSuccess?: () => void
}

export function ProviderTabs({ suggestedProvider, onSuccess }: ProviderTabsProps) {
  const [activeTab, setActiveTab] = useState<AuthProvider>(suggestedProvider || 'anthropic')
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ success?: boolean; error?: string } | null>(null)

  // Anthropic state
  const [anthropicApiKey, setAnthropicApiKey] = useState('')

  // Bedrock state
  const [bedrockAccessKeyId, setBedrockAccessKeyId] = useState('')
  const [bedrockSecretAccessKey, setBedrockSecretAccessKey] = useState('')
  const [bedrockSessionToken, setBedrockSessionToken] = useState('')
  const [bedrockRegion, setBedrockRegion] = useState('us-east-1')
  const [bedrockModel, setBedrockModel] = useState('global.anthropic.claude-sonnet-4-5-20250929-v1:0')

  // Vertex state
  const [vertexProjectId, setVertexProjectId] = useState('')
  const [vertexRegion, setVertexRegion] = useState('global')
  const [vertexModel, setVertexModel] = useState('claude-opus-4-1@20250805')
  const [vertexSmallFastModel, setVertexSmallFastModel] = useState('claude-haiku-4-5@20251001')
  const [vertexDisablePromptCaching, setVertexDisablePromptCaching] = useState(false)

  // Load existing env vars on mount
  useEffect(() => {
    loadEnvVars(activeTab)
  }, [activeTab])

  const loadEnvVars = async (provider: AuthProvider) => {
    try {
      const result = await window.App.detectExistingEnvVars(provider)
      if (result.envVars) {
        if (provider === 'bedrock') {
          const envVars = result.envVars as Partial<BedrockCredentials>
          if (envVars.accessKeyId) setBedrockAccessKeyId(envVars.accessKeyId)
          if (envVars.secretAccessKey) setBedrockSecretAccessKey(envVars.secretAccessKey)
          if (envVars.sessionToken) setBedrockSessionToken(envVars.sessionToken)
          if (envVars.region) setBedrockRegion(envVars.region)
          if (envVars.model) setBedrockModel(envVars.model)
        } else if (provider === 'vertex') {
          const envVars = result.envVars as Partial<VertexCredentials>
          if (envVars.projectId) setVertexProjectId(envVars.projectId)
          if (envVars.region) setVertexRegion(envVars.region)
          if (envVars.model) setVertexModel(envVars.model)
          if (envVars.smallFastModel) setVertexSmallFastModel(envVars.smallFastModel)
          if (envVars.disablePromptCaching !== undefined) setVertexDisablePromptCaching(envVars.disablePromptCaching)
        }
      }
    } catch (error) {
      console.error('Failed to load env vars:', error)
    }
  }

  const handleTestAndSave = async () => {
    setLoading(true)
    setTestResult(null)

    try {
      let credentials: any

      if (activeTab === 'anthropic') {
        credentials = { apiKey: anthropicApiKey }
      } else if (activeTab === 'bedrock') {
        if (!bedrockAccessKeyId || !bedrockSecretAccessKey) {
          setTestResult({ error: 'Access Key ID and Secret Access Key are required' })
          setLoading(false)
          return
        }
        credentials = {
          accessKeyId: bedrockAccessKeyId,
          secretAccessKey: bedrockSecretAccessKey,
          sessionToken: bedrockSessionToken || undefined,
          region: bedrockRegion,
          model: bedrockModel,
        }
      } else if (activeTab === 'vertex') {
        if (!vertexProjectId) {
          setTestResult({ error: 'Project ID is required' })
          setLoading(false)
          return
        }
        credentials = {
          projectId: vertexProjectId,
          region: vertexRegion,
          model: vertexModel,
          smallFastModel: vertexSmallFastModel,
          disablePromptCaching: vertexDisablePromptCaching,
        }
      }

      // Test connection first
      console.log('Testing connection for provider:', activeTab)
      const testResult = await window.App.testProviderConnection(activeTab, credentials)

      if (testResult.success) {
        // Save credentials
        await window.App.saveProviderCredentials(activeTab, credentials)
        setTestResult({ success: true })

        // Call onSuccess callback after a short delay
        setTimeout(() => {
          onSuccess?.()
        }, 1000)
      } else {
        setTestResult({ error: testResult.error || 'Connection test failed' })
      }
    } catch (error: any) {
      setTestResult({ error: error?.message || 'Failed to save credentials' })
    } finally {
      setLoading(false)
    }
  }

  const handleAnthropicLogin = async () => {
    try {
      await window.App.openExternalUrl('https://claude.ai/login')
    } catch (error) {
      console.error('Failed to open login URL:', error)
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Tab Headers */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('anthropic')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'anthropic'
              ? 'border-b-2 border-purple-500 text-purple-600 dark:text-purple-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          Anthropic
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('bedrock')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'bedrock'
              ? 'border-b-2 border-purple-500 text-purple-600 dark:text-purple-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          AWS Bedrock
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('vertex')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'vertex'
              ? 'border-b-2 border-purple-500 text-purple-600 dark:text-purple-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          Google Vertex AI
        </button>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {/* Anthropic Tab */}
        {activeTab === 'anthropic' && (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                Claude CLI Authentication
              </h3>
              <p className="text-sm text-blue-800 dark:text-blue-200 mb-4">
                The easiest way to authenticate is using the Claude CLI. Click the button below to log in with your Anthropic account.
              </p>
              <button
                type="button"
                onClick={handleAnthropicLogin}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                Login with Claude
              </button>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                Or use API Key (optional)
              </h3>
              <input
                type="password"
                value={anthropicApiKey}
                onChange={(e) => setAnthropicApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
        )}

        {/* AWS Bedrock Tab */}
        {activeTab === 'bedrock' && (
          <div className="space-y-4">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                AWS Bedrock requires AWS credentials. These can be pre-populated from your environment variables.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Access Key ID *
              </label>
              <input
                type="text"
                value={bedrockAccessKeyId}
                onChange={(e) => setBedrockAccessKeyId(e.target.value)}
                placeholder="AKIA..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Secret Access Key *
              </label>
              <input
                type="password"
                value={bedrockSecretAccessKey}
                onChange={(e) => setBedrockSecretAccessKey(e.target.value)}
                placeholder="..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Session Token (optional)
              </label>
              <input
                type="password"
                value={bedrockSessionToken}
                onChange={(e) => setBedrockSessionToken(e.target.value)}
                placeholder="..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Region
              </label>
              <input
                type="text"
                value={bedrockRegion}
                onChange={(e) => setBedrockRegion(e.target.value)}
                placeholder="us-east-1"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Model ID
              </label>
              <input
                type="text"
                value={bedrockModel}
                onChange={(e) => setBedrockModel(e.target.value)}
                placeholder="global.anthropic.claude-sonnet-4-5-20250929-v1:0"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
        )}

        {/* Google Vertex AI Tab */}
        {activeTab === 'vertex' && (
          <div className="space-y-4">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-sm text-green-800 dark:text-green-200">
                Google Vertex AI requires a GCP project. These can be pre-populated from your environment variables.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Project ID *
              </label>
              <input
                type="text"
                value={vertexProjectId}
                onChange={(e) => setVertexProjectId(e.target.value)}
                placeholder="my-gcp-project"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Region
              </label>
              <input
                type="text"
                value={vertexRegion}
                onChange={(e) => setVertexRegion(e.target.value)}
                placeholder="global"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Model
              </label>
              <input
                type="text"
                value={vertexModel}
                onChange={(e) => setVertexModel(e.target.value)}
                placeholder="claude-opus-4-1@20250805"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Small Fast Model
              </label>
              <input
                type="text"
                value={vertexSmallFastModel}
                onChange={(e) => setVertexSmallFastModel(e.target.value)}
                placeholder="claude-haiku-4-5@20251001"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="disablePromptCaching"
                checked={vertexDisablePromptCaching}
                onChange={(e) => setVertexDisablePromptCaching(e.target.checked)}
                className="h-4 w-4 text-purple-600 border-gray-300 rounded"
              />
              <label htmlFor="disablePromptCaching" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Disable Prompt Caching
              </label>
            </div>
          </div>
        )}

        {/* Test Result */}
        {testResult && (
          <div
            className={`p-4 rounded-lg ${
              testResult.success
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}
          >
            <p
              className={`text-sm ${
                testResult.success
                  ? 'text-green-800 dark:text-green-200'
                  : 'text-red-800 dark:text-red-200'
              }`}
            >
              {testResult.success ? '✓ Connection successful! Credentials saved.' : `✗ ${testResult.error}`}
            </p>
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleTestAndSave}
            disabled={loading}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
          >
            {loading ? 'Testing...' : 'Test & Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
