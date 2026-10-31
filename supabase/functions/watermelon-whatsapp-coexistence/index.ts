import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const APP_ID = "1725466825210094";
// Only the dedicated Watermelon SIM can be authorized. The personal number is never eligible here.
const EXPECTED_BUSINESS_NUMBER = "351965637736";
const DEDICATED_WABA_ID = "4408982439363483";
const DEDICATED_PHONE_ID = "1423415737522090";
const GRAPH_VERSION = "v25.0";
const GRAPH_URL = "https://graph.facebook.com/" + GRAPH_VERSION;

const ORIGINS = new Set([
  "https://watermelonexperiences.pt",
  "https://www.watermelonexperiences.pt",
]);

function headers(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ORIGINS.has(origin) ? origin : "https://watermelonexperiences.pt";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}
function json(req: Request, payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: headers(req) });
}
function digits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}
function isMetaRedirect(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "https:" && url.hostname === "developers.facebook.com" &&
      url.pathname === "/es/oauth/callback/" && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}
async function graph(path: string, token: string, init?: RequestInit) {
  const response = await fetch(GRAPH_URL + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + token,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof data?.error?.code === "number" ? data.error.code : undefined;
    throw new Error("Meta validation failed" + (code ? " (" + code + ")" : "") + ".");
  }
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return json(req, { error: "Server configuration is incomplete." }, 503);
  }
  const origin = req.headers.get("origin");
  if (origin && !ORIGINS.has(origin)) return json(req, { error: "Origin not allowed." }, 403);
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json(req, { error: "Authentication required." }, 401);
  const user = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { error: adminError } = await user.rpc("watermelon_whatsapp_admin_status");
  if (adminError) return json(req, { error: "Admin access required." }, 403);

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: current, error: currentError } = await service.rpc("watermelon_whatsapp_server_config");
  if (currentError || !current) return json(req, { error: "WhatsApp server settings are unavailable." }, 503);

  let input: { operation?: unknown; code?: unknown; redirect_uri?: unknown; waba_id?: unknown; phone_number_id?: unknown };
  try {
    if (Number(req.headers.get("content-length") || 0) > 15000) throw new Error("Too large");
    input = await req.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid request");
  } catch {
    return json(req, { error: "Invalid request." }, 400);
  }

  const reuseServerAuthorization = input.operation === "validate_existing_authorization";
  if (input.operation !== undefined && !reuseServerAuthorization) {
    return json(req, { error: "Unknown authorization operation." }, 400);
  }
  // This operation accepts no browser-supplied token, code, WABA or phone ID.
  if (reuseServerAuthorization && Object.keys(input).some(key => key !== "operation")) {
    return json(req, { error: "Existing authorization accepts only the operation name." }, 400);
  }
  const code = typeof input.code === "string" ? input.code.trim() : "";
  const redirectUri = typeof input.redirect_uri === "string" ? input.redirect_uri.trim() : "";
  const wabaId = reuseServerAuthorization ? DEDICATED_WABA_ID : typeof input.waba_id === "string" ? input.waba_id.trim() : "";
  const expectedPhoneId = reuseServerAuthorization ? DEDICATED_PHONE_ID : typeof input.phone_number_id === "string" ? input.phone_number_id.trim() : "";
  if (!reuseServerAuthorization && (!code || code.length > 4096 || !isMetaRedirect(redirectUri) || !/^\d{10,25}$/.test(wabaId) || (expectedPhoneId && !/^\d{10,25}$/.test(expectedPhoneId)))) {
    return json(req, { error: "Provide a fresh Meta code, its exact redirect URI, and the WABA ID returned for the dedicated Watermelon number." }, 400);
  }
  const appSecret = String(current.app_secret || "");
  if (!appSecret) return json(req, { error: "Meta App Secret must be configured server-side first." }, 409);

  // The authorization code is single use. Do not log it, return it or persist it.
  let accessToken = "";
  try {
    if (reuseServerAuthorization) {
      accessToken = String(current.access_token || "");
      if (!accessToken) return json(req, { error: "No server authorization is available. Complete a fresh Meta authorization first." }, 409);
      const debug = await graph("/debug_token?input_token=" + encodeURIComponent(accessToken), APP_ID + "|" + appSecret);
      const token = debug?.data;
      const permissions = ["whatsapp_business_management", "whatsapp_business_messaging"];
      const expiresAt = Number(token?.expires_at || 0);
      const dataExpiresAt = Number(token?.data_access_expires_at || 0);
      const now = Math.floor(Date.now() / 1000);
      const scopes = Array.isArray(token?.scopes) ? token.scopes : [];
      const granular = Array.isArray(token?.granular_scopes) ? token.granular_scopes : [];
      if (token?.is_valid !== true || String(token?.app_id || "") !== APP_ID ||
        (expiresAt > 0 && expiresAt <= now) || (dataExpiresAt > 0 && dataExpiresAt <= now) ||
        !permissions.every(scope => scopes.includes(scope)) ||
        granular.some((grant: { scope?: string; target_ids?: string[] }) =>
          permissions.includes(String(grant.scope || "")) && Array.isArray(grant.target_ids) &&
          !grant.target_ids.some(id => String(id) === DEDICATED_WABA_ID || String(id) === DEDICATED_PHONE_ID))) {
        return json(req, { error: "The saved Meta authorization does not grant valid Watermelon CRM access to the dedicated business account. Complete a fresh Meta authorization; existing settings were preserved." }, 409);
      }
    } else {
    const exchange = await fetch(GRAPH_URL + "/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: APP_ID,
        client_secret: appSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    const response = await exchange.json().catch(() => ({}));
    if (!exchange.ok || !response?.access_token) {
      const codeNumber = typeof response?.error?.code === "number" ? response.error.code : null;
      return json(req, {
        error: "Meta rejected the code. Check that it is fresh and the App Secret matches Watermelon CRM.",
        ...(codeNumber ? { meta_code: codeNumber } : {}),
      }, 409);
    }
    accessToken = String(response.access_token);
    }

    // Fail closed unless Meta proves this authorized WABA contains the new number.
    // Never authorize the old personal SIM or trust a browser-supplied phone ID alone.
    const phones = await graph("/" + wabaId + "/phone_numbers?fields=id,display_phone_number&limit=100", accessToken);
    const matchedPhone = Array.isArray(phones.data) &&
      phones.data.find((phone: { id?: string; display_phone_number?: string }) =>
        Boolean(phone.id) && digits(phone.display_phone_number) === EXPECTED_BUSINESS_NUMBER &&
        (!expectedPhoneId || String(phone.id) === expectedPhoneId)
      );
    if (!matchedPhone) {
      return json(req, {
        error: "This token does not verify access to the expected WhatsApp account and business phone. No settings were changed.",
      }, 409);
    }

    // Subscribe only the approved WhatsApp Business Account; no phone registration or migration.
    await graph("/" + wabaId + "/subscribed_apps", accessToken, {
      method: "POST", body: JSON.stringify({}),
    });
    const subscriptions = await graph("/" + wabaId + "/subscribed_apps", accessToken);
    const subscribed = Array.isArray(subscriptions.data) &&
      subscriptions.data.some((item: { id?: string; whatsapp_business_api_data?: { id?: string } }) =>
        String(item.id || item.whatsapp_business_api_data?.id || "") === APP_ID
      );
    if (!subscribed) {
      return json(req, { error: "Meta did not confirm the application subscription; existing CRM settings were preserved." }, 409);
    }

    const { error: saveError } = await user.rpc("watermelon_save_whatsapp_config", {
      p_app_secret: null,
      p_access_token: reuseServerAuthorization ? null : accessToken,
      p_phone_number_id: String(matchedPhone.id),
      p_waba_id: wabaId,
      p_business_phone: "+351965637736",
      p_graph_version: GRAPH_VERSION,
    });
    if (saveError) return json(req, { error: "Meta subscription confirmed, but CRM configuration could not be saved." }, 500);
    return json(req, {
      ok: true,
      waba_id: wabaId,
      phone_number_id: String(matchedPhone.id),
      subscription_confirmed: true,
      credentials_saved: true,
      message_delivery_verified: false,
      authorization_source: reuseServerAuthorization ? "existing_server_token" : "fresh_code",
      next_step: "Confirm Meta messages webhook field and test inbound/outbound messaging.",
    });
  } catch {
    return json(req, { error: "Could not verify or subscribe this Meta authorization. Existing CRM settings were preserved unless explicitly confirmed earlier." }, 502);
  } finally {
    // Do not log access tokens; the function does not return them.
    accessToken = "";
  }
});

