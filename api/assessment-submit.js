import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PROPERTY_TYPES = [
  "Single Family Home",
  "Condo / Townhouse",
  "Multi-Family",
  "Commercial"
];

const BASEMENTS = [
  "Yes – Full finished basement",
  "Yes - Unfinished basement",
  "Yes- Partial / crawlspace",
  "No basement"
];

const YES_NO_NOT_SURE = ["Yes", "No", "Not sure"];
const DRAINAGE = ["Yes", "No", "Sometimes"];

const INTEREST = [
  "Water Diversion Solutions",
  "Entry Point Protection",
  "Sump Pumps & Water Removal",
  "Infrastructure Protection",
  "Emergency Barriers",
  "Full Professional Assessment",
  "General Information"
];

function validate(body) {
  if (!body.firstName) throw new Error("Missing firstName");
  if (!body.lastName) throw new Error("Missing lastName");
  if (!body.email) throw new Error("Missing email");
  if (!body.streetAddress) throw new Error("Missing streetAddress");
  if (!body.city) throw new Error("Missing city");
  if (!body.state) throw new Error("Missing state");
  if (!body.zipCode) throw new Error("Missing zipCode");
  if (!body.yearBuilt) throw new Error("Missing yearBuilt");
  if (!body.phone) throw new Error("Missing phone");
  if (!body.fullName) throw new Error("Missing fullName");

  if (!PROPERTY_TYPES.includes(body.propertyType)) {
    throw new Error("Invalid propertyType");
  }

  if (!BASEMENTS.includes(body.basementType)) {
    throw new Error("Invalid basementType");
  }

  if (!YES_NO_NOT_SURE.includes(body.treesOverhang)) {
    throw new Error("Invalid treesOverhang");
  }

  if (!YES_NO_NOT_SURE.includes(body.priorFloodDamage)) {
    throw new Error("Invalid priorFloodDamage");
  }

  if (!DRAINAGE.includes(body.drainageIssues)) {
    throw new Error("Invalid drainageIssues");
  }

  if (!Array.isArray(body.interestArea) || body.interestArea.length === 0) {
    throw new Error("interestArea must be a non-empty array");
  }

  body.interestArea.forEach((item) => {
    if (!INTEREST.includes(item)) {
      throw new Error("Invalid interestArea value");
    }
  });
}

async function sendToHubSpot(body) {
  const response = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      properties: {
        email: body.email.toLowerCase(),
        firstname: body.firstName,
        lastname: body.lastName,
        phone: body.phone,
        address: body.streetAddress,
        city: body.city,
        state: body.state,
        zip: body.zipCode,
        year_built: String(body.yearBuilt),
        property_type: body.propertyType,
        basement_type: body.basementType,
        trees_overhang: body.treesOverhang,
        prior_flood_damage: body.priorFloodDamage,
        drainage_issues: body.drainageIssues,
        interest_area: body.interestArea.join("; "),
        risk_score: body.riskScore ? String(body.riskScore) : ""
      }
    })
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "HubSpot sync failed");
  }

  return result;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body;

    validate(body);

    const { data, error } = await supabase
      .from("risk_assessments")
      .insert([
        {
          first_name: body.firstName,
          last_name: body.lastName,
          full_name: body.fullName,
          email: body.email.toLowerCase(),
          phone: body.phone,
          street_address: body.streetAddress,
          city: body.city,
          state: body.state,
          zip_code: body.zipCode,
          year_built: body.yearBuilt,
          property_type: body.propertyType,
          basement_type: body.basementType,
          trees_overhang: body.treesOverhang,
          prior_flood_damage: body.priorFloodDamage,
          drainage_issues: body.drainageIssues,
          interest_area: body.interestArea,
          risk_score: body.riskScore || null,
          assessment_answers: body.assessmentAnswers || {},
          utm_source: body.utm?.source || null,
          utm_medium: body.utm?.medium || null,
          utm_campaign: body.utm?.campaign || null,
          utm_term: body.utm?.term || null,
          utm_content: body.utm?.content || null,
          raw_payload: body
        }
      ])
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const hubspotResult = await sendToHubSpot(body);

    return res.status(200).json({
      message: "Saved to database and sent to HubSpot",
      id: data[0].id,
      hubspotId: hubspotResult.id
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}