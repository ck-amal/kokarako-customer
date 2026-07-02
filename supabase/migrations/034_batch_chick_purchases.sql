-- Dedicated table for chick purchases per batch.
-- Replaces the "Cost attribution" procurement records approach.
-- One row per purchase line (stock draw or inline purchase), never averaged cross-batch.

CREATE TABLE batch_chick_purchases (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  batch_id         uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  quantity         integer NOT NULL CHECK (quantity > 0),
  price_per_chick  numeric(12, 2) NOT NULL CHECK (price_per_chick >= 0),
  total_cost       numeric(12, 2) NOT NULL CHECK (total_cost >= 0),
  source           text NOT NULL DEFAULT 'purchase' CHECK (source IN ('stock', 'purchase')),
  notes            text,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE batch_chick_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage batch_chick_purchases"
  ON batch_chick_purchases FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

CREATE INDEX batch_chick_purchases_batch_id_idx ON batch_chick_purchases(batch_id);
CREATE INDEX batch_chick_purchases_org_id_idx ON batch_chick_purchases(organization_id);
