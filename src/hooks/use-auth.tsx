import { createContext, useContext, ReactNode } from 'react'
import { useKV } from '@github/spark/hooks'
import type { User } from '@/lib/types'

interface AuthContextType {
  currentUser: User | null
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useKV<User | null>('current_user', null)
  const [users] = useKV<User[]>('users', [])

  const login = async (email: string, password: string): Promise<boolean> => {
    const usersList = users || []
    const user = usersList.find(u => u.email === email && u.passwordHash === password)
    if (user) {
      setCurrentUser((prev) => user)
      return true
    }
    return false
  }

  const logout = () => {
    setCurrentUser((prev) => null)
  }

  return (
    <AuthContext.Provider value={{ 
      currentUser: currentUser || null, 
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
