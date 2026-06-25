import { useState } from 'react'
import { useTranslation } from 'react-i18next'

function fmt(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

export default function AuditInfo({ createdByName, createdAt, updatedByName, updatedAt }) {
  const { t } = useTranslation()
  const [show, setShow] = useState(false)

  if (!createdByName && !createdAt) return null

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="text-gray-300 hover:text-gray-500 transition-colors align-middle"
        aria-label={t('audit.createdBy')}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {show && (
        <div className="absolute z-50 right-6 top-1/2 -translate-y-1/2 w-52
                        bg-gray-900 text-white text-xs rounded-lg shadow-xl px-3 py-2.5
                        pointer-events-none">
          <div className="space-y-1.5">
            <div>
              <p className="text-gray-400">{t('audit.createdBy')}</p>
              <p className="font-medium">{createdByName || t('audit.unknown')}</p>
              <p className="text-gray-400">{fmt(createdAt)}</p>
            </div>
            {updatedByName && (
              <div className="border-t border-gray-700 pt-1.5">
                <p className="text-gray-400">{t('audit.updatedBy')}</p>
                <p className="font-medium">{updatedByName}</p>
                <p className="text-gray-400">{fmt(updatedAt)}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
