import { useState } from 'react'
import { useKV } from '@github/spark/hooks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { MapPin, Clock, User as UserIcon, CheckCircle, XCircle, CircleNotch, Image as ImageIcon } from '@phosphor-icons/react'
import {
  CATEGORIES,
  STATUSES,
  STATUS_COLORS,
  PRIORITIES,
  PRIORITY_BADGE_COLORS,
  formatDate,
  formatRelativeTime,
  getValidNextStatuses,
  canTransitionTo,
  generateId
} from '@/lib/constants'
import type { ServiceRequest, RequestUpdate, User, District, RequestStatus, Priority } from '@/lib/types'

interface RequestDetailsDialogProps {
  request: ServiceRequest | null
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUser: User
}

export function RequestDetailsDialog({ request, open, onOpenChange, currentUser }: RequestDetailsDialogProps) {
  const [requests, setRequests] = useKV<ServiceRequest[]>('service_requests', [])
  const [updates, setUpdates] = useKV<RequestUpdate[]>('request_updates', [])
  const [districts] = useKV<District[]>('districts', [])
  const [users] = useKV<User[]>('users', [])

  const [newStatus, setNewStatus] = useState<string>('')
  const [newPriority, setNewPriority] = useState<string>('')
  const [internalNote, setInternalNote] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [completionPhoto, setCompletionPhoto] = useState<string>('')
  const [assignedUserId, setAssignedUserId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  if (!request) return null

  const district = (districts || []).find(d => d.id === request.districtId)
  const requestUpdates = (updates || [])
    .filter(u => u.requestId === request.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const validNextStatuses = getValidNextStatuses(request.status)
  
  const staffMembers = (users || []).filter(u => 
    u.role === 'staff' && 
    u.districtId === request.districtId
  )

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('حجم الملف كبير جداً. الحد الأقصى 5 ميجابايت')
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        setCompletionPhoto(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleAssignStaff = async () => {
    if (!assignedUserId) {
      toast.error('يرجى اختيار موظف')
      return
    }

    setSaving(true)
    try {
      const staff = staffMembers.find(u => u.id === assignedUserId)
      if (!staff) {
        toast.error('الموظف غير موجود')
        return
      }

      const now = new Date().toISOString()
      
      setRequests((current) =>
        (current || []).map(r =>
          r.id === request.id
            ? {
                ...r,
                assignedToUserId: staff.id,
                assignedToName: staff.name,
                updatedAt: now
              }
            : r
        )
      )

      const assignmentUpdate: RequestUpdate = {
        id: generateId(),
        requestId: request.id,
        actorUserId: currentUser.id,
        actorName: currentUser.name,
        message: `تم تعيين الطلب إلى ${staff.name}`,
        isInternal: true,
        createdAt: now
      }

      setUpdates((current) => [...(current || []), assignmentUpdate])

      toast.success('تم تعيين الموظف بنجاح')
      setAssignedUserId('')
    } catch (error) {
      toast.error('حدث خطأ أثناء التعيين')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async () => {
    if (!newStatus) {
      toast.error('يرجى اختيار الحالة الجديدة')
      return
    }

    if (!canTransitionTo(request.status, newStatus as RequestStatus)) {
      toast.error('هذا التحول غير مسموح به')
      return
    }

    if (newStatus === 'rejected' && !rejectionReason.trim()) {
      toast.error('يرجى إدخال سبب الرفض')
      return
    }

    if (newStatus === 'completed' && !completionPhoto) {
      toast.error('يرجى إضافة صورة بعد الإنجاز')
      return
    }

    setSaving(true)
    try {
      const now = new Date().toISOString()
      
      setRequests((current) =>
        (current || []).map(r =>
          r.id === request.id
            ? {
                ...r,
                status: newStatus as RequestStatus,
                rejectionReason: newStatus === 'rejected' ? rejectionReason : r.rejectionReason,
                completionPhotoUrl: newStatus === 'completed' ? completionPhoto : r.completionPhotoUrl,
                updatedAt: now,
                closedAt: (newStatus === 'completed' || newStatus === 'rejected') ? now : r.closedAt
              }
            : r
        )
      )

      const statusUpdate: RequestUpdate = {
        id: generateId(),
        requestId: request.id,
        actorUserId: currentUser.id,
        actorName: currentUser.name,
        message: internalNote.trim() || undefined,
        fromStatus: request.status,
        toStatus: newStatus as RequestStatus,
        isInternal: false,
        createdAt: now
      }

      setUpdates((current) => [...(current || []), statusUpdate])

      if (newStatus === 'rejected' && rejectionReason.trim()) {
        const rejectionUpdate: RequestUpdate = {
          id: generateId(),
          requestId: request.id,
          actorUserId: currentUser.id,
          actorName: currentUser.name,
          message: `سبب الرفض: ${rejectionReason}`,
          isInternal: false,
          createdAt: now
        }
        setUpdates((current) => [...(current || []), rejectionUpdate])
      }

      if (internalNote.trim()) {
        const noteUpdate: RequestUpdate = {
          id: generateId(),
          requestId: request.id,
          actorUserId: currentUser.id,
          actorName: currentUser.name,
          message: `ملاحظة داخلية: ${internalNote}`,
          isInternal: true,
          createdAt: now
        }
        setUpdates((current) => [...(current || []), noteUpdate])
      }

      toast.success('تم تحديث الحالة بنجاح')
      setNewStatus('')
      setInternalNote('')
      setRejectionReason('')
      setCompletionPhoto('')
    } catch (error) {
      toast.error('حدث خطأ أثناء التحديث')
    } finally {
      setSaving(false)
    }
  }

  const handlePriorityChange = async () => {
    if (!newPriority) {
      toast.error('يرجى اختيار الأولوية')
      return
    }

    if (newPriority === request.priority) {
      toast.error('الأولوية لم تتغير')
      return
    }

    setSaving(true)
    try {
      const now = new Date().toISOString()
      
      setRequests((current) =>
        (current || []).map(r =>
          r.id === request.id
            ? {
                ...r,
                priority: newPriority as Priority,
                updatedAt: now
              }
            : r
        )
      )

      const priorityUpdate: RequestUpdate = {
        id: generateId(),
        requestId: request.id,
        actorUserId: currentUser.id,
        actorName: currentUser.name,
        message: `تم تغيير الأولوية من "${PRIORITIES[request.priority]}" إلى "${PRIORITIES[newPriority as Priority]}"`,
        isInternal: true,
        createdAt: now
      }

      setUpdates((current) => [...(current || []), priorityUpdate])

      toast.success('تم تحديث الأولوية بنجاح')
      setNewPriority('')
    } catch (error) {
      toast.error('حدث خطأ أثناء تحديث الأولوية')
    } finally {
      setSaving(false)
    }
  }

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-xl">{CATEGORIES[request.category]}</DialogTitle>
                <Badge className={STATUS_COLORS[request.status]}>
                  {STATUSES[request.status]}
                </Badge>
                <Badge className={PRIORITY_BADGE_COLORS[request.priority]}>
                  {PRIORITIES[request.priority]}
                </Badge>
              </div>
              <DialogDescription>
                رمز التتبع: <span className="font-mono text-base">{request.trackingCode}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-sm text-muted-foreground mb-1">تاريخ الإنشاء</h4>
              <p className="text-sm">{formatDate(request.createdAt)}</p>
            </div>
            {district && (
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground mb-1">الحي</h4>
                <p className="text-sm">{district.name}</p>
              </div>
            )}
          </div>

          <div>
            <h4 className="font-semibold text-sm text-muted-foreground mb-1">الوصف</h4>
            <p className="text-sm">{request.description}</p>
          </div>

          {request.addressText && (
            <div className="flex items-start gap-2">
              <MapPin className="text-muted-foreground mt-1" size={18} />
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground">الموقع</h4>
                <p className="text-sm">{request.addressText}</p>
              </div>
            </div>
          )}

          {request.assignedToName && (
            <div className="flex items-start gap-2">
              <UserIcon className="text-muted-foreground mt-1" size={18} />
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground">المكلف</h4>
                <p className="text-sm">{request.assignedToName}</p>
              </div>
            </div>
          )}

          {request.completionPhotoUrl && (
            <div>
              <h4 className="font-semibold text-sm text-muted-foreground mb-2">صورة بعد الإنجاز</h4>
              <img 
                src={request.completionPhotoUrl} 
                alt="بعد الإنجاز" 
                className="w-full max-w-md rounded-lg border"
              />
            </div>
          )}

          <Separator />

          {(currentUser.role === 'district_admin' || currentUser.role === 'municipal_admin') && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">الإجراءات</h3>

              <div className="space-y-2">
                <Label>تغيير الأولوية</Label>
                <div className="flex gap-2">
                  <Select value={newPriority} onValueChange={setNewPriority}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={`الأولوية الحالية: ${PRIORITIES[request.priority]}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITIES).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handlePriorityChange} disabled={saving || !newPriority}>
                    تحديث
                  </Button>
                </div>
              </div>

              {!request.assignedToUserId && staffMembers.length > 0 && (
                <div className="space-y-2">
                  <Label>تعيين موظف</Label>
                  <div className="flex gap-2">
                    <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="اختر موظف" />
                      </SelectTrigger>
                      <SelectContent>
                        {staffMembers.map(staff => (
                          <SelectItem key={staff.id} value={staff.id}>
                            {staff.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={handleAssignStaff} disabled={saving || !assignedUserId}>
                      تعيين
                    </Button>
                  </div>
                </div>
              )}

              {validNextStatuses.length > 0 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>تغيير الحالة</Label>
                    <Select value={newStatus} onValueChange={setNewStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر الحالة الجديدة" />
                      </SelectTrigger>
                      <SelectContent>
                        {validNextStatuses.map(status => (
                          <SelectItem key={status} value={status}>
                            {STATUSES[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {newStatus === 'rejected' && (
                    <div className="space-y-2">
                      <Label>سبب الرفض *</Label>
                      <Textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="أدخل سبب رفض الطلب..."
                        rows={3}
                        className="resize-none"
                      />
                    </div>
                  )}

                  {newStatus === 'completed' && (
                    <div className="space-y-2">
                      <Label>صورة بعد الإنجاز *</Label>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoChange}
                      />
                      {completionPhoto && (
                        <img 
                          src={completionPhoto} 
                          alt="معاينة" 
                          className="w-32 h-32 object-cover rounded border"
                        />
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>ملاحظة داخلية (اختياري)</Label>
                    <Textarea
                      value={internalNote}
                      onChange={(e) => setInternalNote(e.target.value)}
                      placeholder="ملاحظة للفريق الداخلي فقط..."
                      rows={2}
                      className="resize-none"
                    />
                  </div>

                  <Button 
                    onClick={handleStatusChange} 
                    disabled={saving || !newStatus}
                    className="w-full"
                  >
                    {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {requestUpdates.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold text-lg mb-4">السجل الزمني</h3>
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
                            <div className="flex items-center gap-2">
                              {update.toStatus && (
                                <Badge variant="outline" className="text-xs">
                                  {STATUSES[update.toStatus]}
                                </Badge>
                              )}
                              {update.isInternal && (
                                <Badge variant="secondary" className="text-xs">
                                  داخلي
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(update.createdAt)}
                            </span>
                          </div>
                          {update.actorName && (
                            <p className="text-xs text-muted-foreground mb-1">
                              بواسطة: {update.actorName}
                            </p>
                          )}
                          {update.message && (
                            <p className="text-sm text-foreground mt-2">{update.message}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
