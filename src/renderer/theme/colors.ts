export type ThemeName = 'dark' | 'light'

export interface ColorPalette {
  // Background colors
  background: {
    primary: string
    secondary: string
    tertiary: string
    card: string
    input: string
    overlay: string
    labels: string
    black: string
    sidebar: string
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
      primary: 'rgb(222 222 19)', // gray-900
      secondary: 'rgb(31 41 55)', // gray-800
      tertiary: 'rgb(55 65 81)', // gray-700
      card: 'rgb(222 222 219)', // gray-800
      input: 'rgb(31 41 55)', // gray-800
      overlay: 'rgba(31, 41, 55, 0.9)', // gray-800/90
      labels: 'rgb(249, 250, 251)',
      black: 'rgb(22,19,18)', // gray-400/50
      sidebar: 'rgba (238, 238, 235)',
    },
    border: {
      primary: 'rgb(55 65 81)', // gray-700
      secondary: 'rgba(55, 65, 81, 0.3)', // gray-700/30
      focus: 'rgb(222 222 219)', // blue-500
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
      primary: 'rgb(247 247 245)', // cream/beige - main content area (Overview style)
      secondary: 'rgb(247 247 245)', // light gray - sidebar (Overview style)
      tertiary: 'rgb(243 244 246)', // gray-100 - hover states
      card: 'rgb(222 222 219)', // white
      input: 'rgb(255 255 255)', // white
      overlay: 'rgb(222, 222, 219)', // white/90
      labels: 'rgb(249, 250, 251)',
      black: 'rgb(22,19,18)', // gray-400/50
      sidebar: 'rgb(238 238 235)',
    },
    border: {
      primary: 'rgb(222 222 219)', // subtle gray for borders (Overview style)
      secondary: 'rgba(209, 213, 219, 0.3)', // gray-300/30
      focus: 'rgb(222 222 219)', // blue for focus states
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
}

// Helper function to get current theme
export const getCurrentTheme = (
  themeName: ThemeName = 'dark'
): ColorPalette => {
  return themes[themeName]
}
