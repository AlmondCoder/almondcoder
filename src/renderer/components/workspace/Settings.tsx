import { useState } from 'react'
import { TextAa, Monitor, Key } from '@phosphor-icons/react'
import {
  useTheme,
  createThemeClasses,
  type FontSize,
  type FontFamily,
} from '../../theme/ThemeContext'
import { ProviderTabs } from '../auth/ProviderTabs'

type SettingsSection = 'appearance' | 'general' | 'authentication'

const fontSizeDisplayNames: Record<FontSize, string> = {
  xs: 'Extra Small',
  sm: 'Small',
  base: 'Default',
  lg: 'Large',
  xl: 'Extra Large',
  xxl: 'XXL',
}

const fontFamilyDisplayNames: Record<FontFamily, string> = {
  inter: 'Inter (Default)',
  system: 'System Font',
  mono: 'Monospace',
  serif: 'Serif',
}

export function Settings() {
  const { theme, fontPreferences, setFontSize, setFontFamily } = useTheme()
  const themeClasses = createThemeClasses(theme)
  const [activeSection, setActiveSection] =
    useState<SettingsSection>('appearance')

  const sidebarItems = [
    { id: 'appearance' as const, label: 'Appearance', icon: TextAa },
    { id: 'authentication' as const, label: 'Authentication', icon: Key },
  ]

  const renderAppearanceSection = () => (
    <div className="space-y-6">
      <div>
        <h3
          className={`text-lg font-semibold ${themeClasses.textPrimary} mb-4`}
        >
          Font Size
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(fontSizeDisplayNames).map(([size, displayName]) => (
            <button
              className={`p-3 rounded-lg border text-center transition-all ${
                fontPreferences.size === size
                  ? `${themeClasses.borderFocus} ${themeClasses.bgTertiary}`
                  : `${themeClasses.borderSecondary} ${themeClasses.bgCard} hover:${themeClasses.bgTertiary}`
              }`}
              key={size}
              onClick={() => setFontSize(size as FontSize)}
            >
              <div className={`font-medium ${themeClasses.textPrimary}`}>
                {displayName}
              </div>
              <div
                className={`text-sm ${themeClasses.textSecondary} mt-1`}
                style={{
                  fontSize:
                    size === 'xs'
                      ? '10px'
                      : size === 'sm'
                        ? '12px'
                        : size === 'base'
                          ? '14px'
                          : size === 'lg'
                            ? '16px'
                            : size === 'xl'
                              ? '18px'
                              : '20px',
                }}
              >
                Sample text
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3
          className={`text-lg font-semibold ${themeClasses.textPrimary} mb-4`}
        >
          Font Family
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(fontFamilyDisplayNames).map(
            ([family, displayName]) => (
              <button
                className={`p-4 rounded-lg border text-left transition-all ${
                  fontPreferences.family === family
                    ? `${themeClasses.borderFocus} ${themeClasses.bgTertiary}`
                    : `${themeClasses.borderSecondary} ${themeClasses.bgCard} hover:${themeClasses.bgTertiary}`
                }`}
                key={family}
                onClick={() => setFontFamily(family as FontFamily)}
              >
                <div className={`font-medium ${themeClasses.textPrimary} mb-1`}>
                  {displayName}
                </div>
                <div
                  className={`text-sm ${themeClasses.textSecondary}`}
                  style={{
                    fontFamily:
                      family === 'inter'
                        ? 'Inter'
                        : family === 'system'
                          ? 'system-ui'
                          : family === 'mono'
                            ? 'monospace'
                            : 'serif',
                  }}
                >
                  The quick brown fox jumps over the lazy dog
                </div>
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )

  const renderAuthenticationSection = () => (
    <div className="space-y-6">
      <div>
        <h3
          className={`text-lg font-semibold ${themeClasses.textPrimary} mb-4`}
        >
          Authentication Provider
        </h3>
        <p className={`${themeClasses.textSecondary} mb-6`}>
          Configure your authentication provider to connect to Claude AI. Choose
          between Anthropic Direct API, AWS Bedrock, or Google Vertex AI.
        </p>
        <ProviderTabs />
      </div>
    </div>
  )

  const renderContent = () => {
    switch (activeSection) {
      case 'appearance':
        return renderAppearanceSection()
      case 'authentication':
        return renderAuthenticationSection()
      default:
        return renderAppearanceSection()
    }
  }

  return (
    <div className={`flex h-full ${themeClasses.bgPrimary}`}>
      {/* Sidebar */}
      <div
        className={`w-64 ${themeClasses.bgSecondary} border-r ${themeClasses.borderPrimary} p-4`}
      >
        <h2 className={`text-xl font-bold ${themeClasses.textPrimary} mb-6`}>
          Settings
        </h2>
        <nav className="space-y-2">
          {sidebarItems.map(item => {
            const Icon = item.icon
            return (
              <button
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left ${
                  activeSection === item.id
                    ? `${themeClasses.bgTertiary} ${themeClasses.textAccent}`
                    : `${themeClasses.textSecondary} hover:${themeClasses.bgTertiary} hover:${themeClasses.textPrimary}`
                }`}
                key={item.id}
                onClick={() => setActiveSection(item.id)}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-6">{renderContent()}</div>
    </div>
  )
}
