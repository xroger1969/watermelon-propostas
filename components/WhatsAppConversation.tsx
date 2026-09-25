"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_BOOKING_URL } from "@/lib/supabase/config";

type ThreadItem = {
  id: string;
  created_at: string;
  direction: "inbound" | "outbound";
  text_body: string | null;
  message_type: string;
  status: "received" | "sent" | "delivered" | "read" | "failed" | "deleted";
  source: string;
  whatsapp_timestamp: string | null;
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

  const messages = useMemo(
    () =>
      [...(request.messages || [])]
        .sort(
          (a, b) =>
            new Date(a.whatsapp_timestamp || a.created_at).getTime() -
            new Date(b.whatsapp_timestamp || b.created_at).getTime()
        )
        .slice(-30),
    [request.messages]
  );

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

  function fallbackUrl() {
    const phone = (request.contact?.phone || "").replace(/[^0-9]/g, "");
    if (!phone) return "#";
    return "https://wa.me/" + phone + "?text=" + encodeURIComponent(preparedText());
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
      };

      if (!response.ok || !data.ok) {
        throw new Error(
          [data.error, data.hint].filter(Boolean).join(" ") ||
            "WhatsApp could not send the message."
        );
      }

      setDraft("");
      setFeedback("Message sent from the CRM.");
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
            Incoming Cloud API messages appear here automatically. Customer replies move the request to Customer replied.
          </span>
        </div>
        {messages.length > 0 && <b>Live CRM history</b>}
      </div>

      {messages.length > 0 && (
        <div className="crm-whatsapp-messages">
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
            </div>
          ))}
        </div>
      )}

      <div className="crm-whatsapp-compose">
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
              feedback.toLowerCase().includes("sent from")
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
            disabled={!draft.trim() || sending}
            onClick={() => void sendFromCRM()}
          >
            {sending ? "Sending…" : "Send from CRM"}
          </button>

          <a
            className="button button-outline"
            href={fallbackUrl()}
            target="_blank"
            rel="noreferrer"
          >
            Open in WhatsApp
          </a>
        </div>

        <p className="crm-whatsapp-window-note">
          Meta allows free-form Cloud API replies during the customer-service conversation window. If Meta blocks a CRM send outside that window, use an approved template or the WhatsApp fallback.
        </p>
      </div>
    </section>
  );
}
