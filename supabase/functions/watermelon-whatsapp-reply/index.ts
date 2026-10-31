import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";

// Deliberate replies only. Never call the suspended send/send-v2 endpoints or drain queues.
// Deploy with verify_jwt=true only after the controlled reply is confirmed delivered.
const BUSINESS = "351965637736";
const PHONE_ID = "1423415737522090";
const WABA_ID = "4408982439363483";
const SOURCE = "crm_cloud_api_manual";
const GUARD_SOURCE = "crm_cloud_api_manual_guard";
const GRAPH_VERSION = "v25.0";
const ORIGINS = new Set(["https://watermelonexperiences.pt", "https://www.watermelonexperiences.pt"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
function internationalPhone(phone: unknown, phoneDigits?: unknown): string | null {
  const raw = String(phone || phoneDigits || "").trim();
  if (!raw || !/^[+\d\s().-]+$/.test(raw)) return null;
  const compact = raw.replace(/[\s().-]/g, "");
  let normalized: string;
  if (compact.startsWith("+")) normalized = compact.slice(1);
  else if (compact.startsWith("00")) normalized = compact.slice(2);
  else if (/^9\d{8}$/.test(compact)) normalized = "351" + compact;
  else if (/^3519\d{8}$/.test(compact)) normalized = compact;
  else return null;
  if (!/^[1-9]\d{7,14}$/.test(normalized)) return null;
  if (phoneDigits) {
    let stored = digits(phoneDigits);
    if (stored.startsWith("00")) stored = stored.slice(2);
    if (/^9\d{8}$/.test(stored)) stored = "351" + stored;
    if (stored !== normalized) return null;
  }
  return normalized;
}

function headers(req: Request) {
  const origin = req.headers.get("origin") || "";
  return { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin",
    "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "https://www.watermelonexperiences.pt",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS" };
}
function result(req: Request, status: number, code: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: status === 200, code, ...extra }), { status, headers: headers(req) });
}
async function digest(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.headers.has("origin") && !ORIGINS.has(req.headers.get("origin") || "")) return result(req, 403, "ORIGIN_NOT_ALLOWED");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== "POST") return result(req, 405, "METHOD_NOT_ALLOWED");
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return result(req, 401, "AUTH_REQUIRED");
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !anonKey || !serviceKey) return result(req, 503, "SERVER_NOT_CONFIGURED");

  try {
    const user = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } } });
    const { data: identity, error: identityError } = await user.auth.getUser(authorization.slice(7));
    if (identityError || !identity?.user?.id) return result(req, 401, "AUTH_REQUIRED");
    const { error: adminError } = await user.rpc("watermelon_whatsapp_admin_status");
    if (adminError) return result(req, 403, "ADMIN_REQUIRED");

    let body: { request_id: string; text: string; idempotency_key: string };
    try {
      if (Number(req.headers.get("content-length") || 0) > 20000) throw new Error();
      const raw = await req.text();
      if (raw.length > 20000) throw new Error();
      const input = JSON.parse(raw);
      if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).length !== 3 || Object.keys(input).some(key => !["request_id", "text", "idempotency_key"].includes(key)) ||
        typeof input.request_id !== "string" || !UUID.test(input.request_id) ||
        typeof input.text !== "string" || !input.text.trim() || input.text.length > 4000 ||
        typeof input.idempotency_key !== "string" || !IDEMPOTENCY_UUID.test(input.idempotency_key)) throw new Error();
      body = input;
    } catch { return result(req, 400, "INVALID_MANUAL_REPLY"); }
    const requestId = body.request_id.toLowerCase();
    const key = body.idempotency_key.toLowerCase();
    const text = body.text; // Preserve the exact text approved by the operator.
    const actorId = String(identity.user.id);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: config, error: configError } = await admin.rpc("watermelon_whatsapp_server_config");
    if (configError || digits(config?.business_phone) !== BUSINESS || config?.phone_number_id !== PHONE_ID ||
      config?.waba_id !== WABA_ID || !config?.access_token) return result(req, 409, "DEDICATED_ACCOUNT_REQUIRED");

    const { data: request, error: requestError } = await admin.from("watermelon_requests")
      .select("id,contact_id,is_private").eq("id", requestId).maybeSingle();
    if (requestError) return result(req, 503, "CRM_LOOKUP_FAILED");
    if (!request || request.is_private !== false || !request.contact_id) return result(req, 403, "PUBLIC_BUSINESS_REQUEST_REQUIRED");
    const { data: contact, error: contactError } = await admin.from("watermelon_contacts")
      .select("id,phone,phone_digits,is_private").eq("id", request.contact_id).maybeSingle();
    const to = internationalPhone(contact?.phone, contact?.phone_digits);
    if (contactError) return result(req, 503, "CRM_LOOKUP_FAILED");
    if (!contact || contact.id !== request.contact_id || contact.is_private !== false || !to || to === BUSINESS)
      return result(req, 403, "PUBLIC_BUSINESS_CONTACT_REQUIRED");

    const hash = await digest(JSON.stringify({ requestId, contactId: contact.id, to, text, actorId, phoneId: PHONE_ID, wabaId: WABA_ID }));
    // The existing messages PK is the durable claim. Conflict NEVER retries Graph.
    async function existingClaim() {
      const { data, error } = await admin.from("watermelon_messages")
        .select("id,request_id,contact_id,text_body,from_phone,to_phone,phone_number_id,raw_payload,whatsapp_message_id,status")
        .eq("id", key).eq("is_private", false).eq("source", SOURCE).eq("channel", "whatsapp").eq("direction", "outbound").maybeSingle();
      if (error) return result(req, 503, "CLAIM_LOOKUP_FAILED");
      if (!data) return null;
      const manual = data.raw_payload?.manual_reply;
      if (data.request_id !== requestId || data.contact_id !== contact.id || data.text_body !== text ||
        data.from_phone !== BUSINESS || data.to_phone !== to || data.phone_number_id !== PHONE_ID ||
        manual?.actor_id !== actorId || manual?.operation_hash !== hash) return result(req, 409, "IDEMPOTENCY_KEY_REUSED");
      if (manual.state === "submitted" && data.whatsapp_message_id) return result(req, 200, "ALREADY_SUBMITTED", {
        mode: "text", deduplicated: true, whatsapp_message_id: data.whatsapp_message_id, delivery_verified: false });
      return result(req, 409, manual.state === "rejected" ? "PREVIOUS_REPLY_REJECTED" : "MANUAL_REPLY_UNCERTAIN", {
        retry_allowed: false, message: "A tentativa já está reservada. Verifica a conversa; não reenviar automaticamente." });
    }
    const previous = await existingClaim();
    if (previous) return previous;

    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { data: inbound, error: inboundError } = await admin.from("watermelon_messages")
      .select("id,whatsapp_message_id,whatsapp_timestamp,is_private,request_id,contact_id,phone_number_id,from_phone,to_phone,wa_id,source,status")
      .eq("request_id", requestId).eq("contact_id", contact.id).eq("phone_number_id", PHONE_ID)
      .eq("channel", "whatsapp").eq("direction", "inbound").eq("is_private", false)
      .eq("source", "cloud_api").eq("status", "received").eq("from_phone", to).eq("to_phone", BUSINESS).eq("wa_id", to)
      .gte("whatsapp_timestamp", cutoff).lte("whatsapp_timestamp", now.toISOString())
      .order("whatsapp_timestamp", { ascending: false }).limit(1).maybeSingle();
    if (inboundError) return result(req, 503, "CRM_LOOKUP_FAILED");
    const receivedAt = new Date(inbound?.whatsapp_timestamp || "").getTime();
    if (!inbound?.whatsapp_message_id || inbound.is_private !== false || !Number.isFinite(receivedAt) ||
      receivedAt > now.getTime() || receivedAt <= now.getTime() - 24 * 60 * 60 * 1000)
      return result(req, 409, "DEDICATED_SERVICE_WINDOW_REQUIRED", { retry_allowed: false });

    // A private internal row serializes different UUIDs for this conversation.
    // Its source is excluded from conversations, proofs and delivery receipts.
    // A SELECT alone would allow two tabs to reserve different message PKs.
    const guardHash = await digest(`manual-reply-guard:${requestId}:${contact.id}:${PHONE_ID}`);
    const guardId = `${guardHash.slice(0, 8)}-${guardHash.slice(8, 12)}-8${guardHash.slice(13, 16)}-a${guardHash.slice(17, 20)}-${guardHash.slice(20, 32)}`;
    // Different UUIDs/operators still represent one draft when the text and
    // inbound proof match. Keep that fingerprint after release as well.
    const draftHash = await digest(JSON.stringify({ requestId, contactId: contact.id, to, text, phoneId: PHONE_ID, proofId: inbound.id }));
    const guardMetadata = { state: "locked", idempotency_key: key, operation_hash: hash, draft_hash: draftHash, proof_message_id: inbound.id };
    const { error: guardInsertError } = await admin.from("watermelon_messages").insert({
      id: guardId, request_id: requestId, contact_id: contact.id,
      direction: "outbound", channel: "whatsapp", phone_number_id: PHONE_ID,
      from_phone: BUSINESS, to_phone: to, wa_id: to, message_type: "text",
      status: "failed", source: GUARD_SOURCE, is_private: true, text_body: null,
      whatsapp_message_id: null, raw_payload: { manual_guard: guardMetadata },
    });
    if (guardInsertError) {
      if (guardInsertError.code !== "23505") return result(req, 503, "MANUAL_REPLY_GUARD_UNAVAILABLE", { retry_allowed: false });
      const { data: guard, error: guardReadError } = await admin.from("watermelon_messages")
        .select("id,raw_payload").eq("id", guardId).eq("request_id", requestId).eq("contact_id", contact.id)
        .eq("phone_number_id", PHONE_ID).eq("source", GUARD_SOURCE).eq("is_private", true).maybeSingle();
      const previousGuard = guard?.raw_payload?.manual_guard;
      if (guardReadError) return result(req, 503, "MANUAL_REPLY_GUARD_UNAVAILABLE", { retry_allowed: false });
      if (previousGuard?.state !== "released" || typeof previousGuard.idempotency_key !== "string" || previousGuard.idempotency_key === key)
        return result(req, 409, "MANUAL_REPLY_BLOCKED_BY_EXISTING_ATTEMPT", { retry_allowed: false });
      if (previousGuard.draft_hash === draftHash && previousGuard.outcome === "submitted") {
        const { data: submitted, error: submittedError } = await admin.from("watermelon_messages")
          .select("whatsapp_message_id").eq("id", previousGuard.idempotency_key).eq("request_id", requestId)
          .eq("contact_id", contact.id).eq("phone_number_id", PHONE_ID).eq("source", SOURCE).eq("is_private", false)
          .eq("direction", "outbound").eq("channel", "whatsapp").eq("from_phone", BUSINESS).eq("to_phone", to)
          .eq("text_body", text).eq("raw_payload->manual_reply->>state", "submitted")
          .eq("raw_payload->manual_reply->>proof_message_id", inbound.id).maybeSingle();
        if (!submittedError && /^wamid\.[A-Za-z0-9._~+/=-]+$/.test(submitted?.whatsapp_message_id || ""))
          return result(req, 200, "ALREADY_SUBMITTED", { mode: "text", deduplicated: true,
            whatsapp_message_id: submitted.whatsapp_message_id, delivery_verified: false });
        return result(req, 409, "MANUAL_REPLY_BLOCKED_BY_EXISTING_ATTEMPT", { retry_allowed: false });
      }
      const { data: acquired, error: acquireError } = await admin.from("watermelon_messages").update({
        raw_payload: { manual_guard: guardMetadata },
      }).eq("id", guardId).eq("source", GUARD_SOURCE).eq("is_private", true).eq("phone_number_id", PHONE_ID)
        .eq("raw_payload->manual_guard->>state", "released")
        .eq("raw_payload->manual_guard->>idempotency_key", previousGuard.idempotency_key)
        .select("id").maybeSingle();
      if (acquireError) return result(req, 503, "MANUAL_REPLY_GUARD_UNAVAILABLE", { retry_allowed: false });
      if (!acquired) return result(req, 409, "MANUAL_REPLY_BLOCKED_BY_EXISTING_ATTEMPT", { retry_allowed: false });
    }
    async function setGuardState(state: "released" | "unknown", outcome?: "submitted" | "rejected") {
      try {
        const { data, error } = await admin.from("watermelon_messages").update({
          raw_payload: { manual_guard: { ...guardMetadata, state, ...(outcome ? { outcome } : {}) } },
        }).eq("id", guardId).eq("source", GUARD_SOURCE).eq("is_private", true).eq("phone_number_id", PHONE_ID)
          .eq("raw_payload->manual_guard->>idempotency_key", key)
          .eq("raw_payload->manual_guard->>operation_hash", hash).eq("raw_payload->manual_guard->>state", "locked")
          .select("id").maybeSingle();
        return !error && Boolean(data);
      } catch { return false; } // A failed release keeps the conversation blocked.
    }
    const claimMetadata = { version: 1, state: "pending", actor_id: actorId, operation_hash: hash, proof_message_id: inbound.id };
    const { error: claimError } = await admin.from("watermelon_messages").insert({
      id: key, request_id: requestId, contact_id: contact.id, direction: "outbound", channel: "whatsapp",
      phone_number_id: PHONE_ID, wa_id: to, from_phone: BUSINESS, to_phone: to, message_type: "text",
      text_body: text, status: "failed", source: SOURCE, is_private: false,
      // Existing status constraint has no pending/unknown: clients must use this explicit state.
      raw_payload: { manual_reply: claimMetadata }, whatsapp_message_id: null,
    });
    if (claimError) {
      if (claimError.code === "23505") return await existingClaim() || result(req, 409, "IDEMPOTENCY_KEY_REUSED");
      return result(req, 503, "DURABLE_CLAIM_FAILED");
    }

    async function finalize(state: string, patch: Record<string, unknown> = {}, diagnostic: Record<string, number> = {}) {
      const { data, error } = await admin.from("watermelon_messages").update({
        ...patch, raw_payload: { manual_reply: { ...claimMetadata, state, ...diagnostic } },
      }).eq("id", key).eq("source", SOURCE).eq("is_private", false).eq("phone_number_id", PHONE_ID)
        .eq("raw_payload->manual_reply->>operation_hash", hash).eq("raw_payload->manual_reply->>state", "pending")
        .select("id").maybeSingle();
      return !error && Boolean(data);
    }
    async function uncertain() {
      try { await finalize("unknown"); } catch { /* The durable pending claim still blocks replay. */ }
      await setGuardState("unknown");
      return result(req, 409, "MANUAL_REPLY_UNCERTAIN", { retry_allowed: false,
        message: "A Meta pode ter recebido a mensagem. Verifica a conversa antes de qualquer nova tentativa." });
    }
    // Acquiring the claim can yield to another request. Honour privacy/recipient
    // changes made during that write before transmitting anything to Meta.
    const [freshRequest, freshContact, freshProof, freshConfig] = await Promise.all([
      admin.from("watermelon_requests").select("id,contact_id,is_private").eq("id", requestId).maybeSingle(),
      admin.from("watermelon_contacts").select("id,phone,phone_digits,is_private").eq("id", contact.id).maybeSingle(),
      admin.from("watermelon_messages")
        .select("id,whatsapp_timestamp,is_private").eq("id", inbound.id).eq("whatsapp_message_id", inbound.whatsapp_message_id)
        .eq("request_id", requestId).eq("contact_id", contact.id).eq("phone_number_id", PHONE_ID)
        .eq("channel", "whatsapp").eq("direction", "inbound").eq("is_private", false)
        .eq("source", "cloud_api").eq("status", "received").eq("from_phone", to).eq("to_phone", BUSINESS).eq("wa_id", to).maybeSingle(),
      admin.rpc("watermelon_whatsapp_server_config"),
    ]);
    const freshTime = new Date(freshProof.data?.whatsapp_timestamp || "").getTime();
    const freshNow = Date.now();
    if (freshRequest.error || freshContact.error || freshProof.error || freshConfig.error ||
      freshRequest.data?.is_private !== false || freshRequest.data?.contact_id !== contact.id ||
      freshContact.data?.is_private !== false || internationalPhone(freshContact.data?.phone, freshContact.data?.phone_digits) !== to ||
      freshProof.data?.is_private !== false || !Number.isFinite(freshTime) || freshTime > freshNow || freshTime <= freshNow - 24 * 60 * 60 * 1000 ||
      digits(freshConfig.data?.business_phone) !== BUSINESS || freshConfig.data?.phone_number_id !== PHONE_ID ||
      freshConfig.data?.waba_id !== WABA_ID || !freshConfig.data?.access_token) {
      const cancelled = await finalize("rejected");
      if (!cancelled) return await uncertain();
      await setGuardState("released", "rejected");
      return result(req, 409, "MANUAL_REPLY_ASSOCIATION_CHANGED", { retry_allowed: false });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response: Response;
    let meta: any;
    try {
      response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_ID}/messages`, {
        method: "POST", signal: controller.signal, redirect: "error",
        headers: { Authorization: "Bearer " + String(freshConfig.data.access_token), "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text",
          text: { preview_url: false, body: text } }),
      });
      meta = await response.json();
    } catch { return await uncertain(); }
    finally { clearTimeout(timeout); }
    if (response.status >= 500) return await uncertain();
    if (!response.ok) {
      if (!meta?.error || typeof meta.error.code !== "number" || !Number.isFinite(meta.error.code)) return await uncertain();
      const diagnostic: Record<string, number> = { meta_code: meta.error.code };
      if (typeof meta.error.error_subcode === "number" && Number.isFinite(meta.error.error_subcode)) diagnostic.meta_subcode = meta.error.error_subcode;
      const saved = await finalize("rejected", { failed_at: new Date().toISOString() }, diagnostic);
      await setGuardState(saved ? "released" : "unknown", saved ? "rejected" : undefined);
      return result(req, saved ? 409 : 503, saved ? "META_REPLY_REJECTED" : "MANUAL_REPLY_UNCERTAIN", { retry_allowed: false, ...diagnostic });
    }
    const wamid = typeof meta?.messages?.[0]?.id === "string" ? meta.messages[0].id : "";
    if (!/^wamid\.[A-Za-z0-9._~+/=-]+$/.test(wamid) || wamid.length > 512) return await uncertain();
    let saved = false;
    try { saved = await finalize("submitted", { status: "sent", whatsapp_message_id: wamid, whatsapp_timestamp: new Date().toISOString() }); }
    catch { /* The claim remains pending and blocks replay if persistence is unavailable. */ }
    if (!saved) return await uncertain();
    const released = await setGuardState("released", "submitted");
    return result(req, 200, "MANUAL_REPLY_SUBMITTED", { mode: "text", whatsapp_message_id: wamid, delivery_verified: false, new_attempts_blocked: !released });
  } catch {
    // Never return or log transport errors, credentials, request contents, or raw Meta payloads.
    return result(req, 503, "MANUAL_REPLY_FAILED", { retry_allowed: false });
  }
});

