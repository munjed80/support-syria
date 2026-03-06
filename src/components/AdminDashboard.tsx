import { useState, useMemo, useEffect, useCallback } from 'react'
import { api, toServiceRequest, toDistrict, toMunicipality, MunicipalityOut, DistrictOut } from '@/lib/api'
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
import { SignOut, ChartBar, Buildings, Warning, ClipboardText, Plus, MagnifyingGlass, MapPin } from '@phosphor-icons/react'
import { CATEGORIES, STATUSES, STATUS_COLORS, PRIORITIES, PRIORITY_BADGE_COLORS, PRIORITY_ORDER, formatRelativeTime, isOverdue } from '@/lib/constants'
import { RequestDetailsDialog } from '@/components/RequestDetailsDialog'
import type { ServiceRequest, User, District, Municipality } from '@/lib/types'
import { toast } from 'sonner'

interface AdminDashboardProps {
  user: User
  onLogout: () => void
}

// ─── Municipality Management (Governor) ──────────────────────────────────────

function MunicipalitiesView({ user }: { user: User }) {
  const [municipalities, setMunicipalities] = useState<Municipality[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.getMunicipalities()
      .then((list) => setMunicipalities(list.map(toMunicipality)))
      .catch(() => toast.error('تعذّر تحميل البلديات'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!newName.trim()) return
    setSubmitting(true)
    try {
      await api.createMunicipality(newName.trim())
      setNewName('')
      setShowAdd(false)
      load()
      toast.success('تمت إضافة البلدية')
    } catch (e: any) {
      toast.error(e.message || 'فشل إضافة البلدية')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (mun: Municipality) => {
    try {
      await api.updateMunicipality(mun.id, { is_active: !mun.isActive })
      load()
      toast.success(mun.isActive ? 'تم تعطيل البلدية' : 'تم تفعيل البلدية')
    } catch (e: any) {
      toast.error(e.message || 'فشل التحديث')
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
            <p className="text-center text-muted-foreground py-8">لا توجد بلديات</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>اسم البلدية</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {municipalities.map((mun) => (
                  <TableRow key={mun.id}>
                    <TableCell className="font-medium">{mun.name}</TableCell>
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── District Management (Mayor) ─────────────────────────────────────────────

function DistrictsView({ user }: { user: User }) {
  const [districts, setDistricts] = useState<District[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.getAdminDistricts()
      .then((list) => setDistricts(list.map(toDistrict)))
      .catch(() => toast.error('تعذّر تحميل الأحياء'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!newName.trim()) return
    setSubmitting(true)
    try {
      await api.createDistrict(newName.trim())
      setNewName('')
      setShowAdd(false)
      load()
      toast.success('تمت إضافة الحي')
    } catch (e: any) {
      toast.error(e.message || 'فشل إضافة الحي')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (district: District) => {
    try {
      await api.updateDistrict(district.id, { is_active: !district.isActive })
      load()
      toast.success(district.isActive ? 'تم تعطيل الحي' : 'تم تفعيل الحي')
    } catch (e: any) {
      toast.error(e.message || 'فشل التحديث')
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
            <p className="text-center text-muted-foreground py-8">لا توجد أحياء</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>اسم الحي</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {districts.map((district) => (
                  <TableRow key={district.id}>
                    <TableCell className="font-medium">{district.name}</TableCell>
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
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

  // Filters
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [priorityFilter, setPriorityFilter] = useState<string[]>([])
  const [districtFilter, setDistrictFilter] = useState<string>('all')
  const [municipalityFilter, setMunicipalityFilter] = useState<string>('all')
  const [overdueFilter, setOverdueFilter] = useState<boolean>(false)
  const [slaBreachedFilter, setSlaBreachedFilter] = useState<boolean>(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const isGovernor = user.role === 'governor'
  const isMayor = user.role === 'mayor'
  const isMukhtar = user.role === 'mukhtar'

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
    if (districtFilter !== 'all') filters.district_id = districtFilter
    if (municipalityFilter !== 'all') filters.municipality_id = municipalityFilter
    if (overdueFilter) filters.overdue = true
    if (slaBreachedFilter) filters.sla_breached = true
    if (dateFrom) filters.date_from = dateFrom
    if (dateTo) filters.date_to = dateTo
    if (search.trim()) filters.search = search.trim()

    api.getRequests(filters)
      .then((result) => {
        setRequests(result.items.map(toServiceRequest))
        setTotal(result.total)
      })
      .catch(() => {})
  }, [page, statusFilter, categoryFilter, priorityFilter, districtFilter, municipalityFilter,
      overdueFilter, slaBreachedFilter, dateFrom, dateTo, search, sortBy, sortDir])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  const stats = useMemo(() => {
    return {
      total,
      open: requests.filter(r => r.status !== 'resolved' && r.status !== 'rejected' && r.status !== 'deferred').length,
      resolved: requests.filter(r => r.status === 'resolved').length,
      urgent: requests.filter(r => r.priority === 'urgent').length,
    }
  }, [requests, total])

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

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>إجمالي الطلبات</CardDescription>
            <CardTitle className="text-3xl">{total}</CardTitle>
          </CardHeader>
          <CardContent><ChartBar size={24} className="text-muted-foreground" /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>المفتوحة</CardDescription>
            <CardTitle className="text-3xl text-[oklch(0.55_0.10_250)]">{stats.open}</CardTitle>
          </CardHeader>
          <CardContent><Buildings size={24} className="text-muted-foreground" /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>المنجزة</CardDescription>
            <CardTitle className="text-3xl text-[oklch(0.60_0.15_145)]">{stats.resolved}</CardTitle>
          </CardHeader>
          <CardContent><Buildings size={24} className="text-muted-foreground" /></CardContent>
        </Card>
        <Card className="border-destructive/50">
          <CardHeader className="pb-2">
            <CardDescription>العاجلة</CardDescription>
            <CardTitle className="text-3xl text-destructive">{stats.urgent}</CardTitle>
          </CardHeader>
          <CardContent><Warning size={24} className="text-destructive" /></CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>الطلبات</CardTitle>
            {isMukhtar && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="ml-2" size={16} />
                تسجيل طلب
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 mb-6">
            {/* Search */}
            {(isGovernor || isMayor) && (
              <div className="relative">
                <MagnifyingGlass className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  placeholder="بحث في الوصف أو رمز التتبع أو العنوان..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  className="pr-9"
                  dir="rtl"
                />
              </div>
            )}

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

              {/* District filter */}
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

              {/* Sort */}
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

            {/* Multi-select status */}
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground self-center ml-1">الحالة:</span>
              {Object.entries(STATUSES).map(([key, label]) => (
                <Badge
                  key={key}
                  variant={statusFilter.includes(key) ? 'default' : 'outline'}
                  className="cursor-pointer select-none"
                  onClick={() => toggleMultiFilter(key, statusFilter, setStatusFilter)}
                >
                  {label}
                </Badge>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground self-center ml-1">الفئة:</span>
              {Object.entries(CATEGORIES).map(([key, label]) => (
                <Badge
                  key={key}
                  variant={categoryFilter.includes(key) ? 'default' : 'outline'}
                  className="cursor-pointer select-none"
                  onClick={() => toggleMultiFilter(key, categoryFilter, setCategoryFilter)}
                >
                  {label}
                </Badge>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground self-center ml-1">الأولوية:</span>
              {Object.entries(PRIORITIES).map(([key, label]) => (
                <Badge
                  key={key}
                  variant={priorityFilter.includes(key) ? 'default' : 'outline'}
                  className="cursor-pointer select-none"
                  onClick={() => toggleMultiFilter(key, priorityFilter, setPriorityFilter)}
                >
                  {label}
                </Badge>
              ))}
            </div>

            {/* Governor-only advanced filters */}
            {isGovernor && (
              <div className="flex flex-wrap gap-4 items-center pt-1 border-t">
                <div className="flex items-center gap-2">
                  <Switch
                    id="overdue"
                    checked={overdueFilter}
                    onCheckedChange={(v) => { setOverdueFilter(v); setPage(1) }}
                  />
                  <Label htmlFor="overdue" className="cursor-pointer">متأخّرة</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="sla_breached"
                    checked={slaBreachedFilter}
                    onCheckedChange={(v) => { setSlaBreachedFilter(v); setPage(1) }}
                  />
                  <Label htmlFor="sla_breached" className="cursor-pointer">SLA منتهية</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">من:</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
                    className="w-36 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">إلى:</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
                    className="w-36 text-sm"
                  />
                </div>
                {(overdueFilter || slaBreachedFilter || dateFrom || dateTo ||
                  statusFilter.length || categoryFilter.length || priorityFilter.length ||
                  districtFilter !== 'all' || municipalityFilter !== 'all' || search) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setOverdueFilter(false)
                      setSlaBreachedFilter(false)
                      setDateFrom('')
                      setDateTo('')
                      setStatusFilter([])
                      setCategoryFilter([])
                      setPriorityFilter([])
                      setDistrictFilter('all')
                      setMunicipalityFilter('all')
                      setSearch('')
                      setPage(1)
                    }}
                  >
                    مسح الفلاتر
                  </Button>
                )}
              </div>
            )}
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
                  <TableHead>التاريخ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={(isGovernor || isMayor) ? 8 : 7}
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
  const [showForm, setShowForm] = useState(false)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [municipalityId, setMunicipalityId] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState<{ username: string; password: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.getMunicipalities()
      .then((list) => setMunicipalities(list.map((m) => ({ id: m.id, name: m.name }))))
      .catch(() => toast.error('تعذّر تحميل البلديات'))
  }, [])

  const handleCreate = async () => {
    if (!fullName.trim() || !username.trim() || !password.trim() || !municipalityId) {
      toast.error('يرجى ملء جميع الحقول')
      return
    }
    setSubmitting(true)
    try {
      const savedUsername = username.trim()
      const savedPassword = password
      await api.createMayor({
        full_name: fullName.trim(),
        username: savedUsername,
        password: savedPassword,
        municipality_id: municipalityId,
      })
      setCreatedCredentials({ username: savedUsername, password: savedPassword })
      setFullName('')
      setUsername('')
      setPassword('')
      setMunicipalityId('')
      setShowForm(false)
      toast.success('تم إنشاء حساب رئيس البلدية')
    } catch (e: any) {
      toast.error(e.message || 'فشل إنشاء الحساب')
    } finally {
      setSubmitting(false)
    }
  }

  const copyCredentials = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => toast.success('تم النسخ'))
      .catch(() => toast.error('تعذّر النسخ'))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">رؤساء البلديات</h2>
        <Button onClick={() => setShowForm(true)} size="sm">
          <Plus className="ml-2" size={16} />
          إنشاء حساب رئيس بلدية
        </Button>
      </div>

      {createdCredentials && (
        <Card className="border-green-500/40 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-4">
            <p className="font-semibold text-green-700 dark:text-green-400 mb-2">تم إنشاء الحساب بنجاح – احفظ بيانات الدخول الآن</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-28">اسم المستخدم:</span>
                <span className="font-mono font-bold">{createdCredentials.username}</span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => copyCredentials(createdCredentials.username)}>نسخ</Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-28">كلمة المرور:</span>
                <span className="font-mono font-bold">{createdCredentials.password}</span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => copyCredentials(createdCredentials.password)}>نسخ</Button>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => copyCredentials(`${createdCredentials.username}\n${createdCredentials.password}`)}>نسخ الكل</Button>
              </div>
            </div>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setCreatedCredentials(null)}>
              إغلاق
            </Button>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">بيانات رئيس البلدية الجديد</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>الاسم الكامل</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="رئيس بلدية ..." dir="rtl" />
            </div>
            <div className="space-y-1">
              <Label>اسم المستخدم</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="mayor_..." dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label>كلمة المرور</Label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="text" placeholder="كلمة المرور المؤقتة" dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label>البلدية</Label>
              <Select value={municipalityId} onValueChange={setMunicipalityId}>
                <SelectTrigger dir="rtl">
                  <SelectValue placeholder="اختر البلدية" />
                </SelectTrigger>
                <SelectContent>
                  {municipalities.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={submitting}>حفظ</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!showForm && !createdCredentials && (
        <p className="text-muted-foreground text-sm">انقر على "إنشاء حساب رئيس بلدية" لإضافة حساب جديد.</p>
      )}
    </div>
  )
}


// ─── Mukhtars Management (Mayor) ─────────────────────────────────────────────

function MukhtarsView({ user }: { user: User }) {
  const [districts, setDistricts] = useState<{ id: string; name: string }[]>([])
  const [showForm, setShowForm] = useState(false)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [districtId, setDistrictId] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState<{ username: string; password: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.getAdminDistricts()
      .then((list) => setDistricts(list.map((d) => ({ id: d.id, name: d.name }))))
      .catch(() => toast.error('تعذّر تحميل الأحياء'))
  }, [])

  const handleCreate = async () => {
    if (!fullName.trim() || !username.trim() || !password.trim() || !districtId) {
      toast.error('يرجى ملء جميع الحقول')
      return
    }
    setSubmitting(true)
    try {
      const savedUsername = username.trim()
      const savedPassword = password
      await api.createMukhtar({
        full_name: fullName.trim(),
        username: savedUsername,
        password: savedPassword,
        district_id: districtId,
      })
      setCreatedCredentials({ username: savedUsername, password: savedPassword })
      setFullName('')
      setUsername('')
      setPassword('')
      setDistrictId('')
      setShowForm(false)
      toast.success('تم إنشاء حساب المختار')
    } catch (e: any) {
      toast.error(e.message || 'فشل إنشاء الحساب')
    } finally {
      setSubmitting(false)
    }
  }

  const copyCredentials = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => toast.success('تم النسخ'))
      .catch(() => toast.error('تعذّر النسخ'))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">مخاتير الأحياء</h2>
        <Button onClick={() => setShowForm(true)} size="sm">
          <Plus className="ml-2" size={16} />
          إنشاء حساب مختار
        </Button>
      </div>

      {createdCredentials && (
        <Card className="border-green-500/40 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-4">
            <p className="font-semibold text-green-700 dark:text-green-400 mb-2">تم إنشاء الحساب بنجاح – احفظ بيانات الدخول الآن</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-28">اسم المستخدم:</span>
                <span className="font-mono font-bold">{createdCredentials.username}</span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => copyCredentials(createdCredentials.username)}>نسخ</Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-28">كلمة المرور:</span>
                <span className="font-mono font-bold">{createdCredentials.password}</span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => copyCredentials(createdCredentials.password)}>نسخ</Button>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => copyCredentials(`${createdCredentials.username}\n${createdCredentials.password}`)}>نسخ الكل</Button>
              </div>
            </div>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setCreatedCredentials(null)}>
              إغلاق
            </Button>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">بيانات المختار الجديد</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>الاسم الكامل</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="مختار حي ..." dir="rtl" />
            </div>
            <div className="space-y-1">
              <Label>اسم المستخدم</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="mukhtar_..." dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label>كلمة المرور</Label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="text" placeholder="كلمة المرور المؤقتة" dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label>الحي</Label>
              <Select value={districtId} onValueChange={setDistrictId}>
                <SelectTrigger dir="rtl">
                  <SelectValue placeholder="اختر الحي" />
                </SelectTrigger>
                <SelectContent>
                  {districts.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={submitting}>حفظ</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!showForm && !createdCredentials && (
        <p className="text-muted-foreground text-sm">انقر على "إنشاء حساب مختار" لإضافة حساب جديد.</p>
      )}
    </div>
  )
}


// ─── Main AdminDashboard ──────────────────────────────────────────────────────

export function AdminDashboard({ user, onLogout }: AdminDashboardProps) {
  const isGovernor = user.role === 'governor'
  const isMayor = user.role === 'mayor'

  const [activeTab, setActiveTab] = useState<'requests' | 'municipalities' | 'mayors' | 'districts' | 'mukhtars'>('requests')

  const tabs: { key: typeof activeTab; label: string; show: boolean }[] = [
    { key: 'requests', label: 'الطلبات', show: true },
    { key: 'municipalities', label: 'البلديات', show: isGovernor },
    { key: 'mayors', label: 'رؤساء البلديات', show: isGovernor },
    { key: 'districts', label: 'الأحياء', show: isMayor },
    { key: 'mukhtars', label: 'مخاتير الأحياء', show: isMayor },
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
            <Button variant="outline" onClick={onLogout}>
              <SignOut className="ml-2" />
              تسجيل الخروج
            </Button>
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
        {activeTab === 'municipalities' && isGovernor && <MunicipalitiesView user={user} />}
        {activeTab === 'mayors' && isGovernor && <MayorsView user={user} />}
        {activeTab === 'districts' && isMayor && <DistrictsView user={user} />}
        {activeTab === 'mukhtars' && isMayor && <MukhtarsView user={user} />}
      </main>
    </div>
  )
}
