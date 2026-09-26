"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  BookingRequestRecord,
  BookingStatus,
  PaymentMethod,
  PaymentSettings,
  PaymentStatus,
} from "@/types/booking";

type Filter = "all" | BookingStatus | "awaiting_payment" | "paid";\n\nconst OWNER_EMAIL = "c.vasconcelos1969@gmail.com";

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  alternative_proposed: "Alternative proposed",
  declined: "Declined",
  cancelled: "Cancelled",
  confirmed: "Confirmed",
};

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  not_requested: "Not requested",
  awaiting: "Awaiting payment",
  paid: "Paid",
  refunded: "Refunded",
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  paypal: "PayPal",
  revolut: "Revolut",
  bank_transfer: "Bank transfer",
};

const EMPTY_PAYMENT_SETTINGS: PaymentSettings = {
  id: 1,
  paypal_link: null,
  revolut_link: null,
  bank_name: null,
  bank_account_name: null,
  bank_iban: null,
  bank_bic: null,
  updated_at: "",
};

function money(value: number | null, currency = "EUR") {
  if (value === null) return "On request";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(value);
}

function displayDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value + (value.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function cleanSetting(value: string | null) {
  return value?.trim() || null;
}

export default function AdminBookings() {
  const [email, setEmail] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [bookings, setBookings] = useState<BookingRequestRecord[]>([]);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(EMPTY_PAYMENT_SETTINGS);
  const [filter, setFilter] = useState<Filter>("pending");
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginCooldown, setLoginCooldown] = useState(0);
  const [savingPaymentSettings, setSavingPaymentSettings] = useState(false);
  const [paymentSaved, setPaymentSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  const loadBookings = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("watermelon_booking_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(
        error.code === "42501"
          ? "This account is not authorized for the Watermelon admin area."
          : error.message
      );
      setBookings([]);
    } else {
      setBookings((data || []) as BookingRequestRecord[]);
    }
    setLoading(false);
  }, [supabase]);

  const loadPaymentSettings = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("watermelon_payment_settings")
      .select("*")
      .eq("id", 1)
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    if (data) setPaymentSettings(data as PaymentSettings);
  }, [supabase]);

  useEffect(() => {
    if (loginCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setLoginCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loginCooldown]);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const active = Boolean(data.session);
      setSignedIn(active);
      setAuthReady(true);
      if (active) {
        void loadBookings();
        void loadPaymentSettings();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      if (session) {
        void loadBookings();
        void loadPaymentSettings();
      } else {
        setBookings([]);
        setPaymentSettings(EMPTY_PAYMENT_SETTINGS);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [supabase, loadBookings, loadPaymentSettings]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setLoginLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email: OWNER_EMAIL,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin + "/admin",
      },
    });

    if (error) {
      const normalized = error.message.toLowerCase();
      setMessage(
        normalized.includes("rate limit")
          ? "Too many access emails were requested. Please use the most recent email already received, or wait before requesting another link."
          : error.message
      );
    } else {
      setMessage("Secure sign-in link sent. Please check your email.");
      setLoginCooldown(60);
    }
    setLoginLoading(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSignedIn(false);
    setBookings([]);
  }

  async function savePaymentSettings() {
    if (!supabase) return;
    setSavingPaymentSettings(true);
    setPaymentSaved(false);
    setMessage("");

    const patch = {
      paypal_link: cleanSetting(paymentSettings.paypal_link),
      revolut_link: cleanSetting(paymentSettings.revolut_link),
      bank_name: cleanSetting(paymentSettings.bank_name),
      bank_account_name: cleanSetting(paymentSettings.bank_account_name),
      bank_iban: cleanSetting(paymentSettings.bank_iban),
      bank_bic: cleanSetting(paymentSettings.bank_bic),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("watermelon_payment_settings")
      .update(patch)
      .eq("id", 1);

    if (error) {
      setMessage(error.message);
    } else {
      setPaymentSettings((current) => ({ ...current, ...patch }));
      setPaymentSaved(true);
      window.setTimeout(() => setPaymentSaved(false), 3000);
    }
    setSavingPaymentSettings(false);
  }

  function paymentOptionsAvailable() {
    return Boolean(
      paymentSettings.paypal_link ||
      paymentSettings.revolut_link ||
      paymentSettings.bank_iban
    );
  }

  function paymentLinkMessage(booking: BookingRequestRecord, paymentUrl: string) {
    const lines = [
      "Hello " + booking.customer_name + ",",
      "",
      "We have now accepted your Watermelon booking request " + booking.reference + " after reviewing the details and availability.",
      booking.estimated_total !== null
        ? "Amount to pay: " + money(booking.estimated_total, booking.currency)
        : "Amount: as agreed",
      "",
      "Choose your preferred payment method securely here:",
      paymentUrl,
      "",
      "You can choose PayPal, Revolut or bank transfer.",
      "The booking becomes confirmed once the payment is received.",
    ];

    return lines.join("\n");
  }

  async function sendPaymentOptions(booking: BookingRequestRecord) {
    if (!paymentOptionsAvailable()) {
      setMessage("Configure at least one payment option first.");
      return;
    }

    const paymentToken = booking.payment_token || crypto.randomUUID();

    await updateBooking(booking.id, {
      payment_status: "awaiting",
      payment_method: null,
      payment_requested_at: new Date().toISOString(),
      payment_token: paymentToken,
    }, false);

    const paymentUrl =
      window.location.origin +
      "/payment/" +
      encodeURIComponent(booking.reference) +
      "?token=" +
      encodeURIComponent(paymentToken);

    const phone = booking.customer_phone.replace(/[^0-9]/g, "");
    const url =
      "https://wa.me/" +
      phone +
      "?text=" +
      encodeURIComponent(paymentLinkMessage(booking, paymentUrl));

    window.location.href = url;
  }

  async function markPaid(booking: BookingRequestRecord) {
    const currentMethod = booking.payment_method || "";
    const methodInput = window.prompt(
      "Payment method: paypal, revolut or bank_transfer",
      currentMethod
    );
    if (methodInput === null) return;

    const normalized = methodInput.trim().toLowerCase().replace(/[ -]+/g, "_");
    const method =
      normalized === "paypal" ||
      normalized === "revolut" ||
      normalized === "bank_transfer"
        ? (normalized as PaymentMethod)
        : null;

    if (!method) {
      setMessage("Use paypal, revolut or bank_transfer as the payment method.");
      return;
    }

    const paymentReference = window.prompt(
      "Payment reference (optional)",
      booking.payment_reference || ""
    );
    if (paymentReference === null) return;

    await updateBooking(booking.id, {
      payment_status: "paid",
      payment_method: method,
      payment_reference: paymentReference.trim() || null,
      paid_at: new Date().toISOString(),
    });
  }

  async function proposeAlternative(booking: BookingRequestRecord) {
    const alternativeDate = window.prompt(
      "Alternative date (YYYY-MM-DD)",
      booking.alternative_date || booking.requested_date
    );
    if (!alternativeDate) return;

    const alternativeTime = window.prompt(
      "Alternative time (optional)",
      booking.alternative_time || ""
    );
    if (alternativeTime === null) return;

    await updateBooking(booking.id, {
      status: "alternative_proposed",
      alternative_date: alternativeDate,
      alternative_time: alternativeTime.trim() || null,
    });
  }

  async function updateBooking(
    id: string,
    patch: Partial<Pick<
      BookingRequestRecord,
      | "status"
      | "payment_status"
      | "payment_method"
      | "payment_requested_at"
      | "payment_token"
      | "admin_notes"
      | "alternative_date"
      | "alternative_time"
      | "payment_reference"
      | "paid_at"
      | "confirmed_at"
    >>,
    reload = true
  ) {
    if (!supabase) return;
    setEditing(id);
    setMessage("");

    const { error } = await supabase
      .from("watermelon_booking_requests")
      .update(patch)
      .eq("id", id);

    if (error) setMessage(error.message);
    else if (reload) await loadBookings();
    setEditing(null);
  }

  const filtered = useMemo(() => {
    if (filter === "all") return bookings;
    if (filter === "awaiting_payment") {
      return bookings.filter((item) => item.payment_status === "awaiting");
    }
    if (filter === "paid") {
      return bookings.filter((item) => item.payment_status === "paid");
    }
    return bookings.filter((item) => item.status === filter);
  }, [bookings, filter]);

  const counts = useMemo(
    () => ({
      pending: bookings.filter((item) => item.status === "pending").length,
      approved: bookings.filter((item) => item.status === "approved").length,
      awaiting: bookings.filter((item) => item.payment_status === "awaiting").length,
      paid: bookings.filter((item) => item.payment_status === "paid").length,
      confirmed: bookings.filter((item) => item.status === "confirmed").length,
    }),
    [bookings]
  );

  if (!authReady) {
    return <section className="admin-shell"><div className="admin-loading">Checking access…</div></section>;
  }

  if (!supabase) {
    return (
      <section className="admin-shell">
        <div className="admin-login-card">
          <p className="eyebrow dark">PRIVATE AREA</p>
          <h1>Watermelon Booking Admin</h1>
          <p>The private booking database is not connected yet.</p>
        </div>
      </section>
    );
  }

  if (!signedIn) {
    return (
      <section className="admin-shell">
        <form className="admin-login-card" onSubmit={signIn}>
          <p className="eyebrow dark">PRIVATE AREA</p>
          <h1>Watermelon Booking Admin</h1>
          <p>This private area is restricted to the Watermelon owner account.</p>

          <div className="admin-owner-account">
            <span>Authorized account</span>
            <strong>c.v******1969@gmail.com</strong>
          </div>

          {message && <p className="admin-error">{message}</p>}

          <button
            className="button button-primary wide"
            type="submit"
            disabled={loginLoading || loginCooldown > 0}
          >
            {loginLoading
              ? "Sending link…"
              : loginCooldown > 0
                ? "Try again in " + loginCooldown + "s"
                : "Send secure sign-in link"}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="admin-shell">
      <div className="admin-topbar">
        <div>
          <p className="eyebrow dark">PRIVATE AREA</p>
          <h1>Bookings</h1>
        </div>
        <div className="admin-topbar-actions">
          <a className="button button-ghost" href="/admin">CRM</a>
          <button
            className="button button-ghost"
            type="button"
            onClick={() => {
              void loadBookings();
              void loadPaymentSettings();
            }}
          >
            Refresh
          </button>
          <button className="button button-ghost" type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>

      <details className="admin-payment-settings">
        <summary>
          <div>
            <strong>Payment options</strong>
            <span>PayPal, Revolut and bank transfer can all be offered. The customer chooses.</span>
          </div>
          <span>Configure</span>
        </summary>
        <div className="admin-payment-settings-body">
          <div className="admin-payment-settings-grid">
            <label>
              <span>PayPal payment link</span>
              <input
                value={paymentSettings.paypal_link || ""}
                onChange={(event) =>
                  setPaymentSettings({ ...paymentSettings, paypal_link: event.target.value })
                }
                placeholder="https://paypal.me/..."
              />
            </label>
            <label>
              <span>Revolut payment link</span>
              <input
                value={paymentSettings.revolut_link || ""}
                onChange={(event) =>
                  setPaymentSettings({ ...paymentSettings, revolut_link: event.target.value })
                }
                placeholder="https://revolut.me/..."
              />
            </label>
            <label>
              <span>Bank / institution</span>
              <input
                value={paymentSettings.bank_name || ""}
                onChange={(event) =>
                  setPaymentSettings({ ...paymentSettings, bank_name: event.target.value })
                }
                placeholder="Bank name"
              />
            </label>
            <label>
              <span>Account holder</span>
              <input
                value={paymentSettings.bank_account_name || ""}
                onChange={(event) =>
                  setPaymentSettings({ ...paymentSettings, bank_account_name: event.target.value })
                }
                placeholder="Watermelon / account holder"
              />
            </label>
            <label>
              <span>IBAN</span>
              <input
                value={paymentSettings.bank_iban || ""}
                onChange={(event) =>
                  setPaymentSettings({ ...paymentSettings, bank_iban: event.target.value })
                }
                placeholder="PT50..."
              />
            </label>
            <label>
              <span>BIC / SWIFT</span>
              <input
                value={paymentSettings.bank_bic || ""}
                onChange={(event) =>
                  setPaymentSettings({ ...paymentSettings, bank_bic: event.target.value })
                }
                placeholder="Optional"
              />
            </label>
          </div>
          <div className="admin-payment-save-row">
            <button
              className="button button-primary"
              type="button"
              disabled={savingPaymentSettings}
              onClick={() => void savePaymentSettings()}
            >
              {savingPaymentSettings ? "Saving…" : paymentSaved ? "Saved ✓" : "Save payment options"}
            </button>
            {paymentSaved && <span className="admin-payment-saved">Payment details saved successfully.</span>}
          </div>
        </div>
      </details>

      <div className="admin-stats">
        <button type="button" onClick={() => setFilter("pending")}><span>Pending</span><strong>{counts.pending}</strong></button>
        <button type="button" onClick={() => setFilter("approved")}><span>Approved</span><strong>{counts.approved}</strong></button>
        <button type="button" onClick={() => setFilter("awaiting_payment")}><span>Awaiting payment</span><strong>{counts.awaiting}</strong></button>
        <button type="button" onClick={() => setFilter("paid")}><span>Paid</span><strong>{counts.paid}</strong></button>
        <button type="button" onClick={() => setFilter("confirmed")}><span>Confirmed</span><strong>{counts.confirmed}</strong></button>
      </div>

      <div className="admin-filters">
        {([
          ["all", "All"],
          ["pending", "Pending"],
          ["approved", "Approved"],
          ["alternative_proposed", "Alternative"],
          ["awaiting_payment", "Awaiting payment"],
          ["paid", "Paid"],
          ["confirmed", "Confirmed"],
          ["declined", "Declined"],
        ] as Array<[Filter, string]>).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={filter === value ? "chip chip-active" : "chip"}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {message && <p className="admin-error">{message}</p>}
      {loading && <p className="admin-loading">Loading bookings…</p>}

      <div className="admin-booking-list">
        {!loading && filtered.length === 0 && (
          <div className="admin-empty">
            <h2>No bookings here.</h2>
            <p>New direct requests will appear here automatically.</p>
          </div>
        )}

        {filtered.map((booking) => {
          const busy = editing === booking.id;
          return (
            <article className="admin-booking-card" key={booking.id}>
              <header>
                <div>
                  <span className="admin-reference">{booking.reference}</span>
                  <h2>{booking.experience_title}</h2>
                  <p>Received {displayDate(booking.created_at.slice(0, 10))}</p>
                </div>
                <div className="admin-badges">
                  <span className={"admin-status status-" + booking.status}>{STATUS_LABELS[booking.status]}</span>
                  <span className={"admin-payment payment-" + booking.payment_status}>{PAYMENT_LABELS[booking.payment_status]}</span>
                </div>
              </header>

              <div className="admin-booking-grid">
                <div><span>Date</span><strong>{displayDate(booking.requested_date)}</strong></div>
                <div><span>Time</span><strong>{booking.preferred_time || "Flexible"}</strong></div>
                <div><span>Guests</span><strong>{booking.guests}</strong></div>
                <div><span>Option</span><strong>{booking.option_name || "Standard"}</strong></div>
                <div><span>Customer</span><strong>{booking.customer_name}</strong></div>
                <div><span>Phone</span><strong>{booking.customer_phone}</strong></div>
                <div><span>Email</span><strong>{booking.customer_email || "—"}</strong></div>
                <div><span>Total</span><strong>{money(booking.estimated_total, booking.currency)}</strong></div>
              </div>

              {(booking.pickup_location ||
                booking.customer_notes ||
                booking.alternative_date ||
                booking.payment_reference ||
                booking.payment_method) && (
                <div className="admin-notes">
                  {booking.pickup_location && <p><strong>Pickup:</strong> {booking.pickup_location}</p>}
                  {booking.customer_notes && <p><strong>Customer notes:</strong> {booking.customer_notes}</p>}
                  {booking.alternative_date && <p><strong>Alternative:</strong> {displayDate(booking.alternative_date)}{booking.alternative_time ? " · " + booking.alternative_time : ""}</p>}
                  {booking.payment_method && <p><strong>Payment method:</strong> {PAYMENT_METHOD_LABELS[booking.payment_method]}</p>}
                  {booking.payment_reference && <p><strong>Payment reference:</strong> {booking.payment_reference}</p>}
                </div>
              )}

              <div className="admin-actions">
                {booking.status === "pending" && (
                  <>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={busy}
                      onClick={() => {
                        const confirmed = window.confirm(
                          "Accept this booking request? This only accepts the request. Payment will be requested separately."
                        );
                        if (!confirmed) return;
                        void updateBooking(booking.id, {
                          status: "approved",
                          payment_status: "not_requested",
                          payment_method: null,
                          payment_requested_at: null,
                        });
                      }}
                    >
                      Accept request
                    </button>
                    <button
                      type="button"
                      className="button button-ghost"
                      disabled={busy}
                      onClick={() => void proposeAlternative(booking)}
                    >
                      Propose alternative
                    </button>
                    <button
                      type="button"
                      className="button button-ghost"
                      disabled={busy}
                      onClick={() => void updateBooking(booking.id, { status: "declined" })}
                    >
                      Decline
                    </button>
                  </>
                )}

                {booking.status === "approved" && booking.payment_status !== "paid" && (
                  <>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={busy || !paymentOptionsAvailable()}
                      onClick={() => void sendPaymentOptions(booking)}
                    >
                      Send payment options
                    </button>
                    <button
                      type="button"
                      className="button button-ghost"
                      disabled={busy}
                      onClick={() => void markPaid(booking)}
                    >
                      Mark as paid
                    </button>
                  </>
                )}

                {booking.payment_status === "paid" && booking.status !== "confirmed" && (
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={busy}
                    onClick={() => void updateBooking(booking.id, {
                      status: "confirmed",
                      confirmed_at: new Date().toISOString(),
                    })}
                  >
                    Confirm booking
                  </button>
                )}

                <a
                  className="button button-outline"
                  href={"/admin?search=" + encodeURIComponent(booking.reference)}
                >
                  Open in CRM
                </a>

                <a
                  className="button button-ghost"
                  href="https://supplier.viator.com/login?to=%2Fbookings%2Fsearch"
                  target="_blank"
                  rel="noreferrer"
                >
                  Check Viator bookings
                </a>

                <a
                  className="button button-ghost"
                  href={
                    "https://wa.me/" +
                    booking.customer_phone.replace(/[^0-9]/g, "") +
                    "?text=" +
                    encodeURIComponent(
                      "Hello " + booking.customer_name + ", regarding your Watermelon booking " + booking.reference + ": "
                    )
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  General WhatsApp message
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
