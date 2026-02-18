import { useState, useMemo } from 'react'
import { useKV } from '@github/spark/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { SignOut, ChartBar, Buildings, Warning, ClipboardText, Info } from '@phosphor-icons/react'
import { CATEGORIES, STATUSES, STATUS_COLORS, PRIORITIES, PRIORITY_BADGE_COLORS, PRIORITY_ORDER, CATEGORY_ESCALATION_RULES, formatRelativeTime, isOverdue } from '@/lib/constants'
import { RequestDetailsDialog } from '@/components/RequestDetailsDialog'
import type { ServiceRequest, User, District } from '@/lib/types'

interface AdminDashboardProps {
  user: User
  onLogout: () => void
}

export function AdminDashboard({ user, onLogout }: AdminDashboardProps) {
  const [requests] = useKV<ServiceRequest[]>('service_requests', [])
  const [districts] = useKV<District[]>('districts', [])
  
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [districtFilter, setDistrictFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [activeView, setActiveView] = useState<string>('all')
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const userRequests = useMemo(() => {
    let filtered = requests || []
    
    if (user.role === 'district_admin' && user.districtId) {
      filtered = filtered.filter(r => r.districtId === user.districtId)
    } else if (user.role === 'municipal_admin') {
      filtered = filtered.filter(r => r.municipalityId === user.municipalityId)
    } else if (user.role === 'staff') {
      if (activeView === 'my_tasks') {
        filtered = filtered.filter(r => r.assignedToUserId === user.id)
      } else {
        filtered = filtered.filter(r => r.districtId === user.districtId)
      }
    }
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter)
    }
    
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(r => r.category === categoryFilter)
    }
    
    if (districtFilter !== 'all') {
      filtered = filtered.filter(r => r.districtId === districtFilter)
    }

    if (priorityFilter !== 'all') {
      if (priorityFilter === 'urgent') {
        filtered = filtered.filter(r => r.priority === 'urgent')
      } else {
        filtered = filtered.filter(r => r.priority === priorityFilter)
      }
    }
    
    return filtered.sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      if (priorityDiff !== 0) return priorityDiff
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [requests, statusFilter, categoryFilter, districtFilter, priorityFilter, activeView, user])

  const stats = useMemo(() => {
    const all = userRequests
    return {
      total: all.length,
      open: all.filter(r => r.status !== 'completed' && r.status !== 'rejected').length,
      completed: all.filter(r => r.status === 'completed').length,
      overdue: all.filter(r => isOverdue(r)).length,
      urgent: all.filter(r => r.priority === 'urgent').length
    }
  }, [userRequests])

  const userDistricts = useMemo(() => {
    if (user.role === 'municipal_admin') {
      return (districts || []).filter(d => d.municipalityId === user.municipalityId)
    } else if (user.role === 'district_admin' && user.districtId) {
      return (districts || []).filter(d => d.id === user.districtId)
    }
    return []
  }, [districts, user])

  const handleRequestClick = (request: ServiceRequest) => {
    setSelectedRequest(request)
    setDialogOpen(true)
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">لوحة التحكم</h1>
              <p className="text-sm text-muted-foreground">{user.name}</p>
            </div>
            <Button variant="outline" onClick={onLogout}>
              <SignOut className="ml-2" />
              تسجيل الخروج
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Alert className="mb-8 border-[oklch(0.55_0.10_250)] bg-[oklch(0.55_0.10_250)]/5">
          <Info className="h-4 w-4 text-[oklch(0.55_0.10_250)]" />
          <AlertTitle>قواعد الترقية التلقائية حسب الفئة</AlertTitle>
          <AlertDescription className="mt-2 text-sm space-y-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(CATEGORY_ESCALATION_RULES).map(([category, rules]) => (
                <div key={category} className="flex items-center gap-2">
                  <span className="font-semibold">{CATEGORIES[category as keyof typeof CATEGORIES]}:</span>
                  <span className="text-xs">
                    {rules.low.hoursToNextLevel}س → {rules.normal.hoursToNextLevel}س → {rules.high.hoursToNextLevel}س
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              * الأرقام تمثل الوقت بالساعات قبل الترقية التلقائية من منخفض → عادي → مرتفع → عاجل
            </p>
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>إجمالي الطلبات</CardDescription>
              <CardTitle className="text-3xl">{stats.total}</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartBar size={24} className="text-muted-foreground" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>الطلبات المفتوحة</CardDescription>
              <CardTitle className="text-3xl text-[oklch(0.55_0.10_250)]">{stats.open}</CardTitle>
            </CardHeader>
            <CardContent>
              <Buildings size={24} className="text-muted-foreground" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>المنجزة</CardDescription>
              <CardTitle className="text-3xl text-[oklch(0.60_0.15_145)]">{stats.completed}</CardTitle>
            </CardHeader>
            <CardContent>
              <Buildings size={24} className="text-muted-foreground" />
            </CardContent>
          </Card>

          <Card className="border-destructive/50">
            <CardHeader className="pb-3">
              <CardDescription>الطلبات العاجلة</CardDescription>
              <CardTitle className="text-3xl text-destructive">{stats.urgent}</CardTitle>
            </CardHeader>
            <CardContent>
              <Warning size={24} className="text-destructive" />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>الطلبات</CardTitle>
            <CardDescription>
              إدارة طلبات الخدمات البلدية
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user.role === 'staff' && (
              <div className="mb-6">
                <Tabs value={activeView} onValueChange={setActiveView}>
                  <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="all">جميع الطلبات</TabsTrigger>
                    <TabsTrigger value="my_tasks">
                      <ClipboardText className="ml-2" />
                      طلباتي
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}

            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="md:w-48">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {Object.entries(STATUSES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="md:w-48">
                  <SelectValue placeholder="الفئة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفئات</SelectItem>
                  {Object.entries(CATEGORIES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="md:w-48">
                  <SelectValue placeholder="الأولوية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأولويات</SelectItem>
                  <SelectItem value="urgent">عاجل فقط</SelectItem>
                  {Object.entries(PRIORITIES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {user.role === 'municipal_admin' && userDistricts.length > 0 && (
                <Select value={districtFilter} onValueChange={setDistrictFilter}>
                  <SelectTrigger className="md:w-48">
                    <SelectValue placeholder="الحي" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأحياء</SelectItem>
                    {userDistricts.map(district => (
                      <SelectItem key={district.id} value={district.id}>
                        {district.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>رمز التتبع</TableHead>
                    <TableHead>الأولوية</TableHead>
                    <TableHead>الفئة</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>الوصف</TableHead>
                    {user.role !== 'staff' && <TableHead>المكلف</TableHead>}
                    <TableHead>التاريخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={user.role !== 'staff' ? 7 : 6} className="text-center text-muted-foreground py-8">
                        لا توجد طلبات
                      </TableCell>
                    </TableRow>
                  ) : (
                    userRequests.map(request => (
                      <TableRow 
                        key={request.id}
                        className={`cursor-pointer hover:bg-muted/50 ${request.priority === 'urgent' ? 'bg-destructive/5 border-l-4 border-l-destructive' : ''}`}
                        onClick={() => handleRequestClick(request)}
                      >
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
                        <TableCell className="max-w-xs truncate">
                          {request.description}
                        </TableCell>
                        {user.role !== 'staff' && (
                          <TableCell className="text-sm">
                            {request.assignedToName || <span className="text-muted-foreground">غير مخصص</span>}
                          </TableCell>
                        )}
                        <TableCell className="text-sm text-muted-foreground">
                          {formatRelativeTime(request.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

      <RequestDetailsDialog
        request={selectedRequest}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currentUser={user}
      />
    </div>
  )
}
