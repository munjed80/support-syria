import { useState } from 'react'
import { useKV } from '@github/spark/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { PaperPlaneRight, Image as ImageIcon } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { generateTrackingCode, generateId, CATEGORIES } from '@/lib/constants'
import type { ServiceRequest, District, RequestUpdate } from '@/lib/types'

export function SubmitRequestForm() {
  const [requests, setRequests] = useKV<ServiceRequest[]>('service_requests', [])
  const [updates, setUpdates] = useKV<RequestUpdate[]>('request_updates', [])
  const [districts] = useKV<District[]>('districts', [])
  
  const [category, setCategory] = useState<string>('')
  const [districtId, setDistrictId] = useState<string>('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [photo, setPhoto] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('حجم الملف كبير جداً. الحد الأقصى 5 ميجابايت')
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        setPhoto(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!category || !districtId || !description.trim()) {
      toast.error('يرجى ملء جميع الحقول المطلوبة')
      return
    }

    setSubmitting(true)

    try {
      const district = (districts || []).find(d => d.id === districtId)
      if (!district) {
        toast.error('الحي غير موجود')
        return
      }

      const trackingCode = generateTrackingCode()
      const requestId = generateId()
      const now = new Date().toISOString()

      const newRequest: ServiceRequest = {
        id: requestId,
        municipalityId: district.municipalityId,
        districtId,
        category: category as any,
        priority: 'normal',
        status: 'submitted',
        description,
        trackingCode,
        addressText: address || undefined,
        createdAt: now,
        updatedAt: now
      }

      const initialUpdate: RequestUpdate = {
        id: generateId(),
        requestId,
        message: 'تم استلام الطلب',
        toStatus: 'submitted',
        isInternal: false,
        createdAt: now
      }

      setRequests((current) => [...(current || []), newRequest])
      setUpdates((current) => [...(current || []), initialUpdate])

      toast.success('تم إرسال الطلب بنجاح')
      
      setTimeout(() => {
        window.location.hash = `#track-${trackingCode}`
      }, 500)
    } catch (error) {
      toast.error('حدث خطأ أثناء إرسال الطلب')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">تقديم طلب جديد</CardTitle>
        <CardDescription>أرسل شكوى أو طلب خدمة بلدية</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="category">نوع الطلب *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category">
                <SelectValue placeholder="اختر نوع الطلب" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORIES).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="district">الحي *</Label>
            <Select value={districtId} onValueChange={setDistrictId}>
              <SelectTrigger id="district">
                <SelectValue placeholder="اختر الحي" />
              </SelectTrigger>
              <SelectContent>
                {(districts || []).map((district) => (
                  <SelectItem key={district.id} value={district.id}>
                    {district.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">وصف المشكلة *</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اشرح المشكلة بالتفصيل..."
              rows={5}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">العنوان (اختياري)</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="مثال: شارع الملك فهد، بجانب المسجد"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="photo">إضافة صورة (اختياري)</Label>
            <div className="flex items-center gap-3">
              <Input
                id="photo"
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="flex-1"
              />
              {photo && (
                <div className="relative w-16 h-16 rounded border">
                  <img src={photo} alt="معاينة" className="w-full h-full object-cover rounded" />
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">الحد الأقصى: 5 ميجابايت</p>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={submitting}
          >
            {submitting ? (
              'جاري الإرسال...'
            ) : (
              <>
                <PaperPlaneRight className="ml-2" />
                إرسال الطلب
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
