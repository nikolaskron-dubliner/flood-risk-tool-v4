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
  const scoreRaw = Number(row.risk_score ?? 0);
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0;
  const location = [row.city, row.state].filter(Boolean).join(", ");
  const reportLink = "https://oiriunu.com/flood-risk-assessment/";
  const meetingLink =
    "https://meetings-na2.hubspot.com/nikolas-kron/assessment-meeting";
  const drainageLink =
    "https://oiriunu.com/flood-prevention-solutions-texas/water-diversion-texas/";
  const entryPointLink =
    "https://oiriunu.com/flood-prevention-solutions-texas/entry-point-protection/";
  const waterRemovalLink =
    "https://oiriunu.com/flood-prevention-solutions-texas/water-removal/";

  function wrapEmail({ preheader, title, introHtml, bodyHtml, buttonText, buttonUrl }) {
    return `
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
        ${esc(preheader)}
      </div>
      <div style="margin:0;padding:0;background:#f4f7f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
        <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <div style="background:#163c35;padding:20px 28px;">
              <div style="font-size:12px;line-height:1.4;letter-spacing:.08em;text-transform:uppercase;color:#d1e7e1;font-weight:700;">
                Oiriunu
              </div>
            </div>

            <div style="padding:36px 28px 18px;">
              <h1 style="margin:0 0 16px;font-size:30px;line-height:1.2;color:#111827;font-weight:700;">
                ${title}
              </h1>

              <div style="font-size:16px;line-height:1.75;color:#374151;">
                ${introHtml}
                ${bodyHtml}
              </div>

              <div style="margin-top:28px;">
                <a href="${buttonUrl}" style="display:inline-block;background:#163c35;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-size:15px;font-weight:700;">
                  ${buttonText}
                </a>
              </div>

              <div style="margin-top:28px;padding-top:22px;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.7;color:#6b7280;">
                <p style="margin:0 0 10px;">
                  Oiriunu helps homeowners identify practical ways to reduce property risk through both DIY solutions and professional support.
                </p>
                <p style="margin:0 0 10px;">
                  Oiriunu may earn commission through affiliate marketing links for DIY purchases and may also earn commission on referral services.
                </p>
                <p style="margin:0;">
                  If you have questions, simply reply to this email.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (row.nurture_step === 0) {
    return {
      subject: "Your Oiriunu property risk assessment is ready",
      html: wrapEmail({
        preheader: "Your Oiriunu property risk assessment is ready.",
        title: "Your Oiriunu property risk assessment is ready",
        introHtml: `
          <p style="margin:0 0 16px;">Hi ${esc(firstName)},</p>
          <p style="margin:0 0 16px;">
            Your property risk assessment is complete${location ? ` for <strong>${esc(location)}</strong>` : ""}.
          </p>
          <p style="margin:0 0 16px;">
            Oiriunu reviews both flood exposure and insurance-related risk factors to better understand how vulnerable a property may be.
          </p>
        `,
        bodyHtml: `
          <p style="margin:0 0 16px;">
            If you want to review your results and discuss possible next steps, you can also schedule an assessment call with us.
          </p>
        `,
        buttonText: "Re-run your assessment report",
        buttonUrl: reportLink
      })
    };
  }

  if (row.nurture_step === 1) {
    return {
      subject: "Why your Oiriunu property risk score matters",
      html: wrapEmail({
        preheader: "Why your Oiriunu property risk score matters.",
        title: "Why your Oiriunu property risk score matters",
        introHtml: `
          <p style="margin:0 0 16px;">Hi ${esc(firstName)},</p>
          <p style="margin:0 0 16px;">
            Your Oiriunu property risk score is <strong>${esc(score)} out of 100</strong>.
          </p>
          <p style="margin:0 0 16px;">
            Thinking about the score as a percentage is important. A score of <strong>${esc(score)}%</strong> indicates a meaningful level of property risk and is not just a neutral number on its own.
          </p>
        `,
        bodyHtml: `
          <p style="margin:0 0 16px;">
            A higher score can reflect more than flood location alone. It may also point to drainage concerns, home-specific vulnerability, past water-related problems, and insurance-related pressure.
          </p>
          <p style="margin:0 0 16px;">
            For many homeowners, the most important question is not only whether flooding is possible, but what that risk could mean for future damage, disruption, and cost.
          </p>
          <p style="margin:0 0 16px;">
            If you would like help interpreting your result, you can schedule a review call below.
          </p>
        `,
        buttonText: "Schedule a review call",
        buttonUrl: meetingLink
      })
    };
  }

  return {
    subject: "Next steps to reduce your property risk",
    html: wrapEmail({
      preheader: "Next steps to reduce your property risk.",
      title: "Next steps to reduce your property risk",
      introHtml: `
        <p style="margin:0 0 16px;">Hi ${esc(firstName)},</p>
        <p style="margin:0 0 16px;">
          If you are thinking about protecting your property, the next step is usually identifying the most practical improvements for your home, budget, and risk profile.
        </p>
      `,
      bodyHtml: `
        <p style="margin:0 0 14px;">That may include:</p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 18px;">
          <tr>
            <td style="padding:12px 0;border-top:1px solid #e5e7eb;">
              <a href="${drainageLink}" style="color:#163c35;font-weight:700;text-decoration:none;">Drainage improvements</a>
              <div style="margin-top:4px;font-size:14px;line-height:1.6;color:#4b5563;">
                Explore water diversion approaches that may help move water away from the home.
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-top:1px solid #e5e7eb;">
              <a href="${entryPointLink}" style="color:#163c35;font-weight:700;text-decoration:none;">Entry point protection</a>
              <div style="margin-top:4px;font-size:14px;line-height:1.6;color:#4b5563;">
                Review ways to protect doors, openings, and other vulnerable access points.
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-top:1px solid #e5e7eb;">
              <a href="${waterRemovalLink}" style="color:#163c35;font-weight:700;text-decoration:none;">Water removal planning</a>
              <div style="margin-top:4px;font-size:14px;line-height:1.6;color:#4b5563;">
                Consider pumps, removal tools, and response planning before the next event occurs.
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
              <a href="${meetingLink}" style="color:#163c35;font-weight:700;text-decoration:none;">Professional assessment of vulnerabilities</a>
              <div style="margin-top:4px;font-size:14px;line-height:1.6;color:#4b5563;">
                Book a time to review your property and discuss practical next steps.
              </div>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 16px;">
          Oiriunu supports homeowners through both DIY solutions and connections to qualified professionals, depending on what makes the most sense for the property.
        </p>
      `,
      buttonText: "Schedule your assessment call",
      buttonUrl: meetingLink
    })
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

function buildUrgentEmailContent(row) {
  const firstName = row.first_name || "there";
  const scoreRaw = Number(row.risk_score ?? 0);
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0;
  const location = [row.city, row.state].filter(Boolean).join(", ");
  const meetingLink = "https://meetings-na2.hubspot.com/nikolas-kron/assessment-meeting";

  // Step 0 — immediate: score callout, book a call
  if (row.nurture_step === 0) {
    return {
      subject: `Your property risk score is ${score}/100 — here's what to do next`,
      html: `
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
          Your property has a high risk score. Here's what we recommend.
        </div>
        <div style="margin:0;padding:0;background:#f4f7f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
          <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
            <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
              <div style="background:#7f1d1d;padding:20px 28px;">
                <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#fecaca;font-weight:700;">
                  Oiriunu — Priority Alert
                </div>
              </div>
              <div style="padding:36px 28px 18px;">
                <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:#111827;font-weight:700;">
                  Hi ${esc(firstName)}, your property risk score is ${esc(String(score))}/100
                </h1>
                <div style="font-size:16px;line-height:1.75;color:#374151;">
                  <p style="margin:0 0 16px;">
                    ${location ? `Your property in <strong>${esc(location)}</strong> has` : "Your property has"} a high risk score. That puts it in a range where flood exposure, drainage concerns, or structural vulnerability may warrant a closer look.
                  </p>
                  <p style="margin:0 0 16px;">
                    We recommend scheduling a short assessment call so we can walk through your results and identify the most practical next steps for your specific property.
                  </p>
                </div>
                <div style="margin-top:28px;">
                  <a href="${meetingLink}" style="display:inline-block;background:#7f1d1d;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-size:15px;font-weight:700;">
                    Book your assessment call
                  </a>
                </div>
                <div style="margin-top:28px;padding-top:22px;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.7;color:#6b7280;">
                  <p style="margin:0 0 10px;">Oiriunu helps homeowners identify practical ways to reduce property risk through both DIY solutions and professional support.</p>
                  <p style="margin:0 0 10px;">Oiriunu may earn commission through affiliate marketing links for DIY purchases and may also earn commission on referral services.</p>
                  <p style="margin:0;">If you have questions, simply reply to this email.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `,
    };
  }

  // Step 1 — 24 hours later: follow-up for those who haven't booked yet
  return {
    subject: `Still thinking about your property risk, ${firstName}?`,
    html: `
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
        A quick follow-up on your Oiriunu risk assessment.
      </div>
      <div style="margin:0;padding:0;background:#f4f7f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
        <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <div style="background:#7f1d1d;padding:20px 28px;">
              <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#fecaca;font-weight:700;">
                Oiriunu — Follow-Up
              </div>
            </div>
            <div style="padding:36px 28px 18px;">
              <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:#111827;font-weight:700;">
                We wanted to follow up on your score
              </h1>
              <div style="font-size:16px;line-height:1.75;color:#374151;">
                <p style="margin:0 0 16px;">Hi ${esc(firstName)},</p>
                <p style="margin:0 0 16px;">
                  Yesterday we shared that your Oiriunu property risk score is <strong>${esc(String(score))} out of 100</strong>. We wanted to follow up in case you had questions or wanted to talk through what that score means for your specific situation.
                </p>
                <p style="margin:0 0 16px;">
                  The assessment call is short — typically 15 to 20 minutes. We will walk through your results, answer any questions, and outline the most practical options for your property and budget. There is no obligation.
                </p>
                <p style="margin:0 0 16px;">
                  If now is not the right time, no problem. You can always come back to your results when you are ready.
                </p>
              </div>
              <div style="margin-top:28px;">
                <a href="${meetingLink}" style="display:inline-block;background:#7f1d1d;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-size:15px;font-weight:700;">
                  Schedule your free assessment call
                </a>
              </div>
              <div style="margin-top:28px;padding-top:22px;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.7;color:#6b7280;">
                <p style="margin:0 0 10px;">Oiriunu helps homeowners identify practical ways to reduce property risk through both DIY solutions and professional support.</p>
                <p style="margin:0 0 10px;">Oiriunu may earn commission through affiliate marketing links for DIY purchases and may also earn commission on referral services.</p>
                <p style="margin:0;">If you have questions, simply reply to this email.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
  };
}

async function sendStandardEmail(row) {
  if (!resend) throw new Error("Resend is not configured.");
  const content = buildEmailContent(row);
  return resend.emails.send({
    from: process.env.ALERT_FROM_EMAIL,
    to: row.email,
    subject: content.subject,
    html: content.html,
  });
}

async function sendUrgentEmail(row) {
  if (!resend) throw new Error("Resend is not configured.");
  const content = buildUrgentEmailContent(row);
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

if (row.nurture_type === "urgent") {
  await sendUrgentEmail(row);
} else {
 await sendStandardEmail(row);
}

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