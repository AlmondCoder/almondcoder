import type React from 'react'
import { Palette } from 'lucide-react'
import { useTheme, createThemeClasses } from '../../theme/ThemeContext'
import type { ThemeName } from '../../theme/colors'

const themeDisplayNames: Record<ThemeName, string> = {
  dark: 'Dark',
  light: 'Light',
  midnight: 'Midnight',
  ocean: 'Ocean',
}

const themeDescriptions: Record<ThemeName, string> = {
  dark: 'Classic dark theme',
  light: 'Clean light theme',
  midnight: 'Deep blue theme',
  ocean: 'Teal aqua theme',
}

interface ThemeSelectorProps {
  className?: string
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  className = '',
}) => {
  const { theme, themeName, setTheme, availableThemes } = useTheme()
  const themeClasses = createThemeClasses(theme)

  return (
    <div className={`relative group ${className}`}>
      <button
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${themeClasses.btnSecondary}`}
        title="Switch Theme"
      >
        <Palette className="w-4 h-4" />
        <span>{themeDisplayNames[themeName]}</span>
      </button>

      {/* Dropdown Menu */}
      <div
        className={`absolute right-0 top-full mt-2 w-48 ${themeClasses.bgCard} border ${themeClasses.borderPrimary} rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50`}
      >
        <div className="p-2 space-y-1">
          <div
            className={`px-3 py-2 text-xs font-medium ${themeClasses.textMuted} border-b ${themeClasses.borderSecondary} mb-2`}
          >
            Choose Theme
          </div>
          {availableThemes.map(theme => (
            <button
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 flex items-center justify-between ${
                theme === themeName
                  ? `${themeClasses.bgTertiary} ${themeClasses.textAccent}`
                  : `${themeClasses.textSecondary} hover:${themeClasses.bgTertiary} hover:${themeClasses.textPrimary}`
              }`}
              key={theme}
              onClick={() => setTheme(theme)}
            >
              <div>
                <div className="font-medium">{themeDisplayNames[theme]}</div>
                <div className={`text-xs ${themeClasses.textMuted}`}>
                  {themeDescriptions[theme]}
                </div>
              </div>
              {theme === themeName && (
                <div
                  className={`w-2 h-2 rounded-full ${themeClasses.textAccent}`}
                  style={{ backgroundColor: 'currentColor' }}
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
