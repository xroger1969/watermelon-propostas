"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ProposalEditor from "@/components/ProposalEditor";

type CRMStatus =
  | "new"
  | "in_review"
  | "proposal_drafting"
  | "proposal_sent"
  | "customer_replied"
  | "accepted"
  | "awaiting_payment"
  | "confirmed"
  | "declined"
  | "cancelled";

type CRMContact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  preferred_language: string | null;
  source: string;
  last_contact_at: string;
};

type CRMItem = {
  id: string;
  position: number;
  experience_title: string;
  option_name: string | null;
  requested_date: string | null;
  preferred_time: string | null;
  date_flexibility: string | null;
  guests: number;
  unit_price: number | null;
  subtotal: number | null;
  pickup_location: string | null;
  guide_language: string | null;
  special_request: string | null;
  children_ages: string | null;
  accessibility: string | null;
  dietary: string | null;
  occasion: string | null;
};

type CRMActivity = {
  id: number;
  created_at: string;
  activity_type: string;
  summary: string;
};

type CRMProposalItem = {
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

type CRMProposal = {
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
  items: CRMProposalItem[];
};

type CRMRequest = {
  id: string;
  reference: string;
  created_at: string;
  updated_at: string;
  kind: "personalized_proposal" | "direct_booking" | "manual";
  status: CRMStatus;
  source: string;
  currency: string;
  estimated_total: number | null;
  customer_notes: string | null;
  admin_notes: string | null;
  first_response_at: string | null;
  last_contact_at: string;
  contact: CRMContact | null;
  items: CRMItem[];
  activities: CRMActivity[];
  proposals: CRMProposal[];
};

type Filter = "all" | CRMStatus;

const STATUS_LABELS: Record<CRMStatus, string> = {
  new: "New",
  in_review: "In review",
  proposal_drafting: "Drafting proposal",
  proposal_sent: "Proposal sent",
  customer_replied: "Customer replied",
  accepted: "Accepted",
  awaiting_payment: "Awaiting payment",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
};

const KIND_LABELS = {
  personalized_proposal: "Personalized proposal",
  direct_booking: "Direct booking",
  manual: "Manual",
} as const;

function money(value: number | null, currency = "EUR") {
  if (value === null) return "On request";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(Number(value));
}

function shortDate(value: string | null) {
  if (!value) return "No date selected";
  const date = new Date(value + (value.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function dateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function AdminCRM() {
  const [email, setEmail] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginCooldown, setLoginCooldown] = useState(0);
  const [requests, setRequests] = useState<CRMRequest[]>([]);
  const [contactCount, setContactCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<Filter>("new");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [whatsappDrafts, setWhatsappDrafts] = useState<Record<string, string>>({});

  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  const loadCRM = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setMessage("");

    const [{ data, error }, contactsResult] = await Promise.all([
      supabase
        .from("watermelon_requests")
        .select(`
          *,
          contact:watermelon_contacts(*),
          items:watermelon_request_items(*),
          activities:watermelon_activities(*),
          proposals:watermelon_proposals(*, items:watermelon_proposal_items(*))
        `)
        .order("created_at", { ascending: false }),
      supabase
        .from("watermelon_contacts")
        .select("id", { count: "exact", head: true }),
    ]);

    if (error) {
      setMessage(
        error.code === "42501"
          ? "This account is not authorized for the Watermelon private area."
          : error.message
      );
      setRequests([]);
    } else {
      const normalized = ((data || []) as CRMRequest[]).map((request) => ({
        ...request,
        items: [...(request.items || [])].sort((a, b) => a.position - b.position),
        activities: [...(request.activities || [])].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
        proposals: [...(request.proposals || [])]
          .sort((a, b) => b.version - a.version)
          .map((proposal) => ({
            ...proposal,
            items: [...(proposal.items || [])].sort((a, b) => a.position - b.position),
          })),
      }));
      setRequests(normalized);
    }

    if (!contactsResult.error) {
      setContactCount(contactsResult.count || 0);
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
      setActorEmail(data.session?.user.email || "");
      setAuthReady(true);
      if (active) void loadCRM();
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      setActorEmail(session?.user.email || "");
      if (session) void loadCRM();
      else setRequests([]);
    });

    return () => listener.subscription.unsubscribe();
  }, [supabase, loadCRM]);

  useEffect(() => {
    if (loginCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setLoginCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loginCooldown]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;

    setLoginLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin + "/admin",
      },
    });

    if (error) {
      setMessage(
        error.message.toLowerCase().includes("rate limit")
          ? "Too many access emails were requested. Use the most recent email already received or wait before trying again."
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
    setRequests([]);
  }

  async function changeStatus(request: CRMRequest, status: CRMStatus) {
    if (!supabase || request.status === status) return;

    setEditing(request.id);
    setMessage("");
    const now = new Date().toISOString();

    const patch: Record<string, string> = {
      status,
      last_contact_at: now,
    };

    if (status === "in_review" && !request.first_response_at) {
      patch.first_response_at = now;
    }

    const { error } = await supabase
      .from("watermelon_requests")
      .update(patch)
      .eq("id", request.id);

    if (error) {
      setMessage(error.message);
      setEditing(null);
      return;
    }

    await supabase.from("watermelon_activities").insert({
      request_id: request.id,
      contact_id: request.contact?.id || null,
      activity_type: "status_changed",
      summary: `Status changed to ${STATUS_LABELS[status]}`,
      actor_email: actorEmail || null,
      metadata: {
        old_status: request.status,
        new_status: status,
      },
    });

    await loadCRM();
    setEditing(null);
  }

  function buildWhatsAppMessage(request: CRMRequest) {
    const customMessage = (whatsappDrafts[request.id] || "").trim();
    const lines: string[] = [
      "Hello " + (request.contact?.name || "") + ",",
      "",
      "This is Watermelon Experiences regarding your request " + request.reference + ".",
    ];

    if (customMessage) {
      lines.push("", customMessage);
    }

    lines.push("", "Request summary:");

    request.items.forEach((item, index) => {
      lines.push(
        (index + 1) + ". " + item.experience_title,
        "   Date: " + shortDate(item.requested_date),
        "   Guests: " + item.guests,
        "   Preferred time: " + (item.preferred_time || "Flexible")
      );
      if (item.option_name) lines.push("   Option: " + item.option_name);
    });

    if (request.estimated_total !== null) {
      lines.push("", "Estimated total: " + money(request.estimated_total, request.currency));
    }

    lines.push("", "Reference: " + request.reference, "", "Watermelon Experiences");
    return lines.join("\n");
  }

  async function openWhatsApp(request: CRMRequest) {
    if (!supabase) return;

    const phone = (request.contact?.phone || "").replace(/[^0-9]/g, "");
    if (!phone) {
      setMessage("This contact does not have a phone / WhatsApp number.");
      return;
    }

    const preparedMessage = buildWhatsAppMessage(request);
    const now = new Date().toISOString();
    const nextStatus = request.status === "new" ? "in_review" : request.status;

    setEditing(request.id);
    setMessage("");

    const { error: updateError } = await supabase
      .from("watermelon_requests")
      .update({
        status: nextStatus,
        last_contact_at: now,
        first_response_at: request.first_response_at || now,
      })
      .eq("id", request.id);

    if (updateError) {
      setMessage(updateError.message);
      setEditing(null);
      return;
    }

    await supabase.from("watermelon_activities").insert({
      request_id: request.id,
      contact_id: request.contact?.id || null,
      activity_type: "whatsapp_prepared",
      summary: "WhatsApp opened with a prepared customer message",
      actor_email: actorEmail || null,
      metadata: {
        message: preparedMessage,
      },
    });

    window.location.href =
      "https://wa.me/" + phone + "?text=" + encodeURIComponent(preparedMessage);
  }

  const counts = useMemo(
    () => ({
      new: requests.filter((item) => item.status === "new").length,
      inReview: requests.filter((item) =>
        ["in_review", "proposal_drafting", "customer_replied"].includes(item.status)
      ).length,
      proposalSent: requests.filter((item) => item.status === "proposal_sent").length,
      awaitingPayment: requests.filter((item) => item.status === "awaiting_payment").length,
      confirmed: requests.filter((item) => item.status === "confirmed").length,
    }),
    [requests]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return requests.filter((request) => {
      const filterMatch = filter === "all" || request.status === filter;
      if (!filterMatch) return false;
      if (!q) return true;

      const haystack = [
        request.reference,
        request.contact?.name,
        request.contact?.email,
        request.contact?.phone,
        ...request.items.map((item) => item.experience_title),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [requests, filter, query]);

  if (!authReady) {
    return (
      <section className="admin-shell">
        <div className="admin-loading">Checking access…</div>
      </section>
    );
  }

  if (!supabase) {
    return (
      <section className="admin-shell">
        <div className="admin-login-card">
          <p className="eyebrow dark">PRIVATE AREA</p>
          <h1>Watermelon CRM</h1>
          <p>The private database is not connected.</p>
        </div>
      </section>
    );
  }

  if (!signedIn) {
    return (
      <section className="admin-shell">
        <form className="admin-login-card" onSubmit={signIn}>
          <p className="eyebrow dark">PRIVATE AREA</p>
          <h1>Watermelon CRM</h1>
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
    <section className="admin-shell crm-shell">
      <div className="admin-topbar">
        <div>
          <p className="eyebrow dark">WATERMELON PRIVATE AREA</p>
          <h1>CRM</h1>
          <p className="crm-topbar-copy">
            Contacts, requests and commercial follow-up in one place.
          </p>
        </div>
        <div className="admin-topbar-actions">
          <a className="button button-ghost" href="/admin/bookings">
            Bookings & payments
          </a>
          <button className="button button-ghost" type="button" onClick={() => void loadCRM()}>
            Refresh
          </button>
          <button className="button button-ghost" type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>

      <div className="crm-stats">
        <button type="button" onClick={() => setFilter("new")}>
          <span>New requests</span><strong>{counts.new}</strong>
        </button>
        <button type="button" onClick={() => setFilter("in_review")}>
          <span>In progress</span><strong>{counts.inReview}</strong>
        </button>
        <button type="button" onClick={() => setFilter("proposal_sent")}>
          <span>Proposal sent</span><strong>{counts.proposalSent}</strong>
        </button>
        <button type="button" onClick={() => setFilter("awaiting_payment")}>
          <span>Awaiting payment</span><strong>{counts.awaitingPayment}</strong>
        </button>
        <button type="button" onClick={() => setFilter("confirmed")}>
          <span>Confirmed</span><strong>{counts.confirmed}</strong>
        </button>
        <div className="crm-contact-stat">
          <span>Contacts</span><strong>{contactCount}</strong>
        </div>
      </div>

      <div className="crm-toolbar">
        <div className="admin-filters crm-filters">
          {([
            ["all", "All"],
            ["new", "New"],
            ["in_review", "In review"],
            ["proposal_drafting", "Drafting"],
            ["proposal_sent", "Proposal sent"],
            ["customer_replied", "Customer replied"],
            ["accepted", "Accepted"],
            ["awaiting_payment", "Awaiting payment"],
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
        <label className="crm-search">
          <span>Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, phone, email, reference or experience"
          />
        </label>
      </div>

      {message && <p className="admin-error">{message}</p>}
      {loading && <p className="admin-loading">Loading CRM…</p>}

      <div className="crm-request-list">
        {!loading && filtered.length === 0 && (
          <div className="admin-empty">
            <h2>No requests here.</h2>
            <p>New website enquiries will appear automatically.</p>
          </div>
        )}

        {filtered.map((request) => {
          const busy = editing === request.id;
          const first = request.items[0];

          return (
            <article className="crm-request-card" key={request.id}>
              <header className="crm-request-header">
                <div>
                  <div className="crm-request-kicker">
                    <span className="admin-reference">{request.reference}</span>
                    <span>{KIND_LABELS[request.kind]}</span>
                  </div>
                  <h2>{request.contact?.name || "Customer"}</h2>
                  <p>
                    Received {dateTime(request.created_at)}
                    {request.contact?.preferred_language
                      ? " · " + request.contact.preferred_language
                      : ""}
                  </p>
                </div>
                <span className={"crm-status crm-status-" + request.status}>
                  {STATUS_LABELS[request.status]}
                </span>
              </header>

              <div className="crm-request-body">
                <section className="crm-customer-panel">
                  <div><span>Phone / WhatsApp</span><strong>{request.contact?.phone || "—"}</strong></div>
                  <div><span>Email</span><strong>{request.contact?.email || "—"}</strong></div>
                  <div><span>Source</span><strong>{request.source}</strong></div>
                  <div><span>Estimated total</span><strong>{money(request.estimated_total, request.currency)}</strong></div>
                </section>

                <section className="crm-experience-list">
                  {request.items.map((item, index) => (
                    <div className="crm-experience-row" key={item.id}>
                      <div className="crm-experience-number">{index + 1}</div>
                      <div>
                        <strong>{item.experience_title}</strong>
                        <span>
                          {shortDate(item.requested_date)} · {item.guests} guest{item.guests === 1 ? "" : "s"}
                          {item.preferred_time ? " · " + item.preferred_time : ""}
                        </span>
                        {item.option_name && <small>{item.option_name}</small>}
                      </div>
                      <b>{money(item.subtotal, request.currency)}</b>
                    </div>
                  ))}
                </section>

                {(request.customer_notes ||
                  first?.pickup_location ||
                  first?.special_request ||
                  first?.children_ages ||
                  first?.dietary ||
                  first?.accessibility ||
                  first?.occasion) && (
                  <section className="crm-notes-panel">
                    {request.customer_notes && <p><strong>General notes:</strong> {request.customer_notes}</p>}
                    {first?.pickup_location && <p><strong>Pickup:</strong> {first.pickup_location}</p>}
                    {first?.special_request && <p><strong>Special request:</strong> {first.special_request}</p>}
                    {first?.children_ages && <p><strong>Children:</strong> {first.children_ages}</p>}
                    {first?.dietary && <p><strong>Dietary:</strong> {first.dietary}</p>}
                    {first?.accessibility && <p><strong>Accessibility:</strong> {first.accessibility}</p>}
                    {first?.occasion && <p><strong>Occasion:</strong> {first.occasion}</p>}
                  </section>
                )}

                <ProposalEditor
                  request={request}
                  onChanged={() => void loadCRM()}
                />

                {request.contact?.phone && (
                  <section className="crm-message-composer">
                    <div className="crm-message-heading">
                      <div>
                        <strong>WhatsApp message</strong>
                        <span>
                          Write only the question or observation you want to add. Watermelon automatically adds the customer, request reference and experience details.
                        </span>
                      </div>
                    </div>

                    <textarea
                      rows={3}
                      value={whatsappDrafts[request.id] || ""}
                      onChange={(event) =>
                        setWhatsappDrafts((current) => ({
                          ...current,
                          [request.id]: event.target.value,
                        }))
                      }
                      placeholder="Example: Could you please confirm your preferred date and pickup hotel?"
                    />

                    <details className="crm-message-preview">
                      <summary>Preview full WhatsApp message</summary>
                      <pre>{buildWhatsAppMessage(request)}</pre>
                    </details>

                    <button
                      className="button button-primary"
                      type="button"
                      disabled={busy}
                      onClick={() => void openWhatsApp(request)}
                    >
                      {busy ? "Preparing…" : "Prepare and open WhatsApp"}
                    </button>
                  </section>
                )}

                {request.activities.length > 0 && (
                  <details className="crm-activity">
                    <summary>Activity · {request.activities.length}</summary>
                    <div>
                      {request.activities.slice(0, 6).map((activity) => (
                        <p key={activity.id}>
                          <span>{dateTime(activity.created_at)}</span>
                          <strong>{activity.summary}</strong>
                        </p>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              <footer className="crm-request-actions">
                {request.status === "new" && (
                  <button
                    className="button button-outline"
                    type="button"
                    disabled={busy}
                    onClick={() => void changeStatus(request, "in_review")}
                  >
                    Start review
                  </button>
                )}
                {!["confirmed", "declined", "cancelled"].includes(request.status) && (
                  <button
                    className="button button-ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => void changeStatus(request, "declined")}
                  >
                    Decline
                  </button>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
