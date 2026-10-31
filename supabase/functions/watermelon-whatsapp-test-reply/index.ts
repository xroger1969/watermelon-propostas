import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUSINESS = "351965637736";
const PHONE_ID = "1423415737522090";
const WABA_ID = "4408982439363483";
const CLAIM_ID = "96563773-6000-8000-a000-000000000001";
const SOURCE = "crm_cloud_api_controlled_test";
const PHRASE = "TESTE WATERMELON 965";
const REPLY = "Teste Watermelon recebido. A ligação de resposta do CRM está a funcionar.";
const ORIGINS = new Set(["https://watermelonexperiences.pt", "https://www.watermelonexperiences.pt"]);

function digits(value: unknown) { return String(value || "").replace(/\D/g, ""); }
function json(req: Request, body: unknown, status = 200) {
  const origin = req.headers.get("origin") || "";
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin",
    "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "https://www.watermelonexperiences.pt",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json(req, {}, 204);
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);
  const origin = req.headers.get("origin");
  if (origin && !ORIGINS.has(origin)) return json(req, { error: "Origin not allowed." }, 403);
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json(req, { error: "Authentication required." }, 401);
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") || "", {
      auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } },
    });
    if ((await user.rpc("watermelon_whatsapp_admin_status")).error) return json(req, { error: "Admin access required." }, 403);
    const input = await req.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input) ||
      input.operation !== "send_single_test_reply" ||
      Object.keys(input).some(key => !["operation", "inbound_test_message_id"].includes(key)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(input.inbound_test_message_id || ""))) {
      return json(req, { error: "Only the explicit single-test operation and inbound message ID are accepted." }, 400);
    }
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: config, error: configError } = await admin.rpc("watermelon_whatsapp_server_config");
    if (configError || !config || digits(config.business_phone) !== BUSINESS ||
      config.phone_number_id !== PHONE_ID || config.waba_id !== WABA_ID || !config.access_token) {
      return json(req, { error: "Dedicated business configuration is not valid." }, 409);
    }
    const { data: inbound, error: inboundError } = await admin.from("watermelon_messages")
      .select("id,request_id,contact_id,phone_number_id,direction,channel,text_body,message_type,status,source,is_private,from_phone,to_phone,wa_id,whatsapp_timestamp,created_at,whatsapp_message_id")
      .eq("id", input.inbound_test_message_id).maybeSingle();
    const timestamp = Date.parse(String(inbound?.whatsapp_timestamp || ""));
    const age = Date.now() - timestamp;
    const recipient = digits(inbound?.from_phone);
    if (inboundError || !inbound || inbound.phone_number_id !== PHONE_ID || inbound.direction !== "inbound" ||
      inbound.channel !== "whatsapp" || inbound.source !== "cloud_api" || inbound.status !== "received" ||
      inbound.is_private !== false || inbound.message_type !== "text" || inbound.text_body !== PHRASE ||
      !inbound.request_id || !inbound.contact_id || !inbound.whatsapp_message_id ||
      !/^\d{8,15}$/.test(recipient) || recipient === BUSINESS || digits(inbound.to_phone) !== BUSINESS ||
      digits(inbound.wa_id) !== recipient || !Number.isFinite(timestamp) || age < 0 || age >= 24 * 60 * 60 * 1000) {
      return json(req, { error: "A recent, non-private inbound acceptance-test message is required." }, 409);
    }
    const [{ data: contact, error: contactError }, { data: request, error: requestError }] = await Promise.all([
      admin.from("watermelon_contacts").select("id,phone_digits,is_private").eq("id", inbound.contact_id).maybeSingle(),
      admin.from("watermelon_requests").select("id,contact_id,is_private").eq("id", inbound.request_id).maybeSingle(),
    ]);
    if (contactError || requestError || !contact || !request || contact.is_private !== false || request.is_private !== false ||
      request.contact_id !== contact.id || digits(contact.phone_digits) !== recipient) {
      return json(req, { error: "The test request and recipient are not eligible." }, 409);
    }

    // Existing status constraint has no pending state. failed is conservative;
    // the UI renders controlled_test_state pending/unknown explicitly. A fixed
    // PK permits one attempt in this entire test cycle, even after a timeout.
    const { error: claimError } = await admin.from("watermelon_messages").insert({
      id: CLAIM_ID, request_id: request.id, contact_id: contact.id, phone_number_id: PHONE_ID,
      direction: "outbound", channel: "whatsapp", is_private: false,
      from_phone: BUSINESS, to_phone: recipient, wa_id: recipient, message_type: "text", text_body: REPLY,
      source: SOURCE, status: "failed", whatsapp_message_id: null,
      raw_payload: { controlled_test_state: "pending", inbound_test_message_id: inbound.id },
    });
    if (claimError) return json(req, {
      error: claimError.code === "23505" ? "This single test has already been attempted. It will not be sent again." : "Unable to reserve the single test safely.",
      code: claimError.code === "23505" ? "TEST_ALREADY_ATTEMPTED" : "TEST_CLAIM_FAILED",
    }, claimError.code === "23505" ? 409 : 500);

    async function record(state: string, patch: Record<string, unknown> = {}, diagnostics: { meta_code?: number; meta_subcode?: number } = {}) {
      return await admin.from("watermelon_messages").update({
        ...patch, raw_payload: { controlled_test_state: state, inbound_test_message_id: inbound.id, ...diagnostics },
      }).eq("id", CLAIM_ID).eq("source", SOURCE).eq("is_private", false);
    }
    let response: Response;
    try {
      response = await fetch("https://graph.facebook.com/v25.0/" + PHONE_ID + "/messages", {
        method: "POST", headers: { Authorization: "Bearer " + config.access_token, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: recipient,
          type: "text", text: { preview_url: false, body: REPLY } }),
      });
    } catch {
      await record("unknown");
      return json(req, { error: "The test result is uncertain. Check the recipient and CRM; do not repeat the send.", code: "TEST_RESULT_UNKNOWN" }, 502);
    }
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const diagnostics = {
        ...(typeof result?.error?.code === "number" && Number.isFinite(result.error.code) ? { meta_code: result.error.code } : {}),
        ...(typeof result?.error?.error_subcode === "number" && Number.isFinite(result.error.error_subcode) ? { meta_subcode: result.error.error_subcode } : {}),
      };
      await record("rejected", {}, diagnostics);
      return json(req, { error: "Meta rejected this single test. General sending remains paused; the test will not be retried.", code: "TEST_REJECTED", ...diagnostics }, 409);
    }
    const messageId = typeof result?.messages?.[0]?.id === "string" ? result.messages[0].id : "";
    if (!messageId) {
      await record("unknown");
      return json(req, { error: "Meta did not confirm a message ID. Check the recipient; do not repeat the send.", code: "TEST_RESULT_UNKNOWN" }, 502);
    }
    const { error: saveError } = await record("accepted", { whatsapp_message_id: messageId, status: "sent", whatsapp_timestamp: new Date().toISOString() });
    if (saveError) return json(req, { error: "Meta accepted the test but the CRM could not confirm its record. Do not repeat the send.", code: "TEST_RECORD_UNCONFIRMED" }, 502);
    return json(req, { ok: true, mode: "controlled_test", accepted: true, delivered: false, message_id: CLAIM_ID });
  } catch {
    return json(req, { error: "The controlled test could not be completed. General sending remains paused; do not repeat an uncertain attempt." }, 500);
  }
});
