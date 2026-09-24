"use client";

import { useEffect, useMemo, useState } from "react";

type BookingSelection = {
  code: string;
  title: string;
  optionCode: string;
  optionName: string;
  options: Array<{
    optionCode: string;
    optionName: string;
    optionDescription?: string;
  }>;
  price: string;
  currency: string;
  image: string;
  duration: string;
  location: string;
};

type BookingForm = {
  name: string;
  email: string;
  phone: string;
  date: string;
  guests: string;
  optionCode: string;
  preferredTime: string;
  specificTime: string;
  pickupLocation: string;
  language: string;
  notes: string;
};

const STORAGE_KEY = "watermelon-booking-request";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function displayDate(value: string) {
  if (!value) return "Not selected";
  const date = new Date(value + "T00:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function referenceCode() {
  const now = new Date();
  const date = [
    String(now.getFullYear()).slice(-2),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = now.getTime().toString(36).slice(-5).toUpperCase();
  return "WM-" + date + "-" + suffix;
}

export default function BookingRequest() {
  const [selection, setSelection] = useState<BookingSelection | null>(null);
  const [form, setForm] = useState<BookingForm>({
    name: "",
    email: "",
    phone: "",
    date: "",
    guests: "2",
    optionCode: "",
    preferredTime: "Flexible",
    specificTime: "",
    pickupLocation: "",
    language: "English",
    notes: "",
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as BookingSelection;
      setSelection(parsed);
      setForm((current) => ({
        ...current,
        optionCode: parsed.optionCode || parsed.options?.[0]?.optionCode || "DEFAULT",
      }));
    } catch {
      setSelection(null);
    }
  }, []);

  const selectedOption = useMemo(() => {
    if (!selection) return null;
    return selection.options.find((option) => option.optionCode === form.optionCode) || selection.options[0] || null;
  }, [selection, form.optionCode]);

  const unitPrice = Number.parseFloat(selection?.price || "") || 0;
  const guests = Math.max(1, Number.parseInt(form.guests, 10) || 1);
  const estimatedTotal = unitPrice * guests;

  const canSend = Boolean(
    selection &&
    form.name.trim() &&
    form.phone.trim() &&
    form.date &&
    guests > 0
  );

  function sendRequest() {
    if (!selection || !canSend) return;

    const reference = referenceCode();
    const time =
      form.preferredTime === "Specific time" && form.specificTime
        ? form.specificTime
        : form.preferredTime;

    const lines = [
      "WATERMELON EXPERIENCES",
      "DIRECT BOOKING REQUEST — PENDING",
      "Reference: " + reference,
      "Status: PENDING — awaiting Watermelon confirmation",
      "",
      "IMPORTANT: This is a booking request, not a confirmed reservation.",
      "",
      "Experience: " + selection.title,
      "Code: " + selection.code,
      selectedOption ? "Option: " + selectedOption.optionName : "",
      "Date: " + displayDate(form.date),
      "Guests: " + guests,
      "Preferred time: " + time,
      form.pickupLocation ? "Pickup / meeting place: " + form.pickupLocation : "",
      form.language ? "Preferred language: " + form.language : "",
      "",
      "Guest: " + form.name.trim(),
      form.email.trim() ? "Email: " + form.email.trim() : "",
      "Phone: " + form.phone.trim(),
      form.notes.trim() ? "Notes: " + form.notes.trim() : "",
      "",
      unitPrice
        ? "Guide price: " + money(unitPrice, selection.currency) + " per person × " + guests + " = " + money(estimatedTotal, selection.currency)
        : "Price: to be confirmed",
      "",
      "Please confirm availability before I consider this booking confirmed.",
    ].filter(Boolean);

    const url =
      "https://wa.me/351918404101?text=" +
      encodeURIComponent("Hello Watermelon Experiences,\n\n" + lines.join("\n"));

    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (!selection) {
    return (
      <section className="proposal-shell booking-request-shell">
        <div className="proposal-form">
          <div className="proposal-block proposal-empty">
            <p className="eyebrow dark">DIRECT BOOKING</p>
            <h2>Choose an experience first.</h2>
            <p>Select an experience from our collection and then request your preferred date.</p>
            <a className="button button-primary" href="/#experiencias">Explore experiences</a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="proposal-shell booking-request-shell">
      <div className="proposal-form">
        <div className="proposal-block booking-selected-experience">
          <div className="booking-selected-grid">
            <img src={selection.image || "/logo-full.jpg"} alt={selection.title} />
            <div>
              <p className="eyebrow dark">DIRECT BOOKING REQUEST</p>
              <span className="code-pill">{selection.code}</span>
              <h2>{selection.title}</h2>
              <p>{selection.location} · {selection.duration}</p>
              <div className="booking-status-note">
                <strong>Availability is confirmed manually.</strong>
                <span>You send the request now. Watermelon checks availability and only then confirms the booking.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="proposal-block">
          <div className="block-title">
            <span>1</span>
            <div>
              <h2>Experience details</h2>
              <p>Tell us when you would like to go and which option you prefer.</p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              <span>Date</span>
              <input
                type="date"
                required
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
              />
            </label>

            <label>
              <span>Number of guests</span>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={form.guests}
                onChange={(event) => setForm({ ...form, guests: event.target.value })}
              />
            </label>

            <label>
              <span>Experience option</span>
              <select
                value={form.optionCode}
                onChange={(event) => setForm({ ...form, optionCode: event.target.value })}
              >
                {selection.options.map((option) => (
                  <option key={option.optionCode} value={option.optionCode}>
                    {option.optionName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Preferred time</span>
              <select
                value={form.preferredTime}
                onChange={(event) => setForm({ ...form, preferredTime: event.target.value })}
              >
                <option>Flexible</option>
                <option>Morning</option>
                <option>Afternoon</option>
                <option>Specific time</option>
              </select>
            </label>

            {form.preferredTime === "Specific time" && (
              <label>
                <span>Preferred start time</span>
                <input
                  type="time"
                  value={form.specificTime}
                  onChange={(event) => setForm({ ...form, specificTime: event.target.value })}
                />
              </label>
            )}

            <label>
              <span>Pickup / meeting place</span>
              <input
                value={form.pickupLocation}
                onChange={(event) => setForm({ ...form, pickupLocation: event.target.value })}
                placeholder="Hotel, address or preferred meeting point"
              />
            </label>

            <label>
              <span>Preferred language</span>
              <select
                value={form.language}
                onChange={(event) => setForm({ ...form, language: event.target.value })}
              >
                <option>English</option>
                <option>Portuguese</option>
                <option>Spanish</option>
                <option>French</option>
              </select>
            </label>
          </div>

          {selectedOption?.optionDescription && (
            <p className="booking-option-note">{selectedOption.optionDescription}</p>
          )}
        </div>

        <div className="proposal-block">
          <div className="block-title">
            <span>2</span>
            <div>
              <h2>Your details</h2>
              <p>We use these details only to answer and confirm your request.</p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              <span>Name</span>
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Your name"
              />
            </label>
            <label>
              <span>Phone / WhatsApp</span>
              <input
                required
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="+351 …"
              />
            </label>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="you@email.com"
              />
            </label>
          </div>

          <label className="full-field">
            <span>Special requests or useful information</span>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Children, mobility, dietary needs, celebration, timing constraints…"
            />
          </label>
        </div>
      </div>

      <aside className="proposal-summary">
        <div className="summary-card booking-summary-card">
          <p className="eyebrow dark">BOOKING REQUEST</p>
          <h2>{selection.title}</h2>

          <div className="summary-list">
            <div><span>Date</span><strong>{form.date ? displayDate(form.date) : "—"}</strong></div>
            <div><span>Guests</span><strong>{guests}</strong></div>
            <div><span>Option</span><strong>{selectedOption?.optionName || "Standard"}</strong></div>
          </div>

          <div className="summary-total">
            <span>Guide total</span>
            <strong>{unitPrice ? money(estimatedTotal, selection.currency) : "On request"}</strong>
          </div>

          <div className="direct-proposal-note booking-pending-note">
            <strong>Not confirmed yet</strong>
            <span>After receiving your request, Watermelon checks availability and replies to confirm or suggest an alternative.</span>
          </div>

          <button
            className="button button-primary wide"
            type="button"
            onClick={sendRequest}
            disabled={!canSend}
          >
            Send booking request on WhatsApp
          </button>

          <a className="button button-ghost wide" href="/#experiencias">
            Choose another experience
          </a>

          <p className="summary-hint">
            No payment is taken at this stage. A booking only becomes confirmed after Watermelon accepts it.
          </p>
        </div>
      </aside>
    </section>
  );
}
