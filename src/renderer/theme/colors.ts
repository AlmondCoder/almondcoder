export type ThemeName = 'dark' | 'light' | 'midnight' | 'ocean'

export interface ColorPalette {
  // Background colors
  background: {
    primary: string
    secondary: string
    tertiary: string
    card: string
    input: string
    overlay: string
    labels?: string
  }

  // Border colors
  border: {
    primary: string
    secondary: string
    focus: string
    hover: string
  }

  // Text colors
  text: {
    primary: string
    secondary: string
    tertiary: string
    accent: string
    muted: string
  }

  // Status colors
  status: {
    success: string
    warning: string
    error: string
    info: string
  }

  // Interactive elements
  interactive: {
    primary: {
      background: string
      backgroundHover: string
      text: string
      border: string
      borderHover: string
    }
    secondary: {
      background: string
      backgroundHover: string
      text: string
      border: string
      borderHover: string
    }
    accent: {
      background: string
      backgroundHover: string
      text: string
      border: string
      borderHover: string
    }
  }

  // Chat specific colors
  chat: {
    user: {
      background: string
      text: string
    }
    assistant: {
      background: string
      text: string
    }
    system: {
      background: string
      text: string
      border: string
    }
  }

  // Pills specific colors
  pills: {
    inactive: {
      background: string
      border: string
      text: string
      dot: string
      hover: {
        background: string
        border: string
        text: string
      }
    }
    active: {
      background: string
      border: string
      text: string
      dot: string
      hover: {
        background: string
        border: string
      }
    }
  }
}

export const themes: Record<ThemeName, ColorPalette> = {
  dark: {
    background: {
      primary: 'rgb(17 24 39)', // gray-900
      secondary: 'rgb(31 41 55)', // gray-800
      tertiary: 'rgb(55 65 81)', // gray-700
      card: 'rgb(31 41 55)', // gray-800
      input: 'rgb(31 41 55)', // gray-800
      overlay: 'rgba(31, 41, 55, 0.9)', // gray-800/90
      labels: 'rgba(75, 85, 99, 0.5)', // gray-600/50
    },
    border: {
      primary: 'rgb(55 65 81)', // gray-700
      secondary: 'rgba(55, 65, 81, 0.3)', // gray-700/30
      focus: 'rgb(59 130 246)', // blue-500
      hover: 'rgba(75, 85, 99, 0.5)', // gray-600/50
    },
    text: {
      primary: 'rgb(255 255 255)', // white
      secondary: 'rgb(209 213 219)', // gray-300
      tertiary: 'rgb(156 163 175)', // gray-400
      accent: 'rgb(147 197 253)', // blue-300
      muted: 'rgb(107 114 128)', // gray-500
    },
    status: {
      success: 'rgb(34 197 94)', // green-500
      warning: 'rgb(251 191 36)', // yellow-500
      error: 'rgb(239 68 68)', // red-500
      info: 'rgb(59 130 246)', // blue-500
    },
    interactive: {
      primary: {
        background: 'rgb(37 99 235)', // blue-600
        backgroundHover: 'rgb(29 78 216)', // blue-700
        text: 'rgb(255 255 255)', // white
        border: 'rgb(37 99 235)', // blue-600
        borderHover: 'rgb(29 78 216)', // blue-700
      },
      secondary: {
        background: 'rgb(55 65 81)', // gray-700
        backgroundHover: 'rgb(75 85 99)', // gray-600
        text: 'rgb(255 255 255)', // white
        border: 'rgb(55 65 81)', // gray-700
        borderHover: 'rgb(75 85 99)', // gray-600
      },
      accent: {
        background: 'rgb(22 163 74)', // green-600
        backgroundHover: 'rgb(21 128 61)', // green-700
        text: 'rgb(255 255 255)', // white
        border: 'rgb(22 163 74)', // green-600
        borderHover: 'rgb(21 128 61)', // green-700
      },
    },
    chat: {
      user: {
        background: 'rgb(37 99 235)', // blue-600
        text: 'rgb(255 255 255)', // white
      },
      assistant: {
        background: 'rgb(55 65 81)', // gray-700
        text: 'rgb(243 244 246)', // gray-100
      },
      system: {
        background: 'rgba(180, 83, 9, 0.3)', // yellow-900/30
        text: 'rgb(254 240 138)', // yellow-200
        border: 'rgba(217, 119, 6, 0.3)', // yellow-600/30
      },
    },
    pills: {
      inactive: {
        background: 'rgba(55, 65, 81, 0.5)', // gray-700/50
        border: 'rgba(75, 85, 99, 0.3)', // gray-600/30
        text: 'rgb(209 213 219)', // gray-300
        dot: 'rgb(196 181 253)', // purple-400
        hover: {
          background: 'rgba(75, 85, 99, 0.6)', // gray-600/60
          border: 'rgba(107, 114, 128, 0.5)', // gray-500/50
          text: 'rgb(255 255 255)', // white
        },
      },
      active: {
        background: 'rgba(37, 99, 235, 0.2)', // blue-600/20
        border: 'rgba(59, 130, 246, 0.5)', // blue-500/50
        text: 'rgb(147 197 253)', // blue-300
        dot: 'rgb(96 165 250)', // blue-400
        hover: {
          background: 'rgba(37, 99, 235, 0.3)', // blue-600/30
          border: 'rgba(59, 130, 246, 0.7)', // blue-500/70
        },
      },
    },
  },

  light: {
    background: {
      primary: '#FAFAF8', // cream/beige - main content area (Overview style)
      secondary: '#F5F5F0', // light gray - sidebar (Overview style)
      tertiary: 'rgb(243 244 246)', // gray-100 - hover states
      card: 'rgb(255 255 255)', // white
      input: 'rgb(255 255 255)', // white
      overlay: 'rgba(255, 255, 255, 0.9)', // white/90
      labels: 'rgb(249, 250, 251)', // gray-400/50
    },
    border: {
      primary: '#E5E5E0', // subtle gray for borders (Overview style)
      secondary: 'rgba(209, 213, 219, 0.3)', // gray-300/30
      focus: '#3B82F6', // blue for focus states
      hover: 'rgba(156, 163, 175, 0.5)', // gray-400/50
    },
    text: {
      primary: 'rgb(17 24 39)', // gray-900
      secondary: 'rgb(45 45 45)', // dark gray - icons (from screenshot)
      tertiary: 'rgb(107 114 128)', // gray-500
      accent: 'rgb(37 99 235)', // blue-600
      muted: 'rgb(107 114 128)', // gray-400
    },
    status: {
      success: 'rgb(34 197 94)', // green-500
      warning: 'rgb(245 158 11)', // amber-500
      error: 'rgb(239 68 68)', // red-500
      info: 'rgb(59 130 246)', // blue-500
    },
    interactive: {
      primary: {
        background: 'rgb(45 45 45)', // dark gray for selected state
        backgroundHover: 'rgb(220 220 220)', // very subtle hover
        text: 'rgb(255 255 255)', // white text on dark background
        border: 'rgb(200 200 200)', // subtle border
        borderHover: 'rgb(180 180 180)', // slightly darker on hover
      },
      secondary: {
        background: 'transparent', // no background for inactive nav items
        backgroundHover: 'rgba(0, 0, 0, 0.05)', // very subtle hover
        text: 'rgb(45 45 45)', // dark gray icons
        border: 'transparent', // no border
        borderHover: 'transparent', // no border on hover
      },
      accent: {
        background: 'rgb(22 163 74)', // green-600
        backgroundHover: 'rgb(21 128 61)', // green-700
        text: 'rgb(255 255 255)', // white
        border: 'rgb(22 163 74)', // green-600
        borderHover: 'rgb(21 128 61)', // green-700
      },
    },
    chat: {
      user: {
        background: 'rgb(37 99 235)', // blue-600
        text: 'rgb(255 255 255)', // white
      },
      assistant: {
        background: 'rgb(243 244 246)', // gray-100
        text: 'rgb(17 24 39)', // gray-900
      },
      system: {
        background: 'rgba(254, 243, 199, 0.5)', // yellow-100/50
        text: 'rgb(146 64 14)', // yellow-800
        border: 'rgba(245, 158, 11, 0.3)', // amber-500/30
      },
    },
    pills: {
      inactive: {
        background: 'rgba(243, 244, 246, 0.8)', // gray-100/80
        border: 'rgba(209, 213, 219, 0.5)', // gray-300/50
        text: 'rgb(55 65 81)', // gray-700
        dot: 'rgb(147 51 234)', // purple-600
        hover: {
          background: 'rgba(229, 231, 235, 0.8)', // gray-200/80
          border: 'rgba(156, 163, 175, 0.5)', // gray-400/50
          text: 'rgb(17 24 39)', // gray-900
        },
      },
      active: {
        background: 'rgba(37, 99, 235, 0.1)', // blue-600/10
        border: 'rgba(59, 130, 246, 0.3)', // blue-500/30
        text: 'rgb(37 99 235)', // blue-600
        dot: 'rgb(59 130 246)', // blue-500
        hover: {
          background: 'rgba(37, 99, 235, 0.15)', // blue-600/15
          border: 'rgba(59, 130, 246, 0.5)', // blue-500/50
        },
      },
    },
  },

  midnight: {
    background: {
      primary: 'rgb(8 8 16)', // custom dark blue
      secondary: 'rgb(16 16 32)', // custom dark blue
      tertiary: 'rgb(24 24 48)', // custom dark blue
      card: 'rgb(16 16 32)', // custom dark blue
      input: 'rgb(24 24 48)', // custom dark blue
      overlay: 'rgba(16, 16, 32, 0.9)', // custom dark blue/90
      labels: 'rgba(45, 55, 72, 0.6)', // custom blue-gray/60
    },
    border: {
      primary: 'rgb(45 55 72)', // custom blue-gray
      secondary: 'rgba(45, 55, 72, 0.3)', // custom blue-gray/30
      focus: 'rgb(99 179 237)', // custom light blue
      hover: 'rgba(64, 81, 181, 0.5)', // custom indigo/50
    },
    text: {
      primary: 'rgb(226 232 240)', // slate-200
      secondary: 'rgb(186 192 204)', // custom blue-gray
      tertiary: 'rgb(148 163 184)', // slate-400
      accent: 'rgb(99 179 237)', // custom light blue
      muted: 'rgb(100 116 139)', // slate-500
    },
    status: {
      success: 'rgb(16 185 129)', // emerald-500
      warning: 'rgb(245 158 11)', // amber-500
      error: 'rgb(244 63 94)', // rose-500
      info: 'rgb(99 179 237)', // custom light blue
    },
    interactive: {
      primary: {
        background: 'rgb(79 70 229)', // indigo-600
        backgroundHover: 'rgb(67 56 202)', // indigo-700
        text: 'rgb(255 255 255)', // white
        border: 'rgb(79 70 229)', // indigo-600
        borderHover: 'rgb(67 56 202)', // indigo-700
      },
      secondary: {
        background: 'rgb(24 24 48)', // custom dark blue
        backgroundHover: 'rgb(45 55 72)', // custom blue-gray
        text: 'rgb(226 232 240)', // slate-200
        border: 'rgb(45 55 72)', // custom blue-gray
        borderHover: 'rgb(64 81 181)', // custom indigo
      },
      accent: {
        background: 'rgb(16 185 129)', // emerald-500
        backgroundHover: 'rgb(5 150 105)', // emerald-600
        text: 'rgb(255 255 255)', // white
        border: 'rgb(16 185 129)', // emerald-500
        borderHover: 'rgb(5 150 105)', // emerald-600
      },
    },
    chat: {
      user: {
        background: 'rgb(79 70 229)', // indigo-600
        text: 'rgb(255 255 255)', // white
      },
      assistant: {
        background: 'rgb(24 24 48)', // custom dark blue
        text: 'rgb(186 192 204)', // custom blue-gray
      },
      system: {
        background: 'rgba(245, 158, 11, 0.2)', // amber-500/20
        text: 'rgb(252 211 77)', // amber-300
        border: 'rgba(245, 158, 11, 0.4)', // amber-500/40
      },
    },
    pills: {
      inactive: {
        background: 'rgba(24, 24, 48, 0.7)', // custom dark blue/70
        border: 'rgba(45, 55, 72, 0.4)', // custom blue-gray/40
        text: 'rgb(186 192 204)', // custom blue-gray
        dot: 'rgb(168 85 247)', // purple-500
        hover: {
          background: 'rgba(45, 55, 72, 0.8)', // custom blue-gray/80
          border: 'rgba(64, 81, 181, 0.5)', // custom indigo/50
          text: 'rgb(226 232 240)', // slate-200
        },
      },
      active: {
        background: 'rgba(79, 70, 229, 0.2)', // indigo-600/20
        border: 'rgba(99, 179, 237, 0.5)', // custom light blue/50
        text: 'rgb(99 179 237)', // custom light blue
        dot: 'rgb(129 140 248)', // indigo-400
        hover: {
          background: 'rgba(79, 70, 229, 0.3)', // indigo-600/30
          border: 'rgba(99, 179, 237, 0.7)', // custom light blue/70
        },
      },
    },
  },

  ocean: {
    background: {
      primary: 'rgb(12 74 110)', // custom dark teal
      secondary: 'rgb(21 94 117)', // custom teal
      tertiary: 'rgb(30 115 140)', // custom light teal
      card: 'rgb(21 94 117)', // custom teal
      input: 'rgb(30 115 140)', // custom light teal
      overlay: 'rgba(21, 94, 117, 0.9)', // custom teal/90
      labels: 'rgba(56, 161, 105, 0.5)', // custom sea green/50
    },
    border: {
      primary: 'rgb(56 161 105)', // custom sea green
      secondary: 'rgba(56, 161, 105, 0.3)', // custom sea green/30
      focus: 'rgb(34 211 238)', // cyan-400
      hover: 'rgba(6, 182, 212, 0.5)', // cyan-500/50
    },
    text: {
      primary: 'rgb(240 253 250)', // emerald-50
      secondary: 'rgb(167 243 208)', // emerald-200
      tertiary: 'rgb(52 211 153)', // emerald-400
      accent: 'rgb(34 211 238)', // cyan-400
      muted: 'rgb(6 95 70)', // emerald-800
    },
    status: {
      success: 'rgb(52 211 153)', // emerald-400
      warning: 'rgb(251 191 36)', // yellow-500
      error: 'rgb(248 113 113)', // red-400
      info: 'rgb(34 211 238)', // cyan-400
    },
    interactive: {
      primary: {
        background: 'rgb(6 182 212)', // cyan-500
        backgroundHover: 'rgb(8 145 178)', // cyan-600
        text: 'rgb(255 255 255)', // white
        border: 'rgb(6 182 212)', // cyan-500
        borderHover: 'rgb(8 145 178)', // cyan-600
      },
      secondary: {
        background: 'rgb(30 115 140)', // custom light teal
        backgroundHover: 'rgb(56 161 105)', // custom sea green
        text: 'rgb(240 253 250)', // emerald-50
        border: 'rgb(56 161 105)', // custom sea green
        borderHover: 'rgb(6 182 212)', // cyan-500
      },
      accent: {
        background: 'rgb(52 211 153)', // emerald-400
        backgroundHover: 'rgb(16 185 129)', // emerald-500
        text: 'rgb(6 95 70)', // emerald-800
        border: 'rgb(52 211 153)', // emerald-400
        borderHover: 'rgb(16 185 129)', // emerald-500
      },
    },
    chat: {
      user: {
        background: 'rgb(6 182 212)', // cyan-500
        text: 'rgb(255 255 255)', // white
      },
      assistant: {
        background: 'rgb(30 115 140)', // custom light teal
        text: 'rgb(167 243 208)', // emerald-200
      },
      system: {
        background: 'rgba(251, 191, 36, 0.2)', // yellow-500/20
        text: 'rgb(254 240 138)', // yellow-200
        border: 'rgba(251, 191, 36, 0.4)', // yellow-500/40
      },
    },
    pills: {
      inactive: {
        background: 'rgba(30, 115, 140, 0.6)', // custom light teal/60
        border: 'rgba(56, 161, 105, 0.4)', // custom sea green/40
        text: 'rgb(167 243 208)', // emerald-200
        dot: 'rgb(52 211 153)', // emerald-400
        hover: {
          background: 'rgba(56, 161, 105, 0.7)', // custom sea green/70
          border: 'rgba(6, 182, 212, 0.5)', // cyan-500/50
          text: 'rgb(240 253 250)', // emerald-50
        },
      },
      active: {
        background: 'rgba(6, 182, 212, 0.2)', // cyan-500/20
        border: 'rgba(34, 211, 238, 0.5)', // cyan-400/50
        text: 'rgb(34 211 238)', // cyan-400
        dot: 'rgb(103 232 249)', // cyan-300
        hover: {
          background: 'rgba(6, 182, 212, 0.3)', // cyan-500/30
          border: 'rgba(34, 211, 238, 0.7)', // cyan-400/70
        },
      },
    },
  },
}

// Helper function to get current theme
export const getCurrentTheme = (
  themeName: ThemeName = 'dark'
): ColorPalette => {
  return themes[themeName]
}
