// Supabase Auth SMS Hook — receives OTP from Supabase and delivers via Fast2SMS.
// Configure in: Dashboard → Authentication → Hooks → Send SMS → HTTP Hook → this function URL.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Supabase sends: { user_id, phone, otp }
    const { phone, otp } = await req.json()

    if (!phone || !otp) {
      return new Response(JSON.stringify({ error: 'Missing phone or otp' }), {
        status: 400, headers: corsHeaders,
      })
    }

    const apiKey = Deno.env.get('FAST2SMS_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'FAST2SMS_API_KEY not configured' }), {
        status: 500, headers: corsHeaders,
      })
    }

    // Fast2SMS expects 10-digit number without country code
    const mobile = phone.replace(/^\+91/, '').replace(/^\+/, '')

    const message = `Your Kokarako verification code is ${otp}. Valid for 10 minutes. Do not share with anyone.`

    const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        'authorization': apiKey,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        route:    'q',
        message,
        language: 'english',
        flash:    0,
        numbers:  mobile,
      }),
    })

    const result = await res.json()

    if (!result.return) {
      console.error('Fast2SMS OTP error:', result)
      return new Response(JSON.stringify({ error: result.message?.[0] || 'Fast2SMS error' }), {
        status: 500, headers: corsHeaders,
      })
    }

    // Supabase SMS hook expects empty 200 on success
    return new Response(JSON.stringify({}), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: corsHeaders,
    })
  }
})
