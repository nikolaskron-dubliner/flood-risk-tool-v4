export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const { form, location } = req.body || {};

    if (!form) {
      return res.status(400).json({ error: "Missing form data" });
    }

    const prompt = buildPrompt(form, location);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt }
              ]
            }
          ]
        })
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      return res.status(geminiRes.status).json({
        error: data?.error?.message || "Gemini request failed",
        details: data
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No report content returned.";

    return res.status(200).json({ report: text });

  } catch (err) {
    console.error("Flood report API error:", err);

    return res.status(500).json({
      error: "Server error while generating flood report"
    });
  }
}

function buildPrompt(form, location) {
  return `
You are a flood-risk and property resilience analyst.

Generate a clear homeowner-facing flood risk assessment report based on the following information.

Homeowner Information:
First Name: ${form.firstName || ""}
Last Name: ${form.lastName || ""}
Email: ${form.email || ""}

Property Information:
Address: ${form.addressLine || ""}
ZIP: ${form.zip || ""}
City: ${location?.city || ""}
State: ${location?.state || ""}
Latitude: ${location?.latitude || ""}
Longitude: ${location?.longitude || ""}

Property Condition Inputs:
Trees Overhanging: ${form.treesOverhanging || ""}
Prior Flood Damage: ${form.priorFloodDamage || ""}
Drainage Issues: ${form.drainageIssues || ""}

Write the report in this structure:

1. Overall Flood Risk Summary
2. Key Property Vulnerabilities
3. Likely Risk Drivers
4. Recommended Next Steps
5. Priority Improvements
6. Short Disclaimer

Keep the tone practical, concise, and homeowner-friendly.
Do not mention that you are an AI.
`.trim();
}