import { useEffect } from 'react'
import { CATEGORIES, STATUSES, RESPONSIBLE_TEAMS, formatDate } from '@/lib/constants'
import type { MonthlyReport } from '@/lib/api'

const ARABIC_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
const REPORT_TYPE_LABELS: Record<string, string> = { district: 'تقرير الحي', municipality: 'تقرير البلدية', governorate: 'تقرير المحافظة' }

interface PrintReportProps { report: MonthlyReport; reportType: 'district' | 'municipality' | 'governorate'; entityName?: string; onClose: () => void }

export function PrintReport({ report, reportType, entityName, onClose }: PrintReportProps) {
  const monthName = ARABIC_MONTHS[report.period.month - 1]
  const resolvedEntityName = entityName || report.entity_name || '—'

  useEffect(() => {
    document.title = `${REPORT_TYPE_LABELS[reportType]} - ${monthName} ${report.period.year}`
    return () => { document.title = 'نظام الشكاوى البلدية' }
  }, [monthName, report.period.year, reportType])

  return (
    <div className="print-overlay" dir="rtl" lang="ar">
      <div className="print-controls no-print">
        <button onClick={() => window.print()} className="print-btn-primary">🖨️ طباعة</button>
        <button onClick={onClose} className="print-btn-secondary">✕ إغلاق</button>
      </div>
      <div className="print-content">
        <div className="print-header">
          <h1 className="print-title">التقرير الشهري الرسمي للأداء البلدي</h1>
          <h2 className="print-subtitle">{REPORT_TYPE_LABELS[reportType]}</h2>
          <p className="print-entity-name">الجهة: {resolvedEntityName}</p>
          <p className="print-period">{monthName} {report.period.year}</p>
        </div>
        <hr className="print-divider" />

        <div className="print-section">
          <h3 className="print-section-title">ملخص المؤشرات</h3>
          <table className="print-table print-stats-table"><tbody>
            <tr><th>إجمالي الشكاوى</th><td>{report.total}</td><th>مفتوحة</th><td>{report.open}</td></tr>
            <tr><th>قيد المعالجة</th><td>{report.in_progress}</td><th>منجزة</th><td>{report.resolved}</td></tr>
            <tr><th>معدل الإغلاق</th><td>{report.closure_rate}%</td><th>معدل التأخر</th><td>{report.overdue_rate}%</td></tr>
            <tr><th>متوسط زمن المعالجة</th><td>{report.average_resolution_time_hours ?? '—'} ساعة</td><th>مؤشر التراكم</th><td>{report.backlog_open}</td></tr>
          </tbody></table>
        </div>

        <div className="print-section">
          <h3 className="print-section-title">الأكثر نشاطاً</h3>
          <table className="print-table"><thead><tr><th>الفئات الأعلى</th><th>العدد</th><th>الفرق الأعلى</th><th>العدد</th></tr></thead><tbody>
            {Array.from({ length: Math.max(report.top_categories.length, report.top_teams.length, 1) }).map((_, idx) => (
              <tr key={idx}>
                <td>{report.top_categories[idx] ? (CATEGORIES[report.top_categories[idx].name as keyof typeof CATEGORIES] ?? report.top_categories[idx].name) : '—'}</td>
                <td>{report.top_categories[idx]?.count ?? '—'}</td>
                <td>{report.top_teams[idx] ? (RESPONSIBLE_TEAMS[report.top_teams[idx].name] ?? report.top_teams[idx].name) : '—'}</td>
                <td>{report.top_teams[idx]?.count ?? '—'}</td>
              </tr>
            ))}
          </tbody></table>
        </div>

        {(report.best_performing_entities.length > 0 || report.worst_performing_entities.length > 0) && (
          <div className="print-section">
            <h3 className="print-section-title">أفضل / أضعف الجهات أداءً</h3>
            <table className="print-table"><thead><tr><th>أفضل جهات</th><th>منجز</th><th>أضعف جهات</th><th>منجز</th></tr></thead><tbody>
              {Array.from({ length: Math.max(report.best_performing_entities.length, report.worst_performing_entities.length, 1) }).map((_, idx) => (
                <tr key={idx}><td>{report.best_performing_entities[idx]?.name || '—'}</td><td>{report.best_performing_entities[idx]?.count ?? '—'}</td><td>{report.worst_performing_entities[idx]?.name || '—'}</td><td>{report.worst_performing_entities[idx]?.count ?? '—'}</td></tr>
              ))}
            </tbody></table>
          </div>
        )}

        <div className="print-section">
          <h3 className="print-section-title">توزيع الحالات</h3>
          <table className="print-table"><thead><tr><th>الحالة</th><th>العدد</th></tr></thead><tbody>
            {report.by_status.map((s) => <tr key={s.name}><td>{STATUSES[s.name as keyof typeof STATUSES] ?? s.name}</td><td>{s.count}</td></tr>)}
          </tbody></table>
        </div>

        <div className="print-footer"><p>طُبع بتاريخ: {formatDate(new Date().toISOString())}</p></div>
      </div>
    </div>
  )
}
