import { useEffect } from 'react'
import {
  CATEGORIES,
  STATUSES,
  PRIORITIES,
  RESPONSIBLE_TEAMS,
  formatDate,
} from '@/lib/constants'
import type { ServiceRequest, RequestUpdate, MaterialUsed, District } from '@/lib/types'

interface PrintComplaintProps {
  request: ServiceRequest
  updates: RequestUpdate[]
  materials: MaterialUsed[]
  districts?: District[]
  onClose: () => void
}

export function PrintComplaint({ request, updates, materials, districts, onClose }: PrintComplaintProps) {
  const district = (districts || []).find((d) => d.id === request.districtId)

  useEffect(() => {
    document.title = `شكوى رقم ${request.complaintNumber ?? request.trackingCode}`
    return () => {
      document.title = 'نظام الشكاوى البلدية'
    }
  }, [request])

  const handlePrint = () => {
    window.print()
  }

  const internalNotes = updates.filter((update) => update.isInternal && update.message)
  const timelineUpdates = updates.filter((update) => update.toStatus || update.toPriority || update.isAutoEscalation)

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
          <h2 className="print-subtitle">تفاصيل الشكوى</h2>
        </div>

        {/* Identity row */}
        <div className="print-identity-row">
          {request.complaintNumber && (
            <div className="print-identity-item">
              <span className="print-label">رقم الشكوى:</span>
              <span className="print-value print-mono">{request.complaintNumber}</span>
            </div>
          )}
          <div className="print-identity-item">
            <span className="print-label">رمز التتبع:</span>
            <span className="print-value print-mono">{request.trackingCode}</span>
          </div>
          <div className="print-identity-item">
            <span className="print-label">تاريخ الإنشاء:</span>
            <span className="print-value">{formatDate(request.createdAt)}</span>
          </div>
        </div>

        <hr className="print-divider" />

        {/* Main details grid */}
        <div className="print-grid-2">
          <div className="print-field">
            <span className="print-label">الفئة:</span>
            <span className="print-value">{CATEGORIES[request.category]}</span>
          </div>
          <div className="print-field">
            <span className="print-label">الأولوية:</span>
            <span className="print-value">{PRIORITIES[request.priority]}</span>
          </div>
          <div className="print-field">
            <span className="print-label">الحالة:</span>
            <span className="print-value">{STATUSES[request.status]}</span>
          </div>
          {district && (
            <div className="print-field">
              <span className="print-label">الحي:</span>
              <span className="print-value">{district.name}</span>
            </div>
          )}
          {request.responsibleTeam && (
            <div className="print-field">
              <span className="print-label">الفريق المسؤول:</span>
              <span className="print-value">
                {RESPONSIBLE_TEAMS[request.responsibleTeam] ?? request.responsibleTeam}
              </span>
            </div>
          )}
          {request.assignedToName && (
            <div className="print-field">
              <span className="print-label">المكلف:</span>
              <span className="print-value">{request.assignedToName}</span>
            </div>
          )}
        </div>

        <hr className="print-divider" />

        {/* Description */}
        <div className="print-section">
          <h3 className="print-section-title">الوصف</h3>
          <p className="print-body-text">{request.description}</p>
        </div>

        {/* Location */}
        {request.addressText && (
          <div className="print-section">
            <h3 className="print-section-title">الموقع / العنوان</h3>
            <p className="print-body-text">{request.addressText}</p>
          </div>
        )}

        {/* Materials used */}
        {materials.length > 0 && (
          <div className="print-section">
            <h3 className="print-section-title">المواد المستخدمة</h3>
            <table className="print-table">
              <thead>
                <tr>
                  <th>المادة</th>
                  <th>الكمية</th>
                  <th>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td>{m.quantity}</td>
                    <td>{m.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Internal notes summary */}
        {internalNotes.length > 0 && (
          <div className="print-section">
            <h3 className="print-section-title">ملخص الملاحظات الداخلية</h3>
            <div className="print-notes-list">
              {internalNotes.map((update) => (
                <div key={update.id} className="print-note-item">
                  <span className="print-note-date">{formatDate(update.createdAt)}</span>
                  {update.actorName && (
                    <span className="print-note-author"> — {update.actorName}</span>
                  )}
                  <p className="print-note-text">{update.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completion photo */}
        {request.completionPhotoUrl && (
          <div className="print-section">
            <h3 className="print-section-title">صورة بعد الإنجاز</h3>
            <img
              src={request.completionPhotoUrl}
              alt="صورة بعد الإنجاز"
              className="print-photo"
            />
          </div>
        )}

        {/* Timeline */}
        {timelineUpdates.length > 0 && (
          <div className="print-section">
            <h3 className="print-section-title">السجل الزمني</h3>
            <table className="print-table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>بواسطة</th>
                  <th>التغيير</th>
                  <th>ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {[...timelineUpdates].reverse().map((update) => (
                  <tr key={update.id}>
                    <td className="print-mono" style={{ whiteSpace: 'nowrap' }}>
                      {formatDate(update.createdAt)}
                    </td>
                    <td>{update.isAutoEscalation ? 'النظام الآلي' : (update.actorName ?? '—')}</td>
                    <td>
                      {update.toStatus && `${STATUSES[update.toStatus]}`}
                      {update.toPriority && `أولوية: ${PRIORITIES[update.toPriority]}`}
                      {update.isAutoEscalation && !update.toStatus && !update.toPriority && 'ترقية تلقائية'}
                    </td>
                    <td>{update.message ?? '—'}</td>
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
