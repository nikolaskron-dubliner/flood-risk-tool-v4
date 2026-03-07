export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const { form = {}, location = "", prompt } = req.body || {};
    if (!form || typeof form !== "object") {
      return res.status(400).json({ error: "Missing form data" });
    }

    const effectivePrompt = typeof prompt === "string" && prompt.trim()
      ? prompt.trim()
      : buildPrompt(form, location);

    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: effectivePrompt }]
            }
          ],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: "application/json"
          }
        })
      }
    );

    const raw = await geminiRes.json();

    if (!geminiRes.ok) {
      return res.status(geminiRes.status).json({
        error: raw?.error?.message || "Gemini request failed",
        details: raw
      });
    }

    const text = extractText(raw);
    const parsed = safeJsonParse(text);
    const normalized = normalizeReport(parsed, form, location);

    return res.status(200).json(normalized);
  } catch (err) {
    console.error("Flood report API error:", err);
    return res.status(500).json({
      error: "Server error while generating flood report"
    });
  }
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}

function safeJsonParse(text) {
  if (!text || typeof text !== "string") return null;

  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

function normalizeReport(report, form, location) {
  const fallback = buildFallbackReport(form, location);
  const src = report && typeof report === "object" ? report : {};

  const score = clampInteger(src.score, fallback.score, 0, 100);
  const tier = validTier(src.tier) ? src.tier : tierFromScore(score);

  return {
    score,
    tier,
    locationLabel: cleanString(src.locationLabel) || fallback.locationLabel,
    bullets: {
      geographic: cleanString(src?.bullets?.geographic) || fallback.bullets.geographic,
      historical: cleanString(src?.bullets?.historical) || fallback.bullets.historical,
      climate: cleanString(src?.bullets?.climate) || fallback.bullets.climate
    },
    financial: {
      annualRisk: cleanString(src?.financial?.annualRisk) || fallback.financial.annualRisk,
      fiveYearNoAction: cleanString(src?.financial?.fiveYearNoAction) || fallback.financial.fiveYearNoAction,
      propertyValueImpact: cleanString(src?.financial?.propertyValueImpact) || fallback.financial.propertyValueImpact,
      insurancePremiumRange: cleanString(src?.financial?.insurancePremiumRange) || fallback.financial.insurancePremiumRange,
      narrative: cleanString(src?.financial?.narrative) || fallback.financial.narrative
    },
    diyCategories: normalizeCategories(src.diyCategories, fallback.diyCategories),
    catSavings: normalizeSavings(src.catSavings, fallback.catSavings),
    proServices: normalizeServices(src.proServices, fallback.proServices)
  };
}

function buildFallbackReport(form, location) {
  const hasBasement = form?.basement && form.basement !== "No basement";
  const hasTrees = form?.treesOverhanging === "Yes";
  const hadPriorFlood = form?.priorFloodDamage === "Yes";
  const drainageIssues = form?.drainageIssues === "Yes" || form?.drainageIssues === "Sometimes";

  let baseScore = 55;
  if (hasBasement) baseScore += 10;
  if (hasTrees) baseScore += 8;
  if (hadPriorFlood) baseScore += 15;
  if (drainageIssues) baseScore += 12;

  const score = Math.max(15, Math.min(96, baseScore));
  const tier = tierFromScore(score);
  const place = cleanString(location) || cleanString(form?.zip) || "your area";

  return {
    score,
    tier,
    locationLabel: place,
    bullets: {
      geographic: `The property area around ${place} should be treated as vulnerable to heavy-rain runoff and localized water accumulation during strong storm events.`,
      historical: hadPriorFlood
        ? "Prior flooding at this property materially increases the probability of repeat damage if mitigation is delayed."
        : "Regional flood history and recurring severe-rain events indicate that even properties outside the highest-risk zones can still face damaging water intrusion.",
      climate: "Short-duration rainfall intensity is increasing in many U.S. markets, which raises flash-flood and drainage overload risk over time."
    },
    financial: {
      annualRisk: score >= 75 ? "$7,500–$22,000" : score >= 55 ? "$4,000–$14,000" : "$1,800–$7,500",
      fiveYearNoAction: score >= 75 ? "$37,500–$110,000" : score >= 55 ? "$20,000–$70,000" : "$9,000–$37,500",
      propertyValueImpact: score >= 75 ? "-6% to -12%" : score >= 55 ? "-3% to -8%" : "-1% to -4%",
      insurancePremiumRange: score >= 75 ? "$2,800–$7,500/yr" : score >= 55 ? "$1,600–$4,800/yr" : "$900–$2,800/yr",
      narrative: `Without mitigation, repeated water intrusion can damage ${hasBasement ? "basement finishes, foundation walls, mechanical systems, and interior contents" : "foundations, lower-level finishes, mechanical systems, and interior contents"}. As risk indicators accumulate, insurance pricing, resale perception, and financing flexibility can deteriorate.`
    },
    diyCategories: ["diversion", "entry", "removal", "infrastructure", "barriers"],
    catSavings: {
      diversion: 4800,
      entry: 3200,
      removal: 6100,
      infrastructure: 7000,
      barriers: 2600
    },
    proServices: [
      {
        icon: "🔧",
        name: "French Drain System",
        desc: "Intercepts and redirects groundwater before it reaches the foundation.",
        cost: "$3,000–$9,000",
        impact: "Very High",
        time: "2–3 days"
      },
      {
        icon: "🏗️",
        name: "Foundation Waterproofing",
        desc: "Adds an exterior waterproof barrier to reduce seepage through foundation walls.",
        cost: "$6,000–$18,000",
        impact: "Very High",
        time: "3–5 days"
      },
      {
        icon: "📐",
        name: "Elevation Certificate",
        desc: "Documents structural elevation for insurance, rating, and compliance analysis.",
        cost: "$600–$1,800",
        impact: "High",
        time: "1 day"
      },
      {
        icon: "🔍",
        name: "Professional Risk Assessment",
        desc: "Provides a property-specific mitigation roadmap and implementation priorities.",
        cost: "$500–$1,500",
        impact: "High",
        time: "Half day"
      },
      ...(hasTrees
        ? [{
            icon: "🌳",
            name: "Gutter Guard & Drainage Upgrade",
            desc: "Reduces clog-driven overflow and improves roof runoff control.",
            cost: "$800–$2,400",
            impact: "High",
            time: "1 day"
          }]
        : [])
    ]
  };
}

function normalizeCategories(value, fallback) {
  const allowed = new Set(["diversion", "entry", "removal", "infrastructure", "barriers"]);
  if (!Array.isArray(value)) return fallback;
  const cleaned = value.filter((item) => allowed.has(item));
  return cleaned.length ? cleaned : fallback;
}

function normalizeSavings(value, fallback) {
  const keys = ["diversion", "entry", "removal", "infrastructure", "barriers"];
  const out = {};
  for (const key of keys) {
    const raw = value && typeof value === "object" ? value[key] : undefined;
    const num = Number(raw);
    out[key] = Number.isFinite(num) && num >= 0 ? Math.round(num) : fallback[key];
  }
  return out;
}

function normalizeServices(value, fallback) {
  if (!Array.isArray(value) || !value.length) return fallback;

  const cleaned = value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      icon: cleanString(item.icon) || "🔧",
      name: cleanString(item.name) || "Flood Mitigation Service",
      desc: cleanString(item.desc) || "Professional flood-risk mitigation service.",
      cost: cleanString(item.cost) || "Quote required",
      impact: cleanString(item.impact) || "High",
      time: cleanString(item.time) || "Varies"
    }))
    .slice(0, 6);

  return cleaned.length ? cleaned : fallback;
}

function clampInteger(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validTier(value) {
  return ["Low", "Moderate", "High", "Severe"].includes(value);
}

function tierFromScore(score) {
  if (score >= 85) return "Severe";
  if (score >= 65) return "High";
  if (score >= 40) return "Moderate";
  return "Low";
}

function buildPrompt(f, location) {
  const hasBasement = f?.basement && f.basement !== "No basement";
  const treesRisk = f?.treesOverhanging === "Yes" ? "Overhanging trees increase gutter blockage and runoff concentration." : "";
  const priorFlood = f?.priorFloodDamage === "Yes" ? "Property has prior flood damage history." : "";
  const drainIssues = (f?.drainageIssues === "Yes" || f?.drainageIssues === "Sometimes")
    ? "Drainage or standing water issues are already present."
    : "";

  return `You are a Flood Risk Exposure Engine. Return ONLY valid JSON, no markdown.

Location: ${location} | ZIP: ${f?.zip || ""}
First Name: ${f?.firstName || ""} | Year Built: ${f?.yearBuilt || "Unknown"} | Property Type: ${f?.propertyType || "Unknown"}
Basement: ${f?.basement || "Unknown"} | Has Basement: ${hasBasement}
Additional risk factors: ${[treesRisk, priorFlood, drainIssues].filter(Boolean).join(" ") || "None noted"}

RULES: ${!hasBasement ? "Do NOT include basement recommendations." : "Basement recommendations OK."}
${f?.treesOverhanging === "Yes" ? "MUST include gutter/debris management in recommendations." : ""}

Return ONLY this JSON:
{
  "score": <int 0-100 realistic for zip>,
  "tier": "<Low|Moderate|High|Severe>",
  "locationLabel": "<City, State>",
  "bullets": {
    "geographic": "<1 sentence>",
    "historical": "<1 sentence>",
    "climate": "<1 sentence>"
  },
  "financial": {
    "annualRisk": "<e.g. $4,200–$14,000>",
    "fiveYearNoAction": "<e.g. $21,000–$70,000>",
    "propertyValueImpact": "<e.g. -4% to -9%>",
    "insurancePremiumRange": "<e.g. $2,000–$5,200/yr>",
    "narrative": "<2-3 sentences on inaction consequences, personalised to this property>"
  },
  "diyCategories": ["diversion","entry","removal","infrastructure","barriers"],
  "catSavings": {
    "diversion": <int avg annual $ saved if implemented>,
    "entry": <int>,
    "removal": <int>,
    "infrastructure": <int>,
    "barriers": <int>
  },
  "proServices": [
    { "icon":"<emoji>", "name":"<name>", "desc":"<1 sentence>", "cost":"<range>", "impact":"<High|Very High>", "time":"<duration>" }
  ]
}

Generate 4-5 pro services relevant to this property. Make savings and financials realistic for ZIP ${f?.zip || ""}.`;
}
