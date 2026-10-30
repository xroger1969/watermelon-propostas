import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Owner-requested pause: all CRM outbound messages remain disabled pending Meta verification.
const CRM_OUTBOUND_ENABLED = false;

function normalizePhone(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function lisbonStamp() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Lisbon",
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return String(parts.year || "") + String(parts.month || "") + String(parts.day || "");
}

function manualReference() {
  return "WM-WA-" + lisbonStamp() + "-" + crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
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

async function getOrCreateContact(phoneDigits: string, profileName?: string | null) {
  const { data: existing } = await supabase
    .from("watermelon_contacts")
    .select("id,name,phone")
    .eq("phone_digits", phoneDigits)
    .order("last_contact_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("watermelon_contacts")
      .update({
        name: profileName?.trim() || existing.name,
        last_contact_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const { data: created, error } = await supabase
    .from("watermelon_contacts")
    .insert({
      name: profileName?.trim() || "WhatsApp contact",
      phone: "+" + phoneDigits,
      source: "whatsapp",
      last_contact_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw error;
  return created.id as string;
}

async function requestFromContext(contextMessageId: string, contactId: string) {
  if (!contextMessageId) return null;

  const { data: linkedMessage } = await supabase
    .from("watermelon_messages")
    .select("request_id")
    .eq("whatsapp_message_id", contextMessageId)
    .limit(1)
    .maybeSingle();

  if (!linkedMessage?.request_id) return null;

  const { data: request } = await supabase
    .from("watermelon_requests")
    .select("id,status,reference,contact_id")
    .eq("id", linkedMessage.request_id)
    .maybeSingle();

  if (!request || request.contact_id !== contactId) return null;
  const { data: visibility } = await supabase.from("watermelon_requests")
    .select("is_private").eq("id",request.id).maybeSingle();
  if (visibility?.is_private) return null;

  return {
    id: String(request.id),
    status: String(request.status),
    reference: String(request.reference),
  };
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

async function getOrCreateActiveRequest(contactId: string, currency = "EUR") {
  const { data: active } = await supabase
    .from("watermelon_requests")
    .select("id,status,reference")
    .eq("contact_id", contactId)
    .not("status", "in", "(confirmed,declined,cancelled)")
    .order("last_contact_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (active) return active as { id: string; status: string; reference: string };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const reference = manualReference();
    const { data: created, error } = await supabase
      .from("watermelon_requests")
      .insert({
        reference,
        contact_id: contactId,
        kind: "manual",
        status: "customer_replied",
        source: "whatsapp",
        currency,
        estimated_total: null,
        last_contact_at: new Date().toISOString(),
      })
      .select("id,status,reference")
      .single();

    if (!error && created) {
      await supabase.from("watermelon_activities").insert({
        request_id: created.id,
        contact_id: contactId,
        activity_type: "whatsapp_lead_created",
        summary: "New WhatsApp conversation created in CRM",
        metadata: { reference },
      });
      return created as { id: string; status: string; reference: string };
    }

    if (!String(error?.message || "").toLowerCase().includes("duplicate")) throw error;
  }

  throw new Error("Unable to create WhatsApp CRM request.");
}

async function processMessage(value: any, message: any) {
  const metadataPhoneId = String(value?.metadata?.phone_number_id || "");
  const displayBusinessPhone = normalizePhone(value?.metadata?.display_phone_number);
  const fromDigits = normalizePhone(message?.from);
  const toDigits = normalizePhone(message?.to);
  const config = await getConfig();
  const configuredBusinessPhone = normalizePhone(config.business_phone);
  const businessDigits = configuredBusinessPhone || displayBusinessPhone;

  const looksOutbound =
    Boolean(businessDigits) &&
    (fromDigits === businessDigits || normalizePhone(message?.recipient_id) === businessDigits);

  const customerDigits = looksOutbound
    ? (toDigits || normalizePhone(message?.recipient_id))
    : fromDigits;

  if (!customerDigits) return;

  const messageId = String(message?.id || "");
  if (messageId) {
    const { data: existingMessage } = await supabase
      .from("watermelon_messages")
      .select("id")
      .eq("whatsapp_message_id", messageId)
      .limit(1)
      .maybeSingle();

    if (existingMessage) return;
  }

  const contactRecord = Array.isArray(value?.contacts)
    ? value.contacts.find((contact: any) => normalizePhone(contact?.wa_id) === customerDigits)
    : null;
  const profileName = contactRecord?.profile?.name || null;

  // Explicit CRM association is required: never ingest unsolicited personal chats.
  const { data: knownContact, error: contactError } = await supabase
    .from("watermelon_contacts").select("id,is_private")
    .eq("phone_digits",customerDigits).order("last_contact_at",{ascending:false})
    .limit(1).maybeSingle();
  if (contactError) throw contactError;
  if (!knownContact || knownContact.is_private) return;
  const contactId = String(knownContact.id);
  const contextMessageId = String(message?.context?.id || "");
  const contextualRequest = !looksOutbound && contextMessageId
    ? await requestFromContext(contextMessageId,contactId) : null;
  const { data: existingRequest,error: requestError } = contextualRequest
    ? { data: contextualRequest, error: null }
    : await supabase.from("watermelon_requests").select("id,status,reference")
      .eq("contact_id",contactId).eq("is_private",false)
      .not("status","in","(declined,cancelled)")
      .order("last_contact_at",{ascending:false}).limit(1).maybeSingle();
  if (requestError) throw requestError;
  if (!existingRequest) return;
  const crmRequest = existingRequest;
  const timestamp = message?.timestamp
    ? new Date(Number(message.timestamp) * 1000).toISOString()
    : new Date().toISOString();
  const direction = looksOutbound ? "outbound" : "inbound";
  const text = messageText(message);

  const { error: insertError } = await supabase
    .from("watermelon_messages")
    .upsert({
      request_id: crmRequest.id,
      contact_id: contactId,
      direction,
      channel: "whatsapp",
      whatsapp_message_id: messageId || null,
      whatsapp_context_message_id: message?.context?.id || null,
      phone_number_id: metadataPhoneId || null,
      wa_id: customerDigits,
      from_phone: looksOutbound ? businessDigits : customerDigits,
      to_phone: looksOutbound ? customerDigits : businessDigits,
      message_type: String(message?.type || "unknown"),
      text_body: text || null,
      status: direction === "outbound" ? "sent" : "received",
      source: looksOutbound ? "whatsapp_business_app" : "cloud_api",
      whatsapp_timestamp: timestamp,
      raw_payload: message,
    }, {
      onConflict: "whatsapp_message_id",
      ignoreDuplicates: true,
    });

  if (insertError) throw insertError;

  const now = new Date().toISOString();
  if (direction === "inbound") {
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
  } else {
    await supabase
      .from("watermelon_requests")
      .update({ last_contact_at: now })
      .eq("id", crmRequest.id);
  }
}

async function processStatuses(value: any) {
  const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
  for (const status of statuses) {
    const messageId = String(status?.id || "");
    if (!messageId) continue;

    const nextStatus = String(status?.status || "");
    const valid = ["sent", "delivered", "read", "failed", "deleted"].includes(nextStatus);
    if (!valid) continue;

    const timestamp = status?.timestamp
      ? new Date(Number(status.timestamp) * 1000).toISOString()
      : new Date().toISOString();

    const patch: Record<string, any> = {
      status: nextStatus,
      raw_payload: status,
    };
    if (nextStatus === "delivered") patch.delivered_at = timestamp;
    if (nextStatus === "read") patch.read_at = timestamp;
    if (nextStatus === "failed") patch.failed_at = timestamp;

    await supabase
      .from("watermelon_messages")
      .update(patch)
      .eq("whatsapp_message_id", messageId);
  }
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

    const payload = JSON.parse(rawBody);

    if (payload?.object === "whatsapp_business_account") {
      for (const entry of payload.entry || []) {
        for (const change of entry?.changes || []) {
          const field = String(change?.field || "");
          const value = change?.value || {};

          if (field === "messages") {
            if (Array.isArray(value.messages)) {
              for (const message of value.messages) {
                await processMessage(value, message);
              }
            }
            await processStatuses(value);
            continue;
          }

          if (field === "smb_message_echoes" || field === "message_echoes") {
            const echoes = Array.isArray(value.message_echoes)
              ? value.message_echoes
              : [];
            for (const message of echoes) {
              await processMessage(value, message);
            }
          }
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
