export function normalizeAssessmentResult(raw, form, locationLabel) {
  const data = raw && typeof raw === "object" ? raw : {};
  const score = Number.isFinite(Number(data.score)) ? Math.max(0, Math.min(100, Math.round(Number(data.score)))) : 62;
  const tier = data.tier || (score >= 85 ? "Severe" : score >= 65 ? "High" : score >= 40 ? "Moderate" : "Low");
  const fallbackLocation = data.locationLabel || locationLabel || [form.city, form.state].filter(Boolean).join(", ") || form.zip || "your area";

  return {
    score,
    tier,
    locationLabel: fallbackLocation,
    bullets: {
      geographic: data?.bullets?.geographic || "Localized runoff, drainage overload, and stormwater concentration can create flood exposure even outside the highest mapped flood zones.",
      historical: data?.bullets?.historical || "Past severe-rain and flood events in the broader region suggest repeat exposure risk should be taken seriously.",
      climate: data?.bullets?.climate || "Rainfall intensity is increasing in many regions, which raises short-duration flooding and drainage stress over time."
    },
    financial: {
      annualRisk: data?.financial?.annualRisk || "$4,000–$14,000",
      fiveYearNoAction: data?.financial?.fiveYearNoAction || "$20,000–$70,000",
      propertyValueImpact: data?.financial?.propertyValueImpact || "-3% to -8%",
      insurancePremiumRange: data?.financial?.insurancePremiumRange || "$1,600–$4,800/yr",
      narrative: data?.financial?.narrative || "Without mitigation, repeated water intrusion can damage structures, finishes, contents, and mechanical systems while also affecting insurability and resale perception."
    },
    diyCategories: Array.isArray(data.diyCategories) && data.diyCategories.length ? data.diyCategories : ["diversion", "entry", "removal", "infrastructure", "barriers"],
    catSavings: data?.catSavings && typeof data.catSavings === "object" ? data.catSavings : {
      diversion: 4200,
      entry: 2800,
      removal: 5300,
      infrastructure: 6700,
      barriers: 2400
    },
    proServices: Array.isArray(data.proServices) && data.proServices.length ? data.proServices : [
      { icon: "🔧", name: "French Drain System", desc: "Redirects groundwater and surface water away from the foundation.", cost: "$3,000–$9,000", impact: "Very High", time: "2–3 days" },
      { icon: "🏗️", name: "Foundation Waterproofing", desc: "Adds a dedicated waterproof barrier to reduce seepage risk.", cost: "$6,000–$18,000", impact: "Very High", time: "3–5 days" },
      { icon: "🔍", name: "Professional Risk Assessment", desc: "Provides property-specific mitigation priorities and next steps.", cost: "$500–$1,500", impact: "High", time: "Half day" }
    ]
  };
}

export function getInsuranceLeadSignals(form, score) {
  const signals = {
    hotLead: false,
    urgentInsuranceReferral: false,
    risingPremiumOpportunity: false,
    deniedCoverageRisk: false,
    priorClaimRisk: false,
    scoreBand: score >= 75 ? "severe" : score >= 50 ? "high" : score >= 25 ? "moderate" : "low"
  };

  if ((form.floodInsurance === "No" || form.floodInsurance === "Not sure") && score >= 50) {
    signals.hotLead = true;
    signals.urgentInsuranceReferral = true;
  }

  if (form.floodInsurance === "Yes" && form.premiumIncrease === "Yes") {
    signals.risingPremiumOpportunity = true;
  }

  if (form.deniedOrDropped === "Yes") {
    signals.deniedCoverageRisk = true;
    signals.hotLead = true;
  }

  if (form.priorFloodClaim === "Yes" && score >= 50) {
    signals.priorClaimRisk = true;
    signals.hotLead = true;
  }

  return signals;
}


export function getLeadRoute(form, score) {
  if ((form.floodInsurance === "No" || form.floodInsurance === "Not sure") && score >= 50) {
    return "insurance_referral_priority";
  }

  if (form.floodInsurance === "Yes" && form.premiumIncrease === "Yes") {
    return "mitigation_roi_flow";
  }

  if (form.deniedOrDropped === "Yes") {
    return "coverage_recovery_priority";
  }

  if (form.priorFloodClaim === "Yes" && score >= 50) {
    return "claim_history_priority";
  }

  return "standard_followup";
}

export function clampScore(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}


export function getMeyerlandPackage(form, score) {
  const hasPriorFlooding = form.priorFloodDamage === "Yes";
  const hasDrainageIssues =
    form.drainageIssues === "Yes" || form.drainageIssues === "Sometimes";

  const slabOrNoBasement =
    !form.basement ||
    form.basement === "No basement";

  if (score >= 75 || (hasPriorFlooding && hasDrainageIssues)) {
    return {
      recommended_package:
        "Drainage Stabilization + Entry Protection + Interior Flood Control",
      estimated_project_range: "$12,000–$30,000+",
    };
  }

  if (hasDrainageIssues && slabOrNoBasement) {
    return {
      recommended_package: "Drainage Stabilization + Entry Protection",
      estimated_project_range: "$8,000–$20,000",
    };
  }

  if (hasDrainageIssues) {
    return {
      recommended_package: "Property Drainage Stabilization",
      estimated_project_range: "$5,000–$15,000",
    };
  }

  return {
    recommended_package: "Flood Risk Review + Entry Protection Screening",
    estimated_project_range: "$1,500–$8,000",
  };
}


export function getPropertyVulnerabilityScore(form, floodExposureScore) {
  let score = 35;

  if (form.priorFloodDamage === "Yes") score += 18;
  if (form.drainageIssues === "Yes") score += 16;
  if (form.drainageIssues === "Sometimes") score += 8;
  if (form.treesOverhang === "Yes") score += 8;

  if (form.basement === "Yes — Full finished basement") score += 14;
  if (form.basement === "Yes — Unfinished basement") score += 10;
  if (form.basement === "Yes — Partial / crawlspace") score += 8;

  if (form.propertyType === "Single Family Home") score += 6;
  if (form.propertyType === "Multi-Family") score += 8;
  if (form.propertyType === "Commercial") score += 10;

  const year = Number(form.yearBuilt);
  if (!Number.isNaN(year) && year > 0) {
    if (year < 1980) score += 10;
    else if (year < 2000) score += 6;
    else if (year < 2015) score += 3;
  }

  if (floodExposureScore >= 75) score += 8;
  else if (floodExposureScore >= 50) score += 4;

  return clampScore(score);
}


export function getInsuranceRiskScore(form, floodExposureScore) {
  let score = 30;

  if (form.floodInsurance === "No") score += 28;
  if (form.floodInsurance === "Not sure") score += 18;
  if (form.floodInsurance === "Yes") score += 4;

  if (form.priorFloodClaim === "Yes") score += 18;
  if (form.premiumIncrease === "Yes") score += 16;
  if (form.deniedOrDropped === "Yes") score += 22;

  if (floodExposureScore >= 75) score += 10;
  else if (floodExposureScore >= 50) score += 6;

  return clampScore(score);
}


export function getOverallPropertyRiskScore(floodExposure, propertyVulnerability, insuranceRisk) {
  return clampScore(
    floodExposure * 0.45 +
    propertyVulnerability * 0.35 +
    insuranceRisk * 0.20
  );
}

