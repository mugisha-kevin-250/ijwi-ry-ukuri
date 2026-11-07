import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { authAPI, writerAPI } from '../services/api'
import { syncPushSubscription } from '../pwa/pushNotifications'
import type { User, AuthResponse } from '../types'

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  adminLogin: (username: string, password: string) => Promise<void>
  updateCredentials: (data: { currentPassword: string; username?: string; email?: string; fullName?: string; password?: string }) => Promise<void>
  register: (data: any) => Promise<void>
  signInWithGoogle: (credential: string) => Promise<void>
  logout: () => void
  updateProfile: (updates: Partial<User>) => void
  refreshUser: () => Promise<User | null>
  becomeWriter: () => Promise<void>
  loading: boolean
  error: string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const initAuth = () => {
      try {
        const storedToken = localStorage.getItem('token')
        const storedUser = localStorage.getItem('user')
        if (storedToken && storedUser) {
          setToken(storedToken)
          setUser(JSON.parse(storedUser))
        }
      } catch (err) {
        console.error('Failed to restore auth state:', err)
      } finally {
        setLoading(false)
      }
    }
    initAuth()
  }, [])

  useEffect(() => {
    if (token) void syncPushSubscription()
  }, [token])

  const login = async (email: string, password: string) => {
    try {
      setError(null)
      const response = await authAPI.login({ email, password })
      const { user, token } = response.data.data as AuthResponse
      setUser(user)
      setToken(token)
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
    } catch (err: any) {
      const message = err.response?.data?.message || 'Login failed'
      setError(message)
      throw new Error(message)
    }
  }

  const applySession = (payload: AuthResponse) => {
    setUser(payload.user)
    setToken(payload.token)
    localStorage.setItem('token', payload.token)
    localStorage.setItem('user', JSON.stringify(payload.user))
  }

  const adminLogin = async (username: string, password: string) => {
    try {
      setError(null)
      const response = await authAPI.adminLogin({ username, password })
      applySession(response.data.data as AuthResponse)
    } catch (err: any) {
      const message = err.response?.data?.message || 'Admin login failed'
      setError(message)
      throw new Error(message)
    }
  }

  const updateCredentials = async (data: { currentPassword: string; username?: string; email?: string; fullName?: string; password?: string }) => {
    try {
      setError(null)
      const response = await authAPI.updateCredentials(data)
      applySession(response.data.data as AuthResponse)
    } catch (err: any) {
      const message = err.response?.data?.message || 'Could not update login details'
      setError(message)
      throw new Error(message)
    }
  }

  const register = async (data: any) => {
    try {
      setError(null)
      const response = await authAPI.register(data)
      const { user, token } = response.data.data as AuthResponse
      setUser(user)
      setToken(token)
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
    } catch (err: any) {
      const message = err.response?.data?.message || 'Registration failed'
      setError(message)
      throw new Error(message)
    }
  }

  const signInWithGoogle = async (credential: string) => {
    try {
      setError(null)
      const response = await authAPI.googleSignIn({ credential })
      applySession(response.data.data as AuthResponse)
    } catch (err: any) {
      const message = err.response?.data?.message || 'Google sign-in failed'
      setError(message)
      throw new Error(message)
    }
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  const updateProfile = (updates: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...updates }
      setUser(updatedUser)
      localStorage.setItem('user', JSON.stringify(updatedUser))
    }
  }

  const persistUser = (nextUser: User) => {
    setUser(nextUser)
    localStorage.setItem('user', JSON.stringify(nextUser))
  }

  const refreshUser = async () => {
    try {
      const response = await authAPI.getMe()
      const fresh = ((response.data.data as any)?.user ?? response.data.data) as User
      if (fresh?._id) {
        persistUser(fresh)
        return fresh
      }
    } catch (err) {
      console.error('Failed to refresh user:', err)
    }
    return null
  }

  // Registration creates a READER; the writer area requires the WRITER role.
  const becomeWriter = async () => {
    try {
      await writerAPI.apply({})
    } catch (err: any) {
      const message = err.response?.data?.message || ''
      if (!/already submitted/i.test(message)) {
        throw new Error(message || 'Could not create the writer account')
      }
    }
    const fresh = await refreshUser()
    if (!fresh || (fresh.role !== 'WRITER' && fresh.role !== 'ADMIN')) {
      if (user) persistUser({ ...user, role: 'WRITER' })
    }
  }

  const value: AuthContextType = {
    user,
    token,
    login,
    adminLogin,
    updateCredentials,
    register,
    signInWithGoogle,
    logout,
    updateProfile,
    refreshUser,
    becomeWriter,
    loading,
    error,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}