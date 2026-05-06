export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const token = process.env.HUBSPOT_PRIVATE_TOKEN;
    if (!token) {
      return res.status(500).json({ error: "Missing HUBSPOT_PRIVATE_TOKEN" });
    }

    const {
      firstName = "",
      lastName = "",
      email = "",
      phone = "",
      address = "",
      zip = "",
      score = "",
      tier = "",
      followUpRequested = false,
      followUpRequestedValue = "",
      reportSummary = "",
      locationLabel = "",
      propertyType = "",
      yearBuilt = "",
      basement = "",
      interest = "",
      treesOverhanging = "",
      priorFloodDamage = "",
      drainageIssues = ""
    } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const followUpValue =
      typeof followUpRequestedValue === "string" && followUpRequestedValue.trim()
        ? followUpRequestedValue.trim()
        : followUpRequested
          ? "True"
          : "False";

    const properties = {
      firstname: firstName,
      lastname: lastName,
      email,
      phone,

      flood_address: address,
      flood_property_zip: zip,
      flood_risk_score:
        score !== "" && score !== null && score !== undefined ? String(score) : "",
      flood_risk_tier: tier,
      flood_follow_up_requested: followUpValue,
      flood_report_summary: reportSummary,
      flood_assessment_submitted_at: new Date().toISOString(),

      flood_location_label: locationLabel,
      property_type: propertyType,
      year_built:
        yearBuilt !== "" && yearBuilt !== null && yearBuilt !== undefined
          ? String(yearBuilt)
          : "",
      has_basement: basement,
      flood_interest: interest,
      trees_overhanging: treesOverhanging,
      prior_flood_damage: priorFloodDamage,
      drainage_issues: drainageIssues
    };

    const cleanedProperties = Object.fromEntries(
      Object.entries(properties).filter(
        ([, value]) => value !== "" && value !== null && value !== undefined
      )
    );

    let hsRes = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ properties: cleanedProperties })
      }
    );

    if (hsRes.status === 404) {
      hsRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ properties: cleanedProperties })
      });
    }

    const data = await hsRes.json();

    if (!hsRes.ok) {
      return res.status(hsRes.status).json({
        error: data?.message || "HubSpot request failed",
        details: data
      });
    }

    return res.status(200).json({ ok: true, contactId: data?.id || null });
  } catch (err) {
    console.error("HubSpot contact API error:", err);
    return res.status(500).json({ error: "Server error saving contact" });
  }
}
