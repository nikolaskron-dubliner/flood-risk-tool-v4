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
    return res.status(200).json({ ok: true, route: 'lead-capture-enrich' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      email,
      first_name,
      home_type,
      ownership_status,
      timeline,
      intent_level
    } = req.body || {}

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Valid email is required' })
    }

    const normalizedEmail = email.trim().toLowerCase()

    const updatePayload = {
      first_name: first_name || null,
      home_type: home_type || null,
      ownership_status: ownership_status || null,
      timeline: timeline || null,
      intent_level: intent_level || null
    }

    const { data, error } = await supabase
      .schema('leads')
      .from('guide_downloads')
      .update(updatePayload)
      .eq('email', normalizedEmail)
      .select()

    if (error) throw error

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'No matching lead found for this email' })
    }

    return res.status(200).json({
      success: true,
      message: 'Lead enriched successfully',
      data
    })
  } catch (err) {
    console.error('lead-capture-enrich error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
}