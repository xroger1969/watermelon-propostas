"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  BookingRequestRecord,
  BookingStatus,
  PaymentStatus,
} from "@/types/booking";

type Filter = "all" | BookingStatus | "awaiting_payment" | "paid";

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

export default function AdminBookings() {
  const [email, setEmail] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [bookings, setBookings] = useState<BookingRequestRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
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

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const active = Boolean(data.session);
      setSignedIn(active);
      setAuthReady(true);
      if (active) void loadBookings();
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      if (session) void loadBookings();
      else setBookings([]);
    });

    return () => listener.subscription.unsubscribe();
  }, [supabase, loadBookings]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setLoginLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin + "/admin",
      },
    });

    if (error) setMessage(error.message);
    else setMessage("Check your email for the secure sign-in link.");
    setLoginLoading(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSignedIn(false);
    setBookings([]);
  }

  async function updateBooking(
    id: string,
    patch: Partial<Pick<
      BookingRequestRecord,
      | "status"
      | "payment_status"
      | "admin_notes"
      | "alternative_date"
      | "alternative_time"
      | "payment_reference"
      | "paid_at"
      | "confirmed_at"
    >>
  ) {
    if (!supabase) return;
    setEditing(id);
    setMessage("");

    const { error } = await supabase
      .from("watermelon_booking_requests")
      .update(patch)
      .eq("id", id);

    if (error) setMessage(error.message);
    else await loadBookings();
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
          <p>Enter your administrator email. We will send you a secure sign-in link.</p>

          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          {message && <p className="admin-error">{message}</p>}

          <button className="button button-primary wide" type="submit" disabled={loginLoading}>
            {loginLoading ? "Sending link…" : "Send secure sign-in link"}
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
          <button className="button button-ghost" type="button" onClick={() => void loadBookings()}>
            Refresh
          </button>
          <button className="button button-ghost" type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>

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

              {(booking.pickup_location || booking.customer_notes) && (
                <div className="admin-notes">
                  {booking.pickup_location && <p><strong>Pickup:</strong> {booking.pickup_location}</p>}
                  {booking.customer_notes && <p><strong>Customer notes:</strong> {booking.customer_notes}</p>}
                </div>
              )}

              <div className="admin-actions">
                {booking.status === "pending" && (
                  <>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={busy}
                      onClick={() => void updateBooking(booking.id, {
                        status: "approved",
                        payment_status: "awaiting",
                      })}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="button button-ghost"
                      disabled={busy}
                      onClick={() => void updateBooking(booking.id, { status: "alternative_proposed" })}
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
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={busy}
                    onClick={() => void updateBooking(booking.id, {
                      payment_status: "paid",
                      paid_at: new Date().toISOString(),
                    })}
                  >
                    Mark as paid
                  </button>
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
                  WhatsApp customer
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
