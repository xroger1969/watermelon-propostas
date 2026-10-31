import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Owner-requested pause: all CRM outbound messages remain disabled pending Meta verification.
const CRM_OUTBOUND_ENABLED = false;

// General reception is restricted to the validated dedicated endpoint.
// Sending remains manual through a separate authenticated endpoint.
const CRM_INBOUND_ENABLED = true;
const CRM_INBOUND_TEST_ONLY = false;
const INBOUND_TEST_PHRASE = "TESTE WATERMELON 965";
const CONTROLLED_TEST_REPLY_ID = "96563773-6000-8000-a000-000000000001";
const CONTROLLED_TEST_SOURCE = "crm_cloud_api_controlled_test";
const MANUAL_TEMPLATE_SOURCE = "crm_whatsapp_manual_template";

// Graph-validated dedicated account. Never accept the old personal endpoint,
// even if an operator accidentally restores its configuration before activation.
const DEDICATED_BUSINESS_NUMBER = "351965637736";
const DEDICATED_PHONE_ID = "1423415737522090";
const DEDICATED_WABA_ID = "4408982439363483";

function isDedicatedConfig(config: { business_phone?: string | null; phone_number_id?: string | null; waba_id?: string | null }) {
  return normalizePhone(config.business_phone) === DEDICATED_BUSINESS_NUMBER &&
    config.phone_number_id === DEDICATED_PHONE_ID && config.waba_id === DEDICATED_WABA_ID;
}

function normalizePhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("00") ? digits.slice(2) : digits;
}

function normalizeContactPhone(value: unknown) {
  const raw = String(value || "").trim();
  const digits = normalizePhone(value);
  return !raw.startsWith("+") && !raw.startsWith("00") && /^9\d{8}$/.test(digits) ? "351" + digits : digits;
}

function contactPhoneVariants(value: string) {
  const canonical = normalizePhone(value);
  return /^3519\d{8}$/.test(canonical) ? [canonical, "00" + canonical, canonical.slice(3)] : [canonical, "00" + canonical];
}

function submittedManualTemplate(message: any) {
  const metadata = message?.raw_payload?.manual_template;
  return metadata?.state === "submitted" && Boolean(metadata.actor_id) && Boolean(metadata.operation_hash) &&
    metadata.consent?.confirmed === true && metadata.consent.actor_id === metadata.actor_id &&
    Number.isFinite(Date.parse(String(metadata.consent.confirmed_at || "")));
}

function messageText(message: any) {
  const type = String(message?.type || "unknown");
  if (type === "text") return String(message?.text?.body || "");
  if (type === "button") return String(message?.button?.text || "[Button]");
  if (type === "interactive") {
    return String(
      message?.interactive?.button_reply?.title ||
      message?.interactive?.list_reply?.title ||
      "[Interactive reply]"
    );
  }
  if (type === "image") return String(message?.image?.caption || "[Image]");
  if (type === "video") return String(message?.video?.caption || "[Video]");
  if (type === "document") return String(message?.document?.caption || message?.document?.filename || "[Document]");
  if (type === "audio") return "[Audio]";
  if (type === "sticker") return "[Sticker]";
  if (type === "location") {
    const lat = message?.location?.latitude;
    const lon = message?.location?.longitude;
    return lat != null && lon != null ? `[Location: ${lat}, ${lon}]` : "[Location]";
  }
  if (type === "contacts") return "[Contact]";
  if (type === "reaction") return String(message?.reaction?.emoji || "[Reaction]");
  return "[" + type + "]";
}

async function getConfig() {
  const { data, error } = await supabase.rpc("watermelon_whatsapp_server_config");
  if (error || !data) throw new Error(error?.message || "WhatsApp configuration is unavailable.");
  return data as {
    verify_token?: string | null;
    app_secret?: string | null;
    access_token?: string | null;
    phone_number_id?: string | null;
    waba_id?: string | null;
    business_phone?: string | null;
    graph_version?: string | null;
  };
}

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function secureEqualHex(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function requestFromContext(contextMessageId: string, contactId: string, phoneNumberId: string) {
  if (!contextMessageId) return null;

  const { data: linkedMessage, error: messageError } = await supabase
    .from("watermelon_messages")
    .select("request_id,source,raw_payload")
    .eq("whatsapp_message_id", contextMessageId)
    .eq("phone_number_id", phoneNumberId)
    .eq("contact_id", contactId)
    .eq("direction", "outbound")
    .eq("channel", "whatsapp")
    .eq("is_private", false)
    .in("source", ["crm_cloud_api_manual", CONTROLLED_TEST_SOURCE, MANUAL_TEMPLATE_SOURCE])
    .in("status", ["sent", "delivered", "read"])
    .limit(1)
    .maybeSingle();

  if (messageError || !linkedMessage?.request_id) return null;
  if (linkedMessage.source === MANUAL_TEMPLATE_SOURCE && !submittedManualTemplate(linkedMessage)) return null;

  const { data: request, error: requestError } = await supabase
    .from("watermelon_requests")
    .select("id,status,reference,contact_id")
    .eq("id", linkedMessage.request_id)
    .eq("contact_id", contactId)
    .eq("is_private", false)
    .not("status", "in", "(declined,cancelled)")
    .maybeSingle();

  if (requestError || !request || request.contact_id !== contactId) return null;

  return {
    id: String(request.id),
    status: String(request.status),
    reference: String(request.reference),
  };
}

async function stableDigest(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function dedicatedContact(customerDigits: string, profileName: string) {
  // Check every matching row: a private duplicate must never be bypassed by
  // creating a fresh public contact with the same phone number.
  const { data: matches, error: lookupError } = await supabase.from("watermelon_contacts")
    .select("id,is_private").in("phone_digits", contactPhoneVariants(customerDigits))
    .order("last_contact_at", { ascending: false });
  if (lookupError) throw lookupError;
  if ((matches || []).some((contact: any) => contact.is_private !== false)) return null;
  if (matches?.length) return String(matches[0].id);

  // A deterministic UUID keeps concurrent retries from creating extra contacts.
  const hash = await stableDigest(DEDICATED_PHONE_ID + ":contact:" + customerDigits);
  const id = hash.slice(0, 8) + "-" + hash.slice(8, 12) + "-8" + hash.slice(13, 16) + "-a" + hash.slice(17, 20) + "-" + hash.slice(20, 32);
  const { error: createError } = await supabase.from("watermelon_contacts").upsert({
    id, name: profileName.trim().slice(0, 120) || "WhatsApp contact",
    phone: "+" + customerDigits, source: "whatsapp", is_private: false,
    last_contact_at: new Date().toISOString(),
  }, { onConflict: "id", ignoreDuplicates: true });
  if (createError) throw createError;
  const { data: contact, error: readError } = await supabase.from("watermelon_contacts")
    .select("id,is_private").eq("id", id).eq("phone_digits", customerDigits).maybeSingle();
  if (readError) throw readError;
  return contact?.is_private === false ? String(contact.id) : null;
}

async function pendingTemplateRequest(customerDigits: string, contacts: Array<{ id: string; is_private?: boolean }>) {
  const { data: candidates, error } = await supabase.from("watermelon_messages")
    .select("id,request_id,contact_id,is_private,from_phone,to_phone,wa_id,status,whatsapp_message_id,created_at,raw_payload")
    .eq("source", MANUAL_TEMPLATE_SOURCE).eq("phone_number_id", DEDICATED_PHONE_ID)
    .eq("direction", "outbound").eq("channel", "whatsapp").eq("wa_id", customerDigits)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(50);
  if (error) throw new Error("Template conversation association requires retry.");
  for (const candidate of candidates || []) {
    if (candidate.is_private !== false) return false;
    if (normalizePhone(candidate.from_phone) !== DEDICATED_BUSINESS_NUMBER ||
      normalizePhone(candidate.to_phone) !== customerDigits) continue;
    if (["pending", "unknown"].includes(String(candidate.raw_payload?.manual_template?.state || "")) && !candidate.whatsapp_message_id)
      throw new Error("Template submission association is not confirmed; retry required.");
    if (!["sent", "delivered", "read"].includes(String(candidate.status)) ||
      !candidate.whatsapp_message_id || !submittedManualTemplate(candidate)) continue;
    const contact = contacts.find(item => String(item.id) === String(candidate.contact_id));
    if (!contact || contact.is_private !== false || !candidate.request_id) return false;
    const { data: request, error: requestError } = await supabase.from("watermelon_requests")
      .select("id,status,reference,contact_id,is_private").eq("id", candidate.request_id).maybeSingle();
    if (requestError) throw new Error("Template request association requires retry.");
    if (!request || request.is_private !== false || request.contact_id !== contact.id) return false;
    if (["confirmed", "completed", "declined", "cancelled", "no_show"].includes(request.status)) continue;
    if (!Number.isFinite(Date.parse(String(candidate.created_at || "")))) return false;
    const { data: reply, error: replyError } = await supabase.from("watermelon_messages")
      .select("id,is_private").eq("request_id", request.id).eq("contact_id", contact.id)
      .eq("phone_number_id", DEDICATED_PHONE_ID).eq("source", "cloud_api")
      .eq("direction", "inbound").eq("channel", "whatsapp").eq("wa_id", customerDigits)
      .gte("created_at", candidate.created_at).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (replyError) throw new Error("Template reply association requires retry.");
    if (reply && reply.is_private !== false) return false;
    // Once the latest template was answered, keep its contact provenance and
    // resume normal recent-message routing. Never jump to an older open quote.
    if (reply) return { contactId: String(contact.id), request: null };
    return { contactId: String(contact.id), request: request as { id: string; status: string; reference: string } };
  }
  return null;
}

async function dedicatedRequest(contactId: string) {
  // An unquoted message can continue only a request proven to belong to this
  // dedicated endpoint; never pick an arbitrary older request for the contact.
  const { data: messages, error: messageError } = await supabase.from("watermelon_messages")
    .select("request_id,is_private,source").eq("contact_id", contactId).eq("phone_number_id", DEDICATED_PHONE_ID)
    .eq("channel", "whatsapp")
    .in("source", ["cloud_api", "crm_cloud_api_manual", CONTROLLED_TEST_SOURCE, MANUAL_TEMPLATE_SOURCE])
    .order("created_at", { ascending: false }).limit(20);
  if (messageError) throw messageError;
  // Read routing metadata only, including privacy flags, so hiding the last
  // message cannot make an existing private thread look like a new enquiry.
  if ((messages || []).some((message: any) => message.is_private !== false)) return null;
  let lastClosedRequestId = "";
  for (const requestId of new Set((messages || []).filter((message: any) => message.source !== MANUAL_TEMPLATE_SOURCE).map((message: any) => message.request_id).filter(Boolean))) {
    const { data: request, error } = await supabase.from("watermelon_requests")
      .select("id,status,reference,contact_id,is_private").eq("id", requestId).maybeSingle();
    if (error) throw error;
    // A hidden/missing linked request must not be bypassed with a public lead.
    if (!request || request.contact_id !== contactId || request.is_private !== false) return null;
    if (!["confirmed", "completed", "declined", "cancelled", "no_show"].includes(request.status)) {
      return request as { id: string; status: string; reference: string };
    }
    if (!lastClosedRequestId) lastClosedRequestId = String(request.id);
  }

  // Share a reference across simultaneous first messages and partial retries.
  // A closed business request advances the conversation to a new generation.
  const reference = "WM-WA-" + (await stableDigest(DEDICATED_PHONE_ID + ":contact:" + contactId + ":after:" + lastClosedRequestId)).slice(0, 20).toUpperCase();
  const { error: createError } = await supabase.from("watermelon_requests").upsert({
    reference, contact_id: contactId, kind: "manual", status: "customer_replied",
    source: "whatsapp", currency: "EUR", is_private: false,
    last_contact_at: new Date().toISOString(),
  }, { onConflict: "reference", ignoreDuplicates: true });
  if (createError) throw createError;
  const { data: request, error: readError } = await supabase.from("watermelon_requests")
    .select("id,status,reference").eq("reference", reference).eq("contact_id", contactId)
    .eq("is_private", false).not("status", "in", "(confirmed,completed,declined,cancelled,no_show)").maybeSingle();
  if (readError) throw readError;
  return request as { id: string; status: string; reference: string } | null;
}


async function sendPendingCRMText(args: {
  config: {
    access_token?: string | null;
    phone_number_id?: string | null;
    graph_version?: string | null;
  };
  requestId: string;
  contactId: string;
  customerDigits: string;
  businessDigits: string;
}) {
  if (!CRM_OUTBOUND_ENABLED) return;

  const { config, requestId, contactId, customerDigits, businessDigits } = args;

  const { data: pendingActivities } = await supabase
    .from("watermelon_activities")
    .select("id,created_at,activity_type,metadata")
    .eq("request_id", requestId)
    .in("activity_type", ["whatsapp_template_sent", "whatsapp_pending_queued"])
    .order("created_at", { ascending: false })
    .limit(20);

  const pending = (pendingActivities || []).find((activity: any) =>
    String(activity?.metadata?.pending_text || "").trim()
  );

  if (!pending) return;

  const { data: completed } = await supabase
    .from("watermelon_activities")
    .select("id,metadata")
    .eq("request_id", requestId)
    .eq("activity_type", "whatsapp_pending_sent")
    .order("created_at", { ascending: false })
    .limit(20);

  const alreadySent = (completed || []).some(
    (activity: any) =>
      String(activity?.metadata?.source_activity_id || "") === String(pending.id)
  );
  if (alreadySent) return;

  const text = String(pending.metadata.pending_text || "").trim().slice(0, 4000);
  if (!text) return;

  const accessToken = String(config.access_token || "");
  const phoneNumberId = String(config.phone_number_id || "");
  const graphVersion = String(config.graph_version || "v23.0");
  if (!accessToken || !phoneNumberId) return;

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: customerDigits,
        type: "text",
        text: { preview_url: true, body: text },
      }),
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    await supabase.from("watermelon_activities").insert({
      request_id: requestId,
      contact_id: contactId,
      activity_type: "whatsapp_pending_send_failed",
      summary: "Pending CRM message could not be sent after customer reply",
      metadata: {
        source_activity_id: pending.id,
        error: data?.error?.message || "Meta rejected the message",
        code: data?.error?.code || null,
      },
    });
    return;
  }

  const whatsappMessageId = String(data?.messages?.[0]?.id || "");
  const now = new Date().toISOString();
  const purpose = String(pending?.metadata?.pending_purpose || "message");

  await supabase.from("watermelon_messages").upsert(
    {
      request_id: requestId,
      contact_id: contactId,
      direction: "outbound",
      channel: "whatsapp",
      whatsapp_message_id: whatsappMessageId || null,
      phone_number_id: phoneNumberId,
      wa_id: customerDigits,
      from_phone: businessDigits || null,
      to_phone: customerDigits,
      message_type: "text",
      text_body: text,
      status: "sent",
      source: "crm_cloud_api_pending",
      whatsapp_timestamp: now,
      raw_payload: data,
    },
    {
      onConflict: "whatsapp_message_id",
      ignoreDuplicates: true,
    }
  );

  await supabase.from("watermelon_activities").insert({
    request_id: requestId,
    contact_id: contactId,
    activity_type: "whatsapp_pending_sent",
    summary:
      purpose === "proposal"
        ? "Proposal sent automatically after customer reply"
        : "Pending CRM message sent automatically after customer reply",
    metadata: {
      source_activity_id: pending.id,
      whatsapp_message_id: whatsappMessageId || null,
      text,
      purpose,
    },
  });

  const statusAfterPending =
    purpose === "proposal"
      ? "proposal_sent"
      : purpose === "payment"
        ? "awaiting_payment"
        : purpose === "acceptance"
          ? "accepted"
          : "awaiting_customer";

  await supabase
    .from("watermelon_requests")
    .update({
      status: statusAfterPending,
      last_contact_at: now,
    })
    .eq("id", requestId);
}

async function processMessage(value: any, message: any) {
  if (CRM_INBOUND_TEST_ONLY && (message?.type !== "text" || message?.text?.body !== INBOUND_TEST_PHRASE)) return;
  const metadataPhoneId = String(value?.metadata?.phone_number_id || "");
  const displayBusinessPhone = normalizePhone(value?.metadata?.display_phone_number);
  const fromDigits = normalizePhone(message?.from);
  const toDigits = normalizePhone(message?.to);
  const config = await getConfig();
  const configuredBusinessPhone = normalizePhone(config.business_phone);
  const businessDigits = configuredBusinessPhone || displayBusinessPhone;

  // Accept only the configured business endpoint, before inspecting CRM contacts.
  if (!isDedicatedConfig(config)) return;
  if (!metadataPhoneId || metadataPhoneId !== String(config.phone_number_id || "")) return;
  if (!configuredBusinessPhone || displayBusinessPhone !== configuredBusinessPhone) return;

  // Accept inbound customer messages only; reject phone-app messages and ambiguous recipients.
  if (!fromDigits || fromDigits === businessDigits) return;
  if (toDigits && toDigits !== businessDigits) return;
  const recipientDigits = normalizePhone(message?.recipient_id);
  if (recipientDigits && recipientDigits !== businessDigits) return;

  // A fresh enquiry is allowed only on the dedicated business endpoint. A quoted
  // message still needs its exact CRM association and never falls back to a lead.
  const contextMessageId = String(message?.context?.id || "");
  if (message?.context && !contextMessageId) return;
  if (!["text", "button", "interactive", "image", "video", "document", "audio", "location"].includes(String(message?.type || ""))) return;

  const customerDigits = fromDigits;

  if (!customerDigits) return;

  const messageId = String(message?.id || "");
  if (!messageId) return;
  if (messageId) {
    const { data: existingMessage, error: existingError } = await supabase
      .from("watermelon_messages")
      .select("id")
      .eq("whatsapp_message_id", messageId)
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existingMessage) return;
  }

  // Match local PT and E.164 without rewriting contact data. A private duplicate
  // blocks the sender; provenance resolves public duplicates deterministically.
  const { data: knownContacts, error: contactError } = await supabase
    .from("watermelon_contacts").select("id,is_private")
    .in("phone_digits",contactPhoneVariants(customerDigits)).order("last_contact_at",{ascending:false});
  if (contactError) throw contactError;
  if ((knownContacts || []).some((contact: any) => contact.is_private !== false)) return;
  let contactId = "";
  let existingRequest: { id: string; status: string; reference: string } | null = null;
  if (contextMessageId) {
    const { data: quoted, error: quotedError } = await supabase.from("watermelon_messages")
      .select("contact_id").eq("whatsapp_message_id", contextMessageId).eq("phone_number_id", DEDICATED_PHONE_ID)
      .eq("channel", "whatsapp").eq("direction", "outbound").eq("is_private", false)
      .eq("wa_id", customerDigits).eq("to_phone", customerDigits)
      .in("source", ["crm_cloud_api_manual", CONTROLLED_TEST_SOURCE, MANUAL_TEMPLATE_SOURCE])
      .in("status", ["sent", "delivered", "read"]).maybeSingle();
    if (quotedError || !quoted || !(knownContacts || []).some((contact: any) => contact.id === quoted.contact_id)) return;
    contactId = String(quoted.contact_id);
    existingRequest = await requestFromContext(contextMessageId, contactId, metadataPhoneId);
  } else {
    const binding = await pendingTemplateRequest(customerDigits, knownContacts || []);
    if (binding === false) return;
    if (binding) { contactId = binding.contactId; existingRequest = binding.request; }
    else if ((knownContacts || []).length > 1) return;
  }
  const profile = Array.isArray(value?.contacts)
    ? value.contacts.find((contact: any) => normalizePhone(contact?.wa_id) === customerDigits)?.profile?.name
    : "";
  if (!contactId && !contextMessageId) contactId = await dedicatedContact(customerDigits, String(profile || "")) || "";
  if (!contactId) return;
  if (!existingRequest && !contextMessageId) existingRequest = await dedicatedRequest(contactId);
  if (!existingRequest) return;
  const crmRequest = existingRequest;
  const timestamp = message?.timestamp
    ? new Date(Number(message.timestamp) * 1000).toISOString()
    : new Date().toISOString();
  const text = messageText(message);

  const { data: insertedMessage, error: insertError } = await supabase
    .from("watermelon_messages")
    .upsert({
      request_id: crmRequest.id,
      contact_id: contactId,
      direction: "inbound",
      channel: "whatsapp",
      whatsapp_message_id: messageId || null,
      whatsapp_context_message_id: message?.context?.id || null,
      phone_number_id: metadataPhoneId || null,
      wa_id: customerDigits,
      from_phone: customerDigits,
      to_phone: businessDigits,
      message_type: String(message?.type || "unknown"),
      text_body: text || null,
      status: "received",
      source: "cloud_api",
      whatsapp_timestamp: timestamp,
      raw_payload: message,
    }, {
      onConflict: "whatsapp_message_id",
      ignoreDuplicates: true,
    }).select("id").maybeSingle();

  if (insertError) throw insertError;
  if (!insertedMessage) return;

  const now = new Date().toISOString();
  {
    const nextStatus = ["new", "in_review", "awaiting_customer", "proposal_sent"].includes(crmRequest.status)
      ? "customer_replied"
      : crmRequest.status;

    await supabase
      .from("watermelon_requests")
      .update({ status: nextStatus, last_contact_at: now })
      .eq("id", crmRequest.id);

    await supabase.from("watermelon_activities").insert({
      request_id: crmRequest.id,
      contact_id: contactId,
      activity_type: "whatsapp_received",
      summary: "WhatsApp message received from customer",
      metadata: {
        whatsapp_message_id: messageId || null,
        message_type: String(message?.type || "unknown"),
        text,
      },
    });

    await sendPendingCRMText({
      config,
      requestId: crmRequest.id,
      contactId,
      customerDigits,
      businessDigits,
    });
  }
}

async function processControlledTestStatuses(value: any) {
  if (String(value?.metadata?.phone_number_id || "") !== DEDICATED_PHONE_ID ||
    normalizePhone(value?.metadata?.display_phone_number) !== DEDICATED_BUSINESS_NUMBER) return;
  for (const status of Array.isArray(value?.statuses) ? value.statuses : []) {
    const messageId = String(status?.id || "");
    const nextStatus = String(status?.status || "");
    if (!messageId || !["sent", "delivered", "read", "failed"].includes(nextStatus)) continue;
    const { data: tracked, error } = await supabase.from("watermelon_messages")
      .select("id,request_id,contact_id,to_phone,status")
      .eq("id", CONTROLLED_TEST_REPLY_ID).eq("source", CONTROLLED_TEST_SOURCE)
      .eq("phone_number_id", DEDICATED_PHONE_ID).eq("whatsapp_message_id", messageId)
      .eq("channel", "whatsapp").eq("direction", "outbound").eq("is_private", false).maybeSingle();
    if (error) throw new Error("Controlled test receipt lookup requires retry.");
    if (!tracked) {
      // A receipt can beat the sender's WAMID update. Do not guess its identity
      // or acknowledge it permanently while the single claim is uncorrelated.
      const { data: pending, error: pendingError } = await supabase.from("watermelon_messages")
        .select("whatsapp_message_id,to_phone,raw_payload").eq("id", CONTROLLED_TEST_REPLY_ID)
        .eq("source", CONTROLLED_TEST_SOURCE).eq("phone_number_id", DEDICATED_PHONE_ID)
        .eq("direction", "outbound").eq("is_private", false).maybeSingle();
      if (pendingError || (pending && !pending.whatsapp_message_id &&
        ["pending", "unknown"].includes(String(pending.raw_payload?.controlled_test_state || "")) &&
        normalizePhone(status?.recipient_id) === normalizePhone(pending.to_phone))) {
        throw new Error("Controlled test receipt awaiting message correlation; retry required.");
      }
      continue;
    }
    if (!tracked.request_id || !tracked.contact_id ||
      normalizePhone(status?.recipient_id) !== normalizePhone(tracked.to_phone)) continue;
    const [{ data: contact, error: contactError }, { data: request, error: requestError }] = await Promise.all([
      supabase.from("watermelon_contacts").select("id,phone,phone_digits").eq("id", tracked.contact_id).eq("is_private", false).maybeSingle(),
      supabase.from("watermelon_requests").select("id").eq("id", tracked.request_id)
        .eq("contact_id", tracked.contact_id).eq("is_private", false).maybeSingle(),
    ]);
    if (contactError || requestError || !contact || !request ||
      normalizeContactPhone(contact.phone || contact.phone_digits) !== normalizePhone(tracked.to_phone)) continue;
    const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
    if ((rank[nextStatus] && rank[tracked.status] > rank[nextStatus]) ||
      (nextStatus === "failed" && ["delivered", "read"].includes(tracked.status))) continue;
    const at = Number(status.timestamp) * 1000;
    if (!Number.isFinite(at) || at <= 0) continue;
    const patch: Record<string, unknown> = {
      status: nextStatus, raw_payload: { controlled_test_state: "receipt", receipt_status: nextStatus },
    };
    if (nextStatus === "delivered") patch.delivered_at = new Date(at).toISOString();
    if (nextStatus === "read") patch.read_at = new Date(at).toISOString();
    if (nextStatus === "failed") patch.failed_at = new Date(at).toISOString();
    const { data: updated, error: updateError } = await supabase.from("watermelon_messages").update(patch)
      .eq("id", CONTROLLED_TEST_REPLY_ID).eq("source", CONTROLLED_TEST_SOURCE)
      .eq("whatsapp_message_id", messageId).eq("is_private", false).eq("status", tracked.status)
      .select("id").maybeSingle();
    if (updateError || !updated) throw new Error("Concurrent controlled test receipt requires retry.");
  }
}

async function processDeliberateReplyStatuses(value: any, source: "crm_cloud_api_manual" | "crm_whatsapp_manual_template", metadataKey: "manual_reply" | "manual_template") {
  if (String(value?.metadata?.phone_number_id || "") !== DEDICATED_PHONE_ID ||
    normalizePhone(value?.metadata?.display_phone_number) !== DEDICATED_BUSINESS_NUMBER) return;
  for (const status of Array.isArray(value?.statuses) ? value.statuses : []) {
    const messageId = String(status?.id || "");
    const nextStatus = String(status?.status || "");
    const recipient = normalizePhone(status?.recipient_id);
    if (!messageId || !recipient || !["sent", "delivered", "read", "failed"].includes(nextStatus)) continue;
    const { data: tracked, error } = await supabase.from("watermelon_messages")
      .select("id,request_id,contact_id,to_phone,status,raw_payload")
      .eq("source", source).eq("phone_number_id", DEDICATED_PHONE_ID)
      .eq("whatsapp_message_id", messageId).eq("channel", "whatsapp").eq("direction", "outbound")
      .eq("is_private", false).maybeSingle();
    if (error) throw new Error("Manual reply receipt lookup requires retry.");
    if (!tracked) {
      const { data: candidates, error: candidateError } = await supabase.from("watermelon_messages")
        .select("whatsapp_message_id,raw_payload").eq("source", source)
        .eq("phone_number_id", DEDICATED_PHONE_ID).eq("to_phone", recipient)
        .eq("direction", "outbound").eq("is_private", false)
        .order("created_at", { ascending: false }).limit(20);
      if (candidateError || (candidates || []).some((message: any) => !message.whatsapp_message_id &&
        ["pending", "unknown"].includes(String(message.raw_payload?.[metadataKey]?.state || "")))) {
        throw new Error("Manual reply receipt awaiting message correlation; retry required.");
      }
      continue;
    }
    const manual = tracked.raw_payload?.[metadataKey];
    if (!tracked.request_id || !tracked.contact_id || recipient !== normalizePhone(tracked.to_phone) ||
      manual?.state !== "submitted" || !manual.operation_hash || !manual.actor_id ||
      (metadataKey === "manual_reply" ? !manual.proof_message_id : !submittedManualTemplate(tracked))) continue;
    const [{ data: contact, error: contactError }, { data: request, error: requestError }] = await Promise.all([
      supabase.from("watermelon_contacts").select("id,phone,phone_digits").eq("id", tracked.contact_id).eq("is_private", false).maybeSingle(),
      supabase.from("watermelon_requests").select("id").eq("id", tracked.request_id)
        .eq("contact_id", tracked.contact_id).eq("is_private", false).maybeSingle(),
    ]);
    if (contactError || requestError) throw new Error("Manual reply receipt association requires retry.");
    if (!contact || !request || normalizeContactPhone(contact.phone || contact.phone_digits) !== recipient) continue;
    const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
    if ((rank[nextStatus] && rank[tracked.status] > rank[nextStatus]) ||
      (nextStatus === "failed" && ["delivered", "read"].includes(tracked.status))) continue;
    const at = Number(status.timestamp) * 1000;
    if (!Number.isFinite(at) || at <= 0) continue;
    const receipt: Record<string, unknown> = { status: nextStatus };
    const code = status?.errors?.[0]?.code;
    if (typeof code === "number" && Number.isFinite(code)) receipt.meta_code = code;
    const patch: Record<string, unknown> = { status: nextStatus,
      raw_payload: { ...tracked.raw_payload, [metadataKey]: { ...manual }, [metadataKey === "manual_reply" ? "manual_delivery" : "template_delivery"]: receipt } };
    if (nextStatus === "delivered") patch.delivered_at = new Date(at).toISOString();
    if (nextStatus === "read") patch.read_at = new Date(at).toISOString();
    if (nextStatus === "failed") patch.failed_at = new Date(at).toISOString();
    const { data: updated, error: updateError } = await supabase.from("watermelon_messages").update(patch)
      .eq("id", tracked.id).eq("source", source).eq("whatsapp_message_id", messageId)
      .eq("phone_number_id", DEDICATED_PHONE_ID).eq("is_private", false).eq("status", tracked.status)
      .eq("raw_payload->" + metadataKey + "->>operation_hash", manual.operation_hash)
      .eq("raw_payload->" + metadataKey + "->>state", "submitted").select("id").maybeSingle();
    if (updateError || !updated) throw new Error("Concurrent manual reply receipt requires retry.");
  }
}

async function processStatuses(value: any) {
  await processControlledTestStatuses(value);
  if (CRM_INBOUND_TEST_ONLY) return;
  await processDeliberateReplyStatuses(value, "crm_cloud_api_manual", "manual_reply");
  await processDeliberateReplyStatuses(value, MANUAL_TEMPLATE_SOURCE, "manual_template");
}

Deno.serve(async (req: Request) => {
  try {
const config = await getConfig();

    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token && challenge && token === config.verify_token) {
        await supabase.rpc("watermelon_whatsapp_server_touch", {
          p_verified: true,
          p_error: null,
        });
        return new Response(challenge, {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }

      return new Response("Forbidden", { status: 403 });
    }

    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const rawBody = await req.text();
    const signatureHeader = req.headers.get("x-hub-signature-256") || "";
    const appSecret = String(config.app_secret || "");

    if (!appSecret) {
      await supabase.rpc("watermelon_whatsapp_server_touch", {
        p_verified: false,
        p_error: "Meta App Secret is not configured.",
      });
      return new Response("Webhook is not configured.", { status: 503 });
    }

    const expected = "sha256=" + await hmacHex(appSecret, rawBody);
    if (!signatureHeader || !(await secureEqualHex(signatureHeader, expected))) {
      await supabase.rpc("watermelon_whatsapp_server_touch", {
        p_verified: false,
        p_error: "Invalid webhook signature.",
      });
      return new Response("Invalid signature", { status: 401 });
    }

    // Acknowledge signed events without parsing or storing their content during the transition.
    if (!CRM_INBOUND_ENABLED) {
      return new Response("EVENT_RECEIVED", { status: 200 });
    }

    if (!isDedicatedConfig(config)) return new Response("EVENT_RECEIVED", { status: 200 });

    const payload = JSON.parse(rawBody);

    if (payload?.object === "whatsapp_business_account") {
      for (const entry of payload.entry || []) {
        if (!config.waba_id || String(entry?.id || "") !== String(config.waba_id)) continue;
        for (const change of entry?.changes || []) {
          const field = String(change?.field || "");
          const value = change?.value || {};

          if (field === "messages") {
            if (!config.phone_number_id || String(value?.metadata?.phone_number_id || "") !== String(config.phone_number_id)) continue;
            if (!config.business_phone || normalizePhone(value?.metadata?.display_phone_number) !== normalizePhone(config.business_phone)) continue;
            if (Array.isArray(value.messages)) {
              for (const message of value.messages) {
                await processMessage(value, message);
              }
            }
            await processStatuses(value);
            continue;
          }

          // Phone-app echoes, address-book sync and history imports stay outside the CRM.
        }
      }
    }

    await supabase.rpc("watermelon_whatsapp_server_touch", {
      p_verified: false,
      p_error: null,
    });

    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook error";
    try {
      await supabase.rpc("watermelon_whatsapp_server_touch", {
        p_verified: false,
        p_error: message,
      });
    } catch {
      // Ignore logging failure.
    }
    console.error(message);
    return new Response("Webhook error", { status: 500 });
  }
});



