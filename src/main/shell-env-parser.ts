import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
  BedrockCredentials,
  VertexCredentials,
  AnthropicCredentials,
  AuthProvider,
} from './credential-manager'

/**
 * List of shell config files to check, in priority order
 */
const SHELL_CONFIG_FILES = [
  '.zshrc',
  '.bashrc',
  '.bash_profile',
  '.profile',
  '.zprofile',
]

/**
 * Parse a shell config file and extract environment variables
 */
function parseShellConfig(content: string): Record<string, string> {
  const envVars: Record<string, string> = {}

  // Match export statements: export VAR=value or export VAR="value"
  const exportRegex = /^export\s+([A-Z_][A-Z0-9_]*)\s*=\s*["']?([^"'\n]+)["']?/gm

  let match: RegExpExecArray | null
  while ((match = exportRegex.exec(content)) !== null) {
    const [, key, value] = match
    if (key && value) {
      envVars[key] = value.trim()
    }
  }

  return envVars
}

/**
 * Extract AWS Bedrock credentials from environment variables
 */
function extractBedrockCredentials(
  envVars: Record<string, string>
): BedrockCredentials | null {
  const accessKeyId = envVars.AWS_ACCESS_KEY_ID
  const secretAccessKey = envVars.AWS_SECRET_ACCESS_KEY

  if (!accessKeyId || !secretAccessKey) {
    return null
  }

  const credentials: BedrockCredentials = {
    accessKeyId,
    secretAccessKey,
  }

  // Optional fields
  if (envVars.AWS_SESSION_TOKEN) {
    credentials.sessionToken = envVars.AWS_SESSION_TOKEN
  }

  if (envVars.AWS_REGION) {
    credentials.region = envVars.AWS_REGION
  }

  if (envVars.ANTHROPIC_MODEL) {
    credentials.model = envVars.ANTHROPIC_MODEL
  }

  return credentials
}

/**
 * Extract Google Vertex AI credentials from environment variables
 */
function extractVertexCredentials(
  envVars: Record<string, string>
): VertexCredentials | null {
  const projectId = envVars.ANTHROPIC_VERTEX_PROJECT_ID
  const region = envVars.CLOUD_ML_REGION

  if (!projectId || !region) {
    return null
  }

  const credentials: VertexCredentials = {
    projectId,
    region,
  }

  // Optional fields
  if (envVars.ANTHROPIC_MODEL) {
    credentials.model = envVars.ANTHROPIC_MODEL
  }

  if (envVars.ANTHROPIC_SMALL_FAST_MODEL) {
    credentials.smallFastModel = envVars.ANTHROPIC_SMALL_FAST_MODEL
  }

  if (envVars.DISABLE_PROMPT_CACHING) {
    credentials.disablePromptCaching = envVars.DISABLE_PROMPT_CACHING === '1'
  }

  return credentials
}

/**
 * Extract Anthropic API credentials from environment variables
 */
function extractAnthropicCredentials(
  envVars: Record<string, string>
): AnthropicCredentials | null {
  const apiKey = envVars.ANTHROPIC_API_KEY

  if (!apiKey) {
    return null
  }

  return { apiKey }
}

/**
 * Read shell config files and extract credentials
 * Returns { provider, credentials } or null if no credentials found
 */
export function readShellEnvCredentials(): {
  provider: AuthProvider
  credentials: BedrockCredentials | VertexCredentials | AnthropicCredentials
} | null {
  const home = homedir()

  console.log('🔍 [Shell Parser] Searching for credentials in shell config files...')

  // Try each config file in order
  for (const configFile of SHELL_CONFIG_FILES) {
    const configPath = join(home, configFile)

    if (!existsSync(configPath)) {
      continue
    }

    try {
      console.log(`📄 [Shell Parser] Reading ${configFile}...`)
      const content = readFileSync(configPath, 'utf8')
      const envVars = parseShellConfig(content)

      // Try to extract credentials for each provider (in priority order)

      // 1. AWS Bedrock
      const bedrockCreds = extractBedrockCredentials(envVars)
      if (bedrockCreds) {
        console.log(`✅ [Shell Parser] Found AWS Bedrock credentials in ${configFile}`)
        return {
          provider: 'bedrock',
          credentials: bedrockCreds,
        }
      }

      // 2. Google Vertex AI
      const vertexCreds = extractVertexCredentials(envVars)
      if (vertexCreds) {
        console.log(`✅ [Shell Parser] Found Vertex AI credentials in ${configFile}`)
        return {
          provider: 'vertex',
          credentials: vertexCreds,
        }
      }

      // 3. Anthropic API
      const anthropicCreds = extractAnthropicCredentials(envVars)
      if (anthropicCreds) {
        console.log(`✅ [Shell Parser] Found Anthropic API credentials in ${configFile}`)
        return {
          provider: 'anthropic',
          credentials: anthropicCreds,
        }
      }
    } catch (error) {
      console.warn(`⚠️ [Shell Parser] Failed to read ${configFile}:`, error)
      continue
    }
  }

  console.log('❌ [Shell Parser] No credentials found in shell config files')
  return null
}
