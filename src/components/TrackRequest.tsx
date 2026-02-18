import { useState } from 'react'
import { useKV } from '@github/spark/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { MagnifyingGlass, MapPin, Clock, CheckCircle, XCircle, CircleNotch } from '@phosphor-icons/react'
import { CATEGORIES, STATUSES, STATUS_COLORS, formatDate, formatRelativeTime } from '@/lib/constants'
import type { ServiceRequest, RequestUpdate, District } from '@/lib/types'

interface TrackRequestProps {
  initialCode?: string
}

export function TrackRequest({ initialCode }: TrackRequestProps) {
  const [trackingCode, setTrackingCode] = useState(initialCode || '')
  const [searchCode, setSearchCode] = useState('')
  const [requests] = useKV<ServiceRequest[]>('service_requests', [])
  const [updates] = useKV<RequestUpdate[]>('request_updates', [])
  const [districts] = useKV<District[]>('districts', [])

  const handleSearch = () => {
    setTrackingCode(searchCode.trim().toUpperCase())
  }

  const request = (requests || []).find(r => r.trackingCode === trackingCode)
  const requestUpdates = (updates || [])
    .filter(u => u.requestId === request?.id && !u.isInternal)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  
  const district = (districts || []).find(d => d.id === request?.districtId)

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted': return <CircleNotch className="animate-spin" />
      case 'received': return <Clock />
      case 'in_progress': return <Clock className="text-[oklch(0.65_0.13_65)]" />
      case 'completed': return <CheckCircle className="text-[oklch(0.60_0.15_145)]" />
      case 'rejected': return <XCircle className="text-destructive" />
      default: return <CircleNotch />
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">تتبع طلب</CardTitle>
          <CardDescription>أدخل رمز التتبع للاطلاع على حالة طلبك</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
              placeholder="أدخل رمز التتبع"
              className="flex-1 text-center text-lg tracking-wider font-mono"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch} size="lg">
              <MagnifyingGlass className="ml-2" />
              بحث
            </Button>
          </div>
        </CardContent>
      </Card>

      {trackingCode && !request && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <XCircle size={48} className="mx-auto mb-3" />
              <p className="text-lg font-semibold">رمز التتبع غير موجود</p>
              <p className="text-sm text-muted-foreground mt-2">
                يرجى التأكد من رمز التتبع والمحاولة مرة أخرى
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {request && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl">{CATEGORIES[request.category]}</CardTitle>
                    <Badge className={STATUS_COLORS[request.status]}>
                      {STATUSES[request.status]}
                    </Badge>
                  </div>
                  <CardDescription>
                    رمز التتبع: <span className="font-mono text-lg">{request.trackingCode}</span>
                  </CardDescription>
                </div>
                <div className="text-left text-sm text-muted-foreground">
                  {formatRelativeTime(request.createdAt)}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground mb-1">الوصف</h4>
                <p className="text-base">{request.description}</p>
              </div>

              {district && (
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground mb-1">الحي</h4>
                  <p className="text-base">{district.name}</p>
                </div>
              )}

              {request.addressText && (
                <div className="flex items-start gap-2">
                  <MapPin className="text-muted-foreground mt-1" size={18} />
                  <div>
                    <h4 className="font-semibold text-sm text-muted-foreground">الموقع</h4>
                    <p className="text-base">{request.addressText}</p>
                  </div>
                </div>
              )}

              <Separator />

              <div>
                <h4 className="font-semibold text-sm text-muted-foreground mb-1">تاريخ الإنشاء</h4>
                <p className="text-base">{formatDate(request.createdAt)}</p>
              </div>

              {request.closedAt && (
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground mb-1">تاريخ الإغلاق</h4>
                  <p className="text-base">{formatDate(request.closedAt)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {requestUpdates.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>التحديثات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {requestUpdates.map((update, index) => (
                    <div key={update.id} className="relative">
                      {index < requestUpdates.length - 1 && (
                        <div className="absolute right-4 top-10 bottom-0 w-px bg-border" />
                      )}
                      <div className="flex gap-4">
                        <div className="relative z-10 flex-shrink-0 w-8 h-8 rounded-full bg-card border-2 border-border flex items-center justify-center">
                          {update.toStatus && getStatusIcon(update.toStatus)}
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="flex items-center justify-between mb-1">
                            {update.toStatus && (
                              <Badge variant="outline" className="text-xs">
                                {STATUSES[update.toStatus]}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(update.createdAt)}
                            </span>
                          </div>
                          {update.message && (
                            <p className="text-sm text-foreground mt-2">{update.message}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
