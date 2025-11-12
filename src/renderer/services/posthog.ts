import posthog from 'posthog-js'

// Initialize PostHog
// Note: Using the full bundle for Electron security compatibility
export const initPostHog = () => {
  const apiKey = import.meta.env.VITE_POSTHOG_KEY || ''

  // Skip initialization if no API key is provided
  if (!apiKey) {
    console.warn('PostHog API key not configured. Analytics disabled.')
    return
  }

  posthog.init(apiKey, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',

    // Electron-specific configuration
    capture_pageview: false, // We'll manually track screen views
    capture_pageleave: false, // Not applicable for desktop apps

    // Session Recording Configuration
    session_recording: {
      // Enable session recording (default: false)
      recordCrossOriginIframes: false,
      // Capture console logs in recordings
      recordCanvas: false, // Disable canvas recording for performance
      recordConsole: true, // Capture console.log, console.error, etc.
      recordNetwork: true, // Capture network requests
      // Sample rate: 1.0 = record all sessions, 0.5 = record 50% of sessions
      sampleRate: 1.0,
    },

    // Privacy Configuration
    mask_all_text: false, // Set to true to mask all text content
    mask_all_element_attributes: false, // Set to true to mask element attributes

    // Autocapture Configuration
    autocapture: {
      // Enable autocapture of user interactions
      dom_event_allowlist: ['click', 'submit', 'change'],
      // Capture element attributes for better context
      capture_copied_text: false, // Don't capture copied text for privacy
    },

    // Performance and Reliability
    persistence: 'localStorage', // Use localStorage for Electron
    disable_session_recording: false, // Enable session recording

    // Debugging
    loaded: (ph) => {
      console.log('✅ PostHog initialized successfully')
      console.log('   Session Recording:', ph.sessionRecordingStarted() ? 'Active' : 'Inactive')
    },

    // Error handling
    on_xhr_error: (error) => {
      console.error('PostHog XHR error:', error)
    },
  })
}

// Custom event tracking helpers
export const trackEvent = (eventName: string, properties?: Record<string, any>) => {
  posthog.capture(eventName, properties)
}

export const trackPageView = (screenName: string, properties?: Record<string, any>) => {
  posthog.capture('$pageview', {
    $current_url: screenName,
    ...properties,
  })
}

export const identifyUser = (userId: string, traits?: Record<string, any>) => {
  posthog.identify(userId, traits)
}

export const resetUser = () => {
  posthog.reset()
}

// Export the posthog instance for direct access if needed
export { posthog }
