import { supabase } from './supabaseClient'

// Reusable, org-scoped attachments backed by the private 'attachments' bucket.
// The DB row (table `attachments`) stores metadata + the object path; we mint
// short-lived signed URLs for viewing. See migrations/026_attachments.sql.

const BUCKET        = 'attachments'
const MAX_IMAGE_DIM = 1600   // longest edge after resize
const IMAGE_QUALITY = 0.7

export const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf'

export function isImage(file) {
  return !!file?.type?.startsWith('image/')
}

// Resize + re-encode an image to keep storage / egress small. HEIC/HEIF (which
// the canvas can't reliably decode) and non-images pass through untouched.
export async function compressImage(file) {
  if (!isImage(file) || file.type === 'image/heic' || file.type === 'image/heif') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale  = Math.min(1, MAX_IMAGE_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', IMAGE_QUALITY))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

function extOf(name = '', type = '') {
  const m = /\.(\w+)$/.exec(name)
  if (m) return m[1].toLowerCase()
  if (type === 'application/pdf') return 'pdf'
  if (type.startsWith('image/')) return type.split('/')[1]
  return 'bin'
}

// Compress (images), upload each File, and create an `attachments` row per file.
// Returns the created rows. Throws on the first failure (cleaning up its object).
export async function uploadAttachments({ organizationId, entityType, entityId, files, user }) {
  const created = []
  for (const raw of files) {
    const file = isImage(raw) ? await compressImage(raw) : raw
    const path = `${organizationId}/${entityType}/${entityId}/${crypto.randomUUID()}.${extOf(file.name, file.type)}`

    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })
    if (upErr) throw new Error(upErr.message)

    const { data, error: rowErr } = await supabase.from('attachments').insert({
      organization_id:  organizationId,
      entity_type:      entityType,
      entity_id:        entityId,
      file_path:        path,
      file_name:        raw.name,
      file_type:        file.type,
      file_size:        file.size,
      kind:             isImage(raw) ? 'image' : 'document',
      uploaded_by_id:   user?.id,
      uploaded_by_name: user?.user_metadata?.full_name || user?.email || null,
    }).select('*').single()

    if (rowErr) {
      await supabase.storage.from(BUCKET).remove([path]) // best-effort cleanup
      throw new Error(rowErr.message)
    }
    created.push(data)
  }
  return created
}

// All attachment rows for one entity.
export async function listAttachments(entityType, entityId, organizationId) {
  const { data } = await supabase.from('attachments')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at')
  return data || []
}

// All attachment rows for many entities of one type, grouped by entity_id.
export async function attachmentsByEntity(entityType, entityIds, organizationId) {
  const map = {}
  if (!entityIds?.length) return map
  const { data } = await supabase.from('attachments')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('entity_type', entityType)
    .in('entity_id', entityIds)
  for (const a of data || []) (map[a.entity_id] ||= []).push(a)
  return map
}

// Short-lived signed URL for viewing/downloading a private object.
export async function signedUrl(path, expiresIn = 3600) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn)
  return data?.signedUrl || null
}

// Open an attachment in a new tab (resolves a fresh signed URL first).
export async function openAttachment(att) {
  const url = await signedUrl(att.file_path)
  if (url) window.open(url, '_blank', 'noopener')
}

export async function deleteAttachment(att) {
  await supabase.storage.from(BUCKET).remove([att.file_path])
  await supabase.from('attachments').delete().eq('id', att.id)
}
