export function getStoredLeadId() {
  try {
    return localStorage.getItem("lead_id");
  } catch {
    return null;
  }
}

export function setStoredLeadId(id) {
  try {
    if (id) localStorage.setItem("lead_id", id);
  } catch {}
}
