import { useState, useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AuthProvider, useAuth } from '@/hooks/use-auth'
import { SubmitRequestForm } from '@/components/SubmitRequestForm'
import { TrackRequest } from '@/components/TrackRequest'
import { LoginForm } from '@/components/LoginForm'
import { AdminDashboard } from '@/components/AdminDashboard'
import { ScreenshotsPage } from '@/components/ScreenshotsPage'
import { Buildings } from '@phosphor-icons/react'

function AppContent() {
  const { currentUser, login, logout, isAuthenticated } = useAuth()
  const [activeTab, setActiveTab] = useState('submit')

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
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center">
                <Buildings size={28} className="text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">نظام الطلبات البلدية</h1>
                <p className="text-sm text-muted-foreground">خدمات إلكترونية للمواطنين</p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setActiveTab('login')}
            >
              تسجيل الدخول الإداري
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {activeTab === 'login' ? (
          <LoginForm onLogin={login} />
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <div className="flex justify-center">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="submit">تقديم طلب</TabsTrigger>
                <TabsTrigger value="track">تتبع طلب</TabsTrigger>
              </TabsList>
            </div>

            <div className="max-w-3xl mx-auto">
              <TabsContent value="submit">
                <SubmitRequestForm />
              </TabsContent>

              <TabsContent value="track">
                <TrackRequest 
                  initialCode={
                    window.location.hash.startsWith('#track-')
                      ? window.location.hash.replace('#track-', '')
                      : ''
                  }
                />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </main>

      <footer className="border-t mt-16 py-8 bg-muted">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2024 نظام الطلبات البلدية. جميع الحقوق محفوظة.</p>
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