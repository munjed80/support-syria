import { useEffect, useMemo } from 'react'
import { CATEGORIES, STATUSES, PRIORITIES, RESPONSIBLE_TEAMS, formatDate } from '@/lib/constants'
import type { ServiceRequest, RequestUpdate, MaterialUsed, District, Attachment } from '@/lib/types'

interface PrintComplaintProps {
  request: ServiceRequest
  updates: RequestUpdate[]
  materials: MaterialUsed[]
  attachments?: Attachment[]
  districts?: District[]
  onClose: () => void
}

const ENTRY_HINTS = ['مختار', 'مواطن', 'إداري', 'عام']

export function PrintComplaint({ request, updates, materials, attachments, districts, onClose }: PrintComplaintProps) {
  const district = (districts || []).find((d) => d.id === request.districtId)
  const sortedUpdates = useMemo(() => [...updates].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [updates])
  const enteredByRaw = sortedUpdates.find((u) => u.toStatus === 'new' && !u.isAutoEscalation)?.actorName || sortedUpdates[0]?.actorName || 'غير محدد'
  const enteredBy = ENTRY_HINTS.find((x) => enteredByRaw.includes(x)) ? enteredByRaw : enteredByRaw
  const timeline = [...sortedUpdates].reverse()

  useEffect(() => {
    document.title = `سجل شكوى ${request.complaintNumber ?? request.trackingCode}`
    return () => { document.title = 'نظام الشكاوى البلدية' }
  }, [request])

  return (
    <div className="print-overlay" dir="rtl" lang="ar">
      <div className="print-controls no-print">
        <button onClick={() => window.print()} className="print-btn-primary">🖨️ طباعة</button>
        <button onClick={onClose} className="print-btn-secondary">✕ إغلاق</button>
      </div>

      <div className="print-content">
        <div className="print-header">
          <h1 className="print-title">الجمهورية العربية السورية — سجل شكوى بلدي رسمي</h1>
          <h2 className="print-subtitle">وثيقة متابعة خدمية</h2>
        </div>

        <div className="print-grid-2">
          <div className="print-field"><span className="print-label">المحافظة:</span><span className="print-value">{request.governorateName || '—'}</span></div>
          <div className="print-field"><span className="print-label">البلدية:</span><span className="print-value">{request.municipalityName || '—'}</span></div>
          <div className="print-field"><span className="print-label">الحي:</span><span className="print-value">{request.districtName ?? district?.name ?? '—'}</span></div>
          <div className="print-field"><span className="print-label">رقم الشكوى:</span><span className="print-value print-mono">{request.complaintNumber || '—'}</span></div>
          <div className="print-field"><span className="print-label">رمز التتبع:</span><span className="print-value print-mono">{request.trackingCode}</span></div>
          <div className="print-field"><span className="print-label">الفئة:</span><span className="print-value">{CATEGORIES[request.category]}</span></div>
          <div className="print-field"><span className="print-label">الأولوية:</span><span className="print-value">{PRIORITIES[request.priority]}</span></div>
          <div className="print-field"><span className="print-label">الحالة:</span><span className="print-value">{STATUSES[request.status]}</span></div>
          <div className="print-field"><span className="print-label">العنوان:</span><span className="print-value">{request.addressText || '—'}</span></div>
          <div className="print-field"><span className="print-label">الفريق المكلّف:</span><span className="print-value">{request.responsibleTeamName || (request.responsibleTeam ? (RESPONSIBLE_TEAMS[request.responsibleTeam] ?? request.responsibleTeam) : '—')}</span></div>
          <div className="print-field"><span className="print-label">قائد الفريق:</span><span className="print-value">{request.responsibleTeamLeaderName || '—'}</span></div>
          <div className="print-field"><span className="print-label">هاتف القائد:</span><span className="print-value">{request.responsibleTeamLeaderPhone || '—'}</span></div>
          <div className="print-field"><span className="print-label">تاريخ الإنشاء:</span><span className="print-value">{formatDate(request.createdAt)}</span></div>
          <div className="print-field"><span className="print-label">تاريخ الإغلاق:</span><span className="print-value">{request.closedAt ? formatDate(request.closedAt) : '—'}</span></div>
          <div className="print-field"><span className="print-label">أُدخلت بواسطة:</span><span className="print-value">{enteredBy}</span></div>
        </div>

        <hr className="print-divider" />
        <div className="print-section"><h3 className="print-section-title">وصف الشكوى</h3><p className="print-body-text">{request.description}</p></div>

        {request.status === 'resolved' && (
          <div className="print-section">
            <h3 className="print-section-title">بيانات الإغلاق</h3>
            <p className="print-body-text">ملاحظة الإنجاز: {request.completionNote || '—'}</p>
            {request.completionPhotoUrl && <img src={request.completionPhotoUrl} alt="صورة الإنجاز" className="print-photo" />}
          </div>
        )}

        {request.status === 'rejected' && request.rejectionReason && (
          <div className="print-section"><h3 className="print-section-title">سبب الرفض</h3><p className="print-body-text">{request.rejectionReason}</p></div>
        )}

        {(attachments ?? []).length > 0 && (
          <div className="print-section">
            <h3 className="print-section-title">المرفقات / الصور</h3>
            <div className="print-photos-grid">{(attachments ?? []).map((a) => <img key={a.id} src={a.fileUrl} alt={a.fileName} className="print-photo" />)}</div>
          </div>
        )}

        {materials.length > 0 && (
          <div className="print-section">
            <h3 className="print-section-title">المواد المستخدمة</h3>
            <table className="print-table"><thead><tr><th>المادة</th><th>الكمية</th><th>ملاحظات</th></tr></thead><tbody>{materials.map((m) => <tr key={m.id}><td>{m.name}</td><td>{m.quantity}</td><td>{m.notes || '—'}</td></tr>)}</tbody></table>
          </div>
        )}

        <div className="print-section">
          <h3 className="print-section-title">السجل الزمني الكامل</h3>
          <table className="print-table">
            <thead><tr><th>الوقت</th><th>الفاعل</th><th>الحدث</th><th>التفاصيل</th></tr></thead>
            <tbody>
              {timeline.map((u) => (
                <tr key={u.id}>
                  <td className="print-mono">{formatDate(u.createdAt)}</td>
                  <td>{u.isAutoEscalation ? 'النظام' : (u.actorName || '—')}</td>
                  <td>{u.eventType || (u.toStatus ? 'تغيير حالة' : u.toPriority ? 'تغيير أولوية' : 'تحديث')}</td>
                  <td>{u.message || [u.fromStatus && u.toStatus ? `${STATUSES[u.fromStatus]} ← ${STATUSES[u.toStatus]}` : '', u.toPriority ? `الأولوية: ${PRIORITIES[u.toPriority]}` : ''].filter(Boolean).join(' | ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="print-footer"><p>طُبع بتاريخ: {formatDate(new Date().toISOString())}</p></div>
      </div>
    </div>
  )
}
