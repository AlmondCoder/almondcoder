import * as keytar from 'keytar'

const SERVICE_NAME = 'AlmondCoder'
const ACTIVE_PROVIDER_KEY = 'active-provider'

export type AuthProvider = 'anthropic' | 'bedrock' | 'vertex'

export interface AnthropicCredentials {
  apiKey: string
}

export interface BedrockCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  region?: string
  model?: string
}

export interface VertexCredentials {
  projectId: string
  region: string
  model?: string
  smallFastModel?: string
  disablePromptCaching?: boolean
}

export type ProviderCredentials =
  | AnthropicCredentials
  | BedrockCredentials
  | VertexCredentials

/**
 * Get credentials for a specific provider from OS keychain
 */
export async function getCredentials(
  provider: AuthProvider,
): Promise<ProviderCredentials | null> {
  try {
    const credentialsJson = await keytar.getPassword(SERVICE_NAME, provider)
    if (!credentialsJson) {
      return null
    }
    return JSON.parse(credentialsJson)
  } catch (error) {
    console.error(`Failed to get credentials for ${provider}:`, error)
    return null
  }
}

/**
 * Save credentials for a specific provider to OS keychain
 */
export async function saveCredentials(
  provider: AuthProvider,
  credentials: ProviderCredentials,
): Promise<void> {
  try {
    const credentialsJson = JSON.stringify(credentials)
    await keytar.setPassword(SERVICE_NAME, provider, credentialsJson)
  } catch (error) {
    console.error(`Failed to save credentials for ${provider}:`, error)
    throw error
  }
}

/**
 * Delete credentials for a specific provider
 */
export async function deleteCredentials(provider: AuthProvider): Promise<void> {
  try {
    await keytar.deletePassword(SERVICE_NAME, provider)
  } catch (error) {
    console.error(`Failed to delete credentials for ${provider}:`, error)
    throw error
  }
}

/**
 * Get the currently active provider
 */
export async function getActiveProvider(): Promise<AuthProvider | null> {
  try {
    const provider = await keytar.getPassword(SERVICE_NAME, ACTIVE_PROVIDER_KEY)
    return provider as AuthProvider | null
  } catch (error) {
    console.error('Failed to get active provider:', error)
    return null
  }
}

/**
 * Set the active provider
 */
export async function setActiveProvider(provider: AuthProvider): Promise<void> {
  try {
    await keytar.setPassword(SERVICE_NAME, ACTIVE_PROVIDER_KEY, provider)
  } catch (error) {
    console.error('Failed to set active provider:', error)
    throw error
  }
}

/**
 * Detect existing environment variables for a provider
 */
export function detectExistingEnvVars(
  provider: AuthProvider,
): Partial<ProviderCredentials> {
  switch (provider) {
    case 'bedrock': {
      const detected: Partial<BedrockCredentials> = {}
      if (process.env.AWS_ACCESS_KEY_ID) {
        detected.accessKeyId = process.env.AWS_ACCESS_KEY_ID
      }
      if (process.env.AWS_SECRET_ACCESS_KEY) {
        detected.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
      }
      if (process.env.AWS_SESSION_TOKEN) {
        detected.sessionToken = process.env.AWS_SESSION_TOKEN
      }
      if (process.env.AWS_REGION) {
        detected.region = process.env.AWS_REGION
      }
      if (process.env.ANTHROPIC_MODEL) {
        detected.model = process.env.ANTHROPIC_MODEL
      }
      return detected
    }

    case 'vertex': {
      const detected: Partial<VertexCredentials> = {}
      if (process.env.ANTHROPIC_VERTEX_PROJECT_ID) {
        detected.projectId = process.env.ANTHROPIC_VERTEX_PROJECT_ID
      }
      if (process.env.CLOUD_ML_REGION) {
        detected.region = process.env.CLOUD_ML_REGION
      }
      if (process.env.ANTHROPIC_MODEL) {
        detected.model = process.env.ANTHROPIC_MODEL
      }
      if (process.env.ANTHROPIC_SMALL_FAST_MODEL) {
        detected.smallFastModel = process.env.ANTHROPIC_SMALL_FAST_MODEL
      }
      if (process.env.DISABLE_PROMPT_CACHING) {
        detected.disablePromptCaching = process.env.DISABLE_PROMPT_CACHING === '1'
      }
      return detected
    }

    case 'anthropic':
      return {}

    default:
      return {}
  }
}

/**
 * Import credentials from shell environment files and save to keychain
 * This is called automatically on first launch when no credentials are found
 */
export async function importFromShellEnv(): Promise<AuthProvider | null> {
  try {
    console.log('🔄 [Import] Attempting to import credentials from shell environment...')

    // Import the shell parser
    const { readShellEnvCredentials } = await import('./shell-env-parser')

    // Try to read credentials from shell config files
    const result = readShellEnvCredentials()

    if (!result) {
      console.log('ℹ️  [Import] No credentials found in shell environment')
      return null
    }

    const { provider, credentials } = result

    console.log(`💾 [Import] Saving ${provider} credentials to keychain...`)

    // Save credentials to keychain
    await saveCredentials(provider, credentials)

    // Set as active provider
    await setActiveProvider(provider)

    console.log(`✅ [Import] Successfully imported ${provider} credentials from shell environment`)

    return provider
  } catch (error) {
    console.error('❌ [Import] Failed to import credentials from shell environment:', error)
    return null
  }
}
