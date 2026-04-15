import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const ALLOWED_STAGES = new Set([
  "partial",
  "completed",
  "callback_requested",
  "contacted",
  "qualified",
  "closed",
]);

const HUBSPOT_SYNC_ENABLED = process.env.HUBSPOT_SYNC_ENABLED === "true";
const QUALIFIED_RISK_SCORE = Number(process.env.QUALIFIED_RISK_SCORE || 70);
const HIGH_PRIORITY_SCORE = Number(process.env.HIGH_PRIORITY_SCORE || 90);
const NUDGE_ENROLL_HOURS = Number(process.env.NUDGE_ENROLL_HOURS || 1);

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

function cleanBoolean(value) {
  if (value === true || value === false) return value;
  if (value === undefined || value === null || value === "") return null;

  const normalized = String(value).trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(normalized)) return true;
  if (["false", "no", "n", "0"].includes(normalized)) return false;

  return null;
}

function cleanJson(value) {
  return value && typeof value === "object" ? value : {};
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

function buildFullName(firstName, lastName, fullName) {
  if (fullName) return fullName;
  const joined = [firstName, lastName].filter(Boolean).join(" ").trim();
  return joined || null;
}

function inferCallbackRequested(body, incomingStage, existingRow = null) {
  const explicit =
    cleanBoolean(body.callback_requested) ??
    cleanBoolean(body.flood_follow_up_requested);

  if (explicit !== null) return explicit;
  if (incomingStage === "callback_requested") return true;
  if (existingRow?.callback_requested === true) return true;

  return false;
}

function normalizeStageWithCallback(stage, callbackRequested) {
  if (callbackRequested) return "callback_requested";
  if (stage === "callback_requested") return "completed";
  return stage;
}

function classifyLead(row) {
  const riskScore = Number(row.risk_score || 0);
  const callbackRequested = row.callback_requested === true;

  if (callbackRequested) return "high";
  if (Number(row.priority || 0) >= HIGH_PRIORITY_SCORE) return "high";
  if (riskScore >= QUALIFIED_RISK_SCORE) return "medium";
  return "low";
}

function shouldSyncToHubSpot(row) {
  const riskScore = Number(row.risk_score || 0);

  return (
    row.callback_requested === true ||
    row.stage === "completed" && riskScore >= QUALIFIED_RISK_SCORE ||
    row.stage === "qualified"
  );
}

function shouldEnrollInNurture(row) {
  if (!row.email) return false;
  if (row.callback_requested === true) return false;
  if (row.stage === "qualified" || row.stage === "closed") return false;
  if (row.nurture_status && row.nurture_status !== "not_enrolled") return false;
  return row.lead_temperature === "low" || row.lead_temperature === "medium";
}

function mapStageToHubSpot(row) {
  if (row.callback_requested === true) return "Callback Requested";
  if (row.stage === "completed") return "Completed";
  if (row.stage === "qualified") return "Qualified";
  if (row.stage === "contacted") return "Contacted";
  if (row.stage === "closed") return "Customer";
  return "Partial";
}

function buildInternalAlertSubject(row) {
  const fullName =
    row.full_name ||
    [row.first_name, row.last_name].filter(Boolean).join(" ") ||
    "Unknown";
  const scoreRaw = Number(row.risk_score ?? 0);
  const score = Number.isFinite(scoreRaw) ? Math.round(scoreRaw) : "N/A";

  return `🔥 New High-Intent Lead (${score}/100) — ${fullName}`;
}

function buildInternalAlertHtml(row) {
  const firstName = row.first_name || "";
  const lastName = row.last_name || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || row.full_name || "Unknown";
  const email = row.email || "N/A";
  const phone = row.phone || "N/A";
  const address = [row.street_address, row.city, row.state, row.zip_code]
    .filter(Boolean)
    .join(", ") || "N/A";
  const scoreRaw = Number(row.risk_score ?? 0);
  const score = Number.isFinite(scoreRaw) ? Math.round(scoreRaw) : "N/A";
  const meetingLink = "https://oiriunu.com/assessment-reservation/";

  return `
    <div style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:640px;margin:0 auto;padding:24px 16px;">
        <div style="background:#ffffff;border-radius:14px;border:1px solid #e5e7eb;overflow:hidden;">
          <div style="background:#7f1d1d;color:#ffffff;padding:18px 24px;">
            <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.9;">
              Oiriunu Alert
            </div>
            <div style="font-size:20px;font-weight:700;margin-top:6px;">
              High-Intent Lead
            </div>
          </div>

          <div style="padding:28px 24px;">
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin-bottom:22px;">
              <div style="font-size:14px;color:#991b1b;font-weight:700;">
                Priority Score: ${escapeHtml(String(score))}/100
              </div>
              <div style="font-size:13px;color:#7f1d1d;margin-top:4px;">
                Callback requested — immediate follow-up recommended
              </div>
            </div>

            <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151;">
              <tr>
                <td style="padding:6px 0;font-weight:600;width:130px;">Name:</td>
                <td>${escapeHtml(fullName)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-weight:600;">Email:</td>
                <td>${escapeHtml(email)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-weight:600;">Phone:</td>
                <td>${escapeHtml(phone)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-weight:600;">Address:</td>
                <td>${escapeHtml(address)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-weight:600;">Property Type:</td>
                <td>${escapeHtml(row.property_type || "N/A")}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-weight:600;">Prior Flood Damage:</td>
                <td>${escapeHtml(row.prior_flood_damage || "N/A")}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-weight:600;">Drainage Issues:</td>
                <td>${escapeHtml(row.drainage_issues || "N/A")}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-weight:600;">Interest Area:</td>
                <td>${escapeHtml(row.interest_area || "N/A")}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-weight:600;">Stage:</td>
                <td>${escapeHtml(row.stage || "N/A")}</td>
              </tr>
            </table>

            <div style="margin:22px 0;border-top:1px solid #e5e7eb;"></div>

            <div style="font-size:15px;color:#111827;font-weight:600;margin-bottom:10px;">
              Recommended next action
            </div>

            <div style="font-size:14px;color:#374151;line-height:1.6;margin-bottom:18px;">
              Reach out to this lead as soon as possible. They have explicitly requested follow-up and are likely evaluating next steps.
            </div>

            <div style="margin-bottom:12px;">
              <a href="mailto:${escapeHtml(email)}" style="display:inline-block;background:#163c35;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;margin-right:8px;">
                Email Lead
              </a>

              <a href="${meetingLink}" style="display:inline-block;background:#1f2937;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
                Book Call
              </a>
            </div>

            <div style="margin-top:20px;font-size:12px;color:#6b7280;">
              This lead was generated via the Oiriunu Flood Risk Assessment tool.
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendInternalAlertEmail(row) {
  if (!resend) {
    return {
      sent: false,
      skipped: true,
      reason: "Resend is not configured.",
    };
  }

let subject;
let html;

try {
  subject = buildInternalAlertSubject(row);
  html = buildInternalAlertHtml(row);
} catch (e) {
  console.error("EMAIL BUILD ERROR:", e);
  return {
    sent: false,
    error: "Email build failed: " + (e?.message || String(e)),
  };
}

const result = await resend.emails.send({
  from: process.env.ALERT_FROM_EMAIL,
  to: process.env.ALERT_TO_EMAIL,
  subject,
  html,
});

console.log("RESEND RESPONSE:", result);

  return {
    sent: true,
    id: result?.data?.id || null,
  };
}

function buildCallbackConfirmationSubject(row) {
  const firstName = row.first_name || "there";
  return `We received your request, ${firstName} — next steps from Oiriunu`;
}

function buildCallbackConfirmationHtml(row) {
  const firstName = row.first_name || "there";
  const scoreRaw = Number(row.risk_score ?? 0);
  const score = Number.isFinite(scoreRaw) ? Math.round(scoreRaw) : null;
  const address =
    [row.street_address, row.city, row.state, row.zip_code]
      .filter(Boolean)
      .join(", ") || "your property";

  const meetingLink =
    "https://oiriunu.com/assessment-reservation/";

  return `
    <div style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:640px;margin:0 auto;padding:24px 16px;">
        <div style="background:#ffffff;border-radius:14px;border:1px solid #e5e7eb;overflow:hidden;">
          <div style="background:#163c35;color:#ffffff;padding:20px 24px;">
            <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.9;">
              Oiriunu
            </div>
            <div style="font-size:22px;font-weight:700;margin-top:6px;">
              We received your request
            </div>
          </div>

          <div style="padding:28px 24px;">
            <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151;">
              Hi ${escapeHtml(firstName)},
            </p>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151;">
              Thank you for completing your Oiriunu flood risk assessment and requesting follow-up.
              Our team has received your information and will review your property details shortly.
            </p>

            <div style="background:#f0f7f5;border:1px solid #cfe6dd;border-radius:10px;padding:14px 16px;margin:18px 0;">
              <div style="font-size:13px;color:#163c35;font-weight:700;margin-bottom:6px;">
                Assessment summary
              </div>
              <div style="font-size:14px;color:#374151;line-height:1.6;">
                <div><strong>Property:</strong> ${escapeHtml(address)}</div>
                <div><strong>Email:</strong> ${escapeHtml(row.email || "N/A")}</div>
                <div><strong>Phone:</strong> ${escapeHtml(row.phone || "N/A")}</div>
                ${
                  score !== null
                    ? `<div><strong>Risk score:</strong> ${escapeHtml(String(score))}/100</div>`
                    : ""
                }
                <div><strong>Interest area:</strong> ${escapeHtml(row.interest_area || "General Information")}</div>
              </div>
            </div>

            <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151;">
              A specialist should reach out within 1 business day. If you would prefer, you can also book a time directly using the link below.
            </p>

            <div style="margin:24px 0 10px;">
              <a href="${meetingLink}" style="display:inline-block;background:#163c35;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
                Book a Call
              </a>
            </div>

            <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
              If you did not request this follow-up, you can ignore this email.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function sendCallbackConfirmationEmail(row) {
  if (!resend) {
    return {
      sent: false,
      skipped: true,
      reason: "Resend is not configured.",
    };
  }

  const subject = buildCallbackConfirmationSubject(row);
  const html = buildCallbackConfirmationHtml(row);

  const result = await resend.emails.send({
    from: process.env.ALERT_FROM_EMAIL,
    to: row.email,
    reply_to: process.env.ALERT_FROM_EMAIL,
    subject,
    html,
  });

  return {
    sent: true,
    id: result?.data?.id || null,
  };
}

async function syncHubSpotContact(row) {
  if (!HUBSPOT_SYNC_ENABLED || !process.env.HUBSPOT_PRIVATE_TOKEN) {
    return {
      synced: false,
      skipped: true,
      reason: "HubSpot sync disabled or token missing.",
    };
  }

  const properties = {
    email: row.email || "",
    firstname: row.first_name || "",
    lastname: row.last_name || "",
    phone: row.phone || "",
    address: row.street_address || "",
    city: row.city || "",
    state: row.state || "",
    zip: row.zip_code || "",
    risk_score: row.risk_score != null ? String(row.risk_score) : "",
    customer_funnel_stage: mapStageToHubSpot(row),
    flood_follow_up_requested: row.callback_requested ? "Yes" : "No",
    property_type: row.property_type || "",
    prior_flood_damage: row.prior_flood_damage || "",
    drainage_issues: row.drainage_issues || "",
    interest_area: row.interest_area || "",
  };

  const response = await fetch(
    "https://api.hubapi.com/crm/v3/objects/contacts",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HUBSPOT_PRIVATE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties,
      }),
    }
  );

  if (response.ok) {
    const data = await response.json();
    return {
      synced: true,
      contactId: data.id,
      mode: "created",
    };
  }

  const errorBody = await response.text();

  // If contact already exists, update by email via search + patch.
  if (response.status === 409 || errorBody.toLowerCase().includes("already exists")) {
    const searchResponse = await fetch(
      "https://api.hubapi.com/crm/v3/objects/contacts/search",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_PRIVATE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "email",
                  operator: "EQ",
                  value: row.email,
                },
              ],
            },
          ],
          properties: ["email"],
          limit: 1,
        }),
      }
    );

    const searchData = await searchResponse.json();
    const existingId = searchData?.results?.[0]?.id;

    if (!existingId) {
      throw new Error(`HubSpot search failed after conflict: ${errorBody}`);
    }

    const updateResponse = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${existingId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_PRIVATE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ properties }),
      }
    );

    if (!updateResponse.ok) {
      const updateBody = await updateResponse.text();
      throw new Error(`HubSpot update failed: ${updateBody}`);
    }

    return {
      synced: true,
      contactId: existingId,
      mode: "updated",
    };
  }

  throw new Error(`HubSpot create failed: ${errorBody}`);
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

    const proposedStage = normalizeStage(body.stage);

    const incomingBase = {
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
      raw_payload:
        body.raw_payload && typeof body.raw_payload === "object"
          ? body.raw_payload
          : body,
    };

    if (!incomingBase.email) {
      return res.status(400).json({ ok: false, error: "email is required" });
    }

    const existing = await findExistingLead({
      id: incomingBase.id,
      email: incomingBase.email,
      street_address: incomingBase.street_address,
      phone: incomingBase.phone,
    });

    const callbackRequested = inferCallbackRequested(body, proposedStage, existing);
    const normalizedStage = normalizeStageWithCallback(proposedStage, callbackRequested);
    const fullName = buildFullName(
      incomingBase.first_name ?? existing?.first_name ?? null,
      incomingBase.last_name ?? existing?.last_name ?? null,
      incomingBase.full_name ?? existing?.full_name ?? null
    );

    const incoming = {
      ...incomingBase,
      full_name: fullName,
      stage: normalizedStage,
      callback_requested: callbackRequested,
    };

    let recordToWrite;
    let previousStage = existing?.stage || null;
    let previousCallbackRequested = existing?.callback_requested === true;
    let previousInternalAlertSent = existing?.internal_alert_sent === true;

    if (existing) {
      recordToWrite = mergeDefined(existing, incoming);

      if (
        existing.stage === "callback_requested" &&
        normalizedStage === "partial"
      ) {
        recordToWrite.stage = existing.stage;
      }

      if (existing.callback_requested === true) {
        recordToWrite.callback_requested = true;
        recordToWrite.stage = "callback_requested";
      }
    } else {
      recordToWrite = {
        ...incoming,
        internal_alert_sent: false,
        internal_alert_sent_at: null,
        nurture_status: "not_enrolled",
        nurture_step: 0,
        nurture_next_send_at: null,
        nurture_last_sent_at: null,
        hubspot_sync_status: "pending",
        hubspot_sync_error: null,
        email_status: "pending",
        email_error: null,
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

    // Critical: if no id exists yet, remove it so Postgres can apply the default UUID.
    if (!recordToWrite.id) {
      delete recordToWrite.id;
    }

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

    const leadTemperature = classifyLead(saved);

    const { data: withTemperature, error: tempError } = await supabase
      .from("risk_assessments")
      .update({ lead_temperature: leadTemperature })
      .eq("id", saved.id)
      .select("*")
      .single();

    if (tempError) throw tempError;
    saved = withTemperature;

    let segment;
    if (saved.callback_requested === true) {
      segment = "high_intent";
    } else if (Number(saved.priority || 0) >= HIGH_PRIORITY_SCORE) {
      segment = "high_no_callback";
    } else if (saved.lead_temperature === "medium") {
      segment = "medium";
    } else {
      segment = "low";
    }

    let internalAlertResult = { sent: false, skipped: true, reason: "Conditions not met" };
    let callbackConfirmationResult = { sent: false, skipped: true, reason: "Conditions not met" };
    let nurtureResult = { enrolled: false, skipped: true, reason: "Conditions not met" };

let callbackEmailResult = {
  sent: false,
  skipped: true,
  reason: "Conditions not met",
};

if (segment === "high_intent") {
  // Callback requested — send internal alert and immediate customer confirmation.
  // Also clear any stale nurture state from pre-callback lifecycle.
  const callbackStateUpdate = {
    lead_segment: "high_intent",
    nurture_status: "not_enrolled",
    nurture_type: null,
    nurture_step: 0,
    nurture_next_send_at: null,
  };

  if (!previousInternalAlertSent) {
    try {
      internalAlertResult = await sendInternalAlertEmail(saved);
      callbackStateUpdate.internal_alert_sent = true;
      callbackStateUpdate.internal_alert_sent_at = new Date().toISOString();
    } catch (alertErr) {
      internalAlertResult = { sent: false, error: alertErr.message };
    }
  } else {
    internalAlertResult = {
      sent: false,
      skipped: true,
      reason: "Alert already sent",
    };
  }

  const shouldSendCallbackEmail =
    saved.email &&
    (
      previousCallbackRequested !== true ||
      previousStage !== "callback_requested"
    );

  if (shouldSendCallbackEmail) {
    try {
      callbackEmailResult = await sendCallbackConfirmationEmail(saved);
      callbackStateUpdate.email_status = "sent";
      callbackStateUpdate.email_error = null;
    } catch (emailErr) {
      callbackEmailResult = { sent: false, error: emailErr.message };
      callbackStateUpdate.email_status = "failed";
      callbackStateUpdate.email_error =
        emailErr.message || "Callback confirmation email failed";
    }
  } else {
    callbackEmailResult = {
      sent: false,
      skipped: true,
      reason: "Callback confirmation already handled",
    };
  }

  const { data: callbackUpdated, error: callbackUpdateError } = await supabase
    .from("risk_assessments")
    .update(callbackStateUpdate)
    .eq("id", saved.id)
    .select("*")
    .single();

  if (callbackUpdateError) throw callbackUpdateError;
  saved = callbackUpdated;

  nurtureResult = {
    enrolled: false,
    skipped: true,
    reason: "Callback requested — not enrolled in nurture",
  };

} else if (segment === "high_no_callback") {

  // High risk, no meeting requested — urgent nurture sequence
  await supabase
    .from("risk_assessments")
    .update({
      lead_segment: "high_no_callback",
      nurture_status: "queued",
      nurture_type: "high_no_callback",
      nurture_step: 0,
      nurture_next_send_at: new Date().toISOString(),
    })
    .eq("id", saved.id);
  nurtureResult = { enrolled: true, type: "high_no_callback" };

} else if (segment === "medium") {
  // Medium risk — standard nurture sequence
  await supabase
    .from("risk_assessments")
    .update({
      lead_segment: "medium",
      nurture_status: "queued",
      nurture_type: "medium",
      nurture_step: 0,
      nurture_next_send_at: new Date().toISOString(),
    })
    .eq("id", saved.id);
  nurtureResult = { enrolled: true, type: "medium" };

} else {
  // Low risk — low nurture sequence
  await supabase
    .from("risk_assessments")
    .update({
      lead_segment: "low",
      nurture_status: "queued",
      nurture_type: "low",
      nurture_step: 0,
      nurture_next_send_at: new Date().toISOString(),
    })
    .eq("id", saved.id);
  nurtureResult = { enrolled: true, type: "low" };
}

    let hubspotResult = {
      synced: false,
      skipped: true,
      reason: "Conditions not met",
    };

    if (shouldSyncToHubSpot(saved)) {
      try {
        hubspotResult = await syncHubSpotContact(saved);

        const { data: hsUpdated, error: hsError } = await supabase
          .from("risk_assessments")
          .update({
            hubspot_contact_id: hubspotResult.contactId || saved.hubspot_contact_id,
            hubspot_sync_status: hubspotResult.mode || "synced",
            hubspot_sync_error: null,
          })
          .eq("id", saved.id)
          .select("*")
          .single();

        if (hsError) throw hsError;
        saved = hsUpdated;
      } catch (hubspotError) {
        hubspotResult = {
          synced: false,
          skipped: false,
          error: hubspotError.message || "HubSpot sync failed",
        };

        await supabase
          .from("risk_assessments")
          .update({
            hubspot_sync_status: "failed",
            hubspot_sync_error: hubspotError.message || "HubSpot sync failed",
          })
          .eq("id", saved.id);
      }
    }

return res.status(200).json({
  ok: true,
  id: saved.id,
  stage: saved.stage,
  callback_requested: saved.callback_requested,
  priority: saved.priority,
  lead_temperature: saved.lead_temperature,
  internal_alert: internalAlertResult,
  callback_email: callbackEmailResult,
  nurture: nurtureResult,
  hubspot: hubspotResult,
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