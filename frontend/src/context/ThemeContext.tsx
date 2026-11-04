import { createContext, useContext, useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

const SUPPORTED_THEMES: ThemeMode[] = ['light', 'dark', 'system']

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveDark(theme: ThemeMode) {
  return theme === 'dark' || (theme === 'system' && systemPrefersDark())
}

interface ThemeContextType {
  theme: ThemeMode
  isDark: boolean
  setTheme: (theme: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('theme') as ThemeMode | null
    return stored && SUPPORTED_THEMES.includes(stored) ? stored : 'system'
  })

  const [isDark, setIsDark] = useState(() => resolveDark(theme))

  useEffect(() => {
    localStorage.setItem('theme', theme)
    const dark = resolveDark(theme)
    setIsDark(dark)
    document.documentElement.classList.toggle('dark', dark)

    if (theme !== 'system') return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDark(event.matches)
      document.documentElement.classList.toggle('dark', event.matches)
    }
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [theme])

  const setTheme = (next: ThemeMode) => {
    if (SUPPORTED_THEMES.includes(next)) setThemeState(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, isDark, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
