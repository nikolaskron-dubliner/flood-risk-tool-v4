import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const twilioClient =
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_FROM_NUMBER &&
  process.env.ALERT_TO_NUMBER
    ? twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      )
    : null;

const ALLOWED_STAGES = new Set([
  "partial",
  "completed",
  "callback_requested",
  "contacted",
  "qualified",
  "closed",
]);

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function cleanNumeric(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanJson(value) {
  if (value && typeof value === "object") return value;
  return {};
}

function normalizeStage(value) {
  const stage = cleanText(value);
  return stage && ALLOWED_STAGES.has(stage) ? stage : "partial";
}

function mergeDefined(existing, incoming) {
  const out = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function buildSmsBody(row) {
  const name =
    row.full_name ||
    [row.first_name, row.last_name].filter(Boolean).join(" ") ||
    "Unknown";
  const location = [row.city, row.state, row.zip_code].filter(Boolean).join(", ");
  const riskScore =
    row.risk_score !== null && row.risk_score !== undefined
      ? row.risk_score
      : "n/a";

  return [
    "Flood Lead Callback Request",
    `Name: ${name}`,
    `Risk Score: ${riskScore}`,
    row.phone ? `Phone: ${row.phone}` : null,
    row.email ? `Email: ${row.email}` : null,
    row.street_address ? `Address: ${row.street_address}` : null,
    location ? `Location: ${location}` : null,
    row.interest_area ? `Interest: ${row.interest_area}` : null,
    `Stage: ${row.stage}`,
    `Priority: ${row.priority}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendAlertSms(row) {
  if (!twilioClient) {
    return {
      sent: false,
      skipped: true,
      reason: "Twilio env vars not fully configured.",
    };
  }

  const message = await twilioClient.messages.create({
    body: buildSmsBody(row),
    from: process.env.TWILIO_FROM_NUMBER,
    to: process.env.ALERT_TO_NUMBER,
  });

  return {
    sent: true,
    sid: message.sid,
  };
}

async function findExistingLead({ id, email, street_address, phone }) {
  if (id) {
    const { data, error } = await supabase
      .from("risk_assessments")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (!email) return null;

  let query = supabase
    .from("risk_assessments")
    .select("*")
    .eq("email", email)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (street_address) {
    query = query.eq("street_address", street_address);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return null;

  if (phone) {
    const phoneMatch = data.find((r) => r.phone && r.phone === phone);
    if (phoneMatch) return phoneMatch;
  }

  return data[0];
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    const incoming = {
      id: cleanText(body.id),
      first_name: cleanText(body.first_name),
      last_name: cleanText(body.last_name),
      full_name: cleanText(body.full_name),
      email: cleanText(body.email),
      phone: cleanText(body.phone),
      street_address: cleanText(body.street_address),
      city: cleanText(body.city),
      state: cleanText(body.state),
      zip_code: cleanText(body.zip_code),
      year_built: cleanNumeric(body.year_built),
      property_type: cleanText(body.property_type),
      basement_type: cleanText(body.basement_type),
      trees_overhang: cleanText(body.trees_overhang),
      prior_flood_damage: cleanText(body.prior_flood_damage),
      drainage_issues: cleanText(body.drainage_issues),
      interest_area: cleanText(body.interest_area),
      risk_score: cleanNumeric(body.risk_score),
      assessment_answers: cleanJson(body.assessment_answers),
      utm_source: cleanText(body.utm_source),
      utm_medium: cleanText(body.utm_medium),
      utm_campaign: cleanText(body.utm_campaign),
      utm_term: cleanText(body.utm_term),
      utm_content: cleanText(body.utm_content),
      referrer: cleanText(body.referrer),
      landing_page: cleanText(body.landing_page),
      source_app: cleanText(body.source_app) || "risk_assessment_tool",
      raw_payload:
        body.raw_payload && typeof body.raw_payload === "object"
          ? body.raw_payload
          : body,
      stage: normalizeStage(body.stage),
    };

    if (!incoming.email) {
      return res.status(400).json({ error: "email is required" });
    }

    const existing = await findExistingLead({
      id: incoming.id,
      email: incoming.email,
      street_address: incoming.street_address,
      phone: incoming.phone,
    });

    let recordToWrite;
    let previousStage = null;

    if (existing) {
      previousStage = existing.stage;

      recordToWrite = mergeDefined(existing, incoming);

      // Preserve existing callback stage unless explicitly downgraded for a reason.
      // This avoids accidentally overwriting a hot lead with a later partial payload.
      if (
        existing.stage === "callback_requested" &&
        incoming.stage === "partial"
      ) {
        recordToWrite.stage = existing.stage;
      }

      // Once SMS was sent, keep the flag unless you intentionally reset it later.
      if (existing.sms_alert_sent === true) {
        recordToWrite.sms_alert_sent = true;
        recordToWrite.sms_alert_sent_at = existing.sms_alert_sent_at;
        recordToWrite.last_notification_sent_at =
          existing.last_notification_sent_at;
      }
    } else {
      recordToWrite = {
        ...incoming,
        sms_alert_sent: false,
        sms_alert_sent_at: null,
        last_notification_sent_at: null,
      };
    }

    // Do not let clients directly spoof these fields.
    delete recordToWrite.priority;
    delete recordToWrite.updated_at;
    delete recordToWrite.sms_alert_sent;
    delete recordToWrite.sms_alert_sent_at;
    delete recordToWrite.last_notification_sent_at;
    delete recordToWrite.hubspot_sync_status;
    delete recordToWrite.hubspot_sync_error;
    delete recordToWrite.email_status;
    delete recordToWrite.email_error;

    let saved;
    if (existing?.id) {
      const { data, error } = await supabase
        .from("risk_assessments")
        .update(recordToWrite)
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await supabase
        .from("risk_assessments")
        .insert(recordToWrite)
        .select("*")
        .single();

      if (error) throw error;
      saved = data;
    }

    const shouldSendSms =
      saved.stage === "callback_requested" &&
      saved.sms_alert_sent === false &&
      previousStage !== "callback_requested";

    let smsResult = {
      sent: false,
      skipped: true,
      reason: "Conditions not met",
    };

    if (shouldSendSms) {
      try {
        smsResult = await sendAlertSms(saved);

        if (smsResult.sent) {
          const { data: smsUpdated, error: smsUpdateError } = await supabase
            .from("risk_assessments")
            .update({
              sms_alert_sent: true,
              sms_alert_sent_at: new Date().toISOString(),
              last_notification_sent_at: new Date().toISOString(),
            })
            .eq("id", saved.id)
            .select("*")
            .single();

          if (smsUpdateError) throw smsUpdateError;
          saved = smsUpdated;
        }
      } catch (smsError) {
        smsResult = {
          sent: false,
          skipped: false,
          error: smsError.message || "SMS failed",
        };
      }
    }

    return res.status(200).json({
      ok: true,
      id: saved.id,
      stage: saved.stage,
      priority: saved.priority,
      sms: smsResult,
      record: saved,
    });
  } catch (error) {
    console.error("lead upsert error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Internal server error",
    });
  }
}