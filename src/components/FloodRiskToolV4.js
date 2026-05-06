import { useState } from "react";
import "../styles/floodRiskTool.css";
import { DIY_CATS, FORM_STEPS, LOAD_STEPS, fmt, tierCls, tierLabel } from "../lib/assessmentConstants";
import { trackEvent } from "../lib/analytics";
import { getStoredLeadId, setStoredLeadId } from "../lib/leadStorage";
import { getSeasonalAlert, getUrlContext, getLocalRiskContext, lookupCounty, lookupZip } from "../lib/location";
import { getInsuranceLeadSignals, getInsuranceRiskScore, getLeadRoute, getMeyerlandPackage, getOverallPropertyRiskScore, getPropertyVulnerabilityScore, normalizeAssessmentResult } from "../lib/riskScoring";
import CostCalculator from "./results/CostCalculator";
import Toast from "./shared/Toast";

const FLOOD_REPORT_API_URL = "/api/flood-risk-report";
const LEAD_UPSERT_API_URL = "/api/lead/upsert";

export default function FloodRiskApp() {
  const seasonalAlert = getSeasonalAlert();

  const params = new URLSearchParams(window.location.search);
  const useCase = params.get("use_case");
  const isBuyerMode = useCase === "homebuyer";
  const agentNameFromUrl = params.get("agent_name") || "";

  // form state
const [form, setForm] = useState({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  addressLine: "",
  city: "",
  state: "",
  zip: "",
  yearBuilt: "",
  propertyType: "",
  basement: "",
  treesOverhang: "",
  priorFloodDamage: "",
  drainageIssues: "",
  interest: "",
  floodInsurance: "",
  priorFloodClaim: "",
  premiumIncrease: "",
  deniedOrDropped: "",
  useCase: isBuyerMode ? "homebuyer" : "homeowner",
  agentName: agentNameFromUrl,
  buyerName: ""
});

  const [addrMode,    setAddrMode]    = useState("full");
  const [addrStatus,  setAddrStatus]  = useState(null);
  const [addrVerified,setAddrVerified]= useState(null);
  const [errs,        setErrs]        = useState({});

  // multi-step progress
  const [formStep, setFormStep] = useState(0); // 0,1,2

  // app phase
  const [phase,   setPhase]   = useState("form");
  const [stepIdx, setStepIdx] = useState(0);
  const [doneSet, setDoneSet] = useState([]);
  const [result,  setResult]  = useState(null);
  const [barW,    setBarW]    = useState(0);
  const [normalizedLocation, setNormalizedLocation] = useState({
    location: "",
    city: "",
    state: "",
    county: "",
    zip: ""
  }); 

  // lead / share
  const [lead,     setLead]     = useState({ name:"", phone:"", interest:"Full Professional Assessment" });
  const [leadDone, setLeadDone] = useState(false);
  const [leadErrs, setLeadErrs] = useState({});
  const [copied,   setCopied]   = useState(false);
  const [assessmentSaveError, setAssessmentSaveError] = useState("");
  const [pendingAssessmentPayload, setPendingAssessmentPayload] = useState(null);
  const [assessmentSaveRetrying, setAssessmentSaveRetrying] = useState(false);

  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));

  // progress %
  const fields0 = [form.firstName, form.lastName, form.email].filter(Boolean).length;
  const fields1 = [form.zip, form.yearBuilt, form.propertyType, form.basement].filter(Boolean).length;
  const fields2 = [
  form.treesOverhang,
  form.priorFloodDamage,
  form.drainageIssues,
  form.floodInsurance,
  form.priorFloodClaim,
  form.premiumIncrease,
  form.deniedOrDropped
].filter(Boolean).length;

const totalFields = 3 + 4 + 7;
const totalFilled = fields0 + fields1 + fields2;
  const progressPct = Math.round((totalFilled / totalFields) * 100);

  // Validate current step
  const validateStep = step => {
  const e = {};

  if (step === 0) {
    if (!form.firstName.trim()) e.firstName = "Required";
    if (!form.lastName.trim()) e.lastName = "Required";
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) {
      e.email = "Valid email required";
    }
  }

  if (step === 1) {
    if (addrMode === "full") {
      if (!form.addressLine.trim()) e.addressLine = "Required";
      if (!form.zip.trim()) e.zip = "Required";
    } else {
      if (!form.zip.trim() || form.zip.trim().length < 5) {
        e.zip = "Valid 5-digit ZIP required";
      }
    }

    if (!form.yearBuilt.trim()) e.yearBuilt = "Required";
  }

  if (step === 2) {
    if (!form.treesOverhang) e.treesOverhang = "Required";
    if (!form.priorFloodDamage) e.priorFloodDamage = "Required";
    if (!form.drainageIssues) e.drainageIssues = "Required";
    if (!form.floodInsurance) e.floodInsurance = "Required";
  }

  setErrs(e);
  return Object.keys(e).length === 0;
};

  const nextStep = () => {
  if (validateStep(formStep)) {
    trackEvent("flood_assessment_step_completed", {
      step: formStep + 1,
      stepName: FORM_STEPS[formStep]
    });
    setFormStep(s => Math.min(2, s + 1));
  } else {
    trackEvent("flood_assessment_step_validation_failed", {
      step: formStep + 1,
      stepName: FORM_STEPS[formStep]
    });
  }
};
  const prevStep = () => setFormStep(s => Math.max(0, s-1));

  const handleSubmit = async () => {
  if (!validateStep(2)) return;

trackEvent("flood_assessment_submit_started", {
  addrMode,
  zip: form.zip || "",
  hasAddress: Boolean(form.addressLine),
  hasYearBuilt: Boolean(form.yearBuilt),
  hasPropertyType: Boolean(form.propertyType),
  hasBasement: Boolean(form.basement)
});

  setPhase("loading");
  setDoneSet([]);
  setStepIdx(0);

  let location =
    addrMode === "full"
      ? (addrVerified?.standardized || `${form.addressLine}, ${form.city}, ${form.state} ${form.zip}`)
      : `ZIP Code ${form.zip}`;

  let zipCity = addrVerified?.city || form.city;
  let zipState = addrVerified?.state || form.state;

  if (addrMode === "zip") {
  const zRes = await lookupZip(form.zip);
  if (zRes.valid) {
    zipCity = zRes.city;
    zipState = zRes.state;
  }
  location = `${zipCity}, ${zipState} ${form.zip}`;
}

// Auto-detect county from zip
const county = await lookupCounty(form.zip);
if (county) location = `${zipCity}, ${county} County, ${zipState} ${form.zip}`;

setNormalizedLocation({
  location,
  city: zipCity || form.city || "",
  state: zipState || form.state || "",
  county: county || "",
  zip: form.zip || ""
});

  const [aiRes] = await Promise.all([
    (async () => {
      try {
        const res = await fetch(FLOOD_REPORT_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ form: { ...form }, location })
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d?.error || "Failed to generate report");
        return normalizeAssessmentResult(d, form, location);
      } catch (err) {
        console.error("Flood report generation failed:", err);
        return normalizeAssessmentResult(null, form, location);
      }
    })(),
  ]);

const floodExposureScore = aiRes?.score ?? 0;
const propertyVulnerabilityScore = getPropertyVulnerabilityScore(form, floodExposureScore);
const insuranceRiskScore = getInsuranceRiskScore(form, floodExposureScore);
const overallRiskScore = getOverallPropertyRiskScore(
  floodExposureScore,
  propertyVulnerabilityScore,
  insuranceRiskScore
);

console.log("RISK MODEL OUTPUT", {
  floodExposureScore,
  propertyVulnerabilityScore,
  insuranceRiskScore,
  overallRiskScore,
  insuranceInputs: {
    floodInsurance: form.floodInsurance,
    priorFloodClaim: form.priorFloodClaim,
    premiumIncrease: form.premiumIncrease,
    deniedOrDropped: form.deniedOrDropped
  }
});

const insuranceSignals = getInsuranceLeadSignals(form, overallRiskScore);
const leadRoute = getLeadRoute(form, overallRiskScore);

const urlContext = getUrlContext();

const localRecommendation =
  urlContext.target_area === "brays_bayou_meyerland_core"
    ? getMeyerlandPackage(form, overallRiskScore)
    : {
        recommended_package: null,
        estimated_project_range: null,
      };

const localRiskContext = getLocalRiskContext(urlContext.target_area);

setResult({
  ...aiRes,
  score: overallRiskScore,
  location,
  zip: form.zip,
  insuranceSignals,
  leadRoute,
  breakdown: {
    floodExposure: floodExposureScore,
    propertyVulnerability: propertyVulnerabilityScore,
    insuranceRisk: insuranceRiskScore,
    overallRisk: overallRiskScore
  }
});

setLead({
  name: `${form.firstName} ${form.lastName}`.trim(),
  phone: form.phone || "",
  interest: "Full Professional Assessment"
});

  const leadId = getStoredLeadId();

  const payload = {
    id: leadId,
    first_name: form.firstName,
    last_name: form.lastName,
    full_name: `${form.firstName} ${form.lastName}`.trim(),
    email: form.email,
    street_address: form.addressLine || "",
    city: zipCity || form.city || "",
    state: zipState || form.state || "",
    zip_code: form.zip || "",
    year_built: form.yearBuilt ? Number(form.yearBuilt) : null,
    property_type: form.propertyType || "",
    basement_type:
      form.basement === "Yes — Full finished basement"
        ? "Yes – Full finished basement"
        : form.basement === "Yes — Unfinished basement"
        ? "Yes - Unfinished basement"
        : form.basement === "Yes — Partial / crawlspace"
        ? "Yes- Partial / crawlspace"
        : form.basement,
    trees_overhang: form.treesOverhang,
    prior_flood_damage: form.priorFloodDamage,
    drainage_issues: form.drainageIssues,
    interest_area: form.interest || "General Information",
    risk_score: overallRiskScore ?? null,
    stage: "completed",
    callback_requested: false,
    use_case: form.useCase || "homeowner",
    source: urlContext.source,
    target_area: urlContext.target_area,
    local_risk_context: localRiskContext,
    recommended_package: localRecommendation.recommended_package,
    estimated_project_range: localRecommendation.estimated_project_range,
    agent_name: form.agentName || "",
    buyer_name: form.buyerName || "",
    agent_email: form.agentEmail || "",
    agent_phone: form.agentPhone || "",
    assessment_answers: {
      addrMode,
      location,
      addressLine: form.addressLine || "",
      city: zipCity || form.city || "",
      state: zipState || form.state || "",
      zip: form.zip || "",
      propertyType: form.propertyType,
      basement: form.basement,
      treesOverhang: form.treesOverhang,
      priorFloodDamage: form.priorFloodDamage,
      drainageIssues: form.drainageIssues,
      floodInsurance: form.floodInsurance,
      priorFloodClaim: form.priorFloodClaim,
      premiumIncrease: form.premiumIncrease,
      deniedOrDropped: form.deniedOrDropped,
      leadRoute,
      interest: form.interest || "",
      tier: aiRes?.tier || "",
      locationLabel: aiRes?.locationLabel || location,
      reportSummary: aiRes?.financial?.narrative || "",
      useCase: form.useCase || "homeowner",
      agentName: form.agentName || "",
      buyerName: form.buyerName || "",
      agentEmail: form.agentEmail || "",
      agentPhone: form.agentPhone || "",
      source: urlContext.source,
      targetArea: urlContext.target_area,
      localRiskContext,
      recommendedPackage: localRecommendation.recommended_package,
      estimatedProjectRange: localRecommendation.estimated_project_range,
    },
    utm_source: new URLSearchParams(window.location.search).get("utm_source"),
    utm_medium: new URLSearchParams(window.location.search).get("utm_medium"),
    utm_campaign: new URLSearchParams(window.location.search).get("utm_campaign"),
    utm_term: new URLSearchParams(window.location.search).get("utm_term"),
    utm_content: new URLSearchParams(window.location.search).get("utm_content"),
    referrer: document.referrer || "",
    landing_page: window.location.href
  };

  try {
    const response = await fetch(LEAD_UPSERT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const submitResult = await response.json();

    if (!response.ok) {
      throw new Error(submitResult.error || "Submission failed");
    }

    if (submitResult?.id) {
      setStoredLeadId(submitResult.id);
    }

    setAssessmentSaveError("");
    setPendingAssessmentPayload(null);

    console.log("Lead upsert success:", submitResult);
    trackEvent("property_risk_result_viewed", {
  score: overallRiskScore ?? null,
  tier: aiRes?.tier || "",
  zip: form.zip || "",
  location: location || ""
});

trackEvent("flood_insurance_profile_captured", {
  floodInsurance: form.floodInsurance,
  priorFloodClaim: form.priorFloodClaim,
  premiumIncrease: form.premiumIncrease,
  deniedOrDropped: form.deniedOrDropped,
  score: overallRiskScore ?? null,
  leadRoute
});

    setPhase("result");
    setTimeout(() => setBarW(overallRiskScore), 150);
  } catch (err) {
    console.error("Assessment submit failed:", err);
    console.error("Recoverable assessment lead payload:", payload);
    setPendingAssessmentPayload(payload);
    setAssessmentSaveError(
      err.message ||
      "Your report was generated, but we could not save your assessment for follow-up. Please retry so we can email your results."
    );
    setPhase("result");
    setTimeout(() => setBarW(overallRiskScore), 150);
  }
};

const retryAssessmentSave = async () => {
  if (!pendingAssessmentPayload) return;

  setAssessmentSaveRetrying(true);
  try {
    const response = await fetch(LEAD_UPSERT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(pendingAssessmentPayload)
    });

    const submitResult = await response.json();

    if (!response.ok) {
      throw new Error(submitResult.error || "Submission failed");
    }

    if (submitResult?.id) {
      setStoredLeadId(submitResult.id);
    }

    setAssessmentSaveError("");
    setPendingAssessmentPayload(null);
  } catch (err) {
    console.error("Assessment save retry failed:", err);
    console.error("Recoverable assessment lead payload:", pendingAssessmentPayload);
    setAssessmentSaveError(
      err.message ||
      "We still could not save your assessment. Please try again before leaving this page."
    );
  } finally {
    setAssessmentSaveRetrying(false);
  }
};

const handleLeadSubmit = async () => {
  const trimmedName = (lead.name || "").trim();
  const trimmedPhone = (lead.phone || "").trim();

  const nextLeadErrs = {};
  if (!trimmedName) nextLeadErrs.name = "Please enter your full name.";
  if (!trimmedPhone) nextLeadErrs.phone = "Please enter a phone number so a specialist can call you.";

  if (Object.keys(nextLeadErrs).length) {
    setLeadErrs(nextLeadErrs);
    return;
  }

  setLeadErrs({});

  const parts = trimmedName.split(/\s+/);
  const firstName = parts[0] || form.firstName || "";
  const lastName = parts.slice(1).join(" ") || form.lastName || "";

  const leadId = getStoredLeadId();

  const resolvedCity =
    normalizedLocation.city ||
    form.city ||
    result?.locationLabel ||
    "";

  const resolvedState =
    normalizedLocation.state ||
    form.state ||
    "";

  const resolvedZip =
    normalizedLocation.zip ||
    form.zip ||
    "";

  const resolvedLocation =
    normalizedLocation.location ||
    result?.location ||
    [form.addressLine, resolvedCity, resolvedState, resolvedZip]
      .filter(Boolean)
      .join(", ");

  const urlContext = getUrlContext();

  const localRecommendation =
    urlContext.target_area === "brays_bayou_meyerland_core"
      ? getMeyerlandPackage(form, result?.score || 0)
      : {
          recommended_package: null,
          estimated_project_range: null,
        };

  const localRiskContext = getLocalRiskContext(urlContext.target_area);

  // Persist phone into main form state too so it is not isolated only in lead state
  setForm(f => ({
    ...f,
    phone: trimmedPhone
  }));

  const payload = {
    id: leadId,
    first_name: firstName,
    last_name: lastName,
    full_name: trimmedName,
    email: form.email,
    phone: trimmedPhone,
    street_address: form.addressLine || "",
    city: resolvedCity,
    state: resolvedState,
    zip_code: resolvedZip,
    year_built: form.yearBuilt ? Number(form.yearBuilt) : null,
    property_type: form.propertyType || "",
    basement_type:
      form.basement === "Yes — Full finished basement"
        ? "Yes – Full finished basement"
        : form.basement === "Yes — Unfinished basement"
        ? "Yes - Unfinished basement"
        : form.basement === "Yes — Partial / crawlspace"
        ? "Yes- Partial / crawlspace"
        : form.basement,
    trees_overhang: form.treesOverhang,
    prior_flood_damage: form.priorFloodDamage,
    drainage_issues: form.drainageIssues,
    interest_area: lead.interest || "General Information",
    risk_score: result?.score ?? null,
    stage: "callback_requested",
    callback_requested: true,
    source: urlContext.source,
    target_area: urlContext.target_area,
    local_risk_context: localRiskContext,
    recommended_package: localRecommendation.recommended_package,
    estimated_project_range: localRecommendation.estimated_project_range,
    assessment_answers: {
      source: "lead_followup",
      location: resolvedLocation,
      city: resolvedCity,
      state: resolvedState,
      zip: resolvedZip,
      floodInsurance: form.floodInsurance,
      priorFloodClaim: form.priorFloodClaim,
      premiumIncrease: form.premiumIncrease,
      deniedOrDropped: form.deniedOrDropped,
      leadRoute: result?.leadRoute || "standard_followup",
      previousScoreBreakdown: result?.breakdown || null
    }
  };

  try {
    console.log("Submitting callback request payload:", payload);

    const response = await fetch(LEAD_UPSERT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const submitResult = await response.json();

    console.log("Callback request upsert response:", submitResult);

    if (!response.ok) {
      throw new Error(submitResult.error || "Lead submission failed");
    }

    if (submitResult?.id) {
      setStoredLeadId(submitResult.id);
    }

    setLeadDone(true);

    trackEvent("property_risk_lead_submitted", {
      score: result?.score ?? null,
      tier: result?.tier || "",
      interest: lead.interest || "General Information",
      zip: resolvedZip || "",
      callbackRequested: true
    });
  } catch (err) {
    console.error("Lead submit failed:", err);
    alert(err.message || "Something went wrong.");
  }
};

const handleShare = async platform => {
  const score = result?.score || 0;
  const tier = tierLabel(score);
const text = `My home just scored ${score}/100 on the Property Risk Assessment — ${tier}. Find out your risk at oiriunu.com`;
  const urls = {
    fb: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent("https://oiriunu.com")}&quote=${encodeURIComponent(text)}`,
    tw: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
    li: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent("https://oiriunu.com")}&summary=${encodeURIComponent(text)}`
  };

  if (platform === "copy") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      trackEvent("flood_report_share_copy", {
        score,
        tier,
        location: result?.location || "",
        method: "copy_link"
      });
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Copy failed:", err);
      trackEvent("flood_report_share_copy_failed", {
        score,
        tier,
        location: result?.location || "",
        method: "copy_link"
      });
    }
   } else {
    trackEvent("flood_report_share_click", {
      score,
      tier,
      platform,
      location: result?.location || ""
    });

    window.open(urls[platform], "_blank", "width=600,height=400");
  }
};

  const reset = () => {
    try {
      localStorage.removeItem("lead_id");
    } catch {}

    setPhase("form");
    setResult(null);
    setBarW(0);
    setAddrStatus(null);
    setAddrVerified(null);
    setAddrMode("full");
    setLead({ name:"", phone:"", interest:"Full Professional Assessment" });
    setLeadDone(false);
    setErrs({});
    setFormStep(0);
    setNormalizedLocation({
      location: "",
      city: "",
      state: "",
      county: "",
      zip: ""
    });
  };

  const tc = result ? tierCls(result.score) : "";
  const hasBasement = form.basement && form.basement !== "No basement";
  const activeCats  = result ? DIY_CATS.filter(c => !result.diyCategories || result.diyCategories.includes(c.id)) : DIY_CATS;
  const route = result?.leadRoute || "standard_followup";

  // Radio helper
  const RadioGroup = ({ field, options }) => (
    <div className="radio-group">
      {options.map(opt => (
        <label key={opt} className={`radio-opt${form[field]===opt?" selected":""}`}>
          <input type="radio" name={field} value={opt} checked={form[field]===opt} onChange={()=>set(field,opt)} />
          {opt}
        </label>
      ))}
    </div>
  );

  return (
    <>
      {/* URGENCY BANNER */}
      {seasonalAlert && (
  <div className="urgency" style={{ background: seasonalAlert.color }}>
    <span>{seasonalAlert.icon}</span>
    <span><strong>{seasonalAlert.name}</strong> begins in</span>
    <span className="urgency-countdown">{seasonalAlert.days} days</span>
          <span>— Is your home protected?</span>
        </div>
      )}

      <div className="fra">
        <div className="hero">
          <div className="hbadge"><div className="hdot"/>Flood Risk Intelligence</div>
          <h1>Is Your Home at Risk<br/>from <em>Flooding?</em></h1>
          <p>Get your free personalised flood risk score — with financial impact study, savings calculator, and tailored protection solutions.</p>
        </div>

        {/* PROGRESS BAR */}
        {phase === "form" && (
          <div className="progress-wrap">
            <div className="progress-card">
              <div className="progress-header">
                <span className="progress-label">Assessment progress — Step {formStep+1} of {FORM_STEPS.length}</span>
                <span className="progress-pct">{progressPct}% complete</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.max(4, ((formStep / (FORM_STEPS.length-1))*100))}%` }}/>
              </div>
              <div className="progress-steps">
                {FORM_STEPS.map((s,i) => (
                  <span key={s} className={`ps ${i < formStep ? "done" : i===formStep ? "active" : ""}`}>
                    {i < formStep ? "✓ " : ""}{s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="main">
          {/* ── FORM ── */}
          {phase === "form" && (
            <div className="card">
              <div className="card-hd">
                <span>{["👤","🏠","🌿"][formStep]}</span>
                <span className="card-hd-title">{FORM_STEPS[formStep]}</span>
              </div>
              <div className="card-body">

{/* STEP 0 — Identity */}
{formStep === 0 && (
  <div className="fg">
    <div className="frow">
      <div className="fld">
        <label>First Name <span className="req">*</span></label>
        <input
          placeholder="Jane"
          value={form.firstName}
          className={errs.firstName ? "err-field" : ""}
          onChange={e => set("firstName", e.target.value)}
        />
        {errs.firstName && <div className="err">{errs.firstName}</div>}
      </div>

      <div className="fld">
        <label>Last Name <span className="req">*</span></label>
        <input
          placeholder="Smith"
          value={form.lastName}
          className={errs.lastName ? "err-field" : ""}
          onChange={e => set("lastName", e.target.value)}
        />
        {errs.lastName && <div className="err">{errs.lastName}</div>}
      </div>
    </div>

    <div className="fld">
      <label>Email Address <span className="req">*</span></label>
      <input
        type="email"
        placeholder="jane@example.com"
        value={form.email}
        className={errs.email ? "err-field" : ""}
        onChange={e => set("email", e.target.value)}
      />
      {errs.email && <div className="err">{errs.email}</div>}
    </div>

    {isBuyerMode && (
      <>
        <div className="fld">
          <label>Your Name (Buyer)</label>
          <input
            placeholder="Optional"
            value={form.buyerName}
            onChange={e => set("buyerName", e.target.value)}
          />
        </div>

        <div className="fld">
          <label>Realtor Name (Optional)</label>
          <input
            placeholder="e.g. John Smith"
            value={form.agentName}
            onChange={e => set("agentName", e.target.value)}
          />
        </div>
      </>
    )}

    <div style={{ display: "flex", gap: 10 }}>
      <button className="btn-go" style={{ flex: 1 }} onClick={nextStep}>
        Continue →
      </button>
    </div>
  </div>
)}
                {/* STEP 1 — Property */}
                {formStep === 1 && (
                  <div className="fg">
                    {addrMode === "full" ? (
                      <>
                        <div className="fld">
                          <label>Street Address <span className="req">*</span></label>
                          <input placeholder="123 Main Street" value={form.addressLine} className={errs.addressLine?"err-field":""} onChange={e=>set("addressLine",e.target.value)} />
                          {addrStatus==="checking" && <div className="addr-status addr-chk">🔍 Verifying with USPS…</div>}
                          {addrStatus==="ok" && <div className="addr-status addr-ok">✓ Verified: {addrVerified?.standardized}</div>}
                          {addrStatus==="bad" && <div className="addr-status addr-bad">⚠ Not found. <button onClick={()=>{setAddrMode("zip");setAddrStatus(null);}} style={{background:"none",border:"none",color:"#0068a0",cursor:"pointer",fontWeight:700,textDecoration:"underline",fontSize:"12px",padding:0}}>Use ZIP only →</button></div>}
                          {errs.addressLine && <div className="err">{errs.addressLine}</div>}
                        </div>
                        <div className="frow">
                          <div className="fld"><label>City</label><input placeholder="Springfield" value={form.city} onChange={e=>set("city",e.target.value)}/></div>
                          <div className="fld"><label>State</label><input placeholder="IL" maxLength={2} value={form.state} onChange={e=>set("state",e.target.value.toUpperCase())} /></div>
                        </div>
                      </>
                    ) : (
                      <div className="fld">
                        <label>ZIP Code <span className="req">*</span></label>
                        <div className="zip-note">📍 Address not verified — we'll run your full analysis using your ZIP code. You may enter a street address below for records.</div>
                        <input placeholder="Street address (optional)" value={form.addressLine} onChange={e=>set("addressLine",e.target.value)} style={{marginBottom:8}}/>
                      </div>
                    )}
                    <div className="fld">
                      <label>ZIP Code <span className="req">*</span></label>
                      <input placeholder="62701" maxLength={5} value={form.zip} className={errs.zip?"err-field":""} onChange={e=>set("zip",e.target.value)} />
                      {errs.zip && <div className="err">{errs.zip}</div>}
                    </div>
                    <div className="odiv"><div className="oline"/><span className="olabel">Improves accuracy</span><div className="oline"/></div>
                    <div className="frow">
                    <div className="fld">
  <label>Year Built <span className="req">*</span></label>
  <input
    placeholder="e.g. 1988"
    value={form.yearBuilt}
    className={errs.yearBuilt ? "err-field" : ""}
    onChange={e => set("yearBuilt", e.target.value)}
  />
  <div style={{ fontSize: 12, color: "var(--sub)", lineHeight: 1.5 }}>
    Guess if you don't know.
  </div>
  {errs.yearBuilt && <div className="err">{errs.yearBuilt}</div>}
</div>
                      <div className="fld">
                        <label>Property Type</label>
                        <select value={form.propertyType} onChange={e=>set("propertyType",e.target.value)}>
                          <option value="">Select…</option>
                          <option>Single Family Home</option><option>Condo / Townhome</option>
                          <option>Multi-Family</option><option>Commercial</option>
                        </select>
                      </div>
                    </div>
                    <div className="fld">
                      <label>Basement?</label>
                      <select value={form.basement} onChange={e=>set("basement",e.target.value)}>
                        <option value="">Unknown</option>
                        <option>Yes — Full finished basement</option><option>Yes — Unfinished basement</option>
                        <option>Yes — Partial / crawlspace</option><option>No basement</option>
                      </select>
                    </div>
                    <div style={{display:"flex",gap:10}}>
                      <button className="btn-go" style={{background:"var(--cloud)",color:"var(--sub)",border:"1.5px solid var(--border)",boxShadow:"none",flex:"0 0 auto",width:"auto",padding:"12px 20px"}} onClick={prevStep}>← Back</button>
                      <button className="btn-go" style={{flex:1}} onClick={nextStep}>Continue →</button>
                    </div>
                  </div>
                )}

                {/* STEP 2 — Condition */}
                {formStep === 2 && (
                  <div className="fg">
                    <div style={{background:"var(--skylt)",borderRadius:8,padding:"12px 15px",fontSize:13,color:"var(--blue)",marginBottom:4,fontWeight:500}}>
                      💡 These details significantly personalise your report. Take 30 seconds — it's worth it.
                    </div>
                    <div className="fld">
                      <label>Do trees overhang your roof or gutters?</label>
                      <RadioGroup field="treesOverhang" options={["Yes","No","Not sure"]}/>
                      {errs.treesOverhang && <div className="err">{errs.treesOverhang}</div>}
                      {form.treesOverhang === "Yes" && <div style={{fontSize:12,color:"var(--teal)",marginTop:4,fontWeight:600}}>🌳 Noted — blocked gutters are a leading cause of preventable water damage</div>}
                    </div>
                    <div className="fld">
                      <label>Has the property had flood or water damage before?</label>
                      <RadioGroup field="priorFloodDamage" options={["Yes","No","Not sure"]}/>
                      {errs.priorFloodDamage && <div className="err">{errs.priorFloodDamage}</div>}
                    </div>
                    <div className="fld">
                      <label>Do you notice water pooling or drainage issues near the property?</label>
                      <RadioGroup field="drainageIssues" options={["Yes","No","Sometimes"]}/>
                      {errs.drainageIssues && <div className="err">{errs.drainageIssues}</div>}
                    </div>
                    <div style={{marginTop:8}}>
  <div
    style={{
      background:"var(--skylt)",
      borderRadius:8,
      padding:"12px 15px",
      fontSize:13,
      color:"var(--blue)",
      marginBottom:10,
      fontWeight:500
    }}
  >
    Insurance status helps us tailor your recommendations, flag urgency, and identify potential coverage risks.
  </div>

  <p style={{fontSize:12,color:"var(--sub)",lineHeight:1.6,marginBottom:10}}>
    These questions help us identify coverage pressure, premium changes, and mitigation opportunities.
  </p>

  <div className="fld">
    <label>Do you currently have flood insurance? <span className="req">*</span></label>
    <RadioGroup field="floodInsurance" options={["Yes","No","Not sure"]}/>
    {errs.floodInsurance && <div className="err">{errs.floodInsurance}</div>}
  </div>

  <div className="fld">
    <label>Have you ever filed a flood claim?</label>
    <RadioGroup field="priorFloodClaim" options={["Yes","No","Not sure"]}/>
  </div>

  <div className="fld">
    <label>Has your premium increased in the last 2–3 years?</label>
    <RadioGroup field="premiumIncrease" options={["Yes","No","Not sure"]}/>
  </div>

  <div className="fld">
    <label>Have you ever been denied coverage or dropped?</label>
    <RadioGroup field="deniedOrDropped" options={["Yes","No","Not sure"]}/>
  </div>
</div>
                    <div style={{display:"flex",gap:10}}>
                      <button className="btn-go" style={{background:"var(--cloud)",color:"var(--sub)",border:"1.5px solid var(--border)",boxShadow:"none",flex:"0 0 auto",width:"auto",padding:"12px 20px"}} onClick={prevStep}>← Back</button>
                      <button className="btn-go" style={{flex:1}} onClick={handleSubmit}>Generate My Free Flood Risk Report →</button>
                    </div>
                  </div>
                )}
<div className="trow">
{["FEMA Data","Government Stats","Industry Reports","NOAA Rainfall","50-Year History","100% Free"].map(t => (
    <div className="ti" key={t}>
      <span className="tck">✓</span>{t}
    </div>
  ))}
</div>
              </div>
            </div>
          )}
          {/* ── LOADING ── */}
          {phase === "loading" && (
            <div className="loading-wrap">
              <div className="waver">{[1,2,3,4,5,6,7].map(i=><div className="wb" key={i}/>)}</div>
              <h2>Analysing {form.zip || "your area"}…</h2>
              <p>Pulling data from FEMA, NOAA, and 50 years of disaster records.</p>
              <div className="steps">
                {LOAD_STEPS.map((s,i)=>(
                  <div key={i} className={`stp ${doneSet.includes(i)?"don":stepIdx===i?"act":""}`}>
                    <span className="sic">{doneSet.includes(i)?"✓":stepIdx===i?"›":"·"}</span>{s}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── RESULTS ── */}
          {phase === "result" && result && (
            <div className={`results ${tc}`}>
              {assessmentSaveError && (
                <div style={{
                  background: "#fff3cd",
                  border: "1px solid #ffe08a",
                  borderRadius: 8,
                  padding: "12px 14px",
                  fontSize: 13,
                  marginBottom: 14,
                  color: "#765300"
                }}>
                  <strong>Follow-up save needed:</strong> {assessmentSaveError}
                  <button
                    type="button"
                    onClick={retryAssessmentSave}
                    disabled={assessmentSaveRetrying || !pendingAssessmentPayload}
                    style={{
                      marginLeft: 10,
                      border: "none",
                      borderRadius: 6,
                      padding: "7px 10px",
                      background: "#1068a0",
                      color: "#fff",
                      cursor: assessmentSaveRetrying ? "not-allowed" : "pointer",
                      fontWeight: 700
                    }}
                  >
                    {assessmentSaveRetrying ? "Retrying..." : "Retry save"}
                  </button>
                </div>
              )}

              {/* Score hero */}
              <div className="sh">
                <div className="sh-top">
                  <div className="sh-greet">
                    {isBuyerMode
                      ? `Property Risk Summary for ${form.buyerName || "Home Buyer"}`
                      : `Hi ${form.firstName}, here is your personalized property risk snapshot`}
                  </div>
                  <div className="sh-addr">📍 {result.location}</div>
                  {isBuyerMode && form.agentName && (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      Prepared for {form.agentName}'s client
                    </div>
                  )}
                  <div className="sh-flex">
                    <div><div className="sh-num">{result.score}<span className="sh-den">/100</span></div></div>
                    <div className="sh-right">
                      <div className="tp">{tierLabel(result.score)}</div>
                      <div className="sh-desc">
  {result.score < 25 && `${form.firstName}, your property shows relatively low overall risk. Staying informed, maintaining drainage, and reviewing coverage remain important.`}
  {result.score >= 25 && result.score < 50 && `${form.firstName}, moderate property risk is present. Flood exposure, home vulnerability, and insurance pressure suggest proactive mitigation is worthwhile.`}
  {result.score >= 50 && result.score < 75 && `${form.firstName}, elevated property risk is present. Your flood exposure, property conditions, and financial/insurance risk indicate that delaying action may become costly.`}
  {result.score >= 75 && `${form.firstName}, severe property risk is identified. Your property, financial exposure, and insurance profile suggest immediate mitigation and specialist review are strongly recommended.`}
</div>
                    </div>
                  </div>
                  <div className="sh-bar"><div className="sh-fill" style={{width:`${barW}%`}}/></div>
                </div>

                {/* SHARE ROW */}
                <div className="share-row" style={{background:"rgba(0,0,0,.2)"}}>
                  <span className="share-label">Share your score:</span>
                  <button className="share-btn sb-fb" onClick={()=>handleShare("fb")}>f Facebook</button>
                  <button className="share-btn sb-tw" onClick={()=>handleShare("tw")}>𝕏 Twitter</button>
                  <button className="share-btn sb-li" onClick={()=>handleShare("li")}>in LinkedIn</button>
                  <button className="share-btn sb-cp" onClick={()=>handleShare("copy")}>📋 Copy link</button>
                </div>

                <div className="sh-body">
                  <div className="rlist">
                    <div className="ri"><div className="ric geo">🗺️</div><div className="rt"><strong>Geographic:</strong> {result.bullets.geographic}</div></div>
                    <div className="ri"><div className="ric hist">📋</div><div className="rt"><strong>Historical:</strong> {result.bullets.historical}</div></div>
                    <div className="ri"><div className="ric clim">🌡️</div><div className="rt"><strong>Climate Trend:</strong> {result.bullets.climate}</div></div>
                    {form.treesOverhang === "Yes" && <div className="ri"><div className="ric" style={{background:"#f0fae8"}}>🌳</div><div className="rt"><strong>Gutter Risk:</strong> Overhanging trees increase debris blockage risk — a common trigger for preventable water intrusion at roof level and along foundations.</div></div>}
                    {form.priorFloodDamage === "Yes" && <div className="ri"><div className="ric" style={{background:"#fff0f0"}}>⚠️</div><div className="rt"><strong>Prior Damage:</strong> Properties with a history of flood damage face statistically higher repeat event risk and may face insurance loading.</div></div>}
                    {(form.drainageIssues === "Yes" || form.drainageIssues === "Sometimes") && <div className="ri"><div className="ric" style={{background:"#fff8e0"}}>💧</div><div className="rt"><strong>Drainage:</strong> Existing pooling or drainage issues indicate the current landscape is not directing water away effectively — a key risk multiplier.</div></div>}
                  </div>
                </div>
              </div>

              {/* Financial Impact */}
              <div className="sec">
                <div className="sec-hd"><span className="sec-ico">💰</span><span className="sec-title">Financial Impact — If You Don't Act</span></div>
                <div className="sec-body">
                  <div className="fin-grid">
                    <div className="fbox fb-r"><div className="flbl">Est. Annual Loss Exposure</div><div className="famt">{result.financial.annualRisk}</div><div className="fnote">Repairs, cleanup & contents</div></div>
                    <div className="fbox fb-o"><div className="flbl">5-Year Cost (No Action)</div><div className="famt">{result.financial.fiveYearNoAction}</div><div className="fnote">Cumulative projected exposure</div></div>
                    <div className="fbox fb-b"><div className="flbl">Flood Insurance Range</div><div className="famt">{result.financial.insurancePremiumRange}</div><div className="fnote">Estimated annual premium</div></div>
                    <div className="fbox fb-g"><div className="flbl">Property Value Impact</div><div className="famt">{result.financial.propertyValueImpact}</div><div className="fnote">vs. low-risk comparables</div></div>
                  </div>
                  <div className="fnarr">{result.financial.narrative}</div>
                </div>
              </div>

<div className="sec">
  <div className="sec-hd">
    <span className="sec-ico">🧭</span>
    <span className="sec-title">Your Risk Breakdown</span>
  </div>
  <div className="sec-body">
    <div className="fin-grid">
      <div className="fbox fb-b">
        <div className="flbl">Flood Exposure</div>
        <div className="famt">{result?.breakdown?.floodExposure ?? result.score}</div>
        <div className="fnote">Based on location, FEMA data, weather history, and rainfall patterns</div>
      </div>

      <div className="fbox fb-o">
        <div className="flbl">Property Vulnerability</div>
        <div className="famt">{result?.breakdown?.propertyVulnerability ?? result.score}</div>
        <div className="fnote">Based on drainage, prior damage, home features, and property conditions</div>
      </div>

      <div className="fbox fb-r">
        <div className="flbl">Insurance Risk</div>
        <div className="famt">{result?.breakdown?.insuranceRisk ?? result.score}</div>
        <div className="fnote">Based on coverage status, premiums, claims, and insurability pressure</div>
      </div>

      <div className="fbox fb-g">
        <div className="flbl">Overall Property Risk Score</div>
        <div className="famt">{result?.breakdown?.overallRisk ?? result.score}</div>
        <div className="fnote">Combined view of physical, property, and financial exposure</div>
      </div>
    </div>

    <div className="fnarr">
      We don’t just show flood risk. We show what that risk means for your property, your finances, and what to do next.
    </div>
  </div>
</div>

{isBuyerMode && (
  <div className="sec">
    <div className="sec-hd">
      <span className="sec-ico">❓</span>
      <span className="sec-title">What to Ask the Seller</span>
    </div>
    <div className="sec-body">
      <div className="rlist">
        <div className="ri"><div className="ric">•</div><div className="rt">Has the property ever experienced flooding or water intrusion?</div></div>
        <div className="ri"><div className="ric">•</div><div className="rt">What drainage or flood mitigation work has been completed?</div></div>
        <div className="ri"><div className="ric">•</div><div className="rt">Are there permits, invoices, or warranties for any work done?</div></div>
        <div className="ri"><div className="ric">•</div><div className="rt">Is flood insurance currently required or in place?</div></div>
        <div className="ri"><div className="ric">•</div><div className="rt">Have there been any insurance claims related to water damage?</div></div>
      </div>
    </div>
  </div>
)}

{isBuyerMode && (
  <div className="sec">
    <div className="sec-hd">
      <span className="sec-ico">💲</span>
      <span className="sec-title">Estimated Mitigation Cost Range</span>
    </div>
    <div className="sec-body">
      <div className="rlist">
        <div className="rt">Basic drainage fixes: $500 – $3,000</div>
        <div className="rt">Downspouts / grading: $250 – $2,500</div>
        <div className="rt">French drains: $3,000 – $12,000+</div>
        <div className="rt">Sump systems: $1,500 – $7,500+</div>
        <div className="rt">Professional assessment: $300 – $1,500+</div>
      </div>
    </div>
  </div>
)}

<div className="sec">
  <div className="sec-hd">
    <span className="sec-ico">✅</span>
    <span className="sec-title">What To Do Next</span>
  </div>
  <div className="sec-body">
    <div className="rlist">
      <div className="ri">
        <div className="ric geo">🌊</div>
        <div className="rt"><strong>Flood Exposure:</strong> Review physical flood pathways and local hazard patterns.</div>
      </div>
      <div className="ri">
        <div className="ric hist">🏠</div>
        <div className="rt"><strong>Property Vulnerability:</strong> Prioritize drainage, water entry points, and structural weak spots.</div>
      </div>
      <div className="ri">
        <div className="ric clim">🛡️</div>
        <div className="rt"><strong>Insurance Risk:</strong> Review coverage status, premium trends, and mitigation steps that may strengthen insurability.</div>
      </div>
    </div>
  </div>
</div>

{result?.insuranceSignals?.urgentInsuranceReferral && (
  <div className="sec">
    <div className="sec-hd">
      <span className="sec-ico">🔥</span>
      <span className="sec-title">Insurance Risk Alert</span>
    </div>
    <div className="sec-body">
      <p style={{fontSize:13,color:"var(--sub)",lineHeight:1.7}}>
        Based on your flood risk and current insurance status, you may benefit from immediate guidance on coverage options and mitigation steps. Enter your phone number below to get personalized guidance.
      </p>
    </div>
  </div>
)}

{result?.insuranceSignals?.risingPremiumOpportunity && (
  <div className="sec">
    <div className="sec-hd">
      <span className="sec-ico">📈</span>
      <span className="sec-title">Premium Pressure Identified</span>
    </div>
    <div className="sec-body">
      <p style={{fontSize:13,color:"var(--sub)",lineHeight:1.7}}>
        Rising premiums may indicate growing insurer concern. Risk-reduction improvements could help strengthen your long-term insurability and clarify mitigation ROI.
      </p>
    </div>
  </div>
)}

{result?.insuranceSignals?.deniedCoverageRisk && (
  <div className="sec">
    <div className="sec-hd">
      <span className="sec-ico">⚠️</span>
      <span className="sec-title">Coverage Access Concern</span>
    </div>
    <div className="sec-body">
      <p style={{fontSize:13,color:"var(--sub)",lineHeight:1.7}}>
        A history of denied or dropped coverage can be a major risk signal. Mitigation planning and specialist review should be prioritized.
      </p>
    </div>
  </div>
)}

{result?.insuranceSignals?.priorClaimRisk && (
  <div className="sec">
    <div className="sec-hd">
      <span className="sec-ico">📄</span>
      <span className="sec-title">Claim History Risk Signal</span>
    </div>
    <div className="sec-body">
      <p style={{fontSize:13,color:"var(--sub)",lineHeight:1.7}}>
        A prior flood claim combined with current exposure can increase urgency around mitigation, documentation, and insurance strategy.
      </p>
    </div>
  </div>
)}

              {/* CALCULATOR */}
              <div className="sec">
                <div className="sec-hd"><span className="sec-ico">📊</span><span className="sec-title">Before vs. After: Your Savings Calculator</span></div>
                <div className="sec-body">
                  <CostCalculator score={result.score} />
                </div>
              </div>

              {/* DIY Solutions */}
              <div className="sec">
                <div className="sec-hd"><span className="sec-ico">🔨</span><span className="sec-title">Your DIY Protection Plan, {form.firstName}</span></div>
                <div className="sec-body">
                  <p style={{fontSize:13,color:"var(--sub)",marginBottom:16,lineHeight:1.6}}>
                    Based on your property profile, here are the protection categories most relevant to your situation — each with estimated annual savings if implemented. Click any category to explore products and get started today.
                    {!hasBasement && <span style={{display:"block",marginTop:5,color:"var(--teal)",fontWeight:600}}>✓ Tailored for a property without a basement.</span>}
                    {form.treesOverhang==="Yes" && <span style={{display:"block",marginTop:5,color:"#7a5200",fontWeight:600}}>🌳 Gutter and debris management solutions included based on your tree canopy.</span>}
                  </p>
                  <div className="cat-grid">
                    {activeCats.map(cat => {
                      const savings = result.catSavings?.[cat.id] || cat.baseSaving;
                      return (
                        <div className="cat" key={cat.id}>
                          <a className="cat-top" href={cat.url} target="_blank" rel="noopener noreferrer">
                            <span className="cat-ico">{cat.icon}</span>
                            <div className="cat-info">
                              <div className="cat-title">{cat.title}</div>
                              <div className="cat-tagline">{cat.tagline}</div>
                            </div>
                            <span className="cat-arrow">→</span>
                          </a>
                          <div className="cat-body">
                            <div className="cat-desc">{cat.desc}</div>
                            <div className="cat-saving">
                              <span className="cat-saving-ico">💚</span>
                              <span className="cat-saving-text">Estimated saving if implemented: {fmt(savings)}/year avg</span>
                            </div>
                            <div className="cat-pills">
                              {cat.products.map(p=><span className="cpill" key={p}>{p}</span>)}
                            </div>
                            <a className="cat-cta" href={cat.url} target="_blank" rel="noopener noreferrer">
                              Explore {cat.title} Solutions →
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Professional Services */}
              <div className="sec">
                <div className="sec-hd"><span className="sec-ico">👷</span><span className="sec-title">Professional Services</span></div>
                <div className="sec-body">
                  <div className="pro-list">
                    {(result.proServices||[]).map((s,i)=>(
                      <div className="pro-item" key={i}>
                        <div className="pro-ico">{s.icon}</div>
                        <div style={{flex:1}}>
                          <div className="pro-name">{s.name}</div>
                          <div className="pro-desc">{s.desc}</div>
                          <div className="pro-meta">
                            <span className="ptag pt-c">💲 {s.cost}</span>
                            <span className="ptag pt-i">⚡ {s.impact} Impact</span>
                            <span className="ptag pt-t">⏱ {s.time}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

{/* Email Nurture + Lead Conversion */}
<div className="sec">
  <div className="sec-hd">
    <span className="sec-ico">📧</span>
    <span className="sec-title">What Happens After You Get Your Results</span>
  </div>

  <div className="sec-body">
    <p style={{fontSize:13,color:"var(--sub)",marginBottom:8,lineHeight:1.6}}>
      When you connect with a specialist below, you'll receive expert flood protection insights — including seasonal alerts, product recommendations, and periodic check-ins to help keep your home protected year-round.
    </p>

    <p style={{fontSize:12,color:"var(--sub)",opacity:0.85,textAlign:"center",marginBottom:14}}>
      No spam — just practical guidance tailored to your property.
    </p>
  </div>
</div>

{result?.insuranceSignals?.hotLead && (
  <div style={{
    background:"#fff3cd",
    border:"1px solid #ffeeba",
    borderRadius:8,
    padding:"10px 14px",
    fontSize:13,
    marginBottom:12,
    color:"#856404",
    textAlign:"center"
  }}>
    ⚠️ Based on your flood risk and insurance profile, this property may need immediate attention.
  </div>
)}

              {/* Lead CTA */}
              <div className="lead-banner">
          <h2>
  {route === "insurance_referral_priority" && "Protect Your Home — Coverage May Be At Risk"}
  {route === "mitigation_roi_flow" && "Reduce Your Risk and Control Rising Premiums"}
  {route === "coverage_recovery_priority" && "Restore and Protect Your Coverage Options"}
  {route === "claim_history_priority" && "Strengthen Your Protection After Past Flooding"}
  {route === "standard_followup" && `Ready to Protect Your Home, ${form.firstName}?`}
</h2>
  <p>
  Based on your property risk profile, we’ll help you identify the most effective next steps for your home, finances, and long-term protection.
</p>
               {!leadDone ? (
  <div className="lform">
    <div className="lrow">
      <input
        className={`li ${leadErrs.name ? "err-field" : ""}`}
        placeholder="Your full name"
        value={lead.name}
        onChange={e => {
          setLead(l => ({ ...l, name: e.target.value }));
          setLeadErrs(errs => ({ ...errs, name: "" }));
        }}
      />
      <input
        className={`li ${leadErrs.phone ? "err-field" : ""}`}
        type="tel"
        placeholder="Phone number"
        value={lead.phone}
        onChange={e => {
          setLead(l => ({ ...l, phone: e.target.value }));
          setLeadErrs(errs => ({ ...errs, phone: "" }));
        }}
      />
    </div>
    {(leadErrs.name || leadErrs.phone) && (
      <div className="err" style={{ color: "#fff", textAlign: "left", marginTop: -6 }}>
        {leadErrs.name || leadErrs.phone}
      </div>
    )}

    <div className="fld" style={{ textAlign: "left" }}>
      <label style={{ fontSize: 12, opacity: 0.85, marginBottom: 6, display: "block" }}>
        What would you like help with?
      </label>

      <div style={{ position: "relative" }}>

<select
  className="ls2"
  value={lead.interest}
  onChange={e => setLead(l => ({ ...l, interest: e.target.value }))}
  style={{ appearance: "none", WebkitAppearance: "none", paddingRight: 40 }}
>
  <option value="Full Professional Assessment">Full Professional Assessment</option>
  <option value="Water Diversion Solutions">Product Recommendations</option>
  <option value="Entry Point Protection">Entry Point Protection</option>
  <option value="Sump Pumps & Water Removal">Sump Pumps & Water Removal</option>
  <option value="Infrastructure Protection">Flood Prevention Planning</option>
  <option value="Emergency Barriers">Emergency Barriers</option>
  <option value="General Information">General Questions</option>
</select>

        <div
          style={{
            position: "absolute",
            right: 14,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            fontSize: 12,
            opacity: 0.7,
            color: "#fff"
          }}
        >
          ▼
        </div>
      </div>
    </div>

    <button className="btn-lead" onClick={handleLeadSubmit}>
  {route === "insurance_referral_priority" && "CHECK COVERAGE OPTIONS →"}
  {route === "mitigation_roi_flow" && "SEE HOW TO LOWER MY RISK →"}
  {route === "coverage_recovery_priority" && "GET COVERAGE GUIDANCE →"}
  {route === "claim_history_priority" && "REVIEW MY PROTECTION PLAN →"}
  {route === "standard_followup" && "GET MY PERSONALIZED PLAN →"}
</button>

    <div className="lprivacy">
      🔒 Your information is never sold. You can unsubscribe from emails at any time.
    </div>
  </div>
) : (
  <div className="lsuccess">
    <h3>✓ You're all set, {form.firstName}!</h3>
    <p>
      A local specialist will reach out within 1 business day. Watch your inbox for your first flood protection tip shortly.
    </p>
  </div>
)}
</div>
              <button className="btn-reset" onClick={reset}>← Analyse Another Property</button>
            </div>
          )}
          <Toast show={copied} message="✓ Link copied to clipboard!" />
        </div>
      </div>
    </>
  );
}


