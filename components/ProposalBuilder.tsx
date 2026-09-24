"use client";

import { useEffect, useMemo, useState } from "react";

type ProposalItem = {
  code: string;
  title: string;
  optionCode: string;
  optionName: string;
  price: string;
  notes: string;
  date: string;
  guests: string;
  preferredTime: string;
  specificTime: string;
  dateFlexibility: string;
  pickupLocation: string;
  language: string;
  childrenAges: string;
  accessibility: string;
  dietary: string;
  occasion: string;
};

type ClientData = {
  name: string;
  email: string;
  phone: string;
  notes: string;
};

const STORAGE_KEY = "watermelon-proposal";

function money(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(value);
}

function displayDate(value: string) {
  if (!value) return "";
  const date = new Date(value + "T00:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function normalizeItem(item: Partial<ProposalItem>): ProposalItem {
  return {
    code: item.code || "",
    title: item.title || "",
    optionCode: item.optionCode || "",
    optionName: item.optionName || "",
    price: item.price || "",
    notes: item.notes || "",
    date: item.date || "",
    guests: item.guests || "1",
    preferredTime: item.preferredTime || "Flexible",
    specificTime: item.specificTime || "",
    dateFlexibility: item.dateFlexibility || "Exact date",
    pickupLocation: item.pickupLocation || "",
    language: item.language || "English",
    childrenAges: item.childrenAges || "",
    accessibility: item.accessibility || "",
    dietary: item.dietary || "",
    occasion: item.occasion || "",
  };
}

function unitPrice(item: ProposalItem) {
  return Number.parseFloat(item.price.replace(",", ".")) || 0;
}

function itemGuests(item: ProposalItem) {
  return Math.max(1, Number.parseInt(item.guests, 10) || 1);
}

function itemSubtotal(item: ProposalItem) {
  return unitPrice(item) * itemGuests(item);
}

function timeLabel(item: ProposalItem) {
  if (item.preferredTime === "Specific time" && item.specificTime) {
    return item.specificTime;
  }
  return item.preferredTime || "Flexible";
}

export default function ProposalBuilder() {
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [client, setClient] = useState<ClientData>({
    name: "",
    email: "",
    phone: "",
    notes: "",
  });

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as Partial<ProposalItem>[];
      setItems(Array.isArray(parsed) ? parsed.map((item) => normalizeItem(item)) : []);
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

  const total = useMemo(() => items.reduce((sum, item) => sum + itemSubtotal(item), 0), [items]);

  function proposalText() {
    const lines = [
      "WATERMELON EXPERIENCES",
      "PERSONALIZED PROPOSAL REQUEST",
      "",
      client.name ? "Name: " + client.name : "",
      client.email ? "Email: " + client.email : "",
      client.phone ? "Phone: " + client.phone : "",
      "",
      ...items.flatMap((item, index) => {
        const base = unitPrice(item);
        const subtotal = itemSubtotal(item);
        return [
          (index + 1) + ". " + item.title,
          item.optionName ? "   Option: " + item.optionName : "",
          item.date ? "   Date: " + displayDate(item.date) : "   Date: not selected",
          "   Guests: " + itemGuests(item),
          "   Preferred time: " + timeLabel(item),
          "   Date flexibility: " + item.dateFlexibility,
          item.pickupLocation ? "   Pickup / meeting place: " + item.pickupLocation : "",
          item.language ? "   Preferred language: " + item.language : "",
          item.childrenAges ? "   Children / ages: " + item.childrenAges : "",
          item.accessibility ? "   Accessibility / mobility: " + item.accessibility : "",
          item.dietary ? "   Dietary requirements: " + item.dietary : "",
          item.occasion ? "   Special occasion: " + item.occasion : "",
          base ? "   Guide price: " + money(base) + " per person × " + itemGuests(item) + " = " + money(subtotal) : "   Price: on request",
          item.notes ? "   Special request: " + item.notes : "",
          "",
        ];
      }),
      "Estimated total: " + money(total),
      client.notes ? "" : "",
      client.notes ? "Additional information: " + client.notes : "",
      "",
      "Prices are a guide and remain subject to date, availability and final confirmation.",
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
              <p>Tell us how to contact you.</p>
            </div>
          </div>
          <div className="form-grid">
            <label><span>Name</span><input value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} placeholder="Your name" /></label>
            <label><span>Email</span><input type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} placeholder="you@email.com" /></label>
            <label><span>Phone</span><input value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} placeholder="+351 …" /></label>
          </div>
        </div>

        <div className="proposal-block">
          <div className="block-title">
            <span>2</span>
            <div>
              <h2>Experiences</h2>
              <p>Set the date, group size and preferences separately for every experience.</p>
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
              {items.map((item, index) => {
                const base = unitPrice(item);
                const guests = itemGuests(item);
                const subtotal = itemSubtotal(item);

                return (
                  <article className="proposal-item" key={item.code + "-" + item.optionCode + "-" + index}>
                    <div className="proposal-item-head">
                      <div>
                        <span className="code-pill">{item.code}</span>
                        <h3>{item.title}</h3>
                        <p>{item.optionName}</p>
                      </div>
                      <button className="remove-button" onClick={() => removeItem(index)} type="button">Remove</button>
                    </div>

                    <div className="proposal-planning-grid">
                      <label>
                        <span>Preferred date</span>
                        <input type="date" value={item.date} onChange={(e) => updateItem(index, { date: e.target.value })} />
                      </label>
                      <label>
                        <span>Guests</span>
                        <input type="number" min="1" step="1" inputMode="numeric" value={item.guests} onChange={(e) => updateItem(index, { guests: e.target.value })} />
                      </label>
                      <label>
                        <span>Preferred time</span>
                        <select value={item.preferredTime} onChange={(e) => updateItem(index, { preferredTime: e.target.value })}>
                          <option>Flexible</option>
                          <option>Morning</option>
                          <option>Afternoon</option>
                          <option>Evening</option>
                          <option>Specific time</option>
                        </select>
                      </label>
                      {item.preferredTime === "Specific time" && (
                        <label>
                          <span>Specific time</span>
                          <input type="time" value={item.specificTime} onChange={(e) => updateItem(index, { specificTime: e.target.value })} />
                        </label>
                      )}
                      <label>
                        <span>Date flexibility</span>
                        <select value={item.dateFlexibility} onChange={(e) => updateItem(index, { dateFlexibility: e.target.value })}>
                          <option>Exact date</option>
                          <option>±1 day</option>
                          <option>±2 days</option>
                          <option>Flexible</option>
                        </select>
                      </label>
                      <label>
                        <span>Pickup / meeting place</span>
                        <input value={item.pickupLocation} onChange={(e) => updateItem(index, { pickupLocation: e.target.value })} placeholder="Hotel, address, cruise terminal…" />
                      </label>
                      <label>
                        <span>Preferred guide language</span>
                        <select value={item.language} onChange={(e) => updateItem(index, { language: e.target.value })}>
                          <option>English</option>
                          <option>Portuguese</option>
                          <option>Spanish</option>
                          <option>French</option>
                          <option>Other</option>
                        </select>
                      </label>
                    </div>

                    <div className="proposal-financial-row">
                      <div className="proposal-price-breakdown">
                        <span>Estimated subtotal</span>
                        <strong>{base ? money(subtotal) : "On request"}</strong>
                        <small>{base ? money(base) + " per person × " + guests + " guests" : "Final price to be confirmed"}</small>
                      </div>
                      <label>
                        <span>Special request</span>
                        <input
                          value={item.notes}
                          onChange={(e) => updateItem(index, { notes: e.target.value })}
                          placeholder="Anything specific for this experience?"
                        />
                      </label>
                    </div>

                    <details className="proposal-more">
                      <summary>More preferences</summary>
                      <div className="proposal-extra-grid">
                        <label>
                          <span>Children / ages</span>
                          <input value={item.childrenAges} onChange={(e) => updateItem(index, { childrenAges: e.target.value })} placeholder="E.g. ages 6 and 10" />
                        </label>
                        <label>
                          <span>Accessibility / mobility</span>
                          <input value={item.accessibility} onChange={(e) => updateItem(index, { accessibility: e.target.value })} placeholder="Any mobility needs?" />
                        </label>
                        <label>
                          <span>Dietary requirements</span>
                          <input value={item.dietary} onChange={(e) => updateItem(index, { dietary: e.target.value })} placeholder="If meals are included" />
                        </label>
                        <label>
                          <span>Special occasion</span>
                          <input value={item.occasion} onChange={(e) => updateItem(index, { occasion: e.target.value })} placeholder="Birthday, anniversary…" />
                        </label>
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="proposal-block">
          <div className="block-title">
            <span>3</span>
            <div>
              <h2>Additional information</h2>
              <p>Add anything that applies to the overall trip or proposal.</p>
            </div>
          </div>
          <label className="full-field">
            <textarea
              rows={4}
              value={client.notes}
              onChange={(e) => setClient({ ...client, notes: e.target.value })}
              placeholder="E.g. preferred pace, transport needs, group context, general requests…"
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
          </div>

          {items.length > 0 && (
            <div className="summary-experiences">
              {items.map((item, index) => (
                <div className="summary-experience" key={"summary-" + item.code + "-" + index}>
                  <div>
                    <strong>{index + 1}. {item.title}</strong>
                    <span>
                      {item.date ? displayDate(item.date) : "Date not selected"} · {itemGuests(item)} guest{itemGuests(item) === 1 ? "" : "s"} · {timeLabel(item)}
                    </span>
                  </div>
                  <b>{unitPrice(item) ? money(itemSubtotal(item)) : "Quote"}</b>
                </div>
              ))}
            </div>
          )}

          <div className="summary-total">
            <span>Estimated total</span>
            <strong>{money(total)}</strong>
          </div>
          <div className="direct-proposal-note"><strong>Request your proposal directly from Watermelon.</strong><span>Each experience can have its own date, group size, time and preferences.</span></div>
          <p className="summary-hint">Prices shown are a guide. Availability, date, participant ages and selected options may affect the final price.</p>
          <div className="proposal-contact-cta"><strong>Ready to plan your experience?</strong><span>Send us your request on WhatsApp. Our team will review it personally and confirm the final proposal.</span></div>
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
        </div>
        {items.map((item, index) => (
          <div className="print-item" key={"print-" + item.code + "-" + index}>
            <span>{item.code}</span>
            <h3>{index + 1}. {item.title}</h3>
            <p>{item.optionName}</p>
            <p><strong>Date:</strong> {item.date ? displayDate(item.date) : "Not selected"}</p>
            <p><strong>Guests:</strong> {itemGuests(item)}</p>
            <p><strong>Time:</strong> {timeLabel(item)} · <strong>Flexibility:</strong> {item.dateFlexibility}</p>
            {item.pickupLocation && <p><strong>Pickup / meeting place:</strong> {item.pickupLocation}</p>}
            {item.language && <p><strong>Language:</strong> {item.language}</p>}
            {item.childrenAges && <p><strong>Children / ages:</strong> {item.childrenAges}</p>}
            {item.accessibility && <p><strong>Accessibility:</strong> {item.accessibility}</p>}
            {item.dietary && <p><strong>Dietary:</strong> {item.dietary}</p>}
            {item.occasion && <p><strong>Occasion:</strong> {item.occasion}</p>}
            {item.notes && <p><strong>Special request:</strong> {item.notes}</p>}
            <strong>{unitPrice(item) ? money(itemSubtotal(item)) : "On request"}</strong>
          </div>
        ))}
        <div className="print-total"><span>Estimated total</span><strong>{money(total)}</strong></div>
        {client.notes && <div className="print-notes"><strong>Additional information</strong><p>{client.notes}</p></div>}
      </section>
    </section>
  );
}
