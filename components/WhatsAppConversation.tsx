"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Only explicit manual replies use the new endpoint; legacy automation stays paused.
const WHATSAPP_CRM_ENABLED = true;
const MANUAL_REPLY_SOURCE = "crm_cloud_api_manual";
const MANUAL_TEMPLATE_SOURCE = "crm_whatsapp_manual_template";
const DEDICATED_PHONE_ID = "1423415737522090";
const TEST_REPLY_ID = "96563773-6000-8000-a000-000000000001";
const TEST_REPLY_SOURCE = "crm_cloud_api_controlled_test";
const VISIBLE_SOURCES = new Set(["cloud_api", MANUAL_REPLY_SOURCE, TEST_REPLY_SOURCE, MANUAL_TEMPLATE_SOURCE]);
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
  raw_payload?: { controlled_test_state?: string; manual_reply?: { state?: string; [key: string]: unknown }; manual_template?: { version?: number; state?: string; [key: string]: unknown }; errors?: Array<{ code?: number; message?: string }> } | null;
};

type InitiationTemplate = { id: string; name: string; language: string; body: string; status: "APPROVED"; category: "UTILITY" };
type TemplateCatalogue = {
  requestId: string; eligible: boolean; eligibility_code: string; requires_consent_confirmation: true;
  recipient: { name: string; phone: string }; templates: InitiationTemplate[];
};

function approvedStaticTemplate(value: unknown): value is InitiationTemplate {
  const template = value as Partial<InitiationTemplate> | null;
  return Boolean(template && template.status === "APPROVED" && template.category === "UTILITY" &&
    typeof template.id === "string" && template.id && typeof template.name === "string" && /^[a-z0-9_]+$/.test(template.name) &&
    typeof template.language === "string" && /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(template.language) &&
    typeof template.body === "string" && template.body.trim() && template.body.length <= 4000 && !/\{\{|\}\}/.test(template.body));
}

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
  const [templateCatalogue, setTemplateCatalogue] = useState<TemplateCatalogue | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [templateConsent, setTemplateConsent] = useState(false);
  const [templateUnconfirmedAttemptKey, setTemplateUnconfirmedAttemptKey] = useState("");
  const [serviceWindowRequiredForInbound, setServiceWindowRequiredForInbound] = useState<string | null>(null);
  const manualAttemptRef = useRef<{ requestId: string; text: string; key: string; outcome: string } | null>(null);
  const templateAttemptRef = useRef<{ requestId: string; name: string; language: string; key: string; outcome: string } | null>(null);
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
  const recentInbound = [...messages].reverse().find(message => message.direction === "inbound" && message.source === "cloud_api" &&
    message.status === "received" && Number.isFinite(Date.parse(message.whatsapp_timestamp || "")) &&
    Date.now() - Date.parse(message.whatsapp_timestamp || "") >= 0 && Date.now() - Date.parse(message.whatsapp_timestamp || "") < 24 * 60 * 60 * 1000);
  const serviceWindowOpen = Boolean(recentInbound && serviceWindowRequiredForInbound !== recentInbound.id);
  const testProof = [...messages].reverse().find(message => message.direction === "inbound" && message.is_private === false &&
    message.phone_number_id === "1423415737522090" && message.source === "cloud_api" &&
    message.status === "received" && message.text_body === "TESTE WATERMELON 965" &&
    Number.isFinite(Date.parse(message.whatsapp_timestamp || "")) &&
    Date.now() - Date.parse(message.whatsapp_timestamp || "") >= 0 &&
    Date.now() - Date.parse(message.whatsapp_timestamp || "") < 24 * 60 * 60 * 1000);
  const testAttempted = messages.some(message => message.id === TEST_REPLY_ID || message.source === TEST_REPLY_SOURCE);
  const serverUncertain = messages.some(message =>
    (message.source === MANUAL_REPLY_SOURCE && ["pending", "unknown"].includes(message.raw_payload?.manual_reply?.state || "")) ||
    (message.source === MANUAL_TEMPLATE_SOURCE && ["pending", "unknown"].includes(message.raw_payload?.manual_template?.state || "")) ||
    (message.source === TEST_REPLY_SOURCE && ["pending", "unknown"].includes(message.raw_payload?.controlled_test_state || "")));
  const localAttemptConfirmed = messages.some(message => message.id === unconfirmedAttemptKey &&
    message.source === MANUAL_REPLY_SOURCE && ["submitted", "rejected"].includes(message.raw_payload?.manual_reply?.state || ""));
  const localTemplateAttemptConfirmed = messages.some(message => message.id === templateUnconfirmedAttemptKey &&
    message.source === MANUAL_TEMPLATE_SOURCE && ["submitted", "rejected"].includes(message.raw_payload?.manual_template?.state || ""));
  const manualReplyUncertain = serverUncertain || Boolean(manualAttemptRef.current?.requestId === request.id && unconfirmedAttemptKey && !localAttemptConfirmed) ||
    Boolean(templateAttemptRef.current?.requestId === request.id && templateUnconfirmedAttemptKey && !localTemplateAttemptConfirmed);
  const currentCatalogue = templateCatalogue?.requestId === request.id ? templateCatalogue : null;
  const selectedTemplate = currentCatalogue?.templates.find(template => template.name + ":" + template.language === selectedTemplateKey);
  const templateAlreadySubmitted = messages.some(message => message.source === MANUAL_TEMPLATE_SOURCE && message.raw_payload?.manual_template?.state === "submitted") ||
    (templateAttemptRef.current?.requestId === request.id && templateAttemptRef.current.outcome === "submitted");

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
    if (!serviceWindowOpen) {
      setFeedback("Para iniciar este contacto, escolhe um modelo aprovado e confirma que o cliente autorizou o contacto por WhatsApp.");
      return;
    }
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
        if (code === "DEDICATED_SERVICE_WINDOW_REQUIRED") setServiceWindowRequiredForInbound(recentInbound?.id || "");
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

  async function loadTemplateCatalogue() {
    if (templateLoading || sending) return;
    setTemplateLoading(true);
    setFeedback("");
    setTemplateConsent(false);
    try {
      const { data, error } = await supabase.functions.invoke("watermelon-whatsapp-initiate-template?request_id=" + encodeURIComponent(request.id), { method: "GET" });
      const phone = data?.recipient?.phone;
      if (error || data?.ok !== true || typeof data.eligible !== "boolean" || data.requires_consent_confirmation !== true ||
        typeof data?.recipient?.name !== "string" || typeof phone !== "string" || !/^\+?[1-9]\d{7,14}$/.test(phone) || /^9\d{8}$/.test(phone) || !Array.isArray(data.templates)) {
        setTemplateCatalogue(null);
        setSelectedTemplateKey("");
        setFeedback("Não foi possível confirmar os modelos e o destinatário. Atualiza os modelos antes de enviar.");
        return;
      }
      const templates = data.templates.filter(approvedStaticTemplate);
      setTemplateCatalogue({ requestId: request.id, eligible: data.eligible, eligibility_code: String(data.eligibility_code || ""),
        requires_consent_confirmation: true, recipient: { name: data.recipient.name, phone }, templates });
      setSelectedTemplateKey(templates[0] ? templates[0].name + ":" + templates[0].language : "");
      if (!serverUncertain && templateAttemptRef.current?.requestId === request.id && templateAttemptRef.current.outcome === "blocked") {
        setTemplateUnconfirmedAttemptKey("");
      }
      if (!templates.length) setFeedback("Ainda não há modelos estáticos de serviço aprovados disponíveis. O modelo poderá estar pendente de aprovação na Meta; atualiza mais tarde.");
      else if (!data.eligible) setFeedback("Este pedido ainda não está elegível para iniciar um contacto por modelo. Confirma o contacto e a configuração empresarial.");
    } catch {
      setTemplateCatalogue(null);
      setSelectedTemplateKey("");
      setFeedback("Não foi possível carregar os modelos. Nenhuma mensagem foi enviada.");
    } finally { setTemplateLoading(false); }
  }

  async function sendInitiationTemplate() {
    if (sending || templateLoading || manualReplyUncertain || templateAlreadySubmitted || !templateConsent ||
      !currentCatalogue?.eligible || !selectedTemplate || !approvedStaticTemplate(selectedTemplate)) return;
    const previous = templateAttemptRef.current;
    const attempt = previous?.requestId === request.id && previous.name === selectedTemplate.name && previous.language === selectedTemplate.language && previous.outcome !== "submitted"
      ? previous : { requestId: request.id, name: selectedTemplate.name, language: selectedTemplate.language, key: crypto.randomUUID(), outcome: "pending" };
    templateAttemptRef.current = attempt;
    attempt.outcome = "pending";
    setTemplateUnconfirmedAttemptKey(attempt.key);
    setSending(true);
    setFeedback("");
    try {
      const { data, error } = await supabase.functions.invoke("watermelon-whatsapp-initiate-template", {
        method: "POST", body: { request_id: request.id, template_name: selectedTemplate.name, language: selectedTemplate.language,
          client_attempt_id: attempt.key, consent_confirmed: true },
      });
      const reply = error?.context instanceof Response ? await error.context.json().catch(() => null) : data;
      const code = String(reply?.code || "");
      if (!error && reply?.ok === true && ["TEMPLATE_SUBMITTED", "ALREADY_SUBMITTED"].includes(code) &&
        reply.state === "submitted" && reply.mode === "template" && reply.queued === false && reply.delivery_verified === false) {
        attempt.outcome = "submitted";
        setTemplateUnconfirmedAttemptKey("");
        setTemplateConsent(false);
        setFeedback("Modelo aceite pela Meta. Aguarda a resposta do cliente para escrever uma mensagem; nenhum texto ficou em fila de envio automático.");
      } else if (code === "TEMPLATE_BLOCKED_BY_EXISTING_ATTEMPT") {
        attempt.outcome = "blocked";
        setFeedback("Outra tentativa está pendente. Este modelo não foi enviado; aguarda o esclarecimento e atualiza os modelos antes de outra ação manual.");
      } else if (["META_TEMPLATE_REJECTED", "PREVIOUS_TEMPLATE_REJECTED", "TEMPLATE_ASSOCIATION_OR_APPROVAL_CHANGED",
        "AUTH_REQUIRED", "ADMIN_REQUIRED", "ORIGIN_NOT_ALLOWED", "INVALID_TEMPLATE_REQUEST", "CONSENT_CONFIRMATION_REQUIRED", "INVALID_REQUEST_ID",
        "SERVER_NOT_CONFIGURED", "DEDICATED_ACCOUNT_REQUIRED", "CRM_LOOKUP_FAILED", "PUBLIC_BUSINESS_REQUEST_REQUIRED",
        "PUBLIC_BUSINESS_CONTACT_REQUIRED", "INVALID_INTERNATIONAL_CUSTOMER_PHONE", "AI_WEB_REQUEST_REQUIRED", "REQUEST_NOT_ACTIVE",
        "USE_REPLY_ENDPOINT", "TEMPLATE_NOT_APPROVED_OR_SUPPORTED", "TEMPLATE_CATALOG_UNAVAILABLE"].includes(code)) {
        attempt.outcome = "rejected";
        setTemplateUnconfirmedAttemptKey("");
        setFeedback("O envio do modelo foi recusado ou bloqueado. Nenhum texto ficou em fila; confirma o pedido e atualiza os modelos antes de outra ação manual.");
      } else {
        attempt.outcome = "unknown";
        setFeedback("O resultado do modelo é incerto. Novos envios ficam bloqueados até a tentativa ser esclarecida. Não repitas o envio.");
      }
    } catch {
      attempt.outcome = "unknown";
      setFeedback("Não foi possível confirmar o envio do modelo. Verifica a conversa e o telemóvel; não repitas um envio incerto.");
    } finally {
      try { await onChanged(); } catch { /* Keep the attempt result if refreshing fails. */ }
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
            const pendingTemplate = message.source === MANUAL_TEMPLATE_SOURCE &&
              ["pending", "unknown"].includes(message.raw_payload?.manual_template?.state || "");
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
                  : pendingTemplate ? message.raw_payload?.manual_template?.state === "pending" ? "Modelo em preparação; não repetir" : "Resultado do modelo incerto; não repetir"
                  : message.status) : ""}
              </span>
              {message.direction === "outbound" && message.status === "failed" && !pendingTest && !pendingManual && !pendingTemplate && (
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
        {!serviceWindowOpen && (
          <section className="crm-whatsapp-template-card" aria-label="Iniciar contacto por modelo aprovado">
            <div>
              <strong>Primeiro contacto por WhatsApp</strong>
              <p>Escolhe um modelo aprovado e confirma a autorização do cliente. O texto livre só pode ser enviado depois de uma mensagem recente do cliente.</p>
            </div>
            <button type="button" className="button button-outline" disabled={templateLoading || sending} onClick={() => void loadTemplateCatalogue()}>
              {templateLoading ? "A carregar modelos…" : currentCatalogue ? "Atualizar modelos aprovados" : "Carregar modelos aprovados"}
            </button>
            {currentCatalogue && (
              <>
                <p className="crm-whatsapp-template-recipient">Destinatário confirmado: <strong>{currentCatalogue.recipient.name}</strong> · <strong>{currentCatalogue.recipient.phone}</strong></p>
                {currentCatalogue.templates.length > 0 ? (
                  <>
                    <label htmlFor={"crm-template-" + request.id}>Modelo aprovado</label>
                    <select id={"crm-template-" + request.id} value={selectedTemplateKey} disabled={sending || manualReplyUncertain || templateAlreadySubmitted}
                      onChange={(event) => { setSelectedTemplateKey(event.target.value); setTemplateConsent(false); }}>
                      {currentCatalogue.templates.map(template => <option key={template.id + ":" + template.language} value={template.name + ":" + template.language}>{template.name} · {template.language}</option>)}
                    </select>
                    {selectedTemplate && <pre className="crm-whatsapp-template-preview">{selectedTemplate.body}</pre>}
                    <label className="crm-whatsapp-template-consent">
                      <input type="checkbox" checked={templateConsent} disabled={sending || manualReplyUncertain || templateAlreadySubmitted}
                        onChange={(event) => setTemplateConsent(event.target.checked)} />
                      <span>O cliente autorizou o contacto por WhatsApp sobre este pedido.</span>
                    </label>
                    <button type="button" className="button button-primary" onClick={() => void sendInitiationTemplate()}
                      disabled={!currentCatalogue.eligible || !selectedTemplate || !templateConsent || sending || templateLoading || manualReplyUncertain || templateAlreadySubmitted}>
                      {templateAlreadySubmitted ? "Modelo enviado · aguarda a resposta do cliente" : sending ? "A enviar modelo…" : "Enviar modelo aprovado"}
                    </button>
                  </>
                ) : <p role="status">Ainda não há modelos estáticos de serviço aprovados disponíveis. O modelo poderá estar pendente de aprovação na Meta.</p>}
                {!currentCatalogue.eligible && <p role="status">Este pedido ainda não está elegível para iniciar contacto. Confirma os dados e atualiza os modelos.</p>}
              </>
            )}
          </section>
        )}
        <p className="crm-proposal-feedback" role="status">As mensagens deste número empresarial entram no respetivo pedido. Os envios exigem uma ação manual; não há envios automáticos.</p>
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
              ["Mensagem aceite pela Meta.", "Modelo aceite pela Meta.", "A Meta aceitou a resposta única de teste.", "Texto copiado."].some(
                (prefix) => feedback.startsWith(prefix)
              )
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
            disabled={!WHATSAPP_CRM_ENABLED || !serviceWindowOpen || !draft.trim() || sending || manualReplyUncertain}
            onClick={() => void sendFromCRM()}
          >
            {sending ? "Sending…" : WHATSAPP_CRM_ENABLED ? "Send from CRM" : "CRM WhatsApp pausado"}
          </button>

          <button className="button button-outline" type="button" onClick={() => void copyForBusiness()}>
            Copiar para WhatsApp Business
          </button>
        </div>

        <p className="crm-whatsapp-window-note">
          Cada clique prepara uma única tentativa, sem repetição automática. Um modelo aceite não abre a janela de 24 horas: aguarda a resposta do cliente. O texto escrito mantém-se em rascunho.
        </p>
      </div>
    </section>
  );
}


