import { useEffect, useState } from 'react'
import { signedUrl, deleteAttachment } from '../lib/attachments'

// Modal that previews ALL attachments for an entity. Images render as thumbnails
// (click → open full in a new tab); PDFs/other render as file cards. Reusable.
export default function AttachmentViewer({ attachments = [], title = 'Attachments', header = null, onClose, onDeleted, canDelete = false }) {
  const [urls, setUrls]       = useState({})   // attachment.id -> signed url
  const [busyId, setBusyId]   = useState(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const entries = await Promise.all(
        attachments.map(async a => [a.id, await signedUrl(a.file_path)])
      )
      if (active) setUrls(Object.fromEntries(entries))
    })()
    return () => { active = false }
  }, [attachments])

  async function handleDelete(a) {
    if (!window.confirm('Delete this file? This cannot be undone.')) return
    setBusyId(a.id)
    try {
      await deleteAttachment(a)
      onDeleted?.(a)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {header && <div className="mb-5">{header}</div>}

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Attachments ({attachments.length})</p>

        {attachments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No files attached.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {attachments.map(a => {
              const url   = urls[a.id]
              const isImg = a.kind === 'image' || a.file_type?.startsWith('image/')
              return (
                <div key={a.id} className="rounded-lg border border-gray-200 overflow-hidden flex flex-col">
                  <a href={url || undefined} target="_blank" rel="noopener noreferrer"
                    className="h-32 bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition">
                    {isImg && url
                      ? <img src={url} alt={a.file_name || 'image'} className="h-full w-full object-cover" />
                      : (
                        <div className="flex flex-col items-center text-gray-500">
                          <span className="text-3xl">📄</span>
                          <span className="text-[10px] mt-1 font-semibold">{a.file_type === 'application/pdf' ? 'PDF' : 'FILE'}</span>
                        </div>
                      )}
                  </a>
                  <div className="px-2 py-1.5 flex items-center justify-between gap-1">
                    <span className="text-xs text-gray-600 truncate" title={a.file_name || ''}>{a.file_name || 'file'}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a href={url || undefined} target="_blank" rel="noopener noreferrer" title="Open"
                        className="text-amber-500 hover:text-amber-600 text-sm leading-none">↗</a>
                      {canDelete && (
                        <button type="button" onClick={() => handleDelete(a)} disabled={busyId === a.id}
                          title="Delete" className="text-gray-400 hover:text-red-600 disabled:opacity-50 text-sm leading-none">🗑</button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
