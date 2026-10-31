"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_BOOKING_URL } from "@/lib/supabase/config";
import { requireWhatsAppDeliveryMode } from "@/lib/whatsapp-delivery";

// Sending and inbound ingestion remain disabled in production until Meta verifies the dedicated number.
const WHATSAPP_CRM_ENABLED = false;
const LEGACY_PERSONAL_PHONE_ID = "874910289048462";

type ThreadItem = {
  id: string;
  created_at: string;
  phone_number_id?: string | null;
  is_private?: boolean;
  direction: "inbound" | "outbound";
  text_body: string | null;
  message_type: string;
  status: "received" | "sent" | "delivered" | "read" | "failed" | "deleted";
  source: string;
  whatsapp_timestamp: string | null;
  raw_payload?: { errors?: Array<{ code?: number; message?: string }> } | null;
};

type RequestItem = {
  experience_title: string;
  option_name: string | null;
  requested_date: string | null;
  preferred_time: string | null;
  guests: number;
};

type ConversationRequest = {
  id: string;
  reference: string;
  status: string;
  currency: string;
  estimated_total: number | null;
  contact: {
    name: string;
    phone: string | null;
  } | null;
  items: RequestItem[];
  messages: ThreadItem[];
};

function money(value: number | null, currency: string) {
  if (value === null) return "On request";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "EUR",
  }).format(Number(value));
}

function dateLabel(value: string | null) {
  if (!value) return "Not selected";
  const date = new Date(value + "T00:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function timeLabel(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function WhatsAppConversation({
  request,
  onChanged,
}: {
  request: ConversationRequest;
  onChanged: () => void | Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);

  const messages = useMemo(
    () =>
      [...(request.messages || [])]
        .filter((message) => message.is_private !== true && message.phone_number_id !== LEGACY_PERSONAL_PHONE_ID)
        .sort(
          (a, b) =>
            new Date(a.whatsapp_timestamp || a.created_at).getTime() -
            new Date(b.whatsapp_timestamp || b.created_at).getTime()
        ),
    [request.messages]
  );

  const newestMessageId = messages[messages.length - 1]?.id || "";

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;

    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [request.id, newestMessageId]);

  function fullFirstMessage() {
    const lines: string[] = [
      "Hello " + (request.contact?.name || "") + ",",
      "",
      "This is Watermelon Experiences regarding your request " + request.reference + ".",
    ];

    if (draft.trim()) lines.push("", draft.trim());

    lines.push("", "Request summary:");
    request.items.forEach((item, index) => {
      lines.push(
        (index + 1) + ". " + item.experience_title,
        "   Date: " + dateLabel(item.requested_date),
        "   Guests: " + item.guests,
        "   Preferred time: " + (item.preferred_time || "Flexible")
      );
      if (item.option_name) lines.push("   Option: " + item.option_name);
    });

    if (request.estimated_total !== null) {
      lines.push("", "Estimated total: " + money(request.estimated_total, request.currency));
    }

    lines.push("", "Reference: " + request.reference, "", "Watermelon Experiences");
    return lines.join("\n");
  }

  function preparedText() {
    if (messages.length > 0) return draft.trim();
    return fullFirstMessage();
  }

  async function copyForBusiness() {
    const text = preparedText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setFeedback("Texto copiado. Cola-o exclusivamente no WhatsApp Business do número +351 965 637 736; não uses o WhatsApp pessoal.");
    } catch {
      setFeedback("Não foi possível copiar. Copia manualmente o texto para o WhatsApp Business.");
    }
  }

  async function sendFromCRM() {
    const text = preparedText();
    if (!text || sending) return;

    setSending(true);
    setFeedback("");

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setFeedback("Your private-area session has expired. Please sign in again.");
      setSending(false);
      return;
    }

    try {
      const response = await fetch(
        SUPABASE_BOOKING_URL + "/functions/v1/watermelon-whatsapp-send-v2",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            request_id: request.id,
            text,
          }),
        }
      );

      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        hint?: string;
        code?: number | string | null;
        subcode?: number | string | null;
        mode?: "text" | "template" | "pending";
        template_name?: string | null;
        customer_service_window_open?: boolean;
      };

      if (!response.ok || !data.ok) {
        if (Number(data.code) === 190) {
          throw new Error(
            "Meta access token expired or is no longer valid. Generate a new test token in Meta Developers → WhatsApp → Step 1 · Try it out, save it in WhatsApp CRM settings, then try again."
          );
        }
        if (Number(data.code) === 131030) {
          throw new Error(
            "This recipient is not in Meta's allowed test list. Add and verify the phone number in Meta Developers → WhatsApp → Step 1 · Try it out."
          );
        }
        throw new Error(
          [data.error, data.hint].filter(Boolean).join(" ") ||
            "WhatsApp could not send the message."
        );
      }

      // Never assume that ok=true means the message was actually submitted.
      const deliveryMode = requireWhatsAppDeliveryMode(data.mode);
      if (deliveryMode === "template") {
        setFeedback(
          "The 24-hour WhatsApp service window is closed. One approved Watermelon template was sent and your message is queued. It will be delivered automatically as soon as the customer replies."
        );
      } else if (data.mode === "pending") {
        setFeedback(
          "An approved Watermelon template was already sent recently, so the CRM did not send another duplicate. Your message is queued and will be delivered automatically as soon as the customer replies."
        );
      } else {
        setDraft("");
        setFeedback(
          "Accepted for processing by WhatsApp; this is NOT a delivery confirmation. Check for Delivered, Read or Failed below."
        );
      }
      await onChanged();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "WhatsApp could not send the message."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="crm-whatsapp-thread">
      <div className="crm-whatsapp-thread-heading">
        <div>
          <strong>WhatsApp conversation</strong>
          <span>
            WhatsApp CRM temporariamente pausado. O número pessoal não é sincronizado; a ligação ao novo WhatsApp Business +351 965 637 736 está em preparação.
          </span>
        </div>
        {messages.length > 0 && (
          <b>{messages.length} message{messages.length === 1 ? "" : "s"} · This request</b>
        )}
      </div>

      {messages.length > 0 && (
        <div className="crm-whatsapp-messages" ref={messagesViewportRef}>
          {messages.map((message) => (
            <div
              className={
                message.direction === "outbound"
                  ? "crm-whatsapp-bubble outbound"
                  : "crm-whatsapp-bubble inbound"
              }
              key={message.id}
            >
              <p>{message.text_body || "[" + message.message_type + "]"}</p>
              <span>
                {timeLabel(message.whatsapp_timestamp || message.created_at)}
                {message.direction === "outbound" ? " · " + message.status : ""}
              </span>
              {message.direction === "outbound" && message.status === "failed" && (
                <p className="admin-error" role="alert">
                  Not delivered — {message.raw_payload?.errors?.[0]?.message || "WhatsApp rejected this message."}
                  {message.raw_payload?.errors?.[0]?.code ? " (Meta code " + message.raw_payload.errors[0].code + ")" : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="crm-whatsapp-compose">
        <p className="admin-error" role="status">O envio e a receção por WhatsApp no CRM estão suspensos até à validação do novo número empresarial. Para já, copia a mensagem e cola-a na aplicação WhatsApp Business.</p>
        <textarea
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            messages.length > 0
              ? "Write your reply to the customer…"
              : "Write the question or observation you want to add…"
          }
        />

        {messages.length === 0 && draft.trim() && (
          <details className="crm-message-preview">
            <summary>Preview first message with request details</summary>
            <pre>{fullFirstMessage()}</pre>
          </details>
        )}

        {feedback && (
          <p
            className={
              feedback.startsWith("Accepted for processing")
                ? "crm-whatsapp-window-note"
                : feedback.toLowerCase().includes("approved template")
                  ? "crm-proposal-feedback"
                  : "admin-error"
            }
          >
            {feedback}
          </p>
        )}

        <div className="crm-whatsapp-compose-actions">
          <button
            className="button button-primary"
            type="button"
            disabled={!WHATSAPP_CRM_ENABLED || !draft.trim() || sending}
            onClick={() => void sendFromCRM()}
          >
            {sending ? "Sending…" : WHATSAPP_CRM_ENABLED ? "Send from CRM" : "CRM WhatsApp pausado"}
          </button>

          <button className="button button-outline" type="button" onClick={() => void copyForBusiness()}>
            Copiar para WhatsApp Business
          </button>
        </div>

        <p className="crm-whatsapp-window-note">
          A integração com a Meta ainda não foi validada para o novo número empresarial. Nenhuma mensagem é enviada automaticamente pelo CRM nesta fase.
        </p>
      </div>
    </section>
  );
}
