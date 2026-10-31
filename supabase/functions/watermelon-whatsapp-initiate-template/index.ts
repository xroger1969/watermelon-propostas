import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";

const BUSINESS = "351965637736";
const PHONE_ID = "1423415737522090";
const WABA_ID = "4408982439363483";
const SOURCE = "crm_whatsapp_manual_template";
const GUARD_SOURCE = "crm_cloud_api_manual_guard";
const GRAPH = "https://graph.facebook.com/v25.0";
const ORIGINS = new Set(["https://watermelonexperiences.pt", "https://www.watermelonexperiences.pt"]);
const ACTIVE = new Set(["new", "in_review", "in_progress", "proposal_sent", "awaiting_customer", "customer_replied"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ATTEMPT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WAMID = /^wamid\.[A-Za-z0-9._~+/=-]+$/;
const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
type Template = { id: string; name: string; language: string; body: string; status: "APPROVED"; category: "UTILITY" };
class Problem extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
function headers(req: Request) {
  const origin = req.headers.get("origin") || "";
  return { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin",
    "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "https://www.watermelonexperiences.pt",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
}
function respond(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: status === 200, ...body }), { status, headers: headers(req) });
}
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
async function hash(value: unknown) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))));
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, "0")).join("");
}
async function rawHash(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, "0")).join("");
}
async function metaFetch(path: string, token: string, body?: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(GRAPH + path, { method: body ? "POST" : "GET", redirect: "error", signal: controller.signal,
      headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { response, data: await response.json() };
  } finally { clearTimeout(timeout); }
}
async function catalogue(token: string): Promise<Template[]> {
  let loaded;
  try { loaded = await metaFetch(`/${WABA_ID}/message_templates?fields=id,name,status,category,language,components&limit=100`, token); }
  catch { throw new Problem("TEMPLATE_CATALOG_UNAVAILABLE", 503); }
  if (!loaded.response.ok || !Array.isArray(loaded.data?.data)) throw new Problem("TEMPLATE_CATALOG_UNAVAILABLE", 503);
  return loaded.data.data.flatMap((item: any) => {
    const components = item?.components;
    const body = Array.isArray(components) && components.length === 1 && components[0]?.type === "BODY" ? components[0].text : null;
    if (item?.status !== "APPROVED" || item?.category !== "UTILITY" || typeof item.id !== "string" || !item.id ||
      typeof item.name !== "string" || !/^[a-z0-9_]{1,512}$/.test(item.name) ||
      typeof item.language !== "string" || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(item.language) ||
      typeof body !== "string" || !body.trim() || body.length > 4000 || /\{\{|\}\}/.test(body)) return [];
    return [{ id: item.id, name: item.name, language: item.language, body, status: "APPROVED", category: "UTILITY" }];
  });
}

Deno.serve(async (req: Request) => {
  if (req.headers.has("origin") && !ORIGINS.has(req.headers.get("origin") || "")) return respond(req, 403, { code: "ORIGIN_NOT_ALLOWED" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(req) });
  if (!["GET", "POST"].includes(req.method)) return respond(req, 405, { code: "METHOD_NOT_ALLOWED" });
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return respond(req, 401, { code: "AUTH_REQUIRED" });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !anon || !service) return respond(req, 503, { code: "SERVER_NOT_CONFIGURED" });
  let uncertainResult: (() => Promise<Response>) | undefined;
  try {
    const user = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
    const { data: identity, error: authError } = await user.auth.getUser(authorization.slice(7));
    if (authError || !identity?.user?.id) throw new Problem("AUTH_REQUIRED", 401);
    const { error: adminError } = await user.rpc("watermelon_whatsapp_admin_status");
    if (adminError) throw new Problem("ADMIN_REQUIRED", 403);
    const actor = String(identity.user.id);
    let input: any = null;
    let requestId = new URL(req.url).searchParams.get("request_id") || "";
    if (req.method === "POST") {
      try {
        if (Number(req.headers.get("content-length") || 0) > 5000) throw new Error();
        const raw = await req.text();
        if (raw.length > 5000) throw new Error();
        input = JSON.parse(raw);
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 5 ||
          Object.keys(input).some(key => !["request_id", "template_name", "language", "client_attempt_id", "consent_confirmed"].includes(key)) ||
          typeof input.request_id !== "string" || typeof input.template_name !== "string" || !/^[a-z0-9_]{1,512}$/.test(input.template_name) ||
          typeof input.language !== "string" || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(input.language) ||
          typeof input.client_attempt_id !== "string" || !ATTEMPT_UUID.test(input.client_attempt_id)) throw new Error();
      } catch { throw new Problem("INVALID_TEMPLATE_REQUEST", 400); }
      if (input.consent_confirmed !== true) throw new Problem("CONSENT_CONFIRMATION_REQUIRED", 400);
      requestId = input.request_id;
    }
    if (!UUID.test(requestId)) throw new Problem("INVALID_REQUEST_ID", 400);
    requestId = requestId.toLowerCase();
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    async function config() {
      const { data, error } = await admin.rpc("watermelon_whatsapp_server_config");
      if (error || digits(data?.business_phone) !== BUSINESS || data?.phone_number_id !== PHONE_ID || data?.waba_id !== WABA_ID || !data?.access_token)
        throw new Problem("DEDICATED_ACCOUNT_REQUIRED");
      return data;
    }
    async function context() {
      const { data: request, error: rError } = await admin.from("watermelon_requests").select("id,contact_id,reference,source,status,is_private,updated_at").eq("id", requestId).maybeSingle();
      if (rError) throw new Problem("CRM_LOOKUP_FAILED", 503);
      if (!request || request.is_private !== false || !request.contact_id) throw new Problem("PUBLIC_BUSINESS_REQUEST_REQUIRED", 403);
      const { data: contact, error: cError } = await admin.from("watermelon_contacts").select("id,name,phone,phone_digits,is_private").eq("id", request.contact_id).maybeSingle();
      if (cError) throw new Problem("CRM_LOOKUP_FAILED", 503);
      if (!contact || contact.id !== request.contact_id || contact.is_private !== false) throw new Problem("PUBLIC_BUSINESS_CONTACT_REQUIRED", 403);
      const to = internationalPhone(contact.phone, contact.phone_digits);
      if (!to || to === BUSINESS) throw new Problem("INVALID_INTERNATIONAL_CUSTOMER_PHONE");
      return { request, contact, to };
    }
    async function inbound(ctx: any) {
      const { data, error } = await admin.from("watermelon_messages").select("id,whatsapp_message_id")
        .eq("request_id", requestId).eq("contact_id", ctx.contact.id).eq("phone_number_id", PHONE_ID)
        .eq("direction", "inbound").eq("channel", "whatsapp").eq("source", "cloud_api").eq("status", "received")
        .eq("is_private", false).eq("from_phone", ctx.to).eq("to_phone", BUSINESS).eq("wa_id", ctx.to).limit(1).maybeSingle();
      if (error) throw new Problem("CRM_LOOKUP_FAILED", 503);
      return Boolean(data?.whatsapp_message_id);
    }
    const current = await config();
    const ctx = await context();
    const eligibility = ctx.request.source !== "ai_concierge" ? "AI_WEB_REQUEST_REQUIRED" : !ACTIVE.has(ctx.request.status) ? "REQUEST_NOT_ACTIVE" : await inbound(ctx) ? "USE_REPLY_ENDPOINT" : "ELIGIBLE";
    if (req.method === "GET") return respond(req, 200, { eligible: eligibility === "ELIGIBLE", eligibility_code: eligibility,
      requires_consent_confirmation: true, request_id: requestId, recipient: { name: String(ctx.contact.name || ""), phone: "+" + ctx.to }, templates: await catalogue(String(current.access_token)) });
    const key = input.client_attempt_id.toLowerCase();
    async function existing() {
      const { data, error } = await admin.from("watermelon_messages").select("request_id,contact_id,from_phone,to_phone,phone_number_id,whatsapp_message_id,raw_payload")
        .eq("id", key).eq("source", SOURCE).eq("is_private", false).eq("direction", "outbound").eq("channel", "whatsapp").maybeSingle();
      if (error) throw new Problem("CLAIM_LOOKUP_FAILED", 503);
      if (!data) return null;
      const m = data.raw_payload?.manual_template;
      if (data.request_id !== requestId || data.contact_id !== ctx.contact.id || data.from_phone !== BUSINESS || data.to_phone !== ctx.to || data.phone_number_id !== PHONE_ID ||
        m?.actor_id !== actor || m?.template_name !== input.template_name || m?.language !== input.language) throw new Problem("IDEMPOTENCY_KEY_REUSED");
      if (m.state === "submitted" && WAMID.test(data.whatsapp_message_id || "")) return submitted(data.whatsapp_message_id, true);
      return respond(req, 409, { code: m.state === "rejected" ? "PREVIOUS_TEMPLATE_REJECTED" : "TEMPLATE_SEND_UNCERTAIN", state: m.state, retry_allowed: false });
    }
    function submitted(wamid: string, deduplicated = false, extra: Record<string, unknown> = {}) {
      return respond(req, 200, { code: deduplicated ? "ALREADY_SUBMITTED" : "TEMPLATE_SUBMITTED", state: "submitted", mode: "template", queued: false,
        delivery_verified: false, whatsapp_message_id: wamid, deduplicated, ...extra });
    }
    const replay = await existing();
    if (replay) return replay;
    if (eligibility !== "ELIGIBLE") throw new Problem(eligibility);
    async function previousTemplate() {
      const { data, error } = await admin.from("watermelon_messages").select("whatsapp_message_id")
        .eq("request_id", requestId).eq("contact_id", ctx.contact.id).eq("phone_number_id", PHONE_ID).eq("from_phone", BUSINESS).eq("to_phone", ctx.to)
        .eq("source", SOURCE).eq("is_private", false).eq("direction", "outbound").eq("channel", "whatsapp")
        .eq("raw_payload->manual_template->>state", "submitted").in("status", ["sent", "delivered", "read"])
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Problem("CLAIM_LOOKUP_FAILED", 503);
      return WAMID.test(data?.whatsapp_message_id || "") ? data.whatsapp_message_id : null;
    }
    const already = await previousTemplate();
    if (already) return submitted(already, true);
    const templates = await catalogue(String(current.access_token));
    const selected = templates.find(item => item.name === input.template_name && item.language === input.language);
    if (!selected) throw new Problem("TEMPLATE_NOT_APPROVED_OR_SUPPORTED");
    const operationHash = await hash({ type: "template_initiation", requestId, contactId: ctx.contact.id, to: ctx.to, actor,
      templateId: selected.id, templateName: selected.name, language: selected.language, body: selected.body });
    // Same PK/protocol as free-text replies: unknown in either path blocks both.
    const gh = await rawHash(`manual-reply-guard:${requestId}:${ctx.contact.id}:${PHONE_ID}`);
    const guardId = `${gh.slice(0, 8)}-${gh.slice(8, 12)}-8${gh.slice(13, 16)}-a${gh.slice(17, 20)}-${gh.slice(20, 32)}`;
    const guardMeta = { state: "locked", idempotency_key: key, operation_hash: operationHash, operation_type: "template_initiation" };
    const { error: gInsert } = await admin.from("watermelon_messages").insert({ id: guardId, request_id: requestId, contact_id: ctx.contact.id,
      direction: "outbound", channel: "whatsapp", phone_number_id: PHONE_ID, from_phone: BUSINESS, to_phone: ctx.to, wa_id: ctx.to,
      message_type: "text", status: "failed", source: GUARD_SOURCE, is_private: true, text_body: null, whatsapp_message_id: null, raw_payload: { manual_guard: guardMeta } });
    if (gInsert) {
      if (gInsert.code !== "23505") throw new Problem("TEMPLATE_GUARD_UNAVAILABLE", 503);
      const { data: guard, error } = await admin.from("watermelon_messages").select("raw_payload").eq("id", guardId).eq("request_id", requestId)
        .eq("contact_id", ctx.contact.id).eq("phone_number_id", PHONE_ID).eq("source", GUARD_SOURCE).eq("is_private", true).maybeSingle();
      if (error) throw new Problem("TEMPLATE_GUARD_UNAVAILABLE", 503);
      const old = guard?.raw_payload?.manual_guard;
      if (old?.state !== "released" || typeof old.idempotency_key !== "string" || old.idempotency_key === key) throw new Problem("TEMPLATE_BLOCKED_BY_EXISTING_ATTEMPT");
      const sentWhileWaiting = await previousTemplate();
      if (sentWhileWaiting) return submitted(sentWhileWaiting, true);
      const { data: acquired, error: casError } = await admin.from("watermelon_messages").update({ raw_payload: { manual_guard: guardMeta } })
        .eq("id", guardId).eq("source", GUARD_SOURCE).eq("is_private", true).eq("phone_number_id", PHONE_ID)
        .eq("raw_payload->manual_guard->>state", "released").eq("raw_payload->manual_guard->>idempotency_key", old.idempotency_key).select("id").maybeSingle();
      if (casError) throw new Problem("TEMPLATE_GUARD_UNAVAILABLE", 503);
      if (!acquired) throw new Problem("TEMPLATE_BLOCKED_BY_EXISTING_ATTEMPT");
    }
    async function setGuard(state: "released" | "unknown", outcome?: string) {
      try {
        const { data, error } = await admin.from("watermelon_messages").update({ raw_payload: { manual_guard: { ...guardMeta, state, ...(outcome ? { outcome } : {}) } } })
          .eq("id", guardId).eq("source", GUARD_SOURCE).eq("is_private", true).eq("phone_number_id", PHONE_ID)
          .eq("raw_payload->manual_guard->>state", "locked").eq("raw_payload->manual_guard->>idempotency_key", key)
          .eq("raw_payload->manual_guard->>operation_hash", operationHash).select("id").maybeSingle();
        return !error && Boolean(data);
      } catch { return false; }
    }
    const metadata = { version: 1, state: "pending", actor_id: actor, operation_hash: operationHash,
      template_id: selected.id, template_name: selected.name, language: selected.language,
      consent: { confirmed: true, method: "operator_confirmation", confirmed_at: new Date().toISOString(), actor_id: actor } };
    const { error: claimError } = await admin.from("watermelon_messages").insert({ id: key, request_id: requestId, contact_id: ctx.contact.id,
      direction: "outbound", channel: "whatsapp", phone_number_id: PHONE_ID, from_phone: BUSINESS, to_phone: ctx.to, wa_id: ctx.to,
      message_type: "template", text_body: selected.body, status: "failed", is_private: false, source: SOURCE,
      whatsapp_message_id: null, raw_payload: { manual_template: metadata } });
    if (claimError) {
      if (claimError.code === "23505") return await existing() || respond(req, 409, { code: "IDEMPOTENCY_KEY_REUSED", retry_allowed: false });
      throw new Problem("DURABLE_CLAIM_FAILED", 503);
    }
    async function finish(state: string, patch: Record<string, unknown> = {}, diagnostics: Record<string, number> = {}) {
      const { data, error } = await admin.from("watermelon_messages").update({ ...patch, raw_payload: { manual_template: { ...metadata, state, ...diagnostics } } })
        .eq("id", key).eq("source", SOURCE).eq("is_private", false).eq("phone_number_id", PHONE_ID)
        .eq("raw_payload->manual_template->>state", "pending").eq("raw_payload->manual_template->>operation_hash", operationHash).select("id").maybeSingle();
      return !error && Boolean(data);
    }
    uncertainResult = async () => {
      try { await finish("unknown"); } catch { /* Pending remains a durable block. */ }
      await setGuard("unknown");
      return respond(req, 409, { code: "TEMPLATE_SEND_UNCERTAIN", state: "unknown", retry_allowed: false });
    };
    // Never send based on a catalogue preview or stale contact/consent decision.
    const freshConfig = await config();
    const fresh = await context();
    const refreshed = (await catalogue(String(freshConfig.access_token))).find(item => item.id === selected.id && item.name === selected.name && item.language === selected.language && item.body === selected.body);
    if (fresh.to !== ctx.to || fresh.contact.id !== ctx.contact.id || fresh.request.source !== "ai_concierge" || !ACTIVE.has(fresh.request.status) || !refreshed || await inbound(fresh)) {
      const saved = await finish("rejected");
      if (!saved) return await uncertainResult();
      await setGuard("released", "rejected");
      return respond(req, 409, { code: "TEMPLATE_ASSOCIATION_OR_APPROVAL_CHANGED", state: "rejected", retry_allowed: false });
    }
    let sent;
    try { sent = await metaFetch(`/${PHONE_ID}/messages`, String(freshConfig.access_token), {
      messaging_product: "whatsapp", recipient_type: "individual", to: ctx.to, type: "template",
      template: { name: selected.name, language: { code: selected.language } },
    }); } catch { return await uncertainResult(); }
    if (sent.response.status >= 500) return await uncertainResult();
    if (!sent.response.ok) {
      if (typeof sent.data?.error?.code !== "number" || !Number.isFinite(sent.data.error.code)) return await uncertainResult();
      const diagnostics: Record<string, number> = { meta_code: sent.data.error.code };
      if (typeof sent.data.error.error_subcode === "number" && Number.isFinite(sent.data.error.error_subcode)) diagnostics.meta_subcode = sent.data.error.error_subcode;
      const saved = await finish("rejected", { failed_at: new Date().toISOString() }, diagnostics);
      await setGuard(saved ? "released" : "unknown", saved ? "rejected" : undefined);
      return respond(req, 409, { code: saved ? "META_TEMPLATE_REJECTED" : "TEMPLATE_SEND_UNCERTAIN", state: saved ? "rejected" : "unknown", retry_allowed: false, ...diagnostics });
    }
    const wamid = sent.data?.messages?.[0]?.id;
    if (typeof wamid !== "string" || !WAMID.test(wamid) || wamid.length > 512) return await uncertainResult();
    if (!(await finish("submitted", { status: "sent", whatsapp_message_id: wamid, whatsapp_timestamp: new Date().toISOString() }))) return await uncertainResult();
    const released = await setGuard("released", "submitted");
    let associationPending = true;
    try {
      if (typeof fresh.request.updated_at === "string") {
        const { data, error } = await admin.from("watermelon_requests").update({ status: "awaiting_customer", last_contact_at: new Date().toISOString() })
          .eq("id", requestId).eq("contact_id", ctx.contact.id).eq("is_private", false).eq("status", fresh.request.status)
          .eq("updated_at", fresh.request.updated_at).select("id").maybeSingle();
        associationPending = Boolean(error || !data);
      }
    } catch { /* The recorded outbound remains sufficient routing provenance. */ }
    return submitted(wamid, false, { request_association_pending: associationPending, new_attempts_blocked: !released });
  } catch (error) {
    if (uncertainResult) return await uncertainResult();
    return respond(req, error instanceof Problem ? error.status : 503, { code: error instanceof Problem ? error.code : "TEMPLATE_INITIATION_FAILED", retry_allowed: false });
  }
});
