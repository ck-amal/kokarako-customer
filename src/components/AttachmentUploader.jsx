import { useEffect, useState } from 'react'
import { ACCEPT, isImage } from '../lib/attachments'

// Controlled file picker for NEW records: the parent holds the pending files
// (value: File[]) and uploads them on save via uploadAttachments(). On a phone
// browser the picker offers camera + gallery + files; on desktop, a file dialog.
export default function AttachmentUploader({ value = [], onChange, label = 'Attachments', max = 8 }) {
  const [previews, setPreviews] = useState([])

  // Object URLs for image previews (revoked on change/unmount)
  useEffect(() => {
    const urls = value.map(f => (isImage(f) ? URL.createObjectURL(f) : null))
    setPreviews(urls)
    return () => urls.forEach(u => u && URL.revokeObjectURL(u))
  }, [value])

  function addFiles(e) {
    const picked = Array.from(e.target.files || [])
    e.target.value = '' // let the user re-pick the same file
    if (picked.length) onChange([...value, ...picked].slice(0, max))
  }
  function removeAt(i) {
    onChange(value.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} <span className="text-gray-400 font-normal">({value.length}/{max})</span>
      </label>

      <div className="flex flex-wrap gap-2">
        {value.map((f, i) => (
          <div key={i} className="relative h-20 w-20 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center">
            {previews[i]
              ? <img src={previews[i]} alt={f.name} className="h-full w-full object-cover" />
              : <span className="text-[10px] font-semibold text-gray-500">{f.type === 'application/pdf' ? 'PDF' : 'FILE'}</span>}
            <button type="button" onClick={() => removeAt(i)}
              title="Remove"
              className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 hover:bg-black/80 text-white text-xs leading-none flex items-center justify-center">×</button>
          </div>
        ))}

        {value.length < max && (
          <label className="h-20 w-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-amber-400 text-gray-400 hover:text-amber-500 transition">
            <span className="text-2xl leading-none">+</span>
            <span className="text-[10px]">Add</span>
            <input type="file" accept={ACCEPT} multiple onChange={addFiles} className="hidden" />
          </label>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-1">Images or PDF, up to 10 MB each.</p>
    </div>
  )
}
