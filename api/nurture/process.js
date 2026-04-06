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
const APP_URL = (process.env.APP_URL || "https://flood-risk-tool-v4-dkrh.vercel.app").replace(/\/$/, "");

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

// ─── Score card helpers ───────────────────────────────────────────────────────

function getRiskTier(score) {
  if (score >= 70) return "Moderate Risk";
  if (score >= 40) return "Some Risk";
  return "Lower Risk";
}

function isYes(value) {
  return ["yes", "true", "y", "1"].includes(String(value ?? "").trim().toLowerCase());
}

function getTopFactors(row) {
  const factors = [];

  if (isYes(row.prior_flood_damage)) {
    factors.push("Prior flood damage reported on this property");
  }
  if (isYes(row.drainage_issues)) {
    factors.push("Drainage issues identified");
  }
  const basement = String(row.basement_type ?? "").trim().toLowerCase();
  if (basement && !["none", "no basement", "slab", ""].includes(basement)) {
    factors.push("Basement or below-grade space present");
  }
  if (isYes(row.trees_overhang)) {
    factors.push("Trees overhanging the structure");
  }

  // Fall back to assessment sub-scores if available
  const answers = row.assessment_answers || {};
  if (factors.length < 2 && Number(answers.floodExposureScore || 0) >= 60) {
    factors.push("Elevated flood zone exposure for this address");
  }
  if (factors.length < 2 && Number(answers.insuranceRiskScore || 0) >= 70) {
    factors.push("Insurance-related risk factors identified");
  }

  return factors.slice(0, 3);
}

function buildScoreCard(row, accentColor) {
  const scoreRaw = Number(row.risk_score ?? 0);
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0;
  const tier  = getRiskTier(score);
  const factors = getTopFactors(row);
  const color   = accentColor || "#163c35";
  const lightBg = color === "#7f1d1d" ? "#fef2f2" : "#f0f7f5";
  const border  = color === "#7f1d1d" ? "#fecaca" : "#a7d4c8";
  const numColor = color === "#7f1d1d" ? "#991b1b" : "#163c35";

  const factorRows = factors.length > 0
    ? factors.map(f => `
        <tr>
          <td style="padding:4px 0;font-size:14px;color:#374151;line-height:1.5;">
            <span style="color:${color};font-weight:700;padding-right:6px;">&#8594;</span>${esc(f)}
          </td>
        </tr>`).join("")
    : `<tr><td style="padding:4px 0;font-size:14px;color:#6b7280;">No significant additional risk factors on file.</td></tr>`;

  return `
    <div style="background:${lightBg};border:1px solid ${border};border-radius:12px;padding:20px 22px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
        <tr>
          <td style="vertical-align:middle;">
            <span style="font-size:44px;font-weight:700;color:${numColor};line-height:1;">${esc(String(score))}</span>
            <span style="font-size:15px;color:#6b7280;font-weight:600;">&thinsp;/ 100</span>
          </td>
          <td style="vertical-align:middle;text-align:right;">
            <span style="background:${color};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:5px 13px;border-radius:20px;">${esc(tier)}</span>
          </td>
        </tr>
      </table>
      <div style="font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;">Top Contributing Factors</div>
      <table style="width:100%;border-collapse:collapse;">
        ${factorRows}
      </table>
    </div>`;
}

// ─── Standard email sequences (low + medium) ─────────────────────────────────

function buildEmailContent(row) {
  const firstName   = row.first_name || "there";
  const scoreRaw    = Number(row.risk_score ?? 0);
  const score       = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0;
  const location    = [row.city, row.state].filter(Boolean).join(", ");
  const isMedium    = row.nurture_type === "medium";

  const solutionsLink  = "https://oiriunu.com/flood-prevention-solutions-texas/flood-protection-texas/#solutions";
  const meetingLink    = "https://meetings-na2.hubspot.com/nikolas-kron/assessment-meeting";
  const drainageLink   = "https://oiriunu.com/flood-prevention-solutions-texas/water-diversion-texas/";
  const entryPointLink = "https://oiriunu.com/flood-prevention-solutions-texas/entry-point-protection/";
  const waterRemovalLink = "https://oiriunu.com/flood-prevention-solutions-texas/water-removal/";
  const assessmentLink = "https://oiriunu.com/flood-risk-assessment/";

  function wrapEmail({ preheader, headerColor, title, bodyHtml, buttonText, buttonUrl }) {
    const hColor = headerColor || "#163c35";
    const unsubUrl = `${APP_URL}/api/unsubscribe?id=${esc(row.id)}`;
    return `
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}</div>
      <div style="margin:0;padding:0;background:#f4f7f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
        <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <div style="background:${hColor};padding:20px 28px;">
              <div style="font-size:12px;line-height:1.4;letter-spacing:.08em;text-transform:uppercase;color:#d1e7e1;font-weight:700;">Oiriunu</div>
            </div>
            <div style="padding:36px 28px 18px;">
              <h1 style="margin:0 0 22px;font-size:28px;line-height:1.2;color:#111827;font-weight:700;">${title}</h1>
              <div style="font-size:16px;line-height:1.75;color:#374151;">${bodyHtml}</div>
              <div style="margin-top:28px;">
                <a href="${buttonUrl}" style="display:inline-block;background:${hColor};color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-size:15px;font-weight:700;">${buttonText}</a>
              </div>
              <div style="margin-top:28px;padding-top:22px;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.7;color:#6b7280;">
                <p style="margin:0 0 10px;">Oiriunu helps homeowners identify practical ways to reduce property risk through both DIY solutions and professional support.</p>
                <p style="margin:0 0 10px;">Oiriunu may earn commission through affiliate marketing links for DIY purchases and may also earn commission on referral services.</p>
                <p style="margin:0 0 10px;">If you have questions, simply reply to this email.</p>
                <p style="margin:0;padding-top:10px;border-top:1px solid #e5e7eb;">
                  <a href="${unsubUrl}" style="color:#9ca3af;font-size:12px;text-decoration:underline;">Unsubscribe from these emails</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  // ── LOW RISK ──────────────────────────────────────────────────────────────

  if (!isMedium) {

    if (row.nurture_step === 0) {
      return {
        subject: "Your property has a lower flood risk score — here's what that means",
        html: wrapEmail({
          preheader: "Good news: your Oiriunu flood risk score puts your property in a lower-risk category.",
          title: "Good news about your flood risk score",
          bodyHtml: `
            <p style="margin:0 0 20px;">Hi ${esc(firstName)},</p>
            ${buildScoreCard(row, "#163c35")}
            <p style="margin:0 0 16px;">
              Your Oiriunu assessment${location ? ` for <strong>${esc(location)}</strong>` : ""} is complete. A score of <strong>${esc(String(score))}/100</strong> places your property in a lower flood risk category — that is genuinely good news.
            </p>
            <p style="margin:0 0 16px;">
              Lower-risk properties face less immediate flood threat, but even well-positioned homes benefit from a small amount of preparation. Flood patterns can shift, drainage conditions change over time, and a few simple measures can provide meaningful protection against the unexpected.
            </p>
            <p style="margin:0 0 16px;">
              Take a look at what's available — many options are affordable and straightforward to put in place.
            </p>`,
          buttonText: "Explore Flood Protection Options",
          buttonUrl: solutionsLink,
        }),
      };
    }

    if (row.nurture_step === 1) {
      return {
        subject: "A few affordable ways to stay ahead of flood risk",
        html: wrapEmail({
          preheader: "Simple, low-cost steps that homeowners often overlook.",
          title: "Simple steps worth considering",
          bodyHtml: `
            <p style="margin:0 0 16px;">Hi ${esc(firstName)},</p>
            <p style="margin:0 0 16px;">
              Your property has a lower risk profile, but a modest level of preparedness goes a long way. Here are a few practical areas to consider — most are DIY-friendly and budget-conscious.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 20px;">
              <tr>
                <td style="padding:13px 0;border-top:1px solid #e5e7eb;">
                  <a href="${drainageLink}" style="color:#163c35;font-weight:700;text-decoration:none;font-size:16px;">Water diversion</a>
                  <div style="margin-top:5px;font-size:14px;line-height:1.6;color:#4b5563;">Redirecting surface water away from your foundation is one of the most cost-effective precautions you can take.</div>
                </td>
              </tr>
              <tr>
                <td style="padding:13px 0;border-top:1px solid #e5e7eb;">
                  <a href="${entryPointLink}" style="color:#163c35;font-weight:700;text-decoration:none;font-size:16px;">Entry point protection</a>
                  <div style="margin-top:5px;font-size:14px;line-height:1.6;color:#4b5563;">Door barriers and flood shields are easy to store and deploy quickly when conditions change.</div>
                </td>
              </tr>
              <tr>
                <td style="padding:13px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
                  <a href="${waterRemovalLink}" style="color:#163c35;font-weight:700;text-decoration:none;font-size:16px;">Water removal tools</a>
                  <div style="margin-top:5px;font-size:14px;line-height:1.6;color:#4b5563;">A quality sump pump or wet vac is one of those purchases you hope you never need — but are glad you have.</div>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 16px;">
              Small investments now tend to outperform larger ones made in a hurry after water has already entered the home.
            </p>`,
          buttonText: "Browse DIY Flood Solutions",
          buttonUrl: solutionsLink,
        }),
      };
    }

    // Low step 2+: referral-focused
    return {
      subject: "Know someone who should check their flood risk?",
      html: wrapEmail({
        preheader: "Oiriunu is free to use — pass it along to a neighbor who might need it.",
        title: "Help a neighbor stay protected",
        bodyHtml: `
          <p style="margin:0 0 16px;">Hi ${esc(firstName)},</p>
          <p style="margin:0 0 16px;">
            Your property is in good shape from a flood risk perspective. We hope the assessment gave you a clearer picture and some useful context.
          </p>
          <p style="margin:0 0 16px;">
            If you know someone — a neighbor, family member, or friend — in an area that floods, or who has older drainage infrastructure, they may find the tool just as useful. The assessment is free and takes a few minutes.
          </p>
          <p style="margin:0 0 16px;">
            Flood risk is one of those things people tend not to look into until it's too late. A heads-up from someone they trust could make a real difference.
          </p>
          <p style="margin:0 0 16px;">
            Simply send them this link and they can run their own assessment anytime.
          </p>`,
        buttonText: "Share the Free Assessment Tool",
        buttonUrl: assessmentLink,
      }),
    };
  }

  // ── MEDIUM RISK ───────────────────────────────────────────────────────────

  if (row.nurture_step === 0) {
    return {
      subject: `Your property risk score is ${score}/100 — what's behind it`,
      html: wrapEmail({
        preheader: `Your Oiriunu score of ${score}/100 reflects a moderate level of property risk. Here's what that means.`,
        title: "Your risk score is worth paying attention to",
        bodyHtml: `
          <p style="margin:0 0 20px;">Hi ${esc(firstName)},</p>
          ${buildScoreCard(row, "#163c35")}
          <p style="margin:0 0 16px;">
            Your Oiriunu assessment${location ? ` for <strong>${esc(location)}</strong>` : ""} is complete. A score of <strong>${esc(String(score))}/100</strong> places your property in a moderate risk range — meaning there are real factors worth addressing, even if the situation is not critical today.
          </p>
          <p style="margin:0 0 16px;">
            Moderate scores often reflect a combination of flood zone proximity, property-specific conditions, and drainage factors rather than a single obvious problem. The good news is that moderate risk is also where targeted action tends to have the most impact.
          </p>
          <p style="margin:0 0 16px;">
            A good starting point is reviewing what flood protection options are available for your type of property and situation.
          </p>`,
        buttonText: "Explore Flood Protection Options",
        buttonUrl: solutionsLink,
      }),
    };
  }

  if (row.nurture_step === 1) {
    return {
      subject: "Steps that can meaningfully lower your flood risk",
      html: wrapEmail({
        preheader: "Practical ways to reduce your property's exposure — starting today.",
        title: "Practical ways to protect your property",
        bodyHtml: `
          <p style="margin:0 0 16px;">Hi ${esc(firstName)},</p>
          <p style="margin:0 0 16px;">
            With a moderate risk score, there are several concrete steps that can meaningfully reduce your property's exposure. These range from straightforward DIY measures to more structural improvements — the right fit depends on your specific situation.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 20px;">
            <tr>
              <td style="padding:13px 0;border-top:1px solid #e5e7eb;">
                <a href="${drainageLink}" style="color:#163c35;font-weight:700;text-decoration:none;font-size:16px;">Drainage improvements</a>
                <div style="margin-top:5px;font-size:14px;line-height:1.6;color:#4b5563;">Redirecting surface runoff away from the foundation addresses one of the most common contributors to moderate risk scores.</div>
              </td>
            </tr>
            <tr>
              <td style="padding:13px 0;border-top:1px solid #e5e7eb;">
                <a href="${entryPointLink}" style="color:#163c35;font-weight:700;text-decoration:none;font-size:16px;">Entry point protection</a>
                <div style="margin-top:5px;font-size:14px;line-height:1.6;color:#4b5563;">Doors, windows, and low openings are common water entry points. Barriers and seals are effective and often easy to install.</div>
              </td>
            </tr>
            <tr>
              <td style="padding:13px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
                <a href="${waterRemovalLink}" style="color:#163c35;font-weight:700;text-decoration:none;font-size:16px;">Water removal planning</a>
                <div style="margin-top:5px;font-size:14px;line-height:1.6;color:#4b5563;">Having the right equipment in place before a weather event can significantly limit interior damage.</div>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 16px;">
            If you would prefer a guided review of your specific property and options, we are also happy to walk through it with you on a short call.
          </p>`,
        buttonText: "Browse Flood Protection Solutions",
        buttonUrl: solutionsLink,
      }),
    };
  }

  // Medium step 2+: soft ask for assessment call
  return {
    subject: "Ready to talk through your flood risk options?",
    html: wrapEmail({
      preheader: "A short call to walk through your results and identify the most practical next steps.",
      title: "A quick call could save you thousands",
      bodyHtml: `
        <p style="margin:0 0 16px;">Hi ${esc(firstName)},</p>
        <p style="margin:0 0 16px;">
          Over the past few days we have shared some context about your score of <strong>${esc(String(score))}/100</strong> and the steps that can help address it. If you are still weighing your options, a short assessment call is often the most efficient next step.
        </p>
        <p style="margin:0 0 16px;">
          The call typically takes 15 to 20 minutes. We will walk through your specific results, answer any questions, and outline the most practical and cost-effective options for your property. There is no obligation.
        </p>
        <p style="margin:0 0 16px;">
          Most homeowners find it useful simply to have a clearer picture of what they are dealing with and what it would actually take to address it.
        </p>`,
      buttonText: "Schedule Your Free Assessment Call",
      buttonUrl: meetingLink,
    }),
  };
}

// ─── Schedule for next nurture send ──────────────────────────────────────────

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

// ─── Urgent email sequence (high risk, no meeting booked) ────────────────────

function buildUrgentEmailContent(row) {
  const firstName = row.first_name || "there";
  const scoreRaw  = Number(row.risk_score ?? 0);
  const score     = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0;
  const location  = [row.city, row.state].filter(Boolean).join(", ");
  const meetingLink = "https://meetings-na2.hubspot.com/nikolas-kron/assessment-meeting";

  // Step 0 — immediate: score callout, book a call
  if (row.nurture_step === 0) {
    const unsubUrl0 = `${APP_URL}/api/unsubscribe?id=${esc(row.id)}`;
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
                <h1 style="margin:0 0 22px;font-size:28px;line-height:1.2;color:#111827;font-weight:700;">
                  Hi ${esc(firstName)}, your property risk score is ${esc(String(score))}/100
                </h1>
                ${buildScoreCard(row, "#7f1d1d")}
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
                  <p style="margin:0 0 10px;">Reply to this email with any questions — we read every response.</p>
                  <p style="margin:0;padding-top:10px;border-top:1px solid #e5e7eb;">
                    <a href="${unsubUrl0}" style="color:#9ca3af;font-size:12px;text-decoration:underline;">Unsubscribe from these emails</a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>`,
    };
  }

  // Step 1 — 24 hours later: follow-up for those who haven't booked yet
  const unsubUrl1 = `${APP_URL}/api/unsubscribe?id=${esc(row.id)}`;
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
                <p style="margin:0 0 10px;">If you have questions, simply reply to this email.</p>
                <p style="margin:0;padding-top:10px;border-top:1px solid #e5e7eb;">
                  <a href="${unsubUrl1}" style="color:#9ca3af;font-size:12px;text-decoration:underline;">Unsubscribe from these emails</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>`,
  };
}

// ─── Send helpers ─────────────────────────────────────────────────────────────

async function sendStandardEmail(row) {
  if (!resend) throw new Error("Resend is not configured.");
  const content = buildEmailContent(row);
  return resend.emails.send({
    from: process.env.ALERT_FROM_EMAIL,
    to: row.email,
    reply_to: process.env.ALERT_FROM_EMAIL,
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
    reply_to: process.env.ALERT_FROM_EMAIL,
    subject: content.subject,
    html: content.html,
  });
}

// ─── Handler (cron entry point) ───────────────────────────────────────────────

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
      .neq("email_unsubscribed", true)
      .order("nurture_next_send_at", { ascending: true })
      .limit(limit);

    if (error) throw error;

    const results = [];

    for (const row of rows || []) {
      try {
        if (!row.email) {
          results.push({ id: row.id, ok: false, skipped: true, reason: "Missing email" });
          continue;
        }

        if (row.callback_requested === true) {
          results.push({ id: row.id, email: row.email, ok: false, skipped: true, reason: "Callback requested" });
          continue;
        }

        if (row.nurture_type === "urgent" || row.nurture_type === "high_no_callback") {
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