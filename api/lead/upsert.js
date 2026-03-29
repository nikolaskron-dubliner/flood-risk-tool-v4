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
  const cityState = [row.city, row.state].filter(Boolean).join(", ");
  const score = row.risk_score ?? "n/a";
  return `Callback Requested | ${cityState || "Unknown Location"} | Risk Score ${score}`;
}

function buildInternalAlertHtml(row) {
  const name =
    row.full_name ||
    [row.first_name, row.last_name].filter(Boolean).join(" ") ||
    "Unknown";

  return `
    <h2>High-Priority Flood Lead</h2>
    <p>A lead requested a callback.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse: collapse;">
      <tr><td><strong>Name</strong></td><td>${escapeHtml(name)}</td></tr>
      <tr><td><strong>Email</strong></td><td>${escapeHtml(row.email || "")}</td></tr>
      <tr><td><strong>Phone</strong></td><td>${escapeHtml(row.phone || "")}</td></tr>
      <tr><td><strong>Address</strong></td><td>${escapeHtml(row.street_address || "")}</td></tr>
      <tr><td><strong>City</strong></td><td>${escapeHtml(row.city || "")}</td></tr>
      <tr><td><strong>State</strong></td><td>${escapeHtml(row.state || "")}</td></tr>
      <tr><td><strong>ZIP</strong></td><td>${escapeHtml(row.zip_code || "")}</td></tr>
      <tr><td><strong>Risk Score</strong></td><td>${escapeHtml(String(row.risk_score ?? ""))}</td></tr>
      <tr><td><strong>Priority</strong></td><td>${escapeHtml(String(row.priority ?? ""))}</td></tr>
      <tr><td><strong>Stage</strong></td><td>${escapeHtml(row.stage || "")}</td></tr>
      <tr><td><strong>Property Type</strong></td><td>${escapeHtml(row.property_type || "")}</td></tr>
      <tr><td><strong>Prior Flood Damage</strong></td><td>${escapeHtml(row.prior_flood_damage || "")}</td></tr>
      <tr><td><strong>Drainage Issues</strong></td><td>${escapeHtml(row.drainage_issues || "")}</td></tr>
      <tr><td><strong>Interest Area</strong></td><td>${escapeHtml(row.interest_area || "")}</td></tr>
    </table>
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

  const result = await resend.emails.send({
    from: process.env.ALERT_FROM_EMAIL,
    to: process.env.ALERT_TO_EMAIL,
    subject: buildInternalAlertSubject(row),
    html: buildInternalAlertHtml(row),
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

    let internalAlertResult = {
      sent: false,
      skipped: true,
      reason: "Conditions not met",
    };

    const shouldSendInternalAlert =
      saved.callback_requested === true &&
      saved.internal_alert_sent === false &&
      !previousInternalAlertSent &&
      !previousCallbackRequested;

    if (shouldSendInternalAlert) {
      try {
        internalAlertResult = await sendInternalAlertEmail(saved);

        if (internalAlertResult.sent) {
          const { data: alertUpdated, error: alertUpdateError } = await supabase
            .from("risk_assessments")
            .update({
              internal_alert_sent: true,
              internal_alert_sent_at: new Date().toISOString(),
            })
            .eq("id", saved.id)
            .select("*")
            .single();

          if (alertUpdateError) throw alertUpdateError;
          saved = alertUpdated;
        }
      } catch (emailError) {
        internalAlertResult = {
          sent: false,
          skipped: false,
          error: emailError.message || "Internal alert email failed",
        };

        await supabase
          .from("risk_assessments")
          .update({
            email_status: "failed",
            email_error: emailError.message || "Internal alert email failed",
          })
          .eq("id", saved.id);
      }
    }

    let nurtureResult = {
      enrolled: false,
      skipped: true,
      reason: "Conditions not met",
    };

    if (shouldEnrollInNurture(saved)) {
      const nextSendAt = new Date(
        Date.now() + NUDGE_ENROLL_HOURS * 60 * 60 * 1000
      ).toISOString();

      const { data: nurtureUpdated, error: nurtureError } = await supabase
        .from("risk_assessments")
        .update({
          nurture_status: "queued",
          nurture_step: 0,
          nurture_next_send_at: nextSendAt,
          email_status: "queued",
          email_error: null,
        })
        .eq("id", saved.id)
        .select("*")
        .single();

      if (nurtureError) throw nurtureError;

      saved = nurtureUpdated;
      nurtureResult = {
        enrolled: true,
        next_send_at: nextSendAt,
      };
    }

    if (saved.callback_requested === true && saved.nurture_status !== "paused") {
      const { data: pausedNurture, error: pauseError } = await supabase
        .from("risk_assessments")
        .update({
          nurture_status: "paused",
          nurture_next_send_at: null,
        })
        .eq("id", saved.id)
        .select("*")
        .single();

      if (!pauseError && pausedNurture) {
        saved = pausedNurture;
      }
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