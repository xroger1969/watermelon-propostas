"use client";

import { useRef, useState } from "react";
import type { CRMRequest } from "@/components/AdminCRM";
import type { CRMStatus } from "@/lib/crm-dashboard";
import EmailConversation from "@/components/EmailConversation";
import WhatsAppConversation from "@/components/WhatsAppConversation";
import ProposalEditor from "@/components/ProposalEditor";

const labels: Record<CRMStatus, string> = {
  new: "Novo", in_review: "Por analisar", awaiting_customer: "Aguarda cliente",
  customer_replied: "Cliente respondeu", proposal_drafting: "Em preparação", proposal_sent: "Proposta enviada",
  accepted: "Aceite", awaiting_payment: "Aguarda pagamento", confirmed: "Confirmado", in_service: "Em serviço",
  completed: "Concluído", declined: "Recusado", cancelled: "Cancelado", no_show: "Não compareceu",
};
const undecided = new Set<CRMStatus>(["new", "in_review", "awaiting_customer", "customer_replied", "proposal_drafting", "proposal_sent"]);

type ActivePanel = "whatsapp" | "email" | "proposal" | null;

function date(value: string | null) {
  if (!value) return "Data por definir";
  const parsed = new Date(value.length === 10 ? value + "T12:00:00" : value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

export default function SimpleCRMRequest({ request, busy, onAccept, onDecline, onPayment, onPaid, onChanged }: {
  request: CRMRequest;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onPayment: () => Promise<string>;
  onPaid: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [preparedMessage, setPreparedMessage] = useState<{ text: string; version: number }>();
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [error, setError] = useState("");
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const panel = useRef<HTMLDivElement>(null);
  const total = request.proposals[0]?.total ?? request.estimated_total;
  const canPay = ["accepted", "awaiting_payment"].includes(request.status);
  const canPrepareProposal = request.items.length > 0;

  function showPanel(next: Exclude<ActivePanel, null>) {
    setError("");
    setActivePanel(current => current === next ? null : next);
    window.requestAnimationFrame(() => panel.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }));
  }

  async function preparePayment() {
    if (paymentBusy || busy) return;
    if (request.kind !== "direct_booking" && !request.proposals.length) {
      showPanel("proposal");
      setError("Cria e guarda a proposta com o valor a cobrar antes de preparar o pagamento.");
      return;
    }
    setPaymentBusy(true);
    setError("");
    try {
      const text = await onPayment();
      setPreparedMessage(previous => ({ text, version: (previous?.version ?? 0) + 1 }));
      setActivePanel(request.contact?.email ? "email" : request.contact?.phone ? "whatsapp" : null);
      window.requestAnimationFrame(() => panel.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível preparar o pagamento.");
    } finally { setPaymentBusy(false); }
  }

  return (
    <article className="crm-essential-card" id={"crm-request-" + request.id} aria-label={"Pedido " + request.reference}>
      <header className="crm-essential-heading">
        <div><h2>{request.contact?.name || "Cliente"}</h2><small>{request.reference} · {date(request.created_at)}</small></div>
        <span className={"status-pill status-" + request.status}>{labels[request.status]}</span>
      </header>

      <div className="crm-essential-items">
        {request.items.map(item => (
          <section key={item.id}>
            <h3>{item.experience_title}</h3>
            <p>{date(item.requested_date)} · {item.guests} {item.guests === 1 ? "pessoa" : "pessoas"}{item.preferred_time ? " · " + item.preferred_time : ""}</p>
            {item.option_name && item.option_name !== item.experience_title && <p>{item.option_name}</p>}
            {([
              ["Flexibilidade", item.date_flexibility], ["Recolha", item.pickup_location], ["Idioma do guia", item.guide_language],
              ["Pedido", item.special_request], ["Crianças", item.children_ages], ["Alimentação", item.dietary],
              ["Acessibilidade", item.accessibility], ["Ocasião", item.occasion],
            ] as const).filter(([, value]) => value?.trim()).map(([label, value]) => <p className="crm-essential-note" key={label}><b>{label}:</b> {value}</p>)}
          </section>
        ))}
        {request.customer_notes && <p className="crm-essential-note"><b>Notas do cliente:</b> {request.customer_notes}</p>}
        {total !== null && <strong className="crm-essential-total">{new Intl.NumberFormat("pt-PT", { style: "currency", currency: request.currency || "EUR" }).format(total)}</strong>}
      </div>

      <div className="crm-essential-primary-actions" aria-label="Comunicar ou preparar proposta">
        {request.contact?.phone && <button className="button button-primary" type="button" onClick={() => showPanel("whatsapp")}>WhatsApp</button>}
        {request.contact?.email && <button className="button button-outline" type="button" onClick={() => showPanel("email")}>Email</button>}
        {canPrepareProposal && <button className="button button-outline" type="button" onClick={() => showPanel("proposal")}>Fazer proposta</button>}
      </div>

      {activePanel && <div ref={panel} className="crm-essential-active-panel">
        {activePanel === "whatsapp" && request.contact?.phone && (
          <WhatsAppConversation request={request} onChanged={onChanged} compact preparedMessage={preparedMessage} />
        )}
        {activePanel === "email" && request.contact?.email && (
          <EmailConversation request={request} onChanged={onChanged} compact preparedMessage={preparedMessage} />
        )}
        {activePanel === "proposal" && canPrepareProposal && (
          <ProposalEditor request={request} onChanged={onChanged} embedded />
        )}
      </div>}

      <div className="crm-essential-actions">
        {undecided.has(request.status) && <>
          <button className="button button-primary" disabled={busy} onClick={onAccept} type="button">Aceitar</button>
          <button className="button button-outline" disabled={busy} onClick={onDecline} type="button">Recusar</button>
        </>}
        {canPay && <button className="button button-primary" disabled={busy || paymentBusy} onClick={() => void preparePayment()} type="button">{paymentBusy ? "A preparar…" : "Enviar dados de pagamento"}</button>}
        {request.status === "awaiting_payment" && <button className="button button-outline" disabled={busy} onClick={onPaid} type="button">Confirmar pagamento recebido</button>}
      </div>

      {error && <p className="admin-error" role="alert">{error}</p>}
      {!request.contact?.email && !request.contact?.phone && <p className="crm-essential-no-contact">O formulário não tem email nem telefone.</p>}
      {preparedMessage && <details className="crm-essential-payment"><summary>Ver dados de pagamento preparados</summary><pre>{preparedMessage.text}</pre></details>}
    </article>
  );
}
