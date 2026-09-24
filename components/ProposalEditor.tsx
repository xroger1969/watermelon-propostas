"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

  useEffect(() => {
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
    if (!items.length || saving) return null;

    setSaving(true);
    setFeedback("");

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

    setSaving(false);

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
    return saved;
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

    await onChanged();
    setFeedback("Proposal v" + row.version + " prepared.");

    if (phone) {
      window.location.href =
        "https://wa.me/" + phone + "?text=" + encodeURIComponent(lines.join("\n"));
    } else {
      try {
        await navigator.clipboard.writeText(link);
        setFeedback("Proposal link copied. This contact has no phone number.");
      } catch {
        setFeedback("Proposal prepared. This contact has no phone number.");
      }
    }

    setSending(false);
  }

  const latestStatus = latest
    ? "v" + latest.version + " · " + latest.status.replaceAll("_", " ")
    : "No proposal yet";

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
        <div className="crm-proposal-body">
          {latest?.customer_response && latest.status === "changes_requested" && (
            <div className="crm-proposal-customer-response">
              <strong>Customer requested changes</strong>
              <span>{latest.customer_response}</span>
            </div>
          )}

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
                      <span>Price per person</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
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

          {feedback && (
            <p className={feedback.toLowerCase().includes("could not") || feedback.toLowerCase().includes("not authorized") ? "admin-error" : "crm-proposal-feedback"}>
              {feedback}
            </p>
          )}

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
              {sending ? "Preparing proposal…" : "Send proposal on WhatsApp"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
