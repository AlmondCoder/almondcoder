export type ThemeName = 'light'

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
  themeName: ThemeName = 'light'
): ColorPalette => {
  return themes[themeName]
}
