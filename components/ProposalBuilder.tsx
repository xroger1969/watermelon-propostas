"use client";

import { useEffect, useMemo, useState } from "react";

type ProposalItem = {
  code: string;
  title: string;
  optionCode: string;
  optionName: string;
  price: string;
  notes: string;
};

type ClientData = {
  name: string;
  email: string;
  phone: string;
  date: string;
  people: string;
  notes: string;
};

const STORAGE_KEY = "watermelon-proposal";

function money(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(value);
}

export default function ProposalBuilder() {
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [client, setClient] = useState<ClientData>({
    name: "",
    email: "",
    phone: "",
    date: "",
    people: "",
    notes: "",
  });

  useEffect(() => {
    try {
      setItems(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
    } catch {
      setItems([]);
    }
  }, []);

  function persist(next: ProposalItem[]) {
    setItems(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function updateItem(index: number, patch: Partial<ProposalItem>) {
    persist(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeItem(index: number) {
    persist(items.filter((_, i) => i !== index));
  }

  const total = useMemo(() => {
    const guests = Math.max(1, Number.parseInt(client.people, 10) || 1);
    const pricePerGuest = items.reduce(
      (sum, item) => sum + (Number.parseFloat(item.price.replace(",", ".")) || 0),
      0
    );

    return pricePerGuest * guests;
  }, [items, client.people]);

  function proposalText() {
    const lines = [
      "WATERMELON EXPERIENCES",
      "PERSONALIZED PROPOSAL REQUEST",
      "",
      client.name ? "Name: " + client.name : "",
      client.email ? "Email: " + client.email : "",
      client.phone ? "Phone: " + client.phone : "",
      client.date ? "Date: " + client.date : "",
      client.people ? "Guests: " + client.people : "",
      "",
      ...items.flatMap((item, index) => [
        (index + 1) + ". " + item.title,
        item.optionName ? "   Option: " + item.optionName : "",
        item.price ? "   Price: " + money(Number.parseFloat(item.price.replace(",", ".")) || 0) : "   Price: on request",
        item.notes ? "   Request: " + item.notes : "",
        "",
      ]),
      "Total: " + money(total),
      client.notes ? "" : "",
      client.notes ? "Additional information: " + client.notes : "",
      "",
      "Watermelon Experiences",
    ].filter(Boolean);
    return lines.join("\n");
  }

  function shareWhatsApp() {
    const url = "https://wa.me/351918404101?text=" + encodeURIComponent("Hello Watermelon Experiences,\n\nI would like to request a personalized proposal.\n\n" + proposalText());
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function clearProposal() {
    if (!window.confirm("Remove all experiences from this proposal?")) return;
    persist([]);
  }

  return (
    <section className="proposal-shell">
      <div className="proposal-form">
        <div className="proposal-block">
          <div className="block-title">
            <span>1</span>
            <div>
              <h2>Your details</h2>
              <p>Tell us how to contact you and when you would like to travel.</p>
            </div>
          </div>
          <div className="form-grid">
            <label><span>Name</span><input value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} placeholder="Your name" /></label>
            <label><span>Email</span><input type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} placeholder="you@email.com" /></label>
            <label><span>Phone</span><input value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} placeholder="+351 …" /></label>
            <label><span>Preferred date</span><input type="date" value={client.date} onChange={(e) => setClient({ ...client, date: e.target.value })} /></label>
            <label><span>Number of guests</span><input type="number" min="1" step="1" inputMode="numeric" value={client.people} onChange={(e) => setClient({ ...client, people: e.target.value })} placeholder="E.g. 4" /></label>
          </div>
        </div>

        <div className="proposal-block">
          <div className="block-title">
            <span>2</span>
            <div>
              <h2>Experiences</h2>
              <p>Review your selected experiences and add any special requests if needed.</p>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="proposal-empty">
              <h3>Your proposal is still empty.</h3>
              <p>Browse our experiences and add the ones you would like to include.</p>
              <a className="button button-primary" href="/#experiencias">Choose experiences</a>
            </div>
          ) : (
            <div className="proposal-items">
              {items.map((item, index) => (
                <article className="proposal-item" key={item.code + "-" + item.optionCode + "-" + index}>
                  <div className="proposal-item-head">
                    <div>
                      <span className="code-pill">{item.code}</span>
                      <h3>{item.title}</h3>
                      <p>{item.optionName}</p>
                    </div>
                    <button className="remove-button" onClick={() => removeItem(index)} type="button">Remove</button>
                  </div>
                  <div className="proposal-item-fields">
                    <div className="proposal-price-display">
                      <span>From</span>
                      <strong>{item.price ? money(Number.parseFloat(item.price.replace(",", ".")) || 0) : "On request"}</strong>
                    </div>
                    <label className="grow">
                      <span>Special request</span>
                      <input
                        value={item.notes}
                        onChange={(e) => updateItem(index, { notes: e.target.value })}
                        placeholder="E.g. hotel pickup, preferred time…"
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="proposal-block">
          <div className="block-title">
            <span>3</span>
            <div>
              <h2>Additional information</h2>
              <p>Tell us anything that may help us tailor your proposal.</p>
            </div>
          </div>
          <label className="full-field">
            <textarea
              rows={4}
              value={client.notes}
              onChange={(e) => setClient({ ...client, notes: e.target.value })}
              placeholder="E.g. children in the group, reduced mobility, preferred time, special celebration…"
            />
          </label>
        </div>
      </div>

      <aside className="proposal-summary">
        <div className="summary-card">
          <p className="eyebrow dark">SUMMARY</p>
          <h2>{client.name || "New proposal"}</h2>
          <div className="summary-list">
            <div><span>Experiences</span><strong>{items.length}</strong></div>
            <div><span>Guests</span><strong>{client.people || "—"}</strong></div>
            <div><span>Date</span><strong>{client.date || "—"}</strong></div>
          </div>
          <div className="summary-total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
          <div className="direct-proposal-note"><strong>Request your proposal directly from Watermelon.</strong><span>We can tailor the experience to your group, preferred date and selected activities, subject to availability.</span></div>
          <p className="summary-hint">Prices shown are a guide. Your final proposal will be confirmed by Watermelon Experiences.</p>
          <div className="proposal-contact-cta"><strong>Ready to plan your experience?</strong><span>Send us your request on WhatsApp. Our team will review it personally and get back to you.</span></div>
          <button className="button button-primary wide" type="button" onClick={shareWhatsApp} disabled={!items.length}>
            Send my request to Watermelon
          </button>
          <button className="button button-outline wide" type="button" onClick={() => window.print()} disabled={!items.length}>
            Print / Save PDF
          </button>
          <a className="button button-ghost wide" href="/#experiencias">Add more experiences</a>
          {items.length > 0 && <button className="clear-link" type="button" onClick={clearProposal}>Start again</button>}
        </div>
      </aside>

      <section className="print-proposal">
        <div className="print-brand">Watermelon Experiences</div>
        <h1>Personalized proposal</h1>
        <div className="print-client">
          <p><strong>Guest:</strong> {client.name || "—"}</p>
          <p><strong>Email:</strong> {client.email || "—"}</p>
          <p><strong>Phone:</strong> {client.phone || "—"}</p>
          <p><strong>Date:</strong> {client.date || "—"}</p>
          <p><strong>Guests:</strong> {client.people || "—"}</p>
        </div>
        {items.map((item, index) => (
          <div className="print-item" key={"print-" + item.code + "-" + index}>
            <span>{item.code}</span>
            <h3>{index + 1}. {item.title}</h3>
            <p>{item.optionName}</p>
            <p>{item.notes}</p>
            <strong>{item.price ? money(Number.parseFloat(item.price.replace(",", ".")) || 0) : "On request"}</strong>
          </div>
        ))}
        <div className="print-total"><span>Total</span><strong>{money(total)}</strong></div>
        {client.notes && <div className="print-notes"><strong>Additional information</strong><p>{client.notes}</p></div>}
      </section>
    </section>
  );
}
