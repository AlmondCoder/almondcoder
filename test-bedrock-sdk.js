#!/usr/bin/env node

/**
 * Test script to verify Claude SDK with Bedrock authentication
 * This mimics the exact environment setup that the Electron app uses
 */

const { query } = require('@anthropic-ai/claude-agent-sdk')
const keytar = require('keytar')
const { join } = require('path')

const SERVICE_NAME = 'AlmondCoder'

async function testBedrockSDK() {
  console.log('🔍 [Test] Starting Bedrock SDK authentication test...\n')

  // ============================================================================
  // Step 1: Load credentials from keychain (same as app)
  // ============================================================================
  console.log('📦 [Test] Loading credentials from macOS keychain...')
  try {
    const activeProvider = await keytar.getPassword(SERVICE_NAME, 'active-provider')
    console.log(`   Active provider: ${activeProvider}`)

    if (activeProvider !== 'bedrock') {
      console.error('❌ Active provider is not bedrock!')
      process.exit(1)
    }

    const credentialsJson = await keytar.getPassword(SERVICE_NAME, 'bedrock')
    if (!credentialsJson) {
      console.error('❌ No bedrock credentials found in keychain!')
      process.exit(1)
    }

    const credentials = JSON.parse(credentialsJson)
    console.log('✅ [Test] Loaded credentials from keychain:')
    console.log(`   Access Key ID: ${credentials.accessKeyId ? '***' + credentials.accessKeyId.slice(-4) : 'missing'}`)
    console.log(`   Secret Key: ${credentials.secretAccessKey ? '***' : 'missing'}`)
    console.log(`   Session Token: ${credentials.sessionToken ? 'present' : 'none'}`)
    console.log(`   Region: ${credentials.region || 'missing'}`)
    console.log(`   Model: ${credentials.model || 'default'}`)

    // ============================================================================
    // Step 2: Set environment variables (same as app)
    // ============================================================================
    console.log('\n🔑 [Test] Setting environment variables...')

    // Clear existing vars
    delete process.env.CLAUDE_CODE_USE_BEDROCK
    delete process.env.CLAUDE_CODE_USE_VERTEX
    delete process.env.ANTHROPIC_API_KEY

    // Set Bedrock vars
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId
    process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey
    if (credentials.sessionToken) {
      process.env.AWS_SESSION_TOKEN = credentials.sessionToken
    }
    if (credentials.region) {
      process.env.AWS_REGION = credentials.region
    }
    if (credentials.model) {
      process.env.ANTHROPIC_MODEL = credentials.model
    }

    console.log('✅ [Test] Environment variables set:')
    console.log(`   CLAUDE_CODE_USE_BEDROCK: ${process.env.CLAUDE_CODE_USE_BEDROCK}`)
    console.log(`   AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? 'set' : 'missing'}`)
    console.log(`   AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? 'set' : 'missing'}`)
    console.log(`   AWS_SESSION_TOKEN: ${process.env.AWS_SESSION_TOKEN ? 'set' : 'not set'}`)
    console.log(`   AWS_REGION: ${process.env.AWS_REGION || 'not set'}`)
    console.log(`   ANTHROPIC_MODEL: ${process.env.ANTHROPIC_MODEL || 'not set'}`)

    // ============================================================================
    // Step 3: Test Claude SDK query (same as app)
    // ============================================================================
    console.log('\n🤖 [Test] Testing Claude SDK query...')
    console.log('   Sending test prompt: "Say hello"\n')

    const testQuery = query({
      prompt: 'Say hello',
      options: {
        cwd: process.cwd(),
        allowedTools: ['Read', 'Glob', 'Grep'],
        permissionMode: 'acceptEdits',
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
        },
      },
    })

    console.log('⏳ [Test] Waiting for first message from SDK...\n')

    let messageCount = 0
    for await (const message of testQuery) {
      messageCount++
      console.log(`📨 [Test] Message ${messageCount}:`, JSON.stringify(message, null, 2))

      // Only show first 3 messages to avoid spam
      if (messageCount >= 3) {
        console.log('\n✅ [Test] Success! Received multiple messages from SDK.')
        console.log('   Authentication is working correctly!')
        break
      }
    }

    if (messageCount === 0) {
      console.error('\n❌ [Test] FAILED: No messages received from SDK')
      console.error('   This means authentication failed')
      process.exit(1)
    }

  } catch (error) {
    console.error('\n❌ [Test] FAILED with error:')
    console.error('   Error message:', error.message)
    console.error('   Error stack:', error.stack)

    // Check if it's the same error as in production
    if (error.message.includes('exited with code 1')) {
      console.error('\n🔍 [Test] This is the SAME error as in the DMG!')
      console.error('   The issue is with SDK authentication, not the keychain.')
    }

    process.exit(1)
  }
}

// Run the test
testBedrockSDK().then(() => {
  console.log('\n✅ [Test] Test completed successfully!')
  process.exit(0)
}).catch((error) => {
  console.error('\n❌ [Test] Uncaught error:', error)
  process.exit(1)
})
