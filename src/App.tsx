import { useState, useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { AuthProvider, useAuth } from '@/hooks/use-auth'
import { TrackRequest } from '@/components/TrackRequest'
import { LoginForm } from '@/components/LoginForm'
import { AdminDashboard } from '@/components/AdminDashboard'
import { ScreenshotsPage } from '@/components/ScreenshotsPage'
import { Buildings } from '@phosphor-icons/react'

function AppContent() {
  const { currentUser, login, logout, isAuthenticated } = useAuth()
  const [activeTab, setActiveTab] = useState('track')

  useEffect(() => {
    const hash = window.location.hash
    if (hash.startsWith('#track-')) {
      setActiveTab('track')
    }
  }, [])

  if (isAuthenticated && currentUser) {
    return <AdminDashboard user={currentUser} onLogout={logout} />
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center">
                <Buildings size={28} className="text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">نظام الطلبات البلدية</h1>
                <p className="text-sm text-muted-foreground">خدمات بلدية دمشق</p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setActiveTab('login')}
            >
              دخول الإداريين
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {activeTab === 'login' ? (
          <LoginForm onLogin={login} />
        ) : (
          <div className="max-w-3xl mx-auto">
            <TrackRequest
              initialCode={
                window.location.hash.startsWith('#track-')
                  ? window.location.hash.replace('#track-', '')
                  : ''
              }
            />
          </div>
        )}
      </main>

      <footer className="border-t mt-16 py-8 bg-muted">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2024 نظام الطلبات البلدية - دمشق. جميع الحقوق محفوظة.</p>
        </div>
      </footer>

      <Toaster position="top-center" />
    </div>
  )
}

function App() {
  if (window.location.pathname === '/screenshots') {
    return <ScreenshotsPage />
  }
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App