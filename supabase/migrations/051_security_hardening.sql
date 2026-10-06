-- Migration 051: Security hardening — advisor findings
--
-- Fixes applied:
-- 1. vendor_balances view: SECURITY DEFINER → SECURITY INVOKER
--    (was running as DB owner, bypassing RLS on underlying tables)
-- 2. 3 trigger functions: add SET search_path = public to prevent search_path hijacking
-- 3. organization_users INSERT policies: drop the open ou_insert policy that let
--    any authenticated user self-insert into ANY org. All legitimate inserts go
--    through SECURITY DEFINER RPCs (create_organization, accept_invitation) that
--    bypass RLS anyway — the client-side policies were unnecessary and dangerous.
-- 4. subscription_events: add SELECT policy (RLS was enabled but no policies existed,
--    so nobody could read subscription history at all)
-- 5. Revoke anon EXECUTE from action RPCs that should require authentication
-- 6. Revoke anon+authenticated EXECUTE from admin_update_plan (service_role only)
-- 7. RLS initplan: wrap auth.uid() in (SELECT ...) in 3 policies that re-evaluated
--    it per row — each call otherwise re-runs the auth lookup for every scanned row

-- ── 1. vendor_balances: SECURITY DEFINER → SECURITY INVOKER ─────────────────
-- With SECURITY INVOKER the view runs as the querying user so RLS on vendors,
-- sales, and cash_collection applies automatically. Data is already org-filtered
-- by the JOIN conditions, so results are identical — but RLS adds a second layer.
ALTER VIEW vendor_balances SET (security_invoker = true);

-- ── 2. Trigger functions: add SET search_path = public ───────────────────────
CREATE OR REPLACE FUNCTION enforce_farm_limit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_max integer; v_count integer;
BEGIN
  SELECT p.max_farms INTO v_max
    FROM organizations o JOIN plans p ON p.key = o.subscription_plan
    WHERE o.id = NEW.organization_id;
  IF v_max IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM farms WHERE organization_id = NEW.organization_id;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'FARM_LIMIT_REACHED: Your plan allows up to % farm(s). Upgrade the plan to add more.', v_max
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_user_limit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_max integer; v_count integer;
BEGIN
  IF NEW.is_active IS NOT TRUE THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active IS TRUE THEN RETURN NEW; END IF;
  SELECT p.max_users INTO v_max
    FROM organizations o JOIN plans p ON p.key = o.subscription_plan
    WHERE o.id = NEW.organization_id;
  IF v_max IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM organization_users
    WHERE organization_id = NEW.organization_id AND is_active = true;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'USER_LIMIT_REACHED: Your plan allows up to % user(s). Upgrade the plan to add more.', v_max
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_inuse_plan_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM organizations o WHERE o.subscription_plan = OLD.key) THEN
    RAISE EXCEPTION 'PLAN_IN_USE: Cannot delete plan "%" — organizations are using it. Move them to another plan first.', OLD.key
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

-- ── 3. organization_users INSERT policies ────────────────────────────────────
-- ou_insert (user_id = auth.uid()) let any authenticated user self-insert into
-- ANY organization — a real privilege escalation hole. Drop both INSERT policies;
-- all inserts are handled by SECURITY DEFINER RPCs that bypass RLS.
DROP POLICY IF EXISTS "ou_insert" ON organization_users;
DROP POLICY IF EXISTS "ou_insert_via_invite" ON organization_users;

-- ── 4. subscription_events: add org-scoped SELECT policy ─────────────────────
-- RLS was enabled with no policies → nobody could read subscription events at all.
CREATE POLICY "se_select_org" ON subscription_events FOR SELECT
  USING (organization_id = get_user_organization_id());

-- ── 5. Revoke anon EXECUTE from action RPCs ───────────────────────────────────
-- These functions require an authenticated session; anon access is unintentional.
REVOKE EXECUTE ON FUNCTION confirm_sale(uuid, text)                          FROM anon;
REVOKE EXECUTE ON FUNCTION delete_batch(uuid, uuid)                          FROM anon;
REVOKE EXECUTE ON FUNCTION delete_procurement(uuid, uuid)                    FROM anon;
REVOKE EXECUTE ON FUNCTION reject_cash_collection(uuid, text, text)          FROM anon;
REVOKE EXECUTE ON FUNCTION verify_cash_collection(uuid, uuid, text)          FROM anon;
REVOKE EXECUTE ON FUNCTION seed_org_defaults()                               FROM anon;
REVOKE EXECUTE ON FUNCTION seed_system_item_types(uuid)                      FROM anon;
REVOKE EXECUTE ON FUNCTION create_organization(text, uuid, text)             FROM anon;
REVOKE EXECUTE ON FUNCTION change_organization_plan(uuid, uuid, text, text)  FROM anon;
REVOKE EXECUTE ON FUNCTION get_user_organization_id()                        FROM anon;
REVOKE EXECUTE ON FUNCTION get_user_role()                                   FROM anon;

-- ── 6. admin_update_plan: revoke from anon AND authenticated ─────────────────
-- This is an admin-only operation; only service_role (backend) should call it.
REVOKE EXECUTE ON FUNCTION admin_update_plan(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION admin_update_plan(uuid, text, text) FROM authenticated;

-- ── 7. RLS initplan: wrap auth.uid() in (SELECT ...) ─────────────────────────
-- auth.uid() re-evaluates per scanned row without the SELECT wrapper.
-- Wrapping it makes PostgreSQL evaluate it once and cache the result.

-- cash_collection: cc_update
DROP POLICY IF EXISTS "cc_update" ON cash_collection;
CREATE POLICY "cc_update" ON cash_collection FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND (
      (collected_by_id = (SELECT auth.uid()) AND status = 'pending')
      OR get_user_role() = ANY (ARRAY['owner','accountant'])
    )
  );

-- cash_collection: cc_delete
DROP POLICY IF EXISTS "cc_delete" ON cash_collection;
CREATE POLICY "cc_delete" ON cash_collection FOR DELETE
  USING (
    organization_id = get_user_organization_id()
    AND (
      (collected_by_id = (SELECT auth.uid()) AND status = 'pending')
      OR get_user_role() = 'owner'
    )
  );

-- batch_chick_purchases: replace subquery policy with consistent get_user_organization_id()
DROP POLICY IF EXISTS "org members can manage batch_chick_purchases" ON batch_chick_purchases;
CREATE POLICY "bcp_org_manage" ON batch_chick_purchases FOR ALL
  USING (organization_id = get_user_organization_id());
