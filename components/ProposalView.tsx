"use client";

import { useEffect, useMemo, useState } from "react";

type ProposalItem = {
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

type ProposalData = {
  proposal_id: string;
  reference: string;
  version: number;
  status: "sent" | "accepted" | "changes_requested";
  is_expired: boolean;
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  valid_until: string | null;
  currency: string;
  intro_text: string | null;
  conditions_text: string | null;
  subtotal: number;
  discount_amount: number;
  extras_amount: number;
  total: number;
  customer_response: string | null;
  customer_name: string;
  items: ProposalItem[];
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "EUR",
  }).format(Number(value || 0));
}

function displayDate(value: string | null) {
  if (!value) return "To be agreed";
  const date = new Date(value + "T00:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default function ProposalView({
  reference,
  token,
}: {
  reference: string;
  token: string;
}) {
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [responding, setResponding] = useState(false);
  const [changeMessage, setChangeMessage] = useState("");
  const [showChanges, setShowChanges] = useState(false);

  const endpoint = useMemo(() => {
    const params = new URLSearchParams({ reference, token });
    return "/api/proposal?" + params.toString();
  }, [reference, token]);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = (await response.json()) as {
        proposal?: ProposalData;
        error?: string;
      };

      if (!response.ok || !data.proposal) {
        throw new Error(data.error || "We could not load this proposal.");
      }

      setProposal(data.proposal);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "We could not load this proposal."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [endpoint]);

  async function respond(action: "accept" | "request_changes") {
    if (responding) return;

    if (action === "request_changes" && !changeMessage.trim()) {
      setError("Please tell us what you would like to change.");
      return;
    }

    setResponding(true);
    setError("");

    try {
      const response = await fetch("/api/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference,
          token,
          action,
          message: action === "request_changes" ? changeMessage.trim() : "",
        }),
      });

      const data = (await response.json()) as { status?: string; error?: string };

      if (!response.ok || !data.status) {
        throw new Error(data.error || "We could not record your response.");
      }

      await load();
      setShowChanges(false);
    } catch (responseError) {
      setError(
        responseError instanceof Error
          ? responseError.message
          : "We could not record your response."
      );
    } finally {
      setResponding(false);
    }
  }

  if (loading) {
    return (
      <main className="customer-proposal-shell">
        <section className="customer-proposal-card customer-proposal-state">
          <div className="payment-spinner" />
          <h1>Loading your proposal…</h1>
        </section>
      </main>
    );
  }

  if (error && !proposal) {
    return (
      <main className="customer-proposal-shell">
        <section className="customer-proposal-card customer-proposal-state">
          <p className="eyebrow dark">WATERMELON EXPERIENCES</p>
          <h1>Proposal unavailable</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!proposal) return null;

  const accepted = proposal.status === "accepted";
  const changesRequested = proposal.status === "changes_requested";
  const expired = Boolean(proposal.is_expired);

  return (
    <main className="customer-proposal-shell">
      <section className="customer-proposal-card">
        <header className="customer-proposal-header">
          <div>
            <p className="eyebrow dark">PERSONALIZED PROPOSAL</p>
            <h1>Hello {proposal.customer_name}</h1>
            <p>{proposal.intro_text || "Your Watermelon proposal is ready."}</p>
          </div>
          <div className={"customer-proposal-status " + proposal.status}>
            {accepted
              ? "Accepted"
              : expired
                ? "Expired"
                : changesRequested
                  ? "Changes requested"
                  : "Ready for review"}
          </div>
        </header>

        <div className="customer-proposal-meta">
          <div><span>Reference</span><strong>{proposal.reference}</strong></div>
          <div><span>Version</span><strong>v{proposal.version}</strong></div>
          <div><span>Valid until</span><strong>{displayDate(proposal.valid_until)}</strong></div>
        </div>

        <div className="customer-proposal-items">
          {proposal.items.map((item, index) => (
            <article key={item.id} className="customer-proposal-item">
              <div className="customer-proposal-item-head">
                <div>
                  <span>{index + 1}</span>
                  <h2>{item.experience_title}</h2>
                </div>
                <strong>{money(item.line_total, proposal.currency)}</strong>
              </div>

              <div className="customer-proposal-item-grid">
                <div><span>Date</span><strong>{displayDate(item.proposed_date)}</strong></div>
                <div><span>Time</span><strong>{item.proposed_time || "Flexible"}</strong></div>
                <div><span>Guests</span><strong>{item.guests}</strong></div>
                <div><span>Price per person</span><strong>{money(item.unit_price, proposal.currency)}</strong></div>
              </div>

              {item.option_name && <p><strong>Option:</strong> {item.option_name}</p>}
              {item.pickup_location && <p><strong>Pickup / meeting place:</strong> {item.pickup_location}</p>}
              {item.notes && <p><strong>Notes:</strong> {item.notes}</p>}
            </article>
          ))}
        </div>

        <section className="customer-proposal-total">
          <div><span>Subtotal</span><strong>{money(proposal.subtotal, proposal.currency)}</strong></div>
          {Number(proposal.discount_amount) > 0 && (
            <div><span>Discount</span><strong>- {money(proposal.discount_amount, proposal.currency)}</strong></div>
          )}
          {Number(proposal.extras_amount) > 0 && (
            <div><span>Extras / transport</span><strong>{money(proposal.extras_amount, proposal.currency)}</strong></div>
          )}
          <div className="customer-proposal-grand-total">
            <span>Total</span>
            <strong>{money(proposal.total, proposal.currency)}</strong>
          </div>
        </section>

        {proposal.conditions_text && (
          <section className="customer-proposal-conditions">
            <h2>Conditions</h2>
            <p>{proposal.conditions_text}</p>
          </section>
        )}

        {accepted ? (
          <section className="customer-proposal-result accepted">
            <strong>Thank you — proposal accepted.</strong>
            <span>
              Watermelon has been notified. We will confirm the remaining booking details and payment instructions with you.
            </span>
          </section>
        ) : expired ? (
          <section className="customer-proposal-result changes">
            <strong>This proposal has expired.</strong>
            <span>Please contact Watermelon so we can confirm current availability and prepare an updated proposal.</span>
          </section>
        ) : changesRequested ? (
          <section className="customer-proposal-result changes">
            <strong>Your change request has been sent.</strong>
            {proposal.customer_response && <span>{proposal.customer_response}</span>}
            <span>Watermelon will review it and send you an updated proposal.</span>
          </section>
        ) : (
          <section className="customer-proposal-response">
            {error && <p className="booking-send-error">{error}</p>}

            {!showChanges ? (
              <div className="customer-proposal-actions">
                <button
                  className="button button-primary"
                  type="button"
                  disabled={responding}
                  onClick={() => void respond("accept")}
                >
                  {responding ? "Saving…" : "Accept proposal"}
                </button>
                <button
                  className="button button-outline"
                  type="button"
                  disabled={responding}
                  onClick={() => setShowChanges(true)}
                >
                  Request changes
                </button>
              </div>
            ) : (
              <div className="customer-proposal-change-form">
                <label>
                  <span>What would you like us to change?</span>
                  <textarea
                    rows={4}
                    value={changeMessage}
                    onChange={(event) => setChangeMessage(event.target.value)}
                    placeholder="Tell us the preferred date, time, price adjustment or any other change."
                  />
                </label>
                <div>
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={responding || !changeMessage.trim()}
                    onClick={() => void respond("request_changes")}
                  >
                    {responding ? "Sending…" : "Send change request"}
                  </button>
                  <button
                    className="button button-ghost"
                    type="button"
                    disabled={responding}
                    onClick={() => setShowChanges(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <footer className="customer-proposal-footer">
          <strong>Watermelon Experiences</strong>
          <span>Personalized experiences in Portugal.</span>
        </footer>
      </section>
    </main>
  );
}
