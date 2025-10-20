import type React from 'react'
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import { type ThemeName, type ColorPalette, getCurrentTheme } from './colors'

export type FontSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | 'xxl'
export type FontFamily = 'inter' | 'system' | 'mono' | 'serif'

interface FontPreferences {
  size: FontSize
  family: FontFamily
}

interface ThemeContextType {
  theme: ColorPalette
  themeName: ThemeName
  setTheme: (themeName: ThemeName) => void
  availableThemes: ThemeName[]
  fontPreferences: FontPreferences
  setFontSize: (size: FontSize) => void
  setFontFamily: (family: FontFamily) => void
  loadProjectSettings: (projectPath: string) => Promise<void>
  setCurrentProject: (projectPath: string | null) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

interface ThemeProviderProps {
  children: ReactNode
  defaultTheme?: ThemeName
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultTheme = 'light',
}) => {
  const [themeName, setThemeName] = useState<ThemeName>(defaultTheme)
  const [theme, setTheme] = useState<ColorPalette>(
    getCurrentTheme(defaultTheme)
  )
  const [fontPreferences, setFontPreferences] = useState<FontPreferences>({
    size: 'base',
    family: 'inter',
  })
  const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(
    null
  )

  // Track if we're currently loading settings to prevent infinite loop
  const isLoadingSettings = useRef(false)

  const availableThemes: ThemeName[] = ['dark', 'light', 'midnight', 'ocean']

  // Load theme and font preferences from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('almondcoder-theme') as ThemeName
    if (savedTheme && availableThemes.includes(savedTheme)) {
      setThemeName(savedTheme)
      setTheme(getCurrentTheme(savedTheme))
    }

    const savedFontPreferences = localStorage.getItem(
      'almondcoder-font-preferences'
    )
    if (savedFontPreferences) {
      try {
        const parsed = JSON.parse(savedFontPreferences) as FontPreferences
        setFontPreferences(parsed)
      } catch (error) {
        console.error('Failed to parse saved font preferences:', error)
      }
    }
  }, [])

  // Save theme to localStorage and project settings when changed
  useEffect(() => {
    // Don't save if we're currently loading settings
    if (isLoadingSettings.current) return

    localStorage.setItem('almondcoder-theme', themeName)

    // Also save to project settings if a project is open
    if (currentProjectPath) {
      saveToProjectSettings()
    }
  }, [themeName, currentProjectPath])

  // Save font preferences to localStorage and project settings when changed
  useEffect(() => {
    // Don't save if we're currently loading settings
    if (isLoadingSettings.current) return

    localStorage.setItem(
      'almondcoder-font-preferences',
      JSON.stringify(fontPreferences)
    )

    // Also save to project settings if a project is open
    if (currentProjectPath) {
      saveToProjectSettings()
    }
  }, [fontPreferences, currentProjectPath])

  // Helper to save settings to project
  const saveToProjectSettings = async () => {
    if (!currentProjectPath) return

    try {
      await window.App.saveProjectSettings(currentProjectPath, {
        theme: {
          name: themeName,
          fontPreferences: {
            size: fontPreferences.size,
            family: fontPreferences.family,
          },
        },
      })
    } catch (error) {
      console.error('Failed to save project settings:', error)
    }
  }

  // Load settings from project
  const loadProjectSettings = async (projectPath: string) => {
    try {
      // Set flag to prevent save during load
      isLoadingSettings.current = true

      const settings = await window.App.getProjectSettings(projectPath)

      if (settings?.theme) {
        const { name, fontPreferences: projectFontPrefs } = settings.theme

        // Apply theme name if valid
        if (name && availableThemes.includes(name as ThemeName)) {
          setThemeName(name as ThemeName)
          setTheme(getCurrentTheme(name as ThemeName))
        }

        // Apply font preferences if available
        if (projectFontPrefs) {
          setFontPreferences({
            size: (projectFontPrefs.size as FontSize) || 'base',
            family: (projectFontPrefs.family as FontFamily) || 'inter',
          })
        }
      }

      // Reset flag after loading is complete
      isLoadingSettings.current = false
    } catch (error) {
      console.error('Failed to load project settings:', error)
      // Make sure to reset flag even on error
      isLoadingSettings.current = false
    }
  }

  // Set the current project path
  const handleSetCurrentProject = (projectPath: string | null) => {
    setCurrentProjectPath(projectPath)
    if (projectPath) {
      loadProjectSettings(projectPath)
    }
  }

  // Apply CSS custom properties to document root
  useEffect(() => {
    const root = document.documentElement

    // Background colors
    root.style.setProperty('--color-bg-primary', theme.background.primary)
    root.style.setProperty('--color-bg-secondary', theme.background.secondary)
    root.style.setProperty('--color-bg-tertiary', theme.background.tertiary)
    root.style.setProperty('--color-bg-card', theme.background.card)
    root.style.setProperty('--color-bg-input', theme.background.input)
    root.style.setProperty('--color-bg-overlay', theme.background.overlay)

    // Border colors
    root.style.setProperty('--color-border-primary', theme.border.primary)
    root.style.setProperty('--color-border-secondary', theme.border.secondary)
    root.style.setProperty('--color-border-focus', theme.border.focus)
    root.style.setProperty('--color-border-hover', theme.border.hover)

    // Text colors
    root.style.setProperty('--color-text-primary', theme.text.primary)
    root.style.setProperty('--color-text-secondary', theme.text.secondary)
    root.style.setProperty('--color-text-tertiary', theme.text.tertiary)
    root.style.setProperty('--color-text-accent', theme.text.accent)
    root.style.setProperty('--color-text-muted', theme.text.muted)

    // Status colors
    root.style.setProperty('--color-status-success', theme.status.success)
    root.style.setProperty('--color-status-warning', theme.status.warning)
    root.style.setProperty('--color-status-error', theme.status.error)
    root.style.setProperty('--color-status-info', theme.status.info)

    // Interactive colors - Primary
    root.style.setProperty(
      '--color-interactive-primary-bg',
      theme.interactive.primary.background
    )
    root.style.setProperty(
      '--color-interactive-primary-bg-hover',
      theme.interactive.primary.backgroundHover
    )
    root.style.setProperty(
      '--color-interactive-primary-text',
      theme.interactive.primary.text
    )
    root.style.setProperty(
      '--color-interactive-primary-border',
      theme.interactive.primary.border
    )
    root.style.setProperty(
      '--color-interactive-primary-border-hover',
      theme.interactive.primary.borderHover
    )

    // Interactive colors - Secondary
    root.style.setProperty(
      '--color-interactive-secondary-bg',
      theme.interactive.secondary.background
    )
    root.style.setProperty(
      '--color-interactive-secondary-bg-hover',
      theme.interactive.secondary.backgroundHover
    )
    root.style.setProperty(
      '--color-interactive-secondary-text',
      theme.interactive.secondary.text
    )
    root.style.setProperty(
      '--color-interactive-secondary-border',
      theme.interactive.secondary.border
    )
    root.style.setProperty(
      '--color-interactive-secondary-border-hover',
      theme.interactive.secondary.borderHover
    )

    // Interactive colors - Accent
    root.style.setProperty(
      '--color-interactive-accent-bg',
      theme.interactive.accent.background
    )
    root.style.setProperty(
      '--color-interactive-accent-bg-hover',
      theme.interactive.accent.backgroundHover
    )
    root.style.setProperty(
      '--color-interactive-accent-text',
      theme.interactive.accent.text
    )
    root.style.setProperty(
      '--color-interactive-accent-border',
      theme.interactive.accent.border
    )
    root.style.setProperty(
      '--color-interactive-accent-border-hover',
      theme.interactive.accent.borderHover
    )

    // Chat colors
    root.style.setProperty('--color-chat-user-bg', theme.chat.user.background)
    root.style.setProperty('--color-chat-user-text', theme.chat.user.text)
    root.style.setProperty(
      '--color-chat-assistant-bg',
      theme.chat.assistant.background
    )
    root.style.setProperty(
      '--color-chat-assistant-text',
      theme.chat.assistant.text
    )
    root.style.setProperty(
      '--color-chat-system-bg',
      theme.chat.system.background
    )
    root.style.setProperty('--color-chat-system-text', theme.chat.system.text)
    root.style.setProperty(
      '--color-chat-system-border',
      theme.chat.system.border
    )

    // Pills colors
    root.style.setProperty(
      '--color-pill-inactive-bg',
      theme.pills.inactive.background
    )
    root.style.setProperty(
      '--color-pill-inactive-border',
      theme.pills.inactive.border
    )
    root.style.setProperty(
      '--color-pill-inactive-text',
      theme.pills.inactive.text
    )
    root.style.setProperty(
      '--color-pill-inactive-dot',
      theme.pills.inactive.dot
    )
    root.style.setProperty(
      '--color-pill-inactive-hover-bg',
      theme.pills.inactive.hover.background
    )
    root.style.setProperty(
      '--color-pill-inactive-hover-border',
      theme.pills.inactive.hover.border
    )
    root.style.setProperty(
      '--color-pill-inactive-hover-text',
      theme.pills.inactive.hover.text
    )

    root.style.setProperty(
      '--color-pill-active-bg',
      theme.pills.active.background
    )
    root.style.setProperty(
      '--color-pill-active-border',
      theme.pills.active.border
    )
    root.style.setProperty('--color-pill-active-text', theme.pills.active.text)
    root.style.setProperty('--color-pill-active-dot', theme.pills.active.dot)
    root.style.setProperty(
      '--color-pill-active-hover-bg',
      theme.pills.active.hover.background
    )
    root.style.setProperty(
      '--color-pill-active-hover-border',
      theme.pills.active.hover.border
    )

    // Also set the body background
    document.body.style.background = theme.background.primary
    document.body.style.color = theme.text.primary

    // Apply font preferences
    const fontSizeMap = {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      xxl: '1.5rem',
    }

    const fontFamilyMap = {
      inter: '"Inter", system-ui, -apple-system, sans-serif',
      system: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      mono: '"SF Mono", "Monaco", "Inconsolata", "Roboto Mono", monospace',
      serif: 'ui-serif, Georgia, Cambria, serif',
    }

    root.style.setProperty(
      '--font-size-base',
      fontSizeMap[fontPreferences.size]
    )
    root.style.setProperty(
      '--font-family-base',
      fontFamilyMap[fontPreferences.family]
    )
    document.body.style.fontSize = fontSizeMap[fontPreferences.size]
    document.body.style.fontFamily = fontFamilyMap[fontPreferences.family]
  }, [theme, fontPreferences])

  const handleSetTheme = (newThemeName: ThemeName) => {
    setThemeName(newThemeName)
    setTheme(getCurrentTheme(newThemeName))
  }

  const handleSetFontSize = (size: FontSize) => {
    setFontPreferences(prev => ({ ...prev, size }))
  }

  const handleSetFontFamily = (family: FontFamily) => {
    setFontPreferences(prev => ({ ...prev, family }))
  }

  const contextValue: ThemeContextType = {
    theme,
    themeName,
    setTheme: handleSetTheme,
    availableThemes,
    fontPreferences,
    setFontSize: handleSetFontSize,
    setFontFamily: handleSetFontFamily,
    loadProjectSettings,
    setCurrentProject: handleSetCurrentProject,
  }

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

// Utility function to create CSS class strings using theme colors
export const createThemeClasses = (theme: ColorPalette) => ({
  // Background classes
  bgPrimary: 'bg-[var(--color-bg-primary)]',
  bgSecondary: 'bg-[var(--color-bg-secondary)]',
  bgTertiary: 'bg-[var(--color-bg-tertiary)]',
  bgCard: 'bg-[var(--color-bg-card)]',
  bgInput: 'bg-[var(--color-bg-input)]',
  bgOverlay: 'bg-[var(--color-bg-overlay)]',

  // Border classes
  borderPrimary: 'border-[var(--color-border-primary)]',
  borderSecondary: 'border-[var(--color-border-secondary)]',
  borderFocus: 'focus:border-[var(--color-border-focus)]',
  borderHover: 'hover:border-[var(--color-border-hover)]',

  // Text classes
  textPrimary: 'text-[var(--color-text-primary)]',
  textSecondary: 'text-[var(--color-text-secondary)]',
  textTertiary: 'text-[var(--color-text-tertiary)]',
  textAccent: 'text-[var(--color-text-accent)]',
  textMuted: 'text-[var(--color-text-muted)]',

  // Status classes
  textSuccess: 'text-[var(--color-status-success)]',
  textWarning: 'text-[var(--color-status-warning)]',
  textError: 'text-[var(--color-status-error)]',
  textInfo: 'text-[var(--color-status-info)]',

  // Interactive button classes
  btnPrimary:
    'bg-[var(--color-interactive-primary-bg)] hover:bg-[var(--color-interactive-primary-bg-hover)] text-[var(--color-interactive-primary-text)] border-[var(--color-interactive-primary-border)] hover:border-[var(--color-interactive-primary-border-hover)]',
  btnSecondary:
    'bg-[var(--color-interactive-secondary-bg)] hover:bg-[var(--color-interactive-secondary-bg-hover)] text-[var(--color-interactive-secondary-text)] border-[var(--color-interactive-secondary-border)] hover:border-[var(--color-interactive-secondary-border-hover)]',
  btnAccent:
    'bg-[var(--color-interactive-accent-bg)] hover:bg-[var(--color-interactive-accent-bg-hover)] text-[var(--color-interactive-accent-text)] border-[var(--color-interactive-accent-border)] hover:border-[var(--color-interactive-accent-border-hover)]',

  // Chat classes
  chatUser: 'bg-[var(--color-chat-user-bg)] text-[var(--color-chat-user-text)]',
  chatAssistant:
    'bg-[var(--color-chat-assistant-bg)] text-[var(--color-chat-assistant-text)]',
  chatSystem:
    'bg-[var(--color-chat-system-bg)] text-[var(--color-chat-system-text)] border-[var(--color-chat-system-border)]',

  // Pills classes
  pillInactive:
    'bg-[var(--color-pill-inactive-bg)] border-[var(--color-pill-inactive-border)] text-[var(--color-pill-inactive-text)] hover:bg-[var(--color-pill-inactive-hover-bg)] hover:border-[var(--color-pill-inactive-hover-border)] hover:text-[var(--color-pill-inactive-hover-text)]',
  pillActive:
    'bg-[var(--color-pill-active-bg)] border-[var(--color-pill-active-border)] text-[var(--color-pill-active-text)] hover:bg-[var(--color-pill-active-hover-bg)] hover:border-[var(--color-pill-active-hover-border)]',
  pillInactiveDot: 'bg-[var(--color-pill-inactive-dot)]',
  pillActiveDot: 'bg-[var(--color-pill-active-dot)]',
})
