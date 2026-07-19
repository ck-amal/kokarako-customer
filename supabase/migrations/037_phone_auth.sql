-- ============================================================================
-- Migration 037 — Phone-based authentication
--
-- Switches invitations from email to phone. Updates accept_invitation() to
-- validate the caller's phone (from auth.users) instead of their email.
-- Run on khbuypzugydxvejjcoam (dev) and thekzwqdjlfssjshffto (prod).
-- ============================================================================

-- 1. Add phone column to invitations; make email nullable (legacy rows keep email)
ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE invitations
  ALTER COLUMN email DROP NOT NULL;

-- 2. Replace accept_invitation() to match on phone instead of email
CREATE OR REPLACE FUNCTION accept_invitation(p_token text, p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_phone text;
  inv     record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'You must be signed in to accept an invitation.');
  END IF;

  -- 1. Look up the invitation by token
  SELECT id, organization_id, phone, role, expires_at, accepted_at
    INTO inv
    FROM invitations
   WHERE token = p_token;

  IF inv.id IS NULL THEN
    RETURN jsonb_build_object('error', 'This invitation code is invalid.');
  END IF;
  IF inv.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'This invitation has already been used.');
  END IF;
  IF inv.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'This invitation has expired.');
  END IF;

  -- 2. The signed-in phone must match the invited phone.
  --    Stops a logged-in user from claiming someone else's invitation.
  SELECT phone INTO v_phone FROM auth.users WHERE id = v_uid;

  IF inv.phone IS NOT NULL AND v_phone IS DISTINCT FROM inv.phone THEN
    RETURN jsonb_build_object(
      'error',
      'This invitation is for a different phone number. Please sign in with the number this invitation was sent to.'
    );
  END IF;

  -- 3. Add — or re-activate — the membership for the org.
  IF EXISTS (
    SELECT 1 FROM organization_users
     WHERE organization_id = inv.organization_id AND user_id = v_uid
  ) THEN
    UPDATE organization_users
       SET role = inv.role, is_active = true, joined_at = now()
     WHERE organization_id = inv.organization_id AND user_id = v_uid;
  ELSE
    INSERT INTO organization_users (organization_id, user_id, role, is_active, joined_at)
    VALUES (inv.organization_id, v_uid, inv.role, true, now());
  END IF;

  -- 4. Consume the invitation
  UPDATE invitations SET accepted_at = now() WHERE id = inv.id;

  RETURN jsonb_build_object('success', true, 'organization_id', inv.organization_id);
END;
$$;

GRANT EXECUTE ON FUNCTION accept_invitation(text, uuid) TO authenticated;
