"use client";

import { useEffect, useMemo, useState } from "react";

type PaymentItem = {
  title: string;
  date: string | null;
  time: string | null;
  guests: number;
  unit_price: number | null;
  line_total: number | null;
};

type PaymentDetails = {
  source_type: "direct_booking" | "proposal";
  reference: string;
  customer_name: string;
  title: string;
  items: PaymentItem[];
  estimated_total: number | null;
  currency: string;
  payment_status: string;
  payment_method: string | null;
  paypal_link: string | null;
  revolut_link: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_iban: string | null;
  bank_bic: string | null;
};

type ApiResponse = {
  payment?: PaymentDetails;
  error?: string;
};

function money(value: number | null, currency: string) {
  if (value === null) return "Amount as agreed";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "EUR",
  }).format(Number(value));
}

function dateLabel(value: string | null) {
  if (!value) return "To be agreed";
  const date = new Date(value + "T00:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default function PaymentChoice({
  reference,
  token,
}: {
  reference: string;
  token: string;
}) {
  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");

  const endpoint = useMemo(() => {
    const params = new URLSearchParams({ reference, token });
    return "/api/payment?" + params.toString();
  }, [reference, token]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const data = (await response.json()) as ApiResponse;

        if (!response.ok || !data.payment) {
          throw new Error(data.error || "We could not load the payment options.");
        }

        if (active) setPayment(data.payment);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "We could not load the payment options."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [endpoint]);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("");
    }
  }

  if (loading) {
    return (
      <main className="payment-page-shell">
        <section className="payment-card payment-state-card">
          <div className="payment-spinner" />
          <h1>Loading payment options…</h1>
        </section>
      </main>
    );
  }

  if (error || !payment) {
    return (
      <main className="payment-page-shell">
        <section className="payment-card payment-state-card">
          <p className="eyebrow dark">WATERMELON EXPERIENCES</p>
          <h1>Payment link unavailable</h1>
          <p>{error || "This link is invalid or no longer available."}</p>
        </section>
      </main>
    );
  }

  const alreadyPaid = payment.payment_status === "paid";

  return (
    <main className="payment-page-shell">
      <section className="payment-card">
        <div className="payment-card-heading">
          <div>
            <p className="eyebrow dark">SECURE PAYMENT</p>
            <h1>{alreadyPaid ? "Payment received" : "Choose how you would like to pay"}</h1>
            <p>
              {alreadyPaid
                ? "Thank you. Watermelon has recorded this payment."
                : "Select the payment method that is most convenient for you."}
            </p>
          </div>
          <div className={alreadyPaid ? "payment-status paid" : "payment-status"}>
            {alreadyPaid ? "Paid" : "Awaiting payment"}
          </div>
        </div>

        <div className="payment-booking-summary">
          <div className="payment-experience">
            <span>{payment.source_type === "proposal" ? "Proposal" : "Experience"}</span>
            <strong>{payment.title}</strong>
          </div>
          <div><span>Reference</span><strong>{payment.reference}</strong></div>
          <div className="payment-total"><span>Total</span><strong>{money(payment.estimated_total, payment.currency)}</strong></div>
        </div>

        <div className="payment-item-list">
          {payment.items.map((item, index) => (
            <div className="payment-item-row" key={index}>
              <div>
                <strong>{item.title}</strong>
                <span>
                  {dateLabel(item.date)}
                  {item.time ? " · " + item.time : ""}
                  {" · "}{item.guests} guest{item.guests === 1 ? "" : "s"}
                </span>
              </div>
              <b>{money(item.line_total, payment.currency)}</b>
            </div>
          ))}
        </div>

        {!alreadyPaid && (
          <div className="payment-methods">
            {payment.paypal_link && (
              <article className="payment-method-card">
                <div className="payment-method-title">
                  <div className="payment-method-mark paypal">P</div>
                  <div>
                    <h2>PayPal</h2>
                    <p>Pay securely using your PayPal account or available PayPal payment options.</p>
                  </div>
                </div>
                <a
                  className="button button-primary wide"
                  href={payment.paypal_link}
                  target="_blank"
                  rel="noreferrer"
                >
                  Pay with PayPal
                </a>
              </article>
            )}

            {payment.revolut_link && (
              <article className="payment-method-card">
                <div className="payment-method-title">
                  <div className="payment-method-mark revolut">R</div>
                  <div>
                    <h2>Revolut</h2>
                    <p>Open Revolut and complete the payment using the amount shown above.</p>
                  </div>
                </div>
                <a
                  className="button button-primary wide"
                  href={payment.revolut_link}
                  target="_blank"
                  rel="noreferrer"
                >
                  Pay with Revolut
                </a>
              </article>
            )}

            {payment.bank_iban && (
              <article className="payment-method-card bank-transfer-card">
                <div className="payment-method-title">
                  <div className="payment-method-mark bank">€</div>
                  <div>
                    <h2>Bank transfer</h2>
                    <p>Use the booking reference as the transfer description whenever possible.</p>
                  </div>
                </div>

                <div className="bank-details">
                  {payment.bank_account_name && (
                    <div><span>Account holder</span><strong>{payment.bank_account_name}</strong></div>
                  )}
                  {payment.bank_name && (
                    <div><span>Bank</span><strong>{payment.bank_name}</strong></div>
                  )}
                  <div className="bank-copy-row">
                    <div><span>IBAN</span><strong>{payment.bank_iban}</strong></div>
                    <button type="button" onClick={() => void copy(payment.bank_iban || "", "IBAN")}>
                      {copied === "IBAN" ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                  {payment.bank_bic && (
                    <div><span>BIC / SWIFT</span><strong>{payment.bank_bic}</strong></div>
                  )}
                  <div className="bank-copy-row">
                    <div><span>Payment reference</span><strong>{payment.reference}</strong></div>
                    <button type="button" onClick={() => void copy(payment.reference, "Reference")}>
                      {copied === "Reference" ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                </div>
              </article>
            )}
          </div>
        )}

        <div className="payment-footer-note">
          <strong>Watermelon Experiences</strong>
          <span>
            Your booking is confirmed after the payment is received and validated by Watermelon.
          </span>
        </div>
      </section>
    </main>
  );
}
