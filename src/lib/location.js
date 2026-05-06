export function getSeasonalAlert() {
  const now = new Date();
  const year = now.getFullYear();
  const events = [
    { name: "Atlantic Hurricane Season",  start: new Date(year, 5, 1),  color: "#c0392b", icon: "🌀" },
    { name: "Spring Flood Season",         start: new Date(year, 2, 15), color: "#1068a0", icon: "🌧️" },
    { name: "Midwest Storm Season",        start: new Date(year, 3, 1),  color: "#8e44ad", icon: "⛈️" },
    { name: "Pacific Storm Season",        start: new Date(year, 9, 15), color: "#2471a3", icon: "🌊" },
  ];
  let nearest = null, minDays = Infinity;
  events.forEach(ev => {
    let start = new Date(ev.start);
    if (start < now) start.setFullYear(year + 1);
    const days = Math.ceil((start - now) / 86400000);
    if (days < minDays) { minDays = days; nearest = { ...ev, days }; }
  });
  return nearest;
}


export async function lookupZip(zip) {
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!res.ok) return { valid: false };
    const data = await res.json();
    return {
      valid: true,
      city: data.places[0]["place name"],
      state: data.places[0]["state abbreviation"]
    };
  } catch { return { valid: false }; }
}


export async function lookupCounty(zip) {
  try {
    const res = await fetch(`https://geo.fcc.gov/api/census/block/find?zip=${zip}&format=json`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.County?.name || null;
  } catch { return null; }
}


export function getUrlContext() {
  const params = new URLSearchParams(window.location.search);

  return {
    source: params.get("source") || null,
    target_area: params.get("area") || null,
    utm_campaign: params.get("utm_campaign") || null,
  };
}


export function getLocalRiskContext(targetArea) {
  if (targetArea === "brays_bayou_meyerland_core") {
    return "Meyerland / Brays Bayou: combined surface drainage and bayou flood exposure";
  }

  return null;
}

