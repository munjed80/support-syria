import { createContext, useContext, ReactNode, useState, useEffect } from 'react'
import { api, toUser } from '@/lib/api'
import type { User } from '@/lib/types'

interface AuthContextType {
  currentUser: User | null
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null)

  // On mount, restore session from stored token
  useEffect(() => {
    const token = localStorage.getItem('api_token')
    if (token) {
      api.me()
        .then((u) => setCurrentUser(toUser(u)))
        .catch(() => api.setToken(null))
    }
  }, [])

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const { access_token } = await api.login(email, password)
      api.setToken(access_token)
      const me = await api.me()
      setCurrentUser(toUser(me))
      return true
    } catch {
      return false
    }
  }

  const logout = () => {
    api.setToken(null)
    setCurrentUser(null)
  }

  return (
    <AuthContext.Provider value={{
      currentUser,
      login,
      logout,
      isAuthenticated: currentUser !== null
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
