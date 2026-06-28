-- Allow a user to insert themselves into organization_users when accepting a valid invitation
CREATE POLICY "ou_insert_via_invite" ON organization_users FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM invitations
      WHERE invitations.organization_id = organization_users.organization_id
        AND invitations.email = auth.email()
        AND invitations.accepted_at IS NULL
        AND invitations.expires_at > now()
    )
  );
