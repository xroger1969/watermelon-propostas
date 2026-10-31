"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Only explicit manual replies use the new endpoint; legacy automation stays paused.
const WHATSAPP_CRM_ENABLED = true;
const MANUAL_REPLY_SOURCE = "crm_cloud_api_manual";
const DEDICATED_PHONE_ID = "1423415737522090";
const TEST_REPLY_ID = "96563773-6000-8000-a000-000000000001";
const TEST_REPLY_SOURCE = "crm_cloud_api_controlled_test";
const VISIBLE_SOURCES = new Set(["cloud_api", MANUAL_REPLY_SOURCE, TEST_REPLY_SOURCE]);
const TEST_REPLY_TEXT = "Teste Watermelon recebido. A ligação de resposta do CRM está a funcionar.";

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
  raw_payload?: { controlled_test_state?: string; manual_reply?: { state?: string; [key: string]: unknown }; errors?: Array<{ code?: number; message?: string }> } | null;
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
  const [unconfirmedAttemptKey, setUnconfirmedAttemptKey] = useState("");
  const manualAttemptRef = useRef<{ requestId: string; text: string; key: string; outcome: string } | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);

  const messages = useMemo(
    () =>
      [...(request.messages || [])]
        .filter((message) => message.is_private === false &&
          message.phone_number_id === DEDICATED_PHONE_ID && VISIBLE_SOURCES.has(message.source))
        .sort(
          (a, b) =>
            new Date(a.whatsapp_timestamp || a.created_at).getTime() -
            new Date(b.whatsapp_timestamp || b.created_at).getTime()
        ),
    [request.messages]
  );

  const newestMessageId = messages[messages.length - 1]?.id || "";
  const testProof = [...messages].reverse().find(message => message.direction === "inbound" && message.is_private === false &&
    message.phone_number_id === "1423415737522090" && message.source === "cloud_api" &&
    message.status === "received" && message.text_body === "TESTE WATERMELON 965" &&
    Number.isFinite(Date.parse(message.whatsapp_timestamp || "")) &&
    Date.now() - Date.parse(message.whatsapp_timestamp || "") >= 0 &&
    Date.now() - Date.parse(message.whatsapp_timestamp || "") < 24 * 60 * 60 * 1000);
  const testAttempted = messages.some(message => message.id === TEST_REPLY_ID || message.source === TEST_REPLY_SOURCE);
  const serverUncertain = messages.some(message =>
    (message.source === MANUAL_REPLY_SOURCE && ["pending", "unknown"].includes(message.raw_payload?.manual_reply?.state || "")) ||
    (message.source === TEST_REPLY_SOURCE && ["pending", "unknown"].includes(message.raw_payload?.controlled_test_state || "")));
  const localAttemptConfirmed = messages.some(message => message.id === unconfirmedAttemptKey &&
    message.source === MANUAL_REPLY_SOURCE && ["submitted", "rejected"].includes(message.raw_payload?.manual_reply?.state || ""));
  const manualReplyUncertain = serverUncertain || Boolean(manualAttemptRef.current?.requestId === request.id && unconfirmedAttemptKey && !localAttemptConfirmed);

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
    const text = draft;
    if (!text.trim() || text.length > 4000 || sending || manualReplyUncertain) return;
    const previous = manualAttemptRef.current;
    const attempt = previous?.requestId === request.id && previous.text === text && previous.outcome !== "submitted"
      ? previous : { requestId: request.id, text, key: crypto.randomUUID(), outcome: "pending" };
    manualAttemptRef.current = attempt;
    attempt.outcome = "pending";
    setUnconfirmedAttemptKey(attempt.key);
    setSending(true);
    setFeedback("");
    try {
      const { data, error } = await supabase.functions.invoke("watermelon-whatsapp-reply", {
        method: "POST", body: { request_id: request.id, text, idempotency_key: attempt.key },
      });
      const reply = error?.context instanceof Response ? await error.context.json().catch(() => null) : data;
      const code = String(reply?.code || "");
      if (!error && reply?.ok === true && ["MANUAL_REPLY_SUBMITTED", "ALREADY_SUBMITTED"].includes(code)) {
        attempt.outcome = "submitted";
        setUnconfirmedAttemptKey("");
        setDraft("");
        setFeedback("Mensagem aceite pela Meta. Aguarda o estado de entrega; esta resposta foi enviada apenas por ação manual.");
      } else if (["META_REPLY_REJECTED", "PREVIOUS_REPLY_REJECTED", "MANUAL_REPLY_ASSOCIATION_CHANGED"].includes(code)) {
        attempt.outcome = "rejected";
        setUnconfirmedAttemptKey("");
        const diagnostic = typeof reply?.meta_code === "number" && Number.isFinite(reply.meta_code) ? " Código Meta: " + reply.meta_code + "." : "";
        setFeedback("A resposta foi recusada ou bloqueada. Não houve repetição automática. Verifica a conversa antes de preparar outra mensagem." + diagnostic);
      } else if (["AUTH_REQUIRED", "ADMIN_REQUIRED", "ORIGIN_NOT_ALLOWED", "INVALID_MANUAL_REPLY",
        "SERVER_NOT_CONFIGURED", "DEDICATED_ACCOUNT_REQUIRED", "CRM_LOOKUP_FAILED",
        "PUBLIC_BUSINESS_REQUEST_REQUIRED", "PUBLIC_BUSINESS_CONTACT_REQUIRED",
        "DEDICATED_SERVICE_WINDOW_REQUIRED", "DURABLE_CLAIM_FAILED", "MANUAL_REPLY_BLOCKED_BY_EXISTING_ATTEMPT"].includes(code)) {
        attempt.outcome = "rejected";
        setUnconfirmedAttemptKey("");
        setFeedback(code === "MANUAL_REPLY_BLOCKED_BY_EXISTING_ATTEMPT"
          ? "Outra resposta tem um resultado pendente. Esta mensagem não foi enviada; aguarda o esclarecimento da tentativa anterior."
          : code === "DEDICATED_SERVICE_WINDOW_REQUIRED"
          ? "É necessária uma mensagem recente deste cliente no número empresarial, neste pedido, para responder na janela de 24 horas."
          : "O servidor bloqueou o envio antes de o submeter à Meta. Confirma a sessão, o contacto e a configuração empresarial.");
      } else {
        attempt.outcome = "unknown";
        setFeedback("O resultado da resposta é incerto. O envio de novas mensagens fica bloqueado até a tentativa ser esclarecida. Não repitas o envio.");
      }
    } catch {
      attempt.outcome = "unknown";
      setFeedback("Não foi possível confirmar o resultado. Verifica a conversa e o telemóvel; não repitas um envio incerto.");
    } finally {
      try { await onChanged(); } catch { /* Preserve the submission result if the view cannot refresh. */ }
      setSending(false);
    }
  }

  async function sendControlledTestReply() {
    if (!testProof || testAttempted || sending) return;
    if (!window.confirm("Enviar UMA resposta de teste do WhatsApp empresarial +351 965 637 736 para o remetente deste teste (" +
      (request.contact?.phone || "número confirmado no servidor") + ")?\n\n" + TEST_REPLY_TEXT +
      "\n\nOs envios gerais continuam pausados. Este teste não pode ser repetido automaticamente.")) return;
    setSending(true);
    setFeedback("");
    try {
      const { data, error } = await supabase.functions.invoke("watermelon-whatsapp-test-reply", {
        method: "POST", body: { operation: "send_single_test_reply", inbound_test_message_id: testProof.id },
      });
      if (error || !data?.ok) {
        const failure = error?.context instanceof Response ? await error.context.json().catch(() => null) : data;
        const code = failure?.code;
        setFeedback(code === "TEST_ALREADY_ATTEMPTED"
          ? "O teste único já foi iniciado. Não será enviado novamente; confirma o resultado nesta conversa e no telemóvel."
          : code === "TEST_REJECTED" ? "A Meta rejeitou o teste. Os envios gerais continuam pausados e não há repetição automática."
          : "O resultado do teste não foi confirmado. Verifica esta conversa e o telemóvel antes de qualquer outra ação; não repitas o envio.");
      } else {
        setFeedback("A Meta aceitou a resposta única de teste. Aguarda o estado de entrega ou confirma no telemóvel; os envios gerais continuam pausados.");
      }
      await onChanged();
    } catch {
      setFeedback("Não foi possível confirmar o resultado do teste. Verifica o telemóvel e a conversa; não repitas um envio incerto.");
      await onChanged();
    } finally { setSending(false); }
  }

  return (
    <section className="crm-whatsapp-thread">
      <div className="crm-whatsapp-thread-heading">
        <div>
          <strong>WhatsApp conversation</strong>
          <span>
            WhatsApp empresarial +351 965 637 736. Respostas enviadas apenas quando carregas em Enviar. O número pessoal não é sincronizado.
          </span>
        </div>
        {messages.length > 0 && (
          <b>{messages.length} message{messages.length === 1 ? "" : "s"} · This request</b>
        )}
      </div>

      {messages.length > 0 && (
        <div className="crm-whatsapp-messages" ref={messagesViewportRef}>
          {messages.map((message) => {
            const pendingTest = message.source === TEST_REPLY_SOURCE &&
              ["pending", "unknown"].includes(message.raw_payload?.controlled_test_state || "");
            const pendingManual = message.source === MANUAL_REPLY_SOURCE &&
              ["pending", "unknown"].includes(message.raw_payload?.manual_reply?.state || "");
            return (
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
                {message.direction === "outbound" ? " · " + (pendingTest
                  ? message.raw_payload?.controlled_test_state === "pending" ? "Teste em preparação; não repetir" : "Resultado do teste incerto; não repetir"
                  : pendingManual ? message.raw_payload?.manual_reply?.state === "pending" ? "Resposta em preparação; não repetir" : "Resultado incerto; não repetir"
                  : message.status) : ""}
              </span>
              {message.direction === "outbound" && message.status === "failed" && !pendingTest && !pendingManual && (
                <p className="admin-error" role="alert">
                  Not delivered — {message.raw_payload?.errors?.[0]?.message || "WhatsApp rejected this message."}
                  {message.raw_payload?.errors?.[0]?.code ? " (Meta code " + message.raw_payload.errors[0].code + ")" : ""}
                </p>
              )}
            </div>
          ); })}
        </div>
      )}

      <div className="crm-whatsapp-compose">
        {testProof && (
          <div className="crm-whatsapp-compose-actions">
            <button type="button" className="button button-outline" disabled={sending || testAttempted}
              onClick={() => void sendControlledTestReply()}>
              {testAttempted ? "Resposta única de teste já iniciada" : sending ? "A enviar teste único…" : "Enviar resposta única de teste"}
            </button>
            <p>Resposta fixa: {TEST_REPLY_TEXT}</p>
          </div>
        )}
        <p className="admin-error" role="status">As mensagens deste número empresarial entram no respetivo pedido. As respostas exigem uma ação manual e uma mensagem recente do cliente; não há envios automáticos.</p>
        {manualReplyUncertain && <p className="admin-error" role="status">Há uma resposta em preparação ou com resultado incerto. Novos envios ficam bloqueados até ser esclarecida.</p>}
        <textarea
          rows={3}
          maxLength={4000}
          readOnly={sending}
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
            disabled={!WHATSAPP_CRM_ENABLED || !draft.trim() || sending || manualReplyUncertain}
            onClick={() => void sendFromCRM()}
          >
            {sending ? "Sending…" : WHATSAPP_CRM_ENABLED ? "Send from CRM" : "CRM WhatsApp pausado"}
          </button>

          <button className="button button-outline" type="button" onClick={() => void copyForBusiness()}>
            Copiar para WhatsApp Business
          </button>
        </div>

        <p className="crm-whatsapp-window-note">
          Cada clique prepara uma única tentativa, sem repetição automática. Os estados de entrega são confirmados pela Meta.
        </p>
      </div>
    </section>
  );
}

