-- ============================================================================
-- Migration 025 — Razorpay subscription (autopay) support
-- Run after 024 on the project the app + admin share (khbuypzugydxvejjcoam).
-- ============================================================================

-- 1. Map each app plan + billing cycle → a Razorpay Plan id (created in the
--    Razorpay dashboard or via API). Set these in the admin Plans page.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS razorpay_plan_id_monthly text;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS razorpay_plan_id_yearly  text;

-- 2. Subscription tracking on the organisation.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS razorpay_customer_id     text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS razorpay_subscription_id text;
-- created | authenticated | active | pending | halted | cancelled | completed | expired
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_status      text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS current_period_end       timestamptz;
-- The plan/cycle being subscribed to; applied to subscription_plan only once the
-- webhook confirms the first successful charge (so unpaid selections don't unlock paid limits).
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pending_plan             text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pending_billing_period   text;

-- 3. Webhook event log — idempotency (dedupe by Razorpay event id) + audit trail.
CREATE TABLE IF NOT EXISTS subscription_events (
  id              text PRIMARY KEY,                                  -- Razorpay event id
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  subscription_id text,
  event_type      text,
  payload         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_events_sub_idx ON subscription_events(subscription_id);

-- Only the service role (webhook edge function) reads/writes this — RLS on, no client policies.
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
