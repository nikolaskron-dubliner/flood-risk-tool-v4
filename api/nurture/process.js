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

const PROCESS_SECRET = process.env.NURTURE_PROCESS_SECRET || "";
const MEETING_LINK =
  "https://meetings-na2.hubspot.com/nikolas-kron/assessment-meeting";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function buildEmailContent(row) {
  const firstName = row.first_name || "there";
  const score = row.risk_score ?? "your";
  const location = [row.city, row.state].filter(Boolean).join(", ");

  if (row.nurture_step === 0) {
    return {
      subject: "Your property risk results are ready",
      html: `
        <p>Hi ${esc(firstName)},</p>
        <p>Your property risk assessment is complete.</p>
        <p>Your current risk score is <strong>${esc(score)}</strong>${location ? ` for ${esc(location)}` : ""}.</p>
        <p>We look at both flood exposure and insurance-related risk to help identify where homeowners may be more vulnerable.</p>
        <p>If you want to discuss your property in more detail, you can schedule a call here:</p>
        <p><a href="${MEETING_LINK}">${MEETING_LINK}</a></p>
        <p>Regards,<br/>Oiriunu</p>
      `,
    };
  }

  if (row.nurture_step === 1) {
    return {
      subject: "What your flood and insurance risk may mean",
      html: `
        <p>Hi ${esc(firstName)},</p>
        <p>A higher property risk score can point to more than just flood exposure. It can also reflect property vulnerability, drainage concerns, and insurance-related pressure.</p>
        <p>Your current score is <strong>${esc(score)}</strong>.</p>
        <p>If you want help interpreting what this means for your property, schedule a call here:</p>
        <p><a href="${MEETING_LINK}">${MEETING_LINK}</a></p>
        <p>Regards,<br/>Oiriunu</p>
      `,
    };
  }

  return {
    subject: "Next steps to reduce your property risk",
    html: `
      <p>Hi ${esc(firstName)},</p>
      <p>If you are thinking about reducing your property risk, the next step is usually identifying the most practical improvements for your home and budget.</p>
      <p>If you want to review your situation with us, book a time here:</p>
      <p><a href="${MEETING_LINK}">${MEETING_LINK}</a></p>
      <p>Regards,<br/>Oiriunu</p>
    `,
  };
}

function getNextSchedule(stepJustSent) {
  const now = Date.now();

  if (stepJustSent === 0) {
    return {
      nurture_status: "active",
      nurture_step: 1,
      nurture_next_send_at: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  if (stepJustSent === 1) {
    return {
      nurture_status: "active",
      nurture_step: 2,
      nurture_next_send_at: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  return {
    nurture_status: "completed",
    nurture_step: 3,
    nurture_next_send_at: null,
  };
}

async function sendNurtureEmail(row) {
  if (!resend) {
    throw new Error("Resend is not configured.");
  }

  const content = buildEmailContent(row);

  return resend.emails.send({
    from: process.env.ALERT_FROM_EMAIL,
    to: row.email,
    subject: content.subject,
    html: content.html,
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = getBody(req);

  const providedSecret =
    req.headers["x-process-secret"] ||
    req.query?.secret ||
    body.secret ||
    "";

  if (!PROCESS_SECRET || providedSecret !== PROCESS_SECRET) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const limitRaw = req.query?.limit || body.limit || 25;
    const limit = Math.min(Number(limitRaw) || 25, 100);

    const { data: rows, error } = await supabase
      .from("risk_assessments")
      .select("*")
      .in("nurture_status", ["queued", "active"])
      .lte("nurture_next_send_at", new Date().toISOString())
      .eq("callback_requested", false)
      .order("nurture_next_send_at", { ascending: true })
      .limit(limit);

    if (error) throw error;

    const results = [];

    for (const row of rows || []) {
      try {
        if (!row.email) {
          results.push({
            id: row.id,
            ok: false,
            skipped: true,
            reason: "Missing email",
          });
          continue;
        }

        if (row.callback_requested === true) {
          results.push({
            id: row.id,
            email: row.email,
            ok: false,
            skipped: true,
            reason: "Callback requested",
          });
          continue;
        }

        await sendNurtureEmail(row);

        const nextState = getNextSchedule(row.nurture_step);

        const { error: updateError } = await supabase
          .from("risk_assessments")
          .update({
            ...nextState,
            nurture_last_sent_at: new Date().toISOString(),
            email_status: "sent",
            email_error: null,
          })
          .eq("id", row.id);

        if (updateError) throw updateError;

        results.push({
          id: row.id,
          email: row.email,
          ok: true,
          nurture_step_before: row.nurture_step,
          nurture_step_after: nextState.nurture_step,
          nurture_status_after: nextState.nurture_status,
          next_send_at: nextState.nurture_next_send_at,
        });
      } catch (err) {
        await supabase
          .from("risk_assessments")
          .update({
            email_status: "failed",
            email_error: err.message || "Nurture send failed",
            nurture_status: "failed",
          })
          .eq("id", row.id);

        results.push({
          id: row.id,
          email: row.email,
          ok: false,
          error: err.message || "Nurture send failed",
        });
      }
    }

    return res.status(200).json({
      ok: true,
      processed: results.length,
      results,
    });
  } catch (err) {
    console.error("nurture process error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Internal server error",
    });
  }
}