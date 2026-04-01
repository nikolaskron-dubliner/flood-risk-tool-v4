import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function page(success, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${success ? "Unsubscribed" : "Error"} — Oiriunu</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#f4f7f8;font-family:Arial,Helvetica,sans-serif;padding:40px 16px}
    .card{max-width:480px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden}
    .bar{background:${success ? "#163c35" : "#7f1d1d"};height:6px}
    .inner{padding:44px 36px;text-align:center}
    .icon{font-size:40px;margin-bottom:18px}
    h1{font-size:22px;font-weight:700;color:#111827;margin-bottom:10px}
    p{font-size:15px;color:#6b7280;line-height:1.6}
  </style>
</head>
<body>
  <div class="card">
    <div class="bar"></div>
    <div class="inner">
      <div class="icon">${success ? "✓" : "⚠"}</div>
      <h1>${success ? "You've been unsubscribed" : "Something went wrong"}</h1>
      <p>${message}</p>
    </div>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  // Accept GET (clicked from email) or POST (programmatic)
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).end();
  }

  const id = req.query?.id || req.body?.id;

  if (!id) {
    return res
      .status(400)
      .setHeader("Content-Type", "text/html")
      .send(page(false, "This unsubscribe link is invalid or has expired. Reply to any Oiriunu email to opt out manually."));
  }

  // Verify the record exists before updating
  const { data: existing, error: fetchError } = await supabase
    .from("risk_assessments")
    .select("id, email, email_unsubscribed")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    console.error("Unsubscribe fetch error:", fetchError);
    return res
      .status(500)
      .setHeader("Content-Type", "text/html")
      .send(page(false, "Something went wrong on our end. Please reply to any Oiriunu email and we will remove you manually."));
  }

  if (!existing) {
    // Return success anyway — don't expose whether an ID is valid
    return res
      .status(200)
      .setHeader("Content-Type", "text/html")
      .send(page(true, "You have been removed from our email list. You will not receive any further emails from Oiriunu."));
  }

  if (existing.email_unsubscribed === true) {
    // Already unsubscribed — idempotent
    return res
      .status(200)
      .setHeader("Content-Type", "text/html")
      .send(page(true, "You are already unsubscribed. You will not receive any further emails from Oiriunu."));
  }

  const { error: updateError } = await supabase
    .from("risk_assessments")
    .update({
      email_unsubscribed: true,
      nurture_status: "unsubscribed",
    })
    .eq("id", id);

  if (updateError) {
    console.error("Unsubscribe update error:", updateError);
    return res
      .status(500)
      .setHeader("Content-Type", "text/html")
      .send(page(false, "Something went wrong on our end. Please reply to any Oiriunu email and we will remove you manually."));
  }

  return res
    .status(200)
    .setHeader("Content-Type", "text/html")
    .send(page(true, "You have been removed from our email list. You will not receive any further emails from Oiriunu."));
}