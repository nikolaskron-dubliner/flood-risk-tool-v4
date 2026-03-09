export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const HUBSPOT_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

    if (!HUBSPOT_TOKEN) {
      return res.status(500).json({ error: "Missing HubSpot token" });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      address,
      zip,
      score,
      tier,
      propertyType,
      yearBuilt,
      basement,
      treesOverhanging,
      priorFloodDamage,
      drainageIssues,
      followUpRequested,
      followUpRequestedValue,
      reportSummary,
      locationLabel
    } = req.body || {};

    const response = await fetch(
      "https://api.hubapi.com/crm/v3/objects/contacts",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HUBSPOT_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          properties: {
            firstname: firstName,
            lastname: lastName,
            email,
            phone,
            address,
            zip,
            flood_risk_score: score,
            flood_risk_tier: tier,
            property_type: propertyType,
            year_built: yearBuilt,
            has_basement: basement,
            trees_overhanging: treesOverhanging,
            prior_flood_damage: priorFloodDamage,
            drainage_issues: drainageIssues,
            flood_follow_up_requested: followUpRequestedValue,
            flood_report_summary: reportSummary,
            flood_location_label: locationLabel
          }
        })
      }
    );

    const data = await response.json();

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "HubSpot request failed" });
  }
}