import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

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
 if (body.requirePhone && !body.phone) throw new Error("Missing phone");
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
  const properties = {
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
    prior_flood_damage:
      body.priorFloodDamage === "Yes"
        ? "True"
        : body.priorFloodDamage === "No"
        ? "False"
        : "Not sure",
    drainage_issues:
      body.drainageIssues === "Yes"
        ? "True"
        : body.drainageIssues === "No"
        ? "False"
        : "Sometimes",
    interest_area: body.interestArea.join("; "),
    risk_score: body.riskScore ? String(body.riskScore) : ""
  };

  const response = await fetch(
    "https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        inputs: [
          {
            idProperty: "email",
            id: body.email.toLowerCase(),
            properties
          }
        ]
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "HubSpot sync failed");
  }

  return result.results?.[0] || result;
}
function getDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeAddress(streetAddress, zipCode) {
  const address = encodeURIComponent(`${streetAddress}, ${zipCode}`);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== "OK" || !json.results[0]) {
    throw new Error(`Geocoding failed: ${json.status}`);
  }
  return json.results[0].geometry.location;
}

async function sendNotificationEmail(body) {
  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: process.env.NOTIFY_TO_EMAIL,
    subject: `New Flood Risk Assessment: ${body.firstName} ${body.lastName}`,
    html: `
      <h2>New Risk Assessment Submission</h2>
      <p><strong>Name:</strong> ${body.firstName} ${body.lastName}</p>
      <p><strong>Email:</strong> ${body.email}</p>
      <p><strong>Phone:</strong> ${body.phone}</p>
      <p><strong>Address:</strong> ${body.streetAddress}, ${body.city}, ${body.state} ${body.zipCode}</p>
      <p><strong>Year Built:</strong> ${body.yearBuilt}</p>
      <p><strong>Property Type:</strong> ${body.propertyType}</p>
      <p><strong>Basement:</strong> ${body.basementType}</p>
      <p><strong>Trees Overhang:</strong> ${body.treesOverhang}</p>
      <p><strong>Prior Flood Damage:</strong> ${body.priorFloodDamage}</p>
      <p><strong>Drainage Issues:</strong> ${body.drainageIssues}</p>
      <p><strong>Interest Areas:</strong> ${body.interestArea.join(", ")}</p>
      <p><strong>Risk Score:</strong> ${body.riskScore ?? "N/A"}</p>
    `
  });

  if (result.error) {
    throw new Error(result.error.message || "Email send failed");
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

    try {
      const geo = await geocodeAddress(body.streetAddress, body.zipCode);

      const { data: zones } = await supabase
        .from("geo_campaign_zones")
        .select("*")
        .eq("active", true);

      const matchedZone = zones?.find(
        (zone) =>
          getDistanceMiles(geo.lat, geo.lng, zone.center_lat, zone.center_lng) <=
          zone.radius_miles
      );

      await supabase
        .from("risk_assessments")
        .update({
          geo_campaign_zone_id: matchedZone?.id || null,
          campaign_zone: matchedZone?.zone_name || null,
          parcel_risk_tier: null,
          bayou_corridor: matchedZone?.bayou_corridor || null,
          risk_driver_summary: matchedZone?.primary_risk_driver || null
        })
        .eq("id", data[0].id);
    } catch (enrichErr) {
      console.error("Geo enrichment failed:", enrichErr.message);
    }

    const hubspotResult = await sendToHubSpot(body);

let emailResult = null;
let emailError = null;

try {
  emailResult = await sendNotificationEmail(body);
} catch (err) {
  emailError = err.message;
  console.error("Email send failed:", err.message);
}

return res.status(200).json({
  message: "Saved to database and sent to HubSpot",
  id: data[0].id,
  hubspotId: hubspotResult.id,
  emailId: emailResult?.data?.id || null,
  emailError
});
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}