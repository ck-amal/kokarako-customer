import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { invitation_id, app_url } = await req.json()

    if (!invitation_id || !app_url) {
      return new Response(JSON.stringify({ error: 'Missing invitation_id or app_url' }), {
        status: 400, headers: corsHeaders,
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: inv, error: invErr } = await supabase
      .from('invitations')
      .select('id, email, role, token, organizations(name)')
      .eq('id', invitation_id)
      .single()

    if (invErr || !inv) {
      return new Response(JSON.stringify({ error: 'Invitation not found' }), {
        status: 404, headers: corsHeaders,
      })
    }

    if (!inv.email) {
      return new Response(JSON.stringify({ error: 'Invitation has no email address' }), {
        status: 400, headers: corsHeaders,
      })
    }

    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
        status: 500, headers: corsHeaders,
      })
    }

    const inviteLink = `${app_url}/invite/${inv.token}`
    const orgName    = (inv.organizations as any)?.name || 'Kokarako'
    const role       = inv.role.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

    const html = `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-size: 40px;">🐔</span>
          <h1 style="font-size: 22px; font-weight: 700; color: #1f2937; margin: 8px 0 4px;">You're invited!</h1>
          <p style="color: #6b7280; margin: 0;">Join <strong>${orgName}</strong> as <strong>${role}</strong> on Kokarako</p>
        </div>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${inviteLink}"
             style="display: inline-block; background: #f59e0b; color: #fff; font-weight: 700;
                    text-decoration: none; padding: 14px 32px; border-radius: 10px; font-size: 15px;">
            Accept Invitation
          </a>
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">
          This link expires in 7 days. If you did not expect this invitation, you can ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;">
        <p style="color: #d1d5db; font-size: 11px; text-align: center;">
          Kokarako — Poultry Farm Management
        </p>
      </div>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'Kokarako <noreply@kokarako.com>',
        to:      [inv.email],
        subject: `You're invited to join ${orgName} on Kokarako`,
        html,
      }),
    })

    const result = await res.json()

    if (!res.ok) {
      console.error('Resend error:', result)
      return new Response(JSON.stringify({ error: result.message || 'Email send failed' }), {
        status: 500, headers: corsHeaders,
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: corsHeaders,
    })
  }
})
