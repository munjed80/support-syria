import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  CheckCircle,
  Clock,
  MapPin,
  PaperPlaneRight,
  ClipboardText,
  ChartBar,
  Buildings,
  Warning,
  User as UserIcon,
} from '@phosphor-icons/react'
import { CATEGORIES, STATUSES, STATUS_COLORS, PRIORITIES, PRIORITY_BADGE_COLORS } from '@/lib/constants'

// ─── Seeded mock data ────────────────────────────────────────────────────────

const DISTRICTS = [
  { id: 'd1', name: 'الميدان' },
  { id: 'd2', name: 'المزة' },
  { id: 'd3', name: 'باب توما' },
  { id: 'd4', name: 'الشعلان' },
]

const SAMPLE_TICKETS = [
  {
    id: 't1',
    trackingCode: 'SYR2024A1',
    category: 'water' as const,
    status: 'in_progress' as const,
    priority: 'urgent' as const,
    description: 'انقطاع المياه عن الحي منذ يومين، يُرجى التدخل العاجل',
    district: 'الميدان',
    assignedTo: 'أحمد الصالح',
    createdAt: 'منذ يومين',
    slaStatus: 'breached' as const,
  },
  {
    id: 't2',
    trackingCode: 'SYR2024B2',
    category: 'lighting' as const,
    status: 'received' as const,
    priority: 'normal' as const,
    description: 'عطل في إنارة الشارع الرئيسي بجانب المسجد',
    district: 'المزة',
    assignedTo: 'فاطمة خالد',
    createdAt: 'منذ 3 أيام',
    slaStatus: 'at_risk' as const,
  },
  {
    id: 't3',
    trackingCode: 'SYR2024C3',
    category: 'waste' as const,
    status: 'completed' as const,
    priority: 'high' as const,
    description: 'تراكم القمامة أمام المدرسة الابتدائية',
    district: 'باب توما',
    assignedTo: 'محمد العلي',
    createdAt: 'منذ أسبوع',
    slaStatus: 'met' as const,
  },
  {
    id: 't4',
    trackingCode: 'SYR2024D4',
    category: 'roads' as const,
    status: 'submitted' as const,
    priority: 'low' as const,
    description: 'حفرة كبيرة في الطريق بالقرب من الحديقة العامة',
    district: 'الشعلان',
    assignedTo: '',
    createdAt: 'منذ ساعة',
    slaStatus: 'met' as const,
  },
  {
    id: 't5',
    trackingCode: 'SYR2024E5',
    category: 'water' as const,
    status: 'in_progress' as const,
    priority: 'high' as const,
    description: 'تسرب مياه من الأنبوب الرئيسي في الشارع',
    district: 'الميدان',
    assignedTo: 'سارة مصطفى',
    createdAt: 'منذ يوم',
    slaStatus: 'at_risk' as const,
  },
]

const TIMELINE_UPDATES = [
  { id: 'u1', status: 'completed', label: 'منجزة', time: 'منذ ساعة', actor: 'أحمد الصالح', note: 'تمت معالجة المشكلة وإعادة تشغيل خط المياه بالكامل' },
  { id: 'u2', status: 'in_progress', label: 'قيد المعالجة', time: 'منذ 5 ساعات', actor: 'أحمد الصالح', note: 'الفريق الميداني في الموقع' },
  { id: 'u3', status: 'received', label: 'مستلمة', time: 'منذ يوم', actor: 'مركز الخدمة', note: null },
  { id: 'u4', status: 'submitted', label: 'مُرسلة', time: 'منذ يومين', actor: null, note: 'تم استلام الطلب بنجاح' },
]

const DISTRICT_STATS = [
  { name: 'الميدان', total: 48, completed: 32, inProgress: 10, overdue: 6, sla: 72 },
  { name: 'المزة', total: 61, completed: 45, inProgress: 12, overdue: 4, sla: 85 },
  { name: 'باب توما', total: 35, completed: 29, inProgress: 4, overdue: 2, sla: 91 },
  { name: 'الشعلان', total: 27, completed: 18, inProgress: 7, overdue: 2, sla: 78 },
]

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ title, role }: { title: string; role: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
        <Buildings size={20} className="text-primary-foreground" />
      </div>
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{role}</p>
      </div>
    </div>
  )
}

function SLABadge({ status }: { status: 'met' | 'at_risk' | 'breached' }) {
  const config = {
    met: { label: 'ضمن الموعد', cls: 'bg-[oklch(0.60_0.15_145)] text-white' },
    at_risk: { label: 'معرض للتأخير', cls: 'bg-[oklch(0.70_0.15_65)] text-[oklch(0.25_0.05_60)]' },
    breached: { label: 'متأخر', cls: 'bg-destructive text-destructive-foreground' },
  }
  const { label, cls } = config[status]
  return <Badge className={cls}>{label}</Badge>
}

// ─── 1. Citizen Panel ────────────────────────────────────────────────────────

function CitizenPanel() {
  return (
    <div className="space-y-6">
      <SectionHeader title="بوابة المواطن" role="مواطن" />

      {/* Submit form */}
      <Card>
        <CardHeader>
          <CardTitle>تقديم طلب جديد</CardTitle>
          <CardDescription>أرسل شكوى أو طلب خدمة بلدية</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>نوع الطلب *</Label>
            <Select defaultValue="water">
              <SelectTrigger>
                <SelectValue>{CATEGORIES['water']}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>الحي *</Label>
            <Select defaultValue="d1">
              <SelectTrigger>
                <SelectValue>الميدان</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DISTRICTS.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>وصف المشكلة *</Label>
            <Textarea
              readOnly
              value="انقطاع المياه عن الحي منذ يومين، يُرجى التدخل العاجل"
              rows={3}
              className="resize-none"
            />
          </div>
          <div className="space-y-2">
            <Label>العنوان (اختياري)</Label>
            <Input readOnly value="شارع الثورة، بجانب الجامع الكبير" />
          </div>
          <Button className="w-full" size="lg">
            <PaperPlaneRight className="ml-2" />
            إرسال الطلب
          </Button>
        </CardContent>
      </Card>

      {/* Success screen */}
      <Card className="border-[oklch(0.60_0.15_145)]">
        <CardContent className="pt-6">
          <div className="text-center space-y-3">
            <CheckCircle size={48} className="mx-auto text-[oklch(0.60_0.15_145)]" />
            <h3 className="text-xl font-bold text-[oklch(0.60_0.15_145)]">تم إرسال طلبك بنجاح!</h3>
            <p className="text-muted-foreground text-sm">احتفظ برمز التتبع لمتابعة حالة طلبك</p>
            <div className="bg-muted rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-1">رمز التتبع</p>
              <p className="font-mono text-3xl font-bold tracking-widest">SYR2024A1</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tracking page with timeline */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle>{CATEGORIES['water']}</CardTitle>
                <Badge className={STATUS_COLORS['completed']}>{STATUSES['completed']}</Badge>
                <Badge className={PRIORITY_BADGE_COLORS['urgent']}>{PRIORITIES['urgent']}</Badge>
              </div>
              <CardDescription>رمز التتبع: <span className="font-mono text-base">SYR2024A1</span></CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm text-muted-foreground mb-1">الوصف</h4>
            <p>انقطاع المياه عن الحي منذ يومين، يُرجى التدخل العاجل</p>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="text-muted-foreground mt-1" size={18} />
            <div>
              <h4 className="font-semibold text-sm text-muted-foreground">الموقع</h4>
              <p className="text-sm">شارع الثورة، بجانب الجامع الكبير، الميدان</p>
            </div>
          </div>
          <Separator />
          <h4 className="font-semibold">التحديثات</h4>
          <div className="space-y-4">
            {TIMELINE_UPDATES.map((update, index) => (
              <div key={update.id} className="relative">
                {index < TIMELINE_UPDATES.length - 1 && (
                  <div className="absolute right-4 top-10 bottom-0 w-px bg-border" />
                )}
                <div className="flex gap-4">
                  <div className="relative z-10 flex-shrink-0 w-8 h-8 rounded-full bg-card border-2 border-border flex items-center justify-center">
                    {update.status === 'completed' && <CheckCircle className="text-[oklch(0.60_0.15_145)]" size={16} />}
                    {update.status === 'in_progress' && <Clock className="text-[oklch(0.65_0.13_65)]" size={16} />}
                    {(update.status === 'received' || update.status === 'submitted') && <Clock size={16} />}
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="text-xs">{update.label}</Badge>
                      <span className="text-xs text-muted-foreground">{update.time}</span>
                    </div>
                    {update.actor && (
                      <p className="text-xs text-muted-foreground">بواسطة: {update.actor}</p>
                    )}
                    {update.note && (
                      <p className="text-sm mt-1">{update.note}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── 2. Staff Panel ──────────────────────────────────────────────────────────

function StaffPanel() {
  const myTasks = SAMPLE_TICKETS.filter(t => t.assignedTo === 'أحمد الصالح')

  return (
    <div className="space-y-6">
      <SectionHeader title="لوحة الموظف الميداني" role="موظف ميداني" />

      {/* My Tasks list */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ClipboardText size={20} />
            <CardTitle>طلباتي</CardTitle>
          </div>
          <CardDescription>الطلبات المعيّنة لك</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رمز التتبع</TableHead>
                  <TableHead>الأولوية</TableHead>
                  <TableHead>الفئة</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الحي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myTasks.map(ticket => (
                  <TableRow
                    key={ticket.id}
                    className={`cursor-pointer hover:bg-muted/50 ${ticket.priority === 'urgent' ? 'bg-destructive/5 border-l-4 border-l-destructive' : ''}`}
                  >
                    <TableCell className="font-mono font-semibold">{ticket.trackingCode}</TableCell>
                    <TableCell>
                      <Badge className={PRIORITY_BADGE_COLORS[ticket.priority]}>
                        {PRIORITIES[ticket.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell>{CATEGORIES[ticket.category]}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[ticket.status]}>
                        {STATUSES[ticket.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{ticket.district}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Request detail: in_progress with required actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle>{CATEGORIES['water']}</CardTitle>
            <Badge className={STATUS_COLORS['in_progress']}>{STATUSES['in_progress']}</Badge>
            <Badge className={PRIORITY_BADGE_COLORS['urgent']}>{PRIORITIES['urgent']}</Badge>
          </div>
          <CardDescription>رمز التتبع: <span className="font-mono">SYR2024A1</span></CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">انقطاع المياه عن الحي منذ يومين، يُرجى التدخل العاجل</p>
          <div className="flex items-start gap-2">
            <MapPin className="text-muted-foreground mt-0.5" size={16} />
            <p className="text-sm">شارع الثورة، بجانب الجامع الكبير، الميدان</p>
          </div>
          <Separator />
          <h4 className="font-semibold">الإجراءات المطلوبة</h4>
          <div className="space-y-3 bg-muted/30 rounded-lg p-4 border">
            <div className="flex items-start gap-3">
              <CheckCircle size={18} className="text-[oklch(0.60_0.15_145)] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">وصول الفريق الميداني إلى الموقع</p>
                <p className="text-xs text-muted-foreground">منذ 5 ساعات</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle size={18} className="text-[oklch(0.60_0.15_145)] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">تحديد مصدر العطل</p>
                <p className="text-xs text-muted-foreground">منذ 4 ساعات</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock size={18} className="text-[oklch(0.65_0.13_65)] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">إضافة صورة بعد الإنجاز لإغلاق الطلب</p>
                <p className="text-xs text-muted-foreground text-[oklch(0.65_0.13_65)]">قيد التنفيذ</p>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>تغيير الحالة إلى منجزة</Label>
            <Select defaultValue="completed">
              <SelectTrigger>
                <SelectValue>منجزة</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="completed">منجزة</SelectItem>
                <SelectItem value="rejected">مرفوضة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>صورة بعد الإنجاز *</Label>
            <div className="border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground text-sm">
              📷 انقر لرفع صورة الإنجاز
            </div>
          </div>
          <Button className="w-full">حفظ التغييرات</Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── 3. District Admin Panel ─────────────────────────────────────────────────

function DistrictAdminPanel() {
  return (
    <div className="space-y-6">
      <SectionHeader title="لوحة مدير الحي" role="مدير حي — الميدان" />

      {/* Inbox with filters */}
      <Card>
        <CardHeader>
          <CardTitle>صندوق الوارد</CardTitle>
          <CardDescription>طلبات حي الميدان</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select defaultValue="all">
              <SelectTrigger className="w-36">
                <SelectValue>كل الحالات</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {Object.entries(STATUSES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select defaultValue="all">
              <SelectTrigger className="w-36">
                <SelectValue>كل الفئات</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفئات</SelectItem>
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select defaultValue="all">
              <SelectTrigger className="w-36">
                <SelectValue>كل الأولويات</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأولويات</SelectItem>
                {Object.entries(PRIORITIES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رمز التتبع</TableHead>
                  <TableHead>الأولوية</TableHead>
                  <TableHead>الفئة</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>المكلف</TableHead>
                  <TableHead>SLA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SAMPLE_TICKETS.filter(t => t.district === 'الميدان').map(ticket => (
                  <TableRow
                    key={ticket.id}
                    className={`cursor-pointer hover:bg-muted/50 ${ticket.priority === 'urgent' ? 'bg-destructive/5 border-l-4 border-l-destructive' : ''}`}
                  >
                    <TableCell className="font-mono font-semibold">{ticket.trackingCode}</TableCell>
                    <TableCell>
                      <Badge className={PRIORITY_BADGE_COLORS[ticket.priority]}>
                        {PRIORITIES[ticket.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell>{CATEGORIES[ticket.category]}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[ticket.status]}>
                        {STATUSES[ticket.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {ticket.assignedTo || <span className="text-muted-foreground">غير مخصص</span>}
                    </TableCell>
                    <TableCell><SLABadge status={ticket.slaStatus} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Assignment UI */}
      <Card>
        <CardHeader>
          <CardTitle>تعيين موظف — SYR2024D4</CardTitle>
          <CardDescription>حفرة كبيرة في الطريق بالقرب من الحديقة العامة</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">الفئة:</span>{' '}
              <span className="font-medium">{CATEGORIES['roads']}</span>
            </div>
            <div>
              <span className="text-muted-foreground">الحالة:</span>{' '}
              <Badge className={STATUS_COLORS['submitted']}>{STATUSES['submitted']}</Badge>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label>تعيين موظف</Label>
            <div className="flex gap-2">
              <Select defaultValue="s3">
                <SelectTrigger className="flex-1">
                  <SelectValue>سارة مصطفى</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="s1">أحمد الصالح</SelectItem>
                  <SelectItem value="s2">فاطمة خالد</SelectItem>
                  <SelectItem value="s3">سارة مصطفى</SelectItem>
                  <SelectItem value="s4">محمد العلي</SelectItem>
                </SelectContent>
              </Select>
              <Button>تعيين</Button>
            </div>
          </div>

          {/* Status change workflow */}
          <div className="space-y-2">
            <Label>تغيير الحالة</Label>
            <Select defaultValue="received">
              <SelectTrigger>
                <SelectValue>مستلمة</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="received">مستلمة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>ملاحظة داخلية (اختياري)</Label>
            <Textarea
              readOnly
              value="تم استلام البلاغ وسيتم التعامل معه خلال 48 ساعة"
              rows={2}
              className="resize-none"
            />
          </div>
          <Button className="w-full">حفظ التغييرات</Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── 4. Municipal Admin Panel ────────────────────────────────────────────────

function MunicipalAdminPanel() {
  const totalRequests = DISTRICT_STATS.reduce((s, d) => s + d.total, 0)
  const totalCompleted = DISTRICT_STATS.reduce((s, d) => s + d.completed, 0)
  const totalInProgress = DISTRICT_STATS.reduce((s, d) => s + d.inProgress, 0)
  const totalOverdue = DISTRICT_STATS.reduce((s, d) => s + d.overdue, 0)
  const avgSLA = Math.round(DISTRICT_STATS.reduce((s, d) => s + d.sla, 0) / DISTRICT_STATS.length)

  return (
    <div className="space-y-6">
      <SectionHeader title="لوحة المدير البلدي" role="مدير بلدي — بلدية دمشق" />

      {/* KPI Dashboard */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>إجمالي الطلبات</CardDescription>
            <CardTitle className="text-3xl">{totalRequests}</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartBar size={24} className="text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>المنجزة</CardDescription>
            <CardTitle className="text-3xl text-[oklch(0.60_0.15_145)]">{totalCompleted}</CardTitle>
          </CardHeader>
          <CardContent>
            <CheckCircle size={24} className="text-[oklch(0.60_0.15_145)]" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>قيد المعالجة</CardDescription>
            <CardTitle className="text-3xl text-[oklch(0.55_0.10_250)]">{totalInProgress}</CardTitle>
          </CardHeader>
          <CardContent>
            <Buildings size={24} className="text-muted-foreground" />
          </CardContent>
        </Card>
        <Card className="border-destructive/50">
          <CardHeader className="pb-2">
            <CardDescription>متأخرة</CardDescription>
            <CardTitle className="text-3xl text-destructive">{totalOverdue}</CardTitle>
          </CardHeader>
          <CardContent>
            <Warning size={24} className="text-destructive" />
          </CardContent>
        </Card>
      </div>

      {/* SLA compliance widget */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>الالتزام بالـ SLA</CardTitle>
            <Badge className="bg-[oklch(0.60_0.15_145)] text-white text-base px-3 py-1">
              {avgSLA}%
            </Badge>
          </div>
          <CardDescription>متوسط الامتثال لاتفاقية مستوى الخدمة عبر الأحياء</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {DISTRICT_STATS.map(d => (
              <div key={d.name} className="flex items-center gap-3">
                <span className="w-16 text-sm font-medium">{d.name}</span>
                <div className="flex-1 bg-muted rounded-full h-3">
                  <div
                    className={`h-3 rounded-full ${d.sla >= 85 ? 'bg-[oklch(0.60_0.15_145)]' : d.sla >= 75 ? 'bg-[oklch(0.70_0.15_65)]' : 'bg-destructive'}`}
                    style={{ width: `${d.sla}%` }}
                  />
                </div>
                <span className="w-12 text-sm text-left font-mono">{d.sla}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* District performance table */}
      <Card>
        <CardHeader>
          <CardTitle>أداء الأحياء</CardTitle>
          <CardDescription>ملخص إحصائيات الطلبات لكل حي</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الحي</TableHead>
                  <TableHead>الإجمالي</TableHead>
                  <TableHead>المنجزة</TableHead>
                  <TableHead>قيد المعالجة</TableHead>
                  <TableHead>المتأخرة</TableHead>
                  <TableHead>SLA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DISTRICT_STATS.map(d => (
                  <TableRow key={d.name}>
                    <TableCell className="font-semibold">{d.name}</TableCell>
                    <TableCell>{d.total}</TableCell>
                    <TableCell className="text-[oklch(0.60_0.15_145)] font-medium">{d.completed}</TableCell>
                    <TableCell className="text-[oklch(0.55_0.10_250)] font-medium">{d.inProgress}</TableCell>
                    <TableCell>
                      {d.overdue > 0 ? (
                        <span className="text-destructive font-medium">{d.overdue}</span>
                      ) : (
                        <span className="text-[oklch(0.60_0.15_145)]">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          d.sla >= 85
                            ? 'bg-[oklch(0.60_0.15_145)] text-white'
                            : d.sla >= 75
                            ? 'bg-[oklch(0.70_0.15_65)] text-[oklch(0.25_0.05_60)]'
                            : 'bg-destructive text-destructive-foreground'
                        }
                      >
                        {d.sla}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell>الإجمالي</TableCell>
                  <TableCell>{totalRequests}</TableCell>
                  <TableCell className="text-[oklch(0.60_0.15_145)]">{totalCompleted}</TableCell>
                  <TableCell className="text-[oklch(0.55_0.10_250)]">{totalInProgress}</TableCell>
                  <TableCell className="text-destructive">{totalOverdue}</TableCell>
                  <TableCell>
                    <Badge className="bg-[oklch(0.60_0.15_145)] text-white">{avgSLA}%</Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function ScreenshotsPage() {
  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Buildings size={22} className="text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">معاينة الواجهات — نظام الطلبات البلدية</h1>
              <p className="text-xs text-muted-foreground">عرض مرئي لحالة كل دور (بيانات تجريبية)</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Panel 1: Citizen */}
          <section className="bg-card rounded-xl border p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b">
              <UserIcon size={18} className="text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">لوحة ١</span>
              <span className="text-xs text-muted-foreground">المواطن</span>
            </div>
            <CitizenPanel />
          </section>

          {/* Panel 2: Staff */}
          <section className="bg-card rounded-xl border p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b">
              <ClipboardText size={18} className="text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">لوحة ٢</span>
              <span className="text-xs text-muted-foreground">الموظف الميداني</span>
            </div>
            <StaffPanel />
          </section>

          {/* Panel 3: District Admin */}
          <section className="bg-card rounded-xl border p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b">
              <Buildings size={18} className="text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">لوحة ٣</span>
              <span className="text-xs text-muted-foreground">مدير الحي</span>
            </div>
            <DistrictAdminPanel />
          </section>

          {/* Panel 4: Municipal Admin */}
          <section className="bg-card rounded-xl border p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b">
              <ChartBar size={18} className="text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">لوحة ٤</span>
              <span className="text-xs text-muted-foreground">المدير البلدي</span>
            </div>
            <MunicipalAdminPanel />
          </section>
        </div>
      </main>

      <footer className="border-t mt-12 py-6 bg-muted">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>معاينة الواجهات — بيانات تجريبية فقط | نظام الطلبات البلدية</p>
        </div>
      </footer>
    </div>
  )
}
