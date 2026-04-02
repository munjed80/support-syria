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
    <div className="flex flex-col min-h-screen bg-background" dir="rtl">
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center">
                <Buildings size={28} className="text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">نظام الطلبات البلدية</h1>
                <p className="text-sm text-muted-foreground">منصة إدارة الشكاوى والطلبات</p>
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

      <main className="flex-1 container mx-auto px-4 py-10">
        {activeTab === 'login' ? (
          <div className="max-w-md mx-auto">
            <LoginForm onLogin={login} />
            <div className="mt-4 text-center">
              <Button variant="ghost" size="sm" onClick={() => setActiveTab('track')}>
                ← العودة لتتبع الطلبات
              </Button>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="text-center space-y-3 pt-4">
              <h2 className="text-xl font-semibold text-foreground">تتبع طلبك أو شكواك</h2>
              <p className="text-muted-foreground text-sm">
                أدخل رمز التتبع الخاص بك لمعرفة حالة طلبك
              </p>
            </div>
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

      <footer className="border-t py-6 bg-muted mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} نظام الطلبات البلدية. جميع الحقوق محفوظة.</p>
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