import { createClient } from "@supabase/supabase-js";

let client = null;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function requireSupabaseUrl() {
  const value = requireEnv("SUPABASE_URL");
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("SUPABASE_URL must be a valid URL like https://PROJECT_REF.supabase.co.");
  }

  const hasInvalidPath = parsed.pathname && parsed.pathname !== "/";
  const isSupabaseHost = parsed.hostname.endsWith(".supabase.co");

  if (parsed.protocol !== "https:" || !isSupabaseHost || hasInvalidPath) {
    throw new Error("SUPABASE_URL must be the Supabase project base URL, for example https://PROJECT_REF.supabase.co. Do not use the dashboard URL, anon key, service role key, or a /rest/v1 URL.");
  }

  return parsed.origin;
}

function getSupabaseClient() {
  if (!client) {
    client = createClient(
      requireSupabaseUrl(),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } }
    );
  }
  return client;
}

const supabase = {
  from(...args) {
    return getSupabaseClient().from(...args);
  },
};

export default supabase;
