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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body;

    validate(body);

    console.log("Validated data:", body);

    return res.status(200).json({ message: "Validation passed" });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}