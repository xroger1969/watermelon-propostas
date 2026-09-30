"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_BOOKING_URL } from "@/lib/supabase/config";

type RequestItem = {
  id: string;
  position: number;
  experience_title: string;
  option_name: string | null;
  requested_date: string | null;
  preferred_time: string | null;
  guests: number;
  unit_price: number | null;
  pickup_location: string | null;
  special_request: string | null;
};

type ProposalItemRecord = {
  id: string;
  position: number;
  experience_title: string;
  option_name: string | null;
  proposed_date: string | null;
  proposed_time: string | null;
  guests: number;
  unit_price: number;
  line_total: number;
  pickup_location: string | null;
  notes: string | null;
};

type ProposalRecord = {
  id: string;
  version: number;
  public_token: string;
  status: "draft" | "sent" | "accepted" | "changes_requested" | "expired" | "cancelled";
  valid_until: string | null;
  intro_text: string | null;
  conditions_text: string | null;
  subtotal: number;
  discount_amount: number;
  extras_amount: number;
  total: number;
  sent_at: string | null;
  accepted_at: string | null;
  customer_response: string | null;
  payment_status: "not_requested" | "awaiting" | "paid" | "refunded";
  payment_method: string | null;
  payment_token: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  items: ProposalItemRecord[];
};

type CRMRequestForProposal = {
  id: string;
  reference: string;
  currency: string;
  contact: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
  items: RequestItem[];
  proposals: ProposalRecord[];
};

type EditorItem = {
  experience_title: string;
  option_name: string;
  proposed_date: string;
  proposed_time: string;
  guests: string;
  unit_price: string;
  pickup_location: string;
  notes: string;
};

type SavedDraft = {
  proposal_id: string;
  public_token: string;
  version: number;
  total: number;
};

function isoInDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "EUR",
  }).format(value);
}

function numberValue(value: string) {
  const number = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function fromRequest(item: RequestItem): EditorItem {
  return {
    experience_title: item.experience_title,
    option_name: item.option_name || "",
    proposed_date: item.requested_date || "",
    proposed_time: item.preferred_time || "Flexible",
    guests: String(Math.max(1, item.guests || 1)),
    unit_price: item.unit_price === null ? "" : String(item.unit_price),
    pickup_location: item.pickup_location || "",
    notes: item.special_request || "",
  };
}

function fromProposal(item: ProposalItemRecord): EditorItem {
  return {
    experience_title: item.experience_title,
    option_name: item.option_name || "",
    proposed_date: item.proposed_date || "",
    proposed_time: item.proposed_time || "Flexible",
    guests: String(Math.max(1, item.guests || 1)),
    unit_price: String(item.unit_price ?? 0),
    pickup_location: item.pickup_location || "",
    notes: item.notes || "",
  };
}

export default function ProposalEditor({
  request,
  onChanged,
}: {
  request: CRMRequestForProposal;
  onChanged: () => void | Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const latest = useMemo(
    () => [...(request.proposals || [])].sort((a, b) => b.version - a.version)[0] || null,
    [request.proposals]
  );

  const [open, setOpen] = useState(false);
  const [validUntil, setValidUntil] = useState(isoInDays(7));
  const [introText, setIntroText] = useState(
    "Thank you for your request. We are pleased to present the following personalized proposal."
  );
  const [conditionsText, setConditionsText] = useState(
    "This proposal is subject to availability at the time of confirmation. Final booking is secured after Watermelon confirms availability and payment is received."
  );
  const [discount, setDiscount] = useState("0");
  const [extras, setExtras] = useState("0");
  const [items, setItems] = useState<EditorItem[]>(request.items.map(fromRequest));
  const [savedDraft, setSavedDraft] = useState<SavedDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const editRevision = useRef(0);
  const dirty = useRef(false);
  const editingRequest = useRef(request.id);
  const saveInFlight = useRef(false);

  function markChanged() {
    editRevision.current += 1;
    dirty.current = true;
    setHasChanges(true);
    setFeedback("");
  }

  async function sendViaCRM(text: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      throw new Error("Your private-area session has expired. Please sign in again.");
    }

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
          purpose: "proposal",
        }),
      }
    );

    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      hint?: string;
      mode?: "text" | "template";
      template_name?: string | null;
    };

    if (!response.ok || !data.ok) {
      throw new Error(
        [data.error, data.hint].filter(Boolean).join(" ") ||
          "WhatsApp could not submit the proposal."
      );
    }

    return data;
  }

  useEffect(() => {
    // Realtime refreshes create new arrays even when this proposal has not changed.
    // Never replace the owner's unsaved prices or other edits with server values.
    if (editingRequest.current === request.id && dirty.current) return;
    editingRequest.current = request.id;
    dirty.current = false;
    setHasChanges(false);
    const draft = request.proposals
      ?.filter((proposal) => proposal.status === "draft")
      .sort((a, b) => b.version - a.version)[0];

    if (draft) {
      setValidUntil(draft.valid_until || isoInDays(7));
      setIntroText(
        draft.intro_text ||
          "Thank you for your request. We are pleased to present the following personalized proposal."
      );
      setConditionsText(
        draft.conditions_text ||
          "This proposal is subject to availability at the time of confirmation. Final booking is secured after Watermelon confirms availability and payment is received."
      );
      setDiscount(String(draft.discount_amount || 0));
      setExtras(String(draft.extras_amount || 0));
      setItems(
        draft.items?.length
          ? [...draft.items].sort((a, b) => a.position - b.position).map(fromProposal)
          : request.items.map(fromRequest)
      );
      setSavedDraft({
        proposal_id: draft.id,
        public_token: draft.public_token,
        version: draft.version,
        total: Number(draft.total || 0),
      });
    } else if (latest) {
      setValidUntil(latest.valid_until || isoInDays(7));
      setIntroText(
        latest.intro_text ||
          "Thank you for your request. We are pleased to present the following personalized proposal."
      );
      setConditionsText(
        latest.conditions_text ||
          "This proposal is subject to availability at the time of confirmation. Final booking is secured after Watermelon confirms availability and payment is received."
      );
      setDiscount(String(latest.discount_amount || 0));
      setExtras(String(latest.extras_amount || 0));
      setItems(
        latest.items?.length
          ? [...latest.items].sort((a, b) => a.position - b.position).map(fromProposal)
          : request.items.map(fromRequest)
      );
      setSavedDraft(null);
    } else {
      setValidUntil(isoInDays(7));
      setIntroText(
        "Thank you for your request. We are pleased to present the following personalized proposal."
      );
      setConditionsText(
        "This proposal is subject to availability at the time of confirmation. Final booking is secured after Watermelon confirms availability and payment is received."
      );
      setDiscount("0");
      setExtras("0");
      setItems(request.items.map(fromRequest));
      setSavedDraft(null);
    }
    setFeedback("");
  }, [request.id, request.proposals, request.items, latest]);

  const subtotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        const guests = Math.max(1, Number.parseInt(item.guests, 10) || 1);
        return sum + numberValue(item.unit_price) * guests;
      }, 0),
    [items]
  );

  const total = Math.max(0, subtotal - numberValue(discount) + numberValue(extras));

  function updateItem(index: number, patch: Partial<EditorItem>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  async function saveDraft(showFeedback = true): Promise<SavedDraft | null> {
    if (!items.length || saveInFlight.current) return null;
    if (items.some((item) => !/^\d+(?:[.,]\d{1,2})?$/.test(item.unit_price.trim()))) {
      setFeedback("Enter your price per person for every experience (for example 150 or 150,50).");
      return null;
    }
    saveInFlight.current = true;
    const revisionAtSave = editRevision.current;

    setSaving(true);
    setFeedback("");

    try {
      const { data, error } = await supabase.rpc("watermelon_save_proposal_draft", {
        p_request_id: request.id,
        p_valid_until: validUntil || null,
        p_intro_text: introText,
        p_conditions_text: conditionsText,
        p_discount_amount: numberValue(discount),
        p_extras_amount: numberValue(extras),
        p_items: items.map((item, index) => ({
          position: index,
          experience_title: item.experience_title,
          option_name: item.option_name,
          proposed_date: item.proposed_date || null,
          proposed_time: item.proposed_time,
          guests: Math.max(1, Number.parseInt(item.guests, 10) || 1),
          unit_price: numberValue(item.unit_price),
          pickup_location: item.pickup_location,
          notes: item.notes,
        })),
      });

      if (error) {
        setFeedback(error.message);
        return null;
      }

      const row = Array.isArray(data) ? data[0] : null;
      if (!row) {
        setFeedback("The proposal draft could not be saved.");
        return null;
      }

      const saved: SavedDraft = {
        proposal_id: row.proposal_id,
        public_token: row.public_token,
        version: Number(row.version),
        total: Number(row.total),
      };

      setSavedDraft(saved);
      if (showFeedback) {
        setFeedback("Draft v" + saved.version + " saved.");
      }
      await onChanged();
      if (editRevision.current === revisionAtSave) {
        dirty.current = false;
        setHasChanges(false);
      }
      return saved;
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "The proposal draft could not be saved.");
      return null;
    } finally {
      setSaving(false);
      saveInFlight.current = false;
    }
  }

  async function sendProposal() {
    if (sending) return;
    setSending(true);
    setFeedback("");

    const saved = await saveDraft(false);
    if (!saved) {
      setSending(false);
      return;
    }

    const { data, error } = await supabase.rpc("watermelon_send_proposal", {
      p_proposal_id: saved.proposal_id,
    });

    if (error) {
      setFeedback(error.message);
      setSending(false);
      return;
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      setFeedback("The proposal could not be prepared for sending.");
      setSending(false);
      return;
    }

    const link =
      window.location.origin +
      "/proposal/" +
      encodeURIComponent(request.reference) +
      "?token=" +
      encodeURIComponent(row.public_token);

    const phone = (request.contact?.phone || "").replace(/[^0-9]/g, "");
    const lines = [
      "Hello " + (request.contact?.name || "") + ",",
      "",
      "Your personalized Watermelon proposal is ready.",
      "Reference: " + request.reference,
      "Proposal: v" + row.version,
      "Total: " + money(Number(row.total), request.currency),
      validUntil ? "Valid until: " + validUntil : "",
      "",
      "View the full proposal and respond here:",
      link,
      "",
      "Watermelon Experiences",
    ].filter(Boolean);

    if (!phone) {
      try {
        await navigator.clipboard.writeText(link);
        setFeedback("Proposal link copied. This contact has no phone number.");
      } catch {
        setFeedback("Proposal prepared. This contact has no phone number.");
      }
      await onChanged();
      setSending(false);
      return;
    }

    try {
      const delivery = await sendViaCRM(lines.join("\n"));
      if (delivery.mode === "template") {
        setFeedback(
          "Proposal v" +
            row.version +
            " is ready. The 24-hour WhatsApp window is closed, so the CRM sent an approved Watermelon template first. The full proposal will be sent automatically from the CRM as soon as the customer replies."
        );
      } else {
        setFeedback(
          "Proposal v" +
            row.version +
            " submitted from the CRM to WhatsApp. Delivery/read status will update automatically in the conversation."
        );
      }
      await onChanged();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "The proposal could not be submitted from the CRM."
      );
    }

    setSending(false);
  }

  const latestStatus = latest
    ? "v" + latest.version + " · " + latest.status.replaceAll("_", " ")
    : "No proposal yet";
  const proposalLocked = latest?.status === "accepted";

  function proposalLink(token: string) {
    return (
      window.location.origin +
      "/proposal/" +
      encodeURIComponent(request.reference) +
      "?token=" +
      encodeURIComponent(token)
    );
  }

  async function resendLatestProposal() {
    if (!latest || latest.status === "draft" || sending) return;

    const phone = (request.contact?.phone || "").replace(/[^0-9]/g, "");
    const link = proposalLink(latest.public_token);
    const lines = [
      "Hello " + (request.contact?.name || "") + ",",
      "",
      "Here is your Watermelon proposal.",
      "Reference: " + request.reference,
      "Proposal: v" + latest.version,
      "Total: " + money(Number(latest.total), request.currency),
      latest.valid_until ? "Valid until: " + latest.valid_until : "",
      "",
      "View the full proposal here:",
      link,
      "",
      "Watermelon Experiences",
    ].filter(Boolean);

    setSending(true);
    setFeedback("");

    await supabase.from("watermelon_activities").insert({
      request_id: request.id,
      contact_id: request.contact?.id || null,
      activity_type: "proposal_resent",
      summary: "Proposal v" + latest.version + " queued for CRM WhatsApp delivery",
      metadata: {
        proposal_id: latest.id,
        version: latest.version,
        link,
      },
    });

    if (!phone) {
      try {
        await navigator.clipboard.writeText(link);
        setFeedback("Proposal link copied. This contact has no phone number.");
      } catch {
        setFeedback("Proposal link ready, but this contact has no phone number.");
      }
      setSending(false);
      return;
    }

    try {
      const delivery = await sendViaCRM(lines.join("\n"));
      setFeedback(
        delivery.mode === "template"
          ? "The WhatsApp 24-hour window is closed. The CRM sent the approved Watermelon template and will resend the proposal automatically when the customer replies."
          : "Proposal resubmitted from the CRM to WhatsApp."
      );
      await onChanged();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "The proposal could not be resubmitted from the CRM."
      );
    } finally {
      setSending(false);
    }
  }

  async function sendPaymentLinkFromCRM() {
    if (
      !latest ||
      latest.status !== "accepted" ||
      latest.payment_status === "paid" ||
      !latest.payment_token ||
      sending
    ) {
      return;
    }

    const paymentLink =
      window.location.origin +
      "/payment/" +
      encodeURIComponent(request.reference) +
      "?token=" +
      encodeURIComponent(latest.payment_token);

    const text = [
      "Hello " + (request.contact?.name || "") + ",",
      "",
      "Your Watermelon Experiences payment link is ready.",
      "Reference: " + request.reference,
      "Amount: " + money(Number(latest.total), request.currency),
      "",
      "Pay securely here:",
      paymentLink,
      "",
      "You can choose PayPal, Revolut or bank transfer.",
      "",
      "Watermelon Experiences",
    ].join("\n");

    setSending(true);
    setFeedback("");

    try {
      const delivery = await sendViaCRM(text);
      setFeedback(
        delivery.mode === "template"
          ? "The WhatsApp 24-hour window is closed. The CRM sent the approved Watermelon template first and will send the secure payment link automatically when the customer replies."
          : "Secure payment link submitted from the CRM to WhatsApp."
      );

      await supabase.from("watermelon_activities").insert({
        request_id: request.id,
        contact_id: request.contact?.id || null,
        activity_type: "payment_link_sent",
        summary: "Secure payment link submitted from CRM",
        metadata: {
          proposal_id: latest.id,
          payment_link: paymentLink,
          mode: delivery.mode || "text",
        },
      });

      await onChanged();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "The payment link could not be submitted from the CRM."
      );
    } finally {
      setSending(false);
    }
  }

  async function markLatestPaid() {
    if (!latest || latest.status !== "accepted" || latest.payment_status === "paid") return;

    const methodInput = window.prompt(
      "Payment method: paypal, revolut or bank_transfer",
      latest.payment_method || ""
    );
    if (methodInput === null) return;

    const normalized = methodInput.trim().toLowerCase().replace(/[ -]+/g, "_");
    if (!["paypal", "revolut", "bank_transfer"].includes(normalized)) {
      setFeedback("Use paypal, revolut or bank_transfer as the payment method.");
      return;
    }

    const paymentReference = window.prompt(
      "Payment reference (optional)",
      latest.payment_reference || ""
    );
    if (paymentReference === null) return;

    setSending(true);
    setFeedback("");

    const { error } = await supabase.rpc("watermelon_mark_proposal_paid", {
      p_proposal_id: latest.id,
      p_method: normalized,
      p_reference: paymentReference.trim() || null,
    });

    if (error) {
      setFeedback(error.message);
      setSending(false);
      return;
    }

    await onChanged();
    setFeedback("Payment recorded and request confirmed.");
    setSending(false);
  }

  return (
    <section className="crm-proposal-editor">
      <button
        className="crm-proposal-toggle"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <strong>{latest ? "Edit / create proposal" : "Create proposal"}</strong>
          <small>{latestStatus}</small>
        </span>
        <b>{open ? "Close" : "Open"}</b>
      </button>

      {open && (
        <div className="crm-proposal-body" onChangeCapture={markChanged}>
          {latest && latest.status !== "draft" && (
            <div className="crm-proposal-current-actions">
              <a
                className="button button-ghost"
                href={
                  "/proposal/" +
                  encodeURIComponent(request.reference) +
                  "?token=" +
                  encodeURIComponent(latest.public_token)
                }
                target="_blank"
                rel="noreferrer"
              >
                Open current proposal
              </a>
              {latest.status !== "accepted" && (
                <button
                  className="button button-outline"
                  type="button"
                  onClick={() => void resendLatestProposal()}
                >
                  {sending ? "Sending…" : "Resend proposal from CRM"}
                </button>
              )}
              {latest.status === "accepted" &&
                latest.payment_status === "awaiting" &&
                latest.payment_token && (
                  <a
                    className="button button-outline"
                    href={
                      "/payment/" +
                      encodeURIComponent(request.reference) +
                      "?token=" +
                      encodeURIComponent(latest.payment_token)
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open payment page
                  </a>
                )}
            </div>
          )}

          {latest?.status === "accepted" && (
            <div className={"crm-proposal-payment-panel " + latest.payment_status}>
              <div>
                <strong>
                  {latest.payment_status === "paid"
                    ? "Payment received"
                    : "Proposal accepted — awaiting payment"}
                </strong>
                <span>
                  {latest.payment_status === "paid"
                    ? "The CRM request is confirmed."
                    : "The customer can now choose PayPal, Revolut or bank transfer from the secure payment page."}
                </span>
              </div>
              {latest.payment_status !== "paid" && (
                <div className="crm-proposal-payment-actions">
                  {latest.payment_token && (
                    <button
                      className="button button-outline"
                      type="button"
                      disabled={sending}
                      onClick={() => void sendPaymentLinkFromCRM()}
                    >
                      {sending ? "Sending…" : "Send payment link from CRM"}
                    </button>
                  )}
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={sending}
                    onClick={() => void markLatestPaid()}
                  >
                    Mark payment received
                  </button>
                </div>
              )}
            </div>
          )}

          {latest?.customer_response && latest.status === "changes_requested" && (
            <div className="crm-proposal-customer-response">
              <strong>Customer requested changes</strong>
              <span>{latest.customer_response}</span>
            </div>
          )}

          {!proposalLocked && (
            <>
          <p className="crm-proposal-feedback">
            Set your own Watermelon prices below. The catalogue price is only a starting point.
            Totals update as you type. Save changes to keep your prices.
          </p>
          {hasChanges && <p role="status">Unsaved changes — save your proposal before leaving.</p>}
          <div className="crm-proposal-head-fields">
            <label>
              <span>Valid until</span>
              <input
                type="date"
                value={validUntil}
                onChange={(event) => setValidUntil(event.target.value)}
              />
            </label>
            <label>
              <span>Discount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
              />
            </label>
            <label>
              <span>Extras / transport</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={extras}
                onChange={(event) => setExtras(event.target.value)}
              />
            </label>
          </div>

          <label className="crm-proposal-long-field">
            <span>Introduction</span>
            <textarea
              rows={2}
              value={introText}
              onChange={(event) => setIntroText(event.target.value)}
            />
          </label>

          <div className="crm-proposal-items">
            {items.map((item, index) => {
              const guests = Math.max(1, Number.parseInt(item.guests, 10) || 1);
              const lineTotal = numberValue(item.unit_price) * guests;

              return (
                <article className="crm-proposal-item" key={index}>
                  <div className="crm-proposal-item-title">
                    <span>{index + 1}</span>
                    <input
                      value={item.experience_title}
                      onChange={(event) =>
                        updateItem(index, { experience_title: event.target.value })
                      }
                    />
                  </div>

                  <div className="crm-proposal-item-grid">
                    <label>
                      <span>Option</span>
                      <input
                        value={item.option_name}
                        onChange={(event) =>
                          updateItem(index, { option_name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>Date</span>
                      <input
                        type="date"
                        value={item.proposed_date}
                        onChange={(event) =>
                          updateItem(index, { proposed_date: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>Time</span>
                      <input
                        value={item.proposed_time}
                        onChange={(event) =>
                          updateItem(index, { proposed_time: event.target.value })
                        }
                        placeholder="Flexible / 09:00"
                      />
                    </label>
                    <label>
                      <span>Guests</span>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={item.guests}
                        onChange={(event) =>
                          updateItem(index, { guests: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>Your price per person ({request.currency || "EUR"})</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Enter your price"
                        value={item.unit_price}
                        onChange={(event) =>
                          updateItem(index, { unit_price: event.target.value })
                        }
                      />
                    </label>
                    <div className="crm-proposal-line-total">
                      <span>Line total</span>
                      <strong>{money(lineTotal, request.currency)}</strong>
                    </div>
                    <label>
                      <span>Pickup / meeting place</span>
                      <input
                        value={item.pickup_location}
                        onChange={(event) =>
                          updateItem(index, { pickup_location: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>Notes / inclusions</span>
                      <input
                        value={item.notes}
                        onChange={(event) =>
                          updateItem(index, { notes: event.target.value })
                        }
                        placeholder="Private guide, transport, lunch, special conditions…"
                      />
                    </label>
                  </div>
                </article>
              );
            })}
          </div>

          <label className="crm-proposal-long-field">
            <span>Conditions</span>
            <textarea
              rows={3}
              value={conditionsText}
              onChange={(event) => setConditionsText(event.target.value)}
            />
          </label>

          <div className="crm-proposal-totals">
            <div><span>Subtotal</span><strong>{money(subtotal, request.currency)}</strong></div>
            <div><span>Discount</span><strong>- {money(numberValue(discount), request.currency)}</strong></div>
            <div><span>Extras</span><strong>{money(numberValue(extras), request.currency)}</strong></div>
            <div className="crm-proposal-grand-total">
              <span>Proposal total</span><strong>{money(total, request.currency)}</strong>
            </div>
          </div>

          <div className="crm-proposal-actions">
            <button
              className="button button-outline"
              type="button"
              disabled={saving || sending}
              onClick={() => void saveDraft()}
            >
              {saving ? "Saving…" : savedDraft ? "Save changes" : "Save draft"}
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={saving || sending || !items.length}
              onClick={() => void sendProposal()}
            >
              {sending ? "Sending from CRM…" : "Send proposal from CRM"}
            </button>
          </div>
          <p className="crm-proposal-send-note">
            Proposal delivery stays inside the CRM. If the WhatsApp 24-hour service window is closed, the CRM sends an approved template first and automatically sends the proposal after the customer replies.
          </p>
            </>
          )}

          {feedback && (
            <p className={feedback.toLowerCase().includes("could not") || feedback.toLowerCase().includes("not authorized") ? "admin-error" : "crm-proposal-feedback"}>
              {feedback}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
