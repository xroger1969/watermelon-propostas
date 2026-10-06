"use client";

import { trackLeadConversion } from "@/lib/marketing";

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
  originalPrice?: string;
  promotionLabel?: string;
  websitePromotion?: boolean;
  currency: string;
  image: string;
  duration: string;
  location: string;
  description?: string;
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

type LiveExperienceDetails = {
  code?: string;
  description?: string;
  inclusions?: string[];
  exclusions?: string[];
  meetingPoint?: string;
  pickup?: string;
  languages?: string[];
  cancellation?: {
    type?: "STANDARD" | "CUSTOM" | "ALL_SALES_FINAL";
    description?: string;
    freeCancellation?: boolean;
    cancelIfBadWeather?: boolean;
    cancelIfInsufficientTravelers?: boolean;
  };
  additionalInfo?: string[];
  itinerary?: Array<{
    title: string;
    description?: string;
    duration?: string;
    passByWithoutStopping?: boolean;
  }>;
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

export default function BookingRequest() {
  const [selection, setSelection] = useState<BookingSelection | null>(null);
  const [experienceDetails, setExperienceDetails] = useState<LiveExperienceDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
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

  useEffect(() => {
    if (!selection?.code) return;

    let cancelled = false;
    setDetailsLoading(true);

    fetch(`/api/viator-product?code=${encodeURIComponent(selection.code)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!cancelled && data) setExperienceDetails(data as LiveExperienceDetails);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDetailsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selection?.code]);

  const selectedOption = useMemo(() => {
    if (!selection) return null;
    return selection.options.find((option) => option.optionCode === form.optionCode) || selection.options[0] || null;
  }, [selection, form.optionCode]);

  const unitPrice = Number.parseFloat(selection?.price || "") || 0;
  const originalUnitPrice = Number.parseFloat(selection?.originalPrice || "") || 0;
  const websitePromotion = Boolean(
    selection?.websitePromotion && originalUnitPrice > unitPrice && unitPrice > 0
  );
  const guests = Math.max(1, Number.parseInt(form.guests, 10) || 1);
  const estimatedTotal = unitPrice * guests;
  const originalEstimatedTotal = originalUnitPrice * guests;

  const canSend = Boolean(
    selection &&
    form.name.trim() &&
    form.phone.trim() &&
    form.date &&
    guests > 0
  );

  async function sendRequest() {
    if (!selection || !canSend || sending) return;

    setSending(true);
    setSendError("");

    const time =
      form.preferredTime === "Specific time" && form.specificTime
        ? form.specificTime
        : form.preferredTime;

    try {
      const response = await fetch("/api/booking-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productCode: selection.code,
          experienceTitle: selection.title,
          optionCode: selectedOption?.optionCode || selection.optionCode || "DEFAULT",
          optionName: selectedOption?.optionName || selection.optionName || "Standard option",
          requestedDate: form.date,
          preferredTime: time,
          guests,
          unitPrice: unitPrice || null,
          currency: selection.currency || "EUR",
          customerName: form.name.trim(),
          customerEmail: form.email.trim(),
          customerPhone: form.phone.trim(),
          pickupLocation: form.pickupLocation.trim(),
          language: form.language,
          customerNotes: form.notes.trim(),
        }),
      });

      const data = (await response.json()) as { reference?: string; error?: string };

      if (!response.ok || !data.reference) {
        throw new Error(data.error || "We could not save your booking request.");
      }

      await trackLeadConversion("booking_request", estimatedTotal || undefined);

      const lines = [
        "WATERMELON EXPERIENCES",
        "DIRECT BOOKING REQUEST — PENDING",
        "Reference: " + data.reference,
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
        websitePromotion
          ? (selection.promotionLabel || "Website offer") +
            ": Before " +
            money(originalUnitPrice, selection.currency) +
            " → Now " +
            money(unitPrice, selection.currency) +
            " per person × " +
            guests +
            " = " +
            money(estimatedTotal, selection.currency) +
            " (Watermelon website only)"
          : unitPrice
            ? "Guide price: " + money(unitPrice, selection.currency) + " per person × " + guests + " = " + money(estimatedTotal, selection.currency)
            : "Price: to be confirmed",
        "",
        "Please confirm availability before I consider this booking confirmed.",
      ].filter(Boolean);

      const url =
        "https://wa.me/351918404101?text=" +
        encodeURIComponent("Hello Watermelon Experiences,\n\n" + lines.join("\n"));

      window.location.href = url;
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "We could not save your booking request.");
      setSending(false);
    }
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

  const overview = selection.description || experienceDetails?.description || "";
  const pickupInfo = experienceDetails?.pickup || experienceDetails?.meetingPoint || "";
  const cancellation = experienceDetails?.cancellation;

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
              {websitePromotion && (
                <div className="booking-website-promotion">
                  <span>{selection.promotionLabel || "Website offer"}</span>
                  <small>Before <del>{money(originalUnitPrice, selection.currency)}</del></small>
                  <strong>Now {money(unitPrice, selection.currency)}</strong>
                  <em>Exclusive to direct booking on watermelonexperiences.pt</em>
                </div>
              )}
              <div className="booking-status-note">
                <strong>Availability is confirmed manually.</strong>
                <span>You send the request now. Watermelon checks availability and only then confirms the booking.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="proposal-block booking-experience-info">
          <div className="block-title booking-info-heading">
            <span aria-hidden="true">i</span>
            <div>
              <h2>About this experience</h2>
              <p>Key information is synced automatically from the live experience listing.</p>
            </div>
          </div>

          {overview && <p className="booking-overview">{overview}</p>}

          <div className="booking-key-facts">
            <div className="booking-key-fact">
              <span>Duration</span>
              <strong>{selection.duration || "On request"}</strong>
            </div>

            {experienceDetails?.languages?.length ? (
              <div className="booking-key-fact">
                <span>Live guide</span>
                <strong>{experienceDetails.languages.join(", ")}</strong>
              </div>
            ) : null}

            {pickupInfo ? (
              <div className="booking-key-fact">
                <span>Pickup / meeting</span>
                <strong>{pickupInfo}</strong>
              </div>
            ) : null}

            <div className="booking-key-fact">
              <span>Payment</span>
              <strong>No payment now</strong>
              <small>Payment is only requested after Watermelon confirms availability.</small>
            </div>
          </div>

          {cancellation ? (
            <div className="booking-cancellation-note">
              <div>
                <strong>{cancellation.freeCancellation ? "Free cancellation" : "Cancellation policy"}</strong>
                {cancellation.description ? <p>{cancellation.description}</p> : null}
              </div>
              <small>These terms are synced from the experience listing and are reconfirmed with your direct booking.</small>
            </div>
          ) : detailsLoading ? (
            <p className="booking-live-loading">Loading live practical information…</p>
          ) : null}

          {(experienceDetails?.inclusions?.length || experienceDetails?.exclusions?.length) ? (
            <div className="booking-inclusions-grid">
              {experienceDetails?.inclusions?.length ? (
                <div>
                  <h3>Included</h3>
                  <ul>
                    {experienceDetails.inclusions.slice(0, 6).map((item, index) => (
                      <li key={`included-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {experienceDetails?.exclusions?.length ? (
                <div>
                  <h3>Not included</h3>
                  <ul>
                    {experienceDetails.exclusions.slice(0, 5).map((item, index) => (
                      <li key={`excluded-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {experienceDetails?.itinerary?.length ? (
            <details className="booking-more-info">
              <summary>What to expect · itinerary</summary>
              <ol className="booking-itinerary">
                {experienceDetails.itinerary.slice(0, 6).map((item, index) => (
                  <li key={`${item.title}-${index}`}>
                    <strong>{item.title}</strong>
                    <span>
                      {[item.duration, item.passByWithoutStopping ? "Pass by" : ""].filter(Boolean).join(" · ")}
                    </span>
                    {item.description ? <p>{item.description}</p> : null}
                  </li>
                ))}
              </ol>
            </details>
          ) : null}

          {experienceDetails?.additionalInfo?.length ? (
            <details className="booking-more-info">
              <summary>Important practical information</summary>
              <ul className="booking-practical-list">
                {experienceDetails.additionalInfo.slice(0, 6).map((item, index) => (
                  <li key={`practical-${index}`}>{item}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>

        <div className="proposal-block">
          <div className="block-title">
            <span>1</span>
            <div>
              <h2>Experience details</h2>
              <p>Tell us when you would like to go and which option you prefer.</p>
            </div>
          </div>

          <p className="required-fields-note"><span aria-hidden="true">*</span> Required fields</p>

          <div className="form-grid">
            <label>
              <span>Date <b className="required-mark" aria-hidden="true">*</b></span>
              <input
                type="date"
                required
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
              />
            </label>

            <label>
              <span>Number of guests <b className="required-mark" aria-hidden="true">*</b></span>
              <input
                type="number"
                required
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
                placeholder={pickupInfo || "Hotel, address or preferred meeting point"}
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

          <p className="required-fields-note"><span aria-hidden="true">*</span> Required fields</p>

          <div className="form-grid">
            <label>
              <span>Name <b className="required-mark" aria-hidden="true">*</b></span>
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Your name"
              />
            </label>
            <label>
              <span>Phone / WhatsApp <b className="required-mark" aria-hidden="true">*</b></span>
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

          <div className={websitePromotion ? "summary-total summary-total-promo" : "summary-total"}>
            <span>{websitePromotion ? "Website offer total" : "Guide total"}</span>
            {websitePromotion && (
              <small>Before <del>{money(originalEstimatedTotal, selection.currency)}</del></small>
            )}
            <strong>{unitPrice ? money(estimatedTotal, selection.currency) : "On request"}</strong>
            {websitePromotion && (
              <em>Direct Watermelon booking only · Viator is not changed</em>
            )}
          </div>

          <div className="direct-proposal-note booking-pending-note">
            <strong>Not confirmed yet</strong>
            <span>After receiving your request, Watermelon checks availability and replies to confirm or suggest an alternative.</span>
          </div>

          {sendError && <p className="booking-send-error">{sendError}</p>}

          <button
            className="button button-primary wide"
            type="button"
            onClick={() => void sendRequest()}
            disabled={!canSend || sending}
          >
            {sending ? "Saving request…" : "Send booking request on WhatsApp"}
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
