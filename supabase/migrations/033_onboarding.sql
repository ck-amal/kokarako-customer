-- Add onboarding tracking to organizations.
-- NULL means tour not completed; a timestamp means it was finished on that date.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
