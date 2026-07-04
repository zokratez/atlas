import { createClient } from "@supabase/supabase-js";
import { getRequiredEnv } from "./env";

export function getServiceClient() {
  const serviceKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(getRequiredEnv("SUPABASE_URL"), serviceKey, {
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
  return getServiceClient().schema("atlas");
}
