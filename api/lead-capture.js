import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://oiriunu.com')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, route: 'lead-capture' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      first_name,
      email,
      phone,
      zip_code,
      home_type,
      ownership_status,
      timeline,
      intent_level,
      utm_source,
      utm_campaign,
      source
    } = req.body || {}

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Valid email is required' })
    }

    if (!zip_code || typeof zip_code !== 'string') {
      return res.status(400).json({ error: 'Valid zip_code is required' })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const normalizedZip = zip_code.trim()

    const insertPayload = {
      first_name: first_name || null,
      email: normalizedEmail,
      phone: phone || null,
      zip_code: normalizedZip,
      home_type: home_type || null,
      ownership_status: ownership_status || null,
      timeline: timeline || null,
      intent_level: intent_level || null,
      utm_source: utm_source || null,
      utm_campaign: utm_campaign || null,
      source: source || 'guide_download'
    }

    const { data, error } = await supabase
      .schema('leads')
      .from('guide_downloads')
      .insert([insertPayload])
      .select()

    if (error) {
      console.error('Supabase insert error:', error)
      return res.status(500).json({
        error: 'Supabase insert failed',
        message: error.message || null,
        details: error.details || null,
        hint: error.hint || null,
        code: error.code || null
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Lead captured successfully',
      data
    })
  } catch (err) {
    console.error('lead-capture error full:', err)
    return res.status(500).json({
      error: 'Server error',
      message: err.message || null
    })
  }
}