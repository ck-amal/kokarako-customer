-- ============================================================================
-- Migration 029 — accept_invitation() RPC
-- Run on the app DB (khbuypzugydxvejjcoam).
--
-- Lets an EXISTING, already-signed-in user accept a team invitation and join a
-- NEW organisation — the "employee resigned from org A and is invited to org B
-- with the same email" case. The web (InviteAccept.jsx) and mobile
-- (InviteAcceptScreen.js) both already call supabase.rpc('accept_invitation',
-- { p_token, p_user_id }); this provides the function they were calling.
--
-- SECURITY DEFINER so it can insert the membership AND mark the invite consumed
-- atomically. It trusts auth.uid()/auth.email() — NOT the passed p_user_id — so a
-- signed-in user can only accept an invitation addressed to their OWN email.
-- A user keeps a single login and can belong to many orgs; this never touches
-- their memberships in other organisations.
-- ============================================================================

CREATE OR REPLACE FUNCTION accept_invitation(p_token text, p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text := auth.email();
  inv     record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'You must be signed in to accept an invitation.');
  END IF;

  -- 1. Look up the invitation by token
  SELECT id, organization_id, email, role, expires_at, accepted_at
    INTO inv
    FROM invitations
   WHERE token = p_token;

  IF inv.id IS NULL THEN
    RETURN jsonb_build_object('error', 'This invitation link is invalid.');
  END IF;
  IF inv.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'This invitation has already been used.');
  END IF;
  IF inv.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'This invitation has expired.');
  END IF;

  -- 2. The signed-in account must own the invited email (case-insensitive).
  --    Stops a logged-in user from claiming someone else's invitation.
  IF lower(coalesce(v_email, '')) IS DISTINCT FROM lower(inv.email) THEN
    RETURN jsonb_build_object(
      'error',
      'This invitation is for ' || inv.email ||
      '. Please sign in with that email address to accept it.'
    );
  END IF;

  -- 3. Add — or re-activate — the membership for the NEW org. If this user was
  --    previously a member of THIS org (e.g. rejoining), flip them back to active
  --    with the invited role instead of erroring on a duplicate row.
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
