import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./env.js";

export function getSupabase() {
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(requireEnv("SUPABASE_URL"), serviceKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  });
}

export function atlasDb() {
  return getSupabase().schema("atlas");
}
