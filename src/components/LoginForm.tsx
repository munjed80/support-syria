import { useState } from 'react'
import { useKV } from '@github/spark/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SignIn } from '@phosphor-icons/react'
import { toast } from 'sonner'

interface LoginFormProps {
  onLogin: (email: string, password: string) => Promise<boolean>
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email || !password) {
      toast.error('يرجى ملء جميع الحقول')
      return
    }

    setLoading(true)
    try {
      const success = await onLogin(email, password)
      if (!success) {
        toast.error('البريد الإلكتروني أو كلمة المرور غير صحيحة')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">تسجيل الدخول</CardTitle>
          <CardDescription>لوحة التحكم الإدارية</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@municipality.sa"
                dir="ltr"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                dir="ltr"
              />
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'جاري التسجيل...' : (
                <>
                  <SignIn className="ml-2" />
                  تسجيل الدخول
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 p-4 bg-muted rounded-lg text-sm">
            <p className="font-semibold mb-2">حسابات تجريبية:</p>
            <div className="space-y-1 text-muted-foreground">
              <p>مدير بلدي: <span className="font-mono">admin@mun.sa</span> / <span className="font-mono">admin123</span></p>
              <p>مدير حي: <span className="font-mono">district1@mun.sa</span> / <span className="font-mono">pass123</span></p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
