export const DIY_CATS = [
  {
    id: "diversion", icon: "🌊", title: "Water Diversion",
    url: "https://oiriunu.com/flood-solutions/water-diversion/",
    tagline: "Stop water before it reaches your home",
    desc: "Redirect surface water and runoff away from your foundation. The most cost-effective first line of defence — often preventing the need for more expensive interior solutions.",
    products: ["Extended downspouts", "Yard regrading", "French drains", "Rain gardens"],
    baseSaving: 4200,
  },
  {
    id: "entry", icon: "🚪", title: "Entry Point Protection",
    url: "https://oiriunu.com/flood-solutions/entry-point-protection/",
    tagline: "Seal every path water could use to enter",
    desc: "Water exploits gaps around doors, windows, and foundation cracks. Targeted sealing and barriers can dramatically reduce water intrusion with minimal disruption.",
    products: ["Door flood shields", "Window well covers", "Foundation crack seal kits"],
    baseSaving: 3100,
  },
  {
    id: "removal", icon: "⚡", title: "Water Removal",
    url: "https://oiriunu.com/flood-solutions/water-removal/",
    tagline: "When water gets in, remove it fast",
    desc: "Automatic pumping systems ensure any water that enters is evacuated quickly — minimising damage to floors, walls, and valuables by reducing standing time.",
    products: ["Primary sump pumps", "Battery backup pumps", "Portable utility pumps"],
    baseSaving: 5800,
  },
  {
    id: "infrastructure", icon: "🔧", title: "Infrastructure Protection",
    url: "https://oiriunu.com/flood-solutions/infrastructure-protection/",
    tagline: "Protect your home's vital systems",
    desc: "HVAC, electrical panels, and sewer lines are extremely expensive to repair after flooding. Guard your infrastructure at the source before a storm event.",
    products: ["Backwater valves", "Raised utility platforms"],
    baseSaving: 6500,
  },
  {
    id: "barriers", icon: "🛡️", title: "Emergency Barriers",
    url: "https://oiriunu.com/flood-solutions/emergency-barriers/",
    tagline: "Rapid deployment when storms threaten",
    desc: "Keep deployable flood barriers on hand for fast protection during storm events. Modern solutions are lightweight, reusable, and highly effective for rapid deployment.",
    products: ["Absorbent flood bags", "Modular perimeter barriers"],
    baseSaving: 2400,
  },
];


export const LOAD_STEPS = [
  "Locating parcel & FEMA zone data…",
  "Modelling elevation profile…",
  "Cross-referencing NOAA rainfall data…",
  "Querying 50-year disaster records…",
  "Running climate projections…",
  "Building your personalised report…",
];


export const FORM_STEPS = ["Your Details","Property Info","Property Condition"];


export const tierCls   = s => s < 25 ? "tl" : s < 50 ? "tm" : s < 75 ? "th" : "ts";

export const tierLabel = s => s < 25 ? "Low Risk" : s < 50 ? "Moderate Risk" : s < 75 ? "High Risk" : "Severe Risk";

export const fmt       = n => "$" + Math.round(n).toLocaleString();

