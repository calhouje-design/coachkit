import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client = null;
let tokenGetter = async () => null;

export function isCloudConfigured() {
  return Boolean(url && anonKey);
}

/** Latest Clerk session token. Called by the Supabase client on each request. */
export function setAccessTokenGetter(fn) {
  tokenGetter = typeof fn === "function" ? fn : async () => null;
}

export function getSupabase() {
  if (!isCloudConfigured()) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      accessToken: async () => {
        try {
          return (await tokenGetter()) || null;
        } catch {
          return null;
        }
      },
    });
  }
  return client;
}
