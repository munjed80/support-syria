import { useState, useEffect, useCallback } from 'react'
import { api, toMunicipalTeam, toServiceRequest, toDistrict, toMunicipality, toUser, MunicipalityOut, DistrictOut, DashboardData, MukhtarDashboard, MayorDashboard, GovernorDashboard, MonthlyReport, GovernorPerformanceDashboardResponse, MayorPerformanceDashboardResponse, AccountabilityReport, NotificationOut } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { SignOut, ChartBar, Buildings, Warning, ClipboardText, Plus, MagnifyingGlass, MapPin, Users, CheckCircle, Timer, Wrench, Printer, PencilSimple, CaretDown, DownloadSimple, ArchiveBox, Bell } from '@phosphor-icons/react'
import { CATEGORIES, STATUSES, STATUS_COLORS, PRIORITIES, PRIORITY_BADGE_COLORS, RESPONSIBLE_TEAMS, formatRelativeTime, isOverdue } from '@/lib/constants'
import { RequestDetailsDialog } from '@/components/RequestDetailsDialog'
import { PrintReport } from '@/components/PrintReport'
import type { ServiceRequest, User, District, Municipality, MunicipalTeam } from '@/lib/types'
import { toast } from 'sonner'

interface AdminDashboardProps {
  user: User
  onLogout: () => void
}

function EmptyState({ title, description, actionLabel, onAction }: { title: string; description: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="py-10 text-center space-y-3">
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Button onClick={onAction}>
        <Plus className="ml-2" size={16} />
        {actionLabel}
      </Button>
    </div>
  )
}

// ─── Municipality Management (Governor) ──────────────────────────────────────

function MunicipalitiesView({ user }: { user: User }) {
  const [municipalities, setMunicipalities] = useState<Municipality[]>([])
  const [districts, setDistricts] = useState<District[]>([])
  const [mayors, setMayors] = useState<User[]>([])
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState<Municipality | null>(null)
  const [editName, setEditName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Municipality | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [munList, districtList, mayorsList, requestsList] = await Promise.all([
        api.getMunicipalities(),
        api.getAdminDistricts(),
        api.getMayors(),
        api.getRequests({ page: 1, page_size: 500 }),
      ])
      setMunicipalities(munList.map(toMunicipality))
      setDistricts(districtList.map(toDistrict))
      setMayors(mayorsList.map(toUser))
      setRequests(requestsList.items.map(toServiceRequest))
    } catch {
      toast.error('تعذّر تحميل بيانات البلديات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!newName.trim()) return
    setSubmitting(true)
    try {
      const created = await api.createMunicipality(newName.trim())
      setMunicipalities((prev) => [...prev, toMunicipality(created)].sort((a, b) => a.name.localeCompare(b.name, 'ar')))
      setNewName('')
      setShowAdd(false)
      toast.success('تمت إضافة البلدية')
    } catch (e: any) {
      toast.error(e.message || 'فشل إضافة البلدية')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (mun: Municipality) => {
    try {
      const updated = await api.updateMunicipality(mun.id, { is_active: !mun.isActive })
      const mapped = toMunicipality(updated)
      setMunicipalities((prev) => prev.map((item) => item.id === mun.id ? mapped : item))
      toast.success(mun.isActive ? 'تم تعطيل البلدية' : 'تم تفعيل البلدية')
    } catch (e: any) {
      toast.error(e.message || 'فشل التحديث')
    }
  }

  const handleSaveEdit = async () => {
    if (!editing || !editName.trim()) return
    try {
      const updated = await api.updateMunicipality(editing.id, { name: editName.trim() })
      const mapped = toMunicipality(updated)
      setMunicipalities((prev) => prev.map((item) => item.id === editing.id ? mapped : item))
      setEditing(null)
      setEditName('')
      toast.success('تم تعديل البلدية')
    } catch (e: any) {
      toast.error(e.message || 'فشل تعديل البلدية')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.deleteMunicipality(deleteTarget.id)
      setMunicipalities((prev) => prev.filter((item) => item.id !== deleteTarget.id))
      setDeleteTarget(null)
      toast.success('تم حذف البلدية')
    } catch (e: any) {
      toast.error(e.message || 'تعذّر حذف البلدية، يمكنك تعطيلها بدلاً من الحذف')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">البلديات</h2>
        <Button onClick={() => setShowAdd(true)} size="sm">
          <Plus className="ml-2" size={16} />
          إضافة بلدية
        </Button>
      </div>

      {showAdd && (
        <Card className="border-primary/30">
          <CardContent className="pt-4">
            <div className="flex gap-2">
              <Input
                placeholder="اسم البلدية"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                className="flex-1"
                dir="rtl"
              />
              <Button onClick={handleAdd} disabled={submitting || !newName.trim()}>
                حفظ
              </Button>
              <Button variant="outline" onClick={() => { setShowAdd(false); setNewName('') }}>
                إلغاء
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <p className="text-center text-muted-foreground py-8">جارٍ التحميل...</p>
          ) : municipalities.length === 0 ? (
            <EmptyState
              title="لا توجد بلديات بعد"
              description="ابدأ بإضافة أول بلدية لتفعيل التسلسل الإداري."
              actionLabel="إضافة أول بلدية"
              onAction={() => setShowAdd(true)}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>اسم البلدية</TableHead>
                  <TableHead>عدد الأحياء</TableHead>
                  <TableHead>عدد رؤساء البلديات</TableHead>
                  <TableHead>عدد الشكاوى</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {municipalities.map((mun) => (
                  <TableRow key={mun.id}>
                    <TableCell className="font-medium">{mun.name}</TableCell>
                    <TableCell>{districts.filter((d) => d.municipalityId === mun.id).length}</TableCell>
                    <TableCell>{mayors.filter((m) => m.municipalityId === mun.id).length}</TableCell>
                    <TableCell>{requests.filter((r) => r.municipalityId === mun.id).length}</TableCell>
                    <TableCell>
                      <Badge variant={mun.isActive ? 'default' : 'secondary'}>
                        {mun.isActive ? 'مفعّلة' : 'معطّلة'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={mun.isActive}
                          onCheckedChange={() => toggleActive(mun)}
                        />
                        <Label className="text-sm">
                          {mun.isActive ? 'تعطيل' : 'تفعيل'}
                        </Label>
                        <Button size="sm" variant="outline" onClick={() => { setEditing(mun); setEditName(mun.name) }}>
                          <PencilSimple className="ml-1" size={14} />
                          تعديل
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(mun)}>
                          حذف
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {editing && (
        <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>تعديل البلدية</DialogTitle></DialogHeader>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} dir="rtl" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
              <Button onClick={handleSaveEdit}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {deleteTarget && (
        <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>تأكيد حذف البلدية</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">سيتم حذف البلدية فقط إذا لم تكن مرتبطة بأحياء أو مستخدمين أو شكاوى.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
              <Button variant="destructive" onClick={handleDelete}>تأكيد الحذف</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ─── District Management (Mayor) ─────────────────────────────────────────────

function DistrictsView({ user }: { user: User }) {
  const [districts, setDistricts] = useState<District[]>([])
  const [mukhtars, setMukhtars] = useState<User[]>([])
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState<District | null>(null)
  const [editName, setEditName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<District | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [districtList, mukhtarList, reqList] = await Promise.all([
        api.getAdminDistricts(),
        api.getMukhtars(),
        api.getRequests({ page: 1, page_size: 500 }),
      ])
      setDistricts(districtList.map(toDistrict))
      setMukhtars(mukhtarList.map(toUser))
      setRequests(reqList.items.map(toServiceRequest))
    } catch {
      toast.error('تعذّر تحميل الأحياء')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!newName.trim()) return
    setSubmitting(true)
    try {
      const created = await api.createDistrict(newName.trim())
      setDistricts((prev) => [...prev, toDistrict(created)].sort((a, b) => a.name.localeCompare(b.name, 'ar')))
      setNewName('')
      setShowAdd(false)
      toast.success('تمت إضافة الحي')
    } catch (e: any) {
      toast.error(e.message || 'فشل إضافة الحي')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (district: District) => {
    try {
      const updated = await api.updateDistrict(district.id, { is_active: !district.isActive })
      const mapped = toDistrict(updated)
      setDistricts((prev) => prev.map((item) => item.id === district.id ? mapped : item))
      toast.success(district.isActive ? 'تم تعطيل الحي' : 'تم تفعيل الحي')
    } catch (e: any) {
      toast.error(e.message || 'فشل التحديث')
    }
  }

  const handleSaveEdit = async () => {
    if (!editing || !editName.trim()) return
    try {
      const updated = await api.updateDistrict(editing.id, { name: editName.trim() })
      const mapped = toDistrict(updated)
      setDistricts((prev) => prev.map((item) => item.id === editing.id ? mapped : item))
      setEditing(null)
      setEditName('')
      toast.success('تم تحديث الحي')
    } catch (e: any) {
      toast.error(e.message || 'فشل التحديث')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.deleteDistrict(deleteTarget.id)
      setDistricts((prev) => prev.filter((item) => item.id !== deleteTarget.id))
      setDeleteTarget(null)
      toast.success('تم حذف الحي')
    } catch (e: any) {
      toast.error(e.message || 'تعذّر حذف الحي')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">الأحياء</h2>
        <Button onClick={() => setShowAdd(true)} size="sm">
          <Plus className="ml-2" size={16} />
          إضافة حي
        </Button>
      </div>

      {showAdd && (
        <Card className="border-primary/30">
          <CardContent className="pt-4">
            <div className="flex gap-2">
              <Input
                placeholder="اسم الحي"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                className="flex-1"
                dir="rtl"
              />
              <Button onClick={handleAdd} disabled={submitting || !newName.trim()}>
                حفظ
              </Button>
              <Button variant="outline" onClick={() => { setShowAdd(false); setNewName('') }}>
                إلغاء
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <p className="text-center text-muted-foreground py-8">جارٍ التحميل...</p>
          ) : districts.length === 0 ? (
            <EmptyState
              title="لا توجد أحياء بعد"
              description="أضف الحي الأول لتتمكن من إنشاء حسابات المخاتير وتوزيع الطلبات."
              actionLabel="إضافة أول حي"
              onAction={() => setShowAdd(true)}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>اسم الحي</TableHead>
                  <TableHead>المختار</TableHead>
                  <TableHead>عدد الشكاوى</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {districts.map((district) => (
                  <TableRow key={district.id}>
                    <TableCell className="font-medium">{district.name}</TableCell>
                    <TableCell>{mukhtars.find((m) => m.districtId === district.id)?.fullName ?? 'غير مُعيّن'}</TableCell>
                    <TableCell>{requests.filter((r) => r.districtId === district.id).length}</TableCell>
                    <TableCell>
                      <Badge variant={district.isActive ? 'default' : 'secondary'}>
                        {district.isActive ? 'مفعّل' : 'معطّل'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={district.isActive}
                          onCheckedChange={() => toggleActive(district)}
                        />
                        <Label className="text-sm">
                          {district.isActive ? 'تعطيل' : 'تفعيل'}
                        </Label>
                        <Button size="sm" variant="outline" onClick={() => { setEditing(district); setEditName(district.name) }}>
                          تعديل
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(district)}>
                          حذف
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {editing && (
        <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>تعديل الحي</DialogTitle></DialogHeader>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} dir="rtl" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
              <Button onClick={handleSaveEdit}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {deleteTarget && (
        <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>تأكيد حذف الحي</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">سيتم الحذف فقط إذا لم تكن هناك حسابات أو شكاوى مرتبطة بهذا الحي.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
              <Button variant="destructive" onClick={handleDelete}>تأكيد الحذف</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ─── Create Request Dialog (Mukhtar) ─────────────────────────────────────────

function CreateRequestDialog({
  open,
  onOpenChange,
  districtId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  districtId: string
  onCreated: () => void
}) {
  const [category, setCategory] = useState('other')
  const [priority, setPriority] = useState('normal')
  const [description, setDescription] = useState('')
  const [addressText, setAddressText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!description.trim()) return
    setSubmitting(true)
    try {
      await api.createRequest({
        district_id: districtId,
        category,
        priority,
        description: description.trim(),
        address_text: addressText.trim() || undefined,
      })
      setDescription('')
      setAddressText('')
      setCategory('other')
      setPriority('normal')
      onOpenChange(false)
      onCreated()
      toast.success('تم تسجيل الطلب بنجاح')
    } catch (e: any) {
      toast.error(e.message || 'فشل تسجيل الطلب')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>تسجيل طلب جديد</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>الفئة</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORIES).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الأولوية</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORITIES).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>وصف الطلب <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder="أدخل وصفاً تفصيلياً للطلب..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              dir="rtl"
            />
          </div>
          <div>
            <Label>العنوان (اختياري)</Label>
            <Input
              placeholder="حارة / شارع / وصف الموقع"
              value={addressText}
              onChange={(e) => setAddressText(e.target.value)}
              dir="rtl"
            />
          </div>
        </div>
        <DialogFooter className="flex-row-reverse gap-2">
          <Button onClick={handleSubmit} disabled={submitting || !description.trim()}>
            {submitting ? 'جارٍ الحفظ...' : 'تسجيل الطلب'}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Requests View ────────────────────────────────────────────────────────────

function RequestsView({ user }: { user: User }) {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [districts, setDistricts] = useState<District[]>([])
  const [municipalities, setMunicipalities] = useState<Municipality[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  // Dashboard stats (server-side)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [priorityFilter, setPriorityFilter] = useState<string[]>([])
  const [responsibleTeamFilter, setResponsibleTeamFilter] = useState<string[]>([])
  const [complaintNumberSearch, setComplaintNumberSearch] = useState('')
  const [districtFilter, setDistrictFilter] = useState<string>('all')
  const [municipalityFilter, setMunicipalityFilter] = useState<string>('all')
  const [overdueFilter, setOverdueFilter] = useState<boolean>(false)
  const [slaBreachedFilter, setSlaBreachedFilter] = useState<boolean>(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [archivedOnly, setArchivedOnly] = useState(false)

  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const isGovernor = user.role === 'governor'
  const isMayor = user.role === 'mayor'
  const isMukhtar = user.role === 'mukhtar'

  // Load dashboard stats on mount
  useEffect(() => {
    api.getDashboard()
      .then((data) => setDashboard(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (isGovernor) {
      api.getMunicipalities().then((list) => setMunicipalities(list.map(toMunicipality))).catch(() => {})
      api.getAdminDistricts().then((list) => setDistricts(list.map(toDistrict))).catch(() => {})
    } else if (isMayor) {
      api.getAdminDistricts().then((list) => setDistricts(list.map(toDistrict))).catch(() => {})
    } else {
      api.getDistricts().then((list) => setDistricts(list.map(toDistrict))).catch(() => {})
    }
  }, [isGovernor, isMayor])

  const fetchRequests = useCallback(() => {
    const filters: Record<string, any> = {
      page,
      page_size: PAGE_SIZE,
      sort_by: sortBy,
      sort_dir: sortDir,
    }
    if (statusFilter.length > 0) filters.status = statusFilter
    if (categoryFilter.length > 0) filters.category = categoryFilter
    if (priorityFilter.length > 0) filters.priority = priorityFilter
    if (responsibleTeamFilter.length > 0) filters.responsible_team = responsibleTeamFilter
    if (complaintNumberSearch.trim()) filters.complaint_number = complaintNumberSearch.trim()
    if (districtFilter !== 'all') filters.district_id = districtFilter
    if (municipalityFilter !== 'all') filters.municipality_id = municipalityFilter
    if (overdueFilter) filters.overdue = true
    if (slaBreachedFilter) filters.sla_breached = true
    if (dateFrom) filters.date_from = dateFrom
    if (dateTo) filters.date_to = dateTo
    if (search.trim()) filters.search = search.trim()
    if (archivedOnly) filters.archived = true

    api.getRequests(filters)
      .then((result) => {
        setRequests(result.items.map(toServiceRequest))
        setTotal(result.total)
      })
      .catch(() => {})
  }, [page, statusFilter, categoryFilter, priorityFilter, responsibleTeamFilter,
      complaintNumberSearch, districtFilter, municipalityFilter,
      overdueFilter, slaBreachedFilter, dateFrom, dateTo, search, sortBy, sortDir, archivedOnly])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  const toggleMultiFilter = (
    value: string,
    current: string[],
    set: (v: string[]) => void,
  ) => {
    if (current.includes(value)) {
      set(current.filter((v) => v !== value))
    } else {
      set([...current, value])
    }
    setPage(1)
  }

  const clearAllFilters = () => {
    setOverdueFilter(false)
    setSlaBreachedFilter(false)
    setDateFrom('')
    setDateTo('')
    setStatusFilter([])
    setCategoryFilter([])
    setPriorityFilter([])
    setResponsibleTeamFilter([])
    setComplaintNumberSearch('')
    setDistrictFilter('all')
    setMunicipalityFilter('all')
    setSearch('')
    setArchivedOnly(false)
    setPage(1)
  }

  const hasActiveFilters = overdueFilter || slaBreachedFilter || dateFrom || dateTo || archivedOnly ||
    statusFilter.length > 0 || categoryFilter.length > 0 || priorityFilter.length > 0 ||
    responsibleTeamFilter.length > 0 || complaintNumberSearch.trim() ||
    districtFilter !== 'all' || municipalityFilter !== 'all' || search.trim()

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      {/* Role-specific dashboard summary cards */}
      {dashboard && dashboard.role === 'mukhtar' && (() => {
        const d = dashboard as MukhtarDashboard
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>مفتوحة في الحي</CardDescription>
                <CardTitle className="text-3xl text-[oklch(0.55_0.10_250)]">{d.open}</CardTitle>
              </CardHeader>
              <CardContent><Buildings size={24} className="text-muted-foreground" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>قيد المعالجة</CardDescription>
                <CardTitle className="text-3xl text-[oklch(0.65_0.13_65)]">{d.in_progress}</CardTitle>
              </CardHeader>
              <CardContent><Timer size={24} className="text-muted-foreground" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>منجزة هذا الشهر</CardDescription>
                <CardTitle className="text-3xl text-[oklch(0.60_0.15_145)]">{d.resolved_this_month}</CardTitle>
              </CardHeader>
              <CardContent><CheckCircle size={24} className="text-muted-foreground" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>إجمالي المنجزة</CardDescription>
                <CardTitle className="text-3xl">{d.resolved}</CardTitle>
              </CardHeader>
              <CardContent><ChartBar size={24} className="text-muted-foreground" /></CardContent>
            </Card>
          </div>
        )
      })()}

      {dashboard && dashboard.role === 'mayor' && (() => {
        const d = dashboard as MayorDashboard
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>مفتوحة في البلدية</CardDescription>
                <CardTitle className="text-3xl text-[oklch(0.55_0.10_250)]">{d.open}</CardTitle>
              </CardHeader>
              <CardContent><Buildings size={24} className="text-muted-foreground" /></CardContent>
            </Card>
            <Card className="border-destructive/50">
              <CardHeader className="pb-2">
                <CardDescription>عاجلة</CardDescription>
                <CardTitle className="text-3xl text-destructive">{d.urgent}</CardTitle>
              </CardHeader>
              <CardContent><Warning size={24} className="text-destructive" /></CardContent>
            </Card>
            <Card className="border-orange-400/50">
              <CardHeader className="pb-2">
                <CardDescription>متأخّرة عن الموعد</CardDescription>
                <CardTitle className="text-3xl text-orange-600">{d.overdue}</CardTitle>
              </CardHeader>
              <CardContent><Timer size={24} className="text-orange-500" /></CardContent>
            </Card>
            {d.most_problematic_district && (
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>أكثر الأحياء شكاوى</CardDescription>
                  <CardTitle className="text-lg">{d.most_problematic_district}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{d.most_problematic_district_count} طلب</CardContent>
              </Card>
            )}
            {d.most_common_category && (
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>أكثر الفئات تكراراً</CardDescription>
                  <CardTitle className="text-lg">{CATEGORIES[d.most_common_category as keyof typeof CATEGORIES] ?? d.most_common_category}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{d.most_common_category_count} طلب</CardContent>
              </Card>
            )}
          </div>
        )
      })()}

      {dashboard && dashboard.role === 'governor' && (() => {
        const d = dashboard as GovernorDashboard
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>إجمالي الشكاوى</CardDescription>
                  <CardTitle className="text-3xl">{d.total}</CardTitle>
                </CardHeader>
                <CardContent><ChartBar size={24} className="text-muted-foreground" /></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>مفتوحة / قيد الدراسة</CardDescription>
                  <CardTitle className="text-3xl text-[oklch(0.55_0.10_250)]">{d.open}</CardTitle>
                </CardHeader>
                <CardContent><Buildings size={24} className="text-muted-foreground" /></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>قيد المعالجة</CardDescription>
                  <CardTitle className="text-3xl text-[oklch(0.65_0.13_65)]">{d.in_progress}</CardTitle>
                </CardHeader>
                <CardContent><Timer size={24} className="text-muted-foreground" /></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>منجزة</CardDescription>
                  <CardTitle className="text-3xl text-[oklch(0.60_0.15_145)]">{d.resolved}</CardTitle>
                </CardHeader>
                <CardContent><CheckCircle size={24} className="text-muted-foreground" /></CardContent>
              </Card>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {d.by_municipality.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">الشكاوى حسب البلدية</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {d.by_municipality.map((m) => (
                        <div key={m.name} className="flex justify-between text-sm">
                          <span>{m.name}</span>
                          <span className="font-semibold">{m.count}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {d.by_district.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">أكثر الأحياء شكاوى (أعلى 10)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {d.by_district.map((dist) => (
                        <div key={dist.name} className="flex justify-between text-sm">
                          <span>{dist.name}</span>
                          <span className="font-semibold">{dist.count}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="grid grid-cols-2 gap-4">
                {d.most_common_category && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>أكثر الفئات تكراراً</CardDescription>
                      <CardTitle className="text-base">{CATEGORIES[d.most_common_category as keyof typeof CATEGORIES] ?? d.most_common_category}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">{d.most_common_category_count} طلب</CardContent>
                  </Card>
                )}
                {d.most_assigned_team && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>أكثر الفرق تكليفاً</CardDescription>
                      <CardTitle className="text-base">{RESPONSIBLE_TEAMS[d.most_assigned_team] ?? d.most_assigned_team}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">{d.most_assigned_team_count} طلب</CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Filters + Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>الطلبات</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => window.open(api.getExportUrl('complaints'), '_blank')}>
                <DownloadSimple className="ml-2" size={16} />
                تصدير CSV
              </Button>
              {isMukhtar && (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="ml-2" size={16} />
                  تسجيل طلب
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 mb-6">
            {/* General text search (all roles) */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <MagnifyingGlass className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  placeholder="بحث في الوصف أو رمز التتبع أو العنوان..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  className="pr-9"
                  dir="rtl"
                />
              </div>
              {/* Complaint number search */}
              <div className="relative min-w-48">
                <ClipboardText className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  placeholder="رقم الشكوى..."
                  value={complaintNumberSearch}
                  onChange={(e) => { setComplaintNumberSearch(e.target.value); setPage(1) }}
                  className="pr-9"
                  dir="rtl"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {/* Municipality filter (governor only) */}
              {isGovernor && municipalities.length > 0 && (
                <Select
                  value={municipalityFilter}
                  onValueChange={(v) => { setMunicipalityFilter(v); setDistrictFilter('all'); setPage(1) }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="البلدية" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل البلديات</SelectItem>
                    {municipalities.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* District filter (governor + mayor) */}
              {(isGovernor || isMayor) && districts.length > 0 && (
                <Select
                  value={districtFilter}
                  onValueChange={(v) => { setDistrictFilter(v); setPage(1) }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="الحي" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأحياء</SelectItem>
                    {districts
                      .filter((d) => municipalityFilter === 'all' || d.municipalityId === municipalityFilter)
                      .map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}

              {/* Sort (governor only) */}
              {isGovernor && (
                <>
                  <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(1) }}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="ترتيب حسب" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="created_at">تاريخ الإنشاء</SelectItem>
                      <SelectItem value="updated_at">آخر تحديث</SelectItem>
                      <SelectItem value="priority">الأولوية</SelectItem>
                      <SelectItem value="status">الحالة</SelectItem>
                      <SelectItem value="sla_deadline">الموعد النهائي</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sortDir} onValueChange={(v) => { setSortDir(v); setPage(1) }}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">تنازلي</SelectItem>
                      <SelectItem value="asc">تصاعدي</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>

            {hasActiveFilters && (
              <div>
                <Button variant="ghost" size="sm" onClick={clearAllFilters}>مسح الفلاتر</Button>
              </div>
            )}

            <details className="rounded-md border p-3">
              <summary className="cursor-pointer font-medium flex items-center gap-2">
                <CaretDown size={14} />
                فلاتر متقدمة
              </summary>
              <div className="space-y-4 mt-4">
                <div className="flex flex-wrap gap-2">
                  <span className="text-sm text-muted-foreground self-center ml-1">الحالة:</span>
                  {Object.entries(STATUSES).map(([key, label]) => (
                    <Badge key={key} variant={statusFilter.includes(key) ? 'default' : 'outline'} className="cursor-pointer select-none" onClick={() => toggleMultiFilter(key, statusFilter, setStatusFilter)}>{label}</Badge>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="text-sm text-muted-foreground self-center ml-1">الفئة:</span>
                  {Object.entries(CATEGORIES).map(([key, label]) => (
                    <Badge key={key} variant={categoryFilter.includes(key) ? 'default' : 'outline'} className="cursor-pointer select-none" onClick={() => toggleMultiFilter(key, categoryFilter, setCategoryFilter)}>{label}</Badge>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="text-sm text-muted-foreground self-center ml-1">الأولوية:</span>
                  {Object.entries(PRIORITIES).map(([key, label]) => (
                    <Badge key={key} variant={priorityFilter.includes(key) ? 'default' : 'outline'} className="cursor-pointer select-none" onClick={() => toggleMultiFilter(key, priorityFilter, setPriorityFilter)}>{label}</Badge>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="text-sm text-muted-foreground self-center ml-1">الفريق المسؤول:</span>
                  {Object.entries(RESPONSIBLE_TEAMS).map(([key, label]) => (
                    <Badge key={key} variant={responsibleTeamFilter.includes(key) ? 'default' : 'outline'} className="cursor-pointer select-none" onClick={() => toggleMultiFilter(key, responsibleTeamFilter, setResponsibleTeamFilter)}>{label}</Badge>
                  ))}
                </div>

                <div className="flex flex-wrap gap-4 items-center pt-1 border-t">
                  <div className="flex items-center gap-2"><Switch id="overdue" checked={overdueFilter} onCheckedChange={(v) => { setOverdueFilter(v); setPage(1) }} /><Label htmlFor="overdue" className="cursor-pointer">متأخّرة</Label></div>
                  <div className="flex items-center gap-2"><Switch id="archive_only" checked={archivedOnly} onCheckedChange={(v) => { setArchivedOnly(v); setPage(1) }} /><Label htmlFor="archive_only" className="cursor-pointer">الأرشيف فقط</Label></div>
                  {isGovernor && <div className="flex items-center gap-2"><Switch id="sla_breached" checked={slaBreachedFilter} onCheckedChange={(v) => { setSlaBreachedFilter(v); setPage(1) }} /><Label htmlFor="sla_breached" className="cursor-pointer">SLA منتهية</Label></div>}
                  <div className="flex items-center gap-2"><Label className="text-sm">من:</Label><Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} className="w-36 text-sm" /></div>
                  <div className="flex items-center gap-2"><Label className="text-sm">إلى:</Label><Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} className="w-36 text-sm" /></div>
                </div>
              </div>
            </details>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم الشكوى</TableHead>
                  <TableHead>رمز التتبع</TableHead>
                  <TableHead>الأولوية</TableHead>
                  <TableHead>الفئة</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الوصف</TableHead>
                  {(isGovernor || isMayor) && <TableHead>الحي</TableHead>}
                  <TableHead>الفريق المسؤول</TableHead>
                  <TableHead>التاريخ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={(isGovernor || isMayor) ? 9 : 8}
                      className="text-center text-muted-foreground py-8"
                    >
                      لا توجد طلبات
                    </TableCell>
                  </TableRow>
                ) : (
                  requests.map((request) => {
                    const districtName = districts.find((d) => d.id === request.districtId)?.name
                    return (
                      <TableRow
                        key={request.id}
                        className={`cursor-pointer hover:bg-muted/50 ${
                          request.priority === 'urgent'
                            ? 'bg-destructive/5 border-l-4 border-l-destructive'
                            : ''
                        }`}
                        onClick={() => { setSelectedRequest(request); setDialogOpen(true) }}
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {request.complaintNumber ?? '—'}
                        </TableCell>
                        <TableCell className="font-mono font-semibold">
                          {request.trackingCode}
                          {request.isArchived && (
                            <Badge variant="outline" className="mr-2 text-xs">
                              <ArchiveBox size={12} className="ml-1" />
                              مؤرشف
                            </Badge>
                          )}
                          {isOverdue(request) && (
                            <Badge variant="destructive" className="mr-2 text-xs">متأخر</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge className={PRIORITY_BADGE_COLORS[request.priority]}>
                              {PRIORITIES[request.priority]}
                            </Badge>
                            {request.isAutoEscalated && (
                              <Badge variant="outline" className="text-xs border-[oklch(0.70_0.15_65)] text-[oklch(0.70_0.15_65)]">
                                تلقائي
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{CATEGORIES[request.category]}</TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[request.status]}>
                            {STATUSES[request.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{request.description}</TableCell>
                        {(isGovernor || isMayor) && (
                          <TableCell className="text-sm text-muted-foreground">
                            {districtName || '—'}
                          </TableCell>
                        )}
                        <TableCell className="text-sm text-muted-foreground">
                          {request.responsibleTeam
                            ? RESPONSIBLE_TEAMS[request.responsibleTeam] ?? request.responsibleTeam
                            : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatRelativeTime(request.createdAt)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                السابق
              </Button>
              <span className="text-sm text-muted-foreground">
                صفحة {page} من {totalPages} ({total} طلب)
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                التالي
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <RequestDetailsDialog
        request={selectedRequest}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currentUser={user}
        districts={districts}
        onUpdate={fetchRequests}
      />

      {isMukhtar && user.districtId && (
        <CreateRequestDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          districtId={user.districtId}
          onCreated={fetchRequests}
        />
      )}
    </div>
  )
}

// ─── Mayors Management (Governor) ────────────────────────────────────────────

function MayorsView({ user }: { user: User }) {
  const [municipalities, setMunicipalities] = useState<{ id: string; name: string }[]>([])
  const [mayors, setMayors] = useState<User[]>([])
  const [showForm, setShowForm] = useState(false)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [municipalityId, setMunicipalityId] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState<{ username: string; password: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [editFullName, setEditFullName] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editMunicipalityId, setEditMunicipalityId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)

  const load = useCallback(async () => {
    try {
      const [munList, mayorList] = await Promise.all([api.getMunicipalities(), api.getMayors()])
      setMunicipalities(munList.map((m) => ({ id: m.id, name: m.name })))
      setMayors(mayorList.map(toUser))
    } catch {
      toast.error('تعذّر تحميل بيانات رؤساء البلديات')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!fullName.trim() || !username.trim() || !password.trim() || !municipalityId) {
      toast.error('يرجى ملء جميع الحقول')
      return
    }
    setSubmitting(true)
    try {
      const savedUsername = username.trim()
      const savedPassword = password
      await api.createMayor({ full_name: fullName.trim(), username: savedUsername, password: savedPassword, municipality_id: municipalityId })
      setCreatedCredentials({ username: savedUsername, password: savedPassword })
      await new Promise((r) => setTimeout(r, 150))
      await load()
      setFullName(''); setUsername(''); setPassword(''); setMunicipalityId(''); setShowForm(false)
      toast.success('تم إنشاء حساب رئيس البلدية')
    } catch (e: any) {
      toast.error(e.message || 'فشل إنشاء الحساب')
    } finally { setSubmitting(false) }
  }

  const toggleActive = async (mayor: User) => {
    try {
      const updated = await api.updateAdminUser(mayor.id, { is_active: !mayor.isActive })
      setMayors((prev) => prev.map((item) => item.id === mayor.id ? toUser(updated) : item))
      toast.success(!mayor.isActive ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب')
    } catch (e: any) { toast.error(e.message || 'فشل التحديث') }
  }

  const handleSaveEdit = async () => {
    if (!editing || !editFullName.trim() || !editUsername.trim() || !editMunicipalityId) return
    try {
      const updated = await api.updateAdminUser(editing.id, {
        full_name: editFullName.trim(),
        username: editUsername.trim(),
        municipality_id: editMunicipalityId,
      })
      setMayors((prev) => prev.map((item) => item.id === editing.id ? toUser(updated) : item))
      setEditing(null)
      toast.success('تم تحديث بيانات رئيس البلدية')
    } catch (e: any) {
      toast.error(e.message || 'فشل التحديث')
    }
  }

  const copyCredentials = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success('تم النسخ')).catch(() => toast.error('تعذّر النسخ'))

  const removeMayor = async () => {
    if (!deleteTarget) return
    try {
      await api.deleteAdminUser(deleteTarget.id)
      await load()
      setDeleteTarget(null)
      toast.success('تم حذف/تعطيل الحساب')
    } catch (e: any) {
      toast.error(e.message || 'تعذّر حذف الحساب')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">رؤساء البلديات</h2><Button onClick={() => setShowForm(true)}><Plus className="ml-2" size={16} />إنشاء حساب رئيس بلدية</Button></div>
      {createdCredentials && <Card className="border-green-500/40 bg-green-50 dark:bg-green-950/20"><CardContent className="pt-4"><p className="font-semibold text-green-700 dark:text-green-400 mb-2">تم إنشاء الحساب بنجاح – احفظ بيانات الدخول الآن</p><div className="space-y-2 text-sm"><div className="flex items-center gap-2"><span className="text-muted-foreground w-28">اسم المستخدم:</span><span className="font-mono font-bold">{createdCredentials.username}</span><Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => copyCredentials(createdCredentials.username)}>نسخ</Button></div><div className="flex items-center gap-2"><span className="text-muted-foreground w-28">كلمة المرور:</span><span className="font-mono font-bold">{createdCredentials.password}</span><Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => copyCredentials(createdCredentials.password)}>نسخ</Button></div></div></CardContent></Card>}
      {showForm && <Card className="border-primary/30"><CardHeader><CardTitle className="text-base">بيانات رئيس البلدية الجديد</CardTitle></CardHeader><CardContent className="space-y-3"><div className="space-y-1"><Label>الاسم الكامل</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} dir="rtl" /></div><div className="space-y-1"><Label>اسم المستخدم</Label><Input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" /></div><div className="space-y-1"><Label>كلمة المرور</Label><Input value={password} onChange={(e) => setPassword(e.target.value)} type="text" dir="ltr" /></div><div className="space-y-1"><Label>البلدية</Label><Select value={municipalityId} onValueChange={setMunicipalityId}><SelectTrigger dir="rtl"><SelectValue placeholder="اختر البلدية" /></SelectTrigger><SelectContent>{municipalities.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div><div className="flex gap-2"><Button onClick={handleCreate} disabled={submitting}>حفظ</Button><Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button></div></CardContent></Card>}
      <Card><CardContent className="pt-4">{mayors.length === 0 ? <EmptyState title="لا يوجد رؤساء بلديات بعد" description="أنشئ أول حساب رئيس بلدية لبدء إدارة الأحياء." actionLabel="إنشاء رئيس بلدية" onAction={() => setShowForm(true)} /> : <Table><TableHeader><TableRow><TableHead>الاسم الكامل</TableHead><TableHead>اسم المستخدم</TableHead><TableHead>الدور</TableHead><TableHead>البلدية</TableHead><TableHead>الحي</TableHead><TableHead>الحالة</TableHead><TableHead>تاريخ الإنشاء</TableHead><TableHead>إجراءات</TableHead></TableRow></TableHeader><TableBody>{mayors.map((m) => <TableRow key={m.id}><TableCell>{m.fullName}</TableCell><TableCell dir="ltr">{m.username}</TableCell><TableCell>رئيس بلدية</TableCell><TableCell>{municipalities.find((x) => x.id === m.municipalityId)?.name || '—'}</TableCell><TableCell>—</TableCell><TableCell><Badge variant={m.isActive ? 'default' : 'secondary'}>{m.isActive ? 'مفعّل' : 'معطّل'}</Badge></TableCell><TableCell>{m.createdAt ? new Date(m.createdAt).toLocaleDateString('ar-EG') : '—'}</TableCell><TableCell><div className="flex gap-2"><Switch checked={m.isActive} onCheckedChange={() => toggleActive(m)} /><Button size="sm" variant="outline" onClick={() => { setEditing(m); setEditFullName(m.fullName); setEditUsername(m.username); setEditMunicipalityId(m.municipalityId || '') }}>تعديل</Button><Button size="sm" variant="destructive" onClick={() => setDeleteTarget(m)}>حذف</Button></div></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
      {editing && <Dialog open={!!editing} onOpenChange={() => setEditing(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>تعديل رئيس البلدية</DialogTitle></DialogHeader><div className="space-y-2"><Input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} dir="rtl" /><Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} dir="ltr" /><Select value={editMunicipalityId} onValueChange={setEditMunicipalityId}><SelectTrigger><SelectValue placeholder="اختر البلدية" /></SelectTrigger><SelectContent>{municipalities.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div><DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button><Button onClick={handleSaveEdit}>حفظ</Button></DialogFooter></DialogContent></Dialog>}
      {deleteTarget && <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">سيتم حذف الحساب إن كان آمناً، أو تعطيله تلقائياً إذا كان مرتبطاً بسجل عمليات.</p><DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button><Button variant="destructive" onClick={removeMayor}>تأكيد</Button></DialogFooter></DialogContent></Dialog>}
    </div>
  )
}


// ─── Mukhtars Management (Mayor) ─────────────────────────────────────────────

function MukhtarsView({ user }: { user: User }) {
  const [districts, setDistricts] = useState<{ id: string; name: string }[]>([])
  const [municipalities, setMunicipalities] = useState<{ id: string; name: string }[]>([])
  const [mukhtars, setMukhtars] = useState<User[]>([])
  const [showForm, setShowForm] = useState(false)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [districtId, setDistrictId] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState<{ username: string; password: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [editFullName, setEditFullName] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editDistrictId, setEditDistrictId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)

  const load = useCallback(async () => {
    try {
      const [districtList, municipalityList, mukhtarList] = await Promise.all([
        api.getAdminDistricts(),
        api.getMunicipalities(),
        api.getMukhtars(),
      ])
      setDistricts(districtList.map((d) => ({ id: d.id, name: d.name })))
      setMunicipalities(municipalityList.map((m) => ({ id: m.id, name: m.name })))
      setMukhtars(mukhtarList.map(toUser))
    } catch {
      toast.error('تعذّر تحميل بيانات المختارين')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!fullName.trim() || !username.trim() || !password.trim() || !districtId) return toast.error('يرجى ملء جميع الحقول')
    setSubmitting(true)
    try {
      const savedUsername = username.trim(); const savedPassword = password
      await api.createMukhtar({ full_name: fullName.trim(), username: savedUsername, password: savedPassword, district_id: districtId })
      setCreatedCredentials({ username: savedUsername, password: savedPassword })
      await new Promise((r) => setTimeout(r, 150))
      await load()
      setFullName(''); setUsername(''); setPassword(''); setDistrictId(''); setShowForm(false)
      toast.success('تم إنشاء حساب المختار')
    } catch (e: any) { toast.error(e.message || 'فشل إنشاء الحساب') } finally { setSubmitting(false) }
  }

  const toggleActive = async (mukhtar: User) => {
    try {
      const updated = await api.updateAdminUser(mukhtar.id, { is_active: !mukhtar.isActive })
      setMukhtars((prev) => prev.map((item) => item.id === mukhtar.id ? toUser(updated) : item))
      toast.success(!mukhtar.isActive ? 'تم التفعيل' : 'تم التعطيل')
    }
    catch (e: any) { toast.error(e.message || 'فشل التحديث') }
  }

  const handleSaveEdit = async () => {
    if (!editing || !editFullName.trim() || !editUsername.trim() || !editDistrictId) return
    try {
      const updated = await api.updateAdminUser(editing.id, {
        full_name: editFullName.trim(),
        username: editUsername.trim(),
        district_id: editDistrictId,
      })
      setMukhtars((prev) => prev.map((item) => item.id === editing.id ? toUser(updated) : item))
      setEditing(null)
      toast.success('تم تحديث بيانات المختار')
    } catch (e: any) { toast.error(e.message || 'فشل التحديث') }
  }

  const removeMukhtar = async () => {
    if (!deleteTarget) return
    try {
      await api.deleteAdminUser(deleteTarget.id)
      await load()
      setDeleteTarget(null)
      toast.success('تم حذف/تعطيل الحساب')
    } catch (e: any) { toast.error(e.message || 'تعذّر حذف الحساب') }
  }

  const copyCredentials = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success('تم النسخ')).catch(() => toast.error('تعذّر النسخ'))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">مخاتير الأحياء</h2><Button onClick={() => setShowForm(true)} size="sm"><Plus className="ml-2" size={16} />إنشاء حساب مختار</Button></div>
      {createdCredentials && <Card className="border-green-500/40 bg-green-50 dark:bg-green-950/20"><CardContent className="pt-4"><p className="font-semibold text-green-700 dark:text-green-400 mb-2">تم إنشاء الحساب بنجاح – احفظ بيانات الدخول الآن</p><div className="space-y-2 text-sm"><div className="flex items-center gap-2"><span className="text-muted-foreground w-28">اسم المستخدم:</span><span className="font-mono font-bold">{createdCredentials.username}</span><Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => copyCredentials(createdCredentials.username)}>نسخ</Button></div><div className="flex items-center gap-2"><span className="text-muted-foreground w-28">كلمة المرور:</span><span className="font-mono font-bold">{createdCredentials.password}</span><Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => copyCredentials(createdCredentials.password)}>نسخ</Button></div></div></CardContent></Card>}
      {showForm && <Card className="border-primary/30"><CardHeader><CardTitle className="text-base">بيانات المختار الجديد</CardTitle></CardHeader><CardContent className="space-y-3"><div className="space-y-1"><Label>الاسم الكامل</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} dir="rtl" /></div><div className="space-y-1"><Label>اسم المستخدم</Label><Input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" /></div><div className="space-y-1"><Label>كلمة المرور</Label><Input value={password} onChange={(e) => setPassword(e.target.value)} type="text" dir="ltr" /></div><div className="space-y-1"><Label>الحي</Label><Select value={districtId} onValueChange={setDistrictId}><SelectTrigger dir="rtl"><SelectValue placeholder="اختر الحي" /></SelectTrigger><SelectContent>{districts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div><div className="flex gap-2"><Button onClick={handleCreate} disabled={submitting}>حفظ</Button><Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button></div></CardContent></Card>}
      <Card><CardContent className="pt-4">{mukhtars.length === 0 ? <EmptyState title="لا يوجد مخاتير بعد" description="أنشئ أول حساب مختار لتمكين إدارة الطلبات على مستوى الأحياء." actionLabel="إنشاء مختار" onAction={() => setShowForm(true)} /> : <Table><TableHeader><TableRow><TableHead>الاسم</TableHead><TableHead>اسم المستخدم</TableHead><TableHead>الدور</TableHead><TableHead>الحي</TableHead><TableHead>البلدية</TableHead><TableHead>الحالة</TableHead><TableHead>تاريخ الإنشاء</TableHead><TableHead>إجراءات</TableHead></TableRow></TableHeader><TableBody>{mukhtars.map((m) => <TableRow key={m.id}><TableCell>{m.fullName}</TableCell><TableCell dir="ltr">{m.username}</TableCell><TableCell>مختار</TableCell><TableCell>{districts.find((d) => d.id === m.districtId)?.name || '—'}</TableCell><TableCell>{municipalities.find((mu) => mu.id === m.municipalityId)?.name || '—'}</TableCell><TableCell><Badge variant={m.isActive ? 'default' : 'secondary'}>{m.isActive ? 'مفعّل' : 'معطّل'}</Badge></TableCell><TableCell>{m.createdAt ? new Date(m.createdAt).toLocaleDateString('ar-EG') : '—'}</TableCell><TableCell><div className="flex gap-2"><Switch checked={m.isActive} onCheckedChange={() => toggleActive(m)} /><Button size="sm" variant="outline" onClick={() => { setEditing(m); setEditFullName(m.fullName); setEditUsername(m.username); setEditDistrictId(m.districtId || '') }}>تعديل</Button><Button size="sm" variant="destructive" onClick={() => setDeleteTarget(m)}>حذف</Button></div></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
      {editing && <Dialog open={!!editing} onOpenChange={() => setEditing(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>تعديل المختار</DialogTitle></DialogHeader><div className="space-y-2"><Input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} dir="rtl" /><Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} dir="ltr" /><Select value={editDistrictId} onValueChange={setEditDistrictId}><SelectTrigger><SelectValue placeholder="اختر الحي" /></SelectTrigger><SelectContent>{districts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div><DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button><Button onClick={handleSaveEdit}>حفظ</Button></DialogFooter></DialogContent></Dialog>}
      {deleteTarget && <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">سيتم حذف الحساب إن كان آمناً، أو تعطيله تلقائياً إذا كان مرتبطاً بسجل عمليات.</p><DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button><Button variant="destructive" onClick={removeMukhtar}>تأكيد</Button></DialogFooter></DialogContent></Dialog>}
    </div>
  )
}


function TeamsView({ user }: { user: User }) {
  const [teams, setTeams] = useState<MunicipalTeam[]>([])
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [municipalityName, setMunicipalityName] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [leaderName, setLeaderName] = useState('')
  const [leaderPhone, setLeaderPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [editing, setEditing] = useState<MunicipalTeam | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MunicipalTeam | null>(null)

  const load = useCallback(async () => {
    try {
      const [teamsList, reqList] = await Promise.all([api.getTeams(), api.getRequests({ page: 1, page_size: 500 })])
      setTeams(teamsList.map(toMunicipalTeam))
      setRequests(reqList.items.map(toServiceRequest))
      if (user.municipalityId) {
        const municipalities = await api.getMunicipalities()
        const found = municipalities.find((m) => m.id === user.municipalityId)
        setMunicipalityName(found?.name || '—')
      }
    } catch {
      toast.error('تعذّر تحميل الفرق')
    }
  }, [])
  useEffect(() => { load() }, [load])

  const createTeam = async () => {
    if (!teamName.trim() || !leaderName.trim() || !leaderPhone.trim()) return toast.error('أكمل الحقول المطلوبة')
    try {
      const created = await api.createTeam({ team_name: teamName.trim(), leader_name: leaderName.trim(), leader_phone: leaderPhone.trim(), notes: notes.trim() || undefined })
      setTeams((prev) => [toMunicipalTeam(created), ...prev])
      setTeamName(''); setLeaderName(''); setLeaderPhone(''); setNotes(''); setShowForm(false)
      toast.success('تم إنشاء الفريق')
    } catch (e: any) { toast.error(e.message || 'فشل الإنشاء') }
  }

  const toggleActive = async (team: MunicipalTeam) => {
    try {
      const updated = await api.updateTeam(team.id, { is_active: !team.isActive })
      setTeams((prev) => prev.map((item) => item.id === team.id ? toMunicipalTeam(updated) : item))
      toast.success(!team.isActive ? 'تم التفعيل' : 'تم التعطيل')
    }
    catch (e: any) { toast.error(e.message || 'فشل التحديث') }
  }
  const deleteTeam = async () => {
    if (!deleteTarget) return
    try {
      await api.deleteTeam(deleteTarget.id)
      setTeams((prev) => prev.filter((item) => item.id !== deleteTarget.id))
      setDeleteTarget(null)
      toast.success('تم حذف الفريق')
    } catch (e: any) { toast.error(e.message || 'تعذّر حذف الفريق') }
  }

  const updateTeamDetails = async () => {
    if (!editing || !teamName.trim() || !leaderName.trim() || !leaderPhone.trim()) return
    try {
      const updated = await api.updateTeam(editing.id, { team_name: teamName.trim(), leader_name: leaderName.trim(), leader_phone: leaderPhone.trim(), notes: notes.trim() || undefined })
      setTeams((prev) => prev.map((item) => item.id === editing.id ? toMunicipalTeam(updated) : item))
      setEditing(null)
      setTeamName(''); setLeaderName(''); setLeaderPhone(''); setNotes('')
      toast.success('تم تعديل الفريق')
    } catch (e: any) { toast.error(e.message || 'فشل تعديل الفريق') }
  }

  return <div className="space-y-4">
    <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">فرق البلدية</h2><Button onClick={() => setShowForm(true)} size="sm"><Plus className="ml-2" size={16} />إضافة فريق</Button></div>
    {(showForm || editing) && <Card><CardContent className="pt-4 space-y-2"><Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="اسم الفريق" dir="rtl" /><Input value={leaderName} onChange={(e) => setLeaderName(e.target.value)} placeholder="اسم القائد" dir="rtl" /><Input value={leaderPhone} onChange={(e) => setLeaderPhone(e.target.value)} placeholder="رقم هاتف القائد" dir="ltr" /><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات" dir="rtl" /><div className="flex gap-2"><Button onClick={editing ? updateTeamDetails : createTeam}>حفظ</Button><Button variant="outline" onClick={() => { setShowForm(false); setEditing(null); setTeamName(''); setLeaderName(''); setLeaderPhone(''); setNotes('') }}>إلغاء</Button></div></CardContent></Card>}
    <Card><CardContent className="pt-4">{teams.length === 0 ? <EmptyState title="لا توجد فرق عمل بعد" description="أنشئ أول فريق ميداني لتوزيع الشكاوى ومتابعة التنفيذ." actionLabel="إنشاء أول فريق" onAction={() => setShowForm(true)} /> : <Table><TableHeader><TableRow><TableHead>الفريق</TableHead><TableHead>القائد</TableHead><TableHead>الهاتف</TableHead><TableHead>البلدية</TableHead><TableHead>الحالة</TableHead><TableHead>الشكاوى المعيّنة</TableHead><TableHead>إجراءات</TableHead></TableRow></TableHeader><TableBody>{teams.map((t) => <TableRow key={t.id}><TableCell>{t.teamName}</TableCell><TableCell>{t.leaderName}</TableCell><TableCell dir="ltr">{t.leaderPhone}</TableCell><TableCell>{municipalityName || '—'}</TableCell><TableCell><Badge variant={t.isActive ? 'default' : 'secondary'}>{t.isActive ? 'مفعّل' : 'معطّل'}</Badge></TableCell><TableCell>{requests.filter((r) => r.responsibleTeamId === t.id).length}</TableCell><TableCell><div className="flex gap-2"><Switch checked={t.isActive} onCheckedChange={() => toggleActive(t)} /><Button size="sm" variant="outline" onClick={() => { setEditing(t); setShowForm(false); setTeamName(t.teamName); setLeaderName(t.leaderName); setLeaderPhone(t.leaderPhone); setNotes(t.notes || '') }}>تعديل</Button><Button variant="destructive" size="sm" onClick={() => setDeleteTarget(t)}>حذف</Button></div></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
    {deleteTarget && <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>تأكيد حذف الفريق</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">سيتم حذف الفريق إذا لم يكن مرتبطاً بأي شكوى. خلاف ذلك استخدم التعطيل.</p><DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button><Button variant="destructive" onClick={deleteTeam}>تأكيد الحذف</Button></DialogFooter></DialogContent></Dialog>}
  </div>
}


// ─── Monthly Reports ──────────────────────────────────────────────────────────

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

const SIGNAL_STYLES: Record<string, string> = {
  good: 'bg-green-100 text-green-800 border-green-300',
  moderate: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  poor: 'bg-red-100 text-red-800 border-red-300',
}

function PerformanceView({ user }: { user: User }) {
  const isGovernor = user.role === 'governor'
  const isMayor = user.role === 'mayor' || user.role === 'municipal_admin'
  const [governorData, setGovernorData] = useState<GovernorPerformanceDashboardResponse | null>(null)
  const [mayorData, setMayorData] = useState<MayorPerformanceDashboardResponse | null>(null)
  const [districts, setDistricts] = useState<DistrictOut[]>([])
  const [sortBy, setSortBy] = useState<'open_complaints' | 'overdue_complaints' | 'slowest_resolution_time' | 'best_resolution_rate' | 'municipality_name'>('open_complaints')
  const [districtFilter, setDistrictFilter] = useState<string>('all')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isGovernor || isMayor) {
      api.getAdminDistricts().then(setDistricts).catch(() => {})
    }
  }, [isGovernor, isMayor])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (isGovernor) {
        const data = await api.getGovernorPerformance({
          sort_by: sortBy,
          district_id: districtFilter === 'all' ? undefined : districtFilter,
        })
        setGovernorData(data)
      }
      if (isMayor) {
        const data = await api.getMayorPerformance({
          district_id: districtFilter === 'all' ? undefined : districtFilter,
        })
        setMayorData(data)
      }
    } catch (e: any) {
      toast.error(e.message || 'تعذّر تحميل مؤشرات الأداء')
    } finally {
      setLoading(false)
    }
  }, [isGovernor, isMayor, sortBy, districtFilter])

  useEffect(() => { load() }, [load])

  if (!isGovernor && !isMayor) {
    return <Alert><AlertDescription>لوحة الأداء متاحة للمحافظ ورئيس البلدية فقط.</AlertDescription></Alert>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        {isGovernor && (
          <div>
            <Label className="text-sm text-muted-foreground">الترتيب</Label>
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open_complaints">أعلى الشكاوى المفتوحة</SelectItem>
                <SelectItem value="overdue_complaints">أعلى الشكاوى المتأخرة</SelectItem>
                <SelectItem value="slowest_resolution_time">أبطأ وقت حل</SelectItem>
                <SelectItem value="best_resolution_rate">أفضل معدل إنجاز</SelectItem>
                <SelectItem value="municipality_name">اسم البلدية</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {(isGovernor || isMayor) && (
          <div>
            <Label className="text-sm text-muted-foreground">تصفية حسب الحي</Label>
            <Select value={districtFilter} onValueChange={setDistrictFilter}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأحياء</SelectItem>
                {districts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button onClick={load} disabled={loading}>{loading ? 'جارٍ التحديث...' : 'تحديث'}</Button>
      </div>

      {isGovernor && governorData && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Card><CardHeader><CardDescription>أفضل بلدية</CardDescription><CardTitle className="text-base">{governorData.highlights.best_performing_municipality || '—'}</CardTitle></CardHeader></Card>
            <Card><CardHeader><CardDescription>أضعف بلدية</CardDescription><CardTitle className="text-base">{governorData.highlights.worst_performing_municipality || '—'}</CardTitle></CardHeader></Card>
            <Card><CardHeader><CardDescription>أعلى تراكم</CardDescription><CardTitle className="text-base">{governorData.highlights.highest_backlog_municipality || '—'}</CardTitle></CardHeader></Card>
            <Card><CardHeader><CardDescription>أسرع إغلاق</CardDescription><CardTitle className="text-base">{governorData.highlights.fastest_closure_municipality || '—'}</CardTitle></CardHeader></Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">ترتيب أداء البلديات</CardTitle></CardHeader>
            <CardContent>
              {governorData.municipalities.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد بيانات أداء حالياً.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>البلدية</TableHead><TableHead>الإجمالي</TableHead><TableHead>مفتوحة</TableHead><TableHead>قيد المعالجة</TableHead><TableHead>منجزة</TableHead><TableHead>متأخرة</TableHead><TableHead>معدل الإنجاز</TableHead><TableHead>متوسط الحل (ساعة)</TableHead><TableHead>الإشارات</TableHead></TableRow></TableHeader>
                  <TableBody>{governorData.municipalities.map((m) => (
                    <TableRow key={m.municipality_id}>
                      <TableCell>{m.municipality_name}</TableCell><TableCell>{m.total_complaints}</TableCell><TableCell>{m.open_complaints}</TableCell><TableCell>{m.in_progress_complaints}</TableCell><TableCell>{m.resolved_complaints}</TableCell><TableCell>{m.overdue_complaints}</TableCell><TableCell>{m.resolution_rate}%</TableCell><TableCell>{m.average_resolution_time_hours ?? '—'}</TableCell>
                      <TableCell className="space-x-1 space-x-reverse">
                        <Badge className={SIGNAL_STYLES[m.closure_signal]}>إنجاز</Badge>
                        <Badge className={SIGNAL_STYLES[m.overdue_signal]}>تأخير</Badge>
                        <Badge className={SIGNAL_STYLES[m.speed_signal]}>سرعة</Badge>
                      </TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {isMayor && mayorData && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <Card><CardHeader><CardDescription>أفضل حي</CardDescription><CardTitle className="text-base">{mayorData.highlights.best_performing_district || '—'}</CardTitle></CardHeader></Card>
            <Card><CardHeader><CardDescription>أعلى تراكم</CardDescription><CardTitle className="text-base">{mayorData.highlights.highest_backlog_district || '—'}</CardTitle></CardHeader></Card>
            <Card><CardHeader><CardDescription>الأكثر نشاطاً</CardDescription><CardTitle className="text-base">{mayorData.highlights.most_active_mukhtar || '—'}</CardTitle></CardHeader></Card>
            <Card><CardHeader><CardDescription>الأقل استجابة</CardDescription><CardTitle className="text-base">{mayorData.highlights.least_responsive_district || '—'}</CardTitle></CardHeader></Card>
            <Card><CardHeader><CardDescription>أكثر فريق إنتاجاً</CardDescription><CardTitle className="text-base">{mayorData.highlights.most_productive_team || '—'}</CardTitle></CardHeader></Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">أداء الأحياء والمخاتير</CardTitle></CardHeader>
            <CardContent>
              {mayorData.districts.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد بيانات حالياً.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>الحي</TableHead><TableHead>المختار</TableHead><TableHead>الإجمالي</TableHead><TableHead>مفتوحة</TableHead><TableHead>منجزة</TableHead><TableHead>متأخرة</TableHead><TableHead>متوسط الحل</TableHead><TableHead>إشارات</TableHead></TableRow></TableHeader>
                  <TableBody>{mayorData.districts.map((d) => (
                    <TableRow key={d.district_id}><TableCell>{d.district_name}</TableCell><TableCell>{d.mukhtar_name || '—'}</TableCell><TableCell>{d.total_complaints}</TableCell><TableCell>{d.open_complaints}</TableCell><TableCell>{d.resolved_complaints}</TableCell><TableCell>{d.overdue_complaints}</TableCell><TableCell>{d.average_resolution_time_hours ?? '—'}</TableCell><TableCell className="space-x-1 space-x-reverse"><Badge className={SIGNAL_STYLES[d.closure_signal]}>إنجاز</Badge><Badge className={SIGNAL_STYLES[d.overdue_signal]}>تأخير</Badge><Badge className={SIGNAL_STYLES[d.speed_signal]}>سرعة</Badge></TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">أداء الفرق</CardTitle></CardHeader>
            <CardContent>
              {mayorData.teams.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد فرق أو لا توجد بيانات تعيين.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>الفريق</TableHead><TableHead>القائد</TableHead><TableHead>الحالة</TableHead><TableHead>معيّنة</TableHead><TableHead>منجزة</TableHead><TableHead>متأخرة</TableHead><TableHead>متوسط الإغلاق</TableHead></TableRow></TableHeader>
                  <TableBody>{mayorData.teams.map((t) => (
                    <TableRow key={t.team_id}><TableCell>{t.team_name}</TableCell><TableCell>{t.leader_name}</TableCell><TableCell><Badge variant={t.is_active ? 'default' : 'secondary'}>{t.is_active ? 'نشط' : 'غير نشط'}</Badge></TableCell><TableCell>{t.assigned_complaints}</TableCell><TableCell>{t.resolved_count}</TableCell><TableCell>{t.overdue_count}</TableCell><TableCell>{t.average_closure_time_hours ?? '—'}</TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function MonthlyReportsView({ user }: { user: User }) {
  const isGovernor = user.role === 'governor'
  const isMayor = user.role === 'mayor' || user.role === 'municipal_admin'
  const isMukhtar = user.role === 'mukhtar' || user.role === 'district_admin'

  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [reportType, setReportType] = useState<'district' | 'municipality' | 'governorate'>(
    isGovernor ? 'governorate' : isMayor ? 'municipality' : 'district',
  )
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('')
  const [selectedDistrict, setSelectedDistrict] = useState<string>('')
  const [municipalities, setMunicipalities] = useState<MunicipalityOut[]>([])
  const [districts, setDistricts] = useState<DistrictOut[]>([])
  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [accountabilityReport, setAccountabilityReport] = useState<AccountabilityReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPrint, setShowPrint] = useState(false)

  useEffect(() => {
    if (isGovernor) {
      api.getMunicipalities().then(setMunicipalities).catch(() => {})
      api.getAdminDistricts().then(setDistricts).catch(() => {})
    } else if (isMayor) {
      api.getAdminDistricts().then(setDistricts).catch(() => {})
    }
  }, [isGovernor, isMayor])

  const filteredDistricts = isGovernor && selectedMunicipality
    ? districts.filter((d) => d.municipality_id === selectedMunicipality)
    : districts

  const fetchReport = async () => {
    setLoading(true)
    setError(null)
    try {
      let data: MonthlyReport
      if (reportType === 'governorate') {
        data = await api.getGovernorateMonthlyReport({ month, year })
      } else if (reportType === 'municipality') {
        data = await api.getMunicipalityMonthlyReport({
          month,
          year,
          municipality_id: isGovernor ? selectedMunicipality || undefined : undefined,
        })
      } else {
        data = await api.getDistrictMonthlyReport({
          month,
          year,
          district_id: (isGovernor || isMayor) ? selectedDistrict || undefined : undefined,
        })
      }
      setReport(data)
      const accountability = await api.getAccountabilityReport({
        month,
        year,
        municipality_id: isGovernor ? selectedMunicipality || undefined : undefined,
        district_id: (isGovernor || isMayor) ? selectedDistrict || undefined : undefined,
      })
      setAccountabilityReport(accountability)
    } catch (e: any) {
      setError(e.message || 'تعذّر تحميل التقرير')
    } finally {
      setLoading(false)
    }
  }

  const yearOptions: number[] = []
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) {
    yearOptions.push(y)
  }

  const printEntityName = (() => {
    if (reportType === 'district' && selectedDistrict) {
      return districts.find((d) => d.id === selectedDistrict)?.name
    }
    if (reportType === 'municipality' && selectedMunicipality) {
      return municipalities.find((m) => m.id === selectedMunicipality)?.name
    }
    return undefined
  })()

  return (
    <>
      {showPrint && report && (
        <PrintReport
          report={report}
          reportType={reportType}
          entityName={printEntityName}
          onClose={() => setShowPrint(false)}
        />
      )}
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">التقارير الشهرية</h2>

      {/* Selectors */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Month */}
            <div className="flex flex-col gap-1">
              <Label className="text-sm text-muted-foreground">الشهر</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ARABIC_MONTHS.map((name, idx) => (
                    <SelectItem key={idx + 1} value={String(idx + 1)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Year */}
            <div className="flex flex-col gap-1">
              <Label className="text-sm text-muted-foreground">السنة</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Report type (governor/mayor can choose) */}
            {(isGovernor || isMayor) && (
              <div className="flex flex-col gap-1">
                <Label className="text-sm text-muted-foreground">نوع التقرير</Label>
                <Select value={reportType} onValueChange={(v) => setReportType(v as any)}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {isGovernor && <SelectItem value="governorate">المحافظة</SelectItem>}
                    {(isGovernor || isMayor) && <SelectItem value="municipality">البلدية</SelectItem>}
                    <SelectItem value="district">الحي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Municipality selector (governor only, for municipality/district reports) */}
            {isGovernor && (reportType === 'municipality' || reportType === 'district') && (
              <div className="flex flex-col gap-1">
                <Label className="text-sm text-muted-foreground">البلدية</Label>
                <Select value={selectedMunicipality} onValueChange={(v) => { setSelectedMunicipality(v); setSelectedDistrict('') }}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="اختر البلدية" />
                  </SelectTrigger>
                  <SelectContent>
                    {municipalities.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* District selector (governor/mayor for district reports) */}
            {(isGovernor || isMayor) && reportType === 'district' && (
              <div className="flex flex-col gap-1">
                <Label className="text-sm text-muted-foreground">الحي</Label>
                <Select value={selectedDistrict} onValueChange={setSelectedDistrict}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="اختر الحي" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredDistricts.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button onClick={fetchReport} disabled={loading} className="self-end">
              {loading ? 'جارٍ التحميل...' : 'عرض التقرير'}
            </Button>
            {report && (
              <Button
                variant="outline"
                onClick={() => setShowPrint(true)}
                className="self-end gap-1"
              >
                <Printer size={16} />
                طباعة التقرير
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => window.open(api.getExportUrl('monthly-report', { month, year }), '_blank')}
              className="self-end gap-1"
            >
              <DownloadSimple size={16} />
              تصدير CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {report && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            التقرير الشهري — {ARABIC_MONTHS[report.period.month - 1]} {report.period.year}
          </p>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>إجمالي الشكاوى</CardDescription>
                <CardTitle className="text-3xl">{report.total}</CardTitle>
              </CardHeader>
              <CardContent><ChartBar size={22} className="text-muted-foreground" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>مفتوحة</CardDescription>
                <CardTitle className="text-3xl text-[oklch(0.55_0.10_250)]">{report.open}</CardTitle>
              </CardHeader>
              <CardContent><Buildings size={22} className="text-muted-foreground" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>قيد المعالجة</CardDescription>
                <CardTitle className="text-3xl text-[oklch(0.65_0.13_65)]">{report.in_progress}</CardTitle>
              </CardHeader>
              <CardContent><Timer size={22} className="text-muted-foreground" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>منجزة</CardDescription>
                <CardTitle className="text-3xl text-[oklch(0.60_0.15_145)]">{report.resolved}</CardTitle>
              </CardHeader>
              <CardContent><CheckCircle size={22} className="text-muted-foreground" /></CardContent>
            </Card>
            <Card className="border-destructive/50">
              <CardHeader className="pb-2">
                <CardDescription>عاجلة</CardDescription>
                <CardTitle className="text-3xl text-destructive">{report.urgent}</CardTitle>
              </CardHeader>
              <CardContent><Warning size={22} className="text-destructive" /></CardContent>
            </Card>
            <Card className="border-orange-400/50">
              <CardHeader className="pb-2">
                <CardDescription>متأخّرة</CardDescription>
                <CardTitle className="text-3xl text-orange-600">{report.overdue}</CardTitle>
              </CardHeader>
              <CardContent><Timer size={22} className="text-orange-500" /></CardContent>
            </Card>
          </div>

          {/* Highlights row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {report.most_common_category && (
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>أكثر الفئات تكراراً</CardDescription>
                  <CardTitle className="text-lg">
                    {CATEGORIES[report.most_common_category as keyof typeof CATEGORIES] ?? report.most_common_category}
                  </CardTitle>
                </CardHeader>
              </Card>
            )}
            {report.most_assigned_team && (
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>أكثر الفرق نشاطاً</CardDescription>
                  <CardTitle className="text-lg">
                    {RESPONSIBLE_TEAMS[report.most_assigned_team] ?? report.most_assigned_team}
                  </CardTitle>
                </CardHeader>
              </Card>
            )}
            {report.top_district && (
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>أكثر الأحياء شكاوى</CardDescription>
                  <CardTitle className="text-lg">{report.top_district}</CardTitle>
                </CardHeader>
              </Card>
            )}
          </div>

          {/* Grouped stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* By category */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">توزيع الشكاوى حسب الفئة</CardTitle>
              </CardHeader>
              <CardContent>
                {report.by_category.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا بيانات</p>
                ) : (
                  <div className="space-y-2">
                    {report.by_category.map((entry) => (
                      <div key={entry.name} className="flex items-center justify-between">
                        <span className="text-sm">
                          {CATEGORIES[entry.name as keyof typeof CATEGORIES] ?? entry.name}
                        </span>
                        <Badge variant="outline">{entry.count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* By status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">توزيع الشكاوى حسب الحالة</CardTitle>
              </CardHeader>
              <CardContent>
                {report.by_status.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا بيانات</p>
                ) : (
                  <div className="space-y-2">
                    {report.by_status.map((entry) => (
                      <div key={entry.name} className="flex items-center justify-between">
                        <Badge className={STATUS_COLORS[entry.name as keyof typeof STATUS_COLORS] ?? ''}>
                          {STATUSES[entry.name as keyof typeof STATUSES] ?? entry.name}
                        </Badge>
                        <span className="text-sm font-medium">{entry.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {accountabilityReport && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">تقرير المساءلة الشهري</CardTitle>
            <CardDescription>مؤشرات الإشراف واتخاذ القرار للفترة المحددة.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div><p className="text-xs text-muted-foreground">مفتوحة خلال الفترة</p><p className="text-xl font-semibold">{accountabilityReport.complaints_opened_during_period}</p></div>
              <div><p className="text-xs text-muted-foreground">مغلقة خلال الفترة</p><p className="text-xl font-semibold">{accountabilityReport.complaints_closed_during_period}</p></div>
              <div><p className="text-xs text-muted-foreground">متبقية من فترات سابقة</p><p className="text-xl font-semibold">{accountabilityReport.complaints_still_open_from_previous_periods}</p></div>
              <div><p className="text-xs text-muted-foreground">متأخرة</p><p className="text-xl font-semibold">{accountabilityReport.overdue_complaints}</p></div>
              <div><p className="text-xs text-muted-foreground">معدل الإغلاق</p><p className="text-xl font-semibold">{accountabilityReport.closure_rate}%</p></div>
              <div><p className="text-xs text-muted-foreground">متوسط زمن الحل</p><p className="text-xl font-semibold">{accountabilityReport.average_time_to_resolution_hours ?? '—'} ساعة</p></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium mb-2">أعلى الفئات</p>
                {accountabilityReport.top_categories.length === 0 ? <p className="text-sm text-muted-foreground">لا بيانات</p> : accountabilityReport.top_categories.map((r) => <div key={r.name} className="flex justify-between text-sm"><span>{CATEGORIES[r.name as keyof typeof CATEGORIES] ?? r.name}</span><span>{r.count}</span></div>)}
              </div>
              <div>
                <p className="text-sm font-medium mb-2">أعلى الفرق</p>
                {accountabilityReport.top_teams.length === 0 ? <p className="text-sm text-muted-foreground">لا بيانات</p> : accountabilityReport.top_teams.map((r) => <div key={r.name} className="flex justify-between text-sm"><span>{r.name}</span><span>{r.count}</span></div>)}
              </div>
              <div>
                <p className="text-sm font-medium mb-2">أعلى الجهات المتأخرة</p>
                {accountabilityReport.top_delayed_entities.length === 0 ? <p className="text-sm text-muted-foreground">لا بيانات</p> : accountabilityReport.top_delayed_entities.map((r) => <div key={r.name} className="flex justify-between text-sm"><span>{r.name}</span><span>{r.count}</span></div>)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    </>
  )
}


// ─── Main AdminDashboard ──────────────────────────────────────────────────────

function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationOut[]>([])
  const [unreadOnly, setUnreadOnly] = useState(false)

  const load = useCallback(async () => {
    try {
      await api.generatePerformanceAlerts()
      const list = await api.getNotifications({ unread_only: unreadOnly, limit: 100 })
      setItems(list)
    } catch {
      // no-op
    }
  }, [unreadOnly])

  useEffect(() => { if (open) load() }, [open, load])
  useEffect(() => { load() }, [load])

  const unreadCount = items.filter((n) => !n.is_read).length

  const markRead = async (id: string) => {
    await api.markNotificationRead(id)
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n))
  }

  const markAll = async () => {
    await api.markAllNotificationsRead()
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="relative">
        <Bell size={16} className="ml-2" />
        التنبيهات
        {unreadCount > 0 && <span className="absolute -top-2 -left-2 rounded-full bg-destructive text-white text-[10px] px-1.5 py-0.5">{unreadCount}</span>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>مركز التنبيهات</DialogTitle></DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Switch id="unread_only" checked={unreadOnly} onCheckedChange={setUnreadOnly} />
              <Label htmlFor="unread_only">غير المقروء فقط</Label>
            </div>
            <Button variant="ghost" size="sm" onClick={markAll}>تعيين الكل كمقروء</Button>
          </div>
          <div className="max-h-[55vh] overflow-auto space-y-2">
            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground border rounded-md p-6 text-center">لا توجد تنبيهات حالياً</div>
            ) : items.map((n) => (
              <div key={n.id} className={`border rounded-md p-3 ${n.is_read ? 'opacity-70' : 'bg-muted/30'}`}>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-semibold text-sm">{n.title}</p>
                    <p className="text-sm">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString('ar-EG')}</p>
                  </div>
                  {!n.is_read && <Button size="sm" variant="outline" onClick={() => markRead(n.id)}>تمت القراءة</Button>}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function AdminDashboard({ user, onLogout }: AdminDashboardProps) {
  const isGovernor = user.role === 'governor'
  const isMayor = user.role === 'mayor'

  const [activeTab, setActiveTab] = useState<'requests' | 'performance' | 'municipalities' | 'mayors' | 'districts' | 'mukhtars' | 'teams' | 'reports'>('requests')

  const tabs: { key: typeof activeTab; label: string; show: boolean }[] = [
    { key: 'requests', label: 'الطلبات', show: true },
    { key: 'performance', label: 'لوحة الأداء', show: isGovernor || isMayor },
    { key: 'municipalities', label: 'البلديات', show: isGovernor },
    { key: 'mayors', label: 'رؤساء البلديات', show: isGovernor },
    { key: 'districts', label: 'الأحياء', show: isMayor },
    { key: 'mukhtars', label: 'مخاتير الأحياء', show: isMayor },
    { key: 'teams', label: 'فرق البلدية', show: isMayor },
    { key: 'reports', label: 'التقارير الشهرية', show: true },
  ]

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">الإدارة</h1>
              <p className="text-sm text-muted-foreground">{user.fullName}</p>
            </div>
            <div className="flex items-center gap-2">
              <NotificationCenter />
              <Button variant="outline" onClick={onLogout}>
                <SignOut className="ml-2" />
                تسجيل الخروج
              </Button>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="container mx-auto px-4 border-t">
          <nav className="flex gap-1 pt-1">
            {tabs.filter((t) => t.show).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {activeTab === 'requests' && <RequestsView user={user} />}
        {activeTab === 'performance' && <PerformanceView user={user} />}
        {activeTab === 'municipalities' && isGovernor && <MunicipalitiesView user={user} />}
        {activeTab === 'mayors' && isGovernor && <MayorsView user={user} />}
        {activeTab === 'districts' && isMayor && <DistrictsView user={user} />}
        {activeTab === 'mukhtars' && isMayor && <MukhtarsView user={user} />}
        {activeTab === 'teams' && isMayor && <TeamsView user={user} />}
        {activeTab === 'reports' && <MonthlyReportsView user={user} />}
      </main>
    </div>
  )
}
