# PostHog Analytics Setup

This document describes the PostHog analytics and session replay integration in AlmondCoder.

## Overview

PostHog is integrated into AlmondCoder to provide:
- **Analytics**: Track user interactions, feature usage, and app performance
- **Session Replay**: Record user sessions to understand behavior and debug issues
- **Feature Flags**: (Future) Enable/disable features remotely
- **Experiments**: (Future) Run A/B tests

## Configuration

### 1. Environment Variables

Add your PostHog credentials to `.env`:

```bash
# PostHog Analytics
VITE_POSTHOG_KEY=your_posthog_project_api_key_here
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

**Getting your PostHog API Key:**
1. Sign up at [posthog.com](https://posthog.com)
2. Create a new project
3. Copy your Project API Key from Settings → Project Settings
4. Choose the appropriate host (US: `https://us.i.posthog.com`, EU: `https://eu.i.posthog.com`)

### 2. Session Recording Setup

Session recording is **enabled by default** in the PostHog configuration. To enable it in your PostHog project:

1. Go to your PostHog project
2. Navigate to Settings → Project Settings
3. Enable "Record user sessions"
4. Configure session replay settings as needed

## Implementation Details

### Architecture

The PostHog integration follows this structure:

```
src/renderer/
├── index.tsx                      # PostHog initialization on app start
└── services/
    ├── posthog.ts                 # PostHog configuration and utilities
    ├── conversationExecutor.ts    # Conversation tracking
    └── ...
```

### Tracked Events

#### User Actions
- `project_selected` - When a user selects a project
  - Properties: `method` (browse/recent), `project_name`, `branch_count`
- `workspace_opened` - When the workspace screen is opened
  - Properties: `project_name`, `project_path`, `selected_branch`

#### Conversation Events
- `conversation_started` - When a new AI conversation is initiated
  - Properties: `prompt_length`, `branch`, `auto_accept_enabled`, `project_path`
- `conversation_continued` - When an existing conversation is resumed
  - Properties: `prompt_length`, `branch`, `auto_accept_enabled`, `project_path`
- `conversation_completed` - When a conversation completes successfully
  - Properties: `prompt_id`, `is_new`
- `conversation_error` - When a conversation encounters an error
  - Properties: `prompt_id`, `error_message`, `is_new`

#### Page Views
- `$pageview` - Manual page view tracking for Electron screens
  - Tracked for: `main`, `workspace/prompts`, `workspace/merge`, `workspace/account`

### Custom Tracking

To track additional events in your code:

```typescript
import { trackEvent, trackPageView } from '../services/posthog'

// Track a custom event
trackEvent('feature_used', {
  feature_name: 'git_merge',
  user_action: 'merge_branches',
})

// Track a screen view
trackPageView('settings', {
  section: 'preferences',
})
```

## Privacy and Security

### Data Collection

PostHog is configured with the following privacy settings:

- **Text Masking**: Disabled by default (`mask_all_text: false`)
- **Attribute Masking**: Disabled by default (`mask_all_element_attributes: false`)
- **Copied Text**: Not captured (`capture_copied_text: false`)
- **Console Logs**: Captured in session recordings
- **Network Requests**: Captured in session recordings

**Important**: To enhance privacy, set `mask_all_text: true` and `mask_all_element_attributes: true` in `src/renderer/services/posthog.ts`.

### Local Development

When developing locally:
- If no API key is configured, PostHog will not initialize
- A warning message will appear in the console: `PostHog API key not configured. Analytics disabled.`
- The app will function normally without analytics

## Session Replay Configuration

Session replay is configured in `src/renderer/services/posthog.ts`:

```typescript
session_recording: {
  recordCrossOriginIframes: false,
  recordCanvas: false,           // Disabled for performance
  recordConsole: true,            // Capture console logs
  recordNetwork: true,            // Capture network requests
  sampleRate: 1.0,               // Record 100% of sessions (adjust as needed)
}
```

### Adjusting Sample Rate

To record only a percentage of sessions (for cost/performance optimization):

```typescript
sampleRate: 0.5,  // Record 50% of sessions
sampleRate: 0.1,  // Record 10% of sessions
```

## Performance Considerations

### Bundle Size
- Using `posthog-js` full bundle for Electron compatibility
- Bundle size: ~80KB gzipped

### Session Replay Storage
- Recordings are stored in PostHog's cloud infrastructure
- No local storage impact
- Automatic cleanup based on PostHog retention policy

### Network Impact
- Events are batched and sent periodically
- Session replay data is compressed before upload
- Minimal impact on app performance

## Troubleshooting

### PostHog Not Initializing

1. Check that `VITE_POSTHOG_KEY` is set in `.env`
2. Verify the API key is correct in PostHog project settings
3. Check browser console for initialization errors

### Session Replay Not Recording

1. Ensure session recording is enabled in PostHog project settings
2. Check `disable_session_recording: false` in `posthog.ts`
3. Verify `sessionRecordingStarted()` returns `true` in console logs

### Events Not Appearing

1. Check PostHog console for real-time event debugging
2. Verify network connectivity
3. Check browser console for PostHog errors
4. Ensure events are captured with valid properties

## Testing

To test PostHog integration:

1. Set up your PostHog API key in `.env`
2. Run the app: `pnpm dev`
3. Check browser console for "PostHog initialized successfully"
4. Perform actions (select project, start conversation, etc.)
5. View events in PostHog dashboard (Live Events)
6. Verify session recordings appear in Session Replay section

## Additional Resources

- [PostHog Documentation](https://posthog.com/docs)
- [PostHog JavaScript SDK](https://posthog.com/docs/libraries/js)
- [Session Replay Guide](https://posthog.com/docs/session-replay)
- [Electron Analytics Best Practices](https://posthog.com/tutorials/electron-analytics)
