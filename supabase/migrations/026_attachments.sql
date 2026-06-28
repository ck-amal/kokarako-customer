-- ─── 026 · Attachments (polymorphic file / image uploads) ───────────────────
-- Reusable, org-scoped attachments for ANY entity (procurement, expense, batch…).
-- Files live in the private Storage bucket 'attachments'; this table holds the
-- metadata + the storage path. Run in the SQL Editor on khbuypzugydxvejjcoam.
-- Idempotent.

-- 1. Table ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attachments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type      TEXT        NOT NULL,          -- 'procurement' | 'expense' | 'batch' | …
  entity_id        UUID        NOT NULL,
  file_path        TEXT        NOT NULL,          -- object path in the bucket
  file_name        TEXT,
  file_type        TEXT,                          -- mime type
  file_size        BIGINT,                        -- bytes
  kind             TEXT,                          -- 'image' | 'document'
  uploaded_by_id   UUID,
  uploaded_by_name TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attachments_entity
  ON attachments(organization_id, entity_type, entity_id);

-- 2. RLS — same org-scoping helper used across the app ────────────────────────
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attachments_select" ON attachments;
CREATE POLICY "attachments_select" ON attachments FOR SELECT
  USING (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS "attachments_insert" ON attachments;
CREATE POLICY "attachments_insert" ON attachments FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS "attachments_delete" ON attachments;
CREATE POLICY "attachments_delete" ON attachments FOR DELETE
  USING (organization_id = get_user_organization_id());

-- 3. Private Storage bucket (10 MB cap, images + PDF) ─────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments', 'attachments', false, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public             = EXCLUDED.public;

-- 4. Storage object policies — a user may only touch objects under their org's
--    folder. Path convention: {organization_id}/{entity_type}/{entity_id}/{file}
DROP POLICY IF EXISTS "attachments_obj_select" ON storage.objects;
CREATE POLICY "attachments_obj_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = get_user_organization_id()::text);

DROP POLICY IF EXISTS "attachments_obj_insert" ON storage.objects;
CREATE POLICY "attachments_obj_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1] = get_user_organization_id()::text);

DROP POLICY IF EXISTS "attachments_obj_delete" ON storage.objects;
CREATE POLICY "attachments_obj_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = get_user_organization_id()::text);
