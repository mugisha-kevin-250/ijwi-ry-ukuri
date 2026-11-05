import { createContext, useContext, useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark'

const SUPPORTED_THEMES: ThemeMode[] = ['light', 'dark']

// Dark mode is an explicit choice only. A device set to dark must still open the
// site in light mode, so anything other than a stored 'dark' (including the
// legacy 'system' value) resolves to light.
function readStoredTheme(): ThemeMode {
  return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'
}

interface ThemeContextType {
  theme: ThemeMode
  isDark: boolean
  setTheme: (theme: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readStoredTheme)

  useEffect(() => {
    localStorage.setItem('theme', theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const setTheme = (next: ThemeMode) => {
    if (SUPPORTED_THEMES.includes(next)) setThemeState(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === 'dark', setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
