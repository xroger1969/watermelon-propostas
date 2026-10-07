"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Activity = {
  id: number;
  created_at: string;
  activity_type: string;
  summary: string;
  metadata?: Record<string, unknown> | null;
};

type EmailRequest = {
  id: string;
  reference: string;
  first_response_at: string | null;
  contact: {
    id: string;
    name: string;
    email: string | null;
  } | null;
  activities: Activity[];
};

function activityText(activity: Activity, key: string) {
  const value = activity.metadata?.[key];
  return typeof value === "string" ? value : "";
}

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function defaultReply(request: EmailRequest) {
  const name = request.contact?.name?.trim();
  return [
    name ? "Hello " + name + "," : "Hello,",
    "",
    "Thank you for your request. We are reviewing the details and will get back to you shortly.",
    "",
    "Reference: " + request.reference,
    "",
    "Kind regards,",
    "Watermelon Experiences",
  ].join("\n");
}

export default function EmailConversation({
  request,
  onChanged,
}: {
  request: EmailRequest;
  onChanged: () => void | Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const customerEmail = request.contact?.email?.trim() || "";
  const [subject, setSubject] = useState("Watermelon Experiences · " + request.reference);
  const [draft, setDraft] = useState(() => defaultReply(request));
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [statuses, setStatuses] = useState<Record<string, string>>({});

  const emailActivities = useMemo(
    () =>
      (request.activities || [])
        .filter((activity) => activity.activity_type === "email_sent")
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ),
    [request.activities]
  );

  useEffect(() => {
    setSubject("Watermelon Experiences · " + request.reference);
    setDraft(defaultReply(request));
    setFeedback("");
  }, [request.id, request.reference]);

  useEffect(() => {
    let cancelled = false;
    const ids = emailActivities
      .map((activity) => activityText(activity, "resend_email_id"))
      .filter(Boolean)
      .slice(-20);

    if (!ids.length) {
      setStatuses({});
      return;
    }

    async function refreshStatuses() {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return;

      try {
        const response = await fetch(
          "/api/crm-email?ids=" + encodeURIComponent(ids.join(",")),
          {
            headers: { Authorization: "Bearer " + accessToken },
            cache: "no-store",
          }
        );
        const data = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          statuses?: Record<string, string>;
        };
        if (!cancelled && response.ok && data.ok && data.statuses) {
          setStatuses(data.statuses);
        }
      } catch {
        // The locally stored "sent" status remains visible.
      }
    }

    void refreshStatuses();
    const timer = window.setInterval(() => void refreshStatuses(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [emailActivities, supabase]);

  async function sendEmail() {
    if (!customerEmail || !subject.trim() || !draft.trim() || sending) return;

    setSending(true);
    setFeedback("");

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setFeedback("Your private-area session has expired. Please sign in again.");
      setSending(false);
      return;
    }

    try {
      const response = await fetch("/api/crm-email", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: customerEmail,
          subject: subject.trim(),
          text: draft.trim(),
          request_id: request.id,
          reference: request.reference,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        id?: string;
        status?: string;
        error?: string;
      };

      if (!response.ok || !data.ok || !data.id) {
        throw new Error(data.error || "Email could not be sent.");
      }

      const now = new Date().toISOString();
      const { error: activityError } = await supabase
        .from("watermelon_activities")
        .insert({
          request_id: request.id,
          contact_id: request.contact?.id || null,
          activity_type: "email_sent",
          summary: "Email sent to customer",
          actor_email: sessionData.session?.user.email || null,
          metadata: {
            resend_email_id: data.id,
            to_email: customerEmail,
            subject: subject.trim(),
            text: draft.trim(),
            status: data.status || "sent",
          },
        });

      if (activityError) {
        throw new Error(
          "Email was sent, but the CRM could not save it in the activity history: " +
            activityError.message
        );
      }

      const requestUpdate: Record<string, string> = {
        last_contact_at: now,
        updated_at: now,
      };
      if (!request.first_response_at) requestUpdate.first_response_at = now;

      await supabase
        .from("watermelon_requests")
        .update(requestUpdate)
        .eq("id", request.id);

      if (request.contact?.id) {
        await supabase
          .from("watermelon_contacts")
          .update({ last_contact_at: now, updated_at: now })
          .eq("id", request.contact.id);
      }

      setStatuses((current) => ({ ...current, [data.id as string]: data.status || "sent" }));
      setDraft("");
      setFeedback("Email sent from Watermelon Experiences and saved in the CRM history.");
      await onChanged();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Email could not be sent.");
    } finally {
      setSending(false);
    }
  }

  if (!customerEmail) return null;

  return (
    <section className="crm-whatsapp-thread">
      <div className="crm-whatsapp-thread-heading">
        <div>
          <strong>Email conversation</strong>
          <span>
            Send a direct reply from Watermelon Experiences. Sent messages stay linked to this request and delivery status is checked automatically.
          </span>
        </div>
        {emailActivities.length > 0 && (
          <b>{emailActivities.length} email{emailActivities.length === 1 ? "" : "s"}</b>
        )}
      </div>

      {emailActivities.length > 0 && (
        <div className="crm-whatsapp-messages">
          {emailActivities.map((activity) => {
            const id = activityText(activity, "resend_email_id");
            const status = statuses[id] || activityText(activity, "status") || "sent";
            const emailSubject = activityText(activity, "subject");
            const text = activityText(activity, "text");

            return (
              <div className="crm-whatsapp-bubble outbound" key={activity.id}>
                {emailSubject && <strong>{emailSubject}</strong>}
                <p>{text || activity.summary}</p>
                <span>{timeLabel(activity.created_at)} · {status.replaceAll("_", " ")}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="crm-whatsapp-compose">
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="Email subject"
          style={{
            width: "100%",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: "12px 13px",
            background: "#fff",
            color: "var(--ink)",
            font: "inherit",
          }}
        />
        <textarea
          rows={5}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write your email reply to the customer…"
        />

        {feedback && (
          <p
            className={
              feedback.toLowerCase().includes("sent")
                ? "crm-proposal-feedback"
                : "admin-error"
            }
          >
            {feedback}
          </p>
        )}

        <div className="crm-whatsapp-compose-actions">
          <button
            className="button button-primary"
            type="button"
            disabled={!subject.trim() || !draft.trim() || sending}
            onClick={() => void sendEmail()}
          >
            {sending ? "Sending email…" : "Send by email"}
          </button>
          <a className="button button-outline" href={"mailto:" + customerEmail}>
            Open in Mail
          </a>
        </div>

        <p className="crm-whatsapp-window-note">
          From: Watermelon Experiences &lt;info@watermelonexperiences.pt&gt; · To: {customerEmail}
        </p>
      </div>
    </section>
  );
}
