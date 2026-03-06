import { useEffect } from 'react'
import { CATEGORIES, STATUSES, RESPONSIBLE_TEAMS, formatDate } from '@/lib/constants'
import type { MonthlyReport } from '@/lib/api'

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

const REPORT_TYPE_LABELS: Record<string, string> = {
  district: 'تقرير الحي',
  municipality: 'تقرير البلدية',
  governorate: 'تقرير المحافظة',
}

interface PrintReportProps {
  report: MonthlyReport
  reportType: 'district' | 'municipality' | 'governorate'
  onClose: () => void
}

export function PrintReport({ report, reportType, onClose }: PrintReportProps) {
  const monthName = ARABIC_MONTHS[report.period.month - 1]
  const reportTitle = `${REPORT_TYPE_LABELS[reportType]} — ${monthName} ${report.period.year}`

  useEffect(() => {
    document.title = reportTitle
    return () => {
      document.title = 'نظام الشكاوى البلدية'
    }
  }, [reportTitle])

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="print-overlay" dir="rtl" lang="ar">
      {/* Screen-only controls */}
      <div className="print-controls no-print">
        <button onClick={handlePrint} className="print-btn-primary">
          🖨️ طباعة
        </button>
        <button onClick={onClose} className="print-btn-secondary">
          ✕ إغلاق
        </button>
      </div>

      {/* Printable content */}
      <div className="print-content">
        {/* Header */}
        <div className="print-header">
          <h1 className="print-title">نظام الشكاوى البلدية</h1>
          <h2 className="print-subtitle">{REPORT_TYPE_LABELS[reportType]}</h2>
          <p className="print-period">{monthName} {report.period.year}</p>
        </div>

        <hr className="print-divider" />

        {/* Summary stats */}
        <div className="print-section">
          <h3 className="print-section-title">ملخص الإحصاءات</h3>
          <table className="print-table print-stats-table">
            <tbody>
              <tr>
                <th>إجمالي الشكاوى</th>
                <td className="print-stat-value">{report.total}</td>
                <th>مفتوحة</th>
                <td className="print-stat-value">{report.open}</td>
              </tr>
              <tr>
                <th>قيد المعالجة</th>
                <td className="print-stat-value">{report.in_progress}</td>
                <th>منجزة</th>
                <td className="print-stat-value">{report.resolved}</td>
              </tr>
              <tr>
                <th>عاجلة</th>
                <td className="print-stat-value">{report.urgent}</td>
                <th>متأخّرة</th>
                <td className="print-stat-value">{report.overdue}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Highlights */}
        {(report.most_common_category || report.most_assigned_team || report.top_district) && (
          <div className="print-section">
            <h3 className="print-section-title">أبرز المؤشرات</h3>
            <table className="print-table">
              <tbody>
                {report.most_common_category && (
                  <tr>
                    <th>أكثر الفئات تكراراً</th>
                    <td>
                      {CATEGORIES[report.most_common_category as keyof typeof CATEGORIES] ?? report.most_common_category}
                    </td>
                  </tr>
                )}
                {report.most_assigned_team && (
                  <tr>
                    <th>أكثر الفرق نشاطاً</th>
                    <td>
                      {RESPONSIBLE_TEAMS[report.most_assigned_team] ?? report.most_assigned_team}
                    </td>
                  </tr>
                )}
                {report.top_district && (
                  <tr>
                    <th>أكثر الأحياء شكاوى</th>
                    <td>{report.top_district}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* By category */}
        {report.by_category.length > 0 && (
          <div className="print-section">
            <h3 className="print-section-title">توزيع الشكاوى حسب الفئة</h3>
            <table className="print-table">
              <thead>
                <tr>
                  <th>الفئة</th>
                  <th>العدد</th>
                </tr>
              </thead>
              <tbody>
                {report.by_category.map((entry) => (
                  <tr key={entry.name}>
                    <td>{CATEGORIES[entry.name as keyof typeof CATEGORIES] ?? entry.name}</td>
                    <td className="print-stat-value">{entry.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* By status */}
        {report.by_status.length > 0 && (
          <div className="print-section">
            <h3 className="print-section-title">توزيع الشكاوى حسب الحالة</h3>
            <table className="print-table">
              <thead>
                <tr>
                  <th>الحالة</th>
                  <th>العدد</th>
                </tr>
              </thead>
              <tbody>
                {report.by_status.map((entry) => (
                  <tr key={entry.name}>
                    <td>{STATUSES[entry.name as keyof typeof STATUSES] ?? entry.name}</td>
                    <td className="print-stat-value">{entry.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="print-footer">
          <p>طُبع بتاريخ: {formatDate(new Date().toISOString())}</p>
        </div>
      </div>
    </div>
  )
}
