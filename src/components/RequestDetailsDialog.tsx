import { useState, useEffect, useRef } from 'react'
import { api, toRequestUpdate, toServiceRequest, toMaterialUsed, toAttachment, MaterialUsedOut } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { MapPin, Clock, User as UserIcon, CheckCircle, XCircle, CircleNotch, Warning, Trash, Printer } from '@phosphor-icons/react'
import {
  CATEGORIES,
  STATUSES,
  STATUS_COLORS,
  PRIORITIES,
  PRIORITY_BADGE_COLORS,
  RESPONSIBLE_TEAMS,
  formatDate,
  formatRelativeTime,
  getValidNextStatuses,
  canTransitionTo,
} from '@/lib/constants'
import type { ServiceRequest, RequestUpdate, User, District, RequestStatus, Priority, MaterialUsed, Attachment } from '@/lib/types'
import { PrintComplaint } from '@/components/PrintComplaint'

interface RequestDetailsDialogProps {
  request: ServiceRequest | null
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUser: User
  districts?: District[]
  onUpdate?: () => void
}

export function RequestDetailsDialog({ request, open, onOpenChange, currentUser, districts, onUpdate }: RequestDetailsDialogProps) {
  const [requestUpdates, setRequestUpdates] = useState<RequestUpdate[]>([])
  const [staffMembers, setStaffMembers] = useState<{ id: string; name: string }[]>([])
  const [liveRequest, setLiveRequest] = useState<ServiceRequest | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showPrint, setShowPrint] = useState(false)

  const [newStatus, setNewStatus] = useState<string>('')
  const [newPriority, setNewPriority] = useState<string>('')
  const [newResponsibleTeam, setNewResponsibleTeam] = useState<string>('')
  const [internalNote, setInternalNote] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [completionPhotoFile, setCompletionPhotoFile] = useState<File | null>(null)
  const [completionPhotoPreview, setCompletionPhotoPreview] = useState<string>('')
  const [assignedUserId, setAssignedUserId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  // Materials used state
  const [materials, setMaterials] = useState<MaterialUsed[]>([])
  const [newMatName, setNewMatName] = useState('')
  const [newMatQty, setNewMatQty] = useState('')
  const [newMatNotes, setNewMatNotes] = useState('')
  const [addingMaterial, setAddingMaterial] = useState(false)

  const photoPreviewUrlRef = useRef<string>('')

  // Fetch full request details and staff list when dialog opens
  useEffect(() => {
    if (open && request) {
      api.getRequest(request.id)
        .then((detail) => {
          setLiveRequest(toServiceRequest(detail))
          setRequestUpdates(
            detail.updates
              .map(toRequestUpdate)
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          )
          setMaterials((detail.materials_used ?? []).map(toMaterialUsed))
          setAttachments((detail.attachments ?? []).map(toAttachment))
        })
        .catch(() => {})

      if (currentUser.role === 'district_admin' || currentUser.role === 'municipal_admin') {
        api.getStaff(request.districtId)
          .then((list) => setStaffMembers(list.map(u => ({ id: String(u.id), name: u.full_name }))))
          .catch(() => {})
      }
    }
    if (!open) {
      // Reset form state when dialog closes
      setNewStatus('')
      setNewPriority('')
      setNewResponsibleTeam('')
      setInternalNote('')
      setRejectionReason('')
      setCompletionPhotoFile(null)
      if (photoPreviewUrlRef.current) {
        URL.revokeObjectURL(photoPreviewUrlRef.current)
        photoPreviewUrlRef.current = ''
      }
      setCompletionPhotoPreview('')
      setAssignedUserId('')
      setLiveRequest(null)
      setRequestUpdates([])
      setMaterials([])
      setAttachments([])
      setNewMatName('')
      setNewMatQty('')
      setNewMatNotes('')
    }
  }, [open, request, currentUser.role])

  if (!request) return null

  // Use live request data if available, fall back to prop
  const displayRequest = liveRequest ?? request

  const district = (districts || []).find(d => d.id === displayRequest.districtId)
  const validNextStatuses = getValidNextStatuses(displayRequest.status, currentUser.role)


  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('حجم الملف كبير جداً. الحد الأقصى 5 ميجابايت')
        return
      }
      // Revoke previous object URL to avoid memory leaks
      if (photoPreviewUrlRef.current) {
        URL.revokeObjectURL(photoPreviewUrlRef.current)
      }
      const url = URL.createObjectURL(file)
      photoPreviewUrlRef.current = url
      setCompletionPhotoFile(file)
      setCompletionPhotoPreview(url)
    }
  }

  const handleAssignStaff = async () => {
    if (!assignedUserId) {
      toast.error('يرجى اختيار موظف')
      return
    }

    setSaving(true)
    try {
      const updated = await api.assignStaff(displayRequest.id, assignedUserId)
      setLiveRequest(toServiceRequest(updated))
      toast.success('تم تعيين الموظف بنجاح')
      setAssignedUserId('')
      onUpdate?.()
    } catch (error: any) {
      toast.error(error?.message || 'حدث خطأ أثناء التعيين')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async () => {
    if (!newStatus) {
      toast.error('يرجى اختيار الحالة الجديدة')
      return
    }

    if (!canTransitionTo(displayRequest.status, newStatus as RequestStatus, currentUser.role)) {
      toast.error('هذا التحول غير مسموح به')
      return
    }

    if (newStatus === 'rejected' && !rejectionReason.trim()) {
      toast.error('يرجى إدخال سبب الرفض')
      return
    }

    if (newStatus === 'resolved' && !completionPhotoFile) {
      toast.error('يرجى إضافة صورة بعد الإنجاز')
      return
    }

    setSaving(true)
    try {
      let completionPhotoUrl: string | undefined

      if (newStatus === 'resolved' && completionPhotoFile) {
        const attachment = await api.uploadAttachment(displayRequest.id, completionPhotoFile, 'after')
        completionPhotoUrl = attachment.file_url
      }

      const updated = await api.updateStatus(displayRequest.id, {
        status: newStatus,
        rejection_reason: newStatus === 'rejected' ? rejectionReason : undefined,
        completion_photo_url: newStatus === 'resolved' ? completionPhotoUrl : undefined,
        note: internalNote.trim() || undefined,
      })
      setLiveRequest(toServiceRequest(updated))
      // Refresh updates from server
      const detail = await api.getRequest(displayRequest.id)
      setRequestUpdates(
        detail.updates
          .map(toRequestUpdate)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      )
      toast.success('تم تحديث الحالة بنجاح')
      setNewStatus('')
      setInternalNote('')
      setRejectionReason('')
      setCompletionPhotoFile(null)
      if (photoPreviewUrlRef.current) {
        URL.revokeObjectURL(photoPreviewUrlRef.current)
        photoPreviewUrlRef.current = ''
      }
      setCompletionPhotoPreview('')
      onUpdate?.()
    } catch (error: any) {
      toast.error(error?.message || 'حدث خطأ أثناء التحديث')
    } finally {
      setSaving(false)
    }
  }

  const handlePriorityChange = async () => {
    if (!newPriority) {
      toast.error('يرجى اختيار الأولوية')
      return
    }

    if (newPriority === displayRequest.priority) {
      toast.error('الأولوية لم تتغير')
      return
    }

    setSaving(true)
    try {
      const updated = await api.updatePriority(displayRequest.id, newPriority)
      setLiveRequest(toServiceRequest(updated))
      toast.success('تم تحديث الأولوية بنجاح')
      setNewPriority('')
      onUpdate?.()
    } catch (error: any) {
      toast.error(error?.message || 'حدث خطأ أثناء تحديث الأولوية')
    } finally {
      setSaving(false)
    }
  }

  const handleResponsibleTeamChange = async () => {
    setSaving(true)
    try {
      const updated = await api.updateResponsibleTeam(
        displayRequest.id,
        newResponsibleTeam || null,
      )
      setLiveRequest(toServiceRequest(updated))
      toast.success('تم تحديث الفريق المسؤول')
      setNewResponsibleTeam('')
      onUpdate?.()
    } catch (error: any) {
      toast.error(error?.message || 'حدث خطأ أثناء تحديث الفريق')
    } finally {
      setSaving(false)
    }
  }

  const handleAddMaterial = async () => {
    if (!newMatName.trim() || !newMatQty.trim()) {
      toast.error('يرجى إدخال اسم المادة والكمية')
      return
    }
    setAddingMaterial(true)
    try {
      const created = await api.addMaterial(displayRequest.id, {
        name: newMatName.trim(),
        quantity: newMatQty.trim(),
        notes: newMatNotes.trim() || undefined,
      })
      setMaterials((prev) => [...prev, toMaterialUsed(created)])
      setNewMatName('')
      setNewMatQty('')
      setNewMatNotes('')
      toast.success('تمت إضافة المادة')
    } catch (error: any) {
      toast.error(error?.message || 'حدث خطأ أثناء إضافة المادة')
    } finally {
      setAddingMaterial(false)
    }
  }

  const handleDeleteMaterial = async (materialId: string) => {
    try {
      await api.deleteMaterial(displayRequest.id, materialId)
      setMaterials((prev) => prev.filter((m) => m.id !== materialId))
      toast.success('تم حذف المادة')
    } catch (error: any) {
      toast.error(error?.message || 'حدث خطأ أثناء الحذف')
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new': return <CircleNotch className="animate-spin" />
      case 'under_review': return <Clock />
      case 'in_progress': return <Clock className="text-[oklch(0.65_0.13_65)]" />
      case 'resolved': return <CheckCircle className="text-[oklch(0.60_0.15_145)]" />
      case 'rejected': return <XCircle className="text-destructive" />
      case 'deferred': return <Clock className="text-[oklch(0.60_0.08_280)]" />
      default: return <CircleNotch />
    }
  }

  return (
    <>
      {showPrint && (
        <PrintComplaint
          request={displayRequest}
          updates={requestUpdates}
          materials={materials}
          attachments={attachments}
          districts={districts}
          onClose={() => setShowPrint(false)}
        />
      )}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-xl">{CATEGORIES[displayRequest.category]}</DialogTitle>
                  <Badge className={STATUS_COLORS[displayRequest.status]}>
                    {STATUSES[displayRequest.status]}
                  </Badge>
                  <Badge className={PRIORITY_BADGE_COLORS[displayRequest.priority]}>
                    {PRIORITIES[displayRequest.priority]}
                  </Badge>
                  {displayRequest.isAutoEscalated && (
                    <Badge variant="outline" className="text-xs border-[oklch(0.70_0.15_65)] text-[oklch(0.70_0.15_65)]">
                      ترقية تلقائية
                    </Badge>
                  )}
                </div>
                <DialogDescription>
                  رمز التتبع: <span className="font-mono text-base">{displayRequest.trackingCode}</span>
                  {displayRequest.complaintNumber && (
                    <span className="mr-4 font-mono text-base text-foreground">
                      رقم الشكوى: {displayRequest.complaintNumber}
                    </span>
                  )}
                </DialogDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPrint(true)}
                className="flex-shrink-0 gap-1"
              >
                <Printer size={16} />
                طباعة الشكوى
              </Button>
            </div>
          </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-sm text-muted-foreground mb-1">تاريخ الإنشاء</h4>
              <p className="text-sm">{formatDate(displayRequest.createdAt)}</p>
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
            <p className="text-sm">{displayRequest.description}</p>
          </div>

          {displayRequest.addressText && (
            <div className="flex items-start gap-2">
              <MapPin className="text-muted-foreground mt-1" size={18} />
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground">الموقع</h4>
                <p className="text-sm">{displayRequest.addressText}</p>
              </div>
            </div>
          )}

          {displayRequest.assignedToName && (
            <div className="flex items-start gap-2">
              <UserIcon className="text-muted-foreground mt-1" size={18} />
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground">المكلف</h4>
                <p className="text-sm">{displayRequest.assignedToName}</p>
              </div>
            </div>
          )}

          {displayRequest.completionPhotoUrl && (
            <div>
              <h4 className="font-semibold text-sm text-muted-foreground mb-2">صورة بعد الإنجاز</h4>
              <img 
                src={displayRequest.completionPhotoUrl} 
                alt="بعد الإنجاز" 
                className="w-full max-w-md rounded-lg border"
              />
            </div>
          )}

          {displayRequest.responsibleTeam && (
            <div>
              <h4 className="font-semibold text-sm text-muted-foreground mb-1">الفريق المسؤول</h4>
              <Badge variant="outline">{RESPONSIBLE_TEAMS[displayRequest.responsibleTeam] ?? displayRequest.responsibleTeam}</Badge>
            </div>
          )}

          {materials.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm text-muted-foreground mb-2">المواد المستخدمة</h4>
              <div className="space-y-1">
                {materials.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm border rounded px-3 py-2">
                    <span>
                      <span className="font-medium">{m.name}</span>
                      <span className="text-muted-foreground mx-2">—</span>
                      <span>{m.quantity}</span>
                      {m.notes && <span className="text-muted-foreground mr-2">({m.notes})</span>}
                    </span>
                    {(currentUser.role === 'mayor' || currentUser.role === 'governor' ||
                      currentUser.role === 'mukhtar' || currentUser.role === 'district_admin' ||
                      currentUser.role === 'municipal_admin') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteMaterial(m.id)}
                      >
                        <Trash size={14} />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {(currentUser.role === 'district_admin' || currentUser.role === 'municipal_admin' ||
            currentUser.role === 'mukhtar' || currentUser.role === 'mayor' ||
            currentUser.role === 'governor') && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">الإجراءات</h3>

              <div className="space-y-2">
                <Label>تغيير الأولوية</Label>
                <div className="flex gap-2">
                  <Select value={newPriority} onValueChange={setNewPriority}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={`الأولوية الحالية: ${PRIORITIES[displayRequest.priority]}`} />
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

              {(currentUser.role === 'mayor' || currentUser.role === 'governor') && (
                <div className="space-y-2">
                  <Label>الفريق المسؤول</Label>
                  <div className="flex gap-2">
                    <Select value={newResponsibleTeam} onValueChange={setNewResponsibleTeam}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder={
                          displayRequest.responsibleTeam
                            ? `الفريق الحالي: ${RESPONSIBLE_TEAMS[displayRequest.responsibleTeam] ?? displayRequest.responsibleTeam}`
                            : 'اختر الفريق المسؤول'
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(RESPONSIBLE_TEAMS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={handleResponsibleTeamChange} disabled={saving || !newResponsibleTeam}>
                      تعيين
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>إضافة مادة مستخدمة</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="اسم المادة (مثال: كابل كهرباء)"
                    value={newMatName}
                    onChange={(e) => setNewMatName(e.target.value)}
                    dir="rtl"
                  />
                  <Input
                    placeholder="الكمية (مثال: 15 متر)"
                    value={newMatQty}
                    onChange={(e) => setNewMatQty(e.target.value)}
                    dir="rtl"
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="ملاحظات (اختياري)"
                    value={newMatNotes}
                    onChange={(e) => setNewMatNotes(e.target.value)}
                    dir="rtl"
                    className="flex-1"
                  />
                  <Button
                    onClick={handleAddMaterial}
                    disabled={addingMaterial || !newMatName.trim() || !newMatQty.trim()}
                    size="sm"
                  >
                    {addingMaterial ? 'جارٍ...' : 'إضافة'}
                  </Button>
                </div>
              </div>

              {!displayRequest.assignedToUserId && staffMembers.length > 0 && (
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

                  {newStatus === 'resolved' && (
                    <div className="space-y-2">
                      <Label>صورة بعد الإنجاز *</Label>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoChange}
                      />
                      {completionPhotoPreview && (
                        <img 
                          src={completionPhotoPreview} 
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
                        <div className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full ${update.isAutoEscalation ? 'bg-[oklch(0.70_0.15_65)]/10 border-2 border-[oklch(0.70_0.15_65)]' : 'bg-card border-2 border-border'} flex items-center justify-center`}>
                          {update.toStatus && getStatusIcon(update.toStatus)}
                          {update.isAutoEscalation && !update.toStatus && (
                            <Warning size={16} className="text-[oklch(0.70_0.15_65)]" />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              {update.toStatus && (
                                <Badge variant="outline" className="text-xs">
                                  {STATUSES[update.toStatus]}
                                </Badge>
                              )}
                              {update.isAutoEscalation && (
                                <Badge className="text-xs bg-[oklch(0.70_0.15_65)] text-[oklch(0.25_0.05_60)]">
                                  ترقية تلقائية
                                </Badge>
                              )}
                              {update.isInternal && !update.isAutoEscalation && (
                                <Badge variant="secondary" className="text-xs">
                                  داخلي
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(update.createdAt)}
                            </span>
                          </div>
                          {update.actorName && !update.isAutoEscalation && (
                            <p className="text-xs text-muted-foreground mb-1">
                              بواسطة: {update.actorName}
                            </p>
                          )}
                          {update.isAutoEscalation && (
                            <p className="text-xs text-[oklch(0.70_0.15_65)] mb-1">
                              النظام الآلي
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
    </>
  )
}
